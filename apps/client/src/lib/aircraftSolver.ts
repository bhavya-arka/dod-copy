/**
 * PACAF Airlift Demo - Aircraft Allocation Solver
 * Spec Reference: Sections 7, 8, 9
 * 
 * REFACTORED: Removed fixed station system, uses dimension-based placement
 * 
 * KEY CHANGES:
 * 1. Dimension-based placement: cargo starts at x=0, packed longitudinally
 * 2. Priority loading: weapons items loaded first
 * 3. Fill aircraft to maximum before using next
 * 4. Fixed CoB calculation to produce valid positive percentages
 */

import {
  MovementItem,
  Pallet463L,
  AircraftType,
  AircraftSpec,
  AircraftLoadPlan,
  AllocationResult,
  PalletPlacement,
  VehiclePlacement,
  CoBCalculation,
  ClassifiedItems,
  AIRCRAFT_SPECS,
  PALLET_463L,
  PAX_WEIGHT_LB,
  getEnvelopeLimitsStation,
  stationToEnvelopePercent,
  FleetAvailability,
  FleetUsage,
  AllocationShortfall,
  getAircraftLaneConfig,
  calculateLateralBounds,
  AircraftLaneConfig
} from './pacafTypes';
import { processPalletization, PalletizationResult, resetPalletCounter } from './palletizationEngine';
import { sortByLengthDescending, sortByWeightDescending } from './classificationEngine';
import { 
  createAircraftGeometry,
  PlacedCargo,
  AircraftGeometry,
  findNonOverlappingPosition,
  createBoundingBox,
  collidesWithAny,
  isWithinBounds,
  validatePlacement
} from './geometry';

// ============================================================================
// WEAPONS PRIORITY DETECTION
// ============================================================================

const WEAPONS_KEYWORDS = ['WEAPON', 'BRU', 'LOADER', 'MUNITION', 'BOMB', 'MISSILE', 'AMMO', 'ORDNANCE'];

function isWeaponsItem(description: string): boolean {
  const upperDesc = description.toUpperCase();
  return WEAPONS_KEYWORDS.some(keyword => upperDesc.includes(keyword));
}

function sortWithWeaponsPriority<T extends { description: string; weight_each_lb?: number; gross_weight?: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const aIsWeapon = isWeaponsItem(a.description || '');
    const bIsWeapon = isWeaponsItem(b.description || '');
    
    if (aIsWeapon && !bIsWeapon) return -1;
    if (!aIsWeapon && bIsWeapon) return 1;
    
    const aWeight = a.weight_each_lb || a.gross_weight || 0;
    const bWeight = b.weight_each_lb || b.gross_weight || 0;
    return bWeight - aWeight;
  });
}

function sortPalletsWithWeaponsPriority(pallets: Pallet463L[]): Pallet463L[] {
  return [...pallets].sort((a, b) => {
    const aHasWeapons = a.items.some(item => isWeaponsItem(item.description));
    const bHasWeapons = b.items.some(item => isWeaponsItem(item.description));
    
    if (aHasWeapons && !bHasWeapons) return -1;
    if (!aHasWeapons && bHasWeapons) return 1;
    
    return b.gross_weight - a.gross_weight;
  });
}

// ============================================================================
// SECTION 9: CENTER OF GRAVITY CALCULATIONS (Physics-based)
// ============================================================================

/**
 * Load item interface for CG calculations
 * Provides a standardized way to calculate CG for any cargo type
 */
export interface CGLoadItem {
  weight_lb: number;
  position_x: number;      // 0-based from cargo bay start (longitudinal)
  position_y: number;      // Lateral position from centerline (positive = right)
  length: number;          // Item length for arm calculation
  width: number;           // Item width for lateral bounds
}

/**
 * Extended CG result with lateral balance information
 * Per T.O. 1C-17A-9 and T.O. 1C-130H-9 specifications
 * 
 * NOTE: The physical cargo bay is larger than the CG envelope range.
 * For C-17: cargo bay spans 1056", but 16-40% MAC is only ~74" of CG travel.
 * Therefore, front-loaded cargo can produce negative %MAC (physically impossible to display).
 * We compute both raw (physics-accurate) and clamped (display-safe 0-100%) values.
 */
export interface CGResult {
  station_cg: number;             // CG in station inches (from aircraft datum)
  mac_percent: number;            // CG as % MAC (raw, can be negative or >100%)
  clamped_mac_percent: number;    // CG as % MAC clamped to 0-100% for display
  total_weight: number;           // Total load weight (lbs)
  total_moment: number;           // Total longitudinal moment (inch-pounds)
  lateral_cg: number;             // Lateral CG offset from centerline (inches)
  lateral_moment: number;         // Total lateral moment (inch-pounds)
  within_envelope: boolean;       // Is CG within limits?
  forward_limit_percent: number;  // Forward limit (% MAC)
  aft_limit_percent: number;      // Aft limit (% MAC)
  target_cg_percent: number;      // Target CG (% MAC) - center of envelope
  deviation_from_target: number;  // How far from target CG (% MAC)
  envelope_status: 'in_envelope' | 'forward_limit' | 'aft_limit';
  envelope_deviation: number;     // How far outside envelope (% MAC), 0 if inside
}

/**
 * Calculate target CG position for optimal balance
 * Returns the station position (inches from datum) for target CG percentage
 */
export function calculateTargetCGStation(aircraftSpec: AircraftSpec): number {
  const targetPercent = (aircraftSpec.cob_min_percent + aircraftSpec.cob_max_percent) / 2;
  return aircraftSpec.lemac_station + (targetPercent / 100) * aircraftSpec.mac_length;
}

/**
 * Convert station position to %MAC
 */
export function stationToMACPercent(stationCG: number, aircraftSpec: AircraftSpec): number {
  return ((stationCG - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100;
}

/**
 * Convert %MAC to station position  
 */
export function macPercentToStation(macPercent: number, aircraftSpec: AircraftSpec): number {
  return aircraftSpec.lemac_station + (macPercent / 100) * aircraftSpec.mac_length;
}

/**
 * Calculate Center of Gravity using physics-based moment summation
 * 
 * Physics Principles (per USAF T.O.):
 *   Moment (inch-pounds) = Weight (pounds) × Arm (inches from datum)
 *   CG (station inches) = Total Moment / Total Weight  
 *   %MAC = ((CG_Station - LEMAC) / MAC_Length) × 100
 * 
 * The solver uses 0-based coordinates (cargo bay start = 0), so we add 
 * bay_start_station to convert to aircraft station coordinates.
 * 
 * Lateral CG calculation:
 *   lateral_moment = weight × (position_y - centerline)
 *   lateral_CG = total_lateral_moment / total_weight
 *   For balanced loading, lateral_CG should be near 0.
 */
export function calculateCenterOfGravity(
  loadItems: CGLoadItem[],
  aircraftSpec: AircraftSpec
): CGResult {
  // Use cargo_bay_fs_start for FS conversion - this is the fuselage station where solver X=0 begins
  // This value is calibrated so that centered cargo gives ~28% MAC for C-17, ~25.5% MAC for C-130
  const bayStart = aircraftSpec.cargo_bay_fs_start;
  const targetCGPercent = (aircraftSpec.cob_min_percent + aircraftSpec.cob_max_percent) / 2;
  
  let totalWeight = 0;
  let totalMoment = 0;
  let totalLateralMoment = 0;

  for (const item of loadItems) {
    const weight = item.weight_lb;
    if (weight <= 0) continue;
    
    // Calculate longitudinal arm (station coordinates)
    // Arm is measured to the center of the item
    const solverArm = item.position_x + (item.length / 2);
    const stationArm = solverArm + bayStart;
    
    // Moment = Weight × Arm
    const moment = weight * stationArm;
    
    // Lateral moment (from centerline, positive = right)
    const lateralMoment = weight * item.position_y;
    
    totalWeight += weight;
    totalMoment += moment;
    totalLateralMoment += lateralMoment;
  }

  // Calculate CG station position
  const stationCG = totalWeight > 0 ? totalMoment / totalWeight : bayStart;
  
  // Calculate lateral CG (deviation from centerline)
  const lateralCG = totalWeight > 0 ? totalLateralMoment / totalWeight : 0;
  
  // Convert to %MAC (raw value - can be negative or >100%)
  const macPercent = totalWeight > 0
    ? ((stationCG - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100
    : targetCGPercent; // Empty aircraft defaults to target

  // CRITICAL FIX: Clamp %MAC to 0-100% for display purposes
  // The physical cargo bay is larger than the CG envelope, so extreme forward/aft
  // loading can produce values outside 0-100%. We clamp for display but keep raw for physics.
  const clampedMacPercent = Math.max(0, Math.min(100, macPercent));

  // Check envelope limits (using raw value for accurate physics)
  const withinEnvelope = macPercent >= aircraftSpec.cob_min_percent && 
                         macPercent <= aircraftSpec.cob_max_percent;
  
  let envelopeDeviation = 0;
  let envelopeStatus: 'in_envelope' | 'forward_limit' | 'aft_limit' = 'in_envelope';
  
  if (macPercent < aircraftSpec.cob_min_percent) {
    envelopeDeviation = aircraftSpec.cob_min_percent - macPercent;
    envelopeStatus = 'forward_limit';
  } else if (macPercent > aircraftSpec.cob_max_percent) {
    envelopeDeviation = macPercent - aircraftSpec.cob_max_percent;
    envelopeStatus = 'aft_limit';
  }

  const deviationFromTarget = Math.abs(macPercent - targetCGPercent);

  return {
    station_cg: stationCG,
    mac_percent: macPercent,
    clamped_mac_percent: clampedMacPercent,
    total_weight: totalWeight,
    total_moment: totalMoment,
    lateral_cg: lateralCG,
    lateral_moment: totalLateralMoment,
    within_envelope: withinEnvelope,
    forward_limit_percent: aircraftSpec.cob_min_percent,
    aft_limit_percent: aircraftSpec.cob_max_percent,
    target_cg_percent: targetCGPercent,
    deviation_from_target: deviationFromTarget,
    envelope_status: envelopeStatus,
    envelope_deviation: envelopeDeviation
  };
}

/**
 * Calculate Center of Balance from placements (legacy wrapper)
 * 
 * Uses the standard MAC formula:
 *   CoB% = ((Station_CG - LEMAC) / MAC_Length) * 100
 * 
 * The solver uses 0-based coordinates, so we add bay_start to convert to station coordinates.
 * - Cargo at front of bay = lower percentage (forward CG)
 * - Cargo at back of bay = higher percentage (aft CG)
 */
export function calculateCenterOfBalance(
  pallets: PalletPlacement[],
  vehicles: VehiclePlacement[],
  aircraftSpec: AircraftSpec,
  paxCount: number = 0,
  paxWeight: number = 0
): CoBCalculation {
  // Convert placements to CGLoadItems
  const loadItems: CGLoadItem[] = [];
  
  // Add pallets
  for (const p of pallets) {
    const xPosition = p.x_start_in !== undefined ? p.x_start_in : (p.position_coord - PALLET_463L.length / 2);
    const yPosition = p.lateral_placement?.y_center_in ?? 0;
    
    loadItems.push({
      weight_lb: p.pallet.gross_weight,
      position_x: xPosition,
      position_y: yPosition,
      length: PALLET_463L.length,
      width: PALLET_463L.width
    });
  }
  
  // Add vehicles/rolling stock
  for (const v of vehicles) {
    const xPosition = v.position.z - v.length / 2; // position.z is center, convert to start
    const yPosition = v.lateral_placement?.y_center_in ?? v.position.x;
    
    loadItems.push({
      weight_lb: v.weight,
      position_x: xPosition,
      position_y: yPosition,
      length: v.length,
      width: v.width
    });
  }
  
  // Add PAX weight if present
  // PAX seat position: forward troop seats are typically at ~40% of cargo bay length
  if (paxCount > 0 && paxWeight > 0) {
    const paxPosition = aircraftSpec.cargo_length * 0.4;
    loadItems.push({
      weight_lb: paxWeight,
      position_x: paxPosition,
      position_y: 0, // PAX distributed symmetrically
      length: 100,   // Approximate seating zone length
      width: 200     // Full width
    });
  }
  
  // Calculate CG using the physics-based function
  const cgResult = calculateCenterOfGravity(loadItems, aircraftSpec);
  
  // Return legacy CoBCalculation format
  // CRITICAL FIX: Use clamped_mac_percent for display (never show negative or >100%)
  return {
    total_weight: cgResult.total_weight,
    total_moment: cgResult.total_moment,
    center_of_balance: cgResult.station_cg,
    cob_percent: cgResult.clamped_mac_percent, // Use clamped value for display
    min_allowed: cgResult.forward_limit_percent,
    max_allowed: cgResult.aft_limit_percent,
    in_envelope: cgResult.within_envelope,
    envelope_status: cgResult.envelope_status,
    envelope_deviation: cgResult.envelope_deviation,
    lateral_cg: cgResult.lateral_cg
  };
}

/**
 * Calculate what the new CG would be after adding an item at a specific position
 * Used for optimal placement decisions
 */
export function calculateNewCGWithItem(
  currentCG: CGResult,
  newWeight: number,
  newPositionX: number,
  newPositionY: number,
  newLength: number,
  aircraftSpec: AircraftSpec
): { newCGPercent: number; newLateralCG: number } {
  const bayStart = aircraftSpec.cargo_bay_fs_start;
  
  // Calculate arm for new item
  const newArm = newPositionX + (newLength / 2) + bayStart;
  const newMoment = newWeight * newArm;
  const newLateralMoment = newWeight * newPositionY;
  
  // Calculate combined values
  const totalWeight = currentCG.total_weight + newWeight;
  const totalMoment = currentCG.total_moment + newMoment;
  const totalLateralMoment = (currentCG.lateral_cg * currentCG.total_weight) + newLateralMoment;
  
  // Calculate new CG
  const newStationCG = totalWeight > 0 ? totalMoment / totalWeight : bayStart;
  const newCGPercent = ((newStationCG - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100;
  const newLateralCG = totalWeight > 0 ? totalLateralMoment / totalWeight : 0;
  
  return { newCGPercent, newLateralCG };
}

/**
 * Select optimal position for an item to bring CG closest to target
 * Implements the bilateral loading algorithm per T.O. 1C-17A-9
 */
export function selectOptimalPosition(
  weight: number,
  length: number,
  currentCG: CGResult,
  targetCGPercent: number,
  availablePositions: { x: number; y: number }[],
  aircraftSpec: AircraftSpec
): { x: number; y: number; newCGPercent: number } | null {
  if (availablePositions.length === 0) return null;
  
  const candidates = availablePositions.map(pos => {
    const result = calculateNewCGWithItem(
      currentCG,
      weight,
      pos.x,
      pos.y,
      length,
      aircraftSpec
    );
    return {
      x: pos.x,
      y: pos.y,
      newCGPercent: result.newCGPercent,
      newLateralCG: result.newLateralCG,
      deviationFromTarget: Math.abs(result.newCGPercent - targetCGPercent),
      lateralDeviation: Math.abs(result.newLateralCG)
    };
  });
  
  // Sort by deviation from target CG, then by lateral balance
  candidates.sort((a, b) => {
    const cgDiff = a.deviationFromTarget - b.deviationFromTarget;
    if (Math.abs(cgDiff) > 0.1) return cgDiff;
    return a.lateralDeviation - b.lateralDeviation;
  });
  
  const best = candidates[0];
  return { x: best.x, y: best.y, newCGPercent: best.newCGPercent };
}

export function getCoBStatusMessage(cob: CoBCalculation): string {
  if (cob.in_envelope) {
    return `CoB ${cob.cob_percent.toFixed(1)}% MAC - Within envelope (${cob.min_allowed}-${cob.max_allowed}%)`;
  }
  
  const direction = cob.cob_percent < cob.min_allowed ? 'forward' : 'aft';
  const limit = cob.cob_percent < cob.min_allowed ? cob.min_allowed : cob.max_allowed;
  const deviation = Math.abs(cob.cob_percent - limit).toFixed(1);
  
  return `WARNING: CoB ${cob.cob_percent.toFixed(1)}% MAC exceeds ${direction} limit (${limit}%) by ${deviation}%`;
}

// ============================================================================
// SECTION 7: ROLLING STOCK PLACEMENT (CoB-Optimizing Algorithm)
// ============================================================================

/**
 * Score a placement position by how close it brings the CG to target
 * Lower score = better (closer to target CG)
 * 
 * This is the core function for CG-aware placement decisions.
 * It calculates what the resulting CG would be if we place an item at the given position.
 * 
 * ENHANCED: Adds heavy penalty for positions that push CG outside the envelope
 */
function scorePlacementPosition(
  xPosition: number,
  itemLength: number,
  weight: number,
  currentMoment: number,
  currentWeight: number,
  targetCGPercent: number,
  aircraftSpec: AircraftSpec
): { score: number; projectedCGPercent: number; projectedStationCG: number; envelopeStatus: string } {
  const bayStart = aircraftSpec.cargo_bay_fs_start;
  
  // Get envelope limits in station coordinates
  const { fwdLimit, aftLimit, targetStation } = getEnvelopeLimitsStation(aircraftSpec);
  
  // Calculate arm to center of item in station coordinates
  const arm = xPosition + (itemLength / 2) + bayStart;
  
  // Calculate new totals
  const newWeight = currentWeight + weight;
  const newMoment = currentMoment + (weight * arm);
  
  // Calculate new CG in station coordinates
  const newStationCG = newWeight > 0 ? newMoment / newWeight : bayStart;
  
  // Use envelope-based conversion for accurate status
  const envelopeResult = stationToEnvelopePercent(newStationCG, aircraftSpec);
  const newCGPercent = envelopeResult.macPercent; // Keep %MAC for display compatibility
  
  // ENVELOPE-BASED SCORING: Use station deviation from target, not just %MAC
  // This produces more physically accurate scores
  const stationDeviationFromTarget = Math.abs(newStationCG - targetStation);
  
  // Convert station deviation to a normalized score (per inch of deviation)
  // Normalize by usable envelope length so scores are comparable
  const envelopeLength = aftLimit - fwdLimit;
  let score = (stationDeviationFromTarget / envelopeLength) * 100;
  
  // CRITICAL: Add heavy penalty for positions outside envelope
  // Use station-based limits for accurate boundary detection
  if (newStationCG < fwdLimit) {
    // Forward of envelope - penalty based on station distance outside
    const forwardPenalty = ((fwdLimit - newStationCG) / envelopeLength) * 1000;
    score += forwardPenalty;
  } else if (newStationCG > aftLimit) {
    // Aft of envelope - penalty based on station distance outside
    const aftPenalty = ((newStationCG - aftLimit) / envelopeLength) * 1000;
    score += aftPenalty;
  }
  
  return { 
    score, 
    projectedCGPercent: newCGPercent,
    projectedStationCG: newStationCG,
    envelopeStatus: envelopeResult.status
  };
}

/**
 * Simple 0-based bounds check for the solver's coordinate system.
 * The solver uses 0-based positions (0 to cargo_length), not station-based (bay_start to bay_end).
 */
function isWithinSolverBounds(
  box: { x_start: number; x_end: number; y_left: number; y_right: number; z_top: number },
  halfWidth: number,
  maxLength: number,
  maxHeight: number
): boolean {
  if (box.x_start < 0) return false;
  if (box.x_end > maxLength) return false;
  if (box.y_left < -halfWidth) return false;
  if (box.y_right > halfWidth) return false;
  if (box.z_top > maxHeight) return false;
  return true;
}

/**
 * Find a non-overlapping position using 0-based coordinates.
 * This replaces the geometry module's findNonOverlappingPosition which uses station-based coordinates.
 */
function findSolverPosition(
  length: number,
  width: number,
  height: number,
  existingPlacements: PlacedCargo[],
  aircraftSpec: AircraftSpec,
  startX: number,
  spacing: number
): { fits: boolean; x_start: number; y_center: number; side: 'center' | 'left' | 'right' } {
  const halfItemWidth = width / 2;
  const halfAircraftWidth = aircraftSpec.cargo_width / 2;
  const maxX = aircraftSpec.cargo_length;
  const maxHeight = aircraftSpec.main_deck_height;
  
  if (halfItemWidth > halfAircraftWidth) {
    return { fits: false, x_start: startX, y_center: 0, side: 'center' };
  }
  
  const candidatePositions: number[] = [startX];
  const sortedExisting = [...existingPlacements].sort((a, b) => a.x_start_in - b.x_start_in);
  
  for (const item of sortedExisting) {
    const posAfterItem = item.x_end_in + spacing;
    if (posAfterItem >= startX && posAfterItem + length <= maxX) {
      candidatePositions.push(posAfterItem);
    }
  }
  
  for (const x of candidatePositions) {
    if (x + length > maxX) continue;
    
    const itemsInRange = sortedExisting.filter(e => 
      e.x_start_in < x + length && e.x_end_in > x
    );
    
    if (itemsInRange.length === 0) {
      const box = {
        x_start: x,
        x_end: x + length,
        y_left: -halfItemWidth,
        y_right: halfItemWidth,
        z_top: height
      };
      if (isWithinSolverBounds(box, halfAircraftWidth, maxX, maxHeight)) {
        return { fits: true, x_start: x, y_center: 0, side: 'center' };
      }
    }
    
    const centerBox = {
      x_start: x,
      x_end: x + length,
      y_left: -halfItemWidth,
      y_right: halfItemWidth,
      z_top: height
    };
    const centerCollides = itemsInRange.some(e => {
      const overlap = Math.min(e.y_right_in, centerBox.y_right) - Math.max(e.y_left_in, centerBox.y_left);
      return overlap > -spacing;
    });
    
    if (!centerCollides && isWithinSolverBounds(centerBox, halfAircraftWidth, maxX, maxHeight)) {
      return { fits: true, x_start: x, y_center: 0, side: 'center' };
    }
    
    if (itemsInRange.length > 0) {
      const leftmostItem = itemsInRange.reduce((min, item) => 
        item.y_left_in < min.y_left_in ? item : min, itemsInRange[0]);
      const leftCenter = leftmostItem.y_left_in - spacing - halfItemWidth;
      const leftBox = {
        x_start: x,
        x_end: x + length,
        y_left: leftCenter - halfItemWidth,
        y_right: leftCenter + halfItemWidth,
        z_top: height
      };
      if (isWithinSolverBounds(leftBox, halfAircraftWidth, maxX, maxHeight)) {
        return { fits: true, x_start: x, y_center: leftCenter, side: 'left' };
      }
      
      const rightmostItem = itemsInRange.reduce((max, item) => 
        item.y_right_in > max.y_right_in ? item : max, itemsInRange[0]);
      const rightCenter = rightmostItem.y_right_in + spacing + halfItemWidth;
      const rightBox = {
        x_start: x,
        x_end: x + length,
        y_left: rightCenter - halfItemWidth,
        y_right: rightCenter + halfItemWidth,
        z_top: height
      };
      if (isWithinSolverBounds(rightBox, halfAircraftWidth, maxX, maxHeight)) {
        return { fits: true, x_start: x, y_center: rightCenter, side: 'right' };
      }
    }
  }
  
  return { fits: false, x_start: startX, y_center: 0, side: 'center' };
}

/**
 * CoB-Optimizing Rolling Stock Placement Algorithm
 * 
 * This algorithm places rolling stock to achieve target Center of Balance (~28% MAC for C-17).
 * 
 * Key principles:
 * 1. Calculate target CG position (center of allowed envelope)
 * 2. Sort items by weight (heaviest first for best CG control)
 * 3. For each item, evaluate candidate positions centered around target CG
 * 4. Score positions by how close they bring overall CG to target
 * 5. Update running weight/moment after each placement
 * 
 * This ensures heavy items are placed near the target CG, and the final load
 * is balanced within the CoB envelope.
 */
interface OccupiedZone {
  x_start: number;
  x_end: number;
  y_left: number;
  y_right: number;
}

function placeRollingStock(
  items: MovementItem[],
  aircraftSpec: AircraftSpec,
  startX: number = 0,
  aircraftId: string = 'AC-1',
  occupiedZones: OccupiedZone[] = []
): { 
  placements: VehiclePlacement[]; 
  nextX: number; 
  unplaced: MovementItem[]; 
  totalLength: number;
  runningWeight: number;
  runningMoment: number;
} {
  console.log(`[PlaceRollingStock] V3-PARTITION algorithm called with ${items.length} items, ${occupiedZones.length} pallet zones to avoid`);
  
  const placements: VehiclePlacement[] = [];
  const unplaced: MovementItem[] = [];
  const existingPlacements: PlacedCargo[] = [];

  const LONGITUDINAL_SPACING = 4;
  const LATERAL_SPACING = 4;
  const maxX = aircraftSpec.cargo_length;
  const halfAircraftWidth = aircraftSpec.cargo_width / 2;
  const maxHeight = aircraftSpec.main_deck_height;
  const bayStart = aircraftSpec.cargo_bay_fs_start;

  // Calculate target CG position (center of envelope)
  const targetCGPercent = (aircraftSpec.cob_min_percent + aircraftSpec.cob_max_percent) / 2;
  const targetStationCG = aircraftSpec.lemac_station + (targetCGPercent / 100) * aircraftSpec.mac_length;
  const targetX = targetStationCG - bayStart; // Target position in solver coordinates
  
  console.log(`[PlaceRollingStock] Target CG: ${targetCGPercent.toFixed(1)}% MAC, targetX=${targetX.toFixed(0)}" (solver coords)`);

  // Track running totals for CG calculation
  let runningWeight = 0;
  let runningMoment = 0;

  // Sort by weight (heaviest first) with weapons priority
  // Heavy items have more influence on CG, so placing them optimally is most important
  const sortedItems = [...items].sort((a, b) => {
    const aIsWeapon = isWeaponsItem(a.description || '');
    const bIsWeapon = isWeaponsItem(b.description || '');
    if (aIsWeapon && !bIsWeapon) return -1;
    if (!aIsWeapon && bIsWeapon) return 1;
    return b.weight_each_lb - a.weight_each_lb;
  });

  // Helper: Check if a position collides with existing placements OR occupied pallet zones
  function checkCollision(xStart: number, xEnd: number, yCenter: number, halfWidth: number): boolean {
    const yLeft = yCenter - halfWidth;
    const yRight = yCenter + halfWidth;
    
    // Check collision with pallet-occupied zones FIRST (these are reserved for pallets)
    for (const zone of occupiedZones) {
      // Check X overlap
      if (xStart < zone.x_end && xEnd > zone.x_start) {
        // Check Y overlap
        if (yLeft < zone.y_right && yRight > zone.y_left) {
          return true; // Collision with pallet zone
        }
      }
    }
    
    // Check collision with existing rolling stock placements
    for (const existing of existingPlacements) {
      // Check X overlap
      if (xStart < existing.x_end_in && xEnd > existing.x_start_in) {
        // Check Y overlap
        if (yLeft < existing.y_right_in && yRight > existing.y_left_in) {
          return true; // Collision
        }
      }
    }
    return false;
  }

  // Helper: Find available lateral positions at a given X
  function findLateralPositions(xStart: number, xEnd: number, itemWidth: number): number[] {
    const halfWidth = itemWidth / 2;
    const candidates: number[] = [];
    
    // Get pallet zones that overlap in X range
    const palletZonesAtX = occupiedZones.filter(z =>
      z.x_start < xEnd && z.x_end > xStart
    );
    
    // Get rolling stock items that overlap in X range
    const itemsAtX = existingPlacements.filter(p => 
      p.x_start_in < xEnd && p.x_end_in > xStart
    );
    
    // Combine all occupied ranges (pallets + rolling stock)
    const allOccupiedRanges: { left: number; right: number }[] = [
      ...palletZonesAtX.map(z => ({ left: z.y_left, right: z.y_right })),
      ...itemsAtX.map(p => ({ left: p.y_left_in, right: p.y_right_in }))
    ];
    
    if (allOccupiedRanges.length === 0) {
      // No items at this X, try center first, then sides
      candidates.push(0);
      candidates.push(-halfAircraftWidth + halfWidth + LATERAL_SPACING);
      candidates.push(halfAircraftWidth - halfWidth - LATERAL_SPACING);
    } else {
      // Find gaps between occupied areas
      allOccupiedRanges.sort((a, b) => a.left - b.left);
      
      let leftEdge = -halfAircraftWidth + LATERAL_SPACING;
      for (const range of allOccupiedRanges) {
        const gapWidth = range.left - LATERAL_SPACING - leftEdge;
        if (gapWidth >= itemWidth) {
          const gapCenter = (leftEdge + range.left - LATERAL_SPACING) / 2;
          candidates.push(gapCenter);
        }
        leftEdge = Math.max(leftEdge, range.right + LATERAL_SPACING);
      }
      
      // Check gap after last item
      const rightGapWidth = halfAircraftWidth - LATERAL_SPACING - leftEdge;
      if (rightGapWidth >= itemWidth) {
        const rightGapCenter = (leftEdge + halfAircraftWidth - LATERAL_SPACING) / 2;
        candidates.push(rightGapCenter);
      }
    }
    
    // Filter to positions within aircraft bounds
    return candidates.filter(y => 
      y - halfWidth >= -halfAircraftWidth && 
      y + halfWidth <= halfAircraftWidth
    );
  }

  // Helper: Generate candidate X positions centered around target
  function generateCandidateXPositions(itemLength: number): number[] {
    const candidates: number[] = [];
    const step = 20; // 20-inch steps for granular placement
    
    // Start from target position and radiate outward
    for (let offset = 0; offset <= maxX; offset += step) {
      // Position aft of target (toward rear)
      const aftX = targetX - (itemLength / 2) + offset;
      if (aftX >= startX && aftX + itemLength <= maxX) {
        candidates.push(aftX);
      }
      
      // Position forward of target (toward front)
      if (offset > 0) {
        const fwdX = targetX - (itemLength / 2) - offset;
        if (fwdX >= startX && fwdX + itemLength <= maxX) {
          candidates.push(fwdX);
        }
      }
    }
    
    // Remove duplicates and sort by distance from target
    const unique = candidates.filter((val, idx, arr) => arr.indexOf(val) === idx);
    unique.sort((a, b) => {
      const aCenter = a + itemLength / 2;
      const bCenter = b + itemLength / 2;
      return Math.abs(aCenter - targetX) - Math.abs(bCenter - targetX);
    });
    
    return unique;
  }

  // Process each item
  for (const item of sortedItems) {
    // Validate item dimensions
    if (item.width_in > aircraftSpec.cargo_width) {
      console.log(`[PlaceRollingStock] Item ${item.description} too wide: ${item.width_in}" > ${aircraftSpec.cargo_width}"`);
      unplaced.push(item);
      continue;
    }
    if (item.height_in > maxHeight) {
      console.log(`[PlaceRollingStock] Item ${item.description} too tall: ${item.height_in}" > ${maxHeight}"`);
      unplaced.push(item);
      continue;
    }

    // Calculate current CG to determine directional preference
    const currentCGPercent = runningWeight > 0 
      ? ((runningMoment / runningWeight - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100
      : targetCGPercent;
    const isNoseHeavy = currentCGPercent < targetCGPercent;

    const halfWidth = item.width_in / 2;
    const candidateXs = generateCandidateXPositions(item.length_in);
    
    // Collect ALL valid positions with their scores
    const allCandidates: { x: number; y: number; score: number; projectedCG: number; improvesBalance: boolean }[] = [];
    
    for (const xStart of candidateXs) {
      const xEnd = xStart + item.length_in;
      const lateralPositions = findLateralPositions(xStart, xEnd, item.width_in);
      
      for (const yCenter of lateralPositions) {
        const candidateBox = {
          x_start: xStart,
          x_end: xEnd,
          y_left: yCenter - halfWidth,
          y_right: yCenter + halfWidth,
          z_top: item.height_in
        };
        
        if (!isWithinSolverBounds(candidateBox, halfAircraftWidth, maxX, maxHeight)) continue;
        if (checkCollision(xStart, xEnd, yCenter, halfWidth)) continue;
        
        const { score, projectedCGPercent } = scorePlacementPosition(
          xStart,
          item.length_in,
          item.weight_each_lb,
          runningMoment,
          runningWeight,
          targetCGPercent,
          aircraftSpec
        );
        
        // Check if this position moves CG TOWARD target (improves balance)
        const currentDeviation = Math.abs(currentCGPercent - targetCGPercent);
        const projectedDeviation = Math.abs(projectedCGPercent - targetCGPercent);
        const improvesBalance = projectedDeviation <= currentDeviation;
        
        allCandidates.push({ x: xStart, y: yCenter, score, projectedCG: projectedCGPercent, improvesBalance });
      }
    }
    
    // PARTITION: Separate improving positions from worsening ones
    const improvingCandidates = allCandidates.filter(c => c.improvesBalance);
    const worseningCandidates = allCandidates.filter(c => !c.improvesBalance);
    
    // Log all candidates for debugging
    console.log(`[PlaceRollingStock] ${item.description}: ${allCandidates.length} candidates, ${improvingCandidates.length} improving, ${worseningCandidates.length} worsening`);
    
    // Log positions that would be in envelope vs out
    const inEnvelope = worseningCandidates.filter(c => c.projectedCG >= aircraftSpec.cob_min_percent && c.projectedCG <= aircraftSpec.cob_max_percent);
    const outEnvelope = worseningCandidates.filter(c => c.projectedCG < aircraftSpec.cob_min_percent || c.projectedCG > aircraftSpec.cob_max_percent);
    console.log(`[PlaceRollingStock] In-envelope: ${inEnvelope.length}, Out-envelope: ${outEnvelope.length}`);
    if (inEnvelope.length > 0) {
      console.log(`[PlaceRollingStock] Best in-envelope: x=${inEnvelope.sort((a,b) => a.score-b.score)[0]?.x}, CG=${inEnvelope[0]?.projectedCG.toFixed(1)}%`);
    }
    if (outEnvelope.length > 0) {
      console.log(`[PlaceRollingStock] Out-envelope examples: ${outEnvelope.slice(0,3).map(c => `x=${c.x}→${c.projectedCG.toFixed(1)}%`).join(', ')}`);
    }
    
    // PREFER improving positions, fall back to least-bad worsening position
    let bestPosition: { x: number; y: number; score: number; projectedCG: number } | null = null;
    
    if (improvingCandidates.length > 0) {
      // Pick the improving position with lowest score (closest to target CG)
      improvingCandidates.sort((a, b) => a.score - b.score);
      const best = improvingCandidates[0];
      bestPosition = { x: best.x, y: best.y, score: best.score, projectedCG: best.projectedCG };
    } else if (worseningCandidates.length > 0) {
      // No improving positions - pick the one that stays closest to envelope/target
      // Sort by: 1) envelope compliance, 2) distance from target CG (NOT heuristic score)
      worseningCandidates.sort((a, b) => {
        const aInEnvelope = a.projectedCG >= aircraftSpec.cob_min_percent && a.projectedCG <= aircraftSpec.cob_max_percent;
        const bInEnvelope = b.projectedCG >= aircraftSpec.cob_min_percent && b.projectedCG <= aircraftSpec.cob_max_percent;
        if (aInEnvelope && !bInEnvelope) return -1;
        if (!aInEnvelope && bInEnvelope) return 1;
        // Both in or both out of envelope - pick the one closest to TARGET CG
        // Ignore heuristic score entirely - we want balance over "centrality"
        const aDistFromTarget = Math.abs(a.projectedCG - targetCGPercent);
        const bDistFromTarget = Math.abs(b.projectedCG - targetCGPercent);
        if (Math.abs(aDistFromTarget - bDistFromTarget) < 0.01) {
          // Tie-breaker (only when truly equal): prefer AFT (higher CG) - easier to 
          // recover from aft-heavy by placing lighter items forward
          console.log(`[PlaceRollingStock] Tie-breaker: ${a.projectedCG.toFixed(1)}% vs ${b.projectedCG.toFixed(1)}% - preferring aft`);
          return b.projectedCG - a.projectedCG; // Higher CG wins
        }
        return aDistFromTarget - bDistFromTarget;
      });
      const best = worseningCandidates[0];
      console.log(`[PlaceRollingStock] Chose worsening position: x=${best.x}, CG=${best.projectedCG.toFixed(1)}%, inEnv=${best.projectedCG >= 16 && best.projectedCG <= 40}`);
      bestPosition = { x: best.x, y: best.y, score: best.score, projectedCG: best.projectedCG };
    }
    
    // Place item at best position
    if (bestPosition !== null) {
      const xStart = bestPosition.x;
      const yCenter = bestPosition.y;
      const xEnd = xStart + item.length_in;
      
      let side: 'center' | 'left' | 'right' = 'center';
      if (yCenter < -10) side = 'left';
      else if (yCenter > 10) side = 'right';
      
      const placement: VehiclePlacement = {
        item_id: item.item_id,
        item: item,
        weight: item.weight_each_lb,
        length: item.length_in,
        width: item.width_in,
        height: item.height_in,
        axle_weights: item.axle_weights || [],
        position: { x: yCenter, y: 0, z: xStart + item.length_in / 2 },
        lateral_placement: {
          y_center_in: yCenter,
          y_left_in: yCenter - halfWidth,
          y_right_in: yCenter + halfWidth,
          side
        },
        deck: 'MAIN'
      };

      const placedCargo: PlacedCargo = {
        id: String(item.item_id),
        lead_tcn: item.lead_tcn || null,
        description: item.description,
        length_in: item.length_in,
        width_in: item.width_in,
        height_in: item.height_in,
        weight_lb: item.weight_each_lb,
        cargo_type: 'ROLLING_STOCK',
        aircraft_id: aircraftId,
        deck: 'MAIN',
        x_start_in: xStart,
        y_center_in: yCenter,
        z_floor_in: 0,
        x_end_in: xEnd,
        y_left_in: yCenter - halfWidth,
        y_right_in: yCenter + halfWidth,
        z_top_in: item.height_in,
        is_hazardous: item.hazmat_flag
      };
      
      existingPlacements.push(placedCargo);
      placements.push(placement);
      
      // Update running totals for next item's CG calculation
      const arm = xStart + (item.length_in / 2) + bayStart;
      runningMoment += item.weight_each_lb * arm;
      runningWeight += item.weight_each_lb;
      
      console.log(`[PlaceRollingStock] Placed ${item.description} at x=${xStart.toFixed(0)}", y=${yCenter.toFixed(0)}" (${side}), projectedCG=${bestPosition.projectedCG.toFixed(1)}%`);
    } else {
      unplaced.push(item);
      console.log(`[PlaceRollingStock] Could not place ${item.description}`);
    }
  }

  const maxOccupiedX = existingPlacements.length > 0
    ? Math.max(...existingPlacements.map(p => p.x_end_in))
    : startX;
  
  const totalLength = existingPlacements.reduce((sum, p) => sum + p.length_in, 0);
  
  // Calculate final CG for logging
  if (runningWeight > 0) {
    const finalStationCG = runningMoment / runningWeight;
    const finalCGPercent = ((finalStationCG - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100;
    console.log(`[PlaceRollingStock] Summary: ${placements.length} placed, ${unplaced.length} unplaced, finalCG=${finalCGPercent.toFixed(1)}% MAC, target=${targetCGPercent.toFixed(1)}% MAC`);
  } else {
    console.log(`[PlaceRollingStock] Summary: ${placements.length} placed, ${unplaced.length} unplaced, no weight`);
  }
  
  return { 
    placements, 
    nextX: maxOccupiedX, 
    unplaced, 
    totalLength,
    runningWeight,
    runningMoment
  };
}

// ============================================================================
// PALLET PLACEMENT (CoB-aware bilateral placement with lateral lanes)
// ============================================================================

/**
 * Slot definition for lateral lane placement
 * Each slot represents a unique position (longitudinal row + lateral lane)
 */
interface LateralSlot {
  rowIndex: number;        // Longitudinal row index (0-based)
  laneIndex: number;       // Lateral lane index (0 = left/-50", 1 = right/+50" for C-17)
  slotKey: string;         // Unique key: "row_lane" e.g., "0_0", "0_1", "1_0"
  x_start: number;         // Longitudinal start position
  y_center: number;        // Lateral center position from centerline
  isOnRamp: boolean;       // Whether this slot is on the ramp
}

/**
 * CoB-aware pallet placement algorithm with lateral lane support
 * 
 * Strategy per USAF T.O. 1C-17A-9:
 * 1. Receive current weight/moment state from rolling stock placement
 * 2. Calculate how to balance the load by placing pallets optimally
 * 3. Use scorePlacementPosition to find best slot for each pallet
 * 4. Heavy pallets are placed first, scored by CG deviation
 * 5. Support lateral lanes: C-17 has 2 lanes (left/right), C-130 has 1 lane (center)
 * 
 * Lateral Lane Configuration:
 * - C-17: 2 lanes at y = -50" (left) and y = +50" (right)
 * - C-130: 1 lane at y = 0" (center)
 * 
 * This allows C-17 to fit up to 36 pallets (9 longitudinal rows × 2 lateral lanes)
 * instead of the previous 18 pallets (single centerline).
 * 
 * Key insight: If rolling stock made the load nose-heavy, we need to place
 * heavy pallets more toward the aft. If tail-heavy, place forward.
 */
function placePallets(
  pallets: Pallet463L[],
  aircraftSpec: AircraftSpec,
  startX: number = 0,
  currentWeight: number = 0,
  currentMoment: number = 0
): { 
  placements: PalletPlacement[]; 
  unplaced: Pallet463L[]; 
  nextX: number;
  totalWeight: number;
  totalMoment: number;
} {
  const placements: PalletPlacement[] = [];
  const unplaced: Pallet463L[] = [];

  if (pallets.length === 0) {
    return { placements, unplaced, nextX: startX, totalWeight: currentWeight, totalMoment: currentMoment };
  }

  // Aircraft-specific pallet orientation:
  // C-17: 108" longitudinal × 88" lateral (2 lanes, standard orientation)
  // C-130: 88" longitudinal × 108" lateral (1 lane, rotated 90°)
  const isC130 = aircraftSpec.type === 'C-130';
  const PALLET_LONG = isC130 ? PALLET_463L.width : PALLET_463L.length; // Longitudinal dimension
  const PALLET_LAT = isC130 ? PALLET_463L.length : PALLET_463L.width;  // Lateral dimension
  const PALLET_HALF_LAT = PALLET_LAT / 2;
  
  // Use station-based positions from AIRCRAFT_SPECS for accurate placement
  // These are discrete positions verified per technical orders
  const stations = aircraftSpec.stations;
  const maxPositions = aircraftSpec.pallet_positions;
  const maxX = aircraftSpec.cargo_length;
  const maxPayload = aircraftSpec.max_payload;
  const bayStart = aircraftSpec.cargo_bay_fs_start;
  
  // Get lateral lane configuration for this aircraft type
  const laneConfig = getAircraftLaneConfig(aircraftSpec.type);
  const laneCount = laneConfig.lane_count;
  
  // Calculate number of rows based on pallet positions and lanes
  // C-17: 18 positions / 2 lanes = 9 rows
  // C-130: 6 positions / 1 lane = 6 rows
  const maxRows = Math.ceil(maxPositions / laneCount);
  
  // CRITICAL: Slot spacing MUST be based on actual pallet dimensions, not station data
  // 463L pallet: 108" × 88". Add 4" clearance between pallets.
  const PALLET_CLEARANCE = 4;  // 4" gap between pallets per regulations
  const PALLET_SLOT = PALLET_LONG + PALLET_CLEARANCE;  // 112" for C-17, 92" for C-130
  
  const targetCobPercent = (aircraftSpec.cob_min_percent + aircraftSpec.cob_max_percent) / 2;
  const targetStationCG = aircraftSpec.lemac_station + (targetCobPercent / 100) * aircraftSpec.mac_length;
  
  // Calculate current CG state from rolling stock
  let currentCGPercent = targetCobPercent;
  if (currentWeight > 0) {
    const currentStationCG = currentMoment / currentWeight;
    currentCGPercent = ((currentStationCG - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100;
  }
  
  console.log(`[PlacePallets] Discrete station placement: ${laneCount} lanes, ${maxRows} rows, palletSize=${PALLET_LONG}"×${PALLET_LAT}", slotSpacing=${PALLET_SLOT}", currentCG=${currentCGPercent.toFixed(1)}% MAC`);
  
  if (maxRows <= 0) {
    unplaced.push(...pallets);
    return { placements, unplaced, nextX: startX, totalWeight: currentWeight, totalMoment: currentMoment };
  }

  // Generate all available slots using discrete station positions
  // Each slot represents one pallet position (rowIndex, laneIndex)
  // Slots are spaced to prevent any overlap between adjacent pallets
  const allSlots: LateralSlot[] = [];
  
  // First pallet position starts at the forward-most station
  // Use station data for the first position, then space evenly based on pallet dimensions
  const firstRowX = stations.length > 0 
    ? Math.max(0, stations[0].rdl_distance - bayStart)
    : 0;
  
  // Total usable length including ramp area
  const totalUsableLength = maxX + aircraftSpec.ramp_length;
  const rampStartX = maxX - aircraftSpec.ramp_length;
  
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    // Calculate x position for this row based on pallet dimensions
    // This ensures pallets are spaced correctly regardless of station data
    const xStart = firstRowX + (rowIndex * PALLET_SLOT);
    const xEnd = xStart + PALLET_LONG;
    
    // Skip row if pallet would extend beyond cargo area
    if (xEnd > totalUsableLength) {
      console.log(`[PlacePallets] Row ${rowIndex} skipped: xEnd=${xEnd.toFixed(0)}" exceeds ${totalUsableLength.toFixed(0)}"`);
      continue;
    }
    
    // Determine if this row is on the ramp (for weight restrictions)
    const isOnRamp = xStart >= rampStartX;
    
    // Create a slot for each lateral lane at this row
    for (let laneIndex = 0; laneIndex < laneCount; laneIndex++) {
      const lane = laneConfig.lanes[laneIndex];
      allSlots.push({
        rowIndex,
        laneIndex,
        slotKey: `row${rowIndex}_lane${laneIndex}`,  // Unique key for tracking
        x_start: xStart,
        y_center: lane.y_center_in,
        isOnRamp
      });
    }
  }

  console.log(`[PlacePallets] Generated ${allSlots.length} slots (${maxRows} rows × ${laneCount} lanes), first at x=${firstRowX.toFixed(0)}", last at x=${allSlots.length > 0 ? allSlots[allSlots.length-1].x_start.toFixed(0) : 'N/A'}"`);
  
  // Validate no slot overlap
  const sortedByX = [...allSlots].sort((a, b) => a.x_start - b.x_start || a.laneIndex - b.laneIndex);
  for (let i = 1; i < sortedByX.length; i++) {
    const prev = sortedByX[i-1];
    const curr = sortedByX[i];
    // Only check same-lane overlap (different lanes can have same x)
    if (prev.laneIndex === curr.laneIndex) {
      const prevEnd = prev.x_start + PALLET_LONG;
      if (prevEnd > curr.x_start) {
        console.error(`[PlacePallets] OVERLAP DETECTED: ${prev.slotKey} ends at ${prevEnd.toFixed(0)}" but ${curr.slotKey} starts at ${curr.x_start.toFixed(0)}"`);
      }
    }
  }

  // Sort pallets: weapons priority, then by weight (heaviest first)
  const sortedPallets = [...pallets].sort((a, b) => {
    const aHasWeapons = a.items.some(item => isWeaponsItem(item.description));
    const bHasWeapons = b.items.some(item => isWeaponsItem(item.description));
    if (aHasWeapons && !bHasWeapons) return -1;
    if (!aHasWeapons && bHasWeapons) return 1;
    return b.gross_weight - a.gross_weight;
  });

  // Track running totals (starting from rolling stock state)
  let runningWeight = currentWeight;
  let runningMoment = currentMoment;
  let runningLateralMoment = 0; // Track lateral moment for balanced loading
  const assignedSlots: Set<string> = new Set();

  // For each pallet, find the slot that brings CG closest to target
  // Prioritize filling both lanes at a row before moving to next row for balanced lateral loading
  for (const pallet of sortedPallets) {
    if (runningWeight + pallet.gross_weight > maxPayload) {
      unplaced.push(pallet);
      continue;
    }

    let bestSlot: LateralSlot | null = null;
    let bestScore = Infinity;
    let bestProjectedCG = 0;

    // Evaluate each available slot
    for (const slot of allSlots) {
      if (assignedSlots.has(slot.slotKey)) continue;
      
      const maxPositionWeight = slot.isOnRamp 
        ? aircraftSpec.ramp_position_weight 
        : aircraftSpec.per_position_weight;

      if (pallet.gross_weight > maxPositionWeight) continue;

      // Score this slot by how close it brings CG to target
      const { score, projectedCGPercent } = scorePlacementPosition(
        slot.x_start,
        PALLET_LONG,
        pallet.gross_weight,
        runningMoment,
        runningWeight,
        targetCobPercent,
        aircraftSpec
      );
      
      // For multi-lane aircraft, add a bonus for balanced lateral loading
      // Prefer the lane that brings lateral CG closer to 0
      let lateralScore = 0;
      if (laneCount > 1) {
        const newLateralMoment = runningLateralMoment + (pallet.gross_weight * slot.y_center);
        const newLateralCG = Math.abs(newLateralMoment / (runningWeight + pallet.gross_weight));
        lateralScore = newLateralCG * 0.1; // Small weight for lateral balance
      }
      
      const totalScore = score + lateralScore;
      
      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestSlot = slot;
        bestProjectedCG = projectedCGPercent;
      }
    }

    if (bestSlot !== null) {
      assignedSlots.add(bestSlot.slotKey);
      
      // Update running totals
      const arm = bestSlot.x_start + (PALLET_LONG / 2) + bayStart;
      runningMoment += pallet.gross_weight * arm;
      runningWeight += pallet.gross_weight;
      runningLateralMoment += pallet.gross_weight * bestSlot.y_center;
      
      // Calculate lateral bounds for this lane position
      const lateralBounds = calculateLateralBounds(bestSlot.y_center, PALLET_LAT);
      
      const placement: PalletPlacement = {
        pallet: pallet,
        position_index: placements.length,
        position_coord: bestSlot.x_start + PALLET_LONG / 2,
        is_ramp: bestSlot.isOnRamp,
        lateral_placement: {
          y_center_in: bestSlot.y_center,
          y_left_in: lateralBounds.y_left_in,
          y_right_in: lateralBounds.y_right_in
        },
        x_start_in: bestSlot.x_start,
        x_end_in: bestSlot.x_start + PALLET_LONG
      };

      placements.push(placement);
      const laneName = laneConfig.lanes[bestSlot.laneIndex].name;
      console.log(`[PlacePallets] Placed ${pallet.id} (${pallet.gross_weight}lb) at row ${bestSlot.rowIndex}, ${laneName} (y=${bestSlot.y_center}"), x=${bestSlot.x_start}", projectedCG=${bestProjectedCG.toFixed(1)}%`);
    } else {
      unplaced.push(pallet);
    }
  }

  const maxOccupiedX = placements.length > 0
    ? Math.max(...placements.map(p => p.x_end_in!))
    : startX;

  // Log final CG state
  if (runningWeight > 0) {
    const finalStationCG = runningMoment / runningWeight;
    const finalCGPercent = ((finalStationCG - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100;
    const finalLateralCG = runningLateralMoment / runningWeight;
    console.log(`[PlacePallets] Result: ${placements.length} pallets placed (${laneCount} lanes), finalCG=${finalCGPercent.toFixed(1)}% MAC, lateralCG=${finalLateralCG.toFixed(1)}", target=${targetCobPercent.toFixed(1)}% MAC`);
  }

  return { 
    placements, 
    unplaced, 
    nextX: maxOccupiedX + 4, // 4" spacing between cargo sections
    totalWeight: runningWeight,
    totalMoment: runningMoment
  };
}

// ============================================================================
// SECTION 8: AIRCRAFT ALLOCATION SOLVER
// ============================================================================

interface AllocationQueue {
  rolling_stock: MovementItem[];
  pallets: Pallet463L[];
  pax_items: MovementItem[];
  phase: 'ADVON' | 'MAIN';
}

export interface SolverInput {
  rolling_stock: MovementItem[];
  prebuilt_pallets: MovementItem[];
  loose_items: MovementItem[];
  pax_items: MovementItem[];
  phase: 'ADVON' | 'MAIN';
}

function loadSingleAircraftFromQueue(
  queue: AllocationQueue,
  aircraftType: AircraftType,
  sequence: number
): {
  loadPlan: AircraftLoadPlan;
  remaining: AllocationQueue;
  itemsLoaded: number;
  unloadedPax: number;
} {
  const spec = AIRCRAFT_SPECS[aircraftType];
  const aircraftId = `${aircraftType}-${queue.phase}-${sequence}`;
  
  // CRITICAL FIX: Place pallets FIRST, then rolling stock in remaining space
  // Per DOD cargo loading standards, pallets occupy discrete station positions
  // and rolling stock CANNOT overlap with pallet positions.
  
  // Step 1: Place pallets first (they occupy discrete 463L rail positions)
  const palletResult = placePallets(
    queue.pallets, 
    spec, 
    0,  // Start from position 0
    0,  // No prior weight
    0   // No prior moment
  );
  
  // Step 2: Extract occupied zones from pallet placements
  // These zones are now RESERVED and cannot be used by rolling stock
  const isC130 = spec.type === 'C-130';
  const PALLET_LONG = isC130 ? PALLET_463L.width : PALLET_463L.length;
  const PALLET_LAT = isC130 ? PALLET_463L.length : PALLET_463L.width;
  const PALLET_HALF_LAT = PALLET_LAT / 2;
  
  const palletOccupiedZones: OccupiedZone[] = palletResult.placements.map(p => {
    const yCenter = p.lateral_placement?.y_center_in ?? 0;
    return {
      x_start: p.x_start_in ?? 0,
      x_end: (p.x_start_in ?? 0) + PALLET_LONG,
      y_left: yCenter - PALLET_HALF_LAT,
      y_right: yCenter + PALLET_HALF_LAT
    };
  });
  
  console.log(`[LoadAircraft] ${aircraftId}: ${palletResult.placements.length} pallets placed, ${palletOccupiedZones.length} zones reserved`);
  
  // Step 3: Place rolling stock, excluding pallet-occupied zones
  // Pass pallet weight/moment for CoB calculations
  const rsResult = placeRollingStock(
    queue.rolling_stock, 
    spec, 
    0, 
    aircraftId,
    palletOccupiedZones  // Pass occupied zones to prevent overlap
  );
  
  const finalPalletWeight = palletResult.placements.reduce((sum, p) => sum + p.pallet.gross_weight, 0);
  const finalRsWeight = rsResult.placements.reduce((sum, v) => sum + v.weight, 0);
  const cargoWeight = finalRsWeight + finalPalletWeight;
  
  const requestedPaxCount = queue.pax_items.reduce((sum, p) => sum + (p.pax_count || 1), 0);
  
  const seatCapacity = spec.seat_capacity;
  const remainingPayloadCapacity = spec.max_payload - cargoWeight;
  const maxPaxByWeight = Math.floor(remainingPayloadCapacity / PAX_WEIGHT_LB);
  const maxPaxAllowed = Math.min(seatCapacity, maxPaxByWeight);
  
  const actualPaxCount = Math.min(requestedPaxCount, maxPaxAllowed);
  const unloadedPax = requestedPaxCount - actualPaxCount;
  
  const paxWeight = actualPaxCount * PAX_WEIGHT_LB;
  const finalTotalWeight = cargoWeight + paxWeight;
  
  const cob = calculateCenterOfBalance(palletResult.placements, rsResult.placements, spec, actualPaxCount, paxWeight);
  
  const totalPositionsUsed = rsResult.placements.length + palletResult.placements.length;
  const maxUsableLength = spec.cargo_length;
  const usedLength = palletResult.nextX > 0 ? palletResult.nextX : rsResult.nextX;
  const utilizationPercent = (usedLength / maxUsableLength) * 100;
  
  const seatUtilizationPercent = seatCapacity > 0 ? (actualPaxCount / seatCapacity) * 100 : 0;
  
  const loadPlan: AircraftLoadPlan = {
    aircraft_id: aircraftId,
    aircraft_type: aircraftType,
    aircraft_spec: spec,
    sequence: sequence,
    phase: queue.phase,
    pallets: palletResult.placements,
    rolling_stock: rsResult.placements,
    pax_count: actualPaxCount,
    total_weight: finalTotalWeight,
    payload_used_percent: (finalTotalWeight / spec.max_payload) * 100,
    pax_weight: paxWeight,
    center_of_balance: cob.center_of_balance,
    cob_percent: cob.cob_percent,
    cob_in_envelope: cob.in_envelope,
    positions_used: totalPositionsUsed,
    positions_available: spec.pallet_positions,
    utilization_percent: utilizationPercent,
    seat_capacity: seatCapacity,
    seats_used: actualPaxCount,
    seat_utilization_percent: seatUtilizationPercent
  };
  
  const itemsLoaded = rsResult.placements.length + palletResult.placements.length + (actualPaxCount > 0 ? 1 : 0);
  
  const remaining: AllocationQueue = {
    rolling_stock: rsResult.unplaced,
    pallets: palletResult.unplaced,
    pax_items: [],
    phase: queue.phase
  };
  
  return { loadPlan, remaining, itemsLoaded, unloadedPax };
}

// ============================================================================
// SECTION 8.1: MINIMUM AIRCRAFT CALCULATION
// ============================================================================

export function calculateMinimumAircraft(
  totalPallets: number,
  totalWeight: number,
  aircraftType: AircraftType
): { byPallets: number; byWeight: number; minimum: number } {
  const spec = AIRCRAFT_SPECS[aircraftType];
  
  const palletsPerAircraft = Math.floor(spec.cargo_length / (PALLET_463L.length + 4));
  
  const byPallets = Math.ceil(totalPallets / palletsPerAircraft);
  const byWeight = Math.ceil(totalWeight / spec.max_payload);
  
  return {
    byPallets,
    byWeight,
    minimum: Math.max(byPallets, byWeight)
  };
}

// ============================================================================
// MAIN SOLVER FUNCTION
// ============================================================================

function prepareAllocationQueue(input: SolverInput): {
  queue: AllocationQueue;
  warnings: string[];
  unpalletizable: MovementItem[];
} {
  const palletResult = processPalletization(
    input.prebuilt_pallets,
    input.loose_items
  );
  
  const sortedRollingStock = sortWithWeaponsPriority(input.rolling_stock);
  
  return {
    queue: {
      rolling_stock: sortedRollingStock,
      pallets: palletResult.pallets,
      pax_items: [...input.pax_items],
      phase: input.phase
    },
    warnings: palletResult.warnings,
    unpalletizable: palletResult.unpalletizable_items
  };
}

function hasCargoInQueue(queue: AllocationQueue): boolean {
  return (
    queue.rolling_stock.length > 0 ||
    queue.pallets.length > 0 ||
    queue.pax_items.length > 0
  );
}

/**
 * Get available aircraft types from fleet availability, sorted by priority
 * Priority: 1) Preferred type first (if available), 2) Then by max payload (largest first)
 */
function getAvailableFleetTypes(
  fleetAvailability: FleetAvailability
): { typeId: string; aircraftType: AircraftType; available: number; spec: AircraftSpec }[] {
  const available = fleetAvailability.types
    .filter(t => t.count > 0 && !t.locked)
    .map(t => {
      const aircraftType = t.typeId === 'C17' ? 'C-17' : 'C-130' as AircraftType;
      const spec = AIRCRAFT_SPECS[aircraftType];
      return {
        typeId: t.typeId,
        aircraftType,
        available: t.count,
        spec
      };
    });

  // Sort by priority: preferred first, then by max payload
  available.sort((a, b) => {
    const aIsPreferred = fleetAvailability.preferredType === a.typeId;
    const bIsPreferred = fleetAvailability.preferredType === b.typeId;
    
    if (aIsPreferred && !bIsPreferred) return -1;
    if (!aIsPreferred && bIsPreferred) return 1;
    
    // Otherwise sort by max payload (largest first)
    return b.spec.max_payload - a.spec.max_payload;
  });

  return available;
}

export function solveAircraftAllocation(
  classifiedItems: ClassifiedItems,
  fleetAvailability: FleetAvailability
): AllocationResult {
  const warnings: string[] = [];
  const loadPlans: AircraftLoadPlan[] = [];
  const unloadedItems: MovementItem[] = [];
  
  resetPalletCounter();
  
  // Get available fleet types sorted by priority
  const availableTypes = getAvailableFleetTypes(fleetAvailability);
  
  // Track usage per type
  const fleetUsage: Map<string, { available: number; used: number }> = new Map();
  for (const t of fleetAvailability.types) {
    fleetUsage.set(t.typeId, { available: t.count, used: 0 });
  }
  
  // Determine primary aircraft type for result (first available or C-17 as default)
  const primaryType: AircraftType = availableTypes.length > 0 
    ? availableTypes[0].aircraftType 
    : 'C-17';
  
  // Debug logging
  console.log('[AircraftSolver] Starting fleet-aware allocation:', {
    availableTypes: availableTypes.map(t => ({ type: t.aircraftType, available: t.available })),
    preferredType: fleetAvailability.preferredType,
    totalRollingStock: classifiedItems.rolling_stock.length,
    totalPrebuiltPallets: classifiedItems.prebuilt_pallets.length,
    totalLooseItems: classifiedItems.loose_items.length,
    totalPaxItems: classifiedItems.pax_items.length
  });
  
  // If no aircraft available, return empty result
  if (availableTypes.length === 0) {
    unloadedItems.push(...classifiedItems.rolling_stock);
    unloadedItems.push(...classifiedItems.prebuilt_pallets);
    unloadedItems.push(...classifiedItems.loose_items);
    
    const totalUnloadedPax = classifiedItems.pax_items.reduce((sum, p) => sum + (p.pax_count || 1), 0);
    const totalUnloadedWeight = unloadedItems.reduce((sum, i) => sum + i.weight_each_lb, 0);
    
    return {
      aircraft_type: 'C-17',
      total_aircraft: 0,
      advon_aircraft: 0,
      main_aircraft: 0,
      load_plans: [],
      total_weight: 0,
      total_pallets: 0,
      total_rolling_stock: 0,
      total_pax: 0,
      total_pax_weight: 0,
      total_seat_capacity: 0,
      total_seats_used: 0,
      overall_seat_utilization: 0,
      unloaded_items: unloadedItems,
      unloaded_pax: totalUnloadedPax,
      warnings: ['No aircraft available in fleet'],
      feasible: false,
      fleetUsage: Array.from(fleetUsage.entries()).map(([typeId, usage]) => ({
        typeId,
        available: usage.available,
        used: usage.used
      })),
      shortfall: {
        unloadedWeight: totalUnloadedWeight,
        unloadedPallets: classifiedItems.prebuilt_pallets.length,
        unloadedRollingStock: classifiedItems.rolling_stock.length,
        unloadedPax: totalUnloadedPax,
        reason: 'No aircraft available in fleet'
      }
    };
  }
  
  const advonIds = new Set(classifiedItems.advon_items.map(i => i.item_id));
  
  const advonPaxItems = classifiedItems.pax_items.filter(i => advonIds.has(i.item_id));
  const mainPaxItems = classifiedItems.pax_items.filter(i => !advonIds.has(i.item_id));
  
  // Debug PAX allocation to trace doubling
  const advonPaxTotal = advonPaxItems.reduce((sum, p) => sum + (p.pax_count || 1), 0);
  const mainPaxTotal = mainPaxItems.reduce((sum, p) => sum + (p.pax_count || 1), 0);
  console.log('[AircraftSolver] PAX split:', {
    advonPaxItems: advonPaxItems.length,
    advonPaxTotal,
    mainPaxItems: mainPaxItems.length,
    mainPaxTotal,
    totalPaxItems: classifiedItems.pax_items.length
  });
  
  const advonInput: SolverInput = {
    rolling_stock: classifiedItems.rolling_stock.filter(i => advonIds.has(i.item_id)),
    prebuilt_pallets: classifiedItems.prebuilt_pallets.filter(i => advonIds.has(i.item_id)),
    loose_items: classifiedItems.loose_items.filter(i => advonIds.has(i.item_id)),
    pax_items: advonPaxItems,
    phase: 'ADVON'
  };
  
  const mainInput: SolverInput = {
    rolling_stock: classifiedItems.rolling_stock.filter(i => !advonIds.has(i.item_id)),
    prebuilt_pallets: classifiedItems.prebuilt_pallets.filter(i => !advonIds.has(i.item_id)),
    loose_items: classifiedItems.loose_items.filter(i => !advonIds.has(i.item_id)),
    pax_items: mainPaxItems,
    phase: 'MAIN'
  };
  
  const advonPrep = prepareAllocationQueue(advonInput);
  const mainPrep = prepareAllocationQueue(mainInput);
  
  warnings.push(...advonPrep.warnings);
  warnings.push(...mainPrep.warnings);
  unloadedItems.push(...advonPrep.unpalletizable);
  unloadedItems.push(...mainPrep.unpalletizable);
  
  let advonQueue = advonPrep.queue;
  let advonSequence = 1;
  const MAX_AIRCRAFT = 50;
  
  let totalUnloadedPax = 0;
  let currentTypeIndex = 0;
  
  // Helper to get next available aircraft
  const getNextAircraft = (): { type: AircraftType; typeId: string } | null => {
    while (currentTypeIndex < availableTypes.length) {
      const typeInfo = availableTypes[currentTypeIndex];
      const usage = fleetUsage.get(typeInfo.typeId)!;
      if (usage.used < usage.available) {
        return { type: typeInfo.aircraftType, typeId: typeInfo.typeId };
      }
      currentTypeIndex++;
    }
    return null;
  };
  
  // Process ADVON queue
  while (hasCargoInQueue(advonQueue)) {
    const aircraft = getNextAircraft();
    if (!aircraft) {
      // No more aircraft available
      for (const pallet of advonQueue.pallets) {
        unloadedItems.push(...pallet.items);
      }
      unloadedItems.push(...advonQueue.rolling_stock);
      warnings.push(`ADVON: Fleet exhausted - ${advonQueue.pallets.length} pallets and ${advonQueue.rolling_stock.length} vehicles could not be loaded`);
      break;
    }
    
    const result = loadSingleAircraftFromQueue(advonQueue, aircraft.type, advonSequence);
    
    if (result.itemsLoaded === 0) {
      // This aircraft type can't fit remaining cargo, try next type
      const usage = fleetUsage.get(aircraft.typeId)!;
      usage.used = usage.available; // Mark this type as exhausted for this cargo
      currentTypeIndex++;
      continue;
    }
    
    // Update fleet usage
    const usage = fleetUsage.get(aircraft.typeId)!;
    usage.used++;
    
    loadPlans.push(result.loadPlan);
    totalUnloadedPax += result.unloadedPax;
    advonQueue = result.remaining;
    advonSequence++;
    
    if (advonSequence > MAX_AIRCRAFT) {
      warnings.push(`ADVON loading capped at ${MAX_AIRCRAFT} aircraft`);
      break;
    }
  }
  
  // Reset type index for MAIN phase
  currentTypeIndex = 0;
  let mainQueue = mainPrep.queue;
  let mainSequence = 1;
  
  while (hasCargoInQueue(mainQueue)) {
    const aircraft = getNextAircraft();
    if (!aircraft) {
      // No more aircraft available
      for (const pallet of mainQueue.pallets) {
        unloadedItems.push(...pallet.items);
      }
      unloadedItems.push(...mainQueue.rolling_stock);
      warnings.push(`MAIN: Fleet exhausted - ${mainQueue.pallets.length} pallets and ${mainQueue.rolling_stock.length} vehicles could not be loaded`);
      break;
    }
    
    const result = loadSingleAircraftFromQueue(mainQueue, aircraft.type, mainSequence);
    
    if (result.itemsLoaded === 0) {
      // This aircraft type can't fit remaining cargo, try next type
      const usage = fleetUsage.get(aircraft.typeId)!;
      usage.used = usage.available; // Mark this type as exhausted for this cargo
      currentTypeIndex++;
      continue;
    }
    
    // Update fleet usage
    const usage = fleetUsage.get(aircraft.typeId)!;
    usage.used++;
    
    loadPlans.push(result.loadPlan);
    totalUnloadedPax += result.unloadedPax;
    mainQueue = result.remaining;
    mainSequence++;
    
    if (mainSequence > MAX_AIRCRAFT) {
      warnings.push(`MAIN loading capped at ${MAX_AIRCRAFT} aircraft`);
      break;
    }
  }
  
  const advonPlans = loadPlans.filter(p => p.phase === 'ADVON');
  const mainPlans = loadPlans.filter(p => p.phase === 'MAIN');
  
  const totalWeight = loadPlans.reduce((sum, p) => sum + p.total_weight, 0);
  const totalPallets = loadPlans.reduce((sum, p) => sum + p.pallets.length, 0);
  const totalRollingStock = loadPlans.reduce((sum, p) => sum + p.rolling_stock.length, 0);
  const totalPax = loadPlans.reduce((sum, p) => sum + p.pax_count, 0);
  const totalPaxWeight = loadPlans.reduce((sum, p) => sum + p.pax_weight, 0);
  
  const totalSeatCapacity = loadPlans.reduce((sum, p) => sum + p.seat_capacity, 0);
  const totalSeatsUsed = loadPlans.reduce((sum, p) => sum + p.seats_used, 0);
  const overallSeatUtilization = totalSeatCapacity > 0 ? (totalSeatsUsed / totalSeatCapacity) * 100 : 0;
  
  // Calculate feasibility
  const feasible = unloadedItems.length === 0 && totalUnloadedPax === 0;
  
  if (unloadedItems.length > 0) {
    warnings.push(`${unloadedItems.length} items could not be loaded`);
  }
  
  if (totalUnloadedPax > 0) {
    warnings.push(`${totalUnloadedPax} PAX could not be loaded due to seat/weight constraints`);
  }
  
  // Build fleet usage array
  const fleetUsageArray: FleetUsage[] = Array.from(fleetUsage.entries()).map(([typeId, usage]) => ({
    typeId,
    available: usage.available,
    used: usage.used
  }));
  
  // Build shortfall if not feasible
  let shortfall: AllocationShortfall | undefined;
  if (!feasible) {
    const unloadedWeight = unloadedItems.reduce((sum, i) => sum + i.weight_each_lb, 0);
    shortfall = {
      unloadedWeight,
      unloadedPallets: unloadedItems.filter(i => i.type === 'PREBUILT_PALLET' || i.type === 'PALLETIZABLE').length,
      unloadedRollingStock: unloadedItems.filter(i => i.type === 'ROLLING_STOCK').length,
      unloadedPax: totalUnloadedPax,
      reason: `Fleet capacity insufficient: ${unloadedItems.length} items and ${totalUnloadedPax} PAX could not be loaded`
    };
  }
  
  return {
    aircraft_type: primaryType,
    total_aircraft: loadPlans.length,
    advon_aircraft: advonPlans.length,
    main_aircraft: mainPlans.length,
    load_plans: loadPlans,
    total_weight: totalWeight,
    total_pallets: totalPallets,
    total_rolling_stock: totalRollingStock,
    total_pax: totalPax,
    total_pax_weight: totalPaxWeight,
    total_seat_capacity: totalSeatCapacity,
    total_seats_used: totalSeatsUsed,
    overall_seat_utilization: overallSeatUtilization,
    unloaded_items: unloadedItems,
    unloaded_pax: totalUnloadedPax,
    warnings,
    feasible,
    fleetUsage: fleetUsageArray,
    shortfall
  };
}

// ============================================================================
// QUICK ESTIMATE (For urgent brief mode)
// ============================================================================

export function quickEstimateAircraft(
  totalWeight: number,
  palletCount: number,
  rollingStockCount: number,
  aircraftType: AircraftType
): {
  estimated_aircraft: number;
  weight_limited: boolean;
  position_limited: boolean;
  confidence: 'high' | 'medium' | 'low';
} {
  const spec = AIRCRAFT_SPECS[aircraftType];
  
  const palletsPerAircraft = Math.floor(spec.cargo_length / (PALLET_463L.length + 4));
  const rsLengthEstimate = rollingStockCount * 200;
  const rsPositionsUsed = Math.ceil(rsLengthEstimate / PALLET_463L.length);
  const totalPositionsNeeded = palletCount + rsPositionsUsed;
  
  const byPositions = Math.ceil(totalPositionsNeeded / palletsPerAircraft);
  const byWeight = Math.ceil(totalWeight / spec.max_payload);
  
  const estimated = Math.max(byPositions, byWeight);
  
  return {
    estimated_aircraft: estimated,
    weight_limited: byWeight >= byPositions,
    position_limited: byPositions > byWeight,
    confidence: rollingStockCount > 0 ? 'medium' : 'high'
  };
}

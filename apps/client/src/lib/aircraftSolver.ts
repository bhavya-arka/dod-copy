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
  PAX_WEIGHT_LB
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
// SECTION 7: ROLLING STOCK PLACEMENT (Dimension-based)
// ============================================================================

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
 * Lane-based lateral placement for rolling stock
 * Places items side-by-side when possible, only advancing X when lateral space is exhausted
 * 
 * Algorithm:
 * 1. Group items by similar length for efficient row packing
 * 2. For each X position, try to fit items laterally (center, then left, then right)
 * 3. Only advance X when no more items fit at current position
 */
function placeRollingStock(
  items: MovementItem[],
  aircraftSpec: AircraftSpec,
  startX: number = 0,
  aircraftId: string = 'AC-1'
): { placements: VehiclePlacement[]; nextX: number; unplaced: MovementItem[]; totalLength: number } {
  console.log('[PlaceRollingStock] Called with', items.length, 'items:', items.map(i => ({
    id: i.item_id,
    desc: i.description,
    type: i.type,
    dims: `${i.length_in}L x ${i.width_in}W x ${i.height_in}H`
  })));
  
  const placements: VehiclePlacement[] = [];
  const unplaced: MovementItem[] = [];
  const existingPlacements: PlacedCargo[] = [];

  const sortedItems = sortWithWeaponsPriority(items);
  const LONGITUDINAL_SPACING = 4;
  const LATERAL_SPACING = 4;
  const maxX = aircraftSpec.cargo_length;
  const halfAircraftWidth = aircraftSpec.cargo_width / 2;
  const maxHeight = aircraftSpec.main_deck_height;

  const itemsToPlace = [...sortedItems];

  function tryPlaceItem(item: MovementItem, xStart: number, yCenter: number): boolean {
    const halfWidth = item.width_in / 2;
    const xEnd = xStart + item.length_in;
    
    const candidateBox = {
      x_start: xStart,
      x_end: xEnd,
      y_left: yCenter - halfWidth,
      y_right: yCenter + halfWidth,
      z_top: item.height_in
    };
    
    if (!isWithinSolverBounds(candidateBox, halfAircraftWidth, maxX, maxHeight)) {
      return false;
    }
    
    if (collidesWithAny(createBoundingBox(xStart, item.length_in, yCenter, item.width_in, 0, item.height_in), existingPlacements)) {
      return false;
    }
    
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
    console.log(`[PlaceRollingStock] Placed ${item.description} at x=${xStart}, y=${yCenter} (${side})`);
    return true;
  }

  function findLateralPositions(xStart: number, itemWidth: number): number[] {
    const halfWidth = itemWidth / 2;
    const candidates: number[] = [];
    
    const itemsAtX = existingPlacements.filter(p => 
      p.x_start_in < xStart + 200 && p.x_end_in > xStart
    );
    
    if (itemsAtX.length === 0) {
      candidates.push(0);
      candidates.push(-halfAircraftWidth + halfWidth + LATERAL_SPACING);
      candidates.push(halfAircraftWidth - halfWidth - LATERAL_SPACING);
    } else {
      const occupiedRanges = itemsAtX.map(p => ({ left: p.y_left_in, right: p.y_right_in }));
      occupiedRanges.sort((a, b) => a.left - b.left);
      
      let leftEdge = -halfAircraftWidth + LATERAL_SPACING;
      for (const range of occupiedRanges) {
        const gapCenter = (leftEdge + range.left - LATERAL_SPACING) / 2;
        const gapWidth = range.left - LATERAL_SPACING - leftEdge;
        if (gapWidth >= itemWidth) {
          candidates.push(gapCenter);
        }
        leftEdge = range.right + LATERAL_SPACING;
      }
      
      const rightGapCenter = (leftEdge + halfAircraftWidth - LATERAL_SPACING) / 2;
      const rightGapWidth = halfAircraftWidth - LATERAL_SPACING - leftEdge;
      if (rightGapWidth >= itemWidth) {
        candidates.push(rightGapCenter);
      }
    }
    
    return candidates.filter(y => 
      y - halfWidth >= -halfAircraftWidth && 
      y + halfWidth <= halfAircraftWidth
    );
  }

  let currentX = startX;
  
  while (itemsToPlace.length > 0 && currentX < maxX) {
    let placedAnyAtCurrentX = false;
    
    for (let i = 0; i < itemsToPlace.length; i++) {
      const item = itemsToPlace[i];
      
      if (item.width_in > aircraftSpec.cargo_width) {
        console.log(`[PlaceRollingStock] Item ${item.description} too wide for cargo bay: ${item.width_in} > ${aircraftSpec.cargo_width}`);
        unplaced.push(item);
        itemsToPlace.splice(i, 1);
        i--;
        continue;
      }

      if (item.height_in > aircraftSpec.main_deck_height) {
        console.log(`[PlaceRollingStock] Item ${item.description} too tall for main deck: ${item.height_in} > ${aircraftSpec.main_deck_height}`);
        unplaced.push(item);
        itemsToPlace.splice(i, 1);
        i--;
        continue;
      }

      if (currentX + item.length_in > maxX) {
        continue;
      }

      const lateralPositions = findLateralPositions(currentX, item.width_in);
      
      for (const yPos of lateralPositions) {
        if (tryPlaceItem(item, currentX, yPos)) {
          itemsToPlace.splice(i, 1);
          i--;
          placedAnyAtCurrentX = true;
          break;
        }
      }
    }
    
    if (!placedAnyAtCurrentX) {
      const maxOccupiedAtCurrentX = existingPlacements
        .filter(p => p.x_start_in >= currentX - LONGITUDINAL_SPACING)
        .reduce((max, p) => Math.max(max, p.x_end_in), currentX);
      
      const newX = maxOccupiedAtCurrentX + LONGITUDINAL_SPACING;
      if (newX <= currentX) {
        currentX += 50;
      } else {
        currentX = newX;
      }
    }
  }
  
  for (const item of itemsToPlace) {
    unplaced.push(item);
    console.log(`[PlaceRollingStock] Could not place ${item.description}`);
  }

  const maxOccupiedX = existingPlacements.length > 0
    ? Math.max(...existingPlacements.map(p => p.x_end_in))
    : startX;
  
  const totalLength = existingPlacements.reduce((sum, p) => sum + p.length_in, 0);
  
  console.log(`[PlaceRollingStock] Summary: ${placements.length} placed, ${unplaced.length} unplaced, maxX=${maxOccupiedX}`);
  
  return { placements, nextX: maxOccupiedX, unplaced, totalLength };
}

// ============================================================================
// PALLET PLACEMENT (CoB-aware bilateral placement)
// ============================================================================

/**
 * CoB-aware pallet placement algorithm
 * 
 * Strategy per USAF T.O. 1C-17A-9:
 * 1. Calculate target CG position for middle of CoB envelope
 * 2. Sort pallets by weight (heaviest first)
 * 3. Place pallets bilaterally from target CG - heavy pallets near center
 * 4. Alternate fore/aft placement to maintain balance
 * 
 * This ensures the weighted average position of pallets falls within the CoB envelope.
 */
function placePallets(
  pallets: Pallet463L[],
  aircraftSpec: AircraftSpec,
  startX: number = 0,
  currentWeight: number = 0
): { 
  placements: PalletPlacement[]; 
  unplaced: Pallet463L[]; 
  nextX: number;
  totalWeight: number;
} {
  const placements: PalletPlacement[] = [];
  const unplaced: Pallet463L[] = [];

  if (pallets.length === 0) {
    return { placements, unplaced, nextX: startX, totalWeight: currentWeight };
  }

  const PALLET_LENGTH = PALLET_463L.length;
  const PALLET_WIDTH = PALLET_463L.width;
  const PALLET_HALF_WIDTH = PALLET_WIDTH / 2;
  const SPACING = 4;
  const PALLET_SLOT = PALLET_LENGTH + SPACING;

  const maxX = aircraftSpec.cargo_length;
  const maxPayload = aircraftSpec.max_payload;
  const bayStart = aircraftSpec.cargo_bay_fs_start;
  
  const targetCobPercent = (aircraftSpec.cob_min_percent + aircraftSpec.cob_max_percent) / 2;
  const targetStationCG = aircraftSpec.lemac_station + (targetCobPercent / 100) * aircraftSpec.mac_length;
  const targetSolverCG = targetStationCG - bayStart;
  
  console.log(`[PlacePallets] CoB-aware placement: target=${targetCobPercent.toFixed(1)}% MAC, targetCG=${targetSolverCG.toFixed(0)}" (solver coords)`);

  const usableLength = maxX - startX;
  const maxSlots = Math.floor(usableLength / PALLET_SLOT);
  
  if (maxSlots <= 0) {
    unplaced.push(...pallets);
    return { placements, unplaced, nextX: startX, totalWeight: currentWeight };
  }

  const slotPositions: number[] = [];
  for (let i = 0; i < maxSlots; i++) {
    slotPositions.push(startX + i * PALLET_SLOT);
  }

  const sortedPallets = [...pallets].sort((a, b) => {
    const aHasWeapons = a.items.some(item => isWeaponsItem(item.description));
    const bHasWeapons = b.items.some(item => isWeaponsItem(item.description));
    if (aHasWeapons && !bHasWeapons) return -1;
    if (!aHasWeapons && bHasWeapons) return 1;
    return b.gross_weight - a.gross_weight;
  });

  // Calculate center slot - use target CG if available, otherwise center of available space
  // This handles cases where rolling stock takes up the front of the cargo bay
  let centerSlotIndex: number;
  if (targetSolverCG >= startX && targetSolverCG <= maxX) {
    // Target CG is within available space - use it
    centerSlotIndex = Math.floor((targetSolverCG - startX) / PALLET_SLOT);
  } else {
    // Target CG is outside available space - center in available slots
    centerSlotIndex = Math.floor(maxSlots / 2);
  }
  const validCenterIndex = Math.max(0, Math.min(maxSlots - 1, centerSlotIndex));
  
  console.log(`[PlacePallets] Center slot index: ${validCenterIndex} of ${maxSlots} slots (startX=${startX}, targetCG=${targetSolverCG.toFixed(0)}")`);

  const assignedSlots: Map<number, Pallet463L> = new Map();
  let runningWeight = currentWeight;

  for (const pallet of sortedPallets) {
    if (runningWeight + pallet.gross_weight > maxPayload) {
      unplaced.push(pallet);
      continue;
    }

    let bestSlot = -1;
    let bestDistance = Infinity;

    for (let offset = 0; offset < maxSlots; offset++) {
      for (const dir of [0, 1, -1]) {
        const candidateIndex = validCenterIndex + (dir === 0 ? 0 : dir * offset);
        
        if (candidateIndex < 0 || candidateIndex >= maxSlots) continue;
        if (assignedSlots.has(candidateIndex)) continue;
        
        const slotX = slotPositions[candidateIndex];
        const isOnRamp = slotX >= (maxX - aircraftSpec.ramp_length);
        const maxPositionWeight = isOnRamp 
          ? aircraftSpec.ramp_position_weight 
          : aircraftSpec.per_position_weight;

        if (pallet.gross_weight > maxPositionWeight) continue;

        const armPosition = slotX + PALLET_LENGTH / 2;
        const distanceFromTarget = Math.abs(armPosition - targetSolverCG);
        
        if (distanceFromTarget < bestDistance) {
          bestDistance = distanceFromTarget;
          bestSlot = candidateIndex;
        }
      }
      
      if (bestSlot !== -1) break;
    }

    if (bestSlot !== -1) {
      assignedSlots.set(bestSlot, pallet);
      runningWeight += pallet.gross_weight;
    } else {
      unplaced.push(pallet);
    }
  }

  const sortedAssignments = [...assignedSlots.entries()].sort((a, b) => a[0] - b[0]);
  
  for (const [slotIndex, pallet] of sortedAssignments) {
    const xStart = slotPositions[slotIndex];
    const xEnd = xStart + PALLET_LENGTH;
    const armPosition = xStart + PALLET_LENGTH / 2;
    const isOnRamp = xStart >= (maxX - aircraftSpec.ramp_length);
    
    const placement: PalletPlacement = {
      pallet: pallet,
      position_index: placements.length,
      position_coord: armPosition,
      is_ramp: isOnRamp,
      lateral_placement: {
        y_center_in: 0,
        y_left_in: -PALLET_HALF_WIDTH,
        y_right_in: PALLET_HALF_WIDTH
      },
      x_start_in: xStart,
      x_end_in: xEnd
    };

    placements.push(placement);
    console.log(`[PlacePallets] Placed ${pallet.id} (${pallet.gross_weight}lb) at slot ${slotIndex}, x=${xStart}"`);
  }

  const maxOccupiedX = placements.length > 0
    ? Math.max(...placements.map(p => p.x_end_in!))
    : startX;

  if (placements.length > 0) {
    let totalMoment = 0;
    let totalPalletWeight = 0;
    for (const p of placements) {
      const arm = p.x_start_in! + PALLET_LENGTH / 2;
      totalMoment += p.pallet.gross_weight * arm;
      totalPalletWeight += p.pallet.gross_weight;
    }
    const actualCG = totalPalletWeight > 0 ? totalMoment / totalPalletWeight : 0;
    const stationCG = actualCG + bayStart;
    const actualCobPercent = ((stationCG - aircraftSpec.lemac_station) / aircraftSpec.mac_length) * 100;
    console.log(`[PlacePallets] Result: ${placements.length} pallets, actualCG=${actualCG.toFixed(0)}", CoB=${actualCobPercent.toFixed(1)}% MAC`);
  }

  return { 
    placements, 
    unplaced, 
    nextX: maxOccupiedX + SPACING,
    totalWeight: runningWeight
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
  
  const rsResult = placeRollingStock(queue.rolling_stock, spec, 0, aircraftId);
  const rsWeight = rsResult.placements.reduce((sum, v) => sum + v.weight, 0);
  
  const palletStartX = rsResult.nextX > 0 ? rsResult.nextX + 12 : 0;
  
  const palletResult = placePallets(
    queue.pallets, 
    spec, 
    palletStartX,
    rsWeight
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

export function solveAircraftAllocation(
  classifiedItems: ClassifiedItems,
  aircraftType: AircraftType
): AllocationResult {
  const warnings: string[] = [];
  const loadPlans: AircraftLoadPlan[] = [];
  const unloadedItems: MovementItem[] = [];
  
  resetPalletCounter();
  
  // Debug logging
  console.log('[AircraftSolver] Starting allocation:', {
    aircraftType,
    totalRollingStock: classifiedItems.rolling_stock.length,
    totalPrebuiltPallets: classifiedItems.prebuilt_pallets.length,
    totalLooseItems: classifiedItems.loose_items.length,
    totalPaxItems: classifiedItems.pax_items.length,
    rollingStockItems: classifiedItems.rolling_stock.map(i => ({ id: i.item_id, desc: i.description, type: i.type }))
  });
  
  const advonIds = new Set(classifiedItems.advon_items.map(i => i.item_id));
  
  const advonInput: SolverInput = {
    rolling_stock: classifiedItems.rolling_stock.filter(i => advonIds.has(i.item_id)),
    prebuilt_pallets: classifiedItems.prebuilt_pallets.filter(i => advonIds.has(i.item_id)),
    loose_items: classifiedItems.loose_items.filter(i => advonIds.has(i.item_id)),
    pax_items: classifiedItems.pax_items.filter(i => advonIds.has(i.item_id)),
    phase: 'ADVON'
  };
  
  const mainInput: SolverInput = {
    rolling_stock: classifiedItems.rolling_stock.filter(i => !advonIds.has(i.item_id)),
    prebuilt_pallets: classifiedItems.prebuilt_pallets.filter(i => !advonIds.has(i.item_id)),
    loose_items: classifiedItems.loose_items.filter(i => !advonIds.has(i.item_id)),
    pax_items: classifiedItems.pax_items.filter(i => !advonIds.has(i.item_id)),
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
  
  while (hasCargoInQueue(advonQueue)) {
    const result = loadSingleAircraftFromQueue(advonQueue, aircraftType, advonSequence);
    
    if (result.itemsLoaded === 0) {
      for (const pallet of advonQueue.pallets) {
        unloadedItems.push(...pallet.items);
      }
      unloadedItems.push(...advonQueue.rolling_stock);
      warnings.push(`ADVON: ${advonQueue.pallets.length} pallets and ${advonQueue.rolling_stock.length} vehicles could not fit on any aircraft`);
      break;
    }
    
    loadPlans.push(result.loadPlan);
    totalUnloadedPax += result.unloadedPax;
    advonQueue = result.remaining;
    advonSequence++;
    
    if (advonSequence > MAX_AIRCRAFT) {
      warnings.push(`ADVON loading capped at ${MAX_AIRCRAFT} aircraft`);
      break;
    }
  }
  
  let mainQueue = mainPrep.queue;
  let mainSequence = 1;
  
  while (hasCargoInQueue(mainQueue)) {
    const result = loadSingleAircraftFromQueue(mainQueue, aircraftType, mainSequence);
    
    if (result.itemsLoaded === 0) {
      for (const pallet of mainQueue.pallets) {
        unloadedItems.push(...pallet.items);
      }
      unloadedItems.push(...mainQueue.rolling_stock);
      warnings.push(`MAIN: ${mainQueue.pallets.length} pallets and ${mainQueue.rolling_stock.length} vehicles could not fit on any aircraft`);
      break;
    }
    
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
  
  if (unloadedItems.length > 0) {
    warnings.push(`${unloadedItems.length} items could not be loaded`);
  }
  
  if (totalUnloadedPax > 0) {
    warnings.push(`${totalUnloadedPax} PAX could not be loaded due to seat/weight constraints`);
  }
  
  return {
    aircraft_type: aircraftType,
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
    warnings
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

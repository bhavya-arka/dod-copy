/**
 * Shared Domain Utilities
 * Centralized calculation functions used across the application
 * Eliminates duplicate weight/CoB calculations in various modules
 */

import { 
  AircraftSpec, 
  AircraftType, 
  AIRCRAFT_SPECS, 
  PalletPlacement, 
  VehiclePlacement,
  MovementItem,
  AircraftLoadPlan,
  CoBCalculation,
  PALLET_463L
} from './pacafTypes';

// ============================================================================
// WEIGHT CALCULATIONS
// ============================================================================

export function calculatePalletWeight(pallets: PalletPlacement[]): number {
  return pallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0);
}

export function calculateVehicleWeight(vehicles: VehiclePlacement[]): number {
  return vehicles.reduce((sum, v) => sum + v.weight, 0);
}

export function calculatePaxWeight(paxCount: number): number {
  return paxCount * 225; // Standard 225 lbs per passenger with gear
}

export function calculateTotalWeight(
  pallets: PalletPlacement[], 
  vehicles: VehiclePlacement[], 
  paxCount: number = 0
): number {
  return calculatePalletWeight(pallets) + calculateVehicleWeight(vehicles) + calculatePaxWeight(paxCount);
}

// ============================================================================
// CENTER OF BALANCE CALCULATIONS
// Enhanced with physics-based moment summation per T.O. 1C-17A-9 / T.O. 1C-130H-9  
// ============================================================================

/**
 * Calculate moment (inch-pounds) = Weight (pounds) × Arm (inches from datum)
 */
export function calculateMoment(weight: number, position: number): number {
  return weight * position;
}

/**
 * Get target CG percentage (center of envelope)
 */
export function getTargetCGPercent(spec: AircraftSpec): number {
  return (spec.cob_min_percent + spec.cob_max_percent) / 2;
}

/**
 * Convert station position to %MAC
 * %MAC = ((CG_Station - LEMAC) / MAC_Length) × 100
 */
export function stationToMACPercent(stationCG: number, spec: AircraftSpec): number {
  return ((stationCG - spec.lemac_station) / spec.mac_length) * 100;
}

/**
 * Convert %MAC to station position
 */
export function macPercentToStation(macPercent: number, spec: AircraftSpec): number {
  return spec.lemac_station + (macPercent / 100) * spec.mac_length;
}

/**
 * Calculate Center of Balance from placements with lateral CG support
 * 
 * Physics Principles (per USAF T.O.):
 *   Moment (inch-pounds) = Weight (pounds) × Arm (inches from datum)
 *   CG (station inches) = Total Moment / Total Weight  
 *   %MAC = ((CG_Station - LEMAC) / MAC_Length) × 100
 */
export function calculateCoBFromPlacements(
  pallets: PalletPlacement[],
  vehicles: VehiclePlacement[],
  spec: AircraftSpec,
  paxCount: number = 0,
  paxWeight: number = 0
): CoBCalculation {
  let totalWeight = 0;
  let totalMoment = 0;
  let totalLateralMoment = 0;

  // Use cargo_bay_fs_start - the fuselage station where solver X=0 begins (calibrated for correct %MAC)
  const bayStart = spec.cargo_bay_fs_start;

  // Pallet position_coord is 0-based from cargo bay start (set by solver)
  // Add bayStart to convert to aircraft station coordinates
  for (const p of pallets) {
    const weight = p.pallet.gross_weight;
    // If x_start_in is available (from solver), use it; otherwise use position_coord
    const solverArm = p.x_start_in !== undefined 
      ? p.x_start_in + (PALLET_463L.length / 2)
      : p.position_coord;
    const stationArm = solverArm + bayStart;
    const lateralPosition = p.lateral_placement?.y_center_in ?? 0;
    
    totalWeight += weight;
    totalMoment += weight * stationArm;
    totalLateralMoment += weight * lateralPosition;
  }

  // Vehicle position.z is 0-based from cargo bay start
  // Add bayStart to convert to aircraft station coordinates
  for (const v of vehicles) {
    const weight = v.weight;
    const solverArm = v.position.z;
    const stationArm = solverArm + bayStart;
    const lateralPosition = v.lateral_placement?.y_center_in ?? v.position.x;
    
    totalWeight += weight;
    totalMoment += weight * stationArm;
    totalLateralMoment += weight * lateralPosition;
  }

  // Include PAX weight in CoB calculation
  // PAX seat position: forward troop seats are typically at ~40% of cargo bay length
  if (paxCount > 0 && paxWeight > 0) {
    const paxSolverArm = spec.cargo_length * 0.4;
    const paxStationArm = paxSolverArm + bayStart;
    totalWeight += paxWeight;
    totalMoment += paxWeight * paxStationArm;
    // PAX assumed to be symmetrically distributed (no lateral moment)
  }

  // Calculate CG station (inches from aircraft datum)
  const cgStation = totalWeight > 0 ? totalMoment / totalWeight : bayStart;
  
  // Calculate lateral CG (deviation from centerline)
  const lateralCG = totalWeight > 0 ? totalLateralMoment / totalWeight : 0;
  
  // Calculate CoB as percentage of MAC using correct formula
  // CoB% = ((CG Station - LEMAC) / MAC Length) × 100
  const targetCGPercent = getTargetCGPercent(spec);
  const cobPercent = totalWeight > 0 
    ? ((cgStation - spec.lemac_station) / spec.mac_length) * 100
    : targetCGPercent; // Empty aircraft defaults to target

  // Determine envelope status
  let envelopeStatus: 'in_envelope' | 'forward_limit' | 'aft_limit' = 'in_envelope';
  let envelopeDeviation = 0;
  
  if (cobPercent < spec.cob_min_percent) {
    envelopeStatus = 'forward_limit';
    envelopeDeviation = spec.cob_min_percent - cobPercent;
  } else if (cobPercent > spec.cob_max_percent) {
    envelopeStatus = 'aft_limit';
    envelopeDeviation = cobPercent - spec.cob_max_percent;
  }

  return {
    total_weight: totalWeight,
    total_moment: totalMoment,
    center_of_balance: cgStation,
    cob_percent: cobPercent,
    min_allowed: spec.cob_min_percent,
    max_allowed: spec.cob_max_percent,
    in_envelope: cobPercent >= spec.cob_min_percent && cobPercent <= spec.cob_max_percent,
    envelope_status: envelopeStatus,
    envelope_deviation: envelopeDeviation,
    lateral_cg: lateralCG
  };
}

export function getCoBEnvelope(aircraftType: AircraftType): { min: number; max: number; target: number } {
  const spec = AIRCRAFT_SPECS[aircraftType];
  return {
    min: spec.cob_min_percent,
    max: spec.cob_max_percent,
    target: (spec.cob_min_percent + spec.cob_max_percent) / 2
  };
}

export function isCoBWithinEnvelope(cobPercent: number, aircraftType: AircraftType): boolean {
  const envelope = getCoBEnvelope(aircraftType);
  return cobPercent >= envelope.min && cobPercent <= envelope.max;
}

// ============================================================================
// AIRCRAFT CAPACITY UTILITIES
// ============================================================================

export function getMaxPayload(aircraftType: AircraftType): number {
  return AIRCRAFT_SPECS[aircraftType].max_payload;
}

export function getMaxPalletPositions(aircraftType: AircraftType): number {
  return AIRCRAFT_SPECS[aircraftType].pallet_positions;
}

export function getRampPositions(aircraftType: AircraftType): number[] {
  return AIRCRAFT_SPECS[aircraftType].ramp_positions;
}

export function isRampPosition(positionIndex: number, aircraftType: AircraftType): boolean {
  return getRampPositions(aircraftType).includes(positionIndex + 1);
}

export function getPositionWeightLimit(positionIndex: number, aircraftType: AircraftType): number {
  const spec = AIRCRAFT_SPECS[aircraftType];
  const isRamp = isRampPosition(positionIndex, aircraftType);
  return isRamp ? spec.ramp_position_weight : spec.per_position_weight;
}

export function calculatePayloadPercent(weight: number, aircraftType: AircraftType): number {
  return (weight / getMaxPayload(aircraftType)) * 100;
}

export function calculatePositionUtilization(positionsUsed: number, aircraftType: AircraftType): number {
  return (positionsUsed / getMaxPalletPositions(aircraftType)) * 100;
}

// ============================================================================
// PALLET UTILITIES
// ============================================================================

export function calculatePalletNetWeight(items: MovementItem[]): number {
  return items.reduce((sum, item) => sum + (item.weight_each_lb * item.quantity), 0);
}

export function calculatePalletGrossWeight(items: MovementItem[]): number {
  return calculatePalletNetWeight(items) + PALLET_463L.tare_with_nets;
}

export function getPalletMaxWeight(height: number): number {
  if (height <= PALLET_463L.recommended_height) {
    return PALLET_463L.max_payload_96in;
  } else if (height <= PALLET_463L.max_height) {
    return PALLET_463L.max_payload_100in;
  }
  return 0; // Overheight
}

export function canFitOnPallet(
  item: MovementItem,
  currentHeight: number,
  currentWeight: number
): boolean {
  const newHeight = Math.max(currentHeight, item.height_in);
  const newWeight = currentWeight + item.weight_each_lb * item.quantity;
  
  if (newHeight > PALLET_463L.max_height) return false;
  if (newWeight > getPalletMaxWeight(newHeight)) return false;
  if (item.length_in > PALLET_463L.usable_length) return false;
  if (item.width_in > PALLET_463L.usable_width) return false;
  
  return true;
}

// ============================================================================
// DIMENSIONAL CHECKS
// ============================================================================

export function canFitInAircraft(item: MovementItem, aircraftType: AircraftType): boolean {
  const spec = AIRCRAFT_SPECS[aircraftType];
  return (
    item.length_in <= spec.cargo_length &&
    item.width_in <= spec.cargo_width &&
    item.height_in <= spec.cargo_height
  );
}

export function canLoadAsRollingStock(item: MovementItem, aircraftType: AircraftType): boolean {
  const spec = AIRCRAFT_SPECS[aircraftType];
  return (
    item.width_in <= spec.ramp_clearance_width &&
    item.height_in <= spec.ramp_clearance_height
  );
}

// ============================================================================
// LOAD PLAN UTILITIES
// ============================================================================

export function summarizeLoadPlan(plan: AircraftLoadPlan): {
  totalWeight: number;
  palletCount: number;
  vehicleCount: number;
  paxCount: number;
  cobPercent: number;
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (!plan.cob_in_envelope) {
    issues.push(`CoB ${plan.cob_percent.toFixed(1)}% outside envelope`);
  }
  
  if (plan.payload_used_percent > 100) {
    issues.push(`Overweight: ${plan.payload_used_percent.toFixed(1)}% of max payload`);
  }
  
  return {
    totalWeight: plan.total_weight,
    palletCount: plan.pallets.length,
    vehicleCount: plan.rolling_stock.length,
    paxCount: plan.pax_count,
    cobPercent: plan.cob_percent,
    isValid: issues.length === 0,
    issues
  };
}

// ============================================================================
// OPTIMIZATION UTILITIES
// ============================================================================

export function sortByWeightDescending<T extends { weight: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.weight - a.weight);
}

export function sortByLengthDescending<T extends { length: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.length - a.length);
}

export function sortPalletsByWeight(pallets: PalletPlacement[]): PalletPlacement[] {
  return [...pallets].sort((a, b) => b.pallet.gross_weight - a.pallet.gross_weight);
}

export function distributeForBalance(
  items: Array<{ weight: number; index: number }>,
  targetPosition: number,
  positionSpacing: number
): Array<{ index: number; position: number }> {
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  const result: Array<{ index: number; position: number }> = [];
  
  let currentMoment = 0;
  let currentWeight = 0;
  let positionIndex = 0;
  let leftPtr = 0;
  let rightPtr = sorted.length - 1;
  
  while (leftPtr <= rightPtr) {
    const currentCoB = currentWeight > 0 ? currentMoment / currentWeight : targetPosition;
    const position = positionIndex * positionSpacing;
    
    let item: { weight: number; index: number };
    if (currentCoB < targetPosition) {
      item = sorted[rightPtr--];
    } else {
      item = sorted[leftPtr++];
    }
    
    result.push({ index: item.index, position });
    currentMoment += item.weight * position;
    currentWeight += item.weight;
    positionIndex++;
  }
  
  return result;
}

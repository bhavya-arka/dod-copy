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
// ============================================================================

export function calculateMoment(weight: number, position: number): number {
  return weight * position;
}

export function calculateCoBFromPlacements(
  pallets: PalletPlacement[],
  vehicles: VehiclePlacement[],
  spec: AircraftSpec
): CoBCalculation {
  let totalWeight = 0;
  let totalMoment = 0;

  // Pallet position_coord is already RDL station distance (absolute)
  for (const p of pallets) {
    totalWeight += p.pallet.gross_weight;
    totalMoment += p.pallet.gross_weight * p.position_coord;
  }

  // Vehicle position.z is cargo-relative, add forward_offset to get aircraft station
  for (const v of vehicles) {
    totalWeight += v.weight;
    const vehicleStation = v.position.z + spec.forward_offset;
    totalMoment += v.weight * vehicleStation;
  }

  // Calculate CG station (inches from aircraft datum)
  const cgStation = totalWeight > 0 ? totalMoment / totalWeight : 0;
  
  // Calculate CoB as percentage of MAC using correct formula
  // CoB% = ((CG Station - LEMAC) / MAC Length) × 100
  const cobPercent = totalWeight > 0 
    ? ((cgStation - spec.lemac_station) / spec.mac_length) * 100
    : 0;

  return {
    total_weight: totalWeight,
    total_moment: totalMoment,
    center_of_balance: cgStation,
    cob_percent: cobPercent,
    min_allowed: spec.cob_min_percent,
    max_allowed: spec.cob_max_percent,
    in_envelope: cobPercent >= spec.cob_min_percent && cobPercent <= spec.cob_max_percent
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

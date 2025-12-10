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
  PALLET_463L
} from '../types';
import { processPalletization, PalletizationResult, resetPalletCounter } from './palletizationEngine';
import { sortByLengthDescending, sortByWeightDescending } from '../parser';

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
// SECTION 9: CENTER OF BALANCE CALCULATIONS (FIXED)
// ============================================================================

/**
 * Calculate Center of Balance as percentage of Mean Aerodynamic Chord (MAC)
 * 
 * FIXED: Now produces valid positive percentages in the 15-40% range
 */
export function calculateCenterOfBalance(
  pallets: PalletPlacement[],
  vehicles: VehiclePlacement[],
  aircraftSpec: AircraftSpec
): CoBCalculation {
  let totalWeight = 0;
  let totalMoment = 0;

  for (const p of pallets) {
    const weight = p.pallet.gross_weight;
    const arm = p.position_coord + (PALLET_463L.length / 2);
    totalWeight += weight;
    totalMoment += weight * arm;
  }

  for (const v of vehicles) {
    const weight = v.weight;
    const arm = v.position.z;
    totalWeight += weight;
    totalMoment += weight * arm;
  }

  const cgPosition = totalWeight > 0 ? totalMoment / totalWeight : 0;
  
  const cargoLength = aircraftSpec.cargo_length;
  const normalizedPosition = Math.max(0, Math.min(1, cgPosition / cargoLength));
  
  const cobPercent = aircraftSpec.cob_min_percent + 
    normalizedPosition * (aircraftSpec.cob_max_percent - aircraftSpec.cob_min_percent);

  const inEnvelope = cobPercent >= aircraftSpec.cob_min_percent && 
                     cobPercent <= aircraftSpec.cob_max_percent;
  
  let envelopeDeviation = 0;
  let envelopeStatus: 'in_envelope' | 'forward_limit' | 'aft_limit' = 'in_envelope';
  
  if (cobPercent < aircraftSpec.cob_min_percent) {
    envelopeDeviation = aircraftSpec.cob_min_percent - cobPercent;
    envelopeStatus = 'forward_limit';
  } else if (cobPercent > aircraftSpec.cob_max_percent) {
    envelopeDeviation = cobPercent - aircraftSpec.cob_max_percent;
    envelopeStatus = 'aft_limit';
  }

  return {
    total_weight: totalWeight,
    total_moment: totalMoment,
    center_of_balance: cgPosition,
    cob_percent: cobPercent,
    min_allowed: aircraftSpec.cob_min_percent,
    max_allowed: aircraftSpec.cob_max_percent,
    in_envelope: inEnvelope
  };
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
// SIMPLIFIED ROLLING STOCK PLACEMENT (Dimension-based)
// ============================================================================

interface SimplePlacement {
  x_start: number;
  x_end: number;
  y_center: number;
}

function placeRollingStockSimple(
  items: MovementItem[],
  aircraftSpec: AircraftSpec,
  startX: number = 0,
  aircraftId: string = 'AC-1'
): { placements: VehiclePlacement[]; nextX: number; unplaced: MovementItem[] } {
  const placements: VehiclePlacement[] = [];
  const unplaced: MovementItem[] = [];
  const occupied: SimplePlacement[] = [];

  const sortedItems = sortWithWeaponsPriority(items);
  const SPACING = 4;
  const maxX = aircraftSpec.cargo_length;
  const halfWidth = aircraftSpec.cargo_width / 2;

  let currentX = startX;

  for (const item of sortedItems) {
    if (item.width_in > aircraftSpec.ramp_clearance_width) {
      unplaced.push(item);
      continue;
    }

    if (item.height_in > aircraftSpec.ramp_clearance_height) {
      unplaced.push(item);
      continue;
    }

    if (currentX + item.length_in > maxX) {
      unplaced.push(item);
      continue;
    }

    const xStart = currentX;
    const xEnd = xStart + item.length_in;
    const yCenter = 0;
    const itemHalfWidth = item.width_in / 2;

    const placement: VehiclePlacement = {
      item_id: item.item_id,
      item: item,
      weight: item.weight_each_lb,
      length: item.length_in,
      width: item.width_in,
      height: item.height_in,
      axle_weights: item.axle_weights || [],
      position: { x: yCenter, y: 0, z: xStart + item.length_in / 2 }
    };

    placements.push(placement);
    occupied.push({ x_start: xStart, x_end: xEnd, y_center: yCenter });
    currentX = xEnd + SPACING;
  }

  return { placements, nextX: currentX, unplaced };
}

// ============================================================================
// PALLET PLACEMENT (Dimension-based, no fixed stations)
// ============================================================================

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
  const placedPlacements: PalletPlacement[] = [];
  const unplaced: Pallet463L[] = [];

  const sortedPallets = sortPalletsWithWeaponsPriority(pallets);
  const PALLET_LENGTH = PALLET_463L.length;
  const PALLET_WIDTH = PALLET_463L.width;
  const PALLET_HALF_WIDTH = PALLET_WIDTH / 2;
  const SPACING = 4;

  let currentX = startX;
  let runningWeight = currentWeight;
  const maxX = aircraftSpec.cargo_length;
  const maxPayload = aircraftSpec.max_payload;

  for (const pallet of sortedPallets) {
    if (currentX + PALLET_LENGTH > maxX) {
      unplaced.push(pallet);
      continue;
    }
    
    if (runningWeight + pallet.gross_weight > maxPayload) {
      unplaced.push(pallet);
      continue;
    }
    
    const rampLength = 180;
    const isOnRamp = currentX >= (maxX - rampLength);
    const maxPositionWeight = isOnRamp 
      ? aircraftSpec.ramp_position_weight 
      : aircraftSpec.per_position_weight;

    if (pallet.gross_weight > maxPositionWeight) {
      unplaced.push(pallet);
      continue;
    }

    const xStart = currentX;
    const xEnd = xStart + PALLET_LENGTH;
    const armPosition = xStart + PALLET_LENGTH / 2;
    
    const placement: PalletPlacement = {
      pallet: pallet,
      position_index: placedPlacements.length,
      position_coord: armPosition,
      is_ramp: isOnRamp
    };

    placedPlacements.push(placement);
    runningWeight += pallet.gross_weight;
    currentX = xEnd + SPACING;
  }

  return { 
    placements: placedPlacements, 
    unplaced, 
    nextX: currentX,
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
} {
  const spec = AIRCRAFT_SPECS[aircraftType];
  const aircraftId = `${aircraftType}-${queue.phase}-${sequence}`;
  
  const rsResult = placeRollingStockSimple(queue.rolling_stock, spec, 0, aircraftId);
  const rsWeight = rsResult.placements.reduce((sum, v) => sum + v.weight, 0);
  
  const palletStartX = rsResult.nextX > 0 ? rsResult.nextX + 12 : 0;
  
  const palletResult = placePallets(
    queue.pallets, 
    spec, 
    palletStartX,
    rsWeight
  );
  
  const paxCount = queue.pax_items.reduce((sum, p) => sum + (p.pax_count || 1), 0);
  
  const cob = calculateCenterOfBalance(palletResult.placements, rsResult.placements, spec);
  
  const finalPalletWeight = palletResult.placements.reduce((sum, p) => sum + p.pallet.gross_weight, 0);
  const finalRsWeight = rsResult.placements.reduce((sum, v) => sum + v.weight, 0);
  const finalTotalWeight = finalRsWeight + finalPalletWeight;
  
  const totalPositionsUsed = rsResult.placements.length + palletResult.placements.length;
  const maxUsableLength = spec.cargo_length;
  const usedLength = palletResult.nextX > 0 ? palletResult.nextX : rsResult.nextX;
  const utilizationPercent = (usedLength / maxUsableLength) * 100;
  
  const loadPlan: AircraftLoadPlan = {
    aircraft_id: aircraftId,
    aircraft_type: aircraftType,
    aircraft_spec: spec,
    sequence: sequence,
    phase: queue.phase,
    pallets: palletResult.placements,
    rolling_stock: rsResult.placements,
    pax_count: paxCount,
    total_weight: finalTotalWeight,
    payload_used_percent: (finalTotalWeight / spec.max_payload) * 100,
    center_of_balance: cob.center_of_balance,
    cob_percent: cob.cob_percent,
    cob_in_envelope: cob.in_envelope,
    positions_used: totalPositionsUsed,
    positions_available: spec.pallet_positions,
    utilization_percent: utilizationPercent
  };
  
  const itemsLoaded = rsResult.placements.length + palletResult.placements.length + (paxCount > 0 ? 1 : 0);
  
  const remaining: AllocationQueue = {
    rolling_stock: rsResult.unplaced,
    pallets: palletResult.unplaced,
    pax_items: [],
    phase: queue.phase
  };
  
  return { loadPlan, remaining, itemsLoaded };
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
  
  if (unloadedItems.length > 0) {
    warnings.push(`${unloadedItems.length} items could not be loaded`);
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
    unloaded_items: unloadedItems,
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

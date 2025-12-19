/**
 * Cargo Loading Sequence Calculation Engine
 * 
 * Calculates optimal loading sequences for 3D viewport animation.
 * Implements FILO (First In, Last Out) logic for multi-stop flights.
 * 
 * FILO Loading Logic:
 * - Cargo for LAST stop loads FIRST (goes deepest in aircraft)
 * - Cargo for FIRST stop loads LAST (positioned at rear for easy offload)
 * - Within same stop: aft positions load first (end up deeper)
 * - Hazmat loads last within same stop/position group
 */

import type {
  AircraftLoadPlan,
  PalletPlacement,
  VehiclePlacement,
  PALLET_463L,
} from './pacafTypes';

export interface LoadingSequenceItem {
  id: string;
  type: 'pallet' | 'vehicle';
  name: string;
  tcn?: string;
  weight: number;
  dimensions: { length: number; width: number; height: number };
  targetPosition: { x: number; y: number; z: number };
  sequenceNumber: number;
  animationDelay: number;
  hazmat: boolean;
  loadingNotes: string[];
  
  /**
   * Destination stop index for multi-stop flight operations.
   * Indicates at which stop this cargo item should be offloaded.
   * 
   * Stop Indexing:
   * - 0 = first stop after origin (first intermediate stop)
   * - 1 = second stop after origin
   * - Higher numbers = later stops in the route
   * - Max value = final destination
   * - undefined = destination not specified (defaults to final)
   */
  destinationStopIndex?: number;
  
  /**
   * Indicates if cargo continues past the current stop.
   * - true = cargo stays on aircraft and continues to a later stop
   * - false = cargo is offloaded at this stop
   * - undefined = not applicable or destination not specified
   * 
   * Used for load planning to determine which items remain
   * after each intermediate stop for CG recalculation.
   */
  staysOnAircraft?: boolean;
}

export interface LoadingConstraints {
  requiresSpecialHandling: boolean;
  specialHandlingReasons: string[];
  loadingPriority: 'high' | 'medium' | 'low';
  priorityScore: number;
  weightCategory: 'heavy' | 'medium' | 'light';
}

interface SortableCargoItem {
  id: string;
  type: 'pallet' | 'vehicle';
  name: string;
  tcn?: string;
  weight: number;
  dimensions: { length: number; width: number; height: number };
  targetPosition: { x: number; y: number; z: number };
  positionIndex: number;
  hazmat: boolean;
  isRamp: boolean;
  loadingNotes: string[];
  destinationStopIndex: number;
}

const ANIMATION_DELAY_BASE = 2.0;
const ANIMATION_DELAY_INCREMENT = 1.5;

const WEIGHT_THRESHOLDS = {
  heavy: 7000,
  medium: 4000,
};

const DEFAULT_DESTINATION_STOP_INDEX = 999;

/**
 * Calculate the loading sequence for an aircraft load plan.
 * Returns an ordered array of cargo items with their loading sequence.
 * 
 * FILO Loading Order (First In, Last Out for multi-stop flights):
 * 1. Primary: destinationStopIndex DESCENDING - Cargo for LAST stop loads FIRST (goes deepest)
 * 2. Secondary: positionIndex DESCENDING - Within same stop, aft positions load first (end up deeper)
 * 3. Tertiary: Non-hazmat before hazmat within same stop/position
 * 
 * Result:
 * - Final destination cargo loads first → positioned deepest (front of aircraft)
 * - First stop cargo loads last → positioned at rear (easy to offload first)
 * - At each stop, unloading proceeds forward-to-ramp
 */
export function calculateLoadingSequence(loadPlan: AircraftLoadPlan): LoadingSequenceItem[] {
  const cargoItems: SortableCargoItem[] = [];

  for (const palletPlacement of loadPlan.pallets) {
    const pallet = palletPlacement.pallet;
    const tcn = pallet.items.length > 0 ? pallet.items[0].tcn || pallet.items[0].lead_tcn : undefined;
    
    const targetX = palletPlacement.lateral_placement?.y_center_in 
      ? inchesToMeters(palletPlacement.lateral_placement.y_center_in)
      : 0;
    const targetY = inchesToMeters(pallet.height / 2);
    const targetZ = inchesToMeters(palletPlacement.position_coord);

    const destinationStopIndex = pallet.destinationStop ?? DEFAULT_DESTINATION_STOP_INDEX;

    cargoItems.push({
      id: pallet.id,
      type: 'pallet',
      name: getPalletName(pallet, palletPlacement),
      tcn,
      weight: pallet.gross_weight,
      dimensions: {
        length: pallet.footprint.length,
        width: pallet.footprint.width,
        height: pallet.height,
      },
      targetPosition: { x: targetX, y: targetY, z: targetZ },
      positionIndex: palletPlacement.position_index,
      hazmat: pallet.hazmat_flag,
      isRamp: palletPlacement.is_ramp,
      loadingNotes: generatePalletLoadingNotes(pallet, palletPlacement),
      destinationStopIndex,
    });
  }

  for (const vehicle of loadPlan.rolling_stock) {
    const positionIndex = estimateVehiclePositionIndex(vehicle, loadPlan);
    const destinationStopIndex = vehicle.item.destinationStop ?? DEFAULT_DESTINATION_STOP_INDEX;
    
    cargoItems.push({
      id: String(vehicle.item_id),
      type: 'vehicle',
      name: vehicle.item.description,
      tcn: vehicle.item.tcn || vehicle.item.lead_tcn,
      weight: vehicle.weight,
      dimensions: {
        length: vehicle.length,
        width: vehicle.width,
        height: vehicle.height,
      },
      targetPosition: {
        x: inchesToMeters(vehicle.position.x),
        y: inchesToMeters(vehicle.position.y + vehicle.height / 2),
        z: inchesToMeters(vehicle.position.z),
      },
      positionIndex,
      hazmat: vehicle.item.hazmat_flag,
      isRamp: vehicle.deck === 'RAMP',
      loadingNotes: generateVehicleLoadingNotes(vehicle),
      destinationStopIndex,
    });
  }

  const sortedItems = sortCargoForLoading(cargoItems);

  const sequencedItems: LoadingSequenceItem[] = sortedItems.map((item, index) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    tcn: item.tcn,
    weight: item.weight,
    dimensions: item.dimensions,
    targetPosition: item.targetPosition,
    sequenceNumber: index + 1,
    animationDelay: calculateAnimationDelay(index, item),
    hazmat: item.hazmat,
    loadingNotes: [
      ...item.loadingNotes,
      `Sequence #${index + 1}: ${getSequenceReasoning(item, index, sortedItems)}`,
    ],
    destinationStopIndex: item.destinationStopIndex === DEFAULT_DESTINATION_STOP_INDEX 
      ? undefined 
      : item.destinationStopIndex,
  }));

  return sequencedItems;
}

/**
 * Get loading constraints for a cargo item.
 * Determines special handling requirements and loading priority.
 */
export function getLoadingConstraints(
  item: { weight: number; hazmat: boolean; dimensions: { height: number } },
  aircraftType?: string
): LoadingConstraints {
  const specialHandlingReasons: string[] = [];
  let requiresSpecialHandling = false;

  if (item.hazmat) {
    requiresSpecialHandling = true;
    specialHandlingReasons.push('Hazardous materials - load last in position group');
  }

  if (item.weight > WEIGHT_THRESHOLDS.heavy) {
    requiresSpecialHandling = true;
    specialHandlingReasons.push(`Heavy cargo (${item.weight} lbs) - requires floor load verification`);
  }

  if (item.dimensions.height > 96) {
    specialHandlingReasons.push('Oversized height - verify station clearance');
  }

  const priorityScore = calculatePriorityScore(item);
  let loadingPriority: 'high' | 'medium' | 'low';
  let weightCategory: 'heavy' | 'medium' | 'light';

  if (item.weight >= WEIGHT_THRESHOLDS.heavy) {
    loadingPriority = 'high';
    weightCategory = 'heavy';
  } else if (item.weight >= WEIGHT_THRESHOLDS.medium) {
    loadingPriority = 'medium';
    weightCategory = 'medium';
  } else {
    loadingPriority = 'low';
    weightCategory = 'light';
  }

  return {
    requiresSpecialHandling,
    specialHandlingReasons,
    loadingPriority,
    priorityScore,
    weightCategory,
  };
}

/**
 * Sort cargo items for loading using FILO (First In, Last Out) logic.
 * 
 * Sort order (all DESCENDING for FILO):
 * 1. destinationStopIndex DESCENDING - Higher stop index loads first (goes deepest)
 * 2. positionIndex DESCENDING - Aft positions load first within same stop
 * 3. hazmat flag - Non-hazmat (0) before hazmat (1) within same group
 * 
 * This ensures:
 * - Final destination cargo is loaded first and ends up deepest in aircraft
 * - First stop cargo is loaded last and is positioned nearest to ramp
 * - Unloading at each stop proceeds logically from rear to front
 */
function sortCargoForLoading(items: SortableCargoItem[]): SortableCargoItem[] {
  return [...items].sort((a, b) => {
    if (a.destinationStopIndex !== b.destinationStopIndex) {
      return b.destinationStopIndex - a.destinationStopIndex;
    }

    if (a.positionIndex !== b.positionIndex) {
      return b.positionIndex - a.positionIndex;
    }

    const aIsHazmat = a.hazmat ? 1 : 0;
    const bIsHazmat = b.hazmat ? 1 : 0;
    if (aIsHazmat !== bIsHazmat) {
      return aIsHazmat - bIsHazmat;
    }

    return 0;
  });
}

function getWeightPriorityScore(weight: number): number {
  if (weight >= WEIGHT_THRESHOLDS.heavy) return 3;
  if (weight >= WEIGHT_THRESHOLDS.medium) return 2;
  return 1;
}

function calculatePriorityScore(item: { weight: number; hazmat: boolean }): number {
  let score = 0;
  
  score += Math.min(item.weight / 1000, 10);
  
  if (item.hazmat) {
    score -= 5;
  }
  
  return Math.max(0, score);
}

function calculateAnimationDelay(index: number, item: SortableCargoItem): number {
  let delay = ANIMATION_DELAY_BASE + (index * ANIMATION_DELAY_INCREMENT);
  
  if (item.weight >= WEIGHT_THRESHOLDS.heavy) {
    delay += 0.5;
  }
  
  if (item.hazmat) {
    delay += 0.3;
  }
  
  return Math.round(delay * 10) / 10;
}

function inchesToMeters(inches: number): number {
  return inches * 0.0254;
}

function getPalletName(
  pallet: PalletPlacement['pallet'],
  placement: PalletPlacement
): string {
  if (pallet.items.length > 0) {
    const firstItem = pallet.items[0];
    if (pallet.items.length === 1) {
      return firstItem.description;
    }
    return `${firstItem.description} (+${pallet.items.length - 1} items)`;
  }
  return `463L Pallet - Position ${placement.position_index}`;
}

function generatePalletLoadingNotes(
  pallet: PalletPlacement['pallet'],
  placement: PalletPlacement
): string[] {
  const notes: string[] = [];
  
  notes.push(`Position ${placement.position_index}`);
  notes.push(`Gross weight: ${pallet.gross_weight.toLocaleString()} lbs`);
  
  if (pallet.destinationStop !== undefined) {
    notes.push(`Destination: Stop ${pallet.destinationStop + 1}`);
  } else {
    notes.push('Destination: Final');
  }
  
  if (pallet.hazmat_flag) {
    notes.push('HAZMAT: Load last in stop/position group');
  }
  
  if (placement.is_ramp) {
    notes.push('Ramp position: Verify height clearance');
  }
  
  if (pallet.items.length > 1) {
    notes.push(`Contains ${pallet.items.length} consolidated items`);
  }
  
  if (pallet.gross_weight >= WEIGHT_THRESHOLDS.heavy) {
    notes.push('Heavy pallet: Verify floor loading');
  }
  
  return notes;
}

function generateVehicleLoadingNotes(vehicle: VehiclePlacement): string[] {
  const notes: string[] = [];
  
  notes.push(`Vehicle: ${vehicle.item.description}`);
  notes.push(`Weight: ${vehicle.weight.toLocaleString()} lbs`);
  
  if (vehicle.item.destinationStop !== undefined) {
    notes.push(`Destination: Stop ${vehicle.item.destinationStop + 1}`);
  } else {
    notes.push('Destination: Final');
  }
  
  if (vehicle.item.hazmat_flag) {
    notes.push('HAZMAT: Requires special handling');
  }
  
  if (vehicle.deck === 'RAMP') {
    notes.push('Positioned on ramp');
  }
  
  if (vehicle.axle_weights && vehicle.axle_weights.length > 0) {
    const maxAxle = Math.max(...vehicle.axle_weights);
    notes.push(`Max axle weight: ${maxAxle.toLocaleString()} lbs`);
  }
  
  if (vehicle.weight >= WEIGHT_THRESHOLDS.heavy) {
    notes.push('Heavy vehicle: Verify floor loading');
  }
  
  return notes;
}

function estimateVehiclePositionIndex(
  vehicle: VehiclePlacement,
  loadPlan: AircraftLoadPlan
): number {
  const zPosition = vehicle.position?.z ?? 0;
  const cargoLength = loadPlan.aircraft_spec.cargo_length;
  const numPositions = loadPlan.aircraft_spec.pallet_positions;
  
  if (!cargoLength || !numPositions || isNaN(zPosition)) {
    return numPositions || 1;
  }
  
  const normalizedZ = zPosition / cargoLength;
  const estimatedPosition = Math.max(1, Math.min(numPositions, Math.ceil(normalizedZ * numPositions)));
  
  if (isNaN(estimatedPosition)) {
    return numPositions || 1;
  }
  
  return estimatedPosition;
}

/**
 * Generate human-readable reasoning for why an item is at its sequence position.
 * Explains the FILO loading logic applied.
 */
function getSequenceReasoning(
  item: SortableCargoItem,
  index: number,
  allItems: SortableCargoItem[]
): string {
  const reasons: string[] = [];
  
  if (index === 0) {
    reasons.push('First to load (goes deepest)');
  }
  
  if (item.destinationStopIndex === DEFAULT_DESTINATION_STOP_INDEX) {
    reasons.push('final destination');
  } else if (item.destinationStopIndex === 0) {
    reasons.push('first stop (loads last for easy offload)');
  } else {
    reasons.push(`stop ${item.destinationStopIndex + 1}`);
  }
  
  const maxPosition = Math.max(...allItems.map(i => i.positionIndex));
  const minPosition = Math.min(...allItems.map(i => i.positionIndex));
  
  if (item.positionIndex >= maxPosition - 2 && maxPosition > 3) {
    reasons.push('aft position (loads early)');
  } else if (item.positionIndex <= minPosition + 2) {
    reasons.push('forward position');
  }
  
  if (item.hazmat) {
    reasons.push('hazmat (loads last in group)');
  }
  
  if (item.isRamp) {
    reasons.push('ramp position');
  }
  
  return reasons.length > 0 ? reasons.join(', ') : 'standard FILO order';
}

const ITEM_ANIMATION_DURATION = 2.0;
const HEAVY_ITEM_DURATION_BONUS = 0.5;
const HAZMAT_DURATION_BONUS = 0.3;

/**
 * Calculate total loading time estimate based on sequence.
 * Returns estimated duration in seconds including all item animations.
 */
export function estimateTotalLoadingTime(sequence: LoadingSequenceItem[]): number {
  if (sequence.length === 0) return 0;
  
  let totalDuration = ANIMATION_DELAY_BASE;
  
  for (const item of sequence) {
    let itemDuration = ITEM_ANIMATION_DURATION;
    
    if (item.weight >= WEIGHT_THRESHOLDS.heavy) {
      itemDuration += HEAVY_ITEM_DURATION_BONUS;
    }
    
    if (item.hazmat) {
      itemDuration += HAZMAT_DURATION_BONUS;
    }
    
    totalDuration += itemDuration;
  }
  
  return Math.round(totalDuration * 10) / 10;
}

/**
 * Get items grouped by their loading phase.
 */
export function groupByLoadingPhase(sequence: LoadingSequenceItem[]): {
  earlyPhase: LoadingSequenceItem[];
  midPhase: LoadingSequenceItem[];
  latePhase: LoadingSequenceItem[];
} {
  const totalItems = sequence.length;
  const earlyThreshold = Math.ceil(totalItems / 3);
  const midThreshold = Math.ceil((totalItems * 2) / 3);
  
  return {
    earlyPhase: sequence.filter((_, i) => i < earlyThreshold),
    midPhase: sequence.filter((_, i) => i >= earlyThreshold && i < midThreshold),
    latePhase: sequence.filter((_, i) => i >= midThreshold),
  };
}

/**
 * Group cargo items by their destination stop for multi-stop flight planning.
 * Useful for visualizing what cargo gets offloaded at each stop.
 */
export function groupByDestinationStop(sequence: LoadingSequenceItem[]): Map<number | 'final', LoadingSequenceItem[]> {
  const groups = new Map<number | 'final', LoadingSequenceItem[]>();
  
  for (const item of sequence) {
    const key = item.destinationStopIndex ?? 'final';
    const existing = groups.get(key) || [];
    existing.push(item);
    groups.set(key, existing);
  }
  
  return groups;
}

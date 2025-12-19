/**
 * Cargo Loading Sequence Calculation Engine
 * 
 * Calculates optimal loading sequences for 3D viewport animation.
 * Prioritizes weight distribution, position indices, and hazmat handling.
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
}

const ANIMATION_DELAY_BASE = 2.0;
const ANIMATION_DELAY_INCREMENT = 1.5;

const WEIGHT_THRESHOLDS = {
  heavy: 7000,
  medium: 4000,
};

/**
 * Calculate the loading sequence for an aircraft load plan.
 * Returns an ordered array of cargo items with their loading sequence.
 * 
 * Loading order logic (priority):
 * 1. Heavy items (>7000 lbs) load first for center of balance stability
 * 2. Medium weight items (4000-7000 lbs) load next
 * 3. Within same weight category: forward positions before aft
 * 4. Within same position: non-hazmat before hazmat
 * 5. Pallets before vehicles at same position/weight
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
    });
  }

  for (const vehicle of loadPlan.rolling_stock) {
    const positionIndex = estimateVehiclePositionIndex(vehicle, loadPlan);
    
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

function sortCargoForLoading(items: SortableCargoItem[]): SortableCargoItem[] {
  return [...items].sort((a, b) => {
    const aWeightScore = getWeightPriorityScore(a.weight);
    const bWeightScore = getWeightPriorityScore(b.weight);
    if (aWeightScore !== bWeightScore) {
      return bWeightScore - aWeightScore;
    }

    if (a.positionIndex !== b.positionIndex) {
      return a.positionIndex - b.positionIndex;
    }

    const aIsHazmat = a.hazmat ? 1 : 0;
    const bIsHazmat = b.hazmat ? 1 : 0;
    if (aIsHazmat !== bIsHazmat) {
      return aIsHazmat - bIsHazmat;
    }

    if (a.type !== b.type) {
      return a.type === 'pallet' ? -1 : 1;
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
  
  if (pallet.hazmat_flag) {
    notes.push('HAZMAT: Load last in position group');
  }
  
  if (placement.is_ramp) {
    notes.push('Ramp position: Verify height clearance');
  }
  
  if (pallet.items.length > 1) {
    notes.push(`Contains ${pallet.items.length} consolidated items`);
  }
  
  if (pallet.gross_weight >= WEIGHT_THRESHOLDS.heavy) {
    notes.push('Heavy pallet: Load early for CG stability');
  }
  
  return notes;
}

function generateVehicleLoadingNotes(vehicle: VehiclePlacement): string[] {
  const notes: string[] = [];
  
  notes.push(`Vehicle: ${vehicle.item.description}`);
  notes.push(`Weight: ${vehicle.weight.toLocaleString()} lbs`);
  
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
    notes.push('Heavy vehicle: Priority loading for balance');
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

function getSequenceReasoning(
  item: SortableCargoItem,
  index: number,
  allItems: SortableCargoItem[]
): string {
  const reasons: string[] = [];
  
  if (index === 0) {
    reasons.push('First to load');
  }
  
  if (item.positionIndex <= 3) {
    reasons.push('forward position');
  } else if (item.positionIndex >= allItems[allItems.length - 1]?.positionIndex - 2) {
    reasons.push('aft position');
  }
  
  if (item.weight >= WEIGHT_THRESHOLDS.heavy) {
    reasons.push('heavy cargo prioritized');
  }
  
  if (item.hazmat) {
    reasons.push('hazmat loaded last in group');
  }
  
  if (item.isRamp) {
    reasons.push('ramp position');
  }
  
  return reasons.length > 0 ? reasons.join(', ') : 'standard loading order';
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

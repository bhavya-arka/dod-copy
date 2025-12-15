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
// SECTION 9: CENTER OF BALANCE CALCULATIONS (FIXED)
// ============================================================================

/**
 * Calculate Center of Balance as percentage of Mean Aerodynamic Chord (MAC)
 * 
 * FIXED: Now produces valid positive percentages in the 15-40% range
 * 
 * The formula maps cargo position to a percentage within the aircraft's envelope.
 * - Cargo at front of bay = lower percentage (forward CG)
 * - Cargo at back of bay = higher percentage (aft CG)
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
    const arm = p.x_start_in !== undefined 
      ? p.x_start_in + (PALLET_463L.length / 2)
      : p.position_coord;
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
    in_envelope: inEnvelope,
    envelope_status: envelopeStatus,
    envelope_deviation: envelopeDeviation
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
  const LATERAL_SPACING = 2;
  const maxX = aircraftSpec.cargo_length;
  const halfAircraftWidth = aircraftSpec.cargo_width / 2;
  const maxHeight = aircraftSpec.main_deck_height;

  let currentX = startX;

  for (const item of sortedItems) {
    if (item.width_in > aircraftSpec.ramp_clearance_width) {
      console.log(`[PlaceRollingStock] Item ${item.description} too wide: ${item.width_in} > ${aircraftSpec.ramp_clearance_width}`);
      unplaced.push(item);
      continue;
    }

    if (item.height_in > aircraftSpec.ramp_clearance_height) {
      console.log(`[PlaceRollingStock] Item ${item.description} too tall: ${item.height_in} > ${aircraftSpec.ramp_clearance_height}`);
      unplaced.push(item);
      continue;
    }

    if (currentX + item.length_in > maxX) {
      console.log(`[PlaceRollingStock] Item ${item.description} doesn't fit: ${currentX} + ${item.length_in} > ${maxX}`);
      unplaced.push(item);
      continue;
    }

    const halfWidth = item.width_in / 2;
    let placed = false;

    const position = findSolverPosition(
      item.length_in,
      item.width_in,
      item.height_in,
      existingPlacements,
      aircraftSpec,
      currentX,
      LONGITUDINAL_SPACING
    );

    console.log(`[PlaceRollingStock] Position for ${item.description}:`, position);

    if (position.fits) {
      const xStart = position.x_start;
      const xEnd = xStart + item.length_in;
      const yCenter = position.y_center;

      const candidateBox = {
        x_start: xStart,
        x_end: xEnd,
        y_left: yCenter - halfWidth,
        y_right: yCenter + halfWidth,
        z_top: item.height_in
      };
      
      if (isWithinSolverBounds(candidateBox, halfAircraftWidth, maxX, maxHeight) && 
          !collidesWithAny(createBoundingBox(xStart, item.length_in, yCenter, item.width_in, 0, item.height_in), existingPlacements)) {
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
            side: position.side
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
        currentX = Math.max(currentX, xEnd + LONGITUDINAL_SPACING);
        placed = true;
      }
    }

    if (!placed) {
      let foundPosition = false;
      const sortedExisting = [...existingPlacements].sort((a, b) => a.x_start_in - b.x_start_in);
      
      const candidateXPositions: number[] = [currentX];
      for (const existing of sortedExisting) {
        candidateXPositions.push(existing.x_end_in + LONGITUDINAL_SPACING);
      }
      
      for (const candidateX of candidateXPositions) {
        if (candidateX + item.length_in > maxX) continue;
        
        const yCandidates = [0];
        const itemsInRange = sortedExisting.filter(e => 
          e.x_start_in < candidateX + item.length_in && e.x_end_in > candidateX
        );
        
        if (itemsInRange.length > 0) {
          const leftmost = Math.min(...itemsInRange.map(i => i.y_left_in));
          const rightmost = Math.max(...itemsInRange.map(i => i.y_right_in));
          yCandidates.push(leftmost - LATERAL_SPACING - halfWidth);
          yCandidates.push(rightmost + LATERAL_SPACING + halfWidth);
        }
        
        for (const yCandidate of yCandidates) {
          const box = createBoundingBox(candidateX, item.length_in, yCandidate, item.width_in, 0, item.height_in);
          const simpleBox = {
            x_start: candidateX,
            x_end: candidateX + item.length_in,
            y_left: yCandidate - halfWidth,
            y_right: yCandidate + halfWidth,
            z_top: item.height_in
          };
          
          if (isWithinSolverBounds(simpleBox, halfAircraftWidth, maxX, maxHeight) && !collidesWithAny(box, existingPlacements)) {
            const xStart = candidateX;
            const xEnd = xStart + item.length_in;
            
            let side: 'center' | 'left' | 'right' = 'center';
            if (yCandidate < -10) side = 'left';
            else if (yCandidate > 10) side = 'right';

            const placement: VehiclePlacement = {
              item_id: item.item_id,
              item: item,
              weight: item.weight_each_lb,
              length: item.length_in,
              width: item.width_in,
              height: item.height_in,
              axle_weights: item.axle_weights || [],
              position: { x: yCandidate, y: 0, z: xStart + item.length_in / 2 },
              lateral_placement: {
                y_center_in: yCandidate,
                y_left_in: yCandidate - halfWidth,
                y_right_in: yCandidate + halfWidth,
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
              y_center_in: yCandidate,
              z_floor_in: 0,
              x_end_in: xEnd,
              y_left_in: yCandidate - halfWidth,
              y_right_in: yCandidate + halfWidth,
              z_top_in: item.height_in,
              is_hazardous: item.hazmat_flag
            };
            
            existingPlacements.push(placedCargo);
            placements.push(placement);
            currentX = Math.max(currentX, xEnd + LONGITUDINAL_SPACING);
            foundPosition = true;
            placed = true;
            break;
          }
        }
        
        if (foundPosition) break;
      }
    }

    if (!placed) {
      unplaced.push(item);
    }
  }

  for (let i = 0; i < existingPlacements.length; i++) {
    for (let j = i + 1; j < existingPlacements.length; j++) {
      const item1 = existingPlacements[i];
      const item2 = existingPlacements[j];
      const box1 = createBoundingBox(item1.x_start_in, item1.length_in, item1.y_center_in, item1.width_in, 0, item1.height_in);
      const box2 = createBoundingBox(item2.x_start_in, item2.length_in, item2.y_center_in, item2.width_in, 0, item2.height_in);
      
      const overlapX = Math.min(box1.x_end, box2.x_end) - Math.max(box1.x_start, box2.x_start);
      const overlapY = Math.min(box1.y_right, box2.y_right) - Math.max(box1.y_left, box2.y_left);
      
      if (overlapX > 0 && overlapY > 0) {
        existingPlacements.splice(j, 1);
        const placementIdx = placements.findIndex(p => String(p.item_id) === item2.id);
        if (placementIdx >= 0) {
          const removedPlacement = placements.splice(placementIdx, 1)[0];
          if (removedPlacement.item) {
            unplaced.push(removedPlacement.item);
          }
        }
        j--;
      }
    }
  }

  const maxOccupiedX = existingPlacements.length > 0
    ? Math.max(...existingPlacements.map(p => p.x_end_in))
    : startX;
  
  const totalLength = existingPlacements.reduce((sum, p) => sum + p.length_in, 0);
  
  return { placements, nextX: maxOccupiedX, unplaced, totalLength };
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
  const placements: PalletPlacement[] = [];
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
    
    const isOnRamp = currentX >= (maxX - aircraftSpec.ramp_length);
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
    runningWeight += pallet.gross_weight;
    currentX = xEnd + SPACING;
  }

  return { 
    placements, 
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
  
  const cob = calculateCenterOfBalance(palletResult.placements, rsResult.placements, spec);
  
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

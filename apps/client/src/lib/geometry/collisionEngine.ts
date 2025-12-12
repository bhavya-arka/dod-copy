/**
 * Collision Engine for PACAF Cargo Load Planner
 * Provides AABB collision detection and non-overlapping placement algorithms
 */

import { PlacedCargo, AircraftGeometry, GeometryValidationIssue } from './types';

export interface BoundingBox3D {
  x_start: number;
  x_end: number;
  y_left: number;
  y_right: number;
  z_floor: number;
  z_top: number;
}

export interface CollisionResult {
  collides: boolean;
  overlap_x: number;
  overlap_y: number;
  overlap_z: number;
}

const MIN_LATERAL_CLEARANCE = 2;
const MIN_LONGITUDINAL_CLEARANCE = 4;

export function getBoundingBox(item: PlacedCargo): BoundingBox3D {
  return {
    x_start: item.x_start_in,
    x_end: item.x_end_in,
    y_left: item.y_left_in,
    y_right: item.y_right_in,
    z_floor: item.z_floor_in,
    z_top: item.z_top_in
  };
}

export function createBoundingBox(
  x_start: number,
  length: number,
  y_center: number,
  width: number,
  z_floor: number,
  height: number
): BoundingBox3D {
  const halfWidth = width / 2;
  return {
    x_start,
    x_end: x_start + length,
    y_left: y_center - halfWidth,
    y_right: y_center + halfWidth,
    z_floor,
    z_top: z_floor + height
  };
}

export function checkAABBCollision(box1: BoundingBox3D, box2: BoundingBox3D): CollisionResult {
  const xOverlap = Math.min(box1.x_end, box2.x_end) - Math.max(box1.x_start, box2.x_start);
  const yOverlap = Math.min(box1.y_right, box2.y_right) - Math.max(box1.y_left, box2.y_left);
  const zOverlap = Math.min(box1.z_top, box2.z_top) - Math.max(box1.z_floor, box2.z_floor);
  
  const collides = xOverlap > 0 && yOverlap > 0 && zOverlap > 0;
  
  return {
    collides,
    overlap_x: Math.max(0, xOverlap),
    overlap_y: Math.max(0, yOverlap),
    overlap_z: Math.max(0, zOverlap)
  };
}

export function checkItemCollision(item1: PlacedCargo, item2: PlacedCargo): CollisionResult {
  return checkAABBCollision(getBoundingBox(item1), getBoundingBox(item2));
}

export function collidesWithAny(newBox: BoundingBox3D, existingItems: PlacedCargo[]): boolean {
  for (const existing of existingItems) {
    const result = checkAABBCollision(newBox, getBoundingBox(existing));
    if (result.collides) {
      return true;
    }
  }
  return false;
}

export function collidesWithAnyWithClearance(
  newBox: BoundingBox3D, 
  existingItems: PlacedCargo[],
  lateralClearance: number = MIN_LATERAL_CLEARANCE,
  longitudinalClearance: number = MIN_LONGITUDINAL_CLEARANCE
): boolean {
  const expandedBox: BoundingBox3D = {
    x_start: newBox.x_start - longitudinalClearance,
    x_end: newBox.x_end + longitudinalClearance,
    y_left: newBox.y_left - lateralClearance,
    y_right: newBox.y_right + lateralClearance,
    z_floor: newBox.z_floor,
    z_top: newBox.z_top
  };
  
  return collidesWithAny(expandedBox, existingItems);
}

export function isWithinBounds(box: BoundingBox3D, aircraft: AircraftGeometry): boolean {
  const halfWidth = aircraft.max_half_width_in;
  const maxX = aircraft.bay_start_in + aircraft.cargo_length_in + aircraft.ramp_length_in;
  
  if (box.x_start < aircraft.bay_start_in) return false;
  if (box.x_end > maxX) return false;
  if (box.y_left < -halfWidth) return false;
  if (box.y_right > halfWidth) return false;
  
  const isOnRamp = box.x_start >= aircraft.ramp_start_in;
  const maxHeight = isOnRamp ? aircraft.ramp_height_in : aircraft.main_deck_height_in;
  if (box.z_top > maxHeight) return false;
  
  return true;
}

export interface PlacementCandidate {
  x_start: number;
  y_center: number;
  z_floor: number;
  fits: boolean;
  side: 'center' | 'left' | 'right';
}

export function findNonOverlappingPosition(
  length: number,
  width: number,
  height: number,
  existingItems: PlacedCargo[],
  aircraft: AircraftGeometry,
  options: {
    prefer_centerline?: boolean;
    start_x?: number;
    z_floor?: number;
    lateral_clearance?: number;
    longitudinal_clearance?: number;
  } = {}
): PlacementCandidate {
  const {
    prefer_centerline = true,
    start_x = aircraft.bay_start_in,
    z_floor = 0,
    lateral_clearance = MIN_LATERAL_CLEARANCE,
    longitudinal_clearance = MIN_LONGITUDINAL_CLEARANCE
  } = options;
  
  const halfWidth = width / 2;
  const halfAircraftWidth = aircraft.max_half_width_in;
  const maxX = aircraft.bay_start_in + aircraft.cargo_length_in;
  
  if (halfWidth > halfAircraftWidth) {
    return { x_start: start_x, y_center: 0, z_floor, fits: false, side: 'center' };
  }
  
  const sortedItems = [...existingItems].sort((a, b) => a.x_start_in - b.x_start_in);
  
  const candidatePositions: number[] = [start_x];
  
  for (const item of sortedItems) {
    const posAfterItem = item.x_end_in + longitudinal_clearance;
    if (posAfterItem >= start_x && posAfterItem + length <= maxX) {
      candidatePositions.push(posAfterItem);
    }
  }
  
  for (const x of candidatePositions) {
    if (x + length > maxX) continue;
    
    if (prefer_centerline) {
      const centerBox = createBoundingBox(x, length, 0, width, z_floor, height);
      if (isWithinBounds(centerBox, aircraft) && !collidesWithAnyWithClearance(centerBox, existingItems, lateral_clearance, longitudinal_clearance)) {
        return { x_start: x, y_center: 0, z_floor, fits: true, side: 'center' };
      }
    }
    
    const itemsInRange = sortedItems.filter(item => 
      item.x_start_in < x + length && item.x_end_in > x
    );
    
    if (itemsInRange.length === 0 && !prefer_centerline) {
      const centerBox = createBoundingBox(x, length, 0, width, z_floor, height);
      if (isWithinBounds(centerBox, aircraft)) {
        return { x_start: x, y_center: 0, z_floor, fits: true, side: 'center' };
      }
    }
    
    const leftmostItem = itemsInRange.reduce((min, item) => 
      item.y_left_in < min.y_left_in ? item : min, 
      { y_left_in: Infinity } as PlacedCargo
    );
    
    if (leftmostItem.y_left_in !== Infinity) {
      const leftYCenter = leftmostItem.y_left_in - lateral_clearance - halfWidth;
      const leftBox = createBoundingBox(x, length, leftYCenter, width, z_floor, height);
      
      if (isWithinBounds(leftBox, aircraft) && !collidesWithAnyWithClearance(leftBox, existingItems, lateral_clearance, longitudinal_clearance)) {
        return { x_start: x, y_center: leftYCenter, z_floor, fits: true, side: 'left' };
      }
    }
    
    const rightmostItem = itemsInRange.reduce((max, item) => 
      item.y_right_in > max.y_right_in ? item : max, 
      { y_right_in: -Infinity } as PlacedCargo
    );
    
    if (rightmostItem.y_right_in !== -Infinity) {
      const rightYCenter = rightmostItem.y_right_in + lateral_clearance + halfWidth;
      const rightBox = createBoundingBox(x, length, rightYCenter, width, z_floor, height);
      
      if (isWithinBounds(rightBox, aircraft) && !collidesWithAnyWithClearance(rightBox, existingItems, lateral_clearance, longitudinal_clearance)) {
        return { x_start: x, y_center: rightYCenter, z_floor, fits: true, side: 'right' };
      }
    }
    
    if (itemsInRange.length === 0) {
      const centerBox = createBoundingBox(x, length, 0, width, z_floor, height);
      if (isWithinBounds(centerBox, aircraft)) {
        return { x_start: x, y_center: 0, z_floor, fits: true, side: 'center' };
      }
    }
  }
  
  return { x_start: start_x, y_center: 0, z_floor, fits: false, side: 'center' };
}

export interface PlacementValidationResult {
  is_valid: boolean;
  collisions: Array<{ item1_id: string; item2_id: string; overlap: CollisionResult }>;
  bounds_violations: Array<{ item_id: string; violation: string }>;
  issues: GeometryValidationIssue[];
}

export function validatePlacement(
  items: PlacedCargo[],
  aircraft: AircraftGeometry
): PlacementValidationResult {
  const collisions: Array<{ item1_id: string; item2_id: string; overlap: CollisionResult }> = [];
  const bounds_violations: Array<{ item_id: string; violation: string }> = [];
  const issues: GeometryValidationIssue[] = [];
  
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const item1 = items[i];
      const item2 = items[j];
      
      if (item1.aircraft_id !== item2.aircraft_id) continue;
      
      const result = checkItemCollision(item1, item2);
      if (result.collides) {
        collisions.push({
          item1_id: item1.id,
          item2_id: item2.id,
          overlap: result
        });
        issues.push({
          code: 'COLLISION_DETECTED',
          message: `Collision: ${item1.description} overlaps with ${item2.description} (X:${result.overlap_x.toFixed(1)}", Y:${result.overlap_y.toFixed(1)}", Z:${result.overlap_z.toFixed(1)}")`,
          severity: 'error',
          item_ids: [item1.id, item2.id]
        });
      }
    }
  }
  
  for (const item of items) {
    const box = getBoundingBox(item);
    
    if (!isWithinBounds(box, aircraft)) {
      const halfWidth = aircraft.max_half_width_in;
      const maxX = aircraft.bay_start_in + aircraft.cargo_length_in + aircraft.ramp_length_in;
      
      const violations: string[] = [];
      if (box.x_start < aircraft.bay_start_in) {
        violations.push(`forward (${box.x_start.toFixed(1)}" < ${aircraft.bay_start_in}")`);
      }
      if (box.x_end > maxX) {
        violations.push(`aft (${box.x_end.toFixed(1)}" > ${maxX}")`);
      }
      if (box.y_left < -halfWidth) {
        violations.push(`left (${box.y_left.toFixed(1)}" < -${halfWidth}")`);
      }
      if (box.y_right > halfWidth) {
        violations.push(`right (${box.y_right.toFixed(1)}" > ${halfWidth}")`);
      }
      
      const isOnRamp = box.x_start >= aircraft.ramp_start_in;
      const maxHeight = isOnRamp ? aircraft.ramp_height_in : aircraft.main_deck_height_in;
      if (box.z_top > maxHeight) {
        violations.push(`height (${box.z_top.toFixed(1)}" > ${maxHeight}")`);
      }
      
      const violationStr = violations.join(', ');
      bounds_violations.push({ item_id: item.id, violation: violationStr });
      issues.push({
        code: 'BOUNDS_EXCEEDED',
        message: `${item.description} exceeds bounds: ${violationStr}`,
        severity: 'error',
        item_id: item.id
      });
    }
  }
  
  return {
    is_valid: collisions.length === 0 && bounds_violations.length === 0,
    collisions,
    bounds_violations,
    issues
  };
}

export function getOccupiedStations(
  existingItems: PlacedCargo[],
  stationRDLs: number[],
  palletLength: number = 108
): Set<number> {
  const occupied = new Set<number>();
  const halfLength = palletLength / 2;
  
  for (let i = 0; i < stationRDLs.length; i++) {
    const rdl = stationRDLs[i];
    const stationStart = rdl - halfLength;
    const stationEnd = rdl + halfLength;
    
    for (const item of existingItems) {
      if (item.x_start_in < stationEnd && item.x_end_in > stationStart) {
        occupied.add(i);
        break;
      }
    }
  }
  
  return occupied;
}

export function findFirstAvailableStation(
  existingItems: PlacedCargo[],
  stationRDLs: number[],
  palletLength: number = 108
): number {
  const occupied = getOccupiedStations(existingItems, stationRDLs, palletLength);
  
  for (let i = 0; i < stationRDLs.length; i++) {
    if (!occupied.has(i)) {
      return i;
    }
  }
  
  return -1;
}

/**
 * Cargo Placement Engine
 * Per lateral_placement_spec - Computes lateral and longitudinal positions
 */

import {
  PlacedCargo,
  AircraftGeometry,
  HeightZone,
  DeckType
} from './types';
import { CargoType, PALLET_463L, AircraftSpec, AIRCRAFT_SPECS } from '../pacafTypes';

const LATERAL_CLEARANCE_BUFFER = 2;
const LONGITUDINAL_CLEARANCE_BUFFER = 4;

export function createAircraftGeometry(spec: AircraftSpec): AircraftGeometry {
  return {
    type: spec.type,
    cargo_length_in: spec.cargo_length,
    cargo_width_in: spec.cargo_width,
    max_half_width_in: spec.cargo_width / 2,
    ramp_start_in: spec.cargo_length,
    ramp_length_in: spec.ramp_length,
    main_deck_height_in: spec.main_deck_height,
    ramp_height_in: spec.ramp_clearance_height,
    ref_rdl_in: 0,
    bay_start_in: 0,  // Solver uses 0-based coordinates; CG calculations use cargo_bay_fs_start separately
    bay_length_in: spec.cargo_length,
    cob_min_percent: spec.cob_min_percent,
    cob_max_percent: spec.cob_max_percent,
    mac_length: spec.mac_length,
    lemac_station: spec.lemac_station
  };
}

export function createHeightZones(spec: AircraftSpec): HeightZone[] {
  const zones: HeightZone[] = [];
  
  // All dimensions in solver coordinates (0-based from cargo bay start)
  const mainDeckEnd = spec.cargo_length - spec.ramp_length;
  
  zones.push({
    x_start_in: 0,
    x_end_in: mainDeckEnd,
    max_height_in: spec.main_deck_height,
    zone_name: 'Main Deck'
  });

  // Ramp zone (if aircraft has ramp)
  if (spec.ramp_length > 0) {
    zones.push({
      x_start_in: mainDeckEnd,
      x_end_in: spec.cargo_length,
      max_height_in: spec.ramp_clearance_height,
      zone_name: 'Ramp'
    });
  }

  return zones;
}

export function createPlacedCargo(
  id: string,
  description: string,
  length_in: number,
  width_in: number,
  height_in: number,
  weight_lb: number,
  cargo_type: CargoType,
  aircraft_id: string,
  x_start_in: number,
  y_center_in: number,
  z_floor_in: number = 0,
  lead_tcn: string | null = null,
  is_hazardous: boolean = false
): PlacedCargo {
  const halfWidth = width_in / 2;
  const deck: DeckType = z_floor_in > 0 ? 'RAMP' : 'MAIN';

  return {
    id,
    lead_tcn,
    description,
    length_in,
    width_in,
    height_in,
    weight_lb,
    cargo_type,
    aircraft_id,
    deck,
    x_start_in,
    y_center_in,
    z_floor_in,
    x_end_in: x_start_in + length_in,
    y_left_in: y_center_in - halfWidth,
    y_right_in: y_center_in + halfWidth,
    z_top_in: z_floor_in + height_in,
    is_hazardous
  };
}

export interface LateralPlacementOptions {
  prefer_centerline: boolean;
  allow_side_by_side: boolean;
  min_lateral_gap: number;
}

const DEFAULT_PLACEMENT_OPTIONS: LateralPlacementOptions = {
  prefer_centerline: true,
  allow_side_by_side: true,
  min_lateral_gap: LATERAL_CLEARANCE_BUFFER
};

export function computeLateralPosition(
  item_width: number,
  cargo_type: CargoType,
  existing_items: PlacedCargo[],
  x_start: number,
  x_end: number,
  aircraft: AircraftGeometry,
  options: LateralPlacementOptions = DEFAULT_PLACEMENT_OPTIONS
): { y_center: number; fits: boolean; side: 'center' | 'left' | 'right' } {
  const halfItemWidth = item_width / 2;
  const minGap = options.min_lateral_gap;
  
  const itemsInRange = existing_items.filter(e => 
    e.x_start_in < x_end && e.x_end_in > x_start
  );

  if (itemsInRange.length === 0) {
    if (halfItemWidth <= aircraft.max_half_width_in) {
      return { y_center: 0, fits: true, side: 'center' };
    }
    return { y_center: 0, fits: false, side: 'center' };
  }

  if (options.prefer_centerline) {
    const centerConflict = itemsInRange.some(e => {
      const newLeft = -halfItemWidth;
      const newRight = halfItemWidth;
      const overlap = Math.min(e.y_right_in, newRight) - Math.max(e.y_left_in, newLeft);
      return overlap > -minGap;
    });

    if (!centerConflict) {
      return { y_center: 0, fits: true, side: 'center' };
    }
  }

  if (options.allow_side_by_side) {
    const sortedItems = [...itemsInRange].sort((a, b) => a.y_center_in - b.y_center_in);
    
    const leftCenter = (sortedItems[0].y_left_in - minGap) - halfItemWidth;
    const leftLeftEdge = leftCenter - halfItemWidth;
    const leftRightEdge = leftCenter + halfItemWidth;
    
    const leftFitsInFuselage = leftLeftEdge >= -aircraft.max_half_width_in;
    const leftClearsNeighbor = leftRightEdge + minGap <= sortedItems[0].y_left_in;
    
    if (leftFitsInFuselage && leftClearsNeighbor) {
      return { y_center: leftCenter, fits: true, side: 'left' };
    }
    
    const rightmostItem = sortedItems[sortedItems.length - 1];
    const rightCenter = (rightmostItem.y_right_in + minGap) + halfItemWidth;
    const rightLeftEdge = rightCenter - halfItemWidth;
    const rightRightEdge = rightCenter + halfItemWidth;
    
    const rightFitsInFuselage = rightRightEdge <= aircraft.max_half_width_in;
    const rightClearsNeighbor = rightLeftEdge - minGap >= rightmostItem.y_right_in;
    
    if (rightFitsInFuselage && rightClearsNeighbor) {
      return { y_center: rightCenter, fits: true, side: 'right' };
    }
  }

  return { y_center: 0, fits: false, side: 'center' };
}

export function findNextLongitudinalPosition(
  item_length: number,
  item_width: number,
  existing_items: PlacedCargo[],
  aircraft: AircraftGeometry,
  start_x: number = 0  // Solver uses 0-based coordinates
): { x_start: number; fits: boolean } {
  const sortedByX = [...existing_items]
    .filter(e => e.aircraft_id === existing_items[0]?.aircraft_id)
    .sort((a, b) => a.x_start_in - b.x_start_in);

  if (sortedByX.length === 0) {
    const maxX = aircraft.bay_start_in + aircraft.cargo_length_in + aircraft.ramp_length_in;
    if (start_x + item_length <= maxX) {
      return { x_start: start_x, fits: true };
    }
    return { x_start: start_x, fits: false };
  }

  const lastItem = sortedByX[sortedByX.length - 1];
  const nextX = lastItem.x_end_in + LONGITUDINAL_CLEARANCE_BUFFER;
  
  const maxX = aircraft.bay_start_in + aircraft.cargo_length_in + aircraft.ramp_length_in;
  if (nextX + item_length <= maxX) {
    return { x_start: nextX, fits: true };
  }

  return { x_start: nextX, fits: false };
}

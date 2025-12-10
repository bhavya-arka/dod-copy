/**
 * Geometry Module Types
 * Per lateral_placement_spec - PlacedCargo and validation types
 */

import { CargoType, AircraftType } from '../pacafTypes';

export type DeckType = 'MAIN' | 'RAMP';

export interface PlacedCargo {
  id: string;
  lead_tcn: string | null;
  description: string;

  length_in: number;
  width_in: number;
  height_in: number;
  weight_lb: number;

  cargo_type: CargoType;

  aircraft_id: string;
  deck: DeckType;
  x_start_in: number;
  y_center_in: number;
  z_floor_in: number;

  x_end_in: number;
  y_left_in: number;
  y_right_in: number;
  z_top_in: number;

  is_hazardous?: boolean;
  scg_code?: string;
}

export interface AircraftGeometry {
  type: AircraftType;
  cargo_length_in: number;
  cargo_width_in: number;
  max_half_width_in: number;
  ramp_start_in: number;
  ramp_length_in: number;
  
  main_deck_height_in: number;
  ramp_height_in: number;
  
  ref_rdl_in: number;
  bay_start_in: number;
  bay_length_in: number;
  
  cob_min_percent: number;
  cob_max_percent: number;
  mac_length: number;
  lemac_station: number;
}

export interface HeightZone {
  x_start_in: number;
  x_end_in: number;
  max_height_in: number;
  zone_name: string;
}

export type ValidationSeverity = 'error' | 'warning';

export interface GeometryValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  item_id?: string;
  item_ids?: string[];
}

export interface CoBResult {
  total_weight: number;
  total_moment: number;
  cob_arm_in: number;
  cob_percent: number;
  in_envelope: boolean;
  envelope_status: 'in_envelope' | 'forward_limit' | 'aft_limit';
  envelope_deviation: number;
}

export interface PlacementResult {
  placed_cargo: PlacedCargo[];
  issues: GeometryValidationIssue[];
  cob: CoBResult;
  is_valid: boolean;
}

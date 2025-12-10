/**
 * PACAF Airlift Demo - Flight Split Types
 * Types for splitting flights and redistributing cargo between aircraft.
 */

import { Pallet463L, MovementItem, AircraftLoadPlan, PalletPlacement, VehiclePlacement } from './pacafTypes';
import { MilitaryBase } from './routeTypes';

export interface SplitFlight {
  id: string;
  parent_flight_id: string;
  callsign: string;
  aircraft_type: 'C-17' | 'C-130';
  aircraft_id: string;
  origin: MilitaryBase;
  destination: MilitaryBase;
  scheduled_departure: Date;
  scheduled_arrival: Date;
  estimated_delay_minutes: number;
  pallets: PalletPlacement[];
  rolling_stock: VehiclePlacement[];
  pax_count: number;
  total_weight_lb: number;
  center_of_balance_percent: number;
  weather_warnings: WeatherWarning[];
  is_modified: boolean;
}

export interface WeatherWarning {
  id: string;
  severity: 'info' | 'caution' | 'warning' | 'critical';
  type: 'wind' | 'visibility' | 'icing' | 'turbulence' | 'thunderstorm' | 'delay';
  title: string;
  description: string;
  estimated_delay_minutes?: number;
  affected_leg?: string;
  recommendation?: string;
}

export interface FlightSplitState {
  original_load_plan: AircraftLoadPlan;
  split_flights: SplitFlight[];
  unassigned_pallets: Pallet463L[];
  unassigned_vehicles: MovementItem[];
  total_weight_original: number;
  total_weight_distributed: number;
}

export interface DragItem {
  id: string;
  type: 'pallet' | 'vehicle';
  source_flight_id: string;
  data: PalletPlacement | VehiclePlacement;
}

export interface DropTarget {
  flight_id: string;
  position?: number;
}

export interface FlightSplitAction {
  type: 'MOVE_PALLET' | 'MOVE_VEHICLE' | 'CREATE_SPLIT' | 'MERGE_FLIGHTS' | 'UPDATE_SCHEDULE';
  payload: {
    item_id?: string;
    source_flight_id?: string;
    target_flight_id?: string;
    new_departure?: Date;
    new_destination?: MilitaryBase;
  };
}

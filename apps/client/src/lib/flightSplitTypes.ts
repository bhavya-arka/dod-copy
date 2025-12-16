/**
 * PACAF Airlift Demo - Flight Split Types
 * Types for splitting flights and redistributing cargo between aircraft.
 */

import { Pallet463L, MovementItem, AircraftLoadPlan, PalletPlacement, VehiclePlacement, AIRCRAFT_SPECS, getRDLDistance } from './pacafTypes';
import { MilitaryBase, ScheduledFlight } from './routeTypes';

export interface SplitFlight {
  id: string;
  parent_flight_id: string;
  callsign: string;
  display_name?: string;
  aircraft_type: 'C-17' | 'C-130';
  aircraft_id: string;
  origin: MilitaryBase;
  destination: MilitaryBase;
  waypoints?: MilitaryBase[];
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

export function calculateFlightWeight(flight: SplitFlight): number {
  const palletWeight = flight.pallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0);
  const vehicleWeight = flight.rolling_stock.reduce((sum, v) => sum + v.weight, 0);
  const paxWeight = flight.pax_count * 225; // Standard pax weight with gear
  return palletWeight + vehicleWeight + paxWeight;
}

export function validateFlightLoad(flight: SplitFlight): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const weight = calculateFlightWeight(flight);
  
  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
  const maxPallets = flight.aircraft_type === 'C-17' ? 18 : 6;
  const cobMin = flight.aircraft_type === 'C-17' ? 20 : 18;
  const cobMax = flight.aircraft_type === 'C-17' ? 35 : 33;
  
  if (weight > maxPayload) {
    issues.push(`Overweight: ${weight.toLocaleString()} lbs exceeds ${maxPayload.toLocaleString()} lbs max`);
  }
  
  if (flight.pallets.length > maxPallets) {
    issues.push(`Too many pallets: ${flight.pallets.length} exceeds ${maxPallets} positions`);
  }
  
  if (flight.center_of_balance_percent < cobMin || flight.center_of_balance_percent > cobMax) {
    issues.push(`Center of balance ${flight.center_of_balance_percent.toFixed(1)}% outside safe envelope (${cobMin}-${cobMax}%)`);
  }
  
  return { valid: issues.length === 0, issues };
}

export function calculateCenterOfBalance(flight: SplitFlight): number {
  if (flight.pallets.length === 0 && flight.rolling_stock.length === 0) {
    return 27.5; // Default center
  }
  
  let totalMoment = 0;
  let totalWeight = 0;
  const spec = AIRCRAFT_SPECS[flight.aircraft_type];
  
  // Pallet position_coord is cargo-relative center position, convert to station using cargo_bay_fs_start
  // (calibrated FS datum for CG calculations, consistent with aircraftSolver)
  flight.pallets.forEach((placement) => {
    const palletStation = placement.position_coord + spec.cargo_bay_fs_start;
    totalMoment += placement.pallet.gross_weight * palletStation;
    totalWeight += placement.pallet.gross_weight;
  });
  
  // Vehicle position.z is cargo-relative center, convert to station using cargo_bay_fs_start
  // (calibrated FS datum for CG calculations, consistent with aircraftSolver)
  flight.rolling_stock.forEach((vehicle) => {
    const vehicleStation = vehicle.position.z + spec.cargo_bay_fs_start;
    totalMoment += vehicle.weight * vehicleStation;
    totalWeight += vehicle.weight;
  });
  
  // Add PAX weight if present (seated at ~40% of cargo length from cargo bay start)
  // Add 50" for half of the 100" seating zone to match solver calculation
  if (flight.pax_count > 0) {
    const paxWeight = flight.pax_count * 225; // Standard pax weight with gear
    const paxSeatingZoneCenter = (spec.cargo_length * 0.4) + 50; // +50" = half of 100" seating zone
    const paxStation = spec.cargo_bay_fs_start + paxSeatingZoneCenter;
    totalMoment += paxWeight * paxStation;
    totalWeight += paxWeight;
  }
  
  if (totalWeight === 0) return 27.5;
  
  // Calculate CG station (inches from aircraft datum)
  const cgStation = totalMoment / totalWeight;
  
  // Calculate CoB as percentage of MAC using correct formula
  // CoB% = ((CG Station - LEMAC) / MAC Length) × 100
  const cobPercent = ((cgStation - spec.lemac_station) / spec.mac_length) * 100;
  
  // Clamp to 0-100% for display
  return Math.max(0, Math.min(100, cobPercent));
}

export function estimateWeatherDelay(
  flight: SplitFlight, 
  weatherSystems: Array<{ severity: string; affects_flight_ops: boolean }>
): number {
  let delay = 0;
  
  for (const wx of weatherSystems) {
    if (!wx.affects_flight_ops) continue;
    
    switch (wx.severity) {
      case 'minor':
        delay += 15;
        break;
      case 'moderate':
        delay += 45;
        break;
      case 'severe':
        delay += 120;
        break;
    }
  }
  
  return delay;
}

/**
 * Reoptimizes pallet placement for better center of balance
 * Uses station-based RDL distances for accurate position calculations
 */
export function reoptimizePalletPlacement(flight: SplitFlight): SplitFlight {
  if (flight.pallets.length === 0) return flight;
  
  const spec = AIRCRAFT_SPECS[flight.aircraft_type];
  const stations = spec.stations;
  const maxMainPositions = flight.aircraft_type === 'C-17' ? 16 : 5;
  const cargoLength = spec.cargo_length;
  const cobMin = spec.cob_min_percent;
  const cobMax = spec.cob_max_percent;
  const targetCob = (cobMin + cobMax) / 2;
  const targetPosition = (targetCob / 100) * cargoLength;
  
  const sortedPallets = [...flight.pallets].sort((a, b) => 
    b.pallet.gross_weight - a.pallet.gross_weight
  );
  
  const numPallets = sortedPallets.length;
  const maxPositions = Math.min(numPallets, stations.length);
  
  // Find center position index based on target CoB position
  const centerPositionIdx = stations.findIndex(s => s.rdl_distance >= targetPosition);
  const actualCenterIdx = centerPositionIdx >= 0 ? centerPositionIdx : Math.floor(stations.length / 2);
  
  const selectedIndices: number[] = [];
  let left = actualCenterIdx;
  let right = actualCenterIdx + 1;
  let useLeft = true;
  
  while (selectedIndices.length < maxPositions) {
    if (useLeft && left >= 0) {
      selectedIndices.push(left);
      left--;
    } else if (!useLeft && right < stations.length) {
      selectedIndices.push(right);
      right++;
    } else if (left >= 0) {
      selectedIndices.push(left);
      left--;
    } else if (right < stations.length) {
      selectedIndices.push(right);
      right++;
    } else {
      break;
    }
    useLeft = !useLeft;
  }
  
  selectedIndices.sort((a, b) => a - b);
  
  const optimizedPlacements: PalletPlacement[] = [];
  
  for (let i = 0; i < numPallets && i < selectedIndices.length; i++) {
    const posIdx = selectedIndices[i];
    const station = stations[posIdx];
    const pallet = sortedPallets[i];
    
    optimizedPlacements.push({
      pallet: { ...pallet.pallet },
      position_index: posIdx,
      position_coord: station.rdl_distance,
      is_ramp: station.is_ramp
    });
  }
  
  optimizedPlacements.sort((a, b) => a.position_index - b.position_index);
  
  const optimizedFlight: SplitFlight = {
    ...flight,
    pallets: optimizedPlacements,
    is_modified: true
  };
  
  optimizedFlight.total_weight_lb = calculateFlightWeight(optimizedFlight);
  optimizedFlight.center_of_balance_percent = calculateCenterOfBalance(optimizedFlight);
  
  return optimizedFlight;
}

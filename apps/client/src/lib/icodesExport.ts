/**
 * ICODES-Compatible Export Module
 * Generates DoD/DLA standard-compliant load plan exports for A2I/SAAM integration
 * 
 * Supports:
 * - ICODES 7.x compatible JSON structure
 * - A2I bundle format with summary, per-aircraft plans, and documentation
 * - SAAM-compatible manifest exports
 */

import {
  AircraftLoadPlan,
  AllocationResult,
  AircraftSpec,
  PalletPlacement,
  VehiclePlacement,
  AIRCRAFT_SPECS,
  PALLET_463L
} from './pacafTypes';
import { SplitFlight, calculateFlightWeight, calculateCenterOfBalance } from './flightSplitTypes';
import { formatMilitaryTime } from './routeCalculations';

// ============================================================================
// ICODES STANDARD DATA STRUCTURES
// ============================================================================

export interface ICODESHeader {
  format_version: string;
  generated_date: string;
  generated_time_zulu: string;
  classification: string;
  originator: string;
  mission_id: string;
  exercise_name?: string;
}

export interface ICODESAircraftRecord {
  aircraft_id: string;
  aircraft_type: string;
  tail_number?: string;
  mission_design_series: string;
  cargo_configuration: 'PALLET' | 'MIXED' | 'AIRDROP' | 'PAX';
}

export interface ICODESStationData {
  station_number: number;
  station_location_inches: number;
  is_ramp: boolean;
  occupied: boolean;
  cargo_type: 'PALLET' | 'ROLLING_STOCK' | 'EMPTY';
  weight_lb: number;
  max_weight_lb: number;
}

export interface ICODESPalletRecord {
  pallet_id: string;
  station_number: number;
  station_location_inches: number;
  gross_weight_lb: number;
  net_weight_lb: number;
  tare_weight_lb: number;
  height_inches: number;
  hazmat_class?: string;
  hazmat_un_number?: string;
  compatibility_group?: string;
  shipper_tcn?: string;
  consignee?: string;
  priority: number;
  item_count: number;
  items: ICODESCargoItem[];
}

export interface ICODESCargoItem {
  item_id: string;
  description: string;
  quantity: number;
  weight_each_lb: number;
  total_weight_lb: number;
  length_in: number;
  width_in: number;
  height_in: number;
  hazmat_flag: boolean;
  advon_flag: boolean;
}

export interface ICODESVehicleRecord {
  vehicle_id: string;
  description: string;
  station_range: { start: number; end: number };
  position_inches: number;
  weight_lb: number;
  length_in: number;
  width_in: number;
  height_in: number;
  axle_count: number;
  axle_weights_lb: number[];
  axle_spacing_in: number[];
  tire_pressure_psi?: number;
  hazmat_flag: boolean;
  tiedown_count: number;
  shoring_required: boolean;
}

export interface ICODESBalanceData {
  total_cargo_weight_lb: number;
  empty_weight_lb: number;
  fuel_weight_lb: number;
  gross_weight_lb: number;
  center_of_gravity_inches: number;
  center_of_gravity_percent: number;
  forward_limit_percent: number;
  aft_limit_percent: number;
  within_envelope: boolean;
  mac_percent?: number;
}

export interface ICODESLoadPlan {
  header: ICODESHeader;
  aircraft: ICODESAircraftRecord;
  station_data: ICODESStationData[];
  pallets: ICODESPalletRecord[];
  vehicles: ICODESVehicleRecord[];
  passengers: {
    total_count: number;
    weight_lb: number;
    seating_configuration: string;
  };
  balance: ICODESBalanceData;
  summary: {
    total_positions_used: number;
    total_positions_available: number;
    utilization_percent: number;
    total_cargo_weight_lb: number;
    payload_capacity_lb: number;
    payload_used_percent: number;
  };
  remarks: string[];
  warnings: string[];
}

// ============================================================================
// A2I BUNDLE STRUCTURE
// ============================================================================

export interface A2IBundleSummary {
  bundle_id: string;
  generated_date: string;
  mission_id: string;
  classification: string;
  aircraft_summary: {
    total_aircraft: number;
    by_type: Record<string, number>;
    advon_count: number;
    main_count: number;
  };
  cargo_summary: {
    total_weight_lb: number;
    total_pallets: number;
    total_vehicles: number;
    total_pax: number;
    hazmat_present: boolean;
  };
  utilization_metrics: {
    average_acl_percent: number;
    min_acl_percent: number;
    max_acl_percent: number;
    underutilized_count: number;
  };
  validation: {
    all_plans_valid: boolean;
    cob_violations: number;
    weight_violations: number;
    warnings_count: number;
  };
}

export interface A2IRisksDocument {
  generated_date: string;
  mission_id: string;
  hazmat_items: {
    item_id: string;
    description: string;
    hazmat_class: string;
    aircraft_id: string;
    notes: string;
  }[];
  pax_hazmat_conflicts: string[];
  underutilized_sorties: {
    aircraft_id: string;
    utilization_percent: number;
    recommendation: string;
  }[];
  cob_concerns: {
    aircraft_id: string;
    cob_percent: number;
    status: string;
  }[];
  general_warnings: string[];
}

export interface A2IBundle {
  summary: A2IBundleSummary;
  load_plans: ICODESLoadPlan[];
  risks_and_warnings: A2IRisksDocument;
  manifest_csv: string;
}

// ============================================================================
// SERIALIZATION FUNCTIONS
// ============================================================================

function generateMissionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toISOString().slice(11, 16).replace(':', '');
  return `ARKA-${dateStr}-${timeStr}`;
}

function getCurrentZuluTime(): string {
  return new Date().toISOString().slice(11, 16).replace(':', '') + 'Z';
}

function getCurrentDateISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getHazmatClass(item: { hazmat_flag: boolean }): string | undefined {
  return item.hazmat_flag ? '1.4' : undefined;
}

function palletToICODES(placement: PalletPlacement, stationNumber: number): ICODESPalletRecord {
  const pallet = placement.pallet;
  return {
    pallet_id: pallet.id,
    station_number: stationNumber,
    station_location_inches: placement.position_coord,
    gross_weight_lb: Math.round(pallet.gross_weight),
    net_weight_lb: Math.round(pallet.net_weight),
    tare_weight_lb: PALLET_463L.tare_with_nets,
    height_inches: Math.round(pallet.height),
    hazmat_class: pallet.hazmat_flag ? '1.4' : undefined,
    priority: 1,
    item_count: pallet.items.length,
    items: pallet.items.map(item => ({
      item_id: String(item.item_id),
      description: item.description,
      quantity: item.quantity,
      weight_each_lb: Math.round(item.weight_each_lb),
      total_weight_lb: Math.round(item.weight_each_lb * item.quantity),
      length_in: Math.round(item.length_in),
      width_in: Math.round(item.width_in),
      height_in: Math.round(item.height_in),
      hazmat_flag: item.hazmat_flag,
      advon_flag: item.advon_flag
    }))
  };
}

function vehicleToICODES(vehicle: VehiclePlacement): ICODESVehicleRecord {
  const axleSpacing = vehicle.axle_weights.length > 1 
    ? vehicle.axle_weights.slice(1).map(() => 60)
    : [];
  
  return {
    vehicle_id: String(vehicle.item_id),
    description: vehicle.item.description,
    station_range: {
      start: Math.round(vehicle.position.z - vehicle.length / 2),
      end: Math.round(vehicle.position.z + vehicle.length / 2)
    },
    position_inches: Math.round(vehicle.position.z),
    weight_lb: Math.round(vehicle.weight),
    length_in: Math.round(vehicle.length),
    width_in: Math.round(vehicle.width),
    height_in: Math.round(vehicle.height),
    axle_count: vehicle.axle_weights.length || 2,
    axle_weights_lb: vehicle.axle_weights.length > 0 
      ? vehicle.axle_weights.map(w => Math.round(w))
      : [Math.round(vehicle.weight / 2), Math.round(vehicle.weight / 2)],
    axle_spacing_in: axleSpacing,
    hazmat_flag: vehicle.item.hazmat_flag,
    tiedown_count: Math.ceil(vehicle.weight / 5000) * 2,
    shoring_required: vehicle.weight > 15000
  };
}

function generateStationData(spec: AircraftSpec, pallets: PalletPlacement[], vehicles: VehiclePlacement[]): ICODESStationData[] {
  const stations: ICODESStationData[] = [];
  
  for (let i = 0; i < spec.pallet_positions; i++) {
    const isRamp = spec.ramp_positions.includes(i + 1);
    const placement = pallets.find(p => p.position_index === i);
    const maxWeight = isRamp ? spec.ramp_position_weight : spec.per_position_weight;
    
    const station = spec.stations[i];
    stations.push({
      station_number: i + 1,
      station_location_inches: station?.rdl_distance || 0,
      is_ramp: isRamp,
      occupied: !!placement,
      cargo_type: placement ? 'PALLET' : 'EMPTY',
      weight_lb: placement ? Math.round(placement.pallet.gross_weight) : 0,
      max_weight_lb: maxWeight
    });
  }
  
  return stations;
}

export function loadPlanToICODES(loadPlan: AircraftLoadPlan, missionId?: string): ICODESLoadPlan {
  const spec = loadPlan.aircraft_spec;
  const now = new Date();
  
  const header: ICODESHeader = {
    format_version: '7.2',
    generated_date: getCurrentDateISO(),
    generated_time_zulu: getCurrentZuluTime(),
    classification: 'UNCLASSIFIED',
    originator: 'ARKA-PACAF-DEMO',
    mission_id: missionId || generateMissionId()
  };
  
  const aircraft: ICODESAircraftRecord = {
    aircraft_id: loadPlan.aircraft_id,
    aircraft_type: loadPlan.aircraft_type,
    mission_design_series: loadPlan.aircraft_type === 'C-17' ? 'C-17A' : 'C-130J',
    cargo_configuration: loadPlan.rolling_stock.length > 0 ? 'MIXED' : 'PALLET'
  };
  
  const stationData = generateStationData(spec, loadPlan.pallets, loadPlan.rolling_stock);
  
  const pallets = loadPlan.pallets.map((p, idx) => 
    palletToICODES(p, p.position_index + 1)
  );
  
  const vehicles = loadPlan.rolling_stock.map(v => vehicleToICODES(v));
  
  const hasHazmat = loadPlan.pallets.some(p => p.pallet.hazmat_flag) ||
    loadPlan.rolling_stock.some(v => v.item.hazmat_flag);
  
  const balance: ICODESBalanceData = {
    total_cargo_weight_lb: Math.round(loadPlan.total_weight),
    empty_weight_lb: 0,
    fuel_weight_lb: 0,
    gross_weight_lb: Math.round(loadPlan.total_weight),
    center_of_gravity_inches: Math.round(loadPlan.center_of_balance),
    center_of_gravity_percent: Math.round(loadPlan.cob_percent * 10) / 10,
    forward_limit_percent: spec.cob_min_percent,
    aft_limit_percent: spec.cob_max_percent,
    within_envelope: loadPlan.cob_in_envelope
  };
  
  const warnings: string[] = [];
  if (!loadPlan.cob_in_envelope) {
    warnings.push(`CENTER OF BALANCE ${loadPlan.cob_percent.toFixed(1)}% OUTSIDE ENVELOPE (${spec.cob_min_percent}-${spec.cob_max_percent}%)`);
  }
  if (hasHazmat) {
    warnings.push('HAZARDOUS MATERIALS ABOARD - SEE PALLET MANIFEST FOR DETAILS');
  }
  if (loadPlan.payload_used_percent > 95) {
    warnings.push('AIRCRAFT AT >95% PAYLOAD CAPACITY');
  }
  
  return {
    header,
    aircraft,
    station_data: stationData,
    pallets,
    vehicles,
    passengers: {
      total_count: loadPlan.pax_count,
      weight_lb: loadPlan.pax_count * 225,
      seating_configuration: loadPlan.pax_count > 0 ? 'SIDEWALL' : 'NONE'
    },
    balance,
    summary: {
      total_positions_used: loadPlan.positions_used,
      total_positions_available: loadPlan.positions_available,
      utilization_percent: Math.round(loadPlan.utilization_percent * 10) / 10,
      total_cargo_weight_lb: Math.round(loadPlan.total_weight),
      payload_capacity_lb: spec.max_payload,
      payload_used_percent: Math.round(loadPlan.payload_used_percent * 10) / 10
    },
    remarks: [
      `Phase: ${loadPlan.phase}`,
      `Sequence: ${loadPlan.sequence}`,
      `Generated by ARKA PACAF Demo`
    ],
    warnings
  };
}

export function splitFlightToICODES(flight: SplitFlight, missionId?: string): ICODESLoadPlan {
  const recalcWeight = calculateFlightWeight(flight);
  const recalcCoB = calculateCenterOfBalance(flight);
  const spec = AIRCRAFT_SPECS[flight.aircraft_type];
  
  const header: ICODESHeader = {
    format_version: '7.2',
    generated_date: getCurrentDateISO(),
    generated_time_zulu: getCurrentZuluTime(),
    classification: 'UNCLASSIFIED',
    originator: 'ARKA-PACAF-DEMO',
    mission_id: missionId || generateMissionId()
  };
  
  const aircraft: ICODESAircraftRecord = {
    aircraft_id: flight.callsign,
    aircraft_type: flight.aircraft_type,
    mission_design_series: flight.aircraft_type === 'C-17' ? 'C-17A' : 'C-130J',
    cargo_configuration: 'PALLET'
  };
  
  const stationData = generateStationData(spec, flight.pallets, []);
  
  const pallets = flight.pallets.map((p, idx) => 
    palletToICODES(p, p.position_index + 1)
  );
  
  const hasHazmat = flight.pallets.some(p => p.pallet.hazmat_flag);
  
  const cobPercent = recalcCoB;
  const inEnvelope = cobPercent >= spec.cob_min_percent && cobPercent <= spec.cob_max_percent;
  
  const balance: ICODESBalanceData = {
    total_cargo_weight_lb: Math.round(recalcWeight),
    empty_weight_lb: 0,
    fuel_weight_lb: 0,
    gross_weight_lb: Math.round(recalcWeight),
    center_of_gravity_inches: Math.round((cobPercent / 100) * spec.cargo_length),
    center_of_gravity_percent: Math.round(cobPercent * 10) / 10,
    forward_limit_percent: spec.cob_min_percent,
    aft_limit_percent: spec.cob_max_percent,
    within_envelope: inEnvelope
  };
  
  const payloadPercent = (recalcWeight / spec.max_payload) * 100;
  
  const warnings: string[] = [];
  if (!inEnvelope) {
    warnings.push(`CENTER OF BALANCE ${cobPercent.toFixed(1)}% OUTSIDE ENVELOPE (${spec.cob_min_percent}-${spec.cob_max_percent}%)`);
  }
  if (hasHazmat) {
    warnings.push('HAZARDOUS MATERIALS ABOARD - SEE PALLET MANIFEST FOR DETAILS');
  }
  if (recalcWeight > spec.max_payload) {
    warnings.push(`AIRCRAFT OVERWEIGHT: ${recalcWeight.toLocaleString()} LB EXCEEDS ${spec.max_payload.toLocaleString()} LB LIMIT`);
  }
  
  return {
    header,
    aircraft,
    station_data: stationData,
    pallets,
    vehicles: [],
    passengers: {
      total_count: flight.pax_count || 0,
      weight_lb: (flight.pax_count || 0) * 225,
      seating_configuration: flight.pax_count ? 'SIDEWALL' : 'NONE'
    },
    balance,
    summary: {
      total_positions_used: flight.pallets.length,
      total_positions_available: spec.pallet_positions,
      utilization_percent: Math.round((flight.pallets.length / spec.pallet_positions) * 100 * 10) / 10,
      total_cargo_weight_lb: Math.round(recalcWeight),
      payload_capacity_lb: spec.max_payload,
      payload_used_percent: Math.round(payloadPercent * 10) / 10
    },
    remarks: [
      `Callsign: ${flight.callsign}`,
      `Route: ${flight.origin.icao} → ${flight.destination.icao}`,
      `Departure: ${formatMilitaryTime(flight.scheduled_departure)}`,
      `Generated by ARKA PACAF Demo`
    ],
    warnings
  };
}

// ============================================================================
// A2I BUNDLE GENERATION
// ============================================================================

export function generateA2IBundle(
  allocationResult: AllocationResult,
  splitFlights?: SplitFlight[]
): A2IBundle {
  const missionId = generateMissionId();
  const now = new Date();
  
  const icodesPlans = allocationResult.load_plans.map(plan => 
    loadPlanToICODES(plan, missionId)
  );
  
  const hasHazmat = allocationResult.load_plans.some(plan =>
    plan.pallets.some(p => p.pallet.hazmat_flag) ||
    plan.rolling_stock.some(v => v.item.hazmat_flag)
  );
  
  const utilizationPercents = allocationResult.load_plans.map(p => p.payload_used_percent);
  const avgUtil = utilizationPercents.length > 0 
    ? utilizationPercents.reduce((a, b) => a + b, 0) / utilizationPercents.length 
    : 0;
  
  const underutilizedCount = utilizationPercents.filter(u => u < 50).length;
  const cobViolations = allocationResult.load_plans.filter(p => !p.cob_in_envelope).length;
  const weightViolations = allocationResult.load_plans.filter(p => p.payload_used_percent > 100).length;
  
  const summary: A2IBundleSummary = {
    bundle_id: missionId,
    generated_date: now.toISOString(),
    mission_id: missionId,
    classification: 'UNCLASSIFIED',
    aircraft_summary: {
      total_aircraft: allocationResult.total_aircraft,
      by_type: { [allocationResult.aircraft_type]: allocationResult.total_aircraft },
      advon_count: allocationResult.advon_aircraft,
      main_count: allocationResult.main_aircraft
    },
    cargo_summary: {
      total_weight_lb: allocationResult.total_weight,
      total_pallets: allocationResult.total_pallets,
      total_vehicles: allocationResult.total_rolling_stock,
      total_pax: allocationResult.total_pax,
      hazmat_present: hasHazmat
    },
    utilization_metrics: {
      average_acl_percent: Math.round(avgUtil * 10) / 10,
      min_acl_percent: Math.round(Math.min(...utilizationPercents) * 10) / 10,
      max_acl_percent: Math.round(Math.max(...utilizationPercents) * 10) / 10,
      underutilized_count: underutilizedCount
    },
    validation: {
      all_plans_valid: cobViolations === 0 && weightViolations === 0,
      cob_violations: cobViolations,
      weight_violations: weightViolations,
      warnings_count: allocationResult.warnings.length
    }
  };
  
  const hazmatItems: A2IRisksDocument['hazmat_items'] = [];
  allocationResult.load_plans.forEach(plan => {
    plan.pallets.forEach(p => {
      if (p.pallet.hazmat_flag) {
        p.pallet.items.filter(i => i.hazmat_flag).forEach(item => {
          hazmatItems.push({
            item_id: String(item.item_id),
            description: item.description,
            hazmat_class: '1.4',
            aircraft_id: plan.aircraft_id,
            notes: 'Requires proper placarding and documentation'
          });
        });
      }
    });
  });
  
  const risks: A2IRisksDocument = {
    generated_date: now.toISOString(),
    mission_id: missionId,
    hazmat_items: hazmatItems,
    pax_hazmat_conflicts: [],
    underutilized_sorties: allocationResult.load_plans
      .filter(p => p.payload_used_percent < 50)
      .map(p => ({
        aircraft_id: p.aircraft_id,
        utilization_percent: Math.round(p.payload_used_percent * 10) / 10,
        recommendation: 'Consider consolidating cargo with other sorties'
      })),
    cob_concerns: allocationResult.load_plans
      .filter(p => !p.cob_in_envelope)
      .map(p => ({
        aircraft_id: p.aircraft_id,
        cob_percent: Math.round(p.cob_percent * 10) / 10,
        status: `Outside envelope (${p.aircraft_spec.cob_min_percent}-${p.aircraft_spec.cob_max_percent}%)`
      })),
    general_warnings: allocationResult.warnings
  };
  
  const manifestRows = ['ITEM_ID,DESCRIPTION,PALLET_ID,AIRCRAFT_ID,WEIGHT_LB,HAZMAT'];
  allocationResult.load_plans.forEach(plan => {
    plan.pallets.forEach(p => {
      p.pallet.items.forEach(item => {
        manifestRows.push([
          String(item.item_id),
          `"${item.description.replace(/"/g, '""')}"`,
          p.pallet.id,
          plan.aircraft_id,
          Math.round(item.weight_each_lb * item.quantity),
          item.hazmat_flag ? 'Y' : 'N'
        ].join(','));
      });
    });
  });
  
  return {
    summary,
    load_plans: icodesPlans,
    risks_and_warnings: risks,
    manifest_csv: manifestRows.join('\n')
  };
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

export function downloadICODESLoadPlan(loadPlan: ICODESLoadPlan): void {
  const json = JSON.stringify(loadPlan, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `ICODES_${loadPlan.aircraft.aircraft_id}_${loadPlan.header.generated_date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadA2IBundle(bundle: A2IBundle): void {
  const files: Record<string, string> = {
    'summary.json': JSON.stringify(bundle.summary, null, 2),
    'risks_and_warnings.json': JSON.stringify(bundle.risks_and_warnings, null, 2),
    'manifest.csv': bundle.manifest_csv
  };
  
  bundle.load_plans.forEach(plan => {
    files[`load_plans/${plan.aircraft.aircraft_id}.json`] = JSON.stringify(plan, null, 2);
  });
  
  const allContent = JSON.stringify({
    _bundle_format: 'A2I_COMPATIBLE',
    _version: '1.0',
    ...files
  }, null, 2);
  
  const blob = new Blob([allContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `A2I_BUNDLE_${bundle.summary.mission_id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadManifestCSV(bundle: A2IBundle): void {
  const blob = new Blob([bundle.manifest_csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `MANIFEST_${bundle.summary.mission_id}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAllICODESPlans(allocationResult: AllocationResult): void {
  const missionId = generateMissionId();
  const plans = allocationResult.load_plans.map(p => loadPlanToICODES(p, missionId));
  
  const allPlans = {
    mission_id: missionId,
    generated_date: getCurrentDateISO(),
    aircraft_count: plans.length,
    load_plans: plans
  };
  
  const json = JSON.stringify(allPlans, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `ICODES_ALL_PLANS_${missionId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSplitFlightsICODES(flights: SplitFlight[]): void {
  const missionId = generateMissionId();
  const plans = flights.map(f => splitFlightToICODES(f, missionId));
  
  const allPlans = {
    mission_id: missionId,
    generated_date: getCurrentDateISO(),
    flight_count: plans.length,
    load_plans: plans
  };
  
  const json = JSON.stringify(allPlans, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `ICODES_SPLIT_FLIGHTS_${missionId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

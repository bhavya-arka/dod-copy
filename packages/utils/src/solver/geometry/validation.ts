/**
 * Geometry Validation Functions
 * Per lateral_placement_spec - Shared validation logic for 2D/3D views
 */

import {
  PlacedCargo,
  AircraftGeometry,
  HeightZone,
  GeometryValidationIssue,
  CoBResult
} from './types';

const ROLLING_STOCK_LATERAL_CLEARANCE_IN = 2;
const ROLLING_STOCK_LONGITUDINAL_CLEARANCE_IN = 4;

export function checkBounds(
  item: PlacedCargo,
  aircraft: AircraftGeometry
): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];
  const halfWidth = aircraft.max_half_width_in;

  if (item.y_left_in < -halfWidth) {
    issues.push({
      code: 'BOUNDS_LEFT_EXCEEDED',
      message: `${item.description} exceeds left fuselage boundary (${item.y_left_in}" vs limit -${halfWidth}")`,
      severity: 'error',
      item_id: item.id
    });
  }

  if (item.y_right_in > halfWidth) {
    issues.push({
      code: 'BOUNDS_RIGHT_EXCEEDED',
      message: `${item.description} exceeds right fuselage boundary (${item.y_right_in}" vs limit ${halfWidth}")`,
      severity: 'error',
      item_id: item.id
    });
  }

  if (item.x_start_in < aircraft.bay_start_in) {
    issues.push({
      code: 'BOUNDS_FORWARD_EXCEEDED',
      message: `${item.description} exceeds forward cargo boundary`,
      severity: 'error',
      item_id: item.id
    });
  }

  const maxX = aircraft.bay_start_in + aircraft.cargo_length_in + aircraft.ramp_length_in;
  if (item.x_end_in > maxX) {
    issues.push({
      code: 'BOUNDS_AFT_EXCEEDED',
      message: `${item.description} exceeds aft cargo boundary (ramp)`,
      severity: 'error',
      item_id: item.id
    });
  }

  return issues;
}

function boxesOverlap3D(a: PlacedCargo, b: PlacedCargo): boolean {
  const xOverlap = a.x_start_in < b.x_end_in && a.x_end_in > b.x_start_in;
  const yOverlap = a.y_left_in < b.y_right_in && a.y_right_in > b.y_left_in;
  const zOverlap = a.z_floor_in < b.z_top_in && a.z_top_in > b.z_floor_in;
  return xOverlap && yOverlap && zOverlap;
}

export function checkCollisions(items: PlacedCargo[]): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      
      if (a.aircraft_id !== b.aircraft_id) continue;
      
      if (boxesOverlap3D(a, b)) {
        issues.push({
          code: 'COLLISION_3D',
          message: `Collision detected between ${a.description} and ${b.description}`,
          severity: 'error',
          item_ids: [a.id, b.id]
        });
      }
    }
  }

  return issues;
}

function computeLateralGap(a: PlacedCargo, b: PlacedCargo): number {
  const gap = Math.min(b.y_left_in - a.y_right_in, a.y_left_in - b.y_right_in);
  return Math.max(gap, Math.min(a.y_left_in, b.y_left_in) - Math.max(a.y_right_in, b.y_right_in));
}

function hasXOverlap(a: PlacedCargo, b: PlacedCargo): boolean {
  return a.x_start_in < b.x_end_in && a.x_end_in > b.x_start_in;
}

export function checkLateralClearance(items: PlacedCargo[]): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];

  const rollingStock = items.filter(i => i.cargo_type === 'ROLLING_STOCK');

  for (let i = 0; i < rollingStock.length; i++) {
    for (let j = i + 1; j < rollingStock.length; j++) {
      const a = rollingStock[i];
      const b = rollingStock[j];
      
      if (a.aircraft_id !== b.aircraft_id || a.deck !== b.deck) continue;
      if (!hasXOverlap(a, b)) continue;

      const lateralGap = computeLateralGap(a, b);
      
      if (lateralGap < ROLLING_STOCK_LATERAL_CLEARANCE_IN && lateralGap > -1000) {
        issues.push({
          code: 'INSUFFICIENT_LATERAL_CLEARANCE',
          message: `Rolling stock ${a.description} and ${b.description} have insufficient lateral clearance (${lateralGap.toFixed(1)}" vs required ${ROLLING_STOCK_LATERAL_CLEARANCE_IN}")`,
          severity: 'error',
          item_ids: [a.id, b.id]
        });
      }
    }
  }

  return issues;
}

export function checkLongitudinalClearance(items: PlacedCargo[]): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];

  const rollingStock = items.filter(i => i.cargo_type === 'ROLLING_STOCK');

  for (let i = 0; i < rollingStock.length; i++) {
    for (let j = i + 1; j < rollingStock.length; j++) {
      const a = rollingStock[i];
      const b = rollingStock[j];
      
      if (a.aircraft_id !== b.aircraft_id || a.deck !== b.deck) continue;

      const hasYOverlap = a.y_left_in < b.y_right_in && a.y_right_in > b.y_left_in;
      if (!hasYOverlap) continue;

      const longitudinalGap = Math.max(a.x_start_in - b.x_end_in, b.x_start_in - a.x_end_in);
      
      if (longitudinalGap < ROLLING_STOCK_LONGITUDINAL_CLEARANCE_IN && longitudinalGap > 0) {
        issues.push({
          code: 'INSUFFICIENT_LONGITUDINAL_CLEARANCE',
          message: `Rolling stock ${a.description} and ${b.description} have insufficient longitudinal clearance (${longitudinalGap.toFixed(1)}" vs preferred ${ROLLING_STOCK_LONGITUDINAL_CLEARANCE_IN}")`,
          severity: 'warning',
          item_ids: [a.id, b.id]
        });
      }
    }
  }

  return issues;
}

export function checkHeightLimits(
  item: PlacedCargo,
  heightZones: HeightZone[]
): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];

  for (const zone of heightZones) {
    const itemInZone = item.x_start_in < zone.x_end_in && item.x_end_in > zone.x_start_in;
    
    if (itemInZone && item.height_in > zone.max_height_in) {
      issues.push({
        code: 'OVERHEIGHT_FOR_ZONE',
        message: `${item.description} height ${item.height_in}" exceeds ${zone.zone_name} limit of ${zone.max_height_in}"`,
        severity: 'error',
        item_id: item.id
      });
    }
  }

  return issues;
}

export function computeCoB(
  items: PlacedCargo[],
  aircraft: AircraftGeometry
): CoBResult {
  let totalWeight = 0;
  let totalMoment = 0;

  for (const item of items) {
    const itemArm = (item.x_start_in + item.x_end_in) / 2 - aircraft.ref_rdl_in;
    totalWeight += item.weight_lb;
    totalMoment += itemArm * item.weight_lb;
  }

  const cobArm = totalWeight > 0 ? totalMoment / totalWeight : 0;

  const cobPercent = totalWeight > 0
    ? ((cobArm + aircraft.ref_rdl_in - aircraft.lemac_station) / aircraft.mac_length) * 100
    : 0;

  let envelopeStatus: 'in_envelope' | 'forward_limit' | 'aft_limit' = 'in_envelope';
  let envelopeDeviation = 0;

  if (cobPercent < aircraft.cob_min_percent) {
    envelopeStatus = 'forward_limit';
    envelopeDeviation = aircraft.cob_min_percent - cobPercent;
  } else if (cobPercent > aircraft.cob_max_percent) {
    envelopeStatus = 'aft_limit';
    envelopeDeviation = cobPercent - aircraft.cob_max_percent;
  }

  const inEnvelope = cobPercent >= aircraft.cob_min_percent && 
                     cobPercent <= aircraft.cob_max_percent;

  return {
    total_weight: totalWeight,
    total_moment: totalMoment,
    cob_arm_in: cobArm,
    cob_percent: cobPercent,
    in_envelope: inEnvelope,
    envelope_status: envelopeStatus,
    envelope_deviation: envelopeDeviation
  };
}

export function runValidationPipeline(
  items: PlacedCargo[],
  aircraft: AircraftGeometry,
  heightZones: HeightZone[]
): GeometryValidationIssue[] {
  const allIssues: GeometryValidationIssue[] = [];

  for (const item of items) {
    allIssues.push(...checkBounds(item, aircraft));
  }

  for (const item of items) {
    allIssues.push(...checkHeightLimits(item, heightZones));
  }

  allIssues.push(...checkLateralClearance(items));
  allIssues.push(...checkLongitudinalClearance(items));

  allIssues.push(...checkCollisions(items));

  return allIssues;
}

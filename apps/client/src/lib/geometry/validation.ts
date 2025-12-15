/**
 * Geometry Validation Functions
 * Per lateral_placement_spec - Shared validation logic for 2D/3D views
 * 
 * Enhanced with physics-based CG envelope validation per T.O. 1C-17A-9 and T.O. 1C-130H-9
 */

import {
  PlacedCargo,
  AircraftGeometry,
  HeightZone,
  GeometryValidationIssue,
  CoBResult
} from './types';
import { AircraftType, AIRCRAFT_SPECS } from '../pacafTypes';

const ROLLING_STOCK_LATERAL_CLEARANCE_IN = 2;
const ROLLING_STOCK_LONGITUDINAL_CLEARANCE_IN = 4;

// CG warning thresholds - warn when approaching limits
const CG_WARNING_THRESHOLD_PERCENT = 3; // Warn when within 3% of limits
const LATERAL_CG_WARNING_THRESHOLD_IN = 5; // Warn when lateral CG exceeds 5" from centerline

// ============================================================================
// CG ENVELOPE VALIDATION - Per T.O. 1C-17A-9 / T.O. 1C-130H-9
// ============================================================================

/**
 * CG Envelope validation result
 */
export interface CGValidationResult {
  valid: boolean;
  issue?: string;
  severity: 'ok' | 'warning' | 'error';
  cgPercent: number;
  forwardLimit: number;
  aftLimit: number;
  targetCG: number;
  deviationFromTarget: number;
}

/**
 * Validate that CG is within the allowed envelope
 * Per T.O. 1C-17A-9: C-17 CG limits are 16-40% MAC
 * Per T.O. 1C-130H-9: C-130 CG limits are 18-33% MAC
 */
export function validateCGEnvelope(
  cgPercent: number,
  aircraftType: AircraftType
): CGValidationResult {
  const spec = AIRCRAFT_SPECS[aircraftType];
  const forwardLimit = spec.cob_min_percent;
  const aftLimit = spec.cob_max_percent;
  const targetCG = (forwardLimit + aftLimit) / 2;
  const deviationFromTarget = Math.abs(cgPercent - targetCG);
  
  // Check if CG exceeds forward limit (nose heavy)
  if (cgPercent < forwardLimit) {
    return {
      valid: false,
      issue: `CG too far forward (nose heavy): ${cgPercent.toFixed(1)}% MAC is below forward limit of ${forwardLimit}% MAC`,
      severity: 'error',
      cgPercent,
      forwardLimit,
      aftLimit,
      targetCG,
      deviationFromTarget
    };
  }
  
  // Check if CG exceeds aft limit (tail heavy)
  if (cgPercent > aftLimit) {
    return {
      valid: false,
      issue: `CG too far aft (tail heavy): ${cgPercent.toFixed(1)}% MAC exceeds aft limit of ${aftLimit}% MAC`,
      severity: 'error',
      cgPercent,
      forwardLimit,
      aftLimit,
      targetCG,
      deviationFromTarget
    };
  }
  
  // Check if CG is approaching forward limit
  if (cgPercent < forwardLimit + CG_WARNING_THRESHOLD_PERCENT) {
    return {
      valid: true,
      issue: `CG approaching forward limit: ${cgPercent.toFixed(1)}% MAC (limit: ${forwardLimit}%)`,
      severity: 'warning',
      cgPercent,
      forwardLimit,
      aftLimit,
      targetCG,
      deviationFromTarget
    };
  }
  
  // Check if CG is approaching aft limit
  if (cgPercent > aftLimit - CG_WARNING_THRESHOLD_PERCENT) {
    return {
      valid: true,
      issue: `CG approaching aft limit: ${cgPercent.toFixed(1)}% MAC (limit: ${aftLimit}%)`,
      severity: 'warning',
      cgPercent,
      forwardLimit,
      aftLimit,
      targetCG,
      deviationFromTarget
    };
  }
  
  // CG is safely within envelope
  return {
    valid: true,
    severity: 'ok',
    cgPercent,
    forwardLimit,
    aftLimit,
    targetCG,
    deviationFromTarget
  };
}

/**
 * Validate lateral CG balance
 * For bilateral loading, lateral CG should be near centerline (0)
 */
export function validateLateralBalance(
  lateralCG: number,
  aircraftType: AircraftType
): CGValidationResult & { lateralCG: number } {
  const spec = AIRCRAFT_SPECS[aircraftType];
  const halfWidth = spec.cargo_width / 2;
  const maxAllowedOffset = halfWidth * 0.1; // Allow up to 10% of half-width offset
  
  if (Math.abs(lateralCG) > maxAllowedOffset) {
    const side = lateralCG > 0 ? 'right' : 'left';
    return {
      valid: false,
      issue: `Lateral CG imbalance: ${Math.abs(lateralCG).toFixed(1)}" ${side} of centerline exceeds limit of ${maxAllowedOffset.toFixed(1)}"`,
      severity: 'error',
      cgPercent: 0,
      forwardLimit: 0,
      aftLimit: 0,
      targetCG: 0,
      deviationFromTarget: 0,
      lateralCG
    };
  }
  
  if (Math.abs(lateralCG) > LATERAL_CG_WARNING_THRESHOLD_IN) {
    const side = lateralCG > 0 ? 'right' : 'left';
    return {
      valid: true,
      issue: `Slight lateral imbalance: ${Math.abs(lateralCG).toFixed(1)}" ${side} of centerline`,
      severity: 'warning',
      cgPercent: 0,
      forwardLimit: 0,
      aftLimit: 0,
      targetCG: 0,
      deviationFromTarget: 0,
      lateralCG
    };
  }
  
  return {
    valid: true,
    severity: 'ok',
    cgPercent: 0,
    forwardLimit: 0,
    aftLimit: 0,
    targetCG: 0,
    deviationFromTarget: 0,
    lateralCG
  };
}

/**
 * Combined CG validation for both longitudinal and lateral balance
 */
export function validateCGComplete(
  cgPercent: number,
  lateralCG: number,
  aircraftType: AircraftType
): GeometryValidationIssue[] {
  const issues: GeometryValidationIssue[] = [];
  
  // Validate longitudinal CG
  const longitudinalResult = validateCGEnvelope(cgPercent, aircraftType);
  if (longitudinalResult.issue) {
    issues.push({
      code: longitudinalResult.valid ? 'CG_ENVELOPE_WARNING' : 'CG_ENVELOPE_EXCEEDED',
      message: longitudinalResult.issue,
      severity: longitudinalResult.severity === 'error' ? 'error' : 'warning'
    });
  }
  
  // Validate lateral CG
  const lateralResult = validateLateralBalance(lateralCG, aircraftType);
  if (lateralResult.issue) {
    issues.push({
      code: lateralResult.valid ? 'LATERAL_CG_WARNING' : 'LATERAL_CG_EXCEEDED',
      message: lateralResult.issue,
      severity: lateralResult.severity === 'error' ? 'error' : 'warning'
    });
  }
  
  return issues;
}

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

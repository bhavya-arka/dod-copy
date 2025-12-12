/**
 * Aircraft Count Explanation Engine
 * Generates human-readable explanations for why a specific number of aircraft is needed
 * Helps operators understand load planning decisions
 */

import { 
  AllocationResult, 
  AircraftLoadPlan, 
  AircraftType,
  AIRCRAFT_SPECS,
  MovementItem 
} from './pacafTypes';

// ============================================================================
// EXPLANATION TYPES
// ============================================================================

export interface AircraftExplanation {
  aircraft_id: string;
  phase: 'ADVON' | 'MAIN';
  summary: string;
  details: string[];
  constraints: {
    weight_used_percent: number;
    positions_used_percent: number;
    is_weight_limited: boolean;
    is_position_limited: boolean;
  };
}

export interface FleetExplanation {
  total_aircraft: number;
  aircraft_type: AircraftType;
  headline: string;
  bottleneck_summary: string;
  bottleneck_items: {
    item_id: string;
    description: string;
    reason: string;
  }[];
  recommendations: string[];
  per_aircraft: AircraftExplanation[];
}

// ============================================================================
// EXPLANATION GENERATION
// ============================================================================

export function explainAircraftLoad(plan: AircraftLoadPlan): AircraftExplanation {
  const details: string[] = [];
  const spec = plan.aircraft_spec;
  
  details.push(`Filled to ${plan.payload_used_percent.toFixed(0)}% of ACL (${plan.total_weight.toLocaleString()} / ${spec.max_payload.toLocaleString()} lb)`);
  
  if (plan.pallets.length > 0) {
    details.push(`${plan.pallets.length} pallets loaded`);
  }
  
  if (plan.rolling_stock.length > 0) {
    details.push(`${plan.rolling_stock.length} rolling stock vehicle(s)`);
  }
  
  if (plan.pax_count > 0) {
    details.push(`${plan.pax_count} passengers`);
  }
  
  if (plan.cob_in_envelope) {
    details.push(`Center of balance ${plan.cob_percent.toFixed(1)}% within limits`);
  } else {
    details.push(`⚠ Center of balance ${plan.cob_percent.toFixed(1)}% OUTSIDE safe envelope (${spec.cob_min_percent}-${spec.cob_max_percent}%)`);
  }
  
  if (plan.phase === 'ADVON') {
    details.push('Designated ADVON (advance echelon) - loads first');
  }
  
  const hasHazmat = plan.pallets.some(p => p.pallet.hazmat_flag) || 
    plan.rolling_stock.some(v => v.item.hazmat_flag);
  if (hasHazmat) {
    details.push('Contains hazardous materials - special handling required');
  }
  
  const isWeightLimited = plan.payload_used_percent > plan.utilization_percent;
  const isPositionLimited = plan.utilization_percent > plan.payload_used_percent;
  
  const constraints = {
    weight_used_percent: plan.payload_used_percent,
    positions_used_percent: plan.utilization_percent,
    is_weight_limited: isWeightLimited,
    is_position_limited: isPositionLimited
  };
  
  let summary: string;
  if (isWeightLimited) {
    summary = `Weight-limited at ${plan.payload_used_percent.toFixed(0)}% ACL`;
  } else if (isPositionLimited) {
    summary = `Position-limited at ${plan.positions_used}/${plan.positions_available} positions`;
  } else {
    summary = `Balanced load at ${plan.payload_used_percent.toFixed(0)}% capacity`;
  }
  
  return {
    aircraft_id: plan.aircraft_id,
    phase: plan.phase,
    summary,
    details,
    constraints
  };
}

export function explainFleetRequirement(result: AllocationResult): FleetExplanation {
  const spec = AIRCRAFT_SPECS[result.aircraft_type];
  const perAircraft = result.load_plans.map(p => explainAircraftLoad(p));
  
  let bottleneckSummary: string;
  const bottleneckItems: FleetExplanation['bottleneck_items'] = [];
  const recommendations: string[] = [];
  
  const totalWeight = result.total_weight;
  const totalPallets = result.total_pallets;
  const totalVehicles = result.total_rolling_stock;
  
  const minByWeight = Math.ceil(totalWeight / spec.max_payload);
  const minByPositions = Math.ceil(totalPallets / spec.pallet_positions);
  
  if (minByWeight >= minByPositions) {
    bottleneckSummary = `Weight is the primary constraint: ${totalWeight.toLocaleString()} lb requires minimum ${minByWeight} aircraft at ${spec.max_payload.toLocaleString()} lb per aircraft`;
  } else {
    bottleneckSummary = `Pallet positions are the primary constraint: ${totalPallets} pallets requires minimum ${minByPositions} aircraft at ${spec.pallet_positions} positions each`;
  }
  
  result.load_plans.forEach(plan => {
    plan.rolling_stock.forEach(vehicle => {
      if (vehicle.length > spec.cargo_length * 0.5) {
        bottleneckItems.push({
          item_id: String(vehicle.item_id),
          description: vehicle.item.description,
          reason: `Large vehicle (${vehicle.length}" long) occupies significant cargo space`
        });
      }
      if (vehicle.weight > spec.max_payload * 0.3) {
        bottleneckItems.push({
          item_id: String(vehicle.item_id),
          description: vehicle.item.description,
          reason: `Heavy vehicle (${vehicle.weight.toLocaleString()} lb) limits additional cargo`
        });
      }
    });
    
    plan.pallets.forEach(p => {
      if (p.pallet.gross_weight > 8000) {
        bottleneckItems.push({
          item_id: p.pallet.id,
          description: `Pallet ${p.pallet.id}`,
          reason: `Heavy pallet (${p.pallet.gross_weight.toLocaleString()} lb) - near position limit`
        });
      }
    });
  });
  
  const avgUtilization = result.load_plans.reduce((sum, p) => sum + p.payload_used_percent, 0) / result.load_plans.length;
  
  if (avgUtilization < 70) {
    recommendations.push(`Average ACL utilization is ${avgUtilization.toFixed(0)}% - consider consolidating cargo`);
  }
  
  const underutilized = result.load_plans.filter(p => p.payload_used_percent < 50);
  if (underutilized.length > 0) {
    recommendations.push(`${underutilized.length} aircraft below 50% capacity - potential for consolidation`);
  }
  
  if (totalVehicles > 0 && result.aircraft_type === 'C-130') {
    recommendations.push('Consider C-17 for large vehicles to improve cargo flexibility');
  }
  
  if (result.unloaded_items.length > 0) {
    recommendations.push(`${result.unloaded_items.length} item(s) could not be loaded - review dimensional constraints`);
  }
  
  const headline = `Mission requires ${result.total_aircraft} × ${result.aircraft_type}`;
  
  return {
    total_aircraft: result.total_aircraft,
    aircraft_type: result.aircraft_type,
    headline,
    bottleneck_summary: bottleneckSummary,
    bottleneck_items: bottleneckItems.slice(0, 10),
    recommendations,
    per_aircraft: perAircraft
  };
}

export function generateWhyThisManyAircraft(result: AllocationResult): string {
  const explanation = explainFleetRequirement(result);
  const spec = AIRCRAFT_SPECS[result.aircraft_type];
  
  const lines: string[] = [
    `We require ${explanation.total_aircraft} ${result.aircraft_type}(s) because:`,
    '',
    `• ${explanation.bottleneck_summary}`,
  ];
  
  if (explanation.bottleneck_items.length > 0) {
    lines.push('');
    lines.push('Key items driving aircraft count:');
    explanation.bottleneck_items.slice(0, 5).forEach(item => {
      lines.push(`  • ${item.description}: ${item.reason}`);
    });
  }
  
  const advonCount = result.load_plans.filter(p => p.phase === 'ADVON').length;
  const mainCount = result.load_plans.filter(p => p.phase === 'MAIN').length;
  
  if (advonCount > 0 && mainCount > 0) {
    lines.push('');
    lines.push(`Phase breakdown: ${advonCount} ADVON + ${mainCount} MAIN aircraft`);
  }
  
  if (explanation.recommendations.length > 0) {
    lines.push('');
    lines.push('Optimization opportunities:');
    explanation.recommendations.forEach(rec => {
      lines.push(`  → ${rec}`);
    });
  }
  
  return lines.join('\n');
}

// ============================================================================
// SCENARIO COMPARISON
// ============================================================================

export interface ScenarioDelta {
  aircraft_change: number;
  weight_change: number;
  utilization_change: number;
  summary: string;
}

export function compareScenarios(
  scenarioA: AllocationResult,
  scenarioB: AllocationResult
): ScenarioDelta {
  const aircraftChange = scenarioB.total_aircraft - scenarioA.total_aircraft;
  const weightChange = scenarioB.total_weight - scenarioA.total_weight;
  
  const avgUtilA = scenarioA.load_plans.reduce((s, p) => s + p.payload_used_percent, 0) / scenarioA.load_plans.length;
  const avgUtilB = scenarioB.load_plans.reduce((s, p) => s + p.payload_used_percent, 0) / scenarioB.load_plans.length;
  const utilizationChange = avgUtilB - avgUtilA;
  
  const parts: string[] = [];
  
  if (aircraftChange !== 0) {
    parts.push(`${scenarioA.aircraft_type} sorties: ${scenarioA.total_aircraft} → ${scenarioB.total_aircraft} (${aircraftChange > 0 ? '+' : ''}${aircraftChange})`);
  }
  
  if (Math.abs(utilizationChange) > 1) {
    parts.push(`Avg utilization: ${avgUtilA.toFixed(0)}% → ${avgUtilB.toFixed(0)}% (${utilizationChange > 0 ? '+' : ''}${utilizationChange.toFixed(1)}%)`);
  }
  
  return {
    aircraft_change: aircraftChange,
    weight_change: weightChange,
    utilization_change: utilizationChange,
    summary: parts.length > 0 ? parts.join('\n') : 'No significant changes'
  };
}

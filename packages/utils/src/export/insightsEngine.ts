/**
 * PACAF Airlift Demo - AI Insights Engine
 * Spec Reference: Section 13
 * 
 * Generates summaries, insights, anomaly detection, and optimization recommendations.
 */

import {
  MovementItem,
  ClassifiedItems,
  AllocationResult,
  AIInsight,
  InsightsSummary,
  AircraftLoadPlan,
  AIRCRAFT_SPECS
} from '../types';

// ============================================================================
// SECTION 13.1: MOVEMENT LIST SUMMARIZATION
// ============================================================================

export function analyzeMovementList(
  items: MovementItem[],
  classifiedItems: ClassifiedItems
): InsightsSummary {
  const insights: AIInsight[] = [];
  
  // Calculate totals
  const totalWeight = items.reduce((sum, i) => sum + i.weight_each_lb * i.quantity, 0);
  const totalVolume = items.reduce((sum, i) => {
    const vol = (i.length_in * i.width_in * i.height_in) / 1728; // Convert to cubic feet
    return sum + vol * i.quantity;
  }, 0);
  
  // Identify weight drivers (items that represent significant % of total weight)
  const weightDrivers = items
    .map(i => ({
      item_id: i.item_id,
      description: i.description,
      weight: i.weight_each_lb * i.quantity,
      percent_of_total: ((i.weight_each_lb * i.quantity) / totalWeight) * 100
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  
  // Identify volume drivers
  const volumeDrivers = items
    .map(i => {
      const vol = (i.length_in * i.width_in * i.height_in * i.quantity) / 1728;
      return {
        item_id: i.item_id,
        description: i.description,
        volume_cuft: vol,
        percent_of_total: (vol / totalVolume) * 100
      };
    })
    .sort((a, b) => b.volume_cuft - a.volume_cuft)
    .slice(0, 5);
  
  // Generate insights based on analysis
  
  // Weight concentration insight
  const top3WeightPercent = weightDrivers.slice(0, 3).reduce((sum, d) => sum + d.percent_of_total, 0);
  if (top3WeightPercent > 50) {
    insights.push({
      id: 'weight_concentration',
      category: 'weight_driver',
      severity: 'info',
      title: 'Weight Concentration Detected',
      description: `${top3WeightPercent.toFixed(0)}% of total cargo weight is concentrated in ${weightDrivers.slice(0, 3).length} items.`,
      affected_items: weightDrivers.slice(0, 3).map(d => d.item_id),
      recommendation: 'Consider distributing heavy items across multiple aircraft for better balance.'
    });
  }
  
  // Rolling stock analysis
  if (classifiedItems.rolling_stock.length > 0) {
    const rsItems = classifiedItems.rolling_stock;
    const oversizeItems = rsItems.filter(i => 
      i.width_in > AIRCRAFT_SPECS['C-130'].ramp_clearance_width
    );
    
    if (oversizeItems.length > 0) {
      insights.push({
        id: 'c17_required',
        category: 'risk_factor',
        severity: 'warning',
        title: 'C-17 Required for Rolling Stock',
        description: `${oversizeItems.length} vehicle(s) exceed C-130 ramp width (${AIRCRAFT_SPECS['C-130'].ramp_clearance_width}") and require C-17 transport.`,
        affected_items: oversizeItems.map(i => i.item_id),
        recommendation: 'Plan C-17 allocation for these items specifically.'
      });
    }
  }
  
  // Hazmat analysis
  const hazmatItems = items.filter(i => i.hazmat_flag);
  if (hazmatItems.length > 0) {
    insights.push({
      id: 'hazmat_present',
      category: 'hazmat',
      severity: 'warning',
      title: 'Hazardous Materials Present',
      description: `${hazmatItems.length} item(s) flagged as HAZMAT require special handling and segregation.`,
      affected_items: hazmatItems.map(i => i.item_id),
      recommendation: 'Ensure HAZMAT segregation rules are followed per DTR 4500.9-R.'
    });
  }
  
  // Pallet height optimization
  const tallPallets = classifiedItems.prebuilt_pallets.filter(i => i.height_in > 96);
  if (tallPallets.length > 0) {
    const potentialSavings = tallPallets.length * 0.25; // Rough estimate
    insights.push({
      id: 'height_optimization',
      category: 'inefficiency',
      severity: 'info',
      title: 'Pallet Height Optimization Opportunity',
      description: `${tallPallets.length} pallet(s) exceed 96" height, reducing weight capacity from 10,000 to 8,000 lbs.`,
      affected_items: tallPallets.map(i => i.item_id),
      recommendation: `Reducing height could increase capacity by up to ${potentialSavings.toFixed(0)} additional pallets.`
    });
  }
  
  // Critical items (heavy + oversized)
  const criticalItems = items.filter(i => 
    i.weight_each_lb > 8000 || 
    i.length_in > 100 || 
    i.width_in > 100
  );
  
  // Optimization opportunities
  const optimizationOpportunities: string[] = [];
  
  if (classifiedItems.loose_items.length > 5) {
    optimizationOpportunities.push(
      `${classifiedItems.loose_items.length} loose items can be consolidated into pallets for faster loading.`
    );
  }
  
  if (classifiedItems.pax_items.length > 0) {
    const totalPax = classifiedItems.pax_items.reduce((sum, i) => sum + (i.pax_count || 1), 0);
    optimizationOpportunities.push(
      `${totalPax} PAX can be distributed across aircraft with available seating.`
    );
  }
  
  return {
    insights,
    weight_drivers: weightDrivers,
    volume_drivers: volumeDrivers,
    critical_items: criticalItems,
    optimization_opportunities: optimizationOpportunities
  };
}

// ============================================================================
// SECTION 13.2: ALLOCATION INSIGHTS
// ============================================================================

export function analyzeAllocation(result: AllocationResult): AIInsight[] {
  const insights: AIInsight[] = [];
  
  // Utilization analysis
  const avgUtilization = result.load_plans.reduce(
    (sum, p) => sum + p.utilization_percent, 0
  ) / result.load_plans.length;
  
  if (avgUtilization < 70) {
    insights.push({
      id: 'low_utilization',
      category: 'inefficiency',
      severity: 'warning',
      title: 'Low Aircraft Utilization',
      description: `Average pallet position utilization is ${avgUtilization.toFixed(0)}%. Consider consolidating loads.`,
      recommendation: 'Review if fewer aircraft with higher utilization is possible.'
    });
  }
  
  // Weight balance analysis
  const cobIssues = result.load_plans.filter(p => !p.cob_in_envelope);
  if (cobIssues.length > 0) {
    insights.push({
      id: 'cob_warning',
      category: 'risk_factor',
      severity: 'critical',
      title: 'Center of Balance Warning',
      description: `${cobIssues.length} aircraft have Center of Balance outside recommended envelope.`,
      affected_items: cobIssues.map(p => p.aircraft_id),
      recommendation: 'Rearrange cargo to bring CoB within limits before flight.'
    });
  }
  
  // Unloaded items
  if (result.unloaded_items.length > 0) {
    insights.push({
      id: 'unloaded_items',
      category: 'risk_factor',
      severity: 'critical',
      title: 'Items Could Not Be Loaded',
      description: `${result.unloaded_items.length} item(s) could not be loaded on any aircraft.`,
      affected_items: result.unloaded_items.map(i => i.item_id),
      recommendation: 'Review item dimensions and consider alternative transport methods.'
    });
  }
  
  return insights;
}

// ============================================================================
// SECTION 13.3: QUERYABLE EXPLANATIONS
// ============================================================================

export function explainAircraftCount(result: AllocationResult): string {
  const spec = AIRCRAFT_SPECS[result.aircraft_type];
  
  const byWeight = Math.ceil(result.total_weight / spec.max_payload);
  const byPositions = Math.ceil(result.total_pallets / spec.pallet_positions);
  
  let explanation = `The solver determined ${result.total_aircraft} ${result.aircraft_type} aircraft are required.\n\n`;
  
  if (result.advon_aircraft > 0) {
    explanation += `ADVON Phase: ${result.advon_aircraft} aircraft\n`;
  }
  explanation += `MAIN Phase: ${result.main_aircraft} aircraft\n\n`;
  
  explanation += `Limiting Factors:\n`;
  explanation += `- Weight constraint: ${byWeight} aircraft needed (${result.total_weight.toLocaleString()} lbs / ${spec.max_payload.toLocaleString()} lbs per aircraft)\n`;
  explanation += `- Position constraint: ${byPositions} aircraft needed (${result.total_pallets} pallets / ${spec.pallet_positions} positions per aircraft)\n`;
  
  if (result.total_rolling_stock > 0) {
    explanation += `- Rolling stock: ${result.total_rolling_stock} vehicles loaded first per aircraft\n`;
  }
  
  return explanation;
}

export function explainSecondAircraft(result: AllocationResult): string {
  if (result.load_plans.length < 2) {
    return 'Only one aircraft is required for this load.';
  }
  
  const secondAircraft = result.load_plans[1];
  const firstAircraft = result.load_plans[0];
  
  let explanation = `The second ${result.aircraft_type} was required because:\n\n`;
  
  // Check if first aircraft was weight-limited
  if (firstAircraft.payload_used_percent > 90) {
    explanation += `1. First aircraft reached ${firstAircraft.payload_used_percent.toFixed(0)}% of payload capacity.\n`;
  }
  
  // Check if first aircraft was position-limited
  if (firstAircraft.positions_used >= firstAircraft.positions_available) {
    explanation += `2. All ${firstAircraft.positions_available} pallet positions were filled on the first aircraft.\n`;
  }
  
  explanation += `\nItems loaded on second aircraft:\n`;
  
  for (const pallet of secondAircraft.pallets.slice(0, 3)) {
    const itemDescs = pallet.pallet.items.map(i => i.description).join(', ');
    explanation += `- Pallet ${pallet.pallet.id}: ${itemDescs} (${pallet.pallet.gross_weight.toLocaleString()} lbs)\n`;
  }
  
  if (secondAircraft.pallets.length > 3) {
    explanation += `... and ${secondAircraft.pallets.length - 3} more pallets\n`;
  }
  
  return explanation;
}

export function identifyWeightConstrainedPallet(result: AllocationResult): string {
  let maxUtilization = 0;
  let mostConstrainedPallet: { pallet: any; aircraft: string } | null = null;
  
  for (const plan of result.load_plans) {
    for (const placement of plan.pallets) {
      const maxWeight = placement.is_ramp 
        ? plan.aircraft_spec.ramp_position_weight 
        : plan.aircraft_spec.per_position_weight;
      const utilization = (placement.pallet.gross_weight / maxWeight) * 100;
      
      if (utilization > maxUtilization) {
        maxUtilization = utilization;
        mostConstrainedPallet = {
          pallet: placement.pallet,
          aircraft: plan.aircraft_id
        };
      }
    }
  }
  
  if (!mostConstrainedPallet) {
    return 'No pallets are weight-constrained.';
  }
  
  const items = mostConstrainedPallet.pallet.items
    .map((i: MovementItem) => `${i.description} (${i.weight_each_lb} lbs)`)
    .join(', ');
  
  return `Most weight-constrained pallet: ${mostConstrainedPallet.pallet.id} on ${mostConstrainedPallet.aircraft}\n` +
         `Utilization: ${maxUtilization.toFixed(0)}%\n` +
         `Contents: ${items}\n` +
         `Total weight: ${mostConstrainedPallet.pallet.gross_weight.toLocaleString()} lbs`;
}

/**
 * PACAF Airlift Demo - AI Insights Engine
 * Spec Reference: Section 13
 * 
 * Generates summaries, insights, anomaly detection, and optimization recommendations.
 * Enhanced with actionable, data-driven insights.
 */

import {
  MovementItem,
  ClassifiedItems,
  AllocationResult,
  AIInsight,
  InsightsSummary,
  AircraftLoadPlan,
  AIRCRAFT_SPECS
} from './pacafTypes';

// ============================================================================
// SECTION 13.1: MOVEMENT LIST SUMMARIZATION
// ============================================================================

export function analyzeMovementList(
  items: MovementItem[],
  classifiedItems: ClassifiedItems
): InsightsSummary {
  const insights: AIInsight[] = [];
  
  const totalWeight = items.reduce((sum, i) => sum + i.weight_each_lb * i.quantity, 0);
  const totalVolume = items.reduce((sum, i) => {
    const vol = (i.length_in * i.width_in * i.height_in) / 1728;
    return sum + vol * i.quantity;
  }, 0);
  
  const weightDrivers = items
    .map(i => ({
      item_id: i.item_id,
      description: i.description,
      weight: i.weight_each_lb * i.quantity,
      percent_of_total: ((i.weight_each_lb * i.quantity) / totalWeight) * 100
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  
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
  
  const top3WeightPercent = weightDrivers.slice(0, 3).reduce((sum, d) => sum + d.percent_of_total, 0);
  if (top3WeightPercent > 50) {
    insights.push({
      id: 'weight_concentration',
      category: 'weight_driver',
      severity: 'info',
      title: 'Weight Concentration Detected',
      description: `Top 3 items account for ${top3WeightPercent.toFixed(0)}% of total cargo weight: ${weightDrivers.slice(0, 3).map(d => d.description).join(', ')}.`,
      affected_items: weightDrivers.slice(0, 3).map(d => d.item_id),
      recommendation: 'Distribute these heavy items across multiple aircraft to maintain balanced center of gravity.'
    });
  }
  
  if (classifiedItems.rolling_stock.length > 0) {
    const rsItems = classifiedItems.rolling_stock;
    const totalRsWeight = rsItems.reduce((sum, i) => sum + i.weight_each_lb, 0);
    const oversizeItems = rsItems.filter(i => 
      i.width_in > AIRCRAFT_SPECS['C-130'].ramp_clearance_width
    );
    
    if (oversizeItems.length > 0) {
      insights.push({
        id: 'c17_required',
        category: 'risk_factor',
        severity: 'warning',
        title: 'C-17 Required for Rolling Stock',
        description: `${oversizeItems.length} vehicle(s) exceed C-130 ramp width (${AIRCRAFT_SPECS['C-130'].ramp_clearance_width}"). These MUST use C-17 transport.`,
        affected_items: oversizeItems.map(i => i.item_id),
        recommendation: `Allocate ${Math.ceil(oversizeItems.length / 2)} C-17 aircraft minimum for these ${oversizeItems.length} oversize vehicles.`
      });
    }

    insights.push({
      id: 'rolling_stock_summary',
      category: 'recommendation',
      severity: 'info',
      title: `Rolling Stock Analysis: ${rsItems.length} Vehicles`,
      description: `Total vehicle weight: ${totalRsWeight.toLocaleString()} lbs. Vehicles will be loaded first and occupy floor space, reducing pallet positions.`,
      affected_items: rsItems.map(i => i.item_id),
      recommendation: 'Consider loading vehicles on dedicated aircraft to maximize pallet capacity on other aircraft.'
    });
  }
  
  const hazmatItems = items.filter(i => i.hazmat_flag);
  if (hazmatItems.length > 0) {
    const hazmatWeight = hazmatItems.reduce((sum, i) => sum + i.weight_each_lb * i.quantity, 0);
    insights.push({
      id: 'hazmat_present',
      category: 'hazmat',
      severity: 'warning',
      title: `Hazardous Materials: ${hazmatItems.length} Items`,
      description: `${hazmatWeight.toLocaleString()} lbs of HAZMAT cargo requires special handling, segregation from PAX, and certified load crews.`,
      affected_items: hazmatItems.map(i => i.item_id),
      recommendation: 'Isolate HAZMAT on dedicated pallets. Ensure 3-position separation from passengers per DTR 4500.9-R.'
    });
  }
  
  const tallPallets = classifiedItems.prebuilt_pallets.filter(i => i.height_in > 96);
  if (tallPallets.length > 0) {
    const weightLoss = tallPallets.length * 2000;
    insights.push({
      id: 'height_optimization',
      category: 'inefficiency',
      severity: 'warning',
      title: `${tallPallets.length} Overheight Pallets Detected`,
      description: `Pallets exceeding 96" are limited to 8,000 lbs instead of 10,000 lbs. This reduces capacity by up to ${weightLoss.toLocaleString()} lbs total.`,
      affected_items: tallPallets.map(i => i.item_id),
      recommendation: 'If possible, restack these pallets to reduce height below 96" and regain 2,000 lbs capacity each.'
    });
  }

  const totalPax = classifiedItems.pax_items.reduce((sum, i) => sum + (i.pax_count || 1), 0);
  if (totalPax > 0) {
    const paxWeight = totalPax * 225;
    insights.push({
      id: 'pax_planning',
      category: 'recommendation',
      severity: 'info',
      title: `Personnel Movement: ${totalPax} PAX`,
      description: `Passengers add ${paxWeight.toLocaleString()} lbs (at 225 lbs/person with gear). C-17 can seat 102 PAX, C-130 can seat 92 PAX.`,
      affected_items: classifiedItems.pax_items.map(i => i.item_id),
      recommendation: totalPax > 50 
        ? 'Consider dedicated PAX aircraft to avoid mixing personnel with hazmat or heavy cargo.'
        : 'PAX can be distributed across cargo aircraft with available seating.'
    });
  }
  
  const criticalItems = items.filter(i => 
    i.weight_each_lb > 8000 || 
    i.length_in > 100 || 
    i.width_in > 100
  );

  if (criticalItems.length > 0) {
    insights.push({
      id: 'critical_items',
      category: 'risk_factor',
      severity: 'warning',
      title: `${criticalItems.length} Critical/Oversize Items`,
      description: `These items exceed standard pallet limits (>8,000 lbs or >100" dimensions) and require special positioning.`,
      affected_items: criticalItems.map(i => i.item_id),
      recommendation: 'Load critical items first using aircraft-specific equipment. May require MHE coordination at destination.'
    });
  }
  
  const optimizationOpportunities: string[] = [];
  
  if (classifiedItems.loose_items.length > 5) {
    optimizationOpportunities.push(
      `Consolidate ${classifiedItems.loose_items.length} loose items into pallets for 40% faster loading and better load security.`
    );
  }
  
  if (totalPax > 0 && hazmatItems.length > 0) {
    optimizationOpportunities.push(
      `Separate ${totalPax} PAX from ${hazmatItems.length} HAZMAT items - consider dedicated passenger aircraft.`
    );
  }

  const c17Capacity = AIRCRAFT_SPECS['C-17'].max_payload;
  const c130Capacity = AIRCRAFT_SPECS['C-130'].max_payload;
  const minC17s = Math.ceil(totalWeight / c17Capacity);
  const minC130s = Math.ceil(totalWeight / c130Capacity);
  
  if (totalWeight < c130Capacity * 2 && totalWeight > c17Capacity) {
    optimizationOpportunities.push(
      `Mission weight (${(totalWeight/1000).toFixed(0)}K lbs) is optimal for ${minC17s} C-17 vs ${minC130s} C-130. C-17 provides better utilization.`
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
  
  const avgUtilization = result.load_plans.reduce(
    (sum, p) => sum + p.utilization_percent, 0
  ) / result.load_plans.length;
  
  if (avgUtilization < 70) {
    const wastedCapacity = result.load_plans.reduce((sum, p) => {
      const spec = AIRCRAFT_SPECS[p.aircraft_type];
      return sum + (spec.max_payload - p.total_weight);
    }, 0);
    
    insights.push({
      id: 'low_utilization',
      category: 'inefficiency',
      severity: 'warning',
      title: `Low Aircraft Utilization: ${avgUtilization.toFixed(0)}%`,
      description: `Fleet has ${(wastedCapacity / 1000).toFixed(0)}K lbs of unused capacity. Consolidating loads could reduce aircraft count.`,
      recommendation: `Consider reducing to ${Math.ceil(result.load_plans.length * avgUtilization / 85)} aircraft at 85% utilization target.`
    });
  } else if (avgUtilization > 90) {
    insights.push({
      id: 'high_utilization',
      category: 'recommendation',
      severity: 'info',
      title: `Excellent Utilization: ${avgUtilization.toFixed(0)}%`,
      description: `Fleet is well-optimized with minimal wasted capacity across ${result.load_plans.length} aircraft.`,
      recommendation: 'Monitor for any last-minute cargo additions that could exceed limits.'
    });
  }
  
  const cobIssues = result.load_plans.filter(p => !p.cob_in_envelope);
  if (cobIssues.length > 0) {
    cobIssues.forEach(plan => {
      const spec = AIRCRAFT_SPECS[plan.aircraft_type];
      const direction = plan.cob_percent < spec.cob_min_percent ? 'forward' : 'aft';
      const adjustment = Math.abs(plan.cob_percent - (spec.cob_min_percent + spec.cob_max_percent) / 2);
      
      insights.push({
        id: `cob_warning_${plan.aircraft_id}`,
        category: 'risk_factor',
        severity: 'critical',
        title: `CoB OUT OF LIMITS: ${plan.aircraft_id}`,
        description: `Center of Balance at ${plan.cob_percent.toFixed(1)}% is too ${direction}. Safe envelope is ${spec.cob_min_percent}-${spec.cob_max_percent}%.`,
        affected_items: [plan.aircraft_id],
        recommendation: `Shift approximately ${(adjustment * 10).toFixed(0)}K lbs of cargo ${direction === 'forward' ? 'aft' : 'forward'} to correct balance.`
      });
    });
  }
  
  if (result.unloaded_items.length > 0) {
    const unloadedWeight = result.unloaded_items.reduce((sum, i) => sum + i.weight_each_lb * i.quantity, 0);
    insights.push({
      id: 'unloaded_items',
      category: 'risk_factor',
      severity: 'critical',
      title: `${result.unloaded_items.length} Items Could Not Be Loaded`,
      description: `${(unloadedWeight / 1000).toFixed(0)}K lbs of cargo requires additional aircraft or alternative transport.`,
      affected_items: result.unloaded_items.map(i => i.item_id),
      recommendation: 'Add additional aircraft to mission or coordinate surface/sealift for oversize items.'
    });
  }

  const heavyPlans = result.load_plans.filter(p => p.payload_used_percent > 95);
  if (heavyPlans.length > 0) {
    insights.push({
      id: 'near_max_weight',
      category: 'risk_factor',
      severity: 'warning',
      title: `${heavyPlans.length} Aircraft Near Max Payload`,
      description: `These aircraft are above 95% payload capacity. Fuel planning should account for heavier takeoff weight.`,
      affected_items: heavyPlans.map(p => p.aircraft_id),
      recommendation: 'Verify runway length and atmospheric conditions support heavy weight operations.'
    });
  }

  const positionLimited = result.load_plans.filter(p => 
    p.positions_used >= p.positions_available && p.payload_used_percent < 80
  );
  if (positionLimited.length > 0) {
    insights.push({
      id: 'position_limited',
      category: 'inefficiency',
      severity: 'info',
      title: `${positionLimited.length} Aircraft Position-Limited`,
      description: `All pallet positions filled but only ${positionLimited[0]?.payload_used_percent.toFixed(0)}% weight capacity used. Pallets may be underloaded.`,
      affected_items: positionLimited.map(p => p.aircraft_id),
      recommendation: 'Consider combining lighter pallets to free positions for additional cargo.'
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
  
  if (firstAircraft.payload_used_percent > 90) {
    explanation += `1. First aircraft reached ${firstAircraft.payload_used_percent.toFixed(0)}% of payload capacity.\n`;
  }
  
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

// ============================================================================
// SECTION 13.4: QUICK INSIGHTS FOR ANALYTICS PANEL
// ============================================================================

export function generateQuickInsights(
  allocationResult: AllocationResult,
  fuelBreakdown?: { base_fuel_lb: number; additional_fuel_from_splits: number; cost_per_lb: number } | null
): string[] {
  const insights: string[] = [];
  
  const avgUtilization = allocationResult.load_plans.reduce(
    (sum, p) => sum + p.utilization_percent, 0
  ) / allocationResult.load_plans.length;
  
  if (avgUtilization < 70) {
    const wastedCapacity = allocationResult.load_plans.reduce((sum, p) => {
      const spec = AIRCRAFT_SPECS[p.aircraft_type];
      return sum + (spec.max_payload - p.total_weight);
    }, 0);
    insights.push(
      `Fleet utilization at ${avgUtilization.toFixed(0)}% leaves ${(wastedCapacity/1000).toFixed(0)}K lbs unused. Consider reducing aircraft count.`
    );
  } else if (avgUtilization > 90) {
    insights.push(
      `Excellent fleet efficiency at ${avgUtilization.toFixed(0)}% utilization. All aircraft well-loaded.`
    );
  }
  
  const avgCoB = allocationResult.load_plans.reduce(
    (sum, p) => sum + p.cob_percent, 0
  ) / allocationResult.load_plans.length;
  
  const cobOutOfEnvelope = allocationResult.load_plans.filter(p => !p.cob_in_envelope);
  if (cobOutOfEnvelope.length > 0) {
    insights.push(
      `⚠️ ${cobOutOfEnvelope.length} aircraft have Center of Balance outside limits. Immediate cargo repositioning required.`
    );
  } else if (avgCoB >= 25 && avgCoB <= 30) {
    insights.push(
      `Center of Balance averaging ${avgCoB.toFixed(1)}% across fleet - optimally centered in safe envelope.`
    );
  } else {
    insights.push(
      `Center of Balance at ${avgCoB.toFixed(1)}% is within limits but could be better centered (target: 27-28%).`
    );
  }
  
  if (fuelBreakdown && fuelBreakdown.additional_fuel_from_splits > 0) {
    const additionalCost = fuelBreakdown.additional_fuel_from_splits * fuelBreakdown.cost_per_lb;
    insights.push(
      `Cargo splitting adds ${(fuelBreakdown.additional_fuel_from_splits/1000).toFixed(0)}K lbs fuel (+$${(additionalCost/1000).toFixed(0)}K). Consolidating flights could save this cost.`
    );
  }
  
  if (allocationResult.total_aircraft > 3) {
    insights.push(
      `Large ${allocationResult.total_aircraft}-aircraft formation. Stagger departures by 15-30 min to avoid airspace congestion and optimize ground handling.`
    );
  }
  
  const hazmatPlans = allocationResult.load_plans.filter(p => 
    p.pallets.some(pl => pl.pallet.hazmat_flag)
  );
  if (hazmatPlans.length > 0) {
    const hazmatPallets = hazmatPlans.reduce((sum, p) => 
      sum + p.pallets.filter(pl => pl.pallet.hazmat_flag).length, 0
    );
    insights.push(
      `${hazmatPallets} HAZMAT pallets on ${hazmatPlans.length} aircraft. Ensure certified load crews and proper segregation.`
    );
  }
  
  return insights;
}

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, RefreshCw, AlertTriangle, CheckCircle, Info, Plane, Package, Users, Scale, Fuel, ArrowRightLeft, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { useAiInsights, AiInsight } from '../hooks/useAiInsights';
import { AllocationResult } from '../lib/pacafTypes';

interface FlightInsightsPanelProps {
  flightPlanId: number;
  allocationResult: AllocationResult;
  className?: string;
}

interface FlightAllocationAnalysis {
  executive_summary: string;
  fleet_status: {
    aircraft_used: number;
    total_pallets_loaded: number;
    total_rolling_stock_loaded: number;
    total_pax: number;
    total_cargo_weight_lb: number;
    average_utilization_percent: number;
  };
  aircraft_selection_rationale?: {
    c17_rationale: string;
    c130_rationale: string;
    fleet_mix_reasoning: string;
  };
  allocation_issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    recommendation: string;
  }>;
  cargo_shift_recommendations?: Array<{
    from_aircraft: string;
    to_aircraft: string;
    item_description: string;
    reason: string;
  }>;
  cob_summary: {
    aircraft_in_envelope: number;
    aircraft_out_of_envelope: number;
    worst_offender: string | null;
    corrective_action: string;
    per_aircraft_cob?: Array<{
      aircraft_id: string;
      cob_percent: number;
      status: 'in_envelope' | 'marginal' | 'out_of_envelope';
    }>;
  };
  special_cargo_notes?: {
    advon_items: string;
    hazmat_items: string;
    oversized_items: string;
  };
  pax_analysis?: {
    total_passengers: number;
    seat_utilization: string;
    pax_considerations: string;
  };
  fueling_considerations?: {
    estimated_fuel_impact: string;
    range_notes: string;
  };
  fleet_shortage_analysis: {
    has_unloaded_cargo: boolean;
    unloaded_item_count: number;
    unloaded_weight_lb: number;
    recommended_additional_aircraft: Array<{
      type: string;
      count: number;
      rationale: string;
    }>;
  };
  optimization_notes: string[];
}

export default function FlightInsightsPanel({
  flightPlanId,
  allocationResult,
  className = '',
}: FlightInsightsPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    insights,
    isLoading,
    error,
    isRateLimited,
    rateLimitRetryAfter,
    generateInsight,
    generateError,
    getInsightByType,
  } = useAiInsights({ flightPlanId, enabled: flightPlanId > 0 });

  const currentInsight = useMemo(
    () => getInsightByType('flight_allocation_analysis'),
    [getInsightByType]
  );

  const analysisContent = useMemo(() => {
    if (!currentInsight?.content) return null;
    return currentInsight.content as unknown as FlightAllocationAnalysis;
  }, [currentInsight]);

  const buildInputData = useCallback(() => {
    const loadPlans = allocationResult.load_plans.map(plan => ({
      aircraft_id: plan.aircraft_id,
      aircraft_type: plan.aircraft_type,
      phase: plan.phase,
      total_weight: plan.total_weight,
      utilization_percent: plan.utilization_percent,
      cob_percent: plan.cob_percent,
      cob_in_envelope: plan.cob_in_envelope,
      pallet_count: plan.pallets.length,
      rolling_stock_count: plan.rolling_stock.length,
      pax_count: plan.pax_count,
    }));

    const unloadedItems = allocationResult.unloaded_items.map(item => ({
      item_id: item.item_id,
      description: item.description,
      weight_lb: item.weight_each_lb * item.quantity,
      quantity: item.quantity,
      length_in: item.length_in,
      width_in: item.width_in,
      height_in: item.height_in,
    }));

    const totalWeight = loadPlans.reduce((sum, p) => sum + p.total_weight, 0);
    const avgUtilization = loadPlans.length > 0
      ? loadPlans.reduce((sum, p) => sum + p.utilization_percent, 0) / loadPlans.length
      : 0;
    const cobIssues = loadPlans.filter(p => !p.cob_in_envelope);
    const unloadedWeight = unloadedItems.reduce((sum, i) => sum + i.weight_lb, 0);

    return {
      summary: {
        aircraft_count: loadPlans.length,
        total_pallets: loadPlans.reduce((sum, p) => sum + p.pallet_count, 0),
        total_rolling_stock: loadPlans.reduce((sum, p) => sum + p.rolling_stock_count, 0),
        total_pax: loadPlans.reduce((sum, p) => sum + p.pax_count, 0),
        total_cargo_weight_lb: totalWeight,
        average_utilization_percent: avgUtilization,
        cob_issues_count: cobIssues.length,
        unloaded_item_count: unloadedItems.length,
        unloaded_weight_lb: unloadedWeight,
      },
      load_plans: loadPlans,
      unloaded_items: unloadedItems,
      cob_issues: cobIssues.map(p => ({
        aircraft_id: p.aircraft_id,
        cob_percent: p.cob_percent,
      })),
    };
  }, [allocationResult]);

  const handleGenerate = useCallback(async () => {
    if (isRateLimited || isGenerating) return;

    setIsGenerating(true);
    try {
      const inputData = buildInputData();
      await generateInsight({
        type: 'flight_allocation_analysis',
        inputData,
        flightPlanId: flightPlanId > 0 ? flightPlanId : null,
        forceRegenerate: !!currentInsight,
      });
    } catch (err) {
      console.error('Failed to generate flight analysis:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [generateInsight, buildInputData, flightPlanId, isRateLimited, isGenerating, currentInsight]);

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-700';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const safeAnalysis = useMemo(() => {
    if (!analysisContent) return null;
    return {
      executive_summary: analysisContent.executive_summary || '',
      fleet_status: {
        aircraft_used: analysisContent.fleet_status?.aircraft_used ?? 0,
        total_pallets_loaded: analysisContent.fleet_status?.total_pallets_loaded ?? 0,
        total_rolling_stock_loaded: analysisContent.fleet_status?.total_rolling_stock_loaded ?? 0,
        total_pax: analysisContent.fleet_status?.total_pax ?? 0,
        total_cargo_weight_lb: analysisContent.fleet_status?.total_cargo_weight_lb ?? 0,
        average_utilization_percent: analysisContent.fleet_status?.average_utilization_percent ?? 0,
      },
      aircraft_selection_rationale: analysisContent.aircraft_selection_rationale ? {
        c17_rationale: analysisContent.aircraft_selection_rationale.c17_rationale || '',
        c130_rationale: analysisContent.aircraft_selection_rationale.c130_rationale || '',
        fleet_mix_reasoning: analysisContent.aircraft_selection_rationale.fleet_mix_reasoning || '',
      } : null,
      allocation_issues: Array.isArray(analysisContent.allocation_issues) ? analysisContent.allocation_issues : [],
      cargo_shift_recommendations: Array.isArray(analysisContent.cargo_shift_recommendations) 
        ? analysisContent.cargo_shift_recommendations 
        : [],
      cob_summary: {
        aircraft_in_envelope: analysisContent.cob_summary?.aircraft_in_envelope ?? 0,
        aircraft_out_of_envelope: analysisContent.cob_summary?.aircraft_out_of_envelope ?? 0,
        worst_offender: analysisContent.cob_summary?.worst_offender || null,
        corrective_action: analysisContent.cob_summary?.corrective_action || '',
        per_aircraft_cob: Array.isArray(analysisContent.cob_summary?.per_aircraft_cob)
          ? analysisContent.cob_summary.per_aircraft_cob
          : [],
      },
      special_cargo_notes: analysisContent.special_cargo_notes ? {
        advon_items: analysisContent.special_cargo_notes.advon_items || '',
        hazmat_items: analysisContent.special_cargo_notes.hazmat_items || '',
        oversized_items: analysisContent.special_cargo_notes.oversized_items || '',
      } : null,
      pax_analysis: analysisContent.pax_analysis ? {
        total_passengers: analysisContent.pax_analysis.total_passengers ?? 0,
        seat_utilization: analysisContent.pax_analysis.seat_utilization || '',
        pax_considerations: analysisContent.pax_analysis.pax_considerations || '',
      } : null,
      fueling_considerations: analysisContent.fueling_considerations ? {
        estimated_fuel_impact: analysisContent.fueling_considerations.estimated_fuel_impact || '',
        range_notes: analysisContent.fueling_considerations.range_notes || '',
      } : null,
      fleet_shortage_analysis: {
        has_unloaded_cargo: analysisContent.fleet_shortage_analysis?.has_unloaded_cargo ?? false,
        unloaded_item_count: analysisContent.fleet_shortage_analysis?.unloaded_item_count ?? 0,
        unloaded_weight_lb: analysisContent.fleet_shortage_analysis?.unloaded_weight_lb ?? 0,
        recommended_additional_aircraft: Array.isArray(analysisContent.fleet_shortage_analysis?.recommended_additional_aircraft)
          ? analysisContent.fleet_shortage_analysis.recommended_additional_aircraft
          : [],
      },
      optimization_notes: Array.isArray(analysisContent.optimization_notes) ? analysisContent.optimization_notes : [],
    };
  }, [analysisContent]);

  return (
    <aside className={className}>
      <div className="bg-white/50 backdrop-blur-sm p-4 overflow-auto h-full">
        <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h2 className="text-neutral-900 font-bold">AI Insights</h2>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating || isRateLimited}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
            isGenerating || isRateLimited
              ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          {currentInsight ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {isRateLimited && rateLimitRetryAfter && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          Rate limited. Try again in {Math.ceil(rateLimitRetryAfter / 1000)}s
        </div>
      )}

      {generateError && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {generateError.message}
        </div>
      )}

      {!currentInsight && !isGenerating && (
        <div className="text-center py-8 text-neutral-500">
          <Bot className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
          <p className="text-sm">Click Generate to get AI-powered analysis of your flight allocation</p>
        </div>
      )}

      {currentInsight && !safeAnalysis && !isGenerating && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium text-sm">Analysis Format Issue</span>
          </div>
          <p className="text-sm">The AI response couldn't be parsed correctly. Try regenerating.</p>
        </div>
      )}

      {isGenerating && (
        <div className="text-center py-8">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 text-primary animate-spin" />
          <p className="text-sm text-neutral-500">Analyzing allocation...</p>
        </div>
      )}

        <AnimatePresence>
          {safeAnalysis && !isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="p-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
                <p className="text-neutral-700 text-sm leading-relaxed">
                  {safeAnalysis.executive_summary}
                </p>
                {currentInsight?.fromCache && (
                  <span className="inline-block mt-2 text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                    Cached
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-blue-50 text-center">
                  <Plane className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                  <div className="text-lg font-bold text-blue-700">{safeAnalysis.fleet_status.aircraft_used}</div>
                  <div className="text-xs text-blue-600">Aircraft</div>
                </div>
                <div className="p-2 rounded-lg bg-green-50 text-center">
                  <Package className="w-4 h-4 mx-auto text-green-600 mb-1" />
                  <div className="text-lg font-bold text-green-700">{safeAnalysis.fleet_status.total_pallets_loaded}</div>
                  <div className="text-xs text-green-600">Pallets</div>
                </div>
                <div className="p-2 rounded-lg bg-purple-50 text-center">
                  <Users className="w-4 h-4 mx-auto text-purple-600 mb-1" />
                  <div className="text-lg font-bold text-purple-700">{safeAnalysis.fleet_status.total_pax}</div>
                  <div className="text-xs text-purple-600">PAX</div>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 text-center">
                  <Scale className="w-4 h-4 mx-auto text-amber-600 mb-1" />
                  <div className="text-lg font-bold text-amber-700">{Math.round(safeAnalysis.fleet_status.average_utilization_percent)}%</div>
                  <div className="text-xs text-amber-600">Avg Util</div>
                </div>
              </div>

              {safeAnalysis.allocation_issues.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-neutral-700">Issues & Recommendations</h3>
                  {safeAnalysis.allocation_issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border ${getSeverityStyles(issue.severity)}`}
                    >
                      <div className="flex items-start gap-2">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{issue.title}</h4>
                          <p className="text-sm mt-1 opacity-90">{issue.description}</p>
                          {issue.recommendation && (
                            <p className="text-xs mt-2 italic opacity-75">
                              {issue.recommendation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {safeAnalysis.fleet_shortage_analysis.has_unloaded_cargo && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <h3 className="font-bold text-red-700">Fleet Shortage</h3>
                  </div>
                  <p className="text-sm text-red-700 mb-2">
                    {safeAnalysis.fleet_shortage_analysis.unloaded_item_count} items 
                    ({(safeAnalysis.fleet_shortage_analysis.unloaded_weight_lb / 1000).toFixed(1)}K lb) 
                    could not be loaded due to insufficient aircraft capacity.
                  </p>
                  {safeAnalysis.fleet_shortage_analysis.recommended_additional_aircraft.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-red-700">Recommended Additional Aircraft:</p>
                      {safeAnalysis.fleet_shortage_analysis.recommended_additional_aircraft.map((rec, idx) => (
                        <div key={idx} className="text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                          +{rec.count} {rec.type}: {rec.rationale}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {safeAnalysis.cob_summary.aircraft_out_of_envelope > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Scale className="w-4 h-4 text-amber-600" />
                    <h3 className="font-medium text-amber-700">Center of Balance</h3>
                  </div>
                  <p className="text-sm text-amber-700">
                    {safeAnalysis.cob_summary.aircraft_out_of_envelope} aircraft out of CoB envelope
                    {safeAnalysis.cob_summary.worst_offender && ` (worst: ${safeAnalysis.cob_summary.worst_offender})`}
                  </p>
                  {safeAnalysis.cob_summary.corrective_action && (
                    <p className="text-xs text-amber-600 mt-1 italic">
                      {safeAnalysis.cob_summary.corrective_action}
                    </p>
                  )}
                </div>
              )}

              {safeAnalysis.cob_summary.aircraft_out_of_envelope === 0 && (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700">All aircraft within CoB envelope</span>
                  </div>
                </div>
              )}

              {/* Aircraft Selection Rationale */}
              {safeAnalysis.aircraft_selection_rationale && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <button 
                    onClick={() => toggleSection('rationale')}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Plane className="w-4 h-4 text-slate-600" />
                      <h3 className="font-medium text-slate-700">Aircraft Selection Rationale</h3>
                    </div>
                    {expandedSections.rationale ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {expandedSections.rationale && (
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {safeAnalysis.aircraft_selection_rationale.c17_rationale && (
                        <div className="bg-white rounded p-2">
                          <span className="font-medium text-slate-700">C-17:</span> {safeAnalysis.aircraft_selection_rationale.c17_rationale}
                        </div>
                      )}
                      {safeAnalysis.aircraft_selection_rationale.c130_rationale && (
                        <div className="bg-white rounded p-2">
                          <span className="font-medium text-slate-700">C-130:</span> {safeAnalysis.aircraft_selection_rationale.c130_rationale}
                        </div>
                      )}
                      {safeAnalysis.aircraft_selection_rationale.fleet_mix_reasoning && (
                        <div className="bg-white rounded p-2 italic">
                          {safeAnalysis.aircraft_selection_rationale.fleet_mix_reasoning}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cargo Shift Recommendations */}
              {safeAnalysis.cargo_shift_recommendations.length > 0 && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <button 
                    onClick={() => toggleSection('shifts')}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-medium text-indigo-700">Cargo Shift Recommendations</h3>
                    </div>
                    {expandedSections.shifts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {expandedSections.shifts && (
                    <div className="mt-3 space-y-2">
                      {safeAnalysis.cargo_shift_recommendations.map((shift, idx) => (
                        <div key={idx} className="bg-white rounded p-2 text-sm">
                          <div className="font-medium text-indigo-700">
                            {shift.from_aircraft} → {shift.to_aircraft}
                          </div>
                          <div className="text-indigo-600">{shift.item_description}</div>
                          <div className="text-xs text-indigo-500 italic mt-1">{shift.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Special Cargo Notes (ADVON/HAZMAT) */}
              {safeAnalysis.special_cargo_notes && (
                <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                  <button 
                    onClick={() => toggleSection('cargo')}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-orange-600" />
                      <h3 className="font-medium text-orange-700">Special Cargo Notes</h3>
                    </div>
                    {expandedSections.cargo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {expandedSections.cargo && (
                    <div className="mt-3 space-y-2 text-sm">
                      {safeAnalysis.special_cargo_notes.advon_items && (
                        <div className="bg-white rounded p-2">
                          <span className="font-medium text-orange-700">ADVON:</span>
                          <span className="text-orange-600 ml-1">{safeAnalysis.special_cargo_notes.advon_items}</span>
                        </div>
                      )}
                      {safeAnalysis.special_cargo_notes.hazmat_items && (
                        <div className="bg-white rounded p-2">
                          <span className="font-medium text-red-700">HAZMAT:</span>
                          <span className="text-red-600 ml-1">{safeAnalysis.special_cargo_notes.hazmat_items}</span>
                        </div>
                      )}
                      {safeAnalysis.special_cargo_notes.oversized_items && (
                        <div className="bg-white rounded p-2">
                          <span className="font-medium text-orange-700">Oversized:</span>
                          <span className="text-orange-600 ml-1">{safeAnalysis.special_cargo_notes.oversized_items}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* PAX Analysis */}
              {safeAnalysis.pax_analysis && safeAnalysis.pax_analysis.total_passengers > 0 && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
                  <button 
                    onClick={() => toggleSection('pax')}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      <h3 className="font-medium text-purple-700">PAX Analysis ({safeAnalysis.pax_analysis.total_passengers})</h3>
                    </div>
                    {expandedSections.pax ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {expandedSections.pax && (
                    <div className="mt-3 space-y-2 text-sm text-purple-600">
                      {safeAnalysis.pax_analysis.seat_utilization && (
                        <div className="bg-white rounded p-2">{safeAnalysis.pax_analysis.seat_utilization}</div>
                      )}
                      {safeAnalysis.pax_analysis.pax_considerations && (
                        <div className="bg-white rounded p-2 italic">{safeAnalysis.pax_analysis.pax_considerations}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Fueling Considerations */}
              {safeAnalysis.fueling_considerations && (
                <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200">
                  <button 
                    onClick={() => toggleSection('fuel')}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-cyan-600" />
                      <h3 className="font-medium text-cyan-700">Fueling Considerations</h3>
                    </div>
                    {expandedSections.fuel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {expandedSections.fuel && (
                    <div className="mt-3 space-y-2 text-sm text-cyan-600">
                      {safeAnalysis.fueling_considerations.estimated_fuel_impact && (
                        <div className="bg-white rounded p-2">{safeAnalysis.fueling_considerations.estimated_fuel_impact}</div>
                      )}
                      {safeAnalysis.fueling_considerations.range_notes && (
                        <div className="bg-white rounded p-2 italic">{safeAnalysis.fueling_considerations.range_notes}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Per-Aircraft CoB Details */}
              {safeAnalysis.cob_summary.per_aircraft_cob && safeAnalysis.cob_summary.per_aircraft_cob.length > 0 && (
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <button 
                    onClick={() => toggleSection('cob_details')}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-teal-600" />
                      <h3 className="font-medium text-teal-700">Per-Aircraft CoB Details</h3>
                    </div>
                    {expandedSections.cob_details ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {expandedSections.cob_details && (
                    <div className="mt-3 space-y-1">
                      {safeAnalysis.cob_summary.per_aircraft_cob.map((ac, idx) => (
                        <div key={idx} className={`flex justify-between items-center rounded px-2 py-1 text-sm ${
                          ac.status === 'in_envelope' ? 'bg-green-100 text-green-700' :
                          ac.status === 'marginal' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          <span className="font-medium">{ac.aircraft_id}</span>
                          <span>{ac.cob_percent.toFixed(1)}% MAC</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {safeAnalysis.optimization_notes.length > 0 && (
                <div className="border-t border-neutral-200 pt-3">
                  <h3 className="text-sm font-medium text-neutral-700 mb-2">Optimization Notes</h3>
                  <ul className="space-y-1">
                    {safeAnalysis.optimization_notes.map((note, idx) => (
                      <li key={idx} className="text-xs text-neutral-600 flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">→</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}

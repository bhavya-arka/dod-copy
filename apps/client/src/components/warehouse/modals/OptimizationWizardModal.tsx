import React, { useState, useEffect, useMemo } from "react";
import { X, Loader2, ChevronRight, ChevronLeft, Check, Layers, Ruler, DollarSign, Box, FileDown, Play, Save, AlertCircle, Zap, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import type { WarehouseSite, WarehouseZone, ToastMessage } from "../types";
import { runOptimizationWizard, runAllOptimizations, applyOptimizationPlan, createOptimizationPlan, fetchSiteZones, type OptimizationWizardResult, type CreatePlanData } from "../../../services/warehouseService";
import { generateWarehouseOptimizationPDF } from "../../../lib/warehouseOptimizationPdfExport";

export type Algorithm = "cardstack" | "size_standardization" | "value_density" | "bin_packing" | "name_consolidation" | "run_all";

interface OptimizationWizardModalProps {
  siteId: number;
  siteName: string;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
  initialAlgorithm?: Algorithm | null;
}

interface AlgorithmOption {
  id: Algorithm;
  name: string;
  description: string;
  bullets: string[];
  icon: React.ReactNode;
}

const ALGORITHMS: AlgorithmOption[] = [
  {
    id: "run_all",
    name: "Run All (Recommended)",
    description: "Execute all 4 algorithms in optimal sequence for comprehensive optimization.",
    bullets: [
      "Runs CardStack → Size → Value → Bin-Packing in order",
      "De-duplicates overlapping recommendations automatically",
      "Produces a unified action plan with prioritized moves",
      "Best for initial warehouse optimization or periodic audits",
    ],
    icon: <Zap className="w-6 h-6" />,
  },
  {
    id: "cardstack",
    name: "CardStack",
    description: "Consolidate items for the same ship class scattered across zones.",
    bullets: [
      "Groups items by ship class (e.g., DDG-51, CVN-78)",
      "Reduces travel time for picking related items",
      "Frees up scattered slots for new inventory",
      "Prioritizes high-frequency access items",
    ],
    icon: <Layers className="w-6 h-6" />,
  },
  {
    id: "size_standardization",
    name: "Size Standardization",
    description: "Organize items by program code into dedicated zones.",
    bullets: [
      "Groups items by program (PM1, PM3, etc.)",
      "Creates logical zones for each maintenance program",
      "Improves rack utilization by standardizing storage",
      "Reduces picking errors with clear zone assignments",
    ],
    icon: <Ruler className="w-6 h-6" />,
  },
  {
    id: "value_density",
    name: "Value Density Analysis",
    description: "Place high-value items in accessible, secure locations.",
    bullets: [
      "Calculates value-to-volume ratio for each item",
      "Moves high-value items to accessible locations (lower shelf numbers)",
      "Flags items in remote locations (shelf >1500) for relocation",
      "Improves inventory security and audit efficiency",
    ],
    icon: <DollarSign className="w-6 h-6" />,
  },
  {
    id: "bin_packing",
    name: "Bin-Packing Order",
    description: "Calculate optimal placement for maximum container utilization.",
    bullets: [
      "Analyzes weight and volume constraints per location",
      "Suggests consolidation to free up pallet positions",
      "Optimizes for 463L pallet loading sequences",
      "Balances load distribution across warehouse zones",
    ],
    icon: <Box className="w-6 h-6" />,
  },
  {
    id: "name_consolidation",
    name: "Name Consolidation",
    description: "Group items with identical names together for easier picking.",
    bullets: [
      "Finds items with the same name scattered across zones",
      "Consolidates matching items to a single location",
      "Reduces travel time for picking duplicate items",
      "Improves inventory visibility for same-name products",
    ],
    icon: <Layers className="w-6 h-6" />,
  },
];

interface ZoneConstraints {
  sourceZoneIds: number[];
  targetZoneIds: number[];
  enableZoneFiltering: boolean;
}

interface AlgorithmParams {
  cardstack: { minItemsToConsolidate: number; maxActionsToGenerate: number };
  size_standardization: { minProgramItems: number; maxActionsToGenerate: number };
  value_density: { highValueThreshold: number; zoneDistanceMultiplier: number };
  bin_packing: { maxItemsPerPallet: number; prioritizeByValue: boolean };
  name_consolidation: { minItemsToConsolidate: number; maxActionsToGenerate: number };
  zoneConstraints: ZoneConstraints;
}

const DEFAULT_ZONE_CONSTRAINTS: ZoneConstraints = {
  sourceZoneIds: [],
  targetZoneIds: [],
  enableZoneFiltering: false,
};

const DEFAULT_PARAMS: AlgorithmParams = {
  cardstack: { minItemsToConsolidate: 2, maxActionsToGenerate: 50 },
  size_standardization: { minProgramItems: 3, maxActionsToGenerate: 50 },
  value_density: { highValueThreshold: 1000, zoneDistanceMultiplier: 1.5 },
  bin_packing: { maxItemsPerPallet: 15, prioritizeByValue: true },
  name_consolidation: { minItemsToConsolidate: 2, maxActionsToGenerate: 50 },
  zoneConstraints: DEFAULT_ZONE_CONSTRAINTS,
};

export default function OptimizationWizardModal({
  siteId,
  siteName,
  onClose,
  onSuccess,
  onShowToast,
  initialAlgorithm,
}: OptimizationWizardModalProps) {
  const [step, setStep] = useState(1);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<Algorithm | null>(initialAlgorithm || null);
  const [params, setParams] = useState<AlgorithmParams>(DEFAULT_PARAMS);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OptimizationWizardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ high: true, medium: false, low: false });
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialAlgorithm) {
      setSelectedAlgorithm(initialAlgorithm);
    }
  }, [initialAlgorithm]);

  useEffect(() => {
    const loadZones = async () => {
      try {
        const fetchedZones = await fetchSiteZones(siteId);
        setZones(fetchedZones);
      } catch (err) {
        console.error("Failed to fetch zones:", err);
      } finally {
        setZonesLoading(false);
      }
    };
    loadZones();
  }, [siteId]);

  const steps = [
    { number: 1, label: "Select Algorithm" },
    { number: 2, label: "Configure Parameters" },
    { number: 3, label: "Run Analysis" },
    { number: 4, label: "Review Action Plan" },
    { number: 5, label: "Export & Apply" },
  ];

  const canProceed = () => {
    switch (step) {
      case 1:
        return selectedAlgorithm !== null;
      case 2:
        return true;
      case 3:
        return result !== null;
      case 4:
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (step === 2) {
      setStep(3);
      await runAnalysis();
    } else if (step < 5) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const runAnalysis = async () => {
    if (!selectedAlgorithm) return;

    setLoading(true);
    setError(null);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 500);

    try {
      let optimizationResult: OptimizationWizardResult;
      
      if (selectedAlgorithm === "run_all") {
        optimizationResult = await runAllOptimizations(siteId, params);
      } else {
        // Merge algorithm-specific params with zone constraints
        const algorithmParams = {
          ...params[selectedAlgorithm],
          zoneConstraints: params.zoneConstraints,
        };
        optimizationResult = await runOptimizationWizard(siteId, selectedAlgorithm, algorithmParams);
      }
      
      setProgress(100);
      setResult(optimizationResult);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run optimization");
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
    }
  };

  const handleApplyChanges = async () => {
    if (!result?.runId) return;

    setApplying(true);
    try {
      await applyOptimizationPlan(siteId, result.runId);
      onShowToast("Optimization plan applied successfully!", "success");
      onSuccess();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to apply changes", "error");
    } finally {
      setApplying(false);
    }
  };

  const handleExportPdf = () => {
    if (!result) {
      onShowToast("No optimization results to export", "error");
      return;
    }
    try {
      generateWarehouseOptimizationPDF(result, { siteName });
      onShowToast("PDF exported successfully!", "success");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to export PDF", "error");
    }
  };

  const formatAlgorithmName = (algorithm: string): string => {
    const names: Record<string, string> = {
      cardstack: "CardStack",
      size_standardization: "Size Standardization",
      value_density: "Value Density",
      bin_packing: "Bin-Packing",
      name_consolidation: "Name Consolidation",
      run_all: "Full Optimization",
    };
    return names[algorithm] || algorithm;
  };

  const handleSavePlan = async () => {
    if (!result || !selectedAlgorithm) {
      onShowToast("No optimization results to save", "error");
      return;
    }
    
    setSaving(true);
    try {
      const planData: CreatePlanData = {
        name: `${formatAlgorithmName(selectedAlgorithm)} - ${new Date().toLocaleDateString()}`,
        algorithm: selectedAlgorithm,
        diff_patch: result.actions || [],
        summary: {
          slotsFreed: result.summary?.slotsFreed || 0,
          consolidationWins: result.summary?.consolidationWins || "0",
          zonesOptimized: result.summary?.zonesOptimized || 0,
          pickEfficiencyGain: result.summary?.pickEfficiencyGain || "0%",
          itemsAffected: result.summary?.itemsAffected || 0,
          actionsGenerated: result.actions?.length || 0,
        },
        actions: (result.actions || []).map((action, index) => ({
          item_id: parseInt(action.id) || 0,
          action_type: action.action || "move",
          from_location: action.from || null,
          to_location: action.to || null,
          quantity: 1,
          sequence: index,
        })),
      };

      await createOptimizationPlan(siteId, planData);
      onShowToast("Plan saved to database!", "success");
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : "Failed to save plan", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateParam = (algorithm: Algorithm, key: string, value: number) => {
    setParams((prev) => ({
      ...prev,
      [algorithm]: {
        ...prev[algorithm],
        [key]: value,
      },
    }));
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select an optimization algorithm to analyze your warehouse layout and generate improvement recommendations.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ALGORITHMS.map((algo) => (
          <button
            key={algo.id}
            onClick={() => setSelectedAlgorithm(algo.id)}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectedAlgorithm === algo.id
                ? "border-[#2563EB] bg-[#2563EB]/5"
                : "border-border hover:border-[#2563EB]/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg flex-shrink-0 ${
                  selectedAlgorithm === algo.id ? "bg-[#2563EB] text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {algo.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{algo.name}</p>
                  {selectedAlgorithm === algo.id && (
                    <Check className="w-5 h-5 text-[#2563EB] flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{algo.description}</p>
                <ul className="mt-2 space-y-1">
                  {algo.bullets.map((bullet, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-[#2563EB] mt-0.5">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep2 = () => {
    if (!selectedAlgorithm) return null;

    const renderCardStackParams = () => (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Consolidates items for the same ship class that are scattered across multiple zones.
        </p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Minimum Items to Consolidate
          </label>
          <input
            type="range"
            min="2"
            max="10"
            value={params.cardstack.minItemsToConsolidate}
            onChange={(e) => updateParam("cardstack", "minItemsToConsolidate", parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>2 (More suggestions)</span>
            <span className="font-medium text-foreground">{params.cardstack.minItemsToConsolidate} items</span>
            <span>10 (Only large groups)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Only suggest consolidation if this many items for a ship are in different zones.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Max Actions to Generate
          </label>
          <input
            type="number"
            min="10"
            max="100"
            value={params.cardstack.maxActionsToGenerate}
            onChange={(e) => updateParam("cardstack", "maxActionsToGenerate", parseInt(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Limit recommendations to focus on highest-impact moves.</p>
        </div>
      </div>
    );

    const renderSizeStandardizationParams = () => (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Organizes items by program code (PM1, PM3, etc.) into dedicated zones for each program.
        </p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Minimum Items Per Program
          </label>
          <input
            type="range"
            min="2"
            max="10"
            value={params.size_standardization.minProgramItems}
            onChange={(e) => updateParam("size_standardization", "minProgramItems", parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>2 (Include small programs)</span>
            <span className="font-medium text-foreground">{params.size_standardization.minProgramItems} items</span>
            <span>10 (Major programs only)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Only standardize programs with at least this many items in the warehouse.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Max Actions to Generate
          </label>
          <input
            type="number"
            min="10"
            max="100"
            value={params.size_standardization.maxActionsToGenerate}
            onChange={(e) => updateParam("size_standardization", "maxActionsToGenerate", parseInt(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Limit recommendations to focus on highest-impact moves.</p>
        </div>
      </div>
    );

    const renderValueDensityParams = () => (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Moves high-value items to more accessible zones (lower zone numbers = closer to dock).
        </p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            High Value Threshold ($)
          </label>
          <input
            type="number"
            min="100"
            max="100000"
            step="100"
            value={params.value_density.highValueThreshold}
            onChange={(e) => updateParam("value_density", "highValueThreshold", parseInt(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Items valued above this amount are considered high-priority.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Zone Distance Threshold
          </label>
          <input
            type="range"
            min="1.2"
            max="3"
            step="0.1"
            value={params.value_density.zoneDistanceMultiplier}
            onChange={(e) => updateParam("value_density", "zoneDistanceMultiplier", parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1.2x (Aggressive)</span>
            <span className="font-medium text-foreground">{params.value_density.zoneDistanceMultiplier}x</span>
            <span>3x (Only far items)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Suggest moving items when zone number exceeds accessible zone by this multiplier.
          </p>
        </div>
      </div>
    );

    const renderBinPackingParams = () => (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Stages items by disposition (SHORESIDE, RESIDUAL) onto pallets organized by ship class for efficient shipping.
        </p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Max Items Per Pallet
          </label>
          <input
            type="range"
            min="5"
            max="30"
            value={params.bin_packing.maxItemsPerPallet}
            onChange={(e) => updateParam("bin_packing", "maxItemsPerPallet", parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>5 (Smaller pallets)</span>
            <span className="font-medium text-foreground">{params.bin_packing.maxItemsPerPallet} items</span>
            <span>30 (Larger pallets)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            How many items to group onto each staging pallet.
          </p>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(params.bin_packing.prioritizeByValue)}
              onChange={(e) => {
                setParams(prev => ({
                  ...prev,
                  bin_packing: { ...prev.bin_packing, prioritizeByValue: e.target.checked }
                }));
              }}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm font-medium text-foreground">Prioritize high-value items first</span>
          </label>
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            When enabled, high-value items are staged before lower-value items within each disposition group.
          </p>
        </div>
      </div>
    );

    const renderNameConsolidationParams = () => (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Finds items with identical names scattered across multiple zones and consolidates them to a single location.
        </p>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Minimum Items to Consolidate
          </label>
          <input
            type="range"
            min="2"
            max="10"
            value={params.name_consolidation.minItemsToConsolidate}
            onChange={(e) => updateParam("name_consolidation", "minItemsToConsolidate", parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>2 (More suggestions)</span>
            <span className="font-medium text-foreground">{params.name_consolidation.minItemsToConsolidate} items</span>
            <span>10 (Only large groups)</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Only suggest consolidation if this many items share the same name across different zones.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Max Actions to Generate
          </label>
          <input
            type="number"
            min="10"
            max="100"
            value={params.name_consolidation.maxActionsToGenerate}
            onChange={(e) => updateParam("name_consolidation", "maxActionsToGenerate", parseInt(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Limit recommendations to focus on highest-impact moves.</p>
        </div>
      </div>
    );

    const renderRunAllParams = () => (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Comprehensive optimization runs all 4 algorithms in the optimal sequence for maximum warehouse efficiency.
        </p>
        <div className="p-4 rounded-xl bg-muted/50 border border-border">
          <p className="text-sm font-medium text-foreground mb-3">Execution Order:</p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-xs flex items-center justify-center font-bold">1</div>
              <div>
                <p className="text-sm font-medium">CardStack</p>
                <p className="text-xs text-muted-foreground">Consolidate items by ship class</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-xs flex items-center justify-center font-bold">2</div>
              <div>
                <p className="text-sm font-medium">Size Standardization</p>
                <p className="text-xs text-muted-foreground">Group by program code for rack optimization</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-xs flex items-center justify-center font-bold">3</div>
              <div>
                <p className="text-sm font-medium">Value Density Analysis</p>
                <p className="text-xs text-muted-foreground">Prioritize high-value items for accessibility</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white text-xs flex items-center justify-center font-bold">4</div>
              <div>
                <p className="text-sm font-medium">Bin-Packing Order</p>
                <p className="text-xs text-muted-foreground">Stage items for efficient pallet utilization</p>
              </div>
            </div>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-green-50 border border-green-200">
          <p className="text-sm text-green-800">
            <strong>Best Practice:</strong> Each algorithm builds on the previous one's insights, producing a unified action plan with de-duplicated, prioritized recommendations.
          </p>
        </div>
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#2563EB]/10">
          {ALGORITHMS.find((a) => a.id === selectedAlgorithm)?.icon}
          <span className="font-medium text-foreground">
            {ALGORITHMS.find((a) => a.id === selectedAlgorithm)?.name}
          </span>
        </div>
        {selectedAlgorithm === "run_all" && renderRunAllParams()}
        {selectedAlgorithm === "cardstack" && renderCardStackParams()}
        {selectedAlgorithm === "size_standardization" && renderSizeStandardizationParams()}
        {selectedAlgorithm === "value_density" && renderValueDensityParams()}
        {selectedAlgorithm === "bin_packing" && renderBinPackingParams()}
        {selectedAlgorithm === "name_consolidation" && renderNameConsolidationParams()}

        {/* Zone Constraints Section */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-[#2563EB]" />
            <h4 className="text-sm font-medium text-foreground">Zone Constraints (Optional)</h4>
          </div>
          
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.zoneConstraints.enableZoneFiltering}
                onChange={(e) => {
                  setParams(prev => ({
                    ...prev,
                    zoneConstraints: { 
                      ...prev.zoneConstraints, 
                      enableZoneFiltering: e.target.checked,
                      sourceZoneIds: e.target.checked ? prev.zoneConstraints.sourceZoneIds : [],
                      targetZoneIds: e.target.checked ? prev.zoneConstraints.targetZoneIds : [],
                    }
                  }));
                }}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-sm font-medium text-foreground">Enable zone-specific optimization</span>
            </label>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Restrict optimization to specific source and target zones instead of the entire warehouse.
            </p>
          </div>

          {params.zoneConstraints.enableZoneFiltering && (
            <div className="space-y-4 pl-6">
              {zonesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading zones...
                </div>
              ) : zones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No zones configured for this site.</p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Source Zones (items to move from)
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Select high-utilization zones (red/amber bars) to free up space
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-muted/30 rounded-lg">
                      {zones.map((zone) => {
                        const rackAvailable = zone.rack_available || 0;
                        const rackOpen = zone.rack_open || 0;
                        const bulkAvailable = zone.bulk_available || 0;
                        const bulkOpen = zone.bulk_open || 0;
                        const totalAvailable = rackAvailable + bulkAvailable;
                        const totalOccupied = (rackAvailable - rackOpen) + (bulkAvailable - bulkOpen);
                        const utilization = totalAvailable > 0 ? Math.round((totalOccupied / totalAvailable) * 100) : 0;
                        const barColor = utilization > 85 ? "bg-red-500" : utilization > 60 ? "bg-amber-500" : "bg-emerald-500";
                        const textColor = utilization > 85 ? "text-red-600" : utilization > 60 ? "text-amber-600" : "text-emerald-600";
                        
                        return (
                          <label key={zone.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted border border-transparent hover:border-border">
                            <input
                              type="checkbox"
                              checked={params.zoneConstraints.sourceZoneIds.includes(zone.id)}
                              onChange={(e) => {
                                setParams(prev => ({
                                  ...prev,
                                  zoneConstraints: {
                                    ...prev.zoneConstraints,
                                    sourceZoneIds: e.target.checked
                                      ? [...prev.zoneConstraints.sourceZoneIds, zone.id]
                                      : prev.zoneConstraints.sourceZoneIds.filter(id => id !== zone.id)
                                  }
                                }));
                              }}
                              className="w-3.5 h-3.5 rounded border-border flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-foreground truncate">{zone.code}</span>
                                <span className={`text-xs font-medium ${textColor}`}>{utilization}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                                <div 
                                  className={`h-full ${barColor} rounded-full transition-all`}
                                  style={{ width: `${Math.min(utilization, 100)}%` }}
                                />
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {params.zoneConstraints.sourceZoneIds.length === 0 
                        ? "No selection = all zones" 
                        : `${params.zoneConstraints.sourceZoneIds.length} zone(s) selected`}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Target Zones (move items to)
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Select low-utilization zones (green bars) with available space
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-muted/30 rounded-lg">
                      {zones.map((zone) => {
                        const rackAvailable = zone.rack_available || 0;
                        const rackOpen = zone.rack_open || 0;
                        const bulkAvailable = zone.bulk_available || 0;
                        const bulkOpen = zone.bulk_open || 0;
                        const totalAvailable = rackAvailable + bulkAvailable;
                        const totalOccupied = (rackAvailable - rackOpen) + (bulkAvailable - bulkOpen);
                        const utilization = totalAvailable > 0 ? Math.round((totalOccupied / totalAvailable) * 100) : 0;
                        const barColor = utilization > 85 ? "bg-red-500" : utilization > 60 ? "bg-amber-500" : "bg-emerald-500";
                        const textColor = utilization > 85 ? "text-red-600" : utilization > 60 ? "text-amber-600" : "text-emerald-600";
                        
                        return (
                          <label key={zone.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted border border-transparent hover:border-border">
                            <input
                              type="checkbox"
                              checked={params.zoneConstraints.targetZoneIds.includes(zone.id)}
                              onChange={(e) => {
                                setParams(prev => ({
                                  ...prev,
                                  zoneConstraints: {
                                    ...prev.zoneConstraints,
                                    targetZoneIds: e.target.checked
                                      ? [...prev.zoneConstraints.targetZoneIds, zone.id]
                                      : prev.zoneConstraints.targetZoneIds.filter(id => id !== zone.id)
                                  }
                                }));
                              }}
                              className="w-3.5 h-3.5 rounded border-border flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-foreground truncate">{zone.code}</span>
                                <span className={`text-xs font-medium ${textColor}`}>{utilization}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                                <div 
                                  className={`h-full ${barColor} rounded-full transition-all`}
                                  style={{ width: `${Math.min(utilization, 100)}%` }}
                                />
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {params.zoneConstraints.targetZoneIds.length === 0 
                        ? "No selection = algorithm decides targets" 
                        : `${params.zoneConstraints.targetZoneIds.length} zone(s) selected`}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-6 py-8">
      {loading ? (
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#2563EB] mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Analyzing Warehouse...</p>
          <p className="text-sm text-muted-foreground mb-4">
            Running {ALGORITHMS.find((a) => a.id === selectedAlgorithm)?.name} algorithm
          </p>
          <div className="w-full max-w-md mx-auto h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{Math.round(progress)}% complete</p>
        </div>
      ) : error ? (
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Analysis Failed</p>
          <p className="text-sm text-red-500 mb-4">{error}</p>
          <button
            onClick={runAnalysis}
            className="px-4 py-2 rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors"
          >
            Retry Analysis
          </button>
        </div>
      ) : result ? (
        <div className="text-center">
          <Check className="w-12 h-12 text-[#16A34A] mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Analysis Complete!</p>
          <p className="text-sm text-muted-foreground">
            Found {result.actions.length} optimization opportunities
          </p>
        </div>
      ) : null}
    </div>
  );

  const groupedActions = useMemo(() => {
    if (!result) return { high: [], medium: [], low: [] };
    const groups: Record<string, typeof result.actions> = { high: [], medium: [], low: [] };
    result.actions.forEach(action => {
      const priority = action.priority || 'low';
      if (!groups[priority]) groups[priority] = [];
      groups[priority].push(action);
    });
    return groups;
  }, [result?.actions]);

  const toggleGroup = (priority: string) => {
    setExpandedGroups(prev => ({ ...prev, [priority]: !prev[priority] }));
  };

  const toggleAction = (actionId: string) => {
    setExpandedActions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return newSet;
    });
  };

  const priorityConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
    high: { label: 'High Priority', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
    medium: { label: 'Medium Priority', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
    low: { label: 'Low Priority', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  };

  const renderStep4 = () => {
    if (!result) return null;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="p-2 rounded-lg bg-[#16A34A]/10 text-center">
            <p className="text-lg font-bold text-[#16A34A]">{result.summary.slotsFreed}</p>
            <p className="text-[10px] text-muted-foreground">Slots Freed</p>
          </div>
          <div className="p-2 rounded-lg bg-[#2563EB]/10 text-center">
            <p className="text-lg font-bold text-[#2563EB]">{result.summary.zonesOptimized}</p>
            <p className="text-[10px] text-muted-foreground">Zones</p>
          </div>
          <div className="p-2 rounded-lg bg-[#7C3AED]/10 text-center">
            <p className="text-xs font-bold text-[#7C3AED]">{result.summary.consolidationWins}</p>
            <p className="text-[10px] text-muted-foreground">Consolidated</p>
          </div>
          <div className="p-2 rounded-lg bg-[#F59E0B]/10 text-center">
            <p className="text-xs font-bold text-[#F59E0B]">{result.summary.pickEfficiencyGain}</p>
            <p className="text-[10px] text-muted-foreground">Efficiency</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Total: {result.actions.length} actions</span>
          <button
            onClick={() => setExpandedGroups({ high: true, medium: true, low: true })}
            className="text-xs text-[#2563EB] hover:underline"
          >
            Expand All
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {(['high', 'medium', 'low'] as const).map(priority => {
            const actions = groupedActions[priority] || [];
            if (actions.length === 0) return null;
            
            const config = priorityConfig[priority];
            const isExpanded = expandedGroups[priority];

            return (
              <div key={priority} className={`border rounded-lg overflow-hidden ${config.borderColor}`}>
                <button
                  onClick={() => toggleGroup(priority)}
                  className={`w-full flex items-center justify-between px-3 py-2 ${config.bgColor} hover:opacity-90 transition-opacity`}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                      {actions.length}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="bg-background divide-y divide-border">
                    {actions.map((action) => {
                      const isActionExpanded = expandedActions.has(action.id);
                      return (
                        <div key={action.id} className="hover:bg-muted/30">
                          <button
                            onClick={() => toggleAction(action.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
                          >
                            {isActionExpanded ? (
                              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="text-[11px] font-medium text-foreground truncate flex-1">
                              {action.item}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {action.from} → {action.to}
                            </span>
                          </button>
                          
                          {isActionExpanded && (
                            <div className="px-3 pb-2 pl-8 space-y-1">
                              <p className="text-[10px] text-foreground">{action.action}</p>
                              {(action as any).itemDescription && (
                                <p className="text-[10px] text-muted-foreground">{(action as any).itemDescription}</p>
                              )}
                              {(action as any).reason && (
                                <p className="text-[10px] text-muted-foreground italic">{(action as any).reason}</p>
                              )}
                              {(action as any).value > 0 && (
                                <span className="inline-block text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                  ${((action as any).value || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStep5 = () => {
    if (!result) return null;

    return (
      <div className="space-y-6">
        <div className="p-6 rounded-xl bg-muted/50 border border-border">
          <h3 className="font-medium text-foreground mb-4">Optimization Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Algorithm Used</p>
              <p className="font-medium text-foreground">
                {ALGORITHMS.find((a) => a.id === selectedAlgorithm)?.name}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Actions</p>
              <p className="font-medium text-foreground">{result.actions.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Est. Space Improvement</p>
              <p className="font-medium text-[#16A34A]">{result.summary.spaceImprovement}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Est. Savings</p>
              <p className="font-medium text-[#16A34A]">{result.summary.potentialSavings}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleExportPdf}
            className="flex items-center justify-center gap-2 p-4 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <FileDown className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium text-foreground">Export PDF Report</span>
          </button>
          <button
            onClick={handleSavePlan}
            disabled={saving}
            className="flex items-center justify-center gap-2 p-4 rounded-xl border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Save className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="font-medium text-foreground">{saving ? "Saving..." : "Save for Later"}</span>
          </button>
          <button
            onClick={handleApplyChanges}
            disabled={applying}
            className="flex items-center justify-center gap-2 p-4 rounded-xl bg-[#16A34A] text-white hover:bg-[#15803d] transition-colors disabled:opacity-50"
          >
            {applying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            <span className="font-medium">Apply Changes</span>
          </button>
        </div>

        <div className="p-4 rounded-xl bg-yellow-50 border border-yellow-200">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Before applying changes</p>
              <p className="text-xs text-yellow-700 mt-1">
                Applying changes will update item locations in the system. This action can be reversed but may require manual intervention. We recommend exporting a PDF report first.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Optimize Warehouse</h2>
            <p className="text-sm text-muted-foreground">{siteName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <React.Fragment key={s.number}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step >= s.number
                        ? "bg-[#2563EB] text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.number ? <Check className="w-4 h-4" /> : s.number}
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 hidden md:block">{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      step > s.number ? "bg-[#2563EB]" : "bg-muted"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-border">
          <button
            onClick={handleBack}
            disabled={step === 1 || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          
          {step === 5 ? (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors"
            >
              Done
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] text-white hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 2 ? "Run Analysis" : "Next"}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

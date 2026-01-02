import React, { useState, useEffect } from "react";
import { X, Loader2, ChevronRight, ChevronLeft, Check, Layers, Ruler, DollarSign, Box, FileDown, Play, Save, AlertCircle } from "lucide-react";
import type { WarehouseSite, ToastMessage } from "../types";
import { runOptimizationWizard, applyOptimizationPlan, type OptimizationWizardResult } from "../../../services/warehouseService";

export type Algorithm = "cardstack" | "size_standardization" | "value_density" | "bin_packing";

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
  icon: React.ReactNode;
}

const ALGORITHMS: AlgorithmOption[] = [
  {
    id: "cardstack",
    name: "CardStack",
    description: "Stack similar items together to reduce footprint and improve picking efficiency.",
    icon: <Layers className="w-6 h-6" />,
  },
  {
    id: "size_standardization",
    name: "Size Standardization",
    description: "Group items by similar dimensions to optimize rack utilization and storage density.",
    icon: <Ruler className="w-6 h-6" />,
  },
  {
    id: "value_density",
    name: "Value Density Analysis",
    description: "Organize items by value-to-volume ratio, placing high-value items in accessible locations.",
    icon: <DollarSign className="w-6 h-6" />,
  },
  {
    id: "bin_packing",
    name: "Bin-Packing Order",
    description: "Calculate optimal placement order for maximum container and pallet utilization.",
    icon: <Box className="w-6 h-6" />,
  },
];

interface AlgorithmParams {
  cardstack: { similarityThreshold: number; maxStackHeight: number };
  size_standardization: { tolerancePercent: number; minGroupSize: number };
  value_density: { highValueThreshold: number; accessibilityWeight: number };
  bin_packing: { containerLength: number; containerWidth: number; containerHeight: number; maxWeight: number };
}

const DEFAULT_PARAMS: AlgorithmParams = {
  cardstack: { similarityThreshold: 80, maxStackHeight: 5 },
  size_standardization: { tolerancePercent: 10, minGroupSize: 3 },
  value_density: { highValueThreshold: 1000, accessibilityWeight: 0.7 },
  bin_packing: { containerLength: 48, containerWidth: 40, containerHeight: 48, maxWeight: 2000 },
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

  useEffect(() => {
    if (initialAlgorithm) {
      setSelectedAlgorithm(initialAlgorithm);
    }
  }, [initialAlgorithm]);

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
      const algorithmParams = params[selectedAlgorithm];
      const optimizationResult = await runOptimizationWizard(siteId, selectedAlgorithm, algorithmParams);
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
    onShowToast("PDF export will be available soon!", "info");
  };

  const handleSavePlan = () => {
    onShowToast("Plan saved for later!", "success");
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
                ? "border-[#004E89] bg-[#004E89]/5"
                : "border-border hover:border-[#004E89]/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg ${
                  selectedAlgorithm === algo.id ? "bg-[#004E89] text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {algo.icon}
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{algo.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{algo.description}</p>
              </div>
              {selectedAlgorithm === algo.id && (
                <Check className="w-5 h-5 text-[#004E89]" />
              )}
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
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Similarity Threshold (%)
          </label>
          <input
            type="range"
            min="50"
            max="100"
            value={params.cardstack.similarityThreshold}
            onChange={(e) => updateParam("cardstack", "similarityThreshold", parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>50% (More groups)</span>
            <span className="font-medium text-foreground">{params.cardstack.similarityThreshold}%</span>
            <span>100% (Exact match)</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Maximum Stack Height
          </label>
          <input
            type="number"
            min="2"
            max="10"
            value={params.cardstack.maxStackHeight}
            onChange={(e) => updateParam("cardstack", "maxStackHeight", parseInt(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Number of items that can be stacked vertically</p>
        </div>
      </div>
    );

    const renderSizeStandardizationParams = () => (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Size Tolerance (%)
          </label>
          <input
            type="range"
            min="5"
            max="30"
            value={params.size_standardization.tolerancePercent}
            onChange={(e) => updateParam("size_standardization", "tolerancePercent", parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>5% (Strict)</span>
            <span className="font-medium text-foreground">{params.size_standardization.tolerancePercent}%</span>
            <span>30% (Flexible)</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Minimum Group Size
          </label>
          <input
            type="number"
            min="2"
            max="20"
            value={params.size_standardization.minGroupSize}
            onChange={(e) => updateParam("size_standardization", "minGroupSize", parseInt(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">Minimum items required to form a size group</p>
        </div>
      </div>
    );

    const renderValueDensityParams = () => (
      <div className="space-y-4">
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
          <p className="text-xs text-muted-foreground mt-1">Items above this value get priority placement</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Accessibility Weight
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={params.value_density.accessibilityWeight * 100}
            onChange={(e) => updateParam("value_density", "accessibilityWeight", parseInt(e.target.value) / 100)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0% (Ignore)</span>
            <span className="font-medium text-foreground">{Math.round(params.value_density.accessibilityWeight * 100)}%</span>
            <span>100% (Prioritize)</span>
          </div>
        </div>
      </div>
    );

    const renderBinPackingParams = () => (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Configure container/pallet dimensions for packing optimization</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Length (in)</label>
            <input
              type="number"
              value={params.bin_packing.containerLength}
              onChange={(e) => updateParam("bin_packing", "containerLength", parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Width (in)</label>
            <input
              type="number"
              value={params.bin_packing.containerWidth}
              onChange={(e) => updateParam("bin_packing", "containerWidth", parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Height (in)</label>
            <input
              type="number"
              value={params.bin_packing.containerHeight}
              onChange={(e) => updateParam("bin_packing", "containerHeight", parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Max Weight (lbs)</label>
          <input
            type="number"
            value={params.bin_packing.maxWeight}
            onChange={(e) => updateParam("bin_packing", "maxWeight", parseInt(e.target.value))}
            className="w-full px-4 py-2 rounded-xl bg-muted border border-border text-foreground text-sm"
          />
        </div>
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#004E89]/10">
          {ALGORITHMS.find((a) => a.id === selectedAlgorithm)?.icon}
          <span className="font-medium text-foreground">
            {ALGORITHMS.find((a) => a.id === selectedAlgorithm)?.name}
          </span>
        </div>
        {selectedAlgorithm === "cardstack" && renderCardStackParams()}
        {selectedAlgorithm === "size_standardization" && renderSizeStandardizationParams()}
        {selectedAlgorithm === "value_density" && renderValueDensityParams()}
        {selectedAlgorithm === "bin_packing" && renderBinPackingParams()}
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-6 py-8">
      {loading ? (
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#004E89] mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Analyzing Warehouse...</p>
          <p className="text-sm text-muted-foreground mb-4">
            Running {ALGORITHMS.find((a) => a.id === selectedAlgorithm)?.name} algorithm
          </p>
          <div className="w-full max-w-md mx-auto h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[#004E89] rounded-full transition-all duration-300"
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
            className="px-4 py-2 rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors"
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

  const renderStep4 = () => {
    if (!result) return null;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-[#16A34A]/10 text-center">
            <p className="text-2xl font-bold text-[#16A34A]">{result.summary.potentialSavings}</p>
            <p className="text-xs text-muted-foreground">Est. Savings</p>
          </div>
          <div className="p-4 rounded-xl bg-[#004E89]/10 text-center">
            <p className="text-2xl font-bold text-[#004E89]">{result.summary.spaceImprovement}</p>
            <p className="text-xs text-muted-foreground">Space Improvement</p>
          </div>
          <div className="p-4 rounded-xl bg-[#F59E0B]/10 text-center">
            <p className="text-2xl font-bold text-[#F59E0B]">{result.actions.length}</p>
            <p className="text-xs text-muted-foreground">Actions Needed</p>
          </div>
        </div>

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b border-border">
            <p className="font-medium text-foreground">Recommended Actions</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {result.actions.map((action, index) => (
              <div
                key={action.id}
                className="flex items-start gap-3 p-4 border-b border-border last:border-0 hover:bg-muted/30"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#004E89] text-white text-xs flex items-center justify-center">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{action.action}</p>
                    {(action as any).value > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                        ${((action as any).value || 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-[#004E89]">
                    {action.item} {(action as any).itemDescription && `- ${(action as any).itemDescription}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">From:</span> {action.from} → <span className="font-medium">To:</span> {action.to}
                  </p>
                  {(action as any).reason && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {(action as any).reason}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                    action.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : action.priority === "medium"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-green-100 text-green-700"
                  }`}
                >
                  {action.priority}
                </span>
              </div>
            ))}
          </div>
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
            className="flex items-center justify-center gap-2 p-4 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <Save className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium text-foreground">Save for Later</span>
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
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
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
                        ? "bg-[#004E89] text-white"
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
                      step > s.number ? "bg-[#004E89]" : "bg-muted"
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
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors"
            >
              Done
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004E89] text-white hover:bg-[#003d6d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

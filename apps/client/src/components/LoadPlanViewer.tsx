/**
 * PACAF Airlift Demo - Load Plan Viewer
 * Spec Reference: Sections 10, 12
 * 
 * Displays detailed ICODES-style load plans for all aircraft.
 * Supports both 2D ICODES diagrams and interactive 3D visualization.
 * Updated with minimalist glass UI design and manifest editing functionality.
 */

import React, { useState, Suspense, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AllocationResult,
  AircraftLoadPlan,
  InsightsSummary,
  PalletPlacement,
  VehiclePlacement
} from '../lib/pacafTypes';
import ICODESViewer from './ICODESViewer';
import LoadPlan3DViewer from './LoadPlan3DViewer';
import { exportLoadPlansToPDF, exportSingleLoadPlanToPDF } from '../lib/pdfExport';
import { 
  downloadAllICODESPlans, 
  downloadA2IBundle, 
  generateA2IBundle,
  downloadManifestCSV
} from '../lib/icodesExport';
import { generateWhyThisManyAircraft } from '../lib/explanationEngine';

interface LoadPlanViewerProps {
  allocationResult: AllocationResult;
  insights: InsightsSummary;
  onBack: () => void;
  onHome?: () => void;
  onExport: () => void;
  onRoutePlanning?: () => void;
  onMissionWorkspace?: () => void;
  onDashboard?: () => void;
  onLogout?: () => void;
  userEmail?: string;
  hideNavigation?: boolean;
  flightPlanId?: number;
  onAllocationUpdate?: (updated: AllocationResult) => void;
}

type ViewMode = '2d' | '3d';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onNavigateAnyway: () => void;
  onGoBack: () => void;
}

function UnsavedChangesModal({ isOpen, onNavigateAnyway, onGoBack }: UnsavedChangesModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onGoBack}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="glass-card p-6 shadow-glass-lg">
              <h3 className="text-lg font-bold text-neutral-900 mb-2">Unsaved Changes</h3>
              <p className="text-neutral-600 mb-6">
                You have unsaved changes that will be lost.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={onNavigateAnyway}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  Navigate Anyway
                </button>
                <button
                  onClick={onGoBack}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  Go Back to Editing
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function LoadPlanViewer({
  allocationResult,
  insights,
  onBack,
  onHome,
  onExport,
  onRoutePlanning,
  onMissionWorkspace,
  onDashboard,
  onLogout,
  userEmail,
  hideNavigation = false,
  flightPlanId,
  onAllocationUpdate
}: LoadPlanViewerProps) {
  const [selectedPlan, setSelectedPlan] = useState<AircraftLoadPlan | null>(
    allocationResult.load_plans[0] || null
  );
  const [activeTab, setActiveTab] = useState<'advon' | 'main' | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editedAllocation, setEditedAllocation] = useState<AllocationResult>(allocationResult);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  const advonPlans = (isEditing ? editedAllocation : allocationResult).load_plans.filter(p => p.phase === 'ADVON');
  const mainPlans = (isEditing ? editedAllocation : allocationResult).load_plans.filter(p => p.phase === 'MAIN');

  const displayedPlans = activeTab === 'advon' 
    ? advonPlans 
    : activeTab === 'main' 
      ? mainPlans 
      : (isEditing ? editedAllocation : allocationResult).load_plans;

  const currentSelectedPlan = isEditing 
    ? editedAllocation.load_plans.find(p => p.aircraft_id === selectedPlan?.aircraft_id) || null
    : selectedPlan;

  const handleExportPDF = () => {
    exportLoadPlansToPDF(allocationResult, insights, {
      includeInsights: true,
      includeDetailedManifest: true,
      title: 'PACAF Load Plan Report'
    });
  };

  const handleExportSinglePDF = () => {
    if (selectedPlan) {
      exportSingleLoadPlanToPDF(selectedPlan);
    }
  };

  const handleExportICODES = () => {
    downloadAllICODESPlans(allocationResult);
    setShowExportMenu(false);
  };

  const handleExportA2IBundle = () => {
    const bundle = generateA2IBundle(allocationResult);
    downloadA2IBundle(bundle);
    setShowExportMenu(false);
  };

  const handleExportManifest = () => {
    const bundle = generateA2IBundle(allocationResult);
    downloadManifestCSV(bundle);
    setShowExportMenu(false);
  };

  const explanationText = generateWhyThisManyAircraft(allocationResult);

  const handleEnterEditMode = () => {
    setEditedAllocation(JSON.parse(JSON.stringify(allocationResult)));
    setIsEditing(true);
    setHasUnsavedChanges(false);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setHasUnsavedChanges(false);
    setEditedAllocation(allocationResult);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!flightPlanId) {
      setSaveError('Cannot save: No flight plan ID available');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/flight-plans/${flightPlanId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          allocation_data: editedAllocation
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save changes');
      }

      setSaveSuccess(true);
      setIsEditing(false);
      setHasUnsavedChanges(false);

      if (onAllocationUpdate) {
        onAllocationUpdate(editedAllocation);
      }

      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePalletField = useCallback((
    aircraftId: string, 
    palletId: string, 
    field: 'weight' | 'description', 
    value: string | number
  ) => {
    setEditedAllocation(prev => {
      const newAllocation = JSON.parse(JSON.stringify(prev)) as AllocationResult;
      const plan = newAllocation.load_plans.find(p => p.aircraft_id === aircraftId);
      if (plan) {
        const palletPlacement = plan.pallets.find(p => p.pallet.id === palletId);
        if (palletPlacement) {
          if (field === 'weight') {
            const newWeight = typeof value === 'string' ? parseFloat(value) || 0 : value;
            palletPlacement.pallet.gross_weight = newWeight;
            palletPlacement.pallet.net_weight = newWeight - 355;
          } else if (field === 'description' && palletPlacement.pallet.items && palletPlacement.pallet.items.length > 0) {
            palletPlacement.pallet.items[0].description = value as string;
          }
        }
      }
      return newAllocation;
    });
    setHasUnsavedChanges(true);
  }, []);

  const updateVehicleField = useCallback((
    aircraftId: string, 
    itemId: string | number, 
    field: 'weight' | 'description', 
    value: string | number
  ) => {
    setEditedAllocation(prev => {
      const newAllocation = JSON.parse(JSON.stringify(prev)) as AllocationResult;
      const plan = newAllocation.load_plans.find(p => p.aircraft_id === aircraftId);
      if (plan) {
        const vehicle = plan.rolling_stock.find(v => String(v.item_id) === String(itemId));
        if (vehicle) {
          if (field === 'weight') {
            vehicle.weight = typeof value === 'string' ? parseFloat(value) || 0 : value;
          } else if (field === 'description') {
            vehicle.item.description = value as string;
          }
        }
      }
      return newAllocation;
    });
    setHasUnsavedChanges(true);
  }, []);

  const updatePalletPosition = useCallback((
    aircraftId: string, 
    palletId: string, 
    newPositionIndex: number
  ) => {
    setEditedAllocation(prev => {
      const newAllocation = JSON.parse(JSON.stringify(prev)) as AllocationResult;
      const plan = newAllocation.load_plans.find(p => p.aircraft_id === aircraftId);
      if (plan) {
        const palletPlacement = plan.pallets.find(p => p.pallet.id === palletId);
        if (palletPlacement) {
          palletPlacement.position_index = newPositionIndex;
          palletPlacement.is_ramp = newPositionIndex >= (plan.aircraft_spec.pallet_positions - plan.aircraft_spec.ramp_positions.length);
        }
      }
      return newAllocation;
    });
    setHasUnsavedChanges(true);
  }, []);

  const interceptNavigation = useCallback((action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(() => action);
      setShowUnsavedModal(true);
    } else {
      action();
    }
  }, [hasUnsavedChanges]);

  const handleNavigateAnyway = () => {
    setShowUnsavedModal(false);
    setIsEditing(false);
    setHasUnsavedChanges(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  const handleGoBackToEditing = () => {
    setShowUnsavedModal(false);
    setPendingNavigation(null);
  };

  const wrappedOnBack = () => interceptNavigation(onBack);
  const wrappedOnDashboard = onDashboard ? () => interceptNavigation(onDashboard) : undefined;
  const wrappedOnRoutePlanning = onRoutePlanning ? () => interceptNavigation(onRoutePlanning) : undefined;
  const wrappedOnMissionWorkspace = onMissionWorkspace ? () => interceptNavigation(onMissionWorkspace) : undefined;
  const wrappedOnHome = onHome ? () => interceptNavigation(onHome) : undefined;
  const wrappedOnLogout = onLogout ? () => interceptNavigation(onLogout) : undefined;

  return (
    <div className="min-h-screen bg-neutral-50 gradient-mesh">
      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        onNavigateAnyway={handleNavigateAnyway}
        onGoBack={handleGoBackToEditing}
      />

      <header className="p-3 border-b border-neutral-200/50 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-10 shadow-soft">
        <div className="flex items-center space-x-3">
          {wrappedOnDashboard && (
            <button
              onClick={wrappedOnDashboard}
              className="flex items-center space-x-1 text-neutral-600 hover:text-neutral-900 transition btn-ghost"
            >
              <span>←</span>
              <span>Dashboard</span>
            </button>
          )}
          {!wrappedOnDashboard && (
            <button
              onClick={wrappedOnBack}
              className="flex items-center space-x-1 text-neutral-600 hover:text-neutral-900 transition btn-ghost"
            >
              <span>←</span>
              <span>Back</span>
            </button>
          )}
          <div className="h-5 w-px bg-neutral-200" />
          <h1 className="text-neutral-900 font-bold text-sm">Load Plan Details</h1>
          {isEditing && (
            <span className="badge bg-amber-100 text-amber-700 border-amber-200">
              Editing Mode
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex bg-neutral-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode('2d')}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                viewMode === '2d' 
                  ? 'bg-white text-neutral-900 shadow-soft font-medium' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              2D ICODES
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                viewMode === '3d' 
                  ? 'bg-white text-neutral-900 shadow-soft font-medium' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              3D View
            </button>
          </div>
          <div className="h-6 w-px bg-neutral-200" />
          <span className="badge">
            {allocationResult.total_aircraft} Aircraft
          </span>

          {!isEditing ? (
            <>
              <button
                onClick={handleEnterEditMode}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm transition flex items-center space-x-2"
              >
                <span>Edit Manifest</span>
              </button>
              {wrappedOnRoutePlanning && (
                <button
                  onClick={wrappedOnRoutePlanning}
                  className="btn-primary text-sm"
                >
                  Route Planning
                </button>
              )}
              {wrappedOnMissionWorkspace && (
                <button
                  onClick={wrappedOnMissionWorkspace}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm transition"
                >
                  Mission Workspace
                </button>
              )}
              <button
                onClick={handleExportSinglePDF}
                disabled={!selectedPlan}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Export Current
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm transition flex items-center space-x-2"
                >
                  <span>Export ICODES</span>
                  <span className="text-xs">▼</span>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-56 glass-card shadow-glass-lg z-50 overflow-hidden">
                    <button
                      onClick={handleExportICODES}
                      className="w-full text-left px-4 py-3 text-neutral-900 hover:bg-neutral-100 transition-colors border-b border-neutral-200"
                    >
                      <div className="font-medium">ICODES JSON</div>
                      <div className="text-xs text-neutral-500">DoD/DLA compatible format</div>
                    </button>
                    <button
                      onClick={handleExportA2IBundle}
                      className="w-full text-left px-4 py-3 text-neutral-900 hover:bg-neutral-100 transition-colors border-b border-neutral-200"
                    >
                      <div className="font-medium">A2I/SAM Bundle</div>
                      <div className="text-xs text-neutral-500">Full mission package</div>
                    </button>
                    <button
                      onClick={handleExportManifest}
                      className="w-full text-left px-4 py-3 text-neutral-900 hover:bg-neutral-100 transition-colors border-b border-neutral-200"
                    >
                      <div className="font-medium">Manifest CSV</div>
                      <div className="text-xs text-neutral-500">Cargo manifest spreadsheet</div>
                    </button>
                    <button
                      onClick={() => { handleExportPDF(); setShowExportMenu(false); }}
                      className="w-full text-left px-4 py-3 text-neutral-900 hover:bg-neutral-100 transition-colors"
                    >
                      <div className="font-medium">PDF Report</div>
                      <div className="text-xs text-neutral-500">Printable load plans</div>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
                className="btn-primary text-sm disabled:opacity-50 flex items-center space-x-2"
              >
                {isSaving ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </>
          )}

          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-xl transition text-sm"
            title="Why this many aircraft?"
          >
            Why {allocationResult.total_aircraft}?
          </button>
          {userEmail && (
            <>
              <div className="h-5 w-px bg-neutral-200" />
              <div className="flex items-center space-x-3 text-sm">
                <span className="text-neutral-500">{userEmail}</span>
                {wrappedOnLogout && (
                  <button
                    onClick={wrappedOnLogout}
                    className="text-neutral-500 hover:text-neutral-900 transition"
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {saveError && (
        <div className="mx-4 mt-4 glass-card bg-red-50/80 border-red-200 p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <span className="text-red-600">⚠️</span>
              <span className="text-red-700 font-medium">Error: {saveError}</span>
            </div>
            <button onClick={() => setSaveError(null)} className="text-red-600 hover:text-red-900 transition">✕</button>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="mx-4 mt-4 glass-card bg-green-50/80 border-green-200 p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <span className="text-green-600">✓</span>
              <span className="text-green-700 font-medium">Changes saved successfully!</span>
            </div>
            <button onClick={() => setSaveSuccess(false)} className="text-green-600 hover:text-green-900 transition">✕</button>
          </div>
        </div>
      )}
      
      {showExplanation && (
        <div className="mx-4 mt-4 glass-card bg-purple-50/80 border-purple-200 p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-purple-800 font-bold">Aircraft Count Explanation</h3>
            <button onClick={() => setShowExplanation(false)} className="text-purple-600 hover:text-purple-900 transition">✕</button>
          </div>
          <pre className="text-neutral-700 text-sm whitespace-pre-wrap font-mono">{explanationText}</pre>
        </div>
      )}

      <div className="flex h-[calc(100vh-64px)]">
        <aside className="w-72 border-r border-neutral-200/50 bg-white/50 backdrop-blur-sm overflow-y-auto scrollbar-thin">
          <div className="p-4 border-b border-neutral-200/50">
            <div className="flex space-x-1 bg-neutral-100 rounded-xl p-1">
              {[
                { id: 'all', label: 'All', count: (isEditing ? editedAllocation : allocationResult).load_plans.length },
                { id: 'advon', label: 'ADVON', count: advonPlans.length },
                { id: 'main', label: 'MAIN', count: mainPlans.length }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-sm transition ${
                    activeTab === tab.id
                      ? 'bg-white text-neutral-900 shadow-soft font-medium'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>

          <div className="p-2">
            {displayedPlans.map(plan => (
              <button
                key={plan.aircraft_id}
                onClick={() => setSelectedPlan(plan)}
                className={`w-full text-left p-3 rounded-xl mb-2 transition ${
                  selectedPlan?.aircraft_id === plan.aircraft_id
                    ? 'glass-card ring-2 ring-primary ring-offset-2'
                    : 'bg-white/60 border border-neutral-200/50 hover:border-neutral-300'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-neutral-900 font-medium">{plan.aircraft_id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    plan.phase === 'ADVON' ? 'badge-primary' : 'badge-success'
                  }`}>
                    {plan.phase}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">
                    {plan.pallets.length} pallets
                  </span>
                  <span className="text-neutral-500">
                    {Math.round(plan.payload_used_percent)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${plan.payload_used_percent}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {currentSelectedPlan ? (
            <motion.div
              key={`${currentSelectedPlan.aircraft_id}-${viewMode}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {viewMode === '2d' ? (
                <ICODESViewer loadPlan={currentSelectedPlan} />
              ) : (
                <Suspense fallback={
                  <div className="glass-card h-[500px] flex items-center justify-center">
                    <div className="text-neutral-500">Loading 3D View...</div>
                  </div>
                }>
                  <LoadPlan3DViewer loadPlan={currentSelectedPlan} />
                </Suspense>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div className="glass-card p-4">
                  <h3 className="text-neutral-900 font-bold mb-4">
                    Pallet Manifest
                    {isEditing && <span className="ml-2 text-sm font-normal text-amber-600">(Click to edit)</span>}
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                    {currentSelectedPlan.pallets.map(p => {
                      const itemCount = p.pallet.items?.length || 0;
                      const primaryDesc = itemCount > 0 ? p.pallet.items[0].description : p.pallet.id;
                      const displayDesc = itemCount > 1 
                        ? `${primaryDesc} (+ ${itemCount - 1} more)`
                        : primaryDesc;
                      
                      return (
                        <div
                          key={p.pallet.id}
                          className={`bg-neutral-50 rounded-xl p-3 border border-neutral-200/50 ${
                            isEditing ? 'hover:border-amber-300' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={primaryDesc}
                                  onChange={(e) => updatePalletField(
                                    currentSelectedPlan.aircraft_id,
                                    p.pallet.id,
                                    'description',
                                    e.target.value
                                  )}
                                  className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1 text-neutral-900 font-medium focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                              ) : (
                                <div className="text-neutral-900 font-medium truncate" title={displayDesc}>
                                  {displayDesc}
                                </div>
                              )}
                              <div className="text-neutral-500 text-sm mt-1">
                                <span className="font-mono">{p.pallet.id}</span>
                                {isEditing ? (
                                  <select
                                    value={p.position_index}
                                    onChange={(e) => updatePalletPosition(
                                      currentSelectedPlan.aircraft_id,
                                      p.pallet.id,
                                      parseInt(e.target.value)
                                    )}
                                    className="ml-2 bg-white border border-neutral-300 rounded px-2 py-0.5 text-sm focus:ring-2 focus:ring-primary"
                                  >
                                    {Array.from({ length: currentSelectedPlan.aircraft_spec.pallet_positions }, (_, i) => (
                                      <option key={i} value={i}>
                                        Position {i + 1}{i >= currentSelectedPlan.aircraft_spec.pallet_positions - currentSelectedPlan.aircraft_spec.ramp_positions.length ? ' (RAMP)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="ml-2">
                                    Position {p.position_index + 1}
                                    {p.is_ramp && ' (RAMP)'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right ml-2">
                              {isEditing ? (
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number"
                                    value={p.pallet.gross_weight}
                                    onChange={(e) => updatePalletField(
                                      currentSelectedPlan.aircraft_id,
                                      p.pallet.id,
                                      'weight',
                                      e.target.value
                                    )}
                                    className="w-24 bg-white border border-neutral-300 rounded-lg px-2 py-1 text-neutral-900 font-medium text-right focus:ring-2 focus:ring-primary focus:border-transparent"
                                  />
                                  <span className="text-neutral-500 text-sm">lbs</span>
                                </div>
                              ) : (
                                <span className="text-neutral-900 font-medium">
                                  {p.pallet.gross_weight.toLocaleString()} lbs
                                </span>
                              )}
                              {p.pallet.hazmat_flag && (
                                <span className="ml-2 badge-warning">HAZMAT</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {currentSelectedPlan.pallets.length === 0 && (
                      <p className="text-neutral-400 text-center py-4">No pallets loaded</p>
                    )}
                  </div>
                </div>

                <div className="glass-card p-4">
                  <h3 className="text-neutral-900 font-bold mb-4">
                    Rolling Stock
                    {isEditing && <span className="ml-2 text-sm font-normal text-amber-600">(Click to edit)</span>}
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                    {currentSelectedPlan.rolling_stock.map(v => (
                      <div
                        key={String(v.item_id)}
                        className={`bg-neutral-50 rounded-xl p-3 border border-neutral-200/50 ${
                          isEditing ? 'hover:border-amber-300' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <input
                                type="text"
                                value={v.item.description}
                                onChange={(e) => updateVehicleField(
                                  currentSelectedPlan.aircraft_id,
                                  v.item_id,
                                  'description',
                                  e.target.value
                                )}
                                className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1 text-neutral-900 font-medium focus:ring-2 focus:ring-primary focus:border-transparent"
                              />
                            ) : (
                              <span className="text-neutral-900 font-medium">{v.item.description}</span>
                            )}
                            <span className="text-neutral-500 text-sm ml-2 block mt-1">
                              {v.length}"L × {v.width}"W × {v.height}"H
                            </span>
                          </div>
                          <div className="text-right ml-2">
                            {isEditing ? (
                              <div className="flex items-center space-x-1">
                                <input
                                  type="number"
                                  value={v.weight}
                                  onChange={(e) => updateVehicleField(
                                    currentSelectedPlan.aircraft_id,
                                    v.item_id,
                                    'weight',
                                    e.target.value
                                  )}
                                  className="w-24 bg-white border border-neutral-300 rounded-lg px-2 py-1 text-neutral-900 font-medium text-right focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                                <span className="text-neutral-500 text-sm">lbs</span>
                              </div>
                            ) : (
                              <span className="text-neutral-900 font-medium">
                                {v.weight.toLocaleString()} lbs
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {currentSelectedPlan.rolling_stock.length === 0 && (
                      <p className="text-neutral-400 text-center py-4">No rolling stock</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-neutral-900 font-bold mb-4">Load Summary</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="stat-card">
                    <p className="stat-label">Total Weight</p>
                    <p className="stat-value text-xl">
                      {currentSelectedPlan.total_weight.toLocaleString()} lbs
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Payload Used</p>
                    <p className="stat-value text-xl">
                      {currentSelectedPlan.payload_used_percent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Center of Balance</p>
                    <p className={`stat-value text-xl ${currentSelectedPlan.cob_in_envelope ? 'text-green-600' : 'text-red-600'}`}>
                      {currentSelectedPlan.cob_percent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">PAX</p>
                    <p className="stat-value text-xl">
                      {currentSelectedPlan.pax_count}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-neutral-400">Select an aircraft to view details</p>
            </div>
          )}
        </main>

        <aside className="w-80 border-l border-neutral-200/50 bg-white/50 backdrop-blur-sm overflow-y-auto p-4 scrollbar-thin">
          <h2 className="text-neutral-900 font-bold mb-4">AI Insights</h2>
          
          <div className="space-y-3">
            {insights.insights.map(insight => (
              <div
                key={insight.id}
                className={`p-3 rounded-xl border ${
                  insight.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : insight.severity === 'warning'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-neutral-50 border-neutral-200'
                }`}
              >
                <h4 className={`font-medium text-sm ${
                  insight.severity === 'critical'
                    ? 'text-red-700'
                    : insight.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-primary'
                }`}>
                  {insight.title}
                </h4>
                <p className="text-neutral-600 text-sm mt-1">
                  {insight.description}
                </p>
                {insight.recommendation && (
                  <p className="text-neutral-500 text-xs mt-2 italic">
                    💡 {insight.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>

          {insights.optimization_opportunities.length > 0 && (
            <div className="mt-6">
              <h3 className="text-neutral-900 font-bold mb-3">Optimization Opportunities</h3>
              <ul className="space-y-2">
                {insights.optimization_opportunities.map((opp, idx) => (
                  <li key={idx} className="text-neutral-600 text-sm flex items-start space-x-2">
                    <span className="text-green-600">→</span>
                    <span>{opp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

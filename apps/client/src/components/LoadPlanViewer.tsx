/**
 * PACAF Airlift Demo - Load Plan Viewer
 * Spec Reference: Sections 10, 12
 * 
 * Displays detailed ICODES-style load plans for all aircraft.
 * Supports both 2D ICODES diagrams and interactive 3D visualization.
 * Updated with minimalist glass UI design.
 */

import React, { useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  AllocationResult,
  AircraftLoadPlan,
  InsightsSummary
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
}

type ViewMode = '2d' | '3d';

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
  hideNavigation = false
}: LoadPlanViewerProps) {
  const [selectedPlan, setSelectedPlan] = useState<AircraftLoadPlan | null>(
    allocationResult.load_plans[0] || null
  );
  const [activeTab, setActiveTab] = useState<'advon' | 'main' | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const advonPlans = allocationResult.load_plans.filter(p => p.phase === 'ADVON');
  const mainPlans = allocationResult.load_plans.filter(p => p.phase === 'MAIN');

  const displayedPlans = activeTab === 'advon' 
    ? advonPlans 
    : activeTab === 'main' 
      ? mainPlans 
      : allocationResult.load_plans;

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

  return (
    <div className="min-h-screen bg-neutral-50 gradient-mesh">
      <header className="p-3 border-b border-neutral-200/50 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-10 shadow-soft">
        <div className="flex items-center space-x-3">
          {onDashboard && (
            <button
              onClick={onDashboard}
              className="flex items-center space-x-1 text-neutral-600 hover:text-neutral-900 transition btn-ghost"
            >
              <span>←</span>
              <span>Dashboard</span>
            </button>
          )}
          {!onDashboard && (
            <button
              onClick={onBack}
              className="flex items-center space-x-1 text-neutral-600 hover:text-neutral-900 transition btn-ghost"
            >
              <span>←</span>
              <span>Back</span>
            </button>
          )}
          <div className="h-5 w-px bg-neutral-200" />
          <h1 className="text-neutral-900 font-bold text-sm">Load Plan Details</h1>
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
          {onRoutePlanning && (
            <button
              onClick={onRoutePlanning}
              className="btn-primary text-sm"
            >
              Route Planning
            </button>
          )}
          {onMissionWorkspace && (
            <button
              onClick={onMissionWorkspace}
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
                {onLogout && (
                  <button
                    onClick={onLogout}
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
                { id: 'all', label: 'All', count: allocationResult.load_plans.length },
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
          {selectedPlan ? (
            <motion.div
              key={`${selectedPlan.aircraft_id}-${viewMode}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {viewMode === '2d' ? (
                <ICODESViewer loadPlan={selectedPlan} />
              ) : (
                <Suspense fallback={
                  <div className="glass-card h-[500px] flex items-center justify-center">
                    <div className="text-neutral-500">Loading 3D View...</div>
                  </div>
                }>
                  <LoadPlan3DViewer loadPlan={selectedPlan} />
                </Suspense>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div className="glass-card p-4">
                  <h3 className="text-neutral-900 font-bold mb-4">Pallet Manifest</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                    {selectedPlan.pallets.map(p => (
                      <div
                        key={p.pallet.id}
                        className="flex justify-between items-center bg-neutral-50 rounded-xl p-3 border border-neutral-200/50"
                      >
                        <div>
                          <span className="text-neutral-900 font-mono font-medium">{p.pallet.id}</span>
                          <span className="text-neutral-500 text-sm ml-2">
                            Position {p.position_index + 1}
                            {p.is_ramp && ' (RAMP)'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-neutral-900 font-medium">
                            {p.pallet.gross_weight.toLocaleString()} lbs
                          </span>
                          {p.pallet.hazmat_flag && (
                            <span className="ml-2 badge-warning">HAZMAT</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {selectedPlan.pallets.length === 0 && (
                      <p className="text-neutral-400 text-center py-4">No pallets loaded</p>
                    )}
                  </div>
                </div>

                <div className="glass-card p-4">
                  <h3 className="text-neutral-900 font-bold mb-4">Rolling Stock</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                    {selectedPlan.rolling_stock.map(v => (
                      <div
                        key={String(v.item_id)}
                        className="flex justify-between items-center bg-neutral-50 rounded-xl p-3 border border-neutral-200/50"
                      >
                        <div>
                          <span className="text-neutral-900 font-medium">{v.item.description}</span>
                          <span className="text-neutral-500 text-sm ml-2">
                            {v.length}"L × {v.width}"W × {v.height}"H
                          </span>
                        </div>
                        <span className="text-neutral-900 font-medium">
                          {v.weight.toLocaleString()} lbs
                        </span>
                      </div>
                    ))}
                    {selectedPlan.rolling_stock.length === 0 && (
                      <p className="text-neutral-400 text-center py-4">No rolling stock</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-neutral-900 font-bold mb-4">Load Summary</h3>
                <div className="grid grid-cols-5 gap-4">
                  <div className="stat-card">
                    <p className="stat-label">Total Weight</p>
                    <p className="stat-value text-xl">
                      {selectedPlan.total_weight.toLocaleString()} lbs
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Payload Used</p>
                    <p className="stat-value text-xl">
                      {selectedPlan.payload_used_percent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Center of Balance</p>
                    <p className={`stat-value text-xl ${selectedPlan.cob_in_envelope ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedPlan.cob_percent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Positions Used</p>
                    <p className="stat-value text-xl">
                      {selectedPlan.positions_used}/{selectedPlan.positions_available}
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">PAX</p>
                    <p className="stat-value text-xl">
                      {selectedPlan.pax_count}
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

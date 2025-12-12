/**
 * Analytics Panel Component
 * Shows mission statistics, fuel costs, configuration comparison, and AI feedback.
 * Enhanced with robust fuel and transport cost calculations.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMission, MissionConfiguration, MissionAnalytics, FuelCostBreakdown, AircraftCostBreakdown } from '../context/MissionContext';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AnalyticsPanelProps {
  onSaveConfiguration: (name: string) => void;
}

const CHART_COLORS = {
  fuel: '#3b82f6',
  operating: '#10b981',
  taxi: '#94a3b8',
  climb: '#f59e0b',
  cruise: '#3b82f6',
  descent: '#8b5cf6',
  reserve: '#ef4444',
  contingency: '#f97316'
};

export default function AnalyticsPanel({ onSaveConfiguration }: AnalyticsPanelProps) {
  const mission = useMission();
  const [configName, setConfigName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [aiFeedback, setAiFeedback] = useState<string[]>([]);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);

  useEffect(() => {
    if (mission.analytics && mission.allocationResult) {
      const feedback = generateQuickInsights(mission.analytics, mission.fuelBreakdown);
      setAiFeedback(feedback);
    }
  }, [mission.analytics, mission.fuelBreakdown, mission.allocationResult]);

  const handleSave = () => {
    if (configName.trim()) {
      onSaveConfiguration(configName.trim());
      setConfigName('');
      setShowSaveDialog(false);
    }
  };

  const toggleCompareSelection = (id: string) => {
    setSelectedForCompare(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(-3)
    );
  };

  const costBreakdownData = useMemo(() => {
    if (!mission.fuelBreakdown) return [];
    return [
      { name: 'Fuel Cost', value: mission.fuelBreakdown.total_fuel_cost_usd, color: CHART_COLORS.fuel },
      { name: 'Operating Cost', value: mission.fuelBreakdown.total_operating_cost_usd, color: CHART_COLORS.operating }
    ];
  }, [mission.fuelBreakdown]);

  const fuelPhaseData = useMemo(() => {
    if (!mission.fuelBreakdown || mission.fuelBreakdown.fuel_per_aircraft.length === 0) return [];
    
    const totals = mission.fuelBreakdown.fuel_per_aircraft.reduce((acc, aircraft) => ({
      taxi: acc.taxi + aircraft.fuel_breakdown.taxi_fuel_lb,
      climb: acc.climb + aircraft.fuel_breakdown.climb_fuel_lb,
      cruise: acc.cruise + aircraft.fuel_breakdown.cruise_fuel_lb,
      descent: acc.descent + aircraft.fuel_breakdown.descent_fuel_lb,
      reserve: acc.reserve + aircraft.fuel_breakdown.reserve_fuel_lb,
      contingency: acc.contingency + aircraft.fuel_breakdown.contingency_fuel_lb
    }), { taxi: 0, climb: 0, cruise: 0, descent: 0, reserve: 0, contingency: 0 });

    return [
      { name: 'Taxi', value: totals.taxi, color: CHART_COLORS.taxi },
      { name: 'Climb', value: totals.climb, color: CHART_COLORS.climb },
      { name: 'Cruise', value: totals.cruise, color: CHART_COLORS.cruise },
      { name: 'Descent', value: totals.descent, color: CHART_COLORS.descent },
      { name: 'Reserve (10%)', value: totals.reserve, color: CHART_COLORS.reserve },
      { name: 'Contingency (5%)', value: totals.contingency, color: CHART_COLORS.contingency }
    ];
  }, [mission.fuelBreakdown]);

  const aircraftComparisonData = useMemo(() => {
    if (!mission.fuelBreakdown) return [];
    return mission.fuelBreakdown.fuel_per_aircraft.map(aircraft => ({
      name: aircraft.aircraft_id,
      fuel: aircraft.fuel_cost_usd,
      operating: aircraft.operating_cost_usd,
      total: aircraft.total_cost_usd
    }));
  }, [mission.fuelBreakdown]);

  const selectedAircraftDetails = useMemo(() => {
    if (!selectedAircraftId || !mission.fuelBreakdown) return null;
    return mission.fuelBreakdown.fuel_per_aircraft.find(a => a.aircraft_id === selectedAircraftId);
  }, [selectedAircraftId, mission.fuelBreakdown]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="section-title">Mission Analytics</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              compareMode ? 'bg-purple-600 text-white' : 'btn-secondary'
            }`}
          >
            Compare Configurations
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="btn-primary"
          >
            Save Configuration
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {mission.analytics && (
            <div className="glass-card p-6">
              <h3 className="text-neutral-900 font-bold mb-4">Mission Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Aircraft" value={mission.analytics.total_aircraft} />
                <StatCard label="Total Pallets" value={mission.analytics.total_pallets} />
                <StatCard label="Total Weight" value={`${(mission.analytics.total_weight_lb / 1000).toFixed(0)}K lbs`} />
                <StatCard label="PAX Count" value={mission.analytics.total_pax} />
                <StatCard label="Total Distance" value={`${mission.analytics.total_distance_nm.toLocaleString()} NM`} />
                <StatCard label="Flight Hours" value={`${mission.analytics.total_flight_hours.toFixed(1)} hrs`} />
                <StatCard label="Avg CoB" value={`${mission.analytics.average_cob_percent.toFixed(1)}%`} />
                <StatCard label="Utilization" value={`${mission.analytics.utilization_percent.toFixed(0)}%`} />
              </div>
            </div>
          )}

          {mission.fuelBreakdown && (
            <>
              <div className="glass-card p-6">
                <h3 className="text-neutral-900 font-bold mb-4">Cost Breakdown</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="stat-card">
                    <div className="stat-value text-blue-600">
                      ${(mission.fuelBreakdown.total_fuel_cost_usd / 1000).toFixed(0)}K
                    </div>
                    <div className="stat-label">Fuel Cost</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value text-green-600">
                      ${(mission.fuelBreakdown.total_operating_cost_usd / 1000).toFixed(0)}K
                    </div>
                    <div className="stat-label">Operating Cost</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value text-purple-600">
                      ${(mission.fuelBreakdown.total_cost_usd / 1000).toFixed(0)}K
                    </div>
                    <div className="stat-label">Total Mission Cost</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value text-amber-600">
                      ${mission.fuelBreakdown.average_cost_per_ton_mile.toFixed(2)}
                    </div>
                    <div className="stat-label">Cost/Ton-Mile</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-neutral-700 font-medium mb-3 text-sm">Cost Distribution</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={costBreakdownData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {costBreakdownData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => [`$${(value / 1000).toFixed(1)}K`, '']}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <h4 className="text-neutral-700 font-medium mb-3 text-sm">Fuel by Flight Phase</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={fuelPhaseData} layout="vertical">
                        <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: number) => [`${(value / 1000).toFixed(1)}K lbs`, '']} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {fuelPhaseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="glass-card p-6">
                <h3 className="text-neutral-900 font-bold mb-4">Fuel Efficiency Metrics</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="stat-card">
                    <div className="stat-value text-primary">
                      {(mission.fuelBreakdown.total_fuel_lb / 1000).toFixed(0)}K
                    </div>
                    <div className="stat-label">Total Fuel (lbs)</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value text-blue-600">
                      {mission.fuelBreakdown.average_fuel_efficiency_lb_per_nm.toFixed(1)}
                    </div>
                    <div className="stat-label">Avg lb/NM</div>
                  </div>
                  <div className="stat-card">
                    <div className={`stat-value ${
                      mission.fuelBreakdown.additional_fuel_from_splits > 0 ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      +{(mission.fuelBreakdown.additional_fuel_from_splits / 1000).toFixed(0)}K
                    </div>
                    <div className="stat-label">From Splits (lbs)</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value text-neutral-600">
                      ${mission.fuelBreakdown.cost_per_lb.toFixed(2)}/lb
                    </div>
                    <div className="stat-label">JP-8 Cost</div>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between text-sm text-neutral-600 mb-2">
                    <span>Reserve Fuel: {(mission.fuelBreakdown.fuel_config.reserve_fuel_percent * 100).toFixed(0)}%</span>
                    <span>Contingency: {(mission.fuelBreakdown.fuel_config.contingency_fuel_percent * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {aircraftComparisonData.length > 1 && (
                <div className="glass-card p-6">
                  <h3 className="text-neutral-900 font-bold mb-4">Per-Aircraft Cost Comparison</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={aircraftComparisonData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                      <Tooltip formatter={(value: number) => [`$${(value / 1000).toFixed(1)}K`, '']} />
                      <Legend />
                      <Bar dataKey="fuel" name="Fuel Cost" fill={CHART_COLORS.fuel} stackId="a" />
                      <Bar dataKey="operating" name="Operating Cost" fill={CHART_COLORS.operating} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="glass-card p-6">
                <h3 className="text-neutral-900 font-bold mb-4">Per Aircraft Breakdown</h3>
                <div className="space-y-2 mb-4">
                  {mission.fuelBreakdown.fuel_per_aircraft.map((aircraft, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 border transition cursor-pointer ${
                        selectedAircraftId === aircraft.aircraft_id 
                          ? 'border-primary bg-blue-50' 
                          : 'border-neutral-200/50 hover:border-neutral-300'
                      }`}
                      onClick={() => setSelectedAircraftId(
                        selectedAircraftId === aircraft.aircraft_id ? null : aircraft.aircraft_id
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <span className={`px-2 py-1 text-xs rounded-lg font-medium ${
                          aircraft.aircraft_type === 'C-17' 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {aircraft.aircraft_type}
                        </span>
                        <span className="text-neutral-900 font-medium">{aircraft.aircraft_id}</span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm">
                        <span className="text-neutral-500">{aircraft.distance_nm.toLocaleString()} NM</span>
                        <span className="text-neutral-500">{aircraft.flight_hours.toFixed(1)} hrs</span>
                        <span className="text-primary font-medium">{(aircraft.fuel_breakdown.total_mission_fuel_lb / 1000).toFixed(0)}K lbs</span>
                        <span className="text-green-600 font-medium">${(aircraft.total_cost_usd / 1000).toFixed(1)}K</span>
                      </div>
                    </div>
                  ))}
                </div>

                <AnimatePresence>
                  {selectedAircraftDetails && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <AircraftDetailView aircraft={selectedAircraftDetails} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}

          {aiFeedback.length > 0 && (
            <div className="glass-card bg-purple-50/50 border-purple-200/50 p-6">
              <h3 className="text-neutral-900 font-bold mb-4 flex items-center">
                <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-purple-600">🤖</span>
                </span>
                AI Insights
              </h3>
              <div className="space-y-3">
                {aiFeedback.map((insight, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2 flex-shrink-0"></span>
                    <p className="text-neutral-700 text-sm">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-neutral-900 font-bold mb-4">Saved Configurations</h3>
            {mission.savedConfigurations.length === 0 ? (
              <div className="text-center text-neutral-500 py-6">
                <p className="mb-3">No saved configurations yet.</p>
                <p className="text-sm">Save your current setup to compare alternatives.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {mission.savedConfigurations.map(config => (
                  <div
                    key={config.id}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      compareMode && selectedForCompare.includes(config.id)
                        ? 'border-purple-400 bg-purple-50'
                        : config.id === mission.activeConfigurationId
                          ? 'border-primary bg-blue-50'
                          : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'
                    }`}
                    onClick={() => compareMode ? toggleCompareSelection(config.id) : mission.loadConfiguration(config.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-900 font-medium">{config.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        config.status === 'complete' ? 'badge-success' : 'badge-warning'
                      }`}>
                        {config.status}
                      </span>
                    </div>
                    <div className="text-neutral-500 text-xs mt-1">
                      {config.split_flights.length} flights • {new Date(config.created_at).toLocaleDateString()}
                    </div>
                    {!compareMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          mission.deleteConfiguration(config.id);
                        }}
                        className="text-red-500 hover:text-red-600 text-xs mt-2 transition"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {compareMode && selectedForCompare.length >= 2 && (
            <ConfigurationComparison
              configurations={mission.compareConfigurations(selectedForCompare)}
            />
          )}

          <div className="glass-card p-6">
            <h3 className="text-neutral-900 font-bold mb-4">Export Options</h3>
            <div className="space-y-2">
              <button className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl transition text-sm font-medium">
                Export ICODES Bundle
              </button>
              <button className="w-full btn-primary">
                Export Mission Summary PDF
              </button>
              <button className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl transition text-sm font-medium">
                Export SAAM CSV
              </button>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-neutral-900 font-bold mb-4">Fuel Rate Reference</h3>
            <div className="space-y-3 text-sm">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="font-medium text-blue-900 mb-1">C-17 Globemaster III</div>
                <div className="text-blue-700 space-y-1">
                  <div>Cruise: 21,000 lb/hr</div>
                  <div>Climb: 28,000 lb/hr</div>
                  <div>Operating: $22,000/hr</div>
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="font-medium text-green-900 mb-1">C-130H Hercules</div>
                <div className="text-green-700 space-y-1">
                  <div>Cruise: 5,500 lb/hr</div>
                  <div>Climb: 7,000 lb/hr</div>
                  <div>Operating: $7,000/hr</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md shadow-glass-lg"
            >
              <h3 className="text-neutral-900 font-bold text-lg mb-4">Save Configuration</h3>
              <input
                type="text"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="Configuration name..."
                className="glass-input w-full mb-4"
                autoFocus
              />
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!configName.trim()}
                  className="btn-primary disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <div className="stat-value text-xl">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function AircraftDetailView({ aircraft }: { aircraft: AircraftCostBreakdown }) {
  const fuelPhaseData = [
    { name: 'Taxi', value: aircraft.fuel_breakdown.taxi_fuel_lb, color: CHART_COLORS.taxi },
    { name: 'Climb', value: aircraft.fuel_breakdown.climb_fuel_lb, color: CHART_COLORS.climb },
    { name: 'Cruise', value: aircraft.fuel_breakdown.cruise_fuel_lb, color: CHART_COLORS.cruise },
    { name: 'Descent', value: aircraft.fuel_breakdown.descent_fuel_lb, color: CHART_COLORS.descent },
    { name: 'Reserve', value: aircraft.fuel_breakdown.reserve_fuel_lb, color: CHART_COLORS.reserve },
    { name: 'Contingency', value: aircraft.fuel_breakdown.contingency_fuel_lb, color: CHART_COLORS.contingency }
  ];

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 mt-4 border border-blue-200/50">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-neutral-900 font-bold">{aircraft.aircraft_id} Details</h4>
        <span className={`px-3 py-1 text-sm rounded-lg font-medium ${
          aircraft.aircraft_type === 'C-17' 
            ? 'bg-blue-100 text-blue-700' 
            : 'bg-green-100 text-green-700'
        }`}>
          {aircraft.aircraft_type}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white/80 rounded-lg p-3">
          <div className="text-lg font-bold text-neutral-900">{aircraft.distance_nm.toLocaleString()}</div>
          <div className="text-xs text-neutral-500">Distance (NM)</div>
        </div>
        <div className="bg-white/80 rounded-lg p-3">
          <div className="text-lg font-bold text-neutral-900">{aircraft.flight_hours.toFixed(2)}</div>
          <div className="text-xs text-neutral-500">Flight Hours</div>
        </div>
        <div className="bg-white/80 rounded-lg p-3">
          <div className="text-lg font-bold text-neutral-900">{(aircraft.payload_weight_lb / 1000).toFixed(0)}K</div>
          <div className="text-xs text-neutral-500">Payload (lbs)</div>
        </div>
        <div className="bg-white/80 rounded-lg p-3">
          <div className="text-lg font-bold text-neutral-900">{aircraft.fuel_efficiency_lb_per_nm.toFixed(1)}</div>
          <div className="text-xs text-neutral-500">lb/NM</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h5 className="text-sm font-medium text-neutral-700 mb-2">Fuel Breakdown by Phase</h5>
          <div className="space-y-2">
            {fuelPhaseData.map((phase, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: phase.color }}></div>
                  <span className="text-sm text-neutral-700">{phase.name}</span>
                </div>
                <span className="text-sm font-medium text-neutral-900">
                  {(phase.value / 1000).toFixed(1)}K lbs
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h5 className="text-sm font-medium text-neutral-700 mb-2">Cost Breakdown</h5>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.fuel }}></div>
                <span className="text-sm text-neutral-700">Fuel Cost</span>
              </div>
              <span className="text-sm font-medium text-blue-600">
                ${(aircraft.fuel_cost_usd / 1000).toFixed(1)}K
              </span>
            </div>
            <div className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.operating }}></div>
                <span className="text-sm text-neutral-700">Operating Cost</span>
              </div>
              <span className="text-sm font-medium text-green-600">
                ${(aircraft.operating_cost_usd / 1000).toFixed(1)}K
              </span>
            </div>
            <div className="flex items-center justify-between bg-purple-100/80 rounded-lg px-3 py-2">
              <span className="text-sm font-medium text-neutral-900">Total Cost</span>
              <span className="text-sm font-bold text-purple-700">
                ${(aircraft.total_cost_usd / 1000).toFixed(1)}K
              </span>
            </div>
            <div className="flex items-center justify-between bg-amber-100/80 rounded-lg px-3 py-2">
              <span className="text-sm text-neutral-700">Cost per Ton-Mile</span>
              <span className="text-sm font-medium text-amber-700">
                ${aircraft.cost_per_ton_mile.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigurationComparison({ configurations }: { configurations: MissionConfiguration[] }) {
  if (configurations.length < 2) return null;

  return (
    <div className="glass-card bg-purple-50/50 border-purple-200/50 p-4">
      <h4 className="text-neutral-900 font-bold mb-3">Comparison</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-500 text-left border-b border-neutral-200">
              <th className="py-2">Metric</th>
              {configurations.map(c => (
                <th key={c.id} className="py-2 text-neutral-900">{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-neutral-900">
            <tr className="border-b border-neutral-100">
              <td className="py-2 text-neutral-500">Flights</td>
              {configurations.map(c => (
                <td key={c.id} className="py-2 font-medium">{c.split_flights.length}</td>
              ))}
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 text-neutral-500">Pallets</td>
              {configurations.map(c => (
                <td key={c.id} className="py-2 font-medium">
                  {c.split_flights.reduce((sum, f) => sum + f.pallets.length, 0)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-neutral-100">
              <td className="py-2 text-neutral-500">Weight</td>
              {configurations.map(c => (
                <td key={c.id} className="py-2 font-medium">
                  {(c.split_flights.reduce((sum, f) => sum + f.total_weight_lb, 0) / 1000).toFixed(0)}K
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 text-neutral-500">Routes</td>
              {configurations.map(c => (
                <td key={c.id} className="py-2 font-medium">
                  {c.routes.length}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function generateQuickInsights(analytics: MissionAnalytics, fuelBreakdown: FuelCostBreakdown | null): string[] {
  const insights: string[] = [];
  
  if (analytics.utilization_percent < 70) {
    insights.push(`Aircraft utilization is at ${analytics.utilization_percent.toFixed(0)}%. Consider consolidating cargo to reduce aircraft count and save on operating costs.`);
  } else if (analytics.utilization_percent > 95) {
    insights.push(`High utilization (${analytics.utilization_percent.toFixed(0)}%). Weight distribution is efficient, maximizing cost-effectiveness.`);
  }
  
  if (analytics.average_cob_percent < 22 || analytics.average_cob_percent > 32) {
    insights.push(`Average center of balance (${analytics.average_cob_percent.toFixed(1)}%) is approaching limits. Review cargo positioning for optimal fuel efficiency.`);
  } else {
    insights.push(`Center of balance averaging ${analytics.average_cob_percent.toFixed(1)}% across fleet - well within safe envelope.`);
  }
  
  if (fuelBreakdown) {
    if (fuelBreakdown.additional_fuel_from_splits > 0) {
      const additionalCost = fuelBreakdown.additional_fuel_from_splits * fuelBreakdown.cost_per_lb;
      insights.push(`Splitting cargo adds ${(fuelBreakdown.additional_fuel_from_splits / 1000).toFixed(0)}K lbs of fuel (+$${(additionalCost / 1000).toFixed(0)}K). Evaluate if operational necessity justifies cost.`);
    }

    const fuelPercent = (fuelBreakdown.total_fuel_cost_usd / fuelBreakdown.total_cost_usd) * 100;
    if (fuelPercent > 60) {
      insights.push(`Fuel accounts for ${fuelPercent.toFixed(0)}% of total mission cost. Consider route optimization or lighter payload distribution.`);
    }

    if (fuelBreakdown.average_cost_per_ton_mile > 0.50) {
      insights.push(`Cost per ton-mile ($${fuelBreakdown.average_cost_per_ton_mile.toFixed(2)}) is above average. Maximizing payload per flight could improve efficiency.`);
    } else if (fuelBreakdown.average_cost_per_ton_mile < 0.30) {
      insights.push(`Excellent cost efficiency at $${fuelBreakdown.average_cost_per_ton_mile.toFixed(2)} per ton-mile. Current configuration is cost-optimized.`);
    }
  }
  
  if (analytics.total_aircraft > 3) {
    insights.push(`Large fleet operation with ${analytics.total_aircraft} aircraft. Consider staggered departure times to optimize airspace and ground handling.`);
  }
  
  return insights;
}

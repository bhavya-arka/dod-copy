/**
 * Mission Workspace Component
 * Unified tabbed interface after CSV upload showing flights, routes, schedules, weather, cargo split, and analytics.
 * Updated with minimalist glass UI design.
 */

import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMission } from '../context/MissionContext';
import MissionNavbar from './MissionNavbar';
import LoadPlanViewer from './LoadPlanViewer';
import FlightSplitter from './FlightSplitter';
import AnalyticsPanel from './AnalyticsPanel';
import { SplitFlight } from '../lib/flightSplitTypes';
import { getBaseWeather } from '../lib/weatherService';

interface LoadedPlanInfo {
  id: number;
  name: string;
  status: 'draft' | 'complete' | 'archived';
}

interface MissionWorkspaceProps {
  onBack?: () => void;
  onHome?: () => void;
  onDashboard?: () => void;
  loadedPlan?: LoadedPlanInfo | null;
  onPlanStatusChange?: (newStatus: 'draft' | 'complete' | 'archived') => void;
}

export default function MissionWorkspace({ onBack, onHome, onDashboard, loadedPlan, onPlanStatusChange }: MissionWorkspaceProps) {
  const handleNavigateAway = onDashboard || onBack || onHome || (() => {});
  const mission = useMission();

  useEffect(() => {
    mission.calculateAnalytics();
    mission.calculateFuelBreakdown();
  }, [mission.allocationResult, mission.splitFlights, mission.routes]);

  const handleSplitSave = async (flights: SplitFlight[]) => {
    mission.setSplitFlights(flights);
    if (loadedPlan?.id) {
      await mission.updatePlanSchedules(loadedPlan.id, flights);
    }
  };

  const renderTabContent = () => {
    switch (mission.currentTab) {
      case 'flights':
        if (!mission.allocationResult || !mission.insights) return null;
        return (
          <LoadPlanViewer
            allocationResult={mission.allocationResult}
            insights={mission.insights}
            onBack={handleNavigateAway}
            onHome={handleNavigateAway}
            onExport={() => {}}
            onRoutePlanning={() => mission.setCurrentTab('cargo_split')}
            hideNavigation
          />
        );

      case 'manifest':
        return (
          <div className="p-8">
            <h2 className="section-title mb-6">Movement Manifest</h2>
            <div className="glass-card overflow-hidden">
              {mission.classifiedItems ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-100 border-b border-neutral-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-neutral-700 font-semibold text-sm">Description</th>
                        <th className="px-4 py-3 text-left text-neutral-700 font-semibold text-sm">Length</th>
                        <th className="px-4 py-3 text-left text-neutral-700 font-semibold text-sm">Width</th>
                        <th className="px-4 py-3 text-left text-neutral-700 font-semibold text-sm">Height</th>
                        <th className="px-4 py-3 text-left text-neutral-700 font-semibold text-sm">Weight</th>
                        <th className="px-4 py-3 text-left text-neutral-700 font-semibold text-sm">Lead TCN</th>
                        <th className="px-4 py-3 text-left text-neutral-700 font-semibold text-sm">PAX</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {[
                        ...mission.classifiedItems.rolling_stock,
                        ...mission.classifiedItems.prebuilt_pallets,
                        ...mission.classifiedItems.loose_items,
                        ...mission.classifiedItems.pax_items
                      ].map((item, idx) => (
                        <tr key={item.item_id || idx} className="hover:bg-neutral-50 transition-colors">
                          <td className="px-4 py-3 text-neutral-900 text-sm font-medium max-w-xs truncate">
                            {item.description || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 text-sm font-mono">
                            {item.length_in > 0 ? `${item.length_in}"` : '-'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 text-sm font-mono">
                            {item.width_in > 0 ? `${item.width_in}"` : '-'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 text-sm font-mono">
                            {item.height_in > 0 ? `${item.height_in}"` : '-'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 text-sm font-mono">
                            {item.weight_each_lb > 0 ? `${item.weight_each_lb.toLocaleString()} lb` : '-'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 text-sm font-mono">
                            {item.utc_id || item.tcn || '-'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 text-sm font-mono">
                            {item.pax_count && item.pax_count > 0 ? item.pax_count : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-neutral-500 py-8">
                  <p>No manifest data available.</p>
                </div>
              )}
            </div>
            {mission.classifiedItems && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-neutral-500 text-sm">
                  Total items: {[
                    ...mission.classifiedItems.rolling_stock,
                    ...mission.classifiedItems.prebuilt_pallets,
                    ...mission.classifiedItems.loose_items,
                    ...mission.classifiedItems.pax_items
                  ].length}
                </div>
                <div className="text-neutral-500 text-sm">
                  Total weight: {[
                    ...mission.classifiedItems.rolling_stock,
                    ...mission.classifiedItems.prebuilt_pallets,
                    ...mission.classifiedItems.loose_items,
                  ].reduce((sum, item) => sum + item.weight_each_lb, 0).toLocaleString()} lb
                </div>
              </div>
            )}
          </div>
        );

      case 'schedules':
        return (
          <div className="p-8">
            <h2 className="section-title mb-6">Flight Schedules</h2>
            <div className="glass-card p-6">
              {mission.splitFlights.length > 0 ? (
                <div className="space-y-3">
                  {mission.splitFlights.map(flight => (
                    <div key={flight.id} className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-200/50">
                      <div>
                        <div className="text-neutral-900 font-bold">{flight.callsign}</div>
                        <div className="text-neutral-500 text-sm">
                          {flight.origin.icao} → {flight.destination.icao}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-600 font-mono text-sm">
                          DEP: {flight.scheduled_departure.toLocaleTimeString('en-US', { hour12: false })}Z
                        </div>
                        <div className="text-primary font-mono text-sm">
                          ARR: {flight.scheduled_arrival.toLocaleTimeString('en-US', { hour12: false })}Z
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-neutral-500 py-8">
                  <p>No flights scheduled yet.</p>
                  <button
                    onClick={() => mission.setCurrentTab('cargo_split')}
                    className="mt-4 btn-primary"
                  >
                    Configure Flights
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'weather':
        const baseIcaos = mission.splitFlights.length > 0 
          ? Array.from(new Set(mission.splitFlights.flatMap(f => [f.origin.icao, f.destination.icao])))
          : [];
        
        return (
          <div className="p-8">
            <h2 className="section-title mb-6">Weather at Bases</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {baseIcaos.length > 0 ? (
                baseIcaos.map(icao => {
                  const base = mission.splitFlights.find(f => f.origin.icao === icao)?.origin ||
                               mission.splitFlights.find(f => f.destination.icao === icao)?.destination;
                  if (!base) return null;
                  
                  const weather = getBaseWeather(base);
                  const tempF = weather.temperature_c !== null ? Math.round(weather.temperature_c * 9/5 + 32) : null;
                  const conditionBadge = weather.conditions === 'VFR' ? 'badge-success' :
                                        weather.conditions === 'MVFR' ? 'badge-warning' : 'badge-danger';
                  
                  return (
                    <div key={icao} className="glass-card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-neutral-900 font-bold">{icao}</span>
                        <span className="text-neutral-500 text-sm">{base.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-neutral-500">Temp:</span>
                          {tempF !== null ? (
                            <span className="text-neutral-900 ml-2 font-medium">{tempF}°F</span>
                          ) : (
                            <span className="text-red-500 ml-2 font-medium">N/A</span>
                          )}
                        </div>
                        <div>
                          <span className="text-neutral-500">Wind:</span>
                          {weather.wind_speed_kt !== null ? (
                            <span className="text-neutral-900 ml-2 font-medium">{weather.wind_speed_kt} kts</span>
                          ) : (
                            <span className="text-red-500 ml-2 font-medium">N/A</span>
                          )}
                        </div>
                        <div>
                          <span className="text-neutral-500">Ceiling:</span>
                          {weather.ceiling_ft !== null ? (
                            <span className="text-neutral-900 ml-2 font-medium">{weather.ceiling_ft.toLocaleString()} ft</span>
                          ) : (
                            <span className="text-red-500 ml-2 font-medium">N/A</span>
                          )}
                        </div>
                        <div>
                          <span className="text-neutral-500">Vis:</span>
                          {weather.conditions !== null ? (
                            <span className={`${conditionBadge} ml-2`}>{weather.conditions}</span>
                          ) : (
                            <span className="text-red-500 ml-2 font-medium">N/A</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-3 text-center text-neutral-500 py-8">
                  Configure flights to see weather information for bases.
                </div>
              )}
            </div>
          </div>
        );

      case 'cargo_split':
        if (!mission.allocationResult) return null;
        return (
          <FlightSplitter
            allocationResult={mission.allocationResult}
            onClose={() => mission.setCurrentTab('flights')}
            onSave={handleSplitSave}
            embedded={true}
            existingSplitFlights={mission.splitFlights.length > 0 ? mission.splitFlights : undefined}
          />
        );

      case 'analytics':
        return <AnalyticsPanel onSaveConfiguration={(name: string) => mission.saveConfiguration(name)} />;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 gradient-mesh">
      <MissionNavbar 
        onDashboard={handleNavigateAway} 
        showTabs={true} 
        loadedPlan={loadedPlan}
        onPlanStatusChange={onPlanStatusChange}
      />
      
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={mission.currentTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

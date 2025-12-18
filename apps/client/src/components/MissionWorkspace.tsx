/**
 * Mission Workspace Component
 * Unified tabbed interface after CSV upload showing flights, routes, schedules, weather, cargo split, and analytics.
 * Updated with minimalist glass UI design.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Table, Grid3X3 } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import MissionNavbar from './MissionNavbar';
import LoadPlanViewer from './LoadPlanViewer';
import FlightSplitter from './FlightSplitter';
import AnalyticsPanel from './AnalyticsPanel';
import EditableSpreadsheet, { SpreadsheetColumn, SpreadsheetRow } from './EditableSpreadsheet';
import { SplitFlight } from '../lib/flightSplitTypes';
import { getBaseWeather } from '../lib/weatherService';
import { MovementItem, ClassifiedItems } from '../lib/pacafTypes';

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

const manifestColumns: SpreadsheetColumn[] = [
  { key: 'description', label: 'Description', width: 200, editable: true },
  { key: 'length_in', label: 'Length (in)', width: 90, type: 'number', editable: true, format: (v) => v > 0 ? `${v}"` : '-' },
  { key: 'width_in', label: 'Width (in)', width: 90, type: 'number', editable: true, format: (v) => v > 0 ? `${v}"` : '-' },
  { key: 'height_in', label: 'Height (in)', width: 90, type: 'number', editable: true, format: (v) => v > 0 ? `${v}"` : '-' },
  { key: 'weight_each_lb', label: 'Weight (lb)', width: 100, type: 'number', editable: true, format: (v) => v > 0 ? v.toLocaleString() : '-' },
  { key: 'type', label: 'Type', width: 120, editable: false },
  { key: 'tcn', label: 'Lead TCN', width: 140, editable: true },
  { key: 'pax_count', label: 'PAX', width: 60, type: 'number', editable: true, format: (v) => v && v > 0 ? v.toString() : '-' },
  { key: 'hazmat_flag', label: 'HAZMAT', width: 80, type: 'checkbox', editable: true, format: (v) => v ? 'Yes' : 'No' },
  { key: 'advon_flag', label: 'ADVON', width: 80, type: 'checkbox', editable: true, format: (v) => v ? 'Yes' : 'No' },
];

export default function MissionWorkspace({ onBack, onHome, onDashboard, loadedPlan, onPlanStatusChange }: MissionWorkspaceProps) {
  const handleNavigateAway = onDashboard || onBack || onHome || (() => {});
  const mission = useMission();
  const [manifestViewMode, setManifestViewMode] = useState<'table' | 'spreadsheet'>('spreadsheet');

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

  const manifestData = useMemo((): SpreadsheetRow[] => {
    if (!mission.classifiedItems) return [];
    const items = [
      ...mission.classifiedItems.rolling_stock,
      ...mission.classifiedItems.prebuilt_pallets,
      ...mission.classifiedItems.loose_items,
      ...mission.classifiedItems.pax_items
    ];
    return items.map((item, idx) => ({
      id: item.item_id || idx,
      description: item.description || '',
      length_in: item.length_in || 0,
      width_in: item.width_in || 0,
      height_in: item.height_in || 0,
      weight_each_lb: item.weight_each_lb || 0,
      type: item.type || 'PALLETIZABLE',
      tcn: item.utc_id || item.tcn || '',
      pax_count: item.pax_count || 0,
      hazmat_flag: item.hazmat_flag || false,
      advon_flag: item.advon_flag || false,
      _original: item,
    }));
  }, [mission.classifiedItems]);

  const handleManifestDataChange = useCallback((newData: SpreadsheetRow[]) => {
    if (!mission.classifiedItems) return;
    
    const updatedItems: MovementItem[] = newData.map(row => ({
      ...(row._original as MovementItem),
      description: row.description,
      length_in: row.length_in,
      width_in: row.width_in,
      height_in: row.height_in,
      weight_each_lb: row.weight_each_lb,
      utc_id: row.tcn,
      tcn: row.tcn,
      pax_count: row.pax_count,
      hazmat_flag: row.hazmat_flag,
      advon_flag: row.advon_flag,
    }));

    const newClassified: ClassifiedItems = {
      ...mission.classifiedItems,
      rolling_stock: updatedItems.filter(i => i.type === 'ROLLING_STOCK'),
      prebuilt_pallets: updatedItems.filter(i => i.type === 'PREBUILT_PALLET'),
      loose_items: updatedItems.filter(i => i.type === 'PALLETIZABLE'),
      pax_items: updatedItems.filter(i => i.type === 'PAX'),
      advon_items: updatedItems.filter(i => i.advon_flag),
      main_items: updatedItems.filter(i => !i.advon_flag),
    };

    mission.setClassifiedItems(newClassified);

    if (mission.manifestId) {
      fetch(`/api/manifests/${mission.manifestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: updatedItems })
      }).catch(error => {
        console.error('Failed to save manifest changes to database:', error);
      });
    }
  }, [mission]);

  const handleManifestRowDelete = useCallback((id: string | number) => {
    if (!mission.classifiedItems) return;
    
    const newClassified: ClassifiedItems = {
      ...mission.classifiedItems,
      rolling_stock: mission.classifiedItems.rolling_stock.filter(i => (i.item_id || i.utc_id) !== id),
      prebuilt_pallets: mission.classifiedItems.prebuilt_pallets.filter(i => (i.item_id || i.utc_id) !== id),
      loose_items: mission.classifiedItems.loose_items.filter(i => (i.item_id || i.utc_id) !== id),
      pax_items: mission.classifiedItems.pax_items.filter(i => (i.item_id || i.utc_id) !== id),
      advon_items: mission.classifiedItems.advon_items.filter(i => (i.item_id || i.utc_id) !== id),
      main_items: mission.classifiedItems.main_items.filter(i => (i.item_id || i.utc_id) !== id),
    };

    mission.setClassifiedItems(newClassified);

    if (mission.manifestId) {
      const remainingItems = [
        ...newClassified.rolling_stock,
        ...newClassified.prebuilt_pallets,
        ...newClassified.loose_items,
        ...newClassified.pax_items
      ];
      fetch(`/api/manifests/${mission.manifestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: remainingItems })
      }).catch(error => {
        console.error('Failed to save manifest deletion to database:', error);
      });
    }
  }, [mission]);

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
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h2 className="section-title text-xl sm:text-2xl">Movement Manifest</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setManifestViewMode('table')}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      manifestViewMode === 'table'
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Table</span>
                  </button>
                  <button
                    onClick={() => setManifestViewMode('spreadsheet')}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      manifestViewMode === 'spreadsheet'
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <Grid3X3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Spreadsheet</span>
                  </button>
                </div>
              </div>
            </div>
            
            {manifestViewMode === 'spreadsheet' ? (
              <div className="glass-card overflow-hidden">
                <EditableSpreadsheet
                  columns={manifestColumns}
                  data={manifestData}
                  onDataChange={handleManifestDataChange}
                  onRowDelete={handleManifestRowDelete}
                  title="Cargo Manifest"
                  editable={true}
                  showToolbar={true}
                  showRowNumbers={true}
                  maxHeight="calc(100vh - 280px)"
                  emptyMessage="No manifest data available. Upload a movement list to begin."
                />
              </div>
            ) : (
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
            )}
            
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
          <div className="p-4 sm:p-6 lg:p-8">
            <h2 className="section-title text-xl sm:text-2xl mb-4 sm:mb-6">Flight Schedules</h2>
            <div className="glass-card p-4 sm:p-6">
              {mission.splitFlights.length > 0 ? (
                <div className="space-y-3">
                  {mission.splitFlights.map(flight => (
                    <div key={flight.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 p-3 sm:p-4 bg-neutral-50 rounded-xl border border-neutral-200/50">
                      <div>
                        <div className="text-neutral-900 font-bold text-sm sm:text-base">{flight.callsign}</div>
                        <div className="text-neutral-500 text-xs sm:text-sm">
                          {flight.origin.icao} → {flight.destination.icao}
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-3 sm:gap-0 sm:text-right text-xs sm:text-sm">
                        <div className="text-green-600 font-mono">
                          DEP: {flight.scheduled_departure.toLocaleTimeString('en-US', { hour12: false })}Z
                        </div>
                        <div className="text-primary font-mono">
                          ARR: {flight.scheduled_arrival.toLocaleTimeString('en-US', { hour12: false })}Z
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-neutral-500 py-6 sm:py-8">
                  <p className="text-sm sm:text-base">No flights scheduled yet.</p>
                  <button
                    onClick={() => mission.setCurrentTab('cargo_split')}
                    className="mt-4 btn-primary text-sm"
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
          <div className="p-4 sm:p-6 lg:p-8">
            <h2 className="section-title text-xl sm:text-2xl mb-4 sm:mb-6">Weather at Bases</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
    <div className="bg-neutral-50 gradient-mesh">
      <MissionNavbar 
        onDashboard={handleNavigateAway} 
        showTabs={true} 
        loadedPlan={loadedPlan}
        onPlanStatusChange={onPlanStatusChange}
      />
      
      <main className="pb-8">
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

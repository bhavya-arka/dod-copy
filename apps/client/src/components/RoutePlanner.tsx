/**
 * PACAF Airlift Demo - Route Planner
 * 
 * Multi-leg flight planning with distance, time, fuel calculations,
 * weather prediction, and flight scheduling.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MILITARY_BASES } from '../lib/bases';
import {
  MilitaryBase,
  RouteLeg,
  RouteSettings,
  DEFAULT_ROUTE_SETTINGS,
  RouteInsight,
  ScheduledFlight,
  WeatherMovement,
  WeatherForecast,
  ScheduleConflict
} from '../lib/routeTypes';
import {
  createRouteLeg,
  calculateRouteTotals,
  formatFlightTime,
  formatDistance,
  formatMilitaryTime,
  formatMilitaryDateTime
} from '../lib/routeCalculations';
import { AllocationResult } from '../lib/pacafTypes';
import { 
  getActiveWeatherSystems, 
  getBaseWeather,
  getRealBaseWeather,
  willWeatherAffectRoute,
  formatWindData,
  getConditionsColor
} from '../lib/weatherService';
import {
  createScheduledFlight,
  checkScheduleConflicts,
  generateCallsign
} from '../lib/flightScheduler';
import FlightSplitter from './FlightSplitter';
import { SplitFlight } from '../lib/flightSplitTypes';

interface RoutePlannerProps {
  allocationResult?: AllocationResult;
  onBack: () => void;
  onHome?: () => void;
  hideNavigation?: boolean;
}

interface LegConfig {
  id: string;
  origin_id: string;
  destination_id: string;
  aircraft_id: string;
  departure_time: Date;
}

type ViewTab = 'routes' | 'schedule' | 'weather' | 'cargo';

export default function RoutePlanner({ allocationResult, onBack, onHome }: RoutePlannerProps) {
  const [legs, setLegs] = useState<LegConfig[]>([
    { 
      id: '1', 
      origin_id: 'TRAVIS', 
      destination_id: 'HICKAM', 
      aircraft_id: '',
      departure_time: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  ]);
  const [settings, setSettings] = useState<RouteSettings>(DEFAULT_ROUTE_SETTINGS);
  const [selectedLeg, setSelectedLeg] = useState<string | null>('1');
  const [activeTab, setActiveTab] = useState<ViewTab>('routes');
  const [scheduledFlights, setScheduledFlights] = useState<ScheduledFlight[]>([]);
  const [showFlightSplitter, setShowFlightSplitter] = useState(false);
  const [savedSplitFlights, setSavedSplitFlights] = useState<SplitFlight[]>([]);
  const [baseWeatherData, setBaseWeatherData] = useState<Map<string, WeatherForecast>>(new Map());
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [weatherErrors, setWeatherErrors] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (activeTab === 'weather') {
      const fetchAllBaseWeather = async () => {
        setWeatherLoading(true);
        const newWeatherData = new Map<string, WeatherForecast>();
        const newErrors = new Map<string, boolean>();
        
        const basesToFetch = MILITARY_BASES.slice(0, 8);
        
        await Promise.all(
          basesToFetch.map(async (base) => {
            try {
              const weather = await getRealBaseWeather(base);
              newWeatherData.set(base.base_id, weather);
              newErrors.set(base.base_id, false);
            } catch (error) {
              console.error(`Failed to fetch weather for ${base.base_id}:`, error);
              const fallback = getBaseWeather(base);
              newWeatherData.set(base.base_id, fallback);
              newErrors.set(base.base_id, true);
            }
          })
        );
        
        setBaseWeatherData(newWeatherData);
        setWeatherErrors(newErrors);
        setWeatherLoading(false);
      };
      
      fetchAllBaseWeather();
    }
  }, [activeTab]);

  const availableAircraft = useMemo(() => {
    if (!allocationResult) return [];
    return allocationResult.load_plans.map(p => ({
      id: p.aircraft_id,
      type: p.aircraft_type,
      phase: p.phase,
      weight: p.total_weight
    }));
  }, [allocationResult]);

  const weatherSystems = useMemo(() => getActiveWeatherSystems(), []);

  const calculatedLegs = useMemo(() => {
    return legs.map((legConfig, idx) => {
      const origin = MILITARY_BASES.find(b => b.base_id === legConfig.origin_id);
      const destination = MILITARY_BASES.find(b => b.base_id === legConfig.destination_id);
      
      if (!origin || !destination) return null;
      
      const aircraft = availableAircraft.find(a => a.id === legConfig.aircraft_id);
      const aircraft_type = aircraft?.type || 'C-17';
      
      return createRouteLeg(
        legConfig.id,
        idx + 1,
        origin,
        destination,
        aircraft_type as 'C-17' | 'C-130',
        legConfig.aircraft_id || `${aircraft_type}-UNASSIGNED`,
        [],
        [],
        0,
        aircraft?.weight || 0,
        undefined,
        settings
      );
    }).filter(Boolean) as RouteLeg[];
  }, [legs, settings, availableAircraft]);

  const routeTotals = useMemo(() => {
    return calculateRouteTotals(calculatedLegs);
  }, [calculatedLegs]);

  const scheduleConflicts = useMemo(() => {
    return checkScheduleConflicts(scheduledFlights);
  }, [scheduledFlights]);

  const insights = useMemo((): RouteInsight[] => {
    const results: RouteInsight[] = [];
    
    if (calculatedLegs.length > 1) {
      const directDistance = calculatedLegs.length > 0 ? calculatedLegs[0].distance_nm : 0;
      const actualDistance = routeTotals.total_distance_nm;
      
      if (actualDistance > directDistance * 1.2) {
        results.push({
          id: 'efficiency-1',
          type: 'efficiency',
          severity: 'warning',
          title: 'Route Complexity',
          description: `Multi-stop route adds ${formatDistance(actualDistance - directDistance)} over direct routing.`,
          recommendation: 'Consider consolidating stops if operationally feasible'
        });
      }
    }
    
    for (const leg of legs) {
      const origin = MILITARY_BASES.find(b => b.base_id === leg.origin_id);
      const dest = MILITARY_BASES.find(b => b.base_id === leg.destination_id);
      if (origin && dest) {
        const wxCheck = willWeatherAffectRoute(origin, dest, leg.departure_time);
        if (wxCheck.affected) {
          results.push({
            id: `weather-${leg.id}`,
            type: 'risk',
            severity: wxCheck.systems.some(s => s.severity === 'severe') ? 'critical' : 'warning',
            title: `Weather Alert - Leg ${leg.id}`,
            description: wxCheck.recommendation,
            recommendation: 'Review weather data and consider alternate timing'
          });
        }
      }
    }
    
    return results;
  }, [calculatedLegs, routeTotals, legs]);

  const addLeg = () => {
    const lastLeg = legs[legs.length - 1];
    const newId = String(legs.length + 1);
    const newDeparture = new Date(lastLeg.departure_time.getTime() + 4 * 60 * 60 * 1000);
    setLegs([...legs, {
      id: newId,
      origin_id: lastLeg?.destination_id || 'HICKAM',
      destination_id: 'KADENA',
      aircraft_id: lastLeg?.aircraft_id || '',
      departure_time: newDeparture
    }]);
    setSelectedLeg(newId);
  };

  const removeLeg = (id: string) => {
    if (legs.length <= 1) return;
    setLegs(legs.filter(l => l.id !== id));
    if (selectedLeg === id) {
      setSelectedLeg(legs[0]?.id || null);
    }
  };

  const updateLeg = (id: string, updates: Partial<LegConfig>) => {
    setLegs(legs.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const scheduleFlightFromLeg = useCallback((leg: LegConfig) => {
    const origin = MILITARY_BASES.find(b => b.base_id === leg.origin_id);
    const dest = MILITARY_BASES.find(b => b.base_id === leg.destination_id);
    if (!origin || !dest) return;
    
    const aircraft = availableAircraft.find(a => a.id === leg.aircraft_id);
    const aircraftType = (aircraft?.type || 'C-17') as 'C-17' | 'C-130';
    
    const flight = createScheduledFlight(
      origin,
      dest,
      aircraftType,
      leg.departure_time,
      aircraft?.weight || 0,
      0,
      [],
      aircraft?.id,
      aircraft?.id ? `${aircraft.id.replace(/-/g, '')}` : undefined
    );
    
    setScheduledFlights(prev => [...prev, flight]);
  }, [availableAircraft]);

  const removeScheduledFlight = (id: string) => {
    setScheduledFlights(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="min-h-screen bg-neutral-50 gradient-mesh">
      <header className="p-4 border-b border-neutral-200 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="btn-ghost flex items-center space-x-2"
          >
            <span>←</span>
            <span>Back</span>
          </button>
          {onHome && (
            <button
              onClick={onHome}
              className="btn-ghost flex items-center space-x-2"
            >
              <span>🏠</span>
              <span>Home</span>
            </button>
          )}
          <div className="h-6 w-px bg-neutral-300" />
          <h1 className="text-neutral-900 font-bold text-lg">Route & Flight Planning</h1>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <div className="glass-card px-3 py-1.5 font-mono">
            <span className="text-neutral-500">ZULU:</span>
            <span className="text-green-600 ml-2 font-bold">{formatMilitaryTime(new Date())}</span>
          </div>
          <div className="glass-card px-3 py-1.5">
            <span className="text-neutral-500">Distance:</span>
            <span className="text-neutral-900 ml-2 font-bold">{formatDistance(routeTotals.total_distance_nm)}</span>
          </div>
          <div className="glass-card px-3 py-1.5">
            <span className="text-neutral-500">Block Time:</span>
            <span className="text-neutral-900 ml-2 font-bold">{formatFlightTime(routeTotals.total_block_time_hr)}</span>
          </div>
          <div className="glass-card px-3 py-1.5">
            <span className="text-neutral-500">Fuel:</span>
            <span className="text-neutral-900 ml-2 font-bold">{Math.round(routeTotals.total_fuel_lb / 1000)}K LBS</span>
          </div>
        </div>
      </header>

      <div className="flex border-b border-neutral-200 bg-white/50 backdrop-blur-sm">
        {(['routes', 'schedule', 'weather', 'cargo'] as ViewTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium transition ${
              activeTab === tab 
                ? 'text-primary border-b-2 border-primary bg-primary/5' 
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            {tab === 'routes' && 'Route Planning'}
            {tab === 'schedule' && `Flight Schedule (${scheduledFlights.length})`}
            {tab === 'weather' && 'Weather Systems'}
            {tab === 'cargo' && `Cargo Split (${savedSplitFlights.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'routes' && (
        <div className="flex h-[calc(100vh-120px)]">
          <aside className="w-80 border-r border-neutral-200 bg-white/50 backdrop-blur-sm overflow-y-auto p-4 scrollbar-thin">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-neutral-900 font-bold">Flight Legs</h2>
              <button
                onClick={addLeg}
                className="btn-primary text-sm py-1.5"
              >
                + Add Leg
              </button>
            </div>

            <div className="space-y-2">
              {legs.map((leg, idx) => {
                const calcLeg = calculatedLegs[idx];
                const origin = MILITARY_BASES.find(b => b.base_id === leg.origin_id);
                const dest = MILITARY_BASES.find(b => b.base_id === leg.destination_id);
                
                return (
                  <div
                    key={leg.id}
                    onClick={() => setSelectedLeg(leg.id)}
                    className={`p-3 rounded-xl cursor-pointer transition border ${
                      selectedLeg === leg.id
                        ? 'glass-card ring-2 ring-primary ring-offset-2'
                        : 'bg-white/60 border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-neutral-900 font-bold">Leg {idx + 1}</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); scheduleFlightFromLeg(leg); }}
                          className="text-green-600 hover:text-green-700 text-xs transition"
                          title="Schedule this flight"
                        >
                          Schedule
                        </button>
                        {legs.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeLeg(leg.id); }}
                            className="text-neutral-400 hover:text-red-500 text-sm transition"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-neutral-600">
                      {origin?.icao || '?'} → {dest?.icao || '?'}
                    </div>
                    <div className="text-xs text-green-600 font-mono mt-1">
                      DEP: {formatMilitaryTime(leg.departure_time)}
                    </div>
                    {calcLeg && (
                      <div className="text-xs text-neutral-500 mt-1">
                        {formatDistance(calcLeg.distance_nm)} • {formatFlightTime(calcLeg.block_time_hr)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-200">
              <h3 className="text-neutral-900 font-bold mb-3">Settings</h3>
              <div className="mt-3">
                <label className="text-sm text-neutral-500">Fuel Reserve</label>
                <select
                  value={settings.reserve_factor}
                  onChange={(e) => setSettings({ ...settings, reserve_factor: parseFloat(e.target.value) })}
                  className="glass-input w-full mt-1 text-sm"
                >
                  <option value={1.1}>10% Reserve</option>
                  <option value={1.25}>25% Reserve</option>
                  <option value={1.5}>50% Reserve</option>
                </select>
              </div>
            </div>
          </aside>

          <main className="flex-1 p-6 overflow-y-auto bg-neutral-50/50 scrollbar-thin">
            {selectedLeg && (
              <motion.div
                key={selectedLeg}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto"
              >
                <LegEditor
                  leg={legs.find(l => l.id === selectedLeg)!}
                  onUpdate={(updates) => updateLeg(selectedLeg, updates)}
                  availableAircraft={availableAircraft}
                  calculatedLeg={calculatedLegs.find(l => l.id === selectedLeg)}
                />
              </motion.div>
            )}

            {insights.length > 0 && (
              <div className="mt-6 max-w-3xl mx-auto">
                <h3 className="text-neutral-900 font-bold mb-4">Route Insights</h3>
                <div className="space-y-2">
                  {insights.map(insight => (
                    <div
                      key={insight.id}
                      className={`p-3 rounded-xl border ${
                        insight.severity === 'critical'
                          ? 'bg-red-50 border-red-300'
                          : insight.severity === 'warning'
                            ? 'bg-amber-50 border-amber-300'
                            : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <h4 className={`font-bold text-sm ${
                        insight.severity === 'critical' ? 'text-red-700' :
                        insight.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'
                      }`}>
                        {insight.title}
                      </h4>
                      <p className="text-neutral-600 text-sm mt-1">{insight.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="p-6 overflow-y-auto h-[calc(100vh-120px)] bg-neutral-50/50 scrollbar-thin">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-neutral-900 font-bold text-xl">Scheduled Flights</h2>
              <div className="text-neutral-500 text-sm">
                {formatMilitaryDateTime(new Date())}
              </div>
            </div>

            {scheduleConflicts.length > 0 && (
              <div className="mb-6 space-y-2">
                <h3 className="text-amber-700 font-bold">Schedule Conflicts</h3>
                {scheduleConflicts.map(conflict => (
                  <div key={conflict.id} className="bg-amber-50 border border-amber-300 rounded-xl p-3">
                    <p className="text-amber-800 text-sm">{conflict.description}</p>
                    <p className="text-amber-600 text-xs mt-1">{conflict.suggested_resolution}</p>
                  </div>
                ))}
              </div>
            )}

            {scheduledFlights.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                <p className="text-lg mb-2">No flights scheduled</p>
                <p className="text-sm">Use the "Schedule" button on route legs to add flights</p>
              </div>
            ) : (
              <div className="glass-card overflow-hidden p-0">
                <table className="w-full">
                  <thead className="bg-neutral-100">
                    <tr>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3">CALLSIGN</th>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3">A/C</th>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3">ORIGIN</th>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3">DEST</th>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3">DEP (Z)</th>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3">ARR (Z)</th>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3">STATUS</th>
                      <th className="text-left text-neutral-500 text-xs font-medium p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledFlights.map(flight => (
                      <tr key={flight.id} className="border-t border-neutral-200 hover:bg-neutral-50 transition">
                        <td className="p-3 text-neutral-900 font-mono font-bold">{flight.callsign}</td>
                        <td className="p-3 text-neutral-600">{flight.aircraft_type}</td>
                        <td className="p-3 text-primary font-mono">{flight.origin.icao}</td>
                        <td className="p-3 text-green-600 font-mono">{flight.destination.icao}</td>
                        <td className="p-3 text-neutral-900 font-mono">{formatMilitaryTime(flight.scheduled_departure)}</td>
                        <td className="p-3 text-neutral-900 font-mono">{formatMilitaryTime(flight.scheduled_arrival)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            flight.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                            flight.status === 'in_flight' ? 'bg-green-100 text-green-700' :
                            flight.status === 'delayed' ? 'bg-amber-100 text-amber-700' :
                            'bg-neutral-100 text-neutral-600'
                          }`}>
                            {flight.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => removeScheduledFlight(flight.id)}
                            className="text-red-500 hover:text-red-700 text-sm transition"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'weather' && (
        <div className="p-6 overflow-y-auto h-[calc(100vh-120px)] bg-neutral-50/50 scrollbar-thin">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-neutral-900 font-bold text-xl mb-6">Weather Systems & Base Conditions</h2>
            
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="glass-card p-4">
                <h3 className="text-neutral-900 font-bold mb-4">Active Weather Systems</h3>
                <div className="space-y-3">
                  {weatherSystems.map(wx => (
                    <div 
                      key={wx.id}
                      className={`p-3 rounded-xl border ${
                        wx.severity === 'severe' ? 'border-red-300 bg-red-50' :
                        wx.severity === 'moderate' ? 'border-amber-300 bg-amber-50' :
                        'border-neutral-200 bg-neutral-50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-neutral-900 font-medium">{wx.name}</h4>
                          <p className="text-neutral-500 text-sm capitalize">{wx.type.replace('_', ' ')}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          wx.severity === 'severe' ? 'bg-red-100 text-red-700' :
                          wx.severity === 'moderate' ? 'bg-amber-100 text-amber-700' :
                          'bg-neutral-100 text-neutral-600'
                        }`}>
                          {wx.severity.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-neutral-600">
                        <span>Moving {wx.heading_deg}° at {wx.velocity_kt} kt</span>
                      </div>
                      {wx.forecast_positions.length > 0 && (
                        <div className="mt-2 flex space-x-2 overflow-x-auto scrollbar-thin">
                          {wx.forecast_positions.slice(0, 5).map((pos, i) => (
                            <div key={i} className="text-xs bg-neutral-100 border border-neutral-200 px-2 py-1 rounded-lg flex-shrink-0">
                              <div className="text-neutral-500">{formatMilitaryTime(pos.timestamp)}</div>
                              <div className="text-neutral-900">{pos.position.lat.toFixed(1)}°N</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-neutral-900 font-bold mb-4">Base Weather Conditions</h3>
                {weatherLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-neutral-500">Loading weather data...</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                    {MILITARY_BASES.slice(0, 8).map(base => {
                      const wx = baseWeatherData.get(base.base_id) || getBaseWeather(base);
                      const hasError = weatherErrors.get(base.base_id);
                      return (
                        <div key={base.base_id} className="flex items-center justify-between p-2 bg-neutral-50 border border-neutral-200 rounded-xl">
                          <div className="flex items-center">
                            <span className="text-neutral-900 font-mono text-sm font-medium">{base.icao}</span>
                            <span className="text-neutral-500 text-xs ml-2">{base.name.split(' ')[0]}</span>
                            {hasError && (
                              <span className="text-amber-500 text-xs ml-2" title="Using fallback data - NWS API unavailable for this location">
                                ⚠️ API unavailable
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-3 text-xs">
                            <span className={`font-mono ${formatWindData(wx.wind_direction_deg, wx.wind_speed_kt) === 'N/A' ? 'text-red-500' : 'text-neutral-600'}`}>
                              {formatWindData(wx.wind_direction_deg, wx.wind_speed_kt)}
                            </span>
                            {wx.temperature_c !== null ? (
                              <span className="text-neutral-500">{wx.temperature_c}°C</span>
                            ) : (
                              <span className="text-red-500">N/A</span>
                            )}
                            {wx.visibility_sm !== null ? (
                              <span className="text-neutral-500">{wx.visibility_sm}SM</span>
                            ) : (
                              <span className="text-red-500">N/A</span>
                            )}
                            {wx.conditions !== null ? (
                              <span 
                                className="font-bold px-2 py-0.5 rounded-lg"
                                style={{ 
                                  backgroundColor: getConditionsColor(wx.conditions) + '20',
                                  color: getConditionsColor(wx.conditions)
                                }}
                              >
                                {wx.conditions}
                              </span>
                            ) : (
                              <span className="text-red-500 font-bold px-2 py-0.5 rounded-lg bg-red-100">N/A</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card p-4">
              <h3 className="text-neutral-900 font-bold mb-4">72-Hour Weather Movement Forecast</h3>
              <div className="h-48 flex items-center justify-center border border-neutral-200 rounded-xl bg-neutral-50">
                <div className="text-center">
                  <div className="text-4xl mb-2">🌍</div>
                  <p className="text-neutral-500">Weather movement visualization</p>
                  <p className="text-neutral-400 text-sm">{weatherSystems.length} active systems being tracked</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cargo' && (
        <div className="p-6 overflow-y-auto h-[calc(100vh-120px)] bg-neutral-50/50 scrollbar-thin">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-neutral-900 font-bold text-xl">Cargo Split & Redistribution</h2>
              {allocationResult && (
                <button
                  onClick={() => setShowFlightSplitter(true)}
                  className="btn-primary"
                >
                  Open Flight Splitter
                </button>
              )}
            </div>

            {!allocationResult ? (
              <div className="text-center py-12 text-neutral-500">
                <p className="text-lg mb-2">No load plan available</p>
                <p className="text-sm">Complete a load plan first to split cargo between flights</p>
              </div>
            ) : savedSplitFlights.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📦</div>
                <p className="text-neutral-700 text-lg mb-2">No cargo splits configured</p>
                <p className="text-neutral-500 text-sm mb-4">
                  Use the Flight Splitter to drag and drop pallets between different aircraft
                </p>
                <button
                  onClick={() => setShowFlightSplitter(true)}
                  className="btn-primary"
                >
                  Start Splitting Cargo
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="stat-card">
                    <p className="stat-label">Total Flights</p>
                    <p className="stat-value text-2xl">{savedSplitFlights.length}</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Total Pallets</p>
                    <p className="stat-value text-2xl">
                      {savedSplitFlights.reduce((sum, f) => sum + f.pallets.length, 0)}
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Modified Flights</p>
                    <p className="stat-value text-2xl text-amber-600">
                      {savedSplitFlights.filter(f => f.is_modified).length}
                    </p>
                  </div>
                </div>

                <div className="glass-card overflow-hidden p-0">
                  <table className="w-full">
                    <thead className="bg-neutral-100">
                      <tr>
                        <th className="text-left text-neutral-500 text-xs font-medium p-3">CALLSIGN</th>
                        <th className="text-left text-neutral-500 text-xs font-medium p-3">AIRCRAFT</th>
                        <th className="text-left text-neutral-500 text-xs font-medium p-3">DESTINATION</th>
                        <th className="text-left text-neutral-500 text-xs font-medium p-3">PALLETS</th>
                        <th className="text-left text-neutral-500 text-xs font-medium p-3">WEIGHT</th>
                        <th className="text-left text-neutral-500 text-xs font-medium p-3">STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedSplitFlights.map(flight => (
                        <tr key={flight.id} className="border-t border-neutral-200 hover:bg-neutral-50 transition">
                          <td className="p-3 text-neutral-900 font-mono font-bold">{flight.callsign}</td>
                          <td className="p-3 text-neutral-600">{flight.aircraft_type}</td>
                          <td className="p-3 text-green-600 font-mono">{flight.destination.icao}</td>
                          <td className="p-3 text-neutral-900">{flight.pallets.length}</td>
                          <td className="p-3 text-neutral-900">{Math.round(flight.total_weight_lb / 1000)}K LBS</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              flight.is_modified 
                                ? 'bg-amber-100 text-amber-700' 
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {flight.is_modified ? 'MODIFIED' : 'ORIGINAL'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowFlightSplitter(true)}
                    className="btn-secondary"
                  >
                    Edit Split Configuration
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showFlightSplitter && allocationResult && (
        <FlightSplitter
          allocationResult={allocationResult}
          onClose={() => setShowFlightSplitter(false)}
          onSave={(splits) => {
            setSavedSplitFlights(splits);
            setShowFlightSplitter(false);
          }}
        />
      )}
    </div>
  );
}

interface LegEditorProps {
  leg: LegConfig;
  onUpdate: (updates: Partial<LegConfig>) => void;
  availableAircraft: { id: string; type: string; phase: string; weight: number }[];
  calculatedLeg?: RouteLeg;
}

function LegEditor({ leg, onUpdate, availableAircraft, calculatedLeg }: LegEditorProps) {
  const origin = MILITARY_BASES.find(b => b.base_id === leg.origin_id);
  const dest = MILITARY_BASES.find(b => b.base_id === leg.destination_id);
  
  const [originWx, setOriginWx] = useState<WeatherForecast | null>(null);
  const [destWx, setDestWx] = useState<WeatherForecast | null>(null);
  const [originWxLoading, setOriginWxLoading] = useState(false);
  const [destWxLoading, setDestWxLoading] = useState(false);
  const [originWxError, setOriginWxError] = useState(false);
  const [destWxError, setDestWxError] = useState(false);

  useEffect(() => {
    if (origin) {
      setOriginWxLoading(true);
      setOriginWxError(false);
      getRealBaseWeather(origin)
        .then(wx => {
          setOriginWx(wx);
          setOriginWxLoading(false);
        })
        .catch(() => {
          setOriginWx(getBaseWeather(origin));
          setOriginWxError(true);
          setOriginWxLoading(false);
        });
    }
  }, [origin?.base_id]);

  useEffect(() => {
    if (dest) {
      setDestWxLoading(true);
      setDestWxError(false);
      getRealBaseWeather(dest)
        .then(wx => {
          setDestWx(wx);
          setDestWxLoading(false);
        })
        .catch(() => {
          setDestWx(getBaseWeather(dest));
          setDestWxError(true);
          setDestWxLoading(false);
        });
    }
  }, [dest?.base_id]);

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(':').map(Number);
    const newTime = new Date(leg.departure_time);
    newTime.setHours(hours, minutes, 0, 0);
    onUpdate({ departure_time: newTime });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    newDate.setHours(leg.departure_time.getHours(), leg.departure_time.getMinutes());
    onUpdate({ departure_time: newDate });
  };

  return (
    <div className="glass-card p-6">
      <h2 className="text-neutral-900 font-bold text-xl mb-6">Edit Flight Leg</h2>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-neutral-500 text-sm mb-2">Origin Base</label>
          <select
            value={leg.origin_id}
            onChange={(e) => onUpdate({ origin_id: e.target.value })}
            className="glass-input w-full"
          >
            {MILITARY_BASES.map(base => (
              <option key={base.base_id} value={base.base_id}>
                {base.icao} - {base.name}
              </option>
            ))}
          </select>
          {originWxLoading ? (
            <div className="mt-2 text-xs text-neutral-400">Loading weather...</div>
          ) : originWx ? (
            <div className="mt-2 text-xs text-neutral-500">
              WX: <span className={formatWindData(originWx.wind_direction_deg, originWx.wind_speed_kt) === 'N/A' ? 'text-red-500' : ''}>{formatWindData(originWx.wind_direction_deg, originWx.wind_speed_kt)}</span> | 
              {originWx.conditions !== null ? (
                <span style={{ color: getConditionsColor(originWx.conditions) }}> {originWx.conditions}</span>
              ) : (
                <span className="text-red-500"> N/A</span>
              )}
              {originWxError && <span className="text-amber-500 ml-2">⚠️ API unavailable</span>}
            </div>
          ) : null}
        </div>

        <div>
          <label className="block text-neutral-500 text-sm mb-2">Destination Base</label>
          <select
            value={leg.destination_id}
            onChange={(e) => onUpdate({ destination_id: e.target.value })}
            className="glass-input w-full"
          >
            {MILITARY_BASES.map(base => (
              <option key={base.base_id} value={base.base_id}>
                {base.icao} - {base.name}
              </option>
            ))}
          </select>
          {destWxLoading ? (
            <div className="mt-2 text-xs text-neutral-400">Loading weather...</div>
          ) : destWx ? (
            <div className="mt-2 text-xs text-neutral-500">
              WX: <span className={formatWindData(destWx.wind_direction_deg, destWx.wind_speed_kt) === 'N/A' ? 'text-red-500' : ''}>{formatWindData(destWx.wind_direction_deg, destWx.wind_speed_kt)}</span> | 
              {destWx.conditions !== null ? (
                <span style={{ color: getConditionsColor(destWx.conditions) }}> {destWx.conditions}</span>
              ) : (
                <span className="text-red-500"> N/A</span>
              )}
              {destWxError && <span className="text-amber-500 ml-2">⚠️ API unavailable</span>}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div>
          <label className="block text-neutral-500 text-sm mb-2">Departure Date</label>
          <input
            type="date"
            value={leg.departure_time.toISOString().split('T')[0]}
            onChange={handleDateChange}
            className="glass-input w-full"
          />
        </div>
        <div>
          <label className="block text-neutral-500 text-sm mb-2">Departure Time (Local)</label>
          <input
            type="time"
            value={`${leg.departure_time.getHours().toString().padStart(2, '0')}:${leg.departure_time.getMinutes().toString().padStart(2, '0')}`}
            onChange={handleTimeChange}
            className="glass-input w-full font-mono"
          />
        </div>
        <div>
          <label className="block text-neutral-500 text-sm mb-2">ZULU Time</label>
          <div className="glass-input bg-neutral-50 text-green-600 font-mono font-bold">
            {formatMilitaryTime(leg.departure_time)}
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-neutral-500 text-sm mb-2">Assigned Aircraft</label>
        <select
          value={leg.aircraft_id}
          onChange={(e) => onUpdate({ aircraft_id: e.target.value })}
          className="glass-input w-full"
        >
          <option value="">-- Select Aircraft --</option>
          {availableAircraft.map(ac => (
            <option key={ac.id} value={ac.id}>
              {ac.id} ({ac.type} - {ac.phase}) - {ac.weight.toLocaleString()} LBS
            </option>
          ))}
        </select>
      </div>

      {calculatedLeg && (
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-neutral-200">
          <div className="text-center">
            <p className="text-neutral-500 text-xs">Distance</p>
            <p className="text-neutral-900 font-bold">{formatDistance(calculatedLeg.distance_nm)}</p>
            <p className="text-neutral-400 text-xs">{Math.round(calculatedLeg.distance_km)} km</p>
          </div>
          <div className="text-center">
            <p className="text-neutral-500 text-xs">Flight Time</p>
            <p className="text-neutral-900 font-bold">{formatFlightTime(calculatedLeg.time_enroute_hr)}</p>
          </div>
          <div className="text-center">
            <p className="text-neutral-500 text-xs">Block Time</p>
            <p className="text-neutral-900 font-bold">{formatFlightTime(calculatedLeg.block_time_hr)}</p>
          </div>
          <div className="text-center">
            <p className="text-neutral-500 text-xs">Fuel Required</p>
            <p className="text-neutral-900 font-bold">{Math.round(calculatedLeg.fuel_required_lb).toLocaleString()} LBS</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PACAF Airlift - Flight Manager Flowchart Designer
 * 
 * Three-pane layout with:
 * - Left Sidebar: Flight list with filters
 * - Center Canvas: React Flow flowchart designer  
 * - Right Inspector: Context-sensitive details panel
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  NodeProps,
  Handle,
  Position,
  Panel,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { motion, AnimatePresence } from 'framer-motion';
import { SplitFlight, calculateFlightWeight, validateFlightLoad } from '../lib/flightSplitTypes';
import { MilitaryBase } from '../lib/routeTypes';
import { MILITARY_BASES } from '../lib/bases';
import { formatMilitaryTime, calculateGreatCircleDistance, calculateTimeEnRoute, calculateFuelRequired } from '../lib/routeCalculations';
import { AllocationResult, AIInsight } from '../lib/pacafTypes';
import { analyzeAllocation } from '../lib/insightsEngine';
import {
  GraphState,
  FlightNodeData,
  AirbaseNodeData,
  RouteLegEdgeData,
  missionStateToGraph,
  graphToMissionState,
  validateGraphState,
  getFlightMetrics,
  canConnectFlightToBase,
  createRouteLegEdge,
  getFlightStops,
  setFlightStops,
} from '../lib/flowchartGraphTypes';

interface FlightManagerFlowchartProps {
  splitFlights: SplitFlight[];
  allocationResult: AllocationResult;
  onFlightsChange: (flights: SplitFlight[]) => void;
  onFlightSelect: (flightId: string) => void;
  selectedFlightId: string | null;
  onAddFlight?: () => void;
  onSplitFlight?: (flightId: string) => void;
}

const FlightStartNode = ({ data, selected }: NodeProps) => {
  const nodeData = data as FlightNodeData;
  const { callsign, displayName, aircraftType, summary, statusFlags, originBaseId, destinationBaseId } = nodeData;
  const maxPayload = aircraftType === 'C-17' ? 170900 : 42000;
  const utilization = Math.min((summary.totalWeight / maxPayload) * 100, 100);
  
  return (
    <div
      className={`
        p-4 rounded-2xl cursor-pointer transition-all duration-200 min-w-[200px]
        ${selected ? 'ring-4 ring-blue-500 shadow-xl scale-105' : 'hover:shadow-lg'}
        ${statusFlags.hasErrors 
          ? 'bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-400' 
          : statusFlags.hasWarnings 
            ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-400'
            : 'bg-gradient-to-br from-white to-neutral-50 border-2 border-neutral-200'}
      `}
    >
      <Handle 
        type="source" 
        position={Position.Right} 
        id="route-out"
        className="!bg-blue-500 !w-4 !h-4 !border-2 !border-white"
        style={{ right: -8 }}
      />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className={`text-2xl ${aircraftType === 'C-17' ? 'text-blue-600' : 'text-green-600'}`}>
            {aircraftType === 'C-17' ? '✈️' : '🛩️'}
          </span>
          <div>
            <div className="font-bold text-neutral-900 text-sm">
              {displayName || callsign}
            </div>
            <div className="text-xs text-neutral-500">{aircraftType}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          {statusFlags.hasErrors && <span className="text-red-500 text-lg">🚫</span>}
          {!statusFlags.hasErrors && statusFlags.hasWarnings && <span className="text-amber-500 text-lg">⚠️</span>}
          {statusFlags.hasHazmat && <span className="text-orange-500 text-xs">☣️</span>}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center">
          <div className="text-neutral-500">Pallets</div>
          <div className="font-bold text-neutral-900">{summary.palletCount}</div>
        </div>
        <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center">
          <div className="text-neutral-500">Weight</div>
          <div className="font-bold text-neutral-900">{Math.round(summary.totalWeight / 1000)}K</div>
        </div>
        {summary.paxCount > 0 && (
          <div className="bg-white/80 rounded-lg px-2 py-1.5 text-center col-span-2">
            <div className="text-neutral-500">PAX</div>
            <div className="font-bold text-neutral-900">{summary.paxCount}</div>
          </div>
        )}
      </div>
      
      <div className="mb-2">
        <div className="flex justify-between text-xs text-neutral-500 mb-1">
          <span>ACL</span>
          <span className={utilization > 95 ? 'text-red-600 font-bold' : ''}>{utilization.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-neutral-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all ${
              utilization > 95 ? 'bg-red-500' : utilization > 80 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${utilization}%` }}
          />
        </div>
      </div>
      
      {statusFlags.hasNoRoute && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 text-center">
          ⚠️ No route assigned
        </div>
      )}
    </div>
  );
};

const AirbaseNode = ({ data, selected }: NodeProps) => {
  const nodeData = data as AirbaseNodeData;
  const { name, icao, country, runwayLengthFt, isOriginFor, isDestinationFor, isOrphan, weatherSummary } = nodeData;
  
  const isOrigin = isOriginFor.length > 0;
  const isDestination = isDestinationFor.length > 0;
  
  return (
    <div
      className={`
        p-3 rounded-xl cursor-pointer transition-all duration-200 min-w-[160px]
        ${selected ? 'ring-4 ring-green-500 shadow-xl scale-105' : 'hover:shadow-lg'}
        ${isOrphan 
          ? 'bg-neutral-100 border-2 border-dashed border-neutral-300 opacity-60' 
          : 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300'}
      `}
    >
      <Handle 
        type="target" 
        position={Position.Left} 
        id="route-in"
        className="!bg-green-500 !w-4 !h-4 !border-2 !border-white"
        style={{ left: -8 }}
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="route-out"
        className="!bg-green-500 !w-4 !h-4 !border-2 !border-white"
        style={{ right: -8 }}
      />
      
      <div className="flex items-center space-x-2 mb-2">
        <span className="text-xl">🛫</span>
        <div>
          <div className="font-bold text-neutral-900 text-sm">{icao}</div>
          <div className="text-xs text-neutral-500 truncate max-w-[120px]">{name}</div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-1 text-xs">
        <div className="bg-white/80 rounded px-1.5 py-1">
          <span className="text-neutral-500">RWY</span>
          <span className="font-medium ml-1">{(runwayLengthFt / 1000).toFixed(1)}K</span>
        </div>
        <div className="bg-white/80 rounded px-1.5 py-1">
          <span className="text-neutral-500">{country}</span>
        </div>
      </div>
      
      {(isOrigin || isDestination) && (
        <div className="flex gap-1 mt-2">
          {isOrigin && (
            <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
              Origin ({isOriginFor.length})
            </span>
          )}
          {isDestination && (
            <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">
              Dest ({isDestinationFor.length})
            </span>
          )}
        </div>
      )}
      
      {weatherSummary && (
        <div className={`text-xs mt-2 px-1.5 py-0.5 rounded ${
          weatherSummary.conditions === 'VFR' ? 'bg-green-100 text-green-700' :
          weatherSummary.conditions === 'MVFR' ? 'bg-blue-100 text-blue-700' :
          weatherSummary.conditions === 'IFR' ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        }`}>
          {weatherSummary.conditions} • {weatherSummary.windSpeed}kt
        </div>
      )}
    </div>
  );
};

const RouteLegEdgeLabel = ({ data }: { data: RouteLegEdgeData }) => {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm border border-neutral-200 text-xs">
      <div className="font-medium text-neutral-900">{Math.round(data.distanceNm)} nm</div>
      <div className="text-neutral-500">{data.timeEnrouteHr.toFixed(1)}h • {Math.round(data.fuelRequiredLb / 1000)}K lb</div>
    </div>
  );
};

interface RouteEditorProps {
  flight: SplitFlight;
  onFlightUpdate: (flightId: string, updates: Partial<SplitFlight>) => void;
}

const RouteEditor = ({ flight, onFlightUpdate }: RouteEditorProps) => {
  const stops = getFlightStops(flight);
  
  const handleAddWaypoint = () => {
    const availableBases = MILITARY_BASES.filter(
      b => !stops.some(s => s.base_id === b.base_id)
    );
    if (availableBases.length === 0) return;
    
    const newStops = [...stops];
    newStops.splice(stops.length - 1, 0, availableBases[0]);
    const updated = setFlightStops(flight, newStops);
    onFlightUpdate(flight.id, { 
      origin: updated.origin, 
      destination: updated.destination, 
      waypoints: updated.waypoints 
    });
  };
  
  const handleRemoveStop = (index: number) => {
    if (stops.length <= 2) return;
    const newStops = stops.filter((_, i) => i !== index);
    const updated = setFlightStops(flight, newStops);
    onFlightUpdate(flight.id, { 
      origin: updated.origin, 
      destination: updated.destination, 
      waypoints: updated.waypoints 
    });
  };
  
  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= stops.length) return;
    
    const newStops = [...stops];
    [newStops[index], newStops[newIndex]] = [newStops[newIndex], newStops[index]];
    const updated = setFlightStops(flight, newStops);
    onFlightUpdate(flight.id, { 
      origin: updated.origin, 
      destination: updated.destination, 
      waypoints: updated.waypoints 
    });
  };
  
  const handleChangeStop = (index: number, baseId: string) => {
    const base = MILITARY_BASES.find(b => b.base_id === baseId);
    if (!base) return;
    
    const newStops = [...stops];
    newStops[index] = base;
    const updated = setFlightStops(flight, newStops);
    onFlightUpdate(flight.id, { 
      origin: updated.origin, 
      destination: updated.destination, 
      waypoints: updated.waypoints 
    });
  };
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs text-neutral-500">Route ({stops.length} stops)</label>
        <button
          onClick={handleAddWaypoint}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add Waypoint
        </button>
      </div>
      
      <div className="space-y-1">
        {stops.map((stop, index) => (
          <div key={`${stop.base_id}-${index}`} className="flex items-center gap-1">
            <div className="flex flex-col">
              {index > 0 && (
                <button
                  onClick={() => handleMoveStop(index, 'up')}
                  className="text-neutral-400 hover:text-neutral-600 text-xs px-1"
                >
                  ▲
                </button>
              )}
              {index < stops.length - 1 && (
                <button
                  onClick={() => handleMoveStop(index, 'down')}
                  className="text-neutral-400 hover:text-neutral-600 text-xs px-1"
                >
                  ▼
                </button>
              )}
            </div>
            
            <div className="flex-1 flex items-center gap-2">
              <span className={`text-xs font-medium w-6 text-center rounded-full py-0.5 ${
                index === 0 
                  ? 'bg-blue-100 text-blue-700' 
                  : index === stops.length - 1 
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
              }`}>
                {index === 0 ? 'A' : index === stops.length - 1 ? 'B' : index}
              </span>
              
              <select
                value={stop.base_id}
                onChange={(e) => handleChangeStop(index, e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border border-neutral-300 rounded-lg"
              >
                {MILITARY_BASES.map(b => (
                  <option key={b.base_id} value={b.base_id}>{b.icao} - {b.name}</option>
                ))}
              </select>
            </div>
            
            {stops.length > 2 && index > 0 && index < stops.length - 1 && (
              <button
                onClick={() => handleRemoveStop(index)}
                className="text-red-400 hover:text-red-600 text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      
      {stops.length > 2 && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1">
          Multi-leg route: {stops.map(s => s.icao).join(' → ')}
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  flight: FlightStartNode,
  airbase: AirbaseNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 200 });

  nodes.forEach((node) => {
    const width = node.type === 'flight' ? 220 : 180;
    const height = node.type === 'flight' ? 200 : 120;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.type === 'flight' ? 220 : 180;
    const height = node.type === 'flight' ? 200 : 120;
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

interface LeftSidebarProps {
  flights: SplitFlight[];
  selectedFlightId: string | null;
  onFlightSelect: (id: string) => void;
  onAddFlight?: () => void;
  filter: string;
  onFilterChange: (f: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const LeftSidebar = ({
  flights,
  selectedFlightId,
  onFlightSelect,
  onAddFlight,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
}: LeftSidebarProps) => {
  const filteredFlights = useMemo(() => {
    let result = flights;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => 
        f.callsign.toLowerCase().includes(q) ||
        f.display_name?.toLowerCase().includes(q) ||
        f.origin.icao.toLowerCase().includes(q) ||
        f.destination.icao.toLowerCase().includes(q)
      );
    }
    
    if (filter === 'c17') {
      result = result.filter(f => f.aircraft_type === 'C-17');
    } else if (filter === 'c130') {
      result = result.filter(f => f.aircraft_type === 'C-130');
    } else if (filter === 'overloaded') {
      result = result.filter(f => {
        const max = f.aircraft_type === 'C-17' ? 170900 : 42000;
        return calculateFlightWeight(f) > max;
      });
    } else if (filter === 'noroute') {
      result = result.filter(f => f.origin.base_id === f.destination.base_id);
    }
    
    return result;
  }, [flights, filter, searchQuery]);
  
  const stats = useMemo(() => ({
    total: flights.length,
    c17: flights.filter(f => f.aircraft_type === 'C-17').length,
    c130: flights.filter(f => f.aircraft_type === 'C-130').length,
    overloaded: flights.filter(f => {
      const max = f.aircraft_type === 'C-17' ? 170900 : 42000;
      return calculateFlightWeight(f) > max;
    }).length,
  }), [flights]);

  return (
    <div className="w-72 bg-white/80 backdrop-blur-md border-r border-neutral-200 flex flex-col h-full">
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-neutral-900">Flights</h2>
          {onAddFlight && (
            <button 
              onClick={onAddFlight}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition"
            >
              + Add Flight
            </button>
          )}
        </div>
        
        <input
          type="text"
          placeholder="Search callsign, base..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-3"
        />
        
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'all', label: `All (${stats.total})` },
            { key: 'c17', label: `C-17 (${stats.c17})` },
            { key: 'c130', label: `C-130 (${stats.c130})` },
            { key: 'overloaded', label: `⚠️ (${stats.overloaded})`, danger: true },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => onFilterChange(opt.key)}
              className={`px-2 py-1 text-xs rounded-lg transition ${
                filter === opt.key
                  ? opt.danger ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredFlights.map(flight => {
          const weight = calculateFlightWeight(flight);
          const max = flight.aircraft_type === 'C-17' ? 170900 : 42000;
          const isOverloaded = weight > max;
          const isSelected = flight.id === selectedFlightId;
          
          return (
            <div
              key={flight.id}
              onClick={() => onFlightSelect(flight.id)}
              className={`
                p-3 rounded-xl cursor-pointer transition-all
                ${isSelected 
                  ? 'bg-blue-50 border-2 border-blue-400 shadow-md' 
                  : 'bg-white border border-neutral-200 hover:border-neutral-300 hover:shadow-sm'}
                ${isOverloaded ? 'border-red-300' : ''}
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <span className={flight.aircraft_type === 'C-17' ? 'text-blue-600' : 'text-green-600'}>
                    {flight.aircraft_type === 'C-17' ? '✈️' : '🛩️'}
                  </span>
                  <span className="font-medium text-sm text-neutral-900 truncate max-w-[120px]">
                    {flight.display_name || flight.callsign}
                  </span>
                </div>
                {isOverloaded && <span className="text-red-500">🚫</span>}
              </div>
              
              <div className="text-xs text-neutral-500 mb-1">
                {flight.origin.icao} → {flight.destination.icao}
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">{flight.pallets.length}P • {Math.round(weight/1000)}K lb</span>
                <span className={`font-medium ${isOverloaded ? 'text-red-600' : 'text-green-600'}`}>
                  {Math.round((weight / max) * 100)}%
                </span>
              </div>
            </div>
          );
        })}
        
        {filteredFlights.length === 0 && (
          <div className="text-center text-neutral-400 py-8 text-sm">
            No flights match your filter
          </div>
        )}
      </div>
    </div>
  );
};

interface RightInspectorProps {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  flights: SplitFlight[];
  graphState: GraphState;
  allocationResult: AllocationResult;
  onFlightUpdate: (flightId: string, updates: Partial<SplitFlight>) => void;
  onBaseSelect: (baseId: string, flightId: string, asOrigin: boolean) => void;
}

const RightInspector = ({
  selectedNodeId,
  selectedEdgeId,
  flights,
  graphState,
  allocationResult,
  onFlightUpdate,
  onBaseSelect,
}: RightInspectorProps) => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  
  useEffect(() => {
    setInsights(analyzeAllocation(allocationResult));
  }, [allocationResult]);
  
  const selectedNode = graphState.nodes.find(n => n.id === selectedNodeId);
  const selectedEdge = graphState.edges.find(e => e.id === selectedEdgeId);
  
  if (!selectedNodeId && !selectedEdgeId) {
    const totalWeight = flights.reduce((sum, f) => sum + calculateFlightWeight(f), 0);
    const totalPallets = flights.reduce((sum, f) => sum + f.pallets.length, 0);
    const totalPax = flights.reduce((sum, f) => sum + f.pax_count, 0);
    
    return (
      <div className="w-80 bg-white/80 backdrop-blur-md border-l border-neutral-200 flex flex-col h-full">
        <div className="p-4 border-b border-neutral-200">
          <h2 className="font-bold text-neutral-900">Mission Summary</h2>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{flights.length}</div>
              <div className="text-xs text-blue-600">Total Flights</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{totalPallets}</div>
              <div className="text-xs text-green-600">Total Pallets</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{Math.round(totalWeight / 1000)}K</div>
              <div className="text-xs text-amber-600">Total Weight (lb)</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">{totalPax}</div>
              <div className="text-xs text-purple-600">Total PAX</div>
            </div>
          </div>
          
          {insights.length > 0 && (
            <div>
              <h3 className="font-medium text-neutral-900 mb-2 flex items-center space-x-1">
                <span>🤖</span>
                <span>AI Insights</span>
              </h3>
              <div className="space-y-2">
                {insights.slice(0, 5).map((insight, idx) => (
                  <div 
                    key={idx}
                    className={`p-2 rounded-lg text-xs ${
                      insight.severity === 'critical' 
                        ? 'bg-red-50 border border-red-200 text-red-800'
                        : insight.severity === 'warning'
                          ? 'bg-amber-50 border border-amber-200 text-amber-800'
                          : 'bg-blue-50 border border-blue-200 text-blue-800'
                    }`}
                  >
                    <div className="font-medium">{insight.title}</div>
                    <div className="mt-0.5 opacity-80">{insight.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (selectedNode?.data?.nodeType === 'flight') {
    const flightData = selectedNode.data as FlightNodeData;
    const flight = flights.find(f => f.id === flightData.flightId);
    if (!flight) return null;
    
    const metrics = getFlightMetrics(flight);
    const validation = validateFlightLoad(flight);
    
    return (
      <div className="w-80 bg-white/80 backdrop-blur-md border-l border-neutral-200 flex flex-col h-full">
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-neutral-900">{flight.display_name || flight.callsign}</h2>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              flight.aircraft_type === 'C-17' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
            }`}>
              {flight.aircraft_type}
            </span>
          </div>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Display Name</label>
            <input
              type="text"
              value={flight.display_name || flight.callsign}
              onChange={(e) => onFlightUpdate(flight.id, { display_name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <RouteEditor
            flight={flight}
            onFlightUpdate={onFlightUpdate}
          />
          
          <div className="bg-neutral-50 rounded-xl p-3">
            <h3 className="text-xs font-medium text-neutral-700 mb-2">Route Metrics</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-500">Distance</span>
                <div className="font-bold">{Math.round(metrics.distance)} nm</div>
              </div>
              <div>
                <span className="text-neutral-500">Time</span>
                <div className="font-bold">{metrics.timeEnroute.toFixed(1)} hr</div>
              </div>
              <div>
                <span className="text-neutral-500">Fuel</span>
                <div className="font-bold">{Math.round(metrics.fuelRequired / 1000)}K lb</div>
              </div>
              <div>
                <span className="text-neutral-500">Utilization</span>
                <div className={`font-bold ${metrics.utilizationPercent > 95 ? 'text-red-600' : 'text-green-600'}`}>
                  {metrics.utilizationPercent.toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-neutral-50 rounded-xl p-3">
            <h3 className="text-xs font-medium text-neutral-700 mb-2">Load Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-500">Pallets</span>
                <div className="font-bold">{flight.pallets.length}</div>
              </div>
              <div>
                <span className="text-neutral-500">Rolling Stock</span>
                <div className="font-bold">{flight.rolling_stock.length}</div>
              </div>
              <div>
                <span className="text-neutral-500">PAX</span>
                <div className="font-bold">{flight.pax_count}</div>
              </div>
              <div>
                <span className="text-neutral-500">Weight</span>
                <div className="font-bold">{Math.round(calculateFlightWeight(flight) / 1000)}K lb</div>
              </div>
            </div>
          </div>
          
          {!validation.valid && (
            <div className="bg-red-50 rounded-xl p-3">
              <h3 className="text-xs font-medium text-red-700 mb-2">⚠️ Validation Issues</h3>
              <ul className="text-xs text-red-600 space-y-1">
                {validation.issues.map((issue, idx) => (
                  <li key={idx}>• {issue}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div>
            <h3 className="text-xs font-medium text-neutral-700 mb-2">Cargo Manifest</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {flight.pallets.map((p, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white rounded-lg px-2 py-1 text-xs border border-neutral-200">
                  <span className="font-medium">{p.pallet.id}</span>
                  <span className="text-neutral-500">{p.pallet.gross_weight.toLocaleString()} lb</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (selectedNode?.data?.nodeType === 'airbase') {
    const baseData = selectedNode.data as AirbaseNodeData;
    const connectedFlights = flights.filter(f => 
      f.origin.base_id === baseData.baseId || f.destination.base_id === baseData.baseId
    );
    
    return (
      <div className="w-80 bg-white/80 backdrop-blur-md border-l border-neutral-200 flex flex-col h-full">
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🛫</span>
            <div>
              <h2 className="font-bold text-neutral-900">{baseData.icao}</h2>
              <p className="text-sm text-neutral-500">{baseData.name}</p>
            </div>
          </div>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-neutral-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-neutral-700">{(baseData.runwayLengthFt / 1000).toFixed(1)}K</div>
              <div className="text-xs text-neutral-500">Runway (ft)</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-neutral-700">{baseData.country}</div>
              <div className="text-xs text-neutral-500">Country</div>
            </div>
          </div>
          
          <div>
            <h3 className="text-xs font-medium text-neutral-700 mb-2">Connected Flights ({connectedFlights.length})</h3>
            <div className="space-y-2">
              {connectedFlights.map(f => (
                <div key={f.id} className="bg-white rounded-lg p-2 border border-neutral-200 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{f.display_name || f.callsign}</span>
                    <span className={f.origin.base_id === baseData.baseId ? 'text-blue-600' : 'text-green-600'}>
                      {f.origin.base_id === baseData.baseId ? '→ Departing' : '← Arriving'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-blue-50 rounded-xl p-3">
            <h3 className="text-xs font-medium text-blue-700 mb-1">📍 Coordinates</h3>
            <div className="text-xs text-blue-600">
              {baseData.latitude.toFixed(4)}°, {baseData.longitude.toFixed(4)}°
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (selectedEdge && (selectedEdge.data as any)?.edgeType === 'route') {
    const edgeData = selectedEdge.data as RouteLegEdgeData;
    const fromBase = MILITARY_BASES.find(b => b.base_id === edgeData.fromBaseId);
    const toBase = MILITARY_BASES.find(b => b.base_id === edgeData.toBaseId);
    
    return (
      <div className="w-80 bg-white/80 backdrop-blur-md border-l border-neutral-200 flex flex-col h-full">
        <div className="p-4 border-b border-neutral-200">
          <h2 className="font-bold text-neutral-900">Route Leg</h2>
          <p className="text-sm text-neutral-500">{fromBase?.icao} → {toBase?.icao}</p>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-blue-700">{Math.round(edgeData.distanceNm)}</div>
              <div className="text-xs text-blue-600">Distance (nm)</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-green-700">{edgeData.timeEnrouteHr.toFixed(1)}</div>
              <div className="text-xs text-green-600">Time (hr)</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-amber-700">{Math.round(edgeData.fuelRequiredLb / 1000)}K</div>
              <div className="text-xs text-amber-600">Fuel (lb)</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-purple-700">{edgeData.blockTimeHr.toFixed(1)}</div>
              <div className="text-xs text-purple-600">Block (hr)</div>
            </div>
          </div>
          
          <div className="bg-neutral-50 rounded-xl p-3">
            <h3 className="text-xs font-medium text-neutral-700 mb-2">Route Details</h3>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-500">Aircraft</span>
                <span className="font-medium">{edgeData.aircraftType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Leg Index</span>
                <span className="font-medium">{edgeData.legIndex + 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Distance (km)</span>
                <span className="font-medium">{Math.round(edgeData.distanceKm)} km</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};

const FlowchartCanvas = ({
  graphState,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
}: {
  graphState: GraphState;
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
}) => {
  return (
    <div className="flex-1 h-full">
      <ReactFlow
        nodes={graphState.nodes}
        edges={graphState.edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
          style: { stroke: '#3b82f6', strokeWidth: 2 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
        <Controls className="!bg-white/90 !backdrop-blur-sm !rounded-xl !border !border-neutral-200" />
        <MiniMap 
          className="!bg-white/90 !backdrop-blur-sm !rounded-xl !border !border-neutral-200"
          nodeColor={(node) => {
            if (node.type === 'flight') return '#3b82f6';
            if (node.type === 'airbase') return '#10b981';
            return '#9ca3af';
          }}
        />
        
        <Panel position="top-right" className="bg-white/90 backdrop-blur-sm rounded-xl p-3 border border-neutral-200">
          <div className="text-xs space-y-1">
            <div className="font-medium text-neutral-700 mb-2">Legend</div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span className="text-neutral-600">Flight</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span className="text-neutral-600">Airbase</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span className="text-neutral-600">Error</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <span className="text-neutral-600">Warning</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

interface BasePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBase: (base: MilitaryBase) => void;
  title: string;
  excludeBaseIds?: string[];
  aircraftType?: 'C-17' | 'C-130';
}

const BasePickerModal = ({ isOpen, onClose, onSelectBase, title, excludeBaseIds = [], aircraftType }: BasePickerModalProps) => {
  const [search, setSearch] = useState('');
  
  const filteredBases = useMemo(() => {
    let bases = MILITARY_BASES.filter(b => !excludeBaseIds.includes(b.base_id));
    
    if (search) {
      const q = search.toLowerCase();
      bases = bases.filter(b => 
        b.name.toLowerCase().includes(q) ||
        b.icao.toLowerCase().includes(q) ||
        b.base_id.toLowerCase().includes(q) ||
        b.country.toLowerCase().includes(q)
      );
    }
    
    return bases;
  }, [search, excludeBaseIds]);
  
  const minRunway = aircraftType === 'C-17' ? 7500 : aircraftType === 'C-130' ? 5000 : 0;
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[70vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-white">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-xl">✕</button>
          </div>
          <input
            type="text"
            placeholder="Search by ICAO, name, or country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full mt-3 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        
        <div className="p-2 overflow-y-auto max-h-[50vh]">
          {filteredBases.map(base => {
            const isShortRunway = base.runway_length_ft < minRunway;
            return (
              <button
                key={base.base_id}
                onClick={() => { onSelectBase(base); onClose(); }}
                className={`w-full text-left p-3 rounded-xl mb-1 transition hover:bg-neutral-100 ${
                  isShortRunway ? 'border border-amber-300 bg-amber-50' : 'border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-xl">🛫</span>
                    <div>
                      <div className="font-bold text-neutral-900">{base.icao}</div>
                      <div className="text-sm text-neutral-500 truncate max-w-[280px]">{base.name}</div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-neutral-500">{base.country}</div>
                    <div className={isShortRunway ? 'text-amber-600 font-medium' : 'text-neutral-400'}>
                      RWY {(base.runway_length_ft / 1000).toFixed(1)}K ft
                    </div>
                  </div>
                </div>
                {isShortRunway && (
                  <div className="text-xs text-amber-600 mt-1">
                    ⚠️ Runway may be short for {aircraftType}
                  </div>
                )}
              </button>
            );
          })}
          
          {filteredBases.length === 0 && (
            <div className="text-center text-neutral-400 py-8">No bases match your search</div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ValidationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  errors: Array<{ nodeId: string; message: string }>;
  warnings: Array<{ nodeId: string; message: string }>;
  onExportAnyway?: () => void;
}

const ValidationDialog = ({ isOpen, onClose, errors, warnings, onExportAnyway }: ValidationDialogProps) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[70vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-red-50 to-white">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-red-900">⚠️ Export Validation</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-xl">✕</button>
          </div>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {errors.length > 0 && (
            <div className="mb-4">
              <h3 className="font-bold text-red-700 mb-2">🚫 Blocking Errors ({errors.length})</h3>
              <div className="space-y-1">
                {errors.map((err, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-800">
                    {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {warnings.length > 0 && (
            <div>
              <h3 className="font-bold text-amber-700 mb-2">⚠️ Warnings ({warnings.length})</h3>
              <div className="space-y-1">
                {warnings.map((warn, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                    {warn.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-neutral-200 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-neutral-600 hover:text-neutral-900">
            Cancel
          </button>
          {errors.length === 0 && onExportAnyway && (
            <button 
              onClick={() => { onExportAnyway(); onClose(); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Export Anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function FlightManagerFlowchartInner({
  splitFlights,
  allocationResult,
  onFlightsChange,
  onFlightSelect,
  selectedFlightId,
  onAddFlight,
  onSplitFlight,
}: FlightManagerFlowchartProps) {
  const [graphState, setGraphState] = useState<GraphState>(() => 
    missionStateToGraph(splitFlights)
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [basePickerState, setBasePickerState] = useState<{
    isOpen: boolean;
    flightId: string | null;
    asOrigin: boolean;
  }>({ isOpen: false, flightId: null, asOrigin: true });
  const [validationDialog, setValidationDialog] = useState<{
    isOpen: boolean;
    errors: Array<{ nodeId: string; message: string }>;
    warnings: Array<{ nodeId: string; message: string }>;
  }>({ isOpen: false, errors: [], warnings: [] });
  
  const layoutRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  useEffect(() => {
    graphState.nodes.forEach(node => {
      layoutRef.current.set(node.id, node.position);
    });
  }, [graphState.nodes]);
  
  useEffect(() => {
    const newGraphState = missionStateToGraph(splitFlights, layoutRef.current);
    setGraphState(prev => ({
      ...newGraphState,
      selectedNodeId: prev.selectedNodeId,
      selectedEdgeId: prev.selectedEdgeId,
      isDirty: prev.isDirty,
    }));
  }, [splitFlights]);
  
  const handleNodesChange = useCallback((changes: any) => {
    setGraphState(prev => {
      const updatedNodes = [...prev.nodes];
      changes.forEach((change: any) => {
        if (change.type === 'position' && change.position) {
          const idx = updatedNodes.findIndex(n => n.id === change.id);
          if (idx !== -1) {
            updatedNodes[idx] = { ...updatedNodes[idx], position: change.position };
          }
        }
      });
      return { ...prev, nodes: updatedNodes, isDirty: true };
    });
    setIsDirty(true);
  }, []);
  
  const handleEdgesChange = useCallback((changes: any) => {
    setGraphState(prev => ({ ...prev, isDirty: true }));
    setIsDirty(true);
  }, []);
  
  const handleConnect = useCallback((connection: Connection) => {
    const sourceNode = graphState.nodes.find(n => n.id === connection.source);
    const targetNode = graphState.nodes.find(n => n.id === connection.target);
    
    if (!sourceNode || !targetNode) return;
    
    if (sourceNode.data.nodeType === 'flight' && targetNode.data.nodeType === 'airbase') {
      const flightData = sourceNode.data as FlightNodeData;
      const baseData = targetNode.data as AirbaseNodeData;
      const flight = splitFlights.find(f => f.id === flightData.flightId);
      const base = MILITARY_BASES.find(b => b.base_id === baseData.baseId);
      
      if (flight && base) {
        const hasOrigin = flight.origin && flight.origin.base_id !== flight.destination?.base_id;
        const updatedFlight = {
          ...flight,
          [hasOrigin ? 'destination' : 'origin']: base,
          is_modified: true,
        };
        
        const updatedFlights = splitFlights.map(f => 
          f.id === flight.id ? updatedFlight : f
        );
        onFlightsChange(updatedFlights);
        setIsDirty(true);
      }
    }
  }, [graphState.nodes, splitFlights, onFlightsChange]);
  
  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    
    if (node.data.nodeType === 'flight') {
      onFlightSelect((node.data as FlightNodeData).flightId);
    }
  }, [onFlightSelect]);
  
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);
  
  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);
  
  const handleFlightUpdate = useCallback((flightId: string, updates: Partial<SplitFlight>) => {
    const updatedFlights = splitFlights.map(f => 
      f.id === flightId ? { ...f, ...updates, is_modified: true } : f
    );
    onFlightsChange(updatedFlights);
    setIsDirty(true);
  }, [splitFlights, onFlightsChange]);
  
  const handleBaseSelect = useCallback((baseId: string, flightId: string, asOrigin: boolean) => {
    const base = MILITARY_BASES.find(b => b.base_id === baseId);
    if (!base) return;
    
    handleFlightUpdate(flightId, asOrigin ? { origin: base } : { destination: base });
  }, [handleFlightUpdate]);
  
  const handleSidebarFlightSelect = useCallback((flightId: string) => {
    const nodeId = `flight-${flightId}`;
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    onFlightSelect(flightId);
  }, [onFlightSelect]);
  
  const openBasePicker = useCallback((flightId: string, asOrigin: boolean) => {
    setBasePickerState({ isOpen: true, flightId, asOrigin });
  }, []);
  
  const handleBasePickerSelect = useCallback((base: MilitaryBase) => {
    if (!basePickerState.flightId) return;
    handleFlightUpdate(basePickerState.flightId, 
      basePickerState.asOrigin ? { origin: base } : { destination: base }
    );
  }, [basePickerState, handleFlightUpdate]);
  
  const handleValidateForExport = useCallback(() => {
    const validation = validateGraphState(graphState);
    if (validation.errors.length > 0 || validation.warnings.length > 0) {
      setValidationDialog({
        isOpen: true,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }
  }, [graphState]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setBasePickerState(prev => ({ ...prev, isOpen: false }));
        setValidationDialog(prev => ({ ...prev, isOpen: false }));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const selectedFlight = selectedFlightId 
    ? splitFlights.find(f => f.id === selectedFlightId)
    : null;

  return (
    <div className="flex h-full w-full bg-neutral-100">
      <LeftSidebar
        flights={splitFlights}
        selectedFlightId={selectedFlightId}
        onFlightSelect={handleSidebarFlightSelect}
        onAddFlight={onAddFlight}
        filter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      
      <FlowchartCanvas
        graphState={{ ...graphState, selectedNodeId, selectedEdgeId }}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
      />
      
      <RightInspector
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        flights={splitFlights}
        graphState={graphState}
        allocationResult={allocationResult}
        onFlightUpdate={handleFlightUpdate}
        onBaseSelect={handleBaseSelect}
      />
      
      <BasePickerModal
        isOpen={basePickerState.isOpen}
        onClose={() => setBasePickerState(prev => ({ ...prev, isOpen: false }))}
        onSelectBase={handleBasePickerSelect}
        title={basePickerState.asOrigin ? 'Select Origin Base' : 'Select Destination Base'}
        excludeBaseIds={selectedFlight ? [
          basePickerState.asOrigin ? selectedFlight.destination?.base_id : selectedFlight.origin?.base_id
        ].filter(Boolean) as string[] : []}
        aircraftType={selectedFlight?.aircraft_type}
      />
      
      <ValidationDialog
        isOpen={validationDialog.isOpen}
        onClose={() => setValidationDialog(prev => ({ ...prev, isOpen: false }))}
        errors={validationDialog.errors}
        warnings={validationDialog.warnings}
      />
      
      {isDirty && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-amber-100 text-amber-800 px-4 py-2 rounded-xl shadow-lg text-sm font-medium flex items-center space-x-2">
          <span>⚠️ Unsaved changes</span>
          <button 
            onClick={() => setIsDirty(false)}
            className="ml-2 px-2 py-0.5 bg-amber-200 rounded text-xs hover:bg-amber-300"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default function FlightManagerFlowchart(props: FlightManagerFlowchartProps) {
  return (
    <ReactFlowProvider>
      <FlightManagerFlowchartInner {...props} />
    </ReactFlowProvider>
  );
}

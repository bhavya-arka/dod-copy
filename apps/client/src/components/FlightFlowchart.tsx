/**
 * PACAF Airlift - Flight Flowchart View
 * Interactive node-based visualization of flight splits and cargo distribution.
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { SplitFlight, calculateFlightWeight, validateFlightLoad } from '../lib/flightSplitTypes';
import { formatMilitaryTime } from '../lib/routeCalculations';
import { analyzeAllocation } from '../lib/insightsEngine';
import { AllocationResult, AIInsight } from '../lib/pacafTypes';

interface FlightFlowchartProps {
  splitFlights: SplitFlight[];
  allocationResult: AllocationResult;
  onFlightSelect: (flightId: string) => void;
  onSplitFlight: (flightId: string) => void;
  onMergeFlight?: (sourceId: string, targetId: string) => void;
  selectedFlightId: string | null;
}

interface FlightNodeData {
  [key: string]: unknown;
  flight: SplitFlight;
  isSelected: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  onSelect: () => void;
  onSplit: () => void;
  onDoubleClick: () => void;
}

const FlightNode = ({ data }: NodeProps) => {
  const nodeData = data as FlightNodeData;
  const { flight, isSelected, hasErrors, hasWarnings, onSelect, onSplit, onDoubleClick } = nodeData;
  const validation = validateFlightLoad(flight);
  const weight = calculateFlightWeight(flight);
  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
  const utilization = Math.min((weight / maxPayload) * 100, 100);

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className={`
        p-4 rounded-2xl cursor-pointer transition-all duration-200
        ${isSelected 
          ? 'ring-4 ring-primary shadow-lg scale-105' 
          : 'hover:shadow-md hover:scale-102'}
        ${hasErrors 
          ? 'bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300' 
          : hasWarnings 
            ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300'
            : 'bg-gradient-to-br from-white to-neutral-50 border border-neutral-200'}
      `}
      style={{ minWidth: 180 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3" />
      
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className={`text-xl ${flight.aircraft_type === 'C-17' ? 'text-blue-600' : 'text-green-600'}`}>
            {flight.aircraft_type === 'C-17' ? '✈️' : '🛩️'}
          </span>
          <span className="font-bold text-neutral-900">
            {flight.display_name || flight.callsign}
          </span>
        </div>
        {hasErrors && <span className="text-red-500">🚫</span>}
        {!hasErrors && hasWarnings && <span className="text-amber-500">⚠️</span>}
      </div>
      
      <div className="text-xs text-neutral-600 mb-2">
        {flight.origin.icao} → {flight.destination.icao}
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
        <div className="bg-white/80 rounded-lg px-2 py-1">
          <span className="text-neutral-500">Pallets</span>
          <span className="font-bold text-neutral-900 ml-1">{flight.pallets.length}</span>
        </div>
        <div className="bg-white/80 rounded-lg px-2 py-1">
          <span className="text-neutral-500">Weight</span>
          <span className="font-bold text-neutral-900 ml-1">{Math.round(weight / 1000)}K</span>
        </div>
      </div>
      
      <div className="mb-2">
        <div className="flex justify-between text-xs text-neutral-500 mb-1">
          <span>Capacity</span>
          <span>{utilization.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-neutral-200 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all ${
              utilization > 95 ? 'bg-red-500' : utilization > 80 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${utilization}%` }}
          />
        </div>
      </div>
      
      <div className="text-xs text-green-600 font-mono mb-2">
        {formatMilitaryTime(flight.scheduled_departure)}
      </div>
      
      <div className="flex justify-center space-x-2 pt-2 border-t border-neutral-200">
        <button 
          onClick={(e) => { e.stopPropagation(); onSplit(); }}
          className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition"
          title="Split this flight"
        >
          ✂️ Split
        </button>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
    </div>
  );
};

const nodeTypes = {
  flight: FlightNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

  const nodeWidth = 200;
  const nodeHeight = 180;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

interface FlightDetailModalProps {
  flight: SplitFlight;
  insights: AIInsight[];
  onClose: () => void;
}

const FlightDetailModal = ({ flight, insights, onClose }: FlightDetailModalProps) => {
  const validation = validateFlightLoad(flight);
  const weight = calculateFlightWeight(flight);
  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-neutral-200 bg-gradient-to-r from-neutral-50 to-white">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-neutral-900">
                {flight.display_name || flight.callsign}
              </h2>
              <p className="text-neutral-500">{flight.aircraft_type} • {flight.origin.icao} → {flight.destination.icao}</p>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-2xl">✕</button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-neutral-50 rounded-xl p-4">
              <div className="text-sm text-neutral-500">Total Weight</div>
              <div className="text-2xl font-bold text-neutral-900">{Math.round(weight / 1000)}K LBS</div>
              <div className="text-xs text-neutral-500">of {Math.round(maxPayload / 1000)}K max</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-4">
              <div className="text-sm text-neutral-500">Cargo</div>
              <div className="text-2xl font-bold text-neutral-900">{flight.pallets.length + flight.rolling_stock.length}</div>
              <div className="text-xs text-neutral-500">
                {flight.pallets.length} pallets, {flight.rolling_stock.length} vehicles
              </div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-4">
              <div className="text-sm text-neutral-500">Center of Balance</div>
              <div className={`text-2xl font-bold ${validation.valid ? 'text-green-600' : 'text-red-600'}`}>
                {flight.center_of_balance_percent.toFixed(1)}%
              </div>
              <div className="text-xs text-neutral-500">
                {flight.aircraft_type === 'C-17' ? '20-35%' : '18-33%'} allowed
              </div>
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="font-bold text-neutral-900 mb-3">Cargo Manifest</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {flight.pallets.map((p, idx) => (
                <div key={`pallet-${idx}`} className="flex justify-between items-center bg-neutral-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">Pallet</span>
                    <span className="text-sm font-medium">{p.pallet.id}</span>
                  </div>
                  <span className="text-sm text-neutral-500">{p.pallet.gross_weight.toLocaleString()} lbs</span>
                </div>
              ))}
              {flight.rolling_stock.map((v, idx) => (
                <div key={`vehicle-${idx}`} className="flex justify-between items-center bg-neutral-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Vehicle</span>
                    <span className="text-sm font-medium">{v.item?.description || `${v.item_id}`}</span>
                  </div>
                  <span className="text-sm text-neutral-500">{v.weight.toLocaleString()} lbs</span>
                </div>
              ))}
              {flight.pallets.length === 0 && flight.rolling_stock.length === 0 && (
                <div className="text-center py-4 text-neutral-400 text-sm">No cargo loaded</div>
              )}
            </div>
          </div>
          
          {insights.length > 0 && (
            <div>
              <h3 className="font-bold text-neutral-900 mb-3 flex items-center space-x-2">
                <span>🤖</span>
                <span>AI Insights</span>
              </h3>
              <div className="space-y-2">
                {insights.slice(0, 5).map((insight, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-xl text-sm ${
                      insight.severity === 'critical' 
                        ? 'bg-red-50 border border-red-200 text-red-800'
                        : insight.severity === 'warning'
                          ? 'bg-amber-50 border border-amber-200 text-amber-800'
                          : 'bg-blue-50 border border-blue-200 text-blue-800'
                    }`}
                  >
                    <div className="font-medium">{insight.title}</div>
                    <div className="text-xs mt-1 opacity-80">{insight.description}</div>
                    {insight.recommendation && (
                      <div className="text-xs mt-1 italic">{insight.recommendation}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function FlightFlowchart({
  splitFlights,
  allocationResult,
  onFlightSelect,
  onSplitFlight,
  selectedFlightId,
}: FlightFlowchartProps) {
  const [detailModalFlight, setDetailModalFlight] = useState<SplitFlight | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);

  const getFlightWarnings = useCallback((flight: SplitFlight) => {
    const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
    const weight = calculateFlightWeight(flight);
    const cob = flight.center_of_balance_percent;
    const cobMin = flight.aircraft_type === 'C-17' ? 20 : 18;
    const cobMax = flight.aircraft_type === 'C-17' ? 35 : 33;
    
    const hasErrors = weight > maxPayload || cob < cobMin || cob > cobMax;
    const hasWarnings = weight > maxPayload * 0.95 || cob < cobMin + 2 || cob > cobMax - 2;
    
    return { hasErrors, hasWarnings };
  }, []);

  const initialNodes: Node[] = useMemo(() => {
    return splitFlights.map((flight, index) => {
      const { hasErrors, hasWarnings } = getFlightWarnings(flight);
      return {
        id: flight.id,
        type: 'flight',
        position: { x: index * 250, y: 0 },
        data: {
          flight,
          isSelected: flight.id === selectedFlightId,
          hasErrors,
          hasWarnings,
          onSelect: () => onFlightSelect(flight.id),
          onSplit: () => onSplitFlight(flight.id),
          onDoubleClick: () => setDetailModalFlight(flight),
        },
      };
    });
  }, [splitFlights, selectedFlightId, onFlightSelect, onSplitFlight, getFlightWarnings]);

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    const parentGroups = new Map<string, SplitFlight[]>();
    
    splitFlights.forEach(flight => {
      const parent = flight.parent_flight_id;
      if (!parentGroups.has(parent)) {
        parentGroups.set(parent, []);
      }
      parentGroups.get(parent)!.push(flight);
    });
    
    parentGroups.forEach((flights) => {
      if (flights.length > 1) {
        for (let i = 0; i < flights.length - 1; i++) {
          edges.push({
            id: `${flights[i].id}-${flights[i + 1].id}`,
            source: flights[i].id,
            target: flights[i + 1].id,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#3b82f6',
            },
            label: 'split',
            labelStyle: { fontSize: 10, fill: '#64748b' },
          });
        }
      }
    });
    
    return edges;
  }, [splitFlights]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => 
    getLayoutedElements(initialNodes, initialEdges, 'LR'),
    [initialNodes, initialEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    const { nodes: newLayoutedNodes, edges: newLayoutedEdges } = getLayoutedElements(initialNodes, initialEdges, 'LR');
    setNodes(newLayoutedNodes);
    setEdges(newLayoutedEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  useEffect(() => {
    if (detailModalFlight) {
      const flightInsights = analyzeAllocation(allocationResult);
      setInsights(flightInsights);
    }
  }, [detailModalFlight, allocationResult]);

  const totalWeight = splitFlights.reduce((sum, f) => sum + calculateFlightWeight(f), 0);
  const totalPallets = splitFlights.reduce((sum, f) => sum + f.pallets.length, 0);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        className="bg-gradient-to-br from-neutral-50 to-neutral-100"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d4d4d4" />
        <Controls className="bg-white/80 backdrop-blur-sm rounded-xl border border-neutral-200" />
        
        <Panel position="top-left" className="glass-card p-4">
          <h3 className="font-bold text-neutral-900 mb-2">Flight Overview</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-neutral-500">Flights</span>
              <div className="font-bold text-neutral-900">{splitFlights.length}</div>
            </div>
            <div>
              <span className="text-neutral-500">Pallets</span>
              <div className="font-bold text-neutral-900">{totalPallets}</div>
            </div>
            <div>
              <span className="text-neutral-500">Total Weight</span>
              <div className="font-bold text-neutral-900">{Math.round(totalWeight / 1000)}K LBS</div>
            </div>
          </div>
        </Panel>
        
        <Panel position="top-right" className="glass-card p-3">
          <div className="text-xs text-neutral-500">
            <div className="flex items-center space-x-2 mb-1">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span>Normal</span>
            </div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
              <span>Warning</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              <span>Error</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
      
      {detailModalFlight && (
        <FlightDetailModal 
          flight={detailModalFlight} 
          insights={insights}
          onClose={() => setDetailModalFlight(null)} 
        />
      )}
    </div>
  );
}

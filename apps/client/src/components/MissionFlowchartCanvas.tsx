/**
 * PACAF Airlift - Mission Flowchart Canvas
 * Full-page Miro/Lucidflow-style interactive flowchart builder
 * 
 * Features:
 * - Full-viewport canvas with pan/zoom
 * - Auto-spawned nodes from demo data (origin → flights → destination)
 * - Color coding: yellow (hazmat), orange (ADVON)
 * - Edge annotations with distance/fuel/time
 * - Double-click modals for flight/airbase details
 * - Floating HUD controls
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ConnectionLineType,
  NodeProps,
  EdgeProps,
  Handle,
  Position,
  MarkerType,
  ReactFlowProvider,
  getBezierPath,
  EdgeLabelRenderer,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { motion, AnimatePresence } from 'framer-motion';
import { SplitFlight, calculateFlightWeight, validateFlightLoad, reoptimizePalletPlacement, calculateCenterOfBalance } from '../lib/flightSplitTypes';
import { MilitaryBase } from '../lib/routeTypes';
import { MILITARY_BASES } from '../lib/bases';
import { AllocationResult, AIInsight, PalletPlacement, AIRCRAFT_SPECS } from '../lib/pacafTypes';
import { analyzeAllocation } from '../lib/insightsEngine';
import { calculateGreatCircleDistance, calculateTimeEnRoute, calculateFuelRequired } from '../lib/routeCalculations';
import { getBaseWeather } from '../lib/weatherService';
import { exportSessionSummaryToPDF, SessionExportData, exportSplitFlightToPDF } from '../lib/pdfExport';
import { downloadSplitFlightsICODES, downloadICODESLoadPlan } from '../lib/icodesExport';
import { 
  FiPlus, FiTrash2, FiRefreshCw, FiDownload, FiFileText, FiBox, 
  FiAlertTriangle, FiZap, FiMapPin, FiSend, FiSave, FiArrowLeft,
  FiX, FiNavigation, FiCloud, FiWind, FiEye, FiPackage, FiTruck,
  FiUsers, FiCheckCircle, FiAlertCircle, FiInfo, FiCpu, FiScissors, FiCheck, FiRepeat
} from 'react-icons/fi';
import { TbEraser } from 'react-icons/tb';
import { 
  MdFlight, MdFlightTakeoff, MdFlightLand, MdLocalAirport, MdLocationOn
} from 'react-icons/md';
import { BiTargetLock } from 'react-icons/bi';

interface MissionFlowchartCanvasProps {
  splitFlights: SplitFlight[];
  allocationResult: AllocationResult;
  onFlightsChange: (flights: SplitFlight[]) => void;
  onBack?: () => void;
  onSave?: () => void;
  onView3D?: (flightId: string) => void;
}

interface FlightNodeData {
  nodeType: 'flight';
  flightId: string;
  callsign: string;
  displayName?: string;
  aircraftType: 'C-17' | 'C-130';
  isHazmat: boolean;
  isAdvon: boolean;
  heaviestItems: Array<{ name: string; weight: number }>;
  summary: {
    palletCount: number;
    rollingStockCount: number;
    paxCount: number;
    totalWeight: number;
  };
  originIcao?: string;
  destinationIcao?: string;
  onExportPDF?: (flightId: string) => void;
  onExportICODES?: (flightId: string) => void;
  onView3D?: (flightId: string) => void;
  [key: string]: unknown;
}

interface AirbaseNodeData {
  nodeType: 'airbase';
  baseId: string;
  name: string;
  icao: string;
  country: string;
  runwayLengthFt: number;
  isOrigin: boolean;
  isDestination: boolean;
  incomingFlights: string[];
  outgoingFlights: string[];
  availableCargo: {
    palletCount: number;
    totalWeight: number;
  };
  [key: string]: unknown;
}

interface RouteEdgeData {
  distance: number;
  timeHours: number;
  fuelLb: number;
  flightId: string;
  isHazmat: boolean;
  isAdvon: boolean;
  [key: string]: unknown;
}


const FlightNode = ({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as FlightNodeData;
  const { callsign, displayName, aircraftType, isHazmat, isAdvon, heaviestItems, summary, flightId, onExportPDF, onExportICODES, onView3D } = nodeData;
  
  const bgColor = isHazmat 
    ? 'from-yellow-100 to-amber-100 border-yellow-400' 
    : isAdvon 
      ? 'from-orange-100 to-amber-100 border-orange-400'
      : aircraftType === 'C-17' 
        ? 'from-blue-50 to-indigo-50 border-blue-300'
        : 'from-emerald-50 to-green-50 border-emerald-300';

  const maxPayload = aircraftType === 'C-17' ? 170900 : 42000;
  const utilization = Math.min((summary.totalWeight / maxPayload) * 100, 100);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        relative p-4 rounded-2xl cursor-pointer transition-all duration-300 min-w-[240px] max-w-[280px]
        bg-gradient-to-br ${bgColor} border-2 shadow-lg
        ${selected ? 'ring-4 ring-blue-500 shadow-2xl scale-105' : 'hover:shadow-xl hover:scale-[1.02]'}
      `}
    >
      <Handle type="target" position={Position.Left} id="in" className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="out" className="!bg-green-500 !w-3 !h-3 !border-2 !border-white" />
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MdFlight className={`text-2xl ${aircraftType === 'C-17' ? 'text-blue-600' : 'text-green-600'}`} />
          <div>
            <div className="font-bold text-neutral-900 text-sm truncate max-w-[140px]">
              {displayName || callsign}
            </div>
            <div className="text-xs text-neutral-500">{aircraftType}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {isHazmat && (
            <span className="text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
              <FiAlertTriangle size={10} /> HAZMAT
            </span>
          )}
          {isAdvon && (
            <span className="text-xs bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
              <FiZap size={10} /> ADVON
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
          <div className="text-neutral-500">Pallets</div>
          <div className="font-bold text-neutral-900">{summary.palletCount}</div>
        </div>
        <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
          <div className="text-neutral-500">Weight</div>
          <div className="font-bold text-neutral-900">{Math.round(summary.totalWeight / 1000)}K lb</div>
        </div>
        <div className="bg-white/60 rounded-lg px-2 py-1.5 text-center">
          <div className="text-neutral-500">PAX</div>
          <div className="font-bold text-neutral-900">{summary.paxCount}</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-neutral-500 mb-1">
          <span>Load</span>
          <span className={utilization > 95 ? 'text-red-600 font-bold' : ''}>{utilization.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-white/40 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all ${
              utilization > 95 ? 'bg-red-500' : utilization > 80 ? 'bg-amber-500' : 'bg-green-500'
            }`}
            style={{ width: `${utilization}%` }}
          />
        </div>
      </div>

      {heaviestItems.length > 0 && (
        <div className="border-t border-neutral-200/50 pt-2">
          <div className="text-xs text-neutral-500 mb-1">Top 5 Heaviest:</div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {heaviestItems.slice(0, 5).map((item, idx) => (
              <div key={idx} className="text-xs flex justify-between bg-white/40 rounded px-1.5 py-0.5">
                <span className="truncate max-w-[100px]">{item.name}</span>
                <span className="text-neutral-600 font-medium ml-1">{Math.round(item.weight / 1000)}K lb</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons row */}
      <div className="flex justify-center gap-1 mt-3 pt-2 border-t border-neutral-200/50">
        <button
          onClick={(e) => { e.stopPropagation(); nodeData.onExportPDF?.(flightId); }}
          className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-neutral-600 hover:text-purple-600 transition-all"
          title="Export PDF"
        >
          <FiFileText size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); nodeData.onExportICODES?.(flightId); }}
          className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-neutral-600 hover:text-green-600 transition-all"
          title="Export ICODES"
        >
          <FiDownload size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); nodeData.onView3D?.(flightId); }}
          className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-neutral-600 hover:text-blue-600 transition-all"
          title="View 3D"
        >
          <FiBox size={14} />
        </button>
      </div>

      <div className="text-center text-xs text-neutral-400 mt-2 italic">
        Double-click to expand
      </div>
    </motion.div>
  );
};

const AirbaseNode = ({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as AirbaseNodeData;
  const { name, icao, country, runwayLengthFt, isOrigin, isDestination, incomingFlights, outgoingFlights, availableCargo } = nodeData;

  const bgColor = isOrigin && isDestination
    ? 'from-purple-50 to-violet-50 border-purple-300'
    : isOrigin
      ? 'from-blue-50 to-cyan-50 border-blue-300'
      : isDestination
        ? 'from-green-50 to-emerald-50 border-green-300'
        : 'from-neutral-50 to-neutral-100 border-neutral-300';

  const IconComponent = isOrigin ? MdFlightTakeoff : isDestination ? MdFlightLand : MdLocalAirport;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        relative p-4 rounded-xl cursor-pointer transition-all duration-300 min-w-[180px]
        bg-gradient-to-br ${bgColor} border-2 shadow-lg
        ${selected ? 'ring-4 ring-green-500 shadow-2xl scale-105' : 'hover:shadow-xl hover:scale-[1.02]'}
      `}
    >
      <Handle type="target" position={Position.Left} id="in" className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} id="out" className="!bg-green-500 !w-3 !h-3 !border-2 !border-white" />

      <div className="flex items-center gap-3 mb-2">
        <IconComponent className={`text-2xl ${isOrigin ? 'text-blue-600' : isDestination ? 'text-green-600' : 'text-neutral-600'}`} />
        <div>
          <div className="font-bold text-neutral-900">{icao}</div>
          <div className="text-xs text-neutral-500 truncate max-w-[120px]">{name}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/60 rounded-lg px-2 py-1 text-center">
          <div className="text-neutral-500">Runway</div>
          <div className="font-bold text-neutral-900">{(runwayLengthFt / 1000).toFixed(1)}K ft</div>
        </div>
        <div className="bg-white/60 rounded-lg px-2 py-1 text-center">
          <div className="text-neutral-500">Country</div>
          <div className="font-bold text-neutral-900">{country}</div>
        </div>
      </div>

      {availableCargo && (availableCargo.palletCount > 0 || availableCargo.totalWeight > 0) && (
        <div className="mt-2 bg-amber-100/80 rounded-lg px-2 py-1.5 text-center border border-amber-200">
          <div className="flex items-center justify-center gap-2 text-xs">
            <FiPackage className="text-amber-600" size={12} />
            <span className="text-amber-800 font-medium">
              {availableCargo.palletCount} pallets available
            </span>
            <span className="text-amber-600">
              ({Math.round(availableCargo.totalWeight / 1000)}K lb)
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-between text-xs mt-2 text-neutral-500">
        {outgoingFlights.length > 0 && (
          <span className="flex items-center gap-1">
            <MdFlightTakeoff size={12} /> {outgoingFlights.length} departing
          </span>
        )}
        {incomingFlights.length > 0 && (
          <span className="flex items-center gap-1">
            <MdFlightLand size={12} /> {incomingFlights.length} arriving
          </span>
        )}
      </div>

      <div className="text-center text-xs text-neutral-400 mt-2 italic">
        Double-click to expand
      </div>
    </motion.div>
  );
};

const RouteEdge = ({ 
  id, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition,
  data,
  selected,
}: EdgeProps) => {
  const edgeData = data as unknown as RouteEdgeData;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeColor = edgeData?.isHazmat 
    ? '#eab308' 
    : edgeData?.isAdvon 
      ? '#f97316' 
      : '#6366f1';

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? '#3b82f6' : strokeColor}
        strokeWidth={selected ? 4 : 3}
        strokeDasharray={edgeData?.isHazmat ? '8 4' : undefined}
        className="transition-all duration-200"
        markerEnd="url(#arrow)"
      />
      {edgeData?.distance > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`
              bg-white/95 backdrop-blur-sm border rounded-lg px-2 py-1 shadow-md text-xs
              ${selected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-neutral-200'}
            `}
          >
            <div className="flex items-center gap-2 text-neutral-700">
              <span className="font-medium">{Math.round(edgeData?.distance || 0)} nm</span>
              <span className="text-neutral-300">|</span>
              <span>{(edgeData?.timeHours || 0).toFixed(1)} hr</span>
              <span className="text-neutral-300">|</span>
              <span className="flex items-center gap-0.5">
                <FiNavigation size={10} className="text-amber-600" />
                {Math.round((edgeData?.fuelLb || 0) / 1000)}K lb
              </span>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};


const nodeTypes = {
  flight: FlightNode,
  airbase: AirbaseNode,
};

const edgeTypes = {
  route: RouteEdge,
};

function buildGraphFromFlights(flights: SplitFlight[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const baseNodes = new Map<string, Node>();

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 });

  // Calculate available cargo at each airbase (incoming - outgoing)
  const calculateAvailableCargo = (baseId: string) => {
    const incomingFlights = flights.filter(f => f.destination.base_id === baseId);
    const outgoingFlights = flights.filter(f => f.origin.base_id === baseId);
    
    const incomingPallets = incomingFlights.reduce((sum, f) => sum + f.pallets.length, 0);
    const incomingWeight = incomingFlights.reduce((sum, f) => sum + calculateFlightWeight(f), 0);
    
    const outgoingPallets = outgoingFlights.reduce((sum, f) => sum + f.pallets.length, 0);
    const outgoingWeight = outgoingFlights.reduce((sum, f) => sum + calculateFlightWeight(f), 0);
    
    return {
      palletCount: Math.max(0, incomingPallets - outgoingPallets),
      totalWeight: Math.max(0, incomingWeight - outgoingWeight),
    };
  };

  flights.forEach((flight) => {
    const originId = `base-${flight.origin.base_id}`;
    const destId = `base-${flight.destination.base_id}`;
    const flightId = `flight-${flight.id}`;

    if (!baseNodes.has(originId)) {
      const outgoingFlightsList = flights.filter(f => f.origin.base_id === flight.origin.base_id).map(f => f.callsign);
      const incomingFlightsList = flights.filter(f => f.destination.base_id === flight.origin.base_id).map(f => f.callsign);
      
      const baseNode: Node = {
        id: originId,
        type: 'airbase',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'airbase',
          baseId: flight.origin.base_id,
          name: flight.origin.name,
          icao: flight.origin.icao,
          country: flight.origin.country,
          runwayLengthFt: flight.origin.runway_length_ft,
          isOrigin: true,
          isDestination: flights.some(f => f.destination.base_id === flight.origin.base_id),
          incomingFlights: incomingFlightsList,
          outgoingFlights: outgoingFlightsList,
          availableCargo: calculateAvailableCargo(flight.origin.base_id),
        } as AirbaseNodeData,
      };
      baseNodes.set(originId, baseNode);
      dagreGraph.setNode(originId, { width: 200, height: 120 });
    }

    if (!baseNodes.has(destId)) {
      const outgoingFlightsList = flights.filter(f => f.origin.base_id === flight.destination.base_id).map(f => f.callsign);
      const incomingFlightsList = flights.filter(f => f.destination.base_id === flight.destination.base_id).map(f => f.callsign);
      
      const baseNode: Node = {
        id: destId,
        type: 'airbase',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'airbase',
          baseId: flight.destination.base_id,
          name: flight.destination.name,
          icao: flight.destination.icao,
          country: flight.destination.country,
          runwayLengthFt: flight.destination.runway_length_ft,
          isOrigin: flights.some(f => f.origin.base_id === flight.destination.base_id),
          isDestination: true,
          incomingFlights: incomingFlightsList,
          outgoingFlights: outgoingFlightsList,
          availableCargo: calculateAvailableCargo(flight.destination.base_id),
        } as AirbaseNodeData,
      };
      baseNodes.set(destId, baseNode);
      dagreGraph.setNode(destId, { width: 200, height: 120 });
    }

    const isHazmat = flight.pallets.some(p => p.pallet.hazmat_flag);
    const isAdvon = flight.pallets.some(p => 
      p.pallet.items.some(i => i.advon_flag || i.description?.toLowerCase().includes('advon'))
    );

    const heaviestItems = flight.pallets
      .flatMap(p => p.pallet.items)
      .sort((a, b) => b.weight_each_lb - a.weight_each_lb)
      .slice(0, 5)
      .map(i => ({ name: i.description || `Item ${i.item_id}`, weight: i.weight_each_lb * i.quantity }));

    const flightNode: Node = {
      id: flightId,
      type: 'flight',
      position: { x: 0, y: 0 },
      data: {
        nodeType: 'flight',
        flightId: flight.id,
        callsign: flight.callsign,
        displayName: flight.display_name,
        aircraftType: flight.aircraft_type,
        isHazmat,
        isAdvon,
        heaviestItems,
        summary: {
          palletCount: flight.pallets.length,
          rollingStockCount: flight.rolling_stock.length,
          paxCount: flight.pax_count,
          totalWeight: calculateFlightWeight(flight),
        },
        originIcao: flight.origin.icao,
        destinationIcao: flight.destination.icao,
      } as FlightNodeData,
    };
    nodes.push(flightNode);
    dagreGraph.setNode(flightId, { width: 240, height: 200 });

    dagreGraph.setEdge(originId, flightId);
    dagreGraph.setEdge(flightId, destId);

    const distanceResult = calculateGreatCircleDistance(
      flight.origin.latitude_deg, flight.origin.longitude_deg,
      flight.destination.latitude_deg, flight.destination.longitude_deg
    );
    const distance = distanceResult.distance_nm;
    const timeResult = calculateTimeEnRoute(distance, flight.aircraft_type);
    const timeHours = timeResult.time_enroute_hr;
    const fuelLb = calculateFuelRequired(distance, flight.aircraft_type);

    edges.push({
      id: `edge-${originId}-${flightId}`,
      source: originId,
      target: flightId,
      type: 'route',
      data: {
        distance: 0,
        timeHours: 0,
        fuelLb: 0,
        flightId: flight.id,
        isHazmat,
        isAdvon,
      } as RouteEdgeData,
      animated: true,
    });

    edges.push({
      id: `edge-${flightId}-${destId}`,
      source: flightId,
      target: destId,
      type: 'route',
      data: {
        distance,
        timeHours,
        fuelLb,
        flightId: flight.id,
        isHazmat,
        isAdvon,
      } as RouteEdgeData,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: isHazmat ? '#eab308' : isAdvon ? '#f97316' : '#6366f1' },
    });
  });

  baseNodes.forEach(node => nodes.push(node));
  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - (node.type === 'flight' ? 120 : 100),
        y: nodeWithPosition.y - (node.type === 'flight' ? 100 : 60),
      };
    }
  });

  return { nodes, edges };
}

type ActiveTool = 'select' | 'add-airbase' | 'add-flight' | 'eraser' | 'scissors' | null;

function FlowchartCanvasInner({ splitFlights, allocationResult, onFlightsChange, onBack, onSave, onView3D }: MissionFlowchartCanvasProps) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showFlightModal, setShowFlightModal] = useState(false);
  const [showAirbaseModal, setShowAirbaseModal] = useState(false);
  const [showAddBaseModal, setShowAddBaseModal] = useState(false);
  const [showAddFlightModal, setShowAddFlightModal] = useState(false);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [pendingNodePosition, setPendingNodePosition] = useState<{ x: number; y: number } | null>(null);
  const reactFlowInstance = useReactFlow();

  // Define handlers first (before enrichNodesWithCallbacks)
  const handleExportPDF = useCallback(() => {
    if (splitFlights.length > 0) {
      const exportData: SessionExportData = {
        sessionName: 'Mission Flowchart Export',
        exportDate: new Date(),
        splitFlights: splitFlights,
        allocationResult: allocationResult,
      };
      exportSessionSummaryToPDF(exportData);
    }
  }, [splitFlights, allocationResult]);

  const handleExportICODES = useCallback(async () => {
    if (splitFlights.length > 0) {
      await downloadSplitFlightsICODES(splitFlights);
    }
  }, [splitFlights]);

  const handleSingleFlightPDF = useCallback((flightId: string) => {
    const flight = splitFlights.find(f => f.id === flightId);
    if (flight) {
      exportSplitFlightToPDF(flight);
    }
  }, [splitFlights]);

  const handleSingleFlightICODES = useCallback(async (flightId: string) => {
    const flight = splitFlights.find(f => f.id === flightId);
    if (flight) {
      await downloadSplitFlightsICODES([flight]);
    }
  }, [splitFlights]);

  // Now define enrichNodesWithCallbacks after handlers are defined
  const enrichNodesWithCallbacks = useCallback((graphNodes: Node[]) => {
    return graphNodes.map(node => {
      if (node.type === 'flight') {
        return {
          ...node,
          data: {
            ...node.data,
            onExportPDF: handleSingleFlightPDF,
            onExportICODES: handleSingleFlightICODES,
            onView3D: onView3D,
          },
        };
      }
      return node;
    });
  }, [handleSingleFlightPDF, handleSingleFlightICODES, onView3D]);

  const initialGraph = useMemo(() => buildGraphFromFlights(splitFlights), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(enrichNodesWithCallbacks(initialGraph.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);

  // Sync existing flight node summaries when pallets change (keep node positions intact)
  useEffect(() => {
    // Only update existing flight node data - don't create new nodes here
    setNodes(nds => nds.map(node => {
      if (node.type !== 'flight') return node;
      const nodeData = node.data as unknown as { flightId?: string };
      const flight = splitFlights.find(f => f.id === nodeData.flightId);
      if (!flight) return node;
      
      const isHazmat = flight.pallets.some(p => p.pallet.hazmat_flag);
      const isAdvon = flight.pallets.some(p => 
        p.pallet.items.some(i => i.advon_flag || i.description?.toLowerCase().includes('advon'))
      );
      const heaviestItems = flight.pallets
        .flatMap(p => p.pallet.items)
        .sort((a, b) => b.weight_each_lb - a.weight_each_lb)
        .slice(0, 5)
        .map(i => ({ name: i.description || `Item ${i.item_id}`, weight: i.weight_each_lb * i.quantity }));
      
      return {
        ...node,
        data: {
          ...node.data,
          isHazmat,
          isAdvon,
          heaviestItems,
          summary: {
            palletCount: flight.pallets.length,
            rollingStockCount: flight.rolling_stock.length,
            paxCount: flight.pax_count,
            totalWeight: calculateFlightWeight(flight),
          },
        },
      };
    }));
  }, [splitFlights]);

  // Handle manual edge connections between nodes
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    
    if (!sourceNode || !targetNode) return;
    
    const sourceData = sourceNode.data as unknown as { nodeType: string; isHazmat?: boolean; isAdvon?: boolean; baseId?: string; flightId?: string };
    const targetData = targetNode.data as unknown as { nodeType: string; baseId?: string; flightId?: string };
    
    // Check if both nodes are airbases - need to auto-spawn a flight
    if (sourceData.nodeType === 'airbase' && targetData.nodeType === 'airbase') {
      console.log('Base-to-base connection detected, spawning flight...');
      
      // Calculate position between the two bases
      const midX = (sourceNode.position.x + targetNode.position.x) / 2;
      const midY = (sourceNode.position.y + targetNode.position.y) / 2;
      
      // Find an incoming flight to the origin base as default, or use first available flight
      const originBase = MILITARY_BASES.find(b => b.base_id === sourceData.baseId);
      const destBase = MILITARY_BASES.find(b => b.base_id === targetData.baseId);
      
      if (!originBase || !destBase) return;
      
      // Find a flight that goes to origin as default template
      const templateFlight = splitFlights.find(f => f.destination.base_id === originBase.base_id) || splitFlights[0];
      
      if (!templateFlight) {
        // No flights available, create empty flight
        const newFlightId = `flight-auto-${Date.now()}`;
        const newFlight: SplitFlight = {
          id: newFlightId,
          parent_flight_id: 'AUTO',
          callsign: `AUTO${(splitFlights.length + 1).toString().padStart(2, '0')}`,
          aircraft_type: 'C-17',
          aircraft_id: `C-17-AUTO-${splitFlights.length + 1}`,
          origin: originBase,
          destination: destBase,
          scheduled_departure: new Date(),
          scheduled_arrival: new Date(Date.now() + 8 * 60 * 60 * 1000),
          estimated_delay_minutes: 0,
          pallets: [],
          rolling_stock: [],
          pax_count: 0,
          total_weight_lb: 0,
          center_of_balance_percent: 25,
          weather_warnings: [],
          is_modified: true
        };
        
        // Add the flight to state
        onFlightsChange([...splitFlights, newFlight]);
        return;
      }
      
      // Create new flight based on template
      const newFlightId = `flight-auto-${Date.now()}`;
      const newFlight: SplitFlight = {
        id: newFlightId,
        parent_flight_id: templateFlight.parent_flight_id,
        callsign: `REACH${(splitFlights.length + 1).toString().padStart(2, '0')}`,
        aircraft_type: templateFlight.aircraft_type,
        aircraft_id: `${templateFlight.aircraft_type}-AUTO-${splitFlights.length + 1}`,
        origin: originBase,
        destination: destBase,
        scheduled_departure: new Date(),
        scheduled_arrival: new Date(Date.now() + 8 * 60 * 60 * 1000),
        estimated_delay_minutes: 0,
        pallets: [],
        rolling_stock: [],
        pax_count: 0,
        total_weight_lb: 0,
        center_of_balance_percent: 25,
        weather_warnings: [],
        is_modified: true
      };
      
      onFlightsChange([...splitFlights, newFlight]);
      console.log(`Auto-spawned flight ${newFlight.callsign} between ${originBase.icao} and ${destBase.icao}`);
      return;
    }
    
    // Normal edge connection
    const isHazmat = sourceData.isHazmat || false;
    const isAdvon = sourceData.isAdvon || false;
    
    const newEdge = {
      ...connection,
      id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
      type: 'route',
      animated: true,
      style: { stroke: isHazmat ? '#eab308' : isAdvon ? '#f97316' : '#6366f1', strokeWidth: 2 },
      data: {
        distance: 0,
        timeHours: 0,
        fuelLb: 0,
        flightId: connection.source,
        isHazmat,
        isAdvon,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: isHazmat ? '#eab308' : isAdvon ? '#f97316' : '#6366f1' },
    };
    
    setEdges(eds => addEdge(newEdge as Edge, eds));
    console.log(`Connected ${connection.source} to ${connection.target}`);
  }, [nodes, setEdges, splitFlights, onFlightsChange]);

  useEffect(() => {
    const graph = buildGraphFromFlights(splitFlights);
    const enrichedNodes = enrichNodesWithCallbacks(graph.nodes);
    setNodes(enrichedNodes);
    setEdges(graph.edges);
  }, [splitFlights, setNodes, setEdges, enrichNodesWithCallbacks]);

  useEffect(() => {
    setInsights(analyzeAllocation(allocationResult));
  }, [allocationResult]);

  const handleNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    const nodeData = node.data as unknown as { nodeType: string };
    if (nodeData.nodeType === 'flight') {
      setShowFlightModal(true);
    } else if (nodeData.nodeType === 'airbase') {
      setShowAirbaseModal(true);
    }
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNode) return;
    setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
    setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges]);

  const handleAutoLayout = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      const graph = buildGraphFromFlights(splitFlights);
      const enrichedNodes = enrichNodesWithCallbacks(graph.nodes);
      setNodes(enrichedNodes);
      setEdges(graph.edges);
      setIsLoading(false);
    }, 500);
  }, [splitFlights, setNodes, setEdges, enrichNodesWithCallbacks]);

  // Eraser tool - drag to delete edges
  const [isErasing, setIsErasing] = useState(false);
  const [lastErasePos, setLastErasePos] = useState<{ x: number; y: number } | null>(null);
  const erasedEdgesRef = useRef<Set<string>>(new Set());

  // Helper to delete an edge and clean up state
  const deleteEdge = useCallback((edge: Edge) => {
    setEdges(eds => eds.filter(e => e.id !== edge.id));
  }, [setEdges]);

  // Check if a point is near an edge (within tolerance)
  const isPointNearEdge = useCallback((point: { x: number; y: number }, edge: Edge, tolerance: number = 15): boolean => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!sourceNode || !targetNode) return false;

    // Get node centers
    const sx = (sourceNode.position?.x || 0) + (sourceNode.width || 200) / 2;
    const sy = (sourceNode.position?.y || 0) + (sourceNode.height || 100) / 2;
    const tx = (targetNode.position?.x || 0) + (targetNode.width || 200) / 2;
    const ty = (targetNode.position?.y || 0) + (targetNode.height || 100) / 2;

    // Calculate distance from point to line segment
    const dx = tx - sx;
    const dy = ty - sy;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) {
      // Source and target are same point
      const dist = Math.sqrt((point.x - sx) ** 2 + (point.y - sy) ** 2);
      return dist <= tolerance;
    }

    // Project point onto line and clamp to segment
    let t = ((point.x - sx) * dx + (point.y - sy) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    // Find closest point on segment
    const closestX = sx + t * dx;
    const closestY = sy + t * dy;

    // Calculate distance
    const dist = Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
    return dist <= tolerance;
  }, [nodes]);

  // Handle eraser mouse events
  const handleEraserMouseDown = useCallback((event: React.MouseEvent) => {
    if (activeTool !== 'eraser') return;
    
    const bounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
    if (!bounds) return;

    const flowPos = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    setIsErasing(true);
    setLastErasePos(flowPos);
    erasedEdgesRef.current.clear();

    // Check for edges at initial click
    edges.forEach(edge => {
      if (!erasedEdgesRef.current.has(edge.id) && isPointNearEdge(flowPos, edge)) {
        erasedEdgesRef.current.add(edge.id);
        deleteEdge(edge);
      }
    });
  }, [activeTool, edges, reactFlowInstance, isPointNearEdge, deleteEdge]);

  const handleEraserMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isErasing || activeTool !== 'eraser') return;

    const flowPos = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    // Interpolate points between last position and current position to handle fast drags
    const checkPoints: { x: number; y: number }[] = [];
    if (lastErasePos) {
      checkPoints.push(lastErasePos); // Always include start point
      const dx = flowPos.x - lastErasePos.x;
      const dy = flowPos.y - lastErasePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(2, Math.ceil(dist / 5)); // Sample every 5 pixels, minimum 2 steps
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        checkPoints.push({
          x: lastErasePos.x + dx * t,
          y: lastErasePos.y + dy * t,
        });
      }
    } else {
      checkPoints.push(flowPos);
    }

    // Check for edges along all interpolated points
    edges.forEach(edge => {
      if (erasedEdgesRef.current.has(edge.id)) return;
      for (const point of checkPoints) {
        if (isPointNearEdge(point, edge, 25)) { // Larger tolerance for curved edges
          erasedEdgesRef.current.add(edge.id);
          deleteEdge(edge);
          break;
        }
      }
    });

    setLastErasePos(flowPos);
  }, [isErasing, activeTool, edges, reactFlowInstance, isPointNearEdge, deleteEdge, lastErasePos]);

  const handleEraserMouseUp = useCallback(() => {
    setIsErasing(false);
    setLastErasePos(null);
  }, []);

  // Legacy click handler (backup for single clicks)
  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    if (activeTool === 'eraser') {
      deleteEdge(edge);
    }
  }, [activeTool, deleteEdge]);

  // Scissors tool - split a flight into two
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [flightToSplit, setFlightToSplit] = useState<SplitFlight | null>(null);

  const handleScissorsSplit = useCallback((node: Node) => {
    const nodeData = node.data as unknown as { nodeType: string; flightId?: string };
    if (nodeData.nodeType !== 'flight' || !nodeData.flightId) return;
    
    const flight = splitFlights.find(f => f.id === nodeData.flightId);
    if (!flight) return;
    
    // Need at least 2 pallets to split
    if (flight.pallets.length < 2) {
      console.log('Cannot split flight with less than 2 pallets');
      return;
    }
    
    setFlightToSplit(flight);
    setShowSplitModal(true);
    setActiveTool(null);
  }, [splitFlights]);

  const handleConfirmSplit = useCallback(() => {
    if (!flightToSplit) return;
    
    const palletCount = flightToSplit.pallets.length;
    const splitPoint = Math.ceil(palletCount / 2);
    
    const firstHalfPallets = flightToSplit.pallets.slice(0, splitPoint);
    const secondHalfPallets = flightToSplit.pallets.slice(splitPoint);
    
    // Create updated original flight with first half
    const updatedOriginal: SplitFlight = {
      ...flightToSplit,
      pallets: firstHalfPallets,
      total_weight_lb: firstHalfPallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0) + flightToSplit.rolling_stock.reduce((sum, r) => sum + r.weight, 0),
    };
    updatedOriginal.center_of_balance_percent = calculateCenterOfBalance(updatedOriginal);
    
    // Create new flight with second half
    const newFlightId = `${flightToSplit.id}-B`;
    const callsignBase = flightToSplit.callsign.replace(/[0-9]+$/, '');
    const callsignNum = parseInt(flightToSplit.callsign.match(/[0-9]+$/)?.[0] || '1') + 1;
    
    const newFlight: SplitFlight = {
      ...flightToSplit,
      id: newFlightId,
      aircraft_id: `${flightToSplit.aircraft_type}-${Date.now()}`,
      callsign: `${callsignBase}${callsignNum}`,
      display_name: `${callsignBase}${callsignNum}`,
      pallets: secondHalfPallets.map((p, idx) => ({
        ...p,
        position: idx + 1,
      })),
      rolling_stock: [], // Rolling stock stays with original
      pax_count: 0, // PAX stays with original
      total_weight_lb: secondHalfPallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0),
    };
    newFlight.center_of_balance_percent = calculateCenterOfBalance(newFlight);
    
    // Update flights
    const updatedFlights = splitFlights.map(f => 
      f.id === flightToSplit.id ? updatedOriginal : f
    );
    updatedFlights.push(newFlight);
    
    onFlightsChange(updatedFlights);
    setShowSplitModal(false);
    setFlightToSplit(null);
    console.log(`Split flight ${flightToSplit.callsign} into two flights`);
  }, [flightToSplit, splitFlights, onFlightsChange]);

  // Node click handler - handles selection and scissors tool
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // Handle scissors tool - split flight on click (don't select)
    if (activeTool === 'scissors') {
      handleScissorsSplit(node);
      return; // Don't do normal selection
    }
    
    setSelectedNode(node);
  }, [activeTool, handleScissorsSplit]);

  // Handle pane click for placing nodes
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    if (!activeTool || activeTool === 'select') return;
    
    // screenToFlowPosition expects viewport coordinates (clientX/clientY)
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    
    setPendingNodePosition(position);
    
    if (activeTool === 'add-airbase') {
      setShowAddBaseModal(true);
    } else if (activeTool === 'add-flight') {
      setShowAddFlightModal(true);
    }
  }, [activeTool, reactFlowInstance]);

  // Add a new airbase node
  const handleAddAirbase = useCallback((base: MilitaryBase) => {
    const position = pendingNodePosition || { x: 100, y: 100 };
    const newNode: Node = {
      id: `base-${base.base_id}-${Date.now()}`,
      type: 'airbase',
      position,
      data: {
        nodeType: 'airbase',
        baseId: base.base_id,
        name: base.name,
        icao: base.icao,
        country: base.country,
        runwayLengthFt: base.runway_length_ft,
        isOrigin: false,
        isDestination: false,
        incomingFlights: [],
        outgoingFlights: [],
        availableCargo: { palletCount: 0, totalWeight: 0 },
      } as AirbaseNodeData,
    };
    setNodes(nds => [...nds, newNode]);
    setShowAddBaseModal(false);
    setActiveTool(null);
    setPendingNodePosition(null);
  }, [pendingNodePosition, setNodes]);

  // Add a new flight node
  const handleAddFlight = useCallback((aircraftType: 'C-17' | 'C-130', callsign: string, reuseAircraftId?: string, selectedPalletIds?: string[]) => {
    const position = pendingNodePosition || { x: 200, y: 200 };
    const timestamp = Date.now();
    const flightId = `new-${timestamp}`;
    
    // If reusing an aircraft, find the original flight to get the aircraft_id
    const existingFlight = reuseAircraftId 
      ? splitFlights.find(f => f.aircraft_id === reuseAircraftId) 
      : null;
    
    // Find and prepare selected pallets if any
    let palletsToAdd: SplitFlight['pallets'] = [];
    if (selectedPalletIds && selectedPalletIds.length > 0 && existingFlight) {
      const originBaseId = existingFlight.destination.base_id;
      const incomingFlights = splitFlights.filter(f => f.destination.base_id === originBaseId);
      
      for (const flight of incomingFlights) {
        const matchingPallets = flight.pallets.filter(p => 
          selectedPalletIds.includes(p.pallet.id)
        );
        palletsToAdd.push(...matchingPallets.map((p, idx) => ({
          ...p,
          position_index: palletsToAdd.length + idx
        })));
      }
    }
    
    const totalWeight = palletsToAdd.reduce((sum, p) => 
      sum + p.pallet.items.reduce((s, i) => s + i.weight_each_lb * i.quantity, 0), 0
    );
    
    // Create the actual SplitFlight data
    const defaultBase = MILITARY_BASES[0];
    const newFlight: SplitFlight = {
      id: flightId,
      parent_flight_id: existingFlight ? existingFlight.id : flightId,
      callsign,
      display_name: callsign,
      aircraft_type: aircraftType,
      aircraft_id: reuseAircraftId || `${aircraftType}-${timestamp}`,
      origin: existingFlight ? existingFlight.destination : defaultBase,
      destination: defaultBase,
      waypoints: [],
      scheduled_departure: existingFlight 
        ? new Date(existingFlight.scheduled_arrival.getTime() + 2 * 60 * 60 * 1000) 
        : new Date(),
      scheduled_arrival: existingFlight
        ? new Date(existingFlight.scheduled_arrival.getTime() + 6 * 60 * 60 * 1000)
        : new Date(Date.now() + 4 * 60 * 60 * 1000),
      estimated_delay_minutes: 0,
      pallets: palletsToAdd,
      rolling_stock: [],
      pax_count: 0,
      total_weight_lb: totalWeight,
      center_of_balance_percent: 27,
      weather_warnings: [],
      is_modified: true,
    };
    
    // Add flight to splitFlights
    onFlightsChange([...splitFlights, newFlight]);
    
    const newNode: Node = {
      id: `flight-${flightId}`,
      type: 'flight',
      position,
      data: {
        nodeType: 'flight',
        flightId: flightId,
        callsign,
        displayName: callsign,
        aircraftType,
        isHazmat: false,
        isAdvon: false,
        heaviestItems: [],
        summary: {
          palletCount: 0,
          rollingStockCount: 0,
          paxCount: 0,
          totalWeight: 0,
        },
        onExportPDF: handleSingleFlightPDF,
        onExportICODES: handleSingleFlightICODES,
        onView3D: onView3D,
      } as FlightNodeData,
    };
    setNodes(nds => [...nds, newNode]);
    setShowAddFlightModal(false);
    setActiveTool(null);
    setPendingNodePosition(null);
  }, [pendingNodePosition, setNodes, splitFlights, onFlightsChange, handleSingleFlightPDF, handleSingleFlightICODES, onView3D]);

  // Handle pallet transfer between flights
  const handlePalletTransfer = useCallback((sourceFlight: SplitFlight, targetFlightId: string, palletIds: string[]) => {
    console.log(`Transferring ${palletIds.length} pallets from ${sourceFlight.callsign} to flight ${targetFlightId}`);
    console.log('Pallet IDs:', palletIds);
    
    const targetFlight = splitFlights.find(f => f.id === targetFlightId);
    if (!targetFlight) return;
    
    // Deep clone pallets to avoid shared references
    const deepClonePallet = (p: typeof sourceFlight.pallets[0]) => ({
      ...p,
      pallet: {
        ...p.pallet,
        items: [...p.pallet.items.map(item => ({ ...item }))]
      }
    });
    
    // Get pallets to transfer (deep cloned)
    const palletsToTransfer = sourceFlight.pallets
      .filter(p => palletIds.includes(p.pallet.id))
      .map(deepClonePallet);
    const remainingPallets = sourceFlight.pallets
      .filter(p => !palletIds.includes(p.pallet.id))
      .map(deepClonePallet);
    
    // Calculate new position indices for target flight
    const newPalletsForTarget = palletsToTransfer.map((p, idx) => ({
      ...p,
      position_index: targetFlight.pallets.length + idx,
      is_ramp: false
    }));
    
    // Normalize pallet positions (re-index from 0 sequentially)
    const normalizePalletPositions = (pallets: typeof sourceFlight.pallets) => 
      pallets.map((p, idx) => ({ ...p, position_index: idx }));
    
    // Update flights
    const updatedFlights = splitFlights.map(f => {
      if (f.id === sourceFlight.id) {
        // Remove pallets from source and normalize positions
        const normalizedPallets = normalizePalletPositions(remainingPallets);
        const updatedSource = {
          ...f,
          pallets: normalizedPallets
        };
        return {
          ...updatedSource,
          total_weight_lb: calculateFlightWeight(updatedSource),
          center_of_balance_percent: calculateCenterOfBalance(updatedSource)
        };
      }
      if (f.id === targetFlightId) {
        // Add pallets to target, deep clone existing, then normalize all positions
        const existingPallets = f.pallets.map(deepClonePallet);
        const combinedPallets = [...existingPallets, ...palletsToTransfer];
        const normalizedPallets = normalizePalletPositions(combinedPallets);
        const updatedTarget = { ...f, pallets: normalizedPallets };
        return {
          ...updatedTarget,
          total_weight_lb: calculateFlightWeight(updatedTarget),
          center_of_balance_percent: calculateCenterOfBalance(updatedTarget)
        };
      }
      return f;
    });
    
    const transferredWeight = palletsToTransfer.reduce((sum, p) => sum + p.pallet.gross_weight, 0);
    console.log(`Successfully transferred ${transferredWeight.toLocaleString()} lb to ${targetFlight.callsign}`);
    
    onFlightsChange(updatedFlights);
    setShowFlightModal(false);
  }, [splitFlights, onFlightsChange]);

  const selectedFlight = selectedNode?.data 
    ? (() => {
        const nodeData = selectedNode.data as unknown as { nodeType: string; flightId?: string };
        if (nodeData.nodeType === 'flight' && nodeData.flightId) {
          return splitFlights.find(f => f.id === nodeData.flightId);
        }
        return null;
      })()
    : null;

  const selectedBase = selectedNode?.data
    ? (() => {
        const nodeData = selectedNode.data as unknown as { nodeType: string; baseId?: string };
        if (nodeData.nodeType === 'airbase' && nodeData.baseId) {
          return MILITARY_BASES.find(b => b.base_id === nodeData.baseId);
        }
        return null;
      })()
    : null;

  const totalWeight = splitFlights.reduce((sum, f) => sum + calculateFlightWeight(f), 0);
  const totalPallets = splitFlights.reduce((sum, f) => sum + f.pallets.length, 0);
  const totalPax = splitFlights.reduce((sum, f) => sum + f.pax_count, 0);

  // State for pallet panel
  const [showPalletPanel, setShowPalletPanel] = useState(false);
  const [palletTransferTarget, setPalletTransferTarget] = useState<string | null>(null);
  const [selectedPallets, setSelectedPallets] = useState<Set<string>>(new Set());

  // State for auto-spawned flight selection
  const [pendingBaseConnection, setPendingBaseConnection] = useState<{
    sourceBaseId: string;
    targetBaseId: string;
    position: { x: number; y: number };
  } | null>(null);

  return (
    <div className="w-full bg-neutral-100 relative flex overflow-hidden" style={{ width: '100%', height: '100vh', maxHeight: '100vh' }}>
      {/* Left Sidebar Toolbar */}
      <div className="w-14 bg-white/95 backdrop-blur-sm border-r border-neutral-200 flex flex-col items-center py-3 gap-1.5 shadow-lg z-10 flex-shrink-0">
        <div className="text-neutral-400 text-[10px] font-medium mb-1">Tools</div>
        
        <button
          onClick={() => setActiveTool(activeTool === 'add-airbase' ? null : 'add-airbase')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            activeTool === 'add-airbase'
              ? 'bg-blue-500 text-white ring-2 ring-blue-300'
              : 'bg-neutral-100 hover:bg-blue-100 text-neutral-600 hover:text-blue-600'
          }`}
          title="Add Airbase (click canvas to place)"
        >
          <FiMapPin size={16} />
        </button>
        
        <button
          onClick={() => setActiveTool(activeTool === 'add-flight' ? null : 'add-flight')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            activeTool === 'add-flight'
              ? 'bg-green-500 text-white ring-2 ring-green-300'
              : 'bg-neutral-100 hover:bg-green-100 text-neutral-600 hover:text-green-600'
          }`}
          title="Add Flight (click canvas to place)"
        >
          <MdFlight size={16} />
        </button>
        
        <div className="w-7 h-px bg-neutral-200 my-1" />
        
        <button
          onClick={() => setActiveTool(activeTool === 'scissors' ? null : 'scissors')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            activeTool === 'scissors'
              ? 'bg-orange-500 text-white ring-2 ring-orange-300'
              : 'bg-neutral-100 hover:bg-orange-100 text-neutral-600 hover:text-orange-600'
          }`}
          title="Scissors Tool (click flight to split)"
        >
          <FiScissors size={16} />
        </button>
        
        <button
          onClick={() => setActiveTool(activeTool === 'eraser' ? null : 'eraser')}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            activeTool === 'eraser'
              ? 'bg-red-500 text-white ring-2 ring-red-300'
              : 'bg-neutral-100 hover:bg-red-100 text-neutral-600 hover:text-red-600'
          }`}
          title="Eraser Tool (click edge to delete)"
        >
          <TbEraser size={16} />
        </button>
        
        <div className="w-7 h-px bg-neutral-200 my-1" />
        
        <button
          onClick={handleDeleteSelected}
          disabled={!selectedNode}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            selectedNode 
              ? 'bg-neutral-100 hover:bg-red-100 text-neutral-600 hover:text-red-600' 
              : 'bg-neutral-50 text-neutral-300 cursor-not-allowed'
          }`}
          title="Delete Selected Node"
        >
          <FiTrash2 size={16} />
        </button>
        
        <button
          onClick={handleAutoLayout}
          className="w-9 h-9 rounded-lg bg-neutral-100 hover:bg-purple-100 text-neutral-600 hover:text-purple-600 flex items-center justify-center transition-all"
          title="Auto Layout"
        >
          <FiRefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
        
        <div className="flex-1" />
        
        <div className="text-neutral-400 text-[10px] font-medium mb-1">Export</div>
        
        <button
          onClick={handleExportICODES}
          className="w-9 h-9 rounded-lg bg-green-100 hover:bg-green-200 text-green-600 flex items-center justify-center transition-all"
          title="Export All ICODES"
        >
          <FiDownload size={16} />
        </button>
        
        <button
          onClick={handleExportPDF}
          className="w-9 h-9 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-600 flex items-center justify-center transition-all"
          title="Export All PDF"
        >
          <FiFileText size={16} />
        </button>
      </div>

      {/* Active Tool Indicator */}
      {activeTool && (
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border flex items-center gap-2 bg-white/95 border-neutral-200">
          {activeTool === 'add-airbase' && <FiMapPin className="text-blue-600" size={16} />}
          {activeTool === 'add-flight' && <MdFlight className="text-green-600" size={16} />}
          {activeTool === 'scissors' && <FiScissors className="text-orange-600" size={16} />}
          {activeTool === 'eraser' && <TbEraser className="text-red-600" size={16} />}
          <span className={`text-sm font-medium ${
            activeTool === 'eraser' ? 'text-red-800' :
            activeTool === 'scissors' ? 'text-orange-800' : 'text-neutral-700'
          }`}>
            {activeTool === 'eraser'
              ? 'Click and drag across edges to erase them'
              : activeTool === 'scissors'
              ? 'Click on a flight to split it in half'
              : `Click on canvas to place ${activeTool === 'add-airbase' ? 'airbase' : 'flight'}`}
          </span>
          <button
            onClick={() => setActiveTool(null)}
            className="ml-2 text-neutral-400 hover:text-neutral-600"
          >
            <FiX size={16} />
          </button>
        </div>
      )}

      {/* Main Canvas */}
      <div 
        className="flex-1 relative"
        onMouseDown={handleEraserMouseDown}
        onMouseMove={handleEraserMouseMove}
        onMouseUp={handleEraserMouseUp}
        onMouseLeave={handleEraserMouseUp}
      >
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-20 flex items-center justify-center">
            <div className="bg-white rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
              <FiRefreshCw className="animate-spin text-blue-600" size={20} />
              <span className="text-neutral-700 font-medium">Recalculating...</span>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
          connectionLineType={ConnectionLineType.SmoothStep}
          className={activeTool ? 'cursor-crosshair' : ''}
        >
          <svg>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
              </marker>
            </defs>
          </svg>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
          <Controls className="!bg-white/90 !backdrop-blur-sm !border-neutral-200 !rounded-xl !shadow-lg !bottom-20" />
          <MiniMap 
            className="!bg-white/90 !backdrop-blur-sm !border-neutral-200 !rounded-xl !shadow-lg"
            nodeColor={(node) => {
              const nodeData = node.data as unknown as { nodeType: string; isHazmat?: boolean; isAdvon?: boolean; aircraftType?: string };
              if (node.type === 'flight') {
                if (nodeData.isHazmat) return '#eab308';
                if (nodeData.isAdvon) return '#f97316';
                return nodeData.aircraftType === 'C-17' ? '#3b82f6' : '#22c55e';
              }
              return '#6b7280';
            }}
          />

          <Panel position="top-left" className="!m-4">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-neutral-200 hover:bg-white transition-all flex items-center gap-2"
                >
                  <FiArrowLeft size={16} />
                  <span className="font-medium">Back</span>
                </button>
              )}
              <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-neutral-200">
                <span className="font-bold text-neutral-900">Mission Flowchart</span>
                <span className="text-neutral-500 ml-2 text-sm">{splitFlights.length} flights</span>
              </div>
            </div>
          </Panel>

        <Panel position="top-right" className="!m-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportICODES}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl shadow-lg transition-all font-medium flex items-center gap-2"
            >
              <span>Export ICODES</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-xl shadow-lg transition-all font-medium flex items-center gap-2"
            >
              <span>Export PDF</span>
            </button>
            {onSave && (
              <button
                onClick={onSave}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl shadow-lg transition-all font-bold flex items-center gap-2"
              >
                <span>Save & Close</span>
              </button>
            )}
          </div>
        </Panel>

        <Panel position="bottom-left" className="!m-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500 mb-2">Legend</div>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-yellow-400" />
                <span>HAZMAT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-orange-400" />
                <span>ADVON</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-blue-400" />
                <span>C-17</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-green-400" />
                <span>C-130</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel position="bottom-right" className="!m-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200 p-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{splitFlights.length}</div>
                <div className="text-xs text-neutral-500">Flights</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{totalPallets}</div>
                <div className="text-xs text-neutral-500">Pallets</div>
              </div>
              <div className="text-center col-span-2">
                <div className="text-2xl font-bold text-amber-600">{Math.round(totalWeight / 1000)}K</div>
                <div className="text-xs text-neutral-500">Total Weight (lb)</div>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Right Side Pallet Management Panel */}
      <AnimatePresence>
        {selectedFlight && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="w-80 bg-white border-l border-neutral-200 flex flex-col overflow-hidden flex-shrink-0"
          >
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-blue-50 to-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MdFlight className={`text-xl ${selectedFlight.aircraft_type === 'C-17' ? 'text-blue-600' : 'text-green-600'}`} />
                  <div>
                    <h3 className="font-bold text-neutral-900">{selectedFlight.callsign}</h3>
                    <p className="text-xs text-neutral-500">{selectedFlight.aircraft_type}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-neutral-400 hover:text-neutral-600 p-1"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>

            {/* Pallets List */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-neutral-700 text-sm">Pallets ({selectedFlight.pallets.length})</h4>
                <button
                  onClick={() => setShowPalletPanel(!showPalletPanel)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    showPalletPanel 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-neutral-100 text-neutral-600 hover:bg-blue-100'
                  }`}
                >
                  {showPalletPanel ? 'Cancel Transfer' : 'Transfer Pallets'}
                </button>
              </div>

              {selectedFlight.pallets.length === 0 ? (
                <div className="text-center py-6 text-neutral-400">
                  <FiPackage size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No pallets on this flight</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedFlight.pallets.map(p => (
                    <div
                      key={p.pallet.id}
                      onClick={() => {
                        if (showPalletPanel) {
                          const newSelected = new Set(selectedPallets);
                          if (newSelected.has(p.pallet.id)) {
                            newSelected.delete(p.pallet.id);
                          } else {
                            newSelected.add(p.pallet.id);
                          }
                          setSelectedPallets(newSelected);
                        }
                      }}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        showPalletPanel && selectedPallets.has(p.pallet.id)
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : p.pallet.hazmat_flag
                            ? 'border-yellow-300 bg-yellow-50'
                            : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {showPalletPanel && (
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              selectedPallets.has(p.pallet.id) 
                                ? 'bg-blue-500 border-blue-500' 
                                : 'border-neutral-300'
                            }`}>
                              {selectedPallets.has(p.pallet.id) && (
                                <FiCheckCircle className="text-white" size={12} />
                              )}
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-sm">{p.pallet.id}</span>
                            {p.pallet.hazmat_flag && (
                              <span className="ml-1.5 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">
                                HAZMAT
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-neutral-500">
                          {Math.round(p.pallet.gross_weight).toLocaleString()} lb
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        Position {p.position_index + 1} | {p.pallet.items.length} items
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Transfer Panel */}
            {showPalletPanel && selectedPallets.size > 0 && (() => {
              // Show all other flights as potential transfer targets
              const availableFlights = splitFlights.filter(f => f.id !== selectedFlight.id);
              const hasFlights = availableFlights.length > 0;
              
              return (
              <div className="p-3 border-t border-neutral-200 bg-blue-50">
                <div className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1">
                  <FiSend size={14} />
                  Transfer {selectedPallets.size} pallet{selectedPallets.size > 1 ? 's' : ''} to:
                </div>
                <select
                  value={palletTransferTarget || ''}
                  onChange={(e) => setPalletTransferTarget(e.target.value)}
                  className="w-full p-2 rounded-lg border border-blue-300 text-sm mb-2 bg-white"
                  disabled={!hasFlights}
                >
                  <option value="">
                    {hasFlights ? 'Select target flight...' : 'No other flights available'}
                  </option>
                  {availableFlights.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.callsign} ({f.aircraft_type}) - {f.pallets.length} pallets
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (palletTransferTarget && selectedPallets.size > 0) {
                      handlePalletTransfer(selectedFlight, palletTransferTarget, Array.from(selectedPallets));
                      setSelectedPallets(new Set());
                      setPalletTransferTarget(null);
                      setShowPalletPanel(false);
                    }
                  }}
                  disabled={!palletTransferTarget || !hasFlights}
                  className={`w-full py-2 rounded-lg font-medium text-sm transition-all ${
                    palletTransferTarget && hasFlights
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  Transfer Pallets
                </button>
              </div>
              );
            })()}

            {/* Actions */}
            <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex gap-2">
              <button
                onClick={() => handleSingleFlightPDF(selectedFlight.id)}
                className="flex-1 py-2 px-3 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
              >
                <FiFileText size={14} />
                PDF
              </button>
              <button
                onClick={() => handleSingleFlightICODES(selectedFlight.id)}
                className="flex-1 py-2 px-3 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
              >
                <FiDownload size={14} />
                ICODES
              </button>
              <button
                onClick={() => onView3D?.(selectedFlight.id)}
                className="flex-1 py-2 px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
              >
                <FiEye size={14} />
                3D
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFlightModal && selectedFlight && (
          <FlightDetailModal
            flight={selectedFlight}
            insights={insights}
            allFlights={splitFlights}
            onClose={() => setShowFlightModal(false)}
            onTransferPallets={handlePalletTransfer}
          />
        )}
        {showAirbaseModal && selectedBase && (
          <AirbaseDetailModal
            base={selectedBase}
            flights={splitFlights}
            onClose={() => setShowAirbaseModal(false)}
            onFlightsChange={onFlightsChange}
          />
        )}
        {showAddBaseModal && (
          <AddAirbaseModal
            onAdd={handleAddAirbase}
            onClose={() => {
              setShowAddBaseModal(false);
              setActiveTool(null);
              setPendingNodePosition(null);
            }}
          />
        )}
        {showAddFlightModal && (
          <AddFlightModal
            onAdd={handleAddFlight}
            onClose={() => {
              setShowAddFlightModal(false);
              setActiveTool(null);
              setPendingNodePosition(null);
            }}
            existingAircraft={splitFlights.map(f => ({
              id: f.aircraft_id,
              type: f.aircraft_type,
              callsign: f.callsign,
              destinationBaseId: f.destination.base_id,
            })).filter((v, i, arr) => arr.findIndex(a => a.id === v.id) === i)}
            getAvailableCargoAtBase={(baseId: string) => {
              const base = MILITARY_BASES.find(b => b.base_id === baseId);
              if (!base) return null;
              
              const incomingFlights = splitFlights.filter(f => f.destination.base_id === baseId);
              const outgoingFlights = splitFlights.filter(f => f.origin.base_id === baseId);
              
              const outgoingPalletIds = new Set(outgoingFlights.flatMap(f => f.pallets.map(p => p.pallet.id)));
              
              const availablePallets: Array<{ id: string; description: string; weight: number; fromFlightCallsign: string }> = [];
              for (const flight of incomingFlights) {
                for (const pallet of flight.pallets) {
                  if (!outgoingPalletIds.has(pallet.pallet.id)) {
                    const weight = pallet.pallet.items.reduce((sum, i) => sum + i.weight_each_lb * i.quantity, 0);
                    const description = pallet.pallet.items[0]?.description || `Pallet ${pallet.pallet.id.slice(0, 8)}`;
                    availablePallets.push({
                      id: pallet.pallet.id,
                      description,
                      weight,
                      fromFlightCallsign: flight.callsign
                    });
                  }
                }
              }
              
              if (availablePallets.length === 0) return null;
              
              return {
                baseId,
                baseName: base.icao,
                pallets: availablePallets
              };
            }}
          />
        )}
        {showSplitModal && flightToSplit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setShowSplitModal(false);
              setFlightToSplit(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FiScissors className="text-orange-600" size={20} />
                  <h2 className="font-bold text-lg">Split Flight</h2>
                </div>
                <button
                  onClick={() => {
                    setShowSplitModal(false);
                    setFlightToSplit(null);
                  }}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <FiX size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-neutral-600">
                  Split <span className="font-semibold text-neutral-900">{flightToSplit.callsign}</span> into two flights?
                </p>
                <div className="bg-neutral-50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Total Pallets:</span>
                    <span className="font-medium">{flightToSplit.pallets.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">First Flight Gets:</span>
                    <span className="font-medium">{Math.ceil(flightToSplit.pallets.length / 2)} pallets</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Second Flight Gets:</span>
                    <span className="font-medium">{Math.floor(flightToSplit.pallets.length / 2)} pallets</span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  Rolling stock and passengers will remain with the original flight.
                </p>
              </div>
              <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowSplitModal(false);
                    setFlightToSplit(null);
                  }}
                  className="px-4 py-2 text-neutral-600 hover:text-neutral-900 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSplit}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <FiScissors size={14} />
                  Split Flight
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

interface FlightDetailModalProps {
  flight: SplitFlight;
  insights: AIInsight[];
  allFlights: SplitFlight[];
  onClose: () => void;
  onTransferPallets?: (sourceFlight: SplitFlight, targetFlightId: string, palletIds: string[]) => void;
}

function FlightDetailModal({ flight, insights, allFlights, onClose, onTransferPallets }: FlightDetailModalProps) {
  const [selectedPallets, setSelectedPallets] = useState<Set<string>>(new Set());
  const [targetFlightId, setTargetFlightId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferPanel, setShowTransferPanel] = useState(false);
  
  // Show all other flights as potential transfer targets
  const availableTransferFlights = allFlights.filter(f => f.id !== flight.id);
  
  const hasAvailableFlights = availableTransferFlights.length > 0;
  
  const handleTogglePallet = (palletId: string) => {
    const newSelected = new Set(selectedPallets);
    if (newSelected.has(palletId)) {
      newSelected.delete(palletId);
    } else {
      newSelected.add(palletId);
    }
    setSelectedPallets(newSelected);
  };
  
  const handleTransfer = async () => {
    if (!targetFlightId || selectedPallets.size === 0 || !onTransferPallets) return;
    setIsTransferring(true);
    await new Promise(resolve => setTimeout(resolve, 1200));
    onTransferPallets(flight, targetFlightId, Array.from(selectedPallets));
    setIsTransferring(false);
    setSelectedPallets(new Set());
    setShowTransferPanel(false);
  };
  const validation = validateFlightLoad(flight);
  const distanceResult = calculateGreatCircleDistance(
    flight.origin.latitude_deg, flight.origin.longitude_deg,
    flight.destination.latitude_deg, flight.destination.longitude_deg
  );
  const distance = distanceResult.distance_nm;
  const timeResult = calculateTimeEnRoute(distance, flight.aircraft_type);
  const timeHours = timeResult.time_enroute_hr;
  const fuelLb = calculateFuelRequired(distance, flight.aircraft_type);
  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
  const utilization = (calculateFlightWeight(flight) / maxPayload) * 100;

  const isHazmat = flight.pallets.some(p => p.pallet.hazmat_flag);
  const isAdvon = flight.pallets.some(p => 
    p.pallet.items.some(i => i.advon_flag || i.description?.toLowerCase().includes('advon'))
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-6 border-b ${isHazmat ? 'bg-yellow-50' : isAdvon ? 'bg-orange-50' : 'bg-blue-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MdFlight className={`text-3xl ${flight.aircraft_type === 'C-17' ? 'text-blue-600' : 'text-green-600'}`} />
              <div>
                <h2 className="text-xl font-bold text-neutral-900">{flight.display_name || flight.callsign}</h2>
                <p className="text-neutral-600">{flight.aircraft_type} | {flight.origin.icao} to {flight.destination.icao}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>
          {(isHazmat || isAdvon) && (
            <div className="flex gap-2 mt-3">
              {isHazmat && (
                <span className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                  <FiAlertTriangle size={14} /> HAZMAT Materials
                </span>
              )}
              {isAdvon && (
                <span className="bg-orange-200 text-orange-800 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                  <FiZap size={14} /> ADVON Priority
                </span>
              )}
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-neutral-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-neutral-900">{flight.pallets.length}</div>
              <div className="text-sm text-neutral-500">Pallets</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-neutral-900">{Math.round(calculateFlightWeight(flight) / 1000)}K</div>
              <div className="text-sm text-neutral-500">Weight (lb)</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-neutral-900">{flight.pax_count}</div>
              <div className="text-sm text-neutral-500">Passengers</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${utilization > 95 ? 'text-red-600' : 'text-green-600'}`}>{utilization.toFixed(0)}%</div>
              <div className="text-sm text-neutral-500">Utilization</div>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-neutral-900 mb-3">Route Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="text-2xl font-bold text-blue-700">{Math.round(distance)}</div>
                <div className="text-sm text-blue-600">Nautical Miles</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <div className="text-2xl font-bold text-green-700">{timeHours.toFixed(1)}</div>
                <div className="text-sm text-green-600">Hours En Route</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4">
                <div className="text-2xl font-bold text-amber-700">{Math.round(fuelLb / 1000)}K</div>
                <div className="text-sm text-amber-600">Fuel (lb)</div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-neutral-900">Cargo Manifest</h3>
              {onTransferPallets && (
                <button
                  onClick={() => setShowTransferPanel(!showTransferPanel)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    showTransferPanel 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  <FiSend size={14} /> Transfer Pallets
                </button>
              )}
            </div>
            
            {showTransferPanel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-blue-800 mb-1">Transfer to:</label>
                    <select
                      value={targetFlightId}
                      onChange={(e) => setTargetFlightId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <option value="">
                        {hasAvailableFlights ? 'Select target flight...' : 'No other flights available'}
                      </option>
                      {availableTransferFlights.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.callsign} ({f.aircraft_type}) - {f.pallets.length} pallets
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleTransfer}
                    disabled={!targetFlightId || selectedPallets.size === 0 || isTransferring}
                    className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                      targetFlightId && selectedPallets.size > 0 && !isTransferring
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    }`}
                  >
                    {isTransferring ? (
                      <>
                        <FiRefreshCw className="animate-spin" size={16} />
                        Transferring...
                      </>
                    ) : (
                      <>
                        <FiSend size={16} />
                        Transfer {selectedPallets.size > 0 ? `(${selectedPallets.size})` : ''}
                      </>
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-blue-600">
                    {selectedPallets.size === 0 
                      ? 'Click checkboxes below to select pallets for transfer.' 
                      : `${selectedPallets.size} pallet(s) selected for transfer.`}
                  </p>
                  <button
                    onClick={() => {
                      if (selectedPallets.size === flight.pallets.length) {
                        setSelectedPallets(new Set());
                      } else {
                        setSelectedPallets(new Set(flight.pallets.map(p => p.pallet.id)));
                      }
                    }}
                    className="text-xs px-2 py-1 bg-blue-200 hover:bg-blue-300 text-blue-800 rounded font-medium transition-colors"
                  >
                    {selectedPallets.size === flight.pallets.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </motion.div>
            )}
            
            <div className="bg-neutral-50 rounded-xl p-4 max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b">
                    {showTransferPanel && <th className="pb-2 w-8"></th>}
                    <th className="pb-2">Pallet ID</th>
                    <th className="pb-2">Items</th>
                    <th className="pb-2 text-right">Weight</th>
                    <th className="pb-2 text-right">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {flight.pallets.map((p, idx) => (
                    <tr 
                      key={idx} 
                      className={`border-b border-neutral-100 transition-colors ${
                        showTransferPanel ? 'cursor-pointer hover:bg-blue-50' : ''
                      } ${selectedPallets.has(p.pallet.id) ? 'bg-blue-100' : ''}`}
                      onClick={() => showTransferPanel && handleTogglePallet(p.pallet.id)}
                    >
                      {showTransferPanel && (
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={selectedPallets.has(p.pallet.id)}
                            onChange={() => handleTogglePallet(p.pallet.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                        </td>
                      )}
                      <td className="py-2 font-medium">{p.pallet.id}</td>
                      <td className="py-2 text-neutral-600">{p.pallet.items.length} items</td>
                      <td className="py-2 text-right">{p.pallet.gross_weight.toLocaleString()} lb</td>
                      <td className="py-2 text-right">
                        {p.pallet.hazmat_flag && <FiAlertTriangle className="text-yellow-600 inline" size={14} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!validation.valid && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
                <FiAlertCircle size={16} /> Validation Issues
              </h3>
              <ul className="space-y-1 text-sm text-red-700">
                {validation.issues.map((issue, idx) => (
                  <li key={idx}>• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {insights.length > 0 && (
            <div>
              <h3 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <FiCpu size={16} className="text-blue-600" /> AI Insights
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
                    <div className="opacity-80">{insight.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

interface AirbaseDetailModalProps {
  base: MilitaryBase;
  flights: SplitFlight[];
  onClose: () => void;
  onFlightsChange?: (flights: SplitFlight[]) => void;
}

function AirbaseDetailModal({ base, flights, onClose, onFlightsChange }: AirbaseDetailModalProps) {
  const weather = getBaseWeather(base);
  const incomingFlights = flights.filter(f => f.destination.base_id === base.base_id);
  const outgoingFlights = flights.filter(f => f.origin.base_id === base.base_id);

  // Draft state for pallet assignments during editing
  const [draftPalletAssignments, setDraftPalletAssignments] = useState<Map<string, { flightId: string; pallet: typeof outgoingFlights[0]['pallets'][0] }[]>>(() => {
    const map = new Map();
    outgoingFlights.forEach(f => {
      map.set(f.id, f.pallets.map(p => ({ flightId: f.id, pallet: p })));
    });
    return map;
  });

  // Draft state for rolling stock assignments
  const [draftRollingAssignments, setDraftRollingAssignments] = useState<Map<string, { flightId: string; item: typeof outgoingFlights[0]['rolling_stock'][0] }[]>>(() => {
    const map = new Map();
    outgoingFlights.forEach(f => {
      map.set(f.id, f.rolling_stock.map(r => ({ flightId: f.id, item: r })));
    });
    return map;
  });

  const [draggedItem, setDraggedItem] = useState<{ itemId: string; sourceFlightId: string; type: 'pallet' | 'rolling' } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showTransferMode, setShowTransferMode] = useState(false);

  const tempF = weather.temperature_c !== null ? Math.round(weather.temperature_c * 9 / 5 + 32) : null;

  // Handle drag start for pallets
  const handlePalletDragStart = (e: React.DragEvent, palletId: string, sourceFlightId: string) => {
    e.dataTransfer.setData('itemId', palletId);
    e.dataTransfer.setData('sourceFlightId', sourceFlightId);
    e.dataTransfer.setData('itemType', 'pallet');
    setDraggedItem({ itemId: palletId, sourceFlightId, type: 'pallet' });
  };

  // Handle drag start for rolling stock
  const handleRollingDragStart = (e: React.DragEvent, itemId: string, sourceFlightId: string) => {
    e.dataTransfer.setData('itemId', itemId);
    e.dataTransfer.setData('sourceFlightId', sourceFlightId);
    e.dataTransfer.setData('itemType', 'rolling');
    setDraggedItem({ itemId, sourceFlightId, type: 'rolling' });
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetFlightId: string) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('itemId');
    const sourceFlightId = e.dataTransfer.getData('sourceFlightId');
    const itemType = e.dataTransfer.getData('itemType') as 'pallet' | 'rolling';
    
    if (sourceFlightId === targetFlightId) {
      setDraggedItem(null);
      return;
    }

    if (itemType === 'pallet') {
      // Move pallet from source to target
      setDraftPalletAssignments(prev => {
        const newMap = new Map(prev);
        const sourcePallets = [...(newMap.get(sourceFlightId) || [])];
        const targetPallets = [...(newMap.get(targetFlightId) || [])];
        
        const palletIndex = sourcePallets.findIndex(p => p.pallet.pallet.id === itemId);
        if (palletIndex === -1) return prev;
        
        const [movedPallet] = sourcePallets.splice(palletIndex, 1);
        movedPallet.flightId = targetFlightId;
        targetPallets.push(movedPallet);
        
        newMap.set(sourceFlightId, sourcePallets);
        newMap.set(targetFlightId, targetPallets);
        
        return newMap;
      });
    } else {
      // Move rolling stock from source to target
      setDraftRollingAssignments(prev => {
        const newMap = new Map(prev);
        const sourceItems = [...(newMap.get(sourceFlightId) || [])];
        const targetItems = [...(newMap.get(targetFlightId) || [])];
        
        const itemIndex = sourceItems.findIndex(r => String(r.item.item_id) === itemId);
        if (itemIndex === -1) return prev;
        
        const [movedItem] = sourceItems.splice(itemIndex, 1);
        movedItem.flightId = targetFlightId;
        targetItems.push(movedItem);
        
        newMap.set(sourceFlightId, sourceItems);
        newMap.set(targetFlightId, targetItems);
        
        return newMap;
      });
    }
    
    setHasChanges(true);
    setDraggedItem(null);
  };

  // Apply changes to actual flights
  const handleApplyChanges = () => {
    if (!onFlightsChange) return;
    
    const updatedFlights = flights.map(f => {
      const draftPallets = draftPalletAssignments.get(f.id);
      const draftRolling = draftRollingAssignments.get(f.id);
      
      const newPallets = draftPallets ? draftPallets.map((dp, idx) => ({
        ...dp.pallet,
        position: idx + 1,
      })) : f.pallets;
      
      const newRollingStock = draftRolling ? draftRolling.map(dr => dr.item) : f.rolling_stock;
      
      const newWeight = newPallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0) + 
        newRollingStock.reduce((sum, r) => sum + r.weight, 0);
      
      return {
        ...f,
        pallets: newPallets,
        rolling_stock: newRollingStock,
        total_weight_lb: newWeight,
        center_of_balance_percent: calculateCenterOfBalance({ ...f, pallets: newPallets, rolling_stock: newRollingStock }),
      };
    });
    
    onFlightsChange(updatedFlights);
    setHasChanges(false);
    onClose();
  };

  // Reset changes
  const handleReset = () => {
    const palletMap = new Map();
    const rollingMap = new Map();
    outgoingFlights.forEach(f => {
      palletMap.set(f.id, f.pallets.map(p => ({ flightId: f.id, pallet: p })));
      rollingMap.set(f.id, f.rolling_stock.map(r => ({ flightId: f.id, item: r })));
    });
    setDraftPalletAssignments(palletMap);
    setDraftRollingAssignments(rollingMap);
    setHasChanges(false);
  };

  // Get flight stats from draft
  const getFlightStats = (flightId: string) => {
    const pallets = draftPalletAssignments.get(flightId) || [];
    const rolling = draftRollingAssignments.get(flightId) || [];
    const palletWeight = pallets.reduce((sum, p) => sum + p.pallet.pallet.gross_weight, 0);
    const rollingWeight = rolling.reduce((sum, r) => sum + r.item.weight, 0);
    const flight = outgoingFlights.find(f => f.id === flightId);
    const maxPayload = flight?.aircraft_type === 'C-17' ? 170900 : 42000;
    return { 
      palletCount: pallets.length, 
      rollingCount: rolling.length,
      weight: palletWeight + rollingWeight, 
      maxPayload 
    };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-hidden ${showTransferMode ? 'max-w-6xl' : 'max-w-2xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MdLocalAirport className="text-3xl text-green-600" />
              <div>
                <h2 className="text-xl font-bold text-neutral-900">{base.icao}</h2>
                <p className="text-neutral-600">{base.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {outgoingFlights.length > 1 && (
                <button
                  onClick={() => setShowTransferMode(!showTransferMode)}
                  className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${
                    showTransferMode 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  <FiPackage size={16} />
                  {showTransferMode ? 'Hide Transfer Mode' : 'Transfer Cargo'}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center transition-colors"
              >
                <FiX size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {!showTransferMode ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-neutral-900">{(base.runway_length_ft / 1000).toFixed(1)}K</div>
                  <div className="text-sm text-neutral-500">Runway (ft)</div>
                </div>
                <div className="bg-neutral-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-neutral-900">{base.country}</div>
                  <div className="text-sm text-neutral-500">Country</div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-neutral-900 mb-3">Current Weather</h3>
                <div className={`rounded-xl p-4 ${
                  weather.conditions === 'VFR' ? 'bg-green-50' :
                  weather.conditions === 'MVFR' ? 'bg-yellow-50' :
                  weather.conditions === 'IFR' ? 'bg-orange-50' : 'bg-red-50'
                }`}>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      {tempF !== null ? (
                        <div className="text-2xl font-bold">{tempF}°F</div>
                      ) : (
                        <div className="text-2xl font-bold text-red-500">N/A</div>
                      )}
                      <div className="text-sm text-neutral-600">Temperature</div>
                    </div>
                    <div>
                      {weather.wind_speed_kt !== null ? (
                        <div className="text-2xl font-bold">{weather.wind_speed_kt} kts</div>
                      ) : (
                        <div className="text-2xl font-bold text-red-500">N/A</div>
                      )}
                      <div className="text-sm text-neutral-600">Wind</div>
                    </div>
                    <div>
                      {weather.visibility_sm !== null ? (
                        <div className="text-2xl font-bold">{weather.visibility_sm} sm</div>
                      ) : (
                        <div className="text-2xl font-bold text-red-500">N/A</div>
                      )}
                      <div className="text-sm text-neutral-600">Visibility</div>
                    </div>
                    <div>
                      {weather.conditions !== null ? (
                        <div className={`text-2xl font-bold ${
                          weather.conditions === 'VFR' ? 'text-green-600' :
                          weather.conditions === 'MVFR' ? 'text-yellow-600' :
                          weather.conditions === 'IFR' ? 'text-orange-600' : 'text-red-600'
                        }`}>{weather.conditions}</div>
                      ) : (
                        <div className="text-2xl font-bold text-red-500">N/A</div>
                      )}
                      <div className="text-sm text-neutral-600">Conditions</div>
                    </div>
                  </div>
                </div>
              </div>

              {outgoingFlights.length > 0 && (
                <div>
                  <h3 className="font-bold text-neutral-900 mb-3">Departing Flights ({outgoingFlights.length})</h3>
                  <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                    {outgoingFlights.map(f => (
                      <div key={f.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                        <div>
                          <div className="font-medium">{f.display_name || f.callsign}</div>
                          <div className="text-sm text-neutral-500">to {f.destination.icao}</div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-neutral-600">{f.pallets.length} pallets</div>
                          <div className="text-neutral-500">{Math.round(calculateFlightWeight(f) / 1000)}K lb</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {incomingFlights.length > 0 && (
                <div>
                  <h3 className="font-bold text-neutral-900 mb-3">Arriving Flights ({incomingFlights.length})</h3>
                  <div className="bg-green-50 rounded-xl p-4 space-y-2">
                    {incomingFlights.map(f => (
                      <div key={f.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                        <div>
                          <div className="font-medium">{f.display_name || f.callsign}</div>
                          <div className="text-sm text-neutral-500">from {f.origin.icao}</div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-neutral-600">{f.pallets.length} pallets</div>
                          <div className="text-neutral-500">{Math.round(calculateFlightWeight(f) / 1000)}K lb</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-neutral-900">Drag Pallets Between Flights</h3>
                  <p className="text-sm text-neutral-500">Drag and drop pallets to reassign them to different flights</p>
                </div>
                {hasChanges && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReset}
                      className="px-3 py-1.5 text-neutral-600 hover:text-neutral-900 text-sm font-medium"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleApplyChanges}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      <FiCheck size={14} />
                      Apply Changes
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(outgoingFlights.length, 3)}, 1fr)` }}>
                {outgoingFlights.map(flight => {
                  const stats = getFlightStats(flight.id);
                  const utilizationPercent = Math.min((stats.weight / stats.maxPayload) * 100, 100);
                  const isOverweight = stats.weight > stats.maxPayload;
                  
                  return (
                    <div
                      key={flight.id}
                      className={`rounded-xl border-2 transition-all ${
                        draggedItem && draggedItem.sourceFlightId !== flight.id
                          ? 'border-blue-400 bg-blue-50/50'
                          : 'border-neutral-200 bg-neutral-50'
                      }`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, flight.id)}
                    >
                      <div className={`p-3 border-b ${flight.aircraft_type === 'C-17' ? 'bg-blue-100' : 'bg-green-100'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-neutral-900">{flight.display_name || flight.callsign}</div>
                            <div className="text-xs text-neutral-600">{flight.aircraft_type} to {flight.destination.icao}</div>
                          </div>
                          <div className={`text-xs font-medium px-2 py-1 rounded ${
                            isOverweight ? 'bg-red-200 text-red-800' : 'bg-white/80 text-neutral-700'
                          }`}>
                            {stats.palletCount}P / {stats.rollingCount}R
                          </div>
                        </div>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={isOverweight ? 'text-red-600 font-medium' : 'text-neutral-600'}>
                              {Math.round(stats.weight / 1000)}K / {Math.round(stats.maxPayload / 1000)}K lb
                            </span>
                            <span className={isOverweight ? 'text-red-600' : 'text-neutral-500'}>
                              {utilizationPercent.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all ${isOverweight ? 'bg-red-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-2 space-y-1 min-h-[120px] max-h-[300px] overflow-y-auto">
                        {/* Pallets section */}
                        {(draftPalletAssignments.get(flight.id) || []).length > 0 && (
                          <div className="text-xs font-medium text-neutral-500 mb-1 flex items-center gap-1">
                            <FiPackage size={10} /> Pallets
                          </div>
                        )}
                        {(draftPalletAssignments.get(flight.id) || []).map((item) => (
                          <div
                            key={item.pallet.pallet.id}
                            draggable
                            onDragStart={(e) => handlePalletDragStart(e, item.pallet.pallet.id, flight.id)}
                            className={`p-2 bg-white rounded-lg border cursor-move transition-all hover:shadow-md hover:border-blue-300 ${
                              draggedItem?.itemId === item.pallet.pallet.id && draggedItem?.type === 'pallet'
                                ? 'opacity-50 border-blue-400' 
                                : 'border-neutral-200'
                            } ${item.pallet.pallet.hazmat_flag ? 'ring-2 ring-yellow-400' : ''}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FiPackage size={12} className="text-neutral-400" />
                                <span className="text-xs font-medium truncate max-w-[100px]">
                                  {item.pallet.pallet.id.slice(0, 8)}
                                </span>
                                {item.pallet.pallet.hazmat_flag && (
                                  <span className="text-xs bg-yellow-100 text-yellow-800 px-1 rounded">HAZ</span>
                                )}
                              </div>
                              <span className="text-xs text-neutral-500">
                                {Math.round(item.pallet.pallet.gross_weight / 1000)}K lb
                              </span>
                            </div>
                          </div>
                        ))}
                        
                        {/* Rolling Stock section */}
                        {(draftRollingAssignments.get(flight.id) || []).length > 0 && (
                          <div className="text-xs font-medium text-neutral-500 mt-2 mb-1 flex items-center gap-1">
                            <FiTruck size={10} /> Rolling Stock
                          </div>
                        )}
                        {(draftRollingAssignments.get(flight.id) || []).map((item) => (
                          <div
                            key={String(item.item.item_id)}
                            draggable
                            onDragStart={(e) => handleRollingDragStart(e, String(item.item.item_id), flight.id)}
                            className={`p-2 bg-purple-50 rounded-lg border cursor-move transition-all hover:shadow-md hover:border-purple-300 ${
                              draggedItem?.itemId === String(item.item.item_id) && draggedItem?.type === 'rolling'
                                ? 'opacity-50 border-purple-400' 
                                : 'border-purple-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FiTruck size={12} className="text-purple-400" />
                                <span className="text-xs font-medium truncate max-w-[100px]">
                                  {item.item.item?.description?.slice(0, 15) || String(item.item.item_id).slice(0, 8)}
                                </span>
                              </div>
                              <span className="text-xs text-purple-600">
                                {Math.round(item.item.weight / 1000)}K lb
                              </span>
                            </div>
                          </div>
                        ))}

                        {(draftPalletAssignments.get(flight.id) || []).length === 0 && 
                         (draftRollingAssignments.get(flight.id) || []).length === 0 && (
                          <div className="flex items-center justify-center h-20 text-neutral-400 text-sm">
                            Drop items here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {showTransferMode && hasChanges && (
          <div className="p-4 border-t bg-amber-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800">
              <FiAlertTriangle size={16} />
              <span className="text-sm font-medium">You have unsaved changes</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-neutral-600 hover:text-neutral-900 text-sm font-medium"
              >
                Discard
              </button>
              <button
                onClick={handleApplyChanges}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
              >
                Apply Changes
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// Add Airbase Modal
interface AddAirbaseModalProps {
  onAdd: (base: MilitaryBase) => void;
  onClose: () => void;
}

function AddAirbaseModal({ onAdd, onClose }: AddAirbaseModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredBases = MILITARY_BASES.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.icao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.country.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 20);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-blue-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiMapPin className="text-blue-600" size={20} />
            <h2 className="text-lg font-bold text-neutral-900">Add Airbase</h2>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <FiX size={20} />
          </button>
        </div>
        
        <div className="p-4">
          <input
            type="text"
            placeholder="Search bases by name, ICAO, or country..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
            autoFocus
          />
        </div>
        
        <div className="px-4 pb-4 max-h-[50vh] overflow-y-auto space-y-2">
          {filteredBases.map(base => (
            <button
              key={base.base_id}
              onClick={() => onAdd(base)}
              className="w-full text-left p-3 rounded-xl border border-neutral-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-neutral-900">{base.icao}</div>
                  <div className="text-sm text-neutral-500">{base.name}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-neutral-600">{base.country}</div>
                  <div className="text-neutral-400">{(base.runway_length_ft/1000).toFixed(1)}K ft</div>
                </div>
              </div>
            </button>
          ))}
          {filteredBases.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              No bases found matching "{searchTerm}"
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Add Flight Modal
interface AvailableCargoInfo {
  baseId: string;
  baseName: string;
  pallets: Array<{ id: string; description: string; weight: number; fromFlightCallsign: string }>;
}

interface AddFlightModalProps {
  onAdd: (aircraftType: 'C-17' | 'C-130', callsign: string, reuseAircraftId?: string, selectedPalletIds?: string[]) => void;
  onClose: () => void;
  existingAircraft?: Array<{ id: string; type: 'C-17' | 'C-130'; callsign: string; destinationBaseId: string }>;
  getAvailableCargoAtBase?: (baseId: string) => AvailableCargoInfo | null;
}

function AddFlightModal({ onAdd, onClose, existingAircraft = [], getAvailableCargoAtBase }: AddFlightModalProps) {
  const [mode, setMode] = useState<'new' | 'reuse'>('new');
  const [aircraftType, setAircraftType] = useState<'C-17' | 'C-130'>('C-17');
  const [callsign, setCallsign] = useState('');
  const [selectedAircraftId, setSelectedAircraftId] = useState('');
  const [selectedPalletIds, setSelectedPalletIds] = useState<string[]>([]);

  const selectedPlane = existingAircraft.find(a => a.id === selectedAircraftId);
  const availableCargo = selectedPlane && getAvailableCargoAtBase 
    ? getAvailableCargoAtBase(selectedPlane.destinationBaseId) 
    : null;

  const handleAircraftSelect = (aircraftId: string) => {
    setSelectedAircraftId(aircraftId);
    setSelectedPalletIds([]);
    const plane = existingAircraft.find(a => a.id === aircraftId);
    if (plane) {
      setCallsign(plane.callsign);
    }
  };

  const togglePallet = (palletId: string) => {
    setSelectedPalletIds(prev => 
      prev.includes(palletId) 
        ? prev.filter(id => id !== palletId)
        : [...prev, palletId]
    );
  };

  const handleSubmit = () => {
    if (mode === 'new') {
      if (!callsign.trim()) return;
      onAdd(aircraftType, callsign.trim().toUpperCase());
    } else {
      if (!selectedAircraftId || !callsign.trim()) return;
      const plane = existingAircraft.find(a => a.id === selectedAircraftId);
      if (plane) {
        onAdd(plane.type, callsign.trim().toUpperCase(), selectedAircraftId, selectedPalletIds.length > 0 ? selectedPalletIds : undefined);
      }
    }
  };

  const isValid = mode === 'new' 
    ? callsign.trim().length > 0 
    : selectedAircraftId && callsign.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-green-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MdFlight className="text-green-600" size={20} />
            <h2 className="text-lg font-bold text-neutral-900">Add Flight</h2>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <FiX size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {existingAircraft.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Aircraft Selection</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode('new')}
                  className={`p-2 rounded-xl border-2 transition-all text-sm ${
                    mode === 'new'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-neutral-200 hover:border-green-200'
                  }`}
                >
                  <div className="font-bold">New Plane</div>
                </button>
                <button
                  onClick={() => setMode('reuse')}
                  className={`p-2 rounded-xl border-2 transition-all text-sm ${
                    mode === 'reuse'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-neutral-200 hover:border-purple-200'
                  }`}
                >
                  <div className="font-bold">Reuse Plane</div>
                </button>
              </div>
            </div>
          )}

          {mode === 'reuse' && existingAircraft.length > 0 ? (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Select Existing Aircraft</label>
              <select
                value={selectedAircraftId}
                onChange={(e) => handleAircraftSelect(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
              >
                <option value="">Select an aircraft...</option>
                {existingAircraft.map(aircraft => (
                  <option key={aircraft.id} value={aircraft.id}>
                    {aircraft.callsign} ({aircraft.type})
                  </option>
                ))}
              </select>
              {selectedAircraftId && (
                <div className="mt-2 p-2 bg-purple-50 rounded-lg text-xs text-purple-700">
                  <FiRepeat className="inline mr-1" size={12} />
                  This plane will continue from its last destination
                </div>
              )}
              {availableCargo && availableCargo.pallets.length > 0 && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Available Cargo at {availableCargo.baseName}
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-neutral-200 rounded-xl p-2 space-y-1">
                    {availableCargo.pallets.map(pallet => (
                      <label
                        key={pallet.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                          selectedPalletIds.includes(pallet.id)
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-neutral-50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPalletIds.includes(pallet.id)}
                          onChange={() => togglePallet(pallet.id)}
                          className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1 text-xs">
                          <div className="font-medium text-neutral-900 truncate">{pallet.description}</div>
                          <div className="text-neutral-500">{pallet.weight.toLocaleString()} lb • from {pallet.fromFlightCallsign}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedPalletIds.length > 0 && (
                    <div className="mt-1 text-xs text-blue-600">
                      {selectedPalletIds.length} pallet(s) selected
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Aircraft Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAircraftType('C-17')}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    aircraftType === 'C-17'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-neutral-200 hover:border-blue-200'
                  }`}
                >
                  <div className="font-bold">C-17</div>
                  <div className="text-xs text-neutral-500">Globemaster III</div>
                </button>
                <button
                  onClick={() => setAircraftType('C-130')}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    aircraftType === 'C-130'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-neutral-200 hover:border-green-200'
                  }`}
                >
                  <div className="font-bold">C-130</div>
                  <div className="text-xs text-neutral-500">Hercules</div>
                </button>
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              {mode === 'reuse' ? 'New Leg Callsign' : 'Callsign'}
            </label>
            <input
              type="text"
              placeholder="e.g., REACH01"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 uppercase"
              autoFocus
            />
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className={`w-full py-3 rounded-xl font-bold transition-all ${
              isValid
                ? mode === 'reuse' 
                  ? 'bg-purple-500 hover:bg-purple-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
            }`}
          >
            {mode === 'reuse' ? 'Add Continuation Flight' : 'Add Flight'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function MissionFlowchartCanvas(props: MissionFlowchartCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowchartCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

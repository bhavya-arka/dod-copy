/**
 * PACAF Airlift Demo - Flowchart Graph Types
 * 
 * Graph-based data model for the Flight Manager flowchart designer.
 * Provides bi-directional adapters between mission state and React Flow graph.
 */

import { Node, Edge } from '@xyflow/react';
import { SplitFlight, calculateFlightWeight, validateFlightLoad } from './flightSplitTypes';
import { MilitaryBase, RouteLeg, AIRCRAFT_PERFORMANCE } from './routeTypes';
import { MILITARY_BASES } from './bases';
import { calculateGreatCircleDistance, calculateTimeEnRoute, calculateFuelRequired } from './routeCalculations';

export type NodeType = 'flight' | 'airbase' | 'cargo';

export interface FlightNodeData {
  [key: string]: unknown;
  nodeType: 'flight';
  flightId: string;
  callsign: string;
  displayName?: string;
  aircraftType: 'C-17' | 'C-130';
  missionDay?: string;
  summary: {
    paxCount: number;
    totalWeight: number;
    palletCount: number;
    rollingStockCount: number;
  };
  statusFlags: {
    hasWarnings: boolean;
    hasErrors: boolean;
    warningMessages: string[];
    errorMessages: string[];
    isOverloaded: boolean;
    hasHazmat: boolean;
    hasNoRoute: boolean;
  };
  originBaseId?: string;
  destinationBaseId?: string;
}

export interface AirbaseNodeData {
  [key: string]: unknown;
  nodeType: 'airbase';
  baseId: string;
  name: string;
  icao: string;
  country: string;
  runwayLengthFt: number;
  latitude: number;
  longitude: number;
  weatherSummary?: {
    conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
    windSpeed: number;
    visibility: number;
  };
  connectedFlightIds: string[];
  isOriginFor: string[];
  isDestinationFor: string[];
  isOrphan: boolean;
}

export interface CargoNodeData {
  [key: string]: unknown;
  nodeType: 'cargo';
  groupId: string;
  flightId: string;
  legIndex?: number;
  totalWeight: number;
  palletCount: number;
  priority: 'ADVON' | 'MEDICAL' | 'STANDARD';
  hasHazmat: boolean;
}

export interface RouteLegEdgeData {
  [key: string]: unknown;
  edgeType: 'route';
  flightId: string;
  legIndex: number;
  fromBaseId: string;
  toBaseId: string;
  distanceNm: number;
  distanceKm: number;
  timeEnrouteHr: number;
  blockTimeHr: number;
  fuelRequiredLb: number;
  aircraftType: 'C-17' | 'C-130';
}

export interface SplitEdgeData {
  [key: string]: unknown;
  edgeType: 'split';
  parentFlightId: string;
  childFlightId: string;
}

export type FlightGraphNode = Node<FlightNodeData, 'flight'>;
export type AirbaseGraphNode = Node<AirbaseNodeData, 'airbase'>;
export type CargoGraphNode = Node<CargoNodeData, 'cargo'>;
export type GraphNode = FlightGraphNode | AirbaseGraphNode | CargoGraphNode;

export type RouteLegGraphEdge = Edge<RouteLegEdgeData>;
export type SplitGraphEdge = Edge<SplitEdgeData>;
export type GraphEdge = RouteLegGraphEdge | SplitGraphEdge;

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isDirty: boolean;
}

export interface MissionGraphState {
  flights: SplitFlight[];
  airbasesOnCanvas: string[];
  routeLegs: Map<string, RouteLegEdgeData[]>;
}

export function createFlightNode(
  flight: SplitFlight,
  position: { x: number; y: number }
): FlightGraphNode {
  const weight = calculateFlightWeight(flight);
  const validation = validateFlightLoad(flight);
  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
  
  const errorMessages: string[] = [];
  const warningMessages: string[] = [];
  
  if (weight > maxPayload) {
    errorMessages.push(`Overweight: ${Math.round((weight - maxPayload) / 1000)}K lbs over limit`);
  } else if (weight > maxPayload * 0.95) {
    warningMessages.push(`Near capacity: ${Math.round((weight / maxPayload) * 100)}%`);
  }
  
  const hasNoRoute = !flight.origin || !flight.destination || 
    flight.origin.base_id === flight.destination.base_id;
  
  if (hasNoRoute) {
    warningMessages.push('No valid route assigned');
  }
  
  const hasHazmat = flight.pallets.some(p => p.pallet.hazmat_flag);
  
  return {
    id: `flight-${flight.id}`,
    type: 'flight',
    position,
    data: {
      nodeType: 'flight',
      flightId: flight.id,
      callsign: flight.callsign,
      displayName: flight.display_name,
      aircraftType: flight.aircraft_type,
      summary: {
        paxCount: flight.pax_count,
        totalWeight: weight,
        palletCount: flight.pallets.length,
        rollingStockCount: flight.rolling_stock.length,
      },
      statusFlags: {
        hasWarnings: warningMessages.length > 0,
        hasErrors: errorMessages.length > 0 || !validation.valid,
        warningMessages,
        errorMessages: [...errorMessages, ...validation.issues],
        isOverloaded: weight > maxPayload,
        hasHazmat,
        hasNoRoute,
      },
      originBaseId: flight.origin?.base_id,
      destinationBaseId: flight.destination?.base_id,
    },
  };
}

export function createAirbaseNode(
  base: MilitaryBase,
  position: { x: number; y: number },
  connectedFlights: { isOrigin: string[]; isDestination: string[] }
): AirbaseGraphNode {
  const allConnected = Array.from(new Set([...connectedFlights.isOrigin, ...connectedFlights.isDestination]));
  
  return {
    id: `base-${base.base_id}`,
    type: 'airbase',
    position,
    data: {
      nodeType: 'airbase',
      baseId: base.base_id,
      name: base.name,
      icao: base.icao,
      country: base.country,
      runwayLengthFt: base.runway_length_ft,
      latitude: base.latitude_deg,
      longitude: base.longitude_deg,
      connectedFlightIds: allConnected,
      isOriginFor: connectedFlights.isOrigin,
      isDestinationFor: connectedFlights.isDestination,
      isOrphan: allConnected.length === 0,
    },
  };
}

export function createRouteLegEdge(
  flightId: string,
  legIndex: number,
  fromBase: MilitaryBase,
  toBase: MilitaryBase,
  aircraftType: 'C-17' | 'C-130'
): RouteLegGraphEdge {
  const { distance_nm, distance_km } = calculateGreatCircleDistance(
    fromBase.latitude_deg,
    fromBase.longitude_deg,
    toBase.latitude_deg,
    toBase.longitude_deg
  );
  
  const timeResult = calculateTimeEnRoute(distance_nm, aircraftType);
  const fuelRequired = calculateFuelRequired(distance_nm, aircraftType);
  
  return {
    id: `leg-${flightId}-${legIndex}`,
    source: legIndex === 0 ? `flight-${flightId}` : `base-${fromBase.base_id}`,
    target: `base-${toBase.base_id}`,
    type: 'default',
    animated: true,
    label: `${Math.round(distance_nm)}nm`,
    style: { stroke: '#3b82f6', strokeWidth: 2 },
    data: {
      edgeType: 'route',
      flightId,
      legIndex,
      fromBaseId: fromBase.base_id,
      toBaseId: toBase.base_id,
      distanceNm: distance_nm,
      distanceKm: distance_km,
      timeEnrouteHr: timeResult.time_enroute_hr,
      blockTimeHr: timeResult.block_time_hr,
      fuelRequiredLb: fuelRequired,
      aircraftType,
    },
  };
}

export function missionStateToGraph(
  flights: SplitFlight[],
  existingLayout?: Map<string, { x: number; y: number }>,
  existingNodes?: GraphNode[]
): GraphState {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const baseConnections = new Map<string, { isOrigin: string[]; isDestination: string[]; isWaypoint: string[] }>();
  const usedBases = new Set<string>();
  
  const existingNodeMap = new Map<string, GraphNode>();
  if (existingNodes) {
    existingNodes.forEach(node => {
      existingNodeMap.set(node.id, node);
    });
  }
  
  flights.forEach((flight, index) => {
    const nodeId = `flight-${flight.id}`;
    const existingNode = existingNodeMap.get(nodeId);
    const position = existingNode?.position || existingLayout?.get(nodeId) || {
      x: 50,
      y: 100 + index * 200,
    };
    nodes.push(createFlightNode(flight, position));
    
    const allStops = getFlightStops(flight);
    
    allStops.forEach((base, stopIndex) => {
      usedBases.add(base.base_id);
      const conn = baseConnections.get(base.base_id) || { isOrigin: [], isDestination: [], isWaypoint: [] };
      
      if (stopIndex === 0) {
        conn.isOrigin.push(flight.id);
      } else if (stopIndex === allStops.length - 1) {
        conn.isDestination.push(flight.id);
      } else {
        conn.isWaypoint.push(flight.id);
      }
      baseConnections.set(base.base_id, conn);
    });
    
    for (let i = 0; i < allStops.length - 1; i++) {
      const fromBase = allStops[i];
      const toBase = allStops[i + 1];
      if (fromBase.base_id !== toBase.base_id) {
        edges.push(createRouteLegEdge(
          flight.id,
          i,
          fromBase,
          toBase,
          flight.aircraft_type
        ));
      }
    }
  });
  
  const basesByColumn = new Map<number, string[]>();
  
  Array.from(usedBases).forEach(baseId => {
    const base = MILITARY_BASES.find(b => b.base_id === baseId);
    if (!base) return;
    
    const conn = baseConnections.get(baseId) || { isOrigin: [], isDestination: [], isWaypoint: [] };
    const isOnlyOrigin = conn.isOrigin.length > 0 && conn.isDestination.length === 0 && conn.isWaypoint.length === 0;
    const isOnlyDestination = conn.isOrigin.length === 0 && conn.isDestination.length > 0 && conn.isWaypoint.length === 0;
    const isWaypoint = conn.isWaypoint.length > 0;
    
    let column = 1;
    if (isOnlyOrigin) column = 0;
    if (isWaypoint) column = 1;
    if (isOnlyDestination) column = 2;
    
    const existing = basesByColumn.get(column) || [];
    existing.push(baseId);
    basesByColumn.set(column, existing);
  });
  
  basesByColumn.forEach((baseIds, column) => {
    baseIds.forEach((baseId, rowIndex) => {
      const base = MILITARY_BASES.find(b => b.base_id === baseId);
      if (!base) return;
      
      const nodeId = `base-${baseId}`;
      const existingNode = existingNodeMap.get(nodeId);
      const position = existingNode?.position || existingLayout?.get(nodeId) || {
        x: 350 + column * 300,
        y: 100 + rowIndex * 150,
      };
      
      const conn = baseConnections.get(baseId) || { isOrigin: [], isDestination: [], isWaypoint: [] };
      
      if (existingNode && existingNode.data.nodeType === 'airbase') {
        const updatedNode: AirbaseGraphNode = {
          ...existingNode as AirbaseGraphNode,
          position,
          data: {
            ...(existingNode.data as AirbaseNodeData),
            connectedFlightIds: Array.from(new Set([...conn.isOrigin, ...conn.isDestination])),
            isOriginFor: conn.isOrigin,
            isDestinationFor: conn.isDestination,
            isOrphan: conn.isOrigin.length === 0 && conn.isDestination.length === 0,
          },
        };
        nodes.push(updatedNode);
      } else {
        nodes.push(createAirbaseNode(base, position, { isOrigin: conn.isOrigin, isDestination: conn.isDestination }));
      }
    });
  });
  
  return {
    nodes,
    edges,
    selectedNodeId: null,
    selectedEdgeId: null,
    isDirty: false,
  };
}

export function getFlightStops(flight: SplitFlight): MilitaryBase[] {
  const stops: MilitaryBase[] = [];
  if (flight.origin) stops.push(flight.origin);
  if (flight.waypoints) stops.push(...flight.waypoints);
  if (flight.destination) stops.push(flight.destination);
  return stops;
}

export function setFlightStops(flight: SplitFlight, stops: MilitaryBase[]): SplitFlight {
  if (stops.length === 0) {
    return { ...flight, origin: undefined as any, destination: undefined as any, waypoints: [] };
  }
  if (stops.length === 1) {
    return { ...flight, origin: stops[0], destination: stops[0], waypoints: [] };
  }
  return {
    ...flight,
    origin: stops[0],
    destination: stops[stops.length - 1],
    waypoints: stops.slice(1, -1),
  };
}

export function graphToMissionState(
  graphState: GraphState,
  currentFlights: SplitFlight[]
): SplitFlight[] {
  const routeEdges = graphState.edges.filter(
    (e): e is RouteLegGraphEdge => (e.data as any)?.edgeType === 'route'
  );
  
  const flightLegs = new Map<string, RouteLegGraphEdge[]>();
  
  routeEdges.forEach(edge => {
    if (!edge.data) return;
    const flightId = edge.data.flightId;
    const legs = flightLegs.get(flightId) || [];
    legs.push(edge);
    flightLegs.set(flightId, legs);
  });
  
  return currentFlights.map(flight => {
    const legs = flightLegs.get(flight.id);
    if (!legs || legs.length === 0) return flight;
    
    const sortedLegs = legs.sort((a, b) => (a.data?.legIndex || 0) - (b.data?.legIndex || 0));
    
    const stops: MilitaryBase[] = [];
    sortedLegs.forEach((leg, idx) => {
      if (!leg.data) return;
      
      if (idx === 0) {
        const fromBase = MILITARY_BASES.find(b => b.base_id === leg.data!.fromBaseId);
        if (fromBase) stops.push(fromBase);
      }
      
      const toBase = MILITARY_BASES.find(b => b.base_id === leg.data!.toBaseId);
      if (toBase) stops.push(toBase);
    });
    
    if (stops.length === 0) return flight;
    
    return setFlightStops({ ...flight, is_modified: true }, stops);
  });
}

export function validateGraphState(graphState: GraphState): {
  valid: boolean;
  errors: Array<{ nodeId: string; message: string }>;
  warnings: Array<{ nodeId: string; message: string }>;
} {
  const errors: Array<{ nodeId: string; message: string }> = [];
  const warnings: Array<{ nodeId: string; message: string }> = [];
  
  const flightNodes = graphState.nodes.filter(
    (n): n is FlightGraphNode => n.data.nodeType === 'flight'
  );
  
  flightNodes.forEach(node => {
    if (node.data.statusFlags.hasNoRoute) {
      warnings.push({ nodeId: node.id, message: `${node.data.callsign}: No route assigned` });
    }
    
    if (node.data.statusFlags.isOverloaded) {
      errors.push({ nodeId: node.id, message: `${node.data.callsign}: Aircraft overloaded` });
    }
    
    node.data.statusFlags.errorMessages.forEach(msg => {
      errors.push({ nodeId: node.id, message: `${node.data.callsign}: ${msg}` });
    });
  });
  
  const airbaseNodes = graphState.nodes.filter(
    (n): n is AirbaseGraphNode => n.data.nodeType === 'airbase'
  );
  
  airbaseNodes.forEach(node => {
    if (node.data.isOrphan) {
      warnings.push({ nodeId: node.id, message: `${node.data.icao}: Not connected to any flight` });
    }
    
    const minRunway = { 'C-17': 7500, 'C-130': 5000 };
    flightNodes.forEach(flight => {
      if (
        (flight.data.originBaseId === node.data.baseId || 
         flight.data.destinationBaseId === node.data.baseId) &&
        node.data.runwayLengthFt < minRunway[flight.data.aircraftType]
      ) {
        warnings.push({
          nodeId: node.id,
          message: `${node.data.icao}: Runway may be short for ${flight.data.aircraftType}`,
        });
      }
    });
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function getFlightMetrics(flight: SplitFlight): {
  distance: number;
  timeEnroute: number;
  fuelRequired: number;
  utilizationPercent: number;
} {
  if (!flight.origin || !flight.destination) {
    return { distance: 0, timeEnroute: 0, fuelRequired: 0, utilizationPercent: 0 };
  }
  
  const { distance_nm } = calculateGreatCircleDistance(
    flight.origin.latitude_deg,
    flight.origin.longitude_deg,
    flight.destination.latitude_deg,
    flight.destination.longitude_deg
  );
  
  const timeResult = calculateTimeEnRoute(distance_nm, flight.aircraft_type);
  const fuelRequired = calculateFuelRequired(distance_nm, flight.aircraft_type);
  
  const weight = calculateFlightWeight(flight);
  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
  const utilizationPercent = (weight / maxPayload) * 100;
  
  return {
    distance: distance_nm,
    timeEnroute: timeResult.time_enroute_hr,
    fuelRequired,
    utilizationPercent: Math.min(utilizationPercent, 100),
  };
}

export function canConnectFlightToBase(
  flight: SplitFlight,
  base: MilitaryBase,
  asOrigin: boolean
): { allowed: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  const minRunway = flight.aircraft_type === 'C-17' ? 7500 : 5000;
  if (base.runway_length_ft < minRunway) {
    warnings.push(`Runway ${base.runway_length_ft}ft may be short for ${flight.aircraft_type} (recommended ${minRunway}ft)`);
  }
  
  if (asOrigin && flight.destination?.base_id === base.base_id) {
    return { allowed: false, warnings: ['Cannot set same base as origin and destination'] };
  }
  
  if (!asOrigin && flight.origin?.base_id === base.base_id) {
    return { allowed: false, warnings: ['Cannot set same base as origin and destination'] };
  }
  
  return { allowed: true, warnings };
}

/**
 * Graph Store - Centralized state management for FlightManagerFlowchart
 * 
 * Maintains stable node positions and handles reconciliation between
 * mission state changes and React Flow graph state.
 */

import { Node, Edge } from '@xyflow/react';
import { SplitFlight, calculateFlightWeight, validateFlightLoad } from './flightSplitTypes';
import { MilitaryBase } from './routeTypes';
import { MILITARY_BASES } from './bases';
import { calculateGreatCircleDistance, calculateTimeEnRoute, calculateFuelRequired } from './routeCalculations';
import {
  FlightNodeData,
  AirbaseNodeData,
  RouteLegEdgeData,
  GraphNode,
  GraphEdge,
  FlightGraphNode,
  AirbaseGraphNode,
  RouteLegGraphEdge,
} from './flowchartGraphTypes';

const STORAGE_KEY = 'flightManagerGraphLayout';
const DEBOUNCE_MS = 500;

function isStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export interface Position {
  x: number;
  y: number;
}

export interface GraphStoreState {
  positions: Map<string, Position>;
  nodes: GraphNode[];
  edges: GraphEdge[];
  lastFlightIds: Set<string>;
  lastBaseIds: Set<string>;
  layoutLoaded: boolean;
}

export function createGraphStore() {
  let state: GraphStoreState = {
    positions: new Map(),
    nodes: [],
    edges: [],
    lastFlightIds: new Set(),
    lastBaseIds: new Set(),
    layoutLoaded: false,
  };

  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  function getCanonicalFlightNodeId(flightId: string): string {
    return `flight-${flightId}`;
  }

  function getCanonicalBaseNodeId(baseId: string): string {
    return `base-${baseId}`;
  }

  function getCanonicalEdgeId(flightId: string, legIndex: number): string {
    return `edge-${flightId}-leg-${legIndex}`;
  }

  function loadLayout(): void {
    if (state.layoutLoaded) return;
    if (!isStorageAvailable()) {
      state.layoutLoaded = true;
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.positions && typeof data.positions === 'object') {
          state.positions = new Map(Object.entries(data.positions));
        }
      }
      state.layoutLoaded = true;
    } catch (e) {
      console.warn('Failed to load graph layout from storage:', e);
      state.layoutLoaded = true;
    }
  }

  function saveLayout(): void {
    if (!isStorageAvailable()) return;
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      try {
        const positionsObj: Record<string, Position> = {};
        state.positions.forEach((pos, id) => {
          positionsObj[id] = pos;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions: positionsObj }));
      } catch (e) {
        console.warn('Failed to save graph layout to storage:', e);
      }
    }, DEBOUNCE_MS);
  }

  function getPosition(nodeId: string): Position | undefined {
    return state.positions.get(nodeId);
  }

  function setPosition(nodeId: string, position: Position): void {
    state.positions.set(nodeId, position);
    const nodeIndex = state.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex !== -1) {
      state.nodes[nodeIndex] = {
        ...state.nodes[nodeIndex],
        position,
      };
    }
    saveLayout();
  }

  function createFlightNodeData(flight: SplitFlight): FlightNodeData {
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
    };
  }

  function createAirbaseNodeData(
    base: MilitaryBase,
    connectedFlights: { isOrigin: string[]; isDestination: string[] }
  ): AirbaseNodeData {
    const allConnected = Array.from(new Set([...connectedFlights.isOrigin, ...connectedFlights.isDestination]));

    return {
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
    };
  }

  function createEdgeData(
    flightId: string,
    legIndex: number,
    fromBase: MilitaryBase,
    toBase: MilitaryBase,
    aircraftType: 'C-17' | 'C-130'
  ): RouteLegEdgeData {
    const { distance_nm, distance_km } = calculateGreatCircleDistance(
      fromBase.latitude_deg,
      fromBase.longitude_deg,
      toBase.latitude_deg,
      toBase.longitude_deg
    );

    const timeResult = calculateTimeEnRoute(distance_nm, aircraftType);
    const fuelRequired = calculateFuelRequired(distance_nm, aircraftType);

    return {
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
    };
  }

  function getDefaultFlightPosition(index: number): Position {
    return {
      x: 50,
      y: 100 + index * 200,
    };
  }

  function getDefaultBasePosition(column: number, rowIndex: number): Position {
    return {
      x: 350 + column * 300,
      y: 100 + rowIndex * 150,
    };
  }

  function getFlightStops(flight: SplitFlight): MilitaryBase[] {
    const stops: MilitaryBase[] = [];
    if (flight.origin) stops.push(flight.origin);
    if (flight.waypoints) stops.push(...flight.waypoints);
    if (flight.destination) stops.push(flight.destination);
    return stops;
  }

  function syncFromMissionState(flights: SplitFlight[]): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    hasChanges: boolean;
  } {
    if (!state.layoutLoaded) {
      loadLayout();
    }
    
    const currentFlightIds = new Set(flights.map(f => f.id));
    const baseConnections = new Map<string, { isOrigin: string[]; isDestination: string[]; isWaypoint: string[] }>();
    const usedBaseIds = new Set<string>();

    flights.forEach(flight => {
      const stops = getFlightStops(flight);
      stops.forEach((base, stopIndex) => {
        usedBaseIds.add(base.base_id);
        const conn = baseConnections.get(base.base_id) || { isOrigin: [], isDestination: [], isWaypoint: [] };

        if (stopIndex === 0) {
          conn.isOrigin.push(flight.id);
        } else if (stopIndex === stops.length - 1) {
          conn.isDestination.push(flight.id);
        } else {
          conn.isWaypoint.push(flight.id);
        }
        baseConnections.set(base.base_id, conn);
      });
    });

    const existingNodeMap = new Map<string, GraphNode>();
    state.nodes.forEach(node => {
      existingNodeMap.set(node.id, node);
    });

    const newNodes: GraphNode[] = [];
    const newEdges: GraphEdge[] = [];

    flights.forEach((flight, index) => {
      const nodeId = getCanonicalFlightNodeId(flight.id);
      const existingNode = existingNodeMap.get(nodeId);

      let position: Position;
      if (existingNode) {
        position = existingNode.position;
      } else {
        position = state.positions.get(nodeId) || getDefaultFlightPosition(index);
      }

      state.positions.set(nodeId, position);

      const flightNode: FlightGraphNode = {
        id: nodeId,
        type: 'flight',
        position,
        data: createFlightNodeData(flight),
      };
      newNodes.push(flightNode);

      const stops = getFlightStops(flight);
      for (let i = 0; i < stops.length - 1; i++) {
        const fromBase = stops[i];
        const toBase = stops[i + 1];
        if (fromBase.base_id !== toBase.base_id) {
          const edgeId = getCanonicalEdgeId(flight.id, i);
          const edge: RouteLegGraphEdge = {
            id: edgeId,
            source: i === 0 ? nodeId : getCanonicalBaseNodeId(fromBase.base_id),
            target: getCanonicalBaseNodeId(toBase.base_id),
            type: 'default',
            animated: true,
            label: `${Math.round(calculateGreatCircleDistance(
              fromBase.latitude_deg,
              fromBase.longitude_deg,
              toBase.latitude_deg,
              toBase.longitude_deg
            ).distance_nm)}nm`,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
            data: createEdgeData(flight.id, i, fromBase, toBase, flight.aircraft_type),
          };
          newEdges.push(edge);
        }
      }
    });

    const basesByColumn = new Map<number, string[]>();
    Array.from(usedBaseIds).forEach(baseId => {
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

        const nodeId = getCanonicalBaseNodeId(baseId);
        const existingNode = existingNodeMap.get(nodeId);

        let position: Position;
        if (existingNode) {
          position = existingNode.position;
        } else {
          position = state.positions.get(nodeId) || getDefaultBasePosition(column, rowIndex);
        }

        state.positions.set(nodeId, position);

        const conn = baseConnections.get(baseId) || { isOrigin: [], isDestination: [], isWaypoint: [] };
        const baseNode: AirbaseGraphNode = {
          id: nodeId,
          type: 'airbase',
          position,
          data: createAirbaseNodeData(base, { isOrigin: conn.isOrigin, isDestination: conn.isDestination }),
        };
        newNodes.push(baseNode);
      });
    });

    const hasChanges =
      newNodes.length !== state.nodes.length ||
      newEdges.length !== state.edges.length ||
      !arraysEqual(Array.from(currentFlightIds), Array.from(state.lastFlightIds)) ||
      !arraysEqual(Array.from(usedBaseIds), Array.from(state.lastBaseIds));

    state.nodes = newNodes;
    state.edges = newEdges;
    state.lastFlightIds = currentFlightIds;
    state.lastBaseIds = usedBaseIds;

    return { nodes: newNodes, edges: newEdges, hasChanges };
  }

  function arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }

  function updateNodeData(nodeId: string, dataUpdates: Record<string, unknown>): void {
    const nodeIndex = state.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex !== -1) {
      const existingNode = state.nodes[nodeIndex];
      state.nodes[nodeIndex] = {
        ...existingNode,
        data: { ...existingNode.data, ...dataUpdates } as typeof existingNode.data,
      } as typeof existingNode;
    }
  }

  function applyNodeChanges(changes: any[]): GraphNode[] {
    const updatedNodes = [...state.nodes];

    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        const idx = updatedNodes.findIndex(n => n.id === change.id);
        if (idx !== -1) {
          updatedNodes[idx] = { ...updatedNodes[idx], position: change.position };
          state.positions.set(change.id, change.position);
        }
      } else if (change.type === 'dimensions' && change.dimensions) {
        const idx = updatedNodes.findIndex(n => n.id === change.id);
        if (idx !== -1) {
          updatedNodes[idx] = {
            ...updatedNodes[idx],
            measured: change.dimensions,
          };
        }
      } else if (change.type === 'select') {
        const idx = updatedNodes.findIndex(n => n.id === change.id);
        if (idx !== -1) {
          updatedNodes[idx] = { ...updatedNodes[idx], selected: change.selected };
        }
      }
    });

    state.nodes = updatedNodes;
    saveLayout();
    return updatedNodes;
  }

  function getNodes(): GraphNode[] {
    return state.nodes;
  }

  function getEdges(): GraphEdge[] {
    return state.edges;
  }

  function clearLayout(): void {
    state.positions.clear();
    state.nodes = [];
    state.edges = [];
    state.lastFlightIds.clear();
    state.lastBaseIds.clear();
    state.layoutLoaded = false;
    if (isStorageAvailable()) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
      }
    }
  }

  return {
    getPosition,
    setPosition,
    loadLayout,
    saveLayout,
    syncFromMissionState,
    updateNodeData,
    applyNodeChanges,
    getNodes,
    getEdges,
    clearLayout,
    getCanonicalFlightNodeId,
    getCanonicalBaseNodeId,
    getCanonicalEdgeId,
  };
}

export type GraphStore = ReturnType<typeof createGraphStore>;

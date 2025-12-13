import type { Node, Edge } from '@xyflow/react';
import type { DagNode, InsertDagNode, DagEdge, InsertDagEdge } from './dagApiClient';

export interface FlightNodeData {
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

export interface AirbaseNodeData {
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

export interface RouteEdgeData {
  distance: number;
  timeHours: number;
  fuelLb: number;
  flightId: string;
  isHazmat: boolean;
  isAdvon: boolean;
  [key: string]: unknown;
}

export type FlowNodeData = FlightNodeData | AirbaseNodeData;

export function reactFlowNodeToDagNode(
  node: Node,
  userId: number
): InsertDagNode {
  const data = node.data as FlowNodeData;
  const isAirbase = data.nodeType === 'airbase';
  const airbaseData = data as AirbaseNodeData;
  
  return {
    user_id: userId,
    node_type: data.nodeType,
    name: isAirbase ? airbaseData.name : (data as FlightNodeData).displayName || (data as FlightNodeData).callsign,
    icao: isAirbase ? airbaseData.icao : null,
    latitude: null,
    longitude: null,
    position_x: Math.round(node.position.x),
    position_y: Math.round(node.position.y),
    metadata: data,
  };
}

export function dagNodeToReactFlowNode(dagNode: DagNode): Node {
  const metadata = dagNode.metadata as FlowNodeData;
  const nodeType = dagNode.node_type as 'flight' | 'airbase';

  return {
    id: dagNode.id,
    type: nodeType,
    position: {
      x: dagNode.position_x,
      y: dagNode.position_y,
    },
    data: {
      ...metadata,
      nodeType,
    },
  };
}

export function reactFlowEdgeToDagEdge(
  edge: Edge,
  userId: number
): InsertDagEdge {
  const data = edge.data as RouteEdgeData | undefined;

  return {
    user_id: userId,
    parent_id: edge.source,
    child_id: edge.target,
    cargo_shared: false,
    edge_data: data ? {
      distance_nm: data.distance,
      fuel_lb: data.fuelLb,
      time_en_route: data.timeHours,
      flightId: data.flightId,
      isHazmat: data.isHazmat,
      isAdvon: data.isAdvon,
    } : {},
  };
}

export function dagEdgeToReactFlowEdge(dagEdge: DagEdge): Edge {
  const edgeData = dagEdge.edge_data as {
    distance_nm?: number;
    fuel_lb?: number;
    time_en_route?: number;
    flightId?: string;
    isHazmat?: boolean;
    isAdvon?: boolean;
  } | undefined;

  return {
    id: dagEdge.id,
    source: dagEdge.parent_id,
    target: dagEdge.child_id,
    type: 'route',
    data: edgeData ? {
      distance: edgeData.distance_nm ?? 0,
      timeHours: edgeData.time_en_route ?? 0,
      fuelLb: edgeData.fuel_lb ?? 0,
      flightId: edgeData.flightId ?? '',
      isHazmat: edgeData.isHazmat ?? false,
      isAdvon: edgeData.isAdvon ?? false,
    } as RouteEdgeData : undefined,
  };
}

export function dagNodesToReactFlowNodes(dagNodes: DagNode[]): Node[] {
  return dagNodes.map(dagNodeToReactFlowNode);
}

export function dagEdgesToReactFlowEdges(dagEdges: DagEdge[]): Edge[] {
  return dagEdges.map(dagEdgeToReactFlowEdge);
}

export function reactFlowNodesToDagNodes(
  nodes: Node[],
  userId: number
): InsertDagNode[] {
  return nodes.map((node) => reactFlowNodeToDagNode(node, userId));
}

export function reactFlowEdgesToDagEdges(
  edges: Edge[],
  userId: number
): InsertDagEdge[] {
  return edges.map((edge) => reactFlowEdgeToDagEdge(edge, userId));
}

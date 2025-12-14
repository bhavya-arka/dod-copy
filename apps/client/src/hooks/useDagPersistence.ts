/**
 * useDagPersistence Hook
 * Manages DAG (Directed Acyclic Graph) persistence for flowchart nodes and edges.
 * Extracted from MissionFlowchartCanvas for reusability.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { dagApi } from '../lib/dagApiClient';
import {
  reactFlowNodeToDagNode,
  dagNodesToReactFlowNodes,
  dagEdgesToReactFlowEdges,
} from '../lib/dagMappers';

export type DagSyncStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

export interface UseDagPersistenceOptions {
  userId: number | null;
  enabled: boolean;
  onLoadedNodes?: (nodes: Node[]) => void;
  onLoadedEdges?: (edges: Edge[]) => void;
}

export interface UseDagPersistenceResult {
  isLoading: boolean;
  syncStatus: DagSyncStatus;
  error: string | null;
  hasDagData: boolean;
  saveNode: (node: Node) => Promise<void>;
  saveEdge: (edge: Edge) => Promise<void>;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  deleteNode: (nodeId: string) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>;
  loadDagData: () => Promise<{ nodes: Node[]; edges: Edge[] } | null>;
}

export function useDagPersistence({
  userId,
  enabled,
  onLoadedNodes,
  onLoadedEdges,
}: UseDagPersistenceOptions): UseDagPersistenceResult {
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<DagSyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasDagData, setHasDagData] = useState(false);

  const positionUpdateQueue = useRef<Map<string, { x: number; y: number }>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const nodeIdMapRef = useRef<Map<string, string>>(new Map());

  const loadDagData = useCallback(async () => {
    if (!enabled || !userId) return null;

    setIsLoading(true);
    setSyncStatus('loading');
    setError(null);

    try {
      const [nodesResult, edgesResult] = await Promise.all([
        dagApi.nodes.getAll(),
        dagApi.edges.getAll(),
      ]);

      if (nodesResult.error || edgesResult.error) {
        throw new Error(nodesResult.error || edgesResult.error);
      }

      const dagNodes = nodesResult.data || [];
      const dagEdges = edgesResult.data || [];

      dagNodes.forEach(n => nodeIdMapRef.current.set(n.id, n.id));

      const flowNodes = dagNodesToReactFlowNodes(dagNodes);
      const flowEdges = dagEdgesToReactFlowEdges(dagEdges);

      setHasDagData(dagNodes.length > 0);
      setSyncStatus('idle');

      if (flowNodes.length > 0) onLoadedNodes?.(flowNodes);
      if (flowEdges.length > 0) onLoadedEdges?.(flowEdges);

      return { nodes: flowNodes, edges: flowEdges };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load DAG data';
      setError(message);
      setSyncStatus('error');
      console.error('DAG load error:', message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled, userId, onLoadedNodes, onLoadedEdges]);

  const saveNode = useCallback(async (node: Node) => {
    if (!enabled || !userId) return;

    setSyncStatus('saving');
    try {
      const dagNode = reactFlowNodeToDagNode(node, userId);
      const result = await dagApi.nodes.create(dagNode);

      if (result.error) throw new Error(result.error);
      if (result.data) {
        nodeIdMapRef.current.set(node.id, result.data.id);
      }

      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save node';
      setError(message);
      setSyncStatus('error');
      console.error('DAG save node error:', message);
    }
  }, [enabled, userId]);

  const saveEdge = useCallback(async (edge: Edge) => {
    if (!enabled || !userId) return;

    const sourceDagId = nodeIdMapRef.current.get(edge.source);
    const targetDagId = nodeIdMapRef.current.get(edge.target);

    if (!sourceDagId || !targetDagId) {
      console.warn('DAG save edge skipped: source or target node not yet saved to DAG', {
        source: edge.source,
        target: edge.target,
        sourceDagId,
        targetDagId
      });
      return;
    }

    setSyncStatus('saving');
    try {
      const dagEdge = {
        user_id: userId,
        parent_id: sourceDagId,
        child_id: targetDagId,
        cargo_shared: false,
        edge_data: edge.data ? {
          distance_nm: (edge.data as any).distance || 0,
          fuel_lb: (edge.data as any).fuelLb || 0,
          time_en_route: (edge.data as any).timeHours || 0,
          flightId: (edge.data as any).flightId || '',
          isHazmat: (edge.data as any).isHazmat || false,
          isAdvon: (edge.data as any).isAdvon || false,
        } : {},
      };

      const result = await dagApi.edges.create(dagEdge);

      if (result.error) throw new Error(result.error);

      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save edge';
      setError(message);
      setSyncStatus('error');
      console.error('DAG save edge error:', message);
    }
  }, [enabled, userId]);

  const flushPositionUpdates = useCallback(async () => {
    if (!enabled || !userId || positionUpdateQueue.current.size === 0) return;

    const updates = Array.from(positionUpdateQueue.current.entries());
    positionUpdateQueue.current.clear();

    setSyncStatus('saving');
    try {
      await Promise.all(updates.map(async ([nodeId, position]) => {
        const dagNodeId = nodeIdMapRef.current.get(nodeId);
        if (dagNodeId) {
          await dagApi.nodes.update(dagNodeId, {
            position_x: Math.round(position.x),
            position_y: Math.round(position.y),
          });
        }
      }));

      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update positions';
      setError(message);
      setSyncStatus('error');
      console.error('DAG position update error:', message);
    }
  }, [enabled, userId]);

  const updateNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    if (!enabled || !userId) return;

    positionUpdateQueue.current.set(nodeId, position);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      flushPositionUpdates();
    }, 1000);
  }, [enabled, userId, flushPositionUpdates]);

  const deleteNode = useCallback(async (nodeId: string) => {
    if (!enabled || !userId) return;

    const dagNodeId = nodeIdMapRef.current.get(nodeId);
    if (!dagNodeId) return;

    setSyncStatus('saving');
    try {
      await dagApi.nodes.delete(dagNodeId);
      nodeIdMapRef.current.delete(nodeId);

      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete node';
      setError(message);
      setSyncStatus('error');
      console.error('DAG delete node error:', message);
    }
  }, [enabled, userId]);

  const deleteEdge = useCallback(async (edgeId: string) => {
    if (!enabled || !userId) return;

    setSyncStatus('saving');
    try {
      await dagApi.edges.delete(edgeId);

      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete edge';
      setError(message);
      setSyncStatus('error');
      console.error('DAG delete edge error:', message);
    }
  }, [enabled, userId]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    isLoading,
    syncStatus,
    error,
    hasDagData,
    saveNode,
    saveEdge,
    updateNodePosition,
    deleteNode,
    deleteEdge,
    loadDagData,
  };
}

export default useDagPersistence;

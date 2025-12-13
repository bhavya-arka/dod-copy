export interface DagNode {
  id: string;
  user_id: number;
  node_type: string;
  name: string;
  icao: string | null;
  latitude: string | null;
  longitude: string | null;
  position_x: number;
  position_y: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface InsertDagNode {
  user_id: number;
  node_type: string;
  name: string;
  icao?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  position_x: number;
  position_y: number;
  metadata?: Record<string, unknown>;
}

export interface DagEdge {
  id: string;
  user_id: number;
  parent_id: string;
  child_id: string;
  cargo_shared: boolean;
  edge_data: Record<string, unknown>;
  created_at: Date;
}

export interface InsertDagEdge {
  user_id: number;
  parent_id: string;
  child_id: string;
  cargo_shared?: boolean;
  edge_data?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

async function fetchWithAuth<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.error || `Request failed with status ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export const dagNodeApi = {
  create: (node: InsertDagNode): Promise<ApiResponse<DagNode>> =>
    fetchWithAuth<DagNode>('/api/dag/nodes', {
      method: 'POST',
      body: JSON.stringify(node),
    }),

  getAll: (): Promise<ApiResponse<DagNode[]>> =>
    fetchWithAuth<DagNode[]>('/api/dag/nodes'),

  get: (id: string): Promise<ApiResponse<DagNode>> =>
    fetchWithAuth<DagNode>(`/api/dag/nodes/${id}`),

  update: (id: string, data: Partial<InsertDagNode>): Promise<ApiResponse<DagNode>> =>
    fetchWithAuth<DagNode>(`/api/dag/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string): Promise<ApiResponse<void>> =>
    fetchWithAuth<void>(`/api/dag/nodes/${id}`, { method: 'DELETE' }),

  getChildren: (id: string): Promise<ApiResponse<DagNode[]>> =>
    fetchWithAuth<DagNode[]>(`/api/dag/nodes/${id}/children`),

  getParents: (id: string): Promise<ApiResponse<DagNode[]>> =>
    fetchWithAuth<DagNode[]>(`/api/dag/nodes/${id}/parents`),

  getAncestors: (id: string): Promise<ApiResponse<DagNode[]>> =>
    fetchWithAuth<DagNode[]>(`/api/dag/nodes/${id}/ancestors`),

  getDescendants: (id: string): Promise<ApiResponse<DagNode[]>> =>
    fetchWithAuth<DagNode[]>(`/api/dag/nodes/${id}/descendants`),
};

export const dagEdgeApi = {
  create: (edge: InsertDagEdge): Promise<ApiResponse<DagEdge>> =>
    fetchWithAuth<DagEdge>('/api/dag/edges', {
      method: 'POST',
      body: JSON.stringify(edge),
    }),

  getAll: (): Promise<ApiResponse<DagEdge[]>> =>
    fetchWithAuth<DagEdge[]>('/api/dag/edges'),

  get: (id: string): Promise<ApiResponse<DagEdge>> =>
    fetchWithAuth<DagEdge>(`/api/dag/edges/${id}`),

  update: (id: string, data: Partial<InsertDagEdge>): Promise<ApiResponse<DagEdge>> =>
    fetchWithAuth<DagEdge>(`/api/dag/edges/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string): Promise<ApiResponse<void>> =>
    fetchWithAuth<void>(`/api/dag/edges/${id}`, { method: 'DELETE' }),

  validate: (
    parentId: string,
    childId: string,
    cargoShared: boolean = false
  ): Promise<ApiResponse<ValidationResult>> =>
    fetchWithAuth<ValidationResult>('/api/dag/edges/validate', {
      method: 'POST',
      body: JSON.stringify({ parent_id: parentId, child_id: childId, cargo_shared: cargoShared }),
    }),
};

export const dagApi = {
  nodes: dagNodeApi,
  edges: dagEdgeApi,
};

export default dagApi;

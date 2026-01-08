/**
 * Transport Management System API Service
 * Handles all API calls for transport operations (Air, Land, Sea)
 */

export type TransportMode = 'air' | 'land' | 'sea';
export type TransportStatus = 'draft' | 'planned' | 'loading' | 'underway' | 'completed' | 'cancelled';

export interface TransportPlan {
  id: number;
  mode: TransportMode;
  name: string;
  origin: string;
  destination: string;
  status: TransportStatus;
  departure_time?: string;
  arrival_time?: string;
  total_weight_lbs: number;
  cargo_count: number;
  created_at: string;
  updated_at?: string;
}

export interface TransportStatistics {
  totalPlans: number;
  activePlans: number;
  draft: number;
  planned: number;
  loading: number;
  underway: number;
  completed: number;
  totalWeight: number;
}

export interface CrossModalStatistics {
  air: TransportStatistics;
  land: TransportStatistics;
  sea: TransportStatistics;
}

const API_BASE = '/api/transport';

/**
 * Generic fetch wrapper with error handling and credentials
 */
async function transportFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
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
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unknown error occurred during the transport API request');
  }
}

/**
 * List all transport plans for a specific mode
 */
export async function getTransportPlans(mode: TransportMode): Promise<TransportPlan[]> {
  const response = await transportFetch<{ plans: TransportPlan[] }>(`${API_BASE}/${mode}/plans`);
  return response.plans;
}

/**
 * Get a single transport plan by ID and mode
 */
export async function getTransportPlan(mode: TransportMode, id: number): Promise<TransportPlan> {
  const response = await transportFetch<{ plan: TransportPlan }>(`${API_BASE}/${mode}/plans/${id}`);
  return response.plan;
}

/**
 * Create a new transport plan
 */
export async function createTransportPlan(mode: TransportMode, data: Partial<TransportPlan>): Promise<TransportPlan> {
  const response = await transportFetch<{ plan: TransportPlan }>(`${API_BASE}/${mode}/plans`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.plan;
}

/**
 * Update an existing transport plan
 */
export async function updateTransportPlan(mode: TransportMode, id: number, data: Partial<TransportPlan>): Promise<TransportPlan> {
  const response = await transportFetch<{ plan: TransportPlan }>(`${API_BASE}/${mode}/plans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.plan;
}

/**
 * Perform a status transition for a transport plan
 */
export async function transitionTransportStatus(
  mode: TransportMode, 
  id: number, 
  newStatus: TransportStatus
): Promise<{ success: boolean; plan: TransportPlan }> {
  return transportFetch<{ success: boolean; plan: TransportPlan }>(`${API_BASE}/${mode}/plans/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ status: newStatus }),
  });
}

/**
 * Get statistics for a specific transport mode
 */
export async function getModeStatistics(mode: TransportMode): Promise<TransportStatistics> {
  const response = await transportFetch<{ mode: string; statistics: TransportStatistics }>(`${API_BASE}/${mode}/statistics`);
  return response.statistics;
}

/**
 * Get cross-modal statistics for all transport modes
 */
export async function getCrossModalStatistics(): Promise<CrossModalStatistics> {
  const response = await transportFetch<{ statistics: CrossModalStatistics }>(`${API_BASE}/statistics`);
  return response.statistics;
}

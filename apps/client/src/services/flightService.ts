/**
 * Flight Operations API Service
 * Handles all API calls for flight plans and schedules
 */

export interface FlightSchedule {
  id: number;
  flight_plan_id: number;
  name: string;
  schedule_data: {
    callsign?: string;
    origin_icao?: string;
    destination_icao?: string;
    scheduled_departure?: string;
    scheduled_arrival?: string;
    is_modified?: boolean;
    [key: string]: any;
  };
}

export interface FlightPlan {
  id: number;
  name: string;
  status: 'draft' | 'complete' | 'planning' | 'archived';
  movement_data?: any;
  allocation_data?: any;
  total_weight_lb: number;
  movement_items_count: number;
  aircraft_count: number;
  created_at: string;
  updated_at: string;
  schedules?: FlightSchedule[];
}

const API_BASE = "/api/flight-plans";

/**
 * List all flight plans
 */
export async function getFlightPlans(): Promise<FlightPlan[]> {
  const response = await fetch(API_BASE, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch flight plans");
  return response.json();
}

/**
 * Get a single flight plan by ID
 */
export async function getFlightPlan(id: number): Promise<FlightPlan> {
  const response = await fetch(`${API_BASE}/${id}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Failed to fetch flight plan ${id}`);
  return response.json();
}

/**
 * Create a new flight plan
 */
export async function createFlightPlan(data: Partial<FlightPlan>): Promise<FlightPlan> {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create flight plan");
  }
  return response.json();
}

/**
 * Update an existing flight plan
 */
export async function updateFlightPlan(id: number, data: Partial<FlightPlan>): Promise<FlightPlan> {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update flight plan");
  }
  return response.json();
}

/**
 * Update the status of a flight plan
 */
export async function updateFlightPlanStatus(id: number, status: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update flight plan status");
  }
}

/**
 * Delete a flight plan
 */
export async function deleteFlightPlan(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete flight plan");
  }
}

/**
 * Get all schedules associated with a flight plan
 */
export async function getFlightSchedules(planId: number): Promise<FlightSchedule[]> {
  const response = await fetch(`${API_BASE}/${planId}/schedules`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Failed to fetch schedules for plan ${planId}`);
  return response.json();
}

/**
 * Create a new schedule for a flight plan
 */
export async function createFlightSchedule(planId: number, data: any): Promise<FlightSchedule> {
  const response = await fetch(`${API_BASE}/${planId}/schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create flight schedule");
  }
  return response.json();
}

/**
 * Pending air transfer awaiting flight plan assignment
 */
export interface PendingAirTransfer {
  id: number;
  source_site_id: number;
  destination_site_id: number;
  status: string;
  transport_mode: string;
  air_metadata?: {
    aircraft_type?: string;
    mission_id?: string;
    priority?: 'routine' | 'priority' | 'urgent';
  };
  total_weight_lb?: number;
  item_count?: number;
  notes?: string;
  created_at: string;
  source_site?: { id: number; code: string; name: string } | null;
  destination_site?: { id: number; code: string; name: string } | null;
}

/**
 * Get pending air transfers that need flight plan assignment
 */
export async function getPendingAirTransfers(): Promise<PendingAirTransfer[]> {
  const response = await fetch("/api/air/pending-transfers", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch pending air transfers");
  return response.json();
}

/**
 * Assign a flight plan to an air transfer
 */
export async function assignFlightPlanToTransfer(
  transferId: number,
  flightPlanId: number
): Promise<{ message: string; transfer_id: number; flight_plan_id: number; status: string }> {
  const response = await fetch(`/api/warehouse/transfers/${transferId}/assign-flight-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ flight_plan_id: flightPlanId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to assign flight plan to transfer");
  }
  return response.json();
}

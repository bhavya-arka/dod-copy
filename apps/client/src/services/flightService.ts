/**
 * Flight Operations API Service
 * Handles all API calls for flight plans and schedules
 */

import { api, ApiError } from "../lib/queryClient";

export { ApiError };

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
  return api.get<FlightPlan[]>(API_BASE);
}

/**
 * Get a single flight plan by ID
 */
export async function getFlightPlan(id: number): Promise<FlightPlan> {
  return api.get<FlightPlan>(`${API_BASE}/${id}`);
}

/**
 * Create a new flight plan
 */
export async function createFlightPlan(data: Partial<FlightPlan>): Promise<FlightPlan> {
  return api.post<FlightPlan>(API_BASE, data);
}

/**
 * Update an existing flight plan
 */
export async function updateFlightPlan(id: number, data: Partial<FlightPlan>): Promise<FlightPlan> {
  return api.put<FlightPlan>(`${API_BASE}/${id}`, data);
}

/**
 * Update the status of a flight plan
 */
export async function updateFlightPlanStatus(id: number, status: string): Promise<void> {
  await api.patch(`${API_BASE}/${id}/status`, { status });
}

/**
 * Delete a flight plan
 */
export async function deleteFlightPlan(id: number): Promise<void> {
  return api.delete(`${API_BASE}/${id}`);
}

/**
 * Get all schedules associated with a flight plan
 */
export async function getFlightSchedules(planId: number): Promise<FlightSchedule[]> {
  return api.get<FlightSchedule[]>(`${API_BASE}/${planId}/schedules`);
}

/**
 * Create a new schedule for a flight plan
 */
export async function createFlightSchedule(planId: number, data: any): Promise<FlightSchedule> {
  return api.post<FlightSchedule>(`${API_BASE}/${planId}/schedules`, data);
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
  return api.get<PendingAirTransfer[]>("/api/air/pending-transfers");
}

/**
 * Assign a flight plan to an air transfer
 */
export async function assignFlightPlanToTransfer(
  transferId: number,
  flightPlanId: number
): Promise<{ message: string; transfer_id: number; flight_plan_id: number; status: string }> {
  return api.post<{ message: string; transfer_id: number; flight_plan_id: number; status: string }>(
    `/api/warehouse/transfers/${transferId}/assign-flight-plan`,
    { flight_plan_id: flightPlanId }
  );
}

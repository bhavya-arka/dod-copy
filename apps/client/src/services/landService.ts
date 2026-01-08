/**
 * Land Logistics Service
 * Handles all API calls for land transport endpoints
 */

const API_BASE = "/api/land";

export interface VehicleType {
  id: number;
  code: string;
  name: string;
  category: string;
  payload_lbs: number;
  max_speed_mph: number;
  range_miles: number;
  fuel_type: string;
  axle_config: string;
  pallet_capacity_463l: number;
  passenger_capacity: number;
  notes: string;
}

export interface LandRoute {
  id: number;
  name: string;
  origin: string;
  destination: string;
  distance_miles: number;
  estimated_time_hours: number;
  status: string;
}

export interface ConvoyVehicle {
  id: number;
  vehicleCode: string;
  position: number;
  lane: number;
}

export interface Convoy {
  id: number;
  name: string;
  route_id?: number;
  origin: string;
  destination: string;
  status: 'draft' | 'planned' | 'loading' | 'underway' | 'completed' | 'cancelled';
  vehicle_count: number;
  total_weight_lbs: number;
  departure_time?: string;
  arrival_time?: string;
  scheduled_departure?: string;
  scheduled_arrival?: string;
  actual_departure?: string;
  actual_arrival?: string;
  vehicles?: ConvoyVehicle[];
}

export interface LandStatistics {
  totalRoutes: number;
  activeRoutes: number;
  totalConvoys: number;
  activeConvoys: number;
  inTransit: number;
  pendingConvoys: number;
  completedToday: number;
  totalPayloadLbs: number;
}

export interface LocationCoords {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distance_miles: number;
  duration_hours: number;
  polyline?: string;
}

export interface PlaceResult {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

export interface PlaceDetails {
  lat: number;
  lng: number;
  formattedAddress: string;
  name?: string;
}

export interface CreateConvoyData {
  name: string;
  origin: string;
  destination: string;
  origin_coords?: LocationCoords & { formattedAddress: string };
  destination_coords?: LocationCoords & { formattedAddress: string };
  route_id?: number;
  scheduled_departure?: string;
  scheduled_arrival?: string;
  status?: string;
  vehicle_count?: number;
  total_weight_lbs?: number;
}

export interface UpdateConvoyData {
  name?: string;
  origin?: string;
  destination?: string;
  status?: string;
  vehicle_count?: number;
  total_weight_lbs?: number;
  scheduled_departure?: string;
  scheduled_arrival?: string;
  actual_departure?: string;
  actual_arrival?: string;
  vehicles?: ConvoyVehicle[];
}

export interface CreateRouteData {
  name: string;
  origin: string;
  destination: string;
  distance_miles?: number;
  estimated_time_hours?: number;
  status?: string;
}

export interface UpdateRouteData {
  name?: string;
  origin?: string;
  destination?: string;
  distance_miles?: number;
  estimated_time_hours?: number;
  status?: string;
}

export interface AddVehicleData {
  vehicleCode: string;
  position?: number;
  lane?: number;
}

class LandServiceError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'LandServiceError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new LandServiceError(
      errorData.error || `Request failed with status ${response.status}`,
      response.status
    );
  }
  return response.json();
}

export async function getStatistics(): Promise<LandStatistics> {
  const response = await fetch(`${API_BASE}/statistics`, {
    credentials: 'include',
  });
  return handleResponse<LandStatistics>(response);
}

export async function getVehicleTypes(): Promise<VehicleType[]> {
  const response = await fetch(`${API_BASE}/vehicle-types`, {
    credentials: 'include',
  });
  return handleResponse<VehicleType[]>(response);
}

export async function getRoutes(): Promise<LandRoute[]> {
  const response = await fetch(`${API_BASE}/routes`, {
    credentials: 'include',
  });
  return handleResponse<LandRoute[]>(response);
}

export async function createRoute(data: CreateRouteData): Promise<LandRoute> {
  const response = await fetch(`${API_BASE}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<LandRoute>(response);
}

export async function updateRoute(id: number, data: UpdateRouteData): Promise<LandRoute> {
  const response = await fetch(`${API_BASE}/routes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<LandRoute>(response);
}

export async function deleteRoute(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/routes/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new LandServiceError(
      errorData.error || 'Failed to delete route',
      response.status
    );
  }
}

export async function getConvoys(): Promise<Convoy[]> {
  const response = await fetch(`${API_BASE}/convoys`, {
    credentials: 'include',
  });
  return handleResponse<Convoy[]>(response);
}

export async function getConvoy(id: number): Promise<Convoy> {
  const response = await fetch(`${API_BASE}/convoys/${id}`, {
    credentials: 'include',
  });
  return handleResponse<Convoy>(response);
}

export async function createConvoy(data: CreateConvoyData): Promise<Convoy> {
  const response = await fetch(`${API_BASE}/convoys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      ...data,
      status: data.status || 'draft',
      vehicle_count: data.vehicle_count || 0,
      total_weight_lbs: data.total_weight_lbs || 0,
    }),
  });
  return handleResponse<Convoy>(response);
}

export async function updateConvoy(id: number, data: UpdateConvoyData): Promise<Convoy> {
  const response = await fetch(`${API_BASE}/convoys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Convoy>(response);
}

export async function deleteConvoy(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/convoys/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new LandServiceError(
      errorData.error || 'Failed to delete convoy',
      response.status
    );
  }
}

export async function updateConvoyStatus(id: number, status: string): Promise<Convoy> {
  return updateConvoy(id, { status });
}

export async function addVehicleToConvoy(
  convoyId: number,
  convoy: Convoy,
  data: AddVehicleData
): Promise<Convoy> {
  const newVehicle: ConvoyVehicle = {
    id: Date.now(),
    vehicleCode: data.vehicleCode,
    position: data.position ?? (convoy.vehicles?.length || 0),
    lane: data.lane ?? 1,
  };
  
  const updatedVehicles = [...(convoy.vehicles || []), newVehicle];
  
  return updateConvoy(convoyId, {
    vehicles: updatedVehicles,
    vehicle_count: updatedVehicles.length,
  });
}

export async function removeVehicleFromConvoy(
  convoyId: number,
  convoy: Convoy,
  vehicleId: number
): Promise<Convoy> {
  const updatedVehicles = (convoy.vehicles || []).filter(v => v.id !== vehicleId);
  
  return updateConvoy(convoyId, {
    vehicles: updatedVehicles,
    vehicle_count: updatedVehicles.length,
  });
}

export async function calculateRoute(
  origin: LocationCoords,
  destination: LocationCoords
): Promise<RouteInfo> {
  const response = await fetch(`${API_BASE}/routes/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ origin, destination }),
  });
  
  const data = await handleResponse<any>(response);
  
  return {
    distance_miles: data.distance_miles || data.distanceMiles || 0,
    duration_hours: data.duration_hours || data.durationHours || 0,
    polyline: data.polyline || data.overview_polyline,
  };
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const response = await fetch(`${API_BASE}/places/autocomplete?input=${encodeURIComponent(query)}`, {
    credentials: 'include',
  });
  return handleResponse<PlaceResult[]>(response);
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const response = await fetch(`${API_BASE}/places/details?place_id=${encodeURIComponent(placeId)}`, {
    credentials: 'include',
  });
  return handleResponse<PlaceDetails>(response);
}

export async function fetchAllData(): Promise<{
  statistics: LandStatistics | null;
  vehicleTypes: VehicleType[];
  routes: LandRoute[];
  convoys: Convoy[];
}> {
  const [statsRes, vehiclesRes, routesRes, convoysRes] = await Promise.all([
    fetch(`${API_BASE}/statistics`, { credentials: 'include' }),
    fetch(`${API_BASE}/vehicle-types`, { credentials: 'include' }),
    fetch(`${API_BASE}/routes`, { credentials: 'include' }),
    fetch(`${API_BASE}/convoys`, { credentials: 'include' }),
  ]);

  return {
    statistics: statsRes.ok ? await statsRes.json() : null,
    vehicleTypes: vehiclesRes.ok ? await vehiclesRes.json() : [],
    routes: routesRes.ok ? await routesRes.json() : [],
    convoys: convoysRes.ok ? await convoysRes.json() : [],
  };
}

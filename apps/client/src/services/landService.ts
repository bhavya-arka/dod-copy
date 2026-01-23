/**
 * Land Logistics Service
 * Handles all API calls for land transport endpoints
 */

import { api, ApiError } from "../lib/queryClient";

const API_BASE = "/api/land";

export { ApiError };

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

export async function getStatistics(): Promise<LandStatistics> {
  return api.get<LandStatistics>(`${API_BASE}/statistics`);
}

export async function getVehicleTypes(): Promise<VehicleType[]> {
  return api.get<VehicleType[]>(`${API_BASE}/vehicle-types`);
}

export async function getRoutes(): Promise<LandRoute[]> {
  return api.get<LandRoute[]>(`${API_BASE}/routes`);
}

export async function createRoute(data: CreateRouteData): Promise<LandRoute> {
  return api.post<LandRoute>(`${API_BASE}/routes`, data);
}

export async function updateRoute(id: number, data: UpdateRouteData): Promise<LandRoute> {
  return api.put<LandRoute>(`${API_BASE}/routes/${id}`, data);
}

export async function deleteRoute(id: number): Promise<void> {
  return api.delete(`${API_BASE}/routes/${id}`);
}

export async function getConvoys(): Promise<Convoy[]> {
  return api.get<Convoy[]>(`${API_BASE}/convoys`);
}

export async function getConvoy(id: number): Promise<Convoy> {
  return api.get<Convoy>(`${API_BASE}/convoys/${id}`);
}

export async function createConvoy(data: CreateConvoyData): Promise<Convoy> {
  return api.post<Convoy>(`${API_BASE}/convoys`, {
    ...data,
    status: data.status || 'draft',
    vehicle_count: data.vehicle_count || 0,
    total_weight_lbs: data.total_weight_lbs || 0,
  });
}

export async function updateConvoy(id: number, data: UpdateConvoyData): Promise<Convoy> {
  return api.put<Convoy>(`${API_BASE}/convoys/${id}`, data);
}

export async function deleteConvoy(id: number): Promise<void> {
  return api.delete(`${API_BASE}/convoys/${id}`);
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
  const data = await api.post<any>(`${API_BASE}/routes/calculate`, { origin, destination });
  
  return {
    distance_miles: data.distance_miles || data.distanceMiles || 0,
    duration_hours: data.duration_hours || data.durationHours || 0,
    polyline: data.polyline || data.overview_polyline,
  };
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  return api.get<PlaceResult[]>(`${API_BASE}/places/autocomplete?input=${encodeURIComponent(query)}`);
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  return api.get<PlaceDetails>(`${API_BASE}/places/details?place_id=${encodeURIComponent(placeId)}`);
}

export interface PendingTransferItem {
  id: number;
  item_id: number;
  quantity: number;
}

export interface PendingTransfer {
  id: number;
  source_site_id: number;
  destination_site_id: number;
  source_site_name: string;
  destination_site_name: string;
  status: 'pending' | 'manifest_created' | 'in_transit' | 'completed';
  total_weight_lbs: number;
  transfer_items: PendingTransferItem[];
  created_at?: string;
  convoy_id?: number;
}

export async function getPendingTransfers(): Promise<PendingTransfer[]> {
  return api.get<PendingTransfer[]>(`${API_BASE}/pending-transfers`);
}

export async function assignConvoyToTransfer(
  transferId: number,
  convoyId: number
): Promise<{ success: boolean }> {
  return api.post<{ success: boolean }>(
    `/api/warehouse/transfers/${transferId}/assign-convoy`,
    { convoy_id: convoyId }
  );
}

export interface VehicleAllocation {
  vehicleTypeId: number;
  vehicleCode: string;
  vehicleName: string;
  payloadLbs: number;
  vehicleCount: number;
  totalCapacity: number;
}

export interface ConvoyProposal {
  transferId: number;
  convoyName: string;
  origin: string;
  destination: string;
  totalWeightLbs: number;
  itemCount: number;
  vehicleAllocations: VehicleAllocation[];
  totalVehicles: number;
  totalCapacity: number;
  utilizationPercent: number;
  scheduledDate: string | null;
  hasEstimatedWeights?: boolean;
}

export interface ProposeConvoyResponse {
  proposal: ConvoyProposal;
  hasPrioritySettings: boolean;
  warning: string | null;
  info: string | null;
}

export async function proposeConvoyForTransfer(transferId: number): Promise<ProposeConvoyResponse> {
  return api.post<ProposeConvoyResponse>(
    `/api/warehouse/transfers/${transferId}/propose-convoy`,
    {}
  );
}

export interface AutoCreateConvoyResponse {
  message: string;
  convoy: {
    id: number;
    name: string;
    origin: string;
    destination: string;
    status: string;
    vehicleCount: number;
    totalWeightLbs: number;
  };
  vehicleAllocations: VehicleAllocation[];
  transfer_id: number;
  transfer_status: string;
}

export async function autoCreateConvoyForTransfer(transferId: number): Promise<AutoCreateConvoyResponse> {
  return api.post<AutoCreateConvoyResponse>(
    `/api/warehouse/transfers/${transferId}/auto-create-convoy`,
    {}
  );
}

export async function fetchAllData(): Promise<{
  statistics: LandStatistics | null;
  vehicleTypes: VehicleType[];
  routes: LandRoute[];
  convoys: Convoy[];
  pendingTransfers: PendingTransfer[];
}> {
  const [statistics, vehicleTypes, routes, convoys, pendingTransfers] = await Promise.all([
    getStatistics().catch(() => null),
    getVehicleTypes().catch(() => []),
    getRoutes().catch(() => []),
    getConvoys().catch(() => []),
    getPendingTransfers().catch(() => []),
  ]);

  return {
    statistics,
    vehicleTypes,
    routes,
    convoys,
    pendingTransfers,
  };
}

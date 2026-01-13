/**
 * Sea Freight Service
 * Handles all API calls for MSC maritime transport endpoints
 */

const API_BASE = "/api/sea";

export interface VesselType {
  id: number;
  code: string;
  name: string;
  hull_prefix: string;
  category: string;
  cargo_capacity_lbs: number;
  teu_capacity: number;
  fuel_capacity_barrels: number;
  vehicle_capacity: number;
  lane_meters: number;
  displacement_tons: number;
  deadweight_tons: number;
  length_ft: number;
  beam_ft: number;
  draft_ft: number;
  max_speed_knots: number;
  cruise_speed_knots: number;
  range_nm: number;
  crew_size: number;
  has_crane: boolean;
  crane_capacity_tons: number;
  has_roro_capability: boolean;
  has_helicopter_deck: boolean;
  active_fleet_count: number;
  notes: string;
}

export interface Voyage {
  id: number;
  name: string;
  vessel_name?: string;
  vessel_imo?: string;
  vessel_hull_number?: string;
  vessel_class?: string;
  vessel_type_id?: number;
  origin_port: string;
  destination_port: string;
  port_calls: PortCall[];
  departure_time?: string;
  arrival_time?: string;
  scheduled_departure?: string;
  scheduled_arrival?: string;
  actual_departure?: string;
  actual_arrival?: string;
  status: 'draft' | 'planned' | 'loading' | 'underway' | 'completed' | 'cancelled';
  total_weight_lbs: number;
  container_count: number;
  cargo_count: number;
  created_at: string;
  updated_at: string;
}

export interface PortCall {
  port: string;
  eta?: string;
  etd?: string;
  purpose?: string;
}

export interface Container {
  id: number;
  voyage_id?: number;
  container_number: string;
  container_type: string;
  seal_number?: string;
  weight_lbs: number;
  tare_weight_lbs: number;
  status: 'empty' | 'loading' | 'loaded' | 'unloading' | 'discharged';
  cargo_manifest: CargoItem[];
  created_at: string;
  updated_at: string;
}

export interface CargoItem {
  id: string;
  description: string;
  quantity: number;
  weight_lbs: number;
  nsn?: string;
}

export interface SeaStatistics {
  totalVoyages: number;
  activeVoyages: number;
  inTransit: number;
  atPort: number;
  completedThisMonth: number;
  totalContainers: number;
  totalCargoLbs: number;
  pendingTransfers: number;
}

export interface CreateVoyageData {
  name: string;
  vessel_type_id?: number;
  vessel_name?: string;
  vessel_imo?: string;
  vessel_hull_number?: string;
  vessel_class?: string;
  origin_port: string;
  destination_port: string;
  port_calls?: PortCall[];
  scheduled_departure?: string;
  scheduled_arrival?: string;
  status?: string;
}

export interface UpdateVoyageData {
  name?: string;
  vessel_type_id?: number;
  vessel_name?: string;
  vessel_imo?: string;
  vessel_hull_number?: string;
  vessel_class?: string;
  origin_port?: string;
  destination_port?: string;
  port_calls?: PortCall[];
  scheduled_departure?: string;
  scheduled_arrival?: string;
  actual_departure?: string;
  actual_arrival?: string;
  status?: string;
}

export interface CreateContainerData {
  voyage_id?: number;
  container_number: string;
  container_type: string;
  seal_number?: string;
  weight_lbs?: number;
  tare_weight_lbs?: number;
  status?: string;
}

export interface UpdateContainerData {
  voyage_id?: number;
  container_number?: string;
  container_type?: string;
  seal_number?: string;
  weight_lbs?: number;
  tare_weight_lbs?: number;
  status?: string;
  cargo_manifest?: CargoItem[];
}

export interface PendingTransfer {
  id: number;
  sourceWarehouse: string;
  destinationWarehouse: string;
  sourceSiteId: number;
  destinationSiteId: number;
  itemCount: number;
  totalWeightLbs: number;
  scheduledDate: string | null;
  status: string;
  transportMode: string;
}

export interface VoyageProposal {
  transferId: number;
  voyageName: string;
  originPort: string;
  destinationPort: string;
  totalWeightLbs: number;
  itemCount: number;
  recommendedVesselTypes: VesselRecommendation[];
  estimatedCapacityPercent: number;
  scheduledDate: string | null;
  hasEstimatedWeights?: boolean;
}

export interface VesselRecommendation {
  vesselTypeId: number;
  code: string;
  name: string;
  cargoCapacityLbs: number;
  utilizationPercent: number;
  isRecommended: boolean;
}

export interface ProposeVoyageResponse {
  proposal: VoyageProposal;
  hasSufficientCapacity: boolean;
  warning: string | null;
  info: string | null;
}

export interface PortScheduleEntry {
  voyageId: number;
  voyageName: string;
  vesselName?: string;
  vesselHullNumber?: string;
  port: string;
  eventType: 'arrival' | 'departure';
  scheduledTime: string;
  actualTime?: string;
  status: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchVesselTypes(): Promise<VesselType[]> {
  const response = await fetch(`${API_BASE}/vessel-types`, {
    credentials: 'include',
  });
  return handleResponse<VesselType[]>(response);
}

export async function fetchVoyages(): Promise<Voyage[]> {
  const response = await fetch(`${API_BASE}/voyages`, {
    credentials: 'include',
  });
  return handleResponse<Voyage[]>(response);
}

export async function fetchVoyage(id: number): Promise<Voyage> {
  const response = await fetch(`${API_BASE}/voyages/${id}`, {
    credentials: 'include',
  });
  return handleResponse<Voyage>(response);
}

export async function createVoyage(data: CreateVoyageData): Promise<Voyage> {
  const response = await fetch(`${API_BASE}/voyages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Voyage>(response);
}

export async function updateVoyage(id: number, data: UpdateVoyageData): Promise<Voyage> {
  const response = await fetch(`${API_BASE}/voyages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Voyage>(response);
}

export async function updateVoyageStatus(id: number, status: string): Promise<Voyage> {
  const response = await fetch(`${API_BASE}/voyages/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status }),
  });
  return handleResponse<Voyage>(response);
}

export async function fetchStatistics(): Promise<SeaStatistics> {
  const response = await fetch(`${API_BASE}/statistics`, {
    credentials: 'include',
  });
  return handleResponse<SeaStatistics>(response);
}

export async function fetchContainers(voyageId?: number): Promise<Container[]> {
  const url = voyageId 
    ? `${API_BASE}/containers?voyage_id=${voyageId}` 
    : `${API_BASE}/containers`;
  const response = await fetch(url, {
    credentials: 'include',
  });
  return handleResponse<Container[]>(response);
}

export async function fetchContainer(id: number): Promise<Container> {
  const response = await fetch(`${API_BASE}/containers/${id}`, {
    credentials: 'include',
  });
  return handleResponse<Container>(response);
}

export async function createContainer(data: CreateContainerData): Promise<Container> {
  const response = await fetch(`${API_BASE}/containers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Container>(response);
}

export async function updateContainer(id: number, data: UpdateContainerData): Promise<Container> {
  const response = await fetch(`${API_BASE}/containers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return handleResponse<Container>(response);
}

export async function assignContainerToVoyage(containerId: number, voyageId: number): Promise<Container> {
  const response = await fetch(`${API_BASE}/containers/${containerId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ voyage_id: voyageId }),
  });
  return handleResponse<Container>(response);
}

export async function fetchPortSchedule(days: number = 30): Promise<PortScheduleEntry[]> {
  const response = await fetch(`${API_BASE}/port-schedule?days=${days}`, {
    credentials: 'include',
  });
  return handleResponse<PortScheduleEntry[]>(response);
}

export async function fetchPendingTransfers(): Promise<PendingTransfer[]> {
  const response = await fetch(`${API_BASE}/pending-transfers`, {
    credentials: 'include',
  });
  return handleResponse<PendingTransfer[]>(response);
}

export async function proposeVoyageForTransfer(transferId: number): Promise<ProposeVoyageResponse> {
  const response = await fetch(`/api/warehouse/transfers/${transferId}/propose-voyage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  return handleResponse<ProposeVoyageResponse>(response);
}

export async function autoCreateVoyage(transferId: number): Promise<{ message: string; voyage: Voyage }> {
  const response = await fetch(`/api/warehouse/transfers/${transferId}/auto-create-voyage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  return handleResponse<{ message: string; voyage: Voyage }>(response);
}

export async function assignVoyageToTransfer(transferId: number, voyageId: number): Promise<void> {
  const response = await fetch(`/api/warehouse/transfers/${transferId}/assign-voyage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ voyage_id: voyageId }),
  });
  await handleResponse<void>(response);
}

export interface AllSeaData {
  voyages: Voyage[];
  vesselTypes: VesselType[];
  containers: Container[];
  statistics: SeaStatistics;
  pendingTransfers: PendingTransfer[];
  portSchedule: PortScheduleEntry[];
}

export async function fetchAllData(): Promise<AllSeaData> {
  const [voyages, vesselTypes, containers, statistics, pendingTransfers, portSchedule] = await Promise.all([
    fetchVoyages(),
    fetchVesselTypes(),
    fetchContainers(),
    fetchStatistics(),
    fetchPendingTransfers(),
    fetchPortSchedule(),
  ]);
  
  return {
    voyages,
    vesselTypes,
    containers,
    statistics,
    pendingTransfers,
    portSchedule,
  };
}

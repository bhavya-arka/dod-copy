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

export interface TransportAsset {
  id: number;
  mode: TransportMode;
  code: string;
  name: string;
  capacity_lbs: number;
  dimensions: { length_ft: number; width_ft: number; height_ft: number };
}

export interface TransportStatistics {
  mode: TransportMode;
  total: number;
  active: number;
  draft: number;
  completed: number;
  total_weight_lbs: number;
}

export const TRANSPORT_TRANSITIONS: Record<TransportStatus, TransportStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['loading', 'cancelled'],
  loading: ['underway', 'cancelled'],
  underway: ['completed'],
  completed: [],
  cancelled: [],
};

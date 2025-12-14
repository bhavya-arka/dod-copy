# Backend API Routes Documentation

## Overview

This document describes all API endpoints available in the PACAF Airlift application. The API is built with Express.js and uses cookie-based session authentication.

## Authentication

### Session Token

Most endpoints require authentication via a session token. The token can be provided in two ways:
- **Cookie**: `session` cookie (set automatically on login/register)
- **Header**: `Authorization: Bearer <token>`

### Auth Middleware

Protected routes use the `authMiddleware` function which:
1. Extracts the session token from cookies or Authorization header
2. Validates the session against the database
3. Attaches user info (`id`, `email`) to the request object
4. Returns 401 if authentication fails

---

## Auth Routes (Public)

### POST `/api/auth/register`

Register a new user account.

**Authentication**: None

**Request Body**:
```typescript
{
  email: string;      // Valid email address
  username: string;   // Display name
  password: string;   // Min 6 characters
}
```

**Response** (201 Created):
```typescript
{
  user: {
    id: number;
    email: string;
    username: string;
  }
}
```

**Error Responses**:
- `400` - Invalid input (validation failed)
- `409` - Email already registered OR username already taken
- `500` - Internal server error

**Side Effects**: Sets `session` cookie (httpOnly, 7-day expiry)

---

### POST `/api/auth/login`

Authenticate an existing user.

**Authentication**: None

**Request Body**:
```typescript
{
  email: string;
  password: string;
}
```

**Response** (200 OK):
```typescript
{
  user: {
    id: number;
    email: string;
    username: string;
  }
}
```

**Error Responses**:
- `400` - Invalid input
- `401` - Invalid email or password
- `500` - Internal server error

**Side Effects**: Sets `session` cookie, updates `last_login_at` timestamp

---

### POST `/api/auth/logout`

End the current session.

**Authentication**: Optional (will clear session if token provided)

**Response** (204 No Content): Empty

**Side Effects**: Clears `session` cookie, deletes session from database

---

### GET `/api/auth/me`

Get current authenticated user's info.

**Authentication**: Required

**Response** (200 OK):
```typescript
{
  id: number;
  email: string;
  username: string;
}
```

**Error Responses**:
- `401` - Not authenticated
- `404` - User not found

---

## Weather API (Public)

### GET `/api/weather/status`

Get weather API cache and rate limit status.

**Authentication**: None

**Response** (200 OK):
```typescript
{
  cache: {
    size: number;      // Number of cached entries
    hits: number;      // Cache hit count
    misses: number;    // Cache miss count
    ttlMs: number;     // TTL in milliseconds (600000 = 10 min)
  };
  lastError: {
    message: string;
    timestamp: Date;
  } | null;
  rateLimitState: {
    isLimited: boolean;
    retryAfter: string | null;
    limitedAt: Date | null;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
  };
}
```

---

### GET `/api/weather/:lat/:lon`

Fetch weather data for a geographic location via NWS API proxy.

**Authentication**: None

**URL Parameters**:
- `lat` - Latitude (-90 to 90)
- `lon` - Longitude (-180 to 180)

**Response** (200 OK):
```typescript
{
  location: {
    lat: number;
    lon: number;
    city?: string;
    state?: string;
    timezone?: string;
  };
  forecast: Array<{
    name: string;
    temperature: number;
    temperatureUnit: string;
    windSpeed: string;
    shortForecast: string;
    detailedForecast: string;
  }>;
  forecastHourlyUrl?: string;
  currentConditions?: {
    temperature: { value: number; unitCode: string };
    visibility: { value: number; unitCode: string };
    // ... other NWS observation properties
  };
  generatedAt?: string;
  updateTime?: string;
  cached: boolean;
}
```

**Error Responses**:
- `400` - Invalid coordinates
- `404` - Location not supported (NWS only covers US territories)
- `429` - Rate limited by NWS API
- `500` - Internal server error
- `502` - Failed to fetch from NWS

---

## Airbases API (Public)

### POST `/api/airbases/resolve`

Resolve an airbase identifier to coordinates.

**Authentication**: None

**Request Body**:
```typescript
{
  airbaseId?: string;   // e.g., "HICKAM", "KADENA"
  icao?: string;        // e.g., "PHIK", "RODN"
  baseName?: string;    // Partial name match
  lat?: number;         // Direct coordinates
  lon?: number;
}
```

**Response** (200 OK):
```typescript
{
  resolved: true;
  source: 'coordinates' | 'database';
  base?: {
    base_id: string;
    name: string;
    icao: string;
  };
  coordinates: { lat: number; lon: number };
}
```

**Error Responses**:
- `404` - Could not resolve airbase
- `500` - Internal server error

---

## Flight Plans API (Protected)

### GET `/api/flight-plans`

List all flight plans for the authenticated user.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightPlan[]
```

---

### GET `/api/flight-plans/:id`

Get a specific flight plan.

**Authentication**: Required

**URL Parameters**:
- `id` - Flight plan ID (integer)

**Response** (200 OK):
```typescript
FlightPlan
```

**Error Responses**:
- `404` - Flight plan not found

---

### POST `/api/flight-plans`

Create a new flight plan.

**Authentication**: Required

**Request Body**:
```typescript
{
  name: string;
  status?: 'draft' | 'complete' | 'archived';
  allocation_data: object;      // AllocationResult JSON
  movement_data?: object;       // Original parsed movement items
  movement_items_count: number;
  total_weight_lb: number;
  aircraft_count: number;
}
```

**Response** (201 Created):
```typescript
FlightPlan
```

---

### PUT `/api/flight-plans/:id`

Update a flight plan.

**Authentication**: Required

**Request Body**: Partial `FlightPlan` fields

**Response** (200 OK):
```typescript
FlightPlan
```

**Error Responses**:
- `404` - Flight plan not found

---

### PATCH `/api/flight-plans/:id/status`

Update only the status of a flight plan.

**Authentication**: Required

**Request Body**:
```typescript
{
  status: 'draft' | 'complete' | 'archived';
}
```

**Response** (200 OK):
```typescript
FlightPlan
```

**Error Responses**:
- `400` - Invalid status
- `404` - Flight plan not found

---

### DELETE `/api/flight-plans/:id`

Delete a flight plan.

**Authentication**: Required

**Response** (204 No Content): Empty

---

## Flight Schedules API (Protected)

### GET `/api/flight-schedules`

List all flight schedules for the user.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightSchedule[]
```

---

### GET `/api/flight-schedules/:id`

Get a specific flight schedule.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightSchedule
```

---

### POST `/api/flight-schedules`

Create a new flight schedule.

**Authentication**: Required

**Request Body**:
```typescript
{
  flight_plan_id?: number;
  name: string;
  schedule_data: object;    // ScheduledFlight[] JSON
  total_flights: number;
}
```

**Response** (201 Created):
```typescript
FlightSchedule
```

---

### DELETE `/api/flight-schedules/:id`

Delete a flight schedule.

**Authentication**: Required

**Response** (204 No Content): Empty

---

### GET `/api/flight-plans/:planId/schedules`

Get all schedules for a specific flight plan.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightSchedule[]
```

---

### POST `/api/flight-plans/:planId/schedules`

Bulk create/replace schedules for a flight plan.

**Authentication**: Required

**Request Body**:
```typescript
{
  schedules: Array<{
    name?: string;
    callsign?: string;
    // ... schedule data
  }>;
}
```

**Response** (201 Created):
```typescript
FlightSchedule[]
```

**Side Effects**: Deletes existing schedules for the plan, updates `aircraft_count`

---

## Split Sessions API (Protected)

### GET `/api/split-sessions`

List all split sessions.

**Authentication**: Required

**Response** (200 OK):
```typescript
SplitSession[]
```

---

### GET `/api/split-sessions/:id`

Get a specific split session.

**Authentication**: Required

**Response** (200 OK):
```typescript
SplitSession
```

---

### POST `/api/split-sessions`

Create a new split session.

**Authentication**: Required

**Request Body**:
```typescript
{
  flight_plan_id?: number;
  name: string;
  split_data: object;       // SplitFlight[] JSON
  total_splits: number;
  total_pallets: number;
}
```

**Response** (201 Created):
```typescript
SplitSession
```

---

### PUT `/api/split-sessions/:id`

Update a split session.

**Authentication**: Required

**Response** (200 OK):
```typescript
SplitSession
```

---

### DELETE `/api/split-sessions/:id`

Delete a split session.

**Authentication**: Required

**Response** (204 No Content): Empty

---

## Flight Nodes API (Protected)

### GET `/api/flight-plans/:planId/nodes`

Get all nodes for a flight plan.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightNode[]
```

---

### GET `/api/flight-nodes/:id`

Get a specific flight node.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightNode
```

---

### GET `/api/flight-nodes/:id/children`

Get child nodes of a flight node.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightNode[]
```

---

### POST `/api/flight-plans/:planId/nodes`

Create a new flight node.

**Authentication**: Required

**Request Body**:
```typescript
{
  node_type: 'airbase' | 'flight';
  parent_node_id?: number;
  position_x?: number;
  position_y?: number;
  node_data: object;
}
```

**Response** (201 Created):
```typescript
FlightNode
```

---

### PUT `/api/flight-nodes/:id`

Update a flight node.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightNode
```

---

### DELETE `/api/flight-nodes/:id`

Delete a flight node.

**Authentication**: Required

**Response** (204 No Content): Empty

---

## Flight Edges API (Protected)

### GET `/api/flight-plans/:planId/edges`

Get all edges for a flight plan.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightEdge[]
```

---

### GET `/api/flight-edges/:id`

Get a specific flight edge.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightEdge
```

---

### POST `/api/flight-plans/:planId/edges`

Create a new flight edge.

**Authentication**: Required

**Request Body**:
```typescript
{
  source_node_id: number;
  target_node_id: number;
  edge_data: object;
}
```

**Response** (201 Created):
```typescript
FlightEdge
```

---

### PUT `/api/flight-edges/:id`

Update a flight edge.

**Authentication**: Required

**Response** (200 OK):
```typescript
FlightEdge
```

---

### DELETE `/api/flight-edges/:id`

Delete a flight edge.

**Authentication**: Required

**Response** (204 No Content): Empty

---

## Port Inventory API (Protected)

### GET `/api/flight-plans/:planId/port-inventory`

Get all port inventories for a flight plan.

**Authentication**: Required

**Response** (200 OK):
```typescript
PortInventory[]
```

---

### GET `/api/flight-plans/:planId/port-inventory/:airbaseId`

Get port inventory for a specific airbase.

**Authentication**: Required

**Response** (200 OK):
```typescript
PortInventory | {
  flight_plan_id: number;
  airbase_id: string;
  incoming_cargo: [];
  outgoing_cargo: [];
  available_cargo: [];
}
```

---

### POST `/api/flight-plans/:planId/port-inventory`

Create/update port inventory.

**Authentication**: Required

**Request Body**:
```typescript
{
  airbase_id: string;
  incoming_cargo?: object[];
  outgoing_cargo?: object[];
  available_cargo?: object[];
}
```

**Response** (201 Created):
```typescript
PortInventory
```

---

### PUT `/api/flight-plans/:planId/port-inventory/:airbaseId`

Update port inventory for a specific airbase.

**Authentication**: Required

**Request Body**:
```typescript
{
  incoming_cargo?: object[];
  outgoing_cargo?: object[];
  available_cargo?: object[];
}
```

**Response** (200 OK):
```typescript
PortInventory
```

**Error Responses**:
- `400` - Cargo arrays must be arrays

---

## DAG Nodes API (Protected)

### POST `/api/dag/nodes`

Create a new DAG node.

**Authentication**: Required

**Request Body**:
```typescript
{
  node_type: 'airbase' | 'flight';
  name: string;
  icao?: string;
  latitude?: string;
  longitude?: string;
  position_x?: number;
  position_y?: number;
  metadata?: object;
}
```

**Response** (201 Created):
```typescript
DagNode
```

---

### GET `/api/dag/nodes`

List all DAG nodes for the user.

**Authentication**: Required

**Response** (200 OK):
```typescript
DagNode[]
```

---

### GET `/api/dag/nodes/:id`

Get a specific DAG node.

**Authentication**: Required

**URL Parameters**:
- `id` - UUID

**Response** (200 OK):
```typescript
DagNode
```

---

### GET `/api/dag/nodes/:id/children`

Get direct child nodes.

**Authentication**: Required

**Response** (200 OK):
```typescript
DagNode[]
```

---

### GET `/api/dag/nodes/:id/parents`

Get direct parent nodes.

**Authentication**: Required

**Response** (200 OK):
```typescript
DagNode[]
```

---

### GET `/api/dag/nodes/:id/ancestors`

Get all ancestor nodes (recursive).

**Authentication**: Required

**Response** (200 OK):
```typescript
DagNode[]
```

---

### GET `/api/dag/nodes/:id/descendants`

Get all descendant nodes (recursive).

**Authentication**: Required

**Response** (200 OK):
```typescript
DagNode[]
```

---

### PATCH `/api/dag/nodes/:id`

Update a DAG node.

**Authentication**: Required

**Request Body**: Partial `DagNode` fields (excluding `user_id`, `id`)

**Response** (200 OK):
```typescript
DagNode
```

---

### DELETE `/api/dag/nodes/:id`

Delete a DAG node.

**Authentication**: Required

**Response** (204 No Content): Empty

**Side Effects**: Also deletes all edges connected to this node

---

### GET `/api/dag/nodes/:id/cargo`

Get all cargo items assigned to a node.

**Authentication**: Required

**Response** (200 OK):
```typescript
CargoItem[]
```

---

## DAG Edges API (Protected)

### POST `/api/dag/edges`

Create a new DAG edge with validation.

**Authentication**: Required

**Request Body**:
```typescript
{
  parent_id: string;      // UUID
  child_id: string;       // UUID
  cargo_shared?: boolean;
  edge_data?: object;
}
```

**Response** (201 Created):
```typescript
DagEdge
```

**Error Responses**:
- `400` - Validation error (cycle detection, invalid node types, duplicate edge)

---

### GET `/api/dag/edges`

List all DAG edges for the user.

**Authentication**: Required

**Response** (200 OK):
```typescript
DagEdge[]
```

---

### GET `/api/dag/edges/:id`

Get a specific DAG edge.

**Authentication**: Required

**Response** (200 OK):
```typescript
DagEdge
```

---

### POST `/api/dag/edges/validate`

Validate a potential edge without creating it.

**Authentication**: Required

**Request Body**:
```typescript
{
  parent_id: string;
  child_id: string;
  cargo_shared?: boolean;
}
```

**Response** (200 OK):
```typescript
{
  valid: boolean;
  error?: string;
}
```

---

### PATCH `/api/dag/edges/:id`

Update a DAG edge.

**Authentication**: Required

**Request Body**: Partial fields (excluding `user_id`, `id`, `parent_id`, `child_id`)

**Response** (200 OK):
```typescript
DagEdge
```

---

### DELETE `/api/dag/edges/:id`

Delete a DAG edge.

**Authentication**: Required

**Response** (204 No Content): Empty

---

## DAG Cargo API (Protected)

### POST `/api/dag/cargo`

Create a new cargo item.

**Authentication**: Required

**Request Body**:
```typescript
{
  tcn: string;                    // Transportation Control Number
  description?: string;
  weight_lb?: string;             // Numeric as string
  length_in?: string;
  width_in?: string;
  height_in?: string;
  cargo_type?: 'palletized' | 'rolling_stock' | 'bulk' | 'hazmat' | 'oversized';
  is_hazmat?: boolean;
  hazmat_class?: string;
  priority?: 'ADVON' | 'MAIN' | 'ROUTINE';
  metadata?: object;
}
```

**Response** (201 Created):
```typescript
CargoItem
```

---

### GET `/api/dag/cargo`

List cargo items with optional filters.

**Authentication**: Required

**Query Parameters**:
- `type` - Filter by cargo type
- `hazmat` - If `'true'`, return only hazmat items

**Response** (200 OK):
```typescript
CargoItem[]
```

---

### GET `/api/dag/cargo/:id`

Get a specific cargo item.

**Authentication**: Required

**Response** (200 OK):
```typescript
CargoItem
```

---

### GET `/api/dag/cargo/tcn/:tcn`

Get a cargo item by TCN.

**Authentication**: Required

**Response** (200 OK):
```typescript
CargoItem
```

---

### PATCH `/api/dag/cargo/:id`

Update a cargo item.

**Authentication**: Required

**Response** (200 OK):
```typescript
CargoItem
```

---

### DELETE `/api/dag/cargo/:id`

Delete a cargo item.

**Authentication**: Required

**Response** (204 No Content): Empty

---

## DAG Cargo Assignments API (Protected)

### POST `/api/dag/assignments`

Create a new cargo assignment.

**Authentication**: Required

**Request Body**:
```typescript
{
  cargo_id: string;     // UUID
  node_id: string;      // UUID
  status?: 'assigned' | 'in_transit' | 'delivered' | 'pending';
  sequence?: number;
  pallet_position?: number;
  metadata?: object;
}
```

**Response** (201 Created):
```typescript
CargoAssignment
```

---

### POST `/api/dag/cargo/:cargoId/assign/:nodeId`

Convenience endpoint to assign cargo to a node.

**Authentication**: Required

**Request Body**:
```typescript
{
  status?: string;
  sequence?: number;
  pallet_position?: number;
  metadata?: object;
}
```

**Response** (201 Created):
```typescript
CargoAssignment
```

---

### GET `/api/dag/assignments`

List all assignments with optional status filter.

**Authentication**: Required

**Query Parameters**:
- `status` - Filter by assignment status

**Response** (200 OK):
```typescript
CargoAssignment[]
```

---

### GET `/api/dag/assignments/:id`

Get a specific assignment.

**Authentication**: Required

**Response** (200 OK):
```typescript
CargoAssignment
```

---

### PATCH `/api/dag/assignments/:id`

Update an assignment.

**Authentication**: Required

**Response** (200 OK):
```typescript
CargoAssignment
```

---

### PATCH `/api/dag/assignments/:id/status`

Update only the status of an assignment.

**Authentication**: Required

**Request Body**:
```typescript
{
  status: 'assigned' | 'in_transit' | 'delivered' | 'pending';
}
```

**Response** (200 OK):
```typescript
CargoAssignment
```

**Error Responses**:
- `400` - Invalid status

---

### DELETE `/api/dag/assignments/:id`

Delete an assignment.

**Authentication**: Required

**Response** (204 No Content): Empty

---

## Type Definitions

### FlightPlan
```typescript
{
  id: number;
  user_id: number;
  name: string;
  status: 'draft' | 'complete' | 'archived';
  created_at: Date;
  updated_at: Date;
  allocation_data: object;
  movement_data?: object;
  movement_items_count: number;
  total_weight_lb: number;
  aircraft_count: number;
}
```

### DagNode
```typescript
{
  id: string;           // UUID
  user_id: number;
  node_type: 'airbase' | 'flight';
  name: string;
  icao?: string;
  latitude?: string;
  longitude?: string;
  position_x: number;
  position_y: number;
  metadata: object;
  created_at: Date;
  updated_at: Date;
}
```

### DagEdge
```typescript
{
  id: string;           // UUID
  user_id: number;
  parent_id: string;    // UUID
  child_id: string;     // UUID
  cargo_shared: boolean;
  edge_data: object;
  created_at: Date;
}
```

### CargoItem
```typescript
{
  id: string;           // UUID
  user_id: number;
  tcn: string;
  description?: string;
  weight_lb?: string;
  length_in?: string;
  width_in?: string;
  height_in?: string;
  cargo_type?: string;
  is_hazmat: boolean;
  hazmat_class?: string;
  priority?: string;
  metadata: object;
  created_at: Date;
}
```

### CargoAssignment
```typescript
{
  id: string;           // UUID
  user_id: number;
  cargo_id: string;
  node_id: string;
  status: string;
  sequence: number;
  pallet_position?: number;
  metadata: object;
  created_at: Date;
  updated_at: Date;
}
```

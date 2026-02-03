# ARKA Cargo Operations - Complete Technical Documentation

**Version:** 2.0  
**Last Updated:** February 2026  
**Platform:** Multi-Modal Military Logistics Management System

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Routes - Detailed Specifications](#api-routes---detailed-specifications)
5. [Frontend Components](#frontend-components)
6. [Services](#services)
7. [Authentication & Security](#authentication--security)
8. [AI Integration](#ai-integration)

---

## System Overview

ARKA is a comprehensive multi-modal logistics platform designed for military cargo operations integrating:

- **Air Operations** - PACAF airlift planning, C-17/C-130 load optimization, 463L palletization
- **Land Logistics** - Ground convoy management, vehicle allocation, route planning
- **Sea Freight** - MSC sealift operations, container tracking, voyage management
- **Warehouse Management** - DLA-compliant inventory, zone management, optimization

### Key Capabilities

| Capability | Description |
|------------|-------------|
| Multi-Modal Routing | Automatic ocean crossing detection, smart mode selection |
| 3D Visualization | Real-time convoy and fleet visualization with Three.js |
| AI Analytics | AWS Bedrock-powered insights and forecasting |
| Cross-Site Coordination | Inter-warehouse transfers, priority queuing, rebalancing |
| Compliance | NSN validation, CAGE codes, MSC designations, DLA standards |

---

## Architecture

### Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React 18 + TypeScript + Vite + TailwindCSS                 │
│  Three.js (3D) + Leaflet (Maps) + Framer Motion             │
│  TanStack Query + Zustand (State)                           │
├─────────────────────────────────────────────────────────────┤
│                        BACKEND                               │
│  Express.js + TypeScript                                    │
│  Drizzle ORM + PostgreSQL (Neon)                           │
│  AWS Bedrock (AI) + Google Maps API                        │
├─────────────────────────────────────────────────────────────┤
│                       DATABASE                               │
│  PostgreSQL (Neon Serverless)                               │
│  40+ Tables with JSONB for flexible data                   │
└─────────────────────────────────────────────────────────────┘
```

### Monorepo Structure

```
/
├── apps/
│   ├── client/                 # React frontend
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   ├── services/       # API client services
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   └── lib/            # Utilities
│   │   └── public/             # Static assets
│   │
│   └── server/                 # Express backend
│       ├── routes/             # API route handlers
│       ├── services/           # Business logic
│       ├── seeds/              # Demo data seeding
│       └── index.ts            # Server entry point
│
├── packages/
│   ├── shared/                 # Shared types & schemas
│   └── config/                 # Shared configurations
│
└── shared/
    └── schema.ts               # Drizzle database schema
```

---

## Database Schema

### Overview

The database contains **40+ tables** organized into functional domains:

| Domain | Tables | Purpose |
|--------|--------|---------|
| Auth | 4 | Users, sessions, organizations, access codes |
| Air | 10 | Flight plans, schedules, nodes, edges, manifests |
| Land | 4 | Convoys, routes, vehicles, cargo |
| Sea | 4 | Voyages, containers, vessels, port calls |
| Warehouse | 20+ | Sites, zones, inventory, transfers, optimization |
| AI | 1 | Cached insights with hash invalidation |

---

### Authentication & Organizations

#### `organizations`
Military branch organizations for role-based access.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| name | text | No | PACAF, DLA, MSC, TRANSCOM |
| description | text | Yes | Organization description |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `users`
User accounts with organization assignment and role.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| email | text | No | Unique email address |
| username | text | No | Display name |
| password | text | No | bcrypt hashed password |
| first_name | text | Yes | First name |
| last_name | text | Yes | Last name |
| organization_id | integer | Yes | FK to organizations (null for superadmin) |
| role | text | No | 'superadmin', 'admin', 'user' (default: 'user') |
| is_active | boolean | No | Account approval status (default: false) |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |
| last_login_at | timestamp | Yes | Last login time |

#### `sessions`
JWT session tokens for authentication.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | FK to users |
| token | text | No | Unique session token |
| expires_at | timestamp | No | Expiration time |
| created_at | timestamp | No | Creation timestamp |

#### `access_codes`
Department Access Codes (DAC) for signup authorization.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| code | text | No | Unique access code |
| organization_id | integer | No | FK to organizations |
| created_by_user_id | integer | No | Admin who created |
| expires_at | timestamp | No | Expiration time |
| is_used | boolean | No | Usage status (default: false) |
| used_by_user_id | integer | Yes | User who used code |
| created_at | timestamp | No | Creation timestamp |

---

### Air Operations Tables

#### `flight_plans`
Complete airlift allocation results.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| name | text | No | Plan name |
| status | text | No | 'draft', 'complete', 'archived' (default: 'draft') |
| scheduled_departure | timestamp | Yes | Planned departure |
| scheduled_arrival | timestamp | Yes | Planned arrival |
| actual_departure | timestamp | Yes | Actual departure |
| actual_arrival | timestamp | Yes | Actual arrival |
| allocation_data | jsonb | No | AllocationResult JSON |
| movement_data | jsonb | Yes | Parsed movement items |
| movement_items_count | integer | No | Item count |
| total_weight_lb | integer | No | Total weight in pounds |
| aircraft_count | integer | No | Aircraft used |
| preferred_aircraft_type_id | text | Yes | Preferred aircraft type FK |
| allow_mixed_fleet | boolean | No | Mixed fleet allowed (default: true) |
| mixed_fleet_mode | text | No | 'PREFERRED_FIRST', 'OPTIMIZE_COST', 'MIN_AIRCRAFT', 'USER_LOCKED' |
| preference_strength | numeric(3,2) | No | Preference weight 0-1 (default: 0.5) |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `flight_schedules`
Scheduled flights with timing.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| flight_plan_id | integer | Yes | FK to flight_plans |
| name | text | No | Schedule name |
| schedule_data | jsonb | No | ScheduledFlight[] JSON |
| total_flights | integer | No | Flight count |
| created_at | timestamp | No | Creation timestamp |

#### `aircraft_types`
Registry of supported aircraft.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | text | No | Primary key (e.g., 'C17', 'C130H', 'C130J') |
| display_name | text | No | Human-readable name |
| active | boolean | No | Currently available (default: true) |
| capacity_model_version | text | No | Capacity profile version (default: 'v1') |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `aircraft_capacity_profiles`
Versioned capacity specifications per aircraft type.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| aircraft_type_id | text | No | FK to aircraft_types |
| version | text | No | Profile version (default: 'v1') |
| max_payload_lb | integer | No | Maximum payload in pounds |
| max_pallet_positions | integer | Yes | Number of pallet positions |
| cargo_bay_dims | jsonb | No | {length, width, height} in inches |
| notes | text | Yes | Additional notes |
| default_cost_params | jsonb | No | {cost_per_sortie, cost_per_hour, etc.} |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

---

### Land Logistics Tables

#### `land_vehicle_types`
Military ground vehicle registry.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| code | text | No | Vehicle code (HEMTT, LMTV, FMTV, etc.) |
| name | text | No | Full vehicle name |
| category | text | No | 'heavy_truck', 'medium_truck', 'light_truck' |
| capacity_lbs | integer | No | Max cargo weight in pounds |
| capacity_pallets | integer | Yes | Number of pallet positions |
| fuel_capacity_gallons | integer | Yes | Fuel tank size |
| range_miles | integer | Yes | Operating range |
| crew_size | integer | Yes | Required crew |
| active | boolean | No | Fleet availability (default: true) |
| created_at | timestamp | No | Creation timestamp |

#### `land_routes`
Ground transport routes.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| name | text | No | Route name |
| origin | text | Yes | Starting point address |
| destination | text | Yes | Ending point address |
| origin_lat | numeric | Yes | Origin latitude |
| origin_lng | numeric | Yes | Origin longitude |
| dest_lat | numeric | Yes | Destination latitude |
| dest_lng | numeric | Yes | Destination longitude |
| origin_site_id | integer | Yes | FK to warehouse_sites |
| destination_site_id | integer | Yes | FK to warehouse_sites |
| distance_miles | numeric | Yes | Route distance |
| estimated_duration_hours | numeric | Yes | Travel time |
| route_data | jsonb | Yes | Google Maps route JSON |
| status | text | No | 'draft', 'active', 'archived' |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `land_convoys`
Ground convoy operations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| name | text | No | Convoy name |
| route_id | integer | Yes | FK to land_routes |
| origin | text | Yes | Starting location |
| destination | text | Yes | Ending location |
| origin_site_id | integer | Yes | FK to warehouse_sites |
| destination_site_id | integer | Yes | FK to warehouse_sites |
| status | text | No | 'planning', 'loading', 'en_route', 'completed' |
| vehicle_count | integer | Yes | Number of vehicles |
| total_cargo_weight_lbs | integer | Yes | Total cargo weight |
| departure_time | timestamp | Yes | Actual departure |
| arrival_time | timestamp | Yes | Actual arrival |
| scheduled_departure | timestamp | Yes | Planned departure |
| scheduled_arrival | timestamp | Yes | Planned arrival |
| actual_departure | timestamp | Yes | Actual departure |
| actual_arrival | timestamp | Yes | Actual arrival |
| cargo_manifest | jsonb | Yes | Cargo manifest items |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `land_convoy_vehicles`
Vehicle assignments to convoys.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| convoy_id | integer | No | FK to land_convoys |
| vehicle_type_id | integer | No | FK to land_vehicle_types |
| vehicle_number | text | Yes | Vehicle identifier |
| cargo_weight_lbs | integer | Yes | Assigned cargo weight |
| cargo_items | jsonb | Yes | Assigned cargo items |
| position_in_convoy | integer | Yes | Sequence in convoy |
| status | text | No | 'assigned', 'loaded', 'in_transit', 'delivered' |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

---

### Sea Freight Tables

#### `sea_vessel_types`
MSC vessel type registry.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| code | text | No | Vessel code (LMSR, TAKR, TAO, TAKE) |
| name | text | No | Vessel type name |
| designation | text | Yes | T-AKR, T-AO, T-AKE |
| category | text | No | 'oiler', 'cargo', 'transport', 'combat_logistics' |
| cargo_capacity_lbs | integer | No | Max cargo weight |
| teu_capacity | integer | Yes | Container capacity (TEU) |
| fuel_capacity_barrels | integer | Yes | Fuel capacity |
| vehicle_capacity | integer | Yes | Vehicle deck slots |
| lane_meters | integer | Yes | RO/RO lane meters |
| displacement_tons | integer | Yes | Ship displacement |
| deadweight_tons | integer | Yes | Deadweight tonnage |
| length_ft | integer | Yes | Ship length |
| beam_ft | integer | Yes | Ship width |
| draft_ft | integer | Yes | Ship draft |
| max_speed_knots | integer | Yes | Maximum speed |
| cruise_speed_knots | integer | Yes | Cruising speed |
| range_nm | integer | Yes | Range in nautical miles |
| crew_size | integer | Yes | Crew complement |
| has_crane | boolean | No | Crane capability (default: false) |
| crane_capacity_tons | integer | Yes | Crane capacity |
| has_roro_capability | boolean | No | Roll-on/roll-off (default: false) |
| has_helicopter_deck | boolean | No | Helo pad (default: false) |
| active_fleet_count | integer | Yes | Active ships in class |
| notes | text | Yes | Additional notes |
| created_at | timestamp | No | Creation timestamp |

#### `sea_voyages`
Maritime voyage operations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| name | text | No | Voyage name |
| origin_port | text | Yes | Departure port |
| destination_port | text | Yes | Arrival port |
| vessel_type_id | integer | Yes | FK to sea_vessel_types |
| vessel_name | text | Yes | Ship name (e.g., USNS Brittin) |
| vessel_imo | text | Yes | IMO number |
| vessel_hull_number | text | Yes | Hull number |
| vessel_class | text | Yes | Vessel class |
| status | text | No | 'draft', 'planned', 'loading', 'underway', 'completed' |
| scheduled_departure | timestamp | Yes | Planned departure |
| scheduled_arrival | timestamp | Yes | Planned arrival |
| actual_departure | timestamp | Yes | Actual departure |
| actual_arrival | timestamp | Yes | Actual arrival |
| port_calls | jsonb | Yes | Array of port stops |
| route_data | jsonb | Yes | Navigation route |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `sea_containers`
Container tracking for voyages.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| voyage_id | integer | Yes | FK to sea_voyages |
| container_number | text | No | ISO container ID |
| container_type | text | No | '20GP', '40GP', '40HC', '45HC' |
| weight_lbs | integer | Yes | Loaded weight |
| teu | integer | No | TEU count (1 or 2) |
| seal_number | text | Yes | Security seal |
| status | text | No | 'empty', 'loading', 'loaded', 'unloading', 'discharged' |
| cargo_manifest | jsonb | Yes | Container contents |
| position_bay | integer | Yes | Ship bay position |
| position_row | integer | Yes | Ship row position |
| position_tier | integer | Yes | Ship tier position |
| hazmat_class | text | Yes | Hazmat classification |
| is_reefer | boolean | No | Refrigerated container |
| temperature_setting | numeric | Yes | Reefer temperature |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

---

### Warehouse Management Tables

#### `warehouse_sites`
Warehouse facility definitions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| code | text | No | Site code |
| name | text | No | Facility name |
| address | text | Yes | Full address |
| address_line_1 | text | Yes | Street address |
| address_line_2 | text | Yes | Suite/building |
| city | text | Yes | City |
| state | text | Yes | State/province |
| zip_code | text | Yes | Postal code |
| country | text | No | Country (default: 'USA') |
| timezone | text | No | Timezone (default: 'UTC') |
| latitude | numeric | Yes | Latitude |
| longitude | numeric | Yes | Longitude |
| active | boolean | No | Operational status (default: true) |
| aor | text | Yes | Area of Responsibility |
| shipyard_code | text | Yes | Shipyard code |
| dodaac | text | Yes | DoD Activity Address Code |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `warehouse_inventory_items`
Individual inventory items.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| site_id | integer | No | FK to warehouse_sites |
| zone_id | integer | Yes | FK to warehouse_zones |
| user_id | integer | No | Owner |
| nsn | text | Yes | National Stock Number (13 chars) |
| niin | text | Yes | National Item Identification Number (9 chars) |
| part_number | text | Yes | Manufacturer part number |
| cage_code | text | Yes | CAGE code (5 chars) |
| nomenclature | text | Yes | Item description |
| unit_of_issue | text | Yes | EA, BX, KT, PR, etc. |
| quantity | integer | No | Quantity on hand (default: 1) |
| unit_price | numeric(12,2) | Yes | Unit cost |
| total_value | numeric(14,2) | Yes | Extended value |
| weight_lbs | integer | Yes | Item weight in pounds |
| length_in | numeric(8,2) | Yes | Length in inches |
| width_in | numeric(8,2) | Yes | Width in inches |
| height_in | numeric(8,2) | Yes | Height in inches |
| cube_ft | numeric(10,2) | Yes | Cubic feet |
| location | text | Yes | Storage location code |
| condition_code | text | Yes | A, B, C, D, E, F, G, H, J, K, L, M, N, P, Q, R, S |
| lot_number | text | Yes | Lot/batch number |
| serial_number | text | Yes | Serial number |
| requisition_number | text | Yes | Requisition number |
| received_date | timestamp | Yes | Receipt date |
| expiration_date | timestamp | Yes | Expiration date |
| last_inventoried | timestamp | Yes | Last count date |
| hazmat_class | text | Yes | Hazmat classification (1-9) |
| is_hazmat | boolean | No | Hazmat flag (default: false) |
| is_sensitive | boolean | No | Sensitive item flag (default: false) |
| raw_row | jsonb | Yes | Original import data |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `warehouse_transfers`
Inter-site transfer operations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| source_site_id | integer | No | Origin site FK |
| destination_site_id | integer | No | Destination site FK |
| status | text | No | 'pending', 'manifest_created', 'transport_assigned', 'in_transit', 'completed', 'cancelled' |
| transport_mode | text | No | 'air', 'ground', 'sea' (default: 'land') |
| transfer_items | jsonb | No | Items being transferred (default: []) |
| air_metadata | jsonb | Yes | Air transport metadata |
| pacaf_manifest | jsonb | Yes | PACAF manifest data |
| notes | text | Yes | Transfer notes |
| scheduled_date | timestamp | Yes | Planned transfer date |
| completed_date | timestamp | Yes | Actual completion date |
| priority_level | text | No | 'routine', 'priority', 'immediate', 'flash' (default: 'routine') |
| priority_score | integer | No | Calculated priority score (default: 0) |
| escalated_at | timestamp | Yes | Escalation timestamp |
| escalated_by | integer | Yes | User who escalated |
| queue_position | integer | Yes | Priority queue position |
| assigned_convoy_id | integer | Yes | FK to land_convoys |
| assigned_flight_plan_id | integer | Yes | FK to flight_plans |
| assigned_voyage_id | integer | Yes | FK to sea_voyages |
| total_weight_lbs | integer | Yes | Total weight |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

---

### Cross-Modal Tables

#### `cross_modal_manifests`
Unified manifests across transport modes.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| source_site_id | integer | No | Origin warehouse FK |
| destination_site_id | integer | Yes | Destination warehouse FK |
| destination_address | text | Yes | Free-form destination |
| manifest_number | text | No | Unique manifest ID (auto-generated) |
| name | text | No | Manifest name |
| priority | text | No | 'routine', 'priority', 'immediate', 'flash' (default: 'routine') |
| classification | text | No | Security classification (default: 'unclassified') |
| transport_mode | text | Yes | 'air', 'land', 'sea' |
| flight_plan_id | integer | Yes | FK to flight_plans for air |
| convoy_id | integer | Yes | FK to land_convoys for land |
| voyage_id | integer | Yes | FK to sea_voyages for sea |
| estimated_cost_usd | numeric(12,2) | Yes | Cost estimate |
| estimated_duration_hours | numeric(8,2) | Yes | Duration estimate |
| estimated_distance_miles | numeric(10,2) | Yes | Distance estimate |
| total_weight_lbs | integer | Yes | Total weight (default: 0) |
| total_cube_ft | numeric(10,2) | Yes | Total cubic feet (default: 0) |
| total_items | integer | Yes | Item count (default: 0) |
| status | text | No | 'draft', 'pending_transport', 'assigned', 'in_transit', 'delivered', 'cancelled' |
| required_delivery_date | timestamp | Yes | RDD |
| estimated_departure | timestamp | Yes | ETD |
| estimated_arrival | timestamp | Yes | ETA |
| actual_departure | timestamp | Yes | Actual departure |
| actual_arrival | timestamp | Yes | Actual arrival |
| notes | text | Yes | Notes |
| created_at | timestamp | No | Creation timestamp |
| updated_at | timestamp | No | Last update |

#### `manifest_items`
Individual items within manifests.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| manifest_id | integer | No | FK to cross_modal_manifests |
| inventory_item_id | integer | Yes | FK to warehouse_inventory_items |
| nsn | text | Yes | National Stock Number |
| part_number | text | Yes | Part number |
| nomenclature | text | No | Item description |
| quantity | integer | No | Quantity (default: 1) |
| unit_of_issue | text | Yes | Unit of issue (default: 'EA') |
| weight_lbs | integer | Yes | Weight |
| length_in | numeric(8,2) | Yes | Length |
| width_in | numeric(8,2) | Yes | Width |
| height_in | numeric(8,2) | Yes | Height |
| cube_ft | numeric(8,2) | Yes | Cubic feet |
| hazmat_class | text | Yes | Hazmat classification |
| is_hazmat | boolean | No | Hazmat flag (default: false) |
| is_sensitive | boolean | No | Sensitive item flag (default: false) |
| picked | boolean | No | Picked status (default: false) |
| packed | boolean | No | Packed status (default: false) |
| loaded | boolean | No | Loaded status (default: false) |
| created_at | timestamp | No | Creation timestamp |

---

### AI Insights Table

#### `ai_insights`
Cached AI-generated insights with hash-based invalidation.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | serial | No | Primary key |
| user_id | integer | No | Owner |
| flight_plan_id | integer | Yes | Optional plan reference |
| insight_type | text | No | One of the insight type enums |
| input_hash | text | No | SHA256 hash for cache validation |
| insight_data | jsonb | No | Generated insight JSON |
| token_usage | jsonb | Yes | {inputTokens, outputTokens} |
| created_at | timestamp | No | Generation time |
| regenerated_at | timestamp | Yes | Last regeneration |

**Insight Types:**
- `allocation_summary` - Flight allocation analysis
- `cob_analysis` - Close of business analysis
- `pallet_review` - Pallet configuration review
- `route_planning` - Route optimization suggestions
- `compliance` - Compliance check results
- `mission_briefing` - Mission briefing summary
- `mission_analytics` - Mission performance analytics
- `flight_allocation_analysis` - Detailed allocation analysis
- `land_convoy_analysis` - Convoy operation insights
- `land_route_optimization` - Route optimization for ground
- `sea_voyage_analysis` - Maritime voyage insights
- `sea_container_optimization` - Container loading optimization
- `cross_modal_manifest_analysis` - Multi-modal analysis
- `warehouse_capacity_forecast` - Capacity predictions
- `warehouse_demand_forecast` - Demand forecasting
- `warehouse_anomaly_detection` - Anomaly detection
- `warehouse_smart_placement` - Placement optimization
- `warehouse_inventory_velocity` - Inventory velocity analysis

---

## API Routes - Detailed Specifications

All API routes require authentication via JWT token in httpOnly cookie unless otherwise noted.

### Authentication Routes (`/api/auth`)

---

#### POST `/api/auth/register`
Register a new user account with access code validation.

**Description:** Creates a new user account. Non-superadmin users require a valid access code. Superadmin email is auto-detected and auto-activated.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "username": "john_doe",
  "first_name": "John",
  "last_name": "Doe",
  "access_code": "ABC123-XYZ789"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Valid email address |
| password | string | Yes | Minimum 6 characters |
| username | string | Yes | Minimum 2 characters |
| first_name | string | No | First name |
| last_name | string | No | Last name |
| access_code | string | No | Required for non-superadmin users |

**Response (201 Created):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "john_doe",
    "role": "user",
    "is_active": false,
    "organization_id": 1
  }
}
```

**Error Responses:**
- `400` - Invalid input or invalid/expired access code
- `409` - Email or username already exists
- `500` - Server error

---

#### POST `/api/auth/login`
Authenticate user and create session.

**Description:** Validates credentials, creates a session, and sets an httpOnly cookie with the session token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Registered email address |
| password | string | Yes | Account password |

**Response (200 OK):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "john_doe",
    "role": "user",
    "is_active": true,
    "organization_id": 1,
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

**Error Responses:**
- `400` - Invalid input format
- `401` - Invalid email or password
- `403` - Account pending approval
- `500` - Server error

---

#### POST `/api/auth/logout`
Invalidate current session.

**Description:** Deletes the session from the database and clears the session cookie.

**Request:** No body required. Session token is read from cookie.

**Response (204 No Content):** Empty response

---

#### GET `/api/auth/me`
Get current authenticated user profile.

**Description:** Returns the current user's profile including organization details.

**Request:** No parameters. Uses session cookie.

**Response (200 OK):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "john_doe",
  "role": "user",
  "is_active": true,
  "organization_id": 1,
  "organization": {
    "id": 1,
    "name": "PACAF"
  },
  "first_name": "John",
  "last_name": "Doe"
}
```

**Error Responses:**
- `401` - Not authenticated
- `404` - User not found
- `500` - Server error

---

### Admin Routes (`/api`)

---

#### GET `/api/organizations`
List all organizations.

**Description:** Returns all military organizations. Available to all authenticated users.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "PACAF",
    "description": "Pacific Air Forces",
    "created_at": "2024-01-15T00:00:00Z",
    "updated_at": "2024-01-15T00:00:00Z"
  },
  {
    "id": 2,
    "name": "DLA",
    "description": "Defense Logistics Agency",
    "created_at": "2024-01-15T00:00:00Z",
    "updated_at": "2024-01-15T00:00:00Z"
  }
]
```

---

#### POST `/api/organizations`
Create a new organization. **Requires superadmin role.**

**Request Body:**
```json
{
  "name": "TRANSCOM",
  "description": "United States Transportation Command"
}
```

**Response (201 Created):**
```json
{
  "id": 4,
  "name": "TRANSCOM",
  "description": "United States Transportation Command",
  "created_at": "2024-01-15T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z"
}
```

---

#### GET `/api/accesscodes`
List access codes. **Requires admin role.**

**Description:** Superadmins see all codes; admins see only their organization's codes.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| organization_id | integer | Filter by organization (superadmin only) |

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "code": "PACAF-2024-ABC123",
    "organization_id": 1,
    "created_by_user_id": 1,
    "expires_at": "2024-02-15T00:00:00Z",
    "is_used": false,
    "used_by_user_id": null,
    "created_at": "2024-01-15T00:00:00Z"
  }
]
```

---

#### POST `/api/accesscodes`
Create a new access code. **Requires admin role.**

**Request Body:**
```json
{
  "organization_id": 1,
  "expires_in_days": 7
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| organization_id | integer | Yes (superadmin only) | Target organization |
| expires_in_days | integer | No | Days until expiration (default: 7) |

**Response (201 Created):**
```json
{
  "id": 2,
  "code": "PACAF-2024-XYZ789",
  "organization_id": 1,
  "created_by_user_id": 1,
  "expires_at": "2024-01-22T00:00:00Z",
  "is_used": false,
  "created_at": "2024-01-15T00:00:00Z"
}
```

---

#### GET `/api/admin/users`
List users. **Requires admin role.**

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| organization_id | integer | Filter by organization (superadmin only) |
| include_inactive | boolean | Include pending users (default: false) |

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "email": "admin@pacaf.mil",
    "username": "pacaf_admin",
    "first_name": "Admin",
    "last_name": "User",
    "role": "admin",
    "organization_id": 1,
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z",
    "last_login_at": "2024-01-15T12:00:00Z"
  }
]
```

---

#### PUT `/api/admin/users/:id`
Update user. **Requires admin role.**

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Smith",
  "role": "admin",
  "is_active": true,
  "organization_id": 2
}
```

**Response (200 OK):**
```json
{
  "id": 2,
  "email": "john@example.com",
  "username": "john_smith",
  "first_name": "John",
  "last_name": "Smith",
  "role": "admin",
  "organization_id": 2,
  "is_active": true
}
```

---

#### POST `/api/admin/users/:id/approve`
Approve a pending user. **Requires admin role.**

**Response (200 OK):**
```json
{
  "id": 5,
  "email": "new_user@example.com",
  "username": "new_user",
  "is_active": true,
  "message": "User approved successfully"
}
```

---

#### DELETE `/api/admin/users/:id`
Delete a user. **Requires admin role.**

**Response (204 No Content):** Empty response

---

#### POST `/api/admin/seed-demo-data`
Seed demo data for all transport modes. **Requires admin role.**

**Response (200 OK):**
```json
{
  "message": "Demo data seeded successfully",
  "seeded": ["land_routes", "land_convoys", "convoy_vehicles", "sea_voyages", "sea_containers"]
}
```

---

### Air Operations Routes (`/api`)

---

#### GET `/api/air/pending-transfers`
List warehouse transfers awaiting air transport assignment.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "source_site_id": 1,
    "destination_site_id": 2,
    "status": "pending",
    "transport_mode": "air",
    "transfer_items": [...],
    "source_site": {
      "id": 1,
      "name": "Kadena AFB Depot"
    },
    "destination_site": {
      "id": 2,
      "name": "Osan AB Supply"
    }
  }
]
```

---

#### GET `/api/flight-plans`
List all flight plans for the authenticated user.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "OPLAN IRON THUNDER",
    "status": "complete",
    "scheduled_departure": "2024-02-01T06:00:00Z",
    "scheduled_arrival": "2024-02-01T14:00:00Z",
    "movement_items_count": 24,
    "total_weight_lb": 125000,
    "aircraft_count": 3,
    "created_at": "2024-01-15T00:00:00Z"
  }
]
```

---

#### GET `/api/flight-plans/:id`
Get detailed flight plan by ID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | integer | Flight plan ID |

**Response (200 OK):**
```json
{
  "id": 1,
  "user_id": 1,
  "name": "OPLAN IRON THUNDER",
  "status": "complete",
  "scheduled_departure": "2024-02-01T06:00:00Z",
  "scheduled_arrival": "2024-02-01T14:00:00Z",
  "allocation_data": {
    "items": [...],
    "totalWeight": 125000,
    "aircraftAssignments": [...]
  },
  "movement_data": [...],
  "movement_items_count": 24,
  "total_weight_lb": 125000,
  "aircraft_count": 3,
  "preferred_aircraft_type_id": "C17",
  "allow_mixed_fleet": true,
  "mixed_fleet_mode": "PREFERRED_FIRST",
  "preference_strength": "0.50"
}
```

---

#### POST `/api/flight-plans`
Create a new flight plan.

**Request Body:**
```json
{
  "name": "OPLAN IRON THUNDER",
  "status": "draft",
  "scheduled_departure": "2024-02-01T06:00:00Z",
  "scheduled_arrival": "2024-02-01T14:00:00Z",
  "allocation_data": {
    "items": [...],
    "totalWeight": 125000
  },
  "movement_items_count": 24,
  "total_weight_lb": 125000,
  "aircraft_count": 3,
  "preferred_aircraft_type_id": "C17",
  "allow_mixed_fleet": true
}
```

**Response (201 Created):** Returns the created flight plan object.

---

#### PUT `/api/flight-plans/:id`
Update an existing flight plan.

**Request Body:** Partial update with any flight plan fields.

**Response (200 OK):** Returns the updated flight plan object.

---

#### PATCH `/api/flight-plans/:id/status`
Update flight plan status.

**Request Body:**
```json
{
  "status": "complete"
}
```

| status | Description |
|--------|-------------|
| draft | Initial state, editing in progress |
| complete | Planning complete, ready for execution |
| archived | Historical record |

**Response (200 OK):** Returns the updated flight plan.

---

#### DELETE `/api/flight-plans/:id`
Delete a flight plan.

**Response (204 No Content):** Empty response

---

### Aircraft Management Routes (`/api`)

---

#### GET `/api/aircraft-types`
List all active aircraft types with capacity profiles.

**Response (200 OK):**
```json
[
  {
    "id": "C17",
    "display_name": "C-17 Globemaster III",
    "active": true,
    "capacity_model_version": "v1",
    "capacityProfile": {
      "id": 1,
      "aircraft_type_id": "C17",
      "version": "v1",
      "max_payload_lb": 170900,
      "max_pallet_positions": 18,
      "cargo_bay_dims": {
        "length": 882,
        "width": 216,
        "height": 148
      },
      "default_cost_params": {
        "cost_per_sortie": 50000,
        "cost_per_hour": 15000
      }
    }
  }
]
```

---

#### GET `/api/aircraft-types/:typeId/capacity`
Get capacity profile for specific aircraft type.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| version | string | Profile version (optional) |

**Response (200 OK):**
```json
{
  "id": 1,
  "aircraft_type_id": "C17",
  "version": "v1",
  "max_payload_lb": 170900,
  "max_pallet_positions": 18,
  "cargo_bay_dims": {
    "length": 882,
    "width": 216,
    "height": 148
  },
  "default_cost_params": {
    "cost_per_sortie": 50000,
    "cost_per_hour": 15000
  }
}
```

---

#### POST `/api/plans/:planId/fleet-availability`
Set fleet availability constraints for a plan.

**Request Body:**
```json
{
  "availability": [
    { "typeId": "C17", "count": 5 },
    { "typeId": "C130H", "count": 3 },
    { "typeId": "C130J", "count": 4 }
  ],
  "preferred_aircraft_type_id": "C17",
  "mixed_fleet_mode": "PREFERRED_FIRST",
  "preference_strength": 0.7
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "availability": [
    { "typeId": "C17", "count": 5, "locked": false },
    { "typeId": "C130H", "count": 3, "locked": false },
    { "typeId": "C130J", "count": 4, "locked": false }
  ]
}
```

---

#### POST `/api/plans/:planId/optimize`
Run fleet optimization solver for a plan.

**Request Body:** No body required. Uses plan's allocation_data and fleet availability.

**Response (200 OK):**
```json
{
  "status": "FEASIBLE",
  "aircraftUsed": {
    "C17": 2,
    "C130J": 1
  },
  "unallocatedCargoIds": [],
  "metrics": {
    "total_cost": 165000,
    "total_aircraft": 3,
    "utilization": 0.87
  },
  "explanation": "Optimal solution found using 2 C-17s and 1 C-130J...",
  "solutionId": 1,
  "savedAt": "2024-01-15T00:00:00Z"
}
```

---

### Land Logistics Routes (`/api/land`)

---

#### GET `/api/land/vehicle-types`
List all military ground vehicle types.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "code": "HEMTT",
    "name": "Heavy Expanded Mobility Tactical Truck",
    "category": "heavy_truck",
    "capacity_lbs": 22000,
    "capacity_pallets": 4,
    "fuel_capacity_gallons": 150,
    "range_miles": 300,
    "crew_size": 2,
    "active": true
  },
  {
    "id": 2,
    "code": "LMTV",
    "name": "Light Medium Tactical Vehicle",
    "category": "medium_truck",
    "capacity_lbs": 5000,
    "capacity_pallets": 2,
    "active": true
  }
]
```

---

#### GET `/api/land/pending-transfers`
List warehouse transfers awaiting ground convoy assignment.

**Response (200 OK):**
```json
[
  {
    "id": 5,
    "source_site_id": 1,
    "destination_site_id": 3,
    "status": "pending",
    "transport_mode": "ground",
    "transfer_items": [...],
    "source_site": { "id": 1, "name": "Camp Humphreys Depot" },
    "destination_site": { "id": 3, "name": "Osan AFB Supply" }
  }
]
```

---

#### GET `/api/land/routes`
List all routes for the authenticated user.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "Humphreys to Osan MSR",
    "origin": "Camp Humphreys, South Korea",
    "destination": "Osan Air Base, South Korea",
    "origin_lat": "36.9694",
    "origin_lng": "127.0316",
    "dest_lat": "37.0878",
    "dest_lng": "127.0304",
    "distance_miles": "28.5",
    "estimated_duration_hours": "1.25",
    "status": "active",
    "route_data": {...}
  }
]
```

---

#### POST `/api/land/routes`
Create a new route.

**Request Body:**
```json
{
  "name": "Humphreys to Osan MSR",
  "origin": "Camp Humphreys, South Korea",
  "destination": "Osan Air Base, South Korea",
  "origin_lat": 36.9694,
  "origin_lng": 127.0316,
  "dest_lat": 37.0878,
  "dest_lng": 127.0304,
  "origin_site_id": 1,
  "destination_site_id": 2,
  "status": "active"
}
```

**Response (201 Created):** Returns created route.

---

#### GET `/api/land/convoys`
List all convoys for the authenticated user.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "IRON THUNDER Convoy Alpha",
    "route_id": 1,
    "origin": "Camp Humphreys",
    "destination": "Osan AFB",
    "status": "en_route",
    "vehicle_count": 4,
    "total_weight_lbs": 45000,
    "departure_time": "2024-02-01T06:00:00Z",
    "scheduled_departure": "2024-02-01T06:00:00Z",
    "scheduled_arrival": "2024-02-01T08:00:00Z",
    "cargo_manifest": [...]
  }
]
```

---

#### GET `/api/land/convoys/:id`
Get detailed convoy with vehicles.

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "IRON THUNDER Convoy Alpha",
  "route_id": 1,
  "origin": "Camp Humphreys",
  "destination": "Osan AFB",
  "status": "en_route",
  "vehicle_count": 4,
  "total_weight_lbs": 45000,
  "vehicles": [
    {
      "id": 1,
      "convoy_id": 1,
      "vehicle_type_id": 1,
      "vehicle_number": "HEMTT-001",
      "cargo_weight_lbs": 18000,
      "position_in_convoy": 1,
      "status": "loaded"
    }
  ]
}
```

---

#### POST `/api/land/convoys`
Create a new convoy.

**Request Body:**
```json
{
  "name": "IRON THUNDER Convoy Alpha",
  "route_id": 1,
  "origin": "Camp Humphreys",
  "destination": "Osan AFB",
  "origin_site_id": 1,
  "destination_site_id": 2,
  "scheduled_departure": "2024-02-01T06:00:00Z",
  "scheduled_arrival": "2024-02-01T08:00:00Z",
  "status": "planning"
}
```

**Response (201 Created):** Returns created convoy.

---

#### POST `/api/land/convoys/:convoyId/vehicles`
Add a vehicle to a convoy.

**Request Body:**
```json
{
  "vehicle_type_id": 1,
  "vehicle_number": "HEMTT-001",
  "cargo_weight_lbs": 18000,
  "position_in_convoy": 1,
  "cargo_items": [...]
}
```

**Response (201 Created):** Returns created convoy vehicle.

---

#### GET `/api/land/statistics`
Get land logistics dashboard statistics.

**Response (200 OK):**
```json
{
  "totalRoutes": 5,
  "activeRoutes": 3,
  "totalConvoys": 12,
  "activeConvoys": 2,
  "inTransit": 2,
  "pendingConvoys": 4,
  "completedToday": 1,
  "totalPayloadLbs": 125000
}
```

---

#### POST `/api/land/routes/calculate`
Calculate route using Google Maps Directions API.

**Request Body:**
```json
{
  "origin": "Camp Humphreys, South Korea",
  "destination": "Osan Air Base, South Korea",
  "waypoints": ["Pyeongtaek, South Korea"],
  "avoidTolls": true,
  "avoidHighways": false
}
```

**Response (200 OK):**
```json
{
  "distance": { "value": 45847, "text": "28.5 mi" },
  "duration": { "value": 4500, "text": "1 hr 15 min" },
  "polyline": "...",
  "steps": [...],
  "bounds": {...}
}
```

---

#### GET `/api/land/places/autocomplete`
Location autocomplete using Google Places API.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| input | string | Search query |
| sessionToken | string | Session token for billing |

**Response (200 OK):**
```json
{
  "predictions": [
    {
      "place_id": "ChIJ...",
      "description": "Camp Humphreys, Pyeongtaek, South Korea",
      "structured_formatting": {
        "main_text": "Camp Humphreys",
        "secondary_text": "Pyeongtaek, South Korea"
      }
    }
  ]
}
```

---

### Sea Freight Routes (`/api/sea`)

---

#### GET `/api/sea/vessel-types`
List all MSC vessel types.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "code": "LMSR",
    "name": "Large, Medium-Speed Roll-on/Roll-off",
    "designation": "T-AKR",
    "category": "cargo",
    "cargo_capacity_lbs": 100000000,
    "vehicle_capacity": 900,
    "lane_meters": 3200,
    "max_speed_knots": 24,
    "has_roro_capability": true,
    "active_fleet_count": 19
  }
]
```

---

#### GET `/api/sea/voyages`
List all voyages for the authenticated user.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "PACIFIC SURGE VOY-001",
    "origin_port": "Busan, South Korea",
    "destination_port": "San Diego, CA",
    "vessel_type_id": 1,
    "vessel_name": "USNS Brittin",
    "vessel_hull_number": "T-AKR-305",
    "status": "underway",
    "scheduled_departure": "2024-01-15T00:00:00Z",
    "scheduled_arrival": "2024-02-01T00:00:00Z",
    "container_count": 45,
    "cargo_count": 45,
    "total_weight_lbs": 2500000
  }
]
```

---

#### GET `/api/sea/voyages/:id`
Get detailed voyage with containers and vessel type.

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "PACIFIC SURGE VOY-001",
  "origin_port": "Busan, South Korea",
  "destination_port": "San Diego, CA",
  "vessel_name": "USNS Brittin",
  "vessel_hull_number": "T-AKR-305",
  "status": "underway",
  "port_calls": [
    { "port": "Yokohama, Japan", "eta": "2024-01-20T00:00:00Z", "etd": "2024-01-21T00:00:00Z" }
  ],
  "containers": [
    {
      "id": 1,
      "container_number": "MSCU1234567",
      "container_type": "40GP",
      "weight_lbs": 45000,
      "status": "loaded"
    }
  ],
  "vessel_type": {
    "id": 1,
    "code": "LMSR",
    "name": "Large, Medium-Speed Roll-on/Roll-off"
  },
  "container_count": 45,
  "total_weight_lbs": 2500000
}
```

---

#### POST `/api/sea/voyages`
Create a new voyage.

**Request Body:**
```json
{
  "name": "PACIFIC SURGE VOY-001",
  "origin_port": "Busan, South Korea",
  "destination_port": "San Diego, CA",
  "vessel_type_id": 1,
  "vessel_name": "USNS Brittin",
  "vessel_hull_number": "T-AKR-305",
  "scheduled_departure": "2024-01-15T00:00:00Z",
  "scheduled_arrival": "2024-02-01T00:00:00Z",
  "port_calls": [
    { "port": "Yokohama, Japan", "eta": "2024-01-20T00:00:00Z", "etd": "2024-01-21T00:00:00Z" }
  ],
  "status": "planned"
}
```

**Response (201 Created):** Returns created voyage.

---

#### PUT `/api/sea/voyages/:id/status`
Update voyage status with automatic timestamp setting.

**Request Body:**
```json
{
  "status": "underway"
}
```

| status | Effect |
|--------|--------|
| underway | Sets `actual_departure` to current time |
| completed | Sets `actual_arrival` to current time |

**Response (200 OK):** Returns updated voyage.

---

#### GET `/api/sea/containers`
List containers, optionally filtered by voyage.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| voyage_id | integer | Filter by voyage (optional) |

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "voyage_id": 1,
    "container_number": "MSCU1234567",
    "container_type": "40GP",
    "weight_lbs": 45000,
    "teu": 2,
    "status": "loaded",
    "cargo_manifest": [
      { "nsn": "2540-01-234-5678", "nomenclature": "Vehicle Parts", "weight_lbs": 15000 }
    ]
  }
]
```

---

#### POST `/api/sea/containers`
Create a new container.

**Request Body:**
```json
{
  "voyage_id": 1,
  "container_number": "MSCU1234567",
  "container_type": "40GP",
  "weight_lbs": 45000,
  "teu": 2,
  "seal_number": "SEAL123456",
  "cargo_manifest": [...]
}
```

**Response (201 Created):** Returns created container.

---

#### POST `/api/sea/containers/:id/assign`
Assign container to a voyage.

**Request Body:**
```json
{
  "voyage_id": 1
}
```

**Response (200 OK):** Returns updated container.

---

#### GET `/api/sea/statistics`
Get sea freight dashboard statistics.

**Response (200 OK):**
```json
{
  "totalVoyages": 8,
  "activeVoyages": 3,
  "inTransit": 2,
  "atPort": 1,
  "completedThisMonth": 2,
  "totalContainers": 156,
  "totalCargoLbs": 7500000,
  "pendingTransfers": 4
}
```

---

#### GET `/api/sea/port-schedule`
Get upcoming port arrivals and departures.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| days | integer | 30 | Days ahead to look (1-365) |

**Response (200 OK):**
```json
[
  {
    "voyageId": 1,
    "voyageName": "PACIFIC SURGE VOY-001",
    "vesselName": "USNS Brittin",
    "vesselHullNumber": "T-AKR-305",
    "port": "Yokohama, Japan",
    "eventType": "arrival",
    "scheduledTime": "2024-01-20T00:00:00Z",
    "actualTime": null,
    "status": "underway"
  }
]
```

---

### Warehouse Routes (`/api/warehouse`)

---

#### GET `/api/warehouse/sites`
List all warehouse sites with inventory counts.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "code": "HUMPHREYS-01",
    "name": "Camp Humphreys Depot",
    "address": "Camp Humphreys, Pyeongtaek, South Korea",
    "latitude": "36.9694",
    "longitude": "127.0316",
    "active": true,
    "item_count": 1250,
    "total_quantity": 8500
  }
]
```

---

#### POST `/api/warehouse/sites`
Create a new warehouse site.

**Request Body:**
```json
{
  "code": "HUMPHREYS-01",
  "name": "Camp Humphreys Depot",
  "address_line_1": "Building 1234",
  "city": "Pyeongtaek",
  "country": "South Korea",
  "timezone": "Asia/Seoul",
  "aor": "INDOPACOM",
  "dodaac": "W25G1N"
}
```

**Response (201 Created):** Returns created site with geocoded coordinates.

---

#### DELETE `/api/warehouse/sites/:siteId`
Delete a warehouse site and all related data.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Site and all related data deleted successfully",
  "deletedCounts": {
    "buildings": 3,
    "zones": 12,
    "locations": 150,
    "inventoryItems": 1250,
    "optimizationPlans": 5,
    "optimizationActions": 45
  }
}
```

---

#### GET `/api/warehouse/inventory`
List inventory items with pagination, filtering, and sorting.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| site_id | integer | - | Filter by site (required) |
| page | integer | 1 | Page number |
| limit | integer | 25 | Items per page (max 100) |
| search | string | - | Search NSN, nomenclature, part number |
| zone_id | integer | - | Filter by zone |
| condition_code | string | - | Filter by condition |
| is_hazmat | boolean | - | Filter hazmat items |
| sort_by | string | created_at | Column to sort by |
| sort_order | string | desc | 'asc' or 'desc' |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": 1,
      "site_id": 1,
      "zone_id": 3,
      "nsn": "2540-01-234-5678",
      "nomenclature": "WHEEL ASSEMBLY, VEHICLE",
      "cage_code": "12345",
      "quantity": 24,
      "unit_of_issue": "EA",
      "weight_lbs": 45,
      "location": "A-01-01-A",
      "condition_code": "A",
      "received_date": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 1250,
    "totalPages": 50
  }
}
```

---

#### POST `/api/warehouse/inventory`
Add a single inventory item.

**Request Body:**
```json
{
  "site_id": 1,
  "zone_id": 3,
  "nsn": "2540-01-234-5678",
  "nomenclature": "WHEEL ASSEMBLY, VEHICLE",
  "cage_code": "12345",
  "part_number": "WHL-ASSY-001",
  "quantity": 24,
  "unit_of_issue": "EA",
  "weight_lbs": 45,
  "location": "A-01-01-A",
  "condition_code": "A",
  "unit_price": 250.00
}
```

**Response (201 Created):** Returns created inventory item.

---

#### GET `/api/warehouse/transfers`
List inter-site transfers.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status |
| site_id | integer | Filter by source or destination site |

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "source_site_id": 1,
    "destination_site_id": 2,
    "status": "pending",
    "transport_mode": "ground",
    "priority_level": "priority",
    "priority_score": 50,
    "queue_position": 2,
    "scheduled_date": "2024-02-01T00:00:00Z",
    "transfer_items": [...],
    "source_site": { "name": "Camp Humphreys Depot" },
    "destination_site": { "name": "Osan AFB Supply" }
  }
]
```

---

#### POST `/api/warehouse/transfers`
Create a new inter-site transfer.

**Request Body:**
```json
{
  "source_site_id": 1,
  "destination_site_id": 2,
  "transport_mode": "ground",
  "priority_level": "priority",
  "scheduled_date": "2024-02-01T00:00:00Z",
  "transfer_items": [
    {
      "inventory_item_id": 1,
      "nsn": "2540-01-234-5678",
      "nomenclature": "WHEEL ASSEMBLY",
      "quantity": 10,
      "weight_lbs": 450
    }
  ],
  "notes": "Priority resupply for maintenance operations"
}
```

**Response (201 Created):** Returns created transfer.

---

### Transport Routes (`/api`)

---

#### GET `/api/manifests`
List all cross-modal manifests.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "manifest_number": "MAN-1706123456-ABC12",
    "name": "Humphreys to Osan Resupply",
    "source_site_id": 1,
    "destination_site_id": 2,
    "transport_mode": "land",
    "convoy_id": 1,
    "status": "in_transit",
    "total_weight_lbs": 15000,
    "total_items": 45,
    "priority": "priority"
  }
]
```

---

#### POST `/api/manifests`
Create a cross-modal manifest from selected inventory items.

**Request Body:**
```json
{
  "manifest": {
    "name": "Humphreys to Osan Resupply",
    "source_site_id": 1,
    "destination_site_id": 2,
    "priority": "priority",
    "required_delivery_date": "2024-02-05T00:00:00Z"
  },
  "items": [
    {
      "inventory_item_id": 1,
      "nsn": "2540-01-234-5678",
      "nomenclature": "WHEEL ASSEMBLY",
      "quantity": 10,
      "weight_lbs": 45
    }
  ]
}
```

**Response (201 Created):** Returns created manifest with auto-generated manifest_number.

---

#### PUT `/api/manifests/:id/assign-transport`
Assign transport mode and specific transport to manifest.

**Request Body:**
```json
{
  "transport_mode": "land",
  "convoy_id": 1,
  "estimated_cost_usd": 2500,
  "estimated_duration_hours": 3.5,
  "estimated_distance_miles": 45
}
```

**Response (200 OK):** Returns updated manifest.

---

#### GET `/api/operations/transport-pipeline`
Get unified transport data pipeline with 80% threshold alerts.

**Response (200 OK):**
```json
{
  "generatedAt": "2024-01-15T12:00:00Z",
  "thresholdPercent": 80,
  "summary": {
    "totalWarehouses": 5,
    "warehousesAboveThreshold": 1,
    "warehousesWillExceedThreshold": 2,
    "totalPendingTransfers": 15,
    "totalInboundCargoLbs": 250000,
    "byMode": {
      "air": { "transfers": 3 },
      "land": { "transfers": 8 },
      "sea": { "transfers": 4 }
    }
  },
  "thresholdAlerts": [
    {
      "siteId": 1,
      "siteName": "Osan AFB Supply",
      "alertType": "above_threshold",
      "currentUtilization": 85.5,
      "projectedUtilization": 92.3,
      "inboundLbs": 45000,
      "message": "Osan AFB Supply is currently at 85.5% utilization..."
    }
  ],
  "warehouses": [...]
}
```

---

#### GET `/api/transport/:mode/plans`
Get transport plans by mode (unified API).

**Path Parameters:**
| Parameter | Values | Description |
|-----------|--------|-------------|
| mode | air, land, sea | Transport mode |

**Response (200 OK):**
```json
{
  "plans": [
    {
      "id": 1,
      "name": "IRON THUNDER Convoy Alpha",
      "status": "en_route",
      "origin": "Camp Humphreys",
      "destination": "Osan AFB",
      "scheduledDeparture": "2024-02-01T06:00:00Z"
    }
  ]
}
```

---

#### POST `/api/routing/plan-multi-modal`
Plan a multi-modal route with automatic ocean crossing detection.

**Request Body:**
```json
{
  "origin": { "lat": 36.9694, "lng": 127.0316, "name": "Camp Humphreys" },
  "destination": { "lat": 32.7157, "lng": -117.1611, "name": "San Diego" },
  "cargoWeightLbs": 50000
}
```

**Response (200 OK):**
```json
{
  "requiresMultiModal": true,
  "oceanCrossingDetected": true,
  "recommendedModes": ["land", "sea", "land"],
  "legs": [
    {
      "mode": "land",
      "origin": "Camp Humphreys",
      "destination": "Busan Port",
      "distanceMiles": 180,
      "durationHours": 4
    },
    {
      "mode": "sea",
      "origin": "Busan Port",
      "destination": "San Diego Port",
      "distanceMiles": 5800,
      "durationHours": 336
    }
  ],
  "totalDistanceMiles": 6000,
  "totalDurationHours": 345,
  "estimatedCostUsd": 125000
}
```

---

### AI Insights Routes (`/api/insights`)

---

#### GET `/api/insights/health`
Check AWS Bedrock service health.

**Response (200 OK):**
```json
{
  "healthy": true,
  "modelId": "us.amazon.nova-lite-v1:0",
  "region": "us-east-2",
  "lastCheck": "2024-01-15T12:00:00Z"
}
```

---

#### POST `/api/insights/generate`
Generate AI insight with caching.

**Request Body:**
```json
{
  "type": "land_convoy_analysis",
  "inputData": {
    "convoyId": 1,
    "vehicleCount": 4,
    "totalWeight": 45000,
    "origin": "Camp Humphreys",
    "destination": "Osan AFB",
    "routeData": {...}
  },
  "flightPlanId": null,
  "forceRegenerate": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | One of the valid insight types |
| inputData | object | Yes | Context data for the insight |
| flightPlanId | integer | No | Associate with flight plan |
| forceRegenerate | boolean | No | Skip cache (default: false) |

**Response (200 OK):**
```json
{
  "insight": {
    "id": 1,
    "userId": 1,
    "insightType": "land_convoy_analysis",
    "content": {
      "summary": "The convoy is efficiently configured...",
      "recommendations": [
        "Consider consolidating loads to reduce vehicle count",
        "Route includes optimal rest stops"
      ],
      "riskFactors": [],
      "efficiency_score": 0.92
    },
    "tokenUsage": {
      "inputTokens": 1250,
      "outputTokens": 450,
      "totalTokens": 1700
    },
    "generatedAt": "2024-01-15T12:00:00Z",
    "fromCache": false
  },
  "fromCache": false
}
```

---

#### GET `/api/insights/flight-plan/:planId`
Get all cached insights for a flight plan.

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "userId": 1,
    "flightPlanId": 1,
    "insightType": "allocation_summary",
    "content": {...},
    "generatedAt": "2024-01-15T12:00:00Z"
  }
]
```

---

#### DELETE `/api/insights/flight-plan/:planId`
Clear all cached insights for a flight plan.

**Response (204 No Content):** Empty response

---

## Frontend Components

### Core Application Components

| Component | Path | Description |
|-----------|------|-------------|
| `App.tsx` | `/src/App.tsx` | Root application component with routing |
| `AuthScreen.tsx` | `/src/components/AuthScreen.tsx` | Login/register screen |
| `Dashboard.tsx` | `/src/components/Dashboard.tsx` | Main dashboard with mode selection |
| `OperationsHub.tsx` | `/src/components/OperationsHub.tsx` | Multi-modal operations hub |
| `PACAPApp.tsx` | `/src/components/PACAPApp.tsx` | PACAF air operations module |

### Section Components

| Component | Path | Lines | Description |
|-----------|------|-------|-------------|
| `AirOperations.tsx` | `/src/components/sections/AirOperations.tsx` | 1.8K | Air operations module |
| `LandLogistics.tsx` | `/src/components/sections/LandLogistics.tsx` | 71K | Land logistics with 3D |
| `SeaFreight.tsx` | `/src/components/sections/SeaFreight.tsx` | 73K | Sea freight with 3D |
| `WarehouseManagement.tsx` | `/src/components/sections/WarehouseManagement.tsx` | 12K | WMS entry point |

### 3D Visualization Components

| Component | Description |
|-----------|-------------|
| `ConvoyVisualization.tsx` | 3D convoy scene with animated vehicles |
| `SeaVisualization.tsx` | 3D maritime scene with animated ships and waves |
| `VehicleMesh.tsx` | Reusable vehicle 3D models (HEMTT, LMTV, FMTV) |

### Transport Components

| Component | Description |
|-----------|-------------|
| `TransportFlowmap.tsx` | Multi-modal route network visualization |
| `RouteMap.tsx` | Google Maps route display |
| `TransportTable.tsx` | Transport data table with sorting |
| `TransportForm.tsx` | Transport creation/edit form |
| `StatusBadge.tsx` | Transport status indicator |
| `CapacityWidget.tsx` | Vehicle/vessel capacity meter |

### Warehouse Components

| Component | Description |
|-----------|-------------|
| `WMSDashboard.tsx` | Main WMS dashboard |
| `WMSInventory.tsx` | Inventory management with filtering |
| `WMSOperations.tsx` | Transfer operations |
| `WMSSitesStorage.tsx` | Sites and zones management |
| `WMSInterSite.tsx` | Inter-site coordination hub |
| `CapacityForecast.tsx` | 30-day capacity projections |
| `NetworkInventoryMatrix.tsx` | Cross-site inventory visibility |
| `PriorityQueueDashboard.tsx` | Transfer priority queue |
| `RebalancingSuggestions.tsx` | AI-powered rebalancing |
| `SiteBenchmarks.tsx` | Site performance comparison |

---

## Services

### Frontend API Services

| Service | Lines | Description |
|---------|-------|-------------|
| `landService.ts` | 375 | Ground logistics API client |
| `seaService.ts` | 316 | Maritime logistics API client |
| `warehouseService.ts` | 1,749 | Comprehensive WMS API client |
| `flightService.ts` | 137 | Air operations API client |
| `transportService.ts` | 137 | Cross-modal transport API client |

### Backend Services

| Service | Description |
|---------|-------------|
| `bedrockService.ts` | AWS Bedrock AI integration |
| `googleMapsService.ts` | Google Maps API integration |
| `transportService.ts` | Unified transport operations |
| `vehicleAllocationService.ts` | Automatic vehicle allocation |
| `multiModalRoutingService.ts` | Ocean crossing detection |
| `capacityService.ts` | Warehouse capacity calculations |
| `warehouseAnalyticsService.ts` | WMS analytics and metrics |

---

## Authentication & Security

### JWT Authentication Flow

1. **Registration**: User registers with access code → Account created (pending)
2. **Approval**: Admin approves user → Account activated
3. **Login**: User authenticates → JWT token issued in httpOnly cookie
4. **Session**: Each request includes cookie → Middleware validates token
5. **Logout**: Session invalidated → Cookie cleared

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| `superadmin` | All operations across all organizations |
| `admin` | Manage users/codes within organization |
| `user` | Standard operations within organization |

### Security Measures

- **Password Hashing**: bcrypt with salt rounds
- **JWT Tokens**: Signed with secret, stored in httpOnly cookies
- **CSRF Protection**: SameSite=strict cookie attribute
- **Rate Limiting**: 
  - General API: 100 requests/minute
  - Auth endpoints: 10 requests/minute
  - AI endpoints: 10 requests/hour
- **Input Validation**: Zod schemas on all inputs
- **SQL Injection Prevention**: Drizzle ORM parameterized queries

---

## AI Integration

### AWS Bedrock Configuration

```typescript
{
  region: "us-east-2",
  model: "us.amazon.nova-lite-v1:0",
  maxTokens: 4096,
  temperature: 0.7,
  rateLimits: {
    perMinute: 10,
    perHour: 100
  }
}
```

### Cache Strategy

Insights are cached with SHA256 hash of input data:
- **Cache Hit**: Return stored insight (instant)
- **Cache Miss**: Generate via Bedrock, store with hash
- **Force Regenerate**: Skip cache on demand
- **Invalidation**: Automatic when input data changes

### Token Usage Tracking

Each insight records token usage for cost monitoring:
```json
{
  "inputTokens": 1250,
  "outputTokens": 450,
  "totalTokens": 1700
}
```

---

## Appendix: Status Enums

### Transport Status Lifecycle

```
draft → planned → loading → underway → completed
                                    ↓
                               cancelled
```

### Transfer Priority Levels

| Level | Score | Description |
|-------|-------|-------------|
| routine | 0 | Standard priority |
| priority | 50 | Elevated priority |
| immediate | 75 | Urgent |
| flash | 100 | Critical/emergency |

### Container Status

```
empty → loading → loaded → unloading → discharged
```

### Optimization Plan Status

```
pending → in_progress → completed
                     ↓
                  cancelled
```

---

*End of Documentation*

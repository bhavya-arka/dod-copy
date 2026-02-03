# ARKA Cargo Operations - Complete Technical Documentation

**Version:** 1.0  
**Last Updated:** January 2026  
**Platform:** Multi-Modal Military Logistics Management System

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Routes](#api-routes)
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

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| name | text | PACAF, DLA, MSC, TRANSCOM |
| description | text | Organization description |
| created_at | timestamp | Creation timestamp |
| updated_at | timestamp | Last update |

#### `users`
User accounts with organization assignment and role.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| email | text | Unique email address |
| username | text | Display name |
| password | text | bcrypt hashed password |
| first_name | text | First name |
| last_name | text | Last name |
| organization_id | integer | FK to organizations |
| role | text | superadmin, admin, user |
| is_active | boolean | Account approval status |
| created_at | timestamp | Creation timestamp |
| last_login_at | timestamp | Last login time |

#### `sessions`
JWT session tokens for authentication.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | FK to users |
| token | text | Unique session token |
| expires_at | timestamp | Expiration time |
| created_at | timestamp | Creation timestamp |

#### `access_codes`
Department Access Codes (DAC) for signup authorization.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| code | text | Unique access code |
| organization_id | integer | FK to organizations |
| created_by_user_id | integer | Admin who created |
| expires_at | timestamp | Expiration time |
| is_used | boolean | Usage status |
| used_by_user_id | integer | User who used code |

---

### Air Operations Tables

#### `flight_plans`
Complete airlift allocation results.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| name | text | Plan name |
| status | text | draft, complete, archived |
| scheduled_departure | timestamp | Planned departure |
| scheduled_arrival | timestamp | Planned arrival |
| actual_departure | timestamp | Actual departure |
| actual_arrival | timestamp | Actual arrival |
| allocation_data | jsonb | AllocationResult JSON |
| movement_data | jsonb | Parsed movement items |
| movement_items_count | integer | Item count |
| total_weight_lb | integer | Total weight |
| aircraft_count | integer | Aircraft used |
| preferred_aircraft_type_id | text | Preferred aircraft |
| allow_mixed_fleet | boolean | Mixed fleet allowed |
| mixed_fleet_mode | text | PREFERRED_FIRST, OPTIMIZE_COST, etc. |
| preference_strength | numeric | Preference weight 0-1 |

#### `flight_schedules`
Scheduled flights with timing.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| flight_plan_id | integer | FK to flight_plans |
| name | text | Schedule name |
| schedule_data | jsonb | ScheduledFlight[] JSON |
| total_flights | integer | Flight count |

#### `flight_nodes`
DAG nodes for flowchart visualization.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| flight_plan_id | integer | FK to flight_plans |
| node_type | text | airbase, flight |
| parent_node_id | integer | Parent node |
| position_x | integer | X position |
| position_y | integer | Y position |
| node_data | jsonb | Node-specific data |

#### `flight_edges`
Connections between flight nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| flight_plan_id | integer | FK to flight_plans |
| source_node_id | integer | Source node |
| target_node_id | integer | Target node |
| edge_data | jsonb | Route data (distance, fuel, time) |

#### `aircraft_types`
Registry of supported aircraft.

| Column | Type | Description |
|--------|------|-------------|
| id | text | Primary key (C17, C130H, C130J) |
| display_name | text | Human-readable name |
| active | boolean | Currently available |
| capacity_model_version | text | Capacity profile version |

#### `aircraft_capacity_profiles`
Versioned capacity specifications.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| aircraft_type_id | text | FK to aircraft_types |
| version | text | Profile version |
| max_payload_lb | integer | Maximum payload |
| max_pallet_positions | integer | Pallet positions |
| cargo_bay_dims | jsonb | {length, width, height} |
| default_cost_params | jsonb | Cost parameters |

---

### Land Logistics Tables

#### `land_vehicle_types`
Military ground vehicle registry.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| code | text | HEMTT, LMTV, FMTV, etc. |
| name | text | Full vehicle name |
| category | text | heavy_truck, medium_truck, etc. |
| capacity_lbs | integer | Max cargo weight |
| capacity_pallets | integer | Pallet positions |
| fuel_capacity_gallons | integer | Fuel tank size |
| range_miles | integer | Operating range |
| crew_size | integer | Required crew |
| active | boolean | Fleet availability |

#### `land_routes`
Ground transport routes.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| name | text | Route name |
| origin | text | Starting point |
| destination | text | Ending point |
| origin_lat | numeric | Origin latitude |
| origin_lng | numeric | Origin longitude |
| dest_lat | numeric | Destination latitude |
| dest_lng | numeric | Destination longitude |
| origin_site_id | integer | FK to warehouse_sites |
| destination_site_id | integer | FK to warehouse_sites |
| distance_miles | numeric | Route distance |
| estimated_duration_hours | numeric | Travel time |
| route_data | jsonb | Google Maps route JSON |
| status | text | draft, planned, underway, completed |

#### `land_convoys`
Ground convoy operations.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| name | text | Convoy name |
| route_id | integer | FK to land_routes |
| origin | text | Starting location |
| destination | text | Ending location |
| origin_site_id | integer | FK to warehouse_sites |
| destination_site_id | integer | FK to warehouse_sites |
| status | text | draft, planned, loading, underway, completed |
| scheduled_departure | timestamp | Planned departure |
| scheduled_arrival | timestamp | Planned arrival |
| actual_departure | timestamp | Actual departure |
| actual_arrival | timestamp | Actual arrival |
| manifest_data | jsonb | Cargo manifest items |
| total_weight_lbs | integer | Total cargo weight |
| total_vehicles | integer | Vehicle count |
| notes | text | Convoy notes |

#### `land_convoy_vehicles`
Vehicle assignments to convoys.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| convoy_id | integer | FK to land_convoys |
| vehicle_type_id | integer | FK to land_vehicle_types |
| vehicle_number | text | Vehicle identifier |
| cargo_weight_lbs | integer | Assigned cargo weight |
| cargo_items | jsonb | Assigned cargo items |
| sequence | integer | Position in convoy |
| status | text | assigned, loaded, in_transit, delivered |

---

### Sea Freight Tables

#### `sea_vessel_types`
MSC vessel type registry.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| code | text | LMSR, TAKR, TAO, TAKE, etc. |
| name | text | Vessel type name |
| designation | text | T-AKR, T-AO, T-AKE |
| category | text | oiler, cargo, transport, combat_logistics |
| cargo_capacity_lbs | integer | Max cargo weight |
| teu_capacity | integer | Container capacity (TEU) |
| fuel_capacity_barrels | integer | Fuel capacity |
| vehicle_capacity | integer | Vehicle deck slots |
| lane_meters | integer | RO/RO lane meters |
| displacement_tons | integer | Ship displacement |
| length_ft | integer | Ship length |
| beam_ft | integer | Ship width |
| max_speed_knots | integer | Maximum speed |
| cruise_speed_knots | integer | Cruising speed |
| range_nm | integer | Range in nautical miles |
| has_crane | boolean | Crane capability |
| has_roro_capability | boolean | Roll-on/roll-off |
| has_helicopter_deck | boolean | Helo pad |

#### `sea_voyages`
Maritime voyage operations.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| name | text | Voyage name |
| origin_port | text | Departure port |
| destination_port | text | Arrival port |
| vessel_type_id | integer | FK to sea_vessel_types |
| vessel_name | text | Ship name (e.g., USNS Brittin) |
| vessel_imo | text | IMO number |
| vessel_hull_number | text | Hull number |
| vessel_class | text | Vessel class |
| status | text | draft, planned, loading, underway, completed |
| scheduled_departure | timestamp | Planned departure |
| scheduled_arrival | timestamp | Planned arrival |
| actual_departure | timestamp | Actual departure |
| actual_arrival | timestamp | Actual arrival |
| port_calls | jsonb | Array of port stops |
| route_data | jsonb | Navigation route |

#### `sea_containers`
Container tracking for voyages.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| voyage_id | integer | FK to sea_voyages |
| container_number | text | ISO container ID |
| container_type | text | 20GP, 40GP, 40HC, 45HC |
| weight_lbs | integer | Loaded weight |
| teu | integer | TEU count (1 or 2) |
| seal_number | text | Security seal |
| status | text | empty, loading, loaded, unloading, discharged |
| cargo_manifest | jsonb | Container contents |
| position_bay | integer | Ship bay position |
| position_row | integer | Ship row position |
| position_tier | integer | Ship tier position |
| hazmat_class | text | Hazmat classification |
| is_reefer | boolean | Refrigerated container |
| temperature_setting | numeric | Reefer temperature |

---

### Warehouse Management Tables

#### `warehouse_sites`
Warehouse facility definitions.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| code | text | Site code |
| name | text | Facility name |
| location | text | Physical location |
| address | text | Street address |
| lat | numeric | Latitude |
| lng | numeric | Longitude |
| max_capacity_lbs | integer | Weight capacity |
| max_pallet_positions | integer | Pallet slots |
| current_utilization_pct | numeric | Current usage % |
| site_type | text | distribution, storage, port |
| active | boolean | Operational status |

#### `warehouse_zones`
Storage zones within sites.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| site_id | integer | FK to warehouse_sites |
| zone_code | text | Zone identifier |
| zone_name | text | Zone name |
| zone_type | text | bulk, rack, hazmat, cold_storage |
| max_capacity_lbs | integer | Weight capacity |
| max_pallet_positions | integer | Pallet slots |
| current_weight_lbs | integer | Current weight |
| current_pallets | integer | Current pallets |
| location_prefix | text | Location naming prefix |
| notes | text | Zone notes |

#### `warehouse_inventory_items`
Individual inventory items.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| site_id | integer | FK to warehouse_sites |
| zone_id | integer | FK to warehouse_zones |
| user_id | integer | Owner |
| nsn | text | National Stock Number |
| niin | text | National Item Identification Number |
| part_number | text | Part number |
| cage_code | text | CAGE code |
| nomenclature | text | Item description |
| unit_of_issue | text | EA, BX, KT, etc. |
| quantity | integer | Quantity on hand |
| unit_price | numeric | Unit cost |
| total_value | numeric | Extended value |
| weight_lbs | integer | Item weight |
| cube_ft | numeric | Cubic feet |
| location | text | Storage location |
| condition_code | text | A, B, F, H, etc. |
| lot_number | text | Lot/batch number |
| serial_number | text | Serial number |
| received_date | timestamp | Receipt date |
| expiration_date | timestamp | Expiration date |
| last_inventoried | timestamp | Last count date |
| hazmat_class | text | Hazmat classification |
| is_sensitive | boolean | Sensitive item flag |
| raw_row | jsonb | Original import data |

#### `warehouse_transfers`
Inter-site transfer operations.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| source_site_id | integer | Origin site |
| destination_site_id | integer | Destination site |
| status | text | pending, in_transit, completed |
| transport_mode | text | air, land, sea |
| transfer_items | jsonb | Items being transferred |
| priority_level | text | routine, priority, immediate, flash |
| priority_score | integer | Calculated priority score |
| queue_position | integer | Priority queue position |
| scheduled_date | timestamp | Planned transfer date |
| completed_date | timestamp | Actual completion date |

#### `warehouse_optimization_plans`
Optimization configurations and results.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| site_id | integer | FK to warehouse_sites |
| user_id | integer | Owner |
| name | text | Plan name |
| algorithm | text | cardstack, size_standardization, etc. |
| status | text | pending, in_progress, completed |
| version | integer | Plan version |
| diff_patch | jsonb | Movement operations |
| summary | jsonb | Result metrics |
| total_actions | integer | Total actions |
| completed_actions | integer | Completed actions |
| target_completion_date | timestamp | Target date |

---

### Cross-Modal Tables

#### `cross_modal_manifests`
Unified manifests across transport modes.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| source_site_id | integer | Origin warehouse |
| destination_site_id | integer | Destination warehouse |
| manifest_number | text | Unique manifest ID |
| name | text | Manifest name |
| priority | text | routine, priority, immediate, flash |
| transport_mode | text | air, land, sea |
| flight_plan_id | integer | FK for air transport |
| convoy_id | integer | FK for land transport |
| voyage_id | integer | FK for sea transport |
| total_weight_lbs | integer | Total weight |
| total_items | integer | Item count |
| status | text | draft, pending, assigned, in_transit, delivered |
| required_delivery_date | timestamp | RDD |
| estimated_departure | timestamp | ETD |
| estimated_arrival | timestamp | ETA |

#### `manifest_items`
Individual items within manifests.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| manifest_id | integer | FK to cross_modal_manifests |
| inventory_item_id | integer | FK to warehouse_inventory_items |
| nsn | text | National Stock Number |
| nomenclature | text | Item description |
| quantity | integer | Quantity |
| weight_lbs | integer | Weight |
| is_hazmat | boolean | Hazmat flag |
| picked | boolean | Picked status |
| packed | boolean | Packed status |
| loaded | boolean | Loaded status |

---

### AI Insights Table

#### `ai_insights`
Cached AI-generated insights.

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| user_id | integer | Owner |
| flight_plan_id | integer | Optional plan reference |
| insight_type | text | See insight types below |
| input_hash | text | SHA256 for cache validation |
| insight_data | jsonb | Generated insight JSON |
| token_usage | jsonb | Token consumption tracking |
| created_at | timestamp | Generation time |
| regenerated_at | timestamp | Last regeneration |

**Insight Types:**
- `allocation_summary` - Flight allocation analysis
- `land_convoy_analysis` - Convoy operation insights
- `land_route_optimization` - Route optimization
- `sea_voyage_analysis` - Maritime voyage insights
- `warehouse_capacity_forecast` - Capacity predictions
- `warehouse_demand_forecast` - Demand forecasting
- `warehouse_smart_placement` - Placement optimization
- `cross_modal_manifest_analysis` - Multi-modal analysis

---

## API Routes

### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register new user with access code |
| POST | `/login` | Authenticate and receive JWT token |
| POST | `/logout` | Invalidate session |
| GET | `/me` | Get current user profile |

### Admin Routes (`/api/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/organizations` | List all organizations |
| POST | `/organizations` | Create organization (superadmin) |
| GET | `/accesscodes` | List access codes |
| POST | `/accesscodes` | Create access code |
| GET | `/admin/users` | List users (admin) |
| PUT | `/admin/users/:id` | Update user |
| POST | `/admin/users/:id/approve` | Approve user |
| DELETE | `/admin/users/:id` | Delete user |
| POST | `/admin/seed-demo-data` | Seed demo data |

### Air Operations Routes (`/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/air/pending-transfers` | List transfers pending air transport |
| GET | `/flight-plans` | List all flight plans |
| GET | `/flight-plans/:id` | Get flight plan details |
| POST | `/flight-plans` | Create flight plan |
| PUT | `/flight-plans/:id` | Update flight plan |
| PATCH | `/flight-plans/:id/status` | Update flight plan status |
| DELETE | `/flight-plans/:id` | Delete flight plan |
| GET | `/flight-schedules` | List flight schedules |
| POST | `/flight-schedules` | Create flight schedule |
| GET | `/flight-plans/:planId/nodes` | Get plan nodes |
| POST | `/flight-plans/:planId/nodes` | Create node |

### Aircraft Management Routes (`/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/aircraft-types` | List all aircraft types |
| GET | `/aircraft-types/:typeId/capacity` | Get capacity profile |
| POST | `/plans/:planId/fleet-availability` | Set fleet availability |
| GET | `/plans/:planId/fleet-availability` | Get fleet availability |
| POST | `/plans/:planId/optimize` | Run fleet optimization |

### Land Logistics Routes (`/api/land`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vehicle-types` | List vehicle types |
| GET | `/vehicle-types/:id` | Get vehicle details |
| GET | `/pending-transfers` | List pending land transfers |
| GET | `/routes` | List all routes |
| GET | `/routes/:id` | Get route details |
| POST | `/routes` | Create route |
| PUT | `/routes/:id` | Update route |
| DELETE | `/routes/:id` | Delete route |
| GET | `/convoys` | List all convoys |
| GET | `/convoys/:id` | Get convoy details |
| POST | `/convoys` | Create convoy |
| PUT | `/convoys/:id` | Update convoy |
| PATCH | `/convoys/:id/status` | Update convoy status |
| DELETE | `/convoys/:id` | Delete convoy |
| GET | `/convoys/:id/vehicles` | Get convoy vehicles |
| POST | `/convoys/:id/vehicles` | Add vehicle to convoy |
| DELETE | `/convoys/:id/vehicles/:vehicleId` | Remove vehicle |
| GET | `/statistics` | Get land logistics statistics |
| GET | `/places/autocomplete` | Google Places autocomplete |
| GET | `/places/details/:placeId` | Get place details |
| POST | `/geocode` | Geocode address |
| POST | `/routes/:id/calculate` | Calculate route via Google Maps |
| GET | `/convoy-proposal` | Get AI convoy proposal |
| POST | `/auto-create-convoy` | Auto-create convoy from transfer |

### Sea Freight Routes (`/api/sea`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vessel-types` | List vessel types |
| POST | `/seed-vessels` | Seed MSC vessel data |
| GET | `/pending-transfers` | List pending sea transfers |
| GET | `/voyages` | List all voyages |
| GET | `/voyages/:id` | Get voyage details |
| POST | `/voyages` | Create voyage |
| PUT | `/voyages/:id` | Update voyage |
| PATCH | `/voyages/:id/status` | Update voyage status |
| DELETE | `/voyages/:id` | Delete voyage |
| GET | `/containers` | List all containers |
| GET | `/containers/:id` | Get container details |
| POST | `/containers` | Create container |
| PUT | `/containers/:id` | Update container |
| DELETE | `/containers/:id` | Delete container |
| GET | `/statistics` | Get sea freight statistics |
| GET | `/port-schedule` | Get port schedule |
| GET | `/voyage-proposal` | Get AI voyage proposal |
| POST | `/auto-create-voyage` | Auto-create voyage from transfer |
| POST | `/assign-voyage` | Assign voyage to transfer |

### Warehouse Routes (`/api/warehouse`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sites` | List warehouse sites |
| GET | `/sites/:id` | Get site details |
| POST | `/sites` | Create site |
| PUT | `/sites/:id` | Update site |
| DELETE | `/sites/:id` | Delete site |
| GET | `/sites/:siteId/zones` | List site zones |
| POST | `/sites/:siteId/zones` | Create zone |
| PUT | `/zones/:id` | Update zone |
| DELETE | `/zones/:id` | Delete zone |
| GET | `/inventory` | List inventory (paginated) |
| GET | `/inventory/:id` | Get item details |
| POST | `/inventory` | Add inventory item |
| PUT | `/inventory/:id` | Update item |
| DELETE | `/inventory/:id` | Delete item |
| POST | `/inventory/bulk` | Bulk import |
| GET | `/transfers` | List transfers |
| POST | `/transfers` | Create transfer |
| PUT | `/transfers/:id` | Update transfer |
| PATCH | `/transfers/:id/status` | Update transfer status |
| GET | `/statistics` | Get warehouse statistics |
| GET | `/optimization/plans` | List optimization plans |
| POST | `/optimization/plans` | Create optimization plan |
| POST | `/optimization/plans/:id/execute` | Execute plan |
| GET | `/forecasts/:siteId` | Get capacity forecast |
| GET | `/benchmarks` | Get site benchmarks |
| GET | `/inbound/:siteId` | Get inbound cargo feed |

### Transport Routes (`/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/manifests` | List cross-modal manifests |
| POST | `/manifests` | Create manifest |
| PUT | `/manifests/:id/assign-transport` | Assign transport mode |
| PUT | `/manifests/:id/status` | Update manifest status |
| GET | `/operations/transport-pipeline` | Get transport pipeline |
| GET | `/transport/:mode/plans` | Get plans by mode |
| POST | `/transport/:mode/plans` | Create transport plan |
| GET | `/transport/statistics` | Get unified statistics |
| GET | `/military-installations` | List military bases |
| POST | `/routing/plan-multi-modal` | Plan multi-modal route |

### Operations Routes (`/api/operations`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/summary` | Get operations dashboard summary |
| GET | `/predictive-forecast` | Get predictive transport forecast |

### AI Insights Routes (`/api/insights`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Check AI service health |
| GET | `/flight-plan/:planId` | Get plan insights |
| POST | `/generate` | Generate new insight |
| DELETE | `/flight-plan/:planId` | Clear plan insights cache |

### Utility Routes (`/api`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/weather/status` | Weather API status |
| GET | `/weather/:lat/:lon` | Get weather for coordinates |
| POST | `/airbases/resolve` | Resolve airbase codes |

---

## Frontend Components

### Core Application Components

| Component | Path | Description |
|-----------|------|-------------|
| `App.tsx` | `/src/App.tsx` | Root application component |
| `AuthScreen.tsx` | `/src/components/AuthScreen.tsx` | Login/register screen |
| `Dashboard.tsx` | `/src/components/Dashboard.tsx` | Main dashboard |
| `OperationsHub.tsx` | `/src/components/OperationsHub.tsx` | Multi-modal operations hub |
| `PACAPApp.tsx` | `/src/components/PACAPApp.tsx` | PACAF air operations |

### Section Components

| Component | Path | Description |
|-----------|------|-------------|
| `AirOperations.tsx` | `/src/components/sections/AirOperations.tsx` | Air operations module |
| `LandLogistics.tsx` | `/src/components/sections/LandLogistics.tsx` | Land logistics module (71KB) |
| `SeaFreight.tsx` | `/src/components/sections/SeaFreight.tsx` | Sea freight module (73KB) |
| `WarehouseManagement.tsx` | `/src/components/sections/WarehouseManagement.tsx` | WMS entry point |

### 3D Visualization Components

| Component | Path | Description |
|-----------|------|-------------|
| `ConvoyVisualization.tsx` | `/src/components/3d/ConvoyVisualization.tsx` | 3D convoy scene |
| `SeaVisualization.tsx` | `/src/components/3d/SeaVisualization.tsx` | 3D maritime scene |
| `VehicleMesh.tsx` | `/src/components/3d/VehicleMesh.tsx` | Vehicle 3D models |

### Transport Components

| Component | Path | Description |
|-----------|------|-------------|
| `StatusBadge.tsx` | `/src/components/transport/StatusBadge.tsx` | Transport status indicator |
| `TransportTable.tsx` | `/src/components/transport/TransportTable.tsx` | Transport data table |
| `TransportForm.tsx` | `/src/components/transport/TransportForm.tsx` | Transport creation form |
| `TransportFlowmap.tsx` | `/src/components/transport/TransportFlowmap.tsx` | Route network visualization |
| `RouteMap.tsx` | `/src/components/transport/RouteMap.tsx` | Google Maps route display |
| `LocationAutocomplete.tsx` | `/src/components/transport/LocationAutocomplete.tsx` | Address autocomplete |
| `CapacityWidget.tsx` | `/src/components/transport/CapacityWidget.tsx` | Vehicle capacity meter |
| `TransportAiInsights.tsx` | `/src/components/transport/TransportAiInsights.tsx` | AI insights panel |

### Warehouse Components

| Component | Path | Description |
|-----------|------|-------------|
| `WMSDashboard.tsx` | `/src/components/warehouse/WMSDashboard.tsx` | WMS main dashboard |
| `WMSInventory.tsx` | `/src/components/warehouse/WMSInventory.tsx` | Inventory management |
| `WMSOperations.tsx` | `/src/components/warehouse/WMSOperations.tsx` | Transfer operations |
| `WMSSitesStorage.tsx` | `/src/components/warehouse/WMSSitesStorage.tsx` | Sites and zones |
| `WMSAdmin.tsx` | `/src/components/warehouse/WMSAdmin.tsx` | Admin settings |
| `WMSAiInsights.tsx` | `/src/components/warehouse/WMSAiInsights.tsx` | AI analytics |
| `WMSInterSite.tsx` | `/src/components/warehouse/WMSInterSite.tsx` | Inter-site coordination |
| `WMSAnalyticsDashboard.tsx` | `/src/components/warehouse/WMSAnalyticsDashboard.tsx` | Analytics dashboard |
| `CapacityForecast.tsx` | `/src/components/warehouse/CapacityForecast.tsx` | 30-day forecast |
| `InboundCargoFeed.tsx` | `/src/components/warehouse/InboundCargoFeed.tsx` | Incoming cargo |
| `NetworkInventoryMatrix.tsx` | `/src/components/warehouse/NetworkInventoryMatrix.tsx` | Cross-site inventory |
| `PriorityQueueDashboard.tsx` | `/src/components/warehouse/PriorityQueueDashboard.tsx` | Transfer queue |
| `RebalancingSuggestions.tsx` | `/src/components/warehouse/RebalancingSuggestions.tsx` | AI rebalancing |
| `SiteBenchmarks.tsx` | `/src/components/warehouse/SiteBenchmarks.tsx` | Site comparison |
| `TransportCalendar.tsx` | `/src/components/warehouse/TransportCalendar.tsx` | Transport scheduling |

### Warehouse Modals

| Component | Path | Description |
|-----------|------|-------------|
| `TransferModal.tsx` | `/src/components/warehouse/modals/TransferModal.tsx` | Create transfer |
| `TransferDetailsModal.tsx` | `/src/components/warehouse/modals/TransferDetailsModal.tsx` | Transfer details |
| `OptimizationWizardModal.tsx` | `/src/components/warehouse/modals/OptimizationWizardModal.tsx` | Run optimization |
| `AddZoneModal.tsx` | `/src/components/warehouse/modals/AddZoneModal.tsx` | Add storage zone |
| `MoveToZoneModal.tsx` | `/src/components/warehouse/modals/MoveToZoneModal.tsx` | Move items |
| `VehiclePrioritySettingsModal.tsx` | `/src/components/warehouse/modals/VehiclePrioritySettingsModal.tsx` | Vehicle priorities |

### HUD Components (Air Operations)

| Component | Path | Description |
|-----------|------|-------------|
| `MissionHeader.tsx` | `/src/components/HUD/MissionHeader.tsx` | Mission info header |
| `LeftControlPanel.tsx` | `/src/components/HUD/LeftControlPanel.tsx` | Control panel |
| `RightMetricsPanel.tsx` | `/src/components/HUD/RightMetricsPanel.tsx` | Metrics display |
| `BottomStatusTicker.tsx` | `/src/components/HUD/BottomStatusTicker.tsx` | Status ticker |
| `CGZoneDiagram.tsx` | `/src/components/HUD/CGZoneDiagram.tsx` | Center of gravity |

### UI Components (Radix-based)

| Component | Description |
|-----------|-------------|
| `button.tsx` | Button variants |
| `card.tsx` | Card container |
| `dialog.tsx` | Modal dialog |
| `dropdown-menu.tsx` | Dropdown menus |
| `form.tsx` | Form components |
| `input.tsx` | Input fields |
| `select.tsx` | Select dropdowns |
| `table.tsx` | Data tables |
| `tabs.tsx` | Tab navigation |
| `toast.tsx` | Toast notifications |

---

## Services

### Frontend Services

#### `landService.ts` (375 lines)
Ground logistics API client.

**Functions:**
- `getVehicleTypes()` - Fetch vehicle registry
- `getRoutes()` / `createRoute()` / `updateRoute()` / `deleteRoute()`
- `getConvoys()` / `createConvoy()` / `updateConvoy()` / `deleteConvoy()`
- `updateConvoyStatus()` - Status transitions
- `getConvoyVehicles()` / `addConvoyVehicle()` / `removeConvoyVehicle()`
- `getStatistics()` - Dashboard metrics
- `getConvoyProposal()` - AI vehicle recommendations
- `autoCreateConvoy()` - Auto-create from transfer
- `placesAutocomplete()` / `placeDetails()` - Google Places

#### `seaService.ts` (316 lines)
Maritime logistics API client.

**Functions:**
- `getVesselTypes()` - Fetch MSC vessel registry
- `getVoyages()` / `createVoyage()` / `updateVoyage()` / `deleteVoyage()`
- `updateVoyageStatus()` - Status transitions
- `getContainers()` / `createContainer()` / `updateContainer()` / `deleteContainer()`
- `getStatistics()` - Dashboard metrics
- `getPortSchedule()` - Port call timeline
- `getVoyageProposal()` - AI vessel recommendations
- `autoCreateVoyage()` - Auto-create from transfer
- `assignVoyageToTransfer()` - Link voyage to transfer

#### `warehouseService.ts` (1749 lines)
Comprehensive WMS API client.

**Functions:**
- Site management: `getSites()`, `createSite()`, `updateSite()`, `deleteSite()`
- Zone management: `getZones()`, `createZone()`, `updateZone()`, `deleteZone()`
- Inventory: `getInventory()`, `addItem()`, `updateItem()`, `deleteItem()`, `bulkImport()`
- Transfers: `getTransfers()`, `createTransfer()`, `updateTransferStatus()`
- Optimization: `getOptimizationPlans()`, `createOptimizationPlan()`, `executePlan()`
- Analytics: `getStatistics()`, `getForecasts()`, `getBenchmarks()`
- AI: `getAiRecommendations()`, `runDemandForecast()`, `runAnomalyDetection()`
- Inter-site: `getPriorityQueue()`, `getNetworkMatrix()`, `getRebalancingSuggestions()`

#### `flightService.ts` (137 lines)
Air operations API client.

**Functions:**
- `getFlightPlans()` / `createFlightPlan()` / `updateFlightPlan()`
- `updateFlightPlanStatus()` - Status transitions
- `getFlightSchedules()` / `createFlightSchedule()`

#### `transportService.ts` (137 lines)
Cross-modal transport API client.

**Functions:**
- `getManifests()` / `createManifest()` / `updateManifest()`
- `assignTransportToManifest()` - Link to transport mode
- `getTransportPipeline()` - Unified pipeline view
- `getStatistics()` - Cross-modal metrics

---

## Authentication & Security

### JWT Authentication Flow

1. **Registration**: User registers with access code → Account created (inactive)
2. **Approval**: Admin approves user → Account activated
3. **Login**: User authenticates → JWT token issued, stored in httpOnly cookie
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
  knowledgeBase: "configured",
  rateLimits: {
    perMinute: 10,
    perHour: 100
  }
}
```

### Insight Types

| Type | Description |
|------|-------------|
| `warehouse_capacity_forecast` | 30/60/90 day capacity projections |
| `warehouse_demand_forecast` | Demand pattern analysis |
| `warehouse_anomaly_detection` | Unusual activity detection |
| `warehouse_smart_placement` | Optimal item placement |
| `warehouse_inventory_velocity` | Turnover analysis |
| `land_convoy_analysis` | Convoy efficiency insights |
| `land_route_optimization` | Route improvement suggestions |
| `sea_voyage_analysis` | Maritime operation insights |
| `cross_modal_manifest_analysis` | Multi-modal optimization |

### Cache Strategy

Insights are cached with SHA256 hash of input data:
- **Cache Hit**: Return stored insight (instant)
- **Cache Miss**: Generate via Bedrock, store with hash
- **Invalidation**: Automatic when input data changes

---

## Appendix: Status Enums

### Transport Status Lifecycle

```
draft → planned → loading → underway → completed
                                    ↓
                               cancelled
```

### Warehouse Transfer Priority

```
routine (0) → priority (50) → immediate (75) → flash (100)
```

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

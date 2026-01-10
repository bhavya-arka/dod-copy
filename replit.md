# Overview

Arka Cargo Operations is a comprehensive multi-modal logistics platform designed for Air, Land, Sea, and Warehouse operations. Its primary purpose is to streamline complex cargo movements and warehouse management, offering intuitive navigation and responsive design. The platform aims to provide a unified system for military and commercial logistics, enhancing efficiency, optimization, and real-time tracking across diverse operational domains.

## Key Capabilities

- **Air Operations (PACAF Airlift)**: C-17/C-130 load planning, 463L palletization, route optimization, and 3D cargo visualization.
- **Land Logistics**: Ground transport convoy planning with Google Maps integration for location selection, route calculation, and distance matrix.
- **Sea Freight**: Maritime container planning, vessel manifests, and port logistics.
- **Warehouse Management (WMS)**: Multi-site inventory tracking, pallet positioning, aging alerts, and capacity optimization.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Multi-Modal Operations Hub
The system provides an Operations Hub with distinct modules for Air, Land, Sea, and Warehouse operations, each with a tailored workflow.

## Full-Stack Architecture
The project is structured as a Turborepo monorepo:
- **`apps/client/`**: React 18+ frontend with TypeScript and Vite.
- **`apps/server/`**: Express.js backend providing RESTful API endpoints.
- **`packages/shared/`**: Shared schemas, types, and transport definitions.
- **`packages/config/`**: Shared configurations.
- **`shared/`**: Drizzle schema for database definitions.

## Modular Transport Architecture
The system uses a unified, mode-agnostic transport layer for Air, Land, and Sea operations:

### Shared Components
- **`packages/shared/transportTypes.ts`**: Unified TypeScript types (TransportMode, TransportStatus, TransportPlan, TransportAsset) and state machine transitions.
- **`apps/server/services/transportService.ts`**: Mode-agnostic CRUD operations that map to flightPlans, landConvoys, and seaVoyages tables.
- **`apps/client/src/components/transport/`**: Reusable React components (StatusBadge, TransportTable, TransportForm, CapacityWidget).

### Unified API Endpoints
- `GET/POST /api/transport/:mode/plans` - List/create transport plans
- `GET/PUT /api/transport/:mode/plans/:id` - Get/update single plan
- `POST /api/transport/:mode/plans/:id/transition` - Status transitions with WMS integration
- `GET /api/transport/:mode/statistics` - Mode-specific statistics
- `GET /api/transport/statistics` - Cross-modal statistics

### Transport State Machine
All transport modes follow unified lifecycle: `draft → planned → loading → underway → completed`
- Status transitions are validated before execution
- Completing transport automatically updates related WMS manifests

### 3D Visualization Infrastructure
- **`apps/client/src/lib/vehicleDimensions.ts`**: Military vehicle dimensions (LMTV, HEMTT, HET, MTVR, PLS, C-17, C-130, ships) with scaling utilities.
- **`apps/client/src/components/3d/VehicleMesh.tsx`**: Reusable Three.js vehicle component with accurate proportions.
- **`apps/client/src/components/3d/ConvoyVisualization.tsx`**: 3D convoy scene with formation spacing, status-based animation, and dust particles.

### Google Maps Integration (Land Logistics)
Backend service (`apps/server/services/googleMapsService.ts`) using GOOGLE_API_KEY secret:
- **Geocoding**: Address-to-coordinates and reverse geocoding
- **Route Calculation**: Driving directions with waypoints, avoid tolls/highways options
- **Distance Matrix**: Multi-origin/destination distance calculations
- **Place Autocomplete**: Location search with session tokens for efficiency
- **Place Details**: Full location details from place IDs

API Endpoints:
- `POST /api/land/routes/calculate` - Calculate route between locations
- `GET /api/land/places/autocomplete?input=query` - Location autocomplete
- `GET /api/land/places/:placeId` - Get place details
- `POST /api/land/routes/optimize` - Distance matrix for multiple stops

Frontend Components:
- **`LocationAutocomplete`**: Google Places-powered location input with 300ms debouncing
- **`RouteMap`**: Leaflet map with CARTO dark tiles showing routes with markers and polylines

## PACAF Air Operations Pipeline
The Air module features a multi-stage pipeline:
1.  **Input Layer**: CSV/JSON movement list uploads.
2.  **Parser & Validator**: Data parsing and validation.
3.  **Classification**: Categorization by phase and cargo type.
4.  **Palletization Engine**: 463L pallet system using a bin-packing algorithm.
5.  **Aircraft Allocation Solver**: Cargo allocation based on weight, position, and Center of Balance (CoB).
6.  **ICODES Visualization**: 2D aircraft diagrams with lateral pallet placement.
7.  **AI Insights**: Summarization and optimization recommendations.

The system supports C-17 Globemaster III and C-130H/J Hercules aircraft, adhering to standardized 463L pallet specifications. Cargo loading/unloading is simulated with a forward-to-aft sequence based on destination and cargo type.

## DLA-Compliant Warehouse Management System (WMS)
The WMS is modular, featuring a 7-section navigation (Dashboard, Inventory, Operations, Sites & Storage, Analytics, AI Insights, Admin). Key features include:
- Multi-site inventory tracking and pallet-level location management.
- NSN validation (####-##-###-####), aging alerts (>7 years), and weight constraints.
- **DLA Pallet Standards**: 4×4×4 ft pallet blocks, ≤2,000 lbs per pallet, with real-time capacity tracking.
- **Site Assignment Logic**: Scoring algorithm considers AOR match (+25), capacity utilization, shipyard avoidance (-20), and weight capacity.
- **Manifest Parsers**: CSV, MILSTRIP (fixed-width with document identifiers), and FEDLOG (tab/pipe/comma-delimited) auto-detection.
- PDF/CSV/XLSX file import with comprehensive validation (50+ BATS columns supported).
- **Dynamic Column System**: Inventory columns are defined in `packages/shared/inventoryColumns.ts` as a single source of truth, fetched via API, and automatically merged with saved user preferences.
- **Zone Management with PDF-Style Pallet Position Metrics**:
  - Filtering by zone type (indoor/outdoor), usage type, and capacity status
  - Capacity summary cards showing rack vs bulk pallet positions (Available/Occupied/Open)
  - Resync feature to recalculate unique pallet positions from inventory locations
  - Historical capacity tracking via `warehouse_zone_capacity_history` table
  - Manual capacity editing for rack_available and bulk_available per zone
  - Color-coded utilization indicators (green <60%, yellow 60-85%, red >85%)
  - Confidence levels (HIGH/MEDIUM/LOW) for derived metrics
- **Pallet Position Analytics Service** (`apps/server/services/palletPositionService.ts`):
  - PDF-style warehouse metrics matching standard warehouse reports
  - Counts unique pallet positions (not raw inventory items)
  - Location classification: RACK (####-A/B pattern), BULK (BULK02, BULK03, etc.), UNKNOWN
  - Normalization: uppercase, trim, collapse whitespace, expand shorthand (4060-A/B)
  - Configurable BOX handling (ignore vs count as separate positions)
  - Configurable WHSE rule (ignore vs treat as bulk)
  - Caching with 60-second TTL and invalidation hooks
  - API: `GET /api/warehouse/sites/:siteId/zones/pallet-metrics`
- **Zone Capacity Service** (`apps/server/services/zoneCapacityService.ts`):
  - `recordCapacityHistory()`: Saves capacity snapshots for historical analysis
  - Legacy item count tracking for backward compatibility
- **Optimization Wizard** with 4 algorithms:
  - **CardStack**: Stacks similar items to reduce footprint and improve picking efficiency.
  - **Size Standardization**: Groups items by dimensions to optimize rack utilization.
  - **Value Density Analysis**: Organizes by value-to-volume ratio for accessibility.
  - **Bin-Packing Order**: Calculates optimal placement for maximum container utilization.
  - **Target Completion Dates**: Plans can have target dates for forecasting warehouse load over time.
  - **Bulk Start All**: Single button to start all pending optimization moves at once.
- **AI-Powered Analysis**: Uses AWS Bedrock (Nova Lite model) for warehouse-specific insights including placement optimization, load balancing recommendations, and aging alerts.
- Inter-warehouse transfers linked to Air, Land, or Sea transport modes.
- **90-Day Predictive Load Planning**: Forecasts capacity needs based on historical convoy/voyage/flight patterns, plus active optimization plans with target completion dates for capacity impact projections.
- **Capacity Visualization**: Color-coded status indicators (green <60%, yellow 60-85%, red >85%) with trend arrows.

## Data Models
Key data models include `MovementItem`, `Pallet463L`, `AircraftLoadPlan`, `AllocationResult` for air operations, and `warehouse_sites`, `warehouse_buildings`, `warehouse_zones`, `warehouse_locations`, `warehouse_inventory_items`, `warehouse_transfers` for WMS. Land and Sea modules have `land_routes`, `land_convoys`, `sea_voyages`, and `sea_containers`.

## Government Compliance & Federal Standards
The system supports National Stock Numbers (NSN) format (FSC and NIIN components), Commercial and Government Entity (CAGE) codes, and integrates with Military Sealift Command (MSC) vessel designations (T-AO, T-AKR, T-EPF, T-AH, T-ARS). Data structures align with Federal Logistics Information System (FLIS) standards.

## UI/UX Design
The platform uses a responsive, mobile-first design with a consistent navigation. A dark theme with gradient accents is applied per section: Air (Blue/Cyan), Land (Amber/Orange), Sea (Teal/Emerald), and Warehouse (Purple/Pink).

## Military Organization & Role-Based Access Control

### Organizations
The system supports four military organizations:
- **PACAF** - Pacific Air Forces
- **DLA** - Defense Logistics Agency  
- **MSC** - Military Sealift Command
- **TRANSCOM** - United States Transportation Command

### Roles & Permissions
| Role         | Scope                        | Capabilities                                                    |
|--------------|------------------------------|-----------------------------------------------------------------|
| Superadmin   | Global                       | Full system access; create/edit/delete admins and users        |
| Admin        | PACAF / DLA / MSC / TRANSCOM | Approve members, manage accounts within branch, generate DACs  |
| User         | Assigned branch              | Standard access based on branch and privileges                  |

### Database Tables
- `organizations` - Stores PACAF, DLA, MSC, TRANSCOM
- `access_codes` - Department Access Codes (DAC) for signup
- `users` - Extended with organization_id, role, is_active, first_name, last_name

### Authentication Flow
1. User signs up with valid Department Access Code (DAC)
2. Branch Admin notified and approves user
3. User becomes active and can access the system
4. Superadmin (bhavya091213@gmail.com) has full access and bypasses restrictions

### API Endpoints
**Organizations:**
- `GET /api/organizations` - List all orgs (authenticated users)
- `POST /api/organizations` - Create org (superadmin only)

**Access Codes:**
- `GET /api/accesscodes` - List access codes (org-scoped for admins)
- `POST /api/accesscodes` - Generate DAC (admins/superadmin)

**Admin User Management:**
- `GET /api/admin/users` - List users (org-scoped)
- `PUT /api/admin/users/:id` - Update user
- `POST /api/admin/users/:id/approve` - Approve pending user
- `DELETE /api/admin/users/:id` - Delete user
- `POST /api/admin/seed-organizations` - Seed default orgs (superadmin)

## AI Insights Configuration
AI insights are powered by AWS Bedrock with the Nova Lite model and structured prompts.

### Insight Types
- **Air Operations**: allocation_summary, cob_analysis, pallet_review, route_planning, compliance, mission_briefing, mission_analytics, flight_allocation_analysis
- **Land Logistics**: land_convoy_analysis, land_route_optimization
- **Sea Freight**: sea_voyage_analysis, sea_container_optimization
- **Cross-Modal**: cross_modal_manifest_analysis
- **Warehouse**: warehouse_capacity_forecast

### Key Components
- **`apps/server/services/bedrockService.ts`**: AWS Bedrock integration with structured JSON schemas and guardrails
- **`apps/client/src/components/transport/TransportAiInsights.tsx`**: Shared AI insights panel for Land and Sea modules
- **`apps/client/src/components/warehouse/WMSAiInsights.tsx`**: Warehouse-specific AI optimization wizard
- **`apps/client/src/hooks/useAiInsights.ts`**: React hook for AI insight generation with caching

### API Endpoint
- `POST /api/insights/generate` - Generate AI insights with type, inputData, and optional planId

# External Dependencies

**Database Services**:
- Neon (@neondatabase/serverless)
- Drizzle ORM

**3D Graphics**:
- React Three Fiber
- React Three Drei
- Three.js

**Maps & Geolocation**:
- Google Maps API (via GOOGLE_API_KEY secret)
- Leaflet (route visualization)

**UI Framework**:
- Radix UI components
- Tailwind CSS
- Framer Motion
- Lucide React icons

**State Management**:
- Zustand
- TanStack Query

**Development Tools**:
- TypeScript
- Vite
- ESBuild
# Overview

Arka Cargo Operations is a multi-modal logistics platform designed for Air, Land, Sea, and Warehouse operations. Its primary purpose is to streamline complex cargo movements and warehouse management for both military and commercial logistics. The platform aims to provide a unified system that enhances efficiency, optimization, and real-time tracking across diverse operational domains. Key capabilities include C-17/C-130 load planning and 3D cargo visualization for Air, ground transport convoy planning with Google Maps integration for Land, maritime container planning for Sea, and multi-site inventory tracking with capacity optimization for Warehouse operations.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Multi-Modal Operations Hub
The system features an Operations Hub with distinct modules for Air, Land, Sea, and Warehouse operations, each with a tailored workflow.

## Full-Stack Architecture
The project utilizes a Turborepo monorepo structure:
- **`apps/client/`**: React 18+ frontend with TypeScript and Vite.
- **`apps/server/`**: Express.js backend providing RESTful API endpoints.
- **`packages/shared/`**: Shared schemas, types, and transport definitions.
- **`packages/config/`**: Shared configurations.
- **`shared/`**: Drizzle schema for database definitions.

## Modular Transport Architecture
A unified, mode-agnostic transport layer handles Air, Land, and Sea operations, featuring shared TypeScript types for `TransportMode`, `TransportStatus`, `TransportPlan`, and `TransportAsset`, along with mode-agnostic CRUD operations on the backend. All transport modes follow a unified lifecycle: `draft → planned → loading → underway → completed`, with status transitions validated and WMS integration upon completion.

## 3D Visualization Infrastructure
The system incorporates 3D visualization capabilities using Three.js, with reusable components for military vehicle meshes and convoy scene rendering, including accurate proportions and status-based animations.

## Google Maps Integration (Land Logistics)
The backend integrates with Google Maps API for geocoding, route calculation, distance matrix computations, and place autocomplete. Frontend components like `LocationAutocomplete` and `RouteMap` provide interactive map functionalities.

## PACAF Air Operations Pipeline
The Air module implements a multi-stage pipeline for cargo planning, including CSV/JSON uploads, data parsing and validation, classification, 463L palletization using a bin-packing algorithm, aircraft allocation solving based on weight and Center of Balance (CoB), and 2D ICODES visualization for C-17 and C-130 aircraft.

## DLA-Compliant Warehouse Management System (WMS)
The WMS provides multi-site inventory tracking, pallet-level location management, NSN validation, aging alerts, and DLA pallet standard adherence (4x4x4 ft, <=2,000 lbs). It includes site assignment logic, manifest parsers (CSV, MILSTRIP, FEDLOG), and a dynamic column system for inventory. Key features include zone management with PDF-style pallet position metrics, historical capacity tracking, and color-coded utilization indicators. An Optimization Wizard offers four algorithms (CardStack, Size Standardization, Value Density Analysis, Bin-Packing Order) with target completion dates and bulk start options. AI-powered analysis using AWS Bedrock provides insights for placement optimization and load balancing. The system also supports inter-warehouse transfers and 90-day predictive load planning. Smart Alerts & Analytics include threshold and trend-based capacity alerts, aging alerts, and throughput metrics.

## Automatic Vehicle Allocation for Ground Transfers
The system provides automatic vehicle calculation for ground transfers between warehouses:
- **Vehicle Priority Settings**: Superadmins can configure which vehicle types to use and their priority order (lower number = higher priority). Managed via WMSAdmin panel.
- **Greedy Allocation Algorithm**: Calculates minimum vehicles needed based on total cargo weight and priority-ordered vehicle types with their payload capacities.
- **Transfer Preview**: Before creating a ground transfer, users see a vehicle allocation preview showing total weight, required vehicles by type, and capacity utilization percentage.
- **Validation**: The system validates vehicle priority settings to prevent duplicate vehicle types, duplicate priority orders, and non-positive priority values.
- **Graceful Fallback**: Transfers proceed even without configured priorities, with warnings displayed in the metadata for manual allocation.
- **Ground Transport Metadata**: Stored in camelCase JSON format (totalWeightLbs, allocations, totalVehicles, totalCapacity, utilizationPercent, calculatedAt) with optional warning/error fields.
- **Automatic Weight Estimation**: Items without explicit weight data receive estimated weights: 500 lbs default per unit, or dimensions-based calculation (L×W×H × 0.02 lbs/in³ density) when dimensions are available. The UI displays "(estimated)" indicators and informational messages when weights are calculated.

## Unified Transport Data Pipeline
The system provides standardized transport data aggregation for warehouse forecasting:
- **Cross-Modal Manifest System**: Links warehouse transfers to convoys, flight plans, and voyages with manifest creation and transport assignment workflows.
- **Transfer Workflow**: Transfers follow a lifecycle: `pending → manifest_created → transport_assigned → in_transit → completed`.
- **Transfer Order Management**: Interactive TransferDetailsModal with comprehensive lifecycle tracking:
  - Lifecycle timers: Age (days since creation), days in transit, ETA countdown
  - Overdue alerts with animated red badge when past scheduled date
  - Transport assignment display: linked convoy, flight plan, or voyage IDs
  - Destination site utilization preview with color-coded progress bar
  - Status management: mark in transit, complete, or cancel transfers
  - Expected arrival date and notes editing
- **Inbound Cargo Tracking**: Aggregates inbound cargo by destination warehouse for each transport mode (air, land, sea).
- **80% Utilization Threshold Alerts**: Tracks warehouse utilization and generates alerts when sites exceed or will exceed 80% capacity.
- **Predictive Forecasting**: Enhanced predictive forecast endpoint includes warehouse transfers and threshold-based capacity warnings.
- **Transport Pipeline API**: Dedicated `/api/operations/transport-pipeline` endpoint provides standardized transport data per warehouse with inbound cargo breakdown by mode.
- **Pending Transfers in Logistics Modules**: Land Logistics and Air Operations show pending warehouse transfers that can be assigned to convoys or flight plans.

## Military Sealift Command (MSC) Sea Freight Operations
The Sea Freight module provides comprehensive maritime logistics:
- **Vessel Types Database**: 10 authentic MSC vessel types including Henry J. Kaiser-class oilers (T-AO), Bob Hope/Watson-class LMSR, Spearhead-class EPF, hospital ships, and more with full specifications (cargo capacity, TEU, speed, crew).
- **Tab-Based Navigation**: Overview, Voyages, Containers, Transfers, and Schedule tabs for intuitive workflow.
- **Voyage Management**: Full CRUD with vessel type selection, hull number, IMO, and status lifecycle (draft → planned → loading → underway → completed).
- **Container Management**: Container tracking with status badges (Empty, Loading, Loaded, Unloading, Discharged) and voyage assignment.
- **Port Schedule**: Dynamic display of upcoming arrivals/departures computed from voyage data.
- **Voyage Proposal System**: Recommends suitable vessel types based on total cargo weight when assigning warehouse transfers.
- **Weight Estimation**: Auto-calculates 500 lbs default or dimensions-based (L×W×H × 0.02 lbs/in³) for items without explicit weights.
- **API Endpoints**: 16+ routes at `/api/sea/*` for vessel types, voyages, containers, statistics, port schedule, and warehouse transfer integration.

## Data Models
Key data models support `MovementItem`, `Pallet463L`, `AircraftLoadPlan` for air operations, `warehouse_sites`, `warehouse_inventory_items` for WMS, `land_routes`, `land_convoys` for ground transport, and `sea_voyages`, `sea_containers`, `sea_vessel_types` for maritime operations.

## Government Compliance & Federal Standards
The system supports National Stock Numbers (NSN), Commercial and Government Entity (CAGE) codes, and integrates with Military Sealift Command (MSC) vessel designations, aligning with Federal Logistics Information System (FLIS) standards.

## UI/UX Design
The platform features a responsive, mobile-first design with a consistent navigation and a dark theme. Each section (Air, Land, Sea, Warehouse) utilizes distinct gradient accent colors.

## Military Organization & Role-Based Access Control
The system supports four military organizations (PACAF, DLA, MSC, TRANSCOM) with a role-based access control (RBAC) system. Roles include Superadmin, Admin (branch-specific), and User, managed through Department Access Codes (DACs) and an approval workflow.

## AI Insights Configuration
AI insights are generated using AWS Bedrock with the Nova Lite model and structured prompts, covering various insight types for Air Operations, Land Logistics, Sea Freight, Cross-Modal analysis, and Warehouse management.

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
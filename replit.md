# Overview

Arka Cargo Operations is a comprehensive multi-modal logistics platform spanning Air, Land, Sea, and Warehouse operations. The system provides intuitive navigation between cargo operation subsections with responsive design throughout.

## Key Modules

1. **Air Operations (PACAF Airlift)**: C-17/C-130 load planning, 463L palletization, route optimization, 3D cargo visualization
2. **Land Logistics**: Ground transport convoy planning, truck routing, overland cargo manifests
3. **Sea Freight**: Maritime container planning, vessel manifests, port logistics
4. **Warehouse Management (WMS)**: Multi-site inventory tracking, pallet positioning, aging alerts, capacity optimization

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Multi-Modal Operations Hub
After authentication, users see an Operations Hub with large navigation tiles for each module. Each section has its own workflow:
- **Air**: Upload → Parse → Classify → Palletize → Allocate → Visualize → Route Plan
- **Land**: Route → Convoy → Manifest → Track → Complete
- **Sea**: Voyage → Container → Port Calls → Track → Complete
- **Warehouse**: Sites → Buildings → Zones → Locations → Inventory → Optimize

## Full-Stack Architecture
The project is built as a Turborepo monorepo with the following structure:
- **`apps/client/`**: React 18+ frontend with TypeScript and Vite
- **`apps/server/`**: Express.js backend providing RESTful API endpoints
- **`packages/shared/`**: Contains shared schemas and types across the monorepo
- **`packages/config/`**: Stores shared configurations
- **`shared/`**: Drizzle schema (database schema source of truth)

## Navigation Structure
```
Auth Screen
    ↓
Operations Hub (main navigation)
    ├── Air Operations (existing PACAF system)
    │   ├── Flight Plans Dashboard
    │   └── PACAPApp (planning workflow)
    ├── Land Logistics
    │   ├── Routes Dashboard
    │   └── Convoy Planning
    ├── Sea Freight
    │   ├── Voyages Dashboard
    │   └── Container Management
    └── Warehouse Management
        ├── Overview
        ├── Inventory
        ├── Locations
        └── Analytics
```

## PACAF Air Operations Pipeline
The air module processes data through a multi-stage pipeline:
1. **Input Layer**: Handles CSV/JSON movement list uploads
2. **Parser & Validator**: Parses and validates incoming data
3. **Classification**: Categorizes items by phase (ADVON/MAIN) and cargo type
4. **Palletization Engine**: Implements a 463L pallet system using a bin-packing algorithm
5. **Aircraft Allocation Solver**: Allocates cargo based on weight, position constraints, and Center of Balance (CoB) calculations
6. **ICODES Visualization**: Generates 2D aircraft diagrams with lateral pallet placement
7. **AI Insights**: Provides AI-driven summarization, optimization recommendations

## Aircraft Specifications
The system supports C-17 Globemaster III and C-130H/J Hercules, each with specific pallet positions, maximum payloads, dimensions, per-position weight limits, CoB envelope requirements, and seat zone configurations.

## 463L Pallet System
Supports standardized 463L pallets (108" × 88", 104" × 84" usable area) with defined tare weight, max payload limits, and tiedown rings.

## Data Models
Key data models include `MovementItem`, `Pallet463L`, `AircraftLoadPlan`, and `AllocationResult`. Flight plans are persisted and loaded via `/api/flight-plans`.

## Cargo Loading/Unloading Simulation
The 3D viewer includes an interactive cargo loading/unloading animation system:

**Coordinate System**: The solver uses ramp-origin coordinates (x=0 at ramp/aft, increasing toward nose/forward). Lower position_coord = AFT, higher = FORWARD.

**Loading Sequence (Forward to Aft)**:
- Primary: Cargo for LAST stop loads FIRST (positioned deepest in aircraft)
- Secondary: Within same stop, forward positions (higher position_coord) load first
- Tertiary: Non-hazmat before hazmat within same stop/position group

**PDF Export**: Uses actual position_coord values for layout positioning and displays station coordinates in inches.

## Warehouse Management System

### Database Schema
- **warehouse_sites**: Top-level warehouse locations with geolocation
- **warehouse_buildings**: Physical buildings within sites (B-870, B-871, etc.)
- **warehouse_zones**: Logical areas within buildings (racks, staging, floor)
- **warehouse_locations**: Individual pallet positions with 3D coordinates
- **warehouse_inventory_items**: Items stored with full tracking data and aging
- **warehouse_transfers**: Inter-warehouse transfers with transport mode linkage

### Features
- Multi-site inventory tracking
- Pallet-level location management
- Aging alerts (3-5 years, 5-7 years, 7+ years)
- Weight constraints (≤2000 lbs for rack positions)
- CSV import for bulk inventory upload (columns: o, l, h, w, p, q)
- Placement optimization with algorithm-based recommendations

### Warehouse Optimization Algorithms
Based on box assortment and cartonization algorithms from external notebooks:
- **CardStack Algorithm**: Identifies items with similar base dimensions that can be stacked together
- **Size Standardization**: Groups items by dimension for batch handling optimization
- **Value Density Analysis**: Ranks items by value-per-volume for priority placement
- **Bin-Packing Order**: Sorts items by volume for optimal warehouse placement

### Inter-Warehouse Transfers
Transfers between warehouse sites can be linked to transport modes:
- **Air**: Via PACAF airlift system for urgent/priority cargo
- **Land**: Ground convoy for overland transfers
- **Sea**: Maritime container for port-to-port transfers

## Land Logistics Schema
- **land_routes**: Ground transport routes with waypoints
- **land_convoys**: Vehicle convoy groupings with cargo manifests

## Sea Freight Schema
- **sea_voyages**: Maritime shipping routes with port calls
- **sea_containers**: Container tracking with manifest data

## UI/UX Design
- Responsive design with mobile-first approach
- Consistent navigation with "Back to Hub" on all section pages
- Dark theme with gradient accents per section:
  - Air: Blue/Cyan gradient
  - Land: Amber/Orange gradient
  - Sea: Teal/Emerald gradient
  - Warehouse: Purple/Pink gradient

## AI Insights Configuration
AI insights utilize AWS Bedrock with the Nova Lite model, configurable via environment variables.

# External Dependencies

**Database Services**:
- Neon (@neondatabase/serverless)
- Drizzle ORM

**3D Graphics**:
- React Three Fiber
- React Three Drei
- Three.js

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

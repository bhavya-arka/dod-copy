# Overview

Arka Cargo Operations is a comprehensive multi-modal logistics platform designed for Air, Land, Sea, and Warehouse operations. Its primary purpose is to streamline complex cargo movements and warehouse management, offering intuitive navigation and responsive design. The platform aims to provide a unified system for military and commercial logistics, enhancing efficiency, optimization, and real-time tracking across diverse operational domains.

## Key Capabilities

- **Air Operations (PACAF Airlift)**: C-17/C-130 load planning, 463L palletization, route optimization, and 3D cargo visualization.
- **Land Logistics**: Ground transport convoy planning, truck routing, and overland cargo manifests.
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
- **`packages/shared/`**: Shared schemas and types.
- **`packages/config/`**: Shared configurations.
- **`shared/`**: Drizzle schema for database definitions.

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

## Warehouse Management System (WMS)
The WMS is modular, featuring a 7-section navigation (Dashboard, Inventory, Operations, Sites & Storage, Analytics, AI Insights, Admin). Key features include:
- Multi-site inventory tracking and pallet-level location management.
- NSN validation, aging alerts, and weight constraints.
- PDF/CSV file import with comprehensive validation.
- Placement optimization using algorithms like CardStack, Size Standardization, Value Density Analysis, and Bin-Packing Order.
- Inter-warehouse transfers linked to Air, Land, or Sea transport modes.

## Data Models
Key data models include `MovementItem`, `Pallet463L`, `AircraftLoadPlan`, `AllocationResult` for air operations, and `warehouse_sites`, `warehouse_buildings`, `warehouse_zones`, `warehouse_locations`, `warehouse_inventory_items`, `warehouse_transfers` for WMS. Land and Sea modules have `land_routes`, `land_convoys`, `sea_voyages`, and `sea_containers`.

## Government Compliance & Federal Standards
The system supports National Stock Numbers (NSN) format (FSC and NIIN components), Commercial and Government Entity (CAGE) codes, and integrates with Military Sealift Command (MSC) vessel designations (T-AO, T-AKR, T-EPF, T-AH, T-ARS). Data structures align with Federal Logistics Information System (FLIS) standards.

## UI/UX Design
The platform uses a responsive, mobile-first design with a consistent navigation. A dark theme with gradient accents is applied per section: Air (Blue/Cyan), Land (Amber/Orange), Sea (Teal/Emerald), and Warehouse (Purple/Pink).

## AI Insights Configuration
AI insights are powered by AWS Bedrock with the Nova Lite model.

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
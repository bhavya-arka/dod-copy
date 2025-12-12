# Overview

**Arka Cargo Operations** - A comprehensive PACAF Airlift system for C-17/C-130 load planning with:

- Full-featured load planning that accepts movement list data (CSV/JSON)
- Automatic cargo allocation with 463L palletization engine
- ICODES-style 2D diagrams and interactive 3D visualization
- Center of balance calculations and AI-powered insights
- Route planning with distance/fuel calculations across military bases
- PDF export capability

Built with React, TypeScript, Three.js (React Three Fiber), and Framer Motion.

# Recent Changes

## December 2025

### CoB Calculation Fix (10/12/2025)
- **LEMAC Calibration**: Fixed Center of Balance calculations that were producing negative values
- **C-17 LEMAC**: Calibrated to 643" (cargo-floor relative) for ~28% MAC at mid-cargo
- **C-130 LEMAC**: Calibrated to 409" (cargo-floor relative) for ~25% MAC at mid-cargo
- **Envelope Ranges**: C-17 now uses 16-40% MAC, C-130 uses 15-35% MAC per T.O. specifications
- **Reference Frame**: Pallets and vehicles now use consistent cargo-floor-relative coordinates

### Aircraft Geometry & Validation Overhaul (09/12/2025)
- **Enhanced AIRCRAFT_SPECS**: Added station-specific constraints with RDL distances, height/width limits per position
- **Station-Based Validation**: Each pallet position now has its own constraints (ramp positions 17-18 limited to 70" height, 7500 lb)
- **Correct CoB Calculation**: Fixed Center of Balance formula to use MAC (Mean Aerodynamic Chord) with LEMAC station
- **Edge Case Handler Enhancement**: Added 10+ new validation functions including station placement, vehicle constraints, ramp loading
- **Duplicate TCN Detection**: Movement parser now detects and warns about duplicate Transportation Control Numbers
- **Tiedown Calculations**: Automatic tiedown requirements based on item weight and G-force factors
- **Shoring Requirements**: Automatic shoring warnings for heavy vehicles on ramp positions
- **Vehicle Wheelbase/Axle Checks**: Validation against aircraft-specific wheelbase and axle weight limits

**Enhanced Types** (client/src/lib/pacafTypes.ts):
- `StationConstraint` interface - Position-specific height, width, weight limits
- Extended `AircraftSpec` with forward_offset, ramp_angle, MAC/LEMAC values
- Extended `CoBCalculation` with envelope_status and envelope_deviation
- New helper functions: `getStationConstraint()`, `getRDLDistance()`, `validateStationPlacement()`

**Enhanced Edge Case Handler** (client/src/lib/edgeCaseHandler.ts):
- `validateStationPlacement()` - Station-specific dimension checks
- `validateVehicleConstraints()` - Wheelbase, axle weight, floor loading
- `validateRampLoading()` - Ramp height/width clearance checks
- `calculateTiedownRequirements()` - G-force based tiedown calculations
- `detectDuplicateTCN()` - Duplicate tracking detection

**Enhanced Aircraft Solver** (client/src/lib/aircraftSolver.ts):
- `calculateCenterOfBalance()` - Now uses correct MAC formula with LEMAC station
- `getCoBStatusMessage()` - Human-readable CoB status with envelope warnings
- Station-based pallet placement using RDL distances

### Mission Flowchart Canvas (09/12/2025)
- **Full-Page Canvas**: Miro/Lucidflow-style interactive flowchart designer using React Flow
- **Auto-Spawn Nodes**: Origin airbase → Flight nodes → Destination airbase with Dagre auto-layout
- **Color Coding**: Yellow (HAZMAT flights), Orange (ADVON materials), Blue (C-17), Green (C-130)
- **Edge Annotations**: Distance (nm), fuel (lb), time en route on connecting lines
- **Flight Nodes**: Top 5 heaviest items summary, double-click to expand modal
- **Airbase Nodes**: Incoming/outgoing flight counts, weather, arrivals/departures
- **Floating HUD**: Legend panel, stats panel, export buttons (PDF/ICODES)
- **Detail Modals**: FlightDetailModal (manifest, route, validation, AI insights), AirbaseDetailModal (weather, flights, packages)

**New Component** (client/src/components/):
- `MissionFlowchartCanvas.tsx` - Full-page React Flow canvas with custom nodes/edges

### Monorepo Refactor & Documentation (09/12/2025)
- **Packages Structure**: Extracted PACAF engines to `packages/utils` with modular barrel exports
- **Documentation**: Created `/docs` folder with architecture, API reference, testing, and engine docs
- **Clean Architecture**: Types separated from behavioral functions, proper domain module structure
- **Module Organization**: 5 domain modules (types, parser, solver, scheduler, export) with barrel exports

**New Package Structure** (packages/utils/src/):
- `types/` - Pure type definitions (pacafTypes, routeTypes, flightSplitTypes)
- `parser/` - Movement parsing and classification
- `solver/` - Palletization, aircraft allocation, edge cases, flight utilities
- `scheduler/` - Route calculations, flight scheduling, weather service
- `export/` - ICODES export, PDF generation, insights engine

**Documentation** (docs/):
- `README.md` - Documentation overview and quick start
- `architecture.md` - System design and component relationships
- `pacaf-engines.md` - Computational engine API documentation
- `api-reference.md` - Backend REST API endpoints
- `testing.md` - Test coverage and running tests

### Flight Scheduling & Weather System (09/12/2025)
- **Lenient Parser**: Uses default values for missing data with warnings (24" default dimensions, 100 lb default weight)
- **Military Time**: All times display in 24-hour format (HHMMz) throughout application
- **Flight Scheduling**: Full scheduling with departure/arrival times, conflict detection, callsign generation
- **Weather Service**: Mock weather systems with movement forecasting and base conditions
- **Route Planner Enhancement**: Three-tab interface (Routes, Schedule, Weather)

**New Libraries** (client/src/lib/):
- `flightScheduler.ts` - Flight scheduling, conflict detection, callsign generation
- `weatherService.ts` - Weather systems, base conditions, route impact analysis

### Single-Mode Architecture Refactor (09/12/2025)
- **Title**: Renamed to "Arka Cargo Operations"
- **Simplified Home Screen**: Single load planning button (removed dual-mode selection)
- **PAX Validation Fix**: Personnel count now validates 1-500 range to prevent weight values being misinterpreted
- **Enhanced 3D Lighting**: Increased ambient/directional/point lights for better visibility
- **Route Planning Module**: New multi-leg flight planning with distance/time/fuel calculations
- **Edge Case Handler**: Comprehensive validation for overheight, overwidth, hazmat, heavy vehicles, etc.

**New Route Planning Libraries** (client/src/lib/):
- `routeTypes.ts` - Flight route, leg, and aircraft performance types
- `bases.ts` - Military base database (PACAF, AMC, theater bases)
- `routeCalculations.ts` - Great-circle distance, fuel estimates, time en route, military time helpers
- `edgeCaseHandler.ts` - 10 edge case validations (overheight, hazmat, PAX conflicts, etc.)

**New Route Planning Component** (client/src/components/):
- `RoutePlanner.tsx` - Multi-leg route editor with scheduling, weather, fuel/distance calculations

### PACAF Airlift Demo System Implementation (09/12/2025)
Initial implementation of comprehensive load planning per PACAF specification:

**Core Libraries** (client/src/lib/):
- `pacafTypes.ts` - Complete data models for MovementItem, Aircraft specs, Pallet463L, LoadPlan, etc.
- `movementParser.ts` - CSV/JSON parser with validation and error handling
- `classificationEngine.ts` - ADVON/MAIN phase separation, cargo type classification
- `palletizationEngine.ts` - 463L pallet system with bin-packing algorithm
- `aircraftSolver.ts` - Aircraft allocation solver with Center of Balance calculations
- `insightsEngine.ts` - AI-driven summarization and optimization recommendations

**UI Components** (client/src/components/):
- `PACAPApp.tsx` - Main PACAF application orchestrator
- `UploadScreen.tsx` - Movement list upload with drag-and-drop
- `UrgentBriefScreen.tsx` - 1-click output for leadership meetings
- `LoadPlanViewer.tsx` - Detailed load plan viewer with sidebar navigation
- `ICODESViewer.tsx` - ICODES-style 2D aircraft diagrams

**Specification Compliance**:
- Section 2: Input parsing with robust error handling
- Section 3: Classification by phase (ADVON/MAIN) and cargo type
- Section 4: 463L pallet system rules (10,000 lb limit at ≤96", 8,000 lb at 96-100")
- Section 5: C-17 and C-130 aircraft specifications
- Section 6: Palletization engine with 2D bin-packing
- Section 7: Rolling stock placement rules
- Section 8: Aircraft allocation solver (weight + position constraints)
- Section 9: Center of Balance calculations
- Section 10: ICODES-style visualization
- Section 12: UI/UX workflow (upload → brief → load plans)
- Section 13: AI insights engine

### Previous Updates (January 2025)
- Hypermodern landing page with government-focused design
- Animated background with tactical silhouettes
- Seamless transition flow from landing page to 3D simulation

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Single-Mode Architecture
The application is focused exclusively on load planning operations:

**Load Planning Workflow**:
- Upload → Parse → Classify → Palletize → Allocate → Visualize → Route Plan
- Deterministic solver producing same output for same input
- Sub-10-second processing for up to 5,000 items
- Integrated 2D ICODES and 3D visualization toggle
- Route planning with fuel/distance calculations

## Full-Stack Architecture (Turborepo Monorepo)

**Structure**:
```
├── apps/
│   ├── client/          # React frontend (Vite, port 5000)
│   └── server/          # Express API (port 3000)
├── packages/
│   ├── shared/          # Shared schema and types
│   └── config/          # Shared Tailwind/PostCSS/TypeScript configs
├── turbo.json           # Turborepo pipeline configuration
└── package.json         # Root workspace configuration
```

**Development Ports**:
- Client (webview): `http://localhost:5000` - User-facing React app
- Server (API): `http://localhost:3000` - Express REST API
- Client proxies `/api/*` requests to server

**Workflows**:
- `Client`: Runs `cd apps/client && npm run dev` on port 5000
- `API Server`: Runs `cd apps/server && npm run dev` on port 3000

**Frontend**: React 18+ SPA with TypeScript
**Backend**: Express.js with RESTful API endpoints 
**Database**: PostgreSQL with Drizzle ORM (Neon-backed)
**Build System**: Vite for development, Turborepo for monorepo orchestration

## PACAF Planning System Architecture

```
┌──────────────────────┐
│    Input Layer       │ ← CSV/JSON movement list upload
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   Parser & Validator │ ← movementParser.ts
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Classification      │ ← classificationEngine.ts
│  (ADVON/MAIN, types) │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Palletization Engine │ ← palletizationEngine.ts
│   (bin-packing)      │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Aircraft Allocation  │ ← aircraftSolver.ts
│   Solver             │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ ICODES Visualization │ ← ICODESViewer.tsx
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   AI Insights        │ ← insightsEngine.ts
└───────────────────────┘
```

## Aircraft Specifications

### C-17 Globemaster III
- Cargo: 1056" L × 216" W × 148" H
- 18 pallet positions (positions 17-18 on ramp)
- Max payload: 170,900 lb
- Per position: 10,000 lb (7,500 lb ramp)
- CoB envelope: 20-35%

### C-130H/J Hercules
- Cargo: 492" L × 123" W × 108" H
- 6 pallet positions
- Max payload: 42,000 lb
- Per position: 10,000 lb
- CoB envelope: 18-33%

## 463L Pallet System
- Dimensions: 108" × 88" × 2.25"
- Usable area: 104" × 84"
- Tare weight: 290 lb (355 lb with nets)
- Max payload: 10,000 lb (≤96" height), 8,000 lb (96-100")
- 22 tiedown rings @ 7,500 lb each

## Data Models

### MovementItem
Primary cargo item structure with dimensions, weight, type classification.

### Pallet463L
Represents loaded 463L pallets with items, weight, hazmat flags.

### AircraftLoadPlan
Complete aircraft load with pallets, rolling stock, PAX, CoB calculations.

### AllocationResult
Full allocation solution with all aircraft and summary metrics.

## External Dependencies

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

**Development**:
- TypeScript
- Vite
- ESBuild

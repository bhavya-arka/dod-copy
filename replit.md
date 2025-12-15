# Overview

**Arka Cargo Operations** is a comprehensive PACAF Airlift system designed for C-17/C-130 load planning. It provides full-featured load planning, accepting movement list data (CSV/JSON), and offers automatic cargo allocation with a 463L palletization engine. The system includes ICODES-style 2D diagrams, interactive 3D visualization, center of balance calculations, and AI-powered insights. Additionally, it supports route planning with distance and fuel calculations across military bases and features PDF export capability. The project aims to streamline military airlift operations by providing a robust and intuitive planning tool.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Single-Mode Architecture
The application focuses exclusively on load planning operations, following a workflow of Upload → Parse → Classify → Palletize → Allocate → Visualize → Route Plan. It features a deterministic solver capable of processing up to 5,000 items in under 10 seconds, and integrates both 2D ICODES and 3D visualization. Route planning includes fuel and distance calculations.

## Full-Stack Architecture (Turborepo Monorepo)
The project is structured as a Turborepo monorepo:
-   **`apps/client/`**: React frontend (Vite)
-   **`apps/server/`**: Express API
-   **`packages/shared/`**: Shared schemas and types
-   **`packages/config/`**: Shared configurations

The frontend is a React 18+ SPA with TypeScript, and the backend is an Express.js application with RESTful API endpoints. The build system utilizes Vite for development and Turborepo for monorepo orchestration.

## PACAF Planning System Architecture
The system processes input through a series of engines:
1.  **Input Layer**: CSV/JSON movement list upload.
2.  **Parser & Validator**: Handles movement parsing and validation.
3.  **Classification**: Categorizes items by phase (ADVON/MAIN) and cargo type.
4.  **Palletization Engine**: Implements a 463L pallet system with a bin-packing algorithm.
5.  **Aircraft Allocation Solver**: Allocates cargo to aircraft, considering weight and position constraints, and performs Center of Balance calculations.
6.  **ICODES Visualization**: Provides 2D aircraft diagrams.
7.  **AI Insights**: Generates AI-driven summarization and optimization recommendations.

## Aircraft Specifications
-   **C-17 Globemaster III**: 18 pallet positions (including ramp), max payload 170,900 lb, CoB envelope 20-35%.
-   **C-130H/J Hercules**: 6 pallet positions, max payload 42,000 lb, CoB envelope 18-33%.
Both aircraft types have specific dimensions, per-position weight limits, and CoB envelope requirements.

## 463L Pallet System
Standardized pallets with dimensions 108" × 88" and a usable area of 104" × 84". They have a tare weight of 290 lb (355 lb with nets) and a max payload of 10,000 lb (up to 96" height) or 8,000 lb (96-100" height). Each pallet features 22 tiedown rings.

## Data Models
Core data models include:
-   **`MovementItem`**: Primary cargo item with dimensions, weight, and type classification.
-   **`Pallet463L`**: Represents loaded 463L pallets with items, weight, and hazmat flags.
-   **`AircraftLoadPlan`**: Details the complete aircraft load, including pallets, rolling stock, PAX, and CoB calculations.
-   **`AllocationResult`**: The full allocation solution with all aircraft and summary metrics.

# Recent Changes

## December 2025

### FlightManagerFlowchart Architectural Redesign (15/12/2025)
- **Issue**: Nodes reset positions when adding new flights/bases, connections don't link properly
- **Solution**: Created GraphStore module (`apps/client/src/lib/graphStore.ts`) with:
  - Stable position map with canonical IDs (`flight-{id}`, `base-{baseId}`)
  - SSR-safe localStorage access with lazy loading
  - Reconciliation-based updates (diff/patch instead of wholesale rebuilds)
  - Position persistence across state changes
- **Files**: `apps/client/src/lib/graphStore.ts`, `apps/client/src/components/FlightManagerFlowchart.tsx`

### Physics-Based CoB Algorithm (15/12/2025)
- **Enhancement**: Implemented proper physics equations per T.O. 1C-17A-9 and T.O. 1C-130H-9
- **Core Equations**:
  - `Moment = Weight × Arm (inch-pounds)`
  - `CG = Total Moment / Total Weight`
  - `%MAC = ((CG_Station - LEMAC) / MAC_Length) × 100`
- **Aircraft Specs**: Updated LEMAC, MAC length, envelope limits in `pacafTypes.ts`
  - C-17: LEMAC=869.7", MAC=309.5", envelope 16-40% MAC
  - C-130: LEMAC=494.5", MAC=164.5", envelope 18-33% MAC
- **Lateral CG**: Added bilateral balance tracking
- **Files**: `apps/client/src/lib/aircraftSolver.ts`, `apps/client/src/lib/pacafTypes.ts`

### 3D Measure Tool with Snapping (15/12/2025)
- **Feature**: Click-to-measure distances with snap to geometry
- **Snapping Hierarchy**: Vertices (red) → Edge midpoints (orange) → Surfaces (yellow)
- **Controls**: M key to toggle, ESC to reset
- **Visual Feedback**: Colored markers, dashed lines, distance labels in 3D and HUD
- **Fixes**: Proper FaceIndices typing for BufferGeometry, measure state resets on toggle
- **File**: `apps/client/src/components/LoadPlan3DViewer.tsx`

### Save Plan Update-in-Place Logic (15/12/2025)
- **Issue**: Saving an already-saved plan would prompt for a new name instead of updating
- **Fix**: Save button now detects if a plan is already loaded via `loadedPlan` prop
  - If plan is loaded → calls `updateConfiguration(planId)` to update without prompting
  - If no plan loaded → prompts for name and creates new plan
- **New Method**: Added `updateConfiguration(planId: number)` to MissionContext
  - Uses PUT `/api/flight-plans/:id` to update allocation_data
  - Also updates flight schedules via `updatePlanSchedules`
- **Files**: `apps/client/src/context/MissionContext.tsx`, `apps/client/src/components/MissionNavbar.tsx`

### CoB-Aware Pallet & Lateral Placement Fix (15/12/2025)
- **Issue 1**: Negative CoB (-43.5%) when pallets placed front-to-back
- **Issue 2**: Rolling stock placed in single line instead of side-by-side
- **Fix - Lateral Placement**: New lane-based algorithm in `placeRollingStock()`:
  - Finds lateral gaps before advancing X position
  - Places items side-by-side when they fit (e.g., 53" wide items in 216" C-17 bay)
  - Only advances X when lateral space is exhausted
- **Fix - CoB-Aware Pallet Placement**: New algorithm in `placePallets()`:
  - Calculates target CG position (center of 16-40% MAC envelope for C-17 = 28%)
  - Places heavier pallets near target CG
  - Uses bilateral placement strategy per USAF T.O. 1C-17A-9
  - Ensures weighted average position falls within CoB envelope
- **File**: `apps/client/src/lib/aircraftSolver.ts`

### Stress Test Suite for Edge Cases (15/12/2025)
- **Test File**: `tests/stressTest.edgeCases.test.ts` - 27 comprehensive tests
- **Edge Case Handler Fixes**: Added overlength (>104" pallet), overweight (>10,000 lb pallet), and cargo bay dimension validation
- **Documented Edge Cases** (22 scenarios):
  - **Dimension**: Overheight pallet (>100"), overwidth pallet (>84"), overlength pallet (>104"), exceeds C-130/C-17 cargo bay, ramp height/width violations
  - **Weight**: Overweight pallet (>10,000 lb), overweight position, overweight ramp, exceeds C-130/C-17 payload, axle weight exceeded
  - **CoB**: Nose-heavy, tail-heavy, extreme imbalance, zero weight load, single item at LEMAC
  - **Combination**: Oversized+overweight, hazmat at limits, many small items (1000+), few massive items
- **Performance Tests**: 100 items < 5s, 500 items < 10s
- **Files**: `tests/stressTest.edgeCases.test.ts`, `apps/client/src/lib/edgeCaseHandler.ts`

### Analytics Tab Audit and Enhancements (15/12/2025)
- **Hardcoded Fallback Removal**: Removed fake fallback values from MissionContext.tsx:
  - `avgCob || 27.5` → now properly calculates or returns 0 if no data
  - `distance || 2000` and `payloadWeight || 50000` → now use 0 if no route/payload data
  - Fixed duplicate hardcoded fuel rates in callback functions to use AIRCRAFT_SPECS
- **Fuel Reference Data**: AnalyticsPanel.tsx now pulls fuel rate reference values from AIRCRAFT_SPECS instead of hardcoding
- **New Metrics Added**:
  - Cargo Type Breakdown chart (palletized, rolling stock, PAX weight)
  - Per-Aircraft Load Percentage with visual progress bars and CoB status
  - Pallet Distribution by Aircraft bar chart
- **Files**: `apps/client/src/context/MissionContext.tsx`, `apps/client/src/components/AnalyticsPanel.tsx`

### CoB Computation Stack Audit (15/12/2025)
- **Audit Scope**: Full audit of CoB calculation across domainUtils.ts, aircraftSolver.ts, geometry/validation.ts, and 3D rendering
- **Issue Found**: domainUtils.ts used `forward_offset` (180") instead of `bayStart` (first station RDL = 245") for coordinate conversion
- **Issue Found**: LoadPlan3DViewer.tsx rendered CoB marker at station coordinates but 3D model uses 0-based cargo-relative coordinates
- **Fix**: domainUtils.ts now uses `bayStart` from `spec.stations[0].rdl_distance` consistent with aircraftSolver.ts
- **Fix**: LoadPlan3DViewer.tsx now subtracts `bayStart` from `center_of_balance` for both 3D marker and MiniMap
- **Formula Confirmed**: `CoB% = ((Station_CG - LEMAC) / MAC_Length) * 100`
- **Coordinate Systems Documented**:
  - Station/RDL coordinates: From aircraft datum (245-1215 for C-17)
  - Solver coordinates: 0-based from cargo bay start
  - 3D coordinates: 0-based from cargo bay start (matches solver)
- **Files**: `apps/client/src/lib/domainUtils.ts`, `apps/client/src/components/LoadPlan3DViewer.tsx`

### Database-Backed Manifest Storage (15/12/2025)
- **Feature**: Manifest edits now persist to the database so changes (like marking items as hazmat) are saved
- **Database**: Added `manifests` table with `id`, `user_id`, `flight_plan_id`, `name`, `items` (JSONB), `created_at`, `updated_at`
- **API Endpoints**: Added full CRUD for manifests:
  - `GET/POST /api/manifests` - List and create manifests
  - `GET/PUT/DELETE /api/manifests/:id` - Read, update, delete individual manifests
  - `PATCH /api/manifests/:id/items/:itemIndex` - Update single item in manifest
- **Context**: Added `manifestId` state to `MissionContext.tsx` for tracking active manifest
- **UI Integration**: `MissionWorkspace.tsx` now calls PUT API on manifest edits (fire-and-forget pattern)
- **Files**: `shared/schema.ts`, `apps/server/routes.ts`, `apps/server/storage.ts`, `apps/client/src/context/MissionContext.tsx`, `apps/client/src/components/MissionWorkspace.tsx`

### Rolling Stock Placement Bug Fix (15/12/2025)
- **Bug**: Rolling stock items (vehicles like MHU-226, LOADER WEAPONS, TRACTOR TOW) were correctly classified but never loaded onto aircraft
- **Root Cause**: Coordinate system mismatch - `placeRollingStock` used 0-based coordinates (0 to cargo_length), but the geometry module's `isWithinBounds` expected station-based coordinates (bay_start_in ~245 to bay_end). All items at position 0 failed bounds checking.
- **Solution**: Added `isWithinSolverBounds` and `findSolverPosition` functions in `aircraftSolver.ts` that use 0-based coordinates consistent with the solver
- **File**: `apps/client/src/lib/aircraftSolver.ts`

### Flight Manager Node Position Bug Fix (15/12/2025)
- **Race Condition Fix**: Fixed bug where connecting flight/airport nodes would reset their positions
- **Root Cause**: Positions weren't saved to `layoutRef` before graph regeneration due to async useEffect timing
- **Solution**: Added `syncPositionsToLayoutRef` helper that synchronously saves positions before state changes
- **File**: `apps/client/src/components/FlightManagerFlowchart.tsx`

### PDF Export Layout Fix (14/12/2025)
- **Fixed TypeScript Errors**: Resolved 10 LSP errors in `pdfExport.ts` where pallet properties were incorrectly accessed
- **Improved ICODES Layout**: Increased SVG scale from 0.55 to 0.72 for less cramped diagrams in printed PDFs

# External Dependencies

**Database Services**:
-   Neon (@neondatabase/serverless)
-   Drizzle ORM

**3D Graphics**:
-   React Three Fiber
-   React Three Drei
-   Three.js

**UI Framework**:
-   Radix UI components
-   Tailwind CSS
-   Framer Motion
-   Lucide React icons

**State Management**:
-   Zustand
-   TanStack Query

**Development**:
-   TypeScript
-   Vite
-   ESBuild
# Overview

Arka Cargo Operations is a PACAF Airlift system designed for C-17/C-130 load planning. Its core purpose is to streamline military airlift operations by providing tools for processing movement list data (CSV/JSON), automatic cargo allocation with a 463L palletization engine, and detailed visualization through ICODES-style 2D diagrams and interactive 3D models. The system also includes center of balance calculations, AI-powered insights, and route planning capabilities with distance and fuel calculations across military bases, culminating in PDF export functionality.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Single-Mode Operations
The application follows a defined workflow: Upload → Parse → Classify → Palletize → Allocate → Visualize → Route Plan. It features a deterministic solver for efficient processing of up to 5,000 items, integrates 2D ICODES and 3D visualizations, and includes route planning with fuel and distance calculations.

## Full-Stack Architecture
The project is built as a Turborepo monorepo with the following structure:
-   **`apps/client/`**: React 18+ frontend with TypeScript and Vite.
-   **`apps/server/`**: Express.js backend providing RESTful API endpoints.
-   **`packages/shared/`**: Contains shared schemas and types across the monorepo.
-   **`packages/config/`**: Stores shared configurations.

## PACAF Planning System Pipeline
The system processes data through a multi-stage pipeline:
1.  **Input Layer**: Handles CSV/JSON movement list uploads.
2.  **Parser & Validator**: Parses and validates incoming data.
3.  **Classification**: Categorizes items by phase (ADVON/MAIN) and cargo type.
4.  **Palletization Engine**: Implements a 463L pallet system using a bin-packing algorithm.
5.  **Aircraft Allocation Solver**: Allocates cargo based on weight, position constraints, and Center of Balance (CoB) calculations, including mixed fleet optimization.
6.  **ICODES Visualization**: Generates 2D aircraft diagrams with lateral pallet placement and seat zone overlays.
7.  **AI Insights**: Provides AI-driven summarization, optimization recommendations, and mission analytics.

## Aircraft Specifications
The system supports C-17 Globemaster III and C-130H/J Hercules, each with specific pallet positions, maximum payloads, dimensions, per-position weight limits, CoB envelope requirements, and seat zone configurations.

## 463L Pallet System
Supports standardized 463L pallets (108" × 88", 104" × 84" usable area) with defined tare weight, max payload limits, and tiedown rings.

## Data Models
Key data models include `MovementItem`, `Pallet463L`, `AircraftLoadPlan`, and `AllocationResult`. Flight plans are persisted and loaded via `/api/flight-plans`, supporting both current and legacy data formats.

## UI/UX Design
Dashboard components are designed to be "naked" (no intrinsic padding/margins) to allow the parent container to control spacing, ensuring uniform layout and preventing squishing. Full-screen views bypass the main container for edge-to-edge rendering.

## AI Insights Configuration
AI insights utilize AWS Bedrock with the Nova Lite model, configurable via environment variables for region, access keys, knowledge base ID, model ID, and rate limits. Insight types include `allocation_summary`, `cob_analysis`, `pallet_review`, `route_planning`, `compliance`, `mission_briefing`, and `mission_analytics` (which provides structured JSON output). AI guardrails are implemented in prompts to ensure informative, non-critical feedback.

## Lateral Pallet Placement & Seat Visualization
The system incorporates 2D grid-based pallet placement considering lateral lanes (e.g., C-17 has two, C-130 has one) and tracks lateral moments for balanced CoB. Passenger seat zones are defined per aircraft, visualized in both 2D ICODES (overlays) and 3D (individual seat meshes) showing occupancy.

## Flight Route Configuration
The upload screen includes a collapsible "Flight Route" section allowing users to configure multi-stop flight operations:
- **Origin/Destination**: Define departure and final destination bases (ICAO codes)
- **Intermediate Stops**: Add, remove, and reorder intermediate stops
- **Visual Route Preview**: Shows complete route chain (Origin → Stop 1 → Stop 2 → Destination)
- **RouteConfig Interface**: Exported from UploadScreen for integration with other components

## Cargo Loading/Unloading Simulation
The 3D viewer includes an interactive cargo loading/unloading animation system (`cargoLoadingSequence.ts`, `CargoLoadingAnimation.tsx`):

**Loading Sequence Algorithm (Forward to Aft)**:
- Primary: Cargo for LAST stop loads FIRST (positioned deepest in aircraft)
- Secondary: Within same stop, forward positions load first, aft positions load last
- Tertiary: Non-hazmat before hazmat within same stop/position group
- Result: Aft cargo is most accessible at ramp for easy offloading

**Unloading Sequence (Aft to Forward)**:
- Reverses loading order - aft items (loaded last) unload first
- Forward items (loaded first) unload last
- Supports per-stop offloading visualization

**Animation Controls**:
- Mode toggle: Switch between LOAD (green) and UNLOAD (orange) modes
- Play/pause, rewind, speed control (0.5x/1x/2x), progress scrubber
- Keyboard shortcuts (L key to toggle animation)
- Visual indicators: Green arrows/staging for loading, red arrows/unload area for unloading

**Data Model Support**:
- `FlightRoute` interface for route configuration
- `destinationStop` field on MovementItem and Pallet463L for stop-aware allocation
- `destinationStopIndex` and `staysOnAircraft` fields for sequence items

**Loading Order PDF Export**: Generates 2D aircraft layout with sequence numbers and detailed manifest table via "Loading Order PDF" button in export menu

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

**Development Tools**:
-   TypeScript
-   Vite
-   ESBuild
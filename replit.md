# Overview

Arka Cargo Operations is a PACAF Airlift system for C-17/C-130 load planning. It processes movement list data (CSV/JSON), provides automatic cargo allocation with a 463L palletization engine, and offers ICODES-style 2D diagrams, interactive 3D visualization, center of balance calculations, and AI-powered insights. The system also supports route planning with distance and fuel calculations across military bases and features PDF export. Its primary goal is to streamline military airlift operations with a robust and intuitive planning tool.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Single-Mode Operations
The application focuses on a streamlined load planning workflow: Upload → Parse → Classify → Palletize → Allocate → Visualize → Route Plan. It includes a deterministic solver for efficient processing of up to 5,000 items and integrates both 2D ICODES and 3D visualization, alongside route planning with fuel and distance calculations.

## Full-Stack Architecture (Turborepo Monorepo)
The project is structured as a Turborepo monorepo:
-   **`apps/client/`**: React frontend (Vite)
-   **`apps/server/`**: Express API
-   **`packages/shared/`**: Shared schemas and types
-   **`packages/config/`**: Shared configurations

The frontend uses React 18+ with TypeScript, and the backend is an Express.js application providing RESTful API endpoints. Vite handles development, and Turborepo orchestrates the monorepo.

## PACAF Planning System Architecture
The system employs a multi-stage processing pipeline:
1.  **Input Layer**: CSV/JSON movement list uploads.
2.  **Parser & Validator**: Handles data parsing and validation.
3.  **Classification**: Categorizes items by phase (ADVON/MAIN) and cargo type.
4.  **Palletization Engine**: Implements a 463L pallet system using a bin-packing algorithm.
5.  **Aircraft Allocation Solver**: Allocates cargo considering weight, position constraints, and Center of Balance (CoB) calculations.
6.  **ICODES Visualization**: Generates 2D aircraft diagrams.
7.  **AI Insights**: Provides AI-driven summarization and optimization recommendations.

## Aircraft Specifications
The system supports C-17 Globemaster III and C-130H/J Hercules, each with specific pallet positions, maximum payloads, dimensions, per-position weight limits, and CoB envelope requirements.

## 463L Pallet System
Standardized 463L pallets (108" × 88", 104" × 84" usable area) are supported, with a tare weight of 290 lb (355 lb with nets), a max payload of 10,000 lb (up to 96" height), or 8,000 lb (96-100" height), and 22 tiedown rings.

## Data Models
Key data models include:
-   **`MovementItem`**: Primary cargo item data.
-   **`Pallet463L`**: Represents loaded 463L pallets.
-   **`AircraftLoadPlan`**: Details complete aircraft load and CoB calculations.
-   **`AllocationResult`**: The comprehensive allocation solution.

## Save/Load Architecture
Flight plans are persisted via `/api/flight-plans`:
-   **Save payload**: `allocation_data: { allocation_result, split_flights, routes }` + `movement_data: parseResult`
-   **Load handling**: Unwraps `allocation_result` from wrapper, supports legacy direct format
-   **Defensive guards**: Both `allocationResult` AND `parseResult` must exist before saving
-   **Graceful degradation**: Plans without movement_data load with allocation-only insights

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

# Styling Guidelines (Dec 2024)

## Container Rules
- Page wrappers: `container mx-auto px-4 max-w-7xl py-8`
- Full-height pages: `min-h-screen flex flex-col`
- Scrollable sections: `overflow-y-auto max-h-[calc(100vh-XXpx)]` or `max-h-[50vh]` for mobile

## Responsive Rules  
- Grid breakpoints: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Mobile-first: always start with single-column on xs
- No horizontal overflow: use `w-full max-w-full` and `overflow-x-auto` for tables

## Component Boundaries
- Spacing: `gap-4` to `gap-6`
- Modals: `fixed inset-0 flex items-center justify-center` with `max-h-screen overflow-y-auto`
- Sidebars on mobile: `max-h-[50vh]` with `overflow-y-auto`

## Layout Hierarchy (Updated Dec 2024)
- Root App: `flex flex-col min-h-screen bg-gray-50`
- Main content: `flex-1 overflow-y-auto overflow-x-hidden`
- Container inside main: `container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl` - **only ONE container level**
- No nested containers with conflicting max-widths

## SPA Component Pattern (CRITICAL)
**Dashboard components must be "naked" - NO padding/margins on root elements!**

The parent container controls all spacing. Child components should expose full-width, full-height surfaces.

### Correct Pattern:
```tsx
// Dashboard component root - NAKED (no padding/margins)
<div className="flex flex-col gap-6 h-full">
  <header>...</header>
  <div className="glass-card p-6">...</div>  // Cards have internal padding
</div>
```

### Wrong Pattern:
```tsx
// DON'T add padding to dashboard component roots
<div className="p-4 sm:p-6 lg:p-8 space-y-6">  // BAD - causes squishing
  ...
</div>
```

### Why This Matters:
- Parent dashboard/container already provides uniform spacing via padding/gap
- Adding padding to child components causes double-spacing and uneven appearance
- Components get "squished" when loaded into dashboard containers

# AI Insights Configuration

## AWS Bedrock Setup
The AI insights system uses AWS Bedrock with Nova Lite model. All configuration is via environment variables:

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `AWS_REGION` | AWS region for Bedrock | `us-east-2` |
| `AWS_ACCESS_KEY_ID` | AWS access key | (required) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | (required) |
| `AWS_BEDROCK_KNOWLEDGE_BASE_ID` | KB ID for retrieval | (optional) |
| `AWS_BEDROCK_MODEL_ID` | Model to use | `us.amazon.nova-lite-v1:0` |
| `AI_RATE_LIMIT_PER_MINUTE` | Max requests/min | `10` |
| `AI_RATE_LIMIT_PER_HOUR` | Max requests/hour | `100` |

## Insight Types
- `allocation_summary`: Overview of cargo allocation
- `cob_analysis`: Center of balance analysis
- `pallet_review`: Pallet loading efficiency
- `route_planning`: Route optimization
- `compliance`: Regulatory compliance checks
- `mission_briefing`: Executive summary

## Debug Logging
All AI operations include debug logging with prefixes:
- Server: `[Bedrock:DEBUG]`, `[Bedrock:ERROR]`, `[Bedrock:CONFIG]`
- Client: `[AiInsights:DEBUG]`, `[AiInsights:ERROR]`

# Recent Changes (Dec 2024)

## Layout Fixes
- Fixed MissionWorkspace layout with proper flex hierarchy and overflow handling
- Fixed AnalyticsPanel layout - removed conflicting container classes
- Added `overflow-x-hidden` to prevent horizontal scroll

## AI Insights Improvements
- Added comprehensive debug logging throughout the AI pipeline
- Made model ID and rate limits configurable via environment variables
- Added input validation for rate limit configuration with safe defaults
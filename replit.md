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
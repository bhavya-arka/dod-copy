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
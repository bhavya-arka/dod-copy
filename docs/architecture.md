# Architecture Overview

## System Design

Arka Cargo Operations is a full-stack application for military airlift load planning. The system processes movement lists and generates optimized load plans for C-17 and C-130 aircraft.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │  Upload  │  │  Planning   │  │  3D/2D Viz  │  │  Routes   │ │
│  │  Screen  │→ │  Pipeline   │→ │   Viewer    │→ │  Planner  │ │
│  └──────────┘  └─────────────┘  └─────────────┘  └───────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────────────┐
│                        Backend (Express)                         │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  Routes  │  │  Sessions   │  │  Auth       │                 │
│  └──────────┘  └─────────────┘  └─────────────┘                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                     PostgreSQL (Neon)                            │
└─────────────────────────────────────────────────────────────────┘
```

## PACAF Processing Pipeline

```
Input (CSV/JSON)
      │
      ▼
┌─────────────────┐
│ Movement Parser │ ← Validates and normalizes raw data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Classification  │ ← Separates ADVON/MAIN, cargo types
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Palletization   │ ← 463L bin-packing algorithm
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Aircraft Solver │ ← Allocates cargo to aircraft
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ CoB Calculator  │ ← Center of Balance validation
└────────┬────────┘
         │
         ▼
Output (Load Plans)
```

## Key Components

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `MissionWorkspace.tsx` | Main workspace with upload, planning, visualization |
| `ICODESViewer.tsx` | 2D aircraft diagram renderer |
| `LoadPlanViewer.tsx` | Detailed load plan display |
| `RoutePlanner.tsx` | Multi-leg route planning interface |

### PACAF Engines (packages/utils)

| Module | Purpose |
|--------|---------|
| `movementParser.ts` | CSV/JSON parsing with validation |
| `classificationEngine.ts` | Phase and cargo type separation |
| `palletizationEngine.ts` | 463L pallet construction |
| `aircraftSolver.ts` | Aircraft allocation and CoB |
| `routeCalculations.ts` | Great-circle distance, fuel estimates |
| `flightScheduler.ts` | Flight scheduling and conflicts |
| `weatherService.ts` | Weather data and predictions |
| `icodesExport.ts` | DoD/DLA-compliant exports |

## Aircraft Specifications

### C-17 Globemaster III
- Cargo bay: 1056" × 216" × 148"
- 18 pallet positions (16 main, 2 ramp)
- Max payload: 170,900 lb
- CoB envelope: 20-35%

### C-130H/J Hercules
- Cargo bay: 492" × 123" × 108"
- 6 pallet positions
- Max payload: 42,000 lb
- CoB envelope: 18-33%

## 463L Pallet System

- Standard dimensions: 108" × 88" × 2.25"
- Usable area: 104" × 84"
- Tare weight: 290 lb (355 lb with nets)
- Max payload: 10,000 lb (≤96" height), 8,000 lb (96-100")

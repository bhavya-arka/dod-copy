# Arka Cargo Operations - Documentation Index

## Overview
This documentation provides comprehensive information about all components, services, and libraries in the Arka Cargo Operations system.

## Frontend Components

### Core Application
- [PACAPApp](./components/PACAPApp.md) - Main application orchestrator
- [MissionWorkspace](./components/MissionWorkspace.md) - Mission planning workspace
- [UploadScreen](./components/UploadScreen.md) - Movement list upload interface
- [UrgentBriefScreen](./components/UrgentBriefScreen.md) - Quick briefing output

### Visualization
- [LoadPlanViewer](./components/LoadPlanViewer.md) - 2D load plan viewer
- [LoadPlan3DViewer](./components/LoadPlan3DViewer.md) - 3D aircraft visualization
- [ICODESViewer](./components/ICODESViewer.md) - ICODES-style diagrams

### Flight Management
- [RoutePlanner](./components/RoutePlanner.md) - Multi-leg route planning
- [FlightSplitter](./components/FlightSplitter.md) - Flight splitting interface
- [FlightFlowchart](./components/FlightFlowchart.md) - Flight flow visualization
- [MissionFlowchartCanvas](./components/MissionFlowchartCanvas.md) - Mission flowchart canvas

### HUD Components
- [MissionHeader](./components/HUD/MissionHeader.md) - Mission header display
- [LeftControlPanel](./components/HUD/LeftControlPanel.md) - Control panel
- [RightMetricsPanel](./components/HUD/RightMetricsPanel.md) - Metrics display
- [BottomStatusTicker](./components/HUD/BottomStatusTicker.md) - Status ticker
- [CGZoneDiagram](./components/HUD/CGZoneDiagram.md) - Center of gravity diagram

## Backend Services

### Routes
- [routes.ts](./backend/routes/routes.md) - Express API routes

### Services
- [cargoService](./backend/services/cargoService.md) - Cargo management
- [cargoAssignmentService](./backend/services/cargoAssignmentService.md) - Cargo assignment
- [dagNodeService](./backend/services/dagNodeService.md) - DAG node operations
- [dagEdgeService](./backend/services/dagEdgeService.md) - DAG edge operations
- [dagValidator](./backend/services/dagValidator.md) - DAG validation

### Database
- [storage.ts](./backend/storage.md) - Drizzle ORM storage layer
- [db.ts](./backend/db.md) - Database connection

## Library Modules

### Parsing & Classification
- [movementParser](./lib/movementParser.md) - CSV/JSON movement parsing
- [classificationEngine](./lib/classificationEngine.md) - Cargo classification

### Optimization
- [palletizationEngine](./lib/palletizationEngine.md) - 463L pallet bin-packing
- [aircraftSolver](./lib/aircraftSolver.md) - Aircraft allocation solver
- [cargoOptimizer](./lib/cargoOptimizer.md) - 3D cargo optimization

### Flight Operations
- [flightScheduler](./lib/flightScheduler.md) - Flight scheduling
- [routeCalculations](./lib/routeCalculations.md) - Route distance/fuel calculations
- [weatherService](./lib/weatherService.md) - Weather service

### Export
- [icodesExport](./lib/icodesExport.md) - ICODES format export
- [pdfExport](./lib/pdfExport.md) - PDF generation
- [insightsEngine](./lib/insightsEngine.md) - AI insights

### Types
- [pacafTypes](./lib/pacafTypes.md) - Core PACAF types
- [routeTypes](./lib/routeTypes.md) - Route types
- [flightSplitTypes](./lib/flightSplitTypes.md) - Flight split types

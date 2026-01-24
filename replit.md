# Overview

Arka Cargo Operations is a multi-modal logistics platform designed for Air, Land, Sea, and Warehouse operations. Its primary purpose is to streamline complex cargo movements and warehouse management for both military and commercial logistics. The platform aims to provide a unified system that enhances efficiency, optimization, and real-time tracking across diverse operational domains. Key capabilities include C-17/C-130 load planning and 3D cargo visualization for Air, ground transport convoy planning with Google Maps integration for Land, maritime container planning for Sea, and multi-site inventory tracking with capacity optimization for Warehouse operations.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Multi-Modal Operations Hub
The system features an Operations Hub with distinct modules for Air, Land, Sea, and Warehouse operations, each with a tailored workflow.

## Full-Stack Architecture
The project utilizes a Turborepo monorepo structure:
- **`apps/client/`**: React 18+ frontend with TypeScript and Vite.
- **`apps/server/`**: Express.js backend providing RESTful API endpoints.
- **`packages/shared/`**: Shared schemas, types, and transport definitions.
- **`packages/config/`**: Shared configurations.

## Security Architecture
- **Authentication**: JWT tokens stored in httpOnly secure cookies with session expiration validation.
- **Rate Limiting**: Three tiers for general API, auth endpoints, and AI/insights.
- **Input Validation**: All route parameters validated, SQL queries use Drizzle ORM parameterization.
- **Error Codes**: Structured auth errors for various scenarios.

## Frontend API Client
A centralized API client provides typed errors, typed helpers for HTTP methods, automatic 5xx retry logic, and a request timeout with AbortController.

## Modular Transport Architecture
A unified, mode-agnostic transport layer handles Air, Land, and Sea operations, featuring shared TypeScript types and mode-agnostic CRUD operations. All transport modes follow a unified lifecycle: `draft → planned → loading → underway → completed`, with status transitions validated and WMS integration upon completion.

## 3D Visualization Infrastructure
The system incorporates 3D visualization capabilities using Three.js, with reusable components for military vehicle meshes and convoy scene rendering.

## Google Maps Integration (Land Logistics)
The backend integrates with Google Maps API for geocoding, route calculation, distance matrix computations, and place autocomplete. Frontend components provide interactive map functionalities.

## Intelligent Multi-Modal Routing
The system provides automatic route planning that detects ocean crossings and suggests multi-modal transport. It includes route feasibility checks, ocean crossing detection, multi-leg route planning using military facility databases, and smart mode selection based on distance and cargo weight, utilizing Haversine distance calculation.

## PACAF Air Operations Pipeline
The Air module implements a multi-stage pipeline for cargo planning, including data upload, parsing, validation, classification, 463L palletization using a bin-packing algorithm, aircraft allocation solving, and 2D ICODES visualization for C-17 and C-130 aircraft.

## DLA-Compliant Warehouse Management System (WMS)
The WMS provides multi-site inventory tracking, pallet-level location management, NSN validation, aging alerts, and DLA pallet standard adherence. Key features include zone management, manifest parsers, historical capacity tracking, an Optimization Wizard with four algorithms, and AI-powered analysis for placement optimization and load balancing. It also supports inter-warehouse transfers and 90-day predictive load planning with smart alerts and analytics.

## Automatic Vehicle Allocation for Ground Transfers
The system provides automatic vehicle calculation for ground transfers between warehouses using a greedy allocation algorithm based on configurable vehicle priorities. It includes a transfer preview, validation of priority settings, graceful fallback, and automatic weight estimation for items without explicit weight data.

## Unified Transport Data Pipeline
The system provides standardized transport data aggregation for warehouse forecasting with a cross-modal manifest system. It includes a transfer workflow with lifecycle tracking, inbound cargo tracking, 80% utilization threshold alerts, and predictive forecasting that incorporates warehouse transfers.

## Inter-Site Management Features (New)
The WMS includes comprehensive inter-site coordination capabilities:
- **Priority Transfer Queue**: Transfer prioritization with queue position tracking, escalation controls, and priority levels (routine, priority, immediate, flash)
- **Cross-Site Inventory Matrix**: Network-wide inventory visibility with shortage/surplus detection, site thresholds, and rebalancing recommendations
- **Inbound Cargo Feed**: Real-time visibility of incoming shipments with timeline view, arrival forecasting, and transport mode color-coding
- **Capacity Forecasting**: 30-day utilization projections with 80% threshold alerts, confidence scoring, and inbound/outbound planning
- **Rebalancing Suggestions**: AI-generated inventory redistribution recommendations with approval workflow and execution tracking
- **Transport Calendar**: Cross-site transport reservation scheduling with conflict detection and consolidation wizard
- **Site Benchmarking**: Performance metrics comparison across sites with leaderboards, trend analysis, and daily metric capture

## Military Sealift Command (MSC) Sea Freight Operations
The Sea Freight module provides comprehensive maritime logistics, including a database of authentic MSC vessel types, tab-based navigation for managing voyages, containers, transfers, and schedules. It features voyage management with a status lifecycle, container tracking, a dynamic port schedule, and a voyage proposal system for recommending vessels.

## Government Compliance & Federal Standards
The system supports National Stock Numbers (NSN), Commercial and Government Entity (CAGE) codes, and integrates with Military Sealift Command (MSC) vessel designations, aligning with Federal Logistics Information System (FLIS) standards.

## UI/UX Design
The platform features a responsive, mobile-first design with a consistent navigation and a dark theme. Styling guidelines prioritize subtle colors, dark theme components, mode-specific accent colors, and professional, minimal styling, with all weights in pounds (lbs).

## Military Organization & Role-Based Access Control
The system supports four military organizations (PACAF, DLA, MSC, TRANSCOM) with a role-based access control (RBAC) system. Roles include Superadmin, Admin (branch-specific), and User, managed through Department Access Codes (DACs) and an approval workflow.

## AI Insights Configuration
AI insights are generated using AWS Bedrock with the Nova Lite model and structured prompts, covering various insight types for Air Operations, Land Logistics, Sea Freight, Cross-Modal analysis, and Warehouse management. The WMS includes an analytics dashboard, AI recommendations panel for demand forecasting, anomaly detection, smart placement, and inventory velocity analysis.

# External Dependencies

**Database Services**:
- Neon (@neondatabase/serverless)
- Drizzle ORM

**3D Graphics**:
- React Three Fiber
- React Three Drei
- Three.js

**Maps & Geolocation**:
- Google Maps API
- Leaflet

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
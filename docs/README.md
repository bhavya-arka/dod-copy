# Arka Cargo Operations Documentation

This folder contains technical documentation for the PACAF Airlift system.

## Table of Contents

1. [Architecture Overview](./architecture.md) - System design and component relationships
2. [API Reference](./api-reference.md) - Backend API endpoints
3. [PACAF Engines](./pacaf-engines.md) - Computational engine documentation
4. [Testing Guide](./testing.md) - Test coverage and running tests

## Quick Start

The application is a comprehensive load planning system for C-17/C-130 aircraft operations:

```bash
# Start development server
npm run dev

# Run tests
npm test
```

## Migration Status

The codebase is in a phased migration to a monorepo structure:

- **Legacy location**: `client/src/lib/` - Original engine files (still in use)
- **Shared package**: `packages/utils/` - Extracted engines with clean modular structure

During the transition period, both locations contain the engine code. Future work will migrate client/server imports to use `@arka/utils` directly.

## Project Structure

```
├── client/           # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── lib/         # PACAF engines (legacy location)
│   │   └── pages/       # Route pages
├── server/           # Express backend
│   ├── routes.ts     # API routes
│   └── storage.ts    # Database operations
├── packages/         # Shared packages (monorepo)
│   ├── utils/        # PACAF computational engines
│   └── config/       # Shared configuration
├── shared/           # Shared types and schema
│   └── schema.ts     # Drizzle database schema
└── docs/             # Documentation
```

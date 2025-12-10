# Testing Guide

## Overview

The Arka Cargo Operations system has comprehensive test coverage for all PACAF computational engines using Jest.

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/movementParser.test.ts

# Run tests in watch mode
npm test -- --watch
```

## Test Structure

```
tests/
├── movementParser.test.ts       # CSV/JSON parsing
├── classificationEngine.test.ts # Item classification
├── palletizationEngine.test.ts  # 463L bin-packing
├── aircraftSolver.test.ts       # Aircraft allocation
├── routeCalculations.test.ts    # Distance/fuel calculations
├── flightScheduler.test.ts      # Scheduling logic
├── weatherService.test.ts       # Weather predictions
├── icodesExport.test.ts         # Export format validation
├── edgeCaseHandler.test.ts      # Edge case validation
└── insightsEngine.test.ts       # AI insights
```

## Test Coverage

Current coverage: 124 passing tests across test suites.

### Coverage by Module

| Module | Tests | Coverage |
|--------|-------|----------|
| Movement Parser | 18 | Parsing, validation, defaults |
| Classification | 12 | Phase/type separation |
| Palletization | 22 | Bin-packing, weight limits |
| Aircraft Solver | 25 | Allocation, CoB calculations |
| Route Calculations | 15 | Distance, time, fuel |
| Flight Scheduler | 10 | Scheduling, conflicts |
| Weather Service | 8 | Forecasts, delays |
| ICODES Export | 8 | Format compliance |
| Edge Cases | 10 | Validation rules |

## Writing Tests

### Test Patterns

```typescript
import { parseMovementList } from '../client/src/lib/movementParser';

describe('Movement Parser', () => {
  describe('parseCSV', () => {
    it('should parse valid CSV with all fields', () => {
      const csv = `item_id,description,length_in,width_in,height_in,weight_lb
1,Test Item,24,24,24,100`;
      
      const result = parseMovementList(csv, 'csv');
      
      expect(result.items).toHaveLength(1);
      expect(result.items[0].description).toBe('Test Item');
      expect(result.errors).toHaveLength(0);
    });

    it('should apply default values for missing dimensions', () => {
      const csv = `item_id,description,weight_lb
1,Missing Dims,100`;
      
      const result = parseMovementList(csv, 'csv');
      
      expect(result.items[0].length_in).toBe(24);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
```

### Fixture Data

Test fixtures are located in `tests/fixtures/`:

```
tests/fixtures/
├── sample_movement_list.csv
├── edge_cases.csv
├── large_movement_list.json
└── expected_outputs/
```

## Continuous Integration

Tests run automatically on:
- Push to main branch
- Pull request creation
- Pre-deployment verification

## Debugging Tests

```bash
# Run with verbose output
npm test -- --verbose

# Run single test by name
npm test -- -t "should parse valid CSV"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

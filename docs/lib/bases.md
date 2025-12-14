# bases - Military Bases Database

## Purpose

Static database of major PACAF (Pacific Air Forces) and AMC (Air Mobility Command) military bases with location, runway, and timezone information.

## Location

`apps/client/src/lib/bases.ts`

## Dependencies

- `./routeTypes` - MilitaryBase interface

## Exported Constants

### MILITARY_BASES
Array of MilitaryBase objects representing key airlift bases:

#### PACAF Bases
| base_id | Name | ICAO | Country | Runway (ft) |
|---------|------|------|---------|-------------|
| HICKAM | Joint Base Pearl Harbor-Hickam | PHIK | USA | 13,000 |
| ANDERSEN | Andersen Air Force Base | PGUA | USA | 11,185 |
| KADENA | Kadena Air Base | RODN | Japan | 12,100 |
| YOKOTA | Yokota Air Base | RJTY | Japan | 11,000 |
| MISAWA | Misawa Air Base | RJSM | Japan | 10,000 |
| OSAN | Osan Air Base | RKSO | South Korea | 9,000 |
| KUNSAN | Kunsan Air Base | RKJK | South Korea | 9,000 |
| CLARK | Clark Air Base | RPLC | Philippines | 10,499 |

#### AMC Bases (CONUS)
| base_id | Name | ICAO | Country | Runway (ft) |
|---------|------|------|---------|-------------|
| TRAVIS | Travis Air Force Base | KSUU | USA | 11,000 |
| MCCHORD | Joint Base Lewis-McChord | KTCM | USA | 10,108 |
| CHARLESTON | Charleston AFB | KCHS | USA | 9,000 |
| DOVER | Dover Air Force Base | KDOV | USA | 12,900 |

#### Theater Bases
| base_id | Name | ICAO | Country | Runway (ft) |
|---------|------|------|---------|-------------|
| RAMSTEIN | Ramstein Air Base | ETAR | Germany | 10,500 |
| INCIRLIK | Incirlik Air Base | LTAG | Turkey | 10,000 |
| AL_UDEID | Al Udeid Air Base | OTBH | Qatar | 12,500 |
| DIEGO_GARCIA | Naval Support Facility Diego Garcia | FJDG | British Indian Ocean Territory | 12,003 |

## Exported Functions

### getBaseById
Finds a base by its base_id.
```typescript
function getBaseById(baseId: string): MilitaryBase | undefined
```

### searchBases
Searches bases by query string across base_id, name, ICAO, IATA, and country.
```typescript
function searchBases(query: string): MilitaryBase[]
```

## MilitaryBase Interface
```typescript
interface MilitaryBase {
  base_id: string;
  name: string;
  icao: string;
  iata?: string;
  latitude_deg: number;
  longitude_deg: number;
  country: string;
  timezone: string;
  runway_length_ft: number;
}
```

## Usage Example

```typescript
import { 
  MILITARY_BASES, 
  getBaseById, 
  searchBases 
} from '@/lib/bases';

// Get specific base
const hickam = getBaseById('HICKAM');
console.log(hickam?.name);  // 'Joint Base Pearl Harbor-Hickam'

// Search for bases in Japan
const japanBases = searchBases('Japan');
console.log(japanBases.length);  // 3 (Kadena, Yokota, Misawa)

// Search by ICAO
const kadena = searchBases('RODN')[0];
console.log(kadena.runway_length_ft);  // 12100

// Get all bases
const allBases = MILITARY_BASES;
console.log(allBases.length);  // 16
```

## Related Files

- `routeTypes.ts` - Defines MilitaryBase interface
- `routeCalculations.ts` - Uses bases for distance calculations
- `RoutePlanner.tsx` - UI for selecting origin/destination bases

import type { WarehouseZone } from '@shared/schema';

export interface ZoneMatchResult {
  zoneId: number | null;
  zoneName: string | null;
  matchType: 'exact' | 'pattern' | 'fallback' | 'none';
  confidence: number;
}

export function normalizeLocationCode(locationCode: string): string {
  return locationCode.toUpperCase().trim();
}

export function extractBaseLocation(locationCode: string): string {
  const normalized = normalizeLocationCode(locationCode);
  const match = normalized.match(/^(\d{4})/);
  if (match) {
    return match[1];
  }
  const specialMatch = normalized.match(/^([A-Z]+\d*(?:\/[A-Z]+)?)/);
  if (specialMatch) {
    return specialMatch[1];
  }
  return normalized.split(/[\s\-]/)[0];
}

export function matchLocationToZone(locationCode: string, zones: WarehouseZone[]): ZoneMatchResult {
  if (!locationCode || zones.length === 0) {
    return { zoneId: null, zoneName: null, matchType: 'none', confidence: 0 };
  }

  const normalized = normalizeLocationCode(locationCode);
  const baseLocation = extractBaseLocation(locationCode);

  for (const zone of zones) {
    if (zone.location_pattern) {
      try {
        const regex = new RegExp(zone.location_pattern, 'i');
        if (regex.test(normalized) || regex.test(baseLocation)) {
          return {
            zoneId: zone.id,
            zoneName: zone.name,
            matchType: 'exact',
            confidence: 1.0
          };
        }
      } catch (e) {
        console.warn(`[ZoneMatching] Invalid regex pattern for zone ${zone.code}: ${zone.location_pattern}`);
      }
    }
  }

  const numericMatch = normalized.match(/^(\d)/);
  if (numericMatch) {
    const firstDigit = numericMatch[1];
    const zoneCode = `${firstDigit}000`;
    
    const matchedZone = zones.find(z => 
      z.code === zoneCode || 
      z.code.startsWith(firstDigit) ||
      z.name.includes(zoneCode)
    );
    
    if (matchedZone) {
      return {
        zoneId: matchedZone.id,
        zoneName: matchedZone.name,
        matchType: 'pattern',
        confidence: 0.9
      };
    }
  }

  const specialPatterns: { pattern: RegExp; zoneCodes: string[] }[] = [
    { pattern: /^BULK\d*/i, zoneCodes: ['BULK02', 'BULK03', 'BULK04'] },
    { pattern: /^GFM|^RACK/i, zoneCodes: ['GFM/RACK', 'GFM', 'RACK'] },
    { pattern: /^BACKYARD|^BACK\s*YARD/i, zoneCodes: ['BACKYARD'] },
    { pattern: /^WHSE|^WAREHOUSE/i, zoneCodes: ['WHSE', 'WAREHOUSE'] },
    { pattern: /^WOOD\s*SHED/i, zoneCodes: ['WOOD SHED', 'WOODSHED'] },
  ];

  for (const { pattern, zoneCodes } of specialPatterns) {
    if (pattern.test(normalized)) {
      for (const zoneCode of zoneCodes) {
        const matchedZone = zones.find(z => 
          z.code.toUpperCase() === zoneCode.toUpperCase() ||
          z.name.toUpperCase().includes(zoneCode.toUpperCase())
        );
        if (matchedZone) {
          return {
            zoneId: matchedZone.id,
            zoneName: matchedZone.name,
            matchType: 'pattern',
            confidence: 0.85
          };
        }
      }
    }
  }

  const generalZone = zones.find(z => 
    z.code.toUpperCase() === 'WHSE' || 
    z.code.toUpperCase() === 'GENERAL' ||
    z.usage_type === 'general'
  );
  
  if (generalZone) {
    return {
      zoneId: generalZone.id,
      zoneName: generalZone.name,
      matchType: 'fallback',
      confidence: 0.3
    };
  }

  return { zoneId: null, zoneName: null, matchType: 'none', confidence: 0 };
}

export interface ZoneMatchStats {
  total: number;
  matched: number;
  unmatched: number;
  unmatchedLocations: string[];
  matchesByZone: Record<string, number>;
  matchesByType: {
    exact: number;
    pattern: number;
    fallback: number;
    none: number;
  };
}

export function matchLocationsToZones(
  locations: (string | null | undefined)[],
  zones: WarehouseZone[]
): { results: (ZoneMatchResult | null)[]; stats: ZoneMatchStats } {
  const results: (ZoneMatchResult | null)[] = [];
  const stats: ZoneMatchStats = {
    total: locations.length,
    matched: 0,
    unmatched: 0,
    unmatchedLocations: [],
    matchesByZone: {},
    matchesByType: { exact: 0, pattern: 0, fallback: 0, none: 0 }
  };

  const seen = new Set<string>();

  for (const loc of locations) {
    if (!loc) {
      results.push(null);
      stats.unmatched++;
      stats.matchesByType.none++;
      continue;
    }

    const result = matchLocationToZone(loc, zones);
    results.push(result);

    stats.matchesByType[result.matchType]++;

    if (result.zoneId !== null) {
      stats.matched++;
      const zoneName = result.zoneName || `Zone ${result.zoneId}`;
      stats.matchesByZone[zoneName] = (stats.matchesByZone[zoneName] || 0) + 1;
    } else {
      stats.unmatched++;
      const normalized = normalizeLocationCode(loc);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        stats.unmatchedLocations.push(loc);
      }
    }
  }

  return { results, stats };
}

export function createDefaultZonePatterns(): Array<{
  code: string;
  name: string;
  is_outdoor: boolean;
  usage_type: string;
  location_pattern: string;
}> {
  return [
    {
      code: 'GFM/RACK',
      name: 'GFM/RACK (Long Pipes)',
      is_outdoor: true,
      usage_type: 'long_pipes',
      location_pattern: '^GFM|^RACK'
    },
    {
      code: 'BULK02',
      name: 'BULK02 (Uncrated Material)',
      is_outdoor: true,
      usage_type: 'uncrated',
      location_pattern: '^BULK02'
    },
    {
      code: 'BULK03',
      name: 'BULK03 (Crated Material)',
      is_outdoor: true,
      usage_type: 'crated',
      location_pattern: '^BULK03'
    },
    {
      code: 'BULK04',
      name: 'BULK04 (Crated Material)',
      is_outdoor: true,
      usage_type: 'crated',
      location_pattern: '^BULK04'
    },
    {
      code: 'BACKYARD',
      name: 'BACKYARD (Hazmat/Crated)',
      is_outdoor: true,
      usage_type: 'hazmat',
      location_pattern: '^BACKYARD|^BACK\\s*YARD'
    },
    {
      code: '2000',
      name: 'Zone 2000 (Small Material)',
      is_outdoor: false,
      usage_type: 'small_material',
      location_pattern: '^2\\d{3}'
    },
    {
      code: '3000',
      name: 'Zone 3000 (Mixed Material)',
      is_outdoor: false,
      usage_type: 'mixed_material',
      location_pattern: '^3\\d{3}'
    },
    {
      code: '4000',
      name: 'Zone 4000 (Mixed Material)',
      is_outdoor: false,
      usage_type: 'mixed_material',
      location_pattern: '^4\\d{3}'
    },
    {
      code: '7000',
      name: 'Zone 7000 (Large Material)',
      is_outdoor: false,
      usage_type: 'large_material',
      location_pattern: '^7\\d{3}'
    },
    {
      code: 'WHSE',
      name: 'General Warehouse',
      is_outdoor: false,
      usage_type: 'general',
      location_pattern: '^WHSE$'
    },
    {
      code: 'WOOD SHED',
      name: 'Wood Shed Storage',
      is_outdoor: true,
      usage_type: 'general',
      location_pattern: '^WOOD\\s*SHED'
    }
  ];
}

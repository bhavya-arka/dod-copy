import { db } from "../db";
import { warehouseZones, warehouseInventoryItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { WarehouseZone } from "@shared/schema";

export type PositionType = 'RACK' | 'BULK';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type BulkMode = 'exact_by_pallet_id' | 'manual' | 'estimate';
export type WhseRule = 'ignore' | 'treat_as_bulk_7000' | 'custom_zone';

export interface ZoneConfig {
  countBoxAsSeparate: boolean;
  whseRule: WhseRule;
  bulkMode: BulkMode;
  bulkIdColumnName: string | null;
}

export interface ParsedLocation {
  zone: string;
  type: PositionType;
  positionKey: string;
  confidence: ConfidenceLevel;
  requiresUserInput?: boolean;
}

export interface ZoneMetrics {
  zoneId: number;
  zoneCode: string;
  zoneName: string;
  rack: {
    available: number;
    occupied: number;
    open: number;
    openPercent: number;
    confidence: ConfidenceLevel;
  };
  bulk: {
    available: number;
    occupied: number;
    open: number;
    openPercent: number;
    confidence: ConfidenceLevel;
  };
  warnings: string[];
}

export interface AnalyticsResult {
  siteId: number;
  zones: ZoneMetrics[];
  aggregate: {
    rack: { available: number; occupied: number; open: number; openPercent: number };
    bulk: { available: number; occupied: number; open: number; openPercent: number };
    total: { available: number; occupied: number; open: number; openPercent: number };
  };
  warnings: string[];
  promptsNeeded: string[];
  lastUpdated: Date;
}

const BULK_ZONE_TOKENS = ['BULK02', 'BULK03', 'BULK04', 'BACKYARD', 'GFM/RACK', 'GFM', 'RACK', 'WOOD SHED', 'WOODSHED'];
const RACK_PATTERN = /^(\d{4})-([A-Z])/;
const NUMERIC_ZONE_PATTERN = /^(\d)/;

export function normalizeLocation(loc: string): string {
  if (!loc) return '';
  return loc.toUpperCase().trim().replace(/\s+/g, ' ');
}

export function expandShorthand(loc: string): string[] {
  const normalized = normalizeLocation(loc);
  const abMatch = normalized.match(/^(\d{4})-([A-Z])\/([A-Z])$/);
  if (abMatch) {
    const [, num, a, b] = abMatch;
    return [`${num}-${a}`, `${num}-${b}`];
  }
  return [normalized];
}

export function parseLocation(
  loc: string,
  row: Record<string, unknown>,
  config: ZoneConfig
): ParsedLocation | null {
  if (!loc || loc.trim() === '') return null;

  const normalized = normalizeLocation(loc);

  for (const token of BULK_ZONE_TOKENS) {
    if (normalized === token || normalized.startsWith(token + ' ') || normalized.startsWith(token + '-')) {
      if (config.bulkMode === 'exact_by_pallet_id' && config.bulkIdColumnName) {
        const palletId = row[config.bulkIdColumnName] as string;
        if (!palletId) {
          return {
            zone: token,
            type: 'BULK',
            positionKey: token,
            confidence: 'LOW',
            requiresUserInput: true
          };
        }
        return {
          zone: token,
          type: 'BULK',
          positionKey: `${token}::${palletId}`,
          confidence: 'HIGH'
        };
      }
      if (config.bulkMode === 'manual') {
        return null;
      }
      return {
        zone: token,
        type: 'BULK',
        positionKey: token,
        confidence: 'LOW'
      };
    }
  }

  const rackMatch = normalized.match(RACK_PATTERN);
  if (rackMatch) {
    const [, numStr, side] = rackMatch;
    const num = parseInt(numStr, 10);
    const zoneCode = `${Math.floor(num / 1000) * 1000}`;
    
    let positionKey: string;
    let confidence: ConfidenceLevel;
    
    if (config.countBoxAsSeparate) {
      const boxMatch = normalized.match(/BOX\s*(\d+|[A-Z])/i);
      if (boxMatch) {
        positionKey = `${numStr}-${side} BOX ${boxMatch[1]}`;
        confidence = 'MEDIUM';
      } else {
        positionKey = `${numStr}-${side}`;
        confidence = 'HIGH';
      }
    } else {
      positionKey = `${numStr}-${side}`;
      confidence = 'HIGH';
    }

    const type: PositionType = zoneCode === '7000' ? 'BULK' : 'RACK';

    return {
      zone: zoneCode,
      type,
      positionKey,
      confidence
    };
  }

  if (normalized === 'WHSE' || normalized === 'WAREHOUSE') {
    if (config.whseRule === 'ignore') {
      return null;
    }
    if (config.whseRule === 'treat_as_bulk_7000') {
      return {
        zone: '7000',
        type: 'BULK',
        positionKey: 'WHSE',
        confidence: 'LOW'
      };
    }
    return {
      zone: 'WHSE',
      type: 'BULK',
      positionKey: 'WHSE',
      confidence: 'LOW'
    };
  }

  const numericMatch = normalized.match(NUMERIC_ZONE_PATTERN);
  if (numericMatch) {
    const firstDigit = numericMatch[1];
    const zoneCode = `${firstDigit}000`;
    return {
      zone: zoneCode,
      type: 'RACK',
      positionKey: normalized.split(/\s/)[0],
      confidence: 'MEDIUM'
    };
  }

  return null;
}

export function mapZoneCodeToZoneId(
  zoneCode: string,
  zones: WarehouseZone[]
): number | null {
  const normalizedCode = zoneCode.toUpperCase().trim();
  
  for (const zone of zones) {
    if (zone.code.toUpperCase() === normalizedCode) {
      return zone.id;
    }
    if (zone.name.toUpperCase().includes(normalizedCode)) {
      return zone.id;
    }
    if (zone.location_pattern) {
      try {
        const regex = new RegExp(zone.location_pattern, 'i');
        if (regex.test(normalizedCode)) {
          return zone.id;
        }
      } catch (e) {
      }
    }
  }
  
  return null;
}

export async function computePalletMetrics(
  siteId: number,
  config: ZoneConfig = {
    countBoxAsSeparate: false,
    whseRule: 'ignore',
    bulkMode: 'estimate',
    bulkIdColumnName: null
  }
): Promise<AnalyticsResult> {
  const warnings: string[] = [];
  const promptsNeeded: string[] = [];

  const zones = await db.select()
    .from(warehouseZones)
    .where(eq(warehouseZones.site_id, siteId));

  if (zones.length === 0) {
    return {
      siteId,
      zones: [],
      aggregate: {
        rack: { available: 0, occupied: 0, open: 0, openPercent: 0 },
        bulk: { available: 0, occupied: 0, open: 0, openPercent: 0 },
        total: { available: 0, occupied: 0, open: 0, openPercent: 0 }
      },
      warnings: ['No zones configured for this site'],
      promptsNeeded: ['Please add zones to this warehouse site'],
      lastUpdated: new Date()
    };
  }

  const inventoryItems = await db.select()
    .from(warehouseInventoryItems)
    .where(eq(warehouseInventoryItems.site_id, siteId));

  const occupiedSets: Map<number, { rack: Set<string>; bulk: Set<string> }> = new Map();
  
  for (const zone of zones) {
    occupiedSets.set(zone.id, { rack: new Set(), bulk: new Set() });
  }

  for (const item of inventoryItems) {
    const location = item.location || '';
    const expandedLocs = expandShorthand(location);

    for (const oneLoc of expandedLocs) {
      const parsed = parseLocation(oneLoc, (item.raw_row as Record<string, unknown>) || ({} as Record<string, unknown>), config);
      
      if (!parsed) continue;

      let zoneId: number | null = null;
      
      if (item.zone_id) {
        zoneId = item.zone_id;
      } else {
        zoneId = mapZoneCodeToZoneId(parsed.zone, zones);
      }

      if (zoneId === null) {
        continue;
      }

      const sets = occupiedSets.get(zoneId);
      if (sets) {
        if (parsed.type === 'RACK') {
          sets.rack.add(parsed.positionKey);
        } else {
          sets.bulk.add(parsed.positionKey);
        }
      }
    }
  }

  const zoneMetrics: ZoneMetrics[] = [];
  let totalRackAvailable = 0, totalRackOccupied = 0;
  let totalBulkAvailable = 0, totalBulkOccupied = 0;

  for (const zone of zones) {
    const sets = occupiedSets.get(zone.id)!;
    const rackOccupied = sets.rack.size;
    const bulkOccupied = sets.bulk.size;

    const rackAvailable = zone.rack_available || zone.capacity_pallets || zone.total_capacity || 0;
    const bulkAvailable = zone.bulk_available || 0;

    const rackOpen = Math.max(rackAvailable - rackOccupied, 0);
    const bulkOpen = Math.max(bulkAvailable - bulkOccupied, 0);

    const rackOpenPercent = rackAvailable > 0 ? Math.round((rackOpen / rackAvailable) * 100) : 0;
    const bulkOpenPercent = bulkAvailable > 0 ? Math.round((bulkOpen / bulkAvailable) * 100) : 0;

    const zoneWarnings: string[] = [];

    if (rackAvailable === 0 && rackOccupied > 0) {
      zoneWarnings.push(`Zone ${zone.code}: Rack capacity not set but ${rackOccupied} positions occupied`);
      promptsNeeded.push(`Set rack capacity for zone ${zone.code}`);
    }
    if (bulkAvailable === 0 && bulkOccupied > 0) {
      zoneWarnings.push(`Zone ${zone.code}: Bulk capacity not set but ${bulkOccupied} positions occupied`);
      promptsNeeded.push(`Set bulk capacity for zone ${zone.code}`);
    }
    if (rackOccupied > rackAvailable && rackAvailable > 0) {
      zoneWarnings.push(`Zone ${zone.code}: Rack occupied (${rackOccupied}) exceeds available (${rackAvailable})`);
    }
    if (bulkOccupied > bulkAvailable && bulkAvailable > 0) {
      zoneWarnings.push(`Zone ${zone.code}: Bulk occupied (${bulkOccupied}) exceeds available (${bulkAvailable})`);
    }

    warnings.push(...zoneWarnings);

    let rackConfidence: ConfidenceLevel = 'HIGH';
    let bulkConfidence: ConfidenceLevel = config.bulkMode === 'estimate' ? 'LOW' : 'HIGH';
    
    if (rackAvailable === 0) rackConfidence = 'LOW';
    if (bulkAvailable === 0 && bulkOccupied > 0) bulkConfidence = 'LOW';

    zoneMetrics.push({
      zoneId: zone.id,
      zoneCode: zone.code,
      zoneName: zone.name,
      rack: {
        available: rackAvailable,
        occupied: rackOccupied,
        open: rackOpen,
        openPercent: rackOpenPercent,
        confidence: rackConfidence
      },
      bulk: {
        available: bulkAvailable,
        occupied: bulkOccupied,
        open: bulkOpen,
        openPercent: bulkOpenPercent,
        confidence: bulkConfidence
      },
      warnings: zoneWarnings
    });

    totalRackAvailable += rackAvailable;
    totalRackOccupied += rackOccupied;
    totalBulkAvailable += bulkAvailable;
    totalBulkOccupied += bulkOccupied;
  }

  const totalRackOpen = Math.max(totalRackAvailable - totalRackOccupied, 0);
  const totalBulkOpen = Math.max(totalBulkAvailable - totalBulkOccupied, 0);
  const totalAvailable = totalRackAvailable + totalBulkAvailable;
  const totalOccupied = totalRackOccupied + totalBulkOccupied;
  const totalOpen = totalRackOpen + totalBulkOpen;

  return {
    siteId,
    zones: zoneMetrics,
    aggregate: {
      rack: {
        available: totalRackAvailable,
        occupied: totalRackOccupied,
        open: totalRackOpen,
        openPercent: totalRackAvailable > 0 ? Math.round((totalRackOpen / totalRackAvailable) * 100) : 0
      },
      bulk: {
        available: totalBulkAvailable,
        occupied: totalBulkOccupied,
        open: totalBulkOpen,
        openPercent: totalBulkAvailable > 0 ? Math.round((totalBulkOpen / totalBulkAvailable) * 100) : 0
      },
      total: {
        available: totalAvailable,
        occupied: totalOccupied,
        open: totalOpen,
        openPercent: totalAvailable > 0 ? Math.round((totalOpen / totalAvailable) * 100) : 0
      }
    },
    warnings,
    promptsNeeded,
    lastUpdated: new Date()
  };
}

export async function updateZoneMetrics(siteId: number, config?: ZoneConfig): Promise<{
  success: boolean;
  zonesUpdated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let zonesUpdated = 0;

  try {
    const result = await computePalletMetrics(siteId, config);

    for (const metric of result.zones) {
      try {
        await db.update(warehouseZones)
          .set({
            rack_open: metric.rack.open,
            bulk_open: metric.bulk.open,
            current_item_count: metric.rack.occupied + metric.bulk.occupied,
            last_synced_at: new Date()
          })
          .where(eq(warehouseZones.id, metric.zoneId));
        zonesUpdated++;
      } catch (error) {
        errors.push(`Failed to update zone ${metric.zoneCode}: ${error}`);
      }
    }

    console.log(`[PalletPosition] Updated ${zonesUpdated} zones for site ${siteId}`);
  } catch (error) {
    errors.push(`Failed to compute metrics: ${error}`);
    console.error('[PalletPosition] Update error:', error);
  }

  return {
    success: errors.length === 0,
    zonesUpdated,
    errors
  };
}

const metricsCache = new Map<number, { result: AnalyticsResult; expiry: number }>();
const CACHE_TTL_MS = 60000;

export async function getCachedPalletMetrics(
  siteId: number,
  config?: ZoneConfig,
  forceRefresh: boolean = false
): Promise<AnalyticsResult> {
  const now = Date.now();
  const cached = metricsCache.get(siteId);

  if (!forceRefresh && cached && cached.expiry > now) {
    return cached.result;
  }

  const result = await computePalletMetrics(siteId, config);
  metricsCache.set(siteId, { result, expiry: now + CACHE_TTL_MS });
  
  return result;
}

export function invalidateMetricsCache(siteId: number): void {
  metricsCache.delete(siteId);
  console.log(`[PalletPosition] Cache invalidated for site ${siteId}`);
}

export function invalidateAllMetricsCache(): void {
  metricsCache.clear();
  console.log('[PalletPosition] All cache invalidated');
}

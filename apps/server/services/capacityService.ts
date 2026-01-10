/**
 * Warehouse Capacity Tracking Service
 * Implements DLA standards: 4×4×4 ft pallet blocks, ≤2,000 lbs per pallet
 */

import { db } from "../db";
import { warehouseSites, warehouseLocations, warehouseInventoryItems, warehouseZones } from "../../../shared/schema";
import { eq, sql, and, sum, inArray } from "drizzle-orm";

// DLA Standard pallet block dimensions
export const PALLET_BLOCK_LENGTH_FT = 4;
export const PALLET_BLOCK_WIDTH_FT = 4;
export const PALLET_BLOCK_HEIGHT_FT = 4;
export const PALLET_BLOCK_CUBIC_FT = PALLET_BLOCK_LENGTH_FT * PALLET_BLOCK_WIDTH_FT * PALLET_BLOCK_HEIGHT_FT; // 64 cu ft
export const MAX_PALLET_WEIGHT_LBS = 2000;

export interface CapacityMetrics {
  siteId: number;
  siteName: string;
  totalPalletPositions: number;
  usedPalletPositions: number;
  openPalletPositions: number;
  utilizationPercent: number;
  totalCubicFeet: number;
  usedCubicFeet: number;
  totalWeightCapacityLbs: number;
  currentWeightLbs: number;
  weightUtilizationPercent: number;
  status: 'green' | 'yellow' | 'red'; // green <70%, yellow 70-90%, red >90%
}

export interface LocationCapacity {
  locationId: number;
  locationCode: string;
  blockLengthFt: number;
  blockWidthFt: number;
  blockHeightFt: number;
  cubicFeet: number;
  maxWeightLbs: number;
  currentWeightLbs: number;
  isOccupied: boolean;
  itemCount: number;
}

/**
 * Calculate capacity status color based on utilization
 */
export function getCapacityStatus(utilizationPercent: number): 'green' | 'yellow' | 'red' {
  if (utilizationPercent >= 90) return 'red';
  if (utilizationPercent >= 70) return 'yellow';
  return 'green';
}

/**
 * Get capacity metrics for a specific site
 */
export async function getSiteCapacity(siteId: number): Promise<CapacityMetrics | null> {
  const site = await db.query.warehouseSites.findFirst({
    where: eq(warehouseSites.id, siteId),
  });

  if (!site) return null;

  // Get location occupancy stats
  const locations = await db.query.warehouseLocations.findMany({
    where: eq(warehouseLocations.site_id, siteId),
  });

  // Count occupied vs open positions
  const totalPositions = locations.length;
  const occupiedPositions = locations.filter(l => l.is_occupied).length;
  const openPositions = totalPositions - occupiedPositions;

  // Calculate cubic feet
  const totalCubicFeet = locations.reduce((sum, loc) => {
    const l = parseFloat(String(loc.block_length_ft)) || PALLET_BLOCK_LENGTH_FT;
    const w = parseFloat(String(loc.block_width_ft)) || PALLET_BLOCK_WIDTH_FT;
    const h = parseFloat(String(loc.block_height_ft)) || PALLET_BLOCK_HEIGHT_FT;
    return sum + (l * w * h);
  }, 0);

  const usedCubicFeet = locations
    .filter(l => l.is_occupied)
    .reduce((sum, loc) => {
      const l = parseFloat(String(loc.block_length_ft)) || PALLET_BLOCK_LENGTH_FT;
      const w = parseFloat(String(loc.block_width_ft)) || PALLET_BLOCK_WIDTH_FT;
      const h = parseFloat(String(loc.block_height_ft)) || PALLET_BLOCK_HEIGHT_FT;
      return sum + (l * w * h);
    }, 0);

  // Calculate weight
  const totalWeightCapacity = locations.reduce((sum, loc) => {
    return sum + (loc.max_weight_lbs || MAX_PALLET_WEIGHT_LBS);
  }, 0);

  const currentWeight = locations.reduce((sum, loc) => {
    return sum + (loc.current_weight_lbs || 0);
  }, 0);

  const utilizationPercent = totalPositions > 0 ? (occupiedPositions / totalPositions) * 100 : 0;
  const weightUtilization = totalWeightCapacity > 0 ? (currentWeight / totalWeightCapacity) * 100 : 0;

  return {
    siteId,
    siteName: site.name,
    totalPalletPositions: totalPositions,
    usedPalletPositions: occupiedPositions,
    openPalletPositions: openPositions,
    utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    totalCubicFeet: Math.round(totalCubicFeet * 100) / 100,
    usedCubicFeet: Math.round(usedCubicFeet * 100) / 100,
    totalWeightCapacityLbs: totalWeightCapacity,
    currentWeightLbs: currentWeight,
    weightUtilizationPercent: Math.round(weightUtilization * 10) / 10,
    status: getCapacityStatus(Math.max(utilizationPercent, weightUtilization)),
  };
}

/**
 * Get capacity metrics for all sites (optimized batch query)
 * Uses zone-based capacity (rack + bulk positions) for utilization calculation
 */
export async function getAllSiteCapacities(userId?: number): Promise<CapacityMetrics[]> {
  const sites = userId 
    ? await db.query.warehouseSites.findMany({ where: eq(warehouseSites.user_id, userId) })
    : await db.query.warehouseSites.findMany();
  
  if (sites.length === 0) {
    return [];
  }
  
  const siteIds = sites.map(s => s.id);
  
  const [allZones, allLocations] = await Promise.all([
    db.query.warehouseZones.findMany({
      where: inArray(warehouseZones.site_id, siteIds)
    }),
    db.query.warehouseLocations.findMany({
      where: inArray(warehouseLocations.site_id, siteIds)
    })
  ]);
  
  const zonesBySite = new Map<number, typeof allZones>();
  for (const zone of allZones) {
    const siteZones = zonesBySite.get(zone.site_id) || [];
    siteZones.push(zone);
    zonesBySite.set(zone.site_id, siteZones);
  }
  
  const locationsBySite = new Map<number, typeof allLocations>();
  for (const loc of allLocations) {
    const siteLocations = locationsBySite.get(loc.site_id) || [];
    siteLocations.push(loc);
    locationsBySite.set(loc.site_id, siteLocations);
  }
  
  return sites.map(site => {
    const zones = zonesBySite.get(site.id) || [];
    const locations = locationsBySite.get(site.id) || [];
    
    let totalPositions = 0;
    let usedPositions = 0;
    
    for (const zone of zones) {
      const rackAvail = zone.rack_available || 0;
      const rackOpen = zone.rack_open || 0;
      const bulkAvail = zone.bulk_available || 0;
      const bulkOpen = zone.bulk_open || 0;
      
      totalPositions += rackAvail + bulkAvail;
      usedPositions += (rackAvail - rackOpen) + (bulkAvail - bulkOpen);
    }
    
    if (totalPositions === 0 && locations.length > 0) {
      totalPositions = locations.length;
      usedPositions = locations.filter(l => l.is_occupied).length;
    }
    
    const openPositions = totalPositions - usedPositions;
    
    const totalCubicFeet = locations.reduce((sum, loc) => {
      const l = parseFloat(String(loc.block_length_ft)) || PALLET_BLOCK_LENGTH_FT;
      const w = parseFloat(String(loc.block_width_ft)) || PALLET_BLOCK_WIDTH_FT;
      const h = parseFloat(String(loc.block_height_ft)) || PALLET_BLOCK_HEIGHT_FT;
      return sum + (l * w * h);
    }, 0);
    
    const usedCubicFeet = locations
      .filter(l => l.is_occupied)
      .reduce((sum, loc) => {
        const l = parseFloat(String(loc.block_length_ft)) || PALLET_BLOCK_LENGTH_FT;
        const w = parseFloat(String(loc.block_width_ft)) || PALLET_BLOCK_WIDTH_FT;
        const h = parseFloat(String(loc.block_height_ft)) || PALLET_BLOCK_HEIGHT_FT;
        return sum + (l * w * h);
      }, 0);
    
    const totalWeightCapacity = locations.reduce((sum, loc) => {
      return sum + (loc.max_weight_lbs || MAX_PALLET_WEIGHT_LBS);
    }, 0);
    
    const currentWeight = locations.reduce((sum, loc) => {
      return sum + (loc.current_weight_lbs || 0);
    }, 0);
    
    const utilizationPercent = totalPositions > 0 ? (usedPositions / totalPositions) * 100 : 0;
    const weightUtilization = totalWeightCapacity > 0 ? (currentWeight / totalWeightCapacity) * 100 : 0;
    
    return {
      siteId: site.id,
      siteName: site.name,
      totalPalletPositions: totalPositions,
      usedPalletPositions: usedPositions,
      openPalletPositions: openPositions,
      utilizationPercent: Math.round(utilizationPercent * 10) / 10,
      totalCubicFeet: Math.round(totalCubicFeet * 100) / 100,
      usedCubicFeet: Math.round(usedCubicFeet * 100) / 100,
      totalWeightCapacityLbs: totalWeightCapacity,
      currentWeightLbs: currentWeight,
      weightUtilizationPercent: Math.round(weightUtilization * 10) / 10,
      status: getCapacityStatus(Math.max(utilizationPercent, weightUtilization)),
    };
  });
}

/**
 * Get individual location capacities for a site
 */
export async function getLocationCapacities(siteId: number): Promise<LocationCapacity[]> {
  const locations = await db.query.warehouseLocations.findMany({
    where: eq(warehouseLocations.site_id, siteId),
  });

  return locations.map(loc => ({
    locationId: loc.id,
    locationCode: loc.code,
    blockLengthFt: parseFloat(String(loc.block_length_ft)) || PALLET_BLOCK_LENGTH_FT,
    blockWidthFt: parseFloat(String(loc.block_width_ft)) || PALLET_BLOCK_WIDTH_FT,
    blockHeightFt: parseFloat(String(loc.block_height_ft)) || PALLET_BLOCK_HEIGHT_FT,
    cubicFeet: (parseFloat(String(loc.block_length_ft)) || PALLET_BLOCK_LENGTH_FT) *
               (parseFloat(String(loc.block_width_ft)) || PALLET_BLOCK_WIDTH_FT) *
               (parseFloat(String(loc.block_height_ft)) || PALLET_BLOCK_HEIGHT_FT),
    maxWeightLbs: loc.max_weight_lbs || MAX_PALLET_WEIGHT_LBS,
    currentWeightLbs: loc.current_weight_lbs || 0,
    isOccupied: loc.is_occupied || false,
    itemCount: 0, // Will be populated if needed
  }));
}

/**
 * Update site capacity totals (call after inventory changes)
 */
export async function updateSiteCapacity(siteId: number): Promise<void> {
  const capacity = await getSiteCapacity(siteId);
  if (!capacity) return;

  await db.update(warehouseSites)
    .set({
      total_pallet_positions: capacity.totalPalletPositions,
      open_pallet_positions: capacity.openPalletPositions,
      total_cubic_feet: String(capacity.totalCubicFeet),
      used_cubic_feet: String(capacity.usedCubicFeet),
      current_weight_lbs: capacity.currentWeightLbs,
    })
    .where(eq(warehouseSites.id, siteId));
}

/**
 * Find available location for item placement
 */
export async function findAvailableLocation(
  siteId: number,
  weightLbs: number
): Promise<LocationCapacity | null> {
  const locations = await getLocationCapacities(siteId);
  
  // Find first available location that can hold the weight
  const available = locations.find(loc => 
    !loc.isOccupied && 
    (loc.maxWeightLbs - loc.currentWeightLbs) >= weightLbs
  );

  return available || null;
}

/**
 * Check if site can accept new items based on capacity
 */
export async function canAcceptItems(
  siteId: number,
  itemCount: number,
  totalWeightLbs: number
): Promise<{ canAccept: boolean; reason?: string }> {
  const capacity = await getSiteCapacity(siteId);
  if (!capacity) {
    return { canAccept: false, reason: 'Site not found' };
  }

  if (capacity.openPalletPositions < itemCount) {
    return {
      canAccept: false,
      reason: `Insufficient pallet positions. Need ${itemCount}, have ${capacity.openPalletPositions} available.`,
    };
  }

  const remainingWeight = capacity.totalWeightCapacityLbs - capacity.currentWeightLbs;
  if (remainingWeight < totalWeightLbs) {
    return {
      canAccept: false,
      reason: `Insufficient weight capacity. Need ${totalWeightLbs} lbs, have ${remainingWeight} lbs available.`,
    };
  }

  return { canAccept: true };
}

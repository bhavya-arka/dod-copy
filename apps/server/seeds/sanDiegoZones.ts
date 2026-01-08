import { db } from '../db';
import { warehouseZones, warehouseSites } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createDefaultZonePatterns } from '../services/zoneMatchingService';

export async function seedSanDiegoZones(): Promise<{ success: boolean; message: string; zonesCreated: number }> {
  console.log('[SeedZones] Starting San Diego zones seed...');
  
  const sites = await db.select().from(warehouseSites).where(eq(warehouseSites.is_active, true));
  
  let sanDiegoSite = sites.find(s => 
    s.name.toLowerCase().includes('san diego') || 
    s.code.toLowerCase().includes('sd') ||
    s.name.toLowerCase().includes('bats')
  );
  
  if (!sanDiegoSite && sites.length > 0) {
    sanDiegoSite = sites[0];
    console.log(`[SeedZones] No San Diego site found, using first site: ${sanDiegoSite.name}`);
  }
  
  if (!sanDiegoSite) {
    console.log('[SeedZones] No active warehouse sites found. Creating San Diego BATS site...');
    
    const [newSite] = await db.insert(warehouseSites).values({
      code: 'SD-BATS',
      name: 'San Diego BATS Warehouse',
      address: 'San Diego, CA',
      latitude: '32.7157',
      longitude: '-117.1611',
      is_active: true,
    }).returning();
    
    sanDiegoSite = newSite;
    console.log(`[SeedZones] Created new site: ${sanDiegoSite.name} (ID: ${sanDiegoSite.id})`);
  }
  
  const existingZones = await db.select().from(warehouseZones).where(eq(warehouseZones.site_id, sanDiegoSite.id));
  
  if (existingZones.length > 0) {
    console.log(`[SeedZones] Site ${sanDiegoSite.name} already has ${existingZones.length} zones. Skipping seed.`);
    return {
      success: true,
      message: `Site already has ${existingZones.length} zones configured`,
      zonesCreated: 0
    };
  }
  
  const zonePatterns = createDefaultZonePatterns();
  
  const zonesData = zonePatterns.map(pattern => ({
    site_id: sanDiegoSite!.id,
    building_id: null,
    code: pattern.code,
    name: pattern.name,
    zone_type: pattern.is_outdoor ? 'outdoor' : 'indoor',
    is_outdoor: pattern.is_outdoor,
    usage_type: pattern.usage_type,
    bulk_available: pattern.is_outdoor ? 50 : 0,
    bulk_open: pattern.is_outdoor ? 50 : 0,
    rack_available: pattern.is_outdoor ? 0 : 100,
    rack_open: pattern.is_outdoor ? 0 : 100,
    location_pattern: pattern.location_pattern,
    weight_limit_lbs: 2000,
    capacity_pallets: pattern.is_outdoor ? 50 : 100,
    metadata: {},
  }));
  
  const insertedZones = await db.insert(warehouseZones).values(zonesData).returning();
  
  console.log(`[SeedZones] Successfully created ${insertedZones.length} zones for ${sanDiegoSite.name}`);
  
  for (const zone of insertedZones) {
    console.log(`  - ${zone.code}: ${zone.name} (pattern: ${zone.location_pattern})`);
  }
  
  return {
    success: true,
    message: `Created ${insertedZones.length} zones for ${sanDiegoSite.name}`,
    zonesCreated: insertedZones.length
  };
}

export async function getZonesForSite(siteId: number): Promise<typeof warehouseZones.$inferSelect[]> {
  return db.select().from(warehouseZones).where(eq(warehouseZones.site_id, siteId));
}

export async function checkSiteHasZones(siteId: number): Promise<boolean> {
  const zones = await db.select().from(warehouseZones).where(eq(warehouseZones.site_id, siteId));
  return zones.length > 0;
}

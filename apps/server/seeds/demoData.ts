/**
 * Demo Data Seed for Land and Sea Logistics
 * Creates realistic military logistics scenarios for Army DevX demo
 */

import { db } from "../db";
import { 
  landRoutes, 
  landConvoys, 
  landConvoyVehicles,
  seaVoyages, 
  seaContainers,
  seaVesselTypes,
  landVehicleTypes
} from "@shared/schema";
import { eq } from "drizzle-orm";

const DEMO_USER_ID = 2;

export const landRouteDemoData = [
  {
    user_id: DEMO_USER_ID,
    name: "Camp Humphreys to Osan AFB Supply Run",
    origin_name: "Camp Humphreys, South Korea",
    origin_lat: "36.9547",
    origin_lng: "127.0322",
    destination_name: "Osan Air Base, South Korea",
    destination_lat: "37.0892",
    destination_lng: "127.0308",
    waypoints: JSON.stringify([
      { lat: 37.01, lng: 127.03, name: "Checkpoint Alpha" }
    ]),
    distance_km: "35.5",
    estimated_duration_hrs: "1.25",
    status: "active",
    metadata: JSON.stringify({ priority: "high", convoy_type: "resupply" }),
  },
  {
    user_id: DEMO_USER_ID,
    name: "Fort Liberty to Port of Wilmington",
    origin_name: "Fort Liberty, North Carolina",
    origin_lat: "35.1390",
    origin_lng: "-79.0064",
    destination_name: "Port of Wilmington, NC",
    destination_lat: "34.2257",
    destination_lng: "-77.9453",
    waypoints: JSON.stringify([
      { lat: 34.68, lng: -78.32, name: "Rest Stop Bravo" }
    ]),
    distance_km: "156.2",
    estimated_duration_hrs: "3.5",
    status: "active",
    metadata: JSON.stringify({ priority: "routine", convoy_type: "deployment" }),
  },
  {
    user_id: DEMO_USER_ID,
    name: "Joint Base Lewis-McChord to Seattle Port",
    origin_name: "Joint Base Lewis-McChord, WA",
    origin_lat: "47.1044",
    origin_lng: "-122.5584",
    destination_name: "Port of Seattle, WA",
    destination_lat: "47.5935",
    destination_lng: "-122.3364",
    waypoints: JSON.stringify([]),
    distance_km: "68.4",
    estimated_duration_hrs: "1.75",
    status: "active",
    metadata: JSON.stringify({ priority: "high", convoy_type: "equipment_transfer" }),
  },
  {
    user_id: DEMO_USER_ID,
    name: "Fort Bliss to Port of Houston",
    origin_name: "Fort Bliss, Texas",
    origin_lat: "31.8163",
    origin_lng: "-106.4207",
    destination_name: "Port of Houston, TX",
    destination_lat: "29.7604",
    destination_lng: "-95.0148",
    waypoints: JSON.stringify([
      { lat: 30.55, lng: -99.12, name: "Fuel Point Charlie" },
      { lat: 30.08, lng: -97.45, name: "Checkpoint Delta" }
    ]),
    distance_km: "895.3",
    estimated_duration_hrs: "12.5",
    status: "planned",
    metadata: JSON.stringify({ priority: "immediate", convoy_type: "heavy_equipment" }),
  },
];

export const landConvoyDemoData = [
  {
    user_id: DEMO_USER_ID,
    name: "OPLAN IRON THUNDER Resupply",
    origin: "Camp Humphreys, South Korea",
    destination: "Osan Air Base, South Korea",
    vehicle_count: 8,
    total_cargo_weight_lbs: 145000,
    scheduled_departure: new Date(Date.now() + 2 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 4 * 60 * 60 * 1000),
    status: "planned",
    cargo_manifest: JSON.stringify([
      { nsn: "1005-01-592-2885", description: "5.56mm Ball M855A1", quantity: 50000, weight_lbs: 2800 },
      { nsn: "8140-01-516-4067", description: "463L Pallet with Cargo Net", quantity: 12, weight_lbs: 4200 },
      { nsn: "2320-01-354-3451", description: "Vehicle Parts Kit", quantity: 4, weight_lbs: 8500 },
    ]),
  },
  {
    user_id: DEMO_USER_ID,
    name: "DEFENDER 26 Heavy Lift",
    origin: "Fort Liberty, North Carolina",
    destination: "Port of Wilmington, NC",
    vehicle_count: 12,
    total_cargo_weight_lbs: 385000,
    scheduled_departure: new Date(Date.now() + 24 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 28 * 60 * 60 * 1000),
    status: "draft",
    cargo_manifest: JSON.stringify([
      { nsn: "2350-01-621-4283", description: "M2A3 Bradley Track Assembly", quantity: 6, weight_lbs: 42000 },
      { nsn: "2520-01-534-0934", description: "Engine, Diesel Tank", quantity: 3, weight_lbs: 15600 },
      { nsn: "6115-01-392-4484", description: "Generator Set, 30kW MEP-805A", quantity: 8, weight_lbs: 24000 },
    ]),
  },
  {
    user_id: DEMO_USER_ID,
    name: "Pacific Pathways Equipment Move",
    origin: "Joint Base Lewis-McChord, WA",
    destination: "Port of Seattle, WA",
    vehicle_count: 6,
    total_cargo_weight_lbs: 95000,
    scheduled_departure: new Date(Date.now() - 1 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 1 * 60 * 60 * 1000),
    status: "underway",
    cargo_manifest: JSON.stringify([
      { nsn: "5820-01-505-7917", description: "Radio Set, AN/PRC-152A", quantity: 48, weight_lbs: 576 },
      { nsn: "5855-01-534-0933", description: "Night Vision Goggles AN/PVS-14", quantity: 120, weight_lbs: 144 },
      { nsn: "2540-01-467-1893", description: "Shelter, Expandable ISO", quantity: 4, weight_lbs: 28000 },
    ]),
  },
  {
    user_id: DEMO_USER_ID,
    name: "USARPAC Sustainment Push",
    origin: "Fort Bliss, Texas",
    destination: "Port of Houston, TX",
    vehicle_count: 15,
    total_cargo_weight_lbs: 520000,
    scheduled_departure: new Date(Date.now() + 48 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 62 * 60 * 60 * 1000),
    status: "draft",
    cargo_manifest: JSON.stringify([
      { nsn: "2350-01-535-4932", description: "M1A2 SEPv3 Abrams Track Pads", quantity: 200, weight_lbs: 6000 },
      { nsn: "2350-01-570-3483", description: "Bradley Fighting Vehicle Road Wheels", quantity: 48, weight_lbs: 4800 },
      { nsn: "9130-01-452-8893", description: "JP-8 Fuel Bladder System", quantity: 6, weight_lbs: 1800 },
    ]),
  },
];

export const seaVoyageDemoData = [
  {
    user_id: DEMO_USER_ID,
    name: "USNS Brittin PACIFIC SURGE Deployment",
    vessel_name: "USNS Brittin",
    vessel_imo: "9168913",
    vessel_hull_number: "T-AKR 305",
    vessel_class: "Bob Hope-class LMSR",
    origin_port: "Port of Beaumont, TX",
    destination_port: "Busan, South Korea",
    port_calls: JSON.stringify([
      { port: "Pearl Harbor, HI", eta: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), purpose: "Refuel" },
      { port: "Yokosuka, Japan", eta: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), purpose: "Offload" },
    ]),
    scheduled_departure: new Date(Date.now() + 24 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    status: "planned",
    metadata: JSON.stringify({ 
      operation: "PACIFIC SURGE", 
      cargo_type: "heavy_armor",
      priority: "immediate" 
    }),
  },
  {
    user_id: DEMO_USER_ID,
    name: "USNS Lewis and Clark INDOPACOM Resupply",
    vessel_name: "USNS Lewis and Clark",
    vessel_imo: "9294057",
    vessel_hull_number: "T-AKE 1",
    vessel_class: "Lewis and Clark-class",
    origin_port: "San Diego, CA",
    destination_port: "Yokosuka, Japan",
    port_calls: JSON.stringify([
      { port: "Pearl Harbor, HI", eta: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), purpose: "UNREP" },
      { port: "Guam", eta: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), purpose: "Cargo Transfer" },
    ]),
    scheduled_departure: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    status: "underway",
    metadata: JSON.stringify({ 
      operation: "INDOPACOM Sustainment", 
      cargo_type: "ammunition_provisions",
      priority: "routine" 
    }),
  },
  {
    user_id: DEMO_USER_ID,
    name: "USNS Watson DEFENDER 26 Sealift",
    vessel_name: "USNS Watson",
    vessel_imo: "9132614",
    vessel_hull_number: "T-AKR 310",
    vessel_class: "Watson-class LMSR",
    origin_port: "Port of Wilmington, NC",
    destination_port: "Bremerhaven, Germany",
    port_calls: JSON.stringify([
      { port: "Rota, Spain", eta: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), purpose: "Refuel" },
    ]),
    scheduled_departure: new Date(Date.now() + 72 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    status: "loading",
    metadata: JSON.stringify({ 
      operation: "DEFENDER 26", 
      cargo_type: "armored_brigade",
      priority: "high" 
    }),
  },
  {
    user_id: DEMO_USER_ID,
    name: "USNS Sacagawea Alaska Resupply",
    vessel_name: "USNS Sacagawea",
    vessel_imo: "9369035",
    vessel_hull_number: "T-AKE 2",
    vessel_class: "Lewis and Clark-class",
    origin_port: "Seattle, WA",
    destination_port: "Joint Base Elmendorf-Richardson, AK",
    port_calls: JSON.stringify([]),
    scheduled_departure: new Date(Date.now() + 12 * 60 * 60 * 1000),
    scheduled_arrival: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    status: "planned",
    metadata: JSON.stringify({ 
      operation: "Arctic Sustainment", 
      cargo_type: "provisions_fuel",
      priority: "routine" 
    }),
  },
];

export const seaContainerDemoData = [
  {
    user_id: DEMO_USER_ID,
    container_number: "MSCU2845671",
    container_type: "40HC",
    seal_number: "DOD-789234",
    weight_lbs: 52000,
    tare_weight_lbs: 8500,
    status: "loaded",
    cargo_manifest: JSON.stringify([
      { id: "1", description: "MRE Case A Menu", quantity: 1200, weight_lbs: 26400, nsn: "8970-00-926-5655" },
      { id: "2", description: "Water Purification Unit", quantity: 4, weight_lbs: 12000, nsn: "4610-01-530-8193" },
    ]),
  },
  {
    user_id: DEMO_USER_ID,
    container_number: "MSCU3912845",
    container_type: "40GP",
    seal_number: "DOD-789235",
    weight_lbs: 44000,
    tare_weight_lbs: 8200,
    status: "loaded",
    cargo_manifest: JSON.stringify([
      { id: "1", description: "5.56mm M855A1 Ammunition", quantity: 100000, weight_lbs: 5600, nsn: "1305-01-592-2885" },
      { id: "2", description: "7.62mm M80A1 Ammunition", quantity: 50000, weight_lbs: 3100, nsn: "1305-01-592-2886" },
      { id: "3", description: "40mm HE Grenades", quantity: 2000, weight_lbs: 4400, nsn: "1310-01-531-5649" },
    ]),
  },
  {
    user_id: DEMO_USER_ID,
    container_number: "MSCU4567123",
    container_type: "20GP",
    seal_number: "DOD-789236",
    weight_lbs: 28000,
    tare_weight_lbs: 5100,
    status: "loading",
    cargo_manifest: JSON.stringify([
      { id: "1", description: "AN/PRC-152A Radio Set", quantity: 200, weight_lbs: 2400, nsn: "5820-01-505-7917" },
      { id: "2", description: "AN/PVS-14 Night Vision Device", quantity: 300, weight_lbs: 360, nsn: "5855-01-534-0933" },
    ]),
  },
  {
    user_id: DEMO_USER_ID,
    container_number: "MSCU5823947",
    container_type: "40FR",
    seal_number: "DOD-789237",
    weight_lbs: 62000,
    tare_weight_lbs: 11200,
    status: "loaded",
    cargo_manifest: JSON.stringify([
      { id: "1", description: "HMMWV M1151A1 Parts Kit", quantity: 12, weight_lbs: 18000, nsn: "2320-01-412-0142" },
      { id: "2", description: "Bradley Transmission Assembly", quantity: 4, weight_lbs: 16000, nsn: "2520-01-534-0934" },
    ]),
  },
  {
    user_id: DEMO_USER_ID,
    container_number: "MSCU6934812",
    container_type: "40HC",
    seal_number: "DOD-789238",
    weight_lbs: 48000,
    tare_weight_lbs: 8500,
    status: "loaded",
    cargo_manifest: JSON.stringify([
      { id: "1", description: "JP-8 Fuel Bladder 500gal", quantity: 20, weight_lbs: 7000, nsn: "9130-01-452-8893" },
      { id: "2", description: "Generator MEP-805A 30kW", quantity: 6, weight_lbs: 18000, nsn: "6115-01-392-4484" },
    ]),
  },
];

export async function seedLandDemoData() {
  console.log("[Demo Seed] Starting Land logistics demo data...");
  
  const vehicleTypes = await db.select().from(landVehicleTypes);
  if (vehicleTypes.length === 0) {
    console.log("[Demo Seed] No vehicle types found. Run vehicle seeds first.");
    return;
  }
  
  const vehicleTypeMap: Record<string, number> = {};
  for (const vt of vehicleTypes) {
    vehicleTypeMap[vt.code] = vt.id;
  }
  
  for (const route of landRouteDemoData) {
    const existing = await db.select().from(landRoutes).where(eq(landRoutes.name, route.name));
    if (existing.length === 0) {
      await db.insert(landRoutes).values(route);
      console.log(`[Demo Seed] Created route: ${route.name}`);
    }
  }
  
  const routes = await db.select().from(landRoutes).where(eq(landRoutes.user_id, DEMO_USER_ID));
  const routeMap: Record<string, number> = {};
  for (const r of routes) {
    routeMap[r.name] = r.id;
  }
  
  for (const convoy of landConvoyDemoData) {
    const existing = await db.select().from(landConvoys).where(eq(landConvoys.name, convoy.name));
    if (existing.length === 0) {
      const matchingRoute = routes.find(r => 
        r.origin_name?.includes(convoy.origin.split(',')[0]) || 
        convoy.origin.includes(r.origin_name?.split(',')[0] || '')
      );
      
      const [inserted] = await db.insert(landConvoys).values({
        ...convoy,
        route_id: matchingRoute?.id || null,
      }).returning();
      
      console.log(`[Demo Seed] Created convoy: ${convoy.name}`);
      
      const vehicleAssignments = [
        { code: "HEMTT_CARGO", count: Math.min(3, Math.floor(convoy.vehicle_count / 3)) },
        { code: "LMTV", count: Math.min(4, Math.floor(convoy.vehicle_count / 2)) },
        { code: "FMTV_5T", count: convoy.vehicle_count - Math.min(3, Math.floor(convoy.vehicle_count / 3)) - Math.min(4, Math.floor(convoy.vehicle_count / 2)) },
      ];
      
      let position = 1;
      for (const assignment of vehicleAssignments) {
        const typeId = vehicleTypeMap[assignment.code];
        if (!typeId) continue;
        
        for (let i = 0; i < assignment.count && position <= convoy.vehicle_count; i++) {
          await db.insert(landConvoyVehicles).values({
            convoy_id: inserted.id,
            vehicle_type_id: typeId,
            position_in_convoy: position,
            callsign: `${convoy.name.split(' ')[0].toUpperCase()}-${position.toString().padStart(2, '0')}`,
            current_weight_lbs: Math.floor(convoy.total_cargo_weight_lbs / convoy.vehicle_count),
            status: convoy.status === "underway" ? "in_transit" : "ready",
          });
          position++;
        }
      }
      console.log(`[Demo Seed] Added ${position - 1} vehicles to convoy`);
    }
  }
  
  console.log("[Demo Seed] Land logistics demo data complete!");
}

export async function seedSeaDemoData() {
  console.log("[Demo Seed] Starting Sea freight demo data...");
  
  for (const voyage of seaVoyageDemoData) {
    const existing = await db.select().from(seaVoyages).where(eq(seaVoyages.name, voyage.name));
    if (existing.length === 0) {
      await db.insert(seaVoyages).values(voyage);
      console.log(`[Demo Seed] Created voyage: ${voyage.name}`);
    }
  }
  
  const voyages = await db.select().from(seaVoyages).where(eq(seaVoyages.user_id, DEMO_USER_ID));
  
  let containerIndex = 0;
  for (const voyage of voyages) {
    if (containerIndex >= seaContainerDemoData.length) break;
    
    const existingContainers = await db.select().from(seaContainers).where(eq(seaContainers.voyage_id, voyage.id));
    
    if (existingContainers.length === 0) {
      const containersForVoyage = seaContainerDemoData.slice(containerIndex, containerIndex + 2);
      for (const container of containersForVoyage) {
        await db.insert(seaContainers).values({
          ...container,
          voyage_id: voyage.id,
        });
        console.log(`[Demo Seed] Added container ${container.container_number} to voyage ${voyage.name}`);
      }
      containerIndex += 2;
    }
  }
  
  console.log("[Demo Seed] Sea freight demo data complete!");
}

export async function seedAllDemoData() {
  await seedLandDemoData();
  await seedSeaDemoData();
  console.log("[Demo Seed] All demo data seeded successfully!");
}

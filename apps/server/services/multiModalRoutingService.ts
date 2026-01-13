import { db } from "../db";
import { warehouseSites, landConvoys, landConvoyVehicles, flightPlans, seaVoyages, crossModalManifests, warehouseTransfers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { calculateVehicleAllocation } from "./vehicleAllocationService";

export type TransportMode = "ground" | "air" | "sea";

export interface TransportLeg {
  legNumber: number;
  mode: TransportMode;
  origin: {
    name: string;
    lat: number;
    lng: number;
    type: "warehouse" | "airport" | "seaport";
  };
  destination: {
    name: string;
    lat: number;
    lng: number;
    type: "warehouse" | "airport" | "seaport";
  };
  distanceMiles?: number;
  estimatedHours?: number;
  vehicleCount?: number;
  assetId?: number;
  assetType?: "convoy" | "flight_plan" | "voyage";
}

export interface MultiModalRoute {
  feasible: boolean;
  requiresMultiModal: boolean;
  reason?: string;
  legs: TransportLeg[];
  totalDistanceMiles: number;
  totalEstimatedHours: number;
  suggestedMode: TransportMode;
}

const MILITARY_AIRPORTS: Array<{
  name: string;
  code: string;
  lat: number;
  lng: number;
  region: string;
}> = [
  { name: "Travis AFB", code: "SUU", lat: 38.2626, lng: -121.9275, region: "california" },
  { name: "March ARB", code: "RIV", lat: 33.8803, lng: -117.2594, region: "california" },
  { name: "Edwards AFB", code: "EDW", lat: 34.9054, lng: -117.8836, region: "california" },
  { name: "Hickam AFB", code: "HIK", lat: 21.3187, lng: -157.9225, region: "hawaii" },
  { name: "Joint Base Pearl Harbor-Hickam", code: "JRF", lat: 21.3469, lng: -157.9397, region: "hawaii" },
  { name: "McChord AFB", code: "TCM", lat: 47.1377, lng: -122.4765, region: "washington" },
  { name: "Norfolk NAS", code: "NGU", lat: 36.9376, lng: -76.2893, region: "virginia" },
  { name: "San Diego NAS North Island", code: "NZY", lat: 32.6992, lng: -117.2151, region: "california" },
  { name: "Andersen AFB", code: "UAM", lat: 13.5840, lng: 144.9248, region: "guam" },
  { name: "Kadena AB", code: "DNA", lat: 26.3516, lng: 127.7695, region: "okinawa" },
];

const MILITARY_SEAPORTS: Array<{
  name: string;
  code: string;
  lat: number;
  lng: number;
  region: string;
}> = [
  { name: "Naval Base San Diego", code: "NBSD", lat: 32.6839, lng: -117.1294, region: "california" },
  { name: "Port of Long Beach", code: "LGB", lat: 33.7546, lng: -118.2166, region: "california" },
  { name: "Port of Oakland", code: "OAK", lat: 37.7952, lng: -122.2788, region: "california" },
  { name: "Pearl Harbor Naval Base", code: "PHNS", lat: 21.3500, lng: -157.9500, region: "hawaii" },
  { name: "Naval Station Norfolk", code: "NSN", lat: 36.9465, lng: -76.3142, region: "virginia" },
  { name: "Naval Base Guam", code: "NGM", lat: 13.4443, lng: 144.7935, region: "guam" },
  { name: "White Beach Naval Facility", code: "WBN", lat: 26.2989, lng: 127.8989, region: "okinawa" },
  { name: "Puget Sound Naval Shipyard", code: "PSNS", lat: 47.5615, lng: -122.6402, region: "washington" },
];

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestFacility(
  lat: number,
  lng: number,
  facilities: Array<{ name: string; code: string; lat: number; lng: number; region: string }>,
  maxDistanceMiles: number = 500
): { facility: typeof facilities[0]; distanceMiles: number } | null {
  let nearest: { facility: typeof facilities[0]; distanceMiles: number } | null = null;

  for (const facility of facilities) {
    const distance = haversineDistance(lat, lng, facility.lat, facility.lng);
    if (distance <= maxDistanceMiles) {
      if (!nearest || distance < nearest.distanceMiles) {
        nearest = { facility, distanceMiles: distance };
      }
    }
  }

  return nearest;
}

async function checkGroundRouteViability(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ viable: boolean; distanceMiles?: number; durationHours?: number; reason?: string }> {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  
  if (!googleApiKey) {
    const directDistance = haversineDistance(originLat, originLng, destLat, destLng);
    if (directDistance > 500) {
      return { viable: false, reason: "Distance too far for ground transport without route verification" };
    }
    return { viable: true, distanceMiles: directDistance * 1.3, durationHours: (directDistance * 1.3) / 50 };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving&avoid=ferries&key=${googleApiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "ZERO_RESULTS" || data.status === "NOT_FOUND") {
      return { viable: false, reason: "No driving route available - likely ocean crossing or no road connection" };
    }

    if (data.status !== "OK" || !data.routes?.[0]) {
      return { viable: false, reason: `Google Maps API error: ${data.status}` };
    }

    const route = data.routes[0];
    const leg = route.legs[0];
    
    const hasFerry = route.legs.some((l: any) => 
      l.steps?.some((step: any) => 
        step.travel_mode === "FERRY" || 
        step.html_instructions?.toLowerCase().includes("ferry")
      )
    );

    if (hasFerry) {
      return { viable: false, reason: "Route requires ferry crossing - suggesting air or sea transport" };
    }

    const distanceMeters = leg.distance?.value || 0;
    const durationSeconds = leg.duration?.value || 0;
    
    return {
      viable: true,
      distanceMiles: distanceMeters / 1609.34,
      durationHours: durationSeconds / 3600,
    };
  } catch (error) {
    console.error("[MultiModal] Google Maps API error:", error);
    const directDistance = haversineDistance(originLat, originLng, destLat, destLng);
    if (directDistance > 300) {
      return { viable: false, reason: "Unable to verify route and distance suggests ocean crossing" };
    }
    return { viable: true, distanceMiles: directDistance * 1.3, durationHours: (directDistance * 1.3) / 50 };
  }
}

function determinePreferredCrossingMode(distanceMiles: number, cargoWeightLbs: number): TransportMode {
  if (distanceMiles > 2000) {
    return "air";
  }
  if (cargoWeightLbs > 100000) {
    return "sea";
  }
  if (distanceMiles < 1000) {
    return "air";
  }
  return cargoWeightLbs > 50000 ? "sea" : "air";
}

export async function planMultiModalRoute(
  sourceSiteId: number,
  destinationSiteId: number,
  cargoWeightLbs: number
): Promise<MultiModalRoute> {
  const [sourceSite] = await db.select().from(warehouseSites).where(eq(warehouseSites.id, sourceSiteId));
  const [destSite] = await db.select().from(warehouseSites).where(eq(warehouseSites.id, destinationSiteId));

  if (!sourceSite || !destSite) {
    return {
      feasible: false,
      requiresMultiModal: false,
      reason: "Source or destination site not found",
      legs: [],
      totalDistanceMiles: 0,
      totalEstimatedHours: 0,
      suggestedMode: "ground",
    };
  }

  const sourceLat = parseFloat(String(sourceSite.latitude)) || 0;
  const sourceLng = parseFloat(String(sourceSite.longitude)) || 0;
  const destLat = parseFloat(String(destSite.latitude)) || 0;
  const destLng = parseFloat(String(destSite.longitude)) || 0;

  if (!sourceLat || !sourceLng || !destLat || !destLng) {
    return {
      feasible: false,
      requiresMultiModal: false,
      reason: "Missing coordinates for source or destination site",
      legs: [],
      totalDistanceMiles: 0,
      totalEstimatedHours: 0,
      suggestedMode: "ground",
    };
  }

  const groundCheck = await checkGroundRouteViability(sourceLat, sourceLng, destLat, destLng);

  if (groundCheck.viable) {
    const allocations = await calculateVehicleAllocation(cargoWeightLbs);
    const vehicleCount = allocations.reduce((sum, a) => sum + a.vehicleCount, 0);

    return {
      feasible: true,
      requiresMultiModal: false,
      legs: [{
        legNumber: 1,
        mode: "ground",
        origin: {
          name: sourceSite.name,
          lat: sourceLat,
          lng: sourceLng,
          type: "warehouse",
        },
        destination: {
          name: destSite.name,
          lat: destLat,
          lng: destLng,
          type: "warehouse",
        },
        distanceMiles: groundCheck.distanceMiles,
        estimatedHours: groundCheck.durationHours,
        vehicleCount,
      }],
      totalDistanceMiles: groundCheck.distanceMiles || 0,
      totalEstimatedHours: groundCheck.durationHours || 0,
      suggestedMode: "ground",
    };
  }

  console.log(`[MultiModal] Ground route not viable: ${groundCheck.reason}`);

  const directDistance = haversineDistance(sourceLat, sourceLng, destLat, destLng);
  const crossingMode = determinePreferredCrossingMode(directDistance, cargoWeightLbs);

  const legs: TransportLeg[] = [];
  let totalDistance = 0;
  let totalHours = 0;

  if (crossingMode === "air") {
    const nearestOriginAirport = findNearestFacility(sourceLat, sourceLng, MILITARY_AIRPORTS);
    const nearestDestAirport = findNearestFacility(destLat, destLng, MILITARY_AIRPORTS);

    if (!nearestOriginAirport || !nearestDestAirport) {
      return {
        feasible: false,
        requiresMultiModal: true,
        reason: "No suitable military airports found near origin or destination",
        legs: [],
        totalDistanceMiles: directDistance,
        totalEstimatedHours: 0,
        suggestedMode: "sea",
      };
    }

    if (nearestOriginAirport.distanceMiles > 5) {
      const groundAllocations = await calculateVehicleAllocation(cargoWeightLbs);
      legs.push({
        legNumber: 1,
        mode: "ground",
        origin: {
          name: sourceSite.name,
          lat: sourceLat,
          lng: sourceLng,
          type: "warehouse",
        },
        destination: {
          name: nearestOriginAirport.facility.name,
          lat: nearestOriginAirport.facility.lat,
          lng: nearestOriginAirport.facility.lng,
          type: "airport",
        },
        distanceMiles: nearestOriginAirport.distanceMiles,
        estimatedHours: nearestOriginAirport.distanceMiles / 45,
        vehicleCount: groundAllocations.reduce((sum, a) => sum + a.vehicleCount, 0),
      });
      totalDistance += nearestOriginAirport.distanceMiles;
      totalHours += nearestOriginAirport.distanceMiles / 45;
    }

    const flightDistance = haversineDistance(
      nearestOriginAirport.facility.lat,
      nearestOriginAirport.facility.lng,
      nearestDestAirport.facility.lat,
      nearestDestAirport.facility.lng
    );
    const flightHours = flightDistance / 500;

    legs.push({
      legNumber: legs.length + 1,
      mode: "air",
      origin: {
        name: nearestOriginAirport.facility.name,
        lat: nearestOriginAirport.facility.lat,
        lng: nearestOriginAirport.facility.lng,
        type: "airport",
      },
      destination: {
        name: nearestDestAirport.facility.name,
        lat: nearestDestAirport.facility.lat,
        lng: nearestDestAirport.facility.lng,
        type: "airport",
      },
      distanceMiles: flightDistance,
      estimatedHours: flightHours,
    });
    totalDistance += flightDistance;
    totalHours += flightHours;

    if (nearestDestAirport.distanceMiles > 5) {
      const groundAllocations = await calculateVehicleAllocation(cargoWeightLbs);
      legs.push({
        legNumber: legs.length + 1,
        mode: "ground",
        origin: {
          name: nearestDestAirport.facility.name,
          lat: nearestDestAirport.facility.lat,
          lng: nearestDestAirport.facility.lng,
          type: "airport",
        },
        destination: {
          name: destSite.name,
          lat: destLat,
          lng: destLng,
          type: "warehouse",
        },
        distanceMiles: nearestDestAirport.distanceMiles,
        estimatedHours: nearestDestAirport.distanceMiles / 45,
        vehicleCount: groundAllocations.reduce((sum, a) => sum + a.vehicleCount, 0),
      });
      totalDistance += nearestDestAirport.distanceMiles;
      totalHours += nearestDestAirport.distanceMiles / 45;
    }
  } else {
    const nearestOriginPort = findNearestFacility(sourceLat, sourceLng, MILITARY_SEAPORTS);
    const nearestDestPort = findNearestFacility(destLat, destLng, MILITARY_SEAPORTS);

    if (!nearestOriginPort || !nearestDestPort) {
      return {
        feasible: false,
        requiresMultiModal: true,
        reason: "No suitable seaports found near origin or destination",
        legs: [],
        totalDistanceMiles: directDistance,
        totalEstimatedHours: 0,
        suggestedMode: "air",
      };
    }

    if (nearestOriginPort.distanceMiles > 5) {
      const groundAllocations = await calculateVehicleAllocation(cargoWeightLbs);
      legs.push({
        legNumber: 1,
        mode: "ground",
        origin: {
          name: sourceSite.name,
          lat: sourceLat,
          lng: sourceLng,
          type: "warehouse",
        },
        destination: {
          name: nearestOriginPort.facility.name,
          lat: nearestOriginPort.facility.lat,
          lng: nearestOriginPort.facility.lng,
          type: "seaport",
        },
        distanceMiles: nearestOriginPort.distanceMiles,
        estimatedHours: nearestOriginPort.distanceMiles / 45,
        vehicleCount: groundAllocations.reduce((sum, a) => sum + a.vehicleCount, 0),
      });
      totalDistance += nearestOriginPort.distanceMiles;
      totalHours += nearestOriginPort.distanceMiles / 45;
    }

    const voyageDistance = haversineDistance(
      nearestOriginPort.facility.lat,
      nearestOriginPort.facility.lng,
      nearestDestPort.facility.lat,
      nearestDestPort.facility.lng
    );
    const voyageHours = voyageDistance / 20;

    legs.push({
      legNumber: legs.length + 1,
      mode: "sea",
      origin: {
        name: nearestOriginPort.facility.name,
        lat: nearestOriginPort.facility.lat,
        lng: nearestOriginPort.facility.lng,
        type: "seaport",
      },
      destination: {
        name: nearestDestPort.facility.name,
        lat: nearestDestPort.facility.lat,
        lng: nearestDestPort.facility.lng,
        type: "seaport",
      },
      distanceMiles: voyageDistance,
      estimatedHours: voyageHours,
    });
    totalDistance += voyageDistance;
    totalHours += voyageHours;

    if (nearestDestPort.distanceMiles > 5) {
      const groundAllocations = await calculateVehicleAllocation(cargoWeightLbs);
      legs.push({
        legNumber: legs.length + 1,
        mode: "ground",
        origin: {
          name: nearestDestPort.facility.name,
          lat: nearestDestPort.facility.lat,
          lng: nearestDestPort.facility.lng,
          type: "seaport",
        },
        destination: {
          name: destSite.name,
          lat: destLat,
          lng: destLng,
          type: "warehouse",
        },
        distanceMiles: nearestDestPort.distanceMiles,
        estimatedHours: nearestDestPort.distanceMiles / 45,
        vehicleCount: groundAllocations.reduce((sum, a) => sum + a.vehicleCount, 0),
      });
      totalDistance += nearestDestPort.distanceMiles;
      totalHours += nearestDestPort.distanceMiles / 45;
    }
  }

  return {
    feasible: true,
    requiresMultiModal: true,
    reason: groundCheck.reason,
    legs,
    totalDistanceMiles: Math.round(totalDistance),
    totalEstimatedHours: Math.round(totalHours * 10) / 10,
    suggestedMode: crossingMode,
  };
}

export async function createTransportAssetsForRoute(
  route: MultiModalRoute,
  transferId: number,
  userId: number,
  cargoWeightLbs: number,
  cargoManifest: any[]
): Promise<{ success: boolean; assets: Array<{ legNumber: number; type: string; id: number }> }> {
  const assets: Array<{ legNumber: number; type: string; id: number }> = [];

  for (const leg of route.legs) {
    try {
      if (leg.mode === "ground") {
        const [convoy] = await db.insert(landConvoys)
          .values({
            user_id: userId,
            name: `Transfer-${transferId}-Leg${leg.legNumber}`,
            origin: leg.origin.name,
            destination: leg.destination.name,
            status: "planned",
            vehicle_count: leg.vehicleCount || 1,
            total_cargo_weight_lbs: cargoWeightLbs,
            cargo_manifest: cargoManifest,
          })
          .returning();

        const allocations = await calculateVehicleAllocation(cargoWeightLbs);
        let position = 1;
        for (const alloc of allocations) {
          for (let i = 0; i < alloc.vehicleCount; i++) {
            await db.insert(landConvoyVehicles).values({
              convoy_id: convoy.id,
              vehicle_type_id: alloc.vehicleTypeId,
              position_in_convoy: position++,
              callsign: `${alloc.vehicleCode}-${i + 1}`,
              status: "ready",
            });
          }
        }

        assets.push({ legNumber: leg.legNumber, type: "convoy", id: convoy.id });
      } else if (leg.mode === "air") {
        const [flightPlan] = await db.insert(flightPlans)
          .values({
            user_id: userId,
            name: `Transfer-${transferId}-Flight-Leg${leg.legNumber}`,
            departure_base: leg.origin.name,
            arrival_base: leg.destination.name,
            status: "planned",
            aircraft_type: cargoWeightLbs > 50000 ? "C-17" : "C-130J",
            cargo_weight_lbs: cargoWeightLbs,
          })
          .returning();

        assets.push({ legNumber: leg.legNumber, type: "flight_plan", id: flightPlan.id });
      } else if (leg.mode === "sea") {
        const [voyage] = await db.insert(seaVoyages)
          .values({
            user_id: userId,
            name: `Transfer-${transferId}-Voyage-Leg${leg.legNumber}`,
            origin_port: leg.origin.name,
            destination_port: leg.destination.name,
            status: "planned",
            cargo_weight_lbs: cargoWeightLbs,
          })
          .returning();

        assets.push({ legNumber: leg.legNumber, type: "voyage", id: voyage.id });
      }
    } catch (error) {
      console.error(`[MultiModal] Failed to create asset for leg ${leg.legNumber}:`, error);
    }
  }

  return { success: assets.length === route.legs.length, assets };
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  generalRateLimiter,
  authRateLimiter,
  aiRateLimiter
} from "./middleware";
import { 
  registerAuthRoutes,
  registerAdminRoutes, 
  registerUtilityRoutes, 
  registerAirRoutes, 
  registerLandRoutes, 
  registerSeaRoutes, 
  registerDagRoutes, 
  registerInsightsRoutes, 
  registerTransportRoutes, 
  registerWarehouseRoutes,
  registerAircraftRoutes,
  registerOperationsRoutes
} from "./routes/index";


export async function registerRoutes(app: Express): Promise<Server> {
  // Apply general rate limiting to all API routes
  app.use("/api", generalRateLimiter);
  
  // Apply stricter rate limiting to auth endpoints
  app.use("/api/auth", authRateLimiter);
  
  // Apply stricter rate limiting to AI/insights endpoints (expensive Bedrock operations)
  app.use("/api/insights", aiRateLimiter);
  app.use("/api/warehouse/:siteId/ai-insights", aiRateLimiter);
  
  // Register auth routes (login, register, logout, me)
  registerAuthRoutes(app);
  
  // Register admin routes (organizations, access codes, admin user management)
  registerAdminRoutes(app);
  
  // Register utility routes (weather, airbases - public routes)
  registerUtilityRoutes(app);
  
  // Register air operations routes (flight plans, schedules, nodes, edges, etc.)
  registerAirRoutes(app);
  
  // Register land logistics routes (convoys, routes, vehicles, etc.)
  registerLandRoutes(app);
  
  // Register sea freight routes (voyages, containers, vessels, etc.)
  registerSeaRoutes(app);
  
  // Register DAG routes (nodes, edges, cargo, assignments)
  registerDagRoutes(app);
  
  // Register insights routes (manifests, AI insights)
  registerInsightsRoutes(app);
  
  // Register transport routes (unified transport API, manifests, routing, etc.)
  registerTransportRoutes(app);
  
  // Register warehouse routes (sites, inventory, zones, optimization, analytics)
  registerWarehouseRoutes(app);
  
  // Register aircraft fleet management routes (types, capacity, availability, optimization)
  registerAircraftRoutes(app);
  
  // Register operations hub routes (summary, predictive forecast)
  registerOperationsRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

import type { Express } from "express";
import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import utilityRoutes from "./utility.routes";
import airRoutes from "./air.routes";
import landRoutes from "./land.routes";
import seaRoutes from "./sea.routes";
import dagRoutes from "./dag.routes";
import insightsRoutes from "./insights.routes";
import transportRoutes from "./transport.routes";
import warehouseRoutes from "./warehouse.routes";
import aircraftRoutes from "./aircraft.routes";
import operationsRoutes from "./operations.routes";

export function registerAuthRoutes(app: Express): void {
  app.use("/api/auth", authRoutes);
}

export function registerAdminRoutes(app: Express): void {
  app.use("/api", adminRoutes);
}

export function registerUtilityRoutes(app: Express): void {
  app.use("/api", utilityRoutes);
}

export function registerAirRoutes(app: Express): void {
  app.use("/api", airRoutes);
}

export function registerLandRoutes(app: Express): void {
  app.use("/api", landRoutes);
}

export function registerSeaRoutes(app: Express): void {
  app.use("/api", seaRoutes);
}

export function registerDagRoutes(app: Express): void {
  app.use("/api", dagRoutes);
}

export function registerInsightsRoutes(app: Express): void {
  app.use("/api", insightsRoutes);
}

export function registerTransportRoutes(app: Express): void {
  app.use("/api", transportRoutes);
}

export function registerWarehouseRoutes(app: Express): void {
  app.use("/api", warehouseRoutes);
}

export function registerAircraftRoutes(app: Express): void {
  app.use("/api", aircraftRoutes);
}

export function registerOperationsRoutes(app: Express): void {
  app.use("/api", operationsRoutes);
}

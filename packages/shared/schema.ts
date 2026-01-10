import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uuid, numeric, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// MILITARY ORGANIZATIONS
// ============================================================================

// Role enum for users
export const userRoleEnum = ['superadmin', 'admin', 'user'] as const;
export type UserRole = typeof userRoleEnum[number];

// Organization names
export const organizationNameEnum = ['PACAF', 'DLA', 'MSC', 'TRANSCOM'] as const;
export type OrganizationName = typeof organizationNameEnum[number];

// Organizations table (PACAF, DLA, MSC, TRANSCOM)
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // PACAF, DLA, MSC, TRANSCOM
  description: text("description"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

// ============================================================================
// MILITARY INSTALLATIONS
// ============================================================================

// Installation type enum
export const installationTypeEnum = ['air_base', 'army_base', 'navy_base', 'marine_base', 'joint_base', 'depot', 'warehouse', 'port', 'arsenal', 'station'] as const;
export type InstallationType = typeof installationTypeEnum[number];

// Branch enum
export const militaryBranchEnum = ['air_force', 'army', 'navy', 'marines', 'space_force', 'coast_guard', 'dla', 'joint'] as const;
export type MilitaryBranch = typeof militaryBranchEnum[number];

// Military Installations table
export const militaryInstallations = pgTable("military_installations", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(), // Short code like "JBLM", "TRAVIS"
  name: text("name").notNull(), // Full name
  type: text("type").notNull(), // air_base, army_base, navy_base, depot, warehouse, port
  branch: text("branch").notNull(), // air_force, army, navy, marines, dla, joint
  city: text("city").notNull(),
  state: text("state"), // For US locations
  country: text("country").notNull().default('USA'),
  region: text("region"), // CONUS, OCONUS, Pacific, Europe, etc.
  latitude: numeric("latitude", { precision: 10, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 6 }).notNull(),
  address: text("address"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertMilitaryInstallationSchema = createInsertSchema(militaryInstallations).omit({
  id: true,
  created_at: true,
});

export type InsertMilitaryInstallation = z.infer<typeof insertMilitaryInstallationSchema>;
export type MilitaryInstallation = typeof militaryInstallations.$inferSelect;

// ============================================================================
// USERS & AUTHENTICATION
// ============================================================================

// Users table with email-based authentication and organization/role
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull(),
  password: text("password").notNull(), // bcrypt hashed password
  first_name: text("first_name"),
  last_name: text("last_name"),
  organization_id: integer("organization_id"), // FK to organizations (null for superadmin)
  role: text("role").notNull().default('user'), // 'superadmin', 'admin', 'user'
  is_active: boolean("is_active").notNull().default(false), // Pending approval by default
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  last_login_at: timestamp("last_login_at"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  username: true,
  password: true,
  first_name: true,
  last_name: true,
  organization_id: true,
  role: true,
  is_active: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Access codes for signup (Department Access Codes - DAC)
export const accessCodes = pgTable("access_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  organization_id: integer("organization_id").notNull(), // FK to organizations
  created_by_user_id: integer("created_by_user_id").notNull(), // Admin who created it
  expires_at: timestamp("expires_at").notNull(),
  is_used: boolean("is_used").notNull().default(false),
  used_by_user_id: integer("used_by_user_id"), // User who used the code
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertAccessCodeSchema = createInsertSchema(accessCodes).omit({
  id: true,
  created_at: true,
  is_used: true,
  used_by_user_id: true,
});

export type InsertAccessCode = z.infer<typeof insertAccessCodeSchema>;
export type AccessCode = typeof accessCodes.$inferSelect;

// Session validation schema for login
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Signup schema with access code
export const signupWithCodeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(2),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  access_code: z.string().min(6),
});

export type SignupWithCodeInput = z.infer<typeof signupWithCodeSchema>;

// Flight plan status enum
export const flightPlanStatusEnum = ['draft', 'complete', 'archived'] as const;
export type FlightPlanStatus = typeof flightPlanStatusEnum[number];

// Flight Plans - stores complete allocation results
export const flightPlans = pgTable("flight_plans", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default('draft'), // 'draft', 'complete', 'archived'
  scheduled_departure: timestamp("scheduled_departure"),
  scheduled_arrival: timestamp("scheduled_arrival"),
  actual_departure: timestamp("actual_departure"),
  actual_arrival: timestamp("actual_arrival"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  allocation_data: jsonb("allocation_data").notNull(), // AllocationResult JSON
  movement_data: jsonb("movement_data"), // Original parsed movement items
  movement_items_count: integer("movement_items_count").notNull(),
  total_weight_lb: integer("total_weight_lb").notNull(),
  aircraft_count: integer("aircraft_count").notNull(),
  preferred_aircraft_type_id: text("preferred_aircraft_type_id"), // nullable FK to aircraftTypes
  allow_mixed_fleet: boolean("allow_mixed_fleet").notNull().default(true),
  mixed_fleet_mode: text("mixed_fleet_mode").notNull().default("PREFERRED_FIRST"),
  preference_strength: numeric("preference_strength", { precision: 3, scale: 2 }).notNull().default("0.5"),
});

export const insertFlightPlanSchema = createInsertSchema(flightPlans).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertFlightPlan = z.infer<typeof insertFlightPlanSchema>;
export type FlightPlan = typeof flightPlans.$inferSelect;

// Flight Schedules - stores scheduled flights with timing
export const flightSchedules = pgTable("flight_schedules", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  flight_plan_id: integer("flight_plan_id"),
  name: text("name").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  schedule_data: jsonb("schedule_data").notNull(), // ScheduledFlight[] JSON
  total_flights: integer("total_flights").notNull(),
});

export const insertFlightScheduleSchema = createInsertSchema(flightSchedules).omit({
  id: true,
  created_at: true,
});

export type InsertFlightSchedule = z.infer<typeof insertFlightScheduleSchema>;
export type FlightSchedule = typeof flightSchedules.$inferSelect;

// Split Sessions - stores split flight configurations
export const splitSessions = pgTable("split_sessions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  flight_plan_id: integer("flight_plan_id"),
  name: text("name").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  split_data: jsonb("split_data").notNull(), // SplitFlight[] JSON
  total_splits: integer("total_splits").notNull(),
  total_pallets: integer("total_pallets").notNull(),
});

export const insertSplitSessionSchema = createInsertSchema(splitSessions).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertSplitSession = z.infer<typeof insertSplitSessionSchema>;
export type SplitSession = typeof splitSessions.$inferSelect;

// Sessions for authentication
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  created_at: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Flight Nodes - stores nodes in the flowchart tree (airbases or flights)
export const flightNodeTypeEnum = ['airbase', 'flight'] as const;
export type FlightNodeType = typeof flightNodeTypeEnum[number];

export const flightNodes = pgTable("flight_nodes", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  flight_plan_id: integer("flight_plan_id").notNull(),
  node_type: text("node_type").notNull(), // 'airbase' or 'flight'
  parent_node_id: integer("parent_node_id"), // null for root nodes
  position_x: integer("position_x").notNull().default(0),
  position_y: integer("position_y").notNull().default(0),
  node_data: jsonb("node_data").notNull(), // FlightNodeData or AirbaseNodeData
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertFlightNodeSchema = createInsertSchema(flightNodes).omit({
  id: true,
  created_at: true,
});

export type InsertFlightNode = z.infer<typeof insertFlightNodeSchema>;
export type FlightNode = typeof flightNodes.$inferSelect;

// Flight Edges - stores connections between nodes
export const flightEdges = pgTable("flight_edges", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  flight_plan_id: integer("flight_plan_id").notNull(),
  source_node_id: integer("source_node_id").notNull(),
  target_node_id: integer("target_node_id").notNull(),
  edge_data: jsonb("edge_data").notNull(), // RouteEdgeData
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertFlightEdgeSchema = createInsertSchema(flightEdges).omit({
  id: true,
  created_at: true,
});

export type InsertFlightEdge = z.infer<typeof insertFlightEdgeSchema>;
export type FlightEdge = typeof flightEdges.$inferSelect;

// Port Inventory - tracks cargo at each port (airbase)
export const portInventory = pgTable("port_inventory", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  flight_plan_id: integer("flight_plan_id").notNull(),
  airbase_id: text("airbase_id").notNull(), // ICAO code
  incoming_cargo: jsonb("incoming_cargo").notNull().default([]), // cargo arriving via flights
  outgoing_cargo: jsonb("outgoing_cargo").notNull().default([]), // cargo departing via flights
  available_cargo: jsonb("available_cargo").notNull().default([]), // cargo available for pickup
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPortInventorySchema = createInsertSchema(portInventory).omit({
  id: true,
  updated_at: true,
});

export type InsertPortInventory = z.infer<typeof insertPortInventorySchema>;
export type PortInventory = typeof portInventory.$inferSelect;

// ============================================================================
// DAG SYSTEM TABLES (NEW)
// ============================================================================

// DAG Node Types
export const dagNodeTypeEnum = ['airbase', 'flight'] as const;
export type DagNodeType = typeof dagNodeTypeEnum[number];

// DAG Nodes - stores nodes in the directed acyclic graph (airbases or flights)
export const dagNodes = pgTable("dag_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: integer("user_id").notNull(),
  node_type: text("node_type").notNull(), // 'airbase' or 'flight'
  name: text("name").notNull(),
  icao: text("icao"), // ICAO code for airbases
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  position_x: integer("position_x").notNull().default(0),
  position_y: integer("position_y").notNull().default(0),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDagNodeSchema = createInsertSchema(dagNodes).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertDagNode = z.infer<typeof insertDagNodeSchema>;
export type DagNode = typeof dagNodes.$inferSelect;

// DAG Edges - stores directed connections between nodes
export const dagEdges = pgTable("dag_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: integer("user_id").notNull(),
  parent_id: uuid("parent_id").notNull(), // references dagNodes.id
  child_id: uuid("child_id").notNull(), // references dagNodes.id
  cargo_shared: boolean("cargo_shared").notNull().default(false),
  edge_data: jsonb("edge_data").notNull().default({}), // distance_nm, fuel_lb, time_en_route, etc.
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertDagEdgeSchema = createInsertSchema(dagEdges).omit({
  id: true,
  created_at: true,
});

export type InsertDagEdge = z.infer<typeof insertDagEdgeSchema>;
export type DagEdge = typeof dagEdges.$inferSelect;

// Cargo Items - individual cargo pieces with TCN
export const cargoItems = pgTable("cargo_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: integer("user_id").notNull(),
  tcn: text("tcn").notNull(), // Transportation Control Number
  description: text("description"),
  weight_lb: numeric("weight_lb", { precision: 12, scale: 2 }),
  length_in: numeric("length_in", { precision: 8, scale: 2 }),
  width_in: numeric("width_in", { precision: 8, scale: 2 }),
  height_in: numeric("height_in", { precision: 8, scale: 2 }),
  cargo_type: text("cargo_type"), // 'palletized', 'rolling_stock', 'bulk', 'hazmat', 'oversized'
  is_hazmat: boolean("is_hazmat").notNull().default(false),
  hazmat_class: text("hazmat_class"),
  priority: text("priority"), // 'ADVON', 'MAIN', 'ROUTINE'
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertCargoItemSchema = createInsertSchema(cargoItems).omit({
  id: true,
  created_at: true,
});

export type InsertCargoItem = z.infer<typeof insertCargoItemSchema>;
export type CargoItem = typeof cargoItems.$inferSelect;

// Cargo Assignment Status
export const cargoAssignmentStatusEnum = ['assigned', 'in_transit', 'delivered', 'pending'] as const;
export type CargoAssignmentStatus = typeof cargoAssignmentStatusEnum[number];

// Cargo Assignments - links cargo items to nodes with status tracking
export const cargoAssignments = pgTable("cargo_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: integer("user_id").notNull(),
  cargo_id: uuid("cargo_id").notNull(), // references cargoItems.id
  node_id: uuid("node_id").notNull(), // references dagNodes.id
  status: text("status").notNull().default('assigned'), // 'assigned', 'in_transit', 'delivered', 'pending'
  sequence: integer("sequence").notNull().default(0), // order in the cargo chain
  pallet_position: integer("pallet_position"), // position on aircraft if loaded
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCargoAssignmentSchema = createInsertSchema(cargoAssignments).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertCargoAssignment = z.infer<typeof insertCargoAssignmentSchema>;
export type CargoAssignment = typeof cargoAssignments.$inferSelect;

// DAG Flight Plans - links flight plans to flight nodes
export const dagFlightPlans = pgTable("dag_flight_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: integer("user_id").notNull(),
  flight_node_id: uuid("flight_node_id").notNull(), // references dagNodes.id (flight type)
  aircraft_type: text("aircraft_type").notNull(), // 'C-17', 'C-130H', 'C-130J'
  callsign: text("callsign"),
  departure_time: timestamp("departure_time"),
  arrival_time: timestamp("arrival_time"),
  origin_icao: text("origin_icao"),
  destination_icao: text("destination_icao"),
  route: jsonb("route").notNull().default([]), // list of waypoints
  status: text("status").notNull().default('planned'), // 'planned', 'scheduled', 'in_progress', 'completed'
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDagFlightPlanSchema = createInsertSchema(dagFlightPlans).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertDagFlightPlan = z.infer<typeof insertDagFlightPlanSchema>;
export type DagFlightPlan = typeof dagFlightPlans.$inferSelect;

// ============================================================================
// AIRCRAFT FLEET MANAGEMENT TABLES
// ============================================================================

// Mixed fleet policy enum
export const mixedFleetModeEnum = ['PREFERRED_FIRST', 'OPTIMIZE_COST', 'MIN_AIRCRAFT', 'USER_LOCKED'] as const;
export type MixedFleetMode = typeof mixedFleetModeEnum[number];

// Plan solution status enum
export const planSolutionStatusEnum = ['FEASIBLE', 'PARTIAL', 'INFEASIBLE'] as const;
export type PlanSolutionStatus = typeof planSolutionStatusEnum[number];

// Aircraft Types - registry of supported aircraft
export const aircraftTypes = pgTable("aircraft_types", {
  id: text("id").primaryKey(), // e.g., "C17", "C130"
  display_name: text("display_name").notNull(),
  active: boolean("active").notNull().default(true),
  capacity_model_version: text("capacity_model_version").notNull().default("v1"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAircraftTypeSchema = createInsertSchema(aircraftTypes);
export type InsertAircraftType = z.infer<typeof insertAircraftTypeSchema>;
export type AircraftType = typeof aircraftTypes.$inferSelect;

// Aircraft Capacity Profiles - versioned capacity specs per aircraft type
export const aircraftCapacityProfiles = pgTable("aircraft_capacity_profiles", {
  id: serial("id").primaryKey(),
  aircraft_type_id: text("aircraft_type_id").notNull(),
  version: text("version").notNull().default("v1"),
  max_payload_lb: integer("max_payload_lb").notNull(),
  max_pallet_positions: integer("max_pallet_positions"),
  cargo_bay_dims: jsonb("cargo_bay_dims").notNull(), // {length, width, height}
  notes: text("notes"),
  default_cost_params: jsonb("default_cost_params").notNull(), // {cost_per_sortie, cost_per_hour, etc.}
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAircraftCapacityProfileSchema = createInsertSchema(aircraftCapacityProfiles).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertAircraftCapacityProfile = z.infer<typeof insertAircraftCapacityProfileSchema>;
export type AircraftCapacityProfile = typeof aircraftCapacityProfiles.$inferSelect;

// Plan Aircraft Availability - per-plan availability constraints
export const planAircraftAvailability = pgTable("plan_aircraft_availability", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id").notNull(),
  aircraft_type_id: text("aircraft_type_id").notNull(),
  available_count: integer("available_count").notNull().default(0),
  locked: boolean("locked").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlanAircraftAvailabilitySchema = createInsertSchema(planAircraftAvailability).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertPlanAircraftAvailability = z.infer<typeof insertPlanAircraftAvailabilitySchema>;
export type PlanAircraftAvailability = typeof planAircraftAvailability.$inferSelect;

// Plan Solutions - stores optimization results
export const planSolutions = pgTable("plan_solutions", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id").notNull(),
  status: text("status").notNull(), // FEASIBLE, PARTIAL, INFEASIBLE
  aircraft_used: jsonb("aircraft_used").notNull(), // {typeId: countUsed}
  unallocated_cargo_ids: jsonb("unallocated_cargo_ids").notNull().default([]),
  metrics: jsonb("metrics").notNull(), // {total_cost, total_aircraft, utilization, etc.}
  explanation: text("explanation"), // human-readable explanation
  comparison_data: jsonb("comparison_data"), // {preferred_only_solution, chosen_solution_rationale}
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlanSolutionSchema = createInsertSchema(planSolutions).omit({
  id: true,
  created_at: true,
});
export type InsertPlanSolution = z.infer<typeof insertPlanSolutionSchema>;
export type PlanSolution = typeof planSolutions.$inferSelect;

// ============================================================================
// AI INSIGHTS TABLES
// ============================================================================

// AI Insights - caches Bedrock-generated insights with hash-based invalidation
export const aiInsightTypeEnum = [
  'allocation_summary',
  'cob_analysis', 
  'pallet_review',
  'route_planning',
  'compliance',
  'mission_briefing',
  'mission_analytics',
  'flight_allocation_analysis',
  'land_convoy_analysis',
  'land_route_optimization',
  'sea_voyage_analysis',
  'sea_container_optimization',
  'cross_modal_manifest_analysis',
  'warehouse_capacity_forecast'
] as const;
export type AiInsightType = typeof aiInsightTypeEnum[number];

export const aiInsights = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  flight_plan_id: integer("flight_plan_id"), // nullable for non-plan-specific insights
  insight_type: text("insight_type").notNull(), // one of aiInsightTypeEnum
  input_hash: text("input_hash").notNull(), // SHA256 hash of input data for cache validation
  insight_data: jsonb("insight_data").notNull(), // The generated insight JSON
  token_usage: jsonb("token_usage"), // Track token consumption for cost monitoring
  created_at: timestamp("created_at").defaultNow().notNull(),
  regenerated_at: timestamp("regenerated_at"), // Tracks manual recalculations
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  created_at: true,
});

export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

// ============================================================================
// MANIFESTS TABLE
// ============================================================================

export const manifests = pgTable("manifests", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  name: text("name").notNull(),
  flight_plan_id: integer("flight_plan_id"),
  manifest_data: jsonb("manifest_data").notNull().default([]),
  total_weight_lb: integer("total_weight_lb").notNull().default(0),
  item_count: integer("item_count").notNull().default(0),
  status: text("status").notNull().default('draft'),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertManifestSchema = createInsertSchema(manifests).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type InsertManifest = z.infer<typeof insertManifestSchema>;
export type Manifest = typeof manifests.$inferSelect;

// ============================================================================
// WAREHOUSE MANAGEMENT SYSTEM (WMS) TABLES
// ============================================================================

// Warehouse Sites - top-level warehouse locations
export const warehouseSites = pgTable("warehouse_sites", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  timezone: text("timezone").default("UTC"),
  active: boolean("active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  address_line_1: text("address_line_1"),
  address_line_2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  zip_code: text("zip_code"),
  country: text("country").default("USA"),
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  aor: text("aor"),
  shipyard_code: text("shipyard_code"),
  dodaac: text("dodaac"),
  total_pallet_positions: integer("total_pallet_positions").default(0),
  open_pallet_positions: integer("open_pallet_positions").default(0),
  total_cubic_feet: numeric("total_cubic_feet", { precision: 12, scale: 2 }).default("0"),
  used_cubic_feet: numeric("used_cubic_feet", { precision: 12, scale: 2 }).default("0"),
  max_weight_lbs: integer("max_weight_lbs"),
  current_weight_lbs: integer("current_weight_lbs").default(0),
});

export const insertWarehouseSiteSchema = createInsertSchema(warehouseSites).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWarehouseSite = z.infer<typeof insertWarehouseSiteSchema>;
export type WarehouseSite = typeof warehouseSites.$inferSelect;

// Warehouse Buildings - physical buildings within a site
export const warehouseBuildings = pgTable("warehouse_buildings", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  length_m: numeric("length_m", { precision: 10, scale: 3 }),
  width_m: numeric("width_m", { precision: 10, scale: 3 }),
  height_m: numeric("height_m", { precision: 10, scale: 3 }),
  geometry_notes: text("geometry_notes"),
  active: boolean("active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWarehouseBuildingSchema = createInsertSchema(warehouseBuildings).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseBuilding = z.infer<typeof insertWarehouseBuildingSchema>;
export type WarehouseBuilding = typeof warehouseBuildings.$inferSelect;

// Zone usage type enum
export const zoneUsageTypeEnum = ['small_material', 'mixed_material', 'large_material', 'uncrated', 'crated', 'hazmat', 'long_pipes', 'general'] as const;
export type ZoneUsageType = typeof zoneUsageTypeEnum[number];

// Warehouse Zones - logical areas within a site (zones are the primary organizational structure)
export const warehouseZones = pgTable("warehouse_zones", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull(),
  building_id: integer("building_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  zone_type: text("zone_type").notNull().default("rack"),
  is_outdoor: boolean("is_outdoor").notNull().default(false),
  usage_type: text("usage_type").notNull().default("general"),
  bulk_available: integer("bulk_available").default(0),
  bulk_open: integer("bulk_open").default(0),
  rack_available: integer("rack_available").default(0),
  rack_open: integer("rack_open").default(0),
  location_pattern: text("location_pattern"),
  weight_limit_lbs: integer("weight_limit_lbs").default(2000),
  capacity_pallets: integer("capacity_pallets"),
  total_capacity: integer("total_capacity").default(0),
  current_item_count: integer("current_item_count").default(0),
  current_weight_lbs: numeric("current_weight_lbs", { precision: 12, scale: 2 }).default("0"),
  last_synced_at: timestamp("last_synced_at"),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWarehouseZoneSchema = createInsertSchema(warehouseZones).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseZone = z.infer<typeof insertWarehouseZoneSchema>;
export type WarehouseZone = typeof warehouseZones.$inferSelect;

// Warehouse Zone Capacity History - historical snapshots of zone capacity
export const warehouseZoneCapacityHistory = pgTable("warehouse_zone_capacity_history", {
  id: serial("id").primaryKey(),
  zone_id: integer("zone_id").notNull(),
  site_id: integer("site_id").notNull(),
  captured_at: timestamp("captured_at").defaultNow().notNull(),
  total_capacity: integer("total_capacity").default(0),
  current_item_count: integer("current_item_count").notNull().default(0),
  current_weight_lbs: integer("current_weight_lbs").notNull().default(0),
  bulk_used: integer("bulk_used").default(0),
  rack_used: integer("rack_used").default(0),
  source: text("source"),
});

export const insertWarehouseZoneCapacityHistorySchema = createInsertSchema(warehouseZoneCapacityHistory).omit({
  id: true,
});
export type InsertWarehouseZoneCapacityHistory = z.infer<typeof insertWarehouseZoneCapacityHistorySchema>;
export type WarehouseZoneCapacityHistory = typeof warehouseZoneCapacityHistory.$inferSelect;

// Warehouse Locations - individual pallet positions
export const warehouseLocations = pgTable("warehouse_locations", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull(),
  building_id: integer("building_id").notNull(),
  zone_id: integer("zone_id"),
  code: text("code").notNull(),
  location_type: text("location_type").notNull().default("pallet_position"),
  capacity_pallets: integer("capacity_pallets").notNull().default(1),
  x_m: numeric("x_m", { precision: 10, scale: 3 }),
  y_m: numeric("y_m", { precision: 10, scale: 3 }),
  z_m: numeric("z_m", { precision: 10, scale: 3 }),
  occupied: boolean("occupied").notNull().default(false),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  block_length_ft: numeric("block_length_ft", { precision: 5, scale: 2 }).default("4"),
  block_width_ft: numeric("block_width_ft", { precision: 5, scale: 2 }).default("4"),
  block_height_ft: numeric("block_height_ft", { precision: 5, scale: 2 }).default("4"),
  max_weight_lbs: integer("max_weight_lbs").default(2000),
  current_weight_lbs: integer("current_weight_lbs").default(0),
  is_occupied: boolean("is_occupied").default(false),
});

export const insertWarehouseLocationSchema = createInsertSchema(warehouseLocations).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseLocation = z.infer<typeof insertWarehouseLocationSchema>;
export type WarehouseLocation = typeof warehouseLocations.$inferSelect;

// Warehouse Inventory Items
// NSN Format: XXXX-XX-XXX-XXXX (e.g., 8415-01-530-2157)
// - FSC (4 digits): Federal Supply Classification
// - NIIN (9 digits): National Item Identification Number (XX-XXX-XXXX)
export const warehouseInventoryItems = pgTable("warehouse_inventory_items", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull(),
  location_id: integer("location_id"),
  zone_id: integer("zone_id"),
  storage_facility: text("storage_facility"),
  ship: text("ship"),
  ship_class: text("ship_class"),
  program_code: text("program_code"),
  requisition_no: text("requisition_no"),
  authority: text("authority"),
  work_item: text("work_item"),
  li: text("li"),
  matl_ctrl: text("matl_ctrl"),
  hmic: text("hmic"),
  smcc: text("smcc"),
  item_audit: text("item_audit"),
  audit_no: text("audit_no"),
  ship_ind: text("ship_ind"),
  ship_avail: text("ship_avail"),
  nsn: text("nsn"),
  fsc: text("fsc"),
  niin: text("niin"),
  description: text("description").notNull(),
  cage: text("cage"),
  manufacturer: text("manufacturer"),
  mfg_date: text("mfg_date"),
  contract_no: text("contract_no"),
  iuid: text("iuid"),
  unit: text("unit"),
  quantity: integer("quantity").notNull().default(0),
  unit_price: numeric("unit_price", { precision: 14, scale: 2 }),
  receipt_price: numeric("receipt_price", { precision: 14, scale: 2 }),
  receipt_date: text("receipt_date"),
  location: text("location"),
  lot_no: text("lot_no"),
  serial_no: text("serial_no"),
  barcode: text("barcode"),
  inventory_type: text("inventory_type"),
  material_disposition: text("material_disposition"),
  condition_code: text("condition_code"),
  condition: text("condition"),
  asset_type: text("asset_type"),
  exp_date: text("exp_date"),
  ext_date: text("ext_date"),
  insp_date: text("insp_date"),
  last_audit_date: text("last_audit_date"),
  data_user_id: text("data_user_id"),
  remarks: text("remarks"),
  in_service_date: text("in_service_date"),
  warranty_item: text("warranty_item"),
  mission_id: text("mission_id"),
  lin_esd: text("lin_esd"),
  last_moved: timestamp("last_moved"),
  weight_lbs: numeric("weight_lbs", { precision: 12, scale: 2 }),
  raw_row: jsonb("raw_row").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  milstrip_number: text("milstrip_number"),
  fedlog_code: text("fedlog_code"),
  last_received_date: timestamp("last_received_date"),
  aging_days: integer("aging_days").default(0),
  workflow_status: text("workflow_status").default("received"),
  workflow_updated_at: timestamp("workflow_updated_at"),
});

export const insertWarehouseInventoryItemSchema = createInsertSchema(warehouseInventoryItems).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWarehouseInventoryItem = z.infer<typeof insertWarehouseInventoryItemSchema>;
export type WarehouseInventoryItem = typeof warehouseInventoryItems.$inferSelect;

// ============================================================================
// LAND LOGISTICS TABLES
// ============================================================================

// Land Routes
export const landRoutes = pgTable("land_routes", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  name: text("name").notNull(),
  origin_name: text("origin_name").notNull(),
  origin_lat: numeric("origin_lat", { precision: 10, scale: 6 }),
  origin_lng: numeric("origin_lng", { precision: 10, scale: 6 }),
  destination_name: text("destination_name").notNull(),
  destination_lat: numeric("destination_lat", { precision: 10, scale: 6 }),
  destination_lng: numeric("destination_lng", { precision: 10, scale: 6 }),
  waypoints: jsonb("waypoints").notNull().default([]),
  distance_km: numeric("distance_km", { precision: 12, scale: 2 }),
  estimated_duration_hrs: numeric("estimated_duration_hrs", { precision: 8, scale: 2 }),
  status: text("status").notNull().default("planned"),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLandRouteSchema = createInsertSchema(landRoutes).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertLandRoute = z.infer<typeof insertLandRouteSchema>;
export type LandRoute = typeof landRoutes.$inferSelect;

// Land Convoys
export const landConvoys = pgTable("land_convoys", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  route_id: integer("route_id"),
  name: text("name").notNull(),
  vehicle_count: integer("vehicle_count").notNull().default(0),
  total_cargo_weight_lbs: integer("total_cargo_weight_lbs").default(0),
  departure_time: timestamp("departure_time"),
  arrival_time: timestamp("arrival_time"),
  scheduled_departure: timestamp("scheduled_departure"),
  scheduled_arrival: timestamp("scheduled_arrival"),
  actual_departure: timestamp("actual_departure"),
  actual_arrival: timestamp("actual_arrival"),
  status: text("status").notNull().default("planning"),
  cargo_manifest: jsonb("cargo_manifest").notNull().default([]),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLandConvoySchema = createInsertSchema(landConvoys).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertLandConvoy = z.infer<typeof insertLandConvoySchema>;
export type LandConvoy = typeof landConvoys.$inferSelect;

// ============================================================================
// LAND VEHICLE TYPES TABLE
// ============================================================================

// Standard military ground vehicles with specifications from DoD manuals
export const landVehicleTypes = pgTable("land_vehicle_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g., "LMTV", "HEMTT", "HET", "MTVR"
  name: text("name").notNull(), // e.g., "M1078 Light Medium Tactical Vehicle"
  category: text("category").notNull(), // light_tactical, medium_tactical, heavy_tactical, transport
  
  // Physical specifications
  payload_lbs: integer("payload_lbs").notNull(), // Max cargo weight
  curb_weight_lbs: integer("curb_weight_lbs"), // Empty vehicle weight
  gross_weight_lbs: integer("gross_weight_lbs"), // Max loaded weight
  
  // Dimensions (inches)
  length_in: numeric("length_in", { precision: 8, scale: 2 }),
  width_in: numeric("width_in", { precision: 8, scale: 2 }),
  height_in: numeric("height_in", { precision: 8, scale: 2 }),
  
  // Cargo bed dimensions (inches)
  bed_length_in: numeric("bed_length_in", { precision: 8, scale: 2 }),
  bed_width_in: numeric("bed_width_in", { precision: 8, scale: 2 }),
  
  // Performance
  max_speed_mph: integer("max_speed_mph"),
  range_miles: integer("range_miles"),
  fuel_capacity_gal: numeric("fuel_capacity_gal", { precision: 6, scale: 2 }),
  fuel_consumption_mpg: numeric("fuel_consumption_mpg", { precision: 4, scale: 2 }),
  fuel_type: text("fuel_type").default("diesel"), // diesel, jp8
  
  // Capabilities
  axle_config: text("axle_config"), // e.g., "4x4", "6x6", "8x8", "10x10"
  can_tow_trailer: boolean("can_tow_trailer").default(false),
  max_tow_weight_lbs: integer("max_tow_weight_lbs"),
  pallet_capacity_463l: integer("pallet_capacity_463l").default(0), // How many 463L pallets fit
  pallet_capacity_40x48: integer("pallet_capacity_40x48").default(0), // Standard pallets
  passenger_capacity: integer("passenger_capacity").default(0),
  
  // 3D model reference for visualization
  model_file: text("model_file"), // Path to GLB file
  
  // Metadata
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertLandVehicleTypeSchema = createInsertSchema(landVehicleTypes).omit({
  id: true,
  created_at: true,
});
export type InsertLandVehicleType = z.infer<typeof insertLandVehicleTypeSchema>;
export type LandVehicleType = typeof landVehicleTypes.$inferSelect;

// Land Convoy Vehicles - individual vehicles in a convoy
export const landConvoyVehicles = pgTable("land_convoy_vehicles", {
  id: serial("id").primaryKey(),
  convoy_id: integer("convoy_id").notNull(), // FK to landConvoys
  vehicle_type_id: integer("vehicle_type_id").notNull(), // FK to landVehicleTypes
  position_in_convoy: integer("position_in_convoy").notNull().default(1),
  callsign: text("callsign"),
  driver_name: text("driver_name"),
  cargo_manifest: jsonb("cargo_manifest").notNull().default([]),
  current_weight_lbs: integer("current_weight_lbs").default(0),
  status: text("status").notNull().default("ready"), // ready, loading, in_transit, unloading, maintenance
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLandConvoyVehicleSchema = createInsertSchema(landConvoyVehicles).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertLandConvoyVehicle = z.infer<typeof insertLandConvoyVehicleSchema>;
export type LandConvoyVehicle = typeof landConvoyVehicles.$inferSelect;

// ============================================================================
// SEA FREIGHT TABLES
// ============================================================================

// Sea Voyages
// Supports Military Sealift Command (MSC) vessel designations
// Hull numbers: T-AO (Oiler), T-AKR (Cargo), T-EPF (Fast Transport), etc.
export const seaVoyages = pgTable("sea_voyages", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  name: text("name").notNull(),
  vessel_name: text("vessel_name"),
  vessel_imo: text("vessel_imo"),
  // MSC vessel hull designation (e.g., T-AO 205, T-AKR 313, T-EPF 5)
  vessel_hull_number: text("vessel_hull_number"),
  vessel_class: text("vessel_class"), // e.g., "Fleet Replenishment Oiler", "LMSR"
  origin_port: text("origin_port").notNull(),
  destination_port: text("destination_port").notNull(),
  port_calls: jsonb("port_calls").notNull().default([]),
  departure_time: timestamp("departure_time"),
  arrival_time: timestamp("arrival_time"),
  scheduled_departure: timestamp("scheduled_departure"),
  scheduled_arrival: timestamp("scheduled_arrival"),
  actual_departure: timestamp("actual_departure"),
  actual_arrival: timestamp("actual_arrival"),
  status: text("status").notNull().default("planned"),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSeaVoyageSchema = createInsertSchema(seaVoyages).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertSeaVoyage = z.infer<typeof insertSeaVoyageSchema>;
export type SeaVoyage = typeof seaVoyages.$inferSelect;

// Sea Containers
export const seaContainers = pgTable("sea_containers", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  voyage_id: integer("voyage_id"),
  container_number: text("container_number").notNull(),
  container_type: text("container_type").notNull(),
  seal_number: text("seal_number"),
  weight_lbs: integer("weight_lbs"),
  tare_weight_lbs: integer("tare_weight_lbs"),
  status: text("status").notNull().default("empty"),
  cargo_manifest: jsonb("cargo_manifest").notNull().default([]),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSeaContainerSchema = createInsertSchema(seaContainers).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertSeaContainer = z.infer<typeof insertSeaContainerSchema>;
export type SeaContainer = typeof seaContainers.$inferSelect;

// ============================================================================
// WAREHOUSE TRANSFERS TABLE
// ============================================================================

export const warehouseTransfers = pgTable("warehouse_transfers", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  source_site_id: integer("source_site_id").notNull(),
  destination_site_id: integer("destination_site_id").notNull(),
  status: text("status").notNull().default("pending"),
  transport_mode: text("transport_mode").notNull().default("land"),
  transfer_items: jsonb("transfer_items").notNull().default([]),
  air_metadata: jsonb("air_metadata"),
  pacaf_manifest: jsonb("pacaf_manifest"),
  notes: text("notes"),
  scheduled_date: timestamp("scheduled_date"),
  completed_date: timestamp("completed_date"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWarehouseTransferSchema = createInsertSchema(warehouseTransfers).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWarehouseTransfer = z.infer<typeof insertWarehouseTransferSchema>;
export type WarehouseTransfer = typeof warehouseTransfers.$inferSelect;

// ============================================================================
// CROSS-MODAL MANIFESTS TABLE
// ============================================================================

// Unified manifests that can be used across Air, Land, and Sea operations
// Created from WMS inventory selection
export const crossModalManifests = pgTable("cross_modal_manifests", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  
  // Source
  source_site_id: integer("source_site_id").notNull(), // Origin warehouse
  destination_site_id: integer("destination_site_id"), // Destination warehouse (if known)
  destination_address: text("destination_address"), // Or free-form destination
  
  // Manifest details
  manifest_number: text("manifest_number").notNull(), // Auto-generated or MILSTRIP
  name: text("name").notNull(),
  priority: text("priority").notNull().default("routine"), // routine, priority, immediate, flash
  classification: text("classification").notNull().default("unclassified"),
  
  // Transport mode assignment
  transport_mode: text("transport_mode"), // air, land, sea, or null if not yet assigned
  
  // Link to specific transport (only one will be set based on mode)
  flight_plan_id: integer("flight_plan_id"), // FK to flightPlans for air
  convoy_id: integer("convoy_id"), // FK to landConvoys for land
  voyage_id: integer("voyage_id"), // FK to seaVoyages for sea
  
  // Cost estimation
  estimated_cost_usd: numeric("estimated_cost_usd", { precision: 12, scale: 2 }),
  estimated_duration_hours: numeric("estimated_duration_hours", { precision: 8, scale: 2 }),
  estimated_distance_miles: numeric("estimated_distance_miles", { precision: 10, scale: 2 }),
  
  // Weight/volume totals
  total_weight_lbs: integer("total_weight_lbs").default(0),
  total_cube_ft: numeric("total_cube_ft", { precision: 10, scale: 2 }).default("0"),
  total_items: integer("total_items").default(0),
  
  // Status tracking
  status: text("status").notNull().default("draft"), // draft, pending_transport, assigned, in_transit, delivered, cancelled
  
  // Dates
  required_delivery_date: timestamp("required_delivery_date"),
  estimated_departure: timestamp("estimated_departure"),
  estimated_arrival: timestamp("estimated_arrival"),
  actual_departure: timestamp("actual_departure"),
  actual_arrival: timestamp("actual_arrival"),
  
  // Metadata
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCrossModalManifestSchema = createInsertSchema(crossModalManifests).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertCrossModalManifest = z.infer<typeof insertCrossModalManifestSchema>;
export type CrossModalManifest = typeof crossModalManifests.$inferSelect;

// Manifest Items - links inventory items to manifests
export const manifestItems = pgTable("manifest_items", {
  id: serial("id").primaryKey(),
  manifest_id: integer("manifest_id").notNull(), // FK to crossModalManifests
  inventory_item_id: integer("inventory_item_id"), // FK to warehouseInventoryItems (nullable for external items)
  
  // Item details (copied or entered manually)
  nsn: text("nsn"),
  part_number: text("part_number"),
  nomenclature: text("nomenclature").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unit_of_issue: text("unit_of_issue").default("EA"),
  
  // Weight/dimensions
  weight_lbs: integer("weight_lbs"),
  length_in: numeric("length_in", { precision: 8, scale: 2 }),
  width_in: numeric("width_in", { precision: 8, scale: 2 }),
  height_in: numeric("height_in", { precision: 8, scale: 2 }),
  cube_ft: numeric("cube_ft", { precision: 8, scale: 2 }),
  
  // Classification
  hazmat_class: text("hazmat_class"),
  is_hazmat: boolean("is_hazmat").default(false),
  is_sensitive: boolean("is_sensitive").default(false),
  
  // Status
  picked: boolean("picked").default(false),
  packed: boolean("packed").default(false),
  loaded: boolean("loaded").default(false),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertManifestItemSchema = createInsertSchema(manifestItems).omit({
  id: true,
  created_at: true,
});
export type InsertManifestItem = z.infer<typeof insertManifestItemSchema>;
export type ManifestItem = typeof manifestItems.$inferSelect;

// ============================================================================
// WMS CONFIGURATION TABLES
// ============================================================================

// Warehouse Settings - user-specific configuration settings
export const warehouseSettings = pgTable("warehouse_settings", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  date_format: text("date_format").notNull().default("MM/DD/YYYY"),
  weight_unit: text("weight_unit").notNull().default("lbs"),
  default_page_size: integer("default_page_size").notNull().default(25),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWarehouseSettingsSchema = createInsertSchema(warehouseSettings).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWarehouseSettings = z.infer<typeof insertWarehouseSettingsSchema>;
export type WarehouseSettings = typeof warehouseSettings.$inferSelect;

// Warehouse Aging Thresholds - configurable aging alert thresholds
export const warehouseAgingThresholds = pgTable("warehouse_aging_thresholds", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  name: text("name").notNull(),
  days: integer("days").notNull(),
  color: text("color").notNull().default("#fbbf24"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWarehouseAgingThresholdSchema = createInsertSchema(warehouseAgingThresholds).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWarehouseAgingThreshold = z.infer<typeof insertWarehouseAgingThresholdSchema>;
export type WarehouseAgingThreshold = typeof warehouseAgingThresholds.$inferSelect;

// Warehouse Alerts - stores generated alerts for capacity, aging, and trend issues
export const warehouseAlertSeverityEnum = ['info', 'warning', 'critical'] as const;
export type WarehouseAlertSeverity = typeof warehouseAlertSeverityEnum[number];

export const warehouseAlertTypeEnum = ['threshold_capacity', 'threshold_aging', 'trend_throughput', 'trend_dwell_time'] as const;
export type WarehouseAlertType = typeof warehouseAlertTypeEnum[number];

export const warehouseAlertEntityTypeEnum = ['zone', 'site', 'item'] as const;
export type WarehouseAlertEntityType = typeof warehouseAlertEntityTypeEnum[number];

export const warehouseAlerts = pgTable("warehouse_alerts", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull(),
  alert_type: text("alert_type").notNull(), // 'threshold_capacity', 'threshold_aging', 'trend_throughput', 'trend_dwell_time'
  severity: text("severity").notNull().default("warning"), // 'info', 'warning', 'critical'
  entity_type: text("entity_type").notNull(), // 'zone', 'site', 'item'
  entity_id: integer("entity_id").notNull(),
  entity_name: text("entity_name").notNull(),
  message: text("message").notNull(),
  metric_value: numeric("metric_value", { precision: 14, scale: 4 }),
  threshold_value: numeric("threshold_value", { precision: 14, scale: 4 }),
  trend_change_percent: numeric("trend_change_percent", { precision: 8, scale: 2 }),
  metadata: jsonb("metadata").notNull().default({}),
  is_resolved: boolean("is_resolved").notNull().default(false),
  resolved_at: timestamp("resolved_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWarehouseAlertSchema = createInsertSchema(warehouseAlerts).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseAlert = z.infer<typeof insertWarehouseAlertSchema>;
export type WarehouseAlert = typeof warehouseAlerts.$inferSelect;

// Warehouse Metric Snapshots - stores time-series metric data
export const warehouseMetricSnapshots = pgTable("warehouse_metric_snapshots", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull(),
  metric_key: text("metric_key").notNull(), // 'capacity_utilization', 'throughput_inbound', etc.
  period_start: timestamp("period_start").notNull(),
  period_end: timestamp("period_end").notNull(),
  value: numeric("value", { precision: 14, scale: 4 }).notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWarehouseMetricSnapshotSchema = createInsertSchema(warehouseMetricSnapshots).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseMetricSnapshot = z.infer<typeof insertWarehouseMetricSnapshotSchema>;
export type WarehouseMetricSnapshot = typeof warehouseMetricSnapshots.$inferSelect;

// Warehouse Analytics Snapshots - store daily analytics data
export const warehouseAnalyticsSnapshots = pgTable("warehouse_analytics_snapshots", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  site_id: integer("site_id"),
  snapshot_date: date("snapshot_date").notNull(),
  metrics: jsonb("metrics").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWarehouseAnalyticsSnapshotSchema = createInsertSchema(warehouseAnalyticsSnapshots).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseAnalyticsSnapshot = z.infer<typeof insertWarehouseAnalyticsSnapshotSchema>;
export type WarehouseAnalyticsSnapshot = typeof warehouseAnalyticsSnapshots.$inferSelect;

// Warehouse Optimization Runs - store optimization results
export const warehouseOptimizationRunStatusEnum = ['pending', 'running', 'completed', 'failed'] as const;
export type WarehouseOptimizationRunStatus = typeof warehouseOptimizationRunStatusEnum[number];

export const warehouseOptimizationRuns = pgTable("warehouse_optimization_runs", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  site_id: integer("site_id").notNull(),
  algorithm: text("algorithm").notNull(),
  input_params: jsonb("input_params").notNull().default({}),
  results: jsonb("results").notNull().default({}),
  action_plan: jsonb("action_plan").notNull().default({}),
  status: text("status").notNull().default('pending'),
  created_at: timestamp("created_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
});

export const insertWarehouseOptimizationRunSchema = createInsertSchema(warehouseOptimizationRuns).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseOptimizationRun = z.infer<typeof insertWarehouseOptimizationRunSchema>;
export type WarehouseOptimizationRun = typeof warehouseOptimizationRuns.$inferSelect;

// Warehouse Action Plans - store generated action plans
export const warehouseActionPlanStatusEnum = ['draft', 'approved', 'in_progress', 'completed'] as const;
export type WarehouseActionPlanStatus = typeof warehouseActionPlanStatusEnum[number];

export const warehouseActionPlans = pgTable("warehouse_action_plans", {
  id: serial("id").primaryKey(),
  optimization_run_id: integer("optimization_run_id"),
  user_id: integer("user_id").notNull(),
  site_id: integer("site_id").notNull(),
  plan_type: text("plan_type").notNull(),
  actions: jsonb("actions").notNull().default([]),
  pdf_url: text("pdf_url"),
  status: text("status").notNull().default('draft'),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWarehouseActionPlanSchema = createInsertSchema(warehouseActionPlans).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWarehouseActionPlan = z.infer<typeof insertWarehouseActionPlanSchema>;
export type WarehouseActionPlan = typeof warehouseActionPlans.$inferSelect;

// ============================================================================
// WAREHOUSE OPTIMIZATION PLANS TABLES
// ============================================================================

// Warehouse Optimization Plans - stores optimization plan configurations and results
export const warehouseOptimizationPlans = pgTable("warehouse_optimization_plans", {
  id: serial("id").primaryKey(),
  site_id: integer("site_id").notNull().references(() => warehouseSites.id, { onDelete: 'cascade' }),
  user_id: integer("user_id").notNull(),
  parent_plan_id: integer("parent_plan_id"), // For version chaining
  name: text("name").notNull(),
  algorithm: text("algorithm").notNull(), // cardstack, size_standardization, value_density, bin_packing, run_all
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, cancelled
  version: integer("version").notNull().default(1),
  
  // Store diff as JSON patch for efficient storage
  diff_patch: jsonb("diff_patch").notNull().default(sql`'[]'::jsonb`), // Array of movement operations
  
  // Summary metrics
  summary: jsonb("summary").notNull().default(sql`'{}'::jsonb`), // slotsFreed, consolidationWins, etc.
  total_actions: integer("total_actions").notNull().default(0),
  completed_actions: integer("completed_actions").notNull().default(0),
  
  // Comparison context
  comparison_context: jsonb("comparison_context"), // Base data snapshot hash or reference
  
  // Execution tracking
  executed_at: timestamp("executed_at"),
  executed_by: integer("executed_by"),
  cancelled_at: timestamp("cancelled_at"),
  cancelled_by: integer("cancelled_by"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWarehouseOptimizationPlanSchema = createInsertSchema(warehouseOptimizationPlans).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertWarehouseOptimizationPlan = z.infer<typeof insertWarehouseOptimizationPlanSchema>;
export type WarehouseOptimizationPlan = typeof warehouseOptimizationPlans.$inferSelect;

// Warehouse Optimization Actions - individual actions within a plan
export const warehouseOptimizationActions = pgTable("warehouse_optimization_actions", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id").notNull().references(() => warehouseOptimizationPlans.id, { onDelete: 'cascade' }),
  item_id: integer("item_id").notNull(),
  action_type: text("action_type").notNull(), // move, consolidate, reposition
  
  // Movement details
  from_location: text("from_location"),
  to_location: text("to_location"),
  quantity: integer("quantity").notNull().default(1),
  
  // Status tracking
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, skipped
  
  // Movement completion
  completed_by: integer("completed_by"),
  completed_at: timestamp("completed_at"),
  movement_notes: text("movement_notes"),
  
  // Ordering
  sequence: integer("sequence").notNull().default(0),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWarehouseOptimizationActionSchema = createInsertSchema(warehouseOptimizationActions).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseOptimizationAction = z.infer<typeof insertWarehouseOptimizationActionSchema>;
export type WarehouseOptimizationAction = typeof warehouseOptimizationActions.$inferSelect;

// Warehouse Optimization Events - audit trail for optimization plans
export const warehouseOptimizationEvents = pgTable("warehouse_optimization_events", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id").notNull().references(() => warehouseOptimizationPlans.id, { onDelete: 'cascade' }),
  user_id: integer("user_id").notNull(),
  event_type: text("event_type").notNull(), // created, executed, action_started, action_completed, cancelled
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWarehouseOptimizationEventSchema = createInsertSchema(warehouseOptimizationEvents).omit({
  id: true,
  created_at: true,
});
export type InsertWarehouseOptimizationEvent = z.infer<typeof insertWarehouseOptimizationEventSchema>;
export type WarehouseOptimizationEvent = typeof warehouseOptimizationEvents.$inferSelect;

// Transport Operational Stats - Pre-calculated statistics updated on transport plan mutations
// This table stores aggregated stats to avoid expensive recalculations on each page load
export const transportOperationalStats = pgTable("transport_operational_stats", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  transport_mode: text("transport_mode").notNull(), // 'air', 'land', 'sea'
  schedule_date: date("schedule_date").notNull(), // The date of scheduled departure (date bucket)
  
  // Counts
  plan_count: integer("plan_count").notNull().default(0),
  
  // Cargo weights
  total_cargo_lbs: integer("total_cargo_lbs").notNull().default(0),
  
  // Item counts for air operations
  total_items: integer("total_items").notNull().default(0),
  
  // Timestamps
  last_updated_at: timestamp("last_updated_at").defaultNow().notNull(),
});

export const insertTransportOperationalStatsSchema = createInsertSchema(transportOperationalStats).omit({
  id: true,
  last_updated_at: true,
});
export type InsertTransportOperationalStats = z.infer<typeof insertTransportOperationalStatsSchema>;
export type TransportOperationalStats = typeof transportOperationalStats.$inferSelect;

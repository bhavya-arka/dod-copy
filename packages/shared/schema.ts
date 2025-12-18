import { pgTable, text, serial, integer, boolean, timestamp, jsonb, uuid, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table with email-based authentication
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull(),
  password: text("password").notNull(), // bcrypt hashed password
  created_at: timestamp("created_at").defaultNow().notNull(),
  last_login_at: timestamp("last_login_at"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Session validation schema for login
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Flight plan status enum
export const flightPlanStatusEnum = ['draft', 'complete', 'archived'] as const;
export type FlightPlanStatus = typeof flightPlanStatusEnum[number];

// Flight Plans - stores complete allocation results
export const flightPlans = pgTable("flight_plans", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default('draft'), // 'draft', 'complete', 'archived'
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

// AI Insights - caches Bedrock-generated insights with hash-based invalidation
export const aiInsightTypeEnum = [
  'allocation_summary',
  'cob_analysis', 
  'pallet_review',
  'route_planning',
  'compliance',
  'mission_briefing',
  'mission_analytics'
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
// AIRCRAFT AVAILABILITY & MIXED FLEET OPTIMIZATION TABLES
// ============================================================================

// Mixed Fleet Policy enum
export const mixedFleetModeEnum = ['PREFERRED_FIRST', 'OPTIMIZE_COST', 'MIN_AIRCRAFT', 'USER_LOCKED'] as const;
export type MixedFleetMode = typeof mixedFleetModeEnum[number];

// Plan Solution Status enum
export const planSolutionStatusEnum = ['FEASIBLE', 'PARTIAL', 'INFEASIBLE'] as const;
export type PlanSolutionStatus = typeof planSolutionStatusEnum[number];

// Aircraft Types - canonical registry of supported aircraft
export const aircraftTypes = pgTable("aircraft_types", {
  id: text("id").primaryKey(), // e.g., "C17", "C130"
  display_name: text("display_name").notNull(), // "C-17 Globemaster III"
  active: boolean("active").notNull().default(true),
  capacity_model_version: text("capacity_model_version").notNull().default("v1"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAircraftTypeSchema = createInsertSchema(aircraftTypes).omit({
  created_at: true,
  updated_at: true,
});

export type InsertAircraftType = z.infer<typeof insertAircraftTypeSchema>;
export type AircraftType = typeof aircraftTypes.$inferSelect;

// Aircraft Capacity Profiles - versioned capacity specifications
export const aircraftCapacityProfiles = pgTable("aircraft_capacity_profiles", {
  id: serial("id").primaryKey(),
  aircraft_type_id: text("aircraft_type_id").notNull(), // FK to aircraftTypes
  version: text("version").notNull().default("v1"),
  max_payload_lb: integer("max_payload_lb").notNull(),
  max_pallet_positions: integer("max_pallet_positions"),
  cargo_bay_dims: jsonb("cargo_bay_dims").notNull(), // {length_in, width_in, height_in}
  notes: text("notes"),
  default_cost_params: jsonb("default_cost_params").notNull(), // {cost_per_flight, cost_per_hour, estimated_hours_per_leg}
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

// Plan Aircraft Availability - availability per plan
export const planAircraftAvailability = pgTable("plan_aircraft_availability", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id").notNull(), // FK to flightPlans
  aircraft_type_id: text("aircraft_type_id").notNull(), // FK to aircraftTypes
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

// Plan Solutions - stored optimization results
export const planSolutions = pgTable("plan_solutions", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id").notNull(), // FK to flightPlans
  status: text("status").notNull(), // FEASIBLE, PARTIAL, INFEASIBLE
  aircraft_used: jsonb("aircraft_used").notNull(), // {typeId: countUsed}
  unallocated_cargo_ids: jsonb("unallocated_cargo_ids").notNull().default([]),
  metrics: jsonb("metrics").notNull(), // {total_cost, total_aircraft, utilization, etc.}
  explanation: text("explanation"),
  comparison_data: jsonb("comparison_data"), // {preferred_only_solution, chosen_solution_rationale}
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlanSolutionSchema = createInsertSchema(planSolutions).omit({
  id: true,
  created_at: true,
});

export type InsertPlanSolution = z.infer<typeof insertPlanSolutionSchema>;
export type PlanSolution = typeof planSolutions.$inferSelect;

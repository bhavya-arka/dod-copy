import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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

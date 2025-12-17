import { 
  users, type User, type InsertUser,
  flightPlans, type FlightPlan, type InsertFlightPlan,
  flightSchedules, type FlightSchedule, type InsertFlightSchedule,
  splitSessions, type SplitSession, type InsertSplitSession,
  sessions, type Session, type InsertSession,
  flightNodes, type FlightNode, type InsertFlightNode,
  flightEdges, type FlightEdge, type InsertFlightEdge,
  portInventory, type PortInventory, type InsertPortInventory,
  manifests, type Manifest, type InsertManifest,
  aiInsights, type AiInsight, type InsertAiInsight, type AiInsightType
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gt } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = 10;
const SESSION_EXPIRY_HOURS = 24 * 7; // 7 days

export interface IStorage {
  // Auth methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  validatePassword(email: string, password: string): Promise<User | null>;
  createSession(userId: number): Promise<Session>;
  getSession(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;
  
  // Flight plan methods (user-scoped)
  getFlightPlans(userId: number): Promise<FlightPlan[]>;
  getFlightPlan(id: number, userId: number): Promise<FlightPlan | undefined>;
  createFlightPlan(plan: InsertFlightPlan): Promise<FlightPlan>;
  updateFlightPlan(id: number, userId: number, data: Partial<InsertFlightPlan>): Promise<FlightPlan | undefined>;
  deleteFlightPlan(id: number, userId: number): Promise<void>;
  
  // Flight schedule methods (user-scoped)
  getFlightSchedules(userId: number): Promise<FlightSchedule[]>;
  getFlightSchedule(id: number, userId: number): Promise<FlightSchedule | undefined>;
  getFlightSchedulesByPlanId(flightPlanId: number, userId: number): Promise<FlightSchedule[]>;
  createFlightSchedule(schedule: InsertFlightSchedule): Promise<FlightSchedule>;
  deleteFlightSchedule(id: number, userId: number): Promise<void>;
  deleteFlightSchedulesByPlanId(flightPlanId: number, userId: number): Promise<void>;
  
  // Split session methods (user-scoped)
  getSplitSessions(userId: number): Promise<SplitSession[]>;
  getSplitSession(id: number, userId: number): Promise<SplitSession | undefined>;
  createSplitSession(session: InsertSplitSession): Promise<SplitSession>;
  updateSplitSession(id: number, userId: number, data: Partial<InsertSplitSession>): Promise<SplitSession | undefined>;
  deleteSplitSession(id: number, userId: number): Promise<void>;
  
  // Flight node methods (user-scoped)
  getFlightNodes(flightPlanId: number, userId: number): Promise<FlightNode[]>;
  getFlightNode(id: number, userId: number): Promise<FlightNode | undefined>;
  getFlightNodeChildren(parentNodeId: number, userId: number): Promise<FlightNode[]>;
  createFlightNode(node: InsertFlightNode): Promise<FlightNode>;
  updateFlightNode(id: number, userId: number, data: Partial<InsertFlightNode>): Promise<FlightNode | undefined>;
  deleteFlightNode(id: number, userId: number): Promise<void>;
  
  // Flight edge methods (user-scoped)
  getFlightEdges(flightPlanId: number, userId: number): Promise<FlightEdge[]>;
  getFlightEdge(id: number, userId: number): Promise<FlightEdge | undefined>;
  createFlightEdge(edge: InsertFlightEdge): Promise<FlightEdge>;
  updateFlightEdge(id: number, userId: number, data: Partial<InsertFlightEdge>): Promise<FlightEdge | undefined>;
  deleteFlightEdge(id: number, userId: number): Promise<void>;
  
  // Port inventory methods (user-scoped)
  getPortInventory(flightPlanId: number, airbaseId: string, userId: number): Promise<PortInventory | undefined>;
  getPortInventories(flightPlanId: number, userId: number): Promise<PortInventory[]>;
  upsertPortInventory(inventory: InsertPortInventory): Promise<PortInventory>;
  
  // Manifest methods (user-scoped)
  getManifests(userId: number): Promise<Manifest[]>;
  getManifest(id: number, userId: number): Promise<Manifest | undefined>;
  createManifest(manifest: InsertManifest): Promise<Manifest>;
  updateManifest(id: number, userId: number, data: Partial<InsertManifest>): Promise<Manifest | undefined>;
  updateManifestItem(manifestId: number, userId: number, itemIndex: number, itemData: Record<string, any>): Promise<Manifest | undefined>;
  deleteManifest(id: number, userId: number): Promise<void>;
  
  // AI Insight methods (user-scoped with caching)
  getAiInsight(userId: number, flightPlanId: number | null, insightType: AiInsightType, inputHash: string): Promise<AiInsight | undefined>;
  getAiInsightsByPlan(userId: number, flightPlanId: number): Promise<AiInsight[]>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  updateAiInsight(id: number, userId: number, data: Partial<InsertAiInsight>): Promise<AiInsight | undefined>;
  deleteAiInsightsByPlan(userId: number, flightPlanId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ============================================================================
  // AUTH METHODS
  // ============================================================================
  
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const userData = insertUser as { email: string; username: string; password: string };
    const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);
    const [user] = await db.insert(users).values({
      email: userData.email,
      username: userData.username,
      password: hashedPassword
    }).returning();
    return user;
  }

  async validatePassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return null;
    
    // Update last login time
    await db.update(users)
      .set({ last_login_at: new Date() } as any)
      .where(eq(users.id, user.id));
    
    return user;
  }

  async createSession(userId: number): Promise<Session> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
    
    const [session] = await db.insert(sessions).values({
      user_id: userId,
      token,
      expires_at: expiresAt
    }).returning();
    
    return session;
  }

  async getSession(token: string): Promise<Session | undefined> {
    const [session] = await db.select()
      .from(sessions)
      .where(and(
        eq(sessions.token, token),
        gt(sessions.expires_at, new Date())
      ));
    return session;
  }

  async deleteSession(token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  // ============================================================================
  // FLIGHT PLAN METHODS (USER-SCOPED)
  // ============================================================================

  async getFlightPlans(userId: number): Promise<FlightPlan[]> {
    return db.select()
      .from(flightPlans)
      .where(eq(flightPlans.user_id, userId))
      .orderBy(desc(flightPlans.created_at));
  }

  async getFlightPlan(id: number, userId: number): Promise<FlightPlan | undefined> {
    const [plan] = await db.select()
      .from(flightPlans)
      .where(and(eq(flightPlans.id, id), eq(flightPlans.user_id, userId)));
    return plan;
  }

  async createFlightPlan(plan: InsertFlightPlan): Promise<FlightPlan> {
    const [created] = await db.insert(flightPlans).values(plan as any).returning();
    return created;
  }

  async updateFlightPlan(id: number, userId: number, data: Partial<InsertFlightPlan>): Promise<FlightPlan | undefined> {
    const [updated] = await db
      .update(flightPlans)
      .set({ ...data, updated_at: new Date() } as any)
      .where(and(eq(flightPlans.id, id), eq(flightPlans.user_id, userId)))
      .returning();
    return updated;
  }

  async deleteFlightPlan(id: number, userId: number): Promise<void> {
    await db.delete(flightPlans)
      .where(and(eq(flightPlans.id, id), eq(flightPlans.user_id, userId)));
  }

  // ============================================================================
  // FLIGHT SCHEDULE METHODS (USER-SCOPED)
  // ============================================================================

  async getFlightSchedules(userId: number): Promise<FlightSchedule[]> {
    return db.select()
      .from(flightSchedules)
      .where(eq(flightSchedules.user_id, userId))
      .orderBy(desc(flightSchedules.created_at));
  }

  async getFlightSchedule(id: number, userId: number): Promise<FlightSchedule | undefined> {
    const [schedule] = await db.select()
      .from(flightSchedules)
      .where(and(eq(flightSchedules.id, id), eq(flightSchedules.user_id, userId)));
    return schedule;
  }

  async createFlightSchedule(schedule: InsertFlightSchedule): Promise<FlightSchedule> {
    const [created] = await db.insert(flightSchedules).values(schedule as any).returning();
    return created;
  }

  async deleteFlightSchedule(id: number, userId: number): Promise<void> {
    await db.delete(flightSchedules)
      .where(and(eq(flightSchedules.id, id), eq(flightSchedules.user_id, userId)));
  }

  async getFlightSchedulesByPlanId(flightPlanId: number, userId: number): Promise<FlightSchedule[]> {
    return db.select()
      .from(flightSchedules)
      .where(and(
        eq(flightSchedules.flight_plan_id, flightPlanId),
        eq(flightSchedules.user_id, userId)
      ))
      .orderBy(desc(flightSchedules.created_at));
  }

  async deleteFlightSchedulesByPlanId(flightPlanId: number, userId: number): Promise<void> {
    await db.delete(flightSchedules)
      .where(and(
        eq(flightSchedules.flight_plan_id, flightPlanId),
        eq(flightSchedules.user_id, userId)
      ));
  }

  // ============================================================================
  // SPLIT SESSION METHODS (USER-SCOPED)
  // ============================================================================

  async getSplitSessions(userId: number): Promise<SplitSession[]> {
    return db.select()
      .from(splitSessions)
      .where(eq(splitSessions.user_id, userId))
      .orderBy(desc(splitSessions.created_at));
  }

  async getSplitSession(id: number, userId: number): Promise<SplitSession | undefined> {
    const [session] = await db.select()
      .from(splitSessions)
      .where(and(eq(splitSessions.id, id), eq(splitSessions.user_id, userId)));
    return session;
  }

  async createSplitSession(session: InsertSplitSession): Promise<SplitSession> {
    const [created] = await db.insert(splitSessions).values(session as any).returning();
    return created;
  }

  async updateSplitSession(id: number, userId: number, data: Partial<InsertSplitSession>): Promise<SplitSession | undefined> {
    const [updated] = await db
      .update(splitSessions)
      .set({ ...data, updated_at: new Date() } as any)
      .where(and(eq(splitSessions.id, id), eq(splitSessions.user_id, userId)))
      .returning();
    return updated;
  }

  async deleteSplitSession(id: number, userId: number): Promise<void> {
    await db.delete(splitSessions)
      .where(and(eq(splitSessions.id, id), eq(splitSessions.user_id, userId)));
  }

  // ============================================================================
  // FLIGHT NODE METHODS (USER-SCOPED)
  // ============================================================================

  async getFlightNodes(flightPlanId: number, userId: number): Promise<FlightNode[]> {
    return db.select()
      .from(flightNodes)
      .where(and(
        eq(flightNodes.flight_plan_id, flightPlanId),
        eq(flightNodes.user_id, userId)
      ));
  }

  async getFlightNode(id: number, userId: number): Promise<FlightNode | undefined> {
    const [node] = await db.select()
      .from(flightNodes)
      .where(and(eq(flightNodes.id, id), eq(flightNodes.user_id, userId)));
    return node;
  }

  async getFlightNodeChildren(parentNodeId: number, userId: number): Promise<FlightNode[]> {
    return db.select()
      .from(flightNodes)
      .where(and(
        eq(flightNodes.parent_node_id, parentNodeId),
        eq(flightNodes.user_id, userId)
      ));
  }

  async createFlightNode(node: InsertFlightNode): Promise<FlightNode> {
    const [created] = await db.insert(flightNodes).values(node as any).returning();
    return created;
  }

  async updateFlightNode(id: number, userId: number, data: Partial<InsertFlightNode>): Promise<FlightNode | undefined> {
    const [updated] = await db
      .update(flightNodes)
      .set(data)
      .where(and(eq(flightNodes.id, id), eq(flightNodes.user_id, userId)))
      .returning();
    return updated;
  }

  async deleteFlightNode(id: number, userId: number): Promise<void> {
    await db.delete(flightNodes)
      .where(and(eq(flightNodes.id, id), eq(flightNodes.user_id, userId)));
  }

  // ============================================================================
  // FLIGHT EDGE METHODS (USER-SCOPED)
  // ============================================================================

  async getFlightEdges(flightPlanId: number, userId: number): Promise<FlightEdge[]> {
    return db.select()
      .from(flightEdges)
      .where(and(
        eq(flightEdges.flight_plan_id, flightPlanId),
        eq(flightEdges.user_id, userId)
      ));
  }

  async getFlightEdge(id: number, userId: number): Promise<FlightEdge | undefined> {
    const [edge] = await db.select()
      .from(flightEdges)
      .where(and(eq(flightEdges.id, id), eq(flightEdges.user_id, userId)));
    return edge;
  }

  async createFlightEdge(edge: InsertFlightEdge): Promise<FlightEdge> {
    const [created] = await db.insert(flightEdges).values(edge as any).returning();
    return created;
  }

  async updateFlightEdge(id: number, userId: number, data: Partial<InsertFlightEdge>): Promise<FlightEdge | undefined> {
    const [updated] = await db
      .update(flightEdges)
      .set(data)
      .where(and(eq(flightEdges.id, id), eq(flightEdges.user_id, userId)))
      .returning();
    return updated;
  }

  async deleteFlightEdge(id: number, userId: number): Promise<void> {
    await db.delete(flightEdges)
      .where(and(eq(flightEdges.id, id), eq(flightEdges.user_id, userId)));
  }

  // ============================================================================
  // PORT INVENTORY METHODS (USER-SCOPED)
  // ============================================================================

  async getPortInventory(flightPlanId: number, airbaseId: string, userId: number): Promise<PortInventory | undefined> {
    const [inventory] = await db.select()
      .from(portInventory)
      .where(and(
        eq(portInventory.flight_plan_id, flightPlanId),
        eq(portInventory.airbase_id, airbaseId),
        eq(portInventory.user_id, userId)
      ));
    return inventory;
  }

  async getPortInventories(flightPlanId: number, userId: number): Promise<PortInventory[]> {
    return db.select()
      .from(portInventory)
      .where(and(
        eq(portInventory.flight_plan_id, flightPlanId),
        eq(portInventory.user_id, userId)
      ));
  }

  async upsertPortInventory(inventory: InsertPortInventory): Promise<PortInventory> {
    const inv = inventory as any;
    const existing = await this.getPortInventory(inv.flight_plan_id, inv.airbase_id, inv.user_id);
    
    if (existing) {
      const [updated] = await db
        .update(portInventory)
        .set({ ...inv, updated_at: new Date() })
        .where(and(eq(portInventory.id, existing.id), eq(portInventory.user_id, inv.user_id)))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(portInventory).values(inv).returning();
      return created;
    }
  }

  // ============================================================================
  // MANIFEST METHODS (USER-SCOPED)
  // ============================================================================

  async getManifests(userId: number): Promise<Manifest[]> {
    return db.select()
      .from(manifests)
      .where(eq(manifests.user_id, userId))
      .orderBy(desc(manifests.created_at));
  }

  async getManifest(id: number, userId: number): Promise<Manifest | undefined> {
    const [manifest] = await db.select()
      .from(manifests)
      .where(and(eq(manifests.id, id), eq(manifests.user_id, userId)));
    return manifest;
  }

  async createManifest(manifest: InsertManifest): Promise<Manifest> {
    const [created] = await db.insert(manifests).values(manifest as any).returning();
    return created;
  }

  async updateManifest(id: number, userId: number, data: Partial<InsertManifest>): Promise<Manifest | undefined> {
    const [updated] = await db
      .update(manifests)
      .set({ ...data, updated_at: new Date() } as any)
      .where(and(eq(manifests.id, id), eq(manifests.user_id, userId)))
      .returning();
    return updated;
  }

  async updateManifestItem(manifestId: number, userId: number, itemIndex: number, itemData: Record<string, any>): Promise<Manifest | undefined> {
    const manifest = await this.getManifest(manifestId, userId);
    if (!manifest) return undefined;

    const items = manifest.items as any[];
    if (itemIndex < 0 || itemIndex >= items.length) return undefined;

    items[itemIndex] = { ...items[itemIndex], ...itemData };

    const [updated] = await db
      .update(manifests)
      .set({ items, updated_at: new Date() } as any)
      .where(and(eq(manifests.id, manifestId), eq(manifests.user_id, userId)))
      .returning();
    return updated;
  }

  async deleteManifest(id: number, userId: number): Promise<void> {
    await db.delete(manifests)
      .where(and(eq(manifests.id, id), eq(manifests.user_id, userId)));
  }

  // ============================================================================
  // AI INSIGHT METHODS (with caching support)
  // ============================================================================

  async getAiInsight(
    userId: number, 
    flightPlanId: number | null, 
    insightType: AiInsightType, 
    inputHash: string
  ): Promise<AiInsight | undefined> {
    const conditions = [
      eq(aiInsights.user_id, userId),
      eq(aiInsights.insight_type, insightType),
      eq(aiInsights.input_hash, inputHash)
    ];
    
    if (flightPlanId !== null) {
      conditions.push(eq(aiInsights.flight_plan_id, flightPlanId));
    }
    
    const [insight] = await db.select()
      .from(aiInsights)
      .where(and(...conditions));
    return insight;
  }

  async getAiInsightsByPlan(userId: number, flightPlanId: number): Promise<AiInsight[]> {
    return await db.select()
      .from(aiInsights)
      .where(and(
        eq(aiInsights.user_id, userId),
        eq(aiInsights.flight_plan_id, flightPlanId)
      ))
      .orderBy(desc(aiInsights.created_at));
  }

  async createAiInsight(insight: InsertAiInsight): Promise<AiInsight> {
    const [created] = await db.insert(aiInsights).values(insight as any).returning();
    return created;
  }

  async updateAiInsight(id: number, userId: number, data: Partial<InsertAiInsight>): Promise<AiInsight | undefined> {
    const [updated] = await db
      .update(aiInsights)
      .set({ ...data, regenerated_at: new Date() } as any)
      .where(and(eq(aiInsights.id, id), eq(aiInsights.user_id, userId)))
      .returning();
    return updated;
  }

  async deleteAiInsightsByPlan(userId: number, flightPlanId: number): Promise<void> {
    await db.delete(aiInsights)
      .where(and(
        eq(aiInsights.user_id, userId),
        eq(aiInsights.flight_plan_id, flightPlanId)
      ));
  }
}

export const storage = new DatabaseStorage();

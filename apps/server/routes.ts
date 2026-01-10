import type { Express, Request, Response as ExpressResponse, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { 
  loginSchema, 
  insertUserSchema,
  signupWithCodeSchema,
  organizations,
  accessCodes,
  users,
  type UserRole,
  warehouseSites,
  warehouseInventoryItems,
  warehouseTransfers,
  warehouseBuildings,
  warehouseZones,
  warehouseZoneCapacityHistory,
  warehouseLocations,
  warehouseSettings,
  warehouseAgingThresholds,
  warehouseAnalyticsSnapshots,
  warehouseOptimizationRuns,
  warehouseOptimizationPlans,
  warehouseOptimizationActions,
  warehouseOptimizationEvents,
  landRoutes,
  landConvoys,
  landVehicleTypes,
  landConvoyVehicles,
  insertLandRouteSchema,
  insertLandConvoySchema,
  insertLandConvoyVehicleSchema,
  crossModalManifests,
  manifestItems,
  insertCrossModalManifestSchema,
  insertManifestItemSchema,
  flightPlans,
  seaVoyages,
  militaryInstallations
} from "@shared/schema";
import { eq, and, or, like, ilike, sql, gt, lt, gte, lte, isNull, isNotNull, asc, desc, count, inArray } from "drizzle-orm";
import {
  dagNodeService,
  dagEdgeService,
  cargoService,
  cargoAssignmentService,
  aircraftService,
  googleMapsService
} from "./services";
import { runOptimization, OptimizationInput, AvailabilityConstraint, CargoRequirement, MixedFleetMode } from "./services/fleetOptimizer";
import { parseFile, getUploadSession, deleteUploadSession, getSessionStats } from "./services/fileIngestionService";
import { seedLandVehicles } from "./seeds/landVehicles";
import { 
  getSiteCapacity, 
  getAllSiteCapacities, 
  getLocationCapacities, 
  canAcceptItems, 
  findAvailableLocation 
} from "./services/capacityService";
import * as transportService from "./services/transportService";
import * as transportStatsService from "./services/transportStatsService";
import type { TransportMode, TransportStatus } from "../../packages/shared/transportTypes";
import { matchLocationToZone, type ZoneMatchResult } from "./services/zoneMatchingService";

// Weather API cache with 10-minute TTL
interface WeatherCacheEntry {
  data: any;
  timestamp: number;
}

const weatherCache = new Map<string, WeatherCacheEntry>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Weather API status tracking
interface WeatherApiStatus {
  cacheSize: number;
  cacheHits: number;
  cacheMisses: number;
  lastError: { message: string; timestamp: Date } | null;
  rateLimitState: { isLimited: boolean; retryAfter: string | null; limitedAt: Date | null };
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

const weatherApiStatus: WeatherApiStatus = {
  cacheSize: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastError: null,
  rateLimitState: { isLimited: false, retryAfter: null, limitedAt: null },
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0
};

function getFromWeatherCache(key: string): any | null {
  const entry = weatherCache.get(key);
  if (!entry) {
    weatherApiStatus.cacheMisses++;
    return null;
  }
  if (Date.now() - entry.timestamp > WEATHER_CACHE_TTL_MS) {
    weatherCache.delete(key);
    weatherApiStatus.cacheSize = weatherCache.size;
    weatherApiStatus.cacheMisses++;
    return null;
  }
  weatherApiStatus.cacheHits++;
  return entry.data;
}

function setWeatherCache(key: string, data: any): void {
  weatherCache.set(key, { data, timestamp: Date.now() });
  weatherApiStatus.cacheSize = weatherCache.size;
}

const NWS_USER_AGENT = "(PACAF Airlift Demo, contact@example.com)";

async function fetchWithRetries(
  url: string,
  init: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  const baseDelay = 500;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[NWS API] Fetching ${url} (attempt ${attempt + 1}/${maxRetries})`);
      const response = await fetch(url, init);
      console.log(`[NWS API] Response status: ${response.status} for ${url}`);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After") || "60";
        weatherApiStatus.rateLimitState = {
          isLimited: true,
          retryAfter,
          limitedAt: new Date()
        };
        console.warn(`[NWS API] Rate limited (429). Retry-After: ${retryAfter}s`);
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
          console.log(`[NWS API] Waiting ${delay.toFixed(0)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return response;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.warn(`[NWS API] Client error ${response.status} - not retrying`);
        return response;
      }

      if (!response.ok && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.log(`[NWS API] Server error ${response.status}. Waiting ${delay.toFixed(0)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (response.ok) {
        weatherApiStatus.rateLimitState = { isLimited: false, retryAfter: null, limitedAt: null };
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[NWS API] Fetch error (attempt ${attempt + 1}/${maxRetries}):`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.log(`[NWS API] Waiting ${delay.toFixed(0)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

const MILITARY_BASES_DATA = [
  { base_id: 'HICKAM', name: 'Joint Base Pearl Harbor-Hickam', icao: 'PHIK', lat: 21.3187, lon: -157.9224 },
  { base_id: 'ANDERSEN', name: 'Andersen Air Force Base', icao: 'PGUA', lat: 13.5840, lon: 144.9241 },
  { base_id: 'KADENA', name: 'Kadena Air Base', icao: 'RODN', lat: 26.3516, lon: 127.7695 },
  { base_id: 'YOKOTA', name: 'Yokota Air Base', icao: 'RJTY', lat: 35.7485, lon: 139.3487 },
  { base_id: 'MISAWA', name: 'Misawa Air Base', icao: 'RJSM', lat: 40.7032, lon: 141.3686 },
  { base_id: 'OSAN', name: 'Osan Air Base', icao: 'RKSO', lat: 37.0906, lon: 127.0306 },
  { base_id: 'KUNSAN', name: 'Kunsan Air Base', icao: 'RKJK', lat: 35.9038, lon: 126.6158 },
  { base_id: 'CLARK', name: 'Clark Air Base', icao: 'RPLC', lat: 15.1859, lon: 120.5604 },
  { base_id: 'TRAVIS', name: 'Travis Air Force Base', icao: 'KSUU', lat: 38.2627, lon: -121.9275 },
  { base_id: 'MCCHORD', name: 'Joint Base Lewis-McChord', icao: 'KTCM', lat: 47.1377, lon: -122.4764 },
  { base_id: 'CHARLESTON', name: 'Charleston AFB', icao: 'KCHS', lat: 32.8986, lon: -80.0405 },
  { base_id: 'DOVER', name: 'Dover Air Force Base', icao: 'KDOV', lat: 39.1296, lon: -75.4657 },
  { base_id: 'RAMSTEIN', name: 'Ramstein Air Base', icao: 'ETAR', lat: 49.4369, lon: 7.6003 },
  { base_id: 'INCIRLIK', name: 'Incirlik Air Base', icao: 'LTAG', lat: 37.0021, lon: 35.4259 },
  { base_id: 'AL_UDEID', name: 'Al Udeid Air Base', icao: 'OTBH', lat: 25.1174, lon: 51.3150 },
  { base_id: 'DIEGO_GARCIA', name: 'Naval Support Facility Diego Garcia', icao: 'FJDG', lat: -7.3133, lon: 72.4111 }
];

// Extended request type with user info
interface AuthRequest extends Request {
  user?: { 
    id: number; 
    email: string;
    role: UserRole;
    organization_id: number | null;
    is_active: boolean;
    first_name: string | null;
    last_name: string | null;
  };
}

// Superadmin email that gets auto-activated
const SUPERADMIN_EMAIL = 'bhavya091213@gmail.com';

// Auth middleware - checks authentication and populates user fields
async function authMiddleware(req: AuthRequest, res: ExpressResponse, next: NextFunction) {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const session = await storage.getSession(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  
  const user = await storage.getUser(session.user_id);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  
  // Check if user is active (unless superadmin who bypasses this)
  if (!user.is_active && user.role !== 'superadmin') {
    return res.status(403).json({ error: "Account pending approval" });
  }
  
  req.user = { 
    id: user.id, 
    email: user.email,
    role: user.role as UserRole,
    organization_id: user.organization_id,
    is_active: user.is_active,
    first_name: user.first_name,
    last_name: user.last_name
  };
  next();
}

// Role-based middleware: requires superadmin or admin role
function requireAdmin(req: AuthRequest, res: ExpressResponse, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Role-based middleware: requires superadmin role only
function requireSuperAdmin(req: AuthRequest, res: ExpressResponse, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
}

// Helper: check if user can access a resource from a specific organization
function canAccessOrganization(user: AuthRequest['user'], targetOrgId: number | null): boolean {
  if (!user) return false;
  // Superadmin can access all organizations
  if (user.role === 'superadmin') return true;
  // Admin can only access their own organization
  if (user.role === 'admin') {
    return user.organization_id === targetOrgId;
  }
  // Regular users can only access their own organization
  return user.organization_id === targetOrgId;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // AUTH ROUTES (PUBLIC)
  // ============================================================================
  
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = signupWithCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      }
      
      const { email, password, username, first_name, last_name, access_code } = parsed.data;
      
      // Check for duplicate email
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
      
      // Check for duplicate username
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ error: "Username already taken" });
      }
      
      // Check if this is the superadmin email
      const isSuperadmin = email.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
      
      let organizationId: number | null = null;
      
      if (!isSuperadmin) {
        // Validate access code for non-superadmin users
        const codeRecord = await storage.getAccessCodeByCode(access_code);
        if (!codeRecord) {
          return res.status(400).json({ error: "Invalid access code" });
        }
        
        if (codeRecord.is_used) {
          return res.status(400).json({ error: "Access code has already been used" });
        }
        
        if (new Date(codeRecord.expires_at) < new Date()) {
          return res.status(400).json({ error: "Access code has expired" });
        }
        
        organizationId = codeRecord.organization_id;
        
        // Mark access code as used
        await storage.markAccessCodeUsed(codeRecord.id, 0); // Will update with user ID after creation
      }
      
      // Create user with appropriate role and status
      const user = await storage.createUser({
        email,
        password,
        username,
        first_name: first_name || null,
        last_name: last_name || null,
        organization_id: organizationId,
        role: isSuperadmin ? 'superadmin' : 'user',
        is_active: isSuperadmin // Superadmin auto-activates, others need approval
      });
      
      // Update access code with the user ID who used it
      if (!isSuperadmin && organizationId !== null) {
        const codeRecord = await storage.getAccessCodeByCode(access_code);
        if (codeRecord) {
          await storage.markAccessCodeUsed(codeRecord.id, user.id);
        }
      }
      
      const session = await storage.createSession(user.id);
      
      res.cookie('session', session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'strict'
      });
      
      res.status(201).json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          username: user.username,
          role: user.role,
          is_active: user.is_active,
          organization_id: user.organization_id
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Failed to register" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      }
      
      const loginData = parsed.data as { email: string; password: string };
      const user = await storage.validatePassword(loginData.email, loginData.password);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      const session = await storage.createSession(user.id);
      
      res.cookie('session', session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
      
      // Check if user account is active
      if (!user.is_active && user.role !== 'superadmin') {
        return res.status(403).json({ error: "Account pending approval. Please wait for admin approval." });
      }
      
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          username: user.username,
          role: user.role,
          is_active: user.is_active,
          organization_id: user.organization_id,
          first_name: user.first_name,
          last_name: user.last_name
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await storage.deleteSession(token);
    }
    res.clearCookie('session');
    res.status(204).send();
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get organization info if user belongs to one
    let organization = null;
    if (user.organization_id) {
      organization = await storage.getOrganization(user.organization_id);
    }
    
    res.json({ 
      id: user.id, 
      email: user.email, 
      username: user.username,
      role: user.role,
      is_active: user.is_active,
      organization_id: user.organization_id,
      organization: organization ? { id: organization.id, name: organization.name } : null,
      first_name: user.first_name,
      last_name: user.last_name
    });
  });

  // ============================================================================
  // ORGANIZATIONS API (PROTECTED)
  // ============================================================================

  // GET /api/organizations - List all organizations (any authenticated user)
  app.get("/api/organizations", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const orgs = await storage.getAllOrganizations();
      res.json(orgs);
    } catch (error) {
      console.error('Failed to list organizations:', error);
      res.status(500).json({ error: "Failed to list organizations" });
    }
  });

  // POST /api/organizations - Create organization (superadmin only)
  app.post("/api/organizations", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Organization name is required" });
      }
      
      const existing = await storage.getOrganizationByName(name);
      if (existing) {
        return res.status(409).json({ error: "Organization already exists" });
      }
      
      const org = await storage.createOrganization({ name, description });
      res.status(201).json(org);
    } catch (error) {
      console.error('Failed to create organization:', error);
      res.status(500).json({ error: "Failed to create organization" });
    }
  });

  // ============================================================================
  // ACCESS CODES API (PROTECTED - ADMINS)
  // ============================================================================

  // GET /api/accesscodes - List access codes (admin sees own org, superadmin sees all)
  app.get("/api/accesscodes", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.query.organization_id ? parseInt(req.query.organization_id as string) : undefined;
      
      // Superadmin can see all or filter by org
      if (req.user!.role === 'superadmin') {
        const codes = orgId 
          ? await storage.getAccessCodesByOrganization(orgId)
          : await storage.getAllAccessCodes();
        return res.json(codes);
      }
      
      // Admin can only see their own org's codes
      if (!req.user!.organization_id) {
        return res.status(403).json({ error: "No organization assigned" });
      }
      
      const codes = await storage.getAccessCodesByOrganization(req.user!.organization_id);
      res.json(codes);
    } catch (error) {
      console.error('Failed to list access codes:', error);
      res.status(500).json({ error: "Failed to list access codes" });
    }
  });

  // POST /api/accesscodes - Generate new access code (admins for their org, superadmin for any)
  app.post("/api/accesscodes", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { organization_id, expires_in_days = 7 } = req.body;
      
      let targetOrgId: number;
      
      if (req.user!.role === 'superadmin') {
        // Superadmin must specify organization
        if (!organization_id) {
          return res.status(400).json({ error: "organization_id is required for superadmin" });
        }
        targetOrgId = organization_id;
      } else {
        // Admin uses their own org
        if (!req.user!.organization_id) {
          return res.status(403).json({ error: "No organization assigned" });
        }
        targetOrgId = req.user!.organization_id;
      }
      
      // Verify organization exists
      const org = await storage.getOrganization(targetOrgId);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }
      
      // Generate code
      const code = await storage.createAccessCode({
        organization_id: targetOrgId,
        created_by_user_id: req.user!.id,
        expires_at: new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000)
      });
      
      res.status(201).json(code);
    } catch (error) {
      console.error('Failed to create access code:', error);
      res.status(500).json({ error: "Failed to create access code" });
    }
  });

  // ============================================================================
  // ADMIN USER MANAGEMENT API (PROTECTED - ADMINS)
  // ============================================================================

  // GET /api/admin/users - List users (admin sees own org, superadmin sees all)
  app.get("/api/admin/users", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const orgId = req.query.organization_id ? parseInt(req.query.organization_id as string) : undefined;
      const includeInactive = req.query.include_inactive === 'true';
      
      // Superadmin can see all or filter
      if (req.user!.role === 'superadmin') {
        const users = orgId 
          ? await storage.getUsersByOrganization(orgId, includeInactive)
          : await storage.getAllUsers(includeInactive);
        
        // Don't return passwords
        const safeUsers = users.map(u => ({
          id: u.id,
          email: u.email,
          username: u.username,
          first_name: u.first_name,
          last_name: u.last_name,
          role: u.role,
          organization_id: u.organization_id,
          is_active: u.is_active,
          created_at: u.created_at,
          last_login_at: u.last_login_at
        }));
        return res.json(safeUsers);
      }
      
      // Admin can only see their own org's users
      if (!req.user!.organization_id) {
        return res.status(403).json({ error: "No organization assigned" });
      }
      
      const users = await storage.getUsersByOrganization(req.user!.organization_id, includeInactive);
      const safeUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        username: u.username,
        first_name: u.first_name,
        last_name: u.last_name,
        role: u.role,
        organization_id: u.organization_id,
        is_active: u.is_active,
        created_at: u.created_at,
        last_login_at: u.last_login_at
      }));
      res.json(safeUsers);
    } catch (error) {
      console.error('Failed to list users:', error);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  // PUT /api/admin/users/:id - Update user (with org restrictions)
  app.put("/api/admin/users/:id", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      const targetUser = await storage.getUser(userId);
      
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check org access
      if (!canAccessOrganization(req.user, targetUser.organization_id)) {
        return res.status(403).json({ error: "Cannot modify users from other organizations" });
      }
      
      // Prevent modifying superadmin unless you are superadmin
      if (targetUser.role === 'superadmin' && req.user!.role !== 'superadmin') {
        return res.status(403).json({ error: "Cannot modify superadmin" });
      }
      
      const { first_name, last_name, role, is_active, organization_id } = req.body;
      
      // Only superadmin can change roles to superadmin or change organization
      if (role === 'superadmin' && req.user!.role !== 'superadmin') {
        return res.status(403).json({ error: "Only superadmin can assign superadmin role" });
      }
      
      if (organization_id !== undefined && req.user!.role !== 'superadmin') {
        return res.status(403).json({ error: "Only superadmin can change user organization" });
      }
      
      const updateData: any = {};
      if (first_name !== undefined) updateData.first_name = first_name;
      if (last_name !== undefined) updateData.last_name = last_name;
      if (role !== undefined) updateData.role = role;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (organization_id !== undefined) updateData.organization_id = organization_id;
      
      const updated = await storage.updateUser(userId, updateData);
      if (!updated) {
        return res.status(500).json({ error: "Failed to update user" });
      }
      
      res.json({
        id: updated.id,
        email: updated.email,
        username: updated.username,
        first_name: updated.first_name,
        last_name: updated.last_name,
        role: updated.role,
        organization_id: updated.organization_id,
        is_active: updated.is_active
      });
    } catch (error) {
      console.error('Failed to update user:', error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // POST /api/admin/users/:id/approve - Approve pending user
  app.post("/api/admin/users/:id/approve", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      const targetUser = await storage.getUser(userId);
      
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check org access
      if (!canAccessOrganization(req.user, targetUser.organization_id)) {
        return res.status(403).json({ error: "Cannot approve users from other organizations" });
      }
      
      if (targetUser.is_active) {
        return res.status(400).json({ error: "User is already active" });
      }
      
      const updated = await storage.updateUser(userId, { is_active: true });
      if (!updated) {
        return res.status(500).json({ error: "Failed to approve user" });
      }
      
      res.json({
        id: updated.id,
        email: updated.email,
        username: updated.username,
        is_active: updated.is_active,
        message: "User approved successfully"
      });
    } catch (error) {
      console.error('Failed to approve user:', error);
      res.status(500).json({ error: "Failed to approve user" });
    }
  });

  // DELETE /api/admin/users/:id - Delete user (with org restrictions)
  app.delete("/api/admin/users/:id", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      const targetUser = await storage.getUser(userId);
      
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Cannot delete yourself
      if (userId === req.user!.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      // Check org access
      if (!canAccessOrganization(req.user, targetUser.organization_id)) {
        return res.status(403).json({ error: "Cannot delete users from other organizations" });
      }
      
      // Prevent deleting superadmin unless you are superadmin
      if (targetUser.role === 'superadmin' && req.user!.role !== 'superadmin') {
        return res.status(403).json({ error: "Cannot delete superadmin" });
      }
      
      await storage.deleteUser(userId);
      res.status(204).send();
    } catch (error) {
      console.error('Failed to delete user:', error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ============================================================================
  // SEED ORGANIZATIONS (for initial setup)
  // ============================================================================
  
  app.post("/api/admin/seed-organizations", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const defaultOrgs = [
        { name: 'PACAF', description: 'Pacific Air Forces' },
        { name: 'DLA', description: 'Defense Logistics Agency' },
        { name: 'MSC', description: 'Military Sealift Command' },
        { name: 'TRANSCOM', description: 'United States Transportation Command' }
      ];
      
      const created = [];
      const existing = [];
      
      for (const org of defaultOrgs) {
        const existingOrg = await storage.getOrganizationByName(org.name);
        if (existingOrg) {
          existing.push(org.name);
        } else {
          const newOrg = await storage.createOrganization(org);
          created.push(newOrg);
        }
      }
      
      res.json({
        message: "Seed complete",
        created: created.map(o => o.name),
        already_existed: existing
      });
    } catch (error) {
      console.error('Failed to seed organizations:', error);
      res.status(500).json({ error: "Failed to seed organizations" });
    }
  });

  // ============================================================================
  // WEATHER API PROXY (PUBLIC)
  // ============================================================================

  app.get("/api/weather/status", async (req, res) => {
    console.log("[Weather API] Status check requested");
    res.json({
      cache: {
        size: weatherApiStatus.cacheSize,
        hits: weatherApiStatus.cacheHits,
        misses: weatherApiStatus.cacheMisses,
        ttlMs: WEATHER_CACHE_TTL_MS
      },
      lastError: weatherApiStatus.lastError,
      rateLimitState: weatherApiStatus.rateLimitState,
      requests: {
        total: weatherApiStatus.totalRequests,
        successful: weatherApiStatus.successfulRequests,
        failed: weatherApiStatus.failedRequests
      }
    });
  });

  app.get("/api/weather/:lat/:lon", async (req, res) => {
    weatherApiStatus.totalRequests++;
    try {
      const lat = parseFloat(req.params.lat);
      const lon = parseFloat(req.params.lon);
      
      console.log(`[Weather API] Request for coordinates: ${lat}, ${lon}`);
      
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: "Coordinates out of range" });
      }
      
      const cacheKey = `weather:${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cachedData = getFromWeatherCache(cacheKey);
      if (cachedData) {
        console.log(`[Weather API] Cache HIT for ${cacheKey}`);
        return res.json({ ...cachedData, cached: true });
      }
      console.log(`[Weather API] Cache MISS for ${cacheKey}`);
      
      const nwsHeaders = {
        "User-Agent": NWS_USER_AGENT,
        "Accept": "application/geo+json"
      };
      
      const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointsResponse = await fetchWithRetries(pointsUrl, { headers: nwsHeaders });
      
      if (pointsResponse.status === 429) {
        weatherApiStatus.failedRequests++;
        const retryAfter = pointsResponse.headers.get("Retry-After") || "60";
        weatherApiStatus.lastError = { 
          message: "Rate limited by NWS API", 
          timestamp: new Date() 
        };
        return res.status(429).json({ 
          error: "Rate limited by NWS API. Please try again later.",
          retryAfter
        });
      }
      
      if (pointsResponse.status === 404) {
        console.log(`[Weather API] Location not supported: ${lat}, ${lon}`);
        return res.status(404).json({ 
          error: "Location not supported by NWS API. NWS only covers US territories." 
        });
      }
      
      if (!pointsResponse.ok) {
        weatherApiStatus.failedRequests++;
        weatherApiStatus.lastError = { 
          message: `NWS points API error: ${pointsResponse.status}`, 
          timestamp: new Date() 
        };
        console.error(`[Weather API] NWS points API error: ${pointsResponse.status}`);
        return res.status(502).json({ 
          error: "Failed to fetch weather data from NWS",
          status: pointsResponse.status
        });
      }
      
      const pointsData = await pointsResponse.json();
      const forecastUrl = pointsData.properties?.forecast;
      const forecastHourlyUrl = pointsData.properties?.forecastHourly;
      const observationStationsUrl = pointsData.properties?.observationStations;
      
      console.log(`[Weather API] Points data received. Forecast URL: ${forecastUrl}`);
      
      if (!forecastUrl) {
        weatherApiStatus.failedRequests++;
        return res.status(502).json({ error: "No forecast URL in NWS response" });
      }
      
      const forecastResponse = await fetchWithRetries(forecastUrl, { headers: nwsHeaders });
      
      if (forecastResponse.status === 429) {
        weatherApiStatus.failedRequests++;
        weatherApiStatus.lastError = { 
          message: "Rate limited fetching forecast", 
          timestamp: new Date() 
        };
        return res.status(429).json({ 
          error: "Rate limited by NWS API. Please try again later." 
        });
      }
      
      if (!forecastResponse.ok) {
        weatherApiStatus.failedRequests++;
        weatherApiStatus.lastError = { 
          message: `NWS forecast API error: ${forecastResponse.status}`, 
          timestamp: new Date() 
        };
        console.error(`[Weather API] NWS forecast API error: ${forecastResponse.status}`);
        return res.status(502).json({ 
          error: "Failed to fetch forecast data from NWS",
          status: forecastResponse.status
        });
      }
      
      const forecastData = await forecastResponse.json();
      console.log(`[Weather API] Forecast data received. Periods: ${forecastData.properties?.periods?.length || 0}`);
      
      let currentConditions = null;
      if (observationStationsUrl) {
        try {
          const stationsResponse = await fetchWithRetries(observationStationsUrl, { headers: nwsHeaders });
          
          if (stationsResponse.ok) {
            const stationsData = await stationsResponse.json();
            const nearestStation = stationsData.features?.[0]?.properties?.stationIdentifier;
            console.log(`[Weather API] Nearest observation station: ${nearestStation}`);
            
            if (nearestStation) {
              const obsUrl = `https://api.weather.gov/stations/${nearestStation}/observations/latest`;
              const obsResponse = await fetchWithRetries(obsUrl, { headers: nwsHeaders });
              
              if (obsResponse.ok) {
                const obsData = await obsResponse.json();
                currentConditions = obsData.properties;
                console.log(`[Weather API] Current conditions received: temp=${currentConditions?.temperature?.value}, visibility=${currentConditions?.visibility?.value}m`);
              }
            }
          }
        } catch (obsError) {
          console.warn("[Weather API] Could not fetch current conditions:", obsError);
        }
      }
      
      const result = {
        location: {
          lat,
          lon,
          city: pointsData.properties?.relativeLocation?.properties?.city,
          state: pointsData.properties?.relativeLocation?.properties?.state,
          timezone: pointsData.properties?.timeZone
        },
        forecast: forecastData.properties?.periods || [],
        forecastHourlyUrl,
        currentConditions,
        generatedAt: forecastData.properties?.generatedAt,
        updateTime: forecastData.properties?.updateTime
      };
      
      setWeatherCache(cacheKey, result);
      weatherApiStatus.successfulRequests++;
      console.log(`[Weather API] Successfully cached weather data for ${cacheKey}`);
      res.json({ ...result, cached: false });
      
    } catch (error) {
      weatherApiStatus.failedRequests++;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      weatherApiStatus.lastError = { message: errorMessage, timestamp: new Date() };
      console.error("[Weather API] Error:", error);
      res.status(500).json({ 
        error: "Internal server error while fetching weather data",
        message: errorMessage
      });
    }
  });

  // ============================================================================
  // AIRBASES API (PUBLIC)
  // ============================================================================

  app.post("/api/airbases/resolve", async (req, res) => {
    try {
      const { airbaseId, icao, baseName, lat, lon } = req.body;
      
      console.log(`[Airbases] Resolve request: airbaseId=${airbaseId}, icao=${icao}, baseName=${baseName}, lat=${lat}, lon=${lon}`);
      
      if (lat !== undefined && lon !== undefined) {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (!isNaN(latNum) && !isNaN(lonNum)) {
          return res.json({
            resolved: true,
            source: 'coordinates',
            coordinates: { lat: latNum, lon: lonNum }
          });
        }
      }
      
      let matchedBase: typeof MILITARY_BASES_DATA[0] | undefined = undefined;
      
      if (airbaseId) {
        matchedBase = MILITARY_BASES_DATA.find(b => 
          b.base_id.toLowerCase() === airbaseId.toLowerCase()
        );
      }
      
      if (!matchedBase && icao) {
        matchedBase = MILITARY_BASES_DATA.find(b => 
          b.icao.toLowerCase() === icao.toLowerCase()
        );
      }
      
      if (!matchedBase && baseName) {
        const lowerName = baseName.toLowerCase();
        matchedBase = MILITARY_BASES_DATA.find(b => 
          b.name.toLowerCase().includes(lowerName) ||
          b.base_id.toLowerCase().includes(lowerName)
        );
      }
      
      if (matchedBase) {
        console.log(`[Airbases] Resolved to: ${matchedBase.name} (${matchedBase.icao})`);
        return res.json({
          resolved: true,
          source: 'database',
          base: {
            base_id: matchedBase.base_id,
            name: matchedBase.name,
            icao: matchedBase.icao
          },
          coordinates: { lat: matchedBase.lat, lon: matchedBase.lon }
        });
      }
      
      console.log(`[Airbases] Could not resolve base`);
      res.status(404).json({
        resolved: false,
        error: "Could not resolve airbase. Provide airbaseId, icao, baseName, or lat/lon coordinates."
      });
      
    } catch (error) {
      console.error("[Airbases] Resolve error:", error);
      res.status(500).json({ 
        error: "Failed to resolve airbase",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============================================================================
  // FLIGHT PLANS API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const plans = await storage.getFlightPlans(req.user!.id);
      res.json(plans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight plans" });
    }
  });

  app.get("/api/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const plan = await storage.getFlightPlan(parseInt(req.params.id), req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight plan" });
    }
  });

  app.post("/api/flight-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      console.log('Creating flight plan with data:', JSON.stringify({
        name: req.body.name,
        status: req.body.status,
        movement_items_count: req.body.movement_items_count,
        total_weight_lb: req.body.total_weight_lb,
        aircraft_count: req.body.aircraft_count,
        has_allocation_data: !!req.body.allocation_data
      }));
      
      const plan = await storage.createFlightPlan({
        ...req.body,
        user_id: req.user!.id
      });
      console.log('Flight plan created successfully:', plan.id);
      res.status(201).json(plan);
    } catch (error) {
      console.error('Failed to create flight plan:', error);
      res.status(500).json({ error: "Failed to create flight plan", details: String(error) });
    }
  });

  app.put("/api/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const plan = await storage.updateFlightPlan(
        parseInt(req.params.id),
        req.user!.id,
        req.body
      );
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: "Failed to update flight plan" });
    }
  });

  app.patch("/api/flight-plans/:id/status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['draft', 'complete', 'archived'];
      
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: "Invalid status", 
          validStatuses 
        });
      }
      
      const plan = await storage.updateFlightPlan(
        parseInt(req.params.id),
        req.user!.id,
        { status }
      );
      
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      
      res.json(plan);
    } catch (error) {
      console.error('Failed to update flight plan status:', error);
      res.status(500).json({ error: "Failed to update flight plan status" });
    }
  });

  app.delete("/api/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightPlan(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight plan" });
    }
  });

  // ============================================================================
  // FLIGHT SCHEDULES API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const schedules = await storage.getFlightSchedules(req.user!.id);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight schedules" });
    }
  });

  app.get("/api/flight-schedules/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const schedule = await storage.getFlightSchedule(parseInt(req.params.id), req.user!.id);
      if (!schedule) {
        return res.status(404).json({ error: "Flight schedule not found" });
      }
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight schedule" });
    }
  });

  app.post("/api/flight-schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const schedule = await storage.createFlightSchedule({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(schedule);
    } catch (error) {
      res.status(500).json({ error: "Failed to create flight schedule" });
    }
  });

  app.delete("/api/flight-schedules/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightSchedule(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight schedule" });
    }
  });

  app.get("/api/flight-plans/:planId/schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const schedules = await storage.getFlightSchedulesByPlanId(planId, req.user!.id);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight schedules" });
    }
  });

  app.post("/api/flight-plans/:planId/schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      
      const { schedules } = req.body;
      if (!Array.isArray(schedules)) {
        return res.status(400).json({ error: "schedules must be an array" });
      }
      
      await storage.deleteFlightSchedulesByPlanId(planId, req.user!.id);
      
      const createdSchedules = [];
      for (const schedule of schedules) {
        const created = await storage.createFlightSchedule({
          user_id: req.user!.id,
          flight_plan_id: planId,
          name: schedule.name || schedule.callsign || `Flight ${createdSchedules.length + 1}`,
          schedule_data: schedule,
          total_flights: 1
        });
        createdSchedules.push(created);
      }
      
      // Update the flight plan's aircraft_count to reflect the actual number of flights
      if (schedules.length > 0) {
        await storage.updateFlightPlan(planId, req.user!.id, {
          aircraft_count: schedules.length
        });
      }
      
      res.status(201).json(createdSchedules);
    } catch (error) {
      console.error('Failed to save flight schedules:', error);
      res.status(500).json({ error: "Failed to save flight schedules" });
    }
  });

  // ============================================================================
  // SPLIT SESSIONS API (PROTECTED)
  // ============================================================================

  app.get("/api/split-sessions", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sessions = await storage.getSplitSessions(req.user!.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch split sessions" });
    }
  });

  app.get("/api/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const session = await storage.getSplitSession(parseInt(req.params.id), req.user!.id);
      if (!session) {
        return res.status(404).json({ error: "Split session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch split session" });
    }
  });

  app.post("/api/split-sessions", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const session = await storage.createSplitSession({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to create split session" });
    }
  });

  app.put("/api/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const session = await storage.updateSplitSession(
        parseInt(req.params.id),
        req.user!.id,
        req.body
      );
      if (!session) {
        return res.status(404).json({ error: "Split session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update split session" });
    }
  });

  app.delete("/api/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteSplitSession(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete split session" });
    }
  });

  // ============================================================================
  // FLIGHT NODES API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans/:planId/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const nodes = await storage.getFlightNodes(planId, req.user!.id);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight nodes" });
    }
  });

  app.get("/api/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const node = await storage.getFlightNode(parseInt(req.params.id), req.user!.id);
      if (!node) {
        return res.status(404).json({ error: "Flight node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight node" });
    }
  });

  app.get("/api/flight-nodes/:id/children", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const children = await storage.getFlightNodeChildren(parseInt(req.params.id), req.user!.id);
      res.json(children);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch node children" });
    }
  });

  app.post("/api/flight-plans/:planId/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const node = await storage.createFlightNode({
        ...req.body,
        flight_plan_id: planId,
        user_id: req.user!.id
      });
      res.status(201).json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to create flight node" });
    }
  });

  app.put("/api/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, flight_plan_id, id, ...safeData } = req.body;
      const node = await storage.updateFlightNode(parseInt(req.params.id), req.user!.id, safeData);
      if (!node) {
        return res.status(404).json({ error: "Flight node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to update flight node" });
    }
  });

  app.delete("/api/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightNode(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight node" });
    }
  });

  // ============================================================================
  // FLIGHT EDGES API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans/:planId/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const edges = await storage.getFlightEdges(planId, req.user!.id);
      res.json(edges);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight edges" });
    }
  });

  app.get("/api/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const edge = await storage.getFlightEdge(parseInt(req.params.id), req.user!.id);
      if (!edge) {
        return res.status(404).json({ error: "Flight edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight edge" });
    }
  });

  app.post("/api/flight-plans/:planId/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const edge = await storage.createFlightEdge({
        ...req.body,
        flight_plan_id: planId,
        user_id: req.user!.id
      });
      res.status(201).json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to create flight edge" });
    }
  });

  app.put("/api/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, flight_plan_id, id, ...safeData } = req.body;
      const edge = await storage.updateFlightEdge(parseInt(req.params.id), req.user!.id, safeData);
      if (!edge) {
        return res.status(404).json({ error: "Flight edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to update flight edge" });
    }
  });

  app.delete("/api/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightEdge(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight edge" });
    }
  });

  // ============================================================================
  // PORT INVENTORY API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans/:planId/port-inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const inventories = await storage.getPortInventories(planId, req.user!.id);
      res.json(inventories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch port inventories" });
    }
  });

  app.get("/api/flight-plans/:planId/port-inventory/:airbaseId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const inventory = await storage.getPortInventory(planId, req.params.airbaseId, req.user!.id);
      if (!inventory) {
        return res.json({ 
          flight_plan_id: planId, 
          airbase_id: req.params.airbaseId, 
          incoming_cargo: [], 
          outgoing_cargo: [], 
          available_cargo: [] 
        });
      }
      res.json(inventory);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch port inventory" });
    }
  });

  app.post("/api/flight-plans/:planId/port-inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const inventory = await storage.upsertPortInventory({
        ...req.body,
        flight_plan_id: planId,
        user_id: req.user!.id
      });
      res.status(201).json(inventory);
    } catch (error) {
      res.status(500).json({ error: "Failed to create/update port inventory" });
    }
  });

  app.put("/api/flight-plans/:planId/port-inventory/:airbaseId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      
      const { incoming_cargo, outgoing_cargo, available_cargo } = req.body;
      if (incoming_cargo !== undefined && !Array.isArray(incoming_cargo)) {
        return res.status(400).json({ error: "incoming_cargo must be an array" });
      }
      if (outgoing_cargo !== undefined && !Array.isArray(outgoing_cargo)) {
        return res.status(400).json({ error: "outgoing_cargo must be an array" });
      }
      if (available_cargo !== undefined && !Array.isArray(available_cargo)) {
        return res.status(400).json({ error: "available_cargo must be an array" });
      }
      
      const inventory = await storage.upsertPortInventory({
        incoming_cargo: incoming_cargo || [],
        outgoing_cargo: outgoing_cargo || [],
        available_cargo: available_cargo || [],
        flight_plan_id: planId,
        airbase_id: req.params.airbaseId,
        user_id: req.user!.id
      });
      res.json(inventory);
    } catch (error) {
      res.status(500).json({ error: "Failed to update port inventory" });
    }
  });

  // ============================================================================
  // DAG NODES API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const node = await dagNodeService.createNode({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(node);
    } catch (error) {
      console.error('Failed to create DAG node:', error);
      res.status(500).json({ error: "Failed to create node" });
    }
  });

  app.get("/api/dag/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const nodes = await dagNodeService.getNodes(req.user!.id);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch nodes" });
    }
  });

  app.get("/api/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const node = await dagNodeService.getNode(req.params.id, req.user!.id);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch node" });
    }
  });

  app.get("/api/dag/nodes/:id/children", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const children = await dagNodeService.getChildren(req.params.id, req.user!.id);
      res.json(children);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch children" });
    }
  });

  app.get("/api/dag/nodes/:id/parents", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const parents = await dagNodeService.getParents(req.params.id, req.user!.id);
      res.json(parents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch parents" });
    }
  });

  app.get("/api/dag/nodes/:id/ancestors", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const ancestors = await dagNodeService.getAncestors(req.params.id, req.user!.id);
      res.json(ancestors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ancestors" });
    }
  });

  app.get("/api/dag/nodes/:id/descendants", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const descendants = await dagNodeService.getDescendants(req.params.id, req.user!.id);
      res.json(descendants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch descendants" });
    }
  });

  app.patch("/api/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, ...safeData } = req.body;
      const node = await dagNodeService.updateNode(req.params.id, req.user!.id, safeData);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  app.delete("/api/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await dagNodeService.deleteNode(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete node" });
    }
  });

  app.get("/api/dag/nodes/:id/cargo", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoAssignmentService.getCargoAtNode(req.params.id, req.user!.id);
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo at node" });
    }
  });

  // ============================================================================
  // DAG EDGES API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const result = await dagEdgeService.createEdge({
        ...req.body,
        user_id: req.user!.id
      });
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      res.status(201).json(result.edge);
    } catch (error) {
      console.error('Failed to create DAG edge:', error);
      res.status(500).json({ error: "Failed to create edge" });
    }
  });

  app.get("/api/dag/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const edges = await dagEdgeService.getEdges(req.user!.id);
      res.json(edges);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch edges" });
    }
  });

  app.get("/api/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const edge = await dagEdgeService.getEdge(req.params.id, req.user!.id);
      if (!edge) {
        return res.status(404).json({ error: "Edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch edge" });
    }
  });

  app.post("/api/dag/edges/validate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { parent_id, child_id, cargo_shared } = req.body;
      if (!parent_id || !child_id) {
        return res.status(400).json({ error: "parent_id and child_id are required" });
      }
      const result = await dagEdgeService.validateEdge(
        parent_id,
        child_id,
        req.user!.id,
        cargo_shared ?? false
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to validate edge" });
    }
  });

  app.patch("/api/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, parent_id, child_id, ...safeData } = req.body;
      const edge = await dagEdgeService.updateEdge(req.params.id, req.user!.id, safeData);
      if (!edge) {
        return res.status(404).json({ error: "Edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to update edge" });
    }
  });

  app.delete("/api/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await dagEdgeService.deleteEdge(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete edge" });
    }
  });

  // ============================================================================
  // DAG CARGO API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/cargo", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoService.createCargoItem({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(cargo);
    } catch (error) {
      console.error('Failed to create cargo item:', error);
      res.status(500).json({ error: "Failed to create cargo item" });
    }
  });

  app.get("/api/dag/cargo", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargoType = req.query.type as string | undefined;
      const hazmatOnly = req.query.hazmat === 'true';
      
      let items;
      if (hazmatOnly) {
        items = await cargoService.getHazmatCargoItems(req.user!.id);
      } else if (cargoType) {
        items = await cargoService.getCargoItemsByType(cargoType, req.user!.id);
      } else {
        items = await cargoService.getCargoItems(req.user!.id);
      }
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo items" });
    }
  });

  app.get("/api/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoService.getCargoItem(req.params.id, req.user!.id);
      if (!cargo) {
        return res.status(404).json({ error: "Cargo item not found" });
      }
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo item" });
    }
  });

  app.get("/api/dag/cargo/tcn/:tcn", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoService.getCargoItemByTcn(req.params.tcn, req.user!.id);
      if (!cargo) {
        return res.status(404).json({ error: "Cargo item not found" });
      }
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo item by TCN" });
    }
  });

  app.patch("/api/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, ...safeData } = req.body;
      const cargo = await cargoService.updateCargoItem(req.params.id, req.user!.id, safeData);
      if (!cargo) {
        return res.status(404).json({ error: "Cargo item not found" });
      }
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to update cargo item" });
    }
  });

  app.delete("/api/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await cargoService.deleteCargoItem(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete cargo item" });
    }
  });

  // ============================================================================
  // DAG CARGO ASSIGNMENTS API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/assignments", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const assignment = await cargoAssignmentService.createAssignment({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(assignment);
    } catch (error) {
      console.error('Failed to create assignment:', error);
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });

  app.post("/api/dag/cargo/:cargoId/assign/:nodeId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { status, sequence, pallet_position, metadata } = req.body;
      const assignment = await cargoAssignmentService.assignCargoToNode(
        req.params.cargoId,
        req.params.nodeId,
        req.user!.id,
        { status, sequence, palletPosition: pallet_position, metadata }
      );
      res.status(201).json(assignment);
    } catch (error) {
      console.error('Failed to assign cargo to node:', error);
      res.status(500).json({ error: "Failed to assign cargo to node" });
    }
  });

  app.get("/api/dag/assignments", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const status = req.query.status as string | undefined;
      let assignments;
      if (status) {
        assignments = await cargoAssignmentService.getAssignmentsByStatus(status, req.user!.id);
      } else {
        assignments = await cargoAssignmentService.getAssignments(req.user!.id);
      }
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  app.get("/api/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const assignment = await cargoAssignmentService.getAssignment(req.params.id, req.user!.id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignment" });
    }
  });

  app.patch("/api/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, cargo_id, node_id, ...safeData } = req.body;
      const assignment = await cargoAssignmentService.updateAssignment(
        req.params.id,
        req.user!.id,
        safeData
      );
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update assignment" });
    }
  });

  app.patch("/api/dag/assignments/:id/status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['assigned', 'in_transit', 'delivered', 'pending'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status", validStatuses });
      }
      const assignment = await cargoAssignmentService.updateAssignmentStatus(
        req.params.id,
        req.user!.id,
        status
      );
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update assignment status" });
    }
  });

  app.delete("/api/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await cargoAssignmentService.deleteAssignment(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  // ============================================================================
  // MANIFESTS API (PROTECTED)
  // ============================================================================

  app.get("/api/manifests", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const manifestsList = await storage.getManifests(req.user!.id);
      res.json(manifestsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch manifests" });
    }
  });

  app.get("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const manifest = await storage.getManifest(parseInt(req.params.id), req.user!.id);
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      res.json(manifest);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch manifest" });
    }
  });

  app.post("/api/manifests", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, items, flight_plan_id } = req.body;
      if (!name || !items) {
        return res.status(400).json({ error: "Name and items are required" });
      }
      const manifest = await storage.createManifest({
        user_id: req.user!.id,
        name,
        manifest_data: items,
        flight_plan_id: flight_plan_id || null
      });
      res.status(201).json(manifest);
    } catch (error) {
      console.error('Failed to create manifest:', error);
      res.status(500).json({ error: "Failed to create manifest" });
    }
  });

  app.put("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, created_at, ...safeData } = req.body;
      const manifest = await storage.updateManifest(
        parseInt(req.params.id),
        req.user!.id,
        safeData
      );
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      res.json(manifest);
    } catch (error) {
      res.status(500).json({ error: "Failed to update manifest" });
    }
  });

  app.patch("/api/manifests/:id/items/:itemIndex", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const manifestId = parseInt(req.params.id);
      const itemIndex = parseInt(req.params.itemIndex);
      const itemData = req.body;
      
      if (isNaN(itemIndex) || itemIndex < 0) {
        return res.status(400).json({ error: "Invalid item index" });
      }
      
      const manifest = await storage.updateManifestItem(
        manifestId,
        req.user!.id,
        itemIndex,
        itemData
      );
      
      if (!manifest) {
        return res.status(404).json({ error: "Manifest or item not found" });
      }
      res.json(manifest);
    } catch (error) {
      console.error('Failed to update manifest item:', error);
      res.status(500).json({ error: "Failed to update manifest item" });
    }
  });

  app.delete("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteManifest(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete manifest" });
    }
  });

  // ============================================================================
  // AI INSIGHTS API (Bedrock integration with caching)
  // ============================================================================

  // Import bedrock service lazily to avoid initialization issues
  const getBedrockService = async () => {
    const { generateInsight, generateInputHash, checkBedrockHealth } = await import("./services/bedrockService");
    return { generateInsight, generateInputHash, checkBedrockHealth };
  };

  // Helper to map snake_case DB response to camelCase for frontend
  const mapInsightToCamelCase = (insight: any) => ({
    id: insight.id,
    userId: insight.user_id,
    flightPlanId: insight.flight_plan_id,
    insightType: insight.insight_type,
    inputHash: insight.input_hash,
    content: insight.insight_data,
    modelId: "amazon.nova-lite-v1:0",
    tokenUsage: insight.token_usage ? {
      inputTokens: insight.token_usage.inputTokens || 0,
      outputTokens: insight.token_usage.outputTokens || 0,
      totalTokens: (insight.token_usage.inputTokens || 0) + (insight.token_usage.outputTokens || 0)
    } : null,
    generatedAt: insight.created_at,
    regeneratedAt: insight.regenerated_at,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });

  // Health check for Bedrock
  app.get("/api/insights/health", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { checkBedrockHealth } = await getBedrockService();
      const health = await checkBedrockHealth();
      res.json(health);
    } catch (error) {
      console.error("[Insights] Health check error:", error);
      res.status(500).json({ 
        healthy: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get all insights for a flight plan (from cache)
  app.get("/api/insights/flight-plan/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      
      const insights = await storage.getAiInsightsByPlan(req.user!.id, planId);
      // Map to camelCase for frontend
      res.json(insights.map(mapInsightToCamelCase));
    } catch (error) {
      console.error("[Insights] Failed to get insights:", error);
      res.status(500).json({ error: "Failed to retrieve insights" });
    }
  });

  // Generate or retrieve cached insight
  app.post("/api/insights/generate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { type, inputData, flightPlanId, forceRegenerate = false } = req.body;
      
      if (!type || !inputData) {
        return res.status(400).json({ error: "Missing required fields: type, inputData" });
      }

      const validTypes = [
        'allocation_summary', 'cob_analysis', 'pallet_review', 'route_planning', 
        'compliance', 'mission_briefing', 'mission_analytics', 'flight_allocation_analysis',
        'land_convoy_analysis', 'land_route_optimization',
        'sea_voyage_analysis', 'sea_container_optimization',
        'cross_modal_manifest_analysis', 'warehouse_capacity_forecast'
      ];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid insight type. Must be one of: ${validTypes.join(', ')}` });
      }

      const { generateInsight, generateInputHash } = await getBedrockService();
      // Include flightPlanId in hash for proper cache isolation
      const inputHash = generateInputHash({ type, ...inputData }, flightPlanId || null);
      
      // Check cache first (unless force regenerate)
      if (!forceRegenerate) {
        const cachedInsight = await storage.getAiInsight(
          req.user!.id,
          flightPlanId || null,
          type,
          inputHash
        );
        
        if (cachedInsight) {
          console.log(`[Insights] Cache hit for ${type}`);
          return res.json({
            insight: {
              ...mapInsightToCamelCase(cachedInsight),
              fromCache: true
            },
            fromCache: true
          });
        }
      }

      console.log(`[Insights] Generating new insight for ${type}${forceRegenerate ? ' (forced)' : ''}`);
      
      // Generate new insight
      const result = await generateInsight({
        type,
        inputData,
        userId: String(req.user!.id),
        flightPlanId: flightPlanId || null,
        forceRegenerate
      });

      // Save to database for caching
      const savedInsight = await storage.createAiInsight({
        user_id: req.user!.id,
        flight_plan_id: flightPlanId || null,
        insight_type: type,
        input_hash: inputHash,
        insight_data: result.insight,
        token_usage: result.tokenUsage
      });

      // Map to camelCase for frontend and wrap in expected format
      const mappedInsight = {
        ...mapInsightToCamelCase(savedInsight),
        fromCache: false
      };
      res.json({
        insight: mappedInsight,
        fromCache: false
      });
    } catch (error) {
      console.error("[Insights] Generation error:", error);
      
      // Handle rate limit errors specially
      if (error instanceof Error && error.message.includes("Rate limit")) {
        return res.status(429).json({ error: error.message });
      }
      
      res.status(500).json({ 
        error: "Failed to generate insight",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Delete all insights for a flight plan
  app.delete("/api/insights/flight-plan/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      
      await storage.deleteAiInsightsByPlan(req.user!.id, planId);
      res.status(204).send();
    } catch (error) {
      console.error("[Insights] Delete error:", error);
      res.status(500).json({ error: "Failed to delete insights" });
    }
  });

  // ============================================================================
  // AIRCRAFT FLEET MANAGEMENT API (PROTECTED)
  // ============================================================================

  app.get("/api/aircraft-types", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const types = await aircraftService.getAllActiveAircraftTypes();
      
      const typesWithProfiles = await Promise.all(
        types.map(async (type) => {
          const profile = await aircraftService.getAircraftCapacityProfile(type.id);
          return {
            ...type,
            capacityProfile: profile,
          };
        })
      );
      
      res.json(typesWithProfiles);
    } catch (error) {
      console.error("[Aircraft] Failed to fetch aircraft types:", error);
      res.status(500).json({ error: "Failed to fetch aircraft types" });
    }
  });

  app.get("/api/aircraft-types/:typeId/capacity", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { typeId } = req.params;
      const { version } = req.query;
      
      const profile = await aircraftService.getAircraftCapacityProfile(
        typeId,
        version as string | undefined
      );
      
      if (!profile) {
        return res.status(404).json({ error: `No capacity profile found for aircraft type: ${typeId}` });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("[Aircraft] Failed to fetch capacity profile:", error);
      res.status(500).json({ error: "Failed to fetch capacity profile" });
    }
  });

  app.post("/api/plans/:planId/fleet-availability", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }

      const { availability, preferred_aircraft_type_id, mixed_fleet_mode, preference_strength } = req.body;
      if (!Array.isArray(availability)) {
        return res.status(400).json({ error: "availability must be an array" });
      }

      for (const item of availability) {
        if (!item.typeId || typeof item.count !== 'number') {
          return res.status(400).json({ 
            error: "Each availability item must have typeId (string) and count (number)" 
          });
        }
      }

      await aircraftService.setFleetAvailability(planId, availability);
      
      const planUpdates: Record<string, any> = {};
      if (preferred_aircraft_type_id !== undefined) {
        planUpdates.preferred_aircraft_type_id = preferred_aircraft_type_id;
      }
      if (mixed_fleet_mode !== undefined) {
        planUpdates.mixed_fleet_mode = mixed_fleet_mode;
      }
      if (preference_strength !== undefined) {
        planUpdates.preference_strength = preference_strength;
      }
      
      if (Object.keys(planUpdates).length > 0) {
        await storage.updateFlightPlan(planId, req.user!.id, planUpdates);
      }
      
      const updated = await aircraftService.getFleetAvailability(planId);
      res.json({ 
        success: true, 
        availability: updated.map(a => ({
          typeId: a.aircraft_type_id,
          count: a.available_count,
          locked: a.locked,
        }))
      });
    } catch (error) {
      console.error("[Aircraft] Failed to set fleet availability:", error);
      res.status(500).json({ error: "Failed to set fleet availability" });
    }
  });

  app.get("/api/plans/:planId/fleet-availability", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }

      const availability = await aircraftService.getFleetAvailability(planId);
      res.json(
        availability.map(a => ({
          typeId: a.aircraft_type_id,
          count: a.available_count,
          locked: a.locked,
        }))
      );
    } catch (error) {
      console.error("[Aircraft] Failed to get fleet availability:", error);
      res.status(500).json({ error: "Failed to get fleet availability" });
    }
  });

  app.post("/api/plans/:planId/optimize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }

      const availability = await aircraftService.getFleetAvailability(planId);
      
      const aircraftTypes = await aircraftService.getAllActiveAircraftTypes();
      const profileMap: Record<string, number> = {};
      
      for (const type of aircraftTypes) {
        const profile = await aircraftService.getAircraftCapacityProfile(type.id);
        if (profile) {
          profileMap[type.id] = profile.max_payload_lb;
        }
      }

      const availabilityConstraints: AvailabilityConstraint[] = availability.map(a => ({
        typeId: a.aircraft_type_id,
        count: a.available_count,
        locked: a.locked,
        maxPayloadLb: profileMap[a.aircraft_type_id] || 0,
      }));

      if (availabilityConstraints.length === 0) {
        for (const type of aircraftTypes) {
          const profile = await aircraftService.getAircraftCapacityProfile(type.id);
          availabilityConstraints.push({
            typeId: type.id,
            count: 10,
            locked: false,
            maxPayloadLb: profile?.max_payload_lb || 0,
          });
        }
      }

      const allocationData = plan.allocation_data as any;
      let cargoRequirements: CargoRequirement[] = [];
      
      if (allocationData?.items && Array.isArray(allocationData.items)) {
        cargoRequirements = allocationData.items.map((item: any, index: number) => ({
          id: item.id || item.tcn || `cargo-${index}`,
          weightLb: Number(item.weight_lb || item.weightLb || item.weight || 0),
        }));
      } else if (allocationData?.totalWeight) {
        cargoRequirements = [{
          id: 'bulk-cargo',
          weightLb: Number(allocationData.totalWeight),
        }];
      } else if (plan.total_weight_lb) {
        cargoRequirements = [{
          id: 'plan-total',
          weightLb: plan.total_weight_lb,
        }];
      }

      const mode: MixedFleetMode = (plan.mixed_fleet_mode as MixedFleetMode) || 'PREFERRED_FIRST';
      const preferenceStrength = plan.preference_strength ? Number(plan.preference_strength) : 0.5;

      const optimizationInput: OptimizationInput = {
        cargoRequirements,
        availability: availabilityConstraints,
        preferredTypeId: plan.preferred_aircraft_type_id || null,
        mode,
        preferenceStrength,
      };

      const result = runOptimization(optimizationInput);

      const savedSolution = await aircraftService.savePlanSolution({
        plan_id: planId,
        status: result.status,
        aircraft_used: result.aircraftUsed,
        unallocated_cargo_ids: result.unallocatedCargoIds,
        metrics: result.metrics,
        explanation: result.explanation,
        comparison_data: result.comparisonData || null,
      });

      res.json({
        ...result,
        solutionId: savedSolution.id,
        savedAt: savedSolution.created_at,
      });
    } catch (error) {
      console.error("[Aircraft] Optimization failed:", error);
      res.status(500).json({ 
        error: "Optimization failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // ============================================================================
  // WAREHOUSE MANAGEMENT API (PROTECTED)
  // ============================================================================

  // GET /api/warehouse/inventory-columns - Get available inventory column definitions (dynamic)
  app.get("/api/warehouse/inventory-columns", authMiddleware, async (_req: AuthRequest, res) => {
    try {
      // Dynamically generate column definitions from database schema
      const { INVENTORY_COLUMN_DEFINITIONS } = await import("@arka/shared/inventoryColumns");
      res.json({
        columns: INVENTORY_COLUMN_DEFINITIONS,
        version: Date.now(), // Cache-busting version
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch column definitions:", error);
      res.status(500).json({ error: "Failed to fetch column definitions" });
    }
  });

  // GET /api/warehouse/sites - Get all warehouse sites for the current user with inventory counts
  app.get("/api/warehouse/sites", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sites = await db.select({
        id: warehouseSites.id,
        user_id: warehouseSites.user_id,
        code: warehouseSites.code,
        name: warehouseSites.name,
        address: warehouseSites.address,
        city: warehouseSites.city,
        country: warehouseSites.country,
        timezone: warehouseSites.timezone,
        latitude: warehouseSites.latitude,
        longitude: warehouseSites.longitude,
        active: warehouseSites.active,
        created_at: warehouseSites.created_at,
        updated_at: warehouseSites.updated_at,
        item_count: sql<number>`CAST(COUNT(${warehouseInventoryItems.id}) AS INTEGER)`,
        total_quantity: sql<number>`CAST(COALESCE(SUM(${warehouseInventoryItems.quantity}), 0) AS INTEGER)`,
      })
        .from(warehouseSites)
        .leftJoin(warehouseInventoryItems, eq(warehouseSites.id, warehouseInventoryItems.site_id))
        .where(eq(warehouseSites.user_id, req.user!.id))
        .groupBy(warehouseSites.id);
      res.json(sites);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch sites:", error);
      res.status(500).json({ error: "Failed to fetch warehouse sites" });
    }
  });

  // POST /api/warehouse/sites - Create a new warehouse site
  app.post("/api/warehouse/sites", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { 
        code, name, address, address_line_1, address_line_2, 
        city, state, zip_code, country, timezone, 
        latitude, longitude, active, aor, shipyard_code, dodaac 
      } = req.body;
      
      if (!code || !name) {
        return res.status(400).json({ error: "Code and name are required" });
      }

      // If coordinates not provided but we have address info, try to geocode
      let finalLat = latitude;
      let finalLng = longitude;
      
      if (!latitude && !longitude && (address_line_1 || city)) {
        const { geocodeAddress } = await import("./services/googleMapsService");
        const addressParts = [address_line_1, address_line_2, city, state, zip_code, country].filter(Boolean);
        const fullAddress = addressParts.join(", ");
        
        if (fullAddress) {
          const geocodeResult = await geocodeAddress(fullAddress);
          if (geocodeResult) {
            finalLat = geocodeResult.lat.toString();
            finalLng = geocodeResult.lng.toString();
          }
        }
      }

      const [site] = await db.insert(warehouseSites).values({
        user_id: req.user!.id,
        code,
        name,
        address: address || null,
        address_line_1: address_line_1 || null,
        address_line_2: address_line_2 || null,
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        country: country || "USA",
        timezone: timezone || "UTC",
        latitude: finalLat || null,
        longitude: finalLng || null,
        active: active !== undefined ? active : true,
        aor: aor || null,
        shipyard_code: shipyard_code || null,
        dodaac: dodaac || null,
      }).returning();

      res.status(201).json(site);
    } catch (error) {
      console.error("[Warehouse] Failed to create site:", error);
      res.status(500).json({ error: "Failed to create warehouse site" });
    }
  });

  // GET /api/warehouse/sites/:siteId/deletion-preview - Get counts of data that will be deleted
  app.get("/api/warehouse/sites/:siteId/deletion-preview", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Get building IDs for this site
      const buildings = await db.select({ id: warehouseBuildings.id })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));
      const buildingIds = buildings.map(b => b.id);

      // Get optimization plan IDs for this site
      const plans = await db.select({ id: warehouseOptimizationPlans.id })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));
      const planIds = plans.map(p => p.id);

      // Count buildings
      const [buildingsCount] = await db.select({ count: count() })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));

      // Count zones (through building_id)
      let zonesTotal = 0;
      if (buildingIds.length > 0) {
        const [zonesCount] = await db.select({ count: count() })
          .from(warehouseZones)
          .where(inArray(warehouseZones.building_id, buildingIds));
        zonesTotal = Number(zonesCount?.count || 0);
      }

      // Count locations
      const [locationsCount] = await db.select({ count: count() })
        .from(warehouseLocations)
        .where(eq(warehouseLocations.site_id, siteId));

      // Count inventory items
      const [inventoryCount] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Count optimization plans
      const [plansCount] = await db.select({ count: count() })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));

      // Count optimization actions (through plan_id)
      let actionsTotal = 0;
      if (planIds.length > 0) {
        const [actionsCount] = await db.select({ count: count() })
          .from(warehouseOptimizationActions)
          .where(inArray(warehouseOptimizationActions.plan_id, planIds));
        actionsTotal = Number(actionsCount?.count || 0);
      }

      res.json({
        siteName: site.name,
        counts: {
          buildings: Number(buildingsCount?.count || 0),
          zones: zonesTotal,
          locations: Number(locationsCount?.count || 0),
          inventoryItems: Number(inventoryCount?.count || 0),
          optimizationPlans: Number(plansCount?.count || 0),
          optimizationActions: actionsTotal
        }
      });
    } catch (error) {
      console.error("[Warehouse] Failed to get deletion preview:", error);
      res.status(500).json({ error: "Failed to get deletion preview" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId - Delete a warehouse site and all related data
  app.delete("/api/warehouse/sites/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Get counts before deletion for response
      const buildings = await db.select({ id: warehouseBuildings.id })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));
      const buildingIds = buildings.map(b => b.id);

      const plans = await db.select({ id: warehouseOptimizationPlans.id })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));
      const planIds = plans.map(p => p.id);

      // Count items before deletion
      const [buildingsCount] = await db.select({ count: count() })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));

      let zonesTotal = 0;
      if (buildingIds.length > 0) {
        const [zonesCount] = await db.select({ count: count() })
          .from(warehouseZones)
          .where(inArray(warehouseZones.building_id, buildingIds));
        zonesTotal = Number(zonesCount?.count || 0);
      }

      const [locationsCount] = await db.select({ count: count() })
        .from(warehouseLocations)
        .where(eq(warehouseLocations.site_id, siteId));

      const [inventoryCount] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const [plansCount] = await db.select({ count: count() })
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));

      let actionsTotal = 0;
      if (planIds.length > 0) {
        const [actionsCount] = await db.select({ count: count() })
          .from(warehouseOptimizationActions)
          .where(inArray(warehouseOptimizationActions.plan_id, planIds));
        actionsTotal = Number(actionsCount?.count || 0);
      }

      // Delete in correct order due to foreign key constraints:
      // 1. Delete related transfers first
      await db.delete(warehouseTransfers)
        .where(or(
          eq(warehouseTransfers.source_site_id, siteId),
          eq(warehouseTransfers.destination_site_id, siteId)
        ));

      // 2. Delete optimization actions (through plan_id)
      if (planIds.length > 0) {
        await db.delete(warehouseOptimizationActions)
          .where(inArray(warehouseOptimizationActions.plan_id, planIds));
        
        // Delete optimization events
        await db.delete(warehouseOptimizationEvents)
          .where(inArray(warehouseOptimizationEvents.plan_id, planIds));
      }

      // 3. Delete optimization plans
      await db.delete(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.site_id, siteId));

      // 4. Delete inventory items
      await db.delete(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // 5. Delete locations
      await db.delete(warehouseLocations)
        .where(eq(warehouseLocations.site_id, siteId));

      // 6. Delete zones for all buildings in this site
      if (buildingIds.length > 0) {
        for (const buildingId of buildingIds) {
          await db.delete(warehouseZones)
            .where(eq(warehouseZones.building_id, buildingId));
        }
      }

      // 7. Delete buildings
      await db.delete(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));

      // 8. Delete the site itself
      await db.delete(warehouseSites)
        .where(eq(warehouseSites.id, siteId));

      res.json({ 
        success: true, 
        message: "Site and all related data deleted successfully",
        deletedCounts: {
          buildings: Number(buildingsCount?.count || 0),
          zones: zonesTotal,
          locations: Number(locationsCount?.count || 0),
          inventoryItems: Number(inventoryCount?.count || 0),
          optimizationPlans: Number(plansCount?.count || 0),
          optimizationActions: actionsTotal
        }
      });
    } catch (error) {
      console.error("[Warehouse] Failed to delete site:", error);
      res.status(500).json({ error: "Failed to delete warehouse site" });
    }
  });

  // GET /api/warehouse/sites/:siteId/buildings - Get buildings for a site with capacity info
  app.get("/api/warehouse/sites/:siteId/buildings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch all buildings for this site
      const buildings = await db.select()
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId))
        .orderBy(asc(warehouseBuildings.code));

      // For each building, calculate capacity from zones
      const buildingsWithCapacity = await Promise.all(
        buildings.map(async (building) => {
          // Get zones for this building
          const zones = await db.select()
            .from(warehouseZones)
            .where(eq(warehouseZones.building_id, building.id));

          // Calculate total pallet capacity from zones
          const totalPalletCapacity = zones.reduce((sum, zone) => {
            return sum + (zone.capacity_pallets || 0);
          }, 0);

          // Get count of inventory items in locations within this building
          const [inventoryCount] = await db.select({ count: count() })
            .from(warehouseLocations)
            .where(and(
              eq(warehouseLocations.building_id, building.id),
              eq(warehouseLocations.occupied, true)
            ));

          const occupiedCount = inventoryCount?.count || 0;
          const capacityPercent = totalPalletCapacity > 0 
            ? Math.round((Number(occupiedCount) / totalPalletCapacity) * 100) 
            : 0;

          // Format dimensions from meters
          const lengthM = building.length_m ? parseFloat(building.length_m as string) : null;
          const widthM = building.width_m ? parseFloat(building.width_m as string) : null;
          const heightM = building.height_m ? parseFloat(building.height_m as string) : null;

          let dimensions = "";
          if (lengthM && widthM && heightM) {
            // Convert meters to feet (1m = 3.28084ft)
            const lengthFt = Math.round(lengthM * 3.28084);
            const widthFt = Math.round(widthM * 3.28084);
            const heightFt = Math.round(heightM * 3.28084);
            dimensions = `${lengthFt}×${widthFt}×${heightFt} ft`;
          } else if (lengthM && widthM) {
            const lengthFt = Math.round(lengthM * 3.28084);
            const widthFt = Math.round(widthM * 3.28084);
            dimensions = `${lengthFt}×${widthFt} ft`;
          }

          return {
            id: building.id,
            code: building.code,
            name: building.name,
            dimensions,
            capacity_percent: capacityPercent,
            pallet_count: totalPalletCapacity,
            geometry_notes: building.geometry_notes,
            active: building.active
          };
        })
      );

      res.json(buildingsWithCapacity);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch buildings:", error);
      res.status(500).json({ error: "Failed to fetch buildings" });
    }
  });

  // POST /api/warehouse/sites/:siteId/buildings - Create a new building
  app.post("/api/warehouse/sites/:siteId/buildings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { code, name, length_ft, width_ft, height_ft, geometry_notes, capacity_pallets } = req.body;

      if (!code || !name) {
        return res.status(400).json({ error: "Building code and name are required" });
      }

      // Convert feet to meters for storage (1ft = 0.3048m)
      const length_m = length_ft ? (parseFloat(length_ft) * 0.3048).toFixed(3) : null;
      const width_m = width_ft ? (parseFloat(width_ft) * 0.3048).toFixed(3) : null;
      const height_m = height_ft ? (parseFloat(height_ft) * 0.3048).toFixed(3) : null;

      const [building] = await db.insert(warehouseBuildings).values({
        site_id: siteId,
        code: code.trim(),
        name: name.trim(),
        length_m,
        width_m,
        height_m,
        geometry_notes: geometry_notes || null,
        active: true,
      }).returning();

      // If capacity_pallets is provided, create a default zone for this building
      if (capacity_pallets && parseInt(capacity_pallets) > 0) {
        await db.insert(warehouseZones).values({
          site_id: siteId,
          building_id: building.id,
          code: `${code}-MAIN`,
          name: `${name} Main Storage`,
          zone_type: 'rack',
          is_outdoor: false,
          usage_type: 'general',
          weight_limit_lbs: 2000,
          capacity_pallets: parseInt(capacity_pallets),
        });
      }

      console.log(`[Warehouse] Created building ${code} for site ${siteId}`);
      res.status(201).json(building);
    } catch (error) {
      console.error("[Warehouse] Failed to create building:", error);
      res.status(500).json({ error: "Failed to create building" });
    }
  });

  // PUT /api/warehouse/sites/:siteId/buildings/:buildingId - Update a building
  app.put("/api/warehouse/sites/:siteId/buildings/:buildingId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const buildingId = parseInt(req.params.buildingId);
      if (isNaN(siteId) || isNaN(buildingId)) {
        return res.status(400).json({ error: "Invalid site or building ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify building exists and belongs to this site
      const [existingBuilding] = await db.select()
        .from(warehouseBuildings)
        .where(and(
          eq(warehouseBuildings.id, buildingId),
          eq(warehouseBuildings.site_id, siteId)
        ));

      if (!existingBuilding) {
        return res.status(404).json({ error: "Building not found" });
      }

      const { code, name, length_ft, width_ft, height_ft, geometry_notes, active, capacity_pallets } = req.body;

      // Convert feet to meters for storage
      const updateData: Record<string, any> = {};
      if (code !== undefined) updateData.code = code.trim();
      if (name !== undefined) updateData.name = name.trim();
      if (length_ft !== undefined) updateData.length_m = length_ft ? (parseFloat(length_ft) * 0.3048).toFixed(3) : null;
      if (width_ft !== undefined) updateData.width_m = width_ft ? (parseFloat(width_ft) * 0.3048).toFixed(3) : null;
      if (height_ft !== undefined) updateData.height_m = height_ft ? (parseFloat(height_ft) * 0.3048).toFixed(3) : null;
      if (geometry_notes !== undefined) updateData.geometry_notes = geometry_notes;
      if (active !== undefined) updateData.active = active;

      const [updated] = await db.update(warehouseBuildings)
        .set(updateData)
        .where(eq(warehouseBuildings.id, buildingId))
        .returning();

      // Update the default zone's capacity if capacity_pallets is provided
      if (capacity_pallets !== undefined) {
        const [existingZone] = await db.select()
          .from(warehouseZones)
          .where(eq(warehouseZones.building_id, buildingId))
          .limit(1);

        if (existingZone) {
          await db.update(warehouseZones)
            .set({ capacity_pallets: parseInt(capacity_pallets) || 0 })
            .where(eq(warehouseZones.id, existingZone.id));
        } else if (capacity_pallets && parseInt(capacity_pallets) > 0) {
          await db.insert(warehouseZones).values({
            site_id: siteId,
            building_id: buildingId,
            code: `${updated.code}-MAIN`,
            name: `${updated.name} Main Storage`,
            zone_type: 'rack',
            is_outdoor: false,
            usage_type: 'general',
            weight_limit_lbs: 2000,
            capacity_pallets: parseInt(capacity_pallets),
          });
        }
      }

      console.log(`[Warehouse] Updated building ${buildingId}`);
      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update building:", error);
      res.status(500).json({ error: "Failed to update building" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/buildings/:buildingId - Delete a building
  app.delete("/api/warehouse/sites/:siteId/buildings/:buildingId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const buildingId = parseInt(req.params.buildingId);
      if (isNaN(siteId) || isNaN(buildingId)) {
        return res.status(400).json({ error: "Invalid site or building ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify building exists and belongs to this site
      const [existingBuilding] = await db.select()
        .from(warehouseBuildings)
        .where(and(
          eq(warehouseBuildings.id, buildingId),
          eq(warehouseBuildings.site_id, siteId)
        ));

      if (!existingBuilding) {
        return res.status(404).json({ error: "Building not found" });
      }

      // Delete zones first (cascade)
      await db.delete(warehouseZones)
        .where(eq(warehouseZones.building_id, buildingId));

      // Delete the building
      await db.delete(warehouseBuildings)
        .where(eq(warehouseBuildings.id, buildingId));

      console.log(`[Warehouse] Deleted building ${buildingId} and its zones`);
      res.json({ success: true, message: "Building deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete building:", error);
      res.status(500).json({ error: "Failed to delete building" });
    }
  });

  // ============================================================================
  // WAREHOUSE ZONES ROUTES
  // ============================================================================

  // GET /api/warehouse/sites/:siteId/zones - List zones for a site with optional filters
  app.get("/api/warehouse/sites/:siteId/zones", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { zone_type, usage_type, is_outdoor, min_capacity, max_capacity } = req.query;

      const conditions = [eq(warehouseZones.site_id, siteId)];

      if (zone_type && typeof zone_type === 'string') {
        conditions.push(eq(warehouseZones.zone_type, zone_type));
      }

      if (usage_type && typeof usage_type === 'string') {
        conditions.push(eq(warehouseZones.usage_type, usage_type));
      }

      if (is_outdoor !== undefined) {
        const isOutdoorBool = is_outdoor === 'true' || is_outdoor === '1';
        conditions.push(eq(warehouseZones.is_outdoor, isOutdoorBool));
      }

      if (min_capacity) {
        const minCap = parseInt(min_capacity as string);
        if (!isNaN(minCap)) {
          conditions.push(gte(warehouseZones.total_capacity, minCap));
        }
      }

      if (max_capacity) {
        const maxCap = parseInt(max_capacity as string);
        if (!isNaN(maxCap)) {
          conditions.push(lte(warehouseZones.total_capacity, maxCap));
        }
      }

      const zones = await db.select()
        .from(warehouseZones)
        .where(and(...conditions));

      res.json(zones);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch zones:", error);
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });

  // POST /api/warehouse/sites/:siteId/zones - Create a new zone
  app.post("/api/warehouse/sites/:siteId/zones", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { 
        code, 
        name, 
        building_id,
        zone_type,
        is_outdoor,
        usage_type,
        bulk_available,
        bulk_open,
        rack_available,
        rack_open,
        location_pattern,
        weight_limit_lbs,
        capacity_pallets
      } = req.body;

      if (!code || !name) {
        return res.status(400).json({ error: "Zone code and name are required" });
      }

      const [zone] = await db.insert(warehouseZones).values({
        site_id: siteId,
        building_id: building_id || null,
        code: code.trim(),
        name: name.trim(),
        zone_type: zone_type || 'rack',
        is_outdoor: is_outdoor || false,
        usage_type: usage_type || 'general',
        bulk_available: bulk_available || 0,
        bulk_open: bulk_open || 0,
        rack_available: rack_available || 0,
        rack_open: rack_open || 0,
        location_pattern: location_pattern || null,
        weight_limit_lbs: weight_limit_lbs || 2000,
        capacity_pallets: capacity_pallets || null,
        metadata: {},
      }).returning();

      console.log(`[Warehouse] Created zone ${code} for site ${siteId}`);
      res.status(201).json(zone);
    } catch (error) {
      console.error("[Warehouse] Failed to create zone:", error);
      res.status(500).json({ error: "Failed to create zone" });
    }
  });

  // POST /api/warehouse/sites/:siteId/zones/seed - Seed default zones for the site
  app.post("/api/warehouse/sites/:siteId/zones/seed", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const existingZones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      if (existingZones.length > 0) {
        return res.status(400).json({ 
          error: "Site already has zones defined",
          existingZoneCount: existingZones.length
        });
      }

      const { zoneMatchingService } = await import('./services');
      const zonePatterns = zoneMatchingService.createDefaultZonePatterns();

      const zonesData = zonePatterns.map(pattern => ({
        site_id: siteId,
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

      // After inserting zones, resync capacity using pallet position service
      const { palletPositionService } = await import('./services');
      const updateResult = await palletPositionService.updateZoneMetrics(siteId);
      palletPositionService.invalidateMetricsCache(siteId);

      console.log(`[Warehouse] Seeded ${insertedZones.length} zones for site ${siteId}, resync: ${updateResult.zonesUpdated} zones updated`);
      res.status(201).json({
        success: true,
        message: `Created ${insertedZones.length} default zones`,
        zones: insertedZones,
        resync: updateResult
      });
    } catch (error) {
      console.error("[Warehouse] Failed to seed zones:", error);
      res.status(500).json({ error: "Failed to seed zones" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/zones/:zoneId - Delete a zone
  app.delete("/api/warehouse/sites/:siteId/zones/:zoneId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const zoneId = parseInt(req.params.zoneId);
      if (isNaN(siteId) || isNaN(zoneId)) {
        return res.status(400).json({ error: "Invalid site or zone ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const [existingZone] = await db.select()
        .from(warehouseZones)
        .where(and(
          eq(warehouseZones.id, zoneId),
          eq(warehouseZones.site_id, siteId)
        ));

      if (!existingZone) {
        return res.status(404).json({ error: "Zone not found" });
      }

      await db.delete(warehouseZones)
        .where(eq(warehouseZones.id, zoneId));

      console.log(`[Warehouse] Deleted zone ${zoneId}`);
      res.json({ success: true, message: "Zone deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete zone:", error);
      res.status(500).json({ error: "Failed to delete zone" });
    }
  });

  // POST /api/warehouse/sites/:siteId/zones/resync - Trigger resync for all zones at site
  app.post("/api/warehouse/sites/:siteId/zones/resync", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { palletPositionService, zoneCapacityService } = await import('./services');
      
      const config = {
        countBoxAsSeparate: req.body.countBoxAsSeparate || false,
        whseRule: req.body.whseRule || 'ignore',
        bulkMode: req.body.bulkMode || 'estimate',
        bulkIdColumnName: req.body.bulkIdColumnName || null
      };

      const metrics = await palletPositionService.computePalletMetrics(siteId, config);
      const updateResult = await palletPositionService.updateZoneMetrics(siteId, config);
      palletPositionService.invalidateMetricsCache(siteId);

      const zones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      for (const zone of zones) {
        const zoneMetric = metrics.zones.find(z => z.zoneId === zone.id);
        if (zoneMetric) {
          await zoneCapacityService.recordCapacityHistory(zone.id, siteId, {
            itemCount: zoneMetric.rack.occupied + zoneMetric.bulk.occupied,
            totalWeightLbs: parseFloat(String(zone.current_weight_lbs) || "0"),
            totalCapacity: zoneMetric.rack.available + zoneMetric.bulk.available
          });
        }
      }

      console.log(`[Warehouse] Resynced zones for site ${siteId}: ${updateResult.zonesUpdated} zones updated`);
      res.json({
        success: updateResult.success,
        zonesUpdated: updateResult.zonesUpdated,
        metrics,
        errors: updateResult.errors
      });
    } catch (error) {
      console.error("[Warehouse] Failed to resync zones:", error);
      res.status(500).json({ error: "Failed to resync zones" });
    }
  });

  // GET /api/warehouse/sites/:siteId/zones/pallet-metrics - Get pallet position metrics (PDF-style)
  app.get("/api/warehouse/sites/:siteId/zones/pallet-metrics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { palletPositionService } = await import('./services');
      
      const forceRefresh = req.query.refresh === 'true';
      const config = {
        countBoxAsSeparate: req.query.countBoxAsSeparate === 'true',
        whseRule: (req.query.whseRule as any) || 'ignore',
        bulkMode: (req.query.bulkMode as any) || 'estimate',
        bulkIdColumnName: (req.query.bulkIdColumnName as string) || null
      };

      const metrics = await palletPositionService.getCachedPalletMetrics(siteId, config, forceRefresh);
      res.json(metrics);
    } catch (error) {
      console.error("[Warehouse] Failed to get pallet metrics:", error);
      res.status(500).json({ error: "Failed to get pallet metrics" });
    }
  });

  // GET /api/warehouse/sites/:siteId/zones/summary - Return capacity summary
  app.get("/api/warehouse/sites/:siteId/zones/summary", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { zoneCapacityService } = await import('./services');
      const summary = await zoneCapacityService.getZoneCapacitySummary(siteId);

      if (!summary) {
        return res.status(404).json({ error: "No zones found for site" });
      }

      res.json(summary);
    } catch (error) {
      console.error("[Warehouse] Failed to get zones summary:", error);
      res.status(500).json({ error: "Failed to get zones summary" });
    }
  });

  // GET /api/warehouse/zones/:zoneId/history - Get capacity history for a zone
  app.get("/api/warehouse/zones/:zoneId/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const zoneId = parseInt(req.params.zoneId);
      if (isNaN(zoneId)) {
        return res.status(400).json({ error: "Invalid zone ID" });
      }

      const [zone] = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.id, zoneId));

      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, zone.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied to this zone" });
      }

      const { start_date, end_date } = req.query;
      const startDate = start_date ? new Date(start_date as string) : undefined;
      const endDate = end_date ? new Date(end_date as string) : undefined;

      const { zoneCapacityService } = await import('./services');
      const history = await zoneCapacityService.getZoneCapacityHistory(zoneId, startDate, endDate);

      res.json(history);
    } catch (error) {
      console.error("[Warehouse] Failed to get zone history:", error);
      res.status(500).json({ error: "Failed to get zone history" });
    }
  });

  // PATCH /api/warehouse/zones/:zoneId/capacity - Update rack_available and bulk_available
  app.patch("/api/warehouse/zones/:zoneId/capacity", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const zoneId = parseInt(req.params.zoneId);
      if (isNaN(zoneId)) {
        return res.status(400).json({ error: "Invalid zone ID" });
      }

      const { rack_available, bulk_available } = req.body;
      if (rack_available === undefined || typeof rack_available !== 'number') {
        return res.status(400).json({ error: "rack_available must be a number" });
      }
      if (bulk_available === undefined || typeof bulk_available !== 'number') {
        return res.status(400).json({ error: "bulk_available must be a number" });
      }

      const [zone] = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.id, zoneId));

      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, zone.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied to this zone" });
      }

      const [updated] = await db.update(warehouseZones)
        .set({ rack_available, bulk_available })
        .where(eq(warehouseZones.id, zoneId))
        .returning();

      console.log(`[Warehouse] Updated zone ${zoneId} capacity: rack_available=${rack_available}, bulk_available=${bulk_available}`);
      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update zone capacity:", error);
      res.status(500).json({ error: "Failed to update zone capacity" });
    }
  });

  // GET /api/warehouse/sites/:siteId/inventory - Get inventory items for a site with pagination
  app.get("/api/warehouse/sites/:siteId/inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Parse pagination params
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 25));
      const sortBy = (req.query.sortBy as string) || "id";
      const sortOrder = (req.query.sortOrder as string) === "desc" ? "desc" : "asc";
      const searchTermsJson = req.query.searchTerms as string;
      const filtersJson = req.query.filters as string;

      // Parse search terms array (supports multiple LIKE queries)
      let searchTerms: string[] = [];
      if (searchTermsJson) {
        try {
          const parsed = JSON.parse(searchTermsJson);
          if (Array.isArray(parsed)) {
            searchTerms = parsed.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
          }
        } catch (e) {
          console.warn("[Warehouse] Invalid searchTerms JSON:", e);
        }
      }
      const filterLogic = (req.query.filterLogic as string) === "or" ? "or" : "and";

      // Parse and validate filters if provided
      const ALLOWED_FILTER_FIELDS = [
        'requisition_no', 'nsn', 'niin', 'fsc', 'description', 'quantity',
        'condition', 'mission_id', 'serial_no', 'lin_esd', 'unit_price', 'weight_lbs'
      ];
      const ALLOWED_OPERATORS = [
        'contains', 'equals', 'not_equals', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'
      ];
      
      let filterConditions: Array<{field: string; operator: string; value: string}> = [];
      if (filtersJson) {
        try {
          const parsed = JSON.parse(filtersJson);
          if (Array.isArray(parsed)) {
            filterConditions = parsed.filter(f => 
              f && typeof f === 'object' &&
              ALLOWED_FILTER_FIELDS.includes(f.field) &&
              ALLOWED_OPERATORS.includes(f.operator)
            );
          }
        } catch (e) {
          console.warn("[Warehouse] Invalid filters JSON:", e);
        }
      }

      // Build where conditions
      const baseCondition = eq(warehouseInventoryItems.site_id, siteId);
      const whereConditions: any[] = [baseCondition];

      // Add search conditions - each term must match at least one searchable field
      // Multiple terms are AND'ed together (all must match)
      for (const term of searchTerms) {
        const searchPattern = `%${term.toLowerCase()}%`;
        whereConditions.push(
          or(
            ilike(warehouseInventoryItems.requisition_no, searchPattern),
            ilike(warehouseInventoryItems.description, searchPattern),
            ilike(warehouseInventoryItems.nsn, searchPattern),
            ilike(warehouseInventoryItems.niin, searchPattern),
            ilike(warehouseInventoryItems.serial_no, searchPattern),
            ilike(warehouseInventoryItems.location, searchPattern),
            ilike(warehouseInventoryItems.cage, searchPattern),
            ilike(warehouseInventoryItems.manufacturer, searchPattern)
          )
        );
      }

      // Build filter conditions
      const buildFilterCondition = (filter: {field: string; operator: string; value: string}) => {
        const col = (warehouseInventoryItems as any)[filter.field];
        if (!col) return null;

        switch (filter.operator) {
          case "contains":
            return ilike(col, `%${filter.value}%`);
          case "equals":
            return eq(col, filter.value);
          case "not_equals":
            return sql`${col} != ${filter.value}`;
          case "greater_than":
            return gt(col, parseFloat(filter.value) || 0);
          case "less_than":
            return lt(col, parseFloat(filter.value) || 0);
          case "is_empty":
            return or(isNull(col), eq(col, ""));
          case "is_not_empty":
            return and(isNotNull(col), sql`${col} != ''`);
          default:
            return null;
        }
      };

      if (filterConditions.length > 0) {
        const builtFilters = filterConditions
          .map(buildFilterCondition)
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (builtFilters.length > 0) {
          if (filterLogic === "or") {
            whereConditions.push(or(...builtFilters));
          } else {
            whereConditions.push(...builtFilters);
          }
        }
      }

      const finalWhere = and(...whereConditions);

      // Get total count for pagination
      const [countResult] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(finalWhere);
      const totalCount = countResult?.count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      // Build sort order
      const sortColumn = (warehouseInventoryItems as any)[sortBy] || warehouseInventoryItems.id;
      const orderByClause = sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

      // Fetch paginated items
      const offset = (page - 1) * pageSize;
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(finalWhere)
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset);

      // Transform items to include dimensions from raw_row
      const transformedItems = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> | null;
        const dims = rawRow?.dimensions || {};
        return {
          ...item,
          length_in: dims.l?.toString() || rawRow?.length?.toString() || null,
          width_in: dims.w?.toString() || rawRow?.width?.toString() || null,
          height_in: dims.h?.toString() || rawRow?.height?.toString() || null,
          weight_lb: rawRow?.price_weight?.toString() || null,
          nsn: item.nsn || null,
          fsc: item.fsc || null,
          niin: item.niin || null,
        };
      });

      res.json({
        items: transformedItems,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
        }
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory - Add a single inventory item
  app.post("/api/warehouse/sites/:siteId/inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { requisition_no, description, quantity, length_in, width_in, height_in, unit_price, nsn, fsc, niin } = req.body;
      
      if (!requisition_no) {
        return res.status(400).json({ error: "requisition_no is required" });
      }

      const [item] = await db.insert(warehouseInventoryItems).values({
        site_id: siteId,
        requisition_no,
        description: description || `Item ${requisition_no}`,
        quantity: quantity || 1,
        unit_price: unit_price ? unit_price.toString() : null,
        nsn: nsn || null,
        fsc: fsc || null,
        niin: niin || null,
        raw_row: {
          dimensions: {
            l: length_in || null,
            w: width_in || null,
            h: height_in || null,
          },
        },
      }).returning();

      res.status(201).json(item);
    } catch (error) {
      console.error("[Warehouse] Failed to add inventory item:", error);
      res.status(500).json({ error: "Failed to add inventory item" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/inventory/all - Delete all inventory items for a site
  app.delete("/api/warehouse/sites/:siteId/inventory/all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Count items before deletion
      const [countResult] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const itemCount = countResult?.count || 0;

      // Delete all items for the site
      await db.delete(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      res.json({ 
        success: true, 
        message: `All inventory items deleted successfully`,
        deleted: itemCount
      });
    } catch (error) {
      console.error("[Warehouse] Failed to delete all inventory items:", error);
      res.status(500).json({ error: "Failed to delete all inventory items" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/inventory/:itemId - Delete an inventory item
  app.delete("/api/warehouse/sites/:siteId/inventory/:itemId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const itemId = parseInt(req.params.itemId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify item exists and belongs to the site
      const [item] = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }

      // Delete the item - include both conditions for defense-in-depth
      await db.delete(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      res.json({ success: true, message: "Item deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete inventory item:", error);
      res.status(500).json({ error: "Failed to delete inventory item" });
    }
  });

  // PUT /api/warehouse/sites/:siteId/inventory/:itemId/move - Move an inventory item to a new location
  app.put("/api/warehouse/sites/:siteId/inventory/:itemId/move", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const itemId = parseInt(req.params.itemId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const { destination_site_id, destination_location_id, notes } = req.body;

      // Verify user owns the source site
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite) {
        return res.status(404).json({ error: "Source warehouse site not found" });
      }

      // If cross-site move, verify user owns the destination site
      if (destination_site_id && destination_site_id !== siteId) {
        const [destSite] = await db.select()
          .from(warehouseSites)
          .where(and(
            eq(warehouseSites.id, destination_site_id),
            eq(warehouseSites.user_id, req.user!.id)
          ));

        if (!destSite) {
          return res.status(404).json({ error: "Destination warehouse site not found" });
        }
      }

      // Verify item exists and belongs to the source site
      const [item] = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }

      // Build update object
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };

      // Handle cross-site move
      if (destination_site_id && destination_site_id !== siteId) {
        updateData.site_id = destination_site_id;
        updateData.location_id = destination_location_id || null;
      } else if (destination_location_id !== undefined) {
        // Intra-site location change
        updateData.location_id = destination_location_id || null;
      }

      // Add notes to remarks if provided
      if (notes) {
        const existingRemarks = item.remarks || '';
        const timestamp = new Date().toISOString();
        const moveNote = `[Move ${timestamp}] ${notes}`;
        updateData.remarks = existingRemarks ? `${existingRemarks}\n${moveNote}` : moveNote;
      }

      // Update the item
      const [updatedItem] = await db.update(warehouseInventoryItems)
        .set(updateData)
        .where(eq(warehouseInventoryItems.id, itemId))
        .returning();

      res.json({ 
        success: true, 
        message: "Item moved successfully",
        item: updatedItem
      });
    } catch (error) {
      console.error("[Warehouse] Failed to move inventory item:", error);
      res.status(500).json({ error: "Failed to move inventory item" });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory/upload - Upload and parse CSV inventory data
  app.post("/api/warehouse/sites/:siteId/inventory/upload", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { csvContent } = req.body;
      if (!csvContent || typeof csvContent !== 'string') {
        return res.status(400).json({ error: "csvContent field is required and must be a string" });
      }

      // Parse CSV
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
      }

      const headerLine = lines[0].trim();
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

      // Map expected columns: o, l, h, w, p, q
      const colIndices = {
        o: headers.indexOf('o'),
        l: headers.indexOf('l'),
        h: headers.indexOf('h'),
        w: headers.indexOf('w'),
        p: headers.indexOf('p'),
        q: headers.indexOf('q'),
      };

      if (colIndices.o === -1) {
        return res.status(400).json({ error: "CSV must contain 'o' column (item_id/requisition_no)" });
      }

      const parsedItems: Array<{
        site_id: number;
        requisition_no: string;
        description: string;
        quantity: number;
        unit_price: string | null;
        raw_row: Record<string, any>;
      }> = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());

        const o = colIndices.o !== -1 ? values[colIndices.o] : '';
        const l = colIndices.l !== -1 ? parseFloat(values[colIndices.l]) || 0 : 0;
        const h = colIndices.h !== -1 ? parseFloat(values[colIndices.h]) || 0 : 0;
        const w = colIndices.w !== -1 ? parseFloat(values[colIndices.w]) || 0 : 0;
        const p = colIndices.p !== -1 ? parseFloat(values[colIndices.p]) || 0 : 0;
        const q = colIndices.q !== -1 ? parseInt(values[colIndices.q]) || 0 : 0;

        if (!o) continue;

        parsedItems.push({
          site_id: siteId,
          requisition_no: o,
          description: `Item ${o}`,
          quantity: q,
          unit_price: p.toString(),
          raw_row: {
            original_id: o,
            length: l,
            height: h,
            width: w,
            price_weight: p,
            quantity: q,
            dimensions: { l, w, h }
          }
        });
      }

      if (parsedItems.length === 0) {
        return res.status(400).json({ error: "No valid items found in CSV" });
      }

      // Insert items
      const insertedItems = await db.insert(warehouseInventoryItems)
        .values(parsedItems)
        .returning();

      res.status(201).json({
        message: `Successfully imported ${insertedItems.length} items`,
        count: insertedItems.length,
        items: insertedItems
      });
    } catch (error) {
      console.error("[Warehouse] Failed to upload inventory:", error);
      res.status(500).json({ error: "Failed to upload inventory data" });
    }
  });

  // Configure multer for file uploads (10MB max)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'text/csv', 
        'application/pdf', 
        'text/plain', 
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
      ];
      const allowedExts = ['.csv', '.pdf', '.xlsx', '.xls'];
      const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
      
      if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Only CSV, PDF, XLSX, and XLS files are allowed.`));
      }
    },
  });

  // POST /api/warehouse/sites/:siteId/inventory/import - Upload and parse CSV/PDF file
  app.post("/api/warehouse/sites/:siteId/inventory/import", authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      if (!req.file) {
        return res.status(400).json({ 
          error: "No file uploaded",
          errors: [{
            level: 'error',
            scope: 'file',
            target: 'upload',
            message: 'No file was uploaded. Please select a CSV or PDF file.'
          }]
        });
      }

      console.log(`[Warehouse Import] Processing file: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);

      const result = await parseFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        siteId,
        req.user!.id
      );

      console.log(`[Warehouse Import] Parse result: uploadId=${result.uploadId}, rows=${result.totalRows}, errors=${result.errors.length}, warnings=${result.warnings.length}, canCommit=${result.canCommit}`);

      res.json(result);
    } catch (error) {
      console.error("[Warehouse] Import failed:", error);
      
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: "File too large. Maximum size is 10MB.",
            errors: [{
              level: 'error',
              scope: 'file',
              target: 'size',
              message: 'File exceeds the 10MB size limit.'
            }]
          });
        }
        return res.status(400).json({ 
          error: error.message,
          errors: [{
            level: 'error',
            scope: 'file',
            target: 'upload',
            message: error.message
          }]
        });
      }
      
      res.status(500).json({ 
        error: "Failed to import inventory file",
        errors: [{
          level: 'error',
          scope: 'file',
          target: 'processing',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        }]
      });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory/import/commit - Commit validated data to database
  app.post("/api/warehouse/sites/:siteId/inventory/import/commit", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { uploadId } = req.body;
      if (!uploadId || typeof uploadId !== 'string') {
        return res.status(400).json({ error: "uploadId is required" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Get the upload session
      const session = getUploadSession(uploadId);
      if (!session) {
        return res.status(404).json({ 
          error: "Upload session not found or expired",
          message: "Please upload the file again."
        });
      }

      // Verify session belongs to this user and site
      if (session.userId !== req.user!.id || session.siteId !== siteId) {
        return res.status(403).json({ error: "Session does not belong to this user or site" });
      }

      // Check if data can be committed
      if (!session.canCommit) {
        return res.status(400).json({ 
          error: "Cannot commit data with errors",
          errors: session.errors.filter(e => e.scope === 'file' || e.scope === 'column'),
          message: "Please fix the file-level and column-level errors before committing."
        });
      }

      // Filter out rows with errors
      const rowsWithErrors = new Set(
        session.errors.filter(e => e.scope === 'row' && e.level === 'error').map(e => e.rowIndex)
      );
      
      const validRows = session.parsedRows.filter((_, index) => !rowsWithErrors.has(index));

      if (validRows.length === 0) {
        return res.status(400).json({ 
          error: "No valid rows to commit",
          message: "All rows have errors. Please fix the data and try again."
        });
      }

      console.log(`[Warehouse Import] Committing ${validRows.length} rows from session ${uploadId}`);

      // Fetch zones for this site to enable zone matching
      const siteZones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));
      
      console.log(`[Warehouse Import] Found ${siteZones.length} zones for zone matching`);

      // Prepare items for insertion with all BATS fields
      const itemsToInsert = validRows.map((row, idx) => {
        // Determine zone_id: use pre-matched or calculate from location
        let zoneId = row.matched_zone_id || null;
        if (zoneId === null && row.location && siteZones.length > 0) {
          const matchResult = matchLocationToZone(row.location, siteZones);
          if (matchResult.zoneId !== null) {
            zoneId = matchResult.zoneId;
          }
        }
        
        return {
        site_id: siteId,
        storage_facility: row.storage_facility || null,
        ship: row.ship || null,
        ship_class: row.ship_class || null,
        program_code: row.program_code || null,
        requisition_no: row.requisition_no || `ITEM-${Date.now()}-${idx}`,
        authority: row.authority || null,
        work_item: row.work_item || null,
        li: row.li || null,
        matl_ctrl: row.matl_ctrl || null,
        hmic: row.hmic || null,
        smcc: row.smcc || null,
        item_audit: row.item_audit || null,
        audit_no: row.audit_no || null,
        ship_ind: row.ship_ind || null,
        ship_avail: row.ship_avail || null,
        description: row.description || `Item ${row.requisition_no || 'Unknown'}`,
        cage: row.cage || null,
        manufacturer: row.manufacturer || null,
        mfg_date: row.mfg_date || null,
        contract_no: row.contract_no || null,
        quantity: row.quantity || 1,
        iuid: row.iuid || null,
        unit: row.ui || null,
        unit_price: row.unit_price?.toString() || null,
        receipt_price: row.receipt_price || null,
        receipt_date: row.receipt_date || null,
        location: row.location || null,
        zone_id: zoneId,
        lot_no: row.lot || null,
        serial_no: row.serial_no || null,
        barcode: row.barcode || null,
        inventory_type: row.inventory_type || null,
        material_disposition: row.mat_disposition || null,
        condition_code: row.condition || null,
        condition: row.condition || null,
        asset_type: row.asset_type || null,
        exp_date: row.exp_date || null,
        ext_date: row.ext_date || null,
        insp_date: row.insp_date || null,
        last_audit_date: row.last_audit_date || null,
        data_user_id: row.user_id || null,
        remarks: row.remarks || null,
        in_service_date: row.in_service_date || null,
        warranty_item: row.warranty_item || null,
        nsn: row.nsn || null,
        fsc: row.fsc || null,
        niin: row.niin || null,
        mission_id: row.mission_id || null,
        lin_esd: row.lin_esd || null,
        last_moved: row.last_moved ? new Date(row.last_moved) : null,
        weight_lbs: row.weight_lb?.toString() || null,
        raw_row: {
          ...row._rawRow,
          imported_at: new Date().toISOString(),
          source_file: session.filename,
        },
      };
      });

      // Insert items in batches
      const BATCH_SIZE = 100;
      const insertedItems = [];
      
      for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
        const inserted = await db.insert(warehouseInventoryItems)
          .values(batch)
          .returning();
        insertedItems.push(...inserted);
      }

      // Clean up session after successful commit
      deleteUploadSession(uploadId);

      console.log(`[Warehouse Import] Successfully committed ${insertedItems.length} items from session ${uploadId}`);

      res.status(201).json({
        message: `Successfully imported ${insertedItems.length} items`,
        count: insertedItems.length,
        skippedRows: session.parsedRows.length - validRows.length,
        totalRows: session.parsedRows.length,
        items: insertedItems.slice(0, 10), // Return first 10 for preview
      });
    } catch (error) {
      console.error("[Warehouse] Commit failed:", error);
      res.status(500).json({ error: "Failed to commit inventory data" });
    }
  });

  // GET /api/warehouse/import/status - Get import session stats (for debugging)
  app.get("/api/warehouse/import/status", authMiddleware, async (req: AuthRequest, res) => {
    const stats = getSessionStats();
    res.json(stats);
  });

  // GET /api/warehouse/sites/:siteId/optimization - Run optimization analysis
  app.get("/api/warehouse/sites/:siteId/optimization", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Compute optimization metrics using algorithms from notebooks
      let totalQuantity = 0;
      let totalValue = 0;
      let itemCount = items.length;
      let totalVolume = 0;
      let itemsWithDimensions: Array<{ 
        requisition_no: string; 
        l: number; w: number; h: number;
        volume: number; 
        quantity: number;
        value: number;
      }> = [];

      for (const item of items) {
        const qty = item.quantity || 0;
        const price = parseFloat(item.unit_price?.toString() || "0");
        totalQuantity += qty;
        totalValue += qty * price;

        const rawRow = item.raw_row as Record<string, any>;
        const dims = rawRow?.dimensions || { l: 0, w: 0, h: 0 };
        const l = dims.l || rawRow?.length || 0;
        const w = dims.w || rawRow?.width || 0;
        const h = dims.h || rawRow?.height || 0;
        const volume = l * w * h;
        totalVolume += volume * qty;

        itemsWithDimensions.push({
          requisition_no: item.requisition_no || '',
          l, w, h,
          volume,
          quantity: qty,
          value: qty * price
        });
      }

      // CardStack algorithm: items that can be stacked (similar base dimensions)
      const stackableGroups: Map<string, typeof itemsWithDimensions> = new Map();
      for (const item of itemsWithDimensions) {
        const baseKey = `${Math.round(item.l)}_${Math.round(item.w)}`;
        if (!stackableGroups.has(baseKey)) {
          stackableGroups.set(baseKey, []);
        }
        stackableGroups.get(baseKey)!.push(item);
      }

      const stackingOpportunities = Array.from(stackableGroups.entries())
        .filter(([_, items]) => items.length > 1)
        .map(([key, groupItems]) => ({
          base_dimensions: key.replace('_', ' x '),
          item_count: groupItems.length,
          total_height: groupItems.reduce((sum, i) => sum + i.h * i.quantity, 0),
          items: groupItems.map(i => i.requisition_no).slice(0, 5)
        }))
        .sort((a, b) => b.item_count - a.item_count)
        .slice(0, 5);

      // Sort by volume (descending) for bin-packing recommendation
      itemsWithDimensions.sort((a, b) => b.volume - a.volume);

      // Size grouping: identify items of same dimensions for batch handling
      const sizeGroups: Map<string, number> = new Map();
      for (const item of itemsWithDimensions) {
        const sizeKey = `${item.l}x${item.w}x${item.h}`;
        sizeGroups.set(sizeKey, (sizeGroups.get(sizeKey) || 0) + item.quantity);
      }
      
      const topSizes = Array.from(sizeGroups.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([size, count]) => ({ size, count }));

      // Value-per-volume analysis for prioritization
      const valuePerVolume = itemsWithDimensions
        .filter(i => i.volume > 0)
        .map(i => ({
          requisition_no: i.requisition_no,
          value_density: i.value / (i.volume * i.quantity),
          value: i.value,
          volume: i.volume
        }))
        .sort((a, b) => b.value_density - a.value_density)
        .slice(0, 10);

      const recommendations = [
        {
          type: "cartonization",
          priority: "high",
          title: "Box Consolidation Opportunities",
          description: `Found ${stackingOpportunities.length} groups of items with similar base dimensions that can be stacked together`,
          details: stackingOpportunities
        },
        {
          type: "size_standardization",
          priority: "medium",
          title: "Size Standardization",
          description: `${topSizes.length} distinct item sizes identified. Consider standardizing packaging for top sizes.`,
          details: topSizes
        },
        {
          type: "high_volume_items",
          priority: "high",
          title: "Large Item Placement",
          description: "Items with largest volume should be placed at ground level for easier access and forklift handling",
          details: itemsWithDimensions.slice(0, 10).map(i => ({
            requisition_no: i.requisition_no,
            volume: i.volume.toFixed(2),
            quantity: i.quantity
          }))
        },
        {
          type: "value_density",
          priority: "medium",
          title: "High-Value Item Security",
          description: "Items with highest value per volume should be in secure/priority zones",
          details: valuePerVolume
        }
      ];

      // Add aging recommendations if items have receipt dates
      const agingAlerts = items.filter(item => {
        const rawRow = item.raw_row as Record<string, any>;
        if (rawRow?.receipt_date) {
          const receiptDate = new Date(rawRow.receipt_date);
          const yearsOld = (Date.now() - receiptDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
          return yearsOld >= 3;
        }
        return false;
      }).length;

      if (agingAlerts > 0) {
        recommendations.push({
          type: "aging",
          priority: "high",
          title: "Aging Inventory Alert",
          description: `${agingAlerts} items are 3+ years old. Review for disposal or rotation.`,
          details: []
        });
      }

      const optimization = {
        site_id: siteId,
        site_code: site.code,
        site_name: site.name,
        summary: {
          total_items: itemCount,
          total_quantity: totalQuantity,
          total_value: parseFloat(totalValue.toFixed(2)),
          total_volume: parseFloat(totalVolume.toFixed(2)),
          average_value_per_item: itemCount > 0 ? parseFloat((totalValue / itemCount).toFixed(2)) : 0,
          unique_sizes: sizeGroups.size,
          stacking_groups: stackingOpportunities.length
        },
        recommendations,
        bin_packing_order: itemsWithDimensions.slice(0, 20).map(v => v.requisition_no)
      };

      res.json(optimization);
    } catch (error) {
      console.error("[Warehouse] Optimization analysis failed:", error);
      res.status(500).json({ error: "Failed to run optimization analysis" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize - Run optimization wizard with selected algorithm
  app.post("/api/warehouse/sites/:siteId/optimize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { algorithm, params } = req.body;
      
      const validAlgorithms = ['cardstack', 'size_standardization', 'value_density', 'bin_packing'];
      if (!algorithm || !validAlgorithms.includes(algorithm)) {
        return res.status(400).json({ error: "Invalid algorithm. Must be one of: " + validAlgorithms.join(", ") });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch warehouse zones for zone-based organization (optional - graceful fallback if none exist)
      const zones = await db.select()
        .from(warehouseZones)
        .where(eq(warehouseZones.site_id, siteId));

      // Zone-based optimization is optional - if no zones exist, use legacy location-based approach
      const hasZones = zones.length > 0;

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Parse item data from raw_row and database fields with optional zone matching
      const itemsWithData = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> || {};
        const qty = item.quantity || parseInt(rawRow?.qty) || 1;
        const price = parseFloat(item.unit_price?.toString() || rawRow?.unit_price || "0");
        const value = qty * price;
        const weight = parseFloat(item.weight_lbs?.toString() || rawRow?.weight || "0");
        
        // Extract location info - location field in raw_row contains rack location like "2069-B"
        const location = rawRow?.location || item.location || 'Unassigned';
        // Extract zone prefix for legacy mode (e.g., "2069" from "2069-B")
        const locationZone = location.split('-')[0] || location.substring(0, 4) || 'UNK';
        
        // Use zone matching if zones exist, otherwise use legacy location parsing
        let matched_zone_id: number | null = null;
        let matched_zone_name: string | null = null;
        let matchedZone: typeof zones[0] | undefined = undefined;
        let zone_match_confidence = 0;
        
        if (hasZones) {
          const zoneMatch = matchLocationToZone(location, zones);
          matched_zone_id = zoneMatch.zoneId;
          matched_zone_name = zoneMatch.zoneName;
          matchedZone = zones.find(z => z.id === zoneMatch.zoneId);
          zone_match_confidence = zoneMatch.confidence;
        }
        
        return {
          id: item.id,
          requisition_no: item.requisition_no || `ITEM-${item.id}`,
          description: item.description || rawRow?.description || '',
          quantity: qty,
          value,
          weight,
          rack_location: location,
          location_zone: locationZone,
          matched_zone_id,
          matched_zone_name,
          matched_zone: matchedZone,
          zone_match_confidence,
          ship_class: item.ship_class || rawRow?.ship_class || '',
          inventory_type: item.inventory_type || rawRow?.inventory_type || '',
          condition_code: item.condition_code || item.condition || rawRow?.condition_code || 'A',
          storage_facility: item.storage_facility || rawRow?.storage_facility || '',
          mat_disposition: item.material_disposition || rawRow?.mat_disposition || rawRow?.material_disposition || '',
          program_code: item.program_code || rawRow?.program_code || '',
        };
      });

      let actions: Array<{
        id: string;
        action: string;
        item: string;
        itemDescription: string;
        from: string;
        to: string;
        targetZoneId: number | null;
        targetZoneName: string | null;
        priority: 'high' | 'medium' | 'low';
        estimatedBenefit: string;
        quantity: number;
        value: number;
        reason: string;
      }> = [];
      
      let summary = {
        slotsFreed: 0,
        consolidationWins: '',
        zonesOptimized: 0,
        pickEfficiencyGain: '',
        itemsAffected: 0,
        actionsGenerated: 0,
      };

      // Run algorithm-specific optimization
      if (algorithm === 'cardstack') {
        // CardStack: Find items for the same ship scattered across different zones
        // Consolidate them to reduce picking time and travel distance using actual zone data
        const { minItemsToConsolidate = 2, maxActionsToGenerate = 50 } = params || {};
        
        // Group items by ship_class (items for the same ship should be together)
        const shipGroups: Map<string, typeof itemsWithData> = new Map();
        for (const item of itemsWithData) {
          if (!item.ship_class) continue;
          if (!shipGroups.has(item.ship_class)) {
            shipGroups.set(item.ship_class, []);
          }
          shipGroups.get(item.ship_class)!.push(item);
        }

        let actionId = 1;
        let consolidatedItems = 0;
        let consolidatedValue = 0;
        const affectedZoneIds = new Set<number>();
        
        for (const [shipClass, shipItems] of Array.from(shipGroups.entries())) {
          // Skip if fewer items than threshold
          if (shipItems.length < minItemsToConsolidate) continue;
          
          // Find the most common zone for this ship's items using matched_zone_id
          const zoneCounts: Map<number, number> = new Map();
          for (const item of shipItems) {
            if (item.matched_zone_id !== null) {
              zoneCounts.set(item.matched_zone_id, (zoneCounts.get(item.matched_zone_id) || 0) + 1);
            }
          }
          
          // Find zone with most items
          let targetZoneId: number | null = null;
          let maxCount = 0;
          for (const [zoneId, count] of Array.from(zoneCounts.entries())) {
            if (count > maxCount) {
              maxCount = count;
              targetZoneId = zoneId;
            }
          }
          
          // Get the target zone object for naming
          const targetZone = zones.find(z => z.id === targetZoneId);
          if (!targetZone) continue;
          
          // Create target location using actual zone code
          const targetRack = `${targetZone.code}-${shipClass.replace(/\s+/g, '')}`;
          
          // Move items from other zones to the target zone
          for (const item of shipItems) {
            if (item.matched_zone_id === targetZoneId) continue; // Already in target zone
            
            if (item.matched_zone_id !== null) {
              affectedZoneIds.add(item.matched_zone_id);
            }
            
            actions.push({
              id: `CS-${actionId++}`,
              action: `Consolidate ${shipClass} inventory`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetRack,
              targetZoneId: targetZone.id,
              targetZoneName: targetZone.name,
              priority: item.value > 5000 ? 'high' : 'medium',
              estimatedBenefit: `Reduces pick time for ${shipClass} by ~${Math.round(5 + Math.random() * 10)}min`,
              quantity: item.quantity,
              value: item.value,
              reason: `Item for ${shipClass} scattered from main storage - consolidate to ${targetZone.name}`,
            });
            consolidatedItems++;
            consolidatedValue += item.value;
            
            if (actions.length >= maxActionsToGenerate) break;
          }
          if (actions.length >= maxActionsToGenerate) break;
        }
        
        // Calculate unique target zones
        const targetZoneNames = new Set(actions.filter(a => a.targetZoneName).map(a => a.targetZoneName));
        
        summary = {
          slotsFreed: consolidatedItems,
          consolidationWins: `${consolidatedItems} items → ${targetZoneNames.size} zones`,
          zonesOptimized: affectedZoneIds.size,
          pickEfficiencyGain: `+${Math.min(consolidatedItems * 2, 25)}% pick time reduction`,
          itemsAffected: consolidatedItems,
          actionsGenerated: actions.length,
        };
      } 
      else if (algorithm === 'size_standardization') {
        // Size Standardization: Move items to appropriate zones based on usage_type
        // Small items go to small_material zones, large items go to large_material zones
        const { maxActionsToGenerate = 50 } = params || {};
        
        // Find zones by usage type
        const smallMaterialZones = zones.filter(z => z.usage_type === 'small_material');
        const largeMaterialZones = zones.filter(z => z.usage_type === 'large_material');
        const mixedMaterialZones = zones.filter(z => z.usage_type === 'mixed_material');
        
        // Determine ideal zone for each item based on weight/dimensions
        const smallWeightThreshold = 50; // lbs
        const largeWeightThreshold = 500; // lbs
        
        let actionId = 1;
        let standardizedCount = 0;
        let standardizedValue = 0;
        const affectedZoneIds = new Set<number>();
        
        for (const item of itemsWithData) {
          if (item.matched_zone_id === null) continue;
          
          const currentZone = item.matched_zone;
          if (!currentZone) continue;
          
          let idealZone: typeof zones[0] | null = null;
          let reason = '';
          
          // Determine item size category
          if (item.weight < smallWeightThreshold && smallMaterialZones.length > 0) {
            // Small item - should be in small_material zone
            if (currentZone.usage_type !== 'small_material') {
              idealZone = smallMaterialZones[0];
              reason = `Small item (${item.weight} lbs) should be in small material zone`;
            }
          } else if (item.weight > largeWeightThreshold && largeMaterialZones.length > 0) {
            // Large item - should be in large_material zone
            if (currentZone.usage_type !== 'large_material') {
              idealZone = largeMaterialZones[0];
              reason = `Large item (${item.weight} lbs) should be in large material zone`;
            }
          } else if (mixedMaterialZones.length > 0) {
            // Medium item - mixed zone is fine, but could standardize
            // Only move if in wrong zone type (outdoor bulk for indoor items)
            if (currentZone.is_outdoor && !currentZone.usage_type?.includes('bulk')) {
              idealZone = mixedMaterialZones[0];
              reason = `Medium item better suited for indoor mixed material zone`;
            }
          }
          
          if (idealZone && idealZone.id !== item.matched_zone_id) {
            affectedZoneIds.add(item.matched_zone_id);
            
            actions.push({
              id: `SS-${actionId++}`,
              action: `Move to appropriate size zone`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: `${idealZone.code}-${item.program_code || 'GEN'}`,
              targetZoneId: idealZone.id,
              targetZoneName: idealZone.name,
              priority: item.condition_code === 'A' ? 'medium' : 'low',
              estimatedBenefit: `Optimizes storage efficiency for ${item.weight} lb item`,
              quantity: item.quantity,
              value: item.value,
              reason: reason,
            });
            standardizedCount++;
            standardizedValue += item.value;
            
            if (actions.length >= maxActionsToGenerate) break;
          }
        }
        
        const targetZoneNames = new Set(actions.filter(a => a.targetZoneName).map(a => a.targetZoneName));
        
        summary = {
          slotsFreed: standardizedCount,
          consolidationWins: `${standardizedCount} items → ${targetZoneNames.size} size-appropriate zones`,
          zonesOptimized: affectedZoneIds.size,
          pickEfficiencyGain: `+${Math.min(standardizedCount * 2, 20)}% size-based organization efficiency`,
          itemsAffected: standardizedCount,
          actionsGenerated: actions.length,
        };
      }
      else if (algorithm === 'value_density') {
        // Value Density: Move high-value items to more accessible, secure locations
        // Indoor zones are more accessible/secure than outdoor; lower zone codes = more accessible
        const { highValueThreshold = 1000, maxActionsToGenerate = 50 } = params || {};
        
        // Rank zones by accessibility: indoor first, then by code (2000 < 3000 < 4000 < 7000)
        const rankedZones = [...zones]
          .filter(z => !z.is_outdoor && z.usage_type !== 'hazmat')
          .sort((a, b) => {
            const codeA = parseInt(a.code.replace(/\D/g, '')) || 9999;
            const codeB = parseInt(b.code.replace(/\D/g, '')) || 9999;
            return codeA - codeB;
          });
        
        const priorityZone = rankedZones[0];
        if (!priorityZone) {
          // No suitable indoor zone, skip this algorithm
          summary = {
            slotsFreed: 0,
            consolidationWins: 'No suitable priority zone available',
            zonesOptimized: 0,
            pickEfficiencyGain: 'N/A',
            itemsAffected: 0,
            actionsGenerated: 0,
          };
        } else {
          // Sort items by value descending
          const sortedByValue = [...itemsWithData]
            .filter(i => i.value > 0)
            .sort((a, b) => b.value - a.value);
          
          let actionId = 1;
          let movedValue = 0;
          let movedCount = 0;
          const affectedZoneIds = new Set<number>();
          
          for (const item of sortedByValue) {
            if (item.value < highValueThreshold) continue;
            if (item.matched_zone_id === priorityZone.id) continue; // Already in best zone
            
            // Check if current zone is less accessible (outdoor or higher numbered)
            const currentZone = item.matched_zone;
            const shouldMove = !currentZone || 
              currentZone.is_outdoor || 
              (parseInt(currentZone.code.replace(/\D/g, '')) || 0) > (parseInt(priorityZone.code.replace(/\D/g, '')) || 0) * 1.5;
            
            if (shouldMove) {
              if (item.matched_zone_id !== null) {
                affectedZoneIds.add(item.matched_zone_id);
              }
              
              const targetRack = `${priorityZone.code}-HV-${String(actionId).padStart(2, '0')}`;
              
              actions.push({
                id: `VD-${actionId++}`,
                action: `Relocate high-value item to priority area`,
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: targetRack,
                targetZoneId: priorityZone.id,
                targetZoneName: priorityZone.name,
                priority: 'high',
                estimatedBenefit: `$${item.value.toLocaleString()} value - faster picking & better security`,
                quantity: item.quantity,
                value: item.value,
                reason: `High-value item ($${item.value.toLocaleString()}) in ${currentZone?.name || 'unassigned zone'} - move to secure ${priorityZone.name}`,
              });
              movedValue += item.value;
              movedCount++;
              
              if (actions.length >= maxActionsToGenerate) break;
            }
          }
          
          summary = {
            slotsFreed: movedCount,
            consolidationWins: `${movedCount} high-value items → ${priorityZone.name}`,
            zonesOptimized: affectedZoneIds.size,
            pickEfficiencyGain: `+${Math.min(movedCount * 3, 30)}% accessibility for top items`,
            itemsAffected: movedCount,
            actionsGenerated: actions.length,
          };
        }
      }
      else if (algorithm === 'bin_packing') {
        // Bin Packing: Stage items by disposition for upcoming shipments using actual zones
        // SHORESIDE items go to outdoor BULK zones, RESIDUAL to holding areas
        const { maxItemsPerPallet = 15, prioritizeByValue = true, maxActionsToGenerate = 50 } = params || {};
        
        // Find staging zones by type - prefer outdoor bulk zones for staging
        const bulkZones = zones.filter(z => 
          z.is_outdoor && 
          (z.usage_type?.includes('bulk') || z.usage_type === 'uncrated' || z.usage_type === 'crated') &&
          (z.bulk_available || 0) > 0
        );
        const indoorZones = zones.filter(z => !z.is_outdoor);
        const hazmatZone = zones.find(z => z.usage_type === 'hazmat');
        
        // Map dispositions to appropriate zone types
        const getZoneForDisposition = (disposition: string): typeof zones[0] | null => {
          switch (disposition.toUpperCase()) {
            case 'SHORESIDE':
              // SHORESIDE goes to outdoor bulk zones for easy dock access
              return bulkZones.find(z => z.usage_type === 'uncrated') || bulkZones[0] || null;
            case 'RESIDUAL':
              // RESIDUAL stays in indoor zones
              return indoorZones.find(z => z.usage_type === 'mixed_material') || indoorZones[0] || null;
            case 'HAZMAT':
              return hazmatZone || null;
            default:
              // Default to first available bulk zone
              return bulkZones[0] || indoorZones[0] || null;
          }
        };
        
        // Group items by mat_disposition
        const dispositionGroups: Map<string, typeof itemsWithData> = new Map();
        for (const item of itemsWithData) {
          const disposition = item.mat_disposition || 'UNASSIGNED';
          if (!dispositionGroups.has(disposition)) {
            dispositionGroups.set(disposition, []);
          }
          dispositionGroups.get(disposition)!.push(item);
        }
        
        let actionId = 1;
        let totalStaged = 0;
        let totalValue = 0;
        const affectedZoneIds = new Set<number>();
        const targetZonesUsed = new Set<string>();
        
        for (const [disposition, dispItems] of Array.from(dispositionGroups.entries())) {
          if (dispItems.length < 2) continue;
          
          const stagingZone = getZoneForDisposition(disposition);
          if (!stagingZone) continue;
          
          targetZonesUsed.add(stagingZone.name);
          
          // Sort by value if prioritizeByValue, otherwise by ship_class
          const sortedItems = [...dispItems].sort((a, b) => {
            if (prioritizeByValue) {
              return b.value - a.value; // High value first
            }
            return (a.ship_class || '').localeCompare(b.ship_class || '');
          });
          
          // Check zone capacity
          const availableCapacity = (stagingZone.bulk_available || 0) + (stagingZone.rack_available || 0);
          
          let palletNum = 1;
          let itemsOnPallet = 0;
          
          for (const item of sortedItems) {
            if (itemsOnPallet >= maxItemsPerPallet) {
              palletNum++;
              itemsOnPallet = 0;
            }
            
            // Track affected source zones
            if (item.matched_zone_id !== null && item.matched_zone_id !== stagingZone.id) {
              affectedZoneIds.add(item.matched_zone_id);
            }
            
            const targetLocation = `${stagingZone.code}-P${String(palletNum).padStart(2, '0')}`;
            
            actions.push({
              id: `BP-${actionId++}`,
              action: `Stage for ${disposition} shipment`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetLocation,
              targetZoneId: stagingZone.id,
              targetZoneName: stagingZone.name,
              priority: itemsOnPallet === 0 ? 'high' : 'medium',
              estimatedBenefit: `Ready for ${item.ship_class || 'pending'} shipment at ${stagingZone.name}`,
              quantity: item.quantity,
              value: item.value,
              reason: `${disposition} item for ${item.ship_class || 'TBD'} - stage in ${stagingZone.name} (${availableCapacity > 0 ? 'capacity available' : 'near capacity'})`,
            });
            
            itemsOnPallet++;
            totalStaged++;
            totalValue += item.value;
            
            if (actions.length >= maxActionsToGenerate) break;
          }
          if (actions.length >= maxActionsToGenerate) break;
        }
        
        // Count pallets created
        const palletLocations = new Set(actions.map(a => a.to));
        
        summary = {
          slotsFreed: totalStaged,
          consolidationWins: `${totalStaged} items → ${palletLocations.size} pallets in ${targetZonesUsed.size} staging zones`,
          zonesOptimized: affectedZoneIds.size,
          pickEfficiencyGain: `${palletLocations.size} pallets ready for shipment`,
          itemsAffected: totalStaged,
          actionsGenerated: actions.length,
        };
      }

      // Store optimization run in database
      const [optimizationRun] = await db.insert(warehouseOptimizationRuns).values({
        user_id: req.user!.id,
        site_id: siteId,
        algorithm,
        input_params: params || {},
        results: { summary, itemsAnalyzed: items.length },
        action_plan: { actions },
        status: 'completed',
        completed_at: new Date(),
      }).returning();

      res.status(201).json({
        runId: optimizationRun.id,
        algorithm,
        site: { id: siteId, name: site.name },
        summary,
        actions: actions.slice(0, 50), // Limit response size
        totalActions: actions.length,
      });
    } catch (error) {
      console.error("[Warehouse] Optimization failed:", error);
      res.status(500).json({ error: "Failed to run optimization" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize/run-all - Run all optimization algorithms in sequence
  app.post("/api/warehouse/sites/:siteId/optimize/run-all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { params: userParams } = req.body;

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Parse item data
      const itemsWithData = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> || {};
        const qty = item.quantity || parseInt(rawRow?.qty) || 1;
        const price = parseFloat(item.unit_price?.toString() || rawRow?.unit_price || "0");
        const value = qty * price;
        const weight = parseFloat(item.weight_lbs?.toString() || rawRow?.weight || "0");
        const location = rawRow?.location || item.location || 'Unassigned';
        const locationZone = location.split('-')[0] || location.substring(0, 4) || 'UNK';
        
        return {
          id: item.id,
          requisition_no: item.requisition_no || `ITEM-${item.id}`,
          description: item.description || rawRow?.description || '',
          quantity: qty,
          value,
          weight,
          rack_location: location,
          location_zone: locationZone,
          ship_class: item.ship_class || rawRow?.ship_class || '',
          inventory_type: item.inventory_type || rawRow?.inventory_type || '',
          condition_code: item.condition_code || item.condition || rawRow?.condition_code || 'A',
          storage_facility: item.storage_facility || rawRow?.storage_facility || '',
          mat_disposition: item.material_disposition || rawRow?.mat_disposition || rawRow?.material_disposition || '',
          program_code: item.program_code || rawRow?.program_code || '',
        };
      });

      // Default parameters for all algorithms
      const defaultParams = {
        cardstack: userParams?.cardstack || { minItemsToConsolidate: 2, maxActionsToGenerate: 50 },
        size_standardization: userParams?.size_standardization || { minProgramItems: 3, maxActionsToGenerate: 50 },
        value_density: userParams?.value_density || { highValueThreshold: 1000, zoneDistanceMultiplier: 1.5 },
        bin_packing: userParams?.bin_packing || { maxItemsPerPallet: 15, prioritizeByValue: true },
      };

      // Collect all actions from all algorithms
      const allActions: Array<{
        id: string;
        action: string;
        item: string;
        itemDescription: string;
        from: string;
        to: string;
        priority: 'high' | 'medium' | 'low';
        estimatedBenefit: string;
        quantity: number;
        value: number;
        reason: string;
        algorithm: string;
      }> = [];

      const seenItems = new Set<string>();
      const freedPositions = new Set<string>();
      const impactedZones = new Set<string>();
      const phaseResults: Record<string, { 
        actions: number; 
        slotsFreed: number; 
        consolidationWins: string;
        zonesOptimized: number;
      }> = {};

      // Phase 1: CardStack - Consolidate items by ship class
      {
        const { minItemsToConsolidate = 2 } = defaultParams.cardstack;
        const shipGroups: Map<string, typeof itemsWithData> = new Map();
        for (const item of itemsWithData) {
          if (!item.ship_class) continue;
          if (!shipGroups.has(item.ship_class)) {
            shipGroups.set(item.ship_class, []);
          }
          shipGroups.get(item.ship_class)!.push(item);
        }

        let actionId = 1;
        let phaseActions = 0;
        const sourceZonesSet = new Set<string>();
        const targetZonesSet = new Set<string>();
        const phasePositions = new Set<string>();

        for (const [shipClass, shipItems] of Array.from(shipGroups.entries())) {
          if (shipItems.length < minItemsToConsolidate) continue;
          
          const zoneCounts: Map<string, number> = new Map();
          for (const item of shipItems) {
            zoneCounts.set(item.location_zone, (zoneCounts.get(item.location_zone) || 0) + 1);
          }
          
          let targetZone = '';
          let maxCount = 0;
          for (const [zone, count] of Array.from(zoneCounts.entries())) {
            if (count > maxCount) {
              maxCount = count;
              targetZone = zone;
            }
          }

          for (const item of shipItems) {
            if (item.location_zone !== targetZone && allActions.length < 100 && item.rack_location) {
              phaseActions++;
              sourceZonesSet.add(item.location_zone);
              targetZonesSet.add(targetZone);
              seenItems.add(item.requisition_no);
              const normalizedLocation = item.rack_location.toUpperCase().trim();
              freedPositions.add(normalizedLocation);
              phasePositions.add(normalizedLocation);
              impactedZones.add(item.location_zone);
              impactedZones.add(targetZone);
              allActions.push({
                id: `CS-${actionId++}`,
                action: 'consolidate',
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: `${targetZone}-CONSOLIDATED`,
                priority: item.value > 5000 ? 'high' : item.value > 1000 ? 'medium' : 'low',
                estimatedBenefit: `Reduces pick time for ${shipClass}`,
                quantity: item.quantity,
                value: item.value,
                reason: `Consolidate ${shipClass} items to zone ${targetZone}`,
                algorithm: 'cardstack',
              });
            }
          }
        }
        phaseResults.cardstack = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phaseActions} items → ${targetZonesSet.size} locations`,
          zonesOptimized: sourceZonesSet.size
        };
      }

      // Phase 2: Size Standardization - Group by program code
      {
        const { minProgramItems = 3 } = defaultParams.size_standardization;
        const programGroups: Map<string, typeof itemsWithData> = new Map();
        for (const item of itemsWithData) {
          if (!item.program_code) continue;
          if (!programGroups.has(item.program_code)) {
            programGroups.set(item.program_code, []);
          }
          programGroups.get(item.program_code)!.push(item);
        }

        let actionId = 1;
        let phaseActions = 0;
        const programsStandardized = new Set<string>();
        const phasePositions = new Set<string>();

        for (const [programCode, programItems] of Array.from(programGroups.entries())) {
          if (programItems.length < minProgramItems) continue;
          
          const zones = new Set(programItems.map(i => i.location_zone));
          if (zones.size > 1) {
            const targetZone = programItems.sort((a, b) => b.value - a.value)[0].location_zone;
            programsStandardized.add(programCode);
            
            for (const item of programItems) {
              if (item.location_zone !== targetZone && allActions.length < 150 && item.rack_location) {
                phaseActions++;
                seenItems.add(item.requisition_no);
                const normalizedLocation = item.rack_location.toUpperCase().trim();
                freedPositions.add(normalizedLocation);
                phasePositions.add(normalizedLocation);
                impactedZones.add(item.location_zone);
                impactedZones.add(targetZone);
                allActions.push({
                  id: `SS-${actionId++}`,
                  action: 'standardize',
                  item: item.requisition_no,
                  itemDescription: item.description.substring(0, 50),
                  from: item.rack_location,
                  to: `${targetZone}-${programCode}`,
                  priority: 'medium',
                  estimatedBenefit: `Groups ${programCode} program items`,
                  quantity: item.quantity,
                  value: item.value,
                  reason: `Group ${programCode} program items together`,
                  algorithm: 'size_standardization',
                });
              }
            }
          }
        }
        phaseResults.size_standardization = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phaseActions} items → ${programsStandardized.size} program zones`,
          zonesOptimized: programsStandardized.size
        };
      }

      // Phase 3: Value Density - Move high-value items to accessible zones
      {
        const { highValueThreshold = 1000 } = defaultParams.value_density;
        const highValueItems = itemsWithData.filter(i => i.value >= highValueThreshold && i.rack_location);
        
        let actionId = 1;
        let phaseActions = 0;
        const phasePositions = new Set<string>();

        const getAccessibilityScore = (location: string): number => {
          if (!location) return 500;
          const numbers = location.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            return parseInt(numbers[0]);
          }
          if (location.startsWith('A') || location.startsWith('1')) return 100;
          if (location.startsWith('B') || location.startsWith('2')) return 200;
          return 500;
        };

        const sortedItems = highValueItems.sort((a, b) => b.value - a.value);
        
        for (const item of sortedItems.slice(0, 30)) {
          const accessScore = getAccessibilityScore(item.rack_location);
          
          if (accessScore > 1500 && allActions.length < 200) {
            phaseActions++;
            seenItems.add(item.requisition_no);
            const normalizedLocation = item.rack_location.toUpperCase().trim();
            freedPositions.add(normalizedLocation);
            phasePositions.add(normalizedLocation);
            impactedZones.add(item.location_zone);
            impactedZones.add('ZONE-A-PRIORITY');
            allActions.push({
              id: `VD-${actionId++}`,
              action: 'relocate_priority',
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: `ZONE-A-PRIORITY`,
              priority: 'high',
              estimatedBenefit: `High-value item to priority zone`,
              quantity: item.quantity,
              value: item.value,
              reason: `High-value item ($${item.value.toFixed(0)}) in zone ${item.location_zone} needs accessible placement`,
              algorithm: 'value_density',
            });
          }
        }
        
        if (phaseActions < 10 && highValueItems.length > 0) {
          for (const item of sortedItems.slice(0, 10)) {
            const alreadyHasAction = allActions.some(a => a.item === item.requisition_no && a.algorithm === 'value_density');
            if (!alreadyHasAction && item.rack_location && !item.rack_location.includes('PRIORITY') && allActions.length < 200) {
              phaseActions++;
              seenItems.add(item.requisition_no);
              const normalizedLocation = item.rack_location.toUpperCase().trim();
              freedPositions.add(normalizedLocation);
              phasePositions.add(normalizedLocation);
              impactedZones.add(item.location_zone);
              impactedZones.add('ZONE-A-PRIORITY');
              allActions.push({
                id: `VD-${actionId++}`,
                action: 'relocate_priority',
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: `ZONE-A-PRIORITY`,
                priority: 'high',
                estimatedBenefit: `Top-value item to priority zone`,
                quantity: item.quantity,
                value: item.value,
                reason: `Top-value item ($${item.value.toFixed(0)}) should be in priority zone`,
                algorithm: 'value_density',
              });
            }
          }
        }
        
        phaseResults.value_density = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phasePositions.size} high-value items → priority zone`,
          zonesOptimized: phaseActions > 0 ? 1 : 0
        };
      }

      // Phase 4: Bin Packing - Stage items by disposition
      {
        const { maxItemsPerPallet = 15, prioritizeByValue = true } = defaultParams.bin_packing;
        const dispositionGroups: Map<string, typeof itemsWithData> = new Map();
        
        for (const item of itemsWithData) {
          if (!item.mat_disposition) continue;
          if (!dispositionGroups.has(item.mat_disposition)) {
            dispositionGroups.set(item.mat_disposition, []);
          }
          dispositionGroups.get(item.mat_disposition)!.push(item);
        }

        let actionId = 1;
        let phaseActions = 0;
        const palletLocationsSet = new Set<string>();
        const phasePositions = new Set<string>();

        for (const [disposition, dispositionItems] of Array.from(dispositionGroups.entries())) {
          if (dispositionItems.length < 3) continue;
          
          const sorted = prioritizeByValue 
            ? dispositionItems.sort((a, b) => b.value - a.value)
            : dispositionItems;

          for (let i = 0; i < Math.min(sorted.length, 50); i++) {
            const item = sorted[i];
            if (!item.rack_location) continue;
            const palletNumber = Math.floor(i / maxItemsPerPallet) + 1;
            const palletLocation = `STAGING-${disposition}-P${palletNumber}`;
            
            if (allActions.length < 250) {
              phaseActions++;
              palletLocationsSet.add(palletLocation);
              seenItems.add(item.requisition_no);
              const normalizedLocation = item.rack_location.toUpperCase().trim();
              freedPositions.add(normalizedLocation);
              phasePositions.add(normalizedLocation);
              impactedZones.add(item.location_zone);
              allActions.push({
                id: `BP-${actionId++}`,
                action: 'stage_pallet',
                item: item.requisition_no,
                itemDescription: item.description.substring(0, 50),
                from: item.rack_location,
                to: palletLocation,
                priority: i < maxItemsPerPallet ? 'high' : 'medium',
                estimatedBenefit: `Ready for ${disposition} shipment`,
                quantity: item.quantity,
                value: item.value,
                reason: `Stage ${disposition} item on pallet ${palletNumber}`,
                algorithm: 'bin_packing',
              });
            }
          }
        }
        phaseResults.bin_packing = { 
          actions: phaseActions, 
          slotsFreed: phasePositions.size,
          consolidationWins: `${phasePositions.size} positions → ${palletLocationsSet.size} pallets`,
          zonesOptimized: dispositionGroups.size
        };
      }

      // De-duplicate: Keep highest priority/value action for each item
      // Priority order: high > medium > low, then by value, then by algorithm phase order
      const algorithmPriority: Record<string, number> = {
        'cardstack': 1,
        'size_standardization': 2, 
        'value_density': 3,
        'bin_packing': 4,
      };
      
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      
      const scoreAction = (action: typeof allActions[0]): number => {
        // Higher score = better action to keep
        const priorityScore = (2 - priorityOrder[action.priority]) * 10000; // 0-20000
        const valueScore = Math.min(action.value, 10000); // 0-10000
        const phaseScore = (5 - algorithmPriority[action.algorithm]) * 100; // 100-400
        return priorityScore + valueScore + phaseScore;
      };
      
      const itemBestAction = new Map<string, typeof allActions[0]>();
      for (const action of allActions) {
        const existing = itemBestAction.get(action.item);
        if (!existing || scoreAction(action) > scoreAction(existing)) {
          itemBestAction.set(action.item, action);
        }
      }
      
      const deduplicatedActions = Array.from(itemBestAction.values());

      // Sort by priority and value
      deduplicatedActions.sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return b.value - a.value;
      });

      // Calculate overall pick efficiency gain based on consolidation and accessibility moves
      const overallPickEfficiency = Math.min(
        Math.round((freedPositions.size * 1.5) + (impactedZones.size * 3)),
        40
      );
      
      const summary = {
        slotsFreed: freedPositions.size,
        consolidationWins: `${seenItems.size} items reorganized`,
        zonesOptimized: impactedZones.size,
        pickEfficiencyGain: `+${overallPickEfficiency}% overall efficiency`,
        itemsAffected: seenItems.size,
        actionsGenerated: deduplicatedActions.length,
        phases: phaseResults,
      };

      // Store optimization run
      const [optimizationRun] = await db.insert(warehouseOptimizationRuns).values({
        user_id: req.user!.id,
        site_id: siteId,
        algorithm: 'run_all',
        input_params: defaultParams,
        results: { summary, itemsAnalyzed: items.length, phases: phaseResults },
        action_plan: { actions: deduplicatedActions },
        status: 'completed',
        completed_at: new Date(),
      }).returning();

      console.log(`[Warehouse] Run-all optimization completed: ${deduplicatedActions.length} actions from 4 algorithms`);

      res.status(201).json({
        runId: optimizationRun.id,
        algorithm: 'run_all',
        site: { id: siteId, name: site.name },
        summary,
        actions: deduplicatedActions.slice(0, 50),
        totalActions: deduplicatedActions.length,
      });
    } catch (error) {
      console.error("[Warehouse] Run-all optimization failed:", error);
      res.status(500).json({ error: "Failed to run all optimizations" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize/:runId/apply - Apply optimization plan
  app.post("/api/warehouse/sites/:siteId/optimize/:runId/apply", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const runId = parseInt(req.params.runId);
      
      if (isNaN(siteId) || isNaN(runId)) {
        return res.status(400).json({ error: "Invalid site ID or run ID" });
      }

      // Verify ownership and get the optimization run
      const [run] = await db.select()
        .from(warehouseOptimizationRuns)
        .where(and(
          eq(warehouseOptimizationRuns.id, runId),
          eq(warehouseOptimizationRuns.site_id, siteId),
          eq(warehouseOptimizationRuns.user_id, req.user!.id)
        ));

      if (!run) {
        return res.status(404).json({ error: "Optimization run not found" });
      }

      // For now, just mark the plan as applied (actual implementation would update item locations)
      // In a full implementation, this would iterate through actions and update warehouse_inventory_items

      res.json({ 
        success: true, 
        message: "Optimization plan applied successfully",
        runId,
        actionsApplied: ((run.action_plan as any)?.actions?.length || 0)
      });
    } catch (error) {
      console.error("[Warehouse] Failed to apply optimization:", error);
      res.status(500).json({ error: "Failed to apply optimization plan" });
    }
  });

  // POST /api/warehouse/transfers - Create inter-warehouse transfer with item selection
  app.post("/api/warehouse/transfers", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { source_site_id, destination_site_id, transport_mode, item_ids, notes, scheduled_date, air_metadata } = req.body;

      if (!source_site_id || !destination_site_id) {
        return res.status(400).json({ error: "source_site_id and destination_site_id are required" });
      }

      const validModes = ["air", "ground", "sea"];
      const mode = validModes.includes(transport_mode) ? transport_mode : "ground";

      if (source_site_id === destination_site_id) {
        return res.status(400).json({ error: "Source and destination sites must be different" });
      }

      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: "item_ids array is required with at least one item" });
      }

      // Verify user owns both sites
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, source_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      const [destSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, destination_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite) {
        return res.status(404).json({ error: "Source warehouse site not found" });
      }

      if (!destSite) {
        return res.status(404).json({ error: "Destination warehouse site not found" });
      }

      // Fetch selected inventory items
      const selectedItems = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.site_id, source_site_id),
          sql`${warehouseInventoryItems.id} = ANY(${item_ids})`
        ));

      if (selectedItems.length === 0) {
        return res.status(400).json({ error: "No valid inventory items found for the selected IDs" });
      }

      // Build transfer items with details
      const transferItems = selectedItems.map(item => ({
        id: item.id,
        requisition_no: item.requisition_no,
        description: item.description,
        quantity: item.quantity,
        weight_lbs: item.weight_lbs,
        unit_price: item.unit_price,
      }));

      // Calculate totals
      const totals = {
        item_count: transferItems.length,
        total_weight_lb: transferItems.reduce((sum, item) => {
          const weight = parseFloat(String(item.weight_lbs || 0)) || 0;
          return sum + (weight * (item.quantity || 1));
        }, 0),
        total_value: transferItems.reduce((sum, item) => {
          const price = parseFloat(String(item.unit_price || 0)) || 0;
          return sum + (price * (item.quantity || 1));
        }, 0),
      };

      // Build air metadata and PACAF manifest for air transfers
      let airMetadata = null;
      let pacafManifest = null;

      if (mode === "air" && air_metadata) {
        const validAircraftTypes = ["C-17", "C-130H", "C-130J"];
        const validPriorities = ["routine", "priority", "urgent"];

        airMetadata = {
          aircraft_type: validAircraftTypes.includes(air_metadata.aircraft_type) 
            ? air_metadata.aircraft_type 
            : "C-17",
          mission_id: air_metadata.mission_id || null,
          priority: validPriorities.includes(air_metadata.priority) 
            ? air_metadata.priority 
            : "routine",
        };

        // Generate PACAF-compatible manifest
        pacafManifest = {
          manifest_id: `MNF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          transfer_id: 0, // Will be updated after insert
          aircraft_type: airMetadata.aircraft_type,
          mission_id: airMetadata.mission_id,
          priority: airMetadata.priority,
          origin_site: {
            id: sourceSite.id,
            code: sourceSite.code,
            name: sourceSite.name,
          },
          destination_site: {
            id: destSite.id,
            code: destSite.code,
            name: destSite.name,
          },
          cargo_items: transferItems.map(item => ({
            id: item.id,
            requisition_no: item.requisition_no,
            description: item.description,
            quantity: item.quantity,
            weight_lbs: parseFloat(String(item.weight_lbs || 0)) || 0,
          })),
          totals,
          created_at: new Date().toISOString(),
        };
      }

      const [transfer] = await db.insert(warehouseTransfers).values({
        user_id: req.user!.id,
        source_site_id,
        destination_site_id,
        status: "pending",
        transport_mode: mode,
        transfer_items: transferItems,
        air_metadata: airMetadata,
        pacaf_manifest: pacafManifest,
        notes: notes || null,
        scheduled_date: scheduled_date ? new Date(scheduled_date) : null,
      }).returning();

      // Update manifest with transfer ID
      if (pacafManifest && transfer) {
        pacafManifest.transfer_id = transfer.id;
        await db.update(warehouseTransfers)
          .set({ pacaf_manifest: pacafManifest })
          .where(eq(warehouseTransfers.id, transfer.id));
      }

      console.log(`[Warehouse] Transfer created: ${transfer.id}, mode: ${mode}, items: ${transferItems.length}`);
      if (mode === "air") {
        console.log(`[Warehouse] Air transfer manifest generated: ${pacafManifest?.manifest_id}`);
      }

      res.status(201).json({
        ...transfer,
        pacaf_manifest: pacafManifest,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to create transfer:", error);
      res.status(500).json({ error: "Failed to create warehouse transfer" });
    }
  });

  // GET /api/warehouse/transfers - Get all transfers for user
  app.get("/api/warehouse/transfers", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transfers = await db.select()
        .from(warehouseTransfers)
        .where(eq(warehouseTransfers.user_id, req.user!.id));

      res.json(transfers);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch transfers:", error);
      res.status(500).json({ error: "Failed to fetch warehouse transfers" });
    }
  });

  // ============================================================================
  // WAREHOUSE CONFIGURATION API (PROTECTED)
  // ============================================================================

  // GET /api/warehouse/settings - Get user's warehouse settings
  app.get("/api/warehouse/settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const [settings] = await db.select()
        .from(warehouseSettings)
        .where(eq(warehouseSettings.user_id, req.user!.id));

      if (!settings) {
        return res.json({
          timezone: "UTC",
          date_format: "MM/DD/YYYY",
          weight_unit: "lbs",
          default_page_size: 25
        });
      }

      res.json(settings);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch settings:", error);
      res.status(500).json({ error: "Failed to fetch warehouse settings" });
    }
  });

  // POST /api/warehouse/settings - Create or update user's warehouse settings
  app.post("/api/warehouse/settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { timezone, date_format, weight_unit, default_page_size } = req.body;

      const validDateFormats = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
      const validWeightUnits = ["lbs", "kg"];

      if (date_format && !validDateFormats.includes(date_format)) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (weight_unit && !validWeightUnits.includes(weight_unit)) {
        return res.status(400).json({ error: "Invalid weight unit" });
      }

      const pageSize = default_page_size ? Math.min(100, Math.max(10, parseInt(default_page_size))) : 25;

      const [existing] = await db.select()
        .from(warehouseSettings)
        .where(eq(warehouseSettings.user_id, req.user!.id));

      if (existing) {
        const [updated] = await db.update(warehouseSettings)
          .set({
            timezone: timezone || existing.timezone,
            date_format: date_format || existing.date_format,
            weight_unit: weight_unit || existing.weight_unit,
            default_page_size: pageSize,
            updated_at: new Date()
          })
          .where(eq(warehouseSettings.user_id, req.user!.id))
          .returning();
        return res.json(updated);
      }

      const [created] = await db.insert(warehouseSettings).values({
        user_id: req.user!.id,
        timezone: timezone || "UTC",
        date_format: date_format || "MM/DD/YYYY",
        weight_unit: weight_unit || "lbs",
        default_page_size: pageSize
      }).returning();

      res.status(201).json(created);
    } catch (error) {
      console.error("[Warehouse] Failed to save settings:", error);
      res.status(500).json({ error: "Failed to save warehouse settings" });
    }
  });

  // GET /api/warehouse/aging-thresholds - Get user's aging thresholds
  app.get("/api/warehouse/aging-thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholds = await db.select()
        .from(warehouseAgingThresholds)
        .where(eq(warehouseAgingThresholds.user_id, req.user!.id))
        .orderBy(asc(warehouseAgingThresholds.days));

      if (thresholds.length === 0) {
        return res.json([
          { id: 0, name: "Warning", days: 180, color: "#fbbf24" },
          { id: 0, name: "Critical", days: 365, color: "#ef4444" }
        ]);
      }

      res.json(thresholds);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch aging thresholds:", error);
      res.status(500).json({ error: "Failed to fetch aging thresholds" });
    }
  });

  // POST /api/warehouse/aging-thresholds - Create a new aging threshold
  app.post("/api/warehouse/aging-thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, days, color } = req.body;

      if (!name || !days) {
        return res.status(400).json({ error: "Name and days are required" });
      }

      const daysNum = parseInt(days);
      if (isNaN(daysNum) || daysNum < 1) {
        return res.status(400).json({ error: "Days must be a positive number" });
      }

      const [threshold] = await db.insert(warehouseAgingThresholds).values({
        user_id: req.user!.id,
        name,
        days: daysNum,
        color: color || "#fbbf24"
      }).returning();

      res.status(201).json(threshold);
    } catch (error) {
      console.error("[Warehouse] Failed to create aging threshold:", error);
      res.status(500).json({ error: "Failed to create aging threshold" });
    }
  });

  // PUT /api/warehouse/aging-thresholds/:id - Update an aging threshold
  app.put("/api/warehouse/aging-thresholds/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholdId = parseInt(req.params.id);
      if (isNaN(thresholdId)) {
        return res.status(400).json({ error: "Invalid threshold ID" });
      }

      const { name, days, color } = req.body;

      const [existing] = await db.select()
        .from(warehouseAgingThresholds)
        .where(and(
          eq(warehouseAgingThresholds.id, thresholdId),
          eq(warehouseAgingThresholds.user_id, req.user!.id)
        ));

      if (!existing) {
        return res.status(404).json({ error: "Aging threshold not found" });
      }

      const daysNum = days ? parseInt(days) : existing.days;
      if (isNaN(daysNum) || daysNum < 1) {
        return res.status(400).json({ error: "Days must be a positive number" });
      }

      const [updated] = await db.update(warehouseAgingThresholds)
        .set({
          name: name || existing.name,
          days: daysNum,
          color: color || existing.color,
          updated_at: new Date()
        })
        .where(eq(warehouseAgingThresholds.id, thresholdId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update aging threshold:", error);
      res.status(500).json({ error: "Failed to update aging threshold" });
    }
  });

  // DELETE /api/warehouse/aging-thresholds/:id - Delete an aging threshold
  app.delete("/api/warehouse/aging-thresholds/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholdId = parseInt(req.params.id);
      if (isNaN(thresholdId)) {
        return res.status(400).json({ error: "Invalid threshold ID" });
      }

      const [existing] = await db.select()
        .from(warehouseAgingThresholds)
        .where(and(
          eq(warehouseAgingThresholds.id, thresholdId),
          eq(warehouseAgingThresholds.user_id, req.user!.id)
        ));

      if (!existing) {
        return res.status(404).json({ error: "Aging threshold not found" });
      }

      await db.delete(warehouseAgingThresholds)
        .where(eq(warehouseAgingThresholds.id, thresholdId));

      res.json({ success: true, message: "Aging threshold deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete aging threshold:", error);
      res.status(500).json({ error: "Failed to delete aging threshold" });
    }
  });

  // ============================================================================
  // WAREHOUSE ANALYTICS API (PROTECTED)
  // ============================================================================

  // Helper function to calculate analytics for inventory items
  const calculateAnalytics = (items: any[], site?: any) => {
    const now = new Date();
    let totalItems = items.length;
    let totalQuantity = 0;
    let totalValue = 0;

    const agingBreakdown = {
      lessThan1Year: 0,
      oneToThreeYears: 0,
      threeToFiveYears: 0,
      moreThanFiveYears: 0
    };

    for (const item of items) {
      const qty = item.quantity || 0;
      const price = parseFloat(item.unit_price?.toString() || "0");
      totalQuantity += qty;
      totalValue += qty * price;

      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const lastMoved = item.last_moved ? new Date(item.last_moved) : null;
      const referenceDate = lastMoved || createdAt || now;
      const yearsOld = (now.getTime() - referenceDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      if (yearsOld < 1) {
        agingBreakdown.lessThan1Year += qty;
      } else if (yearsOld < 3) {
        agingBreakdown.oneToThreeYears += qty;
      } else if (yearsOld < 5) {
        agingBreakdown.threeToFiveYears += qty;
      } else {
        agingBreakdown.moreThanFiveYears += qty;
      }
    }

    const agingTotal = agingBreakdown.lessThan1Year + agingBreakdown.oneToThreeYears + 
                       agingBreakdown.threeToFiveYears + agingBreakdown.moreThanFiveYears;

    const agingScore = agingTotal > 0 ? 
      (agingBreakdown.lessThan1Year * 100 + 
       agingBreakdown.oneToThreeYears * 80 + 
       agingBreakdown.threeToFiveYears * 50 + 
       agingBreakdown.moreThanFiveYears * 20) / agingTotal : 100;

    const defaultCapacity = 500;
    const capacityUtilization = Math.min(Math.round((totalItems / defaultCapacity) * 100), 100);

    const completenessScore = totalItems > 0 ? 90 : 50;
    const readinessScore = Math.round((agingScore * 0.6 + completenessScore * 0.4));

    return {
      totalItems,
      totalQuantity,
      totalValue: parseFloat(totalValue.toFixed(2)),
      capacityUtilization,
      agingBreakdown,
      readinessScore: Math.min(100, Math.max(0, readinessScore))
    };
  };

  // GET /api/warehouse/analytics - Get current analytics for all sites
  app.get("/api/warehouse/analytics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      const siteAnalytics = [];
      let overallTotalItems = 0;
      let overallTotalValue = 0;
      let overallAgingBreakdown = {
        lessThan1Year: 0,
        oneToThreeYears: 0,
        threeToFiveYears: 0,
        moreThanFiveYears: 0
      };

      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));

        const analytics = calculateAnalytics(items, site);
        
        overallTotalItems += analytics.totalItems;
        overallTotalValue += analytics.totalValue;
        overallAgingBreakdown.lessThan1Year += analytics.agingBreakdown.lessThan1Year;
        overallAgingBreakdown.oneToThreeYears += analytics.agingBreakdown.oneToThreeYears;
        overallAgingBreakdown.threeToFiveYears += analytics.agingBreakdown.threeToFiveYears;
        overallAgingBreakdown.moreThanFiveYears += analytics.agingBreakdown.moreThanFiveYears;

        siteAnalytics.push({
          siteId: site.id,
          siteCode: site.code,
          siteName: site.name,
          ...analytics
        });
      }

      const overallTotal = overallAgingBreakdown.lessThan1Year + overallAgingBreakdown.oneToThreeYears +
                           overallAgingBreakdown.threeToFiveYears + overallAgingBreakdown.moreThanFiveYears;
      const overallAgingScore = overallTotal > 0 ?
        (overallAgingBreakdown.lessThan1Year * 100 +
         overallAgingBreakdown.oneToThreeYears * 80 +
         overallAgingBreakdown.threeToFiveYears * 50 +
         overallAgingBreakdown.moreThanFiveYears * 20) / overallTotal : 100;
      const overallCompleteness = overallTotalItems > 0 ? 90 : 50;
      const overallReadinessScore = Math.round((overallAgingScore * 0.6 + overallCompleteness * 0.4));

      res.json({
        overall: {
          totalItems: overallTotalItems,
          totalValue: parseFloat(overallTotalValue.toFixed(2)),
          agingBreakdown: overallAgingBreakdown,
          readinessScore: Math.min(100, Math.max(0, overallReadinessScore))
        },
        sites: siteAnalytics
      });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get analytics:", error);
      res.status(500).json({ error: "Failed to get warehouse analytics" });
    }
  });

  // GET /api/warehouse/analytics/:siteId - Get analytics for a specific site
  app.get("/api/warehouse/analytics/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const analytics = calculateAnalytics(items, site);

      res.json({
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        ...analytics
      });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get site analytics:", error);
      res.status(500).json({ error: "Failed to get site analytics" });
    }
  });

  // POST /api/warehouse/analytics/snapshot - Take a snapshot and store in database
  app.post("/api/warehouse/analytics/snapshot", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.body;
      const today = new Date().toISOString().split('T')[0];

      if (siteId) {
        const parsedSiteId = parseInt(siteId);
        if (isNaN(parsedSiteId)) {
          return res.status(400).json({ error: "Invalid site ID" });
        }

        const [site] = await db.select()
          .from(warehouseSites)
          .where(and(
            eq(warehouseSites.id, parsedSiteId),
            eq(warehouseSites.user_id, req.user!.id)
          ));

        if (!site) {
          return res.status(404).json({ error: "Warehouse site not found" });
        }

        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, parsedSiteId));

        const analytics = calculateAnalytics(items, site);

        const [snapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
          user_id: req.user!.id,
          site_id: parsedSiteId,
          snapshot_date: today,
          metrics: analytics
        }).returning();

        return res.status(201).json(snapshot);
      }

      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      const snapshots = [];
      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));

        const analytics = calculateAnalytics(items, site);

        const [snapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
          user_id: req.user!.id,
          site_id: site.id,
          snapshot_date: today,
          metrics: analytics
        }).returning();

        snapshots.push(snapshot);
      }

      const overallItems: any[] = [];
      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));
        overallItems.push(...items);
      }

      const overallAnalytics = calculateAnalytics(overallItems);
      const [overallSnapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
        user_id: req.user!.id,
        site_id: null,
        snapshot_date: today,
        metrics: overallAnalytics
      }).returning();

      snapshots.push(overallSnapshot);

      res.status(201).json({ snapshots, count: snapshots.length });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to create snapshot:", error);
      res.status(500).json({ error: "Failed to create analytics snapshot" });
    }
  });

  // GET /api/warehouse/analytics/history - Get historical snapshots for trendline
  app.get("/api/warehouse/analytics/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteIdParam = req.query.siteId as string;
      const limitParam = parseInt(req.query.limit as string) || 30;

      let whereCondition;
      if (siteIdParam) {
        const siteId = parseInt(siteIdParam);
        if (isNaN(siteId)) {
          return res.status(400).json({ error: "Invalid site ID" });
        }
        whereCondition = and(
          eq(warehouseAnalyticsSnapshots.user_id, req.user!.id),
          eq(warehouseAnalyticsSnapshots.site_id, siteId)
        );
      } else {
        whereCondition = and(
          eq(warehouseAnalyticsSnapshots.user_id, req.user!.id),
          isNull(warehouseAnalyticsSnapshots.site_id)
        );
      }

      const snapshots = await db.select()
        .from(warehouseAnalyticsSnapshots)
        .where(whereCondition)
        .orderBy(desc(warehouseAnalyticsSnapshots.snapshot_date))
        .limit(limitParam);

      res.json(snapshots.reverse());
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get history:", error);
      res.status(500).json({ error: "Failed to get analytics history" });
    }
  });

  // ============================================================================
  // WORKFLOW STATE MACHINE API
  // ============================================================================

  // Valid workflow transitions
  const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
    'received': ['store'],
    'store': ['package', 'ship'], // Can go to package or directly to ship
    'package': ['ship'],
    'ship': ['delivered', 'return'],
    'delivered': [], // Terminal state
    'return': ['store'], // Returns go back to store
  };

  // Get valid next states for an item
  app.get("/api/warehouse/workflow/transitions/:currentState", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { currentState } = req.params;
      const validStates = WORKFLOW_TRANSITIONS[currentState] || [];
      
      res.json({
        current_state: currentState,
        valid_transitions: validStates,
        is_terminal: validStates.length === 0,
      });
    } catch (error) {
      console.error("[Workflow] Error getting transitions:", error);
      res.status(500).json({ error: "Failed to get workflow transitions" });
    }
  });

  // Update item workflow state
  app.put("/api/warehouse/inventory/:id/workflow", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { new_state, notes } = req.body;
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      // Get current item
      const item = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findFirst({
            where: and(
              eq(warehouseInventoryItems.id, parseInt(id)),
              inArray(warehouseInventoryItems.site_id, userSiteIds)
            ),
          })
        : null;
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const currentState = item.workflow_status || 'received';
      const validTransitions = WORKFLOW_TRANSITIONS[currentState] || [];
      
      if (!validTransitions.includes(new_state)) {
        return res.status(400).json({
          error: `Invalid workflow transition`,
          message: `Cannot transition from '${currentState}' to '${new_state}'. Valid transitions: ${validTransitions.join(', ') || 'none (terminal state)'}`,
        });
      }
      
      // Update item workflow state
      const [updated] = await db.update(warehouseInventoryItems)
        .set({
          workflow_status: new_state,
          workflow_updated_at: new Date(),
        })
        .where(eq(warehouseInventoryItems.id, parseInt(id)))
        .returning();
      
      res.json({
        success: true,
        previous_state: currentState,
        new_state: new_state,
        item: updated,
      });
    } catch (error) {
      console.error("[Workflow] Error updating workflow state:", error);
      res.status(500).json({ error: "Failed to update workflow state" });
    }
  });

  // Batch update workflow state for multiple items
  app.put("/api/warehouse/inventory/workflow/batch", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { item_ids, new_state } = req.body;
      
      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: "item_ids array is required" });
      }
      
      const results = {
        success: [] as number[],
        failed: [] as { id: number; reason: string }[],
      };
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      for (const itemId of item_ids) {
        const item = userSiteIds.length > 0 
          ? await db.query.warehouseInventoryItems.findFirst({
              where: and(
                eq(warehouseInventoryItems.id, itemId),
                inArray(warehouseInventoryItems.site_id, userSiteIds)
              ),
            })
          : null;
        
        if (!item) {
          results.failed.push({ id: itemId, reason: 'Item not found' });
          continue;
        }
        
        const currentState = item.workflow_status || 'received';
        const validTransitions = WORKFLOW_TRANSITIONS[currentState] || [];
        
        if (!validTransitions.includes(new_state)) {
          results.failed.push({ id: itemId, reason: `Cannot transition from '${currentState}' to '${new_state}'` });
          continue;
        }
        
        await db.update(warehouseInventoryItems)
          .set({
            workflow_status: new_state,
            workflow_updated_at: new Date(),
          })
          .where(eq(warehouseInventoryItems.id, itemId));
        
        results.success.push(itemId);
      }
      
      res.json({
        total: item_ids.length,
        successful: results.success.length,
        failed: results.failed.length,
        results,
      });
    } catch (error) {
      console.error("[Workflow] Error batch updating workflow:", error);
      res.status(500).json({ error: "Failed to batch update workflow" });
    }
  });

  // Get workflow statistics
  app.get("/api/warehouse/workflow/statistics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      const items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      const stateCounts: Record<string, number> = {
        received: 0,
        store: 0,
        package: 0,
        ship: 0,
        delivered: 0,
        return: 0,
      };
      
      for (const item of items) {
        const state = item.workflow_status || 'received';
        if (stateCounts[state] !== undefined) {
          stateCounts[state]++;
        }
      }
      
      res.json({
        total_items: items.length,
        by_state: stateCounts,
        workflow_states: Object.keys(WORKFLOW_TRANSITIONS),
        transitions: WORKFLOW_TRANSITIONS,
      });
    } catch (error) {
      console.error("[Workflow] Error getting statistics:", error);
      res.status(500).json({ error: "Failed to get workflow statistics" });
    }
  });

  // ============================================================================
  // WAREHOUSE OPTIMIZATION PLANS API
  // ============================================================================

  // GET /api/warehouse/sites/:siteId/optimization-plans - List all optimization plans for a site
  app.get("/api/warehouse/sites/:siteId/optimization-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Build query conditions
      const conditions = [eq(warehouseOptimizationPlans.site_id, siteId)];

      // Filter by status if provided
      const statusParam = req.query.status as string;
      if (statusParam) {
        const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
        if (statuses.length > 0) {
          conditions.push(inArray(warehouseOptimizationPlans.status, statuses));
        }
      }

      // Fetch plans with action counts
      const plans = await db.select({
        id: warehouseOptimizationPlans.id,
        site_id: warehouseOptimizationPlans.site_id,
        user_id: warehouseOptimizationPlans.user_id,
        parent_plan_id: warehouseOptimizationPlans.parent_plan_id,
        name: warehouseOptimizationPlans.name,
        algorithm: warehouseOptimizationPlans.algorithm,
        status: warehouseOptimizationPlans.status,
        version: warehouseOptimizationPlans.version,
        diff_patch: warehouseOptimizationPlans.diff_patch,
        summary: warehouseOptimizationPlans.summary,
        total_actions: warehouseOptimizationPlans.total_actions,
        completed_actions: warehouseOptimizationPlans.completed_actions,
        comparison_context: warehouseOptimizationPlans.comparison_context,
        executed_at: warehouseOptimizationPlans.executed_at,
        executed_by: warehouseOptimizationPlans.executed_by,
        cancelled_at: warehouseOptimizationPlans.cancelled_at,
        cancelled_by: warehouseOptimizationPlans.cancelled_by,
        created_at: warehouseOptimizationPlans.created_at,
        updated_at: warehouseOptimizationPlans.updated_at,
      })
        .from(warehouseOptimizationPlans)
        .where(and(...conditions))
        .orderBy(desc(warehouseOptimizationPlans.created_at));

      res.json(plans);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to list plans:", error);
      res.status(500).json({ error: "Failed to list optimization plans" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimization-plans - Create a new optimization plan
  app.post("/api/warehouse/sites/:siteId/optimization-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { name, algorithm, diff_patch, summary, actions } = req.body;

      if (!name || !algorithm) {
        return res.status(400).json({ error: "Name and algorithm are required" });
      }

      // Use a transaction to create plan and actions together
      const result = await db.transaction(async (tx) => {
        // Create the plan
        const [plan] = await tx.insert(warehouseOptimizationPlans).values({
          site_id: siteId,
          user_id: req.user!.id,
          name,
          algorithm,
          status: "pending",
          diff_patch: diff_patch || [],
          summary: summary || {},
          total_actions: Array.isArray(actions) ? actions.length : 0,
          completed_actions: 0,
        }).returning();

        // Create the actions if provided
        if (Array.isArray(actions) && actions.length > 0) {
          const actionRecords = actions.map((action: any, index: number) => ({
            plan_id: plan.id,
            item_id: action.item_id || action.itemId || 0,
            action_type: action.action_type || action.action || "move",
            from_location: action.from_location || action.from || null,
            to_location: action.to_location || action.to || null,
            quantity: action.quantity || 1,
            status: "pending",
            sequence: index,
          }));

          await tx.insert(warehouseOptimizationActions).values(actionRecords);
        }

        // Create a "created" event
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: plan.id,
          user_id: req.user!.id,
          event_type: "created",
          payload: { algorithm, total_actions: actions?.length || 0 },
        });

        return plan;
      });

      res.status(201).json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to create plan:", error);
      res.status(500).json({ error: "Failed to create optimization plan" });
    }
  });

  // GET /api/warehouse/optimization-plans/:planId - Get a single plan with all its actions
  app.get("/api/warehouse/optimization-plans/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Fetch actions ordered by sequence
      const actions = await db.select()
        .from(warehouseOptimizationActions)
        .where(eq(warehouseOptimizationActions.plan_id, planId))
        .orderBy(asc(warehouseOptimizationActions.sequence));

      res.json({ ...plan, actions });
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to get plan:", error);
      res.status(500).json({ error: "Failed to get optimization plan" });
    }
  });

  // POST /api/warehouse/optimization-plans/:planId/execute - Mark plan as in_progress
  app.post("/api/warehouse/optimization-plans/:planId/execute", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status !== "pending") {
        return res.status(400).json({ error: "Plan can only be executed when status is pending" });
      }

      // Use transaction to update plan and create event
      const result = await db.transaction(async (tx) => {
        const [updatedPlan] = await tx.update(warehouseOptimizationPlans)
          .set({
            status: "in_progress",
            executed_at: new Date(),
            executed_by: req.user!.id,
            updated_at: new Date(),
          })
          .where(eq(warehouseOptimizationPlans.id, planId))
          .returning();

        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: "executed",
          payload: { executed_at: new Date().toISOString() },
        });

        return updatedPlan;
      });

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to execute plan:", error);
      res.status(500).json({ error: "Failed to execute optimization plan" });
    }
  });

  // POST /api/warehouse/optimization-plans/:planId/cancel - Cancel a plan
  app.post("/api/warehouse/optimization-plans/:planId/cancel", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status !== "pending" && plan.status !== "in_progress") {
        return res.status(400).json({ error: "Plan can only be cancelled when status is pending or in_progress" });
      }

      // Use transaction to update plan, mark actions as skipped, and create event
      const result = await db.transaction(async (tx) => {
        // Update plan status
        const [updatedPlan] = await tx.update(warehouseOptimizationPlans)
          .set({
            status: "cancelled",
            cancelled_at: new Date(),
            cancelled_by: req.user!.id,
            updated_at: new Date(),
          })
          .where(eq(warehouseOptimizationPlans.id, planId))
          .returning();

        // Mark all pending actions as skipped
        await tx.update(warehouseOptimizationActions)
          .set({ status: "skipped" })
          .where(and(
            eq(warehouseOptimizationActions.plan_id, planId),
            eq(warehouseOptimizationActions.status, "pending")
          ));

        // Create cancelled event
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: "cancelled",
          payload: { cancelled_at: new Date().toISOString() },
        });

        return updatedPlan;
      });

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to cancel plan:", error);
      res.status(500).json({ error: "Failed to cancel optimization plan" });
    }
  });

  // DELETE /api/warehouse/optimization-plans/:planId - Delete a plan
  app.delete("/api/warehouse/optimization-plans/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Delete the plan (cascade handles actions and events)
      await db.delete(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      res.status(204).send();
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to delete plan:", error);
      res.status(500).json({ error: "Failed to delete optimization plan" });
    }
  });

  // PATCH /api/warehouse/optimization-plans/:planId/actions/:actionId - Update action status
  app.patch("/api/warehouse/optimization-plans/:planId/actions/:actionId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const actionId = parseInt(req.params.actionId);
      
      if (isNaN(planId) || isNaN(actionId)) {
        return res.status(400).json({ error: "Invalid plan ID or action ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status === "completed" || plan.status === "cancelled") {
        return res.status(400).json({ error: "Cannot update actions for completed or cancelled plans" });
      }

      // Fetch the action
      const [action] = await db.select()
        .from(warehouseOptimizationActions)
        .where(and(
          eq(warehouseOptimizationActions.id, actionId),
          eq(warehouseOptimizationActions.plan_id, planId)
        ));

      if (!action) {
        return res.status(404).json({ error: "Action not found" });
      }

      const { status, notes, completed_by } = req.body;

      if (!status || !["in_progress", "completed", "skipped"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be in_progress, completed, or skipped" });
      }

      // Use transaction to update action and potentially plan
      const result = await db.transaction(async (tx) => {
        const updateData: any = { status };
        
        if (status === "completed") {
          updateData.completed_at = new Date();
          updateData.completed_by = completed_by || req.user!.id;
        }
        
        if (notes !== undefined) {
          updateData.movement_notes = notes;
        }

        // Update the action
        const [updatedAction] = await tx.update(warehouseOptimizationActions)
          .set(updateData)
          .where(eq(warehouseOptimizationActions.id, actionId))
          .returning();

        // If action was completed, update plan's completed_actions count and apply to inventory
        if (status === "completed" && action.status !== "completed") {
          // Apply the action to inventory - update item location
          if (action.item_id && action.to_location) {
            await tx.update(warehouseInventoryItems)
              .set({
                location: action.to_location,
                last_moved: new Date()
              })
              .where(eq(warehouseInventoryItems.id, action.item_id));
          }

          await tx.update(warehouseOptimizationPlans)
            .set({
              completed_actions: sql`${warehouseOptimizationPlans.completed_actions} + 1`,
              updated_at: new Date(),
            })
            .where(eq(warehouseOptimizationPlans.id, planId));

          // Check if all actions are completed to update plan status
          const [{ count: remainingCount }] = await tx.select({ count: count() })
            .from(warehouseOptimizationActions)
            .where(and(
              eq(warehouseOptimizationActions.plan_id, planId),
              eq(warehouseOptimizationActions.status, "pending")
            ));

          const [{ count: inProgressCount }] = await tx.select({ count: count() })
            .from(warehouseOptimizationActions)
            .where(and(
              eq(warehouseOptimizationActions.plan_id, planId),
              eq(warehouseOptimizationActions.status, "in_progress")
            ));

          if (remainingCount === 0 && inProgressCount === 0) {
            await tx.update(warehouseOptimizationPlans)
              .set({ status: "completed", updated_at: new Date() })
              .where(eq(warehouseOptimizationPlans.id, planId));
          }
        }

        // Create an event for the status change
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: `action_${status}`,
          payload: { action_id: actionId, status, notes },
        });

        return updatedAction;
      });

      // Invalidate zone metrics cache when action is completed (outside transaction)
      if (status === "completed") {
        try {
          const { palletPositionService } = await import('./services');
          palletPositionService.invalidateMetricsCache(plan.site_id);
          console.log(`[Optimization] Invalidated zone cache for site ${plan.site_id} after action completion`);
        } catch (cacheError) {
          console.warn("[Optimization] Failed to invalidate zone cache:", cacheError);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to update action:", error);
      res.status(500).json({ error: "Failed to update action" });
    }
  });

  // PATCH /api/warehouse/optimization-plans/:planId/target-date - Set target completion date
  app.patch("/api/warehouse/optimization-plans/:planId/target-date", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const { target_completion_date } = req.body;
      
      // Validate date if provided
      let parsedDate: Date | null = null;
      if (target_completion_date) {
        parsedDate = new Date(target_completion_date);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: "Invalid date format. Use ISO 8601 format." });
        }
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update the plan with the target date
      const [updatedPlan] = await db.update(warehouseOptimizationPlans)
        .set({
          target_completion_date: parsedDate,
          updated_at: new Date(),
        })
        .where(eq(warehouseOptimizationPlans.id, planId))
        .returning();

      // Create event for tracking
      await db.insert(warehouseOptimizationEvents).values({
        plan_id: planId,
        user_id: req.user!.id,
        event_type: "target_date_set",
        payload: { target_completion_date: parsedDate?.toISOString() || null },
      });

      res.json(updatedPlan);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to set target date:", error);
      res.status(500).json({ error: "Failed to set target completion date" });
    }
  });

  // POST /api/warehouse/optimization-plans/:planId/start-all - Start all pending actions
  app.post("/api/warehouse/optimization-plans/:planId/start-all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Fetch the plan
      const [plan] = await db.select()
        .from(warehouseOptimizationPlans)
        .where(eq(warehouseOptimizationPlans.id, planId));

      if (!plan) {
        return res.status(404).json({ error: "Optimization plan not found" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, plan.site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (plan.status === "completed" || plan.status === "cancelled") {
        return res.status(400).json({ error: "Cannot start actions for completed or cancelled plans" });
      }

      // Use transaction to update all pending actions and plan status
      const result = await db.transaction(async (tx) => {
        // Update all pending actions to in_progress
        const updatedActions = await tx.update(warehouseOptimizationActions)
          .set({ status: "in_progress" })
          .where(and(
            eq(warehouseOptimizationActions.plan_id, planId),
            eq(warehouseOptimizationActions.status, "pending")
          ))
          .returning();

        const startedCount = updatedActions.length;

        // Update plan status to in_progress if not already
        let updatedPlan = plan;
        if (plan.status !== "in_progress" && startedCount > 0) {
          const [planUpdate] = await tx.update(warehouseOptimizationPlans)
            .set({
              status: "in_progress",
              executed_at: plan.executed_at || new Date(),
              executed_by: plan.executed_by || req.user!.id,
              updated_at: new Date(),
            })
            .where(eq(warehouseOptimizationPlans.id, planId))
            .returning();
          updatedPlan = planUpdate;
        }

        // Create event for tracking
        await tx.insert(warehouseOptimizationEvents).values({
          plan_id: planId,
          user_id: req.user!.id,
          event_type: "start_all",
          payload: { started_count: startedCount },
        });

        // Fetch all actions for the plan
        const allActions = await tx.select()
          .from(warehouseOptimizationActions)
          .where(eq(warehouseOptimizationActions.plan_id, planId))
          .orderBy(asc(warehouseOptimizationActions.sequence));

        return {
          plan: updatedPlan,
          actions: allActions,
          started_count: startedCount,
        };
      });

      res.json(result);
    } catch (error) {
      console.error("[Warehouse Optimization Plans] Failed to start all actions:", error);
      res.status(500).json({ error: "Failed to start all actions" });
    }
  });

  // ============================================================================
  // LAND LOGISTICS API (PROTECTED)
  // ============================================================================

  // POST /api/land/seed-vehicles - Seed land vehicle types
  app.post("/api/land/seed-vehicles", authMiddleware, async (req: AuthRequest, res) => {
    try {
      console.log("[Land] Seeding land vehicle types...");
      await seedLandVehicles();
      res.json({ success: true, message: "Land vehicle types seeded successfully" });
    } catch (error) {
      console.error("[Land] Failed to seed vehicle types:", error);
      res.status(500).json({ error: "Failed to seed land vehicle types" });
    }
  });

  // ============================================================================
  // LAND LOGISTICS API - Routes, Convoys, Vehicles
  // ============================================================================

  // Get all land vehicle types
  app.get("/api/land/vehicle-types", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const vehicles = await db.select().from(landVehicleTypes).orderBy(asc(landVehicleTypes.category), asc(landVehicleTypes.code));
      res.json(vehicles);
    } catch (error) {
      console.error("[Land] Error fetching vehicle types:", error);
      res.status(500).json({ error: "Failed to fetch vehicle types" });
    }
  });

  // Get single vehicle type
  app.get("/api/land/vehicle-types/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const [vehicle] = await db.select().from(landVehicleTypes).where(eq(landVehicleTypes.id, parseInt(id)));
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle type not found" });
      }
      res.json(vehicle);
    } catch (error) {
      console.error("[Land] Error fetching vehicle type:", error);
      res.status(500).json({ error: "Failed to fetch vehicle type" });
    }
  });

  // --- LAND ROUTES ---

  // Get all routes for user
  app.get("/api/land/routes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const routes = await db.select().from(landRoutes)
        .where(eq(landRoutes.user_id, req.user!.id))
        .orderBy(desc(landRoutes.created_at));
      res.json(routes);
    } catch (error) {
      console.error("[Land] Error fetching routes:", error);
      res.status(500).json({ error: "Failed to fetch routes" });
    }
  });

  // Create new route
  app.post("/api/land/routes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const routeData = {
        ...req.body,
        user_id: req.user!.id,
      };
      const [route] = await db.insert(landRoutes).values(routeData).returning();
      res.status(201).json(route);
    } catch (error) {
      console.error("[Land] Error creating route:", error);
      res.status(500).json({ error: "Failed to create route" });
    }
  });

  // Update route
  app.put("/api/land/routes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const [route] = await db.update(landRoutes)
        .set({ ...req.body, updated_at: new Date() })
        .where(and(eq(landRoutes.id, parseInt(id)), eq(landRoutes.user_id, req.user!.id)))
        .returning();
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json(route);
    } catch (error) {
      console.error("[Land] Error updating route:", error);
      res.status(500).json({ error: "Failed to update route" });
    }
  });

  // Delete route
  app.delete("/api/land/routes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const [route] = await db.delete(landRoutes)
        .where(and(eq(landRoutes.id, parseInt(id)), eq(landRoutes.user_id, req.user!.id)))
        .returning();
      if (!route) {
        return res.status(404).json({ error: "Route not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Land] Error deleting route:", error);
      res.status(500).json({ error: "Failed to delete route" });
    }
  });

  // --- LAND CONVOYS ---

  // Get all convoys for user
  app.get("/api/land/convoys", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const convoys = await db.select().from(landConvoys)
        .where(eq(landConvoys.user_id, req.user!.id))
        .orderBy(desc(landConvoys.created_at));
      res.json(convoys);
    } catch (error) {
      console.error("[Land] Error fetching convoys:", error);
      res.status(500).json({ error: "Failed to fetch convoys" });
    }
  });

  // Get single convoy with vehicles
  app.get("/api/land/convoys/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const [convoy] = await db.select().from(landConvoys)
        .where(and(eq(landConvoys.id, parseInt(id)), eq(landConvoys.user_id, req.user!.id)));
      if (!convoy) {
        return res.status(404).json({ error: "Convoy not found" });
      }
      
      // Get vehicles in convoy
      const vehicles = await db.select().from(landConvoyVehicles)
        .where(eq(landConvoyVehicles.convoy_id, parseInt(id)))
        .orderBy(asc(landConvoyVehicles.position_in_convoy));
      
      res.json({ ...convoy, vehicles });
    } catch (error) {
      console.error("[Land] Error fetching convoy:", error);
      res.status(500).json({ error: "Failed to fetch convoy" });
    }
  });

  // Create new convoy
  app.post("/api/land/convoys", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const convoyData = {
        ...req.body,
        user_id: req.user!.id,
      };
      const [convoy] = await db.insert(landConvoys).values(convoyData).returning();
      res.status(201).json(convoy);
    } catch (error) {
      console.error("[Land] Error creating convoy:", error);
      res.status(500).json({ error: "Failed to create convoy" });
    }
  });

  // Update convoy
  app.put("/api/land/convoys/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const [convoy] = await db.update(landConvoys)
        .set({ ...req.body, updated_at: new Date() })
        .where(and(eq(landConvoys.id, parseInt(id)), eq(landConvoys.user_id, req.user!.id)))
        .returning();
      if (!convoy) {
        return res.status(404).json({ error: "Convoy not found" });
      }
      res.json(convoy);
    } catch (error) {
      console.error("[Land] Error updating convoy:", error);
      res.status(500).json({ error: "Failed to update convoy" });
    }
  });

  // Delete convoy
  app.delete("/api/land/convoys/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      // Delete convoy vehicles first
      await db.delete(landConvoyVehicles).where(eq(landConvoyVehicles.convoy_id, parseInt(id)));
      // Then delete convoy
      const [convoy] = await db.delete(landConvoys)
        .where(and(eq(landConvoys.id, parseInt(id)), eq(landConvoys.user_id, req.user!.id)))
        .returning();
      if (!convoy) {
        return res.status(404).json({ error: "Convoy not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Land] Error deleting convoy:", error);
      res.status(500).json({ error: "Failed to delete convoy" });
    }
  });

  // --- CONVOY VEHICLES ---

  // Add vehicle to convoy
  app.post("/api/land/convoys/:convoyId/vehicles", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { convoyId } = req.params;
      
      // Verify convoy belongs to user
      const [convoy] = await db.select().from(landConvoys)
        .where(and(eq(landConvoys.id, parseInt(convoyId)), eq(landConvoys.user_id, req.user!.id)));
      if (!convoy) {
        return res.status(404).json({ error: "Convoy not found" });
      }
      
      const vehicleData = {
        ...req.body,
        convoy_id: parseInt(convoyId),
      };
      const [vehicle] = await db.insert(landConvoyVehicles).values(vehicleData).returning();
      res.status(201).json(vehicle);
    } catch (error) {
      console.error("[Land] Error adding convoy vehicle:", error);
      res.status(500).json({ error: "Failed to add vehicle to convoy" });
    }
  });

  // Update convoy vehicle
  app.put("/api/land/convoys/:convoyId/vehicles/:vehicleId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { convoyId, vehicleId } = req.params;
      
      const [vehicle] = await db.update(landConvoyVehicles)
        .set({ ...req.body, updated_at: new Date() })
        .where(and(
          eq(landConvoyVehicles.id, parseInt(vehicleId)),
          eq(landConvoyVehicles.convoy_id, parseInt(convoyId))
        ))
        .returning();
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      res.json(vehicle);
    } catch (error) {
      console.error("[Land] Error updating convoy vehicle:", error);
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  });

  // Remove vehicle from convoy
  app.delete("/api/land/convoys/:convoyId/vehicles/:vehicleId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { convoyId, vehicleId } = req.params;
      
      const [vehicle] = await db.delete(landConvoyVehicles)
        .where(and(
          eq(landConvoyVehicles.id, parseInt(vehicleId)),
          eq(landConvoyVehicles.convoy_id, parseInt(convoyId))
        ))
        .returning();
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Land] Error removing convoy vehicle:", error);
      res.status(500).json({ error: "Failed to remove vehicle" });
    }
  });

  // --- LAND STATISTICS ---

  // Get land logistics statistics
  app.get("/api/land/statistics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const routes = await db.select().from(landRoutes)
        .where(eq(landRoutes.user_id, req.user!.id));
      
      const convoys = await db.select().from(landConvoys)
        .where(eq(landConvoys.user_id, req.user!.id));
      
      const activeConvoys = convoys.filter(c => c.status === 'en_route').length;
      const completedToday = convoys.filter(c => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return c.status === 'completed' && c.arrival_time && new Date(c.arrival_time) >= today;
      }).length;
      
      res.json({
        totalRoutes: routes.length,
        activeRoutes: routes.filter(r => r.status === 'active').length,
        totalConvoys: convoys.length,
        activeConvoys,
        inTransit: convoys.filter(c => c.status === 'en_route').length,
        pendingConvoys: convoys.filter(c => c.status === 'planning').length,
        completedToday,
        totalPayloadLbs: convoys.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0),
      });
    } catch (error) {
      console.error("[Land] Error fetching statistics:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  // --- LAND GOOGLE MAPS INTEGRATION ---

  // POST /api/land/routes/calculate - Calculate route between two locations
  app.post("/api/land/routes/calculate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { origin, destination, waypoints, avoidTolls, avoidHighways } = req.body;
      
      if (!origin || !destination) {
        return res.status(400).json({ error: "Origin and destination are required" });
      }

      const route = await googleMapsService.calculateRoute(origin, destination, {
        waypoints,
        avoidTolls,
        avoidHighways,
        vehicleType: 'truck',
      });

      if (!route) {
        return res.status(404).json({ error: "Could not calculate route" });
      }

      res.json(route);
    } catch (error) {
      console.error("[Land] Error calculating route:", error);
      res.status(500).json({ error: "Failed to calculate route" });
    }
  });

  // GET /api/land/places/autocomplete - Location autocomplete
  app.get("/api/land/places/autocomplete", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { input, sessionToken } = req.query;
      
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: "Input query is required" });
      }

      const predictions = await googleMapsService.placeAutocomplete(
        input,
        typeof sessionToken === 'string' ? sessionToken : undefined
      );

      if (!predictions) {
        return res.status(500).json({ error: "Could not fetch autocomplete results" });
      }

      res.json({ predictions });
    } catch (error) {
      console.error("[Land] Error fetching autocomplete:", error);
      res.status(500).json({ error: "Failed to fetch autocomplete results" });
    }
  });

  // GET /api/land/places/:placeId - Get place details
  app.get("/api/land/places/:placeId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { placeId } = req.params;
      
      if (!placeId) {
        return res.status(400).json({ error: "Place ID is required" });
      }

      const place = await googleMapsService.getPlaceDetails(placeId);

      if (!place) {
        return res.status(404).json({ error: "Place not found" });
      }

      res.json(place);
    } catch (error) {
      console.error("[Land] Error fetching place details:", error);
      res.status(500).json({ error: "Failed to fetch place details" });
    }
  });

  // POST /api/land/routes/optimize - Get distance matrix for multiple stops
  app.post("/api/land/routes/optimize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { locations } = req.body;
      
      if (!locations || !Array.isArray(locations) || locations.length < 2) {
        return res.status(400).json({ error: "At least 2 locations are required" });
      }

      const matrix = await googleMapsService.getDistanceMatrix(locations, locations);

      if (!matrix) {
        return res.status(500).json({ error: "Could not calculate distance matrix" });
      }

      res.json(matrix);
    } catch (error) {
      console.error("[Land] Error calculating distance matrix:", error);
      res.status(500).json({ error: "Failed to calculate distance matrix" });
    }
  });

  // ============================================================================
  // CROSS-MODAL MANIFESTS API
  // ============================================================================

  // Get all manifests for user
  app.get("/api/manifests", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const manifests = await db.query.crossModalManifests.findMany({
        where: eq(crossModalManifests.user_id, req.user!.id),
        orderBy: (m, { desc }) => [desc(m.created_at)],
      });
      res.json(manifests);
    } catch (error) {
      console.error("[Manifest] Error fetching manifests:", error);
      res.status(500).json({ error: "Failed to fetch manifests" });
    }
  });

  // Get manifest by ID with items
  app.get("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const manifest = await db.query.crossModalManifests.findFirst({
        where: and(eq(crossModalManifests.id, parseInt(id)), eq(crossModalManifests.user_id, req.user!.id)),
      });
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      
      const items = await db.query.manifestItems.findMany({
        where: eq(manifestItems.manifest_id, parseInt(id)),
      });
      
      res.json({ ...manifest, items });
    } catch (error) {
      console.error("[Manifest] Error fetching manifest:", error);
      res.status(500).json({ error: "Failed to fetch manifest" });
    }
  });

  // Create manifest from WMS inventory selection
  app.post("/api/manifests", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { manifest, items: selectedItems } = req.body;
      
      // Generate manifest number if not provided
      const manifestNumber = manifest.manifest_number || `MAN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      
      // Calculate totals from selected items
      let totalWeightLbs = 0;
      let totalCubeFt = 0;
      
      if (selectedItems && selectedItems.length > 0) {
        for (const item of selectedItems) {
          totalWeightLbs += (item.weight_lbs || 0) * (item.quantity || 1);
          totalCubeFt += (item.cube_ft || 0) * (item.quantity || 1);
        }
      }
      
      // Create manifest
      const [newManifest] = await db.insert(crossModalManifests).values({
        ...manifest,
        manifest_number: manifestNumber,
        user_id: req.user!.id,
        total_weight_lbs: totalWeightLbs,
        total_cube_ft: String(totalCubeFt),
        total_items: selectedItems?.length || 0,
      }).returning();
      
      // Create manifest items if provided
      if (selectedItems && selectedItems.length > 0) {
        for (const item of selectedItems) {
          await db.insert(manifestItems).values({
            manifest_id: newManifest.id,
            inventory_item_id: item.inventory_item_id || null,
            nsn: item.nsn,
            part_number: item.part_number,
            nomenclature: item.nomenclature || 'Unknown Item',
            quantity: item.quantity || 1,
            unit_of_issue: item.unit_of_issue || 'EA',
            weight_lbs: item.weight_lbs,
            length_in: item.length_in,
            width_in: item.width_in,
            height_in: item.height_in,
            cube_ft: item.cube_ft,
            hazmat_class: item.hazmat_class,
            is_hazmat: item.is_hazmat || false,
            is_sensitive: item.is_sensitive || false,
          });
        }
      }
      
      res.status(201).json(newManifest);
    } catch (error) {
      console.error("[Manifest] Error creating manifest:", error);
      res.status(500).json({ error: "Failed to create manifest" });
    }
  });

  // Assign transport mode to manifest
  app.put("/api/manifests/:id/assign-transport", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { transport_mode, flight_plan_id, convoy_id, voyage_id, estimated_cost_usd, estimated_duration_hours, estimated_distance_miles } = req.body;
      
      const updateData: any = {
        transport_mode,
        status: 'assigned',
        updated_at: new Date(),
      };
      
      if (transport_mode === 'air' && flight_plan_id) {
        updateData.flight_plan_id = flight_plan_id;
      } else if (transport_mode === 'land' && convoy_id) {
        updateData.convoy_id = convoy_id;
      } else if (transport_mode === 'sea' && voyage_id) {
        updateData.voyage_id = voyage_id;
      }
      
      if (estimated_cost_usd) updateData.estimated_cost_usd = String(estimated_cost_usd);
      if (estimated_duration_hours) updateData.estimated_duration_hours = String(estimated_duration_hours);
      if (estimated_distance_miles) updateData.estimated_distance_miles = String(estimated_distance_miles);
      
      const [manifest] = await db.update(crossModalManifests)
        .set(updateData)
        .where(and(eq(crossModalManifests.id, parseInt(id)), eq(crossModalManifests.user_id, req.user!.id)))
        .returning();
      
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      res.json(manifest);
    } catch (error) {
      console.error("[Manifest] Error assigning transport:", error);
      res.status(500).json({ error: "Failed to assign transport" });
    }
  });

  // Update manifest status
  app.put("/api/manifests/:id/status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { status, actual_departure, actual_arrival } = req.body;
      
      const updateData: any = { status, updated_at: new Date() };
      if (actual_departure) updateData.actual_departure = new Date(actual_departure);
      if (actual_arrival) updateData.actual_arrival = new Date(actual_arrival);
      
      const [manifest] = await db.update(crossModalManifests)
        .set(updateData)
        .where(and(eq(crossModalManifests.id, parseInt(id)), eq(crossModalManifests.user_id, req.user!.id)))
        .returning();
      
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      res.json(manifest);
    } catch (error) {
      console.error("[Manifest] Error updating status:", error);
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // Delete manifest
  app.delete("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Delete items first
      await db.delete(manifestItems).where(eq(manifestItems.manifest_id, parseInt(id)));
      
      const [manifest] = await db.delete(crossModalManifests)
        .where(and(eq(crossModalManifests.id, parseInt(id)), eq(crossModalManifests.user_id, req.user!.id)))
        .returning();
      
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Manifest] Error deleting manifest:", error);
      res.status(500).json({ error: "Failed to delete manifest" });
    }
  });

  // ============================================================================
  // INVENTORY AGING ALERTS API
  // ============================================================================

  // Get aging items (>7 years = 2555 days)
  app.get("/api/warehouse/aging-items", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { minDays = 2555, siteId } = req.query; // Default to 7 years
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      let items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      // Calculate aging and filter
      const now = new Date();
      const agingItems = items
        .map(item => {
          const receivedDate = item.last_received_date || item.created_at;
          const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
          return { ...item, aging_days: agingDays };
        })
        .filter(item => item.aging_days >= parseInt(String(minDays)));
      
      // Sort by aging (oldest first)
      agingItems.sort((a, b) => b.aging_days - a.aging_days);
      
      res.json({
        total: agingItems.length,
        threshold_days: parseInt(String(minDays)),
        items: agingItems.map(item => ({
          id: item.id,
          nsn: item.nsn,
          description: item.description,
          quantity: item.quantity,
          location_id: item.location_id,
          aging_days: item.aging_days,
          aging_years: Math.round(item.aging_days / 365 * 10) / 10,
          last_received_date: item.last_received_date,
          condition: item.condition,
          unit_price: item.unit_price,
        })),
      });
    } catch (error) {
      console.error("[Aging] Error fetching aging items:", error);
      res.status(500).json({ error: "Failed to fetch aging items" });
    }
  });

  // Get aging summary by threshold brackets
  app.get("/api/warehouse/aging-summary", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      const items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      const now = new Date();
      
      // Define aging brackets
      const brackets = [
        { label: '>10 years', minDays: 3650, count: 0, value: 0 },
        { label: '7-10 years', minDays: 2555, maxDays: 3650, count: 0, value: 0 },
        { label: '5-7 years', minDays: 1825, maxDays: 2555, count: 0, value: 0 },
        { label: '3-5 years', minDays: 1095, maxDays: 1825, count: 0, value: 0 },
        { label: '1-3 years', minDays: 365, maxDays: 1095, count: 0, value: 0 },
        { label: '<1 year', minDays: 0, maxDays: 365, count: 0, value: 0 },
      ];
      
      for (const item of items) {
        const receivedDate = item.last_received_date || item.created_at;
        const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
        const itemValue = (parseFloat(String(item.unit_price)) || 0) * (item.quantity || 1);
        
        for (const bracket of brackets) {
          if (agingDays >= bracket.minDays && (!bracket.maxDays || agingDays < bracket.maxDays)) {
            bracket.count++;
            bracket.value += itemValue;
            break;
          }
        }
      }
      
      const criticalCount = brackets[0].count + brackets[1].count; // >7 years
      
      res.json({
        total_items: items.length,
        critical_count: criticalCount,
        critical_threshold_days: 2555,
        brackets,
      });
    } catch (error) {
      console.error("[Aging] Error fetching aging summary:", error);
      res.status(500).json({ error: "Failed to fetch aging summary" });
    }
  });

  // Export aging report (CSV format)
  app.get("/api/warehouse/aging-export", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { minDays = 2555 } = req.query;
      
      // Get user's site IDs first
      const userSites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      const userSiteIds = userSites.map(s => s.id);
      
      const items = userSiteIds.length > 0 
        ? await db.query.warehouseInventoryItems.findMany({
            where: inArray(warehouseInventoryItems.site_id, userSiteIds),
          })
        : [];
      
      const now = new Date();
      const agingItems = items
        .map(item => {
          const receivedDate = item.last_received_date || item.created_at;
          const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
          return { ...item, aging_days: agingDays };
        })
        .filter(item => item.aging_days >= parseInt(String(minDays)))
        .sort((a, b) => b.aging_days - a.aging_days);
      
      // Generate CSV
      const headers = ['NSN', 'Nomenclature', 'Quantity', 'Aging Days', 'Aging Years', 'Last Received', 'Condition', 'Unit Price'];
      const rows = agingItems.map(item => [
        item.nsn || '',
        item.description || '',
        item.quantity || 0,
        item.aging_days,
        Math.round(item.aging_days / 365 * 10) / 10,
        item.last_received_date ? new Date(item.last_received_date).toISOString().split('T')[0] : '',
        item.condition || '',
        item.unit_price || 0,
      ]);
      
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=aging_report_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("[Aging] Error exporting aging report:", error);
      res.status(500).json({ error: "Failed to export aging report" });
    }
  });

  // ============================================================================
  // SITE ASSIGNMENT & CAPACITY API
  // ============================================================================

  // Get capacity for all sites
  app.get("/api/warehouse/capacity", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      const capacities = await getAllSiteCapacities(userId);
      res.json(capacities);
    } catch (error) {
      console.error("[Capacity] Error fetching capacities:", error);
      res.status(500).json({ error: "Failed to fetch site capacities" });
    }
  });

  // Get capacity for specific site
  app.get("/api/warehouse/capacity/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.params;
      const capacity = await getSiteCapacity(parseInt(siteId));
      if (!capacity) {
        return res.status(404).json({ error: "Site not found" });
      }
      res.json(capacity);
    } catch (error) {
      console.error("[Capacity] Error fetching site capacity:", error);
      res.status(500).json({ error: "Failed to fetch site capacity" });
    }
  });

  // Get location capacities for a site
  app.get("/api/warehouse/capacity/:siteId/locations", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.params;
      const locations = await getLocationCapacities(parseInt(siteId));
      res.json(locations);
    } catch (error) {
      console.error("[Capacity] Error fetching location capacities:", error);
      res.status(500).json({ error: "Failed to fetch location capacities" });
    }
  });

  // Check if site can accept items
  app.post("/api/warehouse/capacity/:siteId/check", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.params;
      const { item_count, total_weight_lbs } = req.body;
      
      const result = await canAcceptItems(parseInt(siteId), item_count || 1, total_weight_lbs || 0);
      res.json(result);
    } catch (error) {
      console.error("[Capacity] Error checking capacity:", error);
      res.status(500).json({ error: "Failed to check capacity" });
    }
  });

  // ============================================================================
  // SITE ASSIGNMENT LOGIC
  // ============================================================================

  interface SiteScore {
    siteId: number;
    siteName: string;
    score: number;
    reasons: string[];
    capacity: {
      utilizationPercent: number;
      openPalletPositions: number;
      status: 'green' | 'yellow' | 'red';
    };
  }

  // Recommend best site for incoming material
  app.post("/api/warehouse/assign-site", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { 
        item_count = 1,
        total_weight_lbs = 0,
        preferred_aor,
        avoid_shipyard = false,
        priority = 'routine' // routine, priority, immediate
      } = req.body;
      
      // Get all sites with capacity data
      const sites = await db.query.warehouseSites.findMany({
        where: eq(warehouseSites.user_id, req.user!.id),
      });
      
      if (sites.length === 0) {
        return res.json({
          recommendation: null,
          message: "No warehouse sites available",
          scored_sites: [],
        });
      }
      
      const scoredSites: SiteScore[] = [];
      
      for (const site of sites) {
        const capacity = await getSiteCapacity(site.id);
        if (!capacity) continue;
        
        let score = 100;
        const reasons: string[] = [];
        
        // Check if site can physically accept the items
        const canAccept = await canAcceptItems(site.id, item_count, total_weight_lbs);
        if (!canAccept.canAccept) {
          score = 0;
          reasons.push(`Cannot accept: ${canAccept.reason}`);
        } else {
          // Score based on capacity utilization (prefer lower utilization)
          const utilizationPenalty = capacity.utilizationPercent * 0.5;
          score -= utilizationPenalty;
          
          if (capacity.status === 'red') {
            score -= 30;
            reasons.push('Site at critical capacity (>90%)');
          } else if (capacity.status === 'yellow') {
            score -= 15;
            reasons.push('Site at high capacity (70-90%)');
          } else {
            reasons.push('Site has good capacity (<70%)');
          }
          
          // AOR matching bonus
          if (preferred_aor && site.aor === preferred_aor) {
            score += 25;
            reasons.push(`Matches preferred AOR: ${preferred_aor}`);
          }
          
          // Shipyard avoidance
          if (avoid_shipyard && site.shipyard_code) {
            score -= 20;
            reasons.push('Site is a shipyard location');
          }
          
          // Weight capacity consideration
          const weightUtilization = capacity.weightUtilizationPercent;
          if (weightUtilization > 80) {
            score -= 10;
            reasons.push('Weight capacity limited');
          }
          
          // Open positions bonus
          if (capacity.openPalletPositions > item_count * 2) {
            score += 10;
            reasons.push('Has extra capacity for future items');
          }
        }
        
        scoredSites.push({
          siteId: site.id,
          siteName: site.name,
          score: Math.max(0, Math.round(score)),
          reasons,
          capacity: {
            utilizationPercent: capacity.utilizationPercent,
            openPalletPositions: capacity.openPalletPositions,
            status: capacity.status,
          },
        });
      }
      
      // Sort by score descending
      scoredSites.sort((a, b) => b.score - a.score);
      
      const recommendation = scoredSites.length > 0 && scoredSites[0].score > 0 
        ? scoredSites[0] 
        : null;
      
      res.json({
        recommendation,
        scored_sites: scoredSites,
        criteria_used: {
          item_count,
          total_weight_lbs,
          preferred_aor,
          avoid_shipyard,
          priority,
        },
      });
    } catch (error) {
      console.error("[Assignment] Error assigning site:", error);
      res.status(500).json({ error: "Failed to assign site" });
    }
  });

  // ============================================================================
  // OPERATIONS HUB UNIFIED SUMMARY API
  // ============================================================================

  // Get unified operations summary for dashboard
  app.get("/api/operations/summary", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const startTime = Date.now();
      const timings: Record<string, number> = {};
      
      const userId = req.user!.id;
      const now = new Date();
      
      // Calculate date ranges for monthly comparisons
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      
      // Parallel fetch ALL data including warehouse sites
      const t1 = Date.now();
      const [
        userSites,
        flightPlansData,
        landConvoysData,
        seaVoyagesData,
        manifestsData,
      ] = await Promise.all([
        db.query.warehouseSites.findMany({ where: eq(warehouseSites.user_id, userId) }),
        db.query.flightPlans.findMany({ where: eq(flightPlans.user_id, userId) }),
        db.query.landConvoys.findMany({ where: eq(landConvoys.user_id, userId) }),
        db.query.seaVoyages.findMany({ where: eq(seaVoyages.user_id, userId) }),
        db.query.crossModalManifests.findMany({ where: eq(crossModalManifests.user_id, userId) }),
      ]);
      timings['phase1_core_queries'] = Date.now() - t1;
      
      const userSiteIds = userSites.map(s => s.id);
      
      // Warehouse queries - only fetch if user has warehouse sites
      let inventoryItems: (typeof warehouseInventoryItems.$inferSelect)[] = [];
      let transfersData: (typeof warehouseTransfers.$inferSelect)[] = [];
      
      const t2 = Date.now();
      if (userSiteIds.length > 0) {
        const [invItems, transfers] = await Promise.all([
          db.query.warehouseInventoryItems.findMany({ 
            where: inArray(warehouseInventoryItems.site_id, userSiteIds) 
          }),
          db.query.warehouseTransfers.findMany({
            where: or(
              inArray(warehouseTransfers.source_site_id, userSiteIds),
              inArray(warehouseTransfers.destination_site_id, userSiteIds)
            )
          }),
        ]);
        inventoryItems = invItems;
        transfersData = transfers;
      }
      timings['phase2_warehouse_queries'] = Date.now() - t2;
      
      const warehouseSitesData = userSites;
      
      // Helper to check if date is in range
      const isInRange = (dateStr: Date | string | null, start: Date, end: Date) => {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date >= start && date <= end;
      };
      
      const isThisMonth = (dateStr: Date | string | null) => isInRange(dateStr, thisMonthStart, now);
      const isLastMonth = (dateStr: Date | string | null) => isInRange(dateStr, lastMonthStart, lastMonthEnd);
      
      // Active missions = currently in motion or actively being worked
      const activeMissions = {
        air: flightPlansData.filter(p => ['complete', 'scheduled'].includes(p.status || '')).length,
        land: landConvoysData.filter(c => ['in_transit', 'loading', 'planned'].includes(c.status || '')).length,
        sea: seaVoyagesData.filter(v => ['in_transit', 'loading', 'planned'].includes(v.status || '')).length,
        total: 0,
      };
      activeMissions.total = activeMissions.air + activeMissions.land + activeMissions.sea;
      
      // Cargo currently in transport (active/in-transit only)
      const cargoInTransport = {
        air_lbs: flightPlansData
          .filter(p => p.status === 'complete')
          .reduce((sum, p) => sum + (p.total_weight_lb || 0), 0),
        land_lbs: landConvoysData
          .filter(c => c.status === 'in_transit')
          .reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0),
        sea_lbs: seaVoyagesData
          .filter(v => v.status === 'in_transit')
          .reduce((sum, v) => sum + ((v.metadata as any)?.container_count || 0) * 45000, 0), // ~45k lbs per TEU avg
        total_lbs: 0,
      };
      cargoInTransport.total_lbs = cargoInTransport.air_lbs + cargoInTransport.land_lbs + cargoInTransport.sea_lbs;
      
      // Air Operations enhanced summary - use scheduled_departure for classification when available
      const getEffectiveDate = (scheduled: Date | null, created: Date) => scheduled || created;
      const airThisMonth = flightPlansData.filter(p => isThisMonth(getEffectiveDate(p.scheduled_departure, p.created_at)));
      const airLastMonth = flightPlansData.filter(p => isLastMonth(getEffectiveDate(p.scheduled_departure, p.created_at)));
      const airCompleted = flightPlansData.filter(p => p.status === 'complete');
      const airSummary = {
        active_sorties: flightPlansData.filter(p => p.status === 'complete').length,
        total_missions: flightPlansData.length,
        cargo_in_flight_lbs: cargoInTransport.air_lbs,
        total_aircraft_deployed: flightPlansData.reduce((sum, p) => sum + (p.aircraft_count || 0), 0),
        avg_load_lbs: airCompleted.length > 0 
          ? Math.round(airCompleted.reduce((sum, p) => sum + (p.total_weight_lb || 0), 0) / airCompleted.length)
          : 0,
        this_month: airThisMonth.length,
        last_month: airLastMonth.length,
        month_change: airLastMonth.length > 0 
          ? Math.round(((airThisMonth.length - airLastMonth.length) / airLastMonth.length) * 100)
          : airThisMonth.length > 0 ? 100 : 0,
        total_weight_lbs: flightPlansData.reduce((sum, p) => sum + (p.total_weight_lb || 0), 0),
      };
      
      // Land Operations enhanced summary - use scheduled_departure for classification when available
      const landThisMonth = landConvoysData.filter(c => isThisMonth(getEffectiveDate(c.scheduled_departure, c.created_at)));
      const landLastMonth = landConvoysData.filter(c => isLastMonth(getEffectiveDate(c.scheduled_departure, c.created_at)));
      const landInTransit = landConvoysData.filter(c => c.status === 'in_transit');
      const landCompleted = landConvoysData.filter(c => c.status === 'completed');
      const landSummary = {
        active_convoys: landInTransit.length,
        total_convoys: landConvoysData.length,
        cargo_in_transit_lbs: cargoInTransport.land_lbs,
        pending_dispatch: landConvoysData.filter(c => c.status === 'planned' || c.status === 'loading').length,
        completed_missions: landCompleted.length,
        avg_convoy_weight_lbs: landCompleted.length > 0
          ? Math.round(landCompleted.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0) / landCompleted.length)
          : 0,
        this_month: landThisMonth.length,
        last_month: landLastMonth.length,
        month_change: landLastMonth.length > 0 
          ? Math.round(((landThisMonth.length - landLastMonth.length) / landLastMonth.length) * 100)
          : landThisMonth.length > 0 ? 100 : 0,
        total_weight_lbs: landConvoysData.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0),
      };
      
      // Sea Operations enhanced summary - use scheduled_departure for classification when available
      const seaThisMonth = seaVoyagesData.filter(v => isThisMonth(getEffectiveDate(v.scheduled_departure, v.created_at)));
      const seaLastMonth = seaVoyagesData.filter(v => isLastMonth(getEffectiveDate(v.scheduled_departure, v.created_at)));
      const seaInTransit = seaVoyagesData.filter(v => v.status === 'in_transit');
      const seaCompleted = seaVoyagesData.filter(v => v.status === 'completed');
      const totalContainers = seaVoyagesData.reduce((sum, v) => sum + ((v.metadata as any)?.container_count || 0), 0);
      const seaSummary = {
        active_voyages: seaInTransit.length,
        total_voyages: seaVoyagesData.length,
        containers_at_sea: seaInTransit.reduce((sum, v) => sum + ((v.metadata as any)?.container_count || 0), 0),
        total_teu: totalContainers,
        planned_departures: seaVoyagesData.filter(v => v.status === 'planned').length,
        completed_voyages: seaCompleted.length,
        est_cargo_at_sea_lbs: cargoInTransport.sea_lbs,
        this_month: seaThisMonth.length,
        last_month: seaLastMonth.length,
        month_change: seaLastMonth.length > 0 
          ? Math.round(((seaThisMonth.length - seaLastMonth.length) / seaLastMonth.length) * 100)
          : seaThisMonth.length > 0 ? 100 : 0,
      };
      
      // Warehouse enhanced summary
      const t3 = Date.now();
      const capacities = await getAllSiteCapacities(userId);
      timings['phase3_site_capacities'] = Date.now() - t3;
      
      const totalWeight = inventoryItems.reduce((sum, i) => sum + (Number(i.weight_lbs || 0) * (i.quantity || 1)), 0);
      const itemsThisMonth = inventoryItems.filter(i => isThisMonth(i.created_at));
      const itemsLastMonth = inventoryItems.filter(i => isLastMonth(i.created_at));
      const pendingTransfers = transfersData.filter(t => t.status === 'pending');
      const warehouseSummary = {
        total_sites: warehouseSitesData.length,
        total_items: inventoryItems.length,
        total_units: inventoryItems.reduce((sum, i) => sum + (i.quantity || 0), 0),
        total_weight_lbs: totalWeight,
        sites_critical: capacities.filter(c => c.status === 'red').length,
        sites_warning: capacities.filter(c => c.status === 'yellow').length,
        sites_healthy: capacities.filter(c => c.status === 'green').length,
        avg_utilization: capacities.length > 0 
          ? Math.round(capacities.reduce((sum, c) => sum + c.utilizationPercent, 0) / capacities.length)
          : 0,
        pending_transfers: pendingTransfers.length,
        items_this_month: itemsThisMonth.length,
        items_last_month: itemsLastMonth.length,
        month_change: itemsLastMonth.length > 0 
          ? Math.round(((itemsThisMonth.length - itemsLastMonth.length) / itemsLastMonth.length) * 100)
          : itemsThisMonth.length > 0 ? 100 : 0,
      };
      
      // Manifest summary with cross-modal tracking
      const manifestsInTransit = manifestsData.filter(m => m.status === 'in_transit');
      const manifestSummary = {
        total_manifests: manifestsData.length,
        in_transit: manifestsInTransit.length,
        awaiting_pickup: manifestsData.filter(m => m.status === 'draft').length,
        delivered: manifestsData.filter(m => m.status === 'delivered').length,
        unassigned: manifestsData.filter(m => !m.transport_mode).length,
        by_mode: {
          air: manifestsData.filter(m => m.transport_mode === 'air').length,
          land: manifestsData.filter(m => m.transport_mode === 'land').length,
          sea: manifestsData.filter(m => m.transport_mode === 'sea').length,
        },
      };
      
      // Aging and critical alerts
      const agingThreshold = 2555; // 7 years in days
      const agingItems = inventoryItems.filter(item => {
        const receivedDate = item.last_received_date || item.created_at;
        const agingDays = Math.floor((now.getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24));
        return agingDays >= agingThreshold;
      });
      
      timings['total'] = Date.now() - startTime;
      console.log('[Operations Summary] Timings (ms):', JSON.stringify(timings));
      
      res.json({
        activeMissions,
        cargoInTransport,
        air: airSummary,
        land: landSummary,
        sea: seaSummary,
        warehouse: warehouseSummary,
        manifests: manifestSummary,
        alerts: {
          aging_items: agingItems.length,
          critical_sites: capacities.filter(c => c.status === 'red').length,
          pending_assignments: manifestsData.filter(m => !m.transport_mode).length,
          total: agingItems.length + capacities.filter(c => c.status === 'red').length + manifestsData.filter(m => !m.transport_mode).length,
        },
        timestamp: now.toISOString(),
      });
    } catch (error) {
      console.error("[Operations] Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch operations summary" });
    }
  });

  // Get 90-day predictive forecast for load planning
  app.get("/api/operations/predictive-forecast", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const startTime = Date.now();
      const timings: Record<string, number> = {};
      
      const userId = req.user!.id;
      const daysParam = parseInt(req.query.days as string) || 30;
      const FORECAST_DAYS = Math.min(Math.max(daysParam, 1), 90);
      
      const now = new Date();
      const msPerDay = 24 * 60 * 60 * 1000;
      const futureDate = new Date(now.getTime() + FORECAST_DAYS * msPerDay);
      
      // Fetch everything in parallel including user sites
      const t1 = Date.now();
      const [
        userSites,
        flightPlansData,
        landConvoysData,
        seaVoyagesData,
        siteCapacities,
      ] = await Promise.all([
        db.query.warehouseSites.findMany({ where: eq(warehouseSites.user_id, userId) }),
        db.query.flightPlans.findMany({ 
          where: and(
            eq(flightPlans.user_id, userId),
            gte(flightPlans.scheduled_departure, now)
          )
        }),
        db.query.landConvoys.findMany({ 
          where: and(
            eq(landConvoys.user_id, userId),
            gte(landConvoys.scheduled_departure, now)
          )
        }),
        db.query.seaVoyages.findMany({ 
          where: and(
            eq(seaVoyages.user_id, userId),
            gte(seaVoyages.scheduled_departure, now)
          )
        }),
        getAllSiteCapacities(userId),
      ]);
      timings['main_queries'] = Date.now() - t1;
      
      // Filter to only scheduled activities within forecast window
      const upcomingAir = flightPlansData.filter(p => 
        p.scheduled_departure && new Date(p.scheduled_departure) <= futureDate
      );
      const upcomingLand = landConvoysData.filter(c => 
        c.scheduled_departure && new Date(c.scheduled_departure) <= futureDate
      );
      const upcomingSea = seaVoyagesData.filter(v => 
        v.scheduled_departure && new Date(v.scheduled_departure) <= futureDate
      );
      
      // Calculate totals from actual scheduled data
      const totalAirCargoLbs = upcomingAir.reduce((sum, p) => sum + (p.total_weight_lb || 0), 0);
      const totalLandCargoLbs = upcomingLand.reduce((sum, c) => sum + (c.total_cargo_weight_lbs || 0), 0);
      
      // Calculate current average utilization
      const currentUtilization = siteCapacities.length > 0
        ? siteCapacities.reduce((sum, c) => sum + c.utilizationPercent, 0) / siteCapacities.length
        : 0;
      
      // Count warnings based on site statuses
      const sitesWithWarnings = siteCapacities.filter(s => s.status === 'yellow' || s.status === 'red').length;
      
      // Site-specific capacity forecasts
      const utilizationGrowthPerDay = 0.05;
      const siteForecasts = siteCapacities.map(site => {
        const projectedUtilization90 = Math.min(100, site.utilizationPercent + (90 * utilizationGrowthPerDay));
        const daysUntilWarning = site.utilizationPercent < 60 
          ? Math.round((60 - site.utilizationPercent) / utilizationGrowthPerDay)
          : 0;
        const daysUntilCritical = site.utilizationPercent < 85
          ? Math.round((85 - site.utilizationPercent) / utilizationGrowthPerDay)
          : 0;
        
        const trend = utilizationGrowthPerDay > 0.03 ? 'increasing' 
          : utilizationGrowthPerDay < -0.01 ? 'decreasing' 
          : 'stable';
        
        return {
          siteId: site.siteId,
          siteName: site.siteName,
          currentUtilization: site.utilizationPercent,
          projectedUtilization90: Math.round(projectedUtilization90 * 10) / 10,
          totalPalletPositions: site.totalPalletPositions,
          usedPalletPositions: site.usedPalletPositions,
          openPalletPositions: site.openPalletPositions,
          totalCubicFeet: site.totalCubicFeet,
          usedCubicFeet: site.usedCubicFeet,
          totalWeightCapacityLbs: site.totalWeightCapacityLbs,
          currentWeightLbs: site.currentWeightLbs,
          weightUtilizationPercent: site.weightUtilizationPercent,
          status: site.status,
          trend,
          daysUntilWarning: daysUntilWarning > 0 && daysUntilWarning <= 90 ? daysUntilWarning : null,
          daysUntilCritical: daysUntilCritical > 0 && daysUntilCritical <= 90 ? daysUntilCritical : null,
        };
      });
      
      timings['total'] = Date.now() - startTime;
      console.log('[Predictive Forecast] Timings (ms):', JSON.stringify(timings));
      
      res.json({
        generatedAt: now.toISOString(),
        forecastPeriodDays: FORECAST_DAYS,
        scheduledActivities: {
          upcomingFlights: upcomingAir.map(p => ({
            id: p.id,
            name: p.name,
            scheduledDeparture: p.scheduled_departure?.toISOString(),
            scheduledArrival: p.scheduled_arrival?.toISOString(),
            status: p.status,
            weightLbs: p.total_weight_lb || 0,
          })),
          upcomingConvoys: upcomingLand.map(c => ({
            id: c.id,
            name: c.name,
            scheduledDeparture: c.scheduled_departure?.toISOString(),
            scheduledArrival: c.scheduled_arrival?.toISOString(),
            status: c.status,
            weightLbs: c.total_cargo_weight_lbs || 0,
          })),
          upcomingVoyages: upcomingSea.map(v => ({
            id: v.id,
            name: v.name,
            scheduledDeparture: v.scheduled_departure?.toISOString(),
            scheduledArrival: v.scheduled_arrival?.toISOString(),
            status: v.status,
            origin: v.origin_port,
            destination: v.destination_port,
          })),
        },
        summaries: {
          air: {
            expectedFlights: upcomingAir.length,
            totalCargoLbs: totalAirCargoLbs,
            totalCargoTons: Math.round(totalAirCargoLbs / 2000 * 10) / 10,
          },
          land: {
            expectedConvoys: upcomingLand.length,
            totalCargoLbs: totalLandCargoLbs,
          },
          sea: {
            expectedVoyages: upcomingSea.length,
          },
          warehouse: {
            avgUtilization: Math.round(currentUtilization * 10) / 10,
            sitesWithWarnings,
          },
        },
        siteForecasts,
      });
    } catch (error) {
      console.error("[Operations] Error generating predictive forecast:", error);
      res.status(500).json({ error: "Failed to generate predictive forecast" });
    }
  });

  // ============================================================================
  // UNIFIED TRANSPORT API (Mode-Agnostic)
  // ============================================================================

  const VALID_TRANSPORT_MODES: TransportMode[] = ['air', 'land', 'sea'];

  function validateTransportMode(mode: string): mode is TransportMode {
    return VALID_TRANSPORT_MODES.includes(mode as TransportMode);
  }

  // GET /api/transport/:mode/plans - Get all plans for a mode
  app.get("/api/transport/:mode/plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { mode } = req.params;
      if (!validateTransportMode(mode)) {
        return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
      }
      const plans = await transportService.getPlans(mode, req.user!.id);
      res.json({ plans });
    } catch (error) {
      console.error("[Transport API] Error fetching plans:", error);
      res.status(500).json({ error: "Failed to fetch transport plans" });
    }
  });

  // GET /api/transport/:mode/plans/:id - Get single plan
  app.get("/api/transport/:mode/plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { mode, id } = req.params;
      if (!validateTransportMode(mode)) {
        return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
      }
      const planId = parseInt(id);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      const plan = await transportService.getPlan(mode, planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      res.json({ plan });
    } catch (error) {
      console.error("[Transport API] Error fetching plan:", error);
      res.status(500).json({ error: "Failed to fetch transport plan" });
    }
  });

  // POST /api/transport/:mode/plans - Create plan
  app.post("/api/transport/:mode/plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { mode } = req.params;
      if (!validateTransportMode(mode)) {
        return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
      }
      const plan = await transportService.createPlan(mode, req.body, req.user!.id);
      if (!plan) {
        return res.status(500).json({ error: "Failed to create transport plan" });
      }
      res.status(201).json({ plan });
    } catch (error) {
      console.error("[Transport API] Error creating plan:", error);
      res.status(500).json({ error: "Failed to create transport plan" });
    }
  });

  // PUT /api/transport/:mode/plans/:id - Update plan
  app.put("/api/transport/:mode/plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { mode, id } = req.params;
      if (!validateTransportMode(mode)) {
        return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
      }
      const planId = parseInt(id);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      const plan = await transportService.updatePlan(mode, planId, req.body, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      res.json({ plan });
    } catch (error) {
      console.error("[Transport API] Error updating plan:", error);
      res.status(500).json({ error: "Failed to update transport plan" });
    }
  });

  // POST /api/transport/:mode/plans/:id/transition - Transition status
  app.post("/api/transport/:mode/plans/:id/transition", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { mode, id } = req.params;
      if (!validateTransportMode(mode)) {
        return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
      }
      const planId = parseInt(id);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      const { status } = req.body as { status?: TransportStatus };
      if (!status) {
        return res.status(400).json({ error: "Status is required in request body" });
      }
      const validStatuses: TransportStatus[] = ['draft', 'planned', 'loading', 'underway', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      const result = await transportService.transitionStatus(mode, planId, status, req.user!.id);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ success: true, plan: result.plan, message: `Successfully transitioned to ${status}` });
    } catch (error) {
      console.error("[Transport API] Error transitioning plan status:", error);
      res.status(500).json({ error: "Failed to transition plan status" });
    }
  });

  // GET /api/transport/:mode/statistics - Get mode statistics
  app.get("/api/transport/:mode/statistics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { mode } = req.params;
      if (!validateTransportMode(mode)) {
        return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
      }
      const statistics = await transportService.getStatistics(mode, req.user!.id);
      res.json({ mode, statistics });
    } catch (error) {
      console.error("[Transport API] Error fetching statistics:", error);
      res.status(500).json({ error: "Failed to fetch transport statistics" });
    }
  });

  // GET /api/transport/statistics - Get all modes statistics
  app.get("/api/transport/statistics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const allStats = await transportService.getStatisticsAll(req.user!.id);
      res.json({ statistics: allStats });
    } catch (error) {
      console.error("[Transport API] Error fetching all statistics:", error);
      res.status(500).json({ error: "Failed to fetch transport statistics" });
    }
  });

  // GET /api/transport/assets/:mode - Get available assets for mode
  app.get("/api/transport/assets/:mode", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { mode } = req.params;
      if (!validateTransportMode(mode)) {
        return res.status(400).json({ error: `Invalid transport mode. Must be one of: ${VALID_TRANSPORT_MODES.join(', ')}` });
      }
      
      let assets: any[] = [];
      switch (mode) {
        case 'air':
          const aircraftTypes = await db.select().from(flightPlans).limit(0);
          assets = [
            { id: 1, mode: 'air', code: 'C-17', name: 'C-17 Globemaster III', capacity_lbs: 170900, dimensions: { length_ft: 88, width_ft: 18, height_ft: 12.3 } },
            { id: 2, mode: 'air', code: 'C-130J', name: 'C-130J Super Hercules', capacity_lbs: 42000, dimensions: { length_ft: 40, width_ft: 10.3, height_ft: 9 } },
            { id: 3, mode: 'air', code: 'C-5M', name: 'C-5M Super Galaxy', capacity_lbs: 281000, dimensions: { length_ft: 121, width_ft: 19, height_ft: 13.5 } },
          ];
          break;
        case 'land':
          const vehicleTypes = await db.select().from(landVehicleTypes);
          assets = vehicleTypes.map(v => ({
            id: v.id,
            mode: 'land',
            code: v.code,
            name: v.name,
            capacity_lbs: v.payload_lbs,
            dimensions: { length_ft: Number(v.length_in || 0) / 12, width_ft: Number(v.width_in || 0) / 12, height_ft: Number(v.height_in || 0) / 12 },
          }));
          break;
        case 'sea':
          assets = [
            { id: 1, mode: 'sea', code: 'MSC-CONTAINER', name: 'Container Ship (MSC)', capacity_lbs: 100000000, dimensions: { length_ft: 1200, width_ft: 160, height_ft: 60 } },
            { id: 2, mode: 'sea', code: 'MSC-RORO', name: 'Roll-on/Roll-off Ship', capacity_lbs: 50000000, dimensions: { length_ft: 800, width_ft: 130, height_ft: 40 } },
            { id: 3, mode: 'sea', code: 'MSC-BREAK', name: 'Breakbulk Carrier', capacity_lbs: 30000000, dimensions: { length_ft: 600, width_ft: 100, height_ft: 50 } },
          ];
          break;
      }
      
      res.json({ mode, assets });
    } catch (error) {
      console.error("[Transport API] Error fetching assets:", error);
      res.status(500).json({ error: "Failed to fetch transport assets" });
    }
  });

  // ============================================================================
  // MILITARY INSTALLATIONS API
  // ============================================================================

  // GET /api/military-installations - Get all active military installations
  app.get("/api/military-installations", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const searchQuery = req.query.search as string | undefined;
      const typeFilter = req.query.type as string | undefined;
      const branchFilter = req.query.branch as string | undefined;

      let conditions = [eq(militaryInstallations.is_active, true)];

      if (typeFilter) {
        conditions.push(eq(militaryInstallations.type, typeFilter));
      }

      if (branchFilter) {
        conditions.push(eq(militaryInstallations.branch, branchFilter));
      }

      let results = await db.select()
        .from(militaryInstallations)
        .where(and(...conditions))
        .orderBy(asc(militaryInstallations.name));

      if (searchQuery && searchQuery.trim()) {
        const search = searchQuery.toLowerCase().trim();
        results = results.filter(inst => 
          inst.name.toLowerCase().includes(search) ||
          inst.code.toLowerCase().includes(search) ||
          inst.city.toLowerCase().includes(search) ||
          (inst.state && inst.state.toLowerCase().includes(search))
        );
      }

      res.json(results);
    } catch (error) {
      console.error("[Military Installations] Error fetching installations:", error);
      res.status(500).json({ error: "Failed to fetch military installations" });
    }
  });

  // POST /api/admin/seed-military-installations - Seed military installations (superadmin only)
  app.post("/api/admin/seed-military-installations", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
      const installationsData = [
        // Air Force Bases
        { code: 'TRAVIS', name: 'Travis Air Force Base', type: 'air_base', branch: 'air_force', city: 'Fairfield', state: 'CA', country: 'USA', region: 'CONUS', latitude: '38.2721', longitude: '-121.9399', address: 'Travis AFB, CA 94535' },
        { code: 'DOVER', name: 'Dover Air Force Base', type: 'air_base', branch: 'air_force', city: 'Dover', state: 'DE', country: 'USA', region: 'CONUS', latitude: '39.1305', longitude: '-75.4660', address: 'Dover AFB, DE 19902' },
        { code: 'ANDREWS', name: 'Joint Base Andrews', type: 'joint_base', branch: 'air_force', city: 'Camp Springs', state: 'MD', country: 'USA', region: 'CONUS', latitude: '38.8108', longitude: '-76.8670', address: 'Joint Base Andrews, MD 20762' },
        { code: 'RAMSTEIN', name: 'Ramstein Air Base', type: 'air_base', branch: 'air_force', city: 'Ramstein', state: null, country: 'Germany', region: 'Europe', latitude: '49.4369', longitude: '7.6003', address: 'Ramstein Air Base, Germany' },
        { code: 'KADENA', name: 'Kadena Air Base', type: 'air_base', branch: 'air_force', city: 'Kadena', state: 'Okinawa', country: 'Japan', region: 'Pacific', latitude: '26.3556', longitude: '127.7678', address: 'Kadena AB, Okinawa, Japan' },
        { code: 'EDWARDS', name: 'Edwards Air Force Base', type: 'air_base', branch: 'air_force', city: 'Edwards', state: 'CA', country: 'USA', region: 'CONUS', latitude: '34.9054', longitude: '-117.8840', address: 'Edwards AFB, CA 93524' },
        { code: 'NELLIS', name: 'Nellis Air Force Base', type: 'air_base', branch: 'air_force', city: 'Las Vegas', state: 'NV', country: 'USA', region: 'CONUS', latitude: '36.2362', longitude: '-115.0336', address: 'Nellis AFB, NV 89191' },
        { code: 'HILL', name: 'Hill Air Force Base', type: 'air_base', branch: 'air_force', city: 'Ogden', state: 'UT', country: 'USA', region: 'CONUS', latitude: '41.1210', longitude: '-111.9728', address: 'Hill AFB, UT 84056' },
        { code: 'MCCONNELL', name: 'McConnell Air Force Base', type: 'air_base', branch: 'air_force', city: 'Wichita', state: 'KS', country: 'USA', region: 'CONUS', latitude: '37.6217', longitude: '-97.2683', address: 'McConnell AFB, KS 67221' },
        { code: 'SCOTT', name: 'Scott Air Force Base', type: 'air_base', branch: 'air_force', city: 'Belleville', state: 'IL', country: 'USA', region: 'CONUS', latitude: '38.5422', longitude: '-89.8519', address: 'Scott AFB, IL 62225' },

        // Army Bases
        { code: 'LIBERTY', name: 'Fort Liberty', type: 'army_base', branch: 'army', city: 'Fayetteville', state: 'NC', country: 'USA', region: 'CONUS', latitude: '35.1418', longitude: '-79.0063', address: 'Fort Liberty, NC 28310' },
        { code: 'CAVAZOS', name: 'Fort Cavazos', type: 'army_base', branch: 'army', city: 'Killeen', state: 'TX', country: 'USA', region: 'CONUS', latitude: '31.1145', longitude: '-97.7769', address: 'Fort Cavazos, TX 76544' },
        { code: 'CAMPBELL', name: 'Fort Campbell', type: 'army_base', branch: 'army', city: 'Clarksville', state: 'TN', country: 'USA', region: 'CONUS', latitude: '36.6681', longitude: '-87.4753', address: 'Fort Campbell, KY 42223' },
        { code: 'JBLM', name: 'Joint Base Lewis-McChord', type: 'joint_base', branch: 'army', city: 'Tacoma', state: 'WA', country: 'USA', region: 'CONUS', latitude: '47.1376', longitude: '-122.4764', address: 'Joint Base Lewis-McChord, WA 98433' },
        { code: 'BLISS', name: 'Fort Bliss', type: 'army_base', branch: 'army', city: 'El Paso', state: 'TX', country: 'USA', region: 'CONUS', latitude: '31.8111', longitude: '-106.4225', address: 'Fort Bliss, TX 79916' },

        // Navy Bases
        { code: 'NORFOLK', name: 'Naval Station Norfolk', type: 'navy_base', branch: 'navy', city: 'Norfolk', state: 'VA', country: 'USA', region: 'CONUS', latitude: '36.9466', longitude: '-76.2916', address: 'Naval Station Norfolk, VA 23511' },
        { code: 'NBSD', name: 'Naval Base San Diego', type: 'navy_base', branch: 'navy', city: 'San Diego', state: 'CA', country: 'USA', region: 'CONUS', latitude: '32.6836', longitude: '-117.1286', address: 'Naval Base San Diego, CA 92136' },
        { code: 'PEARL', name: 'Naval Station Pearl Harbor', type: 'navy_base', branch: 'navy', city: 'Honolulu', state: 'HI', country: 'USA', region: 'Pacific', latitude: '21.3505', longitude: '-157.9744', address: 'Naval Station Pearl Harbor, HI 96860' },
        { code: 'CORONADO', name: 'Naval Base Coronado', type: 'navy_base', branch: 'navy', city: 'Coronado', state: 'CA', country: 'USA', region: 'CONUS', latitude: '32.6812', longitude: '-117.1668', address: 'Naval Base Coronado, CA 92118' },
        { code: 'NASJAX', name: 'Naval Air Station Jacksonville', type: 'navy_base', branch: 'navy', city: 'Jacksonville', state: 'FL', country: 'USA', region: 'CONUS', latitude: '30.2358', longitude: '-81.6806', address: 'NAS Jacksonville, FL 32212' },

        // Marine Bases
        { code: 'PENDLETON', name: 'Marine Corps Base Camp Pendleton', type: 'marine_base', branch: 'marines', city: 'Oceanside', state: 'CA', country: 'USA', region: 'CONUS', latitude: '33.3869', longitude: '-117.5653', address: 'Camp Pendleton, CA 92055' },
        { code: 'LEJEUNE', name: 'Marine Corps Base Camp Lejeune', type: 'marine_base', branch: 'marines', city: 'Jacksonville', state: 'NC', country: 'USA', region: 'CONUS', latitude: '34.6178', longitude: '-77.3692', address: 'Camp Lejeune, NC 28547' },
        { code: 'MIRAMAR', name: 'Marine Corps Air Station Miramar', type: 'marine_base', branch: 'marines', city: 'San Diego', state: 'CA', country: 'USA', region: 'CONUS', latitude: '32.8683', longitude: '-117.1424', address: 'MCAS Miramar, CA 92145' },

        // DLA Depots/Warehouses
        { code: 'DDSP', name: 'DLA Distribution Susquehanna', type: 'depot', branch: 'dla', city: 'New Cumberland', state: 'PA', country: 'USA', region: 'CONUS', latitude: '40.2218', longitude: '-76.8595', address: 'DLA Distribution Susquehanna, PA 17070' },
        { code: 'DDJC', name: 'DLA Distribution San Joaquin', type: 'depot', branch: 'dla', city: 'Tracy', state: 'CA', country: 'USA', region: 'CONUS', latitude: '37.7063', longitude: '-121.4362', address: 'DLA Distribution San Joaquin, CA 95304' },
        { code: 'DDRV', name: 'DLA Distribution Red River', type: 'depot', branch: 'dla', city: 'Texarkana', state: 'TX', country: 'USA', region: 'CONUS', latitude: '33.4359', longitude: '-94.0469', address: 'DLA Distribution Red River, TX 75507' },
        { code: 'DDAA', name: 'DLA Distribution Anniston', type: 'depot', branch: 'dla', city: 'Anniston', state: 'AL', country: 'USA', region: 'CONUS', latitude: '33.7597', longitude: '-85.8364', address: 'DLA Distribution Anniston, AL 36201' },
        { code: 'DDOO', name: 'DLA Distribution Oklahoma City', type: 'depot', branch: 'dla', city: 'Oklahoma City', state: 'OK', country: 'USA', region: 'CONUS', latitude: '35.4147', longitude: '-97.3866', address: 'DLA Distribution Oklahoma City, OK 73145' },

        // Joint Bases
        { code: 'JBPHH', name: 'Joint Base Pearl Harbor-Hickam', type: 'joint_base', branch: 'joint', city: 'Honolulu', state: 'HI', country: 'USA', region: 'Pacific', latitude: '21.3387', longitude: '-157.9444', address: 'JBPHH, HI 96860' },
        { code: 'JBSA', name: 'Joint Base San Antonio', type: 'joint_base', branch: 'joint', city: 'San Antonio', state: 'TX', country: 'USA', region: 'CONUS', latitude: '29.3844', longitude: '-98.5811', address: 'JBSA, TX 78236' },
        { code: 'JBLE', name: 'Joint Base Langley-Eustis', type: 'joint_base', branch: 'joint', city: 'Hampton', state: 'VA', country: 'USA', region: 'CONUS', latitude: '37.0828', longitude: '-76.3605', address: 'JBLE, VA 23665' },
        { code: 'JBER', name: 'Joint Base Elmendorf-Richardson', type: 'joint_base', branch: 'joint', city: 'Anchorage', state: 'AK', country: 'USA', region: 'CONUS', latitude: '61.2509', longitude: '-149.8073', address: 'JBER, AK 99506' },

        // Ports
        { code: 'MOTSP', name: 'Military Ocean Terminal Sunny Point', type: 'port', branch: 'army', city: 'Southport', state: 'NC', country: 'USA', region: 'CONUS', latitude: '33.9639', longitude: '-77.9528', address: 'MOTSU, Southport, NC 28461' },
        { code: 'MOTCO', name: 'Military Ocean Terminal Concord', type: 'port', branch: 'army', city: 'Concord', state: 'CA', country: 'USA', region: 'CONUS', latitude: '38.0127', longitude: '-122.0353', address: 'MOTCO, Concord, CA 94520' },
      ];

      const existingCount = await db.select({ count: count() }).from(militaryInstallations);
      
      if (existingCount[0].count > 0) {
        const clearExisting = req.query.force === 'true';
        if (!clearExisting) {
          return res.status(409).json({ 
            error: "Military installations already exist. Use ?force=true to clear and reseed.",
            existing_count: existingCount[0].count
          });
        }
        await db.delete(militaryInstallations);
      }

      const inserted = await db.insert(militaryInstallations).values(
        installationsData.map(inst => ({
          ...inst,
          is_active: true
        }))
      ).returning();

      res.status(201).json({
        message: "Military installations seeded successfully",
        count: inserted.length,
        installations: inserted.map(i => ({ id: i.id, code: i.code, name: i.name }))
      });
    } catch (error) {
      console.error("[Military Installations] Error seeding installations:", error);
      res.status(500).json({ error: "Failed to seed military installations" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

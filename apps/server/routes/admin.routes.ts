import { Router, Response } from "express";
import {
  AuthRequest,
  authMiddleware,
  requireAdmin,
  requireSuperAdmin,
  canAccessOrganization
} from "../middleware";
import { storage } from "../storage";
import { seedAllDemoData } from "../seeds/demoData";

const router = Router();

// ============================================================================
// ORGANIZATIONS API (PROTECTED)
// ============================================================================

router.get("/organizations", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const orgs = await storage.getAllOrganizations();
    res.json(orgs);
  } catch (error) {
    console.error('Failed to list organizations:', error);
    res.status(500).json({ error: "Failed to list organizations" });
  }
});

router.post("/organizations", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
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

router.get("/accesscodes", authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.query.organization_id ? parseInt(req.query.organization_id as string) : undefined;
    
    if (req.user!.role === 'superadmin') {
      const codes = orgId 
        ? await storage.getAccessCodesByOrganization(orgId)
        : await storage.getAllAccessCodes();
      return res.json(codes);
    }
    
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

router.post("/accesscodes", authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { organization_id, expires_in_days = 7 } = req.body;
    
    let targetOrgId: number;
    
    if (req.user!.role === 'superadmin') {
      if (!organization_id) {
        return res.status(400).json({ error: "organization_id is required for superadmin" });
      }
      targetOrgId = organization_id;
    } else {
      if (!req.user!.organization_id) {
        return res.status(403).json({ error: "No organization assigned" });
      }
      targetOrgId = req.user!.organization_id;
    }
    
    const org = await storage.getOrganization(targetOrgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
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

router.get("/admin/users", authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.query.organization_id ? parseInt(req.query.organization_id as string) : undefined;
    const includeInactive = req.query.include_inactive === 'true';
    
    if (req.user!.role === 'superadmin') {
      const users = orgId 
        ? await storage.getUsersByOrganization(orgId, includeInactive)
        : await storage.getAllUsers(includeInactive);
      
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

router.put("/admin/users/:id", authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const targetUser = await storage.getUser(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (!canAccessOrganization(req.user, targetUser.organization_id)) {
      return res.status(403).json({ error: "Cannot modify users from other organizations" });
    }
    
    if (targetUser.role === 'superadmin' && req.user!.role !== 'superadmin') {
      return res.status(403).json({ error: "Cannot modify superadmin" });
    }
    
    const { first_name, last_name, role, is_active, organization_id } = req.body;
    
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

router.post("/admin/users/:id/approve", authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const targetUser = await storage.getUser(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
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

router.delete("/admin/users/:id", authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const targetUser = await storage.getUser(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (userId === req.user!.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    
    if (!canAccessOrganization(req.user, targetUser.organization_id)) {
      return res.status(403).json({ error: "Cannot delete users from other organizations" });
    }
    
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

router.post("/admin/seed-organizations", authMiddleware, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
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
// DEMO DATA SEED (ADMIN ONLY)
// ============================================================================

router.post("/admin/seed-demo-data", authMiddleware, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[Admin] User ${req.user!.email} triggering demo data seed`);
    await seedAllDemoData();
    res.json({ 
      message: "Demo data seeded successfully",
      seeded: ["land_routes", "land_convoys", "convoy_vehicles", "sea_voyages", "sea_containers"]
    });
  } catch (error) {
    console.error('Failed to seed demo data:', error);
    res.status(500).json({ error: "Failed to seed demo data" });
  }
});

export default router;

import type { Request, Response as ExpressResponse, NextFunction } from "express";
import type { UserRole } from "@shared/schema";
import { storage } from "../storage";

export interface AuthRequest extends Request {
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

export const SUPERADMIN_EMAIL = 'bhavya091213@gmail.com';

export async function authMiddleware(req: AuthRequest, res: ExpressResponse, next: NextFunction) {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      error: "Authentication required",
      code: "NO_TOKEN",
      message: "No authentication token provided. Please log in."
    });
  }
  
  const session = await storage.getSession(token);
  if (!session) {
    return res.status(401).json({ 
      error: "Session expired or invalid",
      code: "INVALID_SESSION",
      message: "Your session has expired or is invalid. Please log in again."
    });
  }
  
  // Explicit session expiration check (additional safety)
  if (new Date(session.expires_at) <= new Date()) {
    await storage.deleteSession(token);
    return res.status(401).json({ 
      error: "Session expired",
      code: "SESSION_EXPIRED",
      message: "Your session has expired. Please log in again."
    });
  }
  
  const user = await storage.getUser(session.user_id);
  if (!user) {
    await storage.deleteSession(token);
    return res.status(401).json({ 
      error: "User not found",
      code: "USER_NOT_FOUND",
      message: "The user associated with this session no longer exists."
    });
  }
  
  if (!user.is_active && user.role !== 'superadmin') {
    return res.status(403).json({ 
      error: "Account pending approval",
      code: "ACCOUNT_INACTIVE",
      message: "Your account is pending approval. Please wait for an administrator to activate your account."
    });
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

export function requireAdmin(req: AuthRequest, res: ExpressResponse, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function requireSuperAdmin(req: AuthRequest, res: ExpressResponse, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
}

export function canAccessOrganization(user: AuthRequest['user'], targetOrgId: number | null): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'admin') {
    return user.organization_id === targetOrgId;
  }
  return user.organization_id === targetOrgId;
}

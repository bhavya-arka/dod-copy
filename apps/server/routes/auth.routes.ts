import { Router } from "express";
import { AuthRequest, SUPERADMIN_EMAIL, authMiddleware } from "../middleware";
import { loginSchema, signupWithCodeSchema } from "@shared/schema";
import { storage } from "../storage";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
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
      sameSite: 'strict',
      path: '/'
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

// POST /api/auth/login
router.post("/login", async (req, res) => {
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
      sameSite: 'strict',
      path: '/'
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

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await storage.deleteSession(token);
  }
  res.clearCookie('session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.status(204).send();
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
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

export default router;

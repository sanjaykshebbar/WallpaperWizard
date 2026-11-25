import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dns from "dns";
import multer from "multer";
import { ipIsAllowed, isValidAllowlistEntry, normalizeIp } from "./src/shared/ipMatch";

// Ensure persistent folders exist inside the self-contained container
const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Helpers for reading/writing our lightweight local JSON database
interface TotpFactor {
  id: string;
  label: string;
  secret: string;
  createdAt: string;
}

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: "superadmin" | "editor";
  totpFactors?: TotpFactor[];
  tutorialSeen?: boolean;
  createdAt: string;
  createdBy?: string | null;
}

interface AuditRecord {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

interface ViewerRecord {
  deviceId: string;
  label: string | null;
  hostname: string | null;
  ip: string | null;
  userAgent: string | null;
  status: 'pending' | 'approved' | 'denied';
  firstSeen: string;
  lastSeen: string;
}

interface DbSchema {
  setupCompleted: boolean;
  /** Legacy single-admin record from earlier versions; migrated into users[] */
  admin?: { email: string; passwordHash: string; totpFactors?: TotpFactor[] } | null;
  users: UserRecord[];
  security: {
    ipRestrictionEnabled: boolean;
    allowedIps: string[];
    viewerApprovalRequired?: boolean;
    updatedBy?: string | null;
    updatedAt?: string | null;
  };
  viewers: ViewerRecord[];
  /** Accumulated display seconds: mediaId -> deviceId -> seconds */
  playtime: Record<string, Record<string, number>>;
  audit: AuditRecord[];
  displaySettings: {
    kioskMode: boolean;
    autoplaySeconds: number;
    transitionEffect: string;
    updatedBy: string;
    updatedAt: string;
    fallbackUrl?: string | null;
    fallbackType?: string | null;
  };
  mediaItems: Array<{
    id: string;
    title: string;
    url: string;
    duration: number;
    isActive: boolean;
    sortOrder: number;
    scheduledStart?: string;
    scheduledEnd?: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

const DEFAULT_DB: DbSchema = {
  setupCompleted: false,
  admin: null,
  users: [],
  security: { ipRestrictionEnabled: false, allowedIps: [], viewerApprovalRequired: false },
  viewers: [],
  playtime: {},
  audit: [],
  displaySettings: {
    kioskMode: false,
    autoplaySeconds: 8,
    transitionEffect: "fade",
    updatedBy: "system",
    updatedAt: new Date().toISOString()
  },
  mediaItems: []
};

function readDb(): DbSchema {
  let db: DbSchema;
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
      return structuredClone(DEFAULT_DB);
    }
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (error) {
    console.error("Failed parsing local JSON database, falling back to defaults:", error);
    return structuredClone(DEFAULT_DB);
  }

  // Backfill fields introduced by newer versions
  db.users = db.users || [];
  db.security = db.security || { ipRestrictionEnabled: false, allowedIps: [], viewerApprovalRequired: false };
  if (db.security.viewerApprovalRequired === undefined) db.security.viewerApprovalRequired = false;
  db.viewers = db.viewers || [];
  db.playtime = db.playtime || {};
  db.audit = db.audit || [];

  // Migrate the legacy single-admin record into the users list
  if (db.admin && db.users.length === 0) {
    db.users.push({
      id: "local-admin-dev",
      email: db.admin.email,
      passwordHash: db.admin.passwordHash,
      role: "superadmin",
      totpFactors: db.admin.totpFactors || [],
      createdAt: new Date().toISOString()
    });
    db.admin = null;
    writeDb(db);
  }

  return db;
}

function writeDb(db: DbSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Failed writing state to local JSON database:", error);
  }
}

/** Appends an immutable audit entry (newest first, capped at 2000). */
function logAudit(
  db: DbSchema,
  actor: UserRecord | null,
  action: string,
  targetType: string,
  targetId: string | null,
  details: string | null
) {
  db.audit.unshift({
    id: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    actorId: actor?.id || null,
    actorEmail: actor?.email || null,
    action,
    targetType,
    targetId,
    details,
    createdAt: new Date().toISOString()
  });
  if (db.audit.length > 2000) {
    db.audit.length = 2000;
  }
}

// --- Password hashing (scrypt with per-password random salt) ---

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("scrypt:")) {
    const [, salt, expected] = stored.split(":");
    if (!salt || !expected) return false;
    const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
    return safeEqual(derived, expected);
  }
  // Legacy record stored as plaintext by earlier versions
  return safeEqual(password, stored);
}

// --- TOTP two-factor auth (RFC 6238: SHA-1, 6 digits, 30s steps) ---

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function generateBase32Secret(length = 32): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret: string, timeStep: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3]) %
    1_000_000;
  return String(code).padStart(6, "0");
}

function verifyTotp(secret: string, code: string): boolean {
  const trimmed = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  // Accept one step of clock drift either side
  for (const drift of [-1, 0, 1]) {
    if (safeEqual(totpCode(secret, step + drift), trimmed)) return true;
  }
  return false;
}

// --- Bearer-token sessions (in-memory; cleared on process restart) ---

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const sessions = new Map<string, { expiry: number; userId: string }>();

// Short-lived states for the two-step 2FA login and enrollment flows
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const pendingLogins = new Map<string, { expiry: number; userId: string }>();
const pendingEnrollments = new Map<string, { secret: string; label: string; userId: string; expiry: number }>();

function issueSessionToken(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { expiry: Date.now() + SESSION_TTL_MS, userId });
  return token;
}

function extractToken(req: express.Request): string {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

/** Resolves the authenticated user for a request, or null. */
function sessionUser(req: express.Request, db: DbSchema): UserRecord | null {
  const token = extractToken(req);
  const session = sessions.get(token);
  if (!session || session.expiry < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return db.users.find(u => u.id === session.userId) || null;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = sessionUser(req, readDb());
  if (!user) {
    return res.status(401).json({ error: "Authentication required. Please sign in again." });
  }
  (req as any).adminUser = user;
  next();
}

function requireSuperadmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = sessionUser(req, readDb());
  if (!user) {
    return res.status(401).json({ error: "Authentication required. Please sign in again." });
  }
  if (user.role !== "superadmin") {
    return res.status(403).json({ error: "Only the superadmin may perform this action." });
  }
  (req as any).adminUser = user;
  next();
}

// --- IP-based dashboard access restriction (off by default) ---

function requestIp(req: express.Request): string {
  return normalizeIp(req.ip || req.socket.remoteAddress || "");
}

/** True when local/loopback traffic — always allowed so the box itself never locks out. */
function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function ipRestrictionGate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const db = readDb();
  if (!db.security.ipRestrictionEnabled) return next();
  const ip = requestIp(req);
  if (isLoopback(ip) || ipIsAllowed(ip, db.security.allowedIps)) return next();
  return res.status(403).json({
    error: `Access denied. This device's IP address (${ip}) is not authorized to use the AdBoard dashboard. Contact your administrator.`,
    code: "IP_RESTRICTED",
    clientIp: ip
  });
}

// --- Upload validation (mirrors the client-side limits in mediaService.ts) ---

const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime", "video/webm"
]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB

// Configure Multer Storage Engine for local file uploads
const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate secure clean unique filename suffix
    const fileId = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    cb(null, fileId);
  }
});

const upload = multer({
  storage: storageConfig,
  limits: {
    fileSize: MAX_VIDEO_BYTES
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMES.has(file.mimetype) && ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Allowed: JPG, PNG, GIF, WEBP images and MP4, MOV, WEBM videos."));
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Respect X-Forwarded-For when running behind nginx/Docker ingress so the
  // IP restriction sees the real client address
  app.set("trust proxy", true);

  // Middlewares to handle parse elements
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files middleware for local uploaded media
  app.use("/uploads", express.static(UPLOADS_DIR));

  // --- API Endpoints for Self-Hosted Offline Docker Setup ---

  // 0a. Report the requester's IP as this server sees it
  app.get("/api/client-ip", (req, res) => {
    res.json({ ip: requestIp(req) });
  });

  // 0b. Pre-auth access check for the browser gate (never exposes the allowlist)
  app.get("/api/security/status", (req, res) => {
    const db = readDb();
    const ip = requestIp(req);
    const enabled = db.security.ipRestrictionEnabled;
    const allowed = !enabled || isLoopback(ip) || ipIsAllowed(ip, db.security.allowedIps);
    res.json({ enabled, allowed, clientIp: ip });
  });

  // 1. Check Setup Status
  app.get("/api/setup/completed", (req, res) => {
    const db = readDb();
    res.json({ completed: db.setupCompleted });
  });

  // 2. Perform Setup Wizard Initialization (creates the superadmin)
  app.post("/api/setup", ipRestrictionGate, (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing required setup email or password credentials." });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must contain at least 8 characters." });
    }

    const db = readDb();
    if (db.setupCompleted) {
      return res.status(400).json({ error: "Initialization setup has already been completed." });
    }

    const nowStr = new Date().toISOString();
    const superadmin: UserRecord = {
      id: "local-admin-dev",
      email,
      passwordHash: hashPassword(password),
      role: "superadmin",
      totpFactors: [],
      createdAt: nowStr
    };
    db.users = [superadmin];
    db.setupCompleted = true;
    db.displaySettings = {
      kioskMode: false,
      autoplaySeconds: 8,
      transitionEffect: "fade",
      updatedBy: superadmin.id,
      updatedAt: nowStr
    };
    db.mediaItems = [];
    logAudit(db, superadmin, "setup.complete", "auth", superadmin.id, `Platform setup completed for ${email}`);
    writeDb(db);

    res.json({
      userId: superadmin.id,
      email,
      role: "superadmin",
      createdAt: nowStr,
      token: issueSessionToken(superadmin.id)
    });
  });

  // 3. Admin Authentication Login
  app.post("/api/login", ipRestrictionGate, (req, res) => {
    const { email, password } = req.body;
    const db = readDb();

    if (!db.setupCompleted || db.users.length === 0) {
      return res.status(400).json({ error: "Setup is not completed yet." });
    }

    const user = db.users.find(u => u.email === email);
    if (user && typeof password === "string" && verifyPassword(password, user.passwordHash)) {
      // Upgrade legacy plaintext records to scrypt on successful login
      if (!user.passwordHash.startsWith("scrypt:")) {
        user.passwordHash = hashPassword(password);
        writeDb(db);
      }

      // Two-factor gate: issue a short-lived pending token instead of a session
      if (user.totpFactors && user.totpFactors.length > 0) {
        const pendingToken = crypto.randomBytes(32).toString("hex");
        pendingLogins.set(pendingToken, { expiry: Date.now() + PENDING_TTL_MS, userId: user.id });
        return res.json({ requires2fa: true, pendingToken });
      }

      logAudit(db, user, "auth.login", "auth", user.id, `Signed in from ${requestIp(req)}`);
      writeDb(db);
      return res.json({
        uid: user.id,
        email: user.email,
        role: user.role,
        tutorialSeen: !!user.tutorialSeen,
        emailVerified: true,
        token: issueSessionToken(user.id)
      });
    }

    res.status(401).json({ error: "Invalid password or email address specified." });
  });

  // 3a. Complete a 2FA-gated login with an authenticator code
  app.post("/api/login/verify-2fa", ipRestrictionGate, (req, res) => {
    const { pendingToken, code } = req.body;
    const pending = pendingLogins.get(pendingToken);
    if (!pending || pending.expiry < Date.now()) {
      pendingLogins.delete(pendingToken);
      return res.status(401).json({ error: "Login attempt expired. Please enter your credentials again." });
    }

    const db = readDb();
    const user = db.users.find(u => u.id === pending.userId);
    const factors = user?.totpFactors || [];
    if (!user || !factors.some(f => verifyTotp(f.secret, code))) {
      return res.status(401).json({ error: "Invalid authenticator code. Please try again." });
    }

    pendingLogins.delete(pendingToken);
    logAudit(db, user, "auth.login", "auth", user.id, `Signed in with 2FA from ${requestIp(req)}`);
    writeDb(db);
    res.json({
      uid: user.id,
      email: user.email,
      role: user.role,
      tutorialSeen: !!user.tutorialSeen,
      emailVerified: true,
      token: issueSessionToken(user.id)
    });
  });

  // 3b. Invalidate current session token
  app.post("/api/logout", (req, res) => {
    sessions.delete(extractToken(req));
    res.json({ success: true });
  });

  // 3c. Change the signed-in user's password (verifies the current one first)
  app.post("/api/change-password", requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const user = db.users.find(u => u.id === actor.id);
    if (!user) {
      return res.status(400).json({ error: "User record not found." });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "New password must contain at least 8 characters." });
    }
    if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    user.passwordHash = hashPassword(newPassword);
    logAudit(db, user, "auth.password_change", "auth", user.id, "Password changed");
    writeDb(db);
    res.json({ success: true });
  });

  // 3d. List registered 2FA authenticator factors (secrets never leave the server)
  app.get("/api/2fa/factors", requireAuth, (req, res) => {
    const actor = (req as any).adminUser as UserRecord;
    const factors = (actor.totpFactors || []).map(f => ({
      id: f.id,
      label: f.label,
      createdAt: f.createdAt
    }));
    res.json({ factors });
  });

  // 3e. Begin enrolling a new authenticator app (returns secret + otpauth URL)
  app.post("/api/2fa/enroll", requireAuth, (req, res) => {
    const actor = (req as any).adminUser as UserRecord;
    const label = String(req.body?.label || "Authenticator").slice(0, 64);
    const factorId = crypto.randomBytes(8).toString("hex");
    const secret = generateBase32Secret();
    pendingEnrollments.set(factorId, { secret, label, userId: actor.id, expiry: Date.now() + PENDING_TTL_MS });

    const issuer = encodeURIComponent("AdBoard");
    const account = encodeURIComponent(actor.email);
    const otpauthUrl = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    res.json({ factorId, secret, otpauthUrl });
  });

  // 3f. Confirm enrollment by proving the authenticator generates valid codes
  app.post("/api/2fa/confirm", requireAuth, (req, res) => {
    const { factorId, code } = req.body;
    const actor = (req as any).adminUser as UserRecord;
    const pending = pendingEnrollments.get(factorId);
    if (!pending || pending.expiry < Date.now() || pending.userId !== actor.id) {
      pendingEnrollments.delete(factorId);
      return res.status(400).json({ error: "Enrollment expired. Please start again." });
    }
    if (!verifyTotp(pending.secret, code)) {
      return res.status(400).json({ error: "Invalid authenticator code. Please try again." });
    }

    const db = readDb();
    const user = db.users.find(u => u.id === actor.id);
    if (!user) {
      return res.status(400).json({ error: "User record not found." });
    }
    user.totpFactors = user.totpFactors || [];
    user.totpFactors.push({
      id: factorId,
      label: pending.label,
      secret: pending.secret,
      createdAt: new Date().toISOString()
    });
    logAudit(db, user, "auth.2fa_enroll", "auth", user.id, `Registered authenticator "${pending.label}"`);
    writeDb(db);
    pendingEnrollments.delete(factorId);
    res.json({ success: true });
  });

  // 3g. Remove a registered 2FA factor
  app.delete("/api/2fa/:id", requireAuth, (req, res) => {
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const user = db.users.find(u => u.id === actor.id);
    if (user?.totpFactors) {
      const removed = user.totpFactors.find(f => f.id === req.params.id);
      user.totpFactors = user.totpFactors.filter(f => f.id !== req.params.id);
      if (removed) {
        logAudit(db, user, "auth.2fa_remove", "auth", user.id, `Removed authenticator "${removed.label}"`);
      }
      writeDb(db);
    }
    res.json({ success: true });
  });

  // --- User management (superadmin only) ---

  app.get("/api/users", requireAuth, (req, res) => {
    const db = readDb();
    res.json({
      users: db.users.map(u => ({
        userId: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        createdBy: u.createdBy || null
      }))
    });
  });

  app.post("/api/users", requireSuperadmin, (req, res) => {
    const { email, password, role } = req.body;
    if (!email || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Provide an email and a password of at least 8 characters." });
    }
    const userRole = role === "superadmin" ? "superadmin" : "editor";

    const db = readDb();
    if (db.users.some(u => u.email === email)) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }

    const actor = (req as any).adminUser as UserRecord;
    const nowStr = new Date().toISOString();
    const newUser: UserRecord = {
      id: `user_${crypto.randomBytes(6).toString("hex")}`,
      email,
      passwordHash: hashPassword(password),
      role: userRole,
      totpFactors: [],
      createdAt: nowStr,
      createdBy: actor.id
    };
    db.users.push(newUser);
    logAudit(db, actor, "user.create", "user", newUser.id, `Created ${userRole} account for ${email}`);
    writeDb(db);
    res.json({ success: true, user: { userId: newUser.id, email, role: userRole, createdAt: nowStr } });
  });

  app.delete("/api/users/:id", requireSuperadmin, (req, res) => {
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    if (req.params.id === actor.id) {
      return res.status(400).json({ error: "You cannot remove your own account." });
    }
    const target = db.users.find(u => u.id === req.params.id);
    if (target) {
      db.users = db.users.filter(u => u.id !== target.id);
      // Invalidate any active sessions for the removed user
      for (const [token, session] of sessions) {
        if (session.userId === target.id) sessions.delete(token);
      }
      logAudit(db, actor, "user.delete", "user", target.id, `Removed ${target.role} account ${target.email}`);
      writeDb(db);
    }
    res.json({ success: true });
  });

  // Persist that the signed-in user has completed the onboarding tutorial
  app.post("/api/users/tutorial-seen", requireAuth, (req, res) => {
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const user = db.users.find(u => u.id === actor.id);
    if (user) {
      user.tutorialSeen = true;
      writeDb(db);
    }
    res.json({ success: true });
  });

  // --- IP access policy (superadmin only) ---

  app.get("/api/security", requireAuth, (req, res) => {
    const db = readDb();
    res.json({
      ipRestrictionEnabled: db.security.ipRestrictionEnabled,
      allowedIps: db.security.allowedIps,
      viewerApprovalRequired: !!db.security.viewerApprovalRequired,
      updatedBy: db.security.updatedBy || null,
      updatedAt: db.security.updatedAt || null
    });
  });

  app.post("/api/security", requireSuperadmin, (req, res) => {
    const { ipRestrictionEnabled, allowedIps, viewerApprovalRequired } = req.body;
    const list: string[] = Array.isArray(allowedIps) ? allowedIps.map(String) : [];
    const invalid = list.filter(entry => !isValidAllowlistEntry(entry));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid IP or CIDR entries: ${invalid.join(", ")}` });
    }

    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const enabled = !!ipRestrictionEnabled;

    // Lockout protection: when enabling, the requesting device must remain allowed
    const ip = requestIp(req);
    if (enabled && !isLoopback(ip) && !ipIsAllowed(ip, list)) {
      return res.status(400).json({
        error: `Refusing to enable: your current IP (${ip}) is not in the allowlist, which would lock you out. Add it first.`
      });
    }

    db.security = {
      ipRestrictionEnabled: enabled,
      allowedIps: list,
      viewerApprovalRequired: !!viewerApprovalRequired,
      updatedBy: actor.id,
      updatedAt: new Date().toISOString()
    };
    logAudit(db, actor, "security.update", "security", "ip-policy",
      `IP restriction ${enabled ? "ENABLED" : "disabled"}; allowlist: [${list.join(", ") || "empty"}]; viewerApproval=${!!viewerApprovalRequired}`);
    writeDb(db);
    res.json({ success: true, security: db.security });
  });

  // --- Viewer device registry (public heartbeat; superadmin controls) ---

  // Public: a display screen registers/refreshes and learns its approval status.
  // Enforced server-side — a denied device is told 'denied' and stops rendering.
  app.post("/api/viewers/heartbeat", (req, res) => {
    const { deviceId, userAgent } = req.body || {};
    if (!deviceId || typeof deviceId !== "string") {
      return res.status(400).json({ error: "Missing device id." });
    }
    const db = readDb();
    const nowStr = new Date().toISOString();
    const ip = requestIp(req);
    let device = db.viewers.find(v => v.deviceId === deviceId);
    if (device) {
      device.ip = ip;
      device.userAgent = String(userAgent || "").slice(0, 300);
      device.lastSeen = nowStr;
    } else {
      device = {
        deviceId,
        label: null,
        hostname: null,
        ip,
        userAgent: String(userAgent || "").slice(0, 300),
        status: db.security.viewerApprovalRequired ? "pending" : "approved",
        firstSeen: nowStr,
        lastSeen: nowStr
      };
      db.viewers.push(device);
    }
    writeDb(db);
    res.json({ status: device.status });

    // Best-effort reverse DNS for a real hostname (works on LANs with local
    // DNS/mDNS records). Runs after the response so it never slows heartbeats.
    if (!device.hostname && ip && !isLoopback(ip)) {
      dns.promises.reverse(ip).then(names => {
        if (names && names[0]) {
          const fresh = readDb();
          const rec = fresh.viewers.find(v => v.deviceId === deviceId);
          if (rec && !rec.hostname) {
            rec.hostname = names[0];
            writeDb(fresh);
          }
        }
      }).catch(() => { /* no PTR record — normal on most networks */ });
    }
  });

  app.get("/api/viewers", requireAuth, (req, res) => {
    const db = readDb();
    const viewers = [...db.viewers]
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
    res.json({ viewers });
  });

  app.post("/api/viewers/:id", requireSuperadmin, (req, res) => {
    const { status, label } = req.body || {};
    if (status !== undefined && !["pending", "approved", "denied"].includes(status)) {
      return res.status(400).json({ error: "Status must be pending, approved, or denied." });
    }
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const device = db.viewers.find(v => v.deviceId === req.params.id);
    if (device) {
      if (status !== undefined) {
        device.status = status;
        logAudit(db, actor, "viewer.update", "viewer", device.deviceId,
          `Set viewer ${device.label || device.hostname || device.ip || device.deviceId} to ${status}`);
      }
      if (label !== undefined) {
        device.label = String(label).slice(0, 80) || null;
        logAudit(db, actor, "viewer.rename", "viewer", device.deviceId, `Renamed viewer to "${device.label}"`);
      }
      writeDb(db);
    }
    res.json({ success: true });
  });

  // Playtime flush from a display screen (public; capped to prevent abuse).
  // Only devices already registered via heartbeat are accepted.
  app.post("/api/playtime", (req, res) => {
    const { deviceId, entries } = req.body || {};
    if (!deviceId || typeof deviceId !== "string" || !Array.isArray(entries)) {
      return res.status(400).json({ error: "Missing device id or entries." });
    }
    const db = readDb();
    if (!db.viewers.some(v => v.deviceId === deviceId)) {
      return res.status(400).json({ error: "Unknown device." });
    }
    for (const entry of entries.slice(0, 50)) {
      const mediaId = String(entry?.mediaId || "");
      const seconds = Number(entry?.seconds);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(mediaId) || !isFinite(seconds) || seconds <= 0) continue;
      // A flush happens at most every ~60s, so cap each increment at 10 minutes
      const capped = Math.min(seconds, 600);
      db.playtime[mediaId] = db.playtime[mediaId] || {};
      db.playtime[mediaId][deviceId] = (db.playtime[mediaId][deviceId] || 0) + capped;
    }
    writeDb(db);
    res.json({ success: true });
  });

  // Aggregated playtime per media item (any signed-in admin)
  app.get("/api/playtime", requireAuth, (req, res) => {
    const db = readDb();
    const stats: Record<string, { totalSeconds: number; screenCount: number }> = {};
    for (const [mediaId, byDevice] of Object.entries(db.playtime)) {
      const values = Object.values(byDevice);
      stats[mediaId] = {
        totalSeconds: Math.round(values.reduce((a, b) => a + b, 0)),
        screenCount: Object.keys(byDevice).length
      };
    }
    res.json({ stats });
  });

  // --- Audit trail (superadmin only) ---

  app.get("/api/audit", requireSuperadmin, (req, res) => {
    const db = readDb();
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json({ entries: db.audit.slice(0, limit) });
  });

  // Feedback -> GitHub issue (auto-create when GITHUB_TOKEN is configured).
  // Without a token it replies 501 so the client falls back to the pre-fill URL.
  app.post("/api/feedback", async (req, res) => {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || "sanjaykshebbar/Adboard_v4";
    if (!token) {
      return res.status(501).json({ error: "Server-side feedback is not configured (no GITHUB_TOKEN)." });
    }
    const { type, title, description, email } = req.body || {};
    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required." });
    }
    const typePrefix = type === "feature" ? "[Feature]" : type === "feedback" ? "[Feedback]" : "[Bug]";
    const label = type === "feature" ? "enhancement" : type === "feedback" ? "feedback" : "bug";
    const body = `${String(description).trim()}\n\n---\n- Type: ${type || "bug"}\n${email ? `- Reporter: ${email}\n` : ""}- Submitted from the AdBoard in-app feedback form (self-hosted).`;
    try {
      const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "AdBoard-Feedback"
        },
        body: JSON.stringify({ title: `${typePrefix} ${title}`, body, labels: [label] })
      });
      if (!ghRes.ok) {
        const detail = await ghRes.text();
        console.error("GitHub issue creation failed:", ghRes.status, detail);
        return res.status(502).json({ error: "Could not create the GitHub issue." });
      }
      const issue = await ghRes.json();
      res.json({ url: issue.html_url });
    } catch (err) {
      console.error("Feedback endpoint error:", err);
      res.status(502).json({ error: "Could not reach GitHub." });
    }
  });

  // 4. Retrieve Display Settings (public: the kiosk screen needs them)
  app.get("/api/display-settings", (req, res) => {
    const db = readDb();
    res.json(db.displaySettings);
  });

  // 5. Update Display Settings
  app.post("/api/display-settings", requireAuth, (req, res) => {
    const { kioskMode, autoplaySeconds, transitionEffect, userId, fallbackUrl, fallbackType } = req.body;
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;

    db.displaySettings = {
      kioskMode: !!kioskMode,
      autoplaySeconds: Number(autoplaySeconds) || 8,
      transitionEffect: transitionEffect || "fade",
      updatedBy: userId || actor.id,
      updatedAt: new Date().toISOString(),
      fallbackUrl: typeof fallbackUrl === "string" ? fallbackUrl : null,
      fallbackType: typeof fallbackType === "string" ? fallbackType : null
    };

    logAudit(db, actor, "settings.update", "settings", "displayConfig",
      `autoplay=${db.displaySettings.autoplaySeconds}s, effect=${db.displaySettings.transitionEffect}, kiosk=${db.displaySettings.kioskMode}, defaultSlide=${db.displaySettings.fallbackUrl ? "set" : "none"}`);
    writeDb(db);
    res.json({ success: true, settings: db.displaySettings });
  });

  // 6. Retrieve Media Slide Items (public: the kiosk screen needs them)
  app.get("/api/media", (req, res) => {
    const db = readDb();
    // Sort array defensive copy by sortOrder
    const sortedMedia = [...db.mediaItems].sort((a, b) => a.sortOrder - b.sortOrder);
    res.json(sortedMedia);
  });

  // 7. Save Media Slide Item Details
  app.post("/api/media", requireAuth, (req, res) => {
    const asset = req.body;
    if (!asset || !asset.id) {
      return res.status(400).json({ error: "Null asset payload or missing ID reference." });
    }
    if (typeof asset.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(asset.id)) {
      return res.status(400).json({ error: "Asset ID must be alphanumeric (dashes/underscores allowed)." });
    }

    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const idx = db.mediaItems.findIndex(i => i.id === asset.id);
    if (idx >= 0) {
      db.mediaItems[idx] = { ...db.mediaItems[idx], ...asset, updatedAt: new Date().toISOString() };
      logAudit(db, actor, "media.update", "media", asset.id, `Updated slide "${asset.title || asset.id}"`);
    } else {
      db.mediaItems.push({
        ...asset,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      logAudit(db, actor, "media.create", "media", asset.id, `Published slide "${asset.title || asset.id}"`);
    }

    // Keep sorted order correctly
    db.mediaItems.sort((a, b) => a.sortOrder - b.sortOrder);

    writeDb(db);
    res.json({ success: true, item: asset });
  });

  // 8. Delete Media Slide Item
  app.delete("/api/media/:id", requireAuth, (req, res) => {
    const id = req.params.id;
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const targetItem = db.mediaItems.find(i => i.id === id);

    if (targetItem) {
      // If asset URL is located locally, physically delete file from storage to keep disk usage lean
      if (targetItem.url.startsWith("/uploads/")) {
        // basename() strips any directory segments, preventing path traversal outside UPLOADS_DIR
        const localFileName = path.basename(targetItem.url);
        const localFilePath = path.join(UPLOADS_DIR, localFileName);
        if (fs.existsSync(localFilePath)) {
          try {
            fs.unlinkSync(localFilePath);
            console.log(`Pruned physical file from container disk: ${localFilePath}`);
          } catch (unlinkError) {
            console.error(`Faulted attempting to prune physical file ${localFilePath}:`, unlinkError);
          }
        }
      }
      db.mediaItems = db.mediaItems.filter(i => i.id !== id);
      logAudit(db, actor, "media.delete", "media", id, `Deleted slide "${targetItem.title || id}"`);
      writeDb(db);
    }

    res.json({ success: true });
  });

  // 9. Local Upload Multipart Target
  app.post("/api/upload", requireAuth, (req, res) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Failed to upload file.";
        return res.status(400).json({ error: message });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Failed to upload file. Check file size limits." });
      }

      // Enforce the tighter image limit (multer's global limit covers videos)
      if (req.file.mimetype.startsWith("image/") && req.file.size > MAX_IMAGE_BYTES) {
        try {
          fs.unlinkSync(req.file.path);
        } catch { /* file may already be gone */ }
        return res.status(400).json({ error: "Image files must be 20MB or smaller." });
      }

      const db = readDb();
      const actor = (req as any).adminUser as UserRecord;
      logAudit(db, actor, "media.upload", "media", req.file.filename, `Uploaded file ${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);
      writeDb(db);

      // Build responsive URL reference inside the container context
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ url: fileUrl });
    });
  });

  // --- End of REST APIs ---

  // Mount Vite middleware for dev or standard express statics for prod.
  // Vite is imported lazily so the production bundle never requires it.
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AdBoard Server] Running local-first suite on http://localhost:${PORT}`);
  });
}

startServer();

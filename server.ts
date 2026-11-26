import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dns from "dns";
import multer from "multer";
import { ipIsAllowed, isValidAllowlistEntry, normalizeIp, expandScanRange, MAX_SCAN_HOSTS } from "./src/shared/ipMatch";
import { resolveWallpaper } from "./src/shared/resolveWallpaper";
import { deviceIdFromDigest, discoveredOs, isManagedDevice, isSshFingerprint } from "./src/shared/deviceDiscovery";
import { setupDownloadUrls, setupPaths, setupSourceUrls } from "./src/shared/setupScripts";
import { probeBanner, fetchHostFingerprint, pushWallpaper, mapLimit } from "./devicePush";
import type { Wallpaper, Device, WorkerStatus } from "./src/types";

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

interface PushConfig {
  username: string;
  passwordEnc: string | null; // AES-256-GCM, see encryptSecret
  scanRanges: string[];
  macBookKeys: string[];
  intervalMinutes: number;
  autoApprove: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

interface DbSchema {
  setupCompleted: boolean;
  users: UserRecord[];
  security: {
    ipRestrictionEnabled: boolean;
    allowedIps: string[];
    updatedBy?: string | null;
    updatedAt?: string | null;
  };
  audit: AuditRecord[];
  wallpapers: Wallpaper[];
  devices: Device[];
  push: PushConfig;
}

const DEFAULT_PUSH: PushConfig = {
  username: "ithelpdesk",
  passwordEnc: null,
  scanRanges: [],
  macBookKeys: [],
  intervalMinutes: 15,
  autoApprove: false
};

const DEFAULT_DB: DbSchema = {
  setupCompleted: false,
  users: [],
  security: { ipRestrictionEnabled: false, allowedIps: [] },
  audit: [],
  wallpapers: [],
  devices: [],
  push: DEFAULT_PUSH
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

  db.users = db.users || [];
  db.security = db.security || { ipRestrictionEnabled: false, allowedIps: [] };
  db.audit = db.audit || [];
  db.wallpapers = db.wallpapers || [];
  db.devices = db.devices || [];
  db.push = { ...DEFAULT_PUSH, ...(db.push || {}) };
  return db;
}

// --- Device password encryption at rest (AES-256-GCM) ---
// Key: WW_SECRET_KEY env var if set, otherwise a random key file beside the database.
// shortcut: the generated key lives on the same volume as db.json, so a stolen volume exposes both; set WW_SECRET_KEY from a secret store when that matters.
const SECRET_KEY_FILE = path.join(DATA_DIR, "secret.key");

function secretKey(): Buffer {
  if (process.env.WW_SECRET_KEY) {
    return crypto.createHash("sha256").update(process.env.WW_SECRET_KEY).digest();
  }
  if (!fs.existsSync(SECRET_KEY_FILE)) {
    fs.writeFileSync(SECRET_KEY_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(SECRET_KEY_FILE, "utf-8").trim(), "hex");
}

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

function decryptSecret(stored: string): string {
  const [, iv, tag, enc] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
}

function writeDb(db: DbSchema): boolean {
  try {
    const temporaryFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(db, null, 2));
    fs.renameSync(temporaryFile, DB_FILE);
    return true;
  } catch (error) {
    console.error("Failed writing state to local JSON database:", error);
    return false;
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
    error: `Access denied. This device's IP address (${ip}) is not authorized to use the WallpaperWizard dashboard. Contact your administrator.`,
    code: "IP_RESTRICTED",
    clientIp: ip
  });
}

// --- Upload validation (mirrors the client-side limits in wallpaperService.ts) ---
// JPG and PNG only: the formats both Windows and macOS accept as wallpaper.

const ALLOWED_MIMES = new Set(["image/jpeg", "image/jpg", "image/png"]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

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
    fileSize: MAX_IMAGE_BYTES
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMES.has(file.mimetype) && ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Wallpapers must be JPG or PNG images."));
    }
  }
});

// --- Discovery + push worker ---
// Discover supported devices by host key, then push wallpapers to approved devices.

const workerStatus: WorkerStatus = { running: false, lastRun: null };

/** Read-modify-write one device synchronously, so it never clobbers dashboard edits made mid-cycle. */
function updateDevice(id: string, fn: (d: Device) => void) {
  const db = readDb();
  const device = db.devices.find(d => d.id === id);
  if (device) {
    fn(device);
    writeDb(db);
  }
}

async function discover(ranges: string[]): Promise<number> {
  const ips = [...new Set(ranges.flatMap(r => expandScanRange(r) || []))].slice(0, MAX_SCAN_HOSTS);
  const seen = new Set<string>();
  await mapLimit(ips, 64, async ip => {
    const banner = await probeBanner(ip);
    if (!banner) return;
    const key = await fetchHostFingerprint(ip);
    if (!key) return;
    const db = readDb();
    let device = db.devices.find(d => d.id === key.id);
    const os = device?.enrolledBySetup && device.sshFingerprint === key.sha256
      ? "macos" : discoveredOs(banner, key.sha256, new Set(db.push.macBookKeys));
    // Clear the old address when a replacement answers, even if it's unsupported.
    const replaced = db.devices.filter(d => d.id !== key.id && d.ip === ip);
    for (const d of replaced) d.ip = "";
    if (!os || device?.os === "other") {
      if (replaced.length) writeDb(db);
      return;
    }
    seen.add(key.id);
    const now = new Date().toISOString();
    if (device) {
      device.ip = ip;
      device.lastSeen = now;
      device.os = os;
      device.sshFingerprint = key.sha256;
    } else {
      device = {
        id: key.id, sshFingerprint: key.sha256, ip, hostname: null, label: null, os, group: null,
        status: os === "macos" && db.push.autoApprove ? "approved" : "pending",
        firstSeen: now, lastSeen: now, lastPush: null, applied: null
      };
      db.devices.push(device);
      logAudit(db, null, "device.discover", "device", key.id, `Discovered ${os === "macos" ? "MacBook" : "Windows device"} at ${ip}`);
    }
    writeDb(db);
    if (!device.hostname) {
      dns.promises.reverse(ip).then(names => {
        if (names[0]) updateDevice(key.id, d => { d.hostname = d.hostname || names[0]; });
      }).catch(() => { /* no PTR record: normal on many networks */ });
    }
  });
  return seen.size;
}

async function pushDevices(deviceIds: string[] | null, force: boolean): Promise<{ pushed: number; failed: number }> {
  const db = readDb();
  if (!db.push.passwordEnc) return { pushed: 0, failed: 0 };
  let password: string;
  try {
    password = decryptSecret(db.push.passwordEnc);
  } catch {
    throw new Error("Saved device password can't be decrypted (was WW_SECRET_KEY changed?). Re-enter it in Push Settings.");
  }
  const creds = { username: db.push.username, password };
  const macBookKeys = new Set(db.push.macBookKeys);
  const targets = db.devices.filter(d => isManagedDevice(d, macBookKeys)).filter(d =>
    d.status === "approved" && d.ip && (!deviceIds || deviceIds.includes(d.id))
  );
  let pushed = 0;
  let failed = 0;
  await mapLimit(targets, 8, async device => {
    const wallpaper = resolveWallpaper(readDb().wallpapers, device);
    if (!wallpaper) return;
    if (!force && device.applied?.wallpaperId === wallpaper.id && device.applied.version === wallpaper.updatedAt) return;
    const now = new Date().toISOString();
    try {
      const data = fs.readFileSync(path.join(UPLOADS_DIR, path.basename(wallpaper.url)));
      const name = `wallpaper-${crypto.createHash("sha256").update(wallpaper.id + wallpaper.updatedAt).digest("hex").slice(0, 12)}${path.extname(wallpaper.url).toLowerCase()}`;
      const result = await pushWallpaper(device.ip, device.sshFingerprint, creds, { name, data }, device.os);
      result.ok ? pushed++ : failed++;
      updateDevice(device.id, d => {
        d.os = result.os;
        d.hostname = result.hostname || d.hostname;
        d.lastPush = { at: now, ok: result.ok, message: result.message, wallpaperId: wallpaper.id };
        if (result.applied) d.applied = { wallpaperId: wallpaper.id, version: wallpaper.updatedAt };
      });
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      updateDevice(device.id, d => { d.lastPush = { at: now, ok: false, message: message.slice(0, 300), wallpaperId: wallpaper.id }; });
    }
  });
  if (pushed || failed) {
    const fresh = readDb();
    logAudit(fresh, null, "device.push", "device", null, `Pushed wallpapers: ${pushed} succeeded, ${failed} failed`);
    writeDb(fresh);
  }
  return { pushed, failed };
}

/** Runs one scan + push cycle unless one is already running. */
async function runCycle(opts: { scan: boolean; deviceIds?: string[] | null; force?: boolean }): Promise<boolean> {
  if (workerStatus.running) return false;
  workerStatus.running = true;
  const run = { startedAt: new Date().toISOString(), finishedAt: null as string | null, found: 0, pushed: 0, failed: 0, note: null as string | null };
  workerStatus.lastRun = run;
  try {
    const { push } = readDb();
    if (opts.scan) run.found = await discover(push.scanRanges);
    if (!push.passwordEnc) run.note = "No device password saved; discovery only.";
    Object.assign(run, await pushDevices(opts.deviceIds ?? null, !!opts.force));
  } catch (err) {
    run.note = err instanceof Error ? err.message : String(err);
    console.error("[WallpaperWizard] cycle failed:", err);
  } finally {
    run.finishedAt = new Date().toISOString();
    workerStatus.running = false;
  }
  return true;
}

function scheduleCycles() {
  const minutes = Math.max(5, readDb().push.intervalMinutes || 15);
  setTimeout(async () => {
    if (readDb().push.scanRanges.length) await runCycle({ scan: true });
    scheduleCycles();
  }, minutes * 60_000);
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const setupScripts = setupDownloadUrls(process.env.WW_SETUP_BASE_URL);
  const macBookEnrollments = new Map<string, { secret: string; actorId: string; expiresAt: number }>();

  // Respect X-Forwarded-For when running behind nginx/Docker ingress so the
  // IP restriction sees the real client address
  app.set("trust proxy", true);

  // Middlewares to handle parse elements
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files middleware for local uploaded media
  app.use("/uploads", express.static(UPLOADS_DIR));
  app.get(setupPaths.windows, (_req, res) => res.redirect(setupSourceUrls.windows));
  app.get(setupPaths.macos, (_req, res) => res.redirect(setupSourceUrls.macos));

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

    const issuer = encodeURIComponent("WallpaperWizard");
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
      updatedBy: db.security.updatedBy || null,
      updatedAt: db.security.updatedAt || null
    });
  });

  app.post("/api/security", requireSuperadmin, (req, res) => {
    const { ipRestrictionEnabled, allowedIps } = req.body;
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
      updatedBy: actor.id,
      updatedAt: new Date().toISOString()
    };
    logAudit(db, actor, "security.update", "security", "ip-policy",
      `IP restriction ${enabled ? "ENABLED" : "disabled"}; allowlist: [${list.join(", ") || "empty"}]`);
    writeDb(db);
    res.json({ success: true, security: db.security });
  });

  // --- Audit trail (superadmin only) ---

  app.get("/api/audit", requireSuperadmin, (req, res) => {
    const db = readDb();
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json({ entries: db.audit.slice(0, limit) });
  });

  // --- Wallpapers ---

  app.get("/api/wallpapers", requireAuth, (req, res) => {
    const db = readDb();
    res.json([...db.wallpapers].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  });

  app.post("/api/wallpapers", requireAuth, (req, res) => {
    const b = req.body || {};
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;

    if (typeof b.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(b.id)) {
      return res.status(400).json({ error: "Wallpaper ID must be alphanumeric (dashes/underscores allowed)." });
    }
    const title = String(b.title || "").trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: "Title is required." });
    if (typeof b.url !== "string" || !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(b.url) || !fs.existsSync(path.join(UPLOADS_DIR, path.basename(b.url)))) {
      return res.status(400).json({ error: "Upload the image first." });
    }
    if (!["org", "group", "device"].includes(b.scope)) {
      return res.status(400).json({ error: "Scope must be org, group, or device." });
    }
    let target: string | null = null;
    if (b.scope === "group") {
      target = String(b.target || "").trim().slice(0, 64);
      if (!target) return res.status(400).json({ error: "Choose a group name." });
    }
    if (b.scope === "device") {
      target = String(b.target || "");
      if (!db.devices.some(d => d.id === target)) return res.status(400).json({ error: "Choose a device." });
    }
    const start = b.scheduledStart ? new Date(b.scheduledStart) : null;
    const end = b.scheduledEnd ? new Date(b.scheduledEnd) : null;
    if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime())) || (start && end && start >= end)) {
      return res.status(400).json({ error: "Schedule start must be a valid time before the end." });
    }

    const nowStr = new Date().toISOString();
    const existing = db.wallpapers.find(w => w.id === b.id);
    const wallpaper: Wallpaper = {
      id: b.id,
      title,
      url: b.url,
      mimeType: String(b.mimeType || existing?.mimeType || "").slice(0, 64),
      fileName: String(b.fileName || existing?.fileName || "").slice(0, 200),
      fileSize: Number(b.fileSize || existing?.fileSize) || 0,
      isActive: b.isActive !== false,
      scope: b.scope,
      target,
      scheduledStart: start ? start.toISOString() : null,
      scheduledEnd: end ? end.toISOString() : null,
      ownerId: existing?.ownerId || actor.id,
      createdAt: existing?.createdAt || nowStr,
      updatedAt: nowStr
    };
    db.wallpapers = db.wallpapers.filter(w => w.id !== b.id).concat(wallpaper);
    logAudit(db, actor, existing ? "wallpaper.update" : "wallpaper.create", "wallpaper", wallpaper.id,
      `${existing ? "Updated" : "Added"} wallpaper "${title}" for ${wallpaper.scope}${target ? ` ${target}` : ""}`);
    writeDb(db);
    res.json({ success: true, item: wallpaper });
    runCycle({ scan: false }); // roll the change out now instead of waiting for the next cycle
  });

  app.delete("/api/wallpapers/:id", requireAuth, (req, res) => {
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const target = db.wallpapers.find(w => w.id === req.params.id);
    if (target) {
      // basename() strips directory segments, preventing path traversal outside UPLOADS_DIR
      const filePath = path.join(UPLOADS_DIR, path.basename(target.url));
      try {
        fs.unlinkSync(filePath);
      } catch { /* already gone */ }
      db.wallpapers = db.wallpapers.filter(w => w.id !== target.id);
      logAudit(db, actor, "wallpaper.delete", "wallpaper", target.id, `Deleted wallpaper "${target.title}"`);
      writeDb(db);
      runCycle({ scan: false });
    }
    res.json({ success: true });
  });

  app.post("/api/upload", requireAuth, (req, res) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Failed to upload file.";
        return res.status(400).json({ error: message });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Failed to upload file. Check file size limits." });
      }
      const db = readDb();
      const actor = (req as any).adminUser as UserRecord;
      logAudit(db, actor, "wallpaper.upload", "wallpaper", req.file.filename, `Uploaded ${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);
      writeDb(db);
      res.json({ url: `/uploads/${req.file.filename}` });
    });
  });

  // --- MacBook setup ---

  app.post("/api/macbook-enrollment", ipRestrictionGate, requireSuperadmin, (req, res) => {
    const actor = (req as any).adminUser as UserRecord;
    const now = Date.now();
    for (const [id, ticket] of macBookEnrollments) {
      if (ticket.expiresAt <= now) macBookEnrollments.delete(id);
    }
    const id = crypto.randomBytes(16).toString("hex");
    const secret = crypto.randomBytes(32).toString("hex");
    const expiresAt = now + 30 * 60_000;
    macBookEnrollments.set(id, { secret, actorId: actor.id, expiresAt });
    res.set("Cache-Control", "no-store").json({ code: `${id}.${secret}`, expiresAt });
  });

  app.post("/api/macbook-enrollment/complete", (req, res) => {
    const { ticketId, fingerprint, proof } = req.body || {};
    if (typeof ticketId !== "string" || !/^[a-f0-9]{32}$/.test(ticketId) ||
        !isSshFingerprint(fingerprint) || typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof)) {
      return res.status(400).json({ error: "Invalid MacBook enrollment request." });
    }
    const ticket = macBookEnrollments.get(ticketId);
    if (!ticket || ticket.expiresAt <= Date.now()) {
      macBookEnrollments.delete(ticketId);
      return res.status(410).json({ error: "This enrollment command has expired or was already used." });
    }
    // Bind the request to the fingerprint without transmitting the enrollment secret.
    const expected = crypto.createHmac("sha256", ticket.secret).update(fingerprint).digest();
    if (!crypto.timingSafeEqual(Buffer.from(proof, "hex"), expected)) {
      return res.status(403).json({ error: "MacBook enrollment proof did not match." });
    }
    const db = readDb();
    const actor = db.users.find(u => u.id === ticket.actorId && u.role === "superadmin");
    if (!actor) return res.status(403).json({ error: "The issuing superadmin is no longer authorized." });

    const id = deviceIdFromDigest(Buffer.from(fingerprint.slice("SHA256:".length), "base64"));
    const device = db.devices.find(d => d.id === id);
    if (device?.os === "windows" || device?.os === "other" ||
        (device?.sshFingerprint && device.sshFingerprint !== fingerprint)) {
      return res.status(409).json({ error: "This fingerprint conflicts with an existing device record." });
    }
    if (!device || !isManagedDevice(device, new Set(db.push.macBookKeys))) {
      const now = new Date().toISOString();
      const target: Device = device || {
        id, ip: "", hostname: null, label: null, os: null, group: null, status: "pending",
        firstSeen: now, lastSeen: now, lastPush: null, applied: null
      };
      target.os = "macos";
      target.sshFingerprint = fingerprint;
      target.enrolledBySetup = true;
      target.ip = "";
      if (target.status !== "ignored") target.status = "pending";
      if (!device) db.devices.push(target);
      logAudit(db, actor, "device.enroll", "device", id, "MacBook setup submitted an SSH host fingerprint.");
      if (!writeDb(db)) return res.status(500).json({ error: "Couldn't save the MacBook enrollment." });
    }
    macBookEnrollments.delete(ticketId);
    res.json({ success: true });
  });

  // --- Devices ---

  app.get("/api/devices", requireAuth, (req, res) => {
    const db = readDb();
    const macBookKeys = new Set(db.push.macBookKeys);
    res.json(db.devices.filter(d => isManagedDevice(d, macBookKeys)).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)));
  });

  app.post("/api/devices/:id", requireSuperadmin, (req, res) => {
    const { status, group, label } = req.body || {};
    if (status !== undefined && !["pending", "approved", "ignored"].includes(status)) {
      return res.status(400).json({ error: "Status must be pending, approved, or ignored." });
    }
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const device = db.devices.find(d => d.id === req.params.id);
    if (!device || !isManagedDevice(device, new Set(db.push.macBookKeys))) {
      return res.status(404).json({ error: "Device not found." });
    }
    if (status === "approved" && device.enrolledBySetup && !device.ip) {
      return res.status(409).json({ error: "Scan for this MacBook before approving it." });
    }
    const changes: string[] = [];
    if (status !== undefined) { device.status = status; changes.push(`status=${status}`); }
    if (group !== undefined) { device.group = String(group || "").trim().slice(0, 64) || null; changes.push(`group=${device.group || "none"}`); }
    if (label !== undefined) { device.label = String(label || "").trim().slice(0, 80) || null; changes.push(`name=${device.label || "none"}`); }
    logAudit(db, actor, "device.update", "device", device.id, `${device.label || device.hostname || device.ip}: ${changes.join(", ")}`);
    writeDb(db);
    res.json({ success: true });
    if (status === "approved" || group !== undefined) runCycle({ scan: false, deviceIds: [device.id] });
  });

  app.delete("/api/devices/:id", requireSuperadmin, (req, res) => {
    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const device = db.devices.find(d => d.id === req.params.id);
    if (device) {
      db.devices = db.devices.filter(d => d.id !== device.id);
      logAudit(db, actor, "device.delete", "device", device.id, `Removed ${device.label || device.hostname || device.ip}`);
      writeDb(db);
    }
    res.json({ success: true });
  });

  // --- Scan + push ---

  app.get("/api/worker", requireAuth, (req, res) => {
    res.json(workerStatus);
  });

  app.post("/api/scan", requireSuperadmin, (req, res) => {
    if (!readDb().push.scanRanges.length) {
      return res.status(400).json({ error: "Add at least one network range in Push Settings first." });
    }
    if (workerStatus.running) return res.status(409).json({ error: "A scan or push is already running." });
    runCycle({ scan: true });
    res.status(202).json({ started: true });
  });

  app.post("/api/push", requireAuth, (req, res) => {
    const ids = req.body?.deviceIds;
    if (ids !== undefined && (!Array.isArray(ids) || !ids.every((x: unknown) => typeof x === "string"))) {
      return res.status(400).json({ error: "deviceIds must be a list of device IDs." });
    }
    if (!readDb().push.passwordEnc) return res.status(400).json({ error: "Save the device admin password in Push Settings first." });
    if (workerStatus.running) return res.status(409).json({ error: "A scan or push is already running." });
    runCycle({ scan: false, deviceIds: ids || null, force: true });
    res.status(202).json({ started: true });
  });

  app.get("/api/push-settings", requireAuth, (req, res) => {
    const { passwordEnc, ...rest } = readDb().push;
    res.json({ ...rest, hasPassword: !!passwordEnc, setupScripts });
  });

  app.post("/api/push-settings", requireSuperadmin, (req, res) => {
    const { username, password, scanRanges, macBookKeys, intervalMinutes, autoApprove } = req.body || {};
    if (typeof username !== "string" || !/^[a-zA-Z0-9._@\\-]{1,64}$/.test(username)) {
      return res.status(400).json({ error: "Enter a valid device admin username." });
    }
    const ranges: string[] = Array.isArray(scanRanges) ? scanRanges.map((r: unknown) => String(r).trim()).filter(Boolean) : [];
    const badRanges = ranges.filter(r => !expandScanRange(r));
    if (badRanges.length) {
      return res.status(400).json({ error: `Invalid or too large ranges (max /20, ${MAX_SCAN_HOSTS} hosts): ${badRanges.join(", ")}` });
    }
    if (macBookKeys !== undefined && (!Array.isArray(macBookKeys) || !macBookKeys.every(isSshFingerprint))) {
      return res.status(400).json({ error: "Enter one SHA256 fingerprint per MacBook, as printed by the setup script." });
    }
    const interval = Number(intervalMinutes);
    if (!Number.isInteger(interval) || interval < 5 || interval > 1440) {
      return res.status(400).json({ error: "Interval must be 5 to 1440 minutes." });
    }
    if (password !== undefined && password !== null && (typeof password !== "string" || password.length > 256)) {
      return res.status(400).json({ error: "Invalid password." });
    }

    const db = readDb();
    const actor = (req as any).adminUser as UserRecord;
    const passwordChanged = typeof password === "string" && password.length > 0;
    db.push = {
      username,
      // Empty/missing password keeps the saved one; it is write-only from the dashboard
      passwordEnc: passwordChanged ? encryptSecret(password) : db.push.passwordEnc,
      scanRanges: ranges,
      macBookKeys: macBookKeys === undefined ? db.push.macBookKeys : [...new Set<string>(macBookKeys)],
      intervalMinutes: interval,
      autoApprove: !!autoApprove,
      updatedBy: actor.id,
      updatedAt: new Date().toISOString()
    };
    if (passwordChanged) {
      // New credentials: give previously failing devices a fresh attempt
      for (const d of db.devices) if (d.lastPush && !d.lastPush.ok) d.applied = null;
    }
    logAudit(db, actor, "push.settings", "push", null,
      `user=${username}${passwordChanged ? ", password updated" : ""}; ranges=[${ranges.join(", ") || "none"}]; MacBook keys=${db.push.macBookKeys.length}; every ${interval} min; autoApprove=${!!autoApprove}`);
    writeDb(db);
    res.json({ success: true });
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
    console.log(`[WallpaperWizard] Dashboard running on http://localhost:${PORT}`);
    scheduleCycles();
  });
}

startServer();

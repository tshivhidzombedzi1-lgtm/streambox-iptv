// Optional YokoTV accounts: email + password, stored in a SQLite file next to
// the catalog (no external database). An account only syncs what the app
// already keeps per device: My List, Continue watching and settings.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const DATA_DIR = path.resolve(process.cwd(), "data");
const COOKIE = "yk_session";
const SESSION_DAYS = 180;
const SITE = "https://yokotv.online";
const MAIL_FROM = "YokoTV <no-reply@yokotv.online>";

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "yokotv.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    pass TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_login INTEGER
  );
  CREATE TABLE IF NOT EXISTS user_data (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

// Accounts created through Google have no password; this marker never matches one.
const NO_PASSWORD = "!google";
try { db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT"); } catch {} // added with Google sign-in

// Sign in with Google: the OAuth client ID lives in data/google.json
// ({ "clientId": "….apps.googleusercontent.com" }); without it the feature is off.
const GOOGLE_FILE = path.join(DATA_DIR, "google.json");
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
function googleClientId() {
  try {
    const id = JSON.parse(fs.readFileSync(GOOGLE_FILE, "utf8")).clientId;
    return typeof id === "string" && /^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim()) ? id.trim() : "";
  } catch { return ""; }
}

// Signing key: JWT_SECRET if the host sets one, otherwise a random key kept on disk.
function loadSecret() {
  if (process.env.JWT_SECRET) return new TextEncoder().encode(process.env.JWT_SECRET);
  const file = path.join(DATA_DIR, ".session-secret");
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
  return new TextEncoder().encode(fs.readFileSync(file, "utf8").trim());
}
const secret = loadSecret();

// Premium (server/payments.ts): paid-up-to time, plan, the Stripe subscription
// while it renews, and the Stripe customer.
for (const col of ["premium_until INTEGER", "plan TEXT", "sub_code TEXT", "stripe_customer TEXT"]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch {}
}

type UserRow = { id: number; email: string; name: string; pass: string; session_version: number; created_at: number; premium_until: number | null; plan: string | null; sub_code: string | null; stripe_customer: string | null };
export const isPremium = (u: Pick<UserRow, "premium_until"> | null | undefined) => !!u?.premium_until && u.premium_until > Date.now();
const publicUser = (u: UserRow) => ({
  id: u.id, email: u.email, name: u.name, createdAt: u.created_at,
  premium: isPremium(u), premiumUntil: u.premium_until || null, plan: u.plan || null, renews: !!u.sub_code,
});

export const findUser = (id: number) => db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
// Premium runs until the end of the period Stripe says is paid (never shortened).
export function setPremiumUntil(userId: number, until: number, plan: string) {
  db.prepare("UPDATE users SET premium_until = MAX(COALESCE(premium_until, 0), ?), plan = ? WHERE id = ?").run(until, plan, userId);
}
// sub_code is set while a subscription renews; null once it's cancelled (paid time is kept).
export function setSubscription(userId: number, subscription: string | null) {
  db.prepare("UPDATE users SET sub_code = ? WHERE id = ?").run(subscription, userId);
}
export function endSubscription(subscription: string) {
  db.prepare("UPDATE users SET sub_code = NULL WHERE sub_code = ?").run(subscription);
}
export function setStripeCustomer(userId: number, customer: string) {
  db.prepare("UPDATE users SET stripe_customer = ? WHERE id = ?").run(customer, userId);
}
// Set by server/payments.ts: cancels a subscription when its account is deleted.
let beforeDelete: (subscription: string) => Promise<unknown> = async () => undefined;
export function onAccountDelete(fn: (subscription: string) => Promise<unknown>) { beforeDelete = fn; }

export function countPremium() {
  return (db.prepare("SELECT COUNT(*) n FROM users WHERE premium_until > ?").get(Date.now()) as { n: number }).n;
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
function checkPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

async function setSession(res: Response, user: UserRow) {
  const token = await new SignJWT({ v: user.session_version }).setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id)).setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(secret);
  res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400_000 });
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

export async function currentUser(req: Request): Promise<UserRow | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(payload.sub)) as UserRow | undefined;
    // Changing the password bumps session_version, signing out every other device.
    return user && user.session_version === payload.v ? user : null;
  } catch {
    return null;
  }
}

function userData(userId: number) {
  const row = db.prepare("SELECT data FROM user_data WHERE user_id = ?").get(userId) as { data: string } | undefined;
  try { return row ? JSON.parse(row.data) : null; } catch { return null; }
}

// Small in-memory limiter for the endpoints people could brute-force.
const attempts = new Map<string, number[]>();
function limited(req: Request, bucket: string, max: number, windowMs = 15 * 60_000) {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 10_000) attempts.clear();
  return recent.length > max;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function sendMail(to: string, subject: string, text: string) {
  const mail = spawn("/usr/sbin/sendmail", ["-t", "-i"], { stdio: ["pipe", "ignore", "ignore"] });
  mail.on("error", (e) => console.error("[accounts] sendmail failed", e));
  mail.stdin.end(`From: ${MAIL_FROM}\nTo: ${to}\nSubject: ${subject}\nContent-Type: text/plain; charset=utf-8\n\n${text}\n`);
}

export function registerAccountRoutes(app: Express) {
  app.get("/api/account/me", async (req, res) => {
    const user = await currentUser(req);
    res.set("Cache-Control", "no-store").json(user ? { user: publicUser(user), data: userData(user.id) } : { user: null });
  });

  app.post("/api/account/signup", async (req, res) => {
    if (limited(req, "signup", 10, 60 * 60_000)) return void res.status(429).json({ error: "Too many sign-ups from this connection. Try again later." });
    const email = clean(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const name = clean(req.body?.name, 60);
    if (!EMAIL.test(email)) return void res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8) return void res.status(400).json({ error: "Use a password of at least 8 characters." });
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return void res.status(409).json({ error: "There’s already an account with that email. Sign in instead." });
    const now = Date.now();
    const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, pass, created_at, last_login) VALUES (?, ?, ?, ?, ?)").run(email, name, hashPassword(password), now, now);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(lastInsertRowid) as UserRow;
    await setSession(res, user);
    res.json({ user: publicUser(user), data: null });
  });

  app.post("/api/account/login", async (req, res) => {
    if (limited(req, "login", 10)) return void res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
    const email = clean(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!user || !checkPassword(password, user.pass)) return void res.status(401).json({ error: "That email and password don’t match." });
    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(Date.now(), user.id);
    await setSession(res, user);
    res.json({ user: publicUser(user), data: userData(user.id) });
  });

  // Which sign-in methods are switched on (the app shows the Google button only if set).
  app.get("/api/account/config", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json({ googleClientId: googleClientId() });
  });

  // Google sends the browser a signed ID token; we check it against Google's keys,
  // then sign in the account with that Google ID or verified email, creating one if needed.
  app.post("/api/account/google", async (req, res) => {
    if (limited(req, "google", 30)) return void res.status(429).json({ error: "Too many attempts. Try again later." });
    const clientId = googleClientId();
    if (!clientId) return void res.status(404).json({ error: "Google sign-in isn't set up." });
    let claims: { sub?: string; email?: string; email_verified?: boolean; name?: string };
    try {
      const { payload } = await jwtVerify(clean(req.body?.credential, 4000), googleKeys, {
        issuer: ["https://accounts.google.com", "accounts.google.com"], audience: clientId,
      });
      claims = payload as typeof claims;
    } catch {
      return void res.status(401).json({ error: "Google sign-in didn't work. Try again." });
    }
    const email = (claims.email || "").toLowerCase();
    if (!claims.sub || !email || claims.email_verified !== true) return void res.status(401).json({ error: "Your Google account needs a verified email address." });
    let user = (db.prepare("SELECT * FROM users WHERE google_sub = ?").get(claims.sub)
      || db.prepare("SELECT * FROM users WHERE email = ?").get(email)) as UserRow | undefined;
    const created = !user;
    const now = Date.now();
    if (!user) {
      const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, pass, created_at, last_login, google_sub) VALUES (?, ?, ?, ?, ?, ?)")
        .run(email, clean(claims.name, 60), NO_PASSWORD, now, now, claims.sub);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(lastInsertRowid) as UserRow;
    } else {
      db.prepare("UPDATE users SET google_sub = ?, last_login = ?, name = CASE WHEN name = '' THEN ? ELSE name END WHERE id = ?").run(claims.sub, now, clean(claims.name, 60), user.id);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as UserRow;
    }
    await setSession(res, user);
    res.json({ user: publicUser(user), data: userData(user.id), created });
  });

  app.post("/api/account/logout", (_req, res) => {
    res.clearCookie(COOKIE, { path: "/" }).json({ ok: true });
  });

  app.put("/api/account/data", async (req, res) => {
    const user = await currentUser(req);
    if (!user) return void res.status(401).json({ error: "Signed out" });
    const data = JSON.stringify(req.body?.data ?? {});
    if (data.length > 64_000) return void res.status(413).json({ error: "Too much data" });
    db.prepare("INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .run(user.id, data, Date.now());
    res.json({ ok: true });
  });

  app.post("/api/account/forgot", (req, res) => {
    if (limited(req, "forgot", 5, 60 * 60_000)) return void res.status(429).json({ error: "Too many requests. Try again later." });
    const email = clean(req.body?.email, 200).toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (user) {
      const token = crypto.randomBytes(32).toString("base64url");
      const hash = crypto.createHash("sha256").update(token).digest("hex");
      db.prepare("DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?").run(user.id, Date.now());
      db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hash, user.id, Date.now() + 60 * 60_000);
      sendMail(user.email, "Reset your YokoTV password",
        `Hi${user.name ? ` ${user.name}` : ""},\n\nSomeone asked to reset the password for your YokoTV account. If it was you, open this link within an hour:\n\n${SITE}/reset?token=${token}\n\nIf it wasn’t you, ignore this email and your password stays the same.\n\nYokoTV`);
    }
    // Same answer either way, so the form can't be used to find out who has an account.
    res.json({ ok: true });
  });

  app.post("/api/account/reset", async (req, res) => {
    if (limited(req, "reset", 10)) return void res.status(429).json({ error: "Too many attempts. Try again later." });
    const token = clean(req.body?.token, 200);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (password.length < 8) return void res.status(400).json({ error: "Use a password of at least 8 characters." });
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const row = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ?").get(hash, Date.now()) as { user_id: number } | undefined;
    if (!row) return void res.status(400).json({ error: "This reset link has expired or was already used. Ask for a new one." });
    db.prepare("UPDATE users SET pass = ?, session_version = session_version + 1 WHERE id = ?").run(hashPassword(password), row.user_id);
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(row.user_id);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id) as UserRow;
    await setSession(res, user);
    res.json({ user: publicUser(user), data: userData(user.id) });
  });

  app.delete("/api/account", async (req, res) => {
    const user = await currentUser(req);
    if (!user) return void res.status(401).json({ error: "Signed out" });
    // Stop any Stripe subscription first, so a deleted account is never billed again.
    if (user.sub_code) await beforeDelete(user.sub_code).catch((e) => console.error("[accounts] cancelling subscription failed", e));
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    res.clearCookie(COOKIE, { path: "/" }).json({ ok: true });
  });
}

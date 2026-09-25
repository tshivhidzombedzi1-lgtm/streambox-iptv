// First-party, anonymous audience stats: the app sends small beacons (page
// view, play, share, install, sign-up) with a random per-browser id. No IP
// addresses or account details are stored. Counts are aggregated per day in
// memory and flushed to SQLite every 15s, so heavy traffic costs few writes.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Express, Request } from "express";
import { currentUser } from "./accounts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const EVENTS = new Set(["view", "play", "share", "install", "signup"]);
const DEVICES = new Set(["tv", "mobile", "desktop"]);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "stats.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, metric TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, metric, key));
  CREATE TABLE IF NOT EXISTS visitors (day TEXT NOT NULL, vid TEXT NOT NULL, PRIMARY KEY (day, vid));
`);

const pending = new Map<string, number>();
const seen = new Set<string>();
const bump = (day: string, metric: string, key = "") => {
  const k = `${day}\u0000${metric}\u0000${key}`;
  pending.set(k, (pending.get(k) || 0) + 1);
};

function flush() {
  if (!pending.size && !seen.size) return;
  const addCount = db.prepare("INSERT INTO daily (day, metric, key, n) VALUES (?, ?, ?, ?) ON CONFLICT(day, metric, key) DO UPDATE SET n = n + excluded.n");
  const addVisitor = db.prepare("INSERT OR IGNORE INTO visitors (day, vid) VALUES (?, ?)");
  db.exec("BEGIN");
  try {
    for (const [k, n] of Array.from(pending)) { const [day, metric, key] = k.split("\u0000"); addCount.run(day, metric, key, n); }
    for (const k of Array.from(seen)) { const [day, vid] = k.split("\u0000"); addVisitor.run(day, vid); }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("[stats] flush failed", e);
  }
  pending.clear(); seen.clear();
}
setInterval(flush, 15_000).unref();
// Visitor ids are only needed to count uniques; keep 400 days.
setInterval(() => db.prepare("DELETE FROM visitors WHERE day < ?").run(dayOf(Date.now() - 400 * 86400_000)), 6 * 3600_000).unref();

// South African days: midnight in Johannesburg, not UTC.
const dayOf = (t: number) => new Date(t + 2 * 3600_000).toISOString().slice(0, 10);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").slice(0, max) : "");

function source(ref: string) {
  if (!ref) return "direct";
  try {
    const host = new URL(ref).hostname.replace(/^www\.|^m\.|^l\./, "");
    if (host === "yokotv.online") return "";
    if (/whatsapp|wa\.me/.test(host)) return "whatsapp";
    if (/google\./.test(host)) return "google";
    if (/facebook|fb\.com/.test(host)) return "facebook";
    if (/t\.co$|twitter|x\.com/.test(host)) return "x";
    if (/bing\./.test(host)) return "bing";
    if (/tiktok/.test(host)) return "tiktok";
    if (/instagram/.test(host)) return "instagram";
    return host.slice(0, 60);
  } catch { return "direct"; }
}

const perMinute = new Map<string, number>();
setInterval(() => perMinute.clear(), 60_000).unref();

async function isAdmin(req: Request) {
  const user = await currentUser(req);
  if (!user) return false;
  try {
    const admins = JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8")) as string[];
    return admins.map((a) => a.toLowerCase()).includes(user.email.toLowerCase());
  } catch { return false; }
}

export function registerStatsRoutes(app: Express) {
  registerTrendingRoute(app);
  if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, "[]\n", { mode: 0o600 });

  // Beacons from some browsers arrive without a JSON content type; parse those here.
  app.post("/api/stats", (req, res) => {
    const ip = req.ip || "";
    const hits = (perMinute.get(ip) || 0) + 1;
    perMinute.set(ip, hits);
    res.status(204).end();
    if (hits > 120) return;
    let body: Record<string, unknown> = req.body;
    if (typeof body !== "object" || !body || !("e" in body)) {
      let raw = "";
      req.setEncoding("utf8");
      req.on("data", (c) => { raw += c; if (raw.length > 2000) req.destroy(); });
      req.on("end", () => { try { record(JSON.parse(raw)); } catch {} });
      return;
    }
    record(body);
  });

  app.get("/api/stats/summary", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Only YokoTV admins can see stats." });
    flush();
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const from = dayOf(Date.now() - (days - 1) * 86400_000);
    const rows = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Record<string, string | number>[];
    const totals: Record<string, number> = {};
    for (const r of rows("SELECT metric, SUM(n) n FROM daily WHERE day >= ? AND key = '' GROUP BY metric", from)) totals[r.metric as string] = Number(r.n);
    totals.visitors = Number(rows("SELECT COUNT(DISTINCT vid) n FROM visitors WHERE day >= ?", from)[0]?.n || 0);
    const top = (metric: string, limit = 15) => rows("SELECT key, SUM(n) n FROM daily WHERE day >= ? AND metric = ? GROUP BY key ORDER BY n DESC LIMIT ?", from, metric, limit);
    res.set("Cache-Control", "no-store").json({
      days, from, totals,
      daily: rows(`SELECT d.day, COALESCE(v.n, 0) visitors, COALESCE(SUM(CASE WHEN d.metric = 'view' AND d.key = '' THEN d.n END), 0) views, COALESCE(SUM(CASE WHEN d.metric = 'play' AND d.key = '' THEN d.n END), 0) plays
        FROM daily d LEFT JOIN (SELECT day, COUNT(*) n FROM visitors GROUP BY day) v ON v.day = d.day WHERE d.day >= ? GROUP BY d.day ORDER BY d.day`, from),
      channels: top("play:channel"), sources: top("source"), devices: top("device"), countries: top("country"), pages: top("page"),
    });
  });
}

function record(b: Record<string, unknown>) {
  const e = clean(b.e, 12);
  const vid = clean(b.v, 40);
  if (!EVENTS.has(e) || !/^[a-z0-9]{8,40}$/.test(vid)) return;
  const day = dayOf(Date.now());
  bump(day, e);
  if (e === "view") {
    if (seen.size < 200_000) seen.add(`${day}\u0000${vid}`);
    const dev = clean(b.d, 10);
    if (DEVICES.has(dev)) bump(day, "device", dev);
    const country = clean(b.c, 3).toUpperCase();
    if (/^[A-Z]{2,3}$/.test(country)) bump(day, "country", country);
    // An explicit ?source= / utm_source tag (installed app, shared links) beats the referrer.
    // Only the landing view of a visit ("f") says where the visitor came from.
    if (b.f) {
      const tag = clean(b.s, 30).toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const src = tag || source(clean(b.r, 300));
      if (src) bump(day, "source", src);
    }
    const page = clean(b.p, 80).replace(/^\/watch\/.*/, "/watch").replace(/\?.*/, "");
    if (page.startsWith("/")) bump(day, "page", page);
  }
  if (e === "play" || e === "share") {
    const ch = clean(b.ch, 80);
    if (ch) bump(day, `${e}:channel`, ch);
  }
}

// Public "Trending now": most-played channels over the last two days, cached briefly.
let trending = { at: 0, ids: [] as string[] };
function registerTrendingRoute(app: Express) {
  app.get("/api/trending", (_req, res) => {
    if (Date.now() - trending.at > 10 * 60_000) {
      flush();
      const rows = db.prepare("SELECT key, SUM(n) n FROM daily WHERE day >= ? AND metric = 'play:channel' GROUP BY key HAVING n >= 3 ORDER BY n DESC LIMIT 20")
        .all(dayOf(Date.now() - 86400_000)) as { key: string }[];
      trending = { at: Date.now(), ids: rows.map((r) => r.key) };
    }
    res.set("Cache-Control", "public, max-age=300, s-maxage=300").json({ ids: trending.ids });
  });
}

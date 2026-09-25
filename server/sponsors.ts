// Direct sponsors: banners sold to businesses and managed from /admin. A booked
// sponsor fills its ad spots ahead of AdSense. Views and clicks are counted per
// sponsor for the reports advertisers ask for. Banners are stored in
// data/sponsor-img; the list in data/sponsors.json.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { countEvent, eventTotals, isAdmin } from "./stats";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "sponsors.json");
const IMG_DIR = path.join(DATA_DIR, "sponsor-img");
export const SPONSOR_SLOTS = ["home", "browse", "guide"] as const;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

type Sponsor = {
  id: string; name: string; link: string; image: string; alt: string;
  slots: string[]; start: string; end: string; paused: boolean; created: number;
};

fs.mkdirSync(IMG_DIR, { recursive: true });
function load(): Sponsor[] {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}
function save(list: Sponsor[]) {
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(list, null, 2));
  fs.renameSync(FILE + ".tmp", FILE);
}

// Campaign dates are whole South African days (start and end inclusive).
const today = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
const running = (s: Sponsor) => !s.paused && s.start <= today() && (!s.end || s.end >= today());
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function validLink(v: string) {
  try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : ""; } catch { return ""; }
}

// Accepts a data: URL (PNG, JPEG, WebP or GIF, up to 1.5 MB) and stores it.
function saveImage(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
  const ext = m && IMAGE_TYPES[m[1]];
  if (!m || !ext) throw new Error("Upload a PNG, JPG, WebP or GIF image.");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 1.5 * 1024 * 1024) throw new Error("The image is too big. Keep it under 1.5 MB.");
  const name = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, name), bytes);
  return name;
}

function withStats(list: Sponsor[]) {
  const views = eventTotals("sponsor:view");
  const clicks = eventTotals("sponsor:click");
  return list.map((s) => ({ ...s, running: running(s), views: views[s.id] || 0, clicks: clicks[s.id] || 0 }));
}

export function registerSponsorRoutes(app: Express) {
  // Banner images.
  app.get("/sponsor-img/:file", (req, res) => {
    const file = str(req.params.file, 40);
    if (!/^[a-f0-9]{16}\.(png|jpg|webp|gif)$/.test(file)) return void res.status(404).end();
    res.set("Cache-Control", "public, max-age=31536000, immutable").sendFile(path.join(IMG_DIR, file), (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });

  // What's running now, per ad spot (the app picks one at random per view).
  app.get("/api/sponsors", (_req, res) => {
    const live = load().filter(running).map((s) => ({ id: s.id, image: `/sponsor-img/${s.image}`, alt: s.alt || s.name, slots: s.slots }));
    res.set("Cache-Control", "public, max-age=60, s-maxage=60").json({ sponsors: live });
  });

  // At most 30 counted views a minute per connection, so views can't be inflated.
  const viewsPerMinute = new Map<string, number>();
  setInterval(() => viewsPerMinute.clear(), 60_000).unref();
  app.post("/api/sponsors/:id/view", (req, res) => {
    const n = (viewsPerMinute.get(req.ip || "") || 0) + 1;
    viewsPerMinute.set(req.ip || "", n);
    if (n > 30) return void res.status(204).end();
    if (load().some((s) => s.id === req.params.id && running(s))) countEvent("sponsor:view", req.params.id);
    res.status(204).end();
  });

  // Clicks go through here so they're counted, then on to the sponsor.
  app.get("/go/:id", (req, res) => {
    const s = load().find((x) => x.id === req.params.id);
    if (!s) return void res.redirect(302, "/");
    countEvent("sponsor:click", s.id);
    res.set("Cache-Control", "no-store").set("X-Robots-Tag", "noindex").redirect(302, s.link);
  });

  // ---- admin ----
  app.get("/api/admin/sponsors", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Admins only" });
    res.set("Cache-Control", "no-store").json({ sponsors: withStats(load()) });
  });

  app.post("/api/admin/sponsors", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Admins only" });
    const b = req.body || {};
    const id = str(b.id, 20);
    const list = load();
    const existing = id ? list.find((s) => s.id === id) : undefined;
    if (id && !existing) return void res.status(404).json({ error: "Sponsor not found" });
    const name = str(b.name, 80);
    const link = validLink(str(b.link, 500));
    const slots = Array.isArray(b.slots) ? b.slots.filter((x: unknown) => SPONSOR_SLOTS.includes(x as never)) : [];
    const start = DATE.test(str(b.start, 10)) ? str(b.start, 10) : today();
    const end = DATE.test(str(b.end, 10)) ? str(b.end, 10) : "";
    if (!name) return void res.status(400).json({ error: "Give the sponsor a name." });
    if (!link) return void res.status(400).json({ error: "Enter the full web address the banner should open, starting with https://" });
    if (!slots.length) return void res.status(400).json({ error: "Pick at least one place for the banner." });
    if (end && end < start) return void res.status(400).json({ error: "The end date is before the start date." });
    let image = existing?.image || "";
    try { if (str(b.imageData, 3_000_000)) image = saveImage(str(b.imageData, 3_000_000)); }
    catch (e) { return void res.status(400).json({ error: (e as Error).message }); }
    if (!image) return void res.status(400).json({ error: "Upload a banner image." });
    const sponsor: Sponsor = {
      id: existing?.id || crypto.randomBytes(5).toString("hex"), name, link, image, alt: str(b.alt, 120) || name,
      slots, start, end, paused: !!b.paused, created: existing?.created || Date.now(),
    };
    save(existing ? list.map((s) => (s.id === sponsor.id ? sponsor : s)) : [...list, sponsor]);
    // A replaced banner image is no longer needed.
    if (existing && existing.image !== image) fs.rm(path.join(IMG_DIR, existing.image), () => undefined);
    res.json({ sponsors: withStats(load()) });
  });

  app.delete("/api/admin/sponsors/:id", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Admins only" });
    const list = load();
    const gone = list.find((s) => s.id === req.params.id);
    save(list.filter((s) => s.id !== req.params.id));
    if (gone && !list.some((s) => s.id !== gone.id && s.image === gone.image)) fs.rm(path.join(IMG_DIR, gone.image), () => undefined);
    res.json({ sponsors: withStats(load()) });
  });
}

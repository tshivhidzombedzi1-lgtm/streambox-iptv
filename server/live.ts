// Watch-along: who's watching each channel right now, live chat and emoji
// reactions. Everything lives in memory (chat is ephemeral: the last 80
// messages per channel); each viewer polls one endpoint every few seconds,
// which is also their "still watching" heartbeat.
import fs from "node:fs";
import path from "node:path";
import type { Express, Request } from "express";
import { currentUser } from "./accounts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const BANS_FILE = path.join(DATA_DIR, "chat-bans.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const VIEWER_TTL_MS = 30_000;
const KEEP_MESSAGES = 80;
const REACTION_WINDOW_MS = 8_000;
const REACTIONS = ["😂", "🔥", "😱", "❤️", "👏", "😭"];

type Message = { id: number; at: number; name: string; text: string; uid: number; reports: Set<string> };
type Room = { viewers: Map<string, number>; messages: Message[]; reactions: { at: number; e: string }[] };
const rooms = new Map<string, Room>();
let nextId = 1;

const room = (id: string) => {
  let r = rooms.get(id);
  if (!r) { r = { viewers: new Map(), messages: [], reactions: [] }; rooms.set(id, r); }
  return r;
};
const viewerCount = (r: Room, now = Date.now()) => { let n = 0; for (const t of Array.from(r.viewers.values())) if (now - t < VIEWER_TTL_MS) n++; return n; };

// Drop stale viewers, old reactions and empty rooms once a minute.
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of Array.from(rooms)) {
    for (const [v, t] of Array.from(r.viewers)) if (now - t > VIEWER_TTL_MS) r.viewers.delete(v);
    r.reactions = r.reactions.filter((x) => now - x.at < REACTION_WINDOW_MS);
    if (!r.viewers.size && now - (r.messages.at(-1)?.at || 0) > 3600_000) rooms.delete(id);
  }
}, 60_000).unref();

// ---- moderation ----
let bans = new Set<number>();
try { bans = new Set(JSON.parse(fs.readFileSync(BANS_FILE, "utf8"))); } catch {}
const saveBans = () => fs.writeFileSync(BANS_FILE, JSON.stringify(Array.from(bans)), { mode: 0o600 });

// Slurs and heavy abuse are blocked outright; links and phone numbers too, since
// in public chats they are almost always scams or spam.
const BLOCKED = /\b(k+a+f+[f1i]+r+s?|n+[i1]+g+g+(a|er)s?|f+a+g+(g?ot)?s?|r[e3]tard(ed)?s?|c+u+n+t+s?)\b/i;
const MILD = /\b(fuck(ing|er|ed)?|shit|bitch(es)?|asshole|dick|pussy|poes|naai)\b/gi;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.za|net|org|xyz|io|me|link|site|online|shop)\b)/i;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;

async function isAdmin(req: Request) {
  const user = await currentUser(req);
  if (!user) return null;
  try {
    const admins = (JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8")) as string[]).map((a) => a.toLowerCase());
    return admins.includes(user.email.toLowerCase()) ? user : null;
  } catch { return null; }
}

// Per-user and per-IP posting limits.
const lastPost = new Map<string, number[]>();
function tooFast(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (lastPost.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  lastPost.set(key, list);
  if (lastPost.size > 20_000) lastPost.clear();
  return list.length > max;
}

const channelId = (v: unknown) => (typeof v === "string" && /^[\w.@-]{1,80}$/.test(v) ? v : "");
const publicMessage = (m: Message) => ({ id: m.id, at: m.at, name: m.name, text: m.text });

export function registerLiveRoutes(app: Express) {
  // Heartbeat + everything new since `since`: viewer count, messages, reactions.
  app.post("/api/live/:id/poll", (req, res) => {
    res.set("Cache-Control", "no-store");
    const id = channelId(req.params.id);
    const vid = typeof req.body?.v === "string" && /^[a-z0-9]{8,40}$/.test(req.body.v) ? req.body.v : "";
    if (!id) return void res.status(400).json({ error: "Unknown channel" });
    const r = room(id);
    if (vid && r.viewers.size < 50_000) r.viewers.set(vid, Date.now());
    const since = Number(req.body?.since) || 0;
    const now = Date.now();
    const counts: Record<string, number> = {};
    for (const x of r.reactions) if (now - x.at < REACTION_WINDOW_MS) counts[x.e] = (counts[x.e] || 0) + 1;
    res.json({
      viewers: viewerCount(r, now),
      messages: r.messages.filter((m) => m.id > since && m.reports.size < 3).slice(-KEEP_MESSAGES).map(publicMessage),
      removed: r.messages.filter((m) => m.reports.size >= 3).map((m) => m.id),
      reactions: counts,
    });
  });

  app.post("/api/live/:id/react", (req, res) => {
    const id = channelId(req.params.id);
    const e = typeof req.body?.e === "string" ? req.body.e : "";
    if (!id || !REACTIONS.includes(e)) return void res.status(400).json({ error: "Unknown reaction" });
    if (tooFast(`react:${req.ip}`, 12, 10_000)) return void res.status(429).json({ error: "Slow down a little" });
    const r = room(id);
    r.reactions.push({ at: Date.now(), e });
    if (r.reactions.length > 500) r.reactions.splice(0, r.reactions.length - 500);
    res.json({ ok: true });
  });

  app.post("/api/live/:id/chat", async (req, res) => {
    const id = channelId(req.params.id);
    const user = await currentUser(req);
    if (!user) return void res.status(401).json({ error: "Sign in to chat." });
    if (bans.has(user.id)) return void res.status(403).json({ error: "You can't post in YokoTV chats." });
    if (!id) return void res.status(400).json({ error: "Unknown channel" });
    let text = typeof req.body?.text === "string" ? req.body.text.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (!text) return void res.status(400).json({ error: "Type a message first." });
    if (tooFast(`chat:${user.id}`, 4, 15_000) || tooFast(`chatip:${req.ip}`, 10, 15_000)) return void res.status(429).json({ error: "You're sending messages too fast. Wait a few seconds." });
    if (BLOCKED.test(text)) return void res.status(400).json({ error: "That message breaks the chat rules: no slurs or hate." });
    if (LINK.test(text) || PHONE.test(text)) return void res.status(400).json({ error: "Links and phone numbers aren't allowed in chat." });
    text = text.replace(MILD, (w: string) => w[0] + "*".repeat(w.length - 1));
    // Display name only: never the email address.
    const name = (user.name || `Viewer ${user.id}`).replace(MILD, "***").slice(0, 30);
    const r = room(id);
    const message: Message = { id: nextId++, at: Date.now(), name: BLOCKED.test(name) ? `Viewer ${user.id}` : name, text, uid: user.id, reports: new Set() };
    r.messages.push(message);
    if (r.messages.length > KEEP_MESSAGES) r.messages.splice(0, r.messages.length - KEEP_MESSAGES);
    res.json({ message: publicMessage(message) });
  });

  // Three reports from different viewers hide a message.
  app.post("/api/live/:id/report", (req, res) => {
    const r = rooms.get(channelId(req.params.id));
    const m = r?.messages.find((x) => x.id === Number(req.body?.msg));
    // Counted per connection, so one person can't hide a message alone.
    if (m) m.reports.add(req.ip || "");
    res.json({ ok: true });
  });

  // Admins: delete a message, optionally banning its author.
  app.post("/api/live/:id/moderate", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Admins only" });
    const r = rooms.get(channelId(req.params.id));
    const m = r?.messages.find((x) => x.id === Number(req.body?.msg));
    if (!m) return void res.status(404).json({ error: "Message not found" });
    for (let i = 0; i < 3; i++) m.reports.add(`admin-${i}`);
    if (req.body?.ban) { bans.add(m.uid); saveBans(); }
    res.json({ ok: true });
  });

  // Whether the signed-in viewer may delete messages and ban (shows admin controls).
  app.get("/api/live/me", async (req, res) => {
    res.set("Cache-Control", "no-store").json({ admin: !!(await isAdmin(req)) });
  });

  // Viewers per channel, for "watching now" badges and sorting.
  let counts: { at: number; body: Record<string, number> } = { at: 0, body: {} };
  app.get("/api/live/counts", (_req, res) => {
    if (Date.now() - counts.at > 15_000) {
      const body: Record<string, number> = {};
      for (const [id, r] of Array.from(rooms)) { const n = viewerCount(r); if (n) body[id] = n; }
      counts = { at: Date.now(), body };
    }
    res.set("Cache-Control", "public, max-age=15, s-maxage=15").json(counts.body);
  });
}

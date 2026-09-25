// TV guide ("what's on now"): pulls free guides, matches their channels to
// ours, and keeps the next 24 hours. XMLTV files are streamed and parsed in
// pieces so the big ones never sit in memory whole. Refreshed every 3 hours.
//   dstv.com      South African TV guide (SABC, e.tv, community channels), matched by name among SA channels
//   i.mjh.nz      Pluto TV / Samsung TV Plus / Plex / Roku, matched by Pluto id or name
// (epg.pw was tried and dropped: its times are labelled UTC but run ~8 hours ahead.)
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import type { Express } from "express";
import { type CatalogChannel, getCatalog } from "./catalog";

const DATA_DIR = path.resolve(process.cwd(), "data");
const EPG_FILE = path.join(DATA_DIR, "epg.json");
const REFRESH_MS = 3 * 3600_000;
const KEEP_MS = 24 * 3600_000;
type Source = { url: string; country?: string; gz?: boolean };
const SOURCES: Source[] = [
  { url: "https://i.mjh.nz/PlutoTV/all.xml.gz", gz: true },
  { url: "https://i.mjh.nz/SamsungTVPlus/all.xml.gz", gz: true },
  { url: "https://i.mjh.nz/Plex/all.xml.gz", gz: true },
  { url: "https://i.mjh.nz/Roku/all.xml.gz", gz: true },
];

// s/e: start/end (ms), t: title, d: short description
export type Programme = { s: number; e: number; t: string; d?: string };
type Guide = { builtAt: string; channels: Record<string, Programme[]> };
let guide: Guide = { builtAt: "", channels: {} };
let building = false;

// "SABC 3 HD" and "SABC 3" should meet; so should "e.TV HD" and "e.tv".
export function normName(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ").replace(/&/g, " and ")
    .replace(/\b(hd|fhd|uhd|4k|sd|tv|channel|live|east|west)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
// XMLTV times look like "20260925074200 +0000".
function xmltvTime(v: string) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const tz = m[7] ? (m[7][0] === "-" ? -1 : 1) * (+m[7].slice(1, 3) * 60 + +m[7].slice(3)) : 0;
  return utc - tz * 60_000;
}

// Our channels indexed the ways guides can point at them.
function indexCatalog(channels: CatalogChannel[]) {
  const byName = new Map<string, CatalogChannel[]>();
  const byPluto = new Map<string, string>();
  for (const ch of channels) {
    const key = normName(ch.n);
    if (key.length >= 3) byName.set(key, [...(byName.get(key) || []), ch]);
    for (const s of ch.s) { const m = s.u.match(/plu-([0-9a-f]{24})\.m3u8/); if (m) byPluto.set(m[1], ch.id); }
  }
  return { byName, byPluto };
}

async function readSource(src: Source, index: ReturnType<typeof indexCatalog>, out: Record<string, Programme[]>, log: (m: string) => void) {
  const res = await fetch(src.url, { signal: AbortSignal.timeout(180_000), headers: { "User-Agent": "YokoTV guide (+https://yokotv.online)" } });
  if (!res.ok || !res.body) throw new Error(`${src.url} ${res.status}`);
  let stream: NodeJS.ReadableStream = Readable.fromWeb(res.body as never);
  if (src.gz) stream = stream.pipe(zlib.createGunzip());
  stream.setEncoding?.("utf8");

  const names = new Map<string, string[]>(); // guide channel id -> display names
  const resolved = new Map<string, string | null>(); // guide channel id -> our channel id
  const taken = new Set<string>();
  const from = Date.now() - 3 * 3600_000, to = Date.now() + KEEP_MS;
  let kept = 0;

  // Matched the first time a guide channel's programmes appear (some files list
  // all channels first, others interleave each channel with its programmes).
  // Guides list one channel several times (per region or platform); each of our
  // channels takes the first guide entry that matches, so schedules never mix.
  const resolve = (gid: string) => {
    if (resolved.has(gid)) return resolved.get(gid);
    let ours: string | null = null;
    const pluto = index.byPluto.get(gid);
    if (pluto && !taken.has(pluto)) ours = pluto;
    else for (const n of (names.get(gid) || []).map(normName)) {
      if (n.length < 3) continue;
      // Several of our channels with this name (e.g. regional feeds): skip unless the country tells them apart.
      const hits = (index.byName.get(n) || []).filter((c) => (src.country ? c.c === src.country : true) && !out[c.id] && !taken.has(c.id));
      if (hits.length === 1) { ours = hits[0].id; break; }
    }
    if (ours) taken.add(ours);
    resolved.set(gid, ours);
    return ours;
  };

  let buf = "";
  for await (const chunk of stream as AsyncIterable<string>) {
    buf += chunk;
    let cut = 0;
    const re = /<channel id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>|<programme([^>]*)>([\s\S]*?)<\/programme>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(buf))) {
      cut = re.lastIndex;
      if (m[1] !== undefined) {
        const list = Array.from(m[2].matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g), (x) => decode(x[1]));
        names.set(decode(m[1]), list);
        continue;
      }
      const attrs = m[3];
      const ours = resolve(decode(attrs.match(/channel="([^"]*)"/)?.[1] || ""));
      if (!ours) continue;
      const s = xmltvTime(attrs.match(/start="([^"]*)"/)?.[1] || "");
      const e = xmltvTime(attrs.match(/stop="([^"]*)"/)?.[1] || "");
      if (!(e > from && s < to && e > s)) continue;
      const t = decode(m[4].match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "");
      if (!t) continue;
      const d = decode(m[4].match(/<desc[^>]*>([\s\S]*?)<\/desc>/)?.[1] || "").slice(0, 200);
      (out[ours] ||= []).push(d ? { s, e, t, d } : { s, e, t });
      kept++;
    }
    buf = buf.slice(cut);
    if (buf.length > 4_000_000) buf = buf.slice(-100_000); // never hold a runaway fragment
  }
  log(`[epg] ${src.url}: ${taken.size} channels matched, ${kept} programmes`);
}

// DStv's public TV guide: one request per day returns every South African
// channel. Times are South African local time (UTC+2, no daylight saving).
type DstvDay = { Channels: { Name: string; Programmes: { StartTime: string; EndTime: string; Title: string }[] }[] };
async function readDstv(index: ReturnType<typeof indexCatalog>, out: Record<string, Programme[]>, log: (m: string) => void) {
  const sast = (t: string) => Date.parse(`${t}+02:00`);
  const from = Date.now() - 3 * 3600_000, to = Date.now() + KEEP_MS;
  const matched = new Set<string>();
  let kept = 0;
  for (const offset of [0, 1]) {
    const day = new Date(Date.now() + 2 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
    const res = await fetch(`https://www.dstv.com/umbraco/api/TvGuide/GetProgrammes?d=${day}&country=zaf`, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": "YokoTV guide (+https://yokotv.online)" } });
    if (!res.ok) throw new Error(`dstv.com ${day} ${res.status}`);
    const data = (await res.json()) as DstvDay;
    for (const ch of data.Channels || []) {
      const hits = (index.byName.get(normName(ch.Name)) || []).filter((c) => c.c === "ZA");
      if (hits.length !== 1) continue;
      matched.add(hits[0].id);
      for (const p of ch.Programmes || []) {
        const s = sast(p.StartTime), e = sast(p.EndTime);
        if (!(e > from && s < to && e > s) || !p.Title) continue;
        (out[hits[0].id] ||= []).push({ s, e, t: p.Title.trim() });
        kept++;
      }
    }
  }
  log(`[epg] dstv.com: ${matched.size} channels matched, ${kept} programmes`);
}

async function build(log = console.log) {
  const catalog = getCatalog();
  if (building || !catalog) return;
  building = true;
  try {
    const index = indexCatalog(catalog.channels);
    const channels: Record<string, Programme[]> = {};
    try { await readDstv(index, channels, log); } catch (e) { log(`[epg] dstv.com failed: ${e}`); }
    for (const src of SOURCES) {
      // One source at a time keeps memory low on shared hosting.
      try { await readSource(src, index, channels, log); } catch (e) { log(`[epg] ${src.url} failed: ${e}`); }
    }
    for (const id of Object.keys(channels)) {
      const seen = new Set<number>();
      channels[id] = channels[id].sort((a, b) => a.s - b.s).filter((p) => !seen.has(p.s) && seen.add(p.s)).slice(0, 60);
    }
    if (Object.keys(channels).length) {
      guide = { builtAt: new Date().toISOString(), channels };
      nowCache = null;
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(EPG_FILE + ".tmp", JSON.stringify(guide));
      fs.renameSync(EPG_FILE + ".tmp", EPG_FILE);
    }
    log(`[epg] guide ready for ${Object.keys(channels).length} channels`);
  } finally {
    building = false;
  }
}

export function startEpg() {
  try { guide = JSON.parse(fs.readFileSync(EPG_FILE, "utf8")); } catch {}
  const age = guide.builtAt ? Date.now() - new Date(guide.builtAt).getTime() : Infinity;
  // Wait for the catalog to load before the first build.
  setTimeout(() => build().catch((e) => console.error("[epg]", e)), age > REFRESH_MS ? 60_000 : REFRESH_MS - age);
  setInterval(() => build().catch((e) => console.error("[epg]", e)), REFRESH_MS).unref();
}
export const buildEpg = build;

// Now + next for every channel with a guide: small enough to load with the home screen.
let nowCache: { at: number; body: string } | null = null;
function nowNext() {
  if (nowCache && Date.now() - nowCache.at < 60_000) return nowCache.body;
  const now = Date.now();
  const ch: Record<string, [number, number, string][]> = {};
  for (const [id, list] of Object.entries(guide.channels)) {
    const i = list.findIndex((p) => p.e > now);
    if (i < 0) continue;
    ch[id] = list.slice(i, i + 2).map((p) => [p.s, p.e, p.t]);
  }
  nowCache = { at: now, body: JSON.stringify({ at: now, ch }) };
  return nowCache.body;
}

export function registerEpgRoutes(app: Express) {
  app.get("/api/epg/now", (_req, res) => {
    res.set("Cache-Control", "public, max-age=60, s-maxage=60").type("json").send(nowNext());
  });
  app.get("/api/epg/:id", (req, res) => {
    const now = Date.now();
    const list = (guide.channels[req.params.id] || []).filter((p) => p.e > now);
    res.set("Cache-Control", "public, max-age=300, s-maxage=300").json({ id: req.params.id, programmes: list });
  });
}

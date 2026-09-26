// Live channel catalog: pulls the IPTV-Org database, probes every stream from
// the server, and keeps only channels that actually answer. The result is
// cached on disk so restarts serve instantly while a refresh runs behind.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { Express, Request, Response } from "express";

const API = "https://iptv-org.github.io/api";
const DATA_DIR = path.resolve(process.cwd(), "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const REFRESH_MS = 6 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 9000;
const PROBE_CONCURRENCY = 40;
export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

// Channels promoted to the hero and "Top picks" rail when they are alive.
const TOP_PICKS = [
  "SABCNews.za", "SABC1.za", "SABC3.za", "AfricanewsEnglish.fr", "TraceAfrica.fr", "TraceUrban.fr", "TraceGospel.fr",
  "RedBullTV.at", "BloombergTV.us", "CNAInternational.sg", "TRTWorld.tr", "NHKWorldJapan.jp", "CGTN.cn",
  "EuronewsEnglish.fr", "WION.in", "ABCNewsLive.us", "CBSNews247.us", "NBCNewsNOW.us", "FoxWeather.us",
  "France24.fr", "DW.de", "AlJazeera.qa", "RealMadridTVEnglish.es", "FIFAPlus.uk", "NFLChannel.us",
  "Vevo90s.us", "Vevo80s.us", "FilmRiseWestern.us", "BloombergOriginals.us", "ArirangTV.kr",
];

type ApiChannel = { id: string; name: string; country: string; categories: string[]; is_nsfw: boolean; closed: string | null; network: string | null; website: string | null };
type ApiStream = { channel: string | null; feed: string | null; title: string; url: string; quality: string | null; user_agent: string | null; referrer: string | null; labels?: string[] | null };
type ApiLogo = { channel: string; feed: string | null; in_use: boolean; width: number; height: number; format: string | null; url: string };

// Local (South African) streams found outside IPTV-Org: the broadcasters' own
// non-geo-blocked CDN edges and Sentech's FreeVision Play. They are probed like
// every other stream, so any that go dark drop out on the next refresh.
const stream = (channel: string, url: string, quality: string): ApiStream => ({ channel, feed: null, title: channel, url, quality, user_agent: null, referrer: null });
const EXTRA_STREAMS: ApiStream[] = [
  stream("SABC1.za", "https://sabconetanw.cdn.mangomolo.com/sabc1/smil:sabc1.stream.smil/master.m3u8", "1080p"),
  stream("SABC3.za", "https://sabctretalh.cdn.mangomolo.com/sabc3/smil:sabc3.stream.smil/master.m3u8", "1080p"),
  stream("SABCEducation.za", "https://sabctretalh.cdn.mangomolo.com/edu/smil:edu.stream.smil/master.m3u8", "720p"),
  stream("PlatinumNorthWestTV.za", "https://cdn.freevisiontv.co.za/sttv/smil:pnwtv.stream.smil/playlist.m3u8", "576p"),
  // South Africa-only edges: backups offered only to viewers in SA (see CatalogStream.g).
  { ...stream("SABCNews.za", "https://sabconeta.cdn.mangomolo.com/news/smil:news.stream.smil/master.m3u8", "720p"), labels: ["Geo-blocked"] },
  { ...stream("SABC3.za", "https://sabconeta.cdn.mangomolo.com/sabc3/smil:sabc3.stream.smil/master.m3u8", "1080p"), labels: ["Geo-blocked"] },
];
// Streams IPTV-Org doesn't label but that only answer inside South Africa.
const SA_ONLY_HOSTS = /(^|\.)telemedia\.co\.za$/;
// Speed recorded for local-only streams we could not test; sorts them last.
const UNTESTED_MS = 60_000;
// A segment that turns up on this many different channels may be a placeholder slate...
const SLATE_CHANNELS = 3;
// ...confirmed only if the same stream still shows that exact video this much later.
const SLATE_RECHECK_MS = 90_000;
// Channels missing from the IPTV-Org database entirely.
const EXTRA_CHANNELS: ApiChannel[] = [
  { id: "PlatinumNorthWestTV.za", name: "Platinum North West TV", country: "ZA", categories: ["general"], is_nsfw: false, closed: null, network: null, website: "https://freevisionplay.co.za/live/459/Platinum-North-West-TV" },
];
const EXTRA_LOGOS: ApiLogo[] = [
  { channel: "PlatinumNorthWestTV.za", feed: null, in_use: true, width: 500, height: 280, format: "JPEG", url: "https://admango.cdn.mangomolo.com/analytics/uploads/188/68f658d322.jpg" },
];

// Compact wire format — short keys keep the catalog small for slow connections.
// g: country code of a geo-blocked stream. The broadcaster only serves viewers in
// that country, so it can't be tested from our server or relayed; the app only
// offers it to viewers there, played straight from the broadcaster.
export type CatalogStream = { u: string; q: number; p: 0 | 1; ua?: string; r?: string; ms: number; g?: string };
// lg: main language (ISO 639-3, e.g. "eng"); en: 0 English, 1 probably English, 2 other.
export type CatalogChannel = { id: string; n: string; c: string; k: string[]; l?: string; s: CatalogStream[]; sc: number; lg?: string; en?: 0 | 1 | 2 };
export type Catalog = { v: 2; builtAt: string; checked: number; alive: number; picks: string[]; countries: Record<string, string>; channels: CatalogChannel[] };

let catalog: Catalog | null = null;
let catalogGzip: Buffer | null = null;
// The app's first download: everything for browsing, but stream addresses only for
// the home page picks (the hero preview). The player fetches a channel's streams
// from /api/streams/:id when it opens. q: best quality; gl: countries it can play in,
// set only when every stream is geo-locked.
let lite: { gzip: Buffer; br: Buffer } | null = null;
const streamsById = new Map<string, CatalogStream[]>();
let building = false;
const allowedHosts = new Set<string>();

export const getCatalog = () => catalog;

export function isAllowedHost(host: string) {
  return allowedHosts.has(host.toLowerCase());
}
export function allowHost(host: string) {
  if (allowedHosts.size < 50000) allowedHosts.add(host.toLowerCase());
}

function setCatalog(next: Catalog) {
  catalog = next;
  catalogGzip = zlib.gzipSync(Buffer.from(JSON.stringify(next)), { level: 9 });
  streamsById.clear();
  const picks = new Set(next.picks);
  const channels = next.channels.map(({ s, lg: _lg, en: _en, sc: _sc, ...c }) => {
    streamsById.set(c.id, s);
    const gl = s.every((x) => x.g) ? Array.from(new Set(s.map((x) => x.g!))) : undefined;
    return { ...c, q: Math.max(0, ...s.map((x) => x.q || 0)), ...(gl ? { gl } : {}), ...(picks.has(c.id) ? { s } : {}) };
  });
  const json = Buffer.from(JSON.stringify({ ...next, channels }));
  lite = { gzip: zlib.gzipSync(json, { level: 9 }), br: zlib.brotliCompressSync(json, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: json.length } }) };
  for (const channel of next.channels) for (const stream of channel.s) {
    try { allowHost(new URL(stream.u).host); } catch {}
  }
}

async function fetchJson<T>(name: string): Promise<T> {
  const res = await fetch(`${API}/${name}.json`, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${name}.json ${res.status}`);
  return res.json() as Promise<T>;
}

function qualityHeight(q: string | null) {
  const n = parseInt(q || "", 10);
  return Number.isFinite(n) ? n : 0;
}

// Reads at most `limit` bytes and drops the rest of the body.
async function readBytes(res: globalThis.Response, limit: number) {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length;
  }
  reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).subarray(0, limit);
}
const readText = async (res: globalThis.Response, limit = 256 * 1024) => (await readBytes(res, limit)).toString("utf8");

// blocked: the server refused us (401/403/451 or connection refused), which for a
// geo-blocked stream means "works, but not from here", unlike a dead stream.
// seg: fingerprint of the first bytes of the newest segment (see SLATE_CHANNELS).
type ProbeResult = { ok: boolean; cors: boolean; ms: number; blocked?: boolean; seg?: string };

async function probe(stream: ApiStream): Promise<ProbeResult> {
  const started = Date.now();
  const headers: Record<string, string> = { "User-Agent": stream.user_agent || BROWSER_UA, Origin: "https://yokotv.online" };
  if (stream.referrer) headers.Referer = stream.referrer;
  const get = (url: string, extra: Record<string, string> = {}) => fetch(url, { headers: { ...headers, ...extra }, redirect: "follow", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  const fail = (status = 0): ProbeResult => ({ ok: false, cors: false, ms: 0, blocked: status === 401 || status === 403 || status === 451 });
  try {
    const master = await get(stream.url);
    if (!master.ok) return fail(master.status);
    let cors = !!master.headers.get("access-control-allow-origin");
    const text = await readText(master);
    if (!text.trimStart().startsWith("#EXTM3U")) return fail();
    let media = text;
    let base = master.url;
    if (text.includes("#EXT-X-STREAM-INF")) {
      const lines = text.split(/\r?\n/);
      const idx = lines.findIndex((l) => l.startsWith("#EXT-X-STREAM-INF"));
      const variant = lines.slice(idx + 1).find((l) => l.trim() && !l.startsWith("#"));
      if (!variant) return fail();
      const res = await get(new URL(variant.trim(), master.url).toString());
      if (!res.ok) return fail(res.status);
      cors = cors && !!res.headers.get("access-control-allow-origin");
      media = await readText(res);
      base = res.url;
    }
    if (!media.includes("#EXTINF")) return fail();
    // Fetch the start of the newest segment: playlists that load but whose video is
    // blocked or expired (common with ad-stitched FAST feeds) must not count as working.
    const segment = media.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).pop();
    if (!segment) return fail();
    const seg = await get(new URL(segment.trim(), base).toString(), { Range: "bytes=0-2047" });
    if (!seg.ok) return fail(seg.status);
    const head = await readBytes(seg, 2048);
    return { ok: true, cors, ms: Date.now() - started, seg: head.length ? crypto.createHash("md5").update(head).digest("hex") : undefined };
  } catch (error) {
    // Refused connections (not timeouts) are how some broadcasters geo-block.
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    return { ok: false, cors: false, ms: 0, blocked: code === "ECONNREFUSED" || code === "ECONNRESET" };
  }
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const item = items[next++]; await work(item); }
  }));
}

function pickLogo(logos: ApiLogo[]) {
  const usable = logos.filter((l) => l.in_use && !l.feed && l.url.startsWith("https://"));
  const list = usable.length ? usable : logos.filter((l) => l.url.startsWith("https://"));
  // Prefer landscape logos around 300–800px wide: sharp on cards, light on data.
  return list.sort((a, b) => Math.abs((a.width || 400) - 500) - Math.abs((b.width || 400) - 500))[0]?.url;
}

// Second source: the Free-TV/IPTV playlist (official free streams, curated by
// country). Streams for channels IPTV-Org already knows become extra sources for
// that channel; the rest become new channels. YouTube links are skipped because
// the player only does HLS.
const FREE_TV_URL = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";
const FREE_TV_ALIASES: Record<string, string> = { usa: "US", uk: "UK", korea: "KR", trinidad: "TT", "czech republic": "CZ", russia: "RU", iran: "IR", taiwan: "TW", "hong kong": "HK" };
const FREE_TV_GROUP_CATEGORY: [RegExp, string, string?][] = [
  [/^news/i, "news"], [/^business/i, "business"], [/^weather/i, "weather"],
  [/^vod movies/i, "movies", "US"], [/^vod italy/i, "movies", "IT"],
];

async function freeTv(channelById: Map<string, ApiChannel>, knownUrls: Set<string>, countries: { code: string; name: string }[], log: (m: string) => void) {
  const channels: ApiChannel[] = [], streams: ApiStream[] = [], logos: ApiLogo[] = [];
  let text = "";
  try {
    const res = await fetch(FREE_TV_URL, { signal: AbortSignal.timeout(60000) });
    if (res.ok) text = await res.text();
  } catch {}
  if (!text) { log("[catalog] Free-TV playlist unavailable, skipping"); return { channels, streams, logos }; }
  const byName = new Map(countries.map((c) => [c.name.toLowerCase(), c.code]));
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const info = lines[i];
    const url = lines[i + 1]?.trim() || "";
    if (!info.startsWith("#EXTINF") || !/^https?:\/\//.test(url) || /youtube\.com|youtu\.be/.test(url)) continue;
    const bare = url.replace(/^https?:\/\//, "");
    if (knownUrls.has(bare)) continue;
    knownUrls.add(bare);
    const attr = (k: string) => info.match(new RegExp(`${k}="([^"]*)"`))?.[1] || "";
    const name = info.slice(info.lastIndexOf(",") + 1).replace(/\s*[–-]\s*Pluto TV$/i, "").replace(/\s*\(\d+p\)|\s*\[[^\]]*\]/g, "").trim();
    const group = attr("group-title");
    if (!name || /xxx|adult/i.test(group)) continue;
    const existing = channelById.get(attr("tvg-id").split("@")[0]);
    let id = existing?.id;
    if (!id) {
      const rule = FREE_TV_GROUP_CATEGORY.find(([re]) => re.test(group));
      const place = group.split("/").pop()!.trim().toLowerCase();
      const country = rule?.[2] || FREE_TV_ALIASES[place] || byName.get(place) || "INT";
      id = `ft-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.${country.toLowerCase()}`;
      if (!channelById.has(id)) {
        const channel: ApiChannel = { id, name, country, categories: [rule?.[1] || "general"], is_nsfw: false, closed: null, network: null, website: null };
        channels.push(channel); channelById.set(id, channel);
        const logo = attr("tvg-logo");
        if (logo.startsWith("https://")) logos.push({ channel: id, feed: null, in_use: true, width: 400, height: 225, format: null, url: logo });
      }
    }
    streams.push({ channel: id, feed: null, title: name, url, quality: null, user_agent: null, referrer: null });
  }
  log(`[catalog] Free-TV added ${streams.length} streams (${channels.length} new channels)`);
  return { channels, streams, logos };
}

// Anime gets its own category; IPTV-Org files it under "animation" with cartoons.
const ANIME = /\banime|naruto|dragon ?ball|one piece|pok[eé]mon|yu-?gi-?oh|sailor moon|crunchyroll|hidive|retrocrush|toonami|gundam|otaku|\bmanga\b|kaiju/i;

// English-speaking channels first, then other languages; best-scored first
// within each group. Language comes from IPTV-Org's feeds (main feed first);
// channels with no language listed count as "probably English" when they come
// from an English-speaking country.
type ApiFeed = { channel: string | null; is_main: boolean; languages: string[] };
const ENGLISH_COUNTRIES = new Set(["US", "UK", "IE", "AU", "NZ", "CA", "ZA", "NG", "GH", "KE", "UG", "ZW", "ZM", "BW", "NA", "JM", "TT", "BS", "BB", "SG", "PH", "INT"]);
// Names that say outright the channel isn't in English ("Yu-Gi-Oh! en español").
const OTHER_LANGUAGE_NAME = /\b(en espa[nñ]ol|espa[nñ]ol|latino|latin america|arabic|arabia|hindi|tamil|telugu|urdu|fran[cç]ais|deutsch|italia(no)?|portugu[eê]s|brasil|t[uü]rk|russia)\b/i;
const COUNTRY_LANGUAGE: Record<string, string> = { IT: "ita", GR: "ell", DE: "deu", ES: "spa", JP: "jpn", RU: "rus", PT: "por", HU: "hun", MK: "mkd", FR: "fra" };
export function rankByLanguage(channels: CatalogChannel[], feeds: ApiFeed[]) {
  const langs = new Map<string, { main: string[]; all: Set<string> }>();
  for (const f of feeds) {
    if (!f.channel) continue;
    const entry = langs.get(f.channel) || { main: [], all: new Set<string>() };
    for (const l of f.languages || []) entry.all.add(l);
    if (f.is_main) entry.main = f.languages || [];
    langs.set(f.channel, entry);
  }
  for (const ch of channels) {
    const info = langs.get(ch.id);
    if (info?.all.size) {
      ch.lg = info.main[0] || Array.from(info.all)[0];
      // English only when it's the main feed's first language; a second language counts as "probably".
      ch.en = ch.lg === "eng" ? 0 : info.all.has("eng") ? 1 : 2;
      if (OTHER_LANGUAGE_NAME.test(ch.n)) ch.en = 2;
    } else {
      ch.lg = ENGLISH_COUNTRIES.has(ch.c) ? "eng" : COUNTRY_LANGUAGE[ch.c];
      ch.en = ENGLISH_COUNTRIES.has(ch.c) ? 1 : 2;
      if (!ch.lg) delete ch.lg;
    }
  }
  channels.sort((a, b) => (a.en ?? 2) - (b.en ?? 2) || b.sc - a.sc);
}

// "African & Black TV": Nollywood and African movies, BET, Black cinema and
// African music and news, gathered from every category into one row.
const AFRICAN_NAME = /nolly|afro ?land|africa ?magic|afro ?magic|afroculture|naija|\bbet\b|tyler perry|ebony|black (cinema|family|ink|effect|tv)|maverick black|blackpix|shades of black|utv africa|africa 24|africanews|trace (africa|naija|kitoko|mziki|jama|ngoma|mboa|afrikora)/i;
const AFRICAN_COUNTRIES = new Set(["NG", "GH", "KE", "UG", "TZ", "RW", "ET", "CM", "CI", "SN", "ZW", "ZM", "BW", "NA", "MZ", "AO", "CD", "SO", "SL", "LR", "GM", "BJ", "TG", "BF", "ML", "NE"]);
export function tagAfrican(channels: CatalogChannel[]) {
  for (const ch of channels) {
    if (ch.k.includes("african")) continue;
    const brand = AFRICAN_NAME.test(ch.n);
    if (!brand && !AFRICAN_COUNTRIES.has(ch.c)) continue;
    ch.k = [...ch.k, "african"];
    // Nollywood, BET, Black cinema and the like lead the row; local stations follow.
    if (brand) ch.sc += AFRICAN_BRAND_BOOST;
  }
}
const AFRICAN_BRAND_BOOST = 30;

export async function buildCatalog(log = console.log): Promise<Catalog> {
  const [apiChannels, apiStreams, apiLogos, countries] = await Promise.all([
    fetchJson<ApiChannel[]>("channels"), fetchJson<ApiStream[]>("streams"),
    fetchJson<ApiLogo[]>("logos"), fetchJson<{ code: string; name: string }[]>("countries"),
  ]);
  const feeds = await fetchJson<ApiFeed[]>("feeds").catch(() => [] as ApiFeed[]);
  const baseChannels = [...apiChannels, ...EXTRA_CHANNELS.filter((e) => !apiChannels.some((c) => c.id === e.id))];
  const baseStreams = [...apiStreams, ...EXTRA_STREAMS.filter((e) => !apiStreams.some((s) => s.url === e.url))];
  const ft = await freeTv(new Map(baseChannels.map((c) => [c.id, c])), new Set(baseStreams.map((s) => s.url.replace(/^https?:\/\//, ""))), countries, log);
  const channels = [...baseChannels, ...ft.channels];
  const streams = [...baseStreams, ...ft.streams];
  const logos = [...apiLogos, ...EXTRA_LOGOS, ...ft.logos];
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const logosByChannel = new Map<string, ApiLogo[]>();
  for (const logo of logos) { const list = logosByChannel.get(logo.channel) || []; list.push(logo); logosByChannel.set(logo.channel, list); }

  const candidates = streams.filter((s) => {
    const ch = s.channel ? channelById.get(s.channel) : undefined;
    return ch && !ch.is_nsfw && !ch.closed && !ch.categories.includes("xxx") && /^https?:\/\//.test(s.url);
  });
  log(`[catalog] probing ${candidates.length} streams`);

  const alive = new Map<string, CatalogStream[]>();
  const segOf = new Map<CatalogStream, string>(); // stream -> fingerprint of its video
  let done = 0;
  await pool(candidates, PROBE_CONCURRENCY, async (stream) => {
    const result = await probe(stream);
    if (++done % 1000 === 0) log(`[catalog] ${done}/${candidates.length}`);
    // Geo-blocked streams are only offered to viewers in the channel's country.
    // One that refuses our server is kept untested for them, played directly.
    let geo = "";
    try { geo = stream.labels?.includes("Geo-blocked") || SA_ONLY_HOSTS.test(new URL(stream.url).hostname) ? channelById.get(stream.channel!)!.country : ""; } catch {}
    if (!result.ok && !(geo && result.blocked)) return;
    const direct = stream.url.startsWith("https://") && (result.cors || !result.ok) && !stream.user_agent && !stream.referrer;
    if (!result.ok && !direct) return;
    const entry: CatalogStream = { u: stream.url, q: qualityHeight(stream.quality), p: direct ? 0 : 1, ms: result.ok ? result.ms : UNTESTED_MS };
    if (geo) entry.g = geo;
    if (stream.user_agent) entry.ua = stream.user_agent;
    if (stream.referrer) entry.r = stream.referrer;
    const list = alive.get(stream.channel!) || [];
    list.push(entry); alive.set(stream.channel!, list);
    if (result.seg) segOf.set(entry, result.seg);
  });

  // A placeholder ("not available in your region") shows the same video on several
  // channels. So can a shared advert or a simulcast, so suspects are checked again
  // 90s later: live TV has moved on by then, a looping placeholder hasn't.
  const channelsBySeg = new Map<string, Set<string>>();
  for (const [id, list] of Array.from(alive)) for (const s of list) { const h = segOf.get(s); if (h) channelsBySeg.set(h, (channelsBySeg.get(h) || new Set()).add(id)); }
  const shared = new Set(Array.from(channelsBySeg).filter(([, ids]) => ids.size >= SLATE_CHANNELS).map(([h]) => h));
  const suspects = Array.from(alive).flatMap(([id, list]) => list.filter((s) => shared.has(segOf.get(s) || "")).map((s) => ({ id, s })));
  const slates = new Set<CatalogStream>();
  if (suspects.length) {
    await new Promise((r) => setTimeout(r, SLATE_RECHECK_MS));
    await pool(suspects, 20, async ({ s }) => {
      const again = await probe({ channel: null, feed: null, title: "", url: s.u, quality: null, user_agent: s.ua || null, referrer: s.r || null });
      if (!again.ok || again.seg === segOf.get(s)) slates.add(s);
    });
  }
  let dropped = 0;
  for (const [id, list] of Array.from(alive)) {
    const real = list.filter((s) => !slates.has(s));
    dropped += list.length - real.length;
    if (real.length) alive.set(id, real); else alive.delete(id);
  }
  log(`[catalog] ${suspects.length} streams shared a video with other channels; ${dropped} were looping placeholders and dropped`);

  const out: CatalogChannel[] = [];
  for (const [id, list] of Array.from(alive)) {
    const ch = channelById.get(id)!;
    // Tested direct streams first, then relayed ones, then untested local-only backups.
    const rank = (s: CatalogStream) => (s.ms >= UNTESTED_MS ? 2 : s.p);
    list.sort((a, b) => rank(a) - rank(b) || a.ms - b.ms);
    const logo = pickLogo(logosByChannel.get(id) || []);
    const best = list[0];
    const score = (logo ? 30 : 0) + (best.p ? 0 : 20) + Math.min(20, best.q / 54) + Math.max(0, 20 - best.ms / 250)
      + (ch.website ? 5 : 0) + (ch.network ? 5 : 0) + (TOP_PICKS.includes(id) ? 100 : 0) + Math.min(10, list.length * 3);
    const k = ch.categories.length ? ch.categories : ["general"];
    out.push({ id, n: ch.name, c: ch.country, k: ANIME.test(ch.name) ? ["anime", ...k] : k, l: logo, s: list.slice(0, 6), sc: Math.round(score) });
  }
  tagAfrican(out);
  rankByLanguage(out, feeds);
  const countryNames: Record<string, string> = {};
  const used = new Set(out.map((c) => c.c));
  for (const c of countries) if (used.has(c.code)) countryNames[c.code] = c.name;
  if (used.has("INT")) countryNames.INT = "International";
  const result: Catalog = {
    v: 2, builtAt: new Date().toISOString(), checked: candidates.length, alive: out.length,
    picks: TOP_PICKS.filter((id) => alive.has(id)), countries: countryNames, channels: out,
  };
  log(`[catalog] ${out.length} live channels from ${candidates.length} streams`);
  return result;
}

async function refresh() {
  if (building) return;
  building = true;
  try {
    const next = await buildCatalog();
    // Guard against a bad network moment wiping out a good catalog.
    if (!catalog || next.alive >= catalog.alive * 0.6) {
      setCatalog(next);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CATALOG_FILE + ".tmp", JSON.stringify(next));
      fs.renameSync(CATALOG_FILE + ".tmp", CATALOG_FILE);
    } else {
      console.warn(`[catalog] refresh found only ${next.alive} channels; keeping previous ${catalog.alive}`);
    }
  } catch (error) {
    console.error("[catalog] refresh failed", error);
  } finally {
    building = false;
  }
}

export function startCatalog() {
  try {
    const cached = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8")) as Catalog;
    if (cached.v === 2) setCatalog(cached);
  } catch {}
  const age = catalog ? Date.now() - new Date(catalog.builtAt).getTime() : Infinity;
  setTimeout(refresh, age > REFRESH_MS ? 1000 : REFRESH_MS - age);
  setInterval(refresh, REFRESH_MS).unref();
}

export function registerCatalogRoutes(app: Express) {
  app.get("/api/catalog/lite", (req: Request, res: Response) => {
    if (!lite) {
      res.status(503).set("Retry-After", "30").json({ error: "Catalog is warming up", building });
      return;
    }
    res.set("Cache-Control", "public, max-age=600, s-maxage=600, stale-while-revalidate=3600");
    res.set("Content-Type", "application/json; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    const accept = String(req.headers["accept-encoding"] || "");
    if (/\bbr\b/.test(accept)) res.set("Content-Encoding", "br").send(lite.br);
    else if (/\bgzip\b/.test(accept)) res.set("Content-Encoding", "gzip").send(lite.gzip);
    else res.send(zlib.gunzipSync(lite.gzip));
  });
  app.get("/api/streams/:id", (req: Request, res: Response) => {
    const s = streamsById.get(req.params.id);
    if (!s) {
      res.status(catalog ? 404 : 503).json({ error: catalog ? "Channel not found" : "Catalog is warming up" });
      return;
    }
    res.set("Cache-Control", "public, max-age=600, s-maxage=600, stale-while-revalidate=3600").json({ s });
  });
  app.get("/api/catalog", (req: Request, res: Response) => {
    if (!catalog || !catalogGzip) {
      res.status(503).set("Retry-After", "30").json({ error: "Catalog is warming up", building });
      return;
    }
    // s-maxage lets Hostinger's CDN serve the catalog without waking the app.
    res.set("Cache-Control", "public, max-age=600, s-maxage=600, stale-while-revalidate=3600");
    res.set("Content-Type", "application/json; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
      res.set("Content-Encoding", "gzip").send(catalogGzip);
    } else {
      res.send(JSON.stringify(catalog));
    }
  });
}

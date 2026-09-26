import { useEffect, useState, useSyncExternalStore } from "react";

export type Stream = { u: string; q: number; p: 0 | 1; ua?: string; r?: string; ms: number; g?: string };
// s: streams, only sent up front for the home page picks; the player loads the rest
// with loadStreams(). q: best quality; gl: countries it plays in (all streams geo-locked).
export type Channel = { id: string; n: string; c: string; k: string[]; l?: string; s?: Stream[]; sc: number; q?: number; gl?: string[] };
export type Catalog = { builtAt: string; checked: number; alive: number; picks: string[]; countries: Record<string, string>; channels: Channel[] };

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "news", label: "News" },
  { id: "sports", label: "Sports" },
  { id: "movies", label: "Movies" },
  { id: "african", label: "African & Black TV" },
  { id: "series", label: "Series" },
  { id: "entertainment", label: "Entertainment" },
  { id: "music", label: "Music" },
  { id: "anime", label: "Anime" },
  { id: "kids", label: "Kids" },
  { id: "animation", label: "Animation" },
  { id: "documentary", label: "Documentary" },
  { id: "comedy", label: "Comedy" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "cooking", label: "Cooking" },
  { id: "travel", label: "Travel" },
  { id: "science", label: "Science" },
  { id: "business", label: "Business" },
  { id: "classic", label: "Classic TV" },
  { id: "family", label: "Family" },
  { id: "culture", label: "Culture" },
  { id: "education", label: "Education" },
  { id: "outdoor", label: "Outdoor" },
  { id: "auto", label: "Auto" },
  { id: "weather", label: "Weather" },
  { id: "religious", label: "Faith" },
  { id: "general", label: "General" },
  { id: "public", label: "Public" },
  { id: "legislative", label: "Government" },
  { id: "relax", label: "Relax" },
  { id: "shop", label: "Shopping" },
];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label || id[0]?.toUpperCase() + id.slice(1);

// ---- catalog loading (module-level cache so every screen shares one fetch) ----
let cache: Catalog | null = null;
let pending: Promise<Catalog> | null = null;
const byId = new Map<string, Channel>();

function load(): Promise<Catalog> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = (async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch("/api/catalog/lite");
        if (res.ok) {
          const data = localise((await res.json()) as Catalog);
          cache = data;
          for (const ch of data.channels) byId.set(ch.id, ch);
          return data;
        }
        if (attempt >= 20) throw new Error("Catalog unavailable");
        await new Promise((r) => setTimeout(r, Math.min(15000, 2000 * (attempt + 1))));
      }
    })();
    pending.catch(() => { pending = null; });
  }
  return pending;
}

export function useCatalog() {
  const [state, setState] = useState<{ catalog: Catalog | null; error: boolean }>({ catalog: cache, error: false });
  useEffect(() => {
    if (cache) return;
    let live = true;
    load().then((catalog) => live && setState({ catalog, error: false })).catch(() => live && setState({ catalog: null, error: true }));
    return () => { live = false; };
  }, []);
  return state;
}

export const getChannel = (id: string) => byId.get(id);

// ---- playback URLs ----
export function streamSrc(stream: Stream, forceProxy = false) {
  if (!stream.p && !forceProxy) return stream.u;
  const params = new URLSearchParams({ u: btoa(unescape(encodeURIComponent(stream.u))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") });
  if (stream.ua) params.set("ua", stream.ua);
  if (stream.r) params.set("r", stream.r);
  return `/api/stream/m?${params}`;
}

export const qualityTag = (ch: Channel) => {
  const q = ch.q ?? Math.max(0, ...(ch.s || []).map((s) => s.q));
  return q >= 2000 ? "4K" : q >= 1080 ? "FHD" : q >= 720 ? "HD" : q > 0 ? "SD" : "";
};

// ---- TV browsers (Samsung, LG, Android/Google TV, Fire TV, Hisense, …) ----
// Weak GPUs and a remote instead of a mouse: TV mode drops the heavy effects
// and lets the D-pad move focus instead of seeking.
export const isTV = /smart-?tv|tizen|web0s|webos|netcast|hbbtv|bravia|vidaa|hisense|philipstv|roku|crkey|googletv|android tv|\bAFT[A-Z]|opera tv|; ?tv\b|\bdtv\b|aquos|viera|xbox|playstation/i.test(navigator.userAgent);

// ---- network awareness ----
type NetInfo = { saveData?: boolean; effectiveType?: string; downlink?: number; addEventListener?: (t: string, f: () => void) => void };
export function connection(): NetInfo | undefined {
  return (navigator as unknown as { connection?: NetInfo }).connection;
}
export function isSlowNetwork() {
  const c = connection();
  return !!c && (c.saveData === true || /(^|-)2g|3g/.test(c.effectiveType || "") || (c.downlink !== undefined && c.downlink < 1.5));
}

// ---- country guess (for "Popular in your country") ----
const TZ_COUNTRY: Record<string, string> = {
  "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Accra": "GH", "Africa/Harare": "ZW", "Africa/Lusaka": "ZM",
  "Africa/Maputo": "MZ", "Africa/Gaborone": "BW", "Africa/Windhoek": "NA", "Africa/Cairo": "EG", "Africa/Casablanca": "MA", "Africa/Kampala": "UG",
  "Africa/Dar_es_Salaam": "TZ", "Africa/Addis_Ababa": "ET", "Africa/Kinshasa": "CD", "Africa/Abidjan": "CI", "Africa/Dakar": "SN",
  "Europe/London": "UK", "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL",
  "Europe/Lisbon": "PT", "Europe/Istanbul": "TR", "Europe/Moscow": "RU", "Europe/Warsaw": "PL", "Asia/Kolkata": "IN", "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Karachi": "PK", "Asia/Manila": "PH",
  "Asia/Jakarta": "ID", "Australia/Sydney": "AU", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX", "America/Toronto": "CA",
  "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Lima": "PE", "America/Santiago": "CL",
};
export function guessCountry() {
  return settings.get().country || locationCountry();
}
// Where the viewer actually is (time zone, then browser language), ignoring the
// "My country" preference: geo-blocked streams follow location.
export function locationCountry() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  if (tz?.startsWith("America/")) return "US";
  const region = navigator.language.split("-")[1]?.toUpperCase();
  return region === "GB" ? "UK" : region || "US";
}

// ---- tiny persisted stores (per device, no account needed) ----
function store<T>(key: string, initial: T) {
  let value: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = Array.isArray(initial) ? JSON.parse(raw) : { ...initial, ...JSON.parse(raw) };
  } catch {}
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  };
}

export type Settings = { dataSaver: boolean; previews: boolean; country: string; volume: number; muted: boolean; boost: number; onboarded: boolean; genres: string[] };
export const settings = store<Settings>("yokotv-settings", { dataSaver: false, previews: true, country: "", volume: 1, muted: false, boost: 1, onboarded: false, genres: [] });
export const myList = store<string[]>("yokotv-my-list", []);
export const recents = store<string[]>("yokotv-recent", []);

export function useStore<T>(s: { get: () => T; subscribe: (l: () => void) => () => void }) {
  return useSyncExternalStore(s.subscribe, s.get);
}

export function toggleMyList(id: string) {
  const list = myList.get();
  myList.set(list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]);
  return !list.includes(id);
}

export function markWatched(id: string) {
  recents.set([id, ...recents.get().filter((x) => x !== id)].slice(0, 20));
}

// ---- geo lock: only show what can play here ----
// Geo-blocked streams (g) only work in their own country: keep them for viewers
// there, drop them elsewhere, and drop channels left with no stream at all.
function localise(data: Catalog): Catalog {
  const here = locationCountry();
  const channels = data.channels
    .filter((c) => !c.gl || c.gl.includes(here))
    .map((c) => (c.s?.some((s) => s.g) ? { ...c, s: c.s.filter((s) => !s.g || s.g === here) } : c));
  return { ...data, channels, picks: data.picks.filter((id) => channels.some((c) => c.id === id)) };
}

// A channel's streams, fetched when the player opens it (geo-locked ones only
// kept for viewers in that country, as above).
export async function loadStreams(ch: Channel): Promise<Stream[]> {
  if (ch.s?.length) return ch.s;
  const res = await fetch(`/api/streams/${encodeURIComponent(ch.id)}`);
  if (!res.ok) throw new Error("Couldn't load this channel.");
  const here = locationCountry();
  const s = ((await res.json()).s as Stream[]).filter((x) => !x.g || x.g === here);
  ch.s = s;
  return s;
}

export const dataSaverActive = () => settings.get().dataSaver || isSlowNetwork();

export const countryName = (code: string) => cache?.countries[code] || code;

import { useEffect, useRef, useState } from "react";
import { account } from "@/lib/account";
import { isApp, isTV, useStore } from "@/lib/catalog";

// An ad spot. A direct sponsor booked for this spot (server/sponsors.ts) comes
// first; otherwise Google AdSense fills it (configured in data/ads.json, see
// server/ads.ts). TVs get sponsor banners but never AdSense: its script slows
// weak TV browsers down and its ads can't be used with a remote. The Android app
// gets sponsors but no AdSense either (AdSense isn't allowed in WebView apps).
// Premium members see no ads at all.
type AdsConfig = { client: string; slots: Record<string, string> };
type SponsorAd = { id: string; image: string; alt: string; slots: string[] };
let config: Promise<AdsConfig> | null = null;
let sponsors: Promise<SponsorAd[]> | null = null;
let scriptAdded = false;

function loadConfig() {
  if (!config) config = fetch("/api/config").then((r) => r.json()).then((j) => j.ads as AdsConfig).catch(() => ({ client: "", slots: {} }));
  return config;
}
function loadSponsors() {
  if (!sponsors) sponsors = fetch("/api/sponsors").then((r) => r.json()).then((j) => j.sponsors as SponsorAd[]).catch(() => []);
  return sponsors;
}

// Ads load after the page is up: on the first scroll/tap/key, or 15 seconds in,
// so they never hold back the first paint.
let idle: Promise<void> | null = null;
function afterFirstPaint() {
  if (!idle) idle = new Promise<void>((resolve) => {
    const go = () => resolve();
    for (const e of ["scroll", "pointerdown", "keydown", "touchstart"]) window.addEventListener(e, go, { once: true, passive: true });
    const later = () => window.setTimeout(go, 15000);
    if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
  });
  return idle;
}

function addScript(client: string) {
  if (scriptAdded) return;
  scriptAdded = true;
  afterFirstPaint().then(() => injectScript(client));
}
function injectScript(client: string) {
  // The server already puts the script in the page <head> for AdSense (server/seo.ts).
  if (document.querySelector('script[src*="adsbygoogle.js"]')) return;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(s);
}

// Loads the AdSense script once (which also enables Auto ads if they're on in AdSense).
export function useAds() {
  const premium = !!useStore(account).user?.premium;
  useEffect(() => {
    if (isTV || isApp || premium) return;
    loadConfig().then((c) => { if (c.client) addScript(c.client); });
  }, [premium]);
}

type Filled = { kind: "sponsor"; ad: SponsorAd } | { kind: "adsense"; client: string; slot: string };

export default function AdSlot({ name }: { name: "home" | "browse" | "guide" }) {
  const premium = !!useStore(account).user?.premium;
  const [fill, setFill] = useState<Filled | null>(null);
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    if (premium) return setFill(null);
    let live = true;
    loadSponsors().then(async (list) => {
      const booked = list.filter((s) => s.slots.includes(name));
      if (!live) return;
      // Several sponsors on one spot share it: one is picked at random per view.
      if (booked.length) return setFill({ kind: "sponsor", ad: booked[Math.floor(Math.random() * booked.length)] });
      if (isTV || isApp) return;
      const c = await loadConfig();
      if (live && c.client && c.slots[name]) setFill({ kind: "adsense", client: c.client, slot: c.slots[name] });
    });
    return () => { live = false; };
  }, [name, premium]);
  useEffect(() => {
    if (fill?.kind === "sponsor") { fetch(`/api/sponsors/${fill.ad.id}/view`, { method: "POST", keepalive: true }).catch(() => undefined); return; }
    if (fill?.kind !== "adsense" || !ref.current) return;
    addScript(fill.client);
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}); } catch {}
  }, [fill]);
  if (!fill) return null;
  if (fill.kind === "sponsor") return <aside className="ad-slot sponsor-slot" aria-label="Sponsored">
    <span className="ad-label">Sponsored</span>
    <a href={`/go/${fill.ad.id}`} target="_blank" rel="sponsored noopener"><img src={fill.ad.image} alt={fill.ad.alt} loading="lazy" /></a>
  </aside>;
  return <aside className="ad-slot" aria-label="Advertisement">
    <span className="ad-label">Advertisement</span>
    <ins ref={ref} className="adsbygoogle" style={{ display: "block" }} data-ad-client={fill.client} data-ad-slot={fill.slot} data-ad-format="auto" data-full-width-responsive="true" />
  </aside>;
}

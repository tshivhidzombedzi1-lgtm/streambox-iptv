import { useEffect, useRef, useState } from "react";
import { isTV } from "@/lib/catalog";

// Google AdSense, configured on the server in data/ads.json (see server/ads.ts).
// Nothing loads until a publisher ID is set. TVs get no ads: AdSense can't be
// reached with a remote, and the script slows weak TV browsers down.
type AdsConfig = { client: string; slots: Record<string, string> };
let config: Promise<AdsConfig> | null = null;
let scriptAdded = false;

function loadConfig() {
  if (!config) config = fetch("/api/config").then((r) => r.json()).then((j) => j.ads as AdsConfig).catch(() => ({ client: "", slots: {} }));
  return config;
}

function addScript(client: string) {
  if (scriptAdded) return;
  scriptAdded = true;
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
  useEffect(() => {
    if (isTV) return;
    loadConfig().then((c) => { if (c.client) addScript(c.client); });
  }, []);
}

export default function AdSlot({ name }: { name: "home" | "browse" }) {
  const [ad, setAd] = useState<{ client: string; slot: string } | null>(null);
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    if (isTV) return;
    let live = true;
    loadConfig().then((c) => { if (live && c.client && c.slots[name]) setAd({ client: c.client, slot: c.slots[name] }); });
    return () => { live = false; };
  }, [name]);
  useEffect(() => {
    if (!ad || !ref.current) return;
    addScript(ad.client);
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}); } catch {}
  }, [ad]);
  if (!ad) return null;
  return <aside className="ad-slot" aria-label="Advertisement">
    <span className="ad-label">Advertisement</span>
    <ins ref={ref} className="adsbygoogle" style={{ display: "block" }} data-ad-client={ad.client} data-ad-slot={ad.slot} data-ad-format="auto" data-full-width-responsive="true" />
  </aside>;
}

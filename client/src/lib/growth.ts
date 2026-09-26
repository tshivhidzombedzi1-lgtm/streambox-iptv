// Growth plumbing: anonymous stats beacons (server/stats.ts), sharing with
// WhatsApp first, and the "Install app" prompt for the PWA.
import { type Channel, guessCountry, isApp, isTV } from "./catalog";

// ---- anonymous stats ----
function visitorId() {
  try {
    let id = localStorage.getItem("yokotv-vid");
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join(""); localStorage.setItem("yokotv-vid", id); }
    return id;
  } catch { return "anon00000000"; }
}
const device = () => (isTV ? "tv" : window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 800 ? "mobile" : "desktop");

export function track(e: "view" | "play" | "share" | "install" | "signup", extra: Record<string, string | number> = {}) {
  if (/bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;
  const body = JSON.stringify({ e, v: visitorId(), ...extra });
  try {
    if (navigator.sendBeacon?.("/api/stats", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

let landed = false;
export function trackView(path: string) {
  const extra: Record<string, string | number> = { p: path, d: device(), c: guessCountry() };
  if (!landed) {
    landed = true;
    const q = new URLSearchParams(window.location.search);
    Object.assign(extra, { f: 1, r: document.referrer, s: q.get("utm_source") || q.get("source") || "" });
  }
  track("view", extra);
}

// ---- sharing ----
export const shareUrl = (channel: Channel | null, source: string) =>
  `${window.location.origin}${channel ? `/watch/${encodeURIComponent(channel.id)}` : "/"}?utm_source=${source}`;
export const shareText = (channel: Channel | null) =>
  channel ? `I'm watching ${channel.n} live on YokoTV. Free, no sign-up:` : "Free live TV in South Africa: SABC, news, sport, music and more on YokoTV:";

export function shareTo(target: "whatsapp" | "facebook" | "x", channel: Channel | null) {
  const url = shareUrl(channel, target);
  const text = shareText(channel);
  const links = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  };
  window.open(links[target], "_blank", "noopener");
  track("share", channel ? { ch: channel.id, t: target } : { t: target });
}

// Phones get the system share sheet (WhatsApp is usually first); returns false
// where there isn't one so the caller can show its own options.
export async function nativeShare(channel: Channel | null) {
  if (!navigator.share || !window.matchMedia("(pointer: coarse)").matches) return false;
  try {
    await navigator.share({ title: channel ? `${channel.n} live on YokoTV` : "YokoTV", text: shareText(channel), url: shareUrl(channel, "share") });
    track("share", channel ? { ch: channel.id, t: "native" } : { t: "native" });
  } catch {}
  return true;
}

// ---- install (PWA) ----
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
let state = { canInstall: false, ios: false, installed: false };
const listeners = new Set<() => void>();
const update = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const install = { get: () => state, subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); } };

export function setupInstall() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  // The Android app is already installed, and skips the service worker so its own
  // offline screen (with Retry) shows instead of a cached page.
  if (standalone || isTV || isApp) { update({ installed: standalone || isApp }); return; }
  // iPhone/iPad Safari never fires beforeinstallprompt; we show "Add to Home Screen" steps instead.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  update({ ios });
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; update({ canInstall: true }); });
  window.addEventListener("appinstalled", () => { deferred = null; update({ canInstall: false, installed: true }); track("install"); });
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}

export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  update({ canInstall: false });
  return outcome === "accepted";
}

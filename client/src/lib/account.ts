// Optional account: signing in syncs My List, Continue watching and settings
// (the per-device stores in catalog.ts) through /api/account. Signed out,
// everything keeps working from localStorage exactly as before.
import { myList, recents, type Settings, settings } from "./catalog";
import { track } from "./growth";
import { toast } from "sonner";
import { googleSignedOut, setGoogleHandler } from "./google";

export type User = { id: number; email: string; name: string; createdAt: number; premium: boolean; premiumUntil: number | null; plan: string | null; renews: boolean };
type Synced = { myList?: string[]; recents?: string[]; settings?: Partial<Settings> };

let state: { user: User | null; ready: boolean } = { user: null, ready: false };
const listeners = new Set<() => void>();
const update = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const account = {
  get: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
};

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again.");
  return json;
}

// Volume, mute and boost are per device (a TV and a phone want different levels).
const DEVICE_ONLY: (keyof Settings)[] = ["volume", "muted", "boost", "dataSaver"];
const syncedSettings = () => Object.fromEntries(Object.entries(settings.get()).filter(([k]) => !DEVICE_ONLY.includes(k as keyof Settings))) as Partial<Settings>;
const merge = (a: string[], b: string[], max: number) => Array.from(new Set([...a, ...b])).slice(0, max);

let applying = false;
function applyServer(data: Synced | null) {
  applying = true;
  // First sign-in on this device: keep what was saved here and add the account's.
  myList.set(merge(myList.get(), data?.myList || [], 500));
  recents.set(merge(recents.get(), data?.recents || [], 20));
  if (data?.settings) settings.set({ ...settings.get(), ...data.settings, onboarded: true });
  applying = false;
  push();
}

let timer = 0;
function push() {
  if (!state.user || applying) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    call("PUT", "/api/account/data", { data: { myList: myList.get(), recents: recents.get(), settings: syncedSettings() } }).catch(() => undefined);
  }, 1500);
}
myList.subscribe(push);
recents.subscribe(push);
settings.subscribe(push);

function signedIn(result: { user: User; data: Synced | null }) {
  update({ user: result.user });
  applyServer(result.data);
}

export async function loadAccount() {
  try {
    const result = await call("GET", "/api/account/me");
    if (result.user) signedIn(result);
  } catch {}
  update({ ready: true });
}

export async function signUp(email: string, password: string, name: string) {
  signedIn(await call("POST", "/api/account/signup", { email, password, name }));
  track("signup");
}
export const signIn = async (email: string, password: string) => signedIn(await call("POST", "/api/account/login", { email, password }));
export const forgotPassword = (email: string) => call("POST", "/api/account/forgot", { email });
export const resetPassword = async (token: string, password: string) => signedIn(await call("POST", "/api/account/reset", { token, password }));
export async function signOut() {
  await call("POST", "/api/account/logout");
  googleSignedOut();
  update({ user: null });
}

// Google hands the browser a signed credential (button or One Tap); the server
// checks it with Google and signs in or creates the account.
setGoogleHandler(async (credential) => {
  try {
    const result = await call("POST", "/api/account/google", { credential });
    signedIn(result);
    if (result.created) track("signup");
    toast(`Signed in as ${result.user.name || result.user.email}`);
  } catch (err) {
    toast(err instanceof Error ? err.message : "Google sign-in didn't work.");
  }
});

export async function deleteAccount() {
  await call("DELETE", "/api/account");
  update({ user: null });
}

// Premium: stop renewing (it lasts to the end of the paid period), and re-read
// the account, e.g. after checkout while Stripe's confirmation arrives.
export async function cancelPremium() {
  await call("POST", "/api/pay/cancel");
  await refreshAccount();
}
export async function refreshAccount() {
  const result = await call("GET", "/api/account/me");
  update({ user: result.user || null });
  return result.user as User | null;
}

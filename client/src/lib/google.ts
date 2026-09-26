// Sign in with Google (Google Identity Services): the "Continue with Google"
// button and One Tap, which signs returning visitors in automatically. Off
// until the server has an OAuth client ID (data/google.json). Also off on TVs
// and in the Android app, where Google blocks sign-in inside WebViews.
import { isApp, isTV } from "./catalog";

type Gis = {
  initialize: (o: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  prompt: () => void;
  cancel: () => void;
  disableAutoSelect: () => void;
};
const gis = () => (window as unknown as { google?: { accounts?: { id?: Gis } } }).google?.accounts?.id;

let ready: Promise<string> | null = null;
let onCredential: (credential: string) => void = () => undefined;

// Loads Google's script once and initialises it; resolves to the client ID ("" if off).
export function loadGoogle(): Promise<string> {
  if (!ready) {
    ready = fetch("/api/account/config").then((r) => r.json()).then((c: { googleClientId?: string }) => {
      const clientId = c.googleClientId || "";
      if (!clientId || isTV || isApp) return "";
      return new Promise<string>((resolve) => {
        const done = () => {
          gis()?.initialize({
            client_id: clientId,
            callback: (r: { credential?: string }) => r.credential && onCredential(r.credential),
            auto_select: true, // returning visitors are signed in without a click
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true,
            context: "signin",
            itp_support: true,
          });
          resolve(gis() ? clientId : "");
        };
        if (gis()) return done();
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = done;
        s.onerror = () => resolve("");
        document.head.appendChild(s);
      });
    }).catch(() => "");
  }
  return ready;
}

export function setGoogleHandler(handler: (credential: string) => void) {
  onCredential = handler;
}

export async function renderGoogleButton(el: HTMLElement) {
  if (!(await loadGoogle())) return false;
  gis()?.renderButton(el, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: Math.min(el.clientWidth || 360, 400) });
  return true;
}

export async function googleOneTap() {
  if (await loadGoogle()) gis()?.prompt();
}

// After signing out, stop One Tap from signing the same person straight back in.
export function googleSignedOut() {
  gis()?.disableAutoSelect();
}

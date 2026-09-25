// Paying viewers, through Stripe: YokoTV Premium (monthly or yearly
// subscription, no ads) and once-off "Support YokoTV" tips, charged in rand.
// Settings live in data/stripe.json, written by the Connect Stripe box in /admin (never committed):
//   { "enabled": false, "secretKey": "sk_…", "webhookSecret": "whsec_…",
//     "prices": { "monthly": 29, "annual": 249 } }
// Nothing is sold until "enabled" is true and both keys are set. With a test
// key (sk_test_…) only admins can start a checkout.
// Stripe's webhook (signed with webhookSecret) is the only thing that grants
// Premium; subscriptions are re-read from Stripe's API before trusting them.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Express, Request } from "express";
import { countPremium, currentUser, endSubscription, findUser, onAccountDelete, setPremiumUntil, setStripeCustomer, setSubscription } from "./accounts";
import { isAdmin } from "./stats";

const SITE = "https://yokotv.online";
const API = "https://api.stripe.com/v1";
const DATA_DIR = path.resolve(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "stripe.json");
const TIPS = [20, 50, 100];
const GRACE_MS = 2 * 86400_000; // renewals can land a little after the period ends
type Plan = "monthly" | "annual";

type Config = { enabled: boolean; secretKey: string; webhookSecret: string; prices: Record<Plan, number> };
function config(): Config {
  let raw: Partial<Config> = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch {}
  return {
    enabled: raw.enabled === true, secretKey: String(raw.secretKey || "").trim(), webhookSecret: String(raw.webhookSecret || "").trim(),
    prices: { monthly: Number(raw.prices?.monthly) || 29, annual: Number(raw.prices?.annual) || 249 },
  };
}
const ready = (c: Config) => c.enabled && /^(sk|rk)_(test|live)_\w+$/.test(c.secretKey) && c.webhookSecret.startsWith("whsec_");
const testMode = (c: Config) => /^(sk|rk)_test_/.test(c.secretKey);

// Stripe's API takes form-encoded bodies with bracketed keys, e.g. line_items[0][quantity].
function form(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null || v === "") return [];
    if (typeof v === "object") return form(v as Record<string, unknown>, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
  });
}
async function stripe<T>(c: Config, method: string, route: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${route}`, {
    method, headers: { Authorization: `Bearer ${c.secretKey}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: body ? form(body).join("&") : undefined, signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${route}: ${j.error?.message || res.status}`);
  return j as T;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "yokotv.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, user_id INTEGER, kind TEXT NOT NULL, plan TEXT,
    amount REAL NOT NULL, currency TEXT, email TEXT, created_at INTEGER NOT NULL
  );
`);
const recordPayment = (id: string, userId: number | null, kind: string, plan: Plan | null, amountCents: number, currency: string, email: string) =>
  db.prepare("INSERT OR IGNORE INTO payments (id, user_id, kind, plan, amount, currency, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, kind, plan, amountCents / 100, currency, email.toLowerCase().slice(0, 200), Date.now());

type Subscription = { id: string; status: string; customer: string; cancel_at_period_end: boolean; current_period_end: number; metadata: { user_id?: string; plan?: string } };

// Brings a user's Premium in line with the subscription as Stripe has it now.
async function syncSubscription(c: Config, id: string) {
  const sub = await stripe<Subscription>(c, "GET", `/subscriptions/${encodeURIComponent(id)}`);
  const userId = Number(sub.metadata.user_id);
  const user = userId ? findUser(userId) : undefined;
  if (!user) return;
  const plan = sub.metadata.plan === "annual" ? "annual" : "monthly";
  setStripeCustomer(user.id, sub.customer);
  if (sub.status === "active" || sub.status === "trialing") setPremiumUntil(user.id, sub.current_period_end * 1000 + GRACE_MS, plan);
  // Renewing only while active and not set to stop at the end of the period.
  setSubscription(user.id, (sub.status === "active" || sub.status === "trialing") && !sub.cancel_at_period_end ? sub.id : null);
  if (sub.status === "canceled") endSubscription(sub.id);
}

// Stripe-Signature: t=<time>,v1=<HMAC-SHA256 of "t.body"> using the webhook secret.
function verifySignature(c: Config, req: Request) {
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  const header = String(req.headers["stripe-signature"] || "");
  const t = header.match(/(?:^|,)t=(\d+)/)?.[1];
  const sigs = Array.from(header.matchAll(/(?:^|,)v1=([a-f0-9]+)/g), (m) => m[1]);
  if (!raw || !t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replayed or stale
  const expected = crypto.createHmac("sha256", c.webhookSecret).update(`${t}.${raw.toString("utf8")}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

type Event = { id: string; type: string; data: { object: Record<string, unknown> } };
async function handleEvent(c: Config, event: Event) {
  const o = event.data.object as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (event.type) {
    case "checkout.session.completed": {
      if (o.payment_status !== "paid") return;
      const userId = Number(o.client_reference_id) || null;
      if (o.mode === "subscription" && o.subscription) return syncSubscription(c, String(o.subscription));
      if (o.mode === "payment") recordPayment(String(o.payment_intent || o.id), userId, "tip", null, Number(o.amount_total) || 0, String(o.currency || ""), String(o.customer_details?.email || ""));
      return;
    }
    case "invoice.paid": {
      // Every subscription charge, the first one and each renewal. (Newer Stripe API
      // versions move the subscription under parent.subscription_details.)
      const subId = o.subscription || o.parent?.subscription_details?.subscription;
      if (!subId) return;
      const sub = await stripe<Subscription>(c, "GET", `/subscriptions/${encodeURIComponent(String(subId))}`);
      recordPayment(String(o.id), Number(sub.metadata.user_id) || null, "premium", sub.metadata.plan === "annual" ? "annual" : "monthly", Number(o.amount_paid) || 0, String(o.currency || ""), String(o.customer_email || ""));
      return syncSubscription(c, sub.id);
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription(c, String(o.id));
  }
}

export function registerPaymentRoutes(app: Express) {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ enabled: false, secretKey: "", webhookSecret: "", prices: { monthly: 29, annual: 249 } }, null, 2) + "\n", { mode: 0o600 });
  }
  // A deleted account's subscription stops at once (no further charges).
  onAccountDelete((id) => stripe(config(), "DELETE", `/subscriptions/${encodeURIComponent(id)}`));

  // What the Premium page can offer right now.
  app.get("/api/pay/config", async (req, res) => {
    const c = config();
    const open = ready(c) && (!testMode(c) || !!(await isAdmin(req)));
    res.set("Cache-Control", "no-store").json({ open, testMode: testMode(c), prices: c.prices, tips: TIPS });
  });

  // Creates a Stripe Checkout page and returns its address.
  app.post("/api/pay/checkout", async (req, res) => {
    const c = config();
    if (!ready(c) || (testMode(c) && !(await isAdmin(req)))) return void res.status(403).json({ error: "Payments aren't open yet." });
    const user = await currentUser(req);
    const kind = req.body?.kind === "tip" ? "tip" : "premium";
    const plan: Plan = req.body?.plan === "annual" ? "annual" : "monthly";
    if (kind === "premium" && !user) return void res.status(401).json({ error: "Sign in first, so Premium goes on your account." });
    if (kind === "premium" && user?.sub_code) return void res.status(400).json({ error: "You already have a Premium subscription." });
    const amount = kind === "premium" ? c.prices[plan] : Math.round(Number(req.body?.amount));
    if (kind === "tip" && !(amount >= 10 && amount <= 5000)) return void res.status(400).json({ error: "Choose an amount between R10 and R5,000." });
    const name = kind === "premium" ? `YokoTV Premium (${plan === "annual" ? "yearly" : "monthly"})` : "Support YokoTV";
    try {
      const session = await stripe<{ url: string }>(c, "POST", "/checkout/sessions", {
        mode: kind === "premium" ? "subscription" : "payment",
        success_url: `${SITE}/premium?paid=${kind}`, cancel_url: `${SITE}/premium?cancelled=1`,
        client_reference_id: user?.id, customer: user?.stripe_customer || undefined,
        customer_email: user && !user.stripe_customer ? user.email : undefined,
        line_items: { 0: { quantity: 1, price_data: {
          currency: "zar", unit_amount: amount * 100, product_data: { name },
          recurring: kind === "premium" ? { interval: plan === "annual" ? "year" : "month" } : undefined,
        } } },
        metadata: { kind, plan: kind === "premium" ? plan : undefined },
        subscription_data: kind === "premium" ? { metadata: { user_id: user!.id, plan } } : undefined,
        submit_type: kind === "tip" ? "donate" : undefined,
      });
      res.json({ url: session.url });
    } catch (e) {
      console.error("[payments] checkout failed", e);
      res.status(502).json({ error: "Payments are having a problem right now. Try again in a few minutes." });
    }
  });

  // Stripe's webhook: verify the signature, then apply the event.
  app.post("/api/pay/webhook", (req, res) => {
    const c = config();
    if (!ready(c) || !verifySignature(c, req)) return void res.status(400).end();
    res.status(200).end();
    handleEvent(c, req.body as Event).catch((e) => console.error("[payments] webhook failed:", e.message));
  });

  // Stop renewing; Premium lasts until the end of the time already paid for.
  app.post("/api/pay/cancel", async (req, res) => {
    const user = await currentUser(req);
    if (!user?.sub_code) return void res.status(400).json({ error: "You don't have a subscription that renews." });
    try {
      const c = config();
      await stripe(c, "POST", `/subscriptions/${encodeURIComponent(user.sub_code)}`, { cancel_at_period_end: "true" });
      await syncSubscription(c, user.sub_code);
      res.json({ ok: true, premiumUntil: findUser(user.id)?.premium_until });
    } catch (e) {
      console.error("[payments] cancel failed", e);
      res.status(502).json({ error: "Stripe didn't respond. Try again in a few minutes, or email support@yokotv.online." });
    }
  });

  // Admin: connect Stripe with just the secret key. The server checks the key,
  // creates the webhook in the owner's Stripe account (replacing any older YokoTV
  // one) and saves both secrets. Keys are never sent back to the browser.
  app.post("/api/admin/payments/connect", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Admins only" });
    const secretKey = String(req.body?.secretKey || "").trim();
    if (!/^(sk|rk)_(test|live)_\w{10,}$/.test(secretKey)) return void res.status(400).json({ error: "That doesn't look like a Stripe secret key. It starts with sk_test_ or sk_live_." });
    const c = { ...config(), secretKey };
    try {
      const acct = await stripe<{ id: string; country: string; default_currency: string; charges_enabled: boolean; business_profile?: { name?: string } }>(c, "GET", "/account");
      const url = `${SITE}/api/pay/webhook`;
      const existing = await stripe<{ data: { id: string; url: string }[] }>(c, "GET", "/webhook_endpoints?limit=100");
      for (const w of existing.data.filter((x) => x.url === url)) await stripe(c, "DELETE", `/webhook_endpoints/${w.id}`);
      const hook = await stripe<{ secret: string }>(c, "POST", "/webhook_endpoints", {
        url, description: "YokoTV Premium and support payments", api_version: "2024-06-20",
        enabled_events: { 0: "checkout.session.completed", 1: "invoice.paid", 2: "customer.subscription.updated", 3: "customer.subscription.deleted" },
      });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ enabled: true, secretKey, webhookSecret: hook.secret, prices: c.prices }, null, 2) + "\n", { mode: 0o600 });
      res.json({ ok: true, mode: testMode(c) ? "test" : "live", country: acct.country, currency: acct.default_currency, chargesEnabled: acct.charges_enabled, name: acct.business_profile?.name || "" });
    } catch (e) {
      console.error("[payments] connect failed", e);
      res.status(400).json({ error: `Stripe said: ${(e as Error).message.replace(/^Stripe [^:]*: /, "")}` });
    }
  });

  app.post("/api/admin/payments/disconnect", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Admins only" });
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...raw, enabled: false }, null, 2) + "\n", { mode: 0o600 });
    res.json({ ok: true });
  });

  // Admin: money in, subscribers, recent payments.
  app.get("/api/admin/payments", async (req, res) => {
    if (!(await isAdmin(req))) return void res.status(403).json({ error: "Admins only" });
    const monthStart = Date.parse(new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 8) + "01T00:00:00+02:00");
    const sum = (sql: string, ...a: number[]) => db.prepare(sql).get(...a) as { gross: number | null; n: number };
    const c = config();
    res.set("Cache-Control", "no-store").json({
      status: !c.enabled ? "off" : !ready(c) ? "missing details" : testMode(c) ? "test mode" : "live",
      key: c.secretKey ? `${c.secretKey.slice(0, 8)}…${c.secretKey.slice(-4)}` : "",
      subscribers: countPremium(),
      month: sum("SELECT SUM(amount) gross, COUNT(*) n FROM payments WHERE created_at >= ?", monthStart),
      all: sum("SELECT SUM(amount) gross, COUNT(*) n FROM payments"),
      recent: db.prepare("SELECT id, kind, plan, amount, currency, email, created_at FROM payments ORDER BY created_at DESC LIMIT 25").all(),
    });
  });
}

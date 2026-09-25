import { CreditCard, ExternalLink } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type Totals = { gross: number | null; n: number };
type Summary = {
  status: string; key: string; subscribers: number; month: Totals; all: Totals;
  recent: { id: string; kind: string; plan: string | null; amount: number; currency: string; email: string; created_at: number }[];
};
const rand = (n: number | null) => `R${(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, string> = {
  off: "Off: connect Stripe below to start taking payments.",
  "missing details": "Switched on, but the Stripe connection is incomplete. Connect again below.",
  "test mode": "Test mode: only admins can pay, with Stripe's test card 4242 4242 4242 4242. No real money moves.",
  live: "Live: viewers can pay.",
};

async function post(url: string, body?: object) {
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}

// Viewer payments (server/payments.ts): connect Stripe, and see what came in.
export default function AdminPayments() {
  const [data, setData] = useState<Summary | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/admin/payments", { credentials: "same-origin" }).then((r) => r.json()).then(setData).catch(() => undefined);
  useEffect(() => { load(); }, []);

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post("/api/admin/payments/connect", { secretKey: key });
      setKey("");
      toast(`Stripe connected in ${r.mode} mode${r.name ? ` (${r.name})` : ""}.${r.chargesEnabled ? "" : " Stripe says this account can't take charges yet: finish your Stripe account setup."}`);
      load();
    } catch (err) { toast((err as Error).message); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm("Turn payments off? Existing subscriptions keep running in Stripe; new payments stop.")) return;
    await post("/api/admin/payments/disconnect").catch(() => undefined);
    load();
  };

  if (!data) return null;
  const connected = data.status === "test mode" || data.status === "live";
  return <section className="admin-card">
    <h2>Payments</h2>
    <p className={`admin-empty ${data.status === "live" ? "pay-live" : ""}`}>{STATUS[data.status] || data.status}{connected && data.key && <> Key in use: <code>{data.key}</code></>}</p>

    <form className="acct-form stripe-connect" onSubmit={connect}>
      <label><CreditCard size={15} className="inline-icon" /> {connected ? "Switch to another Stripe key (e.g. from test to live)" : "Connect Stripe: paste your secret key"}
        <input type="password" autoComplete="off" spellCheck={false} placeholder="sk_test_… or sk_live_…" value={key} onChange={(e) => setKey(e.target.value)} required /></label>
      <p className="admin-empty">Find it in Stripe under Developers → API keys → Secret key (click Reveal, then copy).{" "}
        <a href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noreferrer">Test keys <ExternalLink size={12} /></a>{" · "}
        <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer">Live keys <ExternalLink size={12} /></a>.
        YokoTV sets up the rest (including the webhook) automatically. The key is stored on the server and never shown again.</p>
      <div className="sheet-actions">
        <button className="btn btn-light" disabled={busy || !key.trim()}>{busy ? "Connecting…" : "Connect Stripe"}</button>
        {data.status !== "off" && <button type="button" className="btn btn-ghost" onClick={disconnect}>Turn payments off</button>}
      </div>
    </form>

    <div className="admin-tiles pay-tiles">
      <div className="admin-tile"><span>This month</span><strong>{rand(data.month.gross)}</strong><small>{data.month.n} payments, before Stripe fees</small></div>
      <div className="admin-tile"><span>All time</span><strong>{rand(data.all.gross)}</strong><small>{data.all.n} payments</small></div>
      <div className="admin-tile"><span>Premium members</span><strong>{data.subscribers.toLocaleString("en-ZA")}</strong><small>with Premium right now</small></div>
    </div>
    {data.recent.length > 0 && <table className="sponsor-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Email</th></tr></thead>
      <tbody>{data.recent.map((p) => <tr key={p.id}>
        <td>{new Date(p.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</td>
        <td>{p.kind === "tip" ? "Support" : `Premium (${p.plan === "annual" ? "yearly" : "monthly"})`}</td>
        <td>{rand(p.amount)}{p.currency && p.currency !== "zar" ? ` ${p.currency.toUpperCase()}` : ""}</td>
        <td>{p.email}</td>
      </tr>)}</tbody></table>}
  </section>;
}

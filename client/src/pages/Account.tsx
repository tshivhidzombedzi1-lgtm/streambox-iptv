import { CalendarCheck, CreditCard, Crown, LogOut, Receipt, Settings2, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { AccountSheet } from "@/components/Account";
import { Shell } from "@/pages/Screens";
import { account, cancelPremium, deleteAccount, signOut } from "@/lib/account";
import { guessCountry, isSlowNetwork, settings, useCatalog, useStore } from "@/lib/catalog";

type Payment = { id: string; kind: string; plan: string | null; amount: number; currency: string; created_at: number };
const date = (t: number) => new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const rand = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const planName = (p: string | null) => (p === "annual" ? "Yearly" : "Monthly");

async function post(url: string) {
  const res = await fetch(url, { method: "POST", credentials: "same-origin" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}><i /></button>;
}

// The member's own dashboard: profile, membership and billing, preferences,
// payment history, and account security.
export default function AccountScreen() {
  const { user, ready } = useStore(account);
  const { catalog } = useCatalog();
  const prefs = useStore(settings);
  const [, navigate] = useLocation();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [prices, setPrices] = useState({ monthly: 29, annual: 249 });
  const [busy, setBusy] = useState("");
  const [signin, setSignin] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/pay/history", { credentials: "same-origin" }).then((r) => r.json()).then((j) => setPayments(j.payments || [])).catch(() => setPayments([]));
    fetch("/api/pay/config", { credentials: "same-origin" }).then((r) => r.json()).then((j) => j.prices && setPrices(j.prices)).catch(() => undefined);
  }, [user?.id, user?.premium]);

  const set = (patch: Partial<typeof prefs>) => settings.set({ ...settings.get(), ...patch });
  const countries = catalog ? Object.entries(catalog.countries).sort((a, b) => a[1].localeCompare(b[1])) : [];
  const run = async (key: string, work: () => Promise<unknown>) => { setBusy(key); try { await work(); } catch (e) { toast((e as Error).message); } finally { setBusy(""); } };
  const manageBilling = () => run("portal", async () => { window.location.href = (await post("/api/pay/portal")).url; });
  const cancel = () => {
    if (!window.confirm("Cancel your Premium subscription? You won't be charged again, and Premium keeps working until the end of the period you've paid for.")) return;
    run("cancel", async () => { await cancelPremium(); toast("Subscription cancelled. Premium runs to the end of your paid period."); });
  };
  const remove = () => {
    if (!window.confirm(`Delete your YokoTV account? Your list and settings are erased${user?.renews ? ", and your Premium subscription stops immediately" : ""}. This can't be undone.`)) return;
    run("delete", async () => { await deleteAccount(); toast("Account deleted"); navigate("/"); });
  };

  if (!ready) return <Shell catalog={catalog}><div className="dash"><div className="state small"><div className="loader" /></div></div></Shell>;
  if (!user) return <Shell catalog={catalog}><div className="dash">
    <section className="glass dash-empty">
      <UserRound size={34} /><h1>Your YokoTV account</h1>
      <p>Sign in to see your membership, billing and preferences, and to keep My List in sync on every device.</p>
      <button className="btn btn-light" onClick={() => setSignin(true)}>Sign in or create an account</button>
    </section>
    {signin && <AccountSheet onClose={() => setSignin(false)} />}
  </div></Shell>;

  const initial = (user.name || user.email)[0].toUpperCase();
  return <Shell catalog={catalog}><div className="dash">
    <header className="glass dash-hero">
      <div className={`dash-avatar ${user.premium ? "premium" : ""}`}>{initial}</div>
      <div className="dash-who">
        <h1>{user.name || user.email.split("@")[0]}</h1>
        <p>{user.email} · Member since {new Date(user.createdAt).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}</p>
      </div>
      <span className={`dash-badge ${user.premium ? "premium" : ""}`}>{user.premium ? <><Crown size={14} /> Premium</> : "Free plan"}</span>
    </header>

    <div className="dash-grid">
      <section className="glass dash-card dash-membership">
        <h2><Crown size={18} /> Membership</h2>
        {user.premium ? <>
          <div className="dash-plan">
            <div><span className="dash-label">Plan</span><strong>Premium · {planName(user.plan)}</strong></div>
            <div><span className="dash-label">Price</span><strong>{user.plan === "annual" ? `R${prices.annual} / year` : `R${prices.monthly} / month`}</strong></div>
            <div><span className="dash-label">{user.renews ? "Renews on" : "Ends on"}</span><strong>{user.premiumUntil ? date(user.premiumUntil) : "–"}</strong></div>
          </div>
          <p className="dash-note"><CalendarCheck size={15} /> {user.renews ? "Renews automatically. Cancel any time and keep Premium until this date." : "Your subscription won't renew. Premium stays on until this date."}</p>
          <div className="dash-actions">
            {user.billing && <button className="btn btn-light" disabled={!!busy} onClick={manageBilling}><CreditCard size={16} /> {busy === "portal" ? "Opening…" : "Manage billing"}</button>}
            {user.renews && <button className="btn btn-ghost" disabled={!!busy} onClick={cancel}>{busy === "cancel" ? "Cancelling…" : "Cancel subscription"}</button>}
            {!user.renews && <Link href="/premium" className="btn btn-ghost">Renew Premium</Link>}
          </div>
        </> : <div className="dash-upsell">
          <p>You're on the free plan, with ads. Premium removes every ad and supports YokoTV.</p>
          <div className="dash-upsell-row">
            <div><strong>R{prices.monthly}</strong><span>/ month</span><small>or R{prices.annual} a year</small></div>
            <Link href="/premium" className="btn btn-premium"><Crown size={16} /> Go Premium</Link>
          </div>
        </div>}
      </section>

      <section className="glass dash-card">
        <h2><Settings2 size={18} /> Preferences</h2>
        <div className="dash-row"><div><strong>Data saver</strong><span>Lower quality on slow or costly connections.{isSlowNetwork() && " On automatically right now."}</span></div>
          <Switch on={prefs.dataSaver} onChange={(v) => set({ dataSaver: v })} label="Data saver" /></div>
        <div className="dash-row"><div><strong>Home screen previews</strong><span>Play the featured channel silently on the home screen.</span></div>
          <Switch on={prefs.previews} onChange={(v) => set({ previews: v })} label="Home screen previews" /></div>
        <div className="dash-row"><div><strong>My country</strong><span>Your local channels come first.</span></div>
          <select className="dash-select" value={prefs.country || guessCountry()} onChange={(e) => set({ country: e.target.value })} aria-label="My country">
            {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select></div>
      </section>

      <section className="glass dash-card dash-wide">
        <h2><Receipt size={18} /> Payment history</h2>
        {!payments ? <div className="loader" /> : !payments.length ? <p className="dash-muted">No payments yet. Receipts for Premium and support payments will appear here.</p>
          : <table className="dash-table"><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>{payments.map((p) => <tr key={p.id}>
              <td>{date(p.created_at)}</td>
              <td>{p.kind === "tip" ? "Support YokoTV" : `YokoTV Premium · ${planName(p.plan)}`}</td>
              <td>{rand(p.amount)}{p.currency && p.currency !== "zar" ? ` ${p.currency.toUpperCase()}` : ""}</td>
              <td><span className="dash-paid">Paid</span></td>
            </tr>)}</tbody></table>}
        {user.billing && <p className="dash-muted">Invoices and card details are in <button className="dash-link" onClick={manageBilling}>Manage billing</button>.</p>}
      </section>

      <section className="glass dash-card">
        <h2><ShieldCheck size={18} /> Sign-in & security</h2>
        <div className="dash-row"><div><strong>Signed in with</strong><span>{user.signIn === "google" ? "Google" : user.signIn === "google+email" ? "Google, or email and password" : "Email and password"}</span></div></div>
        <div className="dash-actions">
          <button className="btn btn-ghost" onClick={() => signOut().then(() => { toast("Signed out"); navigate("/"); })}><LogOut size={16} /> Sign out</button>
        </div>
        <div className="dash-danger">
          <div><strong>Delete account</strong><span>Erases your account, list and settings{user.renews ? ", and stops your subscription" : ""}.</span></div>
          <button className="btn btn-danger" disabled={!!busy} onClick={remove}><Trash2 size={16} /> {busy === "delete" ? "Deleting…" : "Delete"}</button>
        </div>
      </section>
    </div>
  </div></Shell>;
}

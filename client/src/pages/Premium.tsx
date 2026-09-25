import { Check, Crown, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useSearch } from "wouter";
import { AccountSheet } from "@/components/Account";
import { account, refreshAccount } from "@/lib/account";
import { useStore } from "@/lib/catalog";

type PayConfig = { open: boolean; testMode: boolean; prices: { monthly: number; annual: number }; tips: number[] };
const rand = (n: number) => `R${n.toLocaleString("en-ZA")}`;
const date = (t: number) => new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

async function startCheckout(body: object) {
  const res = await fetch("/api/pay/checkout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.url) throw new Error(j.error || "Couldn't start the payment.");
  window.location.href = j.url; // Stripe's secure checkout page
}

// YokoTV Premium (no ads) and once-off support payments, both through Stripe.
export default function PremiumScreen() {
  const { user } = useStore(account);
  const params = new URLSearchParams(useSearch());
  const [cfg, setCfg] = useState<PayConfig | null>(null);
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [tip, setTip] = useState(50);
  const [busy, setBusy] = useState(false);
  const [signin, setSignin] = useState(false);
  const [waiting, setWaiting] = useState(params.get("paid") === "premium");

  useEffect(() => { fetch("/api/pay/config", { credentials: "same-origin" }).then((r) => r.json()).then(setCfg).catch(() => undefined); }, [user?.id]);
  useEffect(() => {
    if (params.get("paid") === "tip") toast("Thank you for supporting YokoTV!");
    if (params.get("cancelled")) toast("Payment cancelled. You haven't been charged.");
  }, []);
  // Back from checkout: Premium switches on when Stripe confirms, usually within seconds.
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const t = window.setInterval(async () => {
      const u = await refreshAccount().catch(() => null);
      if (u?.premium || ++tries > 30) { window.clearInterval(t); setWaiting(false); if (u?.premium) toast("Welcome to YokoTV Premium!"); }
    }, 3000);
    return () => window.clearInterval(t);
  }, [waiting]);

  const go = async (body: object) => {
    setBusy(true);
    try { await startCheckout(body); } catch (e) { toast((e as Error).message); setBusy(false); }
  };
  const buyPremium = () => (user ? go({ kind: "premium", plan }) : setSignin(true));
  const prices = cfg?.prices || { monthly: 29, annual: 249 };
  const saving = Math.round(100 - (prices.annual / (prices.monthly * 12)) * 100);

  return <div className="app"><article className="legal premium">
    <Link href="/" className="legal-back">← Back to YokoTV</Link>
    <p className="premium-kicker"><Crown size={18} /> YokoTV Premium</p>
    <h1>Watch without ads</h1>
    <p className="premium-lead">Everything on YokoTV stays free. Premium removes every ad and supports the service, for less than a coffee a month.</p>

    {user?.premium ? <div className="premium-card on">
      <h2><Crown size={20} /> You're a Premium member</h2>
      <p>{user.renews ? `Your ${user.plan === "annual" ? "yearly" : "monthly"} plan renews automatically. ` : `Premium runs until ${date(user.premiumUntil!)} and won't renew. `}
        Manage it from your account (the person icon at the top).</p>
    </div> : waiting ? <div className="premium-card"><div className="loader" /><p>Confirming your payment with Stripe…</p></div>
    : <>
      <div className="premium-plans" role="radiogroup" aria-label="Choose a plan">
        {(["annual", "monthly"] as const).map((p) => <button key={p} role="radio" aria-checked={plan === p} className={`premium-plan ${plan === p ? "on" : ""}`} onClick={() => setPlan(p)}>
          <span className="premium-plan-name">{p === "annual" ? "Yearly" : "Monthly"}{p === "annual" && saving > 0 && <em>Save {saving}%</em>}</span>
          <strong>{rand(prices[p])}</strong><span>{p === "annual" ? `per year, about ${rand(Math.round(prices.annual / 12))} a month` : "per month"}</span>
        </button>)}
      </div>
      <ul className="premium-perks">
        <li><Check size={18} /> No ads anywhere on YokoTV, on every device you sign in on</li>
        <li><Check size={18} /> A Premium badge on your account</li>
        <li><Check size={18} /> Cancel any time; Premium keeps running to the end of what you've paid</li>
        <li><Check size={18} /> You keep YokoTV free for everyone else</li>
      </ul>
      {cfg?.open ? <button className="btn btn-light btn-lg btn-block" disabled={busy} onClick={buyPremium}>{busy ? "Opening secure checkout…" : user ? `Get Premium for ${rand(prices[plan])}` : "Sign in to get Premium"}</button>
        : <p className="premium-soon">Premium opens soon. Keep an eye on this page.</p>}
      {cfg?.open && cfg.testMode && <p className="acct-error">Test mode: only admins see this, and no real money is charged.</p>}
    </>}

    <h2><Heart size={20} className="inline-icon" /> Support YokoTV</h2>
    <p>Not after a subscription? Say thanks with a once-off amount. It helps keep YokoTV free.</p>
    <div className="premium-tips" role="radiogroup" aria-label="Amount">
      {(cfg?.tips || [20, 50, 100]).map((n) => <button key={n} role="radio" aria-checked={tip === n} className={`chip ${tip === n ? "on" : ""}`} onClick={() => setTip(n)}>{rand(n)}</button>)}
    </div>
    {cfg?.open ? <button className="btn btn-ghost" disabled={busy} onClick={() => go({ kind: "tip", amount: tip })}><Heart size={16} /> Give {rand(tip)}</button>
      : <p className="premium-soon">Support payments open soon.</p>}

    <h2>Questions</h2>
    <p><b>How do I pay?</b> By card on Stripe's secure checkout, in rand. YokoTV never sees or stores your card details.</p>
    <p><b>Can I cancel?</b> Any time, from your account. You won't be charged again, and Premium lasts until the end of the period you've paid for.</p>
    <p><b>Changed your mind?</b> Cancel within 7 days of your first payment for a full refund: email <a href="mailto:support@yokotv.online">support@yokotv.online</a>.</p>
    <p><b>Does Premium add channels?</b> No. Every channel is free for everyone; channels belong to their broadcasters and can change. Premium is about YokoTV itself: no ads, and supporting the service.</p>
    <p className="legal-date">See the <Link href="/terms">Terms of Service</Link> (section 7, Paid services) and the <Link href="/privacy">privacy policy</Link>.</p>
    {signin && <AccountSheet initial="signup" onClose={() => setSignin(false)} />}
  </article></div>;
}

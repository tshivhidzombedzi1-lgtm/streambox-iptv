import { Check, Crown, ExternalLink, Heart, Lock, Minus, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useSearch } from "wouter";
import { AccountSheet } from "@/components/Account";
import { Shell } from "@/pages/Screens";
import { account, refreshAccount } from "@/lib/account";
import { isApp, isTV, useCatalog, useStore } from "@/lib/catalog";

type PayConfig = { open: boolean; testMode: boolean; prices: { monthly: number; annual: number }; tips: number[] };
const rand = (n: number) => `R${n.toLocaleString("en-ZA")}`;
const date = (t: number) => new Date(t).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

async function startCheckout(body: object) {
  const res = await fetch("/api/pay/checkout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.url) throw new Error(j.error || "Couldn't start the payment.");
  window.location.href = j.url; // Stripe's secure checkout page
}

// In the Android app, payments are made on the website (app store rules), with the
// same account. Phones open the browser through the app's bridge; TVs, and builds
// that don't allow it, show the address and a QR code instead.
const WEB_PREMIUM = "https://yokotv.online/premium";
function openWebsite() {
  const bridge = (window as unknown as { YokoTVApp?: { openInBrowser?: (url: string) => boolean } }).YokoTVApp;
  try { return !isTV && !!bridge?.openInBrowser?.(`${WEB_PREMIUM}?source=android`); } catch { return false; }
}

function WebHandoff({ onClose }: { onClose: () => void }) {
  return <section className="glass pricing-member pricing-web" role="dialog" aria-label="Continue on the YokoTV website">
    <img src="/brand/qr-premium.svg" alt="QR code for yokotv.online/premium" width={132} height={132} />
    <div><h2>Continue at yokotv.online/premium</h2>
      <p>Payments are made on the YokoTV website. {isTV ? "Scan the code with your phone, or open the address in any browser." : "Open the address in your browser."} Sign in there with the same account, and Premium switches on in the app too.</p></div>
    <button className="btn btn-light" onClick={onClose} autoFocus>Done</button>
  </section>;
}

// Free vs Premium, in both columns: [feature, free, premium].
const COMPARE: [string, boolean, boolean][] = [
  ["Every live channel, free", true, true],
  ["TV guide and My List", true, true],
  ["Sync across your devices", true, true],
  ["No ads anywhere on YokoTV", false, true],
  ["Premium badge on your account", false, true],
  ["Keeps YokoTV free for everyone", false, true],
];

const FAQ: [string, React.ReactNode][] = [
  ["How do I pay?", "By card on Stripe's secure checkout, in rand. YokoTV never sees or stores your card details."],
  ["Can I cancel any time?", <>Yes, from <Link href="/account">your account</Link>. You won't be charged again, and Premium lasts until the end of the period you've paid for.</>],
  ["What if I change my mind?", <>Cancel within 7 days of your first payment for a full refund: email <a href="mailto:support@yokotv.online">support@yokotv.online</a>.</>],
  ["Does Premium add channels?", "No. Every channel is free for everyone; channels belong to their broadcasters and can change. Premium is about YokoTV itself: no ads, and supporting the service."],
  ["Does it work on my TV?", "Yes. Sign in with the same account on your phone, computer and smart TV, and ads are gone on all of them."],
];

// YokoTV Premium (no ads) and once-off support payments, both through Stripe.
export default function PremiumScreen() {
  const { user } = useStore(account);
  const { catalog } = useCatalog();
  const params = new URLSearchParams(useSearch());
  const [cfg, setCfg] = useState<PayConfig | null>(null);
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [tip, setTip] = useState(50);
  const [busy, setBusy] = useState("");
  const [signin, setSignin] = useState(false);
  const [waiting, setWaiting] = useState(params.get("paid") === "premium");
  const [handoff, setHandoff] = useState(false);

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
  // App: coming back from paying in the browser picks up Premium straight away.
  useEffect(() => {
    if (!isApp) return;
    const check = () => { if (document.visibilityState === "visible") refreshAccount().catch(() => undefined); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("yokotvapp:resume", check);
    return () => { document.removeEventListener("visibilitychange", check); window.removeEventListener("yokotvapp:resume", check); };
  }, []);

  const go = async (key: string, body: object) => {
    if (isApp) { if (!openWebsite()) setHandoff(true); return; }
    setBusy(key);
    try { await startCheckout(body); } catch (e) { toast((e as Error).message); setBusy(""); }
  };
  const buyPremium = () => (user || isApp ? go("premium", { kind: "premium", plan }) : setSignin(true));
  const prices = cfg?.prices || { monthly: 29, annual: 249 };
  const saving = Math.round(100 - (prices.annual / (prices.monthly * 12)) * 100);
  const open = !!cfg?.open;

  return <Shell catalog={catalog}><div className="pricing">
    <header className="pricing-hero">
      <p className="pricing-kicker"><Crown size={16} /> YokoTV Premium</p>
      <h1>Live TV, without the ads</h1>
      <p>Everything on YokoTV stays free. Premium removes every ad and keeps the service running, for less than a coffee a month.</p>
    </header>

    {user?.premium ? <section className="glass pricing-member">
      <Crown size={28} />
      <div><h2>You're a Premium member</h2>
        <p>{user.renews ? `Your ${user.plan === "annual" ? "yearly" : "monthly"} plan renews on ${user.premiumUntil ? date(user.premiumUntil) : "schedule"}.` : `Premium runs until ${user.premiumUntil ? date(user.premiumUntil) : "the end of your period"} and won't renew.`}</p></div>
      <Link href="/account" className="btn btn-light">Manage membership</Link>
    </section> : waiting ? <section className="glass pricing-member"><div className="loader" /><div><h2>Confirming your payment</h2><p>Stripe usually confirms within a few seconds. You can stay on this page.</p></div></section>
    : <>
      <div className="segmented" role="radiogroup" aria-label="Billing period">
        {(["monthly", "annual"] as const).map((p) => <button key={p} role="radio" aria-checked={plan === p} className={plan === p ? "on" : ""} onClick={() => setPlan(p)}>
          {p === "annual" ? "Yearly" : "Monthly"}{p === "annual" && saving > 0 && <em>−{saving}%</em>}
        </button>)}
      </div>

      <div className="pricing-cards">
        <section className="glass price-card">
          <h2>Free</h2>
          <p className="price"><strong>R0</strong><span>forever</span></p>
          <p className="price-sub">Every channel, supported by ads.</p>
          <ul>{COMPARE.map(([f, free]) => <li key={f} className={free ? "" : "off"}>{free ? <Check size={17} /> : <Minus size={17} />}{f}</li>)}</ul>
          <Link href="/" className="btn btn-ghost btn-block">Keep watching free</Link>
        </section>

        <section className="glass price-card featured">
          <span className="price-flag">{plan === "annual" ? "Best value" : "Most flexible"}</span>
          <h2><Crown size={18} /> Premium</h2>
          <p className="price"><strong>{rand(plan === "annual" ? prices.annual : prices.monthly)}</strong><span>/ {plan === "annual" ? "year" : "month"}</span></p>
          <p className="price-sub">{plan === "annual" ? `About ${rand(Math.round(prices.annual / 12))} a month, billed yearly.` : "Billed monthly. Cancel any time."}</p>
          <ul>{COMPARE.map(([f, , prem]) => <li key={f}>{prem ? <Check size={17} /> : <Minus size={17} />}{f}</li>)}</ul>
          {open ? <button className="btn btn-premium btn-block" disabled={!!busy} onClick={buyPremium}>{isApp ? <>Get Premium on yokotv.online <ExternalLink size={16} /></> : busy === "premium" ? "Opening secure checkout…" : user ? "Get Premium" : "Sign in to get Premium"}</button>
            : <p className="price-soon">Premium opens soon.</p>}
          {open && cfg?.testMode && <p className="price-test">Test mode: only admins see this, and no real money is charged.</p>}
        </section>
      </div>
    </>}

    {handoff && <WebHandoff onClose={() => setHandoff(false)} />}

    <ul className="trust">
      <li><Lock size={16} /> Secure checkout by Stripe</li>
      <li><RotateCcw size={16} /> Cancel any time</li>
      <li><ShieldCheck size={16} /> 7-day refund on your first payment</li>
    </ul>

    <section className="glass pricing-support">
      <div><h2><Heart size={18} /> Support YokoTV</h2><p>Not after a subscription? Say thanks with a once-off amount. It helps keep YokoTV free.</p></div>
      <div className="pricing-support-pay">
        <div className="segmented small" role="radiogroup" aria-label="Amount">
          {(cfg?.tips || [20, 50, 100]).map((n) => <button key={n} role="radio" aria-checked={tip === n} className={tip === n ? "on" : ""} onClick={() => setTip(n)}>{rand(n)}</button>)}
        </div>
        {open ? <button className="btn btn-light" disabled={!!busy} onClick={() => go("tip", { kind: "tip", amount: tip })}>{busy === "tip" ? "Opening…" : `Give ${rand(tip)}`}{isApp && <ExternalLink size={15} />}</button>
          : <span className="price-soon">Opens soon</span>}
      </div>
    </section>

    <section className="pricing-faq">
      <h2>Questions</h2>
      {FAQ.map(([q, a]) => <details key={q} className="glass faq"><summary>{q}</summary><p>{a}</p></details>)}
      <p className="pricing-legal">Payments are covered by the <Link href="/terms">Terms of Service</Link> (section 7, Paid services) and the <Link href="/privacy">privacy policy</Link>. Questions: <a href="mailto:support@yokotv.online">support@yokotv.online</a>.</p>
    </section>
    {signin && <AccountSheet initial="signup" onClose={() => setSignin(false)} />}
  </div></Shell>;
}

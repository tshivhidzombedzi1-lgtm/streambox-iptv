import { BarChart3, CreditCard, LayoutDashboard, Megaphone, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountSheet } from "@/components/Account";
import AdminSponsors from "@/pages/AdminSponsors";
import AdminPayments from "@/pages/AdminPayments";
import { Shell } from "@/pages/Screens";
import { account } from "@/lib/account";
import { countryName, getChannel, useCatalog, useStore } from "@/lib/catalog";

type Row = { key: string; n: number };
type Day = { day: string; visitors: number; views: number; plays: number };
type Summary = { days: number; from: string; totals: Record<string, number>; daily: Day[]; channels: Row[]; sources: Row[]; devices: Row[]; countries: Row[]; pages: Row[] };
type Money = { status: string; subscribers: number; month: { gross: number | null; n: number } };

const fmt = (n: number) => (n || 0).toLocaleString("en-ZA");
const rand = (n: number | null) => `R${(n || 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
const SOURCE_LABELS: Record<string, string> = { direct: "Direct / typed in", whatsapp: "WhatsApp", google: "Google search", facebook: "Facebook", x: "X (Twitter)", app: "Installed app", share: "Shared link", link: "Copied link", bing: "Bing", tiktok: "TikTok", instagram: "Instagram" };
const DEVICE_LABELS: Record<string, string> = { mobile: "Phone / tablet", desktop: "Computer", tv: "Smart TV" };
const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "audience", label: "Audience", icon: Users },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "sponsors", label: "Sponsors", icon: Megaphone },
] as const;
type Tab = (typeof TABS)[number]["id"];
const tabFromHash = (): Tab => (TABS.find((t) => `#${t.id}` === window.location.hash)?.id || "overview");

export default function AdminScreen() {
  const { user, ready } = useStore(account);
  const { catalog } = useCatalog(); // channel names for the top-channels list
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [money, setMoney] = useState<Money | null>(null);
  const [error, setError] = useState("");
  const [signin, setSignin] = useState(false);
  const [tick, setTick] = useState(0);
  const setTab = (t: Tab) => { setTabState(t); window.history.replaceState(null, "", `#${t}`); };

  useEffect(() => {
    if (!user) return;
    setError("");
    fetch(`/api/stats/summary?days=${days}`, { credentials: "same-origin" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); })
      .catch((e) => setError(e.message || "Couldn't load stats."));
    fetch("/api/admin/payments", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then(setMoney).catch(() => undefined);
  }, [user, days, tick]);

  if (!ready) return <Shell catalog={catalog}><div className="console"><div className="state small"><div className="loader" /></div></div></Shell>;
  if (!user) return <Shell catalog={catalog}><div className="console">
    <section className="glass dash-empty"><BarChart3 size={34} /><h1>YokoTV admin</h1><p>Sign in with the admin account to see your audience, payments and sponsors.</p>
      <button className="btn btn-light" onClick={() => setSignin(true)}>Sign in</button></section>
    {signin && <AccountSheet onClose={() => setSignin(false)} />}
  </div></Shell>;

  const t = data?.totals || {};
  const ranged = tab === "overview" || tab === "audience";
  return <Shell catalog={catalog}><div className="console">
    <header className="console-head">
      <div><p className="console-kicker">YokoTV admin</p><h1>{TABS.find((x) => x.id === tab)!.label}</h1></div>
      {ranged && <div className="console-tools">
        <div className="segmented small" role="radiogroup" aria-label="Date range">
          {[7, 30, 90].map((d) => <button key={d} role="radio" aria-checked={days === d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{d} days</button>)}
        </div>
        <button className="icon-btn" onClick={() => setTick((x) => x + 1)} aria-label="Refresh" title="Refresh"><RefreshCw size={16} /></button>
      </div>}
    </header>

    <nav className="glass console-tabs" role="tablist" aria-label="Admin sections">
      {TABS.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><Icon size={16} /><span>{label}</span></button>)}
    </nav>

    {tab === "payments" ? <AdminPayments /> : tab === "sponsors" ? <AdminSponsors />
    : error ? <p className="console-error">{error}</p> : !data ? <div className="state small"><div className="loader" /></div>
    : tab === "overview" ? <>
      <div className="kpis">
        <Kpi label="Visitors" value={fmt(t.visitors)} hint={`unique browsers, last ${days} days`} />
        <Kpi label="Channel plays" value={fmt(t.play)} hint={t.visitors ? `${(t.play / t.visitors).toFixed(1)} per visitor` : ""} />
        <Kpi label="Sign-ups" value={fmt(t.signup)} hint={`${fmt(t.install)} app installs`} />
        <Kpi label="Premium members" value={money ? fmt(money.subscribers) : "–"} hint={money?.status === "live" ? "payments live" : money ? `payments: ${money.status}` : ""} gold />
        <Kpi label="Revenue this month" value={money ? rand(money.month.gross) : "–"} hint={money ? `${money.month.n} payments, before fees` : ""} gold />
      </div>
      <section className="glass panel"><div className="panel-head"><h2>Visitors per day</h2><span>last {days} days</span></div><DailyBars daily={data.daily} /></section>
      <div className="panel-grid">
        <Ranked title="Top channels" note="plays" rows={data.channels.slice(0, 8)} label={(k) => getChannel(k)?.n || k} />
        <Ranked title="Where visitors come from" rows={data.sources.slice(0, 8)} label={(k) => SOURCE_LABELS[k] || k} />
      </div>
    </> : <>
      <div className="kpis">
        <Kpi label="Visitors" value={fmt(t.visitors)} />
        <Kpi label="Page views" value={fmt(t.view)} />
        <Kpi label="Shares" value={fmt(t.share)} />
        <Kpi label="App installs" value={fmt(t.install)} />
      </div>
      <div className="panel-grid">
        <Ranked title="Top channels" note="plays" rows={data.channels} label={(k) => getChannel(k)?.n || k} />
        <Ranked title="Where visitors come from" rows={data.sources} label={(k) => SOURCE_LABELS[k] || k} />
        <Ranked title="Devices" rows={data.devices} label={(k) => DEVICE_LABELS[k] || k} />
        <Ranked title="Countries" rows={data.countries} label={(k) => countryName(k)} />
        <Ranked title="Pages" rows={data.pages} label={(k) => k} />
      </div>
    </>}
    {ranged && data && <p className="console-note">Counts are anonymous: no IP addresses or account details are stored. Days run midnight to midnight, South African time. New activity shows up within 15 seconds.</p>}
  </div></Shell>;
}

function Kpi({ label, value, hint, gold }: { label: string; value: string; hint?: string; gold?: boolean }) {
  return <div className={`glass kpi ${gold ? "gold" : ""}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

// One series, so one hue and no legend; the title names it. Hover (or focus) a bar for the day's numbers.
function DailyBars({ daily }: { daily: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!daily.length) return <p className="admin-empty">No visits recorded yet. Numbers appear here as people use the site.</p>;
  const max = Math.max(1, ...daily.map((d) => d.visitors));
  const W = 720, H = 180, gap = 2, bw = Math.max(2, (W - gap * (daily.length - 1)) / daily.length);
  const ticks = [0, Math.round(max / 2), max];
  const h = hover !== null ? daily[hover] : null;
  return <div className="daily">
    <div className="daily-plot">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Visitors per day">
        {ticks.map((v) => <g key={v}><line x1={0} x2={W} y1={H - (v / max) * H} y2={H - (v / max) * H} className="daily-grid" /><text x={0} y={H - (v / max) * H - 4} className="daily-axis">{fmt(v)}</text></g>)}
        {daily.map((d, i) => {
          const bh = Math.max(d.visitors ? 2 : 0, (d.visitors / max) * H);
          const x = i * (bw + gap);
          return <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
            <rect x={x - gap / 2} y={0} width={bw + gap} height={H} fill="transparent" />
            <path className={`daily-bar ${hover === i ? "on" : ""}`} d={`M${x},${H} V${H - bh + Math.min(4, bh)} q0,-${Math.min(4, bh)} ${Math.min(4, bw / 2)},-${Math.min(4, bh)} H${x + bw - Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, bh)} V${H} Z`} />
          </g>;
        })}
        <text x={0} y={H + 18} className="daily-axis">{daily[0].day.slice(5)}</text>
        <text x={W} y={H + 18} className="daily-axis" textAnchor="end">{daily[daily.length - 1].day.slice(5)}</text>
      </svg>
      {h && <div className="daily-tip" style={{ left: `${((hover! + 0.5) / daily.length) * 100}%` }}>
        <b>{new Date(h.day + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}</b>
        <span>{fmt(h.visitors)} visitors</span><span>{fmt(h.views)} page views</span><span>{fmt(h.plays)} plays</span>
      </div>}
    </div>
    <details className="daily-table"><summary>Show as table</summary>
      <table><thead><tr><th>Day</th><th>Visitors</th><th>Page views</th><th>Plays</th></tr></thead>
        <tbody>{[...daily].reverse().map((d) => <tr key={d.day}><td>{d.day}</td><td>{fmt(d.visitors)}</td><td>{fmt(d.views)}</td><td>{fmt(d.plays)}</td></tr>)}</tbody></table>
    </details>
  </div>;
}

function Ranked({ title, note, rows, label }: { title: string; note?: string; rows: Row[]; label: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return <section className="glass panel"><div className="panel-head"><h2>{title}</h2>{note && <span>{note}</span>}</div>
    {rows.length ? <ol className="ranked">{rows.map((r) => <li key={r.key} title={`${label(r.key)}: ${fmt(r.n)}`}>
      <span className="ranked-label">{label(r.key)}</span><span className="ranked-n">{fmt(r.n)}</span>
      <i className="ranked-bar" style={{ width: `${(r.n / max) * 100}%` }} />
    </li>)}</ol> : <p className="admin-empty">Nothing yet.</p>}
  </section>;
}

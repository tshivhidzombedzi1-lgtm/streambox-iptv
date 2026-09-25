import { BarChart3, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AccountSheet } from "@/components/Account";
import AdminSponsors from "@/pages/AdminSponsors";
import { account } from "@/lib/account";
import { countryName, getChannel, useCatalog, useStore } from "@/lib/catalog";

type Row = { key: string; n: number };
type Day = { day: string; visitors: number; views: number; plays: number };
type Summary = { days: number; from: string; totals: Record<string, number>; daily: Day[]; channels: Row[]; sources: Row[]; devices: Row[]; countries: Row[]; pages: Row[] };

const fmt = (n: number) => (n || 0).toLocaleString("en-ZA");
const SOURCE_LABELS: Record<string, string> = { direct: "Direct / typed in", whatsapp: "WhatsApp", google: "Google search", facebook: "Facebook", x: "X (Twitter)", app: "Installed app", share: "Shared link", link: "Copied link", bing: "Bing", tiktok: "TikTok", instagram: "Instagram" };
const DEVICE_LABELS: Record<string, string> = { mobile: "Phone / tablet", desktop: "Computer", tv: "Smart TV" };

export default function AdminScreen() {
  const { user, ready } = useStore(account);
  useCatalog(); // channel names for the top-channels list
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [signin, setSignin] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    setError("");
    fetch(`/api/stats/summary?days=${days}`, { credentials: "same-origin" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); })
      .catch((e) => setError(e.message || "Couldn't load stats."));
  }, [user, days, tick]);

  if (!ready) return <div className="app"><div className="state"><div className="loader" /></div></div>;
  if (!user) return <div className="app"><div className="state">
    <BarChart3 size={36} /><h2>YokoTV stats</h2><p>Sign in with the admin account to see your audience.</p>
    <button className="btn btn-light" onClick={() => setSignin(true)}>Sign in</button>
    {signin && <AccountSheet onClose={() => setSignin(false)} />}
  </div></div>;

  const t = data?.totals || {};
  const tiles: [string, number, string][] = [
    ["Visitors", t.visitors, "unique browsers"], ["Page views", t.view, ""], ["Channel plays", t.play, ""],
    ["Shares", t.share, ""], ["App installs", t.install, ""], ["Sign-ups", t.signup, ""],
  ];
  return <div className="app"><div className="admin">
    <header className="admin-head">
      <div><Link href="/" className="legal-back">← YokoTV</Link><h1>Audience</h1></div>
      <div className="admin-range" role="group" aria-label="Date range">
        {[7, 30, 90].map((d) => <button key={d} className={`chip ${days === d ? "on" : ""}`} onClick={() => setDays(d)}>{d} days</button>)}
        <button className="chip" onClick={() => setTick((x) => x + 1)} aria-label="Refresh"><RefreshCw size={14} /></button>
      </div>
    </header>
    {error ? <p className="acct-error">{error}</p> : !data ? <div className="state small"><div className="loader" /></div> : <>
      <div className="admin-tiles">{tiles.map(([label, n, hint]) => <div key={label} className="admin-tile"><span>{label}</span><strong>{fmt(n)}</strong>{hint && <small>{hint}</small>}</div>)}</div>
      <AdminSponsors />
      <section className="admin-card"><h2>Visitors per day</h2><DailyBars daily={data.daily} /></section>
      <div className="admin-grid">
        <Ranked title="Top channels (plays)" rows={data.channels} label={(k) => getChannel(k)?.n || k} />
        <Ranked title="Where visitors come from" rows={data.sources} label={(k) => SOURCE_LABELS[k] || k} />
        <Ranked title="Devices" rows={data.devices} label={(k) => DEVICE_LABELS[k] || k} />
        <Ranked title="Countries" rows={data.countries} label={(k) => countryName(k)} />
        <Ranked title="Pages" rows={data.pages} label={(k) => k} />
      </div>
      <p className="sheet-note">Counts are anonymous: no IP addresses or account details are stored. Days run midnight to midnight, South African time. New activity shows up within 15 seconds.</p>
    </>}
  </div></div>;
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

function Ranked({ title, rows, label }: { title: string; rows: Row[]; label: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return <section className="admin-card"><h2>{title}</h2>
    {rows.length ? <ol className="ranked">{rows.map((r) => <li key={r.key} title={`${label(r.key)}: ${fmt(r.n)}`}>
      <span className="ranked-label">{label(r.key)}</span><span className="ranked-n">{fmt(r.n)}</span>
      <i className="ranked-bar" style={{ width: `${(r.n / max) * 100}%` }} />
    </li>)}</ol> : <p className="admin-empty">Nothing yet.</p>}
  </section>;
}

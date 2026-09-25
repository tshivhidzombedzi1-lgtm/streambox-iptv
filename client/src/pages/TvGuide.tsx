import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import AdSlot from "@/components/AdSlot";
import { ChannelArt } from "@/components/TV";
import { Shell } from "@/pages/Screens";
import { getChannel, useCatalog } from "@/lib/catalog";
import { hhmm } from "@/lib/epg";

type TodayChannel = { id: string; n: string; programmes: { s: number; e: number; t: string }[] };

// Today's TV guide: every guided channel the viewer can watch, from what's on
// now until midnight. South African channels come first (server/epg.ts).
export default function TvGuideScreen() {
  const { catalog } = useCatalog();
  const [data, setData] = useState<{ date: string; channels: TodayChannel[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { fetch("/api/epg/today").then((r) => r.json()).then(setData).catch(() => setFailed(true)); }, []);
  // Only channels that play here (geo-locked ones are already left out of the catalog).
  const channels = catalog && data ? data.channels.filter((c) => getChannel(c.id)) : [];
  const now = Date.now();

  return <Shell catalog={catalog}>
    <div className="guide-page">
      <header className="page-head">
        <h1>TV guide</h1>
        <p>{data ? `What's on today, ${data.date}. Times are shown in your time zone.` : "What's on today."}</p>
      </header>
      <AdSlot name="guide" />
      {failed ? <div className="state small"><p>The TV guide couldn't load. Refresh to try again.</p></div>
        : !data || !catalog ? <div className="state small"><div className="loader" /></div>
        : !channels.length ? <div className="state small"><p>No schedules are available right now. Try again later.</p></div>
        : <div className="guide-list">{channels.map((c) => {
          const ch = getChannel(c.id)!;
          return <section key={c.id} className="guide-channel">
            <header>
              <Link href={`/watch/${encodeURIComponent(c.id)}`} className="guide-logo" aria-label={`Watch ${c.n}`}><ChannelArt channel={ch} /></Link>
              <h2>{c.n}</h2>
              <Link href={`/watch/${encodeURIComponent(c.id)}`} className="btn btn-light guide-watch"><Play size={16} fill="currentColor" /> Watch</Link>
            </header>
            <ol>{c.programmes.map((p) => {
              const live = p.s <= now && p.e > now;
              return <li key={p.s} className={live ? "on" : ""}>
                <time>{hhmm(p.s)}</time><span>{p.t}</span>{live && <em>On now</em>}
              </li>;
            })}</ol>
          </section>;
        })}</div>}
    </div>
  </Shell>;
}

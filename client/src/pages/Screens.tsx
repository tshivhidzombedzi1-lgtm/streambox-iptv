import type Hls from "hls.js";
import { Check, Info, Play, Plus, RadioTower, Search, Volume2, VolumeX, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useParams, useSearch } from "wouter";
import TVPlayer from "@/components/TVPlayer";
import { ChannelArt, Grid, hue, Rail, TopNav } from "@/components/TV";
import AdSlot, { useAds } from "@/components/AdSlot";
import { ShareButton } from "@/components/Share";
import { hhmm, onNow, useGuide } from "@/lib/epg";
import {
  type Catalog, type Channel, CATEGORIES, categoryLabel, countryName, getChannel, guessCountry, isSlowNetwork, isTV,
  myList, qualityTag, recents, settings, streamSrc, toggleMyList, useCatalog, useStore,
} from "@/lib/catalog";

const inCat = (ch: Channel, cat: string) => ch.k.includes(cat);

// Browsing pages only: the watch page has no Shell, so ads never load over the player.
function Shell({ catalog, children }: { catalog: Catalog | null; children: React.ReactNode }) {
  useAds();
  return <div className="app"><TopNav catalog={catalog} />{children}<footer className="foot"><span>YokoTV</span><span>Free live TV from public broadcasters worldwide. Channel availability depends on each broadcaster.</span><Link href="/privacy">Privacy policy</Link></footer></div>;
}

function Loading({ error }: { error: boolean }) {
  return <div className="state">{error ? <><RadioTower size={36} /><h2>Can’t reach the channel guide</h2><p>Check your connection and refresh the page.</p></> : <><div className="loader" /><p>Loading channels…</p></>}</div>;
}

// ---------------- Home ----------------

function HeroPreview({ channel }: { channel: Channel }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const video = ref.current;
    const stream = channel.s.find((s) => !s.p) || channel.s[0];
    if (!video || !stream) return;
    setReady(false);
    let hls: Hls | null = null;
    let disposed = false;
    // Small delay so the page paints first; previews always start at the lowest quality.
    const t = window.setTimeout(() => import("hls.js").then(({ default: H }) => {
      if (disposed || !H.isSupported()) return;
      hls = new H({ startLevel: 0, capLevelToPlayerSize: true, maxBufferLength: 10, abrEwmaDefaultEstimate: 400_000 });
      hls.on(H.Events.ERROR, (_, d) => { if (d.fatal) { hls?.destroy(); setReady(false); } });
      hls.loadSource(streamSrc(stream));
      hls.attachMedia(video);
      video.play().catch(() => undefined);
    }), 1200);
    const onPlaying = () => setReady(true);
    video.muted = true;
    video.addEventListener("playing", onPlaying);
    return () => { disposed = true; window.clearTimeout(t); hls?.destroy(); video.removeEventListener("playing", onPlaying); };
  }, [channel]);
  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);
  return <>
    <video ref={ref} playsInline className={`hero-video ${ready ? "on" : ""}`} />
    {ready && <button className="hero-mute" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute preview" : "Mute preview"}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>}
  </>;
}

function Hero({ picks }: { picks: Channel[] }) {
  const [index, setIndex] = useState(0);
  const [, navigate] = useLocation();
  const prefs = useStore(settings);
  const list = useStore(myList);
  const channel = picks[index % picks.length];
  const onAir = onNow(useGuide(), channel?.id || "").now;
  const previews = prefs.previews && !isTV && !prefs.dataSaver && !isSlowNetwork() && window.matchMedia("(min-width: 900px)").matches;
  useEffect(() => {
    if (previews || picks.length < 2) return;
    const t = window.setInterval(() => setIndex((i) => i + 1), 9000);
    return () => window.clearInterval(t);
  }, [previews, picks.length]);
  if (!channel) return null;
  const saved = list.includes(channel.id);
  return <section className="hero" style={{ "--h": hue(channel.n) } as React.CSSProperties}>
    <div className="hero-art">{channel.l && <img src={channel.l} alt="" />}</div>
    {previews && <HeroPreview key={channel.id} channel={channel} />}
    <div className="hero-shade" />
    <div className="hero-copy">
      <p className="hero-kicker"><i className="live-dot" /> Live now</p>
      <h1>{channel.n}</h1>
      <p className="hero-meta"><span className="match">{qualityTag(channel) || "Live"}</span>{channel.k.map(categoryLabel).join(" · ")} · {countryName(channel.c)}</p>
      {onAir && <p className="hero-now"><b>On now</b> {onAir.t} <span>until {hhmm(onAir.e)}</span></p>}
      <div className="hero-actions">
        <button className="btn btn-light btn-lg" onClick={() => navigate(`/watch/${encodeURIComponent(channel.id)}?from=picks`)}><Play size={24} fill="currentColor" /> Play</button>
        <button className="btn btn-grey btn-lg" onClick={() => toast(toggleMyList(channel.id) ? "Added to My List" : "Removed from My List")}>{saved ? <Check size={24} /> : <Plus size={24} />} My List</button>
        <ShareButton channel={channel} className="btn btn-grey btn-lg" size={22} />
      </div>
      <div className="hero-dots">{picks.slice(0, 6).map((p, i) => <button key={p.id} className={i === index % picks.length ? "on" : ""} onClick={() => setIndex(i)} aria-label={p.n} />)}</div>
    </div>
  </section>;
}

export function HomeScreen() {
  const { catalog, error } = useCatalog();
  const mine = useStore(myList);
  const recent = useStore(recents);
  const prefs = useStore(settings);
  const rails = useMemo(() => {
    if (!catalog) return null;
    const all = catalog.channels;
    const country = prefs.country || guessCountry();
    const picks = catalog.picks.map(getChannel).filter(Boolean) as Channel[];
    const local = all.filter((c) => c.c === country).slice(0, 30);
    // Genres picked during onboarding come first.
    const liked = prefs.genres || [];
    const ordered = [...CATEGORIES.filter((c) => liked.includes(c.id)), ...CATEGORIES.slice(0, 16).filter((c) => !liked.includes(c.id))];
    const byCat = ordered.map((cat) => ({ cat, list: all.filter((c) => inCat(c, cat.id)).slice(0, 30) })).filter((r) => r.list.length >= 4);
    const hero = picks.filter((p) => p.l).slice(0, 6);
    return { picks, local, country, byCat, hero: hero.length ? hero : all.slice(0, 6) };
  }, [catalog, prefs.country, prefs.genres]);
  // What everyone's watching right now (from anonymous play counts).
  const [trending, setTrending] = useState<string[]>([]);
  useEffect(() => { fetch("/api/trending").then((r) => r.json()).then((j) => setTrending(j.ids || [])).catch(() => undefined); }, []);
  if (!catalog || !rails) return <Shell catalog={catalog}><Loading error={error} /></Shell>;
  const pick = (ids: string[]) => ids.map(getChannel).filter(Boolean) as Channel[];
  const hot = pick(trending);
  return <Shell catalog={catalog}>
    <Hero picks={rails.hero} />
    <div className="rails">
      <Rail title="Continue watching" channels={pick(recent)} context="recent" />
      <Rail title="My List" channels={pick(mine)} href="/my-list" context="mylist" />
      <Rail title={`Popular in ${countryName(rails.country)}`} channels={rails.local} href={rails.country === "ZA" ? "/south-africa" : `/browse/all?country=${rails.country}`} context={`country:${rails.country}`} />
      {hot.length >= 4 && <Rail title="Trending now" channels={hot} context="trending" />}
      <Rail title="Top 10 on YokoTV" channels={rails.picks.slice(0, 10)} ranked context="picks" />
      {rails.byCat.map(({ cat, list }, i) => <Fragment key={cat.id}>
        {i === 2 && <AdSlot name="home" />}
        <Rail title={cat.label} channels={list} href={`/browse/${cat.id}`} context={cat.id} />
      </Fragment>)}
      <Rail title="More top picks" channels={rails.picks.slice(10)} context="picks" />
    </div>
  </Shell>;
}

// ---------------- Browse / search / list ----------------

export function BrowseScreen({ fixedCountry = "" }: { fixedCountry?: string }) {
  const { cat = "all" } = useParams<{ cat: string }>();
  const search = new URLSearchParams(useSearch());
  const [, navigate] = useLocation();
  const { catalog, error } = useCatalog();
  const country = search.get("country") || fixedCountry;
  const [filter, setFilter] = useState("");
  const channels = useMemo(() => {
    if (!catalog) return [];
    const q = filter.trim().toLowerCase();
    return catalog.channels.filter((c) => (cat === "all" || inCat(c, cat)) && (!country || c.c === country) && (!q || c.n.toLowerCase().includes(q)));
  }, [catalog, cat, country, filter]);
  const countries = useMemo(() => {
    if (!catalog) return [];
    const counts = new Map<string, number>();
    for (const c of catalog.channels) if (cat === "all" || inCat(c, cat)) counts.set(c.c, (counts.get(c.c) || 0) + 1);
    return Array.from(counts).sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])));
  }, [catalog, cat]);
  if (!catalog) return <Shell catalog={catalog}><Loading error={error} /></Shell>;
  const title = cat === "all" ? "Live TV" : categoryLabel(cat);
  const setParam = (next: { cat?: string; country?: string }) => {
    const c = next.cat ?? cat;
    const co = next.country ?? country;
    navigate(`/browse/${c}${co ? `?country=${co}` : ""}`, { replace: true });
  };
  return <Shell catalog={catalog}>
    <div className="page">
      <div className="page-head">
        <h1>{title}{country && <span> · {countryName(country)}</span>}</h1>
        <p>{channels.length.toLocaleString()} channels live right now</p>
      </div>
      <div className="filters">
        <div className="chips">
          {[{ id: "all", label: "All" }, ...CATEGORIES].map((c) => <button key={c.id} className={`chip ${cat === c.id ? "on" : ""}`} onClick={() => setParam({ cat: c.id })}>{c.label}</button>)}
        </div>
        <div className="filter-row">
          <select value={country} onChange={(e) => setParam({ country: e.target.value })} aria-label="Country">
            <option value="">All countries</option>
            {countries.map(([code, n]) => <option key={code} value={code}>{countryName(code)} ({n})</option>)}
          </select>
          <div className="filter-search"><Search size={16} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${title}`} /></div>
        </div>
      </div>
      <AdSlot name="browse" />
      {channels.length ? <Grid channels={channels} context={`${cat}${country ? `|${country}` : ""}`} /> : <div className="state small"><p>No channels match. Try another country or category.</p></div>}
    </div>
  </Shell>;
}

export function SearchScreen() {
  const q = (new URLSearchParams(useSearch()).get("q") || "").trim().toLowerCase();
  const { catalog, error } = useCatalog();
  const results = useMemo(() => {
    if (!catalog || !q) return [];
    // Best match first; within a match level the catalog order (English first) is kept.
    return catalog.channels.map((c) => {
      const name = c.n.toLowerCase();
      const hit = name.startsWith(q) ? 3 : name.includes(q) ? 2 : countryName(c.c).toLowerCase().includes(q) || c.k.some((k) => categoryLabel(k).toLowerCase().includes(q)) ? 1 : 0;
      return { c, hit };
    }).filter((r) => r.hit).sort((a, b) => b.hit - a.hit).map((r) => r.c);
  }, [catalog, q]);
  if (!catalog) return <Shell catalog={catalog}><Loading error={error} /></Shell>;
  return <Shell catalog={catalog}>
    <div className="page">
      {q ? <><div className="page-head"><h1>Results for “{q}”</h1><p>{results.length.toLocaleString()} channels</p></div>
        {results.length ? <Grid channels={results} context={`search:${q}`} /> : <div className="state small"><p>Nothing found. Try a channel name, a country like “South Africa”, or a genre like “news”.</p></div>}</>
        : <><div className="page-head"><h1>Search</h1><p>Type a channel name, a country or a genre.</p></div>
          <MobileSearch />
          <div className="chips wrap">{CATEGORIES.slice(0, 16).map((c) => <Link key={c.id} href={`/browse/${c.id}`} className="chip">{c.label}</Link>)}</div></>}
    </div>
  </Shell>;
}

function MobileSearch() {
  const [, navigate] = useLocation();
  return <div className="filter-search big"><Search size={18} /><input autoFocus placeholder="Search channels" onChange={(e) => navigate(`/search?q=${encodeURIComponent(e.target.value)}`, { replace: true })} /></div>;
}

export function MyListScreen() {
  const { catalog, error } = useCatalog();
  const mine = useStore(myList);
  const recent = useStore(recents);
  if (!catalog) return <Shell catalog={catalog}><Loading error={error} /></Shell>;
  const saved = mine.map(getChannel).filter(Boolean) as Channel[];
  const watched = recent.map(getChannel).filter(Boolean) as Channel[];
  return <Shell catalog={catalog}>
    <div className="page">
      <div className="page-head"><h1>My List</h1><p>Saved on this device. No account needed.</p></div>
      {saved.length ? <Grid channels={saved} context="mylist" /> : <div className="state small"><Plus size={28} /><p>Tap <b>+</b> on any channel to save it here.</p></div>}
      {watched.length > 0 && <><h2 className="sub-h">Recently watched</h2><Grid channels={watched} context="recent" /></>}
    </div>
  </Shell>;
}

// ---------------- Watch ----------------

function contextList(catalog: Catalog, from: string, current: Channel): Channel[] {
  const ids = (list: string[]) => list.map(getChannel).filter(Boolean) as Channel[];
  if (from === "mylist") return ids(myList.get());
  if (from === "recent") return ids(recents.get());
  if (from === "picks") return ids(catalog.picks);
  if (from.startsWith("country:")) return catalog.channels.filter((c) => c.c === from.slice(8));
  if (from.startsWith("search:")) { const q = from.slice(7); return catalog.channels.filter((c) => c.n.toLowerCase().includes(q)); }
  const [cat, country] = from.split("|");
  if (cat && cat !== "all" && CATEGORIES.some((c) => c.id === cat)) return catalog.channels.filter((c) => inCat(c, cat) && (!country || c.c === country));
  if (cat === "all") return catalog.channels.filter((c) => !country || c.c === country);
  return catalog.channels.filter((c) => inCat(c, current.k[0]));
}

export function WatchScreen() {
  // Once the AdSense script has loaded (browsing pages), its Auto ads such as the
  // sticky anchor ad would stay on screen over the player. Reload the channel page
  // fresh instead: the server leaves the ads script off player pages.
  useEffect(() => {
    if (document.querySelector('script[src*="adsbygoogle.js"]')) window.location.reload();
  }, []);
  const { id = "" } = useParams<{ id: string }>();
  const from = new URLSearchParams(useSearch()).get("from") || "";
  const [, navigate] = useLocation();
  const guide = useGuide();
  const { catalog, error } = useCatalog();
  const [drawer, setDrawer] = useState(false);
  const [filter, setFilter] = useState("");
  const channel = catalog ? getChannel(decodeURIComponent(id)) : undefined;
  const list = useMemo(() => (catalog && channel ? contextList(catalog, from, channel) : []), [catalog, from, channel]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (q ? catalog?.channels.filter((c) => c.n.toLowerCase().includes(q)) || [] : list).slice(0, 200);
  }, [filter, list, catalog]);
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { if (drawer) activeRef.current?.scrollIntoView({ block: "center" }); }, [drawer]);

  if (!catalog) return <div className="watch"><Loading error={error} /></div>;
  if (!channel) return <div className="watch"><div className="state"><RadioTower size={36} /><h2>Channel not found</h2><p>It may have gone off air.</p><Link href="/" className="btn btn-light">Back to home</Link></div></div>;

  const go = (step: number) => {
    const pool = list.length > 1 ? list : catalog.channels;
    const at = pool.findIndex((c) => c.id === channel.id);
    const next = pool[(at + step + pool.length) % pool.length];
    navigate(`/watch/${encodeURIComponent(next.id)}${from ? `?from=${encodeURIComponent(from)}` : ""}`, { replace: true });
  };
  const back = () => (window.history.length > 1 ? window.history.back() : navigate("/"));

  return <div className="watch">
    <TVPlayer key={channel.id} channel={channel} onBack={back} onPrev={() => go(-1)} onNext={() => go(1)} onToggleList={() => setDrawer((d) => !d)} />
    <aside className={`drawer ${drawer ? "open" : ""}`} aria-hidden={!drawer}>
      <div className="drawer-head"><h2>Channels</h2><button onClick={() => setDrawer(false)} aria-label="Close"><X size={22} /></button></div>
      <div className="filter-search"><Search size={16} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Jump to any channel" /></div>
      <div className="drawer-list">
        {shown.map((c, i) => <Link key={c.id} ref={c.id === channel.id ? activeRef : undefined} href={`/watch/${encodeURIComponent(c.id)}${from ? `?from=${encodeURIComponent(from)}` : ""}`} replace className={`drawer-item ${c.id === channel.id ? "on" : ""}`}>
          <span className="drawer-num">{i + 1}</span><ChannelArt channel={c} /><span className="drawer-text"><strong>{c.n}</strong><small>{onNow(guide, c.id).now?.t || `${categoryLabel(c.k[0])} · ${countryName(c.c)}`}</small></span>
        </Link>)}
      </div>
    </aside>
    <div className="watch-info"><Info size={14} /> Press <b>L</b> for the channel list, <b>N</b>/<b>P</b> to flip channels</div>
  </div>;
}

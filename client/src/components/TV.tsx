import { Check, ChevronLeft, ChevronRight, Compass, Crown, Heart, Home, Play, Plus, Search, Settings2, UserRound, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { AccountSheet } from "@/components/Account";
import { InstallButton } from "@/components/Share";
import YokoLogo from "@/components/YokoLogo";
import { account } from "@/lib/account";
import { onNow, useGuide } from "@/lib/epg";
import { type Catalog, type Channel, categoryLabel, countryName, guessCountry, isSlowNetwork, myList, qualityTag, settings, toggleMyList, useStore } from "@/lib/catalog";

// A stable hue per channel gives logo-less tiles their own colour.
export function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
const initials = (name: string) => name.replace(/[^\w\s\u00C0-\uFFFF]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function ChannelArt({ channel, big = false }: { channel: Channel; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  const h = hue(channel.n);
  return <div className={`art ${big ? "art-big" : ""}`} style={{ "--h": h } as React.CSSProperties}>
    {channel.l && !broken ? <img src={channel.l} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /> : <span className="art-initials">{initials(channel.n)}</span>}
  </div>;
}

export function ChannelCard({ channel, rank, context }: { channel: Channel; rank?: number; context?: string }) {
  const list = useStore(myList);
  const saved = list.includes(channel.id);
  const tag = qualityTag(channel);
  const { now } = onNow(useGuide(), channel.id);
  const href = `/watch/${encodeURIComponent(channel.id)}${context ? `?from=${encodeURIComponent(context)}` : ""}`;
  return <div className={`card ${rank ? "card-ranked" : ""}`}>
    {rank && <span className="card-rank">{rank}</span>}
    <Link href={href} className="card-link" aria-label={`Watch ${channel.n}`}>
      <ChannelArt channel={channel} />
      <span className="pill-live"><i className="live-dot" /> LIVE</span>
      {tag && <span className="pill-q">{tag}</span>}
      <span className="card-play"><Play size={20} fill="currentColor" /></span>
      {now && <i className="card-progress" style={{ width: `${Math.round(now.progress * 100)}%` }} />}
    </Link>
    <div className="card-meta">
      <div className="card-text"><strong>{channel.n}</strong>{now ? <span className="card-now" title={now.t}><b>Now</b> {now.t}</span> : <span>{categoryLabel(channel.k[0])} · {countryName(channel.c)}</span>}</div>
      <button className={`card-save ${saved ? "on" : ""}`} aria-label={saved ? "Remove from My List" : "Add to My List"} onClick={() => toast(toggleMyList(channel.id) ? `${channel.n} added to My List` : "Removed from My List")}>
        {saved ? <Check size={15} /> : <Plus size={15} />}
      </button>
    </div>
  </div>;
}

function useInView<T extends Element>(margin = "300px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

export function Rail({ title, channels, href, ranked, context }: { title: string; channels: Channel[]; href?: string; ranked?: boolean; context?: string }) {
  const [ref, seen] = useInView<HTMLElement>();
  const track = useRef<HTMLDivElement>(null);
  if (!channels.length) return null;
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: "smooth" });
  return <section ref={ref} className="rail">
    <div className="rail-head">
      {href ? <Link href={href} className="rail-title">{title} <span>Explore all <ChevronRight size={16} /></span></Link> : <h2 className="rail-title">{title}</h2>}
    </div>
    <div className="rail-body">
      <button className="rail-arrow left" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronLeft size={30} /></button>
      <div ref={track} className={`rail-track ${ranked ? "ranked" : ""}`}>
        {seen ? channels.map((ch, i) => <ChannelCard key={ch.id} channel={ch} rank={ranked ? i + 1 : undefined} context={context} />)
          : Array.from({ length: 6 }, (_, i) => <div key={i} className="card skeleton" />)}
      </div>
      <button className="rail-arrow right" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronRight size={30} /></button>
    </div>
  </section>;
}

export function Grid({ channels, context }: { channels: Channel[]; context?: string }) {
  const [count, setCount] = useState(48);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => { setCount(48); }, [channels]);
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setCount((c) => c + 48); }, { rootMargin: "800px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [channels]);
  return <>
    <div className="grid">{channels.slice(0, count).map((ch) => <ChannelCard key={ch.id} channel={ch} context={context} />)}</div>
    {count < channels.length && <div ref={sentinel} className="grid-more" />}
  </>;
}

const NAV = [
  ["/", "Home"], ["/tv-guide", "TV Guide"], ["/browse/all", "Live TV"], ["/browse/news", "News"], ["/browse/sports", "Sports"],
  ["/browse/movies", "Movies"], ["/browse/kids", "Kids"], ["/browse/music", "Music"], ["/browse/african", "African"], ["/browse/anime", "Anime"], ["/my-list", "My List"],
] as const;

export function TopNav({ catalog }: { catalog?: Catalog | null }) {
  const [location, navigate] = useLocation();
  const [solid, setSolid] = useState(false);
  const [searchOpen, setSearchOpen] = useState(location.startsWith("/search"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user } = useStore(account);
  const [q, setQ] = useState(() => new URLSearchParams(location.startsWith("/search") ? window.location.search : "").get("q") || "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { if (searchOpen) input.current?.focus(); }, [searchOpen]);
  const onSearch = (value: string) => {
    setQ(value);
    navigate(value.trim() ? `/search?q=${encodeURIComponent(value)}` : "/", { replace: location.startsWith("/search") });
  };
  return <>
    <header className={`nav ${solid ? "solid" : ""}`}>
      <Link href="/" className="nav-logo"><YokoLogo height={26} /></Link>
      <nav className="nav-links">{NAV.map(([href, label]) => <Link key={href} href={href} className={location === href ? "on" : ""}>{label}</Link>)}</nav>
      <div className="nav-right">
        <div className={`nav-search ${searchOpen ? "open" : ""}`}>
          <button onClick={() => setSearchOpen(true)} aria-label="Search"><Search size={20} /></button>
          <input ref={input} value={q} onChange={(e) => onSearch(e.target.value)} onBlur={() => !q && setSearchOpen(false)} placeholder="Channels, countries, genres" />
          {q && <button onClick={() => onSearch("")} aria-label="Clear"><X size={16} /></button>}
        </div>
        {!user?.premium && <Link href="/premium" className="nav-premium" aria-label="YokoTV Premium"><Crown size={16} /><span>Premium</span></Link>}
        <InstallButton />
        <button className="nav-icon" onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings2 size={20} /></button>
        <button className={`nav-icon nav-account ${user ? "in" : ""} ${user?.premium ? "premium" : ""}`} onClick={() => setAccountOpen(true)} aria-label={user ? "Your account" : "Sign in"}>{user ? (user.name || user.email)[0].toUpperCase() : <UserRound size={20} />}</button>
      </div>
    </header>
    <nav className="tabbar">
      <Link href="/" className={location === "/" ? "on" : ""}><Home size={21} /><span>Home</span></Link>
      <Link href="/search" className={location.startsWith("/search") ? "on" : ""}><Search size={21} /><span>Search</span></Link>
      <Link href="/browse/all" className={location.startsWith("/browse") ? "on" : ""}><Compass size={21} /><span>Browse</span></Link>
      <Link href="/my-list" className={location === "/my-list" ? "on" : ""}><Heart size={21} /><span>My List</span></Link>
    </nav>
    {settingsOpen && <SettingsSheet catalog={catalog} onClose={() => setSettingsOpen(false)} />}
    {accountOpen && <AccountSheet onClose={() => setAccountOpen(false)} />}
  </>;
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: ReactNode }) {
  return <label className="setting"><div><strong>{label}</strong><span>{hint}</span></div>
    <button role="switch" aria-checked={on} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}><i /></button></label>;
}

export function SettingsSheet({ catalog, onClose }: { catalog?: Catalog | null; onClose: () => void }) {
  const prefs = useStore(settings);
  const set = (patch: Partial<typeof prefs>) => settings.set({ ...settings.get(), ...patch });
  const countries = catalog ? Object.entries(catalog.countries).sort((a, b) => a[1].localeCompare(b[1])) : [];
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
      <div className="sheet-head"><h2>Settings</h2><button onClick={onClose} aria-label="Close"><X size={22} /></button></div>
      <Toggle label="Data saver" on={prefs.dataSaver} onChange={(v) => set({ dataSaver: v })}
        hint={<>Starts every channel at low quality and caps it at 360p. Uses much less data on slow connections.{isSlowNetwork() && <b> Your connection looks slow, so this is already on automatically.</b>}</>} />
      <Toggle label="Autoplay previews" on={prefs.previews} onChange={(v) => set({ previews: v })} hint="Plays the featured channel muted on the home screen. Turned off automatically on slow connections." />
      <label className="setting"><div><strong>My country</strong><span>Used for the “Popular in” row on the home screen.</span></div>
        <select value={prefs.country || guessCountry()} onChange={(e) => set({ country: e.target.value })}>
          {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select></label>
      <p className="sheet-note">Keyboard: Space play/pause · M mute · F fullscreen · ↑↓ volume · N/P next/previous channel · L channel list</p>
    </div>
  </div>;
}

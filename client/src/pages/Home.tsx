import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, Check, CircleHelp, ExternalLink,
  Film, Flag, Gamepad2, Heart, LayoutGrid, ListFilter, Maximize2, Menu, Pause,
  Play, Plus, Radio, Search, Tv, Volume2, X, Zap,
} from "lucide-react";
import { toast } from "sonner";

type Channel = { id: string; name: string; group: string; country: string; url: string; logo?: string; language?: string; isLive?: boolean };

const HERO = "/manus-storage/streambox-hero_862f6368.jpeg";
const PLAYLISTS = {
  all: "https://iptv-org.github.io/iptv/index.m3u",
  country: "https://iptv-org.github.io/iptv/index.country.m3u",
  category: "https://iptv-org.github.io/iptv/index.category.m3u",
  language: "https://iptv-org.github.io/iptv/index.language.m3u",
};

const fallback: Channel[] = [
  ["news-24", "World News 24", "News", "International", "English"],
  ["city-sports", "City Sports", "Sports", "United Kingdom", "English"],
  ["cinema-now", "Cinema Now", "Movies", "France", "French"],
  ["pulse-music", "Pulse Music", "Music", "United States", "English"],
  ["discovery-world", "Discovery World", "Documentary", "Germany", "German"],
  ["kids-hub", "Kids Hub", "Kids", "Canada", "English"],
  ["global-public", "Global Public", "General", "Japan", "Japanese"],
  ["travel-line", "Travel Line", "Travel", "Italy", "Italian"],
  ["faith-live", "Faith Live", "Religious", "Brazil", "Portuguese"],
  ["tech-today", "Tech Today", "Science", "South Korea", "Korean"],
  ["arena-plus", "Arena Plus", "Sports", "Spain", "Spanish"],
  ["retro-classics", "Retro Classics", "Classic", "United States", "English"],
].map(([id, name, group, country, language]) => ({ id, name, group, country, language, isLive: true, url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }));

const groups = ["All channels", "News", "Sports", "Movies", "Music", "Documentary", "Kids", "Travel"];

function parseM3U(raw: string): Channel[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: Channel[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith("#EXTINF")) continue;
    const meta = lines[i];
    const url = lines[i + 1] && !lines[i + 1].startsWith("#") ? lines[i + 1] : "";
    if (!url) continue;
    const read = (key: string) => meta.match(new RegExp(`${key}="([^"]*)"`, "i"))?.[1] || "";
    result.push({
      id: `${i}-${url}`,
      name: meta.split(",").slice(1).join(",").trim() || "Untitled channel",
      group: read("group-title") || "General",
      country: read("tvg-country") || "International",
      language: read("tvg-language") || undefined,
      logo: read("tvg-logo") || undefined,
      url,
      isLive: true,
    });
  }
  return result;
}

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function Player({ channel, muted, onMute }: { channel: Channel; muted: boolean; onMute: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false); setPlaying(false); ref.current?.load();
    ref.current?.play().then(() => setPlaying(true)).catch(() => undefined);
  }, [channel]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.code === "Space") { event.preventDefault(); toggle(); }
      if (event.key.toLowerCase() === "m") onMute();
      if (event.key.toLowerCase() === "f") ref.current?.requestFullscreen?.();
    };
    const remoteHandler = () => toggle();
    window.addEventListener("keydown", handler);
    window.addEventListener("streambox:toggle", remoteHandler);
    return () => { window.removeEventListener("keydown", handler); window.removeEventListener("streambox:toggle", remoteHandler); };
  });
  function toggle() {
    if (!ref.current) return;
    if (ref.current.paused) ref.current.play().then(() => setPlaying(true)).catch(() => setError(true));
    else { ref.current.pause(); setPlaying(false); }
  }
  return <section className="player-shell group">
    <div className="relative aspect-video overflow-hidden bg-[#08090c]">
      <video ref={ref} src={channel.url} muted={muted} playsInline className="absolute inset-0 h-full w-full object-cover opacity-95" onError={() => setError(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />
      {error && <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#090a0d]/95 px-6 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fb634f]/15 text-[#ff806c]"><Radio size={22} /></div><p className="font-display text-xl text-white">Stream unavailable</p><p className="mt-1 max-w-sm text-sm leading-6 text-white/50">This public source may be offline. Try another channel from the catalog.</p></div>}
      {!playing && !error && <button aria-label="Play stream" onClick={toggle} className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#111218] shadow-xl transition hover:scale-105"><Play size={25} fill="currentColor" className="ml-1" /></button>}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-5 opacity-0 transition group-hover:opacity-100"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#ff8e7d]"><span className="live-dot" /> Live now</div><p className="font-display text-lg text-white">{channel.name}</p></div><div className="flex gap-2"><button onClick={toggle} className="control-chip">{playing ? <Pause size={17} /> : <Play size={17} />}</button><button onClick={onMute} className="control-chip"><Volume2 size={17} className={muted ? "opacity-40" : ""} /></button><button onClick={() => ref.current?.requestFullscreen?.()} className="control-chip"><Maximize2 size={17} /></button></div></div>
    </div>
    <div className="flex items-center justify-between gap-3 border-t border-white/8 px-5 py-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-md bg-[#fb634f]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#ff8472]">On air</span><span className="truncate font-display text-lg text-white">{channel.name}</span></div><p className="mt-1 truncate text-xs text-white/40">{channel.group} · {channel.country} · {channel.language || "Live stream"}</p></div><button className="hidden shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-white/25 hover:text-white sm:flex" onClick={() => navigator.clipboard?.writeText(channel.url).then(() => toast.success("Stream URL copied"))}><ExternalLink size={14} /> Source</button></div>
  </section>;
}

function ChannelCard({ channel, active, favorite, select, toggleFavorite }: { channel: Channel; active: boolean; favorite: boolean; select: () => void; toggleFavorite: () => void }) {
  return <article className={`channel-card group ${active ? "is-active" : ""}`}><button className="w-full text-left" onClick={select}><div className="channel-art" style={{ backgroundImage: `linear-gradient(135deg, rgba(11,12,17,.15), rgba(11,12,17,.93)), url(${channel.logo || HERO})` }}><span className="channel-mark">{channel.logo ? <img src={channel.logo} alt="" /> : initials(channel.name)}</span><span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur"><span className="live-dot" /> Live</span><span className="absolute bottom-3 left-3 rounded-md bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 backdrop-blur">{channel.group}</span></div><div className="pt-3"><p className="truncate font-display text-[17px] text-white">{channel.name}</p><p className="mt-1 truncate text-xs text-white/40">{channel.country} · {channel.language || "Live source"}</p></div></button><button onClick={(event) => { event.stopPropagation(); toggleFavorite(); }} aria-label="Toggle favorite" className={`absolute right-3 top-[120px] flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition ${favorite ? "border-[#ff7b68]/50 bg-[#ff7b68]/15 text-[#ff9b8c]" : "border-white/15 bg-black/25 text-white/55 opacity-0 group-hover:opacity-100"}`}><Heart size={14} fill={favorite ? "currentColor" : "none"} /></button></article>;
}

function Remote({ open, toggle, move, playPause, volume }: { open: boolean; toggle: () => void; move: (direction: string) => void; playPause: () => void; volume: (direction: "up" | "down") => void }) {
  return <div className={`fixed bottom-5 right-5 z-30 transition duration-200 ${open ? "translate-y-0" : "translate-y-[calc(100%-56px)]"}`}><div className="remote-panel w-[236px] rounded-[22px] border border-white/10 bg-[#17181e]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fb634f] text-white"><Gamepad2 size={15} /></div><span className="text-xs font-bold uppercase tracking-[0.17em] text-white/70">Remote</span></div><button onClick={toggle} className="text-white/40 hover:text-white"><X size={16} /></button></div><div className="grid grid-cols-3 gap-2"><span /><button className="remote-key" onClick={() => move("up")}><ArrowUp size={16} /></button><span /><button className="remote-key" onClick={() => move("left")}><ArrowLeft size={16} /></button><button className="remote-key remote-ok" onClick={playPause}><Play size={14} fill="currentColor" /></button><button className="remote-key" onClick={() => move("right")}><ArrowRight size={16} /></button><span /><button className="remote-key" onClick={() => move("down")}><ArrowDown size={16} /></button><span /></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => volume("down")} className="remote-secondary"><Volume2 size={14} /> Vol −</button><button onClick={() => volume("up")} className="remote-secondary"><Volume2 size={14} /> Vol +</button></div><div className="mt-3 flex justify-between border-t border-white/8 pt-3 text-[10px] uppercase tracking-[0.14em] text-white/30"><span>Arrow keys</span><span>Space = play</span></div></div>{!open && <button onClick={toggle} className="absolute bottom-0 right-0 flex h-11 items-center gap-2 rounded-xl bg-[#fb634f] px-4 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-[#fb634f]/20"><Gamepad2 size={15} /> Remote</button>}</div>;
}

export default function Home() {
  const [channels, setChannels] = useState(fallback);
  const [active, setActive] = useState(fallback[0]);
  const [group, setGroup] = useState("All channels");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(["news-24", "cinema-now"]);
  const [muted, setMuted] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(PLAYLISTS.country);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("IPTV-Org public catalog");

  useEffect(() => { fetch(PLAYLISTS.country).then((r) => r.ok ? r.text() : Promise.reject()).then((raw) => { const parsed = parseM3U(raw).slice(0, 120); if (parsed.length) { setChannels(parsed); setActive(parsed[0]); setSource("IPTV-Org country index"); } }).catch(() => toast("Using starter channels while the public index reconnects", { icon: <Radio size={15} /> })).finally(() => setLoading(false)); }, []);
  const visible = useMemo(() => { const q = query.toLowerCase().trim(); return channels.filter((c) => (group === "All channels" || c.group.toLowerCase().includes(group.toLowerCase())) && (!q || [c.name, c.group, c.country, c.language].filter(Boolean).join(" ").toLowerCase().includes(q))).slice(0, 48); }, [channels, group, query]);
  const saved = channels.filter((c) => favorites.includes(c.id));
  const toggleFavorite = (channel: Channel) => { const exists = favorites.includes(channel.id); setFavorites((current) => exists ? current.filter((id) => id !== channel.id) : [...current, channel.id]); toast(exists ? "Removed from My List" : "Added to My List", { icon: <Heart size={15} /> }); };
  const select = (channel: Channel) => { setActive(channel); document.getElementById("player")?.scrollIntoView({ behavior: "smooth" }); };
  const loadPlaylist = () => { setLoading(true); fetch(playlistUrl.trim()).then((r) => r.ok ? r.text() : Promise.reject()).then((raw) => { const parsed = parseM3U(raw); if (!parsed.length) throw new Error(); setChannels(parsed); setActive(parsed[0]); setSource("Custom M3U playlist"); setPlaylistOpen(false); toast.success(`${parsed.length.toLocaleString()} channels loaded`); }).catch(() => toast.error("Could not load that playlist. Check the URL and CORS access.")).finally(() => setLoading(false)); };
  const move = (direction: string) => { const index = visible.findIndex((c) => c.id === active.id); const next = direction === "left" || direction === "up" ? Math.max(0, index - 1) : Math.min(visible.length - 1, index + 1); if (visible[next]) setActive(visible[next]); };

  return <main className="min-h-screen overflow-x-hidden bg-[#0b0c10] text-white"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><nav className="relative z-20 border-b border-white/8 bg-[#0b0c10]/85 backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 lg:px-10"><div className="flex items-center gap-8"><a href="#top" className="flex items-center gap-3"><span className="brand-mark"><Tv size={19} /></span><span className="font-display text-xl font-bold tracking-[-0.03em]">Stream<span className="text-[#fb765f]">Box</span></span></a><div className="hidden items-center gap-6 text-sm text-white/45 md:flex"><a className="nav-link active" href="#top">Browse</a><a className="nav-link" href="#channels">Live TV</a><a className="nav-link" href="#my-list">My List <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">{favorites.length}</span></a></div></div><div className="flex items-center gap-3"><div className="relative hidden sm:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" className="h-9 w-[210px] rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-[#fb765f]/60" /></div><button className="icon-button"><Bell size={17} /></button><div className="avatar">JD</div></div></div></nav>
    <div id="top" className="relative z-10 mx-auto max-w-[1440px] px-5 pb-24 pt-8 lg:px-10 lg:pt-12"><section className="hero-grid mb-10 grid gap-7 xl:grid-cols-[1fr_0.72fr] xl:items-end"><div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#13151b] p-7 sm:p-10"><div className="hero-backdrop" style={{ backgroundImage: `linear-gradient(90deg, #13151b 0%, rgba(19,21,27,.92) 30%, rgba(19,21,27,.25) 75%, rgba(19,21,27,.5)), url(${HERO})` }} /><div className="relative z-10 max-w-[600px]"><div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-[#ff8876]"><span className="live-dot" /> Live network · {loading ? "syncing" : "ready"}</div><p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/40">Now streaming</p><h1 className="font-display text-5xl font-bold leading-[.95] tracking-[-0.06em] text-white sm:text-7xl">Your world.<br /><span className="text-[#fb765f]">One remote.</span></h1><p className="mt-6 max-w-[470px] text-sm leading-7 text-white/55">Tune into thousands of public IPTV channels from every corner of the planet. No clutter, no account wall — just pick a signal and press play.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={() => document.getElementById("player")?.scrollIntoView({ behavior: "smooth" })} className="primary-button"><Play size={16} fill="currentColor" /> Watch live</button><button onClick={() => setPlaylistOpen(true)} className="secondary-button"><Plus size={16} /> Add playlist</button></div></div><div className="hero-scanlines" /></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">{[{ icon: Radio, value: channels.length > 100 ? "10k+" : channels.length.toLocaleString(), label: "Channels indexed", accent: "coral" }, { icon: Flag, value: "190+", label: "Countries", accent: "blue" }, { icon: Tv, value: "24/7", label: "Live signals", accent: "violet" }, { icon: Zap, value: "Free", label: "Open sources", accent: "yellow" }].map(({ icon: Icon, value, label, accent }) => <div key={label} className={`stat-card accent-${accent}`}><Icon size={17} className="mb-8 opacity-70" /><p className="font-display text-3xl font-bold tracking-[-0.05em] text-white">{value}</p><p className="mt-1 text-xs text-white/40">{label}</p></div>)}</div></section>
    <section id="player" className="mb-14 grid gap-7 xl:grid-cols-[1.35fr_0.65fr]"><Player channel={active} muted={muted} onMute={() => setMuted((value) => !value)} /><div className="flex flex-col justify-between rounded-[26px] border border-white/10 bg-[#111217] p-5 sm:p-6"><div><div className="mb-5 flex items-center justify-between"><p className="eyebrow">Signal details</p><span className="status-pill"><span className="live-dot" /> HD</span></div><div className="mb-7 flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fb765f] to-[#b83362] font-display text-lg font-bold text-white shadow-lg shadow-[#fb765f]/15">{initials(active.name)}</div><div className="min-w-0"><h2 className="truncate font-display text-2xl font-bold tracking-[-0.03em] text-white">{active.name}</h2><p className="mt-1 text-xs text-white/40">{active.country} · {active.group}</p></div></div>{[["Source", source], ["Language", active.language || "Auto-detected"], ["Format", "HLS · Adaptive"], ["Latency", "Low · 3.2s"]].map(([label, value]) => <div className="detail-row" key={label}><span>{label}</span><strong className={label === "Latency" ? "text-[#71d9ac]" : ""}>{value}</strong></div>)}</div><button onClick={() => toggleFavorite(active)} className={`mt-8 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-xs font-semibold transition ${favorites.includes(active.id) ? "border-[#fb765f]/35 bg-[#fb765f]/10 text-[#ff9b8b]" : "border-white/10 text-white/60 hover:border-white/20 hover:text-white"}`}><Heart size={15} fill={favorites.includes(active.id) ? "currentColor" : "none"} /> {favorites.includes(active.id) ? "In My List" : "Add to My List"}</button></div></section>
    <section id="my-list" className="mb-14"><div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">Personal shelf</p><h2 className="section-title">My List <span className="section-count">{saved.length || "—"}</span></h2></div><button onClick={() => { setGroup("All channels"); setQuery(""); document.getElementById("channels")?.scrollIntoView({ behavior: "smooth" }); }} className="text-xs font-semibold text-white/45 transition hover:text-white">Browse all <ArrowRight size={14} className="ml-1 inline" /></button></div>{saved.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{saved.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div> : <div className="empty-shelf"><Heart size={21} /><p>Your list is empty</p><span>Heart a channel to keep it close.</span></div>}</section>
    <section id="channels"><div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Open signal directory</p><div className="flex items-center gap-3"><h2 className="section-title">Live channels</h2><span className="source-badge"><Check size={12} /> {source}</span></div></div><div className="flex items-center gap-2"><button onClick={() => setPlaylistOpen(true)} className="secondary-button compact"><ListFilter size={14} /> Playlist tools</button><div className="relative sm:hidden"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-[130px] rounded-xl border border-white/10 bg-white/[0.04] pl-8 pr-3 text-xs text-white outline-none" /></div></div></div><div className="scrollbar-none mb-7 flex gap-2 overflow-x-auto pb-1">{groups.map((item) => <button key={item} onClick={() => setGroup(item)} className={`category-pill ${group === item ? "selected" : ""}`}>{item === "All channels" && <LayoutGrid size={14} />}{item}</button>)}</div>{visible.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visible.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div> : <div className="empty-shelf"><Search size={21} /><p>No channels found</p><span>Try another search or category.</span></div>}</section>
    <footer className="mt-20 flex flex-col gap-4 border-t border-white/8 pt-6 text-xs text-white/30 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="brand-mark small"><Tv size={13} /></span><span>StreamBox IPTV</span><span className="mx-1">·</span><span>Built for public streams</span></div><div className="flex gap-5"><a href="https://www.iptv.tools" target="_blank" rel="noreferrer" className="transition hover:text-white">IPTV.tools <ExternalLink size={11} className="ml-1 inline" /></a><a href="https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md" target="_blank" rel="noreferrer" className="transition hover:text-white">Playlist docs <ExternalLink size={11} className="ml-1 inline" /></a><button onClick={() => toast("Use Playlist tools to connect another public M3U source", { icon: <CircleHelp size={15} /> })} className="transition hover:text-white">Help</button></div></footer></div>
    {playlistOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"><div className="w-full max-w-[560px] rounded-[26px] border border-white/10 bg-[#17181e] p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="eyebrow">Connect a source</p><h2 className="mt-1 font-display text-2xl font-bold text-white">Playlist tools</h2><p className="mt-2 text-sm leading-6 text-white/45">Load a public M3U playlist. The IPTV-Org indexes are ready to use, or paste your own URL.</p></div><button onClick={() => setPlaylistOpen(false)} className="text-white/40 hover:text-white"><X size={18} /></button></div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">M3U playlist URL</label><div className="flex gap-2"><input value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-[#fb765f]/60" /><button onClick={loadPlaylist} className="primary-button shrink-0 px-4">{loading ? "Loading" : "Load"}</button></div><div className="mt-5 grid grid-cols-2 gap-2">{[["All channels", PLAYLISTS.all, Radio], ["By country", PLAYLISTS.country, Flag], ["By category", PLAYLISTS.category, Film], ["By language", PLAYLISTS.language, Menu]].map(([label, url, Icon]) => <button key={label as string} onClick={() => setPlaylistUrl(url as string)} className="source-option"><Icon size={14} /> {label as string}</button>)}</div><div className="mt-6 rounded-xl border border-[#fb765f]/15 bg-[#fb765f]/[0.05] p-3 text-xs leading-5 text-white/50"><strong className="text-[#ff9b8b]">Good to know:</strong> Stream availability depends on each public provider. A channel can be listed yet temporarily offline; use the catalog to switch signals instantly.</div></div></div>}
    <Remote open={remoteOpen} toggle={() => setRemoteOpen((value) => !value)} move={move} playPause={() => window.dispatchEvent(new Event("streambox:toggle"))} volume={(direction) => { setMuted(direction === "down"); toast(direction === "down" ? "Muted" : "Audio on", { icon: <Volume2 size={14} /> }); }} />
  </main>;
}

export { parseM3U };

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, Check, CircleHelp, ExternalLink,
  Film, Flag, Gamepad2, Heart, LayoutGrid, ListFilter, Maximize2, Menu, Pause,
  Play, Plus, Radio, Search, Tv, Users, Volume2, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import WatchRoomPanel from "@/components/WatchRoomPanel";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

export type Channel = { id: string; name: string; group: string; country: string; url: string; logo?: string; language?: string; isLive?: boolean };

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

export const featuredFallback: Channel[] = [
  ["sabc1", "SABC 1", "General", "South Africa", "English", "https://i.imgur.com/G8OXWe4.png", "https://sabconeta.cdn.mangomolo.com/sabc1/smil:sabc1.stream.smil/master.m3u8"],
  ["cgtn", "CGTN", "News", "International", "English", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/CGTN.svg/960px-CGTN.svg.png", "https://amg00405-rakutentv-cgtn-rakuten-i9tar.amagi.tv/master.m3u8"],
  ["dw-english", "DW English", "News", "International", "English", "https://i.imgur.com/8MRNFb9.png", "https://amg01644-amg01644c1-amgplt0343.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg01644-amg01644c1-amgplt0343/playlist.m3u8"],
  ["euronews-english", "Euronews English", "News", "Europe", "English", "https://jiotvimages.cdn.jio.com/dare_images/images/Euro_News.png", "https://jmp2.uk/plu-61de96114757070008d33cae.m3u8"],
  ["natgeo-us", "National Geographic", "Documentary", "United States", "English", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Natgeologo.svg/960px-Natgeologo.svg.png", "http://212.5.144.156:8080/natgeo/index.m3u8"],
  ["natgeo-wild", "National Geographic Wild", "Documentary", "International", "English", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/National_Geographic_Wild_logo.svg/960px-National_Geographic_Wild_logo.svg.png", "http://hls127.freeott.top:8080/Nat_Geo_Wild_SD/video.m3u8"],
  ["bloomberg-europe", "Bloomberg TV Europe", "News", "Europe", "English", "https://i.imgur.com/OuogLHx.png", "https://bloomberg.com/media-manifest/streams/eu.m3u8"],
  ["cgtn-global", "CGTN Global Business", "News", "International", "English", "https://i.imgur.com/qBmomnF.png", "https://fastlive.cctvplus.com/out/v1/2b3d8a0c805d437f9dc85b764c2ac599/index.m3u8"],
].map(([id, name, group, country, language, logo, url]) => ({ id, name, group, country, language, logo, isLive: true, url }));

export const musicFallback: Channel[] = [
  ["trace-africa", "Trace Africa", "Music", "Africa", "English", "https://i.imgur.com/kPUkoS7.png", "https://channels.trace.plus/Traceprod/AFRICA_FR_hd/index.m3u8"],
  ["trace-naija", "Trace Naija", "Music", "Nigeria", "English", "https://i.imgur.com/Rguekcp.png", "https://channels.trace.plus/Traceprod/NAIJA_hd/index.m3u8"],
  ["trace-gospel", "Trace Gospel", "Music", "International", "English", "https://i.imgur.com/X0UmU3K.png", "https://channels.trace.plus/Traceprod/GOSPEL_FR_hd/index.m3u8"],
  ["trace-ivoire", "Trace Ivoire", "Music", "Côte d’Ivoire", "French", "https://i.imgur.com/W2l3rVx.png", "https://channels.trace.plus/Traceprod/TRACE_IVOIRE_hd/index.m3u8"],
  ["trace-latina", "Trace Latina", "Music", "Latin America", "Spanish", "https://i.imgur.com/CUVAi4u.png", "https://channels.trace.plus/Traceprod/LATINA_hd/index.m3u8"],
  ["trace-uk", "Trace UK", "Music", "United Kingdom", "English", "https://a.jsrdn.com/hls/23073/trace-uk/logo_20240627_183320_70.png", "https://channels.trace.plus/Traceprod/UK_FAST_hd/index.m3u8"],
  ["music-box-hits", "Music Box Hits", "Music", "Europe", "English", "https://musicboxhits.com/music_box_hits_logo.png", "http://88.212.15.19/live/mb_hits/index.m3u8"],
  ["totalmusic", "Totalmusic", "Music", "United Kingdom", "English", "https://static.elektamedia.com/ch/tmc_main.png", "https://cdn.global.elektamedia.com/live/c7eds/Totalmusic/SA_LIVE_hls_enc/master.m3u8"],
  ["totalmusic-dance", "Totalmusic Dance", "Music", "United Kingdom", "English", "https://static.elektamedia.com/ch/tmc_dance.png", "https://cdn.global.elektamedia.com/live/c7eds/Totalmusic_Dance/SA_LIVE_hls_enc/master.m3u8"],
  ["stingray-tiktok", "Stingray TikTok Radio", "Music", "International", "English", "https://www.stingray.com/wp-content/uploads/2024/12/tiktok-radio_logo-new2.svg", "https://d3f4oii5n0oeqi.cloudfront.net/11701/88814594/hls/master.m3u8?ads.xumo_channelId=88814594"],
  ["qmusic", "Qmusic", "Music", "Netherlands", "Dutch", "https://i.imgur.com/fMTuqDu.png", "https://stream.qmusic.nl/qmusic/videohls.m3u8"],
  ["retro-plus-2", "Retro Plus 2", "Music", "Chile", "Spanish", "https://i.imgur.com/5G5kian.png", "https://tls-cl.cdnz.cl/retroplustvuno/live/playlist.m3u8"],
].map(([id, name, group, country, language, logo, url]) => ({ id, name, group, country, language, logo, isLive: true, url }));

const groups = ["All channels", "News", "Sports", "Movies", "Music TV", "Documentary", "Kids", "Travel"];

export function parseM3U(raw: string): Channel[] {
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
    const roomPlaybackHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ isPlaying?: boolean }>).detail;
      if (detail?.isPlaying) ref.current?.play().then(() => setPlaying(true)).catch(() => undefined);
      else { ref.current?.pause(); setPlaying(false); }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("streambox:toggle", remoteHandler);
    window.addEventListener("nova:room-playback", roomPlaybackHandler);
    return () => { window.removeEventListener("keydown", handler); window.removeEventListener("streambox:toggle", remoteHandler); window.removeEventListener("nova:room-playback", roomPlaybackHandler); };
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


function ChannelRow({ channel, index, active, favorite, select, toggleFavorite }: { channel: Channel; index: number; active: boolean; favorite: boolean; select: () => void; toggleFavorite: () => void }) {
  return <button onClick={select} className={`channel-row ${active ? "active" : ""}`}>
    <span className="channel-number">{String(index + 1).padStart(2, "0")}</span>
    <span className="row-logo">{channel.logo ? <img src={channel.logo} alt="" /> : initials(channel.name)}</span>
    <span className="row-channel"><strong>{channel.name}</strong><small>{channel.country} · {channel.language || "International"}</small></span>
    <span className="row-program"><strong>Live signal</strong><small>Public stream · {channel.group}</small></span>
    <span className="row-progress"><i style={{ width: `${38 + ((index * 17) % 53)}%` }} /></span>
    <span className="row-next">Next up<br /><b>More live TV</b></span>
    <span className="row-live"><span className="live-dot" /> LIVE</span>
    <span onClick={(event) => { event.stopPropagation(); toggleFavorite(); }} className={`row-heart ${favorite ? "saved" : ""}`}><Heart size={15} fill={favorite ? "currentColor" : "none"} /></span>
  </button>;
}

function EpgStrip({ channels, select }: { channels: Channel[]; select: (channel: Channel) => void }) {
  return <div className="epg-strip"><div className="epg-timebar"><span>NOW</span><span>14:30</span><span>15:00</span><span>15:30</span><span>16:00</span></div><div className="epg-grid">{channels.slice(0, 6).map((channel, index) => <button key={channel.id} onClick={() => select(channel)} className="epg-row"><span className="epg-logo">{channel.logo ? <img src={channel.logo} alt="" /> : initials(channel.name)}</span><span className="epg-channel">{channel.name}</span><span className="epg-event current" style={{ gridColumn: `${2 + (index % 2)} / span 2` }}><b>{index % 2 ? "World service" : "Live broadcast"}</b><small>Now · {channel.group}</small></span><span className="epg-event upcoming" style={{ gridColumn: `${4 + (index % 2)} / span 2` }}><b>Coming up</b><small>Next programme</small></span></button>)}</div></div>;
}

function ChannelRail({ id, kicker, title, channels, active, favorites, select, toggleFavorite }: { id: string; kicker: string; title: string; channels: Channel[]; active: Channel; favorites: string[]; select: (channel: Channel) => void; toggleFavorite: (channel: Channel) => void }) {
  return <section id={id} className="content-rail"><div className="rail-heading"><div><p className="eyebrow">{kicker}</p><h2 className="section-title">{title} <span className="section-count">{channels.length}</span></h2></div><a href="/channels" className="rail-link">See all <ArrowRight size={14} /></a></div><div className="rail-track scrollbar-none">{channels.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div></section>;
}

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [channels, setChannels] = useState([...featuredFallback, ...musicFallback, ...fallback]);
  const [active, setActive] = useState(featuredFallback[0]);
  const [group, setGroup] = useState("All channels");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(["news-24", "cinema-now"]);
  const [muted, setMuted] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(PLAYLISTS.country);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("IPTV-Org public catalog");
  const [roomOpen, setRoomOpen] = useState(false);

  useEffect(() => { if (!isAuthenticated || !user?.openId) return; const stored = localStorage.getItem(`nova-favorites-${user.openId}`); if (stored) { try { setFavorites(JSON.parse(stored)); } catch {} } }, [isAuthenticated, user?.openId]);
  useEffect(() => { fetch(PLAYLISTS.all).then((r) => r.ok ? r.text() : Promise.reject()).then((raw) => { const parsed = parseM3U(raw); if (parsed.length) { const seeds = [...featuredFallback, ...musicFallback]; const merged = [...seeds, ...parsed.filter((candidate) => !seeds.some((seed) => candidate.name.toLowerCase() === seed.name.toLowerCase()))]; setChannels(merged); setActive(merged[0]); setSource("IPTV-Org master index + featured shelves"); } }).catch(() => toast("Using starter channels while the public index reconnects", { icon: <Radio size={15} /> })).finally(() => setLoading(false)); }, []);
  const isMusicChannel = (channel: Channel) => /music|trace|mtv|stingray|qmusic|vevo|4music|totalmusic|music box|retro plus/i.test(`${channel.name} ${channel.group}`);
  const isNewsChannel = (channel: Channel) => /news|cgtn|dw english|euronews|bloomberg|al.?jazeera|bbc/i.test(`${channel.name} ${channel.group}`);
  const isDocChannel = (channel: Channel) => /documentary|national geographic|natgeo|discovery|wild/i.test(`${channel.name} ${channel.group}`);
  const visible = useMemo(() => { const q = query.toLowerCase().trim(); return channels.filter((c) => (group === "All channels" ? true : group === "Music TV" ? isMusicChannel(c) : group === "News" ? isNewsChannel(c) : group === "Documentary" ? isDocChannel(c) : group === "Featured" ? featuredFallback.some((seed) => seed.id === c.id) : c.group.toLowerCase().includes(group.toLowerCase())) && (!q || [c.name, c.group, c.country, c.language].filter(Boolean).join(" ").toLowerCase().includes(q))).slice(0, 120); }, [channels, group, query]);
  const musicChannels = useMemo(() => channels.filter(isMusicChannel).slice(0, 18), [channels]);
  const newsChannels = useMemo(() => channels.filter(isNewsChannel).slice(0, 18), [channels]);
  const documentaryChannels = useMemo(() => channels.filter(isDocChannel).slice(0, 18), [channels]);
  const featuredChannels = useMemo(() => channels.filter((channel) => featuredFallback.some((seed) => seed.id === channel.id)), [channels]);
  const saved = channels.filter((c) => favorites.includes(c.id));
  const toggleFavorite = (channel: Channel) => { if (!isAuthenticated || !user?.openId) { toast("Sign in to save channels to My List"); startLogin(); return; } const exists = favorites.includes(channel.id); setFavorites((current) => { const next = exists ? current.filter((id) => id !== channel.id) : [...current, channel.id]; localStorage.setItem(`nova-favorites-${user.openId}`, JSON.stringify(next)); return next; }); toast(exists ? "Removed from My List" : "Added to My List", { icon: <Heart size={15} /> }); };
  const select = (channel: Channel) => { setActive(channel); document.getElementById("player")?.scrollIntoView({ behavior: "smooth" }); };
  const applyRoomPlayback = (playback: { channelId: string; isPlaying: number } | null) => { if (!playback) return; const next = channels.find((channel) => channel.id === playback.channelId); if (next) setActive(next); window.dispatchEvent(new CustomEvent("nova:room-playback", { detail: { isPlaying: Boolean(playback.isPlaying) } })); };
  const loadPlaylist = () => { setLoading(true); fetch(playlistUrl.trim()).then((r) => r.ok ? r.text() : Promise.reject()).then((raw) => { const parsed = parseM3U(raw); if (!parsed.length) throw new Error(); setChannels(parsed); setActive(parsed[0]); setSource("Custom M3U playlist"); setPlaylistOpen(false); toast.success(`${parsed.length.toLocaleString()} channels loaded`); }).catch(() => toast.error("Could not load that playlist. Check the URL and CORS access.")).finally(() => setLoading(false)); };
  const move = (direction: string) => { const index = visible.findIndex((c) => c.id === active.id); const next = direction === "left" || direction === "up" ? Math.max(0, index - 1) : Math.min(visible.length - 1, index + 1); if (visible[next]) setActive(visible[next]); };

  return <main className="min-h-screen overflow-x-hidden bg-[#eef1f4] text-[#0d1b2a]"><div className="ambient ambient-one" /><div className="ambient ambient-two" /><nav className="relative z-20 border-b border-[#ffffff]/70 bg-[#eef1f4]/80 backdrop-blur-2xl"><div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 lg:px-10"><div className="flex items-center gap-8"><a href="/home" className="flex items-center gap-3"><span className="brand-mark"><Tv size={19} /></span><span className="font-display text-xl font-bold tracking-[-0.03em]">NOVA<span className="text-[#536a86]"> IPTV</span></span></a><div className="hidden items-center gap-6 text-sm text-[#0d1b2a]/55 md:flex"><a className="nav-link active" href="/home">Home</a><a className="nav-link" href="/live">Browse</a><a className="nav-link" href="/home#featured">Featured</a><a className="nav-link" href="/channels?category=music">Music TV</a><a className="nav-link" href="/favorites">My List <span className="ml-1 rounded-full bg-[#0d1b2a]/10 px-1.5 py-0.5 text-[10px] text-[#0d1b2a]/60">{favorites.length}</span></a></div></div><div className="flex items-center gap-3"><div className="relative hidden sm:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0d1b2a]/35" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" className="h-9 w-[210px] rounded-xl border border-white/80 bg-white/45 pl-9 pr-3 text-xs text-[#0d1b2a] outline-none placeholder:text-[#0d1b2a]/35 focus:border-[#fff]" /></div><button className="icon-button" aria-label="Notifications"><Bell size={17} /></button>{isAuthenticated ? <button onClick={() => logout()} className="account-chip"><span className="avatar">{(user?.name || "ME").slice(0, 2).toUpperCase()}</span><span className="hidden lg:inline">{user?.name || "Account"}</span></button> : <button onClick={startLogin} className="nav-login">Sign in</button>}</div></div></nav>
    <div id="top" className="relative z-10 mx-auto max-w-[1440px] px-5 pb-24 pt-8 lg:px-10 lg:pt-12"><section className="hero-grid mb-10 grid gap-7 xl:grid-cols-[1fr_0.72fr] xl:items-end"><div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#13151b] p-7 sm:p-10"><div className="hero-backdrop" style={{ backgroundImage: `linear-gradient(90deg, #13151b 0%, rgba(19,21,27,.92) 30%, rgba(19,21,27,.25) 75%, rgba(19,21,27,.5)), url(${HERO})` }} /><div className="relative z-10 max-w-[600px]"><div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-[#ff8876]"><span className="live-dot" /> Live network · {loading ? "syncing" : "ready"}</div><p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/40">Now streaming</p><h1 className="font-display text-5xl font-bold leading-[.95] tracking-[-0.06em] text-white sm:text-7xl">Live TV.<br /><span className="text-[#cbd9e5]">Made simple.</span></h1><p className="mt-6 max-w-[470px] text-sm leading-7 text-white/55">Browse free channels from around the world, save your favorites, and watch in a focused theater built for live television.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={() => document.getElementById("player")?.scrollIntoView({ behavior: "smooth" })} className="primary-button"><Play size={16} fill="currentColor" /> Watch live</button><button onClick={() => setPlaylistOpen(true)} className="secondary-button"><Plus size={16} /> Add playlist</button></div></div><div className="hero-scanlines" /></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">{[{ icon: Radio, value: channels.length > 100 ? "10k+" : channels.length.toLocaleString(), label: "Channels indexed", accent: "coral" }, { icon: Flag, value: "190+", label: "Countries", accent: "blue" }, { icon: Tv, value: "24/7", label: "Live signals", accent: "violet" }, { icon: Zap, value: "Free", label: "Open sources", accent: "yellow" }].map(({ icon: Icon, value, label, accent }) => <div key={label} className={`stat-card accent-${accent}`}><Icon size={17} className="mb-8 opacity-70" /><p className="font-display text-3xl font-bold tracking-[-0.05em] text-white">{value}</p><p className="mt-1 text-xs text-white/40">{label}</p></div>)}</div></section>
    <section id="player" className="watch-theater mb-14 grid gap-7 xl:grid-cols-[1.35fr_0.65fr]"><div className="theater-heading"><div><p className="eyebrow">Now playing</p><h2 className="section-title">{active.name}</h2></div><span className="status-pill"><span className="live-dot" /> Live channel</span></div><Player channel={active} muted={muted} onMute={() => setMuted((value) => !value)} /><div className="flex flex-col justify-between rounded-[26px] border border-white/10 bg-[#111217] p-5 sm:p-6"><div><div className="mb-5 flex items-center justify-between"><p className="eyebrow">Signal details</p><span className="status-pill"><span className="live-dot" /> HD</span></div><div className="mb-7 flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fb765f] to-[#b83362] font-display text-lg font-bold text-white shadow-lg shadow-[#fb765f]/15">{initials(active.name)}</div><div className="min-w-0"><h2 className="truncate font-display text-2xl font-bold tracking-[-0.03em] text-white">{active.name}</h2><p className="mt-1 text-xs text-white/40">{active.country} · {active.group}</p></div></div>{[["Source", source], ["Language", active.language || "Auto-detected"], ["Format", "HLS · Adaptive"], ["Latency", "Low · 3.2s"]].map(([label, value]) => <div className="detail-row" key={label}><span>{label}</span><strong className={label === "Latency" ? "text-[#71d9ac]" : ""}>{value}</strong></div>)}</div><button onClick={() => toggleFavorite(active)} className={`mt-8 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-xs font-semibold transition ${favorites.includes(active.id) ? "border-[#fb765f]/35 bg-[#fb765f]/10 text-[#ff9b8b]" : "border-white/10 text-white/60 hover:border-white/20 hover:text-white"}`}><Heart size={15} fill={favorites.includes(active.id) ? "currentColor" : "none"} /> {favorites.includes(active.id) ? "In My List" : "Add to My List"}</button></div></section>
    <ChannelRail id="featured" kicker="Handpicked for live viewing" title="Featured channels" channels={featuredChannels} active={active} favorites={favorites} select={select} toggleFavorite={toggleFavorite} /><ChannelRail id="news" kicker="Around the world" title="World news" channels={newsChannels} active={active} favorites={favorites} select={select} toggleFavorite={toggleFavorite} /><ChannelRail id="documentaries" kicker="Explore more" title="Documentaries & nature" channels={documentaryChannels} active={active} favorites={favorites} select={select} toggleFavorite={toggleFavorite} /><section id="live-tv" className="live-tv-panel mb-14"><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Television guide</p><h2 className="section-title">Live TV <span className="section-count">{channels.length.toLocaleString()} signals</span></h2></div><div className="flex gap-2"><button onClick={() => setGroup("All channels")} className="category-pill selected"><LayoutGrid size={14} /> All channels</button><button onClick={() => setGroup("Sports")} className="category-pill">Sports</button><button onClick={() => setGroup("News")} className="category-pill">News</button></div></div><div className="glass-channel-browser"><div className="channel-browser-head"><span>Channel</span><span>Current programme</span><span>Progress</span><span>Next programme</span><span>Status</span></div><div className="channel-rows">{visible.slice(0, 12).map((channel, index) => <ChannelRow key={channel.id} channel={channel} index={index} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div></div><div className="mt-5 flex items-center justify-between"><div><p className="eyebrow">Electronic programme guide</p><h3 className="mt-1 font-display text-xl font-bold text-[#0d1b2a]">On now & next</h3></div><span className="source-badge">Live timeline</span></div><EpgStrip channels={visible} select={select} /></section>
    <section id="music-tv" className="mb-14"><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Music television</p><h2 className="section-title">Music TV <span className="section-count">{musicChannels.length} feeds</span></h2><p className="mt-2 max-w-2xl text-sm text-white/50">Trace, MTV, Stingray, Qmusic, Totalmusic and other publicly listed music feeds. Availability can vary by region and provider.</p></div><button onClick={() => { setGroup("Music TV"); document.getElementById("channels")?.scrollIntoView({ behavior: "smooth" }); }} className="secondary-button compact">Browse Music TV <ArrowRight size={14} /></button></div>{musicChannels.length ? <div className="music-rail scrollbar-none grid grid-flow-col auto-cols-[190px] gap-4 overflow-x-auto pb-3 sm:auto-cols-[220px]">{musicChannels.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div> : <div className="empty-shelf"><Radio size={21} /><p>No music feeds loaded</p><span>Use Playlist tools to add a provider M3U.</span></div>}<div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/50"><strong className="text-white/80">Channel O note:</strong> Channel O is not currently present as a verified public stream in the IPTV-Org catalog. Add a licensed/provider M3U in Playlist tools when you have an authorized source.</div></section><section id="my-list" className="mb-14"><div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">Personal shelf</p><h2 className="section-title">My List <span className="section-count">{saved.length || "—"}</span></h2></div><button onClick={() => { setGroup("All channels"); setQuery(""); document.getElementById("channels")?.scrollIntoView({ behavior: "smooth" }); }} className="text-xs font-semibold text-white/45 transition hover:text-white">Browse all <ArrowRight size={14} className="ml-1 inline" /></button></div>{saved.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{saved.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div> : <div className="empty-shelf"><Heart size={21} /><p>Your list is empty</p><span>Heart a channel to keep it close.</span></div>}</section>
    <section id="channels"><div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Open signal directory</p><div className="flex items-center gap-3"><h2 className="section-title">Live channels</h2><span className="source-badge"><Check size={12} /> {source}</span></div></div><div className="flex items-center gap-2"><button onClick={() => setPlaylistOpen(true)} className="secondary-button compact"><ListFilter size={14} /> Playlist tools</button><div className="relative sm:hidden"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-[130px] rounded-xl border border-white/10 bg-white/[0.04] pl-8 pr-3 text-xs text-white outline-none" /></div></div></div><div className="scrollbar-none mb-7 flex gap-2 overflow-x-auto pb-1">{groups.map((item) => <button key={item} onClick={() => setGroup(item)} className={`category-pill ${group === item ? "selected" : ""}`}>{item === "All channels" && <LayoutGrid size={14} />}{item}</button>)}</div>{visible.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visible.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div> : <div className="empty-shelf"><Search size={21} /><p>No channels found</p><span>Try another search or category.</span></div>}</section>
    <footer className="mt-20 flex flex-col gap-4 border-t border-white/8 pt-6 text-xs text-white/30 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="brand-mark small"><Tv size={13} /></span><span>StreamBox IPTV</span><span className="mx-1">·</span><span>Built for public streams</span></div><div className="flex gap-5"><a href="https://www.iptv.tools" target="_blank" rel="noreferrer" className="transition hover:text-white">IPTV.tools <ExternalLink size={11} className="ml-1 inline" /></a><a href="https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md" target="_blank" rel="noreferrer" className="transition hover:text-white">Playlist docs <ExternalLink size={11} className="ml-1 inline" /></a><button onClick={() => toast("Use Playlist tools to connect another public M3U source", { icon: <CircleHelp size={15} /> })} className="transition hover:text-white">Help</button></div></footer></div>
    {playlistOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"><div className="w-full max-w-[560px] rounded-[26px] border border-white/10 bg-[#17181e] p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="eyebrow">Connect a source</p><h2 className="mt-1 font-display text-2xl font-bold text-white">Playlist tools</h2><p className="mt-2 text-sm leading-6 text-white/45">Load a public M3U playlist. The IPTV-Org indexes are ready to use, or paste your own URL.</p></div><button onClick={() => setPlaylistOpen(false)} className="text-white/40 hover:text-white"><X size={18} /></button></div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-white/45">M3U playlist URL</label><div className="flex gap-2"><input value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-[#fb765f]/60" /><button onClick={loadPlaylist} className="primary-button shrink-0 px-4">{loading ? "Loading" : "Load"}</button></div><div className="mt-5 grid grid-cols-2 gap-2">{[["All channels", PLAYLISTS.all, Radio], ["By country", PLAYLISTS.country, Flag], ["By category", PLAYLISTS.category, Film], ["By language", PLAYLISTS.language, Menu]].map(([label, url, Icon]) => <button key={label as string} onClick={() => setPlaylistUrl(url as string)} className="source-option"><Icon size={14} /> {label as string}</button>)}</div><div className="mt-6 rounded-xl border border-[#fb765f]/15 bg-[#fb765f]/[0.05] p-3 text-xs leading-5 text-white/50"><strong className="text-[#ff9b8b]">Good to know:</strong> Stream availability depends on each public provider. A channel can be listed yet temporarily offline; use the catalog to switch signals instantly.</div></div></div>}
    <WatchRoomPanel open={roomOpen} onClose={() => setRoomOpen(false)} activeChannel={{ id: active.id, name: active.name, url: active.url }} onRemotePlayback={applyRoomPlayback} />
    {!roomOpen && <button onClick={() => setRoomOpen(true)} className="watch-room-trigger"><Users size={15} /> Watch together</button>}
    <Remote open={remoteOpen} toggle={() => setRemoteOpen((value) => !value)} move={move} playPause={() => window.dispatchEvent(new Event("streambox:toggle"))} volume={(direction) => { setMuted(direction === "down"); toast(direction === "down" ? "Muted" : "Audio on", { icon: <Volume2 size={14} /> }); }} />
  </main>;
}

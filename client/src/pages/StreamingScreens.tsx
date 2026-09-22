import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Heart, Play, Search, Settings, Tv, Users } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { featuredFallback, musicFallback, type Channel } from "./Home";
import { useAuth } from "@/_core/hooks/useAuth";

const allSeedChannels = [...featuredFallback, ...musicFallback];

function AppNav() {
  const [location] = useLocation();
  const items = [["/home", "Home"], ["/live", "Live TV"], ["/channels", "Channels"], ["/movies", "Movies"], ["/series", "Series"], ["/sports", "Sports"], ["/news", "News"]];
  return <header className="streaming-nav"><Link href="/home" className="streaming-brand"><span className="brand-mark"><Tv size={18} /></span><span>NOVA IPTV</span></Link><nav>{items.map(([href, label]) => <Link key={href} href={href} className={location === href ? "active" : ""}>{label}</Link>)}</nav><div className="streaming-nav-actions"><Link href="/search" aria-label="Search"><Search size={17} /></Link><Link href="/favorites" aria-label="Favorites"><Heart size={17} /></Link><Link href="/profile" aria-label="Profile"><span className="mini-avatar">JD</span></Link></div></header>;
}

function MiniCard({ channel }: { channel: Channel }) {
  return <Link href={`/channels/${channel.id}`} className="screen-card"><div className="screen-card-art" style={{ backgroundImage: `linear-gradient(135deg,rgba(8,10,14,.1),rgba(8,10,14,.92)),url(${channel.logo || "/manus-storage/streambox-hero_862f6368.jpeg"})` }}><span className="screen-card-live">LIVE</span>{channel.logo && <img src={channel.logo} alt="" />}</div><strong>{channel.name}</strong><small>{channel.country} · {channel.group}</small></Link>;
}

function HomeRail({ title, href, channels }: { title: string; href: string; channels: Channel[] }) {
  return <section className="streaming-home-rail"><div className="streaming-home-rail-head"><h2>{title}</h2><Link href={href}>See all <ArrowRight size={14} /></Link></div><div className="streaming-home-rail-track">{channels.map((channel) => <MiniCard key={channel.id} channel={channel} />)}</div></section>;
}

export function StreamingHome() {
  return <main className="streaming-app"><AppNav /><div className="streaming-home"><section className="streaming-home-hero"><div className="streaming-home-hero-copy"><p className="eyebrow">Live network · ready</p><h1>Live TV.<br /><span>Made simple.</span></h1><p>Browse public channels from around the world, save favorites, and start watching in one focused theater.</p><div className="detail-actions"><Link href="/live" className="primary-button"><Play size={16} fill="currentColor" /> Watch live</Link><Link href="/channels" className="secondary-button">Browse channels</Link></div></div></section><HomeRail title="Featured live" href="/channels" channels={featuredFallback} /><HomeRail title="World news" href="/news" channels={newsChannels} /><HomeRail title="Music TV" href="/channels?category=music" channels={musicChannels.slice(0, 8)} /><HomeRail title="Documentaries & nature" href="/channels" channels={documentaryChannels} /></div></main>;
}

export function ProfileSelector() {
  const [, navigate] = useLocation();
  const profiles = [{ name: "Jordan", initials: "JD", color: "#e50914" }, { name: "Family", initials: "FM", color: "#2b6cb0" }, { name: "Kids", initials: "KI", color: "#7c3aed" }];
  const enter = (name: string) => { localStorage.setItem("nova-active-profile", name); navigate("/home"); };
  return <main className="profile-selector"><div className="profile-brand"><span className="brand-mark"><Tv size={21} /></span><b>NOVA IPTV</b></div><div className="profile-center"><h1>Who's watching?</h1><div className="profile-grid">{profiles.map((profile) => <button key={profile.name} onClick={() => enter(profile.name)} className="profile-card"><span className="profile-avatar" style={{ background: profile.color }}>{profile.initials}</span><strong>{profile.name}</strong></button>)}</div><div className="profile-actions"><button className="profile-manage"><Settings size={15} /> Manage Profiles</button><button className="profile-add"><Users size={15} /> Add Profile</button></div></div></main>;
}

export function BrowseScreen({ title, kicker, channels = allSeedChannels }: { title: string; kicker: string; channels?: Channel[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => channels.filter((channel) => `${channel.name} ${channel.country} ${channel.group}`.toLowerCase().includes(query.toLowerCase())).slice(0, 48), [channels, query]);
  return <main className="streaming-app"><AppNav /><div className="screen-wrap"><div className="screen-head"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1></div><div className="screen-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} /></div></div><div className="screen-filters"><button className="active">All</button><button>Favorites</button><button>News</button><button>Sports</button><button>Music</button><button>Documentary</button><button>International</button></div>{filtered.length ? <div className="screen-grid">{filtered.map((channel) => <MiniCard key={channel.id} channel={channel} />)}</div> : <div className="screen-empty"><Search size={22} /><h2>No results</h2><p>Try another search or connect a different public playlist.</p></div>}</div></main>;
}

export function ChannelDetail() {
  const [, params] = useRoute("/channels/:channelId");
  const channel = allSeedChannels.find((item) => item.id === params?.channelId) || allSeedChannels[0];
  return <main className="streaming-app"><AppNav /><div className="detail-screen"><Link href="/channels" className="back-link"><ArrowLeft size={15} /> Back to channels</Link><div className="detail-layout"><div className="detail-art" style={{ backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.12)),url(${channel.logo || "/manus-storage/streambox-hero_862f6368.jpeg"})` }}><span className="detail-logo">{channel.logo ? <img src={channel.logo} alt="" /> : channel.name.slice(0, 2)}</span></div><div className="detail-copy"><span className="screen-card-live">LIVE</span><h1>{channel.name}</h1><p>{channel.country} · {channel.group} · {channel.language || "Live stream"}</p><p className="detail-description">Watch this public live channel in the NOVA theater player. Availability may vary by provider, region, or time of day.</p><div className="detail-actions"><Link href={`/watch/${channel.id}`} className="primary-button"><Play size={16} fill="currentColor" /> Watch live</Link><button className="secondary-button"><Heart size={16} /> Add to favorites</button></div><div className="detail-schedule"><h3>Now & next</h3><div><b>Live broadcast</b><span>Now · {channel.group}</span></div><div><b>Next programme</b><span>Coming up</span></div></div></div></div></div></main>;
}

export function WatchScreen() {
  const [, params] = useRoute("/watch/:contentId");
  const channel = allSeedChannels.find((item) => item.id === params?.contentId) || allSeedChannels[0];
  return <main className="streaming-app"><AppNav /><div className="watch-screen"><Link href={`/channels/${channel.id}`} className="back-link"><ArrowLeft size={15} /> Back to channel</Link><div className="watch-video-shell"><video src={channel.url} controls autoPlay playsInline className="watch-video" /><div className="watch-video-overlay"><span className="screen-card-live">LIVE</span><h1>{channel.name}</h1><p>{channel.country} · {channel.group}</p></div></div><div className="watch-meta"><div><p className="eyebrow">Live now</p><h2>{channel.name}</h2><p>{channel.group} · {channel.language || "Live stream"}</p></div><button className="secondary-button"><Heart size={16} /> Add to favorites</button></div></div></main>;
}

export function FavoritesScreen() {
  const { user } = useAuth();
  const saved = useMemo(() => { if (!user?.openId) return []; try { return JSON.parse(localStorage.getItem(`nova-favorites-${user.openId}`) || "[]") as string[]; } catch { return []; } }, [user?.openId]);
  const favorites = allSeedChannels.filter((channel) => saved.includes(channel.id));
  return <main className="streaming-app"><AppNav /><div className="screen-wrap"><p className="eyebrow">Your library</p><h1>Favorites</h1>{favorites.length ? <div className="screen-grid favorites-grid">{favorites.map((channel) => <MiniCard key={channel.id} channel={channel} />)}</div> : <div className="screen-empty"><Heart size={22} /><h2>Your list is empty</h2><p>Sign in and use the heart button on any channel to keep it here.</p><Link href="/channels" className="primary-button">Browse channels</Link></div>}</div></main>;
}

export function PlaceholderScreen({ title, kicker }: { title: string; kicker: string }) { return <main className="streaming-app"><AppNav /><div className="screen-wrap"><p className="eyebrow">{kicker}</p><h1>{title}</h1><div className="screen-empty"><Tv size={22} /><h2>Ready for your library</h2><p>This dedicated screen is ready for movies, series, sports, or guide data from your connected sources.</p><Link href="/channels" className="primary-button"><ArrowRight size={15} /> Browse live channels</Link></div></div></main>; }

export const musicChannels = musicFallback;
export const newsChannels = featuredFallback.filter((channel) => channel.group === "News");
export const documentaryChannels = featuredFallback.filter((channel) => channel.group === "Documentary");

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  House,
  LayoutGrid,
  Play,
  RadioTower,
  Search,
  Settings,
  Tv,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { featuredFallback, musicFallback, parseM3U, type Channel } from "./Home";

const BRAND_LOGO = "/manus-storage/wonderbox-logo-clean_4a0b7be4.png";
const CURRENT_CHANNEL_KEY = "wonderbox-current-channel";
const allSeedChannels = [...featuredFallback, ...musicFallback];
let worldCatalogCache: Channel[] | null = null;
let worldCatalogRequest: Promise<Channel[]> | null = null;

function favoriteKey(openId: string) {
  return `nova-favorites-${openId}`;
}

function readFavoriteIds(openId?: string | null) {
  if (!openId || typeof window === "undefined") return [] as string[];
  try {
    return JSON.parse(localStorage.getItem(favoriteKey(openId)) || "[]") as string[];
  } catch {
    return [] as string[];
  }
}

function persistChannel(channel: Channel) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CURRENT_CHANNEL_KEY, JSON.stringify(channel));
}

function readPersistedChannel() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(sessionStorage.getItem(CURRENT_CHANNEL_KEY) || "null") as Channel | null;
  } catch {
    return null;
  }
}

async function loadWorldCatalog() {
  if (worldCatalogCache) return worldCatalogCache;
  if (!worldCatalogRequest) {
    worldCatalogRequest = fetch("https://iptv-org.github.io/iptv/index.m3u")
      .then((response) => {
        if (!response.ok) throw new Error("Playlist unavailable");
        return response.text();
      })
      .then((raw) => {
        const parsed = parseM3U(raw);
        const names = new Set(allSeedChannels.map((channel) => channel.name.toLowerCase()));
        worldCatalogCache = [
          ...allSeedChannels,
          ...parsed.filter((channel) => !names.has(channel.name.toLowerCase())),
        ];
        return worldCatalogCache;
      })
      .catch(() => allSeedChannels)
      .finally(() => {
        worldCatalogRequest = null;
      });
  }
  return worldCatalogRequest;
}

function useWorldCatalog(initialChannels: Channel[] = allSeedChannels) {
  const [catalog, setCatalog] = useState<Channel[]>(worldCatalogCache || initialChannels);
  const [loading, setLoading] = useState(!worldCatalogCache);
  useEffect(() => {
    let active = true;
    loadWorldCatalog().then((channels) => {
      if (active) setCatalog(channels);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return { catalog, loading };
}

function useChannelFromRoute(id?: string) {
  const seed = allSeedChannels.find((channel) => channel.id === id);
  const persisted = readPersistedChannel();
  const [channel, setChannel] = useState<Channel | null>(
    seed || (persisted?.id === id ? persisted : null),
  );
  useEffect(() => {
    if (!id || channel) return;
    let active = true;
    loadWorldCatalog().then((channels) => {
      const found = channels.find((item) => item.id === id);
      if (active && found) {
        setChannel(found);
        persistChannel(found);
      }
    });
    return () => {
      active = false;
    };
  }, [channel, id]);
  return channel || allSeedChannels[0];
}

function AppNav() {
  const [location] = useLocation();
  const items = [
    ["/home", "Home"],
    ["/live", "Live TV"],
    ["/channels", "Channels"],
    ["/movies", "Movies"],
    ["/series", "Series"],
    ["/sports", "Sports"],
    ["/news", "News"],
  ];
  const mobileItems = [
    ["/home", "Home", House],
    ["/live", "Live", RadioTower],
    ["/channels", "Channels", LayoutGrid],
    ["/favorites", "Saved", Heart],
    ["/profile", "Profile", UserRound],
  ] as const;
  return <>
    <header className="streaming-nav">
      <Link href="/home" className="streaming-brand">
        <span className="brand-lockup"><img src={BRAND_LOGO} alt="WONDERBOX" /></span>
      </Link>
      <nav>{items.map(([href, label]) => <Link key={href} href={href} className={location === href ? "active" : ""}>{label}</Link>)}</nav>
      <div className="streaming-nav-actions">
        <Link href="/search" aria-label="Search"><Search size={17} /></Link>
        <Link href="/favorites" aria-label="Favorites"><Heart size={17} /></Link>
        <Link href="/profile" aria-label="Profile"><span className="mini-avatar">JD</span></Link>
      </div>
    </header>
    <nav className="mobile-tabbar" aria-label="Mobile navigation">
      {mobileItems.map(([href, label, Icon]) => <Link key={href} href={href} className={location === href ? "active" : ""}><Icon size={18} /><span>{label}</span></Link>)}
    </nav>
  </>;
}

function MiniCard({ channel }: { channel: Channel }) {
  return <Link href={`/channels/${channel.id}`} onClick={() => persistChannel(channel)} className="screen-card">
    <div className="screen-card-art" style={{ backgroundImage: `linear-gradient(135deg,rgba(8,10,14,.1),rgba(8,10,14,.92)),url(${channel.logo || "/manus-storage/streambox-hero_862f6368.jpeg"})` }}>
      <span className="screen-card-live">LIVE</span>
      {channel.logo && <img src={channel.logo} alt="" />}
    </div>
    <strong>{channel.name}</strong>
    <small>{channel.country} · {channel.group}</small>
  </Link>;
}

function HomeRail({ title, href, channels }: { title: string; href: string; channels: Channel[] }) {
  return <section className="streaming-home-rail">
    <div className="streaming-home-rail-head"><h2>{title}</h2><Link href={href}>See all <ArrowRight size={14} /></Link></div>
    <div className="streaming-home-rail-track">{channels.map((channel) => <MiniCard key={channel.id} channel={channel} />)}</div>
  </section>;
}

export function StreamingHome() {
  return <main className="streaming-app"><AppNav /><div className="streaming-home">
    <section className="streaming-home-hero"><div className="streaming-home-hero-copy">
      <p className="eyebrow">Live network · ready</p>
      <h1>Live TV.<br /><span>Made simple.</span></h1>
      <p>Browse public channels from around the world, save favorites, and start watching in one focused theater.</p>
      <div className="detail-actions"><Link href="/live" className="primary-button"><Play size={16} fill="currentColor" /> Watch live</Link><Link href="/channels" className="secondary-button">Browse channels</Link></div>
    </div></section>
    <HomeRail title="Featured live" href="/channels" channels={featuredFallback} />
    <HomeRail title="World news" href="/news" channels={newsChannels} />
    <HomeRail title="Music TV" href="/channels?category=music" channels={musicChannels.slice(0, 8)} />
    <HomeRail title="Documentaries & nature" href="/channels?category=documentary" channels={documentaryChannels} />
  </div></main>;
}

export function ProfileSelector() {
  const [, navigate] = useLocation();
  const [profiles, setProfiles] = useState([
    { name: "Jordan", initials: "JD", color: "#e50914" },
    { name: "Family", initials: "FM", color: "#2b6cb0" },
    { name: "Kids", initials: "KI", color: "#7c3aed" },
  ]);
  const [managing, setManaging] = useState(false);
  const enter = (name: string) => {
    localStorage.setItem("wonderbox-active-profile", name);
    navigate("/home");
  };
  return <main className="profile-selector">
    <div className="profile-brand"><span className="profile-logo"><img src={BRAND_LOGO} alt="WONDERBOX" /></span></div>
    <div className="profile-center"><h1>Who's watching?</h1>
      <div className="profile-grid">{profiles.map((profile) => <button key={profile.name} onClick={() => enter(profile.name)} className="profile-card"><span className="profile-avatar" style={{ background: profile.color }}>{profile.initials}</span><strong>{profile.name}</strong>{managing && <small>Choose profile</small>}</button>)}</div>
      <div className="profile-actions"><button onClick={() => setManaging((value) => !value)} className="profile-manage"><Settings size={15} /> {managing ? "Done" : "Manage Profiles"}</button><button onClick={() => setProfiles((current) => [...current, { name: `Guest ${current.length - 2}`, initials: "GU", color: "#0f766e" }])} className="profile-add"><Users size={15} /> Add Profile</button></div>
    </div>
  </main>;
}

export function BrowseScreen({ title, kicker }: { title: string; kicker: string }) {
  const { user } = useAuth();
  const { catalog, loading } = useWorldCatalog();
  const initialCategory = useMemo(() => {
    if (title === "World news") return "News";
    if (title === "Sports") return "Sports";
    if (typeof window === "undefined") return "All";
    const value = new URLSearchParams(window.location.search).get("category");
    return value ? `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}` : "All";
  }, [title]);
  const [query, setQuery] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("search") || "");
  const [category, setCategory] = useState(initialCategory);
  const savedIds = readFavoriteIds(user?.openId);
  const filtered = useMemo(() => catalog.filter((channel) => {
    const group = channel.group.toLowerCase();
    const matchesCategory = category === "All"
      || (category === "Favorites" ? savedIds.includes(channel.id)
        : category === "International" ? channel.country === "International"
          : group.includes(category.toLowerCase()));
    const matchesQuery = `${channel.name} ${channel.country} ${channel.group}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }).slice(0, 120), [catalog, category, query, savedIds]);
  const filters = ["All", "Favorites", "News", "Sports", "Entertainment", "Movies", "Music", "Kids", "Documentary", "International"];
  return <main className="streaming-app"><AppNav /><div className="screen-wrap">
    <div className="screen-head"><div><p className="eyebrow">{kicker}</p><h1>{title}</h1><span className="catalog-status">{loading ? "Syncing worldwide catalog…" : `${catalog.length.toLocaleString()} channels available`}</span></div><div className="screen-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} /></div></div>
    <div className="screen-filters">{filters.map((filter) => <button key={filter} onClick={() => setCategory(filter)} className={category === filter ? "active" : ""}>{filter}</button>)}</div>
    {filtered.length ? <div className="screen-grid">{filtered.map((channel) => <MiniCard key={channel.id} channel={channel} />)}</div> : <div className="screen-empty"><Search size={22} /><h2>No results</h2><p>{category === "Favorites" && !user ? "Sign in to see your saved channels." : "Try another search or category."}</p></div>}
  </div></main>;
}

function useFavorite(channel: Channel) {
  const { user, isAuthenticated } = useAuth();
  const [favorite, setFavorite] = useState(false);
  useEffect(() => {
    setFavorite(readFavoriteIds(user?.openId).includes(channel.id));
  }, [channel.id, user?.openId]);
  const toggle = () => {
    if (!isAuthenticated || !user?.openId) {
      toast("Sign in to save this channel");
      startLogin();
      return;
    }
    const current = readFavoriteIds(user.openId);
    const next = current.includes(channel.id) ? current.filter((id) => id !== channel.id) : [...current, channel.id];
    localStorage.setItem(favoriteKey(user.openId), JSON.stringify(next));
    setFavorite(next.includes(channel.id));
    toast(next.includes(channel.id) ? "Added to favorites" : "Removed from favorites");
  };
  return { favorite, toggle };
}

export function ChannelDetail() {
  const [, params] = useRoute("/channels/:channelId");
  const channel = useChannelFromRoute(params?.channelId);
  const { favorite, toggle } = useFavorite(channel);
  return <main className="streaming-app"><AppNav /><div className="detail-screen">
    <Link href="/channels" className="back-link"><ArrowLeft size={15} /> Back to channels</Link>
    <div className="detail-layout"><div className="detail-art" style={{ backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.12)),url(${channel.logo || "/manus-storage/streambox-hero_862f6368.jpeg"})` }}><span className="detail-logo">{channel.logo ? <img src={channel.logo} alt="" /> : channel.name.slice(0, 2)}</span></div>
      <div className="detail-copy"><span className="screen-card-live">LIVE</span><h1>{channel.name}</h1><p>{channel.country} · {channel.group} · {channel.language || "Live stream"}</p><p className="detail-description">Watch this public live channel in the WONDERBOX theater player. Availability may vary by provider, region, or time of day.</p>
        <div className="detail-actions"><Link href={`/watch/${channel.id}`} onClick={() => persistChannel(channel)} className="primary-button"><Play size={16} fill="currentColor" /> Watch live</Link><button onClick={toggle} className="secondary-button"><Heart size={16} fill={favorite ? "currentColor" : "none"} /> {favorite ? "Saved" : "Add to favorites"}</button></div>
        <div className="detail-schedule"><h3>Now & next</h3><div><b>Live broadcast</b><span>Now · {channel.group}</span></div><div><b>Next programme</b><span>Coming up</span></div></div>
      </div>
    </div>
  </div></main>;
}

export function WatchScreen() {
  const [, params] = useRoute("/watch/:contentId");
  const channel = useChannelFromRoute(params?.contentId);
  const { favorite, toggle } = useFavorite(channel);
  return <main className="streaming-app"><AppNav /><div className="watch-screen">
    <Link href={`/channels/${channel.id}`} onClick={() => persistChannel(channel)} className="back-link"><ArrowLeft size={15} /> Back to channel</Link>
    <div className="watch-video-shell"><video src={channel.url} controls autoPlay playsInline className="watch-video" /><div className="watch-video-overlay"><span className="screen-card-live">LIVE</span><h1>{channel.name}</h1><p>{channel.country} · {channel.group}</p></div></div>
    <div className="watch-meta"><div><p className="eyebrow">Live now</p><h2>{channel.name}</h2><p>{channel.group} · {channel.language || "Live stream"}</p></div><button onClick={toggle} className="secondary-button"><Heart size={16} fill={favorite ? "currentColor" : "none"} /> {favorite ? "Saved" : "Add to favorites"}</button></div>
  </div></main>;
}

export function FavoritesScreen() {
  const { user, isAuthenticated } = useAuth();
  const { catalog, loading } = useWorldCatalog();
  const saved = readFavoriteIds(user?.openId);
  const favorites = catalog.filter((channel) => saved.includes(channel.id));
  return <main className="streaming-app"><AppNav /><div className="screen-wrap"><p className="eyebrow">Your library</p><h1>Favorites</h1>
    {loading ? <div className="screen-empty"><p>Loading your channels…</p></div> : favorites.length ? <div className="screen-grid favorites-grid">{favorites.map((channel) => <MiniCard key={channel.id} channel={channel} />)}</div> : <div className="screen-empty"><Heart size={22} /><h2>Your list is empty</h2><p>{isAuthenticated ? "Use the heart button on any channel to keep it here." : "Sign in to save channels across sessions."}</p>{isAuthenticated ? <Link href="/channels" className="primary-button">Browse channels</Link> : <button onClick={startLogin} className="primary-button">Sign in</button>}</div>}
  </div></main>;
}

export function PlaceholderScreen({ title, kicker }: { title: string; kicker: string }) {
  return <main className="streaming-app"><AppNav /><div className="screen-wrap"><p className="eyebrow">{kicker}</p><h1>{title}</h1><div className="screen-empty"><Tv size={22} /><h2>Ready for your library</h2><p>This dedicated screen is ready for movies, series, sports, or guide data from your connected sources.</p><Link href="/channels" className="primary-button"><ArrowRight size={15} /> Browse live channels</Link></div></div></main>;
}

export const musicChannels = musicFallback;
export const newsChannels = featuredFallback.filter((channel) => channel.group === "News");
export const documentaryChannels = featuredFallback.filter((channel) => channel.group === "Documentary");

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Compass,
  Crown,
  Film,
  Heart,
  Home,
  LayoutGrid,
  Music2,
  Newspaper,
  RadioTower,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";
import AdvancedPlayer from "@/components/AdvancedPlayer";
import WatchEngagement from "@/components/WatchEngagement";
import WatchRoomPanel from "@/components/WatchRoomPanel";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { featuredFallback, musicFallback, parseM3U, type Channel } from "./Home";

const LOGO = "/manus-storage/wonderbox-logo-clean_4a0b7be4.png";
const CURRENT_CHANNEL_KEY = "wonderbox-current-channel";
const seeds = [...featuredFallback, ...musicFallback];

function readCurrentChannel() {
  try { return JSON.parse(sessionStorage.getItem(CURRENT_CHANNEL_KEY) || "null") as Channel | null; } catch { return null; }
}

function saveCurrentChannel(channel: Channel) {
  sessionStorage.setItem(CURRENT_CHANNEL_KEY, JSON.stringify(channel));
}

function useWatchChannel(id?: string) {
  const stored = readCurrentChannel();
  const seed = seeds.find((channel) => channel.id === id);
  const [channel, setChannel] = useState<Channel>(seed || (stored && stored.id === id ? stored : seeds[0]!));
  useEffect(() => {
    if (!id || channel.id === id) return;
    let active = true;
    fetch("https://iptv-org.github.io/iptv/index.m3u").then((response) => response.text()).then(parseM3U).then((catalog) => {
      const found = catalog.find((item) => item.id === id);
      if (active && found) { setChannel(found); saveCurrentChannel(found); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [channel.id, id]);
  return channel;
}

function PricingOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAuthenticated } = useAuth();
  const plans = trpc.membership.plans.useQuery();
  const membership = trpc.membership.current.useQuery();
  if (!open) return null;
  const choose = (plan: string) => {
    if (plan === "free") { onClose(); return; }
    if (!isAuthenticated) { startLogin(); return; }
    toast("Secure checkout is ready for billing connection. Stripe is not enabled yet.");
  };
  return <div className="pricing-backdrop" role="dialog" aria-modal="true" aria-label="WONDERBOX plans"><div className="pricing-dialog">
    <button className="pricing-close" onClick={onClose}>Close</button>
    <p className="eyebrow">One month on us</p><h2>Choose your picture quality</h2><p className="pricing-intro">New signed-in members receive 30 days of Plus. After the trial, accounts return to Free unless a paid plan is activated.</p>
    <div className="pricing-grid">{plans.data?.map((plan) => <article key={plan.id} className={plan.id === "plus" ? "featured" : ""}>{plan.id === "plus" && <span className="plan-popular">Most popular</span>}<h3>{plan.name}</h3><strong>{plan.monthlyUsd ? `$${plan.monthlyUsd}` : "$0"}<small>/month</small></strong><ul><li><ShieldCheck size={15} /> {plan.quality}</li><li><UserRound size={15} /> {plan.devices} simultaneous device{plan.devices > 1 ? "s" : ""}</li><li><Sparkles size={15} /> {plan.trialDays ? `${plan.trialDays}-day trial` : "No trial"}</li></ul><button onClick={() => choose(plan.id)}>{membership.data?.effectivePlan === plan.id ? "Current plan" : plan.id === "free" ? "Use Free" : "Choose plan"}</button></article>)}</div>
    <p className="billing-note">Checkout is intentionally disabled until a billing account is connected. No subscription is created by this preview.</p>
  </div></div>;
}

const categories = [
  ["/home", "Home", Home],
  ["/live", "All live", RadioTower],
  ["/channels", "Channels", LayoutGrid],
  ["/news", "News", Newspaper],
  ["/channels?category=music", "Music", Music2],
  ["/sports", "Sports", Trophy],
  ["/channels?category=movies", "Movies", Film],
  ["/channels?category=kids", "Kids", Sparkles],
  ["/channels?category=documentary", "Documentary", Compass],
  ["/favorites", "Favorites", Heart],
] as const;

export default function WatchPage() {
  const [, params] = useRoute("/watch/:contentId");
  const [, navigate] = useLocation();
  const channel = useWatchChannel(params?.contentId);
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roomOpen, setRoomOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [recommendationFilter, setRecommendationFilter] = useState("All");
  const membership = trpc.membership.current.useQuery();
  const quality = membership.data?.maxQuality || "SD 360p";
  const maxHeight = quality.startsWith("4K") ? 2160 : quality.startsWith("Full") ? 1080 : 360;
  const recommendationFilters = ["All", channel.group, "Music"];
  const recommendations = useMemo(() => seeds.filter((item) => item.id !== channel.id && (recommendationFilter === "All" || item.group.toLowerCase().includes(recommendationFilter.toLowerCase()))).slice(0, 10), [channel.id, recommendationFilter]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (search.trim()) navigate(`/channels?search=${encodeURIComponent(search.trim())}`);
  };

  return <main className="watch-app">
    <header className="watch-topbar">
      <Link href="/home" className="watch-brand"><img src={LOGO} alt="WONDERBOX" /></Link>
      <form className="watch-search" onSubmit={submitSearch}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search channels, topics, countries…" /><button aria-label="Search"><Search size={18} /></button></form>
      <div className="watch-top-actions"><Link href="/favorites" aria-label="Favorites"><Heart size={18} /></Link><button aria-label="Notifications"><Bell size={18} /></button><Link href="/profile" className="watch-user">{(user?.name || "JD").slice(0, 2).toUpperCase()}</Link></div>
    </header>

    <div className="watch-page-grid">
      <aside className="watch-sidebar"><nav>{categories.map(([href, label, Icon], index) => <Link href={href} key={href} className={index === 1 ? "active" : ""}><Icon size={18} /><span>{label}</span></Link>)}</nav><div className="sidebar-divider" /><Link href="/pricing"><Crown size={18} /><span>Plans</span></Link>{user?.role === "admin" && <Link href="/admin/shares"><BarChart3 size={18} /><span>Share analytics</span></Link>}<Link href="/settings"><Settings size={18} /><span>Settings</span></Link></aside>

      <section className="watch-primary">
        <AdvancedPlayer channel={channel} maxHeight={maxHeight} qualityLabel={quality} />
        <div className="watch-title-row"><div><div className="watch-topic"><span className="live-pulse" /> Live · {channel.group}</div><h1>{channel.name}</h1><p>{channel.country} · {channel.language || "Live stream"} · Public provider feed</p></div>{membership.data?.trialActive && <button className="trial-chip" onClick={() => setPricingOpen(true)}><Crown size={15} /> Plus trial · {membership.data.trialDaysRemaining} days left</button>}</div>
        <WatchEngagement channel={channel} onOpenRoom={() => setRoomOpen(true)} onOpenPricing={() => setPricingOpen(true)} />
      </section>

      <aside className="watch-recommendations"><div className="recommendation-head"><h2>Up next</h2><Link href="/channels">View all</Link></div><div className="recommendation-filters">{recommendationFilters.map((filter) => <button key={filter} onClick={() => setRecommendationFilter(filter)} className={recommendationFilter === filter ? "active" : ""}>{filter}</button>)}</div>{recommendations.length ? recommendations.map((item) => <Link href={`/watch/${item.id}`} onClick={() => saveCurrentChannel(item)} key={item.id} className="recommendation-card"><div style={{ backgroundImage: `linear-gradient(135deg,rgba(5,9,15,.1),rgba(5,9,15,.75)),url(${item.logo || "/manus-storage/streambox-hero_862f6368.jpeg"})` }}>{item.logo && <img src={item.logo} alt="" />}<span>LIVE</span></div><section><strong>{item.name}</strong><small>{item.country}</small><small>{item.group}</small></section></Link>) : <div className="recommendation-empty">No matching channels in this rail.</div>}</aside>
    </div>

    <WatchRoomPanel open={roomOpen} onClose={() => setRoomOpen(false)} activeChannel={{ id: channel.id, name: channel.name, url: channel.url }} onRemotePlayback={(playback) => { if (playback?.channelId && playback.channelId !== channel.id) navigate(`/watch/${playback.channelId}`); }} />
    <PricingOverlay open={pricingOpen} onClose={() => setPricingOpen(false)} />
  </main>;
}

export function PricingScreen() {
  const [, navigate] = useLocation();
  return <main className="standalone-pricing"><Link href="/home" className="pricing-brand"><img src={LOGO} alt="WONDERBOX" /></Link><PricingOverlay open onClose={() => navigate("/home")} /></main>;
}

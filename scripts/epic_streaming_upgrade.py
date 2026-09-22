from pathlib import Path

path = Path('/home/ubuntu/streambox-iptv/client/src/pages/Home.tsx')
text = path.read_text()

text = text.replace('import WatchRoomPanel from "@/components/WatchRoomPanel";', 'import WatchRoomPanel from "@/components/WatchRoomPanel";\nimport { startLogin } from "@/const";\nimport { useAuth } from "@/_core/hooks/useAuth";')

featured_block = '''const featuredFallback: Channel[] = [
  ["sabc1", "SABC 1", "General", "South Africa", "English", "https://i.imgur.com/G8OXWe4.png", "https://sabconeta.cdn.mangomolo.com/sabc1/smil:sabc1.stream.smil/master.m3u8"],
  ["cgtn", "CGTN", "News", "International", "English", "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/CGTN.svg/960px-CGTN.svg.png", "https://amg00405-rakutentv-cgtn-rakuten-i9tar.amagi.tv/master.m3u8"],
  ["dw-english", "DW English", "News", "International", "English", "https://i.imgur.com/8MRNFb9.png", "https://amg01644-amg01644c1-amgplt0343.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg01644-amg01644c1-amgplt0343/playlist.m3u8"],
  ["euronews-english", "Euronews English", "News", "Europe", "English", "https://jiotvimages.cdn.jio.com/dare_images/images/Euro_News.png", "https://jmp2.uk/plu-61de96114757070008d33cae.m3u8"],
  ["natgeo-us", "National Geographic", "Documentary", "United States", "English", "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Natgeologo.svg/960px-Natgeologo.svg.png", "http://212.5.144.156:8080/natgeo/index.m3u8"],
  ["natgeo-wild", "National Geographic Wild", "Documentary", "International", "English", "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/National_Geographic_Wild_logo.svg/960px-National_Geographic_Wild_logo.svg.png", "http://hls127.freeott.top:8080/Nat_Geo_Wild_SD/video.m3u8"],
  ["bloomberg-europe", "Bloomberg TV Europe", "News", "Europe", "English", "https://i.imgur.com/OuogLHx.png", "https://bloomberg.com/media-manifest/streams/eu.m3u8"],
  ["cgtn-global", "CGTN Global Business", "News", "International", "English", "https://i.imgur.com/qBmomnF.png", "https://fastlive.cctvplus.com/out/v1/2b3d8a0c805d437f9dc85b764c2ac599/index.m3u8"],
].map(([id, name, group, country, language, logo, url]) => ({ id, name, group, country, language, logo, isLive: true, url }));

'''
text = text.replace('const musicFallback: Channel[] = [', featured_block + 'const musicFallback: Channel[] = [')
text = text.replace('const [channels, setChannels] = useState([...musicFallback, ...fallback]);', 'const { user, isAuthenticated, logout } = useAuth();\n  const [channels, setChannels] = useState([...featuredFallback, ...musicFallback, ...fallback]);')
text = text.replace('const [active, setActive] = useState(musicFallback[0]);', 'const [active, setActive] = useState(featuredFallback[0]);')
text = text.replace('const [favorites, setFavorites] = useState(["news-24", "cinema-now"]);', 'const [favorites, setFavorites] = useState(["news-24", "cinema-now"]);')
text = text.replace('useEffect(() => { fetch(PLAYLISTS.all)', 'useEffect(() => { if (!isAuthenticated || !user?.openId) return; const stored = localStorage.getItem(`nova-favorites-${user.openId}`); if (stored) { try { setFavorites(JSON.parse(stored)); } catch {} } }, [isAuthenticated, user?.openId]);\n  useEffect(() => { fetch(PLAYLISTS.all)')
text = text.replace('const [loading, setLoading] = useState(true);', 'const [loading, setLoading] = useState(true);')
text = text.replace('if (parsed.length) { const merged = [...musicFallback, ...parsed.filter((candidate) => !musicFallback.some((seed) => candidate.name.toLowerCase() === seed.name.toLowerCase()))]; setChannels(merged); setActive(merged[0]); setSource("IPTV-Org master index + Music TV"); }', 'if (parsed.length) { const seeds = [...featuredFallback, ...musicFallback]; const merged = [...seeds, ...parsed.filter((candidate) => !seeds.some((seed) => candidate.name.toLowerCase() === seed.name.toLowerCase()))]; setChannels(merged); setActive(merged[0]); setSource("IPTV-Org master index + featured shelves"); }')
text = text.replace('const isMusicChannel = (channel: Channel) => /music|trace|mtv|stingray|qmusic|vevo|4music|totalmusic|music box|retro plus/i.test(`${channel.name} ${channel.group}`);', 'const isMusicChannel = (channel: Channel) => /music|trace|mtv|stingray|qmusic|vevo|4music|totalmusic|music box|retro plus/i.test(`${channel.name} ${channel.group}`);\n  const isNewsChannel = (channel: Channel) => /news|cgtn|dw english|euronews|bloomberg|al.?jazeera|bbc/i.test(`${channel.name} ${channel.group}`);\n  const isDocChannel = (channel: Channel) => /documentary|national geographic|natgeo|discovery|wild/i.test(`${channel.name} ${channel.group}`);')
text = text.replace('group === "Music TV" ? isMusicChannel(c) : c.group.toLowerCase().includes(group.toLowerCase())', 'group === "Music TV" ? isMusicChannel(c) : group === "News" ? isNewsChannel(c) : group === "Documentary" ? isDocChannel(c) : group === "Featured" ? featuredFallback.some((seed) => seed.id === c.id) : c.group.toLowerCase().includes(group.toLowerCase())')
text = text.replace('const musicChannels = useMemo(() => channels.filter(isMusicChannel).slice(0, 18), [channels]);', 'const musicChannels = useMemo(() => channels.filter(isMusicChannel).slice(0, 18), [channels]);\n  const newsChannels = useMemo(() => channels.filter(isNewsChannel).slice(0, 18), [channels]);\n  const documentaryChannels = useMemo(() => channels.filter(isDocChannel).slice(0, 18), [channels]);\n  const featuredChannels = useMemo(() => channels.filter((channel) => featuredFallback.some((seed) => seed.id === channel.id)), [channels]);')
text = text.replace('const toggleFavorite = (channel: Channel) => { const exists = favorites.includes(channel.id); setFavorites((current) => exists ? current.filter((id) => id !== channel.id) : [...current, channel.id]); toast(exists ? "Removed from My List" : "Added to My List", { icon: <Heart size={15} /> }); };', 'const toggleFavorite = (channel: Channel) => { if (!isAuthenticated || !user?.openId) { toast("Sign in to save channels to My List"); startLogin(); return; } const exists = favorites.includes(channel.id); setFavorites((current) => { const next = exists ? current.filter((id) => id !== channel.id) : [...current, channel.id]; localStorage.setItem(`nova-favorites-${user.openId}`, JSON.stringify(next)); return next; }); toast(exists ? "Removed from My List" : "Added to My List", { icon: <Heart size={15} /> }); };')

# Add a reusable shelf component before Home.
rail = '''function ChannelRail({ id, kicker, title, channels, active, favorites, select, toggleFavorite }: { id: string; kicker: string; title: string; channels: Channel[]; active: Channel; favorites: string[]; select: (channel: Channel) => void; toggleFavorite: (channel: Channel) => void }) {
  return <section id={id} className="content-rail"><div className="rail-heading"><div><p className="eyebrow">{kicker}</p><h2 className="section-title">{title} <span className="section-count">{channels.length}</span></h2></div><a href="#channels" className="rail-link">See all <ArrowRight size={14} /></a></div><div className="rail-track scrollbar-none">{channels.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div></section>;
}

'''
text = text.replace('export default function Home() {', rail + 'export default function Home() {')

# Replace nav's right controls with auth-aware controls.
old_nav_end = '<button className="icon-button"><Bell size={17} /></button><div className="avatar">JD</div>'
new_nav_end = '<button className="icon-button" aria-label="Notifications"><Bell size={17} /></button>{isAuthenticated ? <button onClick={() => logout()} className="account-chip"><span className="avatar">{(user?.name || "ME").slice(0, 2).toUpperCase()}</span><span className="hidden lg:inline">{user?.name || "Account"}</span></button> : <button onClick={startLogin} className="nav-login">Sign in</button>}'
text = text.replace(old_nav_end, new_nav_end)
text = text.replace('<a className="nav-link" href="#live-tv">All channels</a><a className="nav-link" href="#music-tv">Music TV</a>', '<a className="nav-link" href="#live-tv">Browse</a><a className="nav-link" href="#featured">Featured</a><a className="nav-link" href="#music-tv">Music TV</a>')

# Put a theater player before the legacy guide and add shelves.
needle = '<section id="live-tv" className="live-tv-panel mb-14">'
shelves = '<ChannelRail id="featured" kicker="Handpicked for live viewing" title="Featured channels" channels={featuredChannels} active={active} favorites={favorites} select={select} toggleFavorite={toggleFavorite} /><ChannelRail id="news" kicker="Around the world" title="World news" channels={newsChannels} active={active} favorites={favorites} select={select} toggleFavorite={toggleFavorite} /><ChannelRail id="documentaries" kicker="Explore more" title="Documentaries & nature" channels={documentaryChannels} active={active} favorites={favorites} select={select} toggleFavorite={toggleFavorite} />'
text = text.replace(needle, shelves + needle)

# Upgrade the hero copy and insert a watch heading above the player.
text = text.replace('Your world.<br /><span className="text-[#cbd9e5]">One remote.</span>', 'Live TV.<br /><span className="text-[#cbd9e5]">Made simple.</span>')
text = text.replace('Tune into thousands of public IPTV channels from every corner of the planet. No clutter, no account wall — just pick a signal and press play.', 'Browse free channels from around the world, save your favorites, and watch in a focused theater built for live television.')
text = text.replace('<section id="player" className="mb-14 grid gap-7 xl:grid-cols-[1.35fr_0.65fr]">', '<section id="player" className="watch-theater mb-14 grid gap-7 xl:grid-cols-[1.35fr_0.65fr]"><div className="theater-heading"><div><p className="eyebrow">Now playing</p><h2 className="section-title">{active.name}</h2></div><span className="status-pill"><span className="live-dot" /> Live channel</span></div>')
# Close the inserted heading wrapper before player children: section currently begins heading then Player. Add wrapper closure immediately before Player.
text = text.replace('<div className="theater-heading"><div><p className="eyebrow">Now playing</p><h2 className="section-title">{active.name}</h2></div><span className="status-pill"><span className="live-dot" /> Live channel</span></div><Player', '<div className="theater-heading"><div><p className="eyebrow">Now playing</p><h2 className="section-title">{active.name}</h2></div><span className="status-pill"><span className="live-dot" /> Live channel</span></div><Player')

path.write_text(text)
print('Epic streaming upgrade applied')

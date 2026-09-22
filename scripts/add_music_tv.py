from pathlib import Path

path = Path('/home/ubuntu/streambox-iptv/client/src/pages/Home.tsx')
text = path.read_text()

music_block = '''const musicFallback: Channel[] = [
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

const groups = ["All channels", "News", "Sports", "Movies", "Music TV", "Documentary", "Kids", "Travel"];'''

old_groups = 'const groups = ["All channels", "News", "Sports", "Movies", "Music", "Documentary", "Kids", "Travel"];'
if old_groups in text:
    text = text.replace(old_groups, music_block)

text = text.replace('const [channels, setChannels] = useState(fallback);', 'const [channels, setChannels] = useState([...musicFallback, ...fallback]);')
text = text.replace('const [active, setActive] = useState(fallback[0]);', 'const [active, setActive] = useState(musicFallback[0]);')
text = text.replace('if (parsed.length) { setChannels(parsed); setActive(parsed[0]); setSource("IPTV-Org master index"); }', 'if (parsed.length) { const merged = [...musicFallback, ...parsed.filter((candidate) => !musicFallback.some((seed) => candidate.name.toLowerCase() === seed.name.toLowerCase()))]; setChannels(merged); setActive(merged[0]); setSource("IPTV-Org master index + Music TV"); }')
old_visible = 'const visible = useMemo(() => { const q = query.toLowerCase().trim(); return channels.filter((c) => (group === "All channels" || c.group.toLowerCase().includes(group.toLowerCase())) && (!q || [c.name, c.group, c.country, c.language].filter(Boolean).join(" ").toLowerCase().includes(q))).slice(0, 120); }, [channels, group, query]);'
new_visible = 'const isMusicChannel = (channel: Channel) => /music|trace|mtv|stingray|qmusic|vevo|4music|totalmusic|music box|retro plus/i.test(`${channel.name} ${channel.group}`);\n  const visible = useMemo(() => { const q = query.toLowerCase().trim(); return channels.filter((c) => (group === "All channels" ? true : group === "Music TV" ? isMusicChannel(c) : c.group.toLowerCase().includes(group.toLowerCase())) && (!q || [c.name, c.group, c.country, c.language].filter(Boolean).join(" ").toLowerCase().includes(q))).slice(0, 120); }, [channels, group, query]);\n  const musicChannels = useMemo(() => channels.filter(isMusicChannel).slice(0, 18), [channels]);'
text = text.replace(old_visible, new_visible)
text = text.replace('<a className="nav-link" href="#live-tv">All channels</a><a className="nav-link" href="#my-list">My List', '<a className="nav-link" href="#live-tv">All channels</a><a className="nav-link" href="#music-tv">Music TV</a><a className="nav-link" href="#my-list">My List')
music_section = '<section id="music-tv" className="mb-14"><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Music television</p><h2 className="section-title">Music TV <span className="section-count">{musicChannels.length} feeds</span></h2><p className="mt-2 max-w-2xl text-sm text-white/50">Trace, MTV, Stingray, Qmusic, Totalmusic and other publicly listed music feeds. Availability can vary by region and provider.</p></div><button onClick={() => { setGroup("Music TV"); document.getElementById("channels")?.scrollIntoView({ behavior: "smooth" }); }} className="secondary-button compact">Browse Music TV <ArrowRight size={14} /></button></div>{musicChannels.length ? <div className="music-rail scrollbar-none grid grid-flow-col auto-cols-[190px] gap-4 overflow-x-auto pb-3 sm:auto-cols-[220px]">{musicChannels.map((channel) => <ChannelCard key={channel.id} channel={channel} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div> : <div className="empty-shelf"><Radio size={21} /><p>No music feeds loaded</p><span>Use Playlist tools to add a provider M3U.</span></div>}<div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/50"><strong className="text-white/80">Channel O note:</strong> Channel O is not currently present as a verified public stream in the IPTV-Org catalog. Add a licensed/provider M3U in Playlist tools when you have an authorized source.</div></section>'
text = text.replace('<section id="my-list" className="mb-14">', music_section + '<section id="my-list" className="mb-14">')
path.write_text(text)
print('Music TV migration applied')

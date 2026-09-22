from pathlib import Path

path = Path('/home/ubuntu/streambox-iptv/client/src/pages/Home.tsx')
text = path.read_text()

insert = r'''
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

'''

if 'function ChannelRow(' not in text:
    text = text.replace('export default function Home() {', insert + 'export default function Home() {')

marker = '    <section id="my-list"'
section = r'''    <section id="live-tv" className="live-tv-panel mb-14"><div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Television guide</p><h2 className="section-title">Live TV <span className="section-count">{channels.length.toLocaleString()} signals</span></h2></div><div className="flex gap-2"><button onClick={() => setGroup("All channels")} className="category-pill selected"><LayoutGrid size={14} /> All channels</button><button onClick={() => setGroup("Sports")} className="category-pill">Sports</button><button onClick={() => setGroup("News")} className="category-pill">News</button></div></div><div className="glass-channel-browser"><div className="channel-browser-head"><span>Channel</span><span>Current programme</span><span>Progress</span><span>Next programme</span><span>Status</span></div><div className="channel-rows">{visible.slice(0, 12).map((channel, index) => <ChannelRow key={channel.id} channel={channel} index={index} active={active.id === channel.id} favorite={favorites.includes(channel.id)} select={() => select(channel)} toggleFavorite={() => toggleFavorite(channel)} />)}</div></div><div className="mt-5 flex items-center justify-between"><div><p className="eyebrow">Electronic programme guide</p><h3 className="mt-1 font-display text-xl font-bold text-[#0d1b2a]">On now & next</h3></div><span className="source-badge">Live timeline</span></div><EpgStrip channels={visible} select={select} /></section>
'''
if 'id="live-tv"' not in text:
    text = text.replace(marker, section + marker)
text = text.replace('href="#channels">All channels', 'href="#live-tv">All channels')
path.write_text(text)

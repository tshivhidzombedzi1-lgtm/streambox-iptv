import type Hls from "hls.js";
import { Gauge, Lock, Maximize, Pause, Play, Radio, Repeat2, RotateCcw, Settings, SignalLow, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Channel } from "@/pages/Home";

type PlayerPrefs = { bufferSeconds: number; dataSaver: boolean; quality: string; loop: boolean };
const PREFS_KEY = "wonderbox-player-preferences";
const defaults: PlayerPrefs = { bufferSeconds: 30, dataSaver: false, quality: "auto", loop: false };

function readPrefs() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") } as PlayerPrefs; } catch { return defaults; }
}

export default function AdvancedPlayer({ channel, maxHeight, qualityLabel }: { channel: Channel; maxHeight: number; qualityLabel: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [prefs, setPrefs] = useState<PlayerPrefs>(readPrefs);
  const [levels, setLevels] = useState<number[]>([]);
  const [status, setStatus] = useState("Loading");
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seek, setSeek] = useState({ start: 0, end: 0, current: 0 });
  const effectiveCap = prefs.dataSaver ? Math.min(360, maxHeight) : maxHeight;

  const savePrefs = (patch: Partial<PlayerPrefs>) => setPrefs((current) => {
    const next = { ...current, ...patch };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    return next;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(false); setStatus("Loading"); setLevels([]); setPlaying(false);
    hlsRef.current?.destroy();
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    let disposed = false;
    if (channel.url.includes(".m3u8") && !nativeHls) {
      import("hls.js").then(({ default: HlsRuntime }) => {
        if (disposed || !HlsRuntime.isSupported()) return;
        const hls = new HlsRuntime({ enableWorker: true, lowLatencyMode: false, backBufferLength: Math.max(90, prefs.bufferSeconds * 2), maxBufferLength: prefs.bufferSeconds, maxMaxBufferLength: Math.max(60, prefs.bufferSeconds * 2), startLevel: -1 });
        hlsRef.current = hls;
        hls.loadSource(channel.url);
        hls.attachMedia(video);
        hls.on(HlsRuntime.Events.MANIFEST_PARSED, () => {
          const available = Array.from(new Set(hls.levels.map((level) => level.height).filter(Boolean))).sort((a, b) => a - b);
          setLevels(available);
          const allowed = hls.levels.map((level, index) => ({ height: level.height, index })).filter((level) => level.height <= effectiveCap);
          hls.autoLevelCapping = allowed.length ? allowed[allowed.length - 1].index : 0;
          setStatus("Live");
          video.play().catch(() => undefined);
        });
        hls.on(HlsRuntime.Events.ERROR, (_, data) => { if (data.fatal) { setError(true); setStatus("Unavailable"); if (data.type === HlsRuntime.ErrorTypes.NETWORK_ERROR) hls.startLoad(); } });
      }).catch(() => { setError(true); setStatus("Unavailable"); });
      return () => { disposed = true; hlsRef.current?.destroy(); };
    }
    video.src = channel.url; video.load(); video.play().catch(() => undefined); setStatus("Live");
    return () => { video.removeAttribute("src"); video.load(); };
  }, [channel.url, effectiveCap, prefs.bufferSeconds]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (prefs.quality === "auto") { hls.currentLevel = -1; return; }
    const requested = Number(prefs.quality);
    const index = hls.levels.reduce((best, level, current) => level.height <= Math.min(requested, effectiveCap) ? current : best, -1);
    hls.currentLevel = Math.max(0, index);
  }, [effectiveCap, levels, prefs.quality]);

  const qualityOptions = useMemo(() => Array.from(new Set(levels.length ? levels : [240, 360, 480, 720, 1080, 2160])).sort((a, b) => a - b), [levels]);
  const syncSeek = () => {
    const video = videoRef.current;
    if (!video) return;
    const start = video.seekable.length ? video.seekable.start(0) : 0;
    const end = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : Number.isFinite(video.duration) ? video.duration : 0;
    setSeek({ start, end, current: video.currentTime });
  };
  const togglePlay = () => { const video = videoRef.current; if (!video) return; if (video.paused) video.play().catch(() => undefined); else video.pause(); };
  const rewind = () => { const video = videoRef.current; if (!video || !video.seekable.length) return; video.currentTime = Math.max(video.seekable.start(0), video.currentTime - 30); };
  const goLive = () => { const video = videoRef.current; if (!video || !video.seekable.length) return; video.currentTime = Math.max(0, video.seekable.end(video.seekable.length - 1) - .5); video.play().catch(() => undefined); };
  const dvrAvailable = seek.end - seek.start > 35;
  const atLiveEdge = !dvrAvailable || seek.end - seek.current < 3;

  return <div className="advanced-player">
    <div className="advanced-video-shell">
      <video ref={videoRef} playsInline loop={prefs.loop} muted={muted} className="advanced-video" onClick={togglePlay} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={syncSeek} onProgress={syncSeek} />
      <div className="player-status"><span className="live-pulse" /> {status}</div>
      {error && <div className="player-error"><Radio size={28} /><strong>Stream unavailable</strong><span>This public source may be offline or restricted in your region.</span></div>}
      {!playing && !error && <button className="player-center-play" onClick={togglePlay} aria-label="Play"><Play size={28} fill="currentColor" /></button>}
      <div className="player-chrome">
        {dvrAvailable && <input className="dvr-range" type="range" min={seek.start} max={seek.end} step=".25" value={Math.min(seek.current, seek.end)} onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }} aria-label="Live DVR timeline" />}
        <div className="player-control-row"><div><button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button><span className="player-time">{atLiveEdge ? "LIVE" : `-${Math.max(0, Math.round(seek.end - seek.current))}s`}</span></div><div><button onClick={rewind} title="Rewind 30 seconds" disabled={!dvrAvailable}><RotateCcw size={18} /></button><button className={atLiveEdge ? "live-control active" : "live-control"} onClick={goLive}><span /> Live</button><button className={prefs.loop ? "active" : ""} onClick={() => savePrefs({ loop: !prefs.loop })} title="Loop"><Repeat2 size={18} /></button><button className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((value) => !value)} title="Settings"><Settings size={19} /></button><button onClick={() => videoRef.current?.requestFullscreen?.()} title="Fullscreen"><Maximize size={19} /></button></div></div>
      </div>
      {settingsOpen && <div className="player-settings"><header><strong>Player settings</strong><button onClick={() => setSettingsOpen(false)}><X size={16} /></button></header><label><span><Gauge size={15} /> Quality <small>{qualityLabel}</small></span><select value={prefs.quality} onChange={(event) => savePrefs({ quality: event.target.value })}><option value="auto">Auto</option>{qualityOptions.map((height) => <option key={height} value={height} disabled={height > effectiveCap}>{height}p{height > effectiveCap ? " · Locked" : ""}</option>)}</select></label><label><span><SignalLow size={15} /> Buffer ahead <small>For unstable connections</small></span><select value={prefs.bufferSeconds} onChange={(event) => savePrefs({ bufferSeconds: Number(event.target.value) })}><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option></select></label><button className={prefs.dataSaver ? "setting-toggle active" : "setting-toggle"} onClick={() => savePrefs({ dataSaver: !prefs.dataSaver })}><span><SignalLow size={15} /> Data Saver <small>Caps video at 360p</small></span><i /></button><p><Lock size={13} /> These preferences stay on this device. HD requires Plus.</p></div>}
    </div>
  </div>;
}

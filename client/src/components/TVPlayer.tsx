import type Hls from "hls.js";
import type { Level } from "hls.js";
import {
  ArrowLeft, CalendarClock, Check, ChevronDown, ChevronUp, Gauge, List, Loader2, Maximize, Minimize, Pause, PictureInPicture2,
  Play, RadioTower, RotateCcw, Settings2, SkipForward, Volume1, Volume2, VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ShareButton } from "@/components/Share";
import { track } from "@/lib/growth";
import { hhmm, onNow, useGuide, useSchedule } from "@/lib/epg";
import { type Channel, connection, isSlowNetwork, isTV, markWatched, settings, streamSrc, useStore } from "@/lib/catalog";

type Source = { src: string; label: string; relayed: boolean };
type Phase = "loading" | "playing" | "paused" | "buffering" | "switching" | "failed";

function buildSources(channel: Channel, saver: boolean): Source[] {
  // In data-saver mode try the lightest listed stream first.
  const all = channel.s || [];
  const streams = saver ? [...all].sort((a, b) => (a.q || 9999) - (b.q || 9999) || a.p - b.p) : all;
  return streams.flatMap((s, i) => {
    const label = `Source ${i + 1}${s.q ? ` · ${s.q}p` : ""}`;
    // Local-only (geo-blocked) streams must come straight from the broadcaster: never relay them.
    if (s.g) return [{ src: streamSrc(s), label, relayed: false }];
    return s.p ? [{ src: streamSrc(s), label, relayed: true }] : [{ src: streamSrc(s), label, relayed: false }, { src: streamSrc(s, true), label, relayed: true }];
  });
}

function hlsConfig(saver: boolean) {
  const downlink = connection()?.downlink;
  // TVs, iPhones and Firefox don't report a downlink: start around 480p and climb.
  const estimate = saver ? 250_000 : downlink ? Math.max(400_000, downlink * 700_000) : 800_000;
  return {
    enableWorker: true,
    lowLatencyMode: false,
    startLevel: saver ? 0 : -1,
    abrEwmaDefaultEstimate: estimate,
    abrBandWidthFactor: saver ? 0.7 : 0.85,
    abrBandWidthUpFactor: saver ? 0.5 : 0.7,
    capLevelToPlayerSize: true,
    // Deeper buffer and a live point further from the edge ride out weak networks.
    maxBufferLength: saver ? 45 : 30,
    maxMaxBufferLength: saver ? 120 : 60,
    backBufferLength: 30,
    // Sitting a few segments behind live leaves a cushion for network dips.
    liveSyncDurationCount: saver ? 5 : 4,
    liveMaxLatencyDurationCount: saver ? 12 : 10,
    manifestLoadingMaxRetry: 2,
    levelLoadingMaxRetry: 4,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 800,
    nudgeMaxRetry: 8,
  };
}

const fmtHeight = (h: number) => (h >= 2160 ? "4K" : `${h}p`);

export default function TVPlayer({ channel, onBack, onPrev, onNext, onToggleList }: {
  channel: Channel; onBack: () => void; onPrev: () => void; onNext: () => void; onToggleList: () => void;
}) {
  const prefs = useStore(settings);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const hideTimer = useRef<number>(0);
  const watchdog = useRef<number>(0);
  const recovered = useRef(false);
  const playButton = useRef<HTMLButtonElement>(null);

  const saver = prefs.dataSaver || isSlowNetwork();
  const sources = useMemo(() => buildSources(channel, saver), [channel, saver]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState<null | "quality" | "source">(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const { now: onAir, next: upNext } = onNow(useGuide(), channel.id);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [playingHeight, setPlayingHeight] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [behindLive, setBehindLive] = useState(false);


  const failover = useCallback(() => {
    window.clearTimeout(watchdog.current);
    setSourceIndex((i) => {
      if (i + 1 < sources.length) { setPhase("switching"); return i + 1; }
      setPhase("failed");
      return i;
    });
  }, [sources.length]);

  const armWatchdog = useCallback((ms: number) => {
    window.clearTimeout(watchdog.current);
    watchdog.current = window.setTimeout(failover, ms);
  }, [failover]);

  const tryPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = settings.get().muted;
    video.play().catch((err: DOMException) => {
      if (err?.name !== "NotAllowedError") return;
      // Browser blocked sound autoplay: start muted and offer one-tap unmute.
      video.muted = true;
      setNeedsUnmute(true);
      video.play().catch(() => { window.clearTimeout(watchdog.current); setPhase("paused"); });
    });
  }, []);

  // Attach the current source.
  useEffect(() => {
    const video = videoRef.current;
    const source = sources[sourceIndex];
    if (!video || !source) return;
    let disposed = false;
    recovered.current = false;
    setLevels([]); setLevel(-1); setPlayingHeight(0); setBehindLive(false);
    setPhase((p) => (p === "switching" ? p : "loading"));
    hlsRef.current?.destroy(); hlsRef.current = null;
    armWatchdog(saver ? 30000 : 20000);

    import("hls.js").then(({ default: HlsRuntime }) => {
      if (disposed) return;
      if (!HlsRuntime.isSupported()) {
        video.src = source.src;
        tryPlay();
        return;
      }
      const hls = new HlsRuntime(hlsConfig(saver));
      hlsRef.current = hls;
      hls.on(HlsRuntime.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(data.levels);
        if (saver) {
          const lowCap = data.levels.map((l, i) => ({ h: l.height, i })).filter((l) => !l.h || l.h <= 360).pop();
          hls.autoLevelCapping = lowCap ? lowCap.i : 0;
        }
        tryPlay();
      });
      hls.on(HlsRuntime.Events.LEVEL_SWITCHED, (_, data) => setPlayingHeight(hls.levels[data.level]?.height || 0));
      hls.on(HlsRuntime.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === HlsRuntime.ErrorTypes.MEDIA_ERROR && !recovered.current) {
          recovered.current = true;
          hls.recoverMediaError();
          return;
        }
        failover();
      });
      hls.loadSource(source.src);
      hls.attachMedia(video);
    }).catch(failover);

    return () => {
      disposed = true;
      window.clearTimeout(watchdog.current);
      hlsRef.current?.destroy(); hlsRef.current = null;
      video.removeAttribute("src"); video.load();
    };
  }, [sources, sourceIndex, saver, armWatchdog, failover, tryPlay]);

  // Media element events drive the UI state and the stall watchdog.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let played = false;
    const onPlaying = () => {
      if (!played) track("play", { ch: channel.id });
      played = true; window.clearTimeout(watchdog.current); setPhase("playing"); markWatched(channel.id);
    };
    // Stalls mid-playback mean the line can't keep up: step quality down each
    // time, and after a second stall within 90s hold at 360p or below.
    let stalls: number[] = [];
    let smooth = false;
    const stepDown = () => {
      const hls = hlsRef.current;
      if (!hls || hls.levels.length < 2 || hls.manualLevel !== -1) return;
      const now = Date.now();
      stalls = [...stalls.filter((t) => now - t < 90_000), now];
      const current = hls.currentLevel >= 0 ? hls.currentLevel : hls.levels.length - 1;
      let cap = Math.max(0, current - 1);
      if (stalls.length >= 2 && !smooth) {
        const low = hls.levels.map((l, i) => ({ h: l.height, i })).filter((l) => !l.h || l.h <= 360).pop();
        cap = Math.min(cap, low ? low.i : 0);
        smooth = true;
        toast("Slow connection: lowered the quality to stop buffering");
      }
      if (hls.autoLevelCapping === -1 || cap < hls.autoLevelCapping) { hls.autoLevelCapping = cap; hls.nextLoadLevel = cap; }
    };
    const onWaiting = () => {
      if (video.paused) return;
      if (played) stepDown();
      setPhase("buffering");
      armWatchdog(saver ? 25000 : 15000);
    };
    const onPause = () => { window.clearTimeout(watchdog.current); setPhase((p) => (p === "failed" ? p : "paused")); };
    const onError = () => { if (!hlsRef.current) failover(); };
    const onTime = () => {
      const end = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0;
      setBehindLive(end > 0 && end - video.currentTime > 30);
      if (!hlsRef.current && video.videoHeight) setPlayingHeight(video.videoHeight);
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    video.addEventListener("timeupdate", onTime);
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [channel.id, saver, armWatchdog, failover]);

  // Volume, mute and boost (boost uses Web Audio, only possible with hls.js playback).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = prefs.volume;
    if (!needsUnmute) video.muted = prefs.muted;
    if (prefs.boost > 1 && hlsRef.current && !gainRef.current) {
      try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        ctx.createMediaElementSource(video).connect(gain).connect(ctx.destination);
        gainRef.current = gain;
      } catch {}
    }
    if (gainRef.current) gainRef.current.gain.value = prefs.boost;
  }, [prefs.volume, prefs.muted, prefs.boost, needsUnmute, phase]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (phase === "failed") { setSourceIndex(0); setPhase("loading"); return; }
    if (video.paused) {
      // Resuming a live channel jumps back to the live edge.
      if (hlsRef.current?.liveSyncPosition) video.currentTime = hlsRef.current.liveSyncPosition;
      tryPlay();
    } else video.pause();
  }, [phase, tryPlay]);

  const setVolume = (volume: number) => settings.set({ ...settings.get(), volume, muted: volume === 0 });
  const toggleMute = () => {
    if (needsUnmute) { setNeedsUnmute(false); settings.set({ ...settings.get(), muted: false }); if (videoRef.current) videoRef.current.muted = false; return; }
    settings.set({ ...settings.get(), muted: !settings.get().muted });
  };
  const goLive = () => {
    const video = videoRef.current;
    if (!video) return;
    const live = hlsRef.current?.liveSyncPosition;
    video.currentTime = live ?? (video.seekable.length ? video.seekable.end(video.seekable.length - 1) - 3 : video.currentTime);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.().catch(() => (videoRef.current as unknown as { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.());
  };
  const pip = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    else video.requestPictureInPicture?.().catch(() => undefined);
  };
  const chooseLevel = (index: number) => {
    const hls = hlsRef.current;
    if (hls) { hls.currentLevel = index; hls.autoLevelCapping = -1; }
    setLevel(index); setMenu(null);
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const poke = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { setControls(false); setMenu(null); }, 3200);
  }, []);
  useEffect(() => { poke(); return () => window.clearTimeout(hideTimer.current); }, [poke, channel.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const video = videoRef.current;
      const key = e.key.toLowerCase();
      // Remote-control media keys, by name or by the TV platforms' key codes.
      if (key === "mediaplaypause" || e.keyCode === 10252 || e.keyCode === 179) togglePlay();
      else if (key === "mediaplay" || e.keyCode === 415) { if (video?.paused) togglePlay(); }
      else if (key === "mediapause" || e.keyCode === 19) { if (video && !video.paused) togglePlay(); }
      else if (key === "channelup" || e.keyCode === 427) onNext();
      else if (key === "channeldown" || e.keyCode === 428) onPrev();
      else if (isTV) {
        // On a TV the D-pad moves focus between the controls, and OK plays/pauses
        // unless a button has focus. A key press while the controls are hidden
        // only brings them back, with focus on Play.
        const onButton = e.target instanceof HTMLButtonElement;
        if (!controls && (key.startsWith("arrow") || key === "enter")) { e.preventDefault(); poke(); playButton.current?.focus(); return; }
        if (key === "enter" && !onButton) { e.preventDefault(); togglePlay(); }
        else if (!key.startsWith("arrow") && key !== "enter") return;
      }
      else if (key === " " || key === "k") { e.preventDefault(); togglePlay(); }
      else if (key === "m") toggleMute();
      else if (key === "f") toggleFullscreen();
      else if (key === "arrowup") { e.preventDefault(); setVolume(Math.min(1, settings.get().volume + 0.1)); }
      else if (key === "arrowdown") { e.preventDefault(); setVolume(Math.max(0, settings.get().volume - 0.1)); }
      else if (key === "arrowleft" && video) video.currentTime = Math.max(video.seekable.length ? video.seekable.start(0) : 0, video.currentTime - 10);
      else if (key === "arrowright" && video) video.currentTime += 10;
      else if (key === "n" || key === "pagedown") onNext();
      else if (key === "p" || key === "pageup") onPrev();
      else if (key === "l") onToggleList();
      else if (key === "escape" && !document.fullscreenElement) onBack();
      else return;
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const volumeIcon = prefs.muted || needsUnmute || prefs.volume === 0 ? <VolumeX size={22} /> : prefs.volume < 0.5 ? <Volume1 size={22} /> : <Volume2 size={22} />;
  const busy = phase === "loading" || phase === "buffering" || phase === "switching";
  const heights = Array.from(new Map(levels.map((l, i) => [l.height, i])).entries()).filter(([h]) => h).sort((a, b) => b[0] - a[0]);

  return <div ref={wrapRef} className={`tvp ${controls || phase !== "playing" ? "show" : ""}`} onMouseMove={poke} onTouchStart={poke}>
    <video ref={videoRef} playsInline className="tvp-video" onClick={() => { if (!controls) poke(); else togglePlay(); }} onDoubleClick={toggleFullscreen} />

    <div className="tvp-top">
      <button className="tvp-icon" onClick={onBack} aria-label="Back"><ArrowLeft size={24} /></button>
      <div className="tvp-title">
        {channel.l && <img src={channel.l} alt="" />}
        <div><strong>{channel.n}</strong><span><i className="live-dot" /> LIVE{playingHeight ? ` · ${fmtHeight(playingHeight)}` : ""}{saver ? " · Data saver" : ""}</span>
          {onAir && <span className="tvp-now"><b>{onAir.t}</b> {hhmm(onAir.s)}–{hhmm(onAir.e)}{upNext && <> · Next {hhmm(upNext.s)} {upNext.t}</>}</span>}</div>
      </div>
      {(onAir || upNext) && <button className="tvp-icon" onClick={() => setGuideOpen((o) => !o)} aria-label="TV guide"><CalendarClock size={21} /></button>}
      <ShareButton channel={channel} className="tvp-icon" label={false} size={21} />
      <button className="tvp-icon" onClick={onToggleList} aria-label="Channel list"><List size={22} /></button>
    </div>

    {guideOpen && <GuidePanel id={channel.id} name={channel.n} onClose={() => setGuideOpen(false)} />}
    {busy && <div className="tvp-center"><Loader2 className="spin" size={46} /><p>{phase === "switching" ? "Switching to a backup stream…" : phase === "buffering" ? "Buffering…" : "Tuning in…"}</p></div>}
    {phase === "paused" && !busy && <button className="tvp-bigplay" onClick={togglePlay} aria-label="Play" autoFocus={isTV}><Play size={38} fill="currentColor" /></button>}
    {phase === "failed" && <div className="tvp-center tvp-failed">
      <RadioTower size={40} />
      <h3>This channel is off air right now</h3>
      <p>We tried {sources.length} stream{sources.length > 1 ? "s" : ""}. Free channels sometimes go offline or block some regions.</p>
      <div><button className="btn btn-light" onClick={onNext}><SkipForward size={18} /> Next channel</button><button className="btn btn-ghost" onClick={() => { setSourceIndex(0); setPhase("loading"); }}><RotateCcw size={18} /> Try again</button></div>
    </div>}
    {needsUnmute && phase === "playing" && <button className="tvp-unmute" onClick={toggleMute}><VolumeX size={18} /> Tap to unmute</button>}

    <div className="tvp-bottom">
      <div className="tvp-row">
        <button ref={playButton} className="tvp-icon" onClick={togglePlay} aria-label={phase === "playing" ? "Pause" : "Play"}>{phase === "playing" || phase === "buffering" ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}</button>
        <button className="tvp-icon" onClick={onPrev} aria-label="Previous channel"><ChevronUp size={24} /></button>
        <button className="tvp-icon" onClick={onNext} aria-label="Next channel"><ChevronDown size={24} /></button>
        <div className="tvp-volume">
          <button className="tvp-icon" onClick={toggleMute} aria-label="Mute">{volumeIcon}</button>
          <input type="range" min={0} max={1} step={0.02} value={prefs.muted || needsUnmute ? 0 : prefs.volume} onChange={(e) => { setNeedsUnmute(false); setVolume(Number(e.target.value)); }} aria-label="Volume" style={{ "--fill": `${(prefs.muted || needsUnmute ? 0 : prefs.volume) * 100}%` } as React.CSSProperties} />
        </div>
        <button className={`tvp-live ${behindLive ? "behind" : ""}`} onClick={goLive}><i className="live-dot" /> {behindLive ? "Go live" : "Live"}</button>
        <div className="grow" />
        <div className="tvp-menu-wrap">
          <button className="tvp-icon" onClick={() => setMenu(menu === "quality" ? null : "quality")} aria-label="Quality and audio"><Settings2 size={22} /></button>
          {menu === "quality" && <div className="tvp-menu">
            <p className="tvp-menu-h">Quality</p>
            <button onClick={() => chooseLevel(-1)}>{level === -1 && <Check size={16} />} Auto {level === -1 && playingHeight ? <em>{fmtHeight(playingHeight)}</em> : null}</button>
            {heights.map(([h, i]) => <button key={h} onClick={() => chooseLevel(i)}>{level === i && <Check size={16} />} {fmtHeight(h)}</button>)}
            <p className="tvp-menu-h">Data saver</p>
            <button onClick={() => settings.set({ ...settings.get(), dataSaver: !prefs.dataSaver })}>{prefs.dataSaver && <Check size={16} />} <Gauge size={15} /> {prefs.dataSaver ? "On · max 360p" : "Off"}</button>
            {hlsRef.current && <><p className="tvp-menu-h">Volume boost</p>
              <div className="tvp-seg">{[1, 1.5, 2].map((b) => <button key={b} className={prefs.boost === b ? "on" : ""} onClick={() => settings.set({ ...settings.get(), boost: b })}>{b * 100}%</button>)}</div></>}
            {sources.length > 1 && <><p className="tvp-menu-h">Stream</p>
              {sources.map((s, i) => <button key={i} onClick={() => { setSourceIndex(i); setMenu(null); }}>{i === sourceIndex && <Check size={16} />} {s.label}{s.relayed ? " · relay" : ""}</button>)}</>}
          </div>}
        </div>
        {"pictureInPictureEnabled" in document && <button className="tvp-icon" onClick={pip} aria-label="Picture in picture"><PictureInPicture2 size={22} /></button>}
        <button className="tvp-icon" onClick={toggleFullscreen} aria-label="Fullscreen">{fullscreen ? <Minimize size={22} /> : <Maximize size={22} />}</button>
      </div>
    </div>
  </div>;
}


// The channel's schedule for the next 24 hours, what's on now highlighted.
function GuidePanel({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const list = useSchedule(id, true);
  const now = Date.now();
  let day = "";
  return <aside className="tvp-guide" aria-label={`${name} TV guide`}>
    <div className="tvp-guide-head"><h3>{name}: TV guide</h3><button className="tvp-icon" onClick={onClose} aria-label="Close guide" autoFocus={isTV}><ChevronDown size={22} /></button></div>
    {!list ? <p className="tvp-guide-note">Loading the schedule…</p> : !list.length ? <p className="tvp-guide-note">No schedule for this channel right now.</p> : <ol>
      {list.map((p) => {
        const d = new Date(p.s).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
        const header = d !== day ? (day = d) : "";
        const live = p.s <= now && p.e > now;
        return <li key={p.s} className={live ? "on" : ""}>
          {header && <span className="tvp-guide-day">{header}</span>}
          <time>{hhmm(p.s)}</time>
          <div><strong>{p.t}{live && <em>On now</em>}</strong>{p.d && <p>{p.d}</p>}</div>
        </li>;
      })}
    </ol>}
  </aside>;
}

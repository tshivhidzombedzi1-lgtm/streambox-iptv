import { Download, Link2, Share2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Channel } from "@/lib/catalog";
import { isApp, useStore } from "@/lib/catalog";
import { install, nativeShare, promptInstall, shareText, shareTo, shareUrl, track } from "@/lib/growth";

export function ShareSheet({ channel, onClose }: { channel: Channel | null; onClose: () => void }) {
  const copy = async () => {
    const url = shareUrl(channel, "link");
    try { await navigator.clipboard.writeText(url); toast("Link copied. Paste it anywhere."); }
    catch { window.prompt("Copy this link:", url); }
    track("share", channel ? { ch: channel.id, t: "link" } : { t: "link" });
    onClose();
  };
  const go = (target: "whatsapp" | "facebook" | "x") => { shareTo(target, channel); onClose(); };
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet share-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share">
      <div className="sheet-head"><h2>{channel ? `Share ${channel.n}` : "Share YokoTV"}</h2><button onClick={onClose} aria-label="Close"><X size={22} /></button></div>
      <p className="sheet-text">{shareText(channel)}</p>
      <div className="share-grid">
        <button className="share-btn whatsapp" onClick={() => go("whatsapp")} autoFocus>WhatsApp</button>
        <button className="share-btn" onClick={() => go("facebook")}>Facebook</button>
        <button className="share-btn" onClick={() => go("x")}>X</button>
        <button className="share-btn" onClick={copy}><Link2 size={18} /> Copy link</button>
      </div>
    </div>
  </div>;
}

// Share button: phones get their own share menu, everything else our sheet.
export function ShareButton({ channel, className = "", label = true, size = 20 }: { channel: Channel | null; className?: string; label?: boolean; size?: number }) {
  const [open, setOpen] = useState(false);
  const onClick = async () => { if (!(await nativeShare(channel))) setOpen(true); };
  return <>
    <button className={className} onClick={onClick} aria-label={channel ? `Share ${channel.n}` : "Share YokoTV"}><Share2 size={size} />{label && " Share"}</button>
    {open && <ShareSheet channel={channel} onClose={() => setOpen(false)} />}
  </>;
}

// The PWA install button; hidden in the Android app, which is already installed.
export function InstallButton() {
  const { canInstall, ios, installed } = useStore(install);
  const [tips, setTips] = useState(false);
  if (isApp || installed || (!canInstall && !ios)) return null;
  const onClick = async () => {
    if (canInstall) { if (await promptInstall()) toast("YokoTV is on your home screen."); }
    else setTips(true);
  };
  return <>
    <button className="nav-install" onClick={onClick}><Download size={17} /> Install app</button>
    {tips && <div className="sheet-backdrop" onClick={() => setTips(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Install YokoTV">
        <div className="sheet-head"><h2>Add YokoTV to your home screen</h2><button onClick={() => setTips(false)} aria-label="Close"><X size={22} /></button></div>
        <ol className="install-steps">
          <li>Tap the <b>Share</b> button <Share2 size={16} /> at the bottom of Safari.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>. YokoTV opens full screen like an app.</li>
        </ol>
      </div>
    </div>}
  </>;
}

import { Ban, ChevronDown, Flag, Send, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/Account";
import { account } from "@/lib/account";
import { isTV, useStore } from "@/lib/catalog";
import { type ChatMessage, REACTIONS } from "@/lib/live";

// Live chat beside the player. Reading is open to everyone; posting needs an
// account. TVs get a read-only view (typing with a remote is no fun).
export function LiveChat({ name, viewers, messages, send, report, moderate, onClose }: {
  name: string; viewers: number; messages: ChatMessage[];
  send: (text: string) => Promise<void>; report: (id: number) => void; moderate: (id: number, ban: boolean) => Promise<void>; onClose: () => void;
}) {
  const { user } = useStore(account);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [signin, setSignin] = useState(false);
  const [admin, setAdmin] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!user) { setAdmin(false); return; }
    fetch("/api/live/me", { credentials: "same-origin" }).then((r) => r.json()).then((j) => setAdmin(!!j.admin)).catch(() => undefined);
  }, [user]);
  // Stay pinned to the newest message unless the viewer has scrolled up to read.
  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await send(text); setText(""); }
    catch (err) { toast(err instanceof Error ? err.message : "Couldn't send that."); }
    finally { setBusy(false); }
  };

  return <aside className="tvp-chat" aria-label={`${name} live chat`}>
    <div className="tvp-guide-head"><h3>Live chat <span className="tvp-chat-count"><i className="live-dot" /> {viewers.toLocaleString()} watching</span></h3>
      <button className="tvp-icon" onClick={onClose} aria-label="Close chat" autoFocus={isTV}><ChevronDown size={22} /></button></div>
    <ol ref={list} className="tvp-chat-list">
      {!messages.length && <li className="tvp-chat-empty">No messages yet. Say something about what's on!</li>}
      {messages.map((m) => <li key={m.id}>
        <b>{m.name}</b> <span>{m.text}</span>
        {!isTV && <span className="tvp-chat-tools">
          <button onClick={() => { report(m.id); toast("Thanks, we'll look at that message."); }} aria-label="Report message" title="Report"><Flag size={13} /></button>
          {admin && <>
            <button onClick={() => moderate(m.id, false).catch(() => toast("Couldn't delete that."))} aria-label="Delete message" title="Delete"><Trash2 size={13} /></button>
            <button onClick={() => window.confirm(`Delete this message and ban ${m.name} from chat?`) && moderate(m.id, true).then(() => toast(`${m.name} is banned from chat.`))} aria-label="Delete and ban" title="Delete and ban"><Ban size={13} /></button>
          </>}
        </span>}
      </li>)}
    </ol>
    {isTV ? <p className="tvp-guide-note">Join the chat from your phone at yokotv.online.</p>
      : user ? <form className="tvp-chat-form" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Say something…" aria-label="Chat message" />
        <button className="tvp-icon" disabled={busy || !text.trim()} aria-label="Send"><Send size={18} /></button>
      </form>
      : <div className="tvp-chat-form"><button className="btn btn-light btn-block" onClick={() => setSignin(true)}>Sign in to chat</button></div>}
    <p className="tvp-chat-rules">Be kind. No hate, links or phone numbers.</p>
    {signin && <AccountSheet onClose={() => setSignin(false)} />}
  </aside>;
}

// Tap-to-react bar and the emoji that float up the screen for everyone watching.
export function Reactions({ react }: { react: (e: string) => void }) {
  return <div className="tvp-reactions" role="group" aria-label="React">
    {REACTIONS.map((e) => <button key={e} onClick={() => react(e)} aria-label={`React ${e}`}>{e}</button>)}
  </div>;
}

export function FloatingReactions({ bursts }: { bursts: { key: number; e: string }[] }) {
  return <div className="tvp-floats" aria-hidden="true">
    {bursts.map((b) => <span key={b.key} style={{ left: `${8 + ((b.key * 37) % 60)}%`, animationDelay: `${(b.key % 5) * 0.12}s` }}>{b.e}</span>)}
  </div>;
}

// Watch-along on the client: one poll every few seconds while a channel is open
// is both the "I'm watching" heartbeat and the feed of chat and reactions
// (server/live.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import { isTV } from "./catalog";

export type ChatMessage = { id: number; at: number; name: string; text: string };
export const REACTIONS = ["😂", "🔥", "😱", "❤️", "👏", "😭"] as const;
const POLL_MS = isTV ? 6000 : 4000;

function visitorId() {
  try { return localStorage.getItem("yokotv-vid") || ""; } catch { return ""; }
}
async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong.");
  return json;
}

export function useLive(channelId: string) {
  const [viewers, setViewers] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Each burst of reactions gets a key so the floating emoji animate once.
  const [bursts, setBursts] = useState<{ key: number; e: string }[]>([]);
  const since = useRef(0);
  const seenReactions = useRef<Record<string, number>>({});
  const burstKey = useRef(0);

  const float = useCallback((e: string, n: number) => {
    const add = Array.from({ length: Math.min(n, 6) }, () => ({ key: ++burstKey.current, e }));
    setBursts((b) => [...b.slice(-24), ...add]);
  }, []);

  useEffect(() => {
    let live = true;
    since.current = 0; seenReactions.current = {};
    setMessages([]); setViewers(0);
    const poll = async () => {
      if (document.hidden) return;
      try {
        const j = await post(`/api/live/${encodeURIComponent(channelId)}/poll`, { v: visitorId(), since: since.current });
        if (!live) return;
        setViewers(j.viewers || 0);
        const removed = new Set<number>(j.removed || []);
        if (j.messages?.length || removed.size) {
          setMessages((m) => [...m.filter((x) => !removed.has(x.id)), ...(j.messages as ChatMessage[]).filter((x) => !m.some((y) => y.id === x.id))].slice(-80));
          since.current = Math.max(since.current, ...(j.messages as ChatMessage[]).map((x) => x.id));
        }
        // Float only reactions that are new since the last poll.
        for (const [e, n] of Object.entries(j.reactions || {}) as [string, number][]) {
          const fresh = n - (seenReactions.current[e] || 0);
          if (fresh > 0 && !isTV) float(e, fresh);
        }
        seenReactions.current = j.reactions || {};
      } catch {}
    };
    poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => { live = false; window.clearInterval(t); };
  }, [channelId, float]);

  const send = useCallback(async (text: string) => {
    const j = await post(`/api/live/${encodeURIComponent(channelId)}/chat`, { text });
    setMessages((m) => [...m, j.message].slice(-80));
    since.current = Math.max(since.current, j.message.id);
  }, [channelId]);

  const react = useCallback((e: string) => {
    float(e, 1);
    seenReactions.current = { ...seenReactions.current, [e]: (seenReactions.current[e] || 0) + 1 };
    post(`/api/live/${encodeURIComponent(channelId)}/react`, { e }).catch(() => undefined);
  }, [channelId, float]);

  const report = useCallback((id: number) => {
    setMessages((m) => m.filter((x) => x.id !== id));
    post(`/api/live/${encodeURIComponent(channelId)}/report`, { msg: id, v: visitorId() }).catch(() => undefined);
  }, [channelId]);

  const moderate = useCallback(async (id: number, ban: boolean) => {
    await post(`/api/live/${encodeURIComponent(channelId)}/moderate`, { msg: id, ban });
    setMessages((m) => m.filter((x) => x.id !== id));
  }, [channelId]);

  return { viewers, messages, bursts, send, react, report, moderate };
}

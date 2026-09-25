// TV guide on the client: now + next for every channel with a guide (refreshed
// every 2 minutes), and a channel's full schedule on demand (server/epg.ts).
import { useEffect, useState, useSyncExternalStore } from "react";

export type Programme = { s: number; e: number; t: string; d?: string };
type NowNext = Record<string, [number, number, string][]>;

// One shared snapshot for every card: replaced when the guide reloads and once a
// minute, so "now" moves on by itself without a timer per card.
let snapshot: { ch: NowNext } = { ch: {} };
let started = false;
const listeners = new Set<() => void>();
const publish = (ch: NowNext) => { snapshot = { ch }; listeners.forEach((l) => l()); };

async function refresh() {
  try {
    const res = await fetch("/api/epg/now");
    if (res.ok) publish((await res.json()).ch || {});
  } catch {}
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!started) {
    started = true;
    refresh();
    window.setInterval(refresh, 120_000);
    window.setInterval(() => publish(snapshot.ch), 60_000);
  }
  return () => listeners.delete(l);
}

export function useGuide() {
  return useSyncExternalStore(subscribe, () => snapshot).ch;
}

export function onNow(guide: NowNext, id: string) {
  const now = Date.now();
  const list = (guide[id] || []).filter(([, e]) => e > now);
  const cur = list[0] && list[0][0] <= now ? list[0] : undefined;
  const next = cur ? list[1] : list[0];
  return {
    now: cur ? { s: cur[0], e: cur[1], t: cur[2], progress: (now - cur[0]) / (cur[1] - cur[0]) } : undefined,
    next: next ? { s: next[0], e: next[1], t: next[2] } : undefined,
  };
}

export function useSchedule(id: string, enabled: boolean) {
  const [list, setList] = useState<Programme[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setList(null);
    fetch(`/api/epg/${encodeURIComponent(id)}`).then((r) => r.json()).then((j) => live && setList(j.programmes || [])).catch(() => live && setList([]));
    return () => { live = false; };
  }, [id, enabled]);
  return list;
}

// Times in the viewer's own time zone, 24-hour: "19:30".
export const hhmm = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

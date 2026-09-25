import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type Sponsor = {
  id: string; name: string; link: string; image: string; alt: string; slots: string[];
  start: string; end: string; paused: boolean; running: boolean; views: number; clicks: number;
};
const SLOTS: [string, string][] = [["home", "Home page"], ["browse", "Browse pages"], ["guide", "TV guide"]];
const today = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
const blank = () => ({ id: "", name: "", link: "https://", alt: "", slots: ["home"], start: today(), end: "", paused: false, imageData: "" });
const fmt = (n: number) => n.toLocaleString("en-ZA");

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Something went wrong.");
  return j.sponsors as Sponsor[];
}

// Sponsors sold directly to businesses: add, edit, pause, remove, and see how
// each banner performs (views, clicks, click rate) to report back to them.
export default function AdminSponsors() {
  const [list, setList] = useState<Sponsor[] | null>(null);
  const [form, setForm] = useState<ReturnType<typeof blank> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("GET", "/api/admin/sponsors").then(setList).catch(() => setList([])); }, []);

  const pickImage = (file: File | undefined) => {
    if (!file || !form) return;
    if (file.size > 1.5 * 1024 * 1024) return void toast("That image is over 1.5 MB. Use a smaller one.");
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, imageData: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try { setList(await api("POST", "/api/admin/sponsors", form)); setForm(null); toast("Sponsor saved"); }
    catch (err) { toast(err instanceof Error ? err.message : "Couldn't save."); }
    finally { setBusy(false); }
  };
  const togglePause = async (s: Sponsor) => {
    try { setList(await api("POST", "/api/admin/sponsors", { ...s, paused: !s.paused })); } catch (err) { toast((err as Error).message); }
  };
  const remove = async (s: Sponsor) => {
    if (!window.confirm(`Remove ${s.name}? Its banner stops showing straight away.`)) return;
    try { setList(await api("DELETE", `/api/admin/sponsors/${s.id}`)); toast("Sponsor removed"); } catch (err) { toast((err as Error).message); }
  };

  return <section className="admin-card sponsors">
    <div className="sponsors-head"><h2>Sponsors</h2>{!form && <button className="btn btn-light" onClick={() => setForm(blank())}><Plus size={16} /> Add sponsor</button>}</div>
    <p className="admin-empty">Banners you sell directly. A running sponsor takes its ad spots ahead of Google ads. Best banner size: 1200 × 250 pixels (wide), PNG or JPG.</p>

    {form && <form className="acct-form sponsor-form" onSubmit={submit}>
      <label>Business name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required /></label>
      <label>Link (where the banner opens)<input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} type="url" required /></label>
      <label>Banner image{form.id && <em> (leave empty to keep the current one)</em>}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => pickImage(e.target.files?.[0])} /></label>
      {form.imageData && <img className="sponsor-preview" src={form.imageData} alt="Banner preview" />}
      <label>Description for screen readers <em>(optional)</em><input value={form.alt} onChange={(e) => setForm({ ...form, alt: e.target.value })} maxLength={120} /></label>
      <fieldset><legend>Show it on</legend>
        {SLOTS.map(([id, label]) => <label key={id} className="check"><input type="checkbox" checked={form.slots.includes(id)}
          onChange={(e) => setForm({ ...form, slots: e.target.checked ? [...form.slots, id] : form.slots.filter((x) => x !== id) })} /> {label}</label>)}
      </fieldset>
      <div className="sponsor-dates">
        <label>Starts<input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required /></label>
        <label>Ends <em>(optional)</em><input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
      </div>
      <div className="sheet-actions">
        <button className="btn btn-light" disabled={busy}>{busy ? "Saving…" : "Save sponsor"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
      </div>
    </form>}

    {!list ? <div className="loader" /> : !list.length ? !form && <p className="admin-empty">No sponsors yet. Add your first one when a business books a spot.</p>
      : <table className="sponsor-table"><thead><tr><th>Sponsor</th><th>Status</th><th>Dates</th><th>Views</th><th>Clicks</th><th>Click rate</th><th /></tr></thead>
        <tbody>{list.map((s) => <tr key={s.id}>
          <td><img src={`/sponsor-img/${s.image}`} alt="" /><div><strong>{s.name}</strong><span>{s.slots.map((x) => SLOTS.find(([id]) => id === x)?.[1]).join(", ")}</span></div></td>
          <td><span className={`sponsor-status ${s.running ? "on" : ""}`}>{s.paused ? "Paused" : s.running ? "Running" : s.start > today() ? "Scheduled" : "Ended"}</span></td>
          <td>{s.start}{s.end ? ` to ${s.end}` : " onwards"}</td>
          <td>{fmt(s.views)}</td><td>{fmt(s.clicks)}</td>
          <td>{s.views ? `${((s.clicks / s.views) * 100).toFixed(1)}%` : "–"}</td>
          <td className="sponsor-actions">
            <button onClick={() => setForm({ id: s.id, name: s.name, link: s.link, alt: s.alt, slots: s.slots, start: s.start, end: s.end, paused: s.paused, imageData: "" })} aria-label={`Edit ${s.name}`} title="Edit"><Pencil size={15} /></button>
            <button onClick={() => togglePause(s)} aria-label={s.paused ? `Resume ${s.name}` : `Pause ${s.name}`} title={s.paused ? "Resume" : "Pause"}>{s.paused ? <Play size={15} /> : <Pause size={15} />}</button>
            <button onClick={() => remove(s)} aria-label={`Remove ${s.name}`} title="Remove"><Trash2 size={15} /></button>
          </td>
        </tr>)}</tbody></table>}
  </section>;
}

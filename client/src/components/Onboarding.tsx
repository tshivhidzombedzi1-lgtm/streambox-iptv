import { Check, Tv } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { AccountSheet } from "@/components/Account";
import { CATEGORIES, guessCountry, isSlowNetwork, settings, useCatalog, useStore } from "@/lib/catalog";

const GENRES = CATEGORIES.filter((c) => !["general", "public", "shop", "interactive"].includes(c.id)).slice(0, 18);
const BOT = /bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent);

// First-visit setup: country, favourite genres, data saver, optional account.
// Only on browsing pages; someone who lands straight on a channel just watches.
export default function Onboarding() {
  const prefs = useStore(settings);
  const [location] = useLocation();
  const { catalog } = useCatalog();
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState(() => guessCountry());
  const [genres, setGenres] = useState<string[]>([]);
  const [saver, setSaver] = useState(() => prefs.dataSaver || isSlowNetwork());
  const [signup, setSignup] = useState(false);
  const onBrowsePage = location === "/" || location.startsWith("/browse") || location === "/south-africa";
  if (prefs.onboarded || BOT || !onBrowsePage) return null;

  const finish = (openSignup = false) => {
    settings.set({ ...settings.get(), onboarded: true, country, genres, dataSaver: saver });
    if (openSignup) setSignup(true);
  };
  if (signup) return <AccountSheet initial="signup" onClose={() => setSignup(false)} />;
  const countries = catalog ? Object.entries(catalog.countries).sort((a, b) => a[1].localeCompare(b[1])) : [];
  const toggle = (id: string) => setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  return <div className="sheet-backdrop onboard-backdrop">
    <div className="sheet onboard" role="dialog" aria-label="Welcome to YokoTV">
      <div className="onboard-steps">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
      {step === 0 && <>
        <Tv size={34} className="onboard-icon" />
        <h2>Welcome to YokoTV</h2>
        <p className="sheet-text">Thousands of live channels, free. No sign-up needed. Tell us where you are and we'll put your local channels first.</p>
        <label className="onboard-field">I'm watching from
          <select value={country} onChange={(e) => setCountry(e.target.value)} autoFocus>
            {!countries.some(([c]) => c === country) && <option value={country}>{country}</option>}
            {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select></label>
        <div className="sheet-actions"><button className="btn btn-light btn-block" onClick={() => setStep(1)}>Next</button></div>
      </>}
      {step === 1 && <>
        <h2>What do you like to watch?</h2>
        <p className="sheet-text">Pick a few and they'll be at the top of your home screen. You can skip this.</p>
        <div className="onboard-genres">{GENRES.map((g, i) => <button key={g.id} className={`chip ${genres.includes(g.id) ? "on" : ""}`} onClick={() => toggle(g.id)} autoFocus={i === 0} aria-pressed={genres.includes(g.id)}>
          {genres.includes(g.id) && <Check size={14} />} {g.label}</button>)}</div>
        <div className="sheet-actions"><button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button><button className="btn btn-light grow" onClick={() => setStep(2)}>{genres.length ? "Next" : "Skip"}</button></div>
      </>}
      {step === 2 && <>
        <h2>Almost done</h2>
        <label className="setting"><div><strong>Data saver</strong><span>Plays channels in lower quality so they don't buffer on slow or expensive data. {isSlowNetwork() && "Your connection looks slow, so we've turned it on."}</span></div>
          <button role="switch" aria-checked={saver} className={`switch ${saver ? "on" : ""}`} onClick={() => setSaver(!saver)}><i /></button></label>
        <p className="sheet-text">Want My List and Continue watching on your phone, laptop and TV? Create a free account. It's optional.</p>
        <div className="sheet-actions stack">
          <button className="btn btn-light btn-block" onClick={() => finish(false)} autoFocus>Start watching</button>
          <button className="btn btn-ghost btn-block" onClick={() => finish(true)}>Create a free account</button>
        </div>
      </>}
    </div>
  </div>;
}

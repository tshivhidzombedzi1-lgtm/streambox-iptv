import { BarChart3, CalendarClock, LayoutGrid, Mail, MonitorSmartphone, Tv } from "lucide-react";
import { Link } from "wouter";

const CONTACT = "support@yokotv.online";
const MAILTO = `mailto:${CONTACT}?subject=${encodeURIComponent("Advertising on YokoTV")}&body=${encodeURIComponent("Hi YokoTV,\n\nWe'd like to advertise on YokoTV.\n\nBusiness name:\nWebsite:\nWhich spots interest us (home page, browse pages, TV guide):\nWhen we'd like to start:\n\nThanks,")}`;

// The pitch page for businesses buying sponsor banners (managed in /admin).
export default function AdvertiseScreen() {
  return <div className="app"><article className="legal advertise">
    <Link href="/" className="legal-back">← Back to YokoTV</Link>
    <h1>Advertise on YokoTV</h1>
    <p className="advertise-lead">Put your business in front of South Africans while they watch live TV: on their phones, laptops and smart TVs.</p>
    <a className="btn btn-light btn-lg" href={MAILTO}><Mail size={20} /> Book a spot</a>

    <h2>Who you'll reach</h2>
    <p>YokoTV is a free live TV service built for South Africa. Local channels like SABC 1, SABC 2, SABC 3 and SABC News come first, alongside news, sport, music, movies, kids and African channels from around the world, plus a daily TV guide. Viewers come back every day, at the same times, for the shows they follow.</p>

    <h2>Where your banner appears</h2>
    <div className="advertise-grid">
      <div><LayoutGrid size={22} /><h3>Home page</h3><p>Between the channel rows everyone scrolls past to pick what to watch.</p></div>
      <div><Tv size={22} /><h3>Browse pages</h3><p>At the top of every category: news, sport, music, movies, kids and more.</p></div>
      <div><CalendarClock size={22} /><h3>TV guide</h3><p>On the daily schedule page people check before prime time.</p></div>
      <div><MonitorSmartphone size={22} /><h3>Every screen</h3><p>Your banner shows on phones, computers and smart TVs, and never covers the video.</p></div>
    </div>

    <h2>How it works</h2>
    <ul>
      <li><b>Your banner, your link.</b> Send us a wide image (1200 × 250 pixels works best) and the page it should open.</li>
      <li><b>Your dates.</b> Book by the week or month, for one spot or all three.</li>
      <li><b>Only your brand.</b> While your booking runs, your banner replaces the general ads in the spots you book.</li>
      <li><b>Clear reporting.</b> <BarChart3 size={15} className="inline-icon" /> We count how many times your banner was seen and clicked, and send you the numbers.</li>
    </ul>

    <h2>Rates and booking</h2>
    <p>Email <a href={MAILTO}>{CONTACT}</a> with your business name and the spots you're interested in, and we'll send our current rates and availability.</p>
    <p className="legal-date">Adverts must be legal, truthful and suitable for a general audience. We don't accept gambling, adult or misleading ads. See our <Link href="/terms">Terms of Service</Link>.</p>
  </article></div>;
}

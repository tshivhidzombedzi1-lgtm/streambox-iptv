import { Link } from "wouter";

const CONTACT = "privacy@yokotv.online";

export default function PrivacyScreen() {
  return <div className="app"><article className="legal">
    <Link href="/" className="legal-back">← Back to YokoTV</Link>
    <h1>Privacy policy</h1>
    <p className="legal-date">Last updated 25 September 2026</p>

    <h2>The short version</h2>
    <p>You can watch YokoTV without an account. If you create one, we keep your email address and the lists and settings you ask us to sync, and nothing else about you. We show Google ads, and Google uses cookies to do that.</p>

    <h2>Without an account</h2>
    <p>My List, Continue watching and your settings are saved only in your browser (local storage) on that device. We don't receive them.</p>

    <h2>With an account</h2>
    <ul>
      <li><b>What we store:</b> your email address, the name you give (optional), your password in scrambled (hashed) form that we can't read, and your synced My List, Continue watching and settings.</li>
      <li><b>Why:</b> to sign you in and keep your lists the same on every device, and to email you a link if you forget your password. We don't send marketing emails.</li>
      <li><b>Sign-in cookie:</b> one cookie keeps you signed in for up to 180 days. It's removed when you sign out.</li>
      <li><b>Deleting:</b> open your account on YokoTV and choose <i>Delete account</i>. Your account and everything synced with it are erased straight away.</li>
    </ul>

    <h2>Live chat</h2>
    <p>Messages you post in a channel's live chat are public to everyone watching that channel, shown with your account name (never your email). Chat isn't saved: each channel keeps only its latest 80 messages in the server's memory, and they disappear when the server restarts. We count how many people are watching each channel using the same random browser ID as the statistics below. Messages with slurs, links or phone numbers are blocked, reported messages are hidden, and people who break the rules can be banned from chat.</p>

    <h2>Audience statistics</h2>
    <p>To see how YokoTV is used, the app counts page views, plays, shares and installs. It sends a random ID made up by your browser (not linked to your name, email or account), the kind of device, your time zone's country, and the site that sent you here. We don't store IP addresses in these statistics, and we only keep daily totals plus the random IDs needed to count unique visitors, for up to 400 days.</p>

    <h2>Advertising</h2>
    <p>YokoTV is free because of ads served by Google AdSense. Google and its partners use cookies to show ads and to measure them, and may use them to personalise ads based on your visits to this and other sites. You can turn off personalised ads at <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">Google Ad Settings</a> and read how Google uses data at <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">policies.google.com</a>.</p>

    <h2>Channels and streams</h2>
    <p>Live channels are streamed from each broadcaster's own servers, and some pass through ours so they play in your browser. Broadcasters can see that a stream was requested, as with any website video.</p>

    <h2>Your rights</h2>
    <p>Under South Africa's Protection of Personal Information Act (POPIA) you can ask what we hold about you, have it corrected or deleted, or object to how it's used. Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. You can also complain to the Information Regulator (inforegulator.org.za).</p>
  </article></div>;
}

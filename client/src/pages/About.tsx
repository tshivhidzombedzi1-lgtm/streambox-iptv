import { Link } from "wouter";

const CONTACT = "support@yokotv.online";

export default function AboutScreen() {
  return <div className="app"><article className="legal">
    <Link href="/" className="legal-back">← Back to YokoTV</Link>
    <h1>About YokoTV</h1>
    <p>YokoTV brings free live TV into one fast, simple player. South African channels come first, followed by news, sport, music, movies, kids' and African channels from around the world, all in one place with a daily <Link href="/tv-guide">TV guide</Link>.</p>

    <h2>How it works</h2>
    <p>Broadcasters and free streaming services publish live channels on the internet. YokoTV finds them, checks every stream several times a day so channels that go off air drop off the list, and plays them in a player built for phones, laptops and smart TVs. It works on slow connections too: a data saver lowers the quality automatically when your network struggles.</p>
    <p>YokoTV doesn't own or produce the channels. They belong to their broadcasters, and they can change or go off air at any time. Some channels are only available in certain countries, and YokoTV only shows you the ones that play where you are.</p>

    <h2>Free, and funded by advertising</h2>
    <p>You don't need to pay or sign up to watch. YokoTV shows adverts on its browsing pages, never over the video. A free account is optional: it keeps your list, what you're watching and your settings in sync across your devices.</p>

    <h2>Contact</h2>
    <p>Questions, feedback or partnership ideas: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
    <p>Broadcasters and rights owners: if you'd like a channel removed or want to talk about carrying your channel on YokoTV, email us. Removal requests are handled as described in our <Link href="/terms">Terms of Service</Link>.</p>
    <p>See also our <Link href="/privacy">privacy policy</Link>.</p>
  </article></div>;
}

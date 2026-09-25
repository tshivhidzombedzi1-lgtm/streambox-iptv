import { Link } from "wouter";

const CONTACT = "support@yokotv.online";
const UPDATED = "25 September 2026";

export default function TermsScreen() {
  return <div className="app"><article className="legal">
    <Link href="/" className="legal-back">← Back to YokoTV</Link>
    <h1>Terms of Service</h1>
    <p className="legal-date">Last updated {UPDATED}</p>
    <p>These terms apply when you use YokoTV at yokotv.online, including the installable app. By using YokoTV you agree to them. If you don't agree, please don't use the service.</p>

    <h2>1. What YokoTV is</h2>
    <p>YokoTV is a guide and player for live TV channels that broadcasters and streaming services make freely available on the internet. We don't produce, own or host the channels. The video comes from each broadcaster's own servers, and some streams pass through ours only so that they play in your browser.</p>
    <p>Channels, programmes and schedules belong to their owners. Channels can go off air, change or be withdrawn at any time, and some are only available in certain countries. We check streams regularly, but we can't promise that any channel, programme or TV guide listing will be available, complete or accurate.</p>

    <h2>2. Who can use YokoTV</h2>
    <p>You can watch without an account. To create an account you must be at least 13 years old; if you're under 18, a parent or guardian should agree to these terms with you. Some channels may show content meant for adults. It's up to parents and guardians to decide what children watch.</p>

    <h2>3. Your account</h2>
    <ul>
      <li>Keep your password private. You're responsible for what happens on your account.</li>
      <li>Give a real email address you control, so you can reset your password.</li>
      <li>You can delete your account at any time from the account menu. How we handle your data is explained in our <Link href="/privacy">privacy policy</Link>.</li>
    </ul>

    <h2>4. Using YokoTV fairly</h2>
    <p>You agree not to:</p>
    <ul>
      <li>copy, record, re-stream, resell or charge others for access to channels or streams found through YokoTV;</li>
      <li>scrape, crawl or bulk-download our channel list, TV guide or stream links, or use them to build another service;</li>
      <li>try to break, overload, hack or get around any part of the service or its security;</li>
      <li>use YokoTV for anything unlawful, or to harass, defraud or harm anyone;</li>
      <li>interfere with the adverts that keep YokoTV free, or click them fraudulently.</li>
    </ul>
    <p>If you break these rules we may suspend or close your account, block access, and where needed report the matter to the authorities.</p>

    <h2>5. Copyright and takedown requests</h2>
    <p>We respect the rights of broadcasters and content owners. If you own the rights to a channel or programme and don't want it listed on YokoTV, or believe something on YokoTV infringes your rights, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with:</p>
    <ul>
      <li>your name, organisation and contact details;</li>
      <li>the channel or page concerned (a yokotv.online link is ideal);</li>
      <li>the rights you hold, and a statement that the information in your notice is true and that you are the owner or authorised to act for them.</li>
    </ul>
    <p>We aim to remove or disable access to the material promptly, usually within 48 hours of a complete notice, in line with the Electronic Communications and Transactions Act, 2002. Making a false takedown request may make you liable for the damage it causes.</p>

    <h2>6. Advertising</h2>
    <p>YokoTV is free because it shows adverts, including ads from Google AdSense. Advertisers are responsible for their own ads and the sites they lead to; an ad on YokoTV isn't an endorsement. See the <Link href="/privacy">privacy policy</Link> for how ads use cookies.</p>

    <h2>7. Paid services</h2>
    <p>YokoTV is free today. If we offer paid options in future (for example an ad-free or premium plan), these terms apply to them:</p>
    <ul>
      <li><b>Price and billing:</b> the price, what's included and how often you're billed will be shown clearly before you pay. Prices are in South African rand and include VAT where it applies. Payments are handled by a secure payment provider; we never see or store your full card details.</li>
      <li><b>Renewals:</b> subscriptions renew automatically at the end of each billing period until you cancel. We'll tell you in advance, by email, before any price change takes effect, and you can cancel before it does.</li>
      <li><b>Cancelling:</b> you can cancel at any time from your account. You keep the paid features until the end of the period you've paid for, and you won't be charged again.</li>
      <li><b>Cooling-off period:</b> you can cancel a new subscription within 7 days of your first payment for a full refund, as provided by section 44 of the Electronic Communications and Transactions Act.</li>
      <li><b>Refunds:</b> apart from the cooling-off period, payments for time already started aren't refundable, unless the law requires otherwise or the paid service didn't work because of a fault on our side. Nothing in these terms limits your rights under the Consumer Protection Act, 2008.</li>
      <li><b>What you pay for:</b> paid plans cover YokoTV's own features. Because channels belong to third parties (see section 1), a paid plan doesn't guarantee that any particular channel will be available.</li>
    </ul>

    <h2>8. Our liability</h2>
    <p>YokoTV is provided "as is" and "as available". To the extent the law allows, we aren't liable for indirect or consequential losses, for content on third-party channels or websites, for channels that stop working, or for interruptions to the service. If we are found liable to you, our total liability is limited to the amount you paid us in the 12 months before the claim, or R500 if you haven't paid us anything. None of this limits liability that the law doesn't allow us to limit, including under the Consumer Protection Act.</p>
    <p>You're responsible for your own internet and data costs while using YokoTV. Streaming uses a lot of data; the Data saver setting helps.</p>

    <h2>9. Changes</h2>
    <p>We may update the service and these terms. If we make an important change we'll show a notice on the site, or email account holders, before it takes effect. Using YokoTV after the change means you accept the updated terms.</p>

    <h2>10. Law and disputes</h2>
    <p>These terms are governed by the laws of the Republic of South Africa. If you have a complaint, please contact us first so we can try to sort it out. If we can't, the dispute may be referred to the South African courts that have jurisdiction.</p>

    <h2>11. Contact</h2>
    <p>Questions, complaints and takedown requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
  </article></div>;
}

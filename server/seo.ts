// Server-side SEO for the single-page app: every route gets its own title,
// description, canonical URL and structured data, plus a visible "About YokoTV"
// footer of crawlable text and links after #root. Also serves robots.txt and
// a sitemap built from the live catalog, and real 404s for unknown URLs.
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { readConfig as readAdsConfig } from "./ads";
import { type CatalogChannel, getCatalog } from "./catalog";

const SITE = "https://yokotv.online";
const LABELS: Record<string, string> = {
  news: "News", sports: "Sports", movies: "Movies", series: "Series", entertainment: "Entertainment", music: "Music",
  anime: "Anime", african: "African & Black TV", kids: "Kids", animation: "Animation", documentary: "Documentary", comedy: "Comedy", lifestyle: "Lifestyle",
  cooking: "Cooking", travel: "Travel", science: "Science", business: "Business", classic: "Classic TV", family: "Family",
  culture: "Culture", education: "Education", outdoor: "Outdoor", auto: "Auto", weather: "Weather", religious: "Faith",
  general: "General", public: "Public", legislative: "Government", relax: "Relax", shop: "Shopping",
};
const SA_NAMES = "SABC 1, SABC 3, SABC News, SABC Education";

type Page = { status: number; title: string; description: string; path: string; heading: string; intro: string; links: [string, string][]; jsonLd?: object[]; noindex?: boolean };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const watchPath = (ch: CatalogChannel) => `/watch/${encodeURIComponent(ch.id)}`;
const country = (code: string) => getCatalog()?.countries[code] || code;
const channelLinks = (list: CatalogChannel[], n = 60): [string, string][] => list.slice(0, n).map((c) => [watchPath(c), `${c.n} live`]);
const categoryLinks = (): [string, string][] => Object.entries(LABELS).map(([id, label]) => [`/browse/${id}`, `${label} channels`]);

function pageFor(req: Request): Page | { redirect: string } {
  const url = new URL(req.originalUrl, SITE);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const cat = getCatalog();
  const channels = cat?.channels || [];
  const za = channels.filter((c) => c.c === "ZA");
  const total = channels.length ? channels.length.toLocaleString("en-ZA") : "thousands of";

  if (p === "/home") return { redirect: "/" };
  if (p === "/live" || p === "/channels") return { redirect: "/browse/all" };
  if (p === "/browse/all" && url.searchParams.get("country") === "ZA") return { redirect: "/south-africa" };

  if (p === "/") return {
    status: 200, path: "/",
    title: "YokoTV: Watch Live TV Free in South Africa | SABC, News, Sport & Music",
    description: `Watch free live TV online in South Africa with no sign-up: ${SA_NAMES}, plus ${total} channels of news, sport, music, movies, kids and anime. Works on your phone, laptop and smart TV.`,
    heading: "Watch live TV free in South Africa",
    intro: `YokoTV streams ${total} free live TV channels, starting with South Africa's own: ${SA_NAMES}, community channels like Soweto TV, Cape Town TV and 1KZN TV, and news from Africa and the world. No account, no subscription and no app needed. It works on phones, laptops and smart TVs, and a data saver keeps streams smooth on slow connections.`,
    links: [["/south-africa", "South African TV channels"], ...categoryLinks(), ...channelLinks([...za, ...channels.filter((c) => c.c !== "ZA")], 60)],
    jsonLd: [{
      "@context": "https://schema.org", "@type": "WebSite", name: "YokoTV", url: `${SITE}/`, inLanguage: "en-ZA",
      description: "Free live TV streaming in South Africa and worldwide.",
      potentialAction: { "@type": "SearchAction", target: `${SITE}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
    }],
  };

  if (p === "/south-africa") return {
    status: 200, path: "/south-africa",
    title: "South African TV Live: Watch SABC 1, SABC 3 & SABC News Free | YokoTV",
    description: `Stream South African TV live and free: ${SA_NAMES}, Soweto TV, Cape Town TV, 1KZN TV, Tshwane TV and more. ${za.length || "All"} local channels, no sign-up, on any device.`,
    heading: "South African TV channels, live and free",
    intro: `Watch ${za.length || "all the"} South African channels live on YokoTV: ${za.slice(0, 12).map((c) => c.n).join(", ")}. Every stream is checked every six hours, so channels that go off air drop off the list on their own.`,
    links: [...channelLinks(za, 100), ["/browse/news", "News channels"], ["/browse/sports", "Sports channels"], ["/browse/music", "Music channels"]],
    jsonLd: [itemList("South African TV channels", za)],
  };

  const browse = p.match(/^\/browse\/([a-z]+)$/);
  if (browse) {
    const id = browse[1];
    if (id !== "all" && !LABELS[id]) return notFound(p);
    const label = id === "all" ? "All" : LABELS[id];
    const list = id === "all" ? channels : channels.filter((c) => c.k.includes(id));
    const zaFirst = [...list.filter((c) => c.c === "ZA"), ...list.filter((c) => c.c !== "ZA")];
    const noun = id === "all" ? "live TV channels" : `${label.toLowerCase()} channels`;
    return {
      status: 200, path: p,
      title: `${id === "all" ? "All live TV channels" : `Live ${label}${/\bTV$/.test(label) ? "" : " TV"} channels`}: Watch free online in South Africa | YokoTV`,
      description: `Watch ${list.length.toLocaleString("en-ZA")} ${noun} live and free on YokoTV, including ${zaFirst.slice(0, 5).map((c) => c.n).join(", ")}. No sign-up; works on phone, laptop and smart TV.`,
      heading: id === "all" ? "All live TV channels" : `Live ${label} channels`,
      intro: `${list.length.toLocaleString("en-ZA")} free ${noun} streaming now on YokoTV.`,
      links: [...channelLinks(zaFirst, 80), ...categoryLinks()],
      jsonLd: [itemList(`${label} channels`, zaFirst)],
    };
  }

  const watch = p.match(/^\/watch\/([^/]+)$/);
  if (watch) {
    const ch = channels.find((c) => c.id === decodeURIComponent(watch[1]));
    if (!ch) return cat ? notFound(p) : { ...fallback(p), status: 200 };
    const where = country(ch.c);
    const kinds = ch.k.map((k) => LABELS[k] || k).join(", ");
    const related = channels.filter((c) => c.id !== ch.id && (c.c === ch.c || c.k[0] === ch.k[0]));
    return {
      status: 200, path: watchPath(ch),
      title: `Watch ${ch.n} live free online | YokoTV`,
      description: `Stream ${ch.n} live and free on YokoTV: ${kinds} from ${where}. No sign-up, works on phone, laptop and smart TV${ch.c === "ZA" ? " anywhere in South Africa" : ""}.`,
      heading: `${ch.n} live`,
      intro: `${ch.n} is a ${kinds.toLowerCase()} channel from ${where}. Watch it live on YokoTV, free and without an account.`,
      links: [...channelLinks(related, 24), ...(ch.c === "ZA" ? [["/south-africa", "More South African channels"] as [string, string]] : [])],
      jsonLd: [{
        "@context": "https://schema.org", "@type": "BroadcastService", name: ch.n, broadcastDisplayName: ch.n, url: `${SITE}${watchPath(ch)}`,
        areaServed: ch.c === "INT" ? undefined : where, genre: kinds, ...(ch.l ? { logo: ch.l } : {}),
      }],
    };
  }

  if (p === "/privacy") return {
    status: 200, path: "/privacy", title: "Privacy policy | YokoTV",
    description: "How YokoTV handles your data: optional accounts, synced lists, Google AdSense cookies, and your rights under POPIA.",
    heading: "Privacy policy", intro: "", links: [["/", "Watch live TV"], ["/south-africa", "South African TV channels"]],
  };
  if (p === "/terms") return {
    status: 200, path: "/terms", title: "Terms of Service | YokoTV",
    description: "The terms for using YokoTV: how the free live TV guide works, fair use, copyright and takedown requests, advertising, and paid services.",
    heading: "Terms of Service", intro: "", links: [["/", "Watch live TV"], ["/privacy", "Privacy policy"]],
  };
  if (p === "/search" || p === "/my-list" || p === "/favorites" || p === "/reset" || p === "/admin") return { ...fallback(p), status: 200, noindex: true };
  return notFound(p);
}

function itemList(name: string, list: CatalogChannel[]) {
  return {
    "@context": "https://schema.org", "@type": "ItemList", name,
    itemListElement: list.slice(0, 30).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${watchPath(c)}`, name: c.n })),
  };
}

function fallback(p: string): Page {
  return { status: 200, path: p, title: "YokoTV: Watch Live TV Free in South Africa", description: "Free live TV streaming in South Africa and worldwide.", heading: "YokoTV", intro: "", links: categoryLinks() };
}

function notFound(p: string): Page {
  return { ...fallback(p), status: 404, noindex: true, title: "Page not found | YokoTV", heading: "Page not found", intro: "That page doesn't exist. Try the live TV channels below." };
}

// AdSense wants its script in the page <head> (that is how it verifies the site).
// Left out on the player, so ads never cover a channel, and on TVs, which can't use them.
const TV_UA = /smart-?tv|tizen|web0s|webos|netcast|hbbtv|bravia|vidaa|hisense|philipstv|roku|crkey|googletv|android tv|\bAFT[A-Z]|opera tv/i;
function adsScript(req: Request, page: Page) {
  const { client } = readAdsConfig();
  if (!client || page.path.startsWith("/watch/") || TV_UA.test(req.headers["user-agent"] || "")) return "";
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(client)}" crossorigin="anonymous"></script>`;
}

function render(template: string, page: Page, extraHead = "") {
  const canonical = `${SITE}${page.path === "/" ? "/" : page.path}`;
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.noindex ? `<meta name="robots" content="noindex, follow" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    ...(page.jsonLd || []).map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>`),
    extraHead,
  ].join("\n    ");
  const body = `<section class="seo-foot" aria-label="About YokoTV"><h2>${esc(page.heading)}</h2>${page.intro ? `<p>${esc(page.intro)}</p>` : ""}<nav><ul>${page.links.map(([href, text]) => `<li><a href="${esc(href)}">${esc(text)}</a></li>`).join("")}</ul></nav></section>`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta name="description"[^>]*>/, "")
    .replace(/\s*<link rel="canonical"[^>]*>/, "")
    .replace(/\s*<meta (property="og:(title|description|url)"|name="twitter:(title|description)")[^>]*>/g, "")
    .replace("</head>", `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"></div>\n    ${body}`);
}

function sitemap() {
  const cat = getCatalog();
  const urls: [string, string, string][] = [["/", "hourly", "1.0"], ["/south-africa", "daily", "0.9"], ["/browse/all", "daily", "0.8"]];
  for (const id of Object.keys(LABELS)) if (cat?.channels.some((c) => c.k.includes(id))) urls.push([`/browse/${id}`, "daily", "0.7"]);
  // South African channels first, then the best-scored channels worldwide.
  const list = cat ? [...cat.channels.filter((c) => c.c === "ZA"), ...cat.channels.filter((c) => c.c !== "ZA").slice(0, 3000)] : [];
  for (const ch of list) urls.push([watchPath(ch), "daily", ch.c === "ZA" ? "0.8" : "0.5"]);
  const lastmod = (cat?.builtAt || new Date().toISOString()).slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([u, f, pr]) => `  <url><loc>${esc(SITE + u)}</loc><lastmod>${lastmod}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join("\n")}\n</urlset>\n`;
}

export function registerSeo(app: Express, distPath: string) {
  const template = fs.readFileSync(path.resolve(distPath, "index.html"), "utf8");
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").set("Cache-Control", "public, max-age=86400").send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
  });
  app.get("/sitemap.xml", (_req, res) => {
    res.type("application/xml").set("Cache-Control", "public, max-age=3600").send(sitemap());
  });
  app.use("*", (req: Request, res: Response) => {
    const page = pageFor(req);
    if ("redirect" in page) { res.redirect(301, page.redirect); return; }
    res.status(page.status).set("Cache-Control", "public, max-age=0, must-revalidate").type("html").send(render(template, page, adsScript(req, page)));
  });
}

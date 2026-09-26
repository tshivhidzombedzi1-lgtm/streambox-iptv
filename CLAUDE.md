# YokoTV — project guide for agents

YokoTV (https://yokotv.online) is a free live-TV site for South Africa and the world:
a Netflix-style React app plus a Node/Express server, built from the public IPTV-Org
and Free-TV playlists. It is **live in production** with real users, AdSense, sponsors
and Stripe payments (Premium R29/month, R249/year, once-off tips).

**Current task: the Android app (TV + phone).** Read [docs/ANDROID_APP.md](docs/ANDROID_APP.md)
before doing anything. The app wraps this existing site; do not rebuild the UI.

## Stack

| Part | Where | Notes |
|---|---|---|
| Web app | `client/src` | React 19 + Vite + Tailwind 4, wouter routes in `App.tsx`, screens in `pages/`, shared UI in `components/TV.tsx` |
| Player | `client/src/components/TVPlayer.tsx` | hls.js (lazy-loaded), D-pad/remote support, quality menu, EPG |
| Server | `server/` (entry `server/_core/index.ts`) | Express; bundled by esbuild to `dist/index.js` |
| Channel list | `server/catalog.ts` | Probes ~16k streams, keeps ~7.7k live ones, refreshes on a timer. `/api/catalog/lite` (no stream URLs) + `/api/streams/:id` |
| Stream relay | `server/streamProxy.ts` | `/api/stream/m?...` for streams that need headers/CORS |
| TV guide | `server/epg.ts` | DStv API (SA) + mjh.nz XMLTV; `/api/epg/now`, `/api/epg/today`, `/api/epg/:id` |
| SEO | `server/seo.ts` | Per-route titles/meta, crawlable footer, sitemap, robots; injects the AdSense loader |
| Accounts | `server/accounts.ts` | Email/password + Google sign-in, SQLite via `node:sqlite` (`data/yokotv.db`) |
| Payments | `server/payments.ts` | Stripe Checkout (ZAR), webhook, billing portal, `/api/pay/*` |
| Sponsors / ads | `server/sponsors.ts`, `server/ads.ts`, `client/src/components/AdSlot.tsx` | Sponsor banners beat AdSense; Premium users see no ads |
| Stats | `server/stats.ts` | Anonymous beacons, `/admin` dashboard |

Design tokens are in `client/src/index.css` (`--bg #08090d`, `--surface`, `--accent #6c8cff`,
`--accent-2 #5ec8ff`, Premium gold `#f5c451`; fonts Space Grotesk + DM Sans). Glass panels:
`.glass`, `.panel`, `.kpi`, `.segmented`. Any new page must match this look.

## TV mode (important for the Android app)

`isTV` in `client/src/lib/catalog.ts` is true when the user agent matches TV patterns
(including `android tv`). TV mode adds `.tv` to the page: no blur/animations, big focus
rings, arrow keys move focus instead of seeking, and no ads. Old TV browsers are supported
(build target `chrome61`, no `aspect-ratio`).

## Run locally

```bash
pnpm install
pnpm dev          # http://localhost:3000, server + Vite
pnpm check        # TypeScript
```

`data/` is not in git (it holds user accounts, secrets and caches). The server creates what
it needs on first start; building the channel list from scratch takes a while. To skip that,
unzip `yokotv-sample-data.zip` (the channel list and TV guide, no secrets) into `data/`.
Payments, Google sign-in and AdSense stay off locally unless configured in `/admin`.

## Production (Hostinger, LiteSpeed + Passenger)

- The app lives in `~/domains/yokotv.online/hbuilds/source/repository`. LiteSpeed serves
  `~/domains/yokotv.online/public_html` first, so hashed build files are copied to
  `public_html/assets/`. Never put `index.html`, `sw.js` or a manifest in `public_html`.
- Node is `/opt/alt/alt-nodejs22/root/usr/bin/node`. The host has a strict thread limit, so
  build with `RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 GOMAXPROCS=1 NODE_OPTIONS=--v8-pool-size=1`
  and retry if vite/esbuild abort.
- Deploy: `npx vite build`, then esbuild (see `package.json` `build`), then
  `cp -a dist/public/assets/. ~/domains/yokotv.online/public_html/assets/`, then restart by
  killing the `lsnode:.../domains/yokotv...` process (`tmp/restart.txt` does not work).
  Check with `curl https://yokotv.online/`.
- Work branch: `yokotv-live`.

## Rules

- **The GitHub repo is public.** Never commit `data/`, keys, `.env`, keystores or anything
  from `st.env`. Stripe keys are pasted by the owner into `/admin`, never by an agent.
- Don't bypass broadcasters' geo-blocks. Geo-locked streams are only shown in their country.
- The owner wants a professional product: no chat widgets, fake viewer counts or gimmicks;
  English channels first; South African channels prominent.
- Commits: author `tshivhidzombedzi1-lgtm <mbedzimz1@gmail.com>`.

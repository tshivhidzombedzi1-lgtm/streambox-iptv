// HLS relay for streams the browser cannot load directly: http-only sources
// (blocked on an https page), sources without CORS, and sources that need a
// specific User-Agent or Referer. Playlists are rewritten so every nested
// playlist, key and segment also flows through here.
import { Readable } from "node:stream";
import type { Express, Request, Response } from "express";
import { allowHost, BROWSER_UA, isAllowedHost } from "./catalog";

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i;

function encode(url: string) {
  return Buffer.from(url).toString("base64url");
}

function decode(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(Buffer.from(value, "base64url").toString("utf8"));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (PRIVATE_HOST.test(url.hostname) || !isAllowedHost(url.host)) return null;
    return url;
  } catch {
    return null;
  }
}

function upstreamHeaders(req: Request) {
  const headers: Record<string, string> = { "User-Agent": typeof req.query.ua === "string" ? req.query.ua : BROWSER_UA };
  if (typeof req.query.r === "string") headers.Referer = req.query.r;
  if (typeof req.headers.range === "string") headers.Range = req.headers.range;
  return headers;
}

function passthrough(req: Request) {
  const extra = new URLSearchParams();
  if (typeof req.query.ua === "string") extra.set("ua", req.query.ua);
  if (typeof req.query.r === "string") extra.set("r", req.query.r);
  const tail = extra.toString();
  return tail ? `&${tail}` : "";
}

function rewritePlaylist(body: string, base: string, req: Request) {
  const extra = passthrough(req);
  const isMaster = body.includes("#EXT-X-STREAM-INF");
  const link = (uri: string, kind: "m" | "s") => {
    const absolute = new URL(uri, base);
    allowHost(absolute.host);
    return `/api/stream/${kind}?u=${encode(absolute.toString())}${extra}`;
  };
  return body.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      // URI="..." inside tags: alternate renditions are playlists, keys/maps are files.
      return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${link(uri, trimmed.startsWith("#EXT-X-MEDIA") || trimmed.startsWith("#EXT-X-I-FRAME") ? "m" : "s")}"`);
    }
    return link(trimmed, isMaster || /\.m3u8(\?|$)/i.test(trimmed) ? "m" : "s");
  }).join("\n");
}

export function registerStreamProxy(app: Express) {
  app.get("/api/stream/m", async (req: Request, res: Response) => {
    const url = decode(req.query.u);
    if (!url) { res.status(403).end(); return; }
    try {
      const upstream = await fetch(url, { headers: upstreamHeaders(req), redirect: "follow", signal: AbortSignal.timeout(12000) });
      if (!upstream.ok) { res.status(upstream.status === 404 ? 404 : 502).end(); return; }
      const body = await upstream.text();
      if (!body.trimStart().startsWith("#EXTM3U")) { res.status(502).end(); return; }
      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.set("Cache-Control", "no-store");
      res.send(rewritePlaylist(body, upstream.url, req));
    } catch {
      res.status(504).end();
    }
  });

  app.get("/api/stream/s", async (req: Request, res: Response) => {
    const url = decode(req.query.u);
    if (!url) { res.status(403).end(); return; }
    const controller = new AbortController();
    req.on("close", () => controller.abort());
    try {
      const upstream = await fetch(url, { headers: upstreamHeaders(req), redirect: "follow", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
      res.status(upstream.status);
      for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
        const value = upstream.headers.get(name);
        if (value) res.set(name, value);
      }
      res.set("Cache-Control", "public, max-age=30");
      if (!upstream.body) { res.end(); return; }
      Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).on("error", () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) res.status(504).end();
    }
  });
}

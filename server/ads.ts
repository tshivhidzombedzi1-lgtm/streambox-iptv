// Google AdSense settings, read from data/ads.json so the publisher ID and ad
// slots can change without a rebuild. With no publisher ID, no ads load at all.
//   { "client": "ca-pub-1234567890123456", "slots": { "home": "1234567890", "browse": "0987654321" } }
// "slots" is optional: with only "client", AdSense Auto ads places ads itself.
import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";

const FILE = path.resolve(process.cwd(), "data", "ads.json");
type AdsConfig = { client: string; slots: Record<string, string> };

export function readConfig(): AdsConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    const client = typeof raw.client === "string" && /^ca-pub-\d{10,20}$/.test(raw.client.trim()) ? raw.client.trim() : "";
    const slots: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.slots || {})) if (typeof v === "string" && /^\d{6,20}$/.test(v)) slots[k] = v;
    return { client, slots };
  } catch {
    return { client: "", slots: {} };
  }
}

export function registerAdsRoutes(app: Express) {
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ client: "", slots: { home: "", browse: "" } }, null, 2) + "\n");
  app.get("/api/config", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json({ ads: readConfig() });
  });
  // AdSense requires ads.txt at the site root naming the publisher.
  app.get("/ads.txt", (_req, res) => {
    const { client } = readConfig();
    res.type("text/plain").set("Cache-Control", "public, max-age=3600")
      .send(client ? `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : "# No ad partners yet.\n");
  });
}

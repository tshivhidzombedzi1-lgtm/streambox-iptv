// Re-apply tags and language ranking (English first) to data/catalog.json without
// re-testing every stream. Full rebuilds do this themselves.
import fs from "node:fs";
import { type Catalog, rankByLanguage, tagAfrican } from "../server/catalog";

const file = "data/catalog.json";
const catalog = JSON.parse(fs.readFileSync(file, "utf8")) as Catalog;
const feeds = await fetch("https://iptv-org.github.io/api/feeds.json").then((r) => r.json());
tagAfrican(catalog.channels);
rankByLanguage(catalog.channels, feeds);
fs.writeFileSync(file + ".tmp", JSON.stringify(catalog));
fs.renameSync(file + ".tmp", file);
const count = [0, 1, 2].map((t) => catalog.channels.filter((c) => c.en === t).length);
console.log(`English ${count[0]}, probably English ${count[1]}, other languages ${count[2]}`);

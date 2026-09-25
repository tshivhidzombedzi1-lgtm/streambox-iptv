// Manually rebuild data/catalog.json (the server also refreshes it every 6h).
import fs from "node:fs";
import { buildCatalog } from "../server/catalog";

const catalog = await buildCatalog();
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/catalog.json", JSON.stringify(catalog));

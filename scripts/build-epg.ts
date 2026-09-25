// Manually rebuild data/epg.json (the server also refreshes it every 3h).
import { startCatalog } from "../server/catalog";
import { buildEpg } from "../server/epg";

startCatalog(); // loads data/catalog.json
await buildEpg();
process.exit(0);

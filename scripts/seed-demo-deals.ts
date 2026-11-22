// Fills a verification fixture's deal list with three made-up Colorado deals, so the Today page has something to show.
//   node --experimental-strip-types scripts/seed-demo-deals.ts --data-dir <the data directory `control-omb.ts launch` printed>
// Refuses any folder outside the temp folders, and a deal list that already holds deals: a real install is never seeded.
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, isAbsolute } from "node:path";

import { seedDemoDeals } from "../server/deals/demo.ts";
import { localDay, openDealStore } from "../server/deals/store.ts";
import { hostTimeZone } from "../server/turn-clock.ts";

const at = process.argv.indexOf("--data-dir");
const given = at > 0 ? process.argv[at + 1] : undefined;
if (!given) {
  console.error("usage: node --experimental-strip-types scripts/seed-demo-deals.ts --data-dir <fixture data directory>");
  process.exit(2);
}
const dataDir = realpathSync(given);
// control-omb.ts makes a fixture's data directory in the system temp folder, or in /tmp when it drives a browser.
const temps = [tmpdir(), ...(process.platform === "win32" ? [] : ["/tmp"])].map((dir) => realpathSync(dir));
const inside = (root: string) => {
  const path = relative(root, dataDir);
  return Boolean(path) && !path.startsWith("..") && !isAbsolute(path);
};
if (!temps.some(inside)) {
  console.error(`Refusing ${dataDir}: demo deals go only into a fixture's data directory under ${temps.join(" or ")}.`);
  process.exit(1);
}
const store = openDealStore(dataDir);
try {
  if (store.list("all").length) {
    console.error(`Refusing ${dataDir}: its deal list already holds deals.`);
    process.exit(1);
  }
  const ids = seedDemoDeals(store, localDay(Date.now(), hostTimeZone()));
  console.log(JSON.stringify({ dataDir, deals: ids }));
} finally {
  store.close();
}

// Standbilder zu beliebigen Zeiten: PW=<node_modules> node probe.mjs <f> <ausgabeordner> [rm] t1 t2 …
// Schreibt außerdem build/timeline.json (TIMELINE) und, mit --srt, captions.srt.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HIER = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(process.env.PW + "/x.js")("playwright-core");
let [f, aus, ...rest] = process.argv.slice(2);
const rm = rest[0] === "rm" ? (rest.shift(), 1) : 0;
const [W, H] = { "16x9": [1920, 1080], "9x16": [1080, 1920], "1x1": [1080, 1080] }[f];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--font-render-hinting=none"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const fehler = []; p.on("pageerror", (e) => fehler.push(e.message)); p.on("console", (m) => { if (m.type() === "error") fehler.push(m.text()); });
await p.goto(`file://${resolve(HIER, "film.html")}?f=${f}&rm=${rm}`);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
if (fehler.length) { console.error(fehler.join("\n")); process.exit(1); }
mkdirSync(aus, { recursive: true });
const tl = await p.evaluate(() => window.TIMELINE);
writeFileSync(resolve(HIER, "../build/timeline.json"), JSON.stringify(tl, null, 1));
for (const t of rest.map(Number)) { await p.evaluate((t) => window.seek(t), t);
  await p.screenshot({ path: `${aus}/${f}${rm ? "_rm" : ""}_t${t.toFixed(2).padStart(5, "0")}.png` }); }
await b.close();

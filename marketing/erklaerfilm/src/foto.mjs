// Ganzseitiges Bild einer HTML-Seite. Aufruf: PW=<node_modules> node foto.mjs <seite.html> <ausgabe.png> [breite]
import { createRequire } from "node:module";
import { resolve } from "node:path";
const { chromium } = createRequire(process.env.PW + "/x.js")("playwright-core");
const [seite, aus, breite = "1400"] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: +breite, height: 900 } });
await p.goto("file://" + resolve(seite)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
await p.screenshot({ path: aus, fullPage: true });
await b.close();

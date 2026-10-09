// Prüft, ob ein Bild eine reine Funktion von t ist: dasselbe t zweimal malen (mit anderem t dazwischen, auch in frischer Seite) und Bytes vergleichen.
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const HIER = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(process.env.PW + "/x.js")("playwright-core");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--font-render-hinting=none"] });
const h = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
async function seite() { const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(`file://${resolve(HIER, "film.html")}?f=16x9`); await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; })))); return p; }
const ergebnis = [];
for (const t of [3.5, 31.7, 44.3, 52.0]) {
  const p1 = await seite(); await p1.evaluate((t) => seek(t), t); const a = await p1.screenshot();
  await p1.evaluate(() => seek(12.3)); await p1.evaluate((t) => seek(t), t); const c = await p1.screenshot();
  const p2 = await seite(); await p2.evaluate(() => seek(58)); await p2.evaluate((t) => seek(t), t); const d = await p2.screenshot();
  ergebnis.push(`t=${t}: ${h(a)} ${h(c)} ${h(d)} ${h(a) === h(c) && h(a) === h(d) ? "identisch" : "ABWEICHUNG"}`);
  await p1.close(); await p2.close();
}
console.log(ergebnis.join("\n")); await b.close();

// Druckt broschuere.html als A4-PDF (Chromium) und legt Seitenvorschauen an.
// Aufruf: PW=<Ordner mit node_modules/playwright-core> node bauen.mjs [vorschau-ordner]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const holen = createRequire(process.env.PW + "/x.js"); const { chromium } = holen("playwright-core");
const vorschau = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--font-render-hinting=none"] });
const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await p.goto(`file://${process.cwd()}/broschuere.html`);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
// Kontrolle: Überlauf je Seite (Inhalt unter dem Fuß) und Bilder, die nicht geladen wurden
const befund = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll(".seite").forEach((s, n) => {
    const r = s.getBoundingClientRect(), fuss = s.querySelector(".fuss");
    const grenze = fuss && !fuss.style.top ? fuss.getBoundingClientRect().top - 2 : r.bottom;
    s.querySelectorAll(":scope > *:not(.fuss):not(.held):not(.bild)").forEach((e) => {
      const u = e.getBoundingClientRect().bottom; if (u > grenze) out.push(`Seite ${n + 1}: ${e.className || e.tagName} reicht ${Math.round(u - grenze)} px über den Fuß`); });
  });
  document.querySelectorAll("img").forEach((i) => { if (!i.naturalWidth) out.push("Bild fehlt: " + i.src); });
  return out;
});
console.log(befund.length ? befund.join("\n") : "Kein Überlauf, alle Bilder geladen.");
await p.emulateMedia({ media: "print" });
await p.pdf({ path: "CENTRIC_Info.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
if (vorschau) {
  mkdirSync(vorschau, { recursive: true });
  const n = await p.evaluate(() => document.querySelectorAll(".seite").length);
  for (let i = 0; i < n; i++) {
    const el = (await p.$$(".seite"))[i];
    await el.screenshot({ path: `${vorschau}/seite${String(i + 1).padStart(2, "0")}.jpg`, type: "jpeg", quality: 80 });
  }
}
await b.close();

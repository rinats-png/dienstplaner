/* Rastert die Bildmarke (public/centric-bildmarke.svg) zu den PNG-Symbolen.
   Einmalig bei Markenwechsel von Hand: `node werkzeug/icons-bauen.mjs`
   (braucht `sharp`, das nicht zu den Abhängigkeiten gehört).
   Die Symbole heißen `icon-v4-*`, weil server.mjs `/icon-*.png` ein Jahr
   unveränderlich ausliefert — ein neuer Name ersetzt das alte Symbol. */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const pub = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("centric-bildmarke.svg", pub), "utf8");
const innen = svg.replace(/^[\s\S]*?<defs><\/defs>/, "").replace(/<\/svg>\s*$/, "");
const marke = innen.replace(/<rect[^>]*\/>/, "");   // C und Punkt ohne das Quadrat
const FARBE = "#10222A";

const randlos = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${FARBE}"/>${marke}</svg>`;
const maskierbar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${FARBE}"/><g transform="translate(10 10) scale(.8)">${marke}</g></svg>`;

const png = async (quelle, groesse, name) =>
  writeFile(new URL(name, pub), await sharp(Buffer.from(quelle), { density: 384 }).resize(groesse, groesse).png().toBuffer());

for (const g of [192, 512]) {
  await png(svg, g, `icon-v4-${g}.png`);
  await png(maskierbar, g, `icon-v4-${g}-maskierbar.png`);
}
for (const g of [16, 32]) await png(svg, g, `favicon-${g}.png`);
await png(randlos, 180, "apple-touch-icon.png");

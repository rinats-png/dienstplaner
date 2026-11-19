/* ==========================================================================
   SW-FASSUNG (WP-37)

   Die Fassung des Dienstarbeiters (public/sw.js) war eine von Hand gezählte
   Zeichenkette. Vergaß jemand sie hochzuzählen, hielt ein Gerät den alten
   Speicher fest. Jetzt steht in der Quelle ein Platzhalter, und der Bau setzt
   einen Hashwert über das ganze Ergebnis ein: Dateinamen und Größe aller
   Dateien im Bau (ohne sw.js selbst), dazu den Inhalt von index.html, des
   Manifests und der Quelle des Dienstarbeiters.

   Fehlt der Platzhalter, bricht der Bau ab. Ein stiller Rückfall auf eine
   alte, feste Fassung wäre genau der Fehler, den diese Datei beseitigt.
   ========================================================================== */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

export const PLATZHALTER = "__CENTRIC_BUILD__";

async function dateien(wurzel, rel = "") {
  const aus = [];
  for (const e of await readdir(path.join(wurzel, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) aus.push(...await dateien(wurzel, r));
    else aus.push(r);
  }
  return aus.sort();
}

/** Ersetzt den Platzhalter in <dist>/sw.js und gibt die Fassung zurück. */
export async function swStempeln(dist) {
  const swPfad = path.join(dist, "sw.js");
  const quelle = await readFile(swPfad, "utf8");
  if (!quelle.includes(`"${PLATZHALTER}"`))
    throw new Error(`sw.js: Platzhalter ${PLATZHALTER} fehlt — die Fassung muss aus dem Bau kommen.`);
  const h = createHash("sha256");
  h.update(quelle);
  for (const rel of await dateien(dist)) {
    if (rel === "sw.js") continue;
    h.update(`\n${rel}:${(await stat(path.join(dist, rel))).size}`);
    if (/^(index\.html|manifest\.webmanifest)$/.test(rel)) h.update(await readFile(path.join(dist, rel)));
  }
  const fassung = h.digest("hex").slice(0, 12);
  await writeFile(swPfad, quelle.split(`"${PLATZHALTER}"`).join(`"${fassung}"`));
  return fassung;
}

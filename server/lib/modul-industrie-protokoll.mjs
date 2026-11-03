/* ==========================================================================
   BETRIEBSPROTOKOLL DER INDUSTRIEMODULE (WP-19.10 bis 19.12)

   Was am Betriebsprotokoll (server/lib/schutz.mjs, `protokoll`) von den
   Industriemodulen ankommt: nur, DASS sich etwas geändert hat, und wie viele
   Datensätze — keine Namen, keine Personenkennung, kein Tag, keine Werte.
   Dieselbe Linie wie bei Einwilligungen und Planfreigaben (daten.mjs):
   „ohne Inhalt, ohne Person“. Wer ändert, steht ohnehin in `wer` des
   Protokollaufrufs (Rolle, betriebsinterne Kennung).

   Rein: vergleicht zwei Stände, schreibt nichts.
   ========================================================================== */
import { istAnlage } from "./modul-anlagen.mjs";

const liste = (w) => (Array.isArray(w) ? w.filter((x) => x && typeof x === "object") : []);
const mandanten = (b) => liste(b && b.mandanten);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Die Protokollereignisse zu einer Speicherung.
 * Ohne gespeicherten Stand (Ersteinrichtung des Raums) gibt es keine Änderung.
 * @param {any} altBestand gespeicherter Gesamtbestand
 * @param {any} neuBestand zu schreibender Gesamtbestand
 * @returns {{ ereignis: string, detail: string }[]}
 */
export function industrieProtokoll(altBestand, neuBestand) {
  if (!altBestand) return [];
  const aus = [];
  let geaendert = 0, neu = 0, entfernt = 0;
  for (const m of mandanten(neuBestand)) {
    const a = mandanten(altBestand).find((x) => x.id === m.id);
    if (!a) continue;
    const vorher = new Map(liste(a.betriebsmittel).filter(istAnlage).map((x) => [String(x.id), x]));
    const nachher = new Map(liste(m.betriebsmittel).filter(istAnlage).map((x) => [String(x.id), x]));
    for (const [id, x] of nachher) {
      if (!vorher.has(id)) neu++;
      else if (!gleich(vorher.get(id), x)) geaendert++;
    }
    for (const id of vorher.keys()) if (!nachher.has(id)) entfernt++;
  }
  const summe = geaendert + neu + entfernt;
  if (summe) aus.push({ ereignis: "anlage-geaendert", detail: `${summe} Anlage(n): ${geaendert} geändert, ${neu} neu, ${entfernt} entfernt` });
  return aus;
}

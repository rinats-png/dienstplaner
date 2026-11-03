/* ==========================================================================
   BETRIEBSPROTOKOLL DER INDUSTRIEMODULE (WP-19.10 bis 19.12)

   Was am Betriebsprotokoll (server/lib/schutz.mjs, `protokoll`) von den
   Industriemodulen ankommt: nur, DASS sich etwas geändert hat, und wie viele
   Datensätze — keine Namen, keine Personenkennung, kein Tag, keine Werte.
   Dieselbe Linie wie bei Einwilligungen und Planfreigaben (daten.mjs):
   „ohne Inhalt, ohne Person“. Wer ändert, steht ohnehin in `wer` des
   Protokollaufrufs (Rolle, betriebsinterne Kennung).

   Ereignisse:
     anlage-geaendert                  Anlagen (Betriebsmittel Art „anlage“)       WP-19.10
     maschinenkompetenz-geaendert      Kompetenzen zu Anlagen / befähigte Person   WP-19.11
     qualifikationsgrundlage-geaendert Nachweise mit Qualifikationsgrundlage       WP-19.11
     regelwert-geaendert               Regelwerte der Industriemodule              WP-19.11, 19.12

   Rein: vergleicht zwei Stände, schreibt nichts.
   ========================================================================== */
import { istAnlage } from "./modul-anlagen.mjs";
import { INDUSTRIE_REGELWERTE } from "./modul-regelwerte.mjs";

const liste = (w) => (Array.isArray(w) ? w.filter((x) => x && typeof x === "object") : []);
const mandanten = (b) => liste(b && b.mandanten);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Zählt Änderungen zwischen zwei Mengen mit Schlüssel. */
function vergleiche(vorher, nachher) {
  let geaendert = 0, neu = 0, entfernt = 0;
  for (const [id, x] of nachher) {
    if (!vorher.has(id)) neu++;
    else if (!gleich(vorher.get(id), x)) geaendert++;
  }
  for (const id of vorher.keys()) if (!nachher.has(id)) entfernt++;
  return { geaendert, neu, entfernt, summe: geaendert + neu + entfernt };
}

const kompetenzen = (m) => {
  const ids = new Set(liste(m && m.betriebsmittel).filter(istAnlage).map((a) => String(a.id)));
  return new Map(liste(m && m.kompetenzen)
    .filter((k) => k.art === "geraet" && (k.befaehigtePerson === true || ids.has(String(k.betriebsmittelId)))).map((k) => [String(k.id), k]));
};

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
  const an = { geaendert: 0, neu: 0, entfernt: 0, summe: 0 };
  const ko = { geaendert: 0, neu: 0, entfernt: 0, summe: 0 };
  let nachweise = 0, regelwerte = 0;
  for (const m of mandanten(neuBestand)) {
    const a = mandanten(altBestand).find((x) => x.id === m.id);
    if (!a) continue;
    const addiere = (ziel, v) => { for (const k of ["geaendert", "neu", "entfernt", "summe"]) ziel[k] += v[k]; };
    addiere(an, vergleiche(new Map(liste(a.betriebsmittel).filter(istAnlage).map((x) => [String(x.id), x])),
      new Map(liste(m.betriebsmittel).filter(istAnlage).map((x) => [String(x.id), x]))));
    addiere(ko, vergleiche(kompetenzen(a), kompetenzen(m)));
    /* Qualifikationsgrundlagen: je Person und Kompetenz, ohne die Person zu nennen. */
    const altP = new Map(liste(a.personen).map((p) => [String(p.id), p]));
    for (const p of liste(m.personen)) {
      const vorher = new Map(liste(altP.get(String(p.id)) && altP.get(String(p.id)).kompetenzNachweise).map((n) => [String(n.kompetenzId), n.qualifikationsgrundlage]));
      const jetzt = new Map(liste(p.kompetenzNachweise).map((n) => [String(n.kompetenzId), n.qualifikationsgrundlage]));
      for (const id of new Set([...vorher.keys(), ...jetzt.keys()])) if (!gleich(vorher.get(id) ?? null, jetzt.get(id) ?? null)) nachweise++;
    }
    const altR = a.einstellungen && a.einstellungen.regelwerte && typeof a.einstellungen.regelwerte === "object" ? a.einstellungen.regelwerte : {};
    const neuR = m.einstellungen && m.einstellungen.regelwerte && typeof m.einstellungen.regelwerte === "object" ? m.einstellungen.regelwerte : {};
    for (const id of Object.keys(INDUSTRIE_REGELWERTE)) if (!gleich(altR[id] ?? null, neuR[id] ?? null)) regelwerte++;
  }
  if (an.summe) aus.push({ ereignis: "anlage-geaendert", detail: `${an.summe} Anlage(n): ${an.geaendert} geändert, ${an.neu} neu, ${an.entfernt} entfernt` });
  if (ko.summe) aus.push({ ereignis: "maschinenkompetenz-geaendert", detail: `${ko.summe} Kompetenz(en): ${ko.geaendert} geändert, ${ko.neu} neu, ${ko.entfernt} entfernt` });
  if (nachweise) aus.push({ ereignis: "qualifikationsgrundlage-geaendert", detail: `${nachweise} Nachweis(e)` });
  if (regelwerte) aus.push({ ereignis: "regelwert-geaendert", detail: `${regelwerte} Regelwert(e)` });
  return aus;
}

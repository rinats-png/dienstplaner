/* ==========================================================================
   AUSWERTUNG FÜR DEN BETRIEBSRAT — nur Aggregate (WP-27)

   Der Betriebsrat bekommt keine Ist-Zeiten einzelner Personen (sicht.mjs,
   E1) und das Bestätigungsprotokoll nur als Zählwerte (WP-10). Für die
   Mitbestimmung braucht er dennoch Belastung und Arbeitszeit des Betriebs.
   Diese Auswertung rechnet der Server aus dem vollständigen Bestand und gibt
   nur Summen je Monat und Einheit (und für den ganzen Betrieb) heraus:

     dienste, nachtdienste, sonntagsdienste, langeDienste (über zehn Stunden),
     ruhezeitUnter11 (zwischen zwei Diensten nach Plan), istStunden und
     istErfasst (bestätigte Ist-Zeiten, nur vergangene Tage)

   Mindestgruppe: Haben in einer Zeile weniger als BR_MINDESTGRUPPE Personen
   Dienst, stehen dort keine Zahlen, nur „<3" — eine kleine Einheit ließe
   sonst auf einzelne Personen schließen. Personen werden nie genannt.

   Rein bis auf den Zwischenspeicher je Stand.
   ========================================================================== */
import { addDays, dow, dauer, fenster } from "./regelwerk.mjs";
import { dienstAm, einheitAm, imDienst, nachtAnteil, nachtschwelle } from "./fachpruefung.mjs";

/** Mindestgruppe für Zählwerte an den Betriebsrat (WP-10 M1-Rest, WP-27). */
export const BR_MINDESTGRUPPE = 3;
/** Zeitraum der Auswertung: so viele ganze Monate zurück und voraus. */
export const BR_MONATE_ZURUECK = 6;
export const BR_MONATE_VORAUS = 2;

const liste = (w) => (Array.isArray(w) ? w : []).filter((x) => x && typeof x === "object");
const monatVon = (d) => d.slice(0, 7);
const monatPlus = (monat, n) => {
  const [j, m] = monat.split("-").map(Number);
  const z = j * 12 + (m - 1) + n;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
};
const ZAHLEN = ["dienste", "nachtdienste", "sonntagsdienste", "langeDienste", "ruhezeitUnter11", "istStunden", "istErfasst"];

const SPEICHER = new Map();

/**
 * Die Auswertung eines Betriebs. Zwischengespeichert je Betrieb, Stand und Tag.
 * @param {any} m Betrieb (vollständig)
 * @param {string} heute JJJJ-MM-TT
 * @returns {{ stand: string, von: string, bis: string, mindestgruppe: number,
 *   zeilen: { monat: string, einheitId: string | null, personen: number | string, gesperrt: boolean,
 *     dienste?: number, nachtdienste?: number, sonntagsdienste?: number, langeDienste?: number,
 *     ruhezeitUnter11?: number, istStunden?: number, istErfasst?: number }[] }}
 */
export function betriebsratAuswertung(m, heute) {
  const schluessel = `${m && m.id}|${m && m.stand}|${heute}`;
  if (SPEICHER.has(schluessel)) return SPEICHER.get(schluessel);
  const von = `${monatPlus(monatVon(heute), -BR_MONATE_ZURUECK)}-01`;
  const bisMonat = monatPlus(monatVon(heute), BR_MONATE_VORAUS);
  const bis = addDays(`${monatPlus(bisMonat, 1)}-01`, -1);
  const einst = (m && m.einstellungen) || {};
  const da = new Map(liste(m && m.dienstarten).map((x) => [String(x.id), x]));
  const erfassung = m && m.erfassung && typeof m.erfassung === "object" ? m.erfassung : {};
  /** zeile je „monat|einheit" und „monat|*" */
  const zeilen = new Map();
  const zeile = (monat, eid) => {
    const k = `${monat}|${eid}`;
    let z = zeilen.get(k);
    if (!z) { z = { monat, einheitId: eid === "*" ? null : eid, personenSet: new Set(), dienste: 0, nachtdienste: 0, sonntagsdienste: 0,
      langeDienste: 0, ruhezeitUnter11: 0, istStunden: 0, istErfasst: 0 }; zeilen.set(k, z); }
    return z;
  };
  for (const p of liste(m && m.personen)) {
    if (p.rolle === "betriebsrat" && p.imSchichtdienst === false) continue;
    let vorher = null;                                                       // { d, ende } des letzten Dienstes
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      if (!imDienst(p, d)) { vorher = null; continue; }
      const id = dienstAm(m, p, d);
      const x = id ? da.get(String(id)) : null;
      if (!x || !x.start || !x.ende) { if (!id) vorher = null; continue; }
      const eid = einheitAm(p, d) || "ohne";
      const [start, ende] = fenster(d, x);
      for (const z of [zeile(monatVon(d), String(eid)), zeile(monatVon(d), "*")]) {
        z.personenSet.add(String(p.id));
        z.dienste++;
        if (nachtAnteil(x, einst) >= nachtschwelle(einst)) z.nachtdienste++;
        if (dow(d) === 6) z.sonntagsdienste++;
        if (x.form !== "ruf" && dauer(x) > 10) z.langeDienste++;
        if (vorher && x.form !== "ruf" && (start - vorher.ende) / 60 < 11) z.ruhezeitUnter11++;
        const e = erfassung[`${p.id}|${d}`];
        if (d < heute && e && e.bestaetigt) {
          const [s2, e2] = fenster(d, { start: e.start || x.start, ende: e.ende || x.ende });
          z.istStunden += Math.max(0, (e2 - s2) / 60 - (x.pause || 0) / 60);
          z.istErfasst++;
        }
      }
      vorher = x.form === "ruf" ? vorher : { d, ende };
    }
  }
  const aus = [];
  /* Zweitsperre: Ist in einem Monat eine Einheit gesperrt, fällt auch die
     Gesamtzeile des Betriebs weg — sonst ergäbe Gesamt minus übrige Einheiten
     die Zahlen der kleinen Einheit. */
  const monatGesperrt = new Set([...zeilen.values()].filter((z) => z.einheitId !== null && z.personenSet.size < BR_MINDESTGRUPPE).map((z) => z.monat));
  for (const z of zeilen.values()) {
    const n = z.personenSet.size;
    if (n < BR_MINDESTGRUPPE || (z.einheitId === null && monatGesperrt.has(z.monat))) { aus.push({ monat: z.monat, einheitId: z.einheitId, personen: `<${BR_MINDESTGRUPPE}`, gesperrt: true }); continue; }
    const r = { monat: z.monat, einheitId: z.einheitId, personen: n, gesperrt: false };
    for (const f of ZAHLEN) r[f] = f === "istStunden" ? Math.round(z[f] * 10) / 10 : z[f];
    aus.push(r);
  }
  aus.sort((a, b) => a.monat.localeCompare(b.monat) || String(a.einheitId ?? "").localeCompare(String(b.einheitId ?? "")));
  const ergebnis = { stand: heute, von, bis, mindestgruppe: BR_MINDESTGRUPPE, zeilen: aus };
  if (SPEICHER.size > 50) SPEICHER.clear();
  SPEICHER.set(schluessel, ergebnis);
  return ergebnis;
}

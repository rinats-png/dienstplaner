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

   IST-ZEITEN (Review WP-27, F1). Das Ist zählt nur, wer seine Zeit bestätigt
   hat — das sind oft weniger Personen als die mit geplantem Dienst. Darum
   gilt für Ist-Stunden und Ist-Erfassungen eine eigene Mindestgruppe:
     - mindestens BR_MINDESTGRUPPE Personen tragen zum Ist der Zeile bei,
     - der Monat ist abgeschlossen UND die Frist zum nachträglichen Bestätigen
       (RUECKBLICK_TAGE) ist vorbei. Vorher änderte jede Bestätigung die
       Summe, und zwei Abrufe an aufeinanderfolgenden Tagen ergäben die
       Zeit einer einzelnen Person als Differenz.
     - Zweitsperre: trägt in einem Monat eine Einheit mit 1 oder 2 Personen
       zum Ist bei, fällt auch das Ist der Gesamtzeile weg.
   Sonst stehen Ist-Stunden und Ist-Erfassungen als null („–"): Plan-Zahlen
   bleiben (der Betriebsrat sieht den Plan ohnehin), das Ist nicht.

   RECHNEN OHNE BLOCKIEREN (F3). Je Person und Tag über neun Monate ist bei
   2000 Personen Sekundensache. Die Rechnung ist ein Generator, der nach
   höchstens BR_HAEPPCHEN_MS nachgibt; auswertungHolen rechnet sie im
   Hintergrund (setImmediate) und merkt das Ergebnis je Raum, Stand der
   Ablage und Tag. Bis es fertig ist, bekommt der Abruf „wird berechnet"
   (Wiederholen), nie einen blockierten Prozess.
   ========================================================================== */
import { addDays, dow, dauer, fenster } from "./regelwerk.mjs";
import { dienstAm, einheitAm, imDienst, nachtAnteil, nachtschwelle } from "./fachpruefung.mjs";
import { RUECKBLICK_TAGE } from "./zeiterfassung.mjs";

/** Mindestgruppe für Zählwerte an den Betriebsrat (WP-10 M1-Rest, WP-27). */
export const BR_MINDESTGRUPPE = 3;
/** Zeitraum der Auswertung: so viele ganze Monate zurück und voraus. */
export const BR_MONATE_ZURUECK = 6;
export const BR_MONATE_VORAUS = 2;
/** Längste Rechenzeit am Stück, dann gibt die Rechnung nach (wie die Fachprüfung). */
export const BR_HAEPPCHEN_MS = 12;

const liste = (w) => (Array.isArray(w) ? w : []).filter((x) => x && typeof x === "object");
const monatVon = (d) => d.slice(0, 7);
const monatPlus = (monat, n) => {
  const [j, m] = monat.split("-").map(Number);
  const z = j * 12 + (m - 1) + n;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
};
const ZAHLEN = ["dienste", "nachtdienste", "sonntagsdienste", "langeDienste", "ruhezeitUnter11", "istStunden", "istErfasst"];


/**
 * Die Auswertung eines Betriebs in Häppchen: der Generator gibt nach
 * höchstens BR_HAEPPCHEN_MS am Stück nach.
 * @param {any} m Betrieb (vollständig)
 * @param {string} heute JJJJ-MM-TT
 * @returns {Generator<void, Auswertung, void>}
 *
 * @typedef {{ stand: string, von: string, bis: string, mindestgruppe: number,
 *   zeilen: { monat: string, einheitId: string | null, personen: number | string, gesperrt: boolean,
 *     dienste?: number, nachtdienste?: number, sonntagsdienste?: number, langeDienste?: number,
 *     ruhezeitUnter11?: number, istStunden?: number | null, istErfasst?: number | null }[] }} Auswertung
 */
export function* auswertungSchritte(m, heute) {
  const von = `${monatPlus(monatVon(heute), -BR_MONATE_ZURUECK)}-01`;
  const bisMonat = monatPlus(monatVon(heute), BR_MONATE_VORAUS);
  const bis = addDays(`${monatPlus(bisMonat, 1)}-01`, -1);
  const einst = (m && m.einstellungen) || {};
  const da = new Map(liste(m && m.dienstarten).map((x) => [String(x.id), x]));
  const erfassung = m && m.erfassung && typeof m.erfassung === "object" ? m.erfassung : {};
  /* Das Ist eines Monats ist erst frei, wenn niemand mehr nachbestätigen kann. */
  const istFrei = (monat) => heute > addDays(addDays(`${monatPlus(monat, 1)}-01`, -1), RUECKBLICK_TAGE);
  /** zeile je „monat|einheit" und „monat|*" */
  const zeilen = new Map();
  const zeile = (monat, eid) => {
    const k = `${monat}|${eid}`;
    let z = zeilen.get(k);
    if (!z) { z = { monat, einheitId: eid === "*" ? null : eid, personenSet: new Set(), istSet: new Set(), dienste: 0, nachtdienste: 0, sonntagsdienste: 0,
      langeDienste: 0, ruhezeitUnter11: 0, istStunden: 0, istErfasst: 0 }; zeilen.set(k, z); }
    return z;
  };
  let t = performance.now();
  let n = 0;
  for (const p of liste(m && m.personen)) {
    if (p.rolle === "betriebsrat" && p.imSchichtdienst === false) continue;
    let vorher = null;                                                       // { d, ende } des letzten Dienstes
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      if ((++n & 15) === 0 && performance.now() - t > BR_HAEPPCHEN_MS) { yield; t = performance.now(); }
      if (!imDienst(p, d)) { vorher = null; continue; }
      const id = dienstAm(m, p, d);
      const x = id ? da.get(String(id)) : null;
      if (!x || !x.start || !x.ende) { if (!id) vorher = null; continue; }
      const eid = einheitAm(p, d) || "ohne";
      const [start, ende] = fenster(d, x);
      const ist = erfassung[`${p.id}|${d}`];
      const istZaehlt = d < heute && ist && ist.bestaetigt && istFrei(monatVon(d));
      const istTeilnahme = d < heute && ist && ist.bestaetigt;              // trägt zum Ist bei, auch wenn der Monat noch nicht frei ist
      for (const z of [zeile(monatVon(d), String(eid)), zeile(monatVon(d), "*")]) {
        z.personenSet.add(String(p.id));
        z.dienste++;
        if (nachtAnteil(x, einst) >= nachtschwelle(einst)) z.nachtdienste++;
        if (dow(d) === 6) z.sonntagsdienste++;
        if (x.form !== "ruf" && dauer(x) > 10) z.langeDienste++;
        if (vorher && x.form !== "ruf" && (start - vorher.ende) / 60 < 11) z.ruhezeitUnter11++;
        if (istTeilnahme) z.istSet.add(String(p.id));
        if (istZaehlt) {
          const [s2, e2] = fenster(d, { start: ist.start || x.start, ende: ist.ende || x.ende });
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
     die Zahlen der kleinen Einheit. Dasselbe, getrennt, für das Ist. */
  const monatGesperrt = new Set([...zeilen.values()].filter((z) => z.einheitId !== null && z.personenSet.size < BR_MINDESTGRUPPE).map((z) => z.monat));
  const monatIstGesperrt = new Set([...zeilen.values()]
    .filter((z) => z.einheitId !== null && z.istSet.size > 0 && z.istSet.size < BR_MINDESTGRUPPE).map((z) => z.monat));
  for (const z of zeilen.values()) {
    const nPers = z.personenSet.size;
    if (nPers < BR_MINDESTGRUPPE || (z.einheitId === null && monatGesperrt.has(z.monat))) { aus.push({ monat: z.monat, einheitId: z.einheitId, personen: `<${BR_MINDESTGRUPPE}`, gesperrt: true }); continue; }
    const r = { monat: z.monat, einheitId: z.einheitId, personen: nPers, gesperrt: false };
    for (const f of ZAHLEN) {
      if (f === "istStunden" || f === "istErfasst") continue;
      r[f] = z[f];
    }
    /* Ist: eigene Mindestgruppe der Beitragenden und Wartezeit nach Monatsende (F1). */
    const istOffen = istFrei(z.monat) && z.istSet.size >= BR_MINDESTGRUPPE && !(z.einheitId === null && monatIstGesperrt.has(z.monat));
    r.istStunden = istOffen ? Math.round(z.istStunden * 10) / 10 : null;
    r.istErfasst = istOffen ? z.istErfasst : null;
    aus.push(r);
  }
  aus.sort((a, b) => a.monat.localeCompare(b.monat) || String(a.einheitId ?? "").localeCompare(String(b.einheitId ?? "")));
  return { stand: heute, von, bis, mindestgruppe: BR_MINDESTGRUPPE, zeilen: aus };
}

/** Synchron zu Ende rechnen (Prüfungen, kleine Betriebe). Im Betrieb: auswertungHolen. */
export function betriebsratAuswertung(m, heute) {
  const it = auswertungSchritte(m, heute);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/* --------------------------------------------------------------------------
   Im Hintergrund rechnen und merken — je Raum, Stand der Ablage und Tag (F2)

   Der Schlüssel enthält den Raum: Zwei Räume mit gleicher Betriebskennung
   (Demobetriebe!) teilen nie ein Ergebnis. Der Stand ist der Stand der Ablage
   (etag), nicht ein Feld des Betriebs. Ältere Stände desselben Raums werden
   verworfen, die Zahl der Einträge ist begrenzt.
   -------------------------------------------------------------------------- */
const FERTIG = new Map();                    // schluessel → Auswertung
const LAEUFT = new Map();                    // schluessel → true
export const BR_MAX_GLEICHZEITIG = 3;
export const BR_MAX_GEMERKT = 40;
const schluesselVon = (raum, stand, heute) => `${raum}\u0000${stand}\u0000${heute}`;

/**
 * @param {{ raum: string, stand: string | number, heute: string, mandant: any }} a
 * @returns {{ fertig: true, wert: Auswertung } | { fertig: false, ausgelastet?: boolean }}
 */
export function auswertungHolen({ raum, stand, heute, mandant }) {
  if (typeof raum !== "string" || !raum || stand === undefined || stand === null || stand === "") return { fertig: false };
  const k = schluesselVon(raum, stand, heute);
  if (FERTIG.has(k)) return { fertig: true, wert: /** @type {Auswertung} */ (FERTIG.get(k)) };
  if (LAEUFT.has(k)) return { fertig: false };
  if (LAEUFT.size >= BR_MAX_GLEICHZEITIG) return { fertig: false, ausgelastet: true };
  LAEUFT.set(k, true);
  (async () => {
    try {
      const it = auswertungSchritte(mandant, heute);
      let r = it.next();
      while (!r.done) { await new Promise((weiter) => setImmediate(weiter)); r = it.next(); }
      /* Ältere Stände desselben Raums verwerfen; Obergrenze insgesamt. */
      for (const alt of [...FERTIG.keys()]) if (alt.startsWith(`${raum}\u0000`)) FERTIG.delete(alt);
      if (FERTIG.size >= BR_MAX_GEMERKT) FERTIG.delete(FERTIG.keys().next().value);
      FERTIG.set(k, r.value);
    } catch { /* nicht gemerkt: der nächste Abruf versucht es neu */ }
    finally { LAEUFT.delete(k); }
  })();
  return { fertig: false };
}

/** Nur für Prüfungen. */
export function auswertungenVergessen() { FERTIG.clear(); LAEUFT.clear(); }

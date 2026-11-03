/* ==========================================================================
   IST-DATEN UND ROLLENSCHUTZ

   Die tatsächlich erfassten Arbeitszeiten (m.erfassung) erhält nicht jede
   Rolle: Beschäftigte nur die eigenen, der Betriebsrat keine
   (server/lib/rechte.mjs, bestandFuerRolle). Der Server vermerkt das in der
   Antwort als `m.sichtIstDaten`:

     { umfang: "eigene", person: <id> }   Beschäftigte
     { umfang: "keine" }                  Betriebsrat
     { umfang: "personen", personen: [] } Schichtverantwortung: sie selbst und
                                          der eigene Bereich; dazu zeitraeume:
                                          { id: [{von, bis}] } für Personen,
                                          die nur an diesen Tagen zum
                                          Bereich gehörten (WP-43)
     (fehlt)                              alle Ist-Daten vorhanden

   Fehlt eine Erfassung, rechnet die Anwendung sonst mit der geplanten Zeit —
   für die Leitung richtig, denn dort heißt „keine Erfassung" wirklich
   „nicht erfasst". Wo die Erfassung nur aus Datenschutzgründen fehlt, wäre
   derselbe Rückfall falsch: Er zeigte die Planzeit als tatsächliche
   Arbeitszeit. Für diese Personen ist die Ist-Zeit deshalb „nicht
   verfügbar", nicht „gleich dem Plan".

   Reine Planinformation (Dienstplan, Ruhezeit nach Plan, Besetzung) bleibt
   davon unberührt.
   ========================================================================== */
import { dauerAm } from "./regelwerk.js";

export const ISTDATEN_TEXT = "Ist-Arbeitszeit für diese Rolle nicht personenbezogen verfügbar.";

/**
 * Sind die Ist-Daten dieser Person in diesem Bestand zugänglich — an einem
 * Tag `d` oder, ohne Tag, für Auswertungen über Zeiträume (Konten, Monate,
 * Ausgleichszeitraum)?
 *
 * Tagesgenau (WP-43): Für eine Person, die zeitweise einer anderen Einheit
 * angehörte, nennt der Server in `sichtIstDaten.zeitraeume[id]` die Tage, an
 * denen die Schichtverantwortung ihre Erfassung bekommt. An allen anderen
 * Tagen fehlt sie aus Datenschutzgründen — dort „nicht verfügbar", nie die
 * Planzeit.
 *
 * `d` ist ein Tag („JJJJ-MM-TT") oder ein Zeitraum `{von, bis}` — den
 * übergeben die Auswertungen (Monat, Jahr, Kontozeitraum, Ausgleich). Ein
 * Zeitraum ist verfügbar, wenn er vollständig in den zugänglichen Tagen
 * liegt; eine alte oder künftige Versetzung außerhalb des Zeitraums stört
 * also nicht (WP-43, Nachtrag N1). Ohne Tag und ohne Zeitraum gilt eine
 * solche Person als nicht verfügbar (fail-closed).
 */
export function istVerfuegbar(m, p, d) {
  const s = m && m.sichtIstDaten;
  if (!s) return true;
  if (s.umfang === "eigene") return !!p && s.person !== null && s.person !== undefined
    && String(p.id) === String(s.person);
  if (s.umfang === "personen") {
    if (!p || !Array.isArray(s.personen) || !s.personen.includes(String(p.id))) return false;
    const z = s.zeitraeume && typeof s.zeitraeume === "object" ? s.zeitraeume[String(p.id)] : undefined;
    if (z === undefined) return true;
    if (!Array.isArray(z)) return false;
    if (typeof d === "string") return TAG.test(d) && abgedeckt(z, d, d);
    if (d && typeof d === "object" && TAG.test(String(d.von)) && TAG.test(String(d.bis)) && d.von <= d.bis)
      return abgedeckt(z, d.von, d.bis);
    return false;
  }
  return false;
}

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const naechsterTag = (t) => new Date(Date.parse(`${t}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
/** Liegt [von, bis] lückenlos in den Abschnitten z? */
function abgedeckt(z, von, bis) {
  const abschnitte = z.filter((x) => x && TAG.test(String(x.von)) && TAG.test(String(x.bis)) && x.von <= x.bis)
    .sort((a, b) => a.von.localeCompare(b.von));
  let ab = von;
  for (const x of abschnitte) {
    if (x.von > ab) return false;                       // Lücke vor diesem Abschnitt
    if (x.bis >= ab) {
      if (x.bis >= bis) return true;
      ab = naechsterTag(x.bis);
    }
  }
  return false;
}

const letzterTag = (j, mo) => new Date(Date.UTC(j, mo, 0)).toISOString().slice(0, 10);
/** Der Zeitraum eines Monats „JJJJ-MM". */
export function zeitraumMonat(ym) {
  const [j, mo] = String(ym).split("-").map(Number);
  return { von: `${ym}-01`, bis: letzterTag(j, mo) };
}
/** Vom 1. Januar bis zum Ende des Monats „JJJJ-MM" (Stundenkonto des Jahres). */
export function zeitraumBisMonat(ym) {
  return { von: `${String(ym).slice(0, 4)}-01-01`, bis: zeitraumMonat(ym).bis };
}
/** Ein Kalenderjahr. */
export function zeitraumJahr(jahr) {
  return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
}

/** Eine Erfassung, die die Stempeluhr zur Prüfung durch die Leitung gestellt hat (LANGER_DIENST). */
export const zurPruefung = (e) => !!e && e.bestaetigt === false && typeof e.grund === "string"
  && e.grund.startsWith("LANGER_DIENST");

/**
 * Stempel-Erfassungen eines Monats, die die Leitung noch prüfen muss.
 * @returns {Array<{personId: string, datum: string, erfassung: object}>}
 */
export function erfassungenZurPruefung(m, ym) {
  return Object.entries((m && m.erfassung) || {})
    .filter(([k, e]) => String(k).split("|")[1] && String(k).split("|")[1].startsWith(ym) && zurPruefung(e))
    .map(([k, e]) => ({ personId: String(k).split("|")[0], datum: String(k).split("|")[1], erfassung: e }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Kennzeichnung eines Tages, dessen Ist-Zeit noch geprüft werden muss (WP-17, W1). */
export const ZUR_PRUEFUNG_TEXT = "zur Prüfung, Planzeit vorläufig";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September",
  "Oktober", "November", "Dezember"];

/**
 * Der Hinweis für Lohnausgabe und Stundenkonto, solange im Monat Ist-Zeiten
 * zur Prüfung offen sind — dort zählt sonst still die Planzeit (WP-17, W1).
 * Mit `personId` nur die Fälle dieser Person. Ohne offene Fälle null.
 * @returns {null | {anzahl: number, monat: string, faelle: Array<{personId: string, datum: string}>, text: string}}
 */
export function pruefHinweis(m, ym, personId) {
  const faelle = erfassungenZurPruefung(m, ym)
    .filter((f) => personId === undefined || personId === null || String(f.personId) === String(personId))
    .map(({ personId: pid, datum }) => ({ personId: pid, datum }));
  if (!faelle.length) return null;
  const [j, mo] = String(ym).split("-");
  const monat = `${MONATE[Number(mo) - 1] || mo} ${j}`;
  const n = faelle.length;
  return { anzahl: n, monat, faelle,
    text: `${n === 1 ? "1 Ist-Zeit" : `${n} Ist-Zeiten`} im ${monat} zur Prüfung: Bis zur Bestätigung zählen dort `
      + "im Stundenkonto und in der Lohnausgabe vorläufig die Planzeiten." };
}

/**
 * Tatsächliche Dauer eines Dienstes: erfasste Zeit schlägt die geplante.
 * Ohne Zugang zu den Ist-Daten: std null und nichtVerfuegbar — nie die Planzeit.
 */
export function istZeitFuer(m, p, d, da) {
  if (!istVerfuegbar(m, p, d)) return { std: null, erfasst: false, abweichung: 0, nichtVerfuegbar: true };
  /* dauerAm statt dauer: In den beiden Nächten der Zeitumstellung dauert
     ein Nachtdienst sieben oder neun Stunden, nicht acht. */
  const e = m.erfassung ? m.erfassung[`${p.id}|${d}`] : null;
  /* Ein gestempelter langer Dienst, den die Leitung noch nicht bestätigt hat
     (WP-17, LANGER_DIENST): Bis zur Bestätigung zählt die Planzeit — aber
     nicht still: `zurPruefung` lässt Konto und Auswertung darauf hinweisen. */
  if (e && !e.bestaetigt && zurPruefung(e)) return { std: dauerAm(d, da), erfasst: false, abweichung: 0, zurPruefung: true };
  if (!e || !e.bestaetigt) return { std: dauerAm(d, da), erfasst: false, abweichung: 0 };
  const roh = { start: e.start || da.start, ende: e.ende || da.ende, pause: da.pause || 0 };
  const std = dauerAm(d, roh);
  return { std, erfasst: true, abweichung: Math.round((std - dauerAm(d, da)) * 100) / 100 };
}

/**
 * Die Zeiten, gegen die Pause und Tagesgrenze geprüft werden: bestätigte
 * Erfassung, sonst der Plan. Ohne Zugang zu den Ist-Daten null — die Prüfung
 * ist dann nicht bewertbar.
 */
export function pruefZeitFuer(m, p, d, da) {
  if (!istVerfuegbar(m, p, d)) return null;
  const e = m.erfassung ? m.erfassung[`${p.id}|${d}`] : null;
  return e && e.bestaetigt
    ? { start: e.start || da.start, ende: e.ende || da.ende, pause: da.pause || 0 }
    : da;
}

/** Leeres Ergebnis von istStunden für Personen ohne zugängliche Ist-Daten. */
export const IST_NICHT_VERFUEGBAR = Object.freeze({
  geleistet: null, gutgeschrieben: null, gesamt: null, nacht: null,
  dienste: null, naechte: null, erfasst: null, nichtVerfuegbar: true,
});

/** Anzeige einer Stundenzahl, die fehlen darf: null → „–" statt „0". */
export const stundenText = (wert, format) => (wert === null || wert === undefined ? "–" : format(wert));

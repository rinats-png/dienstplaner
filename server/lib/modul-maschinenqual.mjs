/* ==========================================================================
   MODUL MASCHINENQUAL — Maschinenqualifikationen (WP-19, Strang C; WP-19.11)

   Nach der Entscheidungsmatrix (WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md):
     M1 a  keine neue Struktur: Eine Maschinenqualifikation ist eine
           Kompetenz der Art „geraet", deren betriebsmittelId auf eine
           Anlage zeigt (server/lib/modul-anlagen.mjs). Die Matrix
           Person × Anlage liest die bestehenden Kompetenznachweise — je Rolle
           in der Ansicht, die sie sehen darf (matrixAnsicht).
     M2 a  Wiederholung (Unterweisung) als Regelwert MASCHQUAL-INTERVALL-01
           (server/lib/modul-regelwerte.mjs): 12 Monate sind nur der fachlich
           zu prüfende Ausgangswert. Kürzer geht immer; länger gibt einen
           Hinweis („Quelle prüfen“, FN-26); hat der Betrieb eine geprüfte
           Höchstgrenze mit Quelle und Fundstelle hinterlegt, weist der Server
           ein längeres Intervall ab (422). Die Vorlage verlängert nie über sie.
     M3 a  befähigte Person (Prüfungen an Arbeitsmitteln, § 2 Abs. 6
           BetrSichV, TRBS 1203 — zu prüfen, FN-27) als Merkmal der Kompetenz
           `befaehigtePerson: true`; sie zählt nicht als Bedienung. Die
           Qualifikationsgrundlage (Art, Bezug, Datum) steht am Nachweis der
           Person (`qualifikationsgrundlage`); ohne sie heißt es „nicht belegt“.
           Die Arten sind Dokumentarten, keine Aussage, was das Recht verlangt.

   Qualifizierte Besetzung je Anlage ist die vorläufige Registerregel
   MASCHQUAL-BESETZUNG-01 (höchstens Hinweis, nie Sperre — G4, G5). Wirkt nur,
   wenn das Modul aktiv ist — und damit auch „anlagen" (Abhängigkeit).

   Der Stand einer Kompetenz (kompetenzStand) wird hereingereicht: Er liegt
   heute in src/regelwerk.js und nach WP-22 in server/lib/regelwerk.mjs —
   eine Rechnung, nicht zwei.

   Datenschutz: Die Qualifikationsgrundlage ist Personenbezug. Sehen darf sie
   Planung, Leitung, Kundenrolle und die Person selbst (server/lib/sicht.mjs);
   die Anonymisierung entfernt sie (server/lib/aufbewahrung.mjs). Formfehler
   melden Status 422.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";
import { istAnlage, anlagenBedarf } from "./modul-anlagen.mjs";
import { regelwertWirksam, regelwertDef } from "./modul-regelwerte.mjs";

/** Ausgangswert der Wiederholung in Monaten (M2 a) — nur der zu prüfende Startwert, der Betrieb stellt ihn über den Regelwert ein. */
export const MASCHQUAL_WIEDERHOLUNG_MONATE = 12;
const REGEL_ID = "MASCHQUAL-BESETZUNG-01";
const INTERVALL_ID = "MASCHQUAL-INTERVALL-01";
const RANG = { gueltig: 3, laeuft_ab: 2, abgelaufen: 1, fehlt: 0 };
/** Aggregate unter dieser Zahl zeigt der Betriebsrat nicht (wie die BR-Auswertung, WP-27). */
const KLEINSTGRUPPE = 3;

/** Arten der Qualifikationsgrundlage der befähigten Person (M3) — Dokumentarten, keine Rechtsaussage. */
export const QUAL_GRUNDLAGE_ARTEN = Object.freeze(["berufsausbildung", "berufserfahrung", "zeitnahe_taetigkeit", "schulung", "sonstige"]);
const QUAL_WORT = { berufsausbildung: "Berufsausbildung", berufserfahrung: "Berufserfahrung", zeitnahe_taetigkeit: "Zeitnahe berufliche Tätigkeit",
  schulung: "Schulung", sonstige: "Sonstiger Nachweis" };
const BEZUG_MAX = 120;

/** @typedef {(kompetenz: any, nachweis: any, datum: string) => { stand: string, bis?: string|null, tage?: number|null }} StandFn */

const liste = (w) => (Array.isArray(w) ? w.filter((x) => x && typeof x === "object") : []);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const echterTag = (s) => {
  if (typeof s !== "string" || !TAG.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const datumKurz = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const keinFrist = (w) => w === undefined || w === null || w === "";

/** Ist es eine Bedienungskompetenz einer Anlage (nicht die befähigte Person)? */
const istBedienung = (k, anlagenIds) => !!k && k.art === "geraet" && k.befaehigtePerson !== true && anlagenIds.has(k.betriebsmittelId);
const anlagenIdsVon = (m) => new Set(liste(m && m.betriebsmittel).filter(istAnlage).map((a) => a.id));

/**
 * Vorlage einer Kompetenz für eine Anlage. Mit dem Betrieb (`m`) folgt die
 * Wiederholung dem Regelwert des Betriebs — nie länger als eine geprüfte
 * Höchstgrenze; ohne ihn dem Ausgangswert.
 * @param {any} anlage
 * @param {{ befaehigt?: boolean, m?: any }} [o]
 */
export function maschinenKompetenzVorlage(anlage, { befaehigt = false, m = null } = {}) {
  const monate = m ? Number(regelwertWirksam(m, INTERVALL_ID).wert) : MASCHQUAL_WIEDERHOLUNG_MONATE;
  return { name: `${befaehigt ? "Befähigte Person" : "Bedienung"} ${anlage.name}`, art: "geraet",
    betriebsmittelId: anlage.id, wiederholungMonate: monate, befaehigtePerson: befaehigt,
    stufe: "", freigabeStelle: "", grundlage: befaehigt ? "§ 2 Abs. 6 BetrSichV, TRBS 1203 (zu prüfen)" : "§ 12 BetrSichV (zu prüfen)",
    pflichtFuer: [], zugedacht: [] };
}

/**
 * Prüft die Felder, die dieses Modul an einer Kompetenz liest. Liefert den Grund oder null.
 * @param {any} k
 * @returns {string | null}
 */
export function pruefeMaschinenKompetenz(k) {
  if (!k || typeof k !== "object") return null;
  const name = String(k.name || k.id || "Kompetenz").slice(0, 60);
  if (k.befaehigtePerson !== undefined && typeof k.befaehigtePerson !== "boolean")
    return `Kompetenz ${name}: „befähigte Person“ ist Ja oder Nein.`;
  const w = k.wiederholungMonate;
  if (w !== undefined && w !== null && w !== "" && (typeof w !== "number" || !Number.isInteger(w) || w < 1 || w > 120))
    return `Kompetenz ${name}: Wiederholung in ganzen Monaten von 1 bis 120.`;
  return null;
}

/**
 * Prüft die Qualifikationsgrundlage an einem Nachweis. Liefert den Grund oder null.
 * @param {any} g
 * @returns {string | null}
 */
export function pruefeQualifikationsgrundlage(g) {
  const form = `Qualifikationsgrundlage erwartet { art, bezug (1 bis ${BEZUG_MAX} Zeichen), datum? }.`;
  if (!istObjekt(g) || Object.keys(g).some((k) => !["art", "bezug", "datum"].includes(k))) return form;
  if (!QUAL_GRUNDLAGE_ARTEN.includes(g.art)) return `Qualifikationsgrundlage: Art unbekannt (erlaubt: ${QUAL_GRUNDLAGE_ARTEN.join(", ")}).`;
  if (typeof g.bezug !== "string" || !g.bezug.trim() || g.bezug.length > BEZUG_MAX) return form;
  if (g.datum !== undefined && g.datum !== null && !echterTag(g.datum)) return "Qualifikationsgrundlage: Datum ist kein Kalendertag (JJJJ-MM-TT).";
  return null;
}

/**
 * Die Qualifikationsgrundlage in Worten; ohne gültige Grundlage null.
 * @param {any} g
 * @returns {string | null}
 */
export function qualifikationsgrundlageText(g) {
  if (pruefeQualifikationsgrundlage(g)) return null;
  return `${QUAL_WORT[g.art]} „${g.bezug.trim()}“${g.datum ? ` vom ${datumKurz(g.datum)}` : ""}`;
}

/* ---------------------------------------------------------------------------
   M2: Unterweisungsintervall
   --------------------------------------------------------------------------- */

/**
 * Wie verhält sich das Intervall einer Bedienungskompetenz zum Regelwert?
 *   ohne                          keine Wiederholungsfrist hinterlegt
 *   kuerzer / gleich              nicht länger als der Referenzwert
 *   laenger                       länger als der Referenzwert (Ausgangswert oder Wert des Betriebs), nicht geprüft → Hinweis
 *   ueberschreitet-hoechstgrenze  länger als eine geprüfte Höchstgrenze (Quelle + Fundstelle) → der Server weist es ab
 * @param {any} m Betrieb
 * @param {any} k Kompetenz
 * @param {string} [heute]
 */
export function intervallBewertung(m, k, heute) {
  const rw = regelwertWirksam(m, INTERVALL_ID, heute);
  const basis = { referenz: rw.wert, herkunft: rw.herkunft, geprueft: rw.geprueft, quelle: rw.quelle, fundstelle: rw.fundstelle };
  const w = k && k.wiederholungMonate;
  if (keinFrist(w)) return { ...basis, status: "ohne", wert: null, hinweis: "Keine Wiederholungsfrist hinterlegt." };
  const ref = /** @type {number} */ (rw.wert);
  if (w < ref) return { ...basis, status: "kuerzer", wert: w, hinweis: null };
  if (w === ref)
    return { ...basis, status: "gleich", wert: w, hinweis: rw.herkunft === "ausgangswert" ? `Ausgangswert von ${ref} Monaten, fachlich zu prüfen (${rw.fachnachweis}).` : null };
  const grundlage = k && typeof k.grundlage === "string" && k.grundlage.trim() ? ` Hinterlegte Grundlage: ${k.grundlage.trim().slice(0, 100)}.` : "";
  if (rw.geprueft)
    return { ...basis, status: "ueberschreitet-hoechstgrenze", wert: w,
      hinweis: `Länger als die geprüfte Höchstgrenze von ${ref} Monaten (Quelle: ${rw.quelle}, Fundstelle: ${rw.fundstelle}).${grundlage}` };
  const woher = rw.herkunft === "ausgangswert" ? "der zu prüfende Ausgangswert" : "der Wert des Betriebs (nicht geprüft)";
  return { ...basis, status: "laenger", wert: w,
    hinweis: `Länger als ${woher} von ${ref} Monaten. Quelle prüfen (${rw.fachnachweis}).${grundlage}` };
}

/**
 * Bedienungskompetenzen an Anlagen, deren Intervall länger als der Referenzwert ist — Pflegehinweise, keine Sperre.
 * @param {any} m
 * @param {string} [heute]
 * @returns {{ kompetenzId: any, name: string, status: string, hinweis: string | null, wert: number | null, referenz: number | null }[]}
 */
export function intervallHinweise(m, heute) {
  const ids = anlagenIdsVon(m);
  const aus = [];
  for (const k of liste(m && m.kompetenzen)) {
    if (!istBedienung(k, ids)) continue;
    const b = intervallBewertung(m, k, heute);
    if (b.status === "laenger" || b.status === "ueberschreitet-hoechstgrenze")
      aus.push({ kompetenzId: k.id, name: String(k.name || k.id), status: b.status, hinweis: b.hinweis, wert: b.wert, referenz: b.referenz });
  }
  return aus;
}

/**
 * Wie das Intervall zustande kommt — für die Oberfläche („Herkunft“), ohne Rechtsbehauptung.
 * @param {any} m
 * @param {string} [heute]
 */
export function maschinenqualAuskunft(m, heute) {
  const rw = regelwertWirksam(m, INTERVALL_ID, heute);
  const d = regelwertDef(INTERVALL_ID);
  const r = REGELN_BRANCHEN.find((x) => x.id === INTERVALL_ID);
  if (!d || !r) throw new Error(`${INTERVALL_ID} fehlt.`);
  return { regelId: INTERVALL_ID, bezeichnung: d.bezeichnung, wert: rw.wert, einheit: d.einheit, herkunft: rw.herkunft,
    pruefstatus: rw.pruefstatus, geprueft: rw.geprueft, quelle: rw.quelle, fundstelle: rw.fundstelle, version: rw.version,
    gueltigAb: rw.gueltigAb, gueltigBis: rw.gueltigBis, hoechsteStufe: r.hoechsteStufe, fachnachweis: d.fachnachweis,
    hinweis: rw.herkunft === "ausgangswert" ? d.ausgangswertText : rw.hinweis };
}

/* ---------------------------------------------------------------------------
   Matrix, Ansichten, Listen
   --------------------------------------------------------------------------- */

/** Bedienungskompetenzen je Anlage (ohne befähigte Person). */
function kompetenzenJeAnlage(m) {
  const anlagen = liste(m && m.betriebsmittel).filter(istAnlage);
  const ids = new Set(anlagen.map((a) => a.id));
  /** @type {Map<any, any[]>} */
  const je = new Map(anlagen.map((a) => [a.id, []]));
  for (const k of liste(m && m.kompetenzen))
    if (k.art === "geraet" && ids.has(k.betriebsmittelId) && k.befaehigtePerson !== true) je.get(k.betriebsmittelId).push(k);
  return { anlagen, je };
}

/** Hat die Rolle die Kompetenznachweise dieser Person bekommen? Beschäftigte und Schichtverantwortung bekommen
    die der anderen nicht (Positivkatalog, RECHTEMATRIX): Dann ist der Stand unbekannt, nie „fehlt". */
const nachweiseBekannt = (p) => !!p && Array.isArray(p.kompetenzNachweise);
const UNBEKANNT = Object.freeze({ stand: "unbekannt", bis: null, kompetenzId: null });

/** Bester Stand einer Person über die Kompetenzen einer Anlage. */
function besterStand(p, kompetenzen, datum, stand) {
  if (!nachweiseBekannt(p)) return { ...UNBEKANNT };
  let best = null;
  for (const k of kompetenzen) {
    const n = liste(p && p.kompetenzNachweise).find((x) => x.kompetenzId === k.id) || null;
    const s = stand(k, n, datum);
    if (!best || (RANG[s.stand] || 0) > (RANG[best.stand] || 0)) best = { stand: s.stand, bis: s.bis || null, tage: typeof s.tage === "number" ? s.tage : null, kompetenzId: k.id };
  }
  return best;
}

const personName = (p) => `${p.vorname || ""} ${p.nachname || ""}`.trim();

/**
 * Matrix Person × Anlage. Zelle null: für die Anlage ist keine Qualifikation hinterlegt.
 * @param {any} m
 * @param {string} datum
 * @param {StandFn} stand
 */
export function qualifikationsMatrix(m, datum, stand) {
  const { anlagen, je } = kompetenzenJeAnlage(m);
  const personen = liste(m && m.personen).filter((p) => p.status !== "ausgetreten");
  return {
    anlagen: anlagen.map((a) => ({ id: a.id, name: a.name })),
    zeilen: personen.map((p) => ({ personId: p.id, name: personName(p),
      zellen: Object.fromEntries(anlagen.map((a) => [a.id, je.get(a.id).length ? besterStand(p, je.get(a.id), datum, stand) : null])) })),
  };
}

const sup = (n) => (n === 0 ? 0 : n < KLEINSTGRUPPE ? `<${KLEINSTGRUPPE}` : n);

/**
 * Die Matrix in der Ansicht, die die Rolle sehen darf (G7: grundsätzlich nur, was erforderlich ist).
 *   voll       Planung, Leitung, Kundenrolle: alle Personen
 *   eigen      Beschäftigte, Schichtverantwortung: nur die eigene Zeile
 *   aggregat   Betriebsrat: Zahlen je Anlage, Gruppen unter 3 als „<3“, keine Person
 *   keine      jede andere oder fehlende Rolle (fail-closed)
 * Gerechnet wird aus dem, was die Rolle ausgeliefert bekommt — die Ansicht ersetzt die serverseitige Sicht nicht.
 * @param {any} m
 * @param {string} datum
 * @param {StandFn} stand
 * @param {{ rolle?: string, ich?: any }} o
 */
export function matrixAnsicht(m, datum, stand, { rolle, ich } = {}) {
  const mx = qualifikationsMatrix(m, datum, stand);
  if (rolle === "planer" || rolle === "leitung" || rolle === "kunde") return { art: "voll", ...mx };
  if (rolle === "mitarbeiter" || rolle === "subplaner")
    return { art: "eigen", anlagen: mx.anlagen,
      zeilen: ich === undefined || ich === null ? [] : mx.zeilen.filter((z) => String(z.personId) === String(ich)) };
  if (rolle === "betriebsrat") {
    const anlagen = mx.anlagen.map((a) => {
      const z = { gueltig: 0, laeuftAb: 0, abgelaufen: 0, fehlt: 0 };
      let personen = 0;
      for (const zeile of mx.zeilen) {
        const c = zeile.zellen[a.id];
        if (!c) continue;
        personen++;
        if (c.stand === "gueltig") z.gueltig++;
        else if (c.stand === "laeuft_ab") z.laeuftAb++;
        else if (c.stand === "abgelaufen") z.abgelaufen++;
        else if (c.stand === "fehlt") z.fehlt++;
      }
      return { id: a.id, name: a.name, personen: sup(personen), gueltig: sup(z.gueltig), laeuftAb: sup(z.laeuftAb), abgelaufen: sup(z.abgelaufen), fehlt: sup(z.fehlt) };
    });
    return { art: "aggregat", anlagen, zeilen: [] };
  }
  return { art: "keine", anlagen: [], zeilen: [] };
}

/**
 * Wer an welcher Anlage bald oder schon nicht mehr gültig unterwiesen ist — für die Planung.
 * „Fehlt“ gehört nicht dazu (dort gibt es keinen Ablauf). Zuerst Abgelaufene, dann nach Datum.
 * @param {any} m
 * @param {string} datum
 * @param {StandFn} stand
 * @returns {{ personId: any, name: string, anlageId: any, anlageName: string, stand: string, bis: string | null, tage: number | null }[]}
 */
export function ablaufListe(m, datum, stand) {
  const { anlagen, je } = kompetenzenJeAnlage(m);
  const aus = [];
  for (const p of liste(m && m.personen).filter((x) => x.status !== "ausgetreten")) {
    if (!nachweiseBekannt(p)) continue;
    for (const a of anlagen) {
      if (!je.get(a.id).length) continue;
      const s = besterStand(p, je.get(a.id), datum, stand);
      if (s && (s.stand === "laeuft_ab" || s.stand === "abgelaufen"))
        aus.push({ personId: p.id, name: personName(p), anlageId: a.id, anlageName: a.name, stand: s.stand, bis: s.bis, tage: s.tage });
    }
  }
  const rang = (x) => (x.stand === "abgelaufen" ? 0 : 1);
  return aus.sort((x, y) => rang(x) - rang(y) || String(x.bis).localeCompare(String(y.bis)));
}

/* ---------------------------------------------------------------------------
   M3: befähigte Person
   --------------------------------------------------------------------------- */

/**
 * Personen mit einer Kompetenz „befähigte Person“ je Anlage, mit Stand und Grundlage.
 * Ohne Grundlage: „Grundlage nicht belegt“. Die befähigte Person zählt nicht als Bedienung.
 * @param {any} m
 * @param {string} datum
 * @param {StandFn} stand
 */
export function befaehigtePersonenListe(m, datum, stand) {
  const anlagen = liste(m && m.betriebsmittel).filter(istAnlage);
  const aus = [];
  for (const a of anlagen)
    for (const k of liste(m && m.kompetenzen).filter((x) => x.art === "geraet" && x.betriebsmittelId === a.id && x.befaehigtePerson === true))
      for (const p of liste(m && m.personen).filter((x) => x.status !== "ausgetreten")) {
        if (!nachweiseBekannt(p)) continue;
        const n = liste(p.kompetenzNachweise).find((x) => x.kompetenzId === k.id);
        if (!n) continue;
        const s = stand(k, n, datum);
        const text = qualifikationsgrundlageText(n.qualifikationsgrundlage);
        aus.push({ personId: p.id, name: personName(p), anlageId: a.id, anlageName: a.name, kompetenzId: k.id, stand: s.stand, bis: s.bis || null,
          belegt: text !== null, grundlage: text, hinweis: text === null ? "Grundlage nicht belegt" : null });
      }
  return aus;
}

/**
 * Merkmale „anlage:<id>" einer Person: gültige (auch bald ablaufende) Bedienungskompetenz.
 * Sind die Kompetenznachweise der Person nicht ausgeliefert, ist die Antwort null (unbekannt).
 * @param {any} m
 * @param {any} p
 * @param {string} datum
 * @param {StandFn} stand
 * @returns {string[] | null}
 */
export function anlagenMerkmale(m, p, datum, stand) {
  if (!nachweiseBekannt(p)) return null;
  const { anlagen, je } = kompetenzenJeAnlage(m);
  const aus = [];
  for (const a of anlagen) {
    const s = besterStand(p, je.get(a.id), datum, stand);
    if (s && (s.stand === "gueltig" || s.stand === "laeuft_ab")) aus.push(`anlage:${a.id}`);
  }
  return aus;
}

/**
 * Befunde zur qualifizierten Besetzung der laufenden Anlagen eines Dienstes.
 * Inaktives Modul → keine Befunde.
 * @param {any} m
 * @param {string} datum
 * @param {string} dienstId
 * @param {any[]} personen die im Dienst Eingeteilten (Personen des Betriebs)
 * @param {{ auswerten: (regel: any, kontext: any) => any, stand: StandFn, module?: readonly any[] }} o
 */
export function maschinenqualBefunde(m, datum, dienstId, personen, { auswerten, stand, module = BRANCHENMODULE }) {
  if (!modulAktiv(m, "maschinenqual", module)) return [];
  if (typeof auswerten !== "function" || typeof stand !== "function")
    throw new Error("maschinenqualBefunde: Auswertung oder Kompetenzstand fehlt.");
  const basis = REGELN_BRANCHEN.find((r) => r.id === REGEL_ID);
  if (!basis) throw new Error(`${REGEL_ID} fehlt im Branchenkatalog.`);
  const { je } = kompetenzenJeAnlage(m);
  const imDienst = liste(personen).map((p) => ({ id: p.id, merkmale: anlagenMerkmale(m, p, datum, stand) }));   // null: unbekannt → „nicht bewertbar"
  const aus = [];
  for (const a of anlagenBedarf(m, datum, dienstId).anlagen) {
    const r = { ...basis, bezeichnung: `Qualifizierte Besetzung ${a.name}`,
      parameter: { anforderungen: [{ art: "anzahlMit", merkmal: `anlage:${a.id}`, min: a.soll }] } };
    let b;
    if (!(je.get(a.id) || []).length)
      b = alsEinteilungsBefund(r, { zustand: "offen", text: `${a.name}: keine Qualifikation hinterlegt — nicht bewertbar` });
    else {
      const erg = auswerten(r, { personen: imDienst, datum });
      const status = erg && (erg.status || erg.zustand);
      b = status === "erfuellt" && a.offen
        ? alsEinteilungsBefund(r, { zustand: "offen", text: `${a.name}: Laufzeit unbekannt — nicht bewertbar` })
        : alsEinteilungsBefund(r, erg);
    }
    if (b) aus.push(b);
  }
  return aus;
}

/**
 * Schreibweg: prüft die Felder dieses Moduls an Kompetenzen, die eine Anlage
 * betreffen oder `befaehigtePerson` tragen, die Wiederholung gegen eine
 * geprüfte Höchstgrenze (M2) und die Qualifikationsgrundlage an Nachweisen
 * (M3). Andere bleiben unberührt. Mit `altM` nur Neues oder Geändertes streng
 * (Review-Auflage 2). Ein Formfehler meldet Status 422.
 * @param {any} neuM
 * @param {any} [altM]
 * @returns {{ grund?: string, status?: number }}
 */
export function maschinenqualZusammen(neuM, altM) {
  const anlagen = anlagenIdsVon(neuM);
  const vorher = new Map(liste(altM && altM.kompetenzen).map((x) => [String(x.id), JSON.stringify(x)]));
  for (const k of liste(neuM && neuM.kompetenzen)) {
    if (vorher.get(String(k.id)) === JSON.stringify(k)) continue;
    if (k.befaehigtePerson === undefined && !anlagen.has(k.betriebsmittelId)) continue;
    const f = pruefeMaschinenKompetenz(k);
    if (f) return { grund: f, status: 422 };
    if (istBedienung(k, anlagen)) {
      const b = intervallBewertung(neuM, k);
      if (b.status === "ueberschreitet-hoechstgrenze")
        return { grund: `Kompetenz ${String(k.name || k.id).slice(0, 60)}: Wiederholung ${k.wiederholungMonate} Monate — ${b.hinweis}`, status: 422 };
    }
  }
  /* Qualifikationsgrundlage am Nachweis (M3): nur Neues oder Geändertes, nur an der Kompetenz „befähigte Person“. */
  const kompetenzen = new Map(liste(neuM && neuM.kompetenzen).map((k) => [String(k.id), k]));
  const altPersonen = new Map(liste(altM && altM.personen).map((p) => [String(p.id), p]));
  for (const p of liste(neuM && neuM.personen)) {
    const altNachweise = liste(altPersonen.get(String(p.id)) && altPersonen.get(String(p.id)).kompetenzNachweise);
    for (const n of liste(p.kompetenzNachweise)) {
      if (n.qualifikationsgrundlage === undefined || n.qualifikationsgrundlage === null) continue;
      const frueher = altNachweise.find((x) => String(x.kompetenzId) === String(n.kompetenzId));
      if (frueher && JSON.stringify(frueher.qualifikationsgrundlage) === JSON.stringify(n.qualifikationsgrundlage)) continue;
      const f = pruefeQualifikationsgrundlage(n.qualifikationsgrundlage);
      if (f) return { grund: f, status: 422 };
      const k = kompetenzen.get(String(n.kompetenzId));
      if (!k || k.befaehigtePerson !== true)
        return { grund: "Qualifikationsgrundlage gibt es nur am Nachweis einer Kompetenz „befähigte Person“.", status: 422 };
    }
  }
  return {};
}

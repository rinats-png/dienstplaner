/* ==========================================================================
   FACHPRÜFUNG AUF DEM SERVER DURCHSETZEN (WP-11 B2/F2, Nachprüfung WP-11, WP-22)

   Der Server prüft jede Übermittlung, die Einteilungen ändern kann, mit
   derselben Prüfung wie die Oberfläche (einteilungsBefunde,
   server/lib/fachpruefung.mjs; darin die eine Schutzprüfung schutzEinsatz)
   — auf den gespeicherten Rohdaten. Für die Schichtverantwortung, die nur
   Einsatzregeln sieht, ist das gleichwertig (schutzmerkmale-sicht).

   0. Vorab (Nachprüfung WP-11, N1): Eine Dienstart, die noch verwendet wird
      (Schichtfolge oder Einteilung ab heute), lässt sich nicht löschen — für
      alle Personen gleich, die Meldung nennt Person und Tag, kein Merkmal.
   Zwei Wege führen zu einer Einteilung, beide werden geprüft:
   1. Ausdrücklich: eine neue oder geänderte Einteilung in `abweichungen`.
      Die Dienstart kommt aus dem NEUEN Stand; eine unbekannte sperrt
      (fail-closed); „-" heißt frei.
   2. Mittelbar: Ändert die Übermittlung Dienstarten, Schichtfolge (zyklus,
      anker), Einheiten (Versatz) oder Personen (Zugehörigkeit, Springer,
      Schichtdienst, Teilzeit, Eintritt, Austritt, Status), rechnet der Server
      für jede Person die nächsten SCHUTZ_HORIZONT_TAGE Tage vorher und
      nachher nach — nur dort, wo sich für die Einteilung etwas geändert haben
      kann (Dienst, Dienstart, Nachbartage, Woche, Person, Betriebsvorgaben).

   Gezählt werden nur NEUE Befunde: Was es an derselben Einteilung (Person,
   Tag) vorher schon gab, blockiert nicht (Altbestand). Dazu die
   Mindestbesetzung: Fällt ein Dienst an einem Tag durch diese Übermittlung
   unter die Vorgabe (und unter den bisherigen Stand), ist das ein Befund an
   der Einteilung, die wegfiel.

   Die Stufe und ob ein Befund sperrt, steht im Befundkatalog
   (BEFUND_KATALOG). Ein neuer sperrender Befund weist ab (403). Ein neuer
   warnender verlangt eine Bestätigung im selben Speichervorgang — einen neuen
   Eintrag im Bestätigungsprotokoll zu Person und Tag, der die Regel nennt;
   fehlt er, antwortet der Server 409 mit der Befundliste (neutrale Texte
   aus dem Katalog, nie Merkmal oder Gesetz eines Schutzes).

   Laufzeit (N1, WP-22): Planrechnung je Betrieb mit Verzeichnissen (Abweichungen
   und Abwesenheiten je Person, Schichtfolge je Einheit und Tag), Datumsrechnung
   ohne Zeitzone. rechte.mjs gibt die Laufzeit jeder Nachrechnung ohne
   Personenbezug aus; Messwerte in docs/acc45/wp22-nachweis.md.

   Grenzen (dokumentiert in RECHTEMATRIX ²¹, SICHERHEIT.md und
   docs/REGELWERK-REGISTRY.md, Anhang H; Nachweis docs/acc45/wp22-nachweis.md):
   - Posten (aus einem Gruppendienst besetzt) rechnet nur die Oberfläche;
     die Mindestbesetzung ohne Feiertagsanhebung.
   - Höchstarbeitszeit nur je Dienst (über zehn Stunden), nicht der
     Durchschnitt über sechs Monate.
   - Mittelbar nur im Horizont; spätere Tage prüft die Planprüfung.

   Rein: keine Ablage.
   ========================================================================== */
import { schutzEinsatz, addDays, tagUTC } from "./schutzpruefung.mjs";
import { heuteBerlin } from "./zeiterfassung.mjs";
import { BEFUND_KATALOG, sperrtBefund, befundText } from "./bestaetigungen.mjs";
import { einteilungsBefunde, imDienst, mindestOhneFeiertag, einheitAm, einheitDienst, teilzeitDienst,
  landFuerEinheit } from "./fachpruefung.mjs";

/** Wie weit der Server mittelbare Änderungen voraus nachrechnet (Tage ab heute). */
export const SCHUTZ_HORIZONT_TAGE = 120;

/** Was der Server je Einteilung durchsetzt (Schlüssel im Befundkatalog). Dazu
    schutzWeich (Nachprüfung WP-11): etwa ein Einsatz 20–23 Uhr ab 16 Jahren
    ohne Einstellung „mehrschichtig" — Achtung, bestätigungspflichtig. */
export const SERVER_REGELN = Object.freeze(["bestand", "schutz", "schutzWeich", "keineNacht", "keinAlleindienst", "maxDiensteWoche",
  "qualifikationGesetzlich", "qualifikationBetrieblich", "kompetenz", "ruhezeitGesetz", "ruhezeitBetrieb",
  "untergrenze"]);                                                            // lange Dienste: nur ein Hinweis (Nutzerentscheidung)

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w : []).filter(istObjekt);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const frei = (w) => w === "-" || w === "" || w === null || w === undefined;
const hat = (o, f) => !!o && Object.prototype.hasOwnProperty.call(o, f);

/** Der Text eines Befunds in der 409-Antwort: aus dem Katalog; für die
    Schutzprüfung immer derselbe neutrale (keine Fundstelle, kein Merkmal). */
const neutralerText = (regel) => (/^schutz/.test(regel) ? BEFUND_KATALOG.schutz.text : befundText(regel));

/** „Nicht im Bestand" — dieselbe Regel wie imDienst in der Oberfläche. */
export function nichtImBestand(p, d) { return !imDienst(p, d); }

/**
 * Die sperrenden Befunde aus der Schutzprüfung und dem Beschäftigungs-
 * verhältnis — für eine Bestätigung, die das Protokoll prüft (rechte.mjs).
 * @param {any} person
 * @param {any} dienstart
 * @param {string} datum
 * @param {any} [einst] Einstellungen des Betriebs (jugendschutz.mehrschichtig)
 * @returns {{regel: string, text: string}[]}
 */
export function sperrendeBefunde(person, dienstart, datum, einst) {
  const aus = [];
  if (BEFUND_KATALOG.bestand.sperrt && nichtImBestand(person, datum))
    aus.push({ regel: "bestand", text: BEFUND_KATALOG.bestand.text });
  if (BEFUND_KATALOG.schutz.sperrt && schutzEinsatz(person, dienstart, datum, einst).some((b) => b.sperrt))
    aus.push({ regel: "schutz", text: BEFUND_KATALOG.schutz.text });
  return aus;
}

/** Hat die Übermittlung etwas geändert, das Einteilungen mittelbar verschiebt? */
function planStrukturGeaendert(altM, neuM) {
  const it = planStrukturSchritte(altM, neuM);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
/** Dasselbe in Häppchen (Nachtrag WP-22b, Review HOCH 2): je Person eine Gelegenheit zum Nachgeben. */
function* planStrukturSchritte(altM, neuM, zeitUm = () => false, weiter = () => {}) {
  for (const f of ["dienstarten", "zyklus", "anker", "einheiten"])
    if (hat(neuM, f) && !gleich(altM[f], neuM[f])) return true;
  const alt = new Map(liste(altM.personen).map((p) => [String(p.id), p]));
  for (const p of liste(neuM.personen)) {
    if (zeitUm()) { yield; weiter(); }
    const a = alt.get(String(p.id));
    /* Review U1: Eine neu angelegte Person bekommt ihre Dienste aus der
       Schichtfolge ihrer Einheit — das ist eine Einteilung wie jede andere. */
    if (!a) return true;
    /* Review M2: auch Schutzmerkmale und Einwilligungen — wer sie ändert,
       ändert, ob bestehende Einteilungen zulässig sind. */
    for (const f of ["zugehoerigkeit", "springer", "imSchichtdienst", "teilzeit", "wochenstunden", "eintritt", "austritt", "status",
      "mutterschutz", "mutterschutzEinwilligungen", "geburtstag", "geburtsdatum"])
      if (!gleich(a[f], p[f])) return true;
  }
  return false;
}

/* Tagesnummern ohne Zeitzone, zwischengespeichert (N1). */
const TAGNR = new Map();
const tagNr = (s) => { let n = TAGNR.get(s); if (n === undefined) { n = Math.round(tagUTC(s) / 86400000); if (TAGNR.size > 5000) TAGNR.clear(); TAGNR.set(s, n); } return n; };

/**
 * Planrechnung eines Betriebsstands mit Verzeichnissen: Dienst je Person und
 * Tag (Abweichung, sonst Schichtfolge der Einheit mit Teilzeit; Abwesenheit
 * und außerhalb des Beschäftigungsverhältnisses frei — wie dienstAm in
 * fachpruefung.mjs), Besetzung je Tag. Ein Durchlauf über Abweichungen und
 * Abwesenheiten statt eines Schlüssels je Person und Tag (N1).
 */
function* planrechner(m, personen, zeitUm = () => false, weiter = () => {}) {
  const abw = new Map();                                                     // pid → Map(tag → wert)
  const quelle = istObjekt(m.abweichungen) ? m.abweichungen : {};
  for (const k in quelle) {
    if (zeitUm()) { yield; weiter(); }                                       // Aufbau in Häppchen (B2-Rest)
    const n = k.length - 11;
    if (n <= 0 || k.charCodeAt(n) !== 124) continue;                       // „|"
    const pid = k.slice(0, n);
    let tage = abw.get(pid);
    if (!tage) { tage = new Map(); abw.set(pid, tage); }
    tage.set(k.slice(n + 1), quelle[k]);
  }
  const fehlt = new Map();                                                   // pid → [{von, bis}]
  for (const a of liste(m.abwesenheiten)) {
    const pid = String(a.personId);
    if (!fehlt.has(pid)) fehlt.set(pid, []);
    fehlt.get(pid).push(a);
  }
  const folge = new Map();                                                   // eid → Map(tag → Dienst der Schichtfolge)
  const folgeAm = (eid, d) => {
    let je = folge.get(eid);
    if (!je) { je = new Map(); folge.set(eid, je); }
    let v = je.get(d);
    if (v === undefined) { v = einheitDienst(m, eid, d); je.set(d, v); }
    return v;
  };
  const dienste = new Map();                                                 // pid → Map(tag → id|null)
  const am = (p, d) => {
    const pid = String(p.id);
    let je = dienste.get(pid);
    if (!je) { je = new Map(); dienste.set(pid, je); }
    let v = je.get(d);
    if (v !== undefined) return v;
    v = null;
    if (imDienst(p, d)) {
      const t = abw.get(pid);
      const ab = t ? t.get(d) : undefined;
      let basis;
      if (ab !== undefined) basis = frei(ab) ? null : ab;
      else {
        const eid = einheitAm(p, d);
        basis = eid && !p.springer && p.imSchichtdienst !== false ? teilzeitDienst(m, p, d, folgeAm(eid, d)) : null;
      }
      const ab2 = basis ? fehlt.get(pid) : undefined;
      if (basis && !(ab2 && ab2.some((a) => a.von <= d && a.bis >= d))) v = basis;
    }
    je.set(d, v);
    return v;
  };
  const besetzung = new Map();
  const tag = (d) => {
    if (!besetzung.has(d)) {
      const je = new Map();
      for (const p of personen) { const id = am(p, d); if (id) { if (!je.has(String(id))) je.set(String(id), []); je.get(String(id)).push(p); } }
      besetzung.set(d, je);
    }
    return besetzung.get(d);
  };
  const alleinOhnePartner = (p, d, daId) => !(tag(d).get(String(daId)) || [])
    .some((x) => String(x.id) !== String(p.id) && !(x.einschraenkungen && x.einschraenkungen.keinAlleindienst));
  /** Die Tage mit ausdrücklicher Einteilung einer Person (aufsteigend). */
  const abwTage = (p) => [...((abw.get(String(p.id)) || new Map()).keys())].sort();
  return { am, tag, alleinOhnePartner, abwTage };
}

/**
 * Die zuletzt gemessene Laufzeit der Prüfung (Nachprüfung WP-11, N1) —
 * rechte.mjs und daten.mjs protokollieren sie, wenn nachgerechnet wurde.
 * Ohne Personenbezug. `blockMs`: längster Abschnitt ohne Nachgeben (B2).
 * @type {null | { ms: number, mittelbar: boolean, personen: number, geprueft: number, blockMs?: number }}
 */
export let letzteLaufzeit = null;

/** Name einer Person für eine Meldung — ohne jedes Merkmal. */
const nameVon = (p) => (p ? [p.vorname, p.nachname].filter(Boolean).join(" ") || String(p.id) : "unbekannt");

/** Längster Rechenabschnitt ohne Nachgeben an die Event-Loop (Review B2). */
export const HAEPPCHEN_MS = 15;
/** Höchstens so lange rechnet der Server an einer Übermittlung; danach 503 „bitte erneut". */
export const ZEITBUDGET_MS = 8000;

/* Bremse für Strukturänderungen je Raum (Review B2): Eine Schichtfolge im
   Wechsel hin und her darf den gemeinsamen Prozess nicht dauerhaft
   beschäftigen. Höchstens STRUKTUR_JE_MINUTE je Raum und Minute; im
   Speicher dieses Prozesses (es gibt einen). */
export const STRUKTUR_JE_MINUTE = 10;
const STRUKTUR_ZEITEN = new Map();
/** @returns {{ frei: boolean, wartet: number }} */
export function strukturBremse(schluessel, jetztMs = Date.now()) {
  const l = (STRUKTUR_ZEITEN.get(schluessel) || []).filter((t) => jetztMs - t < 60000);
  if (l.length >= STRUKTUR_JE_MINUTE) {
    STRUKTUR_ZEITEN.set(schluessel, l);
    return { frei: false, wartet: Math.max(1, Math.ceil((60000 - (jetztMs - l[0])) / 1000)) };
  }
  l.push(jetztMs);
  STRUKTUR_ZEITEN.set(schluessel, l);
  if (STRUKTUR_ZEITEN.size > 5000) for (const k of STRUKTUR_ZEITEN.keys()) { STRUKTUR_ZEITEN.delete(k); if (STRUKTUR_ZEITEN.size <= 4000) break; }
  return { frei: true, wartet: 0 };
}

/** Ist das eine Strukturänderung (mittelbare Nachrechnung über den Horizont)? */
export function strukturAenderung(altM, neuM) {
  return !!altM && istObjekt(neuM) && planStrukturGeaendert({ ...altM }, neuM);
}

/**
 * Prüft eine Übermittlung — ausdrücklich und mittelbar (siehe oben).
 * Synchron, für Prüfungen und kleine Bestände; der Server nimmt
 * fachpruefungUebermittlungAsync (gibt der Event-Loop nach).
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter, schon zusammengeführter Betrieb
 * @param {string} [heute] JJJJ-MM-TT
 * @param {{ imBereich?: (personId: any, tag: string) => boolean }} [opt]
 *   imBereich: Schreibumfang der Schichtverantwortung (Review B4)
 * @returns {null | Fachergebnis}
 */
export function fachpruefungUebermittlung(altM, neuM, heute = heuteBerlin(), opt = {}) {
  const t0 = performance.now();
  const zaehler = { mittelbar: false, personen: 0, geprueft: 0, blockMs: 0 };
  try {
    const ausgabe = { konflikte: [] };
    const it = pruefen(altM, neuM, heute, zaehler, opt, ausgabe);
    let r = it.next();
    while (!r.done) r = it.next();
    return mitKonflikten(r.value, ausgabe);
  } finally {
    letzteLaufzeit = { ms: Math.round((performance.now() - t0) * 10) / 10, ...zaehler };
  }
}

/**
 * Dieselbe Prüfung in Häppchen (Review B2): Nach höchstens HAEPPCHEN_MS gibt
 * sie der Event-Loop nach (setImmediate), damit andere Betriebe nicht warten.
 * Nach ZEITBUDGET_MS bricht sie ab: { zeitbudget: true } — der Server
 * antwortet 503 „bitte erneut", nichts wird geschrieben.
 * @param {any} altM
 * @param {any} neuM
 * @param {string} [heute]
 * @param {{ imBereich?: (personId: any, tag: string) => boolean, budgetMs?: number }} [opt]
 * @returns {Promise<null | Fachergebnis>}
 */
export async function fachpruefungUebermittlungAsync(altM, neuM, heute = heuteBerlin(), opt = {}) {
  const t0 = performance.now();
  const budget = opt.budgetMs || ZEITBUDGET_MS;
  const zaehler = { mittelbar: false, personen: 0, geprueft: 0, blockMs: 0 };
  try {
    const ausgabe = { konflikte: [], haeppchen: true };
    const it = pruefen(altM, neuM, heute, zaehler, opt, ausgabe);
    /* Nachtrag WP-22b (Review HOCH 2): jeden Abschnitt auch von außen messen —
       auch den letzten, der ohne Nachgeben endet. */
    const schritt = () => {
      const a = performance.now();
      const x = it.next();
      zaehler.blockMs = Math.max(zaehler.blockMs, Math.round(performance.now() - a));
      return x;
    };
    let r = schritt();
    while (!r.done) {
      await new Promise((weiter) => setImmediate(weiter));
      if (performance.now() - t0 > budget) return { zeitbudget: true };
      r = schritt();
    }
    return mitKonflikten(r.value, ausgabe);
  } finally {
    letzteLaufzeit = { ms: Math.round((performance.now() - t0) * 10) / 10, ...zaehler };
  }
}

/**
 * @typedef {{ sperre?: string, zeitbudget?: boolean,
 *   warnungen?: { personId: any, datum: string, dienstId: any, befunde: { regel: string, stufe: string, text: string }[] }[],
 *   sammelVorschlag?: { regel: string, stufe: string, text: string, einheitId: any, von: string, bis: string, anzahl: number }[],
 *   sammel?: Record<string, { anzahl: number, von: string, bis: string }>, konflikte?: { personId: any, datum: string, dienstId: any }[] }} Fachergebnis
 */

/** Schutzangaben einer Person: ändern sie sich, wird gespeichert und nachgemeldet, nie abgewiesen (M2). */
const SCHUTZ_FELDER = ["mutterschutz", "mutterschutzEinwilligungen", "geburtstag", "geburtsdatum", "schwerbehindert", "nachtvorsorge"];
function nurSchutzGeaendert(a, b) {
  const ohne = (p) => { const x = { ...p }; for (const f of SCHUTZ_FELDER) delete x[f]; return x; };
  return gleich(ohne(a), ohne(b));
}
/** Ergebnis um die Konfliktliste ergänzen (nicht bei einer Absage). */
function mitKonflikten(r, ausgabe) {
  if (!ausgabe.konflikte.length || (r && (r.sperre || r.zeitbudget))) return r;
  return { ...(r || {}), konflikte: ausgabe.konflikte.slice(0, 200) };
}

/** Deckt eine Sammelbestätigung (Review B1) diese Einteilung? */
function sammelDeckt(b, p, d, regel) {
  return b.art === "sammel" && typeof b.von === "string" && typeof b.bis === "string" && b.von <= d && d <= b.bis
    && liste(b.befunde).some((x) => x.regel === regel)
    && (b.einheitId === null || b.einheitId === undefined || String(einheitAm(p, d)) === String(b.einheitId));
}

/**
 * @param {any} altM
 * @param {any} neuM
 * @param {string} heute
 * @param {{ mittelbar: boolean, personen: number, geprueft: number, blockMs: number }} zaehler
 * @param {{ imBereich?: (personId: any, tag: string) => boolean }} opt
 * @returns {Generator<void, null | Fachergebnis, void>}
 */
function* pruefen(altM, neuM, heute, zaehler, opt, ausgabe = { konflikte: [] }) {
  /* Häppchen: nach HAEPPCHEN_MS nachgeben (im synchronen Lauf ohne Wirkung).
     Nachtrag WP-22b (Review HOCH 2): bei jedem Aufruf prüfen, nicht nur bei
     jedem vierten — ein Schritt (eine Person im Umfeld, eine Einteilung mit
     zwei Befundrechnungen) kostet bis zu einigen Millisekunden; vier davon
     ergaben Blöcke von 30–80 ms. performance.now() kostet dagegen Nanosekunden. */
  let abschnitt = performance.now();
  const zeitUm = () => {
    if (!ausgabe.haeppchen) return false;                                   // synchroner Lauf: keine Uhr
    const jetzt = performance.now();
    if (jetzt - abschnitt < HAEPPCHEN_MS) return false;
    zaehler.blockMs = Math.max(zaehler.blockMs, Math.round(jetzt - abschnitt));
    return true;
  };
  const weiter = () => { abschnitt = performance.now(); };

  if (!istObjekt(neuM)) return null;
  const altAbw = istObjekt(altM && altM.abweichungen) ? altM.abweichungen : {};
  const neuAbw = istObjekt(neuM.abweichungen) ? neuM.abweichungen : altAbw;
  const mAlt = { ...(altM || {}), abweichungen: altAbw };
  const mNeu = { ...(altM || {}), ...neuM, abweichungen: neuAbw };
  const personenAlt = liste(mAlt.personen), personenNeu = liste(mNeu.personen);
  const altNach = new Map(personenAlt.map((p) => [String(p.id), p]));
  const neuNach = new Map(personenNeu.map((p) => [String(p.id), p]));
  const daNeu = new Map(liste(mNeu.dienstarten).map((d) => [String(d.id), d]));
  const daAlt = new Map(liste(mAlt.dienstarten).map((d) => [String(d.id), d]));
  const hatZeiten = (da) => !!da && typeof da.start === "string" && typeof da.ende === "string";
  const imBereich = typeof opt.imBereich === "function" ? opt.imBereich : null;

  /* 0. Eine noch verwendete Dienstart löschen (N1) — für alle Personen gleich. */
  if (altM && hat(neuM, "dienstarten")) {
    const weg = new Set([...daAlt.keys()].filter((id) => !daNeu.has(id)));
    if (weg.size) {
      const name = (id) => { const d = daAlt.get(String(id)); return (d && d.name) || String(id); };
      const zyklus = mNeu.zyklus;
      const inFolge = zyklus && Array.isArray(zyklus.tage) ? zyklus.tage.find((t) => weg.has(String(t))) : undefined;
      if (inFolge !== undefined)
        return { sperre: `Die Dienstart „${name(inFolge)}" wird noch verwendet (Schichtfolge). Erst die Schichtfolge ändern, dann löschen.` };
      let erster = null;
      for (const k in neuAbw) {
        if (zeitUm()) { yield; weiter(); }
        if (!hat(neuAbw, k) || !weg.has(String(neuAbw[k]))) continue;
        const [pid, tag] = String(k).split("|");
        if (!TAG.test(tag || "") || tag < heute) continue;
        if (!erster || tag < erster.tag) erster = { pid, tag, wert: neuAbw[k] };
      }
      if (erster)
        return { sperre: `Die Dienstart „${name(erster.wert)}" wird noch verwendet (${nameVon(neuNach.get(String(erster.pid)) || altNach.get(String(erster.pid)))}, ${erster.tag}). Erst umplanen, dann löschen.` };
    }
  }

  const rA = yield* planrechner(mAlt, personenAlt, zeitUm, weiter);
  const rN = yield* planrechner(mNeu, personenNeu, zeitUm, weiter);
  const kA = { dienstAm: rA.am, alleinOhnePartner: rA.alleinOhnePartner, heute };
  const kN = { dienstAm: rN.am, alleinOhnePartner: rN.alleinOhnePartner, heute };

  /* Welche Einteilungen sind zu prüfen? */
  const zellen = new Map();                                                  // "pid|tag" → ausdrücklicher Wert oder undefined
  if (neuAbw !== altAbw) for (const k in neuAbw) {                           // ohne Zwischenliste (N1)
    if (zeitUm()) { yield; weiter(); }
    if (!hat(neuAbw, k)) continue;
    const wert = neuAbw[k];
    if (altAbw[k] === wert) continue;
    const [pid, tag] = String(k).split("|");
    if (!TAG.test(tag || "") || !neuNach.has(String(pid))) continue;       // darüber urteilen die Rollenprüfungen
    if (!frei(wert) && !daNeu.has(String(wert)))
      return { sperre: `Einteilung am ${tag} nicht möglich: Die Dienstart ist nicht bekannt.` };   // fail-closed
    zellen.set(`${pid}|${tag}`, wert);
  }
  const struktur = [];                                                       // [Person, Tag] — mittelbar zu prüfen
  const strukturell = !!altM && (yield* planStrukturSchritte(mAlt, neuM, zeitUm, weiter));
  zaehler.mittelbar = strukturell;
  const horizont = Array.from({ length: SCHUTZ_HORIZONT_TAGE + 1 }, (_, i) => addDays(heute, i));
  if (strukturell) {
    /* Nur Einteilungen, an denen sich etwas geändert haben kann: eigener
       Dienst oder Dienstart, Dienste zwei Tage davor und danach (Ruhezeit),
       die Kalenderwoche (Höchstzahl), die Person selbst, das Bundesland der
       Einheit; „kein Alleindienst" immer. Ändern sich Vorgaben des Betriebs
       (Qualifikationen, Kompetenzen, Einstellungen, Standorte), wird alles
       gerechnet. */
    const vorgabenGleich = ["qualifikationen", "kompetenzen", "betriebsmittel", "einstellungen", "standorte", "bundesland"]
      .every((f) => !hat(neuM, f) || gleich(mAlt[f], neuM[f]));
    const daGleich = new Map();
    const dienstartGleich = (id) => {
      if (id === null) return true;
      const k = String(id);
      if (!daGleich.has(k)) daGleich.set(k, gleich(daAlt.get(k), daNeu.get(k)));
      return daGleich.get(k);
    };
    const umfeld = Array.from({ length: SCHUTZ_HORIZONT_TAGE + 15 }, (_, i) => addDays(heute, i - 7));   // Woche und ±2 Tage
    for (const p of personenNeu) {
      if (zeitUm()) { yield; weiter(); }
      zaehler.personen++;
      const pA = altNach.get(String(p.id));
      const personGleich = !!pA && (pA === p || gleich(pA, p));
      const allein = !!(p.einschraenkungen && p.einschraenkungen.keinAlleindienst);
      /* je Tag des Umfelds: derselbe Dienst mit derselben Dienstart? */
      /* je Tag nachgeben können (Review HOCH 2): eine Person kostet sonst bis zu 20 ms */
      let gleichAm = null;
      if (personGleich && vorgabenGleich && !allein) {
        gleichAm = [];
        for (const d of umfeld) {
          if (zeitUm()) { yield; weiter(); }
          const n = rN.am(p, d), a = rA.am(pA, d);
          gleichAm.push(String(n) === String(a) && dienstartGleich(n));
        }
      }
      for (let i = 0; i < horizont.length; i++) {
        if (zeitUm()) { yield; weiter(); }
        const d = horizont[i];
        if (zellen.size && zellen.has(`${p.id}|${d}`)) continue;
        if (gleichAm) {
          const j = i + 7;
          const wt = (tagNr(d) + 3) % 7;                                     // Montag = 0 (der 1.1.1970 war ein Donnerstag)
          let ruhig = gleichAm[j - 2] && gleichAm[j - 1] && gleichAm[j] && gleichAm[j + 1] && gleichAm[j + 2];
          for (let w = j - wt; ruhig && w <= j - wt + 6; w++) ruhig = gleichAm[w];
          if (ruhig && landFuerEinheit(mAlt, einheitAm(pA, d)) === landFuerEinheit(mNeu, einheitAm(p, d))) continue;
        }
        if (!rN.am(p, d)) continue;                                          // kein Dienst: nichts zu prüfen
        struktur.push([p, d]);
      }
      /* Nachprüfung 948a4ba (A2): Ändern sich die Schutzangaben, zählt der ganze
         künftige Zeitraum — auch ausdrückliche Einteilungen jenseits des Horizonts. */
      if (pA && !personGleich && nurSchutzGeaendert(pA, p))
        for (const d of rN.abwTage(p)) if (d > horizont[horizont.length - 1] && rN.am(p, d)) struktur.push([p, d]);
    }
  }
  if (!zellen.size && !struktur.length) return null;

  /* Tage mit ausdrücklichen Änderungen: dort auch die Kolleginnen mit
     „kein Alleindienst" — ihnen kann der Partner weggenommen worden sein.
     Für die Schichtverantwortung nur im eigenen Bereich am Tag (Review B4);
     was außerhalb davon neu entsteht, sperrt unten ohne Kennung. */
  if (!strukturell) {
    const allein = personenNeu.filter((p) => p.einschraenkungen && p.einschraenkungen.keinAlleindienst);
    if (allein.length)
      for (const k of [...zellen.keys()]) {
        const tag = k.slice(k.lastIndexOf("|") + 1);
        for (const p of allein) if (!zellen.has(`${p.id}|${tag}`)) zellen.set(`${p.id}|${tag}`, undefined);
      }
  }

  const funde = new Map();                                                   // "pid|tag" → { personId, datum, dienstId, befunde }
  const dazu = (pid, datum, dienstId, b) => {
    const k = `${pid}|${datum}`;
    if (!funde.has(k)) funde.set(k, { personId: neuNach.get(String(pid)) ? neuNach.get(String(pid)).id : pid, datum, dienstId, befunde: [] });
    const f = funde.get(k);
    if (!f.befunde.some((x) => x.regel === b.regel)) f.befunde.push(b);
  };
  /* Was der Server durchsetzt: sperrende und bestätigungspflichtige Regeln;
     ein Hinweis (etwa ein langer Dienst) nicht. */
  const zaehlt = (regel) => SERVER_REGELN.includes(regel) && (sperrtBefund(regel) || ["recht", "achtung"].includes(BEFUND_KATALOG[regel].stufe));

  /** Eine Einteilung prüfen; zurück kommt eine Absage oder null. */
  const zelle = (p, d, ausdruecklich) => {
    const id = ausdruecklich !== undefined ? (frei(ausdruecklich) ? null : ausdruecklich) : rN.am(p, d);
    if (!id) return null;
    const da = daNeu.get(String(id));
    if (!da) return { sperre: `Einteilung am ${d} nicht möglich: Die Dienstart ist nicht bekannt.` };
    if (!hatZeiten(da)) return null;
    zaehler.geprueft++;
    const neu = einteilungsBefunde(mNeu, p, da, d, kN).filter((b) => zaehlt(b.regel));
    if (!neu.length) return null;
    const pid = String(p.id);
    const pA = altNach.get(pid);
    const idA = pA ? rA.am(pA, d) : null;
    const daA = idA ? daAlt.get(String(idA)) : null;
    const vorher = new Set(pA && daA && hatZeiten(daA) ? einteilungsBefunde(mAlt, pA, daA, d, kA).map((b) => b.regel) : []);
    /* Nachprüfung 9717ddf (M2, Schutzpflicht): Dieselbe Einteilung wie vorher,
       nur die Schutzangaben der Person haben sich geändert — gespeichert wird
       immer; die Einteilung kommt in die Konfliktliste (Mitteilung an Planung
       und Leitung, Befund in der Planprüfung bis umgeplant). */
    if (pA && String(idA) === String(id) && ausdruecklich === undefined && !gleich(pA, p) && nurSchutzGeaendert(pA, p)) {
      if (neu.some((b) => !vorher.has(b.regel))) ausgabe.konflikte.push({ personId: p.id, datum: d, dienstId: id });
      return null;
    }
    for (const b of neu) if (!vorher.has(b.regel)) dazu(pid, d, id, { regel: b.regel, stufe: BEFUND_KATALOG[b.regel].stufe, text: neutralerText(b.regel) });
    /* Review M2: dieselbe Einteilung wie vorher, die Person hat sich (nicht nur im Schutz) geändert. */
    if (pA && String(idA) === String(id) && !gleich(pA, p) && funde.has(`${pid}|${d}`)) funde.get(`${pid}|${d}`).bestehend = true;
    return null;
  };
  for (const [k, ausdruecklich] of zellen) {
    if (zeitUm()) { yield; weiter(); }
    const i = k.lastIndexOf("|");
    const p = neuNach.get(k.slice(0, i));
    if (!p) continue;
    const r = zelle(p, k.slice(i + 1), ausdruecklich);
    if (r) return r;
  }
  for (const [p, d] of struktur) {
    if (zeitUm()) { yield; weiter(); }
    const r = zelle(p, d, undefined);
    if (r) return r;
  }

  /* Mindestbesetzung: Fällt ein Dienst durch diese Übermittlung unter die
     Vorgabe, ist das ein Befund an der Einteilung, die wegfiel. Nur, wenn
     eine Dienstart überhaupt eine Vorgabe hat. Bei einer strukturellen
     Änderung alle Tage im Horizont (auch dort, wo jemand wegfiel). */
  const mitVorgabe = [...daNeu.values(), ...daAlt.values()].some((da) => istObjekt(da.mindest));
  const tage = !mitVorgabe ? new Set()
    : strukturell ? new Set(horizont)
      : new Set([...zellen.keys()].map((k) => k.slice(k.lastIndexOf("|") + 1)));
  for (const d of tage) {
    yield; weiter();                                                         // je Tag eine ganze Besetzung: immer nachgeben
    const alt = rA.tag(d), neu = rN.tag(d);
    for (const [id, vorher] of alt) {
      const da = daNeu.get(String(id)) || daAlt.get(String(id));
      const soll = mindestOhneFeiertag(da, d);
      const jetzt = (neu.get(String(id)) || []).length;
      if (!soll || jetzt >= soll || jetzt >= vorher.length) continue;
      const weg = vorher.filter((p) => !(neu.get(String(id)) || []).some((x) => String(x.id) === String(p.id)));
      for (const p of weg) dazu(p.id, d, id, { regel: "untergrenze", stufe: BEFUND_KATALOG.untergrenze.stufe, text: befundText("untergrenze") });
    }
  }
  if (!funde.size) return null;

  /* Review B4: Die Schichtverantwortung kann nur für ihren Bereich bestätigen.
     Entsteht ein neuer Befund außerhalb davon, sperrt die Änderung — ohne
     Person, Tag, Regel oder Kennung aus dem fremden Bereich zu nennen. */
  if (imBereich)
    for (const f of funde.values())
      if (!imBereich(f.personId, f.datum))
        return { sperre: "Diese Änderung wirkt auf Einteilungen außerhalb deines Bereichs. Bitte mit der Planung klären." };

  /* Sperrend: abweisen. */
  for (const f of funde.values()) {
    const s = f.befunde.find((b) => sperrtBefund(b.regel));
    if (s) return { sperre: f.bestehend
      ? `Bestehende Einteilung am ${f.datum} widerspricht der Änderung an der Person: ${s.text}. Bitte erst umplanen, dann ändern.`
      : `Einteilung am ${f.datum} nicht möglich: ${s.text}. Sperrende Regeln lassen sich nicht bestätigen.` };
  }
  /* Warnend: nur mit Bestätigung im selben Speichervorgang — je Einteilung
     oder als Sammelbestätigung je Regel, Einheit und Zeitraum (Review B1). */
  const altIds = new Set(liste(altM && altM.bestaetigungen).map((b) => String(b.id)));
  const neueBest = liste(neuM.bestaetigungen).filter((b) => !altIds.has(String(b.id)));
  const sammelBest = neueBest.filter((b) => b.art === "sammel");
  const einzelBest = neueBest.filter((b) => b.art !== "sammel");
  /** @type {Record<string, { anzahl: number, von: string, bis: string }>} */
  const sammel = {};
  const bestaetigt = (f, regel) => {
    if (einzelBest.some((b) => String(b.personId) === String(f.personId) && b.datum === f.datum && liste(b.befunde).some((x) => x.regel === regel)))
      return true;
    const p = neuNach.get(String(f.personId));
    const s = p ? sammelBest.find((b) => sammelDeckt(b, p, f.datum, regel)) : null;
    if (!s) return false;
    /* Review S1: gezählt wird, was die Sammelbestätigung tatsächlich deckt —
       der gespeicherte Zeitraum schrumpft auf die betroffenen Tage. */
    const z = sammel[String(s.id)] || (sammel[String(s.id)] = { anzahl: 0, von: f.datum, bis: f.datum });
    z.anzahl++;
    if (f.datum < z.von) z.von = f.datum;
    if (f.datum > z.bis) z.bis = f.datum;
    return true;
  };
  const offen = [];
  for (const f of funde.values()) {
    const fehlt = f.befunde.filter((b) => !bestaetigt(f, b.regel));
    if (fehlt.length) offen.push({ ...f, befunde: fehlt });
  }
  if (!offen.length) return Object.keys(sammel).length ? { sammel } : null;
  /* Vorschlag für Sammelbestätigungen: je Regel und Einheit mit Zeitraum und Anzahl. */
  const gruppen = new Map();
  for (const f of offen) {
    const p = neuNach.get(String(f.personId));
    const eid = p ? einheitAm(p, f.datum) : null;
    for (const b of f.befunde) {
      /* Review S1: Schutzregeln nur einzeln bestätigen; ohne Einheit keine Sammelbestätigung. */
      if (BEFUND_KATALOG[b.regel] && BEFUND_KATALOG[b.regel].schutz) continue;
      if (eid === null || eid === undefined) continue;
      const k = `${b.regel}|${eid}`;
      const g = gruppen.get(k) || { regel: b.regel, stufe: b.stufe, text: b.text, einheitId: eid, von: f.datum, bis: f.datum, anzahl: 0 };
      if (f.datum < g.von) g.von = f.datum;
      if (f.datum > g.bis) g.bis = f.datum;
      g.anzahl++;
      gruppen.set(k, g);
    }
  }
  return { warnungen: offen.slice(0, 200), sammelVorschlag: [...gruppen.values()] };
}

/** Kompatibel zu WP-11: nur der Grund einer Absage (sperrend), sonst null. */
export function abweichungenSchutzPruefen(altM, neuM, heute) {
  const r = fachpruefungUebermittlung(altM, neuM, heute);
  return r && r.sperre ? r.sperre : null;
}

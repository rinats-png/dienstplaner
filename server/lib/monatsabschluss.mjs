/* ==========================================================================
   MONATSABSCHLUSS (WP-16)

   Ein abgeschlossener Monat ist für die Ist-Zeiten unveränderlich, bis die
   Leitung ihn wiederöffnet. Gesperrt werden alle Schreibwege, die eine
   Ist-Zeit dieses Monats berühren — serverseitig, für jede Rolle:

     - POST /api/stempeln (auch ein offline erfasster Stempel aus dem
       Puffer, WP-07): 409 MONAT_ABGESCHLOSSEN, nie still verworfen — der
       abgewiesene Stempel steht für die Leitung am Abschluss (`abgewiesen`),
       auf dem Gerät bleibt er mit Grund sichtbar und lässt sich nach dem
       Wiederöffnen erneut senden;
     - POST /api/stempel-korrektur, /api/korrektur-antrag,
       /api/korrektur-entscheiden (WP-06, WP-14), /api/zeit-bestaetigen
       (Selbstauskunft): 409 MONAT_ABGESCHLOSSEN;
     - PUT /api/bestand: eine Änderung an `erfassung` oder `einstempeln` eines
       abgeschlossenen Monats ist 403 MONAT_ABGESCHLOSSEN (Ausnahme wie bei
       WP-06: der Löschlauf nach Ablauf der Aufbewahrungsfrist). Der Abschluss
       selbst (`monatsabschluss`) kommt beim Speichern immer aus dem
       gespeicherten Stand — über das Speichern lässt sich kein Monat
       abschließen oder wiederöffnen;
     - POST /api/wiederherstellen: Abschlussstand und Ist-Zeiten
       abgeschlossener Monate bleiben, wie sie heute sind.

   Abschließen dürfen Leitung, Planung und die Kundenrolle (staff.edit,
   Vollschreibrecht); wiederöffnen nur Leitung und Kundenrolle (org.edit) —
   immer mit Grund, protokolliert mit Wann und Wer. Korrekturen nach dem
   Wiederöffnen sind weiter Ereignisse am Stempel (WP-06) und tragen die
   Kennung der Wiederöffnung (`nachWiederoeffnung`).

   Datenschutz (H8+): Beschäftigte, Betriebsrat und Schichtverantwortung
   sehen nur, ob ein Monat abgeschlossen ist — nicht wer, wann, warum, keine
   abgewiesenen Stempel anderer (sicht.mjs, abschlussStatus).

   Form: m.monatsabschluss["JJJJ-MM"] = { abgeschlossen, am, wer, abdruck?,
   verlauf: [{ id, art: "abschluss"|"wiederoeffnung", am, wer, grund, … }],
   abgewiesen?: [{ personId, datum, art, zeit, zeitAm, offline, ereignis, am, anzahl? }],
   abgewiesenGezaehlt?: { personId: Anzahl } }.
   `abdruck` ist eine Prüfsumme der Ist-Daten des Monats zum Abschluss —
   eine Änderungsanzeige (wer direkt auf die Ablage schreibt, kann sie
   neu berechnen; sie ist kein Manipulationsschutz).

   EINGEFRORENES IST (Review H1, isteinfrieren.mjs): Der Abschluss friert das
   Ist je Person und Tag ein (m.istEingefroren, auch Planzeit-Anteile, Pause
   der Dienstart, Abwesenheit). Plan, Dienstarten und Abwesenheiten bleiben
   änderbar, wirken auf den abgeschlossenen Monat aber nicht mehr: Konto,
   Lohnausgabe/DATEV, Zuschläge, Betriebsrat-Auswertung rechnen dort nur mit
   dem eingefrorenen Ist. Es gehört zu den Ist-Feldern (Prüfsumme, PUT-Sperre,
   Wiederherstellen); Wiederöffnen verwirft es (im Verlauf: wie viele
   Personentage das neu gerechnete Ist abweicht).

   KORREKTURREVISIONEN (WP-16c): Nach bestätigtem Lohnexport ist der Monat gegen einfaches Wiederöffnen gesperrt. Eine
   nachträgliche Änderung läuft als neue Revision: `korrektur-beginnen` (nur Leitung, org.edit; Anlass und Grund) legt
   die exportierte Revision N unverändert in `revisionen` ab (Zeitpunkt, Berechtigte, Abdruck, Kennung, die ausgegebenen
   Lohnzeilen kompakt), öffnet den Monat für Korrekturen (wie nach dem Wiederöffnen; das Freeze wird verworfen) und führt
   die Revision N+1. `abschliessen` schließt Revision N+1 und rechnet die Differenz der Lohnzeilen zur Revision N. Ist
   die Differenz nicht leer (lohnrelevant), braucht der Abschluss die Freigabe einer ZWEITEN Person
   (`korrektur-freigeben`, org.edit, andere Person als die, die begonnen hat), gebunden an genau diese Differenz und
   diesen Ist-Stand — jede weitere Änderung macht sie ungültig. Der Korrekturexport (`exportZeilenFuer`) enthält nur die
   Differenzzeilen, gekennzeichnet „Korrektur R2 zu R1“; er wird wie der erste Export bestätigt (`lohnexport`). Es gibt
   keine Wiederöffnungsfrist; maßgeblich ist der Exportstatus der laufenden Revision.

   ABGEWIESENE STEMPEL (Review M2/M3): höchstens ABGEWIESEN_JE_PERSON
   Einträge je Person, je Person, Tag und Art zusammengefasst (anzahl);
   alles über der Obergrenze nur gezählt; Offline-Zeiten älter als 48 h
   gekennzeichnet (alt). Löschfrist wie die Gründe (aufbewahrung.mjs), in der
   Auskunft (auskunft.mjs), bei Anonymisierung oder Löschung der Person weg.
   ========================================================================== */

import { loeschStichtag } from "./stempelintegritaet.mjs";
import { IST_EINGEFROREN, istEinfrieren, istAbweichungen, FREEZE_SCHEMA, freezeStatus, datevAusFreeze, datevHinweise } from "./isteinfrieren.mjs";
import { abschlussPersonenRaeumen } from "./aufbewahrung.mjs";

export { abschlussPersonenRaeumen };

/* SHA-256 ohne node:crypto: Diese Datei erreicht über sicht.mjs und
   rechte.mjs auch die Oberfläche (Vite-Bündel), dort gibt es node:crypto
   nicht. Nur für die Prüfsumme der Ist-Daten, kein Geheimnis. */
const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb,
  0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f,
  0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256Hex(text) {
  const daten = new TextEncoder().encode(String(text));
  const laenge = daten.length;
  const bloecke = Math.ceil((laenge + 9) / 64);
  const b = new Uint8Array(bloecke * 64);
  b.set(daten);
  b[laenge] = 0x80;
  const bits = laenge * 8;
  const dv = new DataView(b.buffer);
  dv.setUint32(b.length - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(b.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < b.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += bb; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

export const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
export const ABSCHLUSS_FELD = "monatsabschluss";
export const MONAT_ABGESCHLOSSEN = "MONAT_ABGESCHLOSSEN";
/** Wiederöffnen nach bestätigtem Lohnexport: abgelehnt, Korrektur nur über den Revisionsprozess (WP-16c). */
export const KORREKTUR_ERFORDERLICH = "KORREKTUR_ERFORDERLICH";
/** Lohnexport bestätigen ohne den Stand der ausgegebenen Datei (Prüfsumme, Abschluss, Revision, Zeilen). */
export const EXPORTSTAND_FEHLT = "EXPORTSTAND_FEHLT";
/** Die ausgegebene Datei gehört zu einem anderen Abschlussstand (Rennen: wiederöffnet, geändert, neu abgeschlossen). */
export const EXPORTSTAND_ABWEICHEND = "EXPORTSTAND_ABWEICHEND";
/** Der Abschluss ist nicht reproduzierbar (Schema < 3 oder unbekannt): erst erneut abschließen. */
export const FREEZE_NICHT_REPRODUZIERBAR = "FREEZE_NICHT_REPRODUZIERBAR";
/** Lohnexport mit Vormonaten des Jahres, die offen sind oder beim Abschluss offen waren (Konto vorläufig; Nachtrag vierter Review A-1). */
export const VORMONAT_OFFEN = "VORMONAT_OFFEN";
/** Lohnexport, obwohl ein Vormonat seit dem Abschluss wiederöffnet und neu abgeschlossen wurde (Konto veraltet; A-1). */
export const VORMONAT_GEAENDERT = "VORMONAT_GEAENDERT";
/** Kategorien der ausdrücklichen Überstimmung (trotzVormonat) — die Spur nennt nur die Kategorie, nie den Freitext. */
export const VORMONAT_KATEGORIEN = Object.freeze({
  vor_inbetriebnahme: "Vormonate vor der Inbetriebnahme — keine Zeitdaten in CENTRIC",
  abgestimmt: "Mit dem Lohnbüro abgestimmt",
  ausgleich_folgemonat: "Abweichung wird im Folgemonat ausgeglichen",
  sonstiges: "Sonstiges (siehe Begründung)",
});
/** WP-16c: Abschluss einer Korrekturrevision mit lohnrelevanter Differenz ohne gültige Freigabe einer zweiten Person. */
export const KORREKTUR_FREIGABE_ERFORDERLICH = "KORREKTUR_FREIGABE_ERFORDERLICH";
/** WP-16c: Die exportierte Revision lässt sich nicht reproduzieren (Freeze gelöscht/unbrauchbar) — keine Differenz möglich. */
export const KORREKTUR_BASIS_FEHLT = "KORREKTUR_BASIS_FEHLT";
/** WP-16c: Die heute erzeugten Lohnzeilen weichen von den bestätigten ab (z. B. Anonymisierung) — nur ausdrücklich. */
export const KORREKTUR_BASIS_ABWEICHEND = "KORREKTUR_BASIS_ABWEICHEND";
/** WP-16c: Die Freigabe nennt die Differenz nicht (oder eine andere als heute) — die Vorschau steht in der Antwort. */
export const KORREKTUR_DIFFERENZ_FEHLT = "KORREKTUR_DIFFERENZ_FEHLT";
/** Anlässe einer Korrekturrevision (nur Kennzeichnung im Verlauf; kein Einfluss auf die Regeln). */
export const KORREKTUR_ANLAESSE = Object.freeze({
  fehler: "Fehler in den Zeiten",
  nachtrag: "Nachgereichte Zeiten (z. B. spät eingegangene Offline-Stempel)",
  gesetzlich: "Gesetzlich erforderliche Berichtigung",
  sonstiges: "Sonstiges (siehe Begründung)",
});
/** Höchstens so viele abgelegte Revisionen je Monat (Größe des Bestands). */
export const REVISIONEN_MAX = 50;
export const WIEDEROEFFNEN_GRUND_MIN = 10;
export const ABSCHLUSS_GRUND_MAX = 500;
export const ABSCHLUSS_VERLAUF_MAX = 200;
export const ABGEWIESEN_MAX = 200;
/** Höchstens so viele abgewiesene Stempel je Person und Monat einzeln (Review M3); darüber nur gezählt. */
export const ABGEWIESEN_JE_PERSON = 20;
/** Obergrenzen der Zähler: je Eintrag `anzahl` (Person, Tag, Art) und je Person `abgewiesenGezaehlt`. Erreicht,
    wächst nichts mehr — kein Schreibvorgang mehr. Je Person und Monat also höchstens etwa
    ABGEWIESEN_JE_PERSON × ABGEWIESEN_ANZAHL_MAX + ABGEWIESEN_GEZAEHLT_MAX Schreibvorgänge (dazu die Bremse je Person). */
export const ABGEWIESEN_ANZAHL_MAX = 10;
export const ABGEWIESEN_GEZAEHLT_MAX = 99;
/** Offline-Zeiten, die älter als 48 Stunden ankommen (wie OFFLINE_MAX_ALTER_MS, WP-07): als `alt` gekennzeichnet. */
export const ABGEWIESEN_ALT_MS = 48 * 60 * 60 * 1000;
/** Die Sammlungen, die der Abschluss sperrt (Ist-Zeiten und Stempel samt Korrekturen und Anträgen) und das eingefrorene Ist. */
export const IST_FELDER = Object.freeze(["einstempeln", "erfassung", IST_EINGEFROREN]);

const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* Wie `gleich` (JSON-Gleichheit, Reihenfolge der Schlüssel zählt), aber ohne Zeichenketten zu bauen —
   abschlussWiderspruch vergleicht je PUT alle Ist-Einträge abgeschlossener Monate (WP-16, Nachtrag M-neu-1). */
function gleichWert(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return gleich(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!gleichWert(a[i], b[i])) return false;
    return true;
  }
  /* Schneller Weg: dieselben Schlüssel in derselben Reihenfolge mit gleichen Werten. Sonst entscheidet die
     JSON-Gleichheit wie vorher (Reihenfolge, undefined, Sonderfälle). */
  let na = 0;
  for (const k in a) {
    if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
    na++;
    if (!gleichWert(a[k], b[k])) return gleich(a, b);
  }
  let nb = 0, reihenfolge = true;
  const ka = na <= 64 ? Object.keys(a) : null;
  for (const k in b) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
    if (ka && ka[nb] !== k) reihenfolge = false;
    nb++;
  }
  return na === nb && reihenfolge ? true : gleich(a, b);
}
const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** "JJJJ-MM" eines Tages oder Monats — sonst null. */
export function monatVon(x) {
  const s = String(x ?? "");
  if (MONAT.test(s)) return s;
  if (TAG.test(s) && MONAT.test(s.slice(0, 7))) return s.slice(0, 7);
  return null;
}
/** Lesbarer Monat: „Oktober 2026". */
export const monatText = (monat) => (MONAT.test(String(monat))
  ? `${MONATSNAMEN[Number(monat.slice(5, 7)) - 1]} ${monat.slice(0, 4)}` : String(monat));
const monatDesSchluessels = (k) => monatVon(String(k).split("|")[1] || "");
/** Gehört der Schlüssel zum Monat? Vorfilter ohne Regex (der Teil nach dem ersten „|" beginnt mit dem Monat), dann
    dieselbe Regel wie monatDesSchluessels — Abschluss und Wiederöffnen laufen über alle Ist-Schlüssel aller Monate
    (WP-16 Nachtrag, Messmatrix: 400 Personen × 36 Monate). */
const imMonat = (k, monat) => {
  const s = String(k); const i = s.indexOf("|");
  return i >= 0 && s.startsWith(monat, i + 1) && monatDesSchluessels(s) === monat;
};

/** Der gespeicherte Eintrag eines Monats — oder null. */
export function abschlussEintrag(m, monat) {
  const a = m && objekt(m[ABSCHLUSS_FELD]) ? m[ABSCHLUSS_FELD] : null;
  const e = a && MONAT.test(String(monat)) ? a[monat] : null;
  return objekt(e) ? e : null;
}

/** Ist der Monat dieses Tages (oder dieser Monat) abgeschlossen? */
export function monatAbgeschlossen(m, tagOderMonat) {
  const mon = monatVon(tagOderMonat);
  if (!mon) return false;
  const e = abschlussEintrag(m, mon);
  return !!e && e.abgeschlossen === true;
}

/** Alle abgeschlossenen Monate des Betriebs. */
export function abgeschlosseneMonate(m) {
  const a = m && objekt(m[ABSCHLUSS_FELD]) ? m[ABSCHLUSS_FELD] : {};
  return Object.keys(a).filter((mon) => MONAT.test(mon) && objekt(a[mon]) && a[mon].abgeschlossen === true).sort();
}

/**
 * Die Absage eines Schreibwegs für einen Tag eines abgeschlossenen Monats —
 * oder null, wenn der Monat offen ist.
 * @returns {null | {status: number, code: string, monat: string, grund: string, lohnexportiert?: boolean}}
 */
export function abschlussSperre(m, datum) {
  if (!monatAbgeschlossen(m, datum)) return null;
  const monat = /** @type {string} */ (monatVon(datum));
  /* Nach bestätigtem Lohnexport (WP-16, Nachtrag dritter Review N-a): kein Wiederöffnen mehr — Nachträge nur über den
     Korrekturprozess. Beschäftigte sehen den Status als `lohnexportiert` (abschlussStatus). */
  const e = abschlussEintrag(m, monat);
  if (e && (objekt(e.lohnexport) || e.lohnexportiert === true))
    return { status: 409, code: MONAT_ABGESCHLOSSEN, monat, lohnexportiert: true,
      grund: `Der Monat ${monatText(monat)} ist abgeschlossen und der Lohnexport bestätigt. Ist-Zeiten dieses Monats ändern sich nur noch über den Korrekturprozess der Leitung.` };
  return { status: 409, code: MONAT_ABGESCHLOSSEN, monat,
    grund: `Der Monat ${monatText(monat)} ist abgeschlossen. Ist-Zeiten dieses Monats ändern sich erst, wenn die Leitung ihn wiederöffnet.` };
}

/* --------------------------------------------------------------------------
   Prüfsumme der Ist-Daten eines Monats
   -------------------------------------------------------------------------- */
function geordnet(x) {
  if (Array.isArray(x)) return x.map(geordnet);
  if (objekt(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, geordnet(x[k])]));
  return x;
}
/** Die Ist-Daten (Stempel, Erfassung, eingefrorenes Ist) eines Monats, Schlüssel geordnet. */
export function istDesMonats(m, monat) {
  const aus = {};
  for (const feld of IST_FELDER) {
    const w = m && objekt(m[feld]) ? m[feld] : {};
    aus[feld] = geordnet(Object.fromEntries(Object.entries(w).filter(([k]) => imMonat(k, monat))));
  }
  return aus;
}
/** Prüfsumme der Ist-Daten eines Monats (32 Hex-Zeichen, SHA-256). */
export function istAbdruck(m, monat) {
  return sha256Hex(JSON.stringify(istDesMonats(m, monat))).slice(0, 32);
}
/**
 * Prüfsumme der Lohnausgabe-Zeilen (WP-16, Nachtrag dritter Review H-2): Personalnummer, Name, Lohnart, Bezeichnung,
 * Stunden, Monat — in der Reihenfolge der Datei (datevReihenfolge: Personalnummer, dann Lohnart; WP-16, Nachtrag
 * vierter Review N-2: vorher in der Reihenfolge der übergebenen Zeilen). Oberfläche (aus den Zeilen der Datei) und
 * Server (aus dem Freeze, datevAusFreeze) rechnen sie gleich; beim Bestätigen des Lohnexports müssen beide übereinstimmen.
 */
export function datevZeilenAbdruck(zeilen) {
  const z = (Array.isArray(zeilen) ? zeilen : []).slice().sort(datevReihenfolge).map((x) => [x.personalnummer ?? null,
    x.nachname ?? null, x.vorname ?? null, x.lohnart ?? null, x.bezeichnung ?? null, x.stunden ?? null, x.monat ?? null]);
  return sha256Hex(JSON.stringify(z)).slice(0, 32);
}
/**
 * Reihenfolge der Lohnausgabe (datevCSV der Oberfläche): Personalnummer, dann Lohnart, numerisch. Bei Gleichstand
 * entscheidet die ganze Zeile — die Prüfsumme hängt so nie an der Reihenfolge der Eingabe.
 */
export function datevReihenfolge(a, b) {
  const zeile = (x) => JSON.stringify([x.personalnummer ?? null, x.nachname ?? null, x.vorname ?? null, x.lohnart ?? null,
    x.bezeichnung ?? null, x.stunden ?? null, x.monat ?? null]);
  return String(a.personalnummer).localeCompare(String(b.personalnummer), "de", { numeric: true })
    || String(a.lohnart).localeCompare(String(b.lohnart), "de", { numeric: true })
    || (zeile(a) < zeile(b) ? -1 : zeile(a) > zeile(b) ? 1 : 0);
}
/**
 * Die heute erzeugte Lohnausgabe eines Monats mit bestätigtem Lohnexport gegen die bestätigte Zeilen-Prüfsumme
 * (WP-16, Nachtrag vierter Review A-3) — null ohne bestätigten Export.
 *   gleich      dieselben Zeilen wie bestätigt;
 *   abweichend  andere Zeilen (Anonymisierung im Löschlauf, anderer Softwarestand) — maßgeblich bleibt die bestätigte;
 *   geloescht   der Freeze ist nach Frist gelöscht (keine Zeilen mehr).
 * @param {any} m
 * @param {string} mon
 * @param {any[]} [zeilen] die Zeilen der Ausgabe (Oberfläche: datevSaetze); ohne Angabe aus dem Freeze
 */
export function lohnexportVergleich(m, mon, zeilen) {
  const e = abschlussEintrag(m, mon);
  if (!e || e.abgeschlossen !== true || !objekt(e.lohnexport)) return null;
  const bestaetigt = typeof e.lohnexport.zeilen === "string" ? e.lohnexport.zeilen : null;
  const st = freezeStatus(m, mon);
  const basis = { bestaetigt, am: e.lohnexport.am ?? null, n: e.lohnexport.n ?? null };
  if (st && st.grund === "geloescht") return { status: "geloescht", ...basis, heute: null };
  const heute = datevZeilenAbdruck(Array.isArray(zeilen) ? zeilen : exportZeilenFuer(m, mon).zeilen);
  return { status: heute === bestaetigt ? "gleich" : "abweichend", ...basis, heute };
}

/* --------------------------------------------------------------------------
   Offene Punkte vor dem Abschluss
   -------------------------------------------------------------------------- */
/**
 * Was im Monat noch offen ist: Korrekturanträge (sperren den Abschluss),
 * Stempel ohne vollständige Zeit (Beginn oder Ende fehlt, veraltet,
 * Konflikt — ohne Korrektur) und Ist-Zeiten zur Prüfung (nicht bestätigt).
 * Nur Zahlen, keine Personen.
 */
export function offenePunkte(m, monat) {
  const st = m && objekt(m.einstempeln) ? m.einstempeln : {};
  const erf = m && objekt(m.erfassung) ? m.erfassung : {};
  let antraege = 0, offeneStempel = 0, zurPruefung = 0;
  for (const [k, e] of Object.entries(st)) {
    if (!imMonat(k, monat) || !objekt(e)) continue;
    antraege += (Array.isArray(e.antraege) ? e.antraege : []).filter((a) => objekt(a) && a.status === "offen").length;
    const ist = erf[k];
    const marken = Array.isArray(e.markierungen) ? e.markierungen : [];
    const fall = !e.start || !e.ende || marken.includes("KONFLIKT") || marken.includes("START_VERALTET") || marken.includes("START_FEHLT");
    if (fall && !(objekt(ist) && ist.bestaetigt === true && ist.korrigiert === true)) offeneStempel++;
  }
  for (const [k, e] of Object.entries(erf)) {
    if (!imMonat(k, monat) || !objekt(e)) continue;
    if (e.bestaetigt !== true) zurPruefung++;
  }
  return { antraege, offeneStempel, zurPruefung };
}

/** Stempel vom letzten Tag des Monats mit Beginn und ohne Ende (laufender Dienst über Mitternacht). */
export function laufendAmMonatsletzten(m, monat) {
  const [j, mo] = String(monat).split("-").map(Number);
  const letzter = new Date(Date.UTC(j, mo, 0)).toISOString().slice(0, 10);
  const st = m && objekt(m.einstempeln) ? m.einstempeln : {};
  return Object.entries(st).filter(([k, e]) => String(k).split("|")[1] === letzter && objekt(e) && e.start && !e.ende).length;
}

/* --------------------------------------------------------------------------
   Abschließen und wiederöffnen
   -------------------------------------------------------------------------- */
const werForm = (w) => ({ personId: w && w.personId !== undefined ? w.personId : null,
  name: (w && w.name) || null, rolle: (w && w.rolle) || null });

/**
 * Einen vergangenen Monat abschließen.
 * @param {any} m gespeicherter Betrieb
 * @param {{monat?: string, grund?: string, trotzPrueffaellen?: boolean, vorschau?: boolean}} r
 * @param {{personId: any, name?: string|null, rolle?: string|null}} wer
 * @param {Date} jetzt
 * @param {string} id Kennung des Verlaufseintrags
 * @param {string} heute "JJJJ-MM-TT" (Berlin)
 * @returns {{status: number, grund: string, code?: string, offen?: object, differenz?: object} | {mandant: object, eintrag: object, ereignis: object, differenz?: {abdruck: string, n: number, summe: number}}}
 */
export function abschliessen(m, r, wer, jetzt, id, heute) {
  const monat = r && r.monat;
  if (!MONAT.test(String(monat ?? ""))) return { status: 422, grund: "Kein gültiger Monat (JJJJ-MM)." };
  if (!(String(monat) < String(heute).slice(0, 7)))
    return { status: 422, grund: "Abschließen lässt sich nur ein vergangener Monat." };
  const grund = typeof (r && r.grund) === "string" ? r.grund.trim() : "";
  if (grund.length > ABSCHLUSS_GRUND_MAX) return { status: 422, grund: `Der Vermerk ist zu lang (höchstens ${ABSCHLUSS_GRUND_MAX} Zeichen).` };
  const alt = abschlussEintrag(m, monat);
  if (alt && alt.abgeschlossen === true) return { status: 409, grund: `Der Monat ${monatText(monat)} ist schon abgeschlossen.` };
  const verlauf = alt && Array.isArray(alt.verlauf) ? alt.verlauf : [];
  if (verlauf.length >= ABSCHLUSS_VERLAUF_MAX)
    return { status: 409, grund: "Dieser Monat wurde so oft abgeschlossen und wiedergeöffnet, dass der Server keinen weiteren Schritt annimmt. Bitte mit der Betriebsleitung klären." };
  const offen = offenePunkte(m, monat);
  if (offen.antraege)
    return { status: 409, code: "ABSCHLUSS_ANTRAEGE_OFFEN", offen,
      grund: `Im ${monatText(monat)} ${offen.antraege === 1 ? "ist noch 1 Korrekturantrag" : `sind noch ${offen.antraege} Korrekturanträge`} offen. Bitte zuerst entscheiden.` };
  if ((offen.offeneStempel || offen.zurPruefung) && !(r && r.trotzPrueffaellen === true)) {
    /* Nutzerführung (Review WP-16): Ein am Monatsletzten begonnener Dienst ohne Ende ist meist ein
       laufender Nachtdienst. Sein Ausstempeln gehört zum Tag des Beginns — nach dem Abschluss würde es
       abgewiesen. Das sagt die Meldung, statt nur „unvollständig" zu zählen. */
    const nachtOffen = laufendAmMonatsletzten(m, monat);
    return { status: 409, code: "ABSCHLUSS_PRUEFFAELLE", offen: { ...offen, ...(nachtOffen ? { nachtOffen } : {}) },
      grund: `Im ${monatText(monat)} sind noch ${offen.offeneStempel} unvollständige Stempel und ${offen.zurPruefung} Ist-Zeiten zur Prüfung offen.`
        + (nachtOffen ? ` Davon ${nachtOffen === 1 ? "ist 1 Dienst" : `sind ${nachtOffen} Dienste`} vom Monatsletzten noch nicht ausgestempelt `
          + "(etwa ein laufender Nachtdienst): Das Ausstempeln gehört noch zu diesem Monat und würde nach dem Abschluss abgewiesen "
          + "— besser erst abschließen, wenn ausgestempelt ist." : "")
        + " Trotzdem abschließen?" };
  }
  /* Das Ist je Person und Tag einfrieren (Review H1) — am gespeicherten, vollständigen Stand. Die Prüfsumme deckt es mit. */
  const mitIst = { ...m, [IST_EINGEFROREN]: { ...ohneMonat(m[IST_EINGEFROREN], monat), ...istEinfrieren(m, monat) } };
  const abdruck = istAbdruck(mitIst, monat);
  /** @type {any} */
  const ereignis = { id, art: "abschluss", am: jetzt.toISOString(), wer: werForm(wer), grund, abdruck,
    ...(offen.offeneStempel || offen.zurPruefung ? { offen: { offeneStempel: offen.offeneStempel, zurPruefung: offen.zurPruefung } } : {}) };
  /* Schema und Revision (WP-16 Nachtrag): Der Abschluss ist Revision 1 — revisionsfähig für WP-16c. */
  /* `stand`: Kennung dieses Abschlusses (WP-16, Nachtrag dritter Review H-2) — der Lohnexport bestätigt genau ihn;
     ein erneutes Abschließen nach dem Wiederöffnen ist ein anderer Stand, auch bei gleicher Prüfsumme. */
  const eintrag = { ...(alt || {}), abgeschlossen: true, am: ereignis.am, wer: ereignis.wer, abdruck, stand: id,
    schema: FREEZE_SCHEMA, revision: Number.isInteger(alt && alt.revision) ? alt.revision : 1, verlauf: [...verlauf, ereignis] };
  const mandantNeu = { ...mitIst, [ABSCHLUSS_FELD]: { ...(objekt(m[ABSCHLUSS_FELD]) ? m[ABSCHLUSS_FELD] : {}), [monat]: eintrag } };
  /* Korrekturrevision (WP-16c): Differenz der Lohnzeilen zur exportierten Revision. Lohnrelevant (nicht leer) ⇒ der Abschluss
     braucht die Freigabe einer zweiten Person für genau diese Differenz und diesen Ist-Stand; ohne sie wird nichts geschlossen. */
  const kor = alt && objekt(alt.korrektur) && alt.korrektur.offen === true ? alt.korrektur : null;
  if (kor) {
    const ex = exportZeilenFuer(mandantNeu, monat);
    const differenz = differenzKurz(ex.zeilen);
    const vorschau = r && r.vorschau === true;
    if (!vorschau && differenz.n > 0) {
      const f = kor.freigabe;
      if (!objekt(f) || f.differenz !== differenz.abdruck || f.abdruck !== abdruck)
        return { status: 409, code: KORREKTUR_FREIGABE_ERFORDERLICH, differenz,
          grund: `Die Korrektur für ${monatText(monat)} ändert ${differenz.n === 1 ? "1 Lohnzeile" : `${differenz.n} Lohnzeilen`}. Vor dem Abschluss gibt eine zweite Person (Leitung) genau diese Differenz frei${objekt(f) ? " — die bisherige Freigabe passt nicht mehr (Ist-Daten oder Differenz haben sich geändert)" : ""}.` };
    }
    ereignis.revision = eintrag.revision;
    ereignis.differenz = differenz;
    eintrag.korrektur = { ...kor, offen: false, geschlossenAm: ereignis.am, differenz,
      ...(differenz.n > 0 && !vorschau ? { freigabe: kor.freigabe } : {}) };
    return { ereignis, eintrag, differenz, mandant: mandantNeu };
  }
  return { ereignis, eintrag, mandant: mandantNeu };
}

/** Eine Sammlung „personId|JJJJ-MM-TT" ohne die Einträge eines Monats. */
function ohneMonat(w, monat) {
  return Object.fromEntries(Object.entries(objekt(w) ? w : {}).filter(([k]) => !imMonat(k, monat)));
}

/**
 * Einen abgeschlossenen Monat wiederöffnen — mit Grund. Der Verlauf hält
 * fest, ob die Ist-Daten seit dem Abschluss unverändert sind
 * (`abdruckGleich`).
 * @returns {{status: number, grund: string, code?: string} | {mandant: object, eintrag: object, ereignis: object}}
 */
export function wiederoeffnen(m, r, wer, jetzt, id) {
  const monat = r && r.monat;
  if (!MONAT.test(String(monat ?? ""))) return { status: 422, grund: "Kein gültiger Monat (JJJJ-MM)." };
  const grund = typeof (r && r.grund) === "string" ? r.grund.trim() : "";
  if (grund.length < WIEDEROEFFNEN_GRUND_MIN || grund.length > ABSCHLUSS_GRUND_MAX)
    return { status: 422, grund: `Wiederöffnen braucht einen Grund (${WIEDEROEFFNEN_GRUND_MIN}–${ABSCHLUSS_GRUND_MAX} Zeichen).` };
  const alt = abschlussEintrag(m, monat);
  if (!alt || alt.abgeschlossen !== true) return { status: 409, grund: `Der Monat ${monatText(monat)} ist nicht abgeschlossen.` };
  /* Nach bestätigtem Lohnexport (Betreiberentscheidung 2026-11-03): Der Originalabschluss wird nicht mehr still
     verändert — Korrekturen laufen als neue Revision (WP-16c), nicht über das Wiederöffnen. */
  if (objekt(alt.lohnexport))
    return { status: 409, code: KORREKTUR_ERFORDERLICH,
      grund: `Der Lohnexport für ${monatText(monat)} ist bestätigt. Korrekturprozess erforderlich — einfaches Wiederöffnen ist nicht mehr möglich. `
        + "Die Leitung beginnt eine Korrekturrevision (aktion korrektur-beginnen); die exportierte Revision bleibt als Revision erhalten." };
  const verlauf = Array.isArray(alt.verlauf) ? alt.verlauf : [];
  if (verlauf.length >= ABSCHLUSS_VERLAUF_MAX)
    return { status: 409, grund: "Dieser Monat wurde so oft abgeschlossen und wiedergeöffnet, dass der Server keinen weiteren Schritt annimmt. Bitte mit der Betriebsleitung klären." };
  const abdruck = istAbdruck(m, monat);
  /* istNeu: so viele Personentage rechnen nach dem Wiederöffnen anders als eingefroren
     (Plan, Dienstart oder Abwesenheit seit dem Abschluss geändert) — ohne Personen. */
  const ereignis = { id, art: "wiederoeffnung", am: jetzt.toISOString(), wer: werForm(wer), grund, abdruck,
    abdruckGleich: abdruck === alt.abdruck, istNeu: istAbweichungen(m, monat) };
  const { abdruck: _weg, stand: _stand, ...rest } = alt;
  void _weg; void _stand;
  /* Eine geschlossene, noch nicht exportierte Korrekturrevision (WP-16c) wird wieder offen — die Freigabe gilt nicht mehr. */
  const korrektur = objekt(alt.korrektur) ? { korrektur: { ...alt.korrektur, offen: true, freigabe: null, differenz: null } } : {};
  const eintrag = { ...rest, ...korrektur, abgeschlossen: false, am: ereignis.am, wer: ereignis.wer, verlauf: [...verlauf, ereignis] };
  /* Das eingefrorene Ist wird verworfen: Ab jetzt gilt wieder das gerechnete (Review H1). */
  return { ereignis, eintrag, mandant: { ...m, [IST_EINGEFROREN]: ohneMonat(m[IST_EINGEFROREN], monat),
    [ABSCHLUSS_FELD]: { ...m[ABSCHLUSS_FELD], [monat]: eintrag } } };
}

/**
 * Den Lohnexport eines abgeschlossenen Monats bestätigen (Betreiberentscheidung 2026-11-03): Wann, Wer und
 * die Prüfsumme des exportierten Standes. Danach ist einfaches Wiederöffnen gesperrt (KORREKTUR_ERFORDERLICH).
 * Nur der Status — der Revisions-/Korrekturprozess folgt mit WP-16c (Revision im Eintrag vorbereitet).
 * Offene oder seit dem Abschluss geänderte Vormonate: 409 VORMONAT_OFFEN / VORMONAT_GEAENDERT (mit `vormonate`), außer
 * mit trotzVormonat: true, vormonatKategorie (VORMONAT_KATEGORIEN) und vormonatGrund (Nachtrag vierter Review A-1).
 * @returns {{status: number, grund: string, code?: string, vormonate?: {offen: string[], geaendert: string[]}} | {mandant: object, eintrag: object, ereignis: object}}
 */
export function lohnexportBestaetigen(m, r, wer, jetzt, id) {
  const monat = r && r.monat;
  if (!MONAT.test(String(monat ?? ""))) return { status: 422, grund: "Kein gültiger Monat (JJJJ-MM)." };
  const alt = abschlussEintrag(m, monat);
  if (!alt || alt.abgeschlossen !== true)
    return { status: 409, grund: `Der Monat ${monatText(monat)} ist nicht abgeschlossen — den Lohnexport bestätigt man erst nach dem Abschluss.` };
  if (objekt(alt.lohnexport)) return { status: 409, grund: `Der Lohnexport für ${monatText(monat)} ist schon bestätigt.` };
  const verlauf = Array.isArray(alt.verlauf) ? alt.verlauf : [];
  if (verlauf.length >= ABSCHLUSS_VERLAUF_MAX)
    return { status: 409, grund: "Dieser Monat wurde so oft abgeschlossen und wiedergeöffnet, dass der Server keinen weiteren Schritt annimmt. Bitte mit der Betriebsleitung klären." };
  /* Nur ein reproduzierbarer Abschluss (Schema 3: Konto, Summen, Personalangaben eingefroren) lässt sich als
     exportiert bestätigen (WP-16, Nachtrag dritter Review H-1/M-1). */
  const st = freezeStatus(m, monat);
  if (!st || st.unbekannt || !st.reproduzierbar || alt.schema !== FREEZE_SCHEMA)
    return { status: 409, code: FREEZE_NICHT_REPRODUZIERBAR,
      grund: `Der Abschluss für ${monatText(monat)} ist in einem älteren oder unbekannten Format und nicht reproduzierbar. Bitte wiederöffnen und erneut abschließen, dann die Lohnausgabe neu erzeugen.` };
  const abdruck = istAbdruck(m, monat);
  if (abdruck !== alt.abdruck)
    return { status: 409, code: "ABDRUCK_ABWEICHEND",
      grund: `Die Ist-Daten für ${monatText(monat)} weichen von der Prüfsumme des Abschlusses ab. Bitte wiederöffnen und erneut abschließen, bevor der Lohnexport bestätigt wird.` };
  const revision = Number.isInteger(alt.revision) ? alt.revision : 1;
  /* Gebunden an die ausgegebene Datei (WP-16, Nachtrag dritter Review H-2): Die Oberfläche schickt Prüfsumme,
     Abschlusskennung und Revision, aus denen die Datei entstand, und die Prüfsumme ihrer Zeilen. Weicht etwas vom
     heutigen Abschluss ab (dazwischen wiederöffnet, geändert, neu abgeschlossen), wird nichts bestätigt. Die Zeilen
     rechnet der Server selbst aus dem Freeze nach (datevAusFreeze) — bestätigt wird nur, was er selbst ausgeben würde. */
  const x = r || {};
  if (typeof x.abdruck !== "string" || typeof x.zeilen !== "string" || x.stand === undefined || x.stand === null)
    return { status: 409, code: EXPORTSTAND_FEHLT,
      grund: `Bestätigt wird genau die ausgegebene Datei: Bitte zuerst die Lohnausgabe für ${monatText(monat)} erzeugen und dann bestätigen.` };
  const ex = exportZeilenFuer(m, monat);          // Revision 1: alle Zeilen; ab Revision 2 die Differenz (Korrekturexport, WP-16c)
  const zeilen = ex.zeilen;
  const zeilenAbdruck = datevZeilenAbdruck(zeilen);
  if (x.abdruck !== alt.abdruck || String(x.stand) !== String(alt.stand) || Number(x.revision ?? 1) !== revision || x.zeilen !== zeilenAbdruck)
    return { status: 409, code: EXPORTSTAND_ABWEICHEND,
      grund: `Die ausgegebene Datei gehört nicht zum heutigen Abschluss von ${monatText(monat)} (Prüfsumme, Abschluss, Revision oder Zeilen weichen ab). Nichts bestätigt — bitte die Lohnausgabe neu erzeugen und prüfen.` };
  /* Vormonate (WP-16, Nachtrag vierter Review A-1/A-2): Das Konto im Freeze rechnet mit den Vormonaten des Jahres, wie
     sie beim Abschluss waren. Ist einer offen (oder war es beim Abschluss) oder seitdem wiederöffnet und neu
     abgeschlossen, ist die Mehrarbeit vorläufig oder veraltet — bestätigt wird dann nur ausdrücklich: trotzVormonat
     (genau true), eine Kategorie aus VORMONAT_KATEGORIEN und eine Begründung (Länge wie beim Wiederöffnen). Die
     Begründung steht im Verlauf am Monat (nur Leitung und Planung), die Spur nennt nur die Kategorie. */
  const h = datevHinweise(m, monat);
  const vormonate = { offen: h ? h.vormonateOffen : [], geaendert: h ? h.vormonatGeaendert : [] };
  let trotzVormonat = null, vormonatGrund = "";
  if (vormonate.offen.length || vormonate.geaendert.length) {
    const liste = (xs) => xs.map(monatText).join(", ");
    if (x.trotzVormonat !== true)
      return { status: 409, code: vormonate.geaendert.length ? VORMONAT_GEAENDERT : VORMONAT_OFFEN, vormonate,
        grund: (vormonate.geaendert.length
          ? `Seit dem Abschluss von ${monatText(monat)} wurde ein Vormonat wiederöffnet und neu abgeschlossen (${liste(vormonate.geaendert)}) — das Konto (Mehrarbeit) dieses Monats ist veraltet.`
          : `Vormonat offen (${liste(vormonate.offen)}) — das Konto (Mehrarbeit) von ${monatText(monat)} ist vorläufig.`)
          + " Bestätigen nur ausdrücklich, mit Kategorie und Begründung." };
    const kategorie = typeof x.vormonatKategorie === "string" ? x.vormonatKategorie : "";
    vormonatGrund = typeof x.vormonatGrund === "string" ? x.vormonatGrund.trim() : "";
    if (!Object.prototype.hasOwnProperty.call(VORMONAT_KATEGORIEN, kategorie))
      return { status: 422, grund: `Bitte eine Kategorie wählen (${Object.keys(VORMONAT_KATEGORIEN).join(", ")}).` };
    if (vormonatGrund.length < WIEDEROEFFNEN_GRUND_MIN || vormonatGrund.length > ABSCHLUSS_GRUND_MAX)
      return { status: 422, grund: `Die Begründung braucht ${WIEDEROEFFNEN_GRUND_MIN}–${ABSCHLUSS_GRUND_MAX} Zeichen.` };
    trotzVormonat = { kategorie, offen: vormonate.offen, geaendert: vormonate.geaendert };
  }
  const ereignis = { id, art: "lohnexport", am: jetzt.toISOString(), wer: werForm(wer), abdruck, revision, stand: alt.stand,
    zeilen: zeilenAbdruck, n: zeilen.length, ...(ex.korrekturZu !== null ? { korrekturZu: ex.korrekturZu } : {}),
    ...(trotzVormonat ? { grund: vormonatGrund, trotzVormonat } : {}) };
  const eintrag = { ...alt, revision, lohnexport: { am: ereignis.am, wer: ereignis.wer, abdruck, revision, stand: alt.stand,
    zeilen: zeilenAbdruck, n: zeilen.length, ...(ex.korrekturZu !== null ? { korrekturZu: ex.korrekturZu } : {}),
    ...(trotzVormonat ? { trotzVormonat } : {}) }, verlauf: [...verlauf, ereignis] };
  return { ereignis, eintrag, mandant: { ...m, [ABSCHLUSS_FELD]: { ...m[ABSCHLUSS_FELD], [monat]: eintrag } } };
}

/* --------------------------------------------------------------------------
   Korrekturrevisionen nach bestätigtem Lohnexport (WP-16c)
   -------------------------------------------------------------------------- */
const rund2 = (x) => Math.round(x * 100) / 100;

/** Die Lohnzeilen einer Revision kompakt ablegen: [Personalnummer, Lohnart, Stunden]; Bezeichnungen je Lohnart. */
function zeilenKompakt(zeilen) {
  const bez = {};
  const z = (Array.isArray(zeilen) ? zeilen : []).map((x) => {
    bez[String(x.lohnart)] = String(x.bezeichnung ?? "");
    return [String(x.personalnummer), String(x.lohnart), Number(x.stunden)];
  });
  return { zeilen: z, bez };
}

/**
 * Differenz der Lohnzeilen: neu − abgelegte Revision, je Personalnummer und Lohnart. Nur Abweichungen ab 0,01 h; die
 * Zeilen sind als Korrektur gekennzeichnet („Korrektur R2 zu R1: …“) — ein Korrekturexport, kein zweiter Vollexport.
 * @param {{revision: number, zeilen?: any[], bez?: object}} basis  die abgelegte Revision
 * @param {any[]} neu  die Lohnzeilen der neuen Revision (datevAusFreeze)
 */
function zeilenDifferenz(basis, neu, m, mon, revision) {
  /** @type {Map<string, any>} */
  const k = new Map();
  const schluessel = (p, l) => `${p}\u0001${l}`;
  const bez = objekt(basis.bez) ? basis.bez : {};
  for (const z of Array.isArray(basis.zeilen) ? basis.zeilen : []) {
    if (!Array.isArray(z)) continue;
    const key = schluessel(z[0], z[1]);
    const e = k.get(key) || { pnr: z[0], la: z[1], alt: 0, neu: 0, bez: bez[z[1]] ?? "", nach: null, vor: null };
    e.alt += Number(z[2]) || 0;
    k.set(key, e);
  }
  for (const z of Array.isArray(neu) ? neu : []) {
    const key = schluessel(String(z.personalnummer), String(z.lohnart));
    const e = k.get(key) || { pnr: String(z.personalnummer), la: String(z.lohnart), alt: 0, neu: 0, bez: z.bezeichnung ?? "", nach: null, vor: null };
    e.neu += Number(z.stunden) || 0;
    e.bez = z.bezeichnung ?? e.bez;
    e.nach = z.nachname ?? null;
    e.vor = z.vorname ?? null;
    k.set(key, e);
  }
  const stamm = new Map((Array.isArray(m && m.personen) ? m.personen : []).map((p) => [String(p && (p.personalnummer || p.id)), p]));
  const aus = [];
  for (const e of k.values()) {
    const d = rund2(e.neu - e.alt);
    if (Math.abs(d) < 0.01) continue;
    const p = stamm.get(String(e.pnr));
    aus.push({ personalnummer: e.pnr, nachname: e.nach ?? (p ? p.nachname ?? null : null), vorname: e.vor ?? (p ? p.vorname ?? null : null),
      lohnart: e.la, bezeichnung: `Korrektur R${revision} zu R${basis.revision}: ${e.bez}`, stunden: d, monat: mon });
  }
  return aus.sort(datevReihenfolge);
}

/**
 * Die Zeilen, die für den Monat ausgegeben werden: Revision 1 die vollen Lohnzeilen aus dem Freeze; ab Revision 2 nur
 * die Differenz zur zuletzt exportierten Revision (Korrekturexport). Server (Bestätigen) und Oberfläche (Datei) rechnen
 * mit dieser einen Funktion.
 * @returns {{zeilen: any[], revision: number, korrekturZu: number|null}}
 */
export function exportZeilenFuer(m, mon) {
  const e = abschlussEintrag(m, mon);
  const voll = datevAusFreeze(m, mon) || [];
  const revision = e && Number.isInteger(e.revision) ? e.revision : 1;
  const basis = e && Array.isArray(e.revisionen) && e.revisionen.length ? e.revisionen[e.revisionen.length - 1] : null;
  if (!basis || revision <= 1 || !Number.isInteger(basis.revision)) return { zeilen: voll, revision, korrekturZu: null };
  return { zeilen: zeilenDifferenz(basis, voll, m, mon, revision), revision, korrekturZu: basis.revision };
}

/** Kurzfassung der Differenz für Antworten und Verlauf — Zahlen und Prüfsumme, keine Personen. */
const differenzKurz = (zeilen) => ({ abdruck: datevZeilenAbdruck(zeilen), n: zeilen.length,
  summe: rund2(zeilen.reduce((a, z) => a + (Number(z.stunden) || 0), 0)) });

/**
 * Eine Korrekturrevision beginnen (nur nach bestätigtem Lohnexport; sonst genügt das einfache Wiederöffnen).
 * Legt die exportierte Revision unverändert ab, verwirft das Freeze (wie beim Wiederöffnen) und öffnet den Monat für
 * Korrekturen. Es gibt keine Frist: maßgeblich ist der Exportstatus.
 * @param {any} m
 * @param {{monat?: string, grund?: string, anlass?: string, basisAbweichung?: boolean}} r
 * @returns {{status: number, grund: string, code?: string} | {mandant: object, eintrag: object, ereignis: object}}
 */
export function korrekturBeginnen(m, r, wer, jetzt, id) {
  const monat = r && r.monat;
  if (!MONAT.test(String(monat ?? ""))) return { status: 422, grund: "Kein gültiger Monat (JJJJ-MM)." };
  const grund = typeof (r && r.grund) === "string" ? r.grund.trim() : "";
  if (grund.length < WIEDEROEFFNEN_GRUND_MIN || grund.length > ABSCHLUSS_GRUND_MAX)
    return { status: 422, grund: `Eine Korrektur braucht einen Grund (${WIEDEROEFFNEN_GRUND_MIN}–${ABSCHLUSS_GRUND_MAX} Zeichen).` };
  const anlass = typeof (r && r.anlass) === "string" ? r.anlass : "";
  if (!Object.prototype.hasOwnProperty.call(KORREKTUR_ANLAESSE, anlass))
    return { status: 422, grund: `Bitte einen Anlass wählen (${Object.keys(KORREKTUR_ANLAESSE).join(", ")}).` };
  const alt = abschlussEintrag(m, monat);
  if (!alt || alt.abgeschlossen !== true)
    return { status: 409, grund: alt && objekt(alt.korrektur) && alt.korrektur.offen === true
      ? `Für ${monatText(monat)} läuft schon eine Korrekturrevision.` : `Der Monat ${monatText(monat)} ist nicht abgeschlossen.` };
  if (!objekt(alt.lohnexport))
    return { status: 409, code: "KORREKTUR_NICHT_NOETIG",
      grund: `Der Lohnexport für ${monatText(monat)} ist noch nicht bestätigt — der Monat lässt sich einfach wiederöffnen.` };
  const revisionen = Array.isArray(alt.revisionen) ? alt.revisionen : [];
  const verlauf = Array.isArray(alt.verlauf) ? alt.verlauf : [];
  if (revisionen.length >= REVISIONEN_MAX || verlauf.length >= ABSCHLUSS_VERLAUF_MAX)
    return { status: 409, grund: "Dieser Monat wurde so oft korrigiert, dass der Server keinen weiteren Schritt annimmt. Bitte mit der Betriebsleitung klären." };
  const revision = Number.isInteger(alt.revision) ? alt.revision : 1;
  /* Die exportierte Revision muss reproduzierbar sein und mit dem Abdruck des Abschlusses übereinstimmen. */
  const st = freezeStatus(m, monat);
  if (!st || st.unbekannt || !st.reproduzierbar)
    return { status: 409, code: KORREKTUR_BASIS_FEHLT,
      grund: `Der exportierte Stand von ${monatText(monat)} lässt sich nicht mehr rekonstruieren (eingefrorenes Ist gelöscht oder in einem älteren Format). Eine Korrektur ist hier nicht automatisch möglich — bitte mit dem Betreiber klären.` };
  if (istAbdruck(m, monat) !== alt.abdruck)
    return { status: 409, code: "ABDRUCK_ABWEICHEND",
      grund: `Die Ist-Daten für ${monatText(monat)} weichen von der Prüfsumme des Abschlusses ab. Eine Korrektur lässt sich so nicht beginnen.` };
  const vergleich = lohnexportVergleich(m, monat);
  const basisAbweicht = !vergleich || vergleich.status !== "gleich";
  if (basisAbweicht && !(r && r.basisAbweichung === true))
    return { status: 409, code: KORREKTUR_BASIS_ABWEICHEND,
      grund: `Die heute erzeugten Lohnzeilen für ${monatText(monat)} weichen von den bestätigten ab (zum Beispiel nach einer Anonymisierung). Die Differenz zum bestätigten Export ist dann nicht verlässlich — nur ausdrücklich (basisAbweichung) fortfahren.` };
  const ex = exportZeilenFuer(m, monat);
  const voll = datevAusFreeze(m, monat) || [];
  const snap = { revision, stand: alt.stand ?? null, abdruck: alt.abdruck, am: alt.am ?? null, wer: alt.wer ?? null,
    lohnexport: alt.lohnexport, schema: alt.schema ?? null, ...zeilenKompakt(voll), zeilenN: voll.length,
    ...(ex.korrekturZu !== null ? { korrekturZu: ex.korrekturZu } : {}) };
  /* istNeu: so viele Personentage rechnen nach dem Verwerfen des Freeze anders (Plan, Vertrags-/Tarifparameter seit
     dem Abschluss geändert) — ohne Personen; die Differenz der Lohnzeilen zeigt es beim Abschluss. */
  const istNeu = istAbweichungen(m, monat);
  const ereignis = { id, art: "korrektur-beginn", am: jetzt.toISOString(), wer: werForm(wer), grund, anlass, revision: revision + 1,
    vonRevision: revision, abdruck: alt.abdruck, istNeu, ...(basisAbweicht ? { basisAbweichung: true } : {}) };
  const { abdruck: _a, stand: _s, lohnexport: _l, ...rest } = alt;
  void _a; void _s; void _l;
  const eintrag = { ...rest, abgeschlossen: false, am: ereignis.am, wer: ereignis.wer, revision: revision + 1,
    revisionen: [...revisionen, snap],
    korrektur: { offen: true, id, am: ereignis.am, wer: ereignis.wer, anlass, vonRevision: revision, freigabe: null },
    verlauf: [...verlauf, ereignis] };
  return { ereignis, eintrag, mandant: { ...m, [IST_EINGEFROREN]: ohneMonat(m[IST_EINGEFROREN], monat),
    [ABSCHLUSS_FELD]: { ...m[ABSCHLUSS_FELD], [monat]: eintrag } } };
}

/**
 * Die Differenz einer offenen Korrekturrevision freigeben (zweite Person). Gebunden an die heutige Differenz und den
 * heutigen Ist-Stand: Ohne `differenz` im Rumpf kommt 409 KORREKTUR_DIFFERENZ_FEHLT mit der Vorschau (die Person sieht,
 * was sie freigibt); jede weitere Änderung macht die Freigabe ungültig.
 * Fail-closed: Wer beginnt, gibt nicht frei; ohne Personenkennung keine Freigabe.
 * @param {string} heute "JJJJ-MM-TT" (Berlin)
 */
export function korrekturFreigeben(m, r, wer, jetzt, id, heute) {
  const monat = r && r.monat;
  if (!MONAT.test(String(monat ?? ""))) return { status: 422, grund: "Kein gültiger Monat (JJJJ-MM)." };
  const alt = abschlussEintrag(m, monat);
  const kor = alt && objekt(alt.korrektur) && alt.korrektur.offen === true ? alt.korrektur : null;
  if (!alt || alt.abgeschlossen === true || !kor)
    return { status: 409, grund: `Für ${monatText(monat)} läuft keine offene Korrekturrevision.` };
  const ich = wer && wer.personId !== undefined && wer.personId !== null ? String(wer.personId) : null;
  const beginn = kor.wer && kor.wer.personId !== undefined && kor.wer.personId !== null ? String(kor.wer.personId) : null;
  if (ich === null || (beginn !== null && ich === beginn))
    return { status: 403, code: "KORREKTUR_ZWEITE_PERSON",
      grund: "Die Freigabe gibt eine zweite Person — nicht die, die die Korrektur begonnen hat." };
  const verlauf = Array.isArray(alt.verlauf) ? alt.verlauf : [];
  if (verlauf.length >= ABSCHLUSS_VERLAUF_MAX)
    return { status: 409, grund: "Dieser Monat wurde so oft geändert, dass der Server keinen weiteren Schritt annimmt. Bitte mit der Betriebsleitung klären." };
  /* Vorschau: genau so, wie der Abschluss rechnen würde (ohne Freigabeprüfung). */
  const vor = abschliessen(m, { monat, trotzPrueffaellen: true, vorschau: true }, wer, jetzt, id, heute);
  if ("status" in vor) return vor;
  const differenz = vor.differenz;
  if (!differenz || differenz.n === 0)
    return { status: 409, code: "KORREKTUR_KEINE_DIFFERENZ", grund: "Die Korrektur ändert keine Lohnzeile — eine Freigabe ist nicht nötig." };
  if (typeof (r && r.differenz) !== "string")
    return { status: 409, code: KORREKTUR_DIFFERENZ_FEHLT, differenz,
      grund: "Bitte die Differenz prüfen und mit ihrer Prüfsumme freigeben (differenz)." };
  if (r.differenz !== differenz.abdruck)
    return { status: 409, code: KORREKTUR_DIFFERENZ_FEHLT, differenz,
      grund: "Die Differenz hat sich seit der Ansicht geändert — bitte neu prüfen." };
  const freigabe = { id, am: jetzt.toISOString(), wer: werForm(wer), differenz: differenz.abdruck, abdruck: vor.eintrag.abdruck, n: differenz.n };
  const ereignis = { id, art: "korrektur-freigabe", am: freigabe.am, wer: freigabe.wer, differenz: differenz.abdruck, n: differenz.n,
    revision: alt.revision };
  const eintrag = { ...alt, korrektur: { ...kor, freigabe }, verlauf: [...verlauf, ereignis] };
  return { ereignis, eintrag, differenz, mandant: { ...m, [ABSCHLUSS_FELD]: { ...m[ABSCHLUSS_FELD], [monat]: eintrag } } };
}

/** Die letzte Wiederöffnung eines (jetzt offenen) Monats — für den Vermerk an Korrekturen. */
export function letzteWiederoeffnung(m, datum) {
  const mon = monatVon(datum);
  const e = mon ? abschlussEintrag(m, mon) : null;
  if (!e || e.abgeschlossen === true || !Array.isArray(e.verlauf)) return null;
  const w = [...e.verlauf].reverse().find((x) => objekt(x) && (x.art === "wiederoeffnung" || x.art === "korrektur-beginn"));
  return w ? String(w.id) : null;
}

/**
 * Einen Stempel, der in einen abgeschlossenen Monat fiel und abgewiesen
 * wurde, am Abschluss vermerken — für die Leitung sichtbar (Prüfung statt
 * Verlust). Dieselbe Ereigniskennung wird nur einmal vermerkt. Der Vermerk
 * ändert keine Ist-Daten (Prüfsumme unverändert).
 *
 * Gegen Fluten (Review M3): Je Person, Tag und Art ein Eintrag (weitere
 * zählen `anzahl` hoch), je Person höchstens ABGEWIESEN_JE_PERSON Einträge;
 * darüber nur ein Zähler je Person (`abgewiesenGezaehlt`). Zähler bleiben an
 * ihrer Obergrenze stehen — dann kein Schreibvorgang mehr. So verdrängt
 * niemand die Einträge anderer, und erfundene Ereignisse kosten höchstens
 * begrenzt viele Schreibvorgänge. Offline-Zeiten, die älter als 48 Stunden
 * ankommen, stehen gekennzeichnet (`alt`) in derselben Liste unter derselben
 * Obergrenze — nicht nur gezählt: Das ist genau der Fall, für den der Vermerk
 * da ist (Gerät tagelang offline, Monat inzwischen abgeschlossen; die Leitung
 * braucht Person, Tag und Zeit, um über das Wiederöffnen zu entscheiden).
 */
export function abgewiesenVermerken(m, monat, v) {
  const e = abschlussEintrag(m, monat);
  if (!e) return m;
  const liste = Array.isArray(e.abgewiesen) ? e.abgewiesen : [];
  if (v.ereignis && liste.some((x) => objekt(x) && x.ereignis === v.ereignis)) return m;
  const pid = String(v.personId);
  const setze = (neuE) => ({ ...m, [ABSCHLUSS_FELD]: { ...m[ABSCHLUSS_FELD], [monat]: neuE } });
  const zaehlen = () => {
    const z = objekt(e.abgewiesenGezaehlt) ? e.abgewiesenGezaehlt : {};
    const n = Number(z[pid]) || 0;
    if (n >= ABGEWIESEN_GEZAEHLT_MAX) return m;
    return setze({ ...e, abgewiesenGezaehlt: { ...z, [pid]: n + 1 } });
  };
  const alt = !!v.offline && Date.parse(v.am) - Date.parse(v.zeitAm) > ABGEWIESEN_ALT_MS;
  const i = liste.findIndex((x) => objekt(x) && String(x.personId) === pid && x.datum === v.datum && x.art === v.art);
  if (i >= 0) {
    const n = Number(liste[i].anzahl) || 1;
    if (n >= ABGEWIESEN_ANZAHL_MAX) return m;
    return setze({ ...e, abgewiesen: liste.map((x, j) => (j === i ? { ...x, anzahl: n + 1, zuletzt: v.am } : x)) });
  }
  if (liste.filter((x) => objekt(x) && String(x.personId) === pid).length >= ABGEWIESEN_JE_PERSON) return zaehlen();
  /* Obergrenze je Betrieb und Monat (WP-16, Nachtrag N1): Ist die Liste voll, wird gezählt („weitere" je
     Person) — vorher schob slice(-ABGEWIESEN_MAX) still die ältesten Einträge anderer Personen hinaus. */
  if (liste.length >= ABGEWIESEN_MAX) return zaehlen();
  const neu = { personId: v.personId, datum: v.datum, art: v.art, zeit: v.zeit || null, zeitAm: v.zeitAm || null,
    offline: !!v.offline, ...(alt ? { alt: true } : {}), ereignis: v.ereignis || null, am: v.am };
  return setze({ ...e, abgewiesen: [...liste, neu] });
}

/* --------------------------------------------------------------------------
   Speichern (PUT /api/bestand) und Wiederherstellen
   -------------------------------------------------------------------------- */

/**
 * Beim Speichern gilt immer der gespeicherte Abschlussstand samt
 * eingefrorenem Ist — mitgeschickt ist beides wirkungslos. Einzige Folge der
 * Übermittlung: Wird eine Person anonymisiert oder entfernt, gehen ihre
 * abgewiesenen Stempel am Abschluss mit (Review M2).
 */
export function abschlussAusGespeichert(altM, neuM) {
  if (!objekt(neuM)) return neuM;
  const aus = { ...neuM };
  for (const feld of [ABSCHLUSS_FELD, IST_EINGEFROREN]) {
    if (altM && Object.prototype.hasOwnProperty.call(altM, feld)) aus[feld] = altM[feld];
    else delete aus[feld];
  }
  if (Object.prototype.hasOwnProperty.call(aus, ABSCHLUSS_FELD) && Array.isArray(neuM.personen))
    aus[ABSCHLUSS_FELD] = abschlussPersonenRaeumen(aus[ABSCHLUSS_FELD], { personen: neuM.personen }).wert;
  return aus;
}

/**
 * Widerspricht die Übermittlung einem abgeschlossenen Monat? Geprüft für
 * Rollen mit Vollsicht (sie sehen und schreiben alle Ist-Daten). In Monaten,
 * deren Stand die Übermittlung nicht kennt (veraltete Kopie), entscheidet
 * der Drei-Wege-Abgleich beim Schreiben — wie bei WP-06.
 * @param {any} altM gespeicherter Betrieb
 * @param {any} gesendetM übermittelter Betrieb
 * @param {{vollSicht?: boolean, unveraendert?: Set<string>|null, loeschlauf?: boolean, heute?: string}} o
 * @returns {null | {schluessel: string, monat: string, grund: string}}
 */
export function abschlussWiderspruch(altM, gesendetM, o = {}) {
  if (!objekt(altM) || !objekt(gesendetM) || !o.vollSicht) return null;
  const monate = abgeschlosseneMonate(altM);
  if (!monate.length) return null;
  const stich = o.loeschlauf ? loeschStichtag(altM, o.heute) : null;
  /* Linear (WP-16, Nachtrag M-neu-1): Jeder Schlüssel wird einmal seinem Monat zugeordnet — vorher lief
     je abgeschlossenem Monat und Feld eine Schleife über alle Schlüssel aller Monate (400 Personen,
     12 Monate: 7,1 s je PUT unter der Raumsperre). Ergebnis wie vorher: der früheste Monat, darin das
     erste Feld in IST_FELDER-Reihenfolge, darin der erste abweichende Schlüssel. */
  const pruefen = new Set(monate.filter((monat) => !(o.unveraendert && !o.unveraendert.has(`${altM.id}::${monat}`))));
  if (!pruefen.size) return null;
  /** @type {Map<string, {k: string, feld: string}>} */
  const erster = new Map();
  /* Der Monat je Schlüssel: Tage wiederholen sich über die Personen — einmal je Tagesteil bestimmt. */
  const monatJeTeil = new Map();
  const monatDes = (k) => {
    const s = String(k); const i = s.indexOf("|");
    const teil = i < 0 ? "" : s.slice(i + 1, s.indexOf("|", i + 1) < 0 ? undefined : s.indexOf("|", i + 1));
    let mon = monatJeTeil.get(teil);
    if (mon === undefined) { mon = monatVon(teil); monatJeTeil.set(teil, mon); }
    return mon;
  };
  for (const feld of IST_FELDER) {
    if (!Object.prototype.hasOwnProperty.call(gesendetM, feld)) continue;        // nicht mitgeschickt: unverändert
    const a = objekt(altM[feld]) ? altM[feld] : {};
    const n = objekt(gesendetM[feld]) ? gesendetM[feld] : {};
    const sieh = (k) => {
      const monat = monatDes(k);
      if (!monat || !pruefen.has(monat) || erster.has(monat) || gleichWert(a[k], n[k])) return;
      const tag = String(k).split("|")[1];
      if (n[k] === undefined && stich && tag < stich) return;                    // Löschlauf nach Fristablauf
      erster.set(monat, { k, feld });
    };
    for (const k of Object.keys(a)) sieh(k);
    for (const k of Object.keys(n)) if (!Object.prototype.hasOwnProperty.call(a, k)) sieh(k);
  }
  for (const monat of monate) {
    const f = erster.get(monat);
    if (!f) continue;
    return { schluessel: f.k, monat,
      grund: `Der Monat ${monatText(monat)} ist abgeschlossen — ${f.feld === "erfassung" ? "Ist-Zeiten" : f.feld === IST_EINGEFROREN ? "das eingefrorene Ist" : "Stempel"} dieses Monats ändern sich erst nach dem Wiederöffnen durch die Leitung. Es wurde nichts gespeichert.` };
  }
  return null;
}

/**
 * Wiederherstellen aus einer Sicherung: Der Abschlussstand bleibt der
 * heutige, und in heute abgeschlossenen Monaten bleiben Stempel und
 * Ist-Zeiten, wie sie heute sind (kein Zurückdrehen, kein Wiederkehren) —
 * ebenso das eingefrorene Ist (heutiger Stand, nie das der Sicherung).
 * @returns {{mandant: object, monate: number}}
 */
export function abschlussBeiWiederherstellung(jetztM, zurueckM) {
  const aus = abschlussAusGespeichert(jetztM, zurueckM);
  const monate = abgeschlosseneMonate(jetztM);
  for (const feld of IST_FELDER) {
    const j = objekt(jetztM && jetztM[feld]) ? jetztM[feld] : {};
    const z = { ...(objekt(aus[feld]) ? aus[feld] : {}) };
    for (const k of new Set([...Object.keys(j), ...Object.keys(z)])) {
      if (!monate.includes(/** @type {string} */ (monatDesSchluessels(k)))) continue;
      if (k in j) z[k] = j[k]; else delete z[k];
    }
    aus[feld] = z;
  }
  return { mandant: aus, monate: monate.length };
}

/* --------------------------------------------------------------------------
   Sicht (sicht.mjs): Beschäftigte, Betriebsrat, Schichtverantwortung
   -------------------------------------------------------------------------- */
/** Nur, welche Monate abgeschlossen sind — kein Wer, Wann, Grund, Verlauf, keine abgewiesenen Stempel. */
export function abschlussStatus(w) {
  if (!objekt(w)) return {};
  return Object.fromEntries(Object.entries(w)
    .filter(([mon, e]) => MONAT.test(mon) && objekt(e) && e.abgeschlossen === true)
    .map(([mon, e]) => [mon, { abgeschlossen: true, ...(objekt(e.lohnexport) ? { lohnexportiert: true } : {}) }]));
}

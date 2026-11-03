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
   abgewiesen?: [{ personId, datum, art, zeitAm, offline, ereignis, am }] }.
   `abdruck` ist eine Prüfsumme der Ist-Daten des Monats zum Abschluss.
   ========================================================================== */

import { loeschStichtag } from "./stempelintegritaet.mjs";

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
export const WIEDEROEFFNEN_GRUND_MIN = 10;
export const ABSCHLUSS_GRUND_MAX = 500;
export const ABSCHLUSS_VERLAUF_MAX = 200;
export const ABGEWIESEN_MAX = 200;
/** Die Sammlungen, die der Abschluss sperrt (Ist-Zeiten und Stempel samt Korrekturen und Anträgen). */
export const IST_FELDER = Object.freeze(["einstempeln", "erfassung"]);

const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
 * @returns {null | {status: number, code: string, monat: string, grund: string}}
 */
export function abschlussSperre(m, datum) {
  if (!monatAbgeschlossen(m, datum)) return null;
  const monat = /** @type {string} */ (monatVon(datum));
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
/** Die Ist-Daten (Stempel und Erfassung) eines Monats, Schlüssel geordnet. */
export function istDesMonats(m, monat) {
  const aus = {};
  for (const feld of IST_FELDER) {
    const w = m && objekt(m[feld]) ? m[feld] : {};
    aus[feld] = geordnet(Object.fromEntries(Object.entries(w).filter(([k]) => monatDesSchluessels(k) === monat)));
  }
  return aus;
}
/** Prüfsumme der Ist-Daten eines Monats (32 Hex-Zeichen, SHA-256). */
export function istAbdruck(m, monat) {
  return sha256Hex(JSON.stringify(istDesMonats(m, monat))).slice(0, 32);
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
    if (monatDesSchluessels(k) !== monat || !objekt(e)) continue;
    antraege += (Array.isArray(e.antraege) ? e.antraege : []).filter((a) => objekt(a) && a.status === "offen").length;
    const ist = erf[k];
    const marken = Array.isArray(e.markierungen) ? e.markierungen : [];
    const fall = !e.start || !e.ende || marken.includes("KONFLIKT") || marken.includes("START_VERALTET") || marken.includes("START_FEHLT");
    if (fall && !(objekt(ist) && ist.bestaetigt === true && ist.korrigiert === true)) offeneStempel++;
  }
  for (const [k, e] of Object.entries(erf)) {
    if (monatDesSchluessels(k) !== monat || !objekt(e)) continue;
    if (e.bestaetigt !== true) zurPruefung++;
  }
  return { antraege, offeneStempel, zurPruefung };
}

/* --------------------------------------------------------------------------
   Abschließen und wiederöffnen
   -------------------------------------------------------------------------- */
const werForm = (w) => ({ personId: w && w.personId !== undefined ? w.personId : null,
  name: (w && w.name) || null, rolle: (w && w.rolle) || null });

/**
 * Einen vergangenen Monat abschließen.
 * @param {any} m gespeicherter Betrieb
 * @param {{monat?: string, grund?: string, trotzPrueffaellen?: boolean}} r
 * @param {{personId: any, name?: string|null, rolle?: string|null}} wer
 * @param {Date} jetzt
 * @param {string} id Kennung des Verlaufseintrags
 * @param {string} heute "JJJJ-MM-TT" (Berlin)
 * @returns {{status: number, grund: string, code?: string, offen?: object} | {mandant: object, eintrag: object, ereignis: object}}
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
  if ((offen.offeneStempel || offen.zurPruefung) && !(r && r.trotzPrueffaellen === true))
    return { status: 409, code: "ABSCHLUSS_PRUEFFAELLE", offen,
      grund: `Im ${monatText(monat)} sind noch ${offen.offeneStempel} unvollständige Stempel und ${offen.zurPruefung} Ist-Zeiten zur Prüfung offen. Trotzdem abschließen?` };
  const abdruck = istAbdruck(m, monat);
  /** @type {any} */
  const ereignis = { id, art: "abschluss", am: jetzt.toISOString(), wer: werForm(wer), grund, abdruck,
    ...(offen.offeneStempel || offen.zurPruefung ? { offen: { offeneStempel: offen.offeneStempel, zurPruefung: offen.zurPruefung } } : {}) };
  const eintrag = { ...(alt || {}), abgeschlossen: true, am: ereignis.am, wer: ereignis.wer, abdruck, verlauf: [...verlauf, ereignis] };
  return { ereignis, eintrag, mandant: { ...m, [ABSCHLUSS_FELD]: { ...(objekt(m[ABSCHLUSS_FELD]) ? m[ABSCHLUSS_FELD] : {}), [monat]: eintrag } } };
}

/**
 * Einen abgeschlossenen Monat wiederöffnen — mit Grund. Der Verlauf hält
 * fest, ob die Ist-Daten seit dem Abschluss unverändert sind
 * (`abdruckGleich`).
 * @returns {{status: number, grund: string} | {mandant: object, eintrag: object, ereignis: object}}
 */
export function wiederoeffnen(m, r, wer, jetzt, id) {
  const monat = r && r.monat;
  if (!MONAT.test(String(monat ?? ""))) return { status: 422, grund: "Kein gültiger Monat (JJJJ-MM)." };
  const grund = typeof (r && r.grund) === "string" ? r.grund.trim() : "";
  if (grund.length < WIEDEROEFFNEN_GRUND_MIN || grund.length > ABSCHLUSS_GRUND_MAX)
    return { status: 422, grund: `Wiederöffnen braucht einen Grund (${WIEDEROEFFNEN_GRUND_MIN}–${ABSCHLUSS_GRUND_MAX} Zeichen).` };
  const alt = abschlussEintrag(m, monat);
  if (!alt || alt.abgeschlossen !== true) return { status: 409, grund: `Der Monat ${monatText(monat)} ist nicht abgeschlossen.` };
  const verlauf = Array.isArray(alt.verlauf) ? alt.verlauf : [];
  if (verlauf.length >= ABSCHLUSS_VERLAUF_MAX)
    return { status: 409, grund: "Dieser Monat wurde so oft abgeschlossen und wiedergeöffnet, dass der Server keinen weiteren Schritt annimmt. Bitte mit der Betriebsleitung klären." };
  const abdruck = istAbdruck(m, monat);
  const ereignis = { id, art: "wiederoeffnung", am: jetzt.toISOString(), wer: werForm(wer), grund, abdruck,
    abdruckGleich: abdruck === alt.abdruck };
  const { abdruck: _weg, ...rest } = alt;
  void _weg;
  const eintrag = { ...rest, abgeschlossen: false, am: ereignis.am, wer: ereignis.wer, verlauf: [...verlauf, ereignis] };
  return { ereignis, eintrag, mandant: { ...m, [ABSCHLUSS_FELD]: { ...m[ABSCHLUSS_FELD], [monat]: eintrag } } };
}

/** Die letzte Wiederöffnung eines (jetzt offenen) Monats — für den Vermerk an Korrekturen. */
export function letzteWiederoeffnung(m, datum) {
  const mon = monatVon(datum);
  const e = mon ? abschlussEintrag(m, mon) : null;
  if (!e || e.abgeschlossen === true || !Array.isArray(e.verlauf)) return null;
  const w = [...e.verlauf].reverse().find((x) => objekt(x) && x.art === "wiederoeffnung");
  return w ? String(w.id) : null;
}

/**
 * Einen Stempel, der in einen abgeschlossenen Monat fiel und abgewiesen
 * wurde, am Abschluss vermerken — für die Leitung sichtbar (Prüfung statt
 * Verlust). Dieselbe Ereigniskennung wird nur einmal vermerkt. Der Vermerk
 * ändert keine Ist-Daten (Prüfsumme unverändert).
 */
export function abgewiesenVermerken(m, monat, v) {
  const e = abschlussEintrag(m, monat);
  if (!e) return m;
  const liste = Array.isArray(e.abgewiesen) ? e.abgewiesen : [];
  if (v.ereignis && liste.some((x) => objekt(x) && x.ereignis === v.ereignis)) return m;
  const neu = { personId: v.personId, datum: v.datum, art: v.art, zeit: v.zeit || null, zeitAm: v.zeitAm || null,
    offline: !!v.offline, ereignis: v.ereignis || null, am: v.am };
  return { ...m, [ABSCHLUSS_FELD]: { ...m[ABSCHLUSS_FELD], [monat]: { ...e, abgewiesen: [...liste, neu].slice(-ABGEWIESEN_MAX) } } };
}

/* --------------------------------------------------------------------------
   Speichern (PUT /api/bestand) und Wiederherstellen
   -------------------------------------------------------------------------- */

/** Beim Speichern gilt immer der gespeicherte Abschlussstand — mitgeschickt ist er wirkungslos. */
export function abschlussAusGespeichert(altM, neuM) {
  if (!objekt(neuM)) return neuM;
  const aus = { ...neuM };
  if (altM && Object.prototype.hasOwnProperty.call(altM, ABSCHLUSS_FELD)) aus[ABSCHLUSS_FELD] = altM[ABSCHLUSS_FELD];
  else delete aus[ABSCHLUSS_FELD];
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
  for (const monat of monate) {
    if (o.unveraendert && !o.unveraendert.has(`${altM.id}::${monat}`)) continue;
    for (const feld of IST_FELDER) {
      if (!Object.prototype.hasOwnProperty.call(gesendetM, feld)) continue;      // nicht mitgeschickt: unverändert
      const a = objekt(altM[feld]) ? altM[feld] : {};
      const n = objekt(gesendetM[feld]) ? gesendetM[feld] : {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(n)])) {
        if (monatDesSchluessels(k) !== monat || gleich(a[k], n[k])) continue;
        const tag = String(k).split("|")[1];
        if (n[k] === undefined && stich && tag < stich) continue;               // Löschlauf nach Fristablauf
        return { schluessel: k, monat,
          grund: `Der Monat ${monatText(monat)} ist abgeschlossen — ${feld === "erfassung" ? "Ist-Zeiten" : "Stempel"} dieses Monats ändern sich erst nach dem Wiederöffnen durch die Leitung. Es wurde nichts gespeichert.` };
      }
    }
  }
  return null;
}

/**
 * Wiederherstellen aus einer Sicherung: Der Abschlussstand bleibt der
 * heutige, und in heute abgeschlossenen Monaten bleiben Stempel und
 * Ist-Zeiten, wie sie heute sind (kein Zurückdrehen, kein Wiederkehren).
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
    .map(([mon]) => [mon, { abgeschlossen: true }]));
}

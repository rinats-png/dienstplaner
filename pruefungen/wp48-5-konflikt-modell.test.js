/* ==========================================================================
   WP-48.5 Teil: modellbasierte Zufallsprüfung der Konfliktführung
   (src/app/teilkonflikt.js) gegen einen simulierten Teilweg-Server

   Jede Review-Runde fand ein neues Gegenbeispiel. Diese Prüfung sucht sie
   systematisch: feste Startwerte, ein Server, der sich wie POST
   /api/bestand/teile verhält (Erwartungswerte je Zelle, Kernfeld mit
   Version, alles oder nichts, 409 TEILE_KONFLIKT mit aktuellen Werten,
   Wiederholvermerk je Sitzung + Kennung, 422 bei Kennung mit anderem
   Inhalt, 409 NEU_LADEN bei anderer Epoche), dazu Absagen (403), 413
   TEILE_ZU_GROSS, verlorene Antworten (Server schrieb, Antwort fehlt) und
   nicht angekommene Sendungen. Ein Fremdschreiber ändert Zellen und das
   Kernfeld direkt auf dem Server.

   Die Oberfläche ist so verdrahtet, wie Teil 2 es tun soll: Bei
   `neuAufsetzen` → GET + neuAufsetzen; bei „neuLaden" (auch bei Rückfall
   `voll`) → als Datei sichern und teilwegStart; bei offener Frage
   entscheidet die Person (zufällig) je Frage. Während einer offenen Frage
   oder „neu laden" ändert sie nichts (der Dialog ist modal).

   Invarianten:
   I1 Kein Wert eines Fremdschreibers wird überschrieben, ohne dass die
      Person genau diesen Wert gesehen und geändert oder für genau diese
      Zelle „meins" gewählt hat (gemessen an der Schreibkennung des Servers).
   I2 Keine eigene Änderung geht still verloren: Jede letzte Absicht der
      Person stand nach ihrer Änderung irgendwann auf dem Server, oder sie
      hat „fremd" gewählt, oder sie ist als Datei gesichert.
   I3 Keine Sendung bei offener Frage oder in „neu laden"; solange etwas
      unklar ist, nur dieselbe Sendung mit derselben Kennung in derselben
      Sitzung.
   I4 Terminierung: Ohne weitere Störungen ist nach höchstens 40 Schritten
      nichts mehr ausstehend.

   Keine Uhr, kein Math.random: ein linearer Kongruenzgenerator mit festem
   Startwert je Lage. 5 000 Lagen.
   Aufruf: npx vitest run pruefungen/wp48-5-konflikt-modell.test.js
   ========================================================================== */

import { describe, it, expect } from "vitest";
import * as T from "../src/app/teilkonflikt.js";

const ZELLEN = ["a1|2026-08-14", "a1|2026-08-15", "b1|2026-08-14"];
const KERN = "kern";
const SCHLUESSEL = [...ZELLEN, KERN];
const WERTE = ["F", "N", "S", null];
const LAGEN = 5000;

function zufallVon(start) {
  let s = start >>> 0;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return { r, int: (n) => Math.floor(r() * n), wahl: (xs) => xs[Math.floor(r() * xs.length)] };
}

/** Deterministische 32-Hex-Version (wie sha256-Präfix: gleiche Inhalte → gleiche Version). */
function ver(x) {
  const s = T.stabil(x);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619) >>> 0; b = (Math.imul(b, 33) + s.charCodeAt(i)) >>> 0; }
  return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).repeat(2);
}

/* ------------------------------ Server ------------------------------------ */
function serverNeu(waechter) {
  let id = 0;
  const S = { epoche: "e0e0e0e0", werte: {}, vermerke: new Map(), anzahlEpoche: 0 };
  for (const k of ZELLEN) S.werte[k] = { wert: "F", wer: "init", id: ++id };
  S.werte[KERN] = { wert: { r: 11 }, wer: "init", id: ++id };
  S.verlauf = new Map();       // Schreibkennung → Wert
  S.letzteEigene = {};         // k → Schreibkennung des letzten eigenen Schreibens
  for (const k of SCHLUESSEL) S.verlauf.set(S.werte[k].id, S.werte[k].wert);
  S.setzen = (k, wert, wer) => {
    S.werte[k] = { wert, wer, id: ++id };
    S.verlauf.set(id, wert);
    if (wer === "eigen") S.letzteEigene[k] = id;
    waechter.geaendert(k);
  };
  S.get = () => {
    const abw = {};
    for (const k of ZELLEN) if (S.werte[k].wert !== null) abw[k] = S.werte[k].wert;
    return { bestand: { mandanten: [{ id: "m1", abweichungen: abw, einstellungen: S.werte[KERN].wert }] }, etag: 1,
      teile: { format: 1, epoche: S.epoche, versionen: { "kern:einstellungen": ver(S.werte[KERN].wert) } } };
  };
  S.post = (rumpf, sitzung) => {
    if (rumpf.epoche !== S.epoche) return { status: 409, daten: { code: "NEU_LADEN", epoche: S.epoche } };
    const schl = `${sitzung}|${rumpf.anfrage}`;
    const abdruck = T.stabil({ ...rumpf, anfrage: undefined });
    if (S.vermerke.has(schl)) {
      const v = S.vermerke.get(schl);
      return v.abdruck === abdruck ? { status: 200, daten: { ...v.antwort, wiederholt: true } }
        : { status: 422, daten: { code: "ANFRAGE_WIEDERVERWENDET" } };
    }
    const kz = [], kk = [];
    for (const z of rumpf.zellen || []) {
      const akt = S.werte[z.k].wert;
      if (!T.gleich(z.alt, akt) && !T.gleich(z.neu, akt)) kz.push({ feld: "abweichungen", k: z.k, aktuell: akt });
    }
    for (const [feld, t] of Object.entries(rumpf.kern || {})) {
      const akt = S.werte[KERN].wert;
      if (t.basis !== ver(akt) && !T.gleich(t.wert, akt)) kk.push({ feld, aktuell: akt, version: ver(akt) });
    }
    if (kz.length || kk.length) return { status: 409, daten: { code: "TEILE_KONFLIKT",
      konflikt: { zellen: kz, kern: kk }, epoche: S.epoche, versionen: { "kern:einstellungen": ver(S.werte[KERN].wert) } } };
    for (const z of rumpf.zellen || []) if (!T.gleich(z.neu, S.werte[z.k].wert)) { waechter.schreibt(z.k, S.werte[z.k], z.neu); S.setzen(z.k, z.neu, "eigen"); }
    for (const t of Object.values(rumpf.kern || {})) if (!T.gleich(t.wert, S.werte[KERN].wert)) { waechter.schreibt(KERN, S.werte[KERN], t.wert); S.setzen(KERN, t.wert, "eigen"); }
    const antwort = { ok: true, epoche: S.epoche, versionen: rumpf.kern ? { "kern:einstellungen": ver(S.werte[KERN].wert) } : {} };
    S.vermerke.set(schl, { abdruck, antwort });
    return { status: 200, daten: antwort };
  };
  S.wiederherstellen = () => { S.epoche = `f${String(++S.anzahlEpoche).padStart(7, "0")}`; };
  return S;
}

/* ------------------------------ eine Lage --------------------------------- */
const lokalWert = (lokal, k) => (k === KERN ? (lokal.einstellungen ?? null) : ((lokal.abweichungen || {})[k] ?? null));
function lokalSetzen(lokal, k, w) {
  if (k === KERN) return { ...lokal, einstellungen: w };
  const abw = { ...(lokal.abweichungen || {}) };
  if (w === null) delete abw[k]; else abw[k] = w;
  return { ...lokal, abweichungen: abw };
}
const frageSchluessel = (f) => (f.art === "kern" ? KERN : f.k);

function lage(start, M = T) {
  const Z = zufallVon(start);
  const fehler = [];
  const spur = [];
  const log = (t) => { if (process.env.WP485_SPUR === String(start)) spur.push(`${jetzt} ${t} | lokal ${JSON.stringify(c && c.lokal && SCHLUESSEL.map((k) => lokalWert(c.lokal, k)))} server ${JSON.stringify(S && SCHLUESSEL.map((k) => [S.werte[k].wert, S.werte[k].wer, S.werte[k].id]))} z ${c && c.z ? `${c.z.phase} unklar=${c.z.unklar} fragen=${c.z.konflikte.map((x) => x.id)}` : ""}`); };
  let jetzt = 0;
  let kennungNr = 0;
  const neueKennung = () => `m${start}-${String(++kennungNr).padStart(6, "0")}`;
  /* Buchführung der Absichten der Person */
  const absicht = {};          // k → { wert, seq }
  const erfuellt = {};         // k → letzter Zeitpunkt, zu dem die Absicht erfüllt/aufgegeben/gesichert war
  const kennt = {};            // k → Schreibkennung des Servers, deren Wert die Oberfläche zeigt
  /* Werte je Schlüssel, deren Überschreiben die Person bewusst will: gesehen und geändert, oder „meins" gewählt.
     Wertbasiert wie der Erwartungswert des Servers: Schreibt ein Fremder denselben Wert noch einmal (oder
     A→B→A), ist das für den Teilweg keine sichtbare Änderung (bekannte Grenze 7.2, kein Zähler je Zelle). */
  const erlaubt = new Set();
  const wk = (k, w) => `${k}=${T.stabil(w)}`;
  const frageId = {};          // k → Schreibkennung zum Zeitpunkt der Frage
  const pruefeErfuellt = (k) => { const a = absicht[k]; if (a && T.gleich(S.werte[k].wert, a.wert)) erfuellt[k] = jetzt; };
  const waechter = {
    geaendert: (k) => pruefeErfuellt(k),
    schreibt: (k, vorher, neu) => {
      if (vorher.wer === "fremd" && !T.gleich(vorher.wert, neu) && !erlaubt.has(wk(k, vorher.wert)))
        fehler.push(`I1 Lage ${start}: fremder Wert ${JSON.stringify(vorher.wert)} in ${k} ohne Entscheidung überschrieben mit ${JSON.stringify(neu)}`);
    },
  };
  const S = serverNeu(waechter);
  const c = { sitzung: "s0", z: null, lokal: null };
  let sitzungNr = 0;

  const alleKennen = () => { for (const k of SCHLUESSEL) if (T.gleich(lokalWert(c.lokal, k), S.werte[k].wert)) kennt[k] = S.werte[k].id; };
  const fragenMerken = () => { for (const f of c.z.konflikte) frageId[frageSchluessel(f)] = S.werte[frageSchluessel(f)].id; };
  const neuStart = () => {
    /* Sicherung als Datei: der alte lokale Stand trägt die Absichten. */
    for (const k of SCHLUESSEL) if (absicht[k] && T.gleich(lokalWert(c.lokal, k), absicht[k].wert)) erfuellt[k] = jetzt;
    c.z = M.teilwegStart(S.get(), "m1");
    c.lokal = c.z.basis;
    alleKennen();
  };
  const laden = () => {
    const n = M.neuAufsetzen(c.z, S.get(), c.lokal);
    if (n.ergebnis === "neuLaden") { c.z = n.zustand; return neuStart(); }
    c.z = n.zustand; c.lokal = n.lokal;
    alleKennen();
    fragenMerken();
    log(`laden → ${n.ergebnis}`);
  };
  const entscheiden = () => {
    let w = c.z;
    for (const f of c.z.konflikte) {
      const k = frageSchluessel(f);
      if (Z.r() < 0.5) { w = M.waehlen(w, f.id, "meins"); erlaubt.add(wk(k, f.fremd)); }
      else { w = M.waehlen(w, f.id, "fremd"); kennt[k] = frageId[k]; if (absicht[k]) erfuellt[k] = jetzt; }
    }
    const r = M.aufloesen(w, c.lokal);
    if (!r) { fehler.push(`I4 Lage ${start}: Auflösen trotz vollständiger Wahl nicht möglich`); return; }
    c.z = r.zustand; c.lokal = r.lokal;
    log("entschieden");
  };
  const speichern = (modus) => {
    const d = M.deltaBilden(c.z, c.lokal);
    if ("leer" in d || "gesperrt" in d) return;
    if ("neuAufsetzen" in d) return laden();
    if ("voll" in d) { fehler.push(`Lage ${start}: unerwarteter Rückfall voll (${d.voll})`); return; }
    const vorher = c.z;
    const r = M.rumpfBauen(c.z, d.delta, { durch: "x", neueKennung, sitzung: c.sitzung });
    if (!r.rumpf) { if (r.neuAufsetzen) laden(); return; }
    /* I3 */
    if (vorher.konflikte.length || vorher.phase === "neuLaden") fehler.push(`I3 Lage ${start}: Sendung bei offener Frage/neu laden`);
    if (vorher.unklar.length && !(vorher.unterwegs && vorher.unterwegs.anfrage === r.rumpf.anfrage && vorher.unterwegs.sitzung === c.sitzung))
      fehler.push(`I3 Lage ${start}: Sendung mit Unklarem unter neuer Kennung/anderer Sitzung`);
    c.z = r.zustand;
    let antwort;
    if (modus === "ok") antwort = S.post(r.rumpf, c.sitzung);
    else if (modus === "verloren") { S.post(r.rumpf, c.sitzung); antwort = { status: null, netz: true }; }
    else if (modus === "weg") antwort = { status: null, netz: true };
    else if (modus === "403") antwort = { status: 403, daten: { fehler: "nein" } };
    else antwort = { status: 413, daten: { code: "TEILE_ZU_GROSS" } };
    const e = M.antwortVerarbeiten(c.z, antwort);
    c.z = e.zustand;
    log(`senden ${modus} ${JSON.stringify(r.rumpf.zellen || [])} kern=${!!r.rumpf.kern} → ${e.ergebnis}`);
    if (e.ergebnis === "gespeichert") for (const s of [...(r.rumpf.zellen || []).map((z) => z.k), ...(r.rumpf.kern ? [KERN] : [])])
      if (T.gleich(lokalWert(c.lokal, s), S.werte[s].wert)) kennt[s] = S.werte[s].id;
    if (e.ergebnis === "konflikt") fragenMerken();
    else if (e.ergebnis === "neuAufsetzen") laden();
    else if (e.ergebnis === "neuLaden" || e.ergebnis === "voll") neuStart();   // Rückfall voll: hier als Sicherung + neu laden
  };

  c.z = M.teilwegStart(S.get(), "m1");
  c.lokal = c.z.basis;
  alleKennen();

  const schritte = 8 + Z.int(20);
  for (let i = 0; i < schritte && !fehler.length; i++) {
    jetzt++;
    if (c.z.phase === "neuLaden") { neuStart(); continue; }
    const x = Z.r();
    const modal = c.z.konflikte.length > 0;
    if (x < 0.30 && !modal) {
      const k = Z.wahl(SCHLUESSEL);
      const wert = k === KERN ? { r: 9 + Z.int(4) } : Z.wahl(WERTE);
      if (T.gleich(lokalWert(c.lokal, k), wert)) continue;   // keine Änderung (die Absicht bleibt die alte)
      if (kennt[k] !== undefined) erlaubt.add(wk(k, S.verlauf.get(kennt[k])));
      c.lokal = lokalSetzen(c.lokal, k, wert);
      /* Eine Rücknahme auf den Wert, den die Oberfläche als Serverstand kennt (ihre Basis), ist keine eigene
         Änderung — außer ein eigenes Schreiben hat dort einen anderen Wert hinterlassen (B2: Sendung unklar,
         angekommen, dann zurückgenommen). */
      const basisWert = lokalWert(c.z.basis, k);
      const eigen = S.letzteEigene[k];
      absicht[k] = { wert, seq: jetzt,
        neutral: T.gleich(wert, basisWert) && (eigen === undefined || T.gleich(S.verlauf.get(eigen), basisWert)) };
      pruefeErfuellt(k);
      log(`ändern ${k}=${JSON.stringify(wert)}`);
    } else if (x < 0.55) {
      if (modal) entscheiden();
      else speichern(Z.wahl(["ok", "ok", "ok", "ok", "verloren", "verloren", "weg", "weg", "403", "413"]));
    } else if (x < 0.72) {
      const k = Z.wahl(SCHLUESSEL);
      S.setzen(k, k === KERN ? { r: 9 + Z.int(4) } : Z.wahl(WERTE), "fremd");
      log(`fremd ${k}`);
    } else if (x < 0.80) laden();
    else if (x < 0.86) { c.sitzung = `s${++sitzungNr}`; laden(); }
    else if (x < 0.96) { if (modal) entscheiden(); }
    else if (x < 0.975) { if (modal) speichern("ok"); }   // Schließen der Seite (keepalive) bei offener Frage: darf nichts senden
    else if (x < 0.99) S.wiederherstellen();
  }
  /* Abschluss ohne Störungen (I4) */
  let ruhig = false;
  for (let i = 0; i < 40 && !fehler.length; i++) {
    jetzt++;
    if (c.z.phase === "neuLaden") { neuStart(); continue; }
    if (c.z.konflikte.length) { entscheiden(); continue; }
    const d = M.deltaBilden(c.z, c.lokal);
    if ("leer" in d) { ruhig = true; break; }
    speichern("ok");
  }
  if (!fehler.length && !ruhig) fehler.push(`I4 Lage ${start}: nach 40 Schritten nicht ruhig (${c.z.phase}, unklar ${c.z.unklar.length})`);
  /* I2 */
  for (const k of SCHLUESSEL) {
    const a = absicht[k];
    if (a && a.neutral) continue;
    if (a && !((erfuellt[k] ?? -1) >= a.seq) && !T.gleich(S.werte[k].wert, a.wert))
      fehler.push(`I2 Lage ${start}: Absicht ${JSON.stringify(a.wert)} für ${k} still verloren (Server ${JSON.stringify(S.werte[k].wert)})`);
  }
  if (spur.length) console.log(spur.join("\n"));
  return fehler;
}

describe("WP-48.5 Modellprüfung (5 000 Lagen, feste Startwerte)", () => {
  it("I1–I4 halten", () => {
    const alle = [];
    for (let i = 1; i <= LAGEN && alle.length < 5; i++) alle.push(...lage(i * 7919));
    expect(alle).toEqual([]);
  }, 120000);
  /* Selbstprüfung: Das Modell muss bekannte Fehlerklassen (die Befunde der Review-Runden) finden. Jede Mutante
     verändert nur das Verhalten des Moduls von außen und muss in einer der ersten 3 000 Lagen rot werden. */
  const frei = (z) => ({ ...z, konflikte: [], phase: z.phase === "konflikt" ? "bereit" : z.phase });
  const MUTANTEN = {
    "K2/ABA: Netzfehler lässt nichts unklar": { antwortVerarbeiten: (z, a) => { const e = T.antwortVerarbeiten(z, a);
      return a && a.netz ? { ...e, zustand: { ...e.zustand, unklar: [] } } : e; } },
    "K1: neuAufsetzen behält alten lokalen Stand": { neuAufsetzen: (z, a, l) => { const n = T.neuAufsetzen(z, a, l);
      return n.ergebnis === "aufgesetzt" || n.ergebnis === "konflikt" ? { ...n, lokal: l } : n; } },
    "A1/B2: neuAufsetzen vergisst Unklares und offene Fragen": { neuAufsetzen: (z, a, l) => T.neuAufsetzen({ ...frei(z), unklar: [] }, a, l) },
    "B1: Senden trotz offener Frage": { deltaBilden: (z, l) => T.deltaBilden(frei(z), l),
      rumpfBauen: (z, d, o) => T.rumpfBauen(frei(z), d, o) },
    /* „Basis nach 409 nicht aktualisiert" ist im Modell bewusst keine Mutante: Sie führt zu wiederholten Fragen,
       nicht zu Verlust (Entwurf 4.6 Nr. 3); die Einheitsprüfung in wp48-5-konflikt.test.js deckt sie ab. */
    "„fremd“ wirkt nicht (lokal bleibt meins)": { aufloesen: (z, l) => { const r = T.aufloesen(z, l); return r ? { ...r, lokal: l } : r; } },
    "Wiederholung unter neuer Kennung": { rumpfBauen: (z, d, o) => T.rumpfBauen({ ...z, unterwegs: null, unklar: [] }, d, o) },
  };
  for (const [name, ersatz] of Object.entries(MUTANTEN)) {
    it(`Selbstprüfung: Mutante „${name}“ wird gefunden`, () => {
      const M = { ...T, ...ersatz };
      let gefunden = null;
      for (let i = 1; i <= 3000 && !gefunden; i++) { const f = lage(i * 7919, M); if (f.length) gefunden = f[0]; }
      expect(gefunden).not.toBeNull();
    }, 120000);
  }
});


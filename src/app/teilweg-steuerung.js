/* ==========================================================================
   TEILSPEICHERUNG: ABLAUF EINES SPEICHERVORGANGS (WP-48.5 Teil 2)

   Entwurf: docs/acc45/WP48-TEILSPEICHERUNG.md 2.4 und 7.6. Diese Datei
   verbindet die reine Logik aus teilkonflikt.js zu einem Speichervorgang:
   Delta bilden, Rumpf bauen, senden, Antwort deuten, bei Bedarf frisch
   lesen und neu aufsetzen. Netz und Browser kommen von außen (`senden`,
   `holen`), damit derselbe Ablauf ohne Browser gegen den echten Handler
   geprüft werden kann (pruefungen/wp48-5-oberflaeche.test.js).

   Benutzt wird sie nur, wenn der Server im GET die Fähigkeit `teile`
   meldet (Schalter CENTRIC_TEILSPEICHERUNG an). Sonst gibt es keinen
   Zustand, und speicher.js bleibt beim heutigen Voll-PUT.

   Grundsätze (aus teilkonflikt.js, hier nur verdrahtet):
   - Rückfall auf den Voll-PUT nur, wenn teilkonflikt.js `voll` sagt — und
     nie, solange ein Segment unklar ist (dann erst frisches GET und
     neuAufsetzen). Ein Voll-PUT umginge sonst den ABA-Schutz.
   - Bei offener Konfliktfrage und in „neu laden" geht nichts hinaus, auch
     nicht per keepalive beim Schließen.
   - Die Sitzungskennung wird bei jedem Rumpf an rumpfBauen übergeben (B4):
     Daran prüft die Oberfläche, ob eine Wiederholung aus derselben Sitzung
     stammt. In den Rumpf selbst kommt sie nicht (rumpfBauen setzt nur
     Format, Epoche, Anfrage, durch, kern, zellen; der Server bildet seine
     Kennung aus der eigenen Sitzung). Sie ist ein Abdruck des Zugangs, nie
     der Zugang selbst.
   - Vor jedem Rückfall auf den Voll-PUT: frisches GET und vollVorbereiten
     (Review #348 H1).
   - Nach neuAufsetzen ist der lokale Stand die frische Sicht plus nur die
     eigenen ausstehenden Segmente; der Aufrufer übernimmt ihn.
   ========================================================================== */
import * as T from "./teilkonflikt.js";

/**
 * Kennung der Sitzung für den Wiederholschutz: ein Abdruck des Zugangs (FNV-1a, zweimal), nie der Zugang selbst.
 * Gleicher Zugang → gleiche Kennung; anderer Zugang (neu angemeldet) → andere Kennung. Ohne Zugang null.
 * @param {string|null|undefined} token
 * @returns {string|null}
 */
export function sitzungsAbdruck(token) {
  if (typeof token !== "string" || !token) return null;
  let a = 2166136261, b = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ ((c * 31 + i) & 0xffff), 16777619) >>> 0;
  }
  return `s${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/** Den eigenen Betrieb im Bestand ersetzen (alle anderen Felder und Betriebe bleiben). */
export function bestandMitBetrieb(bestand, mandantId, m) {
  return { ...bestand, mandanten: (bestand.mandanten || []).map((x) => (x && x.id === mandantId ? m : x)) };
}

const hatFeld = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const wertVon = (o, k) => (hatFeld(o, k) ? o[k] : null);
/** Zustand des Reiters bzw. vom Server gezählt — nie Teil eines Vergleichs (wie teilkonflikt.js). */
const NIE_VERGLEICHEN = new Set(["session", "stand"]);

/**
 * Rückfall auf den Voll-PUT vorbereiten (Review #348, H1): Der Voll-PUT soll gegen den AKTUELLEN Stand laufen — mit
 * dessen ETag —, sonst stieße er mit den eigenen Teilspeicherungen zusammen (409 ohne Fremdbeteiligung). Dazu wird der
 * lokale Stand auf die frische Sicht neu aufgesetzt, und zwar je Zelle bzw. je Feld (auch Felder ohne Version, die der
 * Teilweg nicht darstellen kann):
 *   nur ich geändert (lokal ≠ Basis)            → meins
 *   nur andere geändert (frisch ≠ Basis)        → frisch (fremde Änderungen bleiben erhalten)
 *   beide, verschieden                          → Frage je Zelle/Feld (kein Senden bis zur Entscheidung)
 * Nur-Server-Felder kommen immer aus der frischen Sicht. Ohne Frage: `voll` mit neuem lokalem Stand und neuer Basis —
 * der Voll-PUT mit dem ETag der frischen Antwort überschreibt dann keine fremde Änderung.
 * @returns {{ ergebnis: "voll"|"konflikt"|"neuLaden"|"gesperrt"|"aus", zustand: any, lokal: any }}
 */
export function vollVorbereiten(z, lokal, antwort) {
  if (z.phase === "neuLaden") return { ergebnis: "neuLaden", zustand: z, lokal };
  if (z.konflikte.length) return { ergebnis: "gesperrt", zustand: z, lokal };
  const frisch = T.teilwegStart(antwort, z.mandantId);
  if (!frisch) return { ergebnis: "aus", zustand: null, lokal };
  if (frisch.epoche !== z.epoche)
    return { ergebnis: "neuLaden", lokal, zustand: { ...frisch, phase: "neuLaden", unklar: [...z.unklar], ausstehendBeiNeuLaden: { voll: "epoche" } } };
  const basis = z.basis, f = frisch.basis, l = lokal || {};
  const neu = {};
  const fragen = [];
  for (const feld of new Set([...Object.keys(basis), ...Object.keys(l), ...Object.keys(f)])) {
    if (NIE_VERGLEICHEN.has(feld)) { if (hatFeld(l, feld)) neu[feld] = l[feld]; continue; }
    if (T.NUR_SERVER_SPIEGEL.includes(feld)) { if (hatFeld(f, feld)) neu[feld] = f[feld]; continue; }
    if (T.ZELLFELDER.includes(feld) && [basis[feld], l[feld], f[feld]].every((x) => x === undefined || x === null || istObjekt(x))) {
      const qb = istObjekt(basis[feld]) ? basis[feld] : {}, ql = istObjekt(l[feld]) ? l[feld] : {}, qf = istObjekt(f[feld]) ? f[feld] : {};
      const aus = {};
      for (const k of new Set([...Object.keys(qb), ...Object.keys(ql), ...Object.keys(qf)])) {
        const b = wertVon(qb, k), m = wertVon(ql, k), fr = wertVon(qf, k);
        const meins = !T.gleich(m, b), fremd = !T.gleich(fr, b);
        if (meins && fremd && !T.gleich(m, fr)) fragen.push({ id: `z:${feld}:${k}`, art: "zelle", feld, k, meins: m, fremd: fr });
        const w = meins ? m : fr;
        if (w !== null && w !== undefined) aus[k] = w;
      }
      if (hatFeld(l, feld) || hatFeld(f, feld)) neu[feld] = aus;
      continue;
    }
    const b = wertVon(basis, feld), m = wertVon(l, feld), fr = wertVon(f, feld);
    const meins = !T.gleich(m, b), fremd = !T.gleich(fr, b);
    if (meins && fremd && !T.gleich(m, fr)) fragen.push({ id: `k:${feld}`, art: "kern", feld, meins: m, fremd: fr });
    const quelle = meins ? l : f;
    if (hatFeld(quelle, feld)) neu[feld] = quelle[feld];
  }
  fragen.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ergebnis: fragen.length ? "konflikt" : "voll", lokal: neu,
    zustand: { ...frisch, konflikte: fragen, phase: fragen.length ? "konflikt" : "bereit" } };
}

/** Ist der Zustand ruhig — nichts unklar, keine Frage offen, nichts unterwegs, nicht „neu laden"? */
export const ruhig = (z) => !!z && z.phase === "bereit" && !z.unklar.length && !z.konflikte.length && !z.unterwegs;

/**
 * Ein Speichervorgang über den Teilweg.
 *
 * @param {any} teil  Zustand aus teilkonflikt.js (teilwegStart), nie null
 * @param {{ bestand: any, neuester?: () => any, durch?: string, sitzung: string|null,
 *   neueKennung: () => string, senden: (rumpf: any) => Promise<any>, holen: () => Promise<any>,
 *   beimSchliessen?: boolean, vollGewuenscht?: boolean, uebernehmen?: (bestand: any, etag: any) => void }} o
 *   `bestand`: der zu speichernde Stand (ganzer Bestand mit Sitzung).
 *   `neuester`: der jüngste lokale Stand (für neuAufsetzen nach dem Warten auf das GET); ohne Angabe `bestand`.
 *   `senden(rumpf)`: POST /api/bestand/teile → `{ status, daten }`, ohne Antwort `{ netz: true }`.
 *   `holen()`: GET /api/bestand → `{ status, daten, ausSpeicher }`, ohne Antwort `{ netz: true }`.
 *   `vollGewuenscht`: der Auftrag braucht den Voll-PUT (Ausnahmeweg) — auch dann erst nach Klärung des Unklaren.
 *   `uebernehmen(bestand, etag)`: sofort nach neuAufsetzen, vor jedem weiteren Senden (die Oberfläche übernimmt).
 * @returns {Promise<{ teil: any, ergebnis: "gespeichert"|"nichts"|"konflikt"|"neuLaden"|"voll"|"aus"|"gesperrt"|"fehler",
 *   bestand?: any, etag?: any, gesendet?: any, antwort?: any, meldung?: string, grund?: string }>}
 *   `bestand`: neuer lokaler Stand (nach neuAufsetzen) — der Aufrufer übernimmt ihn.
 *   `etag`: Stand des frischen GET (gehört zu `bestand`).
 *   `voll`: Rückfall auf den Voll-PUT — immer erst nach frischem GET und vollVorbereiten, mit `bestand` (neu
 *   aufgesetzt) und `etag` (Stand des frischen GET), Review #348 H1; `aus`: der Server bietet den Teilweg
 *   nicht mehr an (Voll-PUT, Zustand verwerfen).
 */
export async function teilSpeichern(teil, o) {
  let z = teil;
  let bestand = o.bestand;
  /** @type {any} */
  const neu = {};
  const mit = (r) => ({ ...r, ...neu });
  const neuester = () => (typeof o.neuester === "function" && o.neuester()) || bestand;

  /** Frisches GET; nie beim Schließen, nie aus dem Speicher des Dienstarbeiters. */
  const frischHolen = async (meldung, grund) => {
    if (o.beimSchliessen) return { fertig: mit({ teil: z, ergebnis: "nichts", grund: `${grund}-beim-schliessen` }) };
    let g;
    try { g = await o.holen(); } catch { g = { netz: true }; }
    if (!g || g.netz || g.status !== 200 || g.ausSpeicher || !g.daten)
      return { fertig: mit({ teil: z, ergebnis: "fehler", antwort: g && !g.ausSpeicher && !g.netz ? g : { status: null, netz: true },
        meldung: meldung || "Der aktuelle Stand ließ sich nicht laden. Deine Änderungen bleiben erhalten." }) };
    return { g };
  };
  /** Neu aufgesetzten lokalen Stand übernehmen (sofort, vor jedem weiteren Senden). */
  const annehmen = (jetzt, lokalNeu, etag) => {
    bestand = bestandMitBetrieb(jetzt, z.mandantId, lokalNeu);
    neu.bestand = bestand;
    neu.etag = etag;
    if (typeof o.uebernehmen === "function") o.uebernehmen(bestand, etag);
  };

  const aufsetzen = async (meldung) => {
    const h = await frischHolen(meldung, "neu-aufsetzen");
    if (h.fertig) return h;
    /* Der jüngste lokale Stand nach dem Warten — sonst gingen Eingaben während des Ladens verloren. */
    const jetzt = neuester();
    const n = T.neuAufsetzen(z, h.g.daten, T.mandantAus(jetzt, z.mandantId));
    if (n.ergebnis === "aus") return { fertig: mit({ teil: null, ergebnis: "aus" }) };
    if (n.ergebnis === "neuLaden") return { fertig: mit({ teil: n.zustand, ergebnis: "neuLaden" }) };
    z = n.zustand;
    annehmen(jetzt, n.lokal, h.g.daten.etag);
    if (n.ergebnis === "konflikt") return { fertig: mit({ teil: z, ergebnis: "konflikt" }) };
    return { fertig: null };
  };

  /* Review #348 H1: Vor jedem Rückfall auf den Voll-PUT frisch lesen und je Zelle/Feld neu aufsetzen
     (vollVorbereiten) — der Voll-PUT trägt dann den ETag des frischen Stands und stößt nicht mit den eigenen
     Teilspeicherungen zusammen; fremde Änderungen bleiben erhalten, Streit wird zur Frage. */
  const vorbereiten = async (grund, meldung) => {
    const h = await frischHolen(undefined, "voll");
    if (h.fertig) return h.fertig;
    const jetzt = neuester();
    const v = vollVorbereiten(z, T.mandantAus(jetzt, z.mandantId), h.g.daten);
    if (v.ergebnis === "aus") return mit({ teil: null, ergebnis: "aus" });
    if (v.ergebnis === "neuLaden" || v.ergebnis === "gesperrt") return mit({ teil: v.zustand, ergebnis: v.ergebnis });
    z = v.zustand;
    annehmen(jetzt, v.lokal, h.g.daten.etag);
    if (v.ergebnis === "konflikt") return mit({ teil: z, ergebnis: "konflikt" });
    return mit({ teil: z, ergebnis: "voll", grund, ...(meldung ? { meldung } : {}) });
  };

  for (let runde = 0; runde < 3; runde++) {
    /* Der Betrieb der Sitzung muss der des Teilwegs sein — sonst lägen die Änderungen außerhalb des Deltas. */
    const sitz = bestand && bestand.session;
    if (sitz && sitz.mandantId && sitz.mandantId !== z.mandantId) return mit({ teil: null, ergebnis: "aus", grund: "anderer-betrieb" });
    const lokal = T.mandantAus(bestand, z.mandantId);
    let d = T.deltaBilden(z, lokal);
    if (o.vollGewuenscht && ("delta" in d || "leer" in d || "voll" in d))
      d = z.unklar.length ? { neuAufsetzen: true, grund: "ausnahme" } : { voll: "ausnahme" };
    if ("gesperrt" in d) return mit({ teil: z, ergebnis: "gesperrt", grund: d.gesperrt });
    if ("leer" in d) return mit({ teil: z, ergebnis: "nichts", grund: "leer" });
    if ("voll" in d) return vorbereiten(d.voll);
    if ("neuAufsetzen" in d) {
      const a = await aufsetzen();
      if (a.fertig) return a.fertig;
      continue;
    }
    const r = T.rumpfBauen(z, d.delta, { durch: o.durch, neueKennung: o.neueKennung, sitzung: o.sitzung });
    if (!r.rumpf) {
      if ("neuAufsetzen" in r && r.neuAufsetzen) {
        const a = await aufsetzen();
        if (a.fertig) return a.fertig;
        continue;
      }
      if (r.grund === "sitzung-fehlt") return mit({ teil: z, ergebnis: "fehler", antwort: { status: 401, daten: {} }, grund: r.grund });
      return mit({ teil: z, ergebnis: "gesperrt", grund: r.grund });
    }
    let a;
    try { a = await o.senden(r.rumpf); } catch { a = { status: null, netz: true }; }
    const e = T.antwortVerarbeiten(r.zustand, a);
    z = e.zustand;
    if (e.ergebnis === "gespeichert") return mit({ teil: z, ergebnis: "gespeichert", gesendet: bestand });
    if (e.ergebnis === "konflikt" || e.ergebnis === "neuLaden") return mit({ teil: z, ergebnis: e.ergebnis });
    if (e.ergebnis === "voll") return vorbereiten("zu-gross", e.meldung);
    if (e.ergebnis === "neuAufsetzen") {
      const n = await aufsetzen(e.meldung);
      if (n.fertig) return n.fertig;
      continue;
    }
    return mit({ teil: z, ergebnis: "fehler", antwort: a, meldung: e.meldung });
  }
  return mit({ teil: z, ergebnis: "fehler", antwort: { status: null, netz: true },
    meldung: "Der Stand ließ sich nicht abgleichen. Bitte neu laden — deine Änderungen bleiben bis dahin erhalten." });
}

/**
 * Alle Fragen entscheiden und den lokalen Stand anpassen.
 * @param {any} teil  Zustand mit Phase „konflikt"
 * @param {Record<string, "fremd"|"meins">} wahl  je Frage
 * @param {any} bestand  jüngster lokaler Stand (ganzer Bestand)
 * @returns {{ teil: any, bestand: any } | null}  null, solange eine Frage offen ist
 */
export function teilEntscheiden(teil, wahl, bestand) {
  if (!teil || teil.phase !== "konflikt") return null;
  let w = teil;
  for (const f of teil.konflikte) if (wahl && Object.prototype.hasOwnProperty.call(wahl, f.id)) w = T.waehlen(w, f.id, wahl[f.id]);
  const lokal = T.mandantAus(bestand, teil.mandantId);
  if (!lokal) return null;
  const r = T.aufloesen(w, lokal);
  if (!r) return null;
  return { teil: r.zustand, bestand: bestandMitBetrieb(bestand, teil.mandantId, r.lokal) };
}

/**
 * Inhalt der Sicherung als Datei vor dem Neuladen: das Ausstehende (Delta bzw. Grund) und der eigene Betrieb.
 * Ohne Zugang, ohne Sitzungskennung. Rein lokal, kein Netz.
 */
export function sicherungInhalt(teil, bestand, zeit) {
  const lokal = teil ? T.mandantAus(bestand, teil.mandantId) : null;
  const aus = teil && teil.ausstehendBeiNeuLaden;
  return {
    art: "centric-ausstehende-aenderungen", format: 1, erstellt: zeit,
    hinweis: "Diese Änderungen waren beim Neuladen noch nicht gespeichert. Die Datei enthält Personaldaten deines Betriebs — "
      + "bitte nach dem Nachtragen löschen.",
    grund: aus && typeof aus === "object" && "voll" in aus ? aus.voll : null,
    ausstehend: aus && typeof aus === "object" && !("voll" in aus) ? aus : null,
    unklar: teil ? [...teil.unklar] : [],
    offeneFragen: teil ? teil.konflikte.map((f) => ({ art: f.art, feld: f.feld, k: f.k || null, meins: f.meins, fremd: f.fremd })) : [],
    meinBetrieb: lokal,
  };
}

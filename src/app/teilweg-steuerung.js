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
   - Die Sitzungskennung geht immer mit (B4); sie ist ein Abdruck des
     Zugangs, nie der Zugang selbst, und verlässt den Browser nicht.
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
 *   `voll`: Rückfall auf den Voll-PUT (mit `bestand`, falls neu aufgesetzt); `aus`: der Server bietet den Teilweg
 *   nicht mehr an (Voll-PUT, Zustand verwerfen).
 */
export async function teilSpeichern(teil, o) {
  let z = teil;
  let bestand = o.bestand;
  /** @type {any} */
  const neu = {};
  const mit = (r) => ({ ...r, ...neu });
  const neuester = () => (typeof o.neuester === "function" && o.neuester()) || bestand;

  const aufsetzen = async (meldung) => {
    if (o.beimSchliessen) return { fertig: mit({ teil: z, ergebnis: "nichts", grund: "neu-aufsetzen-beim-schliessen" }) };
    let g;
    try { g = await o.holen(); } catch { g = { netz: true }; }
    /* Eine Antwort aus dem Speicher des Dienstarbeiters ist kein frischer Stand. */
    if (!g || g.netz || g.status !== 200 || g.ausSpeicher || !g.daten)
      return { fertig: mit({ teil: z, ergebnis: "fehler", antwort: g && !g.ausSpeicher && !g.netz ? g : { status: null, netz: true },
        meldung: meldung || "Der aktuelle Stand ließ sich nicht laden. Deine Änderungen bleiben erhalten." }) };
    /* Der jüngste lokale Stand nach dem Warten — sonst gingen Eingaben während des Ladens verloren. */
    const jetzt = neuester();
    const lokal = T.mandantAus(jetzt, z.mandantId);
    const n = T.neuAufsetzen(z, g.daten, lokal);
    if (n.ergebnis === "aus") return { fertig: mit({ teil: null, ergebnis: "aus" }) };
    if (n.ergebnis === "neuLaden") return { fertig: mit({ teil: n.zustand, ergebnis: "neuLaden" }) };
    z = n.zustand;
    bestand = bestandMitBetrieb(jetzt, z.mandantId, n.lokal);
    neu.bestand = bestand;
    neu.etag = g.daten.etag;
    if (typeof o.uebernehmen === "function") o.uebernehmen(bestand, g.daten.etag);
    if (n.ergebnis === "konflikt") return { fertig: mit({ teil: z, ergebnis: "konflikt" }) };
    return { fertig: null };
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
    if ("voll" in d) return mit({ teil: z, ergebnis: "voll", grund: d.voll });
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
    if (e.ergebnis === "voll") return mit({ teil: z, ergebnis: "voll", grund: "zu-gross", meldung: e.meldung });
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

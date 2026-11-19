/* ==========================================================================
   ZWEI-FAKTOR FÜR BETREIBERCODES (WP-32b)

   Ein Zugangscode der Rolle „betreiber" öffnet die Betreiberkonsole: alle
   Mandanten, Zugänge, Rechnungen, Datenräume. Bis WP-32b genügte der Code
   allein. Jetzt kann für jeden Betreibercode ein zweiter Faktor eingerichtet
   werden (TOTP, zweifaktor.mjs); danach gibt /api/anmelden für diesen Code
   nur noch mit gültigem Code aus der App eine Sitzung heraus.

   Alles läuft über /api/anmelden selbst, mit dem Betreibercode als Ausweis:

     { zugangscode, zweifaktorAktion: "beginnen" }
         → Geheimnis und otpauth-Adresse, genau einmal; keine Sitzung
     { zugangscode, zweifaktorAktion: "bestaetigen", zweifaktor: "123456" }
         → aktiv, zehn Wiederherstellungscodes, genau einmal; keine Sitzung
     { zugangscode, zweifaktorAktion: "abschalten", zweifaktor: "123456" }
         → nur mit frischem Code oder Wiederherstellungscode
     { zugangscode, zweifaktor: "123456" }
         → die gewöhnliche Anmeldung; mit eingerichtetem zweiten Faktor Pflicht

   Warum nicht über die Sitzung: Eine Sitzung ist ein Merkmal im Browser; wer
   es abgreift, könnte damit den zweiten Faktor abschalten. Den Code selbst
   muss man kennen — das ist dieselbe Hürde wie beim Anmelden, und
   Abschalten verlangt zusätzlich den zweiten Faktor.

   Gespeichert wird unter einer eigenen id je Code (Prüfsumme des
   Ablageschlüssels mit Vorsatz), getrennt von den Verwalterschlüsseln.
   Gebremst wird je Code und je Herkunft (GRENZEN.zweifaktor, fail-closed).
   ========================================================================== */

import { createHash } from "node:crypto";
import { ersteinrichtungEinloesen, ersteinrichtungFehlversuch } from "./zugangscode-ersteinrichtung.mjs";
import { istProduktion, betreiberZweifaktorPflicht } from "./umgebung.mjs";
import { ablageSchluessel, altHash, pfeffrig } from "./codes.mjs";
import { kontoLesen, kontoLesenStreng, kontoAendern } from "./konten.mjs";
import { sitzungenBeendenWenn } from "./sitzungen.mjs";
import { bremse, entlasten, notentlasten, protokoll, zuVielAntwort, GRENZEN } from "./schutz.mjs";
import { zweifaktorStand, zweifaktorBeginnen, zweifaktorBestaetigen, zweifaktorBestaetigenVorpruefen,
  zweifaktorPruefen, wiederherstellungNeu,
  zweifaktorAbschalten, zweifaktorEinrichtungVerwerfen, zweifaktorMoeglich } from "./zweifaktor.mjs";
import { laufenderFall, fallZurueckziehen } from "./kontowiederherstellung.mjs";
import { verlustAktion, VERLUST_AKTIONEN } from "./kontowiederherstellung-zugang.mjs";

/**
 * Ist der zweite Faktor für Betreibercodes Pflicht? (WP-32d)
 *
 * Ja, sobald der Server NICHT ausdrücklich als Entwicklung oder Prüfung läuft
 * (NODE_ENV=development oder test) — also in der Auslieferung (NODE_ENV=production,
 * im Docker-Image gesetzt) und ebenso bei fehlender oder unbekannter NODE_ENV
 * (fail-closed, umgebung.mjs). Außerhalb davon schaltet
 * CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1 sie ein.
 * Es gibt bewusst KEINEN Schalter, der die Pflicht abstellt: „0“, „aus“, leer —
 * nichts davon ändert etwas. Wer ohne Pflicht arbeiten will (Entwicklung,
 * Prüfungen), startet ausdrücklich mit NODE_ENV=development oder test.
 * Wird bei jedem Aufruf gelesen, nicht beim Laden des Moduls.
 * @param {Record<string, string|undefined>} [env]
 */
export function betreiberPflicht(env = process.env) {
  if (istProduktion(env)) return true;
  return betreiberZweifaktorPflicht(env);
}

/** Die id, unter der der zweite Faktor eines Betreibercodes liegt. */
export const betreiberZweifaktorId = (codeSchluessel) =>
  createHash("sha256").update(`betreiber-code:${codeSchluessel}`).digest("hex");

/* --------------------------------------------------------------------------
   SI-P4: Zweiter Faktor auch für Leitung, Planung und Kunde

   Leitung, Planung (planer, subplaner) und Kunde sehen Gesundheits-, Bank-
   und Lohndaten. Ihr Zugangscode bekommt denselben Weg wie ein Betreibercode:
   einrichten, bestätigen, abschalten über /api/anmelden, und — einmal
   eingerichtet — ohne gültigen Code aus der App keine Sitzung. Es gibt
   keinen Umweg: Ist der Faktor aktiv, verlangt jede Anmeldung mit diesem
   Code ihn (auch wenn die Pflicht aus ist).

   Gespeichert unter einer eigenen id je Code (Vorsatz „rollen-code:“),
   getrennt von Betreibercodes und Verwalterschlüsseln; eigener Bremszähler
   (`r:`). Verliert jemand Gerät und Wiederherstellungscodes, ist der Rückweg
   ein neuer Zugangscode (Leitung oder Betreiber sperrt den alten) — dessen
   Faktor beginnt neu.

   Pflicht für alle diese Codes: CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1. Die
   Vorgabe ist aus, auch in der Auslieferung — ob und ab wann die Pflicht im
   Pilot gilt, ist eine Betreiberentscheidung (docs/acc45/SI-P4-NACHWEIS.md).
   Unabhängig davon gilt fail-closed: Ohne aktiven zweiten Faktor darf ein
   solcher Zugang auf dem Gerät nicht gemerkt werden (merkenErlaubt).
   -------------------------------------------------------------------------- */

/** Rollen, deren Zugangscode einen zweiten Faktor bekommt (SI-P4). */
export const ZWEIFAKTOR_ROLLEN = Object.freeze(["leitung", "planer", "subplaner", "kunde"]);
/** @param {unknown} rolle */
export const zweifaktorRolle = (rolle) => typeof rolle === "string" && ZWEIFAKTOR_ROLLEN.includes(rolle);

/**
 * Ist der zweite Faktor für Codes der ZWEIFAKTOR_ROLLEN Pflicht? Nur mit
 * CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1. Wird bei jedem Aufruf gelesen.
 * @param {Record<string, string|undefined>} [env]
 */
export function rollenPflicht(env = process.env) {
  return String(env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT || "").trim() === "1";
}

/**
 * Review-Auflage N4: Steht im Schalter etwas anderes als „1“ oder nichts (etwa „ja“, „true“, „an“), ist die Pflicht
 * AUS — vermutlich gegen die Absicht. Für den Umgebungsbericht (/api/einrichten/umgebung) als Warnung.
 * @param {Record<string, string|undefined>} [env]
 */
export function rollenPflichtUnerwartet(env = process.env) {
  const w = String(env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT || "").trim();
  return w !== "" && w !== "1";
}

/**
 * Eine Sitzung aus /api/demo (öffentlicher Demozugang ohne Code) in einem Demoraum. Für sie gilt die Pflicht nicht
 * (Review-Auflage, Restrisiko N1): Ein Demoraum enthält nur Beispieldaten, und der Demozugang hat keinen Code, an dem
 * ein Faktor hängen könnte. Beide Merkmale müssen stimmen — ein `demo`-Kennzeichen allein öffnet keinen echten Raum.
 * @param {any} s
 */
export const demoSitzung = (s) => !!s && s.demo === true && String(s.bestand || "").startsWith("demo-");

/**
 * Review-Auflagen M1/M2 (SI-P4): Darf diese Sitzung unter aktiver Pflicht weiterarbeiten?
 *
 * true heißt: NEIN — die Sitzung trägt Rechte einer Rolle mit zweitem Faktor (Rolle beim Anlegen ODER die jetzt
 * wirksame Rolle der Person), ist aber nicht mit bestandenem zweitem Faktor entstanden (`zweifaktor: true` fehlt).
 * Das trifft:
 *   - die Hochstufung nach der Anmeldung (M2: als Mitarbeiter angemeldet, danach Leitung),
 *   - Sitzungen aus der Zeit vor dem Einschalten der Pflicht,
 *   - Arbeitssitzungen aus einem Konto (Betriebsauswahl), die keinen zweiten Faktor kennen (M1).
 * Ausgenommen: Pflicht aus, Sicherungsschlüssel (eigene Prüfung, SI-P1), Betreiber (eigene Pflicht, WP-32d),
 * Demositzungen in Demoräumen (N1).
 * @param {any} s0           die Sitzung, wie sie angelegt wurde
 * @param {unknown} [rolleJetzt]  die wirksame Rolle dieser Anfrage, falls bekannt
 * @param {Record<string, string|undefined>} [env]
 */
export function rollenSitzungOhneFaktor(s0, rolleJetzt = null, env = process.env) {
  if (!rollenPflicht(env)) return false;
  if (!s0 || s0.nurSicherung || s0.rolle === "betreiber" || demoSitzung(s0)) return false;
  if (!zweifaktorRolle(s0.rolle) && !zweifaktorRolle(rolleJetzt)) return false;
  return s0.zweifaktor !== true;
}

/** Die id, unter der der zweite Faktor eines Leitungs-, Planungs- oder Kundencodes liegt. */
export const rollenZweifaktorId = (codeSchluessel) =>
  createHash("sha256").update(`rollen-code:${codeSchluessel}`).digest("hex");

/**
 * Review-Auflage N2: Vermerk am Zugang, dass für ihn ein zweiter Faktor eingerichtet ist (`zweiterFaktor: true`).
 *
 * Die Kennung des Faktors hängt am gepfefferten Ablageschlüssel des Codes. Fehlt der Pfeffer oder wurde er gewechselt,
 * zeigt dieselbe Rechnung auf eine andere Kennung — dort liegt kein Faktor, und die Anmeldung liefe ohne ihn durch.
 * Der Vermerk am Zugang hängt nicht am Pfeffer: Wer ihn trägt, aber dessen Faktor unter der jetzigen Kennung nicht
 * aktiv ist, bekommt 503 statt einer Sitzung. Gesetzt nach der Bestätigung, entfernt vor dem Abschalten — so führt
 * ein halber Vorgang nie zu einem Vermerk ohne Faktor.
 * @param {any} store
 * @param {Array<string|undefined>} schluessel  alle Ablageschlüssel des Zugangs (neu, gefunden, alt)
 * @param {boolean} an
 * @returns {Promise<boolean>} false, wenn ein vorhandener Eintrag nicht geschrieben werden konnte
 */
async function faktorVermerken(store, schluessel, an) {
  let ok = true;
  for (const s of new Set(schluessel.filter(Boolean))) {
    try {
      /* A-3 (Review 227f633e, Punkt 4; Betreibervorgabe 2026-11-13): merge-sicher am FRISCHEN Stand unter der Sperre
         dieses Kontos (konten.mjs, kontoAendern). Bis hierher wurde eine früher gelesene Kopie zurückgeschrieben — ein
         gleichzeitiger Vorgang (Erstanmeldung: Vormerkung/Bindung; Sperre) ging dabei verloren. */
      await kontoAendern(store, s, (e) => {
        if (!e) return e;
        /* OPT-1: Den Verbrauch eines Ersteinrichtungscodes schreibt ersteinrichtungEinloesen VOR der Aktivierung. */
        if (an) return e.zweiterFaktor === true ? e : { ...e, zweiterFaktor: true };
        if (e.zweiterFaktor === undefined) return e;
        const rest = { ...e };
        delete rest.zweiterFaktor;
        return rest;
      });
    } catch { ok = false; }
  }
  return ok;
}

/**
 * Darf dieser Zugang auf dem Gerät gemerkt werden („Zugang merken“)?
 * Betreiber: nie. Leitung, Planung, Kunde: nur mit aktivem zweiten Faktor.
 * Alle übergebenen Rollen zählen (Rolle des Codes UND wirksame Rolle der
 * Person) — eine davon genügt zum Nein. Keine Rolle: Nein.
 * @param {Array<unknown>} rollen
 * @param {boolean} zweifaktorAktiv
 */
export function merkenErlaubt(rollen, zweifaktorAktiv) {
  const r = (Array.isArray(rollen) ? rollen : []).filter((x) => x !== null && x !== undefined && x !== "");
  if (!r.length) return false;
  if (r.some((x) => x === "betreiber")) return false;
  if (r.some((x) => zweifaktorRolle(x))) return zweifaktorAktiv === true;
  return true;
}

/** Die beiden Arten von Zugangscode mit zweitem Faktor. */
const ART = {
  betreiber: { id: betreiberZweifaktorId, kurz: "b", etikett: "Betreiber", pflicht: betreiberPflicht,
    pflichtText: "Für Betreiberzugänge ist ein zweiter Faktor Pflicht." },
  rolle: { id: rollenZweifaktorId, kurz: "r", etikett: "Zugang", pflicht: rollenPflicht,
    pflichtText: "Für diesen Zugang ist ein zweiter Faktor Pflicht.", vermerk: true },
};

const json = (d, status = 200) => new Response(JSON.stringify(d), { status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const nichtPruefbar = () => json({ fehler: "Der zweite Faktor lässt sich gerade nicht prüfen. "
  + "Bitte später erneut versuchen." }, 503);

/**
 * Für einen bereits als gültig erkannten Betreibercode: Aktion ausführen oder
 * den zweiten Faktor der Anmeldung prüfen.
 *
 * `kontoSchluessel`: der Ablageschlüssel, unter dem der Code gefunden wurde
 * (bei Altcodes der alte) — so steht er als `konto` in seinen Sitzungen.
 * `altSchluessel`: der alte, ungepfefferte Schlüssel des Codes, IMMER —
 * auch wenn der Code längst umgeschlüsselt ist: Sitzungen aus der Zeit davor
 * tragen ihn noch (B-M1).
 *
 * @param {{store: any, k: string, rumpf: any, codeSchluessel: string, kontoSchluessel?: string,
 *   altSchluessel?: string, name: string}} a
 * @returns {Promise<{antwort?: Response, aktiv?: boolean}>}
 *   `antwort` gesetzt: genau diese zurückgeben, keine Sitzung anlegen.
 */
export const betreiberZweifaktor = (a) => codeZweifaktor({ ...a, art: ART.betreiber });

/**
 * Dasselbe für einen bereits als gültig erkannten Code der Rolle Leitung,
 * Planung oder Kunde (SI-P4). Parameter und Rückgabe wie betreiberZweifaktor.
 * @param {{store: any, k: string, rumpf: any, codeSchluessel: string, kontoSchluessel?: string,
 *   altSchluessel?: string, name: string, faktorVermerkt?: boolean, pflichtErzwungen?: boolean, ersteinrichtung?: boolean,
 *   verlustKontext?: any}} a
 * @returns {Promise<{antwort?: Response, aktiv?: boolean}>}
 */
export const rollenZweifaktor = (a) => codeZweifaktor({ ...a, art: ART.rolle });
/* `pflichtErzwungen` (OPT-1): Pflicht für genau diesen Zugang, unabhängig vom Schalter — Zugänge aus der
   Ersteinrichtung (zugangscode-ersteinrichtung.mjs). */

/**
 * @param {{store: any, k: string, rumpf: any, codeSchluessel: string, kontoSchluessel?: string,
 *   altSchluessel?: string, name: string, art: typeof ART.betreiber, faktorVermerkt?: boolean,
 *   pflichtErzwungen?: boolean, ersteinrichtung?: boolean, verlustKontext?: any}} a
 * @returns {Promise<{antwort?: Response, aktiv?: boolean}>}
 */
async function codeZweifaktor({ store, k, rumpf, codeSchluessel, kontoSchluessel, altSchluessel, name, art,
  faktorVermerkt = false, pflichtErzwungen = false, ersteinrichtung = false, verlustKontext = null }) {
  const id = art.id(codeSchluessel);
  const E = art.etikett;
  /* Review-Auflage N2: Ohne Pfeffer liegt der Faktor unter einer anderen Kennung (ungepfefferter Schlüssel) und lässt
     sich weder einrichten noch prüfen. Nie still mit dem alten Schlüssel weiter: Ist der Faktor für diesen Zugang
     vermerkt oder Pflicht, gibt es keine Sitzung (503). Ohne Vermerk und ohne Pflicht bleibt es beim Code allein —
     einen Faktor gibt es dann nicht und kann es nicht geben (Restrisiko, SI-P4-NACHWEIS). */
  const pfefferFehlt = () => json({ fehler: "Der zweite Faktor lässt sich auf diesem Server gerade nicht prüfen "
    + "(CENTRIC_PFEFFER fehlt oder wurde geändert). Bitte den Serverbetreiber verständigen.", zweifaktor: "pfeffer" }, 503);
  /* OPT-1: Ein Zugang aus der Ersteinrichtung (zugangscode-ersteinrichtung.mjs) trägt die Pflicht selbst — offen
     (`ersteinrichtung`) oder verbraucht (`faktorPflicht`). Für ihn gilt alles, was der Pflichtschalter bewirkt:
     keine Sitzung ohne Faktor, kein Überschreiben einer begonnenen Einrichtung, kein Abschalten über das Netz. */
  let pflicht = art.pflicht() || pflichtErzwungen === true;
  if (art.vermerk && !pfeffrig() && (faktorVermerkt || pflicht)) {
    await protokoll("zweifaktor", k, "fehler", `${E} · Pfeffer fehlt`);
    return { antwort: pfefferFehlt() };
  }
  /* B2: Wechselt der zweite Faktor (eingerichtet oder abgeschaltet), enden
     alle Sitzungen dieses Codes. Eine Sitzung, die vorher mit dem Code
     allein entstand — vielleicht auf einem fremden Gerät —, überlebt die
     Einrichtung sonst bis zu ihrer Frist. */
  const schluessel = new Set([codeSchluessel, kontoSchluessel, altSchluessel].filter(Boolean));
  /** Sitzungen dieses Codes beenden. { beendet, fehler } — fehler > 0 heißt: nicht alle. */
  const sitzungenBeenden = async () => {
    const r = await sitzungenBeendenWenn((sit) => schluessel.has(sit.konto));
    if (r.fehler) await protokoll("zweifaktor", k, "fehler", `${E} · ${r.fehler} Sitzungen nicht beendet`);
    return r;
  };
  const nichtAlleBeendet = (wann) => json({ fehler: `Bisherige Sitzungen dieses Zugangs ließen sich nicht `
    + `alle beenden — ${wann}. Bitte erneut versuchen.`, zweifaktor: "sitzungen" }, 503);
  /* Option: Pflicht für alle Betreibercodes (Vorgabe aus). Ohne
     eingerichteten zweiten Faktor gibt es dann nur die Aktionen, keine Sitzung
     (`pflicht` oben, einschließlich OPT-1). */
  const aktion = String((rumpf && rumpf.zweifaktorAktion) || "");
  const code = rumpf && rumpf.zweifaktor ? String(rumpf.zweifaktor) : "";
  const kennungen = [`${art.kurz}:${id.slice(0, 16)}`, k];

  let stand;
  try { stand = await zweifaktorStand(store, id); } catch { return { antwort: nichtPruefbar() }; }
  /* WR-3: Eine Einrichtung aus einem eingelösten Verlustfall (kontowiederherstellung.mjs) steht unter Pflicht —
     unabhängig vom Schalter: kein Überschreiben mit dem Code allein, keine Sitzung ohne bestätigten Code. */
  if (stand.ausVerlust) pflicht = true;
  /* N2: Vermerkt, aber unter der jetzigen Kennung kein aktiver Faktor — der Pfeffer wurde gewechselt (oder die
     Ablage des Faktors fehlt). Kein Durchlassen und auch kein Neueinrichten mit dem Code allein. Rückweg: neuer
     Zugangscode (der alte wird gesperrt). */
  if (art.vermerk && faktorVermerkt && !stand.aktiv && !stand.ausVerlust) {
    await protokoll("zweifaktor", k, "fehler", `${E} · vermerkt, aber nicht auffindbar`);
    return { antwort: pfefferFehlt() };
  }
  /* OPT-1 (H1): Ein offener Ersteinrichtungscode mit schon aktivem Faktor ist eingelöst (etwa eine gleichzeitige
     Anfrage, die den Zugang vor dem Verbrauch gelesen hat). Er gilt nicht mehr — dieselbe Antwort wie unbekannt. */
  const unbekannt = () => json({ fehler: "Unbekannter Zugangscode." }, 401);
  if (art.vermerk && ersteinrichtung && stand.aktiv) {
    await protokoll("zweifaktor", k, "abgewiesen", `${E} · Ersteinrichtung bereits eingelöst`);
    return { antwort: unbekannt() };
  }
  const zugangSchluessel = [kontoSchluessel, codeSchluessel, altSchluessel];

  /** Bremse für Code-Versuche — je Code und je Herkunft, fail-closed. */
  const bremsen = async () => {
    for (const kk of kennungen) {
      const b = await bremse("zweifaktor", kk);
      if (!b.frei) { await protokoll("zweifaktor", k, "gebremst", b.grund); return zuVielAntwort(b.wartet); }
      if (b.fehler && GRENZEN.zweifaktor.failClosed) return nichtPruefbar();
    }
    return null;
  };
  const entlastenAlle = async () => { for (const kk of kennungen) await entlasten("zweifaktor", kk); };
  /* Der Betreibercode selbst war richtig — der Anmeldeversuch zählt nicht
     gegen die Herkunft, auch wenn keine Sitzung entsteht. */
  const codeRichtig = async () => { await entlasten("anmelden", k); notentlasten("anmelden", k); };

  /** Code prüfen (TOTP oder Wiederherstellungscode, nie Nachweis). null = bestanden. */
  const pruefen = async () => {
    if (!code) {
      await protokoll("zweifaktor", k, "abgewiesen", `${E} · fehlt`);
      return json({ fehler: "Für diesen Zugang ist ein zweiter Faktor eingerichtet. "
        + "Bitte den Code aus der App eingeben.", zweifaktor: "erforderlich" }, 401);
    }
    const gebremst = await bremsen(); if (gebremst) return gebremst;
    const p = await zweifaktorPruefen(store, id, { code, nachweisErlaubt: false });
    if (!p.ok) {
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", `${E} · ${p.grund}`);
      return json({ fehler: p.grund === "wiederholt"
        ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
        : "Der zweite Faktor stimmt nicht.", zweifaktor: "falsch" }, 401);
    }
    await entlastenAlle();
    if (p.art === "wiederherstellung")
      await protokoll("zweifaktor", k, "erfolg", `${E} · Wiederherstellungscode verbraucht`);
    return null;
  };

  /* WR-3: Verlust-Schnittstelle (kontowiederherstellung-zugang.mjs). Ein laufender Fall sperrt Abschalten und
     Neugenerierung; eine Anmeldung mit gültigem Code aus der App zieht ihn zurück (KONTO-WIEDERHERSTELLUNG.md, E). */
  let verlustLaufend = null;
  if (art.vermerk) {
    try { verlustLaufend = await laufenderFall(store, id); } catch { return { antwort: nichtPruefbar() }; }
  }
  const verlustOffen = () => json({ fehler: "Für diesen Zugang läuft ein Verlustfall. Anmelden geht nur mit dem Code "
    + "aus der App (das zieht den Fall zurück) oder nach Freigabe und Einlösen.", zweifaktor: "verlust-offen" }, 409);
  if (VERLUST_AKTIONEN.includes(aktion)) {
    return { antwort: await verlustAktion({ store, k, rumpf, aktion, id, vermerk: art.vermerk === true, stand,
      kontext: verlustKontext ? { ...verlustKontext, codeSchluessel, kontoSchluessel } : null, name,
      sitzungenBeenden, codeRichtig, faktorIdFuer: art.id }) };
  }

  if (aktion === "beginnen") {
    /* WR-3: Eine (auch abgelaufene) Einrichtung aus einem Verlustfall überschreibt der Code allein nie. */
    if (stand.ausVerlust && !stand.aktiv) {
      await protokoll("zweifaktor", k, "warnung", `${E} · Überschreiben einer Einrichtung aus einem Verlustfall verweigert`);
      return { antwort: json({ fehler: "Diese Einrichtung stammt aus einem Verlustfall. Bitte mit dem Geheimnis bestätigen "
        + "oder einen neuen Fall eröffnen.", zweifaktor: "ausstehend" }, 409) };
    }
    if (stand.aktiv) return { antwort: json({ fehler: "Der zweite Faktor ist schon eingerichtet. "
      + "Zum Neueinrichten erst abschalten." }, 409) };
    /* Eine laufende Einrichtung zu überschreiben ist ein Eingriff in fremde
       Absicht (jemand anderes mit dem Code richtet gerade ein): gebremst
       und protokolliert (B-N2). */
    if (stand.ausstehend && pflicht) {
      /* WP-32d: Unter Pflicht darf der Code allein eine begonnene Einrichtung nicht
         überschreiben — sonst könnte ein Dieb des Codes die Einrichtung des
         Betreibers durch seine eigene ersetzen. Eine abgebrochene Einrichtung
         setzt der Serverbetreiber offline zurück
         (werkzeug/betreiber-2fa-zuruecksetzen.mjs). */
      await protokoll("zweifaktor", k, "warnung", `${E} · Überschreiben einer begonnenen Einrichtung verweigert (seit ${stand.ausstehendSeitMin} min)`);
      return { antwort: json({ fehler: "Eine Einrichtung ist bereits begonnen. Bitte mit dem Geheimnis "
        + "bestätigen oder durch den Serverbetreiber zurücksetzen lassen.", zweifaktor: "ausstehend" }, 409) };
    }
    if (stand.ausstehend) {
      const gebremst = await bremsen(); if (gebremst) return { antwort: gebremst };
      await protokoll("zweifaktor", k, "warnung", `${E} · laufende Einrichtung überschrieben`);
    }
    const erg = await zweifaktorBeginnen(store, id, name || E);
    if (erg.fehler === "pfeffer") return { antwort: json({ fehler: "Der zweite Faktor lässt sich auf "
      + "diesem Server nicht einrichten (CENTRIC_PFEFFER fehlt)." }, 503) };
    if (erg.fehler) return { antwort: json({ fehler: "Der zweite Faktor ist schon eingerichtet." }, 409) };
    await codeRichtig();
    await protokoll("zweifaktor", k, "erfolg", `${E} · Einrichtung begonnen`);
    return { antwort: json({ ok: true, geheimnis: erg.geheimnis, otpauth: erg.otpauth,
      hinweis: "Geheimnis und Adresse erscheinen genau einmal. In der App erfassen und mit dem "
        + "ersten Code bestätigen." }) };
  }

  if (aktion === "bestaetigen") {
    if (stand.aktiv) return { antwort: json({ fehler: "Der zweite Faktor ist schon eingerichtet." }, 409) };
    if (!stand.ausstehend) return { antwort: json({ fehler: "Es ist keine Einrichtung begonnen." }, 409) };
    if (!code) return { antwort: json({ fehler: "Bitte den ersten Code aus der App angeben." }, 400) };
    const gebremst = await bremsen(); if (gebremst) return { antwort: gebremst };
    /* Reihenfolge (Nachprüfung): 1. Code prüfen, ohne zu speichern — ein
       falscher Code beendet keine Sitzung. 2. Die bisherigen Sitzungen
       beenden; gelingt das nicht vollständig, wird nicht aktiviert
       (fail-closed, B-M2). 3. Aktivieren (prüft erneut und speichert). */
    const vor = await zweifaktorBestaetigenVorpruefen(store, id, code);
    if (vor.fehler === "pfeffer") return { antwort: nichtPruefbar() };
    if (!vor.ok) {
      /* OPT-1 (M1): Ein falscher Wert aus der App zählt am Ersteinrichtungscode — in der Ablage, nicht im
         Arbeitsspeicher. Nach ERSTEINRICHTUNG_FEHLVERSUCHE ist der Code endgültig verbraucht. */
      if (art.vermerk && ersteinrichtung && vor.fehler === "code") {
        let fv;
        try { fv = await ersteinrichtungFehlversuch(store, zugangSchluessel); } catch { return { antwort: nichtPruefbar() }; }
        if (fv.gesperrt && !fv.schonVerbraucht) {
          /* Nur die begonnene Einrichtung verwerfen — nie einen aktiven Faktor (Review PR #179): frisch unter der
             Sperre des Faktors geprüft; aktiv oder unlesbar: nichts gelöscht. */
          await zweifaktorEinrichtungVerwerfen(store, id).catch(() => ({ ok: false }));
          await protokoll("zweifaktor", k, "warnung", `${E} · Ersteinrichtung nach ${fv.fehlversuche} Fehlversuchen gesperrt`);
        }
      }
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", `${E} · Bestätigung`);
      return { antwort: json({ fehler: "Der Code stimmt nicht.", zweifaktor: "falsch" }, 401) };
    }
    const vorher = await sitzungenBeenden();
    if (vorher.fehler) return { antwort: nichtAlleBeendet("der zweite Faktor wurde NICHT aktiviert") };
    /** @type {any} */
    let erg;
    if (art.vermerk && ersteinrichtung) {
      /* OPT-1 (H1): Verbrauch und Einrichtung als Einheit — erst verbrauchen, dann aktivieren, je Zugang nacheinander.
         Scheitert der Verbrauch, wird nichts aktiviert; scheitert die Aktivierung, bleibt der Code verbraucht. */
      const ein = await ersteinrichtungEinloesen(store, zugangSchluessel, async () => {
        const r = await zweifaktorBestaetigen(store, id, code);
        return r.fehler ? { ok: false, fehler: r.fehler } : { ...r, ok: true };
        /* Blocker 4 (Review #166): Nur wenn der Faktor nachweislich nicht aktiv ist, wird der Verbrauch zurückgenommen.
           OPT-1-F: Dieser Zweig ist von funktionen/daten.mjs aus nicht mehr erreichbar (Ersteinrichtungscodes gelten
           dort nie); er bleibt fail-closed für jeden anderen Aufrufer. */
      }, { istAktiv: async () => (await zweifaktorStand(store, id)).aktiv === true });
      if (!ein.ok && ein.grund === "verbraucht") {
        await protokoll("zweifaktor", k, "abgewiesen", `${E} · Ersteinrichtung bereits eingelöst`);
        return { antwort: unbekannt() };
      }
      if (!ein.ok && ein.grund !== "einrichtung") return { antwort: nichtPruefbar() };
      erg = ein.ok ? ein.ergebnis : { fehler: (ein.ergebnis && ein.ergebnis.fehler) || "einrichtung" };
      if (!ein.ok) await protokoll("zweifaktor", k, "fehler", `${E} · Ersteinrichtung verbraucht, Einrichtung gescheitert`);
    } else {
      erg = await zweifaktorBestaetigen(store, id, code);
    }
    if (erg.fehler === "pfeffer" || erg.fehler === "epoche") return { antwort: nichtPruefbar() };
    if (erg.fehler) {
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", `${E} · Bestätigung`);
      return { antwort: json({ fehler: "Der Code stimmt nicht.", zweifaktor: "falsch" }, 401) };
    }
    await entlastenAlle();
    await codeRichtig();
    /* N2: Vermerk am Zugang, erst nach der Aktivierung. Scheitert er, gilt der Faktor trotzdem — es fehlt nur der
       Schutz gegen einen später fehlenden oder gewechselten Pfeffer; das wird gemeldet und protokolliert. */
    const vermerkt = art.vermerk ? await faktorVermerken(store, [kontoSchluessel, codeSchluessel, altSchluessel], true) : true;
    if (!vermerkt) await protokoll("zweifaktor", k, "fehler", `${E} · Vermerk am Zugang nicht geschrieben`);
    /* Zweiter Durchgang: eine Sitzung, die zwischen dem ersten und der
       Aktivierung mit dem Code allein entstand. */
    const danach = await sitzungenBeenden();
    const beendet = vorher.beendet + danach.beendet;
    await protokoll("zweifaktor", k, "erfolg", `${E} · eingerichtet · ${beendet} Sitzungen beendet`);
    return { antwort: json({ ok: true, aktiv: true, sitzungenBeendet: beendet,
      ...(danach.fehler ? { warnung: "Eine eben entstandene Sitzung ließ sich nicht beenden; sie endet spätestens nach zwei Stunden." } : {}),
      ...(vermerkt ? {} : { vermerk: false }),
      wiederherstellung: erg.wiederherstellung,
      hinweis: "Die Wiederherstellungscodes erscheinen genau einmal. Jeder gilt einmal." }) };
  }

  if (aktion === "abschalten") {
    if (!stand.aktiv) return { antwort: json({ fehler: "Es ist kein zweiter Faktor eingerichtet." }, 409) };
    if (verlustLaufend) return { antwort: verlustOffen() };
    /* WP-32d (Review 2): Unter Pflicht gibt es kein Abschalten über den Netzweg. Wer Code und einen abgefangenen
       Code der App hat, würde sonst abschalten, ein eigenes Gerät einrichten und den Betreiber aussperren.
       Gerätewechsel und Verlust: offline (werkzeug/betreiber-2fa-zuruecksetzen.mjs). */
    if (pflicht) {
      await protokoll("zweifaktor", k, "warnung", `${E} · Abschalten unter Pflicht verweigert`);
      return { antwort: json({ fehler: "Unter Pflicht lässt sich der zweite Faktor nicht über das Netz abschalten. "
        + "Gerätewechsel oder Verlust: der Serverbetreiber setzt ihn offline zurück.", zweifaktor: "pflicht" }, 409) };
    }
    const r = await pruefen(); if (r) return { antwort: r };
    /* B-M2: erst Sitzungen beenden; scheitert das, bleibt der Faktor. */
    const vorher = await sitzungenBeenden();
    if (vorher.fehler) return { antwort: nichtAlleBeendet("der zweite Faktor bleibt eingerichtet") };
    /* N2: Vermerk VOR dem Abschalten entfernen. Scheitert das, bleibt der Faktor (sonst stünde ein Vermerk ohne
       Faktor da, und der Zugang bekäme nur noch 503). */
    if (art.vermerk && !(await faktorVermerken(store, [kontoSchluessel, codeSchluessel, altSchluessel], false)))
      return { antwort: nichtPruefbar() };
    try { await zweifaktorAbschalten(store, id); }
    catch { return { antwort: nichtPruefbar() }; }
    await codeRichtig();
    await protokoll("zweifaktor", k, "erfolg", `${E} · abgeschaltet · ${vorher.beendet} Sitzungen beendet`);
    return { antwort: json({ ok: true, aktiv: false, sitzungenBeendet: vorher.beendet }) };
  }

  /* WR-2: Neue Wiederherstellungscodes — nur nach vollständiger, frischer Authentifizierung: der Zugangscode (vom
     Aufrufer geprüft, erster Faktor) UND ein frischer Code aus der App. Kein Wiederherstellungscode, kein Nachweis
     (Entscheidungen 8 und 9). Gebremst mit demselben Zähler wie die Anmeldung. Prüfen, Erzeugen und Ersetzen unter
     einer Sperre (zweifaktor.mjs); danach gilt keiner der bisherigen Codes. Auch unter Pflicht erlaubt: Der Faktor
     bleibt, wie er ist, nur der Satz Codes wird ersetzt. */
  if (aktion === "wiederherstellung-neu") {
    if (!stand.aktiv) return { antwort: json({ fehler: "Es ist kein zweiter Faktor eingerichtet." }, 409) };
    if (verlustLaufend) return { antwort: verlustOffen() };
    if (!code) return { antwort: json({ fehler: "Bitte den aktuellen Code aus der App angeben.",
      zweifaktor: "erforderlich" }, 401) };
    const gebremst = await bremsen(); if (gebremst) return { antwort: gebremst };
    if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) {
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", `${E} · Neugenerierung ohne Code aus der App`);
      return { antwort: json({ fehler: "Neue Wiederherstellungscodes gibt es nur mit dem aktuellen Code aus der App, "
        + "nicht mit einem Wiederherstellungscode.", zweifaktor: "falsch" }, 401) };
    }
    let r;
    try { r = await wiederherstellungNeu(store, id, code); } catch { return { antwort: nichtPruefbar() }; }
    if (!r.ok && (r.fehler === "pfeffer" || r.fehler === "epoche")) return { antwort: nichtPruefbar() };
    if (!r.ok) {
      await new Promise((res) => setTimeout(res, 400));
      await protokoll("zweifaktor", k, "abgewiesen", `${E} · Neugenerierung · ${r.fehler}`);
      return { antwort: json({ fehler: r.fehler === "wiederholt"
        ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
        : "Der zweite Faktor stimmt nicht.", zweifaktor: "falsch" }, 401) };
    }
    await entlastenAlle();
    await codeRichtig();
    await protokoll("zweifaktor", k, "erfolg", `${E} · Wiederherstellungscodes neu erzeugt`);
    return { antwort: json({ ok: true, wiederherstellung: r.wiederherstellung,
      hinweis: "Neue Wiederherstellungscodes. Sie erscheinen genau einmal; jeder gilt einmal. Alle bisherigen "
        + "Wiederherstellungscodes gelten nicht mehr." }) };
  }

  if (aktion === "stand") {
    await codeRichtig();
    return { antwort: json({ aktiv: stand.aktiv, ausstehend: stand.ausstehend,
      wiederherstellungUebrig: stand.aktiv ? stand.wiederherstellungUebrig : 0, pflicht }) };
  }

  if (aktion) return { antwort: json({ fehler: "Unbekannte Aktion. Erlaubt: stand, beginnen, "
    + "bestaetigen, abschalten, wiederherstellung-neu, verlust-melden, verlust-zurueckziehen, verlust-freigeben, "
    + "verlust-ablehnen, verlust-einloesen." }, 400) };

  /* Gewöhnliche Anmeldung. */
  if (stand.aktiv) {
    /* WR-3: Bei laufendem Fall gilt nur der Code aus der App (er zieht den Fall zurück). Ein Wiederherstellungscode
       wird dann gar nicht erst geprüft — und also nicht verbraucht. */
    if (verlustLaufend && code && !/^\d{6}$/.test(code.replace(/\s/g, ""))) {
      await protokoll("zweifaktor", k, "abgewiesen", `${E} · Verlustfall offen, Wiederherstellungscode abgewiesen`);
      return { antwort: verlustOffen() };
    }
    const r = await pruefen(); if (r) return { antwort: r };
    if (verlustLaufend) {
      try { await fallZurueckziehen(store, { traegerId: id }); } catch { return { antwort: nichtPruefbar() }; }
      await protokoll("zweifaktor", k, "warnung", `${E} · Verlustfall ${verlustLaufend.fall} durch Anmeldung mit Code aus der App zurückgezogen`);
    }
  }
  else if (pflicht) {
    await codeRichtig();      // der Code war richtig; die Einrichtung ist der nächste Schritt, kein Rateversuch
    await protokoll("zweifaktor", k, "abgewiesen", `${E} · Pflicht, nicht eingerichtet`);
    return { antwort: json({ fehler: `${art.pflichtText} Bitte zuerst `
      + "einrichten (zweifaktorAktion: beginnen, dann bestaetigen).", zweifaktor: "einrichten" }, 403) };
  }
  return { aktiv: stand.aktiv };
}

/**
 * Frischer zweiter Faktor für eine sicherheitskritische Betreiberaktion (SI-P6).
 *
 * Gedacht für Aktionen mit einer BESTEHENDEN Betreibersitzung, die nicht wiederholbar sein dürfen, nur weil jemand
 * das Sitzungsmerkmal abgegriffen hat (z. B. dauerhafte Zugangscodes prägen). Verlangt wird der Code aus der App
 * (oder ein Wiederherstellungscode) im Rumpf der Aktion — nie ein Nachweis, nie ein Code, der schon verbraucht ist
 * (die Anmeldung selbst verbraucht ihren Schritt). Der Faktor liegt unter der Kennung des Betreibercodes, den die
 * Sitzung trägt (`konto`), also derselben wie bei der Anmeldung.
 *
 * - Faktor eingerichtet: Code Pflicht, gebremst je Code und je Herkunft (GRENZEN.zweifaktor, fail-closed).
 * - Kein Faktor, Pflicht (Auslieferung): 403, nichts darf geschehen. Eine solche Sitzung dürfte es nicht geben
 *   (sie endet beim Start und bei der Einrichtung); wer sie trotzdem hat, richtet zuerst den Faktor ein.
 * - Kein Faktor, keine Pflicht (Entwicklung, Prüfungen): die Aktion läuft ohne Code, wie die Anmeldung auch.
 * - Sitzung ohne Kontoschlüssel oder Ablage nicht lesbar: kein Ja (403 bzw. 503).
 *
 * @param {{store: any, k: string, sitzung: any, code?: unknown}} a
 * @returns {Promise<{antwort?: Response, aktiv?: boolean}>}
 *   `antwort` gesetzt: genau diese zurückgeben, nichts ausführen.
 */
export async function betreiberFaktorFrisch({ store, k, sitzung, code }) {
  const konto = String((sitzung && sitzung.konto) || "");
  if (!konto) {
    await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · Sitzung ohne Kontoschlüssel");
    return { antwort: json({ fehler: "Bitte neu anmelden.", neuAnmelden: true }, 403) };
  }
  /* Der Faktor liegt unter der Kennung des NEUEN Schlüssels. Trägt die Sitzung noch den alten (Anmeldung vor der
     Umschlüsselung), verweist das Altkonto mit `ersetztDurch` auf den neuen: dieser Kette folgen (höchstens vier
     Schritte, ohne Schleife), sonst hielte die Prüfung einen eingerichteten Faktor für „keinen“. Ist ein Konto in der
     Kette nicht lesbar, ist das keine Entscheidung für „kein Faktor“ (503). */
  const kette = [konto];
  try {
    let akt = konto;
    for (let i = 0; i < 4; i++) {
      const e = await kontoLesen(store, akt);
      if (!e || typeof e.ersetztDurch !== "string" || !e.ersetztDurch || kette.includes(e.ersetztDurch)) break;
      akt = e.ersetztDurch; kette.push(akt);
    }
  } catch { return { antwort: nichtPruefbar() }; }
  let id = betreiberZweifaktorId(konto);
  let stand = null;
  try {
    for (const schl of kette) {
      const kid = betreiberZweifaktorId(schl);
      const st = await zweifaktorStand(store, kid);
      if (stand === null || st.aktiv) { stand = st; id = kid; }
      if (st.aktiv) break;
    }
  } catch { return { antwort: nichtPruefbar() }; }
  if (!stand.aktiv) {
    if (betreiberPflicht()) {
      await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · Pflicht, nicht eingerichtet (frischer Code)");
      return { antwort: json({ fehler: "Für Betreiberzugänge ist ein zweiter Faktor Pflicht. Bitte zuerst "
        + "einrichten (Anmeldung mit zweifaktorAktion: beginnen, dann bestaetigen).", zweifaktor: "einrichten" }, 403) };
    }
    return { aktiv: false };
  }
  const eingabe = typeof code === "string" ? code.trim() : "";
  if (!eingabe) {
    await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · frischer Code fehlt");
    return { antwort: json({ fehler: "Dafür ist ein frischer Code aus der App nötig.", zweifaktor: "erforderlich" }, 401) };
  }
  /* Eigener Zähler (`bf:`), nicht der der Anmeldung (`b:`): Wer nur eine abgegriffene Sitzung hat, kann sonst durch
     falsche Codes die Anmeldung des echten Betreibers sperren. */
  const kennungen = [`bf:${id.slice(0, 16)}`, k];
  for (const kk of kennungen) {
    const b = await bremse("zweifaktor", kk);
    if (!b.frei) { await protokoll("zweifaktor", k, "gebremst", b.grund); return { antwort: zuVielAntwort(b.wartet) }; }
    if (b.fehler && GRENZEN.zweifaktor.failClosed) return { antwort: nichtPruefbar() };
  }
  const p = await zweifaktorPruefen(store, id, { code: eingabe, nachweisErlaubt: false });
  if (!p.ok) {
    await new Promise((r) => setTimeout(r, 400));
    await protokoll("zweifaktor", k, "abgewiesen", `Betreiber · frischer Code · ${p.grund}`);
    return { antwort: json({ fehler: p.grund === "wiederholt"
      ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
      : "Der zweite Faktor stimmt nicht.", zweifaktor: "falsch" }, 401) };
  }
  for (const kk of kennungen) await entlasten("zweifaktor", kk);
  if (p.art === "wiederherstellung")
    await protokoll("zweifaktor", k, "erfolg", "Betreiber · Wiederherstellungscode verbraucht (frischer Code)");
  return { aktiv: true };
}

/**
 * D-N2 (WP-18, Sicherheitsreview N-2): Ist für den Zugangscode dieser Sitzung ein zweiter Faktor eingerichtet?
 * Gesucht wird wie in rollenFaktorFrisch (entlang `ersetztDurch`). Zusätzlich zählt der Vermerk `zweiterFaktor: true`
 * am Zugang (Review-Auflage N2 oben): Er hängt nicht am Pfeffer — wer ihn trägt, gilt als „eingerichtet", auch wenn
 * der Faktor unter der jetzigen Kennung nicht zu finden ist (fail-closed: dann scheitert die Prüfung des Codes).
 * Sitzung ohne Zugangscode: false. Ein Lesefehler wirft (der Aufrufer antwortet 503).
 * @param {{store: any, sitzung: any}} a
 * @returns {Promise<boolean>}
 */
export async function rollenFaktorEingerichtet({ store, sitzung }) {
  const konto = String((sitzung && sitzung.konto) || "");
  if (!konto) return false;
  const kette = [konto];
  let akt = konto;
  for (let i = 0; i < 4; i++) {
    const e = await kontoLesenStreng(store, akt);
    if (e && e.zweiterFaktor === true) return true;
    if (!e || typeof e.ersetztDurch !== "string" || !e.ersetztDurch || kette.includes(e.ersetztDurch)) break;
    akt = e.ersetztDurch; kette.push(akt);
  }
  for (const schl of kette) if ((await zweifaktorStand(store, rollenZweifaktorId(schl))).aktiv) return true;
  return false;
}

/**
 * Frischer zweiter Faktor für eine sicherheitskritische Aktion einer Leitungs-, Planungs- oder Kundensitzung
 * (WP-18: Einladung ausstellen). Dasselbe Verfahren wie betreiberFaktorFrisch, nur für Codes der ZWEIFAKTOR_ROLLEN
 * (Kennung rollenZweifaktorId) und ohne fertige Antwort: der Aufrufer entscheidet den Status (403 statt 401 —
 * die Sitzung ist gültig, nur die Bestätigung fehlt).
 *
 * - Sitzung ohne Zugangscode (`konto`): kein Faktor prüfbar → nein (403).
 * - Kein aktiver Faktor unter dem Code (auch entlang `ersetztDurch`): nein (403).
 * - Code fehlt oder falsch: nein (403), gebremst je Faktor und Herkunft (eigener Zähler `rf:`).
 * - Ablage nicht lesbar: 503. Nie ein Ja im Zweifel.
 * Ein Code aus der App gilt höchstens dreißig Sekunden (± ein Schritt) und nur einmal (zweifaktorPruefen) — damit
 * ist die Bestätigung immer jünger als die fünf Minuten, die WP-18 verlangt.
 *
 * @param {{store: any, k: string, sitzung: any, code?: unknown}} a
 * @returns {Promise<{ok: true}|{ok: false, status: number, fehler: string, grund: string, wartet?: number}>}
 */
export async function rollenFaktorFrisch({ store, k, sitzung, code }) {
  const nein = (status, fehler, grund) => ({ ok: false, status, fehler, grund });
  const nichtPruefbarT = "Der zweite Faktor lässt sich gerade nicht prüfen. Bitte später erneut versuchen.";
  const konto = String((sitzung && sitzung.konto) || "");
  if (!konto) return nein(403, "Für diesen Schritt ist ein Code aus der App nötig; dieser Zugang hat keinen.", "ohne konto");
  const kette = [konto];
  try {
    let akt = konto;
    for (let i = 0; i < 4; i++) {
      const e = await kontoLesenStreng(store, akt);
      if (!e || typeof e.ersetztDurch !== "string" || !e.ersetztDurch || kette.includes(e.ersetztDurch)) break;
      akt = e.ersetztDurch; kette.push(akt);
    }
  } catch { return nein(503, nichtPruefbarT, "konto nicht lesbar"); }
  let id = null;
  try {
    for (const schl of kette) {
      const kid = rollenZweifaktorId(schl);
      if ((await zweifaktorStand(store, kid)).aktiv) { id = kid; break; }
    }
  } catch { return nein(503, nichtPruefbarT, "faktor nicht lesbar"); }
  if (!id) return nein(403, "Für diesen Zugang ist kein zweiter Faktor eingerichtet. Bitte zuerst einrichten.", "kein faktor");
  const eingabe = typeof code === "string" ? code.trim() : "";
  if (!eingabe) return nein(403, "Bitte den aktuellen Code aus der App eingeben.", "faktor fehlt");
  for (const kk of [`rf:${id.slice(0, 16)}`, k]) {
    const b = await bremse("zweifaktor", kk);
    if (!b.frei) return { ...nein(429, "Zu viele Versuche. Bitte später erneut versuchen.", "gebremst"), wartet: b.wartet };
    if (b.fehler && GRENZEN.zweifaktor.failClosed) return nein(503, nichtPruefbarT, "bremse nicht lesbar");
  }
  const p = await zweifaktorPruefen(store, id, { code: eingabe, nachweisErlaubt: false });
  if (!p.ok) {
    await new Promise((r) => setTimeout(r, 400));
    await protokoll("zweifaktor", k, "abgewiesen", `Zugang · frischer Code · ${p.grund}`);
    return nein(403, p.grund === "wiederholt" ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
      : "Der zweite Faktor stimmt nicht.", `faktor ${p.grund}`);
  }
  for (const kk of [`rf:${id.slice(0, 16)}`, k]) await entlasten("zweifaktor", kk);
  if (p.art === "wiederherstellung")
    await protokoll("zweifaktor", k, "erfolg", "Zugang · Wiederherstellungscode verbraucht (frischer Code)");
  return { ok: true };
}

/**
 * Offline-Wiederherstellung (WP-32d): Der Betreiber hat Authenticator UND
 * Wiederherstellungscodes verloren. Läuft nur auf dem Server selbst, durch
 * werkzeug/betreiber-2fa-zuruecksetzen.mjs — es gibt keinen
 * Netzweg dorthin und keine Vorgabe, die man erraten könnte.
 *
 * Voraussetzungen (alle fail-closed):
 *  - der Betreibercode selbst (der erste Faktor), kein Ersatz dafür;
 *  - der Code gehört zu einem Konto der Rolle „betreiber";
 *  - CENTRIC_PFEFFER ist gesetzt (sonst lässt sich nichts neu einrichten).
 * Wirkung: alle Sitzungen des Codes enden, der alte Faktor samt Nachweisen und
 * Wiederherstellungscodes wird gelöscht, und es beginnt SOFORT eine neue
 * Einrichtung, deren Geheimnis nur hier zurückgegeben wird. Damit steht der
 * Code nie in einem Zustand „kein Faktor, Einrichtung frei“, in dem ein
 * Dieb des Codes sein eigenes Gerät einrichten könnte (unter Pflicht ist das
 * Überschreiben einer ausstehenden Einrichtung verweigert). Es entsteht kein
 * neues Geheimnis außer dem frisch gewürfelten TOTP-Geheimnis.
 *
 * @param {{store: any, code: string}} a
 * @returns {Promise<{ok: true, geheimnis: string, otpauth: string, sitzungenBeendet: number}
 *   | {ok: false, grund: string}>}
 */
export async function betreiberZweifaktorZuruecksetzen({ store, code }) {
  const c = String(code || "").trim();
  if (!c) return { ok: false, grund: "Betreibercode fehlt" };
  if (!zweifaktorMoeglich()) return { ok: false, grund: "CENTRIC_PFEFFER ist nicht gesetzt" };
  const neuS = ablageSchluessel(c);
  const altS = altHash(c);
  let eintrag = null, fundS = null;
  try {
    eintrag = await kontoLesen(store, neuS); if (eintrag) fundS = neuS;
    if (!eintrag && altS !== neuS) { eintrag = await kontoLesen(store, altS); if (eintrag) fundS = altS; }
  } catch { return { ok: false, grund: "Konten nicht lesbar" }; }
  if (!eintrag || eintrag.gesperrt) return { ok: false, grund: "Kein gültiger Betreibercode" };
  if (eintrag.rolle !== "betreiber") return { ok: false, grund: "Kein gültiger Betreibercode" };
  const id = betreiberZweifaktorId(neuS);
  const schluessel = new Set([neuS, fundS, altS].filter(Boolean));
  const sit = await sitzungenBeendenWenn((s) => schluessel.has(s.konto));
  if (sit.fehler) return { ok: false, grund: "Bisherige Sitzungen ließen sich nicht alle beenden" };
  await zweifaktorAbschalten(store, id);
  const erg = await zweifaktorBeginnen(store, id, eintrag.name || "Betreiber");
  if (erg.fehler) return { ok: false, grund: "Einrichtung ließ sich nicht beginnen" };
  const nach = await sitzungenBeendenWenn((s) => schluessel.has(s.konto));
  await protokoll("zweifaktor", "offline", "warnung",
    `Betreiber · offline zurückgesetzt · ${sit.beendet + nach.beendet} Sitzungen beendet`);
  return { ok: true, geheimnis: erg.geheimnis, otpauth: erg.otpauth, sitzungenBeendet: sit.beendet + nach.beendet };
}

/**
 * Beim Start in der Auslieferung (Review 4): Betreibersitzungen, deren Code keinen aktiven zweiten Faktor hat,
 * stammen aus der Zeit vor der Pflicht (oder aus einem Umweg) und enden — sonst liefen sie bis zu zwei Stunden
 * weiter. Außerhalb der Pflicht geschieht nichts. Ein Lesefehler beendet die Sitzung (fail-closed).
 * Die Faktor-Kennung folgt dem Schlüssel des Codes in der Sitzung (`konto`); trägt sie noch den alten
 * Schlüssel, endet die Sitzung ebenfalls — der Betreiber meldet sich dann einmal neu an.
 * @returns {Promise<{geprueft: number, beendet: number, fehler: number}>}
 */
export async function betreiberSitzungenOhneFaktorBeenden(store, env = process.env) {
  if (!betreiberPflicht(env)) return { geprueft: 0, beendet: 0, fehler: 0 };
  const konten = new Set();
  let geprueft = 0;
  const l = await sitzungenBeendenWenn((sit) => {
    if (sit && sit.rolle === "betreiber") { geprueft += 1; konten.add(String(sit.konto || "")); }
    return false;
  });
  const ohne = new Set();
  for (const konto of konten) {
    let aktiv = false;
    try { aktiv = konto !== "" && (await zweifaktorStand(store, betreiberZweifaktorId(konto))).aktiv; } catch { aktiv = false; }
    if (!aktiv) ohne.add(konto);
  }
  if (!ohne.size) return { geprueft, beendet: 0, fehler: l.fehler };
  const r = await sitzungenBeendenWenn((sit) => !!sit && sit.rolle === "betreiber" && ohne.has(String(sit.konto || "")));
  return { geprueft, beendet: r.beendet, fehler: l.fehler + r.fehler };
}

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
import { istProduktion } from "./umgebung.mjs";
import { ablageSchluessel, altHash } from "./codes.mjs";
import { kontoLesen } from "./konten.mjs";
import { sitzungenBeendenWenn } from "./sitzungen.mjs";
import { bremse, entlasten, notentlasten, protokoll, zuVielAntwort, GRENZEN } from "./schutz.mjs";
import { zweifaktorStand, zweifaktorBeginnen, zweifaktorBestaetigen, zweifaktorBestaetigenVorpruefen,
  zweifaktorPruefen,
  zweifaktorAbschalten, zweifaktorMoeglich } from "./zweifaktor.mjs";

/**
 * Ist der zweite Faktor für Betreibercodes Pflicht? (WP-32d)
 *
 * Ja, sobald der Server in der Auslieferung läuft (NODE_ENV=production, im
 * Docker-Image gesetzt) ODER CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1 gesetzt ist.
 * Es gibt bewusst KEINEN Schalter, der die Pflicht in der Auslieferung
 * abstellt: „0“, „aus“, leer — nichts davon ändert dort etwas (fail-closed).
 * Wer ohne Pflicht arbeiten will (Entwicklung, Prüfungen), startet nicht als
 * production. Wird bei jedem Aufruf gelesen, nicht beim Laden des Moduls.
 * @param {Record<string, string|undefined>} [env]
 */
export function betreiberPflicht(env = process.env) {
  if (istProduktion(env)) return true;
  return String(env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT || "").trim() === "1";
}

/** Die id, unter der der zweite Faktor eines Betreibercodes liegt. */
export const betreiberZweifaktorId = (codeSchluessel) =>
  createHash("sha256").update(`betreiber-code:${codeSchluessel}`).digest("hex");

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
export async function betreiberZweifaktor({ store, k, rumpf, codeSchluessel, kontoSchluessel, altSchluessel, name }) {
  const id = betreiberZweifaktorId(codeSchluessel);
  /* B2: Wechselt der zweite Faktor (eingerichtet oder abgeschaltet), enden
     alle Sitzungen dieses Codes. Eine Sitzung, die vorher mit dem Code
     allein entstand — vielleicht auf einem fremden Gerät —, überlebt die
     Einrichtung sonst bis zu ihrer Frist. */
  const schluessel = new Set([codeSchluessel, kontoSchluessel, altSchluessel].filter(Boolean));
  /** Sitzungen dieses Codes beenden. { beendet, fehler } — fehler > 0 heißt: nicht alle. */
  const sitzungenBeenden = async () => {
    const r = await sitzungenBeendenWenn((sit) => schluessel.has(sit.konto));
    if (r.fehler) await protokoll("zweifaktor", k, "fehler", `Betreiber · ${r.fehler} Sitzungen nicht beendet`);
    return r;
  };
  const nichtAlleBeendet = (wann) => json({ fehler: `Bisherige Sitzungen dieses Zugangs ließen sich nicht `
    + `alle beenden — ${wann}. Bitte erneut versuchen.`, zweifaktor: "sitzungen" }, 503);
  /* Option: Pflicht für alle Betreibercodes (Vorgabe aus). Ohne
     eingerichteten zweiten Faktor gibt es dann nur die Aktionen, keine Sitzung. */
  const pflicht = betreiberPflicht();
  const aktion = String((rumpf && rumpf.zweifaktorAktion) || "");
  const code = rumpf && rumpf.zweifaktor ? String(rumpf.zweifaktor) : "";
  const kennungen = [`b:${id.slice(0, 16)}`, k];

  let stand;
  try { stand = await zweifaktorStand(store, id); } catch { return { antwort: nichtPruefbar() }; }

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
      await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · fehlt");
      return json({ fehler: "Für diesen Zugang ist ein zweiter Faktor eingerichtet. "
        + "Bitte den Code aus der App eingeben.", zweifaktor: "erforderlich" }, 401);
    }
    const gebremst = await bremsen(); if (gebremst) return gebremst;
    const p = await zweifaktorPruefen(store, id, { code, nachweisErlaubt: false });
    if (!p.ok) {
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", `Betreiber · ${p.grund}`);
      return json({ fehler: p.grund === "wiederholt"
        ? "Dieser Code wurde schon verwendet. Bitte den nächsten abwarten."
        : "Der zweite Faktor stimmt nicht.", zweifaktor: "falsch" }, 401);
    }
    await entlastenAlle();
    if (p.art === "wiederherstellung")
      await protokoll("zweifaktor", k, "erfolg", "Betreiber · Wiederherstellungscode verbraucht");
    return null;
  };

  if (aktion === "beginnen") {
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
      await protokoll("zweifaktor", k, "warnung", `Betreiber · Überschreiben einer begonnenen Einrichtung verweigert (seit ${stand.ausstehendSeitMin} min)`);
      return { antwort: json({ fehler: "Eine Einrichtung ist bereits begonnen. Bitte mit dem Geheimnis "
        + "bestätigen oder durch den Serverbetreiber zurücksetzen lassen.", zweifaktor: "ausstehend" }, 409) };
    }
    if (stand.ausstehend) {
      const gebremst = await bremsen(); if (gebremst) return { antwort: gebremst };
      await protokoll("zweifaktor", k, "warnung", "Betreiber · laufende Einrichtung überschrieben");
    }
    const erg = await zweifaktorBeginnen(store, id, name || "Betreiber");
    if (erg.fehler === "pfeffer") return { antwort: json({ fehler: "Der zweite Faktor lässt sich auf "
      + "diesem Server nicht einrichten (CENTRIC_PFEFFER fehlt)." }, 503) };
    if (erg.fehler) return { antwort: json({ fehler: "Der zweite Faktor ist schon eingerichtet." }, 409) };
    await codeRichtig();
    await protokoll("zweifaktor", k, "erfolg", "Betreiber · Einrichtung begonnen");
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
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · Bestätigung");
      return { antwort: json({ fehler: "Der Code stimmt nicht.", zweifaktor: "falsch" }, 401) };
    }
    const vorher = await sitzungenBeenden();
    if (vorher.fehler) return { antwort: nichtAlleBeendet("der zweite Faktor wurde NICHT aktiviert") };
    const erg = await zweifaktorBestaetigen(store, id, code);
    if (erg.fehler === "pfeffer") return { antwort: nichtPruefbar() };
    if (erg.fehler) {
      await new Promise((r) => setTimeout(r, 400));
      await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · Bestätigung");
      return { antwort: json({ fehler: "Der Code stimmt nicht.", zweifaktor: "falsch" }, 401) };
    }
    await entlastenAlle();
    await codeRichtig();
    /* Zweiter Durchgang: eine Sitzung, die zwischen dem ersten und der
       Aktivierung mit dem Code allein entstand. */
    const danach = await sitzungenBeenden();
    const beendet = vorher.beendet + danach.beendet;
    await protokoll("zweifaktor", k, "erfolg", `Betreiber · eingerichtet · ${beendet} Sitzungen beendet`);
    return { antwort: json({ ok: true, aktiv: true, sitzungenBeendet: beendet,
      ...(danach.fehler ? { warnung: "Eine eben entstandene Sitzung ließ sich nicht beenden; sie endet spätestens nach zwei Stunden." } : {}),
      wiederherstellung: erg.wiederherstellung,
      hinweis: "Die Wiederherstellungscodes erscheinen genau einmal. Jeder gilt einmal." }) };
  }

  if (aktion === "abschalten") {
    if (!stand.aktiv) return { antwort: json({ fehler: "Es ist kein zweiter Faktor eingerichtet." }, 409) };
    /* WP-32d (Review 2): Unter Pflicht gibt es kein Abschalten über den Netzweg. Wer Code und einen abgefangenen
       Code der App hat, würde sonst abschalten, ein eigenes Gerät einrichten und den Betreiber aussperren.
       Gerätewechsel und Verlust: offline (werkzeug/betreiber-2fa-zuruecksetzen.mjs). */
    if (pflicht) {
      await protokoll("zweifaktor", k, "warnung", "Betreiber · Abschalten unter Pflicht verweigert");
      return { antwort: json({ fehler: "Unter Pflicht lässt sich der zweite Faktor nicht über das Netz abschalten. "
        + "Gerätewechsel oder Verlust: der Serverbetreiber setzt ihn offline zurück.", zweifaktor: "pflicht" }, 409) };
    }
    const r = await pruefen(); if (r) return { antwort: r };
    /* B-M2: erst Sitzungen beenden; scheitert das, bleibt der Faktor. */
    const vorher = await sitzungenBeenden();
    if (vorher.fehler) return { antwort: nichtAlleBeendet("der zweite Faktor bleibt eingerichtet") };
    try { await zweifaktorAbschalten(store, id); }
    catch { return { antwort: nichtPruefbar() }; }
    await codeRichtig();
    await protokoll("zweifaktor", k, "erfolg", `Betreiber · abgeschaltet · ${vorher.beendet} Sitzungen beendet`);
    return { antwort: json({ ok: true, aktiv: false, sitzungenBeendet: vorher.beendet }) };
  }

  if (aktion === "stand") {
    await codeRichtig();
    return { antwort: json({ aktiv: stand.aktiv, ausstehend: stand.ausstehend,
      wiederherstellungUebrig: stand.aktiv ? stand.wiederherstellungUebrig : 0, pflicht }) };
  }

  if (aktion) return { antwort: json({ fehler: "Unbekannte Aktion. Erlaubt: stand, beginnen, "
    + "bestaetigen, abschalten." }, 400) };

  /* Gewöhnliche Anmeldung. */
  if (stand.aktiv) { const r = await pruefen(); if (r) return { antwort: r }; }
  else if (pflicht) {
    await codeRichtig();      // der Code war richtig; die Einrichtung ist der nächste Schritt, kein Rateversuch
    await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · Pflicht, nicht eingerichtet");
    return { antwort: json({ fehler: "Für Betreiberzugänge ist ein zweiter Faktor Pflicht. Bitte zuerst "
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
  const id = betreiberZweifaktorId(konto);
  let stand;
  try { stand = await zweifaktorStand(store, id); } catch { return { antwort: nichtPruefbar() }; }
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
  const kennungen = [`b:${id.slice(0, 16)}`, k];
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

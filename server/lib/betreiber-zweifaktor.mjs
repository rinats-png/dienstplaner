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
import { sitzungenBeendenWenn } from "./sitzungen.mjs";
import { bremse, entlasten, notentlasten, protokoll, zuVielAntwort, GRENZEN } from "./schutz.mjs";
import { zweifaktorStand, zweifaktorBeginnen, zweifaktorBestaetigen, zweifaktorPruefen,
  zweifaktorAbschalten } from "./zweifaktor.mjs";

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
  const pflicht = (process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT || "").trim() === "1";
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
    /* B-M2: ERST die bisherigen Sitzungen beenden. Gelingt das nicht
       vollständig, wird nicht aktiviert (fail-closed) — sonst stünde der
       Faktor, die alten Sitzungen liefen weiter, und eine Wiederholung
       bekäme nur noch 409. */
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
    await protokoll("zweifaktor", k, "abgewiesen", "Betreiber · Pflicht, nicht eingerichtet");
    return { antwort: json({ fehler: "Für Betreiberzugänge ist ein zweiter Faktor Pflicht. Bitte zuerst "
      + "einrichten (zweifaktorAktion: beginnen, dann bestaetigen).", zweifaktor: "einrichten" }, 403) };
  }
  return { aktiv: stand.aktiv };
}

/* ==========================================================================
   BRANCHENKATALOG — Erweiterungspunkt des Regelregisters (WP-19, Kern)

   Branchenregeln sind Einträge im einen Regelregister (src/regelregister.js
   nimmt REGELN_BRANCHEN in REGELN auf), keine zweite Prüfmaschine
   (docs/REGELWERK-REGISTRY.md, Abschnitte 1 und 11). Diese Datei liegt im
   Server, weil auch der Server Branchenbefunde bewerten wird und das
   Serverbild nur server/ enthält.

   Bis zur Nutzerentscheidung gilt für jede Branchenregel:
     - pruefstatus "provisional", kein Regelstand, höchstens „hinweis"
       (branchenregel() erzwingt es, pruefeBranchenkatalog() prüft es);
     - sie gehört zu genau einem Modul (`modul`) und nennt einen
       Branchenbereich (`scope.branche`);
     - sie wirkt nur, wenn das Modul im Betrieb aktiv ist (modulAktiv) —
       Ausschalten des Moduls schaltet ihre Befunde ab;
     - ein Befund aus ihr sperrt nie (Befundart „branche", BRANCHEN_BEFUNDART).

   Gerechnet wird mit den Regelarten des Baukastens (zaehlregel, grenzregel,
   besetzungsregel, paarregel). alsEinteilungsBefund() übersetzt das Ergebnis
   in die Form von einteilungsBefunde (server/lib/fachpruefung.mjs, WP-22).

   ANDOCKPUNKTE (nach dem Merge von WP-22, nicht in diesem Stand):
     A1  BEFUND_KATALOG (server/lib/bestaetigungen.mjs) übernimmt
         BRANCHEN_BEFUNDART — vorher sperrt jeder unbekannte Befund
         (fail-closed, sperrtBefund).
     A2  einteilungsBefunde hängt die Befunde aktiver Module an.
     A3  Der Regelbaukasten wird serverfähig (wie regelwerk.mjs in WP-22),
         damit der Server dieselben Regelarten rechnet.
   ========================================================================== */
/* Gegenseitiger Import mit der Registry: beide lesen einander nur in
   Funktionen, nie beim Laden. */
import { modulVon } from "./branchenmodule.mjs";

/**
 * Ein Registereintrag einer Branchenregel — Felder wie in
 * docs/REGELWERK-REGISTRY.md, Abschnitt 3, dazu `modul`.
 * @typedef {{
 *   id: string, modul: string, bezeichnung: string, typ: string, ebene: "bund"|"land"|"tarif"|"betrieb",
 *   quelle?: string|null, fundstelle?: string|null, gueltigAb: string|null, gueltigBis: string|null,
 *   pruefstatus: string, geprueftAm: string|null, regelstand: string|null, art: string|null, folge: string|null,
 *   scope: { branche: string[]|string|null, bundesland: any, beschaeftigungsmodell: any },
 *   hoechsteStufe: "hinweis"|"achtung"|"recht"|null, parameter?: any, pruefhinweis: string, laufzeit?: any,
 * }} Branchenregel
 */

/**
 * Ergebnis einer Regelauswertung (Regelbaukasten, pruefeRegel).
 * Beide Formen werden gelesen: die kurze ({ zustand, stufe, text }) und die des
 * Baukastens ({ status, befund: { stufe }, text }, src/regelbaukasten.js).
 * @typedef {{ zustand?: "erfuellt"|"verletzt"|"offen"|"nicht_anwendbar", status?: string, stufe?: string|null,
 *   befund?: { stufe?: string } | null, text?: string }} RegelErgebnis
 */

/**
 * Ein Befund in der Form von einteilungsBefunde.
 * @typedef {{ regel: "branche", regelId: string, modul: string, stufe: string, text: string, quelle: string, art: "branche", offen?: boolean }} BranchenBefund
 */

/** Die Befundart für BEFUND_KATALOG (Andockpunkt A1): Hinweis, sperrt nicht. */
export const BRANCHEN_BEFUNDART = Object.freeze({
  branche: Object.freeze({ text: "Vorgabe eines Branchenmoduls (vorläufig)", quelle: "Branchenmodul", stufe: "hinweis", sperrt: false }),
});

const OHNE_SCOPE = { branche: null, bundesland: null, beschaeftigungsmodell: null };

/**
 * Baut einen Registereintrag für eine Branchenregel. Prüfstatus, Regelstand
 * und Stufendeckel lassen sich hier nicht überschreiben: Eine Branchenregel
 * wird erst mit Nutzerentscheidung und Primärquellenprüfung aufgewertet —
 * dann ausdrücklich, nicht über diesen Helfer.
 * @param {Omit<Partial<Branchenregel>, "scope"> & { scope?: Partial<Branchenregel["scope"]>, id: string, modul: string, typ: string, bezeichnung: string, ebene: any, pruefhinweis: string }} e
 * @returns {Branchenregel}
 */
export function branchenregel(e) {
  return /** @type {Branchenregel} */ ({
    gueltigAb: null, gueltigBis: null, art: null, folge: null, quelle: null, fundstelle: null, ...e,
    pruefstatus: "provisional", geprueftAm: null, regelstand: null, hoechsteStufe: "hinweis",
    scope: { ...OHNE_SCOPE, ...(e.scope || {}) },
  });
}

/**
 * Die Branchenregeln. Leer, bis der Nutzer die Fachfragen je Modul
 * entschieden hat (Entscheidungsmatrix WP-19). Jeder Eintrag entsteht mit
 * branchenregel() und hat Testfälle (knapp darunter, genau, knapp darüber,
 * Daten fehlen) in pruefungen/modul-<id>.test.js.
 * @type {readonly Branchenregel[]}
 */
export const REGELN_BRANCHEN = Object.freeze([
  /* Industrie — anlagen (Matrix A3 a). Der Wert 1 ist nur die Vorlage: Die
     Regelinstanz je Dienst trägt den Bedarf aus der Mindestbesetzung der
     laufenden Anlagen (anlagenRegel, server/lib/modul-anlagen.mjs). */
  branchenregel({ id: "ANLAGEN-BESETZUNG-01", modul: "anlagen", typ: "besetzungsregel",
    bezeichnung: "Mindestbesetzung der laufenden Anlagen", ebene: "betrieb",
    scope: { branche: ["produktion", "logistik"] },
    parameter: { anforderungen: [{ art: "anzahl", min: 1 }], bedarfAus: "betriebsmittel.mindestBesetzung" },
    pruefhinweis: "Mindestbesetzung je Anlage legt der Betrieb nach seiner Gefährdungsbeurteilung fest (§ 5 ArbSchG); keine Rechtsvorschrift mit festen Zahlen. Stufe nach Nutzerentscheidung G4." }),
  /* Industrie — maschinenqual. Die Instanz je Anlage verlangt „anlage:<id>“ in der
     Mindestbesetzung der Anlage (maschinenqualBefunde, server/lib/modul-maschinenqual.mjs). */
  branchenregel({ id: "MASCHQUAL-BESETZUNG-01", modul: "maschinenqual", typ: "besetzungsregel",
    bezeichnung: "Qualifizierte Besetzung der laufenden Anlagen", ebene: "betrieb",
    scope: { branche: ["produktion", "logistik"] },
    parameter: { anforderungen: [{ art: "anzahlMit", merkmal: "anlage", min: 1 }], bedarfAus: "betriebsmittel.mindestBesetzung" },
    pruefhinweis: "Unterweisung und Beauftragung nach § 12 BetrSichV und § 12 ArbSchG; ob fehlende Qualifikation nur Hinweis oder bestätigungspflichtig ist, entscheidet der Nutzer (G4). Quellen an der Primärquelle prüfen." }),
  /* Klinik — geteilterdienst (Matrix T1 a, T2 b). Branchen, in denen geteilte Dienste üblich sind. */
  branchenregel({ id: "GETEILT-RUHE-01", modul: "geteilterdienst", typ: "grenzregel",
    bezeichnung: "Ruhezeit ab Ende des zweiten Abschnitts eines geteilten Dienstes", ebene: "bund",
    quelle: "ArbZG", fundstelle: "§ 5 Abs. 1",
    scope: { branche: ["klinik", "pflege", "rettung", "gastronomie", "handel", "reinigung", "sonstiges"] },
    parameter: { groesse: "Ruhezeit in Stunden", mindestens: 11 },
    pruefhinweis: "Elf Stunden Ruhe nach Ende der täglichen Arbeitszeit (§ 5 Abs. 1 ArbZG); dass die Lücke zwischen den Abschnitten keine Ruhezeit ist, an der Primärquelle und Rechtsprechung prüfen. Abweichungen nach Tarif (§ 7 ArbZG) kennt die Regel nicht." }),
  branchenregel({ id: "GETEILT-SPANNE-01", modul: "geteilterdienst", typ: "grenzregel",
    bezeichnung: "Höchstspanne eines geteilten Dienstes", ebene: "betrieb",
    scope: { branche: ["klinik", "pflege", "rettung", "gastronomie", "handel", "reinigung", "sonstiges"] },
    parameter: { groesse: "Spanne in Stunden", hoechstens: 24, grenzeAus: "modulParameter.hoechstSpanneStunden" },
    pruefhinweis: "Die Grenze trägt der Betrieb nach Tarif oder Betriebsvereinbarung ein; ohne Eintrag gilt keine. Keine Rechtsvorschrift mit fester Zahl bekannt (zu prüfen)." }),
]);

/**
 * Selbstprüfung des Katalogs (Vertrag) — ergänzt pruefeRegister im
 * Regelregister. Leere Liste heißt: stimmig.
 * @param {readonly any[]} [liste]
 * @returns {string[]}
 */
export function pruefeBranchenkatalog(liste = REGELN_BRANCHEN) {
  const m = [];
  for (const r of liste) {
    const wo = r && r.id ? r.id : "(ohne Kennung)";
    if (!r || !modulVon(r.modul)) { m.push(`${wo}: Modul „${r && r.modul}" unbekannt`); continue; }
    const b = r.scope && r.scope.branche;
    if (b == null || (Array.isArray(b) && !b.length)) m.push(`${wo}: Branchenbereich (scope.branche) fehlt`);
    if (r.pruefstatus !== "provisional" && r.pruefstatus !== "watchlist" && r.pruefstatus !== "deprecated")
      m.push(`${wo}: vorläufig muss die Regel bleiben, bis der Nutzer entschieden hat`);
    if (r.regelstand) m.push(`${wo}: vorläufig — gehört zu keinem Regelstand`);
    if (r.hoechsteStufe !== "hinweis") m.push(`${wo}: höchste Stufe muss „hinweis" sein`);
    if (r.laufzeit !== undefined && r.laufzeit !== null) m.push(`${wo}: laufzeit ist für Branchenregeln nicht zulässig`);
    if (r.art) m.push(`${wo}: Befundart des Bestands (art) ist für Branchenregeln nicht zulässig`);
    if (!r.pruefhinweis) m.push(`${wo}: Prüfhinweis fehlt`);
  }
  return m;
}

const RANG = { hinweis: 1, achtung: 2, recht: 3 };

/**
 * Stufe, die eine Branchenregel einem Befund höchstens geben darf — die
 * Serverfassung von begrenzeStufe (src/regelregister.js) für diesen Katalog.
 * Vorläufig → höchstens Hinweis; beobachtet, abgelöst, unbekannt → kein Befund.
 * @param {any} r
 * @param {string|null|undefined} stufe
 * @returns {string|null}
 */
export function stufeFuerBranchenregel(r, stufe) {
  if (!r || (r.pruefstatus !== "provisional" && r.pruefstatus !== "verified")) return null;
  if (stufe == null || !RANG[stufe]) return null;
  const deckel = r.pruefstatus === "provisional" ? "hinweis" : (r.hoechsteStufe || "hinweis");
  return RANG[stufe] > RANG[deckel] ? deckel : stufe;
}

/**
 * Übersetzt das Ergebnis einer Regelauswertung in einen Befund der Form von
 * einteilungsBefunde. Erfüllt oder nicht anwendbar → null. Nicht bewertbar
 * („offen") → Hinweis mit `offen: true`, nie „erfüllt".
 * @param {any} r Branchenregel
 * @param {RegelErgebnis} ergebnis
 * @returns {BranchenBefund|null}
 */
export function alsEinteilungsBefund(r, ergebnis) {
  if (!r || !ergebnis) return null;
  const zustand = ergebnis.zustand || ergebnis.status;
  if (zustand !== "verletzt" && zustand !== "offen") return null;
  const offen = zustand === "offen";
  const roh = ergebnis.stufe || (ergebnis.befund && ergebnis.befund.stufe) || "hinweis";
  const stufe = stufeFuerBranchenregel(r, offen ? "hinweis" : roh);
  if (!stufe) return null;
  /** @type {BranchenBefund} */
  const b = { regel: "branche", regelId: r.id, modul: r.modul, stufe,
    text: String(ergebnis.text || r.bezeichnung || "").slice(0, 300),
    quelle: r.quelle ? `${r.quelle}${r.fundstelle ? " " + r.fundstelle : ""} (vorläufig)` : "Vorgabe des Betriebs (vorläufig)",
    art: "branche" };
  if (offen) b.offen = true;
  return b;
}

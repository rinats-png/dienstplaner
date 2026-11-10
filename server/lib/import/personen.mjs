/* ==========================================================================
   IMP-3 — Personalimport: Analyse, Dubletten, Plan und Anwendung (rein)

   Kein I/O, keine Zeit außer dem übergebenen `heute`, keine Zufallszahl außer
   der übergebenen `neueId`. Eingabe ist der Rohinhalt aus dem Parser (IMP-2,
   docs/acc45/IMPORT-VERTRAG.md §6), Ausgabe sind Datensätze und ein Plan.
   Geschrieben wird hier nichts: Die Übernahme (uebernahme.mjs) wendet den Plan
   unter der Raumsperre auf den frisch gelesenen Bestand an und schreibt über
   den bestehenden Weg (rechte.mjs zusammenfuehren, bestand.mjs bestandSchreiben).

   Dublettenregeln (Freigabe IMP-3, verbindlich):
   - Die Personalnummer ist der bevorzugte Identifikator, und zwar nur INNERHALB
     des eigenen Betriebs (Mandant). Eine gleiche Nummer in einem anderen
     Betrieb ist keine Dublette.
   - Ohne Personalnummer gibt es nur einen Vorschlag zur manuellen Prüfung
     (gleicher Vor- und Nachname). Über den Namen wird nie zusammengeführt und
     nie aktualisiert.
   - Keine automatische Überschreibung: „Bestehenden aktualisieren" nur bei
     Treffer über die Personalnummer, nur mit ausdrücklicher Bestätigung je
     Datensatz.
   - Auswahl je Datensatz: neu | aktualisieren | ueberspringen | klaeren.

   Fehlermeldungen je Datensatz nennen das Feld, nie den Wert (keine
   Personendaten in Fehlern).
   ========================================================================== */

import { createHash } from "node:crypto";
import { orgKatalog, orgZuordnen, orgAnlegbar, orgAnlegenPruefen, orgAnlegen, orgNameMerken,
  qualifikationenAusText, qualifikationenZuGross } from "./org.mjs";

/** Felder, die der Personalimport kennt (Weißliste). Alles andere wird nicht gelesen. */
export const FELDER = Object.freeze(["nachname", "vorname", "personalnummer", "email", "funktion",
  "wochenstunden", "urlaubsanspruch", "eintritt", "einheit", "standort", "qualifikationen"]);
/** Ohne diese Zuordnung ist keine Analyse möglich. */
export const PFLICHT_SPALTEN = Object.freeze(["nachname", "vorname", "einheit"]);
/** Felder, die „Bestehenden aktualisieren" ändern darf. Nicht: Personalnummer (Schlüssel), Einheit
    und Eintritt (Zugehörigkeitsgeschichte), Rolle (roles.assign), Qualifikationen (IMP-5: nur bei NEUEN Personen,
    nie an einer bestehenden). */
export const AKTUALISIERBAR = Object.freeze(["vorname", "nachname", "email", "funktion", "wochenstunden", "urlaubsanspruch"]);
export const AKTIONEN = Object.freeze(["neu", "aktualisieren", "ueberspringen", "klaeren"]);

/* Überschriften je Feld, normalisiert (Kleinbuchstaben, Umlaute aufgelöst, nur a-z0-9).
   Teilmenge der Muster aus src/lib/fachlogik.js importZuordnen (IMP-1), ohne „id"/„nummer"
   (zu unspezifisch) und mit Standort. */
const MUSTER = {
  nachname: ["nachname", "name", "familienname", "lastname", "surname", "zuname"],
  vorname: ["vorname", "firstname", "rufname", "givenname"],
  personalnummer: ["personalnummer", "persnr", "pnr", "personalnr", "mitarbeiternummer", "mitarbeiternr", "maid"],
  email: ["email", "mail", "emailadresse", "dienstmail"],
  funktion: ["funktion", "position", "taetigkeit", "stelle", "berufsbezeichnung"],
  wochenstunden: ["wochenstunden", "stunden", "wochenarbeitszeit", "sollstunden", "vertragsstunden", "stdwo"],
  urlaubsanspruch: ["urlaubsanspruch", "urlaub", "urlaubstage", "jahresurlaub"],
  eintritt: ["eintritt", "eintrittsdatum", "beginn", "vertragsbeginn", "einstellung"],
  einheit: ["einheit", "team", "abteilung", "gruppe", "station", "wohnbereich", "bereich", "dienstgruppe"],
  standort: ["standort", "filiale", "niederlassung", "haus", "betriebsstaette"],
  qualifikationen: ["qualifikation", "qualifikationen", "quali", "kenntnisse"],
};

const norm = (s) => String(s ?? "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]/g, "");
const vergleich = (s) => String(s ?? "").trim().toLowerCase();
/** Vergleichsform für Namen (Delta-Review 1b): wie bei den Spalten Umlaute aufgelöst (ä→ae, ö→oe, ü→ue, ß→ss) und
    Groß-/Kleinschreibung gleich; dazu Leerraum zusammengefasst und Bindestrich = Leerzeichen. Andere Schriftzeichen
    bleiben erhalten (anders als `norm`), sonst fielen etwa kyrillische Namen alle auf denselben leeren Schlüssel.
    Nur zum Aufspüren möglicher Dubletten (Vorschlag „klären"), nie zum Zusammenführen. */
const nameVergleich = (s) => String(s ?? "").normalize("NFC").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[\s\u00a0\-\u2010-\u2015_]+/g, " ").trim();
const namensSchluessel = (nachname, vorname) => `${nameVergleich(nachname)}|${nameVergleich(vorname)}`;
/** Schlüssel für „gleichwertige" Personalnummern: Trennzeichen und führende Nullen zählen nicht
    („01001" = „1001", „P-1001" = „P1001", „P01001" = „P1001"). Nur zum Aufspüren möglicher Treffer, nie zum Aktualisieren. */
const nummerSchluessel = (s) => vergleich(s).replace(/[^a-z0-9]/g, "").replace(/^([a-z]*)0+(?=[0-9])/, "$1");
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Eine Zelle als Text (Rohwerte laut Parser-Vertrag §6). */
export function zellText(z) {
  if (z === null || z === undefined) return "";
  if (typeof z === "string") return z.trim();
  if (typeof z === "number") return Number.isFinite(z) ? String(z) : "";
  if (typeof z === "boolean") return z ? "ja" : "nein";
  if (typeof z === "object" && z.typ === "datum") return String(z.text ?? "").trim();
  return "";   // Fehlerzelle oder Unbekanntes: leer
}

const pad = (n) => String(n).padStart(2, "0");
function kalenderGueltig(j, mo, t) {
  if (!(j >= 1900 && j <= 2199)) return null;
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  return `${j}-${pad(mo)}-${pad(t)}`;
}

/**
 * Datum aus einer Zelle: `{ wert }`, `{ leer: true }` oder `{ ungueltig: true }`. Strenge Kalenderprüfung wie IMP-1
 * (31.02. und 2024-02-30 sind ungültig); nie Ersatz durch „heute" bei einem nicht lesbaren Wert.
 * Excel-Datumszellen: Seriennummer im Datumssystem 1900. Der Parser (IMP-2) rechnet 1904er-Mappen bereits beim Lesen
 * auf 1900 um; hier wird NICHT mehr umgerechnet (sonst Doppelverschiebung um 1462 Tage). Vorschau und Übernahme
 * tragen dasselbe ISO-Datum (Freigabe Betreiber IMP-3).
 */
export function datumAusZelle(z) {
  if (z && typeof z === "object" && z.typ === "datum") {
    /* Excel 1900: Tag 25569 = 01.01.1970. */
    if (typeof z.roh === "number" && Number.isFinite(z.roh) && z.roh >= 1 && z.roh < 2958466) {
      const d = new Date(Math.round((Math.floor(z.roh) - 25569) * 86400000));
      const w = kalenderGueltig(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      return w ? { wert: w } : { ungueltig: true };
    }
    z = String(z.text ?? "");
  }
  if (typeof z === "number" || typeof z === "boolean" || (z && typeof z === "object")) return { ungueltig: true };
  const t = zellText(z);
  if (!t) return { leer: true };
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  let w = null;
  if (iso) w = kalenderGueltig(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  else if (de) w = kalenderGueltig(Number(de[3]), Number(de[2]), Number(de[1]));
  return w ? { wert: w } : { ungueltig: true };
}

/** Datum für die Vorschau: genau der Wert, der gespeichert würde, als TT.MM.JJJJ; leer → „nicht angegeben". */
export const datumAnzeige = (iso) => (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso)
  ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "nicht angegeben");

/** Zahl aus einer Zelle in [min, max]: `{ wert }`, `{ leer: true }` oder `{ ungueltig: true }`. */
export function zahlAusZelle(z, min, max, ganz = false) {
  let n;
  if (typeof z === "number") n = z;
  else {
    const t = zellText(z);
    if (!t) return { leer: true };
    if (!/^-?\d{1,4}([.,]\d{1,3})?$/.test(t)) return { ungueltig: true };
    n = Number(t.replace(",", "."));
  }
  if (!Number.isFinite(n) || n < min || n > max || (ganz && !Number.isInteger(n))) return { ungueltig: true };
  return { wert: n };
}

/** Vorschlag zur Spaltenzuordnung aus der Kopfzeile: genaue Treffer, dann Wortanfang (ab 3 Zeichen). */
export function spaltenVorschlag(kopf) {
  const zuordnung = Object.create(null);
  const herkunft = Object.create(null);
  const belegt = new Set();
  const n = (Array.isArray(kopf) ? kopf : []).map((h) => norm(zellText(h)));
  for (const stufe of ["genau", "anfang"]) {
    n.forEach((h, i) => {
      if (belegt.has(i) || !h) return;
      for (const feld of FELDER) {
        if (hat(zuordnung, feld)) continue;
        const treffer = MUSTER[feld].some((x) => (stufe === "genau" ? h === x : h.length >= 3 && (h.startsWith(x) || x.startsWith(h))));
        if (treffer) { zuordnung[feld] = i; herkunft[feld] = stufe; belegt.add(i); break; }
      }
    });
  }
  return { zuordnung, herkunft };
}

/**
 * Eine vom Client mitgeschickte Zuordnung prüfen: nur bekannte Felder, ganze Spaltenindizes im Bereich,
 * keine Spalte doppelt. Liefert eine neue Map ohne Prototyp.
 */
export function zuordnungPruefen(roh, spalten) {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return { ok: false, nachricht: "Die Spaltenzuordnung ist ungültig." };
  const zu = Object.create(null);
  const belegt = new Set();
  for (const k of Object.keys(roh)) {
    if (!FELDER.includes(k)) return { ok: false, nachricht: "Die Spaltenzuordnung nennt ein unbekanntes Feld." };
    const v = roh[k];
    if (v === null) continue;
    if (!Number.isInteger(v) || v < 0 || v >= spalten) return { ok: false, nachricht: "Die Spaltenzuordnung nennt eine Spalte, die es nicht gibt." };
    if (belegt.has(v)) return { ok: false, nachricht: "Eine Spalte ist mehreren Feldern zugeordnet." };
    belegt.add(v);
    zu[k] = v;
  }
  return { ok: true, zuordnung: zu };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Analyse eines Blatts gegen den eigenen Betrieb: Spalten, Zuordnung, Dubletten, Konflikte.
 * @param {{ mandant: any, zeilen: any[][], zuordnung?: any, heute: string }} e
 */
export function analysieren({ mandant, zeilen, zuordnung, heute }) {
  const kopf = Array.isArray(zeilen) && zeilen.length ? zeilen[0] : [];
  const daten = Array.isArray(zeilen) ? zeilen.slice(1) : [];
  const vorschlag = spaltenVorschlag(kopf);
  let zu = vorschlag.zuordnung;
  if (zuordnung !== undefined && zuordnung !== null) {
    const p = zuordnungPruefen(zuordnung, kopf.length);
    if (!p.ok) return { ok: false, code: "ZUORDNUNG_UNGUELTIG", nachricht: p.nachricht };
    zu = p.zuordnung;
  }
  const spalten = kopf.map((h, i) => ({ index: i, kopf: zellText(h),
    feld: FELDER.find((f) => zu[f] === i) || null,
    herkunft: zuordnung ? "manuell" : (FELDER.find((f) => zu[f] === i) ? vorschlag.herkunft[FELDER.find((f) => zu[f] === i)] : null) }));
  /* IMP-9 ANDOCKSTELLE (nicht aktiv): Hier setzt später die KI-Unterstützung für unklare Spalten an. Eingabe wären
     NUR die Spalten ohne Zuordnung (`spalten.filter((s) => !s.feld)`) — Überschrift und höchstens maskierte Proben, über
     das Gateway (server/lib/intelligence/gateway) mit Positivliste F7A. Ausgabe sind Vorschläge für `zuordnung`, die die
     Person bestätigt; nie ein Schreibvorgang. Bis zur Freigabe (WP-I19, E-25) gibt es hier keinen Aufruf.
     Die austauschbare Schnittstelle dafür steht in ki-schnittstelle.mjs (IMP-9); diese Analyse kennt sie NICHT und
     braucht sie nicht — der deterministische Import ist vollständig ohne KI. */
  const fehlendePflicht = PFLICHT_SPALTEN.filter((f) => !hat(zu, f));
  if (fehlendePflicht.length)
    return { ok: true, spalten, zuordnung: { ...zu }, fehlendePflicht, datensaetze: [], zaehler: { gesamt: daten.length } };

  const personen = Array.isArray(mandant && mandant.personen) ? mandant.personen.filter((p) => p && typeof p === "object") : [];
  const katalog = orgKatalog(mandant);   // IMP-5: Einheiten, Standorte, Qualifikationen (org.mjs)
  /* Alle Personen je Nummer — nie „die erste" still wählen (Auflage 2 aus dem IMP-3-Review): Trägt der Bestand
     dieselbe Nummer mehrfach, ist der Treffer mehrdeutig und bleibt eine Klärung. */
  const nachNummer = new Map();
  const nachSchluessel = new Map();
  for (const p of personen) {
    const nr = vergleich(p.personalnummer);
    if (!nr) continue;
    nachNummer.set(nr, [...(nachNummer.get(nr) || []), p]);
    const sk = nummerSchluessel(nr);
    if (sk) nachSchluessel.set(sk, [...(nachSchluessel.get(sk) || []), p]);
  }
  const nummernInDatei = new Map();   // Schlüssel -> Datensatznummern
  const namenInDatei = new Map();     // Name -> Datensatznummern
  const hol = (f, z) => (hat(zu, f) ? z[zu[f]] : null);

  const datensaetze = daten.map((z, i) => {
    const nr = i + 1;
    const fehler = [];
    const hinweise = [];
    const werte = {
      nachname: zellText(hol("nachname", z)), vorname: zellText(hol("vorname", z)),
      personalnummer: zellText(hol("personalnummer", z)), email: zellText(hol("email", z)),
      funktion: zellText(hol("funktion", z)), einheit: zellText(hol("einheit", z)), standort: zellText(hol("standort", z)),
    };
    if (!werte.nachname) fehler.push("Nachname fehlt");
    if (!werte.vorname) fehler.push("Vorname fehlt");
    if (!werte.einheit) fehler.push("Einheit fehlt");
    if (werte.email && !EMAIL.test(werte.email)) fehler.push("E-Mail ungültig");
    for (const [k, v] of Object.entries(werte)) if (v.length > 200) fehler.push(`${k} zu lang`);
    werte.qualifikationen = qualifikationenAusText(zellText(hol("qualifikationen", z)));
    if (qualifikationenZuGross(werte.qualifikationen)) fehler.push("Qualifikationen zu umfangreich");
    const ein = datumAusZelle(hol("eintritt", z));
    if (ein.ungueltig) fehler.push("Eintrittsdatum ungültig");
    /* Leer und optional -> null; nie „heute" (Entscheidung 2026-11-09). */
    werte.eintritt = ein.wert ?? null;
    const std = zahlAusZelle(hol("wochenstunden", z), 0, 60);
    if (std.ungueltig) fehler.push("Wochenstunden ungültig");
    werte.wochenstunden = std.wert ?? null;
    const url = zahlAusZelle(hol("urlaubsanspruch", z), 0, 60, true);
    if (url.ungueltig) fehler.push("Urlaubsanspruch ungültig");
    werte.urlaubsanspruch = url.wert ?? null;

    /* IMP-5: Fehlende Einheiten, Standorte und Qualifikationen sind Zuordnungskonflikte; hier wird nichts angelegt. */
    const org = orgZuordnen(katalog, werte);
    const konflikte = org.konflikte;

    /* Dubletten: Personalnummer (mandantenintern) vor Name; Name und gleichwertige Nummer nur als Vorschlag.
       Gleicher Name führt bei abweichender oder fehlender Nummer NIE zu „neu", sondern zu „klären". */
    let dublette = null;
    const nrNorm = vergleich(werte.personalnummer);
    const nrSchl = nummerSchluessel(werte.personalnummer);
    const nameNorm = werte.nachname && werte.vorname ? namensSchluessel(werte.nachname, werte.vorname) : "";
    if (nrNorm) {
      const genau = nachNummer.get(nrNorm) || [];
      const aehnlich = (nrSchl ? nachSchluessel.get(nrSchl) || [] : []).filter((x) => vergleich(x.personalnummer) !== nrNorm);
      if (genau.length === 1) dublette = { art: "personalnummer", personId: String(genau[0].id) };
      else if (genau.length > 1) dublette = { art: "personalnummer-mehrdeutig", personIds: genau.map((x) => String(x.id)) };
      else if (aehnlich.length) dublette = { art: "personalnummer-aehnlich", personId: String(aehnlich[0].id), personIds: aehnlich.map((x) => String(x.id)) };
      if (nrSchl) nummernInDatei.set(nrSchl, [...(nummernInDatei.get(nrSchl) || []), nr]);
    }
    if (!dublette && nameNorm) {
      const p = personen.find((x) => namensSchluessel(x.nachname, x.vorname) === nameNorm);
      if (p) dublette = { art: "name", personId: String(p.id) };
    }
    if (nameNorm) namenInDatei.set(nameNorm, [...(namenInDatei.get(nameNorm) || []), nr]);

    let erlaubt, vorgabe;
    if (fehler.length) { erlaubt = ["ueberspringen"]; vorgabe = "ueberspringen"; }
    else if (dublette && dublette.art === "personalnummer") { erlaubt = ["aktualisieren", "ueberspringen", "klaeren"]; vorgabe = "klaeren"; }
    else if (dublette && (dublette.art === "personalnummer-datei" || dublette.art === "personalnummer-mehrdeutig")) { erlaubt = ["ueberspringen", "klaeren"]; vorgabe = "klaeren"; }
    else if (dublette) { erlaubt = ["neu", "ueberspringen", "klaeren"]; vorgabe = "klaeren"; }
    else { erlaubt = ["neu", "ueberspringen", "klaeren"]; vorgabe = konflikte.length ? "klaeren" : "neu"; }
    return { datensatz: nr, werte, einheitId: org.einheitId, standortId: org.standortId,
      qualifikationIds: org.qualifikationIds, neueQualifikationen: org.neueQualifikationen,
      fehler, hinweise, konflikte, dublette, erlaubt, vorgabe };
  });
  /* Doppelt in der Datei: ALLE betroffenen Zeilen werden markiert, nicht nur die spätere. Eine (gleichwertige)
     Nummer in der Datei geht einem Treffer im Bestand vor (sonst würde dieselbe Person zweimal aktualisiert).
     Ein gleicher Name in der Datei ist nur ein Vorschlag und überschreibt keinen anderen Treffer. */
  for (const d of datensaetze) {
    if (d.fehler.length) continue;
    const nrSchl = nummerSchluessel(d.werte.personalnummer);
    const nameNorm = d.werte.nachname && d.werte.vorname ? namensSchluessel(d.werte.nachname, d.werte.vorname) : "";
    const gleicheNr = nrSchl ? (nummernInDatei.get(nrSchl) || []).filter((x) => x !== d.datensatz) : [];
    const gleicherName = nameNorm ? (namenInDatei.get(nameNorm) || []).filter((x) => x !== d.datensatz) : [];
    if (gleicheNr.length) {
      d.dublette = { art: "personalnummer-datei", datensatz: gleicheNr[0] };
      d.erlaubt = ["ueberspringen", "klaeren"]; d.vorgabe = "klaeren";
    } else if (gleicherName.length && !d.dublette) {
      d.dublette = { art: "name-datei", datensatz: gleicherName[0] };
      d.erlaubt = ["neu", "ueberspringen", "klaeren"]; d.vorgabe = "klaeren";
    }
  }
  const zaehler = { gesamt: datensaetze.length,
    fehlerhaft: datensaetze.filter((d) => d.fehler.length).length,
    dubletten: datensaetze.filter((d) => d.dublette).length,
    konflikte: datensaetze.filter((d) => d.konflikte.length).length };
  return { ok: true, spalten, zuordnung: { ...zu }, fehlendePflicht, datensaetze, zaehler };
}

/**
 * Den Übernahmeplan aus Analyse und Entscheidungen bauen. Prüft Entscheidungen, Bestätigungen und org.edit.
 * @param {{ mandant: any, analyse: any, entscheidungen?: any, bestaetigungen?: any, einheitenAnlegen?: boolean, orgEdit: boolean }} e
 */
export function planen({ mandant, analyse, entscheidungen, bestaetigungen, einheitenAnlegen = false, orgEdit }) {
  const wahl = entscheidungen && typeof entscheidungen === "object" && !Array.isArray(entscheidungen) ? entscheidungen : {};
  const best = bestaetigungen && typeof bestaetigungen === "object" && !Array.isArray(bestaetigungen) ? bestaetigungen : {};
  /* IMP-5: „Einheiten anlegen" steht für Einheiten, Standorte UND Qualifikationen; ohne org.edit 403 (org.mjs). */
  const orgGate = orgAnlegenPruefen({ anlegen: einheitenAnlegen, orgEdit });
  if (!orgGate.ok) return orgGate;
  const nachNr = new Map(analyse.datensaetze.map((d) => [String(d.datensatz), d]));
  for (const k of Object.keys(wahl)) {
    const d = nachNr.get(k);
    if (!d || !AKTIONEN.includes(wahl[k]) || !d.erlaubt.includes(wahl[k]))
      return { ok: false, status: 422, code: "ENTSCHEIDUNG_UNZULAESSIG", datensaetze: [k],
        nachricht: "Für einen Datensatz wurde eine Auswahl getroffen, die dort nicht möglich ist." };
  }
  const ohneBestaetigung = analyse.datensaetze.filter((d) => wahl[String(d.datensatz)] === "aktualisieren" && best[String(d.datensatz)] !== true)
    .map((d) => d.datensatz);
  if (ohneBestaetigung.length)
    return { ok: false, status: 422, code: "AKTUALISIERUNG_OHNE_BESTAETIGUNG", datensaetze: ohneBestaetigung,
      nachricht: "Bestehende Personen werden nur mit ausdrücklicher Bestätigung je Datensatz aktualisiert." };

  const anlegen = orgGate.anlegen;
  const personen = new Map((Array.isArray(mandant.personen) ? mandant.personen : []).filter(Boolean).map((p) => [String(p.id), p]));
  const plan = { neu: [], aktualisieren: [], uebersprungen: [], offen: [], neueEinheiten: [], neueStandorte: [], neueQualifikationen: [], zyklen: [] };
  for (const d of analyse.datensaetze) {
    /* Mit „Einheiten anlegen" (org.edit) wird ein Datensatz, dessen einziger Mangel eine fehlende Einheit, ein fehlender
       Standort oder eine fehlende Qualifikation ist, neu angelegt. Eine mehrdeutige Qualifikation lässt sich so nicht lösen. */
    const vorgabe = anlegen && d.vorgabe === "klaeren" && orgAnlegbar(d.konflikte) && !d.dublette && !d.fehler.length ? "neu" : d.vorgabe;
    const aktion = hat(wahl, String(d.datensatz)) ? wahl[String(d.datensatz)] : vorgabe;
    if (aktion === "ueberspringen") { plan.uebersprungen.push({ datensatz: d.datensatz, grund: d.fehler.length ? "fehler" : "auswahl" }); continue; }
    if (aktion === "klaeren") { plan.offen.push({ datensatz: d.datensatz, grund: d.dublette ? "dublette" : d.konflikte.length ? "konflikt" : "auswahl" }); continue; }
    if (aktion === "neu") {
      if (d.konflikte.length && !(anlegen && orgAnlegbar(d.konflikte))) {
        if (hat(wahl, String(d.datensatz)))
          return { ok: false, status: 422, code: "ZUORDNUNGSKONFLIKT", datensaetze: [d.datensatz],
            nachricht: "Eine Einheit oder ein Standort ist im Betrieb nicht vorhanden. Bitte zuordnen oder überspringen." };
        plan.offen.push({ datensatz: d.datensatz, grund: "konflikt" });
        continue;
      }
      if (!d.einheitId) orgNameMerken(plan.neueEinheiten, d.werte.einheit);
      if (d.werte.standort && !d.standortId && !d.einheitId) orgNameMerken(plan.neueStandorte, d.werte.standort);
      for (const q of d.neueQualifikationen || []) orgNameMerken(plan.neueQualifikationen, q);
      plan.neu.push({ datensatz: d.datensatz, werte: d.werte, einheitId: d.einheitId, standortId: d.standortId,
        qualifikationIds: d.qualifikationIds || [] });
      continue;
    }
    /* aktualisieren: nur über die Personalnummer, nur bestätigt (oben geprüft). */
    const ziel = d.dublette && d.dublette.art === "personalnummer" ? personen.get(String(d.dublette.personId)) : null;
    if (!ziel) return { ok: false, status: 422, code: "ENTSCHEIDUNG_UNZULAESSIG", datensaetze: [d.datensatz],
      nachricht: "Für einen Datensatz wurde eine Auswahl getroffen, die dort nicht möglich ist." };
    const aenderungen = [];
    for (const f of AKTUALISIERBAR) {
      const neu = d.werte[f];
      if (neu === null || neu === undefined || neu === "") continue;   // leere Zelle überschreibt nie
      const alt = ziel[f] ?? null;
      if (String(alt ?? "") !== String(neu)) aenderungen.push({ feld: f, alt, neu });
    }
    if (!aenderungen.length) { plan.uebersprungen.push({ datensatz: d.datensatz, grund: "unveraendert" }); continue; }
    plan.aktualisieren.push({ datensatz: d.datensatz, personId: String(ziel.id), aenderungen });
  }
  if ((plan.neueEinheiten.length || plan.neueStandorte.length || plan.neueQualifikationen.length) && !anlegen)
    return { ok: false, status: 422, code: "ZUORDNUNGSKONFLIKT", nachricht: "Eine Einheit, ein Standort oder eine Qualifikation ist im Betrieb nicht vorhanden." };
  const tage = plan.neu.map((n) => n.werte.eintritt).filter(Boolean).sort();
  plan.zeitraum = tage.length ? { von: tage[0], bis: tage[tage.length - 1] } : null;
  const zaehler = { neu: plan.neu.length, aktualisiert: plan.aktualisieren.length,
    uebersprungen: plan.uebersprungen.length + plan.offen.length, offen: plan.offen.length,
    neueEinheiten: plan.neueEinheiten.length, neueStandorte: plan.neueStandorte.length,
    neueQualifikationen: plan.neueQualifikationen.length };
  /* Delta-Review 3b: Der Hash deckt nicht nur den Plan, sondern auch die Dubletten- und Konfliktlage je Datensatz
     (Art, Vorgabe, Ziel). Legt jemand zwischen Vorschau und Übernahme eine Person gleichen Namens an, bleibt der Plan
     („neu") gleich, die Lage aber nicht — dann gilt die Bestätigung nicht mehr (VORSCHAU_VERALTET). */
  const ziel = (du) => (!du ? null : du.personIds ? du.personIds.map(String) : du.personId !== undefined ? String(du.personId)
    : du.datensatz !== undefined ? `#${du.datensatz}` : null);
  const lage = analyse.datensaetze.map((d) => [d.datensatz, d.dublette ? d.dublette.art : null, ziel(d.dublette), d.vorgabe,
    d.konflikte.map((k) => k.art), d.einheitId, d.standortId, d.qualifikationIds || []]);
  const hash = createHash("sha256").update(JSON.stringify({ plan, lage })).digest("hex");
  return { ok: true, plan, zaehler, hash };
}

/**
 * Den Plan auf eine Kopie des eigenen Betriebs anwenden. Verändert die Eingabe nicht. `haken(i)` wird nach jedem
 * Datensatz aufgerufen (nur für die Fehlerinjektion der Prüfung); wirft er, entsteht kein Ergebnis.
 * IMP-5: Neue Einheiten, Standorte und Qualifikationen entstehen nur mit `orgEdit === true` (org.mjs); sonst wirft
 * die Anwendung (`ORG_EDIT_FEHLT`), bevor etwas angelegt wird — auch wenn ein Plan sie nennt.
 * @returns {{ mandant: any, neueIds: string[] }}
 */
export function anwenden(mandant, plan, { neueId, heute, haken = null, orgEdit = false }) {
  const m = structuredClone(mandant);
  m.personen = Array.isArray(m.personen) ? m.personen : [];
  m.einheiten = Array.isArray(m.einheiten) ? m.einheiten : [];
  const vergeben = new Set([...m.personen, ...m.einheiten, ...(Array.isArray(m.standorte) ? m.standorte : []),
    ...(Array.isArray(m.qualifikationen) ? m.qualifikationen : [])].filter(Boolean).map((x) => String(x.id)));
  const id = (praefix) => { let x; do x = neueId(praefix); while (vergeben.has(x)); vergeben.add(x); return x; };
  const { einheitNachName, qualifikationNachName } = orgAnlegen(m, plan, { id, orgEdit });
  const soll = m.einstellungen && Number.isFinite(m.einstellungen.sollWochenstunden) ? m.einstellungen.sollWochenstunden : 40;
  const neueIds = [];
  let i = 0;
  for (const n of plan.neu) {
    const w = n.werte;
    const eid = n.einheitId || einheitNachName.get(vergleich(w.einheit));
    /* Qualifikationen nur für NEUE Personen: vorhandene aus dem Katalog plus die eben (mit org.edit) angelegten. */
    const qualIds = [...new Set([...(n.qualifikationIds || []),
      ...(w.qualifikationen || []).map((q) => qualifikationNachName.get(vergleich(q))).filter(Boolean)])];
    /* Der Eintritt bleibt null, wenn er nicht angegeben ist (nie heute). Der Anker von Zugehörigkeit und Rolle
       braucht ein Datum und ist kein Eintritt: dafür gilt der Tag der Übernahme. */
    const eintritt = w.eintritt ?? null;
    const anker = eintritt || heute;
    const p = { id: id("p"), vorname: w.vorname, nachname: w.nachname, funktion: w.funktion || "Fachkraft",
      email: w.email || "", personalnummer: w.personalnummer || "",
      zugehoerigkeit: [{ ab: anker, einheitId: eid }], eintritt, austritt: null,
      wochenstunden: w.wochenstunden ?? soll, urlaubsanspruch: w.urlaubsanspruch ?? 30, urlaubsuebertrag: 0, stundenuebertrag: 0,
      qualifikationen: qualIds, einschraenkungen: {}, teilzeit: null, springer: false,
      rolle: "mitarbeiter", bereich: eid, rolleSeit: anker, status: "aktiv" };
    m.personen.push(p);
    neueIds.push(p.id);
    if (haken) haken(++i);
  }
  const index = new Map(m.personen.map((p, k) => [String(p && p.id), k]));
  for (const a of plan.aktualisieren) {
    const k = index.get(a.personId);
    if (k === undefined) throw Object.assign(new Error("Ziel einer Aktualisierung fehlt"), { code: "ZIEL_FEHLT" });
    const p = { ...m.personen[k] };
    for (const ae of a.aenderungen) p[ae.feld] = ae.neu;
    m.personen[k] = p;
    if (haken) haken(++i);
  }
  return { mandant: m, neueIds };
}

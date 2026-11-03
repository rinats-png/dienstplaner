/* ==========================================================================
   INTELLIGENCE — LECK-PRÜFUNG DES FAKTENPAKETS (WP-I11), FAIL CLOSED

   Letzte Schranke vor dem Modell. Das Faktenpaket ist durch Feldkatalog,
   Positivliste und Schema schon eng; diese Prüfung geht trotzdem jeden
   Schlüssel und jeden Wert durch und verwirft das ganze Paket bei Verdacht:

   - Sperrliste des Betriebs (serverseitig aus dem ROHEN Betrieb gebildet,
     nicht aus der Rollensicht — auch Namen, die die Rolle nicht sieht):
     Vor-/Nachnamen, Kürzel, Kennungen, Kontaktdaten, Personalnummern,
     Geburtsdaten, Raum, Betrieb, Namen von Einheiten, Standorten, Objekten.
     Abgleich nach Normalisierung (Kleinschreibung, Umlaute ä→ae, ß→ss,
     Akzente weg, Trennzeichen weg): ab vier Zeichen als Teilzeichenfolge,
     kürzer als ganzes Wort.
   - Muster: E-Mail, Telefon, Adressen mit Schema (http, webcal, mailto,
     tel), IBAN, Koordinaten, Zugangscodes/Token, Gesundheits- und
     Schutzbegriffe (Krankheit, AU, Diagnose, Schwangerschaft, Mutterschutz,
     Schwerbehinderung, GdB, Minderjährigkeit, Einwilligung …).
   - Struktur: verbotene Feldnamen an jeder Stelle (vorname, email, notiz,
     grund, mutterschutz, raum, aliasKarte …), nur einfache Objekte.

   Fail closed: Fehlt die Sperrliste oder wirft die Prüfung, ist das
   Ergebnis „nicht ok". Befunde nennen Kategorie und Pfad, nie den Wert.

   Grenzen (bewusst, siehe docs/intelligence/FAKTENPAKET.md): Verfremdungen
   wie „M3yer“ oder Namen in Bildern erkennt keine Mustersuche. Deshalb ist
   die Prüfung nur die letzte von vier Schranken (Katalog, Positivliste,
   Schema, Leck-Prüfung), nicht die einzige.
   ========================================================================== */

import { ZUSTAENDE, FAKT_ARTEN, EINHEITEN, PRUEFSTATUS, FUNKTIONEN_IDS, SCHEMA_VERSION } from "./schemas.mjs";
import { FELDNAMEN } from "./felder.mjs";

export const LECK_KATEGORIEN = Object.freeze(["KLARNAME", "BEZEICHNUNG", "KENNUNG_ROH", "KONTAKT", "IBAN", "GESUNDHEIT",
  "GEO", "ZUGANG", "RAUM", "FELD_VERBOTEN", "PERSONALNUMMER", "GEBURTSDATUM", "SPERRLISTE_FEHLT", "STRUKTUR"]);

/* ------------------------------------------------------------------------
   NORMALISIERUNG
   ------------------------------------------------------------------------ */
/** Kleinschreibung, Umlaute ausgeschrieben, Akzente weg, Trennzeichen zu Leerzeichen. */
export function normalisieren(s) {
  return String(s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
const kompakt = (n) => n.replace(/ /g, "");
const ziffern = (s) => String(s).replace(/\D+/g, "");

/* ------------------------------------------------------------------------
   SPERRLISTE AUS DEM ROHEN BETRIEB
   ------------------------------------------------------------------------ */
const MARKE = Symbol("sperrliste");
const GATTUNG = new Set(["haus", "station", "wohnbereich", "bereich", "team", "gruppe", "seniorenheim", "pflegeheim", "altenheim",
  "klinik", "klinikum", "krankenhaus", "praxis", "filiale", "abteilung", "springer", "standort", "einheit", "zentrale",
  "buero", "lager", "kueche", "verwaltung", "wohngruppe", "tagespflege", "ambulant", "ambulanter", "dienst", "pflegedienst",
  "markt", "restaurant", "betrieb", "gmbh", "ggmbh", "stiftung"]);
const NAMENSFELDER = ["vorname", "nachname", "name", "kuerzel", "kurz", "kurzname", "rufname", "geburtsname", "anzeigename"];
const KONTAKTFELDER = ["email", "emailVorher", "emailGeaendert", "telefon", "mobil", "handy", "telefonPrivat"];
const TIEFE_TEXTE = ["anschrift", "notfallkontakt", "notfall", "adresse"];
const NUMMERNFELDER = ["personalnummer", "steuerId", "sozialversicherung", "iban"];
const DATUMSFELDER = ["geburtsdatum", "geburtstag"];
const liste = (w) => (Array.isArray(w) ? w : []);

function texteIn(w, aus, tiefe = 0) {
  if (tiefe > 4 || w === null || w === undefined) return;
  if (typeof w === "string" || typeof w === "number") { aus.push(String(w)); return; }
  if (Array.isArray(w)) { for (const x of w) texteIn(x, aus, tiefe + 1); return; }
  if (typeof w === "object") for (const v of Object.values(w)) texteIn(v, aus, tiefe + 1);
}

/**
 * Die Sperrliste eines Betriebs — aus dem gespeicherten (rohen) Betrieb,
 * nicht aus der Sicht. Bleibt im Server; enthält Klartext und geht nie in
 * ein Paket, ein Protokoll oder eine Antwort.
 * @param {any} betrieb roher Betrieb (mandanten[i])
 * @param {{ raum: string }} o
 */
export function sperrlisteBilden(betrieb, { raum }) {
  const namen = new Set();          // normalisiert, ein Eintrag je Namensteil und je Vollname
  const bezeichnungen = new Set();  // Einheiten, Standorte, Objekte
  const raumTexte = new Set();      // Raum, Betrieb
  const kontakte = new Set();       // normalisiert-kompakt (E-Mail, Anschrift)
  const telefone = new Set();       // nur Ziffern
  const nummern = new Set();        // Personalnummer u. a. (Ziffern/kompakt)
  const daten = new Set();          // Geburtsdaten (JJJJ-MM-TT)
  const personIds = new Set();
  const sonstIds = new Set();
  const nameDazu = (s) => {
    const n = normalisieren(s);
    if (!n) return;
    namen.add(n);
    for (const t of n.split(" ")) if (t) namen.add(t);
  };
  for (const p of liste(betrieb && betrieb.personen)) {
    if (!p || typeof p !== "object") continue;
    for (const f of NAMENSFELDER) if (typeof p[f] === "string") nameDazu(p[f]);
    if (typeof p.vorname === "string" && typeof p.nachname === "string") nameDazu(`${p.vorname} ${p.nachname}`);
    for (const f of KONTAKTFELDER) {
      if (typeof p[f] !== "string" || !p[f]) continue;
      if (p[f].includes("@")) {
        kontakte.add(kompakt(normalisieren(p[f])));
        for (const t of normalisieren(p[f].split("@")[0]).split(" ")) if (t.length >= 4) namen.add(t);
      } else if (ziffern(p[f]).length >= 6) telefone.add(ziffern(p[f]));
    }
    for (const f of TIEFE_TEXTE) {
      const t = [];
      texteIn(p[f], t);
      for (const x of t) {
        const n = normalisieren(x);
        if (n.length >= 4) kontakte.add(kompakt(n));
        if (ziffern(x).length >= 6) telefone.add(ziffern(x));
      }
    }
    for (const f of NUMMERNFELDER) if (p[f] !== undefined && p[f] !== null && String(p[f]).trim()) {
      const z = kompakt(normalisieren(p[f]));
      if (z.length >= 3) nummern.add(z);
    }
    for (const f of DATUMSFELDER) if (typeof p[f] === "string" && /^\d{4}-\d{2}-\d{2}/.test(p[f])) daten.add(p[f].slice(0, 10));
    if (p.id !== undefined && p.id !== null && String(p.id)) personIds.add(normalisieren(p.id));
  }
  /* Bezeichnungen: der ganze Name und jedes markante Wort daraus („Lindenhof"
     aus „Wohnbereich Lindenhof"); Gattungswörter wie „Haus" oder „Station"
     allein sind kein Hinweis auf einen bestimmten Ort. */
  const bezeichnungDazu = (menge, s) => {
    const n = normalisieren(s);
    if (n.length < 2) return;
    menge.add(n);
    for (const t of n.split(" ")) if (t.length >= 5 && !GATTUNG.has(t) && !/^\d+$/.test(t)) menge.add(t);
  };
  for (const feld of ["einheiten", "standorte", "objekte", "einsatzorte"]) {
    for (const e of liste(betrieb && betrieb[feld])) {
      if (!e || typeof e !== "object") continue;
      if (typeof e.name === "string") bezeichnungDazu(bezeichnungen, e.name);
      if (e.id !== undefined && e.id !== null && normalisieren(e.id).length >= 3) sonstIds.add(normalisieren(e.id));
    }
  }
  for (const s of [raum, betrieb && betrieb.id, betrieb && betrieb.name, betrieb && betrieb.kontaktName, betrieb && betrieb.raum]) {
    if (typeof s === "string") bezeichnungDazu(raumTexte, s);
  }
  const t = [];
  texteIn(betrieb && betrieb.anschrift, t);
  for (const x of t) if (normalisieren(x).length >= 4) kontakte.add(kompakt(normalisieren(x)));
  const mitKompakt = (menge) => Object.freeze([...menge].filter(Boolean).map((e) => Object.freeze([e, kompakt(e)])));
  return Object.freeze({ [MARKE]: true, namen, bezeichnungen, raumTexte, kontakte, telefone, nummern, daten, personIds, sonstIds,
    namenK: mitKompakt(namen), bezeichnungenK: mitKompakt(bezeichnungen), raumTexteK: mitKompakt(raumTexte) });
}

/* ------------------------------------------------------------------------
   MUSTER
   ------------------------------------------------------------------------ */
const GESUNDHEIT_WORT = new Set(["krank", "kranke", "kranker", "krankheit", "krankheiten", "krankmeldung", "krankgemeldet",
  "krankgeschrieben", "au", "aub", "erkrankt", "erkrankung", "diagnose", "diagnosen", "arzt", "aerztin", "aerztlich",
  "arzttermin", "arztbesuch", "attest", "kur", "bem", "schwanger", "schwangere", "schwangerschaft", "mutterschutz",
  "muschg", "beschaeftigungsverbot", "stillzeit", "stillend", "entbindung", "elternzeit", "pflegezeit",
  "familienpflegezeit", "schwerbehindert", "schwerbehinderte", "schwerbehinderung", "gdb", "behinderung", "behindert",
  "minderjaehrig", "minderjaehrige", "jugendlich", "jugendliche", "jarbschg", "einwilligung", "einwilligungen",
  "gesundheitlich", "gesundheitszustand", "gesundheitsdaten", "psychisch", "depression", "burnout", "infektion",
  "covid", "corona", "impfung", "impfstatus", "masern", "masernschutz", "ifsg", "operation", "unfall", "verletzung",
  "sucht", "allergie", "wiedereingliederung", "arbeitsunfaehig", "arbeitsunfaehigkeit"]);
const GESUNDHEIT_STAMM = ["krankmeld", "krankgeschrieb", "krankgemeld", "krankheit", "arbeitsunfaehig", "erkrank", "diagnos",
  "schwanger", "mutterschutz", "muschg", "beschaeftigungsverbot", "schwerbehind", "wiedereingliederung", "minderjaehrig",
  "jarbschg", "sgbix", "einwilligung", "gesundheitszustand", "gesundheitsdaten", "gesundheitlich", "arztbesuch",
  "arzttermin", "aerztlich", "attest", "entbindung", "stillzeit", "elternzeit", "pflegezeit", "depression", "burnout",
  "impfstatus", "masernschutz", "hamburgermodell"];

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const AT_ERSATZ = /[([{]\s*(at|ät)\s*[)\]}]/i;
const SCHEMA_ADRESSE = /\b(https?|webcal|mailto|tel|ftp):|www\./i;
const DATUM_ODER_ZEIT = /\d{4}-\d{2}-\d{2}|\b\d{1,2}:\d{2}\b/g;
const TELEFON = /(?:\+|\b00)?\d(?:[\s/().-]?\d){6,}/;
const GEO_PAAR = /-?\d{1,3}\.\d{3,}\s*[,;/ ]\s*-?\d{1,3}\.\d{3,}/;
const GRAD = /\d+\s*°/;
const JWT = /eyJ[\w-]{5,}\.[\w-]{5,}/;
const HEX = /\b[0-9a-f]{32,}\b/i;
const SCHLUESSEL_BLOCK = /-----BEGIN|\bbearer\s+\S|\b(sk|pk|rk)[-_][A-Za-z0-9_-]{10,}|\bgh[pousr]_[A-Za-z0-9]{10,}|\bxox[abprs]-/i;
const LAUF = /[A-Za-z0-9+/_=-]{20,}/g;
const IBAN = /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/;

const VERBOTENE_SCHLUESSEL = new Set(["vorname", "nachname", "name", "kuerzel", "email", "mail", "telefon", "mobil", "handy",
  "anschrift", "adresse", "strasse", "plz", "geburtstag", "geburtsdatum", "personalnummer", "iban", "bic", "steuerid",
  "sozialversicherung", "notiz", "notizen", "bemerkung", "anmerkung", "kommentar", "grund", "begruendung", "diagnose",
  "mutterschutz", "schwerbehindert", "einwilligungen", "mutterschutzeinwilligungen", "einschraenkungen",
  "planungsregeln", "pushschluessel", "kalendergeheim", "kalenderverweis", "zustellung", "token", "passwort", "code",
  "lat", "lng", "lon", "latitude", "longitude", "koordinaten", "radius", "raum", "betrieb", "mandant", "mandanten",
  "aliaskarte", "karte", "eintraege", "personid", "person", "sitzung", "session", "schluessel"]);

/** Werte, die unser eigenes Vokabular sind (Feldnamen, Arten, Zustände …) — kein Name. */
const VOKABULAR = new Set([...ZUSTAENDE, ...FAKT_ARTEN, ...EINHEITEN, ...PRUEFSTATUS, ...FELDNAMEN, ...FUNKTIONEN_IDS,
  SCHEMA_VERSION]);

function textBefunde(s, sp, befunde, pfad) {
  const add = (k) => { if (!befunde.some((b) => b.kategorie === k && b.pfad === pfad)) befunde.push({ kategorie: k, pfad }); };
  const n = normalisieren(s);
  const k = kompakt(n);
  const woerter = n ? n.split(" ") : [];
  const wortSet = new Set(woerter);

  /* Kontakt, Zugang, Geo, IBAN — auf dem Rohtext. */
  if (EMAIL.test(s) || AT_ERSATZ.test(s) || SCHEMA_ADRESSE.test(s)) add("KONTAKT");
  const ohneDatum = s.replace(DATUM_ODER_ZEIT, " ");
  if (TELEFON.test(ohneDatum)) add("KONTAKT");
  if (IBAN.test(s.replace(/\s+/g, "").toUpperCase())) add("IBAN");
  if (GEO_PAAR.test(s) || GRAD.test(s)) add("GEO");
  if (JWT.test(s) || HEX.test(s) || SCHLUESSEL_BLOCK.test(s)) add("ZUGANG");
  for (const lauf of s.match(LAUF) || []) {
    const z = (lauf.match(/\d/g) || []).length;
    const b = (lauf.match(/[A-Za-z]/g) || []).length;
    if (z >= 3 && b >= 3) { add("ZUGANG"); break; }
  }

  /* Gesundheit und Schutzmerkmale. */
  if (woerter.some((w) => GESUNDHEIT_WORT.has(w)) || GESUNDHEIT_STAMM.some((st) => k.includes(st))
    || /\bsgb\s+ix\b/.test(n)) add("GESUNDHEIT");

  if (VOKABULAR.has(s)) return;
  /* Sperrliste. */
  /* Ab vier Zeichen als Teilzeichenfolge (auch über Trennzeichen hinweg),
     kürzer nur als ganzes Wort. */
  const treffer = (eintraege, kategorie) => {
    for (const [e, ek] of eintraege) {
      if (ek.length >= 4) { if (k.includes(ek) || n.includes(e)) { add(kategorie); return; } }
      else if (ek.length >= 2 && (wortSet.has(e) || n === e)) { add(kategorie); return; }
    }
  };
  treffer(sp.namenK, "KLARNAME");
  treffer(sp.bezeichnungenK, "BEZEICHNUNG");
  treffer(sp.raumTexteK, "RAUM");
  for (const c of sp.kontakte) if (c.length >= 4 && k.includes(c)) { add("KONTAKT"); break; }
  const zf = ziffern(s);
  for (const t of sp.telefone) if (t.length >= 6 && zf.includes(t)) { add("KONTAKT"); break; }
  for (const nr of sp.nummern) {
    if ((/^\d+$/.test(nr) && nr.length >= 4 && zf.includes(nr)) || (!/^\d+$/.test(nr) && k.includes(nr))
      || wortSet.has(nr)) { add("PERSONALNUMMER"); break; }
  }
  for (const d of sp.daten) if (s.includes(d)) { add("GEBURTSDATUM"); break; }
  /* Rohe Kennungen: als ganze Wortfolge („p 4711" in „morgen p 4711 frei"). */
  const gerahmt = ` ${n} `;
  for (const id of sp.personIds) {
    if (gerahmt.includes(` ${id} `) || (kompakt(id).length >= 3 && k === kompakt(id))) { add("KENNUNG_ROH"); break; }
  }
  for (const id of sp.sonstIds) if (gerahmt.includes(` ${id} `)) { add("KENNUNG_ROH"); break; }
}

/**
 * Prüft ein (fertiges) Faktenpaket oder jeden anderen Wert, der Richtung
 * Modell gehen soll. Fail closed.
 * @param {unknown} wert
 * @param {any} sperrliste aus sperrlisteBilden()
 * @returns {{ ok: boolean, befunde: { kategorie: string, pfad: string }[] }}
 */
export function leckPruefen(wert, sperrliste) {
  const befunde = [];
  try {
    if (!sperrliste || sperrliste[MARKE] !== true) {
      befunde.push({ kategorie: "SPERRLISTE_FEHLT", pfad: "$" });
      return { ok: false, befunde };
    }
    /* Gleiche Zeichenketten (Feldnamen, Alias, Dienstarten) kommen vielfach
       vor: einmal prüfen, das Ergebnis je Pfad übernehmen. */
    const gemerkt = new Map();
    const lauf = (w, pfad, tiefe) => {
      if (tiefe > 12) { befunde.push({ kategorie: "STRUKTUR", pfad }); return; }
      if (w === null || w === undefined || typeof w === "boolean") return;
      if (typeof w === "string") {
        if (!gemerkt.has(w)) {
          const eigene = [];
          textBefunde(w, sperrliste, eigene, "");
          gemerkt.set(w, eigene.map((b) => b.kategorie));
        }
        for (const kategorie of gemerkt.get(w)) befunde.push({ kategorie, pfad });
        return;
      }
      if (typeof w === "number") {
        if (!Number.isFinite(w)) { befunde.push({ kategorie: "STRUKTUR", pfad }); return; }
        const z = String(Math.abs(w)).replace(/\D/g, "");
        if (z.length >= 4 && [...sperrliste.nummern].some((nr) => nr === z)) befunde.push({ kategorie: "PERSONALNUMMER", pfad });
        if (z.length >= 6 && [...sperrliste.telefone].some((t) => t === z)) befunde.push({ kategorie: "KONTAKT", pfad });
        return;
      }
      if (typeof w !== "object") { befunde.push({ kategorie: "STRUKTUR", pfad }); return; }
      if (Array.isArray(w)) { w.forEach((x, i) => lauf(x, `${pfad}[${i}]`, tiefe + 1)); return; }
      const proto = Object.getPrototypeOf(w);
      if (proto !== Object.prototype && proto !== null) { befunde.push({ kategorie: "STRUKTUR", pfad }); return; }
      for (const k of Object.keys(w)) {
        if (VERBOTENE_SCHLUESSEL.has(k.toLowerCase())) befunde.push({ kategorie: "FELD_VERBOTEN", pfad: `${pfad}.${k}` });
        lauf(w[k], `${pfad}.${k}`, tiefe + 1);
      }
    };
    lauf(wert, "$", 0);
  } catch {
    befunde.push({ kategorie: "STRUKTUR", pfad: "$" });
  }
  return { ok: befunde.length === 0, befunde };
}

/** Prüft einen einzelnen Text (Fremdtext vor der Kapselung). */
export function textPruefen(text, sperrliste) {
  return leckPruefen({ text: String(text) }, sperrliste);
}

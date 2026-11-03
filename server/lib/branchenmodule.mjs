/* ==========================================================================
   BRANCHENMODULE — Registry und Aktivierung je Betrieb (WP-19, Kern)

   Ein Branchenpaket (src/stufen.js, PAKETE) verkauft Merkmale. Zwölf davon
   sind Fachmodule, die erst gebaut werden: Posten, Wachbuch, Objektbericht
   (Sicherheit); Bereichsplan, Pflegequalifikation (Pflege);
   Bereitschaftsdienst, geteilter Dienst, Funktionsdienst, Rotation (Klinik);
   Anlagen, Maschinenqualifikation, Kontimodelle (Industrie).

   Diese Datei ist der gemeinsame Kern, den alle zwölf teilen — und der
   stabile Vertrag zwischen Kern und Modul:

     - BRANCHENMODULE   die Registry: je Modul Merkmal, Pakete, Status,
                        Abhängigkeiten, Parameter (mit Typ und Vorgabe),
                        Registerregeln und Datenfelder.
     - modulAktiv       gebucht (Paket, Vertrag des Betreibers) UND nicht
                        mehr „geplant" UND vom Betrieb eingeschaltet.
     - branchenmoduleZusammen
                        Schreibweg der Moduleinstellungen auf dem Server:
                        nur org.edit (Leitung, Kundenrolle), feste Form,
                        Wann und Wer setzt der Server.

   Was diese Datei NICHT ist: eine Prüfmaschine. Fachliche Regeln eines
   Moduls stehen als Einträge im einen Regelregister (server/lib/
   branchenkatalog.mjs → src/regelregister.js) und werden dort bewertet.
   Kein Modul bringt eine eigene Stufenlogik mit.

   Bis zur Nutzerentscheidung (docs/acc45/wp19-module.md) ist jedes Modul
   „geplant": Es lässt sich nicht einschalten und wirkt nicht, auch wenn ein
   Schalter gespeichert wäre.

   Rein: keine Ablage, keine Uhr außer dem Zeitstempel beim Schreiben.
   ========================================================================== */
/* Gegenseitiger Import mit dem Katalog: beide lesen einander nur in
   Funktionen, nie beim Laden. */
import { REGELN_BRANCHEN } from "./branchenkatalog.mjs";

/**
 * Status eines Moduls.
 *   geplant      nicht gebaut oder fachlich nicht entschieden — lässt sich nicht einschalten, wirkt nie
 *   vorlaeufig   gebaut, Fachregeln vorläufig (höchstens Hinweis); einschaltbar
 *   freigegeben  vom Nutzer abgenommen
 * @typedef {"geplant" | "vorlaeufig" | "freigegeben"} ModulStatus
 */
export const MODUL_STATUS = Object.freeze(["geplant", "vorlaeufig", "freigegeben"]);

/** @typedef {"boolean" | "zahl" | "text" | "auswahl"} ParameterTyp */
export const PARAMETER_TYPEN = Object.freeze(["boolean", "zahl", "text", "auswahl"]);

/**
 * Ein Parameter, den der Betrieb an einem Modul einstellt.
 * `vorlaeufig: true` heißt: Die Vorgabe ist eine Annahme, keine Nutzerentscheidung.
 * @typedef {{
 *   typ: ParameterTyp,
 *   standard: any,
 *   min?: number, max?: number, ganzzahl?: boolean,
 *   werte?: string[],
 *   maxLaenge?: number,
 *   vorlaeufig?: boolean,
 *   text?: string,
 * }} ParameterSchema
 */

/**
 * Ein Branchenmodul — der Vertrag zwischen Kern und Modul.
 * @typedef {{
 *   id: string,
 *   merkmal: string,
 *   name: string,
 *   pakete: string[],
 *   status: ModulStatus,
 *   abhaengigVon: string[],
 *   mitbestimmung: boolean,
 *   parameter: Record<string, ParameterSchema>,
 *   regelIds: string[],
 *   datenfelder: string[],
 *   beschreibung?: string,
 * }} BranchenModul
 *
 * id            stabile Kennung, gleich dem Merkmal in PAKETE (src/stufen.js)
 * pakete        die Pakete, die das Merkmal verkaufen (Vertragstest gegen PAKETE)
 * abhaengigVon  Module, die aktiv sein müssen, damit dieses wirkt
 * mitbestimmung Einschalten berührt § 87 Abs. 1 Nr. 6 BetrVG (Hinweis beim Einschalten; Entscheidung G9)
 * regelIds      Kennungen im Regelregister (REGELN_BRANCHEN), die zu diesem Modul gehören
 * datenfelder   Betriebsfelder, die das Modul anlegt — jedes braucht einen Eintrag im
 *               Positivkatalog (server/lib/sicht.mjs) und eine Zeile in RECHTEMATRIX.md,
 *               bevor das Modul „vorlaeufig" wird
 */

/**
 * Die gespeicherte Einstellung eines Moduls am Betrieb
 * (`mandant.einstellungen.branchenmodule[modulId]`).
 * @typedef {{ an: boolean, parameter?: Record<string, any>, geaendertAm?: string, geaendertVon?: string | null }} ModulEinstellung
 */

/** @param {Omit<BranchenModul, "status" | "abhaengigVon" | "mitbestimmung" | "parameter" | "regelIds" | "datenfelder"> & Partial<BranchenModul>} e
    @returns {BranchenModul} */
const modul = (e) => Object.freeze({ status: "geplant", abhaengigVon: [], mitbestimmung: false, parameter: {},
  regelIds: [], datenfelder: [], ...e });

/* Die zwölf Module. Alle „geplant" — fachliche Fragen stehen in der
   Entscheidungsmatrix, Akzeptanzkriterien (vorläufig) in
   docs/acc45/wp19-module.md. Parameter werden erst mit der Entscheidung
   eingetragen; eine Vorgabe ohne Entscheidung trägt `vorlaeufig: true`. */
/** @type {readonly BranchenModul[]} */
export const BRANCHENMODULE = Object.freeze([
  /* Sicherheit */
  modul({ id: "posten", merkmal: "posten", name: "Objektbezogene Posten", pakete: ["sicherheit"],
    beschreibung: "Objekte mit Posten, Sollbesetzung und Anforderungen je Posten; Einteilung auf Posten." }),
  modul({ id: "wachbuch", merkmal: "wachbuch", name: "Wachbuch", pakete: ["sicherheit"], mitbestimmung: true,
    beschreibung: "Fortlaufende Einträge je Objekt und Dienst (Vorkommnisse, Kontrollgänge, Übergaben), Nachträge statt Änderung." }),
  modul({ id: "objektbericht", merkmal: "objektbericht", name: "Objektbericht", pakete: ["sicherheit"], mitbestimmung: true,
    abhaengigVon: ["posten"],
    beschreibung: "Bericht je Objekt und Zeitraum für den Auftraggeber: Soll- und Ist-Besetzung der Posten, optional Wachbuchauszug." }),
  /* Pflege */
  modul({ id: "bereichsplan", merkmal: "bereichsplan", name: "Bereichs- und Wachabteilungsplanung", pakete: ["pflege"],
    beschreibung: "Zuordnung der Personen eines Dienstes zu Bereichen (Tageseinsatzplan) mit Besetzung je Bereich." }),
  modul({ id: "pflegequal", merkmal: "pflegequal", name: "Pflegequalifikationen", pakete: ["pflege"],
    beschreibung: "Qualifikationsniveaus und Betreuungskräfte nach § 43b SGB XI in der Besetzung je Dienst." }),
  /* Klinik */
  modul({ id: "bereitschaftsdienst", merkmal: "bereitschaftsdienst", name: "Bereitschaftsdienst und Rufbereitschaft mit Anrechnung",
    pakete: ["klinik"],
    beschreibung: "Bereitschaftsstufen mit Anrechnungsfaktor, Inanspruchnahme, Anrechnung auf Höchstarbeitszeit." }),
  modul({ id: "geteilterdienst", merkmal: "geteilterdienst", name: "Geteilte Dienste", pakete: ["klinik"],
    beschreibung: "Dienste mit zwei Abschnitten: Bearbeitung, Dauer, Ruhezeit und Besetzung je Abschnitt." }),
  modul({ id: "funktionsdienst", merkmal: "funktionsdienst", name: "Funktionsdienste", pakete: ["klinik"],
    beschreibung: "Funktionsbereiche (etwa OP, Anästhesie, Endoskopie) mit eigener Besetzung und Qualifikation." }),
  modul({ id: "rotation", merkmal: "rotation", name: "Rotationen", pakete: ["klinik"],
    beschreibung: "Geplante Wechsel von Personen zwischen Einheiten über Zeiträume (Einsatzrotation)." }),
  /* Industrie */
  modul({ id: "anlagen", merkmal: "anlagen", name: "Anlagenbindung", pakete: ["industrie"],
    beschreibung: "Anlagen als Einsatzort mit Mindestbesetzung und Laufzeitkalender." }),
  modul({ id: "maschinenqual", merkmal: "maschinenqual", name: "Maschinenqualifikationen", pakete: ["industrie"],
    abhaengigVon: ["anlagen"],
    beschreibung: "Qualifikationsmatrix Person × Anlage mit Ablauf und Unterweisung." }),
  modul({ id: "kontimodelle", merkmal: "kontimodelle", name: "Kontischichtmodelle mit Stufenversatz", pakete: ["industrie"],
    beschreibung: "Assistent für Schichtgruppen, Versatz und Jahresarbeitszeit im kontinuierlichen Betrieb.",
    /* Rechnung: server/lib/modul-kontimodelle.mjs. Keine Registerregel (Matrix K1 a), keine neuen Daten —
       der Assistent setzt Schichtfolge und Einheiten über die bestehenden Felder (pattern.edit). */
    parameter: {
      sollWochenstunden: { typ: "zahl", standard: 40, min: 1, max: 60, ganzzahl: false, vorlaeufig: true,
        text: "Vertragliche Wochenarbeitszeit, gegen die der Assistent die Jahresarbeitszeit abgleicht." },
      stundenJeFreischicht: { typ: "zahl", standard: 8, min: 1, max: 24, ganzzahl: false, vorlaeufig: true,
        text: "Dauer einer Freischicht für den Ausgleichsvorschlag (Matrix K2 c)." },
    } }),
]);

const hat = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * Das Modul zu einer Kennung, sonst null.
 * @param {string} id
 * @param {readonly BranchenModul[]} [liste]
 * @returns {BranchenModul | null}
 */
export function modulVon(id, liste = BRANCHENMODULE) {
  for (const x of liste) if (x.id === id) return x;
  return null;
}

/**
 * Ist das Modul über ein gebuchtes Paket verfügbar? Die Pakete sind
 * Vertragsfeld (nur der Betreiber schreibt sie, server/lib/rechte.mjs).
 * @param {any} m Betrieb
 * @param {string} id
 * @param {readonly BranchenModul[]} [liste]
 */
export function modulGebucht(m, id, liste = BRANCHENMODULE) {
  const mod = modulVon(id, liste);
  if (!mod || !m || !Array.isArray(m.pakete)) return false;
  return mod.pakete.some((p) => m.pakete.includes(p));
}

/**
 * Die gespeicherte Einstellung des Moduls am Betrieb, sonst null.
 * @param {any} m
 * @param {string} id
 * @returns {ModulEinstellung | null}
 */
export function modulEinstellung(m, id) {
  const bm = m && istObjekt(m.einstellungen) && istObjekt(m.einstellungen.branchenmodule) ? m.einstellungen.branchenmodule : null;
  return bm && hat(bm, id) && istObjekt(bm[id]) ? bm[id] : null;
}

/**
 * Wirkt das Modul in diesem Betrieb? Gebucht, nicht geplant, eingeschaltet
 * (Vorgabe: aus) und alle Abhängigkeiten ebenso aktiv.
 * @param {any} m
 * @param {string} id
 * @param {readonly BranchenModul[]} [liste]
 * @returns {boolean}
 */
export function modulAktiv(m, id, liste = BRANCHENMODULE, _besucht = new Set()) {
  const mod = modulVon(id, liste);
  if (!mod || mod.status === "geplant" || _besucht.has(id)) return false;
  if (!modulGebucht(m, id, liste)) return false;
  const e = modulEinstellung(m, id);
  if (!e || e.an !== true) return false;
  _besucht.add(id);
  return mod.abhaengigVon.every((a) => modulAktiv(m, a, liste, _besucht));
}

/** Ist ein Wert für das Schema gültig? Liefert den Grund, sonst null. */
function wertFehler(schema, w) {
  switch (schema.typ) {
    case "boolean": return typeof w === "boolean" ? null : "erwartet wahr oder falsch";
    case "zahl":
      if (typeof w !== "number" || !Number.isFinite(w)) return "erwartet eine Zahl";
      if (schema.ganzzahl !== false && !Number.isInteger(w)) return "erwartet eine ganze Zahl";
      if (typeof schema.min === "number" && w < schema.min) return `mindestens ${schema.min}`;
      if (typeof schema.max === "number" && w > schema.max) return `höchstens ${schema.max}`;
      return null;
    case "text":
      if (typeof w !== "string") return "erwartet Text";
      return w.length > (schema.maxLaenge || 200) ? `höchstens ${schema.maxLaenge || 200} Zeichen` : null;
    case "auswahl": return Array.isArray(schema.werte) && schema.werte.includes(w) ? null : `erlaubt: ${(schema.werte || []).join(", ")}`;
    default: return "unbekannter Typ";
  }
}

/**
 * Die wirksamen Parameter eines Moduls: Vorgaben der Registry, überschrieben
 * von gültigen gespeicherten Werten. Ungültiges fällt auf die Vorgabe zurück.
 * @param {any} m
 * @param {string} id
 * @param {readonly BranchenModul[]} [liste]
 * @returns {Record<string, any>}
 */
export function modulParameter(m, id, liste = BRANCHENMODULE) {
  const mod = modulVon(id, liste);
  if (!mod) return {};
  const e = modulEinstellung(m, id);
  const gespeichert = e && istObjekt(e.parameter) ? e.parameter : {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, s] of Object.entries(mod.parameter)) out[k] = hat(gespeichert, k) && !wertFehler(s, gespeichert[k]) ? gespeichert[k] : s.standard;
  return out;
}

/**
 * Prüft die Form einer übermittelten Moduleinstellung: { an: boolean,
 * parameter?: {...} } — `geaendertAm`/`geaendertVon` sind erlaubt und werden
 * vom Server überschrieben. Liefert den Grund, sonst null.
 * @param {string} id
 * @param {any} wert
 * @param {readonly BranchenModul[]} [liste]
 * @returns {string | null}
 */
export function pruefeModulEinstellung(id, wert, liste = BRANCHENMODULE) {
  const mod = modulVon(id, liste);
  if (!mod) return `Branchenmodul „${String(id).slice(0, 40)}" ist unbekannt.`;
  const form = `Branchenmodul ${mod.name}: erwartet wird { an: true oder false, parameter: {…} }.`;
  if (!istObjekt(wert) || typeof wert.an !== "boolean") return form;
  if (Object.keys(wert).some((k) => !["an", "parameter", "geaendertAm", "geaendertVon"].includes(k))) return form;
  if (hat(wert, "parameter")) {
    if (!istObjekt(wert.parameter)) return form;
    for (const [k, w] of Object.entries(wert.parameter)) {
      if (!hat(mod.parameter, k)) return `Branchenmodul ${mod.name}: Parameter „${String(k).slice(0, 40)}" ist unbekannt.`;
      const f = wertFehler(mod.parameter[k], w);
      if (f) return `Branchenmodul ${mod.name}, Parameter ${k}: ${f}.`;
    }
  }
  return null;
}

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const kern = (e) => (istObjekt(e) ? { an: e.an, parameter: istObjekt(e.parameter) ? e.parameter : {} } : null);

/**
 * Schreibweg der Moduleinstellungen (`einstellungen.branchenmodule`) auf dem
 * Server, analog zum Geo-Schalter und zum Jugendschutz (server/lib/rechte.mjs).
 *
 *   - Ändern darf nur, wer org.edit hat (Leitung, Kundenrolle). Für alle
 *     anderen bleibt der gespeicherte Stand — auch wenn sie ihn löschen.
 *   - Fehlt das Feld in der Übermittlung, bleibt der gespeicherte Stand.
 *   - Unbekanntes Modul oder falsche Form: abgewiesen.
 *   - Einschalten nur, wenn das Modul gebucht und nicht „geplant" ist;
 *     Ausschalten geht immer.
 *   - Wann und Wer eines geänderten Eintrags setzt der Server.
 *
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb
 * @param {{ person?: any }} sitzung
 * @param {boolean} darfOrgEdit
 * @param {readonly BranchenModul[]} [liste]
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function branchenmoduleZusammen(altM, neuM, sitzung, darfOrgEdit, liste = BRANCHENMODULE) {
  if (!istObjekt(neuM) || !istObjekt(neuM.einstellungen)) return { mandant: neuM };
  const altE = altM && istObjekt(altM.einstellungen) ? altM.einstellungen : {};
  const alt = istObjekt(altE.branchenmodule) ? altE.branchenmodule : null;
  const e = { ...neuM.einstellungen };
  const behalten = () => {
    if (alt) e.branchenmodule = alt; else delete e.branchenmodule;
    return { mandant: { ...neuM, einstellungen: e } };
  };
  if (!hat(e, "branchenmodule") || !darfOrgEdit) return behalten();
  const neu = e.branchenmodule;
  if (!istObjekt(neu)) return { grund: "Branchenmodule: erwartet wird je Modul { an: true oder false }." };
  /** @type {Record<string, ModulEinstellung>} */
  const ergebnis = alt ? { ...alt } : {};
  const jetzt = new Date().toISOString();
  for (const [id, wert] of Object.entries(neu)) {
    const fehler = pruefeModulEinstellung(id, wert, liste);
    if (fehler) return { grund: fehler };
    const vorher = alt && hat(alt, id) ? alt[id] : null;
    if (vorher && gleich(kern(vorher), kern(wert))) continue;            // unverändert: Wann und Wer bleiben
    const mod = /** @type {BranchenModul} */ (modulVon(id, liste));
    if (wert.an === true) {
      if (mod.status === "geplant") return { grund: `Branchenmodul ${mod.name} ist noch nicht verfügbar.` };
      if (!modulGebucht(altM, id, liste)) return { grund: `Branchenmodul ${mod.name}: Das Paket ist nicht gebucht.` };
    }
    /** @type {ModulEinstellung} */
    const neuEintrag = { an: wert.an, geaendertAm: jetzt, geaendertVon: sitzung && sitzung.person !== undefined ? sitzung.person : null };
    if (hat(wert, "parameter") && Object.keys(wert.parameter).length) neuEintrag.parameter = { ...wert.parameter };
    ergebnis[id] = neuEintrag;
  }
  /* Ein Modul, das in der Übermittlung fehlt, bleibt wie gespeichert —
     Ausschalten heißt { an: false }, nicht Weglassen. */
  if (!Object.keys(ergebnis).length) return behalten();
  e.branchenmodule = ergebnis;
  return { mandant: { ...neuM, einstellungen: e } };
}

/**
 * Selbstprüfung der Registry (Vertrag). Leere Liste heißt: stimmig.
 * Regelkennungen werden gegen den Branchenkatalog geprüft, wenn er übergeben wird.
 * @param {readonly BranchenModul[]} [liste]
 * @param {{ regelIds?: string[] }} [o]
 * @returns {string[]}
 */
export function pruefeModulRegistry(liste = BRANCHENMODULE, { regelIds = null } = {}) {
  const m = [];
  const ids = new Set();
  const alle = new Set(liste.map((x) => x && x.id));
  for (const x of liste) {
    const wo = x && x.id ? x.id : "(ohne Kennung)";
    if (!x || typeof x.id !== "string" || !/^[a-z][a-z0-9]*$/.test(x.id)) { m.push(`${wo}: Kennung ungültig`); continue; }
    if (ids.has(x.id)) m.push(`${wo}: Kennung doppelt`);
    ids.add(x.id);
    if (x.merkmal !== x.id) m.push(`${wo}: Merkmal muss der Kennung entsprechen`);
    if (!x.name) m.push(`${wo}: Name fehlt`);
    if (!MODUL_STATUS.includes(x.status)) m.push(`${wo}: Status „${x.status}" unbekannt`);
    if (!Array.isArray(x.pakete) || !x.pakete.length) m.push(`${wo}: kein Paket`);
    if (typeof x.mitbestimmung !== "boolean") m.push(`${wo}: mitbestimmung fehlt`);
    for (const a of x.abhaengigVon || []) if (!alle.has(a) || a === x.id) m.push(`${wo}: Abhängigkeit „${a}" unbekannt`);
    for (const [k, s] of Object.entries(x.parameter || {})) {
      if (!s || !PARAMETER_TYPEN.includes(s.typ)) { m.push(`${wo}: Parameter ${k} hat einen unbekannten Typ`); continue; }
      const f = wertFehler(s, s.standard);
      if (f) m.push(`${wo}: Parameter ${k}: Vorgabe ungültig (${f})`);
    }
    if (!Array.isArray(x.datenfelder)) m.push(`${wo}: datenfelder fehlt`);
    const bekannt = regelIds || REGELN_BRANCHEN.map((r) => r.id);
    for (const r of x.regelIds || []) if (!bekannt.includes(r)) m.push(`${wo}: Regel ${r} steht nicht im Branchenkatalog`);
  }
  return m;
}

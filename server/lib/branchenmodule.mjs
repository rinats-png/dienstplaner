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
                        Schalter, Mitbestimmungsbestätigung (G6),
                        betriebliche Regelwerte (G4) und Modulprotokoll —
                        nur org.edit (Leitung, Kundenrolle), feste Form,
                        Wann und Wer setzt der Server (WP-19.0).
     - modulNurLesen, moduleinstellungenSicht, modulZustand
                        Abschalten (G3), Sicht je Rolle, Stand für die
                        Oberfläche (WP-19.0).

   Was diese Datei NICHT ist: eine Prüfmaschine. Fachliche Regeln eines
   Moduls stehen als Einträge im einen Regelregister (server/lib/
   branchenkatalog.mjs → src/regelregister.js) und werden dort bewertet.
   Kein Modul bringt eine eigene Stufenlogik mit.

   Jedes Modul ist „geplant", bis sein Paket abgenommen ist (WP-19.13,
   pruefeModulStatus): Es lässt sich nicht einschalten und wirkt nicht, auch
   wenn ein Schalter gespeichert wäre. Der gemeinsame Kern (WP-19.0) hebt
   kein Modul an; Nachweis docs/acc45/wp19-0-nachweis.md.

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
 *   abnahme?: { datum: string, nachweis: string },
 * }} BranchenModul
 *
 * id            stabile Kennung, gleich dem Merkmal in PAKETE (src/stufen.js)
 * pakete        die Pakete, die das Merkmal verkaufen (Vertragstest gegen PAKETE)
 * abhaengigVon  Module, die aktiv sein müssen, damit dieses wirkt
 * mitbestimmung Einschalten berührt § 87 Abs. 1 Nr. 6 BetrVG: nur mit Bestätigung der Leitung (Entscheidung G6)
 * regelIds      Kennungen im Regelregister (REGELN_BRANCHEN), die zu diesem Modul gehören
 * datenfelder   Betriebsfelder, die das Modul anlegt — jedes braucht einen Eintrag im
 *               Positivkatalog (server/lib/sicht.mjs) und eine Zeile in RECHTEMATRIX.md,
 *               bevor das Modul „vorlaeufig" wird
 */

/**
 * Die gespeicherte Einstellung eines Moduls am Betrieb
 * (`mandant.einstellungen.branchenmodule[modulId]`).
 * @typedef {{ an: boolean, parameter?: Record<string, any>, geaendertAm?: string, geaendertVon?: string | null,
 *   mitbestimmung?: { grundlage: string, bestaetigtAm: string, bestaetigtVon: string | null } }} ModulEinstellung
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
    beschreibung: "Objekte mit Posten, Sollbesetzung und Anforderungen je Posten; Einteilung auf Posten.",
    /* server/lib/modul-posten.mjs: zwei Betriebsfelder (Positivkatalog in sicht.mjs, RECHTEMATRIX). Die Posten-Dienstarten
       des Bestands (posten:true/quelle) bleiben unverändert (Matrix G10 a). */
    datenfelder: ["objekte", "postenPlan"], regelIds: ["POSTEN-BESETZUNG-01", "POSTEN-QUAL-01"] }),
  modul({ id: "wachbuch", merkmal: "wachbuch", name: "Wachbuch", pakete: ["sicherheit"], mitbestimmung: true,
    beschreibung: "Fortlaufende Einträge je Objekt und Dienst (Vorkommnisse, Kontrollgänge, Übergaben), Nachträge statt Änderung." }),
  modul({ id: "objektbericht", merkmal: "objektbericht", name: "Objektbericht", pakete: ["sicherheit"], mitbestimmung: true,
    abhaengigVon: ["posten"],
    beschreibung: "Bericht je Objekt und Zeitraum für den Auftraggeber: Soll- und Ist-Besetzung der Posten, optional Wachbuchauszug." }),
  /* Pflege */
  modul({ id: "bereichsplan", merkmal: "bereichsplan", name: "Bereichs- und Wachabteilungsplanung", pakete: ["pflege"],
    beschreibung: "Zuordnung der Personen eines Dienstes zu Bereichen (Tageseinsatzplan) mit Besetzung je Bereich.",
    /* server/lib/modul-bereichsplan.mjs: Bereiche je Einheit (einheiten[].bereiche) und das Betriebsfeld bereichsPlan. */
    datenfelder: ["bereichsPlan"], regelIds: ["BEREICH-BESETZUNG-01"] }),
  modul({ id: "pflegequal", merkmal: "pflegequal", name: "Pflegequalifikationen", pakete: ["pflege"],
    beschreibung: "Qualifikationsniveaus und Betreuungskräfte nach § 43b SGB XI in der Besetzung je Dienst." }),
  /* Klinik */
  modul({ id: "bereitschaftsdienst", merkmal: "bereitschaftsdienst", name: "Bereitschaftsdienst und Rufbereitschaft mit Anrechnung",
    pakete: ["klinik"],
    beschreibung: "Bereitschaftsstufen mit Anrechnungsfaktor, Inanspruchnahme, Anrechnung auf Höchstarbeitszeit." }),
  modul({ id: "geteilterdienst", merkmal: "geteilterdienst", name: "Geteilte Dienste", pakete: ["klinik"],
    beschreibung: "Dienste mit zwei Abschnitten: Bearbeitung, Dauer, Ruhezeit und Besetzung je Abschnitt.",
    /* server/lib/modul-geteilterdienst.mjs: Feld zweiterAbschnitt der Dienstart (Bestand) — keine neuen Betriebsfelder. */
    regelIds: ["GETEILT-RUHE-01", "GETEILT-SPANNE-01"],
    parameter: {
      hoechstSpanneStunden: { typ: "zahl", standard: 0, min: 0, max: 24, ganzzahl: false, vorlaeufig: true,
        text: "Höchstspanne vom Beginn des ersten bis zum Ende des zweiten Abschnitts; 0 = keine Grenze (Matrix T2 b)." },
    } }),
  modul({ id: "funktionsdienst", merkmal: "funktionsdienst", name: "Funktionsdienste", pakete: ["klinik"],
    beschreibung: "Funktionsbereiche (etwa OP, Anästhesie, Endoskopie) mit eigener Besetzung und Qualifikation." }),
  modul({ id: "rotation", merkmal: "rotation", name: "Rotationen", pakete: ["klinik"],
    beschreibung: "Geplante Wechsel von Personen zwischen Einheiten über Zeiträume (Einsatzrotation)." }),
  /* Industrie */
  modul({ id: "anlagen", merkmal: "anlagen", name: "Anlagenbindung", pakete: ["industrie"],
    beschreibung: "Anlagen als Einsatzort mit Mindestbesetzung und Laufzeitkalender.",
    /* server/lib/modul-anlagen.mjs: Betriebsmittel der Art „anlage" (Matrix A1 a), Felder
       mindestBesetzung und laufzeit — keine neuen Betriebsfelder. */
    regelIds: ["ANLAGEN-BESETZUNG-01"] }),
  modul({ id: "maschinenqual", merkmal: "maschinenqual", name: "Maschinenqualifikationen", pakete: ["industrie"],
    abhaengigVon: ["anlagen"],
    beschreibung: "Qualifikationsmatrix Person × Anlage mit Ablauf und Unterweisung.",
    /* server/lib/modul-maschinenqual.mjs: bestehende Kompetenzen (Matrix M1 a), Feld befaehigtePerson (M3 a). */
    regelIds: ["MASCHQUAL-BESETZUNG-01"] }),
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
  /* G6: Ein mitbestimmungsrelevantes Modul wirkt nur mit gespeicherter Bestätigung
     (Grundlage und Zeitpunkt vom Server) — auch wenn ein Schalter auf anderem Weg
     in den Bestand kam (Wiederherstellen, Einspielen). */
  if (mod.mitbestimmung && !mitbestimmungBestaetigt(e)) return false;
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

/* --------------------------------------------------------------------------
   MITBESTIMMUNG (Entscheidung G6)

   Module mit `mitbestimmung: true` (Wachbuch, Objektbericht) lassen sich nur
   mit einer Bestätigung der Leitung einschalten: dass die Voraussetzungen der
   Mitbestimmung geklärt sind, mit der dokumentierten Grundlage (Text oder
   Verweis, etwa Betriebsvereinbarung). Gespeichert wird
   `mitbestimmung: { grundlage, bestaetigtAm, bestaetigtVon }` — Zeit und
   Person setzt der Server. Die Bestätigung ersetzt keine Mitbestimmung.
   -------------------------------------------------------------------------- */
export const MITBESTIMMUNG_HINWEIS = "Diese Bestätigung dokumentiert nur, dass die Leitung die Voraussetzungen der "
  + "Mitbestimmung (§ 87 Abs. 1 Nr. 6 BetrVG) geklärt hat. Sie ersetzt keine Mitbestimmung des Betriebsrats und "
  + "keine Betriebsvereinbarung.";
export const GRUNDLAGE_MAX = 1000;

/** Trägt die gespeicherte Einstellung eine vollständige Bestätigung (vom Server gesetzt)? */
export function mitbestimmungBestaetigt(e) {
  const b = istObjekt(e) && istObjekt(e.mitbestimmung) ? e.mitbestimmung : null;
  return !!b && typeof b.grundlage === "string" && !!b.grundlage.trim() && typeof b.bestaetigtAm === "string" && !!b.bestaetigtAm;
}

/** Form einer übermittelten Bestätigung; Grund oder null. */
function mitbestimmungFehler(mod, b) {
  const form = `Branchenmodul ${mod.name}: Mitbestimmung — erwartet wird { bestaetigt: true, grundlage: "…" }.`;
  if (!istObjekt(b)) return form;
  if (Object.keys(b).some((k) => !["bestaetigt", "grundlage", "bestaetigtAm", "bestaetigtVon"].includes(k))) return form;
  if (hat(b, "bestaetigt") && b.bestaetigt !== true) return form;
  if (typeof b.grundlage !== "string" || !b.grundlage.trim())
    return `Branchenmodul ${mod.name}: Mitbestimmung — die dokumentierte Grundlage fehlt.`;
  if (b.grundlage.length > GRUNDLAGE_MAX) return `Branchenmodul ${mod.name}: Mitbestimmung — Grundlage höchstens ${GRUNDLAGE_MAX} Zeichen.`;
  return null;
}

/**
 * Prüft die Form einer übermittelten Moduleinstellung: { an: boolean,
 * parameter?: {...}, mitbestimmung?: { bestaetigt: true, grundlage } } —
 * `geaendertAm`/`geaendertVon` (und an der Bestätigung `bestaetigtAm`/
 * `bestaetigtVon`) sind erlaubt und werden vom Server überschrieben.
 * Liefert den Grund, sonst null.
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
  if (Object.keys(wert).some((k) => !["an", "parameter", "mitbestimmung", "geaendertAm", "geaendertVon"].includes(k))) return form;
  if (hat(wert, "parameter")) {
    if (!istObjekt(wert.parameter)) return form;
    for (const [k, w] of Object.entries(wert.parameter)) {
      if (!hat(mod.parameter, k)) return `Branchenmodul ${mod.name}: Parameter „${String(k).slice(0, 40)}" ist unbekannt.`;
      const f = wertFehler(mod.parameter[k], w);
      if (f) return `Branchenmodul ${mod.name}, Parameter ${k}: ${f}.`;
    }
  }
  if (hat(wert, "mitbestimmung")) return mitbestimmungFehler(mod, wert.mitbestimmung);
  return null;
}

/* --------------------------------------------------------------------------
   BETRIEBLICHE REGELWERTE (Grundsatz 3, Entscheidung G4)

   `einstellungen.regelwerte[regelId]` hält, was der Betrieb zu einer Regel
   des Branchenkatalogs (REGELN_BRANCHEN) festgelegt hat: Wert, Quelle,
   Fundstelle, Version, Gültigkeit, Prüfstatus und Stufe.

     - Stufe höchstens „achtung" — nie „recht": eine Branchenregel wird nie
       automatisch als Rechtsverstoß eingestuft (G4), und nie eine Sperre (G5).
     - „achtung" nur mit Prüfstatus „verified"; „verified" nur mit Quelle,
       Fundstelle, Version und Gültigkeitsbeginn (dokumentierte Quellenprüfung).
     - Ungeprüft („provisional") bleibt jeder Wert ein Hinweis und wird nie als
       geltendes Recht dargestellt.
     - Schreiben nur mit org.edit; Wann/Wer der Änderung und der Prüfung setzt
       der Server (geaendertAm/-Von, geprueftAm/-Von).
   -------------------------------------------------------------------------- */
export const REGELWERT_STUFEN = Object.freeze(["hinweis", "achtung"]);
export const REGELWERT_PRUEFSTATUS = Object.freeze(["provisional", "verified"]);
const REGELWERT_FELDER = ["wert", "quelle", "fundstelle", "version", "gueltigAb", "gueltigBis", "pruefstatus", "stufe",
  "geprueftAm", "geprueftVon", "geaendertAm", "geaendertVon"];
const REGELWERT_SERVER = ["geprueftAm", "geprueftVon", "geaendertAm", "geaendertVon"];
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const gueltigerTag = (t) => typeof t === "string" && TAG.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`))
  && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;
const textFeld = (w, max) => w === undefined || w === null || (typeof w === "string" && w.length <= max);
const voll = (w) => typeof w === "string" && !!w.trim();

/**
 * Prüft einen betrieblichen Regelwert. Liefert den Grund, sonst null.
 * @param {string} regelId Kennung im Branchenkatalog
 * @param {any} w
 * @param {readonly any[]} [katalog]
 * @returns {string | null}
 */
export function pruefeRegelwert(regelId, w, katalog = REGELN_BRANCHEN) {
  const id = String(regelId).slice(0, 60);
  if (!katalog.some((r) => r && r.id === regelId)) return `Regelwert: Regel „${id}" ist im Branchenkatalog unbekannt.`;
  const wo = `Regelwert ${id}`;
  if (!istObjekt(w)) return `${wo}: erwartet wird { pruefstatus, stufe, quelle, fundstelle, version, gueltigAb, … }.`;
  const fremd = Object.keys(w).find((k) => !REGELWERT_FELDER.includes(k));
  if (fremd) return `${wo}: Feld „${String(fremd).slice(0, 40)}" ist unbekannt.`;
  if (w.stufe === "recht") return `${wo}: „recht" ist für Branchenregeln nicht zulässig — höchstens „achtung" (keine automatische Einstufung als Rechtsverstoß).`;
  if (!REGELWERT_STUFEN.includes(w.stufe)) return `${wo}: Stufe „hinweis" oder „achtung" erwartet.`;
  if (!REGELWERT_PRUEFSTATUS.includes(w.pruefstatus)) return `${wo}: Prüfstatus „provisional" oder „verified" erwartet.`;
  if (!(w.wert === undefined || w.wert === null || typeof w.wert === "boolean" || (typeof w.wert === "number" && Number.isFinite(w.wert))
    || (typeof w.wert === "string" && w.wert.length <= 200))) return `${wo}: Wert muss Zahl, Wahrheitswert oder Text (höchstens 200 Zeichen) sein.`;
  if (!textFeld(w.quelle, 200)) return `${wo}: Quelle höchstens 200 Zeichen.`;
  if (!textFeld(w.fundstelle, 200)) return `${wo}: Fundstelle höchstens 200 Zeichen.`;
  if (!textFeld(w.version, 40)) return `${wo}: Version höchstens 40 Zeichen.`;
  for (const k of ["gueltigAb", "gueltigBis"])
    if (!(w[k] === undefined || w[k] === null || gueltigerTag(w[k]))) return `${wo}: ${k} ist kein gültiger Tag (JJJJ-MM-TT).`;
  if (gueltigerTag(w.gueltigAb) && gueltigerTag(w.gueltigBis) && w.gueltigBis < w.gueltigAb) return `${wo}: gültig bis liegt vor gültig ab.`;
  if (w.stufe === "achtung" && w.pruefstatus !== "verified")
    return `${wo}: „achtung" nur für geprüfte Werte (Prüfstatus „verified", dokumentierte Quellenprüfung).`;
  if (w.pruefstatus === "verified") {
    if (!voll(w.quelle)) return `${wo}: geprüft nur mit Quelle.`;
    if (!voll(w.fundstelle)) return `${wo}: geprüft nur mit Fundstelle.`;
    if (!voll(w.version)) return `${wo}: geprüft nur mit Version.`;
    if (!gueltigerTag(w.gueltigAb)) return `${wo}: geprüft nur mit gültig ab.`;
  }
  return null;
}

/**
 * Der wirksame Regelwert des Betriebs zu einer Regel am Tag `tag` — nur
 * formgültig und im Gültigkeitszeitraum, sonst null.
 * @param {any} m
 * @param {string} regelId
 * @param {string} tag JJJJ-MM-TT
 */
export function regelwertFuer(m, regelId, tag) {
  const rw = m && istObjekt(m.einstellungen) && istObjekt(m.einstellungen.regelwerte) && hat(m.einstellungen.regelwerte, regelId)
    ? m.einstellungen.regelwerte[regelId] : null;
  if (!rw || pruefeRegelwert(regelId, rw)) return null;
  if (gueltigerTag(rw.gueltigAb) && gueltigerTag(tag) && tag < rw.gueltigAb) return null;
  if (gueltigerTag(rw.gueltigBis) && gueltigerTag(tag) && tag > rw.gueltigBis) return null;
  return rw;
}

/**
 * Ein Befund aus einer Branchenregel mit dem Regelwert des Betriebs: Geprüft
 * und auf „achtung" gesetzt → Stufe „achtung" und die Quelle des Betriebs.
 * Alles andere bleibt, wie die Regel es liefert (höchstens Hinweis). Ein
 * nicht bewertbarer Befund („offen") wird nie aufgewertet.
 * @param {any} m
 * @param {any} befund
 * @param {string} tag
 */
export function regelwertAnwenden(m, befund, tag) {
  if (!befund || befund.offen || befund.art !== "branche") return befund;
  const rw = regelwertFuer(m, befund.regelId, tag);
  if (!rw || rw.pruefstatus !== "verified" || rw.stufe !== "achtung" || !voll(rw.geprueftAm)) return befund;
  return { ...befund, stufe: "achtung",
    quelle: `${rw.quelle} ${rw.fundstelle} (Fassung ${rw.version}; vom Betrieb geprüft)`.slice(0, 300) };
}

/* --------------------------------------------------------------------------
   MODULPROTOKOLL

   `einstellungen.modulprotokoll` — wer wann ein Modul geschaltet, eine
   Mitbestimmung bestätigt oder einen Regelwert gesetzt hat. Nur der Server
   schreibt es (aus dem gespeicherten Stand plus neuen Ereignissen); was ein
   Client mitschickt, zählt nicht. Ausschalten wird auch an der Grenze noch
   protokolliert — ausschalten geht immer.
   -------------------------------------------------------------------------- */
export const MODULPROTOKOLL_GRENZE = 2000;

/* Vergleich unabhängig von der Reihenfolge der Schlüssel — ein Client darf sie anders senden. */
const stabil = (x) => (Array.isArray(x) ? x.map(stabil) : istObjekt(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, stabil(x[k])])) : x);
const gleich = (a, b) => JSON.stringify(stabil(a)) === JSON.stringify(stabil(b));
const ohne = (o, felder) => Object.fromEntries(Object.entries(istObjekt(o) ? o : {}).filter(([k]) => !felder.includes(k)));

/**
 * Schreibweg der Moduleinstellungen auf dem Server — Schalter
 * (`einstellungen.branchenmodule`), Regelwerte (`einstellungen.regelwerte`)
 * und Protokoll (`einstellungen.modulprotokoll`), analog zum Geo-Schalter und
 * zur Planfreigabe (server/lib/rechte.mjs).
 *
 *   - Ändern darf nur, wer org.edit hat (Leitung, Kundenrolle). Für alle
 *     anderen bleibt der gespeicherte Stand — auch wenn sie ihn löschen.
 *   - Fehlt ein Feld in der Übermittlung (ein Modul, ein Regelwert, die
 *     Parameter oder die Bestätigung eines Moduls), bleibt der gespeicherte
 *     Stand. Ausschalten heißt { an: false }, Entfernen eines Regelwerts null.
 *   - Unbekanntes Modul, unbekannte Regel oder falsche Form: abgewiesen.
 *   - Einschalten nur, wenn das Modul gebucht und nicht „geplant" ist, bei
 *     Mitbestimmung nur mit Bestätigung (G6); ausschalten geht immer.
 *   - Wann und Wer setzt der Server; das Protokoll baut er selbst.
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
  const e = { ...neuM.einstellungen };
  const zurueck = (k) => { if (hat(altE, k)) e[k] = altE[k]; else delete e[k]; };
  const fertig = () => ({ mandant: { ...neuM, einstellungen: e } });
  /* Das Protokoll schreibt nur der Server. */
  zurueck("modulprotokoll");
  if (!darfOrgEdit) { zurueck("branchenmodule"); zurueck("regelwerte"); return fertig(); }

  const jetzt = new Date().toISOString();
  const wer = sitzung && sitzung.person !== undefined ? sitzung.person : null;
  /** @type {any[]} */
  const ereignisse = [];

  /* --- Schalter, Parameter, Bestätigung --- */
  const alt = istObjekt(altE.branchenmodule) ? altE.branchenmodule : null;
  if (!hat(e, "branchenmodule")) zurueck("branchenmodule");
  else {
    const neu = e.branchenmodule;
    if (!istObjekt(neu)) return { grund: "Branchenmodule: erwartet wird je Modul { an: true oder false }." };
    /** @type {Record<string, ModulEinstellung>} */
    const ergebnis = alt ? { ...alt } : {};
    for (const [id, wert] of Object.entries(neu)) {
      const fehler = pruefeModulEinstellung(id, wert, liste);
      if (fehler) return { grund: fehler };
      const mod = /** @type {BranchenModul} */ (modulVon(id, liste));
      const vorher = alt && hat(alt, id) && istObjekt(alt[id]) ? alt[id] : null;
      const warAn = !!vorher && vorher.an === true;
      /* Fehlende Parameter: die gespeicherten bleiben (ausdrücklich {} setzt zurück). */
      const parameter = hat(wert, "parameter") ? wert.parameter : (vorher && istObjekt(vorher.parameter) ? vorher.parameter : {});
      const gesendet = hat(wert, "mitbestimmung") ? wert.mitbestimmung : null;
      const gespeichertB = vorher && istObjekt(vorher.mitbestimmung) ? vorher.mitbestimmung : null;
      if (wert.an === true && !warAn) {
        if (mod.status === "geplant") return { grund: `Branchenmodul ${mod.name} ist noch nicht verfügbar.` };
        if (!modulGebucht(altM, id, liste)) return { grund: `Branchenmodul ${mod.name}: Das Paket ist nicht gebucht.` };
      }
      let neueBestaetigung = false;
      if (wert.an === true && mod.mitbestimmung) {
        if (!warAn) {
          /* Einschalten: immer eine neue Bestätigung — eine alte (vor dem Ausschalten) zählt nicht. */
          if (!gesendet || gesendet.bestaetigt !== true || (gespeichertB && gesendet.bestaetigtAm && gesendet.bestaetigtAm === gespeichertB.bestaetigtAm))
            return { grund: `Branchenmodul ${mod.name}: Zum Einschalten bestätigt die Leitung, dass die Voraussetzungen der Mitbestimmung geklärt sind, und nennt die Grundlage.` };
          neueBestaetigung = true;
        } else if (gesendet && (!gespeichertB || gesendet.grundlage !== gespeichertB.grundlage)) {
          if (gesendet.bestaetigt !== true)
            return { grund: `Branchenmodul ${mod.name}: Eine neue Grundlage der Mitbestimmung braucht eine neue Bestätigung.` };
          neueBestaetigung = true;
        }
      }
      if (vorher && vorher.an === wert.an && gleich(istObjekt(vorher.parameter) ? vorher.parameter : {}, parameter) && !neueBestaetigung)
        continue;                                                          // unverändert: Wann und Wer bleiben
      /** @type {ModulEinstellung & { mitbestimmung?: any }} */
      const eintrag = { an: wert.an, geaendertAm: jetzt, geaendertVon: wer };
      if (Object.keys(parameter).length) eintrag.parameter = { ...parameter };
      if (neueBestaetigung) eintrag.mitbestimmung = { grundlage: gesendet.grundlage.trim(), bestaetigtAm: jetzt, bestaetigtVon: wer };
      else if (gespeichertB) eintrag.mitbestimmung = gespeichertB;
      ergebnis[id] = eintrag;
      const grundlage = neueBestaetigung ? { grundlage: eintrag.mitbestimmung.grundlage } : {};
      if (!vorher || vorher.an !== wert.an) {
        if (vorher || wert.an) ereignisse.push({ art: wert.an ? "eingeschaltet" : "ausgeschaltet", modul: id, am: jetzt, von: wer, ...grundlage });
      } else if (neueBestaetigung) ereignisse.push({ art: "mitbestimmung", modul: id, am: jetzt, von: wer, ...grundlage });
      else ereignisse.push({ art: "parameter", modul: id, am: jetzt, von: wer });
    }
    if (Object.keys(ergebnis).length) e.branchenmodule = ergebnis; else zurueck("branchenmodule");
  }

  /* --- Betriebliche Regelwerte --- */
  const altR = istObjekt(altE.regelwerte) ? altE.regelwerte : null;
  if (!hat(e, "regelwerte")) zurueck("regelwerte");
  else {
    const neu = e.regelwerte;
    if (!istObjekt(neu)) return { grund: "Regelwerte: erwartet wird je Regel { pruefstatus, stufe, quelle, … }." };
    const ergebnis = altR ? { ...altR } : {};
    for (const [id, w] of Object.entries(neu)) {
      const vorher = altR && hat(altR, id) ? altR[id] : null;
      if (w === null) {
        if (vorher) { delete ergebnis[id]; ereignisse.push({ art: "regelwert-entfernt", regelId: id, am: jetzt, von: wer }); }
        continue;
      }
      const fehler = pruefeRegelwert(id, w);
      if (fehler) return { grund: fehler };
      const inhalt = ohne(w, REGELWERT_SERVER);
      if (vorher && gleich(ohne(vorher, REGELWERT_SERVER), inhalt)) continue;   // unverändert: Wann und Wer bleiben
      /** @type {Record<string, any>} */
      const eintrag = { ...inhalt, geaendertAm: jetzt, geaendertVon: wer };
      if (w.pruefstatus === "verified") { eintrag.geprueftAm = jetzt; eintrag.geprueftVon = wer; }
      ergebnis[id] = eintrag;
      ereignisse.push({ art: "regelwert", regelId: id, am: jetzt, von: wer, stufe: w.stufe, pruefstatus: w.pruefstatus });
    }
    if (altR || Object.keys(ergebnis).length) e.regelwerte = ergebnis; else delete e.regelwerte;
  }

  /* --- Protokoll: gespeicherter Stand plus neue Ereignisse --- */
  if (ereignisse.length) {
    const bisher = Array.isArray(altE.modulprotokoll) ? altE.modulprotokoll : [];
    if (bisher.length + ereignisse.length > MODULPROTOKOLL_GRENZE && ereignisse.some((x) => x.art !== "ausgeschaltet"))
      return { grund: `Modulprotokoll: Die Grenze von ${MODULPROTOKOLL_GRENZE} Einträgen ist erreicht. Ausschalten geht weiter; `
        + "für alles andere bitte den Betreiber ansprechen — ältere Einträge werden nicht verdrängt." };
    e.modulprotokoll = [...bisher, ...ereignisse];
  }
  return fertig();
}

/**
 * Zeilen für das Betriebsprotokoll des Servers zu den neuen Einträgen im
 * Modulprotokoll — nur Modul bzw. Regel und Art. Keine Person, keine
 * Grundlage (Freitext), kein Person|Tag, kein Schutzmerkmal (WP-14b, M1).
 * @param {any} altB gespeicherter Bestand
 * @param {any} neuB zu schreibender Bestand
 * @returns {string[]}
 */
export function modulProtokollZeilen(altB, neuB) {
  const betriebe = (b) => (b && Array.isArray(b.mandanten) ? b.mandanten : []).filter(istObjekt);
  const altN = new Map(betriebe(altB).map((m) => [m.id, istObjekt(m.einstellungen) && Array.isArray(m.einstellungen.modulprotokoll)
    ? m.einstellungen.modulprotokoll.length : 0]));
  const kennung = (x) => String(x || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 60);
  const zeilen = [];
  for (const m of betriebe(neuB)) {
    const p = istObjekt(m.einstellungen) && Array.isArray(m.einstellungen.modulprotokoll) ? m.einstellungen.modulprotokoll : [];
    for (const x of p.slice(altN.get(m.id) || 0)) {
      if (!istObjekt(x)) continue;
      if (x.art === "regelwert") zeilen.push(`Regelwert ${kennung(x.regelId)}: ${REGELWERT_STUFEN.includes(x.stufe) ? x.stufe : "?"}, ${REGELWERT_PRUEFSTATUS.includes(x.pruefstatus) ? x.pruefstatus : "?"}`);
      else if (x.art === "regelwert-entfernt") zeilen.push(`Regelwert ${kennung(x.regelId)} entfernt`);
      else if (x.art === "eingeschaltet") zeilen.push(`Branchenmodul ${kennung(x.modul)} eingeschaltet${x.grundlage ? " (Mitbestimmung bestätigt)" : ""}`);
      else if (x.art === "ausgeschaltet") zeilen.push(`Branchenmodul ${kennung(x.modul)} ausgeschaltet`);
      else if (x.art === "mitbestimmung") zeilen.push(`Branchenmodul ${kennung(x.modul)}: Mitbestimmung erneut bestätigt`);
      else if (x.art === "parameter") zeilen.push(`Branchenmodul ${kennung(x.modul)}: Parameter geändert`);
    }
  }
  return zeilen.slice(0, 50);
}

/* --------------------------------------------------------------------------
   ZUSTAND, NUR-LESEN, SICHT
   -------------------------------------------------------------------------- */

/**
 * Zustand eines Moduls im Betrieb, für Oberfläche und Prüfungen:
 * "unbekannt" | "in-vorbereitung" (geplant, nicht einschaltbar) |
 * "nicht-gebucht" | "aus" | "mitbestimmung-offen" | "abhaengigkeit-fehlt" | "an".
 * @param {any} m
 * @param {string} id
 * @param {readonly BranchenModul[]} [liste]
 */
export function modulZustand(m, id, liste = BRANCHENMODULE) {
  const mod = modulVon(id, liste);
  if (!mod) return "unbekannt";
  if (mod.status === "geplant") return "in-vorbereitung";
  if (!modulGebucht(m, id, liste)) return "nicht-gebucht";
  const e = modulEinstellung(m, id);
  if (!e || e.an !== true) return "aus";
  if (mod.mitbestimmung && !mitbestimmungBestaetigt(e)) return "mitbestimmung-offen";
  return modulAktiv(m, id, liste) ? "an" : "abhaengigkeit-fehlt";
}

/**
 * Sind die Daten des Moduls nur noch lesbar (G3)? Ja nach dem Ausschalten
 * (gespeichert { an: false }) und wenn ein eingeschaltetes, nicht mehr
 * geplantes Modul nicht wirkt (Paket abbestellt, Abhängigkeit oder
 * Bestätigung fehlt). Nein, solange nie geschaltet wurde, und für geplante
 * Module mit Schalter an (Entwicklungsstand, ohne Wirkung).
 * @param {any} m
 * @param {string} id
 * @param {readonly BranchenModul[]} [liste]
 */
export function modulNurLesen(m, id, liste = BRANCHENMODULE) {
  const mod = modulVon(id, liste);
  const e = modulEinstellung(m, id);
  if (!mod || !e || modulAktiv(m, id, liste)) return false;
  return e.an === false || mod.status !== "geplant";
}

/**
 * Die Moduleinstellungen in der Sicht einer Rolle (server/lib/sicht.mjs).
 * Beschäftigte und Schichtverantwortung: Schalter, Parameter, Zeitpunkte und
 * Regelwerte — ohne Person, Grundlage und Protokoll. Der Betriebsrat
 * zusätzlich die Mitbestimmungsbestätigung samt Protokoll. Alle übrigen
 * Einstellungen bleiben, wie sie sind.
 * @param {any} e einstellungen
 * @param {string} rolle
 */
export function moduleinstellungenSicht(e, rolle) {
  if (!istObjekt(e)) return e;
  const aus = { ...e };
  /* Der Betriebsrat prüft Einführung und Anwendung technischer Einrichtungen (§ 87 Abs. 1 Nr. 6 BetrVG):
     Aktivierungsstand, Bestätigung und Protokoll bekommt er ganz. */
  if (rolle === "betriebsrat") return aus;
  delete aus.modulprotokoll;
  if (istObjekt(e.branchenmodule)) aus.branchenmodule = Object.fromEntries(Object.entries(e.branchenmodule).map(([k, x]) => {
    if (!istObjekt(x)) return [k, x];
    const r = ohne(x, ["geaendertVon", "mitbestimmung"]);
    if (istObjekt(x.mitbestimmung) && hat(x.mitbestimmung, "bestaetigtAm")) r.mitbestimmung = { bestaetigtAm: x.mitbestimmung.bestaetigtAm };
    return [k, r];
  }));
  if (istObjekt(e.regelwerte)) aus.regelwerte = Object.fromEntries(Object.entries(e.regelwerte).map(([k, w]) => [k, istObjekt(w) ? ohne(w, ["geprueftVon", "geaendertVon"]) : w]));
  return aus;
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

/**
 * Statusvertrag (Grundsatz 1, G8): Ein Modul verlässt „geplant" erst mit der
 * Abnahme seines Pakets (WP-19.13) — die Registry nennt sie dann als
 * `abnahme: { datum, nachweis }` (Nachweisdokument). Der gemeinsame Kern hebt
 * kein Modul an. Leere Liste heißt: stimmig.
 * @param {readonly any[]} [liste]
 * @returns {string[]}
 */
export function pruefeModulStatus(liste = BRANCHENMODULE) {
  const m = [];
  for (const x of liste) {
    if (!x || x.status === "geplant") continue;
    const a = x.abnahme;
    if (!istObjekt(a) || typeof a.datum !== "string" || !TAG.test(a.datum) || typeof a.nachweis !== "string" || !a.nachweis.trim())
      m.push(`${x.id}: Status „${x.status}" nur mit Abnahme { datum, nachweis } (WP-19.13)`);
  }
  return m;
}

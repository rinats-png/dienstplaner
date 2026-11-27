#!/usr/bin/env node
/* ==========================================================================
   K4-P2: HEURISTIK-ZÄHLER Z-2 — nur lesend, nur Zahlen je Klasse

   Zweck: Beim K4 (Bestandsverifikation vor dem ersten V4-Wechsel) hilft Z-1 (deploy/sicherung/hilfen/
   bestaende-zaehlen.mjs) nur beim Zählen der Räume. Ob ein Bestand erkennbar synthetisch ist oder Hinweise auf
   echte Personen enthält (Maildomänenklasse, Krankmeldungen, Räume und Personen ohne Testmuster), zählt Z-2 nach
   Klassen. Die Einstufung bleibt Entscheidung des Betreibers: Z-2 stützt sie nur und beweist „synthetisch" nie.

   Was es tut
   - Liest eine Ablage (CENTRIC_DATEN-Wurzel, Store `centric`) über die Leseschicht von `server/lib` — wahlweise die
     des heutigen Stands (Vorgabe) oder die eines anderen, z. B. die von 274bfa0 (`--leseschicht <Wurzel>`).
   - Zählt je Klasse (Räume nach Namensmuster, Betriebe, Personen nach Testmuster und Mailklasse, Abwesenheiten,
     davon krank, Krankmeldungsfälle, Erfassungstage, Stempel, Konten nach Mailklasse, Schlüssel je Klasse).
   - Gibt NUR Zahlen und feste Wörter aus. Nie einen Raum-, Betriebs-, Personen- oder Domänennamen, keine Kennung,
     keinen Pfad, keine Fehlermeldung im Wortlaut. Eine Ausgabeprüfung (`nurZahlen`) lässt nur ganze Zahlen,
     Wahrheitswerte und die festen Wörter dieses Werkzeugs durch; sonst „nicht bewertbar".
   - Bestimmt: gleiche Ablage, gleiche Ausgabe (sortiert, ohne Uhrzeit). Ausgabe auf wenige Zeilen begrenzt.

   Was es nie tut
   - Nichts schreiben: Die Leseschicht bekommt nur eine Hülle mit get, getWithMetadata, getMetadata und list; set,
     setJSON und delete werfen. Keine Datei anlegen, keine Löschung, keine Migration, kein Netz, kein Kindprozess,
     keine Umgebungsvariable außer der Ablage-Wurzel, die es für die Leseschicht setzt (und danach zurücknimmt).
   - Nie „0" oder „sauber" melden, wenn es etwas nicht lesen oder nicht einordnen konnte (fail-closed): Dann ist
     das Ergebnis NICHT_BEWERTBAR, alle Zahlen sind `null`, und `gruende` nennt feste Kennwörter mit Anzahl.
   - Das Ergebnis KEINE_TREFFER ist KEIN Nachweis, dass der Bestand synthetisch ist; es heißt nur: in den
     untersuchten Klassen kein Hinweis auf Echtes. `schluesselUebrige` zählt die Schlüssel, die Z-2 nicht inhaltlich
     ansieht (z. B. Sitzungs-, Faktor-, Feed-Schlüssel).

   Grenzen, die zu wissen sind
   - 274bfa0 bietet nur `bestandLesen` (übergeht eine unlesbare Scherbe still) und kein `bestandLesenStreng`.
     Z-2 liest deshalb jede Datei eines Raums vorab selbst; schlägt das fehl, gilt NICHT_BEWERTBAR. Mit der Leseschicht
     des Kandidaten (`bestandLesenStreng`) liest Z-2 zusätzlich streng (`lesemodus: "streng"`, sonst `"einfach"`).
   - Gelesen wird ohne Sperre. Gegen einen laufenden Betrieb kann ein Raum zwischen Vorprüfung und Lesen wechseln;
     für K4 gegen eine Sicherungskopie oder bei gestopptem Dienst laufen lassen (Daten `:ro`).
   - Mailklasse: `reserviert` = Domäne endet auf .example, .invalid, .test, .localhost oder ist example.com/net/org
     (RFC 2606); alles andere, auch eine fehlerhafte Adresse, ist `sonstige` (vorsichtig gezählt).
   - Grenzen: höchstens 50000 Schlüssel, 5000 Räume, 300 s Gesamtzeit, 25 s je Lesevorgang (unter den 30 s der
     Raumsperre, deren Meldung einen Raumnamen enthält); darüber NICHT_BEWERTBAR.
   - Selbststart (/starten): legt einen t--Raum mit Betriebsname und Inhaber-Mail im Betriebsfeld kontakt an, ohne Personen
     und Konto, dazu die Liste selbststarts. Darum: Mailklasse des Betriebskontakts je Betrieb, t--Raum mit sonstiger
     Kontaktmail = Treffer (raeumeTAuffaellig), jeder Eintrag in selbststarts = Treffer.
   - Meldungen der fremden Leseschicht: console.log/error/warn/info/debug sind stumm, ein später Fehler aus ihr gibt nur
     das feste Wort LESEFEHLER aus. Ein Prozess-Abbruch von außen oder Node selbst (Speicher) liegt außerhalb.

   Aufruf:
     node werkzeug/k4-heuristik-zaehler.mjs zaehlen <Ablage> [--leseschicht <Wurzel>]
   <Ablage> ist die Wurzel (CENTRIC_DATEN), darin liegt der Ordner `centric`. <Wurzel> ist der Ordner, der
   `server/lib` enthält (Vorgabe: dieses Repo; im Produktionsbild `/app`).
   Ausgang: 0 bewertbar (KEINE_TREFFER oder TREFFER) · 1 NICHT_BEWERTBAR · 2 Aufruf.
   Tests: pruefungen/k4-heuristik-zaehler.test.js. Nachweis: docs/acc45/K4-P2-nachweis.md.
   ========================================================================== */
import { lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------ Festlegungen ------------------------------------------------------------------- */
export const GRENZEN = Object.freeze({ maxSchluessel: 50000, maxRaeume: 5000, zeitMs: 300000, leseMs: 25000, maxAusgabeBytes: 4096 });

/** Räume mit festen Testnamen: Pilot-Seeds (werkzeug/pilot-seeds.mjs) und der synthetische Altbestand (K4-P3). */
export const SEED_RAEUME = Object.freeze(["pilot-seed-p", "pilot-seed-s"]);
export const ALT_SYNTH_RAEUME = Object.freeze(["alt-leer", "alt-pflege", "alt-sicherheit", "alt-gross", "alt-bestandsform", "alt-betreiber"]);
const SEED_VORNAMEN = new Set(["Testperson", "Testkonto"]);
const MUSTER_NUMMER = /^(SEED|SYN)-/;
const RESERVIERTE_ENDUNGEN = new Set(["example", "invalid", "test", "localhost"]);
const RESERVIERTE_DOMAENEN = new Set(["example.com", "example.net", "example.org"]);

/** Reihenfolge der Ausgabe. */
export const ZAHLEN_KLASSEN = Object.freeze([
  "schluesselGesamt", "schluesselKern", "schluesselScherbe", "schluesselAltform", "schluesselKonto", "schluesselZugangscode", "schluesselUebrige",
  "raeume", "raeumeT", "raeumeDemo", "raeumeSeed", "raeumeAltSynth", "raeumeOhneMuster", "raeumeAltform",
  "betriebe", "betriebeSelbstAngelegt", "betriebeMailReserviert", "betriebeMailSonstige", "betriebeOhneMail", "raeumeTAuffaellig", "selbststartEintraege",
  "personen", "personenSeedMuster", "personenOhneMuster", "personenMailReserviert", "personenMailSonstige", "personenOhneMail",
  "abwesenheiten", "abwesenheitenKrank", "krankmeldungenFaelle",
  "erfassungstage", "stempel", "einteilungen",
  "konten", "kontenMailReserviert", "kontenMailSonstige", "kontenOhneMail",
]);
/** Klassen, die auf etwas „nicht erkennbar Synthetisches" hinweisen (Entwurf K4, Schritt S1). */
export const TREFFER_KLASSEN = Object.freeze([
  "raeumeOhneMuster", "raeumeTAuffaellig", "betriebeMailSonstige", "selbststartEintraege", "personenOhneMuster", "personenMailSonstige", "kontenMailSonstige",
  "abwesenheitenKrank", "krankmeldungenFaelle",
]);
export const ERGEBNISSE = Object.freeze(["NICHT_BEWERTBAR", "TREFFER", "KEINE_TREFFER"]);
export const GRUENDE = Object.freeze([
  "ABLAGE_FEHLT", "ABLAGE_LEER", "LESESCHICHT_FEHLT", "LESESCHICHT_UNBRAUCHBAR", "ZU_VIELE_SCHLUESSEL", "ZU_VIELE_RAEUME",
  "SCHLUESSEL_FORM", "RAUM_UNLESBAR", "RAUM_FORM_UNERWARTET", "RAUM_DOPPELT", "SCHERBE_OHNE_KERN", "KONTO_UNLESBAR", "SELBSTSTARTS_UNLESBAR", "JOURNAL_OFFEN",
  "ZEITGRENZE", "LESEFEHLER", "AUSGABE_UNZULAESSIG",
]);
const LESEMODI = Object.freeze(["streng", "einfach", "keiner"]);
const FESTE_WORTER = new Set([...ERGEBNISSE, ...GRUENDE, ...LESEMODI, "k4-heuristik-zaehler"]);

/* ------------------------------ Reine Klassifikation ----------------------------------------------------------- */
/**
 * Mailklasse einer Adresse. `keine`: nichts angegeben. `reserviert`: nur reservierte Domäne. `sonstige`: alles andere,
 * auch jede fehlerhafte oder nicht-textliche Angabe (vorsichtig).
 * @param {unknown} v @returns {"keine"|"reserviert"|"sonstige"}
 */
export function mailKlasse(v) {
  if (v === undefined || v === null || v === "") return "keine";
  if (typeof v !== "string") return "sonstige";
  const t = v.trim().toLowerCase();
  if (!t) return "keine";
  const teile = t.split("@");
  if (teile.length !== 2 || !teile[0] || !teile[1]) return "sonstige";
  const labels = teile[1].replace(/\.$/, "").split(".");
  if (labels.some((l) => !l)) return "sonstige";
  if (RESERVIERTE_ENDUNGEN.has(labels[labels.length - 1])) return "reserviert";
  if (labels.length >= 2 && RESERVIERTE_DOMAENEN.has(labels.slice(-2).join("."))) return "reserviert";
  return "sonstige";
}
const schlimmer = (/** @type {string} */ a, /** @type {string} */ b) => (a === "sonstige" || b === "sonstige" ? "sonstige" : a === "reserviert" || b === "reserviert" ? "reserviert" : "keine");

/** @param {string} raum */
export function raumMuster(raum) {
  const r = String(raum);
  return { t: r.startsWith("t-"), demo: /^demo-/i.test(r), seed: SEED_RAEUME.includes(r), altSynth: ALT_SYNTH_RAEUME.includes(r) };
}
/** Trägt die Person ein Testmuster (Vorname Testperson/Testkonto oder Personalnummer SEED-/SYN-)? @param {any} p */
export const personMuster = (p) => SEED_VORNAMEN.has(p.vorname) || (typeof p.personalnummer === "string" && MUSTER_NUMMER.test(p.personalnummer));

const istObjekt = (/** @type {unknown} */ x) => !!x && typeof x === "object" && !Array.isArray(x);
/** Fehlt der Wert, gilt „leer"; hat er die falsche Form, ist der Bestand nicht einordenbar. */
function feld(/** @type {any} */ o, /** @type {string} */ name, /** @type {"array"|"objekt"} */ art) {
  const v = o[name];
  if (v === undefined || v === null) return art === "array" ? [] : {};
  if (art === "array" ? !Array.isArray(v) : !istObjekt(v)) throw new Error("FORM");
  return v;
}

/**
 * Zählt einen Betrieb in `z`. Wirft Error("FORM") bei unerwarteter Gestalt (dann ist der Bestand nicht bewertbar).
 * Gibt die Mailklasse der Betriebskontakt-Adresse zurück (`kontakt`, auch `email`; die schlimmere zählt): ein Selbststart
 * (`/starten`) legt dort die Mail des Inhabers ab, ohne Personen und ohne Konto.
 * @returns {"keine"|"reserviert"|"sonstige"}
 */
export function zaehleBetrieb(/** @type {any} */ m, /** @type {Record<string, number>} */ z) {
  if (!istObjekt(m)) throw new Error("FORM");
  z.betriebe++;
  if (m.selbstAngelegt === true) z.betriebeSelbstAngelegt++;
  const betriebMail = schlimmer(mailKlasse(m.kontakt), mailKlasse(m.email));
  if (betriebMail === "reserviert") z.betriebeMailReserviert++; else if (betriebMail === "sonstige") z.betriebeMailSonstige++; else z.betriebeOhneMail++;
  for (const p of feld(m, "personen", "array")) {
    if (!istObjekt(p)) throw new Error("FORM");
    z.personen++;
    if (personMuster(p)) z.personenSeedMuster++; else z.personenOhneMuster++;
    const k = mailKlasse(p.email);
    if (k === "reserviert") z.personenMailReserviert++; else if (k === "sonstige") z.personenMailSonstige++; else z.personenOhneMail++;
  }
  for (const a of feld(m, "abwesenheiten", "array")) {
    if (!istObjekt(a)) throw new Error("FORM");
    z.abwesenheiten++;
    if (a.art === "krank") z.abwesenheitenKrank++;
  }
  z.krankmeldungenFaelle += feld(m, "krankmeldungen", "array").length;
  z.erfassungstage += Object.keys(feld(m, "erfassung", "objekt")).length;
  z.stempel += Object.keys(feld(m, "einstempeln", "objekt")).length;
  z.einteilungen += Object.keys(feld(m, "abweichungen", "objekt")).length;
  return /** @type {"keine"|"reserviert"|"sonstige"} */ (betriebMail);
}

/* ------------------------------ Ausgabe ------------------------------------------------------------------------ */
/**
 * Ausgabeprüfung: nur ganze Zahlen (0 bis 1e9), Wahrheitswerte, null und feste Wörter, in der festen Gestalt des
 * Berichts. Alles andere → false. Das ist der Schutz „nie Werte".
 * @param {any} b
 */
export function nurZahlen(b) {
  const zahl = (/** @type {unknown} */ x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 1e9;
  const wort = (/** @type {unknown} */ x) => typeof x === "string" && FESTE_WORTER.has(x);
  if (!istObjekt(b)) return false;
  if (Object.keys(b).sort().join() !== ["bewertbar", "ergebnis", "fassung", "gruende", "lesemodus", "treffer", "werkzeug", "zahlen"].join()) return false;
  if (!wort(b.werkzeug) || !zahl(b.fassung) || typeof b.bewertbar !== "boolean" || !wort(b.ergebnis) || !wort(b.lesemodus)) return false;
  if (!(b.treffer === null || zahl(b.treffer))) return false;
  if (!Array.isArray(b.gruende) || b.gruende.length > GRUENDE.length) return false;
  for (const g of b.gruende) if (!istObjekt(g) || Object.keys(g).sort().join() !== "anzahl,code" || !wort(g.code) || !zahl(g.anzahl)) return false;
  if (b.zahlen === null) return true;
  if (!istObjekt(b.zahlen) || Object.keys(b.zahlen).join() !== ZAHLEN_KLASSEN.join()) return false;
  return Object.values(b.zahlen).every(zahl);
}

/** Der feste Bericht „nicht bewertbar" ohne jede Zahl. @param {{code: string, anzahl: number}[]} gruende @param {string} [lesemodus] */
export function nichtBewertbar(gruende, lesemodus = "keiner") {
  const g = [...new Map(gruende.map((x) => [x.code, x])).values()].sort((a, b) => (a.code < b.code ? -1 : 1));
  return { werkzeug: "k4-heuristik-zaehler", fassung: 1, bewertbar: false, ergebnis: "NICHT_BEWERTBAR", lesemodus, gruende: g, treffer: null, zahlen: null };
}

/** Zeilen der Ausgabe: feste Kopfzeile, eine Zeile je Klasse, eine JSON-Zeile. @param {any} b */
export function berichtZeilen(b) {
  if (!nurZahlen(b)) b = nichtBewertbar([{ code: "AUSGABE_UNZULAESSIG", anzahl: 1 }]);
  const zeilen = [`Z-2 Heuristik-Zähler (nur Zahlen) — Ergebnis: ${b.ergebnis}`];
  if (!b.bewertbar) {
    zeilen.push("Nicht bewertbar: Es gelten KEINE Zahlen; weder 0 noch sauber. Gründe (Kennwort: Anzahl):");
    for (const g of b.gruende) zeilen.push(`  ${g.code}: ${g.anzahl}`);
  } else {
    zeilen.push(b.ergebnis === "TREFFER"
      ? "Treffer in Klassen, die auf nicht erkennbar Synthetisches hinweisen: Einstufung personenbezogen möglich prüfen (Pfad 2)."
      : "Keine Treffer in den untersuchten Klassen. Das ist KEIN Nachweis, dass der Bestand synthetisch ist (Betreiberentscheidung).");
    for (const k of ZAHLEN_KLASSEN) zeilen.push(`  ${k}: ${b.zahlen[k]}`);
    zeilen.push(`  treffer: ${b.treffer}`);
  }
  zeilen.push(JSON.stringify(b));
  return zeilen;
}

/* ------------------------------ Lesehülle ---------------------------------------------------------------------- */
/** Nur lesende Hülle um den Store der Leseschicht. Schreibende Aufrufe werfen. @param {any} store */
export function lesehuelle(store) {
  const nein = () => { throw new Error("SCHREIBEN_VERBOTEN"); };
  return Object.freeze({
    get: (/** @type {any[]} */ ...a) => store.get(...a),
    getWithMetadata: (/** @type {any[]} */ ...a) => store.getWithMetadata(...a),
    getMetadata: (/** @type {any[]} */ ...a) => store.getMetadata(...a),
    list: (/** @type {any[]} */ ...a) => store.list(...a),
    set: nein, setJSON: nein, delete: nein,
  });
}

/** Frist für einen Lesevorgang. @template T @param {Promise<T>} p @param {number} ms @returns {Promise<T>} */
function mitFrist(p, ms) {
  /** @type {any} */ let t;
  const frist = new Promise((_, nein) => { t = setTimeout(() => nein(new Error("ZEIT")), ms); });
  return Promise.race([p, frist]).finally(() => clearTimeout(t));
}

/* ------------------------------ Zählen ------------------------------------------------------------------------- */
/**
 * @param {{ ablage: string, leseschicht?: string, grenzen?: Partial<typeof GRENZEN> }} o
 */
export async function zaehlen({ ablage, leseschicht = WURZEL, grenzen = {} }) {
  const G = { ...GRENZEN, ...grenzen };
  const start = Date.now();
  /** @type {Map<string, number>} */ const gruende = new Map();
  const grund = (/** @type {string} */ code, n = 1) => { gruende.set(code, (gruende.get(code) || 0) + n); };
  const aus = (lesemodus = "keiner") => nichtBewertbar([...gruende].map(([code, anzahl]) => ({ code, anzahl })), lesemodus);

  /* Ablage: Wurzel muss ein Ordner mit dem Store `centric` sein. */
  try {
    if (typeof ablage !== "string" || !ablage || ablage.includes("\0") || !lstatSync(ablage).isDirectory()) throw new Error("x");
    if (!lstatSync(path.join(ablage, "centric")).isDirectory()) throw new Error("x");
  } catch { grund("ABLAGE_FEHLT"); return aus(); }

  /* Leseschicht laden (Ablage-Wurzel nur für diese Zeit setzen; Meldungen der Schicht unterdrücken). */
  const KONSOLE = /** @type {const} */ (["log", "error", "warn", "info", "debug"]);
  const vorher = { daten: process.env.CENTRIC_DATEN, ablage: process.env.CENTRIC_ABLAGE, konsole: KONSOLE.map((n) => console[n]) };
  /** @type {any} */ let getStore, bestandLesen, bestandLesenStreng;
  try {
    process.env.CENTRIC_DATEN = path.resolve(ablage);
    process.env.CENTRIC_ABLAGE = "dateien";
    for (const n of KONSOLE) console[n] = () => {};
    const laden = (/** @type {string} */ n) => import(pathToFileURL(path.join(path.resolve(leseschicht), "server", "lib", `${n}.mjs`)).href);
    let ablageModul, bestandModul;
    try { [ablageModul, bestandModul] = await Promise.all([laden("ablage"), laden("bestand")]); } catch { grund("LESESCHICHT_FEHLT"); return aus(); }
    getStore = ablageModul.getStore; bestandLesen = bestandModul.bestandLesen; bestandLesenStreng = bestandModul.bestandLesenStreng;
    if (typeof getStore !== "function" || typeof bestandLesen !== "function") { grund("LESESCHICHT_UNBRAUCHBAR"); return aus(); }
    const lesemodus = typeof bestandLesenStreng === "function" ? "streng" : "einfach";
    const lesen = lesemodus === "streng" ? bestandLesenStreng : bestandLesen;
    /** @type {any} */ let store;
    try { store = lesehuelle(getStore({ name: "centric", consistency: "strong" })); } catch { grund("LESESCHICHT_UNBRAUCHBAR"); return aus(lesemodus); }
    return await auswerten({ store, lesen, lesemodus, G, start, grund, aus, gruende });
  } catch { grund("LESEFEHLER"); return aus(); }
  finally {
    KONSOLE.forEach((n, i) => { console[n] = vorher.konsole[i]; });
    if (vorher.daten === undefined) delete process.env.CENTRIC_DATEN; else process.env.CENTRIC_DATEN = vorher.daten;
    if (vorher.ablage === undefined) delete process.env.CENTRIC_ABLAGE; else process.env.CENTRIC_ABLAGE = vorher.ablage;
  }
}

/** @param {{ store: any, lesen: Function, lesemodus: string, G: any, start: number, grund: Function, aus: Function, gruende: Map<string, number> }} o */
async function auswerten({ store, lesen, lesemodus, G, start, grund, aus, gruende }) {
  const abgelaufen = () => Date.now() - start >= G.zeitMs;
  const lese = (/** @type {Promise<any>} */ p) => mitFrist(p, G.leseMs);

  /* 1. Schlüsselliste. Die Ablage meldet bei fehlendem Ordner „leer": darum gilt leer als nicht bewertbar. */
  let schluessel;
  try { schluessel = (await lese(store.list({}))).blobs.map((/** @type {any} */ b) => String(b.key)); } catch { grund("LESEFEHLER"); return aus(lesemodus); }
  if (!schluessel.length) { grund("ABLAGE_LEER"); return aus(lesemodus); }
  if (schluessel.length > G.maxSchluessel) { grund("ZU_VIELE_SCHLUESSEL"); return aus(lesemodus); }
  schluessel.sort();

  /** @type {Record<string, number>} */
  const z = Object.fromEntries(ZAHLEN_KLASSEN.map((k) => [k, 0]));
  z.schluesselGesamt = schluessel.length;
  /** @type {Map<string, {kern: boolean, alt: boolean, scherben: string[]}>} */ const raeume = new Map();
  const raum = (/** @type {string} */ r) => { let x = raeume.get(r); if (!x) raeume.set(r, (x = { kern: false, alt: false, scherben: [] })); return x; };
  /** @type {string[]} */ const konten = [];
  let hatSelbststarts = false;
  for (const k of schluessel) {
    if (k.startsWith("kern:")) { z.schluesselKern++; raum(k.slice(5)).kern = true; }
    else if (k.startsWith("bestand:")) { z.schluesselAltform++; raum(k.slice(8)).alt = true; }
    else if (k.startsWith("scherbe:")) {
      z.schluesselScherbe++;
      const m = /^scherbe:([^:]+):[^:]+:[^:]+$/.exec(k);
      if (!m) grund("SCHLUESSEL_FORM"); else raum(m[1]).scherben.push(k);
    }
    else if (k.startsWith("account:")) { z.schluesselKonto++; konten.push(k); }
    else if (k.startsWith("konto:")) z.schluesselZugangscode++;
    else if (k.startsWith("journal:")) grund("JOURNAL_OFFEN");
    else if (k === "selbststarts") hatSelbststarts = true;
    else z.schluesselUebrige++;
  }
  if (raeume.size > G.maxRaeume) grund("ZU_VIELE_RAEUME");
  if (gruende.size) return aus(lesemodus);

  /* 2. Räume: jede Datei vorab lesen (die einfache Leseschicht übergeht Lücken still), dann zusammensetzen und zählen. */
  for (const r of [...raeume.keys()].sort()) {
    if (abgelaufen()) { grund("ZEITGRENZE"); return aus(lesemodus); }
    const x = /** @type {{kern: boolean, alt: boolean, scherben: string[]}} */ (raeume.get(r));
    z.raeume++;
    const m = raumMuster(r);
    if (m.t) z.raeumeT++;
    if (m.demo) z.raeumeDemo++;
    if (m.seed) z.raeumeSeed++;
    if (m.altSynth) z.raeumeAltSynth++;
    if (!(m.t || m.demo || m.seed || m.altSynth)) z.raeumeOhneMuster++;
    if (x.kern && x.alt) { grund("RAUM_DOPPELT"); continue; }
    if (!x.kern && !x.alt) { grund("SCHERBE_OHNE_KERN"); continue; }
    if (x.alt) z.raeumeAltform++;
    try {
      const dateien = [x.kern ? `kern:${r}` : `bestand:${r}`, ...x.scherben];
      for (const d of dateien) {
        const g = await lese(store.getWithMetadata(d, { type: "json" }));
        if (!g || g.data === undefined || g.data === null) throw new Error("LEER");
      }
      const b = await lese(lesen(store, r));
      if (!b || !b.bestand || !Array.isArray(b.bestand.mandanten)) { grund("RAUM_FORM_UNERWARTET"); continue; }
      let tAuffaellig = false;
      for (const mandant of b.bestand.mandanten) if (zaehleBetrieb(mandant, z) === "sonstige") tAuffaellig = true;
      if (m.t && tAuffaellig) z.raeumeTAuffaellig++;
    } catch (e) {
      grund(e && /** @type {Error} */ (e).message === "FORM" ? "RAUM_FORM_UNERWARTET" : "RAUM_UNLESBAR");
    }
  }

  /* 3. Konten: Mailklasse, nie die Adresse. */
  for (const k of konten) {
    if (abgelaufen()) { grund("ZEITGRENZE"); return aus(lesemodus); }
    try {
      const a = await lese(store.get(k, { type: "json" }));
      if (!istObjekt(a)) throw new Error("x");
      z.konten++;
      const kl = schlimmer(mailKlasse(a.email), mailKlasse(a.emailNorm));
      if (kl === "reserviert") z.kontenMailReserviert++; else if (kl === "sonstige") z.kontenMailSonstige++; else z.kontenOhneMail++;
    } catch { grund("KONTO_UNLESBAR"); }
  }

  /* 4. Nachfassliste der Selbststarts (Name und Mail des Inhabers): jeder Eintrag ist ein Treffer, nie Inhalt. */
  if (hatSelbststarts) {
    try {
      const liste = await lese(store.get("selbststarts", { type: "json" }));
      if (!Array.isArray(liste)) throw new Error("x");
      z.selbststartEintraege = liste.length;
    } catch { grund("SELBSTSTARTS_UNLESBAR"); }
  }

  if (gruende.size) return aus(lesemodus);
  const treffer = TREFFER_KLASSEN.reduce((s, k) => s + z[k], 0);
  const bericht = { werkzeug: "k4-heuristik-zaehler", fassung: 1, bewertbar: true, ergebnis: treffer > 0 ? "TREFFER" : "KEINE_TREFFER", lesemodus,
    gruende: [], treffer, zahlen: z };
  if (!nurZahlen(bericht)) { grund("AUSGABE_UNZULAESSIG"); return aus(lesemodus); }
  return bericht;
}

/* ------------------------------ Kommandozeile ------------------------------------------------------------------- */
const KURZHILFE = "Aufruf: k4-heuristik-zaehler.mjs zaehlen <Ablage> [--leseschicht <Wurzel>]   (nur lesend, nur Zahlen)";

/** @param {string[]} argv */
export async function main(argv) {
  const [befehl, ablage, ...rest] = argv;
  if (befehl !== "zaehlen" || !ablage || ablage.startsWith("--")) { console.error(KURZHILFE); return 2; }
  let leseschicht = WURZEL;
  if (rest.length) {
    if (rest.length !== 2 || rest[0] !== "--leseschicht" || !rest[1] || rest[1].startsWith("--")) { console.error(KURZHILFE); return 2; }
    leseschicht = rest[1];
  }
  /** @type {any} */ let bericht;
  try { bericht = await zaehlen({ ablage, leseschicht }); } catch { bericht = nichtBewertbar([{ code: "LESEFEHLER", anzahl: 1 }]); }
  const text = berichtZeilen(bericht).join("\n");
  if (Buffer.byteLength(text) > GRENZEN.maxAusgabeBytes) { console.log(berichtZeilen(nichtBewertbar([{ code: "AUSGABE_UNZULAESSIG", anzahl: 1 }])).join("\n")); return 1; }
  console.log(text);
  return bericht.bewertbar ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /* Auch ein später Fehler aus der fremden Leseschicht (Zeitgeber, abgewiesenes Versprechen) gibt nie einen Stacktrace aus. */
  const fest = () => { process.stdout.write(berichtZeilen(nichtBewertbar([{ code: "LESEFEHLER", anzahl: 1 }])).join("\n") + "\n"); process.exit(1); };
  process.on("unhandledRejection", fest);
  process.on("uncaughtException", fest);
  process.exit(await main(process.argv.slice(2)));
}

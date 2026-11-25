#!/usr/bin/env node
/* ==========================================================================
   K4-P3: SYNTHETISCHER ALTBESTAND-GENERATOR — eine Ablage im Stand des Produktionsbilds 274bfa0, nur Testdaten

   Zweck: Vor dem ersten Produktionswechsel muss die Migrationsprobe (K4, Staging-Gate) auf einem Bestand laufen
   können, der aussieht wie der alte, ohne dass Personendaten im Spiel sind. Dieses Werkzeug erzeugt ihn.
   Es ist der Eingang für K4-P4 (Vorwärts-Reparatur-Probe) und kann dem Staging-Gate (RST-5) als Fixture dienen.

   Was es tut
   - Holt den Code des Stands 274bfa0 mit `git archive` (nur server/lib) in einen Wegwerfordner und schreibt die Ablage
     mit DEM Code (werkzeug/synthetischer-altbestand-schreiber.mjs, eigener Prozess). Jede Datei hat damit die Gestalt
     und den Umschlag des alten Stands, nicht die des heutigen.
   - Räume (Namen fest): alt-leer (Betrieb ohne Inhalt), alt-pflege, alt-sicherheit (zwei Betriebe, einer mit ZAHL als
     Kennung), alt-gross (viele Personen), alt-bestandsform (Altform `bestand:`, unzerlegt), alt-betreiber (Rechnungen in
     Altform { nr, betrag }). Dazu Konten (@example.invalid; aktiv, gesperrt, eingeladen) mit Mitgliedschaften und
     Zugangscodes (auch einer unter dem alten, ungepfefferten Schlüssel; eine Altrolle `kunde`).
   - Plan, Abwesenheiten (krank, Urlaub, sonst, Schulung) und Stempel (auch ein offener) je Person und Tag.
   - Bestimmt: feste Saat (mulberry32), feste Uhr, Zufallszahlen und Zufallsbytes des Schreibers aus derselben Saat.
     Gleiche Eingabe, gleiche Bytes (Baum-Prüfsumme im Kurzbericht).
   - Selbsttest `pruefeAblage`: Umschlag, Schlüsselnamen, Kern/Scherben/Standzeiger, nur @example.invalid, keine langen
     Ziffernfolgen, Kennzeichnung SYNTHETISCH, alle Randfälle vorhanden. Bei Befund: Exit 1, die Ausgabe wird entfernt.

   Was es nie tut
   - keine Echtdaten, kein Netz außer einem `git fetch` des festen Stands, falls er lokal fehlt; keine Zufallsquelle ohne
     feste Saat; kein Schreiben in eine vorhandene, belegte Ablage; nichts im Repo; keine Zugangsdaten ausgeben.
   - Das Passwort und der Pfeffer der Konten sind feste Testwerte (SYNTH_*) — ohne Geheimniswert, nur für diese Ablage.

   Grenzen, die zu wissen sind
   - Endet der Prozess hart (Abbruch von außen, Stromausfall), läuft kein Aufräumen: ein Ordner %TEMP%/k4p3-alt-* und eine
     halb geschriebene Ausgabe können bleiben. Eine Ausgabe ohne bestandenen Selbsttest nie verwenden; `pruefen <Ablage>`
     ist die Gegenprobe.
   - Fehlt der Stand 274bfa0 lokal, holt `git fetch --depth 1 origin <Kennung>` ihn (setzt im vollen Klon einen shallow-
     Eintrag); git und tar haben eine Zeitgrenze von 120 s. Auf Linux/CI (flacher Checkout, GNU tar) bisher nicht belegt.
   - Ein vorhandener leerer Ausgabeordner wird wiederverwendet; ein anderer Prozess könnte ihn zwischen Prüfung und
     Schreiben füllen (Wettlauf). Für Sicherheit einen neuen Ordnernamen angeben (dann legt das Werkzeug ihn selbst an).
   - Standardwerte: Saat 20261125, Größe 120 Personen im Raum alt-gross, 28 Tage.

   Aufruf (Ausgabe: absoluter Pfad, neu oder leer, außerhalb des Repos):
     node werkzeug/synthetischer-altbestand.mjs erzeugen <Ausgabe> --ja [--saat N] [--groesse N] [--tage N] [--ohne-zahlkennung]
     node werkzeug/synthetischer-altbestand.mjs pruefen <Ablage> [--ohne-zahlkennung]     (nur Selbsttest, schreibt nichts)
   Die Ausgabe ist die Wurzel der Ablage (CENTRIC_DATEN). Für deploy/betriebskennungen-pruefen.mjs und die Migrationsprobe
   gilt deren Isolationsregel: den Ordner dort anlegen, wo sie ihn verlangen (…/scratchpad/daten-mig…). Für K4a Exit 0 ist
   `--ohne-zahlkennung` zu setzen (die Zahl-Kennung ist der absichtliche NO-GO-Fall dieses Werkzeugs).
   Ausgang: 0 ok · 1 Fehler (Erzeugung oder Selbsttest) · 2 Aufruf · 3 Schutz hat abgelehnt, nichts geschrieben.
   Tests: pruefungen/synthetischer-altbestand.test.js.
   ========================================================================== */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHREIBER = path.join(WURZEL, "werkzeug", "synthetischer-altbestand-schreiber.mjs");

/* ------------------------------ Festlegungen ------------------------------------------------------------------- */
/** Produktionsstand, dessen Code die Ablage schreibt (deploy/FREIGEGEBENE-IMAGES.md). */
export const REF_PRODUKTION = "274bfa0baca5681f383eea334aab69875f31d5c1";
export const DEFAULT_SAAT = 20261125;
export const FESTE_UHR = "2026-10-05T06:00:00.000Z";      // ein Montag; Plan und Stempel liegen davor und danach
export const PLAN_START = "2026-09-14";
export const SYNTH_PFEFFER = "k4p3-synthetischer-pfeffer-nur-test-ohne-wert";
export const SYNTH_PASSWORT = "synthetisch-nur-zum-pruefen-1";
export const MARKE = "SYNTHETISCH";
export const MAIL_ENDE = "@example.invalid";
export const GRENZEN = Object.freeze({ minGroesse: 20, maxGroesse: 400, maxTage: 62, maxBytes: 64 * 1024 * 1024, maxSaat: 2147483647 });
const ZAHL_KENNUNG = 90417;
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";

/* ------------------------------ Hilfen ------------------------------------------------------------------------- */
function mulberry32(a) {
  return function zufall() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tagPlus = (tag, n) => { const d = Date.parse(`${tag}T00:00:00Z`) + n * 86400000; return new Date(d).toISOString().slice(0, 10); };
const nn = (i, w = 2) => String(i).padStart(w, "0");

/** @param {unknown} s */
export function saatPruefen(s) {
  if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > GRENZEN.maxSaat)
    throw new Error(`Saat: ganze Zahl von 1 bis ${GRENZEN.maxSaat} verlangt`);
  return s;
}

/* ------------------------------ Plan (rein, ohne Ein-/Ausgabe) -------------------------------------------------- */
/**
 * Baut den Plan: alle Werte, die der Schreiber ablegt. Rein und bestimmt.
 * @param {{ saat?: number, groesse?: number, tage?: number, zahlkennung?: boolean }} [o]
 */
export function planBauen({ saat = DEFAULT_SAAT, groesse = 120, tage = 28, zahlkennung = true } = {}) {
  saatPruefen(saat);
  if (!Number.isInteger(groesse) || groesse < GRENZEN.minGroesse || groesse > GRENZEN.maxGroesse)
    throw new Error(`Größe: ganze Zahl von ${GRENZEN.minGroesse} bis ${GRENZEN.maxGroesse} verlangt`);
  if (!Number.isInteger(tage) || tage < 1 || tage > GRENZEN.maxTage)
    throw new Error(`Tage: ganze Zahl von 1 bis ${GRENZEN.maxTage} verlangt`);
  const rnd = mulberry32(saat);
  const ganz = (/** @type {number} */ n) => Math.floor(rnd() * n);
  const heute = FESTE_UHR.slice(0, 10);

  /** @param {string} raum @param {string} kuerzel */
  const betrieb = (raum, id, branche, n, { einheiten = 1, plan = true, stempel = true, abwesend = true } = {}) => {
    const ep = Array.from({ length: Math.max(0, einheiten - 1) }, (_, i) => ({ id: `e${i + 2}`, nr: i + 2 }));
    const einheitIds = ["e1", ...ep.map((e) => e.id)];
    const personen = Array.from({ length: n }, (_, i) => {
      const nr = i + 1;
      const rolle = i === 0 ? "leitung" : i === 1 ? "planer" : i === 2 ? "subplaner" : i === 3 ? "betriebsrat" : "mitarbeiter";
      const einheitId = einheitIds[i % einheitIds.length];
      return { id: `p${nr}`, vorname: "Testperson", nachname: `Altbestand ${nn(nr, 3)}`, funktion: "Fachkraft", rolle,
        bereich: rolle === "leitung" ? "ALLE" : einheitId, status: "aktiv", email: `${raum}-p${nr}${MAIL_ENDE}`,
        personalnummer: `SYN-${nn(nr, 4)}`, eintritt: "2024-01-01", austritt: n >= 6 && i === n - 2 ? "2026-09-30" : null,
        zugehoerigkeit: [{ ab: "2024-01-01", einheitId }] };
    });
    /** @type {{id: string, personId: string, art: string, von: string, bis: string, notiz: string}[]} */
    const abwesenheiten = [];
    const gesperrt = new Set();
    if (abwesend && n >= 3) {
      const arten = ["krank", "urlaub", "krank", "sonst", "schulung"];
      const k = Math.max(3, Math.round(n / 5));
      for (let i = 0; i < k; i++) {
        const pid = `p${1 + ganz(n)}`;
        const von = ganz(Math.max(1, tage - 3));
        const bis = Math.min(tage - 1, von + ganz(3));
        abwesenheiten.push({ id: `abw-${i + 1}`, personId: pid, art: arten[i % arten.length], von: tagPlus(PLAN_START, von), bis: tagPlus(PLAN_START, bis), notiz: "" });
        for (let d = von; d <= bis; d++) gesperrt.add(`${pid}|${tagPlus(PLAN_START, d)}`);
      }
    }
    /** @type {[string, number][]} */ const einteilungen = [];
    /** @type {Record<string, any>} */ const einstempeln = {};
    /** @type {Record<string, any>} */ const erfassung = {};
    if (plan) {
      for (const p of personen) {
        for (let d = 0; d < tage; d++) {
          const tag = tagPlus(PLAN_START, d);
          const k = `${p.id}|${tag}`;
          if (gesperrt.has(k) || rnd() > 0.7) continue;
          const ds = ganz(3);
          einteilungen.push([k, ds]);
          if (stempel && tag < heute && ganz(3) === 0) {
            const beginn = [6, 14, 22][ds];
            const m = ganz(12);
            const start = `${nn(beginn)}:${nn(m)}`;
            const ende = `${nn((beginn + 8) % 24)}:${nn(ganz(12))}`;
            const startAm = `${tag}T${start}:00.000Z`;
            const offen = d === Math.min(tage, 14) - 1 && p.id === "p5" && tag < heute;
            einstempeln[k] = offen ? { start, startAm } : { start, startAm, ende, endeAm: `${tagPlus(tag, ds === 2 ? 1 : 0)}T${ende}:00.000Z` };
            if (!offen) erfassung[k] = { start, ende, bestaetigt: false };
          }
        }
      }
    }
    return { id, name: `${MARKE} Altbestand ${raum}`, branche, kontakt: `${raum}${MAIL_ENDE}`, land: "HE", personen, abwesenheiten,
      einteilungen, einstempeln, erfassung, zusatzEinheiten: ep };
  };

  const leerBetrieb = { ...betrieb("alt-leer", "alt-leer-m1", "pflege", 0, { plan: false, abwesend: false }), personen: [] };
  const raeume = [
    { raum: "alt-leer", form: "kern", rechnungen: [], betriebe: [leerBetrieb] },
    { raum: "alt-pflege", form: "kern", rechnungen: [], betriebe: [betrieb("alt-pflege", "alt-pflege-m1", "pflege", 12, { einheiten: 2 })] },
    { raum: "alt-sicherheit", form: "kern", rechnungen: [], betriebe: [
      betrieb("alt-sicherheit", "alt-sicherheit-m1", "sicherheit", 10),
      { ...betrieb("alt-sicherheit-2", zahlkennung ? ZAHL_KENNUNG : "alt-sicherheit-m2", "sicherheit", 6), name: `${MARKE} Altbestand alt-sicherheit-2` }] },
    { raum: "alt-gross", form: "kern", rechnungen: [], betriebe: [betrieb("alt-gross", "alt-gross-m1", "pflege", groesse, { einheiten: 4 })] },
    { raum: "alt-bestandsform", form: "alt", rechnungen: [], betriebe: [betrieb("alt-bestandsform", "alt-bestandsform-m1", "pflege", 8)] },
    { raum: "alt-betreiber", form: "kern", betriebe: [betrieb("alt-betreiber", "alt-betreiber-m1", "sonstiges", 3, { plan: false, stempel: false }) ],
      rechnungen: [{ nr: "SYN-0001", betrag: 49 }, { nr: "SYN-0002", betrag: 99, datum: "2026-09-01" }, { nr: "SYN-0003", betrag: 0 }] },
  ];

  const kennung = () => [0, 1, 2].map(() => Array.from({ length: 4 }, () => ALPHABET[ganz(ALPHABET.length)]).join("")).join("-");
  const konten = [
    { nr: 1, email: `konto-01${MAIL_ENDE}`, zustand: "aktiv", mitglied: { raum: "alt-pflege", mandantId: "alt-pflege-m1", person: "p1", rolle: "leitung" } },
    { nr: 2, email: `konto-02${MAIL_ENDE}`, zustand: "aktiv", mitglied: { raum: "alt-pflege", mandantId: "alt-pflege-m1", person: "p5", rolle: "mitarbeiter" } },
    { nr: 3, email: `konto-03${MAIL_ENDE}`, zustand: "gesperrt", mitglied: { raum: "alt-sicherheit", mandantId: "alt-sicherheit-m1", person: "p2", rolle: "planer" } },
    { nr: 4, email: `konto-04${MAIL_ENDE}`, zustand: "eingeladen", mitglied: null },
    { nr: 5, email: `konto-05${MAIL_ENDE}`, zustand: "aktiv", mitglied: null },
  ];
  const codes = [
    { name: "Synthetisch Leitung", raum: "alt-pflege", mandantId: "alt-pflege-m1", rolle: "leitung", person: "p1", altform: false },
    { name: "Synthetisch Mitarbeit 1", raum: "alt-pflege", mandantId: "alt-pflege-m1", rolle: "mitarbeiter", person: "p5", altform: false },
    { name: "Synthetisch Mitarbeit 2", raum: "alt-pflege", mandantId: "alt-pflege-m1", rolle: "mitarbeiter", person: "p6", altform: false },
    { name: "Synthetisch Betriebsrat", raum: "alt-pflege", mandantId: "alt-pflege-m1", rolle: "betriebsrat", person: "p4", altform: false },
    { name: "Synthetisch Probierraum", raum: "alt-leer", mandantId: "alt-leer-m1", rolle: "kunde", person: null, altform: false },
    { name: "Synthetisch Altschlüssel", raum: "alt-sicherheit", mandantId: "alt-sicherheit-m1", rolle: "mitarbeiter", person: "p5", altform: true },
  ].map((c) => ({ ...c, code: kennung() }));

  return { saat, uhr: FESTE_UHR, laeuftAb: "2026-12-31", pfeffer: SYNTH_PFEFFER, passwort: SYNTH_PASSWORT, zahlkennung, raeume, konten, codes };
}

/* ------------------------------ Schutz des Ausgabepfads --------------------------------------------------------- */
/**
 * Prüft den Ausgabepfad, ohne etwas anzulegen.
 * @param {unknown} ausgabe
 * @param {{ wurzel?: string, env?: Record<string, string|undefined> }} [o]
 * @returns {{ ok: boolean, grund?: string, pfad?: string, neu?: boolean }}
 */
/** UNC-Pfad (Freigabe) oder Gerätepfad? Eigene Regelfunktion, damit sie ohne Dateisystem prüfbar ist. @param {string} p */
export const uncPfad = (p) => /^[\\/]{2}/.test(p);

/** Echter Pfad in der Betriebssystemfassung: löst auch 8.3-Kurznamen (Windows) auf. @param {string} p */
const echterPfad = (p) => realpathSync.native(p);

export function ausgabePruefen(ausgabe, { wurzel = WURZEL, env = process.env } = {}) {
  const nein = (/** @type {string} */ grund) => ({ ok: false, grund });
  if (typeof ausgabe !== "string" || !ausgabe.trim()) return nein("Ausgabe fehlt");
  if (ausgabe.includes("\0") || ausgabe.length > 240) return nein("Ausgabe ungültig (Zeichen oder Länge)");
  if (uncPfad(ausgabe)) return nein("UNC-Pfade sind nicht zulässig");
  if (!path.isAbsolute(ausgabe)) return nein("Ausgabe muss ein absoluter Pfad sein");
  if (ausgabe.split(/[\\/]+/).includes("..")) return nein("Ausgabe darf kein „..“ enthalten");
  const pfad = path.resolve(ausgabe);
  if (path.parse(pfad).root === pfad) return nein("Wurzel eines Laufwerks ist kein Ziel");
  const gleichOderIn = (/** @type {string} */ a, /** @type {string} */ b) => {
    const gross = process.platform === "win32" ? (/** @type {string} */ x) => x.toLowerCase() : (/** @type {string} */ x) => x;
    const r = path.relative(gross(a), gross(b));
    return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
  };
  if (gleichOderIn(path.resolve(wurzel), pfad)) return nein("Ausgabe liegt im Repo — dort entstehen keine Daten");
  let st = null;
  try { st = lstatSync(pfad); } catch (e) { if (!e || /** @type {any} */ (e).code !== "ENOENT") return nein("Ausgabe nicht prüfbar"); }
  /** @type {string|null} */ let echt = null;
  if (st) {
    if (st.isSymbolicLink()) return nein("Ausgabe ist ein Verweis (Link/Junction)");
    if (!st.isDirectory()) return nein("Ausgabe ist kein Ordner");
    if (readdirSync(pfad).length > 0) return nein("Ausgabeordner muss neu oder leer sein");
    echt = echterPfad(pfad);
  } else {
    const eltern = path.dirname(pfad);
    let pst = null;
    try { pst = lstatSync(eltern); } catch { /* fehlt */ }
    if (pst && pst.isSymbolicLink()) return nein("Elternordner ist ein Verweis (Link/Junction)");
    if (!pst || !pst.isDirectory()) return nein("Elternordner der Ausgabe fehlt (es wird nur ein Ordner angelegt)");
    echt = path.join(echterPfad(eltern), path.basename(pfad));
  }
  if (gleichOderIn(echterPfad(path.resolve(wurzel)), echt)) return nein("Ausgabe liegt im Repo — dort entstehen keine Daten");
  const laufend = env.CENTRIC_DATEN;
  if (laufend) {
    let l = path.resolve(laufend);
    try { l = echterPfad(l); } catch { /* nicht vorhanden */ }
    if (gleichOderIn(l, echt) || gleichOderIn(echt, l)) return nein("Ausgabe berührt die laufende Ablage (CENTRIC_DATEN)");
  }
  return { ok: true, pfad, neu: !st };
}

/* ------------------------------ Altstand holen (git archive) ---------------------------------------------------- */
/** @param {string} ref @param {string} ziel */
function altstandHolen(ref, ziel) {
  const git = (/** @type {string[]} */ a) => spawnSync("git", a, { cwd: WURZEL, maxBuffer: 1 << 30, timeout: 120000 });
  if (git(["cat-file", "-e", `${ref}^{commit}`]).status !== 0) git(["fetch", "--no-tags", "--depth", "1", "origin", ref]);
  if (git(["cat-file", "-e", `${ref}^{commit}`]).status !== 0) throw new Error(`Altstand ${ref} nicht verfügbar (git fetch origin ${ref})`);
  const a = git(["archive", "--format=tar", ref, "server/lib"]);
  if (a.status !== 0) throw new Error(`git archive fehlgeschlagen: ${String(a.stderr).slice(0, 200)}`);
  const x = spawnSync("tar", ["-xf", "-"], { cwd: ziel, input: a.stdout, maxBuffer: 1 << 30, timeout: 120000 });
  if (x.status !== 0) throw new Error(`tar fehlgeschlagen: ${String(x.stderr).slice(0, 200)}`);
}

/* ------------------------------ Baum-Prüfsumme und Größe -------------------------------------------------------- */
/** @param {string} wurzel @returns {string[]} relative Pfade, sortiert, mit / */
function alleDateien(wurzel) {
  const aus = [];
  const geh = (/** @type {string} */ rel) => {
    for (const e of readdirSync(path.join(wurzel, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) geh(r); else aus.push(r);
    }
  };
  geh("");
  return aus.sort();
}
/** Prüfsumme über Pfade und Bytes aller Dateien — gleiche Ablage, gleiche Summe. @param {string} wurzel */
export function baumHash(wurzel) {
  const h = createHash("sha256");
  for (const r of alleDateien(wurzel)) { h.update(`${r}\0`); h.update(readFileSync(path.join(wurzel, r))); h.update("\0"); }
  return h.digest("hex");
}
const bytesVon = (/** @type {string} */ wurzel) => alleDateien(wurzel).reduce((s, r) => s + statSync(path.join(wurzel, r)).size, 0);

/* ------------------------------ Selbsttest der Ablage ----------------------------------------------------------- */
const codiere = (/** @type {string} */ key) => {
  let aus = "";
  for (const byte of Buffer.from(key, "utf8")) {
    const z = String.fromCharCode(byte);
    aus += /[A-Za-z0-9_-]/.test(z) ? z : "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return `${aus}.json`;
};
const SCHLUESSEL_KLASSEN = ["kern:", "scherbe:", "stand:", "bestand:", "account:", "konto:", "kontoId:", "mitglied:", "raummitglied:", "mitgliedlauf:"];

/**
 * Prüft eine Ablage auf Gestalt des Stands 274bfa0 und auf die absichtlichen Randfälle. Liest nur.
 * @param {string} wurzel
 * @param {{ zahlkennung?: boolean }} [o]
 * @returns {string[]} Befunde; leer = in Ordnung
 */
export function pruefeAblage(wurzel, { zahlkennung = true } = {}) {
  /** @type {string[]} */ const b = [];
  let st = null;
  try { st = lstatSync(wurzel); } catch { /* fehlt */ }
  if (!st || !st.isDirectory()) return [`Ablage-Wurzel nicht vorhanden oder kein Verzeichnis`];
  for (const e of readdirSync(wurzel, { withFileTypes: true })) {
    if (!(e.isDirectory() && e.name === "centric")) b.push(`unerwartet in der Wurzel: ${e.isDirectory() ? "Verzeichnis" : "Datei"} ${e.name}`);
  }
  const dir = path.join(wurzel, "centric");
  if (!existsSync(dir)) return [...b, "Store centric fehlt"];
  /** @type {Map<string, any>} */ const daten = new Map();
  /** @type {Map<string, any>} */ const metadaten = new Map();
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".tmp")) { b.push(`Zwischendatei (.tmp): ${name}`); continue; }
    let key;
    try { key = decodeURIComponent(name.slice(0, -5)); } catch { b.push(`Dateiname nicht lesbar: ${name}`); continue; }
    if (!name.endsWith(".json") || codiere(key) !== name) { b.push(`Dateiname nicht in der Form der Ablage: ${name}`); continue; }
    if (!SCHLUESSEL_KLASSEN.some((p) => key.startsWith(p))) b.push(`Schlüsselklasse unbekannt: ${key.slice(0, 20)}`);
    let u;
    try { u = JSON.parse(readFileSync(path.join(dir, name), "utf8")); } catch { b.push(`kein gültiges JSON: ${name}`); continue; }
    if (!u || typeof u !== "object" || Array.isArray(u)) { b.push(`Umschlag kein Objekt: ${name}`); continue; }
    if (u.fassung !== 1) b.push(`Umschlag: fassung ist ${JSON.stringify(u.fassung)} (${name})`);
    if (typeof u.etag !== "string" || !u.etag) b.push(`Umschlag: etag fehlt (${name})`);
    if (u.typ !== "json" && u.typ !== "text") b.push(`Umschlag: typ ungültig (${name})`);
    if (!u.metadata || typeof u.metadata !== "object") b.push(`Umschlag: metadata fehlt (${name})`);
    if (!("daten" in u)) b.push(`Umschlag: daten fehlen (${name})`);
    daten.set(key, u.daten);
    metadaten.set(key, u.metadata);
  }

  /* Texte, Objektschlüssel und Umschlag-Metadaten: nur @example.invalid; keine Telefon-/Kontonummern-artigen Ziffern.
     Ausgenommen sind einzelne Hash- und Kennungsfelder der Konten (Feld für Feld, nicht ganze Schlüsselklassen). */
  const ZIFFERN_FELD = /^(account:|kontoId:|mitglied:|mitgliedlauf:|raummitglied:)/;
  const HASH_FELDER = new Set([".id", ".accountId", ".passwort", ".emailNorm", ".emailHash", ".generation", ".raum", ".mitgliedId", ".kontoId", ".schluessel"]);
  const nummernartig = (/** @type {string} */ v) => {
    const t = v.replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, "").replace(/\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?/g, "");
    if (/\d{7,}/.test(t)) return true;
    return (t.match(/\+?\d[\d ()./-]{5,}\d/g) || []).some((m) => m.replace(/\D/g, "").length >= 7);
  };
  const text = (/** @type {string} */ v, /** @type {string} */ key, /** @type {string} */ pfad) => {
    for (const m of v.match(/[^\s@"',;]+@[^\s@"',;]+/g) || []) if (!m.endsWith(MAIL_ENDE)) { b.push(`Mailadresse nicht ${MAIL_ENDE}: in ${key} ${pfad}`); break; }
    const feld = pfad.replace(/\[\d+\]/g, "");
    if (!(ZIFFERN_FELD.test(key) && HASH_FELDER.has(feld.slice(feld.lastIndexOf(".")))) && nummernartig(v)) b.push(`lange Ziffernfolge oder Telefonnummer in ${key} ${pfad}`);
  };
  const durchlauf = (/** @type {any} */ v, /** @type {string} */ key, /** @type {string} */ pfad) => {
    if (typeof v === "string") text(v, key, pfad);
    else if (Array.isArray(v)) v.forEach((x, i) => durchlauf(x, key, `${pfad}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { text(k, key, `${pfad}.<Schlüssel>`); durchlauf(x, key, `${pfad}.${k}`); }
  };
  for (const [key, v] of daten) durchlauf(v, key, "");
  for (const [key, m] of metadaten) durchlauf(m, key, ".<metadata>");

  /* Betriebe: Kern + Scherben und Altform. */
  /** @type {{ raum: string, form: string, wurzel: any }[]} */ const raeume = [];
  for (const [key, v] of daten) {
    if (key.startsWith("kern:")) raeume.push({ raum: key.slice(5), form: "kern", wurzel: v });
    else if (key.startsWith("bestand:")) raeume.push({ raum: key.slice(8), form: "alt", wurzel: v });
  }
  let leererBetrieb = false, zahl = 0, krank = 0, stempel = 0, gross = 0, rechnungen = 0, altRechnungen = 0, plan = 0, abw = 0;
  for (const r of raeume) {
    const w = r.wurzel;
    if (!w || w.version !== 9 || !Array.isArray(w.mandanten)) { b.push(`Bestand ${r.raum}: Gestalt (version 9, mandanten) fehlt`); continue; }
    if (r.form === "kern" && !daten.has(`stand:${r.raum}:aktuell`)) b.push(`Standzeiger fehlt für ${r.raum}`);
    if (r.form === "alt" && daten.has(`kern:${r.raum}`)) b.push(`Altform ${r.raum} hat zugleich einen Kern`);
    for (const x of Array.isArray(w.rechnungen) ? w.rechnungen : []) {
      rechnungen++;
      if (x && typeof x === "object" && !("nummer" in x) && !("positionen" in x)) altRechnungen++;
    }
    for (const m of w.mandanten) {
      if (!m || typeof m.name !== "string" || !m.name.startsWith(MARKE)) b.push(`Kennzeichnung ${MARKE} fehlt im Betriebsnamen (${r.raum})`);
      for (const p of m.personen || []) {
        if (!p || p.vorname !== "Testperson" || !/^Altbestand \d{3}$/.test(String(p.nachname))) b.push(`Personenname nicht aus der Positivliste (${r.raum})`);
      }
      if (typeof m.id === "number") zahl++;
      else if (typeof m.id !== "string") b.push(`Betrieb ohne Kennung in ${r.raum}`);
      const n = (m.personen || []).length;
      if (n >= GRENZEN.minGroesse) gross++;
      if (n === 0 && !Object.keys(m.abweichungen || {}).length && !(m.abwesenheiten || []).length) leererBetrieb = true;
      krank += (m.abwesenheiten || []).filter((a) => a.art === "krank").length;
      abw += (m.abwesenheiten || []).length;
      plan += Object.keys(m.abweichungen || {}).length;
      stempel += Object.keys(m.einstempeln || {}).length;
    }
  }
  for (const [key, v] of daten) {
    if (!key.startsWith("scherbe:")) continue;
    const teil = key.split(":");
    const raum = teil[1], id = teil[2];
    const kern = daten.get(`kern:${raum}`);
    if (!kern || !(kern.mandanten || []).some((m) => String(m.id) === id) || !v || String(v.mandantId) !== id)
      b.push(`Scherbe ohne Betrieb im Kern: ${key}`);
    stempel += Object.keys((v && v.felder && v.felder.einstempeln) || {}).length;
    plan += Object.keys((v && v.felder && v.felder.abweichungen) || {}).length;
  }
  if (!raeume.some((r) => r.form === "alt")) b.push("Randfall Altform (bestand:) fehlt");
  if (!leererBetrieb) b.push("Randfall leerer Betrieb fehlt");
  if (zahlkennung && zahl === 0) b.push("Randfall Zahl-Kennung fehlt");
  if (!zahlkennung && zahl > 0) b.push("Zahl-Kennung vorhanden, obwohl abgewählt");
  if (gross === 0) b.push("Randfall großer Raum fehlt");
  if (krank === 0) b.push("Randfall krank-Abwesenheit fehlt");
  if (abw === 0) b.push("Abwesenheiten fehlen");
  if (plan === 0) b.push("Plan (Einteilungen) fehlt");
  if (stempel === 0) b.push("Stempel fehlen");
  if (rechnungen === 0 || altRechnungen !== rechnungen) b.push("Rechnungen: fehlen oder nicht alle in Altform { nr, betrag }");

  /* Konten und Zugangscodes. */
  const konten = [...daten].filter(([k]) => k.startsWith("account:")).map(([, v]) => v);
  const stati = new Set(konten.map((k) => k && k.status));
  for (const s of ["aktiv", "gesperrt", "eingeladen"]) if (!stati.has(s)) b.push(`Konto im Zustand ${s} fehlt`);
  const codes = [...daten].filter(([k]) => k.startsWith("konto:"));
  const rollen = new Set(codes.map(([, v]) => v && v.rolle));
  for (const r of ["leitung", "kunde"]) if (!rollen.has(r)) b.push(`Zugang mit Rolle ${r} fehlt`);
  if (!codes.some(([k]) => /^konto:[0-9a-f]{64}$/.test(k))) b.push("Zugangscode unter dem alten Schlüssel fehlt");
  if (!codes.some(([k]) => k.startsWith("konto:p1:"))) b.push("Zugangscode unter dem gepfefferten Schlüssel fehlt");
  return b;
}

/* ------------------------------ Erzeugen ------------------------------------------------------------------------ */
/**
 * @param {{ ausgabe: string, saat?: number, groesse?: number, tage?: number, zahlkennung?: boolean, ref?: string, maxBytes?: number, nachSchreiben?: ((ziel: string) => void) | null }} o
 */
export async function erzeugen({ ausgabe, saat = DEFAULT_SAAT, groesse = 120, tage = 28, zahlkennung = true, ref = REF_PRODUKTION,
  maxBytes = GRENZEN.maxBytes, nachSchreiben = null }) {
  if (typeof ref !== "string" || !/^[0-9a-f]{40}$/.test(ref)) throw new Error("Altstand: nur eine volle 40-stellige Kennung (Hex) zulässig");
  const plan = planBauen({ saat, groesse, tage, zahlkennung });
  const p = ausgabePruefen(ausgabe);
  if (!p.ok || !p.pfad) throw Object.assign(new Error(p.grund || "Ausgabe abgelehnt"), { schutz: true });
  const ziel = p.pfad;
  if (p.neu) mkdirSync(ziel);   // nicht rekursiv: scheitert, wenn der Ordner inzwischen entstanden ist
  else if (readdirSync(ziel).length > 0) throw Object.assign(new Error("Ausgabeordner muss neu oder leer sein"), { schutz: true });
  const aufraeumen = () => {
    try {
      const s = lstatSync(ziel);
      if (s.isSymbolicLink() || !s.isDirectory()) return;
      if (p.neu) rmSync(ziel, { recursive: true, force: true });
      else for (const n of readdirSync(ziel)) rmSync(path.join(ziel, n), { recursive: true, force: true });
    } catch { /* nichts zu räumen */ }
  };
  const alt = mkdtempSync(path.join(tmpdir(), "k4p3-alt-"));
  try {
    altstandHolen(ref, alt);
    const env = { ...process.env, TZ: "UTC" };
    for (const k of Object.keys(env)) if (k.startsWith("CENTRIC_")) delete env[k];
    const r = spawnSync(process.execPath, [SCHREIBER, alt, ziel], { input: JSON.stringify(plan), encoding: "utf8", env,
      maxBuffer: 256 * 1024 * 1024, timeout: 900000 });
    if (r.status !== 0) throw new Error(`Schreiber fehlgeschlagen (Exit ${r.status}): ${String(r.stderr).split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400)}`);
    const zeile = String(r.stdout).split("\n").find((z) => z.startsWith("ERGEBNIS "));
    if (!zeile) throw new Error("Schreiber meldet kein Ergebnis");
    const zahlen = JSON.parse(zeile.slice(9));
    if (typeof nachSchreiben === "function") nachSchreiben(ziel);   // nur für Tests: Eingriff vor Größenprüfung und Selbsttest
    const bytes = bytesVon(ziel);
    if (bytes > maxBytes) throw new Error(`Größe der Ausgabe ${bytes} Bytes über der Grenze ${maxBytes} Bytes`);
    const befunde = pruefeAblage(ziel, { zahlkennung });
    if (befunde.length) throw new Error(`Selbsttest: ${befunde.length} Befund(e): ${befunde.slice(0, 5).join("; ")}`);
    return { pfad: ziel, zahlen, bytes, dateien: alleDateien(ziel).length, baumHash: baumHash(ziel), saat, ref };
  } catch (e) {
    aufraeumen();
    throw e;
  } finally {
    rmSync(alt, { recursive: true, force: true });
  }
}

/* ------------------------------ Kommandozeile ------------------------------------------------------------------- */
const KURZHILFE = "Aufruf: synthetischer-altbestand.mjs erzeugen <Ausgabe> --ja [--saat N] [--groesse N] [--tage N] [--ohne-zahlkennung] | pruefen <Ablage> [--ohne-zahlkennung]";

/** @param {string[]} argv */
export async function main(argv) {
  const [befehl, pfad, ...rest] = argv;
  if (!["erzeugen", "pruefen"].includes(befehl || "") || !pfad || pfad.startsWith("--")) { console.error(KURZHILFE); return 2; }
  /** @type {Record<string, string|boolean>} */ const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const mitWert = ["--saat", "--groesse", "--tage"].includes(a);
    if (!(mitWert || ["--ja", "--ohne-zahlkennung"].includes(a)) || a in o) { console.error(`Unbekannte oder doppelte Option: ${a}\n${KURZHILFE}`); return 2; }
    if (mitWert) { const w = rest[++i]; if (w === undefined || !/^\d{1,10}$/.test(w)) { console.error(`${a}: ganze Zahl verlangt`); return 2; } o[a] = w; }
    else o[a] = true;
  }
  const zahlkennung = !o["--ohne-zahlkennung"];
  if (befehl === "pruefen") {
    if (o["--ja"] || o["--saat"] || o["--groesse"] || o["--tage"]) { console.error(KURZHILFE); return 2; }
    const bf = pruefeAblage(path.resolve(pfad), { zahlkennung });
    console.log(bf.length ? `SELBSTTEST: ${bf.length} Befund(e)\n${bf.map((x) => `  - ${x}`).join("\n")}` : "SELBSTTEST: bestanden");
    return bf.length ? 1 : 0;
  }
  if (!o["--ja"]) { console.error(`Ohne --ja wird nichts geschrieben.\n${KURZHILFE}`); return 2; }
  const num = (/** @type {string} */ k, /** @type {number} */ d) => (o[k] === undefined ? d : Number(o[k]));
  const saat = num("--saat", DEFAULT_SAAT), groesse = num("--groesse", 120), tage = num("--tage", 28);
  try { planBauen({ saat, groesse, tage, zahlkennung }); } catch (e) { console.error(String(/** @type {Error} */ (e).message)); return 2; }
  try {
    const e = await erzeugen({ ausgabe: pfad, saat, groesse, tage, zahlkennung });
    const z = e.zahlen;
    console.log([
      "SYNTHETISCHER ALTBESTAND erzeugt (nur Testdaten, Stand 274bfa0)",
      `  Saat ${e.saat} · Ablage: ${e.dateien} Dateien, ${e.bytes} Bytes · Baum-Prüfsumme ${e.baumHash}`,
      `  Räume ${z.raeume} (Altform ${z.altformRaeume}) · Betriebe ${z.betriebe} · Personen ${z.personen} · Einteilungen ${z.einteilungen} · Abwesenheiten ${z.abwesenheiten} · Stempel ${z.stempel}`,
      `  Konten ${z.konten} · Zugangscodes ${z.codes} · Rechnungen (Altform) ${z.rechnungen} · Zahl-Kennung ${zahlkennung ? "ja" : "nein"}`,
      "  Selbsttest: bestanden",
    ].join("\n"));
    return 0;
  } catch (e) {
    const m = String(/** @type {any} */ (e).message || e);
    if (/** @type {any} */ (e).schutz) { console.error(`Abgelehnt: ${m}`); return 3; }
    console.error(`Fehler: ${m}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));

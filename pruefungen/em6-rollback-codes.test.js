/* ==========================================================================
   E-M6 — WIDERRUFENE UND ERSETZTE ZUGANGSDATEN BLEIBEN NACH JEDEM RÜCKSPRUNG UNGÜLTIG
   (verbindliche Betreiberentscheidung 2026-11-13; server/lib/widerrufbuch.mjs)

   Gegen ECHTE Serverprozesse (node server.mjs) und das echte Werkzeug
   (node werkzeug/ablage-sicherung.mjs), mit Neustart:

     1. Betrieb + Codes → Sicherung „vorher" → einen Code sperren, einen ersetzen (sperren + Einladung → neuer Code),
        einen umgeschlüsselten Code (Kette ersetztDurch) über die Kurzkennung sperren, einen Verwalterschlüssel sperren,
        zwei Erstanmeldecodes (Gestalt aus PR #281) einlösen: E „angelegt" (an die erste Leitung gebunden — bleibt
        GÜLTIG), F „belegt" (ohne Person — ungültig) → Sicherung „nachher" → Server stoppen → „vorher" mit dem Werkzeug
        zurückspielen → Server neu starten: Widerrufenes bleibt ungültig, Gültiges gilt, Marke der Ersteinrichtung
        wiederhergestellt; „nachher" zurückgespielt: die erste Leitung (E) meldet sich an (Review E-M6, Befund 1).
     2. Bild-Rücksprung: der ALTE Server (Merge-Basis vor E-M6 und das Produktionsbild 274bfa0, das `ersetztDurch` nicht
        kennt) auf den Daten der neuen Fassung → dieselben Codes und der Verwalterschlüssel bleiben ungültig. Gegenprobe
        (rot vorher): altes Werkzeug + alter Server beleben den widerrufenen Code wieder.
     3. Widerruf wirkt zuerst (Befund 3): Widerrufbuch nicht schreibbar → Sperre und Sitzungsende wirken, 503 „Widerruf
        wirksam, Widerrufbuch nicht beschrieben", der Neustart holt den Eintrag nach; harter Prozessabbruch zwischen
        Ablage und Buch (vorgeladener Kill) → der Code bleibt nach Wiederherstellung und Neustart ungültig.
     4. Sitzungen und Kalenderfeeds fragen das Buch (Befund 4), fail-closed.
     5. Manipuliertes, fehlendes, fremdes Widerrufbuch und anderer Pfeffer → fail-closed; Werkzeug fasst nichts an und
        verweigert eine belegte Ablage (Prozesssperre, Befund 5).
     6. PR #281 mit der ECHTEN erstleitung.mjs (Kopplungsrunde, Review C1–C3): Einlösen schreibt Abschluss bzw. Widerruf
        („belegt") sofort ins Buch; Regime-Marke im Buch — eine ältere Sicherung ohne sie (Werkzeug, --zustand) oder eine
        Verzeichniskopie (Serverstart) lässt den Betrieb streng; Sicherung von VOR dem ersten Erstanmeldecode: Marke aus
        dem Buch über den Bestand, keine zweite erste Leitung; harter Abbruch zwischen Bindung und Buch (vorgeladener
        Kill) → der Neustart trägt den Abschluss nach. Liegt erstleitung.mjs nicht auf dem Stand: ausdrücklich
        übersprungen (TODO-Wächter).

   Aufruf: npx vitest run pruefungen/em6-rollback-codes.test.js --testTimeout=240000
   ========================================================================== */
// zeit-ok: echte Serverprozesse laufen auf der echten Uhr (Sitzungsfrische, Prozesssperre); Zeitstempel hier nur als Datenwerte.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 240000;
const PFEFFER = "em6-pfeffer-nur-zum-pruefen-0123456789";
const RAUM = "em6-haus";
const RAUM2 = "em6-neu";
const ERSTE = "p_e0000a1";   // Personenkennung der ersten Leitung (Gestalt aus PR #281)
/** Altbilder: Merge-Basis vor E-M6 (integration/release-v4) und das Produktionsbild (deploy/FREIGEGEBENE-IMAGES.md). */
const ALT = {
  basis: process.env.EM6_ALT_BASIS || "76621eba7c46c9ec643c826b2d1067555ddf10ad",
  produktion: process.env.EM6_ALT_PRODUKTION || "274bfa0baca5681f383eea334aab69875f31d5c1",
};
const ERSTLEITUNG_DA = existsSync(path.join(WURZEL, "server", "lib", "erstleitung.mjs"));

let T;            // Wegwerfwurzel
let DATEN, ZUSTAND, STATIK, SICH;
let M;            // Module der neuen Fassung (im Prüfprozess, nur bei stehendem Server)
const C = {};     // Codes
const V = {};     // Verwalterschlüssel
const altOrdner = {};

const freierPort = () => new Promise((ok, nein) => {
  const s = createServer(); s.once("error", nein);
  s.listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); });
});
const ip = () => `10.${(randomBytes(1)[0] % 200) + 1}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

/** Ein echter Serverprozess (neue oder alte Fassung) auf DATEN/ZUSTAND. `env`: zusätzliche Umgebung (Vorladen). */
async function starten({ wurzel = WURZEL, pfeffer = PFEFFER, env = {} } = {}) {
  const port = await freierPort();
  const basis = `http://127.0.0.1:${port}`;
  let log = "";
  const p = spawn(process.execPath, ["server.mjs"], {
    cwd: wurzel,
    env: { ...process.env, PORT: String(port), CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_STATIK: STATIK,
      CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "em6-geheim", CENTRIC_PFEFFER: pfeffer,
      CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "production",
      CENTRIC_AUFRAEUMEN: "aus", CENTRIC_UEBERWACHUNG: "aus", CENTRIC_ZUSTELL_TAKT: "aus", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (d) => { log += d; });
  p.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 300; i++) {
    if (await fetch(`${basis}/gesund`).then(() => true, () => false)) break;
    if (p.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (p.exitCode !== null) throw new Error(`Server beendet:\n${log}`);
  const beendet = new Promise((ok) => { if (p.exitCode !== null) ok(undefined); else p.once("exit", () => ok(undefined)); });
  const stoppen = () => new Promise((ok) => {
    if (p.exitCode !== null) return ok(undefined);
    const not = setTimeout(() => p.kill("SIGKILL"), 5000);
    p.once("exit", () => { clearTimeout(not); ok(undefined); });
    p.kill("SIGTERM");
  });
  return { basis, stoppen, beendet, prozess: p, log: () => log };
}

async function anmelden(s, code) {
  const r = await fetch(`${s.basis}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ zugangscode: code }) });
  let d = null; try { d = await r.json(); } catch { /* leer */ }
  return { status: r.status, daten: d };
}
async function post(s, pfad, token, rumpf) {
  const r = await fetch(`${s.basis}${pfad}`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(rumpf) });
  let d = null; try { d = await r.json(); } catch { /* leer */ }
  return { status: r.status, daten: d };
}
const bestandAbruf = async (s, token) => (await fetch(`${s.basis}/api/bestand`,
  { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": ip() } })).status;
/** Verwalterschlüssel prüfen: 401 = abgewiesen; alles andere (200, 403 zweiter Faktor) = der Schlüssel gilt. */
const verwalterAbruf = async (s, schluessel) => (await fetch(`${s.basis}/einrichten/verwalter`,
  { headers: { authorization: `Bearer ${schluessel}`, "x-forwarded-for": ip() } })).status;

/** Das Werkzeug als eigener Prozess (neue oder alte Fassung). */
function werkzeug(args, { wurzel = WURZEL, pfeffer = PFEFFER } = {}) {
  const r = spawnSync(process.execPath, [path.join(wurzel, "werkzeug", "ablage-sicherung.mjs"), ...args], {
    cwd: wurzel, encoding: "utf8",
    env: { ...process.env, CENTRIC_PFEFFER: pfeffer, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: "" } });
  return { code: r.status, aus: `${r.stdout}\n${r.stderr}` };
}
const SICHERUNGEN = {};
const sichern = (name) => {
  const r = werkzeug(["sichern", "--quelle", DATEN, "--ziel", path.join(SICH, name), "--ruhe", "0"]);
  expect(r.code, r.aus).toBe(0);
  SICHERUNGEN[name] = /Sicherung vollständig: (.+)/.exec(r.aus)[1].trim();
  return SICHERUNGEN[name];
};
const wiederherstellen = (sicherung, extra = [], o = {}) =>
  werkzeug(["wiederherstellen", "--sicherung", sicherung, "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung", ...extra], o);

const ablageDatei = (schluessel) => path.join(DATEN, "centric", M.ablage.dateiname(schluessel));
const kontoDatei = (schluessel) => ablageDatei(`konto:${schluessel}`);
const kontoLesen = async (schluessel) => JSON.parse(await readFile(kontoDatei(schluessel), "utf8")).daten;
const ablageLesen = async (schluessel) => JSON.parse(await readFile(ablageDatei(schluessel), "utf8")).daten;
const buchDatei = () => path.join(ZUSTAND, "zugang-widerrufe.json");
const buchRoh = async () => JSON.parse(await readFile(buchDatei(), "utf8"));
const centric = () => M.ablage.getStore({ name: "centric", consistency: "strong" });
const k = (code) => M.codes.ablageSchluessel(code);

const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const neuerCode = () => [0, 1, 2].map(() => Array.from(randomBytes(4)).map((b) => ALPHABET[b % ALPHABET.length]).join("")).join("-");
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

/** Ein alter Stand des Repos als Verzeichnis (git archive), mit Verweis auf node_modules — nie kopiert, nie gelöscht. */
async function altStand(rev) {
  if (altOrdner[rev]) return altOrdner[rev];
  if (spawnSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: WURZEL }).status !== 0)
    spawnSync("git", ["fetch", "--no-tags", "--depth", "1", "origin", rev], { cwd: WURZEL, encoding: "utf8" });
  if (spawnSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: WURZEL }).status !== 0)
    throw new Error(`Altstand ${rev} nicht verfügbar (git fetch origin ${rev})`);
  const ziel = await mkdtemp(path.join(T, `alt-${rev.slice(0, 8)}-`));
  /* git archive → tar über die Standardeingabe, im Zielordner (keine Laufwerksangabe für tar: GNU tar unter Windows). */
  let a = spawnSync("git", ["archive", "--format=tar", rev, "server.mjs", "server", "werkzeug", "package.json", "vendor"],
    { cwd: WURZEL, maxBuffer: 1 << 30 });
  if (a.status !== 0)
    a = spawnSync("git", ["archive", "--format=tar", rev, "server.mjs", "server", "werkzeug", "package.json"], { cwd: WURZEL, maxBuffer: 1 << 30 });
  if (a.status !== 0) throw new Error(`git archive ${rev}: ${a.stderr}`);
  const x = spawnSync("tar", ["-xf", "-"], { cwd: ziel, input: a.stdout, encoding: "buffer" });
  if (x.status !== 0) throw new Error(`tar: ${x.stderr}`);
  symlinkSync(path.join(WURZEL, "node_modules"), path.join(ziel, "node_modules"), "junction");
  altOrdner[rev] = ziel;
  return ziel;
}
/** Nur den Verweis lösen — niemals in node_modules hinein löschen. */
function verweisLoesen(ordner) {
  const l = path.join(ordner, "node_modules");
  if (!existsSync(l)) return;
  try { unlinkSync(l); } catch { rmdirSync(l); }
}

beforeAll(async () => {
  T = await mkdtemp(path.join(tmpdir(), "centric-em6-"));
  DATEN = path.join(T, "daten"); ZUSTAND = path.join(T, "zustand"); STATIK = path.join(T, "statik"); SICH = path.join(T, "sich");
  await mkdir(DATEN, { recursive: true }); await mkdir(STATIK); await mkdir(SICH);
  await writeFile(path.join(STATIK, "index.html"), "<!doctype html><title>E-M6</title>");
  process.env.CENTRIC_DATEN = DATEN; process.env.CENTRIC_ZUSTAND = ZUSTAND; process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  M = {
    ablage: await import("../server/lib/ablage.mjs"),
    bestand: await import("../server/lib/bestand.mjs"),
    konten: await import("../server/lib/konten.mjs"),
    codes: await import("../server/lib/codes.mjs"),
    buch: await import("../server/lib/widerrufbuch.mjs"),
    verwalter: await import("../server/lib/verwalter.mjs"),
    sitzung: await import("../server/lib/arbeitssitzung.mjs"),
    feed: await import("../server/lib/feedherkunft.mjs"),
  };
  /* Ausgangsbestand, bei stehendem Server: ein Betrieb mit Leitung und Beschäftigten, dazu die Codes. */
  const store = centric();
  const e = await M.bestand.bestandSchreiben(store, RAUM, { version: 5, mandanten: [{ id: "m1", name: "Haus E-M6",
    einheiten: [{ id: "e1", name: "WB 1" }],
    personen: [person("l1", "leitung"), person("a1", "mitarbeiter"), person("a2", "mitarbeiter"), person("a3", "mitarbeiter"),
      person("a4", "mitarbeiter"), person("a5", "mitarbeiter"), person("a6", "mitarbeiter")] }] }, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
  /* Ein zweiter, noch leerer Betrieb für die Erstanmeldecodes (PR #281). */
  const e2 = await M.bestand.bestandSchreiben(store, RAUM2, { version: 5, mandanten: [{ id: "m2", name: "Neu E-M6",
    einheiten: [{ id: "e1", name: "WB 1" }], personen: [] }] }, { durch: "Pruefung" });
  expect(e2.ok, JSON.stringify(e2)).toBe(true);
  const konto = (rolle, p, extra = {}) => ({ name: "Haus E-M6", bestand: RAUM, rolle, person: p, betrieb: 0, mandantId: "m1",
    demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString(), ...extra });
  for (const [n, rolle, p] of [["L", "leitung", "l1"], ["A", "mitarbeiter", "a1"], ["B", "mitarbeiter", "a2"], ["C", "mitarbeiter", "a3"],
    ["D", "mitarbeiter", "a5"], ["G", "mitarbeiter", "a6"]]) {
    C[n] = neuerCode();
    await M.konten.kontoSchreiben(store, k(C[n]), konto(rolle, p));
  }
  /* R: umgeschlüsselter Code (vor dem Pfeffer abgelegt, beim Anmelden umgeschlüsselt): alter Schlüssel → ersetztDurch. */
  C.R = neuerCode();
  C.Rneu = k(C.R); C.Ralt = M.codes.altHash(C.R);
  await M.konten.kontoSchreiben(store, C.Ralt, { ...konto("mitarbeiter", "a4"), ersetztDurch: C.Rneu });
  await M.konten.kontoSchreiben(store, C.Rneu, { ...konto("mitarbeiter", "a4"), umgeschluesselt: new Date().toISOString() });
  /* E, F: Erstanmeldecodes in der Gestalt aus PR #281 (Leitung ohne Person, Vermerk `erstleitung`) für den leeren
     Betrieb m2, noch offen. */
  for (const n of ["E", "F"]) {
    C[n] = neuerCode();
    await M.konten.kontoSchreiben(store, k(C[n]), { ...konto("leitung", null), name: "Neu E-M6", bestand: RAUM2, mandantId: "m2",
      erstleitung: { mandantId: "m2", angelegt: new Date().toISOString() } });
  }
  /* Verwalterschlüssel über die echte Bibliothek: V1 wird gesperrt, V2 bleibt. */
  for (const n of ["V1", "V2"]) V[n] = (await M.verwalter.verwalterAnlegen(store, { name: `Prüfung ${n}`, durch: "Pruefung" })).schluessel;
}, LIMIT);

afterAll(async () => {
  for (const o of Object.values(altOrdner)) verweisLoesen(o);
  if (T) await rm(T, { recursive: true, force: true });
});

/** Nach dem Rücksprung ungültig: zurückgezogen (B), ersetzt (C), Kette (R), Erstanmeldecode „belegt" (F). */
const ERWARTET_UNGUELTIG = ["B", "C", "R", "F"];

describe("E-M6: Rücksprung der Daten (ältere Sicherung) mit echtem Werkzeug und Serverneustart", () => {
  let C2;

  it("vor der Sicherung gelten alle Codes; Sicherung; danach widerrufen, ersetzen, Verwalter sperren, Erstanmeldung", async () => {
    const s = await starten();
    try {
      for (const n of ["L", "A", "B", "C", "R"]) expect((await anmelden(s, C[n])).status, `${n} vorher`).toBe(200);
      for (const n of ["V1", "V2"]) expect(await verwalterAbruf(s, V[n]), `${n} vorher`).not.toBe(401);
      sichern("vorher");

      const l = await anmelden(s, C.L);
      expect(l.status).toBe(200);
      /* B zurückziehen */
      const sb = await post(s, "/api/zugang-sperren", l.daten.token, { code: C.B });
      expect(sb.status, JSON.stringify(sb.daten)).toBe(200);
      /* C ersetzen: zurückziehen, dann Einladung für dieselbe Person → neuer Code */
      expect((await post(s, "/api/zugang-sperren", l.daten.token, { code: C.C })).status).toBe(200);
      const ein = await post(s, "/api/einladung", l.daten.token, { personId: "a3", bestaetigung: { zugangscode: C.L } });
      expect(ein.status, JSON.stringify(ein.daten)).toBe(200);
      const an = await post(s, "/api/einladung/annehmen", null, { einladung: ein.daten.einladung });
      expect(an.status, JSON.stringify(an.daten)).toBe(200);
      C2 = an.daten.zugangscode;
      expect((await anmelden(s, C2)).status, "Ersatzcode gilt").toBe(200);
      /* R über die Kurzkennung des NEUEN Schlüssels sperren: die ganze Kette gilt als widerrufen */
      expect((await post(s, "/api/zugang-sperren", l.daten.token, { kennung: C.Rneu.slice(-8) })).status).toBe(200);
      for (const n of ["B", "C", "R"]) expect((await anmelden(s, C[n])).status, `${n} nach Widerruf`).toBe(403);
      expect((await kontoLesen(C.Ralt)).gesperrt, "auch das alte Glied der Kette ist in der Ablage gesperrt (für Altbilder)").toBe(true);
    } finally { await s.stoppen(); }

    const store = centric();
    M.buch.widerrufbuchVergessen();
    /* V1 sperren — echte Bibliothek (derselbe Weg wie DELETE /einrichten/verwalter): Ablage, dann Buch. */
    expect(await M.verwalter.verwalterSperren(store, M.codes.altHash(V.V1).slice(0, 8))).toBe(1);
    expect(Object.keys((await buchRoh()).verwalter || {}), "V1 im Buch").toContain(M.codes.altHash(V.V1));

    /* Erstanmeldung wie in PR #281 (dokumentierte Schnittstelle, docs/acc45/ABNAHME-V4-EM6-ROLLBACK-CODES.md §5):
       E „angelegt" — Marke, Person, Code an die Person gebunden; F „belegt" — verbraucht ohne Person. */
    const g = await M.bestand.bestandLesenStreng(store, RAUM2);
    const neu = { ...g.bestand, mandanten: [{ ...g.bestand.mandanten[0], personen: [person(ERSTE, "leitung")] }] };
    expect((await M.bestand.bestandSchreiben(store, RAUM2, neu, { erwarteterStand: g.stand, durch: "Pruefung" })).ok).toBe(true);
    await store.setJSONWennNeu(`erstleitung-marke:${RAUM2}:m2`, { personId: ERSTE, am: new Date().toISOString() });
    const e = await kontoLesen(k(C.E));
    delete e.erstleitung;
    await M.konten.kontoSchreiben(store, k(C.E), { ...e, person: ERSTE,
      erstleitungVerbraucht: { am: new Date().toISOString(), grund: "angelegt", mandantId: "m2", personId: ERSTE } });
    await M.buch.ersteinrichtungAbschliessen(store, RAUM2, "m2", ERSTE);
    const f = await kontoLesen(k(C.F));
    delete f.erstleitung;
    await M.konten.kontoSchreiben(store, k(C.F), { ...f, erstleitungVerbraucht: { am: new Date().toISOString(), grund: "belegt", mandantId: "m2" } });
    await M.buch.widerrufen(store, [k(C.F)], "erstleitung-belegt");
    M.buch.widerrufbuchVergessen();

    /* Neustart: Der Serverstart sammelt ein — E („angelegt") wird NICHT widerrufen, F schon. Die erste Leitung meldet
       sich an (Review E-M6, Befund 1: vorher sperrte genau dieser Start den Code jeder neuen ersten Leitung). */
    const s2 = await starten();
    try {
      expect((await anmelden(s2, C.E)).status, "erste Leitung (angelegt) nach Neustart").toBe(200);
      expect((await anmelden(s2, C.F)).status, "F (belegt) nach Neustart").toBe(403);
    } finally { await s2.stoppen(); }
    const buch = await buchRoh();
    expect(Object.keys(buch.eintraege), "angelegt ist kein Widerruf").not.toContain(k(C.E));
    expect(Object.keys(buch.eintraege), "belegt ist einer").toContain(k(C.F));
    expect((await kontoLesen(k(C.E))).gesperrt, "E in der Ablage nicht gesperrt").toBeFalsy();
    const kennung = M.buch.betriebsKennung(RAUM2, "m2");
    expect(buch.betriebe[kennung], "Ersteinrichtung abgeschlossen, mit erster Leitung").toMatchObject({ person: ERSTE });
    sichern("nachher");
  }, LIMIT);

  it("ältere Sicherung zurückgespielt (Werkzeug, --zustand), Server neu gestartet: Widerrufenes bleibt ungültig", async () => {
    const epocheVorher = JSON.parse(await readFile(path.join(ZUSTAND, "schluessel-epoche.json"), "utf8").catch(() => "{}"));
    const r = wiederherstellen(SICHERUNGEN.vorher, ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/Widerrufbuch: \d+ widerrufene Zugänge.*1 Marken der Ersteinrichtung und 0 Regime-Marken wiederhergestellt/s);
    /* Die Daten der Sicherung kannten die Widerrufe nicht — das Werkzeug hat sie vor dem Tausch gesperrt. */
    for (const s of [k(C.B), k(C.C), C.Ralt, C.Rneu, k(C.F)])
      expect((await kontoLesen(s)).gesperrt, `in der Ablage gesperrt: …${s.slice(-6)}`).toBe(true);
    expect((await kontoLesen(k(C.E))).gesperrt, "E (angelegt) wird nicht gesperrt").toBeFalsy();
    expect((await ablageLesen(`verwalter:${M.codes.altHash(V.V1)}`)).gesperrt, "V1 in der Sicherung gesperrt").toBe(true);
    expect((await ablageLesen(`verwalter:${M.codes.altHash(V.V2)}`)).gesperrt, "V2 nicht").toBeFalsy();
    /* Die Marke „Erstanmeldung festgelegt" (PR #281) kannte die ältere Sicherung nicht — sie ist wieder da. */
    expect(await ablageLesen(`erstleitung-marke:${RAUM2}:m2`), "Marke wiederhergestellt").toMatchObject({ personId: ERSTE });
    const epoche = JSON.parse(await readFile(path.join(ZUSTAND, "schluessel-epoche.json"), "utf8"));
    expect(epoche.grund).toBe("wiederherstellung");
    expect(epoche.epoche).not.toBe(epocheVorher.epoche);
    const buch = await buchRoh();
    expect(buch.wiederherstellungen.length, "Wiederherstellung im Buch vermerkt").toBe(1);
    expect(JSON.stringify(buch), "kein Code im Klartext").not.toContain(C.B);
    expect(JSON.stringify(buch), "kein Verwalterschlüssel im Klartext").not.toContain(V.V1);

    const s = await starten();
    try {
      for (const n of ERWARTET_UNGUELTIG) {
        const a = await anmelden(s, C[n]);
        expect(a.status, `${n} nach Rücksprung: ${JSON.stringify(a.daten)}`).toBe(403);
        expect(a.daten.token).toBeUndefined();
      }
      expect((await anmelden(s, C.A)).status, "gültiger Code gilt weiter").toBe(200);
      expect((await anmelden(s, C.L)).status, "Leitung gilt weiter").toBe(200);
      expect((await anmelden(s, C2)).status, "der Ersatzcode stammt aus der verworfenen Folge").toBe(401);
      expect(await verwalterAbruf(s, V.V1), "gesperrter Verwalterschlüssel").toBe(401);
      expect(await verwalterAbruf(s, V.V2), "gültiger Verwalterschlüssel").not.toBe(401);
    } finally { await s.stoppen(); }
    M.buch.widerrufbuchVergessen();
    expect(await M.buch.ersteinrichtungAbgeschlossen(centric(), RAUM2, "m2")).toBe(true);
  }, LIMIT);

  it("neuere Sicherung („nachher\") zurückgespielt: die erste Leitung (angelegt) meldet sich an, F nicht", async () => {
    const r = wiederherstellen(SICHERUNGEN.nachher, ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    const s = await starten();
    try {
      expect((await anmelden(s, C.E)).status, "erste Leitung").toBe(200);
      for (const n of ERWARTET_UNGUELTIG) expect((await anmelden(s, C[n])).status, n).toBe(403);
      expect(await verwalterAbruf(s, V.V1)).toBe(401);
    } finally { await s.stoppen(); }
    expect(Object.keys((await buchRoh()).eintraege)).not.toContain(k(C.E));
  }, LIMIT);

  it("Bild-Rücksprung: ALTE Fassungen (Merge-Basis, Produktion 274bfa0) auf den neuen Daten — nichts lebt auf", async () => {
    /* Erneut zurückspielen, diesmal OHNE dass die neue Fassung danach startet: Das Werkzeug allein muss genügen. */
    const r = wiederherstellen(SICHERUNGEN.vorher, ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    for (const rev of [ALT.basis, ALT.produktion]) {
      const alt = await altStand(rev);
      const s = await starten({ wurzel: alt });
      try {
        for (const n of ERWARTET_UNGUELTIG) {
          const a = await anmelden(s, C[n]);
          expect(a.status, `${rev.slice(0, 7)}: ${n} → ${JSON.stringify(a.daten)}`).toBe(403);
        }
        expect((await anmelden(s, C.A)).status, `${rev.slice(0, 7)}: gültiger Code`).toBe(200);
        expect((await anmelden(s, C.L)).status, `${rev.slice(0, 7)}: Leitung`).toBe(200);
        expect(await verwalterAbruf(s, V.V1), `${rev.slice(0, 7)}: V1`).toBe(401);
        expect(await verwalterAbruf(s, V.V2), `${rev.slice(0, 7)}: V2`).not.toBe(401);
      } finally { await s.stoppen(); }
    }
  }, LIMIT);

  it("Gegenprobe (rot vorher): altes Werkzeug + alter Server beleben den widerrufenen Code — der neue Server nicht", async () => {
    const alt = await altStand(ALT.basis);
    const r = wiederherstellen(SICHERUNGEN.vorher, [], { wurzel: alt });
    expect(r.code, r.aus).toBe(0);
    expect((await kontoLesen(k(C.B))).gesperrt, "altes Werkzeug: Sperre verloren").toBeFalsy();
    const sa = await starten({ wurzel: alt });
    try {
      expect((await anmelden(sa, C.B)).status, "der Befund aus PR #287: ohne E-M6 lebt B wieder auf").toBe(200);
      expect(await verwalterAbruf(sa, V.V1), "… und der gesperrte Verwalterschlüssel").not.toBe(401);
    } finally { await sa.stoppen(); }
    /* Dieselbe Ablage, jetzt die neue Fassung: Start zieht das Buch nach — ungültig, auch danach im Altbild. */
    const s = await starten();
    try {
      for (const n of ERWARTET_UNGUELTIG) expect((await anmelden(s, C[n])).status, `${n} neue Fassung`).toBe(403);
      expect((await anmelden(s, C.A)).status).toBe(200);
      expect(await verwalterAbruf(s, V.V1)).toBe(401);
    } finally { await s.stoppen(); }
    const sa2 = await starten({ wurzel: alt });
    try {
      for (const n of ERWARTET_UNGUELTIG) expect((await anmelden(sa2, C[n])).status, `${n} Altbild nach Start der neuen Fassung`).toBe(403);
      expect(await verwalterAbruf(sa2, V.V1), "V1 Altbild nach Start der neuen Fassung").toBe(401);
    } finally { await sa2.stoppen(); }
  }, LIMIT);

  /* Raumlöschung (raumloeschung.mjs) nimmt die Marke „Erstanmeldung festgelegt“ aus der Ablage mit; der Abschluss im
     Widerrufbuch bleibt (nur fortgeschrieben, nie gekürzt). Eine ältere Sicherung mit dem Raum, mit dem ECHTEN Werkzeug
     (--zustand) zurückgespielt: Die Marke wird aus dem Buch nachgezogen, die Ersteinrichtung öffnet sich nicht wieder,
     und kein Code des gelöschten Raums gilt. */
  it("Raum gelöscht, ältere Sicherung mit dem Raum zurück (Werkzeug, --zustand): Marke aus dem Buch, keine neue Ersteinrichtung", async () => {
    let r = wiederherstellen(SICHERUNGEN.nachher, ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    const store = centric();
    M.buch.widerrufbuchVergessen();
    const L = await import("../server/lib/raumloeschung.mjs");
    const erg = await L.raumLoeschen(store, M.ablage.getStore({ name: "centric-sitzungen", consistency: "strong" }), RAUM2);
    expect(erg.fehler, JSON.stringify(erg.fehler)).toEqual([]);
    expect(erg.vollstaendig).toBe(true);
    expect(existsSync(ablageDatei(`erstleitung-marke:${RAUM2}:m2`)), "Marke mit dem Raum gelöscht").toBe(false);
    expect(existsSync(kontoDatei(k(C.E))), "Code E mit dem Raum gelöscht").toBe(false);
    const buch = await buchRoh();
    expect(buch.betriebe[M.buch.betriebsKennung(RAUM2, "m2")], "Abschluss bleibt im Buch").toMatchObject({ person: ERSTE });
    for (const n of ["E", "F"]) expect(Object.keys(buch.eintraege), `${n} widerrufen (raum-geloescht)`).toContain(k(C[n]));
    M.buch.widerrufbuchVergessen();

    /* „vorher": RAUM2 mit den noch OFFENEN Erstanmeldecodes E und F, ohne Marke. */
    r = wiederherstellen(SICHERUNGEN.vorher, ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/1 Marken der Ersteinrichtung und \d+ Regime-Marken wiederhergestellt/);
    expect(await ablageLesen(`erstleitung-marke:${RAUM2}:m2`), "Marke aus dem Buch nachgezogen").toMatchObject({ personId: ERSTE });
    for (const n of ["E", "F"]) expect((await kontoLesen(k(C[n]))).gesperrt, `${n} in der Ablage gesperrt`).toBe(true);
    const s = await starten();
    try {
      for (const n of ["E", "F"]) expect((await anmelden(s, C[n])).status, `${n}: Erstanmeldecode des gelöschten Raums`).toBe(403);
      expect((await anmelden(s, C.A)).status, "fremder Raum unberührt").toBe(200);
    } finally { await s.stoppen(); }
    M.buch.widerrufbuchVergessen();
    expect(await M.buch.ersteinrichtungAbgeschlossen(centric(), RAUM2, "m2")).toBe(true);
  }, LIMIT);
});

describe("E-M6, Befund 3: Der Widerruf wirkt zuerst — auch wenn das Widerrufbuch nicht schreibbar ist", () => {
  /* Als root lässt sich das Buch nicht schreibschützen — dann ohne Aussage übersprungen. */
  it.skipIf(typeof process.getuid === "function" && process.getuid() === 0)("Buch nicht schreibbar: Sperre und Sitzungsende wirken, 503 „Widerruf wirksam, Widerrufbuch nicht beschrieben\"; Neustart holt nach", async () => {
    const s = await starten();
    try {
      const l = await anmelden(s, C.L);
      const d = await anmelden(s, C.D);
      expect(d.status).toBe(200);
      expect(await bestandAbruf(s, d.daten.token), "Sitzung von D läuft").toBe(200);
      /* Buch lesbar, aber nicht schreibbar: Datei schreibgeschützt (Windows: Umbenennen auf sie scheitert), Ordner ohne
         Schreibrecht (Unix: keine Zwischendatei). */
      await chmod(buchDatei(), 0o444);
      await chmod(ZUSTAND, 0o500);
      const sp = await post(s, "/api/zugang-sperren", l.daten.token, { code: C.D });
      expect(sp.status, JSON.stringify(sp.daten)).toBe(503);
      expect(sp.daten.fehler).toBe("Widerruf wirksam, Widerrufbuch nicht beschrieben.");
      expect(sp.daten.widerrufWirksam).toBe(true);
      expect(sp.daten.gesperrt).toBe(1);
      /* Wirksam: Anmeldung abgewiesen, laufende Sitzung beendet, Ablage gesperrt. */
      expect((await anmelden(s, C.D)).status, "D sofort abgewiesen").toBe(403);
      expect(await bestandAbruf(s, d.daten.token), "Sitzung von D beendet").toBe(401);
      expect((await kontoLesen(k(C.D))).gesperrt).toBe(true);
    } finally {
      await chmod(ZUSTAND, 0o700).catch(() => {});
      await chmod(buchDatei(), 0o600).catch(() => {});
      await s.stoppen();
    }
    expect(Object.keys((await buchRoh()).eintraege), "noch nicht im Buch").not.toContain(k(C.D));
    /* Reparaturweg: Der Neustart sammelt den Widerruf aus der Ablage ein. */
    const s2 = await starten();
    try { expect((await anmelden(s2, C.D)).status).toBe(403); } finally { await s2.stoppen(); }
    expect(Object.keys((await buchRoh()).eintraege), "nachgeholt").toContain(k(C.D));
  }, LIMIT);

  it("harter Abbruch zwischen Ablage und Buch (vorgeladener Kill): der Code bleibt ungültig — Wiederherstellung, Altbild, Neustart", async () => {
    sichern("vor-abbruch");
    const kill = pathToFileURL(path.join(WURZEL, "pruefungen", "hilfen", "em6-abbruch.mjs")).href;
    const muster = `centric/konto%3A${k(C.G).replaceAll(":", "%3A")}\\.json$`;
    const s = await starten({ env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import ${kill}`.trim(), EM6_ABBRUCH_MUSTER: muster } });
    /* G hier nicht anmelden: Jedes Schreiben an G zählte als Treffer. */
    const l = await anmelden(s, C.L);
    const antwort = await post(s, "/api/zugang-sperren", l.daten.token, { code: C.G }).catch(() => null);
    await Promise.race([s.beendet, new Promise((r) => setTimeout(r, 20000))]);
    expect(s.prozess.exitCode !== null || s.prozess.signalCode !== null, `Server beendet (Antwort: ${JSON.stringify(antwort)})\n${s.log()}`).toBe(true);
    expect(s.log()).toMatch(/\[em6-abbruch\] harter Abbruch/);
    /* Zwischen den Schreibvorgängen: in der Ablage gesperrt, im Buch noch nicht. */
    expect((await kontoLesen(k(C.G))).gesperrt, "Ablage gesperrt").toBe(true);
    expect(Object.keys((await buchRoh()).eintraege), "Buch noch nicht").not.toContain(k(C.G));
    /* Ein Altbild auf diesen Daten nimmt ihn nicht an (es kennt `gesperrt`). */
    const sa = await starten({ wurzel: await altStand(ALT.produktion) });
    try { expect((await anmelden(sa, C.G)).status, "Altbild").toBe(403); } finally { await sa.stoppen(); }
    /* Und eine ältere Sicherung (G dort offen) mit dem Werkzeug: Es sammelt G aus der laufenden Ablage ein und sperrt ihn. */
    const r = wiederherstellen(SICHERUNGEN["vor-abbruch"], ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    expect(Object.keys((await buchRoh()).eintraege), "eingesammelt").toContain(k(C.G));
    expect((await kontoLesen(k(C.G))).gesperrt).toBe(true);
    const s2 = await starten();
    try { expect((await anmelden(s2, C.G)).status, "neue Fassung nach Rücksprung").toBe(403); } finally { await s2.stoppen(); }
  }, LIMIT);
});

describe("E-M6, Befund 4: Sitzungen und Kalenderfeeds fragen das Widerrufbuch (fail-closed)", () => {
  it("Code-Sitzung und Feed aus einem Code: im Buch → ungültig, auch wenn die Ablage ihn ungesperrt zeigt; Buch unklar → 503", async () => {
    const store = centric();
    M.buch.widerrufbuchVergessen();
    /* B steht im Buch; in der Ablage wird er (wie nach einer Verzeichniskopie ohne Werkzeug) wieder ungesperrt. */
    const kb = await kontoLesen(k(C.B));
    await M.konten.kontoSchreiben(store, k(C.B), { ...kb, gesperrt: false });
    const sitzung = (code) => ({ konto: k(code), bestand: RAUM, rolle: "mitarbeiter", person: null, betrieb: 0 });
    expect(await M.sitzung.arbeitssitzungPruefen(store, sitzung(C.B))).toEqual({ ok: false, grund: "zugang-gesperrt" });
    expect((await M.sitzung.arbeitssitzungPruefen(store, sitzung(C.A))).ok, "A gilt").toBe(true);
    const feed = (code) => ({ bestand: RAUM, herkunft: { art: "code", konto: k(code) } });
    expect(await M.feed.feedHerkunftGilt(store, feed(C.B))).toEqual({ gilt: false, grund: "code-widerrufen" });
    expect(await M.feed.feedHerkunftGilt(store, feed(C.A))).toEqual({ gilt: true });
    /* Kette: Der Feed trägt den ALTEN Schlüssel von R. */
    expect((await M.feed.feedHerkunftGilt(store, { bestand: RAUM, herkunft: { art: "code", konto: C.Ralt } })).gilt).toBe(false);
    /* Buch manipuliert: weder Sitzung noch Feed gelten — vorübergehend (BESTAND_UNLESBAR → 503), nie „gültig". */
    const echt = await readFile(buchDatei(), "utf8");
    try {
      const o = JSON.parse(echt); o.eintraege = {}; await writeFile(buchDatei(), JSON.stringify(o));
      M.buch.widerrufbuchVergessen();
      await expect(M.sitzung.arbeitssitzungPruefen(store, sitzung(C.A))).rejects.toMatchObject({ code: "BESTAND_UNLESBAR" });
      await expect(M.feed.feedHerkunftGilt(store, feed(C.A))).rejects.toMatchObject({ code: "BESTAND_UNLESBAR" });
      expect(M.buch.widerrufbuchLage().stufe, "/gesund warnt").toBe("warnung");
      /* Verwalterschlüssel: ein benannter gilt nicht, solange das Buch unklar ist. */
      expect(await M.verwalter.verwalterPruefen(store, V.V2)).toBe(null);
    } finally {
      await writeFile(buchDatei(), echt);
      await M.konten.kontoSchreiben(store, k(C.B), kb);
      M.buch.widerrufbuchVergessen();
    }
    expect(await M.verwalter.verwalterPruefen(store, V.V2)).toMatchObject({ art: "konto" });
  }, LIMIT);
});

describe("E-M6: fail-closed", () => {
  const sicherungVorher = () => SICHERUNGEN.vorher;

  it("manipuliertes Widerrufbuch: kein Code gilt (503), das Werkzeug fasst nichts an", async () => {
    const echt = await readFile(buchDatei(), "utf8");
    const o = JSON.parse(echt);
    delete o.eintraege[k(C.B)];     // Eintrag entfernt, Siegel unverändert
    await writeFile(buchDatei(), JSON.stringify(o));
    /* Ablage wieder ungesperrt (wie nach einer Verzeichniskopie), damit allein das Buch entscheidet. */
    const kb = await kontoLesen(k(C.B));
    await M.konten.kontoSchreiben(centric(), k(C.B), { ...kb, gesperrt: false });
    const s = await starten();
    try {
      expect(s.log()).toMatch(/WARNUNG Widerrufbuch: .*kein Zugangscode gilt/s);
      expect((await anmelden(s, C.B)).status, "B").toBe(503);
      expect((await anmelden(s, C.A)).status, "auch ein gültiger Code gilt nicht, solange das Buch unklar ist").toBe(503);
      expect(await verwalterAbruf(s, V.V2), "auch kein benannter Verwalterschlüssel").toBe(401);
    } finally { await s.stoppen(); }
    const vorher = await readdir(DATEN);
    const r = wiederherstellen(sicherungVorher(), ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).not.toBe(0);
    expect(r.aus).toMatch(/Widerrufbuch/);
    expect(await readdir(DATEN), "nichts getauscht").toEqual(vorher);
    await writeFile(buchDatei(), echt);
  }, LIMIT);

  it("fehlendes Widerrufbuch bei vorhandenem Anker: kein Code gilt; Werkzeug lehnt ab", async () => {
    const echt = await readFile(buchDatei(), "utf8");
    await rm(buchDatei());
    const s = await starten();
    try {
      expect((await anmelden(s, C.A)).status).toBe(503);
      expect((await anmelden(s, C.B)).status).toBe(503);
    } finally { await s.stoppen(); }
    expect(existsSync(buchDatei()), "kein stilles Neuanlegen").toBe(false);
    const r = wiederherstellen(sicherungVorher(), ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).not.toBe(0);
    expect(r.aus).toMatch(/Widerrufbuch fehlt/);
    await writeFile(buchDatei(), echt);
    const s2 = await starten();
    try {
      expect((await anmelden(s2, C.A)).status, "mit dem echten Buch wieder").toBe(200);
      expect((await anmelden(s2, C.B)).status).toBe(403);
    } finally { await s2.stoppen(); }
  }, LIMIT);

  it("fremdes Widerrufbuch (andere Kennung) und anderer Pfeffer: fail-closed", async () => {
    const echt = await readFile(buchDatei(), "utf8");
    /* Ein gültig gesiegeltes, aber fremdes Buch (andere Umgebung) */
    await M.buch.buchSchreiben(ZUSTAND, M.buch.buchNeu());
    let s = await starten();
    try { expect((await anmelden(s, C.A)).status).toBe(503); } finally { await s.stoppen(); }
    await writeFile(buchDatei(), echt);
    /* Anderer Pfeffer: Siegel passt nicht → kein Code gilt (und ohnehin findet kein Code seinen Datensatz). */
    s = await starten({ pfeffer: "ein-ganz-anderer-pfeffer-9876543210" });
    try { expect(s.log()).toMatch(/WARNUNG Widerrufbuch/); } finally { await s.stoppen(); }
    /* Sicherung aus einer Umgebung mit anderem Pfeffer: das Werkzeug lehnt ab, nichts angefasst. */
    const r = wiederherstellen(sicherungVorher(), ["--zustand", ZUSTAND], { pfeffer: "ein-ganz-anderer-pfeffer-9876543210" });
    expect(r.code).not.toBe(0);
    expect(r.aus).toMatch(/PFEFFER/);
  }, LIMIT);

  it("Werkzeug verweigert eine belegte Ablage (Prozesssperre .prozess eines lebenden Prozesses), auch ohne Serverprüfung", async () => {
    const halter = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
    const sperre = path.join(DATEN, ".prozess");
    try {
      await writeFile(sperre, JSON.stringify({ pid: halter.pid, start: Date.now(), rechner: hostname() }));
      const vorher = await readdir(path.join(DATEN, "centric"));
      const r = wiederherstellen(sicherungVorher(), ["--zustand", ZUSTAND]);
      expect(r.code, r.aus).not.toBe(0);
      expect(r.aus).toMatch(/Prozesssperre/);
      expect(await readdir(path.join(DATEN, "centric")), "nichts angefasst").toEqual(vorher);
      const r2 = werkzeug(["widerrufbuch-neu", "--zustand", path.join(T, "zustand-leer"), "--daten", DATEN, "--ohne-serverpruefung"]);
      expect(r2.code, r2.aus).not.toBe(0);
    } finally { halter.kill("SIGKILL"); await rm(sperre, { force: true }); }
  }, LIMIT);

  it("widerrufbuch-neu nur bewusst und nur ohne Buch; danach gilt Gültiges, Gesperrtes bleibt gesperrt", async () => {
    const r1 = werkzeug(["widerrufbuch-neu", "--zustand", ZUSTAND, "--daten", DATEN, "--ohne-serverpruefung"]);
    expect(r1.code, "ein vorhandenes Buch wird nie ersetzt").not.toBe(0);
    await cp(buchDatei(), path.join(T, "buch-kopie.json"));
    await rm(buchDatei());
    const r2 = werkzeug(["widerrufbuch-neu", "--zustand", ZUSTAND, "--daten", DATEN, "--ohne-serverpruefung"]);
    expect(r2.code, r2.aus).toBe(0);
    const s = await starten();
    try {
      expect((await anmelden(s, C.A)).status).toBe(200);
      for (const n of ERWARTET_UNGUELTIG) expect((await anmelden(s, C[n])).status, n).toBe(403);
      expect(await verwalterAbruf(s, V.V1)).toBe(401);
    } finally { await s.stoppen(); }
  }, LIMIT);
});

/* ---------------------------------------------------------------------------
   PR #281 mit der ECHTEN erstleitung.mjs. TODO-Wächter: Liegt sie auf diesem Stand nicht (vor dem Merge von #281),
   wird ausdrücklich übersprungen. Nachgewiesen gegen den Merge mit #281 (Nachweisdokument, Abschnitt 5).
   --------------------------------------------------------------------------- */
if (!ERSTLEITUNG_DA)
  console.warn("E-M6 × PR #281: server/lib/erstleitung.mjs fehlt auf diesem Stand — Prüfung mit der echten erstleitung.mjs "
    + "übersprungen (TODO: läuft automatisch nach dem Merge von #281).");
describe.skipIf(!ERSTLEITUNG_DA)("E-M6 × PR #281: echte erstleitung.mjs (TODO-Wächter: übersprungen, solange #281 fehlt)", () => {
  const RAUM3 = "em6-281";
  it("„angelegt\" bleibt der Code der ersten Leitung, „belegt\" ist widerrufen; nach Rücksprung keine zweite erste Leitung", async () => {
    const EL = await import("../server/lib/erstleitung.mjs");
    const store = centric();
    M.buch.widerrufbuchVergessen();
    const e = await M.bestand.bestandSchreiben(store, RAUM3, { version: 5, mandanten: [{ id: "m3", name: "Neu 281",
      einheiten: [{ id: "e1", name: "WB 1" }], personen: [] }] }, { durch: "Pruefung" });
    expect(e.ok).toBe(true);
    const X = {};
    for (const n of ["E3", "E4"]) {
      X[n] = neuerCode();
      await M.konten.kontoSchreiben(store, k(X[n]), { name: "Neu 281", bestand: RAUM3, rolle: "leitung", person: null, betrieb: 0,
        mandantId: "m3", demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString(), erstleitung: EL.erstleitungVermerk("m3") });
    }
    sichern("v281");
    const r3 = await EL.erstleitungEinloesen(store, { schluessel: k(X.E3) });
    expect(r3, JSON.stringify(r3)).toMatchObject({ ok: true, angelegt: true });
    const r4 = await EL.erstleitungEinloesen(store, { schluessel: k(X.E4) });
    expect(r4).toMatchObject({ ok: false, grund: "belegt" });
    /* Kopplung: Abschluss und Widerruf stehen SOFORT im Buch — nicht erst nach dem nächsten Start (§6 der E-M6-Doku). */
    const sofort = await buchRoh();
    expect(sofort.betriebe[M.buch.betriebsKennung(RAUM3, "m3")], "Abschluss im Augenblick des Einlösens").toMatchObject({ person: r3.personId });
    expect(Object.keys(sofort.eintraege), "belegt im Augenblick des Einlösens widerrufen").toContain(k(X.E4));
    expect(Object.keys(sofort.eintraege), "angelegt ist kein Widerruf").not.toContain(k(X.E3));
    M.buch.widerrufbuchVergessen();
    const s = await starten();
    try {
      expect((await anmelden(s, X.E3)).status, "erste Leitung nach Neustart (Befund 1)").toBe(200);
      expect((await anmelden(s, X.E4)).status, "belegt").not.toBe(200);
    } finally { await s.stoppen(); }
    const buch = await buchRoh();
    expect(Object.keys(buch.eintraege)).not.toContain(k(X.E3));
    expect(Object.keys(buch.eintraege)).toContain(k(X.E4));
    expect(buch.betriebe[M.buch.betriebsKennung(RAUM3, "m3")]).toMatchObject({ person: r3.personId });
    sichern("n281");
    /* Ältere Sicherung: Betrieb leer, beide Codes offen, keine Marke — das Werkzeug legt die Marke wieder an. */
    const w = wiederherstellen(SICHERUNGEN.v281, ["--zustand", ZUSTAND]);
    expect(w.code, w.aus).toBe(0);
    expect(await EL.erstleitungMarkeLesen(store, RAUM3, "m3")).toMatchObject({ personId: r3.personId });
    M.buch.widerrufbuchVergessen();
    const nochmal = await EL.erstleitungEinloesen(store, { schluessel: k(X.E3) });
    expect(nochmal.ok, "keine zweite erste Leitung").toBe(false);
    expect((await M.bestand.bestandLesenStreng(store, RAUM3)).bestand.mandanten[0].personen).toEqual([]);
    /* Dieser Einlöseversuch hat E3 nach #281 als „belegt" verbraucht — ein Widerruf, der nach E-M6 NIE wieder
       zurückgeht: Auch die neuere Sicherung (in der E3 noch an die erste Leitung gebunden ist) belebt ihn nicht
       (Restrisiko R-9: der Betreiber stellt der ersten Leitung einen neuen personengebundenen Code aus). */
    const w2 = wiederherstellen(SICHERUNGEN.n281, ["--zustand", ZUSTAND]);
    expect(w2.code, w2.aus).toBe(0);
    expect(Object.keys((await buchRoh()).eintraege), "belegt eingesammelt").toContain(k(X.E3));
    const s2 = await starten();
    try { expect((await anmelden(s2, X.E3)).status, "belegt bleibt ungültig").toBe(403); } finally { await s2.stoppen(); }
  }, LIMIT);

  /* Review C1: Ein Betrieb aus der Zeit vor #281 (ohne Regime-Marke) bekommt seinen ersten Erstanmeldecode — damit die
     Regime-Marke. Eine ÄLTERE Sicherung kennt sie nicht. Ohne Buch fiele der Betrieb auf die alten Regeln zurück, und ein
     vorhandener Leitungscode ohne Person bekäme wieder Leitungsrechte. */
  it("C1: Regime im Buch — ältere Sicherung ohne Regime-Marke (Werkzeug) und Verzeichniskopie (Serverstart): der Betrieb bleibt streng", async () => {
    const EL = await import("../server/lib/erstleitung.mjs");
    const store = centric();
    M.buch.widerrufbuchVergessen();
    const R = "em6-c1";
    const regimeDatei = ablageDatei(`erstleitung-regime:${R}:m4`);
    expect((await M.bestand.bestandSchreiben(store, R, { version: 5, mandanten: [{ id: "m4", name: "Alt C1",
      einheiten: [{ id: "e1", name: "WB 1" }], personen: [] }] }, { durch: "Pruefung" })).ok).toBe(true);
    /* Ein gewöhnlicher Leitungscode ohne Person aus der Zeit vor #281 (Bestandsbetrieb). */
    const LO = neuerCode();
    await M.konten.kontoSchreiben(store, k(LO), { name: "Alt C1", bestand: R, rolle: "leitung", person: null, betrieb: 0,
      mandantId: "m4", demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString() });
    sichern("v-c1");
    let s = await starten();
    try { expect((await anmelden(s, LO)).status, "Gegenprobe: Bestandsbetrieb ohne Regime, alte Regeln").toBe(200); }
    finally { await s.stoppen(); }
    /* Erster Erstanmeldecode → Regime-Marke (derselbe Aufruf wie /api/zugaenge und /einrichten), sofort im Buch. */
    M.buch.widerrufbuchVergessen();
    await EL.erstleitungRegimeVermerken(store, R, "m4", { durch: "Erstanmeldecode" });
    expect(Object.keys((await buchRoh()).regime || {}), "Regime im Buch").toContain(M.buch.betriebsKennung(R, "m4"));
    expect(existsSync(regimeDatei)).toBe(true);
    s = await starten();
    try { expect((await anmelden(s, LO)).status, "streng: Leitungscode ohne Person").toBe(403); } finally { await s.stoppen(); }

    /* Ältere Sicherung (ohne Regime-Marke) mit dem echten Werkzeug: die Marke ist wieder da, der Betrieb bleibt streng. */
    const w = wiederherstellen(SICHERUNGEN["v-c1"], ["--zustand", ZUSTAND]);
    expect(w.code, w.aus).toBe(0);
    expect(w.aus).toMatch(/und [1-9]\d* Regime-Marken wiederhergestellt/);
    expect(existsSync(regimeDatei), "Regime-Marke nach dem Rücksprung wieder in der Ablage").toBe(true);
    s = await starten();
    try { expect((await anmelden(s, LO)).status, "nach Rücksprung (Werkzeug) weiter streng").toBe(403); } finally { await s.stoppen(); }

    /* Rücksprung per Verzeichniskopie OHNE Werkzeug (Marke fehlt): Die Entscheidungsstelle fragt das Buch — streng; der
       nächste Serverstart legt die Marke wieder an. */
    await rm(regimeDatei);
    M.buch.widerrufbuchVergessen();
    expect(await EL.erstleitungStreng(store, R, "m4"), "Buch statt Marke").toBe(true);
    expect(await EL.erstleitungStreng(store, RAUM, "m1"), "Gegenprobe: Bestandsbetrieb ohne Regime bleibt bei den alten Regeln").toBe(false);
    s = await starten();
    try { expect((await anmelden(s, LO)).status, "nach Verzeichniskopie weiter streng").toBe(403); } finally { await s.stoppen(); }
    expect(existsSync(regimeDatei), "Serverstart hat die Regime-Marke nachgezogen").toBe(true);
    /* Buch unklar (Regime entfernt, Siegel bricht): streng (fail-closed). */
    const echt = await readFile(buchDatei(), "utf8");
    try {
      const o = JSON.parse(echt); o.regime = {}; await writeFile(buchDatei(), JSON.stringify(o));
      await rm(regimeDatei);
      M.buch.widerrufbuchVergessen();
      expect(await EL.erstleitungStreng(store, R, "m4"), "Regime aus dem Buch entfernt").toBe(true);
      expect(await EL.erstleitungStreng(store, RAUM, "m1"), "auch ein Bestandsbetrieb: streng, solange das Buch unklar ist").toBe(true);
    } finally { await writeFile(buchDatei(), echt); M.buch.widerrufbuchVergessen(); }
    expect(await EL.erstleitungStreng(store, R, "m4")).toBe(true);
  }, LIMIT);

  /* Review C2: Eine Sicherung von VOR dem ersten Erstanmeldecode kennt keinen Code dieses Betriebs. Bis hierher zog nur
     ein Erstanmeldecode die Marke nach — ein danach ausgestellter Code legte eine zweite erste Leitung an. */
  it("C2: Sicherung von vor dem ersten Erstanmeldecode: Marke aus dem Buch über den Bestand, keine zweite erste Leitung", async () => {
    const EL = await import("../server/lib/erstleitung.mjs");
    const store = centric();
    M.buch.widerrufbuchVergessen();
    const R = "em6-c2";
    const markeDatei = ablageDatei(`erstleitung-marke:${R}:m5`);
    expect((await M.bestand.bestandSchreiben(store, R, { version: 5, mandanten: [{ id: "m5", name: "Neu C2",
      einheiten: [{ id: "e1", name: "WB 1" }], personen: [] }] }, { durch: "Pruefung" })).ok).toBe(true);
    sichern("v-c2");
    const erstcode = async () => {
      const c = neuerCode();
      await M.konten.kontoSchreiben(store, k(c), { name: "Neu C2", bestand: R, rolle: "leitung", person: null, betrieb: 0,
        mandantId: "m5", demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString(), erstleitung: EL.erstleitungVermerk("m5") });
      return c;
    };
    const X1 = await erstcode();
    const r1 = await EL.erstleitungEinloesen(store, { schluessel: k(X1) });
    expect(r1, JSON.stringify(r1)).toMatchObject({ ok: true, angelegt: true });
    expect((await buchRoh()).betriebe[M.buch.betriebsKennung(R, "m5")], "Abschluss sofort im Buch").toMatchObject({ person: r1.personId });

    const w = wiederherstellen(SICHERUNGEN["v-c2"], ["--zustand", ZUSTAND]);
    expect(w.code, w.aus).toBe(0);
    expect(existsSync(kontoDatei(k(X1))), "die Sicherung kennt den Code nicht").toBe(false);
    expect(await ablageLesen(`erstleitung-marke:${R}:m5`), "Marke über den Bestand nachgezogen").toMatchObject({ personId: r1.personId });
    M.buch.widerrufbuchVergessen();
    const leer = (await M.bestand.bestandLesenStreng(store, R)).bestand.mandanten[0];
    expect(leer.personen).toEqual([]);
    expect(await EL.erstleitungEingerichtet(store, R, leer), "kein neuer Erstanmeldecode").toBe(true);
    /* Auch ein trotzdem ausgestellter Code legt keine zweite erste Leitung an — mit Marke … */
    const X2 = await erstcode();
    expect(await EL.erstleitungEinloesen(store, { schluessel: k(X2) })).toMatchObject({ ok: false, grund: "belegt" });
    expect(Object.keys((await buchRoh()).eintraege), "belegt sofort widerrufen").toContain(k(X2));
    /* … und ohne Marke (Verzeichniskopie ohne Werkzeug, vor dem nächsten Start): das Buch entscheidet. */
    await rm(markeDatei);
    M.buch.widerrufbuchVergessen();
    expect(await EL.erstleitungEingerichtet(store, R, leer), "ohne Marke: Abschluss im Buch").toBe(true);
    const X3 = await erstcode();
    expect(await EL.erstleitungEinloesen(store, { schluessel: k(X3) })).toMatchObject({ ok: false, grund: "belegt" });
    expect((await M.bestand.bestandLesenStreng(store, R)).bestand.mandanten[0].personen, "keine zweite erste Leitung").toEqual([]);
    expect(await ablageLesen(`erstleitung-marke:${R}:m5`), "Marke aus dem Buch wieder angelegt").toMatchObject({ personId: r1.personId });
    const s = await starten();
    try { for (const c of [X2, X3]) expect((await anmelden(s, c)).status, "belegt").toBe(403); } finally { await s.stoppen(); }
  }, LIMIT);

  /* Kopplung, Abbruchfestigkeit: Person und Bindung sind geschrieben, das Buch noch nicht — harter Prozessabbruch
     (vorgeladener Kill nach dem zweiten Schreiben am Zugang: 1 Vormerken, 2 Binden). Kein halber Zustand: die
     Erstanmeldung ist vollständig, und der Neustart trägt den Abschluss ins Buch nach. */
  it("harter Abbruch zwischen Bindung und Buch: vollständig in der Ablage, Neustart trägt den Abschluss nach", async () => {
    const EL = await import("../server/lib/erstleitung.mjs");
    const store = centric();
    M.buch.widerrufbuchVergessen();
    const R = "em6-kill";
    expect((await M.bestand.bestandSchreiben(store, R, { version: 5, mandanten: [{ id: "m6", name: "Neu Kill",
      einheiten: [{ id: "e1", name: "WB 1" }], personen: [] }] }, { durch: "Pruefung" })).ok).toBe(true);
    const K = neuerCode();
    await M.konten.kontoSchreiben(store, k(K), { name: "Neu Kill", bestand: R, rolle: "leitung", person: null, betrieb: 0,
      mandantId: "m6", demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString(), erstleitung: EL.erstleitungVermerk("m6") });
    const kennung = M.buch.betriebsKennung(R, "m6");
    const kill = pathToFileURL(path.join(WURZEL, "pruefungen", "hilfen", "em6-abbruch.mjs")).href;
    const muster = `centric/konto%3A${k(K).replaceAll(":", "%3A")}\\.json$`;
    const s = await starten({ env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import ${kill}`.trim(),
      EM6_ABBRUCH_MUSTER: muster, EM6_ABBRUCH_NR: "2" } });
    const antwort = await anmelden(s, K).catch(() => null);
    await Promise.race([s.beendet, new Promise((r) => setTimeout(r, 20000))]);
    expect(s.prozess.exitCode !== null || s.prozess.signalCode !== null, `Server beendet (Antwort: ${JSON.stringify(antwort)})\n${s.log()}`).toBe(true);
    expect(s.log()).toMatch(/\[em6-abbruch\] harter Abbruch nach Treffer 2/);
    const z = await kontoLesen(k(K));
    expect(z.erstleitungVerbraucht, "gebunden").toMatchObject({ grund: "angelegt" });
    const personen = (await M.bestand.bestandLesenStreng(store, R)).bestand.mandanten[0].personen;
    expect(personen.map((x) => x.id), "genau die eine erste Leitung").toEqual([z.person]);
    expect((await buchRoh()).betriebe[kennung], "Buch noch nicht beschrieben").toBeUndefined();
    const s2 = await starten();
    try {
      const a = await anmelden(s2, K);
      expect(a.status, JSON.stringify(a.daten)).toBe(200);
    } finally { await s2.stoppen(); }
    expect((await buchRoh()).betriebe[kennung], "Neustart hat den Abschluss eingesammelt").toMatchObject({ person: z.person });
    expect((await M.bestand.bestandLesenStreng(store, R)).bestand.mandanten[0].personen.length, "keine zweite Person").toBe(1);
  }, LIMIT);
});

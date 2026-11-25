/* ==========================================================================
   K4-P4: VORWÄRTS-REPARATUR-PROBE (L3: Migration/Backup/Restore) — nur synthetische Daten

   Warum: R0 ist kein Rollback. Geht nach dem Wechsel etwas schief, ist der Weg nach vorn ein Kandidat B auf DEMSELBEN
   Bestand, den Kandidat A schon beschrieben hat — oder ein Datenrücksprung (K7) mit neuer Schlüsselepoche. Beides wird
   hier gegen ECHTE Serverprozesse, das echte Werkzeug (werkzeug/ablage-sicherung.mjs), den echten Abgleich
   (deploy/deploy-abgleich.mjs) und die echte Migrationsprobe (deploy/migrationsprobe-lokal.mjs) geprüft.

     0. Ablage aus K4-P3 (werkzeug/synthetischer-altbestand.mjs, 274bfa0-Code, ohne Zahl-Kennung), Sicherung S0.
     1. Kandidat A (dieser Stand) startet auf ihr: Leitung meldet sich mit Zugangscode an, sperrt einen Code (Widerruf),
        legt einen Sicherungsschlüssel an, schreibt den Plan (PUT /api/bestand 200). Stopp. Zweiter Faktor für ein
        Konto mit der Bibliothek von A (pruefungen/hilfen/be2-faktor.mjs, bei stehendem Server). Sicherung S1 (wie
        deploy.sh: nach dem Anhalten).
     2. Kandidat B (Kopie dieses Stands mit simuliertem Fix: zusätzliche Logzeile) auf denselben Daten und demselben
        Zustandsverzeichnis: Abgleich S1 gegen die Daten Exit 0 ohne Fehler; Widerruf, Faktor, Schlüssel und Plan
        gelten unverändert; beide Bücher bleiben (gleiche Einträge); Migrationsprobe Exit 0.
     3. Datenrücksprung K7: Stopp, S0 mit dem Werkzeug von B zurück (--ersetzen --zustand): „Schlüsselepoche erneuert“,
        neue Epoche; B startet: der in Schritt 1 angelegte Sicherungsschlüssel gilt nicht mehr, der gesperrte Code
        bleibt 403, das Faktor-Konto kommt nicht ohne Faktor hinein (403), der Plan steht auf S0 (gewollter Verlust
        der Daten nach S0), die Bücher bleiben; Migrationsprobe Exit 0.

   Grenzen: keine Bilder/Digests, kein Docker, kein restic (K10), kein Altbild-Start auf veränderten Daten (K6: das
   prüfen em6-rollback-codes, be1-konto-widerrufbuch, be2-a1-zweiter-faktor). Nur 127.0.0.1, nur Wegwerfordner.
   Aufruf: npx vitest run pruefungen/k4-p4-vorwaerts-reparatur.test.js --maxWorkers=1 --testTimeout=300000
   ========================================================================== */
// zeit-ok: echte Serverprozesse laufen auf der echten Uhr (Sitzungsfrische, Codes aus der App); Zeitstempel nur als Daten.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { existsSync, rmdirSync, symlinkSync, unlinkSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes, createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { erzeugen, planBauen, SYNTH_PFEFFER, SYNTH_PASSWORT } from "../werkzeug/synthetischer-altbestand.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 300000;
const SAAT = 4747;
const GROESSE = { groesse: 20, tage: 7 };   // klein: ein schwacher Rechner, ein Lauf in der CI
const PLAN = planBauen({ saat: SAAT, ...GROESSE, zahlkennung: false });
const CODE = Object.fromEntries(PLAN.codes.map((c) => [c.name, c.code]));
const LEITUNG = CODE["Synthetisch Leitung"];
const GESPERRT = CODE["Synthetisch Mitarbeit 2"];      // wird von A gesperrt
const BLEIBT = CODE["Synthetisch Mitarbeit 1"];        // unbeteiligt, bleibt gültig
const FAKTOR_MAIL = "konto-01@example.invalid";        // Leitung alt-pflege; bekommt von A einen zweiten Faktor
const RAUM = "alt-pflege";
const MARKE_B = "K4P4: Kandidat B (simulierter Fix)";

let T, DATEN, ZUSTAND, STATIK, SICH, KANDIDAT_B;
let M;                         // Bibliotheken dieses Stands im Prüfprozess (nur bei stehendem Server)
let faktorKonto;               // { id, geheimnis }
let zuletzt = -1;
let skRoh;                     // Sicherungsschlüssel, angelegt von A
let planZelle;                 // [Schlüssel, alter Wert, neuer Wert] der Planänderung
const SICHERUNGEN = {};
const BUCH = {};               // Einträge der Bücher nach Schritt 1

const freierPort = () => new Promise((ok, nein) => {
  const s = createServer(); s.once("error", nein);
  s.listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); });
});
const ip = () => `10.${(randomBytes(1)[0] % 200) + 1}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const warten = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => createHash("sha256").update(t).digest("hex");

/** Umgebung beider Kandidaten: dieselben Daten, derselbe Zustand, derselbe Pfeffer (der des synthetischen Bestands). */
const umgebung = (extra = {}) => {
  const e = { ...process.env, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_STATIK: STATIK,
    CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "k4p4-geheim-nur-test", CENTRIC_PFEFFER: SYNTH_PFEFFER,
    CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "production", NODE_OPTIONS: "",
    CENTRIC_AUFRAEUMEN: "aus", CENTRIC_UEBERWACHUNG: "aus", CENTRIC_ZUSTELL_TAKT: "aus", ...extra };
  delete e.CENTRIC_BASIS;
  return e;
};

/** Ein echter Serverprozess aus `wurzel` (A = dieser Stand, B = Kopie mit simuliertem Fix). */
async function starten(wurzel) {
  const port = await freierPort();
  const basis = `http://127.0.0.1:${port}`;
  let log = "";
  const start = Date.now();
  const p = spawn(process.execPath, ["server.mjs"], { cwd: wurzel, env: umgebung({ PORT: String(port) }), stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", (d) => { log += d; });
  p.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 600; i++) {
    if (log.includes("läuft auf Port") && await fetch(`${basis}/gesund`).then(() => true, () => false)) break;
    if (p.exitCode !== null) break;
    await warten(100);
  }
  if (p.exitCode !== null || !log.includes("läuft auf Port")) { p.kill("SIGKILL"); throw new Error(`Server nicht bereit:\n${log}`); }
  const stoppen = () => new Promise((ok) => {
    if (p.exitCode !== null) return ok(undefined);
    const not = setTimeout(() => p.kill("SIGKILL"), 8000);
    p.once("exit", () => { clearTimeout(not); ok(undefined); });
    p.kill("SIGTERM");
  });
  return { basis, port, start, stoppen, log: () => log };
}

async function json(r) { try { return await r.json(); } catch { return null; } }
async function anmelden(s, code) {
  const r = await fetch(`${s.basis}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ zugangscode: code }) });
  return { status: r.status, daten: await json(r) };
}
async function anfrage(s, pfad, token, { methode = "GET", rumpf = null } = {}) {
  const r = await fetch(`${s.basis}${pfad}`, { method: methode,
    headers: { "x-forwarded-for": ip(), ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rumpf ? { "content-type": "application/json" } : {}) },
    ...(rumpf ? { body: JSON.stringify(rumpf) } : {}) });
  return { status: r.status, daten: await json(r) };
}
async function kontoAnmelden(s, zweifaktor) {
  const r = await fetch(`${s.basis}/api/account/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip() },
    body: JSON.stringify({ email: FAKTOR_MAIL, passwort: SYNTH_PASSWORT, ...(zweifaktor ? { zweifaktor } : {}) }) });
  return { status: r.status, daten: await json(r) };
}
/** Ein Code aus der App, nie zweimal derselbe Zeitschritt. */
async function appCode() {
  const g = M.zf.base32Dekodieren(faktorKonto.geheimnis);
  const s = Math.max(M.zf.schrittZu(Date.now()), zuletzt + 1);
  while (s > M.zf.schrittZu(Date.now()) + 1) await warten(500);
  zuletzt = s;
  return M.zf.hotp(g, s);
}

/** Ein Werkzeug als eigener Prozess. */
function lauf(skript, args, { wurzel = WURZEL, env = {} } = {}) {
  const r = spawnSync(process.execPath, [path.join(wurzel, skript), ...args], { cwd: T, encoding: "utf8", timeout: 240000,
    env: umgebung({ CENTRIC_ZUSTAND: "", ...env }) });
  return { code: r.status, aus: `${r.stdout}\n${r.stderr}`, stdout: String(r.stdout) };
}
function sichern(name, wurzel = WURZEL) {
  const r = lauf("werkzeug/ablage-sicherung.mjs", ["sichern", "--quelle", DATEN, "--ziel", path.join(SICH, name), "--ruhe", "0"], { wurzel });
  expect(r.code, r.aus).toBe(0);
  SICHERUNGEN[name] = /Sicherung vollständig: (.+)/.exec(r.aus)[1].trim();
}
/** Die Migrationsprobe gegen einen laufenden Kandidaten (Code des Kandidaten, Port des Kandidaten). */
const migrationsprobe = (s, wurzel) => lauf("deploy/migrationsprobe-lokal.mjs", [],
  { env: { CENTRIC_APP: wurzel, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_PROBE_PORT: String(s.port) } });

const buchLesen = async (datei) => JSON.parse(await readFile(path.join(ZUSTAND, datei), "utf8"));
const epoche = async () => JSON.parse(await readFile(path.join(ZUSTAND, "schluessel-epoche.json"), "utf8"));
const planWert = async (s, token) => {
  const g = await anfrage(s, "/api/bestand?voll=1", token);
  expect(g.status, JSON.stringify(g.daten)).toBe(200);
  return g.daten.bestand.mandanten[0].abweichungen[planZelle[0]];
};

/** Die Probe hat wirklich alles geprüft: beide Betriebe des Raums alt-sicherheit (je Betrieb eine Sitzung) und den Raum
    in der Altform (unzerlegt, ETag "alt") — beides Befunde dieses Pakets. */
function probeVollstaendig(pr) {
  expect(pr.code, pr.aus).toBe(0);
  expect(pr.aus).toMatch(/MIGRATIONSPROBE: (\d+)\/\1/);
  for (const z of [/BESTANDEN\s+alt-sicherheit \[Betrieb 1\/2\]: unveränderter Schreibzyklus/,
    /BESTANDEN\s+alt-sicherheit \[Betrieb 2\/2\]: unveränderter Schreibzyklus/,
    /BESTANDEN\s+alt-bestandsform: unveränderter Schreibzyklus/]) expect(pr.aus).toMatch(z);
}

/** Kopie dieses Stands mit simuliertem Fix (eine Logzeile mehr); node_modules nur verlinkt, nie kopiert. */
async function kandidatBBauen() {
  const ziel = path.join(T, "kandidat-b");
  await mkdir(ziel);
  for (const t of ["server.mjs", "server", "werkzeug", "deploy", "package.json", "vendor"])
    if (existsSync(path.join(WURZEL, t))) await cp(path.join(WURZEL, t), path.join(ziel, t), { recursive: true });
  await appendFile(path.join(ziel, "server.mjs"), `\nconsole.log(${JSON.stringify(MARKE_B)});\n`);
  symlinkSync(realpathSync(path.join(WURZEL, "node_modules")), path.join(ziel, "node_modules"), "junction");
  return ziel;
}
function verweisLoesen(ordner) {
  const l = path.join(ordner, "node_modules");
  if (!existsSync(l)) return;
  try { unlinkSync(l); } catch { rmdirSync(l); }
}

beforeAll(async () => {
  T = await mkdtemp(path.join(tmpdir(), "k4p4-"));
  await mkdir(path.join(T, "scratchpad"));
  DATEN = path.join(T, "scratchpad", "daten-mig-k4p4");   // Isolationsregel der Migrationsprobe
  ZUSTAND = path.join(T, "zustand"); STATIK = path.join(T, "statik"); SICH = path.join(T, "sich");
  await mkdir(STATIK); await mkdir(SICH);
  await writeFile(path.join(STATIK, "index.html"), "<!doctype html><title>K4-P4</title>");
  const vorher = process.env.CENTRIC_DATEN;
  delete process.env.CENTRIC_DATEN;
  try { await erzeugen({ ausgabe: DATEN, saat: SAAT, ...GROESSE, zahlkennung: false }); }
  finally { if (vorher !== undefined) process.env.CENTRIC_DATEN = vorher; }
  sichern("s0");                                   // Stand vor dem ersten Start des Kandidaten
  KANDIDAT_B = await kandidatBBauen();
  process.env.CENTRIC_DATEN = DATEN; process.env.CENTRIC_ZUSTAND = ZUSTAND; process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = SYNTH_PFEFFER;
  M = { zf: await import("../server/lib/zweifaktor.mjs"), accounts: await import("../server/lib/accounts.mjs"),
    ablage: await import("../server/lib/ablage.mjs") };
}, LIMIT);

afterAll(async () => {
  if (KANDIDAT_B) verweisLoesen(KANDIDAT_B);
  if (T) await rm(T, { recursive: true, force: true });
});

describe("K4-P4: Kandidat A auf dem Altbestand, dann Kandidat B auf demselben Stand (Vorwärts-Reparatur)", () => {
  it("1. Kandidat A: Widerruf, Sicherungsschlüssel, Plan; Stopp; zweiter Faktor; Sicherung S1", async () => {
    const a = await starten(WURZEL);
    try {
      expect(a.log()).not.toContain(MARKE_B);
      const l = await anmelden(a, LEITUNG);
      expect(l.status, JSON.stringify(l.daten)).toBe(200);
      expect((await anmelden(a, GESPERRT)).status, "vor dem Widerruf").toBe(200);
      const sp = await anfrage(a, "/api/zugang-sperren", l.daten.token, { methode: "POST", rumpf: { code: GESPERRT } });
      expect(sp.status, JSON.stringify(sp.daten)).toBe(200);
      expect((await anmelden(a, GESPERRT)).status, "nach dem Widerruf").toBe(403);

      const sk = await anfrage(a, "/api/sicherungsschluessel", l.daten.token, { methode: "POST", rumpf: {} });
      expect(sk.status, JSON.stringify(sk.daten)).toBe(200);
      skRoh = sk.daten.schluessel;
      expect((await anfrage(a, "/api/vollausgabe", skRoh)).status, "Sicherungsschlüssel liest").toBe(200);

      const g = await anfrage(a, "/api/bestand?voll=1", l.daten.token);
      expect(g.status, JSON.stringify(g.daten)).toBe(200);
      const b = g.daten.bestand;
      const m = b.mandanten[0];
      const arten = m.dienstarten.map((d) => d.id);
      const [schluessel, alt] = Object.entries(m.abweichungen)[0];
      const neu = arten.find((x) => x !== alt);
      planZelle = [schluessel, alt, neu];
      m.abweichungen = { ...m.abweichungen, [schluessel]: neu };
      const w = await anfrage(a, "/api/bestand", l.daten.token, { methode: "PUT", rumpf: { bestand: b, etag: g.daten.etag, durch: "K4P4" } });
      expect(w.status, JSON.stringify(w.daten).slice(0, 400)).toBe(200);
      expect(await planWert(a, l.daten.token), "Plan geschrieben").toBe(neu);
    } finally { await a.stoppen(); }

    /* Zweiter Faktor mit der Bibliothek von A (wie be2-a1-zweiter-faktor), bei stehendem Server. */
    const konto = await M.accounts.accountLesenPerMail(M.ablage.getStore({ name: "centric", consistency: "strong" }), FAKTOR_MAIL);
    expect(konto && konto.id, "Konto aus dem Altbestand").toBeTruthy();
    const faktor = (art, code = "") => {
      const r = spawnSync(process.execPath, [path.join(WURZEL, "pruefungen", "hilfen", "be2-faktor.mjs"), art, konto.id, code],
        { cwd: WURZEL, encoding: "utf8", env: umgebung() });
      return { erg: JSON.parse(String(r.stdout).trim().split("\n").pop() || "null"), aus: `${r.stdout}\n${r.stderr}` };
    };
    const beg = faktor("beginnen");
    expect(beg.erg && beg.erg.ok, beg.aus).toBe(true);
    faktorKonto = { id: konto.id, geheimnis: beg.erg.geheimnis };
    const best = faktor("bestaetigen", await appCode());
    expect(best.erg && best.erg.ok, best.aus).toBe(true);

    BUCH.zugang = Object.keys((await buchLesen("zugang-widerrufe.json")).eintraege || {}).sort();
    BUCH.pflicht = Object.keys((await buchLesen("konto-widerrufe.json")).faktorpflicht || {}).sort();
    expect(BUCH.zugang.length, "Widerruf im Buch").toBeGreaterThan(0);
    expect(BUCH.pflicht.length, "Faktorpflicht im Buch").toBe(1);
    sichern("s1");
  }, LIMIT);

  it("2. Kandidat B auf demselben Stand: Abgleich ohne Fehler, alles gilt weiter, Bücher bleiben, Migrationsprobe Exit 0", async () => {
    expect(planZelle, "Schritt 1 gelaufen").toBeTruthy();
    const b = await starten(KANDIDAT_B);
    try {
      expect(b.log(), "es läuft wirklich Kandidat B").toContain(MARKE_B);
      /* Abgleich wie deploy.sh: S1 gegen die Daten, mit Startzeit. */
      const ab = lauf("deploy/deploy-abgleich.mjs", [SICHERUNGEN.s1, DATEN, "--start", String(b.start)], { wurzel: KANDIDAT_B });
      expect(ab.code, ab.aus).toBe(0);
      const erg = JSON.parse(ab.stdout.trim().split("\n").pop());
      expect(erg, ab.stdout).toMatchObject({ ok: true });
      expect(erg.gleich, "es wurde wirklich verglichen").toBeGreaterThan(0);
      expect([erg.abweichend, erg.fehlend], "nichts von S1 verändert oder verschwunden").toEqual([0, 0]);

      const l = await anmelden(b, LEITUNG);
      expect(l.status, JSON.stringify(l.daten)).toBe(200);
      expect((await anmelden(b, GESPERRT)).status, "Widerruf gilt unter B").toBe(403);
      expect((await anmelden(b, BLEIBT)).status, "unbeteiligter Code gilt").toBe(200);
      expect((await anfrage(b, "/api/vollausgabe", skRoh)).status, "Sicherungsschlüssel von A gilt unter B").toBe(200);
      expect(await planWert(b, l.daten.token), "Plan von A unter B").toBe(planZelle[2]);
      const ohne = await kontoAnmelden(b);
      expect(ohne.status, `ohne Faktor: ${JSON.stringify(ohne.daten)}`).toBe(401);
      expect((await kontoAnmelden(b, await appCode())).status, "mit Faktor").toBe(200);

      probeVollstaendig(migrationsprobe(b, KANDIDAT_B));
    } finally { await b.stoppen(); }
    expect(Object.keys((await buchLesen("zugang-widerrufe.json")).eintraege || {}).sort(), "Widerrufbuch bleibt").toEqual(BUCH.zugang);
    expect(Object.keys((await buchLesen("konto-widerrufe.json")).faktorpflicht || {}).sort(), "Konto-Buch bleibt").toEqual(BUCH.pflicht);
  }, LIMIT);
});

describe("K4-P4: Datenrücksprung K7 auf S0 mit neuer Schlüsselepoche, dann Kandidat B", () => {
  it("3. Rücksprung mit dem Werkzeug von B (--zustand): neue Epoche; Widerrufenes bleibt ungültig; Migrationsprobe Exit 0", async () => {
    expect(skRoh, "Schritt 1 gelaufen").toBeTruthy();
    const vorher = await epoche();
    const r = lauf("werkzeug/ablage-sicherung.mjs", ["wiederherstellen", "--sicherung", SICHERUNGEN.s0, "--ziel", DATEN, "--ersetzen",
      "--ohne-serverpruefung", "--zustand", ZUSTAND], { wurzel: KANDIDAT_B });
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toContain("Schlüsselepoche erneuert");
    expect(r.aus).toMatch(/Widerrufbuch: \d+/);
    const nach = await epoche();
    expect(nach.epoche, "neue Epoche").not.toBe(vorher.epoche);
    expect(nach.grund).toBe("wiederherstellung");

    const b = await starten(KANDIDAT_B);
    try {
      expect(b.log()).toContain(MARKE_B);
      const l = await anmelden(b, LEITUNG);
      expect(l.status, JSON.stringify(l.daten)).toBe(200);
      expect((await anmelden(b, GESPERRT)).status, "Widerruf überlebt den Datenrücksprung").toBe(403);
      expect((await anmelden(b, BLEIBT)).status, "unbeteiligter Code gilt").toBe(200);
      /* S0 kennt den Schlüssel gar nicht (angelegt nach S0): ungültig schon mangels Datensatz. Die Epoche selbst prüft 3b. */
      expect((await anfrage(b, "/api/vollausgabe", skRoh)).status, "Sicherungsschlüssel aus der Zeit nach S0 gilt nicht").not.toBe(200);
      const ohne = await kontoAnmelden(b);
      expect(ohne.status, `Faktor-Konto ohne Faktor: ${JSON.stringify(ohne.daten)}`).toBe(403);
      expect(ohne.daten && ohne.daten.zweifaktor, "Absage wegen Rücksprung").toBe("ruecksprung");
      expect(await planWert(b, l.daten.token), "Plan steht auf S0 (Daten nach S0 sind gewollt verloren)").toBe(planZelle[1]);

      probeVollstaendig(migrationsprobe(b, KANDIDAT_B));
    } finally { await b.stoppen(); }
    for (const z of BUCH.zugang) expect(Object.keys((await buchLesen("zugang-widerrufe.json")).eintraege), "Widerrufbuch bleibt").toContain(z);
    expect(Object.keys((await buchLesen("konto-widerrufe.json")).faktorpflicht || {}).sort(), "Konto-Buch bleibt").toEqual(BUCH.pflicht);
  }, LIMIT);

  it("3b. Rücksprung auf S1 (enthält den Schlüssel von A): neue Epoche, der Schlüssel gilt nicht", async () => {
    expect(SICHERUNGEN.s1, "Schritt 1 gelaufen").toBeTruthy();
    const vorher = await epoche();
    const r = lauf("werkzeug/ablage-sicherung.mjs", ["wiederherstellen", "--sicherung", SICHERUNGEN.s1, "--ziel", DATEN, "--ersetzen",
      "--ohne-serverpruefung", "--zustand", ZUSTAND], { wurzel: KANDIDAT_B });
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toContain("Schlüsselepoche erneuert");
    expect((await epoche()).epoche, "neue Epoche").not.toBe(vorher.epoche);
    const b = await starten(KANDIDAT_B);
    try {
      const l = await anmelden(b, LEITUNG);
      expect(l.status, JSON.stringify(l.daten)).toBe(200);
      expect(await planWert(b, l.daten.token), "Daten von S1 (Plan von A)").toBe(planZelle[2]);
      expect((await anfrage(b, "/api/vollausgabe", skRoh)).status, "Schlüssel aus der alten Epoche gilt nicht").not.toBe(200);
      expect((await anmelden(b, GESPERRT)).status, "Widerruf gilt").toBe(403);
      expect((await kontoAnmelden(b, await appCode())).status, "Faktor aus S1 gilt").toBe(200);
    } finally { await b.stoppen(); }
  }, LIMIT);
});

/* ==========================================================================
   BE-2 STUFE A1 — EIN EINMAL AKTIVER ZWEITER FAKTOR VERSCHWINDET DURCH KEINEN
   RÜCKSPRUNG, UND EIN VERBRAUCHTER WIEDERHERSTELLUNGSCODE LEBT NICHT WIEDER AUF
   (verbindliche Betreiberentscheidung 2026-11-14; server/lib/kontowiderrufbuch.mjs,
   docs/acc45/ABNAHME-V4-BE2-A1-ZWEITER-FAKTOR.md)

   Gegen ECHTE Serverprozesse (node server.mjs), das echte Werkzeug
   (node werkzeug/ablage-sicherung.mjs) und echte Faktor-Prozesse
   (pruefungen/hilfen/be2-faktor.mjs, die Bibliothek kontofaktor.mjs):

     1. Bestand: Konten ohne Faktor melden sich wie bisher an; J und R (Faktor) mit Code aus der App. Sicherung „vorher“.
     2. K richtet den Faktor NACH „vorher“ ein → „Faktor ist Pflicht“ im Buch. Sicherung „mitk“.
     3. NEGATIV: Rücksprung auf „vorher“ mit dem Werkzeug (--zustand) → K hat in der Sicherung keinen Faktor → Platzhalter,
        Anmeldung 403 (mit und ohne Code), keine Neueinrichtung mit dem Passwort; J, N, S, R unberührt (auch der andere
        Betrieb).
     4. Gegenprobe: Rücksprung OHNE Zustandsverzeichnis → die Ablage zeigt K faktorlos (rot ohne Buch); das Buch weist ab,
        der Serverstart zieht nach.
     5. Altbild (Integrationsstand vor BE-2 A1) auf den nachgezogenen Daten: K kommt nicht hinein, J und N wie bisher.
     6. POSITIV: vollständiger, richtiger Rücksprung auf „mitk“ (Ablage + beide Bücher, dokumentierter Weg) → K meldet sich
        mit Code aus der App an.
     7. Wiederherstellungscode: eingelöst, dann NICHT erkannter Rücksprung (Verzeichniskopie, WR-2 greift nicht) → der
        verbrauchte Code wird abgewiesen, ein unverbrauchter desselben Satzes gilt.
    7b. Dasselbe ohne Nachziehen beim Start (Faktor-Datei erst bei laufendem Server zurückgelegt) — allein die
        Buchprüfung im Anmeldeweg (zweifaktor.mjs, `whBuch`) weist ab.
     8. Harter Prozessabbruch (SIGKILL) zwischen Ablage und Buch — beim Aktivieren und beim Einlösen → der nächste Start
        trägt nach; Rücksprung danach → bleibt Pflicht bzw. verbraucht.
     9. Buch verändert / gekürzt / fremd / fehlend → fail-closed (Konto-Anmeldung 503), Werkzeug fasst nichts an;
        dokumentierter Weg (Kopie zurücklegen, `kontowiderrufbuch-neu`) stellt wieder her.
    9b. Tiefenschutz: laufende Arbeitssitzung ohne Faktor, danach „Faktor ist Pflicht“ im Buch bei Ablage ohne Faktor
        (Nachziehen ausgefallen) → die nächste Anfrage weist ab (arbeitssitzung.mjs).
    10. Reine Bausteine: Kennung des Faktors gleich kontofaktor.mjs, nur hinzufügen, kein Geheimnis im Buch.

   Aufruf: npx vitest run pruefungen/be2-a1-zweiter-faktor.test.js --testTimeout=300000 --hookTimeout=300000
   ========================================================================== */
// zeit-ok: echte Serverprozesse laufen auf der echten Uhr (TOTP, Sitzungen, Prozesssperre); Zeitstempel hier nur als Datenwerte.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 300000;
const PFEFFER = "be2a1-faktorbuch-pfeffer-nur-zum-pruefen-3d81f0c7";
const PASSWORT = "be2a1-faktorbuch-passwort-nur-zum-pruefen-91c4e2a6";
const RAUM_A = "be2a1-haus-anton";
const RAUM_B = "be2a1-haus-berta";
/** Altbild: Integrationsstand unmittelbar vor BE-2 A1 (kennt die neuen Abschnitte nicht). */
const ALT_BASIS = process.env.BE2_ALT_BASIS || "aff9c320b8599ec362a32c9ffdfa85124ebaa590";

let T, DATEN, ZUSTAND, STATIK, SICH;
let M;
const K = {};          // Konten: name → { id, email }
const GEHEIM = {};     // name → Base32-Geheimnis (nur Prüfung)
const CODES = {};      // name → Wiederherstellungscodes (nur Prüfung)
const zuletzt = {};    // name → zuletzt verwendeter Zeitschritt
let altOrdner = null;

const freierPort = () => new Promise((ok, nein) => {
  const s = createServer(); s.once("error", nein);
  s.listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); });
});
const ip = () => `10.${(randomBytes(1)[0] % 200) + 1}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const warten = (ms) => new Promise((r) => setTimeout(r, ms));

async function starten({ wurzel = WURZEL, umgebung = "production" } = {}) {
  const port = await freierPort();
  const basis = `http://127.0.0.1:${port}`;
  let log = "";
  const p = spawn(process.execPath, ["server.mjs"], {
    cwd: wurzel,
    env: { ...process.env, PORT: String(port), CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_STATIK: STATIK,
      CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "be2a1-geheim-verwalter-nur-zum-pruefen", CENTRIC_PFEFFER: PFEFFER,
      CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: umgebung, NODE_OPTIONS: "",
      CENTRIC_AUFRAEUMEN: "aus", CENTRIC_UEBERWACHUNG: "aus", CENTRIC_ZUSTELL_TAKT: "aus" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (d) => { log += d; });
  p.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 600; i++) {
    if (await fetch(`${basis}/gesund`).then(() => true, () => false)) break;
    if (p.exitCode !== null) break;
    await warten(100);
  }
  if (p.exitCode !== null) throw new Error(`Server beendet:\n${log}`);
  const stoppen = () => new Promise((ok) => {
    if (p.exitCode !== null) return ok(undefined);
    const not = setTimeout(() => p.kill("SIGKILL"), 5000);
    p.once("exit", () => { clearTimeout(not); ok(undefined); });
    p.kill("SIGTERM");
  });
  return { basis, stoppen, log: () => log };
}

/** Ein frischer Code aus der App: ein Zeitschritt nach dem zuletzt verwendeten, im Fenster des Servers. */
async function appCode(name) {
  const g = M.zf.base32Dekodieren(GEHEIM[name]);
  const s = Math.max(M.zf.schrittZu(Date.now()), (zuletzt[name] ?? -1) + 1);
  while (s > M.zf.schrittZu(Date.now()) + 1) await warten(500);
  zuletzt[name] = s;
  return M.zf.hotp(g, s);
}

/** Konto-Anmeldung über HTTP. */
async function kontoAnmelden(s, name, zweifaktor = undefined) {
  const r = await fetch(`${s.basis}/api/account/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip() },
    body: JSON.stringify({ email: K[name].email, passwort: PASSWORT, ...(zweifaktor ? { zweifaktor } : {}) }) });
  const m = /__Host-centric_konto=([^;]*)/.exec(String(r.headers.get("set-cookie") || ""));
  let d = null; try { d = await r.json(); } catch { /* leer */ }
  return { status: r.status, daten: d, merkmal: r.status === 200 && m ? m[1] : null };
}
/** Einrichtung des Faktors über HTTP (Adresse und Passwort, ohne Ersteinrichtungscode). */
async function faktorAktion(s, name, aktion) {
  const r = await fetch(`${s.basis}/api/account/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip() },
    body: JSON.stringify({ email: K[name].email, passwort: PASSWORT, zweifaktorAktion: aktion }) });
  let d = null; try { d = await r.json(); } catch { /* leer */ }
  return { status: r.status, daten: d };
}
async function betriebOeffnen(s, merkmal, raum) {
  const r = await fetch(`${s.basis}/api/account/betrieb`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip(),
      cookie: `__Host-centric_konto=${merkmal}` },
    body: JSON.stringify({ raum }) });
  return r.status;
}
/** Anmelden (mit Code aus der App, falls das Konto einen Faktor hat) und Betrieb öffnen. */
async function zugang(s, name, raum) {
  const a = await kontoAnmelden(s, name, GEHEIM[name] ? await appCode(name) : undefined);
  if (a.status !== 200) return { anmeldung: a.status, betrieb: null };
  return { anmeldung: 200, betrieb: await betriebOeffnen(s, a.merkmal, raum) };
}

function werkzeug(args) {
  const r = spawnSync(process.execPath, [path.join(WURZEL, "werkzeug", "ablage-sicherung.mjs"), ...args], {
    cwd: WURZEL, encoding: "utf8",
    env: { ...process.env, CENTRIC_PFEFFER: PFEFFER, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: "", NODE_OPTIONS: "" } });
  return { code: r.status, aus: `${r.stdout}\n${r.stderr}` };
}
const SICHERUNGEN = {};
const sichern = (name) => {
  const r = werkzeug(["sichern", "--quelle", DATEN, "--ziel", path.join(SICH, name), "--ruhe", "0"]);
  expect(r.code, r.aus).toBe(0);
  SICHERUNGEN[name] = /Sicherung vollständig: (.+)/.exec(r.aus)[1].trim();
};
const wiederherstellen = (name, extra = []) =>
  werkzeug(["wiederherstellen", "--sicherung", SICHERUNGEN[name], "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung", ...extra]);
/** Nicht erkannter Rücksprung: Verzeichniskopie der ganzen Ablage (auch centric-sitzungen) — WR-2 bemerkt ihn nicht. */
const kopieZiehen = async (name) => { await cp(DATEN, path.join(T, `kopie-${name}`), { recursive: true }); };
const kopieZurueck = async (name) => {
  await rm(DATEN, { recursive: true, force: true });
  await cp(path.join(T, `kopie-${name}`), DATEN, { recursive: true });
};

/** Die Bibliothek des Faktors als eigener Prozess. `abbruch`: harter Abbruch nach dem passenden Schreibvorgang. */
function faktor(art, name, code = "", { abbruch = null, umgebung = "production" } = {}) {
  const env = { ...process.env, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_ABLAGE: "dateien",
    CENTRIC_PFEFFER: PFEFFER, NODE_ENV: umgebung, NODE_OPTIONS: "" };
  if (abbruch) {
    env.NODE_OPTIONS = `--import ${pathToFileURL(path.join(WURZEL, "pruefungen", "hilfen", "em6-abbruch.mjs")).href}`;
    env.EM6_ABBRUCH_MUSTER = abbruch;
  }
  const r = spawnSync(process.execPath, [path.join(WURZEL, "pruefungen", "hilfen", "be2-faktor.mjs"), art, K[name].id, code],
    { cwd: WURZEL, encoding: "utf8", env });
  let erg = null;
  try { erg = JSON.parse(r.stdout.trim().split("\n").pop() || "null"); } catch { /* abgebrochen */ }
  return { status: r.status, signal: r.signal, erg, aus: `${r.stdout}\n${r.stderr}` };
}
/** Faktor einrichten (beginnen, bestätigen mit dem ersten Code). */
async function einrichten(name, { abbruch = null, umgebung = "production" } = {}) {
  const b = faktor("beginnen", name);
  expect(b.erg && b.erg.ok, b.aus).toBe(true);
  GEHEIM[name] = b.erg.geheimnis;
  return faktor("bestaetigen", name, await appCode(name), { abbruch, umgebung });
}

const ablageDatei = (schluessel) => path.join(DATEN, "centric", M.ablage.dateiname(schluessel));
const ablageLesen = async (schluessel) => {
  try { return JSON.parse(await readFile(ablageDatei(schluessel), "utf8")).daten; }
  catch (e) { if (/** @type {any} */ (e).code === "ENOENT") return null; throw e; }
};
const faktorDaten = (name) => ablageLesen(M.kb.kontoFaktorSchluessel(K[name].id));
const buchDatei = () => path.join(ZUSTAND, "konto-widerrufe.json");
const buchRoh = async () => JSON.parse(await readFile(buchDatei(), "utf8"));
const pflichtImBuch = async (name) => Object.hasOwn((await buchRoh()).faktorpflicht || {}, M.kb.faktorPflichtKennung(K[name].id));
const centric = () => M.ablage.getStore({ name: "centric", consistency: "strong" });
const person = (id) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle: "mitarbeiter", bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

async function altStand(rev) {
  if (altOrdner) return altOrdner;
  if (spawnSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: WURZEL }).status !== 0)
    spawnSync("git", ["fetch", "--no-tags", "--depth", "1", "origin", rev], { cwd: WURZEL, encoding: "utf8" });
  if (spawnSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: WURZEL }).status !== 0)
    throw new Error(`Altstand ${rev} nicht verfügbar (git fetch origin ${rev})`);
  const ziel = await mkdtemp(path.join(T, `alt-${rev.slice(0, 8)}-`));
  let a = spawnSync("git", ["archive", "--format=tar", rev, "server.mjs", "server", "werkzeug", "package.json", "vendor"],
    { cwd: WURZEL, maxBuffer: 1 << 30 });
  if (a.status !== 0)
    a = spawnSync("git", ["archive", "--format=tar", rev, "server.mjs", "server", "werkzeug", "package.json"], { cwd: WURZEL, maxBuffer: 1 << 30 });
  if (a.status !== 0) throw new Error(`git archive ${rev}: ${a.stderr}`);
  const x = spawnSync("tar", ["-xf", "-"], { cwd: ziel, input: a.stdout, encoding: "buffer" });
  if (x.status !== 0) throw new Error(`tar: ${x.stderr}`);
  symlinkSync(path.join(WURZEL, "node_modules"), path.join(ziel, "node_modules"), "junction");
  altOrdner = ziel;
  return ziel;
}
/** Nur den Verweis lösen — niemals in node_modules hinein löschen. */
function verweisLoesen(ordner) {
  const l = path.join(ordner, "node_modules");
  if (!existsSync(l)) return;
  try { unlinkSync(l); } catch { rmdirSync(l); }
}

beforeAll(async () => {
  T = await mkdtemp(path.join(tmpdir(), "centric-be2a1-"));
  DATEN = path.join(T, "daten"); ZUSTAND = path.join(T, "zustand"); STATIK = path.join(T, "statik"); SICH = path.join(T, "sich");
  await mkdir(DATEN, { recursive: true }); await mkdir(STATIK); await mkdir(SICH);
  await writeFile(path.join(STATIK, "index.html"), "<!doctype html><title>BE-2 A1</title>");
  process.env.CENTRIC_DATEN = DATEN; process.env.CENTRIC_ZUSTAND = ZUSTAND; process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  M = {
    ablage: await import("../server/lib/ablage.mjs"),
    bestand: await import("../server/lib/bestand.mjs"),
    accounts: await import("../server/lib/accounts.mjs"),
    passwoerter: await import("../server/lib/passwoerter.mjs"),
    kb: await import("../server/lib/kontowiderrufbuch.mjs"),
    kf: await import("../server/lib/kontofaktor.mjs"),
    zf: await import("../server/lib/zweifaktor.mjs"),
  };
  const store = centric();
  for (const [raum, mid, personen] of [[RAUM_A, "ma", ["pj", "pk", "pr"]], [RAUM_B, "mb", ["qn", "qs"]]]) {
    const e = await M.bestand.bestandSchreiben(store, raum, { version: 5, mandanten: [{ id: mid, name: `Haus ${raum}`,
      einheiten: [{ id: "e1", name: "WB 1" }], personen: personen.map(person) }] }, { durch: "Pruefung" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
  }
  const pw = await M.passwoerter.passwortAblegen(PASSWORT);
  for (const [name, raum, mid, pid] of [["J", RAUM_A, "ma", "pj"], ["K", RAUM_A, "ma", "pk"], ["R", RAUM_A, "ma", "pr"],
    ["N", RAUM_B, "mb", "qn"], ["S", RAUM_B, "mb", "qs"]]) {
    const email = `be2a1-${name.toLowerCase()}-${randomBytes(4).toString("hex")}@example.org`;
    const a = await M.accounts.accountAnlegen(store, { email });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    await M.accounts.emailBestaetigen(store, a.account.id);
    expect((await M.accounts.passwortSetzen(store, a.account.id, pw)).ok).toBe(true);
    K[name] = { id: a.account.id, email };
    const m = await M.accounts.mitgliedschaftAnlegen(store, { accountId: a.account.id, raum, betrieb: 0, mandantId: mid,
      person: pid, rolle: "mitarbeiter", status: "aktiv" });
    expect(m.ok, JSON.stringify(m)).toBe(true);
  }
  /* J und R haben den Faktor schon vor der Sicherung „vorher“ (echte Bibliothek, eigener Prozess). */
  for (const name of ["J", "R"]) {
    const e = await einrichten(name);
    expect(e.erg && e.erg.ok, e.aus).toBe(true);
    expect(e.erg.kontobuch).toEqual({ geschrieben: true });
    CODES[name] = e.erg.wiederherstellung;
  }
}, LIMIT);

afterAll(async () => {
  if (altOrdner) verweisLoesen(altOrdner);
  if (T) await rm(T, { recursive: true, force: true });
});

describe("BE-2 A1: Pflicht-Faktor und verbrauchte Wiederherstellungscodes nach Rücksprung", () => {
  it("Bestand: Konten ohne Faktor unverändert, J und R mit Code aus der App; Buch nur mit Kennungen; Sicherung „vorher“", async () => {
    const s = await starten();
    try {
      expect(await zugang(s, "N", RAUM_B), "N ohne Faktor").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "K", RAUM_A), "K (noch) ohne Faktor").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "S", RAUM_B), "S ohne Faktor").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "J", RAUM_A), "J mit Faktor").toEqual({ anmeldung: 200, betrieb: 200 });
      expect((await kontoAnmelden(s, "J")).status, "J ohne Code").toBe(401);
      const b = await buchRoh();
      expect(Object.keys(b.faktorpflicht).sort()).toEqual([M.kb.faktorPflichtKennung(K.J.id), M.kb.faktorPflichtKennung(K.R.id)].sort());
      const roh = JSON.stringify(b);
      for (const geheim of [K.J.id, K.R.id, K.J.email, GEHEIM.J, GEHEIM.R, CODES.R[0], PFEFFER, RAUM_A])
        expect(roh, "kein Geheimnis, keine Kennung im Klartext").not.toContain(geheim);
      sichern("vorher");
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("K richtet den Faktor nach „vorher“ ein (Ablage, dann Buch); Anmeldung nur noch mit Code; Sicherung „mitk“", async () => {
    const e = await einrichten("K");
    expect(e.erg && e.erg.ok, e.aus).toBe(true);
    expect(e.erg.kontobuch).toEqual({ geschrieben: true });
    expect(await pflichtImBuch("K")).toBe(true);
    const s = await starten();
    try {
      expect((await kontoAnmelden(s, "K")).status, "K ohne Code").toBe(401);
      expect(await zugang(s, "K", RAUM_A), "K mit Code").toEqual({ anmeldung: 200, betrieb: 200 });
      sichern("mitk");
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("NEGATIV: Rücksprung auf „vorher“ mit Werkzeug (--zustand) — K bleibt gesperrt (403), kein Neueinrichten, andere unberührt", async () => {
    const r = wiederherstellen("vorher", ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/Zweiter Faktor \(BE-2 A1\): 3 Konten mit Pflicht-Faktor, 0 verbrauchte Wiederherstellungscodes im Buch; 0 Faktoren in der Sicherung nachgezogen, 1 Pflicht-Faktoren fehlen/);
    expect(r.aus).toMatch(/ACHTUNG: 1 Konto\/Konten hatten einen aktiven zweiten Faktor/);
    /* Ablage: Platzhalter — aktiv, ohne Geheimnis, ohne Codes. Nie wird ein Geheimnis zurückgelegt. */
    const f = await faktorDaten("K");
    expect(f).toMatchObject({ stand: "aktiv", ruecksprungSperre: true, geheimnis: null, wiederherstellung: null });
    expect((await faktorDaten("J")).ruecksprungSperre, "J unberührt").toBeUndefined();
    expect(await faktorDaten("N"), "N bekommt keinen Faktor").toBeNull();
    const s = await starten();
    try {
      const ohne = await kontoAnmelden(s, "K");
      expect(ohne.status, "K nur mit Passwort").toBe(403);
      expect(ohne.daten).toMatchObject({ ok: false, zweifaktor: "ruecksprung" });
      expect(ohne.daten.hinweis).toMatch(/im wiederhergestellten Datenstand fehlt/);
      expect((await kontoAnmelden(s, "K", await appCode("K"))).status, "K auch mit dem alten Code aus der App").toBe(403);
      const neu = await faktorAktion(s, "K", "beginnen");
      expect(neu.status, "keine Neueinrichtung mit dem Passwort").toBe(403);
      expect(neu.daten).toMatchObject({ zweifaktor: "zweifaktor-ruecksprung" });
      expect((await faktorAktion(s, "N", "beginnen")).daten, "N: unverändert (Ersteinrichtungscode nötig)").toMatchObject({ fehler: "ersteinrichtung" });
      expect(await zugang(s, "J", RAUM_A), "J (anderer Faktor) unberührt").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "N", RAUM_B), "N (anderer Betrieb) unberührt").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "S", RAUM_B), "S ohne Faktor unberührt").toEqual({ anmeldung: 200, betrieb: 200 });
      const g = await (await fetch(`${s.basis}/gesund?detail=1`)).json();
      expect(g.pruefungen.kontowiderrufbuch.stufe).toBe("ok");
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Gegenprobe: Rücksprung OHNE Zustandsverzeichnis — Ablage faktorlos (rot ohne Buch), Buch weist ab, Start zieht nach", async () => {
    const r = wiederherstellen("vorher");
    expect(r.code, r.aus).toBe(0);
    expect(await faktorDaten("K"), "die Sicherung kennt K's Faktor nicht").toBeNull();
    M.kb.kontowiderrufbuchVergessen();
    const st = await M.kf.kontoFaktorStand(centric(), K.K.id);
    expect(st.aktiv, "ohne Buch: K wäre faktorlos").toBe(false);
    expect(await M.kb.kontoFaktorPflichtImBuch(centric(), K.K.id)).toBe(true);
    expect(await M.kb.kontoFaktorPflichtImBuch(centric(), K.N.id)).toBe(false);
    const s = await starten();
    try {
      expect(s.log()).toMatch(/Faktoren: 3 Pflicht, 1 nach Rücksprung gesperrt/);
      expect(s.log()).toMatch(/WARNUNG Konto-Widerrufbuch: 1 Konto\/Konten mit Pflicht-Faktor ohne Faktor/);
      expect((await kontoAnmelden(s, "K")).status).toBe(403);
      expect(await zugang(s, "N", RAUM_B)).toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
    expect(await faktorDaten("K")).toMatchObject({ stand: "aktiv", ruecksprungSperre: true, geheimnis: null });
  }, LIMIT);

  it("Altbild (Integrationsstand vor BE-2 A1) auf den nachgezogenen Daten: K kommt nicht hinein, J und N wie bisher", async () => {
    const alt = await altStand(ALT_BASIS);
    const s = await starten({ wurzel: alt });
    try {
      expect((await kontoAnmelden(s, "K")).status, "K nur Passwort im Altbild").toBe(401);
      expect((await kontoAnmelden(s, "K", await appCode("K"))).status, "K mit Code im Altbild").not.toBe(200);
      expect(await zugang(s, "J", RAUM_A), "J im Altbild").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "N", RAUM_B), "N im Altbild").toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
    /* Das Altbild erhält die neuen Abschnitte (gesiegelt, „künftige Abschnitte“ aus BE-1). */
    M.kb.kontowiderrufbuchVergessen();
    expect(await M.kb.kontoFaktorPflichtImBuch(centric(), K.K.id)).toBe(true);
  }, LIMIT);

  it("POSITIV: vollständiger, richtiger Rücksprung auf „mitk“ (Ablage + Bücher, --zustand) — K meldet sich mit Faktor an", async () => {
    const r = wiederherstellen("mitk", ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/0 Pflicht-Faktoren fehlen in der Sicherung/);
    const f = await faktorDaten("K");
    expect(f.stand).toBe("aktiv");
    expect(f.ruecksprungSperre).toBeUndefined();
    expect(f.geheimnis).toBeTruthy();
    const s = await starten();
    try {
      expect((await kontoAnmelden(s, "K")).status, "K ohne Code").toBe(401);
      expect(await zugang(s, "K", RAUM_A), "K mit Code nach richtigem Rücksprung").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "J", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "N", RAUM_B)).toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Wiederherstellungscode: eingelöst, NICHT erkannter Rücksprung (Verzeichniskopie) — verbrauchter abgewiesen, anderer gilt", async () => {
    /* Unter NODE_ENV=production verwirft WR-2 nach einem ERKANNTEN Rücksprung ohnehin jeden alten Satz (auch die
       Verzeichniskopie hier wird erkannt). Offen blieb der Fall ohne Epochenbindung (NODE_ENV=test/development, nicht
       erkannter Rücksprung; ENTSCHEIDUNG-BE1-BE3.md §0.2) — genau den deckt das Buch; deshalb laufen Server und Faktor-
       Prozesse hier unter NODE_ENV=test, damit allein das Buch entscheidet. R erzeugt zuerst einen neuen Satz. */
    const s0 = await starten({ umgebung: "test" });
    try {
      const r = await fetch(`${s0.basis}/api/account/anmelden`, { method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip() },
        body: JSON.stringify({ email: K.R.email, passwort: PASSWORT, zweifaktorAktion: "wiederherstellung-neu",
          zweifaktor: await appCode("R") }) });
      const d = await r.json();
      expect(r.status, JSON.stringify(d)).toBe(200);
      CODES.R = d.wiederherstellung;
    } finally { await s0.stoppen(); }
    await kopieZiehen("vor-code");
    let s = await starten({ umgebung: "test" });
    try {
      const a = await kontoAnmelden(s, "R", CODES.R[0]);
      expect(a.status, "R mit Wiederherstellungscode 1").toBe(200);
    } finally { await s.stoppen(); }
    expect(Object.keys((await buchRoh()).whverbraucht || {}).length).toBe(1);
    await kopieZurueck("vor-code");
    /* Rot ohne Buch: die zurückgelegte Ablage zeigt Code 1 unverbraucht. */
    expect((await faktorDaten("R")).wiederherstellung.verbrauchtZahl).toBe(0);
    s = await starten({ umgebung: "test" });
    try {
      expect(s.log()).toMatch(/1 verbrauchte Wiederherstellungscodes, 1 Faktoren nachgezogen/);
      expect((await kontoAnmelden(s, "R", CODES.R[0])).status, "verbrauchter Code nach Rücksprung").toBe(401);
      expect((await kontoAnmelden(s, "R", CODES.R[1])).status, "unverbrauchter Code desselben Satzes (WR-2 greift nicht)").toBe(200);
    } finally { await s.stoppen(); }
    const w = (await faktorDaten("R")).wiederherstellung;
    expect(w.verbrauchtZahl, "Ablage nachgezogen (Code 1) und Code 2 eingelöst").toBe(2);
  }, LIMIT);

  it("Wiederherstellungscode: das Buch entscheidet im Anmeldeweg selbst — Ablage erst NACH dem Start zurückgelegt", async () => {
    /* Der Serverstart zieht verbrauchte Codes in der Ablage nach; damit bliebe die Prüfung im Anmeldeweg
       (zweifaktor.mjs, `whBuch`) ungeprüft. Hier läuft der Server schon, dann wird die Faktor-Datei von R aus der
       Verzeichniskopie „vor-code“ zurückgelegt (Codes 1 und 2 dort unverbraucht, im Buch verbraucht) — ohne Nachziehen. */
    const datei = ablageDatei(M.kb.kontoFaktorSchluessel(K.R.id));
    const jetzt = await readFile(datei, "utf8");
    const alt = await readFile(path.join(T, "kopie-vor-code", path.relative(DATEN, datei)), "utf8");
    const s = await starten({ umgebung: "test" });
    try {
      await writeFile(datei, alt);
      expect((await faktorDaten("R")).wiederherstellung.verbrauchtZahl, "Ablage zeigt Code 1 und 2 unverbraucht").toBe(0);
      expect((await kontoAnmelden(s, "R", CODES.R[0])).status, "verbrauchter Code 1, nur das Buch weiß es").toBe(401);
      expect((await kontoAnmelden(s, "R", CODES.R[1])).status, "verbrauchter Code 2, nur das Buch weiß es").toBe(401);
      expect((await faktorDaten("R")).wiederherstellung.verbrauchtZahl, "nichts eingelöst").toBe(0);
    } finally {
      await s.stoppen();
      await writeFile(datei, jetzt);
    }
  }, LIMIT);

  it("Harter Abbruch zwischen Ablage und Buch (Einlösen und Aktivieren): Start trägt nach, Rücksprung bleibt wirksam", async () => {
    /* (a) Einlösen von Code 3: Ablage verbraucht, Buch nicht. */
    await kopieZiehen("vor-abbruch");
    const e = faktor("pruefen", "R", CODES.R[2], { abbruch: "centric/zweifaktor%3A", umgebung: "test" });
    expect(e.aus).toContain("[em6-abbruch] harter Abbruch");
    expect(e.erg, "keine Antwort").toBeNull();
    expect((await faktorDaten("R")).wiederherstellung.verbrauchtZahl).toBe(3);
    expect(Object.keys((await buchRoh()).whverbraucht).length, "Buch nicht beschrieben").toBe(2);
    /* (b) Aktivieren des Faktors von S: Ablage aktiv, Buch nicht. */
    const a = await einrichten("S", { abbruch: "centric/zweifaktor%3A", umgebung: "test" });
    expect(a.aus).toContain("[em6-abbruch] harter Abbruch");
    expect((await faktorDaten("S")).stand).toBe("aktiv");
    expect(await pflichtImBuch("S"), "Buch nicht beschrieben").toBe(false);
    let s = await starten({ umgebung: "test" });
    try {
      expect(s.log()).toMatch(/Konto-Widerrufbuch: .* 2 aus der Ablage eingesammelt/);
    } finally { await s.stoppen(); }
    expect(await pflichtImBuch("S")).toBe(true);
    expect(Object.keys((await buchRoh()).whverbraucht).length).toBe(3);
    /* Rücksprung (Verzeichniskopie) auf den Stand vor beiden: S faktorlos, Code 3 unverbraucht — beides bleibt abgewiesen. */
    await kopieZurueck("vor-abbruch");
    expect(await faktorDaten("S")).toBeNull();
    s = await starten({ umgebung: "test" });
    try {
      expect((await kontoAnmelden(s, "R", CODES.R[2])).status, "Code 3 nach Abbruch und Rücksprung").toBe(401);
      expect((await kontoAnmelden(s, "S")).status, "S nach Abbruch und Rücksprung").toBe(403);
      expect((await kontoAnmelden(s, "N")).status, "N im selben Betrieb unberührt").toBe(200);
      expect((await kontoAnmelden(s, "R", CODES.R[3])).status, "Code 4 gilt").toBe(200);
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Buch verändert, gekürzt, fremd oder fehlend: fail-closed (503), Werkzeug fasst nichts an; dokumentierter Weg stellt her", async () => {
    const kopie = path.join(T, "konto-widerrufe.kopie.json");
    await copyFile(buchDatei(), kopie);
    const ok = await readFile(kopie, "utf8");
    const fall = async (inhalt, muster) => {
      if (inhalt === null) await rm(buchDatei()); else await writeFile(buchDatei(), inhalt);
      const s = await starten();
      try {
        expect(s.log()).toMatch(muster);
        expect((await kontoAnmelden(s, "J", await appCode("J"))).status, "Konto mit Faktor fail-closed").toBe(503);
        expect((await kontoAnmelden(s, "N")).status, "Konto ohne Faktor fail-closed").toBe(503);
      } finally { await s.stoppen(); }
    };
    /* Verändert: ein Pflicht-Eintrag entfernt (das, was ein Angreifer wollte) — Siegel passt nicht mehr. */
    const b = JSON.parse(ok);
    delete b.faktorpflicht[M.kb.faktorPflichtKennung(K.K.id)];
    await fall(JSON.stringify(b), /WARNUNG Konto-Widerrufbuch: .*falsches Siegel/);
    /* Gekürzt. */
    await fall(ok.slice(0, Math.floor(ok.length / 2)), /WARNUNG Konto-Widerrufbuch: .*beschädigt/);
    /* Fremd: gültig gesiegelt (gleicher Pfeffer), aber ein anderes Buch als das der Ablage. */
    const fremdVerz = await mkdtemp(path.join(T, "fremd-"));
    await M.kb.kontobuchSchreiben(fremdVerz, M.kb.kontobuchNeu());
    await fall(await readFile(path.join(fremdVerz, "konto-widerrufe.json"), "utf8"), /gehört nicht zu dieser Ablage/);
    /* Fehlend bei vorhandenem Anker. */
    await fall(null, /Konto-Widerrufbuch fehlt, obwohl die Ablage eines kennt/);
    expect(existsSync(buchDatei()), "nicht still neu angelegt").toBe(false);
    /* Werkzeug: fehlt das Buch, wird nichts angefasst. */
    const vorher = await readFile(ablageDatei(M.kb.kontoFaktorSchluessel(K.S.id)), "utf8");
    const w = wiederherstellen("mitk", ["--zustand", ZUSTAND]);
    expect(w.code, w.aus).toBe(2);
    expect(await readFile(ablageDatei(M.kb.kontoFaktorSchluessel(K.S.id)), "utf8"), "nichts angefasst").toBe(vorher);
    /* Dokumentierter Weg 1: Kopie zurücklegen — alles wie vorher. */
    await copyFile(kopie, buchDatei());
    let s = await starten();
    try {
      expect(await zugang(s, "K", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 200 });
      expect((await kontoAnmelden(s, "S")).status, "S bleibt gesperrt").toBe(403);
    } finally { await s.stoppen(); }
    /* Dokumentierter Weg 2 (keine Kopie): `kontowiderrufbuch-neu` sammelt aus der Ablage — aktive Faktoren (auch
       Platzhalter) werden Pflicht, verbrauchte Codes bleiben verbraucht. */
    await rm(buchDatei());
    const neu = werkzeug(["kontowiderrufbuch-neu", "--zustand", ZUSTAND, "--daten", DATEN, "--ohne-serverpruefung"]);
    expect(neu.code, neu.aus).toBe(0);
    for (const name of ["J", "K", "R", "S"]) expect(await pflichtImBuch(name), `${name} Pflicht nach Neuanlage`).toBe(true);
    expect(await pflichtImBuch("N")).toBe(false);
    s = await starten();
    try {
      expect(await zugang(s, "K", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 200 });
      expect((await kontoAnmelden(s, "S")).status).toBe(403);
      expect(await zugang(s, "N", RAUM_B)).toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Tiefenschutz Arbeitssitzung: Pflicht im Buch ohne Faktor in der Ablage (Nachziehen ausgefallen) — Sitzung ohne Faktor endet", async () => {
    /* Der Fall, den sonst nur der Platzhalter abfängt: N hat eine Arbeitssitzung aus einer Anmeldung ohne Faktor; das
       Buch sagt „Faktor ist Pflicht“, die Ablage zeigt keinen Faktor (und keinen Platzhalter) — so stünde es nach einem
       Rücksprung, dessen Nachziehen beim Start scheiterte. Der Server läuft schon; das Buch wird danach beschrieben. */
    const s = await starten();
    try {
      const a = await kontoAnmelden(s, "N");
      expect(a.status).toBe(200);
      const r = await fetch(`${s.basis}/api/account/betrieb`, { method: "POST",
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip(),
          cookie: `__Host-centric_konto=${a.merkmal}` }, body: JSON.stringify({ raum: RAUM_B }) });
      const token = (await r.json()).token;
      expect(r.status).toBe(200);
      const bestand = async () => (await fetch(`${s.basis}/api/bestand`,
        { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": ip() } })).status;
      expect(await bestand(), "vorher: Arbeitssitzung gilt").toBe(200);
      M.kb.kontowiderrufbuchVergessen();
      expect((await M.kb.kontoFaktorPflichtVermerken(centric(), K.N.id)).geschrieben).toBe(true);
      expect(await faktorDaten("N"), "Ablage: kein Faktor, kein Platzhalter").toBeNull();
      expect(await bestand(), "Pflicht im Buch: Arbeitssitzung ohne Faktor endet").toBe(401);
      expect(await bestand(), "und bleibt beendet").toBe(401);
      expect((await kontoAnmelden(s, "N")).status, "neue Anmeldung ohne Faktor: gesperrt").toBe(403);
      expect(await zugang(s, "J", RAUM_A), "J unberührt").toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
  }, LIMIT);
});

describe("BE-2 A1: reine Bausteine", () => {
  const P1 = "be2a1-baustein-pfeffer-nur-zum-pruefen-5b7e";
  it("Ablageschlüssel des Faktors stimmt mit kontofaktor.mjs überein", () => {
    expect(M.kb.kontoFaktorSchluessel("a_beispiel123")).toBe(`zweifaktor:${M.kf.kontoFaktorId("a_beispiel123")}`);
  });

  it("einsammeln fügt nur hinzu; normalisieren setzt Platzhalter bzw. verbraucht — nichts an fremden Konten", () => {
    const b = M.kb.kontobuchNeu();
    const fJ = { stand: "aktiv", generation: "g1", geheimnis: { v: 2 }, wiederherstellung: { v: 2, generation: 1, verbrauchtZahl: 1,
      eintraege: [{ sel: "AAAA", verbraucht: "2026-11-14T08:00:00.000Z" }, { sel: "BBBB", verbraucht: null }] } };
    const stand = { konten: [{ schluessel: "account:j", wert: { id: "a_jjjjjjjj", status: "aktiv" } },
      { schluessel: "account:n", wert: { id: "a_nnnnnnnn", status: "aktiv" } }], mitglieder: [], laeufe: [],
    faktoren: [{ schluessel: M.kb.kontoFaktorSchluessel("a_jjjjjjjj"), wert: fJ, accountId: "a_jjjjjjjj" }] };
    expect(M.kb.kontobuchEinsammeln(b, stand, { pfeffer: P1 })).toBe(2);
    expect(Object.keys(b.faktorpflicht)).toEqual([M.kb.faktorPflichtKennung("a_jjjjjjjj", P1)]);
    expect(Object.keys(b.whverbraucht)).toEqual([M.kb.whCodeKennung("a_jjjjjjjj", { bindung: "g1", generation: 1, sel: "AAAA" }, P1)]);
    /* Ein älterer Stand ohne Faktor entfernt nichts. */
    const alt = { ...stand, faktoren: [] };
    expect(M.kb.kontobuchEinsammeln(b, alt, { pfeffer: P1 })).toBe(0);
    const n = M.kb.faktorenNormalisieren(b, alt, { pfeffer: P1, am: "2026-11-14T09:00:00.000Z" });
    expect(n).toEqual([{ schluessel: M.kb.kontoFaktorSchluessel("a_jjjjjjjj"), wert: M.kb.sperrFaktor("2026-11-14T09:00:00.000Z") }]);
    /* Faktor vorhanden, Code AAAA in der Ablage wieder unverbraucht → vermerkt; BBBB bleibt. */
    const zurueck = { ...stand, faktoren: [{ ...stand.faktoren[0], wert: { ...fJ, wiederherstellung: { ...fJ.wiederherstellung,
      verbrauchtZahl: 0, eintraege: [{ sel: "AAAA", verbraucht: null }, { sel: "BBBB", verbraucht: null }] } } }] };
    const n2 = M.kb.faktorenNormalisieren(b, zurueck, { pfeffer: P1, am: "2026-11-14T09:00:00.000Z" });
    expect(n2.length).toBe(1);
    expect(n2[0].wert.wiederherstellung.eintraege.map((x) => !!x.verbraucht)).toEqual([true, false]);
    expect(n2[0].wert.wiederherstellung.verbrauchtZahl).toBe(1);
    expect(n2[0].wert.geheimnis, "Geheimnis unverändert, nie aus dem Buch").toEqual({ v: 2 });
    expect(() => M.kb.abschnittEintragen(b, "faktorpflicht", ["kurz"], "t")).toThrow(/unbekannte Form/);
    expect(() => M.kb.abschnittEintragen(b, "unbekannt", [], "t")).toThrow(/Unbekannter Abschnitt/);
  });

  it("Vereinigung (BE-3-Grundlage) erhält die neuen Abschnitte und entfernt nichts; Siegel deckt sie", async () => {
    const a = M.kb.kontobuchNeu(); const c = M.kb.kontobuchNeu();
    M.kb.abschnittEintragen(c, "faktorpflicht", [M.kb.faktorPflichtKennung("a_x1234567", P1)], "t");
    M.kb.kontobuchVereinen(a, c);
    expect(Object.keys(a.faktorpflicht).length).toBe(1);
    const verz = await mkdtemp(path.join(T, "bausteine-"));
    await M.kb.kontobuchSchreiben(verz, a, { pfeffer: P1 });
    const roh = JSON.parse(await readFile(path.join(verz, "konto-widerrufe.json"), "utf8"));
    roh.faktorpflicht = {};
    await writeFile(path.join(verz, "konto-widerrufe.json"), JSON.stringify(roh));
    await expect(M.kb.kontobuchLesen(verz, { pfeffer: P1 })).rejects.toThrow(/falsches Siegel/);
  });
});

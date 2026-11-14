/* ==========================================================================
   BE-1 — KONTOSPERREN UND ENTZOGENE MITGLIEDSCHAFTEN ÜBERLEBEN JEDEN RÜCKSPRUNG
   (verbindliche Betreiberentscheidung 2026-11-14, Option A; server/lib/kontowiderrufbuch.mjs)

   Gegen ECHTE Serverprozesse (node server.mjs), das echte Werkzeug
   (node werkzeug/ablage-sicherung.mjs) und echte Widerrufsprozesse
   (pruefungen/hilfen/be1-widerruf.mjs, die Bibliothek accounts.mjs):

     1. Bestand ohne jeden Widerruf: erster Start legt ein LEERES Konto-Buch an, alle Konten melden sich an, alle
        Betriebe öffnen sich (unverändertes Verhalten).
     2. Sicherung „vorher“ → Konto K sperren, Mitgliedschaft L in Betrieb A entziehen → Rücksprung auf „vorher“ mit
        dem Werkzeug (--zustand) → K bleibt gesperrt, L kommt nicht in A; L in Betrieb B und das unbeteiligte Konto N
        bleiben unberührt (keine mandantenübergreifende Sperre). Ablage selbst nachgezogen.
     3. Gegenprobe: Rücksprung OHNE Zustandsverzeichnis — die Sicherung belebt K und L in der Ablage wieder (rot ohne
        Buch); das Buch weist trotzdem ab, und der Serverstart zieht die Ablage nach.
     4. Altbild (Integrationsstand vor BE-1) auf den nachgezogenen Daten: K und L bleiben abgewiesen.
     5. Harter Prozessabbruch (SIGKILL) zwischen Ablage und Buch, für Entzug und Sperre → der nächste Start trägt nach;
        Rücksprung danach → bleibt widerrufen. Buch nicht schreibbar → „Widerruf wirksam, Widerrufbuch nicht
        beschrieben" (widerrufWirksam), Nachtrag in der Ablage, Start holt nach.
     6. Buch manipuliert / fehlt bei vorhandenem Anker → fail-closed (Konto-Anmeldung 503), Zugangscodes unberührt;
        Werkzeug fasst nichts an; `kontowiderrufbuch-neu` stellt bewusst wieder her.
     7. Reine Bausteine: nur hinzufügen, Vereinigung als Maximum, künftige Abschnitte gesiegelt und erhalten.

   Aufruf: npx vitest run pruefungen/be1-konto-widerrufbuch.test.js --testTimeout=240000
   ========================================================================== */
// zeit-ok: echte Serverprozesse laufen auf der echten Uhr (Sitzungen, Prozesssperre); Zeitstempel hier nur als Datenwerte.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 240000;
const PFEFFER = "be1-kontobuch-pfeffer-nur-zum-pruefen-6f1c2a9e";
const PASSWORT = "be1-kontobuch-passwort-nur-zum-pruefen-7341c2e8";
const RAUM_A = "be1-haus-anton";
const RAUM_B = "be1-haus-berta";
/** Altbild: Integrationsstand unmittelbar vor BE-1 (kennt das Konto-Buch nicht). */
const ALT_BASIS = process.env.BE1_ALT_BASIS || "d84e4a834a5c6397b077e8ab64b2d6fb319f54ca";

let T, DATEN, ZUSTAND, STATIK, SICH;
let M;
const K = {};          // Konten: name → { id, email }
let CODE;              // ein Zugangscode (unberührt vom Konto-Buch)
let altOrdner = null;

const freierPort = () => new Promise((ok, nein) => {
  const s = createServer(); s.once("error", nein);
  s.listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); });
});
const ip = () => `10.${(randomBytes(1)[0] % 200) + 1}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

async function starten({ wurzel = WURZEL, zustand = ZUSTAND } = {}) {
  const port = await freierPort();
  const basis = `http://127.0.0.1:${port}`;
  let log = "";
  const p = spawn(process.execPath, ["server.mjs"], {
    cwd: wurzel,
    env: { ...process.env, PORT: String(port), CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: zustand, CENTRIC_STATIK: STATIK,
      CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "be1-geheim-verwalter-0815", CENTRIC_PFEFFER: PFEFFER,
      CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "production", NODE_OPTIONS: "",
      CENTRIC_AUFRAEUMEN: "aus", CENTRIC_UEBERWACHUNG: "aus", CENTRIC_ZUSTELL_TAKT: "aus" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout.on("data", (d) => { log += d; });
  p.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 600; i++) {
    if (await fetch(`${basis}/gesund`).then(() => true, () => false)) break;
    if (p.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
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

/** Konto-Anmeldung über HTTP; gibt Status und Merkmal (Cookie) zurück. */
async function kontoAnmelden(s, name) {
  const r = await fetch(`${s.basis}/api/account/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip() },
    body: JSON.stringify({ email: K[name].email, passwort: PASSWORT }) });
  const m = /__Host-centric_konto=([^;]*)/.exec(String(r.headers.get("set-cookie") || ""));
  return { status: r.status, merkmal: r.status === 200 && m ? m[1] : null };
}
/** Betrieb über das Konto öffnen (Betriebsauswahl). */
async function betriebOeffnen(s, merkmal, raum) {
  const r = await fetch(`${s.basis}/api/account/betrieb`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip(),
      cookie: `__Host-centric_konto=${merkmal}` },
    body: JSON.stringify({ raum }) });
  let d = null; try { d = await r.json(); } catch { /* leer */ }
  return { status: r.status, daten: d };
}
/** Anmelden und Betrieb öffnen: Status der Betriebsauswahl (oder der Anmeldung, wenn die schon scheitert). */
async function zugang(s, name, raum) {
  const a = await kontoAnmelden(s, name);
  if (a.status !== 200) return { anmeldung: a.status, betrieb: null };
  return { anmeldung: 200, betrieb: (await betriebOeffnen(s, a.merkmal, raum)).status };
}
async function codeAnmelden(s) {
  const r = await fetch(`${s.basis}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ zugangscode: CODE }) });
  return r.status;
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
  return SICHERUNGEN[name];
};
const wiederherstellen = (name, extra = []) =>
  werkzeug(["wiederherstellen", "--sicherung", SICHERUNGEN[name], "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung", ...extra]);

/** Ein Widerruf als eigener Prozess (echte Bibliothek). `abbruch`: regulärer Ausdruck — harter Abbruch danach. */
function widerruf(art, name, raum = "", { abbruch = null, zustand = ZUSTAND } = {}) {
  const env = { ...process.env, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: zustand, CENTRIC_ABLAGE: "dateien",
    CENTRIC_PFEFFER: PFEFFER, NODE_ENV: "production", NODE_OPTIONS: "" };
  if (abbruch) {
    env.NODE_OPTIONS = `--import ${pathToFileURL(path.join(WURZEL, "pruefungen", "hilfen", "em6-abbruch.mjs")).href}`;
    env.EM6_ABBRUCH_MUSTER = abbruch;
  }
  const r = spawnSync(process.execPath, [path.join(WURZEL, "pruefungen", "hilfen", "be1-widerruf.mjs"), art, K[name].id, raum],
    { cwd: WURZEL, encoding: "utf8", env });
  let erg = null;
  try { erg = JSON.parse(r.stdout.trim().split("\n").pop() || "null"); } catch { /* abgebrochen */ }
  return { status: r.status, signal: r.signal, erg, aus: `${r.stdout}\n${r.stderr}` };
}

const ablageDatei = (schluessel) => path.join(DATEN, "centric", M.ablage.dateiname(schluessel));
const ablageLesen = async (schluessel) => JSON.parse(await readFile(ablageDatei(schluessel), "utf8")).daten;
const kontoStatus = async (name) => (await ablageLesen(M.accounts.accountSchluessel(K[name].email))).status;
const mitglied = (name, raum) => ablageLesen(M.accounts.mitgliedSchluessel(K[name].id, raum));
const lauf = (name, raum) => ablageLesen(M.accounts.mitgliedlaufSchluessel(K[name].id, raum));
const buchDatei = () => path.join(ZUSTAND, "konto-widerrufe.json");
const buchRoh = async () => JSON.parse(await readFile(buchDatei(), "utf8"));
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
  T = await mkdtemp(path.join(tmpdir(), "centric-be1-"));
  DATEN = path.join(T, "daten"); ZUSTAND = path.join(T, "zustand"); STATIK = path.join(T, "statik"); SICH = path.join(T, "sich");
  await mkdir(DATEN, { recursive: true }); await mkdir(STATIK); await mkdir(SICH);
  await writeFile(path.join(STATIK, "index.html"), "<!doctype html><title>BE-1</title>");
  process.env.CENTRIC_DATEN = DATEN; process.env.CENTRIC_ZUSTAND = ZUSTAND; process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  M = {
    ablage: await import("../server/lib/ablage.mjs"),
    bestand: await import("../server/lib/bestand.mjs"),
    accounts: await import("../server/lib/accounts.mjs"),
    passwoerter: await import("../server/lib/passwoerter.mjs"),
    konten: await import("../server/lib/konten.mjs"),
    codes: await import("../server/lib/codes.mjs"),
    kb: await import("../server/lib/kontowiderrufbuch.mjs"),
  };
  const store = centric();
  for (const [raum, mid, personen] of [[RAUM_A, "ma", ["pk", "pl", "pn", "pp", "ps", "pu"]], [RAUM_B, "mb", ["ql"]]]) {
    const e = await M.bestand.bestandSchreiben(store, raum, { version: 5, mandanten: [{ id: mid, name: `Haus ${raum}`,
      einheiten: [{ id: "e1", name: "WB 1" }], personen: personen.map(person) }] }, { durch: "Pruefung" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
  }
  const pw = await M.passwoerter.passwortAblegen(PASSWORT);
  for (const name of ["K", "L", "N", "P", "S", "U"]) {
    const email = `be1-${name.toLowerCase()}-${randomBytes(4).toString("hex")}@example.org`;
    const a = await M.accounts.accountAnlegen(store, { email });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    await M.accounts.emailBestaetigen(store, a.account.id);
    expect((await M.accounts.passwortSetzen(store, a.account.id, pw)).ok).toBe(true);
    K[name] = { id: a.account.id, email };
  }
  const mitgliedschaft = async (name, raum, mandantId, personId) => {
    const m = await M.accounts.mitgliedschaftAnlegen(store, { accountId: K[name].id, raum, betrieb: 0, mandantId,
      person: personId, rolle: "mitarbeiter", status: "aktiv" });
    expect(m.ok, JSON.stringify(m)).toBe(true);
  };
  await mitgliedschaft("K", RAUM_A, "ma", "pk");
  await mitgliedschaft("L", RAUM_A, "ma", "pl");
  await mitgliedschaft("L", RAUM_B, "mb", "ql");
  await mitgliedschaft("N", RAUM_A, "ma", "pn");
  await mitgliedschaft("P", RAUM_A, "ma", "pp");
  await mitgliedschaft("S", RAUM_A, "ma", "ps");
  await mitgliedschaft("U", RAUM_A, "ma", "pu");
  /* Ein Zugangscode im selben Betrieb: hängt NICHT am Konto-Buch (getrennte Bücher). */
  const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
  CODE = [0, 1, 2].map(() => Array.from(randomBytes(4)).map((b) => ALPHABET[b % ALPHABET.length]).join("")).join("-");
  await M.konten.kontoSchreiben(store, M.codes.ablageSchluessel(CODE), { name: `Haus ${RAUM_A}`, bestand: RAUM_A,
    rolle: "mitarbeiter", person: "pn", betrieb: 0, mandantId: "ma", demo: false, gruppe: null, hinweis: null,
    angelegt: new Date().toISOString() });
}, LIMIT);

afterAll(async () => {
  if (altOrdner) verweisLoesen(altOrdner);
  if (T) await rm(T, { recursive: true, force: true });
});

describe("BE-1: Kontosperren und entzogene Mitgliedschaften nach Rücksprung", () => {
  it("Bestand ohne Widerruf: leeres Konto-Buch, alle Zugänge wie bisher; Sicherung „vorher“", async () => {
    const s = await starten();
    try {
      for (const name of ["K", "L", "N", "P", "S", "U"]) expect(await zugang(s, name, RAUM_A), `${name} vorher`).toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "L", RAUM_B), "L in B vorher").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await codeAnmelden(s), "Zugangscode").toBe(200);
      const b = await buchRoh();
      expect(b.konten).toEqual({});
      expect(b.mitglieder).toEqual({});
      expect(JSON.stringify(b), "keine Kontokennung im Klartext").not.toContain(K.K.id);
      expect(JSON.stringify(b)).not.toContain(RAUM_A);
      sichern("vorher");
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Sperre und Entzug (echter Prozess) wirken und stehen gesiegelt im Buch — nur Kennungen", async () => {
    const sp = widerruf("sperren", "K");
    expect(sp.status, sp.aus).toBe(0);
    expect(sp.erg).toEqual({ ok: true, kontobuch: { geschrieben: true }, widerrufWirksam: false });
    const en = widerruf("entziehen", "L", RAUM_A);
    expect(en.status, en.aus).toBe(0);
    expect(en.erg.kontobuch).toEqual({ geschrieben: true });
    const b = await buchRoh();
    expect(Object.keys(b.konten)).toEqual([M.kb.kontoKennung(K.K.id)]);
    expect(b.mitglieder[M.kb.mitgliedKennung(K.L.id, RAUM_A)].generation).toBe(2);
    expect(b.mitglieder[M.kb.mitgliedKennung(K.L.id, RAUM_B)], "Betrieb B unberührt").toBeUndefined();
    const roh = JSON.stringify(b);
    for (const geheim of [K.K.id, K.L.id, K.K.email, RAUM_A, PFEFFER]) expect(roh).not.toContain(geheim);
    const s = await starten();
    try {
      expect((await kontoAnmelden(s, "K")).status, "K gesperrt").toBe(401);
      expect(await zugang(s, "L", RAUM_A), "L in A entzogen").toEqual({ anmeldung: 200, betrieb: 403 });
      expect(await zugang(s, "L", RAUM_B), "L in B unberührt").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "N", RAUM_A), "N unberührt").toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Rücksprung auf „vorher“ mit dem Werkzeug (--zustand): K bleibt gesperrt, L bleibt aus A, nichts anderes betroffen", async () => {
    const r = wiederherstellen("vorher", ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/Konto-Widerrufbuch: 1 gesperrte Konten, 1 entzogene Beziehungen/);
    /* Die Ablage selbst ist nachgezogen — mit Feldern, die jede Fassung kennt. */
    expect(await kontoStatus("K")).toBe("gesperrt");
    expect((await mitglied("L", RAUM_A)).status).toBe("entzogen");
    expect((await lauf("L", RAUM_A)).generation).toBe(2);
    expect((await mitglied("L", RAUM_B)).status).toBe("aktiv");
    expect(await kontoStatus("N")).toBe("aktiv");
    expect((await buchRoh()).wiederherstellungen.length).toBe(1);
    const s = await starten();
    try {
      expect((await kontoAnmelden(s, "K")).status, "K nach Rücksprung").toBe(401);
      expect(await zugang(s, "L", RAUM_A), "L in A nach Rücksprung").toEqual({ anmeldung: 200, betrieb: 403 });
      expect(await zugang(s, "L", RAUM_B), "L in B nach Rücksprung").toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "N", RAUM_A), "N nach Rücksprung").toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Gegenprobe: Rücksprung OHNE Zustandsverzeichnis belebt die Ablage — das Buch weist ab, der Start zieht nach", async () => {
    const r = wiederherstellen("vorher");
    expect(r.code, r.aus).toBe(0);
    /* Rot ohne Buch: die Sicherung bringt K und L in A wieder „aktiv“. */
    expect(await kontoStatus("K")).toBe("aktiv");
    expect((await mitglied("L", RAUM_A)).status).toBe("aktiv");
    expect((await lauf("L", RAUM_A)).generation).toBe(1);
    /* Das Buch (außerhalb der Ablage) weist trotzdem ab — genau diese Beziehungen, sonst keine. */
    M.kb.kontowiderrufbuchVergessen();
    const store = centric();
    expect(await M.kb.kontoZugangImBuch(store, K.K.id)).toBe("konto-widerrufen");
    expect(await M.kb.kontoZugangImBuch(store, K.L.id, { raum: RAUM_A, generation: 1 })).toBe("mitglied-widerrufen");
    expect(await M.kb.kontoZugangImBuch(store, K.L.id, { raum: RAUM_B, generation: 1 })).toBeNull();
    expect(await M.kb.kontoZugangImBuch(store, K.N.id, { raum: RAUM_A, generation: 1 })).toBeNull();
    /* Negativ: eine Mitgliedschaft MIT der neuen Generation (Wiederaufnahme) gilt. */
    expect(await M.kb.kontoZugangImBuch(store, K.L.id, { raum: RAUM_A, generation: 2 })).toBeNull();
    const s = await starten();
    try {
      expect(s.log()).toMatch(/Konto-Widerrufbuch: 1 gesperrte Konten, 1 entzogene Beziehungen, 0 aus der Ablage eingesammelt, 2 in der Ablage nachgezogen, 1 Läufe angehoben/);
      expect((await kontoAnmelden(s, "K")).status).toBe(401);
      expect(await zugang(s, "L", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 403 });
      expect(await zugang(s, "L", RAUM_B)).toEqual({ anmeldung: 200, betrieb: 200 });
      expect(await zugang(s, "N", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
    expect(await kontoStatus("K")).toBe("gesperrt");
    expect((await mitglied("L", RAUM_A)).status).toBe("entzogen");
    expect((await lauf("L", RAUM_A)).generation).toBe(2);
  }, LIMIT);

  it("Altbild (Integrationsstand vor BE-1) auf den nachgezogenen Daten: K und L bleiben abgewiesen", async () => {
    const alt = await altStand(ALT_BASIS);
    const s = await starten({ wurzel: alt });
    try {
      expect((await kontoAnmelden(s, "K")).status, "K im Altbild").toBe(401);
      expect(await zugang(s, "L", RAUM_A), "L in A im Altbild").toEqual({ anmeldung: 200, betrieb: 403 });
      expect(await zugang(s, "N", RAUM_A), "N im Altbild").toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s.stoppen(); }
  }, LIMIT);

  it("Harter Abbruch zwischen Ablage und Buch (Entzug und Sperre): der nächste Start trägt nach, Rücksprung bleibt widerrufen", async () => {
    sichern("vor-abbruch");
    const vorher = await buchRoh();
    const e = widerruf("entziehen", "P", RAUM_A, { abbruch: "centric/mitglied%3A" });
    expect(e.signal || e.status, e.aus).not.toBe(0);
    expect(e.aus).toContain("[em6-abbruch] harter Abbruch");
    expect(e.erg, "keine Antwort").toBeNull();
    const sp = widerruf("sperren", "S", "", { abbruch: "centric/account%3A" });
    expect(sp.aus).toContain("[em6-abbruch] harter Abbruch");
    /* Die Ablage ist geschrieben, das Buch nicht. */
    expect((await mitglied("P", RAUM_A)).status).toBe("entzogen");
    expect(await kontoStatus("S")).toBe("gesperrt");
    const zwischen = await buchRoh();
    expect(zwischen.siegel).toBe(vorher.siegel);
    expect(zwischen.mitglieder[M.kb.mitgliedKennung(K.P.id, RAUM_A)]).toBeUndefined();
    expect(zwischen.konten[M.kb.kontoKennung(K.S.id)]).toBeUndefined();
    const s = await starten();
    try {
      expect(s.log()).toMatch(/Konto-Widerrufbuch: 2 gesperrte Konten, 2 entzogene Beziehungen, 2 aus der Ablage eingesammelt/);
    } finally { await s.stoppen(); }
    const nach = await buchRoh();
    expect(nach.mitglieder[M.kb.mitgliedKennung(K.P.id, RAUM_A)].generation).toBe(2);
    expect(nach.konten[M.kb.kontoKennung(K.S.id)]).toBeTruthy();
    /* Rücksprung auf den Stand vor beiden Widerrufen. */
    const r = wiederherstellen("vor-abbruch", ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(0);
    expect((await mitglied("P", RAUM_A)).status).toBe("entzogen");
    expect(await kontoStatus("S")).toBe("gesperrt");
    const s2 = await starten();
    try {
      expect(await zugang(s2, "P", RAUM_A), "P nach Abbruch und Rücksprung").toEqual({ anmeldung: 200, betrieb: 403 });
      expect((await kontoAnmelden(s2, "S")).status, "S nach Abbruch und Rücksprung").toBe(401);
      expect(await zugang(s2, "N", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 200 });
    } finally { await s2.stoppen(); }
  }, LIMIT);

  it("Buch nicht schreibbar: Sperre wirkt trotzdem (widerrufWirksam), Nachtrag in der Ablage, der Start holt nach", async () => {
    const kaputt = path.join(T, "zustand-ist-eine-datei");
    await writeFile(kaputt, "kein Verzeichnis");
    const sp = widerruf("sperren", "U", "", { zustand: kaputt });
    expect(sp.status, sp.aus).toBe(0);
    expect(sp.erg).toEqual({ ok: true, kontobuch: { geschrieben: false }, widerrufWirksam: true });
    expect(await kontoStatus("U")).toBe("gesperrt");
    const n = await ablageLesen(M.kb.KONTOBUCH_NACHTRAG);
    expect(Object.keys(n.konten)).toEqual([M.kb.kontoKennung(K.U.id)]);
    expect((await buchRoh()).konten[M.kb.kontoKennung(K.U.id)]).toBeUndefined();
    const s = await starten();
    try {
      expect((await kontoAnmelden(s, "U")).status).toBe(401);
    } finally { await s.stoppen(); }
    expect((await buchRoh()).konten[M.kb.kontoKennung(K.U.id)]).toBeTruthy();
    expect(existsSync(ablageDatei(M.kb.KONTOBUCH_NACHTRAG)), "Nachtrag abgeräumt").toBe(false);
  }, LIMIT);

  it("Buch manipuliert oder fehlend: fail-closed für Konten (503), Zugangscodes unberührt, Werkzeug fasst nichts an", async () => {
    const kopie = path.join(T, "konto-widerrufe.kopie.json");
    await copyFile(buchDatei(), kopie);
    /* Manipulation ohne Pfeffer: ein Eintrag entfernt (das, was ein Angreifer wollte) — Siegel passt nicht mehr. */
    const b = await buchRoh();
    delete b.konten[M.kb.kontoKennung(K.K.id)];
    await writeFile(buchDatei(), JSON.stringify(b));
    let s = await starten();
    try {
      expect(s.log()).toMatch(/WARNUNG Konto-Widerrufbuch: .*falsches Siegel/);
      expect((await kontoAnmelden(s, "N")).status, "Konto-Anmeldung fail-closed").toBe(503);
      expect((await kontoAnmelden(s, "K")).status, "K fail-closed").not.toBe(200);
      expect(await codeAnmelden(s), "Zugangscode unberührt").toBe(200);
      const g = await (await fetch(`${s.basis}/gesund?detail=1`)).json();
      expect(g.pruefungen.kontowiderrufbuch.stufe).toBe("warnung");
      expect(g.pruefungen.widerrufbuch.stufe).toBe("ok");
    } finally { await s.stoppen(); }
    const vorher = await readFile(ablageDatei(M.accounts.accountSchluessel(K.K.email)), "utf8");
    const r = wiederherstellen("vorher", ["--zustand", ZUSTAND]);
    expect(r.code, r.aus).toBe(2);
    expect(r.aus).toMatch(/Konto-Widerrufbuch .*falsches Siegel/);
    expect(await readFile(ablageDatei(M.accounts.accountSchluessel(K.K.email)), "utf8"), "nichts angefasst").toBe(vorher);
    /* Fehlt bei vorhandenem Anker: ebenso fail-closed; keine stille Neuanlage. */
    await rm(buchDatei());
    s = await starten();
    try {
      expect(s.log()).toMatch(/Konto-Widerrufbuch fehlt, obwohl die Ablage eines kennt/);
      expect((await kontoAnmelden(s, "N")).status).toBe(503);
      expect(await codeAnmelden(s)).toBe(200);
    } finally { await s.stoppen(); }
    expect(existsSync(buchDatei()), "nicht still neu angelegt").toBe(false);
    /* Kopie zurücklegen: alles wie vorher. */
    await copyFile(kopie, buchDatei());
    s = await starten();
    try {
      expect(await zugang(s, "N", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 200 });
      expect((await kontoAnmelden(s, "K")).status).toBe(401);
    } finally { await s.stoppen(); }
    /* Ohne Kopie: bewusster Neuanfang sammelt aus der Ablage (die nachgezogen ist). */
    await rm(buchDatei());
    const neu = werkzeug(["kontowiderrufbuch-neu", "--zustand", ZUSTAND, "--daten", DATEN, "--ohne-serverpruefung"]);
    expect(neu.code, neu.aus).toBe(0);
    const nb = await buchRoh();
    expect(nb.konten[M.kb.kontoKennung(K.K.id)]).toBeTruthy();
    expect(nb.mitglieder[M.kb.mitgliedKennung(K.L.id, RAUM_A)].generation).toBe(2);
    expect(werkzeug(["kontowiderrufbuch-neu", "--zustand", ZUSTAND, "--daten", DATEN, "--ohne-serverpruefung"]).code,
      "ein vorhandenes Buch wird nie ersetzt").toBe(2);
    s = await starten();
    try {
      expect(await zugang(s, "N", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 200 });
      expect((await kontoAnmelden(s, "K")).status).toBe(401);
      expect(await zugang(s, "L", RAUM_A)).toEqual({ anmeldung: 200, betrieb: 403 });
    } finally { await s.stoppen(); }
  }, LIMIT);
});

describe("BE-1: reine Bausteine (nur Einschränkungen, Vereinigung, Erweiterbarkeit)", () => {
  const P1 = "be1-baustein-pfeffer-a7d3e5c1";
  it("einsammeln und eintragen fügen nur hinzu; Mindestgeneration steigt nur", () => {
    const b = M.kb.kontobuchNeu();
    const stand = { konten: [{ schluessel: "account:x", wert: { id: "a_eins", status: "gesperrt" } },
      { schluessel: "account:y", wert: { id: "a_zwei", status: "aktiv" } }],
    laeufe: [{ schluessel: "mitgliedlauf:a_zwei:r-eins", wert: { accountId: "a_zwei", raum: "r-eins", generation: 3 } },
      { schluessel: "mitgliedlauf:a_zwei:r-zwei", wert: { accountId: "a_zwei", raum: "r-zwei", generation: 1 } }],
    mitglieder: [] };
    expect(M.kb.kontobuchEinsammeln(b, stand, { pfeffer: P1 })).toBe(2);
    expect(Object.keys(b.konten)).toEqual([M.kb.kontoKennung("a_eins", P1)]);
    expect(b.mitglieder[M.kb.mitgliedKennung("a_zwei", "r-eins", P1)].generation).toBe(3);
    expect(b.mitglieder[M.kb.mitgliedKennung("a_zwei", "r-zwei", P1)], "ohne Entzug kein Eintrag").toBeUndefined();
    /* Ein älterer Stand (Lauf 2, Konto wieder aktiv) senkt nichts und entfernt nichts. */
    const alt = { konten: [{ schluessel: "account:x", wert: { id: "a_eins", status: "aktiv" } }],
      laeufe: [{ schluessel: "mitgliedlauf:a_zwei:r-eins", wert: { accountId: "a_zwei", raum: "r-eins", generation: 2 } }], mitglieder: [] };
    expect(M.kb.kontobuchEinsammeln(b, alt, { pfeffer: P1 })).toBe(0);
    expect(b.mitglieder[M.kb.mitgliedKennung("a_zwei", "r-eins", P1)].generation).toBe(3);
    expect(Object.keys(b.konten).length).toBe(1);
    /* Normalisieren: nur die betroffenen Datensätze, nichts sonst. */
    const n = M.kb.kontobuchNormalisieren(b, { ...alt, mitglieder: [
      { schluessel: "mitglied:a_zwei:r-eins", wert: { accountId: "a_zwei", raum: "r-eins", status: "aktiv", generation: 2 } },
      { schluessel: "mitglied:a_zwei:r-zwei", wert: { accountId: "a_zwei", raum: "r-zwei", status: "aktiv", generation: 1 } }] },
    { pfeffer: P1, am: "2026-11-14T08:00:00.000Z" });
    expect(n.konten.map((x) => x.wert.status)).toEqual(["gesperrt"]);
    expect(n.laeufe).toEqual([{ schluessel: "mitgliedlauf:a_zwei:r-eins", wert: { accountId: "a_zwei", raum: "r-eins", generation: 3 } }]);
    expect(n.mitglieder.map((x) => [x.schluessel, x.wert.status])).toEqual([["mitglied:a_zwei:r-eins", "entzogen"]]);
  });

  it("Vereinigung zweier Bücher entfernt nie etwas und nimmt das Maximum (Grundlage BE-3)", () => {
    const a = M.kb.kontobuchNeu(); const b = M.kb.kontobuchNeu();
    M.kb.kontenEintragen(a, [M.kb.kontoKennung("a_eins", P1)], "t", "2026-11-01T00:00:00.000Z");
    M.kb.mitgliederEintragen(a, [{ kennung: M.kb.mitgliedKennung("a_zwei", "r", P1), generation: 4 }], "t");
    M.kb.mitgliederEintragen(b, [{ kennung: M.kb.mitgliedKennung("a_zwei", "r", P1), generation: 2 },
      { kennung: M.kb.mitgliedKennung("a_drei", "r", P1), generation: 2 }], "t");
    M.kb.kontobuchVereinen(a, b);
    expect(Object.keys(a.konten).length).toBe(1);
    expect(a.mitglieder[M.kb.mitgliedKennung("a_zwei", "r", P1)].generation).toBe(4);
    expect(a.mitglieder[M.kb.mitgliedKennung("a_drei", "r", P1)].generation).toBe(2);
    expect(a.ids).toContain(b.id);
    expect(() => M.kb.mitgliederEintragen(a, [{ kennung: "kurz", generation: 2 }], "t")).toThrow(/unbekannte Form/);
  });

  it("künftige Abschnitte (BE-2) sind gesiegelt und bleiben erhalten; Veränderung oder anderer Pfeffer fällt auf", async () => {
    const verz = await mkdtemp(path.join(T, "bausteine-"));
    const b = M.kb.kontobuchNeu();
    b.faktoren = { [M.kb.kontoKennung("a_eins", P1)]: { am: "2026-11-14T08:00:00.000Z" } };
    await M.kb.kontobuchSchreiben(verz, b, { pfeffer: P1 });
    const gelesen = await M.kb.kontobuchLesen(verz, { pfeffer: P1 });
    expect(Object.keys(gelesen.faktoren).length).toBe(1);
    await expect(M.kb.kontobuchLesen(verz, { pfeffer: `${P1}-anders` })).rejects.toThrow(/falsches Siegel/);
    const roh = JSON.parse(await readFile(path.join(verz, "konto-widerrufe.json"), "utf8"));
    roh.faktoren = {};
    await writeFile(path.join(verz, "konto-widerrufe.json"), JSON.stringify(roh));
    await expect(M.kb.kontobuchLesen(verz, { pfeffer: P1 })).rejects.toThrow(/falsches Siegel/);
    roh.faktoren = "kein Abschnitt";
    await writeFile(path.join(verz, "konto-widerrufe.json"), JSON.stringify(roh));
    await expect(M.kb.kontobuchLesen(verz, { pfeffer: P1 })).rejects.toThrow(/beschädigt/);
  });
});

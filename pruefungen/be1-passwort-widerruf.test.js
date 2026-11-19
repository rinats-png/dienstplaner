/* ==========================================================================
   BE-1 REST — ABGELÖSTE PASSWÖRTER ÜBERLEBEN KEINEN RÜCKSPRUNG
   (verbindliche Betreiberentscheidung 2026-11-14, Option A; server/lib/kontowiderrufbuch.mjs,
   docs/acc45/ABNAHME-V4-BE1-KONTO-WIDERRUFBUCH.md §8)

     1. Erstes Passwort trägt nichts ein; ein Buch ohne Abschnitt `passwoerter` gilt unverändert (lazy, keine Migration).
     2. Ablösung: Buch bytegenau = Vorher-Buch + genau ein Eintrag (HMAC-Kennung), neu gesiegelt; Konto bytegenau;
        nie Passwort, Prüfwert oder Kontokennung im Buch; gleicher Wert erneut gesetzt → kein Eintrag.
     3. Rücksprung (Ablage trägt wieder den alten Prüfwert): Anmeldung abgewiesen („passwort-abgeloest“), nach außen
        identisch mit falschem Passwort, die Bremse zählt mit.
     4. Start normalisiert: `passwort: null` nur beim betroffenen Konto, alles andere bytegleich.
     5. Buch manipuliert → fail-closed (wirft, HTTP 503).
     6. Buch nicht schreibbar → Änderung wirksam, Nachtrag (ohne Prüfwert), der Start holt nach.
     7. Echtes Werkzeug (sichern / wiederherstellen --zustand) und echter Serverstart: altes Passwort 401, unbeteiligtes
        Konto 200; Gegenprobe ohne --zustand: der Start zieht nach.
     8. Reine Bausteine: Vereinigung (Mengenvereinigung, nie entfernen), Kennung je Konto und Pfeffer, Normalisierung
        mit Sperre zusammen, beschädigter Abschnitt.

   Aufruf: npx vitest run pruefungen/be1-passwort-widerruf.test.js --testTimeout=240000 --hookTimeout=240000
   ========================================================================== */
// zeit-ok: In-Prozess-Teile laufen mit fester Uhr (vi.setSystemTime, nur Date); echte Server- und Werkzeugprozesse
// laufen auf der echten Uhr (Sitzungen, Prozesssperre), ihre Zeitstempel werden nur als ISO-Form geprüft.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 240000;
const PFEFFER = "be1-passwort-pfeffer-nur-zum-pruefen-2b7d41c9";
const PW_ALT = "be1-passwort-alt-nur-zum-pruefen-5521";
const PW_NEU = "be1-passwort-neu-nur-zum-pruefen-8810";
const PW_DREI = "be1-passwort-drei-nur-zum-pruefen-3307";
const PW_VIER = "be1-passwort-vier-nur-zum-pruefen-6402";
const FEST = new Date("2026-11-18T09:30:00.000Z");
const FEST_ISO = FEST.toISOString();
const WIRT = "127.0.0.1:3000";

let T, DATEN, ZUSTAND, STATIK, SICH;
let M;
const K = {};          // Konten: name → { id, email }
const SICHERUNGEN = {};
let zaehler = 0;

const centric = () => M.ablage.getStore({ name: "centric", consistency: "strong" });
const buchDatei = () => path.join(ZUSTAND, "konto-widerrufe.json");
const buchRoh = () => readFile(buchDatei(), "utf8");
const kontoDatei = (name) => path.join(DATEN, "centric", M.ablage.dateiname(M.accounts.accountSchluessel(K[name].email)));
const konto = async (name) => JSON.parse(await readFile(kontoDatei(name), "utf8")).daten;
const anmelden = (name, passwort) => M.an.anmelden(centric(), { email: K[name].email, passwort });

const freierPort = () => new Promise((ok, nein) => {
  const s = createServer(); s.once("error", nein);
  s.listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); });
});
const ip = () => `10.${(randomBytes(1)[0] % 200) + 1}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

/** Eine Anfrage an den echten Handler (wie anmeldung-http.test.js), feste Herkunft möglich. */
async function handlerAnmelden(name, passwort, herkunft) {
  const req = new Request(`http://${WIRT}/api/account/anmelden`, { method: "POST",
    headers: { "x-forwarded-for": herkunft || `10.9.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`, host: WIRT,
      "content-type": "application/json", origin: `http://${WIRT}` },
    body: JSON.stringify({ email: K[name].email, passwort }) });
  const a = await M.handler(req);
  let daten = null; try { daten = await a.clone().json(); } catch { /* leer */ }
  return { status: a.status, daten };
}

async function starten() {
  const port = await freierPort();
  const basis = `http://127.0.0.1:${port}`;
  let log = "";
  const p = spawn(process.execPath, ["server.mjs"], {
    cwd: WURZEL,
    env: { ...process.env, PORT: String(port), CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: ZUSTAND, CENTRIC_STATIK: STATIK,
      CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: "be1-pw-geheim-verwalter-0815", CENTRIC_PFEFFER: PFEFFER,
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
async function httpAnmelden(s, name, passwort) {
  const r = await fetch(`${s.basis}/api/account/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": ip() },
    body: JSON.stringify({ email: K[name].email, passwort }) });
  return r.status;
}
function werkzeug(args) {
  const r = spawnSync(process.execPath, [path.join(WURZEL, "werkzeug", "ablage-sicherung.mjs"), ...args], {
    cwd: WURZEL, encoding: "utf8",
    env: { ...process.env, CENTRIC_PFEFFER: PFEFFER, CENTRIC_DATEN: DATEN, CENTRIC_ZUSTAND: "", NODE_OPTIONS: "" } });
  return { code: r.status, aus: `${r.stdout}\n${r.stderr}` };
}
const sichern = (name) => {
  const r = werkzeug(["sichern", "--quelle", DATEN, "--ziel", path.join(SICH, name), "--ruhe", "0"]);
  expect(r.code, r.aus).toBe(0);
  SICHERUNGEN[name] = /Sicherung vollständig: (.+)/.exec(r.aus)[1].trim();
};
const wiederherstellen = (name, extra = []) =>
  werkzeug(["wiederherstellen", "--sicherung", SICHERUNGEN[name], "--ziel", DATEN, "--ersetzen", "--ohne-serverpruefung", ...extra]);

/** Klartext darf nirgends stehen: Passwörter, Prüfwerte (auch ihr Salz- und Hashteil), Kontokennung, Adresse, Pfeffer. */
function ohneKlartext(roh, { pruefwerte = [], namen = [] } = {}) {
  const geheim = [PW_ALT, PW_NEU, PW_DREI, PW_VIER, PFEFFER];
  for (const p of pruefwerte) { geheim.push(p); for (const teil of p.split("$").filter((x) => x.length >= 16)) geheim.push(teil); }
  for (const n of namen) geheim.push(K[n].id, K[n].email);
  for (const g of geheim) expect(roh, "kein Klartext").not.toContain(g);
}

beforeAll(async () => {
  T = await mkdtemp(path.join(tmpdir(), "centric-be1pw-"));
  DATEN = path.join(T, "daten"); ZUSTAND = path.join(T, "zustand"); STATIK = path.join(T, "statik"); SICH = path.join(T, "sich");
  await mkdir(DATEN, { recursive: true }); await mkdir(STATIK); await mkdir(SICH);
  await writeFile(path.join(STATIK, "index.html"), "<!doctype html><title>BE-1 Passwörter</title>");
  process.env.CENTRIC_DATEN = DATEN; process.env.CENTRIC_ZUSTAND = ZUSTAND; process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  delete process.env.REDIS_REST_URL; delete process.env.REDIS_REST_TOKEN;
  M = {
    ablage: await import("../server/lib/ablage.mjs"),
    accounts: await import("../server/lib/accounts.mjs"),
    passwoerter: await import("../server/lib/passwoerter.mjs"),
    kb: await import("../server/lib/kontowiderrufbuch.mjs"),
    an: await import("../server/lib/accountanmeldung.mjs"),
    handler: (await import("../server/funktionen/anmeldung.mjs")).default,
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FEST);
  const store = centric();
  const pw = await M.passwoerter.passwortAblegen(PW_ALT);
  for (const name of ["K", "N", "W"]) {
    const email = `be1pw-${name.toLowerCase()}-${randomBytes(4).toString("hex")}@example.org`;
    const a = await M.accounts.accountAnlegen(store, { email });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    await M.accounts.emailBestaetigen(store, a.account.id);
    const g = await M.accounts.passwortSetzen(store, a.account.id, pw);
    expect(g.ok).toBe(true);
    expect(g.kontobuch, "erstes Passwort: kein Bucheintrag").toBeUndefined();
    K[name] = { id: a.account.id, email };
  }
  /* Wie der erste Serverstart: Buch und Anker anlegen. */
  await M.kb.kontobuchStart(store);
}, LIMIT);

afterAll(async () => {
  vi.useRealTimers();
  if (T) await rm(T, { recursive: true, force: true });
});

describe("BE-1 Rest: abgelöste Passwörter im Konto-Widerrufbuch", () => {
  let altPruefwert, neuPruefwert, vorherKonto;

  it("erstes Passwort trägt nichts ein; ein Buch ohne Abschnitt gilt unverändert; Sicherung „vorher“", async () => {
    const b = JSON.parse(await buchRoh());
    expect(Object.hasOwn(b, M.kb.PASSWOERTER), "Abschnitt entsteht erst beim ersten Eintrag").toBe(false);
    expect(M.kb.kontobuchPruefen(b)).toBe(b);
    for (const name of ["K", "N", "W"]) expect((await anmelden(name, PW_ALT)).ok, name).toBe(true);
    vi.useRealTimers();
    try { sichern("vorher"); } finally { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(FEST); }
  }, LIMIT);

  it("Ablösung: Buch bytegenau mit genau einer HMAC-Kennung, Konto bytegenau, kein Klartext", async () => {
    const store = centric();
    const vorherBuch = await buchRoh();
    vorherKonto = await konto("K");
    altPruefwert = vorherKonto.passwort;
    neuPruefwert = await M.passwoerter.passwortAblegen(PW_NEU);
    const r = await M.accounts.passwortSetzen(store, K.K.id, neuPruefwert);
    expect(r.ok).toBe(true);
    expect(r.kontobuch).toEqual({ geschrieben: true });
    expect(r.widerrufWirksam).toBeUndefined();
    expect(JSON.stringify(r), "Ergebnis ohne alten Prüfwert").not.toContain(altPruefwert);

    /* Soll: Vorher-Buch + genau dieser Eintrag, neu gesiegelt — Zeichen für Zeichen. */
    const h = M.kb.passwortKennung(K.K.id, altPruefwert);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    const soll = JSON.parse(vorherBuch);
    soll[M.kb.PASSWOERTER] = { [h]: { am: FEST_ISO, grund: "passwort-abgeloest" } };
    soll.siegel = "";
    soll.siegel = M.kb.kontobuchSiegel(soll);
    const roh = await buchRoh();
    expect(roh).toBe(JSON.stringify(soll));
    ohneKlartext(roh, { pruefwerte: [altPruefwert, neuPruefwert], namen: ["K", "N", "W"] });

    /* Konto: bytegenau bis auf die Felder der Änderung. */
    expect(await konto("K")).toEqual({ ...vorherKonto, passwort: neuPruefwert, passwortGeaendert: FEST_ISO,
      epoche: vorherKonto.epoche + 1, aktualisiert: FEST_ISO });

    /* Derselbe Wert erneut: nichts abgelöst, nichts eingetragen. */
    const nochmal = await M.accounts.passwortSetzen(store, K.K.id, neuPruefwert);
    expect(nochmal.ok).toBe(true);
    expect(nochmal.kontobuch).toBeUndefined();
    expect(await buchRoh()).toBe(roh);

    expect((await anmelden("K", PW_NEU)).ok).toBe(true);
    expect((await anmelden("K", PW_ALT)).grund).toBe("passwort");
  }, LIMIT);

  it("Rücksprung (Ablage trägt den alten Prüfwert): abgewiesen wie ein falsches Passwort, die Bremse zählt", async () => {
    const store = centric();
    await store.setJSON(M.accounts.accountSchluessel(K.K.email), vorherKonto);
    M.kb.kontowiderrufbuchVergessen();
    const e = await anmelden("K", PW_ALT);
    expect(e).toEqual({ ok: false, grund: "passwort-abgeloest", hinweis: M.an.HINWEIS_ANMELDUNG });
    /* Unbeteiligt: N mit demselben Klartext, eigenem Prüfwert. */
    expect((await anmelden("N", PW_ALT)).ok).toBe(true);
    /* HTTP: fünfmal abgelöstes Passwort (K) gegen fünfmal falsches Passwort (N), je eigene Herkunft —
       Status und Antwort Schritt für Schritt gleich, und der Zähler der Bremse läuft („Noch 3 Versuche“). */
    const a = [], b = [];
    for (let i = 0; i < 5; i++) {
      a.push(await handlerAnmelden("K", PW_ALT, "10.66.1.1"));
      b.push(await handlerAnmelden("N", "ganz-falsch-nur-zum-pruefen-0000", "10.66.2.2"));
    }
    expect(a).toEqual(b);
    expect(a.every((x) => x.status === 401)).toBe(true);
    expect(JSON.stringify(a[4].daten)).toMatch(/Noch 3 Versuche/);
    ohneKlartext(JSON.stringify(a), { pruefwerte: [altPruefwert, neuPruefwert] });
  }, LIMIT);

  it("Start normalisiert: nur das betroffene Konto bekommt passwort: null, alles andere bleibt bytegleich", async () => {
    const store = centric();
    const nVorher = await readFile(kontoDatei("N"), "utf8");
    const wVorher = await readFile(kontoDatei("W"), "utf8");
    const buchVorher = await buchRoh();
    M.kb.kontowiderrufbuchVergessen();
    const r = await M.kb.kontobuchStart(store);
    expect(r).toMatchObject({ passwoerterImBuch: 1, passwoerterZurueckgesetzt: 1, nachgezogen: 0, eingesammelt: 0 });
    expect(await konto("K")).toEqual({ ...vorherKonto, passwort: null, epoche: vorherKonto.epoche + 1, aktualisiert: FEST_ISO });
    expect(await readFile(kontoDatei("N"), "utf8")).toBe(nVorher);
    expect(await readFile(kontoDatei("W"), "utf8")).toBe(wVorher);
    expect(await buchRoh(), "Buch unverändert").toBe(buchVorher);
    expect((await anmelden("K", PW_ALT)).grund).toBe("ohne-passwort");
    expect((await anmelden("K", PW_NEU)).grund).toBe("ohne-passwort");
    /* Neu setzen (vorher kein Prüfwert): gilt, trägt nichts ein. */
    const g = await M.accounts.passwortSetzen(store, K.K.id, await M.passwoerter.passwortAblegen(PW_DREI));
    expect(g.kontobuch).toBeUndefined();
    expect((await anmelden("K", PW_DREI)).ok).toBe(true);
  }, LIMIT);

  it("Buch manipuliert (Eintrag entfernt): fail-closed — Anmeldung wirft, HTTP 503", async () => {
    const kopie = path.join(T, "konto-widerrufe.kopie.json");
    await copyFile(buchDatei(), kopie);
    const b = JSON.parse(await buchRoh());
    b[M.kb.PASSWOERTER] = {};
    await writeFile(buchDatei(), JSON.stringify(b));
    M.kb.kontowiderrufbuchVergessen();
    await expect(anmelden("K", PW_DREI)).rejects.toMatchObject({ kontobuch: true });
    expect((await handlerAnmelden("K", PW_DREI)).status).toBe(503);
    /* Review MITTEL-2 (M6): Das Buch wird erst NACH dem richtigen Passwort gefragt — ein falsches Passwort bleibt bei
       kaputtem Buch ein falsches Passwort (Grund „passwort“, 401), nur das richtige führt zu 503. */
    expect((await anmelden("K", "ganz-falsch-nur-zum-pruefen-1111")).grund).toBe("passwort");
    expect((await handlerAnmelden("K", "ganz-falsch-nur-zum-pruefen-1111")).status).toBe(401);
    await copyFile(kopie, buchDatei());
    M.kb.kontowiderrufbuchVergessen();
    expect((await anmelden("K", PW_DREI)).ok).toBe(true);
  }, LIMIT);

  it("Buch nicht schreibbar: Änderung wirksam, Nachtrag ohne Prüfwert, der Start holt nach", async () => {
    const store = centric();
    const dreiPruefwert = (await konto("K")).passwort;
    const kaputt = path.join(T, "zustand-ist-eine-datei");
    await writeFile(kaputt, "kein Verzeichnis");
    const vierPruefwert = await M.passwoerter.passwortAblegen(PW_VIER);
    process.env.CENTRIC_ZUSTAND = kaputt;
    let r;
    try {
      M.kb.kontowiderrufbuchVergessen();
      r = await M.accounts.passwortSetzen(store, K.K.id, vierPruefwert);
    } finally { process.env.CENTRIC_ZUSTAND = ZUSTAND; }
    expect(r.ok).toBe(true);
    expect(r.kontobuch).toEqual({ geschrieben: false });
    expect(r.widerrufWirksam).toBe(true);
    expect((await konto("K")).passwort).toBe(vierPruefwert);
    const n = await store.get(M.kb.KONTOBUCH_NACHTRAG, { type: "json" });
    const h = M.kb.passwortKennung(K.K.id, dreiPruefwert);
    expect(Object.keys(n[M.kb.PASSWOERTER])).toEqual([h]);
    ohneKlartext(JSON.stringify(n), { pruefwerte: [dreiPruefwert, vierPruefwert], namen: ["K"] });
    expect(JSON.parse(await buchRoh())[M.kb.PASSWOERTER][h]).toBeUndefined();
    M.kb.kontowiderrufbuchVergessen();
    const s = await M.kb.kontobuchStart(store);
    expect(s.passwoerterImBuch).toBe(2);
    expect(JSON.parse(await buchRoh())[M.kb.PASSWOERTER][h]).toEqual({ am: FEST_ISO, grund: "aus-nachtrag" });
    expect(await store.get(M.kb.KONTOBUCH_NACHTRAG, { type: "json" }), "Nachtrag abgeräumt").toBeNull();
  }, LIMIT);

  it("echtes Werkzeug und echter Server: Rücksprung auf „vorher“ — alte Passwörter 401, unbeteiligtes Konto 200", async () => {
    /* W ändert sein Passwort nach der Sicherung (wie K vorher). */
    const g = await M.accounts.passwortSetzen(centric(), K.W.id, await M.passwoerter.passwortAblegen(PW_NEU));
    expect(g.kontobuch).toEqual({ geschrieben: true });
    const nVorher = await readFile(kontoDatei("N"), "utf8");
    vi.useRealTimers();
    try {
      const r = wiederherstellen("vorher", ["--zustand", ZUSTAND]);
      expect(r.code, r.aus).toBe(0);
      expect(r.aus).toMatch(/Passwörter \(BE-1\): 3 abgelöste im Buch; 2 Konten trugen in der Sicherung ein abgelöstes Passwort/);
      ohneKlartext(r.aus, { pruefwerte: [altPruefwert, neuPruefwert] });
      for (const name of ["K", "W"]) {
        const a = await konto(name);
        expect(a.passwort, `${name} ohne Passwort`).toBeNull();
        expect(a.status).toBe("aktiv");
        expect(a.aktualisiert).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      }
      expect(await readFile(kontoDatei("N"), "utf8"), "N wie in der Sicherung").toBe(nVorher);
      const s = await starten();
      try {
        expect(s.log()).toMatch(/Passwörter: 3 abgelöste im Buch, 0 in der Ablage zurückgesetzt/);
        expect(await httpAnmelden(s, "K", PW_ALT), "K alt").toBe(401);
        expect(await httpAnmelden(s, "W", PW_ALT), "W alt").toBe(401);
        expect(await httpAnmelden(s, "W", PW_NEU), "W neu (kennt der Stand nicht)").toBe(401);
        expect(await httpAnmelden(s, "N", PW_ALT), "N unbeteiligt").toBe(200);
        ohneKlartext(s.log(), { pruefwerte: [altPruefwert, neuPruefwert], namen: ["K", "N", "W"] });
      } finally { await s.stoppen(); }
    } finally { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(FEST); }
  }, LIMIT);

  it("Gegenprobe ohne --zustand: die Sicherung belebt den alten Prüfwert — der Start zieht nach, 401", async () => {
    vi.useRealTimers();
    try {
      const r = wiederherstellen("vorher");
      expect(r.code, r.aus).toBe(0);
      /* Rot ohne Buch: der alte Prüfwert ist zurück. */
      expect((await konto("K")).passwort).toBe(altPruefwert);
      expect((await konto("W")).passwort).toMatch(/^s1\$/);
      const s = await starten();
      try {
        expect(s.log()).toMatch(/Passwörter: 3 abgelöste im Buch, 2 in der Ablage zurückgesetzt/);
        expect(s.log()).toMatch(/WARNUNG Konto-Widerrufbuch: 2 Konto\/Konten trugen ein abgelöstes Passwort/);
        expect(await httpAnmelden(s, "K", PW_ALT)).toBe(401);
        expect(await httpAnmelden(s, "W", PW_ALT)).toBe(401);
        expect(await httpAnmelden(s, "N", PW_ALT)).toBe(200);
      } finally { await s.stoppen(); }
      expect((await konto("K")).passwort).toBeNull();
      expect((await konto("W")).passwort).toBeNull();
      expect(existsSync(buchDatei())).toBe(true);
    } finally { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(FEST); }
  }, LIMIT);
});

describe("BE-1 Rest: Nachbesserung nach Sicherheitsreview (Sitzungen, Passwortbestätigung)", () => {
  const PW_Z1 = "be1-passwort-z1-nur-zum-pruefen-4471";
  const PW_Z2 = "be1-passwort-z2-nur-zum-pruefen-9183";
  let Z;

  beforeAll(async () => {
    M.as = await import("../server/lib/accountsitzungen.mjs");
    M.ein = await import("../server/lib/einladungen.mjs");
    const store = centric();
    const email = `be1pw-z-${randomBytes(4).toString("hex")}@example.org`;
    const a = await M.accounts.accountAnlegen(store, { email });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    await M.accounts.emailBestaetigen(store, a.account.id);
    expect((await M.accounts.passwortSetzen(store, a.account.id, await M.passwoerter.passwortAblegen(PW_Z1))).ok).toBe(true);
    Z = { id: a.account.id, email };
    K.Z = Z;
  }, LIMIT);

  it("Sitzung aus Image-Stand nach Normalisierung wird abgewiesen (Epoche steigt mit passwort: null)", async () => {
    const store = centric();
    M.kb.kontowiderrufbuchVergessen();
    const s = await anmelden("Z", PW_Z1);
    expect(s.ok, JSON.stringify(s)).toBe(true);
    /* Image-Stand: Konto (mit Epoche) und Sitzung — beide kommen mit einem VM-/Verzeichnis-Image zurück. */
    const image = await konto("Z");
    const g = await M.accounts.passwortSetzen(store, Z.id, await M.passwoerter.passwortAblegen(PW_Z2));
    expect(g.kontobuch).toEqual({ geschrieben: true });
    /* Rücksprung: das Konto aus dem Image (alter Prüfwert, alte Epoche); die Sitzung ist nie geprüft worden, liegt also
       noch genau wie im Image. */
    await store.setJSON(M.accounts.accountSchluessel(Z.email), image);
    M.kb.kontowiderrufbuchVergessen();
    const r = await M.kb.kontobuchStart(store);
    expect(r.passwoerterZurueckgesetzt).toBe(1);
    expect(await konto("Z")).toEqual({ ...image, passwort: null, epoche: image.epoche + 1, aktualisiert: FEST_ISO });
    expect(await M.an.sitzungPruefen(store, s.token)).toEqual({ ok: false, grund: "epoche", hinweis: M.an.HINWEIS_SITZUNG });
  }, LIMIT);

  it("Sitzung eines Kontos ohne Prüfwert gilt nicht (auch bei passender Epoche)", async () => {
    const store = centric();
    const a = await konto("Z");
    expect(a.passwort).toBeNull();
    const t = await M.as.accountSitzungAnlegen({ accountId: Z.id, epoche: a.epoche });
    expect(t.ok).toBe(true);
    expect(await M.an.sitzungPruefen(store, t.token)).toEqual({ ok: false, grund: "ohne-passwort", hinweis: M.an.HINWEIS_SITZUNG });
  }, LIMIT);

  it("Passwortbestätigung (einladungen.frischeBestaetigung) weist einen abgelösten Prüfwert ab — 403 wie falsch", async () => {
    const store = centric();
    /* Frischer Stand: Z setzt PW_Z1 (kein Prüfwert vorher → kein Eintrag), dann PW_Z2 (PW_Z1 wird abgelöst). */
    expect((await M.accounts.passwortSetzen(store, Z.id, await M.passwoerter.passwortAblegen(PW_Z1))).kontobuch).toBeUndefined();
    const z1 = await konto("Z");
    expect((await M.accounts.passwortSetzen(store, Z.id, await M.passwoerter.passwortAblegen(PW_Z2))).kontobuch)
      .toEqual({ geschrieben: true });
    const bestaetigen = (passwort) => M.ein.frischeBestaetigung(store, { sitzung: { herkunft: { accountId: Z.id } },
      bestaetigung: { passwort }, env: {} });
    expect(await bestaetigen(PW_Z2)).toEqual({ ok: true, art: "passwort" });
    /* Rücksprung: der abgelöste Prüfwert ist zurück. */
    await store.setJSON(M.accounts.accountSchluessel(Z.email), z1);
    M.kb.kontowiderrufbuchVergessen();
    const alt = await bestaetigen(PW_Z1);
    const falsch = await bestaetigen("ganz-falsch-nur-zum-pruefen-2222");
    expect(alt).toMatchObject({ ok: false, status: 403, bestaetigung: "passwort" });
    expect(alt).toEqual(falsch);
  }, LIMIT);
});

describe("BE-1 Rest: reine Bausteine", () => {
  const h = (c) => c.repeat(64);

  it("Vereinigung: Mengenvereinigung der abgelösten Prüfwerte, entfernt nie etwas (auch aus einem Buch ohne Abschnitt)", () => {
    const ziel = M.kb.kontobuchNeu();
    const quelle = M.kb.kontobuchNeu();
    ziel[M.kb.PASSWOERTER] = { [h("a")]: { am: FEST_ISO, grund: "passwort-abgeloest" } };
    quelle[M.kb.PASSWOERTER] = { [h("a")]: { am: "2026-01-01T00:00:00.000Z", grund: "x" }, [h("b")]: { am: FEST_ISO, grund: "passwort-abgeloest" } };
    expect(M.kb.kontobuchVereinen(ziel, quelle)).toBe(1);
    expect(ziel[M.kb.PASSWOERTER]).toEqual({ [h("a")]: { am: FEST_ISO, grund: "passwort-abgeloest" },
      [h("b")]: { am: FEST_ISO, grund: "passwort-abgeloest" } });
    /* Älteres Buch ohne Abschnitt als Quelle: nichts geht verloren. */
    expect(M.kb.kontobuchVereinen(ziel, M.kb.kontobuchNeu())).toBe(0);
    expect(Object.keys(ziel[M.kb.PASSWOERTER]).sort()).toEqual([h("a"), h("b")]);
    /* Umgekehrt: ein Buch ohne Abschnitt nimmt ihn vollständig auf. */
    const leer = M.kb.kontobuchNeu();
    M.kb.kontobuchVereinen(leer, ziel);
    expect(leer[M.kb.PASSWOERTER]).toEqual(ziel[M.kb.PASSWOERTER]);
  });

  it("Kennung: HMAC je Konto und Pfeffer, nie der Prüfwert; Nachtrag trägt den Abschnitt", () => {
    const pw = "s1$16384$8$1$c2FsenNhbHpzYWx6c2FsenM$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";
    const a = M.kb.passwortKennung("konto-a", pw, "pfeffer-eins");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(M.kb.passwortKennung("konto-a", pw, "pfeffer-eins")).toBe(a);
    expect(M.kb.passwortKennung("konto-b", pw, "pfeffer-eins"), "anderes Konto").not.toBe(a);
    expect(M.kb.passwortKennung("konto-a", pw, "pfeffer-zwei"), "anderer Pfeffer").not.toBe(a);
    expect(M.kb.passwortKennung("konto-a", `${pw}x`, "pfeffer-eins"), "anderer Prüfwert").not.toBe(a);
    expect(M.kb.nachtragTeile({ [M.kb.PASSWOERTER]: { [a]: {}, kaputt: {} } })[M.kb.PASSWOERTER]).toEqual([a]);
    const b = M.kb.kontobuchNeu();
    expect(M.kb.kontobuchEinsammeln(b, { konten: [], mitglieder: [], laeufe: [],
      nachtrag: { [M.kb.PASSWOERTER]: { [a]: {} } } }, { pfeffer: "pfeffer-eins" })).toBe(1);
    expect(Object.keys(b[M.kb.PASSWOERTER])).toEqual([a]);
  });

  it("Normalisieren: Sperre und abgelöstes Passwort in einem Eintrag; Konten ohne Prüfwert oder fremde bleiben", () => {
    const pf = "pfeffer-normal";
    const pwX = "s1$16384$8$1$eHh4eHh4eHh4eHh4eHh4eA$eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg";
    const pwY = "s1$16384$8$1$eXl5eXl5eXl5eXl5eXl5eQ$eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXk";
    const b = M.kb.kontobuchNeu();
    M.kb.kontenEintragen(b, [M.kb.kontoKennung("a1", pf)], "konto-gesperrt", FEST_ISO);
    M.kb.abschnittEintragen(b, M.kb.PASSWOERTER, [M.kb.passwortKennung("a1", pwX, pf), M.kb.passwortKennung("a2", pwX, pf)],
      "passwort-abgeloest", FEST_ISO);
    const stand = { mitglieder: [], laeufe: [], konten: [
      { schluessel: "account:a1", wert: { id: "a1", status: "aktiv", passwort: pwX } },
      { schluessel: "account:a2", wert: { id: "a2", status: "aktiv", passwort: pwY } },   // anderer (neuer) Prüfwert
      { schluessel: "account:a3", wert: { id: "a3", status: "aktiv", passwort: null } },
      { schluessel: "account:a4", wert: { id: "a4", status: "aktiv", passwort: pwX } },   // gleicher Wert, anderes Konto
    ] };
    const n = M.kb.kontobuchNormalisieren(b, stand, { pfeffer: pf, am: FEST_ISO });
    expect(n.konten).toEqual([{ schluessel: "account:a1",
      wert: { id: "a1", status: "gesperrt", passwort: null, epoche: 2, aktualisiert: FEST_ISO } }]);
    expect({ gesperrt: n.gesperrt, passwoerter: n.passwoerter }).toEqual({ gesperrt: 1, passwoerter: 1 });
    expect(M.kb.passwortZahlen(b, n)).toEqual({ passwoerterImBuch: 2, passwoerterZurueckgesetzt: 1 });
  });

  it("Gestalt: ein beschädigter Abschnitt macht das Buch unprüfbar; ein unbekannter Abschnittsname wird nicht eingetragen", () => {
    const b = M.kb.kontobuchNeu();
    b[M.kb.PASSWOERTER] = { "kein-hex": { am: FEST_ISO } };
    b.siegel = M.kb.kontobuchSiegel(b, "p");
    expect(() => M.kb.kontobuchPruefen(b, "p")).toThrow(/beschädigt/);
    expect(() => M.kb.abschnittEintragen(M.kb.kontobuchNeu(), "passwort", [h("c")], "x")).toThrow(/Unbekannter Abschnitt/);
    expect(() => M.kb.abschnittEintragen(M.kb.kontobuchNeu(), M.kb.PASSWOERTER, ["s1$roh"], "x")).toThrow(/unbekannte Form/);
  });
});

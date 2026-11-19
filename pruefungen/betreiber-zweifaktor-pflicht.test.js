/* ==========================================================================
   WP-32d — Betreiber-2FA verpflichtend in der Auslieferung

   Prüft: Pflicht-Schalter (NODE_ENV=production oder Option), fehlende
   Einrichtung, falscher Code, Wiederholung, Bremse, Überschreibschutz und die
   Offline-Wiederherstellung (lib und Werkzeug). Rot auf dem Stand vor WP-32d:
   unter NODE_ENV=production bekam ein Betreibercode ohne Faktor eine Sitzung.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, mkdir, rm, readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

vi.setConfig({ testTimeout: 60_000 });

const WURZEL_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 6, 9, 0, 15);
const PFEFFER = "pfeffer-pflicht-0123456789abcdef";
let wurzel, laden, daten, schutz, Z, K, C, S;
let nr = 0;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const code = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);
const bremseId = (c) => `b:${Z.betreiberZweifaktorId(C.ablageSchluessel(c)).slice(0, 16)}`;

const anmelden = async (rumpf, xff) => {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      "x-forwarded-for": xff || `10.66.${Math.floor(nr / 250)}.${nr % 250}` },
    body: JSON.stringify(rumpf) }), {});
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, ...d };
};
const konto = async (c, rolle, schluessel) => K.kontoSchreiben(laden(), schluessel || C.ablageSchluessel(c),
  { name: `Probe ${rolle}`, bestand: "betreiber-probe", rolle, person: null, betrieb: 0, mandantId: null,
    angelegt: "2026-01-01T00:00:00.000Z" });

/** Betreibercode anlegen, Faktor einrichten und bestätigen. */
async function einrichten(c) {
  await konto(c, "betreiber");
  const b = await anmelden({ zugangscode: c, zweifaktorAktion: "beginnen" });
  expect(b.geheimnis, b.roh).toBeTruthy();
  uhr(jetzt + 30_000);
  const f = await anmelden({ zugangscode: c, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
  expect(f.status, f.roh).toBe(200);
  return { geheimnis: b.geheimnis, wiederherstellung: f.wiederherstellung };
}

/** Alle Dateitexte unter d. Die Ablage räumt beiläufig alte Bremsfenster weg (schutz.mjs, alteFensterRaeumen,
    ohne Warten, bei 2 % der Aufrufe); ein Eintrag kann zwischen readdir und readFile verschwinden. Das ist
    kein Fehler der Spur: eine verschwundene Datei trägt keinen Text mehr. Nur ENOENT wird übergangen. */
async function alleTexte(d) {
  const fehlt = (e) => e && e.code === "ENOENT";
  let eintraege;
  try { eintraege = await readdir(d, { withFileTypes: true }); } catch (e) { if (fehlt(e)) return ""; throw e; }
  let t = "";
  for (const e of eintraege) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { t += await alleTexte(p); continue; }
    try { t += await readFile(p, "utf8"); } catch (x) { if (!fehlt(x)) throw x; }
  }
  return t;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-betreiber-pflicht-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  schutz.GRENZEN.anmelden = { ...schutz.GRENZEN.anmelden, versuche: 100000 };
  schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  K = await import("../server/lib/konten.mjs");
  C = await import("../server/lib/codes.mjs");
  Z = await import("../server/lib/betreiber-zweifaktor.mjs");
  S = await import("../server/lib/sitzungen.mjs");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

describe("Schalter betreiberPflicht", () => {
  it("production = Pflicht, Option 1 = Pflicht, aus nur unter development/test", () => {
    expect(Z.betreiberPflicht({ NODE_ENV: "production" })).toBe(true);
    expect(Z.betreiberPflicht({ NODE_ENV: " Production " })).toBe(true);
    expect(Z.betreiberPflicht({ CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT: "1" })).toBe(true);
    expect(Z.betreiberPflicht({ NODE_ENV: "test", CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT: "1" })).toBe(true);
    expect(Z.betreiberPflicht({ NODE_ENV: "test" })).toBe(false);
    expect(Z.betreiberPflicht({ NODE_ENV: "development" })).toBe(false);
    expect(Z.betreiberPflicht({ NODE_ENV: "development", CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT: "0" })).toBe(false);
    /* WP-32d (Nachtrag): fehlende, leere oder unbekannte NODE_ENV ist KEINE Entwicklung — Pflicht (fail-closed). */
    expect(Z.betreiberPflicht({})).toBe(true);
    expect(Z.betreiberPflicht({ CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT: "0" })).toBe(true);
  });
  it("in der Auslieferung lässt sich die Pflicht NICHT abstellen (fail-closed)", () => {
    for (const w of ["0", "aus", "", "false", "nein", "2"])
      expect(Z.betreiberPflicht({ NODE_ENV: "production", CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT: w }), w).toBe(true);
  });
  it("das Docker-Image setzt NODE_ENV=production", async () => {
    const d = await readFile(path.join(WURZEL_REPO, "Dockerfile"), "utf8");
    expect(d).toMatch(/NODE_ENV=production/);
  });
});

describe("Auslieferung (NODE_ENV=production)", () => {
  const A = "PROD-PFLI-CHT1";
  let f;
  it("Pflicht aus (NODE_ENV=test): Betreibercode ohne Faktor bekommt wie bisher eine Sitzung", async () => {
    await konto("PROD-TEST-AUS0", "betreiber");
    const a = await anmelden({ zugangscode: "PROD-TEST-AUS0" });
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeTruthy();
  });

  it("Pflicht an: fehlende Einrichtung -> 403, keine Sitzung, nur die Einrichtungsaktionen", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await konto(A, "betreiber");
    const ohne = await anmelden({ zugangscode: A });
    expect(ohne.status).toBe(403);
    expect(ohne.zweifaktor).toBe("einrichten");
    expect(ohne.token).toBeUndefined();
    expect(await anmelden({ zugangscode: A, zweifaktorAktion: "stand" })).toMatchObject({ aktiv: false, pflicht: true });
    /* Ein Code ohne eingerichteten Faktor ändert nichts. */
    const falsch = await anmelden({ zugangscode: A, zweifaktor: "123456" });
    expect(falsch.token).toBeUndefined();
    expect(falsch.status).toBe(403);
  });

  it("andere Rollen bleiben in der Auslieferung unberührt", async () => {
    await konto("PROD-LEIT-UNG2", "leitung");
    const a = await anmelden({ zugangscode: "PROD-LEIT-UNG2" });
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeTruthy();
  });

  it("Einrichten und Bestätigen funktionieren; danach Anmeldung nur mit Code", async () => {
    const b = await anmelden({ zugangscode: A, zweifaktorAktion: "beginnen" });
    expect(b.status, b.roh).toBe(200);
    expect(b.token).toBeUndefined();
    uhr(jetzt + 30_000);
    const fest = await anmelden({ zugangscode: A, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
    expect(fest.status, fest.roh).toBe(200);
    f = { geheimnis: b.geheimnis, wiederherstellung: fest.wiederherstellung };
    const ohne = await anmelden({ zugangscode: A });
    expect(ohne.status).toBe(401);
    expect(ohne.token).toBeUndefined();
    uhr(jetzt + 30_000);
    const mit = await anmelden({ zugangscode: A, zweifaktor: code(f.geheimnis) });
    expect(mit.status, mit.roh).toBe(200);
    expect(mit.token).toBeTruthy();
  });

  it("falscher Code: 401 ohne Sitzung; Wiederholung desselben Codes: 401", async () => {
    uhr(jetzt + 30_000);
    const falsch = await anmelden({ zugangscode: A, zweifaktor: "000000" });
    expect(falsch.status).toBe(401);
    expect(falsch.token).toBeUndefined();
    const c = code(f.geheimnis);
    const erst = await anmelden({ zugangscode: A, zweifaktor: c });
    expect(erst.status, erst.roh).toBe(200);
    const nochmal = await anmelden({ zugangscode: A, zweifaktor: c });
    expect(nochmal.status).toBe(401);
    expect(nochmal.token).toBeUndefined();
  });

  it("Rateversuche aus vielen Herkünften werden gebremst, danach scheitert auch der richtige Code", async () => {
    await schutz.entlasten("zweifaktor", bremseId(A));
    uhr(jetzt + 30_000);
    const st = [];
    for (let i = 0; i < 9; i++) st.push((await anmelden({ zugangscode: A, zweifaktor: "111111" }, `10.77.0.${i}`)).status);
    expect(st).toContain(429);
    const richtig = await anmelden({ zugangscode: A, zweifaktor: code(f.geheimnis) }, "10.77.9.9");
    expect(richtig.status).toBe(429);
    expect(richtig.token).toBeUndefined();
    await schutz.entlasten("zweifaktor", bremseId(A));
  }, 30_000);

  it("Überschreiben einer begonnenen Einrichtung durch den Code allein: verweigert (409), Geheimnis bleibt", async () => {
    const B = "PROD-UEBE-RSCH3";
    await konto(B, "betreiber");
    const b1 = await anmelden({ zugangscode: B, zweifaktorAktion: "beginnen" });
    expect(b1.geheimnis).toBeTruthy();
    const b2 = await anmelden({ zugangscode: B, zweifaktorAktion: "beginnen" });
    expect(b2.status).toBe(409);
    expect(b2.geheimnis).toBeUndefined();
    uhr(jetzt + 30_000);
    const fest = await anmelden({ zugangscode: B, zweifaktorAktion: "bestaetigen", zweifaktor: code(b1.geheimnis) });
    expect(fest.status, fest.roh).toBe(200);
  });

  it("ohne CENTRIC_PFEFFER: fail-closed — keine Sitzung, keine Einrichtung (503)", async () => {
    const alt = "PROD-OHNE-PFEF4";
    delete process.env.CENTRIC_PFEFFER;
    try {
      await konto(alt, "betreiber", C.altHash(alt));
      const a = await anmelden({ zugangscode: alt });
      expect(a.token).toBeUndefined();
      expect(a.status).toBe(403);
      const b = await anmelden({ zugangscode: alt, zweifaktorAktion: "beginnen" });
      expect(b.status).toBe(503);
      expect(b.geheimnis).toBeUndefined();
    } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
  });

  it("zurück auf NODE_ENV=test: Pflicht wieder aus (kein Zustand bleibt hängen)", async () => {
    vi.unstubAllEnvs();
    await konto("PROD-NACH-HER5", "betreiber");
    expect((await anmelden({ zugangscode: "PROD-NACH-HER5" })).status).toBe(200);
  });
});

describe("Offline-Wiederherstellung", () => {
  const R = "REC0-VERY-CODE";
  it("Verlust von Authenticator und Wiederherstellungscodes: Zurücksetzen -> alte Faktoren und Sitzungen wertlos, neue Einrichtung offen", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const alt = await einrichten(R);
    uhr(jetzt + 30_000);
    const sitz = await anmelden({ zugangscode: R, zweifaktor: code(alt.geheimnis) });
    expect(sitz.token).toBeTruthy();

    const r = await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: R });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.sitzungenBeendet).toBeGreaterThanOrEqual(1);
    expect(r.geheimnis).toMatch(/^[A-Z2-7]{32}$/);
    expect(r.geheimnis).not.toBe(alt.geheimnis);

    /* Die Sitzungen dieses Codes sind weg. */
    const sp = S.sitzungsSpeicher();
    let uebrig = 0;
    for (const b of (await sp.list({ prefix: "t:" })).blobs) {
      const s = await sp.get(b.key, { type: "json" });
      if (s && s.konto === C.ablageSchluessel(R)) uebrig += 1;
    }
    expect(uebrig).toBe(0);
    /* Alter Authenticator, Wiederherstellungscodes: nichts geht mehr. */
    uhr(jetzt + 30_000);
    expect((await anmelden({ zugangscode: R, zweifaktor: code(alt.geheimnis) })).token).toBeUndefined();
    for (const w of alt.wiederherstellung.slice(0, 2))
      expect((await anmelden({ zugangscode: R, zweifaktor: w })).token).toBeUndefined();
    /* Der Code allein bleibt gesperrt; ein Dritter mit dem Code kann die Einrichtung nicht ersetzen. */
    expect((await anmelden({ zugangscode: R })).status).toBe(403);
    const dieb = await anmelden({ zugangscode: R, zweifaktorAktion: "beginnen" });
    expect(dieb.status).toBe(409);
    expect(dieb.geheimnis).toBeUndefined();
    /* Bestätigen mit dem Offline-Geheimnis: neue Wiederherstellungscodes, Anmeldung geht. */
    await schutz.entlasten("zweifaktor", bremseId(R));
    uhr(jetzt + 30_000);
    const fest = await anmelden({ zugangscode: R, zweifaktorAktion: "bestaetigen", zweifaktor: code(r.geheimnis) });
    expect(fest.status, fest.roh).toBe(200);
    expect(fest.wiederherstellung).toHaveLength(10);
    expect(fest.wiederherstellung).not.toEqual(alt.wiederherstellung);
    uhr(jetzt + 30_000);
    const neu = await anmelden({ zugangscode: R, zweifaktor: code(r.geheimnis) });
    expect(neu.status, neu.roh).toBe(200);
    expect(neu.token).toBeTruthy();
  });

  it("falscher Code, Nicht-Betreiber, gesperrter Code, fehlender Pfeffer: abgelehnt, Faktor bleibt", async () => {
    const G = "REC0-GOOD-CODE";
    const g = await einrichten(G);
    expect((await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: "FALS-CHER-CODE" })).ok).toBe(false);
    expect((await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: "" })).ok).toBe(false);
    await konto("REC0-LEIT-UNG1", "leitung");
    expect((await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: "REC0-LEIT-UNG1" })).ok).toBe(false);
    await K.kontoSchreiben(laden(), C.ablageSchluessel("REC0-GESP-ERRT"), { name: "x", bestand: "betreiber-probe",
      rolle: "betreiber", gesperrt: true, angelegt: "2026-01-01T00:00:00.000Z" });
    expect((await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: "REC0-GESP-ERRT" })).ok).toBe(false);
    delete process.env.CENTRIC_PFEFFER;
    try { expect((await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: G })).ok).toBe(false); }
    finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
    uhr(jetzt + 30_000);
    const a = await anmelden({ zugangscode: G, zweifaktor: code(g.geheimnis) });
    expect(a.status, a.roh).toBe(200);
  });

  it("kein Standardgeheimnis: zwei Zurücksetzungen -> zwei verschiedene Geheimnisse", async () => {
    const X = "REC0-ZWEI-MAL3";
    await einrichten(X);
    const r1 = await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: X });
    const r2 = await Z.betreiberZweifaktorZuruecksetzen({ store: laden(), code: X });
    expect(r1.ok && r2.ok).toBe(true);
    expect(r1.geheimnis).not.toBe(r2.geheimnis);
  });

  it("Werkzeug: ohne --ja, ohne Pfeffer, ohne Code, mit falschem Code, mit belegter Ablage -> Ausgang 1; sonst 0 mit Geheimnis", async () => {
    const Y = "REC0-WERK-ZEUG";
    await einrichten(Y);
    const skript = path.join(WURZEL_REPO, "werkzeug", "betreiber-2fa-zuruecksetzen.mjs");
    const lauf = (args, eingabe, env = {}) => spawnSync(process.execPath, [skript, ...args], { input: eingabe,
      encoding: "utf8", env: { PATH: process.env.PATH, CENTRIC_DATEN: wurzel, CENTRIC_ABLAGE: "dateien",
        CENTRIC_PFEFFER: PFEFFER, ...env } });
    expect(lauf([], `${Y}\n`).status).toBe(1);
    expect(lauf(["--ja"], `${Y}\n`, { CENTRIC_PFEFFER: "" }).status).toBe(1);
    expect(lauf(["--ja"], "").status).toBe(1);
    expect(lauf(["--ja"], "FALS-CHER-CODE\n").status).toBe(1);
    /* Belegte Ablage (laufender Server): Abbruch. */
    const sperre = path.join(wurzel, ".prozess");
    await writeFile(sperre, JSON.stringify({ pid: process.pid, start: "x", rechner: "anderer-rechner" }));
    const belegt = lauf(["--ja"], `${Y}\n`);
    await unlink(sperre);
    expect(belegt.status, belegt.stdout).toBe(1);
    expect(belegt.stdout).not.toMatch(/[A-Z2-7]{32}/);

    const ok = lauf(["--ja"], `${Y}\n`);
    expect(ok.status, ok.stderr).toBe(0);
    const geh = /\n {2}([A-Z2-7]{32})\n/.exec(ok.stdout);
    expect(geh, ok.stdout).toBeTruthy();
    expect(ok.stdout).not.toContain(Y);
    uhr(jetzt + 30_000);
    const fest = await anmelden({ zugangscode: Y, zweifaktorAktion: "bestaetigen", zweifaktor: code(geh[1]) });
    expect(fest.status, fest.roh).toBe(200);
    expect((await readdir(wurzel)).includes(".prozess")).toBe(false);
  });
});

describe("Vorlauf für Prüfläufe (werkzeug/betreiber-faktor-vorlauf.mjs)", () => {
  it("richtet den Faktor über die API ein, meldet an, merkt den Token je Code, verwirft ihn beim Abmelden — greift nur bei 403 einrichten", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const echt = globalThis.fetch;
    const rufe = (url, opts) => daten(new Request(url, { ...opts, headers: { ...(opts && opts.headers), host: WIRT,
      origin: `http://${WIRT}` } }), {});
    globalThis.fetch = rufe;
    delete globalThis.__betreiberFaktorVorlauf;
    try {
      await import("../werkzeug/betreiber-faktor-vorlauf.mjs?probe");
      const V = "VORL-AUF0-CODE";
      await konto(V, "betreiber");
      const kopf = { "content-type": "application/json", "x-forwarded-for": "10.99.0.1" };
      const login = () => globalThis.fetch(`http://${WIRT}/api/anmelden`, { method: "POST", headers: kopf, body: JSON.stringify({ zugangscode: V }) });
      const a = await login();
      expect(a.status).toBe(200);
      const d = await a.json();
      expect(d.token).toBeTruthy();
      expect(await (await login()).json()).toMatchObject({ token: d.token });            // aus dem Gedächtnis
      /* Der Server verlangt den Faktor weiterhin: ein Aufruf an der Vorlauf-Kappe vorbei bekommt 401. */
      const roh = await rufe(`http://${WIRT}/api/anmelden`, { method: "POST", headers: kopf, body: JSON.stringify({ zugangscode: V }) });
      expect(roh.status).toBe(401);
      await globalThis.fetch(`http://${WIRT}/api/abmelden`, { method: "POST", headers: { ...kopf, authorization: `Bearer ${d.token}` }, body: "{}" });
      const neu = await login();                                                        // Gedächtnis verworfen → Server verlangt den Code
      expect(neu.status).toBe(401);
      /* Ein Fremdcode und ein Nicht-Betreiber werden nicht angefasst. */
      const falsch = await globalThis.fetch(`http://${WIRT}/api/anmelden`, { method: "POST", headers: kopf, body: JSON.stringify({ zugangscode: "NICH-TDA-CODE" }) });
      expect(falsch.status).toBe(401);
      await konto("VORL-LEIT-UNG1", "leitung");
      const l = await globalThis.fetch(`http://${WIRT}/api/anmelden`, { method: "POST", headers: kopf, body: JSON.stringify({ zugangscode: "VORL-LEIT-UNG1" }) });
      expect(l.status).toBe(200);
    } finally { globalThis.fetch = echt; delete globalThis.__betreiberFaktorVorlauf; vi.unstubAllEnvs(); }
  });
});

describe("Spurensuche im Datenordner (Race gegen das Wegräumen alter Bremsfenster)", () => {
  it("alleTexte übersteht Dateien, die zwischen Auflisten und Lesen verschwinden, und liest den Rest", async () => {
    const d = path.join(wurzel, "spur-probe");
    await mkdir(d, { recursive: true });
    const namen = Array.from({ length: 300 }, (_, i) => `v%3Aanmelden%3Aziel%3Aprobe%3A${i}.json`);
    await Promise.all(namen.map((n) => writeFile(path.join(d, n), "x")));
    await writeFile(path.join(d, "bleibt.json"), "BLEIBT");
    const lesen = alleTexte(d);                                           // listet zuerst ...
    await new Promise((r) => setTimeout(r, 0));
    const weg = Promise.all(namen.map((n) => unlink(path.join(d, n))));   // ... dann räumt es gleichzeitig weg, wie alteFensterRaeumen
    const text = await lesen;
    await weg;
    expect(text).toContain("BLEIBT");
    await rm(d, { recursive: true, force: true });
  });
});

describe("Review-Nachträge WP-32d", () => {
  it("1. Verwalterschlüssel: in production ohne Flag Pflicht — /einrichten (Anlegen eines Betreibercodes) verlangt zuerst den Faktor; /einrichten/zweifaktor bleibt offen", async () => {
    const einrichten = (await import("../server/funktionen/einrichten.mjs")).default;
    process.env.CENTRIC_ADMIN = "pruef-admin-schluessel";
    delete process.env.CENTRIC_ZWEIFAKTOR_PFLICHT;
    const post = (pfad, rumpf) => einrichten(new Request(`http://${WIRT}/einrichten${pfad}`, { method: "POST",
      headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", "x-forwarded-for": `10.55.${nr++ % 250}.1` },
      body: JSON.stringify({ verwaltung: "pruef-admin-schluessel", ...rumpf }) }));
    const neuerCode = { name: "Konsole", bestand: "r-verwalter", rolle: "betreiber", person: null, betrieb: 0 };
    try {
      vi.stubEnv("NODE_ENV", "test");
      const test = await post("", neuerCode);
      expect(test.status).not.toBe(403);                         // Entwicklung: wie bisher
      vi.stubEnv("NODE_ENV", "production");
      const prod = await post("", neuerCode);
      expect(prod.status).toBe(403);
      expect((await prod.json()).zweifaktor).toBe("einrichten");
      const b = await (await post("/zweifaktor", { aktion: "beginnen" })).json();
      expect(b.geheimnis).toBeTruthy();
    } finally { delete process.env.CENTRIC_ADMIN; vi.unstubAllEnvs(); }
  });

  it("2. Abschalten unter Pflicht: 409, der Faktor bleibt, auch mit gültigem Code", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const AB = "REV2-ABSC-HALT";
      const f = await einrichten(AB);
      uhr(jetzt + 30_000);
      const r = await anmelden({ zugangscode: AB, zweifaktorAktion: "abschalten", zweifaktor: code(f.geheimnis) });
      expect(r.status).toBe(409);
      expect(r.zweifaktor).toBe("pflicht");
      expect((await anmelden({ zugangscode: AB })).status).toBe(401);       // Faktor gilt weiter
      uhr(jetzt + 30_000);
      expect((await anmelden({ zugangscode: AB, zweifaktor: code(f.geheimnis) })).status).toBe(200);
      /* Ohne Pflicht (Entwicklung) bleibt Abschalten möglich. */
      vi.stubEnv("NODE_ENV", "test");
      uhr(jetzt + 30_000);
      const ab2 = await anmelden({ zugangscode: AB, zweifaktorAktion: "abschalten", zweifaktor: code(f.geheimnis) });
      expect(ab2.status, ab2.roh).toBe(200);
    } finally { vi.unstubAllEnvs(); }
  });

  it("3. Eine begonnene Einrichtung verfällt nach 15 Minuten; vorher 409, danach neu beginnen", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const EV = "REV3-VERF-ALL";
      await konto(EV, "betreiber");
      const b1 = await anmelden({ zugangscode: EV, zweifaktorAktion: "beginnen" });
      expect(b1.geheimnis).toBeTruthy();
      uhr(jetzt + 14 * 60_000);
      expect((await anmelden({ zugangscode: EV, zweifaktorAktion: "beginnen" })).status).toBe(409);
      uhr(jetzt + 2 * 60_000);                                                // 16 Minuten nach dem Beginn
      const spaet = await anmelden({ zugangscode: EV, zweifaktorAktion: "bestaetigen", zweifaktor: code(b1.geheimnis) });
      expect(spaet.status).toBe(409);                                         // keine Einrichtung mehr offen
      expect(spaet.wiederherstellung).toBeUndefined();
      const b2 = await anmelden({ zugangscode: EV, zweifaktorAktion: "beginnen" });
      expect(b2.status, b2.roh).toBe(200);
      expect(b2.geheimnis).not.toBe(b1.geheimnis);
      const spur = await alleTexte(wurzel);
      expect(spur).toMatch(/Überschreiben einer begonnenen Einrichtung verweigert/);
    } finally { vi.unstubAllEnvs(); }
  });

  it("4. Start in production beendet Betreibersitzungen ohne Faktor, nicht die mit Faktor und nicht andere Rollen", async () => {
    const E = "REV4-MIT-FAKTOR";
    const f = await einrichten(E);
    expect(f.geheimnis).toBeTruthy();
    const ohneCode = "REV4-OHNE-FAKT";
    await konto(ohneCode, "betreiber");
    const sitz = (konto_, rolle) => S.sitzungAnlegen({ bestand: "betreiber-probe", name: "x", rolle, person: null, betrieb: 0,
      mandantId: null, konto: konto_ }, 3600_000);
    const mit = await sitz(C.ablageSchluessel(E), "betreiber");
    const ohne = await sitz(C.ablageSchluessel(ohneCode), "betreiber");
    const leit = await sitz(C.ablageSchluessel("REV4-LEIT-UNG"), "leitung");
    const vorhanden = async (t) => !!(await S.sitzungsSpeicher().get(S.sitzungsSchluessel(t.token), { type: "json" }));
    expect((await Z.betreiberSitzungenOhneFaktorBeenden(laden(), { NODE_ENV: "test" })).beendet).toBe(0);   // keine Pflicht: nichts
    expect(await vorhanden(ohne)).toBe(true);
    const r = await Z.betreiberSitzungenOhneFaktorBeenden(laden(), { NODE_ENV: "production" });
    expect(r.beendet).toBeGreaterThanOrEqual(1);
    expect(await vorhanden(ohne)).toBe(false);
    expect(await vorhanden(mit)).toBe(true);
    expect(await vorhanden(leit)).toBe(true);
  });

  it("5. Eine Prüfung für „Auslieferung“: normalisiert, in allen Stellen dieselbe", async () => {
    const { istProduktion } = await import("../server/lib/umgebung.mjs");
    for (const w of ["production", " Production ", "PRODUCTION"]) expect(istProduktion({ NODE_ENV: w }), w).toBe(true);
    for (const w of ["", "test", "prod", undefined]) expect(istProduktion({ NODE_ENV: w }), String(w)).toBe(false);
    const { pruefLinkErlaubt } = await import("../server/lib/post.mjs");
    const alt = { r: process.env.RESEND_API_KEY, l: process.env.CENTRIC_PRUEFLINK };
    delete process.env.RESEND_API_KEY; process.env.CENTRIC_PRUEFLINK = "ja";
    try {
      vi.stubEnv("NODE_ENV", "test");
      expect(pruefLinkErlaubt()).toBe(true);
      vi.stubEnv("NODE_ENV", " Production ");
      expect(pruefLinkErlaubt()).toBe(false);                    // früher: „ Production “ !== „production“ → erlaubt
    } finally { vi.unstubAllEnvs(); if (alt.r !== undefined) process.env.RESEND_API_KEY = alt.r; if (alt.l === undefined) delete process.env.CENTRIC_PRUEFLINK; else process.env.CENTRIC_PRUEFLINK = alt.l; }
    const { pushEndpunktErlaubt } = await import("../server/lib/pushziel.mjs");
    vi.stubEnv("NODE_ENV", " Production ");
    try { expect(pushEndpunktErlaubt("https://probe.example/push/abc")).toBe(false); } finally { vi.unstubAllEnvs(); }
    const q = (await readFile(path.join(WURZEL_REPO, "server/lib/versand.mjs"), "utf8")) + (await readFile(path.join(WURZEL_REPO, "server/lib/pushziel.mjs"), "utf8"))
      + (await readFile(path.join(WURZEL_REPO, "server/lib/post.mjs"), "utf8"));
    expect(q).not.toMatch(/NODE_ENVs*[!=]==/);
  });
});

describe("Quelltext-Invarianten", () => {
  it("Sitzungen entstehen nur in daten.mjs und betriebsauswahl.mjs; Betreiber nur über /api/anmelden mit der Prüfung davor", async () => {
    const dateien = [];
    const gehe = async (d) => {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await gehe(p); else if (p.endsWith(".mjs")) dateien.push(p);
      }
    };
    await gehe(path.join(WURZEL_REPO, "server"));
    const treffer = [];
    for (const p of dateien) {
      if (/sitzungen\.mjs$/.test(p)) continue;
      if ((await readFile(p, "utf8")).includes("sitzungAnlegen("))
        treffer.push(path.relative(WURZEL_REPO, p).replace(/\\/g, "/"));
    }
    expect(treffer.sort()).toEqual(["server/funktionen/daten.mjs", "server/lib/betriebsauswahl.mjs"]);
    const d = await readFile(path.join(WURZEL_REPO, "server/funktionen/daten.mjs"), "utf8");
    expect(d.match(/sitzungAnlegen\(/g).length).toBe(2);
    expect(d.indexOf("betreiberZweifaktor({")).toBeLessThan(d.lastIndexOf("sitzungAnlegen("));
  });
});

/* --------------------------------------------------------------------------
   Nachtrag WP-32d (Härtung, acc45/sicherheit/wp-32d)
   Rot auf dem Stand davor: (a) ohne NODE_ENV bekam ein Betreibercode ohne
   Faktor eine Sitzung; (b) eine Betreibersitzung ohne bestandenen Faktor
   (etwa aus einem Lauf als development auf derselben Ablage) trug unter
   production weiter, wenn die Bereinigung beim Start sie verfehlte.
   -------------------------------------------------------------------------- */
describe("Nachtrag WP-32d: Pflicht ohne Ausnahme, keine Abschaltvariable, kein Sitzungsstart ohne Faktor", () => {
  const ABSCHALTVERSUCHE = ["0", "aus", "", " ", "false", "nein", "off", "no", "2", "-1", "AUS", "disabled"];
  const NICHT_ENTWICKLUNG = ["production", " Production ", "PRODUCTION", "", " ", undefined, "prod", "staging",
    "produktion", "live", "dev", "testing", "production\n"];

  it("Pflicht gilt außerhalb von development/test ohne Ausnahme — für jeden Wert des Schalters", async () => {
    const { betreiberZweifaktorPflicht } = await import("../server/lib/umgebung.mjs");
    for (const n of NICHT_ENTWICKLUNG) for (const w of [...ABSCHALTVERSUCHE, undefined]) {
      const env = { NODE_ENV: n, CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT: w };
      expect(Z.betreiberPflicht(env), `${JSON.stringify(n)}/${JSON.stringify(w)}`).toBe(true);
      expect(betreiberZweifaktorPflicht(env), `${JSON.stringify(n)}/${JSON.stringify(w)}`).toBe(true);
    }
  });

  it("keine Umgebungsvariable hebt die Pflicht unter production auf (auch nicht die der anderen Schalter)", () => {
    const env = { NODE_ENV: "production" };
    for (const name of ["CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT", "CENTRIC_ZWEIFAKTOR_PFLICHT", "CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT",
      "CENTRIC_DEMO", "CENTRIC_SELBSTSTART", "CENTRIC_PRUEFLINK", "CENTRIC_ZWEIFAKTOR", "CENTRIC_BETREIBER_ZWEIFAKTOR",
      "CENTRIC_BETREIBER_ZWEIFAKTOR_AUS", "CENTRIC_ZWEIFAKTOR_AUS", "CENTRIC_2FA", "CENTRIC_OHNE_ZWEIFAKTOR"])
      for (const w of ABSCHALTVERSUCHE) env[name] = w;
    expect(Z.betreiberPflicht(env)).toBe(true);
  });

  it("Quelltext: der Schalter kann nur einschalten; nur umgebung.mjs liest ihn; der Server liest keine weitere Ausnahme", async () => {
    const dateien = [];
    const gehe = async (d) => {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await gehe(p); else if (p.endsWith(".mjs")) dateien.push(p);
      }
    };
    await gehe(path.join(WURZEL_REPO, "server"));
    dateien.push(path.join(WURZEL_REPO, "server.mjs"));
    const leser = [];
    for (const p of dateien)
      if (/\.CENTRIC_BETREIBER_ZWEIFAKTOR|\[\s*["'`]CENTRIC_BETREIBER_ZWEIFAKTOR/.test(await readFile(p, "utf8"))) leser.push(path.relative(WURZEL_REPO, p).replace(/\\/g, "/"));
    expect(leser).toEqual(["server/lib/umgebung.mjs"]);
    const u = await readFile(path.join(WURZEL_REPO, "server/lib/umgebung.mjs"), "utf8");
    const fn = u.slice(u.indexOf("export function betreiberZweifaktorPflicht"));
    /* Liest genau NODE_ENV und den Schalter, und der Schalter wird nur mit "1" verglichen. */
    expect([...new Set(fn.match(/env\.[A-Z_]+/g))].sort()).toEqual(["env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT", "env.NODE_ENV"]);
    expect(fn).toMatch(/CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT \|\| ""\)\.trim\(\) === "1"/);
    expect(fn).toMatch(/if \(!ENTWICKLUNGSUMGEBUNGEN\.includes\(umgebung\)\) return true;/);
    expect(u).toMatch(/ENTWICKLUNGSUMGEBUNGEN = Object\.freeze\(\["development", "test"\]\)/);
  });

  it("ohne NODE_ENV: Betreibercode ohne Faktor bekommt keine Sitzung (403 einrichten)", async () => {
    const alt = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      await konto("OHNE-NODE-ENV1", "betreiber");
      const a = await anmelden({ zugangscode: "OHNE-NODE-ENV1" });
      expect(a.status, a.roh).toBe(403);
      expect(a.zweifaktor).toBe("einrichten");
      expect(a.token).toBeUndefined();
      /* Ein Abschaltwert ändert daran nichts. */
      process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT = "0";
      const b = await anmelden({ zugangscode: "OHNE-NODE-ENV1" });
      expect(b.status, b.roh).toBe(403);
      expect(b.token).toBeUndefined();
    } finally {
      delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
      if (alt === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = alt;
    }
  });

  it("Sitzungsstart unter production: eine Betreibersitzung ohne bestandenen Faktor trägt bei keiner Anfrage", async () => {
    const BC = "SITZ-OHNE-FAKT";
    const mitF = "SITZ-MIT-FAKT1";
    await konto(BC, "betreiber");
    const f = await einrichten(mitF);
    expect(f.geheimnis).toBeTruthy();
    /* Wie aus einem Lauf als development auf derselben Ablage oder aus der Zeit vor der Pflicht: kein `zweifaktor`. */
    const sitz = (c, extra = {}) => S.sitzungAnlegen({ bestand: "betreiber-probe", name: "x", rolle: "betreiber", person: null,
      betrieb: 0, mandantId: null, konto: C.ablageSchluessel(c), ...extra }, 3600_000);
    const holen = (token) => daten(new Request(`http://${WIRT}/api/zugaenge-uebersicht?bestand=betreiber-probe`, {
      headers: { host: WIRT, origin: `http://${WIRT}`, authorization: `Bearer ${token}`, "x-forwarded-for": "10.77.0.1" } }), {});
    const lesen = (token) => S.sitzungLesen(new Request(`http://${WIRT}/x`, { headers: { authorization: `Bearer ${token}` } }));
    const vorhanden = async (t) => !!(await S.sitzungsSpeicher().get(S.sitzungsSchluessel(t), { type: "json" }));

    /* Ohne Pflicht (test): die Sitzung trägt wie bisher. */
    const ohneTest = await sitz(BC);
    expect(await lesen(ohneTest.token)).toBeTruthy();
    expect((await holen(ohneTest.token)).status).not.toBe(401);

    vi.stubEnv("NODE_ENV", "production");
    try {
      const ohne = await sitz(BC);
      const ohneMitFaktorKonto = await sitz(mitF);                  // Konto mit Faktor, Sitzung aber ohne bestandenen
      const mit = await sitz(mitF, { zweifaktor: true });
      const leit = await S.sitzungAnlegen({ bestand: "betreiber-probe", name: "l", rolle: "leitung", person: null,
        betrieb: 0, mandantId: null, konto: C.ablageSchluessel("SITZ-LEIT-UNG1") }, 3600_000);
      expect((await holen(ohne.token)).status).toBe(401);
      expect(await vorhanden(ohne.token)).toBe(false);              // entfernt, nicht nur abgewiesen
      expect(await lesen(ohneMitFaktorKonto.token)).toBeNull();
      expect(await lesen(ohneTest.token)).toBeNull();               // die Sitzung aus dem test-Lauf trägt jetzt nicht mehr
      expect(await lesen(mit.token)).toBeTruthy();                  // mit bestandenem Faktor: unverändert
      expect((await holen(mit.token)).status).not.toBe(401);
      expect(await lesen(leit.token)).toBeTruthy();                 // andere Rollen unberührt
      /* Ein Abschaltwert ändert daran nichts. */
      vi.stubEnv("CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT", "0");
      const nochmal = await sitz(BC);
      expect(await lesen(nochmal.token)).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });

  it("die Anmeldung setzt `zweifaktor: true` an jeder Betreibersitzung unter Pflicht (sonst sperrte sich der Betreiber aus)", async () => {
    const E = "SITZ-FLAG-PRUE";
    vi.stubEnv("NODE_ENV", "production");
    try {
      const f = await einrichten(E);
      uhr(jetzt + 60_000);
      const a = await anmelden({ zugangscode: E, zweifaktor: code(f.geheimnis) });
      expect(a.status, a.roh).toBe(200);
      const s = await S.sitzungLesen(new Request(`http://${WIRT}/x`, { headers: { authorization: `Bearer ${a.token}` } }));
      expect(s).toBeTruthy();
      expect(s.zweifaktor).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
});

/* ==========================================================================
   SICHERUNG UND WIEDERHERSTELLUNG DER GANZEN ABLAGE

   Das Maß ist nicht, dass das Werkzeug Dateien kopiert, sondern dass CENTRIC
   danach fachlich wieder dasselbe weiß: dasselbe Konto, dieselbe
   Mitgliedschaft, derselbe Betrieb — und dass man sich anmelden und den
   Betrieb öffnen kann. Dafür läuft hier die echte Anwendungsschicht (die
   Handler, die server.mjs einhängt) gegen eine echte Dateiablage.

   Nichts davon berührt eine echte Ablage: Jede Prüfung arbeitet in eigenen
   Wegwerfordnern unter dem Temp-Verzeichnis; CENTRIC_DATEN zeigt nur dorthin.

   Geprüft wird außerdem, was das Werkzeug ablehnen muss: beschädigte,
   unvollständige und fremde Sicherungen, ein anderer Pfeffer, ein laufender
   Server, ein nicht leeres Ziel — und dass dabei nichts angefasst wird.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let basis, G, getStore, handler, KEKS, A, P, B, T, S;
let zaehler = 0;

const LIMIT = 60000;
const GUT = "Nordwind und Sonne 1846";
const PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
const WIRT = "127.0.0.1:3000";
const EIGEN = `http://${WIRT}`;
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "centric-sicherung-"));
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  process.env.CENTRIC_DATEN = path.join(basis, "start");
  await mkdir(process.env.CENTRIC_DATEN, { recursive: true });
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  const modul = await import("../server/funktionen/anmeldung.mjs");
  handler = modul.default;
  KEKS = modul.COOKIE;
  A = await import("../server/lib/accounts.mjs");
  P = await import("../server/lib/passwoerter.mjs");
  B = await import("../server/lib/bestand.mjs");
  T = await import("../server/lib/token.mjs");
  S = await import("../server/lib/sitzungen.mjs");
  G = await import("../werkzeug/ablage-sicherung.mjs");
});

afterAll(async () => {
  await rm(basis, { recursive: true, force: true });
});

/** Ein frischer Ordner im Wegwerfverzeichnis. */
async function ordner(was) {
  const d = path.join(basis, `${was}-${++zaehler}`);
  await mkdir(d, { recursive: true });
  return d;
}
/** Die Ablage zeigt ab jetzt hierher. */
const umschalten = (dir) => { process.env.CENTRIC_DATEN = dir; };

const laden = () => getStore({ name: "centric", consistency: "strong" });
const arbeitAblage = () => getStore({ name: "centric-sitzungen", consistency: "strong" });
const kontoAblage = () => getStore({ name: "centric-accountsitzungen", consistency: "strong" });

const eigeneHerkunft = () => `10.7.${Math.floor(++zaehler / 250) + 1}.${(zaehler % 250) + 1}`;
const adresse = (was) => `${was}-${++zaehler}@example.org`;

async function anfrage({ pfad, methode = "POST", rumpf = {}, keks = null } = {}) {
  const kopf = { "x-forwarded-for": eigeneHerkunft(), host: WIRT, origin: EIGEN };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (keks) kopf.cookie = `${KEKS}=${keks}`;
  const req = new Request(`http://${WIRT}${pfad}`, {
    method: methode, headers: kopf, ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf) }),
  });
  const antwort = await handler(req);
  let daten = null;
  try { daten = await antwort.clone().json(); } catch { /* nicht jede Antwort ist JSON */ }
  return { antwort, status: antwort.status, daten };
}

const keksWert = (kopf) => {
  const m = new RegExp(`${KEKS.replace(/[-$]/g, "\\$&")}=([^;]*)`).exec(String(kopf || ""));
  return m ? m[1] : null;
};

async function anmelden(email, passwort = GUT) {
  const e = await anfrage({ pfad: "/api/account/anmelden", rumpf: { email, passwort } });
  return { ...e, keks: keksWert(e.antwort.headers.get("set-cookie")) };
}

async function konto(email) {
  const s = laden();
  const e = await A.accountAnlegen(s, { email });
  if (!e.ok) throw new Error(`Account nicht angelegt: ${e.grund}`);
  await A.emailBestaetigen(s, e.account.id);
  const g = await A.passwortSetzen(s, e.account.id, await P.passwortAblegen(GUT));
  if (!g.ok) throw new Error("Passwort nicht gesetzt");
  return g.account;
}

const person = (id, vorname, nachname, rolle) => ({
  id, vorname, nachname, rolle, status: "aktiv",
  zugehoerigkeit: [{ ab: "2026-01-01", einheitId: "e1" }], bereich: "ALLE",
});

async function betrieb(raum, name, personen) {
  const e = await B.bestandSchreiben(laden(), raum, {
    version: 5,
    mandanten: [{ id: "m1", name, personen, einheiten: [{ id: "e1", name: "Wohnbereich 1" }] }],
  }, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
}

async function mitglied(accountId, raum, rolle) {
  const e = await A.mitgliedschaftAnlegen(laden(), { accountId, raum, betrieb: 0,
    mandantId: "m1", person: "p_1", rolle, einheit: null, status: "aktiv" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
}

/** Alle Dateien eines Stores: Name -> Inhalt. */
async function inhalt(dir, store) {
  const aus = {};
  const d = path.join(dir, store);
  let namen = [];
  try { namen = await readdir(d); } catch { return aus; }
  for (const n of namen) if (!n.endsWith(".tmp")) aus[n] = await readFile(path.join(d, n), "utf8");
  return aus;
}

/** Ein kleiner, aber vollständiger Bestand an Daten: zwei Betriebe, ein Konto. */
async function bestueckt() {
  const k = await konto(adresse("sich"));
  const raumA = `t-sich-a-${++zaehler}`;
  const raumB = `t-sich-b-${++zaehler}`;
  await betrieb(raumA, "Haus Alpha", [person("p_1", "Rina", "Schmitt", "leitung")]);
  await betrieb(raumB, "Haus Beta", [person("p_1", "Rina", "Schmitt", "mitarbeiter")]);
  await mitglied(k.id, raumA, "leitung");
  await mitglied(k.id, raumB, "mitarbeiter");
  return { k, raumA, raumB };
}

/* ==========================================================================
   DER GANZE WEG
   ========================================================================== */

describe("Sichern und Wiederherstellen — der ganze Weg", () => {
  it("stellt Konto, Mitgliedschaft, Betrieb und Anmeldung wieder her", async () => {
    const quelle = await ordner("quelle");
    umschalten(quelle);
    const { k, raumA, raumB } = await bestueckt();

    // Eine Account-Sitzung und eine Arbeitssitzung entstehen — beide flüchtig.
    const a1 = await anmelden(k.email);
    expect(a1.status).toBe(200);
    expect(a1.keks).toBeTruthy();
    const w1 = await anfrage({ pfad: "/api/account/betrieb", rumpf: { raum: raumA }, keks: a1.keks });
    expect(w1.status).toBe(200);
    const altesMerkmal = w1.daten.token;
    expect(await arbeitAblage().get(`t:${hash(altesMerkmal)}`, { type: "json" })).toBeTruthy();

    // Ein offenes Einmal-Token und ein Sicherungsschlüssel (der überlebt, jenes nicht).
    const offen = await T.tokenAusstellen(laden(), { zweck: "verifizierung", nr: 1 });
    await arbeitAblage().setJSON(S.sicherungsSchluessel("roh-schluessel-1"),
      { bestand: raumA, bis: Date.now() + 1e9 });

    const vorherA = await B.bestandLesen(laden(), raumA);
    const vorherB = await B.bestandLesen(laden(), raumB);
    const vorherKonto = await A.accountLesenPerMail(laden(), k.email);
    const vorherMit = await A.mitgliedschaftenDesAccounts(laden(), k.id);
    expect(vorherMit.length).toBe(2);

    // --- Sichern ---
    const ziel = await ordner("sicherungen");
    const r = await G.sichern({ quelle, ziel, pause: 0 });
    const m = r.manifest;
    expect((await G.pruefen(r.pfad)).ok).toBe(true);
    expect(m.stores["centric"].klasse).toBe("A");
    // Klasse C und flüchtige Präfixe fehlen — mit Zählung, nicht stillschweigend.
    expect(m.stores["centric-accountsitzungen"]).toMatchObject({ klasse: "C", dateien: 0 });
    expect(m.stores["centric-takt"]).toMatchObject({ klasse: "C", dateien: 0 });
    expect(m.ausgelassen["centric-accountsitzungen"]).toBeTruthy();
    expect(m.ausgelassen["centric-takt"]).toBeTruthy();
    expect(Object.keys(m.ausgelassen["centric"]).join()).toContain("token:");
    expect(Object.keys(m.ausgelassen["centric-sitzungen"]).join()).toContain("Präfix nicht gesichert");
    const gesichert = m.dateien.map((d) => d.pfad);
    expect(gesichert.some((p) => p.startsWith("centric-sitzungen/sk%3A"))).toBe(true);
    expect(gesichert.some((p) => p.startsWith("centric-sitzungen/t%3A"))).toBe(false);
    expect(gesichert.some((p) => p.startsWith("centric/token%3A"))).toBe(false);
    expect(m.pfefferPruefwert).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(m)).not.toContain(PFEFFER);

    // --- Alles weg: ein ganz anderer, leerer Ort ---
    const neu = await ordner("neu");
    umschalten(neu);
    expect(await B.bestandLesen(laden(), raumA)).not.toEqual(vorherA);
    expect(await A.accountLesenPerMail(laden(), k.email)).toBeFalsy();

    // --- Wiederherstellen ---
    const w = await G.wiederherstellen({ sicherung: r.pfad, ziel: neu, serverPruefen: false });
    expect(w.dateien).toBe(m.summe.dateien);

    // Dieselben Bytes, Store für Store, für alles, was gesichert wurde.
    for (const s of ["centric", "centric-spur"]) {
      const alt = await inhalt(quelle, s);
      const neuInh = await inhalt(neu, s);
      const ohneToken = Object.fromEntries(Object.entries(alt)
        .filter(([n]) => !n.startsWith("token%3A") && !n.startsWith("tokencode%3A")));
      expect(neuInh).toEqual(ohneToken);
    }
    const skAlt = Object.keys(await inhalt(quelle, "centric-sitzungen")).filter((n) => n.startsWith("sk%3A"));
    expect(Object.keys(await inhalt(neu, "centric-sitzungen")).sort()).toEqual(skAlt.sort());

    // Fachlich: Konto, Mitgliedschaften, Betriebe.
    expect(await A.accountLesenPerMail(laden(), k.email)).toEqual(vorherKonto);
    const nachherMit = await A.mitgliedschaftenDesAccounts(laden(), k.id);
    expect(nachherMit).toEqual(vorherMit);
    expect(await B.bestandLesen(laden(), raumA)).toEqual(vorherA);
    expect(await B.bestandLesen(laden(), raumB)).toEqual(vorherB);

    // Flüchtiges ist weg — mit Absicht: widerrufene Sitzungen leben nicht wieder auf.
    expect(await kontoAblage().get(`t:${hash(a1.keks)}`, { type: "json" }).catch(() => null)).toBeFalsy();
    expect(await arbeitAblage().get(`t:${hash(altesMerkmal)}`, { type: "json" })).toBeFalsy();
    const altesCookie = await anfrage({ pfad: "/api/account/mitgliedschaften", methode: "GET", keks: a1.keks });
    expect(altesCookie.status).toBe(401);
    expect(await laden().get(offen.schluessel, { type: "json" })).toBeFalsy();
    // Der Sicherungsschlüssel dagegen wirkt weiter.
    expect(await arbeitAblage().get(S.sicherungsSchluessel("roh-schluessel-1"), { type: "json" }))
      .toMatchObject({ bestand: raumA });

    // Anmeldung und Betriebsauswahl gehen wieder.
    const a2 = await anmelden(k.email);
    expect(a2.status).toBe(200);
    expect(a2.keks).toBeTruthy();
    const falsch = await anmelden(k.email, "ein ganz falsches Passwort 99");
    expect(falsch.status).not.toBe(200);
    const liste = await anfrage({ pfad: "/api/account/mitgliedschaften", methode: "GET", keks: a2.keks });
    expect(liste.status).toBe(200);
    expect(liste.daten.mitgliedschaften.map((x) => x.raum).sort()).toEqual([raumA, raumB].sort());
    const w2 = await anfrage({ pfad: "/api/account/betrieb", rumpf: { raum: raumB }, keks: a2.keks });
    expect(w2.status).toBe(200);
    expect(w2.daten).toMatchObject({ ok: true, raum: raumB, name: "Haus Beta", rolle: "mitarbeiter" });
    expect(await arbeitAblage().get(`t:${hash(w2.daten.token)}`, { type: "json" })).toBeTruthy();
  }, LIMIT);
});

/* ==========================================================================
   WAS DAS WERKZEUG ABLEHNEN MUSS
   ========================================================================== */

/** Eine frische Sicherung mit etwas Inhalt. */
async function eineSicherung() {
  const quelle = await ordner("q");
  umschalten(quelle);
  await bestueckt();
  const ziel = await ordner("s");
  const r = await G.sichern({ quelle, ziel, pause: 0 });
  return { quelle, ziel, ...r };
}

describe("Sichern", () => {
  it("legt die Sicherung erst fertig unter ihrem Namen ab", async () => {
    const { ziel, pfad } = await eineSicherung();
    const namen = await readdir(ziel);
    expect(namen).toEqual([path.basename(pfad)]);
    for (const f of ["FERTIG", "MANIFEST.json", "MANIFEST.sha256", "daten"])
      expect((await stat(path.join(pfad, f))).isFile() || true).toBe(true);
  }, LIMIT);

  it("nimmt keine halben Zwischendateien mit, meldet sie aber", async () => {
    const quelle = await ordner("tmp");
    umschalten(quelle);
    await bestueckt();
    await writeFile(path.join(quelle, "centric", "x.json.1234.abcdef.tmp"), "halb");
    const r = await G.sichern({ quelle, ziel: await ordner("s"), pause: 0 });
    expect(r.manifest.dateien.some((d) => d.pfad.endsWith(".tmp"))).toBe(false);
    expect(r.manifest.ausgelassen["centric"]["unfertige Zwischendatei (.tmp)"]).toBe(1);
  }, LIMIT);

  it("bricht bei einem Store ab, den niemand eingeordnet hat", async () => {
    const quelle = await ordner("fremd");
    umschalten(quelle);
    await bestueckt();
    await mkdir(path.join(quelle, "centric-neu"));
    const ziel = await ordner("s");
    await expect(G.sichern({ quelle, ziel, pause: 0 })).rejects.toMatchObject({ code: 2 });
    expect((await readdir(ziel)).filter((n) => !n.startsWith("."))).toEqual([]);
  }, LIMIT);

  it("bricht bei einer beschädigten Datei in der Quelle ab, statt sie zu sichern", async () => {
    const quelle = await ordner("kaputt");
    umschalten(quelle);
    await bestueckt();
    const f = (await readdir(path.join(quelle, "centric"))).find((n) => n.startsWith("account"));
    await writeFile(path.join(quelle, "centric", f), "{ nicht zu Ende");
    const ziel = await ordner("s");
    await expect(G.sichern({ quelle, ziel, pause: 0 })).rejects.toThrow(/beschädigt|kein gültiger/);
    expect((await readdir(ziel)).filter((n) => !n.startsWith("."))).toEqual([]);
  }, LIMIT);

  it("lehnt ein Ziel innerhalb der Quelle ab", async () => {
    const quelle = await ordner("selbst");
    umschalten(quelle);
    await bestueckt();
    await expect(G.sichern({ quelle, ziel: path.join(quelle, "sicherungen"), pause: 0 }))
      .rejects.toMatchObject({ code: 2 });
  }, LIMIT);

  it("meldet eine Quelle, die sich beim Sichern ändert, nie als Erfolg ohne Gegenprobe", async () => {
    const quelle = await ordner("lebend");
    umschalten(quelle);
    await bestueckt();
    for (let i = 0; i < 300; i++) await laden().setJSON(`fuell:${i}`, { i });
    let laeuft = true;
    const schreiber = (async () => {
      let n = 0;
      while (laeuft) { await laden().setJSON(`fuell:${n++ % 300}`, { n }).catch(() => {}); }
    })();
    let ergebnis;
    try { ergebnis = await G.sichern({ quelle, ziel: await ordner("s"), pause: 0, versuche: 2 }); }
    catch (e) { ergebnis = e; }
    laeuft = false; await schreiber;
    if (ergebnis instanceof Error) {
      expect(ergebnis.code).toBe(3);
    } else {
      expect((await G.pruefen(ergebnis.pfad)).ok).toBe(true);
    }
  }, LIMIT);
});

describe("Prüfen", () => {
  it("erkennt jede Art von Schaden", async () => {
    const { pfad } = await eineSicherung();
    expect((await G.pruefen(pfad)).ok).toBe(true);

    const datei = (await readdir(path.join(pfad, "daten", "centric")))[0];
    const voll = path.join(pfad, "daten", "centric", datei);
    const original = await readFile(voll);

    // ein verändertes Byte
    const kaputt = Buffer.from(original); kaputt[kaputt.length - 3] ^= 1;
    await writeFile(voll, kaputt);
    expect((await G.pruefen(pfad)).fehler.join()).toMatch(/Prüfsumme|kein gültiger/);
    await writeFile(voll, original);
    expect((await G.pruefen(pfad)).ok).toBe(true);

    // eine fehlende Datei
    await rm(voll);
    expect((await G.pruefen(pfad)).fehler.join()).toContain("Fehlt");
    await writeFile(voll, original);

    // eine zusätzliche Datei
    await writeFile(path.join(pfad, "daten", "centric", "dazu.json"), "{}");
    expect((await G.pruefen(pfad)).fehler.join()).toContain("Nicht im Manifest");
    await rm(path.join(pfad, "daten", "centric", "dazu.json"));

    // ein verändertes Manifest
    const mf = await readFile(path.join(pfad, "MANIFEST.json"), "utf8");
    await writeFile(path.join(pfad, "MANIFEST.json"), mf.replace('"format": 1', '"format": 1 '));
    expect((await G.pruefen(pfad)).ok).toBe(false);
    await writeFile(path.join(pfad, "MANIFEST.json"), mf);
    expect((await G.pruefen(pfad)).ok).toBe(true);

    // ohne FERTIG: nie abgeschlossen
    const fertig = await readFile(path.join(pfad, "FERTIG"));
    await rm(path.join(pfad, "FERTIG"));
    expect((await G.pruefen(pfad)).fehler.join()).toContain("FERTIG fehlt");
    await writeFile(path.join(pfad, "FERTIG"), fertig);

    // ein Pfad, der aus der Sicherung herausführt
    const m = JSON.parse(mf);
    m.dateien[0].pfad = "../../etc/passwd";
    const text = JSON.stringify(m, null, 2) + "\n";
    await writeFile(path.join(pfad, "MANIFEST.json"), text);
    await writeFile(path.join(pfad, "MANIFEST.sha256"), hash(text) + "\n");
    await writeFile(path.join(pfad, "FERTIG"), `FERTIG ${hash(text)}\n`);
    expect((await G.pruefen(pfad)).fehler.join()).toContain("Unzulässiger Pfad");
  }, LIMIT);
});

describe("Wiederherstellen", () => {
  it("lehnt eine beschädigte Sicherung ab und fasst das Ziel nicht an", async () => {
    const { pfad } = await eineSicherung();
    const datei = (await readdir(path.join(pfad, "daten", "centric")))[0];
    await writeFile(path.join(pfad, "daten", "centric", datei), "{}");
    const ziel = await ordner("ziel");
    await expect(G.wiederherstellen({ sicherung: pfad, ziel, serverPruefen: false }))
      .rejects.toThrow(/nicht in Ordnung/);
    expect(await readdir(ziel)).toEqual([]);
  }, LIMIT);

  it("lehnt ein nicht leeres Ziel ohne --ersetzen ab", async () => {
    const { pfad } = await eineSicherung();
    const ziel = await ordner("belegt");
    await mkdir(path.join(ziel, "centric"));
    await writeFile(path.join(ziel, "centric", "wichtig.json"), "{}");
    await expect(G.wiederherstellen({ sicherung: pfad, ziel, serverPruefen: false }))
      .rejects.toThrow(/nicht leer/);
    expect(await readFile(path.join(ziel, "centric", "wichtig.json"), "utf8")).toBe("{}");
  }, LIMIT);

  it("legt mit --ersetzen den alten Inhalt beiseite, statt ihn zu löschen", async () => {
    const { pfad, manifest } = await eineSicherung();
    const ziel = await ordner("alt");
    await mkdir(path.join(ziel, "centric"));
    await writeFile(path.join(ziel, "centric", "alt.json"), "{\"alt\":1}");
    await mkdir(path.join(ziel, "centric-takt"));
    const r = await G.wiederherstellen({ sicherung: pfad, ziel, ersetzen: true, serverPruefen: false });
    expect(r.beiseite).toBeTruthy();
    expect(await readFile(path.join(r.beiseite, "centric", "alt.json"), "utf8")).toBe("{\"alt\":1}");
    expect(await readdir(path.join(r.beiseite))).toContain("centric-takt");
    const jetzt = await readdir(path.join(ziel, "centric"));
    expect(jetzt).not.toContain("alt.json");
    expect(jetzt.length).toBe(manifest.stores["centric"].dateien);
    // keine Reste der Werkstatt
    expect((await readdir(ziel)).filter((n) => n.startsWith(".wiederherstellung"))).toEqual([]);
  }, LIMIT);

  it("lehnt einen anderen Pfeffer ab", async () => {
    const { pfad } = await eineSicherung();
    const ziel = await ordner("pf");
    process.env.CENTRIC_PFEFFER = "ein-ganz-anderer-pfeffer-9876543210";
    try {
      await expect(G.wiederherstellen({ sicherung: pfad, ziel, serverPruefen: false }))
        .rejects.toThrow(/CENTRIC_PFEFFER/);
      delete process.env.CENTRIC_PFEFFER;
      await expect(G.wiederherstellen({ sicherung: pfad, ziel, serverPruefen: false }))
        .rejects.toThrow(/CENTRIC_PFEFFER/);
    } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
    expect(await readdir(ziel)).toEqual([]);
  }, LIMIT);

  it("lehnt ab, solange ein Server antwortet", async () => {
    const { pfad } = await eineSicherung();
    const ziel = await ordner("lauf");
    const srv = createServer((_q, a) => { a.end("ok"); });
    await new Promise((f) => srv.listen(0, "127.0.0.1", f));
    const url = `http://127.0.0.1:${srv.address().port}/gesund`;
    try {
      await expect(G.wiederherstellen({ sicherung: pfad, ziel, serverUrl: url }))
        .rejects.toThrow(/Server/);
      expect(await readdir(ziel)).toEqual([]);
    } finally { await new Promise((f) => srv.close(f)); }
    // Steht er, geht es.
    const r = await G.wiederherstellen({ sicherung: pfad, ziel, serverUrl: url });
    expect(r.dateien).toBeGreaterThan(0);
  }, LIMIT);

  it("läuft auch über die Kommandozeile und liefert Fehlercodes", async () => {
    const { pfad } = await eineSicherung();
    const still = console.error; const aus = console.log;
    console.error = () => {}; console.log = () => {};
    try {
      expect(await G.main(["pruefen", "--sicherung", pfad])).toBe(0);
      expect(await G.main(["pruefen", "--sicherung", path.join(pfad, "gibtsnicht")])).toBe(1);
      expect(await G.main(["gibtsnicht"])).toBe(2);
      const ziel = await ordner("cli");
      expect(await G.main(["wiederherstellen", "--sicherung", pfad, "--ziel", ziel,
        "--ohne-serverpruefung"])).toBe(0);
      expect(await G.main(["wiederherstellen", "--sicherung", pfad, "--ziel", ziel,
        "--ohne-serverpruefung"])).toBe(1);               // nicht leer
    } finally { console.error = still; console.log = aus; }
  }, LIMIT);
});

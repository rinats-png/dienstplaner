/* ==========================================================================
   SICHERUNGSSCHLÜSSEL ÜBERLEBEN KEINE WIEDERHERSTELLUNG
   (Betreiberentscheidung 2026-11-07, server/lib/schluesselepoche.mjs)

   Nach jeder vollständigen Wiederherstellung der Ablage gilt kein früherer
   Sicherungsschlüssel mehr — auch dann nicht, wenn der zurückgespielte Stand
   vor seinem Widerruf liegt (der Widerrufsvermerk skw: fehlt dort). Geprüft
   über den echten Handler (Vollausgabe mit dem Schlüssel), für jeden Weg:

     1. Ablage-Werkzeug (werkzeug/ablage-sicherung.mjs), mit und ohne
        Zustandsverzeichnis — derselbe Weg, den restic nimmt.
     2. Verzeichniskopie eines alten /data (ohne Werkzeug).
     3. restic: Vertrag der Skripte (nur das Werkzeug sichert und spielt zurück).
     4. Fail-closed: Epoche nicht lesbar/schreibbar, Zustand in der Ablage,
        Werkzeug ohne schreibbaren Zustand, manipulierte Sicherung.

   Aufruf: npx vitest run pruefungen/sicherungsschluessel-wiederherstellung.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { cp, mkdtemp, readdir, readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { aufbauen, hash } from "./hilfen/szenario.mjs";

const LIMIT = 60000;
let Z;
let W;   // werkzeug/ablage-sicherung.mjs
let E;   // server/lib/schluesselepoche.mjs
let ablagen;

beforeAll(async () => {
  Z = await aufbauen("skwieder");
  W = await import("../werkzeug/ablage-sicherung.mjs");
  E = await import("../server/lib/schluesselepoche.mjs");
  ablagen = await mkdtemp(path.join(tmpdir(), "centric-skwieder-sich-"));
}, LIMIT);
afterAll(async () => {
  await Z.abbauen();
  await rm(ablagen, { recursive: true, force: true });
});
beforeEach(async () => { await Z.taktLeeren(); });
afterEach(() => { delete process.env.CENTRIC_ZUSTAND; });

const anlegen = (token) => Z.bearer(Z.daten, "/api/sicherungsschluessel", token, { methode: "POST", rumpf: {} });
const vollausgabe = (roh) => Z.bearer(Z.daten, "/api/vollausgabe", roh);
const satz = (roh) => Z.ablageArbeit().get(`sk:${hash(roh)}`, { type: "json" });
const vermerk = (roh) => Z.ablageArbeit().get(`skw:${hash(roh)}`, { type: "json" });
const widerrufen = (b, roh) => Z.bearer(Z.daten, "/api/sicherungsschluessel", b.token,
  { methode: "DELETE", rumpf: { kennung: hash(roh).slice(0, 8) } });
const zustand = () => `${Z.wurzel}-zustand`;
let nr = 0;

async function leitungMitSchluessel(was) {
  const b = await Z.arbeitsbereich(was);
  const a = await anlegen(b.token);
  expect(a.status, JSON.stringify(a.daten)).toBe(200);
  expect((await vollausgabe(a.daten.schluessel)).status, "der neue Schlüssel gilt").toBe(200);
  return { ...b, sk: a.daten.schluessel };
}

/** Der Kern jeder Prüfung: Der alte Schlüssel ist wieder in der Ablage, ohne Vermerk — und gilt trotzdem nie. */
async function altSchluesselGiltNie(roh) {
  expect(await satz(roh), "Datensatz des alten Schlüssels ist zurückgespielt").not.toBeNull();
  expect(await vermerk(roh), "der Widerrufsvermerk ist mit zurückgespielt worden (fehlt)").toBeNull();
  for (let i = 0; i < 3; i++) {
    const v = await vollausgabe(roh);
    expect(v.status, `Versuch ${i + 1}: ${JSON.stringify(v.daten).slice(0, 200)}`).toBe(401);
    expect(v.daten.betrieb, "keine Daten").toBeUndefined();
  }
  /* Nach der ersten Absage ist er endgültig widerrufen, mit dem Grund der Wiederherstellung. */
  expect(await vermerk(roh)).toMatchObject({ grund: "ablage-wiederhergestellt" });
  expect(await satz(roh)).toBeNull();
}

/** Nach der Wiederherstellung: Anmeldung geht, eine Leitung legt einen neuen Schlüssel an, und der gilt. */
async function neuerSchluesselGeht(b) {
  const g = await Z.zweitesGeraet(b.k, b.raum);
  const a = await anlegen(g.token);
  expect(a.status, JSON.stringify(a.daten)).toBe(200);
  expect((await vollausgabe(a.daten.schluessel)).status, "neuer Schlüssel nach der Wiederherstellung").toBe(200);
  return a.daten.schluessel;
}

const sichern = async () => (await W.sichern({ quelle: Z.wurzel, ziel: path.join(ablagen, `s${++nr}`) })).pfad;

describe("Weg 1: Ablage-Werkzeug (auch der Weg nach restic restore)", () => {
  it("Sicherung vor dem Widerruf, widerrufen, zurückgespielt ohne Zustandsangabe: alter Schlüssel gilt nie", async () => {
    const b = await leitungMitSchluessel("w1-ohne");
    const sicherung = await sichern();
    const m = JSON.parse(await readFile(path.join(sicherung, "MANIFEST.json"), "utf8"));
    expect(m.dateien.some((d) => d.pfad === `centric-sitzungen/sk%3A${hash(b.sk)}.json`), "Schlüssel in der Sicherung").toBe(true);
    expect(m.dateien.some((d) => d.pfad.startsWith("centric-sitzungen/skbindung")), "die Bindung nie").toBe(false);

    expect((await widerrufen(b, b.sk)).status).toBe(200);
    expect((await vollausgabe(b.sk)).status, "widerrufen").toBe(401);

    await W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false });
    await altSchluesselGiltNie(b.sk);
    await neuerSchluesselGeht(b);
  }, LIMIT);

  it("dasselbe mit Zustandsverzeichnis: das Werkzeug erneuert die Epoche vor dem Tausch", async () => {
    const b = await leitungMitSchluessel("w1-mit");
    const sicherung = await sichern();
    const vorher = await E.epocheDateiLesen(zustand());
    expect((await widerrufen(b, b.sk)).status).toBe(200);
    await W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false, zustand: zustand() });
    const nachher = await E.epocheDateiLesen(zustand());
    expect(nachher.epoche, "neue Epoche").not.toBe(vorher.epoche);
    expect(nachher.grund).toBe("wiederherstellung");
    await altSchluesselGiltNie(b.sk);
    await neuerSchluesselGeht(b);
  }, LIMIT);

  it("auch ein NICHT widerrufener Schlüssel gilt nach der Wiederherstellung nicht mehr", async () => {
    const b = await leitungMitSchluessel("w1-alle");
    const sicherung = await sichern();
    await W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false });
    const v = await vollausgabe(b.sk);
    expect(v.status).toBe(401);
    expect(v.daten).toMatchObject({ widerrufen: true, grund: "ablage-wiederhergestellt" });
  }, LIMIT);
});

describe("Weg 2: Verzeichniskopie eines alten Datenbestands (ohne Werkzeug)", () => {
  /** Kopie des ganzen Datenverzeichnisses, wie `cp -a /data /data.alt`. */
  const kopieren = async () => {
    const ziel = path.join(ablagen, `kopie${++nr}`);
    await cp(Z.wurzel, ziel, { recursive: true });
    return ziel;
  };
  const zurueckspielen = async (kopie) => {
    for (const n of await readdir(Z.wurzel)) await rm(path.join(Z.wurzel, n), { recursive: true, force: true });
    await cp(kopie, Z.wurzel, { recursive: true });
  };

  it("Kopie vor dem Widerruf, widerrufen, Kopie zurück: alter Schlüssel gilt nie", async () => {
    const b = await leitungMitSchluessel("w2-widerruf");
    const kopie = await kopieren();
    expect((await widerrufen(b, b.sk)).status).toBe(200);
    await zurueckspielen(kopie);
    expect(await Z.ablageArbeit().get("skbindung", { type: "json" }), "die alte Bindung ist mit zurückgekommen").not.toBeNull();
    await altSchluesselGiltNie(b.sk);
    await neuerSchluesselGeht(b);
  }, LIMIT);

  it("Kopie, Neustart dazwischen (Bindung beim Start erneuert), Kopie zurück: alter Schlüssel gilt nie", async () => {
    const b = await leitungMitSchluessel("w2-start");
    const kopie = await kopieren();
    await E.bindungErneuern({ nurWennVorhanden: true });       // was server.mjs beim Start tut
    await zurueckspielen(kopie);
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Kopie ohne jede Änderung seither: der Pflichtschritt schluessel-erneuern macht den Schlüssel ungültig", async () => {
    const b = await leitungMitSchluessel("w2-hand");
    const kopie = await kopieren();
    await zurueckspielen(kopie);
    expect(await W.main(["schluessel-erneuern", "--zustand", zustand(), "--daten", Z.wurzel])).toBe(0);
    expect((await vollausgabe(b.sk)).status).toBe(401);
    await neuerSchluesselGeht(b);
  }, LIMIT);
});

describe("Weg 3: restic (Vertrag der Skripte, restic selbst ist hier nicht installiert)", () => {
  const skript = (n) => readFileSync(path.join(import.meta.dirname, "..", "deploy", "sicherung", n), "utf8");
  it("restic sichert nur die Ausgabe des Werkzeugs, nie das Datenverzeichnis", () => {
    const s = skript("sicherung-ausser-haus.sh");
    expect(s).toMatch(/werkzeug\/ablage-sicherung\.mjs sichern --quelle \/data/);
    const backup = s.split("\n").filter((z) => /restic_lauf backup/.test(z) || /^\s+"\$LOKAL_ZIEL\/\$SICHERUNG_NAME"/.test(z));
    expect(backup.join("\n")).toMatch(/"\$LOKAL_ZIEL\/\$SICHERUNG_NAME"/);
    expect(s).not.toMatch(/restic_lauf backup[^\n]*CENTRIC_DATEN_PFAD/);
  });
  it("die Probe spielt über das Werkzeug zurück (das die Bindung nie mitbringt)", () => {
    expect(skript("wiederherstellung-probe.sh")).toMatch(/werkzeug\/ablage-sicherung\.mjs wiederherstellen/);
  });
  it("die Positivliste der Sitzungsablage enthält die Bindung nicht", () => {
    expect(W.STORES["centric-sitzungen"].nur.some((p) => E.BINDUNG_SCHLUESSEL.startsWith(p))).toBe(false);
  });
});

describe("Fail-closed", () => {
  it("Epoche nicht lesbar: kein Schlüssel gilt, keiner wird angelegt, nichts wird gelöscht; danach geht es weiter", async () => {
    const b = await leitungMitSchluessel("f-lesbar");
    const echt = zustand();
    const datei = path.join(ablagen, `keinordner${++nr}`);
    await writeFile(datei, "ich bin eine Datei, kein Verzeichnis");
    process.env.CENTRIC_ZUSTAND = datei;                     // <datei>/schluessel-epoche.json: ENOTDIR
    await expect(E.schluesselEpoche()).rejects.toThrow(/nicht lesbar|nicht schreibbar/);
    expect((await vollausgabe(b.sk)).status, "Vollausgabe").not.toBe(200);
    expect((await anlegen(b.token)).status, "Anlegen").toBe(503);
    expect(await satz(b.sk), "nicht gelöscht (nicht beurteilbar)").not.toBeNull();
    process.env.CENTRIC_ZUSTAND = echt;
    expect((await vollausgabe(b.sk)).status, "mit lesbarer Epoche wieder gültig").toBe(200);
  }, LIMIT);

  it("Zustandsverzeichnis in der Ablage: abgelehnt (es würde mitgesichert)", async () => {
    const b = await leitungMitSchluessel("f-innen");
    process.env.CENTRIC_ZUSTAND = path.join(Z.wurzel, "zustand");
    expect(() => E.zustandsVerzeichnis()).toThrow(/in der Ablage/);
    expect((await vollausgabe(b.sk)).status).not.toBe(200);
    await expect(W.schluesselErneuern({ zustand: Z.wurzel, daten: Z.wurzel })).rejects.toThrow(/in der Ablage/);
  }, LIMIT);

  it("beschädigte Epochendatei: neue Epoche, alter Schlüssel gilt nicht (nie eine alte wiederbeleben)", async () => {
    const b = await leitungMitSchluessel("f-kaputt");
    await writeFile(path.join(zustand(), E.EPOCHE_DATEI), "{kaputt");
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Epochendatei gelöscht: neue Epoche, alter Schlüssel gilt nicht", async () => {
    const b = await leitungMitSchluessel("f-weg");
    await rm(path.join(zustand(), E.EPOCHE_DATEI));
    expect((await vollausgabe(b.sk)).status).toBe(401);
  }, LIMIT);

  it("Werkzeug mit nicht schreibbarem Zustand: Wiederherstellung bricht ab, die Ablage bleibt unberührt", async () => {
    await leitungMitSchluessel("f-werkzeug");
    const sicherung = await sichern();
    const datei = path.join(ablagen, `keinordner${++nr}`);
    await writeFile(datei, "x");
    const vorher = (await readdir(Z.wurzel)).sort();
    await expect(W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false, zustand: datei }))
      .rejects.toThrow(/Schlüsselepoche nicht erneuert/);
    const nachher = (await readdir(Z.wurzel)).sort();
    expect(nachher, "nichts beiseitegelegt, keine Stufe liegen geblieben").toEqual(vorher);
  }, LIMIT);

  it("eine Sicherung, die die Bindung (oder Flüchtiges) enthält, wird nicht zurückgespielt", async () => {
    await leitungMitSchluessel("f-manipuliert");
    const sicherung = await sichern();
    const inhalt = JSON.stringify({ fassung: 1, etag: "x", typ: "json", metadata: {}, daten: { bindung: "0".repeat(32) } });
    await mkdir(path.join(sicherung, "daten", "centric-sitzungen"), { recursive: true });
    await writeFile(path.join(sicherung, "daten", "centric-sitzungen", "skbindung.json"), inhalt);
    const m = JSON.parse(await readFile(path.join(sicherung, "MANIFEST.json"), "utf8"));
    m.dateien.push({ pfad: "centric-sitzungen/skbindung.json", bytes: Buffer.byteLength(inhalt),
      sha256: createHash("sha256").update(inhalt).digest("hex") });
    m.summe = { dateien: m.dateien.length, bytes: m.summe.bytes + Buffer.byteLength(inhalt) };
    const text = JSON.stringify(m, null, 2) + "\n";
    const s = createHash("sha256").update(text).digest("hex");
    await writeFile(path.join(sicherung, "MANIFEST.json"), text);
    await writeFile(path.join(sicherung, "MANIFEST.sha256"), s + "\n");
    await writeFile(path.join(sicherung, "FERTIG"), `FERTIG ${s}\n`);
    expect((await W.pruefen(sicherung)).ok, "formal in Ordnung").toBe(true);
    await expect(W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false }))
      .rejects.toThrow(/nie gesichert werden/);
    expect(await stat(path.join(Z.wurzel, "centric")).then(() => true), "Ablage noch da").toBe(true);
  }, LIMIT);
});

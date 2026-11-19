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

describe("Werkzeug: zwei Wiederherstellungen derselben Wurzel in derselben Sekunde", () => {
  it("beide gelingen, jede legt ihren eigenen, eindeutigen Beiseite-Ordner an (nie in einen gefüllten)", async () => {
    await leitungMitSchluessel("w1-doppelt");
    const sicherung = await sichern();
    const jetzt = new Date();
    const a = await W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false, jetzt });
    const b = await W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false, jetzt });
    expect(a.beiseite).toBeTruthy();
    expect(b.beiseite).toBeTruthy();
    expect(b.beiseite, "eindeutig trotz gleicher Zeit").not.toBe(a.beiseite);
    expect((await readdir(a.beiseite)).sort(), "erster Altinhalt vollständig").toContain("centric");
    expect((await readdir(b.beiseite)).sort(), "zweiter Altinhalt vollständig").toContain("centric");
    expect((await readdir(Z.wurzel)).some((n) => n.startsWith(".wiederherstellung-")), "keine Stufe liegen geblieben").toBe(false);
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
    /* Server steht (wie im Ablauf verlangt); geprüft wird eine Adresse, unter der sicher niemand antwortet. */
    expect(await W.main(["schluessel-erneuern", "--zustand", zustand(), "--daten", Z.wurzel,
      "--server-url", "http://127.0.0.1:9/gesund"])).toBe(0);
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

/* ==========================================================================
   Nachträge aus dem Review von PR #107 (W1–W5 und Hinweise)
   ========================================================================== */

async function bestandAendern(raum, aendern) {
  const g = await Z.B.bestandLesen(Z.laden(), raum);
  const neu = JSON.parse(JSON.stringify(g.bestand));
  aendern(neu);
  const e = await Z.B.bestandSchreiben(Z.laden(), raum, neu, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
}

describe("W1: Ersteller nach der strengen Personenregel (aktivePerson, wie SI-P2)", () => {
  const gestern = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  for (const [fall, aendern] of [
    ["ausgetreten", (p) => ({ ...p, austritt: gestern })],
    ["inaktiv", (p) => ({ ...p, status: "inaktiv" })],
    ["anonymisiert", (p) => ({ ...p, anonym: true })],
  ]) {
    it(`Leitung ${fall}: keine Vollausgabe, Grund sk-person-fehlt`, async () => {
      const b = await leitungMitSchluessel(`w1p-${fall}`);
      await bestandAendern(b.raum, (n) => {
        n.mandanten[0].personen = n.mandanten[0].personen.map((p) => (p.id === "p_1" ? aendern(p) : p));
      });
      const AS = await import("../server/lib/arbeitssitzung.mjs");
      const pr = await AS.sicherungsschluesselPruefen(Z.laden(), await satz(b.sk));
      expect(pr).toMatchObject({ ok: false, grund: "sk-person-fehlt", endgueltig: true });
      const v = await vollausgabe(b.sk);
      expect(v.status).toBe(401);
      expect(v.daten.betrieb).toBeUndefined();
    }, LIMIT);
  }
  it("Gegenprobe: aktive Leitung mit Austritt in der Zukunft behält den Schlüssel", async () => {
    const b = await leitungMitSchluessel("w1p-zukunft");
    await bestandAendern(b.raum, (n) => {
      n.mandanten[0].personen = n.mandanten[0].personen.map((p) => (p.id === "p_1" ? { ...p, austritt: "2099-12-31" } : p));
    });
    expect((await vollausgabe(b.sk)).status).toBe(200);
  }, LIMIT);
});

describe("W4: neue Epoche räumt sofort alle früheren Schlüssel auf (nicht erst beim Gebrauch)", () => {
  it("nach dem Zurückspielen genügt der Serverstart: Schlüssel gelöscht, Vermerk geschrieben, Daten unberührt", async () => {
    const b = await leitungMitSchluessel("w4-start");
    const sicherung = await sichern();
    await W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false });
    expect(await satz(b.sk), "vor dem Start zurückgespielt").not.toBeNull();
    const r = await E.bindungErneuern({ nurWennVorhanden: true });     // was server.mjs beim Start tut
    expect(r.neueEpoche).toBe(true);
    expect(await satz(b.sk), "sofort gelöscht").toBeNull();
    expect(await vermerk(b.sk)).toMatchObject({ grund: "ablage-wiederhergestellt" });
    const { blobs } = await Z.ablageArbeit().list({ prefix: "sk:" });
    expect(blobs.length, "kein früherer Schlüssel übrig").toBe(0);
    expect((await Z.B.bestandLesen(Z.laden(), b.raum)).bestand.mandanten[0].personen.length, "Personaldaten da").toBe(2);
    expect((await vollausgabe(b.sk)).status).toBe(401);
    await neuerSchluesselGeht(b);
  }, LIMIT);

  it("auch beim ersten Gebrauch irgendeines Schlüssels werden alle anderen mit aufgeräumt", async () => {
    const b1 = await leitungMitSchluessel("w4-a");
    const b2 = await leitungMitSchluessel("w4-b");
    const sicherung = await sichern();
    await W.wiederherstellen({ sicherung, ziel: Z.wurzel, ersetzen: true, serverPruefen: false });
    expect((await vollausgabe(b1.sk)).status).toBe(401);
    expect(await satz(b2.sk), "der andere ist schon weg").toBeNull();
    expect(await vermerk(b2.sk)).toMatchObject({ grund: "ablage-wiederhergestellt" });
  }, LIMIT);
});

describe("W2: Bindung beim Beenden und im Minutentakt", () => {
  const quelle = () => readFileSync(path.join(import.meta.dirname, "..", "server.mjs"), "utf8");
  it("server.mjs erneuert die Bindung in beenden() vor dem Prozessende und jede Minute", () => {
    const s = quelle();
    const beenden = s.slice(s.indexOf("function beenden("), s.indexOf('process.on("SIGTERM"'));
    expect(beenden).toMatch(/bindungErneuern\(\{ nurWennVorhanden: true \}\)/);
    expect(beenden).toMatch(/bindungFertig\.finally\(\(\) => process\.exit\(0\)\)/);
    expect(s).toMatch(/setInterval\(bindungTakt, 60_000\)/);
  });

  /* Ablauf wie im Betrieb: Server läuft (seine Start-Erneuerung ist schon geschehen), DANN die heiße Kopie, dann
     Beenden, dann Zurückspielen. Mit SIGTERM erneuert beenden() die Bindung → Kopie veraltet → 401. Gegenprobe SIGKILL
     (kein beenden()): Kopie passt → 200. So belegt der Test den Beenden-Pfad, nicht die Erneuerung beim Start.
     Nur unter Linux/macOS: Unter Windows beendet kill() jeden Prozess hart, auch mit „SIGTERM". */
  async function heisseKopieUndBeenden(was, signal) {
    const { spawn } = await import("node:child_process");
    const b = await leitungMitSchluessel(was);
    const bindung = async () => (await Z.ablageArbeit().get("skbindung", { type: "json" }))?.bindung;
    const vorStart = await bindung();
    expect(vorStart, "Bindung besteht schon (Schlüssel angelegt)").toBeTruthy();
    const statik = await mkdtemp(path.join(tmpdir(), "centric-skwieder-statik-"));
    await writeFile(path.join(statik, "index.html"), "<!doctype html><title>x</title>");
    const port = 20000 + Math.floor(Math.random() * 20000);
    const kind = spawn(process.execPath, ["server.mjs"], { cwd: path.join(import.meta.dirname, ".."),
      env: { ...process.env, PORT: String(port), CENTRIC_STATIK: statik, CENTRIC_DATEN: Z.wurzel,
        CENTRIC_ADMIN: "testgeheim", CENTRIC_AUFRAEUMEN: "aus", CENTRIC_UEBERWACHUNG: "aus", CENTRIC_ZUSTELL_TAKT: "aus" },
      stdio: "ignore" });
    const beendet = new Promise((r) => kind.once("exit", r));
    try {
      let bereit = false;
      for (let i = 0; i < 150 && !bereit; i++) {
        const antwortet = await fetch(`http://127.0.0.1:${port}/gesund`).then((r) => r.status > 0, () => false);
        bereit = antwortet && (await bindung()) !== vorStart;          // Server oben UND Start-Erneuerung erfolgt
        if (!bereit) await new Promise((r) => setTimeout(r, 100));
      }
      expect(bereit, "Server kam hoch und hat die Bindung beim Start erneuert").toBe(true);
      const kopie = path.join(ablagen, `heiss${++nr}`);
      await cp(Z.wurzel, kopie, { recursive: true });                  // heiße Kopie NACH dem Start
      kind.kill(signal);
      await beendet;
      for (const n of await readdir(Z.wurzel)) await rm(path.join(Z.wurzel, n), { recursive: true, force: true });
      await cp(kopie, Z.wurzel, { recursive: true });
      return (await vollausgabe(b.sk)).status;
    } finally {
      if (kind.exitCode === null && kind.signalCode === null) kind.kill("SIGKILL");
      await rm(statik, { recursive: true, force: true });
    }
  }

  it.skipIf(process.platform === "win32")("heiße Kopie nach dem Start, SIGTERM, Kopie zurück: alter Schlüssel gilt nie", async () => {
    expect(await heisseKopieUndBeenden("w2-sigterm", "SIGTERM")).toBe(401);
  }, LIMIT);

  it.skipIf(process.platform === "win32")("Gegenprobe SIGKILL (kein beenden()): dieselbe Kopie passt noch — Restrisiko, dokumentiert", async () => {
    expect(await heisseKopieUndBeenden("w2-sigkill", "SIGKILL")).toBe(200);
  }, LIMIT);
});

describe("Hinweise: Werkzeug, Pfade, /gesund, STORES", () => {
  it("schluessel-erneuern bricht ab, solange ein Server antwortet; die Epoche bleibt", async () => {
    await leitungMitSchluessel("h-server");
    const { createServer } = await import("node:http");
    const srv = createServer((q, a) => { a.end("ok"); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${srv.address().port}/gesund`;
    const vorher = await E.epocheDateiLesen(zustand());
    try {
      expect(await W.main(["schluessel-erneuern", "--zustand", zustand(), "--daten", Z.wurzel, "--server-url", url])).not.toBe(0);
    } finally { await new Promise((r) => srv.close(r)); }
    expect((await E.epocheDateiLesen(zustand())).epoche).toBe(vorher.epoche);
  }, LIMIT);

  it("Zustandsverzeichnis über einen Link in die Ablage: erkannt (echte Pfade), Server und Werkzeug lehnen ab", async () => {
    const { symlinkSync } = await import("node:fs");
    const innen = path.join(Z.wurzel, "versteckt");
    await mkdir(innen, { recursive: true });
    const link = path.join(ablagen, `link${++nr}`);
    symlinkSync(innen, link, process.platform === "win32" ? "junction" : "dir");
    try {
      expect(E.ueberlappen(link, Z.wurzel)).toBe(true);
      expect(E.ueberlappen(path.join(link, "neu", "tiefer"), Z.wurzel), "auch noch nicht vorhandene Unterordner").toBe(true);
      expect(E.ueberlappen(zustand(), Z.wurzel), "Gegenprobe: Geschwister").toBe(false);
      process.env.CENTRIC_ZUSTAND = link;
      expect(() => E.zustandsVerzeichnis()).toThrow(/in der Ablage/);
      expect((await E.zustandPruefen()).stufe).toBe("warnung");
      await expect(W.schluesselErneuern({ zustand: link, daten: Z.wurzel, serverPruefen: false })).rejects.toThrow(/in der Ablage/);
    } finally {
      delete process.env.CENTRIC_ZUSTAND;
      await rm(link, { recursive: true, force: true }).catch(() => {});
      await rm(innen, { recursive: true, force: true });
    }
  }, LIMIT);

  it("/gesund meldet den Zustand: ok im Normalfall, Warnung bei beschädigter Epochendatei (ohne Werte)", async () => {
    await leitungMitSchluessel("h-gesund");
    expect((await E.zustandPruefen()).stufe).toBe("ok");
    const G = await import("../server/lib/gesund.mjs");
    expect((await G.zustand({ frisch: true })).pruefungen.schluessel.stufe).toBe("ok");
    await writeFile(path.join(zustand(), E.EPOCHE_DATEI), "{kaputt");
    const z = await E.zustandPruefen();
    expect(z).toEqual({ stufe: "warnung", text: "Epochendatei beschädigt" });
    const g = await G.zustand({ frisch: true });
    expect(g.pruefungen.schluessel.stufe).toBe("warnung");
    expect(G.oeffentlich(g).status, "kein 503: der Dienst ist nicht gestört").toBe(200);
  }, LIMIT);

  it("STORES/gehoertInSicherung: nur sk:/skw:/skraum: aus der Sitzungsablage, nie t:/ta:/skbindung", () => {
    const enc = (k) => `centric-sitzungen/${[...Buffer.from(k, "utf8")].map((b) => {
      const z = String.fromCharCode(b);
      return /[A-Za-z0-9_-]/.test(z) ? z : "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }).join("")}.json`;
    for (const k of ["sk:abc", "skw:abc", "skraum:r:abc"]) expect(W.gehoertInSicherung(enc(k)), k).toBe(true);
    for (const k of ["t:abc", "ta:abc", "skbindung"]) expect(W.gehoertInSicherung(enc(k)), k).toBe(false);
    expect(W.gehoertInSicherung("centric-accountsitzungen/x.json")).toBe(false);
    expect(W.gehoertInSicherung("centric-takt/x.json")).toBe(false);
    for (const p of W.STORES["centric-sitzungen"].nur)
      for (const k of ["t:", "ta:", "skbindung"]) expect(k.startsWith(p), `${p} würde ${k} sichern`).toBe(false);
  });
});

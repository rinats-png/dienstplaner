/* ==========================================================================
   ABLAGE-PRÜFEN (WP-45b, Review-Befund B1) — der Rückweg bei einer
   unlesbaren Datei

   Seit WP-45 macht eine einzige unlesbare Datei eines Bestands den ganzen
   Raum 503 — auch Wiederherstellen in der App. werkzeug/ablage-pruefen.mjs
   ist der Rückweg: Befund (Trockenlauf), Rückholung einzelner Dateien aus
   einer geprüften Sicherung, sonst Beiseitelegen. Nie löschen, nur bei
   angehaltenem Server.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import path from "node:path";

let wurzel, sicherungen, store, B, A, W, S;

const bestandMit = () => ({ version: 9, mandanten: [{ id: "m1", name: "Haus",
  einheiten: [], dienstarten: [], personen: [],
  abweichungen: { "p1|2025-10-10": "F", "p1|2025-11-03": "S" }, abwesenheiten: [], erfassung: {}, einstempeln: {} }] });

const datei = (schluessel) => path.join(wurzel, "centric", A.dateiname(schluessel));
const lauf = async (...argv) => {
  const zeilen = [];
  const code = await W.main(["--daten", wurzel, ...argv], (s) => zeilen.push(s));
  return { code, aus: zeilen.join("\n") };
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-ablage-pruefen-"));
  sicherungen = await mkdtemp(path.join(tmpdir(), "centric-ablage-pruefen-sich-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  A = await import("../server/lib/ablage.mjs");
  store = A.getStore({ name: "centric", consistency: "strong" });
  B = await import("../server/lib/bestand.mjs");
  W = await import("../werkzeug/ablage-pruefen.mjs");
  S = await import("../werkzeug/ablage-sicherung.mjs");
});
afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
  await rm(sicherungen, { recursive: true, force: true });
});

describe("Trockenlauf", () => {
  it("listet unlesbare Scherbe, Vermerk und Journal je Raum, ändert nichts", async () => {
    const RAUM = "ap-befund";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), "{kaputt");
    await writeFile(datei(`stand:${RAUM}:1`), "{kaputt");
    await writeFile(datei(`journal:${RAUM}`), JSON.stringify({ fassung: 1, etag: "x", typ: "json", metadata: {},
      daten: { id: "j", schritte: [], pruefsumme: "falsch" } }));
    await expect(B.bestandLesen(store, RAUM)).rejects.toMatchObject({ code: "BESTAND_UNLESBAR" });

    const r = await lauf(RAUM);
    expect(r.code, r.aus).toBe(1);
    expect(r.aus).toMatch(/Scherbe .*scherbe:ap-befund:m1:2025-10/);
    expect(r.aus).toMatch(/Standvermerk .*stand:ap-befund:1/);
    expect(r.aus).toMatch(/Journal .*journal:ap-befund/);
    expect(await readFile(datei(`scherbe:${RAUM}:m1:2025-10`), "utf8")).toBe("{kaputt");
  });

  it("verweigert die Arbeit, solange ein lebender Prozess die Ablage hält", async () => {
    await writeFile(path.join(wurzel, ".prozess"),
      JSON.stringify({ pid: process.ppid, start: new Date().toISOString(), rechner: hostname() }));
    try {
      const r = await lauf("--beiseitelegen", "ap-befund");
      expect(r.code).toBe(2);
      expect(r.aus).toMatch(/belegt/);
      expect(await readFile(datei("scherbe:ap-befund:m1:2025-10"), "utf8")).toBe("{kaputt");
    } finally { await rm(path.join(wurzel, ".prozess"), { force: true }); }
  });
});

describe("--beiseitelegen", () => {
  it("legt die Rohbytes als gültigen beiseite-Eintrag ab (kein Byte verloren), dann verschwindet das Original; der Raum ist wieder lesbar, der Monat leer, Schreiben geht weiter", async () => {
    /* Der einzige Vermerk ist selbst unlesbar: kein Abgleich möglich, also
       nichts angefasst (Nachprüfung 3, V1) — erst mit --ohne-vermerk. */
    const ohne = await lauf("--beiseitelegen", "ap-befund");
    expect(ohne.code, ohne.aus).toBe(1);
    expect(ohne.aus).toMatch(/kein lesbarer Vermerk/);
    expect(await readFile(datei("scherbe:ap-befund:m1:2025-10"), "utf8")).toBe("{kaputt");
    const r = await lauf("--beiseitelegen", "--ohne-vermerk", "ap-befund", "ap-befund");
    expect(r.code, r.aus).toBe(0);
    const { blobs } = await store.list({ prefix: "beiseite:ap-befund:" });
    expect(blobs.map((b) => b.key.split(":").slice(3).join(":")).sort())
      .toEqual(["journal:ap-befund", "scherbe:ap-befund:m1:2025-10", "stand:ap-befund:1", "stand:ap-befund:ohne-abgleich"]);
    const kaputt = blobs.find((b) => b.key.endsWith("scherbe:ap-befund:m1:2025-10")).key;
    const huelle = await store.get(kaputt, { type: "json" });
    expect(Buffer.from(huelle.inhaltBase64, "base64").toString("utf8")).toBe("{kaputt");    // kein Byte verloren
    /* … und die Ablage bleibt sicherbar: keine ungültige Datei mehr darin. */
    const { pfad } = await S.sichern({ quelle: wurzel, ziel: sicherungen, jetzt: new Date(Date.now() - 60000) });
    expect((await S.pruefen(pfad)).ok).toBe(true);

    const g = await B.bestandLesen(store, "ap-befund");
    expect(g.bestand.mandanten[0].abweichungen).toEqual({ "p1|2025-11-03": "S" });         // Oktober leer
    const neu = JSON.parse(JSON.stringify(g.bestand));
    neu.mandanten[0].abweichungen["p1|2025-11-04"] = "F";
    expect((await B.bestandSchreiben(store, "ap-befund", neu, { erwarteterStand: g.stand, durch: "Pruefung" })).ok).toBe(true);
  });

  it("einen unlesbaren Kern legt es nicht beiseite", async () => {
    const RAUM = "ap-kern";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const heil = await readFile(datei(`kern:${RAUM}`));
    await writeFile(datei(`kern:${RAUM}`), "{kaputt");
    const r = await lauf("--beiseitelegen", RAUM);
    expect(r.code).toBe(1);
    expect(r.aus).toMatch(/NICHT beiseitegelegt/);
    expect(await readFile(datei(`kern:${RAUM}`), "utf8")).toBe("{kaputt");
    await writeFile(datei(`kern:${RAUM}`), heil);                       // für die folgenden Sicherungen
  });
});

describe("--aus-sicherung", () => {
  it("holt eine unlesbare Scherbe byte-gleich aus einer geprüften Sicherung zurück; die kaputte bleibt beiseite", async () => {
    const RAUM = "ap-sicherung";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const heil = await readFile(datei(`scherbe:${RAUM}:m1:2025-10`));
    const { pfad } = await S.sichern({ quelle: wurzel, ziel: sicherungen });
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), "{kaputt");

    const r = await lauf("--aus-sicherung", pfad, RAUM);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/aus der Sicherung zurückgeholt/);
    expect(Buffer.compare(await readFile(datei(`scherbe:${RAUM}:m1:2025-10`)), heil)).toBe(0);
    const { blobs } = await store.list({ prefix: `beiseite:${RAUM}:` });
    expect(blobs).toHaveLength(1);
    expect((await B.bestandLesen(store, RAUM)).bestand.mandanten[0].abweichungen["p1|2025-10-10"]).toBe("F");
  }, 30000);

  it("eine manipulierte Sicherung wird abgelehnt — nichts verändert", async () => {
    const RAUM = "ap-manipuliert";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const { pfad } = await S.sichern({ quelle: wurzel, ziel: sicherungen, jetzt: new Date(Date.now() + 5000) });
    const inSicherung = path.join(pfad, "daten", "centric", A.dateiname(`scherbe:${RAUM}:m1:2025-10`));
    await writeFile(inSicherung, (await readFile(inSicherung, "utf8")).replace("F", "S"));
    const heil = await readFile(datei(`scherbe:${RAUM}:m1:2025-10`));
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), "{kaputt");

    const r = await lauf("--aus-sicherung", pfad, RAUM);
    expect(r.code).toBe(2);
    expect(r.aus).toMatch(/Sicherung ist nicht in Ordnung/);
    expect(await readFile(datei(`scherbe:${RAUM}:m1:2025-10`), "utf8")).toBe("{kaputt");
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), heil);              // für die folgenden Sicherungen
  }, 30000);
});

describe("Raumlöschung", () => {
  it("räumt beiseitegelegte Dateien des Raums mit ab", async () => {
    const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
    const sitzungen = A.getStore({ name: "centric-sitzungen", consistency: "strong" });
    await raumLoeschen(store, sitzungen, "ap-befund");
    expect((await store.list({ prefix: "beiseite:ap-befund:" })).blobs).toEqual([]);
  });
});

describe("journal-pruefen.mjs legt so beiseite, dass Sicherungen weiterlaufen", () => {
  it("nach --beiseitelegen eines kaputten Journals gelingt die Sicherung", async () => {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const RAUM = "ap-journal";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    await writeFile(datei(`journal:${RAUM}`), "{kaputt");
    const code = await new Promise((fertig) => {
      const k = spawn(process.execPath, ["werkzeug/journal-pruefen.mjs", "--daten", wurzel, "--beiseitelegen", RAUM],
        { cwd: WURZEL, env: { ...process.env, CENTRIC_ABLAGE: "dateien" }, stdio: "ignore" });
      k.on("exit", fertig);
    });
    expect(code).toBe(0);
    const huelle = (await store.list({ prefix: `journal-beiseite:${RAUM}:` })).blobs[0];
    expect(Buffer.from((await store.get(huelle.key, { type: "json" })).inhaltBase64, "base64").toString()).toBe("{kaputt");
    const { pfad } = await S.sichern({ quelle: wurzel, ziel: sicherungen, jetzt: new Date(Date.now() + 60000) });
    expect((await S.pruefen(pfad)).ok).toBe(true);
  }, 30000);
});

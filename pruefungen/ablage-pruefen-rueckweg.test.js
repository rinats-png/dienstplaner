/* ==========================================================================
   ABLAGE-PRÜFEN — Review-Auflagen zu WP-45b (B1–B7)

   Ergänzt pruefungen/ablage-pruefen.test.js um die Fälle, die das
   unabhängige Review als Lücke fand:

   B1  Ein Schreibjournal ist der Festschreibepunkt. Aus einer Sicherung
       zurückgeholt, legt der nächste Zugriff es über Kern und Scherben —
       alte Daten überschrieben neuere still. Journale, Standvermerke und
       der Standzeiger werden deshalb nie zurückgeholt, nur beiseitegelegt.
   B2  Rückholung zuerst daneben schreiben, Hülle als Kopie ablegen, dann
       umbenennen: Ein Abbruch dazwischen lässt den Raum nie ohne Datei.
       Der Befund prüft gegen den Standvermerk und meldet Fehlendes.
   B4  Kern-Rückholung nur mit --kern-zurueck und mit Hinweis auf die Folgen.
   B5  Auch andere unlesbare Dateien, an denen die Sicherung scheitert.
   B6  Puls auf der Prozesssperre; eine fremde, frische Sperre bleibt zu.
   B7  Mehrere Räume ohne Raumangabe, Dateirechte (nur Linux, nicht root).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, stat, utimes, chmod, unlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";

vi.setConfig({ testTimeout: 30000 });            // jeder Lauf sichert, liest und schreibt mehrfach

let wurzel, sicherungen, store, B, A, W, S;
let uhr = Date.now() - 3_600_000;                                  // eindeutige Sicherungszeiten
const naechsteZeit = () => new Date((uhr += 120_000));

const bestandMit = (personen = [{ id: "p1", name: "Erste" }]) => ({ version: 9, mandanten: [{ id: "m1", name: "Haus",
  einheiten: [], dienstarten: [], personen,
  abweichungen: { "p1|2025-10-10": "F", "p1|2025-11-03": "S" }, abwesenheiten: [], erfassung: {}, einstempeln: {} }] });

const datei = (schluessel) => path.join(wurzel, "centric", A.dateiname(schluessel));
const lauf = async (argv, opt) => {
  const zeilen = [];
  const code = await W.main(["--daten", wurzel, ...argv], (s) => zeilen.push(s), opt);
  return { code, aus: zeilen.join("\n") };
};
const sichern = async () => (await S.sichern({ quelle: wurzel, ziel: sicherungen, jetzt: naechsteZeit() })).pfad;
const personen = async (raum) => (await B.bestandLesen(store, raum)).bestand.mandanten[0].personen.map((p) => p.id);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-ablage-rueckweg-"));
  sicherungen = await mkdtemp(path.join(tmpdir(), "centric-ablage-rueckweg-sich-"));
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

describe("B1 — Journal, Vermerk und Zeiger kommen nie aus der Sicherung", () => {
  it("ein Journal aus der Sicherung überschreibt keine neueren Daten (p3 bleibt)", async () => {
    const RAUM = "rw-journal";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    /* Ein gültiges Journal mit dem alten Stand liegt in der Sicherung —
       so, wie es nach einem Absturz mitten im Schreiben gesichert würde. */
    const kern = await store.getWithMetadata(`kern:${RAUM}`, { type: "json" });
    const schritte = [{ art: "setzen", schluessel: `kern:${RAUM}`, wert: kern.data, metadata: kern.metadata }];
    await store.setJSON(`journal:${RAUM}`, { id: "alt", stand: 1, zeit: new Date().toISOString(), schritte,
      pruefsumme: createHash("sha256").update(JSON.stringify(schritte)).digest("hex") });
    const pfad = await sichern();
    await store.delete(`journal:${RAUM}`);

    const g = await B.bestandLesen(store, RAUM);
    const neu = bestandMit([{ id: "p1", name: "Erste" }, { id: "p3", name: "Dritte" }]);
    expect((await B.bestandSchreiben(store, RAUM, neu, { erwarteterStand: g.stand, durch: "Pruefung" })).ok).toBe(true);
    expect(await personen(RAUM)).toEqual(["p1", "p3"]);
    await writeFile(datei(`journal:${RAUM}`), "{kaputt");

    const r = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/Journal .*\n\s+nicht aus der Sicherung/);
    expect(await personen(RAUM)).toEqual(["p1", "p3"]);                       // nichts Neueres verloren
    expect((await B.journalPruefen(store, RAUM)).zustand).toBe("keins");
    const { blobs } = await store.list({ prefix: `beiseite:${RAUM}:` });
    expect(blobs.map((b) => b.key)).toEqual([expect.stringMatching(new RegExp(`:journal:${RAUM}$`))]);
  }, 30000);

  it("Standvermerk und Standzeiger werden beiseitegelegt und neu berechnet, nicht zurückgeholt", async () => {
    const RAUM = "rw-vermerk";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const pfad = await sichern();                                              // Zeiger dort: Stand 1
    const g = await B.bestandLesen(store, RAUM);
    const neu = bestandMit([{ id: "p1", name: "Erste" }, { id: "p3", name: "Dritte" }]);
    await B.bestandSchreiben(store, RAUM, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    const stand = Number((await B.bestandLesen(store, RAUM)).stand);
    expect(stand).toBe(2);
    await writeFile(datei(`stand:${RAUM}:aktuell`), "{kaputt");
    await writeFile(datei(`stand:${RAUM}:1`), "{kaputt");

    const r = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/Standzeiger .*\n\s+nicht aus der Sicherung/);
    const zeiger = await store.get(`stand:${RAUM}:aktuell`, { type: "json" });
    expect(zeiger.nr).toBeGreaterThan(stand);                                  // nie der alte Zeiger
    expect(await personen(RAUM)).toEqual(["p1", "p3"]);
    const h = await B.bestandLesen(store, RAUM);
    const weiter = JSON.parse(JSON.stringify(h.bestand));
    weiter.mandanten[0].abweichungen["p1|2025-11-04"] = "F";
    expect((await B.bestandSchreiben(store, RAUM, weiter, { erwarteterStand: h.stand, durch: "Pruefung" })).ok).toBe(true);
  }, 30000);
});

describe("B2 — Abbruch im Rückholfenster, Befund gegen den Vermerk", () => {
  for (const wo of ["rueckholung-geschrieben", "huelle-abgelegt"]) {
    it(`Abbruch bei „${wo}": die Datei bleibt, der Trockenlauf meldet sie, ein zweiter Lauf holt zurück`, async () => {
      const RAUM = `rw-abbruch-${wo.slice(0, 5)}`;
      await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
      const heil = await readFile(datei(`scherbe:${RAUM}:m1:2025-10`));
      const pfad = await sichern();
      await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), "{kaputt");

      const r = await lauf(["--aus-sicherung", pfad, RAUM],
        { schritt: async (name) => { if (name === wo) throw new Error(`simulierter Abbruch (${wo})`); } });
      expect(r.code, r.aus).toBe(2);
      expect(await readFile(datei(`scherbe:${RAUM}:m1:2025-10`), "utf8")).toBe("{kaputt");   // nie ohne Datei
      expect((await stat(datei(`kern:${RAUM}`))).isFile()).toBe(true);
      const t = await lauf([RAUM]);
      expect(t.code, t.aus).toBe(1);
      expect(t.aus).toMatch(new RegExp(`Scherbe .*scherbe:${RAUM}:m1:2025-10`));

      const zwei = await lauf(["--aus-sicherung", pfad, RAUM]);
      expect(zwei.code, zwei.aus).toBe(0);
      expect(Buffer.compare(await readFile(datei(`scherbe:${RAUM}:m1:2025-10`)), heil)).toBe(0);
      /* Kein Zwischenrest, an dem die nächste Sicherung oder der Server hängen bliebe. */
      expect((await S.pruefen(await sichern())).ok).toBe(true);
    }, 30000);
  }

  it("der Trockenlauf meldet eine fehlende Scherbe und einen fehlenden Kern (Rückgabe 1)", async () => {
    const RAUM = "rw-fehlt";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const scherbe = await readFile(datei(`scherbe:${RAUM}:m1:2025-10`));
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));
    const r = await lauf([RAUM]);
    expect(r.code, r.aus).toBe(1);
    expect(r.aus).toMatch(new RegExp(`Scherbe .*scherbe:${RAUM}:m1:2025-10 — fehlt`));
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), scherbe);

    const kern = await readFile(datei(`kern:${RAUM}`));
    await unlink(datei(`kern:${RAUM}`));
    const k = await lauf([RAUM]);
    expect(k.code, k.aus).toBe(1);
    expect(k.aus).toMatch(new RegExp(`Kern .*kern:${RAUM} — fehlt`));
    await writeFile(datei(`kern:${RAUM}`), kern);
    expect((await lauf([RAUM])).code).toBe(0);
  });

  it("eine fehlende Scherbe wird aus der Sicherung zurückgeholt", async () => {
    const RAUM = "rw-fehlt-sich";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const pfad = await sichern();
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));
    const r = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(r.code, r.aus).toBe(0);
    expect((await B.bestandLesen(store, RAUM)).bestand.mandanten[0].abweichungen["p1|2025-10-10"]).toBe("F");
  }, 30000);

  it("--beiseitelegen nimmt eine fehlende Scherbe als leeren Monat hin und gleicht den Stand an", async () => {
    const RAUM = "rw-fehlt-hin";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));
    const r = await lauf(["--beiseitelegen", RAUM]);
    expect(r.code, r.aus).toBe(0);
    expect(r.aus).toMatch(/leer/);
    expect((await lauf([RAUM])).code).toBe(0);
  });
});

describe("B4 — Kern aus der Sicherung nur ausdrücklich", () => {
  it("ohne --kern-zurueck bleibt der Kern, mit Flag kommt er zurück und die Folgen werden genannt", async () => {
    const RAUM = "rw-kern";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const heil = await readFile(datei(`kern:${RAUM}`));
    const pfad = await sichern();
    await writeFile(datei(`kern:${RAUM}`), "{kaputt");

    const ohne = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(ohne.code, ohne.aus).toBe(1);
    expect(ohne.aus).toMatch(/--kern-zurueck/);
    expect(ohne.aus).toMatch(/Personen, Dienstarten/);
    expect(await readFile(datei(`kern:${RAUM}`), "utf8")).toBe("{kaputt");

    const mit = await lauf(["--aus-sicherung", pfad, "--kern-zurueck", RAUM]);
    expect(mit.code, mit.aus).toBe(0);
    expect(mit.aus).toMatch(/Personen, Dienstarten/);
    expect(await personen(RAUM)).toEqual(["p1"]);
    expect((await store.list({ prefix: `beiseite:${RAUM}:` })).blobs).toHaveLength(1);
    expect(heil.length).toBeGreaterThan(0);
  }, 30000);

  it("--kern-zurueck ohne --aus-sicherung wird abgelehnt", async () => {
    const r = await lauf(["--kern-zurueck"]);
    expect(r.code).toBe(2);
  });
});

describe("B5 — auch andere Dateien, an denen die Sicherung scheitert", () => {
  it("meldet unlesbare App-Sicherung und Sitzung, fasst sie nicht an (Rückgabe 1)", async () => {
    const appSicherung = datei("sicherung:rw-sonst:2025-10-01");
    await writeFile(appSicherung, "{kaputt");
    const sitzungDatei = path.join(wurzel, "centric-sitzungen", A.dateiname("sk:rw-probe"));
    await A.getStore({ name: "centric-sitzungen", consistency: "strong" }).setJSON("sk:rw-probe", { x: 1 });
    await writeFile(sitzungDatei, "{kaputt");
    try {
      const r = await lauf([]);
      expect(r.code, r.aus).toBe(1);
      expect(r.aus).toMatch(/centric\/sicherung%3Arw-sonst|sicherung:rw-sonst/);
      expect(r.aus).toMatch(/centric-sitzungen/);
      expect(r.aus).not.toMatch(/Keine unlesbaren Dateien/);
      const b = await lauf(["--beiseitelegen"]);
      expect(b.code, b.aus).toBe(1);
      expect(await readFile(appSicherung, "utf8")).toBe("{kaputt");            // nichts automatisch
      expect(await readFile(sitzungDatei, "utf8")).toBe("{kaputt");
    } finally {
      await unlink(appSicherung);
      await unlink(sitzungDatei);
    }
    expect((await lauf([])).code).toBe(0);
  }, 30000);
});

describe("B6 — Prozesssperre", () => {
  it("eine fremde, frische Sperre (anderer Rechner) bleibt zu — nichts verändert", async () => {
    const RAUM = "rw-fremd";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), "{kaputt");
    const sperre = path.join(wurzel, ".prozess");
    await writeFile(sperre, JSON.stringify({ pid: 1, start: new Date().toISOString(), rechner: "anderer-container" }));
    try {
      const r = await lauf(["--beiseitelegen", RAUM]);
      expect(r.code).toBe(2);
      expect(r.aus).toMatch(/belegt/);
      expect(r.aus).toMatch(/45/);                                              // Hinweis auf die Wartezeit
      expect(await readFile(datei(`scherbe:${RAUM}:m1:2025-10`), "utf8")).toBe("{kaputt");
      /* Älter als 45 Sekunden ohne Puls: veraltet, wird übernommen. */
      const alt = new Date(Date.now() - 60_000);
      await utimes(sperre, alt, alt);
      const r2 = await lauf(["--beiseitelegen", RAUM]);
      expect(r2.code, r2.aus).toBe(0);
    } finally { await rm(sperre, { force: true }); }
  });

  it("hält die Sperre mit Puls, solange es arbeitet", async () => {
    const sperre = path.join(wurzel, ".prozess");
    let vorher = null, nachher = null;
    const r = await lauf([], {
      pulsMs: 20,
      schritt: async (name) => {
        if (name !== "nach-befund") return;
        const alt = new Date(Date.now() - 30_000);
        await utimes(sperre, alt, alt);
        vorher = (await stat(sperre)).mtimeMs;
        await new Promise((f) => setTimeout(f, 300));
        nachher = (await stat(sperre)).mtimeMs;
      },
    });
    expect(r.code, r.aus).toBe(0);
    expect(nachher).toBeGreaterThan(vorher);
  });
});

describe("B7 — mehrere Räume, Dateirechte", () => {
  it("ohne Raumangabe: alle betroffenen Räume in einem Lauf", async () => {
    for (const raum of ["rw-mehr-a", "rw-mehr-b"]) {
      await B.bestandSchreiben(store, raum, bestandMit(), { durch: "Pruefung" });
      await writeFile(datei(`scherbe:${raum}:m1:2025-11`), "{kaputt");
    }
    const t = await lauf([]);
    expect(t.code, t.aus).toBe(1);
    expect(t.aus).toMatch(/rw-mehr-a: 1/);
    expect(t.aus).toMatch(/rw-mehr-b: 1/);
    const r = await lauf(["--beiseitelegen"]);
    expect(r.code, r.aus).toBe(0);
    for (const raum of ["rw-mehr-a", "rw-mehr-b"])
      expect((await B.bestandLesen(store, raum)).bestand.mandanten[0].abweichungen).toEqual({ "p1|2025-10-10": "F" });
    expect((await S.pruefen(await sichern())).ok).toBe(true);
  }, 30000);

  const linuxOhneRoot = process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0;
  it.skipIf(!linuxOhneRoot)("eine Datei ohne Leserecht wird gemeldet; Zurückgeholtes hat 0600", async () => {
    const RAUM = "rw-rechte";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const pfad = await sichern();
    await chmod(datei(`scherbe:${RAUM}:m1:2025-10`), 0o000);
    const t = await lauf([RAUM]);
    expect(t.code, t.aus).toBe(1);
    expect(t.aus).toMatch(/EACCES|permission denied/i);
    const r = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(r.code, r.aus).toBe(0);
    expect((await stat(datei(`scherbe:${RAUM}:m1:2025-10`))).mode & 0o777).toBe(0o600);
    const reste = (await readdir(path.join(wurzel, "centric"))).filter((n) => n.endsWith(".tmp"));
    expect(reste).toEqual([]);
  }, 30000);
});

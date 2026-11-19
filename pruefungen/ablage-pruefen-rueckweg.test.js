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
    expect(r.aus).toMatch(/journal:rw-journal: beiseitegelegt .*nie aus der Sicherung: Festschreibepunkt/);
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
    expect(r.aus).toMatch(/stand:rw-vermerk:aktuell: beiseitegelegt .*nie aus der Sicherung/);
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

  it("eine fehlende Scherbe nimmt nur --fehlende-hinnehmen <raum>:<monat> hin — mit Spur in der Ablage", async () => {
    const RAUM = "rw-fehlt-hin";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));
    const nurBeiseite = await lauf(["--beiseitelegen", RAUM]);
    expect(nurBeiseite.code, nurBeiseite.aus).toBe(1);
    expect(nurBeiseite.aus).toMatch(/--fehlende-hinnehmen rw-fehlt-hin:2025-10/);
    expect((await lauf([RAUM])).aus).toMatch(/scherbe:rw-fehlt-hin:m1:2025-10 — fehlt/);
    expect((await lauf(["--fehlende-hinnehmen", "2025-10"])).code).toBe(2);                 // Raum ist Pflicht

    const r = await lauf(["--fehlende-hinnehmen", `${RAUM}:2025-10`]);
    expect(r.code, r.aus).toBe(0);
    const { blobs } = await store.list({ prefix: `beiseite:${RAUM}:` });
    expect(blobs).toHaveLength(1);
    const spur = await store.get(blobs[0].key, { type: "json" });
    expect(spur).toMatchObject({ fehlte: true, original: `scherbe:${RAUM}:m1:2025-10` });
    expect(spur.durch).toMatch(/--fehlende-hinnehmen/);
    expect(spur.zeit).toBeTruthy();
    expect((await lauf([RAUM])).code).toBe(0);
  });

  it("N2: --beiseitelegen ohne Raum leert keinen fehlenden Monat eines anderen Raums", async () => {
    const A_ = "rw-n2-journal", B_ = "rw-n2-fehlt";
    await B.bestandSchreiben(store, A_, bestandMit(), { durch: "Pruefung" });
    await B.bestandSchreiben(store, B_, bestandMit(), { durch: "Pruefung" });
    await writeFile(datei(`journal:${A_}`), "{kaputt");
    const okt = await readFile(datei(`scherbe:${B_}:m1:2025-10`));
    await unlink(datei(`scherbe:${B_}:m1:2025-10`));
    const r = await lauf(["--beiseitelegen"]);
    expect(r.code, r.aus).toBe(1);
    expect((await B.journalPruefen(store, A_)).zustand).toBe("keins");                    // A erledigt
    const t = await lauf([B_]);
    expect(t.code, t.aus).toBe(1);
    expect(t.aus).toMatch(new RegExp(`scherbe:${B_}:m1:2025-10 — fehlt`));               // B weiter sichtbar
    await writeFile(datei(`scherbe:${B_}:m1:2025-10`), okt);
    expect((await lauf([])).code).toBe(0);
  });

  it("N1: bleibt im Raum etwas offen, wird nichts angefasst und nicht angeglichen", async () => {
    const RAUM = "rw-n1";
    const ohneOkt = bestandMit();
    delete ohneOkt.mandanten[0].abweichungen["p1|2025-10-10"];
    await B.bestandSchreiben(store, RAUM, ohneOkt, { durch: "Pruefung" });
    const pfad = await sichern();                                                       // Sicherung ohne Oktober
    const g = await B.bestandLesen(store, RAUM);
    await B.bestandSchreiben(store, RAUM, bestandMit(), { erwarteterStand: g.stand, durch: "Pruefung" });
    const okt = await readFile(datei(`scherbe:${RAUM}:m1:2025-10`));
    await writeFile(datei(`stand:${RAUM}:aktuell`), "{kaputt");
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));

    const r = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(r.code, r.aus).toBe(1);
    expect(r.aus).not.toMatch(/Stand angeglichen/);
    expect(r.aus).not.toMatch(/wieder lesbar/);
    expect(await readFile(datei(`stand:${RAUM}:aktuell`), "utf8")).toBe("{kaputt");    // nichts angefasst
    const t = await lauf([RAUM]);
    expect(t.code, t.aus).toBe(1);
    expect(t.aus).toMatch(new RegExp(`scherbe:${RAUM}:m1:2025-10 — fehlt`));
    expect(t.aus).toMatch(/Standzeiger/);
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), okt);
    const fertig = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(fertig.code, fertig.aus).toBe(0);
    expect((await B.bestandLesen(store, RAUM)).bestand.mandanten[0].abweichungen["p1|2025-10-10"]).toBe("F");
  });

  it("--aus-sicherung mit --beiseitelegen: zurück, was in der Sicherung liegt, Rest beiseite", async () => {
    const RAUM = "rw-gemischt";
    const ohneOkt = bestandMit();
    delete ohneOkt.mandanten[0].abweichungen["p1|2025-10-10"];
    await B.bestandSchreiben(store, RAUM, ohneOkt, { durch: "Pruefung" });
    const pfad = await sichern();                                                       // nur November
    const g = await B.bestandLesen(store, RAUM);
    await B.bestandSchreiben(store, RAUM, bestandMit(), { erwarteterStand: g.stand, durch: "Pruefung" });
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), "{kaputt");
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-11`), "{kaputt");
    const r = await lauf(["--aus-sicherung", pfad, "--beiseitelegen", RAUM]);
    expect(r.code, r.aus).toBe(0);
    expect((await B.bestandLesen(store, RAUM)).bestand.mandanten[0].abweichungen).toEqual({ "p1|2025-11-03": "S" });
  });

  it("N4: kaputtes Journal plus fehlende Scherbe — der Abgleich läuft, ohne Sicherung bleibt der Raum unangetastet", async () => {
    const RAUM = "rw-n4";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const okt = await readFile(datei(`scherbe:${RAUM}:m1:2025-10`));
    await writeFile(datei(`journal:${RAUM}`), "{kaputt");
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));

    const t = await lauf([RAUM]);
    expect(t.code, t.aus).toBe(1);
    expect(t.aus).toMatch(/Journal .*journal:rw-n4/);
    expect(t.aus).toMatch(/scherbe:rw-n4:m1:2025-10 — fehlt/);

    const r = await lauf(["--beiseitelegen", RAUM]);
    expect(r.code, r.aus).toBe(1);
    expect(r.aus).not.toMatch(/Stand angeglichen/);
    expect(await readFile(datei(`journal:${RAUM}`), "utf8")).toBe("{kaputt");            // nichts angefasst
    expect((await lauf([RAUM])).aus).toMatch(/scherbe:rw-n4:m1:2025-10 — fehlt/);
    await writeFile(datei(`scherbe:${RAUM}:m1:2025-10`), okt);
    await unlink(datei(`journal:${RAUM}`));
  });

  it("N4: kaputtes Journal plus fehlende Scherbe, Oktober in der Sicherung — zurückgeholt, nicht verloren", async () => {
    const RAUM = "rw-n4-sich";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const pfad = await sichern();
    await writeFile(datei(`journal:${RAUM}`), "{kaputt");
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));
    const r = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(r.code, r.aus).toBe(0);
    expect((await B.bestandLesen(store, RAUM)).bestand.mandanten[0].abweichungen["p1|2025-10-10"]).toBe("F");
    expect((await B.journalPruefen(store, RAUM)).zustand).toBe("keins");
  });

  it("N5: Rückholung vor dem Beiseitelegen — ein Abbruch dazwischen lässt den Raum gesperrt, nicht lückenhaft", async () => {
    const RAUM = "rw-n5";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const pfad = await sichern();
    await writeFile(datei(`stand:${RAUM}:aktuell`), "{kaputt");
    await unlink(datei(`scherbe:${RAUM}:m1:2025-10`));
    const r = await lauf(["--aus-sicherung", pfad, RAUM],
      { schritt: async (name) => { if (name === "rueckholung-geschrieben") throw new Error("simulierter Abbruch"); } });
    expect(r.code, r.aus).toBe(2);
    expect(await readFile(datei(`stand:${RAUM}:aktuell`), "utf8")).toBe("{kaputt");   // Zeiger noch nicht beiseite
    const t = await lauf([RAUM]);
    expect(t.aus).toMatch(/scherbe:rw-n5:m1:2025-10 — fehlt/);
    const zwei = await lauf(["--aus-sicherung", pfad, RAUM]);
    expect(zwei.code, zwei.aus).toBe(0);
    expect((await B.bestandLesen(store, RAUM)).bestand.mandanten[0].abweichungen["p1|2025-10-10"]).toBe("F");
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
  }, 60000);                                                         // unter Last lokal über 30 s

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

describe("4. Nachprüfung — K2 und Standfolge nach einer Wiederherstellung", () => {
  const zweiBetriebe = (mitDez) => ({ version: 9, mandanten: ["m1", "m2"].map((id) => ({ id, name: id,
    einheiten: [], dienstarten: [], personen: [{ id: `${id}p`, name: id }],
    abweichungen: { [`${id}p|2025-10-10`]: "F", ...(mitDez ? { [`${id}p|2025-12-01`]: "S" } : {}) },
    abwesenheiten: [], erfassung: {}, einstempeln: {} })) });

  it("K2: Kern kaputt, aktueller Vermerk und Zeiger weg, Dezember m1 weg — Bezug unvollständig, nichts angeglichen", async () => {
    const RAUM = "rw-k2";
    await B.bestandSchreiben(store, RAUM, zweiBetriebe(false), { durch: "Pruefung" });
    const pfad = await sichern();                                                       // Stand 1, ohne Dezember
    const g = await B.bestandLesen(store, RAUM);
    await B.bestandSchreiben(store, RAUM, zweiBetriebe(true), { erwarteterStand: g.stand, durch: "Pruefung" });
    await writeFile(datei(`kern:${RAUM}`), "{kaputt");
    await unlink(datei(`stand:${RAUM}:2`));
    await unlink(datei(`stand:${RAUM}:aktuell`));
    await unlink(datei(`scherbe:${RAUM}:m1:2025-12`));
    try {
      const t = await lauf([RAUM]);
      expect(t.code, t.aus).toBe(1);
      expect(t.aus).toMatch(/Bezug unvollständig/);
      const r = await lauf(["--aus-sicherung", pfad, "--kern-zurueck", RAUM]);
      expect(r.code, r.aus).toBe(1);
      expect(r.aus).not.toMatch(/Stand angeglichen/);
      expect(await readFile(datei(`kern:${RAUM}`), "utf8")).toBe("{kaputt");              // Raum nicht angefasst
      expect((await stat(datei(`scherbe:${RAUM}:m2:2025-12`))).isFile()).toBe(true);
      expect((await lauf([RAUM])).aus).toMatch(/Bezug unvollständig/);                      // weiter sichtbar
    } finally {
      const { raumLoeschen } = await import("../server/lib/raumloeschung.mjs");
      await raumLoeschen(store, A.getStore({ name: "centric-sitzungen", consistency: "strong" }), RAUM);
    }
  });

  it("nach einer vollständigen Wiederherstellung: Sicherungen aus der verworfenen Folge werden abgelehnt", async () => {
    const RAUM = "rw-folge";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const x = await sichern();                                                          // benutzt für die Wiederherstellung
    const g = await B.bestandLesen(store, RAUM);
    await B.bestandSchreiben(store, RAUM, bestandMit([{ id: "p1", name: "Erste" }, { id: "p3", name: "Dritte" }]),
      { erwarteterStand: g.stand, durch: "Pruefung" });
    const y = await sichern();                                                          // danach, vor der Wiederherstellung
    const neu = await mkdtemp(path.join(tmpdir(), "centric-ablage-rueckweg-neu-"));
    try {
      await S.wiederherstellen({ sicherung: x, ziel: neu, serverPruefen: false });
      const vermerk = JSON.parse(await readFile(path.join(neu, ".wiederhergestellt.json"), "utf8"));
      expect(vermerk.wiederherstellungen).toHaveLength(1);                             // seit WP-45d eine Liste
      expect(vermerk.wiederherstellungen[0].sicherungErstellt).toBeTruthy();
      const lauf2 = async (...argv) => {
        const zeilen = [];
        const code = await W.main(["--daten", neu, ...argv], (s) => zeilen.push(s));
        return { code, aus: zeilen.join("\n") };
      };
      const abgelehnt = await lauf2("--aus-sicherung", y, RAUM);
      expect(abgelehnt.code, abgelehnt.aus).toBe(2);
      expect(abgelehnt.aus).toMatch(/verworfenen Folge/);
      const erlaubt = await lauf2("--aus-sicherung", x, RAUM);
      expect(erlaubt.code, erlaubt.aus).toBe(0);
      /* Die Punktdatei stört die nächste Sicherung nicht. */
      const z = await S.sichern({ quelle: neu, ziel: sicherungen, jetzt: naechsteZeit() });
      expect((await S.pruefen(z.pfad)).ok).toBe(true);
    } finally {
      process.env.CENTRIC_DATEN = wurzel;
      await rm(neu, { recursive: true, force: true });
    }
  }, 60000);

  it("W1: mehrere Wiederherstellungen — jede verworfene Folge bleibt abgelehnt", async () => {
    const RAUM = "rw-w1";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const vor = (min) => new Date(Date.now() - min * 60_000);
    const b0 = (await S.sichern({ quelle: wurzel, ziel: sicherungen, jetzt: vor(600) })).pfad;
    const b1 = (await S.sichern({ quelle: wurzel, ziel: sicherungen, jetzt: vor(590) })).pfad;
    const neu = await mkdtemp(path.join(tmpdir(), "centric-ablage-rueckweg-w1-"));
    try {
      await S.wiederherstellen({ sicherung: b0, ziel: neu, serverPruefen: false, jetzt: vor(580) });   // R1
      const b2 = (await S.sichern({ quelle: neu, ziel: sicherungen, jetzt: vor(570) })).pfad;
      const b3 = (await S.sichern({ quelle: neu, ziel: sicherungen, jetzt: vor(565) })).pfad;
      await S.wiederherstellen({ sicherung: b3, ziel: neu, ersetzen: true, serverPruefen: false, jetzt: vor(560) }); // R2
      const v = JSON.parse(await readFile(path.join(neu, ".wiederhergestellt.json"), "utf8"));
      expect(v.wiederherstellungen).toHaveLength(2);
      const lauf2 = async (...argv) => {
        const zeilen = [];
        const code = await W.main(["--daten", neu, ...argv], (s) => zeilen.push(s));
        return { code, aus: zeilen.join("\n") };
      };
      const b1Lauf = await lauf2("--aus-sicherung", b1, RAUM);                          // aus der bei R1 verworfenen Folge
      expect(b1Lauf.code, b1Lauf.aus).toBe(2);
      expect(b1Lauf.aus).toMatch(/verworfenen Folge/);
      for (const ok of [b0, b2, b3]) {
        const r = await lauf2("--aus-sicherung", ok, RAUM);
        expect(r.code, r.aus).toBe(0);
      }
    } finally {
      process.env.CENTRIC_DATEN = wurzel;
      await rm(neu, { recursive: true, force: true });
    }
  }, 60000);

  it("W2: ein vorhandener, aber unlesbarer Vermerk der Wiederherstellung — Abbruch statt still ignoriert", async () => {
    const RAUM = "rw-w2";
    await B.bestandSchreiben(store, RAUM, bestandMit(), { durch: "Pruefung" });
    const pfad = await sichern();
    const vermerk = path.join(wurzel, ".wiederhergestellt.json");
    await writeFile(vermerk, "{kaputt");
    try {
      const r = await lauf(["--aus-sicherung", pfad, RAUM]);
      expect(r.code, r.aus).toBe(2);
      expect(r.aus).toMatch(/wiederhergestellt\.json/);
      await writeFile(vermerk, JSON.stringify({ wiederherstellungen: [{ zeit: "gestern" }] }));
      expect((await lauf(["--aus-sicherung", pfad, RAUM])).code).toBe(2);              // unvollständig = unlesbar
      /* Auch eine neue Wiederherstellung in dieses Ziel bricht ab, bevor etwas angefasst ist. */
      await expect(S.wiederherstellen({ sicherung: pfad, ziel: wurzel, ersetzen: true, serverPruefen: false }))
        .rejects.toThrow(/wiederhergestellt\.json/);
      expect((await stat(datei(`kern:${RAUM}`))).isFile()).toBe(true);
    } finally {
      await rm(vermerk, { force: true });
    }
  }, 60000);
});

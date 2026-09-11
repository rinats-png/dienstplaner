/* ==========================================================================
   ABLAGE — der Dateispeicher hinter getStore()

   Was hier geprüft wird, ist das, worauf sich bestand.mjs und schutz.mjs
   verlassen: Ein Wert kommt so zurück, wie er hineinging; Metadaten bleiben
   erhalten; list() findet genau die Schlüssel mit dem Präfix; ein Schlüssel
   kann das Verzeichnis nicht verlassen; und gleichzeitige Schreibvorgänge
   hinterlassen nie eine halbe Datei.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, getStore;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-ablage-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  ({ getStore } = await import("../netlify/lib/ablage.mjs"));
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

describe("Werte und Formen", () => {
  it("gibt ein Objekt als Objekt und als Text zurück", async () => {
    const s = getStore({ name: "form", consistency: "strong" });
    await s.setJSON("k1", { a: 1, b: [1, 2], c: "ü" });
    expect(await s.get("k1", { type: "json" })).toEqual({ a: 1, b: [1, 2], c: "ü" });
    expect(JSON.parse(await s.get("k1"))).toEqual({ a: 1, b: [1, 2], c: "ü" });
    expect(await s.get("k1", { type: "text" })).toBe(JSON.stringify({ a: 1, b: [1, 2], c: "ü" }));
  });

  it("gibt Text als Text zurück — und als JSON, wenn er welches ist", async () => {
    const s = getStore("form");
    await s.set("t1", "nur Text");
    expect(await s.get("t1")).toBe("nur Text");
    await s.set("t2", '{"x":true}');
    expect(await s.get("t2", { type: "json" })).toEqual({ x: true });
  });

  it("liefert null für Unbekanntes, in jeder Form", async () => {
    const s = getStore("form");
    expect(await s.get("gibt-es-nicht")).toBeNull();
    expect(await s.get("gibt-es-nicht", { type: "json" })).toBeNull();
    expect(await s.getWithMetadata("gibt-es-nicht", { type: "json" })).toBeNull();
    expect(await s.getMetadata("gibt-es-nicht")).toBeNull();
  });

  it("bewahrt Metadaten und liefert einen ETag", async () => {
    const s = getStore("form");
    await s.setJSON("m1", { n: 1 }, { metadata: { stand: 7, zeit: "2026-09-11T00:00:00Z" } });
    const mit = await s.getWithMetadata("m1", { type: "json" });
    expect(mit.data).toEqual({ n: 1 });
    expect(mit.metadata).toEqual({ stand: 7, zeit: "2026-09-11T00:00:00Z" });
    expect(mit.etag).toMatch(/^"[0-9a-f]{32}"$/);
    const nur = await s.getMetadata("m1");
    expect(nur).toEqual({ metadata: mit.metadata, etag: mit.etag });
  });

  it("ändert den ETag mit dem Inhalt, nicht mit den Metadaten", async () => {
    const s = getStore("form");
    await s.setJSON("e1", { v: 1 }, { metadata: { a: 1 } });
    const eins = (await s.getMetadata("e1")).etag;
    await s.setJSON("e1", { v: 1 }, { metadata: { a: 2 } });
    expect((await s.getMetadata("e1")).etag).toBe(eins);
    await s.setJSON("e1", { v: 2 }, { metadata: { a: 2 } });
    expect((await s.getMetadata("e1")).etag).not.toBe(eins);
  });

  it("überschreibt ohne Metadaten mit leeren Metadaten", async () => {
    const s = getStore("form");
    await s.setJSON("m2", { n: 1 }, { metadata: { stand: 1 } });
    await s.setJSON("m2", { n: 2 });
    expect((await s.getMetadata("m2")).metadata).toEqual({});
  });

  it("löscht, und löscht Gelöschtes noch einmal ohne Klage", async () => {
    const s = getStore("form");
    await s.setJSON("d1", 1);
    await s.delete("d1");
    expect(await s.get("d1")).toBeNull();
    await expect(s.delete("d1")).resolves.toBeUndefined();
  });

  it("nimmt bei set() nur Text", async () => {
    const s = getStore("form");
    await expect(s.set("x", /** @type {any} */ ({ a: 1 }))).rejects.toThrow(/setJSON/);
  });
});

describe("Schlüssel und Verzeichnis", () => {
  it("verträgt Doppelpunkt, Schrägstrich, Punkt und Umlaut im Schlüssel", async () => {
    const s = getStore("schluessel");
    const alle = ["scherbe:raum-1:2026-08", "2026-09-11/anmelden/abc", "stand:raum:aktuell",
      "t:" + "f".repeat(64), "über.laut", "a b c", "%41", "."];
    for (const k of alle) await s.setJSON(k, { k });
    for (const k of alle) expect(await s.get(k, { type: "json" })).toEqual({ k });
  });

  it("hält jeden Schlüssel im Verzeichnis des Stores", async () => {
    const s = getStore("gefaengnis");
    for (const k of ["../../ausbruch", "/etc/passwd", "..", "a/../../b"]) await s.setJSON(k, 1);
    const namen = await readdir(path.join(wurzel, "gefaengnis"));
    expect(namen.length).toBe(4);
    for (const n of namen) {
      expect(n).toMatch(/^[A-Za-z0-9_%-]+\.json$/);
      expect(n.startsWith(".")).toBe(false);
    }
    expect(await stat(path.join(wurzel, "ausbruch")).catch(() => null)).toBeNull();
  });

  it("findet mit list() genau die Schlüssel mit dem Präfix, sortiert", async () => {
    const s = getStore("liste");
    for (const k of ["scherbe:r1:2026-09", "scherbe:r1:2026-08", "scherbe:r10:2026-01",
      "scherbe:r2:2026-08", "kern:r1", "stand:r1:1"]) await s.setJSON(k, 1);
    const r1 = (await s.list({ prefix: "scherbe:r1:" })).blobs.map((b) => b.key);
    expect(r1).toEqual(["scherbe:r1:2026-08", "scherbe:r1:2026-09"]);
    const alle = (await s.list()).blobs.map((b) => b.key);
    expect(alle).toHaveLength(6);
    expect(alle).toEqual([...alle].sort());
    expect((await s.list({ prefix: "2026-09-11/" })).blobs).toEqual([]);
  });

  it("listet Schlüssel mit Schrägstrich über ihr Präfix", async () => {
    const s = getStore("spur");
    await s.setJSON("2026-09-11/anmelden/a", 1);
    await s.setJSON("2026-09-11/anmelden/b", 1);
    await s.setJSON("2026-09-11/schreiben/c", 1);
    await s.setJSON("2026-09-12/anmelden/d", 1);
    expect((await s.list({ prefix: "2026-09-11/anmelden/" })).blobs.map((b) => b.key))
      .toEqual(["2026-09-11/anmelden/a", "2026-09-11/anmelden/b"]);
    expect((await s.list({ prefix: "2026-09-11/" })).blobs).toHaveLength(3);
  });

  it("trennt Stores voneinander", async () => {
    await getStore("eins").setJSON("gleich", 1);
    await getStore("zwei").setJSON("gleich", 2);
    expect(await getStore("eins").get("gleich", { type: "json" })).toBe(1);
    expect(await getStore("zwei").get("gleich", { type: "json" })).toBe(2);
    expect((await getStore("drei").list()).blobs).toEqual([]);
  });

  it("weist unzulässige Store-Namen und zu lange Schlüssel ab", async () => {
    expect(() => getStore("../raus")).toThrow(/Store-Name/);
    expect(() => getStore("Groß")).toThrow(/Store-Name/);
    expect(() => getStore("")).toThrow(/Store-Name/);
    await expect(getStore("lang").setJSON("x".repeat(201), 1)).rejects.toThrow(/zu lang/);
    await expect(getStore("lang").setJSON("ü".repeat(70), 1)).rejects.toThrow(/zu lang/);
    await expect(getStore("lang").setJSON("", 1)).rejects.toThrow(/leer/);
  });
});

describe("Unversehrtheit", () => {
  it("hinterlässt nach dem Schreiben keine Zwischendatei", async () => {
    const s = getStore("atomar");
    await s.setJSON("a", { x: 1 });
    const namen = await readdir(path.join(wurzel, "atomar"));
    expect(namen.filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect(namen).toEqual(["a.json"]);
  });

  it("schreibt mit Rechten nur für den Eigentümer", async () => {
    const info = await stat(path.join(wurzel, "atomar", "a.json"));
    expect(info.mode & 0o777).toBe(0o600);
    expect((await stat(path.join(wurzel, "atomar"))).mode & 0o777).toBe(0o700);
  });

  it("übersteht fünfzig gleichzeitige Schreibvorgänge auf einen Schlüssel", async () => {
    const s = getStore("schwarm");
    await Promise.all(Array.from({ length: 50 }, (_, i) => s.setJSON("k", { i, f: "x".repeat(2000) })));
    const wert = await s.get("k", { type: "json" });
    expect(wert.f).toHaveLength(2000);
    expect(wert.i).toBeGreaterThanOrEqual(0);
    expect(wert.i).toBeLessThan(50);
    const namen = await readdir(path.join(wurzel, "schwarm"));
    expect(namen).toEqual(["k.json"]);
    /* Und die Datei ist ein ganzer Umschlag — kein Rest eines anderen. */
    const roh = JSON.parse(await readFile(path.join(wurzel, "schwarm", "k.json"), "utf8"));
    expect(roh.fassung).toBe(1);
    expect(roh.daten).toEqual(wert);
  });

  it("verliert bei gleichzeitigem Schreiben verschiedener Schlüssel keinen", async () => {
    const s = getStore("parallel");
    await Promise.all(Array.from({ length: 200 }, (_, i) => s.setJSON(`p:${i}`, i)));
    expect((await s.list({ prefix: "p:" })).blobs).toHaveLength(200);
    expect(await s.get("p:137", { type: "json" })).toBe(137);
  });

  it("liest, während geschrieben wird, immer einen ganzen Stand", async () => {
    const s = getStore("lesen");
    await s.setJSON("k", { n: 0, f: "a".repeat(5000) });
    let fehler = 0;
    const schreiber = (async () => {
      for (let i = 1; i <= 40; i++) await s.setJSON("k", { n: i, f: String.fromCharCode(97 + (i % 26)).repeat(5000) });
    })();
    const leser = (async () => {
      for (let i = 0; i < 200; i++) {
        const w = await s.get("k", { type: "json" }).catch(() => { fehler++; return null; });
        if (w && w.f.length !== 5000) fehler++;
      }
    })();
    await Promise.all([schreiber, leser]);
    expect(fehler).toBe(0);
  });

  it("räumt Reste abgebrochener Schreibvorgänge beim ersten Zugriff weg", async () => {
    const dir = path.join(wurzel, "reste");
    await (await import("node:fs/promises")).mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "k.json.123.abc.tmp"), "halb");
    await writeFile(path.join(dir, "k.json"), JSON.stringify({ fassung: 1, etag: '"x"', typ: "json", metadata: {}, daten: 1 }));
    const s = getStore("reste");
    expect(await s.get("k", { type: "json" })).toBe(1);        // lesen räumt nicht
    await s.setJSON("neu", 2);                                  // schreiben räumt beim Anlegen
    const namen = await readdir(dir);
    expect(namen.filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect((await s.list()).blobs.map((b) => b.key)).toEqual(["k", "neu"]);
  });

  it("legt ein weggeräumtes Verzeichnis beim Schreiben neu an", async () => {
    const s = getStore("weg");
    await s.setJSON("a", 1);
    await rm(path.join(wurzel, "weg"), { recursive: true, force: true });
    expect((await s.list()).blobs).toEqual([]);
    await s.setJSON("b", 2);
    expect(await s.get("b", { type: "json" })).toBe(2);
  });

  it("nennt bei einer beschädigten Datei den Pfad", async () => {
    const s = getStore("kaputt");
    await s.setJSON("k", 1);
    await writeFile(path.join(wurzel, "kaputt", "k.json"), "{ kein json");
    await expect(s.get("k")).rejects.toThrow(/kaputt.*k\.json.*beschädigt/);
  });
});

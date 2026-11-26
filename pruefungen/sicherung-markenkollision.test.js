/* ==========================================================================
   SICHERUNGSMARKEN — keine Sicherung überschreibt eine andere (CI-Check #577)

   Die Marke einer Sicherung ist Sekunde + vier Zufallsziffern. Bis November
   2026 legten alle Schreibstellen `sicherung:<raum>:<marke>` mit setJSON an:
   Zwei Sicherungen eines Raums in derselben Sekunde mit gleichen Ziffern
   überschrieben einander still. Hier wird sicherungAnlegen gegen die echte
   Dateiablage geprüft — mit festem Zufall, damit die Kollision sicher
   eintritt: nacheinander, gleichzeitig in einem Prozess und gleichzeitig aus
   zwei Node-Prozessen auf derselben Ablage. Dazu die Erschöpfung: alle
   Versuche belegt ⇒ Fehler, nichts überschrieben.

   Nichts davon berührt eine echte Ablage: eigener Wegwerfordner unter dem
   Temp-Verzeichnis; CENTRIC_DATEN zeigt nur dorthin.
   ========================================================================== */

// zeit-ok: Die Marken entstehen aus einer festen Zeit (JETZT); die echte Uhr dient nur als gemeinsamer Startpunkt der beiden Kindprozesse.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MARKE, MARKE_VERSUCHE, markeNeu, sicherungAnlegen } from "../server/lib/sicherungen.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SICHERUNGEN = pathToFileURL(path.join(HIER, "../server/lib/sicherungen.mjs")).href;
const ABLAGE = pathToFileURL(path.join(HIER, "../server/lib/ablage.mjs")).href;

const JETZT = new Date("2026-11-26T09:15:30.123Z");
const FEST = () => 0.4242;                      // immer dieselben Ziffern: 4242
const SEKUNDE = "2026-11-26-09-15-30";

let basis, getStore, zaehler = 0;
const neueAblage = () => getStore(`sm-${++zaehler}`);
const marken = async (store, raum) =>
  (await store.list({ prefix: `sicherung:${raum}:` })).blobs.map((b) => b.key.split(":").pop());

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "centric-markenkollision-"));
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_DATEN = basis;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
});
afterAll(async () => { if (basis) await rm(basis, { recursive: true, force: true }); });

describe("Marke", () => {
  it("Format bleibt: Sekunde + vier Ziffern; der Versuch rückt die Ziffern weiter (auch über 9999 hinaus)", () => {
    expect(markeNeu(JETZT, FEST)).toBe(`${SEKUNDE}-4242`);
    expect(markeNeu(JETZT, FEST, 1)).toBe(`${SEKUNDE}-4243`);
    expect(markeNeu(JETZT, () => 0.99995, 3)).toBe(`${SEKUNDE}-0002`);
    for (const v of [0, 1, 49, 5757, 9999]) expect(MARKE.test(markeNeu(JETZT, FEST, v)), String(v)).toBe(true);
  });
});

describe("sicherungAnlegen gegen die echte Dateiablage", () => {
  it("zwei Sicherungen derselben Sekunde mit gleichen Ziffern: beide bleiben, verschiedene Marken", async () => {
    const store = neueAblage();
    const a = await sicherungAnlegen(store, "r1", { wer: "erste" }, { jetzt: JETZT, zufall: FEST, metadata: { durch: "A" } });
    const b = await sicherungAnlegen(store, "r1", { wer: "zweite" }, { jetzt: JETZT, zufall: FEST, metadata: { durch: "B" } });
    expect(a).toBe(`${SEKUNDE}-4242`);
    expect(b).not.toBe(a);
    expect(MARKE.test(a) && MARKE.test(b)).toBe(true);
    expect(await store.get(`sicherung:r1:${a}`, { type: "json" })).toEqual({ wer: "erste" });
    expect(await store.get(`sicherung:r1:${b}`, { type: "json" })).toEqual({ wer: "zweite" });
    expect((await store.getMetadata(`sicherung:r1:${a}`)).metadata).toEqual({ durch: "A" });
    expect((await store.getMetadata(`sicherung:r1:${b}`)).metadata).toEqual({ durch: "B" });
  });

  it("eine vorhandene Sicherung (auch eine ältere, von Hand gelegte) wird nie überschrieben", async () => {
    const store = neueAblage();
    await store.setJSON(`sicherung:r2:${SEKUNDE}-4242`, { alt: true }, { metadata: { automatisch: "ja" } });
    const m = await sicherungAnlegen(store, "r2", { neu: true }, { jetzt: JETZT, zufall: FEST });
    expect(m).toBe(`${SEKUNDE}-4243`);
    expect(await store.get(`sicherung:r2:${SEKUNDE}-4242`, { type: "json" })).toEqual({ alt: true });
  });

  it("andere Räume stören einander nicht (gleiche Marke in zwei Räumen ist erlaubt)", async () => {
    const store = neueAblage();
    const a = await sicherungAnlegen(store, "ra", { r: "a" }, { jetzt: JETZT, zufall: FEST });
    const b = await sicherungAnlegen(store, "rb", { r: "b" }, { jetzt: JETZT, zufall: FEST });
    expect(a).toBe(b);
    expect(await store.get(`sicherung:ra:${a}`, { type: "json" })).toEqual({ r: "a" });
    expect(await store.get(`sicherung:rb:${b}`, { type: "json" })).toEqual({ r: "b" });
  });

  it("PARALLEL: 30 gleichzeitige Sicherungen eines Raums (verschiedene Betriebe, manuell und automatisch) — alle vorhanden", async () => {
    const store = neueAblage();
    const n = 30;
    const ergebnis = await Promise.all(Array.from({ length: n }, (_, i) =>
      sicherungAnlegen(store, "rp", { i }, { jetzt: JETZT, zufall: FEST,
        metadata: i % 3 === 0 ? { automatisch: "ja" } : { mandantId: `m-${i % 2}` } })));
    expect(new Set(ergebnis).size).toBe(n);
    const liste = await marken(store, "rp");
    expect(liste.sort()).toEqual([...ergebnis].sort());
    for (const m of liste) expect(MARKE.test(m), m).toBe(true);
    const inhalte = await Promise.all(ergebnis.map((m) => store.get(`sicherung:rp:${m}`, { type: "json" })));
    expect(inhalte.map((x) => x.i).sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it("Erschöpfung: alle Versuche belegt ⇒ Fehler, nichts überschrieben, keine neue Datei", async () => {
    const store = neueAblage();
    for (let v = 0; v < MARKE_VERSUCHE; v++)
      await store.setJSON(`sicherung:re:${markeNeu(JETZT, FEST, v)}`, { belegt: v });
    await expect(sicherungAnlegen(store, "re", { neu: true }, { jetzt: JETZT, zufall: FEST }))
      .rejects.toThrow(/belegt.*nichts überschrieben/);
    const liste = await marken(store, "re");
    expect(liste).toHaveLength(MARKE_VERSUCHE);
    for (let v = 0; v < MARKE_VERSUCHE; v++)
      expect(await store.get(`sicherung:re:${markeNeu(JETZT, FEST, v)}`, { type: "json" })).toEqual({ belegt: v });
  });

  it("Höchstzahl gilt: ein Speicher, der immer „belegt“ meldet, wird nicht endlos gefragt", async () => {
    let fragen = 0;
    const immerBelegt = { setJSONWennNeu: async () => { fragen += 1; if (fragen > 1000) throw new Error("Endlosschleife"); return false; } };
    await expect(sicherungAnlegen(immerBelegt, "rx", {}, { jetzt: JETZT, zufall: FEST })).rejects.toThrow(/nichts überschrieben/);
    expect(fragen).toBe(MARKE_VERSUCHE);
  });

  it("fail-closed: eine Ablage ohne atomares Anlegen bekommt keine Sicherung (kein Rückfall auf setJSON)", async () => {
    let geschrieben = 0;
    const ohne = { setJSON: async () => { geschrieben += 1; } };
    await expect(sicherungAnlegen(ohne, "ry", {}, { jetzt: JETZT, zufall: FEST })).rejects.toThrow(/atomares Anlegen/);
    expect(geschrieben).toBe(0);
  });
});

/* Zwei Node-Prozesse auf derselben Ablage: Jeder legt nach einem gemeinsamen
   Startzeitpunkt 15 Sicherungen gleichzeitig an — fester Zufall, dieselbe
   Sekunde. Das Anlegen über link() ist auch zwischen Prozessen atomar. */
function kind(wurzel, store, start, wer, n) {
  const code = `
    const { getStore } = await import(${JSON.stringify(ABLAGE)});
    const { sicherungAnlegen } = await import(${JSON.stringify(SICHERUNGEN)});
    const s = getStore(${JSON.stringify(store)});
    await s.setJSON("aufwaermen:${wer}", { wer: ${JSON.stringify(wer)} });
    while (Date.now() < ${start}) await new Promise((r) => setTimeout(r, 2));
    const jetzt = new Date(${JSON.stringify(JETZT.toISOString())});
    const m = await Promise.all(Array.from({ length: ${n} }, (_, i) =>
      sicherungAnlegen(s, "rm", { wer: ${JSON.stringify(wer)}, i }, { jetzt, zufall: () => 0.4242 })));
    process.stdout.write(JSON.stringify(m));
  `;
  return new Promise((ok, fehler) => {
    const p = spawn(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, CENTRIC_DATEN: wurzel, CENTRIC_ABLAGE: "dateien" }, stdio: ["ignore", "pipe", "pipe"] });
    let aus = "", err = "";
    p.stdout.on("data", (d) => { aus += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (c) => (c === 0 ? ok(JSON.parse(aus.slice(aus.indexOf("[")))) : fehler(new Error(`Kind ${wer}: ${c} ${err}`))));
  });
}

describe("zwei Server-Prozesse auf derselben Ablage", () => {
  it("gleichzeitige Sicherungen aus zwei Prozessen, gleiche Sekunde und Ziffern: alle vorhanden", async () => {
    const name = `sm-${++zaehler}`;
    const start = Date.now() + 1500;
    const [a, b] = await Promise.all([kind(basis, name, start, "A", 15), kind(basis, name, start, "B", 15)]);
    const alle = [...a, ...b];
    expect(new Set(alle).size).toBe(30);
    const store = getStore(name);
    const liste = await marken(store, "rm");
    expect(liste.sort()).toEqual([...alle].sort());
    const inhalte = await Promise.all(liste.map((m) => store.get(`sicherung:rm:${m}`, { type: "json" })));
    expect(inhalte.filter((x) => x.wer === "A")).toHaveLength(15);
    expect(inhalte.filter((x) => x.wer === "B")).toHaveLength(15);
  }, 60000);
});

/* ==========================================================================
   WP-28b — Sicherung unter Last: Klammer des Schreib-Halts (Zustandstest)

   Ergänzt wp28b-sicherung-enoent / wp28b-sicherung-last (ohne Halt) und
   schreibhalt-last (echter Halt, echte Last) um den Teil, den keine dieser
   Prüfungen deterministisch trifft: Störungen MITTEN im gehaltenen Durchgang.
   Der Halt-Kanal ist hier ein Ersatz mit `anfordern()`/`freigeben()`; im
   Moment der Freigabe (Ende der Klammer) wird der Stand der Quelle
   festgehalten. Maßstab jeder erfolgreichen Sicherung: Sie enthält genau
   diesen Stand, und eine Wiederherstellung ergibt ihn Byte für Byte.

   Die Störungen kommen über Haken an readFile, nicht über Zeit:
   - eine Datei steht in der Liste, ist beim Lesen aber weg (ENOENT, wie
     bei einem Ersetzen durch rename, das gerade läuft),
   - eine Datei wird nach dem Lesen, aber vor der Gegenprobe noch einmal
     geschrieben (ein Schreiber, der den Halt nicht kennt).
   Beides darf den gehaltenen Durchgang nie als gültig durchgehen lassen;
   die Sicherung wiederholt kontrolliert und meldet bei Dauerstörung Code 3,
   ohne etwas anzulegen.
   ========================================================================== */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const haken = vi.hoisted(() => ({ vorLesen: null, nachLesen: null }));

vi.mock("node:fs/promises", async (orig) => {
  const m = await orig();
  return {
    ...m,
    readFile: async (p, ...rest) => {
      if (haken.vorLesen) await haken.vorLesen(String(p));
      const inhalt = await m.readFile(p, ...rest);
      if (haken.nachLesen) await haken.nachLesen(String(p));
      return inhalt;
    },
  };
});

let G;
let basis;
let zaehler = 0;
const JETZT = new Date(Date.UTC(2026, 10, 18, 2, 30, 0));

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "wp28b-klammer-"));
  G = await import("../werkzeug/ablage-sicherung.mjs");
});
beforeEach(() => { haken.vorLesen = null; haken.nachLesen = null; });
afterAll(async () => { haken.vorLesen = haken.nachLesen = null; await rm(basis, { recursive: true, force: true }); });

const umschlag = (wert) => JSON.stringify({ fassung: 1, etag: "x", typ: "json", metadata: {}, daten: wert });
/** Schreibt wie die Ablage: erst daneben, dann umbenennen (neue Datei, neue Inode). */
async function ablegen(datei, wert) {
  const tmp = `${datei}.${process.pid}.${++zaehler}.tmp`;
  await writeFile(tmp, umschlag(wert));
  await rename(tmp, datei);
}

async function quelle() {
  const q = path.join(basis, `q-${++zaehler}`);
  await mkdir(path.join(q, "centric"), { recursive: true });
  await mkdir(path.join(q, "centric-spur"), { recursive: true });
  for (let i = 0; i < 4; i++) await ablegen(path.join(q, "centric", `k${i}.json`), { i, v: 0 });
  await ablegen(path.join(q, "centric-spur", "s0.json"), { s: 0 });
  return q;
}
const zielOrdner = async () => { const z = path.join(basis, `s-${++zaehler}`); await mkdir(z, { recursive: true }); return z; };

/** Alle .json-Dateien (Store/Name → Text). Liest am Haken vorbei nicht — die Haken prüfen den Pfad selbst. */
async function baum(wurzel, unterdaten = false) {
  const aus = {};
  const b = unterdaten ? path.join(wurzel, "daten") : wurzel;
  for (const s of await readdir(b, { withFileTypes: true })) {
    if (!s.isDirectory() || s.name.startsWith(".")) continue;
    for (const f of await readdir(path.join(b, s.name)))
      if (f.endsWith(".json")) aus[`${s.name}/${f}`] = (await readFile(path.join(b, s.name, f))).toString("utf8");
  }
  return aus;
}

/**
 * Ersatz für den Halte-Kanal. `vorHalt(n)` läuft beim n-ten Anfordern, BEVOR der Halt gilt (Schreiber noch frei).
 * Bei jeder Freigabe wird der Stand der Quelle festgehalten (`klammern`): das ist der Stand am Ende der Klammer.
 */
function kanal(q, vorHalt = async () => {}) {
  const k = { n: 0, imHalt: false, klammern: /** @type {Record<string,string>[]} */ ([]) };
  k.anfordern = async () => {
    k.n += 1;
    await vorHalt(k.n);
    k.imHalt = true;
    return {
      gehalten: true,
      freigeben: async () => {
        k.imHalt = false;
        const alt = [haken.vorLesen, haken.nachLesen];
        haken.vorLesen = haken.nachLesen = null;          // der Schnappschuss selbst wird nicht gestört
        k.klammern.push(await baum(q));
        [haken.vorLesen, haken.nachLesen] = alt;
        return true;
      },
    };
  };
  return k;
}

/** Erfolgreiche Sicherung: Stand = letzte Klammer, Prüfung ok, Wiederherstellung byte-gleich. */
async function standGleichKlammer(r, k) {
  expect(r.manifest.konsistenz).toBe("schreibhalt");
  expect((await G.pruefen(r.pfad)).ok).toBe(true);
  const klammer = k.klammern.at(-1);
  expect(await baum(r.pfad, true)).toEqual(klammer);
  expect(r.manifest.summe.dateien).toBe(Object.keys(klammer).length);
  const wieder = path.join(basis, `w-${++zaehler}`);
  await mkdir(wieder, { recursive: true });
  await G.wiederherstellen({ sicherung: r.pfad, ziel: wieder, serverPruefen: false });
  expect(await baum(wieder)).toEqual(klammer);
}

describe("WP-28b: Störung im gehaltenen Durchgang", () => {
  it("Datei steht in der Liste, ist beim Lesen weg (ENOENT): Durchgang zählt nicht, Wiederholung, Sicherung = Stand der Klammer", async () => {
    const q = await quelle();
    const k1 = path.join(q, "centric", "k1.json");
    let enoent = 0;
    // Vor dem ersten Halt wird k1 neu geschrieben: es muss im gehaltenen Durchgang nachkopiert werden.
    const k = kanal(q, async (n) => { if (n === 1) await ablegen(k1, { i: 1, v: 1 }); });
    haken.vorLesen = async (p) => {
      if (k.imHalt && k.n === 1 && p === k1 && enoent === 0) {
        enoent += 1;
        const e = new Error(`ENOENT: no such file or directory, open '${p}'`);
        /** @type {any} */ (e).code = "ENOENT";
        throw e;
      }
    };
    const meldungen = [];
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), jetzt: JETZT, pause: 0, versuche: 1, runden: 4,
      meldung: (s) => meldungen.push(s), schreibhalt: k });
    expect(enoent).toBe(1);
    expect(k.n).toBe(2);                                                   // erster Halt verworfen, zweiter gilt
    expect(meldungen.some((s) => /unter dem Schreib-Halt verändert/.test(s))).toBe(true);
    await standGleichKlammer(r, k);
    expect(JSON.parse((await readFile(path.join(r.pfad, "daten", "centric", "k1.json"))).toString()).daten).toEqual({ i: 1, v: 1 });
  });

  it("Datei wird nach dem Lesen, vor der Gegenprobe noch einmal geschrieben: keine veraltete Kopie gilt als gesichert", async () => {
    const q = await quelle();
    const k2 = path.join(q, "centric", "k2.json");
    let nachgeschrieben = 0;
    const k = kanal(q, async (n) => { if (n === 1) await ablegen(k2, { i: 2, v: 1 }); });
    haken.nachLesen = async (p) => {
      // Ein Schreiber, der den Halt nicht kennt, ersetzt k2 direkt nach dem Lesen.
      if (k.imHalt && k.n === 1 && p === k2 && nachgeschrieben === 0) {
        nachgeschrieben += 1;
        await ablegen(k2, { i: 2, v: 2 });
      }
    };
    const meldungen = [];
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), jetzt: JETZT, pause: 0, versuche: 1, runden: 4,
      meldung: (s) => meldungen.push(s), schreibhalt: k });
    expect(nachgeschrieben).toBe(1);
    expect(k.n).toBe(2);
    expect(meldungen.some((s) => /unter dem Schreib-Halt verändert/.test(s))).toBe(true);
    await standGleichKlammer(r, k);
    expect(JSON.parse((await readFile(path.join(r.pfad, "daten", "centric", "k2.json"))).toString()).daten).toEqual({ i: 2, v: 2 });
  });

  it("Datei im Halt endgültig gelöscht: Sicherung enthält sie nicht, Manifest und Wiederherstellung = Stand der Klammer", async () => {
    const q = await quelle();
    const k3 = path.join(q, "centric", "k3.json");
    let geloescht = 0;
    const k = kanal(q, async (n) => { if (n === 1) await ablegen(k3, { i: 3, v: 1 }); });
    haken.vorLesen = async (p) => {
      if (k.imHalt && k.n === 1 && p === k3 && geloescht === 0) { geloescht += 1; await rm(k3); }
    };
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), jetzt: JETZT, pause: 0, versuche: 1, runden: 4, schreibhalt: k });
    expect(geloescht).toBe(1);
    await standGleichKlammer(r, k);
    expect(Object.keys(await baum(r.pfad, true))).not.toContain("centric/k3.json");
  });

  it("Dauerstörung in jedem Halt: kontrolliert wiederholt, dann Code 3 mit klarer Meldung — nichts angelegt, keine Werkstatt", async () => {
    const q = await quelle();
    const k0 = path.join(q, "centric", "k0.json");
    let v = 0;
    const k = kanal(q, async () => { v += 1; await ablegen(k0, { i: 0, v }); });
    haken.vorLesen = async (p) => {
      if (k.imHalt && p === k0) {
        const e = new Error(`ENOENT: no such file or directory, open '${p}'`);
        /** @type {any} */ (e).code = "ENOENT";
        throw e;
      }
    };
    const z = await zielOrdner();
    const meldungen = [];
    const fehler = await G.sichern({ quelle: q, ziel: z, jetzt: JETZT, pause: 0, versuche: 2, runden: 3,
      meldung: (s) => meldungen.push(s), schreibhalt: k }).catch((e) => e);
    expect(fehler).toBeInstanceOf(G.SicherungsFehler);
    expect(fehler.code).toBe(3);
    expect(fehler.message).toMatch(/Nach 2 Versuchen aufgegeben, keine Sicherung angelegt/);
    expect(k.n).toBe(6);                                                   // begrenzt: versuche × runden Halte
    expect(meldungen.filter((s) => /unter dem Schreib-Halt verändert/.test(s))).toHaveLength(6);
    expect(await readdir(z)).toEqual([]);
  });
});

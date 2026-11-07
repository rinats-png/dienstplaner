/* ==========================================================================
   WP-28b (Teil 2) — Sicherung unter parallelen Schreibvorgängen

   Nachweis zu ablage-sicherung.mjs, ausschließlich mit Wegwerf-Daten in
   einem Temp-Verzeichnis. Das Dateisystem ist echt; nur readdir und
   readFile tragen einen Haken, mit dem ein „Schreiber“ genau zwischen zwei
   Schritten der Sicherung eingreift (deterministisch statt zeitabhängig).

   Geprüft wird nicht nur, DASS eine Sicherung entsteht, sondern dass sie
   - genau dem Stand der Quelle am Ende entspricht (keine veraltete Kopie,
     keine gelöschte Datei, keine fehlende neue Datei),
   - zusammengehörige Dateien nie zerrissen zeigt,
   - die Prüfung besteht und sich wiederherstellen lässt (Byte-Vergleich),
   - bei nie endender Last weiter fail-closed mit Code 3 abbricht und
     nichts hinterlässt.
   ========================================================================== */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const haken = vi.hoisted(() => ({ vorLesen: null, vorInnenListe: null }));

vi.mock("node:fs/promises", async (orig) => {
  const m = await orig();
  return {
    ...m,
    readdir: async (p, ...rest) => {
      if (haken.vorInnenListe) await haken.vorInnenListe(String(p));
      return m.readdir(p, ...rest);
    },
    readFile: async (p, ...rest) => {
      if (haken.vorLesen) await haken.vorLesen(String(p));
      return m.readFile(p, ...rest);
    },
  };
});

let G;
let basis;
let zaehler = 0;

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "wp28b-last-"));
  G = await import("../werkzeug/ablage-sicherung.mjs");
});
beforeEach(() => { haken.vorLesen = null; haken.vorInnenListe = null; });
afterAll(async () => { haken.vorLesen = haken.vorInnenListe = null; await rm(basis, { recursive: true, force: true }); });

const umschlag = (wert) => JSON.stringify({ fassung: 1, etag: "x", typ: "json", metadata: {}, daten: wert });
/** Schreibt wie die Ablage: erst daneben, dann umbenennen. */
async function ablegen(datei, wert) {
  const tmp = `${datei}.${process.pid}.${++zaehler}.tmp`;
  await writeFile(tmp, umschlag(wert));
  await rename(tmp, datei);
}

/** Quelle mit zwei Stores und je mehreren Schlüsseln. */
async function quelle(n = 4) {
  const q = path.join(basis, `q-${++zaehler}`);
  await mkdir(path.join(q, "centric"), { recursive: true });
  await mkdir(path.join(q, "centric-spur"), { recursive: true });
  for (let i = 0; i < n; i++) await ablegen(path.join(q, "centric", `k${i}.json`), { i, v: 0 });
  await ablegen(path.join(q, "centric-spur", "s0.json"), { s: 0 });
  return q;
}
const zielOrdner = async () => { const z = path.join(basis, `s-${++zaehler}`); await mkdir(z, { recursive: true }); return z; };
const sichtbar = async (z) => (await readdir(z)).filter((n) => !n.startsWith("."));

/** Kein Versuch wurde verworfen: nur Nachkopier-Runden innerhalb des ersten Versuchs. */
const einVersuch = (meldungen) => !meldungen.some((m) => /^Versuch \d+\/\d+: /.test(m));

/** Alle Dateien der Quelle (Store/Name → Bytes). */
async function baum(wurzel, unterdaten = false) {
  const aus = {};
  const basisPfad = unterdaten ? path.join(wurzel, "daten") : wurzel;
  for (const s of await readdir(basisPfad, { withFileTypes: true })) {
    if (!s.isDirectory() || s.name.startsWith(".")) continue;
    for (const f of await readdir(path.join(basisPfad, s.name)))
      if (f.endsWith(".json")) aus[`${s.name}/${f}`] = (await readFile(path.join(basisPfad, s.name, f))).toString("utf8");
  }
  return aus;
}

describe("WP-28b/2: Verzeichnis verschwindet zwischen Wurzel- und Innenliste", () => {
  it("wird wie jede andere Veränderung wiederholt (kein rohes ENOENT)", async () => {
    const q = await quelle();
    const spur = path.join(q, "centric-spur");
    const weg = path.join(q, ".beiseite");
    let erstes = true;
    // Beim ersten Listen des Store-Verzeichnisses ist es gerade weg (wie bei einer laufenden Wiederherstellung)
    // und kommt kurz danach zurück.
    haken.vorInnenListe = async (p) => {
      if (erstes && p === spur) {
        erstes = false;
        await rename(spur, weg);
        setTimeout(() => { rename(weg, spur).catch(() => {}); }, 1);
      }
    };
    const meldungen = [];
    const z = await zielOrdner();
    const r = await G.sichern({ quelle: q, ziel: z, pause: 20, versuche: 3, meldung: (s) => meldungen.push(s) });
    expect(meldungen.some((s) => /verändert/.test(s))).toBe(true);
    expect((await G.pruefen(r.pfad)).ok).toBe(true);
    expect(r.manifest.dateien.map((d) => d.pfad).sort())
      .toEqual(["centric-spur/s0.json", "centric/k0.json", "centric/k1.json", "centric/k2.json", "centric/k3.json"]);
  });
});

describe("WP-28b/2: Schreibvorgänge während des Kopierens", () => {
  it("eine Schreibwelle verwirft nicht den ganzen Durchgang: die Sicherung zeigt den Endstand und lässt sich wiederherstellen", async () => {
    const q = await quelle(6);
    const ziel = await zielOrdner();
    // Welle: jeder Lesezugriff auf eine andere Datei lässt k0 (schon kopiert) neu schreiben, bis zu 20-mal.
    // Mit „jede Änderung verwirft den ganzen Durchgang“ trifft das alle drei Versuche.
    let n = 0;
    haken.vorLesen = async (p) => {
      if (n < 20 && p.startsWith(q) && p.includes(`${path.sep}centric${path.sep}`) && !p.endsWith("k0.json")) {
        n += 1;
        await ablegen(path.join(q, "centric", "k0.json"), { i: 0, v: n });
        await new Promise((r) => setTimeout(r, 2));    // mtime-Auflösung
      }
    };
    const meldungen = [];
    const r = await G.sichern({ quelle: q, ziel, pause: 0, versuche: 3, meldung: (m) => meldungen.push(m) });
    haken.vorLesen = null;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(einVersuch(meldungen)).toBe(true);

    expect((await G.pruefen(r.pfad)).ok).toBe(true);
    // Endstand: die Sicherung stimmt Byte für Byte mit der Quelle überein.
    expect(await baum(r.pfad, true)).toEqual(await baum(q));
    expect(JSON.parse((await readFile(path.join(r.pfad, "daten", "centric", "k0.json"))).toString()).daten).toEqual({ i: 0, v: n });

    // Wiederherstellung in ein leeres Wegwerf-Ziel.
    const wieder = path.join(basis, `w-${++zaehler}`);
    await mkdir(wieder, { recursive: true });
    await G.wiederherstellen({ sicherung: r.pfad, ziel: wieder, serverPruefen: false });
    expect(await baum(wieder)).toEqual(await baum(q));
  });

  it("zusammengehörige Dateien (Konto + Mitgliedschaft) erscheinen nie zerrissen", async () => {
    const q = await quelle(2);
    const a = path.join(q, "centric", "konto.json");
    const b = path.join(q, "centric", "mitglied.json");
    await ablegen(a, { gen: 1 }); await ablegen(b, { gen: 1 });
    let gesehen = 0;
    haken.vorLesen = async (p) => {
      // Nachdem das Konto gelesen wurde (alter Stand), erscheint bei der Mitgliedschaft schon der neue.
      if (p === b && gesehen === 0) {
        gesehen = 1;
        await new Promise((r) => setTimeout(r, 3));
        await ablegen(a, { gen: 2 });
        await ablegen(b, { gen: 2 });
      }
    };
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3 });
    haken.vorLesen = null;
    const lies = async (n) => JSON.parse(await readFile(path.join(r.pfad, "daten", "centric", n), "utf8")).daten.gen;
    expect(await lies("konto.json")).toBe(await lies("mitglied.json"));
    expect(await baum(r.pfad, true)).toEqual(await baum(q));
  });

  it("gelöschte, verschobene und neu entstandene Dateien: die Sicherung entspricht dem Endstand", async () => {
    const q = await quelle(4);
    let einmal = true;
    haken.vorLesen = async (p) => {
      if (einmal && p.endsWith("k3.json")) {          // alle anderen sind bereits kopiert
        einmal = false;
        await rm(path.join(q, "centric", "k0.json"));                                   // gelöscht
        await rename(path.join(q, "centric", "k1.json"), path.join(q, "centric", "k1neu.json")); // verschoben
        await ablegen(path.join(q, "centric", "k9.json"), { neu: true });                // neu
      }
    };
    const meldungen = [];
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3, meldung: (m) => meldungen.push(m) });
    haken.vorLesen = null;
    expect(einVersuch(meldungen)).toBe(true);
    expect((await G.pruefen(r.pfad)).ok).toBe(true);
    const sicher = await baum(r.pfad, true);
    expect(sicher).toEqual(await baum(q));
    expect(Object.keys(sicher)).not.toContain("centric/k0.json");
    expect(Object.keys(sicher)).toContain("centric/k9.json");
    expect(Object.keys(sicher)).toContain("centric/k1neu.json");
    // Die Zahlen im Manifest passen zur Wirklichkeit.
    expect(r.manifest.summe.dateien).toBe(Object.keys(sicher).length);
    expect(r.manifest.stores.centric.dateien).toBe(Object.keys(sicher).filter((k) => k.startsWith("centric/")).length);
  });

  it("eine Datei ändert ihre Größe und verschwindet dann: keine veraltete Kopie bleibt in der Sicherung", async () => {
    const q = await quelle(4);
    const k2 = path.join(q, "centric", "k2.json");
    let stufe = 0;
    haken.vorLesen = async (p) => {
      if (p.endsWith("k3.json") && stufe === 0) {      // k2 ist schon kopiert → jetzt wird es größer
        stufe = 1;
        await ablegen(k2, { i: 2, lang: "x".repeat(500) });
      } else if (p === k2 && stufe === 1) {            // beim Nachkopieren ist es schon weg
        stufe = 2;
        await rm(k2);
      }
    };
    const meldungen = [];
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3, meldung: (m) => meldungen.push(m) });
    haken.vorLesen = null;
    expect(stufe).toBe(2);
    expect(einVersuch(meldungen)).toBe(true);
    expect((await G.pruefen(r.pfad)).ok).toBe(true);
    const sicher = await baum(r.pfad, true);
    expect(sicher).toEqual(await baum(q));
    expect(Object.keys(sicher)).not.toContain("centric/k2.json");
  });

  it("endet die Last nie, bleibt es beim Abbruch mit Code 3 — nichts angelegt, nichts liegen geblieben", async () => {
    const q = await quelle(3);
    const ziel = await zielOrdner();
    let n = 0;
    haken.vorLesen = async (p) => {
      if (!p.startsWith(q)) return;                    // nur Lesezugriffe auf die Quelle
      n += 1;
      await ablegen(path.join(q, "centric", "k1.json"), { n });
      await new Promise((r) => setTimeout(r, 2));
    };
    let fehler;
    try { await G.sichern({ quelle: q, ziel, pause: 0, versuche: 3 }); } catch (e) { fehler = e; }
    haken.vorLesen = null;
    expect(fehler).toMatchObject({ code: 3 });
    expect(n).toBeGreaterThan(0);
    expect(await sichtbar(ziel)).toEqual([]);
    expect(await readdir(ziel)).toEqual([]);            // auch keine .unfertig-…-Werkstatt
  });
});

describe("WP-28b/2: Review-Befunde", () => {
  it("B1: gleiche Größe UND gleiche mtime nach atomarem Ersetzen wird erkannt (Inode im Fingerabdruck)", async () => {
    const q = await quelle(3);
    const k0 = path.join(q, "centric", "k0.json");
    const T = new Date(Math.floor(Date.now() / 1000) * 1000 - 60000);   // volle Sekunde: verlustfrei setzbar
    await utimes(k0, T, T);
    const alt = await stat(k0);
    let einmal = true;
    haken.vorLesen = async (p) => {
      if (einmal && p.endsWith("k2.json")) {          // k0 ist schon kopiert
        einmal = false;
        await ablegen(k0, { i: 9, v: 0 });             // gleiche Länge wie { i: 0, v: 0 }
        await utimes(k0, T, T);                        // und dieselbe mtime wie zuvor
        expect((await stat(k0)).size).toBe(alt.size);
        expect((await stat(k0)).mtimeMs).toBe(alt.mtimeMs);
      }
    };
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3 });
    haken.vorLesen = null;
    expect(await baum(r.pfad, true)).toEqual(await baum(q));
  });

  it("B2: eine reine Löschung nach der letzten Kopie wird bemerkt (kein Stand ohne die Datei als „stabil“ mit Altlast)", async () => {
    const q = await quelle(3);
    let einmal = true;
    haken.vorLesen = async (p) => {
      if (einmal && p.endsWith("k2.json")) { einmal = false; await rm(path.join(q, "centric", "k0.json")); }
    };
    const meldungen = [];
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3, meldung: (m) => meldungen.push(m) });
    haken.vorLesen = null;
    expect(einVersuch(meldungen)).toBe(true);
    expect((await G.pruefen(r.pfad)).ok).toBe(true);
    const sicher = await baum(r.pfad, true);
    expect(sicher).toEqual(await baum(q));
    expect(Object.keys(sicher)).not.toContain("centric/k0.json");
  });

  it("B3: mehr Dateien als ein stat-Block (64): Liste und Sicherung vollständig, ohne Doppelte", async () => {
    const q = await quelle(150);
    const ansicht = await G.quelleAnsehen(q);
    expect(ansicht.dateien.length).toBe(151);          // 150 + spur/s0
    expect(new Set(ansicht.dateien.map((d) => `${d.store}/${d.name}`)).size).toBe(151);
    expect(ansicht.stores.centric.dateien).toBe(150);
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0 });
    expect(r.manifest.summe.dateien).toBe(151);
    expect(await baum(r.pfad, true)).toEqual(await baum(q));
  });

  it("B5: ein Store ohne Dateien erscheint als Verzeichnis in der Sicherung und wird wiederhergestellt", async () => {
    const q = await quelle(2);
    await rm(path.join(q, "centric-spur", "s0.json"));
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0 });
    expect(r.manifest.stores["centric-spur"].dateien).toBe(0);
    expect(await readdir(path.join(r.pfad, "daten", "centric-spur"))).toEqual([]);
    const wieder = path.join(basis, `w-${++zaehler}`);
    await mkdir(wieder, { recursive: true });
    await G.wiederherstellen({ sicherung: r.pfad, ziel: wieder, serverPruefen: false });
    expect(await readdir(path.join(wieder, "centric-spur"))).toEqual([]);
  });

  it("B6: bricht der Lauf mit einem Fehler ab (hier: beschädigte Datei beim Nachkopieren), bleibt keine Werkstatt im Ziel", async () => {
    const q = await quelle(3);
    let einmal = true;
    haken.vorLesen = async (p) => {
      if (einmal && p.endsWith("k2.json")) {
        einmal = false;
        await writeFile(path.join(q, "centric", "k0.json"), "kein json");   // gleich beim Nachkopieren bemerkt
      }
    };
    const ziel = await zielOrdner();
    let fehler;
    try { await G.sichern({ quelle: q, ziel, pause: 0, versuche: 3 }); } catch (e) { fehler = e; }
    haken.vorLesen = null;
    expect(fehler).toBeDefined();
    expect(fehler.code).not.toBe(3);
    expect(await readdir(ziel)).toEqual([]);
  });
});

describe("WP-28b/2: Transaktions-Schnitt (zwei zusammengehörige Dateien, zweite Datei folgt später)", () => {
  /** Quelle mit Konto + Mitgliedschaft auf Generation 1. */
  async function paarQuelle() {
    const q = await quelle(2);
    await ablegen(path.join(q, "centric", "konto.json"), { gen: 1 });
    await ablegen(path.join(q, "centric", "mitglied.json"), { gen: 1 });
    return q;
  }
  const gen = async (r, n) => JSON.parse(await readFile(path.join(r.pfad, "daten", "centric", n), "utf8")).daten.gen;

  it("Ruhezeit: eine Transaktion, deren zweite Datei erst nach der Lücke kommt, wird nicht mittendrin gesichert", async () => {
    const q = await paarQuelle();
    let angefangen = false;
    // Beginn der Transaktion: Konto wird neu geschrieben, die Mitgliedschaft folgt 150 ms später.
    haken.vorLesen = async (p) => {
      if (!angefangen && p.startsWith(q)) {
        angefangen = true;
        await ablegen(path.join(q, "centric", "konto.json"), { gen: 2 });
        setTimeout(() => { ablegen(path.join(q, "centric", "mitglied.json"), { gen: 2 }).catch(() => {}); }, 150);
      }
    };
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3, ruhe: 600 });
    haken.vorLesen = null;
    await new Promise((res) => setTimeout(res, 200));        // sicher abwarten, dass die Transaktion zu Ende ist
    expect(await gen(r, "konto.json")).toBe(await gen(r, "mitglied.json"));
    expect(await baum(r.pfad, true)).toEqual(await baum(q));
  });

  it("Ruhezeit 0 (Bibliotheksvorgabe) wartet nicht: derselbe Ablauf wird so schnell gesichert, dass die Lücke überrannt wird (Gegenprobe, zeigt die Wirkung der Option)", async () => {
    const q = await paarQuelle();
    let angefangen = false;
    haken.vorLesen = async (p) => {
      if (!angefangen && p.startsWith(q)) {
        angefangen = true;
        await ablegen(path.join(q, "centric", "konto.json"), { gen: 2 });
        setTimeout(() => { ablegen(path.join(q, "centric", "mitglied.json"), { gen: 2 }).catch(() => {}); }, 600);
      }
    };
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3, ruhe: 0 });
    haken.vorLesen = null;
    await new Promise((res) => setTimeout(res, 800));
    // Ohne Ruhezeit ist der Schnitt mitten in der Transaktion möglich und hier die Regel.
    expect(await gen(r, "konto.json")).toBe(2);
    expect(await gen(r, "mitglied.json")).toBe(1);
  });

  it("Kommandozeile: --ruhe wird geprüft; ohne Angabe gilt 1000 ms", async () => {
    const q = await quelle(2);
    const z = await zielOrdner();
    const still = vi.spyOn(console, "error").mockImplementation(() => {});
    const aus = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Review (Opus) Befund 3: nur reine Dezimalzahlen, nichts, was Number() „gut meint“ (leer, 0x10, 1e3, -1, zu groß).
      for (const schlecht of ["abc", "", " ", "0x10", "1e3", "-1", "1.5", "600001", "+5"])
        expect(await G.main(["sichern", "--quelle", q, "--ziel", z, "--ruhe", schlecht]), `--ruhe "${schlecht}"`).toBe(2);
      expect(await readdir(z)).toEqual([]);
      expect(await G.main(["sichern", "--quelle", q, "--ziel", z, "--ruhe", "0"])).toBe(0);
      const t0 = Date.now();
      const z2 = await zielOrdner();
      expect(await G.main(["sichern", "--quelle", q, "--ziel", z2])).toBe(0);
      expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    } finally { still.mockRestore(); aus.mockRestore(); }
  }, 20000);
});

describe("WP-28b/2: echte parallele Schreiber (Zeitverlauf, nur Invarianten)", () => {
  it("jeder Lauf endet entweder mit einer vollständigen, prüfbaren Sicherung des Endstands oder mit Code 3 — nie anders", async () => {
    const q = await quelle(30);
    let aus = false;
    const schreiber = (async () => {
      let i = 0;
      while (!aus) {
        await ablegen(path.join(q, "centric", `k${i % 30}.json`), { w: i });
        if (i % 7 === 0) await rm(path.join(q, "centric", `k${(i + 3) % 30}.json`), { force: true });
        i += 1;
        await new Promise((r) => setTimeout(r, 25));
      }
    })();
    const ausgang = { ok: 0, code3: 0 };
    for (let lauf = 0; lauf < 4; lauf++) {
      const ziel = await zielOrdner();
      try {
        const r = await G.sichern({ quelle: q, ziel, pause: 2, versuche: 3, jetzt: new Date(Date.UTC(2026, 0, 1, 0, 0, lauf)) });
        ausgang.ok += 1;
        expect((await G.pruefen(r.pfad)).ok).toBe(true);
      } catch (e) {
        expect(e).toMatchObject({ code: 3 });          // kein ENOENT, kein anderer Fehler
        ausgang.code3 += 1;
        expect(await readdir(ziel)).toEqual([]);
      }
    }
    aus = true; await schreiber;
    expect(ausgang.ok + ausgang.code3).toBe(4);
    expect(ausgang.ok).toBeGreaterThanOrEqual(1);   // der Erfolgszweig läuft wirklich (mit alter Fassung: 4/24)
  }, 60000);
});

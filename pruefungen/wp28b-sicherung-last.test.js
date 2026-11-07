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
import { mkdtemp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
    const r = await G.sichern({ quelle: q, ziel, pause: 0, versuche: 3 });
    haken.vorLesen = null;
    expect(n).toBeGreaterThanOrEqual(5);

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
    const r = await G.sichern({ quelle: q, ziel: await zielOrdner(), pause: 0, versuche: 3 });
    haken.vorLesen = null;
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
        await new Promise((r) => setTimeout(r, 1));
      }
    })();
    const ausgang = { ok: 0, code3: 0 };
    for (let lauf = 0; lauf < 6; lauf++) {
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
    expect(ausgang.ok + ausgang.code3).toBe(6);
  });
});

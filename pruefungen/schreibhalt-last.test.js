/*
   Last-Probe, ausgelagert aus schreibhalt.test.js: unter Parallelität
   mehrerer Dateien misst sie zu wenig Durchsatz (31/s statt 50/s). Eigener Lauf,
   gleiche Assertions.
*/

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let basis;
let H; let A; let R; let G;
let store;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "wp28c-"));
  process.env.CENTRIC_DATEN = path.join(basis, "daten");
  process.env.CENTRIC_ZUSTAND = path.join(basis, "zustand");
  delete process.env.CENTRIC_SCHREIBHALT_MAX_MS;
  await mkdir(process.env.CENTRIC_DATEN, { recursive: true });
  H = await import("../server/lib/schreibhalt.mjs");
  A = await import("../server/lib/ablage.mjs");
  R = await import("../server/lib/raumsperre.mjs");
  G = await import("../werkzeug/ablage-sicherung.mjs");
  store = A.getStore("centric");
});
/** Eine noch laufende Last (Zeitüberschreitung eines Tests) darf nicht in den nächsten hineinschreiben. */
let laufendeLast = null;
afterEach(async () => {
  if (laufendeLast) { await laufendeLast.stopp(); laufendeLast = null; }
  await H.kanalStoppen();
  H._zuruecksetzen();
  delete process.env.CENTRIC_SCHREIBHALT_MAX_MS;
});
afterAll(async () => { await rm(basis, { recursive: true, force: true }); });

const lies = async (k) => (await store.get(k, { type: "json" }))?.gen ?? null;

describe("Sicherung unter Last mit Schreib-Halt", () => {
  /** Dauerlast: Zwei-Datei-Transaktionen mit Lücke unter der Raumsperre, dazu Einzelschreiber. */
  function last(paare, lueckeMs) {
    let an = true;
    let schreibungen = 0;
    const laeufe = [];
    for (let i = 0; i < paare; i++) {
      laeufe.push((async () => {
        let gen = (await lies(`last-konto-${i}`)) || 0;
        while (an) {
          gen += 1;
          await R.unterRaumsperre(`last-${i}`, async () => {
            await store.setJSON(`last-konto-${i}`, { gen });
            await warte(lueckeMs);
            await store.setJSON(`last-mitglied-${i}`, { gen });
          });
          schreibungen += 2;
          await warte(2);
        }
      })());
    }
    const spur = A.getStore("centric-spur");
    laeufe.push((async () => { let n = 0; while (an) { await spur.setJSON(`rauschen-${n++ % 20}`, { n }); schreibungen += 1; await warte(5); } })());
    const beginn = Date.now();
    return { stopp: async () => { an = false; await Promise.all(laeufe); return { schreibungen, sekunden: (Date.now() - beginn) / 1000 }; } };
  }
  const genIn = async (pfad, k) => JSON.parse(await readFile(path.join(pfad, "daten", "centric", A.dateiname(k)), "utf8")).daten.gen;

  it("10 Sicherungen unter ≥ 50 Schreibvorgängen/s: alle gelingen, keine mitten in einer Transaktion, Wiederherstellung byte-gleich", async () => {
    await H.kanalStarten({ verzeichnis: path.join(process.env.CENTRIC_ZUSTAND, H.HALT_ORDNER), taktMs: 10, protokoll: () => {} });
    const paare = 6;
    const runden = 10;
    const l = last(paare, 5);
    laufendeLast = l;
    const ziel = path.join(basis, "sicherungen");
    const ergebnisse = [];
    try {
      for (let n = 0; n < runden; n++) {
        const r = await G.sichern({ quelle: process.env.CENTRIC_DATEN, ziel, jetzt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)),
          pause: 0, versuche: 1, ruhe: 0,
          schreibhalt: { anfordern: () => H.haltAnfordern(path.join(process.env.CENTRIC_ZUSTAND, H.HALT_ORDNER), { warteMs: 3000 }) } });
        expect(r.manifest.konsistenz).toBe("schreibhalt");
        for (let i = 0; i < paare; i++) {
          const k = await genIn(r.pfad, `last-konto-${i}`).catch(() => null);
          const m = await genIn(r.pfad, `last-mitglied-${i}`).catch(() => null);
          ergebnisse.push(k === m);
        }
        expect((await G.pruefen(r.pfad)).ok).toBe(true);
        if (n === runden - 1) {
          const zurueck = path.join(basis, "zurueck");
          await G.wiederherstellen({ sicherung: r.pfad, ziel: zurueck, serverPruefen: false });
          for (const d of r.manifest.dateien)
            expect((await readFile(path.join(zurueck, d.pfad))).equals(await readFile(path.join(r.pfad, "daten", d.pfad)))).toBe(true);
        } else {
          await rm(r.pfad, { recursive: true, force: true });
        }
      }
    } finally {
      laufendeLast = null;
      const s = await l.stopp();
      expect(s.schreibungen / s.sekunden).toBeGreaterThanOrEqual(50);
    }
    expect(ergebnisse.length).toBe(runden * paare);
    expect(ergebnisse.every(Boolean)).toBe(true);
  }, 180_000);

  it("fremde Anfrage in jedem Halt: kein Manifest mit konsistenz \"schreibhalt\" — Code 3", async () => {
    await H.kanalStarten({ verzeichnis: path.join(process.env.CENTRIC_ZUSTAND, H.HALT_ORDNER), taktMs: 10, protokoll: () => {} });
    const v = path.join(process.env.CENTRIC_ZUSTAND, H.HALT_ORDNER);
    const fehler = await G.sichern({ quelle: process.env.CENTRIC_DATEN, ziel: path.join(basis, "fremd"), pause: 0, versuche: 1, runden: 2, ruhe: 0,
      schreibhalt: { anfordern: async () => {
        const h = await H.haltAnfordern(v, { warteMs: 3000 });
        if (h.gehalten) {
          await writeFile(path.join(v, H.ANFRAGE), JSON.stringify({ fassung: 1, token: "d".repeat(32), fristMs: 1000, erstellt: new Date().toISOString() }));
          await warte(60);                             // der Server soll die fremde Anfrage sehen (Takt 10 ms)
        }
        return h;
      } } }).catch((e) => e);
    expect(fehler.code).toBe(3);
  }, 30_000);

  it("Halt läuft vor dem Abschluss ab: kein Erfolg gemeldet — Code 3, nichts angelegt", async () => {
    const ziel = path.join(basis, "abgelaufen");
    const meldungen = [];
    const fehler = await G.sichern({ quelle: process.env.CENTRIC_DATEN, ziel, pause: 0, versuche: 2, runden: 2, ruhe: 0,
      meldung: (s) => meldungen.push(s),
      schreibhalt: { anfordern: async () => ({ gehalten: true, freigeben: async () => false }) } }).catch((e) => e);
    expect(fehler.code).toBe(3);
    expect(meldungen.some((m) => m.includes("Schreib-Halt vor dem Abschluss abgelaufen"))).toBe(true);
    expect((await readdir(ziel)).filter((n) => !n.startsWith("."))).toEqual([]);
    expect((await readdir(ziel))).toEqual([]);
  });

  it("kein Server antwortet: Rückfall auf die Ruhezeit, ehrlich vermerkt", async () => {
    const verz = path.join(basis, "ohne-server");
    await mkdir(verz, { recursive: true });
    const meldungen = [];
    const r = await G.sichern({ quelle: process.env.CENTRIC_DATEN, ziel: path.join(basis, "rueckfall"), pause: 0, ruhe: 50,
      meldung: (s) => meldungen.push(s), schreibhalt: { anfordern: () => H.haltAnfordern(verz, { warteMs: 100 }) } });
    expect(r.manifest.konsistenz).toBe("ruhezeit");
    expect(meldungen.some((m) => m.includes("Schreib-Halt nicht verfügbar"))).toBe(true);
  });

  it("Kommandozeile: --schreibhalt mit fehlendem Ordner oder Ordner in der Quelle ist Code 2", async () => {
    const z = path.join(basis, "cli");
    expect(await G.main(["sichern", "--quelle", process.env.CENTRIC_DATEN, "--ziel", z, "--schreibhalt", path.join(basis, "gibt-es-nicht")])).toBe(2);
    expect(await G.main(["sichern", "--quelle", process.env.CENTRIC_DATEN, "--ziel", z, "--schreibhalt", path.join(process.env.CENTRIC_DATEN, "centric")])).toBe(2);
  });
});

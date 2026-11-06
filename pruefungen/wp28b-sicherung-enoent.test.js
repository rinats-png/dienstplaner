/* ==========================================================================
   WP-28b — Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab

   Eine Datei, die zwischen readdir und stat ersetzt oder entfernt wird,
   ist eine Veränderung der Quelle. Das Werkzeug muss das als „verändert“
   behandeln und die Sicherung wiederholen (3 Versuche), nicht mit einem
   rohen ENOENT abbrechen. Scheitern alle Versuche, bleibt es beim
   Abbruch mit Code 3 — nie eine halbe Sicherung.

   stat wird hier gezielt gestört; alles andere ist echtes Dateisystem.
   ========================================================================== */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const steuer = vi.hoisted(() => ({ ziel: null, verbleibend: 0, treffer: 0 }));

vi.mock("node:fs/promises", async (orig) => {
  const m = await orig();
  return {
    ...m,
    stat: async (p, ...rest) => {
      if (steuer.ziel && String(p) === steuer.ziel && steuer.verbleibend > 0) {
        steuer.verbleibend -= 1;
        steuer.treffer += 1;
        const e = new Error(`ENOENT: no such file or directory, stat '${p}'`);
        e.code = "ENOENT";
        throw e;
      }
      return m.stat(p, ...rest);
    },
  };
});

let G;
let basis;
let zaehler = 0;

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "wp28b-enoent-"));
  G = await import("../werkzeug/ablage-sicherung.mjs");
});

afterAll(async () => {
  steuer.ziel = null;
  await rm(basis, { recursive: true, force: true });
});

/** Quelle mit einem Store und drei gültigen Dateien. */
async function quelle() {
  const q = path.join(basis, `q-${++zaehler}`);
  await mkdir(path.join(q, "centric"), { recursive: true });
  for (const n of ["a", "b", "c"])
    await writeFile(path.join(q, "centric", `${n}.json`), JSON.stringify({ fassung: 1, wert: n }));
  return q;
}

const ziel = async () => {
  const z = path.join(basis, `s-${++zaehler}`);
  await mkdir(z, { recursive: true });
  return z;
};

describe("WP-28b: Sichern wiederholt bei ENOENT zwischen readdir und stat", () => {
  it("wiederholt einmal und legt danach eine geprüfte Sicherung an", async () => {
    const q = await quelle();
    steuer.ziel = path.join(q, "centric", "b.json");
    steuer.verbleibend = 1;
    steuer.treffer = 0;
    const meldungen = [];
    const r = await G.sichern({ quelle: q, ziel: await ziel(), pause: 0, meldung: (s) => meldungen.push(s) });
    steuer.ziel = null;
    expect(steuer.treffer).toBe(1);
    expect(meldungen.some((s) => /verändert/.test(s))).toBe(true);
    expect((await G.pruefen(r.pfad)).ok).toBe(true);
    expect(r.manifest.dateien.map((d) => d.pfad).sort())
      .toEqual(["centric/a.json", "centric/b.json", "centric/c.json"]);
  });

  it("bricht nach drei ENOENT-Versuchen mit Code 3 ab und legt nichts an", async () => {
    const q = await quelle();
    steuer.ziel = path.join(q, "centric", "b.json");
    steuer.verbleibend = 99;
    steuer.treffer = 0;
    const z = await ziel();
    let fehler;
    try { await G.sichern({ quelle: q, ziel: z, pause: 0, versuche: 3 }); }
    catch (e) { fehler = e; }
    steuer.ziel = null;
    steuer.verbleibend = 0;
    expect(fehler).toMatchObject({ code: 3 });
    expect(steuer.treffer).toBe(3);
    expect((await readdir(z)).filter((n) => !n.startsWith("."))).toEqual([]);
  });
});

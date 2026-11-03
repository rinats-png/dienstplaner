/* ==========================================================================
   ABLAGE-PRÜFEN — Testmatrix, Erweiterung (WP-45c, 4. Nachprüfung)

   Ergänzt pruefungen/ablage-pruefen-matrix.test.js um:
   - Doppel- und Dreifachschäden: Kern + aktueller Vermerk, Zeiger +
     aktueller Vermerk, K2 (Kern kaputt, aktueller Vermerk und Zeiger
     gelöscht);
   - eine Historie über drei Stände: Stand 1 (Oktober, November — so liegt
     er in der Sicherung), Stand 2 legt Dezember an, Stand 3 Januar. Ein
     Monat, der NACH dem jüngsten lesbaren Vermerk angelegt wurde (Januar),
     ist nur über „Bezug unvollständig" erkennbar;
   - zwei fehlende Monate verschiedener Betriebe (m1-Oktober, m2-November);
   - den Modus --ohne-vermerk.

   Invarianten wie in der Grundmatrix:
   I1  Ein fehlender Monat ist danach wieder da, ausdrücklich hingenommen
       (--fehlende-hinnehmen mit Spur), ausdrücklich ohne Abgleich
       angeglichen (--ohne-vermerk mit Spur) — oder der Raum bleibt im
       Befund (Rückgabe 1).
   I2  Rückgabe 0 ⇒ Trockenlauf 0, Raum lesbar.
   I3  In der Sicherung und --aus-sicherung mit Rückgabe 0 ⇒ zurückgeholt.
   I4  Nicht fehlende Monate bleiben (beide Betriebe).
   I5  Nie Rückgabe 2.
   I6  Mit --aus-sicherung --beiseitelegen --kern-zurueck --ohne-vermerk ist
       jeder Fall lösbar (Rückgabe 0).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, mkdir, rm, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 60000, hookTimeout: 600000 });

const MONATE = { okt: "2025-10", nov: "2025-11", dez: "2025-12", jan: "2026-01" };
const SCHAEDEN = ["kern+vermerk", "zeiger+vermerk", "k2"];
const FEHLEND = { "m1-jan": [["m1", "jan"]], "m1-okt+m2-nov": [["m1", "okt"], ["m2", "nov"]], keine: [] };
const hinnehmenArgs = (raum, fehlend) => fehlend.flatMap(([m, mo]) => ["--fehlende-hinnehmen", `${raum}:${m}:${MONATE[mo]}`]);
const MODI = {
  T: () => [],
  B: () => ["--beiseitelegen"],
  SBK: (p) => ["--aus-sicherung", p, "--beiseitelegen", "--kern-zurueck"],
  SBKH: (p, raum, f) => ["--aus-sicherung", p, "--beiseitelegen", "--kern-zurueck", ...hinnehmenArgs(raum, f)],
  BO: (p, raum) => ["--beiseitelegen", "--ohne-vermerk", raum],
  SBKO: (p, raum) => ["--aus-sicherung", p, "--beiseitelegen", "--kern-zurueck", "--ohne-vermerk", raum],
};

const faelle = [];
for (const schaden of SCHAEDEN)
  for (const fehlName of Object.keys(FEHLEND))
    for (const modus of Object.keys(MODI))
      faelle.push({ schaden, fehlName, fehlend: FEHLEND[fehlName], modus,
        gruppe: `${schaden}-${fehlName}`.replace(/\+/g, "_"),
        raum: `my-${schaden}-${fehlName}-${modus}`.replace(/\+/g, "_").toLowerCase() });

const gruppen = new Map();
for (const f of faelle) {
  if (!gruppen.has(f.gruppe)) gruppen.set(f.gruppe, { faelle: [] });
  gruppen.get(f.gruppe).faelle.push(f);
}

let basis, B, A, W, S;

/** Stand 1: Oktober und November; ab Stand 2 Dezember; ab Stand 3 Januar. Wert = Kürzel des Monats. */
const bestand = (bisStand) => {
  const monate = ["okt", "nov", ...(bisStand >= 2 ? ["dez"] : []), ...(bisStand >= 3 ? ["jan"] : [])];
  return { version: 9, mandanten: ["m1", "m2"].map((id) => ({ id, name: id, einheiten: [], dienstarten: [],
    personen: [{ id: `${id}p`, name: id }],
    abweichungen: Object.fromEntries(monate.map((mo) => [`${id}p|${MONATE[mo]}-05`, mo])),
    abwesenheiten: [], erfassung: {}, einstempeln: {} })) };
};

const datei = (g, schluessel) => path.join(g.wurzel, "centric", A.dateiname(schluessel));
const lauf = async (g, argv) => {
  const zeilen = [];
  const code = await W.main(["--daten", g.wurzel, ...argv], (x) => zeilen.push(x));
  return { code, aus: zeilen.join("\n") };
};
const monatDa = async (g, raum, m, mo) => {
  try {
    const u = JSON.parse(await readFile(datei(g, `scherbe:${raum}:${m}:${MONATE[mo]}`), "utf8"));
    return u?.daten?.felder?.abweichungen?.[`${m}p|${MONATE[mo]}-05`] === mo;
  } catch { return false; }
};

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "centric-ablage-matrix2-"));
  process.env.CENTRIC_ABLAGE = "dateien";
  A = await import("../server/lib/ablage.mjs");
  B = await import("../server/lib/bestand.mjs");
  W = await import("../werkzeug/ablage-pruefen.mjs");
  S = await import("../werkzeug/ablage-sicherung.mjs");

  for (const [name, g] of gruppen) {
    g.wurzel = path.join(basis, name, "daten");
    process.env.CENTRIC_DATEN = g.wurzel;
    g.store = A.getStore({ name: "centric", consistency: "strong" });
    for (const f of g.faelle) await B.bestandSchreiben(g.store, f.raum, bestand(1), { durch: "Pruefung" });
    await mkdir(path.join(basis, name, "sich"), { recursive: true });
    ({ pfad: g.pfad } = await S.sichern({ quelle: g.wurzel, ziel: path.join(basis, name, "sich"),
      jetzt: new Date(Date.now() - 3_600_000) }));
    for (const f of g.faelle) {
      for (const st of [2, 3]) {
        const vorher = await B.bestandLesen(g.store, f.raum);
        await B.bestandSchreiben(g.store, f.raum, bestand(st), { erwarteterStand: vorher.stand, durch: "Pruefung" });
      }
      if (f.schaden.startsWith("kern") || f.schaden === "k2") await writeFile(datei(g, `kern:${f.raum}`), "{kaputt");
      if (f.schaden.endsWith("vermerk")) await writeFile(datei(g, `stand:${f.raum}:3`), "{kaputt");
      if (f.schaden === "zeiger+vermerk") await writeFile(datei(g, `stand:${f.raum}:aktuell`), "{kaputt");
      if (f.schaden === "k2") {
        await unlink(datei(g, `stand:${f.raum}:3`));
        await unlink(datei(g, `stand:${f.raum}:aktuell`));
      }
      for (const [m, mo] of f.fehlend) await unlink(datei(g, `scherbe:${f.raum}:${m}:${MONATE[mo]}`));
    }
  }
});
afterAll(async () => {
  await rm(basis, { recursive: true, force: true });
});

describe("Matrix (Erweiterung): kein Monat verschwindet still", () => {
  it.each(faelle)("$schaden · fehlt $fehlName · $modus", async (f) => {
    const g = gruppen.get(f.gruppe);
    const r = await lauf(g, [...MODI[f.modus](g.pfad, f.raum, f.fehlend), f.raum]);
    const t = await lauf(g, [f.raum]);
    const info = `${r.aus}\n--- Trockenlauf danach ---\n${t.aus}`;
    expect(r.code, info).not.toBe(2);                                                       // I5

    const spuren = [];
    for (const b of (await g.store.list({ prefix: `beiseite:${f.raum}:` })).blobs)
      spuren.push({ key: b.key, h: await g.store.get(b.key, { type: "json" }) });
    const ohneAbgleich = spuren.some((x) => x.h?.ohneAbgleich);
    const hingenommen = (m, mo) => spuren.some((x) => x.h?.fehlte && x.key.endsWith(`:scherbe:${f.raum}:${m}:${MONATE[mo]}`));
    if (!f.modus.endsWith("O")) expect(ohneAbgleich, info).toBe(false);
    if (!f.modus.endsWith("H")) expect(spuren.filter((x) => x.h?.fehlte), info).toEqual([]);

    for (const m of ["m1", "m2"]) for (const mo of Object.keys(MONATE)) {
      const fehlte = f.fehlend.some(([fm, fmo]) => fm === m && fmo === mo);
      const da = await monatDa(g, f.raum, m, mo);
      if (!fehlte) { expect(da, `${m} ${mo}\n${info}`).toBe(true); continue; }                 // I4
      if (da) continue;
      /* I1 */
      const erklaert = r.code === 0 && (hingenommen(m, mo) || ohneAbgleich);
      if (!erklaert) {
        expect(t.code, `${m} ${mo}\n${info}`).toBe(1);
        expect(t.aus, `${m} ${mo}\n${info}`)
          .toMatch(/— fehlt|Monate wären nicht erkennbar|kein lesbarer Vermerk|Bezug unvollständig/);
      }
      /* I3: Oktober/November liegen in der Sicherung (Stand 1). */
      if (["okt", "nov"].includes(mo) && f.modus.startsWith("S") && r.code === 0) expect(da, `${m} ${mo}\n${info}`).toBe(true);
    }
    if (r.code === 0) {                                                                    // I2
      expect(t.code, info).toBe(0);
      expect((await B.bestandLesen(g.store, f.raum)).bestand.mandanten.length, info).toBe(2);
    }
    if (f.modus === "SBKO") expect(r.code, info).toBe(0);                                   // I6
  });
});

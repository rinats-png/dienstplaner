/* ==========================================================================
   ABLAGE-PRÜFEN — Testmatrix (WP-45b, 3. Nachprüfung)

   Dieselbe Fehlerklasse tauchte in drei Runden an immer neuen Stellen auf:
   Ein fehlender Monat wurde still als leer festgeschrieben, Rückgabe 0.
   Diese Matrix prüft die Invarianten über alle Kombinationen statt
   einzelner Fälle:

     beschädigt   Kern | Journal | aktueller Vermerk | Zeiger | nichts
     Scherbe      Oktober von Betrieb m1 fehlt | fehlt nicht
     Sicherung    enthält diesen Oktober | nicht (Sicherung vom Stand 1)
     Modus        Trockenlauf | --beiseitelegen | --aus-sicherung
                  | + --kern-zurueck | kombiniert | + --fehlende-hinnehmen

   Jeder Raum hat zwei Betriebe (m1, m2) mit je Oktober und November.

   Invarianten:
   I1  Kein Monat verschwindet ohne --fehlende-hinnehmen: Fehlt Oktober nach
       dem Lauf, ist er entweder ausdrücklich hingenommen (Spur in der
       Ablage) oder der Raum bleibt im Befund (Rückgabe 1) — als „fehlt"
       oder als „kein vollständiger Abgleich".
   I2  Kein Exit 0, solange etwas fehlt: nach Rückgabe 0 ist der
       Trockenlauf 0 und der Raum vollständig lesbar.
   I3  Rückholung, wenn in der Sicherung: Fehlt Oktober, liegt er in der
       Sicherung und lief --aus-sicherung mit Rückgabe 0, ist er wieder da.
   I4  Ein vorhandener Monat geht nie verloren; m2 bleibt unberührt.
   I5  Kein Fehler (Rückgabe 2) in einem dieser Fälle.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, mkdir, rm, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 60000, hookTimeout: 600000 });

const SCHAEDEN = ["kern", "journal", "vermerk", "zeiger", "keiner"];
const MODI = {
  T: () => [],
  B: () => ["--beiseitelegen"],
  S: (p) => ["--aus-sicherung", p],
  SK: (p) => ["--aus-sicherung", p, "--kern-zurueck"],
  SBK: (p) => ["--aus-sicherung", p, "--beiseitelegen", "--kern-zurueck"],
  BH: (p, raum) => ["--beiseitelegen", "--fehlende-hinnehmen", `${raum}:m1:2025-10`],
  SBKH: (p, raum) => ["--aus-sicherung", p, "--beiseitelegen", "--kern-zurueck", "--fehlende-hinnehmen", `${raum}:m1:2025-10`],
};

const faelle = [];
for (const schaden of SCHAEDEN)
  for (const fehlt of [true, false])
    for (const sichMitOkt of [true, false])
      for (const modus of Object.keys(MODI))
        faelle.push({ schaden, fehlt, sichMitOkt, modus,
          raum: `mx-${schaden}-${fehlt ? "f" : "d"}-${sichMitOkt ? "s" : "n"}-${modus.toLowerCase()}` });

/* Je Gruppe (Schaden × fehlt × Sicherung) eine eigene kleine Ablage mit
   eigener Sicherung und einem Raum je Modus — sonst prüfte jeder Lauf die
   Sicherung und die Ablage aller 140 Räume. */
const gruppen = new Map();
for (const f of faelle) {
  const g = `${f.schaden}-${f.fehlt}-${f.sichMitOkt}`;
  if (!gruppen.has(g)) gruppen.set(g, { faelle: [] });
  gruppen.get(g).faelle.push(f);
  f.gruppe = g;
}

let basis, B, A, W, S;

const bestand = (mitM1Okt) => ({ version: 9, mandanten: [
  { id: "m1", name: "Haus A", einheiten: [], dienstarten: [], personen: [{ id: "p1", name: "Erste" }],
    abweichungen: { ...(mitM1Okt ? { "p1|2025-10-10": "F" } : {}), "p1|2025-11-03": "S" },
    abwesenheiten: [], erfassung: {}, einstempeln: {} },
  { id: "m2", name: "Haus B", einheiten: [], dienstarten: [], personen: [{ id: "q1", name: "Zweite" }],
    abweichungen: { "q1|2025-10-12": "N", "q1|2025-11-05": "F" }, abwesenheiten: [], erfassung: {}, einstempeln: {} },
] });

const datei = (g, schluessel) => path.join(g.wurzel, "centric", A.dateiname(schluessel));
const lauf = async (g, argv) => {
  const zeilen = [];
  const code = await W.main(["--daten", g.wurzel, ...argv], (x) => zeilen.push(x));
  return { code, aus: zeilen.join("\n") };
};
/** Steht in der Scherbe (falls da und lesbar) der erwartete Eintrag? */
const eintragDa = async (g, schluessel, feld, wert) => {
  try {
    const u = JSON.parse(await readFile(datei(g, schluessel), "utf8"));
    return u?.daten?.felder?.abweichungen?.[feld] === wert;
  } catch { return false; }
};

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "centric-ablage-matrix-"));
  process.env.CENTRIC_ABLAGE = "dateien";
  A = await import("../server/lib/ablage.mjs");
  B = await import("../server/lib/bestand.mjs");
  W = await import("../werkzeug/ablage-pruefen.mjs");
  S = await import("../werkzeug/ablage-sicherung.mjs");

  for (const [name, g] of gruppen) {
    g.wurzel = path.join(basis, name, "daten");
    process.env.CENTRIC_DATEN = g.wurzel;
    g.store = A.getStore({ name: "centric", consistency: "strong" });
    /* Stand 1 — so liegt er in der Sicherung (mit oder ohne m1-Oktober). */
    for (const f of g.faelle) await B.bestandSchreiben(g.store, f.raum, bestand(f.sichMitOkt), { durch: "Pruefung" });
    await mkdir(path.join(basis, name, "sich"), { recursive: true });
    ({ pfad: g.pfad } = await S.sichern({ quelle: g.wurzel, ziel: path.join(basis, name, "sich"),
      jetzt: new Date(Date.now() - 3_600_000) }));
    /* Stand 2 — vollständig, dann der Schaden. */
    for (const f of g.faelle) {
      const st = await B.bestandLesen(g.store, f.raum);
      await B.bestandSchreiben(g.store, f.raum, bestand(true), { erwarteterStand: st.stand, durch: "Pruefung" });
      if (f.schaden === "kern") await writeFile(datei(g, `kern:${f.raum}`), "{kaputt");
      if (f.schaden === "journal") await writeFile(datei(g, `journal:${f.raum}`), "{kaputt");
      if (f.schaden === "vermerk") await writeFile(datei(g, `stand:${f.raum}:2`), "{kaputt");
      if (f.schaden === "zeiger") await writeFile(datei(g, `stand:${f.raum}:aktuell`), "{kaputt");
      if (f.fehlt) await unlink(datei(g, `scherbe:${f.raum}:m1:2025-10`));
    }
  }
});
afterAll(async () => {
  await rm(basis, { recursive: true, force: true });
});

describe("Matrix: kein Monat verschwindet still", () => {
  it.each(faelle)("$schaden · Oktober fehlt=$fehlt · Sicherung mit Oktober=$sichMitOkt · $modus", async (f) => {
    const g = gruppen.get(f.gruppe);
    const store = g.store;
    const OKT = `scherbe:${f.raum}:m1:2025-10`;
    const r = await lauf(g, [...MODI[f.modus](g.pfad, f.raum), f.raum]);
    const t = await lauf(g, [f.raum]);
    const info = `${r.aus}\n--- Trockenlauf danach ---\n${t.aus}`;

    expect(r.code, info).not.toBe(2);                                                       // I5
    const oktDa = await eintragDa(g, OKT, "p1|2025-10-10", "F");
    const hinnehmen = f.modus.endsWith("H");
    const spur = (await store.list({ prefix: `beiseite:${f.raum}:` })).blobs
      .filter((b) => b.key.endsWith(`:${OKT}`));
    const hingenommen = [];
    for (const b of spur) {
      const h = await store.get(b.key, { type: "json" });
      if (h?.fehlte) hingenommen.push(h);
    }

    /* I4: m2 und m1-November bleiben, ein vorhandener m1-Oktober auch. */
    expect(await eintragDa(g, `scherbe:${f.raum}:m2:2025-10`, "q1|2025-10-12", "N"), info).toBe(true);
    expect(await eintragDa(g, `scherbe:${f.raum}:m2:2025-11`, "q1|2025-11-05", "F"), info).toBe(true);
    expect(await eintragDa(g, `scherbe:${f.raum}:m1:2025-11`, "p1|2025-11-03", "S"), info).toBe(true);
    if (!f.fehlt) expect(oktDa, info).toBe(true);

    /* I1: fehlt Oktober, dann ausdrücklich hingenommen oder weiter sichtbar. */
    if (!oktDa) {
      if (hinnehmen && hingenommen.length && r.code === 0) {
        expect(hingenommen[0].durch, info).toMatch(/--fehlende-hinnehmen/);
      } else {
        expect(t.code, info).toBe(1);
        expect(t.aus, info).toMatch(new RegExp(`${OKT} — fehlt|Monate wären nicht erkennbar|kein lesbarer Vermerk`));
      }
    }
    if (!hinnehmen) expect(hingenommen, info).toEqual([]);

    /* I2: Rückgabe 0 heißt vollständig. */
    if (r.code === 0) {
      expect(t.code, info).toBe(0);
      const gelesen = await B.bestandLesen(store, f.raum);
      expect(gelesen.bestand.mandanten.map((m) => m.id).sort(), info).toEqual(["m1", "m2"]);
      expect(oktDa || hingenommen.length > 0, info).toBe(true);
    }

    /* I3: in der Sicherung und --aus-sicherung mit Rückgabe 0 ⇒ zurückgeholt. */
    if (f.fehlt && f.sichMitOkt && f.modus.startsWith("S") && r.code === 0) expect(oktDa, info).toBe(true);

    /* Was gelöst werden kann, wird gelöst (keine Dauer-Blockade):
       - nichts beschädigt und nichts fehlt ⇒ 0 in jedem Modus;
       - Oktober in der Sicherung, Kern nur mit --kern-zurueck,
         der aktuelle Vermerk ist nicht in der Sicherung (Stand 1) ⇒ beim
         Vermerk-Schaden bleibt der Raum zu. */
    if (f.schaden === "keiner" && !f.fehlt) expect(r.code, info).toBe(0);
    if (f.fehlt && f.sichMitOkt && ["S", "SK", "SBK", "SBKH"].includes(f.modus)
      && ["keiner", "zeiger", "journal"].includes(f.schaden)) expect(r.code, info).toBe(0);
    if (f.schaden === "kern" && ["SK", "SBK", "SBKH"].includes(f.modus) && (!f.fehlt || f.sichMitOkt))
      expect(r.code, info).toBe(0);
  });
});

/* ==========================================================================
   ATOMARES SCHREIBEN (WP-45) — ganz oder gar nicht, auch nach Absturz

   Ein Schreibvorgang berührt Kern, mehrere Scherben, Vermerk und Zeiger.
   Jede Datei für sich schreibt die Ablage atomar, die Folge war es nicht:
   Brach der Prozess zwischen zwei Scherben ab, blieb ein Stand, den es nie
   gab — ein von März nach April verschobener Eintrag war im März schon weg
   und im April noch nicht da. Die Reparatur nach dem Abbruch (WP-02) nahm
   diesen Mischstand dann als gültig.

   Geprüft wird:
     - Abbruch vor jeder einzelnen Teilschreibung (Kern, Scherben,
       Löschung, Vermerk, Zeiger, Journal …): Danach liest man vollständig
       den alten oder vollständig den neuen Stand, der verschobene Eintrag
       steht genau einmal da, und der nächste Schreibvorgang gelingt.
     - Ein Leser, der während eines langsamen Schreibvorgangs immer wieder
       liest, sieht nie einen Mischstand.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, store, B;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-atomar-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  const { getStore } = await import("../server/lib/ablage.mjs");
  store = getStore({ name: "centric", consistency: "strong" });
  B = await import("../server/lib/bestand.mjs");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Alter Stand: Einträge im März, April und Mai. */
const ALT = () => ({ version: 9, mandanten: [{ id: "m1", name: "Haus alt",
  einheiten: [], dienstarten: [], personen: [],
  abweichungen: { "p1|2025-03-10": "F", "p2|2025-03-11": "S", "p2|2025-04-02": "N", "p3|2025-05-07": "F" },
  abwesenheiten: [], erfassung: {}, einstempeln: {} }] });
/** Neuer Stand: p1 von März nach April verschoben, Mai ganz weg, Name im Kern geändert. */
const NEU = () => {
  const b = ALT();
  const m = b.mandanten[0];
  m.name = "Haus neu";
  delete m.abweichungen["p1|2025-03-10"];
  m.abweichungen["p1|2025-04-10"] = "F";
  delete m.abweichungen["p3|2025-05-07"];
  return b;
};

/** Eine Ablage, die vor der n-ten verändernden Operation „abstürzt". */
function absturzAblage(n) {
  let zaehler = 0;
  const vorher = () => { zaehler += 1; if (zaehler === n) throw new Error(`Absturz vor Teilschreibung ${n}`); };
  return { ablage: { ...store,
    setJSON: async (k, v, o) => { vorher(); return store.setJSON(k, v, o); },
    delete: async (k) => { vorher(); return store.delete(k); },
  }, zaehler: () => zaehler };
}

const kennung = (b) => JSON.stringify(b);
let referenzAlt, referenzNeu;

/* Die beiden gültigen Stände, so wie ein ungestörter Schreibvorgang sie hinterlässt. */
beforeAll(async () => {
  await B.bestandSchreiben(store, "ref-alt", ALT(), { durch: "Pruefung" });
  await B.bestandSchreiben(store, "ref-neu", ALT(), { durch: "Pruefung" });
  const g = await B.bestandLesen(store, "ref-neu");
  await B.bestandSchreiben(store, "ref-neu", NEU(), { erwarteterStand: g.stand, durch: "Pruefung" });
  referenzAlt = kennung((await B.bestandLesen(store, "ref-alt")).bestand);
  referenzNeu = kennung((await B.bestandLesen(store, "ref-neu")).bestand);
  expect(referenzAlt).not.toBe(referenzNeu);
});

describe("Abbruch vor jeder Teilschreibung", () => {
  it("danach vollständig alt oder vollständig neu, nie gemischt — und weiter schreibbar", async () => {
    /* Wie viele verändernde Operationen hat ein ungestörter Schreibvorgang? */
    const zaehlen = absturzAblage(Infinity);
    await B.bestandSchreiben(store, "zaehl", ALT(), { durch: "Pruefung" });
    const gz = await B.bestandLesen(store, "zaehl");
    await B.bestandSchreiben(zaehlen.ablage, "zaehl", NEU(), { erwarteterStand: gz.stand, durch: "Pruefung" });
    const gesamt = zaehlen.zaehler();
    expect(gesamt).toBeGreaterThan(4);

    const befunde = [];
    for (let n = 1; n <= gesamt; n++) {
      const raum = `absturz-${n}`;
      await B.bestandSchreiben(store, raum, ALT(), { durch: "Pruefung" });
      const g = await B.bestandLesen(store, raum);
      const { ablage } = absturzAblage(n);
      await B.bestandSchreiben(ablage, raum, NEU(), { erwarteterStand: g.stand, durch: "Pruefung" })
        .then(() => befunde.push(`${n}: kein Absturz ausgelöst`), () => {});

      /* „Neustart": ein neuer Leser auf derselben Ablage. */
      const nach = await B.bestandLesen(store, raum);
      const k = kennung(nach.bestand);
      const art = k === referenzAlt ? "alt" : k === referenzNeu ? "neu" : "GEMISCHT";
      if (art === "GEMISCHT") befunde.push(`${n}: Mischstand ${k.slice(0, 160)}`);
      const p1 = Object.keys(nach.bestand.mandanten[0].abweichungen).filter((x) => x.startsWith("p1|"));
      if (p1.length !== 1) befunde.push(`${n}: verschobener Eintrag ${p1.length}-mal vorhanden`);

      /* Und es geht weiter: der nächste Schreibvorgang gelingt und sieht
         denselben Stand, den der Leser sah. */
      const weiter = JSON.parse(JSON.stringify(nach.bestand));
      weiter.mandanten[0].abweichungen["p9|2025-06-01"] = "F";
      const e = await B.bestandSchreiben(store, raum, weiter, { erwarteterStand: nach.stand, durch: "Pruefung" });
      if (!e.ok) befunde.push(`${n}: nächster Schreibvorgang ${JSON.stringify(e).slice(0, 120)}`);
      const danach = (await B.bestandLesen(store, raum)).bestand;
      delete danach.mandanten[0].abweichungen["p9|2025-06-01"];
      if (kennung(danach) !== k) befunde.push(`${n}: nach dem nächsten Schreiben anders als gelesen`);
    }
    expect(befunde).toEqual([]);
  }, 60000);
});

describe("Leser während eines Schreibvorgangs", () => {
  it("sieht nie einen Mischstand", async () => {
    const raum = "leser-parallel";
    await B.bestandSchreiben(store, raum, ALT(), { durch: "Pruefung" });
    const g = await B.bestandLesen(store, raum);
    /* Jede verändernde Operation des Schreibers dauert 25 ms länger. */
    const langsam = { ...store,
      setJSON: async (k, v, o) => { await warte(25); return store.setJSON(k, v, o); },
      delete: async (k) => { await warte(25); return store.delete(k); },
    };
    let fertig = false;
    const schreiben = B.bestandSchreiben(langsam, raum, NEU(), { erwarteterStand: g.stand, durch: "Pruefung" })
      .finally(() => { fertig = true; });
    const gesehen = { alt: 0, neu: 0, gemischt: [] };
    while (!fertig) {
      const r = await B.bestandLesen(store, raum);
      const k = kennung(r.bestand);
      if (k === referenzAlt) gesehen.alt++;
      else if (k === referenzNeu) gesehen.neu++;
      else gesehen.gemischt.push(k.slice(0, 160));
      await warte(3);
    }
    await schreiben;
    expect(gesehen.gemischt).toEqual([]);
    expect(gesehen.alt + gesehen.neu).toBeGreaterThan(3);
  }, 30000);
});

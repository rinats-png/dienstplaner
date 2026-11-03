/* ==========================================================================
   WP-48.2 SPEICHERKERN — Hash-Vermerk, Lesecache, Segmentschreiber, Epoche
   (docs/acc45/WP48-TEILSPEICHERUNG.md 2.2, 2.6, 2.8)

   Rot vorher (Stand 219a5b0):
   - Der Standvermerk enthält je Scherbe den vollständigen sortierten Text
     (abdruck „bewusst kein Hash") und für den Kern JSON.stringify(kern) —
     jeder Vermerk ist so groß wie der Bestand, das Journal trägt ihn noch
     einmal.
   - Bei einem Sprung des Stands bleiben alte Vermerke unbegrenzt liegen.
   - Unter der Raumsperre liest der Drei-Wege-Abgleich den ganzen Bestand
     ein zweites Mal von der Platte.
   - Es gibt keinen Segmentschreiber und keine Epoche.

   Rückwärtskompatibel: Ein alter Vermerk mit Text-Abdrücken wird beim Lesen
   erkannt und übersetzt (gleicher Hash wie der neue Abdruck desselben
   Inhalts). Ein unbekanntes Format gilt als „kein Vermerk" (fail-closed):
   kein Abgleich, sondern Konflikt bzw. Neuberechnung aus der Platte.

   Aufruf: npx vitest run pruefungen/wp48-speicherkern.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

let wurzel, laden, B, SCH, RS, daten, sitzungAnlegen;
const kopie = (x) => JSON.parse(JSON.stringify(x));
const sha = (t) => createHash("sha256").update(t).digest("hex").slice(0, 32);
const HASH = /^[0-9a-f]{32}$/;

/** Ein Betrieb mit `personen` Personen und `monate` Monaten Plan, Ist und Stempeln (ab 2025-01). */
function betrieb({ personen = 6, monate = 4, id = "m1" } = {}) {
  const abweichungen = {}, erfassung = {}, einstempeln = {};
  for (let mo = 0; mo < monate; mo++) {
    const jahr = 2025 + Math.floor(mo / 12), monat = String((mo % 12) + 1).padStart(2, "0");
    for (let p = 0; p < personen; p++) {
      for (const t of ["03", "04", "17"]) {
        const k = `p${p}|${jahr}-${monat}-${t}`;
        abweichungen[k] = t === "17" ? "N" : "F";
        erfassung[k] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" };
        einstempeln[k] = { start: "05:58", ende: "14:02", quelle: "app", ort: "x".repeat(40) };
      }
    }
  }
  return { version: 9, mandanten: [{ id, name: "Haus", einheiten: [{ id: "e1" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: Array.from({ length: personen }, (_, p) => ({ id: `p${p}`, vorname: "V", nachname: `N${p}`, rolle: "mitarbeiter",
      bereich: "e1", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] })),
    abweichungen, erfassung, einstempeln, anfragen: [], nachrichten: [], abwesenheiten: [] }] };
}

/** Zählt Zugriffe auf eine Ablage: gelesene Scherben, geschriebene Schlüssel, das Journal. */
function zaehlAblage(store) {
  const z = { scherbeGelesen: 0, gesetzt: [], journale: [], geloescht: [] };
  const s = { ...store,
    get: async (k, o) => { if (String(k).startsWith("scherbe:")) z.scherbeGelesen++; return store.get(k, o); },
    setJSON: async (k, v, o) => { z.gesetzt.push(k); if (String(k).startsWith("journal:")) z.journale.push(JSON.stringify(v)); return store.setJSON(k, v, o); },
    delete: async (k) => { z.geloescht.push(k); return store.delete(k); } };
  return { s, z };
}

/** Abbruch vor der n-ten verändernden Operation (1 = Journal, 2 = Kern, 3 = erste Scherbe …). */
function absturzAblage(store, n) {
  let z = 0;
  const vorher = () => { z += 1; if (z === n) throw new Error(`Absturz vor Teilschreibung ${n}`); };
  return { ...store,
    setJSON: async (k, v, o) => { vorher(); return store.setJSON(k, v, o); },
    delete: async (k) => { vorher(); return store.delete(k); } };
}

const vermerk = (raum, nr) => laden().get(`stand:${raum}:${nr}`, { type: "json" });
const zeiger = (raum) => laden().get(`stand:${raum}:aktuell`, { type: "json" });
async function vermerkNummern(raum) {
  const { blobs } = await laden().list({ prefix: `stand:${raum}:` });
  return blobs.map((b) => b.key.slice(`stand:${raum}:`.length)).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
}

/** Ein Vermerk, wie ihn der Server vor WP-48.2 schrieb (Text-Abdrücke). */
function altVermerk(bestand) {
  const z = SCH.zerlegen(bestand);
  const abdruecke = { kern: JSON.stringify(z.kern) };
  for (const [id, s] of z.scherben) abdruecke[id] = SCH.abdruckText(s);
  return { abdruecke, zeit: "2026-01-01T00:00:00.000Z", durch: "alter Server" };
}

let raumNr = 0;
const neuerRaum = (was) => `wp48-kern-${was}-${++raumNr}`;
async function angelegt(was, b = betrieb()) {
  const raum = neuerRaum(was);
  await B.bestandSchreiben(laden(), raum, b, { durch: "Pruefung" });
  return { raum, g: await B.bestandLesenStreng(laden(), raum) };
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-kern-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  const einer = getStore({ name: "centric", consistency: "strong" });
  laden = () => einer;
  B = await import("../server/lib/bestand.mjs");
  SCH = await import("../server/lib/scherben.mjs");
  RS = await import("../server/lib/raumsperre.mjs");
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

/* ------------------------------------------------------------------------ */
describe("Abdruck als SHA-256-Präfix", () => {
  it("abdruck ist 32 Hex-Zeichen = sha256 des bisherigen Texts, unabhängig von der Schlüsselreihenfolge", () => {
    const z = SCH.zerlegen(betrieb());
    const s = z.scherben.get("m1::2025-01");
    expect(SCH.abdruck(s)).toMatch(HASH);
    expect(SCH.abdruck(s)).toBe(sha(SCH.abdruckText(s)));
    const umgedreht = { ...s, felder: Object.fromEntries(Object.entries(s.felder).map(([f, w]) =>
      [f, Object.fromEntries(Object.entries(w).reverse())])) };
    expect(SCH.abdruck(umgedreht)).toBe(SCH.abdruck(s));
    const anders = kopie(s); anders.felder.abweichungen["p0|2025-01-03"] = "N";
    expect(SCH.abdruck(anders)).not.toBe(SCH.abdruck(s));
    expect(SCH.abdruck(null)).toBe("");
  });
  it("kernAbdruck = sha256(JSON.stringify(kern)); abdruckNormal übersetzt alte Texte, lehnt Unbekanntes ab", () => {
    const z = SCH.zerlegen(betrieb());
    expect(SCH.kernAbdruck(z.kern)).toBe(sha(JSON.stringify(z.kern)));
    const s = z.scherben.get("m1::2025-02");
    expect(SCH.abdruckNormal(SCH.abdruck(s))).toBe(SCH.abdruck(s));
    expect(SCH.abdruckNormal(SCH.abdruckText(s))).toBe(SCH.abdruck(s));
    expect(SCH.abdruckNormal(JSON.stringify(z.kern))).toBe(SCH.kernAbdruck(z.kern));
    for (const kaputt of ["", "zzz", 17, null, undefined, {}, "ABCDEF0123456789ABCDEF0123456789", "a".repeat(31), "a".repeat(64)])
      expect(SCH.abdruckNormal(kaputt), JSON.stringify(kaputt)).toBe(null);
  });
});

describe("Standvermerk klein, Journal ohne zweite Kopie", { timeout: 120000 }, () => {
  it("Vermerk: nur Hash-Abdrücke, < 10 KB bei einem Bestand über 1 MB", async () => {
    const b = betrieb({ personen: 40, monate: 12 });
    expect(JSON.stringify(b).length).toBeGreaterThan(1_000_000);
    const { raum, g } = await angelegt("vermerk", b);
    const v = await vermerk(raum, Number(g.stand));
    expect(Object.values(v.abdruecke).every((x) => HASH.test(x)), "alle Abdrücke gehasht").toBe(true);
    expect(Object.keys(v.abdruecke).length).toBe(13);
    expect(JSON.stringify(v).length).toBeLessThan(10_000);
  });
  it("Journal eines Schreibvorgangs mit einer geänderten Scherbe: < berührte Scherbe + Kern + 10 KB, Vermerk genau einmal", async () => {
    const b = betrieb({ personen: 40, monate: 12 });
    const { raum, g } = await angelegt("journal", b);
    const neu = kopie(g.bestand); neu.mandanten[0].abweichungen["p1|2025-05-03"] = "N";
    const { s, z } = zaehlAblage(laden());
    expect((await B.bestandSchreiben(s, raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" })).ok).toBe(true);
    expect(z.journale.length).toBe(1);
    const j = JSON.parse(z.journale[0]);
    const zNeu = SCH.zerlegen(neu);
    const grenze = JSON.stringify(zNeu.scherben.get("m1::2025-05")).length + JSON.stringify(zNeu.kern).length + 10_000;
    expect(z.journale[0].length).toBeLessThan(grenze);
    expect(j.schritte.filter((x) => /^stand:[^:]+:\d+$/.test(x.schluessel)).length).toBe(1);
  });
});

describe("Alte Vermerke (Text) bleiben lesbar", { timeout: 120000 }, () => {
  it("aktueller Stand mit altem Vermerk: geschrieben werden nur Kern und die geänderte Scherbe, danach Hash-Vermerk", async () => {
    const { raum, g } = await angelegt("alt-aktuell");
    await laden().setJSON(`stand:${raum}:${g.stand}`, altVermerk(g.bestand));
    const neu = kopie(g.bestand); neu.mandanten[0].abweichungen["p1|2025-02-03"] = "N";
    const erg = await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    expect(erg.ok).toBe(true);
    expect(erg.geschrieben).toBe(2);
    const v = await vermerk(raum, Number(erg.stand));
    expect(Object.values(v.abdruecke).every((x) => HASH.test(x))).toBe(true);
    /* Kein Wiederanlauf: die Epoche bleibt. */
    expect((await B.bestandLesen(laden(), raum)).epoche).toBe(g.epoche);
  });
  it("Drei-Wege-Abgleich über einen alten Basisvermerk: verschiedene Monate werden zusammengeführt", async () => {
    const { raum, g } = await angelegt("alt-basis");
    await laden().setJSON(`stand:${raum}:${g.stand}`, altVermerk(g.bestand));
    const a = kopie(g.bestand); a.mandanten[0].abweichungen["p1|2025-02-03"] = "N";
    const b2 = kopie(g.bestand); b2.mandanten[0].abweichungen["p2|2025-03-04"] = "N";
    expect((await B.bestandSchreiben(laden(), raum, a, { erwarteterStand: g.stand, durch: "A" })).ok).toBe(true);
    const erg = await B.bestandSchreiben(laden(), raum, b2, { erwarteterStand: g.stand, durch: "B" });
    expect(erg.ok, JSON.stringify(erg.streit)).toBe(true);
    const jetzt = (await B.bestandLesen(laden(), raum)).bestand.mandanten[0].abweichungen;
    expect(jetzt["p1|2025-02-03"]).toBe("N");
    expect(jetzt["p2|2025-03-04"]).toBe("N");
  });
  it("derselbe Monat über einen alten Basisvermerk bleibt ein Konflikt mit dem Monat", async () => {
    const { raum, g } = await angelegt("alt-streit");
    await laden().setJSON(`stand:${raum}:${g.stand}`, altVermerk(g.bestand));
    const a = kopie(g.bestand); a.mandanten[0].abweichungen["p1|2025-02-03"] = "N";
    const b2 = kopie(g.bestand); b2.mandanten[0].abweichungen["p2|2025-02-04"] = "N";
    expect((await B.bestandSchreiben(laden(), raum, a, { erwarteterStand: g.stand, durch: "A" })).ok).toBe(true);
    const erg = await B.bestandSchreiben(laden(), raum, b2, { erwarteterStand: g.stand, durch: "B" });
    expect(erg.ok).toBe(false);
    expect(erg.monate).toEqual(["2025-02"]);
  });
  it("unveraenderteScherben mit altem Basisvermerk erkennt die unveränderten Monate", async () => {
    const { raum, g } = await angelegt("alt-unveraendert");
    await laden().setJSON(`stand:${raum}:${g.stand}`, altVermerk(g.bestand));
    const a = kopie(g.bestand); a.mandanten[0].einstempeln["p1|2025-02-03"].ende = "14:03";
    await B.bestandSchreiben(laden(), raum, a, { erwarteterStand: g.stand, durch: "A" });
    const jetzt = await B.bestandLesenStreng(laden(), raum);
    const u = await B.unveraenderteScherben(laden(), raum, g.stand, jetzt);
    expect([...u].sort()).toEqual(["m1::2025-01", "m1::2025-03", "m1::2025-04"]);
  });
  it("fail-closed: unbekanntes Format im Basisvermerk → Konflikt ohne Abgleich, unveraenderteScherben leer", async () => {
    const { raum, g } = await angelegt("alt-kaputt");
    const v = await vermerk(raum, Number(g.stand));
    v.abdruecke["m1::2025-03"] = "irgendwas";
    await laden().setJSON(`stand:${raum}:${g.stand}`, v);
    const a = kopie(g.bestand); a.mandanten[0].abweichungen["p1|2025-02-03"] = "N";
    const b2 = kopie(g.bestand); b2.mandanten[0].abweichungen["p2|2025-04-04"] = "N";
    expect((await B.bestandSchreiben(laden(), raum, a, { erwarteterStand: g.stand, durch: "A" })).ok).toBe(true);
    const jetzt = await B.bestandLesenStreng(laden(), raum);
    expect((await B.unveraenderteScherben(laden(), raum, g.stand, jetzt)).size).toBe(0);
    const erg = await B.bestandSchreiben(laden(), raum, b2, { erwarteterStand: g.stand, durch: "B" });
    expect(erg.ok).toBe(false);
    expect(erg.streit).toBe(null);
    expect((await B.bestandLesen(laden(), raum)).bestand.mandanten[0].abweichungen["p2|2025-04-04"]).toBe("F");
  });
  it("fail-closed: unbekanntes Format im aktuellen Vermerk → Neuberechnung aus der Platte, neue Epoche, nichts verloren", async () => {
    const { raum, g } = await angelegt("aktuell-kaputt");
    const v = await vermerk(raum, Number(g.stand));
    v.abdruecke.kern = 42;
    await laden().setJSON(`stand:${raum}:${g.stand}`, v);
    const neu = kopie(g.bestand); neu.mandanten[0].abweichungen["p1|2025-02-03"] = "N";
    const erg = await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    expect(erg.ok).toBe(true);
    const nach = await B.bestandLesen(laden(), raum);
    expect(nach.bestand.mandanten[0].abweichungen["p1|2025-02-03"]).toBe("N");
    expect(Object.keys(nach.bestand.mandanten[0].einstempeln).length).toBe(Object.keys(g.bestand.mandanten[0].einstempeln).length);
    expect(nach.epoche).not.toBe(g.epoche);
  });
});

describe("Vermerk-Aufräumen", { timeout: 120000 }, () => {
  it("nach 25 Schreibvorgängen liegen höchstens 10 Vermerke, die jüngsten", async () => {
    const { raum } = await angelegt("aufraeumen", betrieb({ personen: 2, monate: 2 }));
    for (let i = 0; i < 24; i++) {
      const g = await B.bestandLesen(laden(), raum);
      const neu = kopie(g.bestand); neu.mandanten[0].name = `Haus ${i}`;
      await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    }
    const nr = await vermerkNummern(raum);
    expect(nr.length).toBeLessThanOrEqual(10);
    expect(nr[nr.length - 1]).toBe(25);
    expect(nr).toEqual(Array.from({ length: nr.length }, (_, i) => 25 - nr.length + 1 + i));
  });
  it("nach einem Sprung des Stands (Wiederanlauf) bleiben keine alten Vermerke liegen", async () => {
    const { raum } = await angelegt("sprung", betrieb({ personen: 2, monate: 2 }));
    for (let i = 0; i < 11; i++) {
      const g = await B.bestandLesen(laden(), raum);
      const neu = kopie(g.bestand); neu.mandanten[0].name = `Haus ${i}`;
      await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    }
    /* Ein Zeiger, der weit vorausliegt (abgebrochener Schreibvorgang eines anderen Wegs) → Wiederanlauf. */
    await laden().setJSON(`stand:${raum}:aktuell`, { nr: 40, zeit: "2026-01-01" });
    const g = await B.bestandLesen(laden(), raum);
    const neu = kopie(g.bestand); neu.mandanten[0].name = "nach Sprung";
    expect((await B.bestandSchreiben(laden(), raum, neu, { durch: "Pruefung" })).ok).toBe(true);
    const nr = await vermerkNummern(raum);
    expect(nr.length, JSON.stringify(nr)).toBeLessThanOrEqual(10);
    expect(nr.every((x) => x > 41 - 10)).toBe(true);
  });
});

/* ------------------------------------------------------------------------ */
describe("Lesecache unter der Raumsperre", { timeout: 120000 }, () => {
  it("zweites strenges Lesen unter derselben Sperre liest keine Scherbe von der Platte", async () => {
    const { raum } = await angelegt("cache-treffer");
    const { s, z } = zaehlAblage(laden());
    await RS.unterRaumsperre(raum, async () => {
      const a = await B.bestandLesenStreng(s, raum);
      const nachErstem = z.scherbeGelesen;
      expect(nachErstem).toBe(4);
      const b2 = await B.bestandLesenStreng(s, raum);
      expect(z.scherbeGelesen).toBe(nachErstem);
      expect(b2).toEqual(a);
    });
  });
  it("ohne Sperre kein Cache; neue Sperre, neuer Cache", async () => {
    const { raum } = await angelegt("cache-ohne");
    const { s, z } = zaehlAblage(laden());
    await B.bestandLesenStreng(s, raum); await B.bestandLesenStreng(s, raum);
    expect(z.scherbeGelesen).toBe(8);
    await RS.unterRaumsperre(raum, () => B.bestandLesenStreng(s, raum));
    await RS.unterRaumsperre(raum, () => B.bestandLesenStreng(s, raum));
    expect(z.scherbeGelesen).toBe(16);
  });
  it("gilt nicht über das eigene Schreiben hinaus", async () => {
    const { raum } = await angelegt("cache-schreiben");
    await RS.unterRaumsperre(raum, async () => {
      const g = await B.bestandLesenStreng(laden(), raum);
      const neu = kopie(g.bestand); neu.mandanten[0].abweichungen["p0|2025-01-03"] = "N";
      await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
      const nach = await B.bestandLesenStreng(laden(), raum);
      expect(nach.bestand.mandanten[0].abweichungen["p0|2025-01-03"]).toBe("N");
      expect(Number(nach.stand)).toBe(Number(g.stand) + 1);
      const t = await B.teileSchreiben(laden(), raum, { scherben: [{ mandantId: "m1", monat: "2025-02",
        felder: { ...SCH.zerlegen(nach.bestand).scherben.get("m1::2025-02").felder, abweichungen: { "p0|2025-02-03": "S" } } }] },
      { erwarteterStand: nach.stand, durch: "Pruefung" });
      expect(t.ok).toBe(true);
      const nach2 = await B.bestandLesenStreng(laden(), raum);
      expect(nach2.bestand.mandanten[0].abweichungen["p0|2025-02-03"]).toBe("S");
    });
  });
  it("Veränderung am Gelesenen wirkt nicht auf das nächste Lesen (Kopie)", async () => {
    const { raum } = await angelegt("cache-kopie");
    await RS.unterRaumsperre(raum, async () => {
      const a = await B.bestandLesenStreng(laden(), raum);
      a.bestand.mandanten[0].abweichungen["p0|2025-01-03"] = "X";
      a.bestand.mandanten[0].erfassung["p0|2025-01-03"].start = "00:00";
      const b2 = await B.bestandLesenStreng(laden(), raum);
      expect(b2.bestand.mandanten[0].abweichungen["p0|2025-01-03"]).toBe("F");
      expect(b2.bestand.mandanten[0].erfassung["p0|2025-01-03"].start).toBe("06:00");
    });
  });
  it("erkennt eine Änderung an der Platte am Kern-Stand, am Journal und am Verzeichnis", async () => {
    const { raum } = await angelegt("cache-fremd");
    await RS.unterRaumsperre(raum, async () => {
      const a = await B.bestandLesenStreng(laden(), raum);
      /* Kern mit anderem Stand (ein Weg an bestandSchreiben vorbei). */
      const k = await laden().getWithMetadata(`kern:${raum}`, { type: "json" });
      await laden().setJSON(`kern:${raum}`, { ...k.data, mandanten: k.data.mandanten.map((m) => ({ ...m, name: "fremd" })) },
        { metadata: { ...k.metadata, stand: Number(a.stand) + 7 } });
      expect((await B.bestandLesenStreng(laden(), raum)).bestand.mandanten[0].name).toBe("fremd");
      /* Eine Scherbe verschwindet (Raumlöschung o. Ä.). */
      await laden().delete(`scherbe:${raum}:m1:2025-04`);
      const c = await B.bestandLesenStreng(laden(), raum);
      expect(c.bestand.mandanten[0].abweichungen["p0|2025-04-03"]).toBeUndefined();
    });
  });
  it("Drei-Wege-Abgleich unter der Sperre liest den Bestand nicht ein zweites Mal", async () => {
    const { raum, g } = await angelegt("cache-dreiwege");
    const a = kopie(g.bestand); a.mandanten[0].abweichungen["p1|2025-02-03"] = "N";
    await B.bestandSchreiben(laden(), raum, a, { erwarteterStand: g.stand, durch: "A" });
    const { s, z } = zaehlAblage(laden());
    await RS.unterRaumsperre(raum, async () => {
      await B.bestandLesenStreng(s, raum);
      const vorher = z.scherbeGelesen;
      const b2 = kopie(g.bestand); b2.mandanten[0].abweichungen["p2|2025-03-04"] = "N";
      const erg = await B.bestandSchreiben(s, raum, b2, { erwarteterStand: g.stand, durch: "B" });
      expect(erg.ok).toBe(true);
      expect(z.scherbeGelesen - vorher).toBe(0);
    });
  });
});

/* ------------------------------------------------------------------------ */
describe("Segmentschreiber teileSchreiben", { timeout: 120000 }, () => {
  /** Derselbe Ausgangsstand in zwei Räumen: einer schreibt voll, der andere in Teilen. */
  async function zwilling(was) {
    const b = betrieb();
    const voll = neuerRaum(`${was}-voll`), teil = neuerRaum(`${was}-teil`);
    await B.bestandSchreiben(laden(), voll, b, { durch: "Pruefung" });
    await B.bestandSchreiben(laden(), teil, b, { durch: "Pruefung" });
    return { voll, teil, g: await B.bestandLesenStreng(laden(), voll) };
  }
  async function gleichGespeichert(voll, teil) {
    const a = await B.bestandLesenStreng(laden(), voll), b2 = await B.bestandLesenStreng(laden(), teil);
    expect(b2.bestand).toEqual(a.bestand);
    expect(b2.stand).toBe(a.stand);
    expect((await vermerk(teil, Number(b2.stand))).abdruecke).toEqual((await vermerk(voll, Number(a.stand))).abdruecke);
    const liste = async (r) => (await laden().list({ prefix: `scherbe:${r}:` })).blobs.map((x) => x.key.slice(r.length)).sort();
    expect(await liste(teil)).toEqual(await liste(voll));
  }

  it("Gleichwertigkeit: Kern + eine Scherbe in Teilen = derselbe Bestand voll geschrieben", async () => {
    const { voll, teil, g } = await zwilling("gleich");
    const neu = kopie(g.bestand);
    neu.mandanten[0].name = "Haus neu";
    neu.mandanten[0].abweichungen["p1|2025-03-17"] = "F";
    delete neu.mandanten[0].erfassung["p2|2025-03-04"];
    const z = SCH.zerlegen(neu);
    expect((await B.bestandSchreiben(laden(), voll, neu, { erwarteterStand: g.stand, durch: "Pruefung" })).ok).toBe(true);
    const t = await B.teileSchreiben(laden(), teil, { kern: z.kern, scherben: [z.scherben.get("m1::2025-03")] },
      { erwarteterStand: g.stand, durch: "Pruefung" });
    expect(t.ok).toBe(true);
    expect(t.geschrieben).toBe(2);
    await gleichGespeichert(voll, teil);
  });
  it("Gleichwertigkeit: neue Scherbe (neuer Monat) und geleerte Scherbe (entfernt)", async () => {
    const { voll, teil, g } = await zwilling("neu-leer");
    const neu = kopie(g.bestand);
    const m = neu.mandanten[0];
    for (const f of ["abweichungen", "erfassung", "einstempeln"])
      for (const k of Object.keys(m[f])) if (k.includes("|2025-02-")) delete m[f][k];
    m.abweichungen["p0|2026-07-01"] = "F";
    expect((await B.bestandSchreiben(laden(), voll, neu, { erwarteterStand: g.stand, durch: "Pruefung" })).ok).toBe(true);
    const leer = { mandantId: "m1", monat: "2025-02", felder: { abweichungen: {}, erfassung: {}, einstempeln: {} } };
    const t = await B.teileSchreiben(laden(), teil, { scherben: [leer, SCH.zerlegen(neu).scherben.get("m1::2026-07")] },
      { erwarteterStand: g.stand, durch: "Pruefung" });
    expect(t.ok).toBe(true);
    await gleichGespeichert(voll, teil);
  });
  it("übernimmt alte Text-Abdrücke unberührter Scherben übersetzt in den neuen Vermerk", async () => {
    const { raum, g } = await angelegt("teil-alt");
    await laden().setJSON(`stand:${raum}:${g.stand}`, altVermerk(g.bestand));
    const s = SCH.zerlegen(g.bestand).scherben.get("m1::2025-01");
    const n = kopie(s); n.felder.abweichungen["p0|2025-01-03"] = "N";
    const t = await B.teileSchreiben(laden(), raum, { scherben: [n] }, { erwarteterStand: g.stand, durch: "Pruefung" });
    expect(t.ok).toBe(true);
    const v = await vermerk(raum, Number(t.stand));
    const ist = await B.bestandLesenStreng(laden(), raum);
    const z = SCH.zerlegen(ist.bestand);
    const erwartet = { kern: SCH.kernAbdruck(z.kern) };
    for (const [id, x] of z.scherben) erwartet[id] = SCH.abdruck(x);
    expect(v.abdruecke).toEqual(erwartet);
  });
  it("compare-and-set: veralteter Stand → Konflikt, nichts geschrieben", async () => {
    const { raum, g } = await angelegt("teil-cas");
    const a = kopie(g.bestand); a.mandanten[0].name = "zuerst";
    await B.bestandSchreiben(laden(), raum, a, { erwarteterStand: g.stand, durch: "A" });
    const vorher = await B.bestandLesenStreng(laden(), raum);
    const s = SCH.zerlegen(g.bestand).scherben.get("m1::2025-04");
    const t = await B.teileSchreiben(laden(), raum, { scherben: [{ ...s, felder: { ...s.felder, abweichungen: {} } }] },
      { erwarteterStand: g.stand, durch: "B" });
    expect(t).toMatchObject({ ok: false, grund: "konflikt", stand: vorher.stand });
    expect(await B.bestandLesenStreng(laden(), raum)).toEqual(vorher);
    /* Ohne erwarteten Stand wird nicht geschrieben (der Teilweg hat immer eine Grundlage). */
    await expect(B.teileSchreiben(laden(), raum, { scherben: [] }, { durch: "B" })).rejects.toThrow(/erwarteterStand/);
  });
  it("Rennen: zwei Teil-Schreiber und ein Voll-Schreiber auf demselben Stand — genau einer gewinnt, kein Verlust", async () => {
    const { raum, g } = await angelegt("teil-rennen");
    const z = SCH.zerlegen(g.bestand);
    const s1 = kopie(z.scherben.get("m1::2025-01")); s1.felder.abweichungen["p0|2025-01-03"] = "A";
    const s2 = kopie(z.scherben.get("m1::2025-02")); s2.felder.abweichungen["p0|2025-02-03"] = "B";
    const voll = kopie(g.bestand); voll.mandanten[0].abweichungen["p0|2025-01-03"] = "C";
    const erg = await Promise.all([
      B.teileSchreiben(laden(), raum, { scherben: [s1] }, { erwarteterStand: g.stand, durch: "T1" }),
      B.teileSchreiben(laden(), raum, { scherben: [s2] }, { erwarteterStand: g.stand, durch: "T2" }),
      B.bestandSchreiben(laden(), raum, voll, { erwarteterStand: g.stand, durch: "V" }),
    ]);
    const tOk = erg.slice(0, 2).filter((e) => e.ok).length;
    expect(tOk).toBeLessThanOrEqual(1);
    const ende = await B.bestandLesenStreng(laden(), raum);
    const ab = ende.bestand.mandanten[0].abweichungen;
    if (erg[0].ok) expect(ab["p0|2025-01-03"]).toBe("A");
    if (erg[1].ok) expect(ab["p0|2025-02-03"]).toBe("B");
    if (erg[2].ok && !erg[0].ok) expect(ab["p0|2025-01-03"]).toBe("C");
    expect(Number(ende.stand)).toBe(Number(g.stand) + erg.filter((e) => e.ok).length);
    /* Nichts sonst ging verloren. */
    expect(Object.keys(ende.bestand.mandanten[0].einstempeln).length).toBe(Object.keys(g.bestand.mandanten[0].einstempeln).length);
  });
  it("fail-closed bei falscher Form: fremder Monat, unbekanntes Feld, unbekannter Betrieb, Kern mit Monatsdaten, kaputter Monat", async () => {
    const { raum, g } = await angelegt("teil-form");
    const vorher = await B.bestandLesenStreng(laden(), raum);
    const s = SCH.zerlegen(g.bestand).scherben.get("m1::2025-01");
    const zNeu = SCH.zerlegen(g.bestand);
    const kernMitMonat = kopie(zNeu.kern); kernMitMonat.mandanten[0].abweichungen = { "p0|2025-01-03": "N" };
    const falsch = [
      { scherben: [{ ...s, felder: { ...s.felder, abweichungen: { "p0|2025-02-03": "N" } } }] },
      { scherben: [{ ...s, felder: { ...s.felder, istEingefroren: {} } }] },
      { scherben: [{ ...s, felder: { ...s.felder, protokoll: {} } }] },
      { scherben: [{ ...s, mandantId: "m9" }] },
      { scherben: [{ ...s, monat: "2025-1" }] },
      { scherben: [{ ...s, monat: "2025-13" }] },
      { scherben: [s, s] },
      { scherben: "nein" },
      { kern: kernMitMonat },
      { kern: null, scherben: [] },
      { kern: [] },
    ];
    for (const teile of falsch) {
      await expect(B.teileSchreiben(laden(), raum, teile, { erwarteterStand: g.stand, durch: "X" }),
        JSON.stringify(teile).slice(0, 120)).rejects.toMatchObject({ code: "TEILE_UNGUELTIG" });
    }
    expect(await B.bestandLesenStreng(laden(), raum)).toEqual(vorher);
  });
  it("fail-closed bei unklarem Stand der Platte: kein Vermerk → unbestimmt, nichts geschrieben", async () => {
    const { raum, g } = await angelegt("teil-unbestimmt");
    await laden().delete(`stand:${raum}:${g.stand}`);
    const vorher = await B.bestandLesenStreng(laden(), raum);
    const s = SCH.zerlegen(g.bestand).scherben.get("m1::2025-01");
    const t = await B.teileSchreiben(laden(), raum, { scherben: [s] }, { erwarteterStand: g.stand, durch: "X" });
    expect(t).toMatchObject({ ok: false, grund: "unbestimmt" });
    expect(await B.bestandLesenStreng(laden(), raum)).toEqual(vorher);
    expect(await laden().get(`stand:${raum}:${g.stand}`, { type: "json" })).toBe(null);
  });
  it("Atomarität: Abbruch nach dem Journal → alles gilt; Abbruch davor → nichts", async () => {
    for (const [n, gilt] of [[1, false], [2, true], [3, true], [4, true]]) {
      const { raum, g } = await angelegt(`teil-atomar-${n}`);
      const z = SCH.zerlegen(g.bestand);
      const kern = kopie(z.kern); kern.mandanten[0].name = "neu";
      const s1 = kopie(z.scherben.get("m1::2025-01")); s1.felder.abweichungen["p0|2025-01-03"] = "A";
      const s2 = kopie(z.scherben.get("m1::2025-02")); s2.felder.abweichungen["p0|2025-02-03"] = "B";
      await expect(B.teileSchreiben(absturzAblage(laden(), n), raum, { kern, scherben: [s1, s2] },
        { erwarteterStand: g.stand, durch: "X" })).rejects.toThrow("Absturz");
      const ist = (await B.bestandLesenStreng(laden(), raum)).bestand.mandanten[0];
      expect([ist.name, ist.abweichungen["p0|2025-01-03"], ist.abweichungen["p0|2025-02-03"]], `n=${n}`)
        .toEqual(gilt ? ["neu", "A", "B"] : ["Haus", "F", "F"]);
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("Epoche", { timeout: 120000 }, () => {
  it("entsteht beim ersten Schreiben, steht in Zeiger und Kern, bleibt über Schreibvorgänge gleich", async () => {
    const { raum, g } = await angelegt("epoche");
    expect(typeof g.epoche).toBe("string");
    expect(g.epoche.length).toBeGreaterThanOrEqual(8);
    expect((await zeiger(raum)).epoche).toBe(g.epoche);
    const neu = kopie(g.bestand); neu.mandanten[0].name = "x";
    await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    const g2 = await B.bestandLesenStreng(laden(), raum);
    expect(g2.epoche).toBe(g.epoche);
    const s = SCH.zerlegen(g2.bestand).scherben.get("m1::2025-01");
    expect((await B.teileSchreiben(laden(), raum, { scherben: [s] }, { erwarteterStand: g2.stand, erwarteteEpoche: g.epoche, durch: "T" })).ok).toBe(true);
    expect((await B.bestandLesenStreng(laden(), raum)).epoche).toBe(g.epoche);
    expect((await zeiger(raum)).epoche).toBe(g.epoche);
  });
  it("neueEpoche (Wiederherstellen) und Wiederanlauf ändern sie; eine fremde Epoche → Teil-Schreiben „epoche“", async () => {
    const { raum, g } = await angelegt("epoche-neu");
    await B.bestandSchreiben(laden(), raum, g.bestand, { erwarteterStand: g.stand, neueEpoche: true, durch: "Wiederherstellen" });
    const g2 = await B.bestandLesenStreng(laden(), raum);
    expect(g2.epoche).not.toBe(g.epoche);
    const s = SCH.zerlegen(g2.bestand).scherben.get("m1::2025-01");
    const t = await B.teileSchreiben(laden(), raum, { scherben: [s] }, { erwarteterStand: g2.stand, erwarteteEpoche: g.epoche, durch: "T" });
    expect(t).toMatchObject({ ok: false, grund: "epoche", epoche: g2.epoche });
    /* Wiederanlauf: Zeiger hinter dem Kern. */
    await laden().setJSON(`stand:${raum}:aktuell`, { nr: Number(g2.stand) - 1, zeit: "x", epoche: g2.epoche });
    const neu = kopie(g2.bestand); neu.mandanten[0].name = "y";
    await B.bestandSchreiben(laden(), raum, neu, { durch: "Pruefung" });
    expect((await B.bestandLesenStreng(laden(), raum)).epoche).not.toBe(g2.epoche);
  });
  it("Altbestand ohne Epoche: Lesen liefert null, das nächste Schreiben vergibt eine", async () => {
    const { raum, g } = await angelegt("epoche-alt");
    const k = await laden().getWithMetadata(`kern:${raum}`, { type: "json" });
    const { epoche, ...meta } = k.metadata; // eslint-disable-line no-unused-vars
    await laden().setJSON(`kern:${raum}`, k.data, { metadata: meta });
    await laden().setJSON(`stand:${raum}:aktuell`, { nr: Number(g.stand), zeit: "x" });
    expect((await B.bestandLesen(laden(), raum)).epoche).toBe(null);
    const neu = kopie(g.bestand); neu.mandanten[0].name = "z";
    await B.bestandSchreiben(laden(), raum, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    const e = (await B.bestandLesen(laden(), raum)).epoche;
    expect(typeof e).toBe("string");
    expect((await zeiger(raum)).epoche).toBe(e);
  });
  it("Wiederherstellen über HTTP erhöht die Epoche", async () => {
    const raum = neuerRaum("epoche-http");
    const b = betrieb(); b.mandanten[0].personen.push({ id: "l1", vorname: "L", nachname: "L", rolle: "leitung", bereich: "ALLE",
      qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
    await B.bestandSchreiben(laden(), raum, b, { durch: "Pruefung" });
    const token = (await sitzungAnlegen({ bestand: raum, name: "L", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" },
      3600 * 1000)).token;
    const WIRT = "127.0.0.1:3000";
    let n = 0;
    const anfrage = async (pfad, methode, rumpf) => {
      n += 1;
      const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: { host: WIRT, origin: `http://${WIRT}`,
        "x-forwarded-for": `10.49.1.${n}`, "content-type": "application/json", authorization: `Bearer ${token}` },
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
      return { status: a.status, ...(await a.json().catch(() => ({}))) };
    };
    const s = await anfrage("/api/sicherung", "POST", {});
    expect(s.status, JSON.stringify(s)).toBe(200);
    const vorher = await B.bestandLesenStreng(laden(), raum);
    const w = await anfrage("/api/wiederherstellen", "POST", { marke: s.marke, etag: vorher.stand });
    expect(w.status, JSON.stringify(w)).toBe(200);
    expect((await B.bestandLesenStreng(laden(), raum)).epoche).not.toBe(vorher.epoche);
  });
});

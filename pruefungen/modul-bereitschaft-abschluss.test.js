/* ==========================================================================
   MODUL BEREITSCHAFTSDIENST — Nachbesserung M-BD2, N-BD3, N-1, N-2
   (Nachholreview WP-19, Review 2026-11-18 zu #267)

   M-BD2 (a) Einträge „Person|Tag“ in einem abgeschlossenen Monat sind nicht
             anleg-, änder- oder entfernbar; maßgeblich ist der GESPEICHERTE
             Abschlussstand. Unveränderte Alteinträge bleiben speicherbar.
   M-BD2 (b) Die Vergütung vergangener Dienste ändert sich nicht durch eine
             Änderung der Stufe (Probe: Faktor 0,5 → 1 machte aus 300 Minuten
             600). Lösung: gebundene Stufen sind in Art und Faktor fest; eine neue
             Tariffassung ist eine neue Stufe.
   N-BD3     Das Modul liest keine Uhr; der Prüftag kommt vom Aufrufer
             (betriebstag der Serveruhr). Feste Uhr in diesen Tests.
   N-1, N-2  Vereinigung der Inanspruchnahmen: Eigenschaftstest gegen eine
             Minuten-Zählung (2 000 Zufallsdienste, fester Startwert).

   Zustandstests: nach jeder abgewiesenen Aktion ist der Bestand byte-gleich.
   Das Modul bleibt „geplant“; geschrieben wird nur im Prüfmodus (Registry-Kopie).
   ========================================================================== */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  bereitschaftZusammen, bereitschaftAnrechnung, gebundeneStufen, inanspruchnahmeMinuten, inanspruchnahmeLaenge,
  pruefeBereitschaftEintrag, fensterMinuten,
} from "../server/lib/modul-bereitschaftsdienst.mjs";
import { modulVon } from "../server/lib/branchenmodule.mjs";
import { branchenbestand, schreibeAls, vorlaeufigListe, schalterAn } from "./hilfen/branchenbetrieb.mjs";

const FEST = "2026-11-18T10:00:00.000Z";                       // betriebstag 2026-11-18
const HEUTE = "2026-11-18";
beforeEach(() => { vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] }); });
afterEach(() => { vi.useRealTimers(); });

const kopie = (x) => JSON.parse(JSON.stringify(x));
const plus = (tag, n) => new Date(Date.parse(`${tag}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const STUFEN = [
  { id: "B", name: "Stufe B", art: "bereitschaft", faktor: 0.5, quelle: "Tarif X § 12 (Fassung 2026)" },
  { id: "O", name: "ohne Tarifwert", art: "bereitschaft", faktor: null },
  { id: "Z", name: "Stufe Z (nur künftig)", art: "bereitschaft", faktor: 0.3 },
];
const D = (stufe, extra = {}) => ({ stufe, beginn: "16:00", ende: "02:00", ...extra });         // 600 Minuten
const ABSCHLUSS = { "2026-10": { abgeschlossen: true, am: "2026-11-02T08:00:00.000Z", wer: "l1" } };
const EINTRAEGE = {
  "a1|2026-10-12": D("B"),                                       // abgeschlossener Monat
  "a1|2026-11-10": D("B"),                                       // vergangen, offener Monat
  "l1|2026-11-05": D("O"),                                       // vergangen, Faktor ungeklärt
  "a1|2026-11-25": D("Z"),                                       // künftig
};
const LISTE = vorlaeufigListe("bereitschaftsdienst");
function betrieb({ abschluss = ABSCHLUSS, eintraege = EINTRAEGE, stufen = STUFEN } = {}) {
  const g = branchenbestand({ pakete: ["klinik"], branche: "klinik", branchenmodule: schalterAn("bereitschaftsdienst") });
  const m = g.mandanten[0];
  m.bereitschaftStufen = kopie(stufen);
  m.bereitschaft = kopie(eintraege);
  if (abschluss) m.monatsabschluss = kopie(abschluss);
  return g;
}
const abgewiesen = (r) => !!r && typeof r.verweigert === "string";
/** Schreibt als Rolle im Prüfmodus; gibt Ergebnis und die Prüfung „Bestand unverändert“ zurück. */
function versuch(g, r, aendern) {
  const vorher = JSON.stringify(g);
  const res = schreibeAls(g, r, aendern, { liste: LISTE });
  return { res, unveraendert: JSON.stringify(g) === vorher };
}

describe("Ausgangslage", () => {
  it("Registry unverändert: bereitschaftsdienst „geplant“, ohne Abnahme", () => {
    expect(modulVon("bereitschaftsdienst").status).toBe("geplant");
    expect(modulVon("bereitschaftsdienst").abnahme).toBeUndefined();
  });
  it("Registry „geplant“ (echt): auch eine zulässige Änderung bleibt geschlossen", () => {
    const { res, unveraendert } = (() => { const g = betrieb(); const v = JSON.stringify(g);
      const r = schreibeAls(g, "LT", (m) => { m.bereitschaft[`a1|2026-11-20`] = D("Z"); }); return { res: r, unveraendert: JSON.stringify(g) === v }; })();
    expect(res.verweigert).toMatch(/wirkt in diesem Betrieb nicht/);
    expect(unveraendert).toBe(true);
  });
});

describe("M-BD2 (a): abgeschlossener Monat (gespeicherter Abschlussstand)", () => {
  for (const r of ["LT", "PL", "KD"]) {
    it(`${r}: Ändern, Anlegen und Entfernen im abgeschlossenen Monat abgewiesen, Bestand byte-gleich`, () => {
      const faelle = {
        aendern: (m) => { m.bereitschaft["a1|2026-10-12"] = D("B", { ende: "03:00" }); },
        anlegen: (m) => { m.bereitschaft["l1|2026-10-13"] = D("B"); },
        entfernen: (m) => { delete m.bereitschaft["a1|2026-10-12"]; },
        stufeTauschen: (m) => { m.bereitschaft["a1|2026-10-12"] = D("Z"); },
      };
      for (const [fall, f] of Object.entries(faelle)) {
        const { res, unveraendert } = versuch(betrieb(), r, f);
        expect(abgewiesen(res), `${r} ${fall}`).toBe(true);
        expect(res.verweigert, `${r} ${fall}`).toMatch(/Monat Oktober 2026 ist abgeschlossen/);
        expect(unveraendert, `${r} ${fall}`).toBe(true);
      }
    });
    it(`${r}: unveränderte Alteinträge bleiben speicherbar, neue im offenen Monat werden gespeichert`, () => {
      const { res } = versuch(betrieb(), r, (m) => { m.bereitschaft["a1|2026-11-20"] = D("Z"); });
      expect(abgewiesen(res), r).toBe(false);
      const b = res.mandanten[0].bereitschaft;
      expect(JSON.stringify(b["a1|2026-10-12"])).toBe(JSON.stringify(EINTRAEGE["a1|2026-10-12"]));
      expect(b["a1|2026-11-20"]).toEqual(D("Z"));
    });
  }
  it("der Rumpf entscheidet nie: ein mitgeschickter „offener“ Oktober öffnet nichts", () => {
    const { res, unveraendert } = versuch(betrieb(), "LT", (m) => {
      m.monatsabschluss = { "2026-10": { abgeschlossen: false } };
      m.bereitschaft["a1|2026-10-12"] = D("B", { ende: "03:00" });
    });
    expect(abgewiesen(res)).toBe(true);
    expect(unveraendert).toBe(true);
  });
  it("Funktion: Abschlussstand nur aus dem gespeicherten Betrieb, nie aus dem übermittelten", () => {
    const alt = betrieb().mandanten[0];
    const neu = kopie(alt); neu.monatsabschluss = {}; neu.bereitschaft["a1|2026-10-12"] = D("B", { ende: "03:00" });
    expect(bereitschaftZusammen(neu, alt, { heute: HEUTE }).grund).toMatch(/Oktober 2026 ist abgeschlossen/);
    const offen = betrieb({ abschluss: null }).mandanten[0];
    const neu2 = kopie(offen); neu2.monatsabschluss = { "2026-11": { abgeschlossen: true } }; neu2.bereitschaft["a1|2026-11-20"] = D("Z");
    expect(bereitschaftZusammen(neu2, offen, { heute: HEUTE })).toEqual({});
  });
  it("…und ein mitgeschickter „abgeschlossener“ November sperrt nichts", () => {
    const { res } = versuch(betrieb(), "LT", (m) => {
      m.monatsabschluss = { ...m.monatsabschluss, "2026-11": { abgeschlossen: true } };
      m.bereitschaft["a1|2026-11-20"] = D("Z");
    });
    expect(abgewiesen(res)).toBe(false);
  });
  it("wiederöffneter Monat (gespeichert abgeschlossen: false): Änderung erlaubt", () => {
    const { res } = versuch(betrieb({ abschluss: { "2026-10": { abgeschlossen: false, am: "2026-11-02T08:00:00.000Z" } } }), "LT",
      (m) => { m.bereitschaft["a1|2026-10-12"] = D("B", { ende: "03:00" }); });
    expect(abgewiesen(res)).toBe(false);
    expect(res.mandanten[0].bereitschaft["a1|2026-10-12"].ende).toBe("03:00");
  });
  it("Schichtverantwortung, Beschäftigte, Betriebsrat: keine Wirkung, Bestand byte-gleich", () => {
    for (const r of ["SV", "MA", "BR"]) {
      const { res, unveraendert } = versuch(betrieb(), r, (m) => { if (m.bereitschaft) m.bereitschaft["a1|2026-10-12"] = D("B", { ende: "03:00" }); });
      expect(res === null || abgewiesen(res) || JSON.stringify(res.mandanten[0].bereitschaft) === JSON.stringify(EINTRAEGE), r).toBe(true);
      expect(unveraendert, r).toBe(true);
    }
  });
  it("Funktion: ein fehlendes Feld gilt als leer — Einträge abgeschlossener Monate fehlen dann (abgewiesen)", () => {
    const alt = betrieb().mandanten[0];
    const neu = kopie(alt); delete neu.bereitschaft;
    expect(bereitschaftZusammen(neu, alt, { heute: HEUTE }).grund).toMatch(/abgeschlossen/);
    const ohneAbschluss = betrieb({ abschluss: null }).mandanten[0];
    const neu2 = kopie(ohneAbschluss); delete neu2.bereitschaft;
    expect(bereitschaftZusammen(neu2, ohneAbschluss, { heute: HEUTE })).toEqual({});
  });
});

describe("M-BD2 (b): keine rückwirkende Änderung der Vergütung über die Stufe", () => {
  const verguetung = (m, k) => bereitschaftAnrechnung(m.bereitschaft[k], m.bereitschaftStufen.find((s) => s.id === m.bereitschaft[k].stufe)).verguetungsMinuten;
  it("Probe: Faktor 0,5 → 1 der Stufe eines vergangenen Dienstes wird abgewiesen; die Vergütung bleibt 300 Minuten", () => {
    for (const r of ["LT", "KD"]) {
      const g = betrieb();
      expect(verguetung(g.mandanten[0], "a1|2026-11-10")).toBe(300);
      const { res, unveraendert } = versuch(g, r, (m) => { m.bereitschaftStufen.find((s) => s.id === "B").faktor = 1; });
      expect(abgewiesen(res), r).toBe(true);
      expect(res.verweigert).toMatch(/Stufe B: Art und Faktor gelten für vergangene/);
      expect(unveraendert, r).toBe(true);
      expect(verguetung(g.mandanten[0], "a1|2026-11-10")).toBe(300);
    }
  });
  it("Art ändern, Faktor leeren: ebenso abgewiesen", () => {
    for (const f of [(s) => { s.art = "rufbereitschaft"; }, (s) => { s.faktor = null; }, (s) => { delete s.faktor; }]) {
      const { res, unveraendert } = versuch(betrieb(), "LT", (m) => { f(m.bereitschaftStufen.find((s) => s.id === "B")); });
      expect(abgewiesen(res)).toBe(true);
      expect(unveraendert).toBe(true);
    }
  });
  it("neue Tariffassung = neue Stufe: künftiger Dienst rechnet mit ihr, der vergangene bleibt bei 300", () => {
    const { res } = versuch(betrieb(), "LT", (m) => {
      m.bereitschaftStufen.push({ id: "B2", name: "Stufe B (Fassung 2027)", art: "bereitschaft", faktor: 1, quelle: "Tarif X § 12 (Fassung 2027)" });
      m.bereitschaft["a1|2026-11-25"] = D("B2");
    });
    expect(abgewiesen(res)).toBe(false);
    expect(verguetung(res.mandanten[0], "a1|2026-11-10")).toBe(300);
    expect(verguetung(res.mandanten[0], "a1|2026-11-25")).toBe(600);
  });
  it("Stufe nur mit künftigen Diensten: Faktor änderbar; Name und Quelle einer gebundenen Stufe auch", () => {
    const a = versuch(betrieb(), "LT", (m) => { m.bereitschaftStufen.find((s) => s.id === "Z").faktor = 0.4; });
    expect(abgewiesen(a.res)).toBe(false);
    const b = versuch(betrieb(), "LT", (m) => { Object.assign(m.bereitschaftStufen.find((s) => s.id === "B"), { name: "Stufe B neu", quelle: "Tarif X § 12a" }); });
    expect(abgewiesen(b.res)).toBe(false);
  });
  it("ungeklärter Faktor darf erstmals gesetzt werden (vorher gab es keine Vergütung)", () => {
    const g = betrieb();
    expect(verguetung(g.mandanten[0], "l1|2026-11-05")).toBeNull();
    const { res } = versuch(g, "LT", (m) => { m.bereitschaftStufen.find((s) => s.id === "O").faktor = 0.5; });
    expect(abgewiesen(res)).toBe(false);
    expect(verguetung(res.mandanten[0], "l1|2026-11-05")).toBe(300);
  });
  it("Planung ändert Stufen nie (nur Organisationsleitung)", () => {
    const { res, unveraendert } = versuch(betrieb(), "PL", (m) => { m.bereitschaftStufen.find((s) => s.id === "Z").faktor = 0.4; });
    expect(res.verweigert).toMatch(/Organisationsleitung/);
    expect(unveraendert).toBe(true);
  });
  it("gebunden: vergangene Dienste und Dienste abgeschlossener Monate (auch nach dem Prüftag), sonst nicht", () => {
    const alt = betrieb({ abschluss: { "2026-12": { abgeschlossen: true } },
      eintraege: { "a1|2026-11-10": D("B"), "a1|2026-12-03": D("Z"), "a1|2026-11-25": D("O"), "a1|2026-11-18": D("O") } }).mandanten[0];
    expect([...gebundeneStufen(alt, HEUTE)].sort()).toEqual(["B", "Z"]);
    const neu = kopie(alt); neu.bereitschaftStufen.find((s) => s.id === "Z").faktor = 0.9;
    expect(bereitschaftZusammen(neu, alt, { heute: HEUTE }).grund).toMatch(/Stufe Z/);
  });
  it("Funktion: die Bindung kommt aus dem gespeicherten Stand — Entfernen des vergangenen Dienstes im selben Speichern löst sie nicht", () => {
    const alt = betrieb({ abschluss: null, eintraege: { "a1|2026-11-10": D("B"), "a1|2026-11-25": D("Z") } }).mandanten[0];
    const neu = kopie(alt); delete neu.bereitschaft["a1|2026-11-10"]; neu.bereitschaftStufen.find((s) => s.id === "B").faktor = 1;
    expect(bereitschaftZusammen(neu, alt, { heute: HEUTE }).grund).toMatch(/Stufe B/);
  });
  it("der gespeicherte Stand bindet: ein im selben Speichern umgehängter vergangener Dienst löst die Bindung nicht", () => {
    const { res, unveraendert } = versuch(betrieb(), "LT", (m) => {
      m.bereitschaft["a1|2026-11-10"] = D("Z");
      m.bereitschaftStufen.find((s) => s.id === "B").faktor = 1;
    });
    expect(abgewiesen(res)).toBe(true);
    expect(unveraendert).toBe(true);
  });
});

describe("N-BD3: keine Uhr im Modul, Prüftag vom Aufrufer", () => {
  it("die Moduldatei liest keine Uhr", () => {
    const src = readFileSync(new URL("../server/lib/modul-bereitschaftsdienst.mjs", import.meta.url), "utf8");
    expect(src).not.toMatch(/Date\.now|new Date\(\)/);
  });
  it("Zwei-Jahres-Fenster um den übergebenen Prüftag: ±731 Tage gültig, ±732 nicht", () => {
    const m = { bereitschaftStufen: STUFEN, personen: [{ id: "a1" }] };
    const mit = (tag) => bereitschaftZusammen({ ...m, bereitschaft: { [`a1|${tag}`]: D("Z") } }, undefined, { heute: HEUTE });
    expect(mit(plus(HEUTE, 731))).toEqual({});
    expect(mit(plus(HEUTE, -731))).toEqual({});
    expect(mit(plus(HEUTE, 732)).grund).toMatch(/zwei Jahre/);
    expect(mit(plus(HEUTE, -732)).grund).toMatch(/zwei Jahre/);
    expect(bereitschaftZusammen({ ...m, bereitschaft: { "a1|2026-11-20": D("Z") } }, undefined, { heute: "kein Tag" }).grund).toMatch(/Prüftag/);
  });
  it("der Schreibweg nimmt den Betriebstag der Serveruhr (Europe/Berlin), nicht die UTC-Uhrzeit", () => {
    vi.setSystemTime(new Date("2026-11-18T23:30:00.000Z"));       // Berlin: 2026-11-19 00:30
    const grenze = plus("2026-11-19", 731);
    const ok = versuch(betrieb({ abschluss: null }), "LT", (m) => { m.bereitschaft[`a1|${grenze}`] = D("Z"); });
    expect(abgewiesen(ok.res)).toBe(false);
    const nein = versuch(betrieb({ abschluss: null }), "LT", (m) => { m.bereitschaft[`a1|${plus(grenze, 1)}`] = D("Z"); });
    expect(nein.res.verweigert).toMatch(/zwei Jahre/);
    expect(nein.unveraendert).toBe(true);
  });
});

/* ------------------------------------------------------------------ N-1, N-2: Eigenschaftstest der Vereinigung */
function zufall(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hhmm = (min) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((min % 60) + 60) % 60).padStart(2, "0")}`;

describe("N-1/N-2: inanspruchnahmeMinuten ist die Vereinigung (Eigenschaftstest, 2 000 Dienste, fester Startwert)", () => {
  it("gleich der Minuten-Zählung, nie mehr als Fenster oder Summe der Längen; Summe der Längen zählt Überlappung doppelt", () => {
    const r = zufall(20261118);
    let mitUeberlappung = 0;
    for (let n = 0; n < 2000; n++) {
      const beginn = Math.floor(r() * 96) * 15;
      const dauer = 15 + Math.floor(r() * 1425);
      const e = { stufe: "Z", beginn: hhmm(beginn), ende: hhmm(beginn + dauer), inanspruchnahmen: [] };
      const anzahl = Math.floor(r() * 7);
      const belegt = new Uint8Array(dauer);
      for (let i = 0; i < anzahl; i++) {
        const von = Math.floor(r() * dauer);
        const laenge = 1 + Math.floor(r() * Math.min(180, dauer - von));
        if (von + laenge > dauer) continue;
        e.inanspruchnahmen.push({ von: hhmm(beginn + von), bis: hhmm(beginn + von + laenge) });
        belegt.fill(1, von, von + laenge);
      }
      expect(pruefeBereitschaftEintrag(e, STUFEN), `#${n}`).toBeNull();
      const vereinigung = inanspruchnahmeMinuten(e);
      const zaehlung = belegt.reduce((s, x) => s + x, 0);
      const summe = e.inanspruchnahmen.reduce((s, i) => s + inanspruchnahmeLaenge(i), 0);
      expect(vereinigung, `#${n} ${JSON.stringify(e)}`).toBe(zaehlung);
      expect(vereinigung).toBeLessThanOrEqual(fensterMinuten(e.beginn, e.ende));
      expect(vereinigung).toBeLessThanOrEqual(summe);
      if (summe > vereinigung) mitUeberlappung++;
      /* Rufbereitschaft: die Arbeitszeit ist die Vereinigung, nie die Summe der Längen. */
      expect(bereitschaftAnrechnung(e, { id: "R", art: "rufbereitschaft", faktor: 0.125 }).arbeitszeitMinuten).toBe(vereinigung);
    }
    expect(mitUeberlappung, "die Stichprobe enthält Überlappungen").toBeGreaterThan(100);
  });
  it("Beginn genau am Fensterbeginn (relativ 0) und verschachtelt: kein Sonderfall (N-1)", () => {
    const e = D("Z", { inanspruchnahmen: [{ von: "16:00", bis: "16:30" }, { von: "16:00", bis: "17:00" }, { von: "16:10", bis: "16:20" }] });
    expect(inanspruchnahmeMinuten(e)).toBe(60);
    expect(inanspruchnahmeMinuten(D("Z", { inanspruchnahmen: [{ von: "16:00", bis: "16:30" }, { von: "16:30", bis: "17:00" }] }))).toBe(60);
  });
  it("die Pflicht steht im JSDoc (spätere Konto-/Ruhezeitrechnung summiert die Vereinigung)", () => {
    const src = readFileSync(new URL("../server/lib/modul-bereitschaftsdienst.mjs", import.meta.url), "utf8");
    expect(src).toMatch(/Verbindlich für jede spätere Rechnung \(Konto WP-22, Ruhezeit R4/);
    expect(src).toMatch(/\(inanspruchnahmeLaenge\) dürfen nie aufsummiert werden/);
  });
});

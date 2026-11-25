/* ==========================================================================
   IMP-6 PLANWIRKUNG (PR 1: Rechenkern) — ENTSCHEIDUNGSLISTE P2-4 Punkt 6

   Die zugeordneten Schichtmodelle einer Person gelten je Tag in der
   Planrechnung — nur hinter der Planwirkung (Vorgabe AUS). Geprüft:

   K. Tabelle Modelle × Tage: Zykluslänge und Versatz je Modell, Wechsel am
      Folgetag (Q1), Monats-/Jahreswechsel, Zeitumstellung (März/Oktober) —
      die drei Planrechnungen (Oberfläche personTag, Server dienstAm,
      Einfrieren planTag) gleich einer unabhängigen Referenz.
   L. Lücke (Q5: kein Dienst, nie das Betriebsmodell), Überschneidung
      („uneindeutig“, nie still gewählt), ungültige Zuordnung (Klärung).
   N. Nachtschicht über Mitternacht am Wechseltag, Ruhezeit (§ 5 ArbZG) und
      Sommerzeit (WP-ZEIT: dauerAm) — Fachprüfung und Server-Schutzrechnung.
   T. Teilzeit im eigenen Modell; Betriebsmodell unverändert.
   M. Mehrere Modelle in einem Betrieb, Besetzung und Posten.
   D3. Differenz: Planwirkung AUS byte-gleich (auch mit Modellen, Lücken,
      Überschneidungen); AN ohne eigene Modelle byte-gleich; AN mit eigenem
      Modell wirkt (Gegenprobe).
   A. Abgeschlossene Monate: Soll, Ist, Konto, Zuschläge, Lohnexport ändern
      sich durch die Wirkung nicht; ein Abschluss unter Wirkung friert das
      damals gültige Modell ein.
   V. Vorprüfung vor dem Einschalten (vergangene, freigegebene, abgeschlossene Tage).
   R. Rollen: Sicht von Leitung, Planung, Beschäftigten, Betriebsrat (Q4).
   F. Zufallsmuster gegen die Referenz.
   S. Schalter: nur genau "true"; seit PR 2 an genau drei Stellen verbunden (Wächter), Gesamtsuche einheitDienst(.
   Q7. Selbstauskunft (Art. 15 DSGVO) für schichtmodellZuordnungen: Stand.

   Feste Uhr (Fake-Timer) für die Planrechnung; die Bibliothek bekommt Tage übergeben.
   Aufruf: npx vitest run pruefungen/imp6-planwirkung.test.js --maxWorkers=1
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEST, VON, BIS, MONAT, betriebe, messen, zufall } from "./engine-golden.fixture.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));
/** Eigene Datumsrechnung (nicht die der Bibliothek): Tag + n über Date.UTC mit Tagesüberlauf. */
const tagNach = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const tageVon = (von, bis) => { const aus = []; for (let d = von; d <= bis; d = tagNach(d, 1)) aus.push(d); return aus; };

let FP, PL, IE, SD, SZ, F, I, E, K, MA;
beforeAll(async () => {
  vi.useFakeTimers({ now: new Date(FEST), toFake: ["Date"] });
  FP = await import("../server/lib/fachpruefung.mjs");
  PL = await import("../server/lib/engine/plan.mjs");
  IE = await import("../server/lib/isteinfrieren.mjs");
  SD = await import("../server/lib/schutzdurchsetzung.mjs");
  SZ = await import("../server/lib/schichtzuordnung.mjs");
  MA = await import("../server/lib/monatsabschluss.mjs");
  F = await import("../src/lib/fachlogik.js");
  I = IE;
  E = await import("../server/lib/engine/zeit.mjs");
  K = await import("../server/lib/engine/rechenkern.mjs");
}, 240000);
afterAll(() => { vi.useRealTimers(); });
/* Nach jeder Prüfung wieder AUS — keine Prüfung erbt die Wirkung einer anderen. */
afterEach(() => { if (FP) FP.schichtmodellWirkungSetzen(false); });
const an = () => FP.schichtmodellWirkungSetzen(true);
const aus = () => FP.schichtmodellWirkungSetzen(false);

/* ------------------------------------------------------------------------
   Kleiner Betrieb für die Tabellen: Früh, Spät, Nacht über Mitternacht, dazu D0 … D41 (für Zykluslängen bis 42).
   ------------------------------------------------------------------------ */
const LAENGEN = [1, 5, 7, 9, 14, 21, 28, 42];
const DA = [
  { id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
  { id: "S", name: "Spät", kurz: "S", start: "14:00", ende: "22:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
  { id: "N", name: "Nacht", kurz: "N", start: "22:00", ende: "06:00", mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
  ...Array.from({ length: 42 }, (_, i) => ({ id: `D${i}`, name: `D${i}`, kurz: `D${i}`, start: "08:00", ende: "12:00",
    mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } })),
];
const modell = (n) => ({ id: `len${n}`, name: `Länge ${n}`, tage: Array.from({ length: n }, (_, i) => `D${i}`) });
const betrieb = (personen, extra = {}) => ({
  id: "b1", name: "Testbetrieb", bundesland: "HE", dienstarten: kopie(DA),
  schichtmodelle: [...LAENGEN.map(modell), { id: "nacht1", name: "Nacht", tage: ["N"] }, { id: "frueh1", name: "Früh", tage: ["F"] },
    { id: "fsn", name: "FSN frei", tage: ["F", "F", "S", "S", "N", "N", "-", "-"] }],
  zyklus: { tage: ["F", "S", "N", "-"], wochen: 1 }, anker: "2026-01-05",
  einheiten: [{ id: "e1", name: "E1", versatzTage: 0 }, { id: "e2", name: "E2", versatzTage: 1 }],
  personen, abweichungen: {}, abwesenheiten: [], qualifikationen: [], einstellungen: { ruhezeit: 11 }, ...extra,
});
const person = (id, zuordnungen, extra = {}) => ({ id, vorname: "V", nachname: id, eintritt: "2020-01-01", wochenstunden: 40,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...(zuordnungen ? { schichtmodellZuordnungen: zuordnungen } : {}), ...extra });
const zu = (id, modellId, gueltigAb, gueltigBis = null, versatz) => ({ id, modellId, gueltigAb, gueltigBis, ...(versatz === undefined ? {} : { versatz }) });

/* ------------------------------------------------------------------------
   Unabhängige Referenz: zählt Tag für Tag (keine Formel der Bibliothek). Liefert die rohe Folge (vor Teilzeit).
   ------------------------------------------------------------------------ */
function referenz(m, p, d) {
  if (p.springer || p.imSchichtdienst === false) return { art: "ohne", dienst: null };
  const liste = Array.isArray(p.schichtmodellZuordnungen) && p.schichtmodellZuordnungen.length ? p.schichtmodellZuordnungen
    : [{ id: null, modellId: "betrieb", gueltigAb: null, gueltigBis: null }];
  const treffer = liste.filter((z) => (z.gueltigAb == null || z.gueltigAb <= d) && (z.gueltigBis == null || d <= z.gueltigBis));
  if (!treffer.length) return { art: "keine", dienst: null };
  if (treffer.length > 1) return { art: "uneindeutig", dienst: null };
  const z = treffer[0];
  if (z.modellId === "betrieb") {
    let eid = null; for (const x of p.zugehoerigkeit || []) if (!x.ab || x.ab <= d) eid = x.einheitId;
    const e = m.einheiten.find((x) => x.id === eid);
    if (!e) return { art: "dienst", dienst: null };
    let i = e.versatzTage || 0;                                    // Anker: Zyklustag 1, Einheit verschoben
    for (let t = m.anker; t < d; t = tagNach(t, 1)) i++;
    const id = m.zyklus.tage[i % m.zyklus.tage.length];
    return { art: "dienst", dienst: id && id !== "-" ? id : null };
  }
  const mo = m.schichtmodelle.find((x) => x.id === z.modellId);
  if (!mo) return { art: "ungueltig", dienst: null };
  const v = z.versatz == null ? 0 : z.versatz;
  if (!(Number.isInteger(v) && v >= 0 && v < mo.tage.length)) return { art: "ungueltig", dienst: null };
  let i = v;
  for (let t = z.gueltigAb; t < d; t = tagNach(t, 1)) i = (i + 1) % mo.tage.length;
  const id = mo.tage[i];
  return { art: "dienst", dienst: id && id !== "-" ? id : null };
}
/** Die drei Planrechnungen: Oberfläche (personTag), Server (dienstAm), Einfrieren (planTag). */
const drei = (m, p, d) => {
  const t = PL.personTag(m, p, d);
  const pt = IE.planTag(m, p, d);
  return { oberflaeche: t.dienstId, server: FP.dienstAm(m, p, d), einfrieren: pt ? pt.dienstId : null };
};
const gleichDrei = (m, p, d, erwartet, info) => expect(drei(m, p, d), info).toEqual({ oberflaeche: erwartet, server: erwartet, einfrieren: erwartet });

/* ======================================================================== */
describe("K. Tabelle Modelle × Tage: Zykluslänge, Versatz, Wechsel am Folgetag (Planwirkung AN)", () => {
  const WECHSEL = {
    "mitten im Monat": "2027-11-16",
    "Monatswechsel": "2027-12-01",
    "Jahreswechsel": "2028-01-01",
    "Schalttag": "2028-02-29",
    "Zeitumstellung März (2028-03-26)": "2028-03-26",
    "Zeitumstellung Oktober (2028-10-29)": "2028-10-29",
  };
  for (const n of LAENGEN) for (const [fall, wechsel] of Object.entries(WECHSEL)) {
    it(`Modell der Länge ${n} → Länge ${LAENGEN[(LAENGEN.indexOf(n) + 3) % LAENGEN.length]}, Wechsel ${fall}: alle drei Rechnungen = Referenz`, () => {
      const n2 = LAENGEN[(LAENGEN.indexOf(n) + 3) % LAENGEN.length];
      const beginn = tagNach(wechsel, -(2 * n + 3));
      for (const [v1, v2] of [[0, 0], [n - 1, Math.floor(n2 / 2)], [Math.floor(n / 2), n2 - 1]]) {
        const p = person("a1", [zu("z1", `len${n}`, beginn, tagNach(wechsel, -1), v1), zu("z2", `len${n2}`, wechsel, null, v2)]);
        const m = betrieb([p]);
        an();
        for (const d of tageVon(tagNach(beginn, -2), tagNach(wechsel, 2 * n2 + 5))) {
          const r = referenz(m, p, d);
          gleichDrei(m, p, d, r.dienst, `n=${n}→${n2} v=${v1}/${v2} ${d}`);
        }
        /* Am Wechseltag beginnt das neue Modell mit seinem Versatz (Zyklustag v2 + 1), am Vortag gilt noch das alte. */
        expect(FP.schichtmodellLageAm(m, p, wechsel)).toMatchObject({ art: "dienst", modellId: `len${n2}`, zuordnungId: "z2", index: v2 });
        expect(FP.schichtmodellLageAm(m, p, tagNach(wechsel, -1))).toMatchObject({ art: "dienst", modellId: `len${n}`, zuordnungId: "z1" });
        /* Vor der ersten Zuordnung: kein Modell (Q5), kein Rückgriff auf das Betriebsmodell. */
        expect(FP.schichtmodellLageAm(m, p, tagNach(beginn, -1))).toEqual({ art: "keine" });
        aus();
      }
    });
  }
  it("Betriebsmodell als ausdrückliche Zuordnung, danach eigenes Modell: Einheitsversatz bis zum Wechsel, dann Modell", () => {
    const p = person("a1", [zu("alt", "betrieb", null, "2027-11-30"), zu("neu", "fsn", "2027-12-01", null, 3)],
      { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e2" }] });
    const m = betrieb([p]);
    an();
    for (const d of tageVon("2027-11-20", "2027-12-20")) gleichDrei(m, p, d, referenz(m, p, d).dienst, d);
    expect(drei(m, p, "2027-12-01").server).toBe("S");                // fsn Index 3 = S
  });
});

/* ======================================================================== */
describe("L. Lücke, Überschneidung, ungültige Zuordnung: nie still ein Modell", () => {
  it("Lücke (Q5): kein Dienst aus einem Modell, nie das Betriebsmodell; Abweichung gilt weiter", () => {
    const p = person("a1", [zu("a", "len7", "2027-11-01", "2027-11-10", 0), zu("b", "len9", "2027-11-20", null, 1)]);
    const m = betrieb([p], { abweichungen: { "a1|2027-11-15": "S" } });
    an();
    for (const d of tageVon("2027-11-11", "2027-11-19")) {
      expect(FP.schichtmodellLageAm(m, p, d), d).toEqual({ art: "keine" });
      gleichDrei(m, p, d, d === "2027-11-15" ? "S" : null, d);
    }
    /* Gegenprobe: ohne Zuordnung hätte das Betriebsmodell an diesen Tagen Dienste. */
    const ohne = betrieb([person("a1", null)]);
    expect(tageVon("2027-11-11", "2027-11-19").some((d) => FP.dienstAm(ohne, ohne.personen[0], d))).toBe(true);
  });
  it("Überschneidung (nur über alte Sicherung speicherbar): „uneindeutig“ mit beiden Kennungen, kein Dienst, Klärungsliste", () => {
    for (const [a, b] of [["2027-11-01", "2027-11-15"], ["2027-11-15", "2027-11-01"]]) {
      const p = person("a1", [zu("x", "len5", a, "2027-11-30", 0), zu("y", "frueh1", b, null, 0)]);
      const m = betrieb([p]);
      an();
      const l = FP.schichtmodellLageAm(m, p, "2027-11-20");
      expect(l.art).toBe("uneindeutig");
      expect([...l.zuordnungIds].sort()).toEqual(["x", "y"]);
      gleichDrei(m, p, "2027-11-20", null, `${a}/${b}`);
      const k = FP.schichtmodellKlaerungen(m, "2027-11-01", "2027-12-05");
      expect(k.faelle.length).toBe(16);                               // 15. bis 30. November
      expect(k.faelle[0]).toEqual({ personId: "a1", datum: "2027-11-15", art: "uneindeutig", zuordnungIds: expect.any(Array) });
      aus();
    }
  });
  it("ungültige Zuordnung (Versatz außerhalb, unbekanntes Modell, fehlender Beginn): kein Dienst, Klärung", () => {
    for (const z of [zu("v", "len7", "2027-11-01", null, 7), zu("u", "gibtsnicht", "2027-11-01", null, 0), { id: "o", modellId: "len7", gueltigAb: null, gueltigBis: null }]) {
      const p = person("a1", [z]);
      const m = betrieb([p]);
      an();
      expect(FP.schichtmodellLageAm(m, p, "2027-11-05").art, z.id).toBe("ungueltig");
      gleichDrei(m, p, "2027-11-05", null, z.id);
      expect(FP.schichtmodellKlaerungen(m, "2027-11-05", "2027-11-05").faelle, z.id).toHaveLength(1);
      aus();
    }
  });
  it("„keine“ ist kein Klärungsfall; implizites Betriebsmodell nie", () => {
    const m = betrieb([person("a1", [zu("a", "len7", "2027-11-01", "2027-11-03", 0)]), person("a2", null)]);
    expect(FP.schichtmodellKlaerungen(m, "2027-10-01", "2027-12-31")).toEqual({ faelle: [], begrenzt: false });
  });
  it("Klärungsliste mit unbegrenztem Zeitraum rechnet nicht endlos (Tagesgrenze je Person)", () => {
    const m = betrieb([person("a1", [zu("a", "len7", "2027-11-01", null, 0)])]);
    expect(FP.schichtmodellKlaerungen(m, "2000-01-01", "2099-12-31")).toEqual({ faelle: [], begrenzt: true });
  });
  it("Springer und Personen außerhalb des Schichtdiensts: keine Folge, auch mit Zuordnung", () => {
    for (const extra of [{ springer: true }, { imSchichtdienst: false }]) {
      const p = person("a1", [zu("a", "frueh1", "2027-11-01", null, 0)], extra);
      const m = betrieb([p]);
      an();
      expect(FP.schichtmodellLageAm(m, p, "2027-11-05"), JSON.stringify(extra)).toEqual({ art: "ohne" });
      gleichDrei(m, p, "2027-11-05", null, JSON.stringify(extra));
      aus();
    }
  });
});

/* ======================================================================== */
describe("N. Nachtschicht über Mitternacht am Wechseltag, Ruhezeit, Zeitumstellung", () => {
  /* Nachtmodell bis zum Wechseltag, Frühmodell ab dem Folgetag: Nacht 22–06 und Früh ab 06 → 0 h Ruhezeit (§ 5 ArbZG). */
  const fall = (wechsel) => {
    const p = person("a1", [zu("n", "nacht1", "2027-01-01", tagNach(wechsel, -1), 0), zu("f", "frueh1", wechsel, null, 0)]);
    return { p, m: betrieb([p], { zyklus: { tage: ["-"], wochen: 1 } }) };
  };
  const k = (m) => ({ dienstAm: (p, d) => FP.dienstAm(m, p, d), alleinOhnePartner: () => false, heute: "2027-01-01" });
  for (const wechsel of ["2027-06-15", "2027-03-28", "2027-10-31"]) {
    it(`Wechsel Nacht → Früh am ${wechsel}: Fachprüfung meldet die Ruhezeit nur mit Planwirkung`, () => {
      const { p, m } = fall(wechsel);
      const frueh = m.dienstarten.find((x) => x.id === "F");
      an();
      expect(FP.dienstAm(m, p, tagNach(wechsel, -1))).toBe("N");
      expect(FP.dienstAm(m, p, wechsel)).toBe("F");
      const mitWirkung = FP.einteilungsBefunde(m, p, frueh, wechsel, k(m)).map((b) => b.regel);
      expect(mitWirkung).toContain("ruhezeitGesetz");
      aus();
      /* Aus: das Betriebsmodell (hier nur frei) — keine Nacht am Vortag, keine Ruhezeitverletzung. */
      expect(FP.dienstAm(m, p, tagNach(wechsel, -1))).toBe(null);
      expect(FP.einteilungsBefunde(m, p, frueh, wechsel, k(m)).map((b) => b.regel)).not.toContain("ruhezeitGesetz");
    });
  }
  it("Zeitumstellung (WP-ZEIT): die Nacht vor dem Oktober-Wechsel dauert 9 h, vor dem März-Wechsel 7 h — Modell ändert die Stundenregel nicht", async () => {
    const R = await import("../server/lib/regelwerk.mjs");
    const nacht = DA.find((x) => x.id === "N");
    for (const [wechsel, h] of [["2027-10-31", 9], ["2027-03-28", 7], ["2027-06-15", 8]]) {
      const { p, m } = fall(wechsel);
      an();
      const d = tagNach(wechsel, -1);
      expect(FP.dienstAm(m, p, d), d).toBe("N");
      expect(R.dauerAm(d, nacht), d).toBe(h);
      aus();
    }
  });
  it("Server-Schutzrechnung (fachpruefungUebermittlung): eine neue Früh-Einteilung nach der Modell-Nacht ist mit Planwirkung ein Befund", () => {
    /* Am Tag vor dem Wechsel Nacht aus dem Modell; die Planung trägt am Wechseltag ausdrücklich F ein (statt frei). */
    const wechsel = "2027-06-15";
    const p = person("a1", [zu("n", "nacht1", "2027-01-01", null, 0)]);
    const alt = betrieb([p], { zyklus: { tage: ["-"], wochen: 1 } });
    const neu = { ...kopie(alt), abweichungen: { [`a1|${wechsel}`]: "F" } };
    an();
    const mit = SD.fachpruefungUebermittlung(alt, neu, "2027-06-01");
    expect(mit && mit.sperre).toMatch(/2027-06-15.*Ruhezeit unter 11 Stunden/);
    aus();
    const ohne = SD.fachpruefungUebermittlung(alt, neu, "2027-06-01");
    expect(ohne).toBeNull();                                         // ohne Wirkung: Vortag frei, nichts zu sperren
  });
});

/* ======================================================================== */
describe("T. Teilzeit", () => {
  it("Quote 50 % im eigenen Modell: genau die Hälfte der Modell-Dienste über viele Zyklen (± 1), nur an Modell-Diensttagen", () => {
    const p = person("a1", [zu("a", "fsn", "2027-01-01", null, 0)], { wochenstunden: 20, teilzeit: { aktiv: true, modus: "quote" } });
    const m = betrieb([p], { einstellungen: { ruhezeit: 11, sollWochenstunden: 40 } });
    an();
    const tage = tageVon("2027-01-01", tagNach("2027-01-01", 8 * 30 - 1));                  // 30 Zyklen à 8 Tage, 6 Dienste
    const dienste = tage.map((d) => FP.dienstAm(m, p, d));
    const voll = tage.map((d) => referenz(m, p, d).dienst);
    expect(dienste.every((x, i) => x === null || x === voll[i])).toBe(true);
    const n = dienste.filter(Boolean).length;
    expect(Math.abs(n - 90)).toBeLessThanOrEqual(1);
    for (const d of tage) gleichDrei(m, p, d, FP.dienstAm(m, p, d), d);
  });
  it("Wochentage-Modus: nur an den genannten Wochentagen, sonst frei", () => {
    const p = person("a1", [zu("a", "frueh1", "2027-01-04", null, 0)], { teilzeit: { aktiv: true, modus: "wochentage", wochentage: [1, 3] } });
    const m = betrieb([p]);
    an();
    const tage = tageVon("2027-01-04", "2027-01-17");
    /* Wochentage wie dow() des Regelwerks: Montag = 0 … Sonntag = 6 (also Di und Do). */
    expect(tage.map((d) => FP.dienstAm(m, p, d) || "-").join("")).toBe(tage.map((d) => ([1, 3].includes((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) ? "F" : "-")).join(""));
  });
  it("Springer mit Einheit (Review #429 A2): keine Folge — AUS wie bisher, AN ebenso, auch mit eigener Zuordnung", () => {
    const tage = tageVon("2027-01-01", "2027-01-14");
    for (const zuordnungen of [null, [zu("a", "frueh1", "2026-12-01", null, 0)]]) {
      const p = person("sp", zuordnungen, { springer: true });
      const m = betrieb([p]);
      const ohne = { ...p, springer: false };                          // Gegenprobe: ohne springer gäbe es Dienste
      for (const w of [false, true]) {
        FP.schichtmodellWirkungSetzen(w);
        expect(tage.some((d) => FP.dienstAm(betrieb([ohne]), ohne, d)), `Gegenprobe ${w}`).toBe(true);
        for (const d of tage) gleichDrei(m, p, d, null, `${w ? "AN" : "AUS"} ${d} ${zuordnungen ? "mit" : "ohne"} Zuordnung`);
        for (const d of tage) expect(FP.planDienst(m, p, d), d).toBe(null);
      }
      aus();
    }
  });
  it("Betriebsmodell mit Teilzeit: AN gleich AUS", () => {
    const p = person("a1", null, { wochenstunden: 25, teilzeit: { aktiv: true, modus: "quote" } });
    const m = betrieb([p], { einstellungen: { ruhezeit: 11, sollWochenstunden: 40 } });
    const tage = tageVon("2027-01-01", "2027-04-30");
    const vorher = tage.map((d) => FP.dienstAm(m, p, d));
    an();
    expect(tage.map((d) => FP.dienstAm(m, p, d))).toEqual(vorher);
  });
});

/* ======================================================================== */
describe("M. Mehrere Modelle in einem Betrieb, Besetzung und Posten", () => {
  it("drei Personen, drei Modelle, eine Einheit: Besetzung je Dienst nach dem eigenen Modell", () => {
    const m = betrieb([person("a1", [zu("a", "frueh1", "2027-11-01", null, 0)]), person("a2", [zu("b", "nacht1", "2027-11-01", null, 0)]),
      person("a3", [zu("c", "fsn", "2027-11-01", null, 2)])]);
    an();
    const b = PL.besetzung(kopie(m), "2027-11-01");
    expect(b.F.personen.map((x) => x.id)).toEqual(["a1"]);
    expect(b.N.personen.map((x) => x.id)).toEqual(["a2"]);
    expect(b.S.personen.map((x) => x.id)).toEqual(["a3"]);
  });
  it("Posten aus dem Gruppendienst F: nur wer nach seinem Modell F hat, besetzt ihn", () => {
    const posten = { id: "PF", name: "Posten F", kurz: "PF", posten: true, quelle: "F", start: "06:00", ende: "14:00",
      mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } };
    const m = betrieb([person("a1", [zu("a", "nacht1", "2027-11-01", null, 0)]), person("a2", [zu("b", "frueh1", "2027-11-01", null, 0)])]);
    m.dienstarten.push(posten);
    an();
    /* Review #429 A1: Der Pool ist nach Kennung geordnet ([a1, a2]), der Start ist between(anker, Tag) % 2. Am 04.11.2027
       ist der Abstand zum Anker gerade — der Start liegt auf a1 (Nacht): Die Person mit dem falschen Modell steht wirklich
       vorn. Ohne den Abgleich r === posten.quelle nähme a1 den einzigen Platz, a2 bliebe bei F. */
    const TAG = "2027-11-04";
    expect(Math.round((Date.UTC(2027, 10, 4) - Date.UTC(2026, 0, 5)) / 86400000) % 2).toBe(0);
    const mm = kopie(m);
    expect(PL.personTag(mm, mm.personen[1], TAG).dienstId).toBe("PF");
    expect(PL.personTag(mm, mm.personen[0], TAG).dienstId).toBe("N");
    expect([...IE.postenBesatzung(mm, "e1", TAG, "PF")]).toEqual(["a2"]);
    const pt = IE.planTag(mm, mm.personen[1], TAG);
    expect(pt.dienstId).toBe("PF");
  });
});

/* ======================================================================== */
describe("D3. Differenz auf den Golden-Betrieben: AUS byte-gleich, AN ohne eigene Modelle byte-gleich", () => {
  let FALL = [];
  beforeAll(() => { FALL = betriebe(F); }, 240000);
  /** Alles, was aus einem Betrieb gerechnet wird — Oberfläche, Server (dienstAm, planTag) und Schutzrechnung. */
  const alles = (m) => {
    const r = { messen: messen(F, m) };
    delete r.messen.besetzung;
    delete r.messen.verteilung;
    const v = F.verteilung(m, MONAT);
    r.verteilung = { ...v, zeilen: v.zeilen.map((z) => ({ ...z, person: z.person.id })) };
    const tage = Array.from({ length: 30 }, (_, i) => `${MONAT}-${String(i + 1).padStart(2, "0")}`);
    r.besetzung = tage.map((d) => Object.fromEntries(Object.entries(F.besetzung(m, d)).map(([k, e]) => [k, { ...e, personen: e.personen.map((p) => p.id) }])));
    r.server = m.personen.map((p) => tage.map((d) => FP.dienstAm(m, p, d)));
    r.planTag = m.personen.map((p) => tage.map((d) => { const t = IE.planTag(m, p, d); return t ? [t.dienstId, t.plan] : null; }));
    r.zuschlag = m.personen.map((p) => [F.zuschlagStunden(m, p, MONAT), F.zuschlagWert(m, p, MONAT)]);
    r.einfrieren = (() => { try { return I.istEinfrieren(m, MONAT); } catch (e) { return { fehler: String(e && e.message) }; } })();
    r.kern = E.mitTagesdatum("2026-11-06", () => K.rechnen(m, { zeitraum: { von: VON, bis: BIS }, heute: "2026-11-06" }));
    /* Server-Schutzrechnung: je Person eine neue Einteilung an zwei künftigen Tagen (ausdrücklich geprüft, mit den
       Diensten der Nachbartage aus dem Planrechner). Die mittelbare Prüfung (geänderte Schichtfolge) wäre hier zu langsam. */
    const da0 = (m.dienstarten.find((d) => !d.posten && d.start) || {}).id;
    const abw = { ...(m.abweichungen || {}) };
    for (const p of m.personen) for (const d of ["2026-11-12", "2026-11-23"]) abw[`${p.id}|${d}`] = da0;
    r.schutz = (() => { try { return SD.fachpruefungUebermittlung(m, { ...m, abweichungen: abw }, "2026-11-06"); } catch (e) { return { fehler: String(e && e.message) }; } })();
    return JSON.stringify(r);
  };
  const gleich = (neu, alt, name) => {
    if (neu === alt) return;
    let i = 0; while (neu[i] === alt[i]) i++;
    expect(neu.slice(Math.max(0, i - 160), i + 80), name).toBe(alt.slice(Math.max(0, i - 160), i + 80));
  };
  const mitModellen = (m, art) => {
    const n = kopie(m);
    const da = (n.dienstarten || []).filter((d) => !d.posten).map((d) => String(d.id));
    n.schichtmodelle = [{ id: "fuenf", name: "Fünf", tage: [da[0] || "-", da[1] || "-", "-", da[0] || "-", "-"] }];
    n.personen = n.personen.map((p, i) => ({ ...p, schichtmodellZuordnungen:
      art === "betrieb" ? [{ id: `z-${p.id}`, modellId: "betrieb", gueltigAb: null, gueltigBis: null }]
        : art === "eigen" ? [{ id: `z-${p.id}`, modellId: "fuenf", gueltigAb: "2026-10-01", gueltigBis: null, versatz: i % 5 }]
          : art === "luecke" ? [{ id: `z-${p.id}-a`, modellId: "betrieb", gueltigAb: null, gueltigBis: "2026-11-10" },
            { id: `z-${p.id}-b`, modellId: "fuenf", gueltigAb: "2026-11-20", gueltigBis: "2026-11-25", versatz: 2 }]
            : /* ueberschneidung (nur über alte Sicherung) */ [{ id: `z-${p.id}-a`, modellId: "betrieb", gueltigAb: null, gueltigBis: null },
              { id: `z-${p.id}-b`, modellId: "fuenf", gueltigAb: "2026-11-05", gueltigBis: null, versatz: 0 }] }));
    return n;
  };

  it("AUS: mit eigenen Modellen, Lücken und gespeicherten Überschneidungen byte-gleich zum Betrieb ohne Modelle", () => {
    for (const [name, m] of FALL) {
      aus();
      const ohne = alles(kopie(m));
      for (const art of ["betrieb", "eigen", "luecke", "ueberschneidung"]) gleich(alles(mitModellen(m, art)), ohne, `${name} ${art}`);
    }
  }, 480000);
  it("AN ohne eigene Modelle (kein Feld oder nur Betriebsmodell): byte-gleich zu AUS", () => {
    for (const [name, m] of FALL) {
      aus();
      const ohne = alles(kopie(m));
      an();
      gleich(alles(kopie(m)), ohne, `${name} AN ohne Feld`);
      gleich(alles(mitModellen(m, "betrieb")), ohne, `${name} AN Betriebsmodell`);
      aus();
    }
  }, 480000);
  it("Gegenprobe: AN mit eigenem Modell rechnet anders (die Wirkung ist verdrahtet), AUS danach wieder byte-gleich", () => {
    const demo = FALL.filter(([name]) => name.startsWith("demo"));
    expect(demo.length).toBeGreaterThan(0);
    for (const [name, m] of demo) {
      aus();
      const ohne = alles(kopie(m));
      an();
      expect(alles(mitModellen(m, "eigen")) === ohne, name).toBe(false);
      aus();
      gleich(alles(mitModellen(m, "eigen")), ohne, `${name} wieder AUS`);
    }
  }, 480000);
  it("die Eingabe bleibt unverändert (keine stille Migration, kein neues Feld), auch mit Planwirkung", () => {
    for (const [name, m] of FALL) {
      const n = mitModellen(m, "eigen");
      const vorher = JSON.stringify(n);
      an();
      alles(n);
      aus();
      expect(JSON.stringify(n), name).toBe(vorher);
    }
  }, 480000);
});

/* ======================================================================== */
describe("A. Abgeschlossene Monate: die Wirkung ändert Soll, Ist, Konto, Zuschläge und Lohnexport nicht", () => {
  const WER = { personId: "l1", name: "L", rolle: "leitung" };
  const OKT = "2026-10";
  /** Demobetrieb mit abgeschlossenem Oktober; danach Zuordnungen auf ein eigenes Modell über den Oktober (wie vor dem
      Einschalten bei AUS gepflegt — der historische Schutz verhindert, dass sie nachträglich entstehen). */
  const vorbereitet = (wirkungBeimAbschluss) => {
    const m = kopie(betriebe(F).find(([name]) => name.startsWith("demo"))[1]);
    const da = m.dienstarten.filter((d) => !d.posten).map((d) => String(d.id));
    m.schichtmodelle = [{ id: "fuenf", name: "Fünf", tage: [da[1], da[0], "-", da[1], "-"] }];
    const zuordnen = (x) => ({ ...x, personen: x.personen.map((p, i) => ({ ...p, schichtmodellZuordnungen: [
      { id: `z-${p.id}`, modellId: "fuenf", gueltigAb: "2026-09-01", gueltigBis: null, versatz: i % 5 }] })) });
    const vorAbschluss = wirkungBeimAbschluss ? zuordnen(m) : m;
    if (wirkungBeimAbschluss) an(); else aus();
    const r = MA.abschliessen(vorAbschluss, { monat: OKT, trotzPrueffaellen: true }, WER, new Date(FEST), "ma-1", "2026-11-06");
    expect(r.mandant, r.grund).toBeTruthy();
    aus();
    return zuordnen(r.mandant);
  };
  const abrechnung = (m) => JSON.stringify({
    ist: m.personen.map((p) => F.istStunden(m, p, OKT)), soll: m.personen.map((p) => F.sollStunden(m, p, OKT)),
    konto: m.personen.map((p) => F.stundenkonto(m, p, OKT)), zuschlag: m.personen.map((p) => [F.zuschlagStunden(m, p, OKT), F.zuschlagWert(m, p, OKT)]),
    tage: m.personen.map((p) => tageVon("2026-10-01", "2026-10-31").map((d) => { const t = PL.istTag(m, p, d); return [t.da && t.da.id, t.idn && t.idn.std, !!t.eingefroren]; })),
    lohn: MA.exportZeilenFuer(m, OKT),
  });

  it("Abschluss bei AUS, danach Planwirkung AN: der abgeschlossene Monat rechnet aus dem Eingefrorenen — unverändert", () => {
    const m = vorbereitet(false);
    aus();
    const vorher = abrechnung(kopie(m));
    expect(vorher).toContain("true");                                  // es ist wirklich eingefroren
    an();
    expect(abrechnung(kopie(m))).toBe(vorher);
  }, 240000);
  it("Abschluss bei AN friert das damals gültige Modell ein; spätere Änderung des Schalters ändert den Monat nicht", () => {
    const m = vorbereitet(true);
    an();
    const unterWirkung = abrechnung(kopie(m));
    aus();
    expect(abrechnung(kopie(m))).toBe(unterWirkung);
    /* und es ist das Modell, nicht das Betriebsmodell: Gegenprobe gegen den bei AUS geschlossenen Monat */
    expect(abrechnung(kopie(vorbereitet(false)))).not.toBe(unterWirkung);
  }, 240000);
  it("Vorprüfung meldet den abgeschlossenen Monat (die Plananzeige dieser Tage würde sich ändern)", () => {
    const m = vorbereitet(false);
    const v = SZ.wirkungsVorpruefung(m, "2026-11-06");
    expect(v.personen.length).toBeGreaterThan(0);
    expect(v.personen.some((x) => x.abgeschlossen.includes(OKT))).toBe(true);
  }, 240000);
});

/* ======================================================================== */
describe("V. Vorprüfung vor dem Einschalten", () => {
  it("meldet vergangene und freigegebene Tage mit abweichender Folge; nichts für implizite Zuordnung oder reine Zukunft", () => {
    const m = betrieb([
      person("vergangen", [zu("a", "betrieb", null, "2027-11-09"), zu("b", "frueh1", "2027-11-10", null, 0)]),
      person("zukunft", [zu("a", "betrieb", null, "2027-12-31"), zu("b", "frueh1", "2028-01-01", null, 0)]),
      person("implizit", null),
      person("freigabe", [zu("a", "betrieb", null, "2027-12-14"), zu("b", "nacht1", "2027-12-15", null, 0)]),
    ], { freigaben: { "2027-12": true } });
    const v = SZ.wirkungsVorpruefung(m, "2027-11-20");
    const nach = Object.fromEntries(v.personen.map((x) => [x.personId, x]));
    expect(Object.keys(nach).sort()).toEqual(["freigabe", "vergangen"]);
    /* offen endend: auch der freigegebene Dezember rechnete anders */
    expect(nach.vergangen).toMatchObject({ vergangen: expect.any(Number), freigegeben: ["2027-12"], abgeschlossen: [] });
    expect(nach.vergangen.von >= "2027-11-10" && nach.vergangen.vergangen > 0).toBe(true);
    expect(nach.vergangen.bis.slice(0, 7)).toBe("2027-12");                // letzter betroffener Tag im freigegebenen Monat
    expect(nach.freigabe).toMatchObject({ vergangen: 0, freigegeben: ["2027-12"] });
    expect(v.begrenzt).toBe(false);
    /* Nur Kennungen und Zahlen, keine Namen. */
    for (const p of m.personen) expect(JSON.stringify(v)).not.toContain(`"${p.vorname} ${p.nachname}"`);
    expect(Object.keys(v.personen[0]).sort()).toEqual(["abgeschlossen", "bis", "freigegeben", "personId", "tage", "vergangen", "von"]);
  });
  it("Lücke mit vorher geplantem Dienst zählt als Abweichung (kein stilles Weiterrechnen)", () => {
    const m = betrieb([person("a1", [zu("a", "betrieb", null, "2027-11-05")])]);
    const v = SZ.wirkungsVorpruefung(m, "2027-11-20");
    expect(v.personen).toHaveLength(1);
    expect(v.personen[0].von).toBe("2027-11-06");
  });
});

/* ======================================================================== */
describe("R. Rollen: wer sieht welche Zuordnungen — Grundlage der Verdrahtung in PR 2 (Q4)", () => {
  it("Leitung und Planung: alle Zuordnungen → mit Wirkung derselbe Plan wie der Server; Beschäftigte: nur die eigene; Betriebsrat: keine", async () => {
    const { bestandFuerRolle } = await import("../server/lib/rechte.mjs");
    const demo = kopie(betriebe(F).find(([name]) => name.startsWith("demo"))[1]);
    const da = demo.dienstarten.filter((d) => !d.posten).map((d) => String(d.id));
    demo.schichtmodelle = [{ id: "fuenf", name: "Fünf", tage: [da[1], da[0], "-", da[1], "-"], geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1", version: 1 }];
    demo.personen = demo.personen.map((p, i) => ({ ...p, schichtmodellZuordnungen: [{ id: `z-${p.id}`, modellId: "fuenf",
      gueltigAb: "2026-10-01", gueltigBis: null, versatz: i % 5, geaendertAm: "2026-10-01T00:00:00.000Z", geaendertVon: "l1", version: 1 }] }));
    const b = { mandanten: [demo] };
    const ich = demo.personen[0].id;
    const tage = Array.from({ length: 30 }, (_, i) => `${MONAT}-${String(i + 1).padStart(2, "0")}`);
    an();
    const voll = (m) => m.personen.map((p) => tage.map((d) => FP.dienstAm(m, p, d)));
    const server = voll(demo);
    for (const rolle of ["leitung", "planer"]) {
      const m = bestandFuerRolle(b, { rolle, person: rolle === "leitung" ? "l1" : "p1", betrieb: 0, einheit: null }).mandanten[0];
      expect(m.personen.every((p) => Array.isArray(p.schichtmodellZuordnungen)), rolle).toBe(true);
      expect(voll(m), rolle).toEqual(server);
    }
    const ma = bestandFuerRolle(b, { rolle: "mitarbeiter", person: ich, betrieb: 0, einheit: null }).mandanten[0];
    const eigene = ma.personen.find((p) => String(p.id) === String(ich));
    expect(eigene.schichtmodellZuordnungen).toEqual([{ id: `z-${ich}`, modellId: "fuenf", gueltigAb: "2026-10-01", gueltigBis: null, versatz: 0 }]);
    expect(ma.personen.filter((p) => String(p.id) !== String(ich)).some((p) => "schichtmodellZuordnungen" in p)).toBe(false);
    /* Die eigene Folge ist in der Sicht der Beschäftigten vollständig berechenbar … */
    expect(tage.map((d) => FP.schichtmodellLageAm(ma, eigene, d).dienstId)).toEqual(tage.map((d) => FP.schichtmodellLageAm(demo, demo.personen[0], d).dienstId));
    /* … die der anderen nicht (ohne Feld gilt dort das Betriebsmodell): PR 2 muss ihren Plan anders liefern, nie die Modelle. */
    const andere = ma.personen.find((p) => String(p.id) !== String(ich) && p.zugehoerigkeit);
    if (andere) expect(FP.schichtmodellLageAm(ma, andere, tage[0]).quelle).toBe("betrieb");
    const br = bestandFuerRolle(b, { rolle: "betriebsrat", person: ich, betrieb: 0, einheit: null }).mandanten[0];
    expect(JSON.stringify(br)).not.toContain("schichtmodellZuordnungen");
    expect(br.schichtmodelle === undefined || (Array.isArray(br.schichtmodelle) && br.schichtmodelle.length === 0)).toBe(true);
  }, 240000);
});

/* ======================================================================== */
describe("F. Zufallsmuster gegen die Referenz (feste Startwerte)", () => {
  it("200 Personen mit zufälligen Modellen, Zuordnungsketten (Lücken, Überschneidungen, Fehlwerte): drei Rechnungen = Referenz", () => {
    const z = zufall(20261120);
    const ganz = (n) => Math.floor(z() * n);
    const mods = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `R${i}`,
      tage: Array.from({ length: 1 + ganz(45) }, () => ["F", "S", "N", "-", "-", `D${ganz(42)}`][ganz(6)]) }));
    const personen = [];
    for (let i = 0; i < 200; i++) {
      const liste = []; let d = tagNach("2027-01-01", ganz(60));
      const k = ganz(5);
      for (let j = 0; j < k; j++) {
        const mid = ganz(7) === 0 ? "betrieb" : mods[ganz(mods.length)].id;
        const dauer = ganz(50) + 1;
        const bis = ganz(6) === 0 ? null : tagNach(d, dauer);
        const n = mid === "betrieb" ? 0 : mods.find((x) => x.id === mid).tage.length;
        const versatz = mid === "betrieb" ? undefined : ganz(20) === 0 ? n : ganz(n);       // gelegentlich Fehlwert
        liste.push(zu(`z${j}`, mid, ganz(15) === 0 && mid === "betrieb" ? null : d, bis, versatz));
        if (bis === null) break;
        d = tagNach(bis, ganz(4) === 0 ? -ganz(5) : 1 + ganz(10));                           // gelegentlich Überschneidung, oft Lücke
      }
      personen.push(person(`p${i}`, liste.length ? liste : null, { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: ganz(2) ? "e1" : "e2" }] }));
    }
    const m = betrieb(personen);
    m.schichtmodelle = mods;
    an();
    let geprueft = 0;
    const arten = new Set();
    for (const p of personen) for (let t = 0; t < 40; t++) {
      const d = tagNach("2026-12-15", ganz(400));
      const r = referenz(m, p, d);
      const l = FP.schichtmodellLageAm(m, p, d);
      arten.add(r.art);
      expect(l.art, `${p.id} ${d}`).toBe(r.art);
      gleichDrei(m, p, d, r.dienst, `${p.id} ${d}`);
      geprueft++;
    }
    expect(geprueft).toBe(8000);
    expect([...arten].sort()).toEqual(["dienst", "keine", "uneindeutig", "ungueltig"]);
  }, 240000);
});

/* ======================================================================== */
describe("S. Schalter CENTRIC_SCHICHTMODELL_WIRKUNG (Vorgabe AUS; PR 2: verbunden, Wächter mit Positivliste)", () => {
  const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dateien = (rel) => readdirSync(path.join(wurzel, rel)).flatMap((n) => {
    const r = `${rel}/${n}`;
    return statSync(path.join(wurzel, r)).isDirectory() ? dateien(r) : /\.(mjs|js|jsx)$/.test(n) ? [r] : [];
  });
  it("nur genau „true“ schaltet ein", async () => {
    const S = await import("../server/lib/schalter.mjs");
    const vorher = process.env.CENTRIC_SCHICHTMODELL_WIRKUNG;
    try {
      for (const w of [undefined, "", "1", "TRUE", "yes", " true", "true ", "an"]) {
        if (w === undefined) delete process.env.CENTRIC_SCHICHTMODELL_WIRKUNG; else process.env.CENTRIC_SCHICHTMODELL_WIRKUNG = w;
        expect(S.schichtmodellWirkungAn(), String(w)).toBe(false);
      }
      process.env.CENTRIC_SCHICHTMODELL_WIRKUNG = "true";
      expect(S.schichtmodellWirkungAn()).toBe(true);
      /* Die Planrechnung liest die Umgebung nie selbst: ohne den Server-Einstieg (server/lib/schichtmodell-wirkung.mjs,
         geprüft in imp6-verdrahtung W) bleibt sie aus — diese Datei bindet ihn nicht ein. */
      expect(FP.schichtmodellWirkungAktiv()).toBe(false);
    } finally {
      if (vorher === undefined) delete process.env.CENTRIC_SCHICHTMODELL_WIRKUNG; else process.env.CENTRIC_SCHICHTMODELL_WIRKUNG = vorher;
    }
  });
  it("Quelle fail-closed: eine werfende Quelle oder ein anderer Wert als true gilt als aus", () => {
    FP.schichtmodellWirkungSetzen(() => { throw new Error("x"); });
    expect(FP.schichtmodellWirkungAktiv()).toBe(false);
    for (const w of ["true", 1, {}, () => "true"]) { FP.schichtmodellWirkungSetzen(w); expect(FP.schichtmodellWirkungAktiv(), String(w)).toBe(false); }
    FP.schichtmodellWirkungSetzen(() => true);
    expect(FP.schichtmodellWirkungAktiv()).toBe(true);
  });
  it("Wächter PR 2: genau drei Stellen verbinden die Quelle — Definition, Server-Einstieg, Antwort des Servers an die Oberfläche", () => {
    /* PR 1 verlangte hier „kein Weg“. PR 2 stellt bewusst um: der Server setzt die Quelle aus CENTRIC_SCHICHTMODELL_WIRKUNG
       (schichtmodell-wirkung.mjs, bei jedem Aufruf gelesen), daten.mjs meldet sie der Oberfläche (nur Rollen mit voller
       Sicht), src/speicher.js setzt den Merker allein aus dieser Antwort. Jede weitere Stelle macht diese Prüfung rot. */
    const treffer = [...dateien("server"), ...dateien("src")].filter((r) => /schichtmodellWirkungSetzen|schichtmodellWirkungAn\s*\(/.test(readFileSync(path.join(wurzel, r), "utf8")));
    expect(treffer.sort()).toEqual(["server/funktionen/daten.mjs", "server/lib/fachpruefung.mjs", "server/lib/schichtmodell-wirkung.mjs", "src/speicher.js"]);
    expect(readFileSync(path.join(wurzel, "server/lib/schalter.mjs"), "utf8")).toContain("export const schichtmodellWirkungAn = () => process.env.CENTRIC_SCHICHTMODELL_WIRKUNG === \"true\"");
    expect(readFileSync(path.join(wurzel, "server/lib/fachpruefung.mjs"), "utf8").match(/schichtmodellWirkungSetzen\(/g)).toHaveLength(1);
    expect(readFileSync(path.join(wurzel, "server/lib/schichtmodell-wirkung.mjs"), "utf8").match(/schichtmodellWirkungSetzen\(/g)).toEqual(["schichtmodellWirkungSetzen("]);
    expect(readFileSync(path.join(wurzel, "src/speicher.js"), "utf8")).toMatch(/schichtmodellWirkungSetzen\(daten\.schichtmodellWirkung === true\)/);
    /* nie fest eingeschaltet */
    for (const r of treffer) expect(readFileSync(path.join(wurzel, r), "utf8"), r).not.toMatch(/schichtmodellWirkungSetzen\(\s*(true|\(\) => true)/);
  });
  it("Wächter (Gesamtsuche): jeder Aufruf von einheitDienst( in server/ und src/ steht auf der Positivliste — mit Grund", () => {
    /* Review #429 Hinweis 1. Jede Stelle, die die Schichtfolge einer Einheit für eine PERSON rechnet, muss die Planwirkung
       führen (planDienst, schichtfolgeAm oder ein ausdrücklicher AUS-Zweig); sonst fiele sie bei AN still auf das
       Betriebsmodell zurück (gegen Q5). Stellen, die die Folge einer EINHEIT anzeigen (Aushang, Monatsplan, Lagebild), zeigen
       bewusst das Betriebsmodell und nennen bei AN die Zahl der Personen mit eigenem Modell. Eine neue Fundstelle oder eine
       geänderte Anzahl macht diese Prüfung rot — dann bewusst einordnen. Grenze: erkennt nur den Aufruf im Quelltext. */
    const POSITIV = {
      "server/lib/fachpruefung.mjs": 3,                 // Definition, planDienst AUS-Zweig, schichtmodellLageAm (Betriebsmodell)
      "server/lib/engine/einsatz.mjs": 1,               // Ersatzvorschlag: alter Ausdruck in schichtfolgeAm
      "server/lib/isteinfrieren.mjs": 1,                // AUS-Zweig Postenbesetzung
      "server/lib/schutzdurchsetzung.mjs": 1,           // AUS-Zweig folgeAm (Zwischenspeicher je Einheit)
      "server/lib/schichtzuordnung.mjs": 2,             // modellDienstAm (Betriebsmodell), wirkungsVorpruefung (bisherige Folge)
      "server/lib/schichtfolge-teilrollen.mjs": 1,      // Schreibweg der Teilrollen: Plan, den ein Client ohne Server-Dienst sah (nur bei AN, nur Tage mit eigenem Modell)
      "src/app/aktionen/plan.js": 1,                    // setzeAbweichung: alter Ausdruck in schichtfolgeAm
      "src/app/aktionen/begleitung.js": 1,              // mehrfachDienst: alter Ausdruck in schichtfolgeAm
      "src/lib/fachlogik.js": 2,                        // urlaubskonto, planVergleich: alter Ausdruck in schichtfolgeAm
      "src/lib/aushang.js": 1,                          // Folge der Einheit (Betriebsmodell), Hinweis bei AN
      "src/ansichten/monatsplan.jsx": 1,                // Zeile je Einheit (Betriebsmodell), Hinweis bei AN
      "src/ansichten/lagebild.jsx": 2,                  // Einheit im Regeldienst, Schichtfolge zwei Wochen (Betriebsmodell), Hinweis bei AN
      "src/pruefung.jsx": 12,                           // Selbsttest mit eigener Kopie (rechnet nicht den Plan der Anwendung)
    };
    const gefunden = {};
    for (const r of [...dateien("server"), ...dateien("src")]) {
      const n = (readFileSync(path.join(wurzel, r), "utf8").match(/einheitDienst\(/g) || []).length;
      if (n) gefunden[r] = n;
    }
    expect(gefunden).toEqual(POSITIV);
    /* Personenbezogene Stellen der Oberfläche: nur als alter Ausdruck innerhalb von schichtfolgeAm (AUS wörtlich wie bisher). */
    for (const r of ["src/app/aktionen/plan.js", "src/app/aktionen/begleitung.js", "src/lib/fachlogik.js", "server/lib/engine/einsatz.mjs"]) {
      const q = readFileSync(path.join(wurzel, r), "utf8");
      const zeilen = q.split("\n").filter((z) => z.includes("einheitDienst("));
      for (const z of zeilen) expect(z, r).toMatch(/schichtfolgeAm\(m, p, d, \(\) => .*einheitDienst\(m, eid, d\)/);
    }
    /* Anzeigen je Einheit: der Hinweis hängt an abweichendVomBetriebsmodell (bei AUS 0 ohne Rechnung). */
    for (const r of ["src/lib/aushang.js", "src/ansichten/monatsplan.jsx", "src/ansichten/lagebild.jsx"])
      expect(readFileSync(path.join(wurzel, r), "utf8"), r).toMatch(/abweichendVomBetriebsmodell\(/);
  });
});

/* ======================================================================== */
describe("Q7. Selbstauskunft (Art. 15 DSGVO) für schichtmodellZuordnungen — festgehaltener Stand", () => {
  it("die eigene Auskunft enthält die Zuordnungen vollständig (mit Wann/Wer/Version), nicht aber die Modelldefinition", async () => {
    const { auskunftBauen } = await import("../server/lib/auskunft.mjs");
    const p = person("a1", [{ ...zu("z1", "fsn", "2027-01-01", null, 2), geaendertAm: "2026-12-01T00:00:00.000Z", geaendertVon: "l1", version: 3 }]);
    const m = betrieb([p]);
    const a = auskunftBauen(m, p, { raum: "r", erstellt: "2027-01-10T10:00:00.000Z", umfang: "selbst" });
    expect(a.person.schichtmodellZuordnungen).toEqual(p.schichtmodellZuordnungen);
    expect(JSON.stringify(a.person.schichtmodellZuordnungen)).toContain("geaendertVon");
    expect("schichtmodelle" in a).toBe(false);
    expect(JSON.stringify(a)).not.toContain("FSN frei");                 // Name und Zyklustage des Modells fehlen
    /* Der Plan der Auskunft folgt der Planrechnung: mit Wirkung das Modell (fsn ab Index 2: S am 01.01.2027). */
    an();
    const mit = auskunftBauen(m, p, { raum: "r", erstellt: "2027-01-10T10:00:00.000Z", umfang: "selbst" });
    expect(mit.plan.find((x) => x.datum === "2027-01-01")).toEqual({ datum: "2027-01-01", dienst: "S" });
  });
});

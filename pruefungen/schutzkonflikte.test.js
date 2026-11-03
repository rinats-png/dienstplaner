/* ==========================================================================
   NACHTRAG WP-22b — offene Schutzkonflikte im Browser ohne Ruckeln

   Die Oberfläche zeigt offene Schutzkonflikte (Startseite, Monatsplan). Die
   Rechnung (schutzkonflikteSchritte, server/lib/fachpruefung.mjs) läuft im
   Hauptthread: Abweichungen je Person vorindiziert, in Häppchen von höchstens
   SCHUTZKONFLIKT_HAEPPCHEN_MS, entprellt (useSchutzkonflikte in App.jsx). „Keine
   Nacht“ zählt mit dem Nachtfenster des Betriebs — dieselbe Quelle wie die
   Einsatzregel keinNachtdienst und der Server.

   Aufruf: npx vitest run pruefungen/schutzkonflikte.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { schutzkonflikteSchritte, schutzkonflikteSofort, SCHUTZKONFLIKT_HAEPPCHEN_MS, dienstAm } from "../server/lib/fachpruefung.mjs";
import { schutzKonfliktMitteilungen } from "../server/lib/bestaetigungen.mjs";
import { planungsregelnAbleiten } from "../server/lib/planungsregeln.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const person = (id, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle: "mitarbeiter", status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const plan = (m) => ({ heute: HEUTE, dienstAm: (p, d) => dienstAm(m, p, d) });

describe("Laufzeit: 300 relevante Personen, 20 000 Abweichungen", () => {
  const gross = () => {
    const personen = [];
    for (let i = 0; i < 2000; i++)
      personen.push(person(`x${i}`, `e${i % 20}`, i < 300 ? (i % 3 === 0 ? { mutterschutz: true } : i % 3 === 1 ? { einschraenkungen: { keineNacht: true } } : { geburtstag: tag(-17 * 365) }) : {}));
    const m = { einheiten: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, versatzTage: i % 7 })),
      dienstarten: [{ id: "F", start: "06:00", ende: "14:00" }, { id: "S", start: "12:00", ende: "19:00" }, { id: "N", start: "22:00", ende: "06:00" }],
      zyklus: { tage: ["F", "F", "S", "S", "N", "-", "-"] }, anker: "2026-01-05", personen, abweichungen: {}, einstellungen: {} };
    for (const p of personen) for (let i = 0; i < 400; i += 40) m.abweichungen[`${p.id}|${tag(i)}`] = i % 80 ? "F" : "N";
    return m;
  };
  it(`kein Rechenblock über 50 ms (Häppchen ${SCHUTZKONFLIKT_HAEPPCHEN_MS} ms), Ergebnis wie am Stück`, () => {
    const m = gross();
    expect(Object.keys(m.abweichungen).length).toBe(20000);
    const lauf = () => {
      const it = schutzkonflikteSchritte(m, plan(m));
      let laengster = 0, schritte = 0, r;
      const t0 = performance.now();
      for (;;) {
        const a = performance.now();
        r = it.next();
        laengster = Math.max(laengster, performance.now() - a);
        schritte++;
        if (r.done) break;
      }
      console.log(`Schutzkonflikte: ${r.value.size} Konflikte, ${schritte} Häppchen, längster ${laengster.toFixed(1)} ms, gesamt ${(performance.now() - t0).toFixed(0)} ms`);
      return { r, laengster };
    };
    /* In CI hart beim ersten Lauf; lokal (parallele Prüfdateien) eine Wiederholung. */
    let { r, laengster } = lauf();
    if (!process.env.CI && laengster >= 50) ({ r, laengster } = lauf());
    expect(laengster).toBeLessThan(50);
    expect([...r.value.keys()].sort()).toEqual([...schutzkonflikteSofort(m, plan(m)).keys()].sort());
    expect(r.value.size).toBeGreaterThan(0);
  }, 120000);
});

describe("„keine Nacht“ zählt wie bei Schichtverantwortung und Server", () => {
  const m = (einst = {}) => ({ einheiten: [{ id: "e1" }], dienstarten: [{ id: "S", start: "13:00", ende: "21:00" }, { id: "N", start: "22:00", ende: "06:00" }],
    personen: [person("k", "e1", { einschraenkungen: { keineNacht: true } })], abweichungen: { [`k|${tag(3)}`]: "N", [`k|${tag(4)}`]: "S" }, einstellungen: einst });
  it("Nachtdienst: Konflikt; Spätdienst 13–21 nach Gesetzesfenster: keiner", () => {
    const mm = m();
    const k = schutzkonflikteSofort(mm, plan(mm));
    expect(k.has(`k|${tag(3)}`)).toBe(true);
    expect(k.has(`k|${tag(4)}`)).toBe(false);
  });
  it("Nachtfenster des Betriebs ab 21 Uhr: der Spätdienst bis 21 Uhr bleibt frei, bis 22 Uhr nicht", () => {
    const mm = m({ nachtVon: "20:00", nachtschichtAbStunden: 1 });
    const k = schutzkonflikteSofort(mm, plan(mm));
    expect(k.has(`k|${tag(4)}`)).toBe(true);                               // 20–21 Uhr: 1 h Nachtarbeit nach Betriebsfenster
  });
  it("dieselbe Aussage für die Sicht der Schichtverantwortung (Einsatzregel keinNachtdienst statt Rohfeld)", () => {
    const mm = m();
    const roh = mm.personen[0];
    const sv = { ...roh, einschraenkungen: {}, planungsregeln: planungsregelnAbleiten(roh, { heute: HEUTE }) };
    const msv = { ...mm, personen: [sv] };
    expect([...schutzkonflikteSofort(msv, plan(msv)).keys()]).toEqual([...schutzkonflikteSofort(mm, plan(mm)).keys()]);
  });
});

describe("Mitteilung mit Jahr", () => {
  it("TT.MM.JJJJ", () => {
    const altM = { personen: [person("a", "e1"), { id: "l", rolle: "leitung", vorname: "L", nachname: "L" }] };
    const neu = schutzKonfliktMitteilungen(altM, { ...altM, nachrichten: [] }, [{ personId: "a", datum: "2027-01-05", dienstId: "N" }], "x");
    expect(neu.nachrichten[0].text).toContain("05.01.2027");
  });
});

describe("Oberfläche: entprellt und in Häppchen (Quelltext)", () => {
  it("useSchutzkonflikte statt einer Rechnung im Render", () => {
    const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
    expect(app).toContain("function useSchutzkonflikte(m)");
    expect(app).toMatch(/schutzkonflikteSchritte\(m, schutzkonfliktPlan\(m\)\)/);
    expect(app).toMatch(/setTimeout\(weiter, 0\)/);
    expect(app).not.toMatch(/useMemo\(\(\) => offeneSchutzkonflikte/);
  });
});

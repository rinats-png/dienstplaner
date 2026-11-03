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
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { useSchutzkonflikte, schutzkonfliktSchluessel, merkeSchutzkonflikte, gemerkteSchutzkonflikte, vergissSchutzkonflikte } from "../src/schutzkonflikte-hook.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MATRIX, darf } from "../server/lib/rechte.mjs";
import { schutzkonflikteSchritte, schutzkonflikteSofort, planeSchutzkonflikte, SCHUTZKONFLIKT_ENTPRELLUNG_MS, SCHUTZKONFLIKT_HAEPPCHEN_MS, dienstAm } from "../server/lib/fachpruefung.mjs";
import { schutzKonfliktMitteilungen } from "../server/lib/bestaetigungen.mjs";
import { planungsregelnAbleiten } from "../server/lib/planungsregeln.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { median, quantil, urteil } from "./laufzeitmessung.mjs";

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
      const dauern = [];
      let r;
      const t0 = performance.now();
      for (;;) {
        const a = performance.now();
        r = it.next();
        dauern.push(performance.now() - a);
        if (r.done) break;
      }
      const laengster = Math.max(...dauern);
      console.log(`Schutzkonflikte: ${r.value.size} Konflikte, ${dauern.length} Häppchen, p50 ${quantil(dauern, 0.5).toFixed(1)} p75 ${quantil(dauern, 0.75).toFixed(1)} p90 ${quantil(dauern, 0.9).toFixed(1)} ms, längster ${laengster.toFixed(1)} ms, gesamt ${(performance.now() - t0).toFixed(0)} ms`);
      return { r, laengster, dauern };
    };
    /* Review HOCH 1: aufwärmen, dann drei Läufe; gewertet der Median der
       längsten Blöcke (Grenze 50 ms) und die Verteilung der Häppchen. */
    lauf();
    const laeufe = [lauf(), lauf(), lauf()];
    const r = laeufe[0].r;
    const alle = laeufe.flatMap((l) => l.dauern);
    expect(quantil(alle, 0.5)).toBeLessThan(2 * SCHUTZKONFLIKT_HAEPPCHEN_MS);   // das Nachgeben selbst: das typische Häppchen
    const u = urteil(median(laeufe.map((l) => l.laengster)), 50, SCHUTZKONFLIKT_HAEPPCHEN_MS);
    if (u.warnung) console.warn(u.warnung);
    expect(u.ok, `Median der längsten Blöcke: ${median(laeufe.map((l) => l.laengster)).toFixed(1)} ms`).toBe(true);
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

describe("Review MITTEL 3: Reichweite — Vorindex, ein Jahr Schichtfolge, ausdrückliche Einteilungen ohne Grenze", () => {
  /* Jeden Tag Nachtdienst laut Schichtfolge; „keine Nacht“ → jeder Tag ein Konflikt, soweit gerechnet wird. */
  const mm = (abw) => ({ einheiten: [{ id: "e1", versatzTage: 0 }], dienstarten: [{ id: "N", start: "22:00", ende: "06:00" }, { id: "F", start: "06:00", ende: "14:00" }],
    zyklus: { tage: ["N"] }, anker: "2026-01-05", personen: [person("k", "e1", { einschraenkungen: { keineNacht: true } })], abweichungen: abw, einstellungen: {} });
  it("Schichtfolge: ein Jahr voraus (Tag 365 ja, Tag 366 nein), nicht nur 30 Tage", () => {
    const m = mm({});
    const k = schutzkonflikteSofort(m, plan(m));
    for (const n of [0, 29, 31, 200, 365]) expect(k.has(`k|${tag(n)}`), `Tag ${n}`).toBe(true);
    expect(k.has(`k|${tag(366)}`)).toBe(false);
  });
  it("ausdrückliche Einteilungen jenseits eines Jahres zählen (Vorindex), freie Tage nicht", () => {
    const m = mm({ [`k|${tag(400)}`]: "N", [`k|${tag(500)}`]: "N", [`k|${tag(450)}`]: "-", [`k|${tag(480)}`]: "F" });
    const k = schutzkonflikteSofort(m, plan(m));
    expect(k.has(`k|${tag(400)}`)).toBe(true);
    expect(k.has(`k|${tag(500)}`)).toBe(true);
    expect(k.has(`k|${tag(450)}`)).toBe(false);
    expect(k.has(`k|${tag(480)}`)).toBe(false);          // Frühdienst: kein Nachtdienst
  });
  it("ohne Vorindex ginge das verloren: der Test hängt an Einteilungen, die nur dort stehen", () => {
    const m = mm({ [`k|${tag(700)}`]: "N" });
    expect(schutzkonflikteSofort(m, plan(m)).has(`k|${tag(700)}`)).toBe(true);
    expect(schutzkonflikteSofort(m, { ...plan(m), tageVoraus: 30 }).has(`k|${tag(700)}`)).toBe(true);
    expect(schutzkonflikteSofort(m, { ...plan(m), tageVoraus: 30 }).has(`k|${tag(100)}`)).toBe(false);
  });
});

describe("Review MITTEL 3/4: Entprellung (250 ms) und Abbruch als Verhalten", () => {
  const m = { einheiten: [{ id: "e1" }], dienstarten: [{ id: "N", start: "22:00", ende: "06:00" }], zyklus: { tage: ["N"] }, anker: "2026-01-05",
    personen: [person("k", "e1", { einschraenkungen: { keineNacht: true } })], abweichungen: {}, einstellungen: {} };
  const mitUhr = (f) => { vi.useFakeTimers(); try { return f(); } finally { vi.useRealTimers(); } };
  it("rechnet erst nach 250 ms, nicht früher", () => mitUhr(() => {
    expect(SCHUTZKONFLIKT_ENTPRELLUNG_MS).toBe(250);
    const fertig = vi.fn();
    planeSchutzkonflikte(m, plan(m), fertig);
    vi.advanceTimersByTime(249);
    expect(fertig).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fertig).toHaveBeenCalledTimes(1);
    expect(fertig.mock.calls[0][0].has(`k|${tag(0)}`)).toBe(true);
  }));
  it("ein neuer Anlauf (Abbruch) innerhalb der Frist: der alte meldet nichts", () => mitUhr(() => {
    const alt = vi.fn(), neu = vi.fn();
    const stopp = planeSchutzkonflikte(m, plan(m), alt);
    vi.advanceTimersByTime(200);
    stopp();
    planeSchutzkonflikte(m, plan(m), neu);
    vi.advanceTimersByTime(1000);
    expect(alt).not.toHaveBeenCalled();
    expect(neu).toHaveBeenCalledTimes(1);
  }));
  it("ohne Verzögerung (erste Anzeige): gleich im nächsten Takt", () => mitUhr(() => {
    const fertig = vi.fn();
    planeSchutzkonflikte(m, plan(m), fertig, { verzoegerungMs: 0 });
    vi.advanceTimersByTime(0);
    expect(fertig).toHaveBeenCalledTimes(1);
  }));
});

describe("Review MITTEL 4 / Reste: der Haken useSchutzkonflikte als Verhalten (react-dom/server)", () => {
  const sitz = (rolle = "planer", id = "p1") => ({ mandant: { id: "m1", personen: [] }, person: { id, rolle } });
  const zeige = (s, aktiv = true) => {
    const Probe = () => {
      const r = useSchutzkonflikte(s, aktiv, () => ({}), () => HEUTE);
      return React.createElement("span", null, [...r.keys()].join(","));
    };
    return renderToString(React.createElement(Probe));
  };
  const ergebnis = (...keys) => new Map(keys.map((k) => [k, { person: { nachname: "N" }, datum: "2030-01-01" }]));
  beforeEach(() => vergissSchutzkonflikte());

  it("beginnt leer, wenn nichts bekannt ist", () => {
    expect(zeige(sitz())).toBe("<span></span>");
  });
  it("beginnt mit der letzten Rechnung dieser Sitzung — nichts verschwindet beim erneuten Zeigen", () => {
    merkeSchutzkonflikte(schutzkonfliktSchluessel(sitz()), ergebnis("a|2030-01-01", "b|2030-01-02"));
    expect(zeige(sitz())).toBe("<span>a|2030-01-01,b|2030-01-02</span>");
  });
  it("aktiv=false (Rollen ohne Bedarf): leer, auch wenn etwas gemerkt ist, und es wird nicht gerechnet", () => {
    merkeSchutzkonflikte(schutzkonfliktSchluessel(sitz()), ergebnis("a|2030-01-01"));
    expect(zeige(sitz(), false)).toBe("<span></span>");
  });
  it("das Gemerkte gehört zur Sitzung: andere Person oder Rolle bekommt es nie", () => {
    merkeSchutzkonflikte(schutzkonfliktSchluessel(sitz("planer", "p1")), ergebnis("a|2030-01-01"));
    expect(zeige(sitz("planer", "p2"))).toBe("<span></span>");
    expect(zeige(sitz("subplaner", "p1"))).toBe("<span></span>");
    expect(zeige(sitz("planer", "p1"))).toBe("<span>a|2030-01-01</span>");
  });
  it("Abmelden/Rollenwechsel leert das Gemerkte", () => {
    merkeSchutzkonflikte(schutzkonfliktSchluessel(sitz()), ergebnis("a|2030-01-01"));
    vergissSchutzkonflikte();
    expect(gemerkteSchutzkonflikte(schutzkonfliktSchluessel(sitz()))).toBeNull();
    expect(zeige(sitz())).toBe("<span></span>");
  });
  it("Abmelden (abmeldenMitHinweis, WP-07): leert das Gemerkte; bei Abbruch der Rückfrage bleibt alles", async () => {
    const PUF = await import("../src/stempelpuffer.js");
    const { abmeldenMitHinweis } = await import("../src/App.jsx");
    const schl = schutzkonfliktSchluessel(sitz());
    const altWindow = globalThis.window;
    let neu = 0, frage = 0, antwort = false;
    globalThis.window = { confirm: () => { frage++; return antwort; }, location: { reload: () => { neu++; } },
      addEventListener: () => {}, removeEventListener: () => {} };
    try {
      PUF.vorlaeufigeSetzen([{ id: "x", zustand: "wartet" }]);
      merkeSchutzkonflikte(schl, ergebnis("a|2030-01-01"));
      abmeldenMitHinweis();                                          // Rückfrage abgelehnt
      expect([frage, neu]).toEqual([1, 0]);
      expect(gemerkteSchutzkonflikte(schl)).not.toBeNull();
      antwort = true;
      abmeldenMitHinweis();
      expect([frage, neu]).toEqual([2, 1]);
      expect(gemerkteSchutzkonflikte(schl)).toBeNull();
    } finally {
      PUF.vorlaeufigeSetzen([]);
      globalThis.window = altWindow;
    }
  }, 60000);                                                       // App.jsx kalt zu laden dauert
  it("Verdrahtung: Abmelden leert, die Startseite rechnet nur für Planung und Leitung, der Monatsplan immer", () => {
    const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
    /* Seit WP-07 laufen alle Abmeldewege über abmeldenMitHinweis (Rückfrage bei wartenden Stempeln);
       dort wird vor SP.abmelden() geleert — Verhalten geprüft im nächsten Fall. */
    expect(app).toContain("abmelden: abmeldenMitHinweis,");
    expect(app).toContain("verbindungTrennen: abmeldenMitHinweis,");
    expect(app).toMatch(/function abmeldenMitHinweis\(\) \{[\s\S]*?vergissSchutzkonflikte\(\);\s*SP\.abmelden\(\);/);
    expect(app).not.toMatch(/onClick=\{\(\) => \{ SP\.abmelden\(\);/);
    expect(app).toContain('useSchutzkonflikte(sitz, darf(sitz, "pattern.edit") || darf(sitz, "org.edit"))');
    expect(app).toMatch(/const schutzkonflikte = useSchutzkonflikte\(sitz\);\s*\n\s*const leute = useMemo/);
  });
});

describe("Review NIEDRIG 5: Empfänger der Mitteilung = Rollen mit pattern.edit/org.edit (ohne Betriebsrat, Beschäftigte)", () => {
  it("Rollen der Rechtetabelle mit pattern.edit oder org.edit sind Leitung, Planung und der eigene Datenraum", () => {
    const mit = Object.keys(MATRIX).filter((r) => darf(r, "pattern.edit") || darf(r, "org.edit")).sort();
    expect(mit).toEqual(["kunde", "leitung", "planer"]);
  });
  it("die Mitteilung geht an Leitung und Planung, an niemanden sonst", () => {
    const rollen = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat", "kunde"];
    const altM = { personen: [person("a", "e1"), ...rollen.map((r) => ({ id: `r-${r}`, rolle: r, vorname: "V", nachname: r }))] };
    const neu = schutzKonfliktMitteilungen(altM, { ...altM, nachrichten: [] }, [{ personId: "a", datum: "2027-01-05", dienstId: "N" }], "x");
    expect(neu.nachrichten.map((n) => n.personId).sort()).toEqual(["r-leitung", "r-planer"]);
  });
});

describe("Mitteilung mit Jahr", () => {
  it("TT.MM.JJJJ", () => {
    const altM = { personen: [person("a", "e1"), { id: "l", rolle: "leitung", vorname: "L", nachname: "L" }] };
    const neu = schutzKonfliktMitteilungen(altM, { ...altM, nachrichten: [] }, [{ personId: "a", datum: "2027-01-05", dienstId: "N" }], "x");
    expect(neu.nachrichten[0].text).toContain("05.01.2027");
  });
});

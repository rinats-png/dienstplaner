/* ==========================================================================
   RB-2 — KRANKMELDUNG IN ZWEI STUFEN

   Betreiberentscheidung 2026-11-11: Die Schichtverantwortung darf eingehende
   Krankmeldungen entgegennehmen und vorläufig bestätigen. Die endgültige
   Bestätigung erfolgt ausschließlich durch Planung oder Leitung. Eine
   vorläufige Bestätigung löst keinen endgültigen Status aus. Beide Schritte
   werden protokolliert; die Rechte prüft der Server (Positiv- und
   Negativtests).

   Geprüft (synthetische Daten):
   A  Kern (server/lib/krankmeldung.mjs): Rechte je Rolle und Schritt,
      Bereich und Tag der Schichtverantwortung, vier Augen, Wiederholung.
   B  Vorläufig ist nie endgültig: Plan (personTag), Ersatzsuche (Lücke),
      Ist/Konto (istTag, stundenkonto), Kalender (feedTermine) — und kein
      anderer Leser im Quelltext kennt die Fälle.
   C  PUT /api/bestand (zusammenführen): ältere Oberflächen von Beschäftigten
      und Schichtverantwortung erzeugen nur einen eingegangenen Fall; das Feld
      `krankmeldungen` ist für jede Rolle wirkungslos (manipulierter Rumpf).
   D  Sicht: Schichtverantwortung nur Bereich ohne Anmerkung, Betriebsrat und
      Betreiber nichts, Beschäftigte nur eigene.
   E  HTTP POST /api/krankmeldung: der früher abgewiesene Ablauf (B17,
      Schichtverantwortung meldet sich an einem Tag mit Dienst krank), alle
      Rollen, Wiederholung, Gleichzeitigkeit, Protokoll.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KRANK_STATUS, krankSchrittErlaubt, krankmeldungMelden, krankmeldungBestaetigen, svZustaendig, fallEndgueltig,
  krankProtokollZeilen, krankmeldungSchritt } from "../server/lib/krankmeldung.mjs";
import { vorschau, raeumen, berichtstext } from "../server/lib/aufbewahrung.mjs";
import { zusammenfuehren, bestandFuerRolle } from "../server/lib/rechte.mjs";
import { personTag, istTag, stundenkonto } from "../server/lib/engine/plan.mjs";
import { feedTermine } from "../server/lib/kalenderfeed.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { krankSchritteFuer, KrankmeldungenOffen } from "../src/ansichten/krankmeldungen-offen.jsx";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEUTE = heuteBerlin();
const T = (n) => tagePlus(HEUTE, n);
const WECHSEL = T(5);           // s3 wechselt an diesem Tag von e1 nach e2

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const betrieb = (extra = {}) => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB1" }, { id: "e2", name: "WB2" }, { id: "pool", pool: true }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  personen: [person("a1", "mitarbeiter", "e1"), person("a2", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
    person("s1", "subplaner", "e1"), person("s2", "subplaner", "e2"),
    person("s3", "subplaner", "e1", { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }, { ab: WECHSEL, einheitId: "e2" }] }),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
  abweichungen: { [`s1|${T(2)}`]: "F", [`a1|${T(2)}`]: "F", [`a1|${T(3)}`]: "F" },
  abwesenheiten: [], krankmeldungen: [], anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {}, einstellungen: {},
  ...extra });
const bestand = (m = betrieb()) => ({ version: 9, stand: 1, mandanten: [m] });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const AK = (personId, rolle) => ({ personId, rolle });
const JETZT = new Date();
const melde = (m, ak, angabe, id = "km-t1") => krankmeldungMelden(m, ak, angabe, JETZT, id);
const ok = (r) => { expect(r.grund, r.grund).toBeUndefined(); return r; };

/* =============================== A  Kern =============================== */
describe("A  Rechte je Rolle und Schritt (Server-Kern)", () => {
  it("melden: Beschäftigte, Schichtverantwortung, Planung, Leitung (und die Kundenrolle); nie Betriebsrat, Betreiber", () => {
    for (const r of ["mitarbeiter", "subplaner", "planer", "leitung", "kunde"]) expect(krankSchrittErlaubt(r, "melden"), r).toBe(true);
    for (const r of ["betriebsrat", "betreiber", undefined, "", "gast"]) expect(krankSchrittErlaubt(r, "melden"), String(r)).toBe(false);
  });
  it("vorläufig: nur die Schichtverantwortung", () => {
    expect(krankSchrittErlaubt("subplaner", "vorlaeufig")).toBe(true);
    for (const r of ["mitarbeiter", "planer", "leitung", "kunde", "betriebsrat", "betreiber"]) expect(krankSchrittErlaubt(r, "vorlaeufig"), r).toBe(false);
  });
  it("endgültig und ablehnen: nur Planung und Leitung; nie die Schichtverantwortung, nie die Kundenrolle (RB-3)", () => {
    for (const s of ["endgueltig", "ablehnen"]) {
      for (const r of ["planer", "leitung"]) expect(krankSchrittErlaubt(r, s), `${r} ${s}`).toBe(true);
      for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde"]) expect(krankSchrittErlaubt(r, s), `${r} ${s}`).toBe(false);
    }
  });

  it("Beschäftigte melden die eigene Krankheit, keine fremde", () => {
    const r = ok(melde(betrieb(), AK("a1", "mitarbeiter"), { von: T(2), bis: T(3), notiz: "synthetisch" }));
    expect(r.fall).toMatchObject({ personId: "a1", status: KRANK_STATUS.EINGEGANGEN, notiz: "synthetisch" });
    expect(r.fall.verlauf).toEqual([{ schritt: "eingegangen", von: "a1", rolle: "mitarbeiter", zeit: JETZT.toISOString() }]);
    expect(r.mandant.abwesenheiten).toEqual([]);
    expect(melde(betrieb(), AK("a1", "mitarbeiter"), { personId: "a2", von: T(2), bis: T(2) }).status).toBe(403);
  });
  it("Schichtverantwortung nimmt für sich und ihren Bereich entgegen, nicht für fremde Bereiche", () => {
    ok(melde(betrieb(), AK("s1", "subplaner"), { von: T(2), bis: T(2) }));
    const r = ok(melde(betrieb(), AK("s1", "subplaner"), { personId: "a1", von: T(2), bis: T(3) }));
    expect(r.fall.verlauf[0]).toMatchObject({ von: "s1", rolle: "subplaner", funktion: "Schichtverantwortung" });
    expect(melde(betrieb(), AK("s1", "subplaner"), { personId: "b1", von: T(2), bis: T(2) }).status).toBe(403);
  });
  it("Schichtverantwortung außerhalb ihres Bereichs am Tag (Zugehörigkeit gewechselt): nein", () => {
    const m = betrieb();
    const s3 = m.personen.find((p) => p.id === "s3");
    expect(svZustaendig(m, s3, "a1", T(1), T(2))).toBe(true);
    expect(svZustaendig(m, s3, "a1", T(4), WECHSEL)).toBe(false);                // am Wechseltag gehört sie zu e2
    expect(melde(m, AK("s3", "subplaner"), { personId: "a1", von: T(4), bis: WECHSEL }).status).toBe(403);
    expect(svZustaendig(m, s3, "a1", "kein-tag", T(2))).toBe(false);
  });
  it("Betriebsrat und Betreiber: 403; ungültige Angaben: 400", () => {
    expect(melde(betrieb(), AK("r1", "betriebsrat"), { von: T(2), bis: T(2) }).status).toBe(403);
    expect(melde(betrieb(), AK(null, "betreiber"), { von: T(2), bis: T(2) }).status).toBe(403);
    expect(melde(betrieb(), AK("a1", "mitarbeiter"), { von: T(3), bis: T(2) }).status).toBe(400);
    expect(melde(betrieb(), AK("a1", "mitarbeiter"), { von: "2026-02-30", bis: "2026-02-30" }).status).toBe(400);
    expect(melde(betrieb(), AK("a1", "mitarbeiter"), { von: T(2), bis: T(2), notiz: "x".repeat(301) }).status).toBe(400);
  });

  describe("bestätigen", () => {
    const mitFall = (personId = "a1", von = T(2), bis = T(3)) => ok(melde(betrieb(), AK(personId, "mitarbeiter"), { von, bis }, "km-a")).mandant;
    it("Schichtverantwortung des Bereichs bestätigt vorläufig — kein endgültiger Status, keine Abwesenheit", () => {
      const r = ok(krankmeldungBestaetigen(mitFall(), AK("s1", "subplaner"), "vorlaeufig", "km-a", JETZT));
      expect(r.fall.status).toBe(KRANK_STATUS.VORLAEUFIG);
      expect(fallEndgueltig(r.fall)).toBe(false);
      expect(r.mandant.abwesenheiten).toEqual([]);
      expect(r.fall.verlauf.map((v) => v.schritt)).toEqual(["eingegangen", "vorlaeufig"]);
      expect(r.fall.verlauf[1]).toMatchObject({ von: "s1", rolle: "subplaner", funktion: "Schichtverantwortung" });
    });
    it("Schichtverantwortung kann nicht endgültig bestätigen (auch nicht nach ihrer vorläufigen Bestätigung)", () => {
      const v = ok(krankmeldungBestaetigen(mitFall(), AK("s1", "subplaner"), "vorlaeufig", "km-a", JETZT)).mandant;
      for (const m of [mitFall(), v]) {
        const r = krankmeldungBestaetigen(m, AK("s1", "subplaner"), "endgueltig", "km-a", JETZT);
        expect(r.status).toBe(403);
      }
    });
    /* Review L2: außerhalb ihres Bereichs dieselbe Antwort wie für einen unbekannten Fall (keine Existenzauskunft). */
    it("fremde Schichtverantwortung (anderer Bereich) und eine außerhalb ihres Bereichs am Tag: abgewiesen wie unbekannt (404)", () => {
      const unbekannt = krankmeldungBestaetigen(mitFall(), AK("s2", "subplaner"), "vorlaeufig", "km-gibtsnicht", JETZT);
      for (const r of [krankmeldungBestaetigen(mitFall(), AK("s2", "subplaner"), "vorlaeufig", "km-a", JETZT),
        krankmeldungBestaetigen(mitFall("a1", T(4), WECHSEL), AK("s3", "subplaner"), "vorlaeufig", "km-a", JETZT)]) {
        expect(r).toEqual(unbekannt);
        expect(r.status).toBe(404);
        expect(r.mandant).toBeUndefined();
      }
    });
    for (const [pid, rolle] of [["a2", "mitarbeiter"], ["r1", "betriebsrat"], [null, "betreiber"]]) {
      it(`${rolle}: weder vorläufig noch endgültig`, () => {
        expect(krankmeldungBestaetigen(mitFall(), AK(pid, rolle), "vorlaeufig", "km-a", JETZT).status).toBe(403);
        expect(krankmeldungBestaetigen(mitFall(), AK(pid, rolle), "endgueltig", "km-a", JETZT).status).toBe(403);
      });
    }
    for (const [pid, rolle] of [["p1", "planer"], ["l1", "leitung"]]) {
      it(`${rolle}: bestätigt endgültig (aus „eingegangen“ und aus „vorläufig“) — erst jetzt die wirksame Abwesenheit`, () => {
        const v = ok(krankmeldungBestaetigen(mitFall(), AK("s1", "subplaner"), "vorlaeufig", "km-a", JETZT)).mandant;
        for (const m of [mitFall(), v]) {
          const r = ok(krankmeldungBestaetigen(m, AK(pid, rolle), "endgueltig", "km-a", JETZT));
          expect(r.fall.status).toBe(KRANK_STATUS.ENDGUELTIG);
          expect(r.mandant.abwesenheiten).toEqual([{ id: "a-km-a", personId: "a1", art: "krank", von: T(2), bis: T(3), notiz: "" }]);
          expect(r.fall.verlauf.at(-1)).toMatchObject({ schritt: "endgueltig", von: pid, rolle });
        }
        expect(krankmeldungBestaetigen(mitFall(), AK(pid, rolle), "vorlaeufig", "km-a", JETZT).status).toBe(403);
      });
    }
    it("Wiederholung und doppelter Schritt: 409, nichts doppelt", () => {
      const v = ok(krankmeldungBestaetigen(mitFall(), AK("s1", "subplaner"), "vorlaeufig", "km-a", JETZT)).mandant;
      expect(krankmeldungBestaetigen(v, AK("s1", "subplaner"), "vorlaeufig", "km-a", JETZT).status).toBe(409);
      const e = ok(krankmeldungBestaetigen(v, AK("p1", "planer"), "endgueltig", "km-a", JETZT)).mandant;
      expect(krankmeldungBestaetigen(e, AK("l1", "leitung"), "endgueltig", "km-a", JETZT).status).toBe(409);
      expect(krankmeldungBestaetigen(e, AK("s1", "subplaner"), "vorlaeufig", "km-a", JETZT).status).toBe(409);
      expect(e.abwesenheiten).toHaveLength(1);
    });
    it("vier Augen: die eigene Krankmeldung bestätigt niemand selbst", () => {
      const m = ok(melde(betrieb(), AK("s1", "subplaner"), { von: T(2), bis: T(2) }, "km-s")).mandant;
      expect(krankmeldungBestaetigen(m, AK("s1", "subplaner"), "vorlaeufig", "km-s", JETZT)).toMatchObject({ status: 403, code: "VIER_AUGEN" });
      const mp = ok(melde(betrieb(), AK("p1", "planer"), { von: T(2), bis: T(2) }, "km-p")).mandant;
      expect(krankmeldungBestaetigen(mp, AK("p1", "planer"), "endgueltig", "km-p", JETZT)).toMatchObject({ status: 403, code: "VIER_AUGEN" });
    });
    it("unbekannte, fehlende oder ungültige Kennung: 404/400", () => {
      expect(krankmeldungBestaetigen(mitFall(), AK("p1", "planer"), "endgueltig", "km-x", JETZT).status).toBe(404);
      for (const id of [undefined, "", "../x", 7, { id: "km-a" }]) expect(krankmeldungBestaetigen(mitFall(), AK("p1", "planer"), "endgueltig", id, JETZT).status).toBe(400);
    });
    it("fail-closed: nur genau „endgueltig_bestaetigt“ ist endgültig", () => {
      for (const s of [undefined, null, "", "eingegangen", "vorlaeufig_bestaetigt", "ENDGUELTIG_BESTAETIGT", "endgueltig", "bestaetigt"])
        expect(fallEndgueltig({ status: s }), String(s)).toBe(false);
      expect(fallEndgueltig({ status: "endgueltig_bestaetigt" })).toBe(true);
    });
  });
});

/* ===================== B  Vorläufig ist nie endgültig ===================== */
describe("B  Kein Leser zählt einen nicht endgültigen Fall", () => {
  const faelle = (status) => betrieb({ krankmeldungen: [{ id: "km-v", personId: "a1", von: T(2), bis: T(3), status,
    verlauf: [] }] });
  const a1 = (m) => m.personen.find((p) => p.id === "a1");
  for (const status of [KRANK_STATUS.EINGEGANGEN, KRANK_STATUS.VORLAEUFIG, KRANK_STATUS.ENDGUELTIG, "unbekannt"]) {
    it(`Fall „${status}“ allein (ohne Abwesenheit): Plan, Ersatzsuche, Ist, Konto und Kalender unverändert`, () => {
      const m = faelle(status), ohne = betrieb();
      const t = personTag(m, a1(m), T(2));
      expect(t.abwesenheit).toBeNull();
      expect(t.dienstId).toBe("F");                    // keine Lücke → keine Ersatzsuche
      expect(istTag(m, a1(m), T(2))).toEqual(istTag(ohne, a1(ohne), T(2)));
      expect(stundenkonto(m, a1(m), T(2).slice(0, 7))).toBe(stundenkonto(ohne, a1(ohne), T(2).slice(0, 7)));
      expect(JSON.stringify(feedTermine(m, "a1", HEUTE, 10))).toBe(JSON.stringify(feedTermine(ohne, "a1", HEUTE, 10)));
    });
  }
  it("erst die endgültige Bestätigung (Abwesenheit) wirkt: abwesend, keine Einteilung", () => {
    const m = ok(krankmeldungBestaetigen(faelle(KRANK_STATUS.VORLAEUFIG), AK("p1", "planer"), "endgueltig", "km-v", JETZT)).mandant;
    const t = personTag(m, a1(m), T(2));
    expect(t.abwesenheit).toBeTruthy();
    expect(t.dienstId).toBeNull();
  });
  it("Quelltext: außer den Wegen der Krankmeldung liest keine Datei `krankmeldungen` (Plan, Lohn, Auswertungen, Kalender, Statistik)", async () => {
    const erlaubt = new Set(["server/lib/krankmeldung.mjs", "server/lib/rechte.mjs", "server/lib/sicht.mjs", "server/lib/auskunft.mjs",
      "server/lib/aufbewahrung.mjs", "server/funktionen/daten.mjs", "src/ansichten/krankmeldungen-offen.jsx", "src/app/aktionen/plan.js",
      "src/lib/fachlogik.js", "src/ansichten/krankmeldung.jsx", "src/speicher.js",
      /* RB-5: leitet die Markierung „Besetzung klärungsbedürftig“ aus offenen Fällen ab — schreibt nichts, zählt
         keinen Fall als Abwesenheit (pruefungen/rb5-klaerung.test.js). */
      "server/lib/klaerung.mjs"]);
    const treffer = [];
    const lauf = async (dir) => {
      for (const e of await readdir(path.join(WURZEL, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== "node_modules") await lauf(rel); continue; }
        if (!/\.(mjs|js|jsx)$/.test(e.name)) continue;
        /* Das Feld, nicht der Dateiname der Ansicht (./krankmeldungen-offen.jsx). */
        if (/(?<![w/-])krankmeldungen(?![w-])/.test(await readFile(path.join(WURZEL, rel), "utf8")) && !erlaubt.has(rel)) treffer.push(rel);
      }
    };
    await lauf("server"); await lauf("src");
    expect(treffer).toEqual([]);
  });
  it("Tagesaufgabe in fachlogik.js zählt nur offene Fälle, nie als Abwesenheit", async () => {
    const q = await readFile(path.join(WURZEL, "src/lib/fachlogik.js"), "utf8");
    const stellen = q.split("\n").filter((z) => z.includes("krankmeldungen"));
    expect(stellen).toHaveLength(1);
    expect(stellen[0]).toMatch(/\(m\.krankmeldungen \|\| \[\]\)\.filter/);
  });
});

/* ===================== C  PUT /api/bestand (zusammenführen) ===================== */
describe("C  Speichern über PUT: ältere Oberflächen und manipulierte Rümpfe", () => {
  const S = (rolle, person) => ({ rolle, person, betrieb: 0, mandantId: "m1" });
  const schreibe = (sitz, aendere, m = betrieb()) => {
    const alt = bestand(m), neu = kopie(alt);
    aendere(neu.mandanten[0]);
    const e = zusammenfuehren(alt, neu, sitz);
    return { e, m: e && !e.verweigert ? e.mandanten[0] : null };
  };
  it("Beschäftigte (alte Oberfläche): eigene Krank-Abwesenheit wird ein eingegangener Fall, keine Abwesenheit", () => {
    const { m } = schreibe(S("mitarbeiter", "a1"), (mm) => mm.abwesenheiten.push({ id: "k1", personId: "a1", art: "krank", von: T(2), bis: T(2), notiz: "n" }));
    expect(m.abwesenheiten).toEqual([]);
    expect(m.krankmeldungen).toHaveLength(1);
    expect(m.krankmeldungen[0]).toMatchObject({ id: "km-k1", personId: "a1", status: KRANK_STATUS.EINGEGANGEN, notiz: "n" });
  });
  it("Beschäftigte: Wiederholung desselben Eintrags legt keinen zweiten Fall an", () => {
    const erst = schreibe(S("mitarbeiter", "a1"), (mm) => mm.abwesenheiten.push({ id: "k1", personId: "a1", art: "krank", von: T(2), bis: T(2) })).m;
    const zweit = schreibe(S("mitarbeiter", "a1"), (mm) => mm.abwesenheiten.push({ id: "k1", personId: "a1", art: "krank", von: T(2), bis: T(2) }), erst).m;
    expect(zweit.krankmeldungen).toHaveLength(1);
  });
  it("Schichtverantwortung (alte Oberfläche): eigene und Bereich → eingegangen; fremder Bereich → abgewiesen", () => {
    const { m } = schreibe(S("subplaner", "s1"), (mm) => {
      mm.abwesenheiten.push({ id: "ks", personId: "s1", art: "krank", von: T(2), bis: T(2) });
      mm.abwesenheiten.push({ id: "ka", personId: "a1", art: "krank", von: T(2), bis: T(3) });
    });
    expect(m.abwesenheiten).toEqual([]);
    expect(m.krankmeldungen.map((f) => [f.id, f.status]).sort()).toEqual([["km-ka", KRANK_STATUS.EINGEGANGEN], ["km-ks", KRANK_STATUS.EINGEGANGEN]]);
    const f = schreibe(S("subplaner", "s1"), (mm) => mm.abwesenheiten.push({ id: "kb", personId: "b1", art: "krank", von: T(2), bis: T(2) }));
    expect(f.e && f.e.verweigert).toBeTruthy();
  });
  const MANIP = [
    ["Fall auf endgültig gesetzt", (mm) => { mm.krankmeldungen[0].status = KRANK_STATUS.ENDGUELTIG; }],
    ["Fall auf vorläufig gesetzt", (mm) => { mm.krankmeldungen[0].status = KRANK_STATUS.VORLAEUFIG; }],
    ["Fall gelöscht", (mm) => { mm.krankmeldungen = []; }],
    ["fremder Fall erfunden", (mm) => { mm.krankmeldungen.push({ id: "km-neu", personId: "a2", von: T(2), bis: T(2), status: KRANK_STATUS.ENDGUELTIG }); }],
    ["Verlauf gefälscht", (mm) => { mm.krankmeldungen[0].verlauf.push({ schritt: "endgueltig", von: "l1", rolle: "leitung" }); }],
  ];
  for (const [sitzName, sitz] of [["Beschäftigte", S("mitarbeiter", "a1")], ["Schichtverantwortung", S("subplaner", "s1")],
    ["Planung", S("planer", "p1")], ["Leitung", S("leitung", "l1")], ["Betreiber", { rolle: "betreiber", person: null }]]) {
    it(`${sitzName}: das Feld krankmeldungen ist über PUT wirkungslos`, () => {
      const start = betrieb({ krankmeldungen: [{ id: "km-a", personId: "a1", von: T(2), bis: T(3), status: KRANK_STATUS.EINGEGANGEN,
        verlauf: [{ schritt: "eingegangen", von: "a1", rolle: "mitarbeiter", zeit: "t" }] }] });
      for (const [name, aendere] of MANIP) {
        const { e, m } = schreibe(sitz, aendere, start);
        const ergebnis = m || start;
        expect(ergebnis.krankmeldungen, `${sitzName}: ${name}`).toEqual(start.krankmeldungen);
        if (e && !e.verweigert) expect(ergebnis.abwesenheiten, name).toEqual([]);
      }
    });
  }
  it("Betriebsrat schreibt gar nicht", () => {
    expect(schreibe(S("betriebsrat", "r1"), (mm) => mm.abwesenheiten.push({ id: "kr", personId: "r1", art: "krank", von: T(2), bis: T(2) })).e).toBeNull();
  });
  it("Planung und Leitung tragen wie bisher unmittelbar ein — das ist die endgültige Bestätigung, protokolliert", () => {
    const alt = bestand(), neu = kopie(alt);
    neu.mandanten[0].abwesenheiten.push({ id: "kp", personId: "a1", art: "krank", von: T(2), bis: T(2), notiz: "" });
    const e = zusammenfuehren(alt, neu, S("planer", "p1"));
    expect(e.mandanten[0].abwesenheiten.map((a) => a.id)).toEqual(["kp"]);
    expect(krankProtokollZeilen(alt, e, "planer")).toEqual(["Krankmeldung kp: endgültig (unmittelbar eingetragen) · Rolle planer"]);
  });
  it("Protokollzeilen der PUT-Wege enthalten weder Person, Tag noch Anmerkung", () => {
    const alt = bestand(), neu = kopie(alt);
    neu.mandanten[0].abwesenheiten.push({ id: "k9", personId: "a1", art: "krank", von: T(2), bis: T(2), notiz: "NOTIZ-GEHEIM" });
    const e = zusammenfuehren(alt, neu, S("mitarbeiter", "a1"));
    const z = krankProtokollZeilen(alt, e, "mitarbeiter");
    expect(z).toEqual(["Krankmeldung km-k9: eingegangen · Rolle mitarbeiter"]);
    expect(JSON.stringify(z)).not.toMatch(/a1|NOTIZ|\d{4}-\d{2}-\d{2}/);
  });
});

/* ===================== D  Sicht ===================== */
describe("D  Sicht auf die Fälle (Gesundheitsangaben)", () => {
  const roh = () => bestand(betrieb({ krankmeldungen: [
    { id: "km-a1", personId: "a1", von: T(2), bis: T(3), notiz: "NOTIZ-A1", status: KRANK_STATUS.EINGEGANGEN, verlauf: [{ schritt: "eingegangen", von: "a1", rolle: "mitarbeiter", zeit: "t" }] },
    { id: "km-b1", personId: "b1", von: T(2), bis: T(2), notiz: "NOTIZ-B1", status: KRANK_STATUS.VORLAEUFIG, verlauf: [] }] }));
  const sicht = (sitz) => (bestandFuerRolle(roh(), sitz).mandanten[0] || {}).krankmeldungen;
  it("Schichtverantwortung: nur ihr Bereich, ohne Anmerkung und Verlauf", () => {
    expect(sicht({ rolle: "subplaner", person: "s1", betrieb: 0 })).toEqual([{ id: "km-a1", personId: "a1", von: T(2), bis: T(3), status: KRANK_STATUS.EINGEGANGEN }]);
  });
  it("Beschäftigte: nur die eigene, mit Anmerkung, ohne Verlauf; Kollegin sieht nichts", () => {
    /* gemeldetVonMir: abgeleitet (Review M1, „Zurückziehen“), nie gespeichert. */
    expect(sicht({ rolle: "mitarbeiter", person: "a1", betrieb: 0 })).toEqual([{ id: "km-a1", personId: "a1", von: T(2), bis: T(3), notiz: "NOTIZ-A1", status: KRANK_STATUS.EINGEGANGEN, gemeldetVonMir: true }]);
    expect(sicht({ rolle: "mitarbeiter", person: "a2", betrieb: 0 })).toEqual([]);
  });
  it("Betriebsrat und Betreiber: nichts", () => {
    expect(sicht({ rolle: "betriebsrat", person: "r1", betrieb: 0 }) || []).toEqual([]);
    expect(JSON.stringify(bestandFuerRolle(roh(), { rolle: "betreiber", person: null }))).not.toMatch(/NOTIZ-|km-a1/);
  });
  it("Planung und Leitung: alles", () => {
    for (const s of [{ rolle: "planer", person: "p1", betrieb: 0 }, { rolle: "leitung", person: "l1", betrieb: 0 }])
      expect(sicht(s)).toEqual(roh().mandanten[0].krankmeldungen);
  });
});

/* ===================== Oberfläche: angebotene Schritte ===================== */
describe("Oberfläche spiegelt den Server", () => {
  const M = betrieb();
  const sitz = (pid, rolle) => ({ rolle, mandant: M, person: M.personen.find((p) => p.id === pid) || { id: pid, rolle } });
  const fall = (status, personId = "a1", von = T(2), bis = T(2)) => ({ id: "km", personId, status, von, bis });
  it("Schichtverantwortung: nur „vorläufig“ und nur aus „eingegangen“; nie die eigene", () => {
    expect(krankSchritteFuer(sitz("s1", "subplaner"), fall(KRANK_STATUS.EINGEGANGEN))).toEqual(["vorlaeufig"]);
    expect(krankSchritteFuer(sitz("s1", "subplaner"), fall(KRANK_STATUS.VORLAEUFIG))).toEqual([]);
    expect(krankSchritteFuer(sitz("s1", "subplaner"), fall(KRANK_STATUS.EINGEGANGEN, "s1"))).toEqual([]);
  });
  it("Planung und Leitung: „endgültig“ aus beiden offenen Stufen; Beschäftigte, Betriebsrat, Betreiber: nichts", () => {
    for (const r of ["planer", "leitung"]) {
      expect(krankSchritteFuer(sitz("x", r), fall(KRANK_STATUS.EINGEGANGEN))).toEqual(["endgueltig", "ablehnen"]);
      expect(krankSchritteFuer(sitz("x", r), fall(KRANK_STATUS.VORLAEUFIG))).toEqual(["endgueltig", "ablehnen"]);
      expect(krankSchritteFuer(sitz("x", r), fall(KRANK_STATUS.ENDGUELTIG))).toEqual([]);
    }
    for (const r of ["mitarbeiter", "betriebsrat", "betreiber"]) expect(krankSchritteFuer(sitz("x", r), fall(KRANK_STATUS.EINGEGANGEN)), r).toEqual([]);
  });
});

describe("Oberfläche: Darstellung „vorläufig“ / „endgültig“ und angebotener Schritt", () => {
  const m = betrieb({ krankmeldungen: [
    { id: "km-1", personId: "a1", von: T(2), bis: T(2), status: KRANK_STATUS.EINGEGANGEN },
    { id: "km-2", personId: "a2", von: T(2), bis: T(3), status: KRANK_STATUS.VORLAEUFIG },
    { id: "km-3", personId: "a2", von: T(1), bis: T(1), status: KRANK_STATUS.ENDGUELTIG }] });
  const zeige = (pid, rolle) => renderToStaticMarkup(h(KrankmeldungenOffen, { sitz: { rolle, mandant: m,
    person: m.personen.find((p) => p.id === pid) }, akt: { krankBestaetigen: async () => true } }));
  it("Status als Text, endgültig bestätigte Fälle nicht mehr in der Liste", () => {
    const html = zeige("p1", "planer");
    expect(html).toContain("Eingegangen");
    expect(html).toContain("Vorläufig bestätigt");
    expect(html).not.toContain("Endgültig bestätigt<");
    expect(html).toContain("noch nicht wirksam");
  });
  it("Planung/Leitung: nur „Endgültig bestätigen“; Schichtverantwortung: nur „Vorläufig bestätigen“; Beschäftigte: keiner", () => {
    for (const [pid, r] of [["p1", "planer"], ["l1", "leitung"]]) {
      const html = zeige(pid, r);
      expect((html.match(/>Endgültig bestätigen</g) || []).length, r).toBe(2);
      expect(html, r).not.toContain(">Vorläufig bestätigen<");
    }
    const sv = zeige("s1", "subplaner");
    expect((sv.match(/>Vorläufig bestätigen</g) || []).length).toBe(1);
    expect(sv).not.toContain(">Endgültig bestätigen<");
    const ma = zeige("a1", "mitarbeiter");
    expect(ma).not.toMatch(/>(Vorläufig|Endgültig) bestätigen</);
  });
  it("Schaltflächen sind echte Buttons mit Namen (Tastatur, Bildschirmleser)", () => {
    const html = zeige("p1", "planer");
    expect(html).toMatch(/<button type="button"[^>]*aria-label="Krankmeldung von Va1 Na1 endgültig bestätigen"/);
    expect(html).toContain("class=\"btn btn-primary");
    expect(html).not.toContain("btn-sm");
  });
});

/* ===================== E  HTTP POST /api/krankmeldung ===================== */
describe("E  HTTP: POST /api/krankmeldung", () => {
  const WIRT = "127.0.0.1:3000", R = "rb2-raum";
  let wurzel, laden, daten, sitzungAnlegen, B, nr = 0;
  const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.72.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  };
  const tok = async (pid, rolle) => (await sitzungAnlegen({ bestand: R, name: pid, rolle, person: pid, betrieb: 0, mandantId: "m1", einheit: null },
    60 * 60 * 1000)).token;
  const km = async (pid, rolle, rumpf) => anfrage("/api/krankmeldung", { methode: "POST", token: await tok(pid, rolle), rumpf });
  const gespeichert = async () => (await B.bestandLesen(laden(), R)).bestand.mandanten[0];
  const zuruecksetzen = () => B.bestandSchreiben(laden(), R, bestand(), { durch: "Pruefung" });
  const spurZeilen = async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const spur = getStore({ name: "centric-spur" });
    const aus = [];
    for (const b of (await spur.list({})).blobs) aus.push(await spur.get(b.key, { type: "json" }));
    return aus.filter((z) => z && typeof z.zusatz === "string" && z.zusatz.startsWith("Krankmeldung"));
  };

  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-rb2-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    daten = (await import("../server/funktionen/daten.mjs")).default;
    ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
    B = await import("../server/lib/bestand.mjs");
  }, 60000);
  afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

  it("B17: die Schichtverantwortung meldet sich an einem Tag mit eigenem Dienst krank — 200, eingegangen, Plan unverändert", async () => {
    await zuruecksetzen();
    const r = await km("s1", "subplaner", { aktion: "melden", von: T(2), bis: T(2) });
    expect(r.status, JSON.stringify(r)).toBe(200);
    expect(r.fall.status).toBe(KRANK_STATUS.EINGEGANGEN);
    const m = await gespeichert();
    expect(m.krankmeldungen).toHaveLength(1);
    expect(m.abwesenheiten).toEqual([]);
    expect(m.abweichungen[`s1|${T(2)}`]).toBe("F");
    expect(JSON.stringify(r)).not.toMatch(/notiz/);
  });
  it("vollständiger Ablauf: Beschäftigte meldet, Schichtverantwortung bestätigt vorläufig, Planung endgültig — protokolliert", async () => {
    await zuruecksetzen();
    const vorher = (await spurZeilen()).length;
    const g = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(3), notiz: "NOTIZ-SYNTH" });
    expect(g.status).toBe(200);
    const id = g.fall.id;
    const v = await km("s1", "subplaner", { aktion: "vorlaeufig", id });
    expect(v.status, JSON.stringify(v)).toBe(200);
    expect(v.fall.status).toBe(KRANK_STATUS.VORLAEUFIG);
    expect((await gespeichert()).abwesenheiten).toEqual([]);                     // vorläufig: keine Wirkung
    const e = await km("p1", "planer", { aktion: "endgueltig", id });
    expect(e.status, JSON.stringify(e)).toBe(200);
    const m = await gespeichert();
    expect(m.abwesenheiten).toEqual([{ id: `a-${id}`, personId: "a1", art: "krank", von: T(2), bis: T(3), notiz: "NOTIZ-SYNTH" }]);
    expect(m.krankmeldungen[0].verlauf.map((x) => [x.schritt, x.von, x.rolle])).toEqual([
      ["eingegangen", "a1", "mitarbeiter"], ["vorlaeufig", "s1", "subplaner"], ["endgueltig", "p1", "planer"]]);
    const z = (await spurZeilen()).slice(vorher);
    const text = z.map((x) => `${x.zusatz}|${x.rolle}|${x.person}`);
    expect(text).toEqual(expect.arrayContaining([
      `Krankmeldung ${id}: eingegangen · Rolle mitarbeiter|mitarbeiter|a1`,
      `Krankmeldung ${id}: vorlaeufig_bestaetigt · Rolle subplaner (Schichtverantwortung)|subplaner|s1`,
      `Krankmeldung ${id}: endgueltig_bestaetigt · Rolle planer|planer|p1`]));
    for (const x of z) expect(JSON.stringify(x)).not.toMatch(/NOTIZ-SYNTH/);
  });
  it("Negativ: SV nicht endgültig, fremde SV nicht vorläufig, Beschäftigte/Betriebsrat/Betreiber keinen Schritt — mit manipuliertem Rumpf", async () => {
    await zuruecksetzen();
    const id = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) })).fall.id;
    expect((await km("s1", "subplaner", { aktion: "endgueltig", id, status: "endgueltig_bestaetigt", rolle: "leitung" })).status).toBe(403);
    expect((await km("s2", "subplaner", { aktion: "vorlaeufig", id })).status).toBe(404);     // Review L2: wie unbekannt
    for (const [pid, rolle] of [["a2", "mitarbeiter"], ["r1", "betriebsrat"]])
      for (const aktion of ["vorlaeufig", "endgueltig"]) expect((await km(pid, rolle, { aktion, id, personId: "p1" })).status, `${rolle} ${aktion}`).toBe(403);
    expect((await km("r1", "betriebsrat", { aktion: "melden", von: T(2), bis: T(2) })).status).toBe(403);
    expect((await km("a1", "mitarbeiter", { aktion: "melden", personId: "a2", von: T(2), bis: T(2) })).status).toBe(403);
    expect((await km("a1", "mitarbeiter", { aktion: "bestaetigen", id })).status).toBe(400);
    const m = await gespeichert();
    expect(m.krankmeldungen[0].status).toBe(KRANK_STATUS.EINGEGANGEN);
    expect(m.abwesenheiten).toEqual([]);
  });
  it("Betreiber: 403", async () => {
    await zuruecksetzen();
    const t = (await sitzungAnlegen({ bestand: R, name: "bt", rolle: "betreiber", person: null, betrieb: 0 }, 60 * 60 * 1000)).token;
    const r = await anfrage("/api/krankmeldung", { methode: "POST", token: t, rumpf: { aktion: "endgueltig", id: "km-x" } });
    expect([401, 403]).toContain(r.status);
  });
  it("Wiederholung: zweite endgültige Bestätigung 409, eine Abwesenheit", async () => {
    await zuruecksetzen();
    const id = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) })).fall.id;
    expect((await km("l1", "leitung", { aktion: "endgueltig", id })).status).toBe(200);
    expect((await km("p1", "planer", { aktion: "endgueltig", id })).status).toBe(409);
    expect((await km("s1", "subplaner", { aktion: "vorlaeufig", id })).status).toBe(409);
    expect((await gespeichert()).abwesenheiten).toHaveLength(1);
  });
  it("Gleichzeitigkeit: zwei gleichzeitige endgültige Bestätigungen — genau eine gelingt", async () => {
    await zuruecksetzen();
    const id = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) })).fall.id;
    const [tp, tl] = [await tok("p1", "planer"), await tok("l1", "leitung")];
    const erg = await Promise.all([tp, tl].map((token) => anfrage("/api/krankmeldung", { methode: "POST", token, rumpf: { aktion: "endgueltig", id } })));
    expect(erg.map((x) => x.status).sort()).toEqual([200, 409]);
    const m = await gespeichert();
    expect(m.abwesenheiten).toHaveLength(1);
    expect(m.krankmeldungen[0].verlauf.filter((x) => x.schritt === "endgueltig")).toHaveLength(1);
  });
  it("PUT mit gefälschtem Status ändert nichts (Schichtverantwortung über den Handler)", async () => {
    await zuruecksetzen();
    const id = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) })).fall.id;
    const t = await tok("s1", "subplaner");
    const g = await anfrage("/api/bestand", { token: t });
    const b = kopie(g.bestand);
    b.mandanten[0].krankmeldungen = b.mandanten[0].krankmeldungen.map((f) => ({ ...f, status: KRANK_STATUS.ENDGUELTIG }));
    b.mandanten[0].abwesenheiten = [...(b.mandanten[0].abwesenheiten || []), { id: `a-${id}`, personId: "a1", art: "krank", von: T(2), bis: T(2) }];
    await anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    const m = await gespeichert();
    expect(m.krankmeldungen.find((f) => f.id === id).status).toBe(KRANK_STATUS.EINGEGANGEN);
    expect(m.abwesenheiten.filter((a) => a.id === `a-${id}`)).toEqual([]);
  });
  /* ---- Nachtrag Review RB-2 über den Handler ---- */
  it("M1: Planung lehnt ab, Beschäftigte zieht zurück — Endzustände, keine Abwesenheit, protokolliert ohne Anmerkung", async () => {
    await zuruecksetzen();
    const vorher = (await spurZeilen()).length;
    const id1 = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2), notiz: "NOTIZ-GEHEIM" })).fall.id;
    const ab = await km("p1", "planer", { aktion: "ablehnen", id: id1, grund: "irrtum" });
    expect(ab.status, JSON.stringify(ab)).toBe(200);
    expect(ab.fall.status).toBe(KRANK_STATUS.ABGELEHNT);
    const id2 = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(3), bis: T(3) })).fall.id;
    const zu = await km("a1", "mitarbeiter", { aktion: "zurueckziehen", id: id2 });
    expect(zu.status, JSON.stringify(zu)).toBe(200);
    expect(zu.fall.status).toBe(KRANK_STATUS.ZURUECKGEZOGEN);
    const m = await gespeichert();
    expect(m.abwesenheiten).toEqual([]);
    for (const [id, aktion, pid, rolle] of [[id1, "endgueltig", "l1", "leitung"], [id1, "ablehnen", "l1", "leitung"],
      [id2, "zurueckziehen", "a1", "mitarbeiter"], [id2, "vorlaeufig", "s1", "subplaner"]])
      expect((await km(pid, rolle, { aktion, id })).status, `${aktion} aus Endzustand`).toBe(409);
    const z = (await spurZeilen()).slice(vorher).map((x) => `${x.zusatz}|${x.rolle}|${x.person}`);
    expect(z).toEqual(expect.arrayContaining([`Krankmeldung ${id1}: abgelehnt · Rolle planer|planer|p1`,
      `Krankmeldung ${id2}: zurueckgezogen · Rolle mitarbeiter|mitarbeiter|a1`]));
    expect(JSON.stringify(await spurZeilen())).not.toMatch(/NOTIZ-GEHEIM|Diagnose/);
  });
  it("M1: manipulierte Rümpfe — SV lehnt nicht ab, Freitext-Grund nicht, fremde Person zieht nicht zurück", async () => {
    await zuruecksetzen();
    const id = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) })).fall.id;
    expect((await km("s1", "subplaner", { aktion: "ablehnen", id, rolle: "leitung" })).status).toBe(403);
    expect((await km("p1", "planer", { aktion: "ablehnen", id, grund: "Diagnose J11" })).status).toBe(400);
    expect((await km("a2", "mitarbeiter", { aktion: "zurueckziehen", id, personId: "a1" })).status).toBe(404);
    expect((await km("r1", "betriebsrat", { aktion: "zurueckziehen", id })).status).toBe(403);
    expect((await gespeichert()).krankmeldungen[0].status).toBe(KRANK_STATUS.EINGEGANGEN);
    expect(JSON.stringify(await spurZeilen())).not.toContain("J11");
  });
  it("L1: dieselbe Meldung zweimal (Netzwiederholung) ergibt einen Fall", async () => {
    await zuruecksetzen();
    const a = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2), clientEventId: "ev-http-1" });
    const b = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2), clientEventId: "ev-http-1" });
    expect([a.status, b.status, b.wiederholt, b.fall.id]).toEqual([200, 200, true, a.fall.id]);
    const c = await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) });
    expect(c.fall.id).toBe(a.fall.id);
    expect((await gespeichert()).krankmeldungen).toHaveLength(1);
  });
  it("L2: ohne Zugang zum Fall dieselbe Antwort wie für einen unbekannten Fall", async () => {
    await zuruecksetzen();
    const id = (await km("a1", "mitarbeiter", { aktion: "melden", von: T(2), bis: T(2) })).fall.id;
    const ohne = (x) => ({ status: x.status, fehler: x.fehler, code: x.code });
    const fremd = ohne(await km("s2", "subplaner", { aktion: "vorlaeufig", id }));
    const unbekannt = ohne(await km("s2", "subplaner", { aktion: "vorlaeufig", id: "km-gibtsnicht" }));
    expect(fremd).toEqual(unbekannt);
    expect(ohne(await km("a2", "mitarbeiter", { aktion: "zurueckziehen", id })))
      .toEqual(ohne(await km("a2", "mitarbeiter", { aktion: "zurueckziehen", id: "km-gibtsnicht" })));
  });
});

/* ==========================================================================
   NACHTRAG REVIEW RB-2 (M1, M2, L1, L2, L3)
   ========================================================================== */
describe("M1  Ablehnen und Zurückziehen: Endzustände ohne Wirkung", () => {
  const offen = (status = KRANK_STATUS.EINGEGANGEN, melder = ["a1", "mitarbeiter"], person = "a1") => betrieb({ krankmeldungen: [{
    id: "km-r", personId: person, von: T(2), bis: T(3), notiz: "NOTIZ-R", status,
    verlauf: [{ schritt: "eingegangen", von: melder[0], rolle: melder[1], zeit: "t" }] }] });
  const schritt = (m, pid, rolle, s, extra = {}) => krankmeldungSchritt(m, AK(pid, rolle), s, { id: "km-r", ...extra }, JETZT);

  for (const [pid, rolle] of [["p1", "planer"], ["l1", "leitung"]]) {
    it(`${rolle} lehnt ab (aus „eingegangen“ und „vorläufig“), ohne oder mit festem Kennzeichen — keine Abwesenheit`, () => {
      for (const st of [KRANK_STATUS.EINGEGANGEN, KRANK_STATUS.VORLAEUFIG]) {
        const r = ok(schritt(offen(st), pid, rolle, "ablehnen"));
        expect(r.fall.status).toBe(KRANK_STATUS.ABGELEHNT);
        expect(r.mandant.abwesenheiten).toEqual([]);
        expect(r.fall.verlauf.at(-1)).toMatchObject({ schritt: "ablehnen", von: pid, rolle });
        const g = ok(schritt(offen(st), pid, rolle, "ablehnen", { grund: "doppelt" }));
        expect(g.fall.verlauf.at(-1).grund).toBe("doppelt");
      }
    });
  }
  it("Ablehnen: Freitext statt Kennzeichen wird abgewiesen (keine Gesundheitsangabe im Verlauf)", () => {
    for (const grund of ["Diagnose J11", "", 7, { x: 1 }, ["doppelt"]])
      expect(schritt(offen(), "p1", "planer", "ablehnen", { grund }).status, JSON.stringify(grund)).toBe(400);
  });
  it("Ablehnen: Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber nie; die eigene Meldung nie", () => {
    for (const [pid, rolle] of [["s1", "subplaner"], ["a2", "mitarbeiter"], ["r1", "betriebsrat"], [null, "betreiber"]])
      expect(schritt(offen(), pid, rolle, "ablehnen").status, rolle).toBe(403);
    expect(schritt(offen(KRANK_STATUS.EINGEGANGEN, ["p1", "planer"], "p1"), "p1", "planer", "ablehnen"))
      .toMatchObject({ status: 403, code: "VIER_AUGEN" });
  });
  it("Zurückziehen: nur die meldende Person, solange offen — auch die Schichtverantwortung für ihre Meldung", () => {
    const r = ok(schritt(offen(), "a1", "mitarbeiter", "zurueckziehen"));
    expect(r.fall.status).toBe(KRANK_STATUS.ZURUECKGEZOGEN);
    expect(r.mandant.abwesenheiten).toEqual([]);
    expect(ok(schritt(offen(KRANK_STATUS.VORLAEUFIG, ["s1", "subplaner"]), "s1", "subplaner", "zurueckziehen")).fall.status)
      .toBe(KRANK_STATUS.ZURUECKGEZOGEN);
    for (const [pid, rolle] of [["a2", "mitarbeiter"], ["p1", "planer"], ["l1", "leitung"], ["s1", "subplaner"]])
      expect(schritt(offen(), pid, rolle, "zurueckziehen").status, rolle).toBe(404);
    for (const [pid, rolle] of [["r1", "betriebsrat"], [null, "betreiber"]])
      expect(schritt(offen(), pid, rolle, "zurueckziehen").status, rolle).toBe(403);
  });
  it("kein Übergang aus einem Endzustand (409), für jede berechtigte Rolle und jeden Schritt", () => {
    for (const st of [KRANK_STATUS.ENDGUELTIG, KRANK_STATUS.ABGELEHNT, KRANK_STATUS.ZURUECKGEZOGEN, "unbekannt"]) {
      const m = offen(st);
      for (const [pid, rolle, s] of [["s1", "subplaner", "vorlaeufig"], ["p1", "planer", "endgueltig"], ["l1", "leitung", "ablehnen"],
        ["a1", "mitarbeiter", "zurueckziehen"]]) {
        const r = schritt(m, pid, rolle, s);
        expect(r.status, `${st} ${s}`).toBe(409);
        expect(r.mandant, `${st} ${s}`).toBeUndefined();
      }
    }
  });
  it("abgelehnt und zurückgezogen wirken nirgends (Plan, Ersatzsuche)", () => {
    for (const st of [KRANK_STATUS.ABGELEHNT, KRANK_STATUS.ZURUECKGEZOGEN]) {
      const m = offen(st);
      const t = personTag(m, m.personen.find((p) => p.id === "a1"), T(2));
      expect(t.abwesenheit).toBeNull();
      expect(t.dienstId).toBe("F");
    }
  });
});

describe("L1  Wiederholung und Überschneidung", () => {
  it("dieselbe clientEventId liefert denselben Fall, nichts Neues", () => {
    const erst = ok(melde(betrieb(), AK("a1", "mitarbeiter"), { von: T(2), bis: T(2), clientEventId: "ev-1" }, "km-1"));
    const zweit = ok(melde(erst.mandant, AK("a1", "mitarbeiter"), { von: T(2), bis: T(2), clientEventId: "ev-1" }, "km-2"));
    expect(zweit.wiederholt).toBe(true);
    expect(zweit.fall.id).toBe("km-1");
    expect(zweit.mandant.krankmeldungen).toHaveLength(1);
    expect(melde(betrieb(), AK("a1", "mitarbeiter"), { von: T(2), bis: T(2), clientEventId: "x y" }).status).toBe(400);
  });
  it("ohne Kennung: derselbe offene Zeitraum derselben meldenden Person ist dieselbe Meldung; nach Zurückziehen eine neue", () => {
    const erst = ok(melde(betrieb(), AK("a1", "mitarbeiter"), { von: T(2), bis: T(3) }, "km-1"));
    const zweit = ok(melde(erst.mandant, AK("a1", "mitarbeiter"), { von: T(2), bis: T(3) }, "km-2"));
    expect([zweit.wiederholt, zweit.fall.id, zweit.mandant.krankmeldungen.length]).toEqual([true, "km-1", 1]);
    const weg = ok(krankmeldungSchritt(erst.mandant, AK("a1", "mitarbeiter"), "zurueckziehen", { id: "km-1" }, JETZT));
    const neu = ok(melde(weg.mandant, AK("a1", "mitarbeiter"), { von: T(2), bis: T(3) }, "km-3"));
    expect([neu.wiederholt, neu.fall.id, neu.mandant.krankmeldungen.length]).toEqual([undefined, "km-3", 2]);
  });
  it("endgültig bei gleicher bestehender Krankheit: zusammengeführt, keine zweite Abwesenheit", () => {
    const m = ok(melde(betrieb({ abwesenheiten: [{ id: "alt", personId: "a1", art: "krank", von: T(2), bis: T(2), notiz: "" }] }),
      AK("a1", "mitarbeiter"), { von: T(2), bis: T(2) }, "km-z")).mandant;
    const r = ok(krankmeldungBestaetigen(m, AK("p1", "planer"), "endgueltig", "km-z", JETZT));
    expect(r.zusammengefuehrt).toBe(true);
    expect(r.mandant.abwesenheiten.map((a) => a.id)).toEqual(["alt"]);
    expect(r.fall).toMatchObject({ status: KRANK_STATUS.ENDGUELTIG, abwesenheitId: "alt" });
  });
  it("endgültig bei anderer überschneidender Abwesenheit: 409 UEBERSCHNEIDUNG, Fall bleibt offen, nichts angelegt", () => {
    for (const vorhanden of [{ art: "urlaub", von: T(2), bis: T(2) }, { art: "krank", von: T(1), bis: T(3) }]) {
      const m = ok(melde(betrieb({ abwesenheiten: [{ id: "alt", personId: "a1", ...vorhanden }] }),
        AK("a1", "mitarbeiter"), { von: T(2), bis: T(2) }, "km-u")).mandant;
      const r = krankmeldungBestaetigen(m, AK("p1", "planer"), "endgueltig", "km-u", JETZT);
      expect(r).toMatchObject({ status: 409, code: "UEBERSCHNEIDUNG" });
      expect(r.mandant).toBeUndefined();
    }
  });
});

describe("L3  Schaltfläche der Schichtverantwortung = Serverregel", () => {
  it("Fall im Bereich laut Sicht (ein Tag), aber Serverregel (erster und letzter Tag) nicht erfüllt: keine Schaltfläche", () => {
    const m = betrieb({ krankmeldungen: [{ id: "km-w", personId: "a1", von: T(4), bis: WECHSEL, status: KRANK_STATUS.EINGEGANGEN,
      verlauf: [{ schritt: "eingegangen", von: "a1", rolle: "mitarbeiter", zeit: "t" }] }] });
    const gesehen = bestandFuerRolle(bestand(m), { rolle: "subplaner", person: "s3", betrieb: 0 }).mandanten[0].krankmeldungen;
    expect(gesehen.map((f) => f.id)).toEqual(["km-w"]);                               // die Sicht zeigt ihn
    const sitz = { rolle: "subplaner", mandant: m, person: m.personen.find((p) => p.id === "s3") };
    expect(krankSchritteFuer(sitz, gesehen[0])).toEqual([]);                          // aber keine Schaltfläche
    expect(krankmeldungBestaetigen(m, AK("s3", "subplaner"), "vorlaeufig", "km-w", JETZT).status).toBe(404);
    const s1 = { rolle: "subplaner", mandant: m, person: m.personen.find((p) => p.id === "s1") };
    expect(krankSchritteFuer(s1, gesehen[0])).toEqual(["vorlaeufig"]);
    expect(ok(krankmeldungBestaetigen(m, AK("s1", "subplaner"), "vorlaeufig", "km-w", JETZT)).fall.status).toBe(KRANK_STATUS.VORLAEUFIG);
  });
  it("Oberfläche: Zurückziehen nur am selbst gemeldeten Fall, nie Bestätigen/Ablehnen am eigenen", () => {
    const m = betrieb();
    const p = (id) => m.personen.find((x) => x.id === id);
    const f = { id: "km", personId: "a1", von: T(2), bis: T(2), status: KRANK_STATUS.EINGEGANGEN, gemeldetVonMir: true };
    expect(krankSchritteFuer({ rolle: "mitarbeiter", mandant: m, person: p("a1") }, f)).toEqual(["zurueckziehen"]);
    const pf = { id: "km", personId: "p1", von: T(2), bis: T(2), status: KRANK_STATUS.EINGEGANGEN, verlauf: [{ schritt: "eingegangen", von: "p1" }] };
    expect(krankSchritteFuer({ rolle: "planer", mandant: m, person: p("p1") }, pf)).toEqual(["zurueckziehen"]);
    const fremd = { ...f, gemeldetVonMir: undefined, verlauf: [{ schritt: "eingegangen", von: "a1" }] };
    expect(krankSchritteFuer({ rolle: "mitarbeiter", mandant: m, person: p("a2") }, fremd)).toEqual([]);
  });
});

describe("M2  Aufbewahrung: Fälle in Vorschau und Löschlauf", () => {
  const HEUTE_ISO = "2026-11-11";
  const alt = (id, status, notiz = "NOTIZ-ALT") => ({ id, personId: "a1", von: "2026-01-05", bis: "2026-01-06", notiz, status, verlauf: [] });
  const m = () => betrieb({ abweichungen: {}, krankmeldungen: [
    alt("km-e", KRANK_STATUS.EINGEGANGEN), alt("km-v", KRANK_STATUS.VORLAEUFIG), alt("km-a", KRANK_STATUS.ABGELEHNT),
    alt("km-z", KRANK_STATUS.ZURUECKGEZOGEN), alt("km-f", KRANK_STATUS.ENDGUELTIG), alt("km-f2", KRANK_STATUS.ENDGUELTIG, ""),
    { id: "km-neu", personId: "a1", von: "2026-11-01", bis: "2026-11-02", notiz: "NOTIZ-NEU", status: KRANK_STATUS.EINGEGANGEN, verlauf: [] }] });
  it("die Vorschau zählt die Fälle — ein Betrieb mit nur solchen Fällen wird nicht übersprungen", () => {
    const v = vorschau(m(), HEUTE_ISO);
    expect(v.krankmeldungen).toBe(5);              // 4 nicht wirksame entfernen, 1 Anmerkung leeren
    expect(v.gesamt).toBeGreaterThanOrEqual(5);
    expect(berichtstext(v)).toMatch(/5 Krankmeldungsfälle bereinigt/);
  });
  it("der Löschlauf entfernt nicht wirksame Fälle nach der Frist und leert die Anmerkung wirksamer; junge bleiben", () => {
    const { mandant } = raeumen(m(), HEUTE_ISO);
    expect(mandant.krankmeldungen.map((f) => f.id)).toEqual(["km-f", "km-f2", "km-neu"]);
    expect(mandant.krankmeldungen[0]).toMatchObject({ notiz: "", grundGeloescht: HEUTE_ISO, status: KRANK_STATUS.ENDGUELTIG });
    expect(mandant.krankmeldungen[2].notiz).toBe("NOTIZ-NEU");
    expect(JSON.stringify(mandant)).not.toContain("NOTIZ-ALT");
  });
});

describe("L2  Bremse vor dem Protokoll", () => {
  it("im Endpunkt steht die Bremse vor jedem Protokolleintrag", async () => {
    const q = await readFile(path.join(WURZEL, "server/funktionen/daten.mjs"), "utf8");
    const anfang = q.indexOf('if (pfad === "krankmeldung"');
    const block = q.slice(anfang, q.indexOf("Monatsabschluss (WP-16)", anfang));
    expect(block.indexOf('bremse("schreiben"')).toBeGreaterThan(0);
    expect(block.indexOf('bremse("schreiben"')).toBeLessThan(block.indexOf("protokoll("));
  });
});

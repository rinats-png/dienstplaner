/* ==========================================================================
   RB-5 — KLÄRUNGSBEDÜRFTIGE BESETZUNG UND VORBEREITETER ERSATZ

   Betreiberentscheidung 2026-11-11: „Bis zur endgültigen Bestätigung bleibt
   der veröffentlichte Dienstplan unverändert. Intern wird die betroffene
   Schicht als klärungsbedürftig markiert. CENTRIC darf mögliche
   Unterbesetzung und Ersatzvorschläge vorbereiten, aber keine eigenmächtige
   Umbesetzung auslösen."

   Geprüft (synthetische Daten, server/lib/klaerung.mjs, rechte.mjs
   bestandFuerAntwort, GET /api/bestand):
   A  Plan unverändert für alle: Sicht der Beschäftigten, Kalender, Ist,
      Konto, Lohnsätze — mit offenem Fall wie ohne.
   B  Markierung nur für Planung, Leitung und die zuständige
      Schichtverantwortung; nie Beschäftigte, Betriebsrat, Betreiber, fremder
      Bereich; ohne Gesundheitsangabe; endet bei endgültig, abgelehnt,
      zurückgezogen.
   C  PUT: eine mitgeschickte Markierung legt nichts an und entfernt nichts.
   D  Ersatz vorbereiten: gerechnet, nichts geschrieben (vorher = nachher),
      keine Nachricht, Plan unverändert, ohne Gesundheitsangabe; die Fakten
      der Engine kennen keine offenen Fälle.
   E  HTTP GET /api/bestand über den echten Lesepfad.
   F  Oberfläche: Markierung und Vorschlag nur für die erlaubten Rollen.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KRANK_STATUS, krankmeldungSchritt } from "../server/lib/krankmeldung.mjs";
import { klaerungsMarker, ersatzVorbereiten, KLAERUNG_HINWEIS, VORSCHLAG_HINWEIS, KLAERUNG_FAELLE_MAX, KLAERUNG_TAGE_MAX,
  ERSATZ_SCHICHTEN_MAX } from "../server/lib/klaerung.mjs";
import { zusammenfuehren, bestandFuerRolle, bestandFuerAntwort } from "../server/lib/rechte.mjs";
import { personTag, istTag, stundenkonto, besetzung } from "../server/lib/engine/plan.mjs";
import { ersatzKandidaten } from "../server/lib/engine/ersatzfakten.mjs";
import { feedTermine } from "../server/lib/kalenderfeed.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";
import { KrankmeldungenOffen, ErsatzVorbereitet, klaerungFuer, klaerungAm, ersatzVorbereitbar } from "../src/ansichten/krankmeldungen-offen.jsx";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEUTE = heuteBerlin();
const T = (n) => tagePlus(HEUTE, n);
const WECHSEL = T(5);
const NOTIZ = "NOTIZ-SYNTH-Grippe";

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const betrieb = (extra = {}) => ({ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB1" }, { id: "e2", name: "WB2" }, { id: "pool", pool: true }],
  dienstarten: [{ id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", mindest: { mo_do: 2, fr: 2, sa: 2, so: 2 } }],
  qualifikationen: [],
  personen: [person("a1", "mitarbeiter", "e1"), person("a2", "mitarbeiter", "e1"), person("a3", "mitarbeiter", "e1"),
    person("b1", "mitarbeiter", "e2"), person("s1", "subplaner", "e1"), person("s2", "subplaner", "e2"),
    person("s3", "subplaner", "e1", { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }, { ab: WECHSEL, einheitId: "e2" }] }),
    person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE"), person("k1", "leitung", "ALLE"), person("r1", "betriebsrat", "ALLE")],
  abweichungen: { [`a1|${T(2)}`]: "F", [`a1|${T(3)}`]: "F", [`a2|${T(2)}`]: "F", [`a2|${T(3)}`]: "F",
    [`a1|${T(6)}`]: "F" },
  abwesenheiten: [], krankmeldungen: [], anfragen: [], nachrichten: [], erfassung: {}, einstempeln: {}, einspruenge: [],
  einstellungen: { maxFolge: 6 }, ...extra });
const fall = (id, personId, von, bis, status = KRANK_STATUS.EINGEGANGEN, melder = personId) => ({ id, personId, von, bis, status, notiz: NOTIZ,
  verlauf: [{ schritt: "eingegangen", von: melder, rolle: "mitarbeiter", zeit: "2026-11-11T08:00:00.000Z" }] });
const mitFall = (status = KRANK_STATUS.EINGEGANGEN) => betrieb({ krankmeldungen: [fall("km-a1", "a1", T(2), T(3), status)] });
const bestand = (m = betrieb()) => ({ version: 9, stand: 1, mandanten: [m] });
const kopie = (x) => JSON.parse(JSON.stringify(x));
const S = (rolle, person) => ({ rolle, person, betrieb: 0, mandantId: "m1" });
const SITZ = { PL: S("planer", "p1"), LT: S("leitung", "l1"), KU: S("kunde", "k1"), SV: S("subplaner", "s1"), SV2: S("subplaner", "s2"),
  SV3: S("subplaner", "s3"), MA: S("mitarbeiter", "a1"), MA2: S("mitarbeiter", "a2"), BR: S("betriebsrat", "r1"), BT: { rolle: "betreiber", person: null, betrieb: 0 } };
const antwort = (m, sitz) => bestandFuerAntwort(bestand(m), sitz);
const markerVon = (m, sitz) => { const a = antwort(m, sitz); return a && a.mandanten ? a.mandanten[0].klaerung : undefined; };
const ERWARTET = [
  { fallId: "km-a1", personId: "a1", datum: T(2), dienstId: "F", hinweis: KLAERUNG_HINWEIS },
  { fallId: "km-a1", personId: "a1", datum: T(3), dienstId: "F", hinweis: KLAERUNG_HINWEIS }];
const GESUNDHEIT = /krank|grippe|notiz|NOTIZ|verlauf|status|eingegangen|vorlaeufig/i;

/* ================== A  Der veröffentlichte Plan bleibt unverändert ================== */
describe("A  Offener Fall: der veröffentlichte Plan bleibt für alle unverändert", () => {
  it("Sicht der Beschäftigten (Kollegin): mit offenem Fall exakt wie ohne — keine Markierung, kein Fall", () => {
    expect(antwort(mitFall(), SITZ.MA2)).toEqual(antwort(betrieb(), SITZ.MA2));
  });
  it("Sicht der gemeldeten Person: nur der eigene Fall kommt hinzu — Plan, Abwesenheiten, Abweichungen unverändert, keine Markierung", () => {
    const mit = antwort(mitFall(), SITZ.MA).mandanten[0], ohne = antwort(betrieb(), SITZ.MA).mandanten[0];
    const { krankmeldungen: k1, ...restMit } = mit;
    const { krankmeldungen: k0, ...restOhne } = ohne;
    expect(restMit).toEqual(restOhne);
    expect(k0).toEqual([]);
    expect(k1).toHaveLength(1);
    expect(mit).not.toHaveProperty("klaerung");
  });
  it("Betriebsrat und Betreiber: mit offenem Fall exakt wie ohne", () => {
    expect(antwort(mitFall(), SITZ.BR)).toEqual(antwort(betrieb(), SITZ.BR));
    expect(antwort(mitFall(), SITZ.BT)).toEqual(antwort(betrieb(), SITZ.BT));
  });
  it("Plan, Ist, Konto und Kalender rechnen mit der Sicht von Planung (samt Markierung) wie ohne Fall", () => {
    const mit = antwort(mitFall(), SITZ.PL).mandanten[0], ohne = antwort(betrieb(), SITZ.PL).mandanten[0];
    expect(mit.klaerung).toEqual(ERWARTET);
    for (const pid of ["a1", "a2", "a3"]) {
      const pm = mit.personen.find((p) => p.id === pid), po = ohne.personen.find((p) => p.id === pid);
      for (const d of [T(1), T(2), T(3), T(4)]) {
        expect(personTag(mit, pm, d), `${pid} ${d}`).toEqual(personTag(ohne, po, d));
        expect(istTag(mit, pm, d)).toEqual(istTag(ohne, po, d));
      }
      expect(stundenkonto(mit, pm, T(2).slice(0, 7))).toBe(stundenkonto(ohne, po, T(2).slice(0, 7)));
      expect(JSON.stringify(feedTermine(mit, pid, HEUTE, 14))).toBe(JSON.stringify(feedTermine(ohne, pid, HEUTE, 14)));
    }
    expect(besetzung(mit, T(2)).F.anzahl).toBe(besetzung(ohne, T(2)).F.anzahl);
  });
  it("Lohnsätze (DATEV) und Lohnstand: mit Fall wie ohne", async () => {
    const { datevSaetze, lohnexportStand } = await import("../src/lib/fachlogik.js");
    const mit = antwort(mitFall(), SITZ.PL).mandanten[0], ohne = antwort(betrieb(), SITZ.PL).mandanten[0];
    const ym = T(2).slice(0, 7);
    expect(JSON.stringify(datevSaetze(mit, ym))).toBe(JSON.stringify(datevSaetze(ohne, ym)));
    expect(JSON.stringify(lohnexportStand(mit, ym))).toBe(JSON.stringify(lohnexportStand(ohne, ym)));
  });
  it("Quelltext: Kalenderfeed, Planfreigabe, Lohn und Ist lesen die Markierung nicht", async () => {
    for (const f of ["server/lib/kalenderfeed.mjs", "server/lib/planfreigabe.mjs", "server/lib/lohnrechnung.mjs", "server/lib/istdaten.mjs",
      "server/lib/isteinfrieren.mjs", "server/lib/engine/plan.mjs"])
      expect(await readFile(path.join(WURZEL, f), "utf8"), f).not.toMatch(/klaerung|krankmeldungen/);
  });
});

/* ================== B  Markierung: wer, was, wie lange ================== */
describe("B  Markierung „Besetzung klärungsbedürftig“", () => {
  it("Planung, Leitung: die Dienste der Person im gemeldeten Zeitraum (nur Tage mit Dienst)", () => {
    for (const k of ["PL", "LT"]) expect(markerVon(mitFall(), SITZ[k]), k).toEqual(ERWARTET);
  });
  it("auch vorläufig bestätigt: markiert", () => {
    expect(markerVon(mitFall(KRANK_STATUS.VORLAEUFIG), SITZ.PL)).toEqual(ERWARTET);
    expect(markerVon(mitFall(KRANK_STATUS.VORLAEUFIG), SITZ.SV)).toEqual(ERWARTET);
  });
  it("zuständige Schichtverantwortung (eigener Bereich am ersten und letzten Tag): ja", () => {
    expect(markerVon(mitFall(), SITZ.SV)).toEqual(ERWARTET);
  });
  it("Schichtverantwortung eines fremden Bereichs: nichts; außerhalb ihres Bereichs am letzten Tag (Wechsel): nichts", () => {
    expect(markerVon(mitFall(), SITZ.SV2)).toEqual([]);
    const m = betrieb({ krankmeldungen: [fall("km-w", "a1", T(4), WECHSEL)], abweichungen: { [`a1|${T(4)}`]: "F", [`a1|${WECHSEL}`]: "F" } });
    expect(markerVon(m, SITZ.SV3)).toEqual([]);
    expect(markerVon(m, SITZ.PL).map((x) => x.datum)).toEqual([T(4), WECHSEL]);
  });
  it("eigener Fall der Schichtverantwortung: für sie selbst nicht, für Planung ja", () => {
    const m = betrieb({ krankmeldungen: [fall("km-s1", "s1", T(2), T(2))] });
    m.abweichungen[`s1|${T(2)}`] = "F";
    expect(markerVon(m, SITZ.SV)).toEqual([]);
    expect(markerVon(m, SITZ.PL)).toEqual([{ fallId: "km-s1", personId: "s1", datum: T(2), dienstId: "F", hinweis: KLAERUNG_HINWEIS }]);
  });
  it("Beschäftigte (auch die gemeldete Person), Betriebsrat, Betreiber, Kundenrolle: kein Feld, nirgends", () => {
    for (const k of ["MA", "MA2", "BR", "BT", "KU"]) {
      const a = antwort(mitFall(), SITZ[k]);
      expect(JSON.stringify(a), k).not.toMatch(/klaerung|klärungsbedürftig/);
    }
  });
  it("ohne Gesundheitsangabe: keine Anmerkung, kein Status, kein Verlauf, kein „krank“", () => {
    for (const k of ["PL", "LT", "SV"]) {
      const j = JSON.stringify(markerVon(mitFall(), SITZ[k]));
      expect(j, k).not.toMatch(GESUNDHEIT);
    }
    expect(KLAERUNG_HINWEIS).toBe("Besetzung klärungsbedürftig");
  });
  for (const [schritt, rolle, pid, status] of [["endgueltig", "planer", "p1", KRANK_STATUS.ENDGUELTIG],
    ["ablehnen", "leitung", "l1", KRANK_STATUS.ABGELEHNT], ["zurueckziehen", "mitarbeiter", "a1", KRANK_STATUS.ZURUECKGEZOGEN]]) {
    it(`endet von selbst: ${status}`, () => {
      const r = krankmeldungSchritt(mitFall(), { personId: pid, rolle }, schritt, { id: "km-a1" }, new Date());
      expect(r.grund, r.grund).toBeUndefined();
      expect(r.fall.status).toBe(status);
      for (const k of ["PL", "LT", "SV"]) expect(markerVon(r.mandant, SITZ[k]), `${status} ${k}`).toEqual([]);
    });
  }
  it("unbekannter Status zählt nicht (fail-closed)", () => {
    expect(markerVon(mitFall("irgendwas"), SITZ.PL)).toEqual([]);
  });
  it("begrenzt: höchstens KLAERUNG_FAELLE_MAX Fälle und KLAERUNG_TAGE_MAX Tage je Fall", () => {
    const viele = Array.from({ length: KLAERUNG_FAELLE_MAX + 20 }, (_, i) => fall(`km-${i}`, "a1", T(2), T(2)));
    expect(klaerungsMarker(betrieb(), viele)).toHaveLength(KLAERUNG_FAELLE_MAX);
    const lang = betrieb({ einheiten: [{ id: "e1", name: "WB1" }] });
    const abw = {};
    for (let i = 0; i < KLAERUNG_TAGE_MAX + 30; i++) abw[`a1|${tagePlus(T(0), i)}`] = "F";
    lang.abweichungen = abw;
    expect(klaerungsMarker(lang, [fall("km-l", "a1", T(0), tagePlus(T(0), KLAERUNG_TAGE_MAX + 29))])).toHaveLength(KLAERUNG_TAGE_MAX);
  });
  it("Faktenpaket und Auskunft lesen bestandFuerRolle — dort steht keine Markierung", () => {
    expect(bestandFuerRolle(bestand(mitFall()), SITZ.PL).mandanten[0]).not.toHaveProperty("klaerung");
  });
});

/* ================== C  Manipulierter PUT ================== */
describe("C  PUT: eine Markierung lässt sich weder anlegen noch entfernen", () => {
  const schreibe = (sitz, m, aendere) => {
    const alt = bestand(m), neu = kopie(alt);
    aendere(neu.mandanten[0]);
    const e = zusammenfuehren(alt, neu, sitz);
    expect(e && e.verweigert, JSON.stringify(e && e.verweigert)).toBeFalsy();
    return e;
  };
  const FALSCH = [{ fallId: "km-x", personId: "a2", datum: T(2), dienstId: "F", hinweis: KLAERUNG_HINWEIS }];
  for (const k of ["PL", "LT", "SV", "MA"]) {
    it(`${k}: mitgeschickte Markierung wird nicht gespeichert; gelesen wird allein aus den Fällen`, () => {
      const anlegen = schreibe(SITZ[k], betrieb(), (mm) => { mm.klaerung = FALSCH; });
      expect(anlegen.mandanten[0]).not.toHaveProperty("klaerung");
      expect(markerVon(anlegen.mandanten[0], SITZ.PL)).toEqual([]);
      const entfernen = schreibe(SITZ[k], mitFall(), (mm) => { mm.klaerung = []; });
      expect(entfernen.mandanten[0]).not.toHaveProperty("klaerung");
      expect(markerVon(entfernen.mandanten[0], SITZ.PL)).toEqual(ERWARTET);
      expect(entfernen.mandanten[0].abweichungen).toEqual(mitFall().abweichungen);
    });
  }
  it("Planung schickt ihre gelesene Sicht (mit Markierung) unverändert zurück: kein Feld im Bestand, Plan gleich", () => {
    const gelesen = antwort(mitFall(), SITZ.PL);
    const e = zusammenfuehren(bestand(mitFall()), kopie(gelesen), SITZ.PL);
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten[0]).not.toHaveProperty("klaerung");
    expect(e.mandanten[0].abweichungen).toEqual(mitFall().abweichungen);
    expect(e.mandanten[0].abwesenheiten).toEqual([]);
  });
});

/* ================== D  Ersatz vorbereiten ================== */
describe("D  Ersatz vorbereiten: rechnen, anzeigen, nie schreiben", () => {
  const sicht = () => antwort(mitFall(), SITZ.PL).mandanten[0];
  it("Unterbesetzung und Kandidaten aus der vorhandenen Engine — die gemeldete Person ist kein Kandidat", () => {
    const v = ersatzVorbereiten(sicht(), { fallId: "km-a1" });
    expect(v.map((x) => x.datum)).toEqual([T(2), T(3)]);
    for (const x of v) {
      expect(x.hinweis).toBe(VORSCHLAG_HINWEIS);
      expect(x.besetzung).toMatchObject({ soll: 2, jetzt: 2, ohne: 1, fehlt: 1 });
      const ids = [...x.direkt, ...x.nahe].map((k) => k.personId);
      expect(ids).not.toContain("a1");
      expect(ids).toContain("a3");
    }
    /* Dieselben Kandidaten wie die Engine auf einem Betrieb, in dem die Person tatsächlich fehlt. */
    const echt = betrieb({ abwesenheiten: [{ id: "x", personId: "a1", art: "abwesend", von: T(2), bis: T(3) }] });
    expect(v[0].direkt).toEqual(ersatzKandidaten(echt, T(2), "F").direkt);
  });
  it("schreibt nichts: Eingabe, gespeicherter Bestand, Plan, Nachrichten vorher = nachher", () => {
    const roh = bestand(mitFall());
    const rohVorher = kopie(roh);
    const s = bestandFuerAntwort(roh, SITZ.PL).mandanten[0];
    const sVorher = kopie(s);
    const v = ersatzVorbereiten(s);
    expect(v.length).toBeGreaterThan(0);
    expect(s).toEqual(sVorher);
    expect(roh).toEqual(rohVorher);
    expect(s.nachrichten).toEqual([]);
    expect(s.abwesenheiten).toEqual([]);
    const a1 = s.personen.find((p) => p.id === "a1");
    expect(personTag(s, a1, T(2)).dienstId).toBe("F");
    expect(besetzung(s, T(2)).F.anzahl).toBe(2);
  });
  it("ohne Gesundheitsangabe; begrenzt auf ERSATZ_SCHICHTEN_MAX Dienste", () => {
    expect(JSON.stringify(ersatzVorbereiten(sicht()))).not.toMatch(GESUNDHEIT);
    const s = sicht();
    s.klaerung = Array.from({ length: ERSATZ_SCHICHTEN_MAX + 10 }, () => ({ ...ERWARTET[0] }));
    expect(ersatzVorbereiten(s).length).toBeLessThanOrEqual(ERSATZ_SCHICHTEN_MAX);
  });
  it("ohne Markierung kein Vorschlag (Beschäftigte, Betriebsrat: die Sicht trägt keine)", () => {
    expect(ersatzVorbereiten(antwort(mitFall(), SITZ.MA).mandanten[0])).toEqual([]);
    expect(ersatzVorbereiten(antwort(mitFall(), SITZ.BR).mandanten[0])).toEqual([]);
  });
  it("Fakten der Engine kennen keine offenen Fälle: Ersatzkandidaten mit offenem Fall wie ohne", () => {
    expect(ersatzKandidaten(mitFall(), T(2), "F")).toEqual(ersatzKandidaten(betrieb(), T(2), "F"));
  });
  it("Quelltext: Engine und Intelligence-Schicht lesen weder Fälle noch Markierung; klaerung.mjs schreibt und versendet nichts", async () => {
    const treffer = [];
    for (const dir of ["server/lib/engine", "server/lib/intelligence"]) {
      const lauf = async (d) => {
        for (const e of await readdir(path.join(WURZEL, d), { withFileTypes: true })) {
          const rel = `${d}/${e.name}`;
          if (e.isDirectory()) { await lauf(rel); continue; }
          if (!/\.(mjs|js)$/.test(e.name)) continue;
          const q = await readFile(path.join(WURZEL, rel), "utf8");
          if (/m\.krankmeldungen|\.klaerung\b|klaerung\.mjs/.test(q)) treffer.push(rel);
        }
      };
      await lauf(dir);
    }
    expect(treffer).toEqual([]);
    const q = await readFile(path.join(WURZEL, "server/lib/klaerung.mjs"), "utf8");
    expect(q).not.toMatch(/bestandSchreiben|getStore|setJSON|fetch\(|mitteilung|versand|push\(\{ *id: *uid/i);
    expect(q).not.toMatch(/import .*(ablage|bestand|versand|mitteilungen|nachrichten)\.mjs/);
  });
});

/* ================== E  HTTP GET /api/bestand ================== */
describe("E  HTTP: der echte Lesepfad", () => {
  const WIRT = "127.0.0.1:3000", R = "rb5-raum";
  let wurzel, laden, daten, sitzungAnlegen, B, nr = 0;
  const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.75.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  };
  const tok = async (pid, rolle) => (await sitzungAnlegen({ bestand: R, name: pid, rolle, person: pid, betrieb: 0, mandantId: "m1", einheit: null },
    60 * 60 * 1000)).token;
  const lies = async (pid, rolle) => anfrage("/api/bestand", { token: await tok(pid, rolle) });
  const roh = async () => (await B.bestandLesen(laden(), R));

  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-rb5-"));
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

  it("offener Fall: Planung und zuständige SV lesen die Markierung; Beschäftigte, Betriebsrat, fremde SV nicht; Lesen schreibt nichts", async () => {
    await B.bestandSchreiben(laden(), R, bestand(betrieb()), { durch: "Pruefung" });
    const ma2Ohne = await lies("a2", "mitarbeiter");
    await B.bestandSchreiben(laden(), R, bestand(mitFall()), { durch: "Pruefung" });
    const vorher = await roh();
    const pl = await lies("p1", "planer");
    expect(pl.status).toBe(200);
    expect(pl.bestand.mandanten[0].klaerung).toEqual(ERWARTET);
    expect((await lies("s1", "subplaner")).bestand.mandanten[0].klaerung).toEqual(ERWARTET);
    expect((await lies("s2", "subplaner")).bestand.mandanten[0].klaerung).toEqual([]);
    for (const [pid, rolle] of [["a1", "mitarbeiter"], ["a2", "mitarbeiter"], ["r1", "betriebsrat"]]) {
      const r = await lies(pid, rolle);
      expect(r.status, rolle).toBe(200);
      expect(JSON.stringify(r.bestand), `${pid}`).not.toMatch(/klaerung|klärungsbedürftig/);
    }
    /* Die Kollegin sieht mit offenem Fall genau dasselbe wie ohne. */
    const ma2Mit = await lies("a2", "mitarbeiter");
    expect(ma2Mit.bestand.mandanten).toEqual(ma2Ohne.bestand.mandanten);
    /* Lesen und Vorbereiten schreiben nichts. */
    expect(ersatzVorbereiten(pl.bestand.mandanten[0]).length).toBeGreaterThan(0);
    const nachher = await roh();
    expect(nachher.stand).toBe(vorher.stand);
    expect(nachher.bestand).toEqual(vorher.bestand);
    expect(nachher.bestand.mandanten[0]).not.toHaveProperty("klaerung");
  });
  it("endgültige Bestätigung über POST /api/krankmeldung: danach keine Markierung mehr", async () => {
    await B.bestandSchreiben(laden(), R, bestand(mitFall(KRANK_STATUS.VORLAEUFIG)), { durch: "Pruefung" });
    const e = await anfrage("/api/krankmeldung", { methode: "POST", token: await tok("p1", "planer"), rumpf: { aktion: "endgueltig", id: "km-a1" } });
    expect(e.status, JSON.stringify(e)).toBe(200);
    expect((await lies("p1", "planer")).bestand.mandanten[0].klaerung).toEqual([]);
    expect((await lies("s1", "subplaner")).bestand.mandanten[0].klaerung).toEqual([]);
  });
});

/* ================== F  Oberfläche ================== */
describe("F  Oberfläche: Markierung und Vorschlag nur für die erlaubten Rollen", () => {
  const sitzFuer = (k) => {
    const s = SITZ[k];
    const m = antwort(mitFall(), s).mandanten[0];
    const ich = m.personen.find((p) => String(p.id) === String(s.person));
    return { rolle: "kunde", person: ich, mandant: m };
  };
  const zeige = (sitz) => renderToStaticMarkup(h(KrankmeldungenOffen, { sitz, akt: {}, oeffneTag: () => {} }));
  it("Planung: Markierung am Fall und „Ersatz vorbereiten“", () => {
    const html = zeige(sitzFuer("PL"));
    expect(html).toContain(KLAERUNG_HINWEIS);
    expect(html).toContain("Ersatz vorbereiten");
    expect(ersatzVorbereitbar(sitzFuer("PL"))).toBe(true);
    expect(klaerungAm(sitzFuer("PL"), "a1", T(2), "F")).toBe(true);
  });
  it("zuständige Schichtverantwortung: Markierung, aber kein Ersatz", () => {
    const html = zeige(sitzFuer("SV"));
    expect(html).toContain(KLAERUNG_HINWEIS);
    expect(html).not.toContain("Ersatz vorbereiten");
    expect(ersatzVorbereitbar(sitzFuer("SV"))).toBe(false);
  });
  it("Beschäftigte: keine Markierung — auch nicht, wenn eine Markierung manipuliert in ihrem Stand stünde", () => {
    const s = sitzFuer("MA");
    s.mandant = { ...s.mandant, klaerung: ERWARTET };
    expect(zeige(s)).not.toContain(KLAERUNG_HINWEIS);
    expect(klaerungFuer(s)).toEqual([]);
    expect(klaerungAm(s, "a1", T(2), "F")).toBe(false);
  });
  /* Review #207 (LOW): Die Oberfläche setzt nach einem Schritt zuerst nur den Status des Falls (src/app/aktionen/plan.js,
     krankBestaetigen). Die Markierung darf dann nicht bis zum nächsten Laden stehen bleiben. */
  const nurStatus = (m, id, status) => ({ ...m, krankmeldungen: m.krankmeldungen.map((f) => (f.id === id ? { ...f, status } : f)) });
  for (const status of [KRANK_STATUS.ENDGUELTIG, KRANK_STATUS.ABGELEHNT, KRANK_STATUS.ZURUECKGEZOGEN]) {
    it(`nach „${status}“ (nur Status lokal geändert, kein Neuladen): Markierung und Vorschlag sofort weg`, () => {
      for (const k of ["PL", "SV"]) {
        const s0 = sitzFuer(k);
        expect(zeige(s0)).toContain(KLAERUNG_HINWEIS);
        const s1 = { ...s0, mandant: nurStatus(s0.mandant, "km-a1", status) };
        expect(s1.mandant.klaerung).toEqual(ERWARTET);              // das Feld steht noch im lokalen Stand …
        expect(klaerungFuer(s1), k).toEqual([]);                     // … gilt aber nicht mehr
        expect(klaerungAm(s1, "a1", T(2), "F")).toBe(false);
        expect(zeige(s1)).not.toContain(KLAERUNG_HINWEIS);
        expect(ersatzVorbereiten(s1.mandant)).toEqual([]);
      }
    });
  }
  it("neu gemeldeter Fall vor dem nächsten Laden: kein fremder oder veralteter Zustand", () => {
    const s0 = sitzFuer("PL");
    const neu = { id: "km-neu", personId: "a2", von: T(2), bis: T(2), status: KRANK_STATUS.EINGEGANGEN };
    const s1 = { ...s0, mandant: { ...s0.mandant, krankmeldungen: [neu, ...s0.mandant.krankmeldungen] } };
    expect(klaerungAm(s1, "a2", T(2), "F")).toBe(false);
    expect(klaerungFuer(s1)).toEqual(ERWARTET);
    /* Eine Markierung, deren Fall im Stand fehlt, gilt nicht. */
    const s2 = { ...s0, mandant: { ...s0.mandant, krankmeldungen: [] } };
    expect(klaerungFuer(s2)).toEqual([]);
  });
  it("mehr als KLAERUNG_FAELLE_MAX offene Fälle: neutraler Hinweis „Weitere Fälle nicht markiert.“", () => {
    const s0 = sitzFuer("PL");
    expect(zeige(s0)).not.toContain("Weitere Fälle nicht markiert.");
    const viele = Array.from({ length: KLAERUNG_FAELLE_MAX + 1 }, (_, i) => ({ id: `km-v${i}`, personId: "a3", von: T(9), bis: T(9),
      status: KRANK_STATUS.EINGEGANGEN }));
    const s1 = { ...s0, mandant: { ...s0.mandant, krankmeldungen: [...s0.mandant.krankmeldungen, ...viele] } };
    const html = zeige(s1);
    expect(html).toContain("Weitere Fälle nicht markiert.");
  });
  it("Vorschlag: „Vorschlag, noch keine Änderung“, Namen der Kandidaten, keine Gesundheitsangabe", () => {
    const s = sitzFuer("PL");
    const name = (pid) => { const p = s.mandant.personen.find((x) => x.id === pid); return p ? `${p.vorname} ${p.nachname}` : "Person"; };
    const html = renderToStaticMarkup(h(ErsatzVorbereitet, { m: s.mandant, fallId: "km-a1", name, dienstName: (id) => id, oeffneTag: () => {} }));
    expect(html).toContain(VORSCHLAG_HINWEIS);
    expect(html).toContain("Va3 Na3");
    expect(html).toContain("1 fehlt");
    expect(html).not.toMatch(/krank|grippe|NOTIZ/i);
  });
});

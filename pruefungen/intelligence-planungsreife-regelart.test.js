/* ==========================================================================
   INTELLIGENCE — PLANUNGSREIFE: Regelart der Bestandsvorgaben (WP-I6, Nachtrag)

   Fehler (Review #618): Der Punkt „Vorgaben“ las die Regelart aus „typ“, doch Bestandsvorgaben
   (server/lib/vorgaben.mjs) führen das Feld „regelart“; „typ“ gibt es erst im Regelobjekt
   (vorgabeAlsRegel). Jeder Betrieb mit einer Vorgabe war so „nicht planungsreif“ (fail-closed,
   aber ein hartes Hindernis vor PLANER_AN). Außerdem blockierten Entwürfe und inaktive Vorgaben.

   Hier: Bestandsvorgabe nur mit „regelart“ ist bereit; Entwurf/inaktiv blockieren nie; aktive
   Vorgaben mit unbekannter Regelart oder ohne Parameter bleiben unvollständig; die Altform „typ“
   bleibt lesbar; Ende-zu-Ende über planerEinstieg; Eingaben bleiben unverändert.

   Aufruf: npm run pruefung:intelligence
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { planungsreife } from "../src/engine/planungsreife.js";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";
import { planerEinstieg } from "../server/lib/engine/planer.mjs";
import { mitTagesdatum } from "../server/lib/engine/zeit.mjs";
import { pruefeVorgabe } from "../server/lib/vorgaben.mjs";
import { REGELARTEN_ALLE } from "../server/lib/regelbaukasten-erweitert.mjs";

const tiefEinfrieren = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(tiefEinfrieren); Object.freeze(o); } return o; };
const OPT = { von: "2026-12-01", bis: "2026-12-31", heute: "2026-11-06" };
const T0 = "2026-11-27T10:00:00.000Z";
const HEUTE = "2026-11-27";
const YM = "2026-12";
const st = { am: T0, vonRolle: "leitung" };
const FREI = Object.freeze({ betrieb: { an: true, ...st }, betriebsratFrage: { antwort: "nein", ...st }, planerSchalter: { an: true, ...st } });

/** Eine Bestandsvorgabe in der Form des Bestands (Feld „regelart“, kein „typ“). */
const vorgabe = (extra = {}) => ({
  id: "wochenende", name: "Wochenend-Rotation", regelart: "blockregel", parameter: { wochentage: [5, 6], gruppen: { F: "tag", S: "tag" } },
  geltung: { art: "betrieb" }, grundlage: { art: "hausregel" }, staerke: "soll", prioritaet: 5, bezug: "monat", status: "aktiv", ...extra,
});

/** Vollständiger Betrieb ohne Vorgaben (das Feld „vorgaben“ setzt der Fall). */
function betrieb(vorgaben) {
  const mindest = { mo_do: 2, fr: 2, sa: 2, so: 2 };
  return {
    personen: Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`, vorname: `Vorname${i}`, nachname: `Nachname${i}`, status: "aktiv", eintritt: "2024-01-01", austritt: null,
      wochenstunden: 40, zugehoerigkeit: [{ ab: "2024-01-01", einheitId: "e1" }], qualifikationen: [], einschraenkungen: {},
    })),
    qualifikationen: [],
    dienstarten: [{ id: "F", start: "06:00", ende: "14:00", pause: 30, mindest, mindestQual: {} }],
    abwesenheiten: [],
    freigaben: {},
    vorgaben,
  };
}
const punktVorgaben = (e) => e.punkte.find((p) => p.id === "vorgaben");

describe("Planungsreife: Bestandsvorgaben mit dem Feld regelart", () => {
  it("die Testvorgabe ist eine gültige Bestandsvorgabe (Form des Schreibwegs)", () => {
    expect(pruefeVorgabe(vorgabe())).toBe(null);
    expect("typ" in vorgabe()).toBe(false);
  });
  it("aktive Bestandsvorgabe nur mit regelart: bereit, ohne Lücke und ohne Hinweis", () => {
    const e = planungsreife(betrieb([vorgabe()]), OPT);
    expect(e).toMatchObject({ urteil: "bereit", bereit: true, luecken: [], gruende: [] });
    expect(e.zaehler.vorgaben).toBe(1);
    expect(punktVorgaben(e).status).toBe("ok");
  });
  it("jede Regelart des Baukastens wird als regelart erkannt", () => {
    expect(REGELARTEN_ALLE.length).toBeGreaterThan(0);
    for (const art of REGELARTEN_ALLE) {
      const e = planungsreife(betrieb([vorgabe({ regelart: art, parameter: { x: 1 } })]), OPT);
      expect(e.urteil, art).toBe("bereit");
    }
  });
  it("die Altform typ bleibt lesbar (Regelobjekt, ohne Status und mit Status aktiv)", () => {
    expect(planungsreife(betrieb([{ id: "V1", typ: "blockregel", parameter: { wochentage: [5, 6] } }]), OPT).urteil).toBe("bereit");
    expect(planungsreife(betrieb([{ id: "V1", typ: "blockregel", parameter: { wochentage: [5, 6] }, status: "aktiv" }]), OPT).urteil).toBe("bereit");
  });
  it("regelart hat Vorrang vor typ: eine ungültige regelart wird nicht durch ein gültiges typ geheilt; null fällt auf typ zurück", () => {
    const schlecht = planungsreife(betrieb([vorgabe({ regelart: "zauberregel", typ: "blockregel" })]), OPT);
    expect(schlecht.urteil).toBe("nicht_bereit");
    const rueckfall = planungsreife(betrieb([vorgabe({ regelart: null, typ: "blockregel" })]), OPT);
    expect(rueckfall.urteil).toBe("bereit");
  });
});

describe("Planungsreife: nur aktive Vorgaben können blockieren", () => {
  const KAPUTT = [
    ["unbekannte Regelart", { regelart: "zauberregel" }],
    ["ohne Regelart", { regelart: undefined }],
    ["leere Parameter", { parameter: {} }],
    ["ohne Parameter", { parameter: undefined }],
    ["Parameter als Liste", { parameter: [1] }],
  ];
  for (const status of ["entwurf", "inaktiv"]) {
    for (const [name, extra] of KAPUTT) {
      it(`${status} mit ${name} blockiert nicht und zählt mit`, () => {
        const e = planungsreife(betrieb([vorgabe({ status, ...extra })]), OPT);
        expect(e.urteil).toBe("bereit");
        expect(e.luecken).toEqual([]);
        expect(e.zaehler.vorgaben).toBe(1);
      });
    }
  }
  for (const [name, extra] of KAPUTT) {
    it(`aktiv mit ${name} bleibt unvollständig (fail-closed)`, () => {
      const e = planungsreife(betrieb([vorgabe(extra)]), OPT);
      expect(e.urteil).toBe("nicht_bereit");
      expect(e.gruende).toEqual(["1 Vorgabe ist unvollständig."]);
      expect(e.luecken[0]).toMatchObject({ punkt: "vorgaben", ids: ["wochenende"], hinweis: false });
    });
  }
  it("Parameter als Liste: der Schreibweg lehnt sie ab, die Planungsreife gilt sie nie als vollständig (gleiche Linie)", () => {
    expect(pruefeVorgabe(vorgabe({ parameter: [1] }))).not.toBe(null);
    const e = planungsreife(betrieb([vorgabe({ parameter: [1] })]), OPT);
    expect(e).toMatchObject({ urteil: "nicht_bereit", bereit: false });
    expect(e.luecken[0]).toMatchObject({ punkt: "vorgaben", ids: ["wochenende"] });
    expect(planungsreife(betrieb([vorgabe({ parameter: ["a", "b"], regelart: "zaehlregel" })]), OPT).urteil).toBe("nicht_bereit");
  });
  it("ein unbekannter Status wird geprüft, nicht übersprungen (fail-closed)", () => {
    const e = planungsreife(betrieb([vorgabe({ status: "abgelaufen", regelart: "zauberregel" })]), OPT);
    expect(e.urteil).toBe("nicht_bereit");
  });
  it("gemischt: nur die kaputten aktiven Vorgaben werden benannt; id-lose über den Listenplatz", () => {
    const liste = [
      vorgabe({ id: "gut" }),
      vorgabe({ id: "entwurf-kaputt", status: "entwurf", regelart: "zauberregel", parameter: {} }),
      vorgabe({ id: "aktiv-kaputt", regelart: "zauberregel" }),
      { regelart: "blockregel", status: "aktiv" },
      vorgabe({ id: "aus-kaputt", status: "inaktiv", parameter: undefined }),
    ];
    const e = planungsreife(betrieb(liste), OPT);
    expect(e.urteil).toBe("nicht_bereit");
    expect(e.gruende).toEqual(["2 Vorgaben sind unvollständig."]);
    expect(e.luecken[0].ids).toEqual(["#3", "aktiv-kaputt"]);
    expect(e.zaehler.vorgaben).toBe(5);
  });
  it("Einträge, die keine Datensätze sind, bleiben unvollständig (auch ohne Status)", () => {
    const e = planungsreife(betrieb([null, "text", vorgabe()]), OPT);
    expect(e.urteil).toBe("nicht_bereit");
    expect(e.gruende).toEqual(["2 Vorgaben sind unvollständig."]);
  });
  it("Eingaben werden nie verändert (tief eingefroren, gleicher Stand danach)", () => {
    const b = betrieb([vorgabe(), vorgabe({ id: "e", status: "entwurf", regelart: "zauberregel" }), { id: "alt", typ: "blockregel", parameter: { a: 1 } }]);
    const vorher = JSON.stringify(b);
    tiefEinfrieren(b);
    expect(() => planungsreife(b, OPT)).not.toThrow();
    expect(JSON.stringify(b)).toBe(vorher);
  });
});

describe("Ende zu Ende: planerEinstieg mit Bestandsvorgaben", () => {
  /** Kleiner Betrieb wie in den Planer-Tests; Planer im Betrieb freigeschaltet (Knopfdruck). */
  const klein = (vorgaben) => {
    const m = baueLeerenBetrieb({ name: "T", branche: "pflege", email: "x@example.org", land: "HE", raum: "r" }).mandanten[0];
    m.personen = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, vorname: "Vorname", nachname: `Zuname${i}`, eintritt: "2020-01-01", zugehoerigkeit: [{ einheitId: m.einheiten[0].id, ab: "2020-01-01" }], wochenstunden: 40, status: "aktiv", qualifikationen: [] }));
    m.dienstarten = m.dienstarten.map((d) => (d.id === "F" ? { ...d, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 } } : d));
    m.einstellungen = { ...m.einstellungen, kiSteuerung: structuredClone(FREI) };
    if (vorgaben !== undefined) m.vorgaben = vorgaben;
    return m;
  };
  const einstieg = (m) => mitTagesdatum(HEUTE, () => planerEinstieg(m, YM, { freigabe: true, knopf: true, zuege: 0, maxProPerson: 8, heute: HEUTE }));

  it("Betrieb mit einer aktiven Bestandsvorgabe (nur regelart) bekommt einen Vorschlag, nicht „nicht_planungsreif“", () => {
    const m = klein([vorgabe()]);
    const r = einstieg(m);
    expect(r.status, r.grund).toBe("ok");
    expect(r.gesetzt.length).toBeGreaterThan(0);
  });
  it("ein kaputter Entwurf daneben ändert daran nichts", () => {
    const r = einstieg(klein([vorgabe(), vorgabe({ id: "entwurf", status: "entwurf", regelart: "zauberregel", parameter: {} })]));
    expect(r.status, r.grund).toBe("ok");
  });
  it("Gegenprobe: eine aktive Vorgabe mit unbekannter Regelart bleibt nicht planungsreif und wird benannt", () => {
    const r = einstieg(klein([vorgabe({ regelart: "zauberregel" })]));
    expect(r.status).toBe("nicht_planungsreif");
    expect(r.gesetzt).toEqual([]);
    expect(r.voraussetzungen).toEqual([{ punkt: "vorgaben", text: "1 Vorgabe ist unvollständig." }]);
  });
});

/* ==========================================================================
   INTELLIGENCE — PLANUNGSREIFE (WP-I6)

   Lückenhafter und vollständiger Betrieb; jeder fehlende Punkt wird benannt
   (Plan 7.3: „Bei 3 Personen fehlen die Vertragsstunden."), nie mit Namen.
   Dazu: Bestimmtheit, keine Veränderung der Eingaben, Laufzeit bei 31 Tagen x
   40 Personen, Betriebsmodus (automatisch / Knopfdruck / aus).

   Aufruf: npm run pruefung:intelligence
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { planungsreife, vorschlagErlaubt, REIFE_PUNKTE } from "../src/engine/planungsreife.js";

const tiefEinfrieren = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(tiefEinfrieren); Object.freeze(o); } return o; };

const OPT = { von: "2026-12-01", bis: "2026-12-31", heute: "2026-11-06" };

/** Ein vollständiger Betrieb: n Personen, drei Dienstarten, eine Qualifikation. */
function betrieb(anzahl = 12) {
  const mindest = { mo_do: 2, fr: 2, sa: 2, so: 2 };
  return {
    personen: Array.from({ length: anzahl }, (_, i) => ({
      id: `p${String(i).padStart(2, "0")}`, vorname: `Vorname${i}`, nachname: `Nachname${i}`, status: "aktiv",
      eintritt: "2024-01-01", austritt: null, wochenstunden: i % 4 === 3 ? 20 : 40,
      zugehoerigkeit: [{ ab: "2024-01-01", einheitId: "e1" }],
      qualifikationen: i % 3 === 0 ? ["q-fk"] : [], einschraenkungen: { keineNacht: false },
    })),
    qualifikationen: [{ id: "q-fk", name: "Fachkraft" }],
    dienstarten: [
      { id: "F", start: "06:00", ende: "14:00", pause: 30, mindest, mindestQual: { "q-fk": 1 } },
      { id: "S", start: "14:00", ende: "22:00", pause: 30, mindest, mindestQual: {} },
      { id: "N", start: "22:00", ende: "06:00", pause: 30, mindest: { mo_do: 1, fr: 1, sa: 1, so: 1 }, mindestQual: {} },
    ],
    abwesenheiten: [{ id: "a1", personId: "p00", art: "urlaub", von: "2026-12-07", bis: "2026-12-11" }],
    freigaben: {},
    vorgaben: [{ id: "V1", typ: "blockregel", parameter: { wochentage: [5, 6] } }],
  };
}
const texte = (e) => e.gruende;

describe("Vollständiger Betrieb", () => {
  it("ist bereit, ohne Lücken und ohne Hinweise", () => {
    const e = planungsreife(betrieb(), OPT);
    expect(e).toMatchObject({ urteil: "bereit", bereit: true, luecken: [], gruende: [] });
    expect(e.zaehler).toMatchObject({ personen: 12, dienstarten: 3, abwesenheiten: 1, vorgaben: 1, tage: 31, monate: 1 });
    expect(e.punkte.map((p) => p.id).sort()).toEqual([...REIFE_PUNKTE].sort());
    expect(e.punkte.every((p) => p.status === "ok")).toBe(true);
  });
  it("ohne interne Vorgaben ist er bereit mit Hinweis, nicht grün", () => {
    const b = betrieb(); delete b.vorgaben;
    const e = planungsreife(b, OPT);
    expect(e.urteil).toBe("bereit_mit_hinweisen");
    expect(e.bereit).toBe(true);
    expect(texte(e)).toEqual(["Es sind keine internen Vorgaben hinterlegt."]);
    expect(e.luecken[0].hinweis).toBe(true);
  });
  it("eine leere Vorgabenliste gilt als bewusst leer: bereit", () => {
    expect(planungsreife({ ...betrieb(), vorgaben: [] }, OPT).urteil).toBe("bereit");
  });
});

describe("Lücken werden genau benannt", () => {
  it("Vertragsstunden: „Bei 3 Personen fehlen die Vertragsstunden.“, mit Kennungen, ohne Namen", () => {
    const b = betrieb();
    b.personen[1].wochenstunden = null; b.personen[2].wochenstunden = 0; delete b.personen[4].wochenstunden;
    const e = planungsreife(b, OPT);
    expect(e.urteil).toBe("nicht_bereit");
    expect(texte(e)).toEqual(["Bei 3 Personen fehlen die Vertragsstunden."]);
    expect(e.luecken[0]).toMatchObject({ punkt: "vertragsstunden", ids: ["p01", "p02", "p04"] });
    expect(JSON.stringify(e)).not.toMatch(/Vorname|Nachname/);
  });
  it("Einzahl: „Bei 1 Person fehlen die Vertragsstunden.“", () => {
    const b = betrieb(); b.personen[0].wochenstunden = "viel";
    expect(texte(planungsreife(b, OPT))).toEqual(["Bei 1 Person fehlen die Vertragsstunden."]);
  });
  it("Personal: kein Eintritt, keine Einheit; niemand im Zeitraum einsetzbar", () => {
    const b = betrieb(); delete b.personen[0].eintritt; b.personen[1].zugehoerigkeit = [];
    expect(texte(planungsreife(b, OPT))).toEqual(["Bei 1 Person fehlt der Eintritt.", "Bei 1 Person fehlt die Einheit."]);
    const leer = planungsreife({ ...betrieb(), personen: [] }, OPT);
    expect(texte(leer)).toContain("Im Planungszeitraum ist keine Person einsetzbar.");
    expect(leer.urteil).toBe("nicht_bereit");
    const keineListe = planungsreife({ ...betrieb(), personen: undefined }, OPT);
    expect(texte(keineListe)).toContain("Die Personenliste fehlt.");
  });
  it("Personen außerhalb des Zeitraums, gesperrt oder ohne Schichtdienst zählen nicht", () => {
    const b = betrieb(4);
    b.personen[0].austritt = "2026-11-30"; b.personen[1].eintritt = "2027-01-01";
    b.personen[2].status = "gesperrt"; b.personen[3].imSchichtdienst = false;
    b.personen.forEach((p) => { p.wochenstunden = null; });
    const e = planungsreife(b, OPT);
    expect(e.zaehler.personen).toBe(0);
    expect(texte(e)).toContain("Im Planungszeitraum ist keine Person einsetzbar.");
    expect(texte(e).some((t) => /Vertragsstunden/.test(t))).toBe(false);
  });
  it("Qualifikationen: zu wenige Träger, unbekannte Qualifikation", () => {
    const b = betrieb(); b.dienstarten[0].mindestQual = { "q-fk": 6 };
    expect(texte(planungsreife(b, OPT))).toEqual(["Für „Fachkraft“ gibt es 4 Personen, je Dienst werden 6 gebraucht."]);
    const c = betrieb(); c.dienstarten[1].mindestQual = { "q-gibts-nicht": 1 };
    expect(texte(planungsreife(c, OPT))).toEqual(["Die geforderte Qualifikation „q-gibts-nicht“ ist nicht angelegt."]);
  });
  it("Qualifikationsangabe fehlt: Lücke, wenn Dienste Qualifikationen verlangen, sonst nur Hinweis", () => {
    const b = betrieb(); delete b.personen[5].qualifikationen;
    const mit = planungsreife(b, OPT);
    expect(mit.urteil).toBe("nicht_bereit");
    expect(texte(mit)).toEqual(["Bei 1 Person sind die Qualifikationen nicht erfasst."]);
    b.dienstarten.forEach((d) => { d.mindestQual = {}; });
    expect(planungsreife(b, OPT).urteil).toBe("bereit_mit_hinweisen");
  });
  it("Abwesenheiten: nicht erfasst, kaputt, unbekannte Person; leere Liste ist in Ordnung", () => {
    expect(texte(planungsreife({ ...betrieb(), abwesenheiten: undefined }, OPT))).toEqual(["Die Abwesenheiten sind nicht erfasst."]);
    expect(planungsreife({ ...betrieb(), abwesenheiten: [] }, OPT).urteil).toBe("bereit");
    const b = betrieb();
    b.abwesenheiten.push({ id: "a2", personId: "p01", von: "2026-12-10", bis: "2026-12-05" }, { id: "a3", personId: "gibtsnicht", von: "2026-12-01", bis: "2026-12-02" }, null);
    const e = planungsreife(b, OPT);
    expect(texte(e)).toEqual(["3 Abwesenheiten sind unvollständig oder ohne bekannte Person."]);
    expect(e.luecken[0].ids).toEqual(["#3", "a2", "a3"]);
  });
  it("Abwesenheiten außerhalb des Zeitraums werden nicht mitgezählt", () => {
    const b = betrieb(); b.abwesenheiten = [{ id: "a1", personId: "p00", von: "2027-02-01", bis: "2027-02-03" }];
    expect(planungsreife(b, OPT).zaehler.abwesenheiten).toBe(0);
  });
  it("Dienstarten: keine, ohne Zeiten, ungültige Uhrzeit", () => {
    expect(texte(planungsreife({ ...betrieb(), dienstarten: [] }, OPT))).toContain("Es sind keine Dienstarten angelegt.");
    const b = betrieb(); delete b.dienstarten[0].start; b.dienstarten[1].ende = "25:00";
    expect(texte(planungsreife(b, OPT))).toEqual(["Bei 2 Dienstarten fehlen die Zeiten."]);
  });
  it("Bedarf: fehlt bei einer Dienstart; alles null ist nur ein Hinweis; Posten brauchen keinen eigenen Bedarf", () => {
    const b = betrieb(); delete b.dienstarten[2].mindest; b.dienstarten[1].mindest = { mo_do: 1, fr: 1, sa: 1 };
    const e = planungsreife(b, OPT);
    expect(texte(e)).toEqual(["Bei 2 Dienstarten fehlt der Besetzungsbedarf."]);
    expect(e.luecken[0].ids).toEqual(["N", "S"]);
    const nullen = betrieb(); nullen.dienstarten.forEach((d) => { d.mindest = { mo_do: 0, fr: 0, sa: 0, so: 0 }; });
    expect(planungsreife(nullen, OPT).urteil).toBe("bereit_mit_hinweisen");
    const posten = betrieb(); posten.dienstarten.push({ id: "P", start: "07:00", ende: "15:00", posten: true, quelle: "F" });
    expect(planungsreife(posten, OPT).urteil).toBe("bereit");
  });
  it("Vorgaben: unvollständige Regel blockiert; unbekannte Art ebenso; Wünsche nicht lesbar", () => {
    const b = betrieb(); b.vorgaben.push({ id: "V2", typ: "zauberregel", parameter: { x: 1 } }, { id: "V3", typ: "wunschregel", parameter: {} });
    const e = planungsreife(b, OPT);
    expect(e.urteil).toBe("nicht_bereit");
    expect(texte(e)).toEqual(["2 Vorgaben sind unvollständig."]);
    expect(texte(planungsreife({ ...betrieb(), wuensche: "kaputt" }, OPT))).toEqual(["Die Wünsche sind nicht lesbar."]);
    expect(texte(planungsreife({ ...betrieb(), vorgaben: "kaputt" }, OPT))).toEqual(["Die internen Vorgaben sind nicht lesbar."]);
  });
  it("Zeitraum: freigegebener Monat, Vergangenheit, ungültig, zu lang, über zwei Monate", () => {
    expect(texte(planungsreife({ ...betrieb(), freigaben: { "2026-12": { zeit: "x" } } }, OPT))).toEqual(["Für 1 Monat des Zeitraums liegt schon ein freigegebener Plan vor."]);
    const zwei = planungsreife({ ...betrieb(), freigaben: { "2027-01": { zeit: "x" } } }, { von: "2026-12-15", bis: "2027-01-10" });
    expect(zwei.zaehler.monate).toBe(2);
    expect(zwei.urteil).toBe("nicht_bereit");
    expect(texte(planungsreife(betrieb(), { ...OPT, heute: "2027-02-01" }))).toEqual(["Der Planungszeitraum liegt vollständig in der Vergangenheit."]);
    expect(planungsreife(betrieb(), { von: OPT.von, bis: OPT.bis }).urteil).toBe("bereit"); // ohne Tagesdatum keine Vergangenheitsprüfung
    expect(texte(planungsreife(betrieb(), { von: "2026-12-31", bis: "2026-12-01" }))).toEqual(["Der Planungszeitraum fehlt oder ist ungültig."]);
    expect(texte(planungsreife(betrieb(), { von: "2026-02-30", bis: "2026-03-05" }))).toEqual(["Der Planungszeitraum fehlt oder ist ungültig."]);
    expect(texte(planungsreife(betrieb(), { von: "2026-01-01", bis: "2028-01-01" }))[0]).toMatch(/länger als 400 Tage/);
    expect(texte(planungsreife(betrieb(), { ...OPT, heute: "gestern" }))).toEqual(["Das Tagesdatum ist ungültig."]);
  });
  it("Schichtsystem nur, wenn genutzt", () => {
    expect(planungsreife(betrieb(), OPT).punkte.some((p) => p.id === "schichtsystem")).toBe(false);
    const ohne = planungsreife(betrieb(), { ...OPT, schichtsystemGenutzt: true });
    expect(texte(ohne)).toEqual(["Das Schichtsystem ist nicht festgelegt."]);
    expect(planungsreife({ ...betrieb(), zyklus: { wochen: 2, tage: new Array(14).fill("F") } }, { ...OPT, schichtsystemGenutzt: true }).urteil).toBe("bereit");
  });
  it("nach Einheit gefiltert", () => {
    const b = betrieb(4); b.personen[0].zugehoerigkeit = [{ ab: "2024-01-01", einheitId: "e2" }]; b.personen[0].wochenstunden = null;
    expect(planungsreife(b, { ...OPT, einheitId: "e1" }).urteil).toBe("bereit");
    expect(planungsreife(b, { ...OPT, einheitId: "e2" }).urteil).toBe("nicht_bereit");
  });
  it("kein Bestand: nicht bereit, ohne zu werfen", () => {
    for (const leer of [null, undefined, 5, "x"]) {
      const e = planungsreife(leer, OPT);
      expect(e.urteil, String(leer)).toBe("nicht_bereit");
      expect(texte(e)).toEqual(["Es liegen keine Betriebsdaten vor."]);
    }
  });
  it("viele Lücken zugleich: alle werden genannt, in fester Reihenfolge der Prüfliste", () => {
    const b = betrieb();
    b.personen[0].wochenstunden = null; delete b.dienstarten[0].start; delete b.dienstarten[2].mindest; b.abwesenheiten = undefined;
    b.freigaben = { "2026-12": {} };
    const e = planungsreife(b, OPT);
    expect(e.luecken.map((l) => l.punkt)).toEqual(["vertragsstunden", "abwesenheiten", "dienstarten", "bedarf", "zeitraum"]);
    expect(e.urteil).toBe("nicht_bereit");
  });
});

describe("Zusagen", () => {
  it("gleiche Eingabe, gleiche Ausgabe — auch bei kopierten Daten und umgekehrter Personenreihenfolge", () => {
    const b = betrieb(); b.personen[3].wochenstunden = null; b.personen[7].wochenstunden = null;
    const a = planungsreife(b, OPT);
    expect(planungsreife(b, OPT)).toEqual(a);
    expect(JSON.stringify(planungsreife(structuredClone(b), OPT))).toBe(JSON.stringify(a));
    const rev = { ...b, personen: [...b.personen].reverse() };
    expect(planungsreife(rev, OPT)).toEqual(a);
  });
  it("verändert die Eingaben nicht (tief eingefroren)", () => {
    const b = tiefEinfrieren(betrieb()); const o = tiefEinfrieren({ ...OPT });
    const kopie = structuredClone(b);
    expect(() => planungsreife(b, o)).not.toThrow();
    expect(b).toEqual(kopie);
  });
  it("nennt keine Namen, E-Mail-Adressen oder Gründe von Abwesenheiten im Ergebnis", () => {
    const b = betrieb(); b.personen[0].email = "geheim@example.org"; b.personen[0].wochenstunden = null; b.abwesenheiten[0].art = "krank"; b.abwesenheiten[0].notiz = "Diagnose";
    const s = JSON.stringify(planungsreife(b, OPT));
    expect(s).not.toMatch(/geheim|krank|Diagnose|Vorname|Nachname/);
  });
  it("jeder fehlende Punkt ist benannt: kein nicht_bereit ohne Grund, kein Grund ohne Punkt", () => {
    const b = betrieb(); b.personen[0].wochenstunden = null;
    const e = planungsreife(b, OPT);
    for (const p of e.punkte) expect(p.status === "ok", p.id).toBe(p.luecken.length === 0);
    expect(e.gruende.length).toBe(e.luecken.length);
  });
  it("Laufzeit: 31 Tage x 40 Personen, 200 Läufe unter einer Sekunde", () => {
    const b = betrieb(40);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) planungsreife(b, OPT);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("Vorschlag erlaubt? (automatisch / Knopfdruck / aus)", () => {
  const bereit = planungsreife(betrieb(), OPT);
  const nicht = planungsreife({ ...betrieb(), personen: [] }, OPT);
  const hinweis = planungsreife({ ...betrieb(), vorgaben: undefined }, OPT);
  it("automatisch rechnet nur bei Reife (auch mit Hinweisen)", () => {
    expect(vorschlagErlaubt(bereit, "automatisch")).toEqual({ erlaubt: true, grund: "automatisch" });
    expect(vorschlagErlaubt(hinweis, "automatisch").erlaubt).toBe(true);
    expect(vorschlagErlaubt(nicht, "automatisch")).toEqual({ erlaubt: false, grund: "nicht_bereit" });
  });
  it("Knopfdruck wartet auf den Knopf, rechnet aber nie ohne Reife", () => {
    expect(vorschlagErlaubt(bereit, "knopfdruck")).toEqual({ erlaubt: false, grund: "wartet_auf_knopfdruck" });
    expect(vorschlagErlaubt(bereit, "knopfdruck", true).erlaubt).toBe(true);
    expect(vorschlagErlaubt(nicht, "knopfdruck", true).erlaubt).toBe(false);
  });
  it("aus rechnet nie; unbekannter Modus und fehlende Prüfung rechnen nicht", () => {
    expect(vorschlagErlaubt(bereit, "aus", true)).toEqual({ erlaubt: false, grund: "aus" });
    expect(vorschlagErlaubt(bereit, "irgendwie").erlaubt).toBe(false);
    expect(vorschlagErlaubt(null, "automatisch")).toEqual({ erlaubt: false, grund: "keine_pruefung" });
    expect(vorschlagErlaubt({ urteil: "bereit_vielleicht" }, "automatisch").erlaubt).toBe(false);
  });
});

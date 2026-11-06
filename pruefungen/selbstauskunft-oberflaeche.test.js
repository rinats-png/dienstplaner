/* ==========================================================================
   SELBSTAUSKUNFT ALS ANTRAG: OBERFLÄCHE (WP-15)

   Gerendert werden SelbstauskunftStatus (eigene Anträge) und SelbstauskunftFreigabe
   (Leitung/Planung) mit Daten, wie sie der Server der Rolle liefert.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SelbstauskunftStatus, SelbstauskunftFreigabe, selbstauskuenfteVon } from "../src/ansichten/selbstauskunft.jsx";

const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const antrag = (extra = {}) => ({ id: "sa-1", status: "offen", gestellt: "2026-11-09T18:00:00.000Z", von: { personId: "a1", rolle: "mitarbeiter" },
  wieGeplant: false, vorschlag: { start: "05:30", ende: "15:00", pause: 15 }, grund: "Übergabe verlängert",
  abweichung: { abweichend: true, marken: ["BEGINN", "ENDE", "DAUER", "PAUSE"], beginnMin: -30, endeMin: 60, dauerMin: 90, pauseMin: -15,
    plan: { dienst: "F", start: "06:00", ende: "14:00", pause: 30 } }, stempel: "keiner", entschieden: null, ...extra });
const m = (erfassung) => ({ personen: [{ id: "a1", vorname: "Anna", nachname: "Eins" }, { id: "l1", vorname: "Lena", nachname: "Leit" }],
  erfassung });
const eintrag = (a) => ({ start: null, ende: null, bestaetigt: false, selbstauskunft: a });

describe("Selbstauskunft: Oberfläche", () => {
  it("selbstauskuenfteVon findet nur Einträge mit Antrag, neueste zuerst, optional je Person", () => {
    const mm = m({ "a1|2026-11-05": eintrag(antrag()), "a1|2026-11-07": eintrag(antrag({ id: "sa-2" })),
      "a1|2026-11-01": { start: "06:00", ende: "14:00", bestaetigt: true }, "l1|2026-11-06": eintrag(antrag({ id: "sa-3", von: { personId: "l1" } })) });
    expect(selbstauskuenfteVon(mm).map((x) => x.datum)).toEqual(["2026-11-07", "2026-11-06", "2026-11-05"]);
    expect(selbstauskuenfteVon(mm, "a1").map((x) => x.antrag.id)).toEqual(["sa-2", "sa-1"]);
    expect(selbstauskuenfteVon(null)).toEqual([]);
  });

  it("Status: offener Antrag zählt noch nicht und lässt sich zurückziehen; abgelehnt zeigt die Begründung", () => {
    const t = text(h(SelbstauskunftStatus, { ich: { id: "a1" }, m: m({
      "a1|2026-11-09": eintrag(antrag()),
      "a1|2026-11-08": eintrag(antrag({ id: "sa-2", status: "abgelehnt", entschieden: { begruendung: "Der Dienst wurde getauscht." } })) }) }));
    expect(t).toContain("Meine Zeiten-Anträge");
    expect(t).toContain("offen — zählt noch nicht");
    expect(t).toContain("Antrag zurückziehen");
    expect(t).toContain("zählt für diesen Tag die Planzeit");
    expect(t).toContain("Begründung: Der Dienst wurde getauscht.");
  });

  it("Status ohne Anträge: nichts", () => {
    expect(renderToStaticMarkup(h(SelbstauskunftStatus, { ich: { id: "a1" }, m: m({}) }))).toBe("");
  });

  it("Freigabe: Person, Vorschlag, Abweichung (Beginn, Ende, Dauer, Pause), Grund, Stempelabgleich; Freigeben und Ablehnen", () => {
    const t = text(h(SelbstauskunftFreigabe, { ichId: "l1", m: m({ "a1|2026-11-09": eintrag(antrag()) }) }));
    expect(t).toContain("Anna Eins");
    expect(t).toContain("05:30–15:00, Pause 15 min");
    expect(t).toContain("Abweichung vom Plan");
    expect(t).toContain("Beginn, Ende, Dauer, Pause");
    expect(t).toContain("Beginn -30 min");
    expect(t).toContain("Grund: Übergabe verlängert");
    expect(t).toContain("Stempelabgleich");
    expect(t).toContain("Freigeben");
    expect(t).toContain("Ablehnen");
  });

  it("Freigabe: die eigene Selbstauskunft hat keine Schaltflächen; entschiedene und fremde Zustände erscheinen nicht", () => {
    const t = text(h(SelbstauskunftFreigabe, { ichId: "a1", m: m({ "a1|2026-11-09": eintrag(antrag()),
      "a1|2026-11-08": eintrag(antrag({ id: "sa-2", status: "genehmigt" })) }) }));
    expect(t).toContain("gibt eine andere Person frei");
    expect(t).not.toContain("Freigeben");
    expect(t).not.toContain("08.11");
    expect(renderToStaticMarkup(h(SelbstauskunftFreigabe, { ichId: "l1", m: m({ "a1|2026-11-08": eintrag(antrag({ status: "genehmigt" })) }) }))).toBe("");
  });

  it("wie geplant ohne Abweichung: ausdrücklich gesagt", () => {
    const t = text(h(SelbstauskunftFreigabe, { ichId: "l1", m: m({ "a1|2026-11-09": eintrag(antrag({
      wieGeplant: true, vorschlag: { start: null, ende: null }, abweichung: { abweichend: false, marken: [], beginnMin: 0, endeMin: 0, dauerMin: 0, pauseMin: null,
        plan: { dienst: "F", start: "06:00", ende: "14:00", pause: 30 } } })) }) }));
    expect(t).toContain("wie geplant");
    expect(t).toContain("keine Abweichung vom Plan");
  });
});

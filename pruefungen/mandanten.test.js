/* ==========================================================================
   MANDANTEN-INTEGRITÄT — Schreibweg und Gestaltprüfung

   Ist ein Bestand gespeichert, bestimmt der Server seine Gestalt: Anzahl,
   Kennungen und Reihenfolge der Betriebe, und welcher zur Sitzung gehört.
   Rollen mit vollem oder einheitsgebundenem Schreibrecht schicken genau
   einen Betrieb — den eigenen —, und er wird an seiner Stelle ersetzt.

   Den HTTP-Weg prüft pruefungen/mandanten.mjs (serverlauf).
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { pruefeGestalt, mandantenKennungenGeprueft } from "../server/lib/gestalt.mjs";
import { zerlegen, zusammensetzen } from "../server/lib/scherben.mjs";

const person = (id, rolle, einheit) => ({ id, vorname: id, nachname: id, rolle, bereich: einheit,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const betrieb = (id, name, personen) => ({ id, name, einheiten: [{ id: "e1" }, { id: "e2" }],
  dienstarten: [{ id: "F" }], personen, abweichungen: {}, erfassung: {}, einstempeln: {},
  anfragen: [], nachrichten: [], abwesenheiten: [], protokoll: [{ text: `${name} echt` }],
  status: "aktiv", tarif: "pro" });

/* Der Demoraum: drei Betriebe in einem Raum, Sitzungen über den Index. */
const raum = () => ({ version: 9, stand: 4, session: null, protokoll: [{ text: "Betreiber" }],
  mandanten: [
    betrieb("m-nordwacht", "Nordwacht", [person("a-l", "leitung", "ALLE"), person("a-p", "planer", "ALLE")]),
    betrieb("m-lindenhof", "Lindenhof", [person("b-l", "leitung", "ALLE"), person("b-p", "planer", "ALLE"),
      person("b-s", "subplaner", "e1"), person("b-x", "mitarbeiter", "e2"), person("b-y", "mitarbeiter", "e1"),
      person("b-r", "betriebsrat", "e1"), person("b-k", "kunde", "ALLE")]),
    betrieb("m-steinbach", "Steinbach", [person("c-l", "leitung", "ALLE")]),
  ] });
const SITZ = {
  leitungA: { rolle: "leitung", person: "a-l", betrieb: 0 },
  leitungB: { rolle: "leitung", person: "b-l", betrieb: 1 },
  leitungC: { rolle: "leitung", person: "c-l", betrieb: 2 },
  planerB: { rolle: "planer", person: "b-p", betrieb: 1 },
  kundeB: { rolle: "kunde", person: "b-k", betrieb: 1 },
  subplanerB: { rolle: "subplaner", person: "b-s", betrieb: 1, einheit: "e1" },
  mitarbeiterB: { rolle: "mitarbeiter", person: "b-x", betrieb: 1 },
  betriebsratB: { rolle: "betriebsrat", person: "b-r", betrieb: 1 },
};
const ids = (b) => b.mandanten.map((m) => m.id);
const kopie = (x) => JSON.parse(JSON.stringify(x));
const gelesen = (g, s) => kopie(bestandFuerRolle(g, s));
/** Lesen, ändern, zurückschreiben — wie die Oberfläche. */
const schreibe = (g, s, aendern) => { const b = gelesen(g, s); aendern(b.mandanten[0], b); return zusammenfuehren(g, b, s); };
/** Scherben zerlegen und wieder zusammensetzen — wie bestandSchreiben/bestandLesen. */
const gespeichertUndGelesen = (b) => { const z = zerlegen(b); return zusammensetzen(z.kern, [...z.scherben.values()]); };

describe("Reihenfolge: jeder schreibt nur seinen Betrieb, an seiner Stelle", () => {
  for (const [wer, index] of [["leitungA", 0], ["leitungB", 1], ["leitungC", 2]]) {
    it(`${wer} schreibt → Anzahl, Kennungen und Reihenfolge bleiben, die anderen sind unverändert`, () => {
      const vorher = raum();
      const nachher = schreibe(vorher, SITZ[wer], (m) => { m.name += " (neu)"; });
      expect(nachher.verweigert).toBeUndefined();
      expect(ids(nachher)).toEqual(ids(vorher));
      expect(new Set(nachher.mandanten.map((m) => m.id.trim())).size).toBe(nachher.mandanten.length);
      nachher.mandanten.forEach((m, i) => {
        if (i === index) expect(m.name).toBe(`${vorher.mandanten[i].name} (neu)`);
        else expect(m).toEqual(vorher.mandanten[i]);
      });
    });
  }

  it("Leitung B schreibt — danach sieht jede Sitzung ihren ursprünglichen Betrieb", () => {
    const nachher = gespeichertUndGelesen(schreibe(raum(), SITZ.leitungB, (m) => { m.name = "Lindenhof neu"; }));
    expect(bestandFuerRolle(nachher, SITZ.leitungA).mandanten[0].name).toBe("Nordwacht");
    expect(bestandFuerRolle(nachher, SITZ.leitungB).mandanten[0].name).toBe("Lindenhof neu");
    expect(bestandFuerRolle(nachher, SITZ.leitungC).mandanten[0].name).toBe("Steinbach");
  });

  it("Demoraum: Nordwacht, Lindenhof, Steinbach behalten nach jedem Speichern ihren Index", () => {
    let b = raum();
    /* Jede Rolle mit einer Änderung, die sie schreiben darf. */
    const aenderung = {
      subplanerB: (m) => { m.abweichungen["b-y|2026-11-09"] = "F"; },
      mitarbeiterB: (m) => { m.abwesenheiten.push({ id: "k9", personId: "b-x", art: "krank", von: "2026-11-09", bis: "2026-11-09" }); },
    };
    for (const wer of ["leitungB", "leitungC", "leitungA", "leitungB", "planerB", "kundeB", "subplanerB", "mitarbeiterB"]) {
      const neu = schreibe(b, SITZ[wer], aenderung[wer] || ((m) => { m.zuletzt = wer; }));
      expect(neu && !neu.verweigert, wer).toBe(true);
      b = gespeichertUndGelesen(neu);
      expect(b.mandanten.map((m) => m.name), wer).toEqual(["Nordwacht", "Lindenhof", "Steinbach"]);
      expect(bestandFuerRolle(b, SITZ.leitungA).mandanten[0].id).toBe("m-nordwacht");
      expect(bestandFuerRolle(b, SITZ.leitungB).mandanten[0].id).toBe("m-lindenhof");
      expect(bestandFuerRolle(b, SITZ.leitungC).mandanten[0].id).toBe("m-steinbach");
    }
  });
});

describe("Fremde und zusätzliche Betriebe werden abgewiesen", () => {
  const faelle = {
    "nur ein fremder Betrieb [A]": (b, g) => { b.mandanten = [kopie(g.mandanten[0])]; },
    "eigener und fremder [B, A]": (b, g) => { b.mandanten.push(kopie(g.mandanten[0])); },
    "eigener und fremder [B, C]": (b, g) => { b.mandanten.push(kopie(g.mandanten[2])); },
    "eigener doppelt [B, B]": (b) => { b.mandanten.push(kopie(b.mandanten[0])); },
    "keiner []": (b) => { b.mandanten = []; },
    "Kennung verändert": (b) => { b.mandanten[0].id = "m-lindenhof-2"; },
    "Kennung mit Leerzeichen": (b) => { b.mandanten[0].id = " m-lindenhof"; },
    "Liste fehlt": (b) => { delete b.mandanten; },
  };
  for (const s of ["leitungB", "planerB", "kundeB", "subplanerB"]) {
    for (const [name, aendern] of Object.entries(faelle)) {
      it(`${s}: ${name}`, () => {
        const g = raum();
        const b = gelesen(g, SITZ[s]);
        aendern(b, g);
        const erg = zusammenfuehren(g, b, SITZ[s]);
        expect(erg && erg.verweigert, name).toBeTruthy();
      });
    }
  }
});

describe("Der bestätigte Angriff der Schichtverantwortung", () => {
  const angriff = (g) => {
    const b = gelesen(g, SITZ.subplanerB);
    const zweites = kopie(b.mandanten[0]);
    zweites.abweichungen["b-x|2026-11-02"] = "F";
    zweites.erfassung["b-x|2026-10-01"] = { start: "00:00", ende: "23:59", bestaetigt: true };
    b.mandanten.push(zweites);
    return b;
  };
  it("die Struktur ist ungültig (422 vor der Rechteprüfung)", () => {
    expect(mandantenKennungenGeprueft(angriff(raum()).mandanten)).toMatchObject({ ok: false });
  });
  it("auch ohne die Vorprüfung lässt der Schreibweg ihn nicht durch", () => {
    const g = raum();
    expect(zusammenfuehren(g, angriff(g), SITZ.subplanerB).verweigert).toBeTruthy();
  });
  it("die eigene Einheit schreibt weiter, die fremde direkt bleibt verboten", () => {
    const g = raum();
    const eigen = schreibe(g, SITZ.subplanerB, (m) => { m.abweichungen["b-y|2026-11-02"] = "F"; });
    expect(eigen.verweigert).toBeUndefined();
    const nach = gespeichertUndGelesen(eigen);
    expect(nach.mandanten[1].abweichungen).toEqual({ "b-y|2026-11-02": "F" });
    expect(ids(nach)).toEqual(ids(g));
    const fremd = schreibe(g, SITZ.subplanerB, (m) => { m.abweichungen["b-x|2026-11-02"] = "F"; });
    expect(fremd.verweigert).toMatch(/nicht zu deinem Bereich/);
  });
  it("nach Zerlegen und Zusammensetzen keine fremde Änderung", () => {
    const g = raum();
    const eigen = schreibe(g, SITZ.subplanerB, (m) => { m.abweichungen["b-y|2026-11-02"] = "F"; });
    const nach = gespeichertUndGelesen(eigen);
    expect(nach.mandanten[1].abweichungen["b-x|2026-11-02"]).toBeUndefined();
    expect(nach.mandanten[1].erfassung["b-x|2026-10-01"]).toBeUndefined();
    expect(nach.mandanten[0]).toEqual(g.mandanten[0]);
    expect(nach.mandanten[2]).toEqual(g.mandanten[2]);
  });
});

describe("Die übrigen Rollen", () => {
  it("Leitung und Planung speichern legitime Änderungen; Verlorenes und Vertragsfelder wie bisher", () => {
    for (const s of ["leitungB", "planerB"]) {
      const g = raum();
      const b = gelesen(g, SITZ[s]);
      b.mandanten[0].abweichungen["b-x|2026-11-05"] = "F";
      b.mandanten[0].tarif = "gratis";                         // Vertragsfeld: bleibt beim Betreiber
      delete b.mandanten[0].protokoll;                          // nicht mitgeschickt: bleibt erhalten
      const erg = zusammenfuehren(g, b, SITZ[s]);
      expect(erg.mandanten[1].abweichungen["b-x|2026-11-05"], s).toBe("F");
      expect(erg.mandanten[1].tarif, s).toBe("pro");
      expect(erg.mandanten[1].protokoll, s).toEqual(g.mandanten[1].protokoll);
      expect(erg.protokoll, s).toEqual(g.protokoll);
      expect(ids(erg)).toEqual(ids(g));
    }
  });
  it("Mitarbeiter-Selbstservice im Raum mit drei Betrieben bleibt an seiner Stelle", () => {
    const g = raum();
    const erg = schreibe(g, SITZ.mitarbeiterB, (m) => {
      m.abwesenheiten.push({ id: "k1", personId: "b-x", art: "krank", von: "2026-11-01", bis: "2026-11-02" });
    });
    expect(ids(erg)).toEqual(ids(g));
    expect(erg.mandanten[1].abwesenheiten.map((a) => a.id)).toEqual(["k1"]);
    expect(erg.mandanten[0]).toEqual(g.mandanten[0]);
    expect(erg.mandanten[2]).toEqual(g.mandanten[2]);
  });
  it("der Betriebsrat schreibt weiterhin nicht", () => {
    const g = raum();
    expect(zusammenfuehren(g, gelesen(g, SITZ.betriebsratB), SITZ.betriebsratB)).toBeNull();
  });
  it("der Betreiber legt weiterhin Betriebe an und löscht sie", () => {
    const g = raum();
    const neu = { ...kopie(g), mandanten: [...kopie(g.mandanten), betrieb("m-neu", "Neu", [])] };
    const erg = zusammenfuehren(g, neu, { rolle: "betreiber" });
    expect(ids(erg)).toEqual(["m-nordwacht", "m-lindenhof", "m-steinbach", "m-neu"]);
    expect(pruefeGestalt(erg).ok).toBe(true);
    const weg = zusammenfuehren(g, { ...kopie(g), mandanten: kopie(g.mandanten).slice(0, 2) }, { rolle: "betreiber" });
    expect(ids(weg)).toEqual(["m-nordwacht", "m-lindenhof"]);
  });
});

describe("Gestaltprüfung: Kennungen der Betriebe", () => {
  const mit = (...kennungen) => ({ mandanten: kennungen.map((id) => ({ id })) });
  it("gültige, eindeutige Zeichenketten gehen durch", () => {
    expect(pruefeGestalt(mit("A", "B", "m-1")).ok).toBe(true);
  });
  for (const [name, b] of Object.entries({
    "doppelt": mit("A", "A"),
    "doppelt nach Leerraum": mit("A", " A "),
    "leer": mit(""),
    "nur Leerzeichen": mit("   "),
    "null": mit(null),
    "fehlt": { mandanten: [{}] },
    "Zahl": mit(1),
    "Zahl neben Zeichenkette": mit(1, "1"),
    "Objekt": mit({ x: 1 }),
    "Liste": mit(["A"]),
    "Betrieb ist eine Liste": { mandanten: [["A"]] },
  })) {
    it(`abgewiesen: ${name}`, () => {
      expect(pruefeGestalt(b).ok).toBe(false);
      expect(mandantenKennungenGeprueft(b.mandanten)).toMatchObject({ ok: false });
    });
  }
  it("die Kennung selbst wird nicht verändert", () => {
    const b = mit("A ");
    pruefeGestalt(b);
    expect(b.mandanten[0].id).toBe("A ");
  });
});

describe("Leerer Raum: kein Schreibweg (Commit 1g)", () => {
  for (const s of ["leitungA", "planerB", "kundeB", "subplanerB", "mitarbeiterB", "betriebsratB"]) {
    it(`${s} befüllt keinen leeren Raum`, () => {
      const erg = zusammenfuehren(null, raum(), SITZ[s]);
      expect(erg === null || !!erg.verweigert, s).toBe(true);
    });
  }
  it("auch der Betreiber nicht über diesen Weg", () => {
    expect(zusammenfuehren(null, raum(), { rolle: "betreiber" }).verweigert).toBeTruthy();
  });
});

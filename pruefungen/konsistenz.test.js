/* ==========================================================================
   KONSISTENZ ZWISCHEN PLANPRÜFUNG UND WARNDIALOG

   Die Planprüfung (pruefen) und der Warndialog bei der Einteilung
   (hindernisBefunde) zeigen Befunde verschieden an. Über dieselbe Person und
   denselben Dienst dürfen sie aber nicht Verschiedenes sagen. Beide lesen
   deshalb die Schutzbefunde aus schutzEinsatz() (src/regelwerk.js).

   Zweiter Teil: Fehlen einer Prüfung die nötigen Daten, ist sie „nicht
   bewertbar" und niemals „erfüllt".

   Aufruf: npm run pruefung:konsistenz
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { schutzBefunde, schutzEinsatz, aufgabeGedeckt, aufgabeSchwere } from "../src/regelwerk.js";
import { regelIdFuerBefund } from "../src/regelregister.js";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const funktion = (name) => {
  const von = app.indexOf(`function ${name}(`);
  expect(von, name).toBeGreaterThan(0);
  const naechste = app.indexOf("\nfunction ", von + 10);
  return app.slice(von, naechste);
};

const nacht = { id: "N", name: "Nacht", start: "21:30", ende: "06:30", pause: 30 };
const lang = { id: "L", name: "Lang", start: "06:00", ende: "18:30", pause: 30 };
const frueh = { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 };
const MITTWOCH = "2026-10-14", SAMSTAG = "2026-10-17", SONNTAG = "2026-10-18";
const jugend = { id: "j", geburtstag: "2010-03-01" };
const mutter = { id: "m", mutterschutz: true, geburtstag: "1995-05-05" };
const sb = { id: "s", schwerbehindert: true, geburtstag: "1980-01-01" };
const regulaer = { id: "r", geburtstag: "1990-01-01" };

const faelle = [
  ["Jugendliche, Nachtdienst", jugend, nacht, MITTWOCH],
  ["Jugendliche, Beginn vor 6 Uhr", jugend, { ...frueh, start: "05:00", ende: "13:00" }, MITTWOCH],
  ["Jugendliche, 12,5 h", jugend, lang, MITTWOCH],
  ["Jugendliche, Samstag", jugend, frueh, SAMSTAG],
  ["Jugendliche, Sonntag", jugend, frueh, SONNTAG],
  ["Jugendliche, Frühdienst werktags", jugend, frueh, MITTWOCH],
  ["Mutterschutz, Nachtdienst", mutter, nacht, MITTWOCH],
  ["Mutterschutz, Sonntag", mutter, frueh, SONNTAG],
  ["Mutterschutz, Frühdienst werktags", mutter, frueh, MITTWOCH],
  ["Schwerbehindert, 12,5 h", sb, lang, MITTWOCH],
  ["Schwerbehindert, 8 h", sb, frueh, MITTWOCH],
  ["ohne Schutzmerkmal, Nachtdienst", regulaer, nacht, MITTWOCH],
];

describe("Planprüfung und Warndialog lesen dieselbe Schutzquelle", () => {
  it("beide Verbraucher gehen über schutzEinsatz, keiner hält eine eigene Fassung", () => {
    expect(funktion("hindernisBefunde")).toContain("schutzEinsatz(");
    expect(funktion("pruefen")).toContain("schutzEinsatz(");
    const ohneKommentare = app.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(ohneKommentare).not.toMatch(/\bschutzBefunde\(/);
  });

  it.each(faelle)("%s: dieselben Regeln, dieselbe Bewertung", (_n, person, dienst, datum) => {
    const roh = schutzBefunde(person, dienst, datum);
    const e = schutzEinsatz(person, dienst, datum);
    expect(e.map((x) => x.regel)).toEqual(roh.map((x) => x.regel));
    expect(e.map((x) => x.text)).toEqual(roh.map((x) => x.text));
    for (let i = 0; i < roh.length; i++) {
      // Verbote sind Rechtsverstöße, Pflichten „auf Verlangen" und Ausnahmen Achtung
      expect(e[i].stufe).toBe(roh[i].hart ? "recht" : "achtung");
      // Die Prüfansicht zeigt dieselbe Bewertung als Farbe
      expect(e[i].schwere).toBe(roh[i].hart ? "danger" : "warn");
    }
  });

  it("die erwarteten Konstellationen", () => {
    expect(schutzEinsatz(jugend, nacht, MITTWOCH).map((x) => [x.regel, x.stufe])).toEqual(
      expect.arrayContaining([["JArbSchG § 14", "recht"]]));
    expect(schutzEinsatz(jugend, lang, MITTWOCH).map((x) => x.regel)).toContain("JArbSchG § 8");
    expect(schutzEinsatz(jugend, frueh, SAMSTAG).map((x) => [x.regel, x.stufe])).toEqual([["JArbSchG §§ 16–17", "achtung"]]);
    expect(schutzEinsatz(mutter, nacht, MITTWOCH).map((x) => x.regel)).toContain("MuSchG § 5");
    expect(schutzEinsatz(mutter, frueh, SONNTAG).map((x) => [x.regel, x.stufe])).toEqual([["MuSchG § 6", "recht"]]);
    expect(schutzEinsatz(sb, lang, MITTWOCH).map((x) => [x.regel, x.stufe])).toEqual([["SGB IX § 207", "achtung"]]);
  });

  it("ohne Schutzmerkmal und bei erlaubten Diensten gibt es keinen Befund", () => {
    expect(schutzEinsatz(regulaer, nacht, MITTWOCH)).toEqual([]);
    expect(schutzEinsatz(jugend, frueh, MITTWOCH)).toEqual([]);
    expect(schutzEinsatz(mutter, frueh, MITTWOCH)).toEqual([]);
    expect(schutzEinsatz(sb, frueh, MITTWOCH)).toEqual([]);
  });

  it("Grenzfälle: Volljährigkeit, Bestandsdaten ohne Angaben", () => {
    // Am Tag des 18. Geburtstags gilt das Jugendarbeitsschutzgesetz nicht mehr
    expect(schutzEinsatz({ geburtstag: "2008-10-14" }, nacht, MITTWOCH)).toEqual([]);
    expect(schutzEinsatz({ geburtstag: "2008-10-15" }, nacht, MITTWOCH).map((x) => x.regel)).toContain("JArbSchG § 14");
    // Wiederholter Aufruf liefert dasselbe (keine versteckten Zustände) und verändert die Eingaben nicht
    const p = { ...jugend }, d = { ...nacht };
    expect(schutzEinsatz(p, d, MITTWOCH)).toEqual(schutzEinsatz(p, d, MITTWOCH));
    expect(p).toEqual(jugend); expect(d).toEqual(nacht);
  });

  describe("Fehlendes Geburtsdatum ist nicht bewertbar, nicht zulässig", () => {
    const ohne = { id: "x" };
    const hinweis = (p, d, t) => schutzEinsatz(p, d, t).filter((b) => b.offen);

    it("Nachtdienst ohne Geburtsdatum: Hinweis, kein Rechtsverstoß", () => {
      const h = hinweis(ohne, nacht, MITTWOCH);
      expect(h.length).toBe(1);
      expect(h[0].stufe).toBe("hinweis");
      expect(h[0].schwere).toBe("warn");
      expect(h[0].text).toContain("Geburtsdatum");
      expect(schutzEinsatz(ohne, nacht, MITTWOCH).some((b) => b.stufe === "recht")).toBe(false);
    });
    it("auch Dienst vor 6 Uhr und über acht Stunden", () => {
      expect(hinweis(ohne, { ...frueh, start: "05:00", ende: "13:00" }, MITTWOCH).length).toBe(1);
      expect(hinweis(ohne, lang, MITTWOCH).length).toBe(1);
    });
    it("bei einem Dienst, den Jugendliche leisten dürften, schweigt die Prüfung", () => {
      expect(schutzEinsatz(ohne, frueh, MITTWOCH)).toEqual([]);
    });
    it("ungültiges oder leeres Geburtsdatum ist genauso nicht bewertbar", () => {
      for (const g of ["2026-02-30", "2010-13-01", "abc", "", "01.03.2010", null])
        expect(hinweis({ geburtstag: g }, nacht, MITTWOCH).length, String(g)).toBe(1);
      expect(hinweis({ geburtsdatum: "2010-02-30" }, nacht, MITTWOCH).length).toBe(1);
    });
    it("das Alias-Feld geburtsdatum genügt", () => {
      expect(schutzEinsatz({ geburtsdatum: "1990-01-01" }, nacht, MITTWOCH)).toEqual([]);
    });
    it("bekannte Geburtsdaten verhalten sich wie vorher", () => {
      expect(hinweis(jugend, nacht, MITTWOCH)).toEqual([]);
      expect(schutzEinsatz(jugend, nacht, MITTWOCH).map((x) => x.stufe)).toContain("recht");  // unter 18, unzulässig
      expect(schutzEinsatz(jugend, frueh, MITTWOCH)).toEqual([]);                             // unter 18, zulässig
      expect(schutzEinsatz({ geburtstag: "2008-10-14" }, nacht, MITTWOCH)).toEqual([]);       // genau 18
      expect(schutzEinsatz({ geburtstag: "2008-10-15" }, nacht, MITTWOCH).length).toBeGreaterThan(0);  // einen Tag vor 18
      expect(schutzEinsatz(regulaer, nacht, MITTWOCH)).toEqual([]);                            // Erwachsene
    });
    it("beide Verbraucher melden es; die Prüfansicht je Person nur einmal", () => {
      const f = funktion("pruefen");
      expect(f).toContain("b.offen");
      expect(f).toContain("datenGemeldet");
      expect(f).not.toMatch(/alterHeute === null \|\|/);
    });
    it("die Meldung hat eine Registerregel (vorläufig, höchstens Hinweis)", () => {
      expect(regelIdFuerBefund({ art: "schutz", quelle: "JArbSchG (Geburtsdatum)" })).toBe("JARBSCHG-DATEN-01");
    });
  });

  it("jeder Schutzbefund des Dialogs hat eine Regel im Register (Quelle als Schlüssel)", () => {
    for (const [, p, d, t] of faelle)
      for (const b of schutzEinsatz(p, d, t))
        expect(regelIdFuerBefund({ art: "schutz", quelle: b.regel }), b.regel).not.toBeNull();
  });

  it("ein Schutzbefund ist im Dialog nie niedriger bewertet als in der Planprüfung", () => {
    const rang = { hinweis: 0, achtung: 1, recht: 2 };
    const sRang = { warn: 1, danger: 2 };
    for (const [, p, d, t] of faelle)
      for (const b of schutzEinsatz(p, d, t)) expect(rang[b.stufe]).toBe(sRang[b.schwere]);
  });
});

describe("Nicht bewertbar ist nie erfüllt (Besetzung vorbehaltener Aufgaben)", () => {
  const hat = () => false;

  it("eine Aufgabe ohne Qualifikation meldet offen und gedeckt:true", () => {
    const u = aufgabeGedeckt({ name: "Pflegeplanung" }, [], hat);
    expect(u.offen).toBe(true);
    expect(u.gedeckt).toBe(true);
  });

  it("die Planprüfung lässt das nicht als erfüllt durchgehen", () => {
    const u = aufgabeGedeckt({ name: "Pflegeplanung" }, [], hat);
    expect(aufgabeSchwere(u)).toBe("warn");
    expect(aufgabeSchwere(u)).not.toBeNull();
  });

  it("gedeckt und bewertbar: kein Befund", () => {
    const u = aufgabeGedeckt({ name: "X", qualifikationId: "q" }, [{}], () => true);
    expect(aufgabeSchwere(u)).toBeNull();
  });

  it("nicht gedeckt: Rechtsverstoß-Farbe", () => {
    const u = aufgabeGedeckt({ name: "X", qualifikationId: "q" }, [], hat);
    expect(aufgabeSchwere(u)).toBe("danger");
  });

  it("pruefen() wertet über aufgabeSchwere, nicht über gedeckt allein", () => {
    const f = funktion("pruefen");
    expect(f).toContain("aufgabeSchwere(");
    expect(f).not.toMatch(/if \(u\.gedeckt\) continue/);
  });

  it("aufgabeGedeckt selbst bleibt unverändert (bestehendes Verhalten)", () => {
    const u = aufgabeGedeckt({ name: "X", qualifikationId: "q", mindestens: 2 }, [{}], () => true);
    expect(u.gedeckt).toBe(false);
    expect(u.ist).toBe(1);
    expect(u.noetig).toBe(2);
  });
});

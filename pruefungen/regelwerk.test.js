/* ==========================================================================
   REGELWERK

   Der Teil, bei dem ein Fehler unmittelbar rechtliche Folgen hat. Bis August
   2026 gab es dafür keinen einzigen Test.

   Aufruf: npm run pruefung:regeln
   ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  dauer, brutto, pausePflicht, pauseGenuegt,
  ruhezeitStunden, ruhezeitVerletzt,
  werktage, ausgleichszeitraum, tagesgrenzeVerletzt,
  laengsteFolge, folgenUeberGrenze,
  nachtMinuten, istNachtdienst,
  alterAm, schutzBefunde,
  urlaubshinweisFaellig,
  addDays, dow, montag,
} from "../src/regelwerk.js";

const F = { start: "06:00", ende: "14:00", pause: 30 };   //  7,5 h
const S = { start: "14:00", ende: "22:00", pause: 30 };   //  7,5 h
const N = { start: "22:00", ende: "06:00", pause: 45 };   //  7,25 h über Mitternacht
const LANG = { start: "06:00", ende: "18:30", pause: 45 }; // 11,75 h

describe("Dienstdauer", () => {
  it("rechnet die Pause heraus", () => {
    expect(dauer(F)).toBe(7.5);
    expect(brutto(F)).toBe(8);
  });
  it("versteht Dienste über Mitternacht", () => {
    expect(dauer(N)).toBe(7.25);
    expect(brutto(N)).toBe(8);
  });
});

describe("§ 4 ArbZG — Ruhepausen", () => {
  it("verlangt ab sechs Stunden dreißig Minuten", () => {
    expect(pausePflicht(6)).toBe(0);
    expect(pausePflicht(6.5)).toBe(30);
  });
  it("verlangt ab neun Stunden fünfundvierzig", () => {
    expect(pausePflicht(9)).toBe(30);
    expect(pausePflicht(9.5)).toBe(45);
  });
  it("erkennt eine zu kurze Pause", () => {
    expect(pauseGenuegt(F)).toBe(true);
    expect(pauseGenuegt({ start: "06:00", ende: "18:00", pause: 30 })).toBe(false);
    expect(pauseGenuegt({ start: "06:00", ende: "18:00", pause: 45 })).toBe(true);
  });
});

describe("§ 5 ArbZG — Ruhezeit", () => {
  it("misst über Mitternacht korrekt", () => {
    /* Spät bis 22:00, am Folgetag Früh ab 06:00 — acht Stunden dazwischen. */
    expect(ruhezeitStunden("2026-08-03", S, F)).toBe(8);
  });
  it("erkennt die Unterschreitung von elf Stunden", () => {
    expect(ruhezeitVerletzt({ ruhezeit: 11 }, "2026-08-03", S, F)).toBe(true);
  });
  it("lässt Spät auf Spät zu", () => {
    /* 22:00 bis 14:00 des Folgetags sind sechzehn Stunden. */
    expect(ruhezeitStunden("2026-08-03", S, S)).toBe(16);
    expect(ruhezeitVerletzt({ ruhezeit: 11 }, "2026-08-03", S, S)).toBe(false);
  });
  it("berücksichtigt die verkürzte Ruhezeit der Pflege", () => {
    /* Zehn Stunden sind in Pflege und Klinik unter Bedingungen zulässig. */
    const knapp = ruhezeitStunden("2026-08-03", { start: "14:00", ende: "21:00", pause: 30 }, F);
    expect(knapp).toBe(9);
    expect(ruhezeitVerletzt({ ruhezeit: 11 }, "2026-08-03",
      { start: "14:00", ende: "21:00", pause: 30 }, F)).toBe(true);
    expect(ruhezeitVerletzt({ ruhezeit: 8 }, "2026-08-03",
      { start: "14:00", ende: "21:00", pause: 30 }, F)).toBe(false);
  });
  it("rechnet nach einem Nachtdienst richtig", () => {
    /* Nacht endet am Folgetag um 06:00. Der nächste Frühdienst am selben
       Tag um 06:00 wäre null Stunden Ruhezeit. */
    expect(ruhezeitStunden("2026-08-03", N, F, 1)).toBe(0);
  });
});

describe("§ 3 ArbZG — Ausgleichszeitraum", () => {
  it("zählt Werktage ohne Sonntag", () => {
    /* Montag 2026-08-03 bis Sonntag 2026-08-09 = sechs Werktage. */
    expect(werktage("2026-08-03", "2026-08-09")).toBe(6);
    expect(dow("2026-08-03")).toBe(0);
  });

  it("hält acht Stunden im Schnitt für zulässig", () => {
    /* Jeden Werktag genau acht Stunden. */
    const erg = ausgleichszeitraum(
      (d) => (dow(d) < 6 ? 8 : 0), "2026-08-29", { wochen: 4 });
    expect(erg.eingehalten).toBe(true);
    expect(erg.durchschnitt).toBe(8);
    expect(erg.ueberhang).toBe(0);
  });

  it("erkennt die Überschreitung im Durchschnitt", () => {
    /* Jeden Werktag zehn Stunden — die Tagesgrenze ist eingehalten, der
       Durchschnitt nicht. Genau der Fall, den die Anwendung bisher nicht
       fand: Woche für Woche sah der Plan zulässig aus. */
    const erg = ausgleichszeitraum(
      (d) => (dow(d) < 6 ? 10 : 0), "2026-08-29", { wochen: 4 });
    expect(erg.eingehalten).toBe(false);
    expect(erg.durchschnitt).toBe(10);
    expect(erg.ueberhang).toBeGreaterThan(0);
  });

  it("lässt Mehrarbeit zu, die später ausgeglichen wird", () => {
    /* Das ist der Zweck der Vorschrift: Die ersten beiden Wochen zehn
       Stunden je Werktag, die letzten beiden sechs. Im Durchschnitt acht —
       also zulässig, obwohl einzelne Wochen deutlich darüber lagen. */
    const erste = new Set();
    for (let d = "2026-08-03"; d <= "2026-08-16"; d = addDays(d, 1)) erste.add(d);
    const stunden = (d) => {
      if (dow(d) >= 6) return 0;             // Sonntag frei
      return erste.has(d) ? 10 : 6;
    };
    const erg = ausgleichszeitraum(stunden, "2026-08-30", { wochen: 4 });
    expect(erg.von).toBe("2026-08-03");
    expect(erg.werktage).toBe(24);
    /* 12 Werktage × 10 h + 12 × 6 h = 192 h, zulässig sind 24 × 8 = 192 h. */
    expect(erg.stunden).toBe(192);
    expect(erg.zulaessig).toBe(192);
    expect(erg.eingehalten).toBe(true);
    expect(erg.ueberhang).toBe(0);
  });

  it("nennt den Überhang in Stunden, nicht nur ein Ja oder Nein", () => {
    const erg = ausgleichszeitraum(
      (d) => (dow(d) < 6 ? 9 : 0), "2026-08-29", { wochen: 4 });
    /* 24 Werktage × 1 Stunde zu viel. */
    expect(erg.werktage).toBe(24);
    expect(erg.ueberhang).toBe(24);
  });

  it("nimmt den vollen Zeitraum von 24 Wochen als Vorgabe", () => {
    const erg = ausgleichszeitraum(() => 0, "2026-08-29");
    expect(erg.von).toBe(addDays("2026-08-29", -(24 * 7 - 1)));
  });

  it("prüft die Tagesgrenze von zehn Stunden getrennt", () => {
    expect(tagesgrenzeVerletzt(10)).toBe(false);
    expect(tagesgrenzeVerletzt(10.5)).toBe(true);
    expect(tagesgrenzeVerletzt(dauer(LANG))).toBe(true);
  });
});

describe("Dienstserien", () => {
  const dienstTage = new Set([
    "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
    "2026-08-07", "2026-08-08", "2026-08-09",           // sieben in Folge
    "2026-08-12", "2026-08-13",
  ]);
  const hat = (d) => dienstTage.has(d);

  it("findet die längste Folge", () => {
    const erg = laengsteFolge(hat, "2026-08-01", "2026-08-31");
    expect(erg.laenge).toBe(7);
    expect(erg.ab).toBe("2026-08-03");
  });
  it("meldet Folgen über der Grenze", () => {
    const ueber = folgenUeberGrenze(hat, "2026-08-01", "2026-08-31", 6);
    expect(ueber).toHaveLength(1);
    expect(ueber[0].laenge).toBe(7);
    expect(ueber[0].bis).toBe("2026-08-09");
  });
  it("meldet nichts, wenn die Grenze eingehalten ist", () => {
    expect(folgenUeberGrenze(hat, "2026-08-01", "2026-08-31", 7)).toHaveLength(0);
  });
});

describe("§ 6 ArbZG — Nachtarbeit", () => {
  it("erkennt einen Nachtdienst", () => {
    expect(istNachtdienst(N)).toBe(true);
    expect(istNachtdienst(F)).toBe(false);
  });
  it("zählt nur die Minuten in der Nachtzeit", () => {
    /* 22:00–06:00: eine Stunde vor 23 Uhr zählt nicht, 23–06 sind sieben. */
    expect(nachtMinuten(N)).toBe(7 * 60);
  });
  it("wertet einen Spätdienst bis 23:30 als knapp keinen Nachtdienst", () => {
    expect(nachtMinuten({ start: "15:00", ende: "23:30", pause: 30 })).toBe(30);
    expect(istNachtdienst({ start: "15:00", ende: "23:30", pause: 30 })).toBe(false);
  });
});

describe("Besondere Personengruppen", () => {
  it("rechnet das Alter am Stichtag", () => {
    expect(alterAm("2009-08-15", "2026-08-14")).toBe(16);
    expect(alterAm("2009-08-14", "2026-08-14")).toBe(17);
    expect(alterAm(null, "2026-08-14")).toBe(null);
  });
  it("verbietet Jugendlichen den Nachtdienst", () => {
    const b = schutzBefunde({ geburtstag: "2009-05-01" }, N, "2026-08-04");
    expect(b.some((x) => x.hart && x.regel.startsWith("JArbSchG"))).toBe(true);
  });
  it("lässt Erwachsenen den Nachtdienst", () => {
    expect(schutzBefunde({ geburtstag: "1990-05-01" }, N, "2026-08-04")).toHaveLength(0);
  });
  it("schützt Schwangere vor Nachtarbeit", () => {
    const b = schutzBefunde({ mutterschutz: true }, N, "2026-08-04");
    expect(b.some((x) => x.hart && x.regel.startsWith("MuSchG"))).toBe(true);
  });
  it("weist bei Schwerbehinderung auf das Freistellungsrecht hin", () => {
    const b = schutzBefunde({ schwerbehindert: true }, LANG, "2026-08-04");
    expect(b).toHaveLength(1);
    expect(b[0].hart).toBe(false);
  });
});

describe("§ 7 BUrlG — Hinweispflicht", () => {
  it("meldet ab Oktober offenen Urlaub", () => {
    const h = urlaubshinweisFaellig(8, "2026-10-01", null);
    expect(h.faellig).toBe(true);
    expect(h.verfaelltAm).toBe("2026-12-31");
    expect(h.uebertragBis).toBe("2027-03-31");
  });
  it("schweigt vor Oktober", () => {
    expect(urlaubshinweisFaellig(8, "2026-06-01", null).faellig).toBe(false);
  });
  it("schweigt ohne offenen Urlaub", () => {
    expect(urlaubshinweisFaellig(0, "2026-11-01", null).faellig).toBe(false);
  });
  it("warnt nicht zweimal im selben Jahr", () => {
    expect(urlaubshinweisFaellig(8, "2026-11-01", "2026-10-05").faellig).toBe(false);
  });
  it("warnt im Folgejahr wieder", () => {
    expect(urlaubshinweisFaellig(8, "2027-10-01", "2026-10-05").faellig).toBe(true);
  });
});

describe("Datumsgrundlagen", () => {
  it("nimmt Montag als Wochenbeginn", () => {
    expect(dow("2026-08-03")).toBe(0);
    expect(dow("2026-08-09")).toBe(6);
    expect(montag("2026-08-06")).toBe("2026-08-03");
  });
  it("rechnet über Monatsgrenzen", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

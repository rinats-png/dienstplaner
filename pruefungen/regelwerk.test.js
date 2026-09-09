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
  letzterSonntag, uhrsprung, uhrversatz, dauerAm, bruttoAm,
  vorsorgeFaellig, ersatzruhetage, freieSonntage,
  FREIE_SONNTAGE_MIN,
  verbindlichkeit, regelMaengel, EBENEN, BEZUEGE,
  kompetenzStand, kompetenzGilt, kompetenzMaengel, KOMPETENZ_VORLAUF,
  fehlendeKompetenzen,
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

/* ==========================================================================
   Zusammenspiel — die Regeln so, wie die Anwendung sie benutzt
   ========================================================================== */

describe("Schutzvorschriften am Plan", () => {
  const jugendlich = { geburtstag: "2010-03-01", nachname: "Jung" };
  const erwachsen = { geburtstag: "1985-03-01", nachname: "Alt" };

  it("meldet für Jugendliche den Nachtdienst als harten Verstoß", () => {
    const b = schutzBefunde(jugendlich, N, "2026-08-04");
    const hart = b.filter((x) => x.hart);
    expect(hart.length).toBeGreaterThan(0);
    expect(hart[0].regel).toMatch(/JArbSchG/);
  });

  it("meldet für Jugendliche auch den langen Dienst", () => {
    const b = schutzBefunde(jugendlich, LANG, "2026-08-04");
    expect(b.some((x) => x.regel === "JArbSchG § 8" && x.hart)).toBe(true);
  });

  it("lässt den Frühdienst für Jugendliche zu", () => {
    /* Früh ab 06:00 ist die Grenze — nicht davor. */
    expect(schutzBefunde(jugendlich, F, "2026-08-04")).toHaveLength(0);
  });

  it("wird am 18. Geburtstag still", () => {
    /* Wer am Diensttag 18 ist, fällt nicht mehr unter das JArbSchG. */
    const p = { geburtstag: "2008-08-04", nachname: "Grenzfall" };
    expect(alterAm(p.geburtstag, "2026-08-04")).toBe(18);
    expect(schutzBefunde(p, N, "2026-08-04")).toHaveLength(0);
  });

  it("prüft ohne Geburtsdatum nichts Altersbezogenes", () => {
    expect(schutzBefunde({ nachname: "Ohne" }, N, "2026-08-04")).toHaveLength(0);
  });

  it("lässt Erwachsene ohne Merkmal in Ruhe", () => {
    expect(schutzBefunde(erwachsen, N, "2026-08-04")).toHaveLength(0);
    expect(schutzBefunde(erwachsen, LANG, "2026-08-04")).toHaveLength(0);
  });
});

describe("Urlaubshinweis im Jahreslauf", () => {
  it("schweigt das ganze Jahr über und meldet sich im Oktober", () => {
    const monate = ["01", "05", "09"].map((mm) =>
      urlaubshinweisFaellig(6, `2026-${mm}-15`, null).faellig);
    expect(monate).toEqual([false, false, false]);
    expect(urlaubshinweisFaellig(6, "2026-10-01", null).faellig).toBe(true);
    expect(urlaubshinweisFaellig(6, "2026-12-20", null).faellig).toBe(true);
  });

  it("nennt beide Fristen — Verfall und mögliche Übertragung", () => {
    const h = urlaubshinweisFaellig(3, "2026-11-02", null);
    expect(h.verfaelltAm).toBe("2026-12-31");
    expect(h.uebertragBis).toBe("2027-03-31");
    expect(h.text).toContain("3 Urlaubstage");
  });

  it("formuliert den Einzelfall im Singular", () => {
    expect(urlaubshinweisFaellig(1, "2026-11-02", null).text).toContain("1 Urlaubstag verfällt");
  });
});

/* ==========================================================================
   SOMMERZEIT

   Zweimal im Jahr hat der Tag nicht vierundzwanzig Stunden. Gerechnet wurde
   bis hierher stur mit der Uhrzeit — beide Male falsch.
   ========================================================================== */
describe("Sommerzeit", () => {
  const N = { start: "22:00", ende: "06:00", pause: 45 };
  const F = { start: "06:00", ende: "14:00", pause: 30 };

  it("findet den letzten Sonntag im Monat", () => {
    expect(letzterSonntag(2026, 3)).toBe("2026-03-29");
    expect(letzterSonntag(2026, 10)).toBe("2026-10-25");
    expect(letzterSonntag(2027, 3)).toBe("2027-03-28");
    expect(letzterSonntag(2027, 10)).toBe("2027-10-31");
    /* 2028 endet der März auf einem Freitag — der letzte Sonntag ist der 26. */
    expect(letzterSonntag(2028, 3)).toBe("2028-03-26");
  });

  it("kennt die Richtung des Sprungs", () => {
    expect(uhrsprung("2026-03-29")).toBe(-60);
    expect(uhrsprung("2026-10-25")).toBe(60);
    expect(uhrsprung("2026-03-28")).toBe(0);
    expect(uhrsprung("2026-08-14")).toBe(0);
  });

  it("rechnet den Nachtdienst über die Frühjahrsumstellung mit sieben Stunden", () => {
    /* 28.03. 22:00 bis 29.03. 06:00 — die Uhr springt um zwei auf drei. */
    expect(dauer(N)).toBe(7.25);
    expect(dauerAm("2026-03-28", N)).toBe(6.25);
  });

  it("rechnet ihn über die Herbstumstellung mit neun", () => {
    expect(dauerAm("2026-10-24", N)).toBe(8.25);
  });

  it("lässt alle anderen Nächte unberührt", () => {
    expect(dauerAm("2026-03-27", N)).toBe(dauer(N));
    expect(dauerAm("2026-08-14", N)).toBe(dauer(N));
    /* Der Umstellungstag selbst ohne Nachtdienst: ein Frühdienst am
       Sonntagmorgen liegt nach dem Sprung und ist normal lang. */
    expect(dauerAm("2026-03-29", F)).toBe(dauer(F));
  });

  it("rechnet die Ruhezeit über die Umstellung richtig", () => {
    /* Spätdienst bis 22:00 am 28.03., Frühdienst ab 06:00 am 29.03.:
       auf der Uhr acht Stunden, in Wirklichkeit sieben. */
    const S = { start: "14:00", ende: "22:00", pause: 30 };
    expect(ruhezeitStunden("2026-03-28", S, F)).toBe(7);
    /* Im Oktober umgekehrt. */
    expect(ruhezeitStunden("2026-10-24", S, F)).toBe(9);
    expect(ruhezeitStunden("2026-08-14", S, F)).toBe(8);
  });

  it("zählt den Sprung nur, wenn er echt im Fenster liegt", () => {
    /* Ein Dienst, der genau um 02:00 endet, ist noch nicht betroffen. */
    const bisZwei = { start: "22:00", ende: "02:00", pause: 0 };
    expect(dauerAm("2026-03-28", bisZwei)).toBe(dauer(bisZwei));
    /* Einer, der um 02:00 beginnt, auch nicht. */
    const abZwei = { start: "02:00", ende: "10:00", pause: 0 };
    expect(dauerAm("2026-03-29", abZwei)).toBe(dauer(abZwei));
    /* Einer, der ihn umschließt, schon. */
    const drueber = { start: "01:00", ende: "09:00", pause: 0 };
    expect(dauerAm("2026-03-29", drueber)).toBe(dauer(drueber) - 1);
  });
});

describe("§ 6 Abs. 3 ArbZG — arbeitsmedizinische Untersuchung", () => {
  const basis = { nachtTage: 60, alter: 34, letzte: "2024-01-15", stichtag: "2026-09-08" };

  it("wer selten nachts arbeitet, ist kein Nachtarbeitnehmer", () => {
    const r = vorsorgeFaellig({ ...basis, nachtTage: 47 });
    expect(r.nachtarbeitnehmer).toBe(false);
    expect(r.faellig).toBe(false);
  });

  it("ab 48 Nachtdiensten im Jahr greift die Vorschrift", () => {
    expect(vorsorgeFaellig({ ...basis, nachtTage: 48 }).nachtarbeitnehmer).toBe(true);
  });

  it("unter fünfzig gilt der Abstand von drei Jahren", () => {
    const r = vorsorgeFaellig({ ...basis, letzte: "2024-01-15" });
    expect(r.abstand).toBe(36);
    expect(r.faellig_am).toBe("2027-01-15");
    expect(r.faellig).toBe(false);
  });

  it("ab fünfzig jährlich — dieselbe Untersuchung ist dann längst fällig", () => {
    const r = vorsorgeFaellig({ ...basis, alter: 52, letzte: "2024-01-15" });
    expect(r.abstand).toBe(12);
    expect(r.faellig_am).toBe("2025-01-15");
    expect(r.faellig).toBe(true);
  });

  it("ohne jede Untersuchung ist das Angebot sofort fällig", () => {
    expect(vorsorgeFaellig({ ...basis, letzte: null }).faellig).toBe(true);
  });

  it("unbekanntes Alter wird als unter fünfzig behandelt, nicht als Fehler", () => {
    expect(vorsorgeFaellig({ ...basis, alter: null }).abstand).toBe(36);
  });
});

describe("§ 11 Abs. 3 ArbZG — Ersatzruhetag", () => {
  const keinFeiertag = () => false;

  it("ein Sonntagsdienst mit freien Tagen daneben ist ausgeglichen", () => {
    /* 2026-09-06 ist ein Sonntag. */
    const dienst = (d) => d === "2026-09-06";
    const r = ersatzruhetage(dienst, keinFeiertag, "2026-08-30", "2026-09-13");
    expect(r.offen).toEqual([]);
    expect(r.belegt.length).toBe(1);
  });

  it("ohne freien Tag im Zeitraum bleibt der Anspruch offen", () => {
    const r = ersatzruhetage(() => true, keinFeiertag, "2026-08-30", "2026-09-13");
    expect(r.offen.length).toBeGreaterThan(0);
    expect(r.offen[0].art).toBe("sonntag");
  });

  it("ein freier Tag deckt nicht zwei Sonntage", () => {
    /* Der Zeitraum enthält genau zwei Sonntage — 06. und 13.09.2026 — und
       dazwischen einen einzigen freien Tag. */
    const frei = "2026-09-09";
    const dienst = (d) => d !== frei;
    const r = ersatzruhetage(dienst, keinFeiertag, "2026-09-01", "2026-09-15");
    expect(r.belegt).toEqual([frei]);
    expect(r.offen.length).toBe(1);
  });

  it("ein Sonntag ist kein Ersatzruhetag für einen Sonntag", () => {
    /* Gearbeitet wird am Sonntag, dem 06.09. Der einzige freie Tag im
       ganzen Zeitraum ist der Folgesonntag — und der zählt nach
       § 11 Abs. 3 nicht als Ersatzruhetag. */
    const dienst = (d) => d !== "2026-09-13";
    const r = ersatzruhetage(dienst, keinFeiertag, "2026-09-06", "2026-09-12");
    expect(r.belegt).toEqual([]);
    expect(r.offen.map((x) => x.datum)).toEqual(["2026-09-06"]);
  });

  it("der Feiertag hat acht Wochen statt zwei", () => {
    /* Ein Feiertag am Donnerstag, der einzige freie Tag liegt zwanzig Tage
       später. An Sonntagen wird nicht gearbeitet, damit kein zweiter
       Anspruch um denselben freien Tag konkurriert. */
    const feiertag = "2026-09-03";
    const frei = addDays(feiertag, 20);
    const dienst = (d) => d !== frei && dow(d) !== 6;
    const r = ersatzruhetage(dienst, (d) => d === feiertag, feiertag, addDays(feiertag, 30));
    expect(r.offen).toEqual([]);
    expect(r.belegt).toEqual([frei]);
  });

  it("derselbe Abstand reicht für einen Sonntag nicht", () => {
    /* Gleiche Lage, nur ist der Anspruch jetzt ein Sonntag: zwanzig Tage
       liegen außerhalb der zwei Wochen. */
    const sonntag = "2026-09-06";
    const frei = addDays(sonntag, 20);
    const dienst = (d) => d !== frei;
    const r = ersatzruhetage(dienst, keinFeiertag, sonntag, sonntag);
    expect(r.offen.map((x) => x.datum)).toEqual([sonntag]);
  });

  it("dreizehn Tage danach genügen, vierzehn nicht mehr", () => {
    const sonntag = "2026-09-06";
    const genau = (n) => {
      const frei = addDays(sonntag, n);
      return ersatzruhetage((d) => d !== frei, keinFeiertag, sonntag, sonntag).offen.length;
    };
    expect(genau(13)).toBe(0);
    expect(genau(14)).toBe(1);
  });

  it("der engere Anspruch greift zuerst zu", () => {
    /* Sonntag und Feiertag, aber nur ein freier Tag — und der liegt so, dass
       beide ihn erreichen. Der Sonntag muss ihn bekommen, sonst reißt die
       kürzere Frist. */
    const sonntag = "2026-09-06";
    const feiertag = "2026-09-03";
    const frei = "2026-09-10";
    const dienst = (d) => d !== frei;
    const r = ersatzruhetage(dienst, (d) => d === feiertag, "2026-09-01", "2026-09-15");
    expect(r.belegt).toEqual([frei]);
    const offenArten = r.offen.map((x) => x.art);
    expect(offenArten).toContain("feiertag");
    expect(r.offen.some((x) => x.datum === sonntag)).toBe(false);
  });
});

describe("§ 11 Abs. 1 ArbZG — fünfzehn freie Sonntage", () => {
  it("verlangt fünfzehn", () => {
    expect(FREIE_SONNTAGE_MIN).toBe(15);
  });

  it("wer nie sonntags arbeitet, hält die Zahl mühelos", () => {
    const r = freieSonntage(() => false, 2026);
    expect(r.verletzt).toBe(false);
    expect(r.frei).toBeGreaterThanOrEqual(52);
  });

  it("wer jeden Sonntag arbeitet, verletzt sie", () => {
    const r = freieSonntage(() => true, 2026);
    expect(r.gearbeitet).toBeGreaterThanOrEqual(52);
    expect(r.verletzt).toBe(true);
  });

  it("im laufenden Jahr zählen die offenen Sonntage noch mit", () => {
    /* Bis Ende Januar jeden Sonntag gearbeitet — das ist noch kein Verstoß,
       der Rest des Jahres steht ja offen. */
    const r = freieSonntage(() => true, 2026, "2026-01-31");
    expect(r.verletzt).toBe(false);
    expect(r.offen).toBeGreaterThan(40);
  });

  it("ist der Rest des Jahres zu kurz, steht der Verstoß fest", () => {
    const r = freieSonntage(() => true, 2026, "2026-11-30");
    expect(r.verletzt).toBe(true);
  });
});

describe("Verbindlichkeit einer Anforderung", () => {
  it("ohne Angabe gilt betrieblich, nicht gesetzlich", () => {
    /* Die vorsichtige Richtung: Wer nichts hinterlegt, bekommt keine
       Gesetzesbehauptung geschenkt. */
    const v = verbindlichkeit({ name: "Irgendwas" });
    expect(v.ebene).toBe("betrieb");
    expect(v.gesetzlich).toBe(false);
  });

  it("eine unbekannte Ebene fällt ebenfalls auf betrieblich zurück", () => {
    expect(verbindlichkeit({ ebene: "eu-verordnung" }).ebene).toBe("betrieb");
  });

  it("Bundesrecht ist gesetzlich und gilt überall", () => {
    const v = verbindlichkeit({ ebene: "bund" }, { land: "BY" });
    expect(v.gesetzlich).toBe(true);
    expect(v.giltHier).toBe(true);
  });

  it("Tarif bindet, ist aber kein Gesetz", () => {
    const v = verbindlichkeit({ ebene: "tarif" });
    expect(v.gesetzlich).toBe(false);
    expect(v.wort).not.toBe("unzulässig");
  });

  it("Landesrecht greift nur im genannten Land", () => {
    const q = { ebene: "land", laender: ["NW", "HE"], harteSperre: true };
    expect(verbindlichkeit(q, { land: "NW" }).giltHier).toBe(true);
    expect(verbindlichkeit(q, { land: "BY" }).giltHier).toBe(false);
  });

  it("und eine Sperre wirkt dort nicht, wo die Anforderung nicht gilt", () => {
    const q = { ebene: "land", laender: ["NW"], harteSperre: true };
    expect(verbindlichkeit(q, { land: "NW" }).sperrt).toBe(true);
    expect(verbindlichkeit(q, { land: "BY" }).sperrt).toBe(false);
  });

  it("Ebene und Bezug sind unabhängig — § 34a ist Bundesrecht und trotzdem tätigkeitsbezogen", () => {
    const v = verbindlichkeit({ ebene: "bund", bezug: "taetigkeit" });
    expect(v.gesetzlich).toBe(true);
    expect(v.bezug).toBe("taetigkeit");
  });

  it("jede Ebene und jeder Bezug hat einen Klartext", () => {
    for (const k of Object.keys(EBENEN)) expect(EBENEN[k].label.length).toBeGreaterThan(3);
    for (const k of Object.keys(BEZUEGE)) expect(BEZUEGE[k].label.length).toBeGreaterThan(3);
  });
});

describe("Mängel in der Regel selbst", () => {
  const arten = (q) => regelMaengel(q).map((x) => x.art);

  it("eine Sperre ohne Grundlage wird gemeldet", () => {
    expect(arten({ name: "X", harteSperre: true, ebene: "bund" })).toContain("ohneGrundlage");
  });

  it("eine saubere Bundesregel hat keinen Mangel", () => {
    expect(arten({ name: "Pflegefachkraft", harteSperre: true, ebene: "bund",
      bezug: "person", grundlage: "§ 4 PflBG" })).toEqual([]);
  });

  it("eine betriebliche Sperre wird als solche ausgewiesen, nicht verboten", () => {
    const a = regelMaengel({ name: "Erste Hilfe", harteSperre: true, ebene: "betrieb",
      grundlage: "Gefährdungsbeurteilung" });
    expect(a.map((x) => x.art)).toContain("sperreOhneGesetz");
    expect(a.find((x) => x.art === "sperreOhneGesetz").schwere).toBe("info");
  });

  it("eine tätigkeitsbezogene Anforderung, die jeden Dienst sperrt, ist der § 34a-Fehler", () => {
    const a = arten({ name: "Sachkunde § 34a GewO", harteSperre: true, ebene: "bund",
      bezug: "taetigkeit", grundlage: "§ 34a Abs. 1a GewO" });
    expect(a).toContain("pauschaleSperre");
  });

  it("Landesrecht ohne Bundesland wird gemeldet", () => {
    expect(arten({ name: "Pflegeassistenz", ebene: "land", grundlage: "Landesrecht" }))
      .toContain("landOhneLand");
  });

  it("Landesrecht mit Bundesland nicht", () => {
    expect(arten({ name: "Pflegeassistenz", ebene: "land", laender: ["NW"], grundlage: "Landesrecht" }))
      .not.toContain("landOhneLand");
  });

  it("ein betrieblich gewähltes Intervall unter einer gesetzlichen Pflicht wird benannt", () => {
    expect(arten({ name: "Hygieneunterweisung", ebene: "bund", grundlage: "§ 23 IfSG",
      gueltigMonate: 12, intervallBetrieblich: true })).toContain("intervallBetrieblich");
  });
});

/* ==========================================================================
   KOMPETENZEN

   Eine Qualifikation sagt, was jemand ist. Eine Kompetenz sagt, was jemand
   an einer bestimmten Sache darf. Diese Prüfung hält die Grenze fest.
   ========================================================================== */
describe("Kompetenzen", () => {
  const heute = "2026-09-09";

  it("ohne Nachweis fehlt sie", () => {
    expect(kompetenzStand({ id: "k1", name: "Beatmung" }, null, heute).stand).toBe("fehlt");
    expect(kompetenzStand({ id: "k1" }, { ab: null }, heute).stand).toBe("fehlt");
  });

  it("ohne Wiederholungsfrist gilt sie unbefristet", () => {
    const s = kompetenzStand({ id: "k1" }, { ab: "2020-01-01" }, heute);
    expect(s.stand).toBe("gueltig");
    expect(s.unbefristet).toBe(true);
    expect(s.bis).toBe(null);
  });

  it("mit Frist läuft sie ab", () => {
    const k = { id: "k1", wiederholungMonate: 24 };
    expect(kompetenzStand(k, { ab: "2026-06-01" }, heute).stand).toBe("gueltig");
    expect(kompetenzStand(k, { ab: "2024-01-01" }, heute).stand).toBe("abgelaufen");
  });

  it("kurz vorher wird gewarnt", () => {
    const k = { id: "k1", wiederholungMonate: 12 };
    /* Ein Jahr minus dreißig Tage: die Frist läuft in etwa einem Monat ab. */
    const s = kompetenzStand(k, { ab: addDays(heute, -335) }, heute);
    expect(s.stand).toBe("laeuft_ab");
    expect(s.tage).toBeLessThanOrEqual(KOMPETENZ_VORLAUF);
    expect(s.tage).toBeGreaterThanOrEqual(0);
  });

  it("ein ausdrückliches Ende schlägt die Frist", () => {
    const k = { id: "k1", wiederholungMonate: 60 };
    const s = kompetenzStand(k, { ab: "2026-01-01", bis: "2026-03-01" }, heute);
    expect(s.stand).toBe("abgelaufen");
    expect(s.bis).toBe("2026-03-01");
  });

  it("eine zurückgenommene Freigabe zählt nicht mehr", () => {
    const s = kompetenzStand({ id: "k1" },
      { ab: "2020-01-01", zurueckgenommen: "2026-05-05" }, heute);
    expect(s.stand).toBe("fehlt");
    expect(s.zurueckgenommen).toBe("2026-05-05");
  });

  it("kompetenzGilt fasst gültig und laufend zusammen", () => {
    const k = { id: "k1", wiederholungMonate: 12 };
    expect(kompetenzGilt(k, { ab: addDays(heute, -30) }, heute)).toBe(true);
    expect(kompetenzGilt(k, { ab: addDays(heute, -335) }, heute)).toBe(true);
    expect(kompetenzGilt(k, { ab: addDays(heute, -400) }, heute)).toBe(false);
    expect(kompetenzGilt(k, null, heute)).toBe(false);
  });

  it("eine Geräteeinweisung ohne Gerät ist ein Mangel", () => {
    const m = kompetenzMaengel({ id: "k1", name: "Beatmung", art: "geraet" });
    expect(m.some((x) => x.art === "geraetOhneMittel")).toBe(true);
  });

  it("eine Voraussetzung ohne Grundlage ist ein Mangel", () => {
    const m = kompetenzMaengel({ id: "k1", name: "Schalten", pflichtFuer: ["N"] });
    expect(m.some((x) => x.art === "ohneGrundlage")).toBe(true);
  });

  it("eine vollständige Kompetenz hat keine Warnung", () => {
    const m = kompetenzMaengel({ id: "k1", name: "Beatmung", art: "geraet",
      betriebsmittelId: "bm1", pflichtFuer: ["N"], freigabeStelle: "Medizintechnik",
      grundlage: "§ 4 MPBetreibV" });
    expect(m.filter((x) => x.schwere === "warn")).toEqual([]);
  });
});

describe("Kompetenz als Einsatzsperre", () => {
  const heute = "2026-09-09";
  const K = [
    { id: "k1", name: "Beatmung Servo-u", art: "geraet", betriebsmittelId: "bm1",
      wiederholungMonate: 24, pflichtFuer: ["N"], grundlage: "§ 4 MPBetreibV" },
    { id: "k2", name: "Schaltberechtigung", pflichtFuer: [], grundlage: "Betrieblich" },
  ];
  const name = (id) => (id === "bm1" ? "Servo-u 3" : null);

  it("sperrt nur den Dienst, an dem sie hängt", () => {
    expect(fehlendeKompetenzen(K, [], "F", heute, name)).toEqual([]);
    expect(fehlendeKompetenzen(K, [], "N", heute, name).length).toBe(1);
  });

  it("nennt das Gerät und die Grundlage", () => {
    const [f] = fehlendeKompetenzen(K, [], "N", heute, name);
    expect(f.text).toContain("Servo-u 3");
    expect(f.text).toContain("§ 4 MPBetreibV");
    expect(f.text).toContain("fehlt");
  });

  it("wer sie hat, kommt durch", () => {
    const n = [{ kompetenzId: "k1", ab: addDays(heute, -30) }];
    expect(fehlendeKompetenzen(K, n, "N", heute, name)).toEqual([]);
  });

  it("eine abgelaufene Einweisung sperrt wieder, mit Datum", () => {
    const n = [{ kompetenzId: "k1", ab: "2020-01-01" }];
    const [f] = fehlendeKompetenzen(K, n, "N", heute, name);
    expect(f.stand.stand).toBe("abgelaufen");
    expect(f.text).toContain("abgelaufen am");
  });

  it("eine zurückgenommene Freigabe sperrt ebenfalls", () => {
    const n = [{ kompetenzId: "k1", ab: addDays(heute, -30), zurueckgenommen: heute }];
    expect(fehlendeKompetenzen(K, n, "N", heute, name).length).toBe(1);
  });

  it("ohne Kompetenzen im Betrieb ändert sich nichts", () => {
    expect(fehlendeKompetenzen([], [], "N", heute, name)).toEqual([]);
    expect(fehlendeKompetenzen(undefined, undefined, "N", heute, name)).toEqual([]);
  });
});

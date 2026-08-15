/* ==========================================================================
   WAS DER BETREIBER SCHREIBEN DARF

   Er durfte gar nichts. `schreibumfang("betreiber")` fiel auf
   SCHREIBEN_NEIN durch, und `zusammenfuehren` gab daraufhin null zurück —
   jede Änderung aus der Betreiberkonsole endete in „Diese Änderung ist mit
   deiner Rolle nicht zulässig". Tarif ändern, Status setzen, Rechnung
   stellen, Mandant anlegen: alles abgewiesen. Aufgefallen ist es erst, als
   der erste Betreiberzugang tatsächlich benutzt wurde.

   Die Gegenrichtung ist genauso wichtig und der Grund, warum er nicht
   einfach SCHREIBEN_VOLL bekommt: Wer Software verkauft, hat in den
   Dienstplänen und Personalakten seiner Kunden nichts zu suchen. Was hier
   geprüft wird, ist beides — dass das Kaufmännische durchgeht und dass das
   Betriebliche hängen bleibt, auch wenn die Oberfläche es mitschickt.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { schreibumfang, zusammenfuehren, SCHREIBEN_BETREIBER, SCHREIBEN_NEIN }
  from "../netlify/lib/rechte.mjs";

const SITZUNG = { rolle: "betreiber" };

const betrieb = (zusatz = {}) => ({
  id: "m1", name: "Nordwacht", branche: "sicherheit",
  status: "test", tarif: "basis", rabattGrund: 0,
  personen: [{ id: "p1", vorname: "Ines", nachname: "Roth", rolle: "leitung",
    wochenstunden: 40, anschrift: "Hafenstraße 14" }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
  abweichungen: { "p1|2026-08-03": "F" },
  abwesenheiten: [{ id: "a1", personId: "p1", art: "krank", von: "2026-08-01",
    bis: "2026-08-03", notiz: "Grippe" }],
  zyklus: { wochen: 4, tage: ["F", "F", "-", "-"] },
  ...zusatz,
});

const bestand = (zusatz = {}) => ({
  version: 8, stand: 3,
  betreiber: { firma: "CENTRIC Software", steuersatz: 19 },
  tarife: [{ id: "basis", jeStandort: 89 }],
  rechnungen: [],
  mandanten: [betrieb()],
  ...zusatz,
});

describe("Schreibumfang", () => {
  it("der Betreiber hat einen eigenen Umfang", () => {
    expect(schreibumfang("betreiber")).toBe(SCHREIBEN_BETREIBER);
  });
  it("eine unbekannte Rolle weiterhin keinen", () => {
    expect(schreibumfang("hausmeister")).toBe(SCHREIBEN_NEIN);
    /* Auch ohne Rolle: Die Vorgabe „kunde" setzt zusammenfuehren, nicht
       diese Funktion. Wer sie einzeln aufruft, bekommt kein Recht
       geschenkt. */
    expect(schreibumfang(undefined)).toBe(SCHREIBEN_NEIN);
  });
});

describe("Kaufmännisches geht durch", () => {
  it("Tarif, Status und Stichtag", () => {
    const alt = bestand();
    const neu = bestand({ mandanten: [betrieb({ status: "aktiv", tarif: "pro",
      stichtag: "2026-12-31" })] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten[0].status).toBe("aktiv");
    expect(e.mandanten[0].tarif).toBe("pro");
    expect(e.mandanten[0].stichtag).toBe("2026-12-31");
  });

  it("Sonderpreis, kostenlose Zeit und Aussetzung", () => {
    const alt = bestand();
    const neu = bestand({ mandanten: [betrieb({ preisgestaltung: {
      sonderpreis: { betrag: 420, bezeichnung: "Rahmenvertrag" },
      freiBis: "2026-09-30",
      aussetzungen: [{ von: "2026-11", bis: "2027-01", grund: "Umbau" }] } })] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten[0].preisgestaltung.sonderpreis.betrag).toBe(420);
    expect(e.mandanten[0].preisgestaltung.freiBis).toBe("2026-09-30");
    expect(e.mandanten[0].preisgestaltung.aussetzungen).toHaveLength(1);
  });

  it("die eigenen Felder des Betreibers", () => {
    const alt = bestand();
    const neu = bestand({
      tarife: [{ id: "basis", jeStandort: 99 }],
      rechnungen: [{ nummer: "202608-M1", brutto: 105.91 }],
      betreiber: { firma: "CENTRIC Software", steuersatz: 19, zahlungsziel: 30 },
    });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.tarife[0].jeStandort).toBe(99);
    expect(e.rechnungen).toHaveLength(1);
    expect(e.betreiber.zahlungsziel).toBe(30);
  });

  it("ein neuer Mandant wird vollständig übernommen", () => {
    const alt = bestand();
    const frisch = { ...betrieb(), id: "m2", name: "Lindenhof" };
    const neu = bestand({ mandanten: [betrieb(), frisch] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten).toHaveLength(2);
    expect(e.mandanten[1].name).toBe("Lindenhof");
    /* Er kommt aus der Konsole und hat noch keinen Inhalt, den man vor
       seinem eigenen Erzeuger schützen müsste. */
    expect(e.mandanten[1].personen).toHaveLength(1);
  });

  it("ein entfernter Mandant verschwindet", () => {
    const alt = bestand({ mandanten: [betrieb(), { ...betrieb(), id: "m2" }] });
    const neu = bestand({ mandanten: [betrieb()] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten).toHaveLength(1);
    expect(e.mandanten[0].id).toBe("m1");
  });
});

describe("Betriebliches bleibt liegen", () => {
  /* Der Kern. Die Oberfläche des Betreibers schickt den ganzen Bestand
     zurück — was sie versehentlich verändert, darf nicht ankommen. */

  it("Personal bleibt unberührt", () => {
    const alt = bestand();
    const neu = bestand({ mandanten: [betrieb({
      personen: [{ id: "p1", vorname: "Ines", nachname: "Roth", rolle: "mitarbeiter",
        wochenstunden: 12, anschrift: "Woanders 1" },
      { id: "p9", vorname: "Erfunden", nachname: "Person", rolle: "leitung" }] })] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten[0].personen).toHaveLength(1);
    expect(e.mandanten[0].personen[0].rolle).toBe("leitung");
    expect(e.mandanten[0].personen[0].wochenstunden).toBe(40);
    expect(e.mandanten[0].personen[0].anschrift).toBe("Hafenstraße 14");
  });

  it("Schichtzuweisungen bleiben unberührt", () => {
    const alt = bestand();
    const neu = bestand({ mandanten: [betrieb({ abweichungen: {} })] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten[0].abweichungen).toEqual({ "p1|2026-08-03": "F" });
  });

  it("Abwesenheiten samt Grund bleiben unberührt", () => {
    const alt = bestand();
    const neu = bestand({ mandanten: [betrieb({ abwesenheiten: [] })] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten[0].abwesenheiten).toHaveLength(1);
    expect(e.mandanten[0].abwesenheiten[0].notiz).toBe("Grippe");
  });

  it("Dienstarten und Schichtfolge bleiben unberührt", () => {
    const alt = bestand();
    const neu = bestand({ mandanten: [betrieb({
      dienstarten: [{ id: "F", name: "Umbenannt", start: "05:00", ende: "13:00" }],
      zyklus: { wochen: 1, tage: ["-"] } })] });
    const e = zusammenfuehren(alt, neu, SITZUNG);
    expect(e.mandanten[0].dienstarten[0].name).toBe("Früh");
    expect(e.mandanten[0].dienstarten[0].start).toBe("06:00");
    expect(e.mandanten[0].zyklus.wochen).toBe(4);
  });
});

/* ==========================================================================
   Und die Gegenprobe: Was kann der Mandant, den der Betreiber anlegt?

   Ein neu angelegter Betrieb liegt im selben Raum wie die übrigen und wie
   die Betreiberdaten. Wenn seine Leitung dort nicht arbeiten kann, ist das
   Anlegen sinnlos — und wenn sie zu viel kann, ist es gefährlich.
   ========================================================================== */

const LEITUNG = { rolle: "leitung", mandantId: "m2", person: "p1" };

/* Was die Leitung von m2 ausgeliefert bekommt: ihren eigenen Betrieb, die
   Betreiberangaben für die Rechnungsansicht — aber nicht die Betriebe der
   anderen. Genau so schickt sie es zurück. */
const sichtLeitung = (zusatz = {}) => ({
  version: 8, stand: 3,
  betreiber: { firma: "CENTRIC Software", steuersatz: 19 },
  tarife: [{ id: "basis", jeStandort: 89 }],
  rechnungen: [],
  mandanten: [{ ...betrieb(), id: "m2", name: "Lindenhof" }],
  ...zusatz,
});

describe("Der frisch angelegte Mandant kann arbeiten", () => {
  const gespeichert = bestand({
    mandanten: [betrieb(), { ...betrieb(), id: "m2", name: "Lindenhof" }],
  });

  it("Personal anlegen und Dienste zuweisen geht", () => {
    const geschickt = sichtLeitung({ mandanten: [{ ...betrieb(), id: "m2",
      name: "Lindenhof",
      personen: [...betrieb().personen, { id: "p2", vorname: "Neu", nachname: "Kraft",
        rolle: "mitarbeiter", wochenstunden: 30 }],
      abweichungen: { "p1|2026-08-03": "F", "p2|2026-08-04": "F" } }] });
    const e = zusammenfuehren(gespeichert, geschickt, LEITUNG);
    const m2 = e.mandanten.find((m) => m.id === "m2");
    expect(m2.personen).toHaveLength(2);
    expect(m2.abweichungen["p2|2026-08-04"]).toBe("F");
  });

  it("der fremde Betrieb bleibt unangetastet", () => {
    /* m1 war in der Antwort gar nicht enthalten. Käme er nicht zurück,
       hätte das erste Speichern eines Kunden alle übrigen gelöscht. */
    const e = zusammenfuehren(gespeichert, sichtLeitung(), LEITUNG);
    const m1 = e.mandanten.find((m) => m.id === "m1");
    expect(m1).toBeTruthy();
    expect(m1.name).toBe("Nordwacht");
    expect(m1.personen).toHaveLength(1);
  });

  it("die Betreiberdaten bleiben erhalten", () => {
    const ohne = sichtLeitung();
    delete ohne.tarife; delete ohne.rechnungen;   // wie bei Rollen ohne billing.view
    const e = zusammenfuehren(gespeichert, ohne, LEITUNG);
    expect(e.tarife[0].jeStandort).toBe(89);
    expect(e.rechnungen).toEqual([]);
  });

  it("aber am eigenen Vertrag ändert sie nichts", () => {
    /* Der Versuch, sich selbst kostenlos zu stellen. Die Leitung sieht
       diese Felder — schreiben darf sie sie nicht. */
    const geschickt = sichtLeitung({ mandanten: [{ ...betrieb(), id: "m2",
      name: "Lindenhof", status: "test", tarif: "enterprise", rabattGrund: 0.5,
      stichtag: "2099-12-31",
      preisgestaltung: { sonderpreis: { betrag: 0, bezeichnung: "geschenkt" },
        freiBis: "2099-12-31" } }] });
    const e = zusammenfuehren(gespeichert, geschickt, LEITUNG);
    const m2 = e.mandanten.find((m) => m.id === "m2");
    expect(m2.status).toBe("test");          // war schon so — unverändert
    expect(m2.tarif).toBe("basis");          // Aufstieg abgewiesen
    expect(m2.rabattGrund).toBe(0);
    expect(m2.stichtag).toBeUndefined();
    expect(m2.preisgestaltung).toBeUndefined();
    /* Der Name darf sie ändern — der kostet nichts. */
    expect(m2.name).toBe("Lindenhof");
  });

  it("und der Betreiber ändert ihn sehr wohl", () => {
    const vomBetreiber = bestand({ mandanten: [betrieb(),
      { ...betrieb(), id: "m2", name: "Lindenhof", tarif: "enterprise",
        preisgestaltung: { freiBis: "2026-12-31" } }] });
    const e = zusammenfuehren(gespeichert, vomBetreiber, SITZUNG);
    const m2 = e.mandanten.find((m) => m.id === "m2");
    expect(m2.tarif).toBe("enterprise");
    expect(m2.preisgestaltung.freiBis).toBe("2026-12-31");
  });
});

describe("Randfälle", () => {
  it("ohne gespeicherten Stand wird der übermittelte genommen", () => {
    /* Der allererste Schreibvorgang in einen leeren Raum. Gäbe es hier
       null zurück, ließe sich ein Betrieb nie anlegen. */
    const neu = bestand();
    expect(zusammenfuehren(null, neu, SITZUNG)).toBe(neu);
  });

  it("ohne übermittelten Stand wird nichts geschrieben", () => {
    expect(zusammenfuehren(bestand(), null, SITZUNG)).toBe(null);
  });

  it("fehlt die Mandantenliste, bleibt keine übrig", () => {
    /* Bewusst so: Eine Oberfläche, die keine Mandanten schickt, hat sie
       gelöscht. Das ist in der Konsole eine mögliche Handlung. */
    const e = zusammenfuehren(bestand(), { stand: 4 }, SITZUNG);
    expect(e.mandanten).toEqual([]);
    expect(e.stand).toBe(4);
  });
});

/* ==========================================================================
   SICHERUNGEN — betriebsbezogen, getrennt ausgedünnt, sicher zurückgespielt

   Die reine Logik aus server/lib/sicherungen.mjs. Den HTTP-Weg (Rollen,
   Bremse, Konfliktschutz, Protokoll) prüft pruefungen/sicherungen.mjs.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { SICHERUNG_ROLLEN, WIEDERHERSTELLEN_ROLLEN, MARKE, markeNeu, eigenerBetrieb,
  betriebsSicherung, betriebAusSicherung, kontingent, auszuduennen, listenEintrag,
  betriebWiederherstellen, vollausgabeBetrieb } from "../server/lib/sicherungen.mjs";

const person = (id, rolle, zusatz = {}) => ({ id, vorname: id, nachname: id, rolle, bereich: "ALLE",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...zusatz });
const betrieb = (id, name, personen, zusatz = {}) => ({ id, name, personen, dienstarten: [{ id: "F" }],
  abweichungen: {}, protokoll: [{ text: `${name} Protokoll` }], aenderungen: [{ id: `${id}-c` }],
  status: "aktiv", tarif: "pro", preisgestaltung: { sonderpreis: null }, ...zusatz });
const raum = () => ({ version: 9, stand: 7, session: null,
  protokoll: [{ text: "Raumprotokoll" }], tarife: [{ id: "pro" }], rechnungen: [{ nr: 1 }],
  betreiber: { firma: "CENTRIC" },
  mandanten: [
    betrieb("m-a", "Nordwacht", [person("a-l", "leitung")]),
    betrieb("m-b", "Lindenhof", [person("b-l", "leitung"), person("b-p", "planer"),
      person("b-x", "mitarbeiter", { kalenderGeheim: "neu-geheim-b-x", pushSchluessel: { endpoint: "neu" } }),
      person("b-y", "mitarbeiter", { anonym: true, nachname: "Ausgeschieden b-y", email: "" })]),
    betrieb("m-c", "Steinbach", [person("c-l", "leitung")]),
  ] });
const LEITUNG_B = { rolle: "leitung", person: "b-l", betrieb: 1 };
const kopie = (x) => JSON.parse(JSON.stringify(x));
const ids = (b) => b.mandanten.map((m) => m.id);

describe("Rollen", () => {
  it("Sicherungen verwalten Leitung und der eigene Probierraum, wiederherstellen nur die Leitung", () => {
    expect(SICHERUNG_ROLLEN).toEqual(["leitung", "kunde"]);
    expect(WIEDERHERSTELLEN_ROLLEN).toEqual(["leitung"]);
    for (const r of ["mitarbeiter", "betriebsrat", "subplaner", "planer", "betreiber"])
      expect(SICHERUNG_ROLLEN.includes(r) || WIEDERHERSTELLEN_ROLLEN.includes(r), r).toBe(false);
  });
});

describe("Zeitmarke", () => {
  it("Datum, Uhrzeit und vier Zufallsziffern; ältere Marken bleiben gültig", () => {
    const m = markeNeu(new Date("2026-10-18T12:34:56Z"), () => 0.0421);
    expect(m).toBe("2026-10-18-12-34-56-0421");
    expect(MARKE.test(m)).toBe(true);
    expect(MARKE.test("2026-10-18-12-34-56")).toBe(true);
    for (const falsch of ["2026-10-18", "../x", "2026-10-18-12-34-56-04210", "1-2-3"])
      expect(MARKE.test(falsch), falsch).toBe(false);
  });
});

describe("Sicherung anlegen: nur der eigene Betrieb", () => {
  it("enthält den eigenen Betrieb und keinen anderen", () => {
    const b = raum();
    const s = betriebsSicherung(b, eigenerBetrieb(b, LEITUNG_B), { stand: 7, durch: "Lea" });
    expect(s).toMatchObject({ umfang: "betrieb", mandantId: "m-b", stand: 7, durch: "Lea" });
    expect(s.mandant.id).toBe("m-b");
    expect(s.mandanten).toBeUndefined();
    const text = JSON.stringify(s);
    for (const fremd of ["Nordwacht", "Steinbach", "Raumprotokoll", "rechnungen", "CENTRIC"])
      expect(text, fremd).not.toContain(fremd);
  });
  it("der Betrieb kommt aus der Sitzung, nicht aus einer Angabe des Aufrufers", () => {
    expect(eigenerBetrieb(raum(), { rolle: "leitung", betrieb: 2 }).betrieb.id).toBe("m-c");
    expect(eigenerBetrieb(null, LEITUNG_B)).toBeNull();
  });
  it("aus einer Sicherung nur der Betrieb mit genau dieser Kennung", () => {
    const b = raum();
    const s = betriebsSicherung(b, eigenerBetrieb(b, LEITUNG_B));
    expect(betriebAusSicherung(s, "m-b").name).toBe("Lindenhof");
    expect(betriebAusSicherung(s, "m-a")).toBeNull();
    expect(betriebAusSicherung(b, "m-a").name).toBe("Nordwacht");               // raumweit (alt/automatisch)
    expect(betriebAusSicherung({ ...b, mandanten: [...b.mandanten, b.mandanten[1]] }, "m-b")).toBeNull();
    expect(betriebAusSicherung(null, "m-b")).toBeNull();
  });
});

describe("Ausdünnen je Kontingent", () => {
  const e = (marke, meta) => ({ key: `sicherung:r:${marke}`, marke, meta });
  it("Kontingente: automatisch, je Betrieb, raumweit alt", () => {
    expect(kontingent({ automatisch: "ja" })).toBe("automatisch");
    expect(kontingent({ mandantId: "m-b" })).toBe("betrieb:m-b");
    expect(kontingent({})).toBe("raum");
  });
  it("eine Flut manueller Sicherungen verdrängt keine automatische und keine eines anderen Betriebs", () => {
    const auto = [e("2026-10-18-08-00-00", { automatisch: "ja" }), e("2026-10-18-09-00-00", { automatisch: "ja" })];
    const andere = [e("2026-10-18-07-00-00-0001", { mandantId: "m-a" })];
    const flut = Array.from({ length: 40 }, (_, i) =>
      e(`2026-10-18-10-${String(i).padStart(2, "0")}-00-0000`, { mandantId: "m-b" }));
    const weg = auszuduennen([...auto, ...andere, ...flut]);
    for (const x of [...auto, ...andere]) expect(weg).not.toContain(x.key);
    expect(weg.length).toBe(19);                      // 40 − 20 neueste − 1 jüngste ältere des Tages
    expect(weg.every((k) => flut.some((x) => x.key === k))).toBe(true);
  });
  it("je Kontingent: zwanzig neueste, von älteren Tagen die jüngste", () => {
    const liste = [
      ...Array.from({ length: 20 }, (_, i) => e(`2026-10-18-10-${String(i).padStart(2, "0")}-00`, {})),
      e("2026-10-17-09-00-00", {}), e("2026-10-17-08-00-00", {}), e("2026-10-16-08-00-00", {}),
    ];
    expect(auszuduennen(liste)).toEqual(["sicherung:r:2026-10-17-08-00-00"]);
  });
});

describe("Liste", () => {
  it("eigene Sicherungen mit Namen, raumweite ohne Namen, fremde gar nicht", () => {
    expect(listenEintrag("m1", { mandantId: "m-b", durch: "Lea", zeit: "z" }, "m-b"))
      .toMatchObject({ umfang: "betrieb", durch: "Lea", automatisch: false });
    expect(listenEintrag("m2", { mandantId: "m-a", durch: "Ana" }, "m-b")).toBeNull();
    expect(listenEintrag("m3", { durch: "Ana" }, "m-b")).toMatchObject({ umfang: "raum", durch: null });
    expect(listenEintrag("m4", { automatisch: "ja", durch: "automatisch vor Verlust von 40 %" }, "m-b"))
      .toMatchObject({ umfang: "raum", automatisch: true, durch: "automatisch vor Verlust von 40 %" });
  });
});

describe("Wiederherstellen: nur der eigene Betrieb, an seiner Stelle", () => {
  /* Die Sicherung: Lindenhof mit altem Namen, einer Rolle, die es heute so
     nicht gibt, alten Geheimnissen und den Personendaten von b-y. */
  const alteSicherung = () => {
    const b = raum();
    const m = kopie(b.mandanten[1]);
    m.name = "Lindenhof (alt)";
    m.status = "test"; m.tarif = "gratis"; m.preisgestaltung = { sonderpreis: { betrag: 0 } };
    m.protokoll = [{ text: "altes Protokoll" }];
    m.personen = m.personen.map((p) => {
      if (p.id === "b-x") return { ...p, kalenderGeheim: "alt-kompromittiert", pushSchluessel: { endpoint: "alt" } };
      if (p.id === "b-y") return { ...p, anonym: false, nachname: "Echtname", email: "y@privat.de" };
      return p;
    });
    m.personen.push(person("b-z", "mitarbeiter", { kalenderGeheim: "geloescht-geheim" }));
    return { umfang: "betrieb", mandantId: "m-b", mandant: m, erzeugt: "2026-10-10T08:00:00Z" };
  };
  const zurueck = (jetzt = raum(), sicherung = alteSicherung(), sitzung = LEITUNG_B, o = {}) =>
    betriebWiederherstellen(jetzt, sicherung, sitzung, { marke: "2026-10-10-08-00-00-0001",
      sicherungsZeit: "2026-10-10T08:00:00Z", heute: new Date("2026-10-18T10:00:00Z"), ...o });

  it("ersetzt genau den eigenen Betrieb; andere Betriebe, Reihenfolge, Kennungen und oberste Ebene bleiben", () => {
    const vorher = raum();
    const { bestand } = zurueck(vorher);
    expect(ids(bestand)).toEqual(ids(vorher));
    expect(bestand.mandanten[0]).toEqual(vorher.mandanten[0]);
    expect(bestand.mandanten[2]).toEqual(vorher.mandanten[2]);
    expect(bestand.mandanten[1].name).toBe("Lindenhof (alt)");
    for (const f of ["protokoll", "tarife", "rechnungen", "betreiber", "version", "stand", "session"])
      expect(bestand[f], f).toEqual(vorher[f]);
  });
  it("Vertragsfelder bleiben, wie sie jetzt sind", () => {
    const m = zurueck().bestand.mandanten[1];
    expect(m.status).toBe("aktiv");
    expect(m.tarif).toBe("pro");
    expect(m.preisgestaltung).toEqual({ sonderpreis: null });
  });
  it("Protokoll und Planänderungen bleiben; die Wiederherstellung kommt dazu", () => {
    const m = zurueck().bestand.mandanten[1];
    expect(m.protokoll[0].text).toMatch(/aus der Sicherung 2026-10-10-08-00-00-0001 wiederhergestellt/);
    expect(m.protokoll.slice(1)).toEqual(raum().mandanten[1].protokoll);
    expect(m.aenderungen).toEqual(raum().mandanten[1].aenderungen);
  });
  it("anonymisierte Personen bleiben anonymisiert", () => {
    const y = zurueck().bestand.mandanten[1].personen.find((p) => p.id === "b-y");
    expect(y).toEqual(raum().mandanten[1].personen.find((p) => p.id === "b-y"));
    expect(JSON.stringify(zurueck().bestand)).not.toContain("y@privat.de");
  });
  it("Geheimnisse springen nicht auf alte Werte; bei Personen, die es nicht mehr gibt, fehlen sie", () => {
    const personen = zurueck().bestand.mandanten[1].personen;
    const x = personen.find((p) => p.id === "b-x");
    expect(x.kalenderGeheim).toBe("neu-geheim-b-x");
    expect(x.pushSchluessel).toEqual({ endpoint: "neu" });
    const z = personen.find((p) => p.id === "b-z");
    expect(z.kalenderGeheim).toBeUndefined();
    expect(JSON.stringify(personen)).not.toContain("alt-kompromittiert");
  });
  /* Seit WP-26 (H3): Eine Sicherung von vor dem letzten Löschlauf wird nicht
     mehr abgelehnt — der tägliche Datenschutzlauf hätte sonst fast jede
     gesperrt —, sondern beim Zurückspielen erneut durch den Löschlauf
     geschickt. Was nach den Fristen fort sein muss, kommt nicht zurück. */
  it("Sicherung von vor dem letzten Löschlauf: zurückgespielt, Fristabgelaufenes bleibt gelöscht", () => {
    const jetzt = raum();
    jetzt.mandanten[1].aufbewahrung = { zuletztGeraeumt: "2026-10-12" };
    const s = alteSicherung();
    s.mandant.einstempeln = { "b-x|2023-01-05": { start: "06:00", ende: "14:00" }, "b-x|2026-10-01": { start: "06:01" } };
    s.mandant.abwesenheiten = [{ id: "w-alt", personId: "b-x", art: "krank", von: "2026-05-02", bis: "2026-05-03", notiz: "Grippe" },
      { id: "w-neu", personId: "b-x", art: "krank", von: "2026-10-02", bis: "2026-10-03", notiz: "Erkältung" }];
    /* Gelöscht wird nur, wenn der Datenschutzlauf auf „an" steht (WP-26, N-3). */
    const erg = zurueck(jetzt, s, LEITUNG_B, { datenschutz: "an" });
    expect(erg.bestand, JSON.stringify(erg)).toBeTruthy();
    const m = erg.bestand.mandanten[1];
    expect(m.name).toBe("Lindenhof (alt)");
    expect(Object.keys(m.einstempeln)).toEqual(["b-x|2026-10-01"]);
    expect(m.abwesenheiten.find((a) => a.id === "w-alt").notiz).toBe("");
    expect(m.abwesenheiten.find((a) => a.id === "w-neu").notiz).toBe("Erkältung");
    expect(erg.fristen).toMatchObject({ modus: "an", geloescht: true });
  });
  it("N-3: bei Datenschutzlauf „vorschau“ oder „aus“ löscht das Zurückspielen nichts, es meldet nur", () => {
    for (const modus of ["vorschau", "aus"]) {
      const jetzt = raum();
      const s = alteSicherung();
      s.mandant.einstempeln = { "b-x|2023-01-05": { start: "06:00", ende: "14:00" }, "b-x|2026-10-01": { start: "06:01" } };
      const erg = zurueck(jetzt, s, LEITUNG_B, { datenschutz: modus });
      expect(Object.keys(erg.bestand.mandanten[1].einstempeln).sort(), modus).toEqual(["b-x|2023-01-05", "b-x|2026-10-01"]);
      expect(erg.fristen, modus).toMatchObject({ modus, geloescht: false });
      expect(erg.fristen.faellig, modus).toBeGreaterThan(0);
      expect(erg.fristen.text, modus).toMatch(/nicht gelöscht/);
    }
  });
  /* WP-06, M1: Die Fristen laufen NACH den Stempeln. Sonst brächte die
     Wiederherstellung Stempel zurück, die der Datenschutzlauf gelöscht hat
     (Art. 5 Abs. 1 lit. e DSGVO) — oder behielte den heutigen, schon abgelaufenen. */
  it("WP-06 M1: Wiederherstellen im Modus „an“ — Stempel jenseits der Frist bleiben gelöscht, heutige junge bleiben (Reihenfolge)", () => {
    const jetzt = raum();
    jetzt.mandanten[1].einstempeln = { "b-x|2023-01-05": { start: "05:00", ende: "13:00" }, "b-x|2026-10-15": { start: "06:00", ende: "14:00" } };
    jetzt.mandanten[1].erfassung = { "b-x|2023-01-05": { start: "05:00", ende: "13:00", bestaetigt: true, grund: "" } };
    const s = alteSicherung();
    s.mandant.einstempeln = { "b-x|2023-02-01": { start: "06:00", ende: "14:00" }, "b-x|2026-10-01": { start: "06:01", ende: "14:00" } };
    s.mandant.erfassung = { "b-x|2023-02-01": { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" } };
    const erg = zurueck(jetzt, s, LEITUNG_B, { datenschutz: "an" });
    const m = erg.bestand.mandanten[1];
    expect(Object.keys(m.einstempeln).sort()).toEqual(["b-x|2026-10-01", "b-x|2026-10-15"]);
    expect(Object.keys(m.erfassung || {})).toEqual([]);
    expect(erg.stempelBehalten).toBe(2);
  });
  it("WP-06: im Modus „vorschau“ bleiben die heutigen Stempel (auch abgelaufene) erhalten, nichts geht verloren", () => {
    const jetzt = raum();
    jetzt.mandanten[1].einstempeln = { "b-x|2023-01-05": { start: "05:00", ende: "13:00" }, "b-x|2026-10-15": { start: "06:00", ende: "14:00" } };
    const s = alteSicherung();
    s.mandant.einstempeln = { "b-x|2026-10-01": { start: "06:01", ende: "14:00" } };
    const erg = zurueck(jetzt, s, LEITUNG_B, { datenschutz: "vorschau" });
    expect(Object.keys(erg.bestand.mandanten[1].einstempeln).sort()).toEqual(["b-x|2023-01-05", "b-x|2026-10-01", "b-x|2026-10-15"]);
  });
  it("N-3: der Stichtag ist der Tag in Berlin, nicht in UTC", () => {
    const erg = zurueck(raum(), alteSicherung(), LEITUNG_B,
      { datenschutz: "an", heute: new Date("2026-12-31T23:30:00Z") });             // Berlin: 1. Januar 2027
    expect(erg.bestand.mandanten[1].aufbewahrung.zuletztGeraeumt).toBe("2027-01-01");
  });
  it("N-1: eine ungültige Altfrist löscht beim Zurückspielen nie — gemeldet statt geräumt", () => {
    const jetzt = raum();
    jetzt.mandanten[1].aufbewahrung = { plandatenMonate: 1.5 };
    const s = alteSicherung();
    s.mandant.einstempeln = { "b-x|2023-01-05": { start: "06:00", ende: "14:00" } };
    const erg = zurueck(jetzt, s, LEITUNG_B, { datenschutz: "an" });
    expect(Object.keys(erg.bestand.mandanten[1].einstempeln)).toEqual(["b-x|2023-01-05"]);
    expect(erg.fristen.text).toMatch(/Nicht nach Fristen bereinigt/);
  });
  it("eine Sicherung holt keine Rolle zurück, die die Leitung nicht vergeben dürfte", () => {
    const s = alteSicherung();
    s.mandant.personen = s.mandant.personen.map((p) => (p.id === "b-x" ? { ...p, rolle: "betreiber" } : p));
    const erg = zurueck(raum(), s);
    expect(erg.status).toBe(403);
  });
  it("eine Sicherung eines anderen Betriebs passt nicht", () => {
    const b = raum();
    const fremd = betriebsSicherung(b, eigenerBetrieb(b, { rolle: "leitung", betrieb: 0 }));
    expect(zurueck(raum(), fremd).status).toBe(404);
  });
  it("aus einer raumweiten Sicherung kommt nur der eigene Betrieb", () => {
    const alt = raum();
    alt.mandanten = alt.mandanten.map((m) => ({ ...m, name: `${m.name} (alt)` }));
    const { bestand } = zurueck(raum(), alt);
    expect(bestand.mandanten.map((m) => m.name)).toEqual(["Nordwacht", "Lindenhof (alt)", "Steinbach"]);
  });
  it("eine raumweite Sicherung in verschobener Reihenfolge verschiebt nichts", () => {
    const alt = raum();
    alt.mandanten = [alt.mandanten[1], alt.mandanten[0], alt.mandanten[2]];
    const { bestand } = zurueck(raum(), alt);
    expect(ids(bestand)).toEqual(["m-a", "m-b", "m-c"]);
  });
});

describe("Vollausgabe: der eigene Betrieb", () => {
  it("Leitung: der Betrieb ihrer Sitzung", () => {
    expect(vollausgabeBetrieb(raum(), LEITUNG_B).betrieb.id).toBe("m-b");
  });
  it("Sicherungsschlüssel mit Betriebskennung: genau dieser Betrieb", () => {
    expect(vollausgabeBetrieb(raum(), { nurSicherung: true, mandantId: "m-c" }).betrieb.id).toBe("m-c");
    expect(vollausgabeBetrieb(raum(), { nurSicherung: true, mandantId: "weg" }).status).toBe(404);
  });
  it("älterer Schlüssel ohne Kennung: nur in einem Raum mit genau einem Betrieb", () => {
    expect(vollausgabeBetrieb(raum(), { nurSicherung: true }).status).toBe(403);
    const einer = { ...raum(), mandanten: [raum().mandanten[0]] };
    expect(vollausgabeBetrieb(einer, { nurSicherung: true }).betrieb.id).toBe("m-a");
  });
});

/* WP-20 Nachprüfung N8: Wann/Wer der Ortsangaben passt nach dem Wiederherstellen zur wiederhergestellten Liste.
   Hat die Sicherung einen Vermerk, gilt er (die Liste ist der Stand von damals). Fehlt er (Sicherung aus der Zeit
   vor dem Vermerk) und die Liste ändert sich durch das Zurückspielen, gilt die Wiederherstellung selbst als Änderung:
   jetzt, durch die Leitung, die zurückspielt. Bleibt die Liste gleich, bleibt der gespeicherte Vermerk. */
describe("Wiederherstellen: Vermerk der Ortsangaben (WP-20, N8)", () => {
  const ort = (id, radius) => ({ id, name: id, lat: 50, lon: 8, radius });
  const rest = (jetztZusatz, sicherungsZusatz, jetztDienst = [{ id: "F" }], sicherungsDienst = [{ id: "F" }]) => {
    const jetzt = { version: 9, stand: 1, session: null, protokoll: [], mandanten: [
      betrieb("m-b", "Lindenhof", [person("b-l", "leitung")], { dienstarten: jetztDienst, ...jetztZusatz })] };
    const m = betrieb("m-b", "Lindenhof", [person("b-l", "leitung")], { dienstarten: sicherungsDienst, ...sicherungsZusatz });
    const sicherung = { umfang: "betrieb", mandantId: "m-b", mandant: m, erzeugt: "2026-10-10T08:00:00Z" };
    return betriebWiederherstellen(jetzt, sicherung, { rolle: "leitung", person: "b-l", betrieb: 0 },
      { marke: "2026-10-10-08-00-00-0001", sicherungsZeit: "2026-10-10T08:00:00Z", heute: new Date("2026-10-18T10:00:00Z") }).bestand.mandanten[0];
  };
  it("Sicherung mit Vermerk: Liste und Wann/Wer von damals", () => {
    const m = rest({ einsatzorte: [ort("b", 500)], einsatzorteGeaendertAm: "2026-10-15T00:00:00.000Z", einsatzorteGeaendertVon: "p-neu" },
      { einsatzorte: [ort("a", 100)], einsatzorteGeaendertAm: "2026-01-01T00:00:00.000Z", einsatzorteGeaendertVon: "l-alt" });
    expect(m.einsatzorte.map((o) => o.id)).toEqual(["a"]);
    expect([m.einsatzorteGeaendertAm, m.einsatzorteGeaendertVon]).toEqual(["2026-01-01T00:00:00.000Z", "l-alt"]);
  });
  it("Sicherung ohne Vermerk, Liste ändert sich: Zeitpunkt der Wiederherstellung und die Leitung", () => {
    const m = rest({ einsatzorte: [ort("b", 500)], einsatzorteGeaendertAm: "2026-10-15T00:00:00.000Z", einsatzorteGeaendertVon: "p-neu" },
      { einsatzorte: [ort("a", 100)] });
    expect(m.einsatzorte.map((o) => o.id)).toEqual(["a"]);
    expect(m.einsatzorteGeaendertAm).toBe("2026-10-18T10:00:00.000Z");
    expect(m.einsatzorteGeaendertVon).toBe("b-l");
  });
  it("Liste bleibt gleich: der gespeicherte Vermerk bleibt", () => {
    const m = rest({ einsatzorte: [ort("a", 100)], einsatzorteGeaendertAm: "2026-10-15T00:00:00.000Z", einsatzorteGeaendertVon: "p-neu" },
      { einsatzorte: [ort("a", 100)] });
    expect([m.einsatzorteGeaendertAm, m.einsatzorteGeaendertVon]).toEqual(["2026-10-15T00:00:00.000Z", "p-neu"]);
  });
  it("Dienstart mit anderem Ortsmodus als heute und ohne Vermerk in der Sicherung: Wiederherstellung ist die Änderung; gleiche Dienstart bleibt unberührt", () => {
    const m = rest({}, {}, [{ id: "F", ortModus: "standort" }, { id: "G" }],
      [{ id: "F", ortModus: "aussendienst" }, { id: "G" }]);
    const f = m.dienstarten.find((d) => d.id === "F"), g = m.dienstarten.find((d) => d.id === "G");
    expect([f.ortModus, f.ortGeaendertAm, f.ortGeaendertVon]).toEqual(["aussendienst", "2026-10-18T10:00:00.000Z", "b-l"]);
    expect(g).not.toHaveProperty("ortGeaendertAm");
  });
});

describe("Wiederherstellen: Planfreigabe-Pflicht samt Wann/Wer aus dem jetzigen Stand (WP-23, Testlücke WP-19.0)", () => {
  const PFL = ["planFreigabePflicht", "planFreigabePflichtGeaendertAm", "planFreigabePflichtGeaendertVon"];
  const mit = (e) => { const b = raum(); b.mandanten[1].einstellungen = { ruhezeit: 11, ...e }; return b; };
  const zurueck = (jetzt, sicherungE) => {
    const m = kopie(raum().mandanten[1]); m.einstellungen = { ruhezeit: 9, ...sicherungE };
    return betriebWiederherstellen(jetzt, { umfang: "betrieb", mandantId: "m-b", mandant: m, erzeugt: "2026-10-10T08:00:00Z" }, LEITUNG_B,
      { marke: "x", heute: new Date("2026-10-18T10:00:00Z"), datenschutz: "aus" }).bestand.mandanten[1].einstellungen;
  };
  it("jedes der drei Felder kommt aus dem jetzigen Stand — vorhandene bleiben, fehlende werden nicht aus der Sicherung übernommen", () => {
    const jetzt = mit({ planFreigabePflicht: true, planFreigabePflichtGeaendertAm: "2026-10-15T08:00:00.000Z" });
    const e = zurueck(jetzt, { planFreigabePflicht: false, planFreigabePflichtGeaendertAm: "2026-01-01T00:00:00.000Z", planFreigabePflichtGeaendertVon: "alt" });
    expect(e.planFreigabePflicht).toBe(true);
    expect(e.planFreigabePflichtGeaendertAm).toBe("2026-10-15T08:00:00.000Z");
    expect("planFreigabePflichtGeaendertVon" in e).toBe(false);
    expect(e.ruhezeit).toBe(9);                                       // übrige Einstellungen aus der Sicherung
  });
  it("alle drei gesetzt: unverändert wie jetzt", () => {
    const pfl = { planFreigabePflicht: true, planFreigabePflichtGeaendertAm: "2026-10-15T08:00:00.000Z", planFreigabePflichtGeaendertVon: "b-l" };
    const e = zurueck(mit(pfl), { planFreigabePflicht: false });
    for (const f of PFL) expect(e[f], f).toEqual(pfl[f]);
  });
});

/* ==========================================================================
   WIEDERHERSTELLEN MIT DERSELBEN GRENZE WIE SPEICHERN

   Beim gewöhnlichen Speichern nimmt der Server alles, was die Leitung nicht
   schreiben darf, aus dem gespeicherten Stand (vollRueckfuellen, Vertrags-
   felder, BETREIBERSTAMM). Die Wiederherstellung übernahm davon nur die
   Vertragsfelder: Rechnungsstammdaten des Betreibers, Bank-, Steuer- und
   Lohnangaben an Personen und unbekannte Felder kamen aus der Sicherung
   zurück — ein Weg, sie auf einen älteren Stand zurückzudrehen.

   Jetzt aus dem jetzigen Stand: BETREIBERSTAMM, Vertragsfelder, Felder
   außerhalb von VOLL_BETRIEB, an bestehenden Personen Felder außerhalb von
   VOLL_PERSON (eigene Person: PERSONENFELDER). Was die Leitung sieht und
   schreibt, kommt weiter aus der Sicherung; Personen, die es heute nicht
   mehr gibt, kommen vollständig zurück.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";

const LT = { rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m-a" };
const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...extra });

/** Der Stand zum Zeitpunkt der Sicherung. */
const damals = () => ({
  id: "m-a", name: "Haus alt", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh alt" }],
  status: "aktiv", tarif: "basis", preisgestaltung: { sonderpreis: { betrag: 1 } },
  kontakt: "alt@betreiber.de", kontaktName: "Alt", anschrift: "Altweg 1", ustId: "DE-ALT", notiz: "ALT-INTERN",
  raum: "raum-alt", lohnarten: [{ id: "LA-ALT" }], unbekanntImBetrieb: "UNBEKANNT-ALT",
  personen: [
    person("l1", "leitung", { iban: "IBAN-L1-ALT", telefon: "TEL-L1-ALT" }),
    person("a1", "mitarbeiter", { iban: "IBAN-A1-ALT", steuerId: "ST-A1-ALT", sozialversicherung: "SV-A1-ALT", lohn: 1,
      gehalt: 2, emailVorher: "vorher-alt@x.de", notfallkontakt: "NOT-ALT", telefon: "TEL-A1-ALT", unbekannt: "U-A1-ALT",
      kalenderGeheim: "KAL-ALT" }),
    person("weg", "mitarbeiter", { iban: "IBAN-WEG", telefon: "TEL-WEG" }),
  ],
  protokoll: [{ id: "p-alt", text: "alt" }],
});
/** Der jetzige Stand: Betreiber und Personen haben inzwischen geändert. */
const heute = () => ({
  id: "m-a", name: "Haus neu", einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh neu" }],
  status: "aktiv", tarif: "pro", preisgestaltung: { sonderpreis: { betrag: 2 } },
  kontakt: "neu@betreiber.de", kontaktName: "Neu", anschrift: "Neuweg 2", ustId: "DE-NEU", notiz: "NEU-INTERN",
  lohnarten: [{ id: "LA-NEU" }], unbekanntImBetrieb: "UNBEKANNT-NEU",
  personen: [
    person("l1", "leitung", { iban: "IBAN-L1-NEU", telefon: "TEL-L1-NEU" }),
    person("a1", "mitarbeiter", { iban: "IBAN-A1-NEU", steuerId: "ST-A1-NEU", lohn: 3, gehalt: 4,
      emailVorher: "vorher-neu@x.de", telefon: "TEL-A1-NEU", unbekannt: "U-A1-NEU", kalenderGeheim: "KAL-NEU" }),
  ],
  protokoll: [{ id: "p-neu", text: "neu" }],
});
const raum = (m) => ({ version: 9, stand: 1, session: null, mandanten: [m, { id: "m-b", name: "B", personen: [] }] });
const sicherung = () => ({ centric: "sicherung", fassung: 2, umfang: "betrieb", mandantId: "m-a", mandant: damals() });

function wiederhergestellt() {
  const w = betriebWiederherstellen(raum(heute()), sicherung(), LT, { marke: "2026-10-01-08-00-00" });
  expect(w.verweigert, w.verweigert).toBeFalsy();
  return w.bestand.mandanten[0];
}

describe("aus dem jetzigen Stand", () => {
  it("Rechnungsstammdaten des Betreibers (BETREIBERSTAMM); fehlt ein Feld heute, bleibt es weg", () => {
    const m = wiederhergestellt();
    expect([m.kontakt, m.kontaktName, m.anschrift, m.ustId, m.notiz]).toEqual(["neu@betreiber.de", "Neu", "Neuweg 2", "DE-NEU", "NEU-INTERN"]);
    expect(m.lohnarten).toEqual([{ id: "LA-NEU" }]);
    expect("raum" in m).toBe(false);
  });
  it("Vertragsfelder wie bisher", () => {
    const m = wiederhergestellt();
    expect(m.tarif).toBe("pro");
    expect(m.preisgestaltung).toEqual({ sonderpreis: { betrag: 2 } });
  });
  it("unbekannte Felder im Betrieb", () => {
    expect(wiederhergestellt().unbekanntImBetrieb).toBe("UNBEKANNT-NEU");
  });
  it("an bestehenden Personen: Bank, Steuer, Sozialversicherung, Lohn, frühere Adresse, Notfallkontakt, Unbekanntes, Geheimnisse", () => {
    const a1 = wiederhergestellt().personen.find((p) => p.id === "a1");
    expect([a1.iban, a1.steuerId, a1.lohn, a1.gehalt, a1.emailVorher, a1.unbekannt, a1.kalenderGeheim])
      .toEqual(["IBAN-A1-NEU", "ST-A1-NEU", 3, 4, "vorher-neu@x.de", "U-A1-NEU", "KAL-NEU"]);
    /* heute nicht gesetzt: nicht aus der Sicherung zurück */
    expect("sozialversicherung" in a1).toBe(false);
    expect("notfallkontakt" in a1).toBe(false);
  });
});

describe("weiterhin aus der Sicherung", () => {
  it("was die Leitung sieht und schreibt: Betrieb und Personen", () => {
    const m = wiederhergestellt();
    expect(m.name).toBe("Haus alt");
    expect(m.dienstarten).toEqual([{ id: "F", name: "Früh alt" }]);
    expect(m.personen.find((p) => p.id === "a1").telefon).toBe("TEL-A1-ALT");
  });
  it("die eigene Person der Leitung: auch ihre eigenen Angaben (PERSONENFELDER)", () => {
    const l1 = wiederhergestellt().personen.find((p) => p.id === "l1");
    expect([l1.iban, l1.telefon]).toEqual(["IBAN-L1-ALT", "TEL-L1-ALT"]);
  });
  it("eine Person, die es heute nicht mehr gibt, kommt vollständig zurück — ohne technische Geheimnisse", () => {
    const weg = wiederhergestellt().personen.find((p) => p.id === "weg");
    expect([weg.iban, weg.telefon]).toEqual(["IBAN-WEG", "TEL-WEG"]);
  });
  it("Protokoll aus dem jetzigen Stand plus Vermerk; der andere Betrieb unverändert", () => {
    const w = betriebWiederherstellen(raum(heute()), sicherung(), LT, { marke: "2026-10-01-08-00-00" });
    expect(w.bestand.mandanten[0].protokoll.map((p) => p.id)).toEqual(["w-2026-10-01-08-00-00", "p-neu"]);
    expect(w.bestand.mandanten[1]).toEqual({ id: "m-b", name: "B", personen: [] });
  });
  it("raumweite Altsicherung: dieselbe Grenze", () => {
    const alt = { ...raum(damals()), mandanten: [damals(), { id: "m-b", name: "B-alt", personen: [] }] };
    const w = betriebWiederherstellen(raum(heute()), alt, LT, { marke: "2026-10-01-08-00-00" });
    const m = w.bestand.mandanten[0];
    expect([m.ustId, m.notiz, m.name]).toEqual(["DE-NEU", "NEU-INTERN", "Haus alt"]);
    expect(m.personen.find((p) => p.id === "a1").iban).toBe("IBAN-A1-NEU");
    expect(w.bestand.mandanten[1].name).toBe("B");
  });
});

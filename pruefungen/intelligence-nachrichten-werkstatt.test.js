/* ==========================================================================
   INTELLIGENCE — F5 NACHRICHTEN-WERKSTATT (WP-I30 Teil 1)

   Geprüft über die echte Funktion nachrichtenEntwurf (serverseitiger Kern, ohne Route): Schalter aus (Vorgabe), Freigabe,
   Rollenmatrix, Katalog (jede Vorlage mit genauer Ausgabe), Entwurfsregel (unveröffentlichte Tage/Monate), Verbotsprüfung des
   endgültigen Textes, keine Gesundheits-/Abwesenheitsangaben, kein Schreiben, Gateway nur mit Platzhalter-Vorlage, Grenzen, Determinismus.
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nachrichtenEntwurf, NACHRICHTEN_VORLAGEN, F5_GRENZEN, F5_GRUENDE } from "../server/lib/intelligence/funktionen/nachrichten-werkstatt.mjs";
import { funktionEintrag } from "../server/lib/intelligence/positivliste.mjs";
import { TITEL_MAX } from "../server/lib/mitteilungen.mjs";
import { betrieb, bestand, S, sitzung, fold } from "./intelligence-gateway-fixture.mjs";
import { deepFreeze } from "../server/lib/intelligence/felder.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AN = { prozess: () => "an", laufzeit: () => "an" };
const HEUTE = "2026-11-02";

/* Beispieldaten mit Krankabwesenheiten (Grund, Anmerkung), offener Krankmeldung, Klärungsmarkierung, Betriebsratsmitglied. */
const daten = () => {
  const b = betrieb();
  b.abwesenheiten.push({ id: "ab5", personId: "a2", von: "2026-11-05", bis: "2026-11-06", art: "krank", grund: "Magen-Darm", anmerkung: "AU Dr. Klein" });
  b.krankmeldungen = [{ id: "k1", personId: "a3", von: "2026-11-04", bis: "2026-11-04", status: "eingegangen", notiz: "Grippe Fieber" }];
  b.klaerung = { offen: [{ personId: "a3", tag: "2026-11-04" }] };
  return b;
};
const A = {
  schichtwechsel: { vorlage: "schichtwechsel", datum: "2026-11-04", dienstart: "F", einheit: "e1" },
  planaenderung: { vorlage: "planaenderung", datum: "2026-11-04", einheit: "e2" },
  dienstplan_veroeffentlicht: { vorlage: "dienstplan_veroeffentlicht", monat: "2026-11" },
  erinnerung_dienstplan: { vorlage: "erinnerung_dienstplan", monat: "2026-12" },
  dienstbeginn_erinnerung: { vorlage: "dienstbeginn_erinnerung", datum: "2026-11-05", dienstart: "N", einheit: "e2" },
};
function lauf(anfrage, o = {}, b = daten()) {
  const ladeBestand = vi.fn(async () => bestand(b));
  return { ladeBestand, ruf: (extra = {}) => nachrichtenEntwurf({ sitzung: S.leitung, anfrage, heute: HEUTE, ladeBestand, schalter: AN, funktionenFreigegeben: ["F5"], ...o, ...extra }) };
}
const ruf = (anfrage, o = {}, b) => lauf(anfrage, o, b).ruf();
const fehlerCode = async (p) => { try { await p; } catch (e) { return e.code; } return null; };
const KOPF = { funktion: "F5", quelle: "vorlage", gesendet: false, modell: { status: "nicht_verfuegbar", text: "nicht verfügbar" } };
const nm = (...ids) => ids.map((id) => ({ personId: id, name: { sv1: "Svetlana Iwanowa", a1: "Anna Weberknecht", a2: "Jörg Müller-Lüdenscheidt", a3: "Zoë Nguyen" }[id] }));

describe("Katalog: jede Vorlage, genaue Ausgabe", () => {
  const SCHLUSS = "Bitte prüfen Sie Ihren Dienstplan in CENTRIC. Vielen Dank.";
  const ERWARTET = {
    schichtwechsel: { betreff: "Schichtwechsel am Mittwoch, 4. November 2026",
      text: `Guten Tag, es gibt einen Schichtwechsel. Datum: Mittwoch, 4. November 2026. Betroffen ist der Dienst Früh (06:00 bis 14:00 Uhr) im Bereich Wohnbereich Lindenhof. ${SCHLUSS}`, empf: nm("sv1", "a1") },
    planaenderung: { betreff: "Planänderung am Mittwoch, 4. November 2026",
      text: `Guten Tag, im Dienstplan für den Bereich Wohnbereich Ahornweg gibt es eine Änderung. Datum: Mittwoch, 4. November 2026. ${SCHLUSS}`, empf: nm("a2") },
    dienstplan_veroeffentlicht: { betreff: "Dienstplan November 2026 veröffentlicht",
      text: "Guten Tag, der Dienstplan ist veröffentlicht. Monat: November 2026. Bitte schauen Sie in CENTRIC nach Ihren Diensten. Vielen Dank.", empf: nm("sv1", "a1", "a2", "a3") },
    erinnerung_dienstplan: { betreff: "Erinnerung: Dienstplan Dezember 2026",
      text: "Guten Tag, eine freundliche Erinnerung: Bitte prüfen Sie Ihren Dienstplan in CENTRIC. Monat: Dezember 2026. Vielen Dank.", empf: nm("sv1", "a1", "a2", "a3") },
    dienstbeginn_erinnerung: { betreff: "Erinnerung: Dienst am Donnerstag, 5. November 2026",
      text: `Guten Tag, eine freundliche Erinnerung an Ihren Dienst. Datum: Donnerstag, 5. November 2026. Dienst: Nacht (21:15 bis 06:15 Uhr), Bereich: Wohnbereich Ahornweg. ${SCHLUSS}`, empf: nm("a2") },
  };
  it("der Katalog ist geschlossen: genau diese fünf Vorlagen", () => {
    expect(NACHRICHTEN_VORLAGEN.map((v) => v.id)).toEqual(Object.keys(ERWARTET));
    expect(Object.isFrozen(NACHRICHTEN_VORLAGEN)).toBe(true);
  });
  for (const id of Object.keys(ERWARTET)) {
    it(`${id}: Betreff, Text und Empfänger exakt`, async () => {
      const e = ERWARTET[id];
      const r = await ruf(A[id]);
      expect(r).toEqual({ ...KOPF, vorlage: { id, titel: NACHRICHTEN_VORLAGEN.find((v) => v.id === id).titel }, status: "ok",
        entwurf: { betreff: e.betreff, text: e.text }, empfaenger: e.empf, gekuerzt: false });
      expect([...r.entwurf.betreff].length).toBeLessThanOrEqual(TITEL_MAX);
      expect([...r.entwurf.text].length).toBeLessThanOrEqual(F5_GRENZEN.text);
    });
  }
  it("Empfänger: nie die Absenderin, nie Leitung/Planung/Betriebsrat/Ausgeschiedene; Planung als Absenderin ebenso", async () => {
    const r = await ruf(A.dienstplan_veroeffentlicht, { sitzung: S.planer });
    const ids = r.empfaenger.map((e) => e.personId);
    for (const nicht of ["l1", "pl1", "br1", "alt1"]) expect(ids).not.toContain(nicht);
    expect(ids).toEqual(["sv1", "a1", "a2", "a3"]);
  });
  it("Eintritt nach dem Bezugstag und Austritt davor: nicht in der Liste", async () => {
    const b = daten();
    b.personen = b.personen.map((p) => (p.id === "a3" ? { ...p, eintritt: "2027-01-01" } : p.id === "a1" ? { ...p, austritt: "2026-10-31" } : p));
    const r = await ruf(A.dienstplan_veroeffentlicht, {}, b);
    expect(r.empfaenger.map((e) => e.personId)).toEqual(["sv1", "a2"]);
  });
  it("Determinismus: gleiche Eingabe, gleiche Ausgabe, tief eingefroren übergeben", async () => {
    const eins = await ruf(A.schichtwechsel);
    expect(await ruf(A.schichtwechsel)).toEqual(eins);
    const frozen = deepFreeze(bestand(daten()));
    const r = await nachrichtenEntwurf({ sitzung: S.leitung, anfrage: A.schichtwechsel, heute: HEUTE, ladeBestand: async () => frozen, schalter: AN, funktionenFreigegeben: ["F5"] });
    expect(r).toEqual(eins);
  });
  it("Leck-Prüfung lehnt keine übliche Ausgabe zu Unrecht ab: ein Jahr Tage und Monate, alle Vorlagen", async () => {
    const b = daten();
    for (let i = 0; i < 380; i += 3) {
      const d = new Date(Date.UTC(2026, 10, 3 + i)).toISOString().slice(0, 10);
      for (const a of [{ ...A.schichtwechsel, datum: d, dienstart: ["F", "S", "N"][i % 3] }, { ...A.planaenderung, datum: d }, { ...A.dienstplan_veroeffentlicht, monat: d.slice(0, 7) }]) {
        expect((await ruf(a, {}, b)).status, JSON.stringify(a)).toBe("ok");
      }
    }
  });
});

describe("Schalter, Freigabe, Rollenmatrix", () => {
  it("Positivliste F5: nur leitung und planer", () => expect([...funktionEintrag("F5").rollen]).toEqual(["leitung", "planer"]));
  it("Vorgabe AUS: ohne Schalter, mit nur einem Schalter, mit falschen Werten — KI_AUS, der Bestand wird nicht geladen", async () => {
    for (const schalter of [undefined, { prozess: () => "an", laufzeit: () => "aus" }, { prozess: () => "aus", laufzeit: () => "an" },
      { prozess: () => true, laufzeit: () => 1 }, { prozess: () => { throw new Error("x"); }, laufzeit: () => "an" }]) {
      const l = lauf(A.schichtwechsel);
      expect(await fehlerCode(l.ruf({ schalter }))).toBe("KI_AUS");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("ohne Freigabe F5: KI_FUNKTION; eine andere Funktion genügt nicht", async () => {
    for (const funktionenFreigegeben of [undefined, [], ["F6"], ["F15", "F3"]]) {
      const l = lauf(A.schichtwechsel);
      expect(await fehlerCode(l.ruf({ funktionenFreigegeben }))).toBe("KI_FUNKTION");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
  });
  it("Rollen ohne Zugang (Schichtverantwortung, Beschäftigte, Betriebsrat, Kunde, Betreiber, unbekannt, Großschreibung): KI_ROLLE, nichts geladen", async () => {
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat", "kunde", "betreiber", "gast", "", "LEITUNG", "Planer"]) {
      const l = lauf(A.schichtwechsel);
      expect(await fehlerCode(l.ruf({ sitzung: sitzung(rolle, "br1") })), rolle).toBe("KI_ROLLE");
      expect(l.ladeBestand).not.toHaveBeenCalled();
    }
    for (const rolle of ["leitung", "planer"]) expect((await ruf(A.schichtwechsel, { sitzung: S[rolle] })).status).toBe("ok");
  });
  it("ohne Person/Raum/Sitzung: KI_NICHT_ANGEMELDET; Person nicht im Betrieb oder anderer Betrieb: KI_NICHT_GEFUNDEN", async () => {
    expect(await fehlerCode(ruf(A.schichtwechsel, { sitzung: { rolle: "leitung", person: "", bestand: "raum-a" } }))).toBe("KI_NICHT_ANGEMELDET");
    expect(await fehlerCode(ruf(A.schichtwechsel, { sitzung: null }))).toBe("KI_NICHT_ANGEMELDET");
    expect(await fehlerCode(ruf(A.schichtwechsel, { sitzung: sitzung("leitung", "fremd") }))).toBe("KI_NICHT_GEFUNDEN");
    const zwei = bestand(daten(), { ...betrieb("m2", "Zweiter Betrieb"), personen: [{ id: "x1", vorname: "Xaver", nachname: "Yilmaz", rolle: "mitarbeiter" }] });
    const l = (s) => nachrichtenEntwurf({ sitzung: s, anfrage: A.dienstplan_veroeffentlicht, heute: HEUTE, ladeBestand: async () => zwei, schalter: AN, funktionenFreigegeben: ["F5"] });
    expect(await fehlerCode(l(sitzung("leitung", "l1", { betrieb: 1 })))).toBe("KI_NICHT_GEFUNDEN");
    expect(await fehlerCode(l(sitzung("leitung", "l1", { betrieb: 7 })))).toBe("KI_NICHT_GEFUNDEN");
    expect(await fehlerCode(l(sitzung("leitung", "l1", { betrieb: undefined })))).toBe("KI_NICHT_GEFUNDEN");    // zwei Betriebe, keine Angabe: kein Rückfall
    const r = await l(sitzung("leitung", "l1", { betrieb: 0 }));
    expect(r.empfaenger.map((e) => e.personId)).not.toContain("x1");                                           // Empfänger nie aus einem anderen Betrieb
  });
  it("Anfrage: unbekannte Vorlage, fehlender oder zusätzlicher Schlüssel, ungültiges Datum/Monat, unbekannte Dienstart/Einheit: KI_EINGABE", async () => {
    const schlecht = [null, "x", [], {}, { vorlage: 1 }, { vorlage: "frei" }, { ...A.schichtwechsel, text: "Hallo Anna" }, { ...A.schichtwechsel, empfaenger: ["a1"] },
      { vorlage: "schichtwechsel", datum: "2026-11-04", dienstart: "F" }, { ...A.schichtwechsel, datum: "2026-02-30" }, { ...A.schichtwechsel, datum: "04.11.2026" },
      { ...A.dienstplan_veroeffentlicht, monat: "2026-13" }, { ...A.dienstplan_veroeffentlicht, datum: "2026-11-04" }, { ...A.schichtwechsel, dienstart: "ZZ" },
      { ...A.schichtwechsel, einheit: "nirgends" }, { ...A.schichtwechsel, dienstart: ["F"] }, { ...A.planaenderung, dienstart: "F" }];
    for (const anfrage of schlecht) expect(await fehlerCode(ruf(anfrage)), JSON.stringify(anfrage)).toBe("KI_EINGABE");
    expect(await fehlerCode(ruf(A.schichtwechsel, { heute: "morgen" }))).toBe("KI_EINGABE");
  });
});

describe("Entwurfsregel: nichts Unveröffentlichtes in einen Text an Beschäftigte", () => {
  const mitFreigabe = () => { const b = daten(); b.einstellungen = { planFreigabePflicht: true }; b.freigaben = { "2026-11": { von: "l1" } }; return b; };
  it("Tag in einem nicht freigegebenen Monat: abgelehnt „entwurf“, kein Entwurfstext, keine Empfänger", async () => {
    for (const a of [{ ...A.schichtwechsel, datum: "2026-12-05" }, { ...A.planaenderung, datum: "2026-12-05" }, { ...A.dienstbeginn_erinnerung, datum: "2026-12-05" }]) {
      expect(await ruf(a, {}, mitFreigabe())).toEqual({ ...KOPF, vorlage: { id: a.vorlage, titel: NACHRICHTEN_VORLAGEN.find((v) => v.id === a.vorlage).titel }, status: "abgelehnt", grund: "entwurf", text: F5_GRUENDE.entwurf });
    }
  });
  it("freigegebener Monat: Entwurf; nicht freigegebener Monat: abgelehnt — für „veröffentlicht“ und „Erinnerung“", async () => {
    expect((await ruf(A.dienstplan_veroeffentlicht, {}, mitFreigabe())).status).toBe("ok");
    for (const vorlage of ["dienstplan_veroeffentlicht", "erinnerung_dienstplan"]) {
      const r = await ruf({ vorlage, monat: "2026-12" }, {}, mitFreigabe());
      expect(r.status).toBe("abgelehnt"); expect(r.grund).toBe("entwurf"); expect(r.entwurf).toBeUndefined(); expect(r.empfaenger).toBeUndefined();
    }
  });
  it("freigegebener Monat: ein Tag darin ist möglich; ohne aktive Freigabe ist nichts Entwurf", async () => {
    expect((await ruf({ ...A.schichtwechsel, datum: "2026-11-20" }, {}, mitFreigabe())).status).toBe("ok");
    expect((await ruf({ ...A.schichtwechsel, datum: "2026-12-05" })).status).toBe("ok");
  });
  it("Tag vor heute: abgelehnt „vergangen“", async () => {
    const r = await ruf({ ...A.schichtwechsel, datum: "2026-11-01" });
    expect(r).toMatchObject({ status: "abgelehnt", grund: "vergangen", text: F5_GRUENDE.vergangen });
    expect((await ruf({ ...A.schichtwechsel, datum: HEUTE })).status).toBe("ok");
  });
  it("ein Entwurfstag erscheint nirgends in der Ausgabe", async () => {
    const r = await ruf({ ...A.schichtwechsel, datum: "2026-12-05" }, {}, mitFreigabe());
    expect(JSON.stringify(r)).not.toMatch(/Dezember|2026-12|Wohnbereich|Früh/);
  });
});

describe("Verbotsprüfung des endgültigen Textes", () => {
  const SONDE = { krank: "krank", Attest: "Attest", Diagnose: "Diagnose", Grippe: "Station Grippe", Chemo: "Chemo", Klinik: "Klinik", Schwangerschaft: "Schwangerschaft",
    "e-mail": "info@sonnenhof.example", phone: "0421 1234567", phone2: "+49 171 2345678", Krankenhaus: "Krankenhaus", Mutterschutz: "Mutterschutz" };
  for (const [name, wort] of Object.entries(SONDE)) {
    it(`Einheitsname mit „${name}“ im Text: abgelehnt „verbotener_inhalt“, nichts gezeigt`, async () => {
      const b = daten();
      b.einheiten = b.einheiten.map((e) => (e.id === "e1" ? { ...e, name: wort } : e));
      const r = await ruf(A.schichtwechsel, {}, b);
      expect(r).toMatchObject({ ...KOPF, status: "abgelehnt", grund: "verbotener_inhalt", text: F5_GRUENDE.verbotener_inhalt });
      expect(r.entwurf).toBeUndefined(); expect(r.empfaenger).toBeUndefined();
      expect(JSON.stringify(r).toLowerCase()).not.toContain(fold(wort).slice(0, 5));
    });
    it(`Dienstartname mit „${name}“: abgelehnt`, async () => {
      const b = daten();
      b.dienstarten = b.dienstarten.map((d) => (d.id === "F" ? { ...d, name: wort } : d));
      expect((await ruf(A.schichtwechsel, {}, b)).grund).toBe("verbotener_inhalt");
    });
  }
  it("ein Personenname (Vor- oder Nachname) als Einheit oder Dienst: abgelehnt", async () => {
    for (const name of ["Weberknecht", "Anna", "Team Nguyen"]) {
      const b = daten();
      b.einheiten = b.einheiten.map((e) => (e.id === "e1" ? { ...e, name } : e));
      expect((await ruf(A.schichtwechsel, {}, b)).grund, name).toBe("verbotener_inhalt");
    }
  });
  it("Uhrzeit nicht im Format HH:MM oder Dienstart ohne Namen: KI_EINGABE (nichts wird geraten)", async () => {
    const b = daten(); b.dienstarten = b.dienstarten.map((d) => (d.id === "F" ? { ...d, start: "früh" } : d));
    expect(await fehlerCode(ruf(A.schichtwechsel, {}, b))).toBe("KI_EINGABE");
  });
  it("Text über der Grenze der Mitteilung: abgelehnt", async () => {
    const b = daten(); b.einheiten = b.einheiten.map((e) => (e.id === "e1" ? { ...e, name: "Wohnbereich ".repeat(60) } : e));
    expect((await ruf(A.schichtwechsel, {}, b)).grund).toBe("verbotener_inhalt");
  });
});

describe("Keine Gesundheits-, Abwesenheits-, Klärungs- oder Betriebsratsangaben", () => {
  const VERBOTEN = ["krank", "grippe", "fieber", "magen", "darm", "attest", "dr. klein", "diagnose", "grund", "anmerkung", "notiz", "klaerung",
    "betriebsrat", "haberland", "gerda", "br1", "mutterschutz", "schwanger", "arzt", "\"k1\"", "\"ab5\"", "\"art\"", "wiedereingliederung", "keinenacht"];
  const leck = (x) => { const s = fold(JSON.stringify(x)); return VERBOTEN.filter((v) => s.includes(fold(v))); };
  it("Beispieldaten mit offenen Krankmeldungen und Krankabwesenheiten: Ausgabe exakt wie ohne sie, keine Verbotsangabe, alle Rollen/Vorlagen", async () => {
    const sauber = daten();
    sauber.abwesenheiten = []; sauber.krankmeldungen = []; sauber.klaerung = { offen: [] };
    for (const id of Object.keys(A)) for (const rolle of ["leitung", "planer"]) {
      const mit = await ruf(A[id], { sitzung: S[rolle] });
      const ohne = await ruf(A[id], { sitzung: S[rolle] }, sauber);
      expect(mit, `${id}/${rolle}`).toEqual(ohne);
      expect(leck(mit), `${id}/${rolle}`).toEqual([]);
    }
  });
  it("auch wer krank gemeldet ist oder in Klärung steht, bleibt in der Empfängerliste (sonst ließe die Liste es erkennen)", async () => {
    const r = await ruf({ ...A.planaenderung, datum: "2026-11-05", einheit: "e2" });          // a2: Krankabwesenheit 05.–06.11.
    expect(r.empfaenger.map((e) => e.personId)).toEqual(["a2"]);
    const r2 = await ruf(A.dienstplan_veroeffentlicht);                                        // a3: offene Krankmeldung/Klärung am 04.11.
    expect(r2.empfaenger.map((e) => e.personId)).toContain("a3");
  });
  it("kein Betriebsratsmitglied, keine Kontaktdaten, keine Personendaten außer Kennung und Name in der Ausgabe", async () => {
    const roh = JSON.stringify(await ruf(A.dienstplan_veroeffentlicht));
    for (const v of ["haberland", "br1", "@", "+49", "0151", "100234", "1990-05-12", "iban", "lindenallee", "mutterschutz"]) expect(fold(roh), v).not.toContain(fold(v));
    const r = await ruf(A.dienstplan_veroeffentlicht);
    for (const e of r.empfaenger) expect(Object.keys(e).sort()).toEqual(["name", "personId"]);
  });
});

describe("Schreibt nichts, sendet nichts, plant nichts", () => {
  it("der Bestand ist danach unverändert (Gleichheit), geladen wird genau einmal, die Ausgabe sagt „gesendet: false“", async () => {
    const b = daten(); const vorher = JSON.stringify(bestand(b));
    const l = lauf(A.schichtwechsel, {}, b);
    const r = await l.ruf();
    expect(JSON.stringify(bestand(b))).toBe(vorher);
    expect(l.ladeBestand).toHaveBeenCalledTimes(1);
    expect(r.gesendet).toBe(false);
    expect(r.entwurf).toEqual({ betreff: expect.any(String), text: expect.any(String) });
    expect(Object.keys(r).sort()).toEqual(["empfaenger", "entwurf", "funktion", "gekuerzt", "gesendet", "modell", "quelle", "status", "vorlage"]);
  });
  it("Quelltext: kein console, kein Schreiben/Versand/Plan, kein Netz, keine Umgebung, kein Anbieter, kein Import von Gateway-Anbietern", () => {
    const q = readFileSync(path.join(WURZEL, "server/lib/intelligence/funktionen/nachrichten-werkstatt.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).not.toMatch(/console\.|protokoll|bestandSchreiben|zusammenfuehren|writeFile|appendFile|setJSON|\.set\(|fetch\s*\(|node:|process\.|require\s*\(|import\s*\(|anthropic|openai|erzeugeGateway|erzeugeAttrappe|erzeugeLiveAnbieter|setTimeout|setInterval|versand|sendeMail|nachrichten\.push/i);
    expect([...q.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).filter((i) => /gateway\//.test(i) && !/gateway\/(schalter|codes)\.mjs$/.test(i))).toEqual([]);
  });
});

describe("Gateway: nur die Vorlage mit Platzhaltern, nie Plandaten; sonst „nicht verfügbar“", () => {
  const spion = (antwort) => ({ ausfuehren: vi.fn(async () => antwort) });
  const KENN = { kiGestuetzt: true, entwurf: true, geprueft: true };
  const V = NACHRICHTEN_VORLAGEN.find((v) => v.id === "schichtwechsel");
  const polier = "Hallo zusammen, wir ändern einen Dienst. Datum: {Datum}. Dienst: {Dienstart} ({Uhrzeit}), Bereich: {Einheit}. Bitte in CENTRIC nachsehen.";
  it("ohne Gateway (Stand heute): „nicht verfügbar“, der deterministische Entwurf ist da", async () => {
    const r = await ruf(A.schichtwechsel);
    expect(r.modell).toEqual({ status: "nicht_verfuegbar", text: "nicht verfügbar" });
    expect(r.entwurf.text).toContain("Betroffen ist der Dienst Früh");
  });
  it("Schalter aus, Rolle ohne F5, ohne Freigabe, ungültige Anfrage, Entwurfstag, verbotener Inhalt: das Gateway wird NIE gerufen", async () => {
    const g = spion({ status: "fertig", ergebnis: { text: polier }, kennzeichnung: KENN });
    expect(await fehlerCode(ruf(A.schichtwechsel, { schalter: undefined, gateway: g }))).toBe("KI_AUS");
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat", "kunde", "betreiber"]) expect(await fehlerCode(ruf(A.schichtwechsel, { sitzung: sitzung(rolle, "br1"), gateway: g }))).toBe("KI_ROLLE");
    expect(await fehlerCode(ruf(A.schichtwechsel, { funktionenFreigegeben: [], gateway: g }))).toBe("KI_FUNKTION");
    expect(await fehlerCode(ruf({ vorlage: "x" }, { gateway: g }))).toBe("KI_EINGABE");
    const b = daten(); b.einstellungen = { planFreigabePflicht: true }; b.freigaben = {};
    expect((await ruf({ ...A.schichtwechsel, datum: "2026-12-05" }, { gateway: g }, b)).grund).toBe("entwurf");
    expect(g.ausfuehren).not.toHaveBeenCalled();
  });
  it("Aufruf: genau einer, Funktion F5, nur die Vorlage mit Platzhaltern — kein Datum, keine Dienstart, keine Einheit, kein Name", async () => {
    for (const rolle of ["leitung", "planer"]) {
      const g = spion({ status: "fertig", ergebnis: { text: polier }, kennzeichnung: KENN });
      const r = await ruf(A.schichtwechsel, { sitzung: S[rolle], gateway: g });
      expect(g.ausfuehren).toHaveBeenCalledTimes(1);
      const [s, a] = g.ausfuehren.mock.calls[0];
      expect(s.rolle).toBe(rolle);
      expect(a).toEqual({ funktion: "F5", eingabe: { fremdtext: [V.text] } });
      const roh = fold(JSON.stringify(a));
      for (const v of ["2026", "november", "frueh", "lindenhof", "ahornweg", "lena", "anna", "brandt", "06:00", "e1"]) expect(roh, v).not.toContain(v);
      expect(r.modell).toEqual({ status: "fertig", kennzeichnung: KENN });
      expect(r.entwurf.text).toBe("Hallo zusammen, wir ändern einen Dienst. Datum: Mittwoch, 4. November 2026. Dienst: Früh (06:00 bis 14:00 Uhr), Bereich: Wohnbereich Lindenhof. Bitte in CENTRIC nachsehen.");
      expect(r.empfaenger.map((e) => e.personId)).toEqual(["sv1", "a1"]);       // die Empfänger bleiben die berechneten
    }
  });
  it("fehlender, zusätzlicher oder erfundener Platzhalter, fehlende Kennzeichnung, Fehler, falsche Form: deterministischer Text, „nicht verfügbar“", async () => {
    const det = (await ruf(A.schichtwechsel)).entwurf.text;
    const faelle = [
      { status: "fertig", ergebnis: { text: polier.replace(" Datum: {Datum}.", "") }, kennzeichnung: KENN },
      { status: "fertig", ergebnis: { text: `${polier} {Name}` }, kennzeichnung: KENN },
      { status: "fertig", ergebnis: { text: polier }, kennzeichnung: { kiGestuetzt: true } },
      { status: "fertig", ergebnis: { text: polier } }, { status: "rueckfall" }, null, { status: "fertig", ergebnis: { text: "  " }, kennzeichnung: KENN },
    ];
    for (const antwort of faelle) {
      const r = await ruf(A.schichtwechsel, { gateway: spion(antwort) });
      expect(r.modell).toEqual({ status: "nicht_verfuegbar", text: "nicht verfügbar" });
      expect(r.entwurf.text).toBe(det);
    }
    const g = { ausfuehren: vi.fn(async () => { throw new Error("ZEBRA-4711 Anna Weberknecht"); }) };
    const r = await ruf(A.schichtwechsel, { gateway: g });
    expect(r.modell.status).toBe("nicht_verfuegbar"); expect(JSON.stringify(r)).not.toContain("ZEBRA");
  });
  it("die Verbotsprüfung gilt für den polierten Text: Gesundheits-/Kontaktangaben oder zu lang — deterministischer Text bleibt", async () => {
    const det = (await ruf(A.schichtwechsel)).entwurf.text;
    for (const t of [`${polier} Gute Besserung nach der Grippe.`, `${polier} Rückfragen an info@sonnenhof.example`, `${polier} Tel. 0421 1234567`, `${polier} Attest nötig`,
      `${polier} ${"x".repeat(F5_GRENZEN.text)}`, `${polier} Danke, Anna Weberknecht`]) {
      const r = await ruf(A.schichtwechsel, { gateway: spion({ status: "fertig", ergebnis: { text: t }, kennzeichnung: KENN }) });
      expect(r.modell.status, t).toBe("nicht_verfuegbar");
      expect(r.entwurf.text, t).toBe(det);
    }
  });
});

describe("Grenzen", () => {
  it("höchstens EMPFAENGER_MAX Empfänger, gekuerzt gemeldet; Betrieb mit mehr als der Personengrenze: KI_EINGABE", async () => {
    const b = daten();
    const viele = (n) => Array.from({ length: n }, (_, i) => ({ id: `z${i}`, vorname: `Vorname${String.fromCharCode(97 + (i % 26))}`, nachname: `Nachname${String.fromCharCode(97 + ((i / 26) | 0))}`, rolle: "mitarbeiter" }));
    b.personen = [...b.personen, ...viele(300)];
    const r = await ruf(A.dienstplan_veroeffentlicht, {}, b);
    expect(r.status).toBe("ok");
    expect(r.empfaenger.length).toBe(F5_GRENZEN.empfaenger);
    expect(r.gekuerzt).toBe(true);
    const c = daten(); c.personen = [...c.personen, ...viele(F5_GRENZEN.personen + 1)];
    expect(await fehlerCode(ruf(A.dienstplan_veroeffentlicht, {}, c))).toBe("KI_EINGABE");
  });
  it("Betreff höchstens so lang wie ein Mitteilungstitel (TITEL_MAX) für jede Vorlage mit längstem Namen", async () => {
    for (const id of Object.keys(A)) expect([...(await ruf(A[id])).entwurf.betreff].length).toBeLessThanOrEqual(TITEL_MAX);
  });
});

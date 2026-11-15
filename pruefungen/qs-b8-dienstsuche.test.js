/* ==========================================================================
   QS-ZEIT: Tagsuche von B8 (e2e/dienstsuche.mjs) unter festen Uhren — findet immer einen gültigen Tag, nie einen mit
   verletzter Ruhezeit (docs/acc45/QS-ZEITABHAENGIGKEIT.md, Staging-Gate mit echter Serveruhr)

   Gegen einen fremden Container (Staging-Gate) läuft die Suite mit der echten Uhr, der Demo-Bestand entsteht am echten
   Tag. Hier derselbe Weg ohne Browser: Demo-Bestand (demobestand()) und Serverprüfung (fachpruefungUebermittlung, die
   PUT /api/bestand nutzt) unter FESTEN Uhren; der Betriebstag ist der Berliner Tag der Uhr (betriebstag), die Suche
   probiert ab Betriebstag + 3 den Frühdienst. Geprüft über einen ganzen Schichtzyklus (Vorlage v5: 35 Tage) und alle
   Wochentage, Monats- und Jahreswechsel (Anker montag(Jahr-01-01)), beide Zeitumstellungen und das UTC-Fenster
   22:59–23:59 (Berliner Mitternacht). Die Ruhezeitregel ist nicht berührt: Jeder abgewiesene Tag trägt die Ruhezeitmeldung,
   der gefundene Tag wird angenommen, und ein Spätdienst am Vortag des gefundenen Tages wird weiterhin gesperrt.

   Aufruf: npx vitest run pruefungen/qs-b8-dienstsuche.test.js
   ========================================================================== */
import { describe, it, expect, vi, afterEach } from "vitest";
import { demobestand } from "../src/lib/fachlogik.js";
import { fachpruefungUebermittlung } from "../server/lib/schutzdurchsetzung.mjs";
import { betriebstag } from "../server/lib/betriebszeit.mjs";
import { personTag } from "../server/lib/engine/plan.mjs";
import { sucheDiensttag, istRuhezeitSperre, betriebstagAusKopf, sucheMitTagwechsel, SUCHTAGE_MAX } from "../e2e/dienstsuche.mjs";
import { abnahmeHeute } from "../e2e/zeitbasis.mjs";
import { tagPlus } from "../e2e/zeitbasis.mjs";

afterEach(() => { vi.useRealTimers(); });

function demoAm(zeitpunkt) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(zeitpunkt));
  const m = demobestand().mandanten[0];
  const ma = m.personen.filter((x) => x.rolle === "mitarbeiter" && x.status !== "inaktiv" && x.imSchichtdienst !== false)[0];
  return { m, ma, basis: betriebstag(new Date(zeitpunkt)) };
}
function planen(m, eintraege, heute) {
  const neu = JSON.parse(JSON.stringify(m));
  neu.abweichungen = { ...(neu.abweichungen || {}), ...eintraege };
  return fachpruefungUebermittlung(m, neu, heute);
}
const RUHEZEIT = (tag) => `Einteilung am ${tag} nicht möglich: Ruhezeit unter 11 Stunden. Sperrende Regeln lassen sich nicht bestätigen.`;

/** Unabhängige Nachrechnung der Ruhezeit aus den Stammdaten des Tests (nicht aus der Serverregel): Ende des Vortagsdienstes
 *  bis Beginn des Frühdienstes am Tag, in Stunden; null = kein Dienst am Vortag. */
function ruheStunden(m, ma, tag) {
  const vorId = personTag(m, ma, tagPlus(tag, -1)).dienstId;
  const vor = (m.dienstarten || []).find((d) => d.id === vorId && d.start && d.ende);
  if (!vor) return null;
  const min = (hhmm) => { const [h, mi] = hhmm.split(":").map(Number); return h * 60 + mi; };
  const ende = min(vor.ende) + (min(vor.ende) <= min(vor.start) ? 1440 : 0);      // über Mitternacht: Ende am Folgetag
  const fruehStart = 1440 + min(m.dienstarten.find((d) => d.id === "F").start);
  return (fruehStart - ende) / 60;
}

/** Die Suche wie in B8: Frühdienst probieren; die Antwort des Servers (Text der Sperre oder angenommen). */
async function sucheAm(zeitpunkt) {
  const { m, ma, basis } = demoAm(zeitpunkt);
  const probiert = [];
  const r = await sucheDiensttag(basis, (tag) => {
    probiert.push(tag);
    const x = planen(m, { [`${ma.id}|${tag}`]: "F" }, basis);
    return x === null ? { ok: true } : { ok: false, text: x.sperre };
  });
  return { m, ma, basis, probiert, ...r };
}

/** Uhren: 40 aufeinanderfolgende Tage (mehr als ein Zyklus, alle Wochentage) zu drei Tageszeiten, dazu Sonderfälle. */
const uhren = [];
for (let i = 0; i < 40; i++) {
  const tag = tagPlus("2026-11-01", i);
  for (const z of ["T00:05:00Z", "T12:00:00Z", "T22:59:30Z", "T23:30:00Z"]) uhren.push(`${tag}${z}`);
}
const sonder = [
  "2026-10-24T22:59:50Z", "2026-10-25T00:30:00Z", "2026-10-25T23:30:00Z", "2026-10-26T22:59:59Z",   // Ende der Sommerzeit (2026-10-25)
  "2027-03-26T23:30:00Z", "2027-03-27T22:59:59Z", "2027-03-27T23:00:00Z", "2027-03-28T23:30:00Z",   // Beginn der Sommerzeit (2027-03-28)
  "2026-11-30T23:30:00Z", "2026-12-31T22:59:59Z", "2026-12-31T23:00:00Z", "2027-01-01T00:00:00Z",   // Monats- und Jahreswechsel
  "2027-02-28T23:30:00Z", "2027-04-30T21:59:59Z", "2027-04-30T22:00:00Z", "2027-06-30T22:30:00Z",   // Monatsende, Sommerzeit (Mitternacht = 22:00Z)
  "2028-02-28T23:30:00Z", "2028-02-29T23:30:00Z",                                                    // Schaltjahr
];

describe("Tagsuche für B8: immer ein gültiger Tag, nie eine Ruhezeitverletzung", () => {
  it.each([...uhren, ...sonder])("Uhr %s", async (zeitpunkt) => {
    const { m, ma, basis, probiert, tag, abgelehnt } = await sucheAm(zeitpunkt);
    expect(tag >= tagPlus(basis, 3), "nie vor Betriebstag + 3").toBe(true);
    expect(probiert.length, "höchstens ein Zyklus").toBeLessThan(SUCHTAGE_MAX);
    expect(probiert[probiert.length - 1]).toBe(tag);
    /* Der gefundene Tag wird angenommen (derselbe Serverweg wie PUT /api/bestand). */
    expect(planen(m, { [`${ma.id}|${tag}`]: "F" }, basis)).toBeNull();
    /* Unabhängig nachgerechnet: am gefundenen Tag mindestens 11 h Ruhe; an jedem übersprungenen Tag wirklich weniger. */
    const ruhe = ruheStunden(m, ma, tag);
    expect(ruhe === null || ruhe >= 11, `Ruhe ${ruhe} h am ${tag}`).toBe(true);
    for (const t of abgelehnt) expect(ruheStunden(m, ma, t), `übersprungener Tag ${t}`).toBeLessThan(11);
    /* Jeder übersprungene Tag ist eine echte Ruhezeitsperre mit der Meldung der Regel. */
    for (const t of abgelehnt) expect(planen(m, { [`${ma.id}|${t}`]: "F" }, basis)).toEqual({ sperre: RUHEZEIT(t) });
    /* Die Regel gilt unverändert: Spätdienst am Vortag des gefundenen Tages macht denselben Frühdienst unzulässig. */
    const r = planen(m, { [`${ma.id}|${tagPlus(tag, -1)}`]: "S", [`${ma.id}|${tag}`]: "F" }, basis);
    expect(r && r.sperre, "Spätdienst + Frühdienst bleibt gesperrt").toMatch(/Ruhezeit unter 11 Stunden/);
  });

  it("über den ganzen Schichtzyklus wird nicht immer Betriebstag + 3 genommen (die Suche ist nötig) und es gibt ohne Suche rote Tage", async () => {
    let uebersprungen = 0, tage = 0;
    for (let i = 0; i < 40; i++) {
      const r = await sucheAm(`${tagPlus("2026-11-01", i)}T12:00:00Z`);
      tage++; if (r.abgelehnt.length) uebersprungen++;
    }
    expect(uebersprungen, "mindestens ein Basistag trifft auf eine Ruhezeitsperre (2026-11-15 ist belegt)").toBeGreaterThan(0);
    expect(uebersprungen).toBeLessThan(tage);
  });

  it("der dokumentierte Ausfalltag 2026-11-15: + 3 gesperrt, die Suche nimmt den nächsten zulässigen Tag", async () => {
    const r = await sucheAm("2026-11-15T09:00:00Z");
    expect(r.abgelehnt[0]).toBe("2026-11-18");
    expect(r.tag > "2026-11-18").toBe(true);
  });
});

describe("Sucheverhalten", () => {
  it("meldet, wenn kein Tag zulässig ist (kein stilles Weitersuchen)", async () => {
    await expect(sucheDiensttag("2026-11-14", (t) => ({ ok: false, text: RUHEZEIT(t) }), { max: 5 })).rejects.toThrow(/Kein Tag in 5 Tagen/);
  });
  it("nur die echte Ruhezeitmeldung für genau diesen Tag rückt den Tag vor", async () => {
    const probiert = [];
    const r = await sucheDiensttag("2026-11-14", (t) => { probiert.push(t); return t < "2026-11-19" ? { ok: false, text: RUHEZEIT(t) } : { ok: true }; });
    expect(r.tag).toBe("2026-11-19");
    expect(r.abgelehnt).toEqual(["2026-11-17", "2026-11-18"]);
  });
  /* Echte Antworten des Servers, die KEINE Ruhezeitsperre sind: Die Suche bricht ab (ein Rechte- oder Formatfehler darf nie als
     „Tag überspringen“ durchgehen). Quellen: PUT /api/bestand, Schreibschutz, Teilweg, Rollen, Fachprüfung anderer Regeln. */
  const andere = [
    ["Rollenverweigerung", "Keine Schreibberechtigung."],
    ["Rolle (JSON-Rumpf)", '{"text":"Keine Schreibberechtigung.","code":"rolle"}'],
    ["TEILWEG_ROLLE", "Diese Rolle darf den Bestand nicht schreiben (Teilweg)."],
    ["andere sperrende Regel", "Einteilung am 2026-11-17 nicht möglich: Höchstarbeitszeit überschritten. Sperrende Regeln lassen sich nicht bestätigen."],
    ["Ruhezeit hinter Betriebsvorgabe (nicht sperrend)", "Einteilung am 2026-11-17 nicht möglich: Ruhezeit unter der Vorgabe von Tarif oder Betrieb."],
    ["Konflikt 409", "Der Bestand wurde zwischenzeitlich geändert (ETag)."],
    ["Unverarbeitbar 422", "Bestand ungültig."],
    ["Serverfehler 500", "Interner Fehler"],
    ["leer", ""],
  ];
  it.each(andere)("bricht ab bei: %s", async (_name, text) => {
    await expect(sucheDiensttag("2026-11-14", () => ({ ok: false, text }))).rejects.toThrow(/anderem Grund/);
    let n = 0;
    await expect(sucheDiensttag("2026-11-14", () => { n++; return { ok: false, text }; })).rejects.toThrow();
    expect(n, "kein Weitersuchen nach der ersten fremden Abweisung").toBe(1);
  });
  it("bricht ab, wenn die Ruhezeitmeldung einen ANDEREN Tag nennt (Klassifikation prüft das Datum)", async () => {
    await expect(sucheDiensttag("2026-11-14", () => ({ ok: false, text: RUHEZEIT("2026-12-24") }))).rejects.toThrow(/anderen Tag/);
  });
  it("istRuhezeitSperre: Meldung und Datum", () => {
    expect(istRuhezeitSperre(RUHEZEIT("2026-11-18"))).toBe(true);
    expect(istRuhezeitSperre(RUHEZEIT("2026-11-18"), "2026-11-18")).toBe(true);
    expect(istRuhezeitSperre(RUHEZEIT("2026-11-18"), "2026-11-19")).toBe(false);
    expect(istRuhezeitSperre("Keine Schreibberechtigung.")).toBe(false);
    expect(istRuhezeitSperre("Einteilung am 2026-11-18 nicht möglich: Höchstarbeitszeit.")).toBe(false);
    expect(istRuhezeitSperre(undefined)).toBe(false);
  });
});

describe("Betriebstag des fremden Servers (Kopf Date) und Tageswechsel", () => {
  it("liest den Berliner Tag aus dem Kopf (UTC-Fenster 22:59-23:59, Sommer-/Winterzeit)", () => {
    expect(betriebstagAusKopf("Sat, 14 Nov 2026 22:59:59 GMT", abnahmeHeute)).toBe("2026-11-14");
    expect(betriebstagAusKopf("Sat, 14 Nov 2026 23:00:00 GMT", abnahmeHeute)).toBe("2026-11-15");
    expect(betriebstagAusKopf("Fri, 30 Apr 2027 21:59:59 GMT", abnahmeHeute)).toBe("2027-04-30");
    expect(betriebstagAusKopf("Fri, 30 Apr 2027 22:00:00 GMT", abnahmeHeute)).toBe("2027-05-01");
  });
  it.each([[undefined], [null], [""], ["kein Datum"]])("fehlender oder ungültiger Kopf (%s) bricht laut ab, ohne Rückgriff auf die eigene Uhr", (kopf) => {
    const eigeneUhr = vi.fn(() => "2000-01-01");
    expect(() => betriebstagAusKopf(kopf, eigeneUhr)).toThrow(/Kopf „Date“ fehlt oder ist ungültig/);
    expect(eigeneUhr).not.toHaveBeenCalled();
  });
  it("Tageswechsel während der Suche: einmal neu suchen, mit dem neuen Tag", async () => {
    const tage = ["2026-11-14", "2026-11-15", "2026-11-15", "2026-11-15"];       // vor, nach der ersten Suche, vor, nach der zweiten
    const gesucht = [];
    const r = await sucheMitTagwechsel(async () => tage.shift(), async (basis) => { gesucht.push(basis); return { tag: "x", abgelehnt: [] }; });
    expect(gesucht).toEqual(["2026-11-14", "2026-11-15"]);
    expect(r.basis).toBe("2026-11-15");
  });
  it("kein Tageswechsel: genau eine Suche", async () => {
    let n = 0;
    const r = await sucheMitTagwechsel(async () => "2026-11-14", async () => { n++; return { tag: "t", abgelehnt: [] }; });
    expect(n).toBe(1); expect(r.basis).toBe("2026-11-14");
  });
  it("zweimaliger Tageswechsel: Abbruch mit klarer Meldung", async () => {
    const tage = ["2026-11-14", "2026-11-15", "2026-11-15", "2026-11-16"];
    await expect(sucheMitTagwechsel(async () => tage.shift(), async () => ({ tag: "x", abgelehnt: [] }))).rejects.toThrow(/zweimal geändert/);
  });
});

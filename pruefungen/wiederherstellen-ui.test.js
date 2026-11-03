/* ==========================================================================
   WIEDERHERSTELLEN IN DER OBERFLÄCHE (WP-25)

   Die Leitung legte Sicherungen schon in der Oberfläche an; zurückspielen
   ging nur über die Schnittstelle. Jetzt: Liste der eigenen Sicherungen,
   Zurückspielen mit Bestätigung (nur Leitung), Meldung der Fristen (WP-26)
   und ein klarer Hinweis bei unlesbarer Datei (503, Betreiber, §4a).

   Geprüft wird dreierlei:
   1. Regeln und Texte (src/sicherungen-ui.js) — gleiche Rollen wie der
      Server, Deutung jeder Antwort.
   2. Was React rendert (SicherungenVerwalten aus src/App.jsx).
   3. Der Weg gegen den echten Server-Handler: die Antworten, die die
      Oberfläche deutet, kommen genau so vom Server (Liste, 200 mit Fristen,
      403 für die Kundenrolle, 409, 503 bei unlesbarer Datei), und
      speicher.js schickt den ETag mit und übernimmt den neuen.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.setConfig({ testTimeout: 60000 });

const WIRT = "127.0.0.1:3000";
let U, App, wurzel, laden, daten, sitzungAnlegen, B;

beforeAll(async () => {
  U = await import("../src/sicherungen-ui.js");
  App = await import("../src/App.jsx");
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp25-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.CENTRIC_DATENSCHUTZLAUF;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  B = await import("../server/lib/bestand.mjs");
}, 120000);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Regeln und Texte", () => {
  it("dieselben Rollen wie der Server: sehen Leitung und Kundenrolle, zurückspielen nur die Leitung", async () => {
    const S = await import("../server/lib/sicherungen.mjs");
    expect([...U.SICHERUNG_SEHEN]).toEqual(S.SICHERUNG_ROLLEN);
    expect([...U.ZURUECKSPIELEN]).toEqual(S.WIEDERHERSTELLEN_ROLLEN);
    for (const r of ["mitarbeiter", "planer", "subplaner", "betriebsrat", "betreiber", null]) {
      expect(U.darfSicherungenSehen(r), String(r)).toBe(false);
      expect(U.darfZurueckspielen(r), String(r)).toBe(false);
    }
    expect(U.darfZurueckspielen("kunde")).toBe(false);
  });

  it("Listeneintrag: Zeit in Berlin, Umfang, wer", () => {
    expect(U.eintragText({ marke: "m", zeit: "2026-11-03T13:05:00.000Z", umfang: "betrieb", automatisch: false, durch: "Lea" }))
      .toEqual({ titel: "03.11.2026, 14:05", text: "dieser Betrieb · von Lea" });
    expect(U.eintragText({ marke: "m", zeit: null, umfang: "raum", automatisch: true, durch: "automatisch vor Verlust" }).text)
      .toBe("ganzer Raum — zurückgespielt wird nur dieser Betrieb · automatisch (automatisch vor Verlust)");
    expect(U.eintragText({ marke: "2026-11-01-08-00-00-0001", zeit: null }).titel).toBe("2026-11-01-08-00-00-0001");
  });

  it("Deutung jeder Antwort: Erfolg mit Fristen, neu anmelden, Konflikt, Bremse, unlesbare Datei, Absage", () => {
    const ok = U.ergebnisMeldung({ status: 200, daten: { ok: true, fristen: { modus: "vorschau", geloescht: false, faellig: 3,
      text: "Nach den Fristen fällig, aber nicht gelöscht (Datenschutzlauf „vorschau“): 3 Einträge" } } });
    expect(ok).toMatchObject({ ok: true, neuLaden: true });
    expect(ok.fristen).toMatch(/fällig, aber nicht gelöscht/);
    expect(U.ergebnisMeldung({ status: 200, daten: { fristen: { modus: "an", geloescht: true, faellig: 2, text: "2 gelöscht" } } }).fristen)
      .toBe("Nach den Aufbewahrungsfristen entfernt: 2 gelöscht");
    expect(U.ergebnisMeldung({ status: 200, daten: { fristen: { modus: "an", geloescht: false, faellig: 0, text: "Nichts fällig" } } }).fristen)
      .toBeNull();
    expect(U.ergebnisMeldung({ status: 403, daten: { neuAnmelden: true } })).toMatchObject({ ok: false, neuAnmelden: true });
    expect(U.ergebnisMeldung({ status: 409, daten: { text: "Der Bestand hat sich geändert." } })).toMatchObject({ neuLaden: true });
    expect(U.ergebnisMeldung({ status: 429 }).titel).toMatch(/zu viele/);
    const unlesbar = U.ergebnisMeldung({ status: 503, daten: { code: "BESTAND_UNLESBAR" } });
    expect(unlesbar.text).toMatch(/Betreiber/);
    expect(unlesbar.text).toMatch(/4a/);
    expect(U.ergebnisMeldung({ status: 0, daten: { fehler: "Es wird noch gespeichert." } }).text).toMatch(/noch gespeichert/);
  });

  it("gezielte Texte für 403 (Rolle), 404, 422 und 503 (belegt) — jeweils mit „nichts geändert“", () => {
    const nein = U.ergebnisMeldung({ status: 403, daten: { fehler: "Wiederherstellen darf nur die Leitung.", text: "Das darf die Leitung." } });
    expect(nein).toMatchObject({ ok: false, titel: "Nicht erlaubt" });
    expect(nein.text).toMatch(/Das darf die Leitung\. Es wurde nichts geändert/);
    expect(U.ergebnisMeldung({ status: 403, daten: {} }).text).toMatch(/nur die Leitung/);
    const weg = U.ergebnisMeldung({ status: 404, daten: { fehler: "Diese Sicherung gibt es nicht." } });
    expect(weg).toMatchObject({ ok: false, titel: "Sicherung nicht gefunden", neuLaden: true });
    expect(weg.text).toMatch(/ausgedünnt/);
    const kaputt = U.ergebnisMeldung({ status: 422, daten: { fehler: "Diese Sicherung ist unbrauchbar.", text: "Ein Betrieb braucht einen Namen." } });
    expect(kaputt.titel).toBe("Sicherung unbrauchbar");
    expect(kaputt.text).toMatch(/Ein Betrieb braucht einen Namen\./);
    expect(kaputt.text).toMatch(/nichts geändert/);
    expect(U.ergebnisMeldung({ status: 400 }).text).toMatch(/Liste neu laden/);
    const belegt = U.ergebnisMeldung({ status: 503, daten: { code: "SPEICHERN_BELEGT" } });
    expect(belegt.titel).toBe("Gerade nicht möglich");
    expect(belegt.text).toMatch(/nichts geändert/);
  });
});

describe("Oberfläche gerendert", () => {
  const liste = [
    { marke: "2026-11-03-13-05-00-0001", zeit: "2026-11-03T13:05:00.000Z", umfang: "betrieb", automatisch: false, durch: "Lea" },
    { marke: "2026-11-02-02-00-00-0001", zeit: "2026-11-02T02:00:00.000Z", umfang: "raum", automatisch: true, durch: null },
  ];
  const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  it("Leitung: Liste mit „Zurückspielen“ je Eintrag", () => {
    const t = text(h(App.SicherungenVerwalten, { rolle: "leitung", vorgabe: { liste } }));
    expect(t).toContain("03.11.2026, 14:05");
    expect(t).toContain("ganzer Raum — zurückgespielt wird nur dieser Betrieb");
    expect(t.match(/Zurückspielen/g)).toHaveLength(2);
  });
  it("Kundenrolle: Liste, aber kein Zurückspielen", () => {
    const t = text(h(App.SicherungenVerwalten, { rolle: "kunde", vorgabe: { liste } }));
    expect(t).toContain("03.11.2026, 14:05");
    expect(t).not.toMatch(/Zurückspielen\b(?! kann)/);
    expect(t).toContain("Zurückspielen kann nur die Leitung");
  });
  it("leere Liste und Fehler werden gesagt, nicht verschwiegen", () => {
    expect(text(h(App.SicherungenVerwalten, { rolle: "leitung", vorgabe: { liste: [] } }))).toContain("Noch keine Sicherung");
    expect(text(h(App.SicherungenVerwalten, { rolle: "leitung", vorgabe: { liste: [], fehler: "Sicherungen sieht die Leitung." } })))
      .toContain("Sicherungen sieht die Leitung.");
  });
  it("fehlt eine Aktion, steht ein Fehler da — kein ewiges „Lädt …“", () => {
    const ohne = text(h(App.SicherungenVerwalten, { rolle: "leitung" }));
    expect(ohne).toContain("nicht angeschlossen");
    expect(ohne).not.toContain("Lädt");
    const nurLaden = text(h(App.SicherungenVerwalten, { rolle: "leitung", laden: () => Promise.resolve([]) }));
    expect(nurLaden).toContain("nicht angeschlossen");                       // Leitung braucht auch „zurückspielen“
    const kundeOk = text(h(App.SicherungenVerwalten, { rolle: "kunde", laden: () => Promise.resolve([]) }));
    expect(kundeOk).not.toContain("nicht angeschlossen");                   // die Kundenrolle braucht nur die Liste
    const ok = text(h(App.SicherungenVerwalten, { rolle: "leitung", laden: () => Promise.resolve([]), zurueckspielen: () => {} }));
    expect(ok).toContain("Lädt");
  });

  it("der Bestätigungsdialog: gesamter Text, was bleibt und was zurückgeht", () => {
    const t = text(h(App.SicherungenVerwalten, { rolle: "leitung", vorgabe: { liste, auswahl: liste[0] } }));
    expect(t).toContain("Sicherung zurückspielen?");
    expect(t).toContain("Stand vom 03.11.2026, 14:05");
    for (const teil of ["Das bleibt, wie es jetzt ist", "Das geht auf den Stand der Sicherung zurück", "Gut zu wissen",
      "Alle Stempel mit ihren Korrekturen", "Protokoll", "Vertrags- und Rechnungsangaben", "anonymisierte Personen",
      "Der Plan: Einteilungen", "Wer erst nach der Sicherung angelegt wurde, fehlt danach", "Einstellungen, Dienstarten",
      "Abwesenheiten, Anträge", "fehlt danach", "automatisch gesichert", "Aufbewahrungsfristen",
      "Die Pflicht zur Planfreigabe samt Datum und Person",
      "Ja, zurückspielen", "Abbrechen"]) expect(t, teil).toContain(teil);
  });
});

describe("Verdrahtung: echte Einstellungen, echte Aktionen", () => {
  /* Der Fehler der ersten Fassung: Einstellungen übergab akt.sicherungenLaden und akt.zurueckspielen,
     das Aktionsobjekt der App kannte beide nicht. Geprüft wird hier ohne Quelltext-Regex: die echte
     Komponente Einstellungen wird gerendert (eingeloggt als Leitung), und die Aktionen kommen aus
     derselben Fabrik, die das Aktionsobjekt der App einsetzt (sicherungenAktionen). */
  let SP, sitz;
  const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  beforeAll(async () => {
    SP = await import("../src/speicher.js");
    const alt = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ token: "t-leitung", name: "Lea", rolle: "leitung", person: "leitung", betrieb: 0 }),
      { status: 200, headers: { "content-type": "application/json" } });
    try { await SP.anmelden("probe-code", false); } finally { globalThis.fetch = alt; }
    const m = App.leererMandant("Wiederherstellen-Prüfung", "pflege");
    const e = m.einheiten[0].id;
    m.personen = [{ ...App.zugangsPerson("leitung", e, 1), id: "leitung", vorname: "Lea", nachname: "Leitung" }];
    sitz = { rolle: "kunde", db: { mandanten: [m], session: { mandantId: m.id, personId: "leitung", rolle: "leitung" } },
      mandant: m, person: m.personen[0] };
  }, 60000);

  /** akt, der jede gelesene Eigenschaft aufzeichnet und eine Funktion liefert. */
  const aufzeichnend = () => {
    const gelesen = new Set();
    const akt = new Proxy({}, { get: (_, k) => { gelesen.add(String(k)); return () => {}; } });
    return { akt, gelesen };
  };

  it("Einstellungen als Leitung zeigt „Sicherungen“ und liest genau die beiden Aktionen sicherungenLaden und zurueckspielen", () => {
    expect(SP.angemeldet()).toBe(true);
    const { akt, gelesen } = aufzeichnend();
    const t = text(h(App.Einstellungen, { sitz, akt, gehZu: () => {} }));
    expect(t).toContain("Sicherungen");
    expect(t).toContain("Lädt");
    expect(gelesen.has("sicherungenLaden")).toBe(true);
    expect(gelesen.has("zurueckspielen")).toBe(true);
  });

  it("die Aktionen aus der Fabrik der App füllen diese Namen — mit ihnen kein Programmfehler in den Einstellungen", () => {
    const aktionen = U.sicherungenAktionen(SP);
    expect(Object.keys(aktionen).sort()).toEqual(["sicherungenLaden", "zurueckspielen"]);
    for (const k of Object.keys(aktionen)) expect(typeof aktionen[k], k).toBe("function");
    const mit = text(h(App.Einstellungen, { sitz, akt: { ...aktionen, sicherungAnlegen: () => {} }, gehZu: () => {} }));
    expect(mit).toContain("Lädt");
    expect(mit).not.toContain("nicht angeschlossen");
    /* Ohne sie (der Stand der ersten Fassung) steht der Fehler da. */
    const ohne = text(h(App.Einstellungen, { sitz, akt: { sicherungAnlegen: () => {} }, gehZu: () => {} }));
    expect(ohne).toContain("nicht angeschlossen");
  });

  it("die Fabrik ruft die Speicherschicht: Laden → SP.sicherungen, Zurückspielen → SP.wiederherstellen(marke)", async () => {
    const aufrufe = [];
    const falsch = { sicherungen: async () => { aufrufe.push(["sicherungen"]); return [{ marke: "m1" }]; },
      wiederherstellen: async (marke) => { aufrufe.push(["wiederherstellen", marke]); return { status: 200, daten: { ok: true } }; } };
    const a = U.sicherungenAktionen(falsch);
    expect(await a.sicherungenLaden()).toEqual([{ marke: "m1" }]);
    expect(await a.zurueckspielen("2026-11-03-13-05-00-0001")).toEqual({ status: 200, daten: { ok: true } });
    expect(aufrufe).toEqual([["sicherungen"], ["wiederherstellen", "2026-11-03-13-05-00-0001"]]);
    /* Und die echte Speicherschicht hat beide Funktionen. */
    expect(typeof SP.sicherungen).toBe("function");
    expect(typeof SP.wiederherstellen).toBe("function");
  });

  it("das Aktionsobjekt der App setzt die Fabrik ein (die einzige Quelltext-Prüfung: das Objekt entsteht in App() und ist nicht aufrufbar)", async () => {
    const quelle = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx"), "utf8");
    expect(quelle.match(/\.\.\.sicherungenAktionen\(SP\)/g)).toHaveLength(1);
    expect(quelle).toContain("laden={akt.sicherungenLaden}");
    expect(quelle).toContain("zurueckspielen={akt.zurueckspielen}");
    expect(quelle).not.toContain("auf die sich später zurückgehen lässt");
  });

  it("Kundenrolle (Server-Rolle „kunde“) sieht die Liste, aber nicht „Zurückspielen“; Beschäftigte sehen den Abschnitt nicht", async () => {
    const alt = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ token: "t-k", name: "K", rolle: "kunde", person: null, betrieb: 0 }),
      { status: 200, headers: { "content-type": "application/json" } });
    try { await SP.anmelden("probe-code", false); } finally { globalThis.fetch = alt; }
    const { akt } = aufzeichnend();
    const k = text(h(App.Einstellungen, { sitz, akt, gehZu: () => {} }));
    expect(k).toContain("Zurückspielen kann nur die Leitung");
    globalThis.fetch = async () => new Response(JSON.stringify({ token: "t-m", name: "M", rolle: "mitarbeiter", person: "x", betrieb: 0 }),
      { status: 200, headers: { "content-type": "application/json" } });
    try { await SP.anmelden("probe-code", false); } finally { globalThis.fetch = alt; }
    const m = text(h(App.Einstellungen, { sitz, akt, gehZu: () => {} }));
    expect(m).not.toContain("Kopien des eigenen Betriebs");
    /* zurück auf die Leitung für die folgenden Prüfungen */
    globalThis.fetch = async () => new Response(JSON.stringify({ token: "t-leitung", name: "Lea", rolle: "leitung", person: "leitung", betrieb: 0 }),
      { status: 200, headers: { "content-type": "application/json" } });
    try { await SP.anmelden("probe-code", false); } finally { globalThis.fetch = alt; }
  });
});

describe("Der Bestätigungstext stimmt mit dem Server überein (betriebWiederherstellen)", () => {
  /* Jede Aussage des Dialogs wird am Server geprüft — der Text nach WP-06 (Stempel bleiben). */
  let ergebnis, jetzt, sicherung;
  beforeAll(async () => {
    const { betriebWiederherstellen } = await import("../server/lib/sicherungen.mjs");
    const person = (id, extra = {}) => ({ id, vorname: id, nachname: id, rolle: id === "l1" ? "leitung" : "mitarbeiter",
      status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], bereich: "e1", ...extra });
    const stempelHeute = { start: "06:00", ende: "14:00",
      korrekturen: [{ vorher: { start: "06:05" }, nachher: { start: "06:00" }, grund: "Korrektur" }] };
    jetzt = { version: 9, mandanten: [
      { id: "m1", name: "Haus", tarif: "pro", status: "aktiv", einheiten: [{ id: "e1", name: "WB" }], dienstarten: [{ id: "F", name: "Früh" }],
        personen: [person("l1"), person("p1", { nachname: "Neu" }), person("neu"), person("anon", { anonym: true, vorname: "", nachname: "" })],
        abweichungen: { "p1|2026-11-10": "S" }, freigaben: { "2026-11": { stand: 2 } },
        einstempeln: { "p1|2026-11-02": stempelHeute },
        erfassung: { "p1|2026-11-02": { start: "06:00", ende: "14:00", bestaetigt: true, korrigiert: true } },
        abwesenheiten: [{ id: "w2", personId: "p1", art: "urlaub", von: "2026-12-01", bis: "2026-12-02" }],
        protokoll: [{ id: "alt", text: "altes Protokoll" }], aenderungen: [{ personId: "p1", datum: "2026-11-02", von: "-", nach: "F" }],
        einstellungen: { stand: "neu" } },
      { id: "m2", name: "Anderer Betrieb", personen: [person("x1")], abweichungen: {} },
    ] };
    sicherung = { umfang: "betrieb", mandantId: "m1", erzeugt: "2026-10-01T08:00:00Z", mandant: {
      id: "m1", name: "Haus (alt)", tarif: "gratis", status: "test", einheiten: [{ id: "e1", name: "WB" }], dienstarten: [{ id: "F", name: "Früh" }],
      personen: [person("l1"), person("p1", { nachname: "Alt" }), person("anon", { vorname: "Echt", nachname: "Name" })],
      abweichungen: { "p1|2026-11-10": "F" }, freigaben: {},
      einstempeln: { "p1|2026-10-01": { start: "07:00", ende: "15:00" } },
      erfassung: { "p1|2026-10-01": { start: "07:00", ende: "15:00", bestaetigt: true } },
      abwesenheiten: [], protokoll: [], einstellungen: { stand: "alt" } } };
    ergebnis = betriebWiederherstellen(jetzt, sicherung, { rolle: "leitung", person: "l1", betrieb: 0, bestand: "r", mandantId: "m1" },
      { marke: "2026-10-01-08-00-00-0001", heute: new Date("2026-11-03T10:00:00Z"), datenschutz: "vorschau" });
    expect(ergebnis.verweigert, JSON.stringify(ergebnis)).toBeUndefined();
  });

  it("BLEIBT: Stempel samt Korrektur und Ist-Zeit, dazu Stempel nur der Sicherung; Protokoll mit neuem Eintrag; Planänderungen; Vertrag; andere Betriebe; anonymisierte Person", () => {
    const m = ergebnis.bestand.mandanten[0];
    expect(m.einstempeln["p1|2026-11-02"]).toEqual(jetzt.mandanten[0].einstempeln["p1|2026-11-02"]);
    expect(m.einstempeln["p1|2026-11-02"].korrekturen).toHaveLength(1);
    expect(m.erfassung["p1|2026-11-02"]).toEqual(jetzt.mandanten[0].erfassung["p1|2026-11-02"]);
    expect(m.einstempeln["p1|2026-10-01"]).toBeTruthy();                       // nur die Sicherung kannte ihn
    expect(m.protokoll.map((x) => x.text)).toEqual([expect.stringMatching(/wiederhergestellt/), "altes Protokoll"]);
    expect(m.aenderungen).toEqual(jetzt.mandanten[0].aenderungen);
    expect([m.tarif, m.status]).toEqual(["pro", "aktiv"]);
    expect(ergebnis.bestand.mandanten[1]).toEqual(jetzt.mandanten[1]);
    expect(m.personen.find((p) => p.id === "anon")).toMatchObject({ anonym: true, nachname: "" });
    expect(ergebnis.stempelBehalten).toBe(1);
  });

  it("GEHT ZURÜCK: Plan und Freigaben, Personen (neu angelegte fehlen, ihre Stempel bleiben), Stammdaten, Einstellungen, Abwesenheiten", () => {
    const m = ergebnis.bestand.mandanten[0];
    expect(m.abweichungen).toEqual({ "p1|2026-11-10": "F" });
    /* Freigaben gehen mit dem Plan zurück — außer der Betrieb benutzt die Freigabe und die Sicherung nicht:
       Dann bleiben die jetzigen Freigaben (WP-23, Entwurfsschutz; BESTAETIGUNG.bleibt nennt es). */
    expect(m.freigaben).toEqual({ "2026-11": { stand: 2 } });
    expect(m.personen.map((p) => p.id).sort()).toEqual(["anon", "l1", "p1"]);   // "neu" fehlt
    expect(m.personen.find((p) => p.id === "p1").nachname).toBe("Alt");
    expect(m.einstellungen).toEqual({ stand: "alt" });
    expect(m.abwesenheiten).toEqual([]);
    expect(m.name).toBe("Haus (alt)");
  });

  it("FRISTEN: bei „vorschau“ wird nur gemeldet, bei „an“ entfernt — die Dialogaussage deckt beide Fälle", async () => {
    const { betriebWiederherstellen } = await import("../server/lib/sicherungen.mjs");
    const alt = JSON.parse(JSON.stringify(sicherung));
    alt.mandant.einstempeln["p1|2019-01-05"] = { start: "06:00", ende: "14:00" };
    const lauf = (modus) => betriebWiederherstellen(jetzt, alt, { rolle: "leitung", person: "l1", betrieb: 0, bestand: "r", mandantId: "m1" },
      { marke: "2026-10-01-08-00-00-0001", heute: new Date("2026-11-03T10:00:00Z"), datenschutz: modus });
    expect(lauf("vorschau").fristen).toMatchObject({ geloescht: false });
    expect(lauf("vorschau").bestand.mandanten[0].einstempeln["p1|2019-01-05"]).toBeTruthy();
    expect(lauf("an").fristen).toMatchObject({ geloescht: true });
    expect(lauf("an").bestand.mandanten[0].einstempeln["p1|2019-01-05"]).toBeUndefined();
    expect(U.BESTAETIGUNG.hinweise.join(" ")).toMatch(/eingeschaltet, wird Fälliges dabei entfernt, sonst nur gemeldet/);
  });
});

describe("gegen den Server-Handler", () => {
  const R = "wp25-raum";
  let nr = 0;
  const anfrage = async (pfad, { methode = "GET", rumpf, token } = {}) => {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.25.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, daten: d };
  };
  const person = (id, rolle) => ({ id, vorname: id, nachname: id, rolle, bereich: "e1", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const sitzung = async (pid, rolle) => (await sitzungAnlegen({ bestand: R, name: pid, rolle, person: pid, betrieb: 0,
    mandantId: "m1", einheit: null }, 60 * 60 * 1000)).token;

  beforeAll(async () => {
    await B.bestandSchreiben(laden(), R, { version: 9, mandanten: [{ id: "m1", name: "Haus", einheiten: [{ id: "e1", name: "WB" }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }], personen: [person("l1", "leitung"), person("p1", "mitarbeiter")],
      abweichungen: { "p1|2026-10-01": "F" }, abwesenheiten: [], erfassung: {},
      einstempeln: { "p1|2023-01-05": { start: "06:00", ende: "14:00" } }, anfragen: [], aenderungen: [], nachrichten: [] }] },
    { durch: "Pruefung" });
  });

  it("Leitung: anlegen, auflisten (Format wie eintragText), zurückspielen → 200 mit Fristen-Meldung", async () => {
    const t = await sitzung("l1", "leitung");
    expect((await anfrage("/api/sicherung", { methode: "POST", token: t })).status).toBe(200);
    const l = await anfrage("/api/sicherungen", { token: t });
    expect(l.status).toBe(200);
    const e = l.daten.sicherungen[0];
    expect(Object.keys(e).sort()).toEqual(["automatisch", "durch", "marke", "umfang", "zeit"]);
    expect(U.eintragText(e).text).toMatch(/^dieser Betrieb/);
    const g = await anfrage("/api/bestand", { token: t });
    const w = await anfrage("/api/wiederherstellen", { methode: "POST", token: t, rumpf: { marke: e.marke, etag: g.daten.etag } });
    const m = U.ergebnisMeldung(w);
    expect(m.ok, JSON.stringify(w).slice(0, 300)).toBe(true);
    /* Datenschutzlauf auf Vorgabe „vorschau": nichts gelöscht, Fälliges gemeldet (WP-26). */
    expect(w.daten.fristen).toMatchObject({ modus: "vorschau", geloescht: false });
    expect(m.fristen).toMatch(/nicht gelöscht/);
    /* Alter Stand (ETag) → 409, die Oberfläche bietet „neu laden“ an. */
    const w2 = await anfrage("/api/wiederherstellen", { methode: "POST", token: t, rumpf: { marke: e.marke, etag: g.daten.etag } });
    expect(w2.status).toBe(409);
    expect(U.ergebnisMeldung(w2).neuLaden).toBe(true);
  });

  it("Kundenrolle sieht die Liste, zurückspielen → 403 (wie die Oberfläche); Beschäftigte sehen nichts", async () => {
    const tk = await sitzungAnlegen({ bestand: R, name: "Kunde", rolle: "kunde", person: null, betrieb: 0, mandantId: "m1", einheit: null },
      60 * 60 * 1000);
    const lk = await anfrage("/api/sicherungen", { token: tk.token });
    expect(lk.status, JSON.stringify(lk.daten)).toBe(200);
    const w = await anfrage("/api/wiederherstellen", { methode: "POST", token: tk.token, rumpf: { marke: "2026-11-01-08-00-00-0001", etag: "1" } });
    expect(w.status).toBe(403);
    expect(U.ergebnisMeldung(w).ok).toBe(false);
    expect((await anfrage("/api/sicherungen", { token: await sitzung("p1", "mitarbeiter") })).status).toBe(403);
  });

  it("unlesbare Datei: 503 BESTAND_UNLESBAR — die Oberfläche verweist auf Betreiber und §4a", async () => {
    const t = await sitzung("l1", "leitung");
    const l = await anfrage("/api/sicherungen", { token: t });
    const g = await anfrage("/api/bestand", { token: t });
    const { dateiname } = await import("../server/lib/ablage.mjs");
    await writeFile(path.join(wurzel, "centric", dateiname(`scherbe:${R}:m1:2026-10`)), "{kaputt");
    const w = await anfrage("/api/wiederherstellen", { methode: "POST", token: t,
      rumpf: { marke: l.daten.sicherungen[0].marke, etag: g.daten.etag } });
    expect(w.status, JSON.stringify(w)).toBe(503);
    expect(w.daten.code).toBe("BESTAND_UNLESBAR");
    expect(U.ergebnisMeldung(w).text).toBe(U.UNLESBAR_TEXT);
  });
});

describe("speicher.js: ETag mitschicken und übernehmen", () => {
  it("wiederherstellen schickt Marke und den ETag des letzten Ladens, übernimmt den neuen; Absage ist keine leere Liste", async () => {
    const aufrufe = [];
    let antwort = null;
    const altFetch = globalThis.fetch;
    globalThis.fetch = async (url, opt = {}) => {
      aufrufe.push({ url, body: opt.body ? JSON.parse(opt.body) : null });
      const { status, daten: d } = antwort(url);
      return new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
    };
    try {
      vi.resetModules();
      const SP = await import("../src/speicher.js");
      antwort = () => ({ status: 200, daten: { etag: "7", bestand: { mandanten: [] }, rolle: "leitung" } });
      await SP.lies();
      antwort = () => ({ status: 200, daten: { ok: true, etag: "8", marke: "m", fristen: null } });
      const a = await SP.wiederherstellen("m");
      expect(a.status).toBe(200);
      expect(aufrufe.at(-1)).toEqual({ url: "/api/wiederherstellen", body: { marke: "m", etag: "7" } });
      await SP.wiederherstellen("m");
      expect(aufrufe.at(-1).body.etag).toBe("8");
      antwort = () => ({ status: 403, daten: { fehler: "Sicherungen sieht die Leitung." } });
      await expect(SP.sicherungen()).rejects.toThrow(/Sicherungen sieht die Leitung/);
    } finally { globalThis.fetch = altFetch; }
  });
});

/* ==========================================================================
   WP-19.4 — Oberfläche der Archivierung des Änderungsprotokolls (E7 b, Betreiberentscheidung 2026-11-26)

   Invarianten (docs/acc45/WP19-MODULPLAN.md 17.1, Abschnitt „Oberfläche“):
     U1  Nur die Leitung sieht den Abschnitt (wie am Server A7); Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Unbekanntes nicht.
     U2  Der Export entfernt nichts; Download allein ist kein Nachweis (Hinweis DMS/geeigneter Kundenort, keine Serverablage).
     U3  Das Entfernen ist gesperrt (ARCHIV_ENTFERNEN_FREIGEGEBEN): Schaltfläche gesperrt, Hinweis sichtbar, und der Auslöser
         selbst schickt ohne Freigabe nie eine Anfrage.
     U4  Fail-closed: unlesbar, leer, ungültiges Aktenzeichen, Download nicht ausgeführt, Serverfehler — sichtbar, nie „erfolgreich“.
     U5  Lücke und Höchstzahl sind sichtbar; bisherige Archivierungsvermerke werden gezeigt.
     U6  Das Paket passt zu dem, was der Server prüft (Anzahl, Bytes, Prüfsumme); E9 Aktenzeichen nur nach Muster, auch am Server.
   ========================================================================== */
// zeit-ok: Die Oberfläche stempelt den Export mit der Uhr des Geräts; die Tests geben den Zeitpunkt vor.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import {
  ARCHIV_ENTFERNEN_FREIGEGEBEN, bereichsArchivStatus, bereichsArchivPaket, bereichsArchivEntfernen, bereichsArchivExportieren, BereichsArchivAnsicht, BereichsArchiv,
} from "../src/module/bereichsplan-archiv.js";
import { BereichsErgaenzung } from "../src/module/bereichsplan-pflege.js";
import { modulKontext, protokollArchivFuer } from "../src/module/zugriff.js";
import { bereichsprotokollArchivieren, bereichsprotokollExport, bereichsprotokollPruefsumme, BEREICH_PROTOKOLL_ART, BEREICH_ARCHIV_ART, BEREICH_LUECKE_ART, BEREICH_LUECKE_GRENZE }
  from "../server/lib/modul-bereichsplan.mjs";
import { bereichsprotokollArchivierenSenden } from "../src/speicher.js";

const AM = "2026-11-27T09:30:00.000Z";
const eintrag = (i) => ({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am: `2026-10-${String(10 + (i % 18)).padStart(2, "0")}T08:00:00.000Z`,
  von: "s1", einheit: "e1", anzahl: 1, zuordnungen: [{ person: "a1", tag: "2026-11-02", vorher: null, nachher: "b1" }] });
const luecke = { art: BEREICH_LUECKE_ART, modul: "bereichsplan", am: "2026-11-01T08:00:00.000Z", von: "l1", rolle: "leitung" };
const vermerk = { art: BEREICH_ARCHIV_ART, modul: "bereichsplan", am: "2026-11-05T08:00:00.000Z", von: "l1", anzahl: 3, bytes: 999,
  pruefsumme: "a".repeat(64), erster: "2026-10-01T08:00:00.000Z", letzter: "2026-10-02T08:00:00.000Z" };
const mit = (modulprotokoll) => ({ personen: [{ id: "l1", vorname: "Lena", nachname: "Muster" }, { id: "a1", vorname: "Ali", nachname: "Test" }],
  einheiten: [{ id: "e1", bereiche: [{ id: "b1", name: "Wohnbereich Nord" }] }], bereichsPlan: {}, einstellungen: { modulprotokoll } });
const sha = (t) => createHash("sha256").update(Buffer.from(t, "utf8")).digest("hex");
const ansicht = (props) => renderToStaticMarkup(h(BereichsArchivAnsicht, props));
afterEach(() => { vi.unstubAllGlobals(); });

describe("U1 Rechte — nur die Leitung", () => {
  it("protokollArchivFuer und Kontext: nur leitung", () => {
    expect(protokollArchivFuer("leitung")).toBe(true);
    for (const r of ["planer", "subplaner", "mitarbeiter", "betriebsrat", "betreiber", "kunde", "", null, undefined, 1, {}]) expect(protokollArchivFuer(r), String(r)).toBe(false);
    expect(modulKontext({ sitz: { rolle: "leitung", person: { id: "l1" }, mandant: {} } }).protokollArchiv).toBe(true);
    for (const rolle of ["planer", "subplaner", "mitarbeiter", "betriebsrat"])
      expect(modulKontext({ sitz: { rolle, person: { id: "x" }, mandant: {} } }).protokollArchiv, rolle).toBe(false);
    expect(modulKontext({}).protokollArchiv).toBe(false);
  });
  it("Abschnitt erscheint nur mit protokollArchiv; Planung (voll) und Schichtverantwortung sehen ihn nicht", () => {
    const m = mit([eintrag(0)]);
    const k = (extra) => ({ m, einheitId: "e1", datum: "2026-11-02", personenImDienst: [], eigeneEinheit: "e1", akt: { setzeFeld: () => {} }, ...extra });
    const T = "Änderungsprotokoll archivieren";
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k({ bereichSchreiben: "voll", protokollArchiv: true }) }))).toContain(T);
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k({ bereichSchreiben: "voll", protokollArchiv: false }) }))).not.toContain(T);
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k({ bereichSchreiben: "voll" }) }))).not.toContain(T);
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k({ bereichSchreiben: "einheit", protokollArchiv: true }) }))).not.toContain(T);
    expect(renderToStaticMarkup(h(BereichsErgaenzung, { k: k({ bereichSchreiben: null, protokollArchiv: true }) }))).not.toContain(T);
    expect(renderToStaticMarkup(h(BereichsArchiv, { k: k({ protokollArchiv: false }) }))).toBe("");
    expect(renderToStaticMarkup(h(BereichsArchiv, { k: null }))).toBe("");
  });
});

describe("U5 Zustand sichtbar", () => {
  it("Status: Zahl, Bytes, Lücke, Höchstzahl, Vermerke (jüngster zuerst); andere Arten zählen nicht", () => {
    const e = mit([{ art: "eingeschaltet", modul: "bereichsplan", am: "2026-10-01T08:00:00.000Z", von: "l1" }, eintrag(0), eintrag(1), vermerk, luecke]).einstellungen;
    const st = bereichsArchivStatus(e);
    expect(st).toMatchObject({ lesbar: true, vorhanden: 2, hoechstzahl: false });
    expect(st.bytes).toBe(Buffer.byteLength(JSON.stringify([eintrag(0), eintrag(1)]), "utf8"));
    expect(st.luecke).toBe(luecke);
    expect(st.vermerke).toEqual([vermerk]);
    expect(bereichsArchivStatus({}).vorhanden).toBe(0);
    expect(bereichsArchivStatus(undefined).lesbar).toBe(true);
  });
  it("Höchstzahl: genau an der Grenze", () => {
    const luecken = (n) => Array.from({ length: n }, (_, i) => ({ ...luecke, am: `2026-11-01T08:00:${String(i % 60).padStart(2, "0")}.000Z` }));
    expect(bereichsArchivStatus({ modulprotokoll: luecken(BEREICH_LUECKE_GRENZE - 1) }).hoechstzahl).toBe(false);
    expect(bereichsArchivStatus({ modulprotokoll: luecken(BEREICH_LUECKE_GRENZE) }).hoechstzahl).toBe(true);
  });
  it("Ansicht zeigt Lücke, Höchstzahl und bisherige Vermerke mit Name, Anzahl, Bytes, Prüfsumme, Aktenzeichen", () => {
    const luecken = Array.from({ length: BEREICH_LUECKE_GRENZE }, () => luecke);
    const html = ansicht({ m: mit([eintrag(0), { ...vermerk, aktenzeichen: "AZ-2026" }, ...luecken]) });
    expect(html).toContain("Im Änderungsprotokoll der Zuordnungen stehen 1 Einträge");
    expect(html).toContain("Lücke seit 2026-11-01 08:00");
    expect(html).toContain("Höchstzahl der Lückenvermerke erreicht");
    expect(html).toContain("Bisherige Archivierungsvermerke");
    for (const t of ["Lena Muster", "3 Einträge archiviert", "999 Bytes", "a".repeat(64), "Aktenzeichen AZ-2026"]) expect(html).toContain(t);
    // Die Lücke ist mit dem Vermerk der Archivierung beendet: dann keine Lückenmeldung.
    expect(ansicht({ m: mit([eintrag(0), luecke, vermerk]) })).not.toContain("Lücke seit");
    expect(ansicht({ m: mit([eintrag(0)]) })).not.toContain("Bisherige Archivierungsvermerke");
  });
});

describe("U2/U3 Export und gesperrtes Entfernen", () => {
  it("Hinweise: Export entfernt nichts, Download ist kein Nachweis, DMS/Kundenort statt Server; Entfernen gesperrt mit Grund", () => {
    const html = ansicht({ m: mit([eintrag(0)]) });
    for (const t of ["Der Export entfernt nichts", "Download allein ist kein Nachweis", "Dokumentenmanagementsystem", "nicht auf diesen Server",
      "Das Entfernen aus dem Änderungsprotokoll ist gesperrt", "Es wird nichts entfernt"]) expect(html).toContain(t);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-disabled="true"[^>]*>Archivieren und aus dem Protokoll entfernen/);
    expect(html).toMatch(/<button type="button">Änderungsprotokoll exportieren/);
  });
  it("Sperre ist fest eingestellt (Betreiber gibt frei, nicht die Oberfläche)", () => {
    expect(ARCHIV_ENTFERNEN_FREIGEGEBEN).toBe(false);
  });
  it("Auslöser ohne Freigabe: gesperrt, senden wird nie aufgerufen — auch mit Bestätigung und Paket", async () => {
    const senden = vi.fn(async () => ({ ok: true, archiviert: 1 }));
    const paket = { anzahl: 1, bytes: 10, pruefsumme: "b".repeat(64) };
    for (const o of [{}, { bestaetigt: true }, { freigegeben: false, bestaetigt: true }, { freigegeben: "ja", bestaetigt: true }, { freigegeben: 1, bestaetigt: true }]) {
      const r = await bereichsArchivEntfernen(paket, { ...o, senden });
      expect(r.ok, JSON.stringify(o)).toBe(false);
      expect(r.gesperrt).toBe(true);
    }
    expect(senden).not.toHaveBeenCalled();
    // Standardaufruf ohne eigene Optionen (so wie die Schaltfläche): ohne Freigabe gesperrt, kein Netz
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await bereichsArchivEntfernen(paket)).gesperrt).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("Gegenprobe (Freigabe später): nur mit Freigabe UND Bestätigung UND Paket; Fehler und Nicht-Bestätigung bleiben Fehler", async () => {
    const paket = { anzahl: 2, bytes: 10, pruefsumme: "b".repeat(64), aktenzeichen: "AZ-1" };
    const ok = vi.fn(async () => ({ ok: true, archiviert: 2 }));
    expect(await bereichsArchivEntfernen(paket, { freigegeben: true, bestaetigt: true, senden: ok })).toEqual({ ok: true, archiviert: 2 });
    expect(ok).toHaveBeenCalledWith({ anzahl: 2, bytes: 10, pruefsumme: "b".repeat(64), exportGespeichert: true, aktenzeichen: "AZ-1" });
    const nein = vi.fn(async () => ({ ok: true, archiviert: 1 }));
    expect((await bereichsArchivEntfernen(paket, { freigegeben: true, bestaetigt: false, senden: nein })).ok).toBe(false);
    expect((await bereichsArchivEntfernen(null, { freigegeben: true, bestaetigt: true, senden: nein })).ok).toBe(false);
    expect(nein).not.toHaveBeenCalled();
    for (const antwort of [undefined, null, {}, { ok: false }, { ok: true }, { ok: true, archiviert: "2" }]) {
      const r = await bereichsArchivEntfernen(paket, { freigegeben: true, bestaetigt: true, senden: async () => antwort });
      expect(r.ok, JSON.stringify(antwort)).toBe(false);
    }
    const r = await bereichsArchivEntfernen(paket, { freigegeben: true, bestaetigt: true, senden: async () => { throw new Error("Konflikt 409"); } });
    expect(r).toEqual({ ok: false, grund: "Konflikt 409" });
  });
});

describe("U6 Paket passt zum Server", () => {
  it("Paket: Form, Anzahl, Bytes, Prüfsumme (Umlaute), Dateiname; der Server akzeptiert genau diese Werte und trägt das Aktenzeichen im Vermerk", async () => {
    const e = { modulprotokoll: [{ art: "eingeschaltet", modul: "bereichsplan", am: AM, von: "l1" }, eintrag(0), { ...eintrag(1), von: "Ünal" }, eintrag(2)] };
    const r = await bereichsArchivPaket(e, { am: AM, aktenzeichen: " AZ-2026-1 " });
    expect(r.ok).toBe(true);
    const p = JSON.parse(r.text);
    expect(Object.keys(p)).toEqual(["art", "modul", "erstellt", "anzahl", "bytes", "pruefsumme", "pruefsummeUeber", "aktenzeichen", "eintraege"]);
    expect(p).toMatchObject({ art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", erstellt: AM, anzahl: 3, aktenzeichen: "AZ-2026-1" });
    expect(p.eintraege).toEqual([eintrag(0), { ...eintrag(1), von: "Ünal" }, eintrag(2)]);
    expect(p.pruefsumme).toBe(sha(JSON.stringify(p.eintraege)));
    expect(p.bytes).toBe(Buffer.byteLength(JSON.stringify(p.eintraege), "utf8"));
    expect(r).toMatchObject({ anzahl: 3, bytes: p.bytes, pruefsumme: p.pruefsumme, aktenzeichen: "AZ-2026-1", name: "aenderungsprotokoll-zuordnungen-2026-11-27-3.json" });
    // Server: dieselbe Bestätigung wird angenommen, Vermerk mit Aktenzeichen, Eingabe unverändert
    const vorher = JSON.stringify(e);
    const s = await bereichsprotokollArchivieren(e, { anzahl: r.anzahl, bytes: r.bytes, pruefsumme: r.pruefsumme, exportGespeichert: true, aktenzeichen: r.aktenzeichen }, { am: AM, von: "l1" });
    expect(s.grund, s.grund).toBeUndefined();
    expect(JSON.stringify(e)).toBe(vorher);
    expect(s.vermerk).toMatchObject({ art: BEREICH_ARCHIV_ART, anzahl: 3, bytes: r.bytes, pruefsumme: r.pruefsumme, aktenzeichen: "AZ-2026-1", von: "l1" });
    // ohne Aktenzeichen: Feld fehlt im Paket und im Vermerk
    const o = await bereichsArchivPaket(e, { am: AM });
    expect("aktenzeichen" in JSON.parse(o.text)).toBe(false);
    const s2 = await bereichsprotokollArchivieren(e, { anzahl: o.anzahl, bytes: o.bytes, pruefsumme: o.pruefsumme, exportGespeichert: true }, { am: AM, von: "l1" });
    expect("aktenzeichen" in s2.vermerk).toBe(false);
  });
  it("E9: Aktenzeichen nur nach Muster — Oberfläche und Server weisen Freitext ab, nichts wird still verworfen", async () => {
    const e = { modulprotokoll: [eintrag(0)] };
    for (const az of ["Müller hat geändert", "x".repeat(21), "AZ 1", "abc-1", "1-", "AZ-"]) {
      const r = await bereichsArchivPaket(e, { am: AM, aktenzeichen: az });
      expect(r.ok, az).toBe(false);
      expect(r.grund).toContain("Aktenzeichen");
    }
    for (const az of ["2026-11", "AZ-2026", "AZ2026-1-2", "12345678901234567890"]) expect((await bereichsArchivPaket(e, { am: AM, aktenzeichen: az })).ok, az).toBe(true);
    const ex = bereichsprotokollExport(e);
    const b = { anzahl: 1, bytes: ex.bytes, pruefsumme: await bereichsprotokollPruefsumme(ex.text), exportGespeichert: true };
    for (const az of ["Müller", 5, {}, ["AZ-1"], "x".repeat(21)]) {
      const s = await bereichsprotokollArchivieren(e, { ...b, aktenzeichen: az }, { am: AM, von: "l1" });
      expect(s.status, JSON.stringify(az)).toBe(400);
    }
    for (const az of [undefined, null]) expect((await bereichsprotokollArchivieren(e, { ...b, aktenzeichen: az }, { am: AM, von: "l1" })).vermerk).toBeDefined();
  });
  it("U4: kein Paket bei leerem, unlesbarem oder fehlendem Zeitpunkt; Prüfsumme nicht berechenbar → kein Paket", async () => {
    expect((await bereichsArchivPaket({ modulprotokoll: [] }, { am: AM })).ok).toBe(false);
    expect((await bereichsArchivPaket({}, { am: AM })).ok).toBe(false);
    expect((await bereichsArchivPaket({ modulprotokoll: [{ art: "eingeschaltet" }] }, { am: AM })).ok).toBe(false);
    for (const kaputt of ["text", 5, {}, { 0: eintrag(0) }]) {
      const r = await bereichsArchivPaket({ modulprotokoll: kaputt }, { am: AM });
      expect(r.ok, JSON.stringify(kaputt)).toBe(false);
      expect(r.grund).toContain("nicht lesbar");
    }
    expect((await bereichsArchivPaket({ modulprotokoll: [eintrag(0)] }, { am: "" })).ok).toBe(false);
    expect((await bereichsArchivPaket({ modulprotokoll: [eintrag(0)] }, {})).ok).toBe(false);
    const digest = vi.fn(async () => { throw new Error("kein Crypto"); });
    vi.stubGlobal("crypto", { subtle: { digest } });
    const r = await bereichsArchivPaket({ modulprotokoll: [eintrag(0)] }, { am: AM });
    expect(r.ok).toBe(false);
    expect(r.grund).toContain("Prüfsumme");
  });
});

describe("U4 Export-Auslöser: Download nicht ausgeführt = Fehler", () => {
  const e = { modulprotokoll: [eintrag(0), eintrag(1)] };
  it("Erfolg: lade gerufen mit Name, JSON-Text, Typ; Paket und Statusmeldung", async () => {
    const laden = vi.fn(() => true);
    const r = await bereichsArchivExportieren(e, { am: AM, aktenzeichen: "", laden });
    expect(laden).toHaveBeenCalledTimes(1);
    expect(laden.mock.calls[0][0]).toBe("aenderungsprotokoll-zuordnungen-2026-11-27-2.json");
    expect(JSON.parse(laden.mock.calls[0][1]).anzahl).toBe(2);
    expect(laden.mock.calls[0][2]).toBe("application/json");
    expect(r.paket.anzahl).toBe(2);
    expect(r.meldung).toEqual({ fehler: false, text: "Export heruntergeladen. Die Einträge bleiben im Änderungsprotokoll." });
  });
  it("lade false, wirft oder liefert Unbestimmtes → Fehler, kein Paket", async () => {
    for (const laden of [() => false, () => { throw new Error("blockiert"); }, () => undefined, () => "ja"]) {
      const r = await bereichsArchivExportieren(e, { am: AM, laden });
      expect(r.paket).toBeNull();
      expect(r.meldung.fehler).toBe(true);
      expect(r.meldung.text).toContain("nicht ausgeführt");
    }
  });
  it("Paket nicht baubar (leer, ungültiges Aktenzeichen): Fehler, lade nie gerufen", async () => {
    const laden = vi.fn(() => true);
    for (const [einst, az] of [[{ modulprotokoll: [] }, ""], [e, "Freitext hier"], [{ modulprotokoll: "x" }, ""]]) {
      const r = await bereichsArchivExportieren(einst, { am: AM, aktenzeichen: az, laden });
      expect(r.paket).toBeNull();
      expect(r.meldung.fehler).toBe(true);
    }
    expect(laden).not.toHaveBeenCalled();
  });
  it("Ansicht: Fehler als alert, Erfolg als status mit Prüfsumme; Export-Schaltfläche gesperrt bei leerem/unlesbarem Protokoll", () => {
    const m = mit([eintrag(0)]);
    expect(ansicht({ m, meldung: { fehler: true, text: "Der Download wurde auf diesem Gerät nicht ausgeführt." } })).toContain('role="alert" style="margin:0">Der Download');
    const html = ansicht({ m, meldung: { fehler: false, text: "Export heruntergeladen." }, paket: { anzahl: 1, bytes: 7, pruefsumme: "c".repeat(64), aktenzeichen: "AZ-9" } });
    expect(html).toContain('role="status" style="margin:0">Export heruntergeladen.');
    for (const t of ["Export: 1 Einträge, 7 Bytes", "c".repeat(64), "Aktenzeichen AZ-9", "im DMS"]) expect(html).toContain(t);
    expect(ansicht({ m: mit([]) })).toMatch(/<button[^>]*disabled=""[^>]*>Änderungsprotokoll exportieren/);
    const kaputt = ansicht({ m: mit("kaputt") });
    expect(kaputt).toMatch(/<button[^>]*disabled=""[^>]*>Änderungsprotokoll exportieren/);
    expect(kaputt).toContain('role="alert" style="margin:0">Das Änderungsprotokoll ist nicht lesbar');
    expect(kaputt).not.toContain("stehen");
  });
});

describe("Serverweg aus speicher.js: nur ausdrückliche Erfolgsantwort", () => {
  const antwort = (status, daten) => vi.fn(async () => new Response(daten === undefined ? "" : JSON.stringify(daten), { status, headers: { "content-type": "application/json" } }));
  const angabe = { anzahl: 1, bytes: 5, pruefsumme: "d".repeat(64), exportGespeichert: true, aktenzeichen: "AZ-3" };
  it("200 mit ok und Anzahl: Antwort; Anfrage: POST an den richtigen Weg mit der Angabe", async () => {
    const f = antwort(200, { ok: true, archiviert: 1, vermerk: { art: BEREICH_ARCHIV_ART } }); vi.stubGlobal("fetch", f);
    expect(await bereichsprotokollArchivierenSenden(angabe)).toMatchObject({ ok: true, archiviert: 1 });
    expect(f.mock.calls[0][0]).toBe("/api/bereichsprotokoll-archivieren");
    expect(f.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual(angabe);
  });
  it("jede andere Antwort wirft mit dem Text des Servers: 400/403/409/500, 200 ohne ok, ohne Anzahl, leer", async () => {
    for (const [status, daten] of [[409, { fehler: "Der Export passt nicht." }], [403, { fehler: "nur Leitung", text: "Nur die Leitung." }], [400, { fehler: "Form" }],
      [500, undefined], [200, { ok: false }], [200, { ok: true }], [200, {}], [200, undefined], [204, undefined]]) {
      vi.stubGlobal("fetch", antwort(status, daten));
      await expect(bereichsprotokollArchivierenSenden(angabe), `${status} ${JSON.stringify(daten)}`).rejects.toThrow();
    }
    vi.stubGlobal("fetch", antwort(409, { fehler: "Der Export passt nicht." }));
    await expect(bereichsprotokollArchivierenSenden(angabe)).rejects.toThrow("Der Export passt nicht.");
    vi.stubGlobal("fetch", antwort(403, { fehler: "nur Leitung", text: "Nur die Leitung." }));
    await expect(bereichsprotokollArchivierenSenden(angabe)).rejects.toThrow("Nur die Leitung.");
  });
  it("Netzfehler: wirft", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Netz"); }));
    await expect(bereichsprotokollArchivierenSenden(angabe)).rejects.toThrow();
  });
});

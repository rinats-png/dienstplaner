/* ==========================================================================
   P2-12 Folgepunkt (1) aus Review #344 — Client-Behandlung von 422 UNGUELTIGER_KALENDERTAG

   Bisher wurde die Absage im Client zur Fehlerart „unbekannt": Rat „Noch einmal senden" (derselbe Stand, dasselbe
   422), ohne Bereich und ohne den Text des Servers. Jetzt: eigene Lage „kalendertag" mit Bereich (aus `feld`) und dem
   Text des Servers; kein „Noch einmal senden", sondern der bestehende Verwerfen-Weg (ausstehendVerwerfen) und neu
   laden, dazu wie immer „Als Datei sichern". Ein Zurücknehmen genau des einen Eintrags gibt es bewusst nicht (siehe
   src/speicher.js: der Client kennt Schlüssel/gespeicherten Wert nicht sicher — neuer Datenverlustweg).
   Differenz: alle anderen Absagen (auch andere 422) ergeben dieselbe Lage wie vorher (Zustand, nicht nur Status).
   Aufruf: npx vitest run pruefungen/p212-client-kalendertag.test.js
   ========================================================================== */
// zeit-ok: Die Uhr fließt nur in lage.zeit (ISO-Zeitstempel der Absage); die Prüfung vergleicht ihn nicht inhaltlich.
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
const BESTAND = { version: 9, stand: 3, mandanten: [{ id: "m-a", abwesenheiten: [{ id: "x", personId: "p1", art: "urlaub", von: "2026-02-28", bis: "2026-02-30" }] }] };

/** Echter Client (src/speicher.js), fetch liefert die gegebene Antwort auf das PUT. */
async function client(antwort) {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-pruefung" }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  const puts = [];
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    if ((opt.method || "GET") === "PUT") puts.push(JSON.parse(opt.body));
    return new Response(JSON.stringify(antwort.daten), { status: antwort.status, headers: { "content-type": "application/json" } });
  });
  const SP = await import("../src/speicher.js");
  return { SP, puts };
}
async function absage(antwort) {
  const { SP, puts } = await client(antwort);
  const fehler = [], konflikt = [], gespeichert = [];
  await SP.schreib(JSON.parse(JSON.stringify(BESTAND)), { sofort: true, onFehler: (l) => fehler.push(l),
    onKonflikt: (d) => konflikt.push(d), onGespeichert: (x) => gespeichert.push(x) });
  return { SP, puts, fehler, konflikt, gespeichert };
}
const ohneZeit = (l) => { const { zeit, fehler: _f, ...rest } = l; void _f; expect(typeof zeit).toBe("string"); return rest; };

const KT = { status: 422, daten: { fehler: "Diesen Kalendertag gibt es nicht.", code: "UNGUELTIGER_KALENDERTAG",
  text: "Den Kalendertag 2026-02-30 gibt es nicht. Es wurde nichts geändert.", feld: "mandanten[0].abwesenheiten[0].bis" } };

afterEach(() => { vi.unstubAllGlobals(); });

describe("kalendertagBereich", () => {
  it("Bereich aus dem Feld des Servers; Unbekanntes → null", async () => {
    const { SP } = await client(KT);
    const soll = { "mandanten[0].erfassung": "Zeiterfassung (Ist-Zeiten)", "mandanten[0].abweichungen": "Dienstplan (Einteilungen)",
      "mandanten[0].abwesenheiten[2].bis": "Abwesenheiten", "mandanten[1].anfragen[0].von": "Anträge",
      "mandanten[0].ausschreibungen[0].datum": "Ausschreibungen", "mandanten[0].krankmeldungen[0].von": "Krankmeldungen" };
    for (const [feld, bereich] of Object.entries(soll)) expect(SP.kalendertagBereich(feld), feld).toBe(bereich);
    for (const x of [undefined, null, "", "erfassung", "mandanten[0].personen", "mandanten[0].constructor", "mandanten[0].__proto__", 42])
      expect(SP.kalendertagBereich(x), String(x)).toBeNull();
  });
});

describe("Voll-PUT: 422 UNGUELTIGER_KALENDERTAG", () => {
  it("eigene Lage mit Bereich, Feld und Text des Servers; Auftrag bleibt zum Sichern; verwerfen räumt ihn", async () => {
    const { SP, puts, fehler, konflikt, gespeichert } = await absage(KT);
    expect(puts).toHaveLength(1);
    expect(konflikt).toEqual([]);
    expect(gespeichert).toEqual([]);
    expect(fehler).toHaveLength(1);
    expect(ohneZeit(fehler[0])).toEqual({ art: "kalendertag", text: KT.daten.text, status: 422,
      feld: "mandanten[0].abwesenheiten[0].bis", bereich: "Abwesenheiten" });
    expect(fehler[0].fehler.code).toBe("UNGUELTIGER_KALENDERTAG");
    expect(ohneZeit(SP.ausstehend())).toEqual(ohneZeit({ ...fehler[0], fehler: undefined }));
    /* Sichern als Datei: der nicht gespeicherte Stand, unverändert (der ungültige Eintrag wird nicht still entfernt) */
    expect(SP.ausstehenderBestand()).toEqual(BESTAND);
    SP.ausstehendVerwerfen();
    expect(SP.ausstehend()).toBeNull();
    expect(SP.ausstehenderBestand()).toBeNull();
  });
  it("Feld/Text fehlen oder sind keine Zeichenketten: Lage ohne Bereich, Text aus `fehler`", async () => {
    const { fehler } = await absage({ status: 422, daten: { fehler: "Diesen Kalendertag gibt es nicht.", code: "UNGUELTIGER_KALENDERTAG", feld: { x: 1 }, text: 7 } });
    expect(ohneZeit(fehler[0])).toEqual({ art: "kalendertag", text: "Diesen Kalendertag gibt es nicht.", status: 422, feld: null, bereich: null });
  });
  it("Differenz: andere Absagen ergeben genau die Lage wie bisher (Art, Text, Status — keine Zusatzfelder)", async () => {
    const faelle = [
      [{ status: 422, daten: { fehler: "Die Dienstart ist unvollständig.", text: "x", feld: "mandanten[0].dienstarten[0].mindest" } }, { art: "unbekannt", text: "Die Dienstart ist unvollständig.", status: 422 }],
      [{ status: 422, daten: { fehler: "Teile ungültig.", code: "TEILE_UNGUELTIG", feld: "mandanten[0].erfassung" } }, { art: "unbekannt", text: "Teile ungültig.", status: 422 }],
      [{ status: 400, daten: { fehler: "Kaputt.", code: "UNGUELTIGER_KALENDERTAG", feld: "mandanten[0].erfassung" } }, { art: "unbekannt", text: "Kaputt.", status: 400 }],
      [{ status: 403, daten: { fehler: "Keine Schreibberechtigung." } }, { art: "keinRecht", text: "Keine Schreibberechtigung.", status: 403 }],
      [{ status: 413, daten: { fehler: "Zu groß." } }, { art: "zuGross", text: "Zu groß.", status: 413 }],
      [{ status: 500, daten: { fehler: "Serverfehler." } }, { art: "server", text: "Serverfehler.", status: 500 }],
    ];
    for (const [antwort, lage] of faelle) {
      const { fehler } = await absage(antwort);
      expect(fehler, JSON.stringify(antwort)).toHaveLength(1);
      expect(ohneZeit(fehler[0]), JSON.stringify(antwort)).toEqual(lage);
    }
  });
  it("200: gespeichert, keine Lage (unverändert)", async () => {
    const { SP, fehler, gespeichert } = await absage({ status: 200, daten: { ok: true, etag: "4" } });
    expect(fehler).toEqual([]);
    expect(gespeichert).toHaveLength(1);
    expect(SP.ausstehend()).toBeNull();
  });
});

describe("Leiste „nicht gespeichert“", () => {
  const rendern = async (lage) => {
    const { NichtGespeichert, SPEICHERLAGE } = await import("../src/ansichten/speicherlage.jsx");
    return { html: renderToStaticMarkup(React.createElement(NichtGespeichert, { lage, melde: () => {}, aufGeloest: () => {} })), SPEICHERLAGE };
  };
  it("kalendertag: Bereich und Text des Servers, Verwerfen-Weg und Sichern — kein „Noch einmal senden“", async () => {
    const { html, SPEICHERLAGE } = await rendern({ art: "kalendertag", text: KT.daten.text, status: 422, zeit: "2026-03-01T08:00:00.000Z",
      feld: "mandanten[0].abwesenheiten[0].bis", bereich: "Abwesenheiten" });
    expect(SPEICHERLAGE.kalendertag).toMatchObject({ verwerfen: true });
    expect(SPEICHERLAGE.kalendertag.nochmal).toBeUndefined();
    expect(html).toContain("Ein Datum gibt es nicht");
    expect(html).toContain("ungültiges Datum");
    expect(html).toContain("Bereich: <strong>Abwesenheiten</strong>");
    expect(html).toContain("Den Kalendertag 2026-02-30 gibt es nicht. Es wurde nichts geändert.");
    expect(html).toContain("Änderungen verwerfen und neu laden");
    expect(html).toContain("Als Datei sichern");
    expect(html).not.toContain("Noch einmal senden");
  });
  it("Differenz: die übrigen Lagen zeigen weder Bereichszeile noch Verwerfen-Knopf", async () => {
    const { SPEICHERLAGE } = await rendern(null);
    for (const art of Object.keys(SPEICHERLAGE).filter((a) => a !== "kalendertag")) {
      const { html } = await rendern({ art, text: "Meldung", status: 500, zeit: "2026-03-01T08:00:00.000Z" });
      expect(html, art).not.toContain("Änderungen verwerfen und neu laden");
      expect(html, art).not.toContain("Bereich:");
      expect(SPEICHERLAGE[art].verwerfen, art).toBeUndefined();
    }
  });
});

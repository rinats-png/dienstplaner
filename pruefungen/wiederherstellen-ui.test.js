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
    expect(U.ergebnisMeldung({ status: 403, daten: { fehler: "Wiederherstellen darf nur die Leitung." } }).titel)
      .toBe("Wiederherstellen darf nur die Leitung.");
    expect(U.ergebnisMeldung({ status: 0, daten: { fehler: "Es wird noch gespeichert." } }).text).toMatch(/noch gespeichert/);
  });

  it("der Bestätigungstext nennt Umfang, Verlust seit der Sicherung, Vorab-Sicherung und Fristen", () => {
    const t = U.BESTAETIGUNG_TEXT.join(" ");
    for (const teil of ["eigene Betrieb", "Andere Betriebe", "fehlt danach", "vorher automatisch gesichert", "Aufbewahrungsfristen"])
      expect(t).toContain(teil);
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
  it("Einstellungen: alter Text „auf die sich später zurückgehen lässt“ ersetzt, Bereich nur für berechtigte Rollen", async () => {
    const quelle = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "App.jsx"), "utf8");
    expect(quelle).not.toContain("auf die sich später zurückgehen lässt");
    expect(quelle).toMatch(/darfSicherungenSehen\(serverRolle\) && \(\s*<SicherungenVerwalten/);
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

/* ==========================================================================
   INTELLIGENCE-OBERFLÄCHE — KiEntwurf, Client, Texte (WP-I17)

   Gerendert wird mit renderToStaticMarkup (wie oberflaeche-render.test.js); Antworten stammen
   aus dem echten Gateway gegen die Attrappe, nicht aus Handschrift. Geprüft: fünf Zustände,
   Kennzeichnung „KI-Entwurf“, Rollensicht, Escaping (XSS), Platzhalter, Client nur unter /ki,
   Kennzeichnungsprüfung im Client, keine Anbieter-/Token-/Modellangaben, keine console-Ausgabe.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { appQuelle } from "./app-quelle.js";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KiEntwurf, KI_ROLLEN, textTeile } from "../src/ansichten/intelligence/KiEntwurf.jsx";
import { useKiVorgang } from "../src/ansichten/intelligence/useKiVorgang.js";
import { kiClient, antwortLesen, KI_PFADE } from "../src/ansichten/intelligence/ki-client.js";
import { KI_TEXTE, KI_FEHLERTEXTE, kiFehlerText } from "../src/ansichten/intelligence/texte.js";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, S, vollQuelle } from "./intelligence-gateway-fixture.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDNER = path.join(WURZEL, "src/ansichten/intelligence");
const html = (props) => renderToStaticMarkup(h(KiEntwurf, props));

async function echteAntwort(modus = "ok", skript) {
  const gw = erzeugeGateway({ anbieter: erzeugeAttrappe({ modus, skript }), ladeBestand: () => bestand(), aliasSchluessel: () => SCHLUESSEL, versionen: VERSIONEN,
    limits: new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 }), audit: erzeugeAudit({ senke: () => {} }),
    schalter: { prozess: () => "an", laufzeit: () => "an" }, betriebAktiv: () => true, funktionenFreigegeben: ["F2"], faktenquelle: vollQuelle,
    zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 }, schlafen: () => Promise.resolve() });
  return gw.ausfuehren(S.leitung, { funktion: "F2", eingabe: { zeitraum: ZR } });
}

describe("fünf Zustände", () => {
  it("leer: Hinweis, ohne Entwurfskennzeichnung", () => {
    const m = html({ rolle: "leitung" });
    expect(m).toContain(KI_TEXTE.leer);
    expect(m).not.toContain(KI_TEXTE.kennzeichnung);
  });
  it("laedt: aria-busy, role=status, aria-live", () => {
    const m = html({ rolle: "planer", zustand: "laedt" });
    expect(m).toContain('aria-busy="true"');
    expect(m).toContain('role="status"');
    expect(m).toContain('aria-live="polite"');
    expect(m).toContain(KI_TEXTE.laedt);
  });
  it("rueckfall: der feste Hinweistext, die Planung bleibt benutzbar; keine Entwurfskennzeichnung, kein Code", async () => {
    const r = await echteAntwort("fehler");
    const m = html({ rolle: "leitung", zustand: "rueckfall", antwort: r });
    expect(m).toContain("Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar");
    expect(m).not.toContain(r.rueckfall.code);
    expect(m).not.toContain(KI_TEXTE.kennzeichnung);
  });
  it("fehler: role=alert, fester Text je Code, nie der Code selbst; unbekannter Code → allgemeiner Text", () => {
    for (const [code, text] of Object.entries(KI_FEHLERTEXTE)) {
      const m = html({ rolle: "leitung", zustand: "fehler", fehlercode: code });
      expect(m).toContain('role="alert"');
      expect(m).toContain(text.replace(/&/g, "&amp;"));
      expect(m).not.toContain(code);
    }
    for (const c of [null, undefined, "KI_ERFUNDEN", "__proto__", "toString", 5]) expect(kiFehlerText(c)).toBe(KI_TEXTE.fehler);
  });
  it("fertig: echte Antwort des Gateways → „KI-Entwurf“, „Nicht veröffentlicht“, Hinweis, Text", async () => {
    const r = await echteAntwort();
    expect(r.status).toBe("fertig");
    const m = html({ rolle: "leitung", zustand: "fertig", antwort: r, titel: "Befund erklärt" });
    expect(m).toContain("KI-Entwurf");
    expect(m).toContain("Nicht veröffentlicht");
    expect(m).toContain(KI_TEXTE.hinweis);
    expect(m).toContain("Befund erklärt");
    expect(m).toContain(r.ergebnis.text.replace(/&/g, "&amp;"));
    expect(m).not.toMatch(/Veröffentlichen|Übernehmen|<button|<a /);
  });
  it("unbekannter Zustand → leer (nie ein Absturz)", () => {
    expect(() => html({ rolle: "leitung", zustand: "irgendwas" })).not.toThrow();
    expect(html({ rolle: "leitung", zustand: "irgendwas" })).toContain(KI_TEXTE.leer);
  });
});

describe("O1 Rollensicht", () => {
  it("Leitung und Planung sehen jede Funktion, Beschäftigte nur F9, alle anderen nichts", async () => {
    expect(KI_ROLLEN).toEqual(["leitung", "planer", "mitarbeiter"]);
    const r = await echteAntwort();
    for (const rolle of ["leitung", "planer"]) for (const funktion of [undefined, "F1", "F2", "F9"]) expect(html({ rolle, funktion, zustand: "fertig", antwort: r })).toContain("KI-Entwurf");
    expect(html({ rolle: "mitarbeiter", funktion: "F9", zustand: "fertig", antwort: r })).toContain("KI-Entwurf");
    for (const funktion of [undefined, "F1", "F2", "F3", "F5", "F4", "f9", "F9 ", 9, null]) for (const zustand of ["leer", "laedt", "fertig", "rueckfall", "fehler"])
      expect(html({ rolle: "mitarbeiter", funktion, zustand, antwort: r, fehlercode: "KI_AUS" }), `mitarbeiter/${funktion}/${zustand}`).toBe("");
    for (const rolle of ["betriebsrat", "betreiber", "subplaner", "kunde", "admin", "", undefined, null, 5, "__proto__"])
      for (const zustand of ["leer", "laedt", "fertig", "rueckfall", "fehler"])
        expect(html({ rolle, zustand, antwort: r, fehlercode: "KI_AUS" }), `${rolle}/${zustand}`).toBe("");
  });
});

describe("O2 Kennzeichnung ist unverzichtbar", () => {
  it("fehlt oder stimmt die Kennzeichnung nicht, wird die Antwort NICHT angezeigt", async () => {
    const r = await echteAntwort();
    const schlecht = [
      { ...r, kennzeichnung: { ...r.kennzeichnung, entwurf: false } },
      { ...r, kennzeichnung: { ...r.kennzeichnung, veroeffentlicht: true } },
      { ...r, kennzeichnung: { ...r.kennzeichnung, kiGestuetzt: false } },
      { ...r, kennzeichnung: { ...r.kennzeichnung, geprueft: false } },
      { ...r, kennzeichnung: undefined },
      { ...r, extra: "feld" },
      { ...r, ergebnis: undefined },
      { ...r, status: "fertig", ergebnis: { text: "x", plan: {} } },
      null, "text", 5, [],
    ];
    for (const a of schlecht) {
      const m = html({ rolle: "leitung", zustand: "fertig", antwort: a });
      expect(m, JSON.stringify(a)).toContain(KI_TEXTE.unbekannteAntwort);
      expect(m).not.toContain(KI_TEXTE.kennzeichnung);
    }
  });
  it("keine Schaltfläche zum Veröffentlichen, kein Link, kein Formular", async () => {
    const m = html({ rolle: "leitung", zustand: "fertig", antwort: await echteAntwort() });
    expect(m).not.toMatch(/<(button|a|form|input|script|iframe)\b/i);
  });
});

describe("O3 Text nur als Text, Platzhalter nur aus der Sicht des Aufrufers", () => {
  const fertig = (text) => ({ status: "fertig", auftragId: "abcdefgh12", kennzeichnung: { kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft: true }, ergebnis: { text } });
  it("HTML und Skript im Text werden maskiert", () => {
    const m = html({ rolle: "leitung", zustand: "fertig", antwort: fertig('<img src=x onerror=alert(1)><script>alert(2)</script> "Anführung" & mehr') });
    expect(m).not.toMatch(/<img|<script/i);
    expect(m).toContain("&lt;img");
    expect(m).toContain("&amp; mehr");
  });
  it("Platzhalter werden über aufloesen ersetzt; ohne Auflösung steht ein neutraler Text; ein werfendes aufloesen stört nicht", () => {
    const a = fertig("Betroffen ist {{person:a1}} im Bereich {{einheit:e1}}.");
    expect(html({ rolle: "leitung", zustand: "fertig", antwort: a, aufloesen: (typ, id) => (typ === "person" ? `Name-${id}` : null) })).toContain("Name-a1");
    const ohne = html({ rolle: "leitung", zustand: "fertig", antwort: a });
    expect(ohne).toContain(KI_TEXTE.person);
    expect(ohne).toContain(KI_TEXTE.einheit);
    expect(ohne).not.toContain("a1");
    expect(() => html({ rolle: "leitung", zustand: "fertig", antwort: a, aufloesen: () => { throw new Error("x"); } })).not.toThrow();
    expect(html({ rolle: "leitung", zustand: "fertig", antwort: a, aufloesen: () => ({ evil: 1 }) })).toContain(KI_TEXTE.person);
  });
  it("aufgelöster Name wird ebenfalls maskiert", () => {
    expect(html({ rolle: "leitung", zustand: "fertig", antwort: fertig("Es betrifft {{person:a1}}."), aufloesen: () => "<b>X</b>" })).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
  it("textTeile zerlegt genau die bekannten Platzhalter und nichts sonst", () => {
    expect(textTeile("a {{person:x1}} b {{unbekannt:y}} {{person:}}", () => "N")).toEqual(["a ", "N", " b {{unbekannt:y}} {{person:}}"]);
    expect(textTeile("", null)).toEqual([]);
  });
  it("Bausteine erscheinen nur, wenn der Aufrufer Baustein-Texte liefert (Katalog fachlich offen)", () => {
    const a = { status: "fertig", auftragId: "abcdefgh12", kennzeichnung: { kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft: true },
      ergebnis: { bausteine: [{ id: "erklaere", parameter: [{ name: "ziel", wert: "P_BCDFGHJK" }] }] } };
    expect(html({ rolle: "leitung", zustand: "fertig", antwort: a })).toContain(KI_TEXTE.leer);
    const m = html({ rolle: "leitung", zustand: "fertig", antwort: a, bausteinText: (id) => `Text zu ${id}` });
    expect(m).toContain("<li>Text zu erklaere</li>");
    expect(m).not.toContain("P_BCDFGHJK");
  });
});

describe("Client: nur /ki, Antwort wird geprüft", () => {
  const antwortJson = async (modus) => JSON.parse(JSON.stringify(await echteAntwort(modus)));
  const fetchMit = (antworten, log = []) => async (url, init) => {
    log.push({ url, init });
    const a = antworten.shift();
    return { status: a.status, json: async () => { if (a.fehler) throw new Error("kein JSON"); return a.body; } };
  };
  const anf = { funktion: "F2", eingabe: { zeitraum: ZR } };

  it("C1 alle Aufrufe gehen an Pfade unter /ki, same-origin, ohne absolute Adresse", async () => {
    const log = [];
    const c = kiClient({ fetchFn: fetchMit([{ status: 200, body: await antwortJson("ok") }], log), kopf: () => ({ authorization: "Bearer abcdef0123456789", "x-fremd": "1" }) });
    const r = await c.anfragen(anf);
    expect(log[0].init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer abcdef0123456789" });   // C6, nur dieser Kopf
    expect(r.zustand).toBe("fertig");
    expect(log.map((l) => l.url)).toEqual([KI_PFADE.anfrage]);
    expect(log[0].url.startsWith("/ki/")).toBe(true);
    expect(log[0].init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(JSON.parse(log[0].init.body)).toEqual(anf);
  });
  it("202 → Abfrage bis fertig (Takt, Auftragskennung kodiert)", async () => {
    const log = []; const fertig = await antwortJson("ok");
    const wartet = { status: "wartet", auftragId: "abcdef_12345", kennzeichnung: fertig.kennzeichnung };
    const c = kiClient({ fetchFn: fetchMit([{ status: 202, body: wartet }, { status: 200, body: { ...wartet, status: "laeuft" } }, { status: 200, body: fertig }], log), schlafen: async () => {} });
    expect((await c.anfragen(anf)).zustand).toBe("fertig");
    expect(log.map((l) => l.url)).toEqual([KI_PFADE.anfrage, KI_PFADE.auftrag("abcdef_12345"), KI_PFADE.auftrag("abcdef_12345")]);
    expect(() => KI_PFADE.auftrag("a/b c")).toThrow();
  });
  it("C4 Gesamtfrist: bleibt der Auftrag liegen, endet die Abfrage mit fehler", async () => {
    const fertig = await antwortJson("ok"); let t = 0;
    const wartet = { status: "laeuft", auftragId: "abcdefgh12", kennzeichnung: fertig.kennzeichnung };
    const c = kiClient({ fetchFn: async () => ({ status: 200, json: async () => wartet }), schlafen: async () => { t += 40_000; }, jetzt: () => t });
    expect((await c.anfragen(anf)).zustand).toBe("fehler");
  });
  it("Rückfall und Servercodes werden durchgereicht; Netz- und JSON-Fehler werfen nie", async () => {
    const rf = await antwortJson("fehler");
    expect(await kiClient({ fetchFn: fetchMit([{ status: 200, body: rf }]) }).anfragen(anf)).toMatchObject({ zustand: "rueckfall" });
    expect(await kiClient({ fetchFn: fetchMit([{ status: 403, body: { code: "KI_ROLLE" } }]) }).anfragen(anf)).toEqual({ zustand: "fehler", fehlercode: "KI_ROLLE" });
    expect(await kiClient({ fetchFn: fetchMit([{ status: 503, body: { code: "Anna Weberknecht" } }]) }).anfragen(anf)).toMatchObject({ zustand: "fehler" });
    expect(await kiClient({ fetchFn: async () => { throw new Error("offline"); } }).anfragen(anf)).toEqual({ zustand: "fehler", fehlercode: null });
    expect(await kiClient({ fetchFn: fetchMit([{ status: 200, fehler: true }]) }).anfragen(anf)).toMatchObject({ zustand: "fehler" });
  });
  it("C2 eine Antwort ohne Kennzeichnung ist nie ein Ergebnis", async () => {
    const r = await antwortJson("ok");
    for (const b of [{ ...r, kennzeichnung: { ...r.kennzeichnung, veroeffentlicht: true } }, { ...r, kennzeichnung: { ...r.kennzeichnung, geprueft: false } },
      { ...r, kennzeichnung: undefined }, { ...r, status: "dienstplan" }, { plan: {} }, null, "x", 5])
      expect((await kiClient({ fetchFn: fetchMit([{ status: 200, body: b }]) }).anfragen(anf)).zustand, JSON.stringify(b)).toBe("fehler");
    expect(antwortLesen(r).zustand).toBe("fertig");
  });
  it("C6 ungültiger Anmeldekopf wird nicht gesendet; C5 ungültige Auftragskennung erzeugt keinen Pfad", async () => {
    for (const k of [() => ({ authorization: "Basic abc" }), () => ({ authorization: "Bearer x" }), () => ({ authorization: "Bearer a b c d e f g h" }), () => { throw new Error("x"); }, () => null]) {
      const log = [];
      await kiClient({ fetchFn: fetchMit([{ status: 200, body: await antwortJson("ok") }], log), kopf: k }).anfragen(anf);
      expect(log[0].init.headers.authorization).toBeUndefined();
    }
    for (const id of ["../etc", "a/b", "kurz", "x".repeat(65), "abc def12", "%2e%2e%2f%2e%2e", 5, null, undefined]) expect(() => KI_PFADE.auftrag(id), String(id)).toThrow();
    expect(KI_PFADE.auftrag("abcdef_12345")).toBe("/ki/auftrag/abcdef_12345");
    /* eine Antwort mit gefährlicher auftragId kommt schon am Antwortschema nicht vorbei (fehler statt Pfad) */
    const fertig = await antwortJson("ok");
    const boese = { status: "wartet", auftragId: "../../api/x", kennzeichnung: fertig.kennzeichnung };
    const log = [];
    expect((await kiClient({ fetchFn: fetchMit([{ status: 202, body: boese }], log), schlafen: async () => {} }).anfragen(anf)).zustand).toBe("fehler");
    expect(log.length).toBe(1);
  });
  it("ohne fetchFn kein Client; ein Pfad außerhalb /ki kann nicht aufgerufen werden", () => {
    expect(() => kiClient({})).toThrow();
  });
});

describe("Hook", () => {
  it("Anfangszustand leer, Funktionen vorhanden", () => {
    let stand;
    function Probe() { stand = useKiVorgang({ anfragen: async () => ({ zustand: "fertig" }) }); return h("span", null, stand.zustand); }
    expect(renderToStaticMarkup(h(Probe))).toBe("<span>leer</span>");
    expect(typeof stand.starten).toBe("function");
    expect(typeof stand.zuruecksetzen).toBe("function");
  });
});

describe("Quelltext der Oberfläche (statisch)", () => {
  const dateien = readdirSync(ORDNER);
  const quelle = (f) => readFileSync(path.join(ORDNER, f), "utf8");
  const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("die erwarteten Dateien sind da", () => {
    for (const f of ["KiEntwurf.jsx", "ki-client.js", "texte.js", "useKiVorgang.js"]) expect(dateien).toContain(f);
  });
  it("keine Anbieteradresse, kein Anbieter-/Modellname, kein Schlüssel, keine absolute URL", () => {
    for (const f of dateien) {
      const q = quelle(f);
      expect(q, f).not.toMatch(/anthropic|openai|bedrock|claude|haiku|sonnet|opus|api\.\w+\.(com|ai|io)|sk-[A-Za-z0-9]{10,}|x-api-key/i);
      expect(ohneKommentare(q), f).not.toMatch(/https?:\/\/|wss?:\/\/|\/\/[a-z0-9.-]+\.[a-z]{2,}\//i);
    }
  });
  it("O6 kein console.*, kein dangerouslySetInnerHTML, kein eval, kein localStorage mit Antworten", () => {
    for (const f of dateien) expect(ohneKommentare(quelle(f)), f).not.toMatch(/console\.|dangerouslySetInnerHTML|\beval\s*\(|new\s+Function|localStorage|sessionStorage|document\.write|innerHTML/);
  });
  it("nur der Client ruft das Netz (fetchFn); die Komponente nicht", () => {
    expect(ohneKommentare(quelle("KiEntwurf.jsx"))).not.toMatch(/fetch|XMLHttpRequest|WebSocket/);
    expect(ohneKommentare(quelle("useKiVorgang.js"))).not.toMatch(/fetch|XMLHttpRequest|WebSocket/);
    expect(ohneKommentare(quelle("ki-client.js"))).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  });
  it("Farben nur über currentColor (Kontrast folgt dem Umfeld), keine festen Farbwerte", () => {
    for (const f of dateien) expect(ohneKommentare(quelle(f)), f).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
  it("App.jsx hängt die Oberfläche (noch) nicht ein", () => {
    expect(appQuelle()).not.toMatch(/ansichten\/intelligence/);
  });
  it("keine Texte mit Preis, Token oder Modellbezug", () => {
    const alles = JSON.stringify([KI_TEXTE, KI_FEHLERTEXTE]);
    expect(alles).not.toMatch(/token|euro|€|\$|preis|modell|anbieter/i);
  });
});

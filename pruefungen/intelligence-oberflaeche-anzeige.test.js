/* ==========================================================================
   WP-I17 Nachtrag: KiAntwort zeigt eine Gateway-Antwort (Attrappe) direkt an,
   ohne dass der Aufrufer den Zustand wählt, und nie eine Rohantwort.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { anzeigeAus } from "../src/ansichten/intelligence/anzeige.js";
import { KiAntwort } from "../src/ansichten/intelligence/KiAntwort.jsx";
import { KI_TEXTE } from "../src/ansichten/intelligence/texte.js";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { SCHLUESSEL, VERSIONEN, ZR, bestand, S, vollQuelle, schluesselbundTest, registryTest } from "./intelligence-gateway-fixture.mjs";

async function antwort(modus) {
  const gw = erzeugeGateway({ anbieter: erzeugeAttrappe({ modus }), ladeBestand: () => bestand(), schluesselbund: schluesselbundTest(), registry: registryTest(), versionen: VERSIONEN,
    limits: new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 }), audit: erzeugeAudit({ senke: () => {} }),
    schalter: { prozess: () => "an", laufzeit: () => "an" }, betriebAktiv: () => true, funktionenFreigegeben: ["F2"], faktenquelle: vollQuelle,
    zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 }, schlafen: () => Promise.resolve() });
  return gw.ausfuehren(S.leitung, { funktion: "F2", eingabe: { zeitraum: ZR } });
}
const html = (props) => renderToStaticMarkup(h(KiAntwort, props));
const MODI = ["fehler", "begrenzt", "falsche_zahl", "erfundener_alias", "injektion", "fremdes_feld", "zu_gross", "kaputt", "leer", "protoschluessel", "unbekannter_baustein"];
const ROH = ["99999", "P_BCDFGHJK", "boese.example", "<script", "Ignoriere", "loesche_alles", "Anna Weberknecht", "schreibe", "das ist kein Objekt", "aaaaaaaaaa"];

describe("anzeigeAus: Gateway-Antwort zu Zustand", () => {
  it("ok ist fertig, Fehlerfälle sind rueckfall, Müll ist fehler, nie ein Wurf", async () => {
    expect(anzeigeAus(await antwort("ok")).zustand).toBe("fertig");
    for (const m of MODI) expect(anzeigeAus(await antwort(m)).zustand, m).toBe("rueckfall");
    for (const x of [null, undefined, 5, "text", [], {}, { status: "fertig" }]) expect(anzeigeAus(x).zustand).toBe("fehler");
  });
});

describe("KiAntwort: nie eine Rohantwort, immer Rückfall-Hinweis", () => {
  it("ok zeigt die Kennzeichnung", async () => {
    const out = html({ rolle: "leitung", antwort: await antwort("ok") });
    expect(out).toContain(KI_TEXTE.kennzeichnung);
    expect(out).toContain("Nicht veröffentlicht");
  });
  it("jeder Fehler-Modus: keine Rohinhalte im Markup; fester Rückfall-Hinweis, kein Code", async () => {
    for (const m of MODI) {
      const r = await antwort(m);
      const out = html({ rolle: "leitung", antwort: r });
      for (const roh of ROH) expect(out, `${m}: ${roh}`).not.toContain(roh);
      expect(out, m).toContain("Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar");
      expect(out, m).not.toContain(KI_TEXTE.kennzeichnung);
      if (r.rueckfall && r.rueckfall.code) expect(out, m).not.toContain(r.rueckfall.code);
    }
  });
  it("eine Antwort mit zusätzlichen Rohfeldern wird nicht angezeigt", async () => {
    const ok = await antwort("ok");
    const out = html({ rolle: "leitung", antwort: { ...ok, rohantwort: "GEHEIMER-ROHTEXT" } });
    expect(out).not.toContain("GEHEIMER-ROHTEXT");
    expect(out).not.toContain(KI_TEXTE.kennzeichnung);
  });
  it("Rollensicht bleibt: Betriebsrat sieht nichts, Beschäftigte nur F9", async () => {
    const r = await antwort("ok");
    expect(html({ rolle: "betriebsrat", antwort: r })).toBe("");
    expect(html({ rolle: "mitarbeiter", funktion: "F2", antwort: r })).toBe("");
    expect(html({ rolle: "mitarbeiter", funktion: "F9", antwort: r })).toContain("KI-Entwurf");
  });
  it("ohne Antwort leer, laufender Vorgang laedt", () => {
    expect(html({ rolle: "leitung" })).toContain(KI_TEXTE.leer);
    expect(html({ rolle: "leitung", laedt: true })).toContain('aria-busy="true"');
  });
  it("Quelltext: kein console, kein Netz, kein innerHTML", () => {
    const q = readFileSync(new URL("../src/ansichten/intelligence/KiAntwort.jsx", import.meta.url), "utf8")
      + readFileSync(new URL("../src/ansichten/intelligence/anzeige.js", import.meta.url), "utf8");
    expect(q).not.toMatch(/console\.|fetch\(|dangerouslySetInnerHTML|innerHTML|localStorage|https?:\/\//);
  });
});

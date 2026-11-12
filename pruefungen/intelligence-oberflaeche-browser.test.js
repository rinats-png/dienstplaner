/* ==========================================================================
   Intelligence-Oberfläche browserfähig: KiAntwort und die Bytezählung dürfen
   keine Node-API (Buffer) brauchen. Die Antworten werden mit Node erzeugt,
   dann wird globalThis.Buffer entfernt und gerendert wie im Browser.
   ========================================================================== */
import { describe, it, expect, afterEach } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { KiAntwort } from "../src/ansichten/intelligence/KiAntwort.jsx";
import { KI_TEXTE } from "../src/ansichten/intelligence/texte.js";
import { strukturPruefen } from "../server/lib/intelligence/schemas.mjs";
import { byteLaenge } from "../server/lib/intelligence/bytes.mjs";
import { erzeugeGateway } from "../server/lib/intelligence/gateway/gateway.mjs";
import { erzeugeAttrappe } from "../server/lib/intelligence/gateway/attrappe.mjs";
import { Limits } from "../server/lib/intelligence/gateway/limits.mjs";
import { erzeugeAudit } from "../server/lib/intelligence/gateway/audit.mjs";
import { VERSIONEN, ZR, bestand, S, vollQuelle, schluesselbundTest, registryTest } from "./intelligence-gateway-fixture.mjs";

async function antwort(modus) {
  const gw = erzeugeGateway({ anbieter: erzeugeAttrappe({ modus }), ladeBestand: () => bestand(), schluesselbund: schluesselbundTest(), registry: registryTest(), versionen: VERSIONEN,
    limits: new Limits({ betriebKontingentIE: 700, gesamtTagesIE: 1000, gesamtHartTagesIE: 2000 }), audit: erzeugeAudit({ senke: () => {} }),
    schalter: { prozess: () => "an", laufzeit: () => "an" }, betriebAktiv: () => true, funktionenFreigegeben: ["F2"], faktenquelle: vollQuelle,
    zeiten: { stufeMs: 250, deadlineMs: 2000, maxWiederholungen: 0, minRestMs: 0 }, schlafen: () => Promise.resolve() });
  return gw.ausfuehren(S.leitung, { funktion: "F2", eingabe: { zeitraum: ZR } });
}

const BUFFER = globalThis.Buffer;
afterEach(() => { globalThis.Buffer = BUFFER; });

describe("byteLaenge entspricht Buffer.byteLength", () => {
  const faelle = { leer: "", ascii: "Dienstplan 123", umlaute: "Ärger über Öl ß", emoji: "👩‍⚕️ 😀", kombiniert: "é ä", einzelnerHigh: "a\ud800b", einzelnerLow: "a\udc00b", ende: "x\ud83d" };
  for (const [n, t] of Object.entries(faelle)) it(n, () => expect(byteLaenge(t)).toBe(BUFFER.byteLength(t, "utf8")));
});

describe("byteLaenge: Nicht-Text wirft wie Buffer.byteLength", () => {
  for (const x of [undefined, 5, null, {}, Symbol("s")]) it(String(typeof x) + " " + String(x === null ? "null" : typeof x === "symbol" ? "sym" : x), () => { expect(() => BUFFER.byteLength(x, "utf8")).toThrow(TypeError); expect(() => byteLaenge(x)).toThrow(TypeError); });
  it("strukturPruefen: undefined, Funktion, Symbol werden weiter abgelehnt (schon vor der Größenprüfung)", () => {
    expect(strukturPruefen(undefined)).toEqual(["$: Typ undefined nicht erlaubt"]);
    expect(strukturPruefen(() => 1)).toEqual(["$: Typ function nicht erlaubt"]);
    expect(strukturPruefen(Symbol("s"))).toEqual(["$: Typ symbol nicht erlaubt"]);
    expect(strukturPruefen({ a: 1 })).toEqual([]);
  });
});

describe("KiAntwort ohne Buffer (Browser)", () => {
  it("rendert fertig, Rückfall, Injektion, nicht verfügbar und läuft", async () => {
    const ok = await antwort("ok");
    const inj = await antwort("injektion");
    const fehler = await antwort("fehler");
    delete globalThis.Buffer;
    expect(typeof globalThis.Buffer).toBe("undefined");
    const html = (p) => renderToStaticMarkup(h(KiAntwort, { rolle: "leitung", ...p }));
    expect(html({ antwort: ok })).toContain(KI_TEXTE.kennzeichnung);
    for (const r of [inj, fehler]) expect(html({ antwort: r })).toContain("Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar");
    expect(html({ antwort: { status: "fertig" } })).not.toContain(KI_TEXTE.kennzeichnung);
    expect(html({ laedt: true })).toContain("aria-busy");
    expect(html({})).toContain(KI_TEXTE.leer);
  });
  it("Quelltext der Client-Intelligence und seiner Importe nutzt keine Node-APIs", () => {
    const dateien = [
      ...readdirSync(new URL("../src/ansichten/intelligence/", import.meta.url)).map((f) => new URL(`../src/ansichten/intelligence/${f}`, import.meta.url)),
      new URL("../server/lib/intelligence/schemas.mjs", import.meta.url), new URL("../server/lib/intelligence/felder.mjs", import.meta.url), new URL("../server/lib/intelligence/bytes.mjs", import.meta.url)];
    for (const d of dateien) expect(readFileSync(d, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), d.pathname).not.toMatch(/\bBuffer\b|\bprocess\.|node:|require\(/);
  });
});

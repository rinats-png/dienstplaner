// ZEIT-F, T-E2E-TZ (docs/acc45/ZEIT-BETRIEBSTAG-VERTRAG.md § 9.2): Zonenprojekte der Playwright-Suite, ohne Browser.
//
// Prüft die Verdrahtung in playwright.config.mjs (e2e/zonen.mjs) und dass die gewählten Zonen den Gerätetag am
// Abnahmezeitpunkt bzw. um 23:58/00:02 Berlin wirklich vom Betriebstag trennen — sonst wäre der Browserlauf
// (e2e/zeit-f-zonen.spec.mjs) kein Gegenbeweis. Den Lauf selbst zeigt die Browserabnahme (CI-Job browser-abnahme).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import konfiguration from "../playwright.config.mjs";
import { ZONEN_PROJEKTE, ZONEN_SPEC, ZONEN_VIEWPORT, B7_ZONENPROJEKT } from "../e2e/zonen.mjs";
import { VIEWPORTS, ZUSATZ_ZUGAENGE, OEFFNEN_ZUGAENGE, ZONEN_ZUGAENGE } from "../e2e/umgebung.mjs";
import { ABNAHME_ZEITPUNKT, tagPlus } from "../e2e/zeitbasis.mjs";
import { betriebstag, zeitpunktAusWanduhr } from "../server/lib/betriebszeit.mjs";

/** Kalendertag eines Zeitpunkts in einer Zone (so läse ihn ein Gerät mit dieser Ortszeit). */
const tagIn = (ms, zone) => new Intl.DateTimeFormat("sv-SE", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date(ms));

const zone = (name) => ZONEN_PROJEKTE.find((z) => z.name === name).timezoneId;

describe("Zonenprojekte in playwright.config.mjs", () => {
  it("die drei Zonen des Vertrags und Pago Pago, jede gültige IANA-Zone ungleich der Betriebszone", () => {
    expect(ZONEN_PROJEKTE.map((z) => [z.name, z.timezoneId])).toEqual([
      ["tz-utc", "UTC"], ["tz-newyork", "America/New_York"], ["tz-tokyo", "Asia/Tokyo"], ["tz-pagopago", "Pacific/Pago_Pago"]]);
    for (const z of ZONEN_PROJEKTE) {
      expect(() => new Intl.DateTimeFormat("de-DE", { timeZone: z.timezoneId }), z.timezoneId).not.toThrow();
      expect(z.timezoneId).not.toBe("Europe/Berlin");
    }
  });

  it("jedes Zonenprojekt fährt nur die Zonen-Spec mit seiner Zone; die Viewport-Projekte lassen sie aus", () => {
    const projekte = konfiguration.projects;
    expect(projekte.map((p) => p.name)).toEqual([...VIEWPORTS.map((v) => v.id), ...ZONEN_PROJEKTE.map((z) => z.name)]);
    for (const v of VIEWPORTS) {
      const p = projekte.find((x) => x.name === v.id);
      expect(p.testIgnore, v.id).toBe(ZONEN_SPEC);
      expect(p.use.timezoneId, `${v.id}: Zone des Rechners wie bisher`).toBeUndefined();
    }
    for (const z of ZONEN_PROJEKTE) {
      const p = projekte.find((x) => x.name === z.name);
      expect(p.testMatch, z.name).toBe(ZONEN_SPEC);
      expect(p.testIgnore, z.name).toBeUndefined();
      expect(p.use).toEqual({ browserName: "chromium", viewport: { ...ZONEN_VIEWPORT }, hasTouch: true, timezoneId: z.timezoneId });
    }
    for (const eigen of ["e2e/zeit-f-zonen.spec.mjs", "e2e/zeit-f-abnahme-b-zonen.spec.mjs"]) expect(ZONEN_SPEC.test(eigen), eigen).toBe(true);
    for (const andere of ["e2e/abnahme-b-ablaeufe.spec.mjs", "e2e/barrierefreiheit.spec.mjs", "e2e/zeit-f-zonen.spec.mjs.bak",
      "e2e/zeit-f-abnahme-b-zonen.spec.mjs.bak", "e2e/zeit-f-sonstwas-zonen.spec.mjs"])
      expect(ZONEN_SPEC.test(andere), andere).toBe(false);
  });

  it("die Spec prüft Stempeluhr (Z1) und Tageswechsel mit page.clock (Z2), ohne die Zeitbasis zu umgehen", () => {
    const spec = readFileSync(new URL("../e2e/zeit-f-zonen.spec.mjs", import.meta.url), "utf8");
    expect(spec).toContain('test("Z1 Stempeluhr und Datum folgen dem Betriebstag des Servers"');
    expect(spec).toContain('test("Z2 Tageswechsel um Mitternacht Berlin, nicht um Mitternacht des Geräts"');
    expect(spec).toContain("page.clock.install(");
    expect(spec).toContain('from "./hilfen.mjs"');                 // Zeitbasis-Init-Skript, Herkunft je Test, axe-Streifen
    expect(spec).not.toMatch(/timezoneId\s*:/);                    // Zone kommt allein aus dem Projekt
    expect(spec).not.toMatch(/test\.only|\.skip\(/);
  });
});

describe("ZEIT-F Rest: Abnahme B in fremder Zone (e2e/zeit-f-abnahme-b-zonen.spec.mjs)", () => {
  const spec = readFileSync(new URL("../e2e/zeit-f-abnahme-b-zonen.spec.mjs", import.meta.url), "utf8");
  const abnahmeB = readFileSync(new URL("../e2e/abnahme-b-ablaeufe.spec.mjs", import.meta.url), "utf8");

  it("Stempeluhr (ZS) in jeder Zone, B7 (ZB7) nur im Zonenprojekt Pago Pago; die Zone kommt allein aus dem Projekt", () => {
    expect(spec).toContain('test("ZS Stempeluhr: Dienst am Betriebstag, noch nicht gestempelt — „Einstempeln“ in jeder Zone"');
    expect(spec).toContain('test("ZB7 Stempeln ohne Netz in Pago Pago: vorläufig, nach dem Netz genau ein Stempel am Berliner Tag"');
    expect(spec).toContain("test.skip(testInfo.project.name !== B7_ZONENPROJEKT,");
    expect(spec.match(/test\.skip\(/g), "genau zwei Auslassungen: B7 außerhalb Pago Pago, Wiederholungslauf").toHaveLength(2);
    expect(spec).toContain("context.setOffline(true)");
    expect(spec).toContain('from "./hilfen.mjs"');
    expect(spec).not.toMatch(/timezoneId\s*:/);
    expect(spec).not.toMatch(/test\.only|page\.clock/);
    expect(B7_ZONENPROJEKT).toBe("tz-pagopago");
    expect(ZONEN_PROJEKTE.map((z) => z.name)).toContain(B7_ZONENPROJEKT);
  });

  it("B7 im Zonenprojekt hat eine eigene Beschäftigte, die kein anderer Zugang nutzt; global-setup legt sie an", () => {
    expect(ZONEN_ZUGAENGE).toEqual([["b7-zone", "mitarbeiter", 4]]);
    /* Beschäftigte im Demo-Bestand: Index 0 Rollenzugang, 1 und 2 Stempeluhr (ZUSATZ_ZUGAENGE), 3 oeffnen-mitarbeiter. */
    const belegt = [0, ...ZUSATZ_ZUGAENGE.map((_, i) => i + 1),
      ...OEFFNEN_ZUGAENGE.filter(([, r]) => r === "mitarbeiter").map(([, , i]) => i)];
    for (const [k, r, i] of ZONEN_ZUGAENGE) {
      expect(r, k).toBe("mitarbeiter");
      expect(belegt, `${k}: Index ${i} frei`).not.toContain(i);
    }
    const schluessel = [...ZUSATZ_ZUGAENGE, ...OEFFNEN_ZUGAENGE.map(([k]) => k), ...ZONEN_ZUGAENGE.map(([k]) => k)];
    expect(new Set(schluessel).size).toBe(schluessel.length);
    expect(readFileSync(new URL("../e2e/global-setup.mjs", import.meta.url), "utf8"))
      .toContain("for (const [k, r, i] of [...OEFFNEN_ZUGAENGE, ...ZONEN_ZUGAENGE])");
    expect(spec).toContain('apiAnmelden("b7-zone")');
    expect(spec).toContain('anmelden(page, "b7-zone")');
  });

  it("§ 9.3: der Berliner Pin der Abnahme B bleibt (zusätzlich, nicht statt)", () => {
    expect(abnahmeB.match(/test\.use\(\{ timezoneId: "Europe\/Berlin" \}\)/g)).toHaveLength(2);
    expect(abnahmeB).not.toContain("rechnet „heute“ in der Ortszeit des Geräts");
  });
});

describe("Die Zonen trennen Gerätetag und Betriebstag wirklich (sonst kein Gegenbeweis)", () => {
  const abnahme = Date.parse(ABNAHME_ZEITPUNKT);
  const tag = betriebstag(new Date(abnahme));
  const mitternacht = zeitpunktAusWanduhr(tagPlus(tag, 1), 0);

  it("Abnahmezeitpunkt 10:00 Berlin: nur in Pago Pago liegt der Gerätetag auf dem Vortag — bis 12:00 Berlin", () => {
    expect(tag).toBe("2026-11-14");
    expect(tagIn(abnahme, zone("tz-pagopago"))).toBe("2026-11-13");
    expect(tagIn(abnahme + 2 * 3600_000 - 1, zone("tz-pagopago")), "Spielraum der Suite: zwei Stunden").toBe("2026-11-13");
    for (const n of ["tz-utc", "tz-newyork", "tz-tokyo"]) expect(tagIn(abnahme, zone(n)), n).toBe(tag);
  });

  it("23:58 Berlin: Tokio schon auf dem Folgetag; 00:02 Berlin: UTC, New York und Pago Pago noch auf dem Vortag", () => {
    const vorher = mitternacht - 2 * 60_000, nachher = mitternacht + 2 * 60_000;
    expect(betriebstag(new Date(vorher))).toBe(tag);
    expect(betriebstag(new Date(nachher))).toBe(tagPlus(tag, 1));
    expect(tagIn(vorher, zone("tz-tokyo"))).toBe(tagPlus(tag, 1));
    for (const n of ["tz-utc", "tz-newyork", "tz-pagopago"]) expect(tagIn(nachher, zone(n)), n).toBe(tag);
  });
});

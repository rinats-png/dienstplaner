/* ==========================================================================
   WP-40 Browser-Abnahme: der Teil, der ohne Browser belegbar ist.

   Das Skript pruefungen/browser/wcag-wp40.mjs misst im Browser (1.4.10 Reflow, 2.5.8 Zielgröße, 2.4.11 Fokus nicht
   verdeckt, 3.3.1 Fehlertext) und ist wie die übrigen Browserproben kein CI-Bestandteil. Hier steht, was ohne Layout-Engine
   geprüft werden kann: die Bewertungsfunktionen (wcag-kern.mjs, abnahme-kern.mjs), die Verknüpfung der Fehlertexte im
   Markup (Field, Fehlerband, Krankmeldung, Antrag, Person hinzufügen) und die Verdrahtung des Skripts.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { verdecktDurchFest, verdecktAnteil, fehlerAmFormular, zulaessigerRollbereich } from "./browser/wcag-kern.mjs";
import { zielgroessenBefunde, reflowOk, fehlertextOk } from "./browser/abnahme-kern.mjs";
import { Field, Inp } from "../src/ui/bausteine.jsx";
import { Fehlerband } from "../src/gestalt/ansichten.jsx";

const LIES = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const FENSTER = { w: 360, h: 740 };

describe("2.4.11 Fokus nicht verdeckt: Bewertung", () => {
  const unten = { l: 0, t: 660, r: 360, b: 740 };            // feste untere Leiste
  const kopf = { l: 0, t: 0, r: 360, b: 56 };                // feste Kopfleiste
  it("Element ganz unter der unteren Leiste ist verdeckt", () => {
    expect(verdecktDurchFest({ l: 20, t: 680, r: 120, b: 720 }, [unten], FENSTER)).toBe(true);
  });
  it("Element ganz unter zwei Leisten, jede deckt einen Teil, ist verdeckt", () => {
    const a = { l: 0, t: 100, r: 180, b: 200 }, b = { l: 180, t: 100, r: 360, b: 200 };
    expect(verdecktDurchFest({ l: 100, t: 120, r: 260, b: 180 }, [a, b], FENSTER)).toBe(true);
  });
  it("teilweise verdecktes Element gilt nicht als ganz verdeckt (2.4.11), der Anteil wird ausgewiesen", () => {
    const r = { l: 20, t: 640, r: 120, b: 700 };
    expect(verdecktDurchFest(r, [unten], FENSTER)).toBe(false);
    const a = verdecktAnteil(r, [unten]);
    expect(a).toBeGreaterThan(0.5); expect(a).toBeLessThan(1);
  });
  it("freies Element, keine Überlagerung, Element außerhalb des Fensters", () => {
    expect(verdecktDurchFest({ l: 20, t: 300, r: 120, b: 340 }, [unten, kopf], FENSTER)).toBe(false);
    expect(verdecktDurchFest({ l: 20, t: 300, r: 120, b: 340 }, [], FENSTER)).toBe(false);
    expect(verdecktDurchFest({ l: 20, t: 900, r: 120, b: 940 }, [unten], FENSTER)).toBe(false);
    expect(verdecktDurchFest(null, [unten], FENSTER)).toBe(false);
  });
});

describe("3.3.1 Fehlertext am Formular: Bewertung", () => {
  const feldVerbunden = { id: "bis", beschreibt: "krank-fehler", ungueltig: true }, feldOhne = { id: "bis", beschreibt: "", ungueltig: false };
  it("Text, Kennung und Verbindung: bestanden", () => {
    expect(fehlerAmFormular([{ id: "krank-fehler", text: "Bis liegt vor Von. Bitte den Zeitraum prüfen." }], [feldOhne, feldVerbunden])).toEqual({ ok: true, art: "ok" });
  });
  it("Verbindung unter mehreren ids in aria-describedby wird erkannt", () => {
    expect(fehlerAmFormular([{ id: "e1", text: "Bitte Vor- und Nachnamen angeben." }], [{ beschreibt: "hinweis-1 e1" }]).ok).toBe(true);
  });
  it("ohne Text: durchgefallen, auch bei Symbol oder Farbe allein", () => {
    expect(fehlerAmFormular([], [feldVerbunden]).art).toBe("kein-text");
    expect(fehlerAmFormular([{ id: "x", text: "!" }], [{ beschreibt: "x" }]).art).toBe("kein-text");
    expect(fehlerAmFormular(undefined, undefined).art).toBe("kein-text");
  });
  it("mit Text, aber ohne Kennung: nicht verbindbar", () => {
    expect(fehlerAmFormular([{ id: "", text: "Bitte den Zeitraum prüfen." }], [feldVerbunden]).art).toBe("keine-kennung");
  });
  it("mit Text und Kennung, aber kein Feld verweist darauf: nicht verbunden", () => {
    expect(fehlerAmFormular([{ id: "krank-fehler", text: "Bitte den Zeitraum prüfen." }], [feldOhne]).art).toBe("nicht-verbunden");
    expect(fehlerAmFormular([{ id: "krank-fehler", text: "Bitte den Zeitraum prüfen." }], [{ beschreibt: "krank-fehler-2" }]).art).toBe("nicht-verbunden");
  });
  it("die Textprüfung ist die gemeinsame aus abnahme-kern", () => {
    expect(fehlertextOk(["Bitte den Zeitraum prüfen."])).toBe(true);
    expect(fehlertextOk(["!"])).toBe(false);
  });
});

describe("1.4.10 und 2.5.8: Bewertung (gemeinsamer Kern)", () => {
  it("Reflow: 320 px Fenster, Seite 321 besteht (Rundung), 340 nicht", () => {
    expect(reflowOk(321, 320)).toBe(true); expect(reflowOk(340, 320)).toBe(false);
  });
  it("Rollbereich: nur Container mit overflow-x auto/scroll, selbst nicht breiter als das Fenster", () => {
    expect(zulaessigerRollbereich({ overflowX: "auto", scrollBreite: 900, klientBreite: 320, fensterBreite: 320 })).toBe(true);
    expect(zulaessigerRollbereich({ overflowX: "visible", scrollBreite: 900, klientBreite: 320, fensterBreite: 320 })).toBe(false);
    expect(zulaessigerRollbereich({ overflowX: "auto", scrollBreite: 900, klientBreite: 900, fensterBreite: 320 })).toBe(false);
    expect(zulaessigerRollbereich(null)).toBe(false);
  });
  it("Zielgröße: 20x20 allein besteht (Abstand), mit Nachbar im 24-px-Kreis fällt es durch, 24x24 besteht", () => {
    expect(zielgroessenBefunde([{ id: "a", x: 0, y: 0, w: 20, h: 20 }], 24)).toEqual([]);   // Abstandsausnahme: kein Nachbar im Kreis
    expect(zielgroessenBefunde([{ id: "a", x: 0, y: 0, w: 20, h: 20 }, { id: "b", x: 21, y: 0, w: 40, h: 40 }], 24).map((z) => z.id)).toEqual(["a"]);
    expect(zielgroessenBefunde([{ id: "a", x: 0, y: 0, w: 24, h: 24 }, { id: "b", x: 25, y: 0, w: 24, h: 24 }], 24)).toEqual([]);
  });
});

describe("3.3.1 im Markup: Fehlertext mit dem Feld verbunden", () => {
  it("Field behält ein vorhandenes aria-describedby des Feldes und hängt den Hinweis an", () => {
    const html = renderToStaticMarkup(h(Field, { label: "Bis", hint: "Letzter Tag" }, h(Inp, { type: "date", "aria-describedby": "krank-fehler" })));
    const m = html.match(/aria-describedby="([^"]*)"/);
    expect(m).not.toBeNull();
    const ids = m[1].split(/\s+/);
    expect(ids).toContain("krank-fehler");
    expect(ids.length).toBe(2);
  });
  it("Fehlerband trägt role=alert und, wenn angegeben, eine id", () => {
    const mit = renderToStaticMarkup(h(Fehlerband, { id: "antrag-fehler" }, "Ende vor Beginn."));
    expect(mit).toContain('id="antrag-fehler"'); expect(mit).toContain('role="alert"');
    expect(renderToStaticMarkup(h(Fehlerband, {}, "Text"))).not.toContain("id=");
  });
  it("Krankmeldung: Meldung hat id, beide Datumsfelder verweisen darauf, Ende ist als ungültig markiert", () => {
    const q = LIES("src/ansichten/krankmeldung.jsx");
    expect(q).toContain('<div id="krank-fehler" role="alert"');
    expect(q.match(/aria-describedby=\{fehler \? "krank-fehler" : undefined\}/g)).toHaveLength(2);
    expect(q).toContain('aria-invalid={fehler ? "true" : undefined}');
  });
  it("Antrag auf dem Telefon: Fehlerband mit id, Von und Bis verweisen darauf", () => {
    const q = LIES("src/ansichten/mobil.jsx");
    expect(q).toContain('<Fehlerband id="antrag-fehler">');
    expect(q.match(/aria-describedby=\{antragFehler \? "antrag-fehler" : undefined\}/g)).toHaveLength(2);
  });
  it("Person hinzufügen: Meldung hat id, beide Namensfelder verweisen darauf", () => {
    const q = LIES("src/ansichten/personal.jsx");
    expect(q).toContain('id="neu-person-fehler" role="alert"');
    expect(q.match(/aria-describedby=\{neuFehler \? "neu-person-fehler" : undefined\}/g)).toHaveLength(2);
  });
});

describe("Verdrahtung des Browser-Skripts", () => {
  const skript = LIES("pruefungen/browser/wcag-wp40.mjs"), paket = JSON.parse(LIES("package.json")), ci = LIES(".github/workflows/pruefung.yml");
  it("läuft nur gegen die eigene Maschine, ohne Staging und Produktion", () => {
    expect(skript).toContain("istLoopback(BASE)");
    expect(skript).toMatch(/127\.0\.0\.1/);
    expect(skript).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)[a-z]/i);
  });
  it("beendet sich mit Exit 1 bei Befunden und meldet jeden Befund einzeln", () => {
    expect(skript).toContain("await ende(befunde.length ? 1 : 0)");
    expect(skript).toMatch(/BEFUND \[\$\{k\}\] \$\{t\}/);
  });
  it("deckt die vier Rollen, die vier Breiten und die vier Kriterien ab", () => {
    for (const r of ["mitarbeiter", "planer", "leitung", "subplaner"]) expect(skript).toContain(`"${r}"`);
    expect(skript).toContain('"320,360,390,768"');
    for (const k of ["reflow", "ziele", "fokus", "fehler"]) expect(skript).toContain(`"${k}"`);
  });
  it("die Formulare Stempel, Korrektur, Krankmeldung, Person hinzufügen sind vorgesehen", () => {
    for (const t of ["Stempel (Absage)", "Korrektur", "Krankmeldung", "Person hinzufügen"]) expect(skript).toContain(t);
  });
  it("npm-Skript für den Browserlauf vorhanden, aber nicht in der Kette pruefung und nicht in der CI", () => {
    expect(paket.scripts["pruefung:wcag-wp40-browser"]).toBe("node pruefungen/browser/wcag-wp40.mjs");
    expect(paket.scripts.pruefung).not.toContain("wcag-wp40-browser");
    expect(ci).not.toContain("wcag-wp40-browser");
  });
  it("das Unit-Skript steht in der Kette pruefung vor der Sammelprüfung und in der CI", () => {
    expect(paket.scripts["pruefung:wcag-wp40"]).toBe("vitest run pruefungen/wcag-wp40.test.js");
    expect(paket.scripts.pruefung.trim().endsWith("npm run pruefung:wcag-wp40 && npm run pruefung:sammelpruefung")).toBe(true);
    expect(ci).toContain("pruefung:wcag-wp40");
  });
});

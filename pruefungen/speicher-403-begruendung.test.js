/* ==========================================================================
   E1 (Review PR #397): Begründung einer 403 in der Speicherlage

   Eine 403 beim Speichern bringt `{ fehler: "Keine Schreibberechtigung.", text: <Begründung> }`. Die Lage
   übernahm nur `fehler`; die Begründung (etwa „Einteilung am … nicht möglich: Ruhezeit …“) erschien nie. Jetzt trägt
   die Lage sie als `grund`, und „Nicht gespeichert“ zeigt sie — als Text, nie als Markup. Der Server hält dort schon
   heute Fremdes neutral (schutzdurchsetzung.mjs, Review B4); die Oberfläche zeigt nur, was er dieser Sitzung sendet.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("E1: Begründung einer 403 in der Speicherlage", () => {
  const antwort = (status, d) => ({ status, headers: { get: () => null }, json: async () => d });
  async function lageZu(status, d) {
    const SP = await import("../src/speicher.js");
    const vorher = globalThis.fetch;
    globalThis.fetch = async () => antwort(status, d);
    try {
      let lage = null;
      await SP.schreib({ version: 9, mandanten: [] }, { durch: "Test", sofort: true, onFehler: (l) => { lage = l; } });
      return lage;
    } finally { SP.ausstehendVerwerfen(); globalThis.fetch = vorher; }
  }

  it("403 mit Begründung: Lage „keinRecht“, `grund` ist der Text des Servers, `text` bleibt die Absage", async () => {
    const g = "Einteilung am 2026-11-02 nicht möglich: Ruhezeit unter 11 Stunden. Sperrende Regeln lassen sich nicht bestätigen.";
    const lage = await lageZu(403, { fehler: "Keine Schreibberechtigung.", text: g });
    expect(lage.art).toBe("keinRecht");
    expect(lage.text).toBe("Keine Schreibberechtigung.");
    expect(lage.grund).toBe(g);
  });

  it("403 ohne, mit leerem oder nicht-textlichem `text`: kein `grund`", async () => {
    for (const d of [{ fehler: "Keine Schreibberechtigung." }, { fehler: "Keine Schreibberechtigung.", text: "  " },
      { fehler: "Keine Schreibberechtigung.", text: { html: "<b>x</b>" } }]) {
      const lage = await lageZu(403, d);
      expect(lage.art, JSON.stringify(d)).toBe("keinRecht");
      expect("grund" in lage, JSON.stringify(d)).toBe(false);
    }
  });

  it("403 STEMPEL_UNVERAENDERLICH: Lage bleibt „stempelStand“ und trägt die Begründung; lange Texte gekürzt", async () => {
    const lage = await lageZu(403, { fehler: "Keine Schreibberechtigung.", code: "STEMPEL_UNVERAENDERLICH", text: "x".repeat(800) });
    expect(lage.art).toBe("stempelStand");
    expect(lage.grund.length).toBe(500);
  });

  it("Andere Absagen (500, 413) bekommen keinen `grund`, auch wenn `text` mitkommt", async () => {
    for (const s of [500, 413]) {
      const lage = await lageZu(s, { fehler: "Fehler.", text: "Interna" });
      expect("grund" in lage, String(s)).toBe(false);
    }
  });

  it("Quelltext: `grund` nur aus einer 403, die Konflikt-/Sitzungsende-Zweige bleiben davor unberührt", () => {
    const q = lies("../src/speicher.js");
    const treffer = [...q.matchAll(/f\.grund = /g)];
    expect(treffer.length).toBe(1);
    const zeile = q.slice(q.lastIndexOf("\n", treffer[0].index), q.indexOf("\n", treffer[0].index));
    expect(zeile).toMatch(/if \(status === 403 && daten && typeof daten\.text === "string"/);
    /* Der Zweig steht im allgemeinen Absagezweig — nach 409 und nach dem 403-Ausnahmeweg. */
    const absage = q.indexOf('const f = new Error(daten?.fehler || "Speichern fehlgeschlagen.");');
    expect(absage).toBeGreaterThan(q.indexOf("if (status === 403 && auftrag.ausnahme)"));
    expect(treffer[0].index).toBeGreaterThan(absage);
  });

  it("Render: „Nicht gespeichert“ zeigt die Begründung als Text (kein Markup aus der Antwort)", async () => {
    const L = await import("../src/ansichten/speicherlage.jsx");
    const lage = { art: "keinRecht", text: "Keine Schreibberechtigung.", status: 403, zeit: "2026-11-19T10:00:00Z",
      grund: "Ruhezeit <img src=x onerror=alert(1)> unter 11 Stunden." };
    const html = renderToStaticMarkup(h(L.NichtGespeichert, { lage, melde: () => {}, aufGeloest: () => {} }));
    expect(html).toContain("Diese Änderung ist mit deiner Rolle nicht zulässig");
    expect(html).toContain("Begründung: Ruhezeit &lt;img src=x onerror=alert(1)&gt; unter 11 Stunden.");
    expect(html).not.toMatch(/<img/);
    const ohne = renderToStaticMarkup(h(L.NichtGespeichert, { lage: { ...lage, grund: undefined }, melde: () => {}, aufGeloest: () => {} }));
    expect(ohne).not.toContain("Begründung:");
  });
});

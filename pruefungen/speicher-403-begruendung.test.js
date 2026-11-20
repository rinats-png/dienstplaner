/* ==========================================================================
   E1 (Review PR #397): Begründung einer 403 in der Speicherlage

   Eine 403 beim Speichern bringt `{ fehler: "Keine Schreibberechtigung.", text: <Begründung> }`. Die Lage
   übernahm nur `fehler`; die Begründung (etwa „Einteilung am … nicht möglich: Ruhezeit …“) erschien nie. Jetzt trägt
   die Lage sie als `grund`, und „Nicht gespeichert“ zeigt sie — als Text, nie als Markup. Der Server hält dort schon
   heute Fremdes neutral (schutzdurchsetzung.mjs, Review B4); die Oberfläche zeigt nur, was er dieser Sitzung sendet.
   ========================================================================== */
import { describe, it, expect, afterEach, vi } from "vitest";
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

  it("Quelltext: `grund` nur aus einer 403 (eine Regel grund403), genutzt auf Voll-PUT, Teilweg und Ausnahmeweg", () => {
    const q = lies("../src/speicher.js");
    /* Eine Regel: nur 403, nur Zeichenkette, nicht leer, gekürzt. */
    const regel = q.slice(q.indexOf("function grund403(status, daten) {"), q.indexOf("function grund403(status, daten) {") + 220);
    expect(regel).toMatch(/if \(status !== 403 \|\| !daten \|\| typeof daten\.text !== "string" \|\| !daten\.text\.trim\(\)\) return null;/);
    expect(regel).toMatch(/return daten\.text\.trim\(\)\.slice\(0, 500\);/);
    /* Drei Aufrufe: Teilweg (a.status), Ausnahmeweg und allgemeiner Absagezweig des Voll-PUT. */
    expect([...q.matchAll(/grund403\(/g)].length).toBe(4);   // Definition + 3 Aufrufe
    expect(q).toMatch(/const g = grund403\(a\.status, d\);\s*if \(g\) \/\*\* @type \{any\} \*\/ \(f\)\.grund = g;\s*return \{ weiter: false, status: a\.status, fehler: f \};/);
    expect(q).toMatch(/if \(status === 403 && auftrag\.ausnahme\) \{ ausnahmeAbgewiesen\(String\(daten\?\.fehler \|\| "Abgewiesen\."\), grund403\(status, daten\)\); return; \}/);
    /* Der Voll-PUT-Zweig steht im allgemeinen Absagezweig — nach 409 und nach dem 403-Ausnahmeweg. */
    const absage = q.indexOf('const f = new Error(daten?.fehler || "Speichern fehlgeschlagen.");');
    expect(absage).toBeGreaterThan(q.indexOf("if (status === 403 && auftrag.ausnahme)"));
    expect(q.indexOf("const g = grund403(status, daten);")).toBeGreaterThan(absage);
  });

  it("Ausnahmeweg: 403 mit Begründung → Lage „ausnahmeZurueck“ mit `grund`; ohne Text kein `grund`", async () => {
    const SP = await import("../src/speicher.js");
    const ANGABE = { modul: "posten", art: "loeschung", grund: "art17", eintraege: { postenPlan: ["a1|2026-11-02"] } };
    const erkennt = (m) => !!m && !!m.postenPlan && !("a1|2026-11-02" in m.postenPlan);
    const vorher = globalThis.fetch;
    try {
      for (const [d, erwartet] of [[{ fehler: "nur lesbar", text: "Die Löschung nimmt nur die Leitung vor." }, "Die Löschung nimmt nur die Leitung vor."],
        [{ fehler: "nur lesbar" }, null]]) {
        globalThis.fetch = async () => antwort(403, d);
        SP.ausnahmeMitschicken("m1", ANGABE, erkennt);
        let lage = null;
        await SP.schreib({ mandanten: [{ id: "m1", postenPlan: { "a1|2026-11-03": "po1" } }] },
          { durch: "Test", sofort: true, onFehler: (l) => { lage = l; } });
        expect(lage.art).toBe("ausnahmeZurueck");
        expect(lage.text).toBe("nur lesbar");
        if (erwartet) expect(lage.grund).toBe(erwartet);
        else expect("grund" in lage).toBe(false);
        SP.ausstehendVerwerfen();
      }
    } finally { SP.ausstehendVerwerfen(); globalThis.fetch = vorher; }
  });

  it("Render: „ausnahmeZurueck“ zeigt die Begründung als Text", async () => {
    const L = await import("../src/ansichten/speicherlage.jsx");
    const html = renderToStaticMarkup(h(L.NichtGespeichert, { lage: { art: "ausnahmeZurueck", text: "nur lesbar", status: 403,
      zeit: "2026-11-19T10:00:00Z", grund: "Die Löschung nimmt nur die Leitung vor." }, melde: () => {}, aufGeloest: () => {} }));
    expect(html).toContain("Die Datenschutz-Berichtigung oder -Löschung ist nicht gespeichert");
    expect(html).toContain("Begründung: Die Löschung nimmt nur die Leitung vor.");
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

/* Teilweg (WP-48.5, Schalter `teile`): Eine 403 des Teil-POST (etwa „Diese Rolle speichert über den vollständigen Weg.“)
   trägt die Begründung wie der Voll-PUT. Eigene Modulinstanz mit Sitzung; der Server ist nachgebaut (nur GET und POST). */
describe("E1/B-P3: Begründung einer 403 auf dem Teilweg", () => {
  const V = (c) => c.repeat(32);
  const betrieb = () => ({ id: "m1", name: "Haus", personen: [{ id: "p1", vorname: "Pia", nachname: "Plan" }],
    dienstarten: [{ id: "F", name: "Früh" }, { id: "N", name: "Nacht" }], wuensche: [], abweichungen: { "p1|2026-08-14": "F" }, erfassung: {} });
  const leseAntwort = () => ({ bestand: { mandanten: [betrieb()] }, etag: 7, rolle: "planer", person: "p1",
    teile: { format: 1, epoche: "e0e0e0e0", versionen: { "kern:dienstarten": V("a"), "kern:personen": V("b"), "kern:wuensche": V("c") } } });
  const speicherAttrappe = (start = {}) => { const m = new Map(Object.entries(start)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
  const json = (status, d) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
  afterEach(() => { vi.unstubAllGlobals(); });

  for (const [d, erwartet] of [[{ fehler: "Keine Berechtigung.", text: "Diese Rolle speichert über den vollständigen Weg." },
    "Diese Rolle speichert über den vollständigen Weg."], [{ fehler: "Keine Berechtigung." }, null]]) {
    it(`Teil-POST 403 ${erwartet ? "mit" : "ohne"} Text: Lage „keinRecht“, Begründung nur mit Text, kein Voll-PUT`, async () => {
      vi.resetModules();
      vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "pruef-merkmal-teilweg" }));
      vi.stubGlobal("localStorage", speicherAttrappe());
      const wege = [];
      vi.stubGlobal("fetch", async (url, opt = {}) => {
        const methode = opt.method || "GET";
        wege.push(`${methode} ${url}`);
        if (url === "/api/bestand" && methode === "GET") return json(200, leseAntwort());
        if (url === "/api/bestand/teile" && methode === "POST") return json(403, d);
        return json(200, {});
      });
      const SP = await import("../src/speicher.js");
      const g = await SP.lies();
      expect(g.teilAntwort, "Fähigkeit teile übernommen").toBeTruthy();
      SP.teilwegUebernehmen(g.teilAntwort);
      const m = { ...betrieb(), abweichungen: { "p1|2026-08-14": "N" } };
      let lage = null;
      await SP.schreib({ version: 9, session: { mandantId: "m1", personId: "p1" }, mandanten: [m] },
        { durch: "Test", sofort: true, onFehler: (l) => { lage = l; } });
      expect(wege, "Teilweg genutzt").toContain("POST /api/bestand/teile");
      expect(wege, "kein Rückfall auf den Voll-PUT").not.toContain("PUT /api/bestand");
      expect(lage.art).toBe("keinRecht");
      expect(lage.text).toBe("Keine Berechtigung.");
      if (erwartet) expect(lage.grund).toBe(erwartet);
      else expect("grund" in lage).toBe(false);
      SP.ausstehendVerwerfen();
    });
  }
});

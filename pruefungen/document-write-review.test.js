/* ==========================================================================
   WP-39 document.write-Review: Auflagen M1, M2 und Meta-CSP
   (docs/acc45/WP-39-NACHWEIS.md, Abschnitt „document.write-Review“)

   M1  Freigabe der statischen Prüfung gilt je Datei nur für genau eine Fundstelle.
   M2  Verhaltenstests statt Regex im Quelltext: handbuchDruck und aushangHtml.
   CSP Beide Druckseiten tragen eine Meta-CSP im Kopf.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { markiereFreigaben, FREIGABEN } from "../werkzeug/sicherheit/statik.mjs";
import { handbuchDruck } from "../src/lib/handbuch.js";
import { aushangHtml, farbeSicher, DRUCK_CSP } from "../src/lib/aushang.js";

const META_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`;
const GIFT = `<img src=x onerror=alert(1)>"'&`;

/* ---------------------------------------------------------------- M1 */
describe("M1 Freigabe der statischen Prüfung ist an die Anzahl gebunden", () => {
  const eintrag = (datei, n) => Array.from({ length: n }, (_, i) =>
    ({ datei, zeile: 10 + i, muster: "document.write", klasse: "hart" }));

  it("jede Freigabe nennt genau eine erlaubte Fundstelle", () => {
    for (const f of FREIGABEN) expect(f.anzahl, f.datei).toBe(1);
  });

  it("eine Fundstelle in einer freigegebenen Datei ist begründet", () => {
    const r = markiereFreigaben(eintrag("src/app/aktionen/begleitung.js", 1));
    expect(r[0].frei).toBeTruthy();
  });

  it("eine Datei mit zwei Fundstellen: die zweite wird als unbegründet gemeldet", () => {
    for (const datei of ["src/app/aktionen/begleitung.js", "src/app/aktionen/assistenz.js"]) {
      const r = markiereFreigaben(eintrag(datei, 2));
      expect(r[0].frei, datei).toBeTruthy();
      expect(r[1].frei, datei).toBeNull();
    }
  });

  it("die Zählung gilt je Datei, nicht gemeinsam", () => {
    const r = markiereFreigaben([...eintrag("src/app/aktionen/begleitung.js", 1), ...eintrag("src/app/aktionen/assistenz.js", 1)]);
    expect(r.every((t) => t.frei)).toBe(true);
  });

  it("eine Fundstelle in einer anderen Datei bleibt unbegründet", () => {
    expect(markiereFreigaben(eintrag("src/app/aktionen/andere.js", 1))[0].frei).toBeNull();
  });
});

/* ---------------------------------------------------------------- M2a */
describe("M2a handbuchDruck maskiert den Betriebsnamen", () => {
  const alle = [{ id: "k1", titel: "Kapitel", dauer: "5 Min", einleitung: "Einleitung",
    abschnitte: [{ titel: "Abschnitt", text: "Text", schritte: ["Schritt"], pruefen: "Prüfen", merke: "Merke" }] }];

  it("Sonderzeichen im Namen kommen nur maskiert vor", () => {
    const html = handbuchDruck({ name: GIFT }, alle);
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/<[^>]*onerror=/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;\"'&amp;");
  });

  it("jede Fundstelle des Namens ist maskiert (Titel und Deckel)", () => {
    const html = handbuchDruck({ name: GIFT }, alle);
    expect(html.split("&lt;img src=x").length - 1).toBe(2);
    expect(html.match(/<img/gi)).toBeNull();
  });
});

/* ---------------------------------------------------------------- M2b */
describe("M2b aushangHtml maskiert Bestandsdaten und prüft die Farbe", () => {
  const da = (o = {}) => ({ id: "d1", kurz: GIFT, start: GIFT, ende: GIFT, farbe: "#2C4E5C", ...o });

  it("farbeSicher lehnt Fremdwerte ab und lässt Hexfarben durch", () => {
    expect(farbeSicher("red;background:url(x)")).toBe("inherit");
    expect(farbeSicher('#fff" onmouseover=x')).toBe("inherit");
    expect(farbeSicher("#fff")).toBe("#fff");
    expect(farbeSicher("#2C4E5C")).toBe("#2C4E5C");
    expect(farbeSicher(undefined)).toBe("inherit");
  });

  it("Sonderzeichen in Name, Stand, Zeit und Dienstart landen nur maskiert im HTML", () => {
    const html = aushangHtml(withDienst(da()));
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/<[^>]*onerror=/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;");
  });

  for (const farbe of ["red;background:url(x)", '#fff" onmouseover=x']) {
    it(`Farbe ${JSON.stringify(farbe)} erzeugt keine Attributinjektion`, () => {
      const html = aushangHtml(withDienst(da({ farbe })));
      expect(html).toContain('style="color:inherit"');
      expect(html).not.toContain("onmouseover");
      expect(html).not.toContain("url(x)");
    });
  }
});

/* ---------------------------------------------------------------- Meta-CSP */
describe("Meta-CSP in den Köpfen der Druckseiten", () => {
  it("Handbuch und Aushangplan tragen die Meta-CSP im Kopf", () => {
    const hb = handbuchDruck({ name: "Betrieb" }, []);
    const ah = aushangHtml(withDienst({ id: "d1", kurz: "F", start: "06:00", ende: "14:00", farbe: "#fff" }));
    for (const html of [hb, ah]) {
      expect(html).toContain(META_CSP);
      expect(html.indexOf(META_CSP)).toBeLessThan(html.indexOf("</head>"));
      expect(html.indexOf(META_CSP)).toBeLessThan(html.indexOf("<style>"));
    }
    expect(DRUCK_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  });
});

/* Betrieb, in dem Einheit e1 an jedem Tag den Dienst d1 hat. */
function withDienst(dienst) {
  return {
    m: { name: GIFT, einheiten: [{ id: "e1", name: GIFT }], dienstarten: [dienst],
      zyklus: { tage: [dienst.id] }, anker: "2026-01-01", bundesland: "BY" },
    e: { name: GIFT },
    ym2: "2026-11",
    einheitId: "e1",
    fg: { stand: GIFT, zeit: GIFT },
  };
}

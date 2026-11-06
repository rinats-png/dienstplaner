/* ==========================================================================
   WP-47b — Lesebremse nach Bestandsgröße, eigene Feed-Bremse

   - Die Grenze je Raum für Bestandsabrufe sinkt mit der Dateigröße der
     Antwort (WP-28 Befund 5: Kenngröße ist die Bytezahl, nicht die Anzahl).
     Bei großen Beständen bleibt der gemeinsame Rechenkern unter Sättigung.
     Unbekannte Größe: die strengere Annahme (fail closed).
   - Der Kalender-Feed hat eine eigene Bremse je Geheimnis, 12–30 je Minute,
     fail closed: Ein Plattenfehler am Sperreintrag sperrt das Geheimnis.
   - Die Lesebremse für gewöhnliches Lesen bleibt unverändert nicht
     failClosed (bestehendes Verhalten, siehe bremse-lokal.test.js).

   Geprüft werden die echten Module; die Ablage bleibt darunter. Gezielte
   Störung nur über `stoerung` (wie bremse-lokal.test.js).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { aufbauen, WIRT } from "./hilfen/szenario.mjs";

const { stoerung } = vi.hoisted(() => ({ stoerung: { wirft: null } }));
vi.mock("../server/lib/ablage.mjs", async (original) => {
  const echt = await original();
  return {
    ...echt,
    getStore: (angabe) => {
      const s = echt.getStore(angabe);
      return new Proxy(s, {
        get(ziel, name) {
          const wert = ziel[name];
          if (typeof wert !== "function") return wert;
          return (...args) => {
            const key = typeof args[0] === "string" ? args[0]
              : args[0] && args[0].prefix !== undefined ? args[0].prefix : "";
            if (stoerung.wirft && stoerung.wirft(String(name), key)) {
              const e = new Error(`EIO: gestört (${String(name)} ${key})`);
              /** @type {any} */ (e).code = "EIO";
              return Promise.reject(e);
            }
            return wert.apply(ziel, args);
          };
        },
      });
    },
  };
});

let Z, SCH, LESEN_GROESSE_UNBEKANNT;
let zaehler = 0;
const LIMIT = 60000;

beforeAll(async () => {
  Z = await aufbauen("wp47b-lesebremse");
  SCH = await import("../server/lib/schutz.mjs");
  LESEN_GROESSE_UNBEKANNT = SCH.LESEN_GROESSE_UNBEKANNT;
}, LIMIT);

afterAll(async () => {
  stoerung.wirft = null;
  await Z.abbauen();
});

beforeEach(async () => {
  stoerung.wirft = null;
  await Z.taktLeeren();
});

const neuerKey = (was) => `wp47b-${was}-${++zaehler}-${Date.now()}`;

describe("Lesebremse nach Bestandsgröße (lesenGrenze)", () => {
  it("Budget 1,2 GB/min: 4,6 MB ergibt 260 Abrufe je Minute, 5 MB ergibt 240 (Schichtwechsel-Ziel)", () => {
    expect(SCH.LESEN_BYTES_JE_MINUTE).toBe(1_200_000_000);
    expect(SCH.lesenGrenze(4_600_000)).toBe(260);
    expect(SCH.lesenGrenze(5_000_000)).toBe(240);
  });

  it("kleine Bestände bekommen die volle Grenze des Lesens", () => {
    expect(SCH.lesenGrenze(50_000)).toBe(SCH.GRENZEN.lesen.versuche);
  });

  it("die Grenze sinkt mit der Größe und steigt nie wieder", () => {
    const groessen = [100_000, 1_000_000, 2_000_000, 4_600_000, 10_000_000, 40_000_000];
    const werte = groessen.map((g) => SCH.lesenGrenze(g));
    for (let i = 1; i < werte.length; i++) expect(werte[i]).toBeLessThanOrEqual(werte[i - 1]);
  });

  it("unbekannte, leere oder ungültige Größe: die strenge Annahme (fail closed)", () => {
    const streng = SCH.lesenGrenze(LESEN_GROESSE_UNBEKANNT);
    for (const v of [undefined, null, 0, -5, NaN])
      expect(SCH.lesenGrenze(v)).toBe(streng);
    expect(streng).toBeLessThanOrEqual(SCH.lesenGrenze(4_600_000));
    expect(streng).toBeGreaterThanOrEqual(1);
  });

  it("nie null, nie 0: die Grenze ist mindestens 1", () => {
    expect(SCH.lesenGrenze(10 ** 12)).toBeGreaterThanOrEqual(1);
  });
});

describe("bremse(): eigene Grenze je Aufruf", () => {
  it("mit versuche: 3 lässt drei durch und bremst den vierten (429-Pfad mit Wartezeit)", async () => {
    const k = neuerKey("opt");
    const stati = [];
    for (let i = 0; i < 4; i++) stati.push(await SCH.bremse("lesen", k, undefined, { versuche: 3 }));
    expect(stati.slice(0, 3).every((b) => b.frei)).toBe(true);
    expect(stati[3].frei).toBe(false);
    expect(stati[3].wartet).toBeGreaterThan(0);
  });

  it("ohne Angabe gilt weiter GRENZEN[art]", async () => {
    const k = neuerKey("ohne");
    const b = await SCH.bremse("lesen", k);
    expect(b.frei).toBe(true);
    expect(b.uebrig).toBe(SCH.GRENZEN.lesen.versuche - 1);
  });
});

describe("Feed-Bremse je Geheimnis", () => {
  it("eigene Grenze: 12–30 je Minute, fail closed", () => {
    const g = SCH.GRENZEN.feed;
    expect(g, "GRENZEN.feed fehlt").toBeTruthy();
    expect(g.versuche).toBeGreaterThanOrEqual(12);
    expect(g.versuche).toBeLessThanOrEqual(30);
    expect(g.fenster).toBe(60);
    expect(g.failClosed).toBe(true);
  });

  it("der 31. Abruf je Geheimnis in einer Minute ist gebremst", async () => {
    const k = neuerKey("feed");
    const stati = [];
    for (let i = 0; i < 31; i++) stati.push(await SCH.bremse("feed", k));
    expect(stati.slice(0, 30).every((b) => b.frei)).toBe(true);
    expect(stati[30].frei).toBe(false);
    expect(stati[30].wartet).toBeGreaterThan(0);
  }, LIMIT);

  it("ein anderes Geheimnis wird davon nicht gebremst", async () => {
    const a = neuerKey("feed-a");
    const b = neuerKey("feed-b");
    for (let i = 0; i < 31; i++) await SCH.bremse("feed", a);
    expect((await SCH.bremse("feed", b)).frei).toBe(true);
  });

  it("Plattenfehler am Sperreintrag sperrt das Geheimnis (fail closed), nie stumm frei", async () => {
    const k = neuerKey("feed-platte");
    stoerung.wirft = (methode, key) => methode === "get" && key.startsWith("sperre:");
    const stati = [];
    for (let i = 0; i < 3; i++) stati.push(await SCH.bremse("feed", k));
    expect(stati.every((b) => b.frei === false), JSON.stringify(stati[0])).toBe(true);
    expect(stati.every((b) => typeof b.fehler === "string" && b.fehler.length > 0)).toBe(true);
  });
});

describe("Kalender-Feed: der 429-Pfad über den echten Handler", () => {
  it("der 31. Abruf eines Geheimnisses bekommt 429 mit Retry-After, ein anderes Geheimnis nicht", async () => {
    const geheim = `geheim-${neuerKey("http")}-${"x".repeat(24)}`;
    const andere = `geheim-${neuerKey("http-b")}-${"y".repeat(24)}`;
    const abruf = (g) => Z.kalender(new Request(`http://${WIRT}/kalender/feed/${g}.ics`,
      { headers: { host: WIRT, "x-forwarded-for": "198.51.100.77" } }), {});
    const stati = [];
    let letzte = null;
    for (let i = 0; i < 31; i++) { letzte = await abruf(geheim); stati.push(letzte.status); }
    expect(stati.slice(0, 30).some((s) => s === 429)).toBe(false);
    expect(stati[30]).toBe(429);
    expect(Number(letzte.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await abruf(andere)).status).not.toBe(429);
  }, LIMIT);
});

describe("Quelltext: die Bremsen sind verdrahtet", () => {
  it("kalender.mjs bremst den Feed mit eigener Art, nicht mit „lesen“", async () => {
    const fs = await import("node:fs/promises");
    const quelle = await fs.readFile(new URL("../server/funktionen/kalender.mjs", import.meta.url), "utf8");
    expect(quelle).toMatch(/bremse\("feed",/);
    expect(quelle).not.toMatch(/bremse\("lesen", `f:/);
  });

  it("daten.mjs setzt die Grenze des Bestandsabrufs nach Größe", async () => {
    const fs = await import("node:fs/promises");
    const quelle = await fs.readFile(new URL("../server/funktionen/daten.mjs", import.meta.url), "utf8");
    expect(quelle).toMatch(/bremse\("lesen-raum", kennungRaum\(s\.bestand\), undefined,\s*\{ versuche: lesenGrenze\(/);
  });

  it("die Größe je Raum ist je Stand zwischengespeichert: ein neuer Stand widerruft den Eintrag", async () => {
    const fs = await import("node:fs/promises");
    const quelle = await fs.readFile(new URL("../server/funktionen/daten.mjs", import.meta.url), "utf8");
    expect(quelle).toMatch(/alt\.stand === mit\.stand/);
    expect(quelle).toMatch(/raumBytes\.set\(String\(raum\), \{ stand: mit\.stand, zeit: mit\.zeit, bytes \}\)/);
  });
});

/* --------------------------------------------------------------------------
   Opus-Review (Fix-Runde): Lesen je Person statt je Raum, Raum-Bytegrenze
   nur mit kurzer Sperre, eigene Arten für Bestand, Auswertung, Vollausgabe.
   -------------------------------------------------------------------------- */

describe("Review: Lesen je Person, Raum nur über die Bytegrenze mit kurzer Sperre", () => {
  it("bremse: versuche 0,5 wird erst abgerundet, dann auf mindestens 1 gesetzt (nie 0)", async () => {
    const k = neuerKey("klein");
    const a = await SCH.bremse("lesen", k, undefined, { versuche: 0.5 });
    const b = await SCH.bremse("lesen", k, undefined, { versuche: 0.5 });
    expect(a.frei).toBe(true);
    expect(b.frei).toBe(false);
  });

  it("Bestandslesen zählt je Person: wer seine Grenze erreicht, sperrt nicht die anderen im Raum", async () => {
    const raum = neuerKey("raum");
    const p1 = `s:${raum}:p1`, p2 = `s:${raum}:p2`;
    const klein = { versuche: 3 };   // gleiche Mechanik, kleine Grenze: Ablage ist langsam
    for (let i = 0; i < 3; i++) await SCH.bremse("bestandlesen", p1, undefined, klein);
    expect((await SCH.bremse("bestandlesen", p1, undefined, klein)).frei).toBe(false);
    expect((await SCH.bremse("bestandlesen", p2, undefined, klein)).frei).toBe(true);
    expect(SCH.GRENZEN.bestandlesen, "GRENZEN.bestandlesen fehlt").toBeTruthy();
  }, LIMIT);

  it("Vollausgabe (Sicherungsschlüssel) wird von der Bestandsgrenze nicht blockiert", async () => {
    const k = neuerKey("ausgabe");
    const klein = { versuche: 3 };
    for (let i = 0; i < 3; i++) await SCH.bremse("bestandlesen", k, undefined, klein);
    expect((await SCH.bremse("bestandlesen", k, undefined, klein)).frei).toBe(false);
    expect((await SCH.bremse("vollausgabe", k)).frei).toBe(true);
  }, LIMIT);

  it("die Raum-Bytegrenze hat nur eine kurze Sperre (höchstens 15 s) und ist fail closed", () => {
    const g = SCH.GRENZEN["lesen-raum"];
    expect(g, "GRENZEN[lesen-raum] fehlt").toBeTruthy();
    expect(g.sperre).toBeLessThanOrEqual(15);
    expect(g.failClosed).toBe(true);
  });

  it("Plattenfehler am Sperreintrag der Raum-Bytegrenze sperrt kurz, nie stumm frei", async () => {
    const k = neuerKey("raum-platte");
    stoerung.wirft = (methode, key) => methode === "get" && key.startsWith("sperre:");
    const b = await SCH.bremse("lesen-raum", k, undefined, { versuche: 240 });
    expect(b.frei).toBe(false);
    expect(typeof b.fehler).toBe("string");
  });

  it("Schichtwechsel: 200 Beschäftigte lesen je 2-mal in 2 Minuten bei 5 MB — der Raum wird nicht blockiert", async () => {
    /* Raumgrenze mit gefälschter Uhr: 400 Abrufe über 2 Minuten. Je Person sind es nur 2 Abrufe —
       weit unter der Personengrenze (300/min), deshalb hier nur der Raum geprüft (Laufzeit der Ablage). */
    const start = Date.parse("2026-11-06T06:00:00Z");
    let jetzt = start;
    vi.spyOn(Date, "now").mockImplementation(() => jetzt);
    try {
      const raum = neuerKey("wechsel");
      expect(SCH.GRENZEN["lesen-raum"], "GRENZEN.lesen-raum fehlt").toBeTruthy();
      const grenze = SCH.lesenGrenze(5_000_000);
      let blockiert = 0;
      for (let i = 0; i < 400; i++) {
        jetzt = start + Math.round(i * (120000 / 400));
        const b = await SCH.bremse("lesen-raum", `b:${raum}`, undefined, { versuche: grenze });
        if (!b.frei) blockiert++;
      }
      expect(blockiert).toBe(0);
    } finally {
      vi.restoreAllMocks();
    }
  }, 240000);

  it("Quelltext: Bestand liest je Person und Raum-Bytegrenze; Auswertung und Vollausgabe eigene Arten", async () => {
    const fs = await import("node:fs/promises");
    const q = await fs.readFile(new URL("../server/funktionen/daten.mjs", import.meta.url), "utf8");
    expect(q).toMatch(/bremse\("bestandlesen", kennungPerson\(s\)\)/);
    expect(q).toMatch(/bremse\("lesen-raum", kennungRaum\(s\.bestand\)/);
    expect(q).toMatch(/bremse\("auswertung", kennung\(req, s\)\)/);
    expect(q).toMatch(/bremse\("vollausgabe", kennung\(req, s\)\)/);
    expect(q).not.toMatch(/bremse\("lesen", kennung\(req, s\)/);
  });

  it("Quelltext: die Größe je Raum gilt nur für denselben Stand UND dieselbe Änderungszeit", async () => {
    const fs = await import("node:fs/promises");
    const q = await fs.readFile(new URL("../server/funktionen/daten.mjs", import.meta.url), "utf8");
    expect(q).toMatch(/alt\.stand === mit\.stand && alt\.zeit === mit\.zeit/);
    expect(q).toMatch(/raumBytes\.set\(String\(raum\), \{ stand: mit\.stand, zeit: mit\.zeit, bytes \}\)/);
  });
});

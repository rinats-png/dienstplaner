/* ==========================================================================
   ZWEI-FAKTOR FÜR VERWALTERSCHLÜSSEL (WP-32)

   Ein Verwalterschlüssel öffnet /einrichten — Betreibercodes anlegen,
   Zugänge sperren, Codes binden. Bis WP-32 genügte der Schlüssel allein.
   Jetzt kann je Schlüssel ein zweiter Faktor (TOTP, RFC 6238) eingerichtet
   werden; danach verlangt JEDER Aufruf einen Code, einen
   Wiederherstellungscode oder einen kurzlebigen Nachweis.

   Geprüft wird:
     - die Referenzvektoren aus RFC 4226 (HOTP) und RFC 6238 (TOTP, SHA-1)
     - das Fenster ±1 Schritt, nicht ±2
     - kein Code gilt zweimal, auch kein älterer nach einem neueren
     - Einrichten → Bestätigen → Pflicht → Wiederherstellung → Nachweis →
       Abschalten über den echten Handler
     - die Bremse (eigene Art, je Schlüssel, fail-closed)
     - CENTRIC_ZWEIFAKTOR_PFLICHT
     - das Geheimnis steht nach dem Einrichten in keiner Antwort und im
       Klartext nirgends in der Ablage

   Auf dem Stand vor WP-32 scheitern alle Handler-Prüfungen: /einrichten
   kannte den Pfad „zweifaktor" nicht (404), und zweifaktor.mjs fehlte.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readdir, readFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  hotp, totp, codePruefen, base32Kodieren, base32Dekodieren, otpauthAdresse, schrittZu,
} from "../server/lib/zweifaktor.mjs";

/* ---------- Referenzvektoren ---------- */

const RFC_GEHEIMNIS = Buffer.from("12345678901234567890", "ascii");

describe("RFC 4226 — HOTP", () => {
  it("die zehn Referenzwerte aus Anhang D", () => {
    const erwartet = ["755224", "287082", "359152", "969429", "338314",
      "254676", "287922", "162583", "399871", "520489"];
    erwartet.forEach((w, i) => expect(hotp(RFC_GEHEIMNIS, i), `Zähler ${i}`).toBe(w));
  });
});

describe("RFC 6238 — TOTP mit SHA-1", () => {
  it("die Referenzwerte aus Anhang B (acht Stellen)", () => {
    const faelle = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"],
      [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
    for (const [sek, w] of faelle) expect(totp(RFC_GEHEIMNIS, sek * 1000, { stellen: 8 }), String(sek)).toBe(w);
  });
  it("sechs Stellen sind die letzten sechs der achtstelligen", () => {
    expect(totp(RFC_GEHEIMNIS, 59000)).toBe("287082");
  });
});

describe("Base32 und otpauth", () => {
  it("bekannter Wert und Hin-und-zurück", () => {
    expect(base32Kodieren(Buffer.from("Hello!\xDE\xAD\xBE\xEF", "latin1"))).toBe("JBSWY3DPEHPK3PXP");
    expect(base32Dekodieren("JBSW Y3DP-EHPK3PXP").toString("latin1")).toBe("Hello!\xDE\xAD\xBE\xEF");
    expect(base32Dekodieren(base32Kodieren(RFC_GEHEIMNIS)).equals(RFC_GEHEIMNIS)).toBe(true);
  });
  it("otpauth-Adresse trägt Verfahren, Stellen und Schritt", () => {
    const a = otpauthAdresse("JBSWY3DPEHPK3PXP", "Anna");
    expect(a).toMatch(/^otpauth:\/\/totp\/CENTRIC%3AAnna\?/);
    for (const t of ["secret=JBSWY3DPEHPK3PXP", "issuer=CENTRIC", "algorithm=SHA1", "digits=6", "period=30"])
      expect(a).toContain(t);
  });
});

describe("Fenster und Wiederverwendung", () => {
  const ms = 1_800_000_015_000;
  const s = schrittZu(ms);
  it("±1 Schritt wird angenommen, ±2 nicht", () => {
    for (const d of [-1, 0, 1]) expect(codePruefen(RFC_GEHEIMNIS, hotp(RFC_GEHEIMNIS, s + d), ms).ok, String(d)).toBe(true);
    for (const d of [-2, 2]) expect(codePruefen(RFC_GEHEIMNIS, hotp(RFC_GEHEIMNIS, s + d), ms).ok, String(d)).toBe(false);
  });
  it("derselbe Code ein zweites Mal: abgewiesen", () => {
    const c = hotp(RFC_GEHEIMNIS, s);
    const erst = codePruefen(RFC_GEHEIMNIS, c, ms, -1);
    expect(erst).toEqual({ ok: true, schritt: s });
    expect(codePruefen(RFC_GEHEIMNIS, c, ms, erst.schritt)).toEqual({ ok: false, wiederholt: true });
  });
  it("ein älterer Code nach einem neueren: abgewiesen", () => {
    expect(codePruefen(RFC_GEHEIMNIS, hotp(RFC_GEHEIMNIS, s - 1), ms, s).ok).toBe(false);
    expect(codePruefen(RFC_GEHEIMNIS, hotp(RFC_GEHEIMNIS, s + 1), ms, s).ok).toBe(true);
  });
  it("Unsinn wird nicht angenommen", () => {
    for (const c of ["", null, undefined, "12345", "1234567", "abcdef", "12 34 5"])
      expect(codePruefen(RFC_GEHEIMNIS, /** @type {any} */ (c), ms).ok, String(c)).toBe(false);
  });
});

/* ---------- über den echten Handler ---------- */

const WIRT = "127.0.0.1:3000";
const ADMIN = "zweifaktor-ursprung-0123456789";
const T0 = Date.UTC(2026, 10, 2, 12, 0, 15);
let wurzel, laden, einrichten, schutz, verwalterAnlegen;
let nr = 0;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };

/** @param {string} pfad */
const anfrage = async (pfad, { methode = "GET", rumpf, schluessel = ADMIN, kopf = {}, xff } = {}) => {
  nr += 1;
  const h = { host: WIRT, origin: `http://${WIRT}`,
    "x-forwarded-for": xff || `10.32.${Math.floor(nr / 250)}.${nr % 250}`, ...kopf };
  if (methode !== "GET") h["content-type"] = "application/json";
  if (schluessel) h.authorization = `Bearer ${schluessel}`;
  const a = await einrichten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: h,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const code = (geheimnisB32, d = 0) => hotp(base32Dekodieren(geheimnisB32), schrittZu(jetzt) + d);

/** Alle Dateien unter der Ablage als Text — für die Suche nach dem Klartext. */
async function alleDateien(dir) {
  const aus = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) aus.push(...(await alleDateien(p)));
    else aus.push(await readFile(p, "utf8"));
  }
  return aus.join("\n");
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-zweifaktor-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_ADMIN = ADMIN;
  delete process.env.CENTRIC_ZWEIFAKTOR_PFLICHT;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  /* Die Bremse von /einrichten selbst ist hier nicht Gegenstand. */
  schutz.GRENZEN.einrichten = { ...schutz.GRENZEN.einrichten, versuche: 100000 };
  schutz.WEITERE.einrichten = { gesamt: { versuche: 100000, fenster: 600 } };
  einrichten = (await import("../server/funktionen/einrichten.mjs")).default;
  ({ verwalterAnlegen } = await import("../server/lib/verwalter.mjs"));
});
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

describe("Ablauf über /einrichten/zweifaktor", () => {
  const antworten = [];
  const merke = (a) => { antworten.push(a.roh); return a; };
  let geheimnis, wiederherstellung;

  it("ohne zweiten Faktor: alles wie bisher, Stand meldet nicht aktiv", async () => {
    expect(merke(await anfrage("/einrichten/verwalter")).status).toBe(200);
    const st = merke(await anfrage("/einrichten/zweifaktor"));
    expect(st.status).toBe(200);
    expect(st).toMatchObject({ aktiv: false, ausstehend: false, moeglich: true });
  });

  it("falscher Verwalterschlüssel kommt nicht an den zweiten Faktor heran", async () => {
    expect((await anfrage("/einrichten/zweifaktor", { schluessel: "falsch" })).status).toBe(401);
  });

  it("Einrichten gibt Geheimnis und otpauth genau hier zurück", async () => {
    const a = await anfrage("/einrichten/zweifaktor", { methode: "POST", rumpf: { aktion: "beginnen" } });
    expect(a.status, a.roh).toBe(200);
    expect(a.geheimnis).toMatch(/^[A-Z2-7]{32}$/);
    expect(a.otpauth).toContain(`secret=${a.geheimnis}`);
    geheimnis = a.geheimnis;
    /* Noch nicht bestätigt: noch keine Pflicht. */
    expect(merke(await anfrage("/einrichten/verwalter")).status).toBe(200);
  });

  it("Bestätigen mit falschem Code scheitert, mit richtigem gibt es zehn Wiederherstellungscodes", async () => {
    const f = merke(await anfrage("/einrichten/zweifaktor", { methode: "POST",
      rumpf: { aktion: "bestaetigen", zweifaktor: code(geheimnis, 3) } }));
    expect(f.status).toBe(401);
    /* Diese eine Antwort trägt die Wiederherstellungscodes — sie wird nicht gemerkt. */
    const a = await anfrage("/einrichten/zweifaktor", { methode: "POST",
      rumpf: { aktion: "bestaetigen", zweifaktor: code(geheimnis) } });
    expect(a.status, a.roh).toBe(200);
    expect(a.roh).not.toContain(geheimnis);
    expect(a.aktiv).toBe(true);
    expect(a.wiederherstellung).toHaveLength(10);
    expect(new Set(a.wiederherstellung).size).toBe(10);
    wiederherstellung = a.wiederherstellung;
  });

  it("Pflicht: ohne Code 401 auf jedem Pfad, mit Code 200", async () => {
    for (const p of ["/einrichten/verwalter", "/einrichten/umgebung", "/einrichten/zweifaktor",
      "/einrichten/uebersicht?bestand=raum-a"]) {
      const a = merke(await anfrage(p));
      expect(a.status, p).toBe(401);
      expect(a.zweifaktor, p).toBe("erforderlich");
    }
    const anlegen = merke(await anfrage("/einrichten", { methode: "POST",
      rumpf: { name: "X", bestand: "raum-a", rolle: "betreiber" } }));
    expect(anlegen.status).toBe(401);
    expect(anlegen.zugangscode).toBeUndefined();

    uhr(jetzt + 30_000);
    const ok = merke(await anfrage("/einrichten/verwalter", { kopf: { "x-centric-zweifaktor": code(geheimnis) } }));
    expect(ok.status, ok.roh).toBe(200);
  });

  it("derselbe Code ein zweites Mal: abgewiesen — auch innerhalb seiner Gültigkeit", async () => {
    const c = code(geheimnis);
    const a = merke(await anfrage("/einrichten/verwalter", { kopf: { "x-centric-zweifaktor": c } }));
    expect(a.status).toBe(401);
    expect(a.fehler).toMatch(/schon verwendet/);
    /* Der nächste Schritt (im Fenster +1) geht. */
    const b = merke(await anfrage("/einrichten/verwalter", { kopf: { "x-centric-zweifaktor": code(geheimnis, 1) } }));
    expect(b.status, b.roh).toBe(200);
    /* Danach der laufende Schritt — älter als der zuletzt angenommene: abgewiesen. */
    expect(merke(await anfrage("/einrichten/verwalter", { kopf: { "x-centric-zweifaktor": c } })).status).toBe(401);
  });

  it("Wiederherstellungscode gilt genau einmal", async () => {
    const w = wiederherstellung[0];
    const a = merke(await anfrage("/einrichten/verwalter", { rumpf: undefined,
      kopf: { "x-centric-zweifaktor": w.toLowerCase() } }));
    expect(a.status, a.roh).toBe(200);
    expect(merke(await anfrage("/einrichten/verwalter", { kopf: { "x-centric-zweifaktor": w } })).status).toBe(401);
    const st = merke(await anfrage("/einrichten/zweifaktor", { kopf: { "x-centric-zweifaktor": wiederherstellung[1] } }));
    expect(st.wiederherstellungUebrig).toBe(8);
  });

  it("Nachweis: mit frischem Code geholt, 15 Minuten gültig, nicht zum Abschalten", async () => {
    uhr(jetzt + 60_000);
    /* Ein Nachweis lässt sich nicht mit einem Nachweis holen. */
    const ohne = merke(await anfrage("/einrichten/zweifaktor", { methode: "POST", rumpf: { aktion: "nachweis" } }));
    expect(ohne.status).toBe(401);
    const n = merke(await anfrage("/einrichten/zweifaktor", { methode: "POST",
      rumpf: { aktion: "nachweis", zweifaktor: code(geheimnis) } }));
    expect(n.status, n.roh).toBe(200);
    expect(n.nachweis).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const kopf = { "x-centric-zweifaktor-nachweis": n.nachweis };
    expect(merke(await anfrage("/einrichten/verwalter", { kopf })).status).toBe(200);
    expect(merke(await anfrage("/einrichten/verwalter", { kopf })).status).toBe(200);
    expect(merke(await anfrage("/einrichten/zweifaktor", { methode: "DELETE", kopf })).status).toBe(401);
    /* Ein anderer Schlüssel kann mit diesem Nachweis nichts anfangen. */
    const fremd = await verwalterAnlegen(laden(), { name: "Fremd", durch: "Pruefung" });
    const zf = merke(await anfrage("/einrichten/zweifaktor", { methode: "POST", schluessel: fremd.schluessel,
      rumpf: { aktion: "beginnen" } }));
    const zfB = merke(await anfrage("/einrichten/zweifaktor", { methode: "POST", schluessel: fremd.schluessel,
      rumpf: { aktion: "bestaetigen", zweifaktor: code(zf.geheimnis) } }));
    expect(zfB.status).toBe(200);
    expect(merke(await anfrage("/einrichten/verwalter", { schluessel: fremd.schluessel, kopf })).status).toBe(401);
    /* Nach 15 Minuten: abgelaufen. */
    uhr(jetzt + 15 * 60_000 + 1000);
    expect(merke(await anfrage("/einrichten/verwalter", { kopf })).status).toBe(401);
  });

  it("die Verwalterliste sagt ja oder nein, nie mehr", async () => {
    uhr(jetzt + 30_000);
    const l = merke(await anfrage("/einrichten/verwalter", { kopf: { "x-centric-zweifaktor": code(geheimnis) } }));
    expect(l.status, l.roh).toBe(200);
    const fremd = l.verwalter.find((v) => v.name === "Fremd");
    expect(fremd.zweifaktor).toBe(true);
    expect(Object.keys(fremd).sort()).toEqual(["abgelaufen", "angelegt", "angelegtVon", "email", "gesperrt",
      "kennung", "laeuftAb", "name", "zweifaktor"]);
  });

  it("kein Geheimnis in irgendeiner späteren Antwort und kein Klartext in der Ablage", async () => {
    expect(antworten.length).toBeGreaterThan(15);
    const alles = antworten.join("\n");
    expect(alles).not.toContain(geheimnis);
    for (const w of wiederherstellung) expect(alles).not.toContain(w);
    const ablage = await alleDateien(wurzel);
    expect(ablage).not.toContain(geheimnis);
    expect(ablage).not.toContain(base32Dekodieren(geheimnis).toString("base64"));
    expect(ablage).not.toContain(base32Dekodieren(geheimnis).toString("hex"));
    for (const w of wiederherstellung) expect(ablage).not.toContain(w);
  });

  it("Abschalten nur mit gültigem Code; danach geht es ohne", async () => {
    uhr(jetzt + 30_000);
    expect(merke(await anfrage("/einrichten/zweifaktor", { methode: "DELETE" })).status).toBe(401);
    expect(merke(await anfrage("/einrichten/zweifaktor", { methode: "DELETE",
      rumpf: { zweifaktor: "000000" } })).status).toBe(401);
    const a = merke(await anfrage("/einrichten/zweifaktor", { methode: "DELETE",
      rumpf: { zweifaktor: code(geheimnis) } }));
    expect(a.status, a.roh).toBe(200);
    expect(merke(await anfrage("/einrichten/verwalter")).status).toBe(200);
    expect(merke(await anfrage("/einrichten/zweifaktor")).aktiv).toBe(false);
  });
});

describe("Bremse für Code-Versuche", () => {
  it("eigene Art, fail-closed, steigend", () => {
    expect(schutz.GRENZEN.zweifaktor).toMatchObject({ versuche: 5, failClosed: true, steigend: true });
  });

  it("fünf falsche Codes aus fünf Herkünften — danach auch der richtige 429", async () => {
    uhr(jetzt + 60_000);
    const v = await verwalterAnlegen(laden(), { name: "Bremsprobe", durch: "Pruefung" });
    const b = await anfrage("/einrichten/zweifaktor", { methode: "POST", schluessel: v.schluessel,
      rumpf: { aktion: "beginnen" } });
    const best = await anfrage("/einrichten/zweifaktor", { methode: "POST", schluessel: v.schluessel,
      rumpf: { aktion: "bestaetigen", zweifaktor: code(b.geheimnis) } });
    expect(best.status, best.roh).toBe(200);
    uhr(jetzt + 30_000);
    const falsch = code(b.geheimnis, 5);
    for (let i = 0; i < 5; i++) {
      const a = await anfrage("/einrichten/verwalter", { schluessel: v.schluessel,
        xff: `10.99.0.${i + 1}`, kopf: { "x-centric-zweifaktor": falsch } });
      expect(a.status, `Versuch ${i + 1}`).toBe(401);
    }
    const richtig = await anfrage("/einrichten/verwalter", { schluessel: v.schluessel,
      xff: "10.99.0.77", kopf: { "x-centric-zweifaktor": code(b.geheimnis) } });
    expect(richtig.status).toBe(429);
  });

  it("unlesbarer Stand des zweiten Faktors: 503, nicht durchgelassen", async () => {
    const v = await verwalterAnlegen(laden(), { name: "Lesefehler", durch: "Pruefung" });
    const { createHash } = await import("node:crypto");
    const id = createHash("sha256").update(v.schluessel).digest("hex");
    const datei = path.join(wurzel, "centric", `zweifaktor%3A${id}.json`);
    await mkdir(datei);
    const a = await anfrage("/einrichten/verwalter", { schluessel: v.schluessel });
    expect(a.status, a.roh).toBe(503);
    await rm(datei, { recursive: true, force: true });
    await unlink(datei).catch(() => {});
  });
});

describe("CENTRIC_ZWEIFAKTOR_PFLICHT", () => {
  it("ohne eingerichteten zweiten Faktor nur noch /einrichten/zweifaktor", async () => {
    process.env.CENTRIC_ZWEIFAKTOR_PFLICHT = "1";
    try {
      const v = await verwalterAnlegen(laden(), { name: "Pflichtprobe", durch: "Pruefung" });
      const a = await anfrage("/einrichten/verwalter", { schluessel: v.schluessel });
      expect(a.status).toBe(403);
      expect(a.zweifaktor).toBe("einrichten");
      const anlegen = await anfrage("/einrichten", { methode: "POST", schluessel: v.schluessel,
        rumpf: { name: "X", bestand: "raum-b", rolle: "betreiber" } });
      expect(anlegen.status).toBe(403);
      const st = await anfrage("/einrichten/zweifaktor", { schluessel: v.schluessel });
      expect(st.status).toBe(200);
      expect(st.pflicht).toBe(true);
      uhr(jetzt + 60_000);
      const b = await anfrage("/einrichten/zweifaktor", { methode: "POST", schluessel: v.schluessel,
        rumpf: { aktion: "beginnen" } });
      expect((await anfrage("/einrichten/zweifaktor", { methode: "POST", schluessel: v.schluessel,
        rumpf: { aktion: "bestaetigen", zweifaktor: code(b.geheimnis) } })).status).toBe(200);
      uhr(jetzt + 30_000);
      expect((await anfrage("/einrichten/verwalter", { schluessel: v.schluessel,
        kopf: { "x-centric-zweifaktor": code(b.geheimnis) } })).status).toBe(200);
    } finally { delete process.env.CENTRIC_ZWEIFAKTOR_PFLICHT; }
  });
});

describe("Oberfläche (src/betreiber-2fa.jsx)", () => {
  it("rendert ohne Schlüssel: Eingaben da, nur „Stand abfragen“ als Knopf, kein Geheimnis", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const Ansicht = (await import("../src/betreiber-2fa.jsx")).default;
    const h = React.createElement;
    const ui = {
      H1: ({ children }) => h("h1", null, children),
      Card: ({ children }) => h("section", null, children),
      CardHead: ({ children }) => h("h2", null, children),
      Btn: ({ children, disabled }) => h("button", { disabled }, children),
      Inp: (p) => h("input", p),
      Field: ({ label, children }) => h("label", null, label, children),
    };
    const html = renderToStaticMarkup(h(Ansicht, { ui }));
    expect(html).toContain("Zwei-Faktor");
    expect(html).toContain('type="password"');
    expect(html).toContain("Stand abfragen");
    expect(html).not.toContain("Einrichten</button>");
    expect(html).not.toContain("otpauth");
  });
});

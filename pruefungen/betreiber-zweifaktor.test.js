/* ==========================================================================
   ZWEI-FAKTOR FÜR BETREIBERCODES (WP-32b)

   Ein Zugangscode der Rolle „betreiber" öffnet die Betreiberkonsole. Bis
   WP-32b genügte er allein. Jetzt lässt sich über /api/anmelden selbst ein
   zweiter Faktor (TOTP) einrichten; danach gibt die Anmeldung mit diesem
   Code nur noch mit gültigem Code aus der App eine Sitzung heraus.

   Rot auf altem Stand: /api/anmelden kannte `zweifaktorAktion` nicht und
   gab für „beginnen“ eine Sitzung statt eines Geheimnisses heraus.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 3, 9, 0, 15);
const CODE = "BTR2-FAKT-OR01";
const CODE_LEITUNG = "LEI2-FAKT-OR02";
let wurzel, laden, daten, schutz;
let nr = 0;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const antworten = [];

const anmelden = async (rumpf, xff) => {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      "x-forwarded-for": xff || `10.33.${Math.floor(nr / 250)}.${nr % 250}` },
    body: JSON.stringify(rumpf) }), {});
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, ...d };
};
async function bremseLeeren() {
  const { createHash } = await import("node:crypto");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  const id = createHash("sha256").update(`betreiber-code:${ablageSchluessel(CODE)}`).digest("hex");
  await schutz.entlasten("zweifaktor", `b:${id.slice(0, 16)}`);
}
const merke = (a) => { antworten.push(a.roh); return a; };
const code = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);

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
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-betreiber-2fa-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-betreiber-2fa-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  schutz = await import("../server/lib/schutz.mjs");
  /* Die Anmeldebremse ist hier nicht Gegenstand — die Zwei-Faktor-Bremse schon. */
  schutz.GRENZEN.anmelden = { ...schutz.GRENZEN.anmelden, versuche: 100000 };
  schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  const { kontoSchreiben } = await import("../server/lib/konten.mjs");
  const { ablageSchluessel } = await import("../server/lib/codes.mjs");
  await kontoSchreiben(laden(), ablageSchluessel(CODE), { name: "Betreiber Probe", bestand: "betreiber-probe",
    rolle: "betreiber", person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
  await kontoSchreiben(laden(), ablageSchluessel(CODE_LEITUNG), { name: "Leitung Probe", bestand: "betreiber-probe",
    rolle: "leitung", person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
});
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

describe("Betreibercode mit zweitem Faktor über /api/anmelden", () => {
  let geheimnis, wiederherstellung;

  it("ohne zweiten Faktor: Anmeldung wie bisher, Antwort sagt zweifaktor: false", async () => {
    const a = merke(await anmelden({ zugangscode: CODE }));
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeTruthy();
    expect(a.zweifaktor).toBe(false);
    expect(merke(await anmelden({ zugangscode: CODE, zweifaktorAktion: "stand" }))).toMatchObject({ aktiv: false });
  });

  it("Aktionen nur mit gültigem Betreibercode — ein falscher verrät nichts", async () => {
    const a = merke(await anmelden({ zugangscode: "FALS-CHER-CODE", zweifaktorAktion: "beginnen" }));
    expect(a.status).toBe(401);
    expect(a.geheimnis).toBeUndefined();
  });

  it("andere Rollen kennen keine Zwei-Faktor-Aktion und melden sich unverändert an", async () => {
    expect((await anmelden({ zugangscode: CODE_LEITUNG, zweifaktorAktion: "beginnen" })).status).toBe(400);
    const a = await anmelden({ zugangscode: CODE_LEITUNG });
    expect(a.status, a.roh).toBe(200);
    expect(a.zweifaktor).toBeUndefined();
  });

  it("Einrichten: Geheimnis einmal, keine Sitzung", async () => {
    const a = await anmelden({ zugangscode: CODE, zweifaktorAktion: "beginnen" });
    expect(a.status, a.roh).toBe(200);
    expect(a.geheimnis).toMatch(/^[A-Z2-7]{32}$/);
    expect(a.otpauth).toContain("otpauth://totp/");
    expect(a.token).toBeUndefined();
    geheimnis = a.geheimnis;
  });

  it("Bestätigen: falscher Code 401, richtiger gibt zehn Wiederherstellungscodes, keine Sitzung", async () => {
    expect(merke(await anmelden({ zugangscode: CODE, zweifaktorAktion: "bestaetigen",
      zweifaktor: code(geheimnis, 4) })).status).toBe(401);
    const a = await anmelden({ zugangscode: CODE, zweifaktorAktion: "bestaetigen", zweifaktor: code(geheimnis) });
    expect(a.status, a.roh).toBe(200);
    expect(a.wiederherstellung).toHaveLength(10);
    expect(a.token).toBeUndefined();
    wiederherstellung = a.wiederherstellung;
  });

  it("Pflicht: ohne Code keine Sitzung; mit Code Sitzung; derselbe Code nicht zweimal", async () => {
    const ohne = merke(await anmelden({ zugangscode: CODE }));
    expect(ohne.status).toBe(401);
    expect(ohne.zweifaktor).toBe("erforderlich");
    expect(ohne.token).toBeUndefined();
    const falsch = merke(await anmelden({ zugangscode: CODE, zweifaktor: "000000" }));
    expect(falsch.status).toBe(401);
    expect(falsch.token).toBeUndefined();
    uhr(jetzt + 30_000);
    const c = code(geheimnis);
    const mit = merke(await anmelden({ zugangscode: CODE, zweifaktor: c }));
    expect(mit.status, mit.roh).toBe(200);
    expect(mit.token).toBeTruthy();
    expect(mit.zweifaktor).toBe(true);
    const nochmal = merke(await anmelden({ zugangscode: CODE, zweifaktor: c }));
    expect(nochmal.status).toBe(401);
    expect(nochmal.token).toBeUndefined();
  });

  it("Wiederherstellungscode: einmal", async () => {
    const a = merke(await anmelden({ zugangscode: CODE, zweifaktor: wiederherstellung[0] }));
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeTruthy();
    expect((await anmelden({ zugangscode: CODE, zweifaktor: wiederherstellung[0] })).status).toBe(401);
  });

  it("Bremse: fünf falsche Codes aus fünf Herkünften — danach auch der richtige 429", async () => {
    /* Zählstand der vorigen Fehlversuche leeren — hier zählt nur diese Reihe. */
    await bremseLeeren();
    uhr(jetzt + 30_000);
    const falsch = code(geheimnis, 7);
    for (let i = 0; i < 5; i++)
      expect((await anmelden({ zugangscode: CODE, zweifaktor: falsch }, `10.77.0.${i + 1}`)).status).toBe(401);
    const r = await anmelden({ zugangscode: CODE, zweifaktor: code(geheimnis) }, "10.77.0.99");
    expect(r.status).toBe(429);
    expect(r.token).toBeUndefined();
    expect(schutz.GRENZEN.zweifaktor.failClosed).toBe(true);
  });

  it("Abschalten nur mit gültigem Code; danach wieder ohne", async () => {
    /* Bremse dieses Codes zurücksetzen (wie nach Ablauf der Sperre). */
    await bremseLeeren();
    uhr(jetzt + 60_000);
    expect(merke(await anmelden({ zugangscode: CODE, zweifaktorAktion: "abschalten" })).status).toBe(401);
    const a = merke(await anmelden({ zugangscode: CODE, zweifaktorAktion: "abschalten", zweifaktor: code(geheimnis) }));
    expect(a.status, a.roh).toBe(200);
    expect(a.token).toBeUndefined();
    const b = merke(await anmelden({ zugangscode: CODE }));
    expect(b.status).toBe(200);
    expect(b.zweifaktor).toBe(false);
  });

  it("kein Geheimnis in späteren Antworten, kein Klartext in der Ablage", async () => {
    const alles = antworten.join("\n");
    expect(alles).not.toContain(geheimnis);
    for (const w of wiederherstellung) expect(alles).not.toContain(w);
    const ablage = await alleDateien(wurzel);
    expect(ablage).not.toContain(geheimnis);
    expect(ablage).not.toContain(base32Dekodieren(geheimnis).toString("base64"));
    for (const w of wiederherstellung) expect(ablage).not.toContain(w);
  });
});

describe("Oberfläche", () => {
  it("Code-Feld der Anmeldemaske und beide Abschnitte der Konsole rendern", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: Ansicht, ZweifaktorFeld } = await import("../src/betreiber-2fa.jsx");
    const h = React.createElement;
    const F = { dim: "#666", line: "#ccc", bg: "#fff", text: "#000" };
    const feld = renderToStaticMarkup(h(ZweifaktorFeld, { wert: "", setWert: () => {}, senden: () => {}, F }));
    expect(feld).toContain('id="zweifaktor"');
    expect(feld).toContain("one-time-code");
    const ui = {
      H1: ({ children }) => h("h1", null, children),
      Card: ({ children }) => h("section", null, children),
      CardHead: ({ children }) => h("h2", null, children),
      Btn: ({ children, disabled }) => h("button", { disabled }, children),
      Inp: (p) => h("input", p),
      Field: ({ label, children }) => h("label", null, label, children),
    };
    const html = renderToStaticMarkup(h(Ansicht, { ui }));
    expect(html).toContain("Betreibercode (Anmeldung an der Konsole)");
    expect(html).toContain("Verwalterschlüssel (/einrichten)");
  });
});

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

describe("B2: Wechsel des zweiten Faktors beendet die Sitzungen dieses Codes", () => {
  const CODE_B2 = "BTR2-SITZ-UNG3";
  const CODE_ANDERS = "BTR2-ANDE-RER4";
  let S;
  const lebt = async (token) => !!(await S.sitzungsSpeicher().get(S.sitzungsSchluessel(token), { type: "json" }));

  beforeAll(async () => {
    S = await import("../server/lib/sitzungen.mjs");
    const { kontoSchreiben } = await import("../server/lib/konten.mjs");
    const { ablageSchluessel } = await import("../server/lib/codes.mjs");
    for (const [c, n] of [[CODE_B2, "Betreiber B2"], [CODE_ANDERS, "Betreiber anders"]])
      await kontoSchreiben(laden(), ablageSchluessel(c), { name: n, bestand: "betreiber-probe",
        rolle: "betreiber", person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
  });

  it("Bestätigen beendet ältere Sitzungen dieses Codes, nicht die eines anderen", async () => {
    uhr(jetzt + 60_000);
    const alt = (await anmelden({ zugangscode: CODE_B2 })).token;
    const fremd = (await anmelden({ zugangscode: CODE_ANDERS })).token;
    expect(await lebt(alt)).toBe(true);
    const b = await anmelden({ zugangscode: CODE_B2, zweifaktorAktion: "beginnen" });
    const best = await anmelden({ zugangscode: CODE_B2, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
    expect(best.status, best.roh).toBe(200);
    expect(best.sitzungenBeendet).toBe(1);
    expect(await lebt(alt)).toBe(false);
    expect(await lebt(fremd)).toBe(true);

    /* Abschalten: die mit zweitem Faktor entstandene Sitzung endet ebenfalls. */
    uhr(jetzt + 30_000);
    const mit = await anmelden({ zugangscode: CODE_B2, zweifaktor: code(b.geheimnis) });
    expect(mit.token).toBeTruthy();
    uhr(jetzt + 30_000);
    const ab = await anmelden({ zugangscode: CODE_B2, zweifaktorAktion: "abschalten", zweifaktor: code(b.geheimnis) });
    expect(ab.status, ab.roh).toBe(200);
    expect(ab.sitzungenBeendet).toBe(1);
    expect(await lebt(mit.token)).toBe(false);
    expect(await lebt(fremd)).toBe(true);
  });
});

describe("Review-Auflagen WP-32c", () => {
  let S, C, K;
  const lebt = async (token) => !!(await S.sitzungsSpeicher().get(S.sitzungsSchluessel(token), { type: "json" }));
  const anlegen = (schl, n) => K.kontoSchreiben(laden(), schl, { name: n, bestand: "betreiber-probe",
    rolle: "betreiber", person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
  beforeAll(async () => {
    S = await import("../server/lib/sitzungen.mjs");
    C = await import("../server/lib/codes.mjs");
    K = await import("../server/lib/konten.mjs");
  });

  it("B-M1: Sitzung aus der Zeit vor dem Umschlüsseln endet beim Bestätigen", async () => {
    const ALT = "BTR2-ALTC-ODE7";
    expect(C.altHash(ALT)).not.toBe(C.ablageSchluessel(ALT));
    await anlegen(C.altHash(ALT), "Betreiber Altcode");
    uhr(jetzt + 60_000);
    const alt = await anmelden({ zugangscode: ALT });          // über den alten Schlüssel gefunden, umgeschlüsselt
    expect(alt.status, alt.roh).toBe(200);
    expect(await lebt(alt.token)).toBe(true);
    const b = await anmelden({ zugangscode: ALT, zweifaktorAktion: "beginnen" });   // jetzt über den neuen
    const best = await anmelden({ zugangscode: ALT, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
    expect(best.status, best.roh).toBe(200);
    expect(best.sitzungenBeendet).toBeGreaterThanOrEqual(1);
    expect(await lebt(alt.token)).toBe(false);
  });

  it("B-M2: lassen sich die Sitzungen nicht beenden, wird NICHT aktiviert (503), Wiederholung klappt", async () => {
    const CODE_M2 = "BTR2-TEIL-FEH8";
    await anlegen(C.ablageSchluessel(CODE_M2), "Betreiber M2");
    uhr(jetzt + 60_000);
    const alt = (await anmelden({ zugangscode: CODE_M2 })).token;
    const b = await anmelden({ zugangscode: CODE_M2, zweifaktorAktion: "beginnen" });
    const { rename, writeFile, rm: rmF } = await import("node:fs/promises");
    const ort = path.join(wurzel, "centric-sitzungen");
    await rename(ort, ort + ".weg");
    await writeFile(ort, "kein Verzeichnis");
    try {
      const r = await anmelden({ zugangscode: CODE_M2, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
      expect(r.status, r.roh).toBe(503);
      expect(r.wiederherstellung).toBeUndefined();
    } finally {
      await rmF(ort, { force: true });
      await rename(ort + ".weg", ort);
    }
    expect(await anmelden({ zugangscode: CODE_M2, zweifaktorAktion: "stand" })).toMatchObject({ aktiv: false, ausstehend: true });
    uhr(jetzt + 30_000);
    const r2 = await anmelden({ zugangscode: CODE_M2, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
    expect(r2.status, r2.roh).toBe(200);
    expect(await lebt(alt)).toBe(false);
  });

  it("Nachprüfung: falscher Code beim Bestätigen oder Abschalten beendet keine Sitzung", async () => {
    const CODE_F = "BTR2-FALS-CHC0";
    await anlegen(C.ablageSchluessel(CODE_F), "Betreiber falsch");
    uhr(jetzt + 60_000);
    const s1 = (await anmelden({ zugangscode: CODE_F })).token;
    const b = await anmelden({ zugangscode: CODE_F, zweifaktorAktion: "beginnen" });
    const falsch = await anmelden({ zugangscode: CODE_F, zweifaktorAktion: "bestaetigen", zweifaktor: "000000" });
    expect(falsch.status).toBe(401);
    expect(await lebt(s1)).toBe(true);
    const gut = await anmelden({ zugangscode: CODE_F, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) });
    expect(gut.status, gut.roh).toBe(200);
    expect(await lebt(s1)).toBe(false);
    uhr(jetzt + 30_000);
    const s2 = (await anmelden({ zugangscode: CODE_F, zweifaktor: code(b.geheimnis) })).token;
    expect(await lebt(s2)).toBe(true);
    const abF = await anmelden({ zugangscode: CODE_F, zweifaktorAktion: "abschalten", zweifaktor: "000000" });
    expect(abF.status).toBe(401);
    expect(await lebt(s2)).toBe(true);
  });

  it("B-N2: überschreibendes „beginnen“ wird gebremst", async () => {
    const CODE_N2 = "BTR2-UEBE-RS09";
    await anlegen(C.ablageSchluessel(CODE_N2), "Betreiber N2");
    expect((await anmelden({ zugangscode: CODE_N2, zweifaktorAktion: "beginnen" }, "10.88.0.1")).status).toBe(200);
    const st = [];
    for (let i = 0; i < 7; i++)
      st.push((await anmelden({ zugangscode: CODE_N2, zweifaktorAktion: "beginnen" }, `10.88.1.${i}`)).status);
    expect(st.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(st).toContain(429);
  });
});

describe("CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1", () => {
  const CODE_P = "BTR2-PFLI-CHT5";
  beforeAll(async () => {
    const { kontoSchreiben } = await import("../server/lib/konten.mjs");
    const { ablageSchluessel } = await import("../server/lib/codes.mjs");
    await kontoSchreiben(laden(), ablageSchluessel(CODE_P), { name: "Betreiber Pflicht", bestand: "betreiber-probe",
      rolle: "betreiber", person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
  });

  it("ohne eingerichteten Faktor keine Sitzung, nur die Einrichtung; danach Anmeldung mit Code", async () => {
    process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT = "1";
    try {
      const ohne = await anmelden({ zugangscode: CODE_P });
      expect(ohne.status).toBe(403);
      expect(ohne.zweifaktor).toBe("einrichten");
      expect(ohne.token).toBeUndefined();
      expect(await anmelden({ zugangscode: CODE_P, zweifaktorAktion: "stand" })).toMatchObject({ aktiv: false, pflicht: true });
      uhr(jetzt + 60_000);
      const b = await anmelden({ zugangscode: CODE_P, zweifaktorAktion: "beginnen" });
      expect(b.geheimnis).toBeTruthy();
      expect((await anmelden({ zugangscode: CODE_P, zweifaktorAktion: "bestaetigen", zweifaktor: code(b.geheimnis) })).status).toBe(200);
      uhr(jetzt + 30_000);
      const mit = await anmelden({ zugangscode: CODE_P, zweifaktor: code(b.geheimnis) });
      expect(mit.status, mit.roh).toBe(200);
      expect(mit.token).toBeTruthy();
      /* Andere Rollen bleiben unberührt. */
      expect((await anmelden({ zugangscode: CODE_LEITUNG })).status).toBe(200);
    } finally { delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT; }
  });

  it("ohne den Schalter: Vorgabe aus", async () => {
    const { kontoSchreiben } = await import("../server/lib/konten.mjs");
    const { ablageSchluessel } = await import("../server/lib/codes.mjs");
    await kontoSchreiben(laden(), ablageSchluessel("BTR2-OHNE-PFL6"), { name: "Betreiber ohne", bestand: "betreiber-probe",
      rolle: "betreiber", person: null, betrieb: 0, mandantId: null, angelegt: "2026-01-01T00:00:00.000Z" });
    const a = await anmelden({ zugangscode: "BTR2-OHNE-PFL6" });
    expect(a.status).toBe(200);
    expect(a.token).toBeTruthy();
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

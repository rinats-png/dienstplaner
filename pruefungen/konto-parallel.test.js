/* ==========================================================================
   PARALLELE SCHREIBVORGÄNGE AM ZUGANG — keine veraltete Kopie überschreibt
   eine neuere, sicherheitsrelevante Änderung (A-3, Betreibervorgabe 2026-11-13)

   Deterministische Verschränkung über eine Schranke (keine Zeitabhängigkeit):
   Die Erstanmeldung (lib/erstleitung.mjs) hält an, NACHDEM sie den Zugang
   gelesen und vorgemerkt hat — beim Schreiben des Bestands (Schritt 2b). In
   dieser Pause sperrt der echte Handler (POST /api/zugang-sperren, daten.mjs)
   denselben Zugang, und ein zweiter Faktor wird vermerkt (dieselbe Funktion
   wie beim Einrichten über die Anmeldung). Danach läuft die Erstanmeldung
   weiter und bindet den Zugang.

   Erwartet: Sperre UND Faktorvermerk UND Bindung stehen am Ende im Zugang; die
   anschließende Anmeldung wird abgewiesen (gesperrt). Bis 2026-11 schrieb die
   Bindung die vor der Pause gelesene Kopie zurück — die Sperre war weg und der
   zurückgezogene Code meldete sich wieder an. Umgekehrt (Sperren mit einer zu
   Beginn gelesenen Kopie) ging eine Bindung verloren; auch das prüft der
   zweite Fall: Viele echte, gleichzeitige Sperr- und Anmeldeanfragen in einer
   Schleife.

   Aufruf: npx vitest run pruefungen/konto-parallel.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const WIRT = "127.0.0.1:3000";
let wurzel, L, daten;
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.31.${Math.floor(nr / 250) % 250}.${(nr % 250) + 1}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
};
const store = () => L.getStore({ name: "centric", consistency: "strong" });
const leererBetrieb = (id) => ({ version: 9, mandanten: [{ id, name: id, einheiten: [{ id: "e1", name: "WB 1" }], personen: [] }] });
async function erstcode(raum) {
  const code = `P${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
  await L.kontoSchreiben(store(), L.ablageSchluessel(code), { name: `Leitung ${raum}`, bestand: raum, rolle: "leitung",
    person: null, betrieb: 0, mandantId: raum, demo: false, gruppe: null, hinweis: null, angelegt: new Date().toISOString(),
    erstleitung: L.erstleitungVermerk(raum) });
  return code;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-konto-parallel-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  L = { ...(await import("../server/lib/ablage.mjs")), ...(await import("../server/lib/konten.mjs")),
    ...(await import("../server/lib/codes.mjs")), ...(await import("../server/lib/bestand.mjs")),
    ...(await import("../server/lib/sitzungen.mjs")), ...(await import("../server/lib/erstleitung.mjs")) };
  daten = (await import("../server/funktionen/daten.mjs")).default;
});

afterAll(async () => { await rm(wurzel, { recursive: true, force: true }).catch(() => {}); });

/* Je Aufruf eine eigene Betreiberkennung (die Bremse „zugaenge“ zählt je Raum der Sitzung). */
let bnr = 0;
async function betreiberSitzung() {
  bnr += 1;
  return (await L.sitzungAnlegen({ bestand: `pk-betreiber-${bnr}`, name: "Betreiber", rolle: "betreiber", person: null, betrieb: 0,
    mandantId: null }, 3600e3)).token;
}

describe.sequential("Zugang: Sperre, Faktorvermerk und Bindung der Erstanmeldung gleichzeitig", () => {
  it("deterministisch: Sperre und Faktorvermerk in der Pause der Erstanmeldung bleiben erhalten; Bindung auch", async () => {
    const raum = "pk-a";
    await L.bestandSchreiben(store(), raum, leererBetrieb(raum), { durch: "Prüfung" });
    const code = await erstcode(raum);
    const schluessel = L.ablageSchluessel(code);
    /* Schranke: die Erstanmeldung hält beim Schreiben des Journals ihres Bestands (Schritt 2b) an. */
    let angekommen, weiter;
    const ankunft = new Promise((r) => { angekommen = r; });
    const freigabe = new Promise((r) => { weiter = r; });
    const basis = store();
    const mitSchranke = new Proxy(basis, { get(z, k) {
      const f = z[k];
      if (k === "setJSON" && typeof f === "function")
        return async (schl, ...rest) => {
          if (String(schl) === `journal:${raum}`) { angekommen(); await freigabe; }
          return f.call(z, schl, ...rest);
        };
      return typeof f === "function" ? f.bind(z) : f;
    } });
    const lauf = L.erstleitungEinloesen(mitSchranke, { schluessel });
    await ankunft;
    /* In der Pause: Der Zugang trägt die Vormerkung (gelesen und geschrieben vor der Pause). */
    expect((await L.kontoLesenStreng(store(), schluessel)).erstleitung.personId).toMatch(/^p_[0-9a-f]{7}$/);
    /* Echter Handler: der Betreiber zieht den Code zurück. */
    const sp = await anfrage("/api/zugang-sperren", { token: await betreiberSitzung(), rumpf: { code } });
    expect(sp.status, sp.fehler).toBe(200);
    expect((await L.kontoLesenStreng(store(), schluessel)).gesperrt).toBe(true);
    /* Ein gleichzeitiger Faktorschritt am selben Zugang (frisch gelesen, ein Feld gesetzt). */
    await L.kontoSchreiben(store(), schluessel, { ...(await L.kontoLesenStreng(store(), schluessel)), zweiterFaktor: true });
    weiter();
    const erg = await lauf;
    const k = await L.kontoLesenStreng(store(), schluessel);
    /* Nichts verloren: Sperre, Faktorvermerk, Bindung. */
    expect(k.gesperrt).toBe(true);
    expect(k.gesperrtAm).toEqual(expect.any(String));
    expect(k.zweiterFaktor).toBe(true);
    expect(erg.ok).toBe(true);
    expect(k.person).toBe(erg.personId);
    expect(k.erstleitungVerbraucht).toMatchObject({ grund: "angelegt", personId: erg.personId });
    /* Der zurückgezogene Code meldet sich nicht wieder an. */
    const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
    expect(a.status).toBe(403);
    expect(a.token).toBeUndefined();
  });

  it("echte gleichzeitige Anfragen in einer Schleife: jede Sperre bleibt, keine Bindung geht verloren", async () => {
    for (let i = 0; i < 12; i++) {
      const t = await betreiberSitzung();
      const raum = `pk-s${i}`;
      await L.bestandSchreiben(store(), raum, leererBetrieb(raum), { durch: "Prüfung" });
      const code = await erstcode(raum);
      const [an, sp] = await Promise.all([anfrage("/api/anmelden", { rumpf: { zugangscode: code } }),
        anfrage("/api/zugang-sperren", { token: t, rumpf: { code } })]);
      expect(sp.status, sp.fehler).toBe(200);
      const k = await L.kontoLesenStreng(store(), L.ablageSchluessel(code));
      /* Die Sperre gilt immer — gleich, wer zuerst war. */
      expect(k.gesperrt, `Runde ${i}`).toBe(true);
      const ps = (await L.bestandLesenStreng(store(), raum)).bestand.mandanten[0].personen;
      expect(ps.length).toBeLessThanOrEqual(1);
      /* Wurde angelegt, ist der Zugang an genau diese Person gebunden (keine verlorene Bindung). */
      if (ps.length === 1 && an.status === 200) expect(k.person).toBe(ps[0].id);
      /* Danach: keine Anmeldung mehr. */
      expect((await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).status).toBe(403);
    }
  });
});

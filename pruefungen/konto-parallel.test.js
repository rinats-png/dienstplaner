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
import { createRequire, syncBuiltinESMExports } from "node:module";

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
    person: null, betrieb: 0, mandantId: raum, demo: false, gruppe: null, hinweis: null, angelegt: "2026-11-13T08:00:00.000Z",
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
    /* Ein gleichzeitiger Faktorschritt am selben Zugang (hier nur nachgebildet: frisch gelesen, ein Feld gesetzt — den
       ECHTEN Faktorweg über faktorVermerken prüft der dritte Fall unten). */
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

  /* Delta-Review e8b9b93d, Punkt 2 (Betreiberauflage): der ECHTE Faktorweg. POST /api/anmelden mit
     zweifaktorAktion „beginnen“ und „bestaetigen“ (lib/betreiber-zweifaktor.mjs) vermerkt den Faktor am Zugang
     (faktorVermerken). Angehalten wird genau dieser Schreibvorgang — nachdem der Vermerk seinen Stand gelesen und den
     neuen Inhalt gebildet hat, bevor er unter dem Zielnamen steht (Umwicklung von rename aus node:fs/promises, wie
     pruefungen/hilfen/kill-nach-schreiben.mjs; keine Einspeisestelle im Produktionscode). In der Pause binden die
     Erstanmeldung (lib/erstleitung.mjs) und eine Sperre über den echten Handler (/api/zugang-sperren) denselben Zugang.
       Ohne Kontosperre im Faktorvermerk (Stand integration/release-v4: lesen, dann eine Kopie schreiben) laufen beide in
       der Pause durch, und die angehaltene, veraltete Kopie überschreibt danach Sperre und Bindung — rot.
       Mit kontoAendern hält der angehaltene Vermerk die Sperre des Kontos; Bindung und Sperre stehen dahinter in der
       Reihe und schreiben am frischen Stand — grün.
     Welcher Fall vorliegt, sagt die Sperre selbst (sperreGehalten im Ablauf des angehaltenen Schreibvorgangs), nicht
     eine Uhr: Gewartet wird entweder, bis beide fertig sind, oder bis beide hinter der Sperre stehen. */
  it("echter Faktorweg (faktorVermerken) gegen Bindung der Erstanmeldung und Sperre: Faktor, Sperre und Bindung bleiben", async () => {
    const { hotp, base32Dekodieren, schrittZu } = await import("../server/lib/zweifaktor.mjs");
    const R = await import("../server/lib/raumsperre.mjs");
    const raum = "pk-f";
    await L.bestandSchreiben(store(), raum, leererBetrieb(raum), { durch: "Prüfung" });
    const code = await erstcode(raum);
    const schluessel = L.ablageSchluessel(code);
    const b = await anfrage("/api/anmelden", { rumpf: { zugangscode: code, zweifaktorAktion: "beginnen" } });
    expect(b.status, b.fehler).toBe(200);
    expect(b.geheimnis).toEqual(expect.any(String));
    /* Noch nichts eingelöst: Der Faktorschritt legt keine Person an. */
    expect((await L.kontoLesenStreng(store(), schluessel)).erstleitung).toBeTruthy();

    const zielDatei = path.resolve(wurzel, "centric", L.dateiname(`konto:${schluessel}`));
    const fsp = createRequire(import.meta.url)("node:fs/promises");
    const echt = fsp.rename;
    let angekommen, weiter;
    const ankunft = new Promise((r) => { angekommen = r; });
    const freigabe = new Promise((r) => { weiter = r; });
    let angehalten = false;
    let unterKontosperre = null;
    fsp.rename = async function umwickelt(von, nach, ...rest) {
      if (!angehalten && path.resolve(String(nach)) === zielDatei
        && (await fsp.readFile(von, "utf8")).includes("\"zweiterFaktor\":true")) {
        angehalten = true;
        unterKontosperre = R.sperreGehalten(L.kontoSperre(schluessel));
        angekommen();
        await freigabe;
      }
      return echt.call(this, von, nach, ...rest);
    };
    syncBuiltinESMExports();
    try {
      const geheimnis = base32Dekodieren(b.geheimnis);
      const bestaetigt = anfrage("/api/anmelden", { rumpf: { zugangscode: code, zweifaktorAktion: "bestaetigen",
        // zeit-ok: der Einmalcode (TOTP) muss zum Zeitschritt der Uhr passen, gegen die der Server ihn prüft (zweifaktor.mjs, Fenster ±1 Schritt); ein fester Zeitpunkt wäre dort abgelaufen
        zweifaktor: hotp(geheimnis, schrittZu(Date.now())) } });
      await Promise.race([ankunft, bestaetigt.then((x) => { throw new Error(`Faktorvermerk nicht erreicht: ${x.status} ${x.fehler}`); })]);
      const offen0 = R.sperrZustand().offen;
      /* In der Pause: die Erstanmeldung bindet, der Betreiber zieht den Code zurück (echter Handler). */
      const bindung = L.erstleitungEinloesen(store(), { schluessel });
      const sperre = anfrage("/api/zugang-sperren", { token: await betreiberSitzung(), rumpf: { code } });
      if (unterKontosperre) {
        /* Beide müssen hinter der Sperre des Kontos stehen (Bindung: Raum gehalten + Konto wartend; Sperre: wartend). */
        for (let i = 0; i < 1000 && R.sperrZustand().offen < offen0 + 3; i++) await new Promise((r) => setTimeout(r, 10));
      } else await Promise.allSettled([bindung, sperre]);
      weiter();
      const [f, el, sp] = await Promise.all([bestaetigt, bindung, sperre]);
      expect(f.status, f.fehler).toBe(200);
      expect(f.aktiv).toBe(true);
      expect(f.vermerk).toBeUndefined();
      expect(sp.status, sp.fehler).toBe(200);
      const k = await L.kontoLesenStreng(store(), schluessel);
      /* Nichts verloren: Faktorvermerk, Sperre — und die Bindung passt zum Bestand. */
      expect(k.zweiterFaktor).toBe(true);
      expect(k.gesperrt).toBe(true);
      expect(k.gesperrtAm).toEqual(expect.any(String));
      const ps = (await L.bestandLesenStreng(store(), raum)).bestand.mandanten[0].personen;
      expect(ps.length).toBeLessThanOrEqual(1);
      if (el.ok) {
        expect(ps.map((p) => p.id)).toEqual([el.personId]);
        expect(k.person).toBe(el.personId);
        expect(k.erstleitung).toBeUndefined();
        expect(k.erstleitungVerbraucht).toMatchObject({ grund: "angelegt", personId: el.personId });
      } else {
        /* Die Sperre kam zuerst: nichts angelegt, nichts gebunden. */
        expect(ps).toEqual([]);
        expect(k.person ?? null).toBeNull();
      }
      /* Der zurückgezogene Code meldet sich nicht wieder an — auch nicht mit gültigem zweitem Faktor. */
      // zeit-ok: wie oben — ein gültiger Einmalcode zur Uhr des Servers (nächster Schritt); erwartet wird die Absage wegen der Sperre
      const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: code, zweifaktor: hotp(geheimnis, schrittZu(Date.now()) + 1) } });
      expect(a.status).toBe(403);
      expect(a.token).toBeUndefined();
    } finally {
      fsp.rename = echt;
      syncBuiltinESMExports();
      weiter();
    }
  });
});

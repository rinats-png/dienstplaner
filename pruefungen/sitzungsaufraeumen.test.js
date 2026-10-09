/* ==========================================================================
   AUFRÄUMEN ABGELAUFENER SITZUNGEN UND BREMSZÄHLER

   Phase A.1, TEST-FIRST (Befund F2).

   Heute räumt niemand proaktiv auf: Eine abgelaufene Sitzungsdatei verschwindet
   nur, wenn jemand sie mit genau diesem Merkmal wieder anfasst, und die
   Bremszähler wachsen, bis eine Anmeldung gelingt oder ein Zufall (2 %) alte
   Fenster wegräumt. Der tägliche Löschlauf (`testbetriebeAufraeumen`) kennt
   diese Speicher nicht.

   Verlangt wird, dass derselbe Lauf sie mit erledigt, und zwar vorsichtig:

     weg     as:/az:/t:/ta:/ab: — NUR wenn eindeutig abgelaufen (mit Karenz),
             v:-Fenster, die vorbei sind, und sperre:-Einträge, deren Ende
             verstrichen ist
     bleibt  jede gültige Sitzung, sk: (auch abgelaufen), centric-spur,
             stufe: (Eskalationsgedächtnis der Anmeldebremse — eine
             Aufbewahrungsfrist dafür ist eine eigene Sicherheitsentscheidung),
             alles Unbekannte und alles Defekte

   Gearbeitet wird gegen den echten Löschlauf mit einer echten Dateiablage.
   Die Datensätze werden direkt angelegt, damit jeder Fall genau eine Zeit
   hat; der Lauf bekommt seine Uhr als Parameter.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { aufbauen, hash, MINUTE } from "./hilfen/szenario.mjs";
import { tor } from "./hilfen/schreibtor.mjs";

vi.mock("../server/lib/ablage.mjs", async (orig) => {
  const echt = await orig();
  const { umhuellen } = await import("./hilfen/schreibtor.mjs");
  return { ...echt, getStore: (a) => umhuellen(echt.getStore(a),
    typeof a === "string" ? a : a.name) };
});

let Z, JETZT, ergebnis, vermerk2;
const LIMIT = 60000;
const STUNDE = 60 * MINUTE;
const TAG = 24 * STUNDE;

/* Die Fälle: Name -> Schlüssel. Jeder Fall bekommt einen eigenen Datensatz. */
const F = {};

const sek = (ms) => Math.floor(ms / 1000);
const h = (was) => hash(`gc-${was}`);

/** Ein Datensatz in einen Store, an der Bremse vorbei. */
const setze = (store, schluessel, wert) => store.setJSON(schluessel, wert);
const lies = (store, schluessel) => store.get(schluessel, { type: "json" }).catch(() => "FEHLER");

beforeAll(async () => {
  Z = await aufbauen("aufraeumen");
  JETZT = Date.now();
  const arbeit = Z.ablageArbeit(), konto = Z.ablageKonto(), takt = Z.ablageTakt();
  const spur = Z.ablageSpur();

  /* ---- as: / az: --------------------------------------------------------- */
  const as = (was, { bis, zuletzt, seit = JETZT - 10 * STUNDE }) =>
    setze(konto, `as:${h(was)}`, { art: "konto", accountId: `a_${was}`, epoche: 2, seit, zuletzt, bis });
  const az = (was, zuletzt) => setze(konto, `az:${h(was)}`, { zuletzt });
  F.asAbgelaufen = `as:${h("as-abgelaufen")}`;
  await as("as-abgelaufen", { bis: JETZT - 5 * STUNDE, zuletzt: JETZT - 6 * STUNDE });
  await az("as-abgelaufen", JETZT - 6 * STUNDE);
  F.azZuAbgelaufen = `az:${h("as-abgelaufen")}`;

  F.asUntaetig = `as:${h("as-untaetig")}`;               // Frist läuft noch, aber seit Stunden nichts mehr
  await as("as-untaetig", { bis: JETZT + 6 * STUNDE, zuletzt: JETZT - 3 * STUNDE });

  F.asGueltig = `as:${h("as-gueltig")}`;
  await as("as-gueltig", { bis: JETZT + 6 * STUNDE, zuletzt: JETZT - 1 * MINUTE });
  await az("as-gueltig", JETZT - 1 * MINUTE);
  F.azGueltig = `az:${h("as-gueltig")}`;

  F.asAktivitaetHaeltAm = `as:${h("as-az-aktiv")}`;      // alter Datensatz, aber frische Aktivität
  await as("as-az-aktiv", { bis: JETZT + 6 * STUNDE, zuletzt: JETZT - 3 * STUNDE });
  await az("as-az-aktiv", JETZT - 2 * MINUTE);
  F.azAktiv = `az:${h("as-az-aktiv")}`;

  F.azWaise = `az:${h("az-waise")}`;                      // Aktivität ohne Autorität
  await az("az-waise", JETZT - 1 * MINUTE);

  /* ---- t: / ta: ---------------------------------------------------------- */
  const t = (was, felder) => setze(arbeit, `t:${h(was)}`,
    { bestand: "t-gc", rolle: "leitung", person: "p_1", betrieb: 0, seit: JETZT - 10 * STUNDE, ...felder });
  const ta = (was, zuletzt) => setze(arbeit, `ta:${h(was)}`, { zuletzt });

  F.tAbgelaufen = `t:${h("t-abgelaufen")}`;
  await t("t-abgelaufen", { bis: JETZT - 5 * STUNDE, zuletzt: JETZT - 6 * STUNDE });
  await ta("t-abgelaufen", JETZT - 6 * STUNDE);
  F.taZuAbgelaufen = `ta:${h("t-abgelaufen")}`;

  F.tUntaetig = `t:${h("t-untaetig")}`;
  await t("t-untaetig", { bis: JETZT + 6 * STUNDE, zuletzt: JETZT - 3 * STUNDE });

  F.tGueltig = `t:${h("t-gueltig")}`;
  await t("t-gueltig", { bis: JETZT + 6 * STUNDE, zuletzt: JETZT - 1 * MINUTE });
  await ta("t-gueltig", JETZT - 1 * MINUTE);
  F.taGueltig = `ta:${h("t-gueltig")}`;

  F.tAktivitaetHaeltAm = `t:${h("t-ta-aktiv")}`;
  await t("t-ta-aktiv", { bis: JETZT + 6 * STUNDE, zuletzt: JETZT - 3 * STUNDE });
  await ta("t-ta-aktiv", JETZT - 2 * MINUTE);
  F.taAktiv = `ta:${h("t-ta-aktiv")}`;

  F.taWaise = `ta:${h("ta-waise")}`;
  await ta("ta-waise", JETZT - 1 * MINUTE);

  F.tOhneFrist = `t:${h("t-ohne-frist")}`;               // unklar: nicht löschen
  await setze(arbeit, F.tOhneFrist, { bestand: "t-gc", rolle: "leitung" });

  /* gebundene Arbeitssitzungen: der Anker nennt die Konto-Sitzung */
  const gebunden = (was, asWas, felder = {}) => t(was, {
    bis: JETZT + 6 * STUNDE, zuletzt: JETZT - 1 * MINUTE,
    herkunft: { art: "account", accountId: `a_${asWas}`, epoche: 2, generation: 1, sitzung: h(asWas) },
    ...felder });
  F.tGebundenMitKonto = `t:${h("t-gebunden-ok")}`;
  await gebunden("t-gebunden-ok", "as-gueltig");
  F.tGebundenOhneKonto = `t:${h("t-gebunden-weg")}`;     // die Konto-Sitzung existiert nicht (sicher)
  await gebunden("t-gebunden-weg", "gibt-es-nicht");

  /* ---- ab: --------------------------------------------------------------- */
  F.abGueltig = `ab:${h("as-gueltig")}:${h("t-gebunden-ok")}`;
  await setze(konto, F.abGueltig, { seit: JETZT - MINUTE, bis: JETZT + 6 * STUNDE });
  F.abOhneKonto = `ab:${h("gibt-es-nicht")}:${h("t-gebunden-weg")}`;
  await setze(konto, F.abOhneKonto, { seit: JETZT - MINUTE, bis: JETZT + 6 * STUNDE });
  F.abAbgelaufen = `ab:${h("as-gueltig")}:${h("t-abgelaufen")}`;
  await setze(konto, F.abAbgelaufen, { seit: JETZT - 10 * STUNDE, bis: JETZT - 5 * STUNDE });

  /* ---- sk:, Spur --------------------------------------------------------- */
  F.skAbgelaufen = `sk:${h("sk-abgelaufen")}`;
  await setze(arbeit, F.skAbgelaufen, { bestand: "t-gc", rolle: "leitung", bis: JETZT - 400 * TAG });
  F.skGueltig = `sk:${h("sk-gueltig")}`;
  await setze(arbeit, F.skGueltig, { bestand: "t-gc", rolle: "leitung", bis: JETZT + 300 * TAG });
  F.spur = "2020-01-01/anmelden/gc-spur";
  await setze(spur, F.spur, { art: "anmelden", ausgang: "erfolg", zeit: "2020-01-01T00:00:00.000Z" });

  /* ---- Bremszähler ------------------------------------------------------- */
  const fenster = (sekunden) => Math.floor(sek(JETZT) / sekunden);
  const f300 = fenster(300), f3600 = fenster(3600);
  F.vAlt = `v:anmelden-konto:a:gc1:${f300 - 10}:m1`;
  F.vAltStunde = `v:starten:a:gc2:${f3600 - 5}:m1`;
  F.vAltZiel = `v:anmelden-konto:ziel:gc3:${f300 - 10}:m1`;
  F.vAltGesamt = `v:anmelden-konto:gesamt:${f300 - 10}:m1`;
  F.vJetzt = `v:anmelden-konto:a:gc1:${f300}:m2`;
  F.vVorher = `v:anmelden-konto:a:gc1:${f300 - 1}:m3`;
  F.vUnbekannt = "v:unbekannte-art:a:gc4:1:m1";
  F.vKaputt = "v:kaputt";
  for (const k of [F.vAlt, F.vAltStunde, F.vAltZiel, F.vAltGesamt, F.vJetzt, F.vVorher,
    F.vUnbekannt, F.vKaputt]) await setze(takt, k, 1);
  F.sperreAbgelaufen = "sperre:anmelden-konto:a:gc5";
  await setze(takt, F.sperreAbgelaufen, { bis: sek(JETZT) - 7200, seit: sek(JETZT) - 8000, stufe: 0 });
  F.sperreAktiv = "sperre:anmelden-konto:a:gc6";
  await setze(takt, F.sperreAktiv, { bis: sek(JETZT) + 600, seit: sek(JETZT) - 100, stufe: 0 });
  F.sperreSeltsam = "sperre:anmelden-konto:a:gc7";       // kein erkennbares Ende: nicht löschen
  await setze(takt, F.sperreSeltsam, { irgendwas: true });
  F.stufeAlt = "stufe:anmelden-konto:a:gc5";
  await setze(takt, F.stufeAlt, { n: 5, zuletzt: sek(JETZT) - 90 * 86400 });
  F.stufeNeu = "stufe:anmelden-konto:a:gc6";
  await setze(takt, F.stufeNeu, { n: 1, zuletzt: sek(JETZT) - 60 });

  /* ---- defekt: Dateien, die sich nicht lesen lassen ---------------------- */
  const roh = async (store, dateiname, inhalt) => {
    const dir = path.join(Z.wurzel, store);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, dateiname), inhalt);
  };
  F.tDefekt = "t:defekt";
  await roh("centric-sitzungen", "t%3Adefekt.json", "{ das ist kein json");
  F.asDefekt = "as:defekt";
  await roh("centric-accountsitzungen", "as%3Adefekt.json", "{ das ist kein json");
  /* Aktivität zu einer Autorität, die sich nicht lesen lässt: „nicht lesbar"
     ist nicht „nicht da" - sie bleibt liegen. */
  F.azZuDefekterAutoritaet = "az:defekt";
  await setze(konto, F.azZuDefekterAutoritaet, { zuletzt: JETZT - 6 * STUNDE });
  F.taZuDefekterAutoritaet = "ta:defekt";
  await setze(arbeit, F.taZuDefekterAutoritaet, { zuletzt: JETZT - 6 * STUNDE });
  F.vDefektDatei = "v:anmelden-konto:a:gcd:1:defekt"; // altes Fenster, aber Datei kaputt: bleibt nicht zwingend
  F.tSeltsam = "t:seltsam";                           // gültiges JSON, falsche Form
  await setze(arbeit, F.tSeltsam, ["kein", "objekt"]);

  /* ---- Fehler bei einer Datei: delete wirft für genau einen Schlüssel ---- */
  F.tFehlerBeimLoeschen = `t:${h("t-fehler")}`;
  await t("t-fehler", { bis: JETZT - 5 * STUNDE, zuletzt: JETZT - 6 * STUNDE });
  F.tNachDemFehler = `t:${h("t-fehler-danach")}`;
  await t("t-fehler-danach", { bis: JETZT - 5 * STUNDE, zuletzt: JETZT - 6 * STUNDE });
  tor.fehlerBei({ store: "centric-sitzungen", praefixe: [F.tFehlerBeimLoeschen], op: "delete" });

  /* ---- der Lauf: eine Stunde nach den Sitzungen, +25 h später für den zweiten */
  ergebnis = await Z.AUF.testbetriebeAufraeumen(Z.laden(), Z.ablageArbeit(), { jetzt: JETZT });
  /* idempotent: ein zweiter Lauf hinterher ändert nichts mehr */
  vermerk2 = await Z.AUF.testbetriebeAufraeumen(Z.laden(), Z.ablageArbeit(), { jetzt: JETZT + 1000 });
}, LIMIT);

afterAll(async () => { tor.zuruecksetzen(); await Z.abbauen(); });

const da = async (store, schluessel) => (await lies(store, schluessel)) !== null;

/* ==========================================================================
   WAS WEGMUSS
   ========================================================================== */

describe("F2: eindeutig Abgelaufenes wird entfernt", () => {
  it("as: mit abgelaufener Frist", async () => {
    expect(await da(Z.ablageKonto(), F.asAbgelaufen)).toBe(false);
  }, LIMIT);
  it("as: seit Stunden untätig, ohne frische Aktivität", async () => {
    expect(await da(Z.ablageKonto(), F.asUntaetig)).toBe(false);
  }, LIMIT);
  it("az: zu einer abgelaufenen Sitzung", async () => {
    expect(await da(Z.ablageKonto(), F.azZuAbgelaufen)).toBe(false);
  }, LIMIT);
  it("az: ohne Autorität (Waise)", async () => {
    expect(await da(Z.ablageKonto(), F.azWaise)).toBe(false);
  }, LIMIT);
  it("t: mit abgelaufener Frist", async () => {
    expect(await da(Z.ablageArbeit(), F.tAbgelaufen)).toBe(false);
  }, LIMIT);
  it("t: seit Stunden untätig, ohne frische Aktivität", async () => {
    expect(await da(Z.ablageArbeit(), F.tUntaetig)).toBe(false);
  }, LIMIT);
  it("ta: zu einer abgelaufenen Sitzung", async () => {
    expect(await da(Z.ablageArbeit(), F.taZuAbgelaufen)).toBe(false);
  }, LIMIT);
  it("ta: ohne Autorität (Waise)", async () => {
    expect(await da(Z.ablageArbeit(), F.taWaise)).toBe(false);
  }, LIMIT);
  it("gebundenes t:, dessen Konto-Sitzung sicher nicht existiert", async () => {
    expect(await da(Z.ablageArbeit(), F.tGebundenOhneKonto)).toBe(false);
  }, LIMIT);
  it("ab: ohne Konto-Sitzung", async () => {
    expect(await da(Z.ablageKonto(), F.abOhneKonto)).toBe(false);
  }, LIMIT);
  it("ab: mit abgelaufener Frist", async () => {
    expect(await da(Z.ablageKonto(), F.abAbgelaufen)).toBe(false);
  }, LIMIT);
  it("v:-Fenster, die vorbei sind (fünf Minuten, eine Stunde, Ziel, Gesamt)", async () => {
    for (const k of [F.vAlt, F.vAltStunde, F.vAltZiel, F.vAltGesamt]) {
      expect.soft(await da(Z.ablageTakt(), k), k).toBe(false);
    }
  }, LIMIT);
  it("sperre: mit verstrichenem Ende", async () => {
    expect(await da(Z.ablageTakt(), F.sperreAbgelaufen)).toBe(false);
  }, LIMIT);
  it("ein Fehler bei einer Datei stoppt den Lauf nicht", async () => {
    expect(ergebnis, "der Lauf liefert einen Vermerk").toBeTruthy();
    expect.soft(await da(Z.ablageArbeit(), F.tNachDemFehler),
      "die Datei NACH der fehlerhaften wird trotzdem entfernt").toBe(false);
    expect.soft(await da(Z.ablageArbeit(), F.tFehlerBeimLoeschen),
      "die fehlerhafte Datei bleibt liegen (nächster Lauf)").toBe(true);
    expect.soft(await da(Z.ablageArbeit(), F.tAbgelaufen),
      "andere abgelaufene Dateien sind trotzdem weg").toBe(false);
  }, LIMIT);
});

/* ==========================================================================
   WAS BLEIBEN MUSS
   ========================================================================== */

describe("Gültiges und Fremdes bleibt", () => {
  it("gültige as: und ihr az:", async () => {
    expect(await da(Z.ablageKonto(), F.asGueltig)).toBe(true);
    expect(await da(Z.ablageKonto(), F.azGueltig)).toBe(true);
  }, LIMIT);
  it("as: mit alter Eintragszeit, aber frischer Aktivität (az:)", async () => {
    expect(await da(Z.ablageKonto(), F.asAktivitaetHaeltAm)).toBe(true);
    expect(await da(Z.ablageKonto(), F.azAktiv)).toBe(true);
  }, LIMIT);
  it("gültige t: und ihr ta:", async () => {
    expect(await da(Z.ablageArbeit(), F.tGueltig)).toBe(true);
    expect(await da(Z.ablageArbeit(), F.taGueltig)).toBe(true);
  }, LIMIT);
  it("t: mit alter Eintragszeit, aber frischer Aktivität (ta:)", async () => {
    expect(await da(Z.ablageArbeit(), F.tAktivitaetHaeltAm)).toBe(true);
    expect(await da(Z.ablageArbeit(), F.taAktiv)).toBe(true);
  }, LIMIT);
  it("gebundenes t: mit lebender Konto-Sitzung, samt ab:", async () => {
    expect(await da(Z.ablageArbeit(), F.tGebundenMitKonto)).toBe(true);
    expect(await da(Z.ablageKonto(), F.abGueltig)).toBe(true);
  }, LIMIT);
  it("sk: bleibt, auch abgelaufen", async () => {
    expect(await da(Z.ablageArbeit(), F.skAbgelaufen)).toBe(true);
    expect(await da(Z.ablageArbeit(), F.skGueltig)).toBe(true);
  }, LIMIT);
  it("centric-spur bleibt", async () => {
    expect(await da(Z.ablageSpur(), F.spur)).toBe(true);
  }, LIMIT);
  it("stufe: bleibt unangetastet, auch nach 90 Tagen", async () => {
    expect(await da(Z.ablageTakt(), F.stufeAlt)).toBe(true);
    expect(await da(Z.ablageTakt(), F.stufeNeu)).toBe(true);
    expect((await lies(Z.ablageTakt(), F.stufeAlt)).n).toBe(5);
  }, LIMIT);
  it("das laufende und das vorige Zählfenster bleiben", async () => {
    expect(await da(Z.ablageTakt(), F.vJetzt)).toBe(true);
    expect(await da(Z.ablageTakt(), F.vVorher)).toBe(true);
  }, LIMIT);
  it("eine noch gültige sperre: bleibt", async () => {
    expect(await da(Z.ablageTakt(), F.sperreAktiv)).toBe(true);
  }, LIMIT);
});

describe("Unbekanntes und Defektes wird nicht gelöscht", () => {
  it("t: ohne erkennbare Frist", async () => {
    expect(await da(Z.ablageArbeit(), F.tOhneFrist)).toBe(true);
  }, LIMIT);
  it("t: und as: mit unlesbarer Datei", async () => {
    const dateien = async (store, name) => {
      const { readdir } = await import("node:fs/promises");
      return (await readdir(path.join(Z.wurzel, store))).includes(name);
    };
    expect(await dateien("centric-sitzungen", "t%3Adefekt.json")).toBe(true);
    expect(await dateien("centric-accountsitzungen", "as%3Adefekt.json")).toBe(true);
  }, LIMIT);
  it("Aktivität (az:/ta:), deren Autorität sich nicht lesen lässt", async () => {
    expect(await da(Z.ablageKonto(), F.azZuDefekterAutoritaet)).toBe(true);
    expect(await da(Z.ablageArbeit(), F.taZuDefekterAutoritaet)).toBe(true);
  }, LIMIT);
  it("t: mit falscher Form", async () => {
    expect(await da(Z.ablageArbeit(), F.tSeltsam)).toBe(true);
  }, LIMIT);
  it("v: mit unbekannter Art oder unlesbarer Form", async () => {
    expect(await da(Z.ablageTakt(), F.vUnbekannt)).toBe(true);
    expect(await da(Z.ablageTakt(), F.vKaputt)).toBe(true);
  }, LIMIT);
  it("sperre: ohne erkennbares Ende", async () => {
    expect(await da(Z.ablageTakt(), F.sperreSeltsam)).toBe(true);
  }, LIMIT);
});

describe("Der Lauf selbst", () => {
  it("ist idempotent: ein zweiter Lauf wirft nicht und ändert nichts Gültiges", async () => {
    expect(vermerk2).toBeTruthy();
    expect(await da(Z.ablageKonto(), F.asGueltig)).toBe(true);
    expect(await da(Z.ablageArbeit(), F.tGueltig)).toBe(true);
    expect(await da(Z.ablageArbeit(), F.skAbgelaufen)).toBe(true);
  }, LIMIT);

  it("berührt keine Testbetriebe-Daten (kern:, konto:) und keine Mitgliedschaften", async () => {
    /* Eine Mitgliedschaft samt Konto, die der Lauf nicht anfassen darf. */
    const k = await Z.kontoAnlegen(`gc-${Date.now()}@example.org`);
    const raum = Z.raum("gc-bleibt");
    await Z.betriebAnlegen(raum);
    await Z.mitgliedAnlegen(k.id, raum, "leitung");
    await Z.AUF.testbetriebeAufraeumen(Z.laden(), Z.ablageArbeit(), { jetzt: JETZT + 400 * TAG });
    expect(await Z.A.accountLesenPerId(Z.laden(), k.id)).toBeTruthy();
    expect(await Z.A.mitgliedschaftLesen(Z.laden(), k.id, raum)).toBeTruthy();
  }, LIMIT);
});

describe("Der Bericht des Aufräumers", () => {
  it("nennt, was gelöscht und was bewusst liegen gelassen wurde (Vermerk des Löschlaufs)", () => {
    const b = ergebnis.sitzungen;
    expect(b, "der Vermerk trägt den Bericht").toBeTruthy();
    expect(b.geloescht.as, "as:").toBeGreaterThanOrEqual(2);
    expect(b.geloescht.t, "t:").toBeGreaterThanOrEqual(4);
    expect(b.geloescht.v, "v:").toBeGreaterThanOrEqual(4);
    expect(b.geloescht.sperre, "sperre:").toBe(1);
    expect(b.uebersprungen.unlesbar, "unlesbare Dateien (t: und as:)").toBeGreaterThanOrEqual(2);
    expect(b.uebersprungen.unklar, "Dateien mit unklarer Form").toBeGreaterThanOrEqual(2);
    expect(b.uebersprungen.unbekannt, "Zähler unbekannter Art").toBeGreaterThanOrEqual(2);
    expect(b.fehler, "der eine Löschfehler (Absicht)").toBe(1);
    /* Keine Schlüssel, keine Prüfsummen im Bericht. */
    expect(JSON.stringify(b)).not.toMatch(/[0-9a-f]{32}/);
  });

  it("begrenzt sich selbst: nach der Höchstzahl hört er auf, der nächste Lauf macht weiter", async () => {
    const { sitzungenAufraeumen } = await import("../server/lib/sitzungsaufraeumen.mjs");
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const id = hash(`gc-grenze-${i}`);
      ids.push(id);
      await setze(Z.ablageKonto(), `as:${id}`, { art: "konto", accountId: "a_grenze", epoche: 2,
        seit: JETZT - 10 * STUNDE, zuletzt: JETZT - 6 * STUNDE, bis: JETZT - 5 * STUNDE });
    }
    const nochDa = async () => {
      let n = 0;
      for (const id of ids) if (await da(Z.ablageKonto(), `as:${id}`)) n++;
      return n;
    };
    expect(await nochDa()).toBe(6);

    const erst = await sitzungenAufraeumen({ jetzt: JETZT, maxLoeschungen: 2 });
    expect(erst.abgebrochen).toBe(true);
    expect(erst.geloescht.as).toBe(2);
    expect(await nochDa()).toBe(4);

    const zweit = await sitzungenAufraeumen({ jetzt: JETZT });
    expect(zweit.abgebrochen).toBe(false);
    expect(await nochDa()).toBe(0);
  }, LIMIT);

  it("die Karenz schützt: knapp abgelaufen heißt noch nicht löschen", async () => {
    const { sitzungenAufraeumen, KARENZ } = await import("../server/lib/sitzungsaufraeumen.mjs");
    const knapp = `as:${hash("gc-karenz-knapp")}`;
    const lange = `as:${hash("gc-karenz-lange")}`;
    /* Zuletzt vor zwei Minuten aktiv: Nur die absolute Frist entscheidet hier. */
    const rumpf = { art: "konto", accountId: "a_karenz", epoche: 2, seit: JETZT - 20 * STUNDE,
      zuletzt: JETZT - 2 * MINUTE };
    await setze(Z.ablageKonto(), knapp, { ...rumpf, bis: JETZT - KARENZ + 60 * 1000 });
    await setze(Z.ablageKonto(), lange, { ...rumpf, bis: JETZT - KARENZ - 60 * 1000 });
    await sitzungenAufraeumen({ jetzt: JETZT });
    expect(await da(Z.ablageKonto(), knapp), "seit weniger als der Karenz abgelaufen").toBe(true);
    expect(await da(Z.ablageKonto(), lange), "länger als die Karenz abgelaufen").toBe(false);
  }, LIMIT);
});

/* Lokale E2E-Abnahme Hauptfunktionen (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-20.md) — Teil 2: Zeiterfassung mit Pause,
   Zuschläge, Abrechnungsexport.

   Gegen den echten Server aus e2e/global-setup.mjs (127.0.0.1, Wegwerfdaten, feste Abnahmeuhr aus e2e/zeitbasis.mjs,
   Abnahmetag Samstag 2026-11-14, 10:00 Berlin). EIGENER leerer Betrieb über die API; der Demo-Betrieb bleibt unberührt.
   Nur erfundene Namen (Marke ZeitE2e), Codes nie ausgegeben, kein Schalter eingeschaltet.

     Z0  Einrichtung: Leitung meldet sich erstmals im Browser an; zwei Beschäftigte über die API. a1 hat heute einen
         Frühdienst (F, 06:00–14:00, 30 min Pause) und am Sonntag 2026-11-15 einen weiteren; a2 hat am Dienstag 2026-11-10
         einen Frühdienst (Gegenprobe ohne Sonntag).
     Z1  Stempeln im Browser (a1): Einstempeln → Beginn auf dem Server; Ausstempeln mit ungültiger Pause (999 min) → der
         Stempel bleibt (Ende gesetzt), ohne Pause, gekennzeichnet PAUSE_UNGUELTIG; die Ist-Zeit ist ein Prüffall
         (bestätigt: false) — der Test dauert Minuten, nie die geplanten 7,5 h. Die Leitung sieht die Kennzeichnung unter
         „Stempelbefunde“.
     Z2  Pause in der Ist-Zeit (Server, Vollschreibweg der Leitung): leere Pause, über 180 min, länger als die Anwesenheit →
         422 PAUSE_UNGUELTIG, nichts gespeichert; gültige Pause 60 min → 200. Die Oberfläche selbst schreibt keine Pause
         in diesen Weg (sie geht über /api/stempeln bzw. die Korrektur), darum hier über die API.
     Z3  Zuschläge im Browser (Leitung): a1 trägt die Sonntagsstunden des geplanten Sonntags (8,0 — Anwesenheit ohne Pausenabzug, Beobachtung B-Z3), a2 nicht; a2 hat 7,0 h
         gearbeitet (gültige Pause aus Z2 statt Planzeit 7,5).
     Z4  Export im Browser (Leitung): Mit offenem Prüffall fragt „Export“ nach; abgebrochen → kein Download; bestätigt →
         CSV-Datei heruntergeladen und gelesen (Kopf, Zeilen a1/a2, Sonntag 8,0). „Blatt zum Gegenlesen“ nennt den Prüffall —
         unvollständige Ist-Zeiten erscheinen nie als bestätigt abrechnungsfähig.
   Nur Projekt 1024x768 (schreibt Daten). zeit-ok: kein eigener Uhrbezug — Tage relativ zum festen Abnahmetag (abnahmeHeute),
   Laufkennung nur als eindeutiger Raumname. */
import { readFile } from "node:fs/promises";
import { test, expect, geheZu, schreibvorgaengeVerfolgen } from "./hilfen.mjs";
import { BASIS, BETREIBER_VAR } from "./umgebung.mjs";
import { abnahmeHeute, versatzMs } from "./zeitbasis.mjs";

const PROJEKT = "1024x768";
const MK = "ZeitE2e";
const heute = abnahmeHeute();
const YM = heute.slice(0, 7);
const SONNTAG = "2026-11-15", VERGANGEN = "2026-11-10";

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(BASIS + pfad, { method: methode, headers: { "content-type": "application/json",
    "x-forwarded-for": `10.73.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: methode === "GET" ? undefined : JSON.stringify(rumpf || {}) });
  return { status: a.status, ...(await a.json().catch(() => ({}))) };
}
const anmeldenApi = async (code) => (await api("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } })).token;
const mandant = async (token) => (await api("/api/bestand", { token })).bestand.mandanten[0];
/** PUT mit einer Änderung; gibt die Antwort zurück (ohne zu werfen), damit Abweisungen geprüft werden können. */
async function schreibenRoh(token, aendern) {
  const g = await api("/api/bestand", { token });
  const b = JSON.parse(JSON.stringify(g.bestand));
  aendern(b.mandanten[0]);
  return api("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag } });
}
async function schreiben(token, aendern) {
  const a = await schreibenRoh(token, aendern);
  if (a.status !== 200) throw new Error(`Speichern ${a.status}: ${a.text || a.fehler}`);
}
async function anmeldenBrowser(page, code) {
  await page.goto("/", { waitUntil: "load" });
  if (await page.evaluate(() => !!(sessionStorage.getItem("centric:token") || localStorage.getItem("centric:token")))) {
    await page.evaluate(() => { sessionStorage.removeItem("centric:token"); localStorage.removeItem("centric:token"); localStorage.removeItem("centric:gemerkt"); });
    await page.goto("/", { waitUntil: "load" });
  }
  await page.locator("input").first().fill(code, { timeout: 30000 });
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  for (const zu of ['[aria-label="Tour schließen"]', 'button:has-text("Später")', 'button:has-text("Tour überspringen")']) {
    const t = page.locator(zu).first();
    if (await t.count()) await t.click().catch(() => {});
  }
}
async function seiteZu(page, verfolgung) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.goto("about:blank");
  await verfolgung.abgeschlossen();
}
const person = (id, nach, einheit, vor) => ({ id, vorname: vor, nachname: nach, rolle: "mitarbeiter", bereich: einheit,
  status: "aktiv", geburtstag: "1988-03-03", qualifikationen: [], eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
/** Rückfragen (window.confirm) selbst beantworten; das Fixture nimmt sonst jede an. */
function rueckfragenSteuern(page) {
  const gesehen = [];
  let abbrechen = false;
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => { gesehen.push({ typ: d.type(), text: d.message() });
    if (abbrechen) d.dismiss().catch(() => {}); else d.accept().catch(() => {}); });
  return { gesehen, abbrechen: (j) => { abbrechen = j; } };
}
const reiter = (page, name) => page.getByRole("radio", { name }).or(page.getByRole("tab", { name }))
  .or(page.getByRole("button", { name, exact: true })).first();

const C = {};
test.describe.serial("Lokale E2E-Abnahme Hauptfunktionen 2: Stempeln mit Pause, Zuschläge, Export", () => {
  /* Server und Stempeluhr rechnen den Tag in Europe/Berlin (QS-6, wie abnahme-b-ablaeufe). */
  test.use({ timezoneId: "Europe/Berlin" });

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== PROJEKT) return;
    const bcode = process.env[BETREIBER_VAR];
    if (!bcode) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
    const bt = await anmeldenApi(bcode);
    const raum = `haupt-e2e-z-${Date.now().toString(36)}`;     // zeit-ok: nur eindeutiger Raumname je Lauf
    const a = await api("/api/bestand-anlegen", { methode: "POST", token: bt, rumpf: { bestand: raum, vorlage: "leer", name: `Haus ${MK}` } });
    if (a.status !== 200) throw new Error(`Betrieb ${a.status}`);
    const z = await api("/api/zugaenge", { methode: "POST", token: bt, rumpf: { bestand: raum, eintraege: [{ rolle: "leitung", personId: null }] } });
    if (z.status !== 200) throw new Error(`Zugang ${z.status}`);
    C.l = z.zugaenge[0].code;
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "Ablauf einmal je Lauf (schreibt Daten)");
    /* Kalendertage (Monat, Sonntag, Folgetage) hängen am festen Abnahmetag; gegen einen fremden Container (Staging-Gate,
       echte Uhr, Versatz 0) wäre das nicht deterministisch. */
    test.skip(!versatzMs(), "braucht die feste Abnahmeuhr des eigenen Testservers");
  });

  test("Z0 Einrichtung: Leitung im Browser; Beschäftigte und Dienste über die API", async ({ page }) => {
    expect(heute, "fester Abnahmetag (e2e/zeitbasis.mjs)").toBe("2026-11-14");
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    C.lT = await anmeldenApi(C.l);
    await expect.poll(async () => ((await mandant(C.lT)).personen || []).filter((p) => p.rolle === "leitung").length,
      { timeout: 20000 }).toBe(1);
    await seiteZu(page, v);
    const m0 = await mandant(C.lT);
    const f = (m0.dienstarten || []).find((d) => d.id === "F");
    expect([f && f.start, f && f.ende, f && f.pause], "Frühdienst der Vorlage „leer“").toEqual(["06:00", "14:00", 30]);
    const e = m0.einheiten[0].id;
    await schreiben(C.lT, (m) => {
      m.personen = [...m.personen, person("a1", `Stempel-${MK}`, e, "Ada"), person("a2", `Gegen-${MK}`, e, "Gea")];
      m.abweichungen = { ...(m.abweichungen || {}), [`a1|${heute}`]: "F", [`a1|${SONNTAG}`]: "F", [`a2|${VERGANGEN}`]: "F" };
    });
    const ein = await api("/api/einladung", { methode: "POST", token: C.lT, rumpf: { personId: "a1", bestaetigung: { zugangscode: C.l } } });
    if (ein.status !== 200) throw new Error(`Einladung ${ein.status}`);
    C.a1 = (await api("/api/einladung/annehmen", { methode: "POST", rumpf: { einladung: ein.einladung } })).zugangscode;
    if (!C.a1) throw new Error("Einladung nicht angenommen");
  });

  test("Z1 Stempeln: Ein- und Ausstempeln, ungültige Pause kostet nie den Stempel, Ist-Zeit bleibt Prüffall", async ({ page }) => {
    const k = `a1|${heute}`;
    const stempel = async () => ((await mandant(C.lT)).einstempeln || {})[k];
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.a1);
    expect(await page.evaluate(() => new Date().toLocaleDateString("sv-SE")), "Tag des Browsers = Abnahmetag").toBe(heute);
    const ein = page.getByRole("button", { name: "Einstempeln", exact: true }).first();
    await expect(ein, "Stempeluhr (Frühdienst heute)").toBeVisible({ timeout: 20000 });
    expect(await stempel(), "vorher kein Stempel").toBeUndefined();
    await ein.click();
    await expect.poll(async () => { const s = await stempel(); return !!s && /^\d\d:\d\d$/.test(s.start) && !s.ende; }, { timeout: 20000 }).toBe(true);
    const pause = page.getByLabel("Pause in Minuten");
    await expect(pause, "Pause vorbelegt mit der Pause der Dienstart").toHaveValue("30");
    await pause.fill("999");
    await page.getByRole("button", { name: "Ausstempeln", exact: true }).first().click();
    await expect.poll(async () => !!((await stempel()) || {}).ende, { timeout: 20000 }).toBe(true);
    await expect(page.getByText("Dienst erfasst").first()).toBeVisible({ timeout: 15000 });
    const s = await stempel();
    expect(s.markierungen, "ungültige Pause gekennzeichnet").toContain("PAUSE_UNGUELTIG");
    expect(s.pause, "ohne Pause gespeichert").toBeUndefined();
    const ist = ((await mandant(C.lT)).erfassung || {})[k];
    expect(ist.pause, "Ist-Zeit ohne die ungültige Pause").toBeUndefined();
    /* Minuten statt 7,5 h: nie still bestätigt (Dauer 0 oder Pause der Dienstart ≥ Anwesenheit) */
    expect(ist.bestaetigt).toBe(false);
    expect(ist.grund).toMatch(/^(DAUER_NULL|PAUSE_ZU_LANG):/);
    C.istGrund = ist.grund.split(":")[0];
    await seiteZu(page, v);
    /* Die Leitung sieht die Kennzeichnung bei den Stempelbefunden */
    const v2 = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    await geheZu(page, "Abrechnungsdaten");
    await reiter(page, "Stempelbefunde").click();
    await expect(page.getByText("Pausenangabe ungültig — ohne Pause gespeichert").first()).toBeVisible({ timeout: 15000 });
    await seiteZu(page, v2);
  });

  test("Z2 Pause der Ist-Zeit über den Vollschreibweg: leer, über 180 und länger als die Anwesenheit → 422 PAUSE_UNGUELTIG, gültig → 200", async () => {
    const k = `a2|${VERGANGEN}`;
    const mit = (pause, ende = "14:00") => (m) => { m.erfassung = { ...(m.erfassung || {}), [k]: { start: "06:00", ende, bestaetigt: true, grund: "", pause } }; };
    for (const [pause, ende, grund] of [["", "14:00", /in ganzen Minuten/], [240, "14:00", /in ganzen Minuten/], [90, "07:00", /kürzer sein als die Anwesenheit/]]) {
      const a = await schreibenRoh(C.lT, mit(pause, ende));
      expect([a.status, a.code], `Pause ${JSON.stringify(pause)}`).toEqual([422, "PAUSE_UNGUELTIG"]);
      expect(String(a.text || a.grund || a.fehler || "")).toMatch(grund);
      expect(((await mandant(C.lT)).erfassung || {})[k], "nichts gespeichert").toBeUndefined();
    }
    const ok = await schreibenRoh(C.lT, mit(60));
    expect(ok.status, ok.text).toBe(200);
    expect(((await mandant(C.lT)).erfassung || {})[k]).toMatchObject({ start: "06:00", ende: "14:00", bestaetigt: true, pause: 60 });
  });

  test("Z3 Zuschläge sichtbar: Sonntagsstunden aus dem Plan, Gegenprobe ohne Sonntag, Pause wirkt auf „Gearbeitet“", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    await geheZu(page, "Abrechnungsdaten");
    await reiter(page, "Zuschläge").click();
    const zeile = (n) => page.getByRole("row").filter({ hasText: n });
    const zelle = (n, kopf) => zeile(n).locator(`td[data-label="${kopf}"]`);
    await expect(zeile(`Stempel-${MK}, Ada`)).toHaveCount(1);
    /* Beobachtung B-Z3 (fachlich zu klären, nicht geändert): Die Zuschlagsstunden zählen die Anwesenheit 06:00–14:00
       (8,0), ohne die 30 min Pause der Dienstart (server/lib/isteinfrieren.mjs zuschlagTagAddieren/tagesanteile).
       Nach fachlicher Klärung ggf. umkehren (dann 7,5 hier und in Z4). */
    await expect(zelle(`Stempel-${MK}`, "Sonntag")).toHaveText("8,0");
    await expect(zelle(`Gegen-${MK}`, "Sonntag")).toHaveText("0,0");
    await expect(zelle(`Gegen-${MK}`, "Gearbeitet"), "06:00–14:00 mit 60 min Pause").toHaveText("7,0");
    /* Prüffall von a1 ist sichtbar gekennzeichnet, nicht still mitgerechnet */
    await expect(page.getByText(/Ist-Zeit zur Prüfung · November 2026/).first()).toBeVisible();
    await seiteZu(page, v);
  });

  test("Z4 Export: Rückfrage bei offenem Prüffall, abbrechen ohne Datei, bestätigen lädt die CSV; Blatt nennt den Prüffall", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    await geheZu(page, "Abrechnungsdaten");
    const rf = rueckfragenSteuern(page);
    let downloads = 0;
    page.on("download", () => { downloads += 1; });
    /* abbrechen → keine Datei */
    rf.abbrechen(true);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect.poll(() => rf.gesehen.length).toBe(1);
    expect(rf.gesehen[0].typ).toBe("confirm");
    expect(rf.gesehen[0].text).toContain("zur Prüfung");
    expect(rf.gesehen[0].text).toContain(`Betroffen: ${heute}`);
    expect(rf.gesehen[0].text).toContain("Trotzdem jetzt ausgeben?");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(downloads, "abgebrochen: kein Download").toBe(0);
    /* bestätigen → CSV */
    rf.abbrechen(false);
    const [datei] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).click()]);
    expect(datei.suggestedFilename()).toBe(`zuschlaege_${YM}.csv`);
    const csv = (await readFile(await datei.path(), "utf8")).replace(/^\uFEFF/, "").split("\n");
    expect(csv[0].split(";").slice(0, 8)).toEqual(["Nachname", "Vorname", "Personalnummer", "Gearbeitet", "Nacht", "Sonntag", "Feiertag", "Samstag"]);
    const zeileVon = (n) => (csv.find((z) => z.startsWith(`${n};`)) || "").split(";");
    const a1 = zeileVon(`Stempel-${MK}`), a2 = zeileVon(`Gegen-${MK}`);
    expect(a1.slice(0, 3)).toEqual([`Stempel-${MK}`, "Ada", "a1"]);
    expect(a1[5], "Sonntag a1 (B-Z3: ohne Pausenabzug; nach fachlicher Klärung ggf. umkehren)").toBe("8,0");
    expect(a2.slice(0, 6), "a2: 7,0 h, kein Sonntag").toEqual([`Gegen-${MK}`, "Gea", "a2", "7,0", "0,0", "0,0"]);
    /* Blatt zum Gegenlesen: der offene Prüffall steht darin (Planzeit vorläufig), nichts als bestätigt ausgegeben */
    await reiter(page, "Lohnausgabe").click();
    const [blatt] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Blatt zum Gegenlesen" }).click()]);
    const text = await readFile(await blatt.path(), "utf8");
    expect(text).toContain(`Stempel-${MK}`);
    expect(text, "Prüffall gekennzeichnet").toContain("zur Prüfung, Planzeit vorläufig");
    await seiteZu(page, v);
  });
});

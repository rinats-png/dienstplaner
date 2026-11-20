/* IMP-6 Oberfläche — Schichtmodelle und Zuordnungen je Person im Browser (Leitung).

   Gegen den echten Server aus e2e/global-setup.mjs (127.0.0.1, Wegwerfdaten). EIGENER leerer Betrieb über die API (keine
   Freigaben, kein Monatsabschluss), damit der historische Schutz nur „ab morgen“ prüft. Nur erfundene Namen (Marke SmE2e).

     S0  Einrichtung: Leitung meldet sich erstmals im Browser an; eine Beschäftigte über die API.
     S1  Zwei Schichtmodelle unterschiedlicher Zykluslänge (9 und 14 Tage) anlegen; Zykluslänge wird angezeigt;
         unbekanntes Kürzel sperrt „Übernehmen“. Server-Gegenprobe: Tage, Name, Wann/Wer/Version vom Server.
     S2  Erste Zuordnung für die Beschäftigte: Der Entwurf zeigt die Fortsetzung der Schichtfolge des Betriebs bis heute und
         das neue Modell ab morgen mit gewähltem Startpunkt. Server-Gegenprobe: zwei Zuordnungen, Versatz, keine Lücke.
     S3  Überschneidung: Die Vorprüfung meldet sie mit Text, „Übernehmen“ schreibt nichts (Server unverändert).
     S4  Modell verkürzt, Versatz ≥ neue Länge: Der echte Server antwortet 422 MODELL_VERKUERZT_VERSATZ (API); dieselbe
         Antwort im Browser erscheint unter „Nicht gespeichert“ mit dem Text des Servers, nicht als Rollenproblem.
     S5  axe WCAG 2.2 AA auf der Fläche „Schichtfolge mit Schichtmodellen“.
   Nur Projekt 1024x768 (schreibt Daten). zeit-ok: kein eigener Uhrbezug, Laufkennung nur als eindeutiger Raumname. */
import { test, expect, geheZu, schreibvorgaengeVerfolgen, axePruefen } from "./hilfen.mjs";
import { BASIS, BETREIBER_VAR } from "./umgebung.mjs";

const PROJEKT = "1024x768";
const MK = "SmE2e";

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(BASIS + pfad, { method: methode, headers: { "content-type": "application/json",
    "x-forwarded-for": `10.75.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: methode === "GET" ? undefined : JSON.stringify(rumpf || {}) });
  return { status: a.status, ...(await a.json().catch(() => ({}))) };
}
const anmeldenApi = async (code) => (await api("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } })).token;
const mandant = async (token) => (await api("/api/bestand", { token })).bestand.mandanten[0];
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
const bereich = (page) => page.getByTestId("schichtmodell-pflege");
async function zurPflege(page) {
  await anmeldenBrowser(page, C.l);
  await geheZu(page, "Schichtfolge");
  const b = bereich(page);
  await expect(b.getByRole("heading", { name: "Schichtmodelle je Person" })).toBeVisible();
  return b;
}

const C = {};
test.describe.serial("IMP-6 Oberfläche: Schichtmodelle und Zuordnungen je Person", () => {
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== PROJEKT) return;
    const bcode = process.env[BETREIBER_VAR];
    if (!bcode) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
    const bt = await anmeldenApi(bcode);
    const raum = `imp6-ui-e2e-${Date.now().toString(36)}`;     // zeit-ok: nur eindeutiger Raumname je Lauf
    const a = await api("/api/bestand-anlegen", { methode: "POST", token: bt, rumpf: { bestand: raum, vorlage: "leer", name: `Haus ${MK}` } });
    if (a.status !== 200) throw new Error(`Betrieb ${a.status}`);
    const z = await api("/api/zugaenge", { methode: "POST", token: bt, rumpf: { bestand: raum, eintraege: [{ rolle: "leitung", personId: null }] } });
    if (z.status !== 200) throw new Error(`Zugang ${z.status}`);
    C.l = z.zugaenge[0].code;
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "Ablauf einmal je Lauf (schreibt Daten)");
  });

  test("S0 Einrichtung: Leitung im Browser, eine Beschäftigte über die API", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    C.lT = await anmeldenApi(C.l);
    await expect.poll(async () => ((await mandant(C.lT)).personen || []).filter((p) => p.rolle === "leitung").length,
      { timeout: 20000 }).toBe(1);
    await seiteZu(page, v);
    const m0 = await mandant(C.lT);
    C.einheit = m0.einheiten[0];
    C.dienste = m0.dienstarten.filter((d) => !d.posten).map((d) => d.id);
    expect(C.dienste.length, "Dienstarten im leeren Betrieb").toBeGreaterThan(1);
    await schreiben(C.lT, (m) => { m.personen = [...m.personen, { id: "s1", vorname: "Sina", nachname: `Probe-${MK}`,
      rolle: "mitarbeiter", bereich: C.einheit.id, status: "aktiv", geburtstag: "1990-04-04", qualifikationen: [], eintritt: "2021-01-01",
      urlaubsanspruch: 30, wochenstunden: 39, zugehoerigkeit: [{ ab: "2021-01-01", einheitId: C.einheit.id }] }]; });
  });

  test("S1 zwei Schichtmodelle mit 9 und 14 Zyklustagen; unbekanntes Kürzel sperrt; Server stempelt", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    const b = await zurPflege(page);
    await expect(b.getByText("Noch ohne Wirkung auf den Dienstplan")).toBeVisible();
    await expect(b.getByText("Noch kein eigenes Schichtmodell.", { exact: false })).toBeVisible();
    const [x, y] = C.dienste;
    const anlegen = async (name, folge, laenge) => {
      await b.getByRole("button", { name: "Neues Schichtmodell" }).click();
      const ed = b.getByTestId("schichtmodell-editor");
      await ed.getByLabel("Name des Schichtmodells").fill(name);
      await ed.getByLabel("Folge der Zyklustage").fill(`${folge} QQQ`);
      await expect(ed.getByText("Unbekannte Kürzel: QQQ.", { exact: false })).toBeVisible();
      await expect(ed.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
      await ed.getByLabel("Folge der Zyklustage").fill(folge);
      await expect(ed.getByText(`Zykluslänge: ${laenge}`)).toBeVisible();
      await ed.getByRole("button", { name: "Übernehmen" }).click();
      await expect(ed).toHaveCount(0);
    };
    await anlegen(`Neun Tage ${MK}`, `${x} ${x} ${y} ${y} - - - - -`, "9 Tage");
    /* Tag per Knopf anhängen (Touch-Weg) */
    await b.getByRole("button", { name: "Neues Schichtmodell" }).click();
    const ed = b.getByTestId("schichtmodell-editor");
    await ed.getByLabel("Name des Schichtmodells").fill(`Zwei Wochen ${MK}`);
    for (let i = 0; i < 5; i++) await ed.getByRole("button", { name: /als nächsten Zyklustag anhängen$/ }).first().click();
    for (let i = 0; i < 2; i++) await ed.getByRole("button", { name: "frei (freier Tag) als nächsten Zyklustag anhängen" }).click();
    await expect(ed.getByText("Zykluslänge: 7 Tage (1 Woche)")).toBeVisible();
    await ed.getByLabel("Folge der Zyklustage").fill(`${x} ${x} ${x} ${x} ${x} - - ${y} ${y} ${y} ${y} ${y} - -`);
    await expect(ed.getByText("Zykluslänge: 14 Tage (2 Wochen)")).toBeVisible();
    await ed.getByRole("button", { name: "Übernehmen" }).click();
    await expect(b.getByTestId("schichtmodell-eintrag")).toHaveCount(2);
    await expect(b.getByText("9 Tage · 0 Personen zugeordnet")).toBeVisible();
    await expect(b.getByText("14 Tage (2 Wochen) · 0 Personen zugeordnet")).toBeVisible();
    await expect.poll(async () => ((await mandant(C.lT)).schichtmodelle || []).length, { timeout: 20000 }).toBe(2);
    await seiteZu(page, v);
    const sm = (await mandant(C.lT)).schichtmodelle;
    expect(sm.map((m) => [m.name, m.tage.length])).toEqual([[`Neun Tage ${MK}`, 9], [`Zwei Wochen ${MK}`, 14]]);
    for (const m of sm) { expect(m.version).toBe(1); expect(typeof m.geaendertAm).toBe("string"); expect(m.id).toMatch(/^sm-/); }
    C.modelle = sm;
  });

  test("S2 erste Zuordnung: Fortsetzung des Betriebsmodells bis heute, neues Modell ab morgen mit Startpunkt", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    const b = await zurPflege(page);
    await b.getByLabel("Person", { exact: true }).selectOption({ label: `Probe-${MK}, Sina` });
    await expect(b.getByText("Keine eigene Zuordnung — es gilt unbefristet die Schichtfolge des Betriebs.")).toBeVisible();
    await b.getByRole("button", { name: "Zuordnung hinzufügen" }).click();
    await expect(b.getByTestId("zuordnung-zeile")).toHaveCount(2);
    /* Zeile 1: Fortsetzung (Schichtfolge des Betriebs, seit jeher) — nur „Gültig bis“ änderbar */
    await expect(b.getByLabel("Schichtmodell der Zuordnung 1")).toBeDisabled();
    await expect(b.getByLabel("Schichtmodell der Zuordnung 1")).toHaveValue("betrieb");
    await expect(b.getByLabel("Gültig bis, Zuordnung 1")).toBeEnabled();
    /* Zeile 2: das neue Modell ab morgen; Startpunkt Tag 3 */
    await b.getByLabel("Schichtmodell der Zuordnung 2").selectOption(C.modelle[0].id);
    await b.getByLabel("Startpunkt im Zyklus, Zuordnung 2").selectOption("2");
    await expect(b.getByText(`Ab morgen (Entwurf): Neun Tage ${MK} — Zyklustag 3 von 9`)).toBeVisible();
    await b.getByRole("button", { name: "Übernehmen" }).click();
    await expect(b.getByRole("button", { name: "Entwurf verwerfen" })).toHaveCount(0);
    await expect.poll(async () => ((await mandant(C.lT)).personen.find((p) => p.id === "s1").schichtmodellZuordnungen || []).length,
      { timeout: 20000 }).toBe(2);
    await expect(b.getByText(`Neun Tage ${MK}`, { exact: false }).first()).toBeVisible();
    await seiteZu(page, v);
    const zl = (await mandant(C.lT)).personen.find((p) => p.id === "s1").schichtmodellZuordnungen;
    const [fort, neu] = zl;
    expect([fort.modellId, fort.gueltigAb, neu.modellId, neu.versatz, neu.gueltigBis]).toEqual(["betrieb", null, C.modelle[0].id, 2, null]);
    /* keine Lücke: das neue Modell beginnt am Tag nach dem Ende der Fortsetzung */
    const plus1 = new Date(Date.parse(`${fort.gueltigBis}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    expect(neu.gueltigAb).toBe(plus1);
    for (const z of zl) expect(z.version).toBe(1);
    C.morgen = neu.gueltigAb;
  });

  test("S3 Überschneidung: Vorprüfung meldet sie, nichts wird geschrieben", async ({ page }) => {
    const vorher = JSON.stringify((await mandant(C.lT)).personen.find((p) => p.id === "s1").schichtmodellZuordnungen);
    const v = await schreibvorgaengeVerfolgen(page);
    const b = await zurPflege(page);
    await b.getByLabel("Person", { exact: true }).selectOption({ label: `Probe-${MK}, Sina` });
    await expect(b.getByTestId("zuordnung-zeile")).toHaveCount(2);
    await b.getByRole("button", { name: "Zuordnung hinzufügen" }).click();
    await expect(b.getByTestId("zuordnung-zeile")).toHaveCount(3);
    await b.getByRole("button", { name: "Übernehmen" }).click();
    await expect(b.locator(".fehlerband")).toContainText("überschneiden sich");
    await expect(b.locator(".fehlerband")).toContainText("bitte die Zeiträume klären");
    await b.getByRole("button", { name: "Entwurf verwerfen" }).click();
    await expect(b.getByTestId("zuordnung-zeile")).toHaveCount(2);
    await seiteZu(page, v);
    expect(JSON.stringify((await mandant(C.lT)).personen.find((p) => p.id === "s1").schichtmodellZuordnungen)).toBe(vorher);
  });

  test("S4 Modell verkürzt, Versatz ≥ neue Länge: Server 422, im Browser verständlich unter „Nicht gespeichert“", async ({ page }) => {
    /* Echter Server: das 9-Tage-Modell auf 2 Tage kürzen, die Zuordnung trägt Versatz 2 → 422, nichts gespeichert. */
    const vorher = JSON.stringify(await mandant(C.lT));
    const a = await schreibenRoh(C.lT, (m) => { m.schichtmodelle[0].tage = m.schichtmodelle[0].tage.slice(0, 2); });
    expect(a.status).toBe(422);
    expect(a.code).toBe("MODELL_VERKUERZT_VERSATZ");
    expect(a.text).toContain("erlaubt 0 bis 1");
    expect(JSON.stringify(await mandant(C.lT))).toBe(vorher);
    /* Im Browser: die Vorprüfung meldet es schon vor dem Senden … */
    const b = await zurPflege(page);
    await b.getByRole("button", { name: `Schichtmodell Neun Tage ${MK} bearbeiten` }).click();
    const ed = b.getByTestId("schichtmodell-editor");
    await ed.getByLabel("Folge der Zyklustage").fill(C.modelle[0].tage.slice(0, 2).join(" "));
    await ed.getByRole("button", { name: "Übernehmen" }).click();
    await expect(ed.locator(".fehlerband")).toContainText("trägt aber den Versatz 2");
    await ed.getByRole("button", { name: "Abbrechen" }).click();
    /* … und eine 422 des Servers (dieselbe Antwort wie oben, an einem anderen Weg vorbei) zeigt die Leiste mit seinem Text. */
    await page.route("**/api/bestand", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      return route.fulfill({ status: 422, contentType: "application/json",
        body: JSON.stringify({ fehler: a.fehler, code: a.code, text: a.text, feld: a.feld }) });
    });
    await b.getByRole("button", { name: `Schichtmodell Zwei Wochen ${MK} bearbeiten` }).click();
    await ed.getByLabel("Name des Schichtmodells").fill(`Zwei Wochen ${MK} neu`);
    await ed.getByRole("button", { name: "Übernehmen" }).click();
    const leiste = page.getByRole("alert").filter({ hasText: "Schichtmodell oder Zuordnung nicht gespeichert" });
    await expect(leiste).toBeVisible({ timeout: 20000 });
    await expect(leiste).toContainText("Bereich: Schichtmodelle");
    await expect(leiste).toContainText("trägt aber den Versatz 2");
    await expect(leiste.getByRole("button", { name: "Als Datei sichern" })).toBeVisible();
    await expect(leiste.getByRole("button", { name: "Noch einmal senden" })).toHaveCount(0);
    await expect(page.getByText("Diese Änderung ist mit deiner Rolle nicht zulässig")).toHaveCount(0);
    /* Ausweg der Leiste: verwerfen (die Rückfrage bestätigt die Testhilfe) und neu laden — danach gilt wieder der Stand des Servers. */
    await leiste.getByRole("button", { name: "Änderungen verwerfen und neu laden" }).click();
    await page.waitForLoadState("load");
    await page.unroute("**/api/bestand");
    await page.goto("about:blank");
    expect(JSON.stringify(await mandant(C.lT))).toBe(vorher);
  });

  test("S5 axe WCAG 2.2 AA: Schichtfolge mit Schichtmodellen und Zuordnungen", async ({ page }, testInfo) => {
    const v = await schreibvorgaengeVerfolgen(page);
    const b = await zurPflege(page);
    await b.getByLabel("Person", { exact: true }).selectOption({ label: `Probe-${MK}, Sina` });
    await b.getByRole("button", { name: `Schichtmodell Zwei Wochen ${MK} bearbeiten` }).click();
    await axePruefen(page, testInfo, "schichtmodelle");
    await b.getByTestId("schichtmodell-editor").getByRole("button", { name: "Abbrechen" }).click();
    await seiteZu(page, v);
  });
});

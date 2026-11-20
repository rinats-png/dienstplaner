/* Lokale E2E-Abnahme Hauptfunktionen (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-20.md) — Teil 3: Personalimport im Browser,
   Erfolgsfall und weitere Fehlerfälle (Textweg; der Dateiweg ist ausgeschaltet: IMPORT_DATEI_AKTIV und CENTRIC_IMPORT_AKTIV,
   Einschalten nur mit Freigabe), Mandantentrennung.

   Gegen den echten Server aus e2e/global-setup.mjs (127.0.0.1, Wegwerfdaten). EIGENER leerer Betrieb über die API; der
   Demo-Betrieb wird nur gelesen (Gegenprobe Mandantentrennung). Nur erfundene Namen (Marke ImportE2e), Codes nie ausgegeben.

     I0  Einrichtung: Leitung meldet sich erstmals im Browser an; eine Beschäftigte über die API (Dublettenprobe).
     I1  Import gemischt: gültige Zeile, zwei Zeilen mit derselben neuen Einheit in zwei Schreibweisen, fehlender Nachname,
         ungültiges Eintrittsdatum, bereits vorhandene Person → Vorschau zählt sie getrennt. Ohne Haken „mit anlegen“ (Vorgabe
         aus) ist die neue Einheit ein Fehler; mit Haken (Leitung, org.edit) „wird neu angelegt“. Übernahme legt die drei
         fehlerfreien an und GENAU EINE neue Einheit (B-I1 behoben), nichts Fehlerhaftes, keine Dublette; Server-Gegenprobe.
     I1b Planung (ohne org.edit, Demo-Betrieb, nur Prüfen und Abbrechen): kein Haken, die neue Einheit bleibt ein Fehler.
     I2  „Abbrechen“ in der Vorschau übernimmt nichts; ohne Inhalt bleibt „Prüfen“ gesperrt.
     I3  Mandantentrennung: Die Leitung des Demo-Betriebs sieht keine der importierten Personen (Server, ihre Sicht).
   Nur Projekt 1024x768 (schreibt Daten). zeit-ok: kein eigener Uhrbezug, Laufkennung nur als eindeutiger Raumname. */
import { test, expect, geheZu, schreibvorgaengeVerfolgen } from "./hilfen.mjs";
import { BASIS, BETREIBER_VAR, ZUGAENGE_VAR } from "./umgebung.mjs";

const PROJEKT = "1024x768";
const MK = "ImportE2e";

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(BASIS + pfad, { method: methode, headers: { "content-type": "application/json",
    "x-forwarded-for": `10.74.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: methode === "GET" ? undefined : JSON.stringify(rumpf || {}) });
  return { status: a.status, ...(await a.json().catch(() => ({}))) };
}
const anmeldenApi = async (code) => (await api("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } })).token;
const mandant = async (token) => (await api("/api/bestand", { token })).bestand.mandanten[0];
async function schreiben(token, aendern) {
  const g = await api("/api/bestand", { token });
  const b = JSON.parse(JSON.stringify(g.bestand));
  aendern(b.mandanten[0]);
  const a = await api("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag } });
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

const C = {};
test.describe.serial("Lokale E2E-Abnahme Hauptfunktionen 3: Personalimport Erfolgs- und Fehlerfälle, Mandantentrennung", () => {
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== PROJEKT) return;
    const bcode = process.env[BETREIBER_VAR];
    if (!bcode) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
    const bt = await anmeldenApi(bcode);
    const raum = `haupt-e2e-i-${Date.now().toString(36)}`;     // zeit-ok: nur eindeutiger Raumname je Lauf
    const a = await api("/api/bestand-anlegen", { methode: "POST", token: bt, rumpf: { bestand: raum, vorlage: "leer", name: `Haus ${MK}` } });
    if (a.status !== 200) throw new Error(`Betrieb ${a.status}`);
    const z = await api("/api/zugaenge", { methode: "POST", token: bt, rumpf: { bestand: raum, eintraege: [{ rolle: "leitung", personId: null }] } });
    if (z.status !== 200) throw new Error(`Zugang ${z.status}`);
    C.l = z.zugaenge[0].code;
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "Ablauf einmal je Lauf (schreibt Daten)");
  });

  test("I0 Einrichtung: Leitung im Browser, eine vorhandene Beschäftigte über die API", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    C.lT = await anmeldenApi(C.l);
    await expect.poll(async () => ((await mandant(C.lT)).personen || []).filter((p) => p.rolle === "leitung").length,
      { timeout: 20000 }).toBe(1);
    await seiteZu(page, v);
    const m0 = await mandant(C.lT);
    C.einheit = m0.einheiten[0];
    await schreiben(C.lT, (m) => { m.personen = [...m.personen, { id: "a1", vorname: "Lia", nachname: `Vorhanden-${MK}`,
      rolle: "mitarbeiter", bereich: C.einheit.id, status: "aktiv", geburtstag: "1988-03-03", qualifikationen: [], eintritt: "2020-01-01",
      urlaubsanspruch: 30, wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: C.einheit.id }] }]; });
  });

  const oeffnen = async (page) => {
    await page.getByRole("button", { name: "Importieren" }).first().click();
    const blatt = page.getByRole("dialog", { name: "Personal importieren" });
    await expect(blatt).toBeVisible();
    return blatt;
  };
  const kennzahl = (blatt, name) => blatt.getByText(name, { exact: true }).locator("xpath=..");

  test("I1 Import gemischt: fehlerfreie Zeilen übernommen, neue Einheit mit Haken genau einmal angelegt (B-I1), Fehler und Dublette nicht", async ({ page }) => {
    const NEU_E = `Station Neu ${MK}`;
    const NEU_E_VARIANTE = ` station  neu ${MK.toLowerCase()} `;
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    await geheZu(page, "Personal");
    const vorher = (await mandant(C.lT)).personen.length;
    const blatt = await oeffnen(page);
    await blatt.locator("textarea").fill([
      "Nachname;Vorname;Einheit;Wochenstunden;Eintritt",
      `Eins-${MK};Ina;${C.einheit.name};30;2024-02-01`,
      `Zwei-${MK};Ida;${NEU_E};20;2023-05-01`,
      `Vier-${MK};Iva;${NEU_E_VARIANTE};25;2023-06-01`,
      `;Ohne;${C.einheit.name};39;2024-01-01`,
      `Drei-${MK};Ira;${C.einheit.name};39;2025-13-45`,
      `Vorhanden-${MK};Lia;${C.einheit.name};39;2020-01-01`,
    ].join("\n"));
    await blatt.getByRole("button", { name: "Prüfen" }).click();
    await expect(kennzahl(blatt, "Übernehmbar")).toBeVisible();
    let vorschau = (await blatt.innerText()).replace(/\s+/g, " ");
    /* Ohne Haken (Vorgabe aus): die Zeilen mit neuer Einheit sind fehlerhaft. „Fehlerhaft“ zählt die Dublette mit. */
    const anlegen = blatt.getByRole("checkbox", { name: "Fehlende Einheiten und Qualifikationen mit anlegen" });
    await expect(anlegen).not.toBeChecked();
    for (const [name, wert] of [["Übernehmbar", "1"], ["Fehlerhaft", "5"], ["Bereits vorhanden", "1"], ["Neue Einheiten", "1"]])
      await expect(kennzahl(blatt, name), `${name} — Vorschau: ${vorschau.slice(0, 1500)}`).toHaveText(name + wert);
    await expect(blatt.getByRole("row").filter({ hasText: `Zwei-${MK}, Ida` })).toContainText(`Einheit „${NEU_E}" unbekannt`);
    /* B-I1 behoben: Mit Haken ist die neue Einheit kein Fehler, sondern „wird neu angelegt“ — beide Schreibweisen EINE Einheit. */
    await anlegen.check();
    vorschau = (await blatt.innerText()).replace(/\s+/g, " ");
    for (const [name, wert] of [["Übernehmbar", "3"], ["Fehlerhaft", "3"], ["Bereits vorhanden", "1"], ["Neue Einheiten", "1"]])
      await expect(kennzahl(blatt, name), `${name} (mit Haken) — Vorschau: ${vorschau.slice(0, 1500)}`).toHaveText(name + wert);
    await expect(blatt.getByRole("row").filter({ hasText: `Zwei-${MK}, Ida` })).toContainText(`Einheit „${NEU_E}" wird neu angelegt`);
    await expect(blatt.getByRole("row").filter({ hasText: `Vier-${MK}, Iva` })).toContainText("wird neu angelegt");
    await expect(blatt.getByRole("row").filter({ hasText: `Drei-${MK}, Ira` }), "ungültiges Eintrittsdatum ist ein Fehler").toContainText("nein");
    const knopf = blatt.getByRole("button", { name: "3 Personen übernehmen" });
    await expect(knopf).toBeEnabled();
    await knopf.click();
    await expect(blatt).toBeHidden();
    await expect.poll(async () => (await mandant(C.lT)).personen.length, { timeout: 20000 }).toBe(vorher + 3);
    await seiteZu(page, v);
    const m = await mandant(C.lT);
    /* Server-Gegenprobe: genau EINE neue Einheit (Name aus der ersten Schreibweise der Datei), beide Personen darin. */
    const neu = m.einheiten.filter((e) => e.name.toLowerCase().replace(/\s+/g, " ").trim() === NEU_E.toLowerCase());
    expect(neu.map((e) => e.name), "B-I1: genau eine neue Einheit").toEqual([NEU_E]);
    const nach = (n) => m.personen.filter((p) => p.nachname === n);
    expect(nach(`Eins-${MK}`).map((p) => [p.vorname, p.wochenstunden, p.eintritt, p.zugehoerigkeit.at(-1).einheitId]))
      .toEqual([["Ina", 30, "2024-02-01", C.einheit.id]]);
    for (const [n, vn, std] of [[`Zwei-${MK}`, "Ida", 20], [`Vier-${MK}`, "Iva", 25]])
      expect(nach(n).map((p) => [p.vorname, p.wochenstunden, p.zugehoerigkeit.at(-1).einheitId]), `B-I1: ${n} in der neuen Einheit`)
        .toEqual([[vn, std, neu[0].id]]);
    expect(nach(`Drei-${MK}`), "ungültiges Eintrittsdatum nicht übernommen").toEqual([]);
    expect(m.personen.some((p) => p.vorname === "Ohne"), "ohne Nachnamen nicht übernommen").toBe(false);
    expect(nach(`Vorhanden-${MK}`), "keine Dublette").toHaveLength(1);
  });

  test("I1b Planung ohne org.edit: kein Haken, neue Einheit bleibt ein Fehler (Demo-Betrieb, nur Prüfen und Abbrechen)", async ({ page }) => {
    const planer = JSON.parse(process.env[ZUGAENGE_VAR] || "{}").planer;
    expect(planer, "Demo-Zugang Planung").toBeTruthy();
    const pT = await anmeldenApi(planer);
    const vorher = JSON.stringify((await mandant(pT)).einheiten.map((e) => e.id).sort());
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, planer);
    await geheZu(page, "Personal");
    const blatt = await oeffnen(page);
    const e0 = (await mandant(pT)).einheiten.find((e) => !e.pool) || (await mandant(pT)).einheiten[0];
    await blatt.locator("textarea").fill(`Nachname;Vorname;Einheit\nPlanung-${MK};Pia;Station Planung ${MK}\nPlanung2-${MK};Pit;${e0.name}\n`);
    await blatt.getByRole("button", { name: "Prüfen" }).click();
    await expect(kennzahl(blatt, "Neue Einheiten")).toHaveText("Neue Einheiten1");
    await expect(blatt.getByRole("checkbox", { name: "Fehlende Einheiten und Qualifikationen mit anlegen" })).toHaveCount(0);
    await expect(blatt.getByText("Fehlende Einheiten und Qualifikationen legt nur die Leitung an.", { exact: false })).toBeVisible();
    await expect(blatt.getByRole("row").filter({ hasText: `Planung-${MK}, Pia` })).toContainText("unbekannt");
    await expect(blatt.getByRole("button", { name: "1 Personen übernehmen" })).toBeEnabled();
    await blatt.getByRole("button", { name: "Abbrechen" }).click();
    await expect(blatt).toBeHidden();
    await seiteZu(page, v);
    expect(JSON.stringify((await mandant(pT)).einheiten.map((e) => e.id).sort()), "keine Einheit angelegt").toBe(vorher);
  });

  test("I2 Abbrechen in der Vorschau übernimmt nichts; ohne Inhalt bleibt Prüfen gesperrt", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    await geheZu(page, "Personal");
    const vorher = JSON.stringify((await mandant(C.lT)).personen.map((p) => p.id).sort());
    const blatt = await oeffnen(page);
    await expect(blatt.getByRole("button", { name: "Prüfen" })).toBeDisabled();
    await blatt.locator("textarea").fill(`Nachname;Vorname;Einheit\nAbbruch-${MK};Abe;${C.einheit.name}\n`);
    await blatt.getByRole("button", { name: "Prüfen" }).click();
    await expect(blatt.getByRole("button", { name: "1 Personen übernehmen" })).toBeEnabled();
    await blatt.getByRole("button", { name: "Abbrechen" }).click();
    await expect(blatt).toBeHidden();
    await seiteZu(page, v);
    expect(JSON.stringify((await mandant(C.lT)).personen.map((p) => p.id).sort()), "nichts übernommen").toBe(vorher);
  });

  test("I3 Mandantentrennung: Die Leitung des Demo-Betriebs sieht keine importierte Person", async () => {
    const demoLeitung = JSON.parse(process.env[ZUGAENGE_VAR] || "{}").leitung;
    expect(demoLeitung, "Demo-Zugang Leitung").toBeTruthy();
    const t = await anmeldenApi(demoLeitung);
    const roh = JSON.stringify((await api("/api/bestand", { token: t })).bestand);
    expect(roh.length, "Demo-Bestand gelesen").toBeGreaterThan(1000);
    for (const n of [`Eins-${MK}`, `Vorhanden-${MK}`, `Haus ${MK}`, `Zwei-${MK}`, `Station Neu ${MK}`]) expect(roh, n).not.toContain(n);
    /* Gegenprobe: im eigenen Betrieb stehen sie */
    const eigen = JSON.stringify(await mandant(C.lT));
    for (const n of [`Eins-${MK}`, `Vorhanden-${MK}`, `Zwei-${MK}`, `Station Neu ${MK}`]) expect(eigen, n).toContain(n);
  });
});

/* Lokale E2E-Abnahme 2026-11-19 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-19.md) — Lücken der Browserabnahme schließen.

   Gegen den echten Server aus e2e/global-setup.mjs (127.0.0.1, Wegwerfdaten, feste Abnahmeuhr aus e2e/zeitbasis.mjs).
   Keine Staging- oder Produktionsumgebung, kein Schalter wird eingeschaltet (Teilspeicherung und Import bleiben aus).
   Der Betreiber legt über die API zwei EIGENE leere Betriebe an (L und G); der Demo-Betrieb der übrigen Specs bleibt
   unberührt, damit dort kein Dialog „Gleichzeitig bearbeitet“ entsteht. Nur erfundene Namen, Codes nie ausgegeben.

     L0  Einrichtung: Leitung L meldet sich erstmals im Browser an (Server legt ihre Person an); Dienstart, Planung und
         eine Beschäftigte über die API, Einladungen. Betrieb G bekommt eine Beschäftigte mit offenem Antrag (Gegenprobe).
     L1  Urlaubsantrag im Browser (Telefon 390x844): Fehlerfall „Ende vor Beginn“ bleibt im Blatt und sendet nichts;
         danach gültiger Antrag → Server hat genau einen offenen Antrag.
     L2  Genehmigung im Browser (Planung): sieht den Antrag aus L, nichts aus G; „Genehmigen“ → Server: genehmigt und
         Abwesenheit Urlaub; die Beschäftigte sieht „genehmigt“ in „Meine Anträge“.
     L3  Gleichzeitige Änderung: Leitung schreibt über die API, während die Planung im Browser offen ist; die Eingabe der
         Planung bekommt 409 → Konfliktfenster; nach „Später entscheiden“ geht eine weitere Eingabe NICHT hinaus
         (Sendesperre nach 409); die fremde Änderung bleibt auf dem Server; „Neu laden“ zeigt sie.
     L4  Sitzungsende und Wiederanmeldung: Sitzung serverseitig beendet (Abmelden mit dem Merkmal der Seite, wie nach
         Ablauf), das alte Merkmal bekommt 401. L4a erwartet die Anmeldung schon beim nächsten Laden — heute bleibt das
         Ladegerüst stehen (Befund B-L4, als test.fail markiert, nicht versteckt). L4b: nach erneutem Laden Anmeldung,
         Wiederanmeldung mit demselben Code zeigt die Daten wieder.
     L5  Personalimport-Fehlerfall im Browser (Text einfügen; der Dateiimport ist ausgeschaltet, IMPORT_DATEI_AKTIV und
         CENTRIC_IMPORT_AKTIV): fehlerhafte Zeile wird erkannt und nicht übernommen, nur die gültige landet auf dem Server;
         nur fehlerhafte Zeilen → Übernahme gesperrt.
   Nur ein Projekt (1024x768, Telefonschritte auf 390x844 umgestellt): Die Abläufe schreiben Daten.
   zeit-ok: kein eigener Uhrbezug — Tage relativ zum festen Abnahmetag (abnahmeHeute), Laufkennung nur als eindeutiger Raumname. */
import { test, expect, geheZu, schreibvorgaengeVerfolgen } from "./hilfen.mjs";
import { BASIS, BETREIBER_VAR } from "./umgebung.mjs";
import { abnahmeHeute, tagPlus } from "./zeitbasis.mjs";

const PROJEKT = "1024x768";
const MK = "LueckeE2e", MK_G = "GegenE2e";
const ANMERKUNG = "SYNTH-URLAUB-L1";
const heute = abnahmeHeute();
const TAG = tagPlus(heute, 21);                 // sicher Zukunft, kein Bezug zur echten Uhr

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(BASIS + pfad, { method: methode, headers: { "content-type": "application/json",
    "x-forwarded-for": `10.71.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
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
  /* Mehrere Anmeldungen nacheinander in derselben Seite (Rollenwechsel): das Merkmal der vorigen Rolle liegt noch im
     Reiterspeicher. Nur die Anmeldedaten der Seite räumen (wie ein neuer Reiter); die Sitzung beim Server bleibt. */
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
const seitenText = (page) => page.evaluate(() => document.body.innerText);
/** Seite schließen, erst wenn jeder PUT der Seite beantwortet ist — danach darf die API schreiben (wie abnahme-a). */
async function seiteZu(page, verfolgung) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.goto("about:blank");
  await verfolgung.abgeschlossen();
}
const person = (id, rolle, nach, vor = "Lia") => ({ id, vorname: vor, nachname: nach, rolle,
  bereich: rolle === "planer" ? "ALLE" : "e1", status: "aktiv", geburtstag: "1988-03-03", qualifikationen: [],
  eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: rolle === "planer" ? "ALLE" : "e1" }] });

const C = {};
test.describe.serial("Lokale E2E-Abnahme 2026-11-19: Urlaub, Konflikt, Sitzung, Import-Fehlerfall, Trennung", () => {
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== PROJEKT) return;
    const bcode = process.env[BETREIBER_VAR];
    if (!bcode) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
    const bt = await anmeldenApi(bcode);
    const lauf = Date.now().toString(36);         // zeit-ok: nur eindeutiger Raumname je Lauf, kein Fachbezug
    for (const [raum, name, k] of [[`lok-e2e-l-${lauf}`, `Haus ${MK}`, "lL"], [`lok-e2e-g-${lauf}`, `Haus ${MK_G}`, "lG"]]) {
      const a = await api("/api/bestand-anlegen", { methode: "POST", token: bt, rumpf: { bestand: raum, vorlage: "leer", name } });
      if (a.status !== 200) throw new Error(`Betrieb ${a.status}`);
      const z = await api("/api/zugaenge", { methode: "POST", token: bt, rumpf: { bestand: raum, eintraege: [{ rolle: "leitung", personId: null }] } });
      if (z.status !== 200) throw new Error(`Zugang ${z.status}`);
      C[k] = z.zugaenge[0].code;
    }
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, "Ablauf einmal je Lauf (schreibt Daten)");
  });

  test("L0 Einrichtung: Leitung L im Browser, Personal und Einladungen über die API; Betrieb G mit offenem Antrag", async ({ page }) => {
    for (const [k, nach] of [["lL", MK], ["lG", MK_G]]) {
      const v = await schreibvorgaengeVerfolgen(page);
      await anmeldenBrowser(page, C[k]);
      const t = await anmeldenApi(C[k]);
      await expect.poll(async () => ((await mandant(t)).personen || []).filter((p) => p.rolle === "leitung").length,
        { timeout: 20000 }).toBe(1);
      await seiteZu(page, v);
      C[`${k}T`] = t;
      await schreiben(t, (m) => {
        m.dienstarten = [...(m.dienstarten || []).filter((d) => d.id !== "FX"), { id: "FX", name: `Frühdienst ${nach}`, kurz: "FX",
          farbe: "#017070", start: "06:00", ende: "14:00", pause: 30, ort: "", posten: false, quelle: null, faktor: 1,
          ruhezeitNeutral: false, rufbereitschaft: false, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} }];
        m.personen = k === "lL"
          ? [...m.personen, person("p1", "planer", `Planung-${MK}`, "Pia"), person("a1", "mitarbeiter", `Mitarbeiterin-${MK}`)]
          : [...m.personen, person("g1", "mitarbeiter", `Mitarbeiterin-${MK_G}`)];
        if (k === "lG") m.anfragen = [{ id: "r-gegen", personId: "g1", status: "offen", typ: "abwesenheit", art: "urlaub",
          von: TAG, bis: TAG, text: `SYNTH-${MK_G}`, erstellt: `${heute}T09:00:00.000Z`, antwort: "" }, ...(m.anfragen || [])];
      });
    }
    for (const pid of ["p1", "a1"]) {
      const e = await api("/api/einladung", { methode: "POST", token: C.lLT, rumpf: { personId: pid, bestaetigung: { zugangscode: C.lL } } });
      if (e.status !== 200) throw new Error(`Einladung ${e.status}`);
      C[pid] = (await api("/api/einladung/annehmen", { methode: "POST", rumpf: { einladung: e.einladung } })).zugangscode;
      if (!C[pid]) throw new Error(`Einladung ${pid} nicht angenommen`);
    }
  });

  test("L1 Urlaubsantrag am Telefon: Fehlerfall bleibt im Blatt, gültiger Antrag landet genau einmal auf dem Server", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.a1);
    await geheZu(page, "Anliegen");
    await page.getByRole("button", { name: "Frei beantragen" }).first().click();
    const blatt = page.getByRole("dialog", { name: "Frei beantragen" });
    await expect(blatt).toBeVisible();
    /* Fehlerfall: Ende vor Beginn → Fehlertext, Blatt bleibt offen, nichts gesendet */
    await blatt.getByLabel("Von").fill(TAG);
    await blatt.getByLabel("Bis").fill(tagPlus(TAG, -2));
    await blatt.getByRole("button", { name: "Antrag stellen" }).click();
    await expect(blatt.getByText("Das Ende liegt vor dem Beginn.")).toBeVisible();
    await expect(blatt.getByLabel("Bis")).toHaveAttribute("aria-invalid", "true");
    /* gültig */
    await blatt.getByLabel("Bis").fill(TAG);
    await blatt.getByLabel("Anmerkung").fill(ANMERKUNG);
    await blatt.getByRole("button", { name: "Antrag stellen" }).click();
    await expect(blatt).toBeHidden();
    await expect(page.getByText(/Meine Anträge/i).first()).toBeVisible({ timeout: 15000 });
    await seiteZu(page, v);
    const antraege = ((await mandant(C.lLT)).anfragen || []).filter((a) => a.personId === "a1");
    expect(antraege.map((a) => [a.status, a.art, a.von, a.bis, a.text])).toEqual([["offen", "urlaub", TAG, TAG, ANMERKUNG]]);
  });

  test("L2 Genehmigung durch die Planung im Browser; nichts aus Betrieb G; Beschäftigte sieht „genehmigt“", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Anträge");
    await expect(page.getByText(`„${ANMERKUNG}"`).first()).toBeVisible({ timeout: 15000 });
    expect(await seitenText(page), "Mandantentrennung: Antrag aus G darf nicht erscheinen").not.toContain(MK_G);
    await page.getByRole("button", { name: "Genehmigen" }).first().click();
    await expect.poll(async () => {
      const m = await mandant(C.lLT);
      const a = (m.anfragen || []).find((x) => x.personId === "a1");
      const abw = (m.abwesenheiten || []).filter((x) => x.personId === "a1" && x.art === "urlaub" && x.von === TAG);
      return [a && a.status, abw.length];
    }, { timeout: 20000 }).toEqual(["genehmigt", 1]);
    await seiteZu(page, v);
    /* Gegenprobe G: der eigene Antrag dort ist unberührt offen */
    expect(((await mandant(C.lGT)).anfragen || []).map((a) => [a.id, a.status])).toEqual([["r-gegen", "offen"]]);
    /* Beschäftigte sieht die Entscheidung */
    await page.setViewportSize({ width: 390, height: 844 });
    const v2 = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.a1);
    await geheZu(page, "Anliegen");
    await expect(page.getByText("genehmigt", { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await seiteZu(page, v2);
  });

  test("L3 Gleichzeitige Änderung: 409 → Konfliktfenster, Sendesperre bis zur Entscheidung, fremde Änderung bleibt", async ({ page }) => {
    /* Die Eigenprüfung des Fixtures („Gleichzeitig bearbeitet“ = Fehler) gilt hier nicht: Dieser Test erzeugt den Konflikt. */
    await page.removeLocatorHandler(page.getByRole("dialog", { name: "Gleichzeitig bearbeitet" }));
    const puts = [];
    page.on("response", (r) => { if (r.request().method() === "PUT" && new URL(r.url()).pathname === "/api/bestand") puts.push(r.status()); });
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Einstellungen");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const vorher = puts.length;
    /* Fremde Änderung im Kern (Personal) über die Leitung, während die Seite der Planung den alten Stand hält */
    const FREMD = `Zusatz-${MK}`;
    await schreiben(C.lLT, (m) => { m.personen = [...m.personen, person("z1", "mitarbeiter", FREMD, "Ida")]; });
    /* Eigene Eingabe der Planung im Kern (Darstellungsdichte liegt an der eigenen Person) */
    const dichte = () => page.getByRole("tab", { name: /^(Kompakt|Komfortabel)$/, selected: false }).first().click();
    await dichte();
    const fenster = page.getByRole("dialog", { name: "Gleichzeitig bearbeitet" });
    await expect(fenster).toBeVisible({ timeout: 20000 });
    expect(puts.slice(vorher)).toContain(409);
    await expect(fenster.getByRole("button", { name: "Neu laden" })).toBeVisible();
    await fenster.getByRole("button", { name: "Später entscheiden" }).click();
    await expect(fenster).toBeHidden();
    /* Sendesperre: weitere Eingabe, danach Netzruhe — kein weiterer PUT */
    const nachKonflikt = puts.length;
    await dichte();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await expect(page.getByText(/bis zur Entscheidung wird nichts gespeichert/).first()).toBeVisible({ timeout: 15000 });
    expect(puts.length, "nach 409 darf vor der Entscheidung kein PUT hinausgehen").toBe(nachKonflikt);
    /* Die fremde Änderung ist auf dem Server unversehrt */
    expect((await mandant(C.lLT)).personen.some((p) => p.nachname === FREMD)).toBe(true);
    /* Entscheidung „Neu laden“ (Rückfrage nimmt das Fixture an) → Stand des Servers mit der fremden Änderung */
    await page.getByRole("alert").getByRole("button", { name: "Konflikt entscheiden" }).click();
    await expect(fenster).toBeVisible();
    await fenster.getByRole("button", { name: "Neu laden" }).click();
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await geheZu(page, "Personal");
    await expect(page.getByText(FREMD).first()).toBeVisible({ timeout: 15000 });
    expect((await mandant(C.lLT)).personen.some((p) => p.nachname === FREMD)).toBe(true);
  });

  /* Sitzung beim Server beenden — wie Ablauf (30 min Untätigkeit, 12 h Frist) oder Abmelden auf einem anderen Gerät.
     Die Uhr des Testservers lässt sich nicht vorstellen; die Fristen selbst belegt pruefungen/sitzungen.test.js. */
  async function sitzungBeenden(page) {
    await anmeldenBrowser(page, C.p1);
    const alt = await page.evaluate(() => sessionStorage.getItem("centric:token"));
    expect(alt, "Merkmal der Seite").toBeTruthy();
    expect((await api("/api/abmelden", { methode: "POST", token: alt, rumpf: {} })).status).toBe(200);
    expect((await api("/api/bestand", { token: alt })).status).toBe(401);
    return alt;
  }

  /* Befund B-L4 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-19.md §4): Beim Laden mit einem beim Server nicht mehr gültigen
     Merkmal bleibt die Seite auf dem Ladegerüst „CENTRIC wird geladen“ stehen; die Anmeldung erscheint erst nach einem
     weiteren Neuladen (src/speicher.js ruf: 401 → abmelden(true) ohne Rückmeldung an die Oberfläche; src/App.jsx: Fehler
     „nicht-angemeldet“ wird verschluckt, db bleibt leer). Erwartetes Verhalten als bekannter Fehler (test.fail): Wird
     der Fehler behoben, meldet Playwright diesen Test als „unerwartet bestanden“ — dann test.fail entfernen. */
  test("L4a Sitzung beim Server beendet: beim nächsten Laden direkt die Anmeldung (bekannter Fehler B-L4)", async ({ page }) => {
    test.fail(true, "Befund B-L4: Ladegerüst statt Anmeldung nach 401 beim Laden");
    await sitzungBeenden(page);
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("L4b Sitzung beim Server beendet: altes Merkmal 401, Anmeldung nach erneutem Laden, Wiederanmeldung zeigt die Daten", async ({ page }) => {
    const alt = await sitzungBeenden(page);
    await page.reload({ waitUntil: "load" });
    /* Heutiger Stand (B-L4): das erste Laden räumt nur das Merkmal; erst das nächste zeigt die Anmeldung. */
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("centric:token")), { timeout: 15000 }).toBeNull();
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".m-tabs, .kopfleiste")).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("centric:token"))).toBeNull();
    /* Wiederanmeldung mit demselben Code */
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Personal");
    await expect(page.getByText(`Mitarbeiterin-${MK}`).first()).toBeVisible({ timeout: 15000 });
    const neu = await page.evaluate(() => sessionStorage.getItem("centric:token"));
    expect(neu && neu !== alt).toBe(true);
  });

  test("L5 Personalimport-Fehlerfall im Browser: fehlerhafte Zeile nicht übernommen, nur fehlerhaft → gesperrt", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.lL);
    await geheZu(page, "Personal");
    const m0 = await mandant(C.lLT);
    const vorher = m0.personen.length, EINHEIT = m0.einheiten[0].name;
    const oeffnen = async (text) => {
      await page.getByRole("button", { name: "Importieren" }).first().click();
      const blatt = page.getByRole("dialog", { name: "Personal importieren" });
      await expect(blatt).toBeVisible();
      await blatt.locator("textarea").fill(text);
      await blatt.getByRole("button", { name: "Prüfen" }).click();
      return blatt;
    };
    /* nur fehlerhaft: Nachname fehlt → Übernahme gesperrt */
    let blatt = await oeffnen(`Nachname;Vorname;Einheit\n;Ohne;${EINHEIT}\n`);
    await expect(blatt.getByRole("button", { name: /Personen übernehmen/ })).toBeDisabled();
    await blatt.getByRole("button", { name: "Abbrechen" }).click();
    await expect(blatt).toBeHidden();
    /* gemischt: eine gültige, eine fehlerhafte Zeile */
    blatt = await oeffnen(`Nachname;Vorname;Einheit\nImport-${MK};Ina;${EINHEIT}\n;Ohne;${EINHEIT}\n`);
    const knopf = blatt.getByRole("button", { name: "1 Personen übernehmen" });
    await expect(knopf).toBeEnabled();
    await knopf.click();
    await expect(blatt).toBeHidden();
    await seiteZu(page, v);
    const nachher = (await mandant(C.lLT)).personen;
    expect(nachher.length).toBe(vorher + 1);
    expect(nachher.filter((p) => p.nachname === `Import-${MK}`)).toHaveLength(1);
    expect(nachher.some((p) => p.vorname === "Ohne")).toBe(false);
  });
});

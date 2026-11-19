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
         Ablauf), das alte Merkmal bekommt 401. L4a: schon das erste Laden zeigt die Anmeldung mit dem Hinweis „Deine
         Sitzung ist beendet“, kein Ladegerüst (Befund B-L4, behoben durch #378). L4b: Wiederanmeldung mit demselben
         Code direkt im angezeigten Feld zeigt die Daten wieder. L4c: Sitzung endet bei offener Seite mit ausstehender
         Eingabe → kein Neuladen, Leiste „nicht gespeichert“ mit Anmeldung im selben Reiter; „Anmelden und senden“
         speichert mit dem alten ETag, genau ein PUT, kein Konfliktdialog (Befund B-L4c, behoben durch #381).
         L4d: dasselbe, aber eine andere Person meldet sich an → Eingabe verworfen, nichts gesendet, Neuladen.
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
    let putAnfragen = 0;
    const istPut = (q) => q.method() === "PUT" && new URL(q.url()).pathname === "/api/bestand";
    page.on("request", (q) => { if (istPut(q)) putAnfragen += 1; });
    page.on("response", (r) => { if (istPut(r.request())) puts.push(r.status()); });
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
    /* Sendesperre: weitere Eingabe — kein weiterer PUT. Gezählt werden ANFRAGEN (nicht Antworten), damit auch ein
       hinausgegangener, noch unbeantworteter PUT auffällt. Der Client schreibt erst WARTE = 1200 ms nach der letzten
       Eingabe (src/speicher.js:28, Zeitgeber in planeSchreiben); Netzruhe direkt nach dem Klick sagt darüber nichts.
       Deshalb bewusst eine feste Zeitspanne von 3000 ms (> WARTE + Puffer für langsame Rechner): Fehlte die Sperre,
       ginge der PUT nach 1200 ms hinaus und dieser Test würde rot. Eine Bedingung zum Abwarten gibt es hier nicht —
       geprüft wird gerade das Ausbleiben eines Ereignisses. */
    const nachKonflikt = putAnfragen;
    await dichte();
    await page.waitForTimeout(3000);
    await expect(page.getByText(/bis zur Entscheidung wird nichts gespeichert/).first()).toBeVisible({ timeout: 15000 });
    expect(putAnfragen, "nach 409 darf vor der Entscheidung kein PUT hinausgehen").toBe(nachKonflikt);
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
  const merkmalDerSeite = async (page) => {
    const alt = await page.evaluate(() => sessionStorage.getItem("centric:token"));
    expect(alt, "Merkmal der Seite").toBeTruthy();
    return alt;
  };
  async function merkmalBeenden(alt) {
    expect((await api("/api/abmelden", { methode: "POST", token: alt, rumpf: {} })).status).toBe(200);
    expect((await api("/api/bestand", { token: alt })).status).toBe(401);
    return alt;
  }
  /* Für L4a/L4b wird die Seite VOR dem Sitzungsende verlassen (about:blank; das Merkmal bleibt im Reiterspeicher).
     Sonst kann eine Hintergrundanfrage der offenen Seite (Abgleich, verzögerter PUT) die 401 vor dem Neuladen des Tests
     bekommen: Dann lädt die App selbst neu und verbraucht den einmaligen Hinweis, oder sie hält die Seite wegen eines
     wartenden Schreibvorgangs (Fall L4c) und räumt nur das Merkmal — das Neuladen des Tests zeigt dann die Anmeldung
     ohne Hinweis. Vermutlich schlug L4a so in der CI fehl (Lauf 44551113318, nicht reproduziert, lokal nie rot); belegt ist nur, dass der neue Ablauf vom Zeitverhalten unabhängig ist. */
  async function sitzungBeenden(page) {
    await anmeldenBrowser(page, C.p1);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const alt = await merkmalDerSeite(page);
    await page.goto("about:blank");
    return merkmalBeenden(alt);
  }
  /** Erstes Laden mit totem Merkmal: 401 → kontrolliertes Neuladen (src/app/sitzungsende.js) → Anmeldung mit Hinweis. */
  async function nachSitzungsendeLaden(page) {
    await page.goto("/", { waitUntil: "load" });
    const hinweis = page.locator("#sitzungsende-hinweis");
    await expect(hinweis).toBeVisible({ timeout: 30000 });
    await expect(hinweis).toContainText("Deine Sitzung ist beendet");
    await expect(page.locator("#code")).toHaveAttribute("aria-describedby", "sitzungsende-hinweis");
    await expect(page.locator(".m-tabs, .kopfleiste")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "CENTRIC wird geladen" })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("centric:token")), "Merkmal geräumt").toBeNull();
  }

  /* Befund B-L4 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-19.md §4), behoben durch #378: Vorher blieb das erste Laden mit
     einem beim Server nicht mehr gültigen Merkmal auf dem Ladegerüst „CENTRIC wird geladen“ stehen; erst ein zweites
     Neuladen zeigte die Anmeldung. Jetzt zeigt schon das erste Laden die Anmeldung mit Hinweis — genau einmal. */
  test("L4a (B-L4 behoben) Sitzung beim Server beendet: erstes Laden zeigt die Anmeldung mit Hinweis", async ({ page }) => {
    await sitzungBeenden(page);
    await nachSitzungsendeLaden(page);
    /* Der Hinweis gilt genau einmal: ein weiteres Laden zeigt den Einstieg ohne ihn. */
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: /anmelden/i }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator("#sitzungsende-hinweis")).toHaveCount(0);
  });

  test("L4b Sitzung beim Server beendet: altes Merkmal 401, Anmeldung mit Hinweis, Wiederanmeldung zeigt die Daten", async ({ page }) => {
    const alt = await sitzungBeenden(page);
    await nachSitzungsendeLaden(page);
    /* Wiederanmeldung mit demselben Code direkt im angezeigten Feld — kein zweites Laden nötig */
    await page.locator("#code").fill(C.p1);
    await page.getByRole("button", { name: /anmelden/i }).first().click();
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    for (const zu of ['[aria-label="Tour schließen"]', 'button:has-text("Später")', 'button:has-text("Tour überspringen")']) {
      const t = page.locator(zu).first();
      if (await t.count()) await t.click().catch(() => {});
    }
    await geheZu(page, "Personal");
    await expect(page.getByText(`Mitarbeiterin-${MK}`).first()).toBeVisible({ timeout: 15000 });
    const neu = await page.evaluate(() => sessionStorage.getItem("centric:token"));
    expect(neu && neu !== alt).toBe(true);
  });

  /* Sitzung endet bei offener Seite, während eine Eingabe aussteht (Browserfassung von „O“ in
     pruefungen/sitzungsende-anmeldung.test.js): kein Neuladen — die Eingabe liegt nur in diesem Reiter —, der PUT
     bekommt 401, die Leiste „nicht gespeichert“ bietet die Anmeldung mit Code im selben Reiter und „Als Datei sichern“.
     Eingabe: Dichte der eigenen Person (wie L3). Gemeinsamer Anfang von L4c und L4d. */
  async function offeneSeiteSitzungsende(page) {
    const puts = [];      // [status, etag im Rumpf] je PUT-Antwort
    const putAnfragen = []; // etag im Rumpf je hinausgehender PUT-Anfrage
    const istPut = (q) => q.method() === "PUT" && new URL(q.url()).pathname === "/api/bestand";
    const etagVon = (q) => { try { return JSON.parse(q.postData() || "{}").etag ?? null; } catch { return null; } };
    page.on("request", (q) => { if (istPut(q)) putAnfragen.push(etagVon(q)); });
    page.on("response", (r) => { if (istPut(r.request())) puts.push([r.status(), etagVon(r.request())]); });
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Einstellungen");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const dichteP1 = async () => ((await mandant(C.lLT)).personen.find((p) => p.id === "p1") || {}).dichte || "komfortabel";
    const vorher = await dichteP1();
    const ziel = vorher === "kompakt" ? "komfortabel" : "kompakt";
    /* Marke im Fensterzustand: ein Neuladen würde sie löschen. */
    await page.evaluate(() => { window.__l4OhneNeuladen = true; });
    /* Reihenfolge fest, ohne Zeitbezug: erst die Eingabe, ihr PUT wird angehalten, DANN endet die Sitzung, dann geht der
       PUT (mit dem alten Merkmal) weiter → 401, während die Eingabe aussteht. Endete die Sitzung vor der Eingabe, könnte
       eine Hintergrundanfrage die 401 ohne Ausstehendes bekommen und die App neu laden (CI-Zeitverhalten). */
    const alt = await merkmalDerSeite(page);
    let freigeben; const tor = new Promise((ja) => { freigeben = ja; });
    let angehalten; const putDa = new Promise((ja) => { angehalten = ja; });
    await page.route("**/api/bestand", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      angehalten(); await tor; return route.continue();
    });
    await page.getByRole("tab", { name: ziel === "kompakt" ? "Kompakt" : "Komfortabel", selected: false }).first().click();
    await putDa;
    await merkmalBeenden(alt);
    freigeben();
    const leiste = page.getByRole("alert").filter({ hasText: "Die Sitzung ist abgelaufen" });
    await expect(leiste).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => window.__l4OhneNeuladen === true), "kein Neuladen bei ausstehender Eingabe").toBe(true);
    await expect(leiste.getByRole("button", { name: "Als Datei sichern" })).toBeVisible();
    expect(await dichteP1(), "Server unverändert, solange nicht angemeldet").toBe(vorher);
    expect(puts.map((p) => p[0]), "der ausstehende PUT bekam 401").toEqual([401]);
    const etag401 = puts[0][1];
    expect(etag401, "der abgewiesene PUT trug eine Versionsangabe").toBeTruthy();
    return { leiste, puts, putAnfragen, dichteP1, vorher, ziel, etag401 };
  }

  /* Befund B-L4c, behoben durch #381: Nach dem Sitzungsende merkt sich src/speicher.js den ETag samt Inhaber der Sitzung;
     meldet die neue Anmeldung denselben Inhaber, geht der Auftrag MIT dem alten ETag hinaus. Vorher ging er ohne
     Versionsangabe hinaus → 409 → Dialog „Gleichzeitig bearbeitet“. Die Eigenprüfung des Fixtures (dieser Dialog = Fehler)
     bleibt hier bewusst aktiv. */
  test("L4c Sitzung endet bei offener Seite mit ausstehender Eingabe: Anmelden und senden speichert mit altem ETag (B-L4c behoben)", async ({ page }) => {
    const { leiste, puts, dichteP1, ziel, etag401 } = await offeneSeiteSitzungsende(page);
    await leiste.getByLabel("Zugangscode").fill(C.p1);
    await leiste.getByRole("button", { name: "Anmelden und senden" }).click();
    await expect(leiste).toBeHidden({ timeout: 20000 });
    await expect.poll(dichteP1, { timeout: 20000 }).toBe(ziel);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(puts.slice(1), "genau ein erfolgreicher PUT, mit dem alten ETag").toEqual([[200, etag401]]);
    await expect(page.getByRole("dialog", { name: "Gleichzeitig bearbeitet" })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("centric:token")), "wieder angemeldet").toBeTruthy();
    expect(await page.evaluate(() => window.__l4OhneNeuladen === true), "weiterhin dieselbe Seite").toBe(true);
  });

  /* Gegenfall zu L4c (#381): Nach dem Sitzungsende meldet sich in der Leiste eine ANDERE Person an (Beschäftigte a1,
     anderer Inhaber). Die Eingaben der vorherigen Sitzung gehören nicht zu diesem Zugang: nichts wird gesendet, sie
     werden verworfen, die Seite lädt neu (Lage „fremd“). Die Meldung selbst steht nur bis zum Neuladen und wird
     deshalb nicht abgefragt; geprüft werden ihre Folgen. */
  test("L4d Sitzungsende, dann Anmeldung einer anderen Person: Eingabe verworfen, nichts gesendet, Neuladen", async ({ page }) => {
    const { leiste, putAnfragen, dichteP1, vorher } = await offeneSeiteSitzungsende(page);
    const anfragenVorher = putAnfragen.length;
    await leiste.getByLabel("Zugangscode").fill(C.a1);
    await leiste.getByRole("button", { name: "Anmelden und senden" }).click();
    await expect.poll(() => page.evaluate(() => window.__l4OhneNeuladen === true).catch(() => true), { timeout: 20000 })
      .toBe(false);
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(putAnfragen.length, "nach der fremden Anmeldung keine PUT-Anfrage").toBe(anfragenVorher);
    expect(await dichteP1(), "Server unverändert").toBe(vorher);
    await expect(page.getByRole("alert").filter({ hasText: "Die Sitzung ist abgelaufen" })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("centric:token")), "als a1 angemeldet").toBeTruthy();
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

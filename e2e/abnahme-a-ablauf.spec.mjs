/* ABNAHME V4 STRANG A (lokale Integrationsabnahme, keine Staging-Abnahme) — Browserablauf über zwei Betriebe.

   Der Betreiber legt über die API zwei leere Betriebe an (Nord, Süd) und je einen Leitungszugang. Die Leitung Nord meldet
   sich zuerst im Browser im leeren Betrieb an (die Oberfläche legt ihre Person an), legt dann über die API Dienstart und
   Personal an und lädt Planung und eine Beschäftigte ein; die Planung legt einen Entwurf an.
   Im Browser (echte Anmeldeseite, echte Oberfläche):
     1  Leitung Nord sieht ihren Betrieb und ihr Personal — nichts aus Süd.
     2  Die Beschäftigte sieht den Entwurf NICHT (Mein Plan: „Entwurf“, ohne den Dienst).
     3  Die Planung gibt den Monat über „Plan freigeben“ frei (axe auf „Monatsplan“); der Server hat die Freigabe.
     4  Die Beschäftigte sieht danach ihren Dienst (Telefonbreite 390 px, axe auf „Mein Plan“).
     5  Leitung Süd sieht in Personal und Monatsplan nichts aus Nord.
   Nur ein Viewport (1024x768; Schritt 2/4 auf 390x844 umgestellt): Der Ablauf schreibt Daten, die Rasterprüfung je Viewport
   macht barrierefreiheit.spec.mjs. Nur erfundene Daten; Codes nie ausgegeben. */
import { test, expect, geheZu, axePruefen } from "./hilfen.mjs";
import { BASIS, BETREIBER_VAR } from "./umgebung.mjs";

const PROJEKT = "1024x768";
const MK_NORD = "NordMKe2e", MK_SUED = "SuedMKe2e";
const DIENST = `Frühdienst ${MK_NORD}`;
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const plusTage = (t, n) => new Date(Date.parse(`${t}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/* Zehn Tage voraus: sicher Zukunft (Entwurfstag) und in der Sechs-Wochen-Liste von „Mein Plan“. */
const TAG = plusTage(heute, 10);
const MONAT = TAG.slice(0, 7);

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(BASIS + pfad, { method: methode, headers: { "content-type": "application/json",
    "x-forwarded-for": `10.62.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: methode === "GET" ? undefined : JSON.stringify(rumpf || {}) });
  return { status: a.status, ...(await a.json().catch(() => ({}))) };
}
const anmeldenApi = async (code) => (await api("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } })).token;
async function schreiben(token, aendern) {
  const g = await api("/api/bestand", { token });
  const b = JSON.parse(JSON.stringify(g.bestand));
  aendern(b.mandanten[0]);
  const a = await api("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag } });
  if (a.status !== 200) throw new Error(`Speichern ${a.status}: ${a.text || a.fehler}`);
}

/** Anmeldung über die echte Anmeldeseite (wie hilfen.anmelden, aber mit dem Code dieses Ablaufs). */
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
const seitenText = (page) => page.evaluate(() => document.body.innerText);

const C = {};
test.describe.serial("Abnahme Strang A: Betrieb → Personal → Plan → Freigabe → Beschäftigte, zwei Betriebe", () => {
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== PROJEKT) return;
    const bcode = process.env[BETREIBER_VAR];
    if (!bcode) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
    const bt = await anmeldenApi(bcode);
    const lauf = Date.now().toString(36);
    const NORD = `abn-a-e2e-nord-${lauf}`, SUED = `abn-a-e2e-sued-${lauf}`;
    for (const [raum, name, k] of [[NORD, `Haus ${MK_NORD}`, "lN"], [SUED, `Haus ${MK_SUED}`, "lS"]]) {
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

  test("0 Leitung Nord meldet sich erstmals im leeren Betrieb an; danach Personal, Einladungen und Entwurf (API)", async ({ page }) => {
    /* Erste Anmeldung im leeren Betrieb: Die Oberfläche legt die Person der Leitung an und speichert sie. */
    await anmeldenBrowser(page, C.lN);
    const ln = await anmeldenApi(C.lN);
    await expect.poll(async () => ((await api("/api/bestand", { token: ln })).bestand.mandanten[0].personen || [])
      .filter((p) => p.rolle === "leitung").length, { timeout: 20000 }).toBe(1);
    await page.goto("about:blank");          // Seite zu, bevor die API schreibt (kein „Gleichzeitig bearbeitet“)
    const pers = (id, rolle, nach) => ({ id, vorname: rolle === "planer" ? "Pia" : "Mara", nachname: nach, rolle,
      bereich: rolle === "planer" ? "ALLE" : "e1", status: "aktiv", geburtstag: "1988-03-03", qualifikationen: [],
      zugehoerigkeit: [{ ab: "2020-01-01", einheitId: rolle === "planer" ? "ALLE" : "e1" }] });
    await schreiben(ln, (m) => {
      m.dienstarten = [...(m.dienstarten || []).filter((d) => d.id !== "FX"), { id: "FX", name: DIENST, kurz: "FX", farbe: "#017070",
        start: "06:00", ende: "14:00", pause: 30, ort: "", posten: false, quelle: null, faktor: 1, ruhezeitNeutral: false,
        /* Wie die Oberfläche (assistent2.jsx). Ohne `mindest` stürzt die Oberfläche ab — Befund A-4. */
        rufbereitschaft: false, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} }];
      m.personen = [...m.personen, pers("p1", "planer", `Planung-${MK_NORD}`), pers("a1", "mitarbeiter", `Mitarbeiterin-${MK_NORD}`)];
    });
    for (const pid of ["p1", "a1"]) {
      const e = await api("/api/einladung", { methode: "POST", token: ln, rumpf: { personId: pid, bestaetigung: { zugangscode: C.lN } } });
      if (e.status !== 200) throw new Error(`Einladung ${e.status}`);
      C[pid] = (await api("/api/einladung/annehmen", { methode: "POST", rumpf: { einladung: e.einladung } })).zugangscode;
    }
    C.pT = await anmeldenApi(C.p1);
    await schreiben(C.pT, (m) => { m.abweichungen = { ...m.abweichungen, [`a1|${TAG}`]: "FX" }; });
  });

  test("1 Leitung Nord: eigener Betrieb und Personal, nichts aus Süd", async ({ page }) => {
    await anmeldenBrowser(page, C.lN);
    await geheZu(page, "Personal");
    const t = await seitenText(page);
    expect(t).toContain(`Mitarbeiterin-${MK_NORD}`);
    expect(t).toContain(`Planung-${MK_NORD}`);
    expect(t).not.toContain(MK_SUED);
    /* Kein axe-Gate auf „Personal“: Die Fläche hat noch keinen Eintrag in barrierefreiheit.spec.mjs; der erste Scan fand
       select-name (critical, Rollenauswahl ohne Namen) — Befund A-5, Behebung in eigenem PR. */
  });

  test("2 Beschäftigte sieht den Entwurf nicht", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await anmeldenBrowser(page, C.a1);
    await geheZu(page, "Mein Plan");
    const t = await seitenText(page);
    expect(t).toMatch(/entwurf/i);          // Rubrik in Großbuchstaben (CSS), daher ohne Groß-/Kleinschreibung
    expect(t).toContain("Keine Dienste in den nächsten sechs Wochen");
    expect(t).not.toContain(DIENST);
  });

  test("3 Planung gibt den Monat im Browser frei", async ({ page }, testInfo) => {
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Monatsplan");
    if (MONAT !== heute.slice(0, 7)) await page.getByRole("group", { name: "Zeitraum wechseln" }).getByRole("button", { name: "Weiter" }).first().click();
    await expect(page.getByText("Entwurf", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Plan freigeben" }).click();
    await expect(page.getByText("Freigegeben · Stand 1").first()).toBeVisible({ timeout: 15000 });
    await expect.poll(async () => {
      const g = await api("/api/bestand", { token: C.pT });
      return !!((g.bestand.mandanten[0].freigaben || {})[MONAT]);
    }, { timeout: 15000 }).toBe(true);
    /* Dieselbe Ansicht wie die Fläche plan-planer (barrierefreiheit.spec.mjs) — deren begründete Ausnahmen gelten hier. */
    await axePruefen(page, testInfo, "plan-planer");
  });

  test("4 Beschäftigte sieht nach der Freigabe ihren Dienst (Telefonbreite)", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await anmeldenBrowser(page, C.a1);
    await geheZu(page, "Mein Plan");
    await expect(page.getByText(DIENST).first()).toBeVisible({ timeout: 15000 });
    expect(await seitenText(page)).toMatch(/freigegeben · stand 1/i);
    await axePruefen(page, testInfo, "plan-mitarbeiter");
  });

  test("5 Leitung Süd sieht in Personal und Monatsplan nichts aus Nord", async ({ page }) => {
    await anmeldenBrowser(page, C.lS);
    for (const ansicht of ["Personal", "Monatsplan"]) {
      await geheZu(page, ansicht);
      const t = await seitenText(page);
      expect(t, ansicht).not.toContain(MK_NORD);
    }
    expect(await seitenText(page)).toContain(MK_SUED);
  });
});

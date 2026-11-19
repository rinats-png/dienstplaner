/* Lokale E2E-Abnahme Hauptfunktionen (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-20.md) — Teil 1: Personal, Dienstart und
   Schichtfolge, Schichtplanung mit Ruhezeit.

   Gegen den echten Server aus e2e/global-setup.mjs (127.0.0.1, Wegwerfdaten, feste Abnahmeuhr aus e2e/zeitbasis.mjs,
   Abnahmetag Samstag 2026-11-14). Der Betreiber legt über die API einen EIGENEN leeren Betrieb an; der Demo-Betrieb der
   übrigen Specs bleibt unberührt (kein Dialog „Gleichzeitig bearbeitet“ dort). Nur erfundene Namen (Marke HauptE2e),
   Codes nie ausgegeben, kein Schalter eingeschaltet.

     H0  Einrichtung: Leitung meldet sich erstmals im Browser an; Spätdienst, Planung, Beschäftigte und Betriebsrat über
         die API, Einladungen.
     H1  Personal (Planung): Fehlerfall „ohne Namen“ → Meldung, nichts gespeichert; Person anlegen; Wochenstunden
         bearbeiten; „Austritt eintragen“ (die Oberfläche kennt kein endgültiges Löschen): Rückfrage abgebrochen → nichts,
         bestätigt → Austritt auf dem Server, Liste zeigt „ausgetreten“, Filter „Ausgetreten“.
     H2  Rechte Personal (Betriebsrat, Lesesicht): sieht die Liste, aber weder „Person hinzufügen“ noch „Importieren“, in
         der Akte kein „Austritt eintragen“; Navigation ohne „Dienstarten“ und „Schichtfolge“.
     H3  Dienstart (Leitung): Fehlerfall Mindestbesetzung leer → Meldung, nichts gespeichert; anlegen; bearbeiten
         (Zeiten). Planung sieht „Dienstarten“ nicht.
     H4  Schichtfolge (Leitung): 3-Wochen-Zyklus komplett mit der neuen Dienstart belegen → Planwirkung: jeder Tag im
         Monatsplan zeigt sie, das Tagesblatt nennt die neuen Zeiten und teilt die Beschäftigte ein (vorher: kein Tag).
     H5  Schichtplanung (Planung) im Tagesblatt: „Raus“ und „+ S“ ändern den Plan (Server); Gegenprobe über die API: ZX
         ausdrücklich am Folgetag (9 h nach dem Spätdienst) → 403 Ruhezeit, nichts gespeichert.
     H5b Befund B-H5 (heutiges Verhalten): dieselbe Einteilung über „+ ZX“ im Tagesblatt löscht nur die Abweichung (Rückkehr
         zur Schichtfolge) und wird angenommen (200) — die Ruhezeitsperre greift dort nicht.
   Nur Projekt 1024x768 (schreibt Daten). zeit-ok: kein eigener Uhrbezug — Tage relativ zum festen Abnahmetag (abnahmeHeute),
   Laufkennung nur als eindeutiger Raumname. */
import { test, expect, geheZu, schreibvorgaengeVerfolgen } from "./hilfen.mjs";
import { BASIS, BETREIBER_VAR } from "./umgebung.mjs";
import { abnahmeHeute, tagPlus, versatzMs } from "./zeitbasis.mjs";

const PROJEKT = "1024x768";
const MK = "HauptE2e";
const heute = abnahmeHeute();
const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
/** Wie fLang (src/lib/datum.js): „Mi, 18. November 2026“. */
const fLang = (iso) => { const d = new Date(`${iso}T12:00:00Z`);
  return `${DOW[(d.getUTCDay() + 6) % 7]}, ${d.getUTCDate()}. ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
/* Planungstage im Monat des Abnahmetags, sicher in der Zukunft (kein Rückwirkungsfall). */
const T1 = tagPlus(heute, 4), T2 = tagPlus(heute, 5);

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(BASIS + pfad, { method: methode, headers: { "content-type": "application/json",
    "x-forwarded-for": `10.72.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
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
  /* Mehrere Rollen nacheinander in derselben Seite: nur die Anmeldedaten der Seite räumen (wie lokale-abnahme-luecken). */
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
/** Seite erst verlassen, wenn jeder PUT der Seite beantwortet ist — danach darf die API schreiben. */
async function seiteZu(page, verfolgung) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.goto("about:blank");
  await verfolgung.abgeschlossen();
}
const person = (id, rolle, nach, einheit, vor = "Lia") => ({ id, vorname: vor, nachname: nach, rolle,
  bereich: ["planer", "betriebsrat", "leitung"].includes(rolle) ? "ALLE" : einheit, status: "aktiv", geburtstag: "1988-03-03",
  qualifikationen: [], eintritt: "2020-01-01", urlaubsanspruch: 30, wochenstunden: 39,
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const dienstart = (id, name, start, ende) => ({ id, name, kurz: id, farbe: "#017070", start, ende, pause: 30, ort: "",
  posten: false, quelle: null, faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false,
  mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} });

/** Rückfragen (window.prompt/confirm) selbst beantworten: Die Eigenprüfung des Fixtures nimmt jede Rückfrage an; hier
    entscheidet der Test. Danach wieder alles annehmen (wie das Fixture). */
function rueckfragenSteuern(page) {
  const gesehen = [];
  let antwort = null;
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => {
    gesehen.push({ typ: d.type(), text: d.message(), vorgabe: d.defaultValue() });
    const a = antwort; antwort = null;
    if (a && a.abbrechen) d.dismiss().catch(() => {});
    else d.accept(a && a.text !== undefined ? a.text : undefined).catch(() => {});
  });
  return { gesehen, naechste: (a) => { antwort = a; } };
}

const C = {};
test.describe.serial("Lokale E2E-Abnahme Hauptfunktionen 1: Personal, Dienstart, Schichtfolge, Schichtplanung", () => {
  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== PROJEKT) return;
    const bcode = process.env[BETREIBER_VAR];
    if (!bcode) throw new Error("Kein Betreibercode (global-setup.mjs gelaufen?)");
    const bt = await anmeldenApi(bcode);
    const raum = `haupt-e2e-p-${Date.now().toString(36)}`;     // zeit-ok: nur eindeutiger Raumname je Lauf
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

  test("H0 Einrichtung: Leitung im Browser, Spätdienst und Personal über die API, Einladungen", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    C.lT = await anmeldenApi(C.l);
    await expect.poll(async () => ((await mandant(C.lT)).personen || []).filter((p) => p.rolle === "leitung").length,
      { timeout: 20000 }).toBe(1);
    await seiteZu(page, v);
    const m0 = await mandant(C.lT);
    C.einheit = m0.einheiten[0];
    await schreiben(C.lT, (m) => {
      m.dienstarten = [...(m.dienstarten || []).filter((d) => d.id !== "S"), dienstart("S", `Spätdienst ${MK}`, "14:00", "22:00")];
      m.personen = [...m.personen, person("p1", "planer", `Planung-${MK}`, C.einheit.id, "Pia"),
        person("a1", "mitarbeiter", `Mitarbeiterin-${MK}`, C.einheit.id), person("b1", "betriebsrat", `Betriebsrat-${MK}`, C.einheit.id, "Ben")];
    });
    for (const pid of ["p1", "b1"]) {
      const e = await api("/api/einladung", { methode: "POST", token: C.lT, rumpf: { personId: pid, bestaetigung: { zugangscode: C.l } } });
      if (e.status !== 200) throw new Error(`Einladung ${pid} ${e.status}`);
      C[pid] = (await api("/api/einladung/annehmen", { methode: "POST", rumpf: { einladung: e.einladung } })).zugangscode;
      if (!C[pid]) throw new Error(`Einladung ${pid} nicht angenommen`);
    }
  });

  test("H1 Personal: Fehlerfall, anlegen, bearbeiten, Austritt mit Rückfrage (abbrechen/bestätigen), Sicht danach", async ({ page }) => {
    const NEU = `Neu-${MK}`, AUSTRITT = tagPlus(heute, -1);
    const neuAufServer = async () => ((await mandant(C.lT)).personen || []).filter((p) => p.nachname === NEU);
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Personal");
    /* Fehlerfall: ohne Namen → Meldung, Fokus/aria-invalid, Blatt bleibt offen, nichts gespeichert */
    await page.getByRole("button", { name: "Person hinzufügen" }).first().click();
    const blatt = page.getByRole("dialog", { name: "Person hinzufügen" });
    await expect(blatt).toBeVisible();
    await blatt.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(blatt.getByRole("alert")).toHaveText("Bitte Vor- und Nachnamen angeben.");
    await expect(blatt.getByLabel("Vorname")).toHaveAttribute("aria-invalid", "true");
    await expect(blatt.getByLabel("Vorname")).toBeFocused();
    /* gültig */
    await blatt.getByLabel("Vorname").fill("Nora");
    await blatt.getByLabel("Nachname").fill(NEU);
    await blatt.getByLabel("Eintritt").fill("2025-01-01");
    await blatt.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(blatt).toBeHidden();
    await expect.poll(async () => (await neuAufServer()).map((p) => [p.vorname, p.rolle, p.eintritt, p.austritt]), { timeout: 20000 })
      .toEqual([["Nora", "mitarbeiter", "2025-01-01", null]]);
    expect((await neuAufServer()).length, "Fehlerfall hat nichts angelegt, genau eine Person").toBe(1);
    /* bearbeiten: Akte öffnen, Wochenstunden */
    await page.getByRole("button", { name: `${NEU}, Nora öffnen` }).click();
    const akte = page.getByRole("dialog", { name: `Nora ${NEU}` });
    await expect(akte).toBeVisible();
    await akte.getByLabel("Wochenstunden", { exact: true }).fill("32");
    await expect.poll(async () => (await neuAufServer())[0].wochenstunden, { timeout: 20000 }).toBe(32);
    /* Austritt: Rückfrage abbrechen → nichts; bestätigen mit Datum → Austritt */
    const rf = rueckfragenSteuern(page);
    rf.naechste({ abbrechen: true });
    await akte.getByRole("button", { name: "Austritt eintragen" }).click();
    await expect.poll(() => rf.gesehen.length).toBe(1);
    expect(rf.gesehen[0]).toEqual({ typ: "prompt", text: "Austritt zum (JJJJ-MM-TT):", vorgabe: heute });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect((await neuAufServer())[0].austritt, "abgebrochen: kein Austritt").toBeNull();
    await expect(akte.getByRole("button", { name: "Austritt eintragen" })).toBeVisible();
    rf.naechste({ text: AUSTRITT });
    await akte.getByRole("button", { name: "Austritt eintragen" }).click();
    await expect.poll(async () => (await neuAufServer())[0].austritt, { timeout: 20000 }).toBe(AUSTRITT);
    await expect(akte.getByRole("button", { name: "Austritt zurücknehmen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(akte).toBeHidden();
    /* Sicht danach: Zeile bleibt mit „ausgetreten“, Filter „Ausgetreten“ zeigt nur sie */
    const zeile = page.getByRole("row").filter({ hasText: `${NEU}, Nora` });
    await expect(zeile).toContainText("ausgetreten");
    await page.getByRole("tab", { name: "Ausgetreten" }).or(page.getByRole("radio", { name: "Ausgetreten" }))
      .or(page.getByRole("button", { name: "Ausgetreten", exact: true })).first().click();
    await expect(page.getByRole("row").filter({ hasText: `Mitarbeiterin-${MK}` })).toHaveCount(0);
    await expect(zeile).toHaveCount(1);
    await seiteZu(page, v);
    /* Rückgängig ist ausdrücklich: Daten bleiben, die Person ist nur ausgetreten (keine Löschung) */
    expect((await neuAufServer()).length).toBe(1);
  });

  test("H2 Rechte Personal: Betriebsrat sieht die Liste, darf nichts anlegen oder austragen", async ({ page }) => {
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.b1);
    await geheZu(page, "Personal");
    await expect(page.getByRole("row").filter({ hasText: `Mitarbeiterin-${MK}` })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Person hinzufügen" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Importieren" })).toHaveCount(0);
    await page.getByRole("button", { name: `Mitarbeiterin-${MK}, Lia öffnen` }).click();
    const akte = page.getByRole("dialog", { name: `Lia Mitarbeiterin-${MK}` });
    await expect(akte).toBeVisible();
    await expect(akte.getByRole("button", { name: "Austritt eintragen" })).toHaveCount(0);
    await expect(akte.getByLabel("Wochenstunden", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    for (const n of ["Dienstarten", "Schichtfolge"])
      await expect(page.locator(".seitenleiste .slink", { hasText: n }), `kein Navigationseintrag ${n}`).toHaveCount(0);
    await seiteZu(page, v);
  });

  test("H3 Dienstart: Fehlerfall Mindestbesetzung, anlegen, bearbeiten; Planung ohne Dienstarten", async ({ page }) => {
    const ZX = `Zwischendienst-${MK}`;
    const zxAufServer = async () => ((await mandant(C.lT)).dienstarten || []).filter((d) => d.name === ZX);
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    await geheZu(page, "Dienstarten");
    await page.getByRole("button", { name: "Dienstart anlegen" }).click();
    const blatt = page.getByRole("dialog", { name: "Neue Dienstart" });
    await expect(blatt).toBeVisible();
    await blatt.getByLabel("Bezeichnung").fill(ZX);
    await blatt.getByLabel("Kürzel").fill("ZX");
    await blatt.getByLabel("Beginn").fill("08:00");
    await blatt.getByLabel("Ende", { exact: true }).fill("16:00");
    await blatt.getByLabel("Pause in Minuten").fill("30");
    /* Fehlerfall: Mindestbesetzung leer → Meldungen, Blatt bleibt, nichts gespeichert */
    await blatt.getByRole("button", { name: "Speichern" }).click();
    await expect(blatt.getByRole("alert").first()).toBeVisible();
    await expect(blatt).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(await zxAufServer(), "Fehlerfall: nichts gespeichert").toEqual([]);
    for (const l of ["Mo – Do", "Freitag", "Samstag", "So / Feiertag"]) await blatt.getByLabel(l).fill("1");
    await blatt.getByRole("button", { name: "Speichern" }).click();
    await expect(blatt).toBeHidden();
    await expect.poll(async () => (await zxAufServer()).map((d) => [d.kurz, d.start, d.ende, d.pause]), { timeout: 20000 })
      .toEqual([["ZX", "08:00", "16:00", 30]]);
    C.zx = (await zxAufServer())[0].id;
    /* bearbeiten: neue Zeiten */
    await page.getByText(ZX, { exact: true }).locator("xpath=ancestor::*[.//button[normalize-space()='Bearbeiten']][1]")
      .getByRole("button", { name: "Bearbeiten" }).click();
    const bearb = page.getByRole("dialog", { name: "Dienstart bearbeiten" });
    await expect(bearb).toBeVisible();
    await bearb.getByLabel("Beginn").fill("07:00");
    await bearb.getByLabel("Ende", { exact: true }).fill("15:00");
    await bearb.getByRole("button", { name: "Speichern" }).click();
    await expect(bearb).toBeHidden();
    await expect.poll(async () => (await zxAufServer()).map((d) => [d.start, d.ende]), { timeout: 20000 }).toEqual([["07:00", "15:00"]]);
    await expect(page.getByText("07:00–15:00 · 7,5 h · 30 min Pause").first()).toBeVisible();
    await seiteZu(page, v);
    /* Rechte: Die Planung hat kein org.edit → kein Navigationseintrag „Dienstarten“ */
    const v2 = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.p1);
    const menue = page.locator(".kopf-menue:visible").first();
    if (await menue.count() && !(await page.locator(".seitenleiste.offen").count())) await menue.click();
    await expect(page.locator(".seitenleiste .slink", { hasText: "Monatsplan" }).first()).toBeVisible();
    await expect(page.locator(".seitenleiste .slink", { hasText: "Dienstarten" })).toHaveCount(0);
    await seiteZu(page, v2);
  });

  test("H4 Schichtfolge: Zyklus mit der neuen Dienstart belegen → Monatsplan und Tagesblatt zeigen sie", async ({ page }) => {
    const ZX = `Zwischendienst-${MK}`;
    const zellen = () => page.locator(`[role=gridcell][aria-label*=" · ${C.einheit.name} · "]`);
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.l);
    /* Vorher: kein Tag im Monatsplan trägt die neue Dienstart */
    await geheZu(page, "Monatsplan");
    const tageImMonat = await zellen().count();
    expect(tageImMonat, "eine Zelle je Tag des Monats").toBe(30);
    await expect(page.locator(`[role=gridcell][aria-label$=" · ${C.einheit.name} · ${ZX}"]`)).toHaveCount(0);
    await geheZu(page, "Schichtfolge");
    await page.getByRole("radio", { name: "3 Wo." }).or(page.getByRole("tab", { name: "3 Wo." }))
      .or(page.getByRole("button", { name: "3 Wo.", exact: true })).first().click();
    await page.getByRole("button", { name: "ZX", exact: true }).click();
    await expect(page.getByRole("button", { name: "ZX", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (let w = 1; w <= 3; w++) for (const tag of DOW)
      await page.getByRole("button", { name: new RegExp(`^Woche ${w}, ${tag}: .* — mit dem gewählten Dienst belegen$`) }).click();
    await expect(page.getByRole("button", { name: /^Woche \d, \w\w: frei — / })).toHaveCount(0);
    await expect.poll(async () => { const z = (await mandant(C.lT)).zyklus; return [z.wochen, [...new Set(z.tage)]]; }, { timeout: 20000 })
      .toEqual([3, [C.zx]]);
    /* Planwirkung: jeder Tag des Monats trägt die Dienstart; das Tagesblatt nennt die neuen Zeiten und teilt ein */
    await geheZu(page, "Monatsplan");
    await expect(page.locator(`[role=gridcell][aria-label$=" · ${C.einheit.name} · ${ZX}"]`)).toHaveCount(tageImMonat);
    await page.locator(`[role=gridcell][aria-label^="${fLang(T1)} · ${C.einheit.name} · "]`).click();
    const tag = page.getByRole("dialog", { name: fLang(T1) });
    await expect(tag).toBeVisible();
    /* Das Blatt öffnet auf der ersten Dienstart (F aus der Vorlage „leer“) — zur neuen wechseln */
    await tag.getByRole("button", { name: /^ZX \d+\/\d+$/ }).click();
    await expect(tag.getByText(ZX, { exact: true })).toBeVisible();
    await expect(tag.getByText(/^07:00–15:00 · 7,5 h \(30 min Pause\)/)).toBeVisible();
    await expect(tag.locator(".karte").filter({ hasText: `Lia Mitarbeiterin-${MK}` }).getByRole("button", { name: "Raus" }),
      "Beschäftigte ist über die Schichtfolge eingeteilt").toBeVisible();
    await page.keyboard.press("Escape");
    await seiteZu(page, v);
  });

  test("H5 Schichtplanung im Tagesblatt: Raus und Spätdienst speichern; ausdrücklicher Dienst danach verletzt die Ruhezeit (403)", async ({ page }) => {
    const ab = async () => (await mandant(C.lT)).abweichungen || {};
    const puts = [];
    page.on("response", async (r) => { if (r.request().method() === "PUT" && new URL(r.url()).pathname === "/api/bestand")
      puts.push([r.status(), await r.json().then((j) => j.text || j.fehler || "").catch(() => "")]); });
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Monatsplan");
    const tagOeffnen = async (iso) => {
      await page.locator(`[role=gridcell][aria-label^="${fLang(iso)} · ${C.einheit.name} · "]`).click();
      const t = page.getByRole("dialog", { name: fLang(iso) });
      await expect(t).toBeVisible();
      await t.getByRole("button", { name: /^ZX \d+\/\d+$/ }).click();     // öffnet sonst auf F (erste Dienstart)
      return t;
    };
    const karteA1 = (blatt) => blatt.locator(".karte").filter({ hasText: `Lia Mitarbeiterin-${MK}` });
    /* T2 (Folgetag) frei: Raus → Abweichung „-“ */
    let blatt = await tagOeffnen(T2);
    await karteA1(blatt).getByRole("button", { name: "Raus" }).click();
    await expect.poll(async () => (await ab())[`a1|${T2}`], { timeout: 20000 }).toBe("-");
    await page.keyboard.press("Escape");
    /* T1: Raus aus ZX, dann Spätdienst (14–22 Uhr) — zulässig: Vortag endet 15:00, Folgetag frei */
    blatt = await tagOeffnen(T1);
    await karteA1(blatt).getByRole("button", { name: "Raus" }).click();
    await blatt.getByRole("button", { name: /^S \d+\/\d+$/ }).click();
    await karteA1(blatt).getByRole("button", { name: "+ S" }).click();
    await expect.poll(async () => (await ab())[`a1|${T1}`], { timeout: 20000 }).toBe("S");
    await expect(karteA1(blatt).getByRole("button", { name: "Raus" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    expect(puts.every(([s]) => s === 200), `bisher nur angenommene PUT: ${JSON.stringify(puts)}`).toBe(true);
    await seiteZu(page, v);
    /* Gegenprobe Ruhezeit über die API: T2 AUSDRÜCKLICH mit ZX (Beginn 07:00 nach Spätdienst bis 22:00 = 9 h) → 403,
       nichts gespeichert. */
    const g = await api("/api/bestand", { token: C.p1T || (C.p1T = await anmeldenApi(C.p1)) });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].abweichungen = { ...b.mandanten[0].abweichungen, [`a1|${T2}`]: C.zx };
    const w = await api("/api/bestand", { methode: "PUT", token: C.p1T, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, String(w.text)).toBe(403);
    expect(String(w.text)).toContain(`Einteilung am ${T2} nicht möglich: Ruhezeit unter 11 Stunden.`);
    expect((await ab())[`a1|${T2}`], "abgewiesen: Folgetag bleibt frei").toBe("-");
  });

  /* Befund B-H5 (docs/acc45/LOKALE-E2E-ABNAHME-2026-11-20.md §4), Produktfehler, NICHT in src/server repariert:
     Dieselbe Einteilung (ZX am Folgetag, 9 h nach dem Spätdienst) geht durch, wenn sie im Tagesblatt über „+ ZX“
     entsteht. Die Oberfläche löscht dann die Abweichung „-“ (ZX ist ohnehin der Plan der Schichtfolge), und die
     Schutzdurchsetzung des Servers prüft den Tag offenbar nicht als geänderte Einteilung. Der Test hält das HEUTIGE
     Verhalten fest (wie L4a/L4c damals) und wird nach der Behebung umgekehrt: dann 403 und Abweichung bleibt „-“. */
  test("H5b (Befund B-H5) Rückkehr zur Schichtfolge im Tagesblatt umgeht heute die Ruhezeitsperre", async ({ page }) => {
    const ab = async () => (await mandant(C.lT)).abweichungen || {};
    const puts = [];
    page.on("response", async (r) => { if (r.request().method() === "PUT" && new URL(r.url()).pathname === "/api/bestand")
      puts.push([r.status(), await r.json().then((j) => j.text || j.fehler || "").catch(() => "")]); });
    expect([(await ab())[`a1|${T1}`], (await ab())[`a1|${T2}`]], "Ausgangslage aus H5").toEqual(["S", "-"]);
    const v = await schreibvorgaengeVerfolgen(page);
    await anmeldenBrowser(page, C.p1);
    await geheZu(page, "Monatsplan");
    await page.locator(`[role=gridcell][aria-label^="${fLang(T2)} · ${C.einheit.name} · "]`).click();
    const blatt = page.getByRole("dialog", { name: fLang(T2) });
    await expect(blatt).toBeVisible();
    await blatt.getByRole("button", { name: /^ZX \d+\/\d+$/ }).click();
    await blatt.locator(".karte").filter({ hasText: `Lia Mitarbeiterin-${MK}` }).getByRole("button", { name: "+ ZX" }).click();
    await expect.poll(() => puts.length, { timeout: 20000 }).toBeGreaterThan(0);
    expect(puts[0][0], `heute angenommen (Befund B-H5): ${puts[0][1]}`).toBe(200);
    await expect.poll(async () => (await ab())[`a1|${T2}`], { timeout: 20000 }).toBeUndefined();
    /* Wirkung: a1 ist am Folgetag wieder über die Schichtfolge im ZX (07:00) eingeteilt — 9 h nach dem Spätdienst */
    await expect(blatt.locator(".karte").filter({ hasText: `Lia Mitarbeiterin-${MK}` }).getByRole("button", { name: "Raus" })).toBeVisible();
    await page.keyboard.press("Escape");
    await seiteZu(page, v);
  });
});

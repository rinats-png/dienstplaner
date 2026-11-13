/* Abnahme V4, Strang B (lokale Integrationsabnahme, 2026-11-13) — Geschäftsabläufe im Browser gegen den echten Server
   aus e2e/global-setup.mjs (127.0.0.1, Wegwerfdaten, erfundene Demo-Personen). Keine Staging- oder Produktionsumgebung.

   Abläufe mit Schreibwirkung laufen EINMAL je Lauf (Projekt 390x844), weil alle Rollen im selben Demo-Betrieb arbeiten:
     B7  Stempeln ohne Netz: Einstempeln bei context.setOffline(true) → vorläufig auf dem Gerät, NICHTS auf dem Server;
         Netz zurück → genau ein Stempel; erneuter Netzwechsel und Neuladen → weiterhin genau einer; Ausstempeln online.
     B8  Krankmeldung zweistufig über drei Rollen: Beschäftigte meldet (Telefon), Schichtverantwortung bestätigt
         vorläufig (Plan unverändert), Planung bestätigt endgültig (Abwesenheit); Anmerkung nie bei SV/Betriebsrat.
     B10 Monatsabschluss: Leitung schließt den Vormonat ab, öffnet ihn mit Grund wieder, (Korrektur über den Serverweg,
         falls ein Stempel im Monat liegt), schließt erneut ab — Verlauf abschluss/wiederoeffnung/abschluss.
   Lesende Prüfungen an allen acht Viewports (B6/B14): Mein Plan ohne waagrechtes Scrollen, Bedienflächen ≥ 24 px,
   axe WCAG 2.2 AA auf Heute (Stempeluhr), Krankmeldungsblatt, Lagebild (offene Krankmeldungen) und Stempelbefunde
   (Monatsabschluss); Tastaturbedienung des Krankmeldungsblatts. Zugangscodes werden nie ausgegeben. */
import { test, expect, anmelden, geheZu, axePruefen } from "./hilfen.mjs";
import { BASIS, ZUGAENGE_VAR } from "./umgebung.mjs";
import { ABNAHME_B_FLAECHEN as FL } from "./abnahme-b-flaechen.mjs";

const ABLAUF_PROJEKT = "390x844";
const heuteBerlin = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const tagPlus = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HEUTE = heuteBerlin();
const NOTIZ = "SYNTH-ANMERKUNG-B8";

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(`${BASIS}/api/${pfad}`, { method: methode,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.35.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: rumpf ? JSON.stringify(rumpf) : undefined });
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { s: a.status, d, text };
}
async function apiAnmelden(rolle) {
  const code = JSON.parse(process.env[ZUGAENGE_VAR] || "{}")[rolle];
  if (!code) throw new Error(`Kein Testzugang für ${rolle}`);
  const r = await api("anmelden", { methode: "POST", rumpf: { zugangscode: code } });
  if (!r.d.token) throw new Error(`API-Anmeldung ${rolle} gescheitert (Status ${r.s})`);
  return r.d;
}
const mandantVon = (g) => (((g.d.bestand || {}).mandanten) || [])[0] || {};
const stempelAm = (m, pid, tag) => Object.entries(m.einstempeln || {}).filter(([k]) => k === `${pid}|${tag}`);

/** Eigene Seite für eine zweite Rolle im selben Test (eigener Rechner, eigene Herkunft). */
async function zweiteSeite(browser, viewport, nr) {
  const cx = await browser.newContext({ baseURL: BASIS, viewport, serviceWorkers: "block", reducedMotion: "reduce", locale: "de-DE",
    extraHTTPHeaders: { "x-forwarded-for": `10.36.${nr}.1` } });
  const p = await cx.newPage();
  p.setDefaultTimeout(15000);
  p.on("dialog", (d) => d.accept().catch(() => {}));
  return { cx, p };
}

/** Wo Beschäftigte „Krank melden“ finden: am Telefon Reiter „Anliegen“, sonst „Meine Schichten“. */
async function zuKrankMelden(page) {
  await geheZu(page, (await page.locator(".m-tabs button:visible").count()) ? "Anliegen" : "Meine Schichten");
}

/** Einer Person am Tag einen Dienst mit Beginn und Ende geben (über die Planung, PUT mit ETag); vorhandener Dienst bleibt. */
async function dienstSicherstellen(personId, tag) {
  const pl = await apiAnmelden("planer");
  const g = await api("bestand", { token: pl.token });
  expect(g.s, "Planung liest den Bestand").toBe(200);
  const m = mandantVon(g);
  const tagKey = `${personId}|${tag}`;
  const dienste = (m.dienstarten || []).filter((x) => x.start && x.ende);
  const da = (m.abweichungen || {})[tagKey];
  if (dienste.some((x) => x.id === da)) return da;
  /* Die Planungsregeln (Ruhezeit nach dem Vortag) entscheiden, welcher Dienst zulässig ist: der erste, den der Server annimmt. */
  const abgelehnt = [];
  for (const d of dienste) {
    const g2 = await api("bestand", { token: pl.token });
    const m2 = mandantVon(g2);
    m2.abweichungen = { ...(m2.abweichungen || {}), [tagKey]: d.id };
    const w = await api("bestand", { methode: "PUT", token: pl.token, rumpf: { bestand: g2.d.bestand, etag: g2.d.etag } });
    if (w.s === 200) return d.id;
    abgelehnt.push(`${d.id}:${w.s}`);
  }
  throw new Error(`Kein Dienst am ${tag} zulässig (${abgelehnt.join(", ")})`);
}

/** Der Person der Beschäftigtenrolle am (Berliner) Tag einen Dienst geben. */
async function dienstAmSicherstellen(tag) {
  const ma = await apiAnmelden("mitarbeiter");
  return { ma, dienst: await dienstSicherstellen(ma.person, tag) };
}

/** Liegt Berliner Mitternacht in den nächsten zwei Minuten, erst danach beginnen: Ein Ablauf soll in EINEM Berliner Tag
    laufen (Server und Stempeluhr wechseln den Tag um 00:00 Europe/Berlin). Gibt den Berliner Tag des Ablaufs zurück. */
async function berlinerTagFuerAblauf(page) {
  while (heuteBerlin(new Date(Date.now() + 120_000)) !== heuteBerlin()) await page.waitForTimeout(5000);
  return heuteBerlin();
}

/** Ein Schritt am Monatsabschluss über die Oberfläche; schlägt mit den Serverantworten fehl, wenn der Zustand nicht eintritt. */
async function monatsSchritt(page, knopf, erwartet, eintrag, testInfo) {
  const antworten = [];
  const mit = (r) => { if (r.url().includes("/api/monatsabschluss")) antworten.push(r); };
  page.on("response", mit);
  await knopf.click();
  let ist;
  for (const ende = Date.now() + 30000; Date.now() < ende;) {
    ist = ((await eintrag()) || {}).abgeschlossen;
    if (ist === erwartet) break;
    await page.waitForTimeout(500);
  }
  page.off("response", mit);
  const text = [];
  for (const r of antworten) text.push(`${r.status()} ${(await r.text().catch(() => "")).slice(0, 220)}`);
  testInfo.annotations.push({ type: "abnahme-b", description: `Monatsabschluss → ${erwartet ? "abgeschlossen" : "offen"}: ${text.map((x) => x.slice(0, 3)).join(", ") || "keine Antwort"}` });
  expect(ist, `Monatsabschluss soll ${erwartet ? "abgeschlossen" : "offen"} sein; Serverantworten: ${text.join(" | ") || "keine"}`).toBe(erwartet);
}

test.describe("Abnahme B — Abläufe mit Schreibwirkung (einmal je Lauf)", () => {
  /* Drei Anmeldungen und mehrere Serverwege je Ablauf: großzügiger als die 90 s der Suite. */
  test.describe.configure({ timeout: 300_000 });
  /* QS-6: Die Oberfläche rechnet „heute“ in der Ortszeit des Geräts (src/lib/datum.js → engine/zeit.mjs), der Server
     stempelt nach Europe/Berlin (zeiterfassung.mjs, heuteBerlin). Ein Runner in UTC zeigte zwischen 23 und 24 Uhr UTC
     (Winterzeit; Sommerzeit 22–24 Uhr) den Vortag: Der Stempel landete auf dem Berliner Tag, die Stempeluhr suchte ihn
     am Vortag und bot nach dem Neuladen wieder „Einstempeln“ statt „Ausstempeln“ an. Darum hier, wie bei der
     Stempeluhr unten, die Zeitzone des Betriebs. */
  test.use({ timezoneId: "Europe/Berlin" });
  test("B7 Stempeln ohne Netz, vorläufig auf dem Gerät, nach dem Netz genau ein Stempel", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== ABLAUF_PROJEKT, "Schreibender Ablauf einmal je Lauf");
    const tag = await berlinerTagFuerAblauf(page);
    const stempelHeute = (m, pid) => stempelAm(m, pid, tag);
    const { ma } = await dienstAmSicherstellen(tag);
    const vorher = stempelHeute(mandantVon(await api("bestand", { token: ma.token })), ma.person);
    test.skip(vorher.length > 0, "Heute ist schon gestempelt (Wiederholungslauf auf demselben Server)");

    const sendungen = [];
    page.on("request", (r) => { if (r.url().includes("/api/stempeln")) sendungen.push(r.method()); });
    await anmelden(page, "mitarbeiter");
    /* Gerät und Server müssen denselben Tag meinen, sonst prüft der Ablauf nicht das Stempeln, sondern die Zeitzone. */
    expect(await page.evaluate(() => new Date().toLocaleDateString("sv-SE")), "Tag des Browsers = Berliner Tag des Servers").toBe(tag);
    const ein = page.getByRole("button", { name: "Einstempeln", exact: true }).first();
    await expect(ein, "Stempeluhr mit Einstempeln (Dienst heute)").toBeVisible({ timeout: 20000 });

    await context.setOffline(true);
    await ein.click();
    await expect(page.getByText(/vorläufig \(offline gespeichert\)/).first(), "vorläufig auf dem Gerät").toBeVisible({ timeout: 15000 });
    expect(stempelHeute(mandantVon(await api("bestand", { token: ma.token })), ma.person), "offline: nichts auf dem Server").toHaveLength(0);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => stempelHeute(mandantVon(await api("bestand", { token: ma.token })), ma.person).length,
      { message: "nach dem Netz: genau ein Stempel", timeout: 30000 }).toBe(1);

    /* Erneuter Netzwechsel und Neuladen: die Warteschlange darf nichts doppelt senden. */
    await context.setOffline(true); await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await page.waitForTimeout(1500);
    const m = mandantVon(await api("bestand", { token: ma.token }));
    const st = stempelHeute(m, ma.person);
    expect(st, "nach Netzwechsel und Neuladen: weiterhin genau ein Stempel").toHaveLength(1);
    expect(st[0][1].start, "Beginn gesetzt").toMatch(/^\d{2}:\d{2}$/);
    expect(st[0][1].ende, "noch kein Ende").toBeFalsy();
    testInfo.annotations.push({ type: "abnahme-b", description: `B7: ${sendungen.length} Sendung(en) an /api/stempeln, 1 Stempel auf dem Server` });

    /* Ausstempeln online: derselbe Stempel bekommt das Ende, kein zweiter Eintrag. */
    const aus = page.getByRole("button", { name: "Ausstempeln", exact: true }).first();
    await expect(aus).toBeVisible({ timeout: 15000 });
    await aus.click();
    await expect.poll(async () => { const x = stempelHeute(mandantVon(await api("bestand", { token: ma.token })), ma.person);
      return x.length === 1 && !!x[0][1].ende; }, { message: "Ende am selben Stempel", timeout: 30000 }).toBe(true);
  });

  test("B8 Krankmeldung zweistufig, Beschäftigte → Schichtverantwortung vorläufig → Planung endgültig", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== ABLAUF_PROJEKT, "Schreibender Ablauf einmal je Lauf");
    const ma = await apiAnmelden("mitarbeiter");
    const pl = await apiAnmelden("planer");
    const tag = tagPlus(HEUTE, 3);
    /* Am Krankheitstag einen Dienst im Plan, damit „Plan unverändert“ prüfbar ist. */
    {
      const g = await api("bestand", { token: pl.token });
      const m = mandantVon(g);
      if (!(m.abweichungen || {})[`${ma.person}|${tag}`]) {
        m.abweichungen = { ...(m.abweichungen || {}), [`${ma.person}|${tag}`]: "F" };
        const w = await api("bestand", { methode: "PUT", token: pl.token, rumpf: { bestand: g.d.bestand, etag: g.d.etag } });
        expect(w.s, w.text.slice(0, 160)).toBe(200);
      }
    }
    const planVorher = (mandantVon(await api("bestand", { token: pl.token })).abweichungen || {})[`${ma.person}|${tag}`];
    const faelleVorher = (mandantVon(await api("bestand", { token: pl.token })).krankmeldungen || []).length;

    /* 1) Beschäftigte meldet am Telefon */
    await anmelden(page, "mitarbeiter");
    await zuKrankMelden(page);
    await page.getByRole("button", { name: "Krank melden", exact: true }).first().click();
    const blatt = page.getByRole("dialog").filter({ hasText: "Krankmeldung" }).first();
    await expect(blatt).toBeVisible();
    await blatt.getByLabel("Von", { exact: true }).fill(tag);
    await blatt.getByLabel("Voraussichtlich bis", { exact: true }).fill(tag);
    await blatt.getByLabel("Anmerkung").fill(NOTIZ);
    const antwort = page.waitForResponse((r) => r.url().includes("/api/krankmeldung"), { timeout: 30000 }).catch(() => null);
    await blatt.getByRole("button", { name: "Krank melden", exact: true }).click();
    const a = await antwort;
    const aText = a ? `${a.status()} ${(await a.text().catch(() => "")).slice(0, 160)}` : "keine Antwort";
    testInfo.annotations.push({ type: "abnahme-b", description: `B8 Meldung: Server ${aText.slice(0, 3)}` });
    await expect(blatt.getByText("Krankmeldung eingegangen"), `Bestätigung im Blatt (Server: ${aText})`).toBeVisible({ timeout: 30000 });

    let mp = mandantVon(await api("bestand", { token: pl.token }));
    expect((mp.krankmeldungen || []).length, "ein neuer Fall").toBe(faelleVorher + 1);
    const fall = (mp.krankmeldungen || []).find((f) => f.personId === ma.person && f.von === tag);
    expect(fall && fall.status).toBe("eingegangen");
    const pers = (mp.personen || []).find((x) => x.id === ma.person);
    const pName = `${pers.vorname} ${pers.nachname}`;
    /** Klick und Antwort des Servers festhalten (Status in der Fehlermeldung, falls der Zustand nicht eintritt). */
    const schrittKlick = async (seite, knopf) => {
      const w = seite.waitForResponse((r) => r.url().includes("/api/krankmeldung"), { timeout: 30000 }).catch(() => null);
      await knopf.click();
      const r = await w;
      return r ? `${r.status()} ${(await r.text().catch(() => "")).slice(0, 160)}` : "keine Antwort";
    };
    expect((mp.abwesenheiten || []).some((a) => a.personId === ma.person && a.von <= tag && a.bis >= tag), "noch keine Abwesenheit").toBe(false);

    /* 2) Schichtverantwortung bestätigt vorläufig (Lagebild) */
    const sv = await zweiteSeite(browser, { width: 1024, height: 768 }, 1);
    try {
      await anmelden(sv.p, "subplaner");
      await geheZu(sv.p, "Lagebild");
      const vorl = sv.p.getByRole("button", { name: `Krankmeldung von ${pName} vorläufig bestätigen`, exact: true });
      await expect(vorl, "Schaltfläche der Schichtverantwortung").toBeVisible({ timeout: 15000 });
      await expect(sv.p.getByRole("button", { name: /endgültig bestätigen$/ }), "SV darf nicht endgültig").toHaveCount(0);
      const sA = await schrittKlick(sv.p, vorl);
      await expect.poll(async () => ((mandantVon(await api("bestand", { token: pl.token })).krankmeldungen || [])
        .find((f) => f.id === fall.id) || {}).status, { message: `SV vorläufig (Server: ${sA})`, timeout: 30000 }).toBe("vorlaeufig_bestaetigt");
      const svSicht = await sv.p.evaluate(() => document.body.innerText);
      expect(svSicht.includes(NOTIZ), "Anmerkung nicht bei der Schichtverantwortung").toBe(false);
    } finally { await sv.cx.close(); }
    const svApi = await apiAnmelden("subplaner");
    expect((await api("bestand", { token: svApi.token })).text.includes(NOTIZ), "Anmerkung nicht im Bestand der SV").toBe(false);
    const brApi = await apiAnmelden("betriebsrat");
    expect((await api("bestand", { token: brApi.token })).text.includes(NOTIZ), "Anmerkung nicht beim Betriebsrat").toBe(false);

    mp = mandantVon(await api("bestand", { token: pl.token }));
    expect((mp.abweichungen || {})[`${ma.person}|${tag}`], "vorläufig: Plan unverändert").toBe(planVorher);
    expect((mp.abwesenheiten || []).some((a) => a.personId === ma.person && a.von <= tag && a.bis >= tag), "vorläufig: keine Abwesenheit").toBe(false);

    /* 3) Planung bestätigt endgültig (Lagebild) */
    const pp = await zweiteSeite(browser, { width: 1024, height: 768 }, 2);
    try {
      await anmelden(pp.p, "planer");
      await geheZu(pp.p, "Lagebild");
      const end = pp.p.getByRole("button", { name: `Krankmeldung von ${pName} endgültig bestätigen`, exact: true });
      await expect(end).toBeVisible({ timeout: 15000 });
      const pA = await schrittKlick(pp.p, end);
      await expect.poll(async () => ((mandantVon(await api("bestand", { token: pl.token })).krankmeldungen || [])
        .find((f) => f.id === fall.id) || {}).status, { message: `Planung endgültig (Server: ${pA})`, timeout: 30000 }).toBe("endgueltig_bestaetigt");
    } finally { await pp.cx.close(); }
    mp = mandantVon(await api("bestand", { token: pl.token }));
    const abw = (mp.abwesenheiten || []).filter((a) => a.personId === ma.person && a.art === "krank" && a.von <= tag && a.bis >= tag);
    expect(abw, "endgültig: genau eine Abwesenheit").toHaveLength(1);
    expect(mp.krankmeldungen.find((f) => f.id === fall.id).verlauf.map((v) => v.schritt)).toEqual(["eingegangen", "vorlaeufig", "endgueltig"]);
    /* Wiederholung der endgültigen Bestätigung (Doppeltipp/Netz): 409, nichts doppelt. */
    const nochmal = await api("krankmeldung", { methode: "POST", token: pl.token, rumpf: { aktion: "endgueltig", id: fall.id } });
    expect(nochmal.s).toBe(409);
    expect((mandantVon(await api("bestand", { token: pl.token })).abwesenheiten || [])
      .filter((a) => a.personId === ma.person && a.art === "krank" && a.von <= tag && a.bis >= tag)).toHaveLength(1);
  });

  test("B10 Monatsabschluss abschließen, mit Grund wiederöffnen, korrigieren, erneut abschließen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== ABLAUF_PROJEKT, "Schreibender Ablauf einmal je Lauf");
    const vormonat = tagPlus(`${HEUTE.slice(0, 7)}-01`, -1).slice(0, 7);
    const le = await apiAnmelden("leitung");
    const eintrag = async () => ((mandantVon(await api("bestand", { token: le.token })).monatsabschluss || {})[vormonat]) || null;
    test.skip(!!(await eintrag()), "Vormonat hat schon einen Abschlussverlauf (Wiederholungslauf)");

    await page.setViewportSize({ width: 1024, height: 768 });
    await anmelden(page, "leitung");
    await geheZu(page, "Monatsplan");
    await page.getByRole("group", { name: "Zeitraum wechseln" }).getByRole("button", { name: "Zurück" }).first().click();
    await geheZu(page, "Abrechnungsdaten");
    await page.getByRole("radio", { name: "Stempelbefunde" }).or(page.getByRole("button", { name: "Stempelbefunde" })).or(page.getByRole("tab", { name: "Stempelbefunde" })).first().click();
    await monatsSchritt(page, page.getByRole("button", { name: "Monat abschließen" }), true, eintrag, testInfo);   // Prüffall-Rückfrage bestätigt hilfen.mjs

    await page.getByRole("button", { name: "Wiederöffnen", exact: true }).click();
    await page.getByLabel("Grund für das Wiederöffnen").fill("Abnahme B: Nachtrag eines Dienstes");
    await monatsSchritt(page, page.getByRole("button", { name: "Monat wiederöffnen" }), false, eintrag, testInfo);

    /* Korrektur (Serverweg der Leitung) an einem vorhandenen Stempel des Monats, falls es einen gibt. */
    const m = mandantVon(await api("bestand", { token: le.token }));
    const ziel = Object.entries(m.einstempeln || {}).find(([k, e]) => k.split("|")[1] && k.split("|")[1].startsWith(vormonat) && e && e.start && e.ende);
    if (ziel) {
      const [pid, datum] = ziel[0].split("|");
      const k = await api("stempel-korrektur", { methode: "POST", token: le.token,
        rumpf: { personId: pid, datum, start: ziel[1].start, ende: ziel[1].ende === "23:00" ? "22:30" : "23:00", grund: "Abnahme B: Übergabe dauerte länger" } });
      testInfo.annotations.push({ type: "abnahme-b", description: `B10 Korrektur nach Wiederöffnen: Status ${k.s}` });
      expect(k.s, k.text.slice(0, 200)).toBe(200);
    } else testInfo.annotations.push({ type: "abnahme-b", description: "B10: kein vollständiger Stempel im Vormonat — Korrekturschritt nicht ausführbar" });

    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 30000 });
    await geheZu(page, "Monatsplan");
    await page.getByRole("group", { name: "Zeitraum wechseln" }).getByRole("button", { name: "Zurück" }).first().click();
    await geheZu(page, "Abrechnungsdaten");
    await page.getByRole("radio", { name: "Stempelbefunde" }).or(page.getByRole("button", { name: "Stempelbefunde" })).or(page.getByRole("tab", { name: "Stempelbefunde" })).first().click();
    await monatsSchritt(page, page.getByRole("button", { name: "Monat abschließen" }), true, eintrag, testInfo);
    const e = await eintrag();
    expect(e.verlauf.map((v) => v.art)).toEqual(["abschluss", "wiederoeffnung", "abschluss"]);
    /* Doppelter Abschluss (Wiederholung) ändert nichts. */
    const doppelt = await api("monatsabschluss", { methode: "POST", token: le.token, rumpf: { aktion: "abschliessen", monat: vormonat } });
    expect(doppelt.s).toBe(409);
    expect((await eintrag()).verlauf).toHaveLength(3);
  });
});

/* -------------------- lesend, an allen acht Viewports (B6/B14) -------------------- */
async function zielgroesse(page, name) {
  const b = page.getByRole("button", { name, exact: true }).first();
  if (!(await b.count()) || !(await b.isVisible())) return null;
  const r = await b.boundingBox();
  return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
}

test.describe("Abnahme B — Darstellung und Barrierefreiheit der Abläufe", () => {
  test("mein-plan-mobil", async ({ page }, testInfo) => {
    await anmelden(page, "mitarbeiter");
    await geheZu(page, "Mein Plan");
    let breite = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    expect(breite.s, `Mein Plan: kein waagrechtes Scrollen (${breite.s} > ${breite.w})`).toBeLessThanOrEqual(breite.w + 1);
    await expect(page.locator("main").first(), "Mein Plan zeigt Inhalt").not.toBeEmpty();
    await zuKrankMelden(page);
    breite = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    expect(breite.s, `Anliegen: kein waagrechtes Scrollen (${breite.s} > ${breite.w})`).toBeLessThanOrEqual(breite.w + 1);
    const km = await zielgroesse(page, "Krank melden");
    expect(km, "„Krank melden“ sichtbar").not.toBeNull();
    expect(Math.min(km.w, km.h), `Zielgröße „Krank melden“ ${km.w}×${km.h}`).toBeGreaterThanOrEqual(24);
  });

  /* Stempeluhr in festem Stand: je eine eigene Person (global-setup.mjs, ZUSATZ_ZUGAENGE), die kein anderer Test anmeldet.
     Früher prüfte der Test die Person der Rolle „mitarbeiter“; nach B7 (390x844: ein- UND ausgestempelt) zeigte deren
     Stempeluhr nur noch „Dienst erfasst“ ohne Knopf, und jeder spätere Viewport scheiterte. Der Browser rechnet „heute“ in
     seiner Ortszeit, der Server stempelt nach Europe/Berlin (zeiterfassung.mjs, heuteBerlin): darum hier die Zeitzone des
     Betriebs, sonst zeigte ein Runner in UTC zwischen 23 und 24 Uhr den Vortag. */
  test.describe("Stempeluhr", () => {
    test.use({ timezoneId: "Europe/Berlin" });

    /** Dienst heute und Stempelstand der Person herstellen und über den Server bestätigen. */
    async function stempeluhrStand(zugang, eingestempelt) {
      const ich = await apiAnmelden(zugang);
      const tag = heuteBerlin();
      await dienstSicherstellen(ich.person, tag);
      const stand = async () => (mandantVon(await api("bestand", { token: ich.token })).einstempeln || {})[`${ich.person}|${tag}`] || null;
      let st = await stand();
      if (eingestempelt && !st) {
        const r = await api("stempeln", { methode: "POST", token: ich.token, rumpf: { datum: tag, art: "start" } });
        expect(r.s, `Einstempeln über den Server: ${r.text.slice(0, 160)}`).toBe(200);
        st = await stand();
      }
      const offen = !!st && !!st.start && !st.ende;
      expect(offen ? "eingestempelt" : st ? "abgeschlossen" : "nicht gestempelt",
        `Vorbedingung ${zugang}: Stand am ${tag}`).toBe(eingestempelt ? "eingestempelt" : "nicht gestempelt");
    }

    async function stempelknopfPruefen(page, name) {
      const b = page.getByRole("button", { name, exact: true }).first();
      await expect(b, `Vorbedingung: Stempeluhr zeigt „${name}“ (Dienst heute, eigener Stempelstand)`).toBeVisible({ timeout: 20000 });
      const g = await zielgroesse(page, name);
      expect(g, `Maße von „${name}“`).not.toBeNull();
      expect(Math.min(g.w, g.h), `Zielgröße „${name}“ ${g.w}×${g.h} (WCAG 2.5.8)`).toBeGreaterThanOrEqual(24);
    }

    test("heute-stempeluhr", async ({ page }, testInfo) => {
      await stempeluhrStand("stempeluhr-ein", false);
      await anmelden(page, "stempeluhr-ein");
      await stempelknopfPruefen(page, "Einstempeln");
      await axePruefen(page, testInfo, FL.heute);
    });

    test("heute-stempeluhr-ausstempeln", async ({ page }, testInfo) => {
      await stempeluhrStand("stempeluhr-aus", true);
      await anmelden(page, "stempeluhr-aus");
      await stempelknopfPruefen(page, "Ausstempeln");
      await axePruefen(page, testInfo, FL.heuteAus);
    });
  });

  test("krankmeldung-blatt", async ({ page }, testInfo) => {
    await anmelden(page, "mitarbeiter");
    await zuKrankMelden(page);
    await page.getByRole("button", { name: "Krank melden", exact: true }).first().click();
    await expect(page.getByRole("dialog").filter({ hasText: "Krankmeldung" }).first()).toBeVisible();
    await axePruefen(page, testInfo, FL.krankBlatt);
    await page.getByRole("button", { name: "Abbrechen", exact: true }).first().click();
  });

  test("lagebild-planer", async ({ page }, testInfo) => {
    await anmelden(page, "planer");
    await geheZu(page, "Lagebild");
    await axePruefen(page, testInfo, FL.lagebild);
  });

  test("stempelbefunde-leitung", async ({ page }, testInfo) => {
    await anmelden(page, "leitung");
    await geheZu(page, "Abrechnungsdaten");
    await page.getByRole("radio", { name: "Stempelbefunde" }).or(page.getByRole("button", { name: "Stempelbefunde" })).or(page.getByRole("tab", { name: "Stempelbefunde" })).first().click();
    await axePruefen(page, testInfo, FL.stempelbefunde);
  });

  test("tastatur-krankmeldung", async ({ page }, testInfo) => {
    test.skip(!["390x844", "1024x768"].includes(testInfo.project.name), "Tastatur an einem Telefon- und einem Tabletviewport");
    await anmelden(page, "mitarbeiter");
    await zuKrankMelden(page);
    let gefunden = false;
    for (let i = 0; i < 80 && !gefunden; i++) {
      await page.keyboard.press("Tab");
      gefunden = await page.evaluate(() => { const a = document.activeElement; return !!a && a.tagName === "BUTTON" && a.textContent.trim() === "Krank melden"; });
    }
    expect(gefunden, "„Krank melden“ per Tab erreichbar").toBe(true);
    const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" || s.boxShadow !== "none"; });
    expect(ring, "sichtbarer Fokus").toBe(true);
    await page.keyboard.press("Enter");
    const blatt = page.getByRole("dialog").filter({ hasText: "Krankmeldung" }).first();
    await expect(blatt, "Enter öffnet das Blatt").toBeVisible();
    const imBlatt = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest("[role=dialog]"));
    expect(imBlatt, "Fokus liegt im Blatt").toBe(true);
    await page.keyboard.press("Escape");
    await expect(blatt, "Escape schließt das Blatt").toBeHidden();
  });
});

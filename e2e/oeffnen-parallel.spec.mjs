/* WP-48-GB Rest: Mehrere parallele Sitzungen öffnen den Plan nur — kein Dialog „Gleichzeitig bearbeitet“, kein
   Schreibvorgang, der Server-Stand bleibt byte-gleich (docs/acc45/WP-48-GB-ANALYSE.md, Abschnitt 8).

   Die Suite läuft mit workers: 1 (playwright.config.mjs), weil schreibende Specs denselben Demo-Betrieb teilen. Der
   Nachweis der Parallelität steht deshalb in EINEM Test mit mehreren Browser-Kontexten (je eigener Speicher, eigene
   Anmeldung, eigene Herkunft), die gleichzeitig anmelden und den Plan öffnen. Gegen den echten Server aus
   e2e/global-setup.mjs (127.0.0.1, Wegwerfdaten, feste Abnahmeuhr 2026-11-14), nur erfundene Personen, kein Schalter
   wird eingeschaltet (CENTRIC_TEILSPEICHERUNG bleibt aus).

   Bewusster Verzicht auf anmelden() und den Fixture-Teil von hilfen.mjs: tourZu() schließt dort die Tour (eine Handlung,
   schreibt), und das axe-Gate der Meldungsstreifen gehört nicht zu diesem Befund — den Streifen prüfen die übrigen
   Specs (barrierefreiheit*, Abnahme A/B). Den Dialog prüft diese Spec selbst (ohneKonflikt).

     P1  Leitung und Planung (Rollenzugänge) öffnen gleichzeitig. Am Abnahmetag (November) ist der Urlaubshinweis fällig:
         erlaubt sind nur PUT /api/bestand, höchstens einer je Sitzung (also höchstens 2); kein Dialog, keine Leiste.
     P2  Sechs Sitzungen öffnen gleichzeitig, danach werden alle gleichzeitig neu geladen: Planung auf zwei getrennten
         Browser-Kontexten (zwei Geräte derselben Person), Subplanung und Mitarbeiter mit FRISCHEN Zugängen
         (OEFFNEN_ZUGAENGE, Personen ohne Tourzustand, die kein anderer Test anmeldet), Leitung und Betriebsrat mit den
         Rollenzugängen (je nur eine aktive Person im Demo-Bestand). Kein PUT/POST/PATCH/DELETE außer der Anmeldung,
         kein Dialog, keine Konfliktleiste; GET /api/bestand liefert danach denselben ETag und denselben Inhalt.

   Reichweite (ehrlich): In der CI läuft 1024x768 als fünftes Projekt nach den anderen Specs. Die haben über
   anmelden()/tourZu() die Tour der Rollenpersonen geschlossen und den Urlaubshinweis schon ausgelöst; P1 läuft dort im
   Zweig „schon verschickt“ (0 PUT). Das Rennen zweier Urlaubshinweis-Läufe aus #271 ist nur im Einzellauf (frischer
   Server) belegt. Der Mutant „Tour-Selbststart von vor #271“ wird im Suite-Lauf nur über die frischen Zugänge in P2
   erfasst (Planung, Subplanung, Mitarbeiter); für Leitung und Betriebsrat schützt P2 dort nur vor Schreibpfaden, die bei
   JEDEM Öffnen wirken.
   Rot vorher (Einzellauf): Tour-Selbststart wieder eingesetzt → P2 rot mit PUT ohne Eingabe.
   Anmeldungen je Code (Lastbremse anmelden-code: 20 je 5 min): Rollenzugang Planung 1, Leitung 2, Betriebsrat 1,
   frische Planung 3 (zwei Kontexte + API), frische Subplanung 1, frischer Mitarbeiter 1.
   Nur ein Projekt (1024x768): Ein Lauf genügt, die Breite ist für den Befund ohne Belang.
   zeit-ok: kein eigener Uhrbezug — Beobachtungsfenster nach dem Speicher-Verzug (1,2 s) ist eine Wartezeit, kein Datum. */
import { test, expect } from "@playwright/test";
import { BASIS, ZUGAENGE_VAR } from "./umgebung.mjs";
import { uhrVersetzen, versatzMs } from "./zeitbasis.mjs";

const PROJEKT = "1024x768";
/** Speicher-Effekt in App.jsx schreibt 1,2 s nach der letzten Änderung; das Fenster deckt ihn mit Abstand ab. */
const BEOBACHTUNG_MS = 4000;

const codes = () => JSON.parse(process.env[ZUGAENGE_VAR] || "{}");
const P2_PLAN = [["planer (Kontext 1)", "oeffnen-planer"], ["planer (Kontext 2)", "oeffnen-planer"], ["leitung", "leitung"],
  ["subplaner", "oeffnen-subplaner"], ["mitarbeiter", "oeffnen-mitarbeiter"], ["betriebsrat", "betriebsrat"]];

let xff = 0;
async function api(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const a = await fetch(BASIS + pfad, { method: methode, headers: { "content-type": "application/json",
    "x-forwarded-for": `10.48.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: methode === "GET" ? undefined : JSON.stringify(rumpf || {}) });
  return { status: a.status, ...(await a.json().catch(() => ({}))) };
}

/** Stand des Servers: ETag und Inhalt, so wie ihn die Planung liest. */
async function serverStand(token) {
  const g = await api("/api/bestand", { token });
  expect(g.status, "GET /api/bestand").toBe(200);
  return { etag: String(g.etag), inhalt: JSON.stringify(g.bestand) };
}

/** Eigener Browser-Kontext je Sitzung: Uhr wie der Server, eigene Herkunft, Protokoll aller schreibenden API-Anfragen. */
async function sitzung(browser, name, nr) {
  const cx = await browser.newContext({ baseURL: BASIS, viewport: { width: 1024, height: 768 }, serviceWorkers: "block",
    reducedMotion: "reduce", locale: "de-DE", extraHTTPHeaders: { "x-forwarded-for": `10.48.200.${nr}` } });
  await cx.addInitScript(uhrVersetzen, versatzMs());
  const page = await cx.newPage();
  page.setDefaultTimeout(30000);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const schreibend = [];
  page.on("request", (r) => {
    const p = new URL(r.url()).pathname;
    if (r.method() !== "GET" && r.method() !== "HEAD" && p.startsWith("/api/") && p !== "/api/anmelden") schreibend.push(`${r.method()} ${p}`);
  });
  const verlauf = [];
  page.on("response", (a) => { const p = new URL(a.url()).pathname; if (p.startsWith("/api/")) verlauf.push(`${a.request().method()} ${p} ${a.status()}`); });
  page.on("requestfailed", (r) => { const p = new URL(r.url()).pathname; if (p.startsWith("/api/")) verlauf.push(`${r.method()} ${p} gescheitert`); });
  return { name, cx, page, schreibend, verlauf };
}

async function anmeldenOhneHandlung(s, code) {
  await s.page.goto("/", { waitUntil: "load" });
  await s.page.locator("input").first().fill(code);
  await s.page.getByRole("button", { name: /anmelden/i }).first().click();
  await geoeffnet(s);
}

/** Oberfläche steht (Kopfleiste oder Reiter); sonst Fehler mit Sitzungsname, Seitenanfang (nur erfundene Daten) und
 *  API-Verlauf. 90 s, weil sechs Oberflächen im selben Browser gleichzeitig aufbauen (lokal unter Last mehr als 30 s). */
async function geoeffnet(s) {
  try { await s.page.waitForSelector(".m-tabs, .kopfleiste", { timeout: 90000 }); }
  catch (x) {
    const text = await s.page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300)).catch(() => "?");
    throw new Error(`${s.name}: Plan nicht geöffnet (${String(x.message).split("\n")[0]}); Seite: ${text}; API: ${s.verlauf.join(", ")}`);
  }
}

async function ruhen(s) {
  await s.page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}

/** Kein Konfliktdialog, keine Konfliktleiste (Lage konfliktOffen/Teilweg) in dieser Sitzung. */
async function ohneKonflikt(s) {
  await expect(s.page.getByRole("dialog", { name: "Gleichzeitig bearbeitet" }), `${s.name}: Dialog „Gleichzeitig bearbeitet“`).toHaveCount(0);
  await expect(s.page.getByText(/Gleichzeitig bearbeitet/), `${s.name}: Hinweis „Gleichzeitig bearbeitet“`).toHaveCount(0);
}

test.describe("WP-48-GB: paralleles Öffnen schreibt nicht", () => {
  test("mehrere Sitzungen öffnen gleichzeitig: kein Dialog, kein Schreibvorgang, Server unverändert", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== PROJEKT, `nur ${PROJEKT}`);
    test.setTimeout(240_000);
    const c = codes();
    for (const r of ["planer", "leitung", "betriebsrat", "oeffnen-planer", "oeffnen-subplaner", "oeffnen-mitarbeiter"]) {
      if (!c[r]) throw new Error(`Kein Testzugang für ${r} (global-setup.mjs gelaufen?)`);
    }
    const planerToken = (await api("/api/anmelden", { methode: "POST", rumpf: { zugangscode: c["oeffnen-planer"] } })).token;
    expect(planerToken, "Anmeldung der Planung über die API").toBeTruthy();
    const offen = [];
    try {
      /* P1: Leitung und Planung gleichzeitig (Urlaubshinweis fällig oder schon verschickt). */
      const p1 = [await sitzung(browser, "P1 leitung", 1), await sitzung(browser, "P1 planer", 2)];
      offen.push(...p1);
      await Promise.all([anmeldenOhneHandlung(p1[0], c.leitung), anmeldenOhneHandlung(p1[1], c.planer)]);
      await Promise.all(p1.map(ruhen));
      await p1[0].page.waitForTimeout(BEOBACHTUNG_MS);
      await Promise.all(p1.map(ruhen));
      for (const s of p1) await ohneKonflikt(s);
      const p1Puts = p1.flatMap((s) => s.schreibend);
      testInfo.annotations.push({ type: "P1", description: `Schreibvorgänge beim gleichzeitigen Öffnen (Urlaubshinweis): ${p1Puts.join(", ") || "keine"}` });
      expect(p1Puts.every((x) => x === "PUT /api/bestand"), `P1: nur der Urlaubshinweis-Lauf schreibt (${p1Puts.join(", ")})`).toBe(true);
      for (const s of p1) expect(s.schreibend.length, `${s.name}: höchstens ein Schreibvorgang (Urlaubshinweis)`).toBeLessThanOrEqual(1);
      expect(p1Puts.length, "P1: höchstens zwei Schreibvorgänge").toBeLessThanOrEqual(2);
      for (const s of p1) await s.cx.close();
      offen.length = 0;

      /* P2: sechs Sitzungen gleichzeitig, danach gleichzeitig neu laden. */
      const vorher = await serverStand(planerToken);
      const plan = P2_PLAN;
      const p2 = [];
      for (const [i, [name]] of plan.entries()) p2.push(await sitzung(browser, `P2 ${name}`, 10 + i));
      offen.push(...p2);
      await Promise.all(p2.map((s, i) => anmeldenOhneHandlung(s, c[plan[i][1]])));
      await Promise.all(p2.map(ruhen));
      await p2[0].page.waitForTimeout(BEOBACHTUNG_MS);
      await Promise.all(p2.map((s) => s.page.reload({ waitUntil: "load" })));
      await Promise.all(p2.map(geoeffnet));
      await Promise.all(p2.map(ruhen));
      await p2[0].page.waitForTimeout(BEOBACHTUNG_MS);
      await Promise.all(p2.map(ruhen));

      for (const s of p2) await ohneKonflikt(s);
      const schreibend = p2.flatMap((s) => s.schreibend.map((x) => `${s.name}: ${x}`));
      expect(schreibend, "P2: kein Schreibvorgang beim bloßen Öffnen und Neuladen").toEqual([]);
      const nachher = await serverStand(planerToken);
      expect(nachher.etag, "P2: ETag des Servers unverändert").toBe(vorher.etag);
      expect(nachher.inhalt === vorher.inhalt, "P2: Inhalt des Servers byte-gleich").toBe(true);
      testInfo.annotations.push({ type: "P2", description: `${p2.length} Sitzungen, je zweimal geöffnet, 0 Schreibvorgänge, ETag ${vorher.etag} unverändert` });
    } finally {
      for (const s of offen) await s.cx.close().catch(() => {});
      await api("/api/abmelden", { methode: "POST", token: planerToken }).catch(() => {});
    }
  });
});

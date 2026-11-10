/* WP-35 Browserprobe (lokal, Wegwerfdaten): kein Querscrollen bei 360/390/430 px in Abrechnungsdaten und Handbuch;
   Geo-Schalter schaltet die Anzeige sofort. Aufruf: npx vite build; node pruefungen/browser/darstellung-wp35.mjs (playwright-core + Edge noetig).
   Der Geo-Schalter wird nur fuer die Leitung (org.edit) geprueft; die Rechte werden hier nicht veraendert. */
/* global document, window, getComputedStyle */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = 3195, BASE = `http://127.0.0.1:${PORT}`, ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-wp35";
const daten = await mkdtemp(path.join(tmpdir(), "centric-wp35-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development" } });
let xz = 0;
const j = async (p, bd, t, m = "POST") => { const a = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json", "x-forwarded-for": `10.8.0.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: bd ? JSON.stringify(bd) : undefined }); return { s: a.status, d: await a.json().catch(() => ({})) }; };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch { /* Server startet noch */ } await new Promise((r) => setTimeout(r, 200)); }
const erg = [];
const ok = (n, v) => { erg.push([n, !!v]); console.log((v ? "OK   " : "FEHL ") + n); };
let b = null;
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  const person = (id, r, n) => ({ id, vorname: "Lokal", nachname: n || "P-" + id, rolle: r, bereich: "ALLE", status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const { baueLeerenBetrieb } = await import("file:///" + WT + "/server/lib/leerbetrieb.mjs");
  const voll = baueLeerenBetrieb({ name: "Lokal Betrieb", branche: "pflege", email: null, land: "DE", raum: RAUM, laeuftAb: null });
  /* langer Nachname: Zeilen der Abrechnungsdaten sollen die Breite nicht sprengen */
  voll.mandanten[0].personen = [person("l", "leitung", "Leitungsperson-mit-sehr-langem-Nachnamen"), person("m1", "mitarbeiter"), person("m2", "mitarbeiter")];
  await j("/api/bestand-anlegen", { inhalt: voll }, bt);
  const z = await j("/api/zugaenge", { bestand: RAUM, eintraege: [{ rolle: "leitung", personId: "l", name: "Lokal L" }] }, bt);
  const code = z.d.zugaenge[0].code;
  b = await chromium.launch({ channel: "msedge" });
  const zu = async (p, id) => p.evaluate((x) => { const k = [...document.querySelectorAll("button.slink")].find((el) => el.textContent.replace(/\d+$/, "").trim() === x); if (k) k.click(); return !!k; }, id);
  /* innen: Bereiche mit eigenem Querscroll im Inhalt (auch das ist Querscrollen fuer die Person) */
  const breite = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, fenster: window.innerWidth,
    innen: [...document.querySelectorAll("main *")].filter((el) => el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)).length, wer: [...document.querySelectorAll("main *")].filter((el) => el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)).map((el) => el.tagName + "." + el.className + "|" + (el.getAttribute("role") || "") + "|" + el.scrollWidth + ">" + el.clientWidth).join(";") }));
  for (const w of [360, 390, 430]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 850 }, serviceWorkers: "block" }); const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (x) => errs.push(String(x)));
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.locator("input").first().fill(code); await p.getByRole("button", { name: /anmelden/i }).first().click(); await p.waitForTimeout(2500);
    ok(`${w}px Abrechnungsdaten erreichbar`, await zu(p, "Abrechnungsdaten")); await p.waitForTimeout(700);
    for (const reiter of ["Zuschläge", "Freizeitausgleich", "Lohnausgabe", "Stempelbefunde"]) {
      const t = p.getByRole("tab", { name: reiter }).or(p.getByRole("button", { name: reiter })).locator("visible=true").first();
      if (await t.count()) { await t.click(); await p.waitForTimeout(400); }
      const m = await breite(p);
      ok(`${w}px Abrechnungsdaten/${reiter}: Seite ohne Querscrollen (${m.doc} <= ${m.fenster}, Innenscroll: ${m.innen} ${m.wer})`, m.doc <= m.fenster && m.body <= m.fenster && m.innen === 0);
    }
    ok(`${w}px Handbuch erreichbar`, await zu(p, "Handbuch")); await p.waitForTimeout(900);
    { const m = await breite(p); ok(`${w}px Handbuch: Seite ohne Querscrollen (${m.doc} <= ${m.fenster}, Innenscroll: ${m.innen} ${m.wer})`, m.doc <= m.fenster && m.body <= m.fenster && m.innen === 0); }
    ok(`${w}px Betrieb erreichbar`, await zu(p, "Betrieb")); await p.waitForTimeout(900);
    /* Betrieb: nur die Seite; Tabellen mit eigenem Scroll in anderen Karten sind nicht Gegenstand von WP-35 */
    { const m = await breite(p); ok(`${w}px Betrieb: Seite ohne Querscrollen (${m.doc} <= ${m.fenster})`, m.doc <= m.fenster && m.body <= m.fenster); }
    if (w === 390) {
      /* Geo-Schalter: Anzeige springt ohne Verzoegerung um (die Server-Bestaetigung folgt danach) */
      if (process.env.WP35_DEBUG) console.log((await p.evaluate(() => document.body.innerText)).split("Zu meinen Schichten")[1].slice(0, 2500));
      await p.getByLabel(/betrieblich geprüft/).scrollIntoViewIfNeeded();
      await p.getByLabel(/betrieblich geprüft/).check();
      await p.getByRole("button", { name: "Einschalten", exact: true }).click();
      await p.getByText("eingeschaltet", { exact: true }).first().waitFor({ timeout: 500 }).then(() => ok("Geo-Schalter: Anzeige 'eingeschaltet' innerhalb 500 ms", true), () => ok("Geo-Schalter: Anzeige 'eingeschaltet' innerhalb 500 ms", false));
      await p.getByRole("button", { name: "Ausschalten", exact: true }).click();
      await p.getByRole("button", { name: "Einschalten", exact: true }).waitFor({ timeout: 500 }).then(() => ok("Geo-Schalter: Anzeige wieder 'aus' innerhalb 500 ms", true), () => ok("Geo-Schalter: Anzeige wieder 'aus' innerhalb 500 ms", false));
    }
    ok(`${w}px keine Seitenfehler`, errs.length === 0);
    if (errs.length) console.log(errs.join("|").slice(0, 300));
    await ctx.close();
  }
} catch (x) { console.log("FEHLER", x && x.message); ok("Probe ohne Ausnahme", false); }
finally { if (b) await b.close(); srv.kill(); }
const bad = erg.filter((x) => !x[1]).length;
console.log(`\n${erg.length - bad}/${erg.length} OK`);
process.exit(bad ? 1 : 0);

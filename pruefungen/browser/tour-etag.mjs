/* Browserprobe (lokal, Wegwerfdaten): Tour vs. Dialog, ETag beim Speichern, Konflikt. Aufruf: npx vite build; node pruefungen/browser/tour-etag.mjs (playwright-core + Edge nötig). */
/* global document */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = 3193, BASE = `http://127.0.0.1:${PORT}`, ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-etag";
const daten = await mkdtemp(path.join(tmpdir(), "centric-ui-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development" } });
let xz = 0;
const j = async (p, b, t, m = "POST") => { const a = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { s: a.status, d: await a.json().catch(() => ({})), et: a.headers.get("etag") }; };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
const erg = [];
const ok = (n, v) => { erg.push([n, !!v]); console.log((v ? "OK   " : "FEHL ") + n); };
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
  const person = (id, r) => ({ id, vorname: "Lokal", nachname: "P-" + id, rolle: r, bereich: "ALLE", status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const { baueLeerenBetrieb } = await import("file:///" + WT + "/server/lib/leerbetrieb.mjs");
  const voll = baueLeerenBetrieb({ name: "Lokal Betrieb", branche: "pflege", email: null, land: "DE", raum: RAUM, laeuftAb: null });
  voll.mandanten[0].personen = [person("l", "leitung"), person("m1", "mitarbeiter")];
  await j("/api/bestand-anlegen", { inhalt: voll }, bt);
  const z = await j("/api/zugaenge", { bestand: RAUM, eintraege: [{ rolle: "leitung", personId: "l", name: "Lokal L" }] }, bt);
  const code = z.d.zugaenge[0].code;
  const b = await chromium.launch({ channel: "msedge" });
  for (const w of [1280, 375, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 850 }, serviceWorkers: "block" }); const p = await ctx.newPage();
    const errs = []; p.on("pageerror", x => errs.push(String(x)));
    const puts = []; p.on("request", r => { if (r.method() === "PUT" && r.url().includes("/api/bestand")) puts.push({ h: r.headers(), url: r.url(), body: r.postData() }); });
    const antw = []; p.on("response", r => { if (r.request().method() === "PUT" && r.url().includes("/api/bestand")) antw.push(r.status()); });
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.locator("input").first().fill(code); await p.getByRole("button", { name: /anmelden/i }).first().click(); await p.waitForTimeout(2500);
    const tour = p.locator('[aria-label^="Geführte Tour"]');
    ok(`${w}px Tour sichtbar nach Login`, await tour.first().isVisible().catch(() => false));
    if (w < 700) { const hh = await tour.first().evaluate(e => e.getBoundingClientRect().height); console.log(`   ${w}px Tour-Karte Höhe ${Math.round(hh)} von 850`); await ctx.close(); continue; }
    const nav = p.getByText(/^Personal$/).locator("visible=true").first();
    if (w < 700) { await p.screenshot({ path: "mob-"+w+".png" }); console.log(await p.evaluate(() => [...document.querySelectorAll("button,a")].filter(e=>e.offsetParent&&e.getBoundingClientRect().top>=0&&e.getBoundingClientRect().top<900&&e.getBoundingClientRect().left>=0).map(e=>e.innerText.trim().slice(0,20)).filter(Boolean).slice(0,40).join(" | "))); }
    await nav.click({ timeout: 5000 }).catch(async () => { await p.getByRole("button", { name: /Personal/ }).locator("visible=true").first().click(); });
    await p.waitForTimeout(800);
    await p.getByRole("button", { name: /neue person|person hinzufügen|person anlegen|hinzufügen/i }).locator("visible=true").first().click();
    await p.waitForSelector("#neu-person-vorname", { timeout: 5000 });
    await p.waitForTimeout(300);
    ok(`${w}px Tour ausgeblendet bei offenem Dialog`, !(await tour.first().isVisible().catch(() => false)));
    const vn = "Etag" + w;
    await p.locator("#neu-person-vorname").fill(vn); await p.locator("#neu-person-nachname").fill("Test");
    const btn = p.locator('[role="dialog"][aria-modal="true"]').getByRole("button", { name: /^hinzufügen$/i });
    const hit = await btn.first().evaluate(el => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el.contains(t); });
    ok(`${w}px Hinzufügen nicht verdeckt`, hit);
    await btn.first().click(); await p.waitForTimeout(2500);
    ok(`${w}px Dialog geschlossen`, !(await p.locator('[aria-modal="true"]').count()));
    ok(`${w}px Tour wieder da nach Schließen`, await tour.first().isVisible().catch(() => false));
    ok(`${w}px PUT gesendet`, puts.length > 0);
    const h = puts[puts.length - 1]?.h || {};
    ok(`${w}px PUT trägt ETag im Body`, puts.length > 0 && puts.every(x => { try { return /^[0-9]+$/.test(String(JSON.parse(x.body).etag)); } catch { return false; } }));
    ok(`${w}px alle PUT 200`, antw.length > 0 && antw.every(s => s === 200));
    const lt = (await j("/api/anmelden", { zugangscode: code })).d.token;
    const gespeichert = (await j("/api/bestand", null, lt, "GET"));
    console.log("   in PUT-Body:", puts.some(x=>(x.body||"").includes(vn)), "in GET:", JSON.stringify(gespeichert.d).includes(vn), JSON.stringify(gespeichert.d).length);
    ok(`${w}px Person serverseitig gespeichert`, JSON.stringify(gespeichert.d).includes(vn));
    ok(`${w}px keine Seitenfehler`, errs.length === 0);
    if (errs.length) console.log(errs.join("|").slice(0, 300));
    console.log("   PUT bodies:", puts.map(x=>{try{const o=JSON.parse(x.body);return "etag="+String(o.etag).slice(0,12)+" keys="+Object.keys(o).join("/")}catch{return "?"}}).join(" ; "), "GET:", gespeichert.s, Object.keys(gespeichert.d).join("/").slice(0,100));
    console.log("   PUT-Header:", Object.keys(h).filter(k => /match|etag|auth/i.test(k)).join(","), "Status:", antw.join(","));
    if (w === 1280) {
      /* Konflikt: fremde Änderung per API (gültiger ETag), danach speichert die Oberfläche mit veraltetem ETag */
      const g = await j("/api/bestand", null, lt, "GET");
      const best = g.d.bestand; const mm = best.mandanten[0];
      mm.personen.find(x => x.id === "m1").nachname = "Fremdaenderung";
      const f = await fetch(BASE + "/api/bestand", { method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer " + lt, "x-forwarded-for": "10.9.9.9" }, body: JSON.stringify({ bestand: best, etag: g.d.etag, durch: "fremd" }) });
      ok("1280px fremde Änderung per API angenommen", f.status === 200);
      const n0 = antw.length;
      await p.getByRole("button", { name: /neue person|person hinzufügen|person anlegen|hinzufügen/i }).locator("visible=true").first().click();
      await p.waitForSelector("#neu-person-vorname", { timeout: 5000 });
      await p.locator("#neu-person-vorname").fill("Konflikt"); await p.locator("#neu-person-nachname").fill("Probe");
      await p.locator('[role="dialog"][aria-modal="true"]').getByRole("button", { name: /^hinzufügen$/i }).first().click();
      await p.waitForTimeout(3000);
      ok("1280px UI-Speichern mit veraltetem ETag -> 409", antw.slice(n0).includes(409));
      const txt = await p.evaluate(() => document.body.innerText);
      ok("1280px verständlicher Konflikthinweis sichtbar", /gleichzeitig|geändert|neu laden|aktualisier|Konflikt/i.test(txt));
      console.log("   Hinweis:", txt.split(String.fromCharCode(10)).filter(l => /gleichzeitig|geändert|Konflikt/i.test(l)).join(" // ").slice(0, 200));
      const g2 = await j("/api/bestand", null, lt, "GET");
      ok("1280px Fremdänderung bleibt erhalten (kein stilles Überschreiben)", JSON.stringify(g2.d).includes("Fremdaenderung"));
    }
    await ctx.close();
  }
  await b.close();
} finally { srv.kill(); }
const bad = erg.filter(x => !x[1]);
console.log(`\n${erg.length - bad.length}/${erg.length} bestanden`);
process.exit(bad.length ? 1 : 0);

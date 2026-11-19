/* global document, window, innerHeight, innerWidth, getComputedStyle */
/* Bereichs-Sweep (lokal, Wegwerfdaten): geht je Rolle alle Navigationsziele durch
   und prüft je Breite (1280/768/375/320) und Thema (hell/dunkel):
   Seitenfehler, Konsolenfehler, Querscroll, dauerhaftes „Lädt …", leere Bereiche,
   zu kleine Touchziele (<40 px) auf dem Telefon, offene Dialoge ohne Fokus.
   Aufruf: npx vite build; node pruefungen/browser/bereiche.mjs [rollen] [breiten]
   Voraussetzung: playwright-core + Edge. Schreibt Bilder nach $BILDER (optional). */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = Number(process.env.PORT || 3194), BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "lokal-admin-" + Math.random().toString(36).slice(2), RAUM = "lokal-sweep";
const ROLLEN = (process.argv[2] || "leitung,mitarbeiter,planer,betreiber").split(",");
const BREITEN = (process.argv[3] || "1280,375").split(",").map(Number);
const THEMEN = (process.env.THEMEN || "light,dark").split(",");
const BILDER = process.env.BILDER || null;
if (BILDER) await mkdir(BILDER, { recursive: true });

const daten = await mkdtemp(path.join(tmpdir(), "centric-sweep-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: ADMIN, CENTRIC_PFEFFER: "lokal-pfeffer", CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development", ...(process.env.DEMO ? { CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } : {}) } });
let xz = 0;
const j = async (p, b, t) => { const a = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.8.0.${++xz}`, ...(t ? { authorization: "Bearer " + t } : {}) }, body: JSON.stringify(b) }); return { s: a.status, d: await a.json().catch(() => ({})) }; };
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch { /* warten */ } await new Promise((r) => setTimeout(r, 200)); }

const befunde = [];
const melde = (k, text) => { befunde.push({ k, text }); console.log(`BEFUND [${k}] ${text}`); };
let geprueft = 0;
try {
  const e = await j("/einrichten", { verwaltung: ADMIN, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
  const betreiberCode = e.d.zugangscode;
  const bt = (await j("/api/anmelden", { zugangscode: betreiberCode })).d.token;
  let codes;
  const b = await chromium.launch({ channel: "msedge" });
  if (process.env.DEMO) {
    /* Gefüllter Betrieb: Der Betreiber legt über die Oberfläche den Demo-Bestand an (wie im Betrieb). */
    const cx = await b.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: "block" });
    const pg = await cx.newPage();
    await pg.goto(BASE + "/", { waitUntil: "networkidle" });
    await pg.locator("input").first().fill(betreiberCode);
    await pg.getByRole("button", { name: /anmelden/i }).first().click();
    await pg.getByRole("button", { name: /Demo-Bestand anlegen/ }).click({ timeout: 15000 });
    await pg.waitForTimeout(4000);
    await cx.close();
    const g = await fetch(BASE + "/api/bestand", { headers: { authorization: "Bearer " + bt, "x-forwarded-for": "10.8.1.1" } }).then((r) => r.json());
    const mm = ((g.bestand || {}).mandanten || [])[0];
    if (!mm) { console.log("ABBRUCH: Demo-Bestand nicht angelegt", JSON.stringify(g).slice(0, 200)); process.exit(3); }
    const von = (r) => (mm.personen.find((x) => x.rolle === r && x.status !== "inaktiv") || {}).id;
    const zz = await j("/api/zugaenge", { bestand: RAUM, eintraege: [
      { rolle: "leitung", personId: von("leitung"), name: "L" }, { rolle: "planer", personId: von("planer") || von("leitung"), name: "P" },
      { rolle: "mitarbeiter", personId: von("mitarbeiter"), name: "M" }] }, bt);
    if (!zz.d.zugaenge) { console.log("ABBRUCH: Zugänge", JSON.stringify(zz.d).slice(0, 200)); process.exit(3); }
    codes = { leitung: zz.d.zugaenge[0].code, planer: zz.d.zugaenge[1].code, mitarbeiter: zz.d.zugaenge[2].code, betreiber: betreiberCode };
  } else {
  const person = (id, r, vn) => ({ id, vorname: vn, nachname: "Sweep", rolle: r, bereich: "ALLE", status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
  const { baueLeerenBetrieb } = await import("file:///" + WT + "/server/lib/leerbetrieb.mjs");
  const voll = baueLeerenBetrieb({ name: "Sweep Betrieb", branche: "pflege", email: null, land: "DE", raum: RAUM, laeuftAb: null });
  voll.mandanten[0].personen = [person("l", "leitung", "Lena"), person("p", "planer", "Paul"), person("m1", "mitarbeiter", "Mia"), person("m2", "mitarbeiter", "Max")];
  await j("/api/bestand-anlegen", { inhalt: voll }, bt);
  const z = await j("/api/zugaenge", { bestand: RAUM, eintraege: [
    { rolle: "leitung", personId: "l", name: "Lena" }, { rolle: "planer", personId: "p", name: "Paul" }, { rolle: "mitarbeiter", personId: "m1", name: "Mia" }] }, bt);
  codes = { leitung: z.d.zugaenge[0].code, planer: z.d.zugaenge[1].code, mitarbeiter: z.d.zugaenge[2].code, betreiber: betreiberCode };

  }
  for (const rolle of ROLLEN) for (const w of BREITEN) for (const thema of THEMEN) {
    const ctx = await b.newContext({ viewport: { width: w, height: 850 }, serviceWorkers: "block", colorScheme: thema, hasTouch: w < 700 });
    const p = await ctx.newPage();
    let akt = "Anmeldung"; const fehler = new Set();
    p.on("pageerror", (x) => fehler.add(`${akt}: pageerror ${String(x).slice(0, 120)}`));
    p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) fehler.add(`${akt}: console ${m.text().slice(0, 120)}`); });
    const marke = `${rolle}@${w}/${thema}`;
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.locator("input").first().fill(codes[rolle]);
    await p.getByRole("button", { name: /anmelden/i }).first().click();
    await p.locator(".bpille, .tabbar button, .m-tabs button").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1500);
    /* Tour stört die Messung der Bereiche: einklappen/schließen falls offen */
    const schliessen = p.locator('[aria-label="Tour schließen"]');
    /* Standard: Tour bleibt offen wie beim echten Erstanmelden (TOUR=zu schließt sie) */
    if (process.env.TOUR === "zu" && await schliessen.count()) await schliessen.first().click().catch(() => {});
    await p.waitForTimeout(300);
    /* Navigation: Bereichspillen (.bpille, nur breit) und Unterreiter (.utab); schmal: Menüknopf */
    const messen = async (akt0) => {
      akt = akt0; geprueft++;
      const m = await p.evaluate(() => {
        const dok = document.documentElement; const vw = window.innerWidth;
        const haupt = document.querySelector("main") || document.body;
        const txt = (haupt.innerText || "").trim();
        const klein = [...document.querySelectorAll("button, a[href], input, select, [role=button]")]
          .filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && (r.height < 40 || r.width < 40)).length;
        /* Kontrast: Text gegen den ersten deckenden Hintergrund darüber (Verläufe/Bilder werden übersprungen) */
        const rgb = (c) => { const m2 = /rgba?\(([^)]+)\)/.exec(c); if (!m2) return null; const t = m2[1].split(",").map((x) => parseFloat(x)); return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 }; };
        const lum = (c) => { const k = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2]; };
        const grund = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none") return null; const c = rgb(cs.backgroundColor); if (c && c.a >= 0.95) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
        /* Zugänglichkeit (grobe Näherung, ersetzt kein axe): Namen, Labels, doppelte IDs, Überschriften, Sprache */
        const sichtbar = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
        const name = (e) => (e.getAttribute("aria-label") || "").trim() || (e.getAttribute("aria-labelledby") && (document.getElementById(e.getAttribute("aria-labelledby")) || {}).innerText) || (e.innerText || "").trim() || (e.getAttribute("title") || "").trim() || (e.querySelector("img[alt]") ? "x" : "") || ((e.labels && e.labels.length) ? "x" : "") || (e.getAttribute("placeholder") || "").trim();
        const ohneName = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab]")].filter((e) => sichtbar(e) && !name(e)).length;
        const ids = {}; let doppelt = 0; for (const e of document.querySelectorAll("[id]")) { if (ids[e.id]) doppelt++; ids[e.id] = 1; }
        const ueb = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(sichtbar).map((h) => Number(h.tagName[1])); let sprung = 0; for (let i = 1; i < ueb.length; i++) if (ueb[i] - ueb[i - 1] > 1) sprung++;
        const eins = ueb.filter((x) => x === 1).length;
        const probe = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=switch], [role=tab]")].filter((e) => sichtbar(e) && !name(e)).slice(0, 3).map((e) => e.tagName + "." + String(e.className || "").slice(0, 16) + "[" + (e.getAttribute("type") || "") + "]" + (e.parentElement ? " in " + e.parentElement.outerHTML.slice(0, 160).split(String.fromCharCode(10)).join(" ") : "")).join(" ; ");
        const uebFolge = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(sichtbar).slice(0, 6).map((h) => h.tagName + ":" + (h.innerText || "").trim().slice(0, 14)).join(" > ");
        const a11y = { ohneName, doppelt, sprung, eins: eins === 1 ? 0 : 1, lang: document.documentElement.lang ? 0 : 1, landmark: document.querySelector("main") ? 0 : 1, info: ohneName ? probe : sprung ? uebFolge : "" };
        let schwach = 0; const beispiele = [];
        for (const e of document.querySelectorAll("main *, header *, nav *")) {
          if (!e.offsetParent || e.closest("svg")) continue;
          const eigen = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
          if (!eigen) continue;
          const cs = getComputedStyle(e); if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.5) continue;
          const fg = rgb(cs.color), bg = grund(e); if (!fg || !bg || fg.a < 0.5) continue;
          const l1 = lum(fg), l2 = lum(bg); const v = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const gross = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
          if (v < (gross ? 3 : 4.5) && !e.closest("[disabled]") && !e.closest("[aria-disabled='true']")) { schwach++; if (beispiele.length < 3) beispiele.push((e.innerText || "").trim().slice(0, 24) + " " + v.toFixed(1) + " <" + e.tagName + "." + String(e.className || "").slice(0, 30) + "> fg=" + cs.color + " bg=" + bg.r + "," + bg.g + "," + bg.b); }
        }
        return { quer: dok.scrollWidth - vw, lang: txt.length, laedt: /(Lädt|Wird geladen)\s*(\.\.\.|…)/.test(txt), klein, schwach, beispiele, a11y };
      });
      if (m.quer > 1) {
        const process_env_kette = !!process.env.KETTE;
        const taeter = await p.evaluate((process_env_kette) => { const vw = window.innerWidth; const o = []; const geklemmt = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const ov = getComputedStyle(a).overflowX; if (ov === "auto" || ov === "scroll" || ov === "hidden") return true; } return false; }; for (const e of document.querySelectorAll("body *")) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 1 && !geklemmt(e)) o.push({ r: Math.round(r.right), t: e.tagName + "." + String(e.className || "").slice(0, 24) + "[" + (e.innerText || "").trim().slice(0, 18).split(String.fromCharCode(10))[0] + "] pos=" + getComputedStyle(e).position }); } if (!o.length) { for (const e of document.querySelectorAll("body *")) { const rr = e.getBoundingClientRect(); const ps = getComputedStyle(e).position; if (rr.width > 0 && rr.right > vw + 1 && (ps === "absolute" || ps === "fixed")) o.push({ r: Math.round(rr.right), t: "ABS " + e.tagName + "." + String(e.className || "").slice(0, 24) + "[" + (e.innerText || "").trim().slice(0, 18).split(String.fromCharCode(10))[0] + "] w=" + Math.round(rr.width) + " st=" + (e.getAttribute("style") || "").slice(0, 80) }); }
          for (const e of document.querySelectorAll("body *")) { if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && e.clientWidth > 0) o.push({ r: e.scrollWidth, t: "SB " + e.tagName + "." + String(e.className || "").slice(0, 24) + "[" + (e.innerText || "").trim().slice(0, 18).split(String.fromCharCode(10))[0] + "] cw=" + e.clientWidth }); } } const first = [...document.querySelectorAll("body *")].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && !geklemmt(e); }); let kette = ""; if (process_env_kette && first) { for (let e = first; e && e !== document.body; e = e.parentElement) kette += " < " + e.tagName + "." + String(e.className || "").slice(0, 14) + " w" + Math.round(e.getBoundingClientRect().width) + "/" + (e.getAttribute("style") || "").slice(0, 60); } return o.sort((x, y) => y.r - x.r).slice(0, 3).map((x) => x.r + " " + x.t).join(" ; ") + kette; }, process_env_kette);
        melde("querscroll", `${akt}: Seite ${m.quer}px breiter als Fenster — ${taeter}`);
      }
      if (m.laedt) { await p.waitForTimeout(3000); const noch = await p.evaluate(() => /(Lädt|Wird geladen)\s*(\.\.\.|…)/.test((document.querySelector("main") || document.body).innerText)); if (noch) melde("haengt-in-laden", `${akt}: „Lädt …“ nach 4 s noch sichtbar`); }
      if (m.schwach > 0) melde("kontrast", `${akt}: ${m.schwach} Textstellen unter WCAG-Kontrast (z. B. ${m.beispiele.join("; ")})`);
      { const z = Object.entries(m.a11y).filter(([k, v]) => k !== "info" && v > 0).map(([k, v]) => k + "=" + v); if (z.length) melde("a11y", `${akt}: ${z.join(", ")} ${m.a11y.info}`); }
      if (m.lang < 20) melde("leer", `${akt}: Bereich praktisch leer (${m.lang} Zeichen)`);
      if (w < 700 && m.klein > 12) melde("touchziele", `${akt}: ${m.klein} Bedienelemente kleiner als 40 px`);
      if (await p.locator('[aria-modal="true"]').count()) { melde("dialog-offen", `${akt}: beim Öffnen der Ansicht steht ein Dialog offen (${(await p.locator('[aria-modal="true"]').first().getAttribute("aria-label")) || "ohne Titel"})`); await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
      if (BILDER) await p.screenshot({ path: path.join(BILDER, `${rolle}-${w}-${thema}-${akt0.split(" ").slice(1).join("_").replace(/[^a-z0-9_]+/gi, "")}.png`) }).catch(() => {});
    };
    const texte = async (sel) => p.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => e.offsetParent).map((e) => (e.innerText || "").trim().split(String.fromCharCode(10)).filter(Boolean).reverse().join(" ")), sel);
    try {
      const gruppen = await texte(".bpille");
      if (!gruppen.length) {
        /* Schmale Ansicht: untere Leiste (.tabbar) bzw. Mobilschale (.m-tabs) */
        const sel = (await p.locator(".m-tabs button:visible").count()) ? ".m-tabs button" : ".tabbar button";
        const leiste = await texte(sel);
        if (!leiste.length) melde("keine-navigation", `${marke}: weder Bereichspillen noch untere Leiste sichtbar`);
        for (let ti = 0; ti < leiste.length; ti++) {
          if (/(Post|Krank)/.test(leiste[ti])) continue;   // öffnen Dialoge, eigener Test
          await p.locator(sel + ":visible").nth(ti).click({ timeout: 4000 }).catch(() => melde("klick", `${marke} ${leiste[ti]}: Klick scheitert`));
          await p.waitForTimeout(1300);
          await messen(`${marke} ${leiste[ti]}`);
        }
        /* Schublade: alle Ansichten der Seitenleiste */
        const anzahlSl = await p.evaluate(() => document.querySelectorAll(".seitenleiste .slink").length);
        for (let si = 0; si < anzahlSl; si++) {
          if (!(await p.locator(".seitenleiste.offen").count())) await p.locator("header button").first().click({ timeout: 3000 }).catch((x) => melde("klick", `${marke} Menüknopf: Klick scheitert (${String(x).split(String.fromCharCode(10)).filter((l) => /intercepts|outside|not visible|detached/.test(l)).join(" ").slice(0, 200)})`));
          await p.waitForTimeout(400);
          const name = await p.evaluate((i) => ((document.querySelectorAll(".seitenleiste .slink")[i] || {}).innerText || "").trim().split(String.fromCharCode(10))[0], si);
          if (si === 0) await messen(`${marke} Schublade offen`);
          await p.locator(".seitenleiste .slink").nth(si).click({ timeout: 3000 }).catch(() => melde("klick", `${marke} Schublade/${name}: Klick scheitert`));
          await p.waitForTimeout(1200);
          await messen(`${marke} Schublade/${name}`);
        }
      }
      for (let gi = 0; gi < gruppen.length; gi++) {
        if (gi === 0) { const r1 = await p.locator(".bpille:visible").nth(0).boundingBox(); await p.waitForTimeout(300); const r2 = await p.locator(".bpille:visible").nth(0).boundingBox(); if (r1 && r2 && (Math.abs(r1.x - r2.x) > 0.5 || Math.abs(r1.y - r2.y) > 0.5 || Math.abs(r1.width - r2.width) > 0.5)) melde("layout-unruhig", `${marke}: Bereichspille wandert (${JSON.stringify(r1)} -> ${JSON.stringify(r2)})`); }
        await p.locator(".bpille:visible").nth(gi).click({ timeout: 4000 }).catch((x) => melde("klick", `${marke} Gruppe ${gruppen[gi]}: Klick scheitert (${String(x).split(String.fromCharCode(10)).filter((l) => /intercepts|outside|not visible/.test(l)).join(" ").slice(0, 160)})`));
        await p.waitForTimeout(500);
        const tabs = await texte(".utab");
        for (let ti = 0; ti < tabs.length; ti++) {
          const t0 = Date.now();
          await p.locator(".utab:visible").nth(ti).click({ timeout: 15000 }).catch(() => melde("klick", `${marke} ${gruppen[gi]}/${tabs[ti]}: Klick scheitert`));
          const dauer = Date.now() - t0; if (dauer > 3500) melde("langsam", `${marke} ${gruppen[gi]}/${tabs[ti]}: Klick bis bedienbar ${dauer} ms`);
          await p.waitForTimeout(1300);
          await messen(`${marke} ${gruppen[gi]}/${tabs[ti]}`);
        }
      }
    } catch (x) { melde("absturz", `${akt}: ${String(x).slice(0, 100)}`); }
    for (const f of fehler) melde("fehler", f);
    await ctx.close();
  }
  await b.close();
} finally { srv.kill(); }
const nach = {};
for (const x of befunde) nach[x.k] = (nach[x.k] || 0) + 1;
console.log(`\nBereiche geprüft: ${geprueft}; Befunde: ${befunde.length}`, JSON.stringify(nach));
process.exit(befunde.length ? 1 : 0);

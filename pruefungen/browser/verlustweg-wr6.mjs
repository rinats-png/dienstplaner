/* global document, window, localStorage, sessionStorage, getComputedStyle */
/* WR-6 (lokal, manuell, Wegwerfdaten): Oberfläche der Kontowiederherstellung am Telefon.
   Der Server liefert nur die Seite (127.0.0.1, Zufallsschlüssel, frischer Datenordner, erfundene Demo-Daten). Die Antworten
   von /api/anmelden stellt der Browser selbst (page.route) mit ERFUNDENEN Werten — so lässt sich jeder Schritt zeigen, ohne
   dass der Verlustweg auf einem Server eingeschaltet sein muss. Gemessen wird je Viewport (360x740, 390x844, 430x932) und
   Schritt: Querscrollen der Seite, Ziele unter 24 px (WCAG 2.5.8), Fehlertext sichtbar; dazu: Eingaben nach dem Absenden leer,
   nichts im Speicher des Browsers, Adresse unverändert, nach Sperre (403) Knöpfe deaktiviert und neutraler Text.
   Aufruf:  npx vite build ; node pruefungen/browser/verlustweg-wr6.mjs
   Umgebung (optional): WR6_DIST=<Ordner mit dem Bauergebnis>  WR6_KANAL=msedge  WR6_BILDER=<Ordner>  PORT
   Kein CI-Bestandteil. */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GERAETE_VIEWPORTS, ZIEL_MINDEST } from "../../src/ui/geraete.js";
import { messeSeite } from "./geraete-messung.mjs";

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..").split(path.sep).join("/");
const PORT = Number(process.env.PORT || 3233), BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = GERAETE_VIEWPORTS.filter((v) => v.art === "telefon");
const FALL = "F-ABCDEFGH23456789";
const TOKEN = "Zk3_" + "a".repeat(19) + "B".repeat(18) + "-9";           // 43 Zeichen, erfunden
const CODES = Array.from({ length: 10 }, (_, i) => `ABCD-EFG${(i % 8) + 2}-JKLM`);
const ZUGANG = "TEST-ZUGANG-0001";

const daten = await mkdtemp(path.join(tmpdir(), "centric-wr6-"));
const srv = spawn(process.execPath, ["server.mjs"], { cwd: WT, stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: process.env.WR6_DIST || WT + "/dist", CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien",
    CENTRIC_ADMIN: "lokal-admin-" + Math.random().toString(36).slice(2), CENTRIC_PFEFFER: "lokal-pfeffer", NODE_ENV: "development",
    CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });
for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/gesund")).ok) break; } catch { /* startet noch */ } await new Promise((r) => setTimeout(r, 200)); }

const zeilen = [];
const kurz = (x) => String(x && x.message ? x.message : x).split("\n")[0].slice(0, 140);

/** Antworten des Servers, erfunden. `modus`: "an" (Verlustweg eingeschaltet) oder "aus" (403 wie ausgeliefert). */
function antworten(modus, aufrufe) {
  return async (route) => {
    const req = route.request();
    let b = {}; try { b = JSON.parse(req.postData() || "{}"); } catch { /* leer */ }
    aufrufe.push(b);
    const json = (status, d) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(d) });
    const a = b.zweifaktorAktion;
    if (!a) return json(401, { fehler: "Für diesen Zugang ist ein zweiter Faktor eingerichtet. Bitte den Code aus der App eingeben.", zweifaktor: "erforderlich" });
    if (a.startsWith("verlust-") && modus === "aus") return json(403, { fehler: "Der Verlustweg ist auf diesem Server nicht freigeschaltet.", zweifaktor: "gesperrt" });
    if (a === "verlust-melden") return json(200, { ok: true, fall: FALL, gueltigBis: "2026-11-12T10:00:00.000Z" });
    if (a === "verlust-zurueckziehen") return json(200, { ok: true });
    if (a === "verlust-einloesen") return b.freigabe === TOKEN
      ? json(200, { ok: true, geheimnis: "JBSWY3DPEHPK3PXP", otpauth: "otpauth://totp/CENTRIC:test?secret=JBSWY3DPEHPK3PXP&issuer=CENTRIC" })
      : json(401, { fehler: "Die Freigabe stimmt nicht oder gilt nicht mehr.", verlust: "falsch" });
    if (a === "bestaetigen") return json(200, { ok: true, wiederherstellung: CODES });
    if (a === "verlust-freigeben") {
      if (b.personalnummer === "FALSCH") return json(403, { fehler: "Diese Freigabe ist nicht möglich.", verlust: "nein" });
      const traeger = { vorname: "Erika", nachname: "Musterfrau", einheit: "Station 3" };
      return b.aktenzeichen === "ZWEITE" ? json(200, { ok: true, stand: "freigegeben", traeger, freigabe: TOKEN, gueltigBis: "2026-11-11T10:15:00.000Z" })
        : json(200, { ok: true, stand: "teilfreigegeben", traeger });
    }
    if (a === "verlust-ablehnen") return json(200, { ok: true, stand: "abgelehnt", traeger: { vorname: "Erika", nachname: "Musterfrau", einheit: "Station 3" } });
    return json(400, { fehler: "Unbekannte Aktion." });
  };
}

async function messen(pg, vp, schritt, extra = {}) {
  const m = await pg.evaluate(messeSeite, ZIEL_MINDEST);
  if (process.env.WR6_BILDER && vp.w === 360) await pg.screenshot({ path: `${process.env.WR6_BILDER}/wr6-${vp.w}-${String(zeilen.length).padStart(2, "0")}.png`, fullPage: true }).catch(() => {});
  const quer = m.doc > m.fenster || m.body > m.fenster;
  /* Die Fußzeile der Anmeldeseite (RechtLeiste: Impressum, AGB …) gehört nicht zu WR-6; ihre zu kleinen Ziele am 430-px-Fenster
     stehen getrennt als "vorbestehend" in der Ausgabe und lassen die Messung nicht scheitern. */
  /* Kleinste bedienbare Fläche innerhalb der neuen Bereiche (Knöpfe, Felder, Auswahlfelder samt Beschriftung). */
  const eigenKlein = await pg.evaluate(() => {
    const w = [];
    for (const e of document.querySelectorAll("[data-verlustweg] button:not([disabled]), [data-verlustweg] input:not([disabled]):not([type=radio])")) {
      const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) w.push([r.width, r.height]);
    }
    for (const e of document.querySelectorAll("[data-verlustweg] input[type=radio]")) {
      const r = (e.closest("label") || e).getBoundingClientRect(); if (r.width > 0 && r.height > 0) w.push([r.width, r.height]);
    }
    return w.length ? [Math.round(Math.min(...w.map((x) => x[0]))), Math.round(Math.min(...w.map((x) => x[1])))] : null;
  });
  const FUSS = /^button|(Impressum|Datenschutz|Allgemeine Gesch|Nutzungsbed|Widerruf|Barrierefreiheit)/;
  const eigene = m.zuKleinListe.filter((x) => !FUSS.test(x));
  const vorbestehend = m.zuKleinListe.length - eigene.length;
  zeilen.push({ vp: `${vp.w}x${vp.h}`, schritt, quer, doc: m.doc, fenster: m.fenster, ziele: m.ziele, kleinstes: `${m.kleinsteBreite}x${m.kleinsteHoehe}`,
    zuKlein: eigene.length, vorbestehend, zuKleinListe: eigene, ragt: m.ragtOben, eigenKlein, ok: !quer && eigene.length === 0 && m.ragtOben.length === 0 && !extra.fehler, ...extra });
}
const pruefe = (vp, schritt, ok, fehler) => zeilen.push({ vp: `${vp.w}x${vp.h}`, schritt, ok, ...(ok ? {} : { fehler }) });

async function lauf(b, vp) {
  const cx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, serviceWorkers: "block", hasTouch: true, isMobile: false });
  const pg = await cx.newPage();
  const seitenfehler = []; pg.on("pageerror", (x) => seitenfehler.push(kurz(x)));
  const konsole = []; pg.on("console", (x) => { if (x.type() === "log" || x.type() === "debug" || x.type() === "info") konsole.push(x.text().slice(0, 80)); });
  const aufrufe = [];
  let modus = "an";
  await pg.route("**/api/anmelden", (route) => antworten(modus, aufrufe)(route));
  await pg.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
  const feld = pg.locator("#code");
  /* Die Startsequenz liegt zuerst über der Seite; danach zeigt sie das Codefeld oder die Testzugänge mit dem Verweis. */
  const sichtbar = await feld.waitFor({ state: "visible", timeout: 12000 }).then(() => true, () => false);
  if (!sichtbar) {
    const kn = pg.locator("button", { hasText: "Ich habe einen Zugangscode" }).first();
    await kn.waitFor({ state: "attached", timeout: 30000 });
    await kn.evaluate((e) => e.click());
  }
  await feld.fill(ZUGANG, { timeout: 30000 });
  await pg.getByRole("button", { name: /^Anmelden$/ }).click();
  const verweis = pg.getByRole("button", { name: /Gerät oder Wiederherstellungscodes verloren/ });
  await verweis.waitFor({ state: "visible", timeout: 15000 });
  await messen(pg, vp, "Anmeldemaske: Code aus der App verlangt, Verweis sichtbar");
  const ziel = await verweis.evaluate((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  pruefe(vp, "Verweis mindestens 24 px", ziel[1] >= ZIEL_MINDEST && ziel[0] >= ZIEL_MINDEST, `Verweis ${ziel.join("x")}`);
  await verweis.click();
  const form = pg.locator("#verlust-traeger form");
  await form.waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Träger: Antrag, Formular aufgeklappt");

  const wertLeer = async (loc) => (await loc.inputValue()) === "";
  const zc = form.getByLabel(/^Zugangscode/);
  /* Antrag stellen */
  await zc.fill(ZUGANG);
  await form.getByRole("button", { name: "Antrag stellen", exact: true }).click();
  await pg.getByText(FALL).waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Träger: Fallnummer, Frist, nächste Schritte");
  pruefe(vp, "Zugangscode nach dem Absenden leer", await wertLeer(zc), "Zugangscode blieb stehen");
  /* Zurückziehen */
  await form.getByLabel("Antrag zurückziehen").check();
  await zc.fill(ZUGANG);
  await form.getByRole("button", { name: "Antrag zurückziehen", exact: true }).click();
  await pg.getByText("Der Antrag ist zurückgezogen.").waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Träger: zurückgezogen");
  /* Einlösen mit falschem Token: neutraler Fehler im Bild; dann richtig */
  await form.getByLabel(/Freigabe einlösen/).check();
  await zc.fill(ZUGANG);
  await form.getByLabel(/^Abschlusstoken/).fill("x".repeat(43));
  await form.getByRole("button", { name: "Freigabe einlösen", exact: true }).click();
  const fehler = pg.getByText("Die Freigabe stimmt nicht oder gilt nicht mehr.").first();
  await fehler.waitFor({ state: "visible", timeout: 5000 });
  const imBild = await fehler.evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; });
  await messen(pg, vp, "Träger: Fehlertext (neutral) sichtbar", { fehler: imBild ? null : "Fehlertext ragt aus dem Bild" });
  pruefe(vp, "Token nach dem Absenden leer", await wertLeer(form.getByLabel(/^Abschlusstoken/)), "Token blieb stehen");
  await zc.fill(ZUGANG);
  await form.getByLabel(/^Abschlusstoken/).fill(TOKEN);
  await form.getByRole("button", { name: "Freigabe einlösen", exact: true }).click();
  await pg.getByText("JBSWY3DPEHPK3PXP").first().waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Träger: neues Geheimnis (einmal)");
  /* H1: kein Feld vom Typ password im neuen Weg; Zugangscode und Token sind Textfelder, per CSS verdeckt. */
  const felder = await pg.evaluate(() => { const w = document.querySelector("[data-verlustweg]"); const i = [...w.querySelectorAll("input")];
    const geheim = i.filter((e) => e.classList.contains("verlust-geheim"));
    return { passwort: i.filter((e) => e.type === "password").length, geheim: geheim.length,
      verdeckt: geheim.every((e) => { const cs = getComputedStyle(e); return (cs.webkitTextSecurity || cs.getPropertyValue("-webkit-text-security")) === "disc"; }),
      attribute: i.filter((e) => e.type !== "radio" && e.type !== "checkbox").every((e) => e.getAttribute("autocomplete") === "off" && e.getAttribute("data-lpignore") === "true"
        && e.getAttribute("data-1p-ignore") === "true" && e.getAttribute("data-bwignore") === "true" && !e.name && !e.id) }; });
  pruefe(vp, "H1: kein type=password, Zugangscode verdeckt per CSS, Attribute und keine name/id", felder.passwort === 0 && felder.geheim >= 1 && felder.verdeckt && felder.attribute, JSON.stringify(felder));
  /* M1: das Geheimnis übersteht erneutes Anklicken des Verweises; Schließen und Einklappen sind gesperrt; Verwerfen fragt nach. */
  await verweis.click();
  pruefe(vp, "M1: Geheimnis nach erneutem Klick auf den Verweis noch da", (await pg.getByText("JBSWY3DPEHPK3PXP").count()) > 0, "Geheimnis verschwunden");
  const sperren = await pg.evaluate(() => ({
    schliessen: [...document.querySelectorAll("button")].filter((b) => /Schließen erst nach dem Sichern/.test(b.textContent)).every((b) => b.disabled)
      && [...document.querySelectorAll("button")].some((b) => /Schließen erst nach dem Sichern/.test(b.textContent)),
    umschalter: [...document.querySelectorAll("[data-verlustweg] button[aria-expanded]")].every((b) => b.disabled) }));
  pruefe(vp, "M1: Schließen und Einklappen gesperrt, solange das Geheimnis steht", sperren.schliessen && sperren.umschalter, JSON.stringify(sperren));
  await form.getByRole("button", { name: "Geheimnis verwerfen", exact: true }).click();
  await pg.getByRole("alertdialog").waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Träger: Rückfrage vor dem Verwerfen");
  await pg.getByRole("button", { name: "Zurück", exact: true }).click();
  pruefe(vp, "M1: nach „Zurück“ steht das Geheimnis noch da", (await pg.getByText("JBSWY3DPEHPK3PXP").count()) > 0, "Geheimnis nach Zurück weg");
  /* Bestätigen → neue Wiederherstellungscodes */
  await zc.fill(ZUGANG);
  await form.getByLabel(/^Erster Code aus der App/).fill("123456");
  await form.getByRole("button", { name: "Mit Code bestätigen", exact: true }).click();
  await pg.getByText(CODES[0]).first().waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Träger: neue Wiederherstellungscodes (einmal)");
  pruefe(vp, "M1: Codes ausblenden erst nach dem Häkchen", await pg.getByRole("button", { name: "Codes ausblenden", exact: true }).isDisabled(), "Knopf ohne Häkchen frei");
  pruefe(vp, "Codes nach Ausblenden weg", await (async () => {
    await pg.getByLabel("Ich habe die Codes gesichert.").check();
    await pg.getByRole("button", { name: "Codes ausblenden", exact: true }).click();
    return (await pg.getByText(CODES[0]).count()) === 0 && (await pg.getByText("JBSWY3DPEHPK3PXP").count()) === 0;
  })(), "Codes oder Geheimnis nach dem Ausblenden noch im Dokument");

  /* Leitung */
  await pg.getByRole("button", { name: /Ich bin Leitung und gebe einen Antrag frei/ }).click();
  const fl = pg.locator("#verlust-leitung form");
  await fl.waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Leitung: Formular Freigabe");
  const fuellen = async (pn, az) => {
    await fl.getByLabel(/^Dein Zugangscode/).fill("TEST-LEITUNG-0002");
    await fl.getByLabel(/^Frischer Code/).fill("654321");
    await fl.getByLabel(/^Fallnummer/).fill(FALL);
    await fl.getByLabel(/^Personalnummer/).fill(pn);
    await fl.getByLabel("Rückruf an die hinterlegte Nummer").check();
    if (az) await fl.getByLabel(/^Aktenzeichen/).fill(az);
  };
  await fuellen("FALSCH");
  await fl.getByRole("button", { name: "Antrag freigeben", exact: true }).click();
  await pg.getByText("Diese Freigabe ist nicht möglich.").first().waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Leitung: neutrales Nein im Bild");
  pruefe(vp, "Leitung: Einmalwerte und Personalnummer nach Nein leer",
    (await wertLeer(fl.getByLabel(/^Dein Zugangscode/))) && (await wertLeer(fl.getByLabel(/^Frischer Code/))) && (await wertLeer(fl.getByLabel(/^Personalnummer/))),
    "Eingabe blieb stehen");
  pruefe(vp, "Leitung: keine Person vor dem Erfolg", (await pg.getByText("Erika Musterfrau").count()) === 0, "Person erschien ohne Erfolg");
  await fuellen("P-4711");
  await fl.getByRole("button", { name: "Antrag freigeben", exact: true }).click();
  await pg.getByText(/Deine Freigabe ist gespeichert/).waitFor({ state: "visible", timeout: 5000 });
  pruefe(vp, "Leitung: Person nach Erfolg aus der Antwort", (await pg.getByText(/Erika Musterfrau · Einheit Station 3/).count()) > 0, "Person fehlt nach Erfolg");
  await messen(pg, vp, "Leitung: erste Freigabe, geprüfte Person laut Server");
  pruefe(vp, "Leitung: alle Felder nach Erfolg leer", (await wertLeer(fl.getByLabel(/^Fallnummer/))) && (await wertLeer(fl.getByLabel(/^Personalnummer/))), "Eingabe blieb stehen");
  await fuellen("P-4711", "ZWEITE");
  await fl.getByRole("button", { name: "Antrag freigeben", exact: true }).click();
  await pg.getByText(TOKEN).waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Leitung: zweite Freigabe, Abschlusstoken (einmal)");
  pruefe(vp, "M1: weitere Freigabe bis zum Ausblenden gesperrt", await fl.getByRole("button", { name: "Antrag freigeben", exact: true }).isDisabled(), "Absenden frei");
  await fl.getByRole("button", { name: "Token ausblenden", exact: true }).click();
  await pg.getByRole("button", { name: "Ja, verwerfen", exact: true }).click();
  pruefe(vp, "M1: Token nach Bestätigung weg", (await pg.getByText(TOKEN).count()) === 0, "Token blieb");
  await fl.getByLabel("Antrag ablehnen").check();
  await fl.getByLabel(/^Dein Zugangscode/).fill("TEST-LEITUNG-0002");
  await fl.getByLabel(/^Frischer Code/).fill("654321");
  await fl.getByLabel(/^Fallnummer/).fill(FALL);
  await fl.getByLabel(/^Personalnummer/).fill("P-4711");
  await fl.getByLabel("Sonstiges").check();
  await messen(pg, vp, "Leitung: Ablehnen mit Grund");
  await fl.getByRole("button", { name: "Antrag ablehnen", exact: true }).click();
  await pg.getByText("Der Antrag ist abgelehnt.").waitFor({ state: "visible", timeout: 5000 });
  await messen(pg, vp, "Leitung: abgelehnt");

  /* Sperre: Server antwortet 403 */
  modus = "aus";
  await fl.getByLabel("Antrag freigeben").check();
  await fuellen("P-4711");
  await fl.getByRole("button", { name: "Antrag freigeben", exact: true }).click();
  const neutral = pg.getByText("Dieser Weg steht derzeit nicht zur Verfügung.").first();
  await neutral.waitFor({ state: "visible", timeout: 5000 });
  const gesperrt = await pg.getByRole("button", { name: /Ich habe Gerät und Codes verloren|Ich bin Leitung/ }).evaluateAll((l) => l.every((e) => e.disabled));
  pruefe(vp, "Sperre: beide Einstiege deaktiviert, neutraler Text", gesperrt && (await pg.getByText(/nicht freigeschaltet|Schalter/).count()) === 0, "Einstiege nicht deaktiviert oder Serverwort sichtbar");
  await messen(pg, vp, "Sperre (403): neutrale Meldung, Einstiege deaktiviert");

  /* Nichts im Speicher, Adresse unverändert, keine Konsolenausgabe, keine Seitenfehler */
  const speicher = await pg.evaluate(() => { try { return [localStorage.length, sessionStorage.length, JSON.stringify({ ...localStorage, ...sessionStorage })]; } catch { return [0, 0, ""]; } });
  const roh = speicher[2];
  pruefe(vp, "Kein Geheimnis im Speicher des Browsers", [TOKEN, FALL, "JBSWY3DPEHPK3PXP", CODES[0], "P-4711", ZUGANG].every((w) => !roh.includes(w)), "Einmalwert im Speicher");
  const url = new URL(pg.url());
  pruefe(vp, "Adresse ohne Parameter", url.search === "" && url.hash === "", `Adresse ${url.search}${url.hash}`);
  pruefe(vp, "Keine Konsolenausgabe mit Einmalwerten", !konsole.some((t) => [TOKEN, FALL, "JBSWY3DP", CODES[0], ZUGANG].some((w) => t.includes(w))), "Ausgabe: " + konsole.join("|"));
  pruefe(vp, "Keine Seitenfehler", seitenfehler.length === 0, seitenfehler.join("|"));
  const falsche = aufrufe.filter((a) => a.zweifaktorAktion && a.zweifaktorAktion.startsWith("verlust-freigeben") && a.zugangscode === ZUGANG);
  pruefe(vp, "Freigabe trägt eigenen Zugangscode, nie den des Antragstellers", falsche.length === 0, "falscher Zugangscode in der Freigabe");
  if (process.env.WR6_BILDER) await pg.screenshot({ path: `${process.env.WR6_BILDER}/wr6-${vp.w}.png`, fullPage: true }).catch(() => {});
  await cx.close();
}

const b = await chromium.launch(process.env.WR6_KANAL ? { channel: process.env.WR6_KANAL } : {});
try {
  for (const vp of VIEWPORTS) {
    try { await lauf(b, vp); } catch (x) { zeilen.push({ vp: `${vp.w}x${vp.h}`, schritt: "Ablauf", ok: false, fehler: kurz(x) }); }
  }
} finally { await b.close(); srv.kill(); }

for (const z of zeilen) {
  const kennzahl = z.doc !== undefined ? ` | Seite ${z.doc}/${z.fenster} px, Ziele ${z.ziele}, kleinstes ${z.kleinstes}, zu klein ${z.zuKlein}${z.eigenKlein ? `, kleinstes eigenes Ziel ${z.eigenKlein.join("x")}` : ""}${z.vorbestehend ? ` (+${z.vorbestehend} vorbestehend in der Fußzeile)` : ""}` : "";
  console.log(`${z.ok ? "ok  " : "FEHL"} ${z.vp} ${z.schritt}${kennzahl}${z.ok ? "" : " | " + (z.fehler || (z.quer ? "Seite quer" : "") + " " + (z.zuKleinListe || []).join(",") + " " + (z.ragt || []).join(","))}`);
}
const schlecht = zeilen.filter((z) => !z.ok);
const messzeilen = zeilen.filter((z) => z.doc !== undefined);
console.log(`\n${zeilen.length} Zeilen, ${messzeilen.length} Messungen, ${schlecht.length} nicht bestanden; ` +
  `Seite quer: ${messzeilen.filter((z) => z.quer).length}; Ziele unter ${ZIEL_MINDEST} px: ${messzeilen.reduce((s, z) => s + z.zuKlein, 0)}`);
process.exit(schlecht.length ? 1 : 0);

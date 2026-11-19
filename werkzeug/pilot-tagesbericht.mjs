#!/usr/bin/env node
/* ==========================================================================
   PILOT-TAGESBERICHT — Rohtext aus lokaler Fehlerliste und Kennzahl-Eingaben

   Aufruf:
     node werkzeug/pilot-tagesbericht.mjs --fehler <datei.json|datei.csv>
          [--kennzahlen <datei.json>] [--tag 1..14] [--datum JJJJ-MM-TT]
          [--pilot A|B] [--form intern|geschlossen]

   Eigenschaften (docs/acc45/PILOT-BETRIEBSKONZEPT.md, Abschnitt 3 und 4):
     - Kein Netz, keine Umgebungsvariablen, keine Zugangsdaten. Liest nur die
       beiden übergebenen lokalen Dateien und schreibt den Bericht auf stdout.
     - Keine erfundenen Zahlen: Schwellen und Reaktionsziele stehen nur dann
       im Bericht, wenn sie in der Kennzahl-Datei vorgegeben wurden.
     - Keine Personendaten: Aus der Fehlerliste werden nur feste Felder gelesen
       (id, titel, prioritaet, status, szenario, bereich, pilot, geoeffnet,
       reaktion, behoben). Alles andere wird weder ausgegeben noch behalten.
       Enthält ein gelesenes Feld etwas, das wie eine Mailadresse,
       Telefonnummer, IP-Adresse oder Weblink aussieht, bricht das Werkzeug
       ab (Exit 3) und nennt nur Fehler-ID und Feldname, nie den Wert.
     - Der Bericht ist Rohtext zum Weiterbearbeiten, keine Bewertung. Er
       nennt Stopp-Prüfungen (offene P0, kritischer Zustand), entscheidet
       aber nichts.

   Fehlerliste (JSON: Feld-Array oder {"fehler":[…]}; CSV: Kopfzeile, Trenner
   ; oder ,):
     prioritaet  P0 | P1 | P2 | P3
     status      offen | in-arbeit | behoben | verifiziert | zurueckgestellt | abgelehnt
     geoeffnet / reaktion / behoben   ISO-Datum (JJJJ-MM-TT) oder -Zeit

   Kennzahl-Datei (JSON, alles optional):
     { "kennzahlen": [ { "id":"P1", "name":"…", "wert":12, "einheit":"min",
                         "basis":20, "schwelle":15, "richtung":"sinkt|steigt" } ],
       "szenarien":  { "PS-P-01":"bestanden|abweichend|blockiert|offen|nicht-ausfuehrbar" },
       "monitoring": { "gesund":"ok|warnung|kritisch", "sicherung_alter_h":5,
                       "fehler_5xx_15min":0, "bemerkung":"…" },
       "ziele":      { "P0": { "reaktion_h": 1, "behebung_h": 24 }, … } }

   Exit: 0 Bericht erzeugt · 2 falscher Aufruf oder unlesbare Eingabe ·
         3 Personendaten-Muster in der Fehlerliste gefunden.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PRIOS = ["P0", "P1", "P2", "P3"];
export const STATI = ["offen", "in-arbeit", "behoben", "verifiziert", "zurueckgestellt", "abgelehnt"];
export const SZEN_STATI = ["bestanden", "abweichend", "blockiert", "offen", "nicht-ausfuehrbar"];
const FELDER = ["id", "titel", "prioritaet", "status", "szenario", "bereich", "pilot", "geoeffnet", "reaktion", "behoben"];
const OFFEN = new Set(["offen", "in-arbeit"]);

export class EingabeFehler extends Error {
  constructor(msg, code = 2) { super(msg); this.code = code; }
}

/* Muster, die in einer Fehlerliste nichts verloren haben. Bewusst grob:
   lieber einmal zu oft anhalten als Personendaten in einen Bericht lassen. */
const PERSONENMUSTER = [
  ["Mailadresse", /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/],
  ["IP-Adresse", /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/],
  ["Weblink", /\bhttps?:\/\/|\bwww\./i],
  ["Telefonnummer", /(?<![\w-])(?:\+\d{1,3}|\(?0\d{2,5}\)?)(?:[\s/-]?\d){6,}/],
];

/* ---------- Einlesen ---------- */

const ohneBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);

export function csvZeilen(text, trenner) {
  const zeilen = [];
  let zeile = [], feld = "", inQ = false;
  const t = ohneBom(text);
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { feld += '"'; i++; }
      else if (c === '"') inQ = false;
      else feld += c;
    } else if (c === '"') inQ = true;
    else if (c === trenner) { zeile.push(feld); feld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      zeile.push(feld); feld = "";
      if (zeile.some((x) => x.trim() !== "")) zeilen.push(zeile);
      zeile = [];
    } else feld += c;
  }
  zeile.push(feld);
  if (zeile.some((x) => x.trim() !== "")) zeilen.push(zeile);
  return zeilen;
}

export function parseFehlerliste(text, format) {
  let roh;
  if (format === "json") {
    let j;
    try { j = JSON.parse(text); } catch { throw new EingabeFehler("Fehlerliste: JSON nicht lesbar"); }
    roh = Array.isArray(j) ? j : j && Array.isArray(j.fehler) ? j.fehler : null;
    if (!roh) throw new EingabeFehler('Fehlerliste: erwartet ein Array oder {"fehler":[…]}');
  } else if (format === "csv") {
    const kopf1 = ohneBom(text).split(/\r?\n/, 1)[0] || "";
    const trenner = (kopf1.match(/;/g) || []).length >= (kopf1.match(/,/g) || []).length ? ";" : ",";
    const z = csvZeilen(text, trenner);
    if (z.length === 0) return [];
    const kopf = z[0].map((k) => k.trim().toLowerCase());
    roh = z.slice(1).map((r) => Object.fromEntries(kopf.map((k, i) => [k, (r[i] ?? "").trim()])));
  } else throw new EingabeFehler("Fehlerliste: Endung muss .json oder .csv sein");

  const ids = new Set();
  return roh.map((r, i) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new EingabeFehler(`Fehlerliste: Eintrag ${i + 1} ist kein Objekt`);
    const f = {};
    for (const k of FELDER) if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") f[k] = String(r[k]).trim();
    f.id = f.id || `#${i + 1}`;
    if (ids.has(f.id)) throw new EingabeFehler(`Fehlerliste: doppelte ID ${f.id}`);
    ids.add(f.id);
    f.prioritaet = (f.prioritaet || "").toUpperCase();
    if (!PRIOS.includes(f.prioritaet)) throw new EingabeFehler(`Fehlerliste: ${f.id}: prioritaet muss P0, P1, P2 oder P3 sein`);
    f.status = (f.status || "offen").toLowerCase();
    if (!STATI.includes(f.status)) throw new EingabeFehler(`Fehlerliste: ${f.id}: unbekannter status`);
    for (const k of ["geoeffnet", "reaktion", "behoben"]) {
      if (f[k] && !(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/.test(f[k]) && !Number.isNaN(Date.parse(f[k].replace(" ", "T")))))
        throw new EingabeFehler(`Fehlerliste: ${f.id}: ${k} ist kein ISO-Datum`);
    }
    return f;
  });
}

/* Nur die gelesenen Felder werden geprüft; unbekannte Spalten wurden
   bereits verworfen. Gibt Fundstellen ohne Werte zurück. */
export function personenFunde(fehler) {
  const funde = [];
  for (const f of fehler)
    for (const k of FELDER) {
      if (!f[k] || k === "geoeffnet" || k === "reaktion" || k === "behoben") continue;
      for (const [art, re] of PERSONENMUSTER) if (re.test(f[k])) funde.push({ id: f.id, feld: k, art });
    }
  return funde;
}

export function parseKennzahlen(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new EingabeFehler("Kennzahl-Datei: JSON nicht lesbar"); }
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new EingabeFehler("Kennzahl-Datei: erwartet ein Objekt");
  const kz = Array.isArray(j.kennzahlen) ? j.kennzahlen : [];
  for (const k of kz) {
    if (!k || typeof k.id !== "string") throw new EingabeFehler("Kennzahl-Datei: jede Kennzahl braucht eine id");
    if (k.richtung !== undefined && !["sinkt", "steigt"].includes(k.richtung)) throw new EingabeFehler(`Kennzahl ${k.id}: richtung muss sinkt oder steigt sein`);
    for (const z of ["wert", "basis", "schwelle"]) if (k[z] !== undefined && k[z] !== null && typeof k[z] !== "number") throw new EingabeFehler(`Kennzahl ${k.id}: ${z} muss eine Zahl sein`);
  }
  const szen = j.szenarien && typeof j.szenarien === "object" ? j.szenarien : {};
  for (const [id, s] of Object.entries(szen)) {
    if (!/^PS-[PS]-\d{2}$/.test(id)) throw new EingabeFehler(`Szenario-ID ${id.slice(0, 20)}: Muster PS-P-nn oder PS-S-nn`);
    if (!SZEN_STATI.includes(s)) throw new EingabeFehler(`Szenario ${id}: unbekannter Stand`);
  }
  const mon = j.monitoring && typeof j.monitoring === "object" ? j.monitoring : {};
  if (mon.gesund !== undefined && !["ok", "warnung", "kritisch"].includes(mon.gesund)) throw new EingabeFehler("monitoring.gesund: ok, warnung oder kritisch");
  const ziele = j.ziele && typeof j.ziele === "object" ? j.ziele : {};
  for (const [p, z] of Object.entries(ziele)) {
    if (!PRIOS.includes(p)) throw new EingabeFehler(`ziele: ${p.slice(0, 10)} ist keine Priorität`);
    for (const f of ["reaktion_h", "behebung_h"]) if (z[f] !== undefined && typeof z[f] !== "number") throw new EingabeFehler(`ziele.${p}.${f} muss eine Zahl sein`);
  }
  return { kennzahlen: kz, szenarien: szen, monitoring: mon, ziele };
}

/* ---------- Auswertung ---------- */

const stunden = (von, bis) => (Date.parse(bis.replace(" ", "T")) - Date.parse(von.replace(" ", "T"))) / 3600000;
const tagVon = (s) => (s ? s.slice(0, 10) : null);
const hatZeit = (s) => !!s && /[T ]\d{2}:\d{2}/.test(s);

export function bewerteKennzahl(k) {
  const r = { id: k.id, name: k.name || "", einheit: k.einheit || "", wert: k.wert ?? null, basis: k.basis ?? null, schwelle: k.schwelle ?? null, urteil: "ohne Wert" };
  if (k.wert === undefined || k.wert === null) return r;
  if (k.schwelle === undefined || k.schwelle === null) { r.urteil = "Schwelle nicht festgelegt, keine Bewertung"; return r; }
  if (!k.richtung) { r.urteil = "Richtung fehlt, keine Bewertung"; return r; }
  const erreicht = k.richtung === "sinkt" ? k.wert <= k.schwelle : k.wert >= k.schwelle;
  r.urteil = erreicht ? "Schwelle erreicht" : "Schwelle verfehlt";
  return r;
}

export function auswerten(fehler, eingabe = {}, opt = {}) {
  const ziele = eingabe.ziele || {};
  const zeilen = {};
  for (const p of PRIOS) {
    const alle = fehler.filter((f) => f.prioritaet === p);
    const offen = alle.filter((f) => OFFEN.has(f.status));
    zeilen[p] = {
      gesamt: alle.length,
      offen: offen.length,
      offenIds: offen.map((f) => f.id),
      neuHeute: opt.datum ? alle.filter((f) => tagVon(f.geoeffnet) === opt.datum).length : null,
      behobenHeute: opt.datum ? alle.filter((f) => tagVon(f.behoben) === opt.datum && !OFFEN.has(f.status)).length : null,
      ueberReaktion: [], ueberBehebung: [], ohneReaktion: [],
    };
    const z = ziele[p];
    if (z) {
      for (const f of alle) {
        if (z.reaktion_h !== undefined && f.geoeffnet && hatZeit(f.geoeffnet)) {
          if (f.reaktion && hatZeit(f.reaktion)) { if (stunden(f.geoeffnet, f.reaktion) > z.reaktion_h) zeilen[p].ueberReaktion.push(f.id); }
          else if (!f.reaktion && opt.jetzt && stunden(f.geoeffnet, opt.jetzt) > z.reaktion_h) zeilen[p].ohneReaktion.push(f.id);
        }
        if (z.behebung_h !== undefined && f.geoeffnet && hatZeit(f.geoeffnet)) {
          if (f.behoben && hatZeit(f.behoben)) { if (stunden(f.geoeffnet, f.behoben) > z.behebung_h) zeilen[p].ueberBehebung.push(f.id); }
          else if (!f.behoben && OFFEN.has(f.status) && opt.jetzt && stunden(f.geoeffnet, opt.jetzt) > z.behebung_h) zeilen[p].ueberBehebung.push(f.id);
        }
      }
    }
  }
  const szen = eingabe.szenarien || {};
  const szenZaehler = Object.fromEntries(SZEN_STATI.map((s) => [s, 0]));
  for (const s of Object.values(szen)) szenZaehler[s]++;
  const mon = eingabe.monitoring || {};
  const stopp = [];
  if (zeilen.P0.offen > 0) stopp.push(`Offene P0: ${zeilen.P0.offenIds.join(", ")}. Stopp-Prüfung nach Konzept Abschnitt 2.3 auslösen.`);
  if (mon.gesund === "kritisch") stopp.push("/gesund meldet kritisch. Runbook und Stopp-Prüfung nach Konzept Abschnitt 2.3.");
  return { zeilen, szenZaehler, szenarien: szen, monitoring: mon, kennzahlen: (eingabe.kennzahlen || []).map(bewerteKennzahl), stopp, hatZiele: Object.keys(ziele).length > 0 };
}

/* ---------- Ausgabe ---------- */

const zahl = (v) => (v === null || v === undefined ? "–" : String(v));
const liste = (a) => (a.length ? a.join(", ") : "–");

export function bericht(erg, opt = {}) {
  const L = [];
  const kopf = ["Pilot-Tagesbericht (Rohtext)"];
  L.push(`# ${kopf[0]}`, "");
  L.push(`- Pilot: ${opt.pilot || "nicht angegeben"}`);
  L.push(`- Betriebsform: ${opt.form === "intern" ? "interner Pilot, synthetische Daten" : opt.form === "geschlossen" ? "geschlossener Pilot, echte Nutzer" : "nicht angegeben"}`);
  L.push(`- Pilottag: ${opt.tag ?? "nicht angegeben"} von 14`);
  L.push(`- Datum: ${opt.datum || "nicht angegeben"}`);
  L.push("- Hinweis: Rohtext aus lokalen Eingaben. Keine Personendaten, keine Bewertung, keine Zusage.", "");

  L.push("## Stopp-Prüfung", "");
  if (erg.stopp.length) for (const s of erg.stopp) L.push(`- ACHTUNG: ${s}`);
  else L.push("- Keine automatisch erkennbaren Stopp-Auslöser in den Eingaben. Nicht erfassbare Auslöser (Datenschutz, Mitbestimmung, Zustimmung) sind durch die Pilotleitung zu bestätigen.");
  L.push("");

  L.push("## Fehlerlage", "");
  L.push("| Prio | gesamt | offen | neu heute | behoben heute |", "|---|---|---|---|---|");
  for (const p of PRIOS) { const z = erg.zeilen[p]; L.push(`| ${p} | ${z.gesamt} | ${z.offen} | ${zahl(z.neuHeute)} | ${zahl(z.behobenHeute)} |`); }
  L.push("");
  for (const p of PRIOS) if (erg.zeilen[p].offen) L.push(`- Offen ${p}: ${liste(erg.zeilen[p].offenIds)}`);
  L.push("");

  L.push("## Reaktions- und Behebungsziele", "");
  if (!erg.hatZiele) L.push("- Keine Ziele in der Kennzahl-Datei vorgegeben, daher keine Prüfung.");
  else for (const p of PRIOS) {
    const z = erg.zeilen[p];
    L.push(`- ${p}: Reaktion überschritten: ${liste(z.ueberReaktion)}; ohne Reaktion und überfällig: ${liste(z.ohneReaktion)}; Behebung überschritten: ${liste(z.ueberBehebung)}`);
  }
  L.push("");

  L.push("## Szenarien", "");
  const ids = Object.keys(erg.szenarien).sort();
  if (!ids.length) L.push("- Keine Szenarienstände übergeben.");
  else {
    L.push("- Zusammenfassung: " + SZEN_STATI.map((s) => `${s} ${erg.szenZaehler[s]}`).join(", "));
    for (const s of SZEN_STATI) { const m = ids.filter((i) => erg.szenarien[i] === s); if (m.length && s !== "bestanden") L.push(`- ${s}: ${m.join(", ")}`); }
  }
  L.push("");

  L.push("## Monitoring", "");
  const m = erg.monitoring;
  if (!Object.keys(m).length) L.push("- Keine Monitoringwerte übergeben.");
  else {
    L.push(`- /gesund: ${m.gesund ?? "nicht angegeben"}`);
    L.push(`- Alter der letzten Sicherung (Stunden): ${zahl(m.sicherung_alter_h)}`);
    L.push(`- 5xx in 15 min: ${zahl(m.fehler_5xx_15min)}`);
    if (m.bemerkung) L.push(`- Bemerkung: ${String(m.bemerkung).slice(0, 300)}`);
  }
  L.push("");

  L.push("## Kennzahlen", "");
  if (!erg.kennzahlen.length) L.push("- Keine Kennzahlen übergeben.");
  else {
    L.push("| ID | Kennzahl | Wert | Basis | Schwelle (vom Pilot festgelegt) | Urteil |", "|---|---|---|---|---|---|");
    for (const k of erg.kennzahlen) {
      const e = k.einheit ? ` ${k.einheit}` : "";
      L.push(`| ${k.id} | ${k.name || "–"} | ${k.wert === null ? "–" : k.wert + e} | ${k.basis === null ? "–" : k.basis + e} | ${k.schwelle === null ? "nicht festgelegt" : k.schwelle + e} | ${k.urteil} |`);
    }
  }
  L.push("");
  L.push("## Zu ergänzen von Hand", "", "- Besondere Vorkommnisse:", "- Entscheidungen der Pilotleitung:", "- Nächster Tag:", "");
  return L.join("\n");
}

/* ---------- Aufruf ---------- */

export function lauf(argv, lies = (p) => readFileSync(p, "utf8"), jetzt = null) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!/^--(fehler|kennzahlen|tag|datum|pilot|form)$/.test(a) || argv[i + 1] === undefined) throw new EingabeFehler(`Unbekannter oder unvollständiger Parameter: ${String(a).slice(0, 30)}`);
    o[a.slice(2)] = argv[++i];
  }
  if (!o.fehler) throw new EingabeFehler("Parameter --fehler fehlt");
  if (o.tag !== undefined && !(/^\d+$/.test(o.tag) && +o.tag >= 1 && +o.tag <= 14)) throw new EingabeFehler("--tag: 1 bis 14");
  if (o.datum !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(o.datum)) throw new EingabeFehler("--datum: JJJJ-MM-TT");
  if (o.pilot !== undefined && !["A", "B"].includes(o.pilot)) throw new EingabeFehler("--pilot: A oder B");
  if (o.form !== undefined && !["intern", "geschlossen"].includes(o.form)) throw new EingabeFehler("--form: intern oder geschlossen");
  const format = /\.json$/i.test(o.fehler) ? "json" : /\.csv$/i.test(o.fehler) ? "csv" : null;
  let text;
  try { text = lies(o.fehler); } catch { throw new EingabeFehler("Fehlerliste nicht lesbar"); }
  const fehler = parseFehlerliste(text, format);
  const funde = personenFunde(fehler);
  if (funde.length) {
    throw new EingabeFehler("Mögliche Personendaten in der Fehlerliste, Bericht nicht erzeugt: " + funde.map((f) => `${f.id}/${f.feld} (${f.art})`).join("; ") + ". Eintrag bereinigen und erneut starten.", 3);
  }
  let eingabe = {};
  if (o.kennzahlen) {
    let kt;
    try { kt = lies(o.kennzahlen); } catch { throw new EingabeFehler("Kennzahl-Datei nicht lesbar"); }
    eingabe = parseKennzahlen(kt);
  }
  const erg = auswerten(fehler, eingabe, { datum: o.datum, jetzt: jetzt ?? (o.datum ? `${o.datum}T23:59:59Z` : null) });
  return bericht(erg, { pilot: o.pilot, form: o.form, tag: o.tag, datum: o.datum });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(lauf(process.argv.slice(2)) + "\n");
  } catch (e) {
    if (e instanceof EingabeFehler) { process.stderr.write(`Fehler: ${e.message}\n`); process.exit(e.code); }
    throw e;
  }
}

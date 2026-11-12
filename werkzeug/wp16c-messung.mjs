#!/usr/bin/env node
/* ==========================================================================
   WP-16c — MESSUNG DES KORREKTURPFADS (Revision nach bestätigtem Lohnexport)

   Wiederholbar, nicht im CI-Pflichtlauf (zu lang); eine kleine Stichprobe steht in
   pruefungen/wp16c-messung.test.js. Baut auf dem Gerüst von werkzeug/wp16-messung.mjs auf.

     node werkzeug/wp16c-messung.mjs                              Matrix 60/150/400 Personen × 12/24/36 Monate
     node werkzeug/wp16c-messung.mjs --personen 60 --monate 12    eine Zelle
     node werkzeug/wp16c-messung.mjs --json                       zusätzlich die Rohwerte (eine JSON-Zeile je Zelle)

   Je Zelle (synthetisch, ohne Personendaten; Bibliothek, kein HTTP):
     alle Monate abschließen, den jüngsten Monat als Lohnexport bestätigen (Revision 1), dann
       Runde 1  korrekturBeginnen → Änderungen (Ist-Zeit bei ~5 % der Personen) → Abschluss ohne Freigabe (409)
                → korrekturFreigeben (zweite Person) → Abschluss ⇒ Revision 2, Korrekturexport, Export bestätigen
       Runde 2  dasselbe noch einmal (Revision 3)
       Runde 3  korrekturBeginnen → Änderung → korrekturVerwerfen → Änderung zurücknehmen → Abschluss (Differenz leer, Revision 4)
   Geprüft je Zelle (Verstöße stehen in `befunde`):
     Differenz = neue − exportierte Zeilen je Personalnummer und Lohnart (unabhängig nachgerechnet);
     Revision 1 + alle Korrekturexporte = die vollen Zeilen der letzten Revision;
     Revisionen lückenlos 1..n, Revision 1 unverändert abgelegt, Verlauf kompakt (feste Zahl Ereignisse je Runde);
     Reproduzierbarkeit (freezeStatus, Prüfsumme, gleiche Eingabe ⇒ gleiche Ausgabe);
     keine stille Null: jede Person im jüngsten Monat hat Ist-Stunden > 0 oder einen ausdrücklichen Grund (Abwesenheit),
     und fehlt eine Person in den Lohnzeilen, hat sie einen Freeze-Eintrag (kein Zuschlagsanfall) — sonst ein Befund.
   Gemessen: ms je Schritt, Größe des Monatseintrags und des Mandanten je Revision (Byte).
   ========================================================================== */
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { betriebErzeugen, monateVor, HEUTE } from "./wp16-messung.mjs";
import { abschliessen, lohnexportBestaetigen, korrekturBeginnen, korrekturFreigeben, korrekturVerwerfen, exportZeilenFuer,
  KORREKTUR_FREIGABE_ERFORDERLICH, istAbdruck } from "../server/lib/monatsabschluss.mjs";
import { datevAusFreeze, freezeStatus } from "../server/lib/isteinfrieren.mjs";
import { lohnexportStand } from "../src/lib/fachlogik.js";

const JETZT = new Date(`${HEUTE}T09:00:00Z`);
const L1 = { personId: "p1", name: "L1", rolle: "leitung" };
const L2 = { personId: "l2", name: "L2", rolle: "leitung" };
const TROTZ = { trotzVormonat: true, vormonatKategorie: "vor_inbetriebnahme", vormonatGrund: "Vormonate ohne Zeitdaten vor dem Start" };
const groesse = (x) => Buffer.byteLength(JSON.stringify(x));
const ms = (f) => { const t = performance.now(); const r = f(); return [r, Math.round(performance.now() - t)]; };
const rund2 = (x) => Math.round(x * 100) / 100;
const fehl = (r) => ("status" in r ? `${r.status} ${r.code || ""} ${r.grund}` : null);

/** Synthetischer Betrieb mit Zuschlägen (Nacht/Samstag/Sonntag/Feiertag), damit überhaupt Lohnzeilen entstehen, und einer zweiten Leitung. */
export function betriebMitZuschlaegen(n, monate) {
  const m = betriebErzeugen(n, monate);
  m.bundesland = "NI";
  m.einstellungen = { ...m.einstellungen, nachtVon: "23:00", nachtBis: "06:00" };
  m.zuschlaege = [{ id: "z-n", art: "nacht", name: "Nacht", prozent: 25, aktiv: true }, { id: "z-f", art: "feiertag", name: "Feiertag", prozent: 100, aktiv: true },
    { id: "z-sa", art: "samstag", name: "Samstag", prozent: 10, aktiv: true }, { id: "z-so", art: "sonntag", name: "Sonntag", prozent: 50, aktiv: true }];
  m.personen.push({ ...m.personen[1], id: "l2", nachname: "L2", rolle: "leitung", imSchichtdienst: false, personalnummer: "L2" });
  return m;
}

/** Karte „Personalnummer|Lohnart" → Stunden. */
const karte = (zeilen) => {
  const k = new Map();
  for (const z of zeilen) { const s = `${z.personalnummer}|${z.lohnart}`; k.set(s, rund2((k.get(s) || 0) + Number(z.stunden))); }
  return k;
};
const gleich = (a, b) => a.size === b.size && [...a].every(([k, v]) => Math.abs((b.get(k) ?? NaN) - v) < 0.011);

/**
 * Ändert bei `anzahl` Personen den Plan: ein Nachtdienst im Monat entfällt (Abweichung "-", Ist-Zeit gelöscht) ⇒ der
 * Nachtzuschlag sinkt, die Lohnzeile ändert sich. (Eine reine Änderung der Ist-Zeit ändert nur das Konto; Mehrarbeit wird
 * nur bei positivem Konto ausgegeben — in dieser Synthese bleibt es negativ, daher keine Lohnzeile; siehe Messdokument.)
 */
export function istAendern(m, monat, anzahl) {
  const erf = { ...m.erfassung };
  const abw = { ...m.abweichungen };
  const personen = new Set();
  for (const k of Object.keys(erf).filter((x) => x.split("|")[1].startsWith(monat)).sort()) {
    const [p] = k.split("|");
    if (personen.size >= anzahl) break;
    if (personen.has(p) || erf[k].start !== "21:15") continue;
    delete erf[k];
    abw[k] = "-";
    personen.add(p);
  }
  return { mandant: { ...m, erfassung: erf, abweichungen: abw }, geaendert: personen.size };
}

/** Eine volle Korrekturrunde. */
function runde(m, monat, nr, aenderungen) {
  const befunde = [], t = {};
  const vollAlt = datevAusFreeze(m, monat) || [];
  const [b, tBeginn] = ms(() => korrekturBeginnen(m, { monat, anlass: "fehler", grund: `Messung Runde ${nr}: Ist-Zeit korrigiert` }, L1, JETZT, `kb-${nr}`));
  if (fehl(b)) throw new Error(`Runde ${nr} beginnen: ${fehl(b)}`);
  t.beginnen = tBeginn;
  const { mandant: g, geaendert } = istAendern(b.mandant, monat, aenderungen);
  const [z0, tOhne] = ms(() => abschliessen(g, { monat, trotzPrueffaellen: true }, L1, JETZT, `ma-${nr}`, HEUTE));
  t.abschlussOhneFreigabe = tOhne;
  if (geaendert > 0 && z0.code !== KORREKTUR_FREIGABE_ERFORDERLICH) befunde.push(`Runde ${nr}: Abschluss ohne Freigabe nicht abgewiesen (${fehl(z0) || "ok"})`);
  const [vor, tVor] = ms(() => korrekturFreigeben(g, { monat }, L2, JETZT, `kf-${nr}`, HEUTE));
  t.freigabeVorschau = tVor;
  let freigegeben = g;
  if (vor.differenz && vor.differenz.n > 0) {
    const [f, tFrei] = ms(() => korrekturFreigeben(g, { monat, differenz: vor.differenz.abdruck }, L2, JETZT, `kf-${nr}`, HEUTE));
    if (fehl(f)) throw new Error(`Runde ${nr} freigeben: ${fehl(f)}`);
    t.freigeben = tFrei;
    freigegeben = f.mandant;
  } else if (geaendert > 0) befunde.push(`Runde ${nr}: keine Differenz bei ${geaendert} geänderten Personen (stille Null)`);
  const [z, tAbschluss] = ms(() => abschliessen(freigegeben, { monat, trotzPrueffaellen: true }, L1, JETZT, `ma-${nr}`, HEUTE));
  if (fehl(z)) throw new Error(`Runde ${nr} abschließen: ${fehl(z)}`);
  t.abschluss = tAbschluss;
  const neu = z.mandant;
  const vollNeu = datevAusFreeze(neu, monat) || [];
  /* Differenz unabhängig nachrechnen: neue volle Zeilen − die Zeilen der letzten Revision. */
  const a = karte(vollAlt), nn = karte(vollNeu), erwartet = new Map();
  for (const k of new Set([...a.keys(), ...nn.keys()])) { const d = rund2((nn.get(k) || 0) - (a.get(k) || 0)); if (Math.abs(d) >= 0.01) erwartet.set(k, d); }
  const diff = exportZeilenFuer(neu, monat);
  if (!gleich(karte(diff.zeilen), erwartet)) befunde.push(`Runde ${nr}: Korrekturexport (${diff.zeilen.length} Zeilen) ≠ unabhängig gerechnete Differenz (${erwartet.size})`);
  if (diff.korrekturZu === null || diff.revision !== neu.monatsabschluss[monat].revision) befunde.push(`Runde ${nr}: Revision/korrekturZu falsch (${diff.revision}/${diff.korrekturZu})`);
  if (diff.zeilen.some((x) => !/^Korrektur R\d+ zu R\d+:/.test(x.bezeichnung))) befunde.push(`Runde ${nr}: Korrekturzeile ohne Kennzeichnung`);
  t.exportZeilen = diff.zeilen.length;
  const [e, tEx] = ms(() => lohnexportBestaetigen(neu, { monat, ...lohnexportStand(neu, monat), ...TROTZ }, L1, JETZT, `le-${nr}`));
  if (fehl(e)) throw new Error(`Runde ${nr} Export: ${fehl(e)}`);
  t.exportBestaetigen = tEx;
  return { mandant: e.mandant, t, befunde, diff: diff.zeilen, geaendert, vollNeu };
}

/** Verwerfen-Runde: Änderung, verwerfen, Änderung zurücknehmen, neu abschließen ⇒ Differenz leer. */
function verwerfenRunde(m, monat, nr) {
  const befunde = [], t = {};
  const b = korrekturBeginnen(m, { monat, anlass: "fehler", grund: `Messung Runde ${nr}: wird verworfen` }, L1, JETZT, `kb-${nr}`);
  if (fehl(b)) throw new Error(`Runde ${nr} beginnen: ${fehl(b)}`);
  const { mandant: g } = istAendern(b.mandant, monat, 3);
  const [v, tV] = ms(() => korrekturVerwerfen(g, { monat, grund: "Messung: Korrektur verworfen" }, L1, JETZT, `kv-${nr}`));
  if (fehl(v)) throw new Error(`Runde ${nr} verwerfen: ${fehl(v)}`);
  t.verwerfen = tV;
  const z = abschliessen({ ...v.mandant, erfassung: m.erfassung, abweichungen: m.abweichungen }, { monat, trotzPrueffaellen: true }, L1, JETZT, `ma-${nr}`, HEUTE);
  if (fehl(z)) throw new Error(`Runde ${nr} abschließen: ${fehl(z)}`);
  if (z.differenz && z.differenz.n !== 0) befunde.push(`Runde ${nr}: nach Verwerfen und Zurücknehmen Differenz ≠ leer (${z.differenz.n})`);
  return { mandant: z.mandant, t, befunde };
}

/** Keine stille Null: Ist-Stunden je Person im Monat aus dem Freeze (Summe `std`), Lohnzeilen je Person. */
function nullPruefung(m, monat, zeilen) {
  const befunde = [];
  const std = new Map();
  for (const [k, e] of Object.entries(m.istEingefroren || {})) {
    const [pid, tag] = k.split("|");
    if (!tag || !/^\d{4}-\d{2}-\d{2}$/.test(tag) || !tag.startsWith(monat) || !e || typeof e !== "object") continue;
    std.set(pid, (std.get(pid) || 0) + (Number(e.std) || 0));
  }
  const mitZeilen = new Set(zeilen.map((z) => String(z.personalnummer)));
  const abw = new Set((m.abwesenheiten || []).map((a) => String(a.personId)));
  let nullStd = 0, ohneZeileMitEintrag = 0, ohneZeileOhneEintrag = 0;
  for (const p of m.personen.filter((x) => x.imSchichtdienst)) {
    if (!((std.get(p.id) || 0) > 0) && !abw.has(p.id)) nullStd++;
    if (!mitZeilen.has(String(p.personalnummer || p.id))) {
      const e = m.istEingefroren && m.istEingefroren[`${p.id}|${monat}`];
      if (e && e.i === 1) ohneZeileMitEintrag++; else ohneZeileOhneEintrag++;
    }
  }
  if (nullStd) befunde.push(`${nullStd} Personen mit 0 Ist-Stunden im Freeze ohne Grund (stille Null)`);
  if (ohneZeileOhneEintrag) befunde.push(`${ohneZeileOhneEintrag} Personen weder Lohnzeile noch Freeze-Eintrag (stille Null)`);
  return { befunde, nullStd, ohneZeileMitEintrag, ohneZeileOhneEintrag };
}

/** Eine Zelle der Matrix. */
export function zelleKorrektur(n, anzahlMonate, o = {}) {
  const aenderungen = o.aenderungen ?? Math.max(2, Math.round(n * 0.05));
  const monate = monateVor(HEUTE.slice(0, 7), anzahlMonate);
  const probe = monate[monate.length - 1];
  const befunde = [];
  let x = betriebMitZuschlaegen(n, monate);
  const [, tAlleZu] = ms(() => {
    for (const monat of monate) {
      const r = abschliessen(x, { monat, trotzPrueffaellen: true }, L1, JETZT, `ma-${monat}`, HEUTE);
      if (fehl(r)) throw new Error(fehl(r));
      x = r.mandant;
    }
  });
  const [ex, tEx1] = ms(() => lohnexportBestaetigen(x, { monat: probe, ...lohnexportStand(x, probe), ...TROTZ }, L1, JETZT, "le-0"));
  if (fehl(ex)) throw new Error(`Export Revision 1: ${fehl(ex)}`);
  x = ex.mandant;
  const voll1 = datevAusFreeze(x, probe) || [];
  const rev1Export = JSON.stringify(x.monatsabschluss[probe].lohnexport);
  const nullen = nullPruefung(x, probe, voll1);
  befunde.push(...nullen.befunde);
  /* Auch die übrigen Monate: keine Person mit stiller Null (Stichprobe: ältester Monat). */
  const aeltester = nullPruefung(x, monate[0], datevAusFreeze(x, monate[0]) || []);
  befunde.push(...aeltester.befunde.map((b) => `${monate[0]}: ${b}`));
  const schritte = [], bytes = [{ revision: 1, eintrag: groesse(x.monatsabschluss[probe]), mandant: groesse(x) }];
  const diffe = [];
  let vollLetzte = voll1;
  for (let r = 1; r <= 2; r++) {
    const d = runde(x, probe, r, aenderungen);
    x = d.mandant; schritte.push(d.t); befunde.push(...d.befunde); diffe.push(d.diff); vollLetzte = d.vollNeu;
    bytes.push({ revision: r + 1, eintrag: groesse(x.monatsabschluss[probe]), mandant: groesse(x) });
  }
  const nachRunde2 = x;
  const v = verwerfenRunde(x, probe, 3);
  x = v.mandant; schritte.push(v.t); befunde.push(...v.befunde);
  bytes.push({ revision: 4, eintrag: groesse(x.monatsabschluss[probe]), mandant: groesse(x) });
  /* Struktur: Revisionen 1..n lückenlos, Revision 1 unverändert, Verlauf kompakt. */
  const e = x.monatsabschluss[probe];
  const revs = (e.revisionen || []).map((q) => q.revision);
  if (JSON.stringify(revs) !== JSON.stringify(revs.map((_, i) => i + 1))) befunde.push(`Revisionen nicht lückenlos: ${revs}`);
  if (!e.revisionen.length || JSON.stringify(e.revisionen[0].lohnexport) !== rev1Export) befunde.push("Revision 1 nicht unverändert abgelegt");
  if (e.verlauf.length > 20) befunde.push(`Verlauf nicht kompakt: ${e.verlauf.length} Ereignisse nach 3 Runden`);
  /* Revision 1 + alle Korrekturexporte = die vollen Zeilen der letzten bestätigten Revision (Revision 3). */
  const summe = karte(voll1);
  for (const d of diffe) for (const [k, val] of karte(d)) summe.set(k, rund2((summe.get(k) || 0) + val));
  for (const [k, val] of [...summe]) if (Math.abs(val) < 0.011) summe.delete(k);
  if (!gleich(summe, karte(vollLetzte))) befunde.push("Revision 1 + Korrekturexporte ≠ volle Zeilen der letzten Revision");
  /* Reproduzierbarkeit: freeze, Prüfsumme, gleiche Eingabe ⇒ gleiche Ausgabe. */
  const st = freezeStatus(x, probe);
  if (!st || !st.reproduzierbar) befunde.push("letzte Revision nicht reproduzierbar (freezeStatus)");
  if (e.abgeschlossen === true && istAbdruck(x, probe) !== e.abdruck) befunde.push("Prüfsumme der letzten Revision weicht ab");
  const lauf = () => korrekturBeginnen(nachRunde2, { monat: probe, anlass: "fehler", grund: "Reproduktion der Revision" }, L1, JETZT, "kb-r");
  const b1 = lauf(), b2 = lauf();
  if ("status" in b1) befunde.push(`Reproduktion: ${fehl(b1)}`);
  else if (JSON.stringify(b1.mandant) !== JSON.stringify(b2.mandant)) befunde.push("korrekturBeginnen nicht deterministisch");
  return { n, monate: anzahlMonate, personentage: Object.keys(x.istEingefroren || {}).filter((k) => /\|\d{4}-\d{2}-\d{2}$/.test(k)).length,
    aenderungen, tAlleZu, tEx1, schritte, diffN: diffe.map((d) => d.length), bytes, zeilenR1: voll1.length, nullen, befunde, verlaufN: e.verlauf.length };
}

/* ------------------------------ Kommandozeile ------------------------------ */
const mb = (b) => (b / 1024 / 1024).toFixed(2);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (nm) => { const i = process.argv.indexOf(`--${nm}`); return i > 0 ? Number(process.argv[i + 1]) : null; };
  const personen = arg("personen") ? [arg("personen")] : [60, 150, 400];
  const monate = arg("monate") ? [arg("monate")] : [12, 24, 36];
  const json = process.argv.includes("--json");
  console.log(`WP-16c Messung Korrekturpfad · Node ${process.version} · ${process.platform}`);
  console.log("Personen Monate | alle abschl. (ms) | Export R1 | R1: beginnen/freigeben/abschl./export (ms) | R2: dito | verwerfen | Diff-Zeilen R2,R3 | Eintrag R1→R4 (KB) | Mandant R1→R4 (MB) | Befunde");
  for (const n of personen) for (const mo of monate) {
    const z = zelleKorrektur(n, mo);
    const s = (t) => `${t.beginnen}/${t.freigeben ?? "-"}/${t.abschluss}/${t.exportBestaetigen}`;
    console.log(`${n} ${mo} | ${z.tAlleZu} | ${z.tEx1} | ${s(z.schritte[0])} | ${s(z.schritte[1])} | ${z.schritte[2].verwerfen} | ${z.diffN.join(",")} | ${z.bytes.map((b) => Math.round(b.eintrag / 1024)).join("→")} | ${z.bytes.map((b) => mb(b.mandant)).join("→")} | ${z.befunde.length ? z.befunde.join("; ") : "keine"}`);
    if (json) console.log(JSON.stringify(z));
  }
}

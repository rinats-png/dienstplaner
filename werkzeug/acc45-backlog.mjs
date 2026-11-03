#!/usr/bin/env node
/* ==========================================================================
   ACC45 – Backlog: eine Quelle, daraus alle Zahlen

   Einzige maßgebliche Quelle für Pakete, Status, Statusstufen, Aufwand und
   Abhängigkeiten ist docs/acc45/work-packages.json (Schema 2). Wer den Stand
   eines Pakets ändert, ändert ihn dort und ruft das Werkzeug auf:

     node werkzeug/acc45-backlog.mjs                 JSON normalisieren, DEPENDENCIES.md und alle
                                                     AUTO-Blöcke (STATUS, GESAMTPLAN, ROADMAPs) schreiben
     node werkzeug/acc45-backlog.mjs status-schreiben  dasselbe (ausdrücklicher Name)
     node werkzeug/acc45-backlog.mjs pruefen         Quelle prüfen und Abweichungen der erzeugten
                                                     Dateien melden (Rückgabe 1 bei Abweichung)
     node werkzeug/acc45-backlog.mjs bereit [--alle] was jetzt starten kann (--alle: auch extern)
     node werkzeug/acc45-backlog.mjs brief WP-23     Agentenauftrag als Text
     node werkzeug/acc45-backlog.mjs fortschritt     Kurzstatus
     node werkzeug/acc45-backlog.mjs kritischer-pfad [strang]   je Strang und gemeinsam
     node werkzeug/acc45-backlog.mjs prognose        Zeitprognosen A/B/C (drei Szenarien)
     node werkzeug/acc45-backlog.mjs lokal WP-23 agentId=… letzterCheckpoint=… abbruch=…
         (nur mit ACC45_LOKAL=<Datei außerhalb des Repos>; nie im öffentlichen JSON)

   Erzeugte Inhalte hängen nur von der JSON ab (kein Datum aus der Uhr), damit
   pruefungen/acc45-status.test.js sie Zeichen für Zeichen vergleichen kann.
   Aufwand in PT = Entwicklertage, menschliches Äquivalent; Spannen {min,max}.
   ========================================================================== */
import { writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Zulässige Status der Quelle; CI_FAILED/VERIFIED nur noch für Altdaten (Kompatibilität). */
export const STATUS = ["BLOCKED", "READY", "IN_PROGRESS", "REVIEW", "CI_FAILED", "INTEGRATED", "VERIFIED", "DONE"];
export const STATUS_QUELLE = Object.freeze(["BLOCKED", "READY", "IN_PROGRESS", "REVIEW", "INTEGRATED", "DONE"]);
export const STRAENGE = Object.freeze(["acc45", "wp19", "intelligence", "folge", "extern"]);
export const STUFEN = Object.freeze(["implementiert", "lokalGetestet", "reviewt", "integriert", "stagingGeprueft", "fachlichFreigegeben", "produktiv"]);
export const KONFLIKTZONEN = Object.freeze(["App.jsx", "daten.mjs", "rechte.mjs", "sicht.mjs", "package.json", "stempelintegritaet.mjs"]);
export const ERLEDIGT = Object.freeze(["INTEGRATED", "VERIFIED", "DONE"]);
export const NUR_REIHENFOLGE = Object.freeze(["WP-09"]);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const QUELLE = path.join(REPO, "docs", "acc45", "work-packages.json");

const AGENT = { "0": "Agent 0 – Integration", A: "Agent A – Security & Data Integrity", B: "Agent B – Infrastructure & Reliability",
  C: "Agent C – Rule Engine", D: "Agent D – Time/Offline/Geo", E: "Agent E – Business Modules & Frontend", F: "Agent F – QA & Review" };
const BEREICH = { "0": "integration", A: "security", B: "infra", C: "rules", D: "time", E: "frontend", F: "qa" };
const kurz = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);
const zahl = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100)).replace(".", ",");
const spanneText = (s) => (s.min === s.max ? `${zahl(s.min)}` : `${zahl(s.min)}–${zahl(s.max)}`);

/* --------------------------------------------------------------------------
   Quelle lesen und normalisieren
   -------------------------------------------------------------------------- */
export function quelleLesen(datei = QUELLE) { return JSON.parse(readFileSync(datei, "utf8")); }

const leereStufen = () => Object.fromEntries(STUFEN.map((k) => [k, { wert: false, beleg: null }]));
const alsSpanne = (x) => (typeof x === "number" ? { min: x, max: x } : { min: x.min, max: x.max });

/** Ein Paket in die kanonische Form bringen (feste Schlüsselreihenfolge). */
function normalisieren(p) {
  const stufen = leereStufen();
  for (const k of STUFEN) if (p.stufen?.[k]) stufen[k] = { wert: p.stufen[k].wert, beleg: p.stufen[k].beleg ?? null };
  const o = {
    id: p.id, titel: p.titel, strang: p.strang || "acc45", prio: p.prio,
    aufwandPT: alsSpanne(p.aufwandPT),
  };
  if (p.restPT) o.restPT = alsSpanne(p.restPT);
  if (p.wartezeitAT) o.wartezeitAT = alsSpanne(p.wartezeitAT);
  if (p.bedingt) o.bedingt = true;
  Object.assign(o, {
    abhaengigkeiten: [...(p.abhaengigkeiten || [])], status: p.status, stufen,
    branch: p.branch ?? null, agent: p.agent ?? null, modell: p.modell ?? null,
    konfliktzonen: [...(p.konfliktzonen || [])], pr: [...(p.pr || [])], nachweis: p.nachweis ?? null,
    akzeptanz: p.akzeptanz ?? "", tests: p.tests ?? "", dateien: p.dateien ?? "", notiz: p.notiz ?? null,
  });
  for (const f of LOKALE_FELDER) if (f in p) o[f] = p[f];               // damit schreiben() es findet und abbricht
  return o;
}

/** Altes Tupelformat (Array P bis 2026-11-03) in die kanonische Form. */
function ausTupel([id, name, prio, aufwand, abh, agent, status, akzeptanz, tests, dateien, extra = {}]) {
  if (!STATUS.includes(status)) throw new Error(`${id}: Status ${status}`);
  const stufen = leereStufen();
  if (extra.integration) stufen.integriert = { wert: true, beleg: extra.integration };
  return normalisieren({ id, titel: name, strang: "acc45", prio, aufwandPT: aufwand, abhaengigkeiten: abh, status, stufen,
    branch: `acc45/${BEREICH[agent]}/${id.toLowerCase().replace("-", "")}-${kurz(name)}`, agent: AGENT[agent], modell: null,
    pr: extra.pr ? [extra.pr] : [], nachweis: extra.nachweis || null, akzeptanz, tests, dateien });
}

/** Die Pakete als Objekte. Ohne Argument aus der Quelle; Tupel (alt) und Objekte werden angenommen. */
export function paketeAus(liste) {
  const roh = liste ?? quelleLesen().pakete;
  return roh.map((p) => {
    const n = Array.isArray(p) ? ausTupel(p) : normalisieren(p);
    if (!STATUS.includes(n.status)) throw new Error(`${n.id}: Status ${n.status}`);
    return n;
  });
}

/** Kompatibilität: das frühere Array P, jetzt aus der Quelle erzeugt (nur lesend). */
export const P = Object.freeze(existsSync(QUELLE) ? quelleLesen().pakete.map((p) => Object.freeze([p.id, p.titel, p.prio,
  p.aufwandPT.min, p.abhaengigkeiten, p.agent, p.status, p.akzeptanz, p.tests, p.dateien])) : []);

/* --------------------------------------------------------------------------
   Prüfung der Quelle (Schema, Graph, Statusstufen ehrlich)
   -------------------------------------------------------------------------- */
export function pruefeQuelle(pakete) {
  const f = [];
  const ids = new Map();
  for (const p of pakete) {
    if (ids.has(p.id)) f.push(`${p.id}: doppelt`);
    ids.set(p.id, p);
  }
  for (const p of pakete) {
    const w = (t) => f.push(`${p.id}: ${t}`);
    if (!p.titel) w("titel fehlt");
    if (!STRAENGE.includes(p.strang)) w(`strang ${p.strang}`);
    if (!STATUS_QUELLE.includes(p.status)) w(`status ${p.status} (zulässig: ${STATUS_QUELLE.join("|")})`);
    for (const s of [p.aufwandPT, p.restPT, p.wartezeitAT].filter(Boolean))
      if (!(Number.isFinite(s.min) && Number.isFinite(s.max) && s.min >= 0 && s.min <= s.max)) w("Spanne ungültig");
    if (p.strang === "extern" && !p.wartezeitAT) w("extern ohne wartezeitAT");
    if (p.strang !== "extern" && p.wartezeitAT) w("wartezeitAT nur für extern");
    for (const a of p.abhaengigkeiten) if (!ids.has(a)) w(`Abhängigkeit ${a} unbekannt`);
    for (const z of p.konfliktzonen) if (!KONFLIKTZONEN.includes(z)) w(`Konfliktzone ${z} unbekannt`);
    for (const k of STUFEN) {
      const s = p.stufen[k];
      if (![true, false, "teilweise"].includes(s.wert)) w(`Stufe ${k}: ${s.wert}`);
      if (s.wert !== false && !s.beleg) w(`Stufe ${k} ohne Beleg`);
    }
    /* Ehrlichkeit: integriert nur mit Merge, INTEGRATED nur mit integriert, produktiv nur bei DONE. */
    if (p.status === "INTEGRATED" && p.stufen.integriert.wert !== true) w("INTEGRATED ohne Stufe integriert=true");
    if (p.stufen.integriert.wert === true && !ERLEDIGT.includes(p.status)) w("Stufe integriert=true, Status nicht INTEGRATED/DONE");
    if (p.stufen.produktiv.wert === true && p.status !== "DONE") w("produktiv=true ohne DONE");
    if (p.status === "DONE" && p.strang !== "extern" && p.stufen.produktiv.wert !== true) w("DONE ohne produktiv=true");
    if (p.status === "READY" && p.strang !== "extern") {
      const offen = p.abhaengigkeiten.filter((a) => !NUR_REIHENFOLGE.includes(a) && !ERLEDIGT.includes(ids.get(a)?.status));
      if (offen.length) w(`READY, aber Abhängigkeiten offen: ${offen.join(", ")}`);
    }
  }
  /* Zyklen */
  const farbe = new Map();
  const besuch = (id, pfad) => {
    if (farbe.get(id) === 2) return;
    if (farbe.get(id) === 1) { f.push(`Zyklus: ${[...pfad, id].join(" → ")}`); return; }
    farbe.set(id, 1);
    for (const a of ids.get(id)?.abhaengigkeiten || []) besuch(a, [...pfad, id]);
    farbe.set(id, 2);
  };
  for (const id of ids.keys()) besuch(id, []);
  return f;
}

/* --------------------------------------------------------------------------
   Aufwand, Kennzahlen, kritischer Pfad
   -------------------------------------------------------------------------- */
const restFaktorStandard = { IN_PROGRESS: 0.5, REVIEW: 0.2 };

/** Offener Aufwand eines Pakets {min,max}: 0 bei INTEGRATED/VERIFIED/DONE, sonst restPT oder Anteil nach Status. */
export function restAufwand(p, restFaktor = restFaktorStandard) {
  if (ERLEDIGT.includes(p.status) || p.bedingt) return { min: 0, max: 0 };
  if (p.restPT) return { ...p.restPT };
  const f = restFaktor[p.status] ?? 1;
  return { min: p.aufwandPT.min * f, max: p.aufwandPT.max * f };
}
const summe = (liste) => liste.reduce((a, s) => ({ min: a.min + s.min, max: a.max + s.max }), { min: 0, max: 0 });
const mitte = (s) => (s.min + s.max) / 2;

/** Längste Kette nach offenem Aufwand (Mitte der Spanne) innerhalb der gewählten Pakete. */
export function kritischerPfad(pakete, { auswahl = () => true, gewicht } = {}) {
  const nach = new Map(pakete.map((p) => [p.id, p]));
  const w = gewicht || ((p) => restAufwand(p));
  const memo = new Map();
  const laenge = (id) => {
    if (memo.has(id)) return memo.get(id);
    const p = nach.get(id);
    let best = { mitte: 0, min: 0, max: 0, kette: [] };
    for (const a of p.abhaengigkeiten) {
      if (!nach.has(a) || !auswahl(nach.get(a)) || NUR_REIHENFOLGE.includes(a)) continue;
      const l = laenge(a);
      if (l.mitte > best.mitte) best = l;
    }
    const g = w(p);
    const r = { mitte: best.mitte + mitte(g), min: best.min + g.min, max: best.max + g.max, kette: [...best.kette, id] };
    memo.set(id, r);
    return r;
  };
  let k = { mitte: 0, min: 0, max: 0, kette: [] };
  for (const p of pakete) if (auswahl(p)) { const l = laenge(p.id); if (l.mitte > k.mitte) k = l; }
  /* nur Pakete mit offenem Aufwand zeigen */
  k.kette = k.kette.filter((id) => mitte(w(nach.get(id))) > 0);
  return k;
}

const ENTWICKLUNG = (p) => p.strang !== "extern" && !p.bedingt;

/** Zählung, offener Aufwand je Strang, kritischer Pfad (gemeinsam, ohne extern). Kompatibel zu früher. */
export function kennzahlen(pakete) {
  const zaehl = Object.fromEntries(STATUS.map((s) => [s, pakete.filter((p) => p.status === s).length]));
  const offen = summe(pakete.filter(ENTWICKLUNG).map((p) => restAufwand(p)));
  const k = kritischerPfad(pakete, { auswahl: ENTWICKLUNG });
  const jeStrang = Object.fromEntries(STRAENGE.map((s) => {
    const ps = pakete.filter((p) => p.strang === s);
    return [s, { pakete: ps.length, offen: ps.filter((p) => !ERLEDIGT.includes(p.status)).length,
      restPT: summe(ps.filter((p) => !p.bedingt).map((p) => restAufwand(p))) }];
  }));
  return { zaehl, offenPT: offen, jeStrang,
    kritisch: { summe: Math.round(k.mitte * 100) / 100, min: k.min, max: k.max, kette: k.kette } };
}

/* --------------------------------------------------------------------------
   bereit — was kann jetzt starten?

   Ein Paket ist bereit, wenn es selbst READY oder BLOCKED ist und alle
   Abhängigkeiten INTEGRATED, VERIFIED oder DONE sind. WP-09 (Kette B nach
   main) ist nur die Reihenfolge des Livegangs, keine Code-Abhängigkeit.
   Externe Pakete (strang extern) erscheinen nur mit {alle: true}.
   -------------------------------------------------------------------------- */
export function bereit(pakete, { alle = false } = {}) {
  const nach = new Map(pakete.map((p) => [p.id, p]));
  return pakete.filter((p) => (alle || p.strang !== "extern") && !p.bedingt && ["READY", "BLOCKED"].includes(p.status)
    && p.abhaengigkeiten.every((a) => NUR_REIHENFOLGE.includes(a) || ERLEDIGT.includes(nach.get(a)?.status)));
}

/* --------------------------------------------------------------------------
   brief — ein Agentenauftrag als Text
   -------------------------------------------------------------------------- */
export const STANDARDREGELN = [
  "Kein Merge, kein PR, nichts an main; keine Produktion, kein VPS, keine Secrets, kein ssh ohne ausdrückliche Freigabe.",
  "Öffentliches Repo: keine Geheimnisse, Hosts, Zugangsdaten oder Personendaten in Commits, Tests oder Nachweisen.",
  "Je Befund: Test zuerst (rot auf dem alten Stand, per Commit oder eigenem Worktree — nie git checkout über ungesicherte Änderungen), dann Fix, dann grün.",
  "Keine Tests abschwächen oder abschalten; jede Anpassung eines bestehenden Tests im Nachweis begründen.",
  "Tests mit möglicher Endlosschleife gegen alten Code nur mit Zeitgrenze.",
  "Laptop schwach: nur gezielte Tests lokal (werkzeug/test-kurz.mjs), Vollregression in CI.",
  "Commits als rinats-png mit den Trailern der Projektregel; Nachweis in docs/acc45/<paket>-nachweis.md.",
  "Status und Statusstufen nur in docs/acc45/work-packages.json ändern, danach node werkzeug/acc45-backlog.mjs status-schreiben.",
  "Vor Abgabe: node werkzeug/vorpruefung.mjs --paket <id>; Bericht mit Kopf-Commit, CI-Lauf-IDs, rot→grün je Befund, offenen Punkten.",
];
export const VORAB_CHECKLISTE = [
  "Basis aktuell? (git fetch; Branch von origin/integration/centric-complete)",
  "Abhängigkeiten wirklich integriert (node werkzeug/acc45-backlog.mjs bereit)?",
  "Dateibesitz laut docs/acc45/AGENTS.md geklärt (Konfliktzonen: ein Schreiber zur Zeit)?",
  "Akzeptanzkriterien als Tests formuliert, bevor Code geändert wird?",
  "Alle Schreibwege und Rollen bedacht (PUT, Anlegen, Wiederherstellen, Stempeln, Werkzeuge; SV/BR/MA)?",
];

export function brief(pakete, id) {
  const p = pakete.find((x) => x.id === id);
  if (!p) return null;
  const abh = p.abhaengigkeiten.length
    ? p.abhaengigkeiten.map((a) => `${a} (${pakete.find((x) => x.id === a)?.status ?? "?"})`).join(", ") : "keine";
  const stufen = STUFEN.map((k) => `${k}=${p.stufen[k].wert === "teilweise" ? "teilweise" : p.stufen[k].wert ? "ja" : "nein"}`).join(", ");
  return [
    `Auftrag ${p.id}: ${p.titel}`,
    `Strang ${p.strang}, Priorität ${p.prio}, Aufwand ${spanneText(p.aufwandPT)} PT, Status ${p.status}, ${p.agent ?? "–"}, Modell ${p.modell ?? "–"}`,
    `Branch: ${p.branch ?? "–"} (von origin/integration/centric-complete)`,
    `Abhängigkeiten: ${abh}`,
    `Konfliktzonen: ${p.konfliktzonen.join(", ") || "keine"}`,
    `Statusstufen: ${stufen}`,
    "",
    `Akzeptanz: ${p.akzeptanz}`,
    `Tests: ${p.tests}`,
    `Dateien: ${p.dateien}`,
    ...(p.nachweis ? [`Nachweis: ${p.nachweis}`] : []),
    ...(p.notiz ? [`Notiz: ${p.notiz}`] : []),
    "",
    "Regeln:",
    ...STANDARDREGELN.map((r) => `- ${r}`),
    "",
    "Vorab-Checkliste:",
    ...VORAB_CHECKLISTE.map((r) => `- [ ] ${r}`),
  ].join("\n");
}

/* --------------------------------------------------------------------------
   Lokale Felder (agentId, letzterCheckpoint, abbruch) — nie im öffentlichen
   JSON. Sie liegen in einer Datei außerhalb des Repos, Pfad aus
   ACC45_LOKAL. Eine Datei innerhalb des Repos wird abgelehnt.
   -------------------------------------------------------------------------- */
export const LOKALE_FELDER = Object.freeze(["agentId", "letzterCheckpoint", "abbruch"]);

export function lokalerPfad(wert = process.env.ACC45_LOKAL) {
  if (!wert) return null;
  const p = path.resolve(wert);
  /* Über den echten Pfad vergleichen: Ein Symlink oder eine Junction außerhalb
     des Repos, die ins Repo zeigt, darf nicht durchgehen. Die Datei selbst
     muss noch nicht existieren — dann zählt der nächste vorhandene Ordner. */
  const echt = (x) => {
    let rest = "";
    let d = x;
    while (!existsSync(d)) { rest = path.join(path.basename(d), rest); const o = path.dirname(d); if (o === d) break; d = o; }
    return path.join(realpathSync.native(d), rest);
  };
  const rel = path.relative(realpathSync.native(REPO), echt(p));
  if (!rel.startsWith("..") && !path.isAbsolute(rel))
    throw new Error(`ACC45_LOKAL zeigt ins Repo (${rel || "."}) — lokale Felder gehören nicht ins öffentliche Repo.`);
  return p;
}
export function lokalLesen(pfad = lokalerPfad()) {
  if (!pfad || !existsSync(pfad)) return {};
  return JSON.parse(readFileSync(pfad, "utf8"));
}
export function lokalSetzen(id, werte, pfad = lokalerPfad()) {
  if (!pfad) throw new Error("ACC45_LOKAL ist nicht gesetzt.");
  for (const k of Object.keys(werte)) if (!LOKALE_FELDER.includes(k)) throw new Error(`Unbekanntes lokales Feld: ${k}`);
  const alt = lokalLesen(pfad);
  alt[id] = { ...(alt[id] || {}), ...werte };
  writeFileSync(pfad, JSON.stringify(alt, null, 2) + "\n");
  return alt[id];
}

/** Kurzstatus: Zählung, kritischer Pfad, was läuft, was bereit ist (mit lokalen Feldern, falls vorhanden). */
export function fortschritt(pakete, lokal = {}) {
  const { kritisch, offenPT, zaehl } = kennzahlen(pakete);
  const mitLokal = (p) => {
    const l = lokal[p.id] || {};
    const teile = LOKALE_FELDER.filter((f) => l[f]).map((f) => `${f}=${l[f]}`);
    return teile.length ? ` [${teile.join(", ")}]` : "";
  };
  const laufend = pakete.filter((p) => ["IN_PROGRESS", "REVIEW", "CI_FAILED"].includes(p.status));
  return [
    `Pakete ${pakete.length}: ${STATUS.filter((s) => zaehl[s]).map((s) => `${s} ${zaehl[s]}`).join(", ")}`,
    `Offen ${spanneText(offenPT)} PT (ohne extern); kritischer Pfad ${spanneText(kritisch)} PT: ${kritisch.kette.join(" → ")}`,
    `In Arbeit/Review: ${laufend.map((p) => `${p.id} ${p.status}${mitLokal(p)}`).join("; ") || "–"}`,
    `Bereit: ${bereit(pakete).map((p) => `${p.id}${mitLokal(p)}`).join(", ") || "–"}`,
  ].join("\n");
}

/* --------------------------------------------------------------------------
   Prognose: Ablaufsimulation unter Ressourcengrenze

   Je Szenario: Dauer eines Entwicklungspakets in Arbeitstagen (AT) =
   max(minDauerAT, Rest-PT × aufschlag / ptJeAgentTag). Höchstens `agenten`
   Pakete gleichzeitig; ein Paket je Konfliktzone zur selben Zeit. Externe
   Pakete belegen keinen Agenten, dauern ihre Wartezeit. Vorrang haben ACC45,
   Folgepakete und WP-19 vor Intelligence, darin die längste Restkette. Abhängigkeiten außerhalb
   des Umfangs gelten als erfüllt.
   -------------------------------------------------------------------------- */
export const UMFAENGE = Object.freeze({
  A: { titel: "ACC45-Backlog (WP-01…WP-47 + Folgepakete, ohne WP-19-Module, ohne Intelligence, ohne Release WP-42/42a)",
    auswahl: (p) => ["acc45", "folge"].includes(p.strang) && !["WP-19", "WP-42", "WP-42a"].includes(p.id) },
  B: { titel: "Technische Vollumsetzung (ACC45 + WP-19 + Intelligence, integriert und reviewt, ohne externe Freigaben, ohne Rollout WP-42)",
    auswahl: (p) => p.strang !== "extern" && p.id !== "WP-42" && !p.bedingt },
  C: { titel: "Produktionsreife (B + externe Abnahmen, Freigaben und Wartezeiten, Rollout)",
    auswahl: (p) => !p.bedingt },
});

function ptNach(s, art) { return art === "min" ? s.min : art === "max" ? s.max : mitte(s); }

export function simulieren(pakete, auswahl, sz, restFaktor = restFaktorStandard) {
  const nach = new Map(pakete.map((p) => [p.id, p]));
  const im = pakete.filter(auswahl);
  const imSet = new Set(im.map((p) => p.id));
  const dauer = new Map();
  for (const p of im) {
    if (ERLEDIGT.includes(p.status)) { dauer.set(p.id, 0); continue; }
    if (p.strang === "extern") { dauer.set(p.id, ptNach(p.wartezeitAT, sz.warte)); continue; }
    const pt = ptNach(restAufwand(p, restFaktor), sz.pt) * sz.aufschlag;
    dauer.set(p.id, pt === 0 ? 0 : Math.max(sz.minDauerAT, pt / sz.ptJeAgentTag));
  }
  const abh = (p) => p.abhaengigkeiten.filter((a) => imSet.has(a) && !NUR_REIHENFOLGE.includes(a));
  /* Restkette (bottom level) als Vorrang */
  const nachfolger = new Map(im.map((p) => [p.id, []]));
  for (const p of im) for (const a of abh(p)) nachfolger.get(a).push(p.id);
  const rang = new Map();
  const rk = (id) => { if (rang.has(id)) return rang.get(id); let m = 0; for (const n of nachfolger.get(id)) m = Math.max(m, rk(n)); const r = m + dauer.get(id); rang.set(id, r); return r; };
  for (const p of im) rk(p.id);

  /* Vorrang: ACC45, Folgepakete und WP-19 vor Intelligence (Intelligence blockiert ACC45 nie), dann längste Restkette. */
  const gruppe = (p) => (p.strang === "intelligence" ? 1 : 0);
  const ende = new Map();
  const start = new Map();
  const laufend = new Set();
  let t = 0;
  let wp39fertig = false;
  const zonen = (p) => (sz.appJsxNachWP39Frei && wp39fertig ? p.konfliktzonen.filter((z) => z !== "App.jsx") : p.konfliktzonen);
  for (let runde = 0; ende.size < im.length; runde++) {
    if (runde > 100000) throw new Error("Simulation hängt");
    const fertigBis = (id) => ende.has(id) && ende.get(id) <= t + 1e-9;
    const kandidaten = im.filter((p) => !start.has(p.id) && abh(p).every(fertigBis))
      .sort((a, b) => gruppe(a) - gruppe(b) || rang.get(b.id) - rang.get(a.id) || a.id.localeCompare(b.id));
    for (const p of kandidaten) {
      const istAgent = p.strang !== "extern" && dauer.get(p.id) > 0;
      if (istAgent) {
        const aktiv = [...laufend].map((id) => nach.get(id)).filter((q) => q.strang !== "extern" && dauer.get(q.id) > 0);
        if (aktiv.length >= sz.agenten) continue;
        const belegt = new Set(aktiv.flatMap(zonen));
        if (zonen(p).some((z) => belegt.has(z))) continue;
      }
      start.set(p.id, t); ende.set(p.id, t + dauer.get(p.id)); laufend.add(p.id);
    }
    const offen = [...laufend].map((id) => ende.get(id)).filter((e) => e > t + 1e-9);
    if (!offen.length) {
      if (ende.size < im.length && !kandidaten.length) throw new Error("Simulation: keine startbaren Pakete (Zyklus?)");
      for (const id of [...laufend]) if (ende.get(id) <= t + 1e-9) laufend.delete(id);
      continue;
    }
    t = Math.min(...offen);
    for (const id of [...laufend]) if (ende.get(id) <= t + 1e-9) { laufend.delete(id); if (id === "WP-39") wp39fertig = true; }
  }
  const arbeit = im.filter((p) => p.strang !== "extern").reduce((a, p) => a + ptNach(restAufwand(p, restFaktor), sz.pt) * sz.aufschlag, 0);
  const T = Math.max(0, ...im.map((p) => ende.get(p.id)));
  return { T, arbeit, start, ende, dauer };
}

/** n-ter Arbeitstag ab Start (Tag 1 = Start), Mo–Fr ohne Feiertage. */
export function arbeitstag(startIso, n, feiertage = []) {
  const frei = new Set(feiertage);
  const d = new Date(`${startIso}T12:00:00Z`);
  const ok = (x) => x.getUTCDay() !== 0 && x.getUTCDay() !== 6 && !frei.has(x.toISOString().slice(0, 10));
  while (!ok(d)) d.setUTCDate(d.getUTCDate() + 1);
  let k = 1;
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (ok(d)) k++; }
  return d.toISOString().slice(0, 10);
}

/** Treiberkette in einer Simulation: vom Ziel rückwärts über die zuletzt fertige Abhängigkeit.
    „(wartet auf …)“, wenn ein Paket später startete, als seine Abhängigkeiten fertig waren. */
export function treiberKette(pakete, sim, ziel) {
  const nach = new Map(pakete.map((p) => [p.id, p]));
  const kette = [];
  let id = ziel;
  while (id && sim.ende.has(id)) {
    const p = nach.get(id);
    const deps = p.abhaengigkeiten.filter((a) => sim.ende.has(a) && !NUR_REIHENFOLGE.includes(a));
    const vor = deps.sort((a, b) => sim.ende.get(b) - sim.ende.get(a) || a.localeCompare(b))[0];
    const fertigVor = vor ? sim.ende.get(vor) : 0;
    if (sim.dauer.get(id) > 0) kette.unshift(`${id}${sim.start.get(id) > fertigVor + 1e-9 ? ` (wartet auf ${p.konfliktzonen.length ? `Zone ${p.konfliktzonen.join("/")}` : "freien Agenten"})` : ""}`);
    id = vor;
  }
  return kette;
}

export function prognosen(pakete, annahmen) {
  const erg = {};
  for (const [u, def] of Object.entries(UMFAENGE)) {
    erg[u] = {};
    for (const [name, sz] of Object.entries(annahmen.szenarien)) {
      const r = simulieren(pakete, def.auswahl, sz, annahmen.restFaktor);
      const at = Math.max(1, Math.ceil(r.T - 1e-9));
      const zusatz = {};
      if (u === "C") {
        const e = (id) => r.ende.get(id) ?? 0;
        zusatz.deploy = Math.ceil(e("E-23") - 1e-9);
        zusatz.deployDatum = arbeitstag(annahmen.start, zusatz.deploy, annahmen.feiertage);
        zusatz.c1 = Math.ceil(e("E-24") - 1e-9);
        zusatz.c2 = Math.ceil(e("WP-I37") - 1e-9);
        zusatz.c1Datum = arbeitstag(annahmen.start, zusatz.c1, annahmen.feiertage);
        zusatz.c2Datum = arbeitstag(annahmen.start, zusatz.c2, annahmen.feiertage);
      }
      erg[u][name] = { at, datum: arbeitstag(annahmen.start, at, annahmen.feiertage), arbeitPT: Math.round(r.arbeit * 10) / 10,
        untergrenzeArbeit: Math.round((r.arbeit / (sz.agenten * sz.ptJeAgentTag)) * 10) / 10, sim: r, ...zusatz };
    }
  }
  return erg;
}

/* --------------------------------------------------------------------------
   Erzeugte Texte (nur aus der Quelle)
   -------------------------------------------------------------------------- */
const STRANG_TITEL = { acc45: "ACC45", wp19: "WP-19-Module", intelligence: "Intelligence", folge: "Folgepakete", extern: "Extern/Entscheidungen" };
const stufeZeichen = (s) => (s.wert === true ? "✓" : s.wert === "teilweise" ? "T" : "–");

function pfadZeile(k) { return k.kette.length ? `${k.kette.join(" → ")} = **${spanneText(k)} PT**` : "–"; }

export function pfadeJeStrang(pakete) {
  const r = {};
  for (const s of ["acc45", "folge", "wp19", "intelligence"]) r[s] = kritischerPfad(pakete, { auswahl: (p) => p.strang === s && !p.bedingt });
  r.gemeinsam = kritischerPfad(pakete, { auswahl: ENTWICKLUNG });
  r.ohneIntelligence = kritischerPfad(pakete, { auswahl: (p) => ENTWICKLUNG(p) && p.strang !== "intelligence" });
  return r;
}

function blockKennzahlen(pakete, quelle) {
  const k = kennzahlen(pakete);
  const z = (s) => k.zaehl[s];
  const pf = pfadeJeStrang(pakete);
  const zeilen = STRAENGE.map((s) => {
    const j = k.jeStrang[s];
    const ps = pakete.filter((p) => p.strang === s);
    const st = STATUS_QUELLE.map((x) => ps.filter((p) => p.status === x).length);
    return `| ${STRANG_TITEL[s]} | ${j.pakete} | ${st.join(" | ")} | ${spanneText(j.restPT)} |`;
  });
  return [
    `Erzeugt aus \`docs/acc45/work-packages.json\` (Schema ${quelle.schema}) mit \`node werkzeug/acc45-backlog.mjs status-schreiben\` — nicht von Hand ändern.`,
    "",
    `**Pakete gesamt:** ${pakete.length} · BLOCKED ${z("BLOCKED")} · READY ${z("READY")} · IN_PROGRESS ${z("IN_PROGRESS")} · REVIEW ${z("REVIEW")} · INTEGRATED ${z("INTEGRATED")} · DONE ${z("DONE")}`,
    "",
    "| Strang | Pakete | BLOCKED | READY | IN_PROGRESS | REVIEW | INTEGRATED | DONE | offener Aufwand PT |",
    "|---|---|---|---|---|---|---|---|---|",
    ...zeilen,
    "",
    `Offener Entwicklungsaufwand (ohne extern, ohne bedingtes WP-I35): **${spanneText(k.offenPT)} PT**. Integrierte Pakete zählen nicht mehr mit`
      + " (bis 2026-11-03 zählten sie bis DONE weiter); was ihnen fehlt, steht als Statusstufe und in den externen Paketen.",
    "",
    "**Kritische Pfade** (offener Aufwand, Mitte der Spanne maßgeblich):",
    "",
    `- gemeinsam: ${pfadZeile(pf.gemeinsam)}`,
    `- ohne Intelligence: ${pfadZeile(pf.ohneIntelligence)}`,
    `- ACC45: ${pfadZeile(pf.acc45)}`,
    `- Folgepakete: ${pfadZeile(pf.folge)}`,
    `- WP-19: ${pfadZeile(pf.wp19)}`,
    `- Intelligence: ${pfadZeile(pf.intelligence)}`,
  ];
}

function blockStatus(pakete, quelle) {
  const offen = pakete.filter((p) => !ERLEDIGT.includes(p.status) && p.strang !== "extern");
  const laufend = pakete.filter((p) => ["IN_PROGRESS", "REVIEW"].includes(p.status));
  const integ = pakete.filter((p) => p.status === "INTEGRATED");
  const stufenKopf = "| Paket | Status | impl. | lokal | Review | integr. | Staging | Freigabe | prod. |";
  const stufenZeile = (p) => `| ${p.id} | ${p.status} | ${STUFEN.map((s) => stufeZeichen(p.stufen[s])).join(" | ")} |`;
  const mitStufe = pakete.filter((p) => p.strang !== "extern" && STUFEN.some((s) => p.stufen[s].wert !== false));
  return [
    ...blockKennzahlen(pakete, quelle),
    "",
    "### In Arbeit / Review",
    "",
    "| Paket | Status | Branch | Notiz |",
    "|---|---|---|---|",
    ...laufend.map((p) => `| ${p.id} ${p.titel} | ${p.status} | \`${p.branch ?? "–"}\` | ${p.notiz ?? ""} |`),
    "",
    `### Bereit zum Start (${bereit(pakete).length})`,
    "",
    bereit(pakete).map((p) => `${p.id} (${p.strang}, ${spanneText(p.aufwandPT)} PT)`).join(" · ") || "–",
    "",
    `### Integriert in \`integration/centric-complete\` (${integ.length})`,
    "",
    "| Paket | Beleg (PR, Merge-Commit) | Review |",
    "|---|---|---|",
    ...integ.map((p) => `| ${p.id} ${p.titel} | ${p.stufen.integriert.beleg} | ${p.stufen.reviewt.beleg ?? "–"} |`),
    "",
    "### Statusstufen",
    "",
    "✓ belegt · T teilweise (z. B. nur Server-Teilumfang) · – nicht erreicht oder nicht belegt. „Staging“, „Freigabe“ und",
    "„prod.“ stehen nur mit Beleg auf ✓. Gezeigt sind alle Pakete mit mindestens einer erreichten Stufe; alle übrigen",
    `${offen.length - mitStufe.filter((p) => !ERLEDIGT.includes(p.status)).length} offenen Entwicklungspakete stehen auf allen Stufen auf „–“.`,
    "",
    stufenKopf,
    "|---|---|---|---|---|---|---|---|---|",
    ...mitStufe.map(stufenZeile),
  ];
}

function blockDependencies(pakete, quelle) {
  const k = kennzahlen(pakete);
  const pf = pfadeJeStrang(pakete);
  const knoten = (p) => `${p.id.replace(/[^A-Za-z0-9]/g, "_")}["${p.id}<br/>${p.status}"]`;
  const mermaid = ["```mermaid", "flowchart LR"];
  for (const s of STRAENGE) {
    mermaid.push(`  subgraph ${s}[${STRANG_TITEL[s]}]`);
    for (const p of pakete.filter((x) => x.strang === s && !ERLEDIGT.includes(x.status) && !x.bedingt)) mermaid.push(`    ${knoten(p)}`);
    mermaid.push("  end");
  }
  const offenId = new Set(pakete.filter((p) => !ERLEDIGT.includes(p.status) && !p.bedingt).map((p) => p.id));
  for (const p of pakete) if (offenId.has(p.id)) for (const a of p.abhaengigkeiten)
    if (offenId.has(a) && !NUR_REIHENFOLGE.includes(a)) mermaid.push(`  ${a.replace(/[^A-Za-z0-9]/g, "_")} --> ${p.id.replace(/[^A-Za-z0-9]/g, "_")}`);
  mermaid.push("```");
  const zeilen = pakete.map((p) => `| ${p.id} | ${p.strang} | ${p.prio} | ${spanneText(p.aufwandPT)} | ${spanneText(restAufwand(p))} | ${p.abhaengigkeiten.join(", ") || "–"} | ${p.konfliktzonen.join(", ") || "–"} | ${p.modell ?? "–"} | ${p.status} |`);
  return `# ACC45 – Abhängigkeiten und kritische Pfade

Erzeugt von \`werkzeug/acc45-backlog.mjs\` aus \`docs/acc45/work-packages.json\` (nicht von Hand ändern).

**Kritischer Pfad gemeinsam** (offener Entwicklungsaufwand, ohne extern): ${pfadZeile(pf.gemeinsam)}
**Ohne Intelligence:** ${pfadZeile(pf.ohneIntelligence)}
**Offener Entwicklungsaufwand:** ${spanneText(k.offenPT)} PT in ${pakete.filter((p) => ENTWICKLUNG(p) && !ERLEDIGT.includes(p.status)).length} Paketen (zuzüglich ${pakete.filter((p) => p.strang === "extern" && !ERLEDIGT.includes(p.status)).length} externe Abnahmen/Entscheidungen)

WP-09 ist nur Livegang-Reihenfolge und zählt im Pfad nicht als Abhängigkeit. Der Graph zeigt nur offene Pakete.

${mermaid.join("\n")}

| Paket | Strang | Prio | PT | Rest-PT | hängt ab von | Konfliktzonen | Modell | Status |
|---|---|---|---|---|---|---|---|---|
${zeilen.join("\n")}
`;
}

function blockRoadmap(pakete, quelle) {
  const k = kennzahlen(pakete);
  const pf = pfadeJeStrang(pakete);
  const pr = prognosen(pakete, quelle.annahmen);
  const r = (u) => `${pr[u].optimistisch.datum} / ${pr[u].realistisch.datum} / ${pr[u].probleme.datum}`;
  return [
    `Stand der Entwicklung aus [\`docs/acc45/work-packages.json\`](acc45/work-packages.json) (erzeugt, nicht von Hand ändern):`,
    `${pakete.length} Pakete, davon ${k.zaehl.INTEGRATED} integriert und ${k.zaehl.DONE} produktiv; offener Entwicklungsaufwand ${spanneText(k.offenPT)} PT`
      + ` (ACC45 ${spanneText(k.jeStrang.acc45.restPT)}, Folgepakete ${spanneText(k.jeStrang.folge.restPT)}, WP-19 ${spanneText(k.jeStrang.wp19.restPT)},`
      + ` Intelligence ${spanneText(k.jeStrang.intelligence.restPT)}). Kritischer Pfad gemeinsam ${spanneText(pf.gemeinsam)} PT.`,
    `Prognosen (optimistisch / realistisch / bei Problemen, Arbeitstage ab ${quelle.annahmen.start}): A ACC45-Backlog ${r("A")};`
      + ` B technische Vollumsetzung ${r("B")}; C Produktionsreife ${r("C")}.`
      + ` Rechnung und Annahmen: [\`docs/acc45/GESAMTPLAN.md\`](acc45/GESAMTPLAN.md).`,
  ];
}

function blockRoadmapAcc45(pakete, quelle) {
  const k = kennzahlen(pakete);
  const pf = pfadeJeStrang(pakete);
  return [
    "| Größe | Wert (erzeugt aus `work-packages.json`) |",
    "|---|---|",
    `| Pakete | ${pakete.length} (ACC45 ${k.jeStrang.acc45.pakete}, Folge ${k.jeStrang.folge.pakete}, WP-19 ${k.jeStrang.wp19.pakete}, Intelligence ${k.jeStrang.intelligence.pakete}, extern ${k.jeStrang.extern.pakete}) |`,
    `| integriert / produktiv | ${k.zaehl.INTEGRATED} / ${k.zaehl.DONE} |`,
    `| offener Entwicklungsaufwand | ${spanneText(k.offenPT)} PT |`,
    `| kritischer Pfad ohne Intelligence | ${pfadZeile(pf.ohneIntelligence)} |`,
    `| kritischer Pfad gemeinsam | ${pfadZeile(pf.gemeinsam)} |`,
    "| Zeitprognosen | [`GESAMTPLAN.md`](GESAMTPLAN.md) |",
  ];
}

const SZ_TITEL = { optimistisch: "optimistisch", realistisch: "realistisch", probleme: "bei Problemen" };

function blockPrognose(pakete, quelle) {
  const a = quelle.annahmen;
  const pr = prognosen(pakete, a);
  const zeilen = [];
  for (const u of ["A", "B", "C"]) {
    zeilen.push(`**${u} – ${UMFAENGE[u].titel}**`, "");
    zeilen.push("| Szenario | Rest-PT (Entwicklung) | Untergrenze Arbeit ÷ Kapazität | Simulierte Dauer | fertig am |");
    zeilen.push("|---|---|---|---|---|");
    for (const s of Object.keys(a.szenarien)) {
      const e = pr[u][s];
      zeilen.push(`| ${SZ_TITEL[s] ?? s} | ${zahl(e.arbeitPT)} | ${zahl(e.untergrenzeArbeit)} AT | **${e.at} AT** | **${e.datum}** |`);
    }
    if (u === "C") {
      zeilen.push("", "| Szenario | Produktiv-Deploy (E-23) | C1: ACC45 + WP-19 produktionsreif (Pilot E-24 bestanden) | C2: Intelligence produktionsreif (WP-I37) |", "|---|---|---|---|");
      for (const s of Object.keys(a.szenarien)) zeilen.push(`| ${SZ_TITEL[s] ?? s} | ${pr.C[s].deploy} AT → ${pr.C[s].deployDatum} | ${pr.C[s].c1} AT → ${pr.C[s].c1Datum} | ${pr.C[s].c2} AT → ${pr.C[s].c2Datum} |`);
    }
    const sim = pr[u].realistisch.sim;
    const ziele = u === "A" ? [] : u === "B" ? [["B", null]] : [["C1", "E-24"], ["C2", "WP-I37"]];
    if (u === "A" || u === "B") {
      const letzt = [...sim.ende.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0];
      ziele.splice(0, ziele.length, [u, letzt]);
    }
    for (const [n, z] of ziele) zeilen.push("", `Treiberkette ${n} (realistisch): ${treiberKette(pakete, sim, z).join(" → ")}`);
    zeilen.push("");
  }
  zeilen.push("| Parameter | " + Object.keys(a.szenarien).map((s) => SZ_TITEL[s] ?? s).join(" | ") + " |");
  zeilen.push("|---|" + Object.keys(a.szenarien).map(() => "---").join("|") + "|");
  const par = (n, f) => zeilen.push(`| ${n} | ${Object.values(a.szenarien).map(f).join(" | ")} |`);
  par("gleichzeitige Entwicklungsagenten", (s) => s.agenten);
  par("PT-Äquivalent je Agent und Arbeitstag", (s) => zahl(s.ptJeAgentTag));
  par("Kapazität PT je Arbeitstag", (s) => zahl(s.agenten * s.ptJeAgentTag));
  par("Mindestdauer je Paket (Review-Schleife)", (s) => `${zahl(s.minDauerAT)} AT`);
  par("PT aus der Spanne", (s) => (s.pt === "mitte" ? "Mitte" : s.pt));
  par("Aufschlag Nacharbeit", (s) => `× ${zahl(s.aufschlag)}`);
  par("externe Wartezeit aus der Spanne", (s) => (s.warte === "mitte" ? "Mitte" : s.warte));
  par("App.jsx nach WP-39 frei", (s) => (s.appJsxNachWP39Frei ? "ja" : "nein"));
  zeilen.push("", `Rest-Anteil laufender Pakete ohne eigenes \`restPT\`: IN_PROGRESS ${zahl(a.restFaktor.IN_PROGRESS)}, REVIEW ${zahl(a.restFaktor.REVIEW)}. Tag 1 = ${a.start}; Arbeitstage Mo–Fr ohne ${a.feiertage.join(", ")}.`);
  return zeilen;
}

function blockWellen(pakete, quelle) {
  const a = quelle.annahmen;
  const sz = a.szenarien.realistisch;
  const r = simulieren(pakete, UMFAENGE.C.auswahl, sz, a.restFaktor);
  const offen = pakete.filter((p) => UMFAENGE.C.auswahl(p) && !ERLEDIGT.includes(p.status) && r.dauer.get(p.id) > 0);
  const woche = (t) => Math.floor(t / 5) + 1;
  const nachWoche = new Map();
  for (const p of offen) {
    const w = woche(r.start.get(p.id));
    if (!nachWoche.has(w)) nachWoche.set(w, []);
    nachWoche.get(w).push(p);
  }
  const zeilen = ["| Welle (5 AT) | ab | Entwicklung (Start, Modell, Konfliktzonen) | extern / Entscheidungen (Start) |", "|---|---|---|---|"];
  for (const w of [...nachWoche.keys()].sort((x, y) => x - y)) {
    const ps = nachWoche.get(w).sort((x, y) => r.start.get(x.id) - r.start.get(y.id) || x.id.localeCompare(y.id));
    const dev = ps.filter((p) => p.strang !== "extern").map((p) => `${p.id} (${p.modell ?? "–"}${p.konfliktzonen.length ? `; ${p.konfliktzonen.join(", ")}` : ""})`);
    const ext = ps.filter((p) => p.strang === "extern").map((p) => p.id);
    zeilen.push(`| ${w} | ${arbeitstag(a.start, (w - 1) * 5 + 1, a.feiertage)} | ${dev.join(" · ") || "–"} | ${ext.join(" · ") || "–"} |`);
  }
  return zeilen;
}

/* Welche Blöcke in welcher Datei (Name '' = <!-- AUTO:BEGIN --> ohne Namen). */
export const AUTO_BLOECKE = Object.freeze([
  { datei: "docs/acc45/STATUS.md", name: "", text: blockStatus },
  { datei: "docs/acc45/GESAMTPLAN.md", name: "kennzahlen", text: blockKennzahlen },
  { datei: "docs/acc45/GESAMTPLAN.md", name: "prognose", text: blockPrognose },
  { datei: "docs/acc45/GESAMTPLAN.md", name: "wellen", text: blockWellen },
  { datei: "docs/acc45/ROADMAP.md", name: "rechnung", text: blockRoadmapAcc45 },
  { datei: "docs/ROADMAP.md", name: "entwicklung", text: blockRoadmap },
]);

const marke = (name) => [`<!-- AUTO:BEGIN${name ? ` ${name}` : ""} -->`, `<!-- AUTO:END${name ? ` ${name}` : ""} -->`];

/** Ersetzt den Inhalt zwischen den Markern; null, wenn die Marker fehlen. */
export function blockErsetzen(text, name, inhalt) {
  const [a, b] = marke(name);
  const i = text.indexOf(a);
  const j = text.indexOf(b, i + a.length);
  if (i < 0 || j < 0) return null;
  return `${text.slice(0, i + a.length)}\n${inhalt.join("\n")}\n${text.slice(j)}`;
}

/** Kanonisches JSON: kompakt je Stufe, Listen in einer Zeile, abgeleitete Kopfzahlen. */
export function jsonText(pakete, quelle) {
  const k = kennzahlen(pakete);
  for (const p of pakete) for (const f of LOKALE_FELDER) if (f in p) throw new Error(`${p.id}: lokales Feld ${f} im öffentlichen JSON`);
  const kopf = {
    schema: 2,
    hinweis: "Einzige maßgebliche Quelle für Pakete, Status, Statusstufen, Aufwand und Abhängigkeiten. Ändern nur hier, danach node werkzeug/acc45-backlog.mjs status-schreiben. Kopfzahlen (anzahl … kritischerPfad) werden erzeugt.",
    anzahl: pakete.length, statusZaehlung: Object.fromEntries(STATUS_QUELLE.map((s) => [s, k.zaehl[s]])),
    jeStrang: k.jeStrang, offenerAufwandPT: k.offenPT, kritischerPfad: k.kritisch,
    annahmen: quelle.annahmen ?? null,
  };
  const ein = (v) => JSON.stringify(v);
  const paketText = (p) => {
    const zeilen = Object.entries(p).map(([key, v]) => {
      if (key === "stufen") return `      "stufen": {\n${STUFEN.map((s) => `        ${ein(s)}: ${ein(v[s])}`).join(",\n")}\n      }`;
      return `      ${ein(key)}: ${ein(v)}`;
    });
    return `    {\n${zeilen.join(",\n")}\n    }`;
  };
  const kopfText = JSON.stringify(kopf, null, 2).replace(/\n}$/, "");
  return `${kopfText},\n  "pakete": [\n${pakete.map(paketText).join(",\n")}\n  ]\n}\n`;
}

/** Alle Soll-Inhalte: Datei → Text (JSON, DEPENDENCIES.md, Dateien mit AUTO-Blöcken). */
export function sollInhalte(pakete, quelle, wurzel = REPO) {
  const soll = new Map();
  soll.set("docs/acc45/work-packages.json", jsonText(pakete, quelle));
  soll.set("docs/acc45/DEPENDENCIES.md", blockDependencies(pakete, quelle));
  for (const b of AUTO_BLOECKE) {
    const p = path.join(wurzel, b.datei);
    const basis = soll.get(b.datei) ?? (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : null);
    if (basis === null) continue;
    const neu = blockErsetzen(basis, b.name, b.text(pakete, quelle));
    soll.set(b.datei, neu ?? basis);
  }
  return soll;
}

/** Abweichungen zwischen Soll und Ist (für Prüfung und Test). */
export function abweichungen(wurzel = REPO) {
  const quelle = quelleLesen(path.join(wurzel, "docs", "acc45", "work-packages.json"));
  const pakete = paketeAus(quelle.pakete);
  const fehler = pruefeQuelle(pakete).map((x) => `Quelle: ${x}`);
  const soll = sollInhalte(pakete, quelle, wurzel);
  for (const [datei, text] of soll) {
    const p = path.join(wurzel, datei);
    if (!existsSync(p)) { fehler.push(`${datei}: fehlt`); continue; }
    if (readFileSync(p, "utf8").replace(/\r\n/g, "\n") !== text) fehler.push(`${datei}: weicht von work-packages.json ab`);
  }
  for (const b of AUTO_BLOECKE) {
    const p = path.join(wurzel, b.datei);
    if (existsSync(p) && blockErsetzen(readFileSync(p, "utf8"), b.name, []) === null) fehler.push(`${b.datei}: AUTO-Block „${b.name || "(ohne Namen)"}“ fehlt`);
  }
  return fehler;
}

/** Schreibt JSON (normalisiert), DEPENDENCIES.md und AUTO-Blöcke. Kompatibel: schreiben(pakete, ziel, heute). */
export function schreiben(pakete, ziel = path.join(REPO, "docs", "acc45"), heute = null) {
  const standardZiel = path.resolve(ziel) === path.join(REPO, "docs", "acc45");
  const quelle = standardZiel && existsSync(QUELLE) ? quelleLesen() : { schema: 2, annahmen: null };
  void heute;                                     // früher Stand-Datum; erzeugte Inhalte hängen nicht von der Uhr ab
  const fehler = pruefeQuelle(pakete);
  if (standardZiel && fehler.length) throw new Error(`Quelle ungültig:\n${fehler.join("\n")}`);
  const json = jsonText(pakete, quelle);
  writeFileSync(path.join(ziel, "work-packages.json"), json);
  writeFileSync(path.join(ziel, "DEPENDENCIES.md"), blockDependencies(pakete, quelle));
  if (standardZiel) {
    for (const [datei, text] of sollInhalte(pakete, quelle)) writeFileSync(path.join(REPO, datei), text);
  }
  const k = kennzahlen(pakete);
  return { anzahl: pakete.length, zaehl: k.zaehl, offenPT: k.offenPT, kritisch: k.kritisch };
}

function prognoseText(pakete, quelle) {
  const pr = prognosen(pakete, quelle.annahmen);
  const z = [];
  for (const u of ["A", "B", "C"]) {
    z.push(`${u}: ${UMFAENGE[u].titel}`);
    for (const s of Object.keys(quelle.annahmen.szenarien)) {
      const e = pr[u][s];
      z.push(`  ${s.padEnd(13)} ${String(e.at).padStart(4)} AT → ${e.datum}  (Rest ${zahl(e.arbeitPT)} PT, Untergrenze ${zahl(e.untergrenzeArbeit)} AT)`
        + (u === "C" ? `  Deploy ${e.deployDatum}, C1 ${e.c1Datum}, C2 ${e.c2Datum}` : ""));
    }
  }
  return z.join("\n");
}

export function main(argv, say = (s) => console.log(s)) {
  const [befehl, ...rest] = argv;
  if (!befehl || befehl === "status-schreiben") { say(JSON.stringify(schreiben(paketeAus()))); return 0; }
  const pakete = paketeAus();
  if (befehl === "pruefen") {
    const f = abweichungen();
    if (!f.length) { say("OK: Quelle gültig, erzeugte Dateien stimmen mit work-packages.json überein."); return 0; }
    for (const x of f) say(`ABWEICHUNG: ${x}`);
    say("Beheben: Quelle korrigieren, dann node werkzeug/acc45-backlog.mjs status-schreiben");
    return 1;
  }
  if (befehl === "bereit") {
    for (const p of bereit(pakete, { alle: rest.includes("--alle") })) say(`${p.id}  ${p.prio}  ${spanneText(p.aufwandPT)} PT  ${p.status}  ${p.strang}  ${p.titel}`);
    return 0;
  }
  if (befehl === "brief") {
    const text = brief(pakete, rest[0]);
    if (!text) { say(`Unbekanntes Paket: ${rest[0] ?? "(fehlt)"}`); return 2; }
    say(text); return 0;
  }
  if (befehl === "fortschritt") { say(fortschritt(pakete, lokalLesen())); return 0; }
  if (befehl === "kritischer-pfad") {
    const pf = pfadeJeStrang(pakete);
    const welche = rest[0] ? [rest[0]] : Object.keys(pf);
    for (const w of welche) {
      if (!pf[w]) { say(`Unbekannter Strang: ${w} (${Object.keys(pf).join(", ")})`); return 2; }
      say(`${w}: ${pf[w].kette.join(" → ") || "–"} = ${spanneText(pf[w])} PT`);
    }
    return 0;
  }
  if (befehl === "prognose") { say(prognoseText(pakete, quelleLesen())); return 0; }
  if (befehl === "lokal") {
    /* lokal <id> feld=wert … — nur in die Datei aus ACC45_LOKAL. */
    const [id, ...paare] = rest;
    if (!pakete.some((p) => p.id === id)) { say(`Unbekanntes Paket: ${id ?? "(fehlt)"}`); return 2; }
    const werte = Object.fromEntries(paare.map((x) => { const i = x.indexOf("="); return [x.slice(0, i), x.slice(i + 1)]; }));
    say(JSON.stringify(lokalSetzen(id, werte))); return 0;
  }
  say("Aufruf: node werkzeug/acc45-backlog.mjs [status-schreiben | pruefen | bereit [--alle] | brief <id> | fortschritt | kritischer-pfad [strang] | prognose | lokal <id> feld=wert …]");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`FEHLER: ${e.message}`); process.exitCode = 2; }
}

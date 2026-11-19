#!/usr/bin/env node
/* ==========================================================================
   DURCHSATZ — Durchsatz-Dashboard aus GitHub-Daten (nur gemessene Werte)

     node werkzeug/durchsatz.mjs                    Markdown nach stdout und docs/acc45/DURCHSATZ-DASHBOARD.md
     node werkzeug/durchsatz.mjs --json             JSON statt Markdown (schreibt nichts)
     node werkzeug/durchsatz.mjs --nicht-schreiben  nur stdout
     node werkzeug/durchsatz.mjs --aktualisieren    Cache ignorieren (nur offene PRs werden ohnehin neu gelesen)
     node werkzeug/durchsatz.mjs --cache <Ordner>   Cache-Ordner (Vorgabe <tmp>/centric-durchsatz-cache)
     node werkzeug/durchsatz.mjs --basis <Branch>   Zielzweig der PRs (Vorgabe integration/release-v4)
     node werkzeug/durchsatz.mjs ereignis --pr N --art review-start|review-ende|korrekturrunde|fehler-nachtraeglich [--notiz "…"]

   Grundsätze
   - Nur Node-Bordmittel und die gh-CLI (nur lesend: `gh pr list`, `gh api` GET).
   - Was nicht aus den Daten folgt, steht als „nicht messbar“ mit Grund da.
   - Review-Wartezeit ist aus GitHub NICHT messbar (unabhängige Reviews laufen
     über Subagenten, nicht als GitHub-Reviews). Optional gibt der Koordinator
     Ereignisse ein (docs/acc45/durchsatz-ereignisse.json, JSON-Zeilen).
   - Commits sind nicht die Kennzahl. Kernmetrik: abnahmereife, integrierte
     Funktionalität (siehe docs/acc45/DURCHSATZ-ANALYSE.md, Abschnitt 2).
   - Die reinen Rechenfunktionen bekommen ihre Daten als Argument (Tests ohne Netz).
   ========================================================================== */
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
export const EREIGNIS_DATEI = "docs/acc45/durchsatz-ereignisse.json";
export const DASHBOARD_DATEI = "docs/acc45/DURCHSATZ-DASHBOARD.md";
export const EREIGNIS_ARTEN = Object.freeze(["review-start", "review-ende", "korrekturrunde", "fehler-nachtraeglich"]);
export const CI_NAME = "Prüfung";
const MIN_N_FENSTER = 5;
export const VORGAENGER_BASIS = "integration/centric-complete";
const MIN_TAGE_KORRELATION = 7;
const STUNDE = 3600 * 1000;
const TAG = 24 * STUNDE;

/* ---------- reine Hilfsfunktionen ---------- */

export function zeit(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function median(liste) {
  const a = liste.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Zusammenfassung: n, Median, min, max, p90 (nächster Rang). */
export function statistik(liste) {
  const a = liste.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return { n: 0, median: null, min: null, max: null, p90: null };
  return { n: a.length, median: median(a), min: a[0], max: a[a.length - 1], p90: a[Math.min(a.length - 1, Math.ceil(0.9 * a.length) - 1)] };
}

export function tagSchluessel(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Titelklasse nach Präfix. Reihenfolge ist Teil der Definition. */
export function titelKlasse(titel) {
  const t = String(titel || "").trim();
  if (/^(SSOT-Werkzeug|Werkzeug|Test\b|CI\b|QS-\d|Smoke|Prozess|Barrierefreiheit-Messung)/i.test(t)) return "test-infra";
  if (/^(SSOT|Backlog|Koordination|WIEDERAUFNAHME)/i.test(t)) return "ssot";
  if (/^(Merge)\b/i.test(t)) return "merge";
  if (/(nachhol)?review\b/i.test(t) && /^(Review|Nachholreview)/i.test(t)) return "review";
  if (/^(Doku|Docs|Abnahme|Bericht|Analyse)/i.test(t)) return "docs";
  if (/^(Fix|Hotfix|Security|Sicherheit)\b|^fix\(|^fix:/i.test(t)) return "fix";
  return "feature";
}

/** Klassen, die als „Funktionalität“ zählen (ohne SSOT-/Doku-/Merge-/Review-/Infrastruktur-Rauschen). */
export const FUNKTIONSKLASSEN = Object.freeze(["feature", "fix"]);

/** Referenzierte Vor-PR-Nummern (#N) in einem Text, ohne die eigene. */
export function referenzen(text, eigene) {
  const s = new Set();
  for (const m of String(text || "").matchAll(/(?:^|[^\w&])#(\d{1,5})\b/g)) {
    const n = Number(m[1]);
    if (n !== eigene) s.add(n);
  }
  return [...s];
}

/* ---------- Kennzahlen je PR ---------- */

/**
 * pr: normalisierter Datensatz
 *  { number, title, body, base, head, createdAt, mergedAt, closedAt, state, additions, deletions, changedFiles,
 *    headSha, commits:[{sha,date}], runs:[{name,event,sha,conclusion,status,created,started,updated}] }
 */
export function prKennzahlen(pr) {
  const erstellt = zeit(pr.createdAt);
  const gemergt = zeit(pr.mergedAt);
  const geschlossen = zeit(pr.closedAt);
  const commits = Array.isArray(pr.commits) ? pr.commits : [];
  // Nachbesserungs-Pushes (Proxy): Commits, die später als 5 Minuten nach Anlage des PR entstanden sind.
  // Force-Pushes und rebasierte Commits verfälschen das (Committer-Datum); deshalb nur „Proxy“.
  const nach = commits.filter((c) => erstellt != null && zeit(c.date) != null && zeit(c.date) > erstellt + 5 * 60 * 1000);
  // Pushrunden (Proxy): Zahl verschiedener Commit-Tage-Minuten-Gruppen ist nicht ableitbar; wir zählen die
  // verschiedenen Köpfe, für die ein CI-Lauf existiert (jeder neue Push erzeugt dort einen Lauf).
  const ci = (Array.isArray(pr.runs) ? pr.runs : []).filter((r) => r.name === CI_NAME && r.event === "pull_request");
  const koepfe = new Set(ci.map((r) => r.sha));
  const aufHead = ci.filter((r) => r.sha === pr.headSha);
  const start = aufHead.length ? Math.min(...aufHead.map((r) => zeit(r.created) ?? Infinity)) : null;
  const gruen = aufHead.filter((r) => r.conclusion === "success");
  const ende = gruen.length ? Math.max(...gruen.map((r) => zeit(r.updated) ?? -Infinity)) : null;
  const ciDauer = start != null && Number.isFinite(start) && ende != null && Number.isFinite(ende) ? ende - start : null;
  const queue = aufHead
    .map((r) => (zeit(r.started) != null && zeit(r.created) != null ? zeit(r.started) - zeit(r.created) : null))
    .filter((x) => x != null);
  return {
    nummer: pr.number,
    titel: pr.title,
    klasse: titelKlasse(pr.title),
    basis: pr.base,
    gemergt: gemergt != null,
    erstellt,
    gemergtAm: gemergt,
    geschlossenAm: geschlossen,
    leadMs: gemergt != null && erstellt != null ? gemergt - erstellt : null,
    zeilen: (pr.additions || 0) + (pr.deletions || 0),
    dateien: pr.changedFiles ?? null,
    commits: commits.length,
    commitsNachAnlage: nach.length,
    ciKoepfe: koepfe.size,
    ciDauerMs: ciDauer,
    ciQueueMs: queue.length ? Math.max(...queue) : null,
    ciFehlschlaege: ci.filter((r) => r.conclusion === "failure").length,
    ciAbgebrochen: ci.filter((r) => r.conclusion === "cancelled").length,
    ciLaeufe: ci.length,
    mergeNachCiMs: gemergt != null && ende != null ? gemergt - ende : null,
    // Nachbesserungsfix (Proxy): Fix-Klasse, die einen früheren PR per #N nennt
    verweise: referenzen(`${pr.title}\n${pr.body || ""}`, pr.number),
    verweiseTitel: referenzen(pr.title, pr.number),
  };
}

/* ---------- Aggregate ---------- */

export function proTag(kennzahlen, feld = "gemergtAm") {
  const m = new Map();
  for (const k of kennzahlen) {
    if (k[feld] == null) continue;
    const t = tagSchluessel(k[feld]);
    m.set(t, (m.get(t) || 0) + 1);
  }
  return m;
}

/** Zahl gleichzeitig offener PRs je Tag (angelegt vor Tagesende, nicht vor Tagesbeginn beendet). */
export function parallelOffenProTag(kennzahlen, vonMs, bisMs) {
  const m = new Map();
  for (let t = Math.floor(vonMs / TAG) * TAG; t <= bisMs; t += TAG) {
    const ende = t + TAG;
    let n = 0;
    for (const k of kennzahlen) {
      const beendet = k.gemergtAm ?? k.geschlossenAm ?? Infinity;
      if (k.erstellt != null && k.erstellt < ende && beendet >= t) n++;
    }
    m.set(tagSchluessel(t), n);
  }
  return m;
}

/** Abstände aufeinanderfolgender Merges (ms), aufsteigend nach Zeit. */
export function mergeAbstaende(kennzahlen) {
  const z = kennzahlen.map((k) => k.gemergtAm).filter((x) => x != null).sort((a, b) => a - b);
  const d = [];
  for (let i = 1; i < z.length; i++) d.push(z[i] - z[i - 1]);
  return d;
}

export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Fenster (jetzt-7d, jetzt] gegen (jetzt-14d, jetzt-7d] über gemergte PRs. */
export function fensterVergleich(kennzahlen, jetzt, tage = 7) {
  const f = (von, bis) => kennzahlen.filter((k) => k.gemergtAm != null && k.gemergtAm > von && k.gemergtAm <= bis);
  const aktuell = f(jetzt - tage * TAG, jetzt);
  const davor = f(jetzt - 2 * tage * TAG, jetzt - tage * TAG);
  const werte = (liste) => ({
    n: liste.length,
    funktion: liste.filter((k) => FUNKTIONSKLASSEN.includes(k.klasse)).length,
    medianLeadH: stunden(median(liste.map((k) => k.leadMs))),
    medianCiMin: minuten(median(liste.map((k) => k.ciDauerMs))),
    nCi: liste.filter((k) => k.ciDauerMs != null).length,
    medianNachPush: median(liste.map((k) => k.commitsNachAnlage)),
    fehlschlaegeSumme: liste.reduce((s, k) => s + k.ciFehlschlaege, 0),
    nachbesserungsfix: liste.filter((k) => k.klasse === "fix" && k.verweise.length).length,
  });
  return { aktuell: werte(aktuell), davor: werte(davor), ausreichend: aktuell.length >= MIN_N_FENSTER && davor.length >= MIN_N_FENSTER, mindestN: MIN_N_FENSTER };
}

const stunden = (ms) => (ms == null ? null : ms / STUNDE);
const minuten = (ms) => (ms == null ? null : ms / 60000);

/* ---------- Arbeitspakete: „ausführbar, aber unbearbeitet“ ---------- */

/** Heuristik (Proxy): Betreiber-/Extern-Blockade steht im Notiztext. */
export const BETREIBER_MUSTER = /Betreiber(entscheidung|-?freigabe|aufgabe)?|Rechtsfreigabe|Staging-Abnahme|Produktiv-Deploy|Merge nach main|extern(e|er|en)? (Abnahme|Prüf|Pen)|wartet auf (den )?Betreiber|Entscheidung (des|durch den) Betreibers?/i;

/**
 * Definition „ausführbar-unbearbeitet“ (Proxy):
 *  - status ∈ {READY, IN_PROGRESS, BLOCKED}
 *  - jede Abhängigkeit hat Status INTEGRATED oder DONE (offene Abhängigkeiten leer)
 *  - kein offener PR aus offenePr (Nummern) steht im Feld pr
 *  - nicht betreiber-blockiert (Notiz/Akzeptanz trifft BETREIBER_MUSTER → separat gezählt)
 */
export function ausfuehrbar(workPackages, offenePr) {
  const pakete = workPackages.pakete || [];
  const status = new Map(pakete.map((p) => [p.id, p.status]));
  const offen = new Set((offenePr || []).map((n) => `#${n}`));
  const liste = [];
  const betreiberBlockiert = [];
  let mitOffenemPr = 0;
  for (const p of pakete) {
    if (!["READY", "IN_PROGRESS", "BLOCKED"].includes(p.status)) continue;
    const offeneDeps = (p.abhaengigkeiten || []).filter((d) => !["INTEGRATED", "DONE"].includes(status.get(d)));
    if (offeneDeps.length) continue;
    if ((p.pr || []).some((n) => offen.has(String(n)))) { mitOffenemPr++; continue; }
    const text = `${p.notiz || ""} ${p.akzeptanz || ""}`;
    const eintrag = { id: p.id, titel: p.titel, status: p.status, prio: p.prio, strang: p.strang, aufwandPT: p.aufwandPT || null,
      konfliktzonen: p.konfliktzonen || [], abhaengigkeiten: p.abhaengigkeiten || [] };
    if (BETREIBER_MUSTER.test(text)) betreiberBlockiert.push(eintrag);
    else liste.push(eintrag);
  }
  return { ausfuehrbar: liste, betreiberBlockiert, mitOffenemPr };
}

/* ---------- SSOT-Verlauf (Kernmetrik) ---------- */

/**
 * versionen: aufsteigend nach Zeit [{ zeit:ms, commit, pakete:{ id:{status, lokalGetestet:bool} } }]
 * Liefert Übergänge: Paket wird erstmals INTEGRATED/DONE bzw. lokalGetestet true.
 */
export function ssotUebergaenge(versionen) {
  const ergebnis = { integriert: [], lokalGetestet: [] };
  const gesehenInt = new Set();
  const gesehenLg = new Set();
  let vorher = null;
  for (const v of versionen) {
    for (const [id, p] of Object.entries(v.pakete)) {
      const istInt = p.status === "INTEGRATED" || p.status === "DONE";
      if (vorher) {
        const alt = vorher.pakete[id];
        const warInt = alt && (alt.status === "INTEGRATED" || alt.status === "DONE");
        if (istInt && !warInt && !gesehenInt.has(id)) { ergebnis.integriert.push({ id, zeit: v.zeit, commit: v.commit }); gesehenInt.add(id); }
        if (p.lokalGetestet && !(alt && alt.lokalGetestet) && !gesehenLg.has(id)) { ergebnis.lokalGetestet.push({ id, zeit: v.zeit, commit: v.commit }); gesehenLg.add(id); }
      }
    }
    vorher = v;
  }
  return ergebnis;
}

export function tageszaehlung(liste) {
  const m = new Map();
  for (const e of liste) { const t = tagSchluessel(e.zeit); m.set(t, (m.get(t) || 0) + 1); }
  return m;
}

/* ---------- Konfliktproxy aus Git-Betreffzeilen ---------- */

/** Paketkennung am Anfang einer Betreffzeile (WP-19.0, SI-P6, IMP-2, WP-I13 …) oder null. */
export function paketKennung(betreff) {
  const m = String(betreff || "").match(/^(WP-[A-Z]?\d+[a-z]?(?:\.\d+)?|SI-P\d+|IMP-\d+|OPT-\d+[-A-Z]*|QS-\d+|RB-\d+|ABN-[A-Z]\d+)/);
  return m ? m[1] : null;
}

/** Betreffzeilen → Zahl der Paket-/Kettenkonflikt-Auflösungen (Proxy). */
export function konfliktProxy(commits) {
  const muster = {
    kette: /package\.json:\s*Kette|package-kette-vereinigen|Kette[n]?\s+vereinig/i,
    mergeAufloesung: /^Merge\b.*(resolve|konflikt|auflös|aufgelöst)/i,
    konfliktWort: /konflikt|conflict/i,
    // Review-/Befund-Nachbesserung laut Betreffzeile (Proxy für Korrekturschleifen; Reviews selbst sind kein GitHub-Ereignis)
    reviewBefund: /review|befund|nachbesserung|nachtrag/i,
  };
  const r = { kette: [], mergeAufloesung: [], konfliktWort: [], reviewBefund: [] };
  for (const c of commits) {
    const text = c.betreff || "";
    for (const k of Object.keys(muster)) if (muster[k].test(text) || (k === "kette" && muster[k].test(c.rumpf || ""))) r[k].push(c);
  }
  return r;
}

/** Review-/Befund-Commits je Paket (Proxy), absteigend. */
export function reviewJePaket(commits) {
  const m = new Map();
  for (const c of commits) { const k = paketKennung(c.betreff); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10);
}

/* ---------- Ereignisdatei ---------- */

export function ereignisZeile({ pr, art, notiz, jetzt = Date.now() }) {
  const n = Number(pr);
  if (!Number.isInteger(n) || n <= 0) throw new Error("--pr muss eine positive ganze Zahl sein.");
  if (!EREIGNIS_ARTEN.includes(art)) throw new Error(`--art muss eine von ${EREIGNIS_ARTEN.join(", ")} sein.`);
  const text = String(notiz || "").replace(/\s+/g, " ").trim();
  if (text.length > 200) throw new Error("--notiz höchstens 200 Zeichen.");
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) throw new Error("--notiz darf keine E-Mail-Adresse enthalten (keine personenbezogenen Daten).");
  return JSON.stringify({ ts: new Date(jetzt).toISOString(), pr: n, art, ...(text ? { notiz: text } : {}) });
}

/** Liest JSON-Zeilen; fehlerhafte Zeilen werden gezählt, nicht verschluckt. */
export function ereignisseParsen(text) {
  const ereignisse = [];
  let fehlerhaft = 0;
  for (const zeile of String(text || "").split(/\r?\n/)) {
    if (!zeile.trim()) continue;
    try {
      const o = JSON.parse(zeile);
      if (o && Number.isInteger(o.pr) && EREIGNIS_ARTEN.includes(o.art) && zeit(o.ts) != null) ereignisse.push(o);
      else fehlerhaft++;
    } catch { fehlerhaft++; }
  }
  return { ereignisse, fehlerhaft };
}

/** Review-Dauern aus Start/Ende-Paaren (je PR: Start → nächstes Ende). */
export function reviewDauern(ereignisse) {
  const nachPr = new Map();
  for (const e of [...ereignisse].sort((a, b) => zeit(a.ts) - zeit(b.ts))) {
    if (!nachPr.has(e.pr)) nachPr.set(e.pr, []);
    nachPr.get(e.pr).push(e);
  }
  const dauern = [];
  for (const liste of nachPr.values()) {
    let start = null;
    for (const e of liste) {
      if (e.art === "review-start") start = zeit(e.ts);
      else if (e.art === "review-ende" && start != null) { dauern.push(zeit(e.ts) - start); start = null; }
    }
  }
  return {
    dauern,
    korrekturrunden: ereignisse.filter((e) => e.art === "korrekturrunde").length,
    nachtraeglich: ereignisse.filter((e) => e.art === "fehler-nachtraeglich").length,
  };
}

/* ---------- Auswertung ---------- */

export function auswerten({ prs, basis = "integration/release-v4", seit = "2026-11-10", jetzt, ssot = null, offenePr = [], konflikt = null, ereignisse = null, ssotUeber = null, commit = null }) {
  const alle = prs.map(prKennzahlen);
  const seitMs = zeit(`${seit}T00:00:00Z`);
  const imBasis = alle.filter((k) => k.basis === basis);
  const gemergt = imBasis.filter((k) => k.gemergt);
  const neu = gemergt.filter((k) => k.gemergtAm >= seitMs);
  const frueher = gemergt.filter((k) => k.gemergtAm < seitMs);
  const zusammen = (liste) => ({
    n: liste.length,
    lead: statistik(liste.map((k) => minuten(k.leadMs))),
    ci: statistik(liste.map((k) => minuten(k.ciDauerMs))),
    queue: statistik(liste.map((k) => k.ciQueueMs == null ? null : k.ciQueueMs / 1000)),
    nachPush: statistik(liste.map((k) => k.commitsNachAnlage)),
    commits: statistik(liste.map((k) => k.commits)),
    zeilen: statistik(liste.map((k) => k.zeilen)),
    dateien: statistik(liste.map((k) => k.dateien)),
    fehlschlaege: statistik(liste.map((k) => k.ciFehlschlaege)),
    mitFehlschlag: liste.filter((k) => k.ciFehlschlaege > 0).length,
    nachbesserungsfix: liste.filter((k) => k.klasse === "fix" && k.verweise.length).length,
    klassen: Object.fromEntries(["feature", "fix", "docs", "ssot", "test-infra", "review", "merge"].map((c) => [c, liste.filter((k) => k.klasse === c).length])),
  });
  const tage = proTag(gemergt);
  const gemergtZeiten = gemergt.map((k) => k.gemergtAm);
  const ersterMergeMs = gemergtZeiten.length ? Math.min(...gemergtZeiten) : seitMs;
  const von = Math.min(seitMs, ersterMergeMs);
  const parallel = parallelOffenProTag(imBasis, von, jetzt);
  const funktionProTag = proTag(gemergt.filter((k) => FUNKTIONSKLASSEN.includes(k.klasse)));
  const tageListe = [...parallel.keys()];
  const konfliktTag = new Map();
  if (konflikt) for (const k of ["kette", "mergeAufloesung"]) for (const c of konflikt[k] || []) {
    const t = tagSchluessel(c.zeit); konfliktTag.set(t, (konfliktTag.get(t) || 0) + 1);
  }
  const par = tageListe.map((t) => parallel.get(t));
  const kon = tageListe.map((t) => konfliktTag.get(t) || 0);
  const ausf = ssot ? ausfuehrbar(ssot, offenePr) : null;
  const rev = ereignisse ? reviewDauern(ereignisse.ereignisse) : null;
  return {
    erzeugt: new Date(jetzt).toISOString(), commit, basis, seit,
    gesamt: { alle: alle.length, imBasis: imBasis.length, gemergtImBasis: gemergt.length, offenImBasis: imBasis.filter((k) => !k.gemergt && k.geschlossenAm == null).length },
    seitSeit: zusammen(neu),
    davor: zusammen(frueher),
    proTag: Object.fromEntries([...tage.entries()].sort()),
    funktionProTag: Object.fromEntries([...funktionProTag.entries()].sort()),
    mergeAbstandH: statistik(mergeAbstaende(gemergt.filter((k) => k.gemergtAm >= seitMs)).map(stunden)),
    mergeAbstandHDavor: statistik(mergeAbstaende(frueher).map(stunden)),
    fenster: fensterVergleich(alle.filter((k) => k.gemergt && (k.basis === basis || k.basis === VORGAENGER_BASIS)), jetzt),
    parallel: { proTag: Object.fromEntries(parallel), korrelationKonflikt: pearson(par, kon), nTage: tageListe.length,
      parallelStat: statistik(par) },
    konflikt: konflikt ? { kette: konflikt.kette.length, mergeAufloesung: konflikt.mergeAufloesung.length, konfliktWort: konflikt.konfliktWort.length, reviewBefund: (konflikt.reviewBefund || []).length, reviewJePaket: reviewJePaket(konflikt.reviewBefund || []), proTag: Object.fromEntries([...konfliktTag.entries()].sort()) } : null,
    ausfuehrbar: ausf,
    review: rev ? { ...rev, dauerH: statistik(rev.dauern.map(stunden)), fehlerhafteZeilen: ereignisse.fehlerhaft } : null,
    ssotVerlauf: ssotUeber ? {
      integriertProTag: Object.fromEntries([...tageszaehlung(ssotUeber.integriert).entries()].sort()),
      lokalGetestetProTag: Object.fromEntries([...tageszaehlung(ssotUeber.lokalGetestet).entries()].sort()),
      integriertGesamt: ssotUeber.integriert.length, lokalGetestetGesamt: ssotUeber.lokalGetestet.length,
    } : null,
    ersterMerge: gemergtZeiten.length ? new Date(Math.min(...gemergtZeiten)).toISOString() : null,
    kennzahlenProPr: alle,
  };
}

/* ---------- Ausgabe ---------- */

const fmt = (x, d = 1) => (x == null ? "nicht messbar" : Number(x).toFixed(d).replace(".", ","));
const zeileStat = (name, s, einheit, d = 1) => `| ${name} | ${s.n} | ${fmt(s.median, d)} ${s.n ? einheit : ""} | ${s.n ? `${fmt(s.min, d)} – ${fmt(s.max, d)}` : "nicht messbar"} |`;

export function markdown(a) {
  const L = [];
  L.push(`Erzeugt ${a.erzeugt} · Basis-Commit des Arbeitsbaums ${a.commit || "unbekannt"} · PR-Ziel \`${a.basis}\` · Zeitraum „seit“ ${a.seit}.`);
  L.push("", "Nur gemessene Werte; „nicht messbar“ nennt den Grund. Commits sind nicht die Kennzahl.", "");
  L.push("### Bestand", "", `PRs gesamt (Abfrage, Limit 400): ${a.gesamt.alle}; mit Ziel \`${a.basis}\`: ${a.gesamt.imBasis}; davon gemergt ${a.gesamt.gemergtImBasis}, offen ${a.gesamt.offenImBasis}.`, "");
  const tab = (titel, z) => {
    L.push(`### ${titel} (n = ${z.n} gemergte PRs)`, "", "| Kennzahl | n | Median | Bereich |", "|---|---|---|---|");
    L.push(zeileStat("Durchlaufzeit angelegt → gemergt", z.lead, "min", 0));
    L.push(zeileStat("CI-Dauer (erster Start → letzter grüner Lauf auf dem gemergten Kopf)", z.ci, "min", 1));
    L.push(zeileStat("CI-Warteschlange (Lauf angelegt → gestartet, größter Wert je PR)", z.queue, "s", 0));
    L.push(zeileStat("Commits nach Anlage (Nachbesserungs-Proxy)", z.nachPush, "", 0));
    L.push(zeileStat("Commits je PR", z.commits, "", 0));
    L.push(zeileStat("Fehlgeschlagene CI-Läufe je PR (Ereignis pull_request)", z.fehlschlaege, "", 0));
    L.push(zeileStat("Geänderte Zeilen (+/−)", z.zeilen, "", 0));
    L.push(zeileStat("Geänderte Dateien", z.dateien, "", 0));
    L.push("", `Klassen: ${Object.entries(z.klassen).map(([k, v]) => `${k} ${v}`).join(", ")}. PRs mit mindestens einem fehlgeschlagenen CI-Lauf: ${z.mitFehlschlag}. Nachbesserungsfix (Proxy: Fix-PR nennt früheren PR per #N): ${z.nachbesserungsfix}.`, "");
  };
  tab(`PRs gemergt seit ${a.seit}`, a.seitSeit);
  tab(`Vergleichszeitraum: gemergt vor ${a.seit}`, a.davor);
  L.push("### Gemergte PRs je Tag (Ziel-Zweig, alle Klassen / davon Funktion = feature+fix)", "", "| Tag | gemergt | Funktion | gleichzeitig offen |", "|---|---|---|---|");
  const tage = Object.keys(a.parallel.proTag);
  for (const t of tage) L.push(`| ${t} | ${a.proTag[t] || 0} | ${a.funktionProTag[t] || 0} | ${a.parallel.proTag[t]} |`);
  L.push("", `Abstand aufeinanderfolgender Merges seit ${a.seit}: n = ${a.mergeAbstandH.n}, Median ${fmt(a.mergeAbstandH.median)} h, Bereich ${fmt(a.mergeAbstandH.min)} – ${fmt(a.mergeAbstandH.max)} h (Betreiber- und Agentenwartezeit sind daraus nicht trennbar).`);
  L.push("", "### Vergleich 7 Tage gegen die 7 Tage davor (gleitend, gemergte PRs beider Integrationszweige)", "");
  const f = a.fenster;
  if (!f.ausreichend) L.push(`nicht ausreichend Daten (n aktuell = ${f.aktuell.n}, n davor = ${f.davor.n}; Mindestzahl je Fenster ${f.mindestN}). Die Werte stehen zur Orientierung dennoch da.`, "");
  L.push("| Kennzahl | letzte 7 Tage | 7 Tage davor |", "|---|---|---|");
  const w = (k, d = 1) => [fmt(f.aktuell[k], d), fmt(f.davor[k], d)];
  L.push(`| gemergte PRs (n) | ${f.aktuell.n} | ${f.davor.n} |`, `| davon Funktion (feature+fix) | ${f.aktuell.funktion} | ${f.davor.funktion} |`);
  L.push(`| Median Durchlaufzeit (h) | ${w("medianLeadH").join(" | ")} |`, `| Median CI-Dauer (min), n = ${f.aktuell.nCi} / ${f.davor.nCi} | ${w("medianCiMin").join(" | ")} |`);
  L.push(`| Median Commits nach Anlage | ${w("medianNachPush", 0).join(" | ")} |`, `| fehlgeschlagene CI-Läufe (Summe) | ${f.aktuell.fehlschlaegeSumme} | ${f.davor.fehlschlaegeSumme} |`, `| Nachbesserungsfix (Proxy) | ${f.aktuell.nachbesserungsfix} | ${f.davor.nachbesserungsfix} |`, "");
  L.push("### Zusammenhang Parallelität und Konflikte (Proxy)", "");
  if (a.konflikt) {
    L.push(`Konfliktauflösungen laut Git-Betreffzeilen seit 2026-11-01 (alle entfernten Zweige): Kettenvereinigung ${a.konflikt.kette}, Merge mit Auflösungswort ${a.konflikt.mergeAufloesung} (Wort „Konflikt/conflict“ allgemein: ${a.konflikt.konfliktWort}); Commits mit Review-/Befund-/Nachbesserungs-/Nachtrag-Wort: ${a.konflikt.reviewBefund} (häufigste Pakete: ${a.konflikt.reviewJePaket.map(([k, n]) => `${k} ${n}`).join(", ") || "keine"}). Das ist ein Proxy: GitHub-„mergeable“ ist nachträglich nicht messbar.`);
    L.push(`Gleichzeitig offene PRs je Tag: Median ${fmt(a.parallel.parallelStat.median, 0)}, Bereich ${fmt(a.parallel.parallelStat.min, 0)} – ${fmt(a.parallel.parallelStat.max, 0)} (n = ${a.parallel.nTage} Tage). Pearson-Korrelation mit Konfliktauflösungen je Tag: ${a.parallel.nTage < MIN_TAGE_KORRELATION ? `nicht ausreichend Daten (n = ${a.parallel.nTage} Tage, Mindestzahl ${MIN_TAGE_KORRELATION})` : a.parallel.korrelationKonflikt == null ? "nicht messbar (konstante Werte)" : `${fmt(a.parallel.korrelationKonflikt, 2)} (n = ${a.parallel.nTage} Tage; keine Kausalität)`}.`, "");
  } else L.push("nicht messbar: Git-Verlauf nicht gelesen.", "");
  L.push("### Review (Subagenten, nicht aus GitHub)", "");
  if (!a.review) L.push("nicht messbar: keine Ereignisdatei gelesen.", "");
  else if (!a.review.dauern.length && !a.review.korrekturrunden && !a.review.nachtraeglich) L.push(`Review-Wartezeit, Korrekturrunden und nachträgliche Fehler: nicht messbar. Grund: unabhängige Reviews laufen über Subagenten, nicht als GitHub-Reviews; Ereignisdatei \`${EREIGNIS_DATEI}\` ist leer oder fehlt. Eintrag: \`node werkzeug/durchsatz.mjs ereignis --pr N --art review-start|review-ende|korrekturrunde|fehler-nachtraeglich --notiz "…"\`.`, "");
  else L.push(`Aus der Ereignisdatei: Review-Dauer n = ${a.review.dauerH.n}, Median ${fmt(a.review.dauerH.median)} h, Bereich ${fmt(a.review.dauerH.min)} – ${fmt(a.review.dauerH.max)} h; Korrekturrunden ${a.review.korrekturrunden}; nachträgliche Fehler ${a.review.nachtraeglich}; fehlerhafte Zeilen ${a.review.fehlerhafteZeilen}.`, "");
  L.push("### Ausführbare, unbearbeitete Pakete (Proxy)", "");
  if (!a.ausfuehrbar) L.push("nicht messbar: work-packages.json nicht gelesen.", "");
  else {
    const x = a.ausfuehrbar;
    L.push("Definition: Status READY, IN_PROGRESS oder BLOCKED; alle Abhängigkeiten INTEGRATED/DONE; kein offener PR im Feld `pr`; Notiz/Akzeptanz nennt keine Betreiber-/Staging-/Extern-Blockade (Textmuster, Proxy).", "");
    L.push(`Anzahl ausführbar: **${x.ausfuehrbar.length}**; ausgeschlossen wegen offenem PR: ${x.mitOffenemPr}; ausgeschlossen als betreiber-/staging-blockiert (Textmuster): ${x.betreiberBlockiert.length}.`, "");
    if (x.ausfuehrbar.length) {
      L.push("| Paket | Status | Prio | Strang | Aufwand PT | Konfliktzonen | Titel |", "|---|---|---|---|---|---|---|");
      for (const p of x.ausfuehrbar) L.push(`| ${p.id} | ${p.status} | ${p.prio || ""} | ${p.strang || ""} | ${p.aufwandPT ? `${p.aufwandPT.min}–${p.aufwandPT.max}` : ""} | ${(p.konfliktzonen || []).join(", ") || "–"} | ${String(p.titel || "").replace(/\|/g, "/")} |`);
      L.push("");
    }
  }
  L.push("### Kernmetrik: abnahmereife, integrierte Funktionalität", "");
  const nFunk = Object.values(a.funktionProTag).reduce((s, x) => s + x, 0);
  L.push(`(a) Gemergte PRs der Klassen feature und fix seit ${a.seit} auf \`${a.basis}\`: ${nFunk} in ${tage.length} Kalendertagen (${tage.length ? fmt(nFunk / tage.length) : "nicht messbar"} je Kalendertag). SSOT-, Doku-, Merge-, Review- und Infrastruktur-PRs zählen nicht.`);
  if (a.ssotVerlauf) L.push(`(b) Pakete mit erstmals INTEGRATED/DONE laut Git-Verlauf von work-packages.json: ${a.ssotVerlauf.integriertGesamt}; erstmals lokalGetestet = true: ${a.ssotVerlauf.lokalGetestetGesamt} (INTEGRATED/DONE je Tag: ${Object.entries(a.ssotVerlauf.integriertProTag).map(([t, n]) => `${t}: ${n}`).join(", ") || "keine"}; lokalGetestet je Tag: ${Object.entries(a.ssotVerlauf.lokalGetestetProTag).map(([t, n]) => `${t}: ${n}`).join(", ") || "keine"}). Das misst den Zeitpunkt der SSOT-Buchung, nicht der Integration (Buchungsverzug).`, "");
  else L.push("(b) nicht messbar: Git-Verlauf von work-packages.json nicht gelesen.", "");
  return L.join("\n");
}

export const MARKE_BEGIN = "<!-- AUTO:BEGIN durchsatz -->";
export const MARKE_ENDE = "<!-- AUTO:END durchsatz -->";

export function dokument(a) {
  return [
    "# Durchsatz-Dashboard (erzeugt)", "",
    "Erzeugt von `node werkzeug/durchsatz.mjs` aus GitHub-Daten (nur lesend), `git log` und `docs/acc45/work-packages.json`. Methode und Grenzen: [DURCHSATZ-ANALYSE.md](DURCHSATZ-ANALYSE.md).", "",
    MARKE_BEGIN, markdown(a), MARKE_ENDE, "",
  ].join("\n");
}

/* ---------- Datenbeschaffung (gh, git) ---------- */

async function gh(args, wurzel) {
  const { stdout } = await execFileP("gh", args, { cwd: wurzel, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

const PR_FELDER = "number,title,body,baseRefName,headRefName,headRefOid,createdAt,mergedAt,closedAt,state,additions,deletions,changedFiles";

export async function prListe(wurzel, cacheDir, aktualisieren) {
  const datei = join(cacheDir, "prs.json");
  if (!aktualisieren && existsSync(datei) && Date.now() - zeit(JSON.parse(readFileSync(datei, "utf8")).geholt) < 30 * 60 * 1000) return JSON.parse(readFileSync(datei, "utf8")).prs;
  const roh = JSON.parse(await gh(["pr", "list", "--state", "all", "--limit", "400", "--json", PR_FELDER], wurzel));
  writeFileSync(datei, JSON.stringify({ geholt: new Date().toISOString(), prs: roh }));
  return roh;
}

async function prDetails(p, wurzel, cacheDir, aktualisieren) {
  const datei = join(cacheDir, `pr-${p.number}.json`);
  const offen = p.state === "OPEN";
  if (!aktualisieren && !offen && existsSync(datei)) {
    const c = JSON.parse(readFileSync(datei, "utf8"));
    if (c.headSha === p.headRefOid) return c;
  }
  const commits = JSON.parse(await gh(["api", `repos/{owner}/{repo}/pulls/${p.number}/commits?per_page=100`, "--jq",
    "[.[] | {sha: .sha, date: .commit.committer.date}]"], wurzel));
  const runs = JSON.parse(await gh(["api", `repos/{owner}/{repo}/actions/runs?branch=${encodeURIComponent(p.headRefName)}&event=pull_request&per_page=100`, "--jq",
    "[.workflow_runs[] | {name: .name, event: .event, sha: .head_sha, conclusion: .conclusion, status: .status, created: .created_at, started: .run_started_at, updated: .updated_at}]"], wurzel));
  const von = zeit(p.createdAt) - 15 * 60 * 1000;
  const bis = (zeit(p.mergedAt) ?? zeit(p.closedAt) ?? Date.now()) + 60 * 60 * 1000;
  const beachtet = runs.filter((r) => zeit(r.created) >= von && zeit(r.created) <= bis);
  const d = { headSha: p.headRefOid, commits, runs: beachtet };
  if (!offen) writeFileSync(datei, JSON.stringify(d));
  return d;
}

export async function sammeln({ wurzel, cacheDir, aktualisieren = false, basis, log = () => {} }) {
  mkdirSync(cacheDir, { recursive: true });
  const liste = await prListe(wurzel, cacheDir, aktualisieren);
  const ziel = liste.filter((p) => p.baseRefName === basis || p.baseRefName === "integration/centric-complete");
  const ergebnis = [];
  let i = 0;
  const arbeiter = async () => {
    while (i < ziel.length) {
      const p = ziel[i++];
      try {
        const d = await prDetails(p, wurzel, cacheDir, aktualisieren);
        ergebnis.push({ number: p.number, title: p.title, body: p.body, base: p.baseRefName, head: p.headRefName, createdAt: p.createdAt, mergedAt: p.mergedAt, closedAt: p.closedAt,
          state: p.state, additions: p.additions, deletions: p.deletions, changedFiles: p.changedFiles, headSha: p.headRefOid, commits: d.commits, runs: d.runs });
      } catch (e) {
        log(`PR ${p.number}: ${String(e.message || e).split("\n")[0]}`);
        ergebnis.push({ number: p.number, title: p.title, body: p.body, base: p.baseRefName, head: p.headRefName, createdAt: p.createdAt, mergedAt: p.mergedAt, closedAt: p.closedAt,
          state: p.state, additions: p.additions, deletions: p.deletions, changedFiles: p.changedFiles, headSha: p.headRefOid, commits: [], runs: [] });
      }
    }
  };
  await Promise.all([arbeiter(), arbeiter(), arbeiter()]);
  return { prs: ergebnis.sort((a, b) => a.number - b.number), offenePr: liste.filter((p) => p.state === "OPEN").map((p) => p.number) };
}

function git(args, wurzel) {
  return execFileSync("git", args, { cwd: wurzel, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

export function konfliktCommits(wurzel, seit) {
  const roh = git(["log", "--remotes", `--since=${seit}`, "--format=%H%x1f%cI%x1f%s%x1f%b%x1e"], wurzel);
  const commits = roh.split("\x1e").map((s) => s.replace(/^\n/, "")).filter(Boolean).map((s) => {
    const [sha, iso, betreff, rumpf] = s.split("\x1f");
    return { sha, zeit: zeit(iso), betreff, rumpf };
  });
  return konfliktProxy(commits);
}

export function ssotVerlauf(wurzel, ref, seit) {
  const zeilen = git(["log", ref, `--since=${seit}`, "--format=%H%x09%cI", "--", "docs/acc45/work-packages.json"], wurzel).split("\n").filter(Boolean).reverse();
  const versionen = [];
  for (const z of zeilen) {
    const [sha, iso] = z.split("\t");
    try {
      const j = JSON.parse(git(["show", `${sha}:docs/acc45/work-packages.json`], wurzel));
      const pakete = {};
      for (const p of j.pakete || []) pakete[p.id] = { status: p.status, lokalGetestet: !!(p.stufen && p.stufen.lokalGetestet && p.stufen.lokalGetestet.wert) };
      versionen.push({ zeit: zeit(iso), commit: sha, pakete });
    } catch { /* Version ohne lesbares JSON überspringen */ }
  }
  return ssotUebergaenge(versionen);
}

/* ---------- Kommandozeile ---------- */

function argWert(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function haupt(argv) {
  const wurzel = resolve(fileURLToPath(new URL("..", import.meta.url)));
  if (argv[0] === "ereignis") {
    try {
      const zeile = ereignisZeile({ pr: argWert(argv, "--pr"), art: argWert(argv, "--art"), notiz: argWert(argv, "--notiz") });
      appendFileSync(join(wurzel, EREIGNIS_DATEI), zeile + "\n");
      console.log(`Eingetragen in ${EREIGNIS_DATEI}: ${zeile}`);
      return 0;
    } catch (e) { console.error(`Fehler: ${e.message}`); return 2; }
  }
  const basis = argWert(argv, "--basis") || "integration/release-v4";
  const seit = argWert(argv, "--seit") || "2026-11-10";
  const cacheDir = resolve(argWert(argv, "--cache") || join(tmpdir(), "centric-durchsatz-cache"));
  const { prs, offenePr } = await sammeln({ wurzel, cacheDir, aktualisieren: argv.includes("--aktualisieren"), basis, log: (m) => console.error(m) });
  let ssot = null;
  try { ssot = JSON.parse(readFileSync(join(wurzel, "docs/acc45/work-packages.json"), "utf8")); } catch { /* nicht messbar */ }
  let konflikt = null, ssotUeber = null;
  try { konflikt = konfliktCommits(wurzel, "2026-11-01"); } catch { /* nicht messbar */ }
  try { ssotUeber = ssotVerlauf(wurzel, "HEAD", "2026-11-01"); } catch { /* nicht messbar */ }
  const ep = join(wurzel, EREIGNIS_DATEI);
  const ereignisse = ereignisseParsen(existsSync(ep) ? readFileSync(ep, "utf8") : "");
  let commit = null;
  try { commit = git(["rev-parse", "HEAD"], wurzel).trim(); } catch { /* nicht messbar */ }
  const a = auswerten({ prs, basis, seit, jetzt: Date.now(), ssot, offenePr, konflikt, ereignisse, ssotUeber, commit });
  if (argv.includes("--json")) {
    const ausgabe = { ...a };
    if (!argv.includes("--mit-pr")) delete ausgabe.kennzahlenProPr;
    console.log(JSON.stringify(ausgabe, null, 2));
    return 0;
  }
  console.log(markdown(a));
  if (!argv.includes("--nicht-schreiben")) {
    writeFileSync(join(wurzel, DASHBOARD_DATEI), dokument(a));
    console.error(`Geschrieben: ${DASHBOARD_DATEI}`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  haupt(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}

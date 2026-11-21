/* V4-3b: Zuordnungsregel der Inline-Radien auf die Radiusstufen V4_RADIEN (src/v4/tokens.js), gemeinsam für die
   Prüfungen je Hauptansicht (v4-3b-plan.test.js, v4-3b-personal.test.js, v4-3b-zeit.test.js,
   v4-3b-einstellungen.test.js, v4-3b-lage.test.js, v4-3b-betreiber.test.js) und den Erzeuger der Basis-Fixture (werkzeug/v4-radiusstufen-basis.mjs). Nur für Tests;
   keine Laufzeitwirkung.

   Regel (wie V4-3a, Nachtrag V4-3b in docs/acc45/V4-IST-STAND-2026-11-20.md):
     - Radius >= halbe kleinere Kante (Punkte, Leisten) oder 999 → pille (der Browser kappt auf dieselbe Form);
     - sonst gleicher Wert → gleiche Stufe, sonst die nächste Stufe; bei Gleichstand die größere
       (10 → mittel wie .slink in V4-3a). */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { V4_RADIEN } from "../src/v4/tokens.js";
import { ohneKommentare } from "../werkzeug/v4-inventar.mjs";

const FESTE_STUFEN = Object.entries(V4_RADIEN).filter(([s]) => s !== "pille").map(([s, px]) => [s, parseFloat(px)]);

/** Stufe für einen alten Radius `alt` (px); `kante` = kleinere Kante des Elements (px), falls fest. */
export function regelStufe(alt, kante) {
  if (alt >= 999 || (kante !== undefined && alt >= kante / 2)) return "pille";
  let beste = null;
  for (const [s, px] of FESTE_STUFEN) {
    const d = Math.abs(px - alt);
    if (!beste || d <= beste.d) beste = { s, d };
  }
  return beste.s;
}

/** Radiusstufen im Quelltext (ohne Kommentare) in Reihenfolge: var(--v4-r-<stufe>). */
export const stufenIn = (text) => [...ohneKommentare(text).matchAll(/var\(--v4-r-([a-z]+)\)/g)].map((m) => m[1]);

/* Review #442 (B2): Die Spalten `alt` und `kante` der festen Tabellen stammen aus dem Quelltext vor dem Schnitt.
   Review #443 (B1): Im flachen CI-Checkout fehlt der Verlauf; `git show <Basis>:<Datei>` scheitert dort. Deshalb liegt
   die Basis der betroffenen Stellen als eingecheckte Fixture vor (BASIS_FIXTURE, erzeugt mit
   `node werkzeug/v4-radiusstufen-basis.mjs` aus den Basis-Commits): je Schnitt der volle Basis-Commit, je Datei der
   SHA-256 des Basis-Quelltexts und die Radius-Literale mit Kontext, dazu ein SHA-256 über diese Literale. Der Abgleich
   der Tabellen läuft immer gegen die Fixture (auch ohne Git). `git show` bleibt die zusätzliche Gegenprobe: Mit Verlauf
   muss die Fixture genau dem Basis-Quelltext entsprechen (SHA-256 und Literale).
   V4_BASIS_OHNE_GIT=1 stellt den CI-Fall lokal nach (kein Git-Verlauf). */

export const BASIS_FIXTURE = "pruefungen/fixtures/v4-radiusstufen-basis.json";

/** Schnitte von V4-3b: Hauptansicht → Basis-Commit (vor dem Schnitt). Quelle für Erzeuger und Tests. */
export const SCHNITTE = {
  "Plan/Dienstplan": "b2a42a7f79975140571f90ed8942bfe1f539a7ab",
  Personal: "7d659b55eaf17630edf406f81e210420b807dbe3",
  "Zeit/Abrechnung": "c11a6a722720bd88b39bc07b0ea19f181ac04485",
  "Einstellungen/Verwaltung": "8f15631dcd67f70796412b0eff7e9c21b6992c45",
  "Lage/Dashboard": "bf25396375ef952d901790b66e6d7ca375bc41c2",
  Betreiberkonsole: "7ca4064607b3bea8624683c6250bb00108b97642",
};

export const sha256 = (s) => createHash("sha256").update(String(s), "utf8").digest("hex");
/** Prüfsumme über die Literale einer Datei (Reihenfolge und Kontext zählen). */
export const literalSumme = (literale) => sha256(JSON.stringify(literale.map((l) => [l.wert, l.kontext])));

/** Fixture-Eintrag einer Datei aus ihrem Basis-Quelltext (null: Datei gab es auf der Basis nicht). */
export function basisEintrag(text) {
  if (text === null) return { sha256: null, literale: [], literaleSha256: literalSumme([]) };
  const literale = radiusLiterale(text);
  return { sha256: sha256(text), literale, literaleSha256: literalSumme(literale) };
}

export function ladeBasisFixture(wurzel) {
  return JSON.parse(readFileSync(path.join(wurzel, BASIS_FIXTURE), "utf8"));
}

/** Plausibilität der Fixture ohne Git: Form der Felder, Basis-Commit des Schnitts, Prüfsumme der Literale, Dateien
 *  der Tabelle vorhanden. Rückgabe: Liste der Befunde (leer = plausibel). */
export function fixtureBefunde(fx, schnitt, dateien = []) {
  const f = [];
  const s = fx && fx.schnitte && fx.schnitte[schnitt];
  if (!s) return [`Schnitt ${schnitt} fehlt in der Fixture`];
  if (s.basis !== SCHNITTE[schnitt]) f.push(`${schnitt}: Basis ${s.basis}, erwartet ${SCHNITTE[schnitt]}`);
  for (const d of dateien) if (!s.dateien || !s.dateien[d]) f.push(`${schnitt}: ${d} fehlt in der Fixture`);
  for (const [d, e] of Object.entries(s.dateien || {})) {
    if (!(e.sha256 === null || /^[0-9a-f]{64}$/.test(e.sha256))) f.push(`${d}: sha256 ungültig`);
    if (!Array.isArray(e.literale) || e.literale.some((l) => typeof l.wert !== "string" || typeof l.kontext !== "string"))
      f.push(`${d}: Literale ungültig`);
    else if (e.literaleSha256 !== literalSumme(e.literale)) f.push(`${d}: Prüfsumme der Literale stimmt nicht`);
    if (e.sha256 === null && e.literale.length) f.push(`${d}: Literale ohne Basisdatei`);
  }
  return f;
}

/** Abgleich einer festen Tabelle {datei: stellen} mit der Fixture (läuft immer, auch ohne Git-Verlauf): Plausibilität
 *  der Fixture und je Datei abgleichMitLiteralen. `lies(datei)` liefert den heutigen Quelltext. */
export function abgleichMitFixture(fx, schnitt, tabelle, lies) {
  const f = fixtureBefunde(fx, schnitt, Object.keys(tabelle));
  if (f.length) return f;
  for (const [datei, stellen] of Object.entries(tabelle)) {
    for (const x of abgleichMitLiteralen(fx.schnitte[schnitt].dateien[datei].literale, lies(datei), stellen)) f.push(`${datei}: ${x}`);
  }
  return f;
}

/** Gegenprobe mit Git: Fixture-Eintrag gleich dem Basis-Quelltext? null = kein Git-Verlauf (Gegenprobe nicht möglich). */
export function gitGegenprobe(wurzel, fx, schnitt) {
  const s = fx.schnitte[schnitt];
  if (basisText(wurzel, s.basis, Object.keys(s.dateien)[0]) === null
    && basisText(wurzel, s.basis, "package.json") === null) return null;
  const f = [];
  for (const [d, e] of Object.entries(s.dateien)) {
    const neu = basisEintrag(basisText(wurzel, s.basis, d));
    if (neu.sha256 !== e.sha256) f.push(`${d}: sha256 der Fixture ≠ git show ${s.basis.slice(0, 8)}`);
    if (JSON.stringify(neu.literale) !== JSON.stringify(e.literale)) f.push(`${d}: Literale der Fixture ≠ Basis`);
  }
  return f;
}

/** Quelltext einer Datei auf einem Commit; null, wenn der Commit nicht im Verlauf ist (flacher Checkout) oder
 *  V4_BASIS_OHNE_GIT=1 gesetzt ist (CI-Fall lokal nachgestellt). */
export function basisText(wurzel, basis, datei) {
  if (process.env.V4_BASIS_OHNE_GIT === "1") return null;
  try {
    return execFileSync("git", ["show", `${basis}:${datei}`], { cwd: wurzel, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .replace(/\r\n/g, "\n");
  } catch { return null; }
}

/** Inline-Radius-Literale (wie RE_FORM_LITERAL im Inventar, ohne var(…)) in Quelltextreihenfolge, je mit dem
 *  umgebenden Stilobjekt `style={{ … }}` als Kontext. */
export function radiusLiterale(text) {
  const code = ohneKommentare(String(text));
  const aus = [];
  for (const m of code.matchAll(/borderRadius:\s*(\d+(?:\.\d+)?|"[^"]*"|'[^']*'|`[^`]*`)/g)) {
    const wert = m[1].replace(/^["'`]|["'`]$/g, "").trim();
    if (/^var\(/.test(wert)) continue;
    /* Stilobjekt im JSX; sonst (z. B. `const kasten = { … }`) die Zeile des Literals. */
    let a = code.lastIndexOf("{{", m.index), e = code.indexOf("}}", m.index);
    if (a < 0 || m.index - a > 600) a = code.lastIndexOf("\n", m.index) + 1;
    e = e < 0 || e - m.index > 600 ? code.indexOf("\n", m.index) : e + 2;
    aus.push({ wert, kontext: code.slice(a, e < 0 ? undefined : e) });
  }
  return aus;
}

/** Einzelwerte eines Literals: Zahl → [n]; "5px 5px 0 0" → [5, 5] (Ecken ≠ 0); "50%" → ["50%"]. */
const einzelwerte = (wert) => (/%$/.test(wert) ? [wert]
  : wert.split(/\s+/).map((w) => parseFloat(w)).filter((n) => Number.isFinite(n) && n !== 0));

/**
 * Abgleich einer festen Tabelle (Stellen in Quelltextreihenfolge) mit der Basis: Die Radius-Literale der Basis, ohne
 * die heute unverändert stehenden (begründete Ausnahmen, gleicher Kontext), müssen der Reihe nach die Spalte `alt`
 * ergeben; "50%" verlangt alt = kante / 2. Ist `kante` gesetzt, steht im Stilobjekt der Basis width/height mit diesem
 * Wert. Rückgabe: Liste der Abweichungen (leer = Tabelle stimmt mit der Basis).
 */
export function abgleichMitBasis(basisQuelle, jetzigeQuelle, stellen) {
  return abgleichMitLiteralen(radiusLiterale(basisQuelle), jetzigeQuelle, stellen);
}

/** Wie abgleichMitBasis, aber mit den Basis-Literalen (aus der Fixture) statt des Basis-Quelltexts; läuft ohne Git. */
export function abgleichMitLiteralen(basisLiterale, jetzigeQuelle, stellen) {
  const jetzt = ohneKommentare(jetzigeQuelle);
  const basis = basisLiterale.filter((l) => !jetzt.includes(l.kontext))
    .flatMap((l) => einzelwerte(l.wert).map((w) => ({ w, kontext: l.kontext })));
  const f = [];
  if (basis.length !== stellen.length) f.push(`Anzahl: Basis ${basis.length}, Tabelle ${stellen.length}`);
  stellen.forEach((s, i) => {
    const b = basis[i];
    if (!b) return;
    if (b.w === "50%") {
      if (!(s.kante && s.alt === s.kante / 2)) f.push(`${s.wo}: Basis 50 %, Tabelle alt ${s.alt} kante ${s.kante}`);
    } else if (b.w !== s.alt) f.push(`${s.wo}: Basis ${b.w}, Tabelle alt ${s.alt}`);
    if (s.kante !== undefined && !new RegExp(`\\b(?:width|height):\\s*${s.kante}\\b`).test(b.kontext))
      f.push(`${s.wo}: kante ${s.kante} nicht im Stilobjekt der Basis`);
  });
  return f;
}

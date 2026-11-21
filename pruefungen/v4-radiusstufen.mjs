/* V4-3b: Zuordnungsregel der Inline-Radien auf die Radiusstufen V4_RADIEN (src/v4/tokens.js), gemeinsam für die
   Prüfungen je Hauptansicht (v4-3b-plan.test.js, v4-3b-personal.test.js, v4-3b-zeit.test.js). Nur für Tests; keine
   Laufzeitwirkung.

   Regel (wie V4-3a, Nachtrag V4-3b in docs/acc45/V4-IST-STAND-2026-11-20.md):
     - Radius >= halbe kleinere Kante (Punkte, Leisten) oder 999 → pille (der Browser kappt auf dieselbe Form);
     - sonst gleicher Wert → gleiche Stufe, sonst die nächste Stufe; bei Gleichstand die größere
       (10 → mittel wie .slink in V4-3a). */
import { execFileSync } from "node:child_process";
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

/* Review #442 (B2): Die Spalten `alt` und `kante` der festen Tabellen stammen aus dem Quelltext vor dem Schnitt. Der
   Abgleich liest diese Basis mit `git show <Basis>:<Datei>`; im flachen CI-Checkout fehlt der Verlauf, dort wird der
   Fall übersprungen (lokal und mit vollem Verlauf läuft er). */

/** Quelltext einer Datei auf einem Commit; null, wenn der Commit nicht im Verlauf ist (flacher Checkout). */
export function basisText(wurzel, basis, datei) {
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
  const jetzt = ohneKommentare(jetzigeQuelle);
  const basis = radiusLiterale(basisQuelle).filter((l) => !jetzt.includes(l.kontext))
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

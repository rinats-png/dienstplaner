/* ==========================================================================
   MODUL GETEILTERDIENST — Geteilte Dienste (WP-19, Strang B)

   Ein geteilter Dienst ist eine Dienstart mit einem zweiten Abschnitt
   (`zweiterAbschnitt: { start, ende }`, die Felder gibt es seit der
   Dienstformen-Einführung; `start`/`ende` der Dienstart sind der erste
   Abschnitt). Dazwischen liegt eine Lücke, die keine Arbeitszeit ist.

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung):
     T1 a  Ruhezeit ab dem Ende des zweiten Abschnitts; die Lücke ist keine
           Ruhezeit (§ 5 ArbZG). Der Bestand (fachpruefung.mjs) kennt nur den
           ersten Abschnitt und würde die Ruhe zu lang rechnen — dieses
           Modul prüft mit dem Gesamtfenster und meldet einen Hinweis.
     T2 b  Höchstspanne (Beginn Abschnitt 1 bis Ende Abschnitt 2): Der Betrieb
           trägt die Grenze ein; Vorgabe 0 = keine Grenze.
     T3 a  Kommen und Gehen je Abschnitt: istJeAbschnitt ordnet zwei
           Stempelpaare den Abschnitten zu. Die Ablage von zwei Paaren je Tag
           im Stempelmodell ist noch nicht angebunden (zeiterfassung.mjs
           kennt ein Paar je Tag) und kommt mit der Freigabe des Moduls.

   Befunde sind vorläufige Registerregeln (GETEILT-RUHE-01, GETEILT-SPANNE-01),
   höchstens Hinweis, nur bei aktivem Modul. Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, modulParameter, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";
import { between, fenster } from "./regelwerk.mjs";

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const min = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const r2 = (x) => Math.round(x * 100) / 100;
const n1 = (v) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const rufbereitschaft = (da) => !!da && (da.form === "ruf" || da.rufbereitschaft === true || da.ruhezeitNeutral === true);

/** @param {any} da */
export const istGeteilt = (da) => istObjekt(da) && !!da.zweiterAbschnitt;

/**
 * Die zwei Abschnitte in Minuten ab Mitternacht des Diensttages (der zweite
 * kann hinter 1440 liegen). Null, wenn die Form nicht stimmt.
 * @param {any} da
 * @returns {{ von: number, bis: number }[] | null}
 */
function abschnitteRoh(da) {
  const z = da.zweiterAbschnitt;
  const ok = (s) => typeof s === "string" && UHRZEIT.test(s);
  if (!istObjekt(da.zweiterAbschnitt)) return null;
  if (![da.start, da.ende, z && z.start, z && z.ende].every(ok)) return null;
  const s1 = min(da.start); let e1 = min(da.ende); if (e1 <= s1) e1 += 1440;
  let s2 = min(z.start); if (s2 < s1) s2 += 1440;
  let e2 = min(z.ende); if (e2 <= s2) e2 += 1440;
  return [{ von: s1, bis: e1 }, { von: s2, bis: e2 }];
}

/**
 * Prüft die Form eines geteilten Dienstes. Keine geteilte Dienstart → null.
 * @param {any} da
 * @returns {string | null}
 */
export function pruefeGeteiltenDienst(da) {
  if (!istGeteilt(da)) return null;
  const name = String(da.name || da.id || "Dienst").slice(0, 60);
  const z = da.zweiterAbschnitt;
  if (!istObjekt(z) || Object.keys(z).some((k) => k !== "start" && k !== "ende")) return `Dienstart ${name}: zweiter Abschnitt erwartet { start, ende }.`;
  const a = abschnitteRoh(da);
  if (!a) return `Dienstart ${name}: Beide Abschnitte brauchen Beginn und Ende als Uhrzeit (HH:MM).`;
  if (da.start === da.ende || z.start === z.ende) return `Dienstart ${name}: Ein Abschnitt hat Beginn und Ende zur selben Zeit.`;
  if (a[1].von <= a[0].bis) return `Dienstart ${name}: Der zweite Abschnitt muss nach einer Lücke auf den ersten folgen.`;
  if (a[1].bis - a[0].von > 1440) return `Dienstart ${name}: Beide Abschnitte zusammen dauern über 24 Stunden.`;
  return null;
}

/**
 * Arbeitszeit, Lücke und Spanne eines geteilten Dienstes.
 * @param {any} da
 */
export function geteilteZeiten(da) {
  const a = istGeteilt(da) && !pruefeGeteiltenDienst(da) ? abschnitteRoh(da) : null;
  if (!a) return null;
  return { arbeitH: r2((a[0].bis - a[0].von + a[1].bis - a[1].von) / 60), lueckeH: r2((a[1].von - a[0].bis) / 60),
    spanneH: r2((a[1].bis - a[0].von) / 60), abschnitte: a };
}

/** Beginn des ersten und Ende des zweiten Abschnitts in Minuten ab Mitternacht des Diensttages. @param {any} da */
export function geteiltesFenster(da) {
  const z = geteilteZeiten(da);
  return z ? { von: z.abschnitte[0].von, bis: z.abschnitte[1].bis } : null;
}

/**
 * Stempelzeiten je Abschnitt (T3 a). Eine Zeit gehört zu dem Abschnitt, den
 * das Paar überlappt; ein einziges Paar über die Lücke zählt nur den
 * Anteil in den Abschnitten (die Lücke ist keine Arbeitszeit).
 * @param {any} da
 * @param {{ start: string, ende: string }[]} paare
 * @returns {{ abschnitte: { istH: number }[], fehlt: number[], ausserhalb: boolean, durchgehend: boolean } | null}
 */
export function istJeAbschnitt(da, paare) {
  const z = geteilteZeiten(da);
  if (!z) return null;
  const ist = [0, 0];
  let ausserhalb = false, durchgehend = false;
  for (const p of Array.isArray(paare) ? paare : []) {
    if (!p || !UHRZEIT.test(p.start || "") || !UHRZEIT.test(p.ende || "")) { ausserhalb = true; continue; }
    let s = min(p.start); if (s < z.abschnitte[0].von - 720) s += 1440;
    let e = min(p.ende); if (e <= s) e += 1440;
    const treffer = z.abschnitte.map((ab) => Math.max(0, Math.min(e, ab.bis) - Math.max(s, ab.von)));
    if (!treffer[0] && !treffer[1]) ausserhalb = true;
    if (treffer[0] && treffer[1]) durchgehend = true;
    /* Überschneidet das Paar nur einen Abschnitt, zählt seine ganze Dauer dorthin (auch Mehrarbeit über das
       geplante Ende); überspannt es die Lücke, zählt nur der Anteil in den Abschnitten. */
    if (treffer[0] && treffer[1]) treffer.forEach((t, i) => { ist[i] += t; });
    else if (treffer[0]) ist[0] += e - s;
    else if (treffer[1]) ist[1] += e - s;
  }
  return { abschnitte: ist.map((t) => ({ istH: r2(t / 60) })), fehlt: ist.flatMap((t, i) => (t === 0 ? [i] : [])), ausserhalb, durchgehend };
}

const regelNach = (id) => {
  const r = REGELN_BRANCHEN.find((x) => x.id === id);
  if (!r) throw new Error(`${id} fehlt im Branchenkatalog.`);
  return r;
};

const tagKurz = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** Gesamtfenster einer Dienstart an einem Tag in absoluten Minuten; geteilte Dienste bis zum Ende des zweiten Abschnitts. */
function absFenster(da, tag) {
  const basis = between("2000-01-01", tag) * 1440;
  const g = istGeteilt(da) ? geteiltesFenster(da) : null;
  if (g) return [basis + g.von, basis + g.bis];
  return fenster(tag, da);
}

const addTage = (tag, n) => new Date(new Date(`${tag}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * Befunde zu einem geteilten Dienst (und zur Ruhezeit zu einem geteilten
 * Nachbardienst). Inaktives Modul → keine Befunde.
 * @param {any} m Betrieb
 * @param {any} da Dienstart der geprüften Einteilung
 * @param {string} d Tag
 * @param {{ person?: any, dienstAm: (p: any, d: string) => any, auswerten: (r: any, k: any) => any, module?: readonly any[] }} o
 */
export function geteilterdienstBefunde(m, da, d, { person, dienstAm, auswerten, module = BRANCHENMODULE }) {
  if (!da || !modulAktiv(m, "geteilterdienst", module)) return [];
  const aus = [];
  const dienstarten = Array.isArray(m && m.dienstarten) ? m.dienstarten : [];
  const eigenGeteilt = istGeteilt(da) && !pruefeGeteiltenDienst(da);

  /* Höchstspanne (T2 b): nur mit eingetragener Grenze. */
  if (eigenGeteilt) {
    const grenze = modulParameter(m, "geteilterdienst", module).hoechstSpanneStunden;
    if (grenze > 0) {
      const r = { ...regelNach("GETEILT-SPANNE-01"), parameter: { groesse: "Spanne in Stunden", hoechstens: grenze } };
      const z = geteilteZeiten(da);
      const erg = auswerten(r, { wert: z.spanneH, datum: d });
      const b = erg.status === "verletzt" ? alsEinteilungsBefund(r, { ...erg,
        text: `Spanne ${n1(z.spanneH)} h von Beginn des ersten bis Ende des zweiten Abschnitts, Grenze des Betriebs ${n1(grenze)} h` }) : null;
      if (b) aus.push(b);
    }
  }

  /* Ruhezeit (T1 a): ab Ende des zweiten Abschnitts, die Lücke zählt nicht. */
  if (typeof dienstAm === "function" && !rufbereitschaft(da) && (eigenGeteilt || dienstarten.some(istGeteilt))) {
    const [von, bis] = absFenster(da, d);
    for (const off of [-2, -1, 1, 2]) {
      const dd = addTage(d, off);
      const id = dienstAm(person, dd);
      if (!id) continue;
      const anderer = dienstarten.find((x) => x && String(x.id) === String(id));
      if (!anderer || !anderer.start || !anderer.ende || rufbereitschaft(anderer)) continue;
      if (!eigenGeteilt && !(istGeteilt(anderer) && !pruefeGeteiltenDienst(anderer))) continue;
      const [oVon, oBis] = absFenster(anderer, dd);
      const ruhe = oVon > von ? (oVon - bis) / 60 : (von - oBis) / 60;
      const r = regelNach("GETEILT-RUHE-01");
      const erg = auswerten(r, { wert: Math.max(0, r2(ruhe)), datum: d });
      if (erg.status !== "verletzt") continue;
      const b = alsEinteilungsBefund(r, { ...erg,
        text: `Ruhezeit ${n1(Math.max(0, ruhe))} h zum Dienst am ${tagKurz(dd)} — gerechnet ab Ende des zweiten Abschnitts, die Lücke zählt nicht` });
      if (b) { aus.push(b); break; }
    }
  }
  return aus;
}

/**
 * Schreibweg: prüft die zweiten Abschnitte aller übermittelten Dienstarten.
 * @param {any} neuM
 * @returns {{ grund?: string }}
 */
export function geteilterdienstZusammen(neuM) {
  for (const da of Array.isArray(neuM && neuM.dienstarten) ? neuM.dienstarten : []) {
    const f = pruefeGeteiltenDienst(da);
    if (f) return { grund: f };
  }
  return {};
}

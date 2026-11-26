/* ==========================================================================
   RECHENKERN — KONFLIKTE MIT URSACHE (WP-I8, Teil: Lücken-Ursache)

   Bleibt ein Dienst unterbesetzt, sagt diese Datei, WARUM — als Zahlen und
   Regelkennungen, nie als Text und nie mit Personenbezug:

   - hindernisse: wie viele freie Personen eine Regel (Kennung des
                  Befundkatalogs, z. B. "abwesend", "ruhezeitGesetz") am
                  Einsatz hindert (Befund ab „Achtung“, wie die Ersatzsuche).
   - direkt:      freie Personen ohne Hindernis. Gibt es sie, ist die Lücke
                  keine Regelfrage, die Planung wählt (Ursache "direktMoeglich").
   - kleinste:    die kleinste Regelmenge, die bei mindestens einer Person
                  entfallen müsste, damit der Dienst besetzbar wäre.
   - wege:        die kleinsten Regelmengen mit der Zahl der Personen, für die
                  sie gelten, und `deckt` (wie viele der fehlenden Besetzungen
                  damit höchstens gedeckt wären: direkt + Personen, gedeckelt
                  auf `fehlt`). Das ist die Zählung, kein Plan: Ob eine Regel
                  entfallen darf, entscheidet nicht dieser Kern (Rangfolge
                  Gesetz > … im Planer, WP-I7).

   Keine Personenkennung, kein Befundtext, kein Abwesenheitsgrund im
   Ergebnis (Schutzgründe nennt CENTRIC nie). Nur Kennungen und Zahlen.

   Aufwand: Jede Personenprüfung (hindernisBefunde) zählt gegen EIN Budget
   je äußerem Einstieg (budgetNeu). konflikteMitUrsache reicht das eine
   Budget an alle Lücken durch, nie je Lücke ein neues. Ist es erschöpft,
   gilt das Ergebnis als unvollständig und behauptet keine Ursache (fail
   closed). Parametergrenzen: Zeitraum, Lückenzahl, Wegezahl. Die Rechnung
   ist synchron und damit durch das Budget (Voreinstellung 400 Personen-
   prüfungen) nach oben begrenzt; wer mehr braucht, ruft mehrfach mit eigenem
   Budget und gibt dem Event-Loop dazwischen Luft.

   Rein: keine Uhr, kein Zufall, keine Mutation, kein Import aus src/ oder
   intelligence/.
   ========================================================================== */
import { addDays } from "../regelwerk.mjs";
import { aktive, besetzung, personTag, qualGueltig } from "./plan.mjs";
import { hindernisBefunde, stufeRang } from "./einsatz.mjs";
import { neuesVorgabenBudget } from "../vorgabenwirkung.mjs";
import { VORGABEN_WIRKUNG_GRENZE } from "../vorgaben.mjs";

/** Höchstzahl Personenprüfungen je äußerem Einstieg (ein Budget für alle Lücken). */
export const PERSONEN_PRUEFUNGEN_MAX = 400;
/** Höchstzahl untersuchter Lücken je Aufruf (weitere werden gezählt). */
export const LUECKEN_MAX = 50;
/** Höchstzahl Wege je Lücke. */
export const WEGE_MAX = 5;
/** Längster Zeitraum in Tagen (die Zählregeln darüber gehören in die Aggregate, WP-I7). */
export const TAGE_MAX = 62;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const schaltjahr = (j) => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
const tageImMonat = (j, mo) => (mo === 2 ? (schaltjahr(j) ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31);
function gueltigerTag(s) {
  if (typeof s !== "string") return false;
  const x = ISO.exec(s);
  if (!x) return false;
  const [j, mo, t] = [Number(x[1]), Number(x[2]), Number(x[3])];
  return j >= 1900 && j <= 2200 && mo >= 1 && mo <= 12 && t >= 1 && t <= tageImMonat(j, mo);
}

/** Ein Budget für einen äußeren Einstieg. Ungültige Werte ergeben ein erschöpftes Budget. */
export function budgetNeu(personenPruefungen = PERSONEN_PRUEFUNGEN_MAX) {
  const n = Number.isInteger(personenPruefungen) && personenPruefungen > 0 ? Math.min(personenPruefungen, PERSONEN_PRUEFUNGEN_MAX) : 0;
  return { rest: n };
}
/** Verbraucht eine Prüfung; false, wenn das Budget erschöpft oder ungültig ist (kein NaN-/Überlauf-Umweg). */
function verbrauchen(budget) {
  if (!budget || !Number.isInteger(budget.rest) || budget.rest <= 0) return false;
  /* Übergebene Budgets sind nie größer als die Obergrenze (kein 1e9 als Umgehung). */
  if (budget.rest > PERSONEN_PRUEFUNGEN_MAX) budget.rest = PERSONEN_PRUEFUNGEN_MAX;
  budget.rest -= 1;
  return true;
}

/** Betrieb mit allen Feldern, die die Einsatzprüfung liest; sonst Fehlerobjekt statt TypeError. */
const betriebOk = (m) => !!m && typeof m === "object" && Array.isArray(m.personen) && Array.isArray(m.dienstarten)
  && Array.isArray(m.abwesenheiten) && !!m.einstellungen && typeof m.einstellungen === "object"
  && !!m.abweichungen && typeof m.abweichungen === "object"
  && m.personen.every((p) => !!p && typeof p === "object" && p.id !== undefined && p.id !== null);
/** Befund „nicht bewertbar“ (Daten fehlen: schutzOffen, künftig vorgabeOffen): Stufe Hinweis, aber nie stillschweigend zulässig. */
const istOffen = (b) => /Offen$/.test(String(b.regel));
/** Hindert der Befund den Einsatz? Ab „Achtung“ oder nicht bewertbar (fail closed). */
const hindert = (b) => stufeRang(b.stufe) >= 2 || istOffen(b);

/** Das Vorgaben-Budget des Einstiegs: ein übergebenes mit falscher Form oder zu großem Rest wird nie übernommen (Obergrenze der Wirkung). */
function vorgabenBudgetPruefen(b) {
  const ok = !!b && typeof b === "object" && Number.isFinite(b.rest) && b.cache instanceof WeakMap && b.vorbereitet instanceof WeakMap;
  if (!ok) return neuesVorgabenBudget();
  if (b.rest > VORGABEN_WIRKUNG_GRENZE.aufwand) b.rest = VORGABEN_WIRKUNG_GRENZE.aufwand;
  return b;
}

const reihe = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Ursache einer Lücke eines Dienstes an einem Tag.
 * @param {any} m Betrieb (Sicht des Aufrufers; hier wird nichts gelesen, was die Sicht nicht enthält)
 * @param {string} d Tag JJJJ-MM-TT
 * @param {string} dienstId Dienstart
 * @param {{ budget?: { rest: number } }} [opt] budget: das eine Budget des äußeren Einstiegs
 */
export function lueckenUrsache(m, d, dienstId, { budget = budgetNeu(), vorgabenBudget: vorgabenBudgetRoh } = {}) {
  const vorgabenBudget = vorgabenBudgetPruefen(vorgabenBudgetRoh);
  if (!betriebOk(m)) return { ok: false, grund: "betriebUngueltig" };
  if (!gueltigerTag(d)) return { ok: false, grund: "datumUngueltig" };
  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return { ok: false, grund: "dienstUnbekannt" };
  const b = besetzung(m, d)[dienstId];
  const fehlt = b && b.diff < 0 && !b.bedarfOffen ? -b.diff : 0;
  const qualFehlt = b ? b.qual.filter((q) => !q.ok).map((q) => ({ qid: String(q.qid), noetig: q.noetig, ist: q.ist })) : [];
  const aus = { datum: d, dienst: dienstId, fehlt, geprueft: 0, direkt: 0, ohneQualifikation: 0, vorgabenUnvollstaendig: false, hindernisse: [], kleinste: null, wege: [], ursache: "besetzt", unvollstaendig: false };
  if (qualFehlt.length) aus.qualFehlt = qualFehlt;
  if (fehlt === 0 && !qualFehlt.length) return aus;

  const zaehl = new Map();
  const mengen = new Map();   // "a|b" -> { regeln, personen }
  for (const p of aktive(m, d)) {
    if (personTag(m, p, d).dienstId) continue;                  // hat schon einen Dienst
    if (!verbrauchen(budget)) { aus.unvollstaendig = true; break; }
    aus.geprueft++;
    /* Qualifikationslücke: nur Personen mit einer der fehlenden Qualifikationen können sie schließen. */
    if (qualFehlt.length && !qualFehlt.some((q) => qualGueltig(m, p, q.qid))) { aus.ohneQualifikation++; continue; }
    const regeln = [...new Set(hindernisBefunde(m, p, d, da, { vorgabenBudget, vorgabenAutomatisch: true }).filter(hindert).map((x) => String(x.regel)))].sort(reihe);
    if (regeln.includes("vorgabeOffen")) aus.vorgabenUnvollstaendig = true;      // Vorgaben nicht vollständig geprüft
    if (!regeln.length) { aus.direkt++; continue; }
    for (const r of regeln) zaehl.set(r, (zaehl.get(r) || 0) + 1);
    const k = regeln.join("|");
    const e = mengen.get(k);
    if (e) e.personen++; else mengen.set(k, { regeln, personen: 1 });
  }
  aus.hindernisse = [...zaehl].map(([regel, personen]) => ({ regel, personen })).sort((x, y) => y.personen - x.personen || reihe(x.regel, y.regel));
  if (vorgabenBudget.ausgeschoepft) aus.vorgabenUnvollstaendig = true;
  if (aus.vorgabenUnvollstaendig) aus.unvollstaendig = true;
  if (aus.unvollstaendig) { aus.ursache = "unvollstaendig"; return aus; }        // keine Ursache behaupten, die nicht belegt ist
  if (aus.geprueft === 0) { aus.ursache = "keinPersonal"; return aus; }
  if (aus.direkt > 0) { aus.ursache = "direktMoeglich"; return aus; }
  if (!mengen.size) { aus.ursache = qualFehlt.length ? "qualifikationFehlt" : "keinPersonal"; return aus; }
  aus.ursache = "hindernisse";
  const wege = [...mengen.values()]
    .sort((x, y) => x.regeln.length - y.regeln.length || y.personen - x.personen || reihe(x.regeln.join("|"), y.regeln.join("|")))
    .slice(0, WEGE_MAX)
    .map((w) => ({ regeln: w.regeln, personen: w.personen, deckt: Math.min(fehlt, aus.direkt + w.personen) }));
  aus.wege = wege;
  aus.kleinste = wege.length ? { regeln: wege[0].regeln, personen: wege[0].personen } : null;
  return aus;
}

/**
 * Alle Lücken eines Zeitraums mit Ursache. EIN Budget für den ganzen Aufruf.
 * @param {any} m
 * @param {string} von JJJJ-MM-TT
 * @param {string} bis JJJJ-MM-TT (einschließlich; höchstens TAGE_MAX Tage)
 * @param {{ budget?: { rest: number }, luckenMax?: number }} [opt]
 */
export function konflikteMitUrsache(m, von, bis, { budget = budgetNeu(), vorgabenBudget: vorgabenBudgetRoh, luckenMax = LUECKEN_MAX } = {}) {
  const vorgabenBudget = vorgabenBudgetPruefen(vorgabenBudgetRoh);
  if (!betriebOk(m)) return { ok: false, grund: "betriebUngueltig" };
  if (!gueltigerTag(von) || !gueltigerTag(bis)) return { ok: false, grund: "datumUngueltig" };
  if (bis < von) return { ok: false, grund: "zeitraumUmgekehrt" };
  const tage = [];
  for (let t = von; t <= bis; t = addDays(t, 1)) {
    if (tage.length >= TAGE_MAX) return { ok: false, grund: "zeitraumZuGross" };
    tage.push(t);
  }
  const max = Number.isInteger(luckenMax) && luckenMax > 0 ? Math.min(luckenMax, LUECKEN_MAX) : LUECKEN_MAX;
  const aus = { ok: true, von, bis, luckenGesamt: 0, abgeschnitten: false, unvollstaendig: false, vorgabenUnvollstaendig: false, luecken: [] };
  for (const t of tage) {
    const bes = besetzung(m, t);
    for (const da of m.dienstarten) {
      const e = bes[da.id];
      if (!e || e.bedarfOffen || !(e.diff < 0 || e.qualFehlt)) continue;
      aus.luckenGesamt++;
      if (aus.luecken.length >= max) { aus.abgeschnitten = true; continue; }
      const r = lueckenUrsache(m, t, da.id, { budget, vorgabenBudget });
      if (r.ok === false) continue;
      if (r.unvollstaendig) aus.unvollstaendig = true;
      if (r.vorgabenUnvollstaendig) aus.vorgabenUnvollstaendig = true;
      aus.luecken.push(r);
    }
  }
  return aus;
}

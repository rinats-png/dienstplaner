/* ==========================================================================
   RECHENKERN — ERSATZKANDIDATEN UND NEAR-MISS (WP-I12a)

   Für einen unterbesetzten Dienst (Tag + Dienstart) rechnet diese Datei aus
   dem Ergebnis der Ersatzsuche (ersatzVorschlaege, einsatz.mjs) die
   Kandidaten, die die Intelligence-Schicht (F3) als Fakten bekommt:

   - direkt:  Kandidaten ohne Befund ab „Achtung“ (moeglich) — Fakt
              kandidat.zulaessig.
   - nahe:    Near-Miss: Kandidaten, an denen NUR die Ruhezeit hindert
              (Befund ruhezeitGesetz oder ruhezeitBetrieb, sonst keiner ab
              „Achtung“), mit dem fehlenden Spielraum in Minuten
              (kandidat.spielraum), der hindernden Regel (kandidat.hinderung)
              und der geplanten Ruhezeit vor dem Dienst (ruhezeit.ist).

   Der Spielraum ist die Zahl Minuten, um die die kürzeste Ruhezeit zu den
   Nachbardiensten (zwei Tage davor und danach, wie die Fachprüfung) unter der
   Grenze liegt (Einstellung des Betriebs, sonst 11 h nach § 5 ArbZG) — also
   „wäre zulässig, wenn der Nachbardienst so viele Minuten früher endet bzw.
   später beginnt“. Gleiche Formel wie die Fachprüfung (fachpruefung.mjs),
   damit Befund und Spielraum nie auseinanderlaufen.

   Nichts davon ist geraten: Hindert etwas anderes (Qualifikation, Schutz,
   Abwesenheit, Teilzeit …), gibt es keinen Spielraum in Minuten und der
   Kandidat ist kein Near-Miss. Reihenfolge: direkte Kandidaten wie in
   ersatzVorschlaege (Eignung), Near-Miss nach kleinstem Spielraum, dann nach
   Eignung. Rein: keine Uhr außer heute(), kein Zufall, keine Mutation.
   ========================================================================== */
import { addDays, fenster, uhrversatz } from "../regelwerk.mjs";
import { rufbereitschaft, RUHEZEIT_GESETZ } from "../fachpruefung.mjs";
import { personTag } from "./plan.mjs";
import { ersatzVorschlaege, hindernisBefunde, stufeRang } from "./einsatz.mjs";

export const RUHE_REGELN = Object.freeze(["ruhezeitGesetz", "ruhezeitBetrieb"]);
/** Höchstzahl je Liste (Faktenpaket hat eine Obergrenze). */
export const KANDIDATEN_MAX = 10;

const dienstart = (m, id) => (m.dienstarten || []).find((x) => x.id === id) || null;

/**
 * Ruhezeit in Minuten zwischen der Dienstart `da` am Tag `d` und den Diensten der Person an den zwei Tagen davor
 * und danach (Rufbereitschaft zählt nicht, wie in der Fachprüfung). `vor` = die kürzeste Ruhezeit zu einem Dienst
 * davor (null: keiner), `kuerzeste` = die kürzeste über alle Nachbarn (null: keiner).
 * @returns {{ vor: number|null, kuerzeste: number|null }}
 */
export function ruheZuNachbarn(m, p, d, da, { zeitumstellung = false } = {}) {
  let vor = null, kuerzeste = null;
  if (!da || !da.start || !da.ende || rufbereitschaft(da)) return { vor, kuerzeste };
  const [nStart, nEnde] = fenster(d, da);
  for (const off of [-2, -1, 1, 2]) {
    const dd = addDays(d, off);
    const id = personTag(m, p, dd).dienstId || null;
    if (!id) continue;
    const other = dienstart(m, id);
    if (!other || !other.start || !other.ende || rufbereitschaft(other)) continue;
    const [oStart, oEnde] = fenster(dd, other);
    const davor = oStart <= nStart;
    let ruhe = davor ? nStart - oEnde : oStart - nEnde;
    if (zeitumstellung) ruhe += davor ? uhrversatz(oEnde, nStart) : uhrversatz(nEnde, oStart);
    if (davor && (vor === null || ruhe < vor)) vor = ruhe;
    if (kuerzeste === null || ruhe < kuerzeste) kuerzeste = ruhe;
  }
  return { vor, kuerzeste };
}

/**
 * Kandidaten für einen Dienst, getrennt in direkte Treffer und Near-Miss.
 * @returns {{ datum: string, dienst: string, direkt: { personId: string, punkte: number }[],
 *   nahe: { personId: string, hinderung: string, spielraumMin: number, ruheVorMin: number|null, punkte: number }[],
 *   andere: number }}
 */
export function ersatzKandidaten(m, d, dienstId) {
  const da = dienstart(m, dienstId);
  const aus = { datum: d, dienst: dienstId, direkt: [], nahe: [], andere: 0 };
  if (!da) return aus;
  const grenzeMin = (Number((m.einstellungen || {}).ruhezeit) || RUHEZEIT_GESETZ) * 60;
  for (const k of ersatzVorschlaege(m, d, dienstId)) {
    if (k.moeglich) { aus.direkt.push({ personId: String(k.person.id), punkte: k.punkte }); continue; }
    const ernst = hindernisBefunde(m, k.person, d, da).filter((b) => stufeRang(b.stufe) >= 2);
    const nurRuhe = ernst.length > 0 && ernst.every((b) => RUHE_REGELN.includes(b.regel));
    if (!nurRuhe) { aus.andere++; continue; }
    const { vor, kuerzeste } = ruheZuNachbarn(m, k.person, d, da);
    const spielraum = kuerzeste === null ? 0 : Math.round(grenzeMin - kuerzeste);
    if (!(spielraum > 0)) { aus.andere++; continue; }   // nicht in Minuten bezifferbar: kein Near-Miss
    const hinderung = ernst.some((b) => b.regel === "ruhezeitGesetz") ? "ruhezeitGesetz" : "ruhezeitBetrieb";
    aus.nahe.push({ personId: String(k.person.id), hinderung, spielraumMin: spielraum, ruheVorMin: vor, punkte: k.punkte });
  }
  aus.direkt = aus.direkt.slice(0, KANDIDATEN_MAX);
  aus.nahe.sort((a, b) => a.spielraumMin - b.spielraumMin || b.punkte - a.punkte || (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0));
  aus.nahe = aus.nahe.slice(0, KANDIDATEN_MAX);
  return aus;
}

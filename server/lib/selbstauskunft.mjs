/* ==========================================================================
   SELBSTAUSKUNFT ALS ANTRAG MIT FREIGABE (WP-15)

   „Zeiten bestätigen" (POST /api/zeit-bestaetigen) war bis WP-15 sofort Ist:
   Die Person bestätigte „wie geplant" oder „abweichend", und die Zeit zählte
   im Stundenkonto, in den Zuschlägen und in der Lohnausgabe — ohne dass ein
   zweiter Mensch sie je sah. Jetzt gilt (Akzeptanz WP-15: „Selbstauskunft wird
   Antrag; Abweichung markiert; erst nach Freigabe Ist"):

     1. Die Person stellt die Selbstauskunft. Sie wird ein ANTRAG, kein Ist:
        erfassung[Person|Tag] = { start: null, ende: null, bestaetigt: false,
        selbstauskunft: { status: "offen", vorschlag, abweichung, … } }.
        Mit bestaetigt:false zählt der Tag weiter wie vorher (Planzeit, nie die
        Behauptung) — „nicht erfasst", nicht „so gearbeitet".
     2. Die Abweichung vom Plan wird vom SERVER berechnet und am Antrag
        markiert (Beginn, Ende, Dauer, Pause), auch bei „wie geplant"
        (abweichend: false). Der Client liefert sie nicht.
     3. Stempelabgleich: Gibt es für den Tag einen Stempel — oder läuft vom
        Vortag ein offener Beginn in den Tag —, nimmt der Server keine
        Selbstauskunft an (409): Der Stempel ist das Original, eine Abweichung
        davon geht als Korrekturantrag am Stempel (WP-14). Bei der Freigabe
        wird derselbe Abgleich noch einmal gemacht; ist inzwischen ein Stempel
        da, ist die Freigabe verweigert (409) und der Antrag nur noch
        abzulehnen oder zurückzuziehen.
     4. Freigabe: nur Leitung und Planung (staff.edit), nie die antragstellende
        Person selbst (Vier-Augen; fail-closed), mit demselben Plan- und
        Pausencheck wie beim Stellen. Erst dann wird die Zeit Ist
        (bestaetigt: true) — mit Regelhinweisen (§ 3, § 4, § 5 ArbZG, MuSchG,
        JArbSchG), die nur Hinweise sind.
     5. Ablehnen (Begründung Pflicht) und Zurückziehen (nur die Person) lassen
        den Tag ohne Ist; die Entscheidung bleibt am Eintrag sichtbar, ein neuer
        Antrag ist möglich (der alte wandert in `verlauf`).

   Ablage und Datenschutz (E1/H8+): Der Antrag liegt in `erfassung` selbst und
   erbt damit alle Regeln der Ist-Zeiten — Beschäftigte sehen nur die eigenen,
   der Betriebsrat keine, die Schichtverantwortung für andere nur Beginn, Ende,
   bestätigt, Pause (Positivkatalog in sicht.mjs: der Teilbaum `selbstauskunft`
   mit Grund und Entscheidung wird für Dritte nie ausgeliefert), dieselbe
   Monatsscherbe und Aufbewahrung. Beschäftigte können ihn über das allgemeine
   Speichern weder anlegen noch ändern (erfassungZusammen übergeht Kopien).
   ========================================================================== */

import { selbstauskunftPruefen, geplanterDienst, heuteBerlin, tagePlus } from "./zeiterfassung.mjs";
import { regelHinweise } from "./zeitregeln.mjs";

export const SELBSTAUSKUNFT_STATUS = ["offen", "genehmigt", "abgelehnt", "zurueckgezogen"];
export const SA_GRUND_MIN = 10;
export const SA_GRUND_MAX = 500;
/** Wie viele frühere, entschiedene Anträge eines Tages am Eintrag bleiben. */
export const SA_VERLAUF_MAX = 5;

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const min = (z) => Number(z.slice(0, 2)) * 60 + Number(z.slice(3, 5));
/** Differenz zweier Uhrzeiten in Minuten, auf (−12 h, +12 h] gefaltet (Dienste über Mitternacht). */
const diff = (a, b) => { let d = min(a) - min(b); while (d > 720) d -= 1440; while (d <= -720) d += 1440; return d; };
const wer = (w) => ({ personId: w && w.personId !== undefined ? w.personId : null, name: (w && w.name) || null, rolle: (w && w.rolle) || null });

/** Der Berliner Tag eines ISO-Zeitpunkts. */
const berlinTag = (iso) => heuteBerlin(new Date(iso));

/**
 * Stempelabgleich (WP-15): Gibt es zu diesem Tag schon ein Original?
 * @returns {{ok: true, art?: undefined, grund?: undefined}
 *   | {ok: false, art: "STEMPEL_VORHANDEN"|"VORTAG_OFFEN"|"VORTAG_REICHT_HINEIN", grund: string}}
 */
export function stempelAbgleich(m, personId, datum) {
  const st = m && objekt(m.einstempeln) ? m.einstempeln : {};
  if (objekt(st[`${personId}|${datum}`]))
    return { ok: false, art: "STEMPEL_VORHANDEN", grund: "Für diesen Tag gibt es einen Stempel. Eine Abweichung davon beantragst du als Korrektur am Stempel." };
  const vor = st[`${personId}|${tagePlus(datum, -1)}`];
  if (objekt(vor) && vor.start && !vor.ende)
    return { ok: false, art: "VORTAG_OFFEN", grund: "Vom Vortag läuft noch ein offener Stempel in diesen Tag. Bitte zuerst den Vortag klären." };
  /* Ein abgeschlossener Nachtdienst vom Vortag, der in diesen Tag hineinreicht (Ende am Folgetag; Review 10). */
  if (objekt(vor) && vor.ende && vor.endeDatum === datum)
    return { ok: false, art: "VORTAG_REICHT_HINEIN", grund: "Ein Nachtdienst vom Vortag reicht in diesen Tag hinein (gestempelt bis in den Tag). Dafür gibt es schon einen Stempel." };
  return { ok: true };
}

/**
 * Die Abweichung der Angabe vom geplanten Dienst — vom Server gerechnet.
 * @returns {{abweichend: boolean, marken: string[], beginnMin: number, endeMin: number, dauerMin: number,
 *   pauseMin: (number|null), plan: {dienst: string, start: string, ende: string, pause: number}} | null}  null: kein Plan
 */
export function abweichungVomPlan(m, person, datum, eintrag) {
  const id = geplanterDienst(m, person, datum);
  const da = id ? (m.dienstarten || []).find((x) => x && String(x.id) === String(id)) : null;
  if (!da) return null;
  const planPause = Number.isFinite(Number(da.pause)) ? Number(da.pause) : 0;
  const start = eintrag.start || da.start, ende = eintrag.ende || da.ende;
  const anw = (s, e) => ((min(e) - min(s) + 1440) % 1440) || 1440;
  const beginnMin = diff(start, da.start), endeMin = diff(ende, da.ende);
  const dauerMin = anw(start, ende) - anw(da.start, da.ende);
  const pauseMin = eintrag.pause === undefined ? null : Number(eintrag.pause) - planPause;
  const marken = [];
  if (beginnMin !== 0) marken.push("BEGINN");
  if (endeMin !== 0) marken.push("ENDE");
  if (dauerMin !== 0) marken.push("DAUER");
  if (pauseMin !== null && pauseMin !== 0) marken.push("PAUSE");
  return { abweichend: marken.length > 0, marken, beginnMin, endeMin, dauerMin, pauseMin,
    plan: { dienst: String(da.kurz || da.name || da.id), start: da.start, ende: da.ende, pause: planPause } };
}

/**
 * Eine Selbstauskunft als Antrag stellen.
 * @param {any} m  gespeicherter Betrieb
 * @param {any} person  die Person (aus m.personen)
 * @param {{personId: (string|number), name?: (string|null), rolle?: (string|null)}} von
 * @param {string} datum
 * @param {any} wert  { start, ende, grund, pause } wie bei selbstauskunftPruefen (ohne bestaetigt)
 * @param {Date} jetzt
 * @param {string} id  Kennung des Antrags
 * @param {string} [heute]
 * @returns {{status: number, grund: string, art?: string} | {mandant: object, eintrag: object, antrag: object}}
 */
export function selbstauskunftStellen(m, person, von, datum, wert, jetzt, id, heute = heuteBerlin(jetzt)) {
  const u = selbstauskunftPruefen(m, person, String(datum), { ...(objekt(wert) ? wert : {}), bestaetigt: true }, heute);
  if (u.grund) return { status: 422, grund: u.grund };
  const k = `${person.id}|${datum}`;
  const alt = objekt(m.erfassung) ? m.erfassung[k] : undefined;
  let verlauf = [];
  if (alt !== undefined && alt !== null) {
    const sa = objekt(alt) ? alt.selbstauskunft : null;
    if (objekt(sa) && sa.status === "offen")
      return { status: 409, grund: "Für diesen Tag liegt schon ein offener Antrag vor.", art: "OFFEN" };
    if (!(objekt(sa) && (sa.status === "abgelehnt" || sa.status === "zurueckgezogen")))
      return { status: 409, grund: "Für diesen Tag ist schon eine Zeit erfasst. Korrekturen nimmt die Leitung vor." };
    const { verlauf: frueher = [], ...ohne } = sa;
    verlauf = [...(Array.isArray(frueher) ? frueher : []), ohne].slice(-SA_VERLAUF_MAX);
  }
  const abgleich = stempelAbgleich(m, person.id, String(datum));
  if (!abgleich.ok) return { status: 409, grund: abgleich.grund, art: abgleich.art };
  const e = u.eintrag;
  const vorschlag = { start: e.start, ende: e.ende, ...(e.pause !== undefined ? { pause: e.pause } : {}) };
  const antrag = {
    id, status: "offen", gestellt: jetzt.toISOString(), von: wer(von),
    wieGeplant: e.start === null && e.ende === null,
    vorschlag, grund: e.grund,
    abweichung: abweichungVomPlan(m, person, String(datum), e),
    stempel: "keiner",
    entschieden: null,
    ...(verlauf.length ? { verlauf } : {}),
  };
  const eintrag = { start: null, ende: null, bestaetigt: false, selbstauskunft: antrag };
  return { antrag, eintrag, mandant: { ...m, erfassung: { ...(m.erfassung || {}), [k]: eintrag } } };
}

/**
 * Einen Antrag entscheiden: genehmigen (→ Ist), ablehnen oder — nur die Person selbst — zurückziehen.
 * Das Recht (staff.edit für Genehmigen/Ablehnen) prüft der Aufrufer.
 * @param {any} m
 * @param {{personId: (string|number), datum: string, antragId: string, entscheidung: string, begruendung?: string}} r
 * @param {{personId: (string|number|null), name?: (string|null), rolle?: (string|null)}} durch
 * @param {Date} jetzt
 * @returns {{status: number, grund: string, art?: string} | {mandant: object, eintrag: object, antrag: object,
 *   hinweise: Array<{code: string, text: string}>}}
 */
export function selbstauskunftEntscheiden(m, r, durch, jetzt) {
  const { personId, datum, antragId, entscheidung } = r || {};
  const begruendung = typeof (r && r.begruendung) === "string" ? r.begruendung.trim() : "";
  if (!["genehmigt", "abgelehnt", "zurueckgezogen"].includes(entscheidung))
    return { status: 400, grund: "Entscheidung: genehmigt, abgelehnt oder zurueckgezogen." };
  if (!TAG.test(String(datum || "")) || personId === undefined || personId === null || personId === "")
    return { status: 400, grund: "Person und Tag angeben." };
  const k = `${personId}|${datum}`;
  const alt = objekt(m.erfassung) ? m.erfassung[k] : undefined;
  const sa = objekt(alt) ? alt.selbstauskunft : null;
  if (!objekt(sa) || sa.id !== antragId) return { status: 404, grund: "Diesen Antrag gibt es nicht." };
  if (sa.status !== "offen") return { status: 409, grund: "Dieser Antrag ist schon entschieden." };
  const eigen = sa.von && String(sa.von.personId) === String(durch.personId);
  if (entscheidung === "zurueckgezogen" && !eigen)
    return { status: 403, grund: "Zurückziehen kann nur, wer den Antrag gestellt hat." };
  /* Vier-Augen: die eigene Selbstauskunft gibt niemand selbst frei oder lehnt sie selbst ab. */
  if (entscheidung !== "zurueckgezogen" && eigen)
    return { status: 403, grund: "Die eigene Selbstauskunft gibt eine andere Person frei.", art: "VIER_AUGEN" };
  if (entscheidung === "abgelehnt" && (begruendung.length < SA_GRUND_MIN || begruendung.length > SA_GRUND_MAX))
    return { status: 422, grund: `Eine Ablehnung braucht eine Begründung (${SA_GRUND_MIN}–${SA_GRUND_MAX} Zeichen).` };
  if (begruendung.length > SA_GRUND_MAX) return { status: 422, grund: "Die Begründung ist zu lang." };

  const entschieden = { durch: wer(durch), wann: jetzt.toISOString(), ...(begruendung ? { begruendung } : {}) };
  const neuSa = { ...sa, status: entscheidung, entschieden };
  if (entscheidung !== "genehmigt") {
    const eintrag = { start: null, ende: null, bestaetigt: false, selbstauskunft: neuSa };
    return { antrag: neuSa, eintrag, hinweise: [], mandant: { ...m, erfassung: { ...m.erfassung, [k]: eintrag } } };
  }

  /* Genehmigen: derselbe Abgleich wie beim Stellen, gegen den Stand von jetzt. */
  const abgleich = stempelAbgleich(m, personId, String(datum));
  if (!abgleich.ok)
    return { status: 409, grund: `${abgleich.grund} Der Antrag lässt sich nur noch ablehnen oder zurückziehen.`, art: abgleich.art };
  const person = (m.personen || []).find((x) => x && String(x.id) === String(personId));
  if (!person) return { status: 404, grund: "Person nicht gefunden." };
  /* Plan und Angaben erneut prüfen, gemessen an dem Tag, an dem sie gestellt wurden (Rückblick-Frist). */
  const v = sa.vorschlag || {};
  const u = selbstauskunftPruefen(m, person, String(datum), { start: v.start ?? null, ende: v.ende ?? null, bestaetigt: true,
    grund: sa.grund || "", ...(v.pause !== undefined ? { pause: v.pause } : {}) }, berlinTag(sa.gestellt));
  if (u.grund) return { status: 409, grund: `Der Antrag passt nicht mehr zum Plan: ${u.grund}`, art: "PLAN_GEAENDERT" };
  /* Der Plan, an dem die Abweichung markiert wurde, muss noch derselbe sein — auch bei „wie geplant“, wo sonst
     still der heutige Plan übernommen würde (Review 7). */
  const planJetzt = abweichungVomPlan(m, person, String(datum), u.eintrag);
  if (!sa.abweichung || !planJetzt || JSON.stringify(sa.abweichung.plan) !== JSON.stringify(planJetzt.plan))
    return { status: 409, grund: "Der Antrag passt nicht mehr zum Plan: Der Plan dieses Tages hat sich seit dem Antrag geändert.", art: "PLAN_GEAENDERT" };
  const e = u.eintrag;
  const ist = { ...e, selbstauskunft: neuSa };
  const da = (m.dienstarten || []).find((d) => d && String(d.id) === String(geplanterDienst(m, person, String(datum))));
  const istZ = { start: e.start || (da && da.start), ende: e.ende || (da && da.ende),
    pause: e.pause !== undefined ? e.pause : (da && Number(da.pause)) || 0 };
  const hinweise = regelHinweise(m, person.id, String(datum), istZ);
  return { antrag: neuSa, eintrag: ist, hinweise, mandant: { ...m, erfassung: { ...m.erfassung, [k]: ist } } };
}

/** Offene Selbstauskünfte (für die Freigabe-Liste der Leitung und den Monatsabschluss), älteste zuerst. */
export function offeneSelbstauskuenfte(m, monat) {
  const erf = m && objekt(m.erfassung) ? m.erfassung : {};
  return Object.entries(erf)
    .filter(([k, e]) => objekt(e) && objekt(e.selbstauskunft) && e.selbstauskunft.status === "offen"
      && (monat === undefined || String(k.split("|")[1] || "").startsWith(monat)))
    .map(([k, e]) => ({ personId: k.split("|")[0], datum: k.split("|")[1], antrag: e.selbstauskunft }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

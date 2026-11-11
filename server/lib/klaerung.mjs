/* ==========================================================================
   KLÄRUNGSBEDÜRFTIGE BESETZUNG UND VORBEREITETER ERSATZ (RB-5)

   Betreiberentscheidung 2026-11-11: „Bis zur endgültigen Bestätigung bleibt
   der veröffentlichte Dienstplan unverändert. Intern wird die betroffene
   Schicht als klärungsbedürftig markiert. CENTRIC darf mögliche
   Unterbesetzung und Ersatzvorschläge vorbereiten, aber keine eigenmächtige
   Umbesetzung auslösen."

   1. Markierung (klaerungsMarker): Für jeden OFFENEN Fall der zweistufigen
      Krankmeldung (eingegangen, vorläufig bestätigt — krankmeldung.mjs) die
      Dienste der gemeldeten Person im gemeldeten Zeitraum, so wie der Plan
      sie heute zeigt (personTag). Abgeleitet beim Lesen, nie gespeichert:
      GET /api/bestand hängt sie als `klaerung` an den Betrieb — nur für
      Planung, Leitung (Kundenrolle) und die zuständige Schichtverantwortung
      (dieselbe Bereichsregel wie RB-2: die Fälle, die ihr die Sicht zeigt und
      die sie vorläufig bestätigen dürfte — svZustaendig, erster und letzter
      Tag —, ohne den eigenen). Beschäftigte, Betriebsrat, Betreiber: nie.
      PUT verwirft das Feld (rechte.mjs, abgeleiteteEntfernen). Endet der Fall
      (endgültig, abgelehnt, zurückgezogen), fehlt die Markierung beim
      nächsten Lesen von selbst.
      Inhalt ohne Gesundheitsangabe: Fall, Person, Tag, Dienst und der
      neutrale Text „Besetzung klärungsbedürftig" — keine Anmerkung, kein
      Grund, kein Status, kein Wort „krank".

   2. Vorbereitung (ersatzVorbereiten): Für markierte Dienste rechnet die
      vorhandene Engine (besetzung, ersatzKandidaten → ersatzVorschlaege →
      hindernisBefunde: Ruhezeit, Qualifikation, Verfügbarkeit, Schutzregeln
      usw.) auf einer GEDACHTEN Kopie des Betriebs, in der die markierten
      Personen an den markierten Tagen fehlen. Die gedachte Abwesenheit ist
      neutral („abwesend"), verlässt die Funktion nie und wird nirgends
      gespeichert. Ergebnis: mögliche Unterbesetzung und Kandidaten — als
      „Vorschlag, noch keine Änderung". Die Funktion liest `klaerung`, nie
      die Fälle selbst; sie schreibt nichts, versendet nichts und ändert
      keinen Plan. Eine Einteilung bleibt eine Handlung von Planung oder
      Leitung in der bestehenden Planungsoberfläche.

   Begrenzt: höchstens KLAERUNG_FAELLE_MAX Fälle je Anfrage, je Fall
   höchstens KLAERUNG_TAGE_MAX Tage, je Vorbereitung höchstens
   ERSATZ_SCHICHTEN_MAX Dienste und KANDIDATEN_MAX Kandidaten je Liste.
   ========================================================================== */
import { addDays } from "./regelwerk.mjs";
import { personTag, besetzung } from "./engine/plan.mjs";
import { ersatzKandidaten, KANDIDATEN_MAX } from "./engine/ersatzfakten.mjs";
import { fallOffen, svZustaendig } from "./krankmeldung.mjs";

export const KLAERUNG_HINWEIS = "Besetzung klärungsbedürftig";
export const VORSCHLAG_HINWEIS = "Vorschlag, noch keine Änderung";
export const KLAERUNG_FAELLE_MAX = 50;
export const KLAERUNG_TAGE_MAX = 62;
export const ERSATZ_SCHICHTEN_MAX = 14;
/** Rollen, die die Markierung bekommen. Die Schichtverantwortung („subplaner“) nur für ihren Bereich. */
export const KLAERUNG_ROLLEN = Object.freeze(["planer", "leitung", "kunde", "subplaner"]);
/** Rollen, für die der Ersatz vorbereitet wird: wer einteilen und endgültig bestätigen darf. */
export const ERSATZ_ROLLEN = Object.freeze(["planer", "leitung", "kunde"]);

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const tagGueltig = (s) => typeof s === "string" && TAG.test(s)
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const istObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (x) => (Array.isArray(x) ? x.filter(istObj) : []);
const gleich = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/* Der Rechenkern greift ungeprüft auf diese Felder zu. Eine flache Kopie — der gespeicherte Betrieb bleibt,
   wie er ist (auch sein Zwischenspeicher hängt nicht an der Kopie). */
const rechenbar = (m) => ({ ...m, personen: liste(m.personen), dienstarten: liste(m.dienstarten),
  abwesenheiten: liste(m.abwesenheiten), abweichungen: istObj(m.abweichungen) ? m.abweichungen : {},
  einspruenge: liste(m.einspruenge), qualifikationen: liste(m.qualifikationen), einheiten: liste(m.einheiten),
  einstellungen: istObj(m.einstellungen) ? m.einstellungen : {} });

/**
 * Die klärungsbedürftigen Dienste zu den gegebenen Fällen (nur offene; andere zählen nicht).
 * @param {any} m  der gespeicherte Betrieb
 * @param {any[]} faelle  die Fälle, die die lesende Rolle sehen darf
 * @returns {{ fallId: string, personId: any, datum: string, dienstId: string, hinweis: string }[]}
 */
export function klaerungsMarker(m, faelle) {
  if (!istObj(m)) return [];
  const offen = liste(faelle).filter((f) => fallOffen(f) && tagGueltig(f.von) && tagGueltig(f.bis) && f.von <= f.bis)
    .slice(0, KLAERUNG_FAELLE_MAX);
  if (!offen.length) return [];
  const r = rechenbar(m);
  const aus = [];
  for (const f of offen) {
    const p = r.personen.find((x) => gleich(x.id, f.personId));
    if (!p) continue;
    let d = f.von;
    for (let i = 0; i < KLAERUNG_TAGE_MAX && d <= f.bis; i++, d = addDays(d, 1)) {
      let dienstId = null;
      try { dienstId = personTag(r, p, d).dienstId || null; } catch { dienstId = null; }
      if (dienstId) aus.push({ fallId: String(f.id), personId: p.id, datum: d, dienstId: String(dienstId), hinweis: KLAERUNG_HINWEIS });
    }
  }
  return aus;
}

/**
 * Markierung für die lesende Rolle (GET /api/bestand). Planung, Leitung, Kundenrolle: alle offenen Fälle des
 * Betriebs. Schichtverantwortung: nur die Fälle, die ihr die Sicht ausliefert (`sichtFaelle`, Bereichsregel
 * RB-2), ohne den eigenen. Alle anderen Rollen: null (kein Feld).
 * @param {any} m  der gespeicherte Betrieb
 * @param {{ rolle: string, person?: any }} sitzung
 * @param {any[]} [sichtFaelle]  für die Schichtverantwortung: die Fälle aus ihrer Sicht
 * @returns {any[] | null}
 */
export function klaerungFuerRolle(m, sitzung, sichtFaelle) {
  if (!istObj(m) || !sitzung || !KLAERUNG_ROLLEN.includes(sitzung.rolle)) return null;
  const alle = liste(m.krankmeldungen);
  if (sitzung.rolle !== "subplaner") return klaerungsMarker(m, alle);
  /* Zweifach: der Fall steht in ihrer Sicht UND sie ist für ihn zuständig wie beim vorläufigen Bestätigen
     (svZustaendig: sie und die Person am ersten und am letzten Tag in derselben Einheit, kein Pool). */
  const ich = liste(m.personen).find((p) => gleich(p.id, sitzung.person));
  if (!ich) return [];
  const sichtbar = new Set(liste(sichtFaelle).map((f) => String(f.id)));
  return klaerungsMarker(m, alle.filter((f) => sichtbar.has(String(f.id)) && !gleich(f.personId, ich.id)
    && svZustaendig(m, ich, f.personId, f.von, f.bis)));
}

/**
 * Bereitet für markierte Dienste Unterbesetzung und Ersatz vor — gedacht, nie geschrieben.
 * @param {any} m  der Betrieb in der Sicht von Planung oder Leitung (mit `klaerung`)
 * @param {{ fallId?: string, max?: number }} [wahl]  nur die Dienste dieses Falls; höchstens `max` Dienste
 * @returns {{ fallId: string, personId: any, datum: string, dienstId: string, hinweis: string,
 *   besetzung: { soll: number, jetzt: number, ohne: number, fehlt: number, qualFehlt: string[] },
 *   direkt: { personId: string, punkte: number }[], nahe: any[], andere: number }[]}
 */
export function ersatzVorbereiten(m, wahl = {}) {
  if (!istObj(m)) return [];
  const marker = liste(m.klaerung).filter((k) => tagGueltig(k.datum) && typeof k.dienstId === "string"
    && (wahl.fallId === undefined || gleich(k.fallId, wahl.fallId)));
  if (!marker.length) return [];
  const max = Math.max(0, Math.min(ERSATZ_SCHICHTEN_MAX, Number.isFinite(wahl.max) ? Number(wahl.max) : ERSATZ_SCHICHTEN_MAX));
  const r = rechenbar(m);
  /* Gedacht: ALLE markierten Personen fehlen an ihren markierten Tagen (neutral, ohne Grund). */
  const gedacht = { ...r, abwesenheiten: [...r.abwesenheiten, ...liste(m.klaerung).filter((k) => tagGueltig(k.datum))
    .map((k, i) => ({ id: `klaerung-gedacht-${i}`, personId: k.personId, art: "abwesend", von: k.datum, bis: k.datum }))] };
  const aus = [];
  for (const k of marker.slice(0, max)) {
    try {
      const vor = besetzung(r, k.datum)[k.dienstId];
      const nach = besetzung(gedacht, k.datum)[k.dienstId];
      if (!vor || !nach) continue;
      const kand = ersatzKandidaten(gedacht, k.datum, k.dienstId);
      aus.push({ fallId: k.fallId, personId: k.personId, datum: k.datum, dienstId: k.dienstId, hinweis: VORSCHLAG_HINWEIS,
        besetzung: { soll: nach.soll, jetzt: vor.anzahl, ohne: nach.anzahl, fehlt: Math.max(0, nach.soll - nach.anzahl),
          qualFehlt: (nach.qual || []).filter((q) => !q.ok).map((q) => String(q.qid)) },
        direkt: kand.direkt.slice(0, KANDIDATEN_MAX), nahe: kand.nahe.slice(0, KANDIDATEN_MAX), andere: kand.andere });
    } catch { /* nicht rechenbar: kein Vorschlag (nichts geraten) */ }
  }
  return aus;
}

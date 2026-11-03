import { dienstAm, imDienst } from "./fachpruefung.mjs";
import { dauer } from "./schutzpruefung.mjs";
import { tagePlus } from "./zeiterfassung.mjs";
import { planFreigabeAktiv, istEntwurfstag } from "./planfreigabe.mjs";

/* ==========================================================================
   DIE TERMINE EINES KALENDER-FEEDS, LIVE AUS DEM BESTAND (WP-24)

   Bis WP-24 rechnete die Oberfläche die Termine beim Einrichten und schickte
   sie an /kalender/daten; der Feed zeigte danach den Stand von damals. Ein
   geänderter Plan erreichte den Kalender nie, und die Termine kamen vom
   Gerät — nicht vom Bestand.

   Jetzt rechnet der Server sie bei jedem Abruf aus dem aktuellen Bestand,
   mit derselben Planrechnung wie die Prüfungen (dienstAm, fachpruefung.mjs).

   Was im Feed steht — und was nie:
     - nur die EIGENEN Dienste dieser einen Person: Dienstart, Zeiten, Dauer,
       Pause, Ort. Kein Kollege, keine Besetzung, keine Qualifikation.
     - Abwesenheit nur als ganztägiger Termin mit neutralem Wort. Genannt wird
       die Art nur, wenn sie keine Gesundheits- oder Schutzangabe ist
       (Urlaub, Schulung, Freizeitausgleich, Freistellung); alles andere —
       Krankheit, Mutterschutz, Beschäftigungsverbot, Elternzeit, Kur,
       Sonstiges — heißt „abwesend". Nie ein Grund, nie eine Notiz.
     - keine Schutzmerkmale (Alter, Schwangerschaft, Einschränkungen), keine
       Befunde, keine Konten.
   ========================================================================== */

/** Abwesenheitsarten, deren Name in den Kalender darf. Alles andere: „abwesend". */
export const ABWESENHEIT_OEFFENTLICH = Object.freeze({
  urlaub: "Urlaub", schulung: "Schulung", ausgleich: "Freizeitausgleich", frei: "Freistellung",
});
const NEUTRAL = "abwesend";

/* --------------------------------------------------------------------------
   ENTWÜRFE (WP-23) — dieselbe Regel wie die Sicht, nicht eine zweite

   Beschäftigte bekommen Einteilungen nur für freigegebene Monate und für Tage
   bis einschließlich heute (server/lib/sicht.mjs, planOhneEntwurf). Der Feed
   darf nicht mehr zeigen als die Sicht, die dieselbe Person in der Anwendung
   hat. Entschieden wird an der EINEN Stelle, an der auch Sicht und Oberfläche
   entscheiden: server/lib/planfreigabe.mjs (planFreigabeAktiv, istEntwurfstag).

   Wer den Entwurf sieht, entscheidet wie in der Sicht die Rolle: nur
   Beschäftigte nicht (sicht.mjs: entwurfVerbergen = rolle === "mitarbeiter"
   && planFreigabeAktiv). Betriebsrat (Mitbestimmung vor der Freigabe),
   Schichtverantwortung, Planung und Leitung sehen ihn. Die Rolle im Feed ist
   die der Person im Bestand (p.rolle); ohne Angabe „mitarbeiter" — gleich
   oder strenger als die Sitzung, die dieselbe Person bekäme.
   pruefungen/kalender-feed-live.test.js hält die Gleichheit mit der Sicht
   (bestandFuerRolle) je Betriebsform, Rolle und Tag fest.
   -------------------------------------------------------------------------- */
/** Wirkt der Entwurfsfilter in diesem Betrieb für diese Rolle? (wie sicht.mjs, entwurfVerbergen) */
export const entwurfVerbergen = (m, rolle) => rolle === "mitarbeiter" && planFreigabeAktiv(m);
/** Hinweis statt leerer Zukunft: ein ganztägiger Termin am ersten verborgenen Tag je Monat. */
export const HINWEIS_ENTWURF = "Plan noch nicht veröffentlicht";

/* Die Kennung steht in einer ICS-Zeile (UID): nur sichere Zeichen. */
const sicher = (s) => String(s).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
const stunden = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * @param {any} m Betrieb (vollständig, aus dem aktuellen Bestand)
 * @param {string|number} personId
 * @param {string} heute Tag JJJJ-MM-TT (Berlin)
 * @param {number} [tage] Vorschau in Tagen
 * @returns {object[]} Termine in der Form von terminFehler (kalender.mjs)
 */
export function feedTermine(m, personId, heute, tage = 180) {
  if (!m || !Array.isArray(m.personen)) return [];
  const p = m.personen.find((x) => x && String(x.id) === String(personId));
  if (!p || p.anonym) return [];
  const daNach = new Map((Array.isArray(m.dienstarten) ? m.dienstarten : []).map((x) => [String(x.id), x]));
  const meineAbw = (Array.isArray(m.abwesenheiten) ? m.abwesenheiten : [])
    .filter((a) => a && String(a.personId) === String(p.id) && typeof a.von === "string" && typeof a.bis === "string");
  const out = [];
  const rolle = typeof p.rolle === "string" ? p.rolle : "mitarbeiter";
  const hinweisMonate = new Set();
  const verbergen = entwurfVerbergen(m, rolle);
  for (let n = 0; n <= tage; n++) {
    const d = tagePlus(heute, n);
    if (!imDienst(p, d)) continue;

    /* Abwesenheit hat Vorrang — sie überschreibt den Dienst. */
    const abw = meineAbw.find((a) => a.von <= d && a.bis >= d);
    if (abw) {
      out.push({ id: sicher(`abw-${p.id}-${d}`), datum: d, bis: tagePlus(d, 1), ganztags: true,
        titel: ABWESENHEIT_OEFFENTLICH[abw.art] || NEUTRAL, text: "" });
      continue;
    }

    /* Entwurf: nichts ausliefern, stattdessen einmal je Monat der Hinweis. */
    if (verbergen && istEntwurfstag(m, d, heute)) {
      const monat = d.slice(0, 7);
      if (!hinweisMonate.has(monat)) {
        hinweisMonate.add(monat);
        out.push({ id: sicher(`entwurf-${p.id}-${monat}`), datum: d, bis: tagePlus(d, 1), ganztags: true, titel: HINWEIS_ENTWURF, text: "" });
      }
      continue;
    }

    const id = dienstAm(m, p, d);
    if (!id || id === "F0") continue;                                  // „F0": wie bisher in der Oberfläche kein Dienst
    const da = daNach.get(String(id));
    if (!da || typeof da.start !== "string" || typeof da.ende !== "string") continue;
    const ueberNacht = da.ende <= da.start;                            // über Mitternacht: Ende am Folgetag
    out.push({
      id: sicher(`d-${p.id}-${d}`), datum: d, von: da.start,
      endDatum: ueberNacht ? tagePlus(d, 1) : d, bisZeit: da.ende, ganztags: false,
      titel: String(da.name || id).slice(0, 200),
      text: `${stunden(dauer(da))} Stunden${da.pause ? ` · ${da.pause} Min Pause` : ""}`,
      ort: String(da.ort || (m.standorte && m.standorte[0] ? m.standorte[0].name : "") || "").slice(0, 200),
    });
  }
  return out;
}

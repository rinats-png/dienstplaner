/* ==========================================================================
   IMP-6 Oberfläche — Pflege mehrerer Schichtmodelle je Person (rein, ohne React)

   Die Oberfläche (src/ansichten/schichtmodelle.jsx) bearbeitet einen Entwurf und übernimmt ihn erst, wenn dieselbe
   Bibliothek wie der Server (server/lib/schichtzuordnung.mjs) nichts einzuwenden hat: Form, Kennungen, Überschneidung,
   unbekanntes oder noch verwendetes Modell, Dienstarten, Rückwirkung (bis heute, abgeschlossene und freigegebene
   Monate) und „Modell verkürzt, Versatz ≥ n“ (422 MODELL_VERKUERZT_VERSATZ). Der Server bleibt maßgeblich; die
   Vorprüfung erspart nur den Umweg über „Nicht gespeichert“.

   Keine Wirkung auf die Planrechnung (P2-4 Punkt 6 offen): Diese Datei rechnet keinen Dienst in den Plan.
   ========================================================================== */
import { schichtzuordnungZusammen, modellKuerzungFehler, anzuwendendesModell, modellVerzeichnis, plusTage,
  BETRIEB_MODELL, ZUORDNUNG_FELD, MODELLE_FELD, SCHICHTMODELL_GRENZEN, MODELL_VERKUERZT_VERSATZ }
  from "../../server/lib/schichtzuordnung.mjs";

import { MATRIX_STD } from "./rollen.js";

/**
 * Darf diese Sitzung Schichtmodelle pflegen? Genau wie der Server (rechte.mjs: feste MATRIX, nie die Betriebsmatrix
 * m.matrix): (org.edit oder pattern.edit) und staff.edit der Rolle, mit der der Server rechnet — beim Zugang der
 * Altrolle „kunde“ diese (alle Rechte außer plan.publish), sonst die Rolle des Zugangs (sitz.zugangRolle = sitzung.rolle
 * des Servers), nur ohne diese Angabe die Rolle der Person. Betriebsrat und Betreiber nie.
 * Review #423 A1: Eine Rolle, der nur die Betriebsmatrix die Rechte gibt, sähe sonst die Pflege, und der Server
 * verwürfe ihre Änderung still (Felder ohne Recht wirkungslos) — nach dem Neuladen wäre sie weg.
 * @param {any} sitz
 */
export function darfSchichtmodelle(sitz) {
  if (!sitz || !sitz.person || sitz.rolle === "betreiber") return false;
  if (sitz.zugangRolle === "kunde") return true;
  /* Delta-Review #423 H-a: die Rolle der Sitzung (Zugang, wie der Server mit sitzung.rolle); nur ohne Angabe die der Person. */
  const rolle = typeof sitz.zugangRolle === "string" && sitz.zugangRolle ? sitz.zugangRolle : sitz.person.rolle;
  if (rolle === "betriebsrat") return false;
  const r = Object.prototype.hasOwnProperty.call(MATRIX_STD, rolle) ? MATRIX_STD[rolle] : [];
  return r.includes("staff.edit") && (r.includes("org.edit") || r.includes("pattern.edit"));
}

export { BETRIEB_MODELL, ZUORDNUNG_FELD, MODELLE_FELD, SCHICHTMODELL_GRENZEN, MODELL_VERKUERZT_VERSATZ, plusTage };

/** Zeichen für einen freien Zyklustag in der Folge. */
export const FREI = "-";

/**
 * Folge aus einem Text lesen: Kennungen durch Leerzeichen, Komma oder Semikolon getrennt; „frei“ und „-“ sind frei.
 * @param {string} text
 * @returns {string[]}
 */
export function folgeLesen(text) {
  return String(text || "").split(/[\s,;]+/).filter(Boolean).map((t) => (t.toLowerCase() === "frei" ? FREI : t));
}

/** Folge als Text (Gegenstück zu folgeLesen). @param {string[]} tage */
export const folgeText = (tage) => (Array.isArray(tage) ? tage.join(" ") : "");

/** Kennungen einer Folge, die keine Dienstart des Betriebs und nicht frei sind (für den Feldfehler). */
export function unbekannteKennungen(tage, dienstarten) {
  const bekannt = new Set((Array.isArray(dienstarten) ? dienstarten : []).map((d) => String(d.id)));
  return [...new Set((tage || []).filter((t) => t !== FREI && !bekannt.has(t)))];
}

/**
 * Zykluslänge als Text: „14 Tage (2 Wochen)“, „9 Tage“, „1 Tag“. Jede Länge von 1 bis zur technischen Grenze ist
 * zulässig — keine feste Zykluslänge (IMP-6 Akzeptanz).
 * @param {number} n
 */
export function zykluslaengeText(n) {
  if (!Number.isInteger(n) || n < 1) return "keine Zyklustage";
  const tage = n === 1 ? "1 Tag" : `${n} Tage`;
  if (n % 7 !== 0) return tage;
  const w = n / 7;
  return `${tage} (${w === 1 ? "1 Woche" : `${w} Wochen`})`;
}

const KENNUNG = /^[A-Za-z0-9_-]{1,40}$/;
/**
 * Eine neue, im Verzeichnis freie Kennung (Buchstaben, Ziffern, - und _; nie „betrieb“).
 * @param {string} praefix
 * @param {Iterable<string>} vorhanden
 * @param {() => number} [zufall] für Prüfungen ersetzbar
 */
export function neueKennung(praefix, vorhanden, zufall = Math.random) {
  const belegt = new Set(vorhanden);
  for (let i = 0; i < 1000; i++) {
    const id = `${praefix}-${Math.floor(zufall() * 36 ** 6).toString(36).padStart(6, "0")}`;
    if (KENNUNG.test(id) && id !== BETRIEB_MODELL && !belegt.has(id)) return id;
  }
  let n = 1;
  while (belegt.has(`${praefix}-${n}`)) n += 1;
  return `${praefix}-${n}`;
}

/** Alle Zuordnungskennungen des Betriebs (eindeutig je Person reicht dem Server; betriebsweit eindeutig ist lesbarer). */
export function alleZuordnungsKennungen(m) {
  const aus = [];
  for (const p of (m && Array.isArray(m.personen) ? m.personen : []))
    for (const z of (p && Array.isArray(p[ZUORDNUNG_FELD]) ? p[ZUORDNUNG_FELD] : [])) if (z && typeof z.id === "string") aus.push(z.id);
  return aus;
}

/** Wer nutzt ein Modell? Personen mit mindestens einer Zuordnung dazu. @returns {any[]} */
export function nutzerDesModells(m, modellId) {
  return (m && Array.isArray(m.personen) ? m.personen : [])
    .filter((p) => p && Array.isArray(p[ZUORDNUNG_FELD]) && p[ZUORDNUNG_FELD].some((z) => z && z.modellId === modellId));
}

/** Dienstarten, die ein Schichtmodell noch nennt (Löschen der Dienstart sperrt der Server, 403 DIENSTART_VERWENDET). */
export function modelleMitDienstart(m, dienstId) {
  return [...modellVerzeichnis(m).values()].filter((x) => x.tage.includes(dienstId));
}

/**
 * Den Entwurf prüfen wie der Server (gleiche Bibliothek, gleiche Reihenfolge): erst schichtzuordnungZusammen
 * (403-Gründe), dann modellKuerzungFehler (422 MODELL_VERKUERZT_VERSATZ). Rückgabe null oder { code, text }.
 * Die Stempel (Wann/Wer) setzt nur der Server; hier wird nichts gestempelt übernommen.
 * @param {any} altM der Betrieb, wie die Oberfläche ihn zuletzt kennt
 * @param {any} neuM der Betrieb mit dem Entwurf
 * @param {string} heute JJJJ-MM-TT (Betriebstag)
 * @returns {null | { code: string, text: string }}
 */
export function entwurfPruefen(altM, neuM, heute) {
  const r = schichtzuordnungZusammen(altM, neuM, { darf: true, person: null, jetzt: "1970-01-01T00:00:00.000Z", heute });
  if (r.grund) return { code: r.code || "ABGEWIESEN", text: r.grund };
  const k = modellKuerzungFehler(r.mandant, altM);
  if (k) return { code: k.code, text: k.grund };
  return null;
}

/** Betrieb mit neuer Modellliste. */
export const mitModellen = (m, liste) => ({ ...m, [MODELLE_FELD]: liste });
/** Betrieb mit neuer Zuordnungsliste einer Person. */
export const mitZuordnungen = (m, personId, liste) => ({ ...m,
  personen: (m.personen || []).map((p) => (p && p.id === personId ? { ...p, [ZUORDNUNG_FELD]: liste } : p)) });

/** Die Modelle des Betriebs (ohne Serverfelder zu verändern). */
export const modelleVon = (m) => (m && Array.isArray(m[MODELLE_FELD]) ? m[MODELLE_FELD] : []);
/** Die gespeicherten Zuordnungen einer Person (ohne implizites Betriebsmodell). */
export const zuordnungenDerPerson = (p) => (p && Array.isArray(p[ZUORDNUNG_FELD]) ? p[ZUORDNUNG_FELD] : []);

/**
 * Was gilt an einem Tag — als Text für die Übersicht. Unterscheidet ausdrücklich „kein Schichtmodell“ (zulässig,
 * Frage 5), „mehrdeutig“ und „ungültig“ (Klärung), nie still das Betriebsmodell.
 * @returns {{ ton: "ok" | "info" | "warn" | "danger", text: string }}
 */
export function lageAm(m, p, datum) {
  const r = anzuwendendesModell(m, p, datum);
  if (r.art === "keine") return { ton: "info", text: "kein Schichtmodell" };
  if (r.art === "mehrdeutig") return { ton: "danger", text: "mehrere Zuordnungen gelten gleichzeitig — bitte klären" };
  if (r.art === "ungueltig") return { ton: "danger", text: r.grund === "versatz"
    ? "Startpunkt passt nicht zur Zykluslänge — bitte klären"
    : r.grund === "modell-unbekannt" ? "Schichtmodell fehlt im Betrieb — bitte klären" : "Zuordnung ist fehlerhaft — bitte klären" };
  if (r.quelle === "betrieb") return { ton: "ok", text: "Schichtfolge des Betriebs" };
  const x = modellVerzeichnis(m).get(r.modellId);
  const n = x ? x.tage.length : 0;
  const ab = Math.round((Date.UTC(+datum.slice(0, 4), +datum.slice(5, 7) - 1, +datum.slice(8, 10))
    - Date.UTC(+String(r.anker).slice(0, 4), +String(r.anker).slice(5, 7) - 1, +String(r.anker).slice(8, 10))) / 86400000);
  const tag = n ? ((((ab + (r.versatz || 0)) % n) + n) % n) + 1 : 0;
  return { ton: "ok", text: `${x ? x.name : r.modellId} — Zyklustag ${tag} von ${n}` };
}

/** Die wirksame Person der Auswahl: die gewählte, solange es sie gibt, sonst die erste der Liste, sonst "" (Review #423 H4). */
export function wirksamePerson(personen, gewaehlt) {
  const l = Array.isArray(personen) ? personen : [];
  return gewaehlt !== null && gewaehlt !== undefined && l.some((p) => p && p.id === gewaehlt) ? gewaehlt : (l.length && l[0] ? l[0].id : "");
}

/** Anzeigename einer Person („Nachname, Vorname“; sonst Name oder Kennung). */
export function personName(p) {
  if (!p) return "";
  const nv = [p.nachname, p.vorname].filter((x) => typeof x === "string" && x.trim());
  return nv.length ? nv.join(", ") : String(p.name || p.id || "");
}

/** Zeitraum einer Zuordnung als Text („ab 2026-12-01“, „2026-12-01 bis 2026-12-31“, „unbefristet“). */
export function zeitraumText(z) {
  if (!z) return "";
  const ab = z.gueltigAb || null, bis = z.gueltigBis || null;
  if (!ab && !bis) return "unbefristet";
  if (ab && !bis) return `ab ${ab}`;
  if (!ab && bis) return `bis ${bis}`;
  return `${ab} bis ${bis}`;
}

/** Liegt eine Zuordnung schon ganz oder teilweise in der Vergangenheit (bis einschließlich heute)? Dann ist sie gesperrt. */
export const zuordnungBegonnen = (z, heute) => !z.gueltigAb || z.gueltigAb <= heute;

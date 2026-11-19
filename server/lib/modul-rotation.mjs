/* ==========================================================================
   MODUL ROTATION — geplanter Wechsel zwischen Einheiten (WP-19, Strang B)

   Nach der Entscheidungsmatrix (vorläufig bis zur Nutzerentscheidung):
     X1 a  Rotation = geplanter Wechsel zwischen organisatorischen Einheiten.
           Schichtrotation bleibt Sache der Schichtmodelle.
     X2 a  Zwei Arten, beide zeitlich nachvollziehbar:
           „einsatz“        befristeter Einsatz in einer anderen Einheit (Plan),
           „zugehoerigkeit“ tatsächliche Änderung der Zugehörigkeit (ab einem Tag).
           Ein Eintrag im Dienstplan ändert die Zugehörigkeit nie: Sie ändert
           sich nur durch einen eigenen Rotationseintrag dieser Art.
     X3 b  Ziele (Pflichtstationen) als Checkliste. Erfüllt heißt: ein
           abgeschlossener Einsatz in der Einheit. Keine Weiterbildungs-
           bescheinigung (die ersetzt diese Liste nicht).

   Betriebsfeld `rotationen` (Personenfeld), Form „Kennung|von“. Art „ziel“
   trägt das Datum der Festlegung in `von`.
   Rein: keine Ablage, keine Uhr (der Stichtag kommt als Argument).
   ========================================================================== */

import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const echterTag = (s) => { if (typeof s !== "string" || !TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
const idOk = (s) => typeof s === "string" && s.length >= 1 && s.length <= 60;

export const ROTATION_ARTEN = Object.freeze(["einsatz", "zugehoerigkeit", "ziel"]);
export const ROTATION_GRENZEN = Object.freeze({ eintraege: 20_000, spanneJahre: 5 });
const FELDER = Object.freeze(["id", "personId", "art", "einheitId", "von", "bis", "pflicht"]);

/** Die Einträge als Liste aus der Form { "Kennung|von": Eintrag }. Keine Form dieser Art → leer. */
export function rotationListe(w) {
  if (!istObjekt(w)) return [];
  return Object.values(w).filter(istObjekt);
}

/**
 * Prüft einen Eintrag. `einheiten` sind die Einheiten des Betriebs.
 * @param {any} e
 * @param {{ einheiten?: any[] }} [o]
 * @returns {string | null}
 */
export function pruefeRotationEintrag(e, { einheiten = [] } = {}) {
  if (!istObjekt(e)) return "Rotation: erwartet wird ein Eintrag.";
  if (Object.keys(e).some((k) => !FELDER.includes(k))) return "Rotation: unbekannte Felder.";
  if (!idOk(e.id)) return "Rotation: Kennung fehlt oder ist zu lang.";
  const wo = `Rotation ${String(e.id).slice(0, 20)}`;
  if (!idOk(e.personId)) return `${wo}: Person fehlt.`;
  if (!ROTATION_ARTEN.includes(e.art)) return `${wo}: Art ist „einsatz“, „zugehoerigkeit“ oder „ziel“.`;
  if (!idOk(e.einheitId) || !einheiten.some((x) => istObjekt(x) && x.id === e.einheitId)) return `${wo}: Einheit unbekannt.`;
  if (!echterTag(e.von)) return `${wo}: Beginn (von) im Format JJJJ-MM-TT.`;
  if (e.art === "ziel") {
    if (e.bis !== undefined && e.bis !== null) return `${wo}: ein Ziel hat kein Ende.`;
    if (e.pflicht !== undefined && typeof e.pflicht !== "boolean") return `${wo}: Pflicht ist ja oder nein.`;
    return null;
  }
  if (e.bis !== undefined && e.bis !== null && (!echterTag(e.bis) || e.bis < e.von)) return `${wo}: Ende (bis) liegt vor dem Beginn oder ist ungültig.`;
  if (e.art === "einsatz" && (e.bis === undefined || e.bis === null)) return `${wo}: ein Einsatz braucht ein Ende.`;
  if (e.pflicht !== undefined) return `${wo}: Pflicht gilt nur für Ziele.`;
  return null;
}

/**
 * Schreibweg (Prüfung): jeder Eintrag geprüft, Schlüssel passen zu Kennung und Beginn.
 * @param {any} neuM
 * @returns {{ grund?: string }}
 */
export function rotationZusammen(neuM) {
  if (!neuM || typeof neuM !== "object" || neuM.rotationen === undefined) return {};
  const w = neuM.rotationen;
  if (!istObjekt(w)) return { grund: "Rotation: erwartet wird { \"Kennung|von\": Eintrag }." };
  const keys = Object.keys(w);
  if (keys.length > ROTATION_GRENZEN.eintraege) return { grund: `Rotation: höchstens ${ROTATION_GRENZEN.eintraege} Einträge.` };
  for (const k of keys) {
    const e = w[k];
    const f = pruefeRotationEintrag(e, { einheiten: neuM.einheiten });
    if (f) return { grund: f };
    if (Array.isArray(neuM.personen) && !neuM.personen.some((p) => istObjekt(p) && String(p.id) === e.personId)) return { grund: "Rotation: die Person gehört nicht zum Betrieb." };
    if (k !== `${e.id}|${e.von}`) return { grund: "Rotation: der Schlüssel passt nicht zu Kennung und Beginn." };
  }
  return {};
}

/** Die Einheit, in der eine Person an einem Tag eingesetzt ist (Einsatz vor Zugehörigkeit), oder null. */
export function einheitAm(w, personId, tag) {
  const liste = rotationListe(w).filter((e) => e.personId === personId && e.art !== "ziel" && e.von <= tag);
  const einsatz = liste.filter((e) => e.art === "einsatz" && e.bis >= tag);
  if (einsatz.length) return einsatz.sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0))[einsatz.length - 1].einheitId;
  const zug = liste.filter((e) => e.art === "zugehoerigkeit" && (e.bis === undefined || e.bis === null || e.bis >= tag));
  return zug.length ? zug.sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0))[zug.length - 1].einheitId : null;
}

/**
 * Überschneidungen: je Person zwei Einsätze, die sich an einem Tag überlappen.
 * @param {any} w
 * @returns {{ personId: string, datum: string, einheiten: string[] }[]}
 */
export function rotationUeberschneidungen(w) {
  const einsaetze = rotationListe(w).filter((e) => e.art === "einsatz");
  const aus = [];
  for (let i = 0; i < einsaetze.length; i++) for (let j = i + 1; j < einsaetze.length; j++) {
    const a = einsaetze[i];
    const b = einsaetze[j];
    if (a.personId !== b.personId) continue;
    const von = a.von > b.von ? a.von : b.von;
    const bis = a.bis < b.bis ? a.bis : b.bis;
    if (von <= bis) aus.push({ personId: a.personId, datum: von, einheiten: [a.einheitId, b.einheitId].sort() });
  }
  return aus.sort((x, y) => (x.personId + x.datum < y.personId + y.datum ? -1 : x.personId + x.datum > y.personId + y.datum ? 1 : 0));
}

/**
 * Hinweise zu Überschneidungen (Regel ROTATION-UEBERSCHNEIDUNG-01). Inaktives Modul → keine.
 * Der Text nennt keine Person, nur Tag und Sachverhalt.
 * @param {any} m
 * @param {{ module?: readonly any[] }} [o]
 * @returns {any[]}
 */
export function rotationBefunde(m, { module = BRANCHENMODULE } = {}) {
  if (!modulAktiv(m, "rotation", module)) return [];
  const regel = REGELN_BRANCHEN.find((r) => r.id === "ROTATION-UEBERSCHNEIDUNG-01");
  if (!regel) throw new Error("ROTATION-UEBERSCHNEIDUNG-01 fehlt im Branchenkatalog.");
  return rotationUeberschneidungen(m.rotationen)
    .map((u) => alsEinteilungsBefund(regel, { zustand: "verletzt", text: `Eine Person ist am ${u.datum} in zwei Einheiten eingesetzt` }))
    .filter(Boolean);
}

/**
 * Checkliste der Ziele einer Person (X3 b). Erfüllt, wenn ein abgeschlossener
 * Einsatz (bis vor dem Stichtag) in der Einheit liegt.
 * @param {any} w
 * @param {string} personId
 * @param {string} heute
 * @returns {{ id: string, einheitId: string, pflicht: boolean, erfuellt: boolean }[]}
 */
export function rotationZiele(w, personId, heute) {
  const einsaetze = rotationListe(w).filter((e) => e.art === "einsatz" && e.personId === personId);
  return rotationListe(w).filter((e) => e.art === "ziel" && e.personId === personId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((z) => ({ id: z.id, einheitId: z.einheitId, pflicht: z.pflicht !== false,
      erfuellt: einsaetze.some((e) => e.einheitId === z.einheitId && e.bis < heute) }));
}

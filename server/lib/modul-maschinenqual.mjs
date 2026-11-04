/* ==========================================================================
   MODUL MASCHINENQUAL — Maschinenqualifikationen (WP-19, Strang C)

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung):
     M1 a  keine neue Struktur: Eine Maschinenqualifikation ist eine
           Kompetenz der Art „geraet", deren betriebsmittelId auf eine
           Anlage zeigt (server/lib/modul-anlagen.mjs). Die Matrix
           Person × Anlage liest die bestehenden Kompetenznachweise.
     M2 a  Wiederholung (Unterweisung) jährlich als Vorgabe der Vorlage,
           vom Betrieb änderbar (§ 12 BetrSichV, § 12 ArbSchG — zu prüfen).
     M3 a  befähigte Person (Prüfungen an Arbeitsmitteln, § 2 Abs. 6
           BetrSichV, TRBS 1203 — zu prüfen) als Merkmal der Kompetenz
           `befaehigtePerson: true`; sie zählt nicht als Bedienung.

   Qualifizierte Besetzung je Anlage ist die vorläufige Registerregel
   MASCHQUAL-BESETZUNG-01 (höchstens Hinweis). Wirkt nur, wenn das Modul
   aktiv ist — und damit auch „anlagen" (Abhängigkeit in der Registry).

   Der Stand einer Kompetenz (kompetenzStand) wird hereingereicht: Er liegt
   heute in src/regelwerk.js und nach WP-22 in server/lib/regelwerk.mjs —
   eine Rechnung, nicht zwei.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";
import { istAnlage, anlagenBedarf } from "./modul-anlagen.mjs";

/** Vorgabe der Wiederholung in Monaten (M2 a, vorläufig). */
export const MASCHQUAL_WIEDERHOLUNG_MONATE = 12;
const REGEL_ID = "MASCHQUAL-BESETZUNG-01";
const RANG = { gueltig: 3, laeuft_ab: 2, abgelaufen: 1, fehlt: 0 };

/** @typedef {(kompetenz: any, nachweis: any, datum: string) => { stand: string, bis?: string|null }} StandFn */

const liste = (w) => (Array.isArray(w) ? w.filter((x) => x && typeof x === "object") : []);

/**
 * Vorlage einer Kompetenz für eine Anlage.
 * @param {any} anlage
 * @param {{ befaehigt?: boolean }} [o]
 */
export function maschinenKompetenzVorlage(anlage, { befaehigt = false } = {}) {
  return { name: `${befaehigt ? "Befähigte Person" : "Bedienung"} ${anlage.name}`, art: "geraet",
    betriebsmittelId: anlage.id, wiederholungMonate: MASCHQUAL_WIEDERHOLUNG_MONATE, befaehigtePerson: befaehigt,
    stufe: "", freigabeStelle: "", grundlage: befaehigt ? "§ 2 Abs. 6 BetrSichV, TRBS 1203 (zu prüfen)" : "§ 12 BetrSichV (zu prüfen)",
    pflichtFuer: [], zugedacht: [] };
}

/**
 * Prüft die Felder, die dieses Modul an einer Kompetenz liest. Liefert den Grund oder null.
 * @param {any} k
 * @returns {string | null}
 */
export function pruefeMaschinenKompetenz(k) {
  if (!k || typeof k !== "object") return null;
  const name = String(k.name || k.id || "Kompetenz").slice(0, 60);
  if (k.befaehigtePerson !== undefined && typeof k.befaehigtePerson !== "boolean")
    return `Kompetenz ${name}: „befähigte Person“ ist Ja oder Nein.`;
  const w = k.wiederholungMonate;
  if (w !== undefined && w !== null && w !== "" && (typeof w !== "number" || !Number.isInteger(w) || w < 1 || w > 120))
    return `Kompetenz ${name}: Wiederholung in ganzen Monaten von 1 bis 120.`;
  return null;
}

/** Bedienungskompetenzen je Anlage (ohne befähigte Person). */
function kompetenzenJeAnlage(m) {
  const anlagen = liste(m && m.betriebsmittel).filter(istAnlage);
  const ids = new Set(anlagen.map((a) => a.id));
  /** @type {Map<any, any[]>} */
  const je = new Map(anlagen.map((a) => [a.id, []]));
  for (const k of liste(m && m.kompetenzen))
    if (k.art === "geraet" && ids.has(k.betriebsmittelId) && k.befaehigtePerson !== true) je.get(k.betriebsmittelId).push(k);
  return { anlagen, je };
}

/** Hat die Rolle die Kompetenznachweise dieser Person bekommen? Beschäftigte und Schichtverantwortung bekommen
    die der anderen nicht (Positivkatalog, RECHTEMATRIX): Dann ist der Stand unbekannt, nie „fehlt". */
const nachweiseBekannt = (p) => !!p && Array.isArray(p.kompetenzNachweise);
const UNBEKANNT = Object.freeze({ stand: "unbekannt", bis: null, kompetenzId: null });

/** Bester Stand einer Person über die Kompetenzen einer Anlage. */
function besterStand(p, kompetenzen, datum, stand) {
  if (!nachweiseBekannt(p)) return { ...UNBEKANNT };
  let best = null;
  for (const k of kompetenzen) {
    const n = liste(p && p.kompetenzNachweise).find((x) => x.kompetenzId === k.id) || null;
    const s = stand(k, n, datum);
    if (!best || (RANG[s.stand] || 0) > (RANG[best.stand] || 0)) best = { stand: s.stand, bis: s.bis || null, kompetenzId: k.id };
  }
  return best;
}

/**
 * Matrix Person × Anlage. Zelle null: für die Anlage ist keine Qualifikation hinterlegt.
 * @param {any} m
 * @param {string} datum
 * @param {StandFn} stand
 */
export function qualifikationsMatrix(m, datum, stand) {
  const { anlagen, je } = kompetenzenJeAnlage(m);
  const personen = liste(m && m.personen).filter((p) => p.status !== "ausgetreten");
  return {
    anlagen: anlagen.map((a) => ({ id: a.id, name: a.name })),
    zeilen: personen.map((p) => ({ personId: p.id, name: `${p.vorname || ""} ${p.nachname || ""}`.trim(),
      zellen: Object.fromEntries(anlagen.map((a) => [a.id, je.get(a.id).length ? besterStand(p, je.get(a.id), datum, stand) : null])) })),
  };
}

/**
 * Merkmale „anlage:<id>" einer Person: gültige (auch bald ablaufende) Bedienungskompetenz.
 * Sind die Kompetenznachweise der Person nicht ausgeliefert, ist die Antwort null (unbekannt).
 * @param {any} m
 * @param {any} p
 * @param {string} datum
 * @param {StandFn} stand
 * @returns {string[] | null}
 */
export function anlagenMerkmale(m, p, datum, stand) {
  if (!nachweiseBekannt(p)) return null;
  const { anlagen, je } = kompetenzenJeAnlage(m);
  const aus = [];
  for (const a of anlagen) {
    const s = besterStand(p, je.get(a.id), datum, stand);
    if (s && (s.stand === "gueltig" || s.stand === "laeuft_ab")) aus.push(`anlage:${a.id}`);
  }
  return aus;
}

/**
 * Befunde zur qualifizierten Besetzung der laufenden Anlagen eines Dienstes.
 * Inaktives Modul → keine Befunde.
 * @param {any} m
 * @param {string} datum
 * @param {string} dienstId
 * @param {any[]} personen die im Dienst Eingeteilten (Personen des Betriebs)
 * @param {{ auswerten: (regel: any, kontext: any) => any, stand: StandFn, module?: readonly any[] }} o
 */
export function maschinenqualBefunde(m, datum, dienstId, personen, { auswerten, stand, module = BRANCHENMODULE }) {
  if (!modulAktiv(m, "maschinenqual", module)) return [];
  if (typeof auswerten !== "function" || typeof stand !== "function")
    throw new Error("maschinenqualBefunde: Auswertung oder Kompetenzstand fehlt.");
  const basis = REGELN_BRANCHEN.find((r) => r.id === REGEL_ID);
  if (!basis) throw new Error(`${REGEL_ID} fehlt im Branchenkatalog.`);
  const { je } = kompetenzenJeAnlage(m);
  const imDienst = liste(personen).map((p) => ({ id: p.id, merkmale: anlagenMerkmale(m, p, datum, stand) }));   // null: unbekannt → „nicht bewertbar"
  const aus = [];
  for (const a of anlagenBedarf(m, datum, dienstId).anlagen) {
    const r = { ...basis, bezeichnung: `Qualifizierte Besetzung ${a.name}`,
      parameter: { anforderungen: [{ art: "anzahlMit", merkmal: `anlage:${a.id}`, min: a.soll }] } };
    let b;
    if (!(je.get(a.id) || []).length)
      b = alsEinteilungsBefund(r, { zustand: "offen", text: `${a.name}: keine Qualifikation hinterlegt — nicht bewertbar` });
    else {
      const erg = auswerten(r, { personen: imDienst, datum });
      const status = erg && (erg.status || erg.zustand);
      b = status === "erfuellt" && a.offen
        ? alsEinteilungsBefund(r, { zustand: "offen", text: `${a.name}: Laufzeit unbekannt — nicht bewertbar` })
        : alsEinteilungsBefund(r, erg);
    }
    if (b) aus.push(b);
  }
  return aus;
}

/**
 * Schreibweg: prüft die Felder dieses Moduls an Kompetenzen, die eine Anlage
 * betreffen oder `befaehigtePerson` tragen. Andere bleiben unberührt. Mit
 * `altM` nur Neues oder Geändertes streng (Review-Auflage 2).
 * @param {any} neuM
 * @param {any} [altM]
 * @returns {{ grund?: string }}
 */
export function maschinenqualZusammen(neuM, altM) {
  const anlagen = new Set(liste(neuM && neuM.betriebsmittel).filter(istAnlage).map((a) => a.id));
  const vorher = new Map(liste(altM && altM.kompetenzen).map((x) => [String(x.id), JSON.stringify(x)]));
  for (const k of liste(neuM && neuM.kompetenzen)) {
    if (vorher.get(String(k.id)) === JSON.stringify(k)) continue;
    if (k.befaehigtePerson === undefined && !anlagen.has(k.betriebsmittelId)) continue;
    const f = pruefeMaschinenKompetenz(k);
    if (f) return { grund: f };
  }
  return {};
}

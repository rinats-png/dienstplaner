/* ==========================================================================
   MODUL ANLAGEN — Anlagenbindung (WP-19, Strang C)

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung):
     A1 a  Eine Anlage ist ein Betriebsmittel der Art „anlage" — kein
           eigener Datensatz. Einweisungen je Gerät (Kompetenzen,
           § 12 BetrSichV) funktionieren damit unverändert.
     A2 a  Laufzeitkalender: Wochenmuster (Montag bis Sonntag) plus
           Ausnahmen je Tag.
     A3 a  Unterbesetzung ist ein Hinweis aus der vorläufigen Registerregel
           ANLAGEN-BESETZUNG-01 (server/lib/branchenkatalog.mjs), nie eine
           Sperre.

   Felder an einem Betriebsmittel der Art „anlage":
     mindestBesetzung  { [dienstartId]: ganze Zahl 0..99 }
     laufzeit          { wochentage: boolean[7] (Mo..So), ausnahmen?: [{ datum, laeuft }] }
   Fehlt die Laufzeit, ist der Betrieb der Anlage „nicht bewertbar": Ihr
   Bedarf zählt mit, der Befund sagt es (nie still „erfüllt").

   Befunde entstehen nur, wenn das Modul im Betrieb aktiv ist (modulAktiv).
   Gerechnet wird mit der Regelart des Baukastens; bis der Baukasten
   serverfähig ist (Andockpunkt A3), reicht der Aufrufer die Auswertung
   herein (`auswerten`).

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

export const ANLAGE_ART = "anlage";
export const ANLAGEN_GRENZEN = Object.freeze({ besetzungMax: 99, ausnahmenMax: 366, dienstartenMax: 50 });
const REGEL_ID = "ANLAGEN-BESETZUNG-01";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** @param {any} bm */
export const istAnlage = (bm) => istObjekt(bm) && bm.art === ANLAGE_ART;

/**
 * Prüft die Anlagenfelder eines Betriebsmittels. Kein Betriebsmittel der Art
 * „anlage" → nichts zu prüfen (null). Sonst der Grund oder null.
 * @param {any} bm
 * @returns {string | null}
 */
export function pruefeAnlage(bm) {
  if (!istAnlage(bm)) return null;
  const name = String(bm.name || bm.id || "Anlage").slice(0, 60);
  if (bm.mindestBesetzung !== undefined && bm.mindestBesetzung !== null) {
    if (!istObjekt(bm.mindestBesetzung)) return `Anlage ${name}: Mindestbesetzung je Dienstart erwartet.`;
    const e = Object.entries(bm.mindestBesetzung);
    if (e.length > ANLAGEN_GRENZEN.dienstartenMax) return `Anlage ${name}: zu viele Dienstarten.`;
    for (const [, n] of e)
      if (!Number.isInteger(n) || n < 0 || n > ANLAGEN_GRENZEN.besetzungMax)
        return `Anlage ${name}: Mindestbesetzung ist eine ganze Zahl von 0 bis ${ANLAGEN_GRENZEN.besetzungMax}.`;
  }
  if (bm.laufzeit !== undefined && bm.laufzeit !== null) {
    const l = bm.laufzeit;
    const form = `Anlage ${name}: Laufzeit erwartet { wochentage: sieben Ja/Nein-Werte, ausnahmen: [{ datum, laeuft }] }.`;
    if (!istObjekt(l) || Object.keys(l).some((k) => k !== "wochentage" && k !== "ausnahmen")) return form;
    if (!Array.isArray(l.wochentage) || l.wochentage.length !== 7 || l.wochentage.some((x) => typeof x !== "boolean")) return form;
    if (l.ausnahmen !== undefined) {
      if (!Array.isArray(l.ausnahmen) || l.ausnahmen.length > ANLAGEN_GRENZEN.ausnahmenMax) return form;
      for (const a of l.ausnahmen)
        if (!istObjekt(a) || typeof a.datum !== "string" || !TAG.test(a.datum) || typeof a.laeuft !== "boolean"
          || Object.keys(a).some((k) => k !== "datum" && k !== "laeuft")) return form;
    }
  }
  return null;
}

/** Wochentag eines Tages, Montag = 0. */
const wochentag = (datum) => (new Date(`${datum}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Läuft die Anlage an diesem Tag? Ohne Laufzeitkalender: nicht bewertbar.
 * @param {any} anlage
 * @param {string} datum JJJJ-MM-TT
 * @returns {{ laeuft: boolean | null, offen: boolean }}
 */
export function anlageLaeuft(anlage, datum) {
  const l = anlage && anlage.laufzeit;
  if (!istObjekt(l) || !Array.isArray(l.wochentage) || l.wochentage.length !== 7) return { laeuft: null, offen: true };
  for (const a of Array.isArray(l.ausnahmen) ? l.ausnahmen : []) if (a && a.datum === datum) return { laeuft: a.laeuft === true, offen: false };
  return { laeuft: l.wochentage[wochentag(datum)] === true, offen: false };
}

/**
 * Bedarf an Personen für eine Dienstart an einem Tag: Summe der
 * Mindestbesetzung der laufenden Anlagen. Anlagen ohne Laufzeit zählen mit
 * und machen das Ergebnis „offen".
 * @param {any} m Betrieb
 * @param {string} datum
 * @param {string} dienstId
 */
export function anlagenBedarf(m, datum, dienstId) {
  const anlagen = [];
  let summe = 0, offen = false;
  for (const a of Array.isArray(m && m.betriebsmittel) ? m.betriebsmittel : []) {
    if (!istAnlage(a) || !istObjekt(a.mindestBesetzung)) continue;
    const soll = Number.isInteger(a.mindestBesetzung[dienstId]) ? a.mindestBesetzung[dienstId] : 0;
    if (soll <= 0) continue;
    const l = anlageLaeuft(a, datum);
    if (l.laeuft === false) continue;
    anlagen.push({ id: a.id, name: a.name, soll, laeuft: l.laeuft, offen: l.offen });
    summe += soll;
    offen = offen || l.offen;
  }
  return { summe, offen, anlagen };
}

/**
 * Die Regelinstanz für einen Bedarf: der Registereintrag mit der
 * Anforderung „mindestens `bedarf` Personen".
 * @param {number} bedarf
 */
export function anlagenRegel(bedarf) {
  const basis = REGELN_BRANCHEN.find((r) => r.id === REGEL_ID);
  if (!basis) throw new Error(`${REGEL_ID} fehlt im Branchenkatalog.`);
  return { ...basis, parameter: { anforderungen: [{ art: "anzahl", min: bedarf }] } };
}

/**
 * Befunde zur Anlagenbesetzung eines Dienstes — in der Form von
 * einteilungsBefunde, Stufe höchstens Hinweis, Befundart „branche".
 * Inaktives Modul → keine Befunde.
 * @param {any} m
 * @param {string} datum
 * @param {string} dienstId
 * @param {{ id: any, merkmale?: string[] }[]} personen die im Dienst Eingeteilten
 * @param {{ auswerten: (regel: any, kontext: any) => any, module?: readonly any[] }} o
 */
export function anlagenBefunde(m, datum, dienstId, personen, { auswerten, module = BRANCHENMODULE }) {
  if (!modulAktiv(m, "anlagen", module)) return [];
  if (typeof auswerten !== "function") throw new Error("anlagenBefunde: Auswertung (Regelbaukasten) fehlt.");
  const bedarf = anlagenBedarf(m, datum, dienstId);
  if (bedarf.summe <= 0) return [];
  const r = anlagenRegel(bedarf.summe);
  const erg = auswerten(r, { personen, datum });
  const status = erg && (erg.status || erg.zustand);
  if (status === "erfuellt" && bedarf.offen) {
    const namen = bedarf.anlagen.filter((a) => a.offen).map((a) => a.name).join(", ");
    const b = alsEinteilungsBefund(r, { zustand: "offen", text: `Laufzeit unbekannt (${namen}) — Anlagenbesetzung nicht bewertbar` });
    return b ? [b] : [];
  }
  const b = alsEinteilungsBefund(r, erg);
  return b ? [b] : [];
}

/**
 * Schreibweg: prüft die Anlagenfelder der übermittelten Betriebsmittel.
 * Andere Betriebsmittel bleiben unberührt. Mit `altM` wird nur Neues oder
 * Geändertes streng geprüft: Ein alter fehlerhafter Eintrag blockiert nicht
 * den ganzen Betrieb (Review-Auflage 2).
 * @param {any} neuM übermittelter Betrieb
 * @param {any} [altM] gespeicherter Betrieb
 * @returns {{ grund?: string }}
 */
export function anlagenZusammen(neuM, altM) {
  const vorher = new Map((Array.isArray(altM && altM.betriebsmittel) ? altM.betriebsmittel : [])
    .filter((x) => x && typeof x === "object").map((x) => [String(x.id), JSON.stringify(x)]));
  for (const bm of Array.isArray(neuM && neuM.betriebsmittel) ? neuM.betriebsmittel : []) {
    if (bm && typeof bm === "object" && vorher.get(String(bm.id)) === JSON.stringify(bm)) continue;
    const f = pruefeAnlage(bm);
    if (f) return { grund: f };
  }
  return {};
}

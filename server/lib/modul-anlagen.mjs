/* ==========================================================================
   MODUL ANLAGEN — Anlagenbindung (WP-19, Strang C; Fertigstellung WP-19.10)

   Nach der Entscheidungsmatrix (WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md):
     A1 a  Eine Anlage ist ein Betriebsmittel der Art „anlage" — kein
           eigener Datensatz. Einweisungen je Gerät (Kompetenzen,
           § 12 BetrSichV) funktionieren damit unverändert.
     A2 a  Laufzeitkalender: Wochenmuster (Montag bis Sonntag) plus
           Ausnahmen je Tag.
     A3 a  Unterbesetzung ist ein Hinweis aus der vorläufigen Registerregel
           ANLAGEN-BESETZUNG-01 (server/lib/branchenkatalog.mjs), nie eine
           Sperre (G4, G5). Die sicherheitsrelevante Mindestbesetzung ist
           eine Vorgabe des Betriebs; ihre Grundlage (Gefährdungsbeurteilung,
           Betriebsanweisung …) lässt sich je Anlage hinterlegen.

   Felder an einem Betriebsmittel der Art „anlage":
     mindestBesetzung  { [dienstartId]: ganze Zahl 0..99 }
     laufzeit          { wochentage: boolean[7] (Mo..So), ausnahmen?: [{ datum, laeuft }] }
     grundlage         { art, bezug (1..120 Zeichen), datum? } — Herkunft der Mindestbesetzung
   Fehlt die Laufzeit, ist der Betrieb der Anlage „nicht bewertbar": Ihr
   Bedarf zählt mit, der Befund sagt es (nie still „erfüllt").

   WP-19.10:
     - Grundlage der Mindestbesetzung (A3): streng geprüft, im Hinweis genannt;
       ohne Grundlage steht dort „Vorgabe des Betriebs, Grundlage nicht
       hinterlegt". Nichts davon behauptet, die Besetzung sei gesetzlich
       vorgeschrieben (Fachnachweis FN-11).
     - Laufzeitkalender (A2): echte Kalendertage, keine doppelten Ausnahmen,
       reine Pflegefunktionen (Wochenmuster, Ausnahme setzen/entfernen,
       Monatsansicht) — die Oberfläche rechnet nicht selbst.
     - Formfehler beim Schreiben melden Status 422 (Form), Rechtefehler 403.

   Befunde entstehen nur, wenn das Modul im Betrieb aktiv ist (modulAktiv).
   Gerechnet wird mit der Regelart des Baukastens; bis der Baukasten
   serverfähig ist (Andockpunkt A3), reicht der Aufrufer die Auswertung
   herein (`auswerten`).

   Datenschutz: Anlagen tragen keine Personendaten (`personId` bleibt leer).
   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

export const ANLAGE_ART = "anlage";
export const ANLAGEN_GRENZEN = Object.freeze({ besetzungMax: 99, ausnahmenMax: 366, dienstartenMax: 50, bezugMax: 120 });
/** Arten der Grundlage einer Mindestbesetzung (A3). */
export const ANLAGEN_GRUNDLAGE_ARTEN = Object.freeze(["gefaehrdungsbeurteilung", "betriebsanweisung", "betriebsvereinbarung", "sonstige"]);
const GRUNDLAGE_WORT = { gefaehrdungsbeurteilung: "Gefährdungsbeurteilung", betriebsanweisung: "Betriebsanweisung",
  betriebsvereinbarung: "Betriebsvereinbarung", sonstige: "Sonstige Grundlage" };
const REGEL_ID = "ANLAGEN-BESETZUNG-01";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
/** Ist es ein echter Kalendertag (nicht nur die Form JJJJ-MM-TT)? */
const echterTag = (s) => {
  if (typeof s !== "string" || !TAG.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const datumKurz = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** @param {any} bm */
export const istAnlage = (bm) => istObjekt(bm) && bm.art === ANLAGE_ART;

const grundlageGueltig = (g) => istObjekt(g) && ANLAGEN_GRUNDLAGE_ARTEN.includes(g.art)
  && typeof g.bezug === "string" && g.bezug.trim() !== "";

/**
 * Die Grundlage in Worten, sonst null.
 * @param {any} g
 * @returns {string | null}
 */
export function grundlageText(g) {
  if (!grundlageGueltig(g)) return null;
  return `${GRUNDLAGE_WORT[g.art]} „${g.bezug.trim()}“${echterTag(g.datum) ? ` vom ${datumKurz(g.datum)}` : ""}`;
}

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
  if (bm.grundlage !== undefined && bm.grundlage !== null) {
    const g = bm.grundlage;
    const gf = `Anlage ${name}: Grundlage erwartet { art, bezug (1 bis ${ANLAGEN_GRENZEN.bezugMax} Zeichen), datum? }.`;
    if (!istObjekt(g) || Object.keys(g).some((k) => !["art", "bezug", "datum"].includes(k))) return gf;
    if (!ANLAGEN_GRUNDLAGE_ARTEN.includes(g.art))
      return `Anlage ${name}: Grundlage — Art unbekannt (erlaubt: ${ANLAGEN_GRUNDLAGE_ARTEN.join(", ")}).`;
    if (typeof g.bezug !== "string" || !g.bezug.trim() || g.bezug.length > ANLAGEN_GRENZEN.bezugMax) return gf;
    if (g.datum !== undefined && g.datum !== null && !echterTag(g.datum))
      return `Anlage ${name}: Grundlage — Datum ist kein Kalendertag (JJJJ-MM-TT).`;
  }
  if (bm.laufzeit !== undefined && bm.laufzeit !== null) {
    const l = bm.laufzeit;
    const form = `Anlage ${name}: Laufzeit erwartet { wochentage: sieben Ja/Nein-Werte, ausnahmen: [{ datum, laeuft }] }.`;
    if (!istObjekt(l) || Object.keys(l).some((k) => k !== "wochentage" && k !== "ausnahmen")) return form;
    if (!Array.isArray(l.wochentage) || l.wochentage.length !== 7 || l.wochentage.some((x) => typeof x !== "boolean")) return form;
    if (l.ausnahmen !== undefined) {
      if (!Array.isArray(l.ausnahmen) || l.ausnahmen.length > ANLAGEN_GRENZEN.ausnahmenMax) return form;
      const gesehen = new Set();
      for (const a of l.ausnahmen) {
        if (!istObjekt(a) || !echterTag(a.datum) || typeof a.laeuft !== "boolean"
          || Object.keys(a).some((k) => k !== "datum" && k !== "laeuft")) return form;
        if (gesehen.has(a.datum)) return `Anlage ${name}: Ausnahme für ${datumKurz(a.datum)} doppelt.`;
        gesehen.add(a.datum);
      }
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
    anlagen.push({ id: a.id, name: a.name, soll, laeuft: l.laeuft, offen: l.offen, grundlage: grundlageGueltig(a.grundlage) ? a.grundlage : null });
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

/** Der Satz zur Grundlage im Hinweis: Was hinterlegt ist, und wo nichts. */
function grundlageSatz(anlagen) {
  const mit = anlagen.filter((a) => a.grundlage), ohne = anlagen.filter((a) => !a.grundlage);
  if (!mit.length) return "Vorgabe des Betriebs, Grundlage nicht hinterlegt";
  const teil = mit.map((a) => `${a.name}: ${grundlageText(a.grundlage)}`).join("; ");
  return ohne.length
    ? `Grundlage ${teil}; ${ohne.map((a) => `${a.name}: Grundlage nicht hinterlegt`).join("; ")}`
    : `Grundlage ${teil}`;
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
  const satz = grundlageSatz(bedarf.anlagen);
  const b = alsEinteilungsBefund(r, erg && typeof erg === "object"
    ? { ...erg, text: `${String(erg.text || r.bezeichnung || "").slice(0, 130)} — ${satz}` } : erg);
  return b ? [b] : [];
}

/**
 * Schreibweg: prüft die Anlagenfelder der übermittelten Betriebsmittel.
 * Andere Betriebsmittel bleiben unberührt. Mit `altM` wird nur Neues oder
 * Geändertes streng geprüft: Ein alter fehlerhafter Eintrag blockiert nicht
 * den ganzen Betrieb (Review-Auflage 2). Ein Formfehler meldet Status 422.
 * @param {any} neuM übermittelter Betrieb
 * @param {any} [altM] gespeicherter Betrieb
 * @returns {{ grund?: string, status?: number }}
 */
export function anlagenZusammen(neuM, altM) {
  const vorher = new Map((Array.isArray(altM && altM.betriebsmittel) ? altM.betriebsmittel : [])
    .filter((x) => x && typeof x === "object").map((x) => [String(x.id), JSON.stringify(x)]));
  for (const bm of Array.isArray(neuM && neuM.betriebsmittel) ? neuM.betriebsmittel : []) {
    if (bm && typeof bm === "object" && vorher.get(String(bm.id)) === JSON.stringify(bm)) continue;
    const f = pruefeAnlage(bm);
    if (f) return { grund: f, status: 422 };
  }
  return {};
}

/* ---------------------------------------------------------------------------
   Pflegefunktionen für den Laufzeitkalender (A2) — rein, ohne Nebenwirkung
   --------------------------------------------------------------------------- */

const MONAT = /^(\d{4})-(0[1-9]|1[0-2])$/;
const tagePlus = (datum, n) => new Date(Date.parse(`${datum}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Jeder Tag eines Monats mit Wochentag (Montag = 0), Laufstatus und dem
 * Kennzeichen, ob eine Ausnahme gilt. Ohne Laufzeit: nicht bewertbar.
 * @param {any} anlage
 * @param {string} monat JJJJ-MM
 */
export function laufzeitMonat(anlage, monat) {
  const t = MONAT.exec(String(monat));
  if (!t) throw new Error(`Monat ${String(monat).slice(0, 12)} ist kein JJJJ-MM.`);
  const anzahl = new Date(Date.UTC(Number(t[1]), Number(t[2]), 0)).getUTCDate();
  const ausnahmen = new Set((anlage && anlage.laufzeit && Array.isArray(anlage.laufzeit.ausnahmen) ? anlage.laufzeit.ausnahmen : [])
    .filter(istObjekt).map((a) => a.datum));
  const tage = [];
  for (let i = 1; i <= anzahl; i++) {
    const datum = `${monat}-${String(i).padStart(2, "0")}`;
    const l = anlageLaeuft(anlage, datum);
    tage.push({ datum, wochentag: wochentag(datum), laeuft: l.laeuft, offen: l.offen, ausnahme: ausnahmen.has(datum) });
  }
  return { monat, tage };
}

/** Prüft die Anlage nach einer Änderung und liefert sie oder den Grund. */
const geprueft = (anlage) => { const f = pruefeAnlage(anlage); return f ? { grund: f } : { anlage }; };

/**
 * Setzt das Wochenmuster (Mo..So); vorhandene Ausnahmen bleiben.
 * @param {any} anlage
 * @param {boolean[]} wochentage
 * @returns {{ anlage: any, grund?: undefined } | { grund: string, anlage?: undefined }}
 */
export function wochenmusterSetzen(anlage, wochentage) {
  if (!Array.isArray(wochentage) || wochentage.length !== 7 || wochentage.some((x) => typeof x !== "boolean"))
    return { grund: "Das Wochenmuster hat sieben Ja/Nein-Werte, Montag bis Sonntag." };
  const ausnahmen = anlage && anlage.laufzeit && Array.isArray(anlage.laufzeit.ausnahmen) ? anlage.laufzeit.ausnahmen : undefined;
  return geprueft({ ...anlage, laufzeit: { wochentage: [...wochentage], ...(ausnahmen ? { ausnahmen: ausnahmen.map((a) => ({ ...a })) } : {}) } });
}

/**
 * Setzt die Ausnahme für einen Tag (ersetzt eine vorhandene), sortiert nach Datum.
 * @param {any} anlage
 * @param {string} datum
 * @param {boolean} laeuft
 * @returns {{ anlage: any, grund?: undefined } | { grund: string, anlage?: undefined }}
 */
export function ausnahmeSetzen(anlage, datum, laeuft) {
  if (!echterTag(datum)) return { grund: "Das Datum der Ausnahme ist kein Kalendertag (JJJJ-MM-TT)." };
  if (typeof laeuft !== "boolean") return { grund: "Die Ausnahme sagt „läuft“ oder „läuft nicht“." };
  const l = anlage && anlage.laufzeit;
  if (!istObjekt(l) || !Array.isArray(l.wochentage)) return { grund: "Lege zuerst das Wochenmuster fest, dann die Ausnahmen." };
  const rest = (Array.isArray(l.ausnahmen) ? l.ausnahmen : []).filter((a) => a.datum !== datum);
  if (rest.length + 1 > ANLAGEN_GRENZEN.ausnahmenMax)
    return { grund: `Zu viele Ausnahmen (höchstens ${ANLAGEN_GRENZEN.ausnahmenMax}). Entferne alte Ausnahmen.` };
  const ausnahmen = [...rest, { datum, laeuft }].sort((a, b) => (a.datum < b.datum ? -1 : 1));
  return geprueft({ ...anlage, laufzeit: { ...l, ausnahmen } });
}

/** Entfernt die Ausnahme eines Tages; gibt es keine, kommt die Anlage unverändert zurück. */
export function ausnahmeEntfernen(anlage, datum) {
  const l = anlage && anlage.laufzeit;
  if (!istObjekt(l) || !Array.isArray(l.ausnahmen) || !l.ausnahmen.some((a) => a.datum === datum)) return anlage;
  return { ...anlage, laufzeit: { ...l, ausnahmen: l.ausnahmen.filter((a) => a.datum !== datum) } };
}

/**
 * Entfernt Ausnahmen, die länger als `tage` Tage vor `heute` zurückliegen —
 * eine ausdrückliche Aktion der Planung, nie automatisch. Anlagen tragen
 * keine Personendaten; alte Ausnahmen belegen nur Platz (Grenze 366).
 * @param {any} anlage
 * @param {string} heute
 * @param {number} [tage]
 * @returns {{ anlage: any, entfernt: number }}
 */
export function ausnahmenBereinigen(anlage, heute, tage = 366) {
  const l = anlage && anlage.laufzeit;
  if (!istObjekt(l) || !Array.isArray(l.ausnahmen)) return { anlage, entfernt: 0 };
  const grenze = tagePlus(heute, -tage);
  const behalten = l.ausnahmen.filter((a) => a.datum >= grenze);
  const entfernt = l.ausnahmen.length - behalten.length;
  return entfernt ? { anlage: { ...anlage, laufzeit: { ...l, ausnahmen: behalten } }, entfernt } : { anlage, entfernt: 0 };
}

/**
 * Was an den Anlagen eines Betriebs noch fehlt — Hinweise für die Pflege, keine Sperre.
 * @param {any} m
 * @returns {{ anlageId: any, name: string, art: "laufzeit-fehlt" | "grundlage-fehlt" | "bedarf-leer" | "dienstart-unbekannt", text: string }[]}
 */
export function anlagenProbleme(m) {
  const aus = [];
  const ids = new Set((Array.isArray(m && m.dienstarten) ? m.dienstarten : []).map((d) => d && d.id));
  for (const a of Array.isArray(m && m.betriebsmittel) ? m.betriebsmittel : []) {
    if (!istAnlage(a)) continue;
    const name = String(a.name || a.id);
    const p = (art, text) => aus.push({ anlageId: a.id, name, art, text: `${name}: ${text}` });
    if (!istObjekt(a.laufzeit)) p("laufzeit-fehlt", "Laufzeit nicht hinterlegt — nicht bewertbar");
    const e = Object.entries(istObjekt(a.mindestBesetzung) ? a.mindestBesetzung : {});
    if (!e.some(([, n]) => n > 0)) p("bedarf-leer", "keine Mindestbesetzung hinterlegt");
    if (!grundlageGueltig(a.grundlage)) p("grundlage-fehlt", "Grundlage der Mindestbesetzung nicht hinterlegt");
    if (ids.size && e.some(([d, n]) => n > 0 && !ids.has(d))) p("dienstart-unbekannt", "Mindestbesetzung für eine Dienstart, die es nicht gibt");
  }
  return aus;
}

/**
 * Wie die Regel zustande kommt — für die Oberfläche („Herkunft“), ohne Behauptung.
 * Aus dem Branchenkatalog; der Fachnachweis steht in docs/acc45/WP19-OFFENE-FACHNACHWEISE.md.
 */
export function anlagenAuskunft() {
  const r = REGELN_BRANCHEN.find((x) => x.id === REGEL_ID);
  if (!r) throw new Error(`${REGEL_ID} fehlt im Branchenkatalog.`);
  return { regelId: r.id, bezeichnung: r.bezeichnung, pruefstatus: r.pruefstatus, hoechsteStufe: r.hoechsteStufe,
    quelle: "Vorgabe des Betriebs (keine Rechtsvorschrift mit festen Zahlen)",
    fundstelle: "je Anlage im Feld Grundlage (etwa Gefährdungsbeurteilung nach § 5 ArbSchG, Betriebsanweisung)",
    version: r.regelstand || "vorläufig, ohne Regelstand", fachnachweis: "FN-11",
    hinweis: "Hinweis, keine Sperre. Ob die Mindestbesetzung sicherheitsrelevant ist, entscheidet die Gefährdungsbeurteilung des Betriebs." };
}

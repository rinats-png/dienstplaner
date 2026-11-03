/* ==========================================================================
   MODULOBERFLÄCHEN — die eine Liste der Einhängepunkte (WP-19.0)

   Jede Oberfläche eines Branchenmoduls steht hier genau einmal: Modul, Ort,
   Titel und eine Funktion, die aus dem Kontext des Orts das Element baut.
   App.jsx liest die Liste an genau einer Stelle (Komponente BranchenModule
   aus ./kern.jsx); ein neues Modul trägt sich hier ein und ändert App.jsx
   nicht mehr.

   Orte und was der Kontext dort enthält (kern.jsx baut ihn):
     betrieb    { m, heute, darf }
     tag        dazu { datum, dienstId, einheitId, personenImDienst: Person[] }
     dienstart  dazu { da } — je Dienstart des Betriebs

   Gezeigt wird eine Oberfläche nur, wenn ihr Modul im Betrieb wirkt
   (modulAktiv: gebucht, nicht „geplant", eingeschaltet, ggf. bestätigt) —
   oder, nach dem Abschalten (G3), nur lesend für Rollen mit export.data,
   solange Daten des Moduls vorhanden sind. Rechte prüft der Server; diese
   Liste entscheidet nur, was angezeigt wird.

   Kein JSX in dieser Datei (createElement), damit sie überall lesbar ist.
   ========================================================================== */
import { createElement as h } from "react";
import { BRANCHENMODULE, modulVon, modulAktiv, modulNurLesen, modulParameter } from "../../server/lib/branchenmodule.mjs";
import { kompetenzStand } from "../../server/lib/regelwerk.mjs";
import { PostenUebersicht } from "./posten.jsx";
import { BereichsUebersicht } from "./bereichsplan.jsx";
import { AbschnittsAnzeige } from "./geteilterdienst.jsx";
import { AnlagenUebersicht } from "./anlagen.jsx";
import { QualifikationsMatrix } from "./maschinenqual.jsx";
import { KontiAssistent } from "./kontimodelle.jsx";

export const EINHAENGEORTE = Object.freeze(["betrieb", "tag", "dienstart"]);

/**
 * @typedef {{ modul: string, ort: "betrieb" | "tag" | "dienstart", titel: string, ansicht: (k: any) => any }} ModulOberflaeche
 */

const dienstzeiten = (m) => Object.fromEntries((Array.isArray(m && m.dienstarten) ? m.dienstarten : [])
  .filter((d) => d && d.id && d.start && d.ende).map((d) => [d.id, { start: d.start, ende: d.ende }]));

/** @type {readonly ModulOberflaeche[]} */
export const MODUL_OBERFLAECHEN = Object.freeze([
  { modul: "posten", ort: "tag", titel: "Posten je Objekt",
    ansicht: (k) => h(PostenUebersicht, { m: k.m, datum: k.datum, dienstId: k.dienstId, personenImDienst: k.personenImDienst }) },
  { modul: "bereichsplan", ort: "tag", titel: "Bereiche",
    ansicht: (k) => h(BereichsUebersicht, { m: k.m, einheitId: k.einheitId, datum: k.datum, dienstId: k.dienstId, personenImDienst: k.personenImDienst }) },
  { modul: "anlagen", ort: "tag", titel: "Anlagen",
    ansicht: (k) => h(AnlagenUebersicht, { m: k.m, datum: k.datum }) },
  { modul: "geteilterdienst", ort: "dienstart", titel: "Abschnitte des geteilten Dienstes",
    ansicht: (k) => h(AbschnittsAnzeige, { da: k.da }) },
  { modul: "maschinenqual", ort: "betrieb", titel: "Qualifikationen je Anlage",
    ansicht: (k) => h(QualifikationsMatrix, { m: k.m, datum: k.heute, stand: kompetenzStand }) },
  /* Ohne onUebernehmen: der Assistent rechnet nur. Übernehmen (pattern.edit) hängt WP-19.12 ein. */
  { modul: "kontimodelle", ort: "betrieb", titel: "Kontischicht-Assistent",
    ansicht: (k) => {
      const p = modulParameter(k.m, "kontimodelle");
      return h(KontiAssistent, { dienstarten: dienstzeiten(k.m), sollWochenstunden: p.sollWochenstunden, stundenJeFreischicht: p.stundenJeFreischicht });
    } },
]);

/**
 * Vertrag der Liste. Leere Liste heißt: stimmig.
 * @param {readonly any[]} [liste]
 * @param {readonly any[]} [module]
 * @returns {string[]}
 */
export function pruefeOberflaechen(liste = MODUL_OBERFLAECHEN, module = BRANCHENMODULE) {
  const m = [];
  const gesehen = new Set();
  for (const x of liste) {
    const wo = x && x.modul ? x.modul : "(ohne Modul)";
    if (!x || !modulVon(x.modul, module)) { m.push(`${wo}: Modul unbekannt`); continue; }
    if (!EINHAENGEORTE.includes(x.ort)) m.push(`${wo}: Ort „${x.ort}" unbekannt`);
    if (typeof x.titel !== "string" || !x.titel) m.push(`${wo}: Titel fehlt`);
    if (typeof x.ansicht !== "function") m.push(`${wo}: ansicht fehlt`);
    const k = `${x.modul}|${x.ort}`;
    if (gesehen.has(k)) m.push(`${wo}: doppelt am Ort ${x.ort}`);
    gesehen.add(k);
  }
  return m;
}

const leer = (w) => w === undefined || w === null || (Array.isArray(w) ? !w.length : typeof w === "object" ? !Object.keys(w).length : false);

/** Hat der Betrieb Daten in den Datenfeldern des Moduls? */
export function hatModuldaten(m, id, liste = BRANCHENMODULE) {
  const mod = modulVon(id, liste);
  return !!mod && !!m && mod.datenfelder.some((f) => !leer(m[f]));
}

/**
 * Die Oberflächen an einem Ort für diesen Betrieb, mit Modus "aktiv" oder
 * "nurLesen" (G3: ausgeschaltet, Daten vorhanden, Recht export.data).
 * @param {any} m
 * @param {string} ort
 * @param {{ darf?: (recht: string) => boolean, liste?: readonly any[], oberflaechen?: readonly ModulOberflaeche[] }} [o]
 * @returns {{ eintrag: ModulOberflaeche, modus: "aktiv" | "nurLesen" }[]}
 */
export function oberflaechenFuer(m, ort, { darf = () => false, liste = BRANCHENMODULE, oberflaechen = MODUL_OBERFLAECHEN } = {}) {
  /** @type {{ eintrag: ModulOberflaeche, modus: "aktiv" | "nurLesen" }[]} */
  const aus = [];
  for (const e of oberflaechen) {
    if (e.ort !== ort) continue;
    if (modulAktiv(m, e.modul, liste)) aus.push({ eintrag: e, modus: "aktiv" });
    else if (modulNurLesen(m, e.modul, liste) && darf("export.data") && hatModuldaten(m, e.modul, liste))
      aus.push({ eintrag: e, modus: "nurLesen" });
  }
  return aus;
}

/**
 * Export der Moduldaten (G3: Einsicht und Export bleiben nach dem Abschalten):
 * genau die Datenfelder des Moduls aus dem, was die Rolle ohnehin hat.
 * @param {any} m
 * @param {string} id
 * @param {readonly any[]} [liste]
 */
export function moduldatenExport(m, id, liste = BRANCHENMODULE) {
  const mod = modulVon(id, liste);
  if (!mod || !m) return null;
  return { format: "centric-moduldaten", modul: mod.id, name: mod.name, betrieb: m.id,
    daten: Object.fromEntries(mod.datenfelder.filter((f) => !leer(m[f])).map((f) => [f, m[f]])) };
}

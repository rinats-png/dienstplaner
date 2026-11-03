/* ==========================================================================
   REGELWERTE DER INDUSTRIEMODULE (WP-19.11, 19.12) — Adapter bis WP-19.0

   Vier Werte der Industriemodule sind keine Konstanten des Programms, sondern
   Angaben des Betriebs mit Herkunft (Grundsatz 3, G4):

     MASCHQUAL-INTERVALL-01   Unterweisungsintervall in Monaten (M2).
                              Ausgangswert 12 — „fachlich zu prüfen“ (FN-26).
     KONTI-RICHTWERT-SERIE-01 Richtwert: Dienste am Stück (K1). Ausgangswert 5 —
                              „ungeprüft“ (FN-28).
     KONTI-RICHTWERT-NACHT-01 Richtwert: Nachtdienste am Stück (K1). Ausgangswert 3 —
                              „ungeprüft“ (FN-28).
     KONTI-ARBEITSZEIT-01     Sollwochenarbeitszeit aus Arbeitsvertrag, Tarif oder
                              Betriebsvereinbarung (K2). KEIN Ausgangswert (FN-29).
     KONTI-FREISCHICHT-01     Stunden je Freischicht (K2). KEIN Ausgangswert (FN-29).

   Gespeichert werden sie unter `einstellungen.regelwerte[regelId]` in der Form,
   die der Modulplan (Abschnitt 13) für den Kern vorsieht:
     { wert, quelle, fundstelle, version, gueltigAb, gueltigBis, pruefstatus,
       geprueftVon, geprueftAm, geaendertAm, geaendertVon }
   Diese Datei liest und schreibt NUR die fünf Kennungen oben; alle anderen
   Einträge von `einstellungen.regelwerte` gehören dem Kern (WP-19.0) und gehen
   unberührt durch. Sobald der Kern den Mechanismus liefert, ersetzt er die
   Rechenfunktionen hier, nicht die Daten.

   Prüfstatus:
     provisional  Angabe des Betriebs (oder Ausgangswert), nicht geprüft.
                  Wirkt höchstens als Hinweis.
     geprueft     Der Betrieb hat die Quelle geprüft und sie mit Fundstelle
                  angegeben. Der Server setzt Wer und Wann. „geprueft“ heißt
                  „vom Betrieb belegt“, nicht „rechtlich bestätigt“.

   Schreiben darf nur, wer org.edit hat; für alle anderen bleibt der
   gespeicherte Stand. Formfehler melden 422.

   Rein, außer dem Datum beim Schreiben.
   ========================================================================== */

/**
 * @typedef {{
 *   id: string, modul: string, bezeichnung: string, einheit: string,
 *   min: number, max: number, ganzzahl: boolean, ausgangswert: number | null,
 *   ausgangswertText: string, fachnachweis: string,
 * }} RegelwertDef
 */

const def = (e) => Object.freeze(e);

/** @type {Readonly<Record<string, RegelwertDef>>} */
export const INDUSTRIE_REGELWERTE = Object.freeze({
  "MASCHQUAL-INTERVALL-01": def({ id: "MASCHQUAL-INTERVALL-01", modul: "maschinenqual", bezeichnung: "Unterweisungsintervall",
    einheit: "Monate", min: 1, max: 120, ganzzahl: true, ausgangswert: 12,
    ausgangswertText: "Ausgangswert, fachlich zu prüfen: ob und welche Frist gilt, hängt von Tätigkeit, Gefährdungsbeurteilung und Personengruppe ab", fachnachweis: "FN-26" }),
  "KONTI-RICHTWERT-SERIE-01": def({ id: "KONTI-RICHTWERT-SERIE-01", modul: "kontimodelle", bezeichnung: "Richtwert Dienste am Stück",
    einheit: "Dienste", min: 1, max: 30, ganzzahl: true, ausgangswert: 5,
    ausgangswertText: "ungeprüfter Richtwert, keine Rechtsvorschrift", fachnachweis: "FN-28" }),
  "KONTI-RICHTWERT-NACHT-01": def({ id: "KONTI-RICHTWERT-NACHT-01", modul: "kontimodelle", bezeichnung: "Richtwert Nachtdienste am Stück",
    einheit: "Nachtdienste", min: 1, max: 30, ganzzahl: true, ausgangswert: 3,
    ausgangswertText: "ungeprüfter Richtwert, keine Rechtsvorschrift", fachnachweis: "FN-28" }),
  "KONTI-ARBEITSZEIT-01": def({ id: "KONTI-ARBEITSZEIT-01", modul: "kontimodelle", bezeichnung: "Sollwochenarbeitszeit",
    einheit: "Stunden je Woche", min: 1, max: 60, ganzzahl: false, ausgangswert: null,
    ausgangswertText: "kein Ausgangswert: Der Betrieb trägt die Zeit aus seinem Arbeitszeit- oder Tarifmodell ein", fachnachweis: "FN-29" }),
  "KONTI-FREISCHICHT-01": def({ id: "KONTI-FREISCHICHT-01", modul: "kontimodelle", bezeichnung: "Stunden je Freischicht",
    einheit: "Stunden", min: 1, max: 24, ganzzahl: false, ausgangswert: null,
    ausgangswertText: "kein Ausgangswert: Der Betrieb trägt die Dauer aus seinem Freischichtmodell ein", fachnachweis: "FN-29" }),
});

export const REGELWERT_PRUEFSTATUS = Object.freeze(["provisional", "geprueft"]);
const FELDER_BETRIEB = ["wert", "quelle", "fundstelle", "version", "gueltigAb", "gueltigBis", "pruefstatus"];
const FELDER_SERVER = ["geprueftVon", "geprueftAm", "geaendertAm", "geaendertVon"];
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const LAENGEN = { quelle: 200, fundstelle: 120, version: 40 };

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const echterTag = (s) => {
  if (typeof s !== "string" || !TAG.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const heuteTag = () => new Date().toISOString().slice(0, 10);

/**
 * Die Definition zu einer Kennung, sonst null.
 * @param {string} id
 * @returns {RegelwertDef | null}
 */
export const regelwertDef = (id) => (hat(INDUSTRIE_REGELWERTE, id) ? INDUSTRIE_REGELWERTE[id] : null);

/** Gehört die Kennung zu den Industriemodulen (auch wenn sie unbekannt ist)? */
const MEINE_PRAEFIXE = ["MASCHQUAL-", "KONTI-", "ANLAGEN-"];
const istMeine = (id) => hat(INDUSTRIE_REGELWERTE, id) || MEINE_PRAEFIXE.some((p) => String(id).startsWith(p));

/**
 * Der gespeicherte Eintrag zu einer Kennung, sonst null (ohne Prüfung der Werte).
 * @param {any} m Betrieb
 * @param {string} id
 */
export function regelwertEintrag(m, id) {
  const r = m && istObjekt(m.einstellungen) && istObjekt(m.einstellungen.regelwerte) ? m.einstellungen.regelwerte : null;
  return r && hat(r, id) && istObjekt(r[id]) ? r[id] : null;
}

/**
 * Prüft einen Eintrag (so, wie der Betrieb ihn sendet). Liefert den Grund oder null.
 * @param {string} id
 * @param {any} e
 * @returns {string | null}
 */
export function pruefeRegelwert(id, e) {
  const d = regelwertDef(id);
  if (!d) return `Regelwert „${String(id).slice(0, 40)}“ ist unbekannt.`;
  const wo = `Regelwert ${d.bezeichnung}`;
  if (!istObjekt(e)) return `${wo}: erwartet { wert, quelle, fundstelle, version, gueltigAb, gueltigBis, pruefstatus }.`;
  if (Object.keys(e).some((k) => ![...FELDER_BETRIEB, ...FELDER_SERVER].includes(k))) return `${wo}: unbekanntes Feld.`;
  const w = e.wert;
  if (typeof w !== "number" || !Number.isFinite(w)) return `${wo}: der Wert ist eine Zahl (${d.einheit}).`;
  if (w < d.min || w > d.max) return `${wo}: der Wert liegt zwischen ${d.min} und ${d.max} (${d.einheit}).`;
  if (d.ganzzahl && !Number.isInteger(w)) return `${wo}: der Wert ist eine ganze Zahl (${d.einheit}).`;
  for (const [k, max] of Object.entries(LAENGEN)) {
    if (e[k] === undefined || e[k] === null) continue;
    if (typeof e[k] !== "string" || e[k].length > max) return `${wo}: ${k} ist Text bis ${max} Zeichen.`;
  }
  for (const k of ["gueltigAb", "gueltigBis"])
    if (e[k] !== undefined && e[k] !== null && !echterTag(e[k])) return `${wo}: ${k} ist kein Kalendertag (JJJJ-MM-TT).`;
  if (e.gueltigAb && e.gueltigBis && e.gueltigBis < e.gueltigAb) return `${wo}: gültig bis liegt vor gültig ab.`;
  if (!REGELWERT_PRUEFSTATUS.includes(e.pruefstatus)) return `${wo}: Prüfstatus ist „provisional“ oder „geprueft“.`;
  if (e.pruefstatus === "geprueft") {
    if (!String(e.quelle || "").trim()) return `${wo}: „geprüft“ braucht die Quelle.`;
    if (!String(e.fundstelle || "").trim()) return `${wo}: „geprüft“ braucht die Fundstelle.`;
  }
  return null;
}

/**
 * Der wirksame Wert: der des Betriebs (gültig, geprüft oder vorläufig), sonst
 * der Ausgangswert, sonst nichts („nicht gesetzt“) — nie ein stiller Standard.
 * @param {any} m
 * @param {string} id
 * @param {string} [heute]
 * @returns {{ id: string, wert: number | null, herkunft: "betrieb" | "ausgangswert" | "nicht-gesetzt", pruefstatus: "geprueft" | "provisional",
 *   geprueft: boolean, quelle: string | null, fundstelle: string | null, version: string | null, gueltigAb: string | null,
 *   gueltigBis: string | null, einheit: string, ausgangswert: number | null, hinweis: string | null, fachnachweis: string }}
 */
export function regelwertWirksam(m, id, heute = heuteTag()) {
  const d = regelwertDef(id);
  if (!d) throw new Error(`Regelwert ${String(id).slice(0, 40)} ist unbekannt.`);
  const basis = { id, einheit: d.einheit, ausgangswert: d.ausgangswert, fachnachweis: d.fachnachweis,
    quelle: null, fundstelle: null, version: null, gueltigAb: null, gueltigBis: null };
  const e = regelwertEintrag(m, id);
  let grund = null;
  if (e) {
    const f = pruefeRegelwert(id, e);
    if (f) grund = "Der hinterlegte Wert ist ungültig und bleibt unbeachtet.";
    else if (e.gueltigAb && heute < e.gueltigAb) grund = `Der hinterlegte Wert gilt erst ab ${e.gueltigAb}.`;
    else if (e.gueltigBis && heute > e.gueltigBis) grund = `Der hinterlegte Wert galt bis ${e.gueltigBis}.`;
    else {
      const geprueft = e.pruefstatus === "geprueft" && !!String(e.quelle || "").trim() && !!String(e.fundstelle || "").trim() && !!e.geprueftAm;
      return { ...basis, wert: e.wert, herkunft: "betrieb", pruefstatus: geprueft ? "geprueft" : "provisional", geprueft,
        quelle: e.quelle || null, fundstelle: e.fundstelle || null, version: e.version || null,
        gueltigAb: e.gueltigAb || null, gueltigBis: e.gueltigBis || null,
        hinweis: geprueft ? null : "Angabe des Betriebs, nicht geprüft" };
    }
  }
  if (d.ausgangswert !== null)
    return { ...basis, wert: d.ausgangswert, herkunft: "ausgangswert", pruefstatus: "provisional", geprueft: false, hinweis: grund || d.ausgangswertText };
  return { ...basis, wert: null, herkunft: "nicht-gesetzt", pruefstatus: "provisional", geprueft: false, hinweis: grund || d.ausgangswertText };
}

const kern = (e) => (istObjekt(e) ? Object.fromEntries(FELDER_BETRIEB.map((k) => [k, e[k] ?? null])) : null);

/**
 * Schreibweg der fünf Regelwerte der Industriemodule (`einstellungen.regelwerte`).
 *
 *   - Ändern darf nur, wer org.edit hat. Für alle anderen bleibt der gespeicherte
 *     Stand dieser Kennungen — auch wenn sie sie löschen oder ändern.
 *   - Form und Grenzen je Kennung (422 bei Fehler); eine unbekannte Kennung mit
 *     dem Präfix der Industriemodule wird abgewiesen.
 *   - Ein neuer oder geänderter Eintrag bekommt Wann und Wer vom Server; bei
 *     „geprueft“ auch Geprüft-Am und Geprüft-Von (Quelle und Fundstelle Pflicht).
 *   - Fehlt ein gespeicherter Eintrag in der Übermittlung, ist er zurückgesetzt
 *     (der Ausgangswert gilt wieder).
 *   - Andere Kennungen (des Kerns) gehen unverändert durch.
 *
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb
 * @param {{ person?: any } | undefined} sitzung
 * @param {boolean} darfOrgEdit
 * @param {string} [heute]
 * @returns {{ mandant: any, grund?: undefined, status?: undefined } | { grund: string, status: number, mandant?: undefined }}
 */
export function industrieRegelwerteZusammen(altM, neuM, sitzung, darfOrgEdit, heute = heuteTag()) {
  if (!istObjekt(neuM) || !istObjekt(neuM.einstellungen)) return { mandant: neuM };
  const altR = altM && istObjekt(altM.einstellungen) && istObjekt(altM.einstellungen.regelwerte) ? altM.einstellungen.regelwerte : {};
  const hatNeu = hat(neuM.einstellungen, "regelwerte");
  if (hatNeu && !istObjekt(neuM.einstellungen.regelwerte))
    return { grund: "Regelwerte: erwartet wird je Kennung { wert, quelle, fundstelle, … }.", status: 422 };
  const neuR = hatNeu ? neuM.einstellungen.regelwerte : null;
  const meineAlt = Object.keys(altR).filter(istMeine);
  const meineNeu = neuR ? Object.keys(neuR).filter(istMeine) : [];
  if (!meineAlt.length && !meineNeu.length) return { mandant: neuM };

  /** @type {Record<string, any>} */
  const ergebnis = {};
  for (const [k, v] of Object.entries(neuR || {})) if (!istMeine(k)) ergebnis[k] = v;      // Kern: unberührt

  if (!darfOrgEdit) {
    for (const k of meineAlt) ergebnis[k] = altR[k];
  } else {
    for (const k of meineNeu) {
      const f = pruefeRegelwert(k, neuR[k]);
      if (f) return { grund: f, status: 422 };
      const alt = hat(altR, k) ? altR[k] : null;
      if (alt && gleich(kern(alt), kern(neuR[k]))) { ergebnis[k] = alt; continue; }          // unverändert: Wann und Wer bleiben
      const e = { ...kern(neuR[k]) };
      for (const [feld, wert] of Object.entries(e)) if (wert === null) delete e[feld];
      e.geaendertAm = new Date().toISOString();
      e.geaendertVon = sitzung && sitzung.person !== undefined ? sitzung.person : null;
      if (e.pruefstatus === "geprueft") { e.geprueftAm = heute; e.geprueftVon = e.geaendertVon; }
      ergebnis[k] = e;
    }
  }
  const einstellungen = { ...neuM.einstellungen };
  if (Object.keys(ergebnis).length) einstellungen.regelwerte = ergebnis; else delete einstellungen.regelwerte;
  return { mandant: { ...neuM, einstellungen } };
}

/* ==========================================================================
   KRANKMELDUNG IN ZWEI STUFEN (RB-2)

   Betreiberentscheidung 2026-11-11: Die Schichtverantwortung darf eingehende
   Krankmeldungen entgegennehmen und vorläufig bestätigen. Die endgültige
   Bestätigung geben ausschließlich Planung oder Leitung. Eine vorläufige
   Bestätigung löst keinen endgültigen Status aus. Beide Schritte werden
   protokolliert; die Rechte prüft der Server.

   Modell (rückwärtsverträglich, ohne Umbau gespeicherter Daten):
   - Eine eingehende Krankmeldung ist ein Fall in `m.krankmeldungen`:
       { id, personId, von, bis, notiz?, status, verlauf: [{ schritt, von, rolle, funktion?, zeit }] }
     status: "eingegangen" → "vorlaeufig_bestaetigt" → "endgueltig_bestaetigt".
   - WIRKSAM ist eine Krankheit nur als Eintrag in `m.abwesenheiten` (Art
     „krank"). Den legt allein die endgültige Bestätigung an (oder Planung und
     Leitung, die eine Abwesenheit wie bisher unmittelbar eintragen — das ist
     selbst die endgültige Bestätigung). Plan, Ist-Zeiten, Konto, Lohn,
     Ersatzsuche, Auswertungen und Kalender lesen ausschließlich
     `abwesenheiten` — ein Fall in `krankmeldungen` zählt dort nie, gleich
     welcher Status darin steht (fail-closed).
   - Gespeicherte Krankmeldungen aus der Zeit davor stehen in `abwesenheiten`
     und bleiben, was sie waren: endgültig.

   Die Schichtverantwortung ist hier die Rolle „subplaner" (Anzeige
   „Schichtverantwortung") in der Funktion für ihren Bereich: Sie handelt nur,
   wenn sie selbst an jedem Tag der Meldung (von und bis) zu dieser Einheit
   gehört und die gemeldete Person an diesen Tagen ebenfalls — dieselbe
   tagesgenaue Bereichsregel wie bei Anträgen und Abwesenheiten
   (einheitZusammen in rechte.mjs). Eine Pool-Einheit ist kein Bereich.

   Rein: keine Ablage, kein Versand. Der Endpunkt (POST /api/krankmeldung,
   server/funktionen/daten.mjs) liest und schreibt unter der Raumsperre.
   ========================================================================== */

import { einheitAm } from "./fachpruefung.mjs";

export const KRANK_STATUS = Object.freeze({
  EINGEGANGEN: "eingegangen",
  VORLAEUFIG: "vorlaeufig_bestaetigt",
  ENDGUELTIG: "endgueltig_bestaetigt",
});
export const KRANK_SCHRITTE = Object.freeze(["melden", "vorlaeufig", "endgueltig"]);

/** Rollen je Schritt. Andere Rollen (Betriebsrat, Betreiber, unbekannt): keiner. Die Kundenrolle ist der alte
    Probierraum und funktional die Leitung (wie RB-1, dieselbe Rechtetabelle). */
const MELDEN_ROLLEN = ["mitarbeiter", "subplaner", "planer", "leitung", "kunde"];
const VORLAEUFIG_ROLLEN = ["subplaner"];
const ENDGUELTIG_ROLLEN = ["planer", "leitung", "kunde"];

/** Darf diese Rolle diesen Schritt überhaupt (ohne Fallbezug)? */
export function krankSchrittErlaubt(rolle, schritt) {
  if (typeof rolle !== "string") return false;
  if (schritt === "melden") return MELDEN_ROLLEN.includes(rolle);
  if (schritt === "vorlaeufig") return VORLAEUFIG_ROLLEN.includes(rolle);
  if (schritt === "endgueltig") return ENDGUELTIG_ROLLEN.includes(rolle);
  return false;
}

/** Ist ein Fall endgültig bestätigt? Nur genau dieser Status — alles andere (auch Unbekanntes) nicht. */
export const fallEndgueltig = (f) => !!f && typeof f === "object" && f.status === KRANK_STATUS.ENDGUELTIG;

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const tagGueltig = (s) => typeof s === "string" && TAG.test(s)
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const NOTIZ_MAX = 300;
const KENNUNG = /^[A-Za-z0-9_-]{1,64}$/;
const istObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (x) => (Array.isArray(x) ? x.filter(istObj) : []);
const gleich = (a, b) => String(a) === String(b);

/**
 * Ist die Schichtverantwortung `ich` für Person `pid` im Zeitraum zuständig?
 * Sie und die Person gehören am ersten und am letzten Tag zur selben Einheit,
 * und diese Einheit ist kein Pool. Ohne gültige Tage: nein.
 */
export function svZustaendig(m, ich, pid, von, bis) {
  if (!m || !ich || !tagGueltig(von) || !tagGueltig(bis)) return false;
  const p = liste(m.personen).find((x) => gleich(x.id, pid));
  if (!p) return false;
  const pools = new Set(liste(m.einheiten).filter((e) => e.pool).map((e) => String(e.id)));
  for (const tag of [von, bis]) {
    const e = einheitAm(ich, tag);
    if (e === null || e === undefined || e === "ALLE" || pools.has(String(e))) return false;
    /* Ist ein Bereich am Zugang eingetragen (wie eigeneEinheit in rechte.mjs), muss er es sein. */
    if (ich.bereich && ich.bereich !== "ALLE" && String(ich.bereich) !== String(e)) return false;
    if (einheitAm(p, tag) !== e) return false;
  }
  return true;
}

/** Ein Schritt im Verlauf: wer (Person), in welcher Rolle/Funktion, wann. Keine Gesundheitsangabe. */
function schrittEintrag(schritt, akteur, jetzt) {
  const e = { schritt, von: akteur.personId === undefined ? null : akteur.personId, rolle: akteur.rolle, zeit: jetzt.toISOString() };
  if (akteur.rolle === "subplaner") e.funktion = "Schichtverantwortung";
  return e;
}

/**
 * Eine Krankmeldung entgegennehmen (Status „eingegangen").
 * @param {any} m  der gespeicherte Betrieb
 * @param {{ personId: any, rolle: string }} akteur
 * @param {{ personId?: any, von?: string, bis?: string, notiz?: string }} angabe
 * @param {Date} jetzt
 * @param {string} id  neue Fallkennung
 * @returns {{ status: number, grund: string } | { mandant: any, fall: any }}
 */
export function krankmeldungMelden(m, akteur, angabe, jetzt, id) {
  if (!krankSchrittErlaubt(akteur.rolle, "melden"))
    return { status: 403, grund: "Krankmeldungen nimmt dieser Zugang nicht entgegen." };
  const a = istObj(angabe) ? angabe : {};
  const personen = liste(m.personen);
  const ich = personen.find((x) => gleich(x.id, akteur.personId));
  if (!ich) return { status: 403, grund: "Diesem Zugang ist keine Person des Betriebs zugeordnet." };
  const pid = a.personId === undefined || a.personId === null || a.personId === "" ? ich.id : a.personId;
  const p = personen.find((x) => gleich(x.id, pid));
  if (!p) return { status: 404, grund: "Person nicht gefunden." };
  if (!tagGueltig(a.von) || !tagGueltig(a.bis) || a.bis < a.von)
    return { status: 400, grund: "Zeitraum: erwartet werden gültige Tage, „bis“ nicht vor „von“." };
  if (a.notiz !== undefined && (typeof a.notiz !== "string" || a.notiz.length > NOTIZ_MAX))
    return { status: 400, grund: `Anmerkung: höchstens ${NOTIZ_MAX} Zeichen Text.` };
  const eigen = gleich(p.id, ich.id);
  if (!eigen) {
    if (akteur.rolle === "mitarbeiter") return { status: 403, grund: "Beschäftigte melden nur die eigene Krankheit." };
    if (akteur.rolle === "subplaner" && !svZustaendig(m, ich, p.id, a.von, a.bis))
      return { status: 403, grund: "Diese Person gehört an diesen Tagen nicht zu deinem Bereich." };
  }
  const fall = { id, personId: p.id, von: a.von, bis: a.bis, status: KRANK_STATUS.EINGEGANGEN,
    verlauf: [schrittEintrag("eingegangen", akteur, jetzt)] };
  if (typeof a.notiz === "string" && a.notiz.trim()) fall.notiz = a.notiz;
  return { mandant: { ...m, krankmeldungen: [fall, ...liste(m.krankmeldungen)] }, fall };
}

/**
 * Vorläufig bestätigen (Schichtverantwortung) oder endgültig bestätigen (Planung, Leitung).
 * Ersetzt den Fall; die endgültige Bestätigung legt die wirksame Abwesenheit an.
 * @param {any} m
 * @param {{ personId: any, rolle: string }} akteur
 * @param {"vorlaeufig"|"endgueltig"} schritt
 * @param {any} fallId
 * @param {Date} jetzt
 * @returns {{ status: number, grund: string, code?: string } | { mandant: any, fall: any, abwesenheit?: any }}
 */
export function krankmeldungBestaetigen(m, akteur, schritt, fallId, jetzt) {
  if (schritt !== "vorlaeufig" && schritt !== "endgueltig") return { status: 400, grund: "Unbekannter Schritt." };
  if (!krankSchrittErlaubt(akteur.rolle, schritt))
    return { status: 403, grund: schritt === "endgueltig"
      ? "Endgültig bestätigen nur Planung und Leitung."
      : "Vorläufig bestätigt die Schichtverantwortung des Bereichs." };
  if (typeof fallId !== "string" || !KENNUNG.test(fallId)) return { status: 400, grund: "Kennung der Krankmeldung fehlt." };
  const faelle = liste(m.krankmeldungen);
  const fall = faelle.find((f) => f.id === fallId);
  if (!fall) return { status: 404, grund: "Krankmeldung nicht gefunden." };
  const personen = liste(m.personen);
  const ich = personen.find((x) => gleich(x.id, akteur.personId));
  if (!ich) return { status: 403, grund: "Diesem Zugang ist keine Person des Betriebs zugeordnet." };
  /* Vier Augen: die eigene Krankmeldung bestätigt jemand anderes. */
  if (gleich(fall.personId, ich.id)) return { status: 403, code: "VIER_AUGEN", grund: "Die eigene Krankmeldung bestätigt eine andere Person." };

  if (schritt === "vorlaeufig") {
    if (!svZustaendig(m, ich, fall.personId, fall.von, fall.bis))
      return { status: 403, grund: "Diese Person gehört an diesen Tagen nicht zu deinem Bereich." };
    if (fall.status !== KRANK_STATUS.EINGEGANGEN)
      return { status: 409, code: "SCHRITT_BEREITS", grund: fall.status === KRANK_STATUS.VORLAEUFIG
        ? "Diese Krankmeldung ist bereits vorläufig bestätigt." : "Diese Krankmeldung ist bereits endgültig bestätigt." };
    const neu = { ...fall, status: KRANK_STATUS.VORLAEUFIG, verlauf: [...liste(fall.verlauf), schrittEintrag("vorlaeufig", akteur, jetzt)] };
    return { mandant: { ...m, krankmeldungen: faelle.map((f) => (f === fall ? neu : f)) }, fall: neu };
  }

  /* endgültig */
  if (fall.status !== KRANK_STATUS.EINGEGANGEN && fall.status !== KRANK_STATUS.VORLAEUFIG)
    return { status: 409, code: "SCHRITT_BEREITS", grund: "Diese Krankmeldung ist bereits endgültig bestätigt." };
  if (!personen.some((x) => gleich(x.id, fall.personId))) return { status: 404, grund: "Person nicht gefunden." };
  if (!tagGueltig(fall.von) || !tagGueltig(fall.bis) || fall.bis < fall.von)
    return { status: 409, grund: "Der Zeitraum dieser Krankmeldung ist ungültig." };
  const abwId = `a-${fall.id}`;
  const abw = liste(m.abwesenheiten);
  const abwesenheit = { id: abwId, personId: fall.personId, art: "krank", von: fall.von, bis: fall.bis,
    notiz: typeof fall.notiz === "string" ? fall.notiz : "" };
  const neu = { ...fall, status: KRANK_STATUS.ENDGUELTIG, abwesenheitId: abwId,
    verlauf: [...liste(fall.verlauf), schrittEintrag("endgueltig", akteur, jetzt)] };
  return {
    mandant: { ...m, krankmeldungen: faelle.map((f) => (f === fall ? neu : f)),
      abwesenheiten: abw.some((x) => x.id === abwId) ? m.abwesenheiten : [...(Array.isArray(m.abwesenheiten) ? m.abwesenheiten : []), abwesenheit] },
    fall: neu, abwesenheit,
  };
}

/**
 * Ältere Oberflächen schreiben eine Krankmeldung von Beschäftigten und Schichtverantwortung als
 * Abwesenheit über PUT /api/bestand. Der Server macht daraus einen eingegangenen Fall — wirksam
 * wird sie erst mit der endgültigen Bestätigung. Kennung: `km-` + Kennung des Eintrags.
 * @param {any} eintrag  bereits geprüfter Eintrag { id, personId, von, bis, notiz? }
 */
export function fallAusAbwesenheit(eintrag, akteur, jetzt) {
  const fall = { id: `km-${eintrag.id}`.slice(0, 64), personId: eintrag.personId, von: eintrag.von, bis: eintrag.bis,
    status: KRANK_STATUS.EINGEGANGEN, verlauf: [schrittEintrag("eingegangen", akteur, jetzt)] };
  if (typeof eintrag.notiz === "string" && eintrag.notiz.trim()) fall.notiz = eintrag.notiz;
  return fall;
}

/**
 * Zeilen für das Betriebsprotokoll aus einem Speichervorgang (PUT /api/bestand): neue eingegangene
 * Fälle und Krankmeldungen, die Planung oder Leitung unmittelbar als Abwesenheit eintragen (das ist
 * selbst die endgültige Bestätigung). Ohne Person, Tag und Anmerkung — nur Kennung, Schritt, Rolle.
 */
export function krankProtokollZeilen(altB, neuB, rolle) {
  const mandanten = (b) => (b && Array.isArray(b.mandanten) ? b.mandanten : []).filter(istObj);
  const alt = new Map(mandanten(altB).map((m) => [m.id, m]));
  const zeilen = [];
  for (const m of mandanten(neuB)) {
    const vorher = alt.get(m.id) || {};
    const faelleAlt = new Set(liste(vorher.krankmeldungen).map((f) => f.id));
    for (const f of liste(m.krankmeldungen)) if (!faelleAlt.has(f.id)) zeilen.push(`Krankmeldung ${f.id}: eingegangen · Rolle ${rolle}`);
    if (ENDGUELTIG_ROLLEN.includes(rolle)) {
      const abwAlt = new Set(liste(vorher.abwesenheiten).map((a) => String(a.id)));
      for (const a of liste(m.abwesenheiten))
        if (a.art === "krank" && !abwAlt.has(String(a.id))) zeilen.push(`Krankmeldung ${a.id}: endgültig (unmittelbar eingetragen) · Rolle ${rolle}`);
    }
  }
  return zeilen;
}

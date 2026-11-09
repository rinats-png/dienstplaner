/* ==========================================================================
   IMP-3 — Bestätigte Übernahme: ganz oder gar nicht, über den bestehenden Weg

   Keine eigene Schreibschicht. Die Übernahme baut aus dem frisch gelesenen
   Stand (unter der Raumsperre) die Sicht der Rolle, wendet den Plan auf den
   eigenen Betrieb an und gibt das Ergebnis durch dieselben Stationen wie
   PUT /api/bestand (server/funktionen/daten.mjs):

     zusammenfuehren (rechte.mjs: Schreibumfang, Rückfüllung verborgener
     Felder, Rollenwechsel, Einheitsprüfung) → Fachprüfung (WP-22) →
     personenAngleichen/uebergabenAngleichen → Standortprüfung → pruefeGestalt
     → EIN bestandSchreiben mit erwartetem Stand (Journal, bestand.mjs).

   Zusätzlich, nur für den Import:
   - Der Plan wird unter der Sperre aus dem aktuellen Stand neu berechnet. Weicht
     er von der bestätigten Vorschau ab (jemand hat inzwischen Personen
     angelegt oder Einheiten umbenannt), wird nichts geschrieben (409).
   - Nach dem Zusammenführen wird geprüft, dass sich im Betrieb nur geändert
     hat, was der Plan sagt: neue und aktualisierte Personen, neue Einheiten
     und Standorte. Alles andere wäre ein Fehler in einer Station — dann
     wird nichts geschrieben.
   - Wiederholschutz über den Inhalt der Datei je Betrieb (importerledigt:…),
     geprüft und gesetzt unter derselben Sperre.

   Atomar: Bis zum Journal in bestandSchreiben liegt alles nur im Speicher.
   Ein Fehler davor hinterlässt den alten Stand. Ein Fehler danach (Platte
   beim Ausführen des Journals) gilt als festgeschrieben — das Journal wird
   beim nächsten Lesen zu Ende geführt. Welcher Fall vorliegt, prüft
   `nachpruefen` nach jedem Fehler aus bestandSchreiben.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { bestandLesenStreng, bestandSchreiben, unterRaumsperre } from "../bestand.mjs";
import { bestandFuerRolle, zusammenfuehren, eigenerMandant, fachpruefungOffen } from "../rechte.mjs";
import { fachpruefungUebermittlungAsync } from "../schutzdurchsetzung.mjs";
import { pruefeGestalt, personenAngleichen, uebergabenAngleichen } from "../gestalt.mjs";
import { bestandStandorteFehler, bestandDienstartOrtFehler } from "../geo.mjs";
import { analysieren, planen, anwenden } from "./personen.mjs";

/** Wiederholschutz je Datei und Betrieb: 30 Tage (wie die Betriebsspur, schutz.mjs). */
export const ERLEDIGT_FRIST_MS = 30 * 24 * 60 * 60 * 1000;
export const ERLEDIGT_PRAEFIX = "importerledigt:";
export const erledigtSchluessel = (raum, mandantId, dateiHash) =>
  `${ERLEDIGT_PRAEFIX}${raum}:${createHash("sha256").update(`${mandantId}|${dateiHash}`).digest("hex").slice(0, 48)}`;

/** Nur für die Prüfung (Fehlerinjektion). Im Betrieb immer null. */
export const _pruefhaken = { nachDatensatz: null, ablage: null };

const neueId = (praefix) => `${praefix}${randomBytes(6).toString("hex")}`;
const nein = (status, code, nachricht, mehr = {}) => ({ ok: false, status, code, nachricht, ...mehr });
const BETRIEB_GEAENDERT_ERLAUBT = new Set(["personen", "einheiten", "standorte"]);

/** Hat sich im Betrieb nur geändert, was der Plan vorsieht? */
function nurGeplant(altM, neuM, plan, neueIds) {
  const j = (x) => JSON.stringify(x ?? null);
  const schluessel = new Set([...Object.keys(altM || {}), ...Object.keys(neuM || {})]);
  for (const k of schluessel) if (!BETRIEB_GEAENDERT_ERLAUBT.has(k) && j(altM[k]) !== j(neuM[k])) return `Feld ${k}`;
  const erlaubtP = new Set([...neueIds, ...plan.aktualisieren.map((a) => a.personId)]);
  const alt = new Map((altM.personen || []).filter(Boolean).map((p) => [String(p.id), p]));
  const neu = new Map((neuM.personen || []).filter(Boolean).map((p) => [String(p.id), p]));
  for (const [id, p] of alt) if (!neu.has(id) || (!erlaubtP.has(id) && j(p) !== j(neu.get(id)))) return "Person";
  for (const id of neu.keys()) if (!alt.has(id) && !erlaubtP.has(id)) return "Person";
  for (const feld of ["einheiten", "standorte"]) {
    const a = (altM[feld] || []).filter(Boolean);
    const n = (neuM[feld] || []).filter(Boolean);
    if (j(n.slice(0, a.length)) !== j(a)) return feld;
  }
  return null;
}

/** Nach einem Fehler beim Schreiben: Ist der neue Stand festgeschrieben (Journal) oder nicht? */
async function nachpruefen(store, raum, mandantId, neueIds, plan) {
  try {
    const nach = await bestandLesenStreng(store, raum);
    const m = nach && Array.isArray(nach.bestand && nach.bestand.mandanten)
      ? nach.bestand.mandanten.find((x) => x && String(x.id) === mandantId) : null;
    const personen = new Map((m && Array.isArray(m.personen) ? m.personen : []).filter(Boolean).map((p) => [String(p.id), p]));
    const neuDa = neueIds.filter((id) => personen.has(id)).length;
    /* Eine Aktualisierung gilt als angekommen, wenn alle ihre Felder den neuen Wert tragen (der Plan enthält nur echte Änderungen). */
    const aktDa = plan.aktualisieren.filter((a) => {
      const p = personen.get(a.personId);
      return p && a.aenderungen.every((ae) => String(p[ae.feld] ?? "") === String(ae.neu));
    }).length;
    const gesamt = neueIds.length + plan.aktualisieren.length;
    if (neuDa + aktDa === gesamt) return "festgeschrieben";
    if (neuDa + aktDa === 0) return "nicht";
    return "teilweise";
  } catch { return "unklar"; }
}

/**
 * Die Übernahme. Läuft vollständig unter der Raumsperre.
 *
 * Delta-Review 3a: Grundlage ist die `momentaufnahme` (Zeilen, Zuordnung, Entscheidungen, Bestätigungen,
 * Einheiten anlegen, Dateihash) aus der Anfrage, die die Übernahme ausgelöst hat — nie der Vorgang, wie er
 * nach dem Warten auf die Sperre aussieht. Der Plan aus dem aktuellen Stand muss genau den Hash der
 * `bestaetigung` dieser Anfrage tragen.
 * @param {{ store: any, sitzung: any, vorgang: any, bestaetigung: string, momentaufnahme: any, heute: string, orgEdit: boolean,
 *   protokolliere: (ausgang: string, zusatz: string) => Promise<void> }} e
 * @returns {Promise<any>} { ok: true, zaehler, stand } oder { ok: false, status, code, nachricht }
 */
export function uebernehmen({ store: storeRoh, sitzung, vorgang, bestaetigung, momentaufnahme: m, heute, orgEdit, protokolliere }) {
  const store = _pruefhaken.ablage ? _pruefhaken.ablage(storeRoh) : storeRoh;
  const raum = vorgang.besitz.raum;
  if (!m || typeof bestaetigung !== "string" || !bestaetigung)
    return Promise.resolve(nein(409, "VORSCHAU_VERALTET", "Die Übernahme braucht die Bestätigung der aktuellen Vorschau. Es wurde nichts geändert."));
  return unterRaumsperre(raum, async () => {
    const jetzt = await bestandLesenStreng(storeRoh, raum);
    const eigener = jetzt ? eigenerMandant(jetzt.bestand, sitzung) : null;
    if (!eigener || String(eigener.id) !== vorgang.besitz.mandantId) return nein(404, "NICHT_GEFUNDEN", "Importvorgang nicht gefunden.");

    /* Wiederholschutz über den Dateiinhalt (je Betrieb), unter derselben Sperre wie das Schreiben. */
    const sErl = erledigtSchluessel(raum, vorgang.besitz.mandantId, m.dateiHash);
    const erl = await storeRoh.get(sErl, { type: "json" }).catch(() => null);
    if (erl && Date.parse(erl.zeit) + ERLEDIGT_FRIST_MS > Date.now())
      return nein(409, "DATEI_BEREITS_UEBERNOMMEN", "Diese Datei wurde für diesen Betrieb bereits übernommen. Es wurde nichts geändert.",
        { frueher: { zeit: erl.zeit, zaehler: erl.zaehler } });

    /* Der Plan aus dem aktuellen Stand und der Momentaufnahme — muss genau die bestätigte Vorschau sein. */
    const analyse = analysieren({ mandant: eigener, zeilen: m.zeilen, zuordnung: m.zuordnung, heute, datumssystem: m.datumssystem });
    const p = analyse.ok ? planen({ mandant: eigener, analyse, entscheidungen: m.entscheidungen,
      bestaetigungen: m.bestaetigungen, einheitenAnlegen: m.einheitenAnlegen, orgEdit }) : null;
    if (!p || !p.ok || p.hash !== bestaetigung)
      return nein(409, "VORSCHAU_VERALTET", "Der Bestand hat sich seit der Vorschau geändert. Bitte die Vorschau neu erstellen. Es wurde nichts geändert.");
    if (!p.zaehler.neu && !p.zaehler.aktualisiert)
      return nein(422, "NICHTS_ZU_UEBERNEHMEN", "Nach der Auswahl bleibt kein Datensatz zum Übernehmen. Es wurde nichts geändert.");

    /* Der Plan auf die Sicht der Rolle — genau das, was die Oberfläche über PUT /api/bestand schicken würde. */
    const angeglichen = personenAngleichen(jetzt.bestand);
    const sicht = bestandFuerRolle(angeglichen, sitzung);
    if (!sicht || !Array.isArray(sicht.mandanten) || sicht.mandanten.length !== 1 || String(sicht.mandanten[0].id) !== vorgang.besitz.mandantId)
      return nein(403, "KEINE_BERECHTIGUNG", "Keine Schreibberechtigung.");
    let angewendet;
    try {
      angewendet = anwenden(sicht.mandanten[0], p.plan, { neueId, heute,
        haken: _pruefhaken.nachDatensatz ? (i) => _pruefhaken.nachDatensatz(i) : null });
    } catch {
      /* Bis hierher liegt alles nur im Speicher: Ein Abbruch mitten in den Datensätzen hinterlässt nichts. */
      await protokolliere("fehler", "Anwenden abgebrochen");
      return nein(500, "UEBERNAHME_ABGEBROCHEN", "Die Übernahme wurde abgebrochen. Es wurde nichts geändert.");
    }
    const { mandant: neuM, neueIds } = angewendet;
    const gesendet = { ...sicht, mandanten: [neuM] };

    let zuSchreiben = zusammenfuehren(angeglichen, gesendet, sitzung, { fachpruefung: "aussen" });
    if (!zuSchreiben || zuSchreiben.verweigert) {
      await protokolliere("abgewiesen", "Zusammenführen verweigert");
      return nein(403, "KEINE_BERECHTIGUNG", "Diese Übernahme ist mit deiner Rolle nicht zulässig. Es wurde nichts geändert.");
    }
    const offen = fachpruefungOffen(zuSchreiben);
    if (offen) {
      const fach = await fachpruefungUebermittlungAsync(offen.alt, offen.neu, undefined, { imBereich: offen.imBereich });
      if (fach && (fach.zeitbudget || fach.sperre || fach.warnungen))
        return nein(409, "FACHPRUEFUNG", "Die Übernahme löst Prüfbefunde aus und wurde nicht ausgeführt. Bitte die Einteilungen prüfen. Es wurde nichts geändert.");
    }
    zuSchreiben = personenAngleichen(uebergabenAngleichen(zuSchreiben));

    const altM = eigenerMandant(angeglichen, sitzung);
    const nachM = (zuSchreiben.mandanten || []).find((x) => x && String(x.id) === vorgang.besitz.mandantId);
    const abweichung = nachM ? nurGeplant(altM, nachM, p.plan, neueIds) : "Betrieb";
    if (abweichung) {
      await protokolliere("abgewiesen", "Änderung außerhalb des Plans");
      return nein(500, "INTERNE_PRUEFUNG", "Die Übernahme wurde aus Sicherheitsgründen nicht ausgeführt. Es wurde nichts geändert.");
    }
    if (bestandStandorteFehler(jetzt.bestand, zuSchreiben) || bestandDienstartOrtFehler(jetzt.bestand, zuSchreiben))
      return nein(422, "STANDORT_UNGUELTIG", "Eine Standortangabe ist ungültig. Es wurde nichts geändert.");
    const form = pruefeGestalt(zuSchreiben, { vorher: jetzt.bestand });
    if (!form.ok) return nein(422, "GESTALT", "Der neue Stand wäre unvollständig. Es wurde nichts geändert.");

    let erg;
    try {
      erg = await bestandSchreiben(store, raum, zuSchreiben, { erwarteterStand: jetzt.stand, durch: "Import" });
    } catch (e) {
      const lage = await nachpruefen(storeRoh, raum, vorgang.besitz.mandantId, neueIds, p.plan);
      if (lage !== "festgeschrieben") {
        await protokolliere("fehler", `Schreiben fehlgeschlagen (${lage})`);
        if (lage === "nicht") return nein(503, "SCHREIBEN_FEHLGESCHLAGEN", "Die Übernahme ist fehlgeschlagen. Es wurde nichts geändert. Bitte erneut versuchen.");
        return nein(500, "SCHREIBEN_UNKLAR", "Die Übernahme ist fehlgeschlagen. Bitte den Personalbestand prüfen, bevor erneut übernommen wird.");
      }
      erg = { ok: true, stand: null };
      void e;
    }
    if (!erg.ok) return nein(409, "KONFLIKT", "Jemand anderes hat inzwischen gespeichert. Bitte die Vorschau neu erstellen. Es wurde nichts geändert.");

    const zaehler = { neu: p.zaehler.neu, aktualisiert: p.zaehler.aktualisiert, uebersprungen: p.zaehler.uebersprungen,
      neueEinheiten: p.zaehler.neueEinheiten, neueStandorte: p.zaehler.neueStandorte };
    const zeit = new Date().toISOString();
    await storeRoh.setJSON(sErl, { zeit, person: sitzung.person ?? null, zaehler }).catch(() => {});
    return { ok: true, zaehler, stand: erg.stand, zeit };
  });
}

/** Abgelaufene Wiederholschutz-Vermerke eines Raums löschen (beim Upload, ohne Zeitgeber; je Raum höchstens stündlich,
    weil das Auflisten der Ablage das ganze Verzeichnis liest). Abgelaufene Vermerke zählen ohnehin nicht (Prüfung oben). */
const zuletztAufgeraeumt = new Map();
export async function erledigteAufraeumen(store, raum, jetzt = Date.now()) {
  if (jetzt - (zuletztAufgeraeumt.get(raum) || 0) < 60 * 60 * 1000) return;
  if (zuletztAufgeraeumt.size > 5000) zuletztAufgeraeumt.clear();
  zuletztAufgeraeumt.set(raum, jetzt);
  try {
    const { blobs } = await store.list({ prefix: `${ERLEDIGT_PRAEFIX}${raum}:` });
    for (const b of blobs) {
      const v = await store.get(b.key, { type: "json" }).catch(() => null);
      if (!v || !(Date.parse(v.zeit) + ERLEDIGT_FRIST_MS > jetzt)) await store.delete(b.key).catch(() => {});
    }
  } catch { /* nur Aufräumen */ }
}

/* ==========================================================================
   IMP-3 — Importvorgänge (temporäre Sitzungsobjekte, nur im Arbeitsspeicher)

   Ein Vorgang hält zwischen Upload, Analyse, Vorschau und Übernahme den
   gelesenen Rohinhalt der Datei (Ergebnis des Parsers, nie die Datei selbst),
   die Analyse und den zuletzt angezeigten Plan.

   Warum nur im Arbeitsspeicher: Der Inhalt sind Personaldaten. Auf der Platte
   lägen sie in Sicherungen, Abbildern und gelöschten Blöcken weiter. Es läuft
   genau ein Prozess je Ablage (prozesssperre.mjs), also sieht jede Anfrage
   denselben Speicher. Ein Neustart verwirft alle offenen Vorgänge; die Person
   lädt die Datei dann erneut hoch — es wurde nichts übernommen.

   Fristen (festgelegt in IMP-3, begründet im Nachweis):
   - 30 Minuten ohne Zugriff: Der Vorgang wird gelöscht. Eine Zuordnung und
     Vorschau prüft man in Minuten; wer länger weg ist, beginnt neu.
   - 2 Stunden ab Upload: Höchstdauer, auch bei laufender Nutzung.
   - Nach der Übernahme: Rohinhalt, Analyse und Plan werden sofort verworfen;
     bis zum Ablauf der Höchstdauer bleibt nur der Vermerk „übernommen" mit
     den Zahlen (Wiederholschutz), ohne Personendaten.
   - Verwerfen durch die Person: sofort gelöscht.

   Zugriff: Ein Vorgang gehört genau einem Raum, einem Betrieb (mandantId)
   und einer Person bzw. Rolle. Wer etwas anderes ist, bekommt „nicht
   gefunden" — nicht einmal, dass es den Vorgang gibt.
   ========================================================================== */

import { randomBytes } from "node:crypto";
import { schichtErgebnisVerwerfen, _cacheZuruecksetzen } from "./schichtcache.mjs";

export const FRISTEN = Object.freeze({
  inaktivMs: 30 * 60 * 1000,
  hoechstMs: 2 * 60 * 60 * 1000,
});
/** Höchstzahl gleichzeitig offener Vorgänge: gesamt und je Raum (Arbeitsspeicher). */
export const HOECHST = Object.freeze({ gesamt: 20, jeRaum: 3 });

/** @type {Map<string, any>} */
const VORGAENGE = new Map();

const ID = /^[0-9a-f]{32}$/;

/** Wem gehört ein Vorgang? Aus der Sitzung, nie aus dem Rumpf. */
export function besitzAus(sitzung, mandantId) {
  return { raum: String(sitzung.bestand), mandantId: String(mandantId),
    wer: sitzung.person !== null && sitzung.person !== undefined ? `p:${sitzung.person}` : `r:${sitzung.rolle}` };
}
const gleicherBesitz = (a, b) => a.raum === b.raum && a.mandantId === b.mandantId && a.wer === b.wer;

/** Abgelaufene Vorgänge löschen. */
export function aufraeumen(jetzt = Date.now()) {
  for (const [id, v] of VORGAENGE) {
    if (jetzt - v.angelegt > FRISTEN.hoechstMs || (v.zustand !== "uebernommen" && jetzt - v.zuletzt > FRISTEN.inaktivMs))
      { VORGAENGE.delete(id); schichtErgebnisVerwerfen(id); }
  }
}

/**
 * @returns {{ ok: true, vorgang: any } | { ok: false, code: string }}
 */
export function vorgangAnlegen(besitz, daten, jetzt = Date.now()) {
  aufraeumen(jetzt);
  const offen = [...VORGAENGE.values()].filter((v) => v.zustand !== "uebernommen");
  if (offen.length >= HOECHST.gesamt || offen.filter((v) => v.besitz.raum === besitz.raum).length >= HOECHST.jeRaum)
    return { ok: false, code: "ZU_VIELE_VORGAENGE" };
  const id = randomBytes(16).toString("hex");
  const vorgang = { id, besitz, angelegt: jetzt, zuletzt: jetzt, zustand: "offen", laeuft: false, ...daten };
  VORGAENGE.set(id, vorgang);
  return { ok: true, vorgang };
}

/**
 * Einen angelegten, aber noch leeren Vorgang mit dem Ergebnis des Parsers füllen. Zusammen mit `vorgangAnlegen`
 * VOR dem Parsen: Die Vorgangsgrenze (je Raum 3, gesamt 20) muss greifen, bevor eine Datei gelesen oder in
 * einen Parser-Worker gegeben wird — sonst könnten beliebig viele Uploads parallel Speicher und Rechenzeit
 * binden und erst danach abgewiesen werden. Der Platz ist ab dem Anlegen belegt (Zustand "offen", ohne Inhalt);
 * scheitert das Parsen, gibt `vorgangEntfernen` ihn wieder frei. Die Id wird erst nach dem Füllen ausgegeben.
 */
export function vorgangFuellen(v, daten) { Object.assign(v, daten); return v; }

/** Den Vorgang holen — nur für den Besitzer und nur, solange er gilt. Sonst null. */
export function vorgangHolen(id, besitz, jetzt = Date.now()) {
  aufraeumen(jetzt);
  if (typeof id !== "string" || !ID.test(id)) return null;
  const v = VORGAENGE.get(id);
  if (!v || !gleicherBesitz(v.besitz, besitz)) return null;
  v.zuletzt = jetzt;
  return v;
}

/** Nach der Übernahme: Inhalte verwerfen, nur den Vermerk behalten. */
export function alsUebernommen(v, ergebnis) {
  v.zustand = "uebernommen";
  v.ergebnis = ergebnis;
  v.zeilen = null; v.blaetter = null; v.analyse = null; v.plan = null;
  schichtErgebnisVerwerfen(v.id);   // IMP-6: zwischengespeichertes Schichtergebnis fällt mit dem Inhalt weg
}

export function vorgangEntfernen(id) { VORGAENGE.delete(id); schichtErgebnisVerwerfen(id); }

/* Delta-Review 4a: Parser-Plätze je Raum. Die Grenze in parser.mjs (PARSER_GLEICHZEITIG_MAX) gilt prozessweit; ohne
   eigene Grenze je Raum könnte ein einziger Raum alle Plätze halten und alle anderen Betriebe aussperren. Je Raum
   läuft deshalb höchstens EIN Parser gleichzeitig; ein weiterer Upload desselben Raums wird sofort abgewiesen
   (503 ZU_VIEL_GLEICHZEITIG), ohne die Datei zu lesen. */
export const PARSER_JE_RAUM_MAX = 1;
const PARSER_IM_RAUM = new Map();
/** Einen Parser-Platz für den Raum belegen. Liefert eine Freigabe-Funktion (einmal wirksam) oder null, wenn voll. */
export function parserPlatzBelegen(raum) {
  const n = PARSER_IM_RAUM.get(raum) || 0;
  if (n >= PARSER_JE_RAUM_MAX) return null;
  PARSER_IM_RAUM.set(raum, n + 1);
  let frei = false;
  return () => {
    if (frei) return;
    frei = true;
    const rest = (PARSER_IM_RAUM.get(raum) || 1) - 1;
    if (rest > 0) PARSER_IM_RAUM.set(raum, rest); else PARSER_IM_RAUM.delete(raum);
  };
}
export const _parserImRaum = (raum) => PARSER_IM_RAUM.get(raum) || 0;
/** Nur für die Prüfung: `vorParser({ raum })` wird nach dem Belegen des Raum-Platzes und vor dem Parsen abgewartet. */
export const _pruefhaken = { vorParser: null };

/** Für die Prüfung: Zahl der Vorgänge und ob ein Vorgang noch Inhalte hält. */
export function _anzahl() { return VORGAENGE.size; }
export function _roh(id) { return VORGAENGE.get(id) || null; }
export function _zuruecksetzen() { VORGAENGE.clear(); _cacheZuruecksetzen(); }

/* Alle 60 Sekunden aufräumen, auch ohne Zugriff (unref: hält den Prozess nicht am Leben). */
setInterval(() => aufraeumen(), 60_000).unref();

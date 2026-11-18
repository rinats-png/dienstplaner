/* ==========================================================================
   LÖSCHLAUF DER LEITUNG ALS EIGENER WEG — POST /api/loeschlauf (WP-48.4)

   Bis hierher lief der Löschlauf der Leitung (Aufbewahrungsfristen) nur in
   der Oberfläche: `raeumen` (aufbewahrung.mjs) auf den eigenen Betrieb der
   GET-Sicht, ein Eintrag im Betriebsprotokoll (mUpd), dann ein voller PUT
   ohne die fälligen Einträge. Der Server erkannte die Löschung daran, dass
   die Einträge fehlten (stempelSichern mit `loeschlauf: voll`). Mit dem
   Teilweg (WP-48.3) ist das nicht mehr darstellbar: Ein Delta löscht nie
   durch Weglassen (docs/acc45/WP48-TEILSPEICHERUNG.md 2.6, Entscheidung 6.1).

   Dieser Weg baut auf dem Server GENAU den Rumpf, den die Oberfläche heute
   schickt — Sicht der Rolle (wie GET) mit `raeumen(eigenerBetrieb, heute)`
   und demselben Protokolleintrag — und schickt ihn durch DIESELBE
   Schreibkette wie PUT /api/bestand (daten.mjs, ein Block): Rechte
   (zusammenfuehren), Stempel-Integrität mit derselben Frist
   (loeschStichtag), Monatsabschluss, Fachprüfung, Gestalt,
   Schrumpfungssicherung, Journal. Er löscht damit nie mehr und nie anderes
   als der heutige Weg bei gleichem Bestand (pruefungen/wp48-loeschlauf.test.js,
   Differenzialprüfung). Keine neue Regel, keine neue Konfliktregel.

   Zusätzlich, nur strenger:
   - Schalter: nur mit CENTRIC_TEILSPEICHERUNG=true (sonst 404, wie der
     Teilweg; schalter.mjs). Der heutige Weg bleibt unverändert.
   - Recht: nur, wer heute den Löschlauf in der Oberfläche sieht
     (Ansicht „Datenschutz", org.edit) und voll schreibt — Leitung und die
     Kundenrolle im eigenen Probierraum. Planung, Schichtverantwortung,
     Beschäftigte, Betriebsrat, Betreiber, Sicherungsschlüssel: 403.
   - Zwei Schritte: `{ vorschau: true }` rechnet und schreibt nichts; die
     Ausführung verlangt `{ bestaetigt: <kennung> }` aus der Vorschau. Hat
     sich das Fällige seitdem geändert (anderer Tag, andere Einträge), gibt
     es 409 LOESCHLAUF_VORSCHAU_VERALTET und nichts wird gelöscht.
   - Ungültige Fristangaben: 422, nichts wird gelöscht (fail-closed wie der
     Datenschutzlauf; der heutige Weg rechnete dann mit Ersatzwerten).
   - Idempotent: Nach einem Lauf ist nichts mehr fällig; derselbe Aufruf
     noch einmal schreibt nichts (200, `ausgefuehrt: false`).
   - Eigene Bremse `loeschlauf` (schutz.mjs).
   Der tägliche Datenschutzlauf (datenschutzlauf.mjs, Modus „an") bleibt
   ein eigener, unabhängiger Weg (B-N3).
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { vorschau, raeumen, berichtstext, aufbewahrungFehler } from "./aufbewahrung.mjs";
import { darf, rolleBekannt, schreibumfang, SCHREIBEN_VOLL } from "./rechte.mjs";

/** Zulässige Felder des Rumpfs. */
const FELDER = new Set(["vorschau", "bestaetigt"]);
const KENNUNG = /^[0-9a-f]{32}$/;

/** Wer den Löschlauf auslösen darf: wie heute in der Oberfläche (org.edit) und mit Vollschreibrecht. */
export function loeschlaufRecht(s) {
  if (!s || s.nurSicherung) return false;
  const rolle = s.rolle;
  if (!rolle || !rolleBekannt(rolle) || rolle === "betreiber") return false;
  return schreibumfang(rolle) === SCHREIBEN_VOLL && darf(rolle, "org.edit");
}

/**
 * Formprüfung des Rumpfs: genau eines von `vorschau: true` und `bestaetigt: <32 hex>`.
 * @returns {null | { grund: string }}
 */
export function loeschlaufFormFehler(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return { grund: "Der Auftrag fehlt." };
  for (const k of Object.keys(r)) if (!FELDER.has(k)) return { grund: `Unbekannte Angabe „${k.slice(0, 40)}".` };
  const v = Object.prototype.hasOwnProperty.call(r, "vorschau");
  const b = Object.prototype.hasOwnProperty.call(r, "bestaetigt");
  if (v === b) return { grund: "Entweder eine Vorschau oder eine bestätigte Ausführung." };
  if (v && r.vorschau !== true) return { grund: "vorschau muss true sein." };
  if (b && (typeof r.bestaetigt !== "string" || !KENNUNG.test(r.bestaetigt)))
    return { grund: "Die Bestätigung passt nicht zu einer Vorschau." };
  return null;
}

/** Stabiles JSON (sortierte Schlüssel) für die Kennung. */
function stabil(x) {
  if (x === undefined || x === null || typeof x !== "object") return JSON.stringify(x ?? null);
  if (Array.isArray(x)) return `[${x.map(stabil).join(",")}]`;
  return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
}

/** Zahlen der Vorschau ohne Personenangaben (Antwort und Kennung). */
export function planZahlen(plan) {
  return {
    gesamt: plan.gesamt, personen: plan.personen.length, plandaten: { ...plan.plandaten }, planSumme: plan.planSumme,
    aenderungen: plan.aenderungen, gruende: plan.gruende, standort: plan.standort, abgewiesen: plan.abgewiesen,
    krankmeldungen: plan.krankmeldungen, moduldaten: plan.moduldaten, modulprotokoll: plan.modulprotokoll,
    moduldatenZurueckgehalten: plan.moduldatenZurueckgehalten, modulprotokollZurueckgehalten: plan.modulprotokollZurueckgehalten,
    bewachvZurueckgehalten: plan.bewachvZurueckgehalten,
    stichtage: { plan: plan.stichtage.plan, stamm: plan.stichtage.stamm, grund: plan.stichtage.grund, standort: plan.stichtage.standort },
  };
}

/** Kennung einer Vorschau: Tag, Betrieb, betroffene Personen und alle Zahlen. Ohne Stand — ein Stempel von heute
    macht eine Vorschau nicht ungültig, ein neu fällig gewordener Eintrag schon. */
export function vorschauKennung(heute, mandantId, plan) {
  const inhalt = { heute, mandantId, personen: plan.personen.map((p) => String(p && p.id)).sort(), zahlen: planZahlen(plan) };
  return createHash("sha256").update(stabil(inhalt)).digest("hex").slice(0, 32);
}

/**
 * Der Löschlauf auf der Sicht der Rolle — dieselbe Rechnung und derselbe Rumpf wie die Oberfläche
 * (src/app/aktionen/ausgaben.js, `loeschlauf`, mit mUpd aus src/App.jsx).
 *
 * @param {any} sicht  bestandFuerAntwort(personenAngleichen(gespeichert), s) — was GET dieser Sitzung liefert
 * @param {string} mandantId  Kennung des eigenen Betriebs (aus der Sitzung)
 * @param {string} heute  JJJJ-MM-TT (Berlin)
 * @param {{ vorschau?: true, bestaetigt?: string }} auftrag
 * @returns {{ fehlt: true }
 *   | { ungueltig: string }
 *   | { nichts: true, bericht: string, zahlen: object, kennung: string }
 *   | { vorschau: true, bericht: string, zahlen: object, kennung: string, warnung: string|null }
 *   | { veraltet: true, kennung: string, bericht: string, zahlen: object }
 *   | { virtuell: any, bericht: string, zahlen: object, kennung: string }}
 */
export function loeschlaufVorbereiten(sicht, mandantId, heute, auftrag) {
  const mandanten = sicht && Array.isArray(sicht.mandanten) ? sicht.mandanten : [];
  const i = mandanten.findIndex((x) => x && typeof x === "object" && x.id === mandantId);
  if (i < 0 || !Array.isArray(mandanten[i].personen)) return { fehlt: true };
  const m = mandanten[i];
  /* Ungültige Fristen: nichts löschen, nie mit einem Ersatzwert (wie der Datenschutzlauf, Review WP-26 H1). */
  const ungueltig = aufbewahrungFehler(m.aufbewahrung);
  if (ungueltig) return { ungueltig };
  const plan = vorschau(m, heute);
  const bericht = berichtstext(plan);
  const zahlen = planZahlen(plan);
  const kennung = vorschauKennung(heute, mandantId, plan);
  if (plan.gesamt === 0) return { nichts: true, bericht, zahlen, kennung };
  if (auftrag.vorschau === true) return { vorschau: true, bericht, zahlen, kennung, warnung: plan.warnung || null };
  if (auftrag.bestaetigt !== kennung) return { veraltet: true, bericht, zahlen, kennung };
  /* Wie die Oberfläche: raeumen auf den eigenen Betrieb der Sicht, dann der Eintrag im Betriebsprotokoll (mUpd:
     vorn anhängen, höchstens 200 Einträge, Text „Löschlauf: <Bericht der Vorschau>"). */
  const { mandant } = raeumen(m, heute);
  const eintrag = { id: `l${randomBytes(6).toString("hex")}`, zeit: new Date().toLocaleString("de-DE"), text: `Löschlauf: ${bericht}` };
  const neu = { ...mandant, protokoll: [eintrag, ...(Array.isArray(mandant.protokoll) ? mandant.protokoll : [])].slice(0, 200) };
  const virtuell = { ...sicht, mandanten: mandanten.map((x, j) => (j === i ? neu : x)) };
  return { virtuell, bericht, zahlen, kennung };
}

/* ==========================================================================
   ERSTBEFÜLLUNG UND BINDUNG DER ZUGANGSCODES

   Bis Oktober 2026 entstand ein Raum, indem der erste Client, der mit einem
   Code hineinkam, den ganzen Bestand schrieb — in Demo- und Testräumen den
   Startbestand aus der Oberfläche. Wer als Erster schrieb, bestimmte damit
   Anzahl, Kennungen und Reihenfolge der Betriebe, und Zugangscodes zeigten
   nur über die Position (`betrieb`) auf ihren Betrieb.

   Jetzt:
   - Einen leeren Raum befüllt nur der Betreiber über /api/bestand-anlegen,
     geprüft wie jeder Bestand und — für die Demo — gegen die feste Gestalt
     unten. Normale Rollen bekommen für einen leeren Raum weder einen Code
     (einrichten.mjs) noch einen Schreibweg (rechte.mjs).
   - Ein Zugangscode trägt neben der Position die Kennung seines Betriebs.
     Weichen beide voneinander ab, gilt der Code nicht — dieselbe Prüfung
     wie bei Sitzungen aus einem Konto (arbeitssitzung.mjs).
   ========================================================================== */

import { baueLeerenBetrieb } from "./leerbetrieb.mjs";
import { eigenerMandant } from "./rechte.mjs";

/* Die drei Demobetriebe — Kennungen und Reihenfolge sind fest. Den Inhalt
   erzeugt bis auf Weiteres die Oberfläche (startbestand() in src/App.jsx);
   ein rein serverseitiger Demo-Generator ist ein offener Punkt. */
export const DEMO_KENNUNGEN = ["m-nordwacht", "m-lindenhof", "m-steinbach"];

/** Hat ein Bestand genau die Gestalt der Demo? Gibt null oder den Grund zurück. */
export function demoGestaltPruefen(bestand) {
  const liste = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : null;
  if (!liste) return "Die Demo hat keine Betriebe.";
  if (liste.length !== DEMO_KENNUNGEN.length)
    return `Die Demo hat genau ${DEMO_KENNUNGEN.length} Betriebe, nicht ${liste.length}.`;
  for (let i = 0; i < DEMO_KENNUNGEN.length; i++) {
    const id = liste[i] && liste[i].id;
    if (id !== DEMO_KENNUNGEN[i])
      return `An Stelle ${i} steht „${id}“, erwartet „${DEMO_KENNUNGEN[i]}“.`;
  }
  return null;
}

/* Die kleinen Vorlagen erzeugt der Server selbst — ein Betrieb, ohne
   Beispieldaten, mit dem Raumnamen als Kennung (wie /starten). */
export const VORLAGEN = ["leer", "test", "demo"];

/** Bestand für die Vorlage „leer" oder „test".
    @param {string} vorlage
    @param {{raum?: string, name?: string, branche?: string, land?: string}} [angaben] */
export function vorlageBestand(vorlage, { raum, name, branche, land } = {}) {
  if (vorlage === "test")
    return baueLeerenBetrieb({ name: name || "Testbetrieb", branche: branche || "sonstiges",
      land: land || "HE", raum });
  if (vorlage === "leer")
    return baueLeerenBetrieb({ name: name || "Neuer Betrieb", branche: branche || "sonstiges",
      land: land || "HE", raum });
  return null;
}

/** Zeigt die Position eines Codes oder einer Sitzung noch auf den Betrieb
    mit dieser Kennung? Gibt null zurück oder „mandant-fehlt“ /
    „mandant-verschoben“ — dieselbe Zuordnung wie beim Lesen (eigenerMandant). */
export function mandantPruefen(bestand, betrieb, mandantId) {
  const m = eigenerMandant(bestand, { betrieb });
  if (!m) return "mandant-fehlt";
  if (String(m.id) !== String(mandantId)) return "mandant-verschoben";
  return null;
}

/**
 * Die Bindung eines Zugangscodes beim Anmelden.
 *
 * - Betreiber: kein Betrieb, keine Bindung.
 * - Raum ohne Bestand: nichts zu binden (der Raum ist nicht eingerichtet).
 * - Code mit Kennung: sie muss zur Position passen, sonst kein Zugang.
 * - Code ohne Kennung in einem Raum mit genau einem Betrieb an Position 0:
 *   eindeutig — die Kennung wird ergänzt (migrieren: true).
 * - Code ohne Kennung in einem Raum mit mehreren Betrieben: nicht raten.
 *   Er gilt weiter über die Position; binden lässt er sich nur nach
 *   Prüfung durch einen Menschen (/einrichten/bindung).
 *
 * @returns {{ ok: boolean, mandantId: (string|null), migrieren?: boolean, grund?: string }}
 */
export function codeBindung(bestand, eintrag) {
  if (!eintrag || eintrag.rolle === "betreiber") return { ok: true, mandantId: null };
  const liste = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : [];
  if (!liste.length) return { ok: true, mandantId: null };
  const betrieb = eintrag.betrieb ?? 0;
  if (eintrag.mandantId) {
    const grund = mandantPruefen(bestand, betrieb, eintrag.mandantId);
    return grund ? { ok: false, mandantId: null, grund } : { ok: true, mandantId: eintrag.mandantId };
  }
  if (liste.length === 1 && Number(betrieb) === 0 && liste[0] && typeof liste[0].id === "string")
    return { ok: true, mandantId: liste[0].id, migrieren: true };
  return { ok: true, mandantId: null };
}

/** Den Betrieb für einen neuen Code bestimmen: Position gültig, Kennung
    eindeutig. Gibt { betrieb, mandantId } oder { grund } zurück. */
export function betriebFuerNeuenCode(bestand, betrieb) {
  const liste = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : [];
  if (!liste.length) return { grund: "Raum ist noch nicht eingerichtet." };
  const i = betrieb === undefined || betrieb === null ? 0 : Number(betrieb);
  if (!Number.isInteger(i) || i < 0 || i >= liste.length)
    return { grund: `Einen Betrieb an Stelle ${betrieb} gibt es in diesem Raum nicht.` };
  const id = liste[i] && liste[i].id;
  if (typeof id !== "string" || !id || liste.filter((m) => m && m.id === id).length !== 1)
    return { grund: "Der Betrieb an dieser Stelle hat keine eindeutige Kennung." };
  return { betrieb: i, mandantId: id };
}

/** Trockenlauf für die Bindung alter Codes: was wäre die Zuordnung? */
export function bindungsVorschau(bestand, zugaenge) {
  const liste = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : [];
  return zugaenge.map((z) => {
    const i = Number(z.betrieb ?? 0);
    const m = Number.isInteger(i) && i >= 0 && i < liste.length ? liste[i] : null;
    return { kennung: z.kennung, name: z.name || null, rolle: z.rolle || "kunde",
      betrieb: z.betrieb ?? 0, mandantId: z.mandantId || null, gesperrt: !!z.gesperrt,
      aktuell: m ? { id: m.id || null, name: m.name || null } : null,
      passt: z.mandantId ? !!m && m.id === z.mandantId : null };
  });
}

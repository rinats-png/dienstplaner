/* ==========================================================================
   ERSTEINRICHTUNGSCODE — sichere Ersteinrichtung für neu angelegte Betriebe
   (OPT-1, SI-P4 Option 1, Betreiberentscheidung 2026-11-09)

   Ein über ein Konto angelegter Betrieb hat eine Leitung, aber keinen
   Zugangscode. Unter CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1 öffnet die
   Betriebsauswahl ihn für die Leitung nicht (SI-P4, M1) — der Betrieb war für
   seine Leitung unerreichbar (SI-P4-NACHWEIS, Delta-Auflage 2).

   Der Ersteinrichtungscode ist ein Leitungszugangscode mit einem Vermerk
   `ersteinrichtung: { bis, pruefwert }`. Solange der Vermerk steht:

     - gilt der Code nur bis `bis` (ERSTEINRICHTUNG_STUNDEN); danach, bei
       kaputtem Vermerk oder fehlendem Pfeffer ist er für die Anmeldung
       dasselbe wie ein unbekannter Code — keine Begründung nach außen;
     - taugt er nur zum Einrichten des zweiten Faktors (stand, beginnen,
       bestaetigen). Der Faktor ist für ihn Pflicht, unabhängig vom
       Pflichtschalter: Mit dem Code allein entsteht keine Sitzung, und eine
       begonnene Einrichtung lässt sich mit ihm nicht überschreiben.

   Mit der Bestätigung des Faktors ist die Ersteinrichtung verbraucht
   (betreiber-zweifaktor.mjs, faktorVermerken): Der Vermerk geht weg, an seine
   Stelle tritt `faktorPflicht: true`. Ab dann ist der Code ein gewöhnlicher
   Leitungscode, der nur MIT Faktor eine Sitzung ergibt; Abschalten über das
   Netz ist verweigert. Eine zweite Einrichtung gibt es nicht. Die Frist galt
   der Einrichtung, nicht dem Zugang.

   Übergabe: Der Klartext entsteht hier und verlässt dieses Modul genau
   einmal, im Rückgabewert. Er wird nicht verschickt und nicht gespeichert —
   abgelegt sind nur der gepfefferte Ablageschlüssel (codes.mjs, neuHash) und
   ein an den Raum gebundener Prüfwert. Ohne Pfeffer kein Code: Der zweite
   Faktor ließe sich ohnehin nicht einrichten (SI-P4, N2).
   ========================================================================== */

import { createHmac, randomBytes } from "node:crypto";
import { neuHash, pfeffrig, gleich } from "./codes.mjs";
import { kontoLesenStreng, kontoSchreiben } from "./konten.mjs";

/** Gültigkeit des Ersteinrichtungscodes in Stunden (nur die Einrichtung, nicht der Zugang). */
export const ERSTEINRICHTUNG_STUNDEN = 72;

/** Dasselbe verwechslungsarme Alphabet wie die Zugangscodes (einladungen.mjs). */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const GRENZE = 256 - (256 % ALPHABET.length);
const BLOECKE = 4;

function block() {
  let aus = "";
  while (aus.length < 4) {
    for (const b of randomBytes(8)) {
      if (b >= GRENZE) continue;             // verwerfend statt Modulo: keine Schieflage
      aus += ALPHABET[b % ALPHABET.length];
      if (aus.length === 4) break;
    }
  }
  return aus;
}

/** Vier Blöcke zu vier Zeichen, rund 75 Bit. */
const codeErzeugen = () => Array.from({ length: BLOECKE }, block).join("-");

/** Prüfwert, gebunden an Raum und Code; nur mit Pfeffer. */
function pruefwert(code, raum) {
  const pfeffer = process.env.CENTRIC_PFEFFER;
  if (!pfeffer) return null;
  return "e1:" + createHmac("sha256", pfeffer)
    .update(`ersteinrichtung\u0000${String(raum)}\u0000${String(code)}`).digest("hex");
}

/** Trägt der Zugang einen (noch nicht verbrauchten) Ersteinrichtungsvermerk? */
export function ersteinrichtungOffen(eintrag) {
  return !!(eintrag && typeof eintrag === "object" && "ersteinrichtung" in eintrag
    && eintrag.ersteinrichtung !== null && eintrag.ersteinrichtung !== undefined && eintrag.ersteinrichtung !== false);
}

/**
 * Ist der Ersteinrichtungscode jetzt gültig? Fail-closed: jeder Zweifel ist Nein.
 * Vergleich des Prüfwerts zeitkonstant (codes.mjs, gleich).
 * @param {any} eintrag  der gefundene Zugang
 * @param {unknown} code der eingegebene Code
 * @param {number} [jetzt]
 */
export function ersteinrichtungGueltig(eintrag, code, jetzt = Date.now()) {
  if (!ersteinrichtungOffen(eintrag) || !pfeffrig()) return false;
  const z = eintrag.ersteinrichtung;
  if (!z || typeof z !== "object" || typeof z.pruefwert !== "string" || typeof z.bis !== "string") return false;
  if (eintrag.rolle !== "leitung" || !eintrag.bestand) return false;
  const bis = new Date(z.bis).getTime();
  if (!Number.isFinite(bis) || !(jetzt < bis)) return false;
  const soll = pruefwert(code, eintrag.bestand);
  if (!soll) return false;
  return gleich(soll, z.pruefwert);
}

/**
 * Legt einen Ersteinrichtungscode für die Leitungsperson eines Betriebs an.
 *
 * @param {any} store  Ablage „centric"
 * @param {{raum?: unknown, mandantId?: unknown, betrieb?: number, person?: unknown, name?: unknown,
 *          laeuftAb?: string|null, jetzt?: () => number}} o
 * @returns {Promise<{ok: boolean, grund?: string, code?: string, bis?: string, kennung?: string}>}
 *   `code` ist der einzige Klartext; er steht nirgends sonst.
 */
export async function ersteinrichtungscodeAnlegen(store, { raum, mandantId, betrieb = 0, person, name,
  laeuftAb = null, jetzt = Date.now } = {}) {
  if (!pfeffrig()) return { ok: false, grund: "pfeffer" };
  if (!raum || typeof raum !== "string") return { ok: false, grund: "raum" };
  if (!mandantId || typeof mandantId !== "string") return { ok: false, grund: "betrieb" };
  if (!person || typeof person !== "string") return { ok: false, grund: "person" };
  if (!Number.isInteger(betrieb) || betrieb < 0) return { ok: false, grund: "betrieb" };

  /* Kollision praktisch ausgeschlossen, trotzdem streng geprüft: Ein Lesefehler ist kein „frei". */
  let code = null;
  let schluessel = null;
  for (let i = 0; i < 5 && !code; i += 1) {
    const c = codeErzeugen();
    const s = neuHash(c);
    if (!s) return { ok: false, grund: "pfeffer" };
    if (!(await kontoLesenStreng(store, s))) { code = c; schluessel = s; }
  }
  if (!code || !schluessel) return { ok: false, grund: "kein freier code" };
  const wert = pruefwert(code, raum);
  if (!wert) return { ok: false, grund: "pfeffer" };

  const start = new Date(jetzt());
  const bis = new Date(start.getTime() + ERSTEINRICHTUNG_STUNDEN * 3600000).toISOString();
  await kontoSchreiben(store, schluessel, {
    name: String(name || raum), bestand: raum, rolle: "leitung", person, betrieb, mandantId,
    demo: false, gruppe: null, hinweis: null, angelegt: start.toISOString(),
    ...(laeuftAb ? { laeuftAb } : {}),
    ersteinrichtung: { bis, pruefwert: wert },
  });
  return { ok: true, code, bis, kennung: schluessel.slice(-8) };
}

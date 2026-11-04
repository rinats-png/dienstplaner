/* ==========================================================================
   INTELLIGENCE — FREMDTEXT UND KAPSELUNG (WP-I11)

   Fremdtext ist alles, was nicht aus dem Rechenkern stammt: die Stichworte
   einer Nachricht (F5), eine Frage (F6, F9), Spaltenköpfe und maskierte
   Beispiele einer Tabelle (F7A), ein Regel-Satz (F16). Er geht standard-
   mäßig NICHT ins Faktenpaket; nur Funktionen mit `fremdtext: true` in der
   Positivliste nehmen ihn an, und auch dann nur

   1. bereinigt: Steuerzeichen, Tag-artige Folgen (<…>), Code-Zäune und
      jede Folge, die wie ein Trenner aussieht, werden entfernt;
   2. begrenzt: höchstens 20 Blöcke zu je 4000 Zeichen — länger wird
      abgelehnt, nicht gekürzt (E-8: kein stilles Abschneiden);
   3. geprüft: dieselbe Leck-Prüfung wie das ganze Paket (Klarnamen,
      Gesundheitsbegriffe, Kontaktdaten …) — bei Treffer kein Paket.

   Die Kapselung für den Prompt (kapselnFuerPrompt) zieht je Auftrag einen
   zufälligen Trenner. Die Tags allein sind kein Schutz (CENTRIC-INTELLIGENCE
   6.2); der eigentliche Schutz ist die Architektur: kein Werkzeug, kein
   Datenzugriff des Modells, festes Antwortschema, kein Schreibpfad.
   ========================================================================== */

import { randomBytes } from "node:crypto";
import { KiFehler } from "./fehler.mjs";

export const FREMDTEXT_GRENZEN = Object.freeze({ bloecke: 20, zeichen: 4000 });
const TRENNER_PRAEFIX = "DATEN_";
const TRENNERARTIG = /DATEN_[0-9A-Fa-f]{4,}|<{2,}|>{2,}|\[\[|\]\]|```/g;
const TAGARTIG = /<\/?\s*[A-Za-z_][^<>]{0,60}>/g;
/* Steuerzeichen außer Zeilenumbruch und Tab; unsichtbare Formatzeichen
   (Null-Breite, Richtungswechsel), mit denen sich Text verstecken lässt. */
const BEREICHE = [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f], [0x200b, 0x200f], [0x202a, 0x202e],
  [0x2060, 0x2064], [0xfeff, 0xfeff]];
const hex4 = (n) => n.toString(16).padStart(4, "0");
const STEUER = new RegExp(`[${BEREICHE.map(([a, b]) => `\\u${hex4(a)}-\\u${hex4(b)}`).join("")}]`, "g");

/** Ein Fremdtext, bereinigt; wirft bei Typ- oder Längenverstoß. */
export function fremdtextBereinigen(text) {
  if (typeof text !== "string") throw new KiFehler("KI_EINGABE", "Fremdtext muss Text sein.");
  if ([...text].length > FREMDTEXT_GRENZEN.zeichen) throw new KiFehler("KI_EINGABE", "Fremdtext zu lang.");
  let t = text.normalize("NFC").replace(STEUER, "");
  /* Wiederholt, bis nichts mehr greift — sonst ließe „<<<<“ nach einer Runde ein „<<“ stehen. */
  for (let i = 0; i < 5; i++) {
    const vorher = t;
    t = t.replace(TAGARTIG, " ").replace(TRENNERARTIG, " ");
    if (t === vorher) break;
  }
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

/** Fremdtexte → Blöcke { kapselId, text } für das Faktenpaket. */
export function fremdtextBloecke(texte) {
  if (texte === undefined) return [];
  if (!Array.isArray(texte)) throw new KiFehler("KI_EINGABE", "Fremdtext muss eine Liste sein.");
  if (texte.length > FREMDTEXT_GRENZEN.bloecke) throw new KiFehler("KI_EINGABE", "Zu viele Fremdtexte.");
  return texte.map((t, i) => ({ kapselId: `k${i}`, text: fremdtextBereinigen(t) })).filter((b) => b.text.length > 0);
}

/**
 * Kapselung für den Prompt (WP-I13 benutzt sie beim Zusammenbau): je Aufruf
 * ein zufälliger Trenner; der Text ist bereits bereinigt und enthält keine
 * trennerartige Folge mehr.
 * @param {{ kapselId: string, text: string }[]} bloecke
 * @param {{ zufall?: (n: number) => Uint8Array }} [o]
 */
export function kapselnFuerPrompt(bloecke, o = {}) {
  const zufall = o.zufall || randomBytes;
  const trenner = TRENNER_PRAEFIX + Buffer.from(zufall(12)).toString("hex").toUpperCase();
  const teile = (bloecke || []).map((b) => {
    const t = fremdtextBereinigen(b.text);
    if (t.includes(trenner)) throw new KiFehler("KI_EINGABE", "Trenner im Fremdtext.");
    return `<<${trenner} ${b.kapselId}>>\n${t}\n<</${trenner} ${b.kapselId}>>`;
  });
  return { trenner, text: teile.join("\n") };
}

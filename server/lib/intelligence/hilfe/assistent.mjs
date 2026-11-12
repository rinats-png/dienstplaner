/* ==========================================================================
   HILFE-ASSISTENT (WP-I23, F9) — Ablauf einer Frage

   1  Frage bereinigen (Kontaktdaten, Kontonummern raus) und Grenzen prüfen
   2  Korpus nach der Rolle filtern (Rechtetabelle), dann deterministisch suchen
   3  Antwort NUR über das Gateway (WP-I13) — und nur, wenn
        · der Schalter auf „an“ steht,
        · die Rolle die Funktion F9 auslösen darf (Positivliste),
        · ein Gateway eingehängt ist (gateway.mjs; heute nie),
        · kein Treffer ein Gesundheitsthema berührt (modell: false).
      Zum Gateway gehen ausschließlich die bereinigte Frage und die gefundenen
      Hilfetexte als Fremdtext-Blöcke — kein Plan, keine Person, kein Betrieb.
   4  Jeder Fehler des Gateways (aus, Limit, Leck, Prüfer, Anbieter …) ist für die
      Person dasselbe: „nicht verfügbar“; die gefundenen Hilfetexte bleiben.

   Dieses Modul schreibt nichts, protokolliert nichts und kennt keinen Speicher.
   Die Frage lebt nur in dieser Funktion.
   ========================================================================== */

import { korpusFuerRolle } from "./korpus.mjs";
import { frageBereinigen, suchen, FRAGE_MIN, FRAGE_MAX } from "./suche.mjs";
import { funktionEintrag, rolleDarf } from "../positivliste.mjs";

export const HILFE_TEXT_NICHT_VERFUEGBAR = "nicht verfügbar";
export const HILFE_TEXT_KEIN_TREFFER = "Das steht nicht in der Hilfe.";

/**
 * @param {{ rolle: string, frage: unknown, modus: string, gateway: { ausfuehren: Function } | null, sitzung?: any }} o
 * @returns {Promise<any>}  { ok: true, treffer, passagen, keinTreffer, hinweis?, modell: { status, text?, kennzeichnung? } }
 *                          oder { ok: false, code, text }
 */
export async function hilfeBeantworten({ rolle, frage, modus, gateway, sitzung }) {
  if (typeof frage !== "string") return { ok: false, code: "FRAGE_FORM", text: "Bitte eine Frage als Text stellen." };
  if ([...frage].length > FRAGE_MAX) return { ok: false, code: "FRAGE_LANG", text: `Die Frage ist zu lang (höchstens ${FRAGE_MAX} Zeichen).` };
  const { text: bereinigt } = frageBereinigen(frage);
  if ([...bereinigt].length < FRAGE_MIN) return { ok: false, code: "FRAGE_KURZ", text: "Bitte eine Frage in einem Satz stellen." };

  const korpus = korpusFuerRolle(rolle);
  const treffer = suchen(bereinigt, korpus);
  const nachId = new Map(korpus.map((t) => [t.id, t]));
  const gefunden = treffer.map((t) => /** @type {any} */ (nachId.get(t.id)));
  const passagen = gefunden.map((t) => ({ id: t.id, titel: t.titel, text: t.text }));
  if (!passagen.length) return { ok: true, treffer: 0, passagen, keinTreffer: true, hinweis: HILFE_TEXT_KEIN_TREFFER, modell: { status: "aus" } };

  /* Kein Modell: Schalter nicht „an“ — die Hilfetexte allein, ohne ein Wort von KI. */
  if (modus !== "an") return { ok: true, treffer: passagen.length, passagen, keinTreffer: false, modell: { status: "aus" } };

  const eintrag = funktionEintrag("F9");
  const darfFrage = !!eintrag && rolleDarf(eintrag, rolle);
  const gesundheit = gefunden.some((t) => t.modell === false);
  if (!gateway || typeof gateway.ausfuehren !== "function" || !darfFrage || gesundheit)
    return { ok: true, treffer: passagen.length, passagen, keinTreffer: false, modell: { status: "nicht_verfuegbar", text: HILFE_TEXT_NICHT_VERFUEGBAR } };

  /* Nur Frage und Hilfetexte. Der erste Block ist die Frage, danach die Texte. */
  const fremdtext = [`Frage: ${bereinigt}`, ...gefunden.map((t) => `Hilfetext ${t.id} – ${t.titel}: ${t.text}`)];
  try {
    const r = await gateway.ausfuehren(sitzung, { funktion: "F9", eingabe: { fremdtext } });
    const t = r && r.status === "fertig" && r.ergebnis && typeof r.ergebnis.text === "string" ? r.ergebnis.text.trim() : "";
    const k = r && r.kennzeichnung;
    if (t && k && k.kiGestuetzt === true && k.entwurf === true)
      return { ok: true, treffer: passagen.length, passagen, keinTreffer: false,
        modell: { status: "fertig", text: t, kennzeichnung: { kiGestuetzt: true, entwurf: true, geprueft: k.geprueft === true } } };
  } catch { /* der Text der Ausnahme verlässt das Modul nie: er könnte die Frage tragen */ }
  return { ok: true, treffer: passagen.length, passagen, keinTreffer: false, modell: { status: "nicht_verfuegbar", text: HILFE_TEXT_NICHT_VERFUEGBAR } };
}

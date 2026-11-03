/* ==========================================================================
   WARNEN STATT SPERREN (E-19)

   Keine Regel verhindert die Entscheidung eines berechtigten Menschen.
   Jeder Befund trägt eine Stufe:
   - hinweis:  Information, nichts zu bestätigen
   - achtung:  betriebliche Vorgabe, Tarif oder Personalkonflikt — ein Klick
   - recht:    gesetzliche Vorgabe — „gelesen" ankreuzen, Grund freiwillig

   Hier stehen die reinen Regeln dazu, ohne Oberfläche: Stufen, Gründe,
   das Aufheben einer Abwesenheit für einen Tag und der Eintrag im
   Bestätigungsprotokoll. App.jsx baut Dialog und Mitteilungen darauf.
   Geprüft in pruefungen/warnen.test.js.
   ========================================================================== */
import { addDays } from "./regelwerk.js";
import { BEFUND_KATALOG, sperrtBefund, befundText, protokollFuellstand } from "../server/lib/bestaetigungen.mjs";
export { BEFUND_KATALOG, befundText, protokollFuellstand };

export const WARNSTUFEN = {
  hinweis: { rang: 1, label: "Hinweis", ton: "neutral" },
  achtung: { rang: 2, label: "Achtung", ton: "warn" },
  recht: { rang: 3, label: "Rechtsverstoß", ton: "danger" },
};

/**
 * WARNEN ODER SPERREN — die eine Stelle für die Fachentscheidung (Review
 * WP-10, H1). Je Befundart: true = sperrt (Warndialog ohne „dennoch",
 * Bewerbung, Selbstplanung, Zuschlag, Übernahme, Einsprung und Tausch
 * blockiert), false = warnt (Bestätigung mit Protokoll).
 *
 * Bis zur fachlichen Entscheidung des Nutzers gilt die strenge Variante des
 * Integrationsstands (Kette B): Was dort eine Einteilung verhinderte und
 * rechtlich oder technisch begründet ist, sperrt weiter. Nur, was eine
 * betriebliche Vorgabe oder ein Wunsch ist, wird zur Warnung. Wer das ändern
 * will, ändert es hier — und nur hier (pruefungen/review-wp10.test.js).
 */
/* Die Tabelle steht im Befundkatalog des Servers (server/lib/bestaetigungen.mjs),
   damit Oberfläche und Server dieselbe Entscheidung treffen: Der Server weist
   eine Bestätigung ab, die einen sperrenden Befund wegbestätigen soll.
   Sperrend: nicht im Bestand, harte Schutzbefunde, keine Nacht, kein
   Alleindienst, Höchstzahl Dienste je Woche, gesetzliche Qualifikation,
   Einweisung je Gerät, Ruhezeit unter 11 h. Warnend: betriebliche
   Qualifikation, Ruhezeit über dem Gesetz, Verfügbarkeit, Teilzeit, Dienste
   in Folge, Abwesenheit (der Dialog bietet das Aufheben an). */
export const SPERR_REGELN = Object.freeze(Object.fromEntries(Object.entries(BEFUND_KATALOG).map(([k, v]) => [k, v.sperrt])));
/** Sperrt diese Befundart? Unbekannte sperren (fail-closed). */
export const sperrtArt = sperrtBefund;

/** Rang einer Stufe; Unbekanntes zählt als Hinweis. */
export const stufeRang = (s) => (WARNSTUFEN[s] || WARNSTUFEN.hinweis).rang;

/** Ab „Achtung" muss jemand bestätigen. */
export const istErnst = (b) => !!b && stufeRang(b.stufe) >= 2;

/** Die schwerste Stufe einer Befundliste, oder null bei keinem Befund. */
export function hoechsteStufe(befunde) {
  let aus = null;
  for (const b of befunde || []) if (!aus || stufeRang(b.stufe) > stufeRang(aus)) aus = b.stufe;
  return aus;
}

/** Gesetzliche Mindestruhezeit nach § 5 Abs. 1 ArbZG. Was darüber liegt, ist Tarif oder Betrieb. */
export const RUHEZEIT_GESETZ = 11;

/**
 * Stufe einer zu kurzen Ruhezeit. Unter der gesetzlichen Grenze ist es ein
 * Rechtsverstoß; zwischen Gesetz und der Einstellung des Betriebs (Tarif,
 * Betriebsvereinbarung) eine Achtung. Null, wenn die Ruhezeit reicht.
 */
export function ruhezeitStufe(ruheStunden, einstellung) {
  const grenze = Number(einstellung) || RUHEZEIT_GESETZ;
  if (ruheStunden >= grenze) return null;
  return ruheStunden < Math.min(RUHEZEIT_GESETZ, grenze) ? "recht" : "achtung";
}

/** Gründe, die bei einem bestätigten Rechtsverstoß zur Auswahl stehen. Die Angabe ist freiwillig. */
export const ABWEICHUNG_GRUENDE = [
  { id: "notfall", label: "Notfall oder außergewöhnlicher Fall (§ 14 ArbZG)", feld: "Kurz beschreiben (freiwillig)" },
  { id: "bewilligung", label: "Behördliche Ausnahme oder Bewilligung (§ 15 ArbZG)", feld: "Aktenzeichen" },
  { id: "tarif", label: "Tarifliche Abweichung (§ 7 ArbZG)", feld: "Fundstelle" },
  { id: "sonstiges", label: "Sonstiges", feld: "Kurz beschreiben" },
];

/**
 * Hebt eine Abwesenheit für genau einen Tag auf. Ein Zeitraum wird dabei
 * geteilt; der Rest bleibt, wie er war.
 *
 * @param abwesenheiten Liste { id, personId, von, bis, … }
 * @param neueId        liefert eine Kennung für den abgetrennten Rest
 * @returns { abwesenheiten, aufgehoben } — aufgehoben ist der Eintrag vorher oder null
 */
export function abwesenheitTagAufheben(abwesenheiten, personId, datum, neueId) {
  const aus = [];
  let aufgehoben = null;
  for (const a of abwesenheiten || []) {
    if (!a || a.personId !== personId || a.von > datum || a.bis < datum) { aus.push(a); continue; }
    aufgehoben = a;
    if (a.von < datum) aus.push({ ...a, bis: addDays(datum, -1) });
    if (a.bis > datum) aus.push({ ...a, id: a.von < datum ? neueId() : a.id, von: addDays(datum, 1) });
  }
  return { abwesenheiten: aus, aufgehoben };
}

/**
 * Einträge für das Bestätigungsprotokoll aus dem, was der Warndialog
 * zurückgibt. Nur Einträge mit ernstem Befund (ab „Achtung") werden
 * festgehalten; Hinweise brauchen keine Bestätigung.
 *
 * @param best   { eintraege: [{ personId, datum, dienstId, befunde }], gelesen, grundArt, grundText }
 * @param wer    { personId, name, rolle } der bestätigenden Person
 * @param aktion Kennung der Planungsaktion, z. B. „einsprung"
 * @param opt    { neueId, zeit, regelstand }
 */
export function bestaetigungsEintraege(best, wer, aktion, opt) {
  if (!best || !Array.isArray(best.eintraege)) return [];
  const w = wer || {};
  return best.eintraege
    .map((e) => ({ e, ernst: (e.befunde || []).filter(istErnst) }))
    .filter((x) => x.ernst.length)
    .map(({ e, ernst }) => ({
      id: opt.neueId(), personId: e.personId, datum: e.datum, dienstId: e.dienstId, aktion,
      stufe: hoechsteStufe(ernst),
      /* Nur Kennung und Stufe (Review M1): Der Text steht im Befundkatalog,
         ein Wortlaut des Clients ginge sonst ungeprüft ins Protokoll. */
      befunde: ernst.map((b) => ({ regel: b.regel || "unbekannt", stufe: b.stufe })),
      /* Welche Regeln des Regelregisters dahinterstehen (Kette A, WP-11):
         Kennungen, kein Text; der Betriebsrat sieht sensible neutral. */
      regelIds: [...new Set(ernst.map((b) => b.regelId).filter(Boolean))],
      grundArt: best.grundArt || null, grund: best.grundArt ? String(best.grundText || "").trim() : "",
      ohneGrund: !best.grundArt, gelesen: !!best.gelesen,
      durch: w.name || null, durchId: w.personId || null, rolle: w.rolle || null,
      zeit: opt.zeit, regelstand: opt.regelstand || null, behoben: null }));
}

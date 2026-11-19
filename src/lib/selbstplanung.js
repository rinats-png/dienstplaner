/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { pad, addDays, dim_, dauer, fenster } from "../regelwerk.js";
import { heute } from "./datum.js";
import { sperrtArt, ruhezeitStufe } from "../warnstufen.js";
import { mindestFuer } from "../../server/lib/isteinfrieren.mjs";
import { sollStunden, hindernisBefunde } from "./fachlogik.js";


/* ==========================================================================
   SELBSTPLANUNG

   Die Belegschaft macht den Erstentwurf, die Planung schließt den Rest.
   Das ist mehr als offene Schichten: Es ist ein eigenes Verfahren mit
   Anfang, Ende und klaren Grenzen.

   Der Unterschied zu einem freien Wunschzettel: Wer sich einträgt, bekommt
   den Dienst — sofern die Regeln es hergeben. Geprüft wird beim Eintragen,
   nicht hinterher. Sonst entsteht ein Entwurf, den die Planung ohnehin
   verwerfen muss, und niemand macht ein zweites Mal mit.
   ========================================================================== */

export const SELBSTPLAN_STATUS = {
  vorbereitet: { label: "vorbereitet", ton: null,
    text: "Noch nicht geöffnet. Die Belegschaft sieht nichts." },
  offen: { label: "läuft", ton: "accent",
    text: "Die Belegschaft trägt sich ein." },
  geschlossen: { label: "geschlossen", ton: "warn",
    text: "Keine Eintragungen mehr. Die Planung füllt die Lücken." },
  uebernommen: { label: "übernommen", ton: "ok",
    text: "In den Plan übernommen." },
};

/**
 * Reicht die Ruhezeit zwischen zwei Diensten an aufeinanderfolgenden Tagen?
 * Nutzt dasselbe Zeitfenster wie die Prüfung — sonst würden Selbstplanung
 * und Prüfung zu verschiedenen Ergebnissen kommen.
 */
export function ruhezeitVerletzt(m, davor, danach, datumDavor) {
  const d1 = datumDavor || heute();
  const d2 = addDays(d1, 1);
  const [, ende1] = fenster(d1, davor);
  const [start2] = fenster(d2, danach);
  const ruhe = (start2 - ende1) / 60;
  return ruhe < (m.einstellungen.ruhezeit || 11);
}

/** Die laufende Selbstplanungsrunde, falls es eine gibt. */
export const laufendeRunde = (m) =>
  (m.selbstplanung || []).find((r) => r.status === "offen") || null;

/**
 * Was darf diese Person in dieser Runde noch eintragen?
 * Gibt die Zahl zurück, nicht nur ja oder nein — die Person soll sehen,
 * wie viele Dienste ihr noch fehlen.
 */
export function selbstplanStand(m, runde, personId) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p || !runde) return null;
  const eigene = (runde.eintraege || []).filter((e) => e.personId === personId);
  const ym = runde.monat;

  /* Das Ziel ergibt sich aus dem Vertrag, nicht aus einer festen Zahl.
     Eine Teilzeitkraft mit 20 Stunden soll nicht dieselbe Zahl Dienste
     eintragen wie eine Vollzeitkraft. */
  const soll = sollStunden(m, p, ym);
  const bisher = eigene.reduce((s, e) => {
    const da = m.dienstarten.find((x) => x.id === e.dienstId);
    return s + (da ? dauer(da) : 0);
  }, 0);
  const rest = Math.max(0, soll - bisher);
  const mittel = m.dienstarten.length
    ? m.dienstarten.reduce((s, d) => s + dauer(d), 0) / m.dienstarten.length : 8;

  /* Rohwerte, keine formatierten Zeichenketten — sonst rechnet niemand
     mehr damit, und deutsche Kommazahlen werden zu NaN. */
  return {
    eingetragen: eigene.length,
    stunden: Math.round(bisher * 10) / 10,
    soll: Math.round(soll * 10) / 10,
    fehlt: Math.round(rest * 10) / 10,
    etwaNochDienste: Math.round(rest / (mittel || 8)),
    fertig: rest <= mittel * 0.5,
    zuViel: bisher > soll + mittel,
    eintraege: eigene.sort((a, b) => a.datum.localeCompare(b.datum)),
  };
}

/**
 * Darf sich diese Person an diesem Tag für diesen Dienst eintragen?
 * Prüft dieselben Regeln wie die Ersatzsuche — plus die Grenzen der Runde.
 */
export function darfSelbstEintragen(m, runde, personId, datum, dienstId) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return { darf: false, grund: "Person unbekannt" };
  if (!runde || runde.status !== "offen")
    return { darf: false, grund: "die Runde läuft nicht" };
  if (datum.slice(0, 7) !== runde.monat)
    return { darf: false, grund: "liegt außerhalb des Planungsmonats" };
  if (!imDienst(p, datum)) return { darf: false, grund: "an diesem Tag nicht beschäftigt" };

  const schon = (runde.eintraege || []).find((e) =>
    e.personId === personId && e.datum === datum);
  if (schon) return { darf: false, grund: "an diesem Tag schon eingetragen" };

  const da = m.dienstarten.find((x) => x.id === dienstId);
  if (!da) return { darf: false, grund: "Dienstart unbekannt" };

  /* Seit E-19 hindert keine Regel die Eintragung. Was dagegen spricht,
     wird als Hinweis mitgegeben; die Person darf sich trotzdem eintragen,
     und die Planung entscheidet bei der Übernahme mit dem Warndialog. */
  const hinweise = [];

  /* Ruhezeit gegen die eigenen bisherigen Eintragungen prüfen — nicht nur
     gegen den bestehenden Plan. Sonst trägt sich jemand Nacht und Früh
     hintereinander ein, ohne es zu merken. */
  const eigene = (runde.eintraege || []).filter((e) => e.personId === personId);
  const vortag = eigene.find((e) => e.datum === addDays(datum, -1));
  if (vortag) {
    const dv = m.dienstarten.find((x) => x.id === vortag.dienstId);
    if (dv && ruhezeitVerletzt(m, dv, da, addDays(datum, -1)))
      hinweise.push("zu wenig Ruhezeit nach dem Vortag");
  }
  const folgetag = eigene.find((e) => e.datum === addDays(datum, 1));
  if (folgetag) {
    const df = m.dienstarten.find((x) => x.id === folgetag.dienstId);
    if (df && ruhezeitVerletzt(m, da, df, datum))
      hinweise.push("zu wenig Ruhezeit vor dem Folgetag");
  }

  /* Unter 11 Stunden zu den eigenen Eintragungen sperrt (SPERR_REGELN.ruhezeitGesetz,
     Review H1): Bei der Übernahme wird gegen den Plan geprüft, nicht gegen die
     übrigen Eintragungen derselben Runde. */
  const ruheGesetz = (dA, daA, daB) => {
    const [, aEnde] = fenster(dA, daA);
    const [bStart] = fenster(addDays(dA, 1), daB);
    return ruhezeitStufe((bStart - aEnde) / 60, m.einstellungen.ruhezeit) === "recht";
  };
  const dvG = vortag && m.dienstarten.find((x) => x.id === vortag.dienstId);
  const dfG = folgetag && m.dienstarten.find((x) => x.id === folgetag.dienstId);
  if (sperrtArt("ruhezeitGesetz") && ((dvG && ruheGesetz(addDays(datum, -1), dvG, da)) || (dfG && ruheGesetz(datum, da, dfG))))
    return { darf: false, grund: "weniger als 11 Stunden Ruhezeit zu deiner anderen Eintragung (§ 5 ArbZG)" };

  /* Abwesenheit, Qualifikationen, Ruhezeit zum Plan — dieselbe Prüfung wie
     sonst. Ein sperrender Befund (SPERR_REGELN) hindert die Eintragung. */
  const bef = hindernisBefunde(m, p, datum, da);
  const sperre = bef.find((b) => b.sperrt);
  if (sperre) return { darf: false, grund: sperre.text };
  hinweise.push(...bef.map((b) => b.text));

  /* Ist der Dienst schon voll? Über die Mindestbesetzung hinaus soll sich
     niemand eintragen, ohne es zu wissen. */
  const drin = (runde.eintraege || []).filter((e) =>
    e.datum === datum && e.dienstId === dienstId).length;
  const soll = mindestFuer(m, da, datum);
  if (runde.deckelung !== false && soll > 0 && drin >= soll)
    hinweise.push("dieser Dienst ist bereits gedeckt");

  /* Wer sein Stundenziel deutlich überschreitet, erfährt es */
  const st = selbstplanStand(m, runde, personId);
  if (st && st.zuViel) hinweise.push("dein Stundenziel ist erreicht");

  return hinweise.length
    ? { darf: true, hinweise, offen: Math.max(0, soll - drin) }
    : { darf: true, offen: Math.max(0, soll - drin) };
}

/** Wie viele fehlen noch je Tag und Dienst? Die Karte der Runde. */
export function selbstplanLage(m, runde) {
  if (!runde) return [];
  const [j, mo] = runde.monat.split("-").map(Number);
  const tage = dim_(j, mo - 1);
  const out = [];
  for (let t = 1; t <= tage; t++) {
    const d = `${runde.monat}-${pad(t)}`;
    const dienste = m.dienstarten.filter((da) => !da.posten).map((da) => {
      const drin = (runde.eintraege || []).filter((e) =>
        e.datum === d && e.dienstId === da.id).length;
      const soll = mindestFuer(m, da, d);
      return { dienst: da, drin, soll, fehlt: Math.max(0, soll - drin),
        gedeckt: soll > 0 && drin >= soll };
    });
    out.push({ datum: d, dienste,
      offen: dienste.reduce((s, x) => s + x.fehlt, 0) });
  }
  return out;
}

/** Zusammenfassung für die Planung: Wie weit ist die Runde? */
export function selbstplanFortschritt(m, runde) {
  const lage = selbstplanLage(m, runde);
  const gesamt = lage.reduce((s, t) =>
    s + t.dienste.reduce((a, x) => a + x.soll, 0), 0);
  const belegt = lage.reduce((s, t) =>
    s + t.dienste.reduce((a, x) => a + Math.min(x.drin, x.soll), 0), 0);
  const beteiligt = new Set((runde.eintraege || []).map((e) => e.personId)).size;
  const moeglich = m.personen.filter((p) =>
    imDienst(p, `${runde.monat}-15`) && p.imSchichtdienst !== false).length;
  return { gesamt, belegt, offen: gesamt - belegt,
    anteil: gesamt ? Math.round((belegt / gesamt) * 100) : 0,
    beteiligt, moeglich,
    beteiligung: moeglich ? Math.round((beteiligt / moeglich) * 100) : 0,
    eintraege: (runde.eintraege || []).length };
}

/* ==========================================================================
   LENK- UND RUHEZEITEN — FAHRPERSONAL

   Für Fahrpersonal gilt neben dem Arbeitszeitgesetz eine zweite, strengere
   Ordnung: die Verordnung (EG) 561/2006 und, wo diese nicht greift, die
   deutsche Fahrpersonalverordnung. Sie zählt nicht Arbeitszeit, sondern
   Lenkzeit — und sie unterbricht sie zwingend.

   Was diese Datei kann und was nicht:

   Sie rechnet die Grenzen, die sich aus erfassten Zeiten ergeben: Tages- und
   Wochenlenkzeit, die Doppelwoche, die Unterbrechung nach viereinhalb
   Stunden, die tägliche und die wöchentliche Ruhezeit. Das sind die
   Vorschriften, an denen in der Kontrolle gemessen wird.

   Sie ersetzt kein Kontrollgerät. Der digitale Tachograf zeichnet auf, was
   tatsächlich gefahren wurde; diese Anwendung plant und dokumentiert. Wo
   beides auseinandergeht, gilt der Tachograf. Deshalb rechnet sie mit
   erfassten Zeiten und meldet ausdrücklich „nicht bewertbar", wenn keine
   vorliegen — statt aus dem Dienstplan eine Lenkzeit zu erfinden.

   Und sie entscheidet nicht über den Anwendungsbereich. Ob ein Fahrzeug
   unter die Verordnung fällt, hängt an Masse, Zweck und Ausnahmen; das
   trägt der Betrieb je Fahrzeug ein.

   Rechtsstand: VO (EG) 561/2006 in der Fassung der VO (EU) 2020/1054,
   FPersV. Quelle: https://www.gesetze-im-internet.de/fpersv/
   ========================================================================== */

import { addDays, montag, between } from "./regelwerk.js";

/* --------------------------------------------------------------------------
   DIE GRENZEN

   Alles in Minuten. Die Ausnahmen sind mitgezählt, weil sie der Normalfall
   sind: Zweimal in der Woche darf zehn Stunden gefahren werden, dreimal
   zwischen zwei Wochenruhezeiten darf die Tagesruhe auf neun Stunden
   verkürzt werden.
   -------------------------------------------------------------------------- */
export const GRENZEN = {
  /* Art. 6 Abs. 1: täglich neun Stunden, höchstens zweimal je Woche zehn. */
  tagLenkzeit: 9 * 60,
  tagLenkzeitVerlaengert: 10 * 60,
  tagVerlaengerungenJeWoche: 2,

  /* Art. 6 Abs. 2 und 3: 56 Stunden je Woche, 90 in zwei aufeinander
     folgenden Wochen. */
  wocheLenkzeit: 56 * 60,
  doppelwocheLenkzeit: 90 * 60,

  /* Art. 7: nach viereinhalb Stunden eine Unterbrechung von 45 Minuten,
     teilbar in 15 und danach 30. */
  lenkblockOhnePause: 4.5 * 60,
  unterbrechung: 45,
  unterbrechungErsterTeil: 15,
  unterbrechungZweiterTeil: 30,

  /* Art. 8: elf Stunden täglich, dreimal je Woche neun. */
  tagesruhe: 11 * 60,
  tagesruheVerkuerzt: 9 * 60,
  verkuerzungenJeWoche: 3,

  /* Art. 8 Abs. 6: 45 Stunden wöchentlich, verkürzbar auf 24 mit Ausgleich. */
  wochenruhe: 45 * 60,
  wochenruheVerkuerzt: 24 * 60,
};

const st = (min) => Math.round((min / 60) * 10) / 10;

/**
 * Ist dieser Wert erfasst?
 *
 * Nicht `Number.isFinite(Number(x))` allein: `Number(null)` und
 * `Number("")` ergeben beide 0, und damit hätte ein leeres Feld als
 * „null Minuten gefahren" gegolten. Nichts erfasst ist keine Null.
 */
const erfasstWert = (x) => x !== null && x !== undefined && x !== ""
  && Number.isFinite(Number(x));

/**
 * Ein Tag Fahrpersonal.
 *
 * @param {object} tag
 * @param {string} tag.datum
 * @param {number|null} tag.lenkzeit     Minuten am Steuer
 * @param {number} [tag.arbeitszeit]     sonstige Arbeitszeit in Minuten
 * @param {number} [tag.bereitschaft]    Bereitschaft in Minuten
 * @param {Array<number>} [tag.unterbrechungen]  Pausen in Minuten, in ihrer Reihenfolge
 * @param {number|null} [tag.ruhezeitDavor]      Minuten Ruhe vor Dienstbeginn
 * @param {number} [verlaengerungenBisher]  wie oft in dieser Woche schon über 9 h
 * @param {number} [verkuerzungenBisher]    wie oft in dieser Woche schon unter 11 h Ruhe
 */
export function pruefeTag(tag, verlaengerungenBisher = 0, verkuerzungenBisher = 0) {
  const befunde = [];
  const lenk = tag && tag.lenkzeit;

  if (!erfasstWert(lenk))
    return { urteil: "grau", datum: tag && tag.datum, befunde: [{
      schwere: "info", regel: "Erfassung",
      text: "Für diesen Tag ist keine Lenkzeit erfasst. Ohne sie lässt sich nichts "
        + "beurteilen — der Tachograf ist die Quelle, nicht der Dienstplan." }] };

  const min = Number(lenk);

  /* --- Art. 6 Abs. 1: Tageslenkzeit --- */
  if (min > GRENZEN.tagLenkzeitVerlaengert)
    befunde.push({ schwere: "danger", regel: "Art. 6 Abs. 1 VO (EG) 561/2006",
      text: `${st(min)} Stunden am Steuer. Mehr als ${st(GRENZEN.tagLenkzeitVerlaengert)} `
        + "sind an keinem Tag zulässig." });
  else if (min > GRENZEN.tagLenkzeit) {
    if (verlaengerungenBisher >= GRENZEN.tagVerlaengerungenJeWoche)
      befunde.push({ schwere: "danger", regel: "Art. 6 Abs. 1 VO (EG) 561/2006",
        text: `${st(min)} Stunden am Steuer — die Verlängerung auf zehn Stunden ist in `
          + `dieser Woche bereits ${verlaengerungenBisher}-mal genutzt, zulässig sind `
          + `${GRENZEN.tagVerlaengerungenJeWoche}.` });
    else
      befunde.push({ schwere: "info", regel: "Art. 6 Abs. 1 VO (EG) 561/2006",
        text: `${st(min)} Stunden am Steuer — zulässige Verlängerung, `
          + `${verlaengerungenBisher + 1}. von ${GRENZEN.tagVerlaengerungenJeWoche} in dieser Woche.` });
  }

  /* --- Art. 7: Unterbrechung nach viereinhalb Stunden --- */
  if (min > GRENZEN.lenkblockOhnePause) {
    const pausen = (tag.unterbrechungen || []).filter((p) => Number(p) > 0).map(Number);
    const gesamt = pausen.reduce((a, b) => a + b, 0);
    const einzeln45 = pausen.some((p) => p >= GRENZEN.unterbrechung);
    /* Die Teilung ist nur in dieser Reihenfolge zulässig: erst mindestens
       fünfzehn, dann mindestens dreißig Minuten. */
    let geteiltOk = false;
    for (let i = 0; i < pausen.length - 1 && !geteiltOk; i++) {
      if (pausen[i] >= GRENZEN.unterbrechungErsterTeil) {
        for (let j = i + 1; j < pausen.length; j++) {
          if (pausen[j] >= GRENZEN.unterbrechungZweiterTeil) { geteiltOk = true; break; }
        }
      }
    }
    if (!einzeln45 && !geteiltOk)
      befunde.push({ schwere: "danger", regel: "Art. 7 VO (EG) 561/2006",
        text: `${st(min)} Stunden Lenkzeit, aber keine ausreichende Unterbrechung: `
          + `${gesamt} Minuten erfasst. Verlangt sind 45 Minuten am Stück oder 15 und `
          + "danach 30 Minuten." });
  }

  /* --- Art. 8: tägliche Ruhezeit vor dem Dienst --- */
  const ruhe = tag.ruhezeitDavor;
  if (erfasstWert(ruhe)) {
    const r = Number(ruhe);
    if (r < GRENZEN.tagesruheVerkuerzt)
      befunde.push({ schwere: "danger", regel: "Art. 8 Abs. 2 VO (EG) 561/2006",
        text: `Nur ${st(r)} Stunden Ruhe vor dem Dienst. Weniger als `
          + `${st(GRENZEN.tagesruheVerkuerzt)} Stunden sind nie zulässig.` });
    else if (r < GRENZEN.tagesruhe) {
      if (verkuerzungenBisher >= GRENZEN.verkuerzungenJeWoche)
        befunde.push({ schwere: "danger", regel: "Art. 8 Abs. 4 VO (EG) 561/2006",
          text: `${st(r)} Stunden Ruhe — die Verkürzung ist zwischen zwei Wochenruhezeiten `
            + `bereits ${verkuerzungenBisher}-mal genutzt, zulässig sind `
            + `${GRENZEN.verkuerzungenJeWoche}.` });
      else
        befunde.push({ schwere: "info", regel: "Art. 8 Abs. 4 VO (EG) 561/2006",
          text: `${st(r)} Stunden Ruhe — zulässige Verkürzung, `
            + `${verkuerzungenBisher + 1}. von ${GRENZEN.verkuerzungenJeWoche}.` });
    }
  }

  const schwer = befunde.some((b) => b.schwere === "danger");
  return { urteil: schwer ? "rot" : "gruen", datum: tag.datum, lenkzeit: min, befunde,
    verlaengerung: min > GRENZEN.tagLenkzeit,
    verkuerzung: erfasstWert(ruhe) && Number(ruhe) < GRENZEN.tagesruhe };
}

/**
 * Eine Woche am Stück. Zählt die Ausnahmen mit, weil sie sich aufbrauchen.
 *
 * @param {Array} tage  Einträge wie in pruefeTag, aufsteigend nach Datum
 * @param {number} [lenkzeitVorwoche]  Minuten der Vorwoche für die Doppelwoche
 */
export function pruefeWoche(tage, lenkzeitVorwoche = null) {
  const ergebnisse = [];
  let verlaengerungen = 0, verkuerzungen = 0, summe = 0, erfasst = 0;

  for (const t of tage || []) {
    const r = pruefeTag(t, verlaengerungen, verkuerzungen);
    ergebnisse.push(r);
    if (r.urteil === "grau") continue;
    erfasst++;
    summe += r.lenkzeit;
    if (r.verlaengerung) verlaengerungen++;
    if (r.verkuerzung) verkuerzungen++;
  }

  const befunde = [];
  if (summe > GRENZEN.wocheLenkzeit)
    befunde.push({ schwere: "danger", regel: "Art. 6 Abs. 2 VO (EG) 561/2006",
      text: `${st(summe)} Stunden Lenkzeit in der Woche. Zulässig sind `
        + `${st(GRENZEN.wocheLenkzeit)}.` });

  if (erfasstWert(lenkzeitVorwoche)) {
    const doppel = summe + Number(lenkzeitVorwoche);
    if (doppel > GRENZEN.doppelwocheLenkzeit)
      befunde.push({ schwere: "danger", regel: "Art. 6 Abs. 3 VO (EG) 561/2006",
        text: `${st(doppel)} Stunden in zwei aufeinanderfolgenden Wochen. Zulässig sind `
          + `${st(GRENZEN.doppelwocheLenkzeit)}.` });
  }

  return {
    tage: ergebnisse, summe, erfasst,
    fehlend: (tage || []).length - erfasst,
    verlaengerungen, verkuerzungen, befunde,
    urteil: befunde.some((b) => b.schwere === "danger")
      || ergebnisse.some((r) => r.urteil === "rot") ? "rot"
      : erfasst === 0 ? "grau" : "gruen",
  };
}

/** Die Woche, in der dieses Datum liegt — Montag bis Sonntag. */
export function wochentage(datum) {
  const mo = montag(datum);
  return Array.from({ length: 7 }, (_, i) => addDays(mo, i));
}

/** Wie viele Tage einer Liste tragen keine Erfassung? */
export const luecken = (tage) => (tage || [])
  .filter((t) => !erfasstWert(t && t.lenkzeit)).map((t) => t.datum);

export { between };

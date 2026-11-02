/* ==========================================================================
   RAUMSPERRE — ein Schreiber je Raum, nacheinander

   bestandSchreiben liest den Standzeiger, gleicht ab und schreibt den
   nächsten Stand erst nach mehreren Dateizugriffen. Dazwischen liegen
   `await`s, und an jedem davon kann ein zweiter Schreiber desselben Raums
   weiterlaufen. Zwei Schreiber mit demselben erwarteten Stand sahen dann
   beide Stand N, schrieben beide N+1 — und wer zuletzt die Monatsscherbe
   schrieb, löschte die Arbeit des anderen. Beide bekamen 200. Am Morgen
   eines Schichtwechsels, wenn zwanzig Menschen in derselben Minute in
   dieselbe Monatsscherbe stempeln, war das kein Randfall.

   Hier steht die Reihe dagegen: je Raum ein Versprechen, an das sich jeder
   Schreiber hinten anhängt. Dasselbe Muster wie `nacheinander` in
   accounts.mjs, mit drei Ergänzungen:

   Eine Zeitgrenze. Wer zu lange auf seinen Vorgänger wartet, bekommt einen
   Fehler statt zu hängen. Sein Platz in der Reihe wird dabei sofort frei —
   der Nachfolger wartet weiter auf den Vorgänger, nicht auf den, der
   aufgegeben hat. Damit bleibt der gegenseitige Ausschluss erhalten.

   Wiedereintritt statt Verklemmung. Wer die Sperre eines Raums hält und
   (über bestandSchreiben) noch einmal nach ihr greift, bekommt sie sofort.
   Erkannt wird das über AsyncLocalStorage — am Ablauf, nicht an einem
   Parameter, den jemand vergessen oder fälschen könnte. Ohne das würde ein
   verschachtelter Aufruf auf sich selbst warten, bis die Zeitgrenze ihn
   erlöst. Die Kennzeichnung erlischt mit dem Ende der Arbeit: Ein
   Hintergrundvorgang, der aus der gesperrten Arbeit heraus gestartet wurde
   und später schreibt, reiht sich wieder gewöhnlich ein.

   Nur dieser Prozess. Die Reihe lebt im Speicher. Gegen einen zweiten
   Prozess auf derselben Ablage steht die Prozesssperre beim Start
   (prozesssperre.mjs) — ohne sie wäre diese Datei wertlos.

   Gelesen wird ohne Sperre. Lesen ändert nichts, und eine Stempeluhr, die
   beim Anzeigen auf Schreiber wartet, wäre ein neues Problem.
   ========================================================================== */

import { AsyncLocalStorage } from "node:async_hooks";

/* Fünfzehn Sekunden. Ein Schreibvorgang dauert auf der Dateiablage wenige
   Millisekunden bis eine Zehntelsekunde; selbst fünfzig gleichzeitige Stempel
   sind nach zwei, drei Sekunden durch. Wer länger wartet, wartet auf etwas,
   das hängt — und dann ist eine klare Absage besser als ein offener Browser. */
export const SPERRE_ZEITGRENZE_MS = 15_000;

/** Fehlercode, wenn die Zeitgrenze überschritten wurde. */
export const SPERRE_ZEITGRENZE = "RAUMSPERRE_ZEITGRENZE";

/** raum → das Versprechen, das sich erfüllt, wenn der letzte in der Reihe fertig ist */
const reihe = new Map();

/** Welche Räume der laufende Ablauf gerade hält: Map raum → { aktiv } */
const gehalten = new AsyncLocalStorage();

/** Hält der laufende Ablauf die Sperre dieses Raums? */
export function sperreGehalten(raum) {
  const h = gehalten.getStore();
  const eintrag = h && h.get(String(raum));
  return !!(eintrag && eintrag.aktiv);
}

/** Wie viele Räume gerade eine Reihe haben (nur für Prüfungen und Lage). */
export const offeneReihen = () => reihe.size;

/**
 * Führt `arbeit` unter der Sperre des Raums aus — nach allen, die vorher
 * kamen, und vor allen, die danach kommen.
 *
 * @template T
 * @param {string} raum
 * @param {() => Promise<T>|T} arbeit
 * @param {{ zeitgrenzeMs?: number }} [o]
 * @returns {Promise<T>}
 */
export function unterRaumsperre(raum, arbeit, { zeitgrenzeMs = SPERRE_ZEITGRENZE_MS } = {}) {
  const schluessel = String(raum);

  /* Wiedereintritt: Der Ablauf hält diesen Raum schon. Sofort ausführen —
     warten hieße, auf sich selbst zu warten. */
  if (sperreGehalten(schluessel)) return Promise.resolve().then(arbeit);

  const davor = reihe.get(schluessel) || Promise.resolve();
  /** @type {(wert?: any) => void} */
  let freigeben = () => {};
  const meinEnde = new Promise((r) => { freigeben = r; });
  /* Der Nachfolger wartet auf den Vorgänger UND auf mich. Gebe ich wegen
     der Zeitgrenze vorzeitig frei, wartet er trotzdem auf den Vorgänger. */
  const kette = davor.then(() => meinEnde);
  reihe.set(schluessel, kette);
  kette.then(() => { if (reihe.get(schluessel) === kette) reihe.delete(schluessel); });

  return new Promise((erfuellen, verwerfen) => {
    let aufgegeben = false;
    const uhr = setTimeout(() => {
      aufgegeben = true;
      freigeben();
      const e = /** @type {Error & {code?: string}} */ (new Error(
        `Raumsperre: ${schluessel} nach ${zeitgrenzeMs} ms nicht frei geworden`));
      e.code = SPERRE_ZEITGRENZE;
      verwerfen(e);
    }, zeitgrenzeMs);

    davor.then(async () => {
      if (aufgegeben) return;
      clearTimeout(uhr);
      const aussen = gehalten.getStore();
      const meine = { aktiv: true };
      const neu = new Map(aussen || []);
      neu.set(schluessel, meine);
      try {
        erfuellen(await gehalten.run(neu, arbeit));
      } catch (e) {
        verwerfen(e);
      } finally {
        meine.aktiv = false;
        freigeben();
      }
    });
  });
}

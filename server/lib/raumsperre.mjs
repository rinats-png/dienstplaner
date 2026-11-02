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
   accounts.mjs, mit diesen Ergänzungen:

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

   Die Grenze des Wiedereintritts: Er schützt vor dem Warten auf sich selbst,
   nicht vor Parallelität INNERHALB einer gesperrten Arbeit. Startet die
   Arbeit zwei Schreibvorgänge desselben Raums nebeneinander (etwa mit
   Promise.all), kommen beide sofort durch — und laufen gegeneinander wie
   früher zwei ungesperrte Schreiber. Innerhalb einer gesperrten Arbeit wird
   deshalb immer nacheinander geschrieben (await für await).

   Ein Wächter. Hält eine Arbeit die Sperre länger als WAECHTER_MS, steht
   das im Fehlerprotokoll des Prozesses, und /gesund meldet „nicht gesund"
   (sperrZustand), bis sie fertig ist. Eine hängende Arbeit hält ihren Raum
   auf; alle anderen Schreiber dieses Raums laufen in die Zeitgrenze.

   Ein Schreibstopp. Geht die Prozesssperre verloren (prozesssperre.mjs),
   darf dieser Prozess nichts Neues mehr anfangen: schreibstopp() weist jede
   neue Sperre ab (→ 503), alleFrei() wartet, bis die laufenden fertig sind.

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

/* Dreißig Sekunden hält keine gesunde Arbeit eine Raumsperre. */
export const WAECHTER_MS = 30_000;

/** Fehlercode, wenn die Zeitgrenze überschritten wurde. */
export const SPERRE_ZEITGRENZE = "RAUMSPERRE_ZEITGRENZE";
/** Fehlercode nach schreibstopp(): Dieser Prozess schreibt nichts Neues mehr. */
export const SPERRE_GESTOPPT = "RAUMSPERRE_GESTOPPT";

/** raum → das Versprechen, das sich erfüllt, wenn der letzte in der Reihe fertig ist */
const reihe = new Map();

/** Welche Räume der laufende Ablauf gerade hält: Map raum → { aktiv } */
const gehalten = new AsyncLocalStorage();

/** Wartende und laufende Arbeiten — für alleFrei(). */
let offen = 0;
/** Arbeiten, die länger als der Wächter erlaubt die Sperre halten. */
const haengend = new Set();
/** Grund des Schreibstopps oder null. */
let gestoppt = null;

/** Hält der laufende Ablauf die Sperre dieses Raums? */
export function sperreGehalten(raum) {
  const h = gehalten.getStore();
  const eintrag = h && h.get(String(raum));
  return !!(eintrag && eintrag.aktiv);
}

/** Wie viele Räume gerade eine Reihe haben (nur für Prüfungen und Lage). */
export const offeneReihen = () => reihe.size;

/**
 * Für /gesund: gesund, solange keine Arbeit über dem Wächter hängt und
 * kein Schreibstopp gilt.
 * @returns {{ gesund: boolean, haengend: string[], gestoppt: string|null, offen: number }}
 */
export function sperrZustand() {
  return { gesund: haengend.size === 0 && !gestoppt,
    haengend: [...haengend].map((h) => h.raum), gestoppt, offen };
}

/** Ab jetzt keine neue Sperre mehr — laufende dürfen fertig werden. */
export function schreibstopp(grund = "Schreibstopp") {
  if (!gestoppt) gestoppt = String(grund);
}

/** Nur für Prüfungen: Schreibstopp aufheben. */
export function schreibstoppAufheben() { gestoppt = null; }

/**
 * Wartet, bis keine Arbeit mehr wartet oder läuft — höchstens `maxMs`.
 * @returns {Promise<boolean>} true, wenn alles frei ist
 */
export async function alleFrei(maxMs = SPERRE_ZEITGRENZE_MS) {
  const bis = Date.now() + maxMs;
  while (offen > 0 && Date.now() < bis) await new Promise((r) => setTimeout(r, 20));
  return offen === 0;
}

const fehler = (text, code) => {
  const e = /** @type {Error & {code?: string}} */ (new Error(text));
  e.code = code;
  return e;
};

/**
 * Führt `arbeit` unter der Sperre des Raums aus — nach allen, die vorher
 * kamen, und vor allen, die danach kommen.
 *
 * @template T
 * @param {string} raum
 * @param {() => Promise<T>|T} arbeit
 * @param {{ zeitgrenzeMs?: number, waechterMs?: number }} [o]
 * @returns {Promise<T>}
 */
export function unterRaumsperre(raum, arbeit, { zeitgrenzeMs = SPERRE_ZEITGRENZE_MS,
  waechterMs = WAECHTER_MS } = {}) {
  const schluessel = String(raum);

  /* Wiedereintritt: Der Ablauf hält diesen Raum schon. Sofort ausführen —
     warten hieße, auf sich selbst zu warten. Auch nach einem Schreibstopp:
     Das ist die laufende Arbeit, nicht eine neue. */
  if (sperreGehalten(schluessel)) return Promise.resolve().then(arbeit);

  if (gestoppt)
    return Promise.reject(fehler(`Raumsperre: ${gestoppt} — keine neuen Schreibvorgänge`, SPERRE_GESTOPPT));

  const davor = reihe.get(schluessel) || Promise.resolve();
  /** @type {(wert?: any) => void} */
  let freigeben = () => {};
  const meinEnde = new Promise((r) => { freigeben = r; });
  /* Der Nachfolger wartet auf den Vorgänger UND auf mich. Gebe ich wegen
     der Zeitgrenze vorzeitig frei, wartet er trotzdem auf den Vorgänger. */
  const kette = davor.then(() => meinEnde);
  reihe.set(schluessel, kette);
  kette.then(() => { if (reihe.get(schluessel) === kette) reihe.delete(schluessel); });
  offen += 1;

  return new Promise((erfuellen, verwerfen) => {
    let aufgegeben = false;
    const uhr = setTimeout(() => {
      aufgegeben = true;
      offen -= 1;
      freigeben();
      verwerfen(fehler(`Raumsperre: ${schluessel} nach ${zeitgrenzeMs} ms nicht frei geworden`,
        SPERRE_ZEITGRENZE));
    }, zeitgrenzeMs);

    davor.then(async () => {
      if (aufgegeben) return;
      clearTimeout(uhr);
      const aussen = gehalten.getStore();
      const meine = { aktiv: true };
      const neu = new Map(aussen || []);
      neu.set(schluessel, meine);
      const beginn = Date.now();
      const wache = { raum: schluessel };
      const waechter = setTimeout(() => {
        haengend.add(wache);
        console.error(`Raumsperre: ${schluessel} seit ${waechterMs} ms gehalten — Arbeit hängt?`);
      }, waechterMs);
      waechter.unref();
      try {
        erfuellen(await gehalten.run(neu, arbeit));
      } catch (e) {
        verwerfen(e);
      } finally {
        clearTimeout(waechter);
        if (haengend.delete(wache))
          console.error(`Raumsperre: ${schluessel} nach ${Date.now() - beginn} ms wieder frei`);
        meine.aktiv = false;
        offen -= 1;
        freigeben();
      }
    });
  });
}

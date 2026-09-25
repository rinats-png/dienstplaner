/* ==========================================================================
   AUFRÄUMEN — abgelaufene Testbetriebe löschen

   Ein selbst angelegter Testbetrieb läuft dreißig Tage. Danach weist die
   Anmeldung ab, die Daten bleiben aber liegen: Wer sich meldet, bekommt
   seinen Betrieb wieder. Nach weiteren neunzig Tagen ohne Vertrag ist das
   Interesse erloschen, und die Daten gehören gelöscht — Beschäftigtendaten
   eines Betriebs, der nie Kunde wurde, sind kein Bestand, den man aufhebt.

   Bis hierher geschah das nur von Hand über die Betreiberkonsole. Dieser
   Lauf macht es von selbst, einmal am Tag (server.mjs), und hält sich an
   drei Regeln:

   Nur, was eindeutig ein abgelaufener Testbetrieb ist. Erkannt wird ein
   Raum am Kern (kern:t-…), nie an der Nachfassliste — die ist gekappt und
   nur Anzeige. Gelöscht wird ausschließlich mit Präfix „t-", selbstAngelegt,
   status „test" und einem Ablaufdatum, das plus Aufbewahrung hinter uns
   liegt. Ein Betrieb, den jemand auf „aktiv" gesetzt hat, wird nie
   angefasst — das ist der Riegel für eine spätere Übernahme in einen
   echten Vertrag.

   Und nur, was der Server selbst so angelegt hat. Den Kern schreibt der
   Betrieb mit jedem Speichern zurück; die Vertragsfelder darin sind zwar
   geschützt (rechte.mjs), aber die zweite Quelle sind die Zugangskonten
   (konto:*): Sie entstehen ausschließlich auf dem Server, tragen
   selbstAngelegt und laeuftAb seit /starten und werden nie vom Client
   berührt. Solange es sie gibt, muss eines davon die Merkmale tragen — was
   auch immer der Kern behauptet. Gezählt wird das späteste Ablaufdatum aus
   Kern und Konten; im Zweifel wartet der Lauf.

   Für einen Raum, der überhaupt keinen Zugangscode mehr hat, kann diese
   Bedingung nicht mehr greifen. Das wird der Normalfall, sobald die
   Zugangscodes persönlichen Konten weichen — und es kommt schon heute vor,
   wenn der Betreiber die Codes eines abgelaufenen Raums von Hand löscht; der
   Raum blieb dann für immer liegen. Dann zählt der Kern allein: Seine
   Vertragsfelder kann kein Betrieb zurückschreiben (VERTRAGSFELDER in
   rechte.mjs gehen beim Zusammenführen immer auf den gespeicherten Stand
   zurück, und ein eingeschleuster Betrieb kommt ohne sie an). Ließ sich
   dagegen nur ein einziges Konto nicht lesen, gilt kein Raum als kontenlos:
   „nicht lesbar" darf nie zu „ist nicht da" werden.

   Persönliche Accounts sind hier keine Bestätigung. Eine Mitgliedschaft
   entsteht durch eine Einladung und sagt nichts darüber, ob der Server
   diesen Raum als Testbetrieb angelegt hat.

   Eine Ausnahme, und die schreibt nur der Server selbst: Bevor ein
   bestätigter Raum gelöscht wird, setzt der Lauf die Marke loeschung:<raum>.
   Bricht die Löschung danach ab — die Konten sind womöglich schon weg, der
   Kern steht noch —, gilt beim nächsten Lauf die Marke als Bestätigung.
   Sonst bliebe ein halb gelöschter Raum für immer liegen. Die Marke geht
   mit dem Kern (raumloeschung.mjs).

   Nichts stillschweigend. Jeder Lauf hinterlässt einen Vermerk in der
   Ablage (aufraeumen:letzter) und Zeilen im Protokoll: wie viele geprüft,
   welche gelöscht, was fehlschlug und warum. Ein Raum, bei dem etwas liegen
   blieb, gilt nicht als gelöscht; sein Kern steht noch, und der nächste Lauf
   versucht es erneut (siehe raumloeschung.mjs).

   Nie zweimal zugleich. Eine Sperre in der Ablage hält einen zweiten Lauf
   fern; nach einer Stunde gilt sie als verwaist — ein abgestürzter Prozess
   darf das Aufräumen nicht für immer blockieren.
   ========================================================================== */

import { protokoll } from "./schutz.mjs";
import { raumLoeschen } from "./raumloeschung.mjs";

export const TESTTAGE = 30;
export const AUFBEWAHRUNG_TAGE = 90;
const SPERRE = "aufraeumen:sperre";
export const LOESCHMARKE = (raum) => `loeschung:${raum}`;
const VERMERK = "aufraeumen:letzter";
const SPERRE_ALT_MS = 60 * 60 * 1000;
const TAG_MS = 86400000;

/** Ein gültiger Zeitpunkt aus laeuftAb — oder null. */
const ablaufVon = (wert) => {
  if (wert === null || wert === undefined || wert === "") return null;
  const ms = new Date(wert).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Welche Räume dürfen weg? Reine Funktion, ohne Ablage.
 *
 * @param {Array<{ raum: string, kern: any }>} kerne  Raumname und Kerninhalt
 * @param {Date|number} jetzt
 * @param {{ aufbewahrungTage?: number, konten?: Array<any>,
 *   begonnen?: Iterable<string>, kontenUnvollstaendig?: boolean }} [o]
 *   konten: alle Zugangskonten (Inhalt der konto:*-Einträge). Sie sind die
 *   erste serverseitige Bestätigung.
 *   begonnen: Räume, für die der Server eine Löschung bereits begonnen hat
 *   (Marke loeschung:<raum>); für sie ersetzt die Marke die Konten.
 *   kontenUnvollstaendig: Mindestens ein konto:*-Eintrag ließ sich nicht
 *   lesen. Dann darf die Abwesenheit von Konten nichts bedeuten — der Lauf
 *   wartet lieber.
 * @returns {string[]} Raumnamen, für die alle Bedingungen erfüllt sind
 */
export function zuLoeschendeTestraeume(kerne, jetzt, { aufbewahrungTage = AUFBEWAHRUNG_TAGE, konten = [], begonnen = [], kontenUnvollstaendig = false } = {}) {
  const angefangen = new Set(begonnen || []);
  const t = jetzt instanceof Date ? jetzt.getTime() : Number(jetzt);
  const aus = [];
  for (const { raum, kern } of kerne || []) {
    if (typeof raum !== "string" || !raum.startsWith("t-")) continue;
    /* Der Kern: irgendein Betrieb darin muss der selbst angelegte sein —
       nicht zwingend der erste, ein Client kann die Reihenfolge ändern. Ein
       eingeschleuster Betrieb trägt keine Vertragsfelder (rechte.mjs). */
    const m = kern && Array.isArray(kern.mandanten)
      ? kern.mandanten.find((x) => x && x.selbstAngelegt === true) : null;
    if (!m || m.status !== "test") continue;
    const kernAblauf = ablaufVon(m.laeuftAb);
    if (kernAblauf === null) continue;
    /* Die Konten: mindestens eines des Raums muss die Selbststart-Merkmale
       tragen, die nur /starten schreibt. */
    const eigene = (konten || []).filter((k) => k && k.bestand === raum
      && k.selbstAngelegt === true && ablaufVon(k.laeuftAb) !== null);
    /* Dritte Bestätigung, für die Zeit nach der Umstellung auf persönliche
       Konten: Ein Raum, für den es überhaupt keinen Zugangscode mehr gibt,
       kann seine Bestätigung nicht aus Konten beziehen — sonst bliebe jeder
       migrierte Testbetrieb für immer liegen, und derselbe Fall entsteht schon
       heute, wenn der Betreiber die Codes eines abgelaufenen Raums von Hand
       löscht.
       Dann zählt der Kern. Dessen Vertragsfelder kann kein Betrieb
       zurückschreiben: status, laeuftAb und selbstAngelegt gehen beim
       Zusammenführen immer auf den gespeicherten Stand zurück, und ein
       eingeschleuster Betrieb kommt ohne sie an (VERTRAGSFELDER in
       rechte.mjs). Geschrieben werden sie nur von /starten und vom Betreiber.
       Solange noch irgendein Zugangscode dieses Raums existiert, bleibt die
       strengere alte Regel: Einer von ihnen muss die Merkmale tragen.
       Und ließ sich nur eines der Konten nicht lesen, gilt kein Raum als
       kontenlos — „nicht lesbar" darf nie zu „ist nicht da" werden. */
    const nochCodes = (konten || []).some((k) => k && k.bestand === raum);
    const ohneCodes = !nochCodes && !kontenUnvollstaendig;
    if (!eigene.length && !angefangen.has(raum) && !ohneCodes) continue;
    const ablauf = Math.max(kernAblauf, ...eigene.map((k) => ablaufVon(k.laeuftAb)));
    if (t >= ablauf + aufbewahrungTage * TAG_MS) aus.push(raum);
  }
  return aus;
}

/**
 * Alle Zugangskonten — die erste serverseitige Bestätigung je Raum.
 *
 * Das Präfix heißt konto: mit Doppelpunkt. Ohne ihn lägen auch die
 * Kennungszeiger persönlicher Accounts (kontoId:) in dieser Liste.
 *
 * `unvollstaendig` sagt, ob mindestens eines nicht lesbar war. Die
 * Kandidatenwahl darf aus „keine Konten gefunden" nur dann etwas folgern,
 * wenn wirklich alle gelesen wurden.
 * @returns {Promise<{ konten: Array<any>, unvollstaendig: boolean }>}
 */
async function kontenLesen(store, fehler) {
  const aus = [];
  let unvollstaendig = false;
  const { blobs } = await store.list({ prefix: "konto:" });
  for (const b of blobs) {
    try {
      const k = await store.get(b.key, { type: "json" });
      if (k) aus.push(k);
    } catch (e) {
      /* Ein unlesbares Konto ist ein Fehler des Laufs, kein stilles Nichts —
         ohne die Kennung; der Schlüssel ist eine Prüfsumme. */
      unvollstaendig = true;
      fehler.push({ raum: null, grund: `Konto nicht lesbar: ${String(e && e.message || e).slice(0, 120)}` });
    }
  }
  return { konten: aus, unvollstaendig };
}

/**
 * Ein Lauf. Wirft nie — jedes Ergebnis steht im Rückgabewert und im Vermerk.
 *
 * @param {object} store      Store „centric"
 * @param {object} sitzungen  Store „centric-sitzungen"
 * @param {{ jetzt?: Date|number, aufbewahrungTage?: number }} [o]
 */
export async function testbetriebeAufraeumen(store, sitzungen, { jetzt = new Date(), aufbewahrungTage = AUFBEWAHRUNG_TAGE } = {}) {
  const t = jetzt instanceof Date ? jetzt.getTime() : Number(jetzt);
  const vermerk = { zeit: new Date(t).toISOString(), geprueft: 0, geloescht: [], fehler: [],
    uebersprungen: false };

  /* Sperre: steht eine frische, läuft schon einer. */
  try {
    const sperre = await store.get(SPERRE, { type: "json" }).catch(() => null);
    if (sperre && Number.isFinite(sperre.seit) && t - sperre.seit < SPERRE_ALT_MS) {
      vermerk.uebersprungen = true;
      return vermerk;
    }
    await store.setJSON(SPERRE, { seit: t });
  } catch (e) {
    vermerk.fehler.push({ raum: null, grund: `Sperre: ${String(e && e.message || e).slice(0, 120)}` });
    await vermerkSchreiben(store, vermerk);
    return vermerk;
  }

  try {
    /* Kandidaten nur aus den Kernen der Testräume. Ein Kern, der da ist,
       sich aber nicht lesen lässt, ist ein Fehler dieses Laufs — nicht ein
       Raum, den es nicht gibt. Er wird nicht gelöscht und nicht vergessen. */
    const kerne = [];
    const { blobs } = await store.list({ prefix: "kern:t-" });
    for (const b of blobs) {
      const raum = b.key.slice("kern:".length);
      vermerk.geprueft++;
      let kern;
      try { kern = await store.get(`kern:${raum}`, { type: "json" }); }
      catch (e) {
        const grund = `Kern nicht lesbar: ${String(e && e.message || e).slice(0, 120)}`;
        vermerk.fehler.push({ raum, grund });
        await protokoll("loeschlauf", "system", "fehler", `${raum}: ${grund}`);
        continue;
      }
      if (kern) kerne.push({ raum, kern });
    }
    const { konten, unvollstaendig } = await kontenLesen(store, vermerk.fehler);
    const begonnen = (await store.list({ prefix: "loeschung:" })).blobs
      .map((b) => b.key.slice("loeschung:".length));

    for (const raum of zuLoeschendeTestraeume(kerne, t, { aufbewahrungTage, konten, begonnen,
      kontenUnvollstaendig: unvollstaendig })) {
      let ergebnis;
      try {
        /* Erst die Marke, dann löschen — sonst wäre ein Teilabbruch nach
           den Konten beim nächsten Lauf nicht mehr als Löschung erkennbar. */
        await store.setJSON(LOESCHMARKE(raum), { begonnen: new Date(t).toISOString() });
        ergebnis = await raumLoeschen(store, sitzungen, raum);
      }
      catch (e) { ergebnis = { raum, geloescht: 0, vollstaendig: false,
        fehler: [{ schluessel: "?", grund: String(e && e.message || e).slice(0, 160) }] }; }
      if (ergebnis.vollstaendig) {
        vermerk.geloescht.push(raum);
        await protokoll("loeschlauf", "system", "erfolg", `${raum}: ${ergebnis.geloescht} Einträge`);
      } else {
        const grund = ergebnis.fehler.map((f) => `${f.schluessel}: ${f.grund}`).join("; ").slice(0, 300);
        vermerk.fehler.push({ raum, grund });
        await protokoll("loeschlauf", "system", "fehler", `${raum}: ${grund}`);
      }
    }
  } catch (e) {
    vermerk.fehler.push({ raum: null, grund: String(e && e.message || e).slice(0, 160) });
    await protokoll("loeschlauf", "system", "fehler", vermerk.fehler[vermerk.fehler.length - 1].grund);
  } finally {
    await vermerkSchreiben(store, vermerk);
    await store.delete(SPERRE).catch(() => {});
  }
  return vermerk;
}

async function vermerkSchreiben(store, vermerk) {
  try { await store.setJSON(VERMERK, vermerk); } catch { /* der Lauf darf daran nicht scheitern */ }
}

/** Der letzte Vermerk — für Konsole und Betriebslage. */
export async function letzterLauf(store) {
  return store.get(VERMERK, { type: "json" }).catch(() => null);
}

/* ==========================================================================
   BESTANDSSPEICHER

   Legt einen Betrieb als Kern plus Monatsscherben ab und setzt ihn beim
   Lesen wieder zusammen. Für die Oberfläche bleibt alles wie bisher: Sie
   bekommt einen vollständigen Bestand und schickt einen vollständigen
   zurück.

   Drei Dinge kommen hinzu, die es vorher nicht gab:

   Geschrieben wird nur, was sich geändert hat. Eine Schichtzuweisung im
   August rührt die Scherbe „2026-08" an und sonst nichts.

   Zwei Planer in verschiedenen Monaten stören einander nicht mehr. Der
   Konflikt wird je Scherbe entschieden, nicht auf den ganzen Betrieb.

   Und wenn sie sich doch überschneiden, sagt die Absage, *welcher* Monat
   betroffen ist — statt nur „jemand anderes hat gespeichert".

   ---------------------------------------------------------------------------
   Wie der Abgleich funktioniert

   Für einen Drei-Wege-Abgleich braucht es den gemeinsamen Ausgangspunkt.
   Dafür liegt je Stand ein kleiner Vermerk mit den Fingerabdrücken aller
   Scherben — nicht deren Inhalt, nur je eine Zeichenkette. Der Stand ist
   eine fortlaufende Zahl und zugleich das, was die Oberfläche als ETag
   zurückbekommt.

   Beim Schreiben mit Stand 7 wird der Vermerk 7 geholt. Was der Client
   gegenüber 7 geändert hat, ist seine Arbeit; was der aktuelle Stand
   gegenüber 7 geändert hat, ist die Arbeit eines anderen. Überschneiden
   sich beide nicht, wird zusammengeführt.
   ========================================================================== */

import { zerlegen, zusammensetzen, abdruck, kernSchluessel, scherbenSchluessel }
  from "./scherben.mjs";

const ALT = (raum) => `bestand:${raum}`;
const STAND = (raum, nr) => `stand:${raum}:${nr}`;
const STAND_ZEIGER = (raum) => `stand:${raum}:aktuell`;

/* So viele Standvermerke bleiben liegen. Zehn decken jeden realistischen
   Abstand zwischen Laden und Speichern ab; wer länger offen hat, bekommt
   eine gewöhnliche Konfliktmeldung statt eines Abgleichs. */
const VERMERKE = 10;

/* ---------------------------------------------------------------------------
   Lesen
   --------------------------------------------------------------------------- */

/**
 * Holt den vollständigen Bestand.
 * @returns {Promise<object|null>} — { bestand, stand, zeit, durch } oder null
 */
export async function bestandLesen(store, raum) {
  const kernMit = await store.getWithMetadata(kernSchluessel(raum), { type: "json" })
    .catch(() => null);

  if (!kernMit) {
    /* Noch nicht zerlegt? Dann liegt der Betrieb als ein Blob vor. Er wird
       hier gelesen, aber nicht angefasst — das Zerlegen geschieht beim
       ersten Schreiben, damit ein reiner Lesezugriff nichts verändert. */
    const alt = await store.getWithMetadata(ALT(raum), { type: "json" }).catch(() => null);
    if (!alt) return null;
    return { bestand: alt.data, stand: "alt", zeit: alt.metadata?.zeit || null,
      durch: alt.metadata?.durch || null, unzerlegt: true };
  }

  const { blobs } = await store.list({ prefix: `scherbe:${raum}:` }).catch(() => ({ blobs: [] }));
  const scherben = [];
  for (const b of blobs) {
    const s = await store.get(b.key, { type: "json" }).catch(() => null);
    if (s) scherben.push(s);
  }

  return {
    bestand: zusammensetzen(kernMit.data, scherben),
    stand: String(kernMit.metadata?.stand ?? 0),
    zeit: kernMit.metadata?.zeit || null,
    durch: kernMit.metadata?.durch || null,
  };
}

/* ---------------------------------------------------------------------------
   Schreiben
   --------------------------------------------------------------------------- */

/** Fingerabdrücke aller Scherben eines zerlegten Bestands. */
function abdruecke(zerlegt) {
  const aus = { kern: JSON.stringify(zerlegt.kern) };
  for (const [id, s] of zerlegt.scherben) aus[id] = abdruck(s);
  return aus;
}

/** Welche Kennungen unterscheiden sich zwischen zwei Abdruckmengen? */
function abweichende(a, b) {
  const alle = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const aus = [];
  for (const id of alle) if ((a || {})[id] !== (b || {})[id]) aus.push(id);
  return aus;
}

/** Aus "m1::2026-08" den lesbaren Monat holen. */
export const monatAusKennung = (id) => (String(id).split("::")[1] || id);

/**
 * Schreibt einen Bestand.
 *
 * @param erwarteterStand Der Stand, den die Oberfläche beim Laden bekam.
 *   Fehlt er, wird ohne Abgleich geschrieben (erster Schreibvorgang).
 * @returns {Promise<object>} — bei Erfolg { ok: true, stand, geschrieben,
 *   zusammengefuehrt }, sonst { ok: false, grund: "konflikt", streit,
 *   bestand, stand, zeit, durch }
 */
export async function bestandSchreiben(store, raum, neuerBestand, {
  erwarteterStand = null, durch = "unbekannt",
} = {}) {
  const zeigerRoh = await store.get(STAND_ZEIGER(raum), { type: "json" }).catch(() => null);
  const aktuellerStand = zeigerRoh && Number.isFinite(Number(zeigerRoh.nr))
    ? Number(zeigerRoh.nr) : null;

  const zNeu = zerlegen(neuerBestand);
  const abdNeu = abdruecke(zNeu);

  /* --- Erster Schreibvorgang oder Übernahme eines unzerlegten Betriebs --- */
  if (aktuellerStand === null) {
    return schreibeAlles(store, raum, zNeu, abdNeu, 1, durch, { neuAngelegt: true });
  }

  const abdAktuell = (await store.get(STAND(raum, aktuellerStand), { type: "json" })
    .catch(() => null))?.abdruecke || null;

  /* --- Kein Stand mitgeschickt: schreiben ohne Abgleich --- */
  if (erwarteterStand === null || erwarteterStand === undefined
      || String(erwarteterStand) === String(aktuellerStand)) {
    const geaendert = abdAktuell ? abweichende(abdAktuell, abdNeu) : null;
    return schreibeAlles(store, raum, zNeu, abdNeu, aktuellerStand + 1, durch,
      { nurDiese: geaendert });
  }

  /* --- Der Stand ist veraltet: Drei-Wege-Abgleich --- */
  const abdBasis = (await store.get(STAND(raum, Number(erwarteterStand)), { type: "json" })
    .catch(() => null))?.abdruecke || null;

  const jetzt = await bestandLesen(store, raum);

  if (!abdBasis || !abdAktuell) {
    /* Ohne Ausgangspunkt lässt sich nichts abgleichen — dann gilt die alte,
       strenge Regel. Passiert nur, wenn jemand sehr lange offen hatte. */
    return { ok: false, grund: "konflikt", streit: null,
      bestand: jetzt?.bestand || null, stand: String(aktuellerStand),
      zeit: jetzt?.zeit || null, durch: jetzt?.durch || null };
  }

  const meine = new Set(abweichende(abdBasis, abdNeu));
  const fremde = new Set(abweichende(abdBasis, abdAktuell));
  const streit = [...meine].filter((id) => fremde.has(id));

  if (streit.length) {
    return { ok: false, grund: "konflikt", streit,
      monate: streit.filter((x) => x !== "kern").map(monatAusKennung),
      kernBetroffen: streit.includes("kern"),
      bestand: jetzt?.bestand || null, stand: String(aktuellerStand),
      zeit: jetzt?.zeit || null, durch: jetzt?.durch || null };
  }

  /* Keine Überschneidung: Beide Arbeiten passen nebeneinander. Der aktuelle
     Stand ist die Grundlage, die eigenen Änderungen kommen obendrauf. */
  const zAktuell = zerlegen(jetzt.bestand);
  const kernNimmt = meine.has("kern") ? zNeu.kern : zAktuell.kern;
  const scherben = new Map(zAktuell.scherben);
  for (const id of meine) {
    if (id === "kern") continue;
    const s = zNeu.scherben.get(id);
    if (s) scherben.set(id, s); else scherben.delete(id);
  }

  const zusammen = { kern: kernNimmt, scherben };
  const abdZusammen = abdruecke(zusammen);
  const erg = await schreibeAlles(store, raum, zusammen, abdZusammen,
    aktuellerStand + 1, durch, { nurDiese: abweichende(abdAktuell, abdZusammen) });
  return { ...erg, zusammengefuehrt: [...meine].map(monatAusKennung) };
}

/** Schreibt Kern und Scherben. `nurDiese` begrenzt auf das Geänderte. */
async function schreibeAlles(store, raum, zerlegt, abd, neuerStand, durch, opt = {}) {
  const zeit = new Date().toISOString();
  const nur = opt.nurDiese ? new Set(opt.nurDiese) : null;
  let geschrieben = 0;

  if (!nur || nur.has("kern")) {
    await store.setJSON(kernSchluessel(raum), zerlegt.kern,
      { metadata: { zeit, durch, stand: neuerStand } });
    geschrieben++;
  } else {
    /* Auch wenn der Kern unverändert bleibt, muss der Stand mitwandern —
       er steht in dessen Metadaten. */
    await store.setJSON(kernSchluessel(raum), zerlegt.kern,
      { metadata: { zeit, durch, stand: neuerStand } });
  }

  for (const [id, s] of zerlegt.scherben) {
    if (nur && !nur.has(id)) continue;
    await store.setJSON(scherbenSchluessel(raum, s.mandantId, s.monat), s);
    geschrieben++;
  }

  /* Verwaiste Scherben entfernen — immer, nicht nur beim vollständigen
     Schreiben.

     Das stand zuerst hinter `if (!nur)`, und der Fehler war heimtückisch:
     Wird ein Betrieb ersetzt und der neue Stand berührt einen Monat gar
     nicht, blieb dessen alte Scherbe liegen. Beim nächsten Lesen wurde sie
     mit zusammengesetzt — gelöschte Einträge tauchten wieder auf, und der
     Abgleich meldete Konflikte in Monaten, die niemand angefasst hatte.

     Aufgefallen ist es an genau dieser Stelle: Ein Planer, der nur den
     September bearbeitete, bekam einen Konflikt für den August gemeldet. */
  const { blobs } = await store.list({ prefix: `scherbe:${raum}:` })
    .catch(() => ({ blobs: [] }));
  const behalten = new Set([...zerlegt.scherben.values()]
    .map((s) => scherbenSchluessel(raum, s.mandantId, s.monat)));
  for (const b of blobs) if (!behalten.has(b.key)) await store.delete(b.key).catch(() => {});

  await store.setJSON(STAND(raum, neuerStand), { abdruecke: abd, zeit, durch });
  await store.setJSON(STAND_ZEIGER(raum), { nr: neuerStand, zeit });

  /* Alte Vermerke wegräumen — sie sind klein, aber unbegrenzt wären sie
     trotzdem falsch. */
  for (let n = neuerStand - VERMERKE; n > 0 && n > neuerStand - VERMERKE - 5; n--) {
    await store.delete(STAND(raum, n)).catch(() => {});
  }

  /* Der unzerlegte Altbestand hat ausgedient, sobald der Kern steht. Er
     bleibt als Sicherung liegen, wird aber nicht mehr gelesen. */
  if (opt.neuAngelegt) {
    const alt = await store.get(ALT(raum), { type: "json" }).catch(() => null);
    if (alt) {
      await store.setJSON(`sicherung:${raum}:vor-zerlegung`, alt,
        { metadata: { zeit, durch: "automatisch vor der Zerlegung", automatisch: "ja" } })
        .catch(() => {});
      await store.delete(ALT(raum)).catch(() => {});
    }
  }

  return { ok: true, stand: String(neuerStand), geschrieben };
}

/** Gibt es diesen Betrieb schon? Für die Raumanlage. */
export async function raumBelegt(store, raum) {
  const kern = await store.getMetadata(kernSchluessel(raum)).catch(() => null);
  if (kern) return true;
  const alt = await store.getMetadata(ALT(raum)).catch(() => null);
  return !!alt;
}

/* ==========================================================================
   RAUMLÖSCHUNG — „gelöscht" heißt gelöscht

   Ein Datenraum ist mehr als sein Bestand: Monatsscherben, Standvermerke,
   Sicherungen, Zugangscodes, offene Sitzungen, Sicherungsschlüssel,
   Kalender-Feeds und der Vermerk in der Nachfassliste. Diese Funktion
   räumt alles davon ab — für die Betreiberkonsole (/api/raum-loeschen)
   und für den automatischen Löschlauf abgelaufener Testbetriebe
   (aufraeumen.mjs) gleichermaßen.

   Zwei Regeln, die vorher fehlten:

   Der Kern geht zuletzt. Er ist der Marker, an dem ein Raum erkannt wird.
   Scheitert vorher etwas, bleibt er stehen, und der nächste Lauf findet den
   Raum erneut — statt Scherben und Konten als Waisen zurückzulassen, die
   niemand mehr zuordnen kann.

   Fehler werden gezählt, nicht verschluckt. Was sich nicht löschen ließ,
   steht mit Schlüssel und Grund im Ergebnis; `vollstaendig` ist erst wahr,
   wenn wirklich nichts mehr da ist. Ein zweiter Aufruf auf einen bereits
   gelöschten Raum ist folgenlos.
   ========================================================================== */

/**
 * @typedef {{ raum: string, geloescht: number, vollstaendig: boolean,
 *   fehler: Array<{ schluessel: string, grund: string }> }} Loeschergebnis
 */

const grundVon = (e) => String((e && e.message) || e || "unbekannt").slice(0, 160);

/**
 * Löscht einen Datenraum vollständig.
 * @param {object} store      der Store „centric"
 * @param {object} sitzungen  der Store „centric-sitzungen"
 * @param {string} raum
 * @returns {Promise<Loeschergebnis>}
 */
export async function raumLoeschen(store, sitzungen, raum) {
  const fehler = [];
  let geloescht = 0;

  /* Ein Schlüssel weg — oder ein Eintrag in der Fehlerliste. */
  const weg = async (key, ablage = store) => {
    try { await ablage.delete(key); geloescht++; }
    catch (e) { fehler.push({ schluessel: key, grund: grundVon(e) }); }
  };
  /* Alle Schlüssel mit Präfix weg. Ein Fehler beim Auflisten zählt als
     Fehler des Präfixes — sonst gälte ein unlesbares Verzeichnis als leer. */
  const praefixWeg = async (praefix, ablage = store) => {
    let blobs;
    try { ({ blobs } = await ablage.list({ prefix: praefix })); }
    catch (e) { fehler.push({ schluessel: praefix + "*", grund: grundVon(e) }); return []; }
    for (const b of blobs) await weg(b.key, ablage);
    return blobs;
  };

  /* 1. Scherben, Stände, Sicherungen */
  for (const praefix of [`scherbe:${raum}:`, `stand:${raum}:`, `sicherung:${raum}:`])
    await praefixWeg(praefix);

  /* 2. Zugangscodes des Raums — einzeln abgelegte und die im Sammelblob.
        Gelesen wird gezielt über das Präfix, nicht über alleKonten(): Ein
        unlesbares Konto darf den Lauf nicht beenden, es landet als Fehler. */
  const zuLoeschen = [];
  try {
    const { blobs } = await store.list({ prefix: "konto:" });
    for (const b of blobs) {
      let k = null;
      try { k = await store.get(b.key, { type: "json" }); }
      catch (e) { fehler.push({ schluessel: b.key, grund: grundVon(e) }); continue; }
      if (k && k.bestand === raum) zuLoeschen.push(b.key.slice("konto:".length));
    }
  } catch (e) { fehler.push({ schluessel: "konto:*", grund: grundVon(e) }); }
  for (const schl of zuLoeschen) await weg(`konto:${schl}`);
  try {
    const sammel = await store.get("konten", { type: "json" });
    if (sammel && typeof sammel === "object") {
      const eigene = Object.entries(sammel).filter(([, k]) => k && k.bestand === raum).map(([s]) => s);
      if (eigene.length) {
        for (const s of eigene) delete sammel[s];
        await store.setJSON("konten", sammel);
        geloescht += eigene.length;
      }
    }
  } catch (e) { fehler.push({ schluessel: "konten", grund: grundVon(e) }); }

  /* 3. Sitzungen des Raums — die gewöhnlichen (t:) und die
        Sicherungsschlüssel (sk:). Letztere fehlten bisher: Ein
        Sicherungsschlüssel eines gelöschten Raums las danach ins Leere,
        aber er existierte noch. */
  for (const praefix of ["t:", "sk:"]) {
    let blobs;
    try { ({ blobs } = await sitzungen.list({ prefix: praefix })); }
    catch (e) { fehler.push({ schluessel: `sitzungen ${praefix}*`, grund: grundVon(e) }); continue; }
    for (const b of blobs) {
      let sx = null;
      try { sx = await sitzungen.get(b.key, { type: "json" }); }
      catch (e) { fehler.push({ schluessel: b.key, grund: grundVon(e) }); continue; }
      if (sx && sx.bestand === raum) await weg(b.key, sitzungen);
    }
  }

  /* 4. Kalender-Feeds und ihre Daten */
  try {
    const { blobs } = await store.list({ prefix: "feed:" });
    for (const b of blobs) {
      let f = null;
      try { f = await store.get(b.key, { type: "json" }); }
      catch (e) { fehler.push({ schluessel: b.key, grund: grundVon(e) }); continue; }
      if (f && f.bestand === raum) {
        await weg(b.key);
        await weg(`feeddaten:${b.key.slice("feed:".length)}`);
      }
    }
  } catch (e) { fehler.push({ schluessel: "feed:*", grund: grundVon(e) }); }

  /* 5. Der Vermerk in der Nachfassliste */
  try {
    const liste = await store.get("selbststarts", { type: "json" });
    if (Array.isArray(liste) && liste.some((x) => x && x.raum === raum)) {
      await store.setJSON("selbststarts", liste.filter((x) => !x || x.raum !== raum));
      geloescht++;
    }
  } catch (e) { fehler.push({ schluessel: "selbststarts", grund: grundVon(e) }); }

  /* 6. Zuletzt der alte Ganzbestand, dann der Kern — jeder Schritt nur,
        wenn bis dahin nichts liegen geblieben ist. Der Kern ist der Marker:
        Solange er steht, findet der nächste Lauf den Raum und räumt nach. */
  if (fehler.length === 0) await weg(`bestand:${raum}`);
  if (fehler.length === 0) await weg(`kern:${raum}`);
  /* 7. Die Marke des Löschlaufs (aufraeumen.mjs) — erst, wenn der Kern weg
        ist; bis dahin sagt sie dem nächsten Lauf, dass hier eine begonnene
        Löschung zu Ende zu bringen ist. */
  if (fehler.length === 0) await weg(`loeschung:${raum}`);

  return { raum, geloescht, vollstaendig: fehler.length === 0, fehler };
}

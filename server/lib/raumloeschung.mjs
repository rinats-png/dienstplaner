/* ==========================================================================
   RAUMLÖSCHUNG — „gelöscht" heißt gelöscht

   Ein Datenraum ist mehr als sein Bestand: Monatsscherben, Standvermerke,
   Sicherungen, Zugangscodes, persönliche Mitgliedschaften, Push-Anmeldungen,
   offene Sitzungen, Sicherungsschlüssel, Kalender-Feeds und der Vermerk in
   der Nachfassliste. Diese Funktion räumt alles davon ab — für die
   Betreiberkonsole (/api/raum-loeschen) und für den automatischen Löschlauf
   abgelaufener Testbetriebe (aufraeumen.mjs) gleichermaßen.

   Was ausdrücklich NICHT mitgeht: der Account eines Menschen. Er ist globale
   Identität und gehört keinem Betrieb; wer hier arbeitete, kann woanders
   weiterarbeiten. Gelöscht wird seine Berechtigung in diesem Raum, nicht er.
   Die Namensräume account: und kontoId: werden deshalb nicht angefasst —
   auch nicht gelesen.

   Und der Namensraum der alten Zugangscodes heißt konto: mit Doppelpunkt.
   Ohne ihn träfe die Suche auch kontoId: und der Löschlauf nähme die
   Kennungszeiger persönlicher Accounts mit.

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

import { unterRaumsperre, KONTEN_SPERRE } from "./raumsperre.mjs";
import { journalSchluessel } from "./bestand.mjs";

export { KONTEN_SPERRE };

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

  /* 1. Ein liegengebliebenes Schreibjournal zuerst (bestand.mjs). Bliebe es
        stehen, legte jeder Leser es über das, was noch da ist — und der
        Kern des gelöschten Raums erschiene wieder. Dann Scherben, Stände,
        Sicherungen. */
  try { await store.delete(journalSchluessel(raum)); }                // fehlt es, ist nichts zu tun
  catch (e) { fehler.push({ schluessel: journalSchluessel(raum), grund: grundVon(e) }); }
  for (const praefix of [`scherbe:${raum}:`, `stand:${raum}:`, `sicherung:${raum}:`,
    `journal-beiseite:${raum}:`,           // beiseitegelegte Journale (werkzeug/journal-pruefen.mjs)
    `beiseite:${raum}:`])                  // beiseitegelegte Dateien (werkzeug/ablage-pruefen.mjs)
    await praefixWeg(praefix);

  /* 2. Zugangscodes des Raums — erst der Sammelblob, dann die einzeln
        abgelegten.

        Der Sammelblob „konten" gehört allen Räumen zugleich. Lesen, Ändern
        und Zurückschreiben unter einer festen, raumübergreifenden Sperre
        (KONTEN_SPERRE): Zwei gleichzeitige Löschungen lasen sonst beide den
        alten Blob, und der zweite schrieb die Codes des ersten Raums wieder
        hinein. Reihenfolge stets Raum, dann „@konten" — nie umgekehrt,
        damit sich zwei Löschungen nicht gegenseitig festhalten.

        Erst der Sammelblob, weil die Anmeldung aus ihm Einzelkonten macht
        (kontoVereinzeln, konten.mjs — ebenfalls unter „@konten"). In der
        umgekehrten Reihenfolge konnte eine Anmeldung zwischen den beiden
        Schritten konto:X aus dem noch vollen Sammelblob neu anlegen, und der
        Code zeigte danach auf einen gelöschten Raum. So entsteht ein
        Einzelkonto nur noch vor der Bereinigung des Sammelblobs — und wird
        dann im nächsten Schritt mit gelöscht.

        Die Einzelkonten gezielt über das Präfix, nicht über alleKonten():
        Ein unlesbares Konto darf den Lauf nicht beenden, es landet als
        Fehler. */
  try {
    await unterRaumsperre(KONTEN_SPERRE, async () => {
      const sammel = await store.get("konten", { type: "json" });
      if (sammel && typeof sammel === "object") {
        const eigene = Object.entries(sammel).filter(([, k]) => k && k.bestand === raum).map(([s]) => s);
        if (eigene.length) {
          for (const s of eigene) delete sammel[s];
          await store.setJSON("konten", sammel);
          geloescht += eigene.length;
        }
      }
    });
  } catch (e) { fehler.push({ schluessel: "konten", grund: grundVon(e) }); }
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

  /* 2b. Persönliche Mitgliedschaften dieses Raums — und der Raumindex dazu.

        Der Account selbst bleibt stehen. Er ist globale Identität und kann in
        anderen Betrieben weiterarbeiten; account: und kontoId: werden hier
        nicht einmal aufgelistet. Was zum Raum gehört, ist die Berechtigung in
        ihm, nicht der Mensch.

        Auch eine entzogene Mitgliedschaft geht mit. Der Grabstein belegt, wer
        wann Zugang zu diesem Raum hatte — wenn der Raum rechtmäßig vollständig
        verschwindet, verschwindet auch dieser Beleg.

        Erst die Wahrheit, dann der Index: Bleibt nach mitglied: etwas liegen,
        ist die Berechtigung weg und nur ein Wegweiser zu viel da — und ein
        Wegweiser allein erzeugt keine Mitgliedschaft (accounts.mjs).
        Umgekehrt bestünde die Berechtigung weiter.

        Gesucht wird über beide Seiten, weil sie auseinanderlaufen können: Der
        Raumindex ist der schnelle Weg, aber eine verwaiste Mitgliedschaft ohne
        Index würde er nicht finden. Die Ablage kennt nur Präfixsuche, und der
        Raum steht im Mitgliedschaftsschlüssel hinten — also einmal über alle
        Mitgliedschaften und exakt auf diesen Raum filtern. Exakt heißt Zeichen
        für Zeichen: „t-Kunde" ist nicht „t-kunde", und kein anderer Raum darf
        durch eine lockere Suche mitgehen. */
  try {
    const { blobs } = await store.list({ prefix: "mitglied:" });
    for (const b of blobs) {
      const teile = b.key.split(":");
      if (teile.length === 3 && teile[2] === raum) await weg(b.key);
    }
  } catch (e) { fehler.push({ schluessel: `mitglied:*:${raum}`, grund: grundVon(e) }); }
  await praefixWeg(`raummitglied:${raum}:`);

  /* 2c. Die Push-Anmeldungen des Raums. Sie hängen heute an Raum und Person
        (push:<raum>:<personId>, zustellung.mjs) und blieben bisher liegen: Ein
        gelöschter Raum hinterließ Endgeräte-Schlüssel, die niemand mehr
        zuordnen konnte. Das Präfix endet auf einem Doppelpunkt, damit ein Raum
        „t-ab" nicht die Anmeldungen von „t-a" mitnimmt. */
  await praefixWeg(`push:${raum}:`);
  /* Seit Commit 4 auch push:<raum>:<mandantId>:<personId> (dasselbe Präfix)
     und der Zustellstatus samt Versand-Claims je Mitteilung (versand.mjs). */
  await praefixWeg(`zustellung:${raum}:`);
  await praefixWeg(`zustellclaim:${raum}:`);

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
      if (sx && sx.bestand === raum) {
        await weg(b.key, sitzungen);
        /* Zu einer Sitzung aus einem Zugangscode gehört ihre Aktivität (ta:).
           Sie erlaubt nichts und bleibt als Waise harmlos; hier wird sie
           mitgenommen, ohne die Löschung davon abhängig zu machen. */
        if (praefix === "t:") await sitzungen.delete(`ta:${b.key.slice(2)}`).catch(() => {});
      }
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

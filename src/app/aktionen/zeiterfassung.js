/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import * as SP from "../../speicher.js";

export function aktionenZeiterfassung(k) {
  const { mUpd, melde, ref, setNwDlg, setVerfDlg, sitz, stempelUebernehmen } = k;
  return {
      /* --- Stempeluhr: der Server entscheidet ---

         Vorher rechnete der Browser den Abstand zum Einsatzort und schrieb
         sein eigenes Urteil in den Bestand. Jetzt gehen nur die
         Rohkoordinaten hinaus; Standort, Radius, Uhrzeit und Bewertung
         liegen auf dem Server, und von dort kommt das Ergebnis zurück. */
      /* WP-07: Jedes Stempeln geht zuerst in den Stempelpuffer des Geräts
         (SP.stempelErfassen) und dann hinaus. Kommt es durch, übernimmt
         stempelQuittung die Antwort — dieselbe Stelle für sofort und später
         (Netz zurück, Neustart) gesendete Stempel. Kommt es nicht durch,
         bleibt es vorläufig (offline gespeichert) und wird wiederholt; eine
         Absage des Servers wird mit Grund gemeldet und bleibt sichtbar
         (OfflineStempel). */
      stempeln: async (pid, datum, art, koord, pause = null) => {
        /* Mindestpause (WP-16): ein Hinweis, keine Sperre — gespeichert ist der Stempel ohnehin. */
        const pauseHinweis = (d) => {
          const hw = (d && Array.isArray(d.hinweise) ? d.hinweise : []).filter((x) => x && x.code === "PAUSE");
          if (hw.length) melde(`Ausgestempelt. Hinweis: ${hw[0].text}`);
        };
        try {
          /* Zuerst ablegen (Review L1): Der Stempel ist gesichert, bevor
             irgendetwas anderes ins Netz geht. */
          const ev = await SP.stempelErfassen(datum, art, koord, pause);
          if (!ev) {
            /* Inhaber unbekannt (Antwort eines älteren Servers): direkt wie bisher. */
            await SP.schreibenAbschliessen();
            const erg = await SP.stempeln(datum, art, koord, pause);
            await stempelUebernehmen(pid, [{ datum, art, erg }]);
            pauseHinweis(erg);
            return;
          }
          /* Was noch zum Schreiben ansteht, geht vorher regulär hinaus — sonst
             liefe es nach dem Stempeln mit dem alten ETag in einen 409.
             Höchstens fünf Sekunden gewartet; der Stempel hängt nicht davon ab. */
          await Promise.race([SP.schreibenAbschliessen(), new Promise((ok) => setTimeout(ok, 5000))]);
          const lauf = await SP.stempelSenden({ sofort: true });
          const r = lauf.ergebnisse[ev.id];
          if (r && r.art === "ok") { pauseHinweis(r.daten); return; }
          if (r && r.art === "abgelehnt") { melde(`Stempel abgelehnt: ${r.grund}`); return; }
          if (lauf.angehalten === "abgemeldet" || lauf.angehalten === "fremde-sitzung") {
            melde("Die Anmeldung ist abgelaufen — der Stempel ist auf dem Gerät gespeichert und wird nach der Anmeldung gesendet.");
            return;
          }
          melde(`${art === "start" ? "Einstempeln" : "Ausstempeln"} vorläufig (offline gespeichert) — wird gesendet, sobald Netz da ist.`);
        } catch (e) {
          melde(e.message || "Das Stempeln hat nicht geklappt.");
        }
      },
      /* Ein vom Server quittierter Stempel aus dem Puffer — auch einer, der im
         Hintergrund (Netz zurück, Neustart) gesendet wurde. */
      stempelQuittung: (liste) => {
        const pid = ref.current && ref.current.session ? ref.current.session.personId : null;
        if (!pid || !Array.isArray(liste)) return;
        stempelUebernehmen(pid, liste.filter((q) => q && q.daten)
          .map((q) => ({ datum: q.ev.datum, art: q.ev.art, erg: q.daten }))).catch(() => {});
      },
      stempelErneut: (id) => SP.stempelErneut(id),
      stempelVerwerfen: (id) => SP.stempelVerwerfen(id),
      setzeVerfuegbarkeit: (pid, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, verfuegbarkeit: v } : p) }), "Verfügbarkeit gespeichert"),
      oeffneVerfuegbarkeit: (pid) => setVerfDlg(pid || sitz.person.id),
      oeffneNachweis: (pid, qid) => setNwDlg({ pid, qid }),
      setzeNachweis: (pid, qid, ablauf, datei, vorhanden) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid) return p;
        const liste = (p.qualNachweise || []).filter((x) => x.qualId !== qid);
        /* Ein Nur-Status-Nachweis trägt nur „vorhanden" — nie Datum oder Datei. */
        const q = m.qualifikationen.find((x) => x.id === qid);
        const eintrag = q && q.nurStatus
          ? { qualId: qid, ablauf: null, datei: null, vorhanden: !!vorhanden }
          : { qualId: qid, ablauf, datei };
        return { ...p, qualNachweise: [...liste, eintrag] };
      }) }), "Nachweis gespeichert"),
      /* --- Lenk- und Ruhezeiten ---

         Ein leeres Feld löscht den Wert, statt ihn auf null zu setzen: Was
         nicht erfasst ist, darf nicht als „null Minuten gefahren" gelten.
         Die Unterbrechungen kommen als Text („15, 30") und werden zu einer
         Liste — die Reihenfolge zählt, weil das Gesetz sie vorschreibt. */
      setzeFahrzeit: (pid, datum, feld, wert) => mUpd((m) => {
        const k = `${pid}|${datum}`;
        const alt = (m.fahrzeiten || {})[k] || {};
        const neu = { ...alt };
        if (feld === "unterbrechungen") {
          const liste = String(wert).split(/[^0-9]+/).map(Number).filter((n) => n > 0);
          if (liste.length) neu.unterbrechungen = liste; else delete neu.unterbrechungen;
        } else if (feld === "kennzeichen") {
          const t = String(wert).trim();
          if (t) neu.kennzeichen = t.slice(0, 20); else delete neu.kennzeichen;
        } else {
          const roh = String(wert).trim();
          if (roh === "") delete neu[feld];
          else {
            const n = Number(roh);
            if (!Number.isFinite(n) || n < 0) return m;
            neu[feld] = Math.round(n);
          }
        }
        const alle = { ...(m.fahrzeiten || {}) };
        if (Object.keys(neu).length) alle[k] = neu; else delete alle[k];
        return { ...m, fahrzeiten: alle };
      }, null),

  };
}

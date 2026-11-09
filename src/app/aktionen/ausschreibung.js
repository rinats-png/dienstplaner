/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { uid } from "../../lib/format.js";
import { darfSichBewerben } from "../../lib/offene-schichten.js";
import { anBereichErlaubt, schutzSperre, abwesenheitAm, abwesenheitTagAufheben, bestaetigungVermerken, vorlauf } from "../../lib/fachlogik.js";
import { baueMitteilung } from "../../lib/zustellung.js";
import { fKurz } from "../../lib/datum.js";
import { REGELSTAND } from "../../regelwerk.js";
import * as SP from "../../speicher.js";

export function aktionenAusschreibung(k) {
  const { mUpd, melde, ref, sitz, wer } = k;
  return {
      /* --- Offene Schichten --- */
      schreibeAus: (datum, dienstId, hinweis) => mUpd((m) => {
        if ((m.ausschreibungen || []).some((a) => a.datum === datum
          && a.dienstId === dienstId && a.status === "offen")) {
          melde("Diese Schicht ist bereits ausgeschrieben."); return m;
        }
        const da = m.dienstarten.find((x) => x.id === dienstId);
        const a = { id: uid("as"), datum, dienstId, hinweis: hinweis || "", status: "offen",
          erstellt: new Date().toISOString(),
          durch: `${sitz.person.vorname} ${sitz.person.nachname}`,
          bewerbungen: [], vergebenAn: null };
        /* Nur die unterrichten, die sich tatsächlich bewerben dürfen —
           eine Mitteilung über einen Dienst, den man nicht nehmen kann,
           ist Lärm. */
        /* Die Schichtverantwortung unterrichtet nur ihren Bereich (Commit C1);
           die verantwortende Einheit setzt der Server. */
        const nachr = m.personen
          .filter((p) => { const r = darfSichBewerben({ ...m, ausschreibungen: [...(m.ausschreibungen || []), a] },
            p.id, a); return r.darf && !(r.hinweise || []).length && anBereichErlaubt(sitz, p); })
          .map((p) => baueMitteilung(m, p.id, "offeneSchicht",
            `Offene Schicht am ${fKurz(datum)}`,
            `${da ? da.name : dienstId}${da ? ` · ${da.start}–${da.ende}` : ""}${hinweis ? ` · ${hinweis}` : ""}`,
            "offene")).filter(Boolean);
        melde(`Ausgeschrieben · ${nachr.length} Personen unterrichtet.`);
        return { ...m, ausschreibungen: [a, ...(m.ausschreibungen || [])].slice(0, 500),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Schicht ausgeschrieben"),

      bewirbDich: (asId, text) => mUpd((m) => {
        const a = (m.ausschreibungen || []).find((x) => x.id === asId);
        /* Die eigene Person aus der Sitzung — nie aus dem Betrieb (Commit D1c). */
        const pid = sitz.person.id;
        if (!a) { melde("Ausschreibung nicht gefunden."); return m; }
        const pruef = darfSichBewerben(m, pid, a);
        if (!pruef.darf) { melde(`Bewerbung nicht möglich: ${pruef.grund}.`); return m; }
        const hinw = pruef.hinweise || [];
        melde(hinw.length ? `Bewerbung eingegangen, mit Hinweis: ${hinw[0]}. Die Planung entscheidet.`
          : "Bewerbung eingegangen. Die Planung entscheidet.");
        return { ...m, ausschreibungen: m.ausschreibungen.map((x) => x.id !== asId ? x
          : { ...x, bewerbungen: [...(x.bewerbungen || []),
              { personId: pid, zeit: new Date().toISOString(), text: text || "",
                ...(hinw.length ? { hinweise: hinw } : {}) }] }) };
      }, "Auf offene Schicht beworben"),

      ziehBewerbungZurueck: (asId) => mUpd((m) => {
        const pid = sitz.person.id;
        melde("Bewerbung zurückgezogen.");
        return { ...m, ausschreibungen: (m.ausschreibungen || []).map((x) => x.id !== asId ? x
          : { ...x, bewerbungen: (x.bewerbungen || []).filter((b) => b.personId !== pid) }) };
      }, "Bewerbung zurückgezogen"),

      vergibSchicht: (asId, personId, best) => mUpd((m0) => {
        let m = m0;
        const a = (m.ausschreibungen || []).find((x) => x.id === asId);
        if (!a) { melde("Ausschreibung nicht gefunden."); return m; }
        const p = m.personen.find((x) => x.id === personId);
        const da = m.dienstarten.find((x) => x.id === a.dienstId);
        if (!p) { melde("Person nicht gefunden."); return m; }
        const sperre = schutzSperre(m, p, a.datum, da);
        if (sperre) { melde(`Nicht möglich: ${sperre.text}.`); return m; }
        /* Zwischen Bewerbung und Zuschlag können Tage liegen. Geprüft wird
           im Warndialog vor dem Aufruf; hier wird nicht mehr abgebrochen,
           sondern die Bestätigung festgehalten (E-19). */
        const abw = abwesenheitAm(m, personId, a.datum);
        if (abw && !(best && best.abwesenheitAufheben)) {
          melde(`${p.vorname} ${p.nachname} ist am ${fKurz(a.datum)} abwesend. Erst die Abwesenheit für diesen Tag aufheben.`);
          return m;
        }
        if (abw) m = { ...m, abwesenheiten: abwesenheitTagAufheben(m, personId, a.datum).abwesenheiten };
        m = bestaetigungVermerken(m, best, wer(), "ausschreibung");
        const jetzt = new Date().toLocaleString("de-DE");
        const abgelehnt = (a.bewerbungen || []).filter((b) => b.personId !== personId);
        const nachr = [
          baueMitteilung(m, personId, "planGeaendert",
            `Du hast die Schicht am ${fKurz(a.datum)}`,
            `${da ? da.name : a.dienstId}${da ? ` · ${da.start}–${da.ende}` : ""} — du bist eingeteilt.`,
            "meine"),
          ...abgelehnt.filter((b) => anBereichErlaubt(sitz, m.personen.find((x) => x.id === b.personId)))
            .map((b) => baueMitteilung(m, b.personId, "antragEntschieden",
            `Schicht am ${fKurz(a.datum)} anderweitig vergeben`,
            "Danke für die Meldung — beim nächsten Mal hast du Vorrang.", "offene")),
        ].filter(Boolean);
        melde(`${p.vorname} ${p.nachname} eingeteilt.`);
        return { ...m,
          abweichungen: { ...m.abweichungen, [`${personId}|${a.datum}`]: a.dienstId },
          aenderungen: [{ id: uid("c"), personId, datum: a.datum, von: "-", nach: a.dienstId,
            zeit: jetzt, regelstand: REGELSTAND.version, vorlauf: vorlauf(a.datum) }, ...(m.aenderungen || [])].slice(0, 800),
          ausschreibungen: m.ausschreibungen.map((x) => x.id !== asId ? x
            : { ...x, status: "vergeben", vergebenAn: personId, vergebenZeit: jetzt }),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Offene Schicht vergeben"),

      ziehAusschreibungZurueck: (asId) => mUpd((m) => {
        melde("Ausschreibung zurückgezogen.");
        return { ...m, ausschreibungen: (m.ausschreibungen || []).map((x) => x.id !== asId ? x
          : { ...x, status: "zurueckgezogen" }) };
      }, "Ausschreibung zurückgezogen"),

      /* --- Zustellung --- */
      setzeEmail: (pid, wert) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, email: wert || null } : p) }), null),
      setzeZustellung: (pid, art, weg, an) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, zustellung: { ...(p.zustellung || {}),
          [art]: { ...((p.zustellung || {})[art] || {}), [weg]: an } } } : p) }), null),
      setzeZustellungKanal: (pid, weg, an) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === pid ? { ...p, zustellung: { ...(p.zustellung || {}),
          kanal: { ...((p.zustellung || {}).kanal || {}), [weg]: an } } } : p) }), null),
      pushUmschalten: async (ein) => {
        const pid = (ref.current.session || {}).personId;
        if (!pid) return;
        try {
          if (ein) {
            /* Die Anmeldung selbst liegt nur im Push-Register des Servers;
               an der Person steht ein Merker (Commit 4). */
            await SP.pushEinschalten(pid);
            mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
              p.id === pid ? { ...p, pushSchluessel: true } : p) }), null);
            melde("Mitteilungen eingeschaltet.");
          } else {
            await SP.pushAusschalten(pid);
            mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
              p.id === pid ? { ...p, pushSchluessel: null } : p) }), null);
            melde("Mitteilungen ausgeschaltet.");
          }
        } catch (e) { melde(e.message); }
      },

  };
}

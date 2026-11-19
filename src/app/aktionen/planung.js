/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { checkSchluessel, CHECK_VORLAGEN, neuerCheckpunkt } from "../../lib/checklisten.js";
import { heute, MON, fKurz } from "../../lib/datum.js";
import { uid } from "../../lib/format.js";
import { addDays } from "../../regelwerk.js";
import { imDienst } from "../../../server/lib/fachpruefung.mjs";
import { baueMitteilung } from "../../lib/zustellung.js";
import { laufendeRunde, darfSelbstEintragen } from "../../lib/selbstplanung.js";
import { bestaetigungVermerken, hindernisBefunde, abwesenheitTagAufheben, personTag } from "../../lib/fachlogik.js";
import { stufeRang } from "../../warnstufen.js";
import { grundKennung } from "../../../server/lib/selbstplanung.mjs";
import { notrufEmpfaenger } from "../../lib/notrufe.js";
import * as SP from "../../speicher.js";
import { WECK_STD, verfuegbarkeitsBild } from "../../lib/verfuegbarkeit.js";

export function aktionenPlanung(k) {
  const { mUpd, melde, ref, sitz, upd, wer } = k;
  return {
      /* --- Checklisten --- */
      hakeAb: (personId, datum, dienstId, punktId, notiz) => mUpd((m) => {
        const k = checkSchluessel(personId, datum, dienstId);
        const bisher = (m.checks || {})[k] || {};
        if (bisher[punktId]) {
          /* Bereits abgehakt: Erledigungen sind unveränderlich. Wer sich
             vertan hat, meldet das der Leitung — ein stiller Rückzieher
             würde die Dokumentation wertlos machen. */
          melde("Bereits erledigt. Einträge lassen sich nicht zurücknehmen.");
          return m;
        }
        /* Nachträglich heißt: nach Ablauf des Diensttages */
        const nachtraeglich = datum < heute();
        return { ...m, checks: { ...(m.checks || {}), [k]: { ...bisher,
          [punktId]: { zeit: new Date().toISOString(), nachtraeglich,
            notiz: notiz || "", durch: personId } } } };
      }, "Punkt abgehakt"),

      setzeCheckliste: (dienstId, liste) => mUpd((m) => ({ ...m,
        dienstarten: m.dienstarten.map((d) => d.id === dienstId
          ? { ...d, checkliste: liste } : d) }), "Checkliste geändert"),

      uebernimmCheckVorlage: (dienstId) => mUpd((m) => {
        const branche = (m.pakete || []).find((p) => CHECK_VORLAGEN[p]) || "sicherheit";
        const vorlage = CHECK_VORLAGEN[branche] || [];
        if (!vorlage.length) { melde("Für diese Branche gibt es keine Vorlage."); return m; }
        melde(`${vorlage.length} Punkte übernommen — jetzt anpassen.`);
        return { ...m, dienstarten: m.dienstarten.map((d) => d.id === dienstId
          ? { ...d, checkliste: vorlage.map((c) => ({ ...neuerCheckpunkt(), ...c })) } : d) };
      }, "Vorlage übernommen"),

      /* --- Sondereinsätze --- */
      sondereinsatzAnlegen: (daten) => mUpd((m) => ({ ...m,
        sondereinsaetze: [{ id: uid("se"), ...daten, pause: 0, zugeteilt: [],
          angelegt: new Date().toISOString() }, ...(m.sondereinsaetze || [])].slice(0, 300) }),
        "Sondereinsatz angelegt"),
      sondereinsatzZuteilen: (id, personId) => mUpd((m) => ({ ...m,
        sondereinsaetze: (m.sondereinsaetze || []).map((s) => s.id !== id ? s
          : { ...s, zugeteilt: (s.zugeteilt || []).includes(personId)
              ? (s.zugeteilt || []).filter((x) => x !== personId)
              : [...(s.zugeteilt || []), personId] }) }), "Zuteilung geändert"),

      /* --- Reihenfolge --- */
      setzeReihenfolge: (art) => mUpd((m) => ({ ...m,
        einstellungen: { ...m.einstellungen, reihenfolge: art } }),
        "Reihenfolge geändert"),

      /* --- Selbstplanung --- */
      rundeOeffnen: (monat, tage) => mUpd((m) => {
        if ((m.selbstplanung || []).some((r) => r.status === "offen")) {
          melde("Es läuft bereits eine Runde."); return m; }
        const r = { id: uid("sp"), monat, status: "offen", deckelung: true,
          geoeffnet: new Date().toISOString(),
          schliesst: addDays(heute(), tage || 7), eintraege: [] };
        /* Nur unterrichten, wer im Schichtdienst ist — die Planung selbst
           trägt sich nicht ein. */
        const nachr = m.personen.filter((p) => imDienst(p, heute())
          && p.imSchichtdienst !== false)
          .map((p) => baueMitteilung(m, p.id, "offeneSchicht",
            `Selbstplanung für ${MON[Number(monat.slice(5)) - 1]} ist offen`,
            `Trag dich bis zum ${fKurz(r.schliesst)} für deine Wunschdienste ein.`,
            "selbstplan")).filter(Boolean);
        melde(`Runde offen · ${nachr.length} Personen unterrichtet.`);
        return { ...m, selbstplanung: [r, ...(m.selbstplanung || [])].slice(0, 24),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Selbstplanung geöffnet"),

      selbstEintragen: (datum, dienstId) => mUpd((m) => {
        const r = laufendeRunde(m);
        const pid = sitz.person ? sitz.person.id : null;   // die Sitzung liegt über dem Betrieb, nicht in ihm
        if (!r || !pid) return m;
        const pruef = darfSelbstEintragen(m, r, pid, datum, dienstId);
        if (!pruef.darf) { melde(`Nicht möglich: ${pruef.grund}.`); return m; }
        /* Mit Hinweis eintragen ist erlaubt (E-19). Der Eintrag trägt den
           Hinweis, die Planung entscheidet bei der Übernahme. */
        if ((pruef.hinweise || []).length) melde(`Eingetragen, mit Hinweis: ${pruef.hinweise[0]}. Die Planung entscheidet.`);
        return { ...m, selbstplanung: m.selbstplanung.map((x) => x.id !== r.id ? x
          : { ...x, eintraege: [...(x.eintraege || []),
              { personId: pid, datum, dienstId, zeit: new Date().toISOString(),
                ...((pruef.hinweise || []).length ? { hinweise: pruef.hinweise } : {}) }] }) };
      }, "Selbst eingetragen"),

      selbstAustragen: (datum) => mUpd((m) => {
        const r = laufendeRunde(m);
        const pid = sitz.person ? sitz.person.id : null;   // die Sitzung liegt über dem Betrieb, nicht in ihm
        if (!r || !pid) return m;
        return { ...m, selbstplanung: m.selbstplanung.map((x) => x.id !== r.id ? x
          : { ...x, eintraege: (x.eintraege || []).filter((e) =>
              !(e.personId === pid && e.datum === datum)) }) };
      }, "Eintrag zurückgenommen"),

      rundeSchliessen: (id) => mUpd((m) => ({ ...m,
        selbstplanung: (m.selbstplanung || []).map((r) => r.id === id
          ? { ...r, status: "geschlossen", geschlossen: new Date().toISOString() } : r) }),
        "Selbstplanung geschlossen"),

      rundeUebernehmen: (id, best) => mUpd((m0) => {
        let m = m0;
        const r = (m.selbstplanung || []).find((x) => x.id === id);
        if (!r) return m;
        /* Jeder Eintrag wird zur Abweichung. Vor dem Übernehmen wird noch
           einmal geprüft — zwischen Eintragung und Übernahme können Tage
           liegen. Nichts wird mehr still verworfen: Was die Planung im
           Warndialog nicht ausgewählt hat, steht mit Grund an der Runde.
           Ohne Auswahl (best fehlt) gilt die alte Vorauswahl: alles
           Regelkonforme. */
        const gewaehlt = best && Array.isArray(best.indizes) ? new Set(best.indizes) : null;
        const neu = { ...m.abweichungen };
        let uebernommen = 0;
        const nicht = [];
        /* Der Grund ist eine Kennung, nie der Befundtext (Review K1): Der
           Rundenkopf geht an Beschäftigte und Schichtverantwortung; ein
           Wortlaut wie „MuSchG § 5“ oder „abwesend (Krank)“ verriete Dritten
           Gesundheitsangaben (server/lib/selbstplanung.mjs). */
        const nichtEintrag = (e, grund) => ({ personId: e.personId, datum: e.datum, dienstId: e.dienstId, grund });
        (r.eintraege || []).forEach((e, i) => {
          const p = m.personen.find((x) => x.id === e.personId);
          const da = m.dienstarten.find((x) => x.id === e.dienstId);
          if (!p || !da) { nicht.push(nichtEintrag(e, "fehlt")); return; }
          const bef = hindernisBefunde(m, p, e.datum, da);
          const ernst = bef.filter((b) => stufeRang(b.stufe) >= 2);
          const sperre = bef.find((b) => b.sperrt);
          if (sperre) { nicht.push(nichtEintrag(e, grundKennung(sperre))); return; }
          const nehmen = gewaehlt ? gewaehlt.has(i) : ernst.length === 0;
          if (!nehmen) { nicht.push(nichtEintrag(e, ernst.length ? grundKennung(ernst[0]) : "auswahl")); return; }
          if (bef.some((b) => b.art === "abwesend") && best && best.abwesenheitAufheben)
            m = { ...m, abwesenheiten: abwesenheitTagAufheben(m, e.personId, e.datum).abwesenheiten };
          neu[`${e.personId}|${e.datum}`] = e.dienstId;
          uebernommen++;
        });
        m = bestaetigungVermerken(m, best, wer(), "selbstplanung");
        melde(`${uebernommen} übernommen${nicht.length ? `, ${nicht.length} nicht übernommen` : ""}.`);
        return { ...m, abweichungen: neu,
          selbstplanung: m.selbstplanung.map((x) => x.id === id
            ? { ...x, status: "uebernommen", uebernommenAm: new Date().toISOString(),
                uebernommen, verworfen: nicht.length, nichtUebernommen: nicht } : x) };
      }, "Selbstplanung übernommen"),

      /* --- Notruf --- */
      notrufSenden: (art, notiz) => mUpd((m) => {
        const pid = sitz.person ? sitz.person.id : null;   // die Sitzung liegt über dem Betrieb, nicht in ihm
        const p = m.personen.find((x) => x.id === pid);
        if (!p) return m;
        const empf = notrufEmpfaenger(m, pid, heute());
        const t = personTag(m, p, heute());
        const da = t && t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : null;
        const n = { id: uid("nr"), personId: pid, art, notiz: notiz || "",
          zeit: new Date().toISOString(), datum: heute(),
          dienst: da ? da.name : null, ort: da ? da.ort : null,
          empfaenger: empf.map((x) => x.id), bestaetigt: null };
        /* Die Mitteilungen an die Empfänger erzeugt und verschickt der Server
           beim Speichern (Commit 4) — auch für Beschäftigte, deren Notruf
           vorher ohne E-Mail und Push blieb. */
        melde("Hilferuf erfasst. Er ist für die zuständigen Rollen in CENTRIC sichtbar.");
        return { ...m, notrufe: [n, ...(m.notrufe || [])].slice(0, 200) };
      }, "Notruf abgesetzt"),

      notrufBestaetigen: (id) => mUpd((m) => ({ ...m,
        notrufe: (m.notrufe || []).map((n) => n.id === id
          ? { ...n, bestaetigt: new Date().toISOString(),
              durch: `${sitz.person.vorname} ${sitz.person.nachname}` } : n) }),
        "Notruf bestätigt"),

      /* --- Kalender, Weckzeit, Verfügbarkeit --- */
      kalenderEinrichten: async () => {
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        const pid = (ref.current.session || {}).personId;
        if (!mm || !pid) return;
        const pp = mm.personen.find((x) => x.id === pid);
        try {
          const d = await SP.kalenderEinrichten(pid, pp && pp.kalenderGeheim);
          /* WP-24: Der Feed rechnet der Server bei jedem Abruf live aus dem Bestand
             (server/lib/kalenderfeed.mjs) — das Gerät schickt keine Termine mehr. */
          mUpd((m) => ({ ...m, personen: m.personen.map((x) => x.id === pid
            ? { ...x, kalenderVerweis: d.verweis, kalenderGeheim: d.geheim,
                kalenderStand: new Date().toISOString() } : x) }), null);
        } catch (e) { melde(e.message); }
      },
      kalenderLoeschen: async () => {
        const pid = (ref.current.session || {}).personId;
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        const pp = mm && mm.personen.find((x) => x.id === pid);
        try { if (pp && pp.kalenderGeheim) await SP.kalenderLoeschen(pp.kalenderGeheim); }
        catch (e) { /* auch bei Fehler lokal entfernen */ }
        mUpd((m) => ({ ...m, personen: m.personen.map((x) => x.id === pid
          ? { ...x, kalenderVerweis: null, kalenderGeheim: null } : x) }), null);
      },
      setzeWeckzeit: (teil) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id
          ? { ...x, weckzeit: { ...WECK_STD, ...(x.weckzeit || {}), ...teil } } : x) }), null),
      verfuegbarkeitTeilen: (tage) => {
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        const pid = (ref.current.session || {}).personId;
        if (!mm || !pid) return;
        const bild = verfuegbarkeitsBild(mm, pid, tage || 14);
        const zeilen = bild.map((t) => `${fKurz(t.datum)}  ${t.frei ? "frei" : t.lage}`);
        const text = ["Wann ich Zeit habe:", "", ...zeilen, "",
          "Erstellt mit CENTRIC · zeigt nur frei oder belegt"].join("\n");
        try { navigator.clipboard.writeText(text); } catch { /* egal */ }
      },

      /* --- Betreiber: Mandanten --- */
      mandantVermerken: (eintrag) => upd((d) => ({ ...d,
        angelegteMandanten: [eintrag, ...(d.angelegteMandanten || [])].slice(0, 200) }),
        "Mandant angelegt"),

  };
}

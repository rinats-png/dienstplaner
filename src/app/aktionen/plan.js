/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { einheitAm, einheitDienst, imDienst } from "../../../server/lib/fachpruefung.mjs";
import { darfEinheit, vorlauf, istFreigegeben, personTag, schutzSperre, abwesenheitAm, bestaetigungVermerken, abwArt, abwesenheitTagAufheben, freigabeStand, planAbbild, EXPORT_STAND, lohnexportRueckfrage, VORLAGEN, genehmigungsStand, antragUmsetzen, eintrittPruefen, eintrittUebernehmen } from "../../lib/fachlogik.js";
import { uid } from "../../lib/format.js";
import { REGELSTAND, addDays } from "../../regelwerk.js";
import { baueMitteilung } from "../../lib/zustellung.js";
import { fKurz, heute, MON } from "../../lib/datum.js";
import * as SP from "../../speicher.js";
import { korrekturMeldung } from "../../ansichten/korrekturen.jsx";
import { monatText } from "../../../server/lib/monatsabschluss.mjs";
import { nurKorrekturGrund, bestaetigungsGrund } from "../../istdaten.js";
import { rolle } from "../../lib/rollen.js";
import { krankSchrittErlaubt } from "../../../server/lib/krankmeldung.mjs";

/** Datenreview PR #130 (5): Zugehörigkeit null-sicher sortieren — ab null/leer („von Anfang an“) vor jedem
 *  Datum, gleiche Werte in der bisherigen Reihenfolge (stabile Sortierung, deterministisch). Nicht exportiert:
 *  jeder Export dieser Datei gilt als Aktionsfabrik (pruefungen/wp39-app-aufbau.test.js). */
const abSchluessel = (z) => (z && typeof z.ab === "string" ? z.ab : "");
const zugehoerigkeitSortiert = (liste) => [...liste]
  .sort((a, b) => (abSchluessel(a) < abSchluessel(b) ? -1 : abSchluessel(a) > abSchluessel(b) ? 1 : 0));

export function aktionenPlan(k) {
  const { jetzt, mUpd, melde, ref, serverstandNachladen, setKrank, setView, setVorbelegung, sitz, upd, wer } = k;
  /* `akt` ist beim Aufbau noch nicht fertig: Glieder erst beim Aufruf aus k lesen. */
  const akt = { get stempelKorrigieren() { return k.akt.stempelKorrigieren; } };
  /* RB-2: Krankmeldung ohne Recht zur endgültigen Bestätigung — über den Server, Status „eingegangen“. */
  const krankMeldenServer = async (pid, von, bis, notiz) => {
    try {
      const erg = await SP.krankmeldung("melden", { personId: pid, von, bis, ...(notiz ? { notiz } : {}) });
      await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
        : { ...m, krankmeldungen: [{ id: erg.fall.id, personId: pid, von, bis, ...(notiz ? { notiz } : {}), status: erg.fall.status },
          ...(m.krankmeldungen || [])] }) }));
      melde("Krankmeldung eingegangen · wirksam, sobald Planung oder Leitung sie endgültig bestätigt.");
      return true;
    } catch (e) {
      melde((e && e.message) || "Die Krankmeldung ließ sich nicht speichern.");
      return false;
    }
  };
  return {
      /* --- Plan --- */
      setzeAbweichung: (pid, d, dienstId) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid); if (!p) return m;
        const eid = einheitAm(p, d);
        if (!darfEinheit({ db: ref.current, mandant: m, person: sitz.person, rolle: "kunde" }, eid)) { melde("Keine Berechtigung für diesen Bereich."); return m; }
        const plan = eid ? einheitDienst(m, eid, d) : null;
        const ab = { ...m.abweichungen }, key = `${pid}|${d}`;
        const vorher = ab[key] !== undefined ? ab[key] : plan;
        if ((dienstId === "-" && !plan) || dienstId === plan) delete ab[key]; else ab[key] = dienstId;
        const nachher = ab[key] !== undefined ? ab[key] : plan;
        let next = { ...m, abweichungen: ab };
        if (vorher !== nachher) {
          const vl = vorlauf(d);
          next = { ...next, aenderungen: [{ id: uid("c"), personId: pid, datum: d, von: vorher || "-",
            nach: nachher || "-", zeit: new Date().toLocaleString("de-DE"), regelstand: REGELSTAND.version, vorlauf: vl }, ...(next.aenderungen || [])].slice(0, 800) };
          if (istFreigegeben(m, d.slice(0, 7))) {
            const nam = (x) => x === "-" || !x ? "frei" : (m.dienstarten.find((y) => y.id === x) || {}).name || x;
            next = { ...next, nachrichten: [baueMitteilung(next, pid, "planGeaendert", `Dienst am ${fKurz(d)} geändert`,
              `${nam(vorher)} → ${nam(nachher)}${vl < 14 ? ` · ${vl} Tage Vorlauf` : ""}`, "meine", d), ...(next.nachrichten || [])].slice(0, 400) };
          }
        }
        return next;
      }, null),

      /* --- Krankmeldung, Ersatz, Freigabe, Zeiten, Einschränkungen --- */
      oeffneKrankmeldung: (pid, von, bis) => setKrank({ pid: pid || "",
        von: von || heute(), bis: bis || von || heute() }),
      oeffneAbwesenheit: (pid, art, von, bis) => { setView("antraege");
        setVorbelegung({ pid, art: art || "urlaub", von: von || heute(),
          bis: bis || von || heute() }); },
      /* RB-2 (Betreiberentscheidung 2026-11-11): Wer nicht endgültig bestätigen darf (Beschäftigte,
         Schichtverantwortung), meldet über POST /api/krankmeldung — der Fall ist „eingegangen“ und wird
         erst mit der endgültigen Bestätigung durch Planung oder Leitung wirksam. Planung und Leitung tragen
         die Abwesenheit wie bisher unmittelbar ein (das ist selbst die endgültige Bestätigung). */
      krankmelden: (pid, von, bis, notiz) => (!krankSchrittErlaubt(sitz && sitz.person && sitz.person.rolle, "endgueltig")
        ? krankMeldenServer(pid, von, bis, notiz) : k.akt.krankUnmittelbar(pid, von, bis, notiz)),
      krankBestaetigen: async (id, schritt) => {
        try {
          const erg = await SP.krankmeldung(schritt, { id });
          await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, krankmeldungen: (m.krankmeldungen || []).map((f) => (f && f.id === id ? { ...f, status: erg.fall.status } : f)) }) }));
          melde(schritt === "endgueltig" ? "Krankmeldung endgültig bestätigt · im Plan eingetragen."
            : "Krankmeldung vorläufig bestätigt · noch nicht wirksam.");
          return true;
        } catch (e) {
          melde((e && e.message) || "Der Schritt ließ sich nicht speichern.");
          return false;
        }
      },
      krankUnmittelbar: (pid, von, bis, notiz) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid);
        const betroffen = [];
        for (let d = von; d <= bis; d = addDays(d, 1)) if (personTag(m, p, d).dienstId) betroffen.push(d);
        const plan = m.personen.filter((x) => ["leitung", "planer"].includes(x.rolle)
          || (x.rolle === "subplaner" && x.bereich === einheitAm(p, von)));
        const nachr = plan.map((x) => baueMitteilung(m, x.id, "planGeaendert",
          `Krankmeldung: ${p.vorname} ${p.nachname}`,
          `${fKurz(von)} bis ${fKurz(bis)} · ${betroffen.length} betroffene Dienste${notiz ? ` · ${notiz}` : ""}`,
          "lage")).filter(Boolean);
        melde(`Krankmeldung erfasst · ${betroffen.length} betroffene Dienste.`);
        return { ...m, abwesenheiten: [...m.abwesenheiten, { id: uid("a"), personId: pid, art: "krank", von, bis, notiz }],
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Krankmeldung erfasst"),
      setzeEinsprung: (pid, d, dienstId, best) => mUpd((m0) => {
        let m = m0;
        const p = m.personen.find((x) => x.id === pid);
        const da = m.dienstarten.find((x) => x.id === dienstId);
        if (!p) { melde("Person nicht gefunden."); return m; }
        const sperre = schutzSperre(m, p, d, da);
        if (sperre) { melde(`Nicht möglich: ${sperre.text}.`); return m; }
        /* Eine bestehende Abwesenheit schlägt jede Einteilung — sonst wird
           die Zuteilung angenommen, wirkt aber nicht. Gesperrt wird nicht:
           Der Warndialog bietet an, die Abwesenheit für diesen Tag
           aufzuheben (best.abwesenheitAufheben). */
        const abw = abwesenheitAm(m, pid, d);
        if (abw && !(best && best.abwesenheitAufheben)) {
          melde(`${p.vorname} ${p.nachname} ist am ${fKurz(d)} ${abwArt(abw.art).label.toLowerCase()}. Erst die Abwesenheit für diesen Tag aufheben.`);
          return m;
        }
        let nachrAbw = [];
        if (abw) {
          const r = abwesenheitTagAufheben(m, pid, d);
          m = { ...m, abwesenheiten: r.abwesenheiten };
          nachrAbw = [baueMitteilung(m, pid, "antragEntschieden", `${abwArt(abw.art).label} am ${fKurz(d)} aufgehoben`,
            `Die Planung hat dich für ${da ? da.name : dienstId} eingeteilt. Der übrige Zeitraum bleibt bestehen.`, "meine")].filter(Boolean);
        }
        const vorher = personTag(m, p, d).dienstId;
        /* War die Person ohne die Abwesenheit ohnehin für diesen Dienst
           geplant, ist sie mit dem Aufheben wieder eingeteilt — das ist
           kein „bereits eingeteilt", und die Bestätigung gehört ins Protokoll. */
        if (vorher === dienstId && !abw) { melde(`${p.nachname} ist bereits eingeteilt.`); return m; }
        melde(abw && vorher === dienstId
          ? `${p.vorname} ${p.nachname} für ${fKurz(d)} wieder eingeteilt.`
          : vorher
            ? `${p.vorname} ${p.nachname} für ${fKurz(d)} umgeteilt.`
            : `${p.vorname} ${p.nachname} für ${fKurz(d)} eingeteilt.`);
        m = bestaetigungVermerken(m, best, wer(), "einsprung");
        if (nachrAbw.length) m = { ...m, nachrichten: [...nachrAbw, ...(m.nachrichten || [])].slice(0, 400) };
        return { ...m,
          abweichungen: { ...m.abweichungen, [`${pid}|${d}`]: dienstId },
          einspruenge: [{ id: uid("s"), personId: pid, datum: d, dienstId, zeit: new Date().toLocaleString("de-DE") }, ...(m.einspruenge || [])].slice(0, 500),
          aenderungen: [{ id: uid("c"), personId: pid, datum: d, von: "-", nach: dienstId,
            zeit: new Date().toLocaleString("de-DE"), regelstand: REGELSTAND.version, vorlauf: vorlauf(d) }, ...(m.aenderungen || [])].slice(0, 800),
          nachrichten: [baueMitteilung(m, pid, "planGeaendert", `Zusätzlicher Dienst am ${fKurz(d)}`,
            `${da ? da.name : dienstId} · ${da ? `${da.start}–${da.ende}` : ""} · als Ersatz eingeteilt`, "meine", d), ...(m.nachrichten || [])].slice(0, 400) };
      }, "Ersatz eingeteilt"),
      freigeben: (ym2) => mUpd((m) => {
        const alt = freigabeStand(m, ym2);
        const stand = (alt ? alt.stand : 0) + 1;
        const wer = `${sitz.person.vorname} ${sitz.person.nachname}`;
        const nachr = m.personen.filter((p) => imDienst(p, heute())).map((p) =>
          baueMitteilung(m, p.id, "planFreigegeben",
            `Dienstplan ${MON[Number(ym2.slice(5)) - 1]} ${ym2.slice(0, 4)} freigegeben`,
            stand === 1 ? "Der Plan ist ab sofort verbindlich."
              : `Stand ${stand} — der Plan wurde nach Änderungen erneut freigegeben.`,
            "meine")).filter(Boolean);
        melde(`Plan freigegeben · Stand ${stand}.`);
        return { ...m, freigaben: { ...(m.freigaben || {}), [ym2]: { stand, zeit: new Date().toLocaleString("de-DE"), durch: wer } },
          planstaende: { ...(m.planstaende || {}), [ym2]: planAbbild(m, ym2) },
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Plan freigegeben"),
      /* Die eigene Zeit bestätigt der Server über einen eigenen Weg und sagt,
         ob es geklappt hat; erst dann wird hier nachgezogen. Vorher verschwand
         der Tag aus „Zeiten bestätigen", auch wenn der Server die Angabe
         verworfen hatte. Für andere Personen (Leitung, Planung) bleibt es beim
         gewöhnlichen Speichern. */
      /* Lange Dienste zur Prüfung (WP-17, W1): Die Leitung bestätigt die
         gestempelte Zeit; danach zählt sie im Konto. Vermerk im Protokoll. */
      /* Stempelkorrektur (WP-06): Die Ist-Zeit eines gestempelten Tages
         ändert nur der Server, als Ereignis mit Grund am Stempel — das
         Original bleibt. Übernommen wird, was er gespeichert hat. */
      stempelKorrigieren: async (pid, d, start, ende, grund, pause) => {
        try {
          const erg = await SP.stempelKorrektur(pid, d, start, ende, grund, pause);
          const k = `${pid}|${d}`;
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: erg.eintrag },
              erfassung: { ...(m.erfassung || {}), [k]: erg.erfassung } }) }));
          melde(korrekturMeldung(erg));
          return true;
        } catch (e) {
          melde(e.message || "Die Korrektur ließ sich nicht speichern.");
          return false;
        }
      },
      /* Korrekturworkflow (WP-14): Antrag stellen, zurückziehen, entscheiden. Übernommen wird,
         was der Server gespeichert hat. */
      /* Monatsabschluss (WP-16): Abschließen (Leitung, Planung) und Wiederöffnen (nur Leitung, mit Grund)
         laufen über den Server; übernommen wird der Eintrag, den er gespeichert hat. Offene Prüffälle:
         einmal nachfragen, dann ausdrücklich „trotzdem“. */
      monatAbschliessen: async (monat) => {
        const uebernehmen = (erg) => serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
          : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
        try {
          await uebernehmen(await SP.monatsabschluss("abschliessen", monat));
          melde("Monat abgeschlossen — Ist-Zeiten, Stempel, Korrekturen und Anträge dieses Monats sind gesperrt.");
          return true;
        } catch (e) {
          if (e && e.code === "ABSCHLUSS_PRUEFFAELLE" && typeof window !== "undefined" && window.confirm(e.message)) {
            try {
              await uebernehmen(await SP.monatsabschluss("abschliessen", monat, { trotzPrueffaellen: true }));
              melde("Monat abgeschlossen — die offenen Prüffälle stehen im Verlauf.");
              return true;
            } catch (e2) { melde(e2.message || "Der Monat ließ sich nicht abschließen."); return false; }
          }
          melde((e && e.message) || "Der Monat ließ sich nicht abschließen.");
          return false;
        }
      },
      monatWiederoeffnen: async (monat, grund) => {
        try {
          const erg = await SP.monatsabschluss("wiederoeffnen", monat, { grund });
          await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
          melde("Monat wiedergeöffnet — Korrekturen stehen weiter als Ereignis am Stempel.");
          return true;
        } catch (e) {
          melde((e && e.message) || "Der Monat ließ sich nicht wiederöffnen.");
          return false;
        }
      },
      /* Lohnexport bestätigen (WP-16 Nachtrag, Betreiberentscheidung 2026-11-03): Wann, Wer, Prüfsumme — sperrt einfaches Wiederöffnen. */
      lohnexportBestaetigen: async (monat, trotzVormonat = null) => {
        /* Bestätigt wird genau die ausgegebene Datei (WP-16, Nachtrag dritter Review H-2): Prüfsumme, Abschluss, Revision
           und Zeilen-Prüfsumme des Standes, aus dem sie entstand. Der Server vergleicht mit dem heutigen Abschluss.
           Der ausgegebene Stand gilt nur in dieser Sitzung — nach dem Neuladen erst die Lohnausgabe neu erzeugen
           (sonst EXPORTSTAND_FEHLT, fail-closed). */
        const schluessel = `${sitz.mandant.id}|${monat}`;
        const exportStand = EXPORT_STAND.get(schluessel);
        if (!exportStand) { melde(`Bitte zuerst die Lohnausgabe für ${monatText(monat)} erzeugen — bestätigt wird genau die ausgegebene Datei.`); return false; }
        /* Offene oder geänderte Vormonate (Nachtrag vierter Review A-2): Die Rückfrage nennt sie; ohne Überstimmung
           (Kategorie und Begründung aus dem Monatsabschluss) bestätigt der Server nicht. */
        const rf = lohnexportRueckfrage(sitz.mandant, monat);
        if (rf.vormonate && !trotzVormonat) { melde(`${rf.text} Bestätigen nur mit Kategorie und Begründung.`); return false; }
        if (!window.confirm(`Lohnexport für ${monatText(monat)} bestätigen (Revision ${exportStand.revision}, Prüfsumme ${String(exportStand.abdruck).slice(0, 12)})?`
          + (rf.vormonate ? `\n\n${rf.text}\nBegründung: ${trotzVormonat.grund}` : "")
          + "\n\nDanach lässt sich der Monat nicht mehr einfach wiederöffnen — Änderungen brauchen den Korrekturprozess.")) return false;
        try {
          const erg = await SP.monatsabschluss("lohnexport", monat, { exportStand, trotzVormonat });
          EXPORT_STAND.delete(schluessel);
          await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
          melde("Lohnexport bestätigt.");
          return true;
        } catch (e) {
          if (e && (e.code === "EXPORTSTAND_ABWEICHEND" || e.code === "FREEZE_NICHT_REPRODUZIERBAR")) EXPORT_STAND.delete(schluessel);
          melde((e && e.message) || "Der Lohnexport ließ sich nicht bestätigen.");
          return false;
        }
      },
      /* WP-16c: Korrekturrevision nach bestätigtem Lohnexport (der Server entscheidet; die Differenz kommt mit dem Fehler). */
      monatKorrektur: async (aktion, monat, extra = {}) => {
        try {
          const erg = await SP.monatsabschluss(aktion, monat, extra);
          /* Wie Abschließen/Wiederöffnen: den Serverstand nachladen, sonst läuft ein PUT mit altem ETag hinterher (Konfliktdialog). */
          await serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
          melde(aktion === "korrektur-beginnen" ? "Korrektur begonnen — der exportierte Stand ist als Revision abgelegt."
            : aktion === "korrektur-verwerfen" ? "Korrektur verworfen." : "Freigabe gespeichert.");
          return { ok: true, ...erg };
        } catch (e) {
          if (e && e.code === "KORREKTUR_DIFFERENZ_FEHLT" && e.differenz) return { ok: false, differenz: e.differenz };
          melde((e && e.message) || "Der Schritt ließ sich nicht ausführen.");
          return { ok: false };
        }
      },
      /* WP-15: neuer Stand einer Selbstauskunft (Antrag) in erfassung übernehmen. */
      uebernehmeSelbstauskunft: (pid, d, erg) => serverstandNachladen((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) =>
        m.id !== (s2.session || {}).mandantId ? m
          : { ...m, erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: erg.eintrag } }) })),
      korrekturBeantragen: async (datum, start, ende, pause, grund) => {
        try {
          const erg = await SP.korrekturAntrag(datum, start, ende, pause, grund);
          const k = `${sitz.person.id}|${datum}`;
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: erg.eintrag } }) }));
          melde("Antrag gestellt — die Leitung entscheidet. Dein Stempel bleibt unverändert.");
          return true;
        } catch (e) {
          melde(e.message || "Der Antrag ließ sich nicht stellen.");
          return false;
        }
      },
      korrekturEntscheiden: async (pid, datum, antragId, entscheidung, begruendung) => {
        try {
          const erg = await SP.korrekturEntscheiden(pid, datum, antragId, entscheidung, begruendung);
          const k = `${pid}|${datum}`;
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, einstempeln: { ...(m.einstempeln || {}), [k]: erg.eintrag },
              ...(erg.erfassung ? { erfassung: { ...(m.erfassung || {}), [k]: erg.erfassung } } : {}) }) }));
          melde(entscheidung === "genehmigt" ? korrekturMeldung(erg)
            : entscheidung === "abgelehnt" ? "Antrag abgelehnt — die Begründung steht am Antrag." : "Antrag zurückgezogen.");
          return true;
        } catch (e) {
          melde(e.message || "Die Entscheidung ließ sich nicht speichern.");
          return false;
        }
      },
      /* Lange Dienste zur Prüfung (WP-17, W1): Die Leitung bestätigt die
         gestempelte Zeit — seit WP-06 als Korrekturereignis mit Grund. */
      langerDienstBestaetigen: (pid, d) => {
        const e = (sitz.mandant.erfassung || {})[`${pid}|${d}`];
        /* Dauer 0 nie unverändert bestätigen (Nachprüfung B1). */
        if (!e || nurKorrekturGrund(e.grund)) return;      // WP-14b: Herbstnacht ebenso
        return akt.stempelKorrigieren(pid, d, e.start, e.ende, bestaetigungsGrund(e));
      },
      bestaetigeZeit: async (pid, d, start, ende, grund) => {
        if (!sitz.person || pid !== sitz.person.id) {
          /* Gestempelter Tag: nur als Korrektur (WP-06). */
          if ((sitz.mandant.einstempeln || {})[`${pid}|${d}`])
            return akt.stempelKorrigieren(pid, d, start, ende, grund || "Zeit durch die Leitung bestätigt");
          mUpd((m) => ({ ...m,
            erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: { start, ende, bestaetigt: true, grund: grund || "" } } }), null);
          return;
        }
        try {
          const erg = await SP.zeitBestaetigen(d, start, ende, grund);
          upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
            : { ...m, erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: erg.eintrag } }) }));
          melde("Zeit beantragt — sie zählt nach der Freigabe durch die Leitung (WP-15).");
        } catch (e) {
          melde(e.message || "Die Zeit ließ sich nicht bestätigen.");
        }
      },
      setzeEinschraenkung: (pid, k, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, einschraenkungen: { ...(p.einschraenkungen || {}), [k]: v } } : p) }), "Einsatzeinschränkung geändert"),
      alleGelesen: () => mUpd((m) => ({ ...m, nachrichten: (m.nachrichten || []).map((n) =>
        n.personId === sitz.person.id ? { ...n, gelesen: true } : n) }), null),
      loescheAbweichung: (pid, d) => mUpd((m) => { const ab = { ...m.abweichungen }; delete ab[`${pid}|${d}`]; return { ...m, abweichungen: ab }; }, null),
      setzeZyklusTag: (i, v) => mUpd((m) => ({ ...m, zyklus: { ...m.zyklus, tage: m.zyklus.tage.map((d, k) => (k === i ? v : d)), vorlage: null } }), "Schichtfolge geändert"),
      setzeZyklusWochen: (w) => mUpd((m) => ({ ...m, zyklus: { ...m.zyklus, wochen: w,
        tage: Array.from({ length: w * 7 }, (_, i) => m.zyklus.tage[i] || "-"), vorlage: null } }), "Zykluslänge geändert"),
      ladeVorlage: (vid) => mUpd((m) => {
        const v = VORLAGEN.find((x) => x.id === vid); if (!v) return m;
        return { ...m, zyklus: { wochen: v.wochen, tage: [...v.tage], vorlage: v.id },
          dienstarten: m.dienstarten.map((d) => v.zeiten[d.id] ? { ...d, start: v.zeiten[d.id][0], ende: v.zeiten[d.id][1] } : d) };
      }, "Vorlage geladen"),
      setzeVersatz: (eid, tage) => mUpd((m) => ({ ...m, einheiten: m.einheiten.map((e) => e.id === eid
        ? { ...e, versatzTage: tage, versatz: Math.round(tage / 7) } : e) }), "Startpunkt geändert"),

      /* --- Dienstarten --- */
      neueDienstart: (f) => mUpd((m) => {
        const id = f.kurz && !m.dienstarten.some((d) => d.id === f.kurz) ? f.kurz : uid("d").toUpperCase().slice(-4);
        return { ...m, dienstarten: [...m.dienstarten, { ...f, id }] };
      }, `Dienstart „${f.name}" angelegt`),
      aendereDienstart: (id, f) => mUpd((m) => ({ ...m, dienstarten: m.dienstarten.map((d) => d.id === id ? { ...f, id } : d) }), `Dienstart „${f.name}" geändert`),
      loescheDienstart: (id) => mUpd((m) => {
        const n = m.zyklus.tage.filter((t) => t === id).length + Object.values(m.abweichungen).filter((v) => v === id).length;
        if (n > 0) { melde(`Dienstart wird noch ${n}× verwendet.`); return m; }
        return { ...m, dienstarten: m.dienstarten.filter((d) => d.id !== id) };
      }, "Dienstart gelöscht"),

      /* --- Personal --- */
      neuePerson: (f) => {
        /* Datenreview PR #130 (4): ein geleertes Datumsfeld speichert null (nicht ""), ein ungültiges wird
           abgewiesen — vor dem Speichern, damit kein Protokolleintrag „angelegt“ ohne Person entsteht. */
        const e = eintrittPruefen(f.eintritt);
        if (!e.ok) { melde(e.fehler); return; }
        mUpd((m) => ({ ...m, personen: [...m.personen, {
        id: uid("p"), vorname: f.vorname, nachname: f.nachname, funktion: f.funktion || "",
        /* IMP-1 Review: keine erfundene Adresse — ohne Angabe bleibt die E-Mail leer. */
        email: f.email || "",
        zugehoerigkeit: [{ ab: e.wert, einheitId: f.einheitId }], eintritt: e.wert, austritt: null,
        wochenstunden: f.wochenstunden, urlaubsanspruch: f.urlaubsanspruch, urlaubsuebertrag: 0, stundenuebertrag: 0,
        qualifikationen: [], einfuehrung: { erledigt: false, schritt: 0 }, rolle: f.rolle,
        bereich: ["leitung", "planer", "betriebsrat"].includes(f.rolle) ? "ALLE" : f.einheitId, status: "aktiv" }] }),
        `${f.vorname} ${f.nachname} angelegt als ${rolle(f.rolle).label}`);
      },
      /* Datenreview PR #130 (2): Eintritt bearbeiten — leer behält das bestehende Datum, gültig wird übernommen,
         ungültig ist ein Fehler (eintrittUebernehmen). */
      setzeEintritt: (pid, roh) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid); if (!p) return m;
        const r = eintrittUebernehmen(p, roh);
        if (!r.ok) { melde(r.fehler); return m; }
        if (r.wert === (p.eintritt === undefined ? null : p.eintritt)) return m;
        return { ...m, personen: m.personen.map((x) => (x.id === pid ? { ...x, eintritt: r.wert } : x)) };
      }, "Eintritt geändert"),
      setzeRolle: (pid, r) => mUpd((m) => {
        const p = m.personen.find((x) => x.id === pid);
        const leitungen = m.personen.filter((x) => x.rolle === "leitung" && x.status === "aktiv" && !x.austritt);
        if (p.rolle === "leitung" && r !== "leitung" && leitungen.length <= 1) {
          melde("Der letzte Zugang mit Organisationsleitung kann nicht umgestellt werden."); return m; }
        melde(`${p.vorname} ${p.nachname}: ${rolle(r).label}. Die Kosten wurden angepasst.`);
        return { ...m, personen: m.personen.map((x) => x.id === pid ? { ...x, rolle: r, rolleSeit: heute(),
          rolleVerlauf: [...(x.rolleVerlauf || [{ ab: x.rolleSeit || x.eintritt, rolle: x.rolle }]), { ab: heute(), rolle: r }],
          bereich: ["leitung", "planer", "betriebsrat"].includes(r) ? "ALLE" : (x.bereich === "ALLE" ? einheitAm(x, heute()) : x.bereich) } : x) };
      }, "Zugangsart geändert"),
      versetze: (pid, eid, ab) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, zugehoerigkeit: zugehoerigkeitSortiert([...p.zugehoerigkeit.filter((z) => z.ab !== ab), { ab, einheitId: eid }]) } : p) }), "Versetzung eingetragen"),
      setzeAustritt: (pid, d) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid ? { ...p, austritt: d } : p) }),
        d ? "Austritt eingetragen" : "Austritt zurückgenommen"),
      toggleQual: (pid, qid) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid
        ? { ...p, qualifikationen: p.qualifikationen.includes(qid) ? p.qualifikationen.filter((x) => x !== qid) : [...p.qualifikationen, qid] } : p) }), null),
      neueAbwesenheit: (pid, art, von, bis) => { mUpd((m) => ({ ...m, abwesenheiten: [...m.abwesenheiten,
        { id: uid("a"), personId: pid, art, von, bis, notiz: "" }] }), "Abwesenheit eingetragen"); melde("Abwesenheit eingetragen."); },
      loescheAbwesenheit: (aid) => mUpd((m) => ({ ...m, abwesenheiten: m.abwesenheiten.filter((a) => a.id !== aid) }), "Abwesenheit gelöscht"),

      /* --- Anträge --- */
      /* Zweimal derselbe Antrag ist keiner.

         Ein Doppelklick auf „Antrag stellen" — auf dem Telefon im Bus,
         bei stockender Verbindung der Normalfall — legte zwei offene
         Anträge derselben Person für denselben Zeitraum an. Die Planung
         sah doppelt, genehmigte einmal und ließ den zweiten stehen.

         Gefunden wird über Person, Art und Zeitraum, nicht über die
         Kennung: Die ist bei jedem Klick eine neue. */
      stelleAntrag: (a) => {
        const schonDa = (sitz.mandant.anfragen || []).some((x) => x.personId === sitz.person.id
          && x.status === "offen" && (x.typ || "abwesenheit") === (a.typ || "abwesenheit")
          && x.art === a.art && x.von === a.von && x.bis === a.bis);
        if (schonDa) { melde("Dieser Antrag liegt bereits offen vor."); return; }
        mUpd((m) => ({ ...m, anfragen: [{ id: uid("r"), personId: sitz.person.id, status: "offen",
          erstellt: jetzt(), antwort: "", ...a }, ...m.anfragen] }), "Antrag gestellt");
        melde("Antrag abgesendet."); },
      zieheAntragZurueck: (id) => mUpd((m) => ({ ...m, anfragen: m.anfragen.filter((a) => a.id !== id) }), "Antrag zurückgezogen"),
      beantworteEinsatz: (id, ja) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        let next = { ...m, anfragen: m.anfragen.map((x) => x.id === id ? { ...x, status: ja ? "genehmigt" : "abgelehnt" } : x) };
        if (ja) {
          next = { ...next, abweichungen: { ...next.abweichungen, [`${a.personId}|${a.von}`]: a.dienstId },
            einspruenge: [{ id: uid("s"), personId: a.personId, datum: a.von, dienstId: a.dienstId,
              zeit: new Date().toLocaleString("de-DE") }, ...(next.einspruenge || [])] };
          // Übrige Anfragen für dieselbe Lücke verfallen
          next = { ...next, anfragen: next.anfragen.map((x) => (x.typ === "einsatz" && x.von === a.von
            && x.dienstId === a.dienstId && x.id !== id && x.status === "offen") ? { ...x, status: "abgelehnt", antwort: "anderweitig besetzt" } : x) };
        }
        melde(ja ? "Zusage erfasst, du bist eingeteilt." : "Absage erfasst.");
        return next;
      }, "Einsatzanfrage beantwortet"),
      entscheideAntrag: (id, ja, text) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const wer = `${sitz.person.vorname} ${sitz.person.nachname}`;
        const jetzt = new Date().toLocaleString("de-DE");
        // Mehrstufige Genehmigung: erst wenn alle Stufen erteilt sind, gilt der
        // Antrag als genehmigt. Eine Ablehnung beendet den Vorgang sofort.
        if (ja) {
          const freigaben = [...(a.freigaben || []), { von: wer, zeit: jetzt }];
          const st = genehmigungsStand(m, { ...a, freigaben });
          if (!st.fertig) {
            melde(`Mitgezeichnet. Es fehlt noch ${st.offen === 1 ? "eine Freigabe" : `${st.offen} Freigaben`} durch ${st.naechste}.`);
            return { ...m, anfragen: m.anfragen.map((x) => x.id === id ? { ...x, freigaben } : x) };
          }
          const erg = antragUmsetzen(m, a);
          melde(`Antrag genehmigt${(a.freigaben || []).length ? " — alle Stufen erteilt" : ""}.`);
          return { ...erg, anfragen: erg.anfragen.map((x) => x.id === id
            ? { ...x, status: "genehmigt", freigaben, entschieden: jetzt, durch: wer, antwort: text || "" } : x),
            nachrichten: [baueMitteilung(m, a.personId, "antragEntschieden", "Antrag genehmigt", `${abwArt(a.art).label} ${fKurz(a.von)} wurde genehmigt.`, "meine"),
              ...(erg.nachrichten || [])].slice(0, 400) };
        }
        melde("Antrag abgelehnt.");
        return { ...m, anfragen: m.anfragen.map((x) => x.id === id
          ? { ...x, status: "abgelehnt", entschieden: jetzt, durch: wer, antwort: text || "" } : x),
          nachrichten: [baueMitteilung(m, a.personId, "planGeaendert", "Antrag abgelehnt", `${abwArt(a.art).label} ${fKurz(a.von)} wurde abgelehnt.${text ? " " + text : ""}`, "meine"),
            ...(m.nachrichten || [])].slice(0, 400) };
      }, "Antrag entschieden"),
  };
}

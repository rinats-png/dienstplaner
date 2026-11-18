/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { anonymisiere as anonymPerson, vorschau as loeschVorschau, berichtstext as loeschBericht, raeumen as loeschlaufAusfuehren } from "../../aufbewahrung.js";
import { heute, fKurz } from "../../lib/datum.js";
import { datenauskunft, lohnWarnung, zuschlagWert, aktive, personTag, abwArt } from "../../lib/fachlogik.js";
import { lade } from "../../lib/download.js";
import { exportWarnung } from "../../istdaten.js";
import { csvText } from "../../csvfeld.js";
import { imDienst, einheitAm } from "../../../server/lib/fachpruefung.mjs";
import { n1, n1Ist } from "../../lib/format.js";
import * as SP from "../../speicher.js";
import { dim_, pad, toMin, addDays } from "../../regelwerk.js";

/**
 * WP-48.5 (3): Löschlauf der Leitung über POST /api/loeschlauf (WP-48.4, Entscheidung 6.1) — nur, wenn der Teilweg
 * aktiv ist (Fähigkeit `teile`, Schalter an) und der Zugang die Rolle Leitung trägt. Zwei Schritte wie auf dem Server:
 * Vorschau (schreibt nichts), Bestätigung mit der Kennung der Vorschau. Die Rechnung macht der Server unter der
 * Raumsperre mit derselben Regel; die Oberfläche löscht nichts selbst. Danach den gespeicherten Stand nachladen.
 */
/* Keine eigene Ausfuhr: Jede Ausfuhr dieser Datei zählt als Aktionsfabrik (WP-39, pruefungen/wp39-app-aufbau.test.js). */
async function loeschlaufUeberServer({ melde, serverstandNachladen, bestaetigen = (t) => window.confirm(t) }) {
  /* Erst alles Ausstehende speichern: Der Server rechnet auf dem gespeicherten Stand. */
  await SP.schreibenAbschliessen();
  if (SP.schreibenAusstehend()) {
    melde("Erst die offenen Änderungen speichern oder klären, dann den Löschlauf starten.");
    return { ergebnis: "ausstehend" };
  }
  let v;
  try { v = await SP.loeschlaufServer({ vorschau: true }); }
  catch (e) { melde(String((e && e.message) || "Keine Verbindung.")); return { ergebnis: "fehler" }; }
  if (v.status !== 200) { melde(String(v.daten.text || v.daten.fehler || "Der Löschlauf ist gerade nicht möglich.")); return { ergebnis: "fehler", status: v.status }; }
  if (!v.daten.faellig) { melde("Nichts fällig — alle Fristen eingehalten."); return { ergebnis: "nichts" }; }
  if (!bestaetigen(`${v.daten.bericht}\n\n${v.daten.warnung ? `${v.daten.warnung}\n\n` : ""}Das lässt sich nicht rückgängig machen. `
    + "Bei Zweifel vorher eine Sicherung anlegen.")) return { ergebnis: "abgebrochen" };
  let a;
  try { a = await SP.loeschlaufServer({ bestaetigt: v.daten.kennung }); }
  catch (e) { melde(String((e && e.message) || "Keine Verbindung.")); return { ergebnis: "fehler" }; }
  if (a.status === 200 && a.daten.ausgefuehrt) {
    /* Der Server hat gelöscht: gespeicherten Stand nachladen (neue Basis des Teilwegs). Steht lokal etwas aus,
       bleibt der lokale Stand (spiegeln ohne Änderung). */
    await serverstandNachladen((s) => s);
    melde(String(a.daten.bericht || "Löschlauf ausgeführt."));
    return { ergebnis: "ausgefuehrt" };
  }
  melde(String(a.daten.text || a.daten.fehler || "Es wurde nichts gelöscht."));
  return { ergebnis: a.status === 200 ? "ohneWirkung" : "fehler", status: a.status };
}

export function aktionenAusgaben(k) {
  const { mUpd, melde, ref, setAusgabe, ym } = k;
  return {
      /* --- Datenschutz --- */
      anonymisiere: (pid) => mUpd((m) => {
        if (!window.confirm("Name und Kontaktdaten werden unwiderruflich ersetzt. Planungsdaten bleiben als Statistik erhalten.")) return m;
        melde("Datensatz anonymisiert.");
        return { ...m, personen: m.personen.map((p) => p.id === pid
          ? { ...anonymPerson(p), anonymSeit: heute() } : p),
          nachrichten: (m.nachrichten || []).filter((n) => n.personId !== pid) };
      }, "Datensatz anonymisiert"),

      /* Der Löschlauf über alle drei Fristen. Bis hierher standen die
         Fristen im Bestand und taten nichts — Artikel 17 DSGVO verlangt
         die Löschung, nicht die Absicht dazu. */
      loeschlauf: () => {
        /* WP-48.5 (3): Mit aktivem Teilweg löst die Leitung den Löschlauf über den eigenen Weg aus. Ohne Teilweg
           (Schalter aus) und für alle anderen Rollen (Kundenrolle) bleibt es beim heutigen Weg unten. */
        if (SP.teilwegAktiv() && (SP.zugangsdaten() || {}).rolle === "leitung")
          return loeschlaufUeberServer({ melde, serverstandNachladen: k.serverstandNachladen });
        const s2 = ref.current;
        const m0 = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const vor = loeschVorschau(m0, heute());
        if (vor.gesamt === 0) { melde("Nichts fällig — alle Fristen eingehalten."); return; }
        if (!window.confirm(
          `${loeschBericht(vor)}\n\nDas lässt sich nicht rückgängig machen. `
          + "Bei Zweifel vorher eine Sicherung anlegen.")) return;
        let text = "";
        /* WP-48.5 (3): Bei aktivem Teilweg (Kundenrolle) geht dieser Schreibvorgang als Voll-PUT — Stempel stehen nie im
           Delta, ihr Löschen braucht den ganzen Bestand wie heute. Ohne Teilweg wirkungslos. */
        if (SP.teilwegAktiv()) SP.naechstesSpeichernVoll();
        mUpd((m) => {
          const { mandant, bericht } = loeschlaufAusfuehren(m, heute());
          text = loeschBericht(bericht);
          return mandant;
        }, `Löschlauf: ${loeschBericht(vor)}`);
        melde(text || "Löschlauf ausgeführt.");
      },
      datenauskunft: (pid) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const p = m.personen.find((x) => x.id === pid);
        const inhalt = datenauskunft(m, pid);
        if (lade(`datenauskunft_${p.nachname}.txt`, inhalt, "text/plain;charset=utf-8")) melde("Auskunft erstellt.");
        else setAusgabe({ titel: "Datenauskunft", inhalt });
      },
      exportZuschlaege: (ym2) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        /* Dieselbe Rückfrage wie bei der Lohnausgabe (Nachprüfung WP-17, A1):
           Auch hier zählen Ist-Zeiten zur Prüfung vorläufig mit der Planzeit. */
        const warnung = lohnWarnung(m, ym2, exportWarnung(m, ym2));
        if (warnung && !window.confirm(warnung)) return;
        const regeln = (m.zuschlaege || []).filter((z) => z.aktiv);
        const kopf = ["Nachname", "Vorname", "Personalnummer", "Gearbeitet", "Nacht", "Sonntag", "Feiertag", "Samstag",
          ...regeln.map((z) => `${z.name} (${z.prozent}%)`), "Zuschlagswert gesamt"];
        const z = [kopf.map(csvText).join(";")];   // Freitext gegen Formel-Injection (SI-02)
        for (const p of m.personen.filter((x) => imDienst(x, `${ym2}-28`))) {
          const w = zuschlagWert(m, p, ym2);
          z.push([csvText(p.nachname), csvText(p.vorname), csvText(p.id), n1(w.std.gesamt), n1(w.std.nacht), n1(w.std.sonntag),
            n1(w.std.feiertag), n1(w.std.samstag), ...w.zeilen.map((l) => n1(l.wert)), n1Ist(w.summe)].join(";"));
        }
        const inhalt = "\uFEFF" + z.join("\n");
        if (lade(`zuschlaege_${ym2}.csv`, inhalt, "text/csv;charset=utf-8")) melde("Export für die Lohnstelle erstellt.");
        else setAusgabe({ titel: "Zuschläge", inhalt });
      },

      /* --- Ausgaben --- */
      exportCSV: () => {
        const s = ref.current; const m = s.mandanten.find((x) => x.id === s.session.mandantId);
        const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1);
        const tage = Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
        const z = [["Nachname", "Vorname", m.einheitLabel, ...tage.map(fKurz)].map(csvText).join(";")];
        for (const p of aktive(m, tage[0])) {
          const e = m.einheiten.find((x) => x.id === einheitAm(p, tage[0]));
          /* Freitext gegen Formel-Injection und Trennzeichen (SI-02) */
          z.push([csvText(p.nachname), csvText(p.vorname), csvText(e ? e.name : ""), ...tage.map((d) => {
            const t = personTag(m, p, d); return csvText(t.abwesenheit ? abwArt(t.abwesenheit.art).label : t.dienstId || ""); })].join(";"));
        }
        const inhalt = "\uFEFF" + z.join("\n");
        if (lade(`dienstplan_${ym}.csv`, inhalt, "text/csv;charset=utf-8")) melde("CSV erstellt."); else setAusgabe({ titel: "CSV", inhalt });
      },
      exportICS: (pid) => {
        const s = ref.current; const m = s.mandanten.find((x) => x.id === s.session.mandantId);
        const p = m.personen.find((x) => x.id === pid);
        const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1);
        const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CENTRIC//DE", "CALSCALE:GREGORIAN"];
        for (let i = 1; i <= n; i++) {
          const d = `${ym}-${pad(i)}`, t = personTag(m, p, d); if (!t.dienstId) continue;
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          const endD = (toMin(da.ende) <= toMin(da.start) ? addDays(d, 1) : d).replace(/-/g, "");
          out.push("BEGIN:VEVENT", `UID:${p.id}-${d}@centric`,
            `DTSTART:${d.replace(/-/g, "")}T${da.start.replace(":", "")}00`,
            `DTEND:${endD}T${(da.ende === "24:00" ? "2359" : da.ende.replace(":", ""))}00`,
            `SUMMARY:${da.name}`, `LOCATION:${da.ort}`, "END:VEVENT");
        }
        out.push("END:VCALENDAR");
        const inhalt = out.join("\r\n");
        if (lade(`schichten_${p.nachname}_${ym}.ics`, inhalt, "text/calendar")) melde("Kalenderdatei erstellt."); else setAusgabe({ titel: "Kalender", inhalt });
      },
      exportJSON: () => { const s = ref.current; const inhalt = JSON.stringify(s, null, 2);
        if (lade(`centric_sicherung_${heute()}.json`, inhalt, "application/json")) melde("Sicherung erstellt."); else setAusgabe({ titel: "Sicherung", inhalt }); },
  };
}

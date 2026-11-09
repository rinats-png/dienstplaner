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
import { dim_, pad, toMin, addDays } from "../../regelwerk.js";

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
        const s2 = ref.current;
        const m0 = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const vor = loeschVorschau(m0, heute());
        if (vor.gesamt === 0) { melde("Nichts fällig — alle Fristen eingehalten."); return; }
        if (!window.confirm(
          `${loeschBericht(vor)}\n\nDas lässt sich nicht rückgängig machen. `
          + "Bei Zweifel vorher eine Sicherung anlegen.")) return;
        let text = "";
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

/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { handbuchLaden, handbuchDruck } from "../../lib/handbuch.js";
import { heute, fLang } from "../../lib/datum.js";
import { uid, n1 } from "../../lib/format.js";
import { waehltEinheit, eigeneEinheitVon, vorlauf, abwArt, personTag, briefingText, tagesaufgaben } from "../../lib/fachlogik.js";
import { addDays, REGELSTAND, fenster, dauer, pISO } from "../../regelwerk.js";
import { einheitAm, einheitDienst } from "../../../server/lib/fachpruefung.mjs";
import { lade } from "../../lib/download.js";

export function aktionenBegleitung(k) {
  const { mUpd, melde, ref, setAntragVon, setAusgabe, setEinf, setKmd, setMehrfach, setNotizDlg, setWunschDlg, sitz } = k;
  return {
      /* --- Handbuch --- */
      handbuchHaken: (schluessel) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, handbuch: (p.handbuch || []).includes(schluessel)
          ? (p.handbuch || []).filter((x) => x !== schluessel)
          : [...(p.handbuch || []), schluessel] } : p) }), null),
      druckeHandbuch: async () => {
        /* Das Fenster zuerst öffnen: Ein window.open nach einem await gilt
           dem Browser nicht mehr als Folge des Klicks und wird geblockt. */
        const w = window.open("", "_blank");
        if (!w) return melde("Der Druck wurde vom Browser blockiert.");
        try {
          const alle = await handbuchLaden();
          w.document.write(handbuchDruck(sitz.mandant, alle));
          w.document.close();
          setTimeout(() => { try { w.print(); } catch (e) { /* still */ } }, 400);
        } catch {
          w.close();
          melde("Der Handbuchinhalt ließ sich nicht laden. Bitte erneut versuchen.");
        }
      },

      /* --- Einführung --- */
      starteEinfuehrung: () => setEinf(true),
      einfuehrungSchritt: (n) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, einfuehrung: { ...(p.einfuehrung || {}), schritt: n } } : p) }), null),
      einfuehrungFertig: () => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, einfuehrung: { erledigt: true, schritt: 0 } } : p) }), null),
      oeffneAntrag: (d) => setAntragVon({ von: d || heute(), bis: d || heute() }),
      tauschAusPlan: (d) => mUpd((m) => {
        const jetzt = new Date().toLocaleString("de-DE");
        melde("Tauschgesuch eingestellt. Alle im Betrieb sehen es.");
        return { ...m, anfragen: [{ id: uid("r"), personId: sitz.person.id, typ: "tausch", status: "offen",
          partnerId: null, interessenten: [], von: d, bis: d, text: "", erstellt: jetzt }, ...m.anfragen] };
      }, "Tauschgesuch eingestellt"),
      oeffneKommando: () => setKmd(true),
      oeffneWunsch: (pid) => setWunschDlg(pid || sitz.person.id),
      oeffneNotizen: (k, t2) => setNotizDlg({ k, t: t2 }),
      oeffneMehrfach: () => setMehrfach(true),

      /* --- Wunschdienste: einmal möchte, zweimal lieber nicht, dreimal löschen --- */
      setzeWunsch: (pid, d) => mUpd((m) => {
        const liste = m.wuensche || [];
        const vorh = liste.find((w) => w.personId === pid && w.datum === d);
        if (!vorh) return { ...m, wuensche: [...liste, { id: uid("w"), personId: pid, datum: d, art: "moechte" }] };
        if (vorh.art === "moechte") return { ...m, wuensche: liste.map((w) =>
          w === vorh ? { ...w, art: "lieber_nicht" } : w) };
        return { ...m, wuensche: liste.filter((w) => w !== vorh) };
      }, null),

      /* --- Notizen --- */
      neueNotiz: (k, text, einheitId = null) => mUpd((m) => ({ ...m, notizen: { ...(m.notizen || {}),
        [k]: [{ id: uid("nz"), text, von: `${sitz.person.vorname} ${sitz.person.nachname}`, vonId: sitz.person.id,
          zeit: new Date().toLocaleString("de-DE"),
          einheitId: waehltEinheit(sitz) ? einheitId : eigeneEinheitVon(sitz) }, ...((m.notizen || {})[k] || [])] } }), "Notiz gespeichert"),
      loescheNotiz: (k, id) => mUpd((m) => ({ ...m, notizen: { ...(m.notizen || {}),
        [k]: ((m.notizen || {})[k] || []).filter((x) => x.id !== id) } }), null),

      /* --- Einarbeitung --- */
      neueEinarbeitung: (f) => mUpd((m) => ({ ...m, einarbeitung: [...(m.einarbeitung || []),
        { personId: f.personId, mentorId: f.mentorId, von: f.von, bis: f.bis, ziel: f.ziel }] }), "Einarbeitung angelegt"),
      loescheEinarbeitung: (pid, von) => mUpd((m) => ({ ...m,
        einarbeitung: (m.einarbeitung || []).filter((x) => !(x.personId === pid && x.von === von)) }), "Einarbeitung beendet"),

      /* --- Mehrfachbearbeitung --- */
      mehrfachDienst: (ids, von, bis, dienstId) => mUpd((m) => {
        const ab = { ...m.abweichungen };
        const aend = []; const jetzt = new Date().toLocaleString("de-DE");
        for (const pid of ids) {
          const p = m.personen.find((x) => x.id === pid); if (!p) continue;
          for (let d = von; d <= bis; d = addDays(d, 1)) {
            const eid = einheitAm(p, d);
            const plan = eid && p.imSchichtdienst !== false ? einheitDienst(m, eid, d) : null;
            const k = `${pid}|${d}`;
            const vorher = ab[k] !== undefined ? ab[k] : plan;
            if ((dienstId === "-" && !plan) || dienstId === plan) delete ab[k]; else ab[k] = dienstId;
            const nachher = ab[k] !== undefined ? ab[k] : plan;
            if ((vorher || "-") !== (nachher || "-"))
              aend.push({ id: uid("c"), personId: pid, datum: d, von: vorher || "-", nach: nachher || "-",
                zeit: jetzt, regelstand: REGELSTAND.version, vorlauf: vorlauf(d) });
          }
        }
        melde(`${aend.length} Einträge geändert.`);
        return { ...m, abweichungen: ab, aenderungen: [...aend, ...(m.aenderungen || [])].slice(0, 1200) };
      }, "Mehrere Tage geändert"),
      mehrfachAbwesenheit: (ids, von, bis, art) => mUpd((m) => {
        const neu = ids.map((pid) => ({ id: uid("a"), personId: pid, art, von, bis, notiz: "Sammeleintrag" }));
        melde(`${neu.length}× ${abwArt(art).label} eingetragen.`);
        return { ...m, abwesenheiten: [...m.abwesenheiten, ...neu] };
      }, "Abwesenheit für mehrere eingetragen"),

      /* --- Kalenderabo --- */
      kalenderAbo: (pid) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const p = m.personen.find((x) => x.id === pid); if (!p) return;
        const z = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CENTRIC//DE", "CALSCALE:GREGORIAN",
          "METHOD:PUBLISH", `X-WR-CALNAME:Dienstplan ${p.vorname} ${p.nachname}`,
          "X-PUBLISHED-TTL:PT6H", "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
        for (let i = -30; i < 365; i++) {
          const d = addDays(heute(), i);
          const t2 = personTag(m, p, d);
          if (!t2.dienstId) continue;
          const da = m.dienstarten.find((x) => x.id === t2.dienstId); if (!da) continue;
          const [ms, me] = fenster(d, da);
          const stamp = (min) => { const dt = new Date(pISO(d).getTime() + min * 60000);
            return dt.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; };
          z.push("BEGIN:VEVENT", `UID:${p.id}-${d}@centric`, `DTSTAMP:${stamp(0)}`,
            `DTSTART:${stamp(ms)}`, `DTEND:${stamp(me)}`, `SUMMARY:${da.name}`,
            da.ort ? `LOCATION:${da.ort}` : "", `DESCRIPTION:${m.name} · ${n1(dauer(da))} h`, "END:VEVENT");
        }
        z.push("END:VCALENDAR");
        const inhalt = z.filter(Boolean).join("\r\n");
        if (lade(`dienstplan_${p.nachname}.ics`, inhalt, "text/calendar;charset=utf-8"))
          melde("Kalenderdatei erstellt. Für laufende Aktualisierung braucht es einen Server.");
        else setAusgabe({ titel: "Kalender", inhalt });
      },

      /* --- Briefing --- */
      briefingZeigen: () => setAusgabe({ titel: `Tagesbriefing · ${fLang(heute())}`, inhalt: briefingText(sitz) }),
      briefingPush: async () => {
        try {
          if (!("Notification" in window)) { melde("Dieser Browser unterstützt keine Benachrichtigungen."); return; }
          let erl = Notification.permission;
          if (erl === "default") erl = await Notification.requestPermission();
          if (erl !== "granted") { melde("Benachrichtigungen sind nicht freigegeben."); return; }
          const auf = tagesaufgaben(sitz);
          new Notification(`CENTRIC · ${auf.length ? `${auf.length} Vorgänge` : "nichts zu tun"}`,
            { body: auf.length ? auf.slice(0, 3).map((a) => a.titel).join("\n") : "Es liegt nichts an." });
          melde("Benachrichtigung gesendet.");
        } catch (e) { melde("Benachrichtigung nicht möglich."); }
      },
  };
}

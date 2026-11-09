/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { dim_, dow, pad, REGELSTAND } from "../../regelwerk.js";
import { freigabeStand, vorlauf, schutzSperre, bestaetigungVermerken, personTag, istFreigegeben, befundeFuerEinteilung } from "../../lib/fachlogik.js";
import { MON, DOW, fKurz, heute, fDatum } from "../../lib/datum.js";
import { feiertag } from "../../../server/lib/feiertage.mjs";
import { landFuerEinheit, einheitDienst, einheitAm } from "../../../server/lib/fachpruefung.mjs";
import { uid } from "../../lib/format.js";
import { baueMitteilung } from "../../lib/zustellung.js";
import { stufeRang } from "../../warnstufen.js";

export function aktionenAssistenz(k) {
  const { mUpd, melde, ref, setAssist, setAusgabe, setAusgl, setEskal, setSchnell, setWarnung, setWizard, sitz, wer } = k;
  return {
      /* --- Aushangplan als PDF im Kalenderlook --- */
      aushangPDF: (ym2, einheitId) => {
        const s2 = ref.current; const m = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const e = m.einheiten.find((x) => x.id === einheitId);
        const [y, mo] = ym2.split("-").map(Number);
        const n = dim_(y, mo - 1);
        const erster = dow(`${ym2}-01`);
        const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
        const zellen = [];
        for (let i = 0; i < erster; i++) zellen.push(null);
        for (let i = 1; i <= n; i++) zellen.push(`${ym2}-${pad(i)}`);
        const woch = [];
        for (let i = 0; i < zellen.length; i += 7) woch.push(zellen.slice(i, i + 7));
        const fg = freigabeStand(m, ym2);
        /* Daten aus dem Bestand nur maskiert ins HTML (SI-03): Betriebs-,
           Einheiten- und Dienstartnamen sind Freitext anderer Rollen. */
        const h = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const farbeSicher = (x) => (/^#[0-9a-f]{3,8}$/i.test(String(x || "")) ? x : "inherit");
        const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Dienstplan ${MON[mo - 1]} ${y}</title><style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827;margin:0}
h1{font-size:22pt;font-weight:300;letter-spacing:-.03em;margin:0}
h1 b{font-weight:700}
.kopf{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #2C4E5C;padding-bottom:9px;margin-bottom:14px}
.rub{font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#3E6478}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#5A6670;padding:6px 4px;border-bottom:1.5px solid #2C4E5C}
td{border:1px solid #E3E1DD;height:74px;vertical-align:top;padding:5px 6px}
.tag{font-size:8.5pt;color:#5A6670;font-weight:600}
.we{background:#F5F4F2}.fei{background:#FEF2F2}
.d{margin-top:5px;font-size:13pt;font-weight:700;letter-spacing:-.02em}
.z{font-size:7.5pt;color:#5A6670;margin-top:1px}
.fuss{margin-top:12px;font-size:8pt;color:#5A6670;display:flex;justify-content:space-between;border-top:1px solid #E3E1DD;padding-top:7px}
</style></head><body>
<div class="kopf"><div><div class="rub">${h(m.name)}</div>
<h1>${e ? h(e.name) : ""} — <b>${MON[mo - 1]} ${y}</b></h1></div>
<div style="text-align:right"><div class="rub">${fg ? `Freigegeben · Stand ${h(fg.stand)}` : "Entwurf"}</div>
<div style="font-size:8pt;color:#5A6670;margin-top:3px">${fg ? h(fg.zeit) : `erstellt ${new Date().toLocaleString("de-DE")}`}</div></div></div>
<table><thead><tr>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>
${woch.map((w) => `<tr>${w.map((d) => {
  if (!d) return '<td style="border:none"></td>';
  const fei = feiertag(d, landFuerEinheit(m, einheitId));
  const we = dow(d) >= 5;
  const id = einheitDienst(m, einheitId, d);
  const da = id && map[id];
  return `<td class="${fei ? "fei" : we ? "we" : ""}"><div class="tag">${Number(d.slice(8))}${fei ? " · Feiertag" : ""}</div>
${da ? `<div class="d" style="color:${farbeSicher(da.farbe)}">${h(da.kurz)}</div><div class="z">${h(da.start)}–${h(da.ende)}</div>` : ""}</td>`;
}).join("")}</tr>`).join("")}
</tbody></table>
<div class="fuss"><span>CENTRIC · ${h(m.name)}</span><span>Zum Aushang bestimmt. Änderungen werden gesondert bekanntgegeben.</span></div>
</body></html>`;
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); melde("Aushangplan erstellt."); }
        else setAusgabe({ titel: "Aushangplan", inhalt: html });
      },

      oeffneSchnellbesetzung: (d, dienstId) => setSchnell({ datum: d, dienstId }),
      oeffneWizard: () => setWizard(true),
      anfrageVermerken: (d, dienstId, weg) => mUpd((m) => ({ ...m,
        aenderungen: [{ id: uid("c"), personId: null, datum: d, von: "-", nach: `Anfrage ${weg}`,
          zeit: new Date().toLocaleString("de-DE"), regelstand: REGELSTAND.version, vorlauf: vorlauf(d) }, ...(m.aenderungen || [])].slice(0, 800) }),
        `Dienstanfrage für ${fKurz(d)} versandt`),

      /* --- Tauschbörse --- */
      tauschMelden: (id) => mUpd((m) => {
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const jetzt = new Date().toLocaleString("de-DE");
        melde("Meldung eingegangen. Die Planung entscheidet.");
        /* Die Mitteilung an die Person des Gesuchs erzeugt der Server (Commit 4). */
        return { ...m,
          anfragen: m.anfragen.map((x) => x.id === id
            ? { ...x, interessenten: [...new Set([...(x.interessenten || []), sitz.person.id])] } : x) };
      }, "Meldung auf Tauschgesuch"),
      tauschAbmelden: (id) => mUpd((m) => ({ ...m, anfragen: m.anfragen.map((x) => x.id === id
        ? { ...x, interessenten: (x.interessenten || []).filter((p) => p !== sitz.person.id) } : x) }), null),
      tauschZuteilen: (id, interessentId, best) => mUpd((m0) => {
        const a0 = m0.anfragen.find((x) => x.id === id); if (!a0) return m0;
        /* Harte Schutzbefunde sperren auch beim Tausch (Kette B), in beide Richtungen. */
        const pA = m0.personen.find((x) => x.id === a0.personId), pI = m0.personen.find((x) => x.id === interessentId);
        const daVon = (p) => p ? m0.dienstarten.find((x) => x.id === personTag(m0, p, a0.von).dienstId) : null;
        const sperre = schutzSperre(m0, pI, a0.von, daVon(pA)) || schutzSperre(m0, pA, a0.von, daVon(pI));
        if (sperre) { melde(`Nicht möglich: ${sperre.text}.`); return m0; }
        const m = bestaetigungVermerken(m0, best, wer(), "tausch");
        const a = m.anfragen.find((x) => x.id === id); if (!a) return m;
        const t1 = personTag(m, m.personen.find((x) => x.id === a.personId), a.von);
        const t2 = personTag(m, m.personen.find((x) => x.id === interessentId), a.von);
        const ab = { ...m.abweichungen };
        ab[`${a.personId}|${a.von}`] = t2.dienstId || "-";
        ab[`${interessentId}|${a.von}`] = t1.dienstId || "-";
        const jetzt = new Date().toLocaleString("de-DE");
        const namen = (x) => { const p = m.personen.find((y) => y.id === x); return p ? `${p.vorname} ${p.nachname}` : "?"; };
        melde(`Tausch bestätigt: ${namen(a.personId)} und ${namen(interessentId)}.`);
        return { ...m, abweichungen: ab,
          anfragen: m.anfragen.map((x) => x.id === id
            ? { ...x, status: "genehmigt", partnerId: interessentId, antwort: `getauscht mit ${namen(interessentId)}` } : x),
          nachrichten: [
            baueMitteilung(m, a.personId, "antragEntschieden", `Tausch am ${fKurz(a.von)} bestätigt`, `Getauscht mit ${namen(interessentId)}.`, "meine"),
            baueMitteilung(m, interessentId, "planGeaendert", `Tausch am ${fKurz(a.von)} bestätigt`, `Du übernimmst den Dienst von ${namen(a.personId)}.`, "meine"),
            ...(m.nachrichten || [])].slice(0, 400) };
      }, "Tausch zugeteilt"),

      /* --- Einrichtungsassistent --- */
      assistentUebernehmen: (e) => mUpd((m) => {
        const einheiten = e.gruppen.map((g) => ({ id: g.id, name: g.name, versatz: Math.round(g.versatzTage / 7),
          versatzTage: g.versatzTage, farbe: g.farbe, pool: false, standortId: (m.standorte[0] || {}).id }));
        const pool = m.einheiten.find((x) => x.pool);
        if (pool) einheiten.push(pool);
        const dienstarten = e.dienstarten.map((d) => ({ id: d.id, name: d.name, kurz: d.kurz, start: d.start,
          ende: d.ende, pause: d.pause || 0, farbe: d.farbe, ort: d.ort || "", posten: false, quelle: null,
          faktor: 1, ruhezeitNeutral: false, rufbereitschaft: false, mindest: d.mindest, mindestQual: d.mindestQual || {} }));
        // Personen den neuen Gruppen zuordnen; unbekannte Gruppe fällt auf die erste
        const zuordnung = (name) => (einheiten.find((x) => x.name.toLowerCase() === String(name).toLowerCase()) || einheiten[0]).id;
        const bestand = m.personen.map((p) => {
          const alt = einheitAm(p, heute());
          const treffer = einheiten.find((x) => x.id === alt) || einheiten[0];
          return { ...p, zugehoerigkeit: [{ ab: e.anker, einheitId: treffer.id }] };
        });
        const neue = (e.personen || []).map((z) => ({
          id: uid("p"), vorname: z.vorname, nachname: z.nachname, funktion: "Fachkraft",
          email: "", zugehoerigkeit: [{ ab: e.anker, einheitId: zuordnung(z.gruppe) }],
          eintritt: e.anker, austritt: null, wochenstunden: z.wochenstunden,
          urlaubsanspruch: 30, urlaubsuebertrag: 0, stundenuebertrag: 0, qualifikationen: [],
          teilzeit: z.wochenstunden < (m.einstellungen.sollWochenstunden || 40)
            ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null,
          springer: false, einschraenkungen: {}, rolle: "mitarbeiter", rolleSeit: e.anker,
          bereich: zuordnung(z.gruppe), status: "aktiv", imSchichtdienst: true }));
        melde(`Einrichtung übernommen: ${einheiten.filter((x) => !x.pool).length} Gruppen, ${dienstarten.length} Dienstarten${neue.length ? `, ${neue.length} Personen` : ""}.`);
        return { ...m, einheitLabel: e.einheitLabel, branche: e.branche, anker: e.anker,
          zyklus: { wochen: Math.ceil(e.tage.length / 7), tage: e.tage, vorlage: null },
          einheiten, dienstarten, personen: [...bestand, ...neue], abweichungen: {} };
      }, "Schichtplanung neu eingerichtet"),

      /* --- Planungsassistent --- */
      oeffneAssistent: () => setAssist(true),
      uebernehmeVorschlag: (erg) => mUpd((m) => {
        const neue = Object.keys(erg.abweichungen).filter((k) => m.abweichungen[k] !== erg.abweichungen[k]);
        const jetzt = new Date().toLocaleString("de-DE");
        const aend = neue.map((k) => { const [pid, d] = k.split("|");
          return { id: uid("c"), personId: pid, datum: d, von: "-", nach: erg.abweichungen[k], zeit: jetzt, vorlauf: vorlauf(d) }; });
        const nachr = istFreigegeben(m, erg.ym) ? neue.map((k) => { const [pid, d] = k.split("|");
          const da = m.dienstarten.find((x) => x.id === erg.abweichungen[k]);
          return baueMitteilung(m, pid, "planGeaendert", `Zusätzlicher Dienst am ${fKurz(d)}`,
            `${da ? da.name : ""} · durch die Planung ergänzt`, "meine"); }).filter(Boolean) : [];
        melde(`${neue.length} Einteilungen übernommen.`);
        return { ...m, abweichungen: erg.abweichungen,
          aenderungen: [...aend, ...(m.aenderungen || [])].slice(0, 800),
          nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Planungsvorschlag übernommen"),

      /* --- Warnen statt sperren (E-19) ---
         Prüft die Einträge eines Vorgangs. Ohne ernsten Befund läuft die
         Aktion sofort, sonst öffnet der Warndialog. Gesperrt wird nie. */
      mitWarnung: (m, vorgang) => {
        const geprueft = (vorgang.eintraege || []).map((e) => ({ ...e,
          ...befundeFuerEinteilung(m, e.personId, e.datum, e.dienstId) }));
        const ernst = geprueft.some((e) => e.technisch || e.befunde.some((b) => stufeRang(b.stufe) >= 2));
        if (!ernst && !vorgang.immerZeigen) {
          vorgang.ausfuehren({ eintraege: geprueft.map((e) => ({ personId: e.personId, datum: e.datum,
            dienstId: e.dienstId, idx: e.idx, befunde: e.befunde })),
          indizes: geprueft.map((e) => e.idx).filter((x) => x !== undefined), gelesen: false, grundArt: null });
          return;
        }
        setWarnung({ ...vorgang, geprueft });
      },

      /* --- Eskalation --- */
      oeffneEskalation: (d, dienstId) => setEskal({ datum: d, dienstId }),
      einsatzanfrage: (d, dienstId, ids) => mUpd((m) => {
        const da = m.dienstarten.find((x) => x.id === dienstId);
        const jetzt = new Date().toLocaleString("de-DE");
        const nachr = ids.map((pid) => baueMitteilung(m, pid, "einspringen",
          `Einsatzanfrage für ${fKurz(d)}`,
          `${da ? da.name : dienstId} · ${da ? `${da.start}–${da.ende}` : ""} — bitte in „Meine Schichten" zusagen oder absagen.`,
          "meine")).filter(Boolean);
        const anf = ids.map((pid) => ({ id: uid("r"), personId: pid, typ: "einsatz", status: "offen",
          erstellt: jetzt, antwort: "", von: d, bis: d, dienstId, text: "Einsatzanfrage der Planung" }));
        melde(`Anfrage an ${ids.length} Personen versandt.`);
        return { ...m, anfragen: [...anf, ...m.anfragen], nachrichten: [...nachr, ...(m.nachrichten || [])].slice(0, 400) };
      }, "Einsatzanfrage versandt"),
      dokumentiereUnterschreitung: (d, dienstId, grund) => mUpd((m) => {
        melde("Unterschreitung dokumentiert.");
        return { ...m, unterschreitungen: [{ id: uid("u"), datum: d, dienstId, grund,
          durch: `${sitz.person.vorname} ${sitz.person.nachname}`, zeit: new Date().toLocaleString("de-DE") },
          ...(m.unterschreitungen || [])] };
      }, "Unterschreitung dokumentiert"),

      /* --- Freizeitausgleich --- */
      oeffneAusgleich: (pid) => setAusgl(pid),
      planeFreischicht: (pid, d) => mUpd((m) => {
        melde("Freischicht eingetragen, das Konto sinkt entsprechend.");
        return { ...m, abwesenheiten: [...m.abwesenheiten,
          { id: uid("a"), personId: pid, art: "ausgleich", von: d, bis: d, notiz: "Freizeitausgleich" }] };
      }, "Freischicht geplant"),

      /* --- Zuschläge --- */
      setzeZuschlag: (id, k, v) => mUpd((m) => ({ ...m, zuschlaege: (m.zuschlaege || []).map((z) => z.id === id ? { ...z, [k]: v } : z) }), null),
      neueZuschlagsregel: () => mUpd((m) => ({ ...m, zuschlaege: [...(m.zuschlaege || []),
        { id: uid("z"), name: "Neue Regel", art: "nacht", prozent: 0, aktiv: false }] }), "Zuschlagsregel angelegt"),
      loescheZuschlag: (id) => mUpd((m) => ({ ...m, zuschlaege: (m.zuschlaege || []).filter((z) => z.id !== id) }), "Zuschlagsregel gelöscht"),

      /* --- Jahresurlaubsrunde --- */
      eroeffneRunde: (jahr) => mUpd((m) => ({ ...m, urlaubsrunde: { jahr, phase: "offen",
        frist: `${jahr - 1}-10-31`, kontingent: {}, wuensche: [], vorjahrZurueck: [] } }), "Urlaubsrunde eröffnet"),
      schliesseRunde: () => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde, phase: "geschlossen" } }), "Wunschphase geschlossen"),
      oeffneRunde: () => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde, phase: "offen" } }), "Wunschphase geöffnet"),
      wunschEintragen: (w) => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde,
        wuensche: [...m.urlaubsrunde.wuensche, { id: uid("w"), personId: sitz.person.id, von: w.von, bis: w.bis,
          prio: w.prio, status: "offen", erstellt: new Date().toISOString() }] } }), "Urlaubswunsch eingetragen"),
      wunschLoeschen: (id) => mUpd((m) => ({ ...m, urlaubsrunde: { ...m.urlaubsrunde,
        wuensche: m.urlaubsrunde.wuensche.filter((x) => x.id !== id) } }), null),
      wunschEntscheiden: (id, ja) => mUpd((m) => {
        const w = m.urlaubsrunde.wuensche.find((x) => x.id === id);
        const p = m.personen.find((x) => x.id === w.personId);
        const jetzt = new Date().toLocaleString("de-DE");
        let next = { ...m, urlaubsrunde: { ...m.urlaubsrunde,
          wuensche: m.urlaubsrunde.wuensche.map((x) => x.id === id ? { ...x, status: ja ? "genehmigt" : "abgelehnt" } : x),
          vorjahrZurueck: ja ? (m.urlaubsrunde.vorjahrZurueck || []).filter((x) => x !== w.personId)
            : [...new Set([...(m.urlaubsrunde.vorjahrZurueck || []), w.personId])] },
          nachrichten: [baueMitteilung(m, w.personId, "antragEntschieden", `Urlaubswunsch ${ja ? "zugesagt" : "abgesagt"}`,
            `${fDatum(w.von)} bis ${fDatum(w.bis)}${ja ? "" : " · du hast bei der nächsten Runde Vorrang"}`, "antraege"),
            ...(m.nachrichten || [])].slice(0, 400) };
        if (ja) next = { ...next, abwesenheiten: [...next.abwesenheiten,
          { id: uid("a"), personId: w.personId, art: "urlaub", von: w.von, bis: w.bis, notiz: "aus der Jahresrunde" }] };
        melde(ja ? `Zugesagt und eingetragen: ${p.nachname}.` : `Abgesagt — ${p.nachname} erhält Vorrang bei der nächsten Runde.`);
        return next;
      }, "Urlaubswunsch entschieden"),

  };
}

/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { uid } from "../../lib/format.js";
import { RADIUS_VORGABE, EINSATZORT_RADIUS_VORGABE } from "../../../server/lib/geo.mjs";
import { PALETTE, waehltEinheit, eigeneEinheitVon, uebergabeAm, besetzung, uebergabenVon, tabelleCSV, vollExport, lohnWarnung, datevCSV, datevSaetze, lohnexportStand, EXPORT_STAND, lohnausgabeDateiname, lohnausgabeText, importGegenBestand } from "../../lib/fachlogik.js";
import { einheitAm } from "../../../server/lib/fachpruefung.mjs";
import { lade } from "../../lib/download.js";
import { exportWarnung } from "../../istdaten.js";

export function aktionenStammdaten(k) {
  const { mUpd, melde, setAusgabe, setImp, sitz } = k;
  return {
      /* --- Beschäftigungsform, Standorte, Import, Dienstbuch --- */
      setzePerson: (pid, k, v) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => p.id === pid ? { ...p, [k]: v } : p) }), null),
      setzeBeschaeftigung: (pid, modus) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid) return p;
        if (modus === "springer") return { ...p, springer: true, teilzeit: null };
        if (modus === "voll") return { ...p, springer: false, teilzeit: null };
        return { ...p, springer: false, teilzeit: { aktiv: true, modus,
          wochentage: (p.teilzeit && p.teilzeit.wochentage) || [0, 1, 2, 3, 4] } };
      }) }), "Beschäftigungsform geändert"),
      toggleWochentag: (pid, i) => mUpd((m) => ({ ...m, personen: m.personen.map((p) => {
        if (p.id !== pid || !p.teilzeit) return p;
        const w = p.teilzeit.wochentage || [];
        return { ...p, teilzeit: { ...p.teilzeit, wochentage: w.includes(i) ? w.filter((x) => x !== i) : [...w, i].sort() } };
      }) }), null),
      /* ------------------------------ Standorte ------------------------
         Anlegen ist ein Verwaltungsvorgang, keine Vertragsänderung mehr —
         ein neuer Standort ist leer und kostet nichts. Was zählt, ist,
         ob er später über die Schwelle in standorte.js hinauswächst;
         das zeigt die Standorte-Seite an, ohne etwas zu blockieren. */
      standortAnlegen: (name, bundesland) => mUpd((m) => ({
        ...m,
        standorte: [...(m.standorte || []),
          { id: uid("st"), name: String(name).trim(), bundesland: bundesland || m.bundesland, radius: RADIUS_VORGABE }],
      }), `Standort „${String(name).trim()}" angelegt`),
      setzeStandort: (id, k, v) => mUpd((m) => ({ ...m, standorte: (m.standorte || []).map((s2) => s2.id === id ? { ...s2, [k]: v } : s2) }), null),
      /* Mehrere Felder in einem Speichervorgang — etwa beide Koordinaten aus
         „Aktuelle Position übernehmen". */
      setzeStandortFelder: (id, felder) => mUpd((m) => ({ ...m, standorte: (m.standorte || []).map((s2) => s2.id === id ? { ...s2, ...felder } : s2) }), null),
      /* Geo-Prüfung beim Stempeln: schalten darf nur die Leitung; wann und von
         wem eingeschaltet wurde, setzt der Server. */
      /* Einschalten nur mit der Bestätigung der betrieblichen Prüfung; der
         Server verlangt das Merkmal in derselben Anfrage und speichert es nie. */
      setzeGeoPruefung: (an) => mUpd((m) => {
        const e = { ...(m.einstellungen || {}), geoPruefung: !!an };
        if (an) e.geoPruefungBestaetigt = true; else delete e.geoPruefungBestaetigt;
        return { ...m, einstellungen: e };
      }, an ? "Standortprüfung beim Stempeln eingeschaltet" : "Standortprüfung beim Stempeln ausgeschaltet"),
      /* Offline-Stempel vertrauen (WP-07): nur org.edit; wann und von wem, setzt der Server. */
      setzeOfflineVertrauen: (an) => mUpd((m) => ({ ...m,
        einstellungen: { ...(m.einstellungen || {}), offlineStempelVertrauen: !!an } }),
        an ? "Stempeln ohne Netz: Prüfung gelockert" : "Stempeln ohne Netz: wieder streng geprüft"),
      /* Prüfmodus der Standortprüfung (WP-20): nur die Leitung; „pflicht" mit Bestätigung in derselben
         Anfrage (Mitbestimmung), Wann/Wer setzt der Server. */
      setzeGeoModus: (modus) => mUpd((m) => {
        const e = { ...(m.einstellungen || {}), geoModus: modus };
        if (modus === "pflicht") e.geoPruefungBestaetigt = true; else delete e.geoPruefungBestaetigt;
        return { ...m, einstellungen: e };
      }, modus === "pflicht" ? "Standortprüfung verpflichtend gestellt" : "Standortprüfung auf Hinweis gestellt"),
      /* Einsatzorte (WP-20): getrennt von den Standorten. */
      einsatzortAnlegen: (name) => mUpd((m) => ({ ...m,
        einsatzorte: [...(m.einsatzorte || []), { id: uid("eo"), name, art: "sonstiger", aktiv: true, radius: EINSATZORT_RADIUS_VORGABE }] }), `Einsatzort „${name}“ angelegt`),
      setzeEinsatzort: (id, felder) => mUpd((m) => ({ ...m,
        einsatzorte: (m.einsatzorte || []).map((o) => o.id === id ? { ...o, ...felder } : o) }), null),
      loescheEinsatzort: (id) => mUpd((m) => {
        const n = (m.dienstarten || []).filter((d) => d.ortModus === "einsatzort" && d.einsatzortId === id).length;
        if (n) { melde(`Der Einsatzort wird noch von ${n} Dienstart(en) verwendet.`); return m; }
        return { ...m, einsatzorte: (m.einsatzorte || []).filter((o) => o.id !== id) };
      }, "Einsatzort gelöscht"),
      /* Planfreigabe als Pflicht (WP-23): nur org.edit; wann und von wem, setzt der Server. */
      setzePlanFreigabePflicht: (an) => mUpd((m) => ({ ...m,
        einstellungen: { ...(m.einstellungen || {}), planFreigabePflicht: !!an } }),
        an ? "Planfreigabe aktiviert" : "Planfreigabe ausgeschaltet"),
      /* Jugendarbeitsschutz „mehrschichtig" (Nachprüfung WP-11): org.edit oder pattern.edit;
         wann und von wem, setzt der Server. */
      setzeJugendMehrschichtig: (an) => mUpd((m) => ({ ...m,
        einstellungen: { ...(m.einstellungen || {}), jugendschutz: { mehrschichtig: !!an } } }),
        an ? "Als mehrschichtiger Betrieb hinterlegt" : "Nicht mehr als mehrschichtiger Betrieb hinterlegt"),
      loescheStandort: (id) => mUpd((m) => {
        const n = m.einheiten.filter((e) => e.standortId === id).length;
        if (n) { melde(`Dem Standort sind noch ${n} Einheiten zugeordnet.`); return m; }
        return { ...m, standorte: (m.standorte || []).filter((s2) => s2.id !== id) };
      }, "Standort gelöscht"),
      oeffneImport: () => setImp(true),
      importieren: (zeilen, anlegen) => mUpd((m) => {
        let einheiten = [...m.einheiten], quals = [...m.qualifikationen];
        if (anlegen) {
          for (const name of [...new Set(zeilen.filter((z) => !z.einheitId).map((z) => z.einheitName))])
            einheiten.push({ id: uid("e"), name, versatz: einheiten.length % m.zyklus.wochen,
              standortId: (m.standorte && m.standorte[0]) ? m.standorte[0].id : null,
              farbe: PALETTE[einheiten.length % PALETTE.length] });
          for (const q of [...new Set(zeilen.flatMap((z) => z.fehlendeQuals))])
            quals.push({ id: uid("q"), name: q, kurz: q.slice(0, 4).toUpperCase(), farbe: PALETTE[quals.length % PALETTE.length] });
        }
        /* IMP-1 Review: nur übernehmbare Zeilen (ok true) werden angelegt; zielId wird hier nie gelesen —
           eine Dublette (ok false) führt zu keinem Schreibpfad, auch nicht zu einer Aktualisierung.
           Eintritt leer (null): zugehoerigkeit.ab und rolleSeit bleiben bewusst null; die Leser
           (einheitAm, rolleAm, zugehoerigkeitsAbschnitte) lesen leeres ab als „von Anfang an“. */
        /* Datenreview PR #130 (3): vor dem Anlegen gegen den aktuellen Bestand (m.personen) — eine vorhandene
           Personalnummer wird nie angelegt, die Zeile mit Fehler übersprungen. */
        const { uebernehmen, uebersprungen } = importGegenBestand(m.personen, zeilen.filter((z) => z.ok === true));
        const neue = uebernehmen.map((z) => {
          const eid = z.einheitId || (einheiten.find((e) => e.name === z.einheitName) || {}).id || einheiten[0].id;
          const zusatz = z.fehlendeQuals.map((q) => (quals.find((x) => x.name === q) || {}).id).filter(Boolean);
          return { id: uid("p"), vorname: z.vorname, nachname: z.nachname, funktion: z.funktion,
            email: z.email || "", personalnummer: z.personalnummer || "",
            zugehoerigkeit: [{ ab: z.eintritt || null, einheitId: eid }], eintritt: z.eintritt || null, austritt: null,
            wochenstunden: z.wochenstunden, urlaubsanspruch: z.urlaubsanspruch, urlaubsuebertrag: 0, stundenuebertrag: 0,
            qualifikationen: [...z.qualifikationen, ...zusatz], einschraenkungen: {}, teilzeit: z.teilzeit, springer: false,
            rolle: z.rolle, bereich: ["leitung", "planer", "betriebsrat"].includes(z.rolle) ? "ALLE" : eid,
            rolleSeit: z.eintritt || null, status: "aktiv" };
        });
        melde(`${neue.length} Personen übernommen.`
          + (uebersprungen.length ? ` Übersprungen: ${uebersprungen.map((u) => u.fehler).join("; ")}.` : ""));
        return { ...m, einheiten, qualifikationen: quals, personen: [...m.personen, ...neue] };
      }, "Personal importiert"),
      dienstbuchEintrag: (datum, art, text, einheitId = null) => mUpd((m) => ({ ...m, dienstbuch: [
        { id: uid("db"), datum, art, text, zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          durch: `${sitz.person.vorname} ${sitz.person.nachname}`, vonId: sitz.person.id,
          einheitId: waehltEinheit(sitz) ? einheitId : eigeneEinheitVon(sitz) }, ...(m.dienstbuch || [])] }), "Dienstbucheintrag"),

      melden: melde,
      /* --- Schichtübergabe --- */
      uebergabeSpeichern: (datum, dienstId, f, einheitWahl = null) => mUpd((m) => {
        const jetzt = new Date().toLocaleString("de-DE");
        const einheitId = waehltEinheit(sitz) ? einheitWahl : eigeneEinheitVon(sitz);
        if (uebergabeAm(m, datum, dienstId, einheitId)) { melde("Für diese Schicht und Einheit gibt es schon eine Übergabe."); return m; }
        const b = besetzung(m, datum)[dienstId];
        const beteiligt = einheitId ? b.personen.filter((p) => einheitAm(p, datum) === einheitId) : b.personen;
        const folge = m.dienstarten.find((d) => !d.posten && d.id !== dienstId);
        melde("Übergabe abgeschlossen. Sie ist ab jetzt unveränderlich.");
        return { ...m, uebergaben: [{ id: uid("u"), datum, dienstId, einheitId,
          lage: f.lage, offen: f.offen, vorkommnis: f.vorkommnis, material: f.material,
          von: `${sitz.person.vorname} ${sitz.person.nachname}`,
          an: folge ? folge.name : null, zeit: jetzt, personen: beteiligt.map((p) => p.id),
          ergaenzungen: [] }, ...uebergabenVon(m)] };
      }, "Übergabe erfasst"),
      uebergabeErgaenzen: (datum, dienstId, text, einheitWahl = null) => mUpd((m) => ({ ...m,
        uebergaben: uebergabenVon(m).map((u) => u === uebergabeAm(m, datum, dienstId,
          waehltEinheit(sitz) ? einheitWahl : eigeneEinheitVon(sitz))
          ? { ...u, ergaenzungen: [...(u.ergaenzungen || []),
              { zeit: new Date().toLocaleString("de-DE"),
                von: `${sitz.person.vorname} ${sitz.person.nachname}`, text }] }
          : u) }), "Ergänzung angehängt"),

      /* --- Gespeicherte Ansichten --- */
      speichereAnsicht: (bereich, name, zustand) => mUpd((m) => ({ ...m,
        ansichten: [...(m.ansichten || []), { id: uid("v"), personId: sitz.person.id,
          bereich, name: name.trim(), zustand }] }), null),
      loescheAnsicht: (id) => mUpd((m) => ({ ...m,
        ansichten: (m.ansichten || []).filter((a) => a.id !== id) }), null),

      /* --- Datenmitnahme --- */
      exportTabelle: (name, zeilen) => {
        const inhalt = tabelleCSV(zeilen);
        const datei = `${sitz.mandant.name.replace(/\W+/g, "_")}_${name}.csv`;
        if (lade(datei, inhalt, "text/csv")) melde(`${zeilen.length} Zeilen ausgegeben.`);
        else setAusgabe({ titel: name, inhalt });
      },
      exportAlles: () => {
        const t = vollExport(sitz.mandant);
        let n = 0;
        for (const [k, zeilen] of Object.entries(t)) {
          if (!zeilen.length) continue;
          lade(`${sitz.mandant.name.replace(/\W+/g, "_")}_${k}.csv`, tabelleCSV(zeilen), "text/csv");
          n++;
        }
        melde(`${n} Dateien ausgegeben — der vollständige Datenbestand.`);
      },

      /* --- DATEV --- */
      exportDATEV: (ym) => {
        /* Ist-Zeiten zur Prüfung (WP-17, W1): Die Datei rechnet dort vorläufig
           mit der Planzeit — vor dem Download ausdrücklich sagen. */
        const warnung = lohnWarnung(sitz.mandant, ym, exportWarnung(sitz.mandant, ym));
        if (warnung && !window.confirm(warnung)) return;
        const inhalt = datevCSV(sitz.mandant, ym);
        const z = datevSaetze(sitz.mandant, ym).length;
        /* Den Stand der ausgegebenen Datei merken (WP-16, Nachtrag dritter Review H-2): Bestätigt wird genau er. */
        const stand = lohnexportStand(sitz.mandant, ym);
        if (stand) EXPORT_STAND.set(`${sitz.mandant.id}|${ym}`, stand); else EXPORT_STAND.delete(`${sitz.mandant.id}|${ym}`);
        if (lade(lohnausgabeDateiname(sitz.mandant, ym, "csv"), inhalt, "text/csv"))
          melde(`${z} Lohnartensätze ausgegeben.`);
        else setAusgabe({ titel: "Lohnausgabe", inhalt });
      },
      exportLohnBlatt: (ym) => {
        const inhalt = lohnausgabeText(sitz.mandant, ym);
        if (lade(lohnausgabeDateiname(sitz.mandant, ym, "txt"),
          inhalt, "text/plain;charset=utf-8")) melde("Blatt zum Gegenlesen heruntergeladen.");
        else setAusgabe({ titel: "Lohnausgabe zum Gegenlesen", inhalt });
      },
  };
}

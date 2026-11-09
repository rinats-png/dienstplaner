/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { heute } from "../../lib/datum.js";
import { stat, baueRechnung, rechnungPDF, rechnungHTML } from "../../lib/fachlogik.js";
import { baueAusAnlage } from "../../lib/mandant-anlage.js";
import { mehrzahl } from "../../lib/rollen.js";
import { pilotSetzen, paketTag, zustimmungErfassen, grundlageErfassen, paketSchalten, grundEntziehen } from "../../paketlogik.js";
import { paketVon } from "../../stufen.js";
import * as SP from "../../speicher.js";
import { rechnungFaellig } from "../../preisgestaltung.js";
import { eur } from "../../lib/format.js";
import { lade } from "../../lib/download.js";

export function aktionenBetreiber(k) {
  const { bLog, db, melde, setAusgabe, setDetail, upd, ym } = k;
  return {
      /* --- Betreiber --- */
      setzeStatus: (id, status) => upd((s) => {
        let stichtag = null;
        if (status === "test") stichtag = window.prompt("Testphase endet am (JJJJ-MM-TT):", heute()) || null;
        if (status === "gekuendigt") stichtag = window.prompt("Kündigung wirksam zum (JJJJ-MM-TT):", heute()) || null;
        const m = s.mandanten.find((x) => x.id === id);
        melde(`${m.name}: ${stat(status).label}.`);
        return bLog({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, status, stichtag } : x) },
          `${m.name}: Status auf „${stat(status).label}" gesetzt`);
      }),
      setzeTarif: (id, t) => upd((s) => bLog({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, tarif: t } : x) },
        `${s.mandanten.find((x) => x.id === id).name}: Tarifwechsel`)),
      setzeMandantFeld: (id, k, v) => upd((s) => ({ ...s, mandanten: s.mandanten.map((x) => x.id === id ? { ...x, [k]: v } : x) })),
      setzeBetreiber: (k, v) => upd((s) => ({ ...s, betreiber: { ...s.betreiber, [k]: v } })),

      /* --------------------------- Preisgestaltung ---------------------
         Alles, was jenseits der drei Tarifstufen vereinbart wurde. Die
         Änderungen werden protokolliert, weil sie Geld betreffen — wer
         einem Betrieb einen Sonderpreis gibt, soll das später erklären
         können.                                                          */
      setzeGestaltung: (id, k, v) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (!m) return s;
        const alt = m.preisgestaltung || {};
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === id
          ? { ...x, preisgestaltung: { ...alt, [k]: v } } : x)) },
        `Preisgestaltung ${m.name}: ${k} gesetzt`);
      }),
      aussetzungHinzu: (id, von, bis, grund) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (!m) return s;
        if (!/^\d{4}-\d{2}$/.test(von || "")) { melde("Bitte einen Monat als JJJJ-MM angeben."); return s; }
        const b = /^\d{4}-\d{2}$/.test(bis || "") ? bis : von;
        if (b < von) { melde("Das Ende liegt vor dem Anfang."); return s; }
        const alt = m.preisgestaltung || {};
        const liste = [...(alt.aussetzungen || []), { von, bis: b, grund: grund || "" }]
          .sort((x, y) => (x.von < y.von ? -1 : 1));
        melde(`Zahlung ausgesetzt: ${von} bis ${b}.`);
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === id
          ? { ...x, preisgestaltung: { ...alt, aussetzungen: liste } } : x)) },
        `Zahlung ausgesetzt für ${m.name}: ${von} bis ${b}`);
      }),
      aussetzungWeg: (id, i) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (!m) return s;
        const alt = m.preisgestaltung || {};
        const liste = (alt.aussetzungen || []).filter((_, k) => k !== i);
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === id
          ? { ...x, preisgestaltung: { ...alt, aussetzungen: liste } } : x)) },
        `Aussetzung zurückgenommen bei ${m.name}`);
      }),
      setzeTarifFeld: (id, k, v) => upd((s) => ({ ...s, tarife: s.tarife.map((t) => t.id === id ? { ...t, [k]: v } : t) })),
      neuerMandant: (f) => upd((s) => {
        const m = baueAusAnlage(f);
        melde(`${m.name} angelegt · ${m.einheiten.filter((e) => !e.pool).length} ${mehrzahl(f.einheitLabel)}, ${m.dienstarten.length} Dienstarten.`);
        return bLog({ ...s, mandanten: [...s.mandanten, m] },
          `Mandant „${m.name}" eingerichtet: ${m.einheiten.filter((e) => !e.pool).length} Einheiten`);
      }),
      /* Pilotbetrieb: nur der Betreiber (diese Konsole), mit Protokoll. */
      /* Pilot: gesonderte, protokollierte Betreiberentscheidung je Betrieb, mit Pflichtgrund.
         Kein Standard- und kein Migrationspfad setzt ihn. */
      setzePilot: (mid, an) => {
        const grund = an ? (window.prompt("Grund für den Pilotbetrieb (Pflicht, wird protokolliert):") || "") : "";
        return upd((s) => {
          const m = s.mandanten.find((x) => x.id === mid);
          if (!m) return s;
          const alt = pilotSetzen(m, an, paketTag(), grund);
          if (!alt) { melde("Ohne Grund kein Pilotbetrieb."); return s; }
          return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === mid ? { ...x, preisgestaltung: alt } : x)) },
            `Pilotbetrieb ${an ? "gesetzt" : "beendet"} bei ${m.name}${an ? ` (Grund: ${grund.trim()})` : ""}`);
        });
      },
      /* Abrechnungsgrund (a): ausdrückliche Zustimmung des Kunden, mit Paket, Preis und Intervall bestätigt. */
      erfasseZustimmung: (mid, paket) => {
        const m0 = db.mandanten.find((x) => x.id === mid);
        const r0 = m0 ? zustimmungErfassen(m0, paket, paketTag(), "Betreiber (Zustimmung des Kunden liegt vor)") : null;
        if (!r0 || !r0.ok) return melde(r0 ? r0.grund : "Betrieb nicht gefunden.");
        const e = r0.eintrag;
        if (!window.confirm(`Zustimmung des Kunden festhalten?\n\nPaket: ${paketVon(paket).name}\nPreis: ${e.preis} € ${e.intervall} (wiederkehrend)\nBerechnet wird erst ab dem Folgemonat; das Datum setzt der Server.`)) return;
        upd((s) => bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id !== mid ? x
          : { ...x, paketZustimmungen: [...(Array.isArray(x.paketZustimmungen) ? x.paketZustimmungen : []).filter((z) => z.paket !== paket), e] })) },
          `Zustimmung zu Paket ${paketVon(paket).name} bei ${m0.name} festgehalten (${e.preis} € ${e.intervall})`));
      },
      /* Abrechnungsgrund (b): vom Betreiber dokumentierte vertragliche Grundlage JE PAKET mit Preis
         (Review M2; Wirksamkeit prüft der Betreiber/Jurist). */
      setzeGrundlage: (mid, paket) => {
        const m0 = db.mandanten.find((x) => x.id === mid);
        const notiz = window.prompt(`Vertragliche Grundlage für die Berechnung des Pakets ${paketVon(paket).name} (Verweis/Notiz, Pflicht):`) || "";
        const r0 = m0 ? grundlageErfassen(m0, paket, paketTag(), notiz, "Betreiber") : null;
        if (!r0 || !r0.ok) return melde(r0 ? r0.grund : "Betrieb nicht gefunden.");
        const e = r0.eintrag;
        if (!window.confirm(`Vertragliche Grundlage festhalten?\n\nPaket: ${paketVon(paket).name}\nPreis: ${e.preis} € ${e.intervall} (wiederkehrend)\nVerweis: ${e.notiz}\nBerechnet wird erst ab dem Folgemonat; das Datum setzt der Server.`)) return;
        upd((s) => bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id !== mid ? x
          : { ...x, paketGrundlage: [...(Array.isArray(x.paketGrundlage) ? x.paketGrundlage : []).filter((g) => g.paket !== paket), e] })) },
          `Vertragliche Grundlage für Paket ${paketVon(paket).name} bei ${m0.name} festgehalten (${e.preis} € ${e.intervall})`));
      },
      /* G9: unter Zustand 5 lässt sich ein Paket nur im Pilot zubuchen (nicht berechnet);
         Abschalten geht immer und entzieht Zustimmung/Grundlage des Pakets (Review M1).
         Die Entscheidung steht in paketlogik.js (paketSchalten, grundEntziehen). */
      setzePaket: (mid, paket, an) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === mid);
        if (!m) return s;
        const r = paketSchalten(m, paket, an);
        if (!r.ok) { melde(r.grund); return s; }
        return bLog({ ...s, mandanten: s.mandanten.map((x) => (x.id === mid ? { ...x, pakete: r.pakete, ...(an ? {} : grundEntziehen(x, paket)) } : x)) },
          `Paket ${paketVon(paket).name} bei ${m.name} ${an ? "zugebucht" : "abgeschaltet"}`);
      }),
      loescheMandant: (id) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        if (window.prompt(`Löscht Mandant, Einheiten, Personal und Pläne unwiderruflich.\nZur Bestätigung den Namen eingeben:\n\n${m.name}`) !== m.name) {
          melde("Löschung abgebrochen."); return s; }
        /* Der Datenraum auf dem Server geht mit — Bestand, Monatsscherben,
           Sicherungen, Zugangscodes und offene Sitzungen. Vorher verschwand
           der Betrieb nur aus der Konsole; die Daten lagen weiter im
           Speicher, ohne dass jemand sie je wieder erreicht hätte. Das
           Löschkonzept verlangt, dass „gelöscht" auch gelöscht heißt.
           SI-P6 (Review M1): Aus der Liste geht der Mandant erst, wenn der
           Server die Löschung als vollständig meldet. Sonst bleibt er stehen,
           damit dieselbe Löschung erneut ausgeführt werden kann — ein halb
           gelöschter Raum ist bis dahin für neue Zugänge gesperrt. */
        const entfernen = (st) => bLog({ ...st, mandanten: st.mandanten.filter((x) => x.id !== id),
          rechnungen: st.rechnungen.filter((r) => r.mandantId !== id) }, `Mandant „${m.name}" gelöscht`);
        if (!m.raum) { melde(`${m.name} gelöscht.`); setDetail(null); return entfernen(s); }
        SP.raumLoeschen(m.raum)
          .then((r) => { melde(`${m.name} gelöscht — Datenraum „${m.raum}" (${r.geloescht} Einträge).`); setDetail(null); upd(entfernen); })
          .catch((e) => melde(`Löschung unvollständig – erneut ausführen. ${e.message}`));
        return s;
      }),
      rechnungStellen: (id) => upd((s) => {
        const m = s.mandanten.find((x) => x.id === id);
        /* Eine Rechnung über null Euro ist keine Freundlichkeit, sondern ein
           Beleg, den jemand ablegen, prüfen und acht Jahre aufbewahren muss
           (Buchungsbeleg, § 147 Abs. 3 AO). */
        const f = rechnungFaellig(m, ym);
        if (!f.faellig) {
          melde(f.grund === "ausgesetzt"
            ? "Für diesen Monat ist die Zahlung ausgesetzt — keine Rechnung."
            : "Dieser Monat ist kostenlos vereinbart — keine Rechnung.");
          return s;
        }
        const rg = baueRechnung(s, m, ym);
        if (s.rechnungen.some((r) => r.nummer === rg.nummer)) { melde("Für diesen Zeitraum liegt bereits eine Rechnung vor."); return s; }
        melde(`Rechnung ${rg.nummer} erzeugt.`);
        return bLog({ ...s, rechnungen: [rg, ...s.rechnungen] }, `Rechnung ${rg.nummer} für ${m.name} über ${eur(rg.brutto)}`);
      }),
      rechnungslauf: (monat) => upd((s) => {
        const neu = [];
        let uebersprungen = 0;
        for (const m of s.mandanten) {
          if (!stat(m.status).zahlt) continue;
          const f = rechnungFaellig(m, monat);
          if (!f.faellig) { uebersprungen++; continue; }
          const rg = baueRechnung(s, m, monat);
          if (s.rechnungen.some((r) => r.nummer === rg.nummer)) continue;
          neu.push(rg);
        }
        /* Übersprungene werden genannt, nicht verschwiegen. Ein Lauf, der
           still weniger Rechnungen erzeugt als erwartet, ist der Anfang
           eines langen Suchtages. */
        const nachsatz = uebersprungen
          ? ` · ${uebersprungen} ${uebersprungen === 1 ? "Betrieb" : "Betriebe"} ausgesetzt oder kostenlos`
          : "";
        melde(neu.length
          ? `${neu.length} Rechnungen erzeugt.${nachsatz}`
          : `Keine neuen Rechnungen.${nachsatz}`);
        return bLog({ ...s, rechnungen: [...neu, ...s.rechnungen] },
          `Rechnungslauf ${monat}: ${neu.length} Rechnungen${nachsatz}`);
      }),
      rechnungenLeeren: () => upd((s) => { melde("Rechnungsausgang geleert."); return { ...s, rechnungen: [] }; }),
      rechnungPDF: (rg) => {
        const bytes = rechnungPDF(rg);
        if (lade(`${rg.nummer}.pdf`, bytes, "application/pdf")) melde("PDF erstellt.");
        else setAusgabe({ titel: `${rg.nummer}.pdf`, inhalt: "Die PDF-Datei kann in dieser Umgebung nicht gespeichert werden. Nutze stattdessen die Word-Ausgabe oder den Ausdruck." });
      },
      rechnungWord: (rg) => {
        const html = rechnungHTML(rg);
        if (lade(`${rg.nummer}.doc`, html, "application/msword")) melde("Word-Dokument erstellt.");
        else setAusgabe({ titel: `${rg.nummer}.doc`, inhalt: html });
      },

  };
}

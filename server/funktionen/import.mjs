/* ==========================================================================
   IMPORT — /api/import (IMP-3)

   Vier Schritte, je eine Unterroute (alle POST, alle mit Sitzung):

     /api/import/upload      Datei annehmen (Rumpf = Datei, application/octet-stream),
                             Parser aus IMP-2 aufrufen, Ergebnis als Vorgang halten.
     /api/import/analyse     Spalten, Zuordnung, Dubletten, Konflikte.
     /api/import/vorschau    Entscheidungen je Datensatz → Plan: betroffene
                             Datensätze, neue Einheiten, Zeitraum; Bestätigungscode.
     /api/import/uebernahme  Nur mit dem Bestätigungscode der letzten Vorschau.
                             Ganz oder gar nicht (lib/import/uebernahme.mjs).
     /api/import/verwerfen   Vorgang sofort löschen.

   Registrierung: Die Pfade stehen unten in `config.path` — server.mjs lädt
   jede Datei aus server/funktionen/ selbst (genaue Pfade vor dem Präfix
   „/api/*" von daten.mjs). `config.rumpfMaxJeWeg` hebt die Rumpfgrenze nur für
   /api/import/upload auf 10 MB (Dateigrenze aus IMPORT-VERTRAG.md §3); analyse, vorschau, uebernahme und
   verwerfen (JSON) bleiben bei 2 MB. server.mjs liest den Rumpf vor jeder Anmeldeprüfung — die Grenze
   je Weg begrenzt also, was ein Unangemeldeter pro Anfrage in den Speicher laden kann.

   Rollen: Import nur mit staff.edit UND vollem Schreibumfang (Leitung, Planung);
   Betreiber und die alte Rückfallrolle „kunde" nie (Review-Auflage). Neue Einheiten/Standorte/Qualifikationen zusätzlich nur mit org.edit (Leitung).
   Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber: 403.
   Der Betrieb kommt ausschließlich aus der Sitzung (eigenerMandant); ein
   Vorgang eines anderen Betriebs, Raums oder einer anderen Person ist „nicht
   gefunden" (404), ohne weitere Auskunft.

   Datenschutz: Die Datei wird nur im Speicher gelesen und nach dem Parsen
   verworfen; gespeichert wird nur ihr Hashwert (Wiederholschutz). Keine Zeile
   des Protokolls enthält Dateiname, Zellinhalt, Name oder E-Mail — nur
   Zahlen, Codes und die Person-Id der handelnden Person. Fehlermeldungen
   nennen Felder, keine Werte, und nie einen Stacktrace.
   ========================================================================== */

import { createHash } from "node:crypto";
import { getStore } from "../lib/ablage.mjs";
import { importAn } from "../lib/schalter.mjs";
import { bremse, kennung, herkunft, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { bestandLesenStreng, voruebergehend } from "../lib/bestand.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { eigenerMandant, wirksameRolle, sitzungsRolleBekannt, darf, schreibumfang, SCHREIBEN_VOLL } from "../lib/rechte.mjs";
import { heuteBerlin } from "../lib/zeiterfassung.mjs";
import { parseDatei, STANDARD_GRENZEN } from "../lib/import/parser.mjs";
import { analysieren, planen, datumAnzeige } from "../lib/import/personen.mjs";
import { besitzAus, vorgangAnlegen, vorgangFuellen, vorgangHolen, vorgangEntfernen, alsUebernommen, FRISTEN,
  parserPlatzBelegen, _pruefhaken as _importPruefhaken } from "../lib/import/vorgaenge.mjs";
import { uebernehmen, erledigteAufraeumen } from "../lib/import/uebernahme.mjs";
import { schichtVorschauMitSpeicher, blaetterErkennen, HINWEIS_NUR_VORSCHAU } from "../lib/import/schichtvorschau.mjs";

const laden = () => getStore({ name: "centric", consistency: "strong" });
const ARTEN = ["personal", "schichtzyklus"];
const JSON_MAX = 2 * 1024 * 1024;
/** Nur Anzeige: Stammt die Datei aus dem Datumssystem 1904, hat der Parser die Werte bereits umgerechnet. */
const datumHinweis = (v) => v.datumssystemQuelle === "1904" ? { datumHinweis: "Datei im System 1904, Werte umgerechnet" } : {};

const antwort = (daten, status = 200) => new Response(JSON.stringify(daten), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const fehlerAntwort = (status, code, fehler, mehr = {}) => antwort({ fehler, code, ...mehr }, status);
const NICHT_GEFUNDEN = () => fehlerAntwort(404, "NICHT_GEFUNDEN", "Importvorgang nicht gefunden.");
const parserBelegt = (fehler) => new Response(JSON.stringify({ fehler, code: "ZU_VIEL_GLEICHZEITIG" }), { status: 503,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": "5", "x-content-type-options": "nosniff" } });

async function jsonLesen(req) {
  if (Number(req.headers.get("content-length") || 0) > JSON_MAX) return null;
  let t;
  try { t = await req.text(); } catch { return null; }
  if (t.length > JSON_MAX) return null;
  try { const d = JSON.parse(t || "{}"); return d && typeof d === "object" && !Array.isArray(d) ? d : null; } catch { return null; }
}

/** Nur eigene Schlüssel mit erlaubten Werten übernehmen (keine Prototyp-Spielereien, keine Fremdwerte). */
function auswahlBereinigt(roh, erlaubt) {
  const aus = Object.create(null);
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return aus;
  for (const k of Object.keys(roh)) if (/^[1-9][0-9]{0,5}$/.test(k) && erlaubt(roh[k])) aus[k] = roh[k];
  return aus;
}

function vorschauAus(plan, analyse) {
  const nach = new Map(analyse.datensaetze.map((d) => [d.datensatz, d]));
  return {
    neu: plan.neu.map((n) => ({ datensatz: n.datensatz, nachname: n.werte.nachname, vorname: n.werte.vorname,
      personalnummer: n.werte.personalnummer || null, einheit: n.werte.einheit, eintritt: n.werte.eintritt,
      /* Freigabe Betreiber: die Vorschau zeigt genau das Datum, das gespeichert wird (bereits umgerechnet); leer → „nicht angegeben". */
      eintrittAnzeige: datumAnzeige(n.werte.eintritt),
      neueEinheit: !n.einheitId, qualifikationen: (nach.get(n.datensatz) || {}).qualifikationenAnzeige || [], hinweise: (nach.get(n.datensatz) || {}).hinweise || [] })),
    aktualisieren: plan.aktualisieren.map((a) => ({ datensatz: a.datensatz, personId: a.personId, aenderungen: a.aenderungen })),
    uebersprungen: plan.uebersprungen, offen: plan.offen,
    neueEinheiten: plan.neueEinheiten, neueStandorte: plan.neueStandorte, neueQualifikationen: plan.neueQualifikationen || [],
    zeitraum: plan.zeitraum, zyklen: plan.zyklen,
  };
}

const ERSTES_BLATT = (blaetter) => Math.max(0, blaetter.findIndex((b) => Array.isArray(b.zeilen) && b.zeilen.length > 0));

/* Schalter CENTRIC_IMPORT_AKTIV (server/lib/schalter.mjs), Vorgabe aus: Dann gibt es den Weg nicht (404) — vor
   Methode, Herkunft, Sitzung und Rumpf. server.mjs prüft denselben Schalter (`config.aktiv`) schon vor dem Einlesen. */
const AUS = () => antwort({ fehler: "Gibt es nicht." }, 404);

export default async (req) => {
  if (!importAn()) return AUS();
  const url = new URL(req.url);
  const schritt = url.pathname.replace(/^\/api\/import\//, "");
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  if (!herkunftErlaubt(req)) return fehlerAntwort(403, "HERKUNFT", "Diese Anfrage kommt nicht von der Anwendung.");
  const store = laden();
  let k = kennung(req, null);
  let wer = { weg: `import/${schritt}`, verfahren: req.method, herkunft: herkunft(req) };
  try {
    /* -------------------- Sitzung, Rolle, eigener Betrieb -------------------- */
    let gelesen;
    const lese = await arbeitssitzungLesen(req, { store, bestandLader: async (s0) => (gelesen = await bestandLesenStreng(store, s0.bestand)) });
    if (!lese.sitzung) return fehlerAntwort(401, "NICHT_ANGEMELDET", "Nicht angemeldet.");
    const s0 = lese.sitzung;
    if (gelesen === undefined) gelesen = await bestandLesenStreng(store, s0.bestand);
    const bestand = gelesen && gelesen.bestand;
    const s = s0.rolle === "betreiber" || s0.person === null || s0.person === undefined ? s0 : { ...s0, rolle: wirksameRolle(s0, bestand) };
    k = kennung(req, s);
    const eigener = bestand && s.rolle !== "betreiber" ? eigenerMandant(bestand, s) : null;
    wer = { ...wer, rolle: s.rolle, person: s.person ?? null, mandantId: eigener ? eigener.id : null };
    /* Auflage (IMP-3-Review): Betreiber und die alte Rückfallrolle „kunde" (Zugang ohne Person/Rolle) importieren nie —
       Personaldaten gehören dem Betrieb und werden nur von Leitung und Planung mit Person übernommen. */
    if (s.rolle === "betreiber" || s.rolle === "kunde" || !sitzungsRolleBekannt(s.rolle) || !darf(s.rolle, "staff.edit") || schreibumfang(s.rolle) !== SCHREIBEN_VOLL) {
      await protokoll("import", k, "abgewiesen", "Rolle ohne Importrecht", wer);
      return fehlerAntwort(403, "KEINE_BERECHTIGUNG", "Den Import dürfen nur Leitung und Planung verwenden.");
    }
    if (!eigener || eigener.id === undefined || eigener.id === null) return NICHT_GEFUNDEN();
    const besitz = besitzAus(s, eigener.id);
    const orgEdit = darf(s.rolle, "org.edit");
    const heute = heuteBerlin();

    /* ------------------------------- Upload -------------------------------- */
    if (schritt === "upload") {
      const art = url.searchParams.get("art") || "personal";
      if (!ARTEN.includes(art)) return fehlerAntwort(400, "ART_UNBEKANNT", "Diese Importart gibt es nicht.");
      const typ = String(req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (typ !== "application/octet-stream")
        return fehlerAntwort(415, "FORMAT_DER_ANFRAGE", "Die Datei muss als application/octet-stream gesendet werden.");
      if (Number(req.headers.get("content-length") || 0) > STANDARD_GRENZEN.dateiBytes)
        return fehlerAntwort(413, "DATEI_ZU_GROSS", "Die Datei ist zu groß (erlaubt sind höchstens 10 MB).");
      const b = await bremse("schreiben", k);
      if (!b.frei) return zuVielAntwort(b.wartet);
      /* Auflage 3 (IMP-3-Review): Die Vorgangsgrenze (3 je Raum, 20 gesamt) gilt VOR dem Lesen des Rumpfs und
         dem Parsen, nicht danach. Der Platz wird jetzt belegt und bei jedem Fehlschlag wieder freigegeben. */
      const platz = vorgangAnlegen(besitz, { art, dateiHash: null, format: null, blaetter: null,
        zeilen: null, zuordnung: null, analyse: null, plan: null });
      if (!platz.ok)
        return fehlerAntwort(429, platz.code, "Gerade laufen zu viele Importe. Bitte einen offenen Import abschließen oder später erneut versuchen.");
      const vorgangPlatz = platz.vorgang;
      /* Delta-Review 4a: höchstens ein Parser je Raum (vorgaenge.mjs), zusätzlich zur prozessweiten Grenze. Geprüft vor
         dem Lesen des Rumpfs; ein überzähliger Upload desselben Raums wird sofort mit 503 abgewiesen. */
      const raumPlatz = parserPlatzBelegen(besitz.raum);
      if (!raumPlatz) {
        vorgangEntfernen(vorgangPlatz.id);
        await protokoll("import", k, "abgewiesen", "Datei: Parser des Raums belegt", wer);
        return parserBelegt("Für diesen Betrieb wird gerade schon eine Datei gelesen. Bitte in einigen Sekunden noch einmal versuchen.");
      }
      let erg, dateiHash;
      try {
        if (_importPruefhaken.vorParser) await _importPruefhaken.vorParser({ raum: besitz.raum });
        let buffer = new Uint8Array(await req.arrayBuffer());
        let name = "";
        try { name = decodeURIComponent(String(req.headers.get("x-dateiname") || "")).slice(0, 255); } catch { name = ""; }
        /* Grenzen: immer die Standardgrenzen des Vertrags (10 MB / 100 MB / 20.000 Zeilen / 200 Spalten / 20 Blätter),
           nie Werte aus der Anfrage. Gleichzeitige Parser-Worker sind global begrenzt (parser.mjs). */
        erg = await parseDatei({ buffer, name });
        dateiHash = createHash("sha256").update(buffer).digest("hex");
        buffer = null;   // Die Datei wird nicht über die Verarbeitung hinaus gehalten.
        name = "";
      } catch (e) { vorgangEntfernen(vorgangPlatz.id); throw e; } finally { raumPlatz(); }
      if (!erg.ok) {
        vorgangEntfernen(vorgangPlatz.id);
        if (erg.code === "ZU_VIEL_GLEICHZEITIG") {
          await protokoll("import", k, "abgewiesen", "Datei: Parser ausgelastet", wer);
          return parserBelegt(erg.nachricht);
        }
        await protokoll("import", k, "abgewiesen", `Datei: ${erg.code}`, wer);
        return fehlerAntwort(erg.code === "DATEI_ZU_GROSS" ? 413 : 422, erg.code, erg.nachricht);
      }
      /* Datum nur über den Parser: IMP-2 liefert die Werte bereits im System 1900. `datumssystemQuelle` (nur bei 1904)
         dient allein der Anzeige; umgerechnet wird hier nichts. */
      const angelegt = { vorgang: vorgangFuellen(vorgangPlatz, { dateiHash, format: erg.format, blaetter: erg.blaetter,
        datumssystemQuelle: erg.datumssystemQuelle === "1904" ? "1904" : null }) };
      void erledigteAufraeumen(store, besitz.raum);
      const zeilen = erg.blaetter.reduce((a, bl) => a + Math.max(0, bl.zeilen.length - 1), 0);
      await protokoll("import", k, "hochgeladen", `Format ${erg.format} · ${erg.blaetter.length} Blätter · ${zeilen} Datenzeilen`, wer);
      return antwort({ vorgang: angelegt.vorgang.id, art, format: erg.format,
        blaetter: erg.blaetter.map((bl, i) => ({ index: i, name: bl.name, datenzeilen: Math.max(0, bl.zeilen.length - 1),
          spalten: bl.zeilen.length ? bl.zeilen[0].length : 0 })),
        vorgabeBlatt: ERSTES_BLATT(erg.blaetter),
        hinweise: (erg.hinweise || []).map((h) => ({ code: h.code, nachricht: h.nachricht, blatt: h.blatt, anzahl: h.anzahl })),
        gueltigBis: new Date(Date.now() + FRISTEN.hoechstMs).toISOString(), inaktivMinuten: FRISTEN.inaktivMs / 60000 }, 201);
    }

    const rumpf = await jsonLesen(req);
    if (!rumpf) return fehlerAntwort(400, "RUMPF_UNGUELTIG", "Die Anfrage ist ungültig.");
    const v = vorgangHolen(rumpf.vorgang, besitz);
    if (!v) return NICHT_GEFUNDEN();

    /* ------------------------------ Verwerfen ------------------------------ */
    if (schritt === "verwerfen") {
      vorgangEntfernen(v.id);
      await protokoll("import", k, "verworfen", "Vorgang verworfen", wer);
      return antwort({ ok: true });
    }

    if (v.zustand === "uebernommen")
      return fehlerAntwort(409, "BEREITS_UEBERNOMMEN", "Dieser Import wurde bereits übernommen.", { ergebnis: v.ergebnis });
    /* Delta-Review 3a: Solange die Übernahme läuft, ändert keine Analyse oder Vorschau (zweiter Tab, Doppelklick)
       den Vorgang — sonst könnte unter der bestätigten Vorschau ein anderer Plan geschrieben werden. */
    if (v.laeuft && (schritt === "analyse" || schritt === "vorschau"))
      return fehlerAntwort(409, "UEBERNAHME_LAEUFT", "Für diesen Import läuft gerade die Übernahme. Bitte deren Ergebnis abwarten.");

    /* ------------------------------- Analyse ------------------------------- */
    if (schritt === "analyse") {
      const blatt = rumpf.blatt === undefined ? ERSTES_BLATT(v.blaetter) : rumpf.blatt;
      if (!Number.isInteger(blatt) || blatt < 0 || blatt >= v.blaetter.length) return fehlerAntwort(422, "BLATT_UNGUELTIG", "Dieses Tabellenblatt gibt es nicht.");
      const zeilen = v.blaetter[blatt].zeilen;
      if (v.art === "schichtzyklus") {
        /* IMP-6: Schichtmodelle, nur Analyse und Vorschau (lesend, nichts wird geschrieben; schichtvorschau.mjs). Modelltabelle:
           das gewählte Blatt, sonst das erste Blatt mit Modellspalten; Zuordnungstabelle: `zuordnungBlatt` (null = keine), sonst
           automatisch. Keine Begrenzung auf einen Zyklus je Betrieb. */
        const br = await bremse("schreiben", k);   // Rechenweg: gleiche Bremse wie Upload und Übernahme
        if (!br.frei) return zuVielAntwort(br.wartet);
        const erkannt = blaetterErkennen(v.blaetter);
        const mBlatt = rumpf.blatt !== undefined ? blatt : erkannt.modell !== null ? erkannt.modell : blatt;
        let zBlatt = rumpf.zuordnungBlatt === undefined ? (erkannt.zuordnung === mBlatt ? null : erkannt.zuordnung) : rumpf.zuordnungBlatt;
        if (zBlatt !== null && (!Number.isInteger(zBlatt) || zBlatt < 0 || zBlatt >= v.blaetter.length || zBlatt === mBlatt))
          return fehlerAntwort(422, "BLATT_UNGUELTIG", "Dieses Tabellenblatt gibt es nicht.");
        const mZeilen = v.blaetter[mBlatt].zeilen;
        const zZeilen = zBlatt === null ? null : v.blaetter[zBlatt].zeilen;
        const sv = schichtVorschauMitSpeicher({ raum: besitz.raum, vorgang: v.id }, { mandant: eigener, modellZeilen: mZeilen, zuordnungZeilen: zZeilen, zuordnung: rumpf.zuordnung });
        if (!sv.ok) return fehlerAntwort(422, sv.code, sv.nachricht);
        v.zeilen = mZeilen; v.zuordnungZeilen = zZeilen; v.zuordnung = rumpf.zuordnung === undefined ? undefined : rumpf.zuordnung;
        v.analyse = { art: v.art }; v.plan = null;
        const { ok: _ok, ...ergebnis } = sv;
        return antwort({ art: v.art, unterstuetzt: false, nurVorschau: true, hinweis: HINWEIS_NUR_VORSCHAU, blatt: mBlatt,
          zuordnungBlatt: zBlatt, ...ergebnis });
      }
      const a = analysieren({ mandant: eigener, zeilen, zuordnung: rumpf.zuordnung, heute });
      if (!a.ok) return fehlerAntwort(422, a.code, a.nachricht);
      v.zeilen = zeilen; v.zuordnung = a.zuordnung; v.analyse = { art: v.art }; v.plan = null;
      return antwort({ art: v.art, blatt, spalten: a.spalten, zuordnung: a.zuordnung, fehlendePflicht: a.fehlendePflicht,
        datensaetze: a.datensaetze.map((d) => ({ datensatz: d.datensatz, werte: d.werte, fehler: d.fehler, hinweise: d.hinweise,
          konflikte: d.konflikte, dublette: d.dublette, erlaubt: d.erlaubt, vorgabe: d.vorgabe, qualifikationen: d.qualifikationenAnzeige })),
        zaehler: a.zaehler, ...datumHinweis(v) });
    }

    /* ------------------------------- Vorschau ------------------------------ */
    if (schritt === "vorschau") {
      if (!v.analyse) return fehlerAntwort(409, "ANALYSE_FEHLT", "Bitte zuerst die Analyse ausführen.");
      if (v.art === "schichtzyklus") {
        const br = await bremse("schreiben", k);
        if (!br.frei) return zuVielAntwort(br.wartet);
        const sv = schichtVorschauMitSpeicher({ raum: besitz.raum, vorgang: v.id }, { mandant: eigener, modellZeilen: v.zeilen, zuordnungZeilen: v.zuordnungZeilen || null, zuordnung: v.zuordnung });
        if (!sv.ok) return fehlerAntwort(422, sv.code, sv.nachricht);
        const { ok: _ok, ...ergebnis } = sv;
        return antwort({ art: v.art, unterstuetzt: false, nurVorschau: true, vorschau: { ...ergebnis, zeitraum: null }, bereit: false,
          hinweis: HINWEIS_NUR_VORSCHAU });
      }
      const a = analysieren({ mandant: eigener, zeilen: v.zeilen, zuordnung: v.zuordnung, heute });
      if (!a.ok) return fehlerAntwort(422, a.code, a.nachricht);
      if (a.fehlendePflicht.length)
        return fehlerAntwort(422, "PFLICHTSPALTE_FEHLT", "Nicht alle Pflichtspalten sind zugeordnet.", { fehlendePflicht: a.fehlendePflicht });
      const entscheidungen = auswahlBereinigt(rumpf.entscheidungen, (x) => typeof x === "string");
      const bestaetigungen = auswahlBereinigt(rumpf.bestaetigungen, (x) => x === true);
      const einheitenAnlegen = rumpf.einheitenAnlegen === true;
      const p = planen({ mandant: eigener, analyse: a, entscheidungen, bestaetigungen, einheitenAnlegen, orgEdit });
      if (!p.ok) {
        if (p.code === "ORG_EDIT_FEHLT") await protokoll("import", k, "abgewiesen", "Einheiten, Standorte oder Qualifikationen anlegen ohne org.edit", wer);
        return fehlerAntwort(p.status, p.code, p.nachricht, p.datensaetze ? { datensaetze: p.datensaetze } : {});
      }
      v.entscheidungen = entscheidungen; v.bestaetigungen = bestaetigungen; v.einheitenAnlegen = einheitenAnlegen;
      v.plan = { hash: p.hash, zaehler: p.zaehler };
      return antwort({ art: v.art, vorschau: vorschauAus(p.plan, a), zaehler: p.zaehler,
        bereit: p.zaehler.neu + p.zaehler.aktualisiert > 0, bestaetigung: p.hash, ...datumHinweis(v) });
    }

    /* ------------------------------ Übernahme ------------------------------ */
    if (schritt === "uebernahme") {
      if (v.art !== "personal")
        return fehlerAntwort(422, "ART_NICHT_FREIGEGEBEN", "Schichtmodelle werden noch nicht übernommen. Es wurde nichts geändert.", { schichtmodelleUebernommen: false });
      if (!v.plan) return fehlerAntwort(409, "VORSCHAU_FEHLT", "Bitte zuerst die Vorschau erstellen und prüfen.");
      if (typeof rumpf.bestaetigung !== "string" || !rumpf.bestaetigung)
        return fehlerAntwort(409, "BESTAETIGUNG_UNGUELTIG", "Die Übernahme braucht die Bestätigung der aktuellen Vorschau.");
      if (v.laeuft) return fehlerAntwort(409, "LAEUFT_BEREITS", "Diese Übernahme läuft bereits.");
      /* Delta-Review 3a: Eine Bestätigung einer älteren Vorschau (etwa aus einem zweiten Tab überholt) ist veraltet. */
      if (rumpf.bestaetigung !== v.plan.hash)
        return fehlerAntwort(409, "VORSCHAU_VERALTET", "Die Bestätigung gehört nicht zur aktuellen Vorschau. Bitte die Vorschau erneut prüfen. Es wurde nichts geändert.");
      /* Delta-Review 3a: Die Marke „läuft" wird VOR dem ersten await gesetzt (keine Lücke für einen Doppelklick), und
         die Übernahme arbeitet mit einer Momentaufnahme der Entscheidungen und der Bestätigung aus DIESER Anfrage —
         nicht mit dem, was der Vorgang später enthält. */
      v.laeuft = true;
      const momentaufnahme = { zeilen: v.zeilen, zuordnung: v.zuordnung, dateiHash: v.dateiHash,
        entscheidungen: Object.assign(Object.create(null), v.entscheidungen),
        bestaetigungen: Object.assign(Object.create(null), v.bestaetigungen), einheitenAnlegen: v.einheitenAnlegen === true };
      let r;
      try {
        const b = await bremse("schreiben", k);
        if (!b.frei) return zuVielAntwort(b.wartet);
        r = await uebernehmen({ store, sitzung: s, vorgang: v, bestaetigung: rumpf.bestaetigung, momentaufnahme, heute, orgEdit,
          protokolliere: (ausgang, zusatz) => protokoll("import", k, ausgang, `Übernahme: ${zusatz}`, wer) });
      } finally { v.laeuft = false; }
      if (!r.ok) {
        await protokoll("import", k, "abgewiesen", `Übernahme: ${r.code}`, wer);
        return fehlerAntwort(r.status, r.code, r.nachricht, r.frueher ? { frueher: r.frueher } : {});
      }
      alsUebernommen(v, { zaehler: r.zaehler, zeit: r.zeit });
      const z = r.zaehler;
      await protokoll("import", k, "erfolg", `neu ${z.neu} · aktualisiert ${z.aktualisiert} · übersprungen ${z.uebersprungen}`
        + ` · Einheiten neu ${z.neueEinheiten} · Standorte neu ${z.neueStandorte}`, wer);
      return antwort({ ok: true, zaehler: z, etag: r.stand });
    }

    return fehlerAntwort(404, "NICHT_GEFUNDEN", "Nicht gefunden.");
  } catch (e) {
    if (voruebergehend(e))
      return fehlerAntwort(503, "VORUEBERGEHEND", "Gerade nicht verfügbar. Bitte in einigen Sekunden noch einmal versuchen.");
    /* Kein Stacktrace, kein Text der Ausnahme nach außen und ins Protokoll — er könnte Werte tragen. */
    await protokoll("fehler", k, "import", "unerwarteter Fehler", wer).catch(() => {});
    return fehlerAntwort(500, "INTERNER_FEHLER", "Beim Import ist ein Fehler aufgetreten. Es wurde nichts übernommen.");
  }
};

export const config = {
  path: ["/api/import/upload", "/api/import/analyse", "/api/import/vorschau", "/api/import/uebernahme", "/api/import/verwerfen"],
  aktiv: importAn,   // server.mjs: aus → 404 vor dem Einlesen des Rumpfs
  rumpfMax: 10 * 1024 * 1024,   // Obergrenze der Datei (nur upload)
  rumpfMaxJeWeg: {
    "/api/import/upload": 10 * 1024 * 1024,
    "/api/import/analyse": 2 * 1024 * 1024,
    "/api/import/vorschau": 2 * 1024 * 1024,
    "/api/import/uebernahme": 2 * 1024 * 1024,
    "/api/import/verwerfen": 2 * 1024 * 1024,
  },
};

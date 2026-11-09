/* ==========================================================================
   INTELLIGENCE-GATEWAY — KERN (WP-I13 / WP-I15, nur Attrappe)

   Der einzige Weg von einer Anfrage zu einem Anbieter-Adapter. Dieses Modul
   ist NICHT verdrahtet: keine Route, kein Eintrag in server.mjs, kein
   process.env. Wer es aufruft, muss alles ausdrücklich übergeben; die Vorgabe
   jedes Teils ist „aus“ bzw. „verweigern“.

   Ablauf von `ausfuehren(sitzung, anfrage)` — die Reihenfolge IST die Sicherheit:
     1  Notschalter (Prozess UND Laufzeit müssen "an" sein)        → KI_AUS
     2  Sitzung und Anfrage streng geprüft (Schema)               → KI_EINGABE
     3  Funktion bekannt, Rolle berechtigt (Betriebsrat/Betreiber nie) → KI_FUNKTION/KI_ROLLE
     4  Funktion für den Betrieb freigegeben, Startstufe bekannt  → KI_FUNKTION
     5  Betrieb nicht pausiert (Mitbestimmung, WP-I16-Haken)      → KI_PAUSIERT
     6  Limits: Rate, Parallelität, gleiche Anfrage, Kontingent   → KI_LIMIT/KI_KONTINGENT
     7  Faktenpaket aus der ROLLENSICHT ∩ Positivliste (nie Rohbestand), Alias, Leck-Prüfung
     8  Größe des Pakets → Kontingent angehoben/abgelehnt          → KI_GROESSE
     9  Protokoll-Pflichtereignis „start“ (sonst KEIN Aufruf)      → KI_AUDIT
    10  Stufenkette (nur aufwärts): Adapter-Aufruf mit Frist, technische Wiederholungen
    11  Prüfer (pruefer.mjs) — Schema, Zahlen, Alias, Einschleusung, Leck
    12  Rückübersetzung Alias → Kennung NUR nach bestandener Prüfung, dann Antwort-Schema
   Fehler vor Schritt 10 werfen (der Aufrufer macht daraus 4xx/503); Ausfälle ab
   Schritt 10 ergeben eine Antwort mit status "rueckfall" (degradierter Modus: die
   Kernanwendung bleibt nutzbar, der Aufrufer bekommt nie eine Ausnahme des Anbieters).

   INVARIANTEN
   G1  Inert: ohne beide Schalter auf "an" erreicht keine Anfrage den Adapter.
   G2  Rollen- und Funktionsprüfung VOR allem, was Kosten oder Daten betrifft.
   G3  Der Adapter bekommt nur: Funktion, Stufe, Schemaversion, Faktenpaket, gekapselten
       Fremdtext (siehe anbieter.mjs A1–A4). Nie Sitzung, Person, Betrieb, Raum, Alias-Karte.
   G4  Das Paket stammt aus faktenpaketBilden (Rollensicht ∩ Positivliste, Alias,
       Leck-Prüfung); das Gateway liest den Rohbestand nur für Sperrliste und
       Rückübersetzung, nie für den Adapter. Der Modellort kommt aus der Adapter-
       KONFIGURATION, nie aus der Anfrage.
   G5  Kein Anbieterergebnis erreicht den Aufrufer ungeprüft (Prüfer) oder unübersetzt
       im Rohzustand; Rückübersetzung erst nach der Prüfung.
   G6  Jede Antwort ist als Entwurf gekennzeichnet (kiGestuetzt, entwurf, nicht
       veröffentlicht); das Gateway hat keinen Schreibweg in den Bestand.
   G7  Jeder Vorgang gibt seinen Limit-Beleg genau einmal zurück (finally).
   G8  Protokoll ohne Personendaten (audit.mjs, Weißliste); Pflicht-Startereignis.
   G9  Jede Anbieter-Ausnahme wird zu einer Fehlerklasse; ihr Text verlässt das Gateway nie.
   G15 Notschalter und Pause werden während laufender Anbieteraufrufe alle schalterTaktMs (Vorgabe 250 ms) geprüft;
       „aus“ bricht den Aufruf über AbortSignal ab, der Vorgang endet mit KI_AUS/KI_PAUSIERT.
   G16 Die zyklische Schalterprüfung überlappt sich nicht und hat eine eigene Frist (schalterFristMs); ein hängendes
       betriebAktiv zählt als „pausiert“.
   G10 Alle Zähler/Schalter/Prüfungen sind fail closed.
   G17 F7A ist gesperrt, solange FREISCHALTUNG_GESPERRT sie nennt — mit und ohne Fremdtext, auch wenn sie
       in funktionenFreigegeben steht (Bedingung 5 aus wp-i11-nachweis.md).
   G18 Freitext-Funktionen (Positivliste fremdtext: true) nur mit gültiger Namenspolitik (namenspolitik.mjs, N1/N2).
   G19 Modell und Modellort kommen aus der Serverkonfiguration: eine Model Registry (registry.mjs) muss zum
       Ort des Adapters passen, sonst startet das Gateway nicht; sie begrenzt die Stufenkette (R1).
   ========================================================================== */

import { randomBytes, createHash } from "node:crypto";
import { KiFehler } from "../fehler.mjs";
import { funktionEintrag, rolleDarf, FREISCHALTUNG_GESPERRT } from "../positivliste.mjs";
import { pruefeAnfrage, pruefeAntwort, SCHEMA_VERSION } from "../schemas.mjs";
import { faktenpaketBilden } from "../faktenpaket.mjs";
import { sperrlisteBilden } from "../leckpruefung.mjs";
import { kapselnFuerPrompt } from "../kapsel.mjs";
import { rueckuebersetzen, betriebIndexAusSitzung } from "../alias.mjs";
import { anbieterPruefen, aufrufen, AnbieterFehler, alsAnbieterFehler } from "./anbieter.mjs";
import { gatewayAn, SCHALTER_AUS } from "./schalter.mjs";
import { Limits } from "./limits.mjs";
import { betriebKennung } from "./audit.mjs";
import { ausgabePruefen } from "./pruefer.mjs";
import { stufenKette } from "./router.mjs";
import { GatewayFehler, RUECKFALL_TEXTE } from "./codes.mjs";
import { kanonisch } from "./kanonisch.mjs";
import { fingerprintBilden, paketHash } from "./ergebnis.mjs";
import { alarmeBerechnen } from "./alarme.mjs";
import { namenspolitikPruefen } from "./namenspolitik.mjs";
import { registryPruefen } from "./registry.mjs";

export { kanonisch };

const ROLLEN = new Set(["leitung", "planer", "mitarbeiter", "betriebsrat", "betreiber", "subplaner"]);
const ZEITEN_VORGABE = Object.freeze({ stufeMs: 45_000, deadlineMs: 120_000, maxWiederholungen: 2, minRestMs: 10_000, zaehlerMs: 2_000, schalterTaktMs: 250, schalterFristMs: 1_000 });
const schlafenVorgabe = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const zufallIdVorgabe = () => randomBytes(12).toString("base64url");

/** Kanonische Anfrage-Prüfsumme (nur für die Wiederholungssperre; nie protokolliert). */
const fingerprint = (a) => createHash("sha256").update(kanonisch([a.funktion, a.eingabe, a.bezug ?? null])).digest("hex");

/**
 * @param {{
 *   anbieter: any,
 *   ladeBestand: (raum: string) => any | Promise<any>,
 *   aliasSchluessel: () => Uint8Array,
 *   versionen: { engine: string, regelstand: string, tarifstand: string },
 *   limits: Limits,
 *   audit: ReturnType<typeof import("./audit.mjs").erzeugeAudit>,
 *   schalter?: { prozess: () => unknown, laufzeit: () => unknown },
 *   betriebAktiv?: (sitzung: any) => boolean | Promise<boolean>,
 *   funktionenFreigegeben?: Iterable<string>,
 *   bausteinKatalog?: Record<string, Record<string, { parameter?: readonly string[] }>>,
 *   faktenquelle?: Function,
 *   gegenrechnung?: (a: { ausgabe: any, paket: any }) => { ok: boolean },   // WP-I12: Rechenkern prüft die Zahlen nach (P-10)
 *   hoechsteStufe?: 1|2|3,
 *   namenspolitik?: unknown,                 // G18: ohne gültige Politik keine Freitext-Funktion
 *   registry?: ReturnType<typeof import("./registry.mjs").erzeugeRegistry>,   // G19
 *   zeiten?: Partial<typeof ZEITEN_VORGABE>,
 *   jetzt?: () => number,
 *   schlafen?: (ms: number) => Promise<void>,
 *   zufallId?: () => string,
 *   ergebnisSpeicher?: ReturnType<typeof import("./ergebnis.mjs").erzeugeErgebnisSpeicher>,
 *   kiVersionen?: { prompt: string, pruefer: string, bausteinKatalog: string, routerRegistry: string },
 *   alarmHaken?: (alarme: { ebene: string, code: string, stufe: string }[]) => void,
 * }} o
 */
export function erzeugeGateway(o) {
  const anbieter = anbieterPruefen(o && o.anbieter);
  if (!(o.limits instanceof Limits)) throw new GatewayFehler("KI_LIMIT", "Gateway ohne Limits.");
  if (!o.audit || typeof o.audit.pflicht !== "function" || typeof o.audit.melden !== "function")
    throw new GatewayFehler("KI_AUDIT", "Gateway ohne Protokoll.");
  if (typeof o.ladeBestand !== "function" || typeof o.aliasSchluessel !== "function")
    throw new KiFehler("KI_INTERN", "Gateway ohne Bestandszugriff oder Schlüsselquelle.");
  const limits = o.limits;
  const audit = o.audit;
  const schalter = o.schalter || SCHALTER_AUS;
  const betriebAktiv = typeof o.betriebAktiv === "function" ? o.betriebAktiv : () => false;
  const freigegeben = new Set(o.funktionenFreigegeben || []);
  const katalog = o.bausteinKatalog || {};
  /* G18: eine übergebene, aber ungültige Namenspolitik ist ein Konfigurationsfehler (N2). */
  const namenspolitik = o.namenspolitik === undefined ? null : namenspolitikPruefen(o.namenspolitik);
  /* G19: Registry nur aus erzeugeRegistry und nur mit dem Ort des Adapters. */
  const registry = o.registry === undefined ? null : registryPruefen(o.registry);
  if (registry && registry.modellOrt !== anbieter.modellOrt) throw new KiFehler("KI_INTERN", "Model Registry passt nicht zum Adapter.");
  const hoechsteGewuenscht = o.hoechsteStufe ?? 3;
  const hoechste = registry && Number.isInteger(hoechsteGewuenscht) ? Math.min(hoechsteGewuenscht, registry.hoechsteStufe) : hoechsteGewuenscht;
  const zeiten = { ...ZEITEN_VORGABE, ...(o.zeiten || {}) };
  const jetzt = o.jetzt || (() => Date.now());
  const schlafen = o.schlafen || schlafenVorgabe;
  const zufallId = o.zufallId || zufallIdVorgabe;
  const speicher = o.ergebnisSpeicher || null;
  if (speicher) {
    /* E7: Ohne durchgesetzte Aufbewahrung (Modus „an“) startet das Gateway nicht. */
    if (speicher.modus !== "an") throw new KiFehler("KI_INTERN", "Ergebnis-Speicher ohne durchgesetzte Aufbewahrung.");
    const v = o.kiVersionen;
    if (!v || !["prompt", "pruefer", "bausteinKatalog", "routerRegistry"].every((k) => typeof v[k] === "string" && v[k])) throw new KiFehler("KI_INTERN", "Ergebnis-Speicher ohne Versionen.");
  }
  const alarmieren = (sitzungBetriebKey) => {
    if (typeof o.alarmHaken !== "function") return;
    try {
      const k = limits.konfig();
      const st = limits.stand(sitzungBetriebKey);
      const alarme = alarmeBerechnen({ betrieb: { ieMonat: st.ieMonat, kontingentIE: k.kontingentIE }, gesamt: { ieTag: limits.gesamtStand().ieTag, tagesIE: k.tagesIE, hartTagesIE: k.hartTagesIE } });
      if (alarme.length) o.alarmHaken(alarme);
    } catch { /* ein Alarmhaken stört nie */ }
  };

  const abgelehnt = (sitzung, funktion, code, grund) => {
    audit.melden({ art: "ki.abgelehnt", funktion, rolle: sitzung && ROLLEN.has(sitzung.rolle) ? sitzung.rolle : undefined, ergebnis: code,
      grund, betrieb: sitzung && typeof sitzung.bestand === "string" ? betriebKennung(sitzung.bestand, String(sitzung.betrieb ?? "")) : undefined });
  };

  async function ausfuehren(sitzung, anfrage) {
    const t0 = jetzt();
    /* 1 — Notschalter: VOR allem anderen, auch vor dem Lesen der Anfrage. */
    if (!gatewayAn(schalter)) { abgelehnt(sitzung, undefined, "KI_AUS", "schalter"); throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet."); }

    /* 2 — Form von Sitzung und Anfrage. */
    if (!sitzung || typeof sitzung !== "object" || typeof sitzung.rolle !== "string" || typeof sitzung.person !== "string"
      || typeof sitzung.bestand !== "string") {
      abgelehnt(sitzung, undefined, "KI_NICHT_ANGEMELDET", "sitzung");
      throw new KiFehler("KI_NICHT_ANGEMELDET", "Nicht angemeldet.");
    }
    const form = pruefeAnfrage(anfrage);
    if (!form.ok) { abgelehnt(sitzung, undefined, "KI_EINGABE", "anfrage"); throw new KiFehler("KI_EINGABE", "Anfrage ungültig."); }

    /* 3 — Funktion und Rolle (vor Limits, Bestand und Kosten: G2). */
    const eintrag = funktionEintrag(anfrage.funktion);
    if (!eintrag) { abgelehnt(sitzung, undefined, "KI_FUNKTION", "unbekannt"); throw new KiFehler("KI_FUNKTION", "Diese Funktion gibt es nicht."); }
    if (!rolleDarf(eintrag, sitzung.rolle)) {
      abgelehnt(sitzung, anfrage.funktion, "KI_ROLLE", "rolle");
      throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
    }

    /* 4 — Freigabe der Funktion und Startstufe. */
    const kette = stufenKette(anfrage.funktion, hoechste);
    /* G17: gesperrte Funktionen (F7A) gar nicht — nicht nur ihr Fremdtext. */
    if (!freigegeben.has(anfrage.funktion) || !kette.length || Object.prototype.hasOwnProperty.call(FREISCHALTUNG_GESPERRT, anfrage.funktion)) {
      abgelehnt(sitzung, anfrage.funktion, "KI_FUNKTION", "nicht_freigegeben");
      throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
    }
    /* G18: Freitext-Funktionen erst nach festgelegter Namenspolitik. */
    if (eintrag.fremdtext && !namenspolitik) {
      abgelehnt(sitzung, anfrage.funktion, "KI_FUNKTION", "namenspolitik");
      throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
    }

    /* 5 — Pausierung (Betriebsrat-Frage, Mitbestimmung): Haken für WP-I16, Vorgabe: gesperrt. */
    const betriebPruefen = async () => {
      let aktiv = false;
      let frist;
      /* Auch die Betriebsprüfung hat eine Frist: antwortet sie nicht, gilt der Betrieb als pausiert (fail closed). */
      try {
        aktiv = await Promise.race([Promise.resolve(betriebAktiv(sitzung)).then((v) => v === true),
          new Promise((r) => { frist = setTimeout(() => r(false), Math.max(10, zeiten.schalterFristMs)); if (frist.unref) frist.unref(); })]);
      } catch { aktiv = false; } finally { clearTimeout(frist); }
      if (!aktiv) throw new GatewayFehler("KI_PAUSIERT", "Intelligence ist für diesen Betrieb nicht freigegeben.");
    };
    /* G12: Notschalter und Pausierung gelten auch WÄHREND eines Vorgangs — vor jeder Stufe, jedem
       Anbieterversuch und vor der Rückgabe wird neu geprüft; „aus“ bricht mit KI_AUS/KI_PAUSIERT ab. */
    const weiterDarf = async () => {
      if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
      await betriebPruefen();
      if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
    };
    try { await betriebPruefen(); } catch (e) { abgelehnt(sitzung, anfrage.funktion, "KI_PAUSIERT", "betrieb"); throw e; }

    /* 6 — Limits (reservieren, bevor Daten gelesen werden). Alles, was werfen kann, vorher (G7). */
    const auftragId = zufallId();
    const betriebId = betriebKennung(sitzung.bestand, String(sitzung.betrieb ?? ""));
    const betriebKey = `${sitzung.bestand}|${String(sitzung.betrieb ?? "")}`;
    const res = limits.reservieren({ betrieb: betriebKey, person: sitzung.person, rolle: sitzung.rolle, klasse: eintrag.klasse, tokens: 0,
      fingerprint: fingerprint(anfrage) });
    if (!res.ok) {
      abgelehnt(sitzung, anfrage.funktion, res.code, res.grund);
      throw new GatewayFehler(res.code, "Limit erreicht.");
    }
    const beleg = res.beleg;
    let verbraucht = false;
    let gemeldet = false;
    /** Adapteraufrufe, die nach Frist/Abbruch noch laufen können (G13). */
    const ausstehend = [];
    /** G15: Notschalter/Pause werden während der Aufrufe zyklisch geprüft und brechen sie ab. */
    const stopp = new AbortController();
    let takt = null;
    try {
      /* 7 — Faktenpaket (eine Bestandsmomentaufnahme für Paket, Sperrliste und Rückübersetzung). */
      let momentaufnahme;
      const lade = async (raum) => { if (momentaufnahme === undefined) momentaufnahme = await o.ladeBestand(raum); return momentaufnahme; };
      const { paket, aliasKarte } = await faktenpaketBilden({
        sitzung, ladeBestand: lade, funktion: anfrage.funktion, eingabe: anfrage.eingabe, bezug: anfrage.bezug, kontext: speicher ? `k${createHash("sha256").update(kanonisch([anfrage.funktion, anfrage.eingabe, anfrage.bezug ?? null])).digest("hex").slice(0, 40)}` : auftragId,
        aliasSchluessel: o.aliasSchluessel(), versionen: o.versionen, faktenquelle: o.faktenquelle, modellOrt: anbieter.modellOrt,
        audit: (e) => { if (e && e.art === "ki.faktenpaket.verworfen") { gemeldet = true; audit.melden({ art: "ki.abgelehnt",
          funktion: anfrage.funktion, rolle: sitzung.rolle, ergebnis: "KI_LECK", kategorien: e.kategorien, betrieb: betriebId }); } },
      });

      /* 8 — Größe: Kontingent auf die wirkliche Klasse anheben. */
      const tokens = Math.ceil(JSON.stringify(paket).length / 4);
      const erw = limits.erweitern(beleg, tokens);
      if (!erw.ok) {
        gemeldet = true;
        abgelehnt(sitzung, anfrage.funktion, erw.code, erw.grund);
        throw new GatewayFehler(erw.code, "Limit erreicht.");
      }

      /* I15: die Buchung muss dauerhaft sein, bevor ein Aufruf möglich ist. Fehler: Klasse A läuft im Speicher weiter,
         alle anderen werden abgelehnt (fail closed, Plan I15). */
      if (!(await limits.dauerhaft(beleg, zeiten.zaehlerMs))) {
        if (eintrag.klasse !== "A") { gemeldet = true; abgelehnt(sitzung, anfrage.funktion, "KI_LIMIT", "zaehler_speicher"); throw new GatewayFehler("KI_LIMIT", "Zähler nicht verfügbar."); }
        audit.melden({ art: "ki.abgelehnt", funktion: anfrage.funktion, rolle: sitzung.rolle, ergebnis: "KI_LIMIT", grund: "zaehler_speicher_a", betrieb: betriebId });
      }

      /* 9 — Pflichtprotokoll: kein Aufruf ohne Spur. */
      audit.pflicht({ art: "ki.start", funktion: anfrage.funktion, rolle: sitzung.rolle, auftrag: auftragId, betrieb: betriebId,
        anbieter: anbieter.id, fakten: paket.fakten.length, tokensEin: tokens, ie: beleg.ie,
        ueberKontingent: res.ueberKontingent === true ? true : undefined });

      /* Sperrliste und Bestand für Prüfer und Rückübersetzung (aus derselben Momentaufnahme). */
      const bestand = await lade(sitzung.bestand);
      const idx = betriebIndexAusSitzung(sitzung, bestand);
      if (idx === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
      const sperrliste = sperrlisteBilden(bestand.mandanten[idx], { raum: sitzung.bestand });
      const kapsel = paket.fremdtext ? kapselnFuerPrompt(paket.fremdtext) : null;

      /* I14: Decision Fingerprint und Ergebnis-Speicher. Ein Treffer ersetzt den Anbieteraufruf, wird aber nochmals
         vom Prüfer geprüft (Sperrliste und Alias können sich geändert haben); fällt er durch, wird er verworfen. */
      let fp = null;
      let treffer = false;
      if (speicher) {
        try {
          fp = fingerprintBilden({ raum: sitzung.bestand, betriebId: String(bestand.mandanten[idx].id), funktion: anfrage.funktion, paketHash: paketHash(paket),
            regelwerk: `${o.versionen.regelstand}|${o.versionen.tarifstand}`, engine: o.versionen.engine, prompt: o.kiVersionen.prompt, schema: SCHEMA_VERSION,
            pruefer: o.kiVersionen.pruefer, bausteinKatalog: o.kiVersionen.bausteinKatalog, routerRegistry: o.kiVersionen.routerRegistry,
            zeitraum: paket.zeitraum ?? null, bezug: paket.bezug ?? null, rolle: sitzung.rolle, sprache: anfrage.sprache ?? "de" });
        } catch { fp = null; }
      }
      let ergebnis = null;
      let neutralisiert = false;
      if (fp) {
        const gespeichert = await speicher.lesen({ raum: sitzung.bestand, fingerprint: fp });
        if (gespeichert) {
          const p0 = ausgabePruefen({ ausgabe: gespeichert, paket, bausteinKatalog: katalog[anfrage.funktion] || null, sperrliste, gegenrechnung: o.gegenrechnung });
          if (p0.ok) { ergebnis = p0.ergebnis; neutralisiert = p0.neutralisiert; treffer = true; } else await speicher.verwerfen({ raum: sitzung.bestand, fingerprint: fp });
        }
      }

      /* 10/11 — Stufenkette (entfällt bei Treffer). */
      const deadline = t0 + zeiten.deadlineMs;
      let prueft = false;      // G16: Prüfungen überlappen sich nicht (ein langsames betriebAktiv staut keine Aufrufe)
      takt = setInterval(async () => {
        if (prueft || stopp.signal.aborted) return;
        prueft = true;
        let frist;
        try {
          if (!gatewayAn(schalter)) { stopp.abort(); return; }
          /* eigene Frist: antwortet betriebAktiv nicht rechtzeitig, gilt der Betrieb als pausiert (fail closed) */
          const ok = await Promise.race([Promise.resolve(betriebAktiv(sitzung)).then((v) => v === true),
            new Promise((r) => { frist = setTimeout(() => r(false), Math.max(10, zeiten.schalterFristMs)); if (frist.unref) frist.unref(); })]);
          if (!ok) stopp.abort();
        } catch { stopp.abort(); } finally { clearTimeout(frist); prueft = false; }
      }, Math.max(10, zeiten.schalterTaktMs));
      if (takt.unref) takt.unref();
      let letzterCode = "KI_ANBIETER";
      let stufeErreicht = 0;
      let versucheGesamt = 0;
      let tokensAus = null;
      for (const stufe of treffer ? [] : kette) {
        stufeErreicht = stufe;
        await weiterDarf();
        const rest = deadline - jetzt();
        if (rest <= 0) { letzterCode = "KI_ZEIT"; break; }
        const sStart = jetzt();
        const eingabe = { funktion: anfrage.funktion, stufe, schemaVersion: SCHEMA_VERSION, paket,
          fremdtext: kapsel ? { trenner: kapsel.trenner, text: kapsel.text } : null };
        let antwort;
        try {
          antwort = await aufrufen({ anbieter, eingabe, zeitJeVersuchMs: zeiten.stufeMs,
            maxWiederholungen: zeiten.maxWiederholungen, deadline: Math.min(deadline, sStart + zeiten.stufeMs),
            minRestMs: zeiten.minRestMs, jetzt, schlafen, ausstehend, signal: stopp.signal,
            /* Vor JEDEM Versuch neu prüfen; ab dem ersten tatsächlichen Versuch gilt die Aktion als verbraucht (B2/B7). */
            vorVersuch: async () => { await weiterDarf(); verbraucht = true; } });
        } catch (e) {
          if (e instanceof GatewayFehler) throw e;
          const f = e instanceof AnbieterFehler ? e : alsAnbieterFehler(e);
          letzterCode = f.klasse === "zeit" ? "KI_ZEIT" : f.klasse === "nicht_freigegeben" ? "KI_NICHT_FREIGEGEBEN" : "KI_ANBIETER";
          audit.melden({ art: "ki.stufe", funktion: anfrage.funktion, auftrag: auftragId, stufe, ergebnis: letzterCode,
            dauerMs: Math.max(0, jetzt() - sStart) });
          if (f.klasse === "nicht_freigegeben") break;
          continue;
        }
        versucheGesamt += antwort.versuche;
        tokensAus = antwort.nutzung.ausgabeToken;
        const p = ausgabePruefen({ ausgabe: antwort.ausgabe, paket, bausteinKatalog: katalog[anfrage.funktion] || null, sperrliste, gegenrechnung: o.gegenrechnung });
        audit.melden({ art: "ki.stufe", funktion: anfrage.funktion, auftrag: auftragId, stufe, ergebnis: p.ok ? "ok" : "KI_PRUEFER",
          codes: p.ok ? undefined : p.codes, dauerMs: Math.max(0, jetzt() - sStart), versuche: antwort.versuche });
        if (p.ok) { ergebnis = p.ergebnis; neutralisiert = p.neutralisiert; break; }
        letzterCode = "KI_PRUEFER";
      }

      /* Schalter/Pause können sich während des Aufrufs geändert haben: dann wird nichts mehr herausgegeben. */
      await weiterDarf();

      /* I14: geprüfte Antwort speichern (zweite Schranke: Leck-Prüfung beim Schreiben) und Decision Context anlegen. */
      let ctxId = null;
      if (ergebnis && speicher && fp) {
        if (!treffer) await speicher.schreiben({ raum: sitzung.bestand, fingerprint: fp, funktion: anfrage.funktion, ergebnis, sperrliste });
        ctxId = await speicher.kontextSchreiben({ raum: sitzung.bestand, betriebId: String(bestand.mandanten[idx].id), rolle: sitzung.rolle, funktion: anfrage.funktion, fingerprint: fp,
          versionen: { ...o.versionen, ...o.kiVersionen, schema: SCHEMA_VERSION }, stufen: treffer || !stufeErreicht ? [] : [stufeErreicht], pruefCodes: [], treffer, paket });
      }

      /* Rückfall: kein Fehler nach außen, Kernanwendung bleibt nutzbar. */
      const kennzeichnung = (geprueft) => ({ kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft });
      const ende = (code) => audit.melden({ art: "ki.ende", funktion: anfrage.funktion, rolle: sitzung.rolle, auftrag: auftragId,
        betrieb: betriebId, ergebnis: code, stufe: stufeErreicht || undefined, versuche: versucheGesamt || undefined,
        dauerMs: Math.max(0, jetzt() - t0), tokensAus: tokensAus ?? undefined, ie: verbraucht ? beleg.ie : 0,
        verworfenAusgabe: neutralisiert ? 1 : undefined, treffer: treffer ? true : undefined });
      if (!ergebnis) {
        const code = RUECKFALL_TEXTE[letzterCode] ? letzterCode : "KI_ANBIETER";
        ende(code);
        return antwortPruefen({ status: "rueckfall", auftragId, kennzeichnung: kennzeichnung(false),
          rueckfall: { code, text: RUECKFALL_TEXTE[code] } });
      }

      /* 12 — Rückübersetzung erst NACH der Prüfung; danach erneut das Antwort-Schema. */
      let uebersetzt;
      try {
        uebersetzt = rueckuebersetzen({ ergebnis, karte: aliasKarte, sitzung, funktion: anfrage.funktion, bestand });
      } catch {
        ende("KI_PRUEFER");
        return antwortPruefen({ status: "rueckfall", auftragId, kennzeichnung: kennzeichnung(false),
          rueckfall: { code: "KI_PRUEFER", text: RUECKFALL_TEXTE.KI_PRUEFER } });
      }
      const fertig = { status: "fertig", auftragId, kennzeichnung: kennzeichnung(true), ergebnis: uebersetzt, ...(ctxId ? { ctxId } : {}) };
      const v = pruefeAntwort(fertig);
      if (!v.ok) {
        ende("KI_PRUEFER");
        return antwortPruefen({ status: "rueckfall", auftragId, kennzeichnung: kennzeichnung(false),
          rueckfall: { code: "KI_PRUEFER", text: RUECKFALL_TEXTE.KI_PRUEFER } });
      }
      ende("ok");
      return Object.freeze(fertig);
    } catch (e) {
      if (!gemeldet) abgelehnt(sitzung, anfrage.funktion, e && typeof e.code === "string" ? e.code : "KI_INTERN", "ausnahme");
      throw e;
    } finally {
      if (takt) clearInterval(takt);
      /* G13: ein Adapter, der Frist/Abbruch überlebt, hält seinen Platz, bis er wirklich endet. */
      const offen = ausstehend.filter((x) => !x.fertig).map((x) => x.p);
      limits.abschliessen(beleg, { verbraucht, spaeter: offen.length ? Promise.allSettled(offen) : undefined });
      alarmieren(betriebKey);
    }
  }

  return Object.freeze({ ausfuehren });
}

/** Letzte Absicherung: auch die Rückfall-Antwort besteht das Schema oder es gibt einen internen Fehler. */
function antwortPruefen(a) {
  if (!pruefeAntwort(a).ok) throw new KiFehler("KI_INTERN", "Antwort ungültig.");
  return Object.freeze(a);
}

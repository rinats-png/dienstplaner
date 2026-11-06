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
   G10 Alle Zähler/Schalter/Prüfungen sind fail closed.
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

const ROLLEN = new Set(["leitung", "planer", "mitarbeiter", "betriebsrat", "betreiber", "subplaner"]);
const ZEITEN_VORGABE = Object.freeze({ stufeMs: 45_000, deadlineMs: 120_000, maxWiederholungen: 2, minRestMs: 10_000 });
const schlafenVorgabe = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const zufallIdVorgabe = () => randomBytes(12).toString("base64url");

/** Kanonische Anfrage-Prüfsumme (nur für die Wiederholungssperre; nie protokolliert). */
const fingerprint = (a) => createHash("sha256").update(JSON.stringify([a.funktion, a.eingabe, a.bezug ?? null])).digest("hex");

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
 *   hoechsteStufe?: 1|2|3,
 *   zeiten?: Partial<typeof ZEITEN_VORGABE>,
 *   jetzt?: () => number,
 *   schlafen?: (ms: number) => Promise<void>,
 *   zufallId?: () => string,
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
  const hoechste = o.hoechsteStufe ?? 3;
  const zeiten = { ...ZEITEN_VORGABE, ...(o.zeiten || {}) };
  const jetzt = o.jetzt || (() => Date.now());
  const schlafen = o.schlafen || schlafenVorgabe;
  const zufallId = o.zufallId || zufallIdVorgabe;

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
    const fremdtext = Array.isArray(anfrage.eingabe.fremdtext) && anfrage.eingabe.fremdtext.length > 0;
    if (!freigegeben.has(anfrage.funktion) || !kette.length
      || (fremdtext && Object.prototype.hasOwnProperty.call(FREISCHALTUNG_GESPERRT, anfrage.funktion))) {
      abgelehnt(sitzung, anfrage.funktion, "KI_FUNKTION", "nicht_freigegeben");
      throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
    }

    /* 5 — Pausierung (Betriebsrat-Frage, Mitbestimmung): Haken für WP-I16, Vorgabe: gesperrt. */
    let aktiv = false;
    try { aktiv = (await betriebAktiv(sitzung)) === true; } catch { aktiv = false; }
    if (!aktiv) { abgelehnt(sitzung, anfrage.funktion, "KI_PAUSIERT", "betrieb"); throw new GatewayFehler("KI_PAUSIERT", "Intelligence ist für diesen Betrieb nicht freigegeben."); }

    /* 6 — Limits (reservieren, bevor Daten gelesen werden). */
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
    const auftragId = zufallId();
    const betriebId = betriebKennung(sitzung.bestand, String(sitzung.betrieb ?? ""));
    try {
      /* 7 — Faktenpaket (eine Bestandsmomentaufnahme für Paket, Sperrliste und Rückübersetzung). */
      let momentaufnahme;
      const lade = async (raum) => { if (momentaufnahme === undefined) momentaufnahme = await o.ladeBestand(raum); return momentaufnahme; };
      const { paket, aliasKarte } = await faktenpaketBilden({
        sitzung, ladeBestand: lade, funktion: anfrage.funktion, eingabe: anfrage.eingabe, bezug: anfrage.bezug, kontext: auftragId,
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

      /* 10/11 — Stufenkette. */
      const deadline = t0 + zeiten.deadlineMs;
      let letzterCode = "KI_ANBIETER";
      let ergebnis = null;
      let neutralisiert = false;
      let stufeErreicht = 0;
      let versucheGesamt = 0;
      let tokensAus = null;
      for (const stufe of kette) {
        stufeErreicht = stufe;
        const rest = deadline - jetzt();
        if (rest <= 0) { letzterCode = "KI_ZEIT"; break; }
        const sStart = jetzt();
        const eingabe = { funktion: anfrage.funktion, stufe, schemaVersion: SCHEMA_VERSION, paket,
          fremdtext: kapsel ? { trenner: kapsel.trenner, text: kapsel.text } : null };
        let antwort;
        try {
          antwort = await aufrufen({ anbieter, eingabe, zeitJeVersuchMs: zeiten.stufeMs,
            maxWiederholungen: zeiten.maxWiederholungen, deadline: Math.min(deadline, sStart + zeiten.stufeMs),
            minRestMs: zeiten.minRestMs, jetzt, schlafen });
        } catch (e) {
          const f = e instanceof AnbieterFehler ? e : alsAnbieterFehler(e);
          letzterCode = f.klasse === "zeit" ? "KI_ZEIT" : f.klasse === "nicht_freigegeben" ? "KI_NICHT_FREIGEGEBEN" : "KI_ANBIETER";
          audit.melden({ art: "ki.stufe", funktion: anfrage.funktion, auftrag: auftragId, stufe, ergebnis: letzterCode,
            dauerMs: Math.max(0, jetzt() - sStart) });
          if (f.klasse === "nicht_freigegeben") break;
          continue;
        }
        verbraucht = true;
        versucheGesamt += antwort.versuche;
        tokensAus = antwort.nutzung.ausgabeToken;
        const p = ausgabePruefen({ ausgabe: antwort.ausgabe, paket, bausteinKatalog: katalog[anfrage.funktion] || null, sperrliste });
        audit.melden({ art: "ki.stufe", funktion: anfrage.funktion, auftrag: auftragId, stufe, ergebnis: p.ok ? "ok" : "KI_PRUEFER",
          codes: p.ok ? undefined : p.codes, dauerMs: Math.max(0, jetzt() - sStart), versuche: antwort.versuche });
        if (p.ok) { ergebnis = p.ergebnis; neutralisiert = p.neutralisiert; break; }
        letzterCode = "KI_PRUEFER";
      }

      /* Rückfall: kein Fehler nach außen, Kernanwendung bleibt nutzbar. */
      const kennzeichnung = (geprueft) => ({ kiGestuetzt: true, entwurf: true, veroeffentlicht: false, geprueft });
      const ende = (code) => audit.melden({ art: "ki.ende", funktion: anfrage.funktion, rolle: sitzung.rolle, auftrag: auftragId,
        betrieb: betriebId, ergebnis: code, stufe: stufeErreicht || undefined, versuche: versucheGesamt || undefined,
        dauerMs: Math.max(0, jetzt() - t0), tokensAus: tokensAus ?? undefined, ie: verbraucht ? beleg.ie : 0,
        verworfenAusgabe: neutralisiert ? 1 : undefined });
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
      const fertig = { status: "fertig", auftragId, kennzeichnung: kennzeichnung(true), ergebnis: uebersetzt };
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
      limits.abschliessen(beleg, { verbraucht });
    }
  }

  return Object.freeze({ ausfuehren });
}

/** Letzte Absicherung: auch die Rückfall-Antwort besteht das Schema oder es gibt einen internen Fehler. */
function antwortPruefen(a) {
  if (!pruefeAntwort(a).ok) throw new KiFehler("KI_INTERN", "Antwort ungültig.");
  return Object.freeze(a);
}

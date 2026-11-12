/* ==========================================================================
   INTELLIGENCE — BATCH-INFRASTRUKTUR (WP-I29 Teil 1, nur Attrappe, Schalter AUS)

   Ein Batch-Auftrag führt eine BEGRENZTE Menge voneinander unabhängiger Intelligence-Anfragen (z. B. je Tag oder
   je Einheit) deterministisch durch das vorhandene Gateway (WP-I13) aus. Er ist die Grundlage für F4, F11 und F12;
   diese Funktionen selbst sind NICHT Teil dieses Pakets. Kein Netz, kein Anbieter, keine Verdrahtung (kein
   process.env, keine Route, kein Eintrag in server.mjs): wer den Lauf nutzt, übergibt alles ausdrücklich.

   Reihenfolge von `starten(sitzung, spec)` (jede Stufe verweigert im Zweifel, vor allem, was Kosten betrifft):
   1  Schalter: gatewayAn(schalter) — Vorgabe AUS → KI_AUS, kein Gateway-Aufruf.
   2  Sitzung (Rolle, Person, Bestand) und Spec streng geprüft (geschlossenes Schema, Obergrenzen) → KI_EINGABE.
   3  Je Eintrag: Funktion bekannt, ohne Fremdtext, Rolle laut Positivliste (Betriebsrat/Betreiber nie), und die
      Rolle ist leitung oder planer (Batch ist ein Planungswerkzeug), Funktion freigegeben → KI_FUNKTION/KI_ROLLE.
   4  Idempotenz: gleicher Schlüssel + gleiche Spec (im selben Bestand/Betrieb/Person) → derselbe Auftrag, keine
      zweite Ausführung; gleicher Schlüssel + andere Spec → KI_EINGABE.
   5  Kontingent VOR dem Start: reicht der Rest des Monats-/Tageskontingents für die Mindestkosten (1 IE je Eintrag)
      nicht, startet nichts (status "kontingent_zu_knapp", null Gateway-Aufrufe); ebenso vor JEDEM Eintrag.
   6  Ausführung: Einträge in Reihenfolge, höchstens `parallel` gleichzeitig. Jeder Eintrag läuft für sich: sein
      Fehler landet nur in seinem Ergebnis (Fehlercode, nie Text), nie in einem anderen.
   7  Abbruchgründe (beenden den Auftrag mit klarem Status, restliche Einträge "nicht_ausgefuehrt"): Kontingent oder
      Limit des Gateways erreicht, Notschalter/Pause, `abbrechen()`, Frist abgelaufen.

   FAKTEN: Jeder Eintrag geht als gewöhnliche Anfrage durch gateway.ausfuehren → faktenpaketBilden (Rollensicht ∩
   Positivliste, Alias, Leck-Prüfung). Gesundheits-, Abwesenheits- und Betriebsratsdaten sind damit wie bei jeder
   Einzelanfrage von Konstruktion aus ausgeschlossen; der Batch liest keinen Bestand selbst.

   ERGEBNISSE: nur im Speicher dieses Prozesses (höchstens MAX_AUFTRAEGE Aufträge, älteste fertige zuerst verdrängt),
   abrufbar nur für dieselbe Person im selben Bestand/Betrieb. Das Format des Ergebnis-Speichers (WP-I14) ist je
   Einzelanfrage über den Fingerprint gebildet und passt nicht für eine Auftragssammlung; das Gateway legt – falls
   ihm ein Ergebnis-Speicher übergeben wurde – seine Einträge selbst an. Dieses Modul schreibt NICHTS (kein Store,
   keine Datei, kein Bestand) und protokolliert NICHTS (keine Inhalte; der Fortschritt besteht nur aus Zählern).
   Ohne Gateway ("Anbieter aus") ist jeder Eintrag "nicht_verfuegbar", ohne Aufruf.
   ========================================================================== */
import { createHash, randomBytes } from "node:crypto";
import { funktionEintrag, rolleDarf } from "../positivliste.mjs";
import { pruefeAnfrage } from "../schemas.mjs";
import { gatewayAn, SCHALTER_AUS } from "../gateway/schalter.mjs";
import { kanonisch } from "../gateway/kanonisch.mjs";
import { GatewayFehler } from "../gateway/codes.mjs";
import { KiFehler } from "../fehler.mjs";

export const BATCH_GRENZEN = Object.freeze({
  eintraege: 50, bytes: 64 * 1024, parallel: 2, maxIE: 500, fristMinMs: 1_000, fristMaxMs: 600_000, fristVorgabeMs: 120_000,
  auftraege: 50, schluesselMuster: /^[A-Za-z0-9_-]{8,64}$/,
});
/** Rollen, die Batch-Aufträge starten dürfen (zusätzlich zur Positivliste je Funktion). */
export const BATCH_ROLLEN = Object.freeze(["leitung", "planer"]);
/** Mindestkosten je Eintrag in IE (Größenklasse „klein“, limits.mjs IE_JE_GROESSE.klein). */
export const MIN_IE_JE_EINTRAG = 1;

export const BATCH_STATUS = Object.freeze(["laeuft", "fertig", "abgebrochen", "frist_abgelaufen", "kontingent_erreicht",
  "kontingent_zu_knapp", "limit_erreicht", "ausgeschaltet"]);
const ENDE_GRUND_CODES = new Set(["KI_KONTINGENT", "KI_LIMIT", "KI_AUS", "KI_PAUSIERT"]);
const FEHLER_CODES = new Set(["KI_NICHT_ANGEMELDET", "KI_ROLLE", "KI_FUNKTION", "KI_EINGABE", "KI_NICHT_GEFUNDEN", "KI_LECK", "KI_ALIAS_SCHLUESSEL",
  "KI_ALIAS_UNBEKANNT", "KI_PRUEFER", "KI_INTERN", "KI_AUS", "KI_PAUSIERT", "KI_LIMIT", "KI_KONTINGENT", "KI_GROESSE", "KI_ZEIT", "KI_ANBIETER",
  "KI_NICHT_FREIGEGEBEN", "KI_AUDIT"]);

const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const nurSchluessel = (o, erlaubt) => Object.keys(o).every((k) => erlaubt.includes(k));
const ganz = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const eingabeFehler = () => new KiFehler("KI_EINGABE", "Anfrage ungültig.");
const hash = (w) => createHash("sha256").update(kanonisch(w)).digest("hex");

/** Streng prüfen, nichts übernehmen, was nicht im Schema steht. Wirft KI_EINGABE. */
export function batchSpecLesen(spec) {
  if (!istObj(spec) || !nurSchluessel(spec, ["schluessel", "eintraege", "maxIE", "fristMs", "parallel"])) throw eingabeFehler();
  if (typeof spec.schluessel !== "string" || !BATCH_GRENZEN.schluesselMuster.test(spec.schluessel)) throw eingabeFehler();
  if (!Array.isArray(spec.eintraege) || spec.eintraege.length < 1 || spec.eintraege.length > BATCH_GRENZEN.eintraege) throw eingabeFehler();
  if (spec.maxIE !== undefined && !ganz(spec.maxIE, 1, BATCH_GRENZEN.maxIE)) throw eingabeFehler();
  if (spec.fristMs !== undefined && !ganz(spec.fristMs, BATCH_GRENZEN.fristMinMs, BATCH_GRENZEN.fristMaxMs)) throw eingabeFehler();
  if (spec.parallel !== undefined && !ganz(spec.parallel, 1, BATCH_GRENZEN.parallel)) throw eingabeFehler();
  let groesse;
  try { groesse = Buffer.byteLength(JSON.stringify(spec), "utf8"); } catch { throw eingabeFehler(); }
  if (groesse > BATCH_GRENZEN.bytes) throw eingabeFehler();
  const eintraege = spec.eintraege.map((e) => {
    if (!istObj(e) || !nurSchluessel(e, ["funktion", "eingabe", "bezug"])) throw eingabeFehler();
    const anfrage = { funktion: e.funktion, eingabe: e.eingabe, ...(e.bezug !== undefined ? { bezug: e.bezug } : {}) };
    if (!pruefeAnfrage(anfrage).ok) throw eingabeFehler();
    return anfrage;
  });
  return { schluessel: spec.schluessel, eintraege, maxIE: spec.maxIE ?? null, fristMs: spec.fristMs ?? BATCH_GRENZEN.fristVorgabeMs,
    parallel: spec.parallel ?? 1 };
}

/**
 * @param {{
 *   gateway?: { ausfuehren: (sitzung: any, anfrage: any) => Promise<any> },   // fehlt = Anbieter aus: jeder Eintrag "nicht_verfuegbar"
 *   limits?: { konfig: () => any, stand: (betrieb: string) => any, gesamtStand: () => any },  // fehlt = kein Kontingentwissen: nichts läuft
 *   schalter?: { prozess: () => unknown, laufzeit: () => unknown },
 *   funktionenFreigegeben?: Iterable<string>,
 *   jetzt?: () => number,
 *   zufallId?: () => string,
 * }} o
 */
export function erzeugeBatchLauf(o = {}) {
  const gateway = o.gateway && typeof o.gateway.ausfuehren === "function" ? o.gateway : null;
  const limits = o.limits || null;
  const schalter = o.schalter || SCHALTER_AUS;
  const freigegeben = new Set(o.funktionenFreigegeben || []);
  const jetzt = o.jetzt || (() => Date.now());
  const zufallId = o.zufallId || (() => `b${randomBytes(12).toString("base64url")}`);
  /** @type {Map<string, any>} idempotenz-Schlüssel (bereichsgebunden, gehasht) → Auftrag */
  const nachSchluessel = new Map();
  /** @type {Map<string, any>} auftragsId → Auftrag */
  const nachId = new Map();

  const betriebKey = (s) => `${s.bestand}|${String(s.betrieb ?? "")}`;
  const bereich = (s) => hash([s.bestand, String(s.betrieb ?? ""), s.person]);

  /** Verbleibende IE nach nominellem Monats- und Tageskontingent (strenger als die 1,1-Toleranz des Gateways). */
  function restIE(s) {
    try {
      const k = limits.konfig();
      const st = limits.stand(betriebKey(s));
      const g = limits.gesamtStand();
      const werte = [k.kontingentIE - st.ieMonat, k.tagesIE - g.ieTag];
      return werte.every(Number.isFinite) ? Math.min(...werte) : 0;
    } catch { return 0; }     // fail closed
  }
  const verbrauchtMonat = (s) => { try { const v = limits.stand(betriebKey(s)).ieMonat; return Number.isFinite(v) ? v : null; } catch { return null; } };

  function verdraengen() {
    while (nachId.size >= BATCH_GRENZEN.auftraege) {
      const aeltester = [...nachId.values()].find((a) => a.status !== "laeuft");
      if (!aeltester) throw new GatewayFehler("KI_LIMIT", "Zu viele Batch-Aufträge.");
      nachId.delete(aeltester.id); nachSchluessel.delete(aeltester.key);
    }
  }

  const zaehler = (a) => {
    const z = { gesamt: a.eintraege.length, fertig: 0, nicht_verfuegbar: 0, fehler: 0, nicht_ausgefuehrt: 0, laufend: a.laufend };
    for (const r of a.ergebnisse) if (r) z[r.status] += 1;
    return z;
  };
  const ansicht = (a) => Object.freeze({ id: a.id, status: a.status, grund: a.grund, fortschritt: Object.freeze(zaehler(a)), idempotenzSchluessel: a.schluessel });

  async function ablauf(a, s, abbruch) {
    const t0 = a.start;
    const deadline = t0 + a.spec.fristMs;
    let naechster = 0;
    let stopp = null;       // { status, grund }
    const stoppen = (status, grund) => { if (!stopp) stopp = { status, grund }; };
    const einer = async () => {
      for (;;) {
        if (stopp) return;
        if (abbruch.abgebrochen) { stoppen("abgebrochen", "abgebrochen"); return; }
        if (jetzt() >= deadline) { stoppen("frist_abgelaufen", "frist"); return; }
        if (!gatewayAn(schalter)) { stoppen("ausgeschaltet", "KI_AUS"); return; }
        const i = naechster;
        if (i >= a.eintraege.length) return;
        /* Kontingent vor JEDEM Eintrag (laufende Einträge sind schon gebucht, aber noch nicht abgerechnet: Reserve). */
        if (restIE(s) - a.laufend * MIN_IE_JE_EINTRAG < MIN_IE_JE_EINTRAG) { stoppen("kontingent_erreicht", "KI_KONTINGENT"); return; }
        if (a.spec.maxIE !== null) {
          const v = verbrauchtMonat(s);
          if (v === null || v - a.vorher + (a.laufend + 1) * MIN_IE_JE_EINTRAG > a.spec.maxIE) { stoppen("kontingent_erreicht", "auftragsbudget"); return; }
        }
        naechster += 1;
        a.laufend += 1;
        try {
          a.ergebnisse[i] = await eintragAusfuehren(a.eintraege[i], i, s);
        } finally { a.laufend -= 1; }
        const e = a.ergebnisse[i];
        if (e.status === "fehler" && ENDE_GRUND_CODES.has(e.code)) {
          if (e.code === "KI_KONTINGENT") stoppen("kontingent_erreicht", e.code);
          else if (e.code === "KI_LIMIT") stoppen("limit_erreicht", e.code);
          else stoppen("ausgeschaltet", e.code);
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: a.spec.parallel }, () => einer()));
    } catch { stoppen("abgebrochen", "KI_INTERN"); }
    for (let i = 0; i < a.eintraege.length; i++) {
      if (!a.ergebnisse[i]) a.ergebnisse[i] = { index: i, funktion: a.eintraege[i].funktion, status: "nicht_ausgefuehrt", code: stopp ? stopp.grund : "abgebrochen" };
    }
    a.status = stopp ? stopp.status : "fertig";
    a.grund = stopp ? stopp.grund : null;
  }

  async function eintragAusfuehren(anfrage, index, s) {
    const basis = { index, funktion: anfrage.funktion };
    if (!gateway) return { ...basis, status: "nicht_verfuegbar", code: "KI_NICHT_FREIGEGEBEN" };
    try {
      const antwort = await gateway.ausfuehren(s, anfrage);
      if (antwort && antwort.status === "fertig") return { ...basis, status: "fertig", antwort: antwort.ergebnis, kennzeichnung: antwort.kennzeichnung };
      const code = antwort && antwort.rueckfall && FEHLER_CODES.has(antwort.rueckfall.code) ? antwort.rueckfall.code : "KI_ANBIETER";
      return { ...basis, status: "nicht_verfuegbar", code };
    } catch (e) {
      /* Nur der Code, nie die Meldung oder Teile des Eintrags (kein Inhalt in Fehlern). */
      return { ...basis, status: "fehler", code: e && typeof e.code === "string" && FEHLER_CODES.has(e.code) ? e.code : "KI_INTERN" };
    }
  }

  function pruefenSitzung(s) {
    if (!istObj(s) || typeof s.rolle !== "string" || typeof s.person !== "string" || typeof s.bestand !== "string" || !s.person || !s.bestand)
      throw new KiFehler("KI_NICHT_ANGEMELDET", "Nicht angemeldet.");
  }

  /** @returns {Promise<ReturnType<typeof ansicht> & { neu: boolean }>} */
  async function starten(sitzung, rohSpec) {
    if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
    pruefenSitzung(sitzung);
    if (!BATCH_ROLLEN.includes(sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
    const spec = batchSpecLesen(rohSpec);
    for (const e of spec.eintraege) {
      const eintrag = funktionEintrag(e.funktion);
      if (!eintrag || eintrag.fremdtext) throw new KiFehler("KI_FUNKTION", "Diese Funktion gibt es nicht.");
      if (!rolleDarf(eintrag, sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
      if (!freigegeben.has(e.funktion)) throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
    }
    const key = hash([bereich(sitzung), spec.schluessel]);
    const inhalt = hash([spec.eintraege, spec.maxIE, spec.fristMs, spec.parallel]);
    const vorhanden = nachSchluessel.get(key);
    if (vorhanden) {
      if (vorhanden.inhalt !== inhalt) throw eingabeFehler();
      return { ...ansicht(vorhanden), neu: false };
    }
    verdraengen();
    const a = { id: zufallId(), key, inhalt, schluessel: spec.schluessel, spec, eintraege: spec.eintraege, ergebnisse: new Array(spec.eintraege.length),
      status: "laeuft", grund: null, laufend: 0, start: jetzt(), vorher: 0, bereich: bereich(sitzung), abbruch: { abgebrochen: false }, fertigP: null };
    nachSchluessel.set(key, a); nachId.set(a.id, a);

    /* Kontingent VOR dem Start: ohne Kontingentwissen oder bei zu wenig Rest läuft nichts. */
    const rest = limits ? restIE(sitzung) : 0;
    const braucht = spec.eintraege.length * MIN_IE_JE_EINTRAG;
    if (!limits || rest < braucht || (spec.maxIE !== null && braucht > spec.maxIE)) {
      a.ergebnisse = spec.eintraege.map((e, i) => ({ index: i, funktion: e.funktion, status: "nicht_ausgefuehrt", code: "KI_KONTINGENT" }));
      a.status = "kontingent_zu_knapp"; a.grund = "KI_KONTINGENT";
      a.fertigP = Promise.resolve();
      return { ...ansicht(a), neu: true };
    }
    a.vorher = verbrauchtMonat(sitzung) ?? 0;
    const s2 = Object.freeze({ ...sitzung });
    a.fertigP = ablauf(a, s2, a.abbruch);
    return { ...ansicht(a), neu: true };
  }

  const finden = (sitzung, id) => {
    pruefenSitzung(sitzung);
    const a = typeof id === "string" ? nachId.get(id) : undefined;
    /* Fremde Aufträge gibt es nicht: gleiche Antwort wie „unbekannt“ (keine Auskunft über Existenz). */
    if (!a || a.bereich !== bereich(sitzung)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
    return a;
  };

  return Object.freeze({
    starten,
    /** Fortschritt und Status (nur Zähler). */
    status(sitzung, id) { return ansicht(finden(sitzung, id)); },
    /** Wartet auf das Ende (für Tests und Aufrufer, die synchron weitermachen wollen). */
    async warten(sitzung, id) { const a = finden(sitzung, id); await a.fertigP; return ansicht(a); },
    /** Ergebnisse je Eintrag in Eingabereihenfolge, erst nach dem Ende. */
    ergebnis(sitzung, id) {
      const a = finden(sitzung, id);
      if (a.status === "laeuft") throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
      return Object.freeze({ ...ansicht(a), eintraege: Object.freeze(a.ergebnisse.map((r) => Object.freeze({ ...r }))) });
    },
    /** Bricht ab: kein weiterer Eintrag startet; bereits laufende Gateway-Aufrufe enden von selbst. */
    abbrechen(sitzung, id) { const a = finden(sitzung, id); a.abbruch.abgebrochen = true; return ansicht(a); },
    /** Gibt den Auftrag und seine Ergebnisse aus dem Speicher frei. */
    verwerfen(sitzung, id) { const a = finden(sitzung, id); if (a.status === "laeuft") a.abbruch.abgebrochen = true; nachId.delete(a.id); nachSchluessel.delete(a.key); return true; },
  });
}

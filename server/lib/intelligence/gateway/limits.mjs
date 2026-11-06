/* ==========================================================================
   INTELLIGENCE-GATEWAY — LIMITS, KONTINGENT, KOSTENZÄHLER (WP-I15, nur Speicher)

   Alles im Prozessspeicher, einfädig (kein Await zwischen Prüfen und Buchen):
   Prüfen und Reservieren geschehen in einem Zug, sonst ließen sich Limits
   durch Gleichzeitigkeit umgehen. Persistenz (append-only mit Rollup) ist
   NICHT Teil dieses Stands (offener Rest von WP-I15); nach einem Neustart
   beginnen die Zähler bei 0 — für Entwicklung mit Attrappe unkritisch, vor
   einem Live-Anbieter zu ersetzen (wpI-offene-fragen.md).

   Quelle der Startwerte: docs/intelligence/CENTRIC-INTELLIGENCE.md 7.2–7.5.
   Alle Werte sind KONFIGURATION (Aufrufer). Pflichtangaben: betriebKontingentIE,
   gesamtTagesIE, gesamtHartTagesIE (positive endliche Zahlen, hart >= Tag);
   sonst wirft der Konstruktor: ohne Kostendeckel gibt es kein Gateway.

   Einheiten: Intelligence-Einheiten (IE): klein 1, mittel 3, groß 7. Es werden
   KEINE Geldbeträge, Token-Preise oder Modellnamen gezählt (Preise ungeklärt).

   INVARIANTEN
   B1  Kein Aufruf ohne erfolgreiche Reservierung; Reservierung vor dem Anbieteraufruf.
   B2  Eine Aktion zählt einmal (IE), unabhängig von der Zahl der Stufen.
   B3  Sicherheitslimits (Rate je Person, gleiche Anfrage, parallele Vorgänge je
       Betrieb, Größe) gelten für JEDE Klasse, auch A.
   B4  Geschäftslimits (Monatskontingent, Tageslimit, Tagesbudget gesamt) sperren
       Klasse A nie (Spez. 7.4/7.5: A bleibt) — A trägt nur den Hinweis
       `ueberKontingent`. Das absolute Tagesdach `gesamtHartTagesIE` sperrt auch A
       (Notbremse bei Zählfehler).
   B5  Zähler je Person liegen nur im Speicher, ohne Klarnamen (Schlüssel = Hash),
       und werden nicht ausgegeben (kein Personenreport).
   B7  Ab dem ersten tatsächlichen Anbieteraufruf gilt die Aktion als verbraucht (auch bei Zeitüberschreitung/
       Fehler): keine Rückbuchung, auch nicht beim harten Tagesdach. Zurück gehen die IE nur, wenn nie ein
       Aufruf stattfand (Abbruch vor dem Anbieter).
   B8  Ein Adapter, der Frist/Abbruch überlebt, hält seinen Platz (laufend), bis er wirklich endet, höchstens haltenMaxMs.
   B6  Zeitfehler (NaN, rückwärtslaufende Uhr) sperren (fail closed).
   ========================================================================== */

import { createHash } from "node:crypto";
import { GatewayFehler } from "./codes.mjs";

export const IE_JE_GROESSE = Object.freeze({ klein: 1, mittel: 3, gross: 7 });
/** Eingabegrenzen je Vorgang in Token (Spez. 7.2): klein 20.000, mittel 60.000, groß 150.000. */
export const EINGABE_GRENZEN = Object.freeze({ klein: 20000, mittel: 60000, gross: 150000 });

const STUNDE = 3600_000;
const TAG = 24 * STUNDE;
const ZEHN_MIN = 10 * 60_000;
const MAX_SCHLUESSEL = 5000;

const pos = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
const h = (...teile) => createHash("sha256").update(teile.join("\u0001")).digest("hex").slice(0, 16);

/** Größenklasse aus geschätzten Eingabetoken; null = über der Grenze (nie kürzen, E-8). */
export function groesseAusTokens(tokens) {
  if (!Number.isFinite(tokens) || tokens < 0) return null;
  if (tokens <= EINGABE_GRENZEN.klein) return "klein";
  if (tokens <= EINGABE_GRENZEN.mittel) return "mittel";
  if (tokens <= EINGABE_GRENZEN.gross) return "gross";
  return null;
}

export class Limits {
  /**
   * @param {{
   *   jetzt?: () => number,
   *   betriebKontingentIE: number,
   *   gesamtTagesIE: number,
   *   gesamtHartTagesIE: number,
   *   personJeStunde?: Record<string, number>,
   *   personJeTag?: Record<string, number>,
   *   klasseAJeStunde?: number,
   *   tageslimitAnteil?: number,
   *   parallelJeBetrieb?: number,
   *   gleicheAnfrageJe10Min?: number,
   *   haltenMaxMs?: number,
   *   senke?: (e: { t: number, b: string, tag: string, monat: string, ie: number }) => Promise<void>|void,
   * }} k
   */
  constructor(k) {
    if (!k || !pos(k.betriebKontingentIE) || !pos(k.gesamtTagesIE) || !pos(k.gesamtHartTagesIE)
      || k.gesamtHartTagesIE < k.gesamtTagesIE)
      throw new GatewayFehler("KI_KONTINGENT", "Limits ohne gültigen Kostendeckel.");
    this.k = {
      jetzt: k.jetzt || (() => Date.now()),
      betriebKontingentIE: k.betriebKontingentIE,
      gesamtTagesIE: k.gesamtTagesIE,
      gesamtHartTagesIE: k.gesamtHartTagesIE,
      /* Startwerte Spez. 7.3. Nur Rollen mit Eintrag dürfen überhaupt
         (Mitarbeiter/F9: Wert ungeklärt → gesperrt, bis entschieden). */
      personJeStunde: { leitung: 30, planer: 30, ...(k.personJeStunde || {}) },
      personJeTag: { leitung: 200, planer: 200, ...(k.personJeTag || {}) },
      klasseAJeStunde: k.klasseAJeStunde ?? 60,
      tageslimitAnteil: k.tageslimitAnteil ?? 0.25,
      parallelJeBetrieb: k.parallelJeBetrieb ?? 2,
      gleicheAnfrageJe10Min: k.gleicheAnfrageJe10Min ?? 5,
      haltenMaxMs: k.haltenMaxMs ?? 300_000,
      senke: typeof k.senke === "function" ? k.senke : null,
    };
    this.person = new Map();
    this.gleich = new Map();
    this.betrieb = new Map();
    this.gesamt = { tag: "", ie: 0 };
    this.letzteZeit = 0;
  }

  _zeit() {
    const t = this.k.jetzt();
    if (!Number.isFinite(t) || t < this.letzteZeit) throw new GatewayFehler("KI_LIMIT", "Zeitgeber unbrauchbar.");
    this.letzteZeit = t;
    return t;
  }

  _betriebsStand(key, t) {
    const iso = new Date(t).toISOString();
    const monat = iso.slice(0, 7);
    const tag = iso.slice(0, 10);
    let s = this.betrieb.get(key);
    if (!s) {
      if (this.betrieb.size >= MAX_SCHLUESSEL) throw new GatewayFehler("KI_LIMIT", "Zu viele Betriebe im Zähler.");
      s = { monat, tag, ieMonat: 0, ieTag: 0, laufend: 0 };
      this.betrieb.set(key, s);
    }
    if (s.monat !== monat) { s.monat = monat; s.ieMonat = 0; }
    if (s.tag !== tag) { s.tag = tag; s.ieTag = 0; }
    if (this.gesamt.tag !== tag) { this.gesamt.tag = tag; this.gesamt.ie = 0; }
    return s;
  }

  static _zaehle(liste, ab) {
    while (liste.length && liste[0] <= ab) liste.shift();
    return liste.length;
  }

  /**
   * Prüft ALLE Limits und bucht erst, wenn alle bestehen. Gibt einen Beleg zurück,
   * der mit `abschliessen` genau einmal einzulösen ist.
   * @param {{ betrieb: string, person: string, rolle: string, klasse: string, tokens: number, fingerprint: string }} a
   * @returns {{ ok: true, beleg: any, ueberKontingent: boolean } | { ok: false, code: string, grund: string }}
   */
  reservieren(a) {
    const nein = (code, grund) => ({ ok: false, code, grund });
    let t;
    try { t = this._zeit(); } catch { return nein("KI_LIMIT", "zeit"); }
    const groesse = groesseAusTokens(a.tokens ?? 0);
    if (!groesse) return nein("KI_GROESSE", "eingabe_zu_gross");
    const ie = IE_JE_GROESSE[groesse];
    const klasseA = a.klasse === "A";

    const proStunde = this.k.personJeStunde[a.rolle];
    const proTag = this.k.personJeTag[a.rolle];
    if (!pos(proStunde) || !pos(proTag)) return nein("KI_LIMIT", "rolle_ohne_limit");

    let bs;
    try { bs = this._betriebsStand(h("b", a.betrieb), t); } catch (e) { return nein(e.code || "KI_LIMIT", "zaehler"); }
    const pKey = h("p", a.betrieb, a.person);
    const pz = this.person.get(pKey) || { zeiten: [] };
    const gKey = h("g", a.betrieb, a.person, a.fingerprint);
    const gz = this.gleich.get(gKey) || [];

    /* Sicherheitslimits — für jede Klasse (B3). */
    if (bs.laufend >= this.k.parallelJeBetrieb) return nein("KI_LIMIT", "parallel");
    Limits._zaehle(pz.zeiten, t - TAG);
    const stunde = pz.zeiten.filter((z) => z > t - STUNDE).length;
    const grenzeStunde = klasseA ? Math.max(proStunde, this.k.klasseAJeStunde) : proStunde;
    if (stunde >= grenzeStunde) return nein("KI_LIMIT", "person_stunde");
    if (!klasseA && pz.zeiten.length >= proTag) return nein("KI_LIMIT", "person_tag");
    if (Limits._zaehle(gz, t - ZEHN_MIN) >= this.k.gleicheAnfrageJe10Min) return nein("KI_LIMIT", "gleiche_anfrage");

    /* Geschäftslimits — Klasse A bleibt (B4). */
    const g = this._geschaeft(bs, a.klasse, ie);
    if (!g.ok) return nein(g.code, g.grund);
    const ueber = g.ueber;

    /* Platz in den Zählern? Erst dann buchen. */
    if (!this.person.has(pKey) && this.person.size >= MAX_SCHLUESSEL) this._aufraeumen(t);
    if (!this.person.has(pKey) && this.person.size >= MAX_SCHLUESSEL) return nein("KI_LIMIT", "zu_viele_personen");
    if (!this.gleich.has(gKey) && this.gleich.size >= MAX_SCHLUESSEL) this._aufraeumen(t);
    if (!this.gleich.has(gKey) && this.gleich.size >= MAX_SCHLUESSEL) return nein("KI_LIMIT", "zu_viele_anfragen");

    pz.zeiten.push(t); this.person.set(pKey, pz);
    gz.push(t); this.gleich.set(gKey, gz);
    bs.laufend++; bs.ieMonat += ie; bs.ieTag += ie; this.gesamt.ie += ie;
    const beleg = { bKey: h("b", a.betrieb), ie, klasse: a.klasse, offen: true, tag: bs.tag, monat: bs.monat, dauer: [] };
    this._ereignis(beleg, ie);
    return { ok: true, ueberKontingent: ueber, beleg };
  }

  /** Geschäftslimits für `ie` zusätzliche Einheiten (B4). */
  _geschaeft(bs, klasse, ie) {
    const kont = this.k.betriebKontingentIE;
    const gesamtNach = this.gesamt.ie + ie;
    if (gesamtNach > this.k.gesamtHartTagesIE) return { ok: false, code: "KI_KONTINGENT", grund: "gesamt_hart" };
    if (klasse === "A") return { ok: true, ueber: bs.ieMonat + ie > kont * 1.5 || gesamtNach > this.k.gesamtTagesIE };
    const monatNach = bs.ieMonat + ie;
    if (monatNach > kont * 1.1) return { ok: false, code: "KI_KONTINGENT", grund: "betrieb_pause" };
    if (monatNach > kont && klasse === "D") return { ok: false, code: "KI_KONTINGENT", grund: "betrieb_reserve" };
    if (bs.ieTag + ie > kont * this.k.tageslimitAnteil) return { ok: false, code: "KI_KONTINGENT", grund: "betrieb_tag" };
    if (gesamtNach > this.k.gesamtTagesIE) return { ok: false, code: "KI_KONTINGENT", grund: "gesamt_tag" };
    return { ok: true, ueber: false };
  }

  /**
   * Die Eingabegröße steht erst nach dem Faktenpaket fest: der Beleg wird auf die wirkliche
   * Größenklasse angehoben (oder abgelehnt). Verringert nie.
   * @returns {{ ok: true } | { ok: false, code: string, grund: string }}
   */
  erweitern(beleg, tokens) {
    if (!beleg || beleg.offen !== true) return { ok: false, code: "KI_LIMIT", grund: "beleg" };
    const groesse = groesseAusTokens(tokens);
    if (!groesse) return { ok: false, code: "KI_GROESSE", grund: "eingabe_zu_gross" };
    const neu = IE_JE_GROESSE[groesse];
    if (neu <= beleg.ie) return { ok: true };
    const bs = this.betrieb.get(beleg.bKey);
    if (!bs || bs.monat !== beleg.monat || bs.tag !== beleg.tag) return { ok: false, code: "KI_LIMIT", grund: "zaehler" };
    const delta = neu - beleg.ie;
    const g = this._geschaeft(bs, beleg.klasse, delta);
    if (!g.ok) return g;
    bs.ieMonat += delta; bs.ieTag += delta; this.gesamt.ie += delta; beleg.ie = neu;
    this._ereignis(beleg, delta);
    return { ok: true };
  }

  _aufraeumen(t) {
    for (const [k, v] of this.person) if (!v.zeiten.some((z) => z > t - TAG)) this.person.delete(k);
    for (const [k, v] of this.gleich) if (!v.some((z) => z > t - ZEHN_MIN)) this.gleich.delete(k);
  }

  /** Vorgang beendet. `verbraucht=false`: der Anbieter hat nichts geliefert → die IE gehen zurück. */
  abschliessen(beleg, { verbraucht, spaeter }) {
    if (!beleg || beleg.offen !== true) return;
    beleg.offen = false;
    const s = this.betrieb.get(beleg.bKey);
    if (!s) return;
    /* B8: Läuft ein Adapter nach Frist/Abbruch noch (spaeter), bleibt sein Platz belegt, bis er wirklich
       endet — höchstens haltenMaxMs (danach gilt er als verloren, sonst blockierte er den Betrieb für immer). */
    const freigeben = () => { s.laufend = Math.max(0, s.laufend - 1); };
    if (spaeter && typeof spaeter.then === "function") {
      let frei = false;
      const einmalFrei = () => { if (!frei) { frei = true; freigeben(); } };
      spaeter.then(einmalFrei, einmalFrei);
      const t = setTimeout(einmalFrei, this.k.haltenMaxMs);
      if (t.unref) t.unref();
    } else freigeben();
    if (!verbraucht) {
      if (s.monat === beleg.monat) s.ieMonat = Math.max(0, s.ieMonat - beleg.ie);
      if (s.tag === beleg.tag) {
        s.ieTag = Math.max(0, s.ieTag - beleg.ie);
        if (this.gesamt.tag === beleg.tag) this.gesamt.ie = Math.max(0, this.gesamt.ie - beleg.ie);
      }
      this._ereignis(beleg, -beleg.ie);
    }
  }

  /** I15 Persistenz: jede Änderung als Ereignis an die Senke (append-only, zaehlerspeicher.mjs). Z4: das Ergebnis wird im Beleg gesammelt. */
  _ereignis(beleg, ie) {
    if (!this.k.senke || ie === 0) return;
    beleg.folge = (beleg.folge || 0) + 1;      // laufende Folgenummer je Beleg: Buchung vor Rückbuchung auch bei gleichem t
    const e = { t: this.letzteZeit, b: beleg.bKey, tag: beleg.tag, monat: beleg.monat, ie, n: beleg.folge };
    /* Z9: Eine Rückbuchung wird nur geschrieben, wenn ALLE früheren Ereignisse des Belegs dauerhaft sind — sonst stünde
       eine Rückbuchung ohne Buchung im Rollup (negativer Drift). Ist eine Buchung verloren, bleibt die Verbrauchsspur
       stehen (zu viel gezählt statt zu wenig; fail closed). */
    const vorher = [...beleg.dauer];
    const schreiben = () => Promise.resolve().then(() => this.k.senke(e)).then(() => true);
    const p = (ie < 0 ? Promise.all(vorher).then((a) => (a.every(Boolean) ? schreiben() : true)) : schreiben()).catch(() => false);
    beleg.dauer.push(p);
  }

  /** Alle Ereignisse dieses Belegs dauerhaft geschrieben? (false bei Speicherfehler.) */
  async dauerhaft(beleg, fristMs = 2000) {
    if (!beleg || !Array.isArray(beleg.dauer)) return true;
    /* Ein hängender Zählerspeicher darf den Vorgang nicht ewig aufhalten: nach der Frist gilt „nicht dauerhaft“. */
    let uhr;
    const frist = new Promise((r) => { uhr = setTimeout(() => r(false), Math.max(1, fristMs)); if (uhr.unref) uhr.unref(); });
    try { return await Promise.race([Promise.all(beleg.dauer).then((a) => a.every(Boolean)), frist]); } finally { clearTimeout(uhr); }
  }

  /** Stand aus dem Rollup laden (nach einem Neustart, vor dem ersten Gebrauch). */
  ladeStand(stand) {
    if (this.betrieb.size || this.gesamt.ie) throw new GatewayFehler("KI_LIMIT", "Zähler schon in Gebrauch.");
    const ok = (v) => Number.isFinite(v) && v >= 0 && v <= 1e9;
    for (const [key, b] of Object.entries((stand && stand.betriebe) || {})) {
      if (!/^[0-9a-f]{16}$/.test(key) || !b || !ok(b.ieMonat) || !ok(b.ieTag) || typeof b.monat !== "string" || typeof b.tag !== "string") continue;
      this.betrieb.set(key, { monat: b.monat, tag: b.tag, ieMonat: b.ieMonat, ieTag: b.ieTag, laufend: 0 });
    }
    const g = stand && stand.gesamt;
    if (g && typeof g.tag === "string" && ok(g.ie)) this.gesamt = { tag: g.tag, ie: g.ie };
  }

  /** Für Alarme (alarme.mjs): Kontingent und Tagesbudgets als Zahlen. */
  konfig() { return { kontingentIE: this.k.betriebKontingentIE, tagesIE: this.k.gesamtTagesIE, hartTagesIE: this.k.gesamtHartTagesIE }; }

  /** Nur Summen je Betrieb, nie je Person (B5). */
  stand(betrieb) {
    const s = this.betrieb.get(h("b", betrieb));
    return s ? { ieMonat: s.ieMonat, ieTag: s.ieTag, laufend: s.laufend, anteilMonat: s.ieMonat / this.k.betriebKontingentIE }
      : { ieMonat: 0, ieTag: 0, laufend: 0, anteilMonat: 0 };
  }

  gesamtStand() { return { ieTag: this.gesamt.ie }; }
}

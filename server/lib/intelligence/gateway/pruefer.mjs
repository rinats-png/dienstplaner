/* ==========================================================================
   INTELLIGENCE-GATEWAY — AUSGABEPRÜFER (WP-I13)

   Alles, was ein Anbieter liefert, ist UNGEPRÜFTER FREMDTEXT. Es gibt genau
   einen Weg zur Oberfläche: durch diese Funktion. Sie baut das Ergebnis
   FELD FÜR FELD NEU auf (nichts aus der Anbieterausgabe wird durchgereicht);
   jede Verletzung verwirft die GANZE Antwort (kein Teilergebnis, kein
   „Schwärzen“ von Zahlen oder Namen). Nur harmlose Formfehler (Steuer- und
   Null-Breite-Zeichen) werden neutralisiert.

   Regeln (interne Codes; sie lehnen sich an die Prüferliste P-01…P-10 der
   Spezifikation an, die Nummerierung dort ist nicht öffentlich festgelegt):
     P-01  Struktur: Ausgabe ist ein einfaches Objekt; nur Felder text, bausteine;
           nur endliche JSON-Werte; keine Prototyp-Schlüssel; Strukturgrenzen
     P-02  Zahl, Uhrzeit, Datum oder Kennung (Regel-/Dienst-/Zustandsbezeichner) kommt
           nicht aus dem Faktenpaket
     P-03  verbotenes Merkmal (Gesundheit, Schutzstatus, Leistung, Fehlzeiten,
           Zuverlässigkeit) — Startliste, ergänzt durch P-06
     P-04  Alias, den das Paket nicht kennt (erfunden)
     P-05  Einschleusung/Exfiltration: Markup, Link, Adresse, Rollenmarke, Anweisung
           an den Leser, Code-Zaun, kodierte Blöcke
     P-06  Leck-Prüfung des Betriebs (Klarnamen, Kontakt, Gesundheit … der Sperrliste)
     P-07  Baustein/Parameter nicht im Katalog der Funktion
     P-08  Grenzen: leer, zu lang (nie kürzen), zu viele Bausteine
     P-09  geschweifte Klammern (Platzhalter entstehen nur im Server aus Alias)

   INVARIANTEN
   P1  Fail closed: jede Ausnahme in der Prüfung = Ablehnung.
   P2  Ohne Baustein-Katalog der Funktion ist JEDER Baustein abgelehnt.
   P3  Ohne Sperrliste keine Freigabe (leckPruefen lehnt dann ab).
   P4  Der Rückgabewert enthält nie den abgelehnten Inhalt; `codes` sind Kennungen.
   P5  Zahlen in Text und Parametern müssen im Paket stehen; eine Gegenrechnung
       durch den Rechenkern (WP-I12) kommt zusätzlich und ersetzt das nicht.
   ========================================================================== */

import { ALIAS_MUSTER, DIENST_ALIAS_MUSTER, ZUSTAENDE, strukturPruefen } from "../schemas.mjs";
import { FELDNAMEN } from "../felder.mjs";
import { leckPruefen } from "../leckpruefung.mjs";
import { fremdtextBereinigen } from "../kapsel.mjs";

export const AUSGABE_GRENZEN = Object.freeze({ text: 4000, bausteine: 100, parameter: 20, parameterWert: 200, bytes: 64 * 1024 });

const TAGARTIG = /<\/?\s*[A-Za-z_!?][^<>]{0,200}>|<\s*\//;
const LINK = /\b(?:https?|ftp|file|javascript|data|mailto):|\bwww\.|\]\s*\(|[\w.-]+@[\w-]+\.[a-z]{2,}|\b[\w-]{2,}\.(?:com|de|org|net|io|eu|info|ru|cn|xyz)\b/i;
const ROLLENMARKE = /\b(?:system|assistant|user|developer|human)\s*:|\bsystem\s*prompt\b|\bignor(?:e|iere)\b[^.\n]{0,40}\b(?:vorherige|previous|all|alle|anweisung|instruction)/i;
const ANWEISUNG = /\b(?:gib|nenne|liste|zeige|sende|schicke|lösche|loesche|schreibe|überschreibe|ueberschreibe)\b[^.\n]{0,40}\b(?:alle|sämtliche|saemtliche)\b[^.\n]{0,30}\b(?:namen|daten|personen|passw|schlüssel|schluessel)/i;
const ZAUN = /```|~~~|<<|>>|\[\[|\]\]|DATEN_[0-9A-Fa-f]{4,}/;
const KODIERT = /[A-Za-z0-9+/]{40,}={0,2}/;
const KLAMMER = /[{}]/;
const MERKMAL = /krank|erkrank|gesundheit|diagnos|schwanger|mutterschutz|jugendschutz|schwerbehind|behinder|beschäftigungsverbot|beschaeftigungsverbot|stillzeit|psych|burn.?out|medikament|attest|\bkur\b|\breha|leistungs(?:schwach|stark|bewert|minder)|unzuverl|zuverlässig|zuverlaessig|fehlzeit|\bfaul|schlechte[rn]? mitarbeiter/i;

const ALIAS_KANDIDAT = /\b[A-Z]_[A-Za-z0-9]{3,}\b/g;
const DATUM = /\b\d{4}-\d{2}-\d{2}\b/g;
const ZEIT = /\b\d{1,2}:\d{2}\b/g;
const ZAHL = /\d+(?:[.,]\d+)?/g;
const BEZEICHNER_CAMEL = /\b[a-zäöüß]+[A-ZÄÖÜ][A-Za-zäöüß0-9]*\b/g;
/* Zahlwörter (zwei … tausend): „ein/eine“ bleibt erlaubt; Beugungen und Zusammensetzungen (zweiundzwanzig) werden mitgefangen.
   Bekannte Lücke: „halb“, „Dutzend“, „Viertel“ (wpI-offene-fragen.md). */
const ZAHLWORT = /\b(?:null|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|neun|zehn|elf|zw(?:ö|oe)lf|zwanzig|drei(?:ß|ss)ig|vierzig|f(?:ü|ue)nfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend)(?:zehn|zig|ßig|hundert|tausend|und[a-zäöüß]{3,})?(?:mal|e|er|en|es|em)?\b/i;
const BEZEICHNER_UNTERSTRICH = /\b[A-Za-zäöüß0-9]+(?:[_:][A-Za-zäöüß0-9]+)+\b/g;

const normZahl = (s) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? String(n) : null;
};
const normZeit = (s) => String(s).replace(/^(\d):/, "0$1:");
const istAlias = (s) => typeof s === "string" && (ALIAS_MUSTER.test(s) || DIENST_ALIAS_MUSTER.test(s));

/** Was das Paket erlaubt: Zahlen, Zeiten, Daten, Alias, Kennungen. */
export function erlaubtAusPaket(paket) {
  const zahlen = new Set(); const zahlenExakt = new Set(); const zeiten = new Set(); const daten = new Set(); const alias = new Set(); const kennungen = new Set(ZUSTAENDE);
  const sammleZahlen = (text) => { for (const m of String(text).matchAll(ZAHL)) { const z = normZahl(m[0]); if (z !== null) zahlen.add(z); } };
  const datum = (d) => { if (typeof d === "string") daten.add(d); };
  const alle = (w) => {
    if (typeof w !== "string") return;
    if (istAlias(w)) alias.add(w); else kennungen.add(w);
  };
  if (paket && paket.zeitraum) { datum(paket.zeitraum.von); datum(paket.zeitraum.bis); }
  if (paket && paket.bezug) {
    datum(paket.bezug.datum);
    for (const k of ["alias", "bezugAlias", "ref"]) alle(paket.bezug[k]);
  }
  for (const f of (paket && paket.fakten) || []) {
    if (f.art === "zahl" && typeof f.wert === "number") { const z = normZahl(Math.abs(f.wert)); if (z !== null) zahlen.add(z); zahlenExakt.add(String(f.wert)); }
    else if (f.art === "zeit") zeiten.add(normZeit(f.wert));
    else if (f.art === "datum") datum(f.wert);
    else if (f.art === "kennung") alle(f.wert);
    datum(f.datum); datum(f.bis);
    for (const k of ["alias", "bezugAlias", "ref"]) alle(f[k]);
    if (f.regel) {
      alle(f.regel.regelId);
      if (typeof f.regel.fundstelle === "string") sammleZahlen(f.regel.fundstelle);
    }
  }
  return { zahlen, zahlenExakt, zeiten, daten, alias, kennungen };
}

/**
 * @param {{
 *   ausgabe: unknown,
 *   paket: any,
 *   bausteinKatalog?: Record<string, { parameter?: readonly string[] }> | null,
 *   sperrliste: any,
 * }} o
 * @returns {{ ok: true, ergebnis: { text?: string, bausteine?: any[] }, neutralisiert: boolean }
 *   | { ok: false, codes: string[] }}
 */
export function ausgabePruefen(o) {
  const codes = new Set();
  try {
    const { ausgabe, paket, bausteinKatalog, sperrliste } = o;
    const abbruch = () => ({ ok: false, codes: [...codes].sort() });

    /* P-01 Struktur ------------------------------------------------------ */
    if (!ausgabe || typeof ausgabe !== "object" || Array.isArray(ausgabe)) { codes.add("P-01"); return abbruch(); }
    const proto = Object.getPrototypeOf(ausgabe);
    if (proto !== Object.prototype && proto !== null) { codes.add("P-01"); return abbruch(); }
    let roh;
    try { roh = JSON.stringify(ausgabe); } catch { codes.add("P-01"); return abbruch(); }
    if (roh.length > AUSGABE_GRENZEN.bytes) { codes.add("P-08"); return abbruch(); }
    if (strukturPruefen(ausgabe).length) { codes.add("P-01"); return abbruch(); }
    const eigene = Object.keys(ausgabe);
    if (eigene.some((k) => k !== "text" && k !== "bausteine")) { codes.add("P-01"); return abbruch(); }
    if (eigene.length === 0) { codes.add("P-08"); return abbruch(); }
    const { text, bausteine } = /** @type {any} */ (ausgabe);
    if (text !== undefined && typeof text !== "string") codes.add("P-01");
    if (bausteine !== undefined && !Array.isArray(bausteine)) codes.add("P-01");
    if (codes.size) return abbruch();
    if (text === undefined && (bausteine === undefined || bausteine.length === 0)) { codes.add("P-08"); return abbruch(); }

    const erlaubt = erlaubtAusPaket(paket);
    const strings = [];     // alles, was in die Leck-Prüfung geht (nur Zeichenketten, keine Schlüssel)
    let neutralisiert = false;
    const ergebnis = {};

    /* Text --------------------------------------------------------------- */
    if (text !== undefined) {
      const t = textPruefen(text, erlaubt, codes);
      if (t === null) return abbruch();
      neutralisiert = t.neutralisiert;
      ergebnis.text = t.text;
      strings.push(t.text);
    }

    /* Bausteine ---------------------------------------------------------- */
    if (bausteine !== undefined) {
      if (bausteine.length > AUSGABE_GRENZEN.bausteine) { codes.add("P-08"); return abbruch(); }
      const aus = [];
      for (const b of bausteine) {
        const kat = bausteinKatalog && Object.prototype.hasOwnProperty.call(bausteinKatalog, b && b.id) ? bausteinKatalog[b.id] : null;
        if (!b || typeof b !== "object" || Array.isArray(b) || !kat) { codes.add("P-07"); continue; }
        if (Object.keys(b).some((k) => k !== "id" && k !== "parameter")) { codes.add("P-01"); continue; }
        const erlaubteNamen = new Set(kat.parameter || []);
        const ps = b.parameter === undefined ? [] : b.parameter;
        if (!Array.isArray(ps) || ps.length > AUSGABE_GRENZEN.parameter) { codes.add("P-08"); continue; }
        const neu = { id: String(b.id) };
        strings.push(neu.id);
        const parameter = [];
        for (const p of ps) {
          if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).some((k) => k !== "name" && k !== "wert")
            || typeof p.name !== "string" || !erlaubteNamen.has(p.name)) { codes.add("P-07"); continue; }
          const w = p.wert;
          if (typeof w === "boolean") { parameter.push({ name: p.name, wert: w }); continue; }
          if (typeof w === "number") {
            if (!Number.isFinite(w) || !erlaubt.zahlenExakt.has(String(w))) { codes.add("P-02"); continue; }
            parameter.push({ name: p.name, wert: w });
            continue;
          }
          if (typeof w === "string") {
            if (w.length > AUSGABE_GRENZEN.parameterWert) { codes.add("P-08"); continue; }
            const ok = erlaubt.alias.has(w) || erlaubt.kennungen.has(w) || erlaubt.daten.has(w) || erlaubt.zeiten.has(normZeit(w));
            if (!ok) { codes.add(istAlias(w) ? "P-04" : "P-02"); continue; }
            parameter.push({ name: p.name, wert: w });
            strings.push(w);
            continue;
          }
          codes.add("P-01");
        }
        if (parameter.length) neu.parameter = parameter;
        aus.push(neu);
      }
      if (codes.size) return abbruch();
      ergebnis.bausteine = aus;
    }
    if (codes.size) return abbruch();

    /* P-06 Leck-Prüfung des Betriebs (nur Zeichenketten) ----------------- */
    const leck = leckPruefen(strings, sperrliste);
    if (!leck || leck.ok !== true) { codes.add("P-06"); return abbruch(); }

    return { ok: true, ergebnis, neutralisiert };
  } catch {
    codes.add("P-01");
    return { ok: false, codes: [...codes].sort() };
  }
}

/** Prüft einen Text. null = abgelehnt (Codes in `codes`). */
function textPruefen(text, erlaubt, codes) {
  if ([...text].length > AUSGABE_GRENZEN.text) { codes.add("P-08"); return null; }
  if (text.trim().length === 0) { codes.add("P-08"); return null; }
  if (KLAMMER.test(text)) codes.add("P-09");
  if (TAGARTIG.test(text) || LINK.test(text) || ROLLENMARKE.test(text) || ANWEISUNG.test(text) || ZAUN.test(text) || KODIERT.test(text))
    codes.add("P-05");
  if (MERKMAL.test(text)) codes.add("P-03");
  if (codes.size) return null;

  /* Neutralisieren: Steuer-/Null-Breite-Zeichen raus, Leerraum glätten. */
  const sauber = fremdtextBereinigen(text);
  if (sauber.length === 0) { codes.add("P-08"); return null; }
  /* Verdeckte Muster nach dem Entfernen unsichtbarer Zeichen erneut prüfen. */
  if (TAGARTIG.test(sauber) || LINK.test(sauber) || ROLLENMARKE.test(sauber) || MERKMAL.test(sauber)) { codes.add("P-05"); return null; }

  let rest = sauber;
  for (const m of rest.matchAll(ALIAS_KANDIDAT)) {
    if (!erlaubt.alias.has(m[0])) codes.add("P-04");
  }
  rest = rest.replace(ALIAS_KANDIDAT, " ");
  for (const m of rest.matchAll(DATUM)) if (!erlaubt.daten.has(m[0])) codes.add("P-02");
  rest = rest.replace(DATUM, " ");
  for (const m of rest.matchAll(ZEIT)) if (!erlaubt.zeiten.has(normZeit(m[0]))) codes.add("P-02");
  rest = rest.replace(ZEIT, " ");
  for (const m of rest.matchAll(ZAHL)) { const z = normZahl(m[0]); if (z === null || !erlaubt.zahlen.has(z)) codes.add("P-02"); }
  if (ZAHLWORT.test(rest)) codes.add("P-02");
  for (const re of [BEZEICHNER_CAMEL, BEZEICHNER_UNTERSTRICH]) {
    for (const m of rest.matchAll(re)) {
      if (!erlaubt.kennungen.has(m[0]) && !FELDNAMEN.includes(m[0]) && !istAlias(m[0])) codes.add("P-02");
    }
  }
  if (codes.size) return null;
  return { text: sauber, neutralisiert: sauber !== text };
}

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
     P-02  Zahl (Ziffern, Zahlwörter, Mengenwörter, Ordnungszahlen, römische Ziffern,
           Brüche), Vorzeichen, Einheit, Uhrzeit, Datum oder Kennung kommt nicht aus
           dem Faktenpaket
     P-03  verbotenes Merkmal (Gesundheit, Schutzstatus, Leistung, Fehlzeiten,
           Zuverlässigkeit) — Startliste, ergänzt durch P-06
     P-04  Alias, den das Paket nicht kennt (erfunden)
     P-05  Einschleusung/Exfiltration: Markup, Entitäten, Link (auch ohne Schema), Adresse,
           Rollenmarke, Anweisung an den Leser, Code-Zaun, kodierte Blöcke, fremde Schrift
     P-06  Leck-Prüfung des Betriebs (Klarnamen, Kontakt, Gesundheit … der Sperrliste)
     P-07  Baustein/Parameter nicht im Katalog der Funktion
     P-08  Grenzen: leer, zu lang (nie kürzen), zu viele Bausteine
     P-09  geschweifte Klammern (Platzhalter entstehen nur im Server aus Alias)

   INVARIANTEN
   P1  Fail closed: jede Ausnahme in der Prüfung = Ablehnung.
   P2  Ohne Baustein-Katalog der Funktion ist JEDER Baustein abgelehnt.
   P3  Ohne Sperrliste keine Freigabe (leckPruefen lehnt dann ab).
   P4  Der Rückgabewert enthält nie den abgelehnten Inhalt; `codes` sind Kennungen.
   P5  Jede Zahl in Text und Parametern muss im Paket stehen — samt Vorzeichen und Einheit;
       eine Gegenrechnung durch den Rechenkern (WP-I12) kommt zusätzlich und ersetzt das nicht.
   P6  Die Ausgabe wird EINMAL zu JSON gemacht und nur diese Momentaufnahme wird geprüft und
       verwendet (Getter/Proxy können zwischen Prüfung und Verwendung nichts mehr ändern).
   P8  Nach einer Zahl steht nur ein bekanntes Einheitenwort oder ein Funktionswort; eine Zahl mit Einheit im Paket steht
       mit dieser Einheit oder direkt hinter ihrem Feldnamen (nie nackt, nie mit fremder Einheit); „minus/plus“ vor einer
       Zahl sind Vorzeichen, alle anderen Vorzeichenwörter (Defizit, Überschuss, im Minus …) werden abgelehnt.
   P9  Vorzeichen: ein negativer Paketwert wird nur mit „-“/„minus“ genannt, ein positiver nie; zusätzlich Richtungswörter
       (Überstunden, Mehrarbeit, über/unter Soll, fehlen, zu wenig, rote Zahlen …) in Texten mit Zahl abgelehnt (im Zweifel
       ablehnen: die Rückfall-Antwort ist zulässig). Einheitenwörter werden auch hinter Klammer, Bindestrich, Schrägstrich geprüft.
   P7  Geprüft wird auf dem NFKC-normalisierten Text ohne unsichtbare Zeichen (Vollbreite,
       Null-Breite); fremde Schriften (kyrillisch, griechisch, arabisch …) werden abgelehnt.
   ========================================================================== */

import { ALIAS_MUSTER, DIENST_ALIAS_MUSTER, ZUSTAENDE, strukturPruefen } from "../schemas.mjs";
import { FELDNAMEN } from "../felder.mjs";
import { leckPruefen } from "../leckpruefung.mjs";
import { fremdtextBereinigen } from "../kapsel.mjs";

export const AUSGABE_GRENZEN = Object.freeze({ text: 4000, bausteine: 100, parameter: 20, parameterWert: 200, bytes: 64 * 1024 });

const TAGARTIG = /<\/?\s*[A-Za-z_!?][^<>]{0,200}>|<\s*\//;
const ENTITAET = /&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/i;
const LINK = /\b(?:https?|ftp|file|javascript|data|mailto):|\bwww\.|\]\s*\(|[\w.-]+@[\w-]+\.[a-z]{2,}/i;
const DOMAINARTIG = /[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+/gi;
const ROLLENMARKE = /\b(?:system|assistant|user|developer|human)\s*:|\bsystem\s*prompt\b|\bignor(?:e|iere)\b[^.\n]{0,40}\b(?:vorherige|previous|all|alle|anweisung|instruction)/i;
const ANWEISUNG = /\b(?:gib|nenne|liste|zeige|sende|schicke|lösche|loesche|schreibe|überschreibe|ueberschreibe)\b[^.\n]{0,40}\b(?:alle|sämtliche|saemtliche)\b[^.\n]{0,30}\b(?:namen|daten|personen|passw|schlüssel|schluessel)/i;
const ZAUN = /```|~~~|<<|>>|\[\[|\]\]|DATEN_[0-9A-Fa-f]{4,}/;
const KODIERT = /[A-Za-z0-9+/]{40,}={0,2}/;
const KLAMMER = /[{}]/;
const FREMDE_SCHRIFT = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;
const MERKMAL = /krank|erkrank|gesundheit|diagnos|schwanger|mutterschutz|jugendschutz|schwerbehind|behinder|beschäftigungsverbot|beschaeftigungsverbot|stillzeit|psych|burn.?out|medikament|attest|\bkur\b|\breha|leistungs(?:schwach|stark|bewert|minder)|unzuverl|zuverlässig|zuverlaessig|fehlzeit|schmerz|\barzt|grippe|infekt|erkält|erkaelt|\bfaul|schlechte[rn]? mitarbeiter/i;

const ALIAS_KANDIDAT = /\b[A-Z]_[A-Za-z0-9]{3,}\b/g;
const DATUM = /\b\d{4}-\d{2}-\d{2}\b/g;
const ZEIT = /\b\d{1,2}:\d{2}\b/g;
const ZAHL = /\d+(?:[.,]\d+)?/g;
const ZAHL_MIT_VORZEICHEN = /(?<![\p{L}\d.,])([-−–+]?)(\d+(?:[.,]\d+)?)(?:\s*(%|‰|\p{L}+))?/gu;
const BEZEICHNER_CAMEL = /\b[a-zäöüß]+[A-ZÄÖÜ][A-Za-zäöüß0-9]*\b/g;
const BEZEICHNER_UNTERSTRICH = /\b[A-Za-zäöüß0-9]+(?:[_:][A-Za-zäöüß0-9]+)+\b/g;
/* Römische Ziffern, groß und klein (ⅳ → iv durch NFKC), mindestens zwei Zeichen; Wochentagskürzel Di/Mi sind ausgenommen.
   Ein einzelnes freistehendes x oder v (ⅹ, ⅴ) zählt ebenfalls. */
const ROEMISCH = /\b(?!(?:di|mi)\b)(?=[MDCLXVI]{2,}\b)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})\b/i;
const ROEMISCH_EINZELN = /(?<![\w.])[xvlcdm](?![\w.])/i;
/* „ein Jahr“, „eine Woche“ … sind Mengenangaben mit Einheit, die das Paket nie hat. */
const EIN_EINHEIT = /\b(?:ein|eine|einen|einem|einer)\s+(?:jahr|jahre|monat|monate|woche|wochen|sekunde|sekunden|minute|minuten|stunde|stunden|tag|tage|quartal|euro|cent)\b/i;
const ABKUERZUNG_MENGE = /\b(?:mrd|tsd|mio|mill)\b/i;
/* „die 4. Woche“, „2. Schicht“: Ordnungszahl mit Punkt vor einer Zeit-/Dienstbezeichnung. */
const ORDINAL_ZIFFER = /\d\.\s*(?:woche|monat|jahr|tag|quartal|schicht|dienst|mal)/i;
/* Verkleidungen: halb/eineinhalb/anderthalb, -jährig/-stellig/-stündig …, Mal- und Faktorform an der Ziffer. */
const MENGEN_ZUSAMMENSETZUNG = /\b\w*(?:einhalb|anderthalb|dritthalb|vierthalb|jährig|jaehrig|stellig|stündig|stuendig|minütig|minuetig|tägig|taegig|wöchig|woechig|monatig)\w*\b/i;
const MAL_AN_ZIFFER = /\d\s*[-–]?\s*(?:fach|mal|x|×)(?![A-Za-zäöüß])|(?<![\w])[x×]\s*\d/i;
const BRUCH = /\d\s*\/\s*\d/;
const TAUSENDER = /\d{1,3}(?:[.,]\d{3})+(?!\d)/;
const ZIFFER_BUCHSTABE = /\d[A-Za-zµ]/;
const FREMDE_ZIFFER = /(?![0-9])[\p{Nd}\p{No}\p{Nl}]/u;

/* Mengenwörter, die keine Zahlwort-Bausteine sind. */
const MENGENWORT = /\b(?:dekade[n]?|handvoll|gros|schock|unz[äa]hlig[a-zäöüß]*|trio|duo|quartett[a-zäöüß]*|quintett[a-zäöüß]*|beide[rns]?|beiden|halb(?:e|er|en|es|em|jahr\w*|stündig\w*)?|h(?:ä|ae)lfte|\w*dutzend\w*|paar(?:e|en)?|\w*(?:drittel|viertel|f(?:ü|ue)nftel|sechstel|siebtel|achtel|zehntel)\w*|doppel\w*|verdoppel\w*|halbier\w*|mehrfach\w*|mehrere|einige|zahlreiche)\b/i;
/* Englische Zahl- und Mengenwörter. */
const ENGLISCH = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|(?:thir|four|fif|six|seven|eigh|nine)teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|quarter|dozen|first|second|third|fourth|fifth|twice|thrice|double|triple)s?\b/i;

/* Zahlwörter werden in Bausteine zerlegt (zweiundzwanzigsten = zwei+und+zwanzig+sten); ein Wort ist
   ein Zahlwort, wenn es sich VOLLSTÄNDIG aus Bausteinen bilden lässt und mindestens ein Zahlstamm
   dabei ist. „ein/eine/einer“ allein (nur Kleber) bleiben erlaubt. */
const STAEMME = ["null", "eins", "einmal", "zwei", "zwo", "drei", "vier", "fuenf", "fünf", "sechs", "sech", "sieb", "sieben", "acht",
  "neun", "zehn", "elf", "zwoelf", "zwölf", "zwanzig", "dreissig", "dreißig", "vierzig", "fuenfzig", "fünfzig", "sechzig", "siebzig",
  "achtzig", "neunzig", "zig", "ssig", "ßig", "hundert", "tausend", "million", "millionen", "milliarde", "milliarden", "dritt", "viert",
  "fuenft", "fünft", "sechst", "siebt", "neunt", "zehnt", "elft", "zwoelft", "zwölft", "zweit", "erst", "zwanzigst", "hundertst",
  "tausendst"];
const KLEBER = ["ein", "und", "e", "er", "en", "es", "em", "s", "n", "ern", "ver", "t", "jahr", "jahre", "jahren", "schaft", "te", "ten", "ter", "tes", "tem", "ste", "sten", "ster", "stes", "stem",
  "el", "tel", "mal", "mals", "fach", "fache", "facher", "fachen", "ig", "ige", "iger", "igen", "iges"];
const STAMMSET = new Set(STAEMME);
const BAUSTEINE = [...STAEMME, ...KLEBER].sort((a, b) => b.length - a.length);

function istZahlwort(wort) {
  const w = wort.toLowerCase();
  if (w.length === 0 || w.length > 60 || w === "erst") return false;
  const memo = new Map();
  const geh = (i, genutzt) => {
    if (i === w.length) return genutzt;
    const k = i * 2 + (genutzt ? 1 : 0);
    if (memo.has(k)) return memo.get(k);
    let r = false;
    for (const b of BAUSTEINE) {
      if (w.startsWith(b, i) && geh(i + b.length, genutzt || STAMMSET.has(b))) { r = true; break; }
    }
    memo.set(k, r);
    return r;
  };
  return geh(0, false);
}
const zahlwoerterIn = (text) => text.split(/[^\p{L}]+/u).some(istZahlwort);

/* Einheitenwörter → Einheitencode des Faktenpakets (EINHEITEN in schemas.mjs). */
const EINHEIT_WORT = [[/^(?:minuten?|min)$/i, "min"], [/^(?:stunden?|std|h)$/i, "h"], [/^(?:tage|tagen|tag)$/i, "tage"],
  [/^(?:personen?|mitarbeitende[rn]?)$/i, "personen"], [/^(?:prozent|%|‰)$/i, "prozent"]];
const einheitCode = (wort) => { for (const [re, c] of EINHEIT_WORT) if (re.test(wort)) return c; return null; };

const normZahl = (s) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? String(n) : null;
};
const normZeit = (s) => String(s).replace(/^(\d):/, "0$1:");
const istAlias = (s) => typeof s === "string" && (ALIAS_MUSTER.test(s) || DIENST_ALIAS_MUSTER.test(s));
const FELDNAMEN_KLEIN = new Set(FELDNAMEN.map((f) => f.toLowerCase()));

const unsichtbar = (c) => {
  const n = c.codePointAt(0);
  return n <= 8 || n === 0x0b || n === 0x0c || (n >= 0x0e && n <= 0x1f) || n === 0x7f || n === 0xad || (n >= 0x200b && n <= 0x200f)
    || (n >= 0x202a && n <= 0x202e) || (n >= 0x2060 && n <= 0x2064) || n === 0xfeff || (n >= 0xe0000 && n <= 0xe007f);
};
const ohneUnsichtbare = (s) => [...s].filter((c) => !unsichtbar(c)).join("");

/** Was das Paket erlaubt: Zahlen, Zeiten, Daten, Alias, Kennungen, Einheiten. */
export function erlaubtAusPaket(paket) {
  const zahlen = new Set(); const zahlenExakt = new Set(); const zeiten = new Set(); const daten = new Set(); const alias = new Set();
  const kennungen = new Set(ZUSTAENDE);
  const vorzeichen = new Map();       // Betrag → { neg, pos }: mit welchem Vorzeichen steht er im Paket?
  const feldZahlen = new Map();      // Betrag → Feldnamen (klein) der Fakten MIT Einheit (min/h/tage/personen/prozent)
  const ohneEinheit = new Set();      // Beträge von Fakten ohne Einheit oder mit „anzahl“
  const einheiten = { min: new Set(), h: new Set(), tage: new Set(), personen: new Set(), prozent: new Set(), anzahl: new Set() };
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
    if (f.art === "zahl" && typeof f.wert === "number") {
      const z = normZahl(Math.abs(f.wert));
      if (z !== null) {
        zahlen.add(z);
        if (f.einheit && einheiten[f.einheit]) einheiten[f.einheit].add(z);
        if (f.einheit && f.einheit !== "anzahl" && einheiten[f.einheit]) {
          if (!feldZahlen.has(z)) feldZahlen.set(z, new Set());
          feldZahlen.get(z).add(String(f.feld).toLowerCase());
        } else ohneEinheit.add(z);
      }
      zahlenExakt.add(String(f.wert));
      if (z !== null) {
        const v = vorzeichen.get(z) || { neg: false, pos: false };
        if (f.wert < 0) v.neg = true; else v.pos = true;
        vorzeichen.set(z, v);
      }
    } else if (f.art === "zeit") zeiten.add(normZeit(f.wert));
    else if (f.art === "datum") datum(f.wert);
    else if (f.art === "kennung") alle(f.wert);
    datum(f.datum); datum(f.bis);
    for (const k of ["alias", "bezugAlias", "ref"]) alle(f[k]);
    if (f.regel) {
      alle(f.regel.regelId);
      if (typeof f.regel.fundstelle === "string") sammleZahlen(f.regel.fundstelle);
    }
  }
  return { zahlen, zahlenExakt, zeiten, daten, alias, kennungen, einheiten, feldZahlen, ohneEinheit, vorzeichen };
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
    if (typeof roh !== "string") { codes.add("P-01"); return abbruch(); }
    if (roh.length > AUSGABE_GRENZEN.bytes) { codes.add("P-08"); return abbruch(); }
    if (strukturPruefen(ausgabe).length) { codes.add("P-01"); return abbruch(); }
    /* P6: ab hier nur noch die Momentaufnahme. */
    const daten = JSON.parse(roh);
    if (strukturPruefen(daten).length) { codes.add("P-01"); return abbruch(); }
    const eigene = Object.keys(daten);
    if (eigene.some((k) => k !== "text" && k !== "bausteine")) { codes.add("P-01"); return abbruch(); }
    if (eigene.length === 0) { codes.add("P-08"); return abbruch(); }
    const { text, bausteine } = daten;
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
        const kat = b && typeof b === "object" && typeof b.id === "string" && bausteinKatalog
          && Object.prototype.hasOwnProperty.call(bausteinKatalog, b.id) ? bausteinKatalog[b.id] : null;
        if (!b || typeof b !== "object" || Array.isArray(b) || !kat) { codes.add("P-07"); continue; }
        if (Object.keys(b).some((k) => k !== "id" && k !== "parameter")) { codes.add("P-01"); continue; }
        const erlaubteNamen = new Set(kat.parameter || []);
        const ps = b.parameter === undefined ? [] : b.parameter;
        if (!Array.isArray(ps) || ps.length > AUSGABE_GRENZEN.parameter) { codes.add("P-08"); continue; }
        const neu = { id: b.id };
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

/* Wörter, die nach einer Zahl stehen dürfen, ohne eine Einheit zu sein. */
const FUNKTIONSWORT = new Set(["und", "oder", "bis", "sowie", "zu", "von", "am", "im", "um", "nach", "vor", "auf", "ab", "in", "laut", "bei", "ist", "war", "sind", "beträgt", "betraegt"]);
/* Schwache Richtungswörter (Überstunden, Mehrarbeit, unter/über Soll, fehlen, zu wenig …): nur zusammen mit einer Zahl verdächtig. */
const RICHTUNGSWORT = /(?<![\p{L}])(?:[üu]e?berstunden|minusstunden|plusstunden|mehrstunden|minderstunden|mehrarbeit|minderarbeit|unterdeckung|[üu]e?berdeckung|(?:[üu]e?ber|unter)\s+(?:dem\s+)?soll|soll\s+(?:unter|über|ueber)\w*|fehl\p{L}*|zu\s+(?:wenig|viel)|rote[nr]?\s+zahlen|unterschritt\p{L}*|[üu]e?berschritt\p{L}*|unterschreit\p{L}*|[üu]e?berschreit\p{L}*|abbau|aufbau|ausgleich\p{L}*|abgebaut|aufgebaut)(?![\p{L}])/iu;
const VORZEICHENWORT = /(?<![\p{L}])(?:defizit\p{L}*|[üu]e?berschuss\p{L}*|negativ\p{L}*|positiv\p{L}*|guthaben|fehlbetrag|r[üu]e?ckstand|schulden)(?![\p{L}])/iu;

/** Das erste Wort nach einer Zahl — Satzzeichen, Klammern, Bindestriche und Schrägstrich werden übersprungen,
    am Satzende oder vor der nächsten Ziffer ist Schluss. */
function einheitNach(text, ende) {
  let nach = text.slice(ende, ende + 80);
  const satz = nach.search(/[.!?;](?:\s|$)|\n|\d/u);
  if (satz >= 0) nach = nach.slice(0, satz);
  const w = nach.match(/^[\s\-–—−()[\]„“"'‚‘’/:,]*(%|‰|\p{L}+)/u);
  return w ? w[1] : null;
}

/** Zahlen im Text: Wert, Vorzeichen und Einheit müssen zum Paket passen (P5, P8). */
function zahlenPruefen(rest, erlaubt, codes) {
  /* „minus 3,5“ / „plus 3,5“ vor einer Zahl sind Vorzeichen und werden wie „-3,5“ / „+3,5“ geprüft; alle anderen
     Vorzeichenwörter (Defizit, Überschuss, im Minus, negativ …) sind zweideutig und werden abgelehnt. */
  const mitVz = rest.replace(/\bminus\s+(?=\d)/gi, "-").replace(/\bplus\s+(?=\d)/gi, "+");
  if (/\b(?:minus|plus)\b/i.test(mitVz) || VORZEICHENWORT.test(mitVz)) codes.add("P-02");
  if (/\d/.test(mitVz) && RICHTUNGSWORT.test(mitVz)) codes.add("P-02");
  for (const m of mitVz.matchAll(ZAHL_MIT_VORZEICHEN)) {
    const [, vz, ziffern] = m;
    const z = normZahl(ziffern);
    if (z === null || !erlaubt.zahlen.has(z)) { codes.add("P-02"); continue; }
    const minus = !!vz && /[-−–]/.test(vz);
    const v = erlaubt.vorzeichen.get(z);
    /* P9: Vorzeichen stimmen überein — ein negativer Paketwert wird nur mit „-“/„minus“ genannt, ein positiver nie damit.
       Beträge aus Fundstellen (ohne Zahlenfakt) haben kein Vorzeichen. */
    if (v) {
      if (minus && !v.neg) codes.add("P-02");
      if (!minus && v.neg && !v.pos) codes.add("P-02");
    } else if (minus) codes.add("P-02");
    if (vz === "+" && !erlaubt.zahlenExakt.has(z)) codes.add("P-02");
    const einheitWort = einheitNach(mitVz, m.index + (vz ? vz.length : 0) + ziffern.length);
    const code = einheitWort ? einheitCode(einheitWort) : null;
    if (code) { if (!erlaubt.einheiten[code].has(z)) codes.add("P-02"); continue; }
    /* Fundstelle („§ 5 ArbZG“, „Art. 9“): die Zahl stammt aus regel.fundstelle des Pakets, danach folgt der Gesetzesname. */
    if (/(?:§|Art\.?)\s*$/i.test(mitVz.slice(0, m.index))) continue;
    /* P8: Nach einer Zahl folgt nur ein bekanntes Einheitenwort oder ein Funktionswort — sonst (Sekunden, Wochen,
       Euro, Jahre, pro/je Woche, Dienste …) ist die Einheit unbekannt; auch hinter Klammer, Bindestrich, Schrägstrich. */
    if (einheitWort && !FUNKTIONSWORT.has(einheitWort.toLowerCase())) { codes.add("P-02"); continue; }
    /* Eine Zahl, die im Paket eine Einheit hat, steht entweder mit dieser Einheit oder direkt hinter dem Feldnamen
       („ruhezeit.ist 660“) — nie nackt („Alter 660“). */
    if (erlaubt.feldZahlen.has(z) && !erlaubt.ohneEinheit.has(z)) {
      const davor = (mitVz.slice(0, m.index).match(/(\S+)\s*$/) || ["", ""])[1].replace(/[:,;]+$/, "").toLowerCase();
      if (!erlaubt.feldZahlen.get(z).has(davor)) codes.add("P-02");
    }
  }
}

/** Prüft einen Text. null = abgelehnt (Codes in `codes`). */
function textPruefen(text, erlaubt, codes) {
  if ([...text].length > AUSGABE_GRENZEN.text) { codes.add("P-08"); return null; }
  /* P7: normalisieren, unsichtbare Zeichen entfernen, dann erst prüfen. */
  const d = ohneUnsichtbare(text.normalize("NFKC"));
  if (d.trim().length === 0) { codes.add("P-08"); return null; }
  if (KLAMMER.test(d)) codes.add("P-09");
  if (TAGARTIG.test(d) || ENTITAET.test(d) || LINK.test(d) || ROLLENMARKE.test(d) || ANWEISUNG.test(d) || ZAUN.test(d) || KODIERT.test(d)
    || FREMDE_SCHRIFT.test(d)) codes.add("P-05");
  for (const m of d.matchAll(DOMAINARTIG)) {
    const t = m[0].toLowerCase();
    if (FELDNAMEN_KLEIN.has(t)) continue;
    const labels = t.split(".");
    if (/^[a-z]{2,}$/.test(labels[labels.length - 1]) && labels.some((l) => /[a-z]/.test(l))) codes.add("P-05");
  }
  if (MERKMAL.test(d)) codes.add("P-03");
  if (FREMDE_ZIFFER.test(d)) codes.add("P-02");
  if (codes.size) return null;

  /* Neutralisieren: Leerraum glätten (Tags/Trenner gibt es hier nicht mehr). */
  const sauber = fremdtextBereinigen(d);
  if (sauber.length === 0) { codes.add("P-08"); return null; }

  let rest = sauber;
  for (const m of rest.matchAll(ALIAS_KANDIDAT)) {
    if (!erlaubt.alias.has(m[0])) codes.add("P-04");
  }
  rest = rest.replace(ALIAS_KANDIDAT, " ");
  for (const m of rest.matchAll(DATUM)) if (!erlaubt.daten.has(m[0])) codes.add("P-02");
  rest = rest.replace(DATUM, " ");
  for (const m of rest.matchAll(ZEIT)) if (!erlaubt.zeiten.has(normZeit(m[0]))) codes.add("P-02");
  rest = rest.replace(ZEIT, " ");
  zahlenPruefen(rest, erlaubt, codes);
  /* Jede Zahl muss aus dem Paket stammen — auch in Verkleidung: Zahlwörter (auch zusammengesetzt und
     gebeugt), Mengen-/Bruchwörter (halb, Dutzend, Viertel, Paar, -fach), Ordnungszahlen, englische
     Zahlwörter, römische Ziffern, Brüche (1/2), Tausendertrenner (1.000 ist 1000, nicht 1), Ziffern mit
     Einheit/Exponent (1e3, 5k, 3x), Ziffern anderer Schriften und Bruch-/Hochzeichen. */
  if (zahlwoerterIn(rest) || MENGENWORT.test(rest) || ENGLISCH.test(rest) || ROEMISCH.test(rest) || ROEMISCH_EINZELN.test(rest) || BRUCH.test(rest)
    || TAUSENDER.test(rest) || ZIFFER_BUCHSTABE.test(rest) || MENGEN_ZUSAMMENSETZUNG.test(rest) || EIN_EINHEIT.test(rest) || ABKUERZUNG_MENGE.test(rest) || ORDINAL_ZIFFER.test(rest) || MAL_AN_ZIFFER.test(rest)) codes.add("P-02");
  /* Ziffer direkt hinter einem Buchstaben (m2, H2O, V2): nur als Teil einer Kennung des Pakets zulässig. */
  let ohneKennungen = rest;
  for (const k of erlaubt.kennungen) if (/\d/.test(k)) ohneKennungen = ohneKennungen.split(k).join(" ");
  if (/\p{L}\d/u.test(ohneKennungen)) codes.add("P-02");
  for (const re of [BEZEICHNER_CAMEL, BEZEICHNER_UNTERSTRICH]) {
    for (const m of rest.matchAll(re)) {
      if (!erlaubt.kennungen.has(m[0]) && !FELDNAMEN.includes(m[0]) && !istAlias(m[0])) codes.add("P-02");
    }
  }
  if (codes.size) return null;
  return { text: sauber, neutralisiert: sauber !== text };
}

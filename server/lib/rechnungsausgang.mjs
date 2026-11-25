/* ==========================================================================
   RECHNUNGSAUSGANG — Serverregel für `rechnungen` (MODINERT-L4, Audit
   Modul-inert 2026-11-24, Lücke L-4; Betreiberentscheidung G9: serverseitige
   und unveränderliche Abrechnung, kein Auto-Pilot, keine Auto-Buchung)

   Bis November 2026 übernahm der Betreiber-PUT das Feld `rechnungen` ganz aus
   der Übermittlung (rechte.mjs, BETREIBER_FELDER). Ein alter oder manipulierter
   Client konnte damit:
     - eine Paketposition berechnen, obwohl das Paket nicht buchbar ist (G9),
     - gespeicherte Rechnungen ändern, löschen, umordnen oder „bezahlt“ setzen,
     - Rechnungen rückdatieren, Beträge als Text oder negativ schreiben,
     - beliebig große oder tief verschachtelte Einträge ablegen.

   Diese Regel gilt jetzt beim Schreiben (PUT /api/bestand des Betreibers und
   POST /api/bestand-anlegen):
     1. Gespeicherte Einträge sind unveränderlich. Jeder gespeicherte Eintrag muss
        unverändert mitkommen, sonst 422 RECHNUNG_UNVERAENDERLICH. Die Felder, die
        der Server setzt (SERVERFELDER), zählen beim Vergleich nicht — es gilt immer
        der gespeicherte Wert. Die Reihenfolge bestimmt der Server: neue Einträge
        vorn, dahinter die gespeicherten in gespeicherter Reihenfolge.
     2. Neue Einträge prüft ein festes Schema: nur bekannte Felder, Typen,
        Wertebereiche, Längen, Größe. Unbekannte Felder (auch „__proto__“,
        „status“, „bezahlt“) sind 422.
     3. Der Server setzt bei neuen Einträgen: `lfd` (fortlaufend, lückenlos),
        `erstellt` (Zeitpunkt), `datum` (Servertag) und `faellig` (Servertag plus
        Zahlungsziel). Mitgeschickte `lfd`/`erstellt` sind 422.
     4. Paketpositionen (G9): eine Position mit `paketId` nur für ein buchbares
        Paket (Zustand 5), mit Abrechnungsgrund und ohne Pilot im Monat. Eine
        Position „Branchenpaket …“ ohne `paketId` ist 422. Heute ist kein Paket
        buchbar, also wird jede Paketposition abgewiesen.
     5. Storno nur als neue Gegenbuchung (`art: "storno"`, `bezug` = Nummer einer
        Rechnung, Beträge genau negativ). Ein Status an einer Rechnung existiert nicht.

   Alteinträge, die das Schema nicht erfüllen (Testdaten vor dieser Regel), bleiben
   unverändert speicherbar; sie werden weder geprüft noch normalisiert.

   Fehlerantworten nennen Code, Grund und Feldpfad, nie einen Wert aus dem Eintrag
   (kein Orakel, keine Personendaten). Rein, ohne Ablage und ohne Uhr: `heute` und
   `jetzt` kommen vom Aufrufer.
   ========================================================================== */
import { addDays } from "./schutzpruefung.mjs";
import { tagGueltig, paketBekannt, paketBuchbar, abrechnungsGrund, pilotImZeitraum, PAKET_FREIGABEN } from "./paketstand.mjs";
import { BRANCHENMODULE } from "./branchenmodule.mjs";
import { PAKETE_ROH } from "./paketliste.mjs";

export const RECHNUNG_CODE = Object.freeze({
  FORM: "RECHNUNG_FORM",
  UNVERAENDERLICH: "RECHNUNG_UNVERAENDERLICH",
  SERVERFELD: "RECHNUNG_SERVERFELD",
  PAKET: "RECHNUNG_PAKET",
  STORNO: "RECHNUNG_STORNO",
});

export const RECHNUNG_GRENZEN = Object.freeze({
  neuJeVorgang: 1000,     // neue Einträge je Schreibvorgang (Rechnungslauf über alle Betriebe)
  gesamt: 100000,         // Einträge im Rechnungsausgang
  bytes: 16384,           // JSON-Länge eines Eintrags
  positionen: 60,
  text: 300,              // Positionstext, Betriebsname
  kurz: 60,               // Menge, Einzel, Betrag, Zeitraum, Rabatttext, Tarif
  anschrift: 1000,
  betrag: 10000000,       // Betrag in Euro (Betrag, nicht Cent)
  zahl: 1000000,          // Standorte, Personen
  zahlungsziel: 365,
});

/** Felder, die nur der Server setzt; beim Vergleich gespeicherter Einträge zählen sie nicht. */
export const SERVERFELDER = Object.freeze(["lfd", "erstellt", "datum", "faellig"]);

const RECHNUNG_FELDER = new Set(["nummer", "art", "bezug", "datum", "faellig", "zeitraum", "monat", "mandantId", "mandant",
  "anschrift", "betreiber", "positionen", "netto", "rabattBetrag", "rabattText", "steuersatz", "steuer", "brutto",
  "standorte", "personen", "tarif"]);
const BETREIBER_FELDER = new Set(["firma", "anschrift", "ustId", "iban", "steuersatz", "zahlungsziel"]);
const POSITION_FELDER = new Set(["text", "menge", "einzel", "betrag", "paketId", "frei"]);
const NUMMER = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
const MONAT = /^(\d{4})-(\d{2})$/;
/* Steuerzeichen außer Zeilenumbruch und Tabulator: kein Text auf einer Rechnung braucht sie. */
const STEUERZEICHEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/; // eslint-disable-line no-control-regex

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const schlicht = (x) => istObjekt(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const zahl = (x) => typeof x === "number" && Number.isFinite(x);
const text = (x, max, leerOk = true) => typeof x === "string" && x.length <= max && (leerOk || x.trim() !== "") && !STEUERZEICHEN.test(x);
const fehler = (code, grund, feld) => ({ code, grund, feld });

/** JSON mit sortierten Schlüsseln (undefined zählt nicht) — „unverändert“ heißt inhaltsgleich. */
function stabil(x) {
  if (Array.isArray(x)) return `[${x.map((e) => (e === undefined ? "null" : stabil(e))).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
  return JSON.stringify(x) ?? "undefined";
}
/** Der Vergleichsschlüssel eines Eintrags: ohne die Serverfelder. */
function vergleich(x) {
  if (!istObjekt(x)) return stabil(x);
  const ohne = { ...x };
  for (const f of SERVERFELDER) delete ohne[f];
  return stabil(ohne);
}

/** Tage zwischen zwei gültigen Tagen (b − a), ohne Uhr. */
function tageZwischen(a, b) {
  const t = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86400000);
}

/** Ist das ein Betrag in Euro mit höchstens zwei Nachkommastellen (Rundungsrest erlaubt)? */
const betrag = (x) => zahl(x) && Math.abs(x) <= RECHNUNG_GRENZEN.betrag && Math.abs(Math.round(x * 100) - x * 100) < 1e-6;
const ganz = (x, max) => Number.isInteger(x) && x >= 0 && x <= max;
const fast = (a, b) => Math.abs(a - b) < 0.011;

/** Unbekannte Schlüssel eines Objekts (eigene Schlüssel, auch „__proto__“ aus JSON). */
const unbekannt = (o, erlaubt) => Object.keys(o).find((k) => !erlaubt.has(k));

function betreiberFehler(b, feld) {
  if (!schlicht(b)) return fehler(RECHNUNG_CODE.FORM, "Die Betreiberangaben sind kein Objekt.", feld);
  const u = unbekannt(b, BETREIBER_FELDER);
  if (u !== undefined) return fehler(RECHNUNG_CODE.FORM, "Die Betreiberangaben enthalten ein unbekanntes Feld.", feld);
  for (const k of ["firma", "ustId", "iban"])
    if (b[k] !== undefined && !text(b[k], RECHNUNG_GRENZEN.text)) return fehler(RECHNUNG_CODE.FORM, "Eine Betreiberangabe ist kein gültiger Text.", `${feld}.${k}`);
  if (b.anschrift !== undefined && !text(b.anschrift, RECHNUNG_GRENZEN.anschrift))
    return fehler(RECHNUNG_CODE.FORM, "Eine Betreiberangabe ist kein gültiger Text.", `${feld}.anschrift`);
  if (b.steuersatz !== undefined && b.steuersatz !== null && !(zahl(b.steuersatz) && b.steuersatz >= 0 && b.steuersatz <= 100))
    return fehler(RECHNUNG_CODE.FORM, "Der Steuersatz liegt außerhalb von 0 bis 100.", `${feld}.steuersatz`);
  if (b.zahlungsziel !== undefined && b.zahlungsziel !== null && !ganz(b.zahlungsziel, RECHNUNG_GRENZEN.zahlungsziel))
    return fehler(RECHNUNG_CODE.FORM, "Das Zahlungsziel liegt außerhalb von 0 bis 365 Tagen.", `${feld}.zahlungsziel`);
  return null;
}

function positionFehler(p, feld) {
  if (!schlicht(p)) return fehler(RECHNUNG_CODE.FORM, "Eine Position ist kein Objekt.", feld);
  if (unbekannt(p, POSITION_FELDER) !== undefined) return fehler(RECHNUNG_CODE.FORM, "Eine Position enthält ein unbekanntes Feld.", feld);
  if (!text(p.text, RECHNUNG_GRENZEN.text, false)) return fehler(RECHNUNG_CODE.FORM, "Der Positionstext fehlt oder ist zu lang.", `${feld}.text`);
  for (const k of ["menge", "einzel", "betrag"])
    if (p[k] !== undefined && !text(p[k], RECHNUNG_GRENZEN.kurz)) return fehler(RECHNUNG_CODE.FORM, "Eine Positionsangabe ist kein gültiger Text.", `${feld}.${k}`);
  if (p.frei !== undefined && (p.frei !== true || p.paketId === undefined))
    return fehler(RECHNUNG_CODE.FORM, "Nur eine Paketposition kann als enthalten markiert sein.", `${feld}.frei`);
  if (p.paketId !== undefined && !paketBekannt(p.paketId))
    return fehler(RECHNUNG_CODE.PAKET, "Die Position nennt kein bekanntes Paket.", `${feld}.paketId`);
  return null;
}

/** Schema eines neuen Eintrags (ohne Bezug auf andere Einträge). */
function schemaFehler(r, feld, heute) {
  if (!schlicht(r)) return fehler(RECHNUNG_CODE.FORM, "Eine Rechnung ist kein Objekt.", feld);
  if (r.lfd !== undefined || r.erstellt !== undefined)
    return fehler(RECHNUNG_CODE.SERVERFELD, "Laufende Nummer und Erstellungszeit setzt der Server.", feld);
  if (unbekannt(r, RECHNUNG_FELDER) !== undefined)
    return fehler(RECHNUNG_CODE.FORM, "Die Rechnung enthält ein unbekanntes Feld.", feld);
  if (stabil(r).length > RECHNUNG_GRENZEN.bytes) return fehler(RECHNUNG_CODE.FORM, "Die Rechnung ist zu groß.", feld);
  if (typeof r.nummer !== "string" || !NUMMER.test(r.nummer))
    return fehler(RECHNUNG_CODE.FORM, "Die Rechnungsnummer fehlt oder hat keine gültige Form.", `${feld}.nummer`);
  const art = r.art === undefined ? "rechnung" : r.art;
  if (art !== "rechnung" && art !== "storno") return fehler(RECHNUNG_CODE.FORM, "Die Art ist weder Rechnung noch Storno.", `${feld}.art`);
  if (art === "rechnung" && r.bezug !== undefined) return fehler(RECHNUNG_CODE.FORM, "Nur ein Storno hat einen Bezug.", `${feld}.bezug`);
  if (art === "storno" && (typeof r.bezug !== "string" || !NUMMER.test(r.bezug)))
    return fehler(RECHNUNG_CODE.STORNO, "Ein Storno braucht die Nummer der stornierten Rechnung.", `${feld}.bezug`);
  for (const k of ["datum", "faellig"])
    if (r[k] !== undefined && !tagGueltig(r[k])) return fehler(RECHNUNG_CODE.FORM, "Ein Tag hat keine gültige Form.", `${feld}.${k}`);
  if (r.monat !== undefined) {
    const mm = MONAT.exec(typeof r.monat === "string" ? r.monat : "");
    if (!mm || !tagGueltig(`${r.monat}-01`) || r.monat > heute.slice(0, 7))
      return fehler(RECHNUNG_CODE.FORM, "Der Monat ist kein gültiger Monat bis heute.", `${feld}.monat`);
  }
  if (typeof r.mandantId !== "string" || r.mandantId === "" || r.mandantId.length > RECHNUNG_GRENZEN.kurz)
    return fehler(RECHNUNG_CODE.FORM, "Der Betrieb der Rechnung fehlt.", `${feld}.mandantId`);
  if (r.mandant !== undefined && !text(r.mandant, RECHNUNG_GRENZEN.text)) return fehler(RECHNUNG_CODE.FORM, "Der Betriebsname ist kein gültiger Text.", `${feld}.mandant`);
  if (r.anschrift !== undefined && r.anschrift !== null && !text(r.anschrift, RECHNUNG_GRENZEN.anschrift))
    return fehler(RECHNUNG_CODE.FORM, "Die Anschrift ist kein gültiger Text.", `${feld}.anschrift`);
  for (const k of ["zeitraum", "rabattText", "tarif"])
    if (r[k] !== undefined && !text(r[k], RECHNUNG_GRENZEN.kurz)) return fehler(RECHNUNG_CODE.FORM, "Eine Angabe ist kein gültiger Text.", `${feld}.${k}`);
  if (r.betreiber !== undefined) { const f = betreiberFehler(r.betreiber, `${feld}.betreiber`); if (f) return f; }
  if (!Array.isArray(r.positionen) || r.positionen.length > RECHNUNG_GRENZEN.positionen)
    return fehler(RECHNUNG_CODE.FORM, "Die Positionen fehlen oder sind zu viele.", `${feld}.positionen`);
  for (let j = 0; j < r.positionen.length; j++) {
    const f = positionFehler(r.positionen[j], `${feld}.positionen[${j}]`);
    if (f) return f;
  }
  for (const k of ["netto", "steuer", "brutto"])
    if (!betrag(r[k])) return fehler(RECHNUNG_CODE.FORM, "Ein Betrag ist keine Zahl in Euro mit höchstens zwei Nachkommastellen.", `${feld}.${k}`);
  if (r.rabattBetrag !== undefined && !(betrag(r.rabattBetrag) && r.rabattBetrag >= 0))
    return fehler(RECHNUNG_CODE.FORM, "Der Rabattbetrag ist ungültig.", `${feld}.rabattBetrag`);
  const vorzeichenFalsch = art === "rechnung" ? ["netto", "steuer", "brutto"].some((k) => r[k] < 0) : ["netto", "steuer", "brutto"].some((k) => r[k] > 0);
  if (vorzeichenFalsch)
    return fehler(RECHNUNG_CODE.FORM, art === "rechnung" ? "Eine Rechnung hat keine negativen Beträge (Storno nur als Gegenbuchung)." : "Ein Storno hat keine positiven Beträge.", feld);
  if (!(zahl(r.steuersatz) && r.steuersatz >= 0 && r.steuersatz <= 100))
    return fehler(RECHNUNG_CODE.FORM, "Der Steuersatz liegt außerhalb von 0 bis 100.", `${feld}.steuersatz`);
  if (!fast(r.brutto, r.netto + r.steuer) || !fast(r.steuer, Math.round(r.netto * r.steuersatz) / 100))
    return fehler(RECHNUNG_CODE.FORM, "Netto, Steuer und Brutto passen nicht zusammen.", feld);
  for (const k of ["standorte", "personen"])
    if (r[k] !== undefined && !ganz(r[k], RECHNUNG_GRENZEN.zahl)) return fehler(RECHNUNG_CODE.FORM, "Eine Anzahl ist keine ganze Zahl im erlaubten Bereich.", `${feld}.${k}`);
  return null;
}

/** Paketpositionen (G9): nur buchbar, mit Abrechnungsgrund, ohne Pilot im Monat. */
function paketFehler(r, feld, mandant, o) {
  for (let j = 0; j < r.positionen.length; j++) {
    const p = r.positionen[j];
    const pf = `${feld}.positionen[${j}]`;
    if (p.paketId === undefined) {
      if (/branchenpaket/i.test(p.text)) return fehler(RECHNUNG_CODE.PAKET, "Eine Paketposition braucht die Paketkennung.", pf);
      continue;
    }
    if (p.paketId === "kern" || !paketBuchbar(p.paketId, o.liste, o.freigaben))
      return fehler(RECHNUNG_CODE.PAKET, "Dieses Paket ist nicht buchbar und wird nicht berechnet.", pf);
    if (r.monat === undefined) return fehler(RECHNUNG_CODE.PAKET, "Eine Paketposition braucht den Monat der Rechnung.", `${feld}.monat`);
    const stichtag = `${r.monat}-01`;
    if (pilotImZeitraum(mandant, stichtag)) return fehler(RECHNUNG_CODE.PAKET, "Im Pilotzeitraum wird kein Paket berechnet.", pf);
    if (p.frei === true) continue;   // in der Stufe enthalten: buchbar und ohne Pilot genügt, kein Preis
    const preis = (o.pakete.find((x) => x.id === p.paketId) || {}).aufpreis;
    if (!abrechnungsGrund(mandant, p.paketId, stichtag, preis))
      return fehler(RECHNUNG_CODE.PAKET, "Für dieses Paket liegt kein Abrechnungsgrund vor.", pf);
  }
  return null;
}

/**
 * Altform (Testdaten vor dieser Regel, etwa { nr, betrag }): ein Objekt ohne `nummer` und ohne `positionen`. Es trägt
 * keine Position und damit kein Paket. POST /api/bestand-anlegen übernimmt solche Einträge unverändert wie
 * gespeicherte (Rückwärtskompatibilität der Prüfstände); alles andere gilt als neue Rechnung.
 */
export const rechnungAltform = (x) => istObjekt(x) && !Object.hasOwn(x, "nummer") && !Object.hasOwn(x, "positionen");

/**
 * Prüft und ordnet `rechnungen` beim Schreiben.
 * @param {any} neu      die übermittelte Liste (nach der Rechtezusammenführung)
 * @param {any} alt      die gespeicherte Liste (fehlend: leer)
 * @param {{ mandanten?: any[], heute: string, jetzt: string, liste?: any[], freigaben?: any, pakete?: any[] }} o
 * @returns {{ fehler: { code: string, grund: string, feld: string } } | { rechnungen: any[], neu: number, lfdVon: number|null, lfdBis: number|null, geaendert: boolean }}
 */
export function rechnungenPruefen(neu, alt, o) {
  const opt = { liste: BRANCHENMODULE, freigaben: PAKET_FREIGABEN, pakete: PAKETE_ROH, mandanten: [], ...o };
  const gespeichert = Array.isArray(alt) ? alt : [];
  if (neu === undefined) return { rechnungen: gespeichert, neu: 0, lfdVon: null, lfdBis: null, geaendert: false };
  if (!Array.isArray(neu)) return { fehler: fehler(RECHNUNG_CODE.FORM, "Rechnungen sind keine Liste.", "rechnungen") };
  if (neu.length > gespeichert.length + RECHNUNG_GRENZEN.neuJeVorgang || neu.length > RECHNUNG_GRENZEN.gesamt)
    return { fehler: fehler(RECHNUNG_CODE.FORM, "Zu viele Rechnungen in einem Schreibvorgang.", "rechnungen") };

  /* 1. Jeder gespeicherte Eintrag kommt unverändert mit (Mehrfachmenge; Serverfelder zählen nicht). */
  const offen = new Map();
  neu.forEach((x, i) => { const k = vergleich(x); if (!offen.has(k)) offen.set(k, []); offen.get(k).push(i); });
  const vorhanden = new Set();
  for (let i = 0; i < gespeichert.length; i++) {
    const treffer = offen.get(vergleich(gespeichert[i]));
    if (!treffer || !treffer.length)
      return { fehler: fehler(RECHNUNG_CODE.UNVERAENDERLICH, "Eine gespeicherte Rechnung fehlt oder wurde geändert. Rechnungen werden nicht geändert oder gelöscht; ein Storno ist eine neue Gegenbuchung.", `rechnungen[${i}]`) };
    vorhanden.add(treffer.shift());
  }

  /* 2. Neue Einträge: Schema, Eindeutigkeit, Betrieb, Pakete, Storno. */
  const nummern = new Set(gespeichert.filter(istObjekt).map((x) => x.nummer).filter((x) => typeof x === "string"));
  const storniert = new Set(gespeichert.filter((x) => istObjekt(x) && x.art === "storno").map((x) => x.bezug));
  const nachNummer = new Map(gespeichert.filter(istObjekt).filter((x) => typeof x.nummer === "string").map((x) => [x.nummer, x]));
  const betriebe = new Map((Array.isArray(opt.mandanten) ? opt.mandanten : []).filter(istObjekt).map((m) => [m.id, m]));
  let lfd = gespeichert.reduce((a, x) => (istObjekt(x) && Number.isInteger(x.lfd) && x.lfd > a ? x.lfd : a), 0);
  const lfdVon = lfd + 1;
  const angehaengt = [];
  for (let i = 0; i < neu.length; i++) {
    if (vorhanden.has(i)) continue;
    const r = neu[i];
    const feld = `rechnungen[${i}]`;
    const sf = schemaFehler(r, feld, opt.heute);
    if (sf) return { fehler: sf };
    if (nummern.has(r.nummer)) return { fehler: fehler(RECHNUNG_CODE.UNVERAENDERLICH, "Diese Rechnungsnummer ist schon vergeben.", `${feld}.nummer`) };
    const mandant = betriebe.get(r.mandantId);
    if (!mandant) return { fehler: fehler(RECHNUNG_CODE.FORM, "Die Rechnung gehört zu keinem Betrieb dieses Raums.", `${feld}.mandantId`) };
    const pf = paketFehler(r, feld, mandant, opt);
    if (pf) return { fehler: pf };
    if (r.art === "storno") {
      const ur = nachNummer.get(r.bezug);
      if (!ur || ur.art === "storno" || storniert.has(r.bezug) || ur.mandantId !== r.mandantId
        || !["netto", "steuer", "brutto"].every((k) => zahl(ur[k]) && fast(r[k], -ur[k])))
        return { fehler: fehler(RECHNUNG_CODE.STORNO, "Ein Storno bezieht sich auf genau eine gespeicherte, nicht stornierte Rechnung desselben Betriebs und kehrt ihre Beträge genau um.", `${feld}.bezug`) };
      storniert.add(r.bezug);
    }
    nummern.add(r.nummer);
    /* 3. Serverfelder: Tag und Fälligkeit vom Server (das Zahlungsziel des Clients bleibt erhalten, 0–365 Tage). */
    const ziel = tagGueltig(r.datum) && tagGueltig(r.faellig) ? tageZwischen(r.datum, r.faellig) : 0;
    const tage = ziel >= 0 && ziel <= RECHNUNG_GRENZEN.zahlungsziel ? ziel : 0;
    lfd += 1;
    angehaengt.push({ ...r, lfd, erstellt: opt.jetzt, datum: opt.heute, faellig: addDays(opt.heute, tage) });
  }
  /* Reihenfolge vom Server: neue vorn (wie die Oberfläche sie zeigt), gespeicherte in gespeicherter Folge. */
  return { rechnungen: [...angehaengt, ...gespeichert], neu: angehaengt.length,
    lfdVon: angehaengt.length ? lfdVon : null, lfdBis: angehaengt.length ? lfd : null,
    geaendert: angehaengt.length > 0 };
}

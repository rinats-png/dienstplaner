/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { ISTDATEN_TEXT } from "../istdaten.js";
import { imDienst } from "../../server/lib/fachpruefung.mjs";
import { addDays, dow, between } from "../regelwerk.js";
import { heute } from "./datum.js";
import { n1, n1Ist } from "./format.js";
import { abwesenheitAm, personTag, stundenkonto } from "./fachlogik.js";


/* ==========================================================================
   ERMÜDUNG

   Die Ruhezeitprüfung sieht immer nur zwei Dienste. Was sich über zwei
   Wochen aufbaut, sieht sie nicht: Sieben Nachtdienste in zehn Tagen
   erfüllen jede Einzelregel und sind trotzdem gefährlich.

   Eine Untersuchung an 4.573 Rettungsdienstschichten fand, dass gut die
   Hälfte auf sechs oder weniger Stunden Schlaf folgte — als Folge von
   Planung, die kumulierte Belastung nicht betrachtet.

   Bewusst keine Sperre, sondern eine Warnstufe. Wer sperrt, wo das Gesetz
   es nicht verlangt, erzeugt Umgehungen — und dann steht die Belastung
   nirgends mehr.
   ========================================================================== */

export const ERMUEDUNG_STUFEN = {
  normal: { label: "unauffällig", ton: null, ab: 0,
    text: "Die Belastung liegt im üblichen Rahmen." },
  erhoeht: { label: "erhöht", ton: "warn", ab: 45,
    text: "Auffällig, aber vertretbar. Bei der nächsten Planung berücksichtigen." },
  hoch: { label: "hoch", ton: "danger", ab: 70,
    text: "Deutlich über dem Üblichen. Vor weiteren Einsätzen ansprechen." },
};

/** Was in die Bewertung eingeht — offen benannt, damit sie nachprüfbar bleibt. */
export const ERMUEDUNG_GEWICHTE = {
  nachtanteil: 30,        // Anteil Nachtdienste an allen Diensten
  serie: 25,              // längste Serie ohne freien Tag
  wechsel: 20,            // Wechsel zwischen Schichtlagen
  wochenende: 10,         // Anteil belegter Wochenenden
  ueberstunden: 15,       // Stundenkonto über der Ausgleichsgrenze
};

/** In welcher Lage liegt ein Dienst? Für die Zählung der Wechsel. */
export function schichtlage(da) {
  if (!da) return null;
  const beginn = Number(String(da.start).slice(0, 2)) * 60
    + Number(String(da.start).slice(3, 5));
  if (da.ende <= da.start || beginn >= 1140 || beginn < 300) return "nacht";
  if (beginn < 660) return "frueh";
  return "spaet";
}

/**
 * Ermüdungsbild einer Person über einen Zeitraum.
 * Gibt nicht nur eine Zahl zurück, sondern die einzelnen Ursachen — eine
 * Kennzahl ohne Herleitung ändert kein Verhalten.
 */
export function ermuedung(m, personId, tage) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return null;
  const n = tage || 28;
  const bis = heute();
  const von = addDays(bis, -(n - 1));

  const dienste = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    if (!imDienst(p, d)) continue;
    if (abwesenheitAm(m, p.id, d)) { dienste.push({ datum: d, frei: true, abwesend: true }); continue; }
    const t = personTag(m, p, d);
    const da = t && t.dienstId ? m.dienstarten.find((x) => x.id === t.dienstId) : null;
    dienste.push({ datum: d, frei: !da, da, lage: schichtlage(da) });
  }
  const gearbeitet = dienste.filter((x) => !x.frei);
  if (!gearbeitet.length) return { stufe: "normal", punkte: 0, gruende: [],
    dienste: 0, tage: n, nachtanteil: 0, serie: 0, wechsel: 0 };

  /* Nachtanteil */
  const naechte = gearbeitet.filter((x) => x.lage === "nacht").length;
  const nachtanteil = naechte / gearbeitet.length;

  /* Längste Serie ohne freien Tag */
  let serie = 0, lauf = 0;
  for (const x of dienste) {
    if (x.frei) { serie = Math.max(serie, lauf); lauf = 0; }
    else lauf++;
  }
  serie = Math.max(serie, lauf);

  /* Wechsel zwischen Schichtlagen — der Vorwärtswechsel Früh→Spät→Nacht
     ist verträglicher als der Rückwärtswechsel. Gezählt wird nur der
     Rückwärtswechsel, weil er die Erholung stärker stört. */
  const folge = { frueh: 0, spaet: 1, nacht: 2 };
  let wechsel = 0, letzte = null;
  for (const x of gearbeitet) {
    if (x.lage && letzte && x.lage !== letzte
      && folge[x.lage] < folge[letzte]) wechsel++;
    if (x.lage) letzte = x.lage;
  }

  /* Wochenenden */
  const we = gearbeitet.filter((x) => [5, 6].includes(dow(x.datum))).length;
  const weGesamt = dienste.filter((x) => [5, 6].includes(dow(x.datum))).length;
  const weAnteil = weGesamt ? we / weGesamt : 0;

  /* Stundenkonto über der Grenze */
  const konto = stundenkonto(m, p, bis.slice(0, 7));
  const grenze = m.einstellungen.ausgleichsgrenze || 40;
  /* Ohne Ist-Daten bleibt das Konto unberücksichtigt — und das wird gesagt. */
  const ueber = konto === null ? 0 : Math.max(0, konto) / grenze;

  const G = ERMUEDUNG_GEWICHTE;
  const gruende = [];
  let punkte = 0;

  /* Ab 40 % Nachtanteil wird es auffällig — darunter ist es normale
     Wechselschicht. */
  if (nachtanteil > 0.4) {
    const w = Math.min(1, (nachtanteil - 0.4) / 0.4) * G.nachtanteil;
    punkte += w;
    gruende.push({ was: "Hoher Nachtanteil",
      wert: `${Math.round(nachtanteil * 100)} % der Dienste`, punkte: Math.round(w) });
  }
  const maxFolge = m.einstellungen.maxFolge || 6;
  if (serie > maxFolge) {
    const w = Math.min(1, (serie - maxFolge) / 4) * G.serie;
    punkte += w;
    gruende.push({ was: "Lange Dienstserie",
      wert: `${serie} Tage ohne frei`, punkte: Math.round(w) });
  }
  if (wechsel > 2) {
    const w = Math.min(1, (wechsel - 2) / 5) * G.wechsel;
    punkte += w;
    gruende.push({ was: "Häufiger Rückwärtswechsel",
      wert: `${wechsel} Mal von später auf früher`, punkte: Math.round(w) });
  }
  if (weAnteil > 0.6) {
    const w = Math.min(1, (weAnteil - 0.6) / 0.4) * G.wochenende;
    punkte += w;
    gruende.push({ was: "Viele Wochenenden",
      wert: `${Math.round(weAnteil * 100)} % belegt`, punkte: Math.round(w) });
  }
  if (ueber > 0.5) {
    const w = Math.min(1, (ueber - 0.5) / 0.5) * G.ueberstunden;
    punkte += w;
    gruende.push({ was: "Stundenkonto im Plus",
      wert: `${n1(konto)} Stunden`, punkte: Math.round(w) });
  }
  if (konto === null) gruende.push({ was: "Stundenkonto nicht berücksichtigt", wert: ISTDATEN_TEXT, punkte: 0 });

  punkte = Math.round(punkte);
  const stufe = punkte >= ERMUEDUNG_STUFEN.hoch.ab ? "hoch"
    : punkte >= ERMUEDUNG_STUFEN.erhoeht.ab ? "erhoeht" : "normal";

  return { stufe, punkte, gruende: gruende.sort((a, b) => b.punkte - a.punkte),
    dienste: gearbeitet.length, tage: n,
    nachtanteil: Math.round(nachtanteil * 100), serie, wechsel,
    wochenendanteil: Math.round(weAnteil * 100), konto: n1Ist(konto) };
}

/** Wer im Betrieb ist auffällig? Für die Übersicht der Planung. */
export function ermuedungsBild(m, tage) {
  return m.personen
    .filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false)
    .map((p) => ({ person: p, e: ermuedung(m, p.id, tage) }))
    .filter((x) => x.e)
    .sort((a, b) => b.e.punkte - a.e.punkte);
}

/* ==========================================================================
   REIHENFOLGE NACH DIENSTALTER
   Wo eine Betriebsvereinbarung es vorschreibt, entscheidet nicht die
   Eignung, sondern die Zugehörigkeit. Beides ist vertretbar — aber der
   Betrieb muss wählen können, und die Wahl muss sichtbar sein.
   ========================================================================== */

export const REIHENFOLGE_ARTEN = {
  eignung: { label: "Nach Eignung",
    text: "Stundenkonto, Auslastung, Wünsche und wie oft jemand zuletzt eingesprungen ist." },
  dienstalter: { label: "Nach Dienstalter",
    text: "Wer länger im Betrieb ist, wird zuerst gefragt. Üblich bei Betriebsvereinbarungen." },
  gemischt: { label: "Gemischt",
    text: "Dienstalter entscheidet, Eignung bricht Gleichstand." },
};

/** Dienstalter in Tagen. */
export const dienstalter = (p) => p.eintritt ? Math.max(0, between(p.eintritt, heute())) : 0;

/**
 * Ordnet Kandidaten nach der eingestellten Art.
 * Die Begründung wird mitgegeben — auch bei Dienstalter soll sichtbar
 * bleiben, warum jemand oben steht.
 */
export function nachReihenfolge(m, kandidaten, datum, dienstId) {
  const art = (m.einstellungen || {}).reihenfolge || "eignung";
  if (art === "eignung") return kandidaten;
  const mit = kandidaten.map((k) => ({ ...k, alter: dienstalter(k.person || k) }));
  if (art === "dienstalter")
    return mit.sort((a, b) => b.alter - a.alter);
  /* Gemischt: Dienstalter in Stufen von einem Jahr, Eignung bricht Gleichstand */
  return mit.sort((a, b) => {
    const ja = Math.floor(a.alter / 365), jb = Math.floor(b.alter / 365);
    if (ja !== jb) return jb - ja;
    return (b.punkte || 0) - (a.punkte || 0);
  });
}

/* ==========================================================================
   SONDEREINSÄTZE
   Ein Einsatz außerhalb des Regelplans: Veranstaltung, Streikbegleitung,
   zusätzlicher Objektschutz. Mit eigener Kostenstelle, weil er dem
   Auftraggeber gesondert berechnet wird.
   ========================================================================== */

export function sondereinsatzStunden(m, id) {
  const s = (m.sondereinsaetze || []).find((x) => x.id === id);
  if (!s) return null;
  const je = s.ende && s.start
    ? (() => { const a = Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3));
        let b = Number(s.ende.slice(0, 2)) * 60 + Number(s.ende.slice(3));
        if (b <= a) b += 1440;
        return (b - a - (s.pause || 0)) / 60; })()
    : 0;
  const personen = (s.zugeteilt || []).length;
  return { jePerson: Math.round(je * 10) / 10, personen,
    gesamt: Math.round(je * personen * 10) / 10 };
}

/** Alle Sondereinsätze eines Zeitraums, mit Stunden. */
export function sondereinsaetze(m, von, bis) {
  return (m.sondereinsaetze || [])
    .filter((s) => s.datum >= von && s.datum <= bis)
    .map((s) => ({ ...s, stunden: sondereinsatzStunden(m, s.id) }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/* ==========================================================================
   URLAUBSVERGABE IM VERFAHREN
   Statt „wer zuerst kommt": eine Runde, in der jeder mehrere Wünsche mit
   Rangfolge angibt. Die Zuteilung geht reihum nach Dienstalter — wer im
   ersten Durchgang zum Zug kam, tritt im zweiten zurück.
   ========================================================================== */

/**
 * Teilt Urlaubswünsche zu. Deterministisch, damit dasselbe Ergebnis
 * herauskommt, wenn jemand nachrechnet.
 */
export function urlaubVerteilen(m, runde) {
  if (!runde) return { zuteilungen: [], offen: [] };
  const wuensche = (runde.wuensche || []);
  /* Beteiligte nach Dienstalter, ältester zuerst */
  const leute = [...new Set(wuensche.map((w) => w.personId))]
    .map((id) => m.personen.find((p) => p.id === id))
    .filter(Boolean)
    .sort((a, b) => dienstalter(b) - dienstalter(a));

  const zuteilungen = [];
  const offen = [];
  const belegt = {};   // Datum → Anzahl bereits Abwesender

  const passt = (von, bis) => {
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const schon = (belegt[d] || 0)
        + m.personen.filter((p) => imDienst(p, d) && abwesenheitAm(m, p.id, d)).length;
      const aktiv = m.personen.filter((p) => imDienst(p, d)
        && p.imSchichtdienst !== false).length;
      /* Höchstens ein Drittel gleichzeitig abwesend — sonst kippt die Woche */
      if (schon + 1 > Math.max(1, Math.floor(aktiv * (runde.hoechstanteil || 0.33))))
        return false;
    }
    return true;
  };

  /* Mehrere Durchgänge: Im ersten bekommt jeder seinen Erstwunsch, sofern
     möglich. Danach kommen die Zweitwünsche derer, die leer ausgingen. */
  const vergeben = new Set();
  for (let rang = 1; rang <= 3; rang++) {
    for (const p of leute) {
      if (vergeben.has(p.id)) continue;
      const w = wuensche.find((x) => x.personId === p.id && x.rang === rang);
      if (!w) continue;
      if (passt(w.von, w.bis)) {
        for (let d = w.von; d <= w.bis; d = addDays(d, 1))
          belegt[d] = (belegt[d] || 0) + 1;
        zuteilungen.push({ personId: p.id, von: w.von, bis: w.bis, rang,
          tage: between(w.von, w.bis) + 1 });
        vergeben.add(p.id);
      }
    }
  }
  for (const p of leute) if (!vergeben.has(p.id))
    offen.push({ personId: p.id,
      wuensche: wuensche.filter((x) => x.personId === p.id) });

  return { zuteilungen, offen,
    beteiligt: leute.length, zugeteilt: zuteilungen.length,
    erstwunsch: zuteilungen.filter((z) => z.rang === 1).length };
}

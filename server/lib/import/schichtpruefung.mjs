/* ==========================================================================
   IMP-6 — Schichtmodelle: Analyse und arbeitszeitrechtliche Prüfung (rein)

   Keine eigene Regel. Geprüft wird mit der bestehenden Planprüfung
   (server/lib/engine/befunde.mjs `pruefen`) und den Einstellungen und
   Dienstarten DES BETRIEBS: Ruhezeit (§ 5 ArbZG, mit Zeitumstellung),
   Dienste in Folge, Nachtdienste in Folge, Pause, Tagesgrenze, Ersatzruhetag,
   freie Sonntage, Schutzvorschriften und Einsatzeinschränkungen der Person.
   Dazu wird eine Prüfkopie gebaut, in der die ausgerollten Schichten als
   Einteilungen stehen; der Bestand bleibt unverändert.

   Zwei Ebenen:
   - Modell: jedes prüfbare Modell mit einer neutralen Prüfperson (volljährig,
     ohne Einschränkungen) über zwei volle Zyklen ab `von`. Das findet
     Verstöße im Modell selbst, auch über das Zyklusende hinweg.
   - Zuordnung: jede zugeordnete Person mit ihren eigenen Merkmalen über den
     Zeitraum `von` … `bis`. Vor dem Beginn gilt der bestehende Plan.

   Verstöße werden als Befund gemeldet (Konfliktmodell: Vorgabe „klären"),
   nie still verworfen und nie automatisch „repariert".

   Konservative Festlegungen (ohne Betreiberentscheidung, dokumentiert in
   docs/acc45/IMP-6-NACHWEIS.md):
   - Fehlt dem Betrieb eine Grenze (ruhezeit, maxFolge, maxNachtFolge), gilt
     der Grundwert eines neuen Betriebs (11 h, 6, 4) und ein Hinweis — ohne
     Grenze prüfte die Planprüfung sonst still nichts.
   - Abwesenheiten, erfasste Ist-Zeiten und eingefrorene Monate der
     zugeordneten Personen bleiben in der Prüfkopie außen vor: geprüft wird
     das Modell, nicht die Abwesenheitslage (eine Abwesenheit würde einen
     Verstoß des Modells verdecken).
   - „Kein Alleindienst" ist eine Besetzungsfrage zwischen Personen, keine
     Arbeitszeitregel; sie wird hier nicht bewertet (die Planprüfung nach der
     Übernahme bewertet sie wie bisher).

   Ressourcengrenze (Freigabe Punkt 5: technisch begründet, keine
   Geschäftsregel): siehe SCHICHT_GRENZEN.
   ========================================================================== */

import { createHash } from "node:crypto";
import { pruefen } from "../engine/befunde.mjs";
import { addDays, between } from "../regelwerk.mjs";
import { modelleLesen, zuordnungenLesen, ausrollen, zyklusIndex, FREI } from "./schichtmodelle.mjs";

/**
 * Technische Schutzgrenze, keine Geschäftsregel.
 *
 * `pruefTage`: Summe der geprüften Personentage einer Analyse (je prüfbares Modell 2 × Zykluslänge, je zugeordnete
 * Person die Tage von `von` bis `bis`). Begründung: Die Planprüfung läuft synchron im Server-Prozess und kostet
 * gemessen etwa 70 µs je Personentag (Windows-Entwicklungsrechner, 50 Personen × 400 Tage ≈ 1,4 s). 20.000
 * Personentage halten eine Analyse bei etwa 1,5 s und damit unter dem Ziel aus IMPORT-PLAN Teil E („unter 2 s");
 * länger blockierte sie andere Anfragen. Die Grenze begrenzt weder die Zykluslänge noch die Zahl der Modelle als
 * solche: ein Modell mit 3, 10, 28 oder 365 Tagen ist gleich zulässig, solange die Rechnung in das Budget passt.
 * Beispiele: 10 Modelle à 28 Tage + 40 Personen × 366 Tage = 15.200; 1 Modell à 1.000 Tagen + 30 Personen × 92 Tage
 * = 4.760. Darüber: Fehler `PRUEFUMFANG_ZU_GROSS`, kein Teilergebnis — Zeitraum oder Datei teilen.
 */
export const SCHICHT_GRENZEN = Object.freeze({ pruefTage: 20000 });

/** Befundarten der Planprüfung, die das Arbeitszeitrecht und den Schutz der Person betreffen. */
export const ARBEITSZEIT_ARTEN = Object.freeze(["ruhezeit", "folge", "nachtfolge", "pause", "tagesgrenze", "ersatzruhe",
  "sonntagsfrei", "schutz", "einschraenkung", "istdaten"]);

/** Grundwerte eines neuen Betriebs (server/lib/leerbetrieb.mjs), nur wenn der Betrieb keinen Wert hat. */
const GRUNDWERTE = Object.freeze({ ruhezeit: 11, maxFolge: 6, maxNachtFolge: 4 });
/** Vorlauf der Planprüfung (befunde.mjs: Folgen ab von − 10, Ersatzruhetag ± 56 Tage). */
const VORLAUF = 56;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const gueltigesDatum = (s) => typeof s === "string" && ISO.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Grenzen übernehmen: nur bekannte Schlüssel mit positiver ganzer Zahl; alles andere bleibt Standard. */
export function grenzenAus(roh) {
  const g = { ...SCHICHT_GRENZEN };
  if (roh && typeof roh === "object") for (const k of Object.keys(SCHICHT_GRENZEN))
    if (Number.isInteger(roh[k]) && roh[k] > 0) g[k] = roh[k];
  return g;
}

function einstellungenAus(mandant, hinweise) {
  const e = { ...((mandant && mandant.einstellungen) || {}) };
  for (const [k, v] of Object.entries(GRUNDWERTE))
    if (!(typeof e[k] === "number" && Number.isFinite(e[k]) && e[k] > 0)) { e[k] = v; hinweise.push({ art: "grundwert-verwendet", feld: k, wert: v }); }
  return e;
}

/** Dienstarten für die Prüfkopie: Kopien, Mindestbesetzung neutral (Besetzung ist hier keine Frage). */
const dienstartenKopie = (l) => (Array.isArray(l) ? l : []).filter((d) => d && typeof d === "object")
  .map((d) => ({ ...structuredClone(d), mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} }));

/** Gemeinsamer Rahmen der Prüfkopie aus dem eigenen Betrieb; Personen und Einteilungen setzt der Aufrufer. */
function pruefRahmen(mandant, einstellungen) {
  return { id: mandant.id, name: mandant.name, bundesland: mandant.bundesland, land: mandant.land,
    einheiten: structuredClone(Array.isArray(mandant.einheiten) ? mandant.einheiten : []),
    standorte: structuredClone(Array.isArray(mandant.standorte) ? mandant.standorte : []),
    dienstarten: dienstartenKopie(mandant.dienstarten), qualifikationen: [], aufgaben: [], unterschreitungen: [],
    einstellungen: { ...einstellungen, pakete: [] }, personen: [], abweichungen: {}, abwesenheiten: [], erfassung: {} };
}

const befundAus = (b, extra) => ({ art: b.art, schwere: b.schwere, datum: b.datum, titel: b.titel, text: b.text, ...extra });
const befundOrdnung = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0)
  || String(a.modell ?? "").localeCompare(String(b.modell ?? "")) || String(a.personId ?? "").localeCompare(String(b.personId ?? ""))
  || a.art.localeCompare(b.art) || String(a.text).localeCompare(String(b.text));

/** Modellebene: je prüfbares Modell eine neutrale Prüfperson über zwei volle Zyklen ab `von`. */
function modellePruefen(mandant, einstellungen, modelle, von) {
  const m = pruefRahmen(mandant, einstellungen);
  const fenster = new Map();
  modelle.forEach((mo, i) => {
    if (!mo.pruefbar || !mo.laenge) return;
    const id = `modell-${i + 1}`;
    const bis = addDays(von, 2 * mo.laenge - 1);
    /* Vorlauf: ein ganzer Zyklus (mindestens 10 Tage) vor `von`, damit eine Serie über das Zyklusende zählt. */
    const ab = addDays(von, -Math.max(10, mo.laenge));
    m.personen.push({ id, vorname: "Prüfperson", nachname: `Modell ${mo.name}`, status: "aktiv", eintritt: ab,
      austritt: null, geburtstag: "1970-01-01", zugehoerigkeit: [], qualifikationen: [], einschraenkungen: {}, wochenstunden: 40 });
    for (let d = ab; d <= addDays(bis, 2); d = addDays(d, 1)) {
      const t = mo.tage[zyklusIndex(mo.laenge, von, 0, d)];
      m.abweichungen[`${id}|${d}`] = t === null ? FREI : t;
    }
    fenster.set(id, { modell: mo.name, bis });
  });
  const aus = new Map(modelle.map((mo) => [mo.name, []]));
  if (!fenster.size) return aus;
  const bisMax = [...fenster.values()].reduce((x, f) => (f.bis > x ? f.bis : x), von);
  for (const b of pruefen(m, von, bisMax)) {
    if (!ARBEITSZEIT_ARTEN.includes(b.art)) continue;
    const f = fenster.get(String(b.personId));
    if (!f || b.datum > f.bis) continue;
    aus.get(f.modell).push(befundAus(b, { quelle: "modell", modell: f.modell, personId: null,
      zyklusTag: zyklusIndex(modelle.find((x) => x.name === f.modell).laenge, von, 0, b.datum) + 1 }));
  }
  for (const l of aus.values()) l.sort(befundOrdnung);
  return aus;
}

/**
 * Schichtmodelle analysieren: Modelle lesen, Zuordnungen lesen, ausrollen und mit der bestehenden Planprüfung prüfen.
 * Rein und deterministisch: dieselbe Eingabe ergibt dasselbe Ergebnis (auch denselben `hash`).
 * @param {{ mandant: any, modellZeilen: any[][], zuordnungZeilen?: any[][]|null, modellSpalten?: any, zuordnungSpalten?: any,
 *   von: string, bis: string, grenzen?: any }} e
 */
export function schichtmodelleAnalysieren({ mandant, modellZeilen, zuordnungZeilen = null, modellSpalten, zuordnungSpalten, von, bis, grenzen }) {
  if (!mandant || typeof mandant !== "object") return { ok: false, code: "BETRIEB_FEHLT", nachricht: "Kein Betrieb angegeben." };
  if (!gueltigesDatum(von) || !gueltigesDatum(bis) || von > bis)
    return { ok: false, code: "ZEITRAUM_UNGUELTIG", nachricht: "Der Prüfzeitraum ist ungültig." };
  const g = grenzenAus(grenzen);
  const hinweise = [];
  const einstellungen = einstellungenAus(mandant, hinweise);
  const ml = modelleLesen({ zeilen: modellZeilen, zuordnung: modellSpalten, dienstarten: mandant.dienstarten });
  if (!ml.ok) return ml;
  const personen = (Array.isArray(mandant.personen) ? mandant.personen : []).filter((p) => p && typeof p === "object");
  const zl = zuordnungZeilen ? zuordnungenLesen({ zeilen: zuordnungZeilen, zuordnung: zuordnungSpalten, personen, modelle: ml.modelle })
    : { ok: true, spalten: [], zuordnung: {}, fehlendePflicht: [], datensaetze: [], zaehler: { gesamt: 0, fehlerhaft: 0, konflikte: 0 } };
  if (!zl.ok) return zl;

  /* Nur fehler- und konfliktfreie Zuordnungen werden ausgerollt und geprüft. */
  const nutzbar = zl.datensaetze.filter((d) => !d.fehler.length && !d.konflikte.length);
  const nachPerson = new Map();
  for (const d of nutzbar) nachPerson.set(d.personId, [...(nachPerson.get(d.personId) || []), d]);
  for (const l of nachPerson.values()) l.sort((a, b) => (a.werte.beginn < b.werte.beginn ? -1 : 1));
  const zeitraumTage = between(von, bis) + 1;
  const kosten = ml.modelle.reduce((s, mo) => s + (mo.pruefbar ? 2 * mo.laenge : 0), 0) + nachPerson.size * zeitraumTage;
  if (kosten > g.pruefTage)
    return { ok: false, code: "PRUEFUMFANG_ZU_GROSS", grenze: "pruefTage", wert: kosten, hoechstens: g.pruefTage,
      nachricht: "Die Prüfung wäre zu umfangreich. Bitte den Zeitraum verkürzen oder die Datei teilen." };

  /* --- Modellebene --- */
  const modellBefunde = modellePruefen(mandant, einstellungen, ml.modelle, von);

  /* --- Zuordnungsebene: Prüfkopie mit den zugeordneten Personen --- */
  const nachModell = new Map(ml.modelle.map((mo) => [mo.name, mo]));
  const m = pruefRahmen(mandant, einstellungen);
  m.zyklus = structuredClone(mandant.zyklus ?? null);
  m.anker = mandant.anker;
  const schichten = [];
  const zuordnungBefunde = new Map();
  const ab = addDays(von, -VORLAUF), bisRand = addDays(bis, VORLAUF);
  const abw = mandant.abweichungen && typeof mandant.abweichungen === "object" ? mandant.abweichungen : {};
  for (const [personId, liste] of [...nachPerson.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const p0 = personen.find((p) => String(p.id) === personId);
    const p = structuredClone(p0);
    if (p.einschraenkungen && typeof p.einschraenkungen === "object") delete p.einschraenkungen.keinAlleindienst;
    m.personen.push(p);
    /* Vor dem ersten Beginn gilt der bestehende Plan (Schichtfolge und Abweichungen des Bestands). */
    for (let d = ab; d <= bisRand && d < liste[0].werte.beginn; d = addDays(d, 1)) {
      const k = `${personId}|${d}`;
      if (Object.prototype.hasOwnProperty.call(abw, k)) m.abweichungen[k] = abw[k];
    }
    liste.forEach((z, i) => {
      const mo = nachModell.get(z.werte.modell);
      const ende = liste[i + 1] ? liste[i + 1].werte.beginn : null;
      for (const s of ausrollen({ modell: mo, beginn: z.werte.beginn, versatz: z.werte.versatz, von: ab, bis: bisRand, ende,
        dienstarten: mandant.dienstarten })) {
        m.abweichungen[`${personId}|${s.datum}`] = s.dienstId === null ? FREI : s.dienstId;
        if (s.datum >= von && s.datum <= bis) schichten.push({ personId, modell: mo.name, datensatz: z.datensatz, ...s });
      }
      zuordnungBefunde.set(z.datensatz, []);
    });
  }
  if (m.personen.length) {
    const zuDatensatz = (personId, datum) => {
      const l = nachPerson.get(personId) || [];
      let treffer = null;
      for (const z of l) if (z.werte.beginn <= datum) treffer = z;
      return treffer;
    };
    for (const b of pruefen(m, von, bis)) {
      if (!ARBEITSZEIT_ARTEN.includes(b.art) || b.personId === undefined) continue;
      const z = zuDatensatz(String(b.personId), b.datum);
      /* Befunde vor dem ersten Beginn betreffen den bestehenden Plan, nicht den Import; sie hängen am ersten Datensatz,
         damit nichts verloren geht, und sind als solche gekennzeichnet. */
      const ziel = z || nachPerson.get(String(b.personId))[0];
      zuordnungBefunde.get(ziel.datensatz).push(befundAus(b, { quelle: z ? "zuordnung" : "bestand", modell: ziel.werte.modell,
        personId: String(b.personId), datensatz: ziel.datensatz }));
    }
  }
  for (const l of zuordnungBefunde.values()) l.sort(befundOrdnung);

  /* Tage außerhalb des Beschäftigungsverhältnisses werden nicht still verworfen, sondern gezählt. */
  for (const d of nutzbar) {
    const p = personen.find((x) => String(x.id) === d.personId);
    const eigene = schichten.filter((s) => s.datensatz === d.datensatz && s.dienstId !== null);
    const aussen = eigene.filter((s) => (p.eintritt === null || p.eintritt === "" || (p.eintritt && s.datum < p.eintritt)
      || (p.austritt && s.datum > p.austritt) || p.status === "gesperrt")).length;
    if (aussen) d.hinweise.push({ art: "ausserhalb-beschaeftigung", anzahl: aussen });
    if (aussen && aussen === eigene.length) d.konflikte.push({ art: "person-nicht-im-dienst" });
    const bf = zuordnungBefunde.get(d.datensatz) || [];
    d.befunde = bf;
    if (d.konflikte.length) { d.erlaubt = ["ueberspringen", "klaeren"]; d.vorgabe = "klaeren"; }
    else if (bf.length) { d.erlaubt = ["uebernehmen", "ueberspringen", "klaeren"]; d.vorgabe = "klaeren"; }
  }
  for (const d of zl.datensaetze) if (!d.befunde) d.befunde = [];

  const modelle = ml.modelle.map((mo) => ({ ...mo, befunde: modellBefunde.get(mo.name) || [] }));
  schichten.sort((a, b) => a.personId.localeCompare(b.personId) || (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const befunde = [...modelle.flatMap((mo) => mo.befunde), ...zl.datensaetze.flatMap((d) => d.befunde)].sort(befundOrdnung);
  const zaehler = { modelle: modelle.length, modellePruefbar: modelle.filter((x) => x.pruefbar).length,
    modelleMitKonflikt: modelle.filter((x) => !x.pruefbar).length,
    zuordnungen: zl.datensaetze.length, zuordnungenNutzbar: zl.datensaetze.filter((d) => d.vorgabe === "uebernehmen").length,
    zuordnungenKlaeren: zl.datensaetze.filter((d) => d.vorgabe === "klaeren").length,
    befunde: befunde.length, schichten: schichten.filter((s) => s.dienstId !== null).length, pruefTage: kosten };
  const ergebnis = { ok: true, zeitraum: { von, bis }, hinweise,
    modellTabelle: { spalten: ml.spalten, zuordnung: ml.zuordnung, fehlendePflicht: ml.fehlendePflicht, datensaetze: ml.datensaetze },
    zuordnungTabelle: { spalten: zl.spalten, zuordnung: zl.zuordnung, fehlendePflicht: zl.fehlendePflicht, datensaetze: zl.datensaetze },
    modelle, schichten, befunde, zaehler };
  return { ...ergebnis, hash: createHash("sha256").update(JSON.stringify(ergebnis)).digest("hex") };
}

/* ==========================================================================
   MODUL FUNKTIONSDIENST — Funktionsbereiche mit eigener Besetzung (WP-19, Strang B)

   Nach der Entscheidungsmatrix (vorläufig bis zur Nutzerentscheidung):
     F1 a  Funktionsbereiche (OP, Anästhesie, Endoskopie …) mit eigener
           Sollbesetzung je Dienstart und verlangten Qualifikationen.
           Tagesaufgaben bleiben in der bestehenden Aufgabenfunktion.
     F2 a  Fehlende Besetzung oder Qualifikation ist ein Hinweis, nie eine
           Sperre. Verbindlich wird nur eine geprüfte, versionierte Regel
           (Regelregister, Stufe nach Nutzerentscheidung).

   Betriebsfelder: `funktionsbereiche` (Sachfeld, Liste mit id) und
   `funktionsPlan` (Personenfeld, Form „personId|Tag“ → Bereichs-Kennung).
   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

export const FUNKTION_GRENZEN = Object.freeze({ bereiche: 100, sollMax: 99, planEintraege: 200_000, tageSpanne: 731, qualifikationen: 50, textMax: 120, idMax: 60 });

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w.filter(istObjekt) : []);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const echterTag = (s) => { if (!TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
const imFenster = (s, jetzt = Date.now()) => Math.abs(new Date(`${s}T12:00:00Z`).getTime() - jetzt) <= FUNKTION_GRENZEN.tageSpanne * 86400000 + 43200000;
const idOk = (s) => typeof s === "string" && s.length >= 1 && s.length <= FUNKTION_GRENZEN.idMax;

/**
 * Prüft die Funktionsbereiche. Leer oder fehlend ist in Ordnung.
 * @param {any} bereiche
 * @returns {string | null}
 */
export function pruefeFunktionsbereiche(bereiche) {
  if (bereiche === undefined || bereiche === null) return null;
  if (!Array.isArray(bereiche)) return "Funktionsbereiche: erwartet wird eine Liste.";
  if (bereiche.length > FUNKTION_GRENZEN.bereiche) return `Funktionsbereiche: höchstens ${FUNKTION_GRENZEN.bereiche}.`;
  const ids = new Set();
  for (const b of bereiche) {
    if (!istObjekt(b)) return "Funktionsbereich: erwartet wird ein Datensatz.";
    const wo = `Funktionsbereich ${String(b.name || b.id || "").slice(0, 40)}`.trim();
    if (Object.keys(b).some((k) => !["id", "name", "soll", "qualifikationen"].includes(k))) return `${wo}: unbekannte Felder.`;
    if (!idOk(b.id)) return `${wo}: Kennung fehlt oder ist zu lang.`;
    if (ids.has(b.id)) return `${wo}: Kennung kommt doppelt vor.`;
    ids.add(b.id);
    if (typeof b.name !== "string" || !b.name.trim() || b.name.length > FUNKTION_GRENZEN.textMax) return `${wo}: Name fehlt oder ist zu lang.`;
    if (b.soll !== undefined && b.soll !== null) {
      if (!istObjekt(b.soll)) return `${wo}: Sollbesetzung je Dienstart erwartet.`;
      for (const [k, n] of Object.entries(b.soll))
        if (k.length > 12 || !Number.isInteger(n) || n < 0 || n > FUNKTION_GRENZEN.sollMax)
          return `${wo}: Sollbesetzung ist eine ganze Zahl von 0 bis ${FUNKTION_GRENZEN.sollMax}.`;
    }
    if (b.qualifikationen !== undefined && b.qualifikationen !== null
      && (!Array.isArray(b.qualifikationen) || b.qualifikationen.length > FUNKTION_GRENZEN.qualifikationen || b.qualifikationen.some((q) => !idOk(q))))
      return `${wo}: Qualifikationen als Liste von Kennungen erwartet.`;
  }
  return null;
}

/**
 * Prüft die Einteilung ({ "personId|Tag": bereichId }). Mit `alt` werden nur neue
 * oder geänderte Einträge streng geprüft.
 * @param {any} plan
 * @param {any} [alt]
 * @returns {string | null}
 */
export function pruefeFunktionsPlan(plan, alt) {
  if (plan === undefined || plan === null) return null;
  if (!istObjekt(plan)) return "Funktionsplan: erwartet wird { \"Person|Tag\": Bereich }.";
  const schluessel = Object.keys(plan);
  if (schluessel.length > FUNKTION_GRENZEN.planEintraege) return `Funktionsplan: höchstens ${FUNKTION_GRENZEN.planEintraege} Einträge.`;
  const vorher = istObjekt(alt) ? alt : {};
  for (const k of schluessel) {
    if (hat(vorher, k) && vorher[k] === plan[k]) continue;
    const i = k.lastIndexOf("|");
    if (i < 1 || i > FUNKTION_GRENZEN.idMax || !echterTag(k.slice(i + 1))) return "Funktionsplan: Schlüssel haben die Form „Person|JJJJ-MM-TT“.";
    if (!imFenster(k.slice(i + 1))) return "Funktionsplan: der Tag liegt mehr als zwei Jahre von heute entfernt.";
    if (!idOk(plan[k])) return "Funktionsplan: der Bereich ist eine Kennung.";
  }
  return null;
}

/** Alle Funktionsbereiche eines Betriebs nach Kennung. @param {any} m */
export function funktionsIndex(m) {
  return new Map(liste(m && m.funktionsbereiche).map((b) => [b.id, b]));
}

const bereichDerPerson = (m, pid, d) => (istObjekt(m && m.funktionsPlan) ? m.funktionsPlan[`${pid}|${d}`] : undefined);

/**
 * Soll und Ist je Funktionsbereich für einen Dienst an einem Tag. Nur Bereiche
 * mit Soll in diesem Dienst. Ist: wer im Dienst ist und dem Bereich zugeteilt ist.
 * Ist die Dienstzeit unbekannt (`personenImDienst` null), heißt die Zeile „ungeklärt“.
 * @param {any} m
 * @param {string} datum
 * @param {string} dienstId
 * @param {any[] | null} personenImDienst
 */
export function funktionsLage(m, datum, dienstId, personenImDienst) {
  const aus = [];
  for (const b of liste(m && m.funktionsbereiche)) {
    const soll = b.soll && Number.isInteger(b.soll[dienstId]) ? b.soll[dienstId] : 0;
    if (soll <= 0) continue;
    if (personenImDienst === null || personenImDienst === undefined) { aus.push({ bereich: b.id, name: b.name, soll, ist: null, fehlt: null, status: "ungeklaert" }); continue; }
    const ist = liste(personenImDienst).filter((x) => bereichDerPerson(m, x.id, datum) === b.id).map((x) => x.id);
    aus.push({ bereich: b.id, name: b.name, soll, ist, fehlt: Math.max(0, soll - ist.length), status: "ok" });
  }
  return aus;
}

const regelNach = (id) => {
  const r = REGELN_BRANCHEN.find((x) => x.id === id);
  if (!r) throw new Error(`${id} fehlt im Branchenkatalog.`);
  return r;
};

/**
 * Befunde zur Einteilung einer Person auf einen Funktionsbereich: Unterbesetzung
 * und fehlende Qualifikation (F2 a: nur Hinweise). Inaktives Modul → keine.
 * @param {any} m
 * @param {{ id: any }} da Dienstart
 * @param {string} d Tag
 * @param {any} person
 * @param {any[]} personen alle im Dienst
 * @param {{ auswerten: (r: any, k: any) => any, qualGueltig: (m: any, p: any, qid: string, heute: string) => boolean, heute: string, module?: readonly any[] }} o
 */
export function funktionsBefunde(m, da, d, person, personen, { auswerten, qualGueltig, heute, module = BRANCHENMODULE }) {
  if (!person || !da || !modulAktiv(m, "funktionsdienst", module)) return [];
  const bid = bereichDerPerson(m, person.id, d);
  const b = bid ? funktionsIndex(m).get(bid) : null;
  if (!b) return [];
  const soll = b.soll && Number.isInteger(b.soll[da.id]) ? b.soll[da.id] : 0;
  if (soll <= 0) return [];
  if (typeof auswerten !== "function" || typeof qualGueltig !== "function") throw new Error("funktionsBefunde: Auswertung oder Qualifikationsprüfung fehlt.");
  const wo = `Funktionsbereich ${b.name}`;
  const aus = [];

  const ist = liste(personen).filter((x) => bereichDerPerson(m, x.id, d) === bid);
  if (!ist.some((x) => x.id === person.id)) ist.push(person);
  const rb = { ...regelNach("FUNKTION-BESETZUNG-01"), parameter: { anforderungen: [{ art: "anzahl", min: soll }] } };
  const eb = auswerten(rb, { personen: ist.map((x) => ({ id: x.id })), datum: d });
  if (eb.status === "verletzt") {
    const f = alsEinteilungsBefund(rb, { ...eb, text: `${wo}: ${ist.length} von ${soll} besetzt` });
    if (f) aus.push(f);
  }

  const quals = Array.isArray(b.qualifikationen) ? b.qualifikationen : [];
  for (const qid of quals) {
    const q = liste(m.qualifikationen).find((x) => x.id === qid);
    const rq = { ...regelNach("FUNKTION-QUAL-01"), bezeichnung: `Qualifikation für ${wo}`,
      parameter: { anforderungen: [{ art: "anzahlMit", merkmal: `qual:${qid}`, min: 1 }] } };
    if (!q) {
      const f = alsEinteilungsBefund(rq, { zustand: "offen", text: `${wo}: Qualifikation „${String(qid).slice(0, 30)}" ist nicht bekannt — nicht bewertbar` });
      if (f) aus.push(f);
      continue;
    }
    const merkmale = qualGueltig(m, person, qid, heute) ? [`qual:${qid}`] : [];
    const eq = auswerten(rq, { personen: [{ id: person.id, merkmale }], datum: d });
    if (eq.status === "verletzt") {
      const f = alsEinteilungsBefund(rq, { ...eq, text: `${q.name} fehlt oder ist abgelaufen — verlangt für ${wo}` });
      if (f) aus.push(f);
    }
  }
  return aus;
}

/**
 * Schreibweg: prüft Bereiche und Einteilung. Mit `altM` nur Geändertes streng.
 * @param {any} neuM
 * @param {any} [altM]
 * @returns {{ grund?: string }}
 */
export function funktionsZusammen(neuM, altM) {
  if (!neuM || typeof neuM !== "object") return {};
  if (!(altM && gleich(neuM.funktionsbereiche, altM.funktionsbereiche))) {
    const f = pruefeFunktionsbereiche(neuM.funktionsbereiche);
    if (f) return { grund: f };
  }
  const f2 = pruefeFunktionsPlan(neuM.funktionsPlan, altM && altM.funktionsPlan);
  if (f2) return { grund: f2 };
  /* Verweise: der Bereich gehört zum Betrieb, die Person ebenso (nur neue oder geänderte Einträge). */
  if (istObjekt(neuM.funktionsPlan)) {
    const bereiche = new Set((Array.isArray(neuM.funktionsbereiche) ? neuM.funktionsbereiche : []).filter(istObjekt).map((b) => b.id));
    const personen = Array.isArray(neuM.personen) ? new Set(neuM.personen.filter(istObjekt).map((p) => String(p.id))) : null;
    const vorher = istObjekt(altM && altM.funktionsPlan) ? altM.funktionsPlan : {};
    for (const [k, v] of Object.entries(neuM.funktionsPlan)) {
      if (hat(vorher, k) && vorher[k] === v) continue;
      if (!bereiche.has(v)) return { grund: "Funktionsplan: der Bereich ist unbekannt." };
      if (personen && !personen.has(k.slice(0, k.lastIndexOf("|")))) return { grund: "Funktionsplan: die Person gehört nicht zum Betrieb." };
    }
  }
  return {};
}

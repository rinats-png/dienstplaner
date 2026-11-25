/* ==========================================================================
   MODUL POSTEN — Objektbezogene Posten (WP-19, Strang A, Datenmodell)

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung):
     P1 a  Eigener Datensatz Objekt → Posten (Betriebsfeld `objekte`),
           optional mit Standortbezug. Je Posten die Sollbesetzung je
           Dienstart und die verlangten Qualifikationen.
     P2 a  Einteilung auf Posten je Tag als eigene Ebene (Betriebsfeld
           `postenPlan`, Schlüssel „personId|Tag" → Posten). Die
           Posten-Dienstarten des Bestands (posten:true/quelle) bleiben
           unverändert (G10 a).
     P3 a  Fehlende Qualifikation und Unterbesetzung eines Postens sind ein
           Hinweis (vorläufige Registerregeln POSTEN-QUAL-01 und
           POSTEN-BESETZUNG-01), nie eine Sperre. Ob die Sachkunde nach
           § 34a GewO für einen Posten verlangt ist, entscheidet der Betrieb
           mit der Qualifikation, die er dem Posten zuweist.

   Beide Datenfelder stehen im Positivkatalog (server/lib/sicht.mjs).
   Befunde nur bei aktivem Modul. Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

export const POSTEN_GRENZEN = Object.freeze({ objekte: 500, postenJeObjekt: 100, planEintraege: 200_000, tageSpanne: 731, sollMax: 99, textMax: 120, idMax: 60 });

/** Felder eines Postens. `alleinarbeit` (P4) und der Verweis auf die Gefährdungsbeurteilung sind Sachangaben, keine Personendaten. */
const POSTEN_FELDER = Object.freeze(["id", "name", "soll", "qualifikationen", "alleinarbeit", "gefaehrdungsbeurteilung"]);

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w.filter((x) => x && typeof x === "object") : []);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const echterTag = (s) => { if (!TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
/** Liegt der Tag im plausiblen Bereich (zwei Jahre vor und nach heute)? */
const imFenster = (s, jetzt = Date.now()) => Math.abs(new Date(`${s}T12:00:00Z`).getTime() - jetzt) <= POSTEN_GRENZEN.tageSpanne * 86400000 + 43200000;
const idOk = (s) => typeof s === "string" && s.length >= 1 && s.length <= POSTEN_GRENZEN.idMax;

/**
 * Prüft die Objekte samt Posten. Leer oder fehlend ist in Ordnung.
 * @param {any} objekte
 * @returns {string | null}
 */
export function pruefeObjekte(objekte) {
  if (objekte === undefined || objekte === null) return null;
  if (!Array.isArray(objekte)) return "Objekte: erwartet wird eine Liste.";
  if (objekte.length > POSTEN_GRENZEN.objekte) return `Objekte: höchstens ${POSTEN_GRENZEN.objekte}.`;
  const ids = new Set();
  const neu = (id, wo) => { if (ids.has(id)) return `${wo}: Kennung „${String(id).slice(0, 30)}" kommt doppelt vor.`; ids.add(id); return null; };
  for (const o of objekte) {
    if (!istObjekt(o)) return "Objekt: erwartet wird ein Datensatz.";
    const wo = `Objekt ${String(o.name || o.id || "").slice(0, 40)}`.trim();
    if (Object.keys(o).some((k) => !["id", "name", "standortId", "posten"].includes(k))) return `${wo}: unbekannte Felder.`;
    if (!idOk(o.id)) return `${wo}: Kennung fehlt oder ist zu lang.`;
    if (typeof o.name !== "string" || !o.name.trim() || o.name.length > POSTEN_GRENZEN.textMax) return `${wo}: Name fehlt oder ist zu lang.`;
    if (o.standortId !== undefined && o.standortId !== null && !idOk(o.standortId)) return `${wo}: Standort ungültig.`;
    const d = neu(o.id, wo); if (d) return d;
    if (!Array.isArray(o.posten)) return `${wo}: Posten als Liste erwartet.`;
    if (o.posten.length > POSTEN_GRENZEN.postenJeObjekt) return `${wo}: höchstens ${POSTEN_GRENZEN.postenJeObjekt} Posten.`;
    for (const p of o.posten) {
      if (!istObjekt(p)) return `${wo}: Posten erwartet einen Datensatz.`;
      const pw = `${wo}, Posten ${String(p.name || p.id || "").slice(0, 40)}`;
      if (Object.keys(p).some((k) => !POSTEN_FELDER.includes(k))) return `${pw}: unbekannte Felder.`;
      if (p.alleinarbeit !== undefined && typeof p.alleinarbeit !== "boolean") return `${pw}: Alleinarbeit ist ja oder nein.`;
      if (p.gefaehrdungsbeurteilung !== undefined
        && (typeof p.gefaehrdungsbeurteilung !== "string" || p.gefaehrdungsbeurteilung.length > POSTEN_GRENZEN.textMax))
        return `${pw}: Verweis auf die Gefährdungsbeurteilung ist ein Text mit höchstens ${POSTEN_GRENZEN.textMax} Zeichen.`;
      if (!idOk(p.id)) return `${pw}: Kennung fehlt oder ist zu lang.`;
      if (typeof p.name !== "string" || !p.name.trim() || p.name.length > POSTEN_GRENZEN.textMax) return `${pw}: Name fehlt oder ist zu lang.`;
      const dp = neu(p.id, pw); if (dp) return dp;
      if (p.soll !== undefined && p.soll !== null) {
        if (!istObjekt(p.soll)) return `${pw}: Sollbesetzung je Dienstart erwartet.`;
        for (const [k, n] of Object.entries(p.soll))
          if (k.length > 12 || !Number.isInteger(n) || n < 0 || n > POSTEN_GRENZEN.sollMax)
            return `${pw}: Sollbesetzung ist eine ganze Zahl von 0 bis ${POSTEN_GRENZEN.sollMax}.`;
      }
      if (p.qualifikationen !== undefined && p.qualifikationen !== null
        && (!Array.isArray(p.qualifikationen) || p.qualifikationen.length > 50 || p.qualifikationen.some((q) => !idOk(q))))
        return `${pw}: Qualifikationen als Liste von Kennungen erwartet.`;
    }
  }
  return null;
}

/**
 * Prüft die Einteilung auf Posten ({ "personId|Tag": postenId }). Mit `alt`
 * werden nur neue oder geänderte Einträge streng geprüft (Altbestand blockiert nicht).
 * @param {any} plan
 * @param {any} [alt]
 * @param {Set<string> | null} [bekannt] Kennungen der Posten des Betriebs: neue oder geänderte Einträge müssen darauf zeigen
 * @returns {string | null}
 */
export function pruefePostenPlan(plan, alt, bekannt = null) {
  if (plan === undefined || plan === null) return null;
  if (!istObjekt(plan)) return "Postenplan: erwartet wird { \"Person|Tag\": Posten }.";
  const schluessel = Object.keys(plan);
  if (schluessel.length > POSTEN_GRENZEN.planEintraege) return `Postenplan: höchstens ${POSTEN_GRENZEN.planEintraege} Einträge.`;
  const vorher = istObjekt(alt) ? alt : {};
  for (const k of schluessel) {
    if (hat(vorher, k) && vorher[k] === plan[k]) continue;
    const i = k.lastIndexOf("|");
    if (i < 1 || i > POSTEN_GRENZEN.idMax || !echterTag(k.slice(i + 1))) return "Postenplan: Schlüssel haben die Form „Person|JJJJ-MM-TT“.";
    if (!imFenster(k.slice(i + 1))) return "Postenplan: der Tag liegt mehr als zwei Jahre von heute entfernt.";
    if (!idOk(plan[k])) return "Postenplan: der Posten ist eine Kennung.";
    if (bekannt && !bekannt.has(plan[k])) return `Postenplan: den Posten „${String(plan[k]).slice(0, 30)}“ gibt es im Betrieb nicht.`;
  }
  return null;
}

/** Alle Posten eines Betriebs nach Kennung. @param {any} m @returns {Map<string, { objekt: any, posten: any }>} */
export function postenIndex(m) {
  const ix = new Map();
  for (const o of liste(m && m.objekte)) for (const p of liste(o.posten)) ix.set(p.id, { objekt: o, posten: p });
  return ix;
}

const postenDerPerson = (m, pid, d) => (istObjekt(m && m.postenPlan) ? m.postenPlan[`${pid}|${d}`] : undefined);

/**
 * Soll und Ist je Posten für einen Dienst an einem Tag. Nur Posten mit Soll
 * in diesem Dienst; Ist zählt, wer im Dienst ist und auf den Posten
 * eingeteilt wurde.
 * @param {any} m
 * @param {string} datum
 * @param {string} dienstId
 * @param {any[]} personenImDienst
 */
export function postenLage(m, datum, dienstId, personenImDienst) {
  const aus = [];
  /* Aufwandsbudget: ein Durchlauf über die Personen (statt je Posten ein Durchlauf), Reihenfolge der Personen bleibt. */
  const nachPosten = new Map();
  for (const x of liste(personenImDienst)) {
    const pid = postenDerPerson(m, x.id, datum);
    if (pid === undefined) continue;
    const l = nachPosten.get(pid);
    if (l) l.push(x.id); else nachPosten.set(pid, [x.id]);
  }
  for (const o of liste(m && m.objekte)) for (const p of liste(o.posten)) {
    const soll = p.soll && Number.isInteger(p.soll[dienstId]) ? p.soll[dienstId] : 0;
    if (soll <= 0) continue;
    const ist = nachPosten.get(p.id) || [];
    aus.push({ posten: p.id, name: p.name, objekt: o.name, soll, ist, fehlt: Math.max(0, soll - ist.length), alleinarbeitHinweis: alleinarbeitHinweis(p, ist.length) });
  }
  return aus;
}

/**
 * P4: Hinweis bei Einzelbesetzung eines Alleinarbeitspostens. Er verweist auf die Gefährdungsbeurteilung des Betriebs;
 * er nennt keine Person und sagt nichts über technische Schutzmittel zu (keine Pauschalbehauptung).
 * @param {any} posten
 * @param {number} anzahl Personen, die auf dem Posten eingeteilt sind
 * @returns {string | null}
 */
export function alleinarbeitHinweis(posten, anzahl) {
  if (!posten || posten.alleinarbeit !== true || anzahl !== 1) return null;
  const ref = typeof posten.gefaehrdungsbeurteilung === "string" && posten.gefaehrdungsbeurteilung.trim()
    ? ` (Verweis: ${posten.gefaehrdungsbeurteilung.trim().slice(0, POSTEN_GRENZEN.textMax)})` : "";
  return `Alleinarbeit: eine Person allein auf dem Posten. Schutzanforderungen laut Gefährdungsbeurteilung des Betriebs prüfen${ref}.`;
}

const regelNach = (id) => {
  const r = REGELN_BRANCHEN.find((x) => x.id === id);
  if (!r) throw new Error(`${id} fehlt im Branchenkatalog.`);
  return r;
};

/**
 * Befunde zur Einteilung einer Person auf einen Posten: Unterbesetzung des
 * Postens und fehlende Qualifikation der Person. Inaktives Modul → keine.
 * @param {any} m
 * @param {{ id: any }} da Dienstart
 * @param {string} d Tag
 * @param {any} person die geprüfte Person
 * @param {any[]} personen alle im Dienst (mit der geprüften)
 * @param {{ auswerten: (r: any, k: any) => any, qualGueltig: (m: any, p: any, qid: string, heute: string) => boolean, heute: string, module?: readonly any[] }} o
 */
export function postenBefunde(m, da, d, person, personen, { auswerten, qualGueltig, heute, module = BRANCHENMODULE }) {
  if (!person || !da || !modulAktiv(m, "posten", module)) return [];
  const pid = postenDerPerson(m, person.id, d);
  const eintrag = pid ? postenIndex(m).get(pid) : null;
  if (!eintrag) return [];
  const soll = eintrag.posten.soll && Number.isInteger(eintrag.posten.soll[da.id]) ? eintrag.posten.soll[da.id] : 0;
  if (soll <= 0) return [];
  if (typeof auswerten !== "function" || typeof qualGueltig !== "function") throw new Error("postenBefunde: Auswertung oder Qualifikationsprüfung fehlt.");
  const wo = `Posten ${eintrag.posten.name} (${eintrag.objekt.name})`;
  const aus = [];

  const ist = liste(personen).filter((x) => postenDerPerson(m, x.id, d) === pid);
  if (!ist.some((x) => x.id === person.id)) ist.push(person);
  const rb = { ...regelNach("POSTEN-BESETZUNG-01"), parameter: { anforderungen: [{ art: "anzahl", min: soll }] } };
  const eb = auswerten(rb, { personen: ist.map((x) => ({ id: x.id })), datum: d });
  if (eb.status === "verletzt") {
    const b = alsEinteilungsBefund(rb, { ...eb, text: `${wo}: ${ist.length} von ${soll} besetzt` });
    if (b) aus.push(b);
  }

  const quals = Array.isArray(eintrag.posten.qualifikationen) ? eintrag.posten.qualifikationen : [];
  for (const qid of quals) {
    const q = liste(m.qualifikationen).find((x) => x.id === qid);
    const rq = { ...regelNach("POSTEN-QUAL-01"), bezeichnung: `Qualifikation für ${wo}`,
      parameter: { anforderungen: [{ art: "anzahlMit", merkmal: `qual:${qid}`, min: 1 }] } };
    if (!q) {
      const b = alsEinteilungsBefund(rq, { zustand: "offen", text: `${wo}: Qualifikation „${String(qid).slice(0, 30)}" ist nicht bekannt — nicht bewertbar` });
      if (b) aus.push(b);
      continue;
    }
    const merkmale = qualGueltig(m, person, qid, heute) ? [`qual:${qid}`] : [];
    const eq = auswerten(rq, { personen: [{ id: person.id, merkmale }], datum: d });
    if (eq.status === "verletzt") {
      const b = alsEinteilungsBefund(rq, { ...eq, text: `${q.name} fehlt oder ist abgelaufen — verlangt für ${wo}` });
      if (b) aus.push(b);
    }
  }
  return aus;
}

/**
 * Schreibweg: prüft Objekte und Postenplan. Mit `altM` nur Geändertes streng
 * (ein alter fehlerhafter Eintrag blockiert nicht den ganzen Betrieb).
 * @param {any} neuM
 * @param {any} [altM]
 * @param {{ bekannt?: boolean }} [o] bekannt: false auf dem Ausnahmeweg Art. 16/17 (dort prüft das Wertschema der Berichtigung, F6)
 * @returns {{ grund?: string }}
 */
export function postenZusammen(neuM, altM, { bekannt = true } = {}) {
  if (!neuM || typeof neuM !== "object") return {};
  if (!(altM && gleich(neuM.objekte, altM.objekte))) {
    const f = pruefeObjekte(neuM.objekte);
    if (f) return { grund: f };
  }
  /* Neue oder geänderte Einteilungen müssen auf einen Posten der (neuen) Objekte zeigen; Altbestand blockiert nicht. */
  const f2 = pruefePostenPlan(neuM.postenPlan, altM && altM.postenPlan, bekannt ? new Set(postenIndex(neuM).keys()) : null);
  if (f2) return { grund: f2 };
  /* Ein Posten, der aus den Objekten verschwindet, darf keine Einteilung zurücklassen (verwaiste Einteilung). */
  if (bekannt && altM && istObjekt(neuM.postenPlan)) {
    const jetzt = postenIndex(neuM);
    const entfernt = [...postenIndex(altM).keys()].filter((id) => !jetzt.has(id));
    if (entfernt.length) {
      const weg = new Set(entfernt);
      if (Object.values(neuM.postenPlan).some((v) => weg.has(v))) return { grund: "Postenplan: ein entfernter Posten hat noch Einteilungen — erst die Einteilungen lösen." };
    }
  }
  return {};
}

/* ---- Pflege: reine Funktionen für die Oberfläche (nichts wird verändert, Ergebnis wird vom Server noch einmal geprüft) ---- */

/** Nächste freie Kennung „<präfix><n>“. */
const freieId = (belegt, praefix) => { let n = belegt.size + 1; while (belegt.has(`${praefix}${n}`)) n += 1; return `${praefix}${n}`; };
const alleIds = (objekte) => new Set(liste(objekte).flatMap((o) => [o.id, ...liste(o.posten).map((p) => p.id)]));
const einteilungenAuf = (m, postenIds) => (istObjekt(m && m.postenPlan) ? Object.values(m.postenPlan).filter((v) => postenIds.has(v)).length : 0);

/** @param {any[]} objekte @param {string} name */
export function objektHinzufuegen(objekte, name) {
  const alt = liste(objekte);
  return [...alt, { id: freieId(alleIds(alt), "o"), name: String(name || "").trim() || "Neues Objekt", posten: [] }];
}
/** @param {any[]} objekte @param {string} objektId @param {string} name */
export function postenHinzufuegen(objekte, objektId, name) {
  const alt = liste(objekte);
  if (!alt.some((o) => o.id === objektId)) return objekte;
  const id = freieId(alleIds(alt), "p");
  return alt.map((o) => (o.id === objektId ? { ...o, posten: [...liste(o.posten), { id, name: String(name || "").trim() || "Neuer Posten", soll: {}, qualifikationen: [] }] } : o));
}
/** Nur diese Felder eines Postens sind änderbar; die Kennung nie. */
const AENDERBAR = Object.freeze(["name", "soll", "qualifikationen", "alleinarbeit", "gefaehrdungsbeurteilung"]);
/** @param {any[]} objekte @param {string} objektId @param {string} postenId @param {Record<string, any>} patch */
export function postenAendern(objekte, objektId, postenId, patch) {
  const nimm = Object.fromEntries(AENDERBAR.filter((k) => istObjekt(patch) && hat(patch, k)).map((k) => [k, patch[k]]));
  return liste(objekte).map((o) => (o.id !== objektId ? o : { ...o, posten: liste(o.posten).map((p) => (p.id === postenId ? { ...p, ...nimm } : p)) }));
}
/** Sollbesetzung eines Dienstes setzen; ohne Zahl entfällt der Eintrag. Ungültiges bleibt stehen (pruefeObjekte meldet es). */
export function sollSetzen(soll, dienstId, n) {
  const neu = { ...(istObjekt(soll) ? soll : {}) };
  if (n === undefined || n === null || (typeof n === "number" && Number.isNaN(n))) delete neu[dienstId];
  else neu[dienstId] = n;
  return neu;
}
/**
 * Entfernt einen Posten — nur ohne Einteilung im Postenplan (sonst bliebe der Plan ohne Posten).
 * @returns {{ objekte: any[] } | { grund: string }}
 */
export function postenEntfernen(m, postenId) {
  const eintrag = postenIndex(m).get(postenId);
  if (!eintrag) return { grund: "Posten unbekannt." };
  const n = einteilungenAuf(m, new Set([postenId]));
  if (n > 0) return { grund: `Der Posten hat noch ${n} Einteilung${n === 1 ? "" : "en"} im Postenplan — erst dort lösen.` };
  return { objekte: liste(m.objekte).map((o) => ({ ...o, posten: liste(o.posten).filter((p) => p.id !== postenId) })) };
}
/** Entfernt ein Objekt samt Posten — nur, wenn keiner seiner Posten eingeteilt ist. */
export function objektEntfernen(m, objektId) {
  const o = liste(m && m.objekte).find((x) => x.id === objektId);
  if (!o) return { grund: "Objekt unbekannt." };
  const n = einteilungenAuf(m, new Set(liste(o.posten).map((p) => p.id)));
  if (n > 0) return { grund: `Auf den Posten des Objekts gibt es noch ${n} Einteilung${n === 1 ? "" : "en"} im Postenplan — erst dort lösen.` };
  return { objekte: liste(m.objekte).filter((x) => x.id !== objektId) };
}

/**
 * Einteilung einer Person an einem Tag auf einen Posten setzen (leer: lösen). Der Server prüft dasselbe noch einmal.
 * @param {any} m
 * @param {string} personId
 * @param {string} tag
 * @param {string | null} postenId
 * @returns {{ plan: Record<string, string> } | { grund: string }}
 */
export function einteilungSetzen(m, personId, tag, postenId) {
  if (typeof personId !== "string" || !personId || personId.includes("|") || personId.length > POSTEN_GRENZEN.idMax) return { grund: "Person ungültig." };
  if (typeof tag !== "string" || !echterTag(tag)) return { grund: "Tag ungültig (JJJJ-MM-TT)." };
  const alt = istObjekt(m && m.postenPlan) ? m.postenPlan : {};
  const plan = { ...alt };
  const k = `${personId}|${tag}`;
  if (postenId === null || postenId === undefined || postenId === "") delete plan[k];
  else plan[k] = postenId;
  const fehler = pruefePostenPlan(plan, alt, new Set(postenIndex(m).keys()));
  return fehler ? { grund: fehler } : { plan };
}

/**
 * G10 a: Vorschlag aus den Posten-Dienstarten des Bestands (`posten: true`): je Ort ein Objekt, je Posten-Dienstart ein Posten.
 * Soll: Mindestwert der Dienstart (Mo–Do) für den Dienst, aus dem die Dienstart schöpft (`quelle`), sonst für sie selbst.
 * Nichts Vorhandenes wird verändert; Objekte mit gleichem Namen (ohne Groß-/Kleinschreibung) werden ergänzt, nicht doppelt
 * angelegt. Reiner Vorschlag: gespeichert wird erst, wenn die Leitung ihn übernimmt (und der Server ihn geprüft hat).
 * @param {any} m
 * @returns {{ objekte: any[], neu: number }}
 */
export function objekteAusDienstarten(m) {
  const objekte = liste(m && m.objekte).map((o) => ({ ...o, posten: [...liste(o.posten)] }));
  const belegt = alleIds(objekte);
  let neu = 0;
  const dienstarten = liste(m && m.dienstarten).filter((d) => d.posten === true && typeof d.id === "string").slice(0, POSTEN_GRENZEN.objekte * 2);
  for (const d of dienstarten) {
    const pid = `pd-${d.id}`;
    if (!idOk(pid) || belegt.has(pid)) continue;
    const ort = typeof d.ort === "string" && d.ort.trim() ? d.ort.trim().slice(0, POSTEN_GRENZEN.textMax) : "Objekt aus Dienstart";
    const name = typeof d.name === "string" && d.name.trim() ? d.name.trim().slice(0, POSTEN_GRENZEN.textMax) : d.id;
    let o = objekte.find((x) => String(x.name).toLowerCase() === ort.toLowerCase());
    if (!o) {
      if (objekte.length >= POSTEN_GRENZEN.objekte) break;
      o = { id: freieId(belegt, "o"), name: ort, posten: [] };
      belegt.add(o.id);
      objekte.push(o);
    }
    if (o.posten.length >= POSTEN_GRENZEN.postenJeObjekt) continue;
    const dienst = typeof d.quelle === "string" && d.quelle ? d.quelle : d.id;
    const mindest = d.mindest && Number.isInteger(d.mindest.mo_do) && d.mindest.mo_do >= 0 && d.mindest.mo_do <= POSTEN_GRENZEN.sollMax ? d.mindest.mo_do : null;
    const posten = { id: pid, name, qualifikationen: [] };
    if (mindest !== null && dienst.length <= 12) posten.soll = { [dienst]: mindest };
    o.posten.push(posten);
    belegt.add(pid);
    neu += 1;
  }
  return { objekte, neu };
}

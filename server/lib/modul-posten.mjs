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

   Postenwechsel innerhalb eines Dienstes (WP-19.1, Betreiberentscheidung
   2026-11-26; Invarianten W1–W13 in docs/acc45/WP19-MODULPLAN.md § 18):
   Der Wert eines Eintrags im Postenplan ist entweder eine Posten-Kennung
   (ganzer Dienst, Bestand unverändert) oder eine Liste zeitlich eindeutig
   abgegrenzter Abschnitte [{ posten }, { ab: "HH:MM", posten }, …]: der
   erste beginnt mit Dienstbeginn, jeder weitere mit `ab`, jeder endet mit
   dem nächsten `ab` bzw. dem Dienstende. Gleicher Schlüssel „Person|Tag“,
   kein neues Feld, keine Migration. Bewertet wird gegen Beginn und Ende
   der Dienstart; was sich nicht eindeutig zuordnen lässt, ist „nicht
   bewertbar“ und zählt nie als besetzt (fail-closed).

   Beide Datenfelder stehen im Positivkatalog (server/lib/sicht.mjs).
   Befunde nur bei aktivem Modul. Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

export const POSTEN_GRENZEN = Object.freeze({ objekte: 500, postenJeObjekt: 100, planEintraege: 200_000, tageSpanne: 731, sollMax: 99, textMax: 120, idMax: 60,
  /* Postenwechsel: höchstens so viele Abschnitte je Person und Tag (W13). */
  abschnitte: 8 });
/** Rollen, die einen Postenwechsel anlegen oder ändern (W3): Leitung und Planung, nicht Demo. */
export const POSTENWECHSEL_ROLLEN = Object.freeze(["leitung", "planer"]);

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
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const minuten = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const uhr = (n) => { const x = ((n % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

/**
 * Form eines Postenwechsels (ohne Prüfung, ob die Posten bekannt sind). W1: 2 bis POSTEN_GRENZEN.abschnitte Abschnitte;
 * der erste nur { posten }, jeder weitere genau { ab, posten }; Folgeabschnitt mit anderem Posten; die Zeitpunkte in
 * Dienstreihenfolge, relativ zum ersten Wechsel streng steigend innerhalb von 24 Stunden (auch über Mitternacht eindeutig).
 * @param {any} w
 * @returns {string | null}
 */
function wechselFehler(w) {
  if (!Array.isArray(w)) return "Postenplan: der Posten ist eine Kennung oder eine Liste von Abschnitten.";
  if (w.length < 2) return "Postenwechsel: mindestens zwei Abschnitte (ein Posten für den ganzen Dienst ist eine Kennung).";
  if (w.length > POSTEN_GRENZEN.abschnitte) return `Postenwechsel: höchstens ${POSTEN_GRENZEN.abschnitte} Abschnitte je Person und Tag.`;
  let erster = -1, vorher = -1;
  for (let i = 0; i < w.length; i += 1) {
    const a = w[i];
    if (!istObjekt(a)) return "Postenwechsel: jeder Abschnitt ist ein Datensatz.";
    const felder = Object.keys(a).sort().join(",");
    if (i === 0 ? felder !== "posten" : felder !== "ab,posten") return i === 0
      ? "Postenwechsel: der erste Abschnitt beginnt mit dem Dienst und hat nur einen Posten."
      : "Postenwechsel: jeder weitere Abschnitt hat genau Beginn (ab) und Posten.";
    if (!idOk(a.posten)) return "Postenwechsel: der Posten ist eine Kennung.";
    if (i > 0 && a.posten === w[i - 1].posten) return "Postenwechsel: ein Wechsel führt auf einen anderen Posten.";
    if (i === 0) continue;
    if (typeof a.ab !== "string" || !UHRZEIT.test(a.ab)) return "Postenwechsel: Beginn als Uhrzeit HH:MM.";
    const m = minuten(a.ab);
    if (erster < 0) { erster = m; vorher = 0; continue; }
    const rel = (m - erster + 1440) % 1440;
    if (rel <= vorher) return "Postenwechsel: die Wechsel stehen in zeitlicher Reihenfolge, jeder Zeitpunkt nur einmal.";
    vorher = rel;
  }
  return null;
}

/**
 * Die Abschnitte eines Eintrags: Kennung → ein Abschnitt (ab: null); gültige Liste → Kopie; sonst null (unlesbar, W5).
 * @param {any} wert
 * @returns {{ posten: string, ab: string | null }[] | null}
 */
export function postenAbschnitte(wert) {
  if (typeof wert === "string") return idOk(wert) ? [{ posten: wert, ab: null }] : null;
  if (wechselFehler(wert)) return null;
  return wert.map((a, i) => ({ posten: a.posten, ab: i === 0 ? null : a.ab }));
}

/** Alle Posten-Kennungen eines Eintrags (ohne Doppelte); unlesbar → keine. @param {any} wert @returns {string[]} */
export function postenIdsVon(wert) {
  const a = postenAbschnitte(wert);
  return a ? [...new Set(a.map((x) => x.posten))] : [];
}

/** Dienstart aus dem Betrieb (mit Zeiten), wenn `da` selbst keine trägt. */
const dienstartVon = (m, da) => {
  if (istObjekt(da) && typeof da.start === "string") return da;
  const id = istObjekt(da) ? da.id : da;
  return liste(m && m.dienstarten).find((x) => x.id === id) || null;
};

/**
 * Zeitfenster eines Dienstes in Minuten: Beginn ab Mitternacht und Dauer (bei einem geteilten Dienst bis zum Ende des
 * zweiten Abschnitts). Ohne gültige Zeiten null.
 * @param {any} da
 * @returns {{ start: number, dauer: number } | null}
 */
export function dienstFenster(da) {
  if (!istObjekt(da) || typeof da.start !== "string" || typeof da.ende !== "string" || !UHRZEIT.test(da.start) || !UHRZEIT.test(da.ende)) return null;
  const s = minuten(da.start);
  let e = minuten(da.ende); if (e <= s) e += 1440;
  const z = da.zweiterAbschnitt;
  if (istObjekt(z)) {
    if (typeof z.start !== "string" || typeof z.ende !== "string" || !UHRZEIT.test(z.start) || !UHRZEIT.test(z.ende)) return null;
    let s2 = minuten(z.start); if (s2 < s) s2 += 1440;
    let e2 = minuten(z.ende); if (e2 <= s2) e2 += 1440;
    if (s2 < e) return null;
    e = e2;
  }
  return { start: s, dauer: e - s };
}

/**
 * Zeiträume eines Eintrags im Dienst in Minuten ab Dienstbeginn (W5). Kennung: der ganze Dienst (ohne Dienstzeiten ein
 * Einheitsfenster). Wechsel: nur mit gültigem Fenster bis 24 Stunden und jedem `ab` echt innerhalb des Dienstes, in
 * Reihenfolge; sonst null (nicht bewertbar).
 * @param {any} wert
 * @param {any} da Dienstart mit start/ende
 * @returns {{ posten: string, von: number, bis: number }[] | null}
 */
export function postenZeitraeume(wert, da) {
  const a = postenAbschnitte(wert);
  if (!a) return null;
  const f = dienstFenster(da);
  if (a.length === 1) return [{ posten: a[0].posten, von: 0, bis: f ? f.dauer : 1 }];
  if (!f || f.dauer > 1440) return null;
  const aus = [];
  let von = 0;
  for (let i = 0; i < a.length; i += 1) {
    const bis = i + 1 < a.length ? (minuten(/** @type {string} */ (a[i + 1].ab)) - f.start + 1440) % 1440 : f.dauer;
    if (bis <= von || bis > f.dauer) return null;
    aus.push({ posten: a[i].posten, von, bis });
    von = bis;
  }
  return aus;
}

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
    /* Altbestand nach Wert (ein Postenwechsel ist eine Liste, also nie referenzgleich), W4. */
    if (hat(vorher, k) && (vorher[k] === plan[k] || (Array.isArray(plan[k]) && gleich(vorher[k], plan[k])))) continue;
    const i = k.lastIndexOf("|");
    if (i < 1 || i > POSTEN_GRENZEN.idMax || !echterTag(k.slice(i + 1))) return "Postenplan: Schlüssel haben die Form „Person|JJJJ-MM-TT“.";
    if (!imFenster(k.slice(i + 1))) return "Postenplan: der Tag liegt mehr als zwei Jahre von heute entfernt.";
    if (Array.isArray(plan[k])) {
      const f = wechselFehler(plan[k]);
      if (f) return f;
    } else if (!idOk(plan[k])) return "Postenplan: der Posten ist eine Kennung.";
    if (bekannt) for (const p of postenIdsVon(plan[k]))
      if (!bekannt.has(p)) return `Postenplan: den Posten „${String(p).slice(0, 30)}“ gibt es im Betrieb nicht.`;
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
 * Besetzung je Posten in einem Dienst an einem Tag, zeitanteilig ohne Doppelzählung (W6): Jede Person zählt zu jedem
 * Zeitpunkt auf höchstens einem Posten. Je Posten: `ist` = wer zum knappsten Zeitpunkt da ist (Reihenfolge der Personen),
 * `min` = deren Zahl, `alle` = wer irgendwann im Dienst auf dem Posten ist, `einzeln` = es gibt einen Zeitpunkt mit genau
 * einer Person, `abschnitte` = Teilzeiträume aus Postenwechseln (HH:MM). Nicht bewertbare Einträge (W5) zählen auf keinem
 * Posten; sie stehen in `nichtBewertbar` (Person, betroffene Posten). Aufwand: ein Durchlauf über die Personen, je Posten
 * ein Sortieren der Zeitgrenzen.
 * @param {any} m
 * @param {string} datum
 * @param {any} da Dienstart oder deren Kennung
 * @param {any[]} personenImDienst
 */
export function postenBesetzung(m, datum, da, personenImDienst) {
  const dienst = dienstartVon(m, da);
  const f = dienstFenster(dienst);
  const ende = f ? f.dauer : 1;
  /** @type {Map<string, { person: any, von: number, bis: number, teil: boolean }[]>} */
  const segmente = new Map();
  const personen = [];
  const nichtBewertbar = [];
  for (const x of liste(personenImDienst)) {
    const w = postenDerPerson(m, x.id, datum);
    if (w === undefined) continue;
    personen.push(x.id);
    const z = postenZeitraeume(w, dienst);
    if (!z) { nichtBewertbar.push({ person: x.id, posten: postenIdsVon(w) }); continue; }
    const teil = z.length > 1;
    for (const s of z) {
      const l = segmente.get(s.posten);
      const e = { person: x.id, von: s.von, bis: Math.min(s.bis, ende), teil };
      if (l) l.push(e); else segmente.set(s.posten, [e]);
    }
  }
  const rang = new Map(personen.map((p, i) => [p, i]));
  const nachRang = (a, b) => rang.get(a) - rang.get(b);
  /** @type {Map<string, { ist: any[], min: number, alle: any[], einzeln: boolean, abschnitte: { person: any, von: string, bis: string }[] }>} */
  const aus = new Map();
  for (const [posten, segs] of segmente) {
    const grenzen = [...new Set([0, ende, ...segs.flatMap((s) => [s.von, s.bis])])].filter((t) => t >= 0 && t <= ende).sort((a, b) => a - b);
    const delta = new Map();
    for (const s of segs) { delta.set(s.von, (delta.get(s.von) || 0) + 1); delta.set(s.bis, (delta.get(s.bis) || 0) - 1); }
    let n = 0, min = Infinity, wo = 0, einzeln = false;
    for (let i = 0; i + 1 < grenzen.length; i += 1) {
      n += delta.get(grenzen[i]) || 0;
      if (n < min) { min = n; wo = grenzen[i]; }
      if (n === 1) einzeln = true;
    }
    if (!Number.isFinite(min)) min = 0;
    const ist = [...new Set(segs.filter((s) => s.von <= wo && s.bis > wo).map((s) => s.person))].sort(nachRang);
    const alle = [...new Set(segs.map((s) => s.person))].sort(nachRang);
    const abschnitte = segs.filter((s) => s.teil).sort((a, b) => a.von - b.von || nachRang(a.person, b.person))
      .map((s) => ({ person: s.person, von: uhr(/** @type {any} */ (f).start + s.von), bis: uhr(/** @type {any} */ (f).start + s.bis) }));
    aus.set(posten, { ist, min: ist.length, alle, einzeln, abschnitte });
  }
  return { nachPosten: aus, nichtBewertbar };
}

/**
 * Soll und Ist je Posten für einen Dienst an einem Tag. Nur Posten mit Soll
 * in diesem Dienst; Ist zählt, wer im Dienst ist und auf den Posten
 * eingeteilt wurde — beim Postenwechsel zum knappsten Zeitpunkt (W6). Nicht
 * bewertbare Wechsel stehen je Posten in `nichtBewertbar` und zählen nicht.
 * @param {any} m
 * @param {string} datum
 * @param {string} dienstId
 * @param {any[]} personenImDienst
 */
export function postenLage(m, datum, dienstId, personenImDienst) {
  const aus = [];
  const { nachPosten, nichtBewertbar } = postenBesetzung(m, datum, dienstId, personenImDienst);
  for (const o of liste(m && m.objekte)) for (const p of liste(o.posten)) {
    const soll = p.soll && Number.isInteger(p.soll[dienstId]) ? p.soll[dienstId] : 0;
    if (soll <= 0) continue;
    const b = nachPosten.get(p.id);
    const ist = b ? b.ist : [];
    const offen = nichtBewertbar.filter((x) => x.posten.includes(p.id)).map((x) => x.person);
    aus.push({ posten: p.id, name: p.name, objekt: o.name, soll, ist, fehlt: Math.max(0, soll - ist.length),
      alleinarbeitHinweis: alleinarbeitHinweis(p, b && b.einzeln ? 1 : ist.length),
      ...(b && b.abschnitte.length ? { istGesamt: b.alle, abschnitte: b.abschnitte } : {}),
      ...(offen.length ? { nichtBewertbar: offen } : {}) });
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
  const wert = postenDerPerson(m, person.id, d);
  if (wert === undefined) return [];
  const ix = postenIndex(m);
  const sollVon = (e) => (e && e.posten.soll && Number.isInteger(e.posten.soll[da.id]) ? e.posten.soll[da.id] : 0);
  const dienst = dienstartVon(m, da);
  const eigene = postenZeitraeume(wert, dienst);
  /* Posten der Person mit Soll in diesem Dienst (beim Wechsel jeder Abschnitt einmal, W6). */
  const betroffen = postenIdsVon(wert).map((pid) => ix.get(pid)).filter((e) => sollVon(e) > 0);
  if (!betroffen.length) return [];
  if (typeof auswerten !== "function" || typeof qualGueltig !== "function") throw new Error("postenBefunde: Auswertung oder Qualifikationsprüfung fehlt.");
  const aus = [];
  const rbBasis = regelNach("POSTEN-BESETZUNG-01");
  /* W5: Ein Postenwechsel, der sich nicht dem Dienst zuordnen lässt, ist nicht bewertbar — nie „besetzt“, nie still. */
  if (!eigene) {
    for (const e of betroffen) {
      const b = alsEinteilungsBefund({ ...rbBasis, parameter: { anforderungen: [{ art: "anzahl", min: sollVon(e) }] } },
        { zustand: "offen", text: `Posten ${e.posten.name} (${e.objekt.name}): Postenwechsel passt nicht zu den Zeiten des Dienstes — nicht bewertbar` });
      if (b) aus.push(b);
    }
    return aus;
  }
  const mitPerson = liste(personen).some((x) => x.id === person.id) ? liste(personen) : [...liste(personen), person];
  const { nachPosten } = postenBesetzung(m, d, dienst || da, mitPerson);
  for (const eintrag of betroffen) {
    const soll = sollVon(eintrag);
    const wo = `Posten ${eintrag.posten.name} (${eintrag.objekt.name})`;
    const bes = nachPosten.get(eintrag.posten.id);
    const ist = bes ? bes.ist : [];
    const rb = { ...rbBasis, parameter: { anforderungen: [{ art: "anzahl", min: soll }] } };
    const eb = auswerten(rb, { personen: ist.map((id) => ({ id })), datum: d });
    if (eb.status === "verletzt") {
      const zeit = bes && bes.abschnitte.length ? " (knappster Zeitpunkt)" : "";
      const b = alsEinteilungsBefund(rb, { ...eb, text: `${wo}: ${ist.length} von ${soll} besetzt${zeit}` });
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
      if (Object.values(neuM.postenPlan).some((v) => postenIdsVon(v).some((x) => weg.has(x)))) return { grund: "Postenplan: ein entfernter Posten hat noch Einteilungen — erst die Einteilungen lösen." };
    }
  }
  return {};
}

/* ---- Pflege: reine Funktionen für die Oberfläche (nichts wird verändert, Ergebnis wird vom Server noch einmal geprüft) ---- */

/** Nächste freie Kennung „<präfix><n>“. */
const freieId = (belegt, praefix) => { let n = belegt.size + 1; while (belegt.has(`${praefix}${n}`)) n += 1; return `${praefix}${n}`; };
const alleIds = (objekte) => new Set(liste(objekte).flatMap((o) => [o.id, ...liste(o.posten).map((p) => p.id)]));
const einteilungenAuf = (m, postenIds) => (istObjekt(m && m.postenPlan)
  ? Object.values(m.postenPlan).filter((v) => postenIdsVon(v).some((x) => postenIds.has(x))).length : 0);

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
  /* Mit Postenwechsel ändert die Auswahl nur den Anfangsposten; die Wechsel bleiben (kein stiller Verlust). */
  else if (Array.isArray(alt[k])) plan[k] = [{ posten: postenId }, ...alt[k].slice(1)];
  else plan[k] = postenId;
  const fehler = pruefePostenPlan(plan, alt, new Set(postenIndex(m).keys()));
  return fehler ? { grund: fehler } : { plan };
}

const einteilungOk = (personId, tag) => {
  if (typeof personId !== "string" || !personId || personId.includes("|") || personId.length > POSTEN_GRENZEN.idMax) return "Person ungültig.";
  if (typeof tag !== "string" || !echterTag(tag)) return "Tag ungültig (JJJJ-MM-TT).";
  return null;
};

/**
 * Postenwechsel anlegen oder ändern (Oberfläche, rein): ab `ab` (HH:MM) ist die Person auf `postenId`. Verlangt eine
 * bestehende Einteilung des Tages und den Dienst der Person (Beginn/Ende), damit der Zeitpunkt eindeutig im Dienst liegt
 * (W1, W5). Ein vorhandener Wechsel zur selben Uhrzeit wird ersetzt. Der Server prüft dasselbe noch einmal.
 * @param {any} m @param {string} personId @param {string} tag @param {string} ab @param {string} postenId
 * @param {any} dienst Dienstart der Person an diesem Tag (mit start/ende)
 * @returns {{ plan: Record<string, any> } | { grund: string }}
 */
export function wechselSetzen(m, personId, tag, ab, postenId, dienst) {
  const f0 = einteilungOk(personId, tag);
  if (f0) return { grund: f0 };
  if (typeof ab !== "string" || !UHRZEIT.test(ab)) return { grund: "Postenwechsel: Beginn als Uhrzeit HH:MM." };
  const f = dienstFenster(dienstartVon(m, dienst));
  if (!f || f.dauer > 1440) return { grund: "Postenwechsel: Beginn und Ende des Dienstes sind nicht bekannt — kein Wechsel möglich." };
  const alt = istObjekt(m && m.postenPlan) ? m.postenPlan : {};
  const k = `${personId}|${tag}`;
  const abschnitte = postenAbschnitte(alt[k]);
  if (!abschnitte) return { grund: alt[k] === undefined ? "Postenwechsel: zuerst den Anfangsposten wählen." : "Postenwechsel: die Einteilung ist nicht lesbar — erst neu wählen." };
  const rel = (s) => (minuten(s) - f.start + 1440) % 1440;
  const r = rel(ab);
  if (r <= 0 || r >= f.dauer) return { grund: `Postenwechsel: ${ab} Uhr liegt nicht innerhalb des Dienstes.` };
  const rest = abschnitte.slice(1).filter((x) => x.ab !== ab);
  const neu = [...rest, { ab, posten: postenId }].sort((a, b) => rel(/** @type {string} */ (a.ab)) - rel(/** @type {string} */ (b.ab)));
  const liste2 = [{ posten: abschnitte[0].posten }, ...neu.map((x) => ({ ab: x.ab, posten: x.posten }))];
  /* Ein Wechsel auf den Posten, auf dem die Person ohnehin ist, ist keiner. */
  for (let i = 1; i < liste2.length; i += 1) if (liste2[i].posten === liste2[i - 1].posten) return { grund: "Postenwechsel: ein Wechsel führt auf einen anderen Posten." };
  const plan = { ...alt, [k]: liste2 };
  const fehler = pruefePostenPlan(plan, alt, new Set(postenIndex(m).keys()));
  return fehler ? { grund: fehler } : { plan };
}

/**
 * Einen Postenwechsel entfernen (Oberfläche, rein). Gleiche Nachbarposten werden zusammengefasst; bleibt ein Abschnitt,
 * ist der Eintrag wieder eine Kennung (W1, kanonische Form).
 * @param {any} m @param {string} personId @param {string} tag @param {string} ab
 * @returns {{ plan: Record<string, any> } | { grund: string }}
 */
export function wechselEntfernen(m, personId, tag, ab) {
  const f0 = einteilungOk(personId, tag);
  if (f0) return { grund: f0 };
  const alt = istObjekt(m && m.postenPlan) ? m.postenPlan : {};
  const k = `${personId}|${tag}`;
  const abschnitte = postenAbschnitte(alt[k]);
  if (!abschnitte || abschnitte.length < 2 || !abschnitte.some((x) => x.ab === ab)) return { grund: "Postenwechsel: diesen Wechsel gibt es nicht." };
  const uebrig = abschnitte.filter((x) => x.ab !== ab);
  const zusammen = uebrig.filter((x, i) => i === 0 || x.posten !== uebrig[i - 1].posten);
  const plan = { ...alt, [k]: zusammen.length === 1 ? zusammen[0].posten : zusammen.map((x, i) => (i === 0 ? { posten: x.posten } : { ab: x.ab, posten: x.posten })) };
  const fehler = pruefePostenPlan(plan, alt, new Set(postenIndex(m).keys()));
  return fehler ? { grund: fehler } : { plan };
}

/**
 * Schreibweg (Server, W3): Einen Postenwechsel neu anlegen oder ändern dürfen nur Leitung und Planung (nicht Demo). Geprüft
 * werden neue oder geänderte Einträge in Listenform; eine Einzelkennung und Unverändertes bleiben bei den bestehenden
 * Rechten (Löschen und Zurücksetzen auf einen Posten gehen also wie bisher). Rein; wirft nie.
 * @param {any} neuM @param {any} altM @param {any} sitzung
 * @returns {{ grund?: string }}
 */
export function postenWechselZusammen(neuM, altM, sitzung) {
  const neu = istObjekt(neuM && neuM.postenPlan) ? neuM.postenPlan : {};
  const alt = istObjekt(altM && altM.postenPlan) ? altM.postenPlan : {};
  const darf = !!sitzung && sitzung.demo !== true && POSTENWECHSEL_ROLLEN.includes(sitzung.rolle);
  if (darf) return {};
  for (const [k, v] of Object.entries(neu))
    if (Array.isArray(v) && !(hat(alt, k) && gleich(alt[k], v))) return { grund: "Postenwechsel: anlegen und ändern können nur Leitung und Planung." };
  return {};
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

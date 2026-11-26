/* ==========================================================================
   MODUL BEREICHSPLAN — Bereichs- und Wachabteilungsplanung (WP-19, Strang B)

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung):
     B1 b  Bereiche sind eine freie Liste je Einheit
           (`einheiten[].bereiche`: Kennung, Name, Soll je Dienstart) — ein
           Wohnbereich, eine Gruppe, ein Rettungsmittel.
     B2 b  Die Zuordnung (Betriebsfeld `bereichsPlan`, Schlüssel
           „personId|Tag" → Bereich) legen Planung und Leitung fest, die
           Schichtverantwortung für ihren eigenen Bereich am Tag
           (einheitZusammen in rechte.mjs).
     B3 a  Dasselbe Modul trägt die Wachabteilung im Rettungsdienst
           (Bereich = Rettungsmittel oder Wache); die Begriffe der Branche
           stehen in der Oberfläche (BEGRIFFE).

   Unterbesetzung eines Bereichs ist ein Hinweis (vorläufige Regel
   BEREICH-BESETZUNG-01), nie eine Sperre; nur bei aktivem Modul.
   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, BRANCHENMODULE, BEREICH_PROTOKOLL_ART, BEREICH_ARCHIV_ART } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

export const BEREICH_GRENZEN = Object.freeze({ bereicheJeEinheit: 50, planEintraege: 200_000, aenderungenSchicht: 500, tageSpanne: 731,
  sollMax: 99, textMax: 120, idMax: 60 });

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w.filter((x) => x && typeof x === "object") : []);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const echterTag = (s) => { if (!TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
/** Liegt der Tag im plausiblen Bereich (zwei Jahre vor und nach heute)? */
const imFenster = (s, jetzt = Date.now()) => Math.abs(new Date(`${s}T12:00:00Z`).getTime() - jetzt) <= BEREICH_GRENZEN.tageSpanne * 86400000 + 43200000;
const idOk = (s) => typeof s === "string" && s.length >= 1 && s.length <= BEREICH_GRENZEN.idMax;

/**
 * Prüft die Bereiche aller Einheiten. Fehlende Bereiche sind in Ordnung.
 * @param {any} einheiten
 * @returns {string | null}
 */
export function pruefeBereiche(einheiten) {
  if (einheiten === undefined || einheiten === null) return null;
  if (!Array.isArray(einheiten)) return null;                       // die Form der Einheiten prüft ein anderer Weg
  const ids = new Set();
  for (const e of einheiten) {
    if (!istObjekt(e) || e.bereiche === undefined || e.bereiche === null) continue;
    const wo = `Bereiche der Einheit ${String(e.name || e.id || "").slice(0, 40)}`.trim();
    if (!Array.isArray(e.bereiche)) return `${wo}: erwartet wird eine Liste.`;
    if (e.bereiche.length > BEREICH_GRENZEN.bereicheJeEinheit) return `${wo}: höchstens ${BEREICH_GRENZEN.bereicheJeEinheit}.`;
    for (const b of e.bereiche) {
      if (!istObjekt(b)) return `${wo}: ein Bereich erwartet einen Datensatz.`;
      const bw = `${wo}, Bereich ${String(b.name || b.id || "").slice(0, 40)}`;
      if (Object.keys(b).some((k) => !["id", "name", "soll"].includes(k))) return `${bw}: unbekannte Felder.`;
      if (!idOk(b.id)) return `${bw}: Kennung fehlt oder ist zu lang.`;
      if (typeof b.name !== "string" || !b.name.trim() || b.name.length > BEREICH_GRENZEN.textMax) return `${bw}: Name fehlt oder ist zu lang.`;
      if (ids.has(b.id)) return `${bw}: Kennung kommt doppelt vor.`;
      ids.add(b.id);
      if (b.soll !== undefined && b.soll !== null) {
        if (!istObjekt(b.soll)) return `${bw}: Sollbesetzung je Dienstart erwartet.`;
        for (const [k, n] of Object.entries(b.soll))
          if (k.length > 12 || !Number.isInteger(n) || n < 0 || n > BEREICH_GRENZEN.sollMax)
            return `${bw}: Sollbesetzung ist eine ganze Zahl von 0 bis ${BEREICH_GRENZEN.sollMax}.`;
      }
    }
  }
  return null;
}

/**
 * Prüft die Zuordnung ({ "personId|Tag": bereichId }). Mit `alt` werden nur
 * neue oder geänderte Einträge streng geprüft.
 * @param {any} plan
 * @param {any} [alt]
 * @returns {string | null}
 */
export function pruefeBereichsPlan(plan, alt) {
  if (plan === undefined || plan === null) return null;
  if (!istObjekt(plan)) return "Bereichsplan: erwartet wird { \"Person|Tag\": Bereich }.";
  const schluessel = Object.keys(plan);
  if (schluessel.length > BEREICH_GRENZEN.planEintraege) return `Bereichsplan: höchstens ${BEREICH_GRENZEN.planEintraege} Einträge.`;
  const vorher = istObjekt(alt) ? alt : {};
  for (const k of schluessel) {
    if (hat(vorher, k) && vorher[k] === plan[k]) continue;
    const i = k.lastIndexOf("|");
    if (i < 1 || i > BEREICH_GRENZEN.idMax || !echterTag(k.slice(i + 1))) return "Bereichsplan: Schlüssel haben die Form „Person|JJJJ-MM-TT“.";
    if (!imFenster(k.slice(i + 1))) return "Bereichsplan: der Tag liegt mehr als zwei Jahre von heute entfernt.";
    if (!idOk(plan[k])) return "Bereichsplan: der Bereich ist eine Kennung.";
  }
  return null;
}

/** Alle Bereiche eines Betriebs nach Kennung. @param {any} m @returns {Map<string, { einheitId: any, bereich: any }>} */
export function bereichsIndex(m) {
  const ix = new Map();
  for (const e of liste(m && m.einheiten)) for (const b of liste(e.bereiche)) ix.set(b.id, { einheitId: e.id, bereich: b });
  return ix;
}

const bereichDerPerson = (m, pid, d) => (istObjekt(m && m.bereichsPlan) ? m.bereichsPlan[`${pid}|${d}`] : undefined);

/**
 * Soll und Ist der Bereiche einer Einheit für einen Dienst an einem Tag,
 * dazu wer im Dienst ist und keinem Bereich zugeordnet wurde.
 * @param {any} m
 * @param {any} einheitId
 * @param {string} datum
 * @param {string} dienstId
 * @param {any[]} personenImDienst
 * @returns {{ bereiche: { bereich: string, name: string, soll: number, ist: any[], fehlt: number }[], nichtZugeordnet: any[] }}
 */
export function bereichsLage(m, einheitId, datum, dienstId, personenImDienst) {
  const imDienst = liste(personenImDienst);
  const einheit = liste(m && m.einheiten).find((e) => String(e.id) === String(einheitId));
  const bereiche = [];
  for (const b of liste(einheit && einheit.bereiche)) {
    const soll = b.soll && Number.isInteger(b.soll[dienstId]) ? b.soll[dienstId] : 0;
    if (soll <= 0) continue;
    const ist = imDienst.filter((x) => bereichDerPerson(m, x.id, datum) === b.id).map((x) => x.id);
    bereiche.push({ bereich: b.id, name: b.name, soll, ist, fehlt: Math.max(0, soll - ist.length) });
  }
  return { bereiche, nichtZugeordnet: imDienst.filter((x) => !bereichDerPerson(m, x.id, datum)).map((x) => x.id) };
}

/**
 * Befunde zur Zuordnung einer Person auf einen Bereich. Inaktives Modul → keine.
 * @param {any} m
 * @param {{ id: any }} da
 * @param {string} d
 * @param {any} person
 * @param {any[]} personen alle im Dienst (mit der geprüften)
 * @param {{ auswerten: (r: any, k: any) => any, einheitAm: (p: any, d: string) => any, module?: readonly any[] }} o
 */
export function bereichsplanBefunde(m, da, d, person, personen, { auswerten, einheitAm, module = BRANCHENMODULE }) {
  if (!person || !da || !modulAktiv(m, "bereichsplan", module)) return [];
  const bid = bereichDerPerson(m, person.id, d);
  const eintrag = bid ? bereichsIndex(m).get(bid) : null;
  if (!eintrag) return [];
  const basis = REGELN_BRANCHEN.find((r) => r.id === "BEREICH-BESETZUNG-01");
  if (!basis) throw new Error("BEREICH-BESETZUNG-01 fehlt im Branchenkatalog.");
  const wo = `Bereich ${eintrag.bereich.name}`;
  if (typeof einheitAm === "function" && String(einheitAm(person, d)) !== String(eintrag.einheitId)) {
    const b = alsEinteilungsBefund(basis, { zustand: "offen", text: `${wo} gehört nicht zur Einheit der Person an diesem Tag — nicht bewertbar` });
    return b ? [b] : [];
  }
  const soll = eintrag.bereich.soll && Number.isInteger(eintrag.bereich.soll[da.id]) ? eintrag.bereich.soll[da.id] : 0;
  if (soll <= 0) return [];
  if (typeof auswerten !== "function") throw new Error("bereichsplanBefunde: Auswertung (Regelbaukasten) fehlt.");
  const ist = liste(personen).filter((x) => bereichDerPerson(m, x.id, d) === bid);
  if (!ist.some((x) => x.id === person.id)) ist.push(person);
  const r = { ...basis, bezeichnung: `Sollbesetzung ${wo}`, parameter: { anforderungen: [{ art: "anzahl", min: soll }] } };
  const erg = auswerten(r, { personen: ist.map((x) => ({ id: x.id })), datum: d });
  const b = erg.status === "verletzt" ? alsEinteilungsBefund(r, { ...erg, text: `${wo}: ${ist.length} von ${soll} besetzt` }) : null;
  return b ? [b] : [];
}

/**
 * Schreibweg (Planung, Leitung): prüft Bereiche und Zuordnung, mit `altM`
 * nur Neues oder Geändertes streng. Neue oder geänderte Zuordnungen müssen auf
 * einen Bereich des Betriebs zeigen, und ein Bereich, der verschwindet, darf
 * keine Zuordnung zurücklassen (WP-19.4, wie beim Postenplan).
 * @param {any} neuM
 * @param {any} [altM]
 * @param {{ bekannt?: boolean }} [o] bekannt: false auf dem Ausnahmeweg Art. 16/17 (dort prüft das Wertschema der Berichtigung)
 * @returns {{ grund?: string }}
 */
export function bereichsplanZusammen(neuM, altM, { bekannt = true } = {}) {
  if (!neuM || typeof neuM !== "object") return {};
  const bereiche = (m) => liste(m && m.einheiten).map((e) => JSON.stringify([e.id, e.bereiche]));
  const gleichB = altM && JSON.stringify(bereiche(neuM)) === JSON.stringify(bereiche(altM));
  if (!gleichB) {
    const f = pruefeBereiche(neuM.einheiten);
    if (f) return { grund: f };
  }
  const f2 = pruefeBereichsPlan(neuM.bereichsPlan, altM && altM.bereichsPlan);
  if (f2) return { grund: f2 };
  if (bekannt && istObjekt(neuM.bereichsPlan)) {
    const ix = bereichsIndex(neuM);
    const vorher = istObjekt(altM && altM.bereichsPlan) ? altM.bereichsPlan : {};
    for (const [k, v] of Object.entries(neuM.bereichsPlan))
      if (!(hat(vorher, k) && vorher[k] === v) && !ix.has(v)) return { grund: `Bereichsplan: den Bereich „${String(v).slice(0, 30)}“ gibt es im Betrieb nicht.` };
    if (altM) {
      /* Nur Bereiche, deren Einheit weiter besteht: Eine Einheit zu löschen ist ein Kernweg und bleibt erlaubt (modul-altwege.mjs);
         Zuordnungen auf Bereiche gelöschter Einheiten sind Altbestand und blockieren nicht. */
      const bleibend = new Set(liste(neuM.einheiten).map((e) => String(e.id)));
      const w = new Set([...bereichsIndex(altM)].filter(([id, e]) => !ix.has(id) && bleibend.has(String(e.einheitId))).map(([id]) => id));
      if (w.size && Object.values(neuM.bereichsPlan).some((v) => w.has(v)))
        return { grund: "Bereichsplan: ein entfernter Bereich hat noch Zuordnungen — erst die Zuordnungen lösen." };
      /* B-2: Eine unveränderte Altzuordnung darf nicht auf einen Bereich zeigen, der es im alten Stand nicht gab oder dort zu einer
         anderen Einheit gehörte (neu vergeben, auch im selben Schreiben wie das Löschen der Einheit, oder verschoben): sonst lebt der
         Plan eines gelöschten Bereichs im neuen Bereich still wieder auf. Neue Zuordnungen auf den Bereich im selben Schreiben bleiben erlaubt. */
      const altIx = bereichsIndex(altM);
      for (const [k, v] of Object.entries(neuM.bereichsPlan)) {
        if (!(hat(vorher, k) && vorher[k] === v) || !ix.has(v)) continue;
        const frueher = altIx.get(v);
        if (!frueher) return { grund: `Bereichsplan: die Kennung „${String(v).slice(0, 30)}“ gehört noch zu Zuordnungen eines gelöschten Bereichs — erst die Zuordnungen lösen.` };
        if (String(frueher.einheitId) !== String(ix.get(v).einheitId))
          return { grund: `Bereichsplan: der Bereich „${String(v).slice(0, 30)}“ wechselt die Einheit oder wird neu vergeben, die Zuordnungen darauf gelten noch dem alten — erst die Zuordnungen lösen.` };
      }
    }
  }
  return {};
}

/* ---- Pflege: reine Funktionen für die Oberfläche (nichts wird verändert, der Server prüft das Ergebnis noch einmal) ---- */

const freieId = (belegt, praefix) => { let n = belegt.size + 1; while (belegt.has(`${praefix}${n}`)) n += 1; return `${praefix}${n}`; };
const zuordnungenAuf = (m, ids) => (istObjekt(m && m.bereichsPlan) ? Object.values(m.bereichsPlan).filter((v) => ids.has(v)).length : 0);
const AENDERBAR = Object.freeze(["name", "soll"]);
const mitBereichen = (einheiten, einheitId, f) => liste(einheiten).map((e) => (String(e.id) === String(einheitId) ? { ...e, bereiche: f(liste(e.bereiche)) } : e));

/** Neuer Bereich in einer Einheit (Name leer: „Neuer Bereich“); Einheit unbekannt oder voll: unverändert. @param {any[]} einheiten @param {any} einheitId @param {string} name @param {any} [bereichsPlan] */
export function bereichHinzufuegen(einheiten, einheitId, name, bereichsPlan) {
  const e = liste(einheiten).find((x) => String(x.id) === String(einheitId));
  if (!e || liste(e.bereiche).length >= BEREICH_GRENZEN.bereicheJeEinheit) return einheiten;
  const belegt = new Set(liste(einheiten).flatMap((x) => liste(x.bereiche).map((b) => b.id)));
  /* B-2: auch Kennungen, auf die der Bereichsplan noch zeigt (Bereiche gelöschter Einheiten), sind belegt. */
  if (istObjekt(bereichsPlan)) for (const v of Object.values(bereichsPlan)) belegt.add(v);
  return mitBereichen(einheiten, einheitId, (bs) => [...bs, { id: freieId(belegt, "b"), name: String(name || "").trim() || "Neuer Bereich", soll: {} }]);
}
/** Name oder Soll ändern; die Kennung nie. @param {any[]} einheiten @param {any} einheitId @param {string} bereichId @param {Record<string, any>} patch */
export function bereichAendern(einheiten, einheitId, bereichId, patch) {
  const nimm = Object.fromEntries(AENDERBAR.filter((k) => istObjekt(patch) && hat(patch, k)).map((k) => [k, patch[k]]));
  return mitBereichen(einheiten, einheitId, (bs) => bs.map((b) => (b.id === bereichId ? { ...b, ...nimm } : b)));
}
/** Sollbesetzung eines Dienstes setzen; ohne Zahl entfällt der Eintrag. Ungültiges bleibt stehen (pruefeBereiche meldet es). */
export function bereichSollSetzen(soll, dienstId, n) {
  const neu = { ...(istObjekt(soll) ? soll : {}) };
  if (n === undefined || n === null || (typeof n === "number" && Number.isNaN(n))) delete neu[dienstId];
  else neu[dienstId] = n;
  return neu;
}
/**
 * Entfernt einen Bereich — nur ohne Zuordnung im Bereichsplan (sonst bliebe der Plan ohne Bereich).
 * @param {any} m @param {string} bereichId
 * @returns {{ einheiten: any[] } | { grund: string }}
 */
export function bereichEntfernen(m, bereichId) {
  if (!bereichsIndex(m).get(bereichId)) return { grund: "Bereich unbekannt." };
  const n = zuordnungenAuf(m, new Set([bereichId]));
  if (n > 0) return { grund: `Dem Bereich sind noch ${n} Zuordnung${n === 1 ? "" : "en"} im Bereichsplan zugeordnet — erst dort lösen.` };
  return { einheiten: liste(m.einheiten).map((e) => (e.bereiche === undefined ? e : { ...e, bereiche: liste(e.bereiche).filter((b) => b.id !== bereichId) })) };
}
/**
 * Zuordnung einer Person an einem Tag zu einem Bereich setzen (leer: lösen). Mit `einheitId` muss der Bereich zu dieser
 * Einheit gehören. Der Server prüft dasselbe noch einmal.
 * @param {any} m @param {string} personId @param {string} tag @param {string | null} bereichId @param {any} [einheitId]
 * @returns {{ plan: Record<string, string> } | { grund: string }}
 */
export function zuordnungSetzen(m, personId, tag, bereichId, einheitId) {
  if (typeof personId !== "string" || !personId || personId.includes("|") || personId.length > BEREICH_GRENZEN.idMax) return { grund: "Person ungültig." };
  if (typeof tag !== "string" || !echterTag(tag)) return { grund: "Tag ungültig (JJJJ-MM-TT)." };
  const alt = istObjekt(m && m.bereichsPlan) ? m.bereichsPlan : {};
  const plan = { ...alt };
  const k = `${personId}|${tag}`;
  if (bereichId === null || bereichId === undefined || bereichId === "") delete plan[k];
  else {
    const eintrag = bereichsIndex(m).get(bereichId);
    if (!eintrag) return { grund: "Bereich unbekannt." };
    if (einheitId !== undefined && String(eintrag.einheitId) !== String(einheitId)) return { grund: "Der Bereich gehört nicht zu dieser Einheit." };
    plan[k] = bereichId;
  }
  const fehler = pruefeBereichsPlan(plan, alt);
  return fehler ? { grund: fehler } : { plan };
}

/**
 * Schreibweg der Schichtverantwortung: nur Zuordnungen für Personen des
 * eigenen Bereichs am Tag, nur auf Bereiche der eigenen Einheit. Löschen
 * (Eintrag fehlt) geht im selben Rahmen. Unsichtbare Einträge fremder
 * Bereiche bleiben, wie sie sind (die Rückfüllung vor dieser Prüfung).
 * @param {any} altO gespeichert
 * @param {any} neuO übermittelt
 * @param {{ imBereich: (pid: string, tag: string) => boolean, eigeneBereiche: Set<string> }} k
 * @returns {{ ok: true, plan: Record<string, string> } | { ok: false, grund: string }}
 */
export function bereichsPlanSchicht(altO, neuO, { imBereich, eigeneBereiche }) {
  const alt = istObjekt(altO) ? altO : {};
  if (!istObjekt(neuO)) return { ok: false, grund: "Bereichsplan: ungültige Form." };
  if (Object.keys(neuO).length > BEREICH_GRENZEN.planEintraege) return { ok: false, grund: `Bereichsplan: höchstens ${BEREICH_GRENZEN.planEintraege} Einträge.` };
  let geaendert = 0;
  for (const k of new Set([...Object.keys(alt), ...Object.keys(neuO)])) {
    if (alt[k] === neuO[k]) continue;
    if (++geaendert > BEREICH_GRENZEN.aenderungenSchicht)
      return { ok: false, grund: `Bereichsplan: höchstens ${BEREICH_GRENZEN.aenderungenSchicht} Änderungen je Speichern.` };
    const i = k.lastIndexOf("|");
    const pid = k.slice(0, i), tag = k.slice(i + 1);
    if (i < 1 || !echterTag(tag)) return { ok: false, grund: "Bereichsplan: ungültiger Schlüssel." };
    if (hat(neuO, k) && !imFenster(tag)) return { ok: false, grund: "Bereichsplan: der Tag liegt mehr als zwei Jahre von heute entfernt." };
    if (!imBereich(pid, tag)) return { ok: false, grund: "Die Person gehört an diesem Tag nicht zu deinem Bereich." };
    if (hat(neuO, k) && (typeof neuO[k] !== "string" || !eigeneBereiche.has(neuO[k])))
      return { ok: false, grund: "Dieser Bereich gehört nicht zu deiner Einheit." };
  }
  return { ok: true, plan: neuO };
}

/* ---- Änderungsprotokoll im Schreibweg der Schichtverantwortung (WP-19.4, Matrix B2 b; Invarianten WP19-MODULPLAN.md §17) ----
   Im bestehenden Modulprotokoll des Betriebs (einstellungen.modulprotokoll: nur der Server schreibt, Aufbewahrung und Löschweg wie
   dort; eigene Grenzen statt der gemeinsamen, BEREICH_PROTOKOLL_GRENZEN). Je angenommenem Speichern mit Änderung genau ein Eintrag: wer (Kennung), wann (Serverzeit), eigene Einheit,
   Anzahl und je Änderung Person (Kennung), Tag, Bereich vorher und nachher (Kennung oder null) — keine Namen, nichts weiter. */
export { BEREICH_PROTOKOLL_ART };

/**
 * Der Protokolleintrag zu einer angenommenen Änderung des Bereichsplans; ohne Änderung null.
 * @param {any} altO gespeicherter Bereichsplan
 * @param {any} neuO angenommener Bereichsplan
 * @param {{ am: string, von: any, einheit: any }} k
 * @returns {null | { art: string, modul: string, am: string, von: any, einheit: any, anzahl: number,
 *   zuordnungen: { person: string, tag: string, vorher: (string | null), nachher: (string | null) }[] }}
 */
export function bereichsprotokollEintrag(altO, neuO, { am, von, einheit }) {
  const alt = istObjekt(altO) ? altO : {}, neu = istObjekt(neuO) ? neuO : {};
  const wert = (o, k) => (hat(o, k) && typeof o[k] === "string" ? o[k] : null);
  const zuordnungen = [];
  for (const k of [...new Set([...Object.keys(alt), ...Object.keys(neu)])].sort()) {
    const vorher = wert(alt, k), nachher = wert(neu, k);
    if (vorher === nachher) continue;
    const i = k.lastIndexOf("|");
    zuordnungen.push({ person: k.slice(0, i), tag: k.slice(i + 1), vorher, nachher });
  }
  if (!zuordnungen.length) return null;
  return { art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", am, von: von === undefined ? null : von,
    einheit: einheit === undefined ? null : einheit, anzahl: zuordnungen.length, zuordnungen };
}

/**
 * Eigene Grenzen dieser Art (Review #578 B-1/B-2): Sie zählen NICHT zur gemeinsamen Grenze des Modulprotokolls
 * (modulprotokollBelegt) und sperren nur das Zuordnen durch die Schichtverantwortung — nie Leitung, Planung oder andere Einträge.
 * E1: dieselben Werte gelten getrennt für die Einträge der Schichtverantwortung (ohne `rolle`) und die von Leitung/Planung (mit
 * `rolle`, bereichsprotokollVoll) — Worst Case der Art also 2 × 1 MiB ≤ 1/3 von RUMPF_MAX.
 * Worst Case Bytes: alle Einträge dieser Art zusammen höchstens `gesamtBytes` (1 MiB, UTF-8 der JSON-Form), also ≤ 1/6 von
 * RUMPF_MAX (6 MiB, server/funktionen/daten.mjs) — unabhängig von der Zahl der Einheiten, weil die Grenze je Betrieb gilt.
 * Ein Eintrag: höchstens `jeSpeichern` Zuordnungen und `eintragBytes`; je Zuordnung höchstens ≈ 240 Byte (Kennungen ≤ 60 Zeichen).
 */
export const BEREICH_PROTOKOLL_GRENZEN = Object.freeze({ jeSpeichern: 100, eintragBytes: 32 * 1024, eintraege: 2000, gesamtBytes: 1024 * 1024 });

/** Bytes der JSON-Form (UTF-8) — im Browser und auf dem Server gleich. @param {any} x */
export const protokollBytes = (x) => new TextEncoder().encode(JSON.stringify(x)).length;

/**
 * Hängt den Eintrag an das gespeicherte Modulprotokoll an (nie an das übermittelte). Nur anhängen: nichts wird hier entfernt oder
 * verdrängt (Platz schafft nur die Archivierung der Leitung, bereichsprotokollArchivieren, WP19-MODULPLAN.md 17.1 A1–A12). Über einer eigenen Grenze wird das Speichern der
 * Schichtverantwortung abgewiesen — keine Zuordnung ohne Protokoll (fail-closed).
 * @param {any} einstellungen gespeicherte Einstellungen des Betriebs
 * @param {any} eintrag
 * @param {{ grenzen?: typeof BEREICH_PROTOKOLL_GRENZEN }} [o]
 * @returns {{ einstellungen: any } | { grund: string }}
 */
export function bereichsprotokollAnhaengen(einstellungen, eintrag, { grenzen = BEREICH_PROTOKOLL_GRENZEN } = {}) {
  const e = istObjekt(einstellungen) ? einstellungen : {};
  const bisher = Array.isArray(e.modulprotokoll) ? e.modulprotokoll : [];
  const n = Array.isArray(eintrag && eintrag.zuordnungen) ? eintrag.zuordnungen.length : 0;
  if (n > grenzen.jeSpeichern)
    return { grund: `Bereichsplan: höchstens ${grenzen.jeSpeichern} Änderungen je Speichern (Änderungsprotokoll) — bitte in kleineren Schritten speichern.` };
  const b = protokollBytes(eintrag);
  if (b > grenzen.eintragBytes) return { grund: "Bereichsplan: Die Änderung ist für das Änderungsprotokoll zu groß — bitte in kleineren Schritten speichern." };
  /* E1: Gezählt werden nur Einträge der Schichtverantwortung (ohne `rolle`) — Einträge von Leitung und Planung sperren die SV nie. */
  const eigene = bisher.filter((x) => istObjekt(x) && x.art === BEREICH_PROTOKOLL_ART && !hat(x, "rolle"));
  if (eigene.length + 1 > grenzen.eintraege || protokollBytes(eigene) + b > grenzen.gesamtBytes)
    return { grund: "Bereichsplan: Das Änderungsprotokoll der Zuordnungen ist voll. Zuordnen durch die Schichtverantwortung geht erst wieder, "
      + "wenn die Leitung das Änderungsprotokoll archiviert hat (Export und Vermerk); Leitung und Planung ordnen weiter zu." };
  return { einstellungen: { ...e, modulprotokoll: [...bisher, eintrag] } };
}

/* ---- E1 (Betreiberentscheidung 2026-11-26): Änderungsprotokoll auch für Leitung und Planung (voller Schreibweg) ----
   Gleiche Art und gleicher Inhalt wie bei der Schichtverantwortung (nur Kennungen, vorher → nachher), dazu `rolle`; Einträge ohne
   `rolle` stammen von der Schichtverantwortung. Risikogerecht und fail-open (WP19-MODULPLAN.md 17.1, L1–L10): Das Protokoll hindert
   Leitung und Planung NIE am Speichern. Mehr als `jeSpeichern` Zuordnungen oder mehr als `eintragBytes` in einem Speichern →
   ein verdichteter Eintrag (Anzahl, Prüfsumme der Einzelliste, keine Einzelwerte). Eigenes Kontingent (`eintraege`/`gesamtBytes`
   zählen nur Einträge mit `rolle`); ist es erschöpft, entsteht kein Eintrag, das Speichern geht durch, und die Spur ist die Zeile im
   Betriebsprotokoll des Servers (modulProtokollZeilen: „ohne Eintrag im Änderungsprotokoll“). Platz schafft die Archivierung. */
/** Rolle des vollen Schreibwegs → Angabe im Eintrag. */
export const BEREICH_PROTOKOLL_ROLLEN = Object.freeze({ leitung: "leitung", planer: "planung", kunde: "kunde" });
/** Eintrag aus dem vollen Schreibweg (Leitung, Planung, Kundenrolle)? @param {any} x */
export const bereichsprotokollVonVoll = (x) => istObjekt(x) && x.art === BEREICH_PROTOKOLL_ART && hat(x, "rolle");

/** Die Einheit, zu der alle berührten Bereiche gehören (alter oder neuer Stand), sonst null. */
function einheitDerAenderung(altM, neuM, zuordnungen) {
  const ixN = bereichsIndex(neuM), ixA = bereichsIndex(altM);
  const ids = new Set();
  for (const z of zuordnungen) for (const b of [z.vorher, z.nachher]) {
    if (b === null) continue;
    const t = ixN.get(b) || ixA.get(b);
    ids.add(t ? String(t.einheitId) : "\u0000");
  }
  return ids.size === 1 && !ids.has("\u0000") ? [...ids][0] : null;
}

/**
 * Hängt zu einer Änderung des Bereichsplans im vollen Schreibweg (Leitung, Planung) genau einen Eintrag an — oder, bei
 * erschöpftem Kontingent, keinen (`voll: true`). Weist nie ab. Ohne Änderung: `eintrag: null`, `mandant` unverändert (dasselbe Objekt).
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM zu speichernder Betrieb (nach allen Schreibwegen; sein Modulprotokoll ist das vom Server gesetzte)
 * @param {{ am: string, von: any, rolle: string, pruefsumme?: (text: string) => string, grenzen?: typeof BEREICH_PROTOKOLL_GRENZEN }} k
 * @returns {{ mandant: any, eintrag: any, voll?: boolean }}
 */
export function bereichsprotokollVoll(altM, neuM, { am, von, rolle, pruefsumme, grenzen = BEREICH_PROTOKOLL_GRENZEN }) {
  if (!istObjekt(neuM)) return { mandant: neuM, eintrag: null };
  const roh = bereichsprotokollEintrag(altM && altM.bereichsPlan, neuM.bereichsPlan, { am, von, einheit: null });
  if (!roh) return { mandant: neuM, eintrag: null };
  const kopf = { art: roh.art, modul: roh.modul, am: roh.am, von: roh.von,
    rolle: hat(BEREICH_PROTOKOLL_ROLLEN, rolle) ? BEREICH_PROTOKOLL_ROLLEN[rolle] : String(rolle).slice(0, 20),
    einheit: einheitDerAenderung(altM, neuM, roh.zuordnungen), anzahl: roh.anzahl };
  /** @type {Record<string, any>} */
  let eintrag = { ...kopf, zuordnungen: roh.zuordnungen };
  if (roh.anzahl > grenzen.jeSpeichern || protokollBytes(eintrag) > grenzen.eintragBytes)
    eintrag = { ...kopf, verdichtet: true, ...(typeof pruefsumme === "function" ? { pruefsumme: pruefsumme(JSON.stringify(roh.zuordnungen)) } : {}) };
  const e = istObjekt(neuM.einstellungen) ? neuM.einstellungen : {};
  const bisher = Array.isArray(e.modulprotokoll) ? e.modulprotokoll : [];
  const eigene = bisher.filter(bereichsprotokollVonVoll);
  if (eigene.length + 1 > grenzen.eintraege || protokollBytes(eigene) + protokollBytes(eintrag) > grenzen.gesamtBytes)
    return { mandant: neuM, eintrag: null, voll: true };
  return { mandant: { ...neuM, einstellungen: { ...e, modulprotokoll: [...bisher, eintrag] } }, eintrag };
}

/* ---- Archivierung durch die Leitung (E7 b, Betreiberentscheidung 2026-11-26; Invarianten A1–A12, WP19-MODULPLAN.md 17.1) ----
   Kein stilles Löschen und keine höheren Grenzen: Die Leitung zieht aus ihrer Sicht einen Export der ältesten Einträge dieser Art
   (kanonisch JSON, Bytes, SHA-256) und bestätigt ihn mit Anzahl, Bytes und Prüfsumme. Nur wenn das zum gespeicherten Stand passt,
   entfernt der Server genau diese Einträge und hängt im SELBEN Schreiben einen Vermerk an (ohne Namen, ohne Freitext). Browser und
   Server rechnen dasselbe (WebCrypto). Das Archiv ist das Exportpaket der Leitung; eine Serverablage gibt es nicht (E8). */
export { BEREICH_ARCHIV_ART };

/** Archivieren nur bei wirkendem Modul (A8; die Abfrage bleibt im Modul, G10). @param {any} m @param {readonly any[]} [module] */
export const bereichsprotokollArchivierbar = (m, module = BRANCHENMODULE) => modulAktiv(m, "bereichsplan", module);
const PRUEFSUMME = /^[0-9a-f]{64}$/;

/**
 * Die ältesten `anzahl` Einträge dieser Art (ohne Angabe: alle) in gespeicherter Reihenfolge — dieselben Objekte, nicht kopiert —
 * mit der kanonischen Form `text` (JSON), über die `bytes` (UTF-8) und die Prüfsumme laufen.
 * @param {any} einstellungen
 * @param {{ anzahl?: number }} [o]
 * @returns {{ eintraege: any[], anzahl: number, vorhanden: number, bytes: number, text: string }}
 */
export function bereichsprotokollExport(einstellungen, { anzahl } = {}) {
  const liste = istObjekt(einstellungen) && Array.isArray(einstellungen.modulprotokoll) ? einstellungen.modulprotokoll : [];
  const alle = liste.filter((x) => istObjekt(x) && x.art === BEREICH_PROTOKOLL_ART);
  const eintraege = anzahl === undefined ? alle : alle.slice(0, Math.max(0, anzahl));
  const text = JSON.stringify(eintraege);
  return { eintraege, anzahl: eintraege.length, vorhanden: alle.length, bytes: new TextEncoder().encode(text).length, text };
}

/** SHA-256 (hex) der UTF-8-Form — im Browser und auf dem Server gleich. @param {string} text @returns {Promise<string>} */
export async function bereichsprotokollPruefsumme(text) {
  const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Archiviert nach bestätigtem Export: entfernt die ältesten `anzahl` Einträge dieser Art und hängt den Vermerk an — beides im
 * Ergebnis, sonst nichts (fail-closed; die Eingabe bleibt unverändert). 400: Form; 409: Export passt nicht zum gespeicherten Stand.
 * Grenzen bleiben, wie sie sind (A10); der Vermerk wird auch an der gemeinsamen Grenze geschrieben (wie Ausschalten, Art. 16/17).
 * @param {any} einstellungen gespeicherte Einstellungen des Betriebs (frisch gelesen)
 * @param {any} angabe { anzahl, bytes, pruefsumme, exportGespeichert: true }
 * @param {{ am: string, von: any }} k
 * @returns {Promise<{ einstellungen: any, vermerk: any } | { status: 400 | 409, grund: string }>}
 */
export async function bereichsprotokollArchivieren(einstellungen, angabe, { am, von }) {
  const a = istObjekt(angabe) ? angabe : {};
  if (a.exportGespeichert !== true)
    return { status: 400, grund: "Archivieren: Erst den Export herunterladen und bestätigen, dass er gespeichert ist." };
  if (!Number.isInteger(a.anzahl) || a.anzahl < 1 || !Number.isInteger(a.bytes) || a.bytes < 2 || typeof a.pruefsumme !== "string" || !PRUEFSUMME.test(a.pruefsumme))
    return { status: 400, grund: "Archivieren: Anzahl, Bytes und Prüfsumme des Exports fehlen oder sind ungültig." };
  const e = istObjekt(einstellungen) ? einstellungen : {};
  const ex = bereichsprotokollExport(e, { anzahl: a.anzahl });
  if (ex.anzahl !== a.anzahl || ex.bytes !== a.bytes || (await bereichsprotokollPruefsumme(ex.text)) !== a.pruefsumme)
    return { status: 409, grund: "Archivieren: Der Export passt nicht zum gespeicherten Änderungsprotokoll (inzwischen archiviert oder unvollständig). "
      + "Nichts entfernt — bitte neu exportieren." };
  const zeit = (x) => (typeof x.am === "string" ? x.am.slice(0, 40) : null);
  const vermerk = { art: BEREICH_ARCHIV_ART, modul: "bereichsplan", am, von: von === undefined ? null : von, anzahl: ex.anzahl, bytes: ex.bytes,
    pruefsumme: a.pruefsumme, erster: zeit(ex.eintraege[0]), letzter: zeit(ex.eintraege[ex.eintraege.length - 1]) };
  const weg = new Set(ex.eintraege);
  return { einstellungen: { ...e, modulprotokoll: [...e.modulprotokoll.filter((x) => !weg.has(x)), vermerk] }, vermerk };
}

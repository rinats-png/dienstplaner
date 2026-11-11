/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { einheitLabel as brancheEinheit } from "../../../server/lib/branchen.mjs";
import * as SP from "../../speicher.js";
import { anwenden as tarifAnwenden, tarifwerk } from "../../tarifwerke.js";
import { heute } from "../../lib/datum.js";
import { fristen as loeschFristen, fristWert } from "../../aufbewahrung.js";
import { uid } from "../../lib/format.js";
import { PALETTE } from "../../lib/fachlogik.js";
import { einheitAm, imDienst } from "../../../server/lib/fachpruefung.mjs";
import { MATRIX_STD, FESTE_RECHTE } from "../../lib/rollen.js";
import { nameGueltig } from "../../../server/lib/rollenvergabe.mjs";

export function aktionenBetrieb(k) {
  const { mUpd, melde, ref, sitz } = k;
  return {
      /* --- Betrieb --- */
      setzeFeld: (k, v) => mUpd((m) => ({ ...m, [k]: v }), null),
      setzeBranche: (b) => mUpd((m) => ({ ...m, branche: b, einheitLabel: brancheEinheit(b) }),
        "Branche gewechselt"),
      setzeEinstellung: (k, v) => mUpd((m) => ({ ...m, einstellungen: { ...m.einstellungen, [k]: v } }), null),
      /* WP-19.0: Ausnahmeweg Art. 16/17/18 — Änderung lokal, die Angabe einmalig beim Speichern (speicher.js). */
      moduldatenAusnahme: (angabe, aendern, erkennt) => { if (!sitz || !sitz.mandant) return; SP.ausnahmeMitschicken(sitz.mandant.id, angabe, erkennt); mUpd(aendern, null); },
      /* Aufbewahrungsfristen liegen je Betrieb, nicht in den Einstellungen —
         sie gehören zum Löschkonzept, nicht zum Regelwerk. */
      /* Direkt in ein Kapitel springen — die Tour öffnet sich dort. */
      tourAbKapitel: (index) => mUpd((m) => ({ ...m,
        personen: m.personen.map((p) => (p.id === sitz.person.id
          ? { ...p, tour: { ...(p.tour || {}), offen: true, schritt: index, fertig: false } }
          : p)) }), null),
      tarifwerkAnwenden: (id) => {
        const s2 = ref.current;
        const m0 = s2.mandanten.find((x) => x.id === s2.session.mandantId);
        const vor = tarifAnwenden(m0, id, heute());
        if (!vor.geaendert.length) return melde("Es ändert sich nichts.");
        if (!window.confirm(
          `${vor.geaendert.length} Werte im Regelwerk werden gesetzt. `
          + "Personal, Dienstarten und Einheiten bleiben unberührt.\n\n"
          + "Bereits gerechnete Stunden ändern sich rückwirkend, weil Nachtfenster "
          + "und Wochenarbeitszeit in jede Auswertung eingehen.")) return;
        mUpd((m) => tarifAnwenden(m, id, heute()).mandant,
          `Tarifwerk angewendet: ${(tarifwerk(id) || {}).name || id}`);
        melde(`${(tarifwerk(id) || {}).name || id} angewendet.`);
      },
      setzeAufbewahrung: (k, v) => mUpd((m) => ({ ...m,
        aufbewahrung: { ...loeschFristen(m), [k]: fristWert(v) } }), null),
      setzeEinheit: (id, k, v) => mUpd((m) => ({ ...m, einheiten: m.einheiten.map((e) => e.id === id ? { ...e, [k]: v } : e) }), null),
      neueEinheit: () => mUpd((m) => ({ ...m, einheiten: [...m.einheiten, { id: uid("e"),
        name: `${m.einheitLabel} ${m.einheiten.length + 1}`, versatz: m.einheiten.length % m.zyklus.wochen,
        farbe: PALETTE[m.einheiten.length % PALETTE.length] }] }), "Einheit angelegt"),
      loescheEinheit: (id) => mUpd((m) => {
        const n = m.personen.filter((p) => einheitAm(p, heute()) === id && imDienst(p, heute())).length;
        if (n) { melde(`Der Einheit sind noch ${n} Personen zugeordnet.`); return m; }
        return { ...m, einheiten: m.einheiten.filter((e) => e.id !== id) };
      }, "Einheit gelöscht"),
      neueQual: () => mUpd((m) => ({ ...m, qualifikationen: [...m.qualifikationen,
        { id: uid("q"), name: "Neue Qualifikation", kurz: "NEU", farbe: PALETTE[m.qualifikationen.length % PALETTE.length] }] }), "Qualifikation angelegt"),
      setzeQual: (id, k, v) => mUpd((m) => ({ ...m, qualifikationen: m.qualifikationen.map((q) => q.id === id ? { ...q, [k]: v } : q) }), null),
      loescheQual: (id) => mUpd((m) => ({ ...m, qualifikationen: m.qualifikationen.filter((q) => q.id !== id),
        personen: m.personen.map((p) => ({ ...p, qualifikationen: p.qualifikationen.filter((x) => x !== id) })),
        dienstarten: m.dienstarten.map((d) => { const mq = { ...d.mindestQual }; delete mq[id]; return { ...d, mindestQual: mq }; }) }), "Qualifikation gelöscht"),
      /* RB-1: feste Rechte (plan.publish) schaltet die betriebseigene Tabelle nicht um. */
      toggleRecht: (r, recht) => FESTE_RECHTE.includes(recht) ? undefined : mUpd((m) => {
        /* Ohne eigene Matrix gilt die Vorgabe — der erste Klick macht sie
           zur betrieblichen Matrix, statt auf undefined zu greifen. */
        const basis = m.matrix || JSON.parse(JSON.stringify(MATRIX_STD));
        const cur = basis[r] || [];
        return { ...m, matrix: { ...basis, [r]: cur.includes(recht) ? cur.filter((x) => x !== recht) : [...cur, recht] } };
      }, "Rechtematrix geändert"),
      matrixZuruecksetzen: () => mUpd((m) => ({ ...m, matrix: JSON.parse(JSON.stringify(MATRIX_STD)) }), "Rechtematrix zurückgesetzt"),

      /* --------------------- Eigene Rollenbezeichnungen ----------------
         Nur die Anzeige. Ein leerer Name setzt auf die Vorgabe zurück,
         statt eine leere Marke im Plan stehen zu lassen.                 */
      setzeRollenname: (id, name) => mUpd((m) => {
        const urteil = nameGueltig(name);
        if (!urteil.ok) { melde(urteil.grund); return m; }
        const alt = { ...(m.rollennamen || {}) };
        if (urteil.wert) alt[id] = urteil.wert; else delete alt[id];
        return { ...m, rollennamen: alt };
      }, "Rollenbezeichnung geändert"),
      rollennamenZuruecksetzen: () => mUpd((m) => {
        const ohne = { ...m };
        delete ohne.rollennamen;
        return ohne;
      }, "Rollenbezeichnungen auf Vorgabe zurückgesetzt"),

  };
}

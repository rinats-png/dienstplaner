/* ==========================================================================
   POSTEN — Postenwechsel innerhalb eines Dienstes (WP-19.1, W1–W13)

   Kein JSX (createElement, wie posten-pflege.js): zählt nicht zu den
   Ansichtsdateien des V4-Inventars; posten.jsx und kern.jsx bleiben
   unverändert. Eingehängt mit einer Zeile in PostenErgaenzung.

   PostenWechsel  zeigt je Person im Dienst die Abschnitte („Pforte bis 10:00,
                  Streife ab 10:00“) und meldet nicht bewertbare Wechsel
                  sichtbar (role="alert", W5). Mit Schreibweg (Leitung,
                  Planung; postenSchreibeVon) je eingeteilter Person: Uhrzeit
                  und Posten wählen → „Wechsel hinzufügen“, je Wechsel
                  „entfernen“. Native Felder, also per Tastatur bedienbar;
                  Zeilen umbrechen (360 px ohne Querscrollen). Der Server prüft
                  jeden Schreibweg (Form, bekannte Posten, Rolle).
   ========================================================================== */
import { createElement as h, useState } from "react";
import { postenAbschnitte, postenZeitraeume, dienstFenster, postenIndex, wechselSetzen, wechselEntfernen } from "../../server/lib/modul-posten.mjs";

const RAHMEN = { border: "1px solid currentColor", borderRadius: "var(--v4-r-klein)", padding: 12, overflowWrap: "anywhere" };
const ZEILE = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const EINGABE = { maxWidth: "100%", boxSizing: "border-box" };

const personName = (p) => `${(p && p.vorname) || ""} ${(p && p.nachname) || ""}`.trim() || "?";
const uhr = (n) => { const x = ((n % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

/**
 * Abschnitte einer Einteilung in Worten, oder null, wenn sie sich dem Dienst nicht zuordnen lassen (W5).
 * @param {any} wert @param {any} dienst @param {Map<string, any>} ix
 * @returns {string[] | null}
 */
export function wechselZeilen(wert, dienst, ix) {
  const z = postenZeitraeume(wert, dienst);
  const f = dienstFenster(dienst);
  if (!z || !f) return null;
  const name = (id) => { const e = ix.get(id); return e ? `${e.objekt.name}: ${e.posten.name}` : "unbekannter Posten"; };
  return z.map((s) => `${name(s.posten)} von ${uhr(f.start + s.von)} bis ${uhr(f.start + s.bis)} Uhr`);
}

/** @param {{ m: any, datum: string, dienstId: string, personenImDienst: any[], schreibe: ((feld: string, wert: any) => void) | null }} props */
export function PostenWechsel({ m, datum, dienstId, personenImDienst, schreibe }) {
  const [eingabe, setEingabe] = useState(/** @type {Record<string, { ab: string, posten: string }>} */ ({}));
  const [fehler, setFehler] = useState("");
  const personen = Array.isArray(personenImDienst) ? personenImDienst : [];
  const ix = postenIndex(m);
  const plan = m && m.postenPlan && typeof m.postenPlan === "object" ? m.postenPlan : {};
  const dienst = (Array.isArray(m && m.dienstarten) ? m.dienstarten : []).find((d) => d && d.id === dienstId) || null;
  const eingeteilt = personen.filter((p) => plan[`${p.id}|${datum}`] !== undefined);
  const mitWechsel = eingeteilt.filter((p) => Array.isArray(plan[`${p.id}|${datum}`]));
  if (!ix.size || (!mitWechsel.length && !(schreibe && eingeteilt.length))) return null;
  const alle = [...ix.values()];
  const ergebnis = (r) => {
    if ("grund" in r) { setFehler(r.grund); return; }
    setFehler("");
    if (schreibe) schreibe("postenPlan", r.plan);
  };
  return h("section", { "aria-label": `Postenwechsel am ${datum}`, style: { ...RAHMEN, display: "grid", gap: 8 } },
    h("h3", { style: { margin: 0, fontSize: 15 } }, `Postenwechsel am ${datum}`),
    (schreibe ? eingeteilt : mitWechsel).map((p) => {
      const wert = plan[`${p.id}|${datum}`];
      const abschnitte = postenAbschnitte(wert);
      const zeilen = Array.isArray(wert) ? wechselZeilen(wert, dienst, ix) : null;
      const e = eingabe[p.id] || { ab: "", posten: "" };
      const setze = (patch) => setEingabe({ ...eingabe, [p.id]: { ...e, ...patch } });
      return h("div", { key: p.id, style: { display: "grid", gap: 4 } },
        h("strong", null, personName(p)),
        Array.isArray(wert) && !zeilen && h("p", { role: "alert", style: { margin: 0 } },
          `Postenwechsel von ${personName(p)} passt nicht zu den Zeiten des Dienstes — nicht bewertbar, zählt auf keinem Posten.`),
        zeilen && h("ul", { style: { margin: 0, paddingLeft: 18 } }, zeilen.map((z) => h("li", { key: z }, z))),
        schreibe && abschnitte && abschnitte.slice(1).map((a) => h("div", { key: `w${a.ab}` },
          h("button", { type: "button", onClick: () => ergebnis(wechselEntfernen(m, p.id, datum, /** @type {string} */ (a.ab))) },
            `Wechsel ab ${a.ab} Uhr entfernen (${personName(p)})`))),
        schreibe && abschnitte && h("div", { style: ZEILE },
          h("label", { style: ZEILE }, "Wechsel ab",
            h("input", { type: "time", value: e.ab, style: EINGABE, "aria-label": `Wechsel ab (Uhrzeit) für ${personName(p)}`,
              onChange: (ev) => setze({ ab: ev.target.value }) })),
          h("label", { style: ZEILE }, "auf",
            h("select", { value: e.posten, style: EINGABE, "aria-label": `Neuer Posten für ${personName(p)}`, onChange: (ev) => setze({ posten: ev.target.value }) },
              h("option", { value: "" }, "— Posten wählen —"),
              alle.map((x) => h("option", { key: x.posten.id, value: x.posten.id }, `${x.objekt.name}: ${x.posten.name}`)))),
          h("button", { type: "button", disabled: !e.ab || !e.posten,
            onClick: () => ergebnis(wechselSetzen(m, p.id, datum, e.ab, e.posten, dienst)) }, "Wechsel hinzufügen")));
    }),
    fehler && h("p", { role: "alert", style: { margin: 0 } }, fehler));
}

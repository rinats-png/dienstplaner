/* ==========================================================================
   BEREICHSPLAN — Zuordnung und Pflege der Bereiche (WP-19.4, Pflege)

   Kein JSX (createElement, wie posten-pflege.js): bereichsplan.jsx und die
   Übersicht bleiben, wie sie sind (V4-Pins). Form nur über das Token
   var(--v4-r-klein); keine Farb- oder Formliteralwerte.

   BereichsZuordnung  Auswahlfeld je Person im Dienst — Leitung und Planung
                      für jede Einheit, die Schichtverantwortung nur in der
                      eigenen Einheit (der Server prüft jeden Schreibweg und
                      entscheidet; die Ansicht zeigt nur, was er annimmt).
                      Beschäftigte und Betriebsrat sehen kein Feld.
   BereichsPflege     Bereiche der gewählten Einheit pflegen (Name, Soll je
                      Dienstart). Nur Leitung und Planung. Gearbeitet wird an
                      einem Entwurf; erst „Änderungen übernehmen" schreibt, und
                      nur wenn pruefeBereiche nichts beanstandet.
   bereichsSchreibeVon  Der Schreibweg aus dem Kontext: nur die Felder
                      einheiten (nur mit Pflegerecht) und bereichsPlan.
   BereichsProtokoll  Änderungsprotokoll der Zuordnungen in der Einheit
                      (Schichtverantwortung, seit E1 auch Leitung und Planung;
                      Modulprotokoll, nur lesend) — nur Leitung und Planung.
   ========================================================================== */
import { createElement as h, useState, Fragment } from "react";
import {
  pruefeBereiche, zuordnungSetzen, bereichHinzufuegen, bereichAendern, bereichSollSetzen, bereichEntfernen, BEREICH_GRENZEN, BEREICH_PROTOKOLL_ART,
} from "../../server/lib/modul-bereichsplan.mjs";

const RAHMEN = { border: "1px solid currentColor", borderRadius: "var(--v4-r-klein)", padding: 12, overflowWrap: "anywhere" };
const FELD = { display: "grid", gap: 4, maxWidth: "100%" };
const EINGABE = { maxWidth: "100%", boxSizing: "border-box", width: "100%" };
const ZEILE = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

const personName = (p) => `${(p && p.vorname) || ""} ${(p && p.nachname) || ""}`.trim() || "?";
const knopf = (text, onClick, extra = {}) => h("button", { type: "button", onClick, ...extra }, text);
const einheitVon = (m, einheitId) => (Array.isArray(m && m.einheiten) ? m.einheiten : []).find((e) => e && String(e.id) === String(einheitId));

/**
 * Der Schreibweg aus dem Kontext der Moduloberflächen (kern.jsx): nur mit Recht der Rolle (bereichSchreiben:
 * "voll" = Leitung und Planung, "einheit" = Schichtverantwortung) und einem Aktionsobjekt; sonst null.
 * Die Pflege der Bereiche (einheiten) bleibt Leitung und Planung vorbehalten.
 * @param {any} k
 * @returns {((feld: string, wert: any) => void) | null}
 */
export function bereichsSchreibeVon(k) {
  const akt = k && k.akt;
  const recht = k && k.bereichSchreiben;
  if (!k || (recht !== "voll" && recht !== "einheit") || !akt || typeof akt.setzeFeld !== "function") return null;
  return (feld, wert) => {
    if (feld === "bereichsPlan" || (feld === "einheiten" && recht === "voll")) akt.setzeFeld(feld, wert);
  };
}

/** Darf die Rolle in dieser Einheit zuordnen? Leitung und Planung ja, die Schichtverantwortung nur in der eigenen Einheit. */
export function darfZuordnen(k, einheitId) {
  if (!k) return false;
  if (k.bereichSchreiben === "voll") return true;
  return k.bereichSchreiben === "einheit" && typeof k.eigeneEinheit === "string" && k.eigeneEinheit !== "" && String(k.eigeneEinheit) === String(einheitId);
}

/** @param {{ m: any, einheitId: any, datum: string, personenImDienst: any[], schreibe: ((feld: string, wert: any) => void) | null }} props */
export function BereichsZuordnung({ m, einheitId, datum, personenImDienst, schreibe }) {
  const [fehler, setFehler] = useState("");
  const personen = Array.isArray(personenImDienst) ? personenImDienst : [];
  const einheit = einheitVon(m, einheitId);
  const bereiche = einheit && Array.isArray(einheit.bereiche) ? einheit.bereiche.filter((b) => b && b.id) : [];
  if (!schreibe || !personen.length || !bereiche.length) return null;
  const plan = m && m.bereichsPlan && typeof m.bereichsPlan === "object" ? m.bereichsPlan : {};
  const waehle = (person, wert) => {
    const r = zuordnungSetzen(m, person.id, datum, wert, einheitId);
    if ("grund" in r) { setFehler(r.grund); return; }
    setFehler("");
    schreibe("bereichsPlan", r.plan);
  };
  return h("div", { style: { ...RAHMEN, display: "grid", gap: 8 } },
    h("h3", { style: { margin: 0, fontSize: 15 } }, `Zuordnung am ${datum}`),
    personen.map((p) => {
      const aktuell = plan[`${p.id}|${datum}`];
      const bekannt = bereiche.some((b) => b.id === aktuell);
      return h("label", { key: p.id, style: FELD }, personName(p),
        h("select", { "aria-label": `Bereich für ${personName(p)} am ${datum}`, style: EINGABE,
          value: aktuell === undefined ? "" : aktuell, onChange: (e) => waehle(p, e.target.value) },
        h("option", { value: "" }, "— nicht zugeordnet —"),
        aktuell !== undefined && !bekannt && h("option", { value: aktuell }, "anderer Bereich"),
        bereiche.map((b) => h("option", { key: b.id, value: b.id }, b.name))));
    }),
    fehler && h("p", { role: "alert", style: { margin: 0 } }, fehler));
}

/** @param {{ m: any, einheitId: any, schreibe: ((feld: string, wert: any) => void) | null }} props */
export function BereichsPflege({ m, einheitId, schreibe }) {
  const gespeichert = Array.isArray(m && m.einheiten) ? m.einheiten : [];
  const [entwurf, setEntwurf] = useState(gespeichert);
  const [meldung, setMeldung] = useState("");
  if (!schreibe) return h("p", null, "Die Bereiche einer Einheit pflegt die Leitung oder die Planung.");
  const einheit = einheitVon({ einheiten: entwurf }, einheitId);
  if (!einheit) return null;
  const dienstarten = (Array.isArray(m.dienstarten) ? m.dienstarten : []).filter((d) => d && d.id);
  const bereiche = Array.isArray(einheit.bereiche) ? einheit.bereiche : [];
  const fehler = pruefeBereiche(entwurf);
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(gespeichert);
  /* Entfernen prüft gegen den gespeicherten Bereichsplan: ein zugeordneter Bereich bleibt, bis die Zuordnung gelöst ist. */
  const stand = { einheiten: entwurf, bereichsPlan: m.bereichsPlan };
  const entferne = (bid) => { const r = bereichEntfernen(stand, bid); if ("grund" in r) setMeldung(r.grund); else { setMeldung(""); setEntwurf(r.einheiten); } };
  return h("section", { "aria-label": "Bereiche pflegen", style: { display: "grid", gap: 10, maxWidth: "100%" } },
    h("p", { style: { margin: 0 } }, "Bereiche dieser Einheit mit Soll je Dienstart. Die Zuordnung der Personen steht oben im Tagesbereich. Fehlende Besetzung ist ein Hinweis, keine Sperre."),
    bereiche.map((b) => h("fieldset", { key: b.id, style: { ...RAHMEN, display: "grid", gap: 8, margin: 0 } },
      h("legend", null, `Bereich ${b.name}`),
      h("label", { style: FELD }, "Name des Bereichs",
        h("input", { value: b.name, maxLength: BEREICH_GRENZEN.textMax, style: EINGABE,
          onChange: (e) => setEntwurf(bereichAendern(entwurf, einheitId, b.id, { name: e.target.value })) })),
      dienstarten.map((d) => h("label", { key: d.id, style: FELD }, `Soll im Dienst ${d.name || d.id}`,
        h("input", { type: "number", min: 0, max: BEREICH_GRENZEN.sollMax, step: 1, style: EINGABE,
          value: b.soll && b.soll[d.id] !== undefined ? b.soll[d.id] : "",
          onChange: (e) => setEntwurf(bereichAendern(entwurf, einheitId, b.id, { soll: bereichSollSetzen(b.soll, d.id, e.target.value === "" ? undefined : Number(e.target.value)) })) }))),
      h("div", null, knopf(`Bereich ${b.name} entfernen`, () => entferne(b.id))))),
    h("div", { style: ZEILE }, knopf("Bereich hinzufügen", () => setEntwurf(bereichHinzufuegen(entwurf, einheitId, "", m.bereichsPlan)))),
    (meldung || fehler) && h("p", { role: "alert", style: { margin: 0 } }, fehler || meldung),
    h("div", { style: ZEILE },
      knopf("Änderungen übernehmen", () => { schreibe("einheiten", entwurf); setMeldung("Übernommen — wird gespeichert."); }, { disabled: !geaendert || !!fehler }),
      knopf("Verwerfen", () => { setEntwurf(gespeichert); setMeldung(""); }, { disabled: !geaendert })));
}

/** Höchstens so viele Einträge zeigt die Liste (die jüngsten zuerst). */
export const PROTOKOLL_ANZEIGE = 20;

/** Rolle eines Eintrags in Worten (E1: Einträge ohne `rolle` stammen von der Schichtverantwortung). */
const ROLLE_WORT = Object.freeze({ leitung: "Leitung", planung: "Planung", kunde: "Kundenrolle" });
const rolleWort = (x) => (!x || x.rolle === undefined ? "Schichtverantwortung"
  : Object.prototype.hasOwnProperty.call(ROLLE_WORT, x.rolle) ? ROLLE_WORT[x.rolle] : "volles Schreibrecht");

/**
 * Änderungsprotokoll der Zuordnungen für eine Einheit (WP-19.4, B2 b; seit E1 auch Leitung und Planung) — nur lesend, nur Leitung und
 * Planung (der Server liefert das Modulprotokoll keiner anderen Rolle mit Zuordnungen aus). Wer (mit Rolle), wann, Person, Tag, Bereich
 * vorher → nachher; ein verdichteter Eintrag nur mit der Anzahl. Einträge von Leitung/Planung über mehrere Einheiten (einheit null)
 * erscheinen in jeder Einheit.
 * @param {{ m: any, einheitId: any }} props
 */
export function BereichsProtokoll({ m, einheitId }) {
  const e = m && m.einstellungen && typeof m.einstellungen === "object" ? m.einstellungen : {};
  const eintraege = (Array.isArray(e.modulprotokoll) ? e.modulprotokoll : [])
    .filter((x) => x && x.art === BEREICH_PROTOKOLL_ART && (Array.isArray(x.zuordnungen) || x.verdichtet === true)
      && (String(x.einheit) === String(einheitId) || (x.rolle !== undefined && (x.einheit === null || x.einheit === undefined))))
    .slice(-PROTOKOLL_ANZEIGE).reverse();
  const personen = new Map((Array.isArray(m && m.personen) ? m.personen : []).filter(Boolean).map((p) => [String(p.id), p]));
  const bereiche = new Map((Array.isArray(m && m.einheiten) ? m.einheiten : []).flatMap((x) => (x && Array.isArray(x.bereiche) ? x.bereiche : []))
    .filter((b) => b && b.id).map((b) => [b.id, b.name]));
  const wer = (id) => (id === null || id === undefined ? "ohne Personenbezug" : personen.has(String(id)) ? personName(personen.get(String(id))) : "unbekannte Person");
  const bereich = (id) => (id === null || id === undefined ? "nicht zugeordnet" : bereiche.get(id) || "entfernter Bereich");
  const inhalt = (x) => (Array.isArray(x.zuordnungen)
    ? x.zuordnungen.map((z) => `${wer(z.person)} am ${z.tag}: ${bereich(z.vorher)} → ${bereich(z.nachher)}`).join("; ")
    : `${Number.isInteger(x.anzahl) ? x.anzahl : "?"} Zuordnungen geändert (zusammengefasst, ohne Einzelangaben)`);
  return h("section", { "aria-label": "Änderungsprotokoll der Zuordnungen", style: { ...RAHMEN, display: "grid", gap: 6 } },
    h("h3", { style: { margin: 0, fontSize: 15 } }, "Änderungsprotokoll der Zuordnungen"),
    !eintraege.length ? h("p", { style: { margin: 0 } }, "Keine Änderungen der Zuordnungen in dieser Einheit.")
      : h("ul", { style: { margin: 0, paddingLeft: 18, display: "grid", gap: 4 } }, eintraege.map((x, i) => h("li", { key: `${x.am}-${i}` },
        `${String(x.am || "").slice(0, 16).replace("T", " ")} · ${wer(x.von)} (${rolleWort(x)}`
          + `${x.rolle !== undefined && (x.einheit === null || x.einheit === undefined) ? ", mehrere oder keine Einheit" : ""}): `,
        inhalt(x)))));
}

/** Die Oberfläche des Moduls am Ort „tag": Zuordnung und Pflege, unter der Übersicht (index.js). */
export function BereichsErgaenzung({ k }) {
  const schreibe = bereichsSchreibeVon(k);
  const zuordnen = schreibe && darfZuordnen(k, k.einheitId) ? schreibe : null;
  const pflegen = k.bereichSchreiben === "voll" ? schreibe : null;
  return h(Fragment, null,
    h(BereichsZuordnung, { m: k.m, einheitId: k.einheitId, datum: k.datum, personenImDienst: k.personenImDienst, schreibe: zuordnen }),
    pflegen && h(BereichsPflege, { key: String(k.einheitId), m: k.m, einheitId: k.einheitId, schreibe: pflegen }),
    pflegen && h(BereichsProtokoll, { m: k.m, einheitId: k.einheitId }));
}

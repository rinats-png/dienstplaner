/* ==========================================================================
   POSTEN — Alleinarbeit, Einteilung und Pflege (WP-19.1)

   Kein JSX (createElement, wie index.js): Die Datei zählt nicht zu den 13
   Ansichtsdateien der Hauptansicht „Branchenmodule" (V4-Inventar), und
   posten.jsx und die Übersicht bleiben, wie sie sind. Form nur über das Token
   var(--v4-r-klein); keine Farb- oder Formliteralwerte.

   PostenHinweise  Alleinarbeit bei Einzelbesetzung (ohne Namen, ohne Zusage
                   eines Notsignals).
   PostenEinteilung Auswahlfeld je Person im Dienst — nur mit Schreibweg
                   (Leitung, Planung; zugriff.js). Eine Einteilung verrät, wo
                   eine Person ist: Die Felder stehen nur dort, wo die Namen
                   ohnehin sichtbar sind; der Server prüft jeden Schreibweg.
   PostenPflege    Objekte und Posten pflegen (Name, Soll je Dienstart,
                   Qualifikationen, Alleinarbeit), Posten-Dienstarten des
                   Bestands als Vorschlag. Gearbeitet wird an einem Entwurf;
                   erst „Änderungen übernehmen" schreibt, und nur wenn
                   pruefeObjekte nichts beanstandet.
   postenSchreibeVon  der Schreibweg aus dem Kontext: nur für Leitung und
                   Planung, nur die Felder objekte und postenPlan.
   ========================================================================== */
import { createElement as h, useState, Fragment } from "react";
import {
  postenLage, pruefeObjekte, einteilungSetzen, objektHinzufuegen, postenHinzufuegen, postenAendern, sollSetzen,
  objektEntfernen, postenEntfernen, objekteAusDienstarten, postenIndex, postenAbschnitte, POSTEN_GRENZEN,
} from "../../server/lib/modul-posten.mjs";
import { PostenWechsel } from "./posten-wechsel.js";

const RAHMEN = { border: "1px solid currentColor", borderRadius: "var(--v4-r-klein)", padding: 12, overflowWrap: "anywhere" };
const FELD = { display: "grid", gap: 4, maxWidth: "100%" };
const EINGABE = { maxWidth: "100%", boxSizing: "border-box", width: "100%" };
const ZEILE = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

const personName = (p) => `${(p && p.vorname) || ""} ${(p && p.nachname) || ""}`.trim() || "?";
const knopf = (text, onClick, extra = {}) => h("button", { type: "button", onClick, ...extra }, text);

/**
 * Der Schreibweg der Posten-Oberfläche aus dem Kontext der Moduloberflächen (kern.jsx):
 * nur mit Recht der Rolle (postenSchreiben) und einem Aktionsobjekt; sonst null.
 * @param {any} k
 * @returns {((feld: string, wert: any) => void) | null}
 */
export function postenSchreibeVon(k) {
  const akt = k && k.akt;
  if (!k || k.postenSchreiben !== true || !akt || typeof akt.setzeFeld !== "function") return null;
  return (feld, wert) => { if (feld === "objekte" || feld === "postenPlan") akt.setzeFeld(feld, wert); };
}

/** @param {{ m: any, datum: string, dienstId: string, personenImDienst: any[] }} props */
export function PostenHinweise({ m, datum, dienstId, personenImDienst }) {
  const hinweise = postenLage(m, datum, dienstId, personenImDienst).filter((x) => x.alleinarbeitHinweis);
  if (!hinweise.length) return null;
  return h("ul", { "aria-label": "Alleinarbeit", style: { margin: 0, paddingLeft: 18 } },
    hinweise.map((x) => h("li", { key: x.posten, role: "note" }, h("strong", null, `${x.objekt}, ${x.name}: `), x.alleinarbeitHinweis)));
}

/** @param {{ m: any, datum: string, personenImDienst: any[], schreibe: ((feld: string, wert: any) => void) | null }} props */
export function PostenEinteilung({ m, datum, personenImDienst, schreibe }) {
  const [fehler, setFehler] = useState("");
  const personen = Array.isArray(personenImDienst) ? personenImDienst : [];
  if (!schreibe || !personen.length || !postenIndex(m).size) return null;
  const alle = [...postenIndex(m).values()];
  const plan = m && m.postenPlan && typeof m.postenPlan === "object" ? m.postenPlan : {};
  const waehle = (person, wert) => {
    const r = einteilungSetzen(m, person.id, datum, wert);
    if ("grund" in r) { setFehler(r.grund); return; }
    setFehler("");
    schreibe("postenPlan", r.plan);
  };
  return h("div", { style: { ...RAHMEN, display: "grid", gap: 8 } },
    h("h3", { style: { margin: 0, fontSize: 15 } }, `Einteilung am ${datum}`),
    personen.map((p) => {
      /* Mit Postenwechsel zeigt die Auswahl den Anfangsposten (posten-wechsel.js zeigt und ändert die Wechsel). */
      const roh = plan[`${p.id}|${datum}`];
      const aktuell = Array.isArray(roh) ? (postenAbschnitte(roh) || [{ posten: "(nicht lesbar)" }])[0].posten : roh;
      const bekannt = alle.some((e) => e.posten.id === aktuell);
      return h("label", { key: p.id, style: FELD }, personName(p),
        h("select", { "aria-label": `Posten für ${personName(p)} am ${datum}`, style: EINGABE,
          value: aktuell === undefined ? "" : aktuell, onChange: (e) => waehle(p, e.target.value) },
        h("option", { value: "" }, "— kein Posten —"),
        aktuell !== undefined && !bekannt && h("option", { value: aktuell }, "unbekannter Posten"),
        alle.map((e) => h("option", { key: e.posten.id, value: e.posten.id }, `${e.objekt.name}: ${e.posten.name}`))));
    }),
    fehler && h("p", { role: "alert", style: { margin: 0 } }, fehler));
}

function PostenFeld({ objekt, posten, dienstarten, qualifikationen, setze, entferne }) {
  const quals = Array.isArray(posten.qualifikationen) ? posten.qualifikationen : [];
  return h("fieldset", { style: { ...RAHMEN, display: "grid", gap: 8, margin: 0 } },
    h("legend", null, `Posten ${posten.name}`),
    h("label", { style: FELD }, "Name des Postens",
      h("input", { value: posten.name, maxLength: POSTEN_GRENZEN.textMax, style: EINGABE, onChange: (e) => setze({ name: e.target.value }) })),
    dienstarten.map((d) => h("label", { key: d.id, style: FELD }, `Soll im Dienst ${d.name || d.id}`,
      h("input", { type: "number", min: 0, max: POSTEN_GRENZEN.sollMax, step: 1, style: EINGABE,
        value: posten.soll && posten.soll[d.id] !== undefined ? posten.soll[d.id] : "",
        onChange: (e) => setze({ soll: sollSetzen(posten.soll, d.id, e.target.value === "" ? undefined : Number(e.target.value)) }) }))),
    qualifikationen.length > 0 && h("fieldset", { style: { margin: 0, display: "grid", gap: 4 } },
      h("legend", null, "Verlangte Qualifikationen"),
      qualifikationen.map((q) => h("label", { key: q.id, style: ZEILE },
        h("input", { type: "checkbox", checked: quals.includes(q.id),
          onChange: (e) => setze({ qualifikationen: e.target.checked ? [...quals, q.id] : quals.filter((x) => x !== q.id) }) }),
        h("span", null, q.name || q.id)))),
    h("label", { style: ZEILE },
      h("input", { type: "checkbox", checked: posten.alleinarbeit === true, onChange: (e) => setze({ alleinarbeit: e.target.checked }) }),
      h("span", null, "Alleinarbeitsposten (eine Person allein)")),
    posten.alleinarbeit === true && h("label", { style: FELD }, "Verweis auf die Gefährdungsbeurteilung (Dokument oder Nummer, keine Namen)",
      h("input", { value: posten.gefaehrdungsbeurteilung || "", maxLength: POSTEN_GRENZEN.textMax, style: EINGABE,
        onChange: (e) => setze({ gefaehrdungsbeurteilung: e.target.value }) })),
    h("div", null, knopf(`Posten ${posten.name} entfernen`, () => entferne(objekt.id, posten.id))));
}

/** @param {{ m: any, schreibe: ((feld: string, wert: any) => void) | null }} props */
export function PostenPflege({ m, schreibe }) {
  const gespeichert = Array.isArray(m && m.objekte) ? m.objekte : [];
  const [entwurf, setEntwurf] = useState(gespeichert);
  const [meldung, setMeldung] = useState("");
  if (!schreibe) return h("p", null, "Objekte und Posten pflegt die Leitung oder die Planung.");
  const dienstarten = (Array.isArray(m.dienstarten) ? m.dienstarten : []).filter((d) => d && d.id && !d.posten);
  const qualifikationen = (Array.isArray(m.qualifikationen) ? m.qualifikationen : []).filter((q) => q && q.id);
  const fehler = pruefeObjekte(entwurf);
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(gespeichert);
  /* Entfernen prüft gegen den gespeicherten Postenplan: ein eingeteilter Posten bleibt, bis die Einteilung gelöst ist. */
  const stand = { objekte: entwurf, postenPlan: m.postenPlan };
  const ersetze = (r) => { if ("grund" in r) setMeldung(r.grund); else { setMeldung(""); setEntwurf(r.objekte); } };
  return h("section", { "aria-label": "Objekte und Posten pflegen", style: { display: "grid", gap: 10, maxWidth: "100%" } },
    h("p", { style: { margin: 0 } }, "Objekte und ihre Posten mit Soll je Dienstart. Die Einteilung der Personen auf Posten steht oben im Tagesbereich. Fehlende Besetzung oder Qualifikation sind Hinweise, keine Sperre."),
    entwurf.map((o) => h("article", { key: o.id, style: { ...RAHMEN, display: "grid", gap: 8 } },
      h("label", { style: FELD }, "Name des Objekts",
        h("input", { value: o.name, maxLength: POSTEN_GRENZEN.textMax, style: EINGABE,
          onChange: (e) => setEntwurf(entwurf.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x))) })),
      (o.posten || []).map((p) => h(PostenFeld, { key: p.id, objekt: o, posten: p, dienstarten, qualifikationen,
        setze: (patch) => setEntwurf(postenAendern(entwurf, o.id, p.id, patch)),
        entferne: (oid, pid) => ersetze(postenEntfernen(stand, pid)) })),
      h("div", { style: ZEILE },
        knopf("Posten hinzufügen", () => setEntwurf(postenHinzufuegen(entwurf, o.id, ""))),
        knopf(`Objekt ${o.name} entfernen`, () => ersetze(objektEntfernen(stand, o.id)))))),
    h("div", { style: ZEILE },
      knopf("Objekt hinzufügen", () => setEntwurf(objektHinzufuegen(entwurf, ""))),
      knopf("Aus den Posten-Dienstarten vorschlagen", () => {
        const r = objekteAusDienstarten({ dienstarten: m.dienstarten, objekte: entwurf });
        setEntwurf(r.objekte);
        setMeldung(r.neu ? `${r.neu} Posten aus den Posten-Dienstarten vorgeschlagen — bitte prüfen und übernehmen.` : "Keine neuen Posten-Dienstarten zum Übernehmen.");
      })),
    (meldung || fehler) && h("p", { role: "alert", style: { margin: 0 } }, fehler || meldung),
    h("div", { style: ZEILE },
      knopf("Änderungen übernehmen", () => { schreibe("objekte", entwurf); setMeldung("Übernommen — wird gespeichert."); }, { disabled: !geaendert || !!fehler }),
      knopf("Verwerfen", () => { setEntwurf(gespeichert); setMeldung(""); }, { disabled: !geaendert })));
}

/** Die eine Oberfläche des Moduls am Ort „tag": Hinweise, Einteilung, Pflege (index.js). */
export function PostenErgaenzung({ k }) {
  const schreibe = postenSchreibeVon(k);
  return h(Fragment, null,
    h(PostenHinweise, { m: k.m, datum: k.datum, dienstId: k.dienstId, personenImDienst: k.personenImDienst }),
    h(PostenEinteilung, { m: k.m, datum: k.datum, personenImDienst: k.personenImDienst, schreibe }),
    h(PostenWechsel, { m: k.m, datum: k.datum, dienstId: k.dienstId, personenImDienst: k.personenImDienst, schreibe: k.postenWechsel === true ? schreibe : null }),
    h(PostenPflege, { m: k.m, schreibe }));
}

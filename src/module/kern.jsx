/* ==========================================================================
   BRANCHENMODULE IN DER BETRIEBSVERWALTUNG (WP-19.0)

   Eine Komponente, an genau einer Stelle in App.jsx eingehängt (Betrieb,
   für Leitung und Planung):

     1. Aktivierung (G1, G2, G6): je Modul der ehrliche Stand — „in
        Vorbereitung" (geplant, nicht einschaltbar), nicht gebucht, aus, an.
        Schalten nur mit org.edit; bei Mitbestimmung nur mit Bestätigung und
        Grundlage. Wann und Wer setzt der Server; er prüft alles noch einmal
        (branchenmoduleZusammen) — diese Ansicht vertraut sich selbst nicht.
     2. Betriebliche Regelwerte (G4): Wert, Quelle, Fundstelle, Fassung,
        Gültigkeit, Prüfstatus, Stufe. Ungeprüftes steht als „ungeprüft — kein
        geltendes Recht", „Achtung" nur geprüft, nie „recht".
     3. Moduloberflächen (Einhängepunkte aus ./index.js): aktive Module, nach
        dem Abschalten nur lesend mit Export (G3).

   Gespeichert wird über akt.setzeEinstellung (der gewöhnliche Schreibweg).
   Keine festen Breiten (360 px ohne Querscrollen).
   ========================================================================== */
import { useState } from "react";
import { BRANCHENMODULE, modulEinstellung, modulZustand, modulNurLesen, MITBESTIMMUNG_HINWEIS, GRUNDLAGE_MAX,
  pruefeRegelwert } from "../../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN } from "../../server/lib/branchenkatalog.mjs";
import { oberflaechenFuer, hatModuldaten, moduldatenExport } from "./index.js";

const ZUSTAND = {
  "in-vorbereitung": "in Vorbereitung — noch nicht einschaltbar",
  "nicht-gebucht": "Paket nicht gebucht",
  aus: "aus",
  an: "an",
  "mitbestimmung-offen": "eingeschaltet, aber ohne Bestätigung der Mitbestimmung — wirkt nicht",
  "abhaengigkeit-fehlt": "eingeschaltet, wirkt aber nicht: ein benötigtes Modul ist aus",
  unbekannt: "unbekannt",
};
const datum = (iso) => (typeof iso === "string" && iso.length >= 10 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const heuteTag = () => new Date().toISOString().slice(0, 10);
const RAHMEN = { border: "1px solid currentColor", borderRadius: 8, padding: 12, overflowWrap: "anywhere", maxWidth: "100%" };
const FELD = { display: "grid", gap: 4, maxWidth: "100%" };
const EINGABE = { maxWidth: "100%", boxSizing: "border-box", width: "100%" };

function nameVon(m, id) {
  const p = (Array.isArray(m && m.personen) ? m.personen : []).find((x) => x && String(x.id) === String(id));
  return p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "";
}

function herunterladen(name, daten) {
  if (typeof document === "undefined" || typeof Blob === "undefined") return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bestätigung der Mitbestimmung (G6) und Einschalten. */
function MitbestimmungEinschalten({ mod, onEinschalten }) {
  const [bestaetigt, setBestaetigt] = useState(false);
  const [grundlage, setGrundlage] = useState("");
  const bereit = bestaetigt && grundlage.trim().length > 0;
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <p style={{ margin: 0 }}>{MITBESTIMMUNG_HINWEIS}</p>
      <label style={FELD}>Dokumentierte Grundlage (z. B. Betriebsvereinbarung, Datum, Abschnitt)
        <textarea value={grundlage} maxLength={GRUNDLAGE_MAX} rows={2} style={EINGABE}
          onChange={(e) => setGrundlage(e.target.value)} /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} />
        <span>Ich bestätige, dass die Voraussetzungen der Mitbestimmung für „{mod.name}“ geklärt sind.</span>
      </label>
      <div><button type="button" disabled={!bereit} onClick={() => onEinschalten({ bestaetigt: true, grundlage: grundlage.trim() })}>Einschalten</button></div>
    </div>);
}

/** Eine Zeile je Modul. */
function ModulZeile({ m, mod, liste, darfSchalten, darfExport, setze }) {
  const zustand = modulZustand(m, mod.id, liste);
  const e = modulEinstellung(m, mod.id);
  const nurLesen = modulNurLesen(m, mod.id, liste);
  const schaltbar = darfSchalten && !["in-vorbereitung", "nicht-gebucht", "unbekannt"].includes(zustand);
  const an = !!e && e.an === true;
  const b = e && e.mitbestimmung && typeof e.mitbestimmung === "object" ? e.mitbestimmung : null;
  return (
    <article style={RAHMEN} aria-label={mod.name}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{mod.name}</h3>
      <p style={{ margin: "4px 0 0" }}>Stand: <strong>{ZUSTAND[zustand]}</strong>
        {mod.mitbestimmung && " · mitbestimmungsrelevant (§ 87 Abs. 1 Nr. 6 BetrVG)"}</p>
      {mod.beschreibung && <p style={{ margin: "4px 0 0" }}>{mod.beschreibung}</p>}
      {e && e.geaendertAm && (
        <p style={{ margin: "4px 0 0" }}>Zuletzt geschaltet am {datum(e.geaendertAm)}{nameVon(m, e.geaendertVon) ? ` von ${nameVon(m, e.geaendertVon)}` : ""}.</p>)}
      {b && b.bestaetigtAm && (
        <p style={{ margin: "4px 0 0" }}>Mitbestimmung bestätigt am {datum(b.bestaetigtAm)}
          {nameVon(m, b.bestaetigtVon) ? ` von ${nameVon(m, b.bestaetigtVon)}` : ""}{b.grundlage ? ` · Grundlage: ${b.grundlage}` : ""}.</p>)}
      {nurLesen && (
        <p style={{ margin: "4px 0 0" }}>Ausgeschaltet: Die Daten des Moduls bleiben erhalten und sind nur lesbar; sie wirken nicht
          auf Planung und Prüfungen. Gelöscht wird nur nach den Aufbewahrungsfristen.</p>)}
      {nurLesen && darfExport && hatModuldaten(m, mod.id, liste) && (
        <div style={{ marginTop: 8 }}><button type="button"
          onClick={() => herunterladen(`${mod.id}-daten.json`, moduldatenExport(m, mod.id, liste))}>Daten exportieren (JSON)</button></div>)}
      {schaltbar && an && (
        <div style={{ marginTop: 8 }}><button type="button" onClick={() => setze(mod.id, { ...e, an: false })}>Ausschalten</button></div>)}
      {schaltbar && !an && mod.mitbestimmung && (
        <MitbestimmungEinschalten mod={mod} onEinschalten={(mitbestimmung) => setze(mod.id, { an: true, mitbestimmung })} />)}
      {schaltbar && !an && !mod.mitbestimmung && (
        <div style={{ marginTop: 8 }}><button type="button" onClick={() => setze(mod.id, { an: true })}>Einschalten</button></div>)}
    </article>);
}

/** Formular für einen betrieblichen Regelwert (nur org.edit). */
function RegelwertFormular({ regel, wert, onSpeichern, onEntfernen }) {
  const [f, setF] = useState(() => ({ quelle: "", fundstelle: "", version: "", gueltigAb: "", gueltigBis: "",
    pruefstatus: "provisional", stufe: "hinweis", ...(wert || {}) }));
  const feld = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sauber = { pruefstatus: f.pruefstatus, stufe: f.stufe,
    ...Object.fromEntries(["quelle", "fundstelle", "version"].filter((k) => f[k]).map((k) => [k, f[k]])),
    gueltigAb: f.gueltigAb || null, gueltigBis: f.gueltigBis || null };
  const fehler = pruefeRegelwert(regel.id, sauber);
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {[["quelle", "Quelle"], ["fundstelle", "Fundstelle"], ["version", "Fassung"]].map(([k, t]) => (
        <label key={k} style={FELD}>{t}<input value={f[k] || ""} onChange={feld(k)} style={EINGABE} /></label>))}
      <label style={FELD}>Gültig ab<input type="date" value={f.gueltigAb || ""} onChange={feld("gueltigAb")} style={EINGABE} /></label>
      <label style={FELD}>Gültig bis<input type="date" value={f.gueltigBis || ""} onChange={feld("gueltigBis")} style={EINGABE} /></label>
      <label style={FELD}>Prüfstatus<select value={f.pruefstatus} onChange={feld("pruefstatus")}>
        <option value="provisional">ungeprüft</option><option value="verified">Quelle geprüft</option></select></label>
      <label style={FELD}>Stufe<select value={f.stufe} onChange={feld("stufe")}>
        <option value="hinweis">Hinweis</option><option value="achtung">Achtung (nur geprüft)</option></select></label>
      {fehler && <p role="alert" style={{ margin: 0 }}>{fehler}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={!!fehler} onClick={() => onSpeichern(sauber)}>Regelwert speichern</button>
        {wert && <button type="button" onClick={onEntfernen}>Regelwert entfernen</button>}
      </div>
    </div>);
}

function RegelwertZeile({ m, regel, darfSchalten, setzeRegelwert }) {
  const [offen, setOffen] = useState(false);
  const rw = m && m.einstellungen && m.einstellungen.regelwerte ? m.einstellungen.regelwerte[regel.id] : null;
  const geprueft = rw && rw.pruefstatus === "verified" && rw.geprueftAm;
  return (
    <li style={{ marginBottom: 8 }}>
      <strong>{regel.bezeichnung}</strong> <span>({regel.id})</span>
      <div>{!rw && "Kein betrieblicher Wert — Hinweis nach Registervorgabe (ungeprüft, kein geltendes Recht)."}
        {rw && !geprueft && `Betrieblicher Wert ungeprüft — kein geltendes Recht, höchstens Hinweis${rw.quelle ? ` (Quelle: ${rw.quelle})` : ""}.`}
        {rw && geprueft && `Geprüft am ${datum(rw.geprueftAm)}: ${rw.quelle} ${rw.fundstelle}, Fassung ${rw.version}, gültig ab ${datum(rw.gueltigAb)}`
          + `${rw.gueltigBis ? ` bis ${datum(rw.gueltigBis)}` : ""} — Stufe ${rw.stufe === "achtung" ? "Achtung" : "Hinweis"}. Keine Feststellung eines Rechtsverstoßes, keine Sperre.`}</div>
      {darfSchalten && !offen && <button type="button" onClick={() => setOffen(true)}>Regelwert bearbeiten</button>}
      {darfSchalten && offen && (
        <RegelwertFormular regel={regel} wert={rw}
          onSpeichern={(w) => { setzeRegelwert(regel.id, w); setOffen(false); }}
          onEntfernen={() => { setzeRegelwert(regel.id, null); setOffen(false); }} />)}
    </li>);
}

/** Moduloberflächen an den Einhängepunkten (./index.js). */
function Oberflaechen({ m, darf, kontext, liste }) {
  const dienstarten = (Array.isArray(m.dienstarten) ? m.dienstarten : []).filter((d) => d && d.id);
  const einheiten = (Array.isArray(m.einheiten) ? m.einheiten : []).filter((e) => e && e.id);
  const [tag, setTag] = useState(heuteTag());
  const [dienstId, setDienstId] = useState(dienstarten[0] ? dienstarten[0].id : "");
  const [einheitId, setEinheitId] = useState(einheiten[0] ? einheiten[0].id : "");
  const o = { darf, liste };
  const betrieb = oberflaechenFuer(m, "betrieb", o), tagE = oberflaechenFuer(m, "tag", o), da = oberflaechenFuer(m, "dienstart", o);
  if (!betrieb.length && !tagE.length && !da.length) return <p>Keine Moduloberfläche: Kein Branchenmodul wirkt in diesem Betrieb.</p>;
  const personen = kontext && typeof kontext.personenImDienst === "function" ? (kontext.personenImDienst(tag, dienstId) || []) : [];
  const basis = { m, heute: heuteTag(), darf };
  const rahmen = (x, inhalt, schluessel) => (
    <section key={schluessel} style={RAHMEN} aria-label={x.eintrag.titel}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{x.eintrag.titel}</h3>
      {x.modus === "nurLesen" && <p style={{ margin: "4px 0" }}>Modul ausgeschaltet — nur lesen.</p>}
      {inhalt}
    </section>);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {betrieb.map((x) => rahmen(x, x.eintrag.ansicht(basis), `b-${x.eintrag.modul}`))}
      {tagE.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={FELD}>Tag<input type="date" value={tag} onChange={(e) => setTag(e.target.value)} /></label>
            <label style={FELD}>Dienst<select value={dienstId} onChange={(e) => setDienstId(e.target.value)}>
              {dienstarten.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}</select></label>
            <label style={FELD}>Einheit<select value={einheitId} onChange={(e) => setEinheitId(e.target.value)}>
              {einheiten.map((e) => <option key={e.id} value={e.id}>{e.name || e.id}</option>)}</select></label>
          </div>
          {tagE.map((x) => rahmen(x, x.eintrag.ansicht({ ...basis, datum: tag, dienstId, einheitId, personenImDienst: personen }), `t-${x.eintrag.modul}`))}
        </div>)}
      {da.map((x) => rahmen(x, dienstarten.map((d) => <div key={d.id}>{x.eintrag.ansicht({ ...basis, da: d })}</div>), `d-${x.eintrag.modul}`))}
    </div>);
}

/**
 * Branchenmodule in der Betriebsverwaltung.
 * @param {{ sitz: any, akt: any, darf: (recht: string) => boolean, kontext?: { personenImDienst?: (tag: string, dienstId: any) => any[] },
 *   liste?: readonly any[] }} props
 */
export function BranchenModule({ sitz, akt, darf, kontext, liste = BRANCHENMODULE }) {
  const m = sitz && sitz.mandant;
  if (!m) return null;
  const darfSchalten = darf("org.edit");
  const darfExport = darf("export.data");
  const e = m.einstellungen && typeof m.einstellungen === "object" ? m.einstellungen : {};
  const setze = (id, wert) => akt.setzeEinstellung("branchenmodule", { ...(e.branchenmodule || {}), [id]: wert });
  const setzeRegelwert = (id, wert) => akt.setzeEinstellung("regelwerte", { ...(e.regelwerte || {}), [id]: wert });
  const gebuchteModule = new Set(liste.filter((x) => (m.pakete || []).some((p) => x.pakete.includes(p))).map((x) => x.id));
  const regeln = REGELN_BRANCHEN.filter((r) => gebuchteModule.has(r.modul));
  return (
    <section aria-label="Branchenmodule" style={{ display: "grid", gap: 12, marginBottom: 20, maxWidth: "100%" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Branchenmodule</h2>
      <p style={{ margin: 0 }}>Ein Modul ist nach der Buchung des Pakets verfügbar und zunächst aus. Module „in Vorbereitung“ sind noch
        nicht fertig und lassen sich nicht einschalten. Bestehende Funktionen hängen an keinem Modul.
        {!darfSchalten && " Ein- und Ausschalten und betriebliche Regelwerte: Organisationsleitung (Recht „Betrieb verwalten“)."}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {liste.map((mod) => <ModulZeile key={mod.id} m={m} mod={mod} liste={liste} darfSchalten={darfSchalten} darfExport={darfExport} setze={setze} />)}
      </div>
      {regeln.length > 0 && (
        <div>
          <h3 style={{ margin: "8px 0 4px", fontSize: 16 }}>Betriebliche Regelwerte</h3>
          <p style={{ margin: 0 }}>Branchenregeln sind Hinweise. Nach dokumentierter Quellenprüfung kann die Leitung eine Regel auf „Achtung“
            setzen — mit Quelle, Fundstelle, Fassung und Gültigkeit. Ungeprüfte Werte gelten nicht als geltendes Recht. „Achtung“ ist keine
            Feststellung eines Rechtsverstoßes und keine Sperre.</p>
          <ul style={{ paddingLeft: 18 }}>
            {regeln.map((r) => <RegelwertZeile key={r.id} m={m} regel={r} darfSchalten={darfSchalten} setzeRegelwert={setzeRegelwert} />)}
          </ul>
        </div>)}
      <div>
        <h3 style={{ margin: "8px 0 4px", fontSize: 16 }}>Moduloberflächen</h3>
        <Oberflaechen m={m} darf={darf} kontext={kontext} liste={liste} />
      </div>
    </section>);
}

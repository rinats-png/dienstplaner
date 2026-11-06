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
     4. Ausnahmeweg Art. 16/17/18 DSGVO (AusnahmewegKarte, nur Leitung mit
        org.edit, nur für nur lesbare Moduldaten): Art, Grund als Kategorie,
        optionales Aktenzeichen (keine Namen), Auswahl der Datensätze,
        Bestätigungsschritt. Die Angabe geht einmal mit dem Speichern hinaus
        (akt.moduldatenAusnahme → src/speicher.js), nie in den lokalen Stand.

   Gespeichert wird über akt.setzeEinstellung (der gewöhnliche Schreibweg).
   Keine festen Breiten (360 px ohne Querscrollen).
   ========================================================================== */
import { useState } from "react";
import { BRANCHENMODULE, modulEinstellung, modulZustand, modulNurLesen, MITBESTIMMUNG_HINWEIS, GRUNDLAGE_MAX,
  pruefeRegelwert, regelwertMigrieren } from "../../server/lib/branchenmodule.mjs";
import { REGELN_BRANCHEN } from "../../server/lib/branchenkatalog.mjs";
import { oberflaechenFuer, hatModuldaten, moduldatenExport } from "./index.js";
import { AUSNAHME_GRUENDE, AUSNAHME_GRUND_ARTEN, ausnahmeAngabe, eintraegeListe, leeresFormular } from "./ausnahmeweg.js";
import { modulKontext } from "./zugriff.js";

export { ausnahmeAngabe };

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

/** Anzeige eines Datensatzes: Personenfelder „Person, Tag: Wert", Listen nach Name oder Kennung. */
function datensatzText(m, x) {
  if (x.wert && typeof x.wert === "object") return String(x.wert.name || x.wert.titel || x.schluessel);
  const [pid, tag] = String(x.schluessel).split("|");
  const wer = nameVon(m, pid) || pid;
  return `${wer}${tag ? `, ${datum(tag) || tag}` : ""}: ${String(x.wert)}`;
}

/**
 * Ausnahmeweg Art. 16/17/18 DSGVO für die Daten eines nur lesbaren Moduls (nur Leitung).
 * onAusfuehren(ausnahme, aendern, erkennt) — der Aufrufer speichert (akt.moduldatenAusnahme).
 * @param {{ m: any, mod: any, onAusfuehren: (ausnahme: any, aendern: (m: any) => any, erkennt: (m: any) => boolean) => void,
 *   anfang?: any }} props anfang: Formularstand (Prüfungen)
 */
export function AusnahmewegKarte({ m, mod, onAusfuehren, anfang }) {
  const [f, setF] = useState(() => anfang || leeresFormular());
  const [schritt, setSchritt] = useState(anfang && anfang.schritt === "bestaetigen" ? "bestaetigen" : "formular");
  const [erledigt, setErledigt] = useState(false);
  const liste = eintraegeListe(m, mod);
  const angabe = ausnahmeAngabe(m, mod, f);
  const gruende = Object.keys(AUSNAHME_GRUENDE).filter((g) => AUSNAHME_GRUND_ARTEN[g].includes(f.art));
  const setze = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const waehle = (feld, k, an) => setF((x) => ({ ...x, auswahl: { ...x.auswahl, [feld]: { ...(x.auswahl[feld] || {}), [k]: an } } }));
  const neuWert = (feld, k, v) => setF((x) => ({ ...x, neu: { ...x.neu, [feld]: { ...((x.neu || {})[feld] || {}), [k]: v } } }));
  const art = (a) => setF((x) => ({ ...x, art: a, grund: AUSNAHME_GRUND_ARTEN[x.grund] && AUSNAHME_GRUND_ARTEN[x.grund].includes(a) ? x.grund
    : (a === "loeschung" ? "art17" : "art16") }));
  if (erledigt) return <p role="status" style={{ margin: "8px 0 0" }}>Ausnahmeweg ausgeführt — wird gespeichert. Der Server prüft und protokolliert ihn.</p>;
  return (
    <section aria-label={`Datenschutz-Ausnahmeweg ${mod.name}`} style={{ ...RAHMEN, marginTop: 8, display: "grid", gap: 8 }}>
      <h4 style={{ margin: 0, fontSize: 14 }}>Datenschutz-Ausnahmeweg (Art. 16/17/18 DSGVO)</h4>
      <p style={{ margin: 0 }}>Nur für Anträge betroffener Personen. Gelöscht oder berichtigt werden genau die ausgewählten
        Datensätze; der Vorgang wird ohne Personenbezug protokolliert und bleibt auch nach einer Wiederherstellung wirksam.</p>
      {schritt === "formular" && (<>
        <label style={FELD}>Art<select value={f.art} onChange={(e) => art(e.target.value)} style={EINGABE}>
          <option value="loeschung">Löschung</option><option value="berichtigung">Berichtigung</option></select></label>
        <label style={FELD}>Grund<select value={f.grund} onChange={(e) => setze("grund", e.target.value)} style={EINGABE}>
          {gruende.map((g) => <option key={g} value={g}>{AUSNAHME_GRUENDE[g]}</option>)}</select></label>
        <label style={FELD}>Aktenzeichen (optional — keine Namen; 2 bis 5 Großbuchstaben, dann Ziffern, z. B. DS-2026-014)
          <input value={f.aktenzeichen} maxLength={20} inputMode="text" autoComplete="off" style={EINGABE}
            onChange={(e) => setze("aktenzeichen", e.target.value)} /></label>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 6, minWidth: 0 }}>
          <legend style={{ padding: 0 }}>Datensätze</legend>
          {!liste.length && <p style={{ margin: 0 }}>Keine Datensätze.</p>}
          {liste.map((x) => {
            const an = !!(f.auswahl[x.feld] && f.auswahl[x.feld][x.schluessel]);
            const sperre = f.art === "berichtigung" && !x.berichtigbar;
            return (
              <div key={`${x.feld}|${x.schluessel}`} style={{ display: "grid", gap: 4 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
                  <input type="checkbox" checked={an} disabled={sperre} onChange={(e) => waehle(x.feld, x.schluessel, e.target.checked)} />
                  <span style={{ overflowWrap: "anywhere" }}>{datensatzText(m, x)}{sperre ? " (nur löschbar)" : ""}</span>
                </label>
                {an && f.art === "berichtigung" && x.berichtigbar && (
                  <label style={FELD}>Berichtigter Wert<input value={((f.neu || {})[x.feld] || {})[x.schluessel] || ""} style={EINGABE}
                    onChange={(e) => neuWert(x.feld, x.schluessel, e.target.value)} /></label>)}
              </div>);
          })}
        </fieldset>
        {angabe.fehler && <p role="alert" style={{ margin: 0 }}>{angabe.fehler}</p>}
        <div><button type="button" disabled={!!angabe.fehler} onClick={() => setSchritt("bestaetigen")}>Weiter zur Bestätigung</button></div>
      </>)}
      {schritt === "bestaetigen" && !angabe.fehler && (
        <div role="alertdialog" aria-label="Ausnahmeweg bestätigen" style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0 }}><strong>{f.art === "loeschung" ? "Endgültig löschen" : "Berichtigen"}:</strong> {angabe.anzahl}
            {angabe.anzahl === 1 ? " Datensatz" : " Datensätze"} · {AUSNAHME_GRUENDE[f.grund]}
            {angabe.ausnahme.aktenzeichen ? ` · Aktenzeichen ${angabe.ausnahme.aktenzeichen}` : ""}.
            {f.art === "loeschung" ? " Das lässt sich nicht rückgängig machen, auch nicht über eine Sicherung." : ""}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => { onAusfuehren(angabe.ausnahme, angabe.aendern, angabe.erkennt); setErledigt(true); }}>
              {f.art === "loeschung" ? "Löschen bestätigen" : "Berichtigung bestätigen"}</button>
            <button type="button" onClick={() => setSchritt("formular")}>Zurück</button>
          </div>
        </div>)}
    </section>);
}

/** Eine Zeile je Modul. */
function ModulZeile({ m, mod, liste, darfSchalten, darfExport, setze, onAusnahme }) {
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
          auf Planung und Prüfungen. Der Löschlauf entfernt Zuordnungen ausgeschiedener Personen und Einträge hinter der
          Plandatenfrist; Berichtigung und Löschung nach Art. 16/17 DSGVO veranlasst die Leitung über den Ausnahmeweg.</p>)}
      {nurLesen && darfExport && hatModuldaten(m, mod.id, liste) && (
        <div style={{ marginTop: 8 }}><button type="button"
          onClick={() => herunterladen(`${mod.id}-daten.json`, moduldatenExport(m, mod.id, liste))}>Daten exportieren (JSON)</button></div>)}
      {nurLesen && darfSchalten && onAusnahme && hatModuldaten(m, mod.id, liste) && (
        <AusnahmewegKarte m={m} mod={mod} onAusfuehren={onAusnahme} />)}
      {schaltbar && an && (
        <div style={{ marginTop: 8 }}><button type="button" onClick={() => setze(mod.id, { ...e, an: false })}>Ausschalten</button></div>)}
      {schaltbar && !an && mod.mitbestimmung && (
        <MitbestimmungEinschalten mod={mod} onEinschalten={(mitbestimmung) => setze(mod.id, { an: true, mitbestimmung })} />)}
      {schaltbar && !an && !mod.mitbestimmung && (
        <div style={{ marginTop: 8 }}><button type="button" onClick={() => setze(mod.id, { an: true })}>Einschalten</button></div>)}
    </article>);
}

/**
 * Der zu speichernde Regelwert aus dem Formular. Der Wert geht nicht verloren
 * (Review-Nachtrag): Ein Wahrheitswert bleibt einer, eine Eingabe, die eine
 * Zahl ist, wird Zahl, sonst Text; leer heißt ohne Wert.
 * @param {Record<string, any>} f Formularstand
 * @param {Record<string, any> | null} [vorher] gespeicherter Regelwert
 */
export function regelwertSauber(f, vorher = null) {
  let wert = f.wert;
  if (typeof wert === "string") {
    const t = wert.trim();
    if (!t) wert = undefined;
    else if (vorher && typeof vorher.wert === "boolean" && (t === "true" || t === "false")) wert = t === "true";
    else if (/^-?\d+(?:[.,]\d+)?$/.test(t)) wert = Number(t.replace(",", "."));
    else wert = t;
  } else if (wert === null) wert = undefined;
  return { pruefstatus: f.pruefstatus, stufe: f.stufe,
    ...(wert === undefined ? {} : { wert }),
    ...Object.fromEntries(["quelle", "fundstelle", "version"].filter((k) => f[k]).map((k) => [k, f[k]])),
    gueltigAb: f.gueltigAb || null, gueltigBis: f.gueltigBis || null };
}

/** Formular für einen betrieblichen Regelwert (nur org.edit). */
function RegelwertFormular({ regel, wert, onSpeichern, onEntfernen }) {
  const [f, setF] = useState(() => ({ quelle: "", fundstelle: "", version: "", gueltigAb: "", gueltigBis: "",
    pruefstatus: "vorlaeufig", stufe: "hinweis", ...(regelwertMigrieren(wert) || {}),
    wert: wert && wert.wert !== undefined && wert.wert !== null ? String(wert.wert) : "" }));
  const feld = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sauber = regelwertSauber(f, wert);
  const fehler = pruefeRegelwert(regel.id, sauber);
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      <label style={FELD}>Wert<input value={f.wert} onChange={feld("wert")} style={EINGABE} /></label>
      {[["quelle", "Quelle"], ["fundstelle", "Fundstelle"], ["version", "Fassung"]].map(([k, t]) => (
        <label key={k} style={FELD}>{t}<input value={f[k] || ""} onChange={feld(k)} style={EINGABE} /></label>))}
      <label style={FELD}>Gültig ab<input type="date" value={f.gueltigAb || ""} onChange={feld("gueltigAb")} style={EINGABE} /></label>
      <label style={FELD}>Gültig bis<input type="date" value={f.gueltigBis || ""} onChange={feld("gueltigBis")} style={EINGABE} /></label>
      <label style={FELD}>Prüfstatus<select value={f.pruefstatus} onChange={feld("pruefstatus")}>
        <option value="vorlaeufig">ungeprüft (vorläufig)</option><option value="geprueft">Quelle geprüft</option><option value="zurueckgezogen">zurückgezogen (wirkt nicht)</option></select></label>
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
  const status = rw ? regelwertMigrieren(rw).pruefstatus : null;
  const geprueft = rw && status === "geprueft" && rw.geprueftAm;
  const abgelaufen = geprueft && rw.gueltigBis && heuteTag() > rw.gueltigBis;
  return (
    <li style={{ marginBottom: 8 }}>
      <strong>{regel.bezeichnung}</strong> <span>({regel.id})</span>
      <div>{!rw && "Kein betrieblicher Wert — Hinweis nach Registervorgabe (ungeprüft, kein geltendes Recht)."}
        {rw && status === "zurueckgezogen" && "Betrieblicher Wert zurückgezogen — wirkt nicht."}
        {rw && !geprueft && status !== "zurueckgezogen" && `Betrieblicher Wert ungeprüft — kein geltendes Recht, höchstens Hinweis${rw.quelle ? ` (Quelle: ${rw.quelle})` : ""}.`}
        {abgelaufen && `Abgelaufen am ${datum(rw.gueltigBis)} — wirkt nicht mehr; höchstens Hinweis nach Registervorgabe. `}
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
function Oberflaechen({ m, sitz, darf, kontext, liste }) {
  const dienstarten = (Array.isArray(m.dienstarten) ? m.dienstarten : []).filter((d) => d && d.id);
  const einheiten = (Array.isArray(m.einheiten) ? m.einheiten : []).filter((e) => e && e.id);
  const [tag, setTag] = useState(heuteTag());
  const [dienstId, setDienstId] = useState(dienstarten[0] ? dienstarten[0].id : "");
  const [einheitId, setEinheitId] = useState(einheiten[0] ? einheiten[0].id : "");
  const o = { darf, liste };
  const betrieb = oberflaechenFuer(m, "betrieb", o), tagE = oberflaechenFuer(m, "tag", o), da = oberflaechenFuer(m, "dienstart", o);
  if (!betrieb.length && !tagE.length && !da.length) return <p>Keine Moduloberfläche: Kein Branchenmodul wirkt in diesem Betrieb.</p>;
  const personen = kontext && typeof kontext.personenImDienst === "function" ? (kontext.personenImDienst(tag, dienstId) || []) : [];
  /* Basiskontext der Ansichten (zugriff.js): Zugriffsstufen, Person, Qualifikationsprüfung, Personen, Dienstzeit — fail-closed. */
  const basis = { m, heute: heuteTag(), darf, ...modulKontext({ sitz, kontext }) };
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
  /* Ausnahmeweg: nur wenn der Aufrufer den einmaligen Schreibweg anbietet (App.jsx → src/speicher.js). */
  const onAusnahme = darfSchalten && akt && typeof akt.moduldatenAusnahme === "function"
    ? (ausnahme, aendern, erkennt) => akt.moduldatenAusnahme(ausnahme, aendern, erkennt) : null;
  const gebuchteModule = new Set(liste.filter((x) => (m.pakete || []).some((p) => x.pakete.includes(p))).map((x) => x.id));
  const regeln = REGELN_BRANCHEN.filter((r) => gebuchteModule.has(r.modul));
  return (
    <section aria-label="Branchenmodule" style={{ display: "grid", gap: 12, marginBottom: 20, maxWidth: "100%" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Branchenmodule</h2>
      <p style={{ margin: 0 }}>Ein Modul ist nach der Buchung des Pakets verfügbar und zunächst aus. Module „in Vorbereitung“ sind noch
        nicht fertig und lassen sich nicht einschalten. Bestehende Funktionen hängen an keinem Modul.
        {!darfSchalten && " Ein- und Ausschalten und betriebliche Regelwerte: Organisationsleitung (Recht „Betrieb verwalten“)."}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {liste.map((mod) => <ModulZeile key={mod.id} m={m} mod={mod} liste={liste} darfSchalten={darfSchalten} darfExport={darfExport} setze={setze} onAusnahme={onAusnahme} />)}
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
        <Oberflaechen m={m} sitz={sitz} darf={darf} kontext={kontext} liste={liste} />
      </div>
    </section>);
}

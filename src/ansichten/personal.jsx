/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { ALLE_STANDORTE, einheitenAmStandort, personAmStandort, urlaubskonto, stundenkonto, nachtJahr, mehrereStandorte, kontoSichtbar } from "../lib/fachlogik.js";
import { useState, useEffect, useMemo } from "react";
import { heute, fKurz } from "../lib/datum.js";
import { darf } from "../lib/berechtigung.js";
import { rolle, ROLLEN, rollenName } from "../lib/rollen.js";
import { imDienst, einheitAm } from "../../server/lib/fachpruefung.mjs";
import { H1, Btn, Card, Rubrik, klickbar, Filterleiste, Seg, Lab, Avatar, Sel, Pill, Fussleiste, Field, Inp } from "../ui/bausteine.jsx";
import { zahl, eur, sgnIst, n1Ist } from "../lib/format.js";
import { Standortwahl, Standortleiste, Sheet } from "../ui/leisten.jsx";
import { C } from "../farben.js";
import { lesbar, NUM } from "../ui/thema.js";
import { vergebbareRollen } from "../../server/lib/rollenvergabe.mjs";
import { stundenText } from "../istdaten.js";
import { Icon } from "../gestalt/icons.jsx";

/* ================================ PERSONAL =============================== */
export function Personal({ sitz, ym, akt, oeffnePerson, standortId = ALLE_STANDORTE, setStandortId = () => {} }) {
  const m = sitz.mandant;
  const [q, setQ] = useState(""), [such, setSuch] = useState(""), [filter, setFilter] = useState("alle"), [neu, setNeu] = useState(false);
  /* Fehlermeldung des Dialogs „Person hinzufügen“: nie stumm abweisen. */
  const [neuFehler, setNeuFehler] = useState(null);
  useEffect(() => { const t = setTimeout(() => setSuch(q), 200); return () => clearTimeout(t); }, [q]);
  const jahr = Number(ym.slice(0, 4)), d0 = heute();
  const zeigt = darf(sitz, "account.view.all");
  const [f, setF] = useState({ vorname: "", nachname: "", funktion: "Fachkraft", einheitId: m.einheiten[0].id,
    wochenstunden: m.einstellungen.sollWochenstunden, urlaubsanspruch: 30, eintritt: d0, rolle: "mitarbeiter" });

  /* Die Einheiten des gewählten Standorts. Sie tragen zweierlei: die
     Auswahlknöpfe darunter und die Frage, wer überhaupt in der Liste steht. */
  const einheiten = einheitenAmStandort(m, standortId);
  /* Ein Standortwechsel macht eine Einheitenauswahl von vorhin ungültig —
     sonst zeigte die Liste nichts an, ohne dass ersichtlich wäre, warum. */
  useEffect(() => {
    if (filter !== "alle" && filter !== "aus" && !einheiten.some((e) => e.id === filter))
      setFilter("alle");
  }, [standortId]);

  const zeilen = useMemo(() => m.personen
    .filter((p) => imDienst(p, d0) || p.austritt)
    .filter((p) => personAmStandort(m, p, standortId, d0))
    .filter((p) => filter === "alle" ? true : filter === "aus" ? !!p.austritt : einheitAm(p, d0) === filter)
    .filter((p) => such ? `${p.vorname} ${p.nachname}`.toLowerCase().includes(such.toLowerCase()) : true)
    .map((p) => ({ p, url: urlaubskonto(m, p, jahr), kto: stundenkonto(m, p, ym), nacht: nachtJahr(m, p, jahr) })), [m, filter, such, ym, standortId]);

  /* Zugangsarten kosten nichts mehr — gerechnet wird je Standort.
     Das ist für Betriebe der wichtigste Unterschied: Wer jemanden zur
     Planung befördert, zahlt dafür keinen Aufpreis. */
  const preisWirkung = () => 0;

  return (
    <div>
      {/* Hier stand „Jede vergebene Zugangsart wirkt unmittelbar auf die
          monatlichen Kosten des Betriebs." Das stimmte einmal und stimmt
          seit der Umstellung auf den Standortpreis nicht mehr — zwei
          Zeilen tiefer steht `preisWirkung = () => 0`. Eine Oberfläche,
          die Kosten androht, die es nicht gibt, kostet Vertrauen. */}
      <H1 sub={`${zahl(m.personen.filter((p) => imDienst(p, d0)).length)} Personen im Bestand.`
        + (mehrereStandorte(m) && standortId !== ALLE_STANDORTE
          ? ` Angezeigt wird ${((m.standorte || []).find((s) => s.id === standortId) || {}).name}.` : "")}
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Standortwahl m={m} wert={standortId} setWert={setStandortId} />
          {darf(sitz, "staff.edit") && <>
            <Btn onClick={akt.oeffneImport}>Importieren</Btn>
            <Btn kind="primary" onClick={() => setNeu(true)}>Person hinzufügen</Btn></>}</div>}>Personal</H1>

      {/* Ohne gewählten Standort steht hier, woraus der Betrieb besteht —
          und ein Klick führt hinein. */}
      {standortId === ALLE_STANDORTE && (
        <Standortleiste m={m} wert={standortId} setWert={setStandortId} />)}

      {darf(sitz, "staff.edit") && m.personen.filter((p) => imDienst(p, d0)).length <= 1 && (
        <Card style={{ padding: 28, marginBottom: 22 }}>
          <Rubrik>Erster Schritt</Rubrik>
          <div style={{ fontSize: 23, fontWeight: 300, letterSpacing: "-.03em", margin: "10px 0 8px" }}>
            Der Betrieb hat noch <b style={{ fontWeight: 700 }}>kein Personal</b>.
          </div>
          <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.55, maxWidth: 620, marginBottom: 22 }}>
            Ohne Personal bleibt der Plan leer. Es gibt zwei Wege: eine vorhandene Liste aus
            Tabellenkalkulation oder Personalsystem einlesen, oder Personen einzeln anlegen.
            Beides lässt sich jederzeit ergänzen.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            <div className="karte" {...klickbar(akt.oeffneImport, "Liste einlesen")}
              style={{ padding: 20, cursor: "pointer" }}>
              <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 6 }}>Liste einlesen</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 14 }}>
                Aus Excel, CSV oder einem Personalsystem. Format wird erkannt, Spalten werden zugeordnet.
              </div>
              <span className="btn btn-sm btn-primary">Importieren</span>
            </div>
            <div className="karte" {...klickbar(() => setNeu(true), "Person einzeln anlegen")}
              style={{ padding: 20, cursor: "pointer" }}>
              <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 6 }}>Einzeln anlegen</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5, marginBottom: 14 }}>
                Name, Einheit, Wochenstunden. Zugangsart und Qualifikationen folgen danach.
              </div>
              <span className="btn btn-sm">Person hinzufügen</span>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 18, lineHeight: 1.5 }}>
            Die Zugangsart wird in der Liste unten je Person vergeben — sie bestimmt, was jemand sehen
            und ändern darf.
          </div>
        </Card>)}

      <Filterleiste suche={q} setSuche={setQ} platzhalter="Name suchen">
        <Seg value={filter} onChange={setFilter} options={[{ id: "alle", label: "Alle" },
          ...einheiten.map((e) => ({ id: e.id, label: e.name.replace(m.einheitLabel, "").trim() || e.name })),
          { id: "aus", label: "Ausgetreten" }]} />
      </Filterleiste>

      <Card style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
          <thead><tr>{["Person", m.einheitLabel, "Zugangsart", "Qualifikationen", "Resturlaub", "Stundenkonto", `Nacht ${jahr}`, ""].map((h, i) => (
            <th key={i} style={{ textAlign: i > 3 ? "right" : "left", padding: "14px 18px", borderBottom: `1px solid ${C.lineSoft}` }}><Lab>{h}</Lab></th>))}</tr></thead>
          <tbody>{zeilen.map(({ p, url, kto, nacht }) => {
            const e = m.einheiten.find((x) => x.id === einheitAm(p, d0));
            const r = rolle(p.rolle);
            return (<tr key={p.id} className="row">
              <td {...klickbar(() => oeffnePerson(p.id), `${p.nachname}, ${p.vorname} öffnen`)}
                style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar person={p} style={{ opacity: p.austritt ? .45 : 1 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 550, opacity: p.austritt ? .5 : 1 }}>
                      {p.nachname}, {p.vorname}</div>
                    <div style={{ fontSize: 12, color: C.dimmer }}>{p.funktion}{p.austritt ? ` · ausgetreten ${fKurz(p.austritt)}` : ""}</div>
                  </div>
                </div></td>
              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13, color: e ? lesbar(e.farbe) : C.dimmer }}>{e ? e.name : "—"}</td>
              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
                {/* Angeboten wird nur, was diese Rolle auch vergeben darf —
                    und nur an Personen, deren jetzige Rolle im eigenen
                    Bereich liegt. Der Server prüft dasselbe noch einmal;
                    hier steht es, damit niemand eine Auswahl trifft, die
                    danach mit einer Fehlermeldung zurückkommt. */}
                {(() => {
                  const meine = vergebbareRollen(sitz.rolle === "kunde" ? "leitung" : sitz.rolle);
                  const darfIch = meine.includes(p.rolle) || !meine.length ? meine : [];
                  return darfIch.length ? (
                    <Sel value={p.rolle} onChange={(ev) => akt.setzeRolle(p.id, ev.target.value)} style={{ width: 180 }}>
                      {ROLLEN.filter((x) => darfIch.includes(x.id))
                        .map((x) => <option key={x.id} value={x.id}>{rollenName(m, x.id)}</option>)}</Sel>
                  ) : (<>
                    <Pill size="sm">{rollenName(m, p.rolle)}</Pill>
                    {meine.length > 0 && (
                      <div style={{ fontSize: 11, color: C.dimmer, marginTop: 4 }}>
                        Diese Rolle liegt nicht unterhalb deiner eigenen.</div>)}
                  </>);
                })()}
                <div style={{ fontSize: 11, color: C.dimmer, marginTop: 4, ...NUM }}>
                  {r.berechnet ? (preisWirkung(p.rolle) === 0 ? "im Tarif enthalten" : `${eur(preisWirkung(p.rolle))} je Monat`) : "kostenfrei"}</div></td>
              <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {p.qualifikationen.map((qid) => { const qq = m.qualifikationen.find((x) => x.id === qid);
                    return qq ? <Pill key={qid} size="sm">{qq.kurz}</Pill> : null; })}</div></td>
              {zeigt && kontoSichtbar(sitz, p) ? (<>
                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right" }}>
                  <div style={{ fontSize: 14, color: url.rest < 5 ? C.warn : C.text, ...NUM }}>{url.rest}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>von {url.anspruch}</div></td>
                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 14,
                  color: kto === null || Math.abs(kto) < 12 ? C.dim : kto > 0 ? C.warn : C.accent, ...NUM }}>{sgnIst(kto)} h</td>
                <td style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right" }}>
                  <div style={{ fontSize: 14, ...NUM }}>{n1Ist(nacht.stunden)} h</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>{stundenText(nacht.anzahl, String)} Dienste</div></td>
              </>) : <td colSpan={3} style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", fontSize: 12.5, color: C.dimmer }}>
                {zeigt ? "Konten dieser Person nicht im eigenen Bereich" : "Konten nur für die Planung sichtbar"}</td>}
              <td aria-hidden="true" style={{ padding: "13px 18px", borderBottom: `1px solid ${C.lineSoft}`, textAlign: "right", color: C.dimmer }}><Icon n="chevron-rechts" size={16} /></td>
            </tr>); })}</tbody>
        </table>
      </Card>

      {darf(sitz, "staff.edit") && (
        <Fussleiste>
          <span style={{ fontSize: 13.5, color: C.dim, flex: 1, minWidth: 130 }}>
            {zeilen.length} von {m.personen.filter((p) => imDienst(p, d0)).length} angezeigt</span>
          <Btn onClick={akt.oeffneImport}>Importieren</Btn>
          <Btn kind="primary" onClick={() => setNeu(true)}>Person hinzufügen</Btn>
        </Fussleiste>)}

      <Sheet open={neu} onClose={() => { setNeu(false); setNeuFehler(null); }} titel="Person hinzufügen" width={580}>
        <div style={{ display: "grid", gap: 15 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Vorname"><Inp id="neu-person-vorname" value={f.vorname} aria-invalid={neuFehler && !f.vorname ? "true" : undefined} aria-describedby={neuFehler ? "neu-person-fehler" : undefined} onChange={(e) => { setF({ ...f, vorname: e.target.value }); setNeuFehler(null); }} /></Field>
            <Field label="Nachname"><Inp id="neu-person-nachname" value={f.nachname} aria-invalid={neuFehler && !f.nachname ? "true" : undefined} aria-describedby={neuFehler ? "neu-person-fehler" : undefined} onChange={(e) => { setF({ ...f, nachname: e.target.value }); setNeuFehler(null); }} /></Field>
          </div>
          {neuFehler && <div id="neu-person-fehler" role="alert" style={{ color: C.danger, fontSize: 13, fontWeight: 600 }}>{neuFehler}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
            <Field label="Funktion"><Sel value={f.funktion} onChange={(e) => setF({ ...f, funktion: e.target.value })}>
              {["Schichtleitung", "Stellvertretung", "Fachkraft", "Hilfskraft", "Auszubildende"].map((x) => <option key={x}>{x}</option>)}</Sel></Field>
            <Field label={m.einheitLabel}><Sel value={f.einheitId} onChange={(e) => setF({ ...f, einheitId: e.target.value })}>
              {m.einheiten.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Sel></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 13 }}>
            <Field label="Wochenstunden"><Inp type="number" step="0.5" value={f.wochenstunden} onChange={(e) => setF({ ...f, wochenstunden: Number(e.target.value) })} /></Field>
            <Field label="Urlaubsanspruch"><Inp type="number" value={f.urlaubsanspruch} onChange={(e) => setF({ ...f, urlaubsanspruch: Number(e.target.value) })} /></Field>
            <Field label="Eintritt"><Inp type="date" value={f.eintritt} onChange={(e) => setF({ ...f, eintritt: e.target.value })} /></Field>
          </div>
          <Field label="Zugangsart" hint={`${rolle(f.rolle).text} — ${rolle(f.rolle).berechnet && preisWirkung(f.rolle) > 0 ? `kostet ${eur(preisWirkung(f.rolle))} je Monat` : "ohne Zusatzkosten"}.`}>
            <Sel value={f.rolle} onChange={(e) => setF({ ...f, rolle: e.target.value })}>
              {ROLLEN.filter((x) => !x.extern).map((x) => <option key={x.id} value={x.id}>{rollenName(m, x.id)}</option>)}</Sel></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn kind="quiet" onClick={() => setNeu(false)}>Abbrechen</Btn>
            <Btn kind="primary" onClick={() => {
              if (!f.vorname.trim() || !f.nachname.trim()) {
                setNeuFehler("Bitte Vor- und Nachnamen angeben.");
                /* Fokus auf das erste ungültige Feld (Tastatur, Screenreader). */
                const feld = document.getElementById(!f.vorname.trim() ? "neu-person-vorname" : "neu-person-nachname");
                if (feld) feld.focus();
                return;
              }
              akt.neuePerson(f); setNeu(false); setNeuFehler(null); setF({ ...f, vorname: "", nachname: "" });
            }}>Hinzufügen</Btn>
          </div>
        </div>
      </Sheet>
    </div>);
}

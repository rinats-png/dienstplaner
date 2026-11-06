/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { stufeVon, preisFuer, STUFEN, leistungenAnzeige } from "../stufen.js";
import { H1, Card, Lab, Seg, Inp, Btn, Rubrik, Pill, Haken } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { zahl, eur0, eur } from "../lib/format.js";
import Ringregler from "../ringregler.jsx";
import { NUM } from "../ui/thema.js";

/* ------------------------------- Die Ansicht -----------------------------
   Die vorige Fassung ließ Beschäftigte und Einheiten eingeben und rechnete
   daraus einen Preis je Standort mit Mengenstaffel. Im neuen Modell ist
   das keine Vereinfachung mehr, sondern eine falsche Grundannahme: Die
   Zahl der Beschäftigten bestimmt den Preis nicht. Was ihn bestimmt, ist
   eine Organisationsentscheidung — wie viele Planer-Zugänge, wie viele
   große Standorte — und genau die lässt sich hier durchspielen. */
export function Mandantenrechner({ db }) {
  const [stufeId, setStufeId] = useState("pro");
  const [planer, setPlaner] = useState(1);
  const [standorte, setStandorte] = useState([25]);

  const stufe = stufeVon(stufeId);
  const p = useMemo(() => preisFuer(stufe, planer, standorte), [stufeId, planer, standorte]);
  const alle = useMemo(() => db.tarife.map((t) => preisFuer(t, planer, standorte)), [db, planer, standorte]);

  const aendereStandort = (i, wert) => setStandorte((s) => s.map((x, ix) => ix === i ? Math.max(0, wert) : x));

  /* Die beiden Standort-Ringe fassen die Liste zu ihren zwei Kennzahlen
     zusammen: wie viele, und wie groß. Ungleiche Standorte bleiben in der
     Liste darunter möglich — sie ändern den Preis, weil jeder Standort
     über dem Kontingent nach seiner eigenen Größe eingestuft wird. */
  const gleichGross = standorte.every((n) => n === standorte[0]);
  const leitgroesse = standorte.length ? Math.max(...standorte) : 25;
  const setzeAnzahl = (n) => setStandorte((s) => (n <= s.length
    ? s.slice(0, n)
    : [...s, ...Array(n - s.length).fill(s.length ? s[s.length - 1] : 25)]));
  const setzeGroesse = (g) => setStandorte((s) => s.map(() => g));

  return (
    <div>
      <H1 rubrik="Betreiber"
        sub="Wie viele Planer-Zugänge braucht der Betrieb, und wie groß sind seine einzelnen Standorte? Das allein bestimmt den Preis — die Zahl der Beschäftigten nicht mehr."
        >Mandantenrechner</H1>

      {/* Eingaben */}
      <Card style={{ padding: 26, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 26 }}>
          <div>
            <Lab style={{ marginBottom: 9 }}>Stufe</Lab>
            <Seg value={stufeId} onChange={setStufeId}
              options={STUFEN.map((s) => ({ id: s.id, label: s.name }))} />
            <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 10, lineHeight: 1.5 }}>
              {zahl(stufe.planerInklusive)} Planer-Zugang{stufe.planerInklusive === 1 ? "" : "e"} und
              {" "}{zahl(stufe.standorteInklusive)} Standort{stufe.standorteInklusive === 1 ? "" : "e"} beliebiger
              Größe sind enthalten.
            </div>
          </div>
          {/* Ringe statt Zählwerk und Zahlenfeldern — dieselbe Darstellung
              wie im Preisrechner der Website. Der Ring zeigt Wert und Skala
              in einem Bild, und jede Raste ist einzeln antippbar. */}
          <Ringregler
            beschriftung="Planer-Zugänge" einheit="Zugänge" groesse={190}
            min={0} max={20} schritt={1} wert={planer} onChange={setPlaner}
            hinweis="Wer zentral mitplant, nicht wer geplant wird. Sub-Planer, Mitarbeiter und Betriebsrat zählen hier nicht mit — sie sind unbegrenzt kostenfrei." />
          <Ringregler
            beschriftung="Standorte" einheit="Standorte" groesse={190}
            min={1} max={30} schritt={1} wert={standorte.length} onChange={setzeAnzahl}
            hinweis="Eigenständige Einsatzorte. Nur was über dem Kontingent der Stufe liegt, kostet einen Zuschlag." />
          <Ringregler
            beschriftung="Personen je Standort" einheit="Personen" groesse={190}
            min={5} max={300} schritt={5} wert={leitgroesse} onChange={setzeGroesse}
            hinweis={gleichGross
              ? "Nur für die Einstufung der zuschlagspflichtigen Standorte — die Zahl der Beschäftigten selbst kostet nichts."
              : "Die Standorte unten sind unterschiedlich groß; der Ring zeigt den größten. Wer ihn bewegt, setzt alle auf dieselbe Größe."} />
        </div>

        <details style={{ marginTop: 22 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: C.dimmer, padding: "6px 0" }}>
            Standorte einzeln angeben</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 12, maxWidth: 420 }}>
            {standorte.map((n, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Inp type="number" min={0} value={n} style={{ width: 90 }}
                  aria-label={`Personen an Standort ${i + 1}`}
                  onChange={(ev) => aendereStandort(i, Number(ev.target.value))} />
                <span style={{ fontSize: 12.5, color: C.dimmer }}>Personen</span>
                <span style={{ flex: 1 }} />
                {standorte.length > 1 && (
                  <Btn size="sm" kind="quiet"
                    onClick={() => setStandorte((s) => s.filter((_, ix) => ix !== i))}>Entfernen</Btn>)}
              </div>))}
            {standorte.length < 30 && (
              <Btn size="sm" onClick={() => setStandorte((s) => [...s, 15])}>Standort hinzufügen</Btn>)}
          </div>
        </details>
      </Card>

      {p.kontaktEmpfohlen && (
        <Card style={{ padding: 22, marginBottom: 16, background: C.warnLight }}>
          <div style={{ fontSize: 15.5, fontWeight: 650, color: C.warn, marginBottom: 8 }}>
            Sprich uns an</div>
          <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, maxWidth: 720 }}>
            Mit {zahl(p.planerGesamt)} Planer-Zugängen und {zahl(p.zuschlaege.posten.length)} zuschlagspflichtigen
            Standorten liegt dieser Betrieb über der Größe, für die eine automatische Formel noch die
            richtige Antwort ist. Die Zahl unten ist eine <b>Hochrechnung</b> — ein Betrieb dieser Größe
            bekommt ein eigenes Angebot mit verhandelter Grundgebühr.
          </div>
        </Card>)}

      <Lab style={{ marginBottom: 12 }}>Was es monatlich kostet</Lab>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }}>
        {alle.map((a) => {
          const best = a.stufe.id === stufe.id;
          return (
            <Card key={a.stufe.id} glanz={best}
              style={{ padding: 24, outline: best ? `2px solid ${C.accent}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Rubrik>{a.stufe.name}</Rubrik>
                {a.kontaktEmpfohlen && <Pill size="sm" tone="warn">Sprich uns an</Pill>}
              </div>
              <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: "-.04em", ...NUM }}>
                {a.kontaktEmpfohlen ? "—" : eur0(a.gesamt)}</div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>je Monat, netto</div>
              <div style={{ marginTop: 18, paddingTop: 15, borderTop: `1px solid ${C.lineSoft}`,
                display: "grid", gap: 7, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.dimmer }}>Grundgebühr</span>
                  <span style={NUM}>{eur(a.stufe.grund)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.dimmer }}>{zahl(a.zusatzPlaner)} zusätzliche{a.zusatzPlaner === 1 ? "r" : ""} Planer</span>
                  <span style={NUM}>{eur(a.summePlaner)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.dimmer }}>{zahl(a.zuschlaege.posten.length)} zuschlagspflichtige Standorte</span>
                  <span style={NUM}>{eur(a.zuschlaege.summe)}</span></div>
              </div>
              <div style={{ fontSize: 12, color: C.dimmer, marginTop: 12, lineHeight: 1.5 }}>
                {leistungenAnzeige(a.stufe.leistungen).slice(0, 3).join(" · ")}
              </div>
            </Card>);
        })}
      </div>

      <Card style={{ marginTop: 20, padding: 22 }}>
        <Lab style={{ marginBottom: 11 }}>Wie sich der Preis zusammensetzt</Lab>
        <Haken punkte={[
          "Die Grundgebühr enthält eine Zahl Planer-Zugänge und eine Zahl Standorte beliebiger Größe — je nach Stufe.",
          "Ein weiterer Planer-Zugang kostet eine feste Pauschale, unabhängig von der Betriebsgröße.",
          "Ein weiterer Standort kostet nur, wenn er über das Kontingent hinausgeht — und dann nach seiner eigenen Größe, nicht nach der des ganzen Betriebs.",
          "Mitarbeiter, Sub-Planer, Betriebsrat und Organisationsleitung sind in jeder Stufe unbegrenzt und kostenfrei.",
        ]} />
        <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 14, lineHeight: 1.55 }}>
          Zuzüglich Umsatzsteuer. Die Bänder für Standortzuschläge stehen in
          {" "}<code>src/standorte.js</code>, die Stufen in <code>STUFEN</code> hier.
        </div>
      </Card>
    </div>);
}

/* ==========================================================================
   ANTRÄGE — GETEILTE ANSICHT
   Links die Liste mit Auswahl und Sammelaktionen, rechts die Kapazität der
   nächsten acht Wochen. Wer einen Antrag auswählt, sieht sofort, welche
   Wochen dadurch kippen. Vollständig über die Tastatur bedienbar.
   ========================================================================== */

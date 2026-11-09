/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import { C } from "../farben.js";
import { klickbar, Card, Btn, Sel } from "../ui/bausteine.jsx";
import { lesbar } from "../ui/thema.js";
import { Icon } from "../gestalt/icons.jsx";
import { RechtFenster, RechtLeiste } from "../rechtstexte.jsx";
import { ROLLEN } from "../lib/rollen.js";
import { Logo } from "../ui/logo.jsx";
import { abmeldenMitHinweis } from "../app/abmelden.js";


/* ==========================================================================
   ANMELDUNG — bestimmt die Zugriffstiefe
   ========================================================================== */
export function Anmeldung({ db, onLogin }) {
  /* Die gewählte Kennung wird einmal beim ersten Rendern festgelegt. Ändert
     sich der Bestand danach — weil der Server einen gefilterten Ausschnitt
     nachliefert oder ein frisch angelegter Raum noch keine Betriebe hat —,
     zeigte mid auf einen Betrieb, den es nicht mehr gibt. `find` gab dann
     undefined zurück und die nächste Zeile brach mit „Cannot read
     properties of undefined (reading 'personen')" ab.

     Statt darauf zu vertrauen, dass die Kennung passt, wird sie gegen den
     aktuellen Bestand geprüft und notfalls auf den ersten Betrieb
     zurückgeführt. */
  const betriebe = Array.isArray(db.mandanten) ? db.mandanten : [];
  const [mid, setMid] = useState(betriebe.length ? betriebe[0].id : null);
  const m = betriebe.find((x) => x.id === mid) || betriebe[0] || null;
  /* Impressum und Datenschutzerklärung müssen ohne Anmeldung erreichbar
     sein — „ständig verfügbar" nach § 5 DDG heißt: auch für jemanden, der
     noch gar keinen Zugang hat. */
  const [recht, setRecht] = useState(null);
  const proRolle = m && Array.isArray(m.personen)
    ? ROLLEN.filter((r) => r.id !== "betreiber").map((r) => ({
      r, person: m.personen.find((p) => p.rolle === r.id && p.status === "aktiv") }))
    : [];

  /* Ohne Betrieb gibt es keine Rollenauswahl. Das trifft einen Zugang, der
     auf einen leeren Raum zeigt — vorher endete das im Fehlerbildschirm. */
  if (!m) {
    return (
      <div className="sw-root">
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", padding: "5vh 20px" }}>
          <Card style={{ padding: 30, maxWidth: 460, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
              <Logo size={64} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 650, marginBottom: 10 }}>
              Dieser Zugang hat noch keinen Betrieb</div>
            <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, margin: "0 0 20px" }}>
              Der Datenraum ist angelegt, aber noch leer. Die Organisationsleitung
              richtet den Betrieb ein — danach funktioniert dieser Zugang.</p>
            <Btn onClick={abmeldenMitHinweis}>Abmelden</Btn>
          </Card>
        </div>
        <RechtLeiste onOeffnen={setRecht} style={{ paddingBottom: 26 }} />
        {recht && <RechtFenster start={recht} onClose={() => setRecht(null)} />}
      </div>);
  }

  return (
    <div className="sw-root">
      <div style={{display:"none"}}><i /><i /><i /><i /></div>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "5vh 20px" }}>
        <div style={{ width: "100%", maxWidth: 860 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
              <Logo size={86} />
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-.03em", margin: 0 }}>CENTRIC</h1>
            <p style={{ fontSize: 16, color: C.dim, margin: "12px 0 0" }}>
              Dienstplanung für den durchgehenden Schichtbetrieb
            </p>
          </div>

          {/* --------------------------------------------------------------
              Dieser Bildschirm ist nicht die Anmeldung.

              Er sieht ihr aber zum Verwechseln ähnlich: Wer sich mit einem
              echten Zugangscode angemeldet hat, landet hier — und steht vor
              etwas, das erneut „anmelden" sagt. Beim Durchspielen war
              zweimal unklar, ob die erste Anmeldung fehlgeschlagen war.

              Der Unterschied stand bisher als graue Fußnote unter den
              Karten. Er gehört darüber, weil er die Frage beantwortet, die
              man beim Ansehen hat, nicht die, die man danach noch hat. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px",
            marginBottom: 22, background: C.warnLight, borderLeft: `3px solid ${C.warn}`,
            borderRadius: "0 8px 8px 0" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 640, marginBottom: 4 }}>
                Vorführfassung — du bist bereits angemeldet.</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55 }}>
                Hier wird nur die Sicht gewechselt: Jede Rolle zeigt dieselben
                Daten in der Tiefe, die ihr zusteht. Im Echtbetrieb entfällt
                dieser Schritt — dort bestimmt der Zugangscode die Rolle.
              </div>
            </div>
          </div>

          <Card hover style={{ padding: 26, marginBottom: 18, cursor: "pointer" }}
            {...klickbar(() => onLogin({ rolle: "betreiber" }), "Zur Betreiberkonsole")}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: C.accent, color: C.aufAkzent,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>BE</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>Zur Betreiberkonsole</div>
                <div style={{ fontSize: 13.5, color: C.dim, marginTop: 3 }}>
                  Mandanten, Tarife, Zugangszahlen und Rechnungen. Ohne Einsicht in Namen oder Pläne.
                </div>
              </div>
              <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={22} /></span>
            </div>
          </Card>

          <Card style={{ padding: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Sicht einer Rolle im Betrieb</div>
              <Sel value={mid} onChange={(e) => setMid(e.target.value)} style={{ width: 280 }}>
                {db.mandanten.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Sel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
              {proRolle.map(({ r, person }) => person && (
                <div key={r.id} className="karte"
                  {...klickbar(() => onLogin({ rolle: "kunde", mandantId: m.id, personId: person.id }),
                    `Als ${r.label} anmelden: ${person.vorname} ${person.nachname}`)}
                  style={{ padding: 16, cursor: "pointer", transition: "transform .2s, box-shadow .2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 26px rgba(16,16,24,.12)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: `${r.farbe}1E`, color: lesbar(r.farbe),
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{r.kurz}</span>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                  </div>
                  <div style={{ fontSize: 13, color: C.text }}>{person.vorname} {person.nachname}</div>
                  <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 4, lineHeight: 1.4 }}>{r.text}</div>
                </div>))}
            </div>
          </Card>

          {/* Der frühere Hinweis stand hier unten und ist nach oben gewandert,
              wo er gebraucht wird. Was bleibt, ist die eine Zusicherung, die
              man erst danach braucht. */}
          <div style={{ textAlign: "center", fontSize: 12.5, color: C.dimmer, marginTop: 22, lineHeight: 1.5 }}>
            Die Zugriffstiefe ergibt sich in der Vorführung wie im Echtbetrieb
            aus Rolle und Geltungsbereich — nichts daran ist nachgestellt.
          </div>

          <RechtLeiste onOeffnen={setRecht} style={{ marginTop: 18 }} />
        </div>
      </div>
      {recht && <RechtFenster start={recht} onClose={() => setRecht(null)} />}
    </div>);
}

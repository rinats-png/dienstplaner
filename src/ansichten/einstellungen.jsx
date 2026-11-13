/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import * as SP from "../speicher.js";
import { C } from "../farben.js";
import { Card, CardHead, Lab, Schalter, Btn, Inp, Sel, Seg, H1, Pill } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { fLang, fKurz } from "../lib/datum.js";
import { Icon } from "../gestalt/icons.jsx";
import { darfSicherungenSehen } from "../sicherungen-ui.js";
import { SicherungenVerwalten } from "./sicherungenverwalten.jsx";
import { darf } from "../lib/berechtigung.js";
import { ROLLEN } from "../lib/rollen.js";
import { ZUSTELLARTEN, zustellwege } from "../lib/zustellung.js";
import { kommendeWeckzeiten } from "../lib/verfuegbarkeit.js";
import { tourKapitel, tourStand } from "../lib/tour.js";
import { NAV_KUNDE, ansichtErlaubt } from "../app/navigation.js";
import { useTour } from "./tourleiste.jsx";
import { InterneVorgaben } from "./vorgaben.jsx";


/* ==========================================================================
   EINSTELLUNGEN
   Was jede Rolle für sich ändern darf. Bewusst getrennt von der Verwaltung:
   Hier stehen persönliche Vorlieben, dort betriebliche Festlegungen.
   ========================================================================== */
export function Einstellungen({ sitz, akt, gehZu }) {
  /* Der Betreiber hat keinen Mandanten und keine Person im Betrieb —
     für ihn bleibt nur, was ohne beides auskommt. */
  const p = sitz.person || { id: "betreiber", rolle: "betreiber", vorname: "", nachname: "" };
  const m = sitz.mandant;
  const rolleId = sitz.rolle === "betreiber" ? "betreiber" : (p.rolle || "mitarbeiter");
  const tour = useTour(true);
  const st = tourStand(p, rolleId, tour);
  const t = (tour || {})[rolleId] || (tour || {}).mitarbeiter;
  const [gespeichert, setGespeichert] = useState(null);
  const melde = (was) => { setGespeichert(was); setTimeout(() => setGespeichert(null), 2200); };
  /* Sicherungen (WP-25): Was die Rolle darf, sagt der Server über den
     Zugang (rolle aus dem Zugangscode), nicht die Rolle der Person im Plan. */
  const serverRolle = (SP.zugangsdaten() || {}).rolle || null;
  const [sicherungsRunde, setSicherungsRunde] = useState(0);
  /* Eine schlichte Rückmeldung am oberen Rand — die Anwendung hat dafür
     keinen eigenen Baustein, und für zwei Zeilen lohnt keiner. */
  const Hinweis = ({ children }) => <div role="status" className="toast">{children}</div>;

  /* Die Beschriftung steht links, das Bedienelement rechts — für das Auge
     eindeutig, für eine Vorlesesoftware zunächst nicht: Sie liest den Titel
     als Fließtext und danach ein namenloses Feld. Die Verbindung entsteht
     erst durch die Auszeichnung als Gruppe mit benanntem Titel. */
  const Zeile = ({ titel, text, children }) => {
    const kennung = `einst-${String(titel).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
    return (
      <div style={{ display: "flex", gap: 20, padding: "18px var(--pad-x)",
        borderBottom: `1px solid ${C.lineSoft}`, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div id={kennung} style={{ fontSize: 14.5, fontWeight: 600 }}>{titel}</div>
          {text && <div style={{ fontSize: 13, color: C.dim, marginTop: 4, lineHeight: 1.55 }}>
            {text}</div>}
        </div>
        <div role="group" aria-labelledby={kennung} style={{ flexShrink: 0, maxWidth: "100%" }}>{children}</div>
      </div>);
  };


  return (
    <div>
      <H1 rubrik="Verwaltung"
        sub="Was du für dich einstellen kannst. Betriebliche Festlegungen wie Arbeitszeitregeln stehen unter Betrieb.">
        Einstellungen</H1>

      {gespeichert && <Hinweis>{gespeichert}</Hinweis>}

      <div className="spalten2">
      <div>
      {/* ------------------------- Darstellung ------------------------- */}
      <Card>
        <CardHead>Darstellung</CardHead>
        <Zeile titel="Dichte"
          text="Kompakt zeigt mehr auf einmal, komfortabel ist ruhiger zu lesen.">
          <Seg value={p.dichte || "komfortabel"}
            onChange={(v) => { akt.setzeMeineEinstellung("dichte", v); melde("Dichte geändert."); }}
            options={[{ id: "komfortabel", label: "Komfortabel" }, { id: "kompakt", label: "Kompakt" }]} />
        </Zeile>
        <Zeile titel="Farbstimmung"
          text={"Vorgabe ist die Einstellung des Geräts. Dunkel schont die Augen im Nachtdienst — wer will, legt Hell oder Dunkel fest."}>
          <Seg value={p.thema || "auto"}
            onChange={(v) => { akt.setzeMeineEinstellung("thema", v);
              melde(v === "dunkel" ? "Dunkle Ansicht." : v === "hell" ? "Helle Ansicht."
                : "Folgt dem Gerät."); }}
            options={[{ id: "hell", label: "Hell" }, { id: "dunkel", label: "Dunkel" },
              { id: "auto", label: "Wie das Gerät" }]} />
        </Zeile>
        <Zeile titel="Erhöhter Kontrast"
          text="Verstärkt Ränder und Schrift. Hilft bei hellem Umgebungslicht und schwacher Sicht.">
          <Schalter an={!!p.kontrastmodus} label="Erhöhter Kontrast"
            onChange={(v) => { akt.setzeMeineEinstellung("kontrastmodus", v);
              melde(v ? "Kontrast erhöht." : "Kontrast normal."); }} />
        </Zeile>
        <Zeile titel="Bewegung reduzieren"
          text="Schaltet Übergänge und Animationen ab.">
          <Schalter an={!!p.wenigerBewegung} label="Bewegung reduzieren"
            onChange={(v) => { akt.setzeMeineEinstellung("wenigerBewegung", v); melde("Übernommen."); }} />
        </Zeile>
        <Zeile titel="Startansicht"
          text="Womit die Anwendung nach dem Anmelden öffnet.">
          <Sel value={p.startansicht || "start"} aria-label="Startansicht"
            onChange={(e) => { akt.setzeMeineEinstellung("startansicht", e.target.value);
              melde("Startansicht geändert."); }}>
            {(sitz.mandant ? NAV_KUNDE.filter((v) => ansichtErlaubt(sitz, v[2])) : [])
              .slice(0, 12).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>))}
          </Sel>
        </Zeile>
      </Card>

      {/* --------------------------- Zugang ---------------------------- */}
      <Card>
        <CardHead>Zugang</CardHead>
        <Zeile titel="Anmeldeadresse"
          text="Unter dieser Adresse erreichen dich Mitteilungen. Eine Änderung wird dem Betreiber angezeigt.">
          <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
            <Inp type="email" defaultValue={p.email || ""} id="ein-mail" aria-label="Anmeldeadresse"
              placeholder="name@betrieb.de" style={{ minWidth: 0, flex: "1 1 200px" }} />
            <Btn size="sm" onClick={() => {
              const el = document.getElementById("ein-mail");
              if (!el) return;
              const wert = el.value.trim();
              if (wert && !wert.includes("@")) { melde("Das sieht nicht nach einer Adresse aus."); return; }
              akt.setzeAnmeldeadresse(wert);
              melde("Adresse geändert.");
            }}>Übernehmen</Btn>
          </div>
        </Zeile>
        {p.emailGeaendert && (
          <Zeile titel="Zuletzt geändert"
            text={`Am ${fLang(String(p.emailGeaendert).slice(0, 10))} — der Betreiber wurde unterrichtet.`}>
            <Pill size="sm" tone="accent">vermerkt</Pill>
          </Zeile>)}
        <Zeile titel="Rolle"
          text="Wird von der Organisationsleitung vergeben und lässt sich hier nicht ändern.">
          <Pill tone="accent">{ROLLEN.find((r) => r.id === p.rolle)?.label || sitz.rolle}</Pill>
        </Zeile>
      </Card>

      {/* ------------------------ Geführte Tour ------------------------
          Der Inhalt kommt nachgeladen. Bis er da ist, bleibt die Karte weg —
          eine Karte mit leeren Feldern sieht aus wie ein Fehler. */}
      {t && (<Card>
        <CardHead right={st.anteil > 0 ? <Lab>{st.anteil} % durch</Lab> : null}>
          Geführte Tour</CardHead>
        <Zeile titel={t.titel}
          text={`${t.einleitung} Dauer: ${t.dauer}, ${st.gesamt} Schritte.`}>
          <div style={{ display: "flex", gap: 9 }}>
            {st.gesehen.length > 0 && !st.fertig && (
              <Btn size="sm" onClick={() => { akt.tourStarten(false); melde("Tour fortgesetzt."); }}>
                Fortsetzen</Btn>)}
            <Btn size="sm" kind="primary" onClick={() => { akt.tourStarten(true);
              melde("Tour beginnt von vorn."); }}>
              {st.gesehen.length ? "Von vorn" : "Starten"}</Btn>
          </div>
        </Zeile>
        <Zeile titel="Beim Anmelden anzeigen"
          text="Solange die Tour nicht abgeschlossen ist, startet sie beim Öffnen von selbst.">
          <Schalter an={!st.unterdrueckt} label="Tour beim Anmelden"
            onChange={(v) => { akt.setzeTourAnzeige(v);
              melde(v ? "Tour wird wieder angezeigt." : "Tour wird nicht mehr angezeigt."); }} />
        </Zeile>
        {st.fertig && (
          <Zeile titel="Abgeschlossen"
            text="Du hast die Tour vollständig durchlaufen. Sie lässt sich jederzeit erneut starten.">
            <Pill size="sm" tone="ok">fertig</Pill>
          </Zeile>)}

        {/* Kapitelweise einsteigen. Vierundvierzig Schritte am Stück macht
            niemand; ein Kapitel von sechs schon. */}
        <div style={{ padding: "16px var(--pad-x) 20px" }}>
          <Lab style={{ marginBottom: 9 }}>Kapitel</Lab>
          <div style={{ display: "grid", gap: 7 }}>
            {tourKapitel(tour, rolleId, st.gesehen).map((k) => (
              <div key={k.idx} style={{ display: "flex", gap: 12, alignItems: "center",
                padding: "9px 12px", borderRadius: "var(--r)", border: `1px solid ${C.lineSoft}`,
                flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, flex: 1, minWidth: 160, display: "inline-flex", gap: 7,
                  alignItems: "center", color: k.fertig ? C.dim : C.text }}>
                  {k.fertig && <Icon n="haken" size={14} strokeWidth={2.3} />}{k.name}</span>
                <span style={{ fontSize: 12, color: C.dimmer, ...NUM }}>
                  {k.gesehen} von {k.anzahl}</span>
                <Btn size="sm" kind={k.fertig ? "plain" : "quiet"}
                  onClick={() => { akt.tourAbKapitel(k.von); melde(`„${k.name}" gestartet.`); }}>
                  {k.gesehen ? "Erneut" : "Starten"}</Btn>
              </div>))}
          </div>
        </div>
      </Card>)}

      {/* ------------------- Kalender und Weckzeiten ------------------- */}
      {sitz.mandant && sitz.person && sitz.person.imSchichtdienst !== false && (
        <Card>
          <CardHead>Kalender und Weckzeiten</CardHead>

          <Zeile titel="Dienstplan im eigenen Kalender"
            text={p.kalenderVerweis
              ? "Der Verweis ist eingerichtet. Er aktualisiert sich von selbst, wenn sich dein Plan ändert."
              : "Abonniere deinen Plan in Apple, Google oder Outlook. Er aktualisiert sich dann von selbst — du musst nichts abtippen."}>
            <div style={{ display: "flex", gap: 9 }}>
              {p.kalenderVerweis && (
                <Btn size="sm" onClick={() => {
                  try { navigator.clipboard.writeText(p.kalenderVerweis); melde("Verweis kopiert."); }
                  catch { melde("Kopieren nicht möglich."); }
                }}>Verweis kopieren</Btn>)}
              <Btn size="sm" kind={p.kalenderVerweis ? undefined : "primary"}
                onClick={async () => { await akt.kalenderEinrichten();
                  melde(p.kalenderVerweis ? "Neuer Verweis erzeugt." : "Kalender eingerichtet."); }}>
                {p.kalenderVerweis ? "Neu erzeugen" : "Einrichten"}</Btn>
            </div>
          </Zeile>

          {p.kalenderVerweis && (<>
            <Zeile titel="Dein Verweis"
              text="Wer ihn hat, sieht deine Dienste. Nicht öffentlich teilen — bei Verdacht neu erzeugen.">
              <code style={{ fontSize: 11.5, padding: "7px 11px", borderRadius: 8,
                background: C.bg, border: `1px solid ${C.line}`, maxWidth: 300,
                display: "block", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", ...NUM }}>{p.kalenderVerweis}</code>
            </Zeile>
            <Zeile titel="Abschalten"
              text="Der Verweis wird ungültig, abonnierte Kalender leeren sich.">
              <Btn size="sm" onClick={async () => { await akt.kalenderLoeschen();
                melde("Kalender abgeschaltet."); }}>Entfernen</Btn>
            </Zeile>
          </>)}

          <Zeile titel="Weckruf zur Schicht"
            text="CENTRIC kennt deinen Plan — der Weckruf richtet sich danach, ohne dass du etwas einträgst.">
            <Schalter an={!!(p.weckzeit || {}).aktiv} label="Weckruf"
              onChange={(v) => { akt.setzeWeckzeit({ aktiv: v });
                melde(v ? "Weckruf eingeschaltet." : "Weckruf aus."); }} />
          </Zeile>
          {(p.weckzeit || {}).aktiv && (<>
            <Zeile titel="Vorlauf zum Aufstehen"
              text="Wie lange du vom Wecken bis zum Losfahren brauchst.">
              <Sel value={(p.weckzeit || {}).vorlauf || 75}
                onChange={(e) => akt.setzeWeckzeit({ vorlauf: Number(e.target.value) })}>
                {[30, 45, 60, 75, 90, 120].map((v) => (
                  <option key={v} value={v}>{v} Minuten</option>))}</Sel>
            </Zeile>
            <Zeile titel="Anfahrt"
              text="Wird zum Vorlauf addiert.">
              <Sel value={(p.weckzeit || {}).anfahrt ?? 20}
                onChange={(e) => akt.setzeWeckzeit({ anfahrt: Number(e.target.value) })}>
                {[0, 10, 15, 20, 30, 45, 60].map((v) => (
                  <option key={v} value={v}>{v === 0 ? "keine" : `${v} Minuten`}</option>))}</Sel>
            </Zeile>
            {(() => {
              const k = kommendeWeckzeiten(m, p.id, 7);
              return (
                <Zeile titel="Die nächsten Weckrufe"
                  text={k.length ? "" : "In den nächsten sieben Tagen hast du keinen Dienst."}>
                  {k.length > 0 && (
                    <div style={{ display: "grid", gap: 5, fontSize: 13, textAlign: "right" }}>
                      {k.slice(0, 4).map((w, i) => (
                        <div key={i}>
                          <b style={{ ...NUM }}>{w.zeit}</b>
                          <span style={{ color: C.dim }}>
                            {" "}{fKurz(w.datum)}{w.vortag ? " (Vortag)" : ""} · {w.dienst}</span>
                        </div>))}
                    </div>)}
                </Zeile>);
            })()}
          </>)}

          <Zeile titel="Verfügbarkeit teilen"
            text="Zeigt der Familie nur, wann du frei bist — keine Dienstart, kein Ort, kein Betriebsname.">
            <Btn size="sm" onClick={() => { akt.verfuegbarkeitTeilen(14);
              melde("Übersicht in die Zwischenablage kopiert."); }}>
              Nächste 14 Tage</Btn>
          </Zeile>
        </Card>)}


      {/* ----------------------- Datenschutz --------------------------- */}
      {sitz.mandant ? (<Card>
        <CardHead>Deine Daten</CardHead>
        <Zeile titel="Auskunft nach Artikel 15"
          text="Alles, was über dich gespeichert ist, als Datei.">
          <Btn size="sm" onClick={() => { akt.auskunftErzeugen(p.id); melde("Auskunft erzeugt."); }}>
            Erzeugen</Btn>
        </Zeile>
        <Zeile titel="Was gespeichert wird"
          text="Dienste, Zeiten, Anträge, Qualifikationen und Nachweise. Beim Stempeln werden Ergebnis, grob gerundete Entfernung, Messgenauigkeit und Prüfort festgehalten — keine Koordinate, kein Verlauf.">
          <Btn size="sm" kind="quiet" onClick={() => gehZu("handbuch")}>Im Handbuch</Btn>
        </Zeile>
        <Zeile titel="Verbindung trennen"
          text="Meldet dich auf diesem Gerät ab. Der Zugangscode bleibt gültig.">
          <Btn size="sm" onClick={() => akt.verbindungTrennen()}>Abmelden</Btn>
        </Zeile>
      </Card>) : (<Card>
        <CardHead>Zugang</CardHead>
        <Zeile titel="Verbindung trennen"
          text="Meldet dich auf diesem Gerät ab.">
          <Btn size="sm" onClick={() => akt.verbindungTrennen()}>Abmelden</Btn>
        </Zeile>
      </Card>)}
      </div>
      <div>
      {/* ---------------------- Benachrichtigungen --------------------- */}
      {sitz.mandant && <Card>
        <CardHead>Benachrichtigungen</CardHead>
        <Zeile titel="Mitteilungen auf diesem Gerät"
          text={SP.pushMoeglich()
            ? "Bei kurzfristigen Änderungen wirst du sofort unterrichtet."
            : "Dieses Gerät unterstützt keine Mitteilungen. Auf dem iPhone muss CENTRIC dafür auf dem Startbildschirm liegen."}>
          <Schalter an={SP.pushErlaubt()} label="Mitteilungen"
            onChange={(v) => akt.pushUmschalten(v)} />
        </Zeile>
        {/* WP-30: Sammelschalter je Kanal — aus bedeutet: über diesen Weg geht nichts hinaus. */}
        {[["mail", "E-Mail insgesamt", "Aus: keine Benachrichtigung per E-Mail, gleich welche Art."],
          ["push", "Gerätemitteilungen insgesamt", "Aus: keine Benachrichtigung auf dieses oder ein anderes Gerät."]].map(([weg, titel, text]) => {
          const an = !(p.zustellung && p.zustellung.kanal && p.zustellung.kanal[weg] === false);
          return (
            <Zeile key={weg} titel={titel} text={text}>
              <Schalter an={an} label={titel} onChange={(v) => akt.setzeZustellungKanal(p.id, weg, v)} />
            </Zeile>);
        })}
        {Object.entries(ZUSTELLARTEN).map(([id, a]) => {
          const w = zustellwege(p, id);
          return (
            <Zeile key={id} titel={a.titel} text={a.text}>
              <div style={{ display: "flex", gap: 8 }}>
                {[["mail", "E-Mail", w.mail], ["push", "Gerät", w.push]].map(([weg, label, an]) => (
                  <button key={weg} type="button" className="chip" aria-pressed={!!an}
                    onClick={() => akt.setzeZustellung(p.id, id, weg, !an)}
                    style={{ minWidth: 82, justifyContent: "center", fontWeight: 600,
                      borderColor: an ? C.accent : undefined,
                      background: an ? C.accentLight : C.flaeche, color: an ? C.accent : C.dim }}>
                    {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{label}</button>))}
              </div>
            </Zeile>);
        })}
      </Card>}

      {/* ------------------- Nur für die Leitung ----------------------- */}
      {sitz.mandant && darf(sitz, "mandant.edit") && (
        <Card>
          <CardHead>Für den Betrieb</CardHead>
          <Zeile titel="Arbeitszeitregeln, Standorte, Dienstarten"
            text="Betriebliche Festlegungen stehen getrennt — sie gelten für alle, nicht nur für dich.">
            <Btn size="sm" onClick={() => gehZu("betrieb")}>Zum Betrieb</Btn>
          </Zeile>
          <Zeile titel="Datenmitnahme"
            text="Alle Daten als CSV, jederzeit, ohne Gebühr.">
            <Btn size="sm" onClick={() => gehZu("mitnahme")}>Öffnen</Btn>
          </Zeile>
          <Zeile titel="Sicherung anlegen"
            text="Legt eine Kopie des heutigen Standes an. Zurückspielen kann die Leitung unten unter „Sicherungen“.">
            <Btn size="sm" onClick={async () => { await akt.sicherungAnlegen(); melde("Sicherung angelegt."); setSicherungsRunde((n) => n + 1); }}>
              Jetzt sichern</Btn>
          </Zeile>
        </Card>)}

      {/* WP-I4: interne Vorgaben verwalten — nur org.edit (Leitung, Kundenrolle); der Server entscheidet ebenso. */}
      {sitz.mandant && darf(sitz, "org.edit") && <InterneVorgaben sitz={sitz} akt={akt} />}

      {/* ------------- Sicherungen: Liste und Zurückspielen (WP-25) ------------- */}
      {sitz.mandant && SP.angemeldet() && darfSicherungenSehen(serverRolle) && (
        <SicherungenVerwalten key={sicherungsRunde} rolle={serverRolle}
          laden={akt.sicherungenLaden} zurueckspielen={akt.zurueckspielen} />)}

      </div>
      </div>
    </div>);
}

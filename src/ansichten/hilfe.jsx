/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { rolle } from "../lib/rollen.js";
import { Icon } from "../gestalt/icons.jsx";
import { C } from "../farben.js";
import { Btn, H1, Card, CardHead, Lab } from "../ui/bausteine.jsx";
import { KONTAKT_UNGESETZT, HILFE_ZEITEN, hilfeVerweis, HILFE_MAIL, HILFE_TELEFON } from "../kontakt.js";
import { Hinweisband, Leitraster } from "../gestalt/ansichten.jsx";
import { HilfeFrage } from "./hilfe-frage.jsx";

/* ==========================================================================
   HILFE UND KONTAKT

   Bis hierher endete jede Frage, die das Handbuch nicht beantwortet, im
   Nichts: keine Adresse, keine Nummer, kein Hinweis, wohin man sich wendet.
   Für eine Software, die nachts im Schichtdienst läuft, ist das die
   auffälligste Lücke — dort ist niemand, den man kurz fragen kann.

   Der Verweis nimmt Betrieb, Rolle und Ansicht mit. Das spart die erste
   Rückfrage, die sonst immer aus denselben vier Fragen besteht.
   ========================================================================== */
export function Hilfe({ sitz, gehZu }) {
  const m = sitz.mandant || {};
  const rollenName = sitz.rolle === "betreiber"
    ? "Betreiber" : (rolle(sitz.person.rolle) || {}).label || sitz.person.rolle;

  /* Eine Zeile: Symbol (nur bei den Wegen im Haus), Titel, Satz, Knopf. */
  const Weg = ({ titel, text, knopf, aufKlick, href, symbol }) => (
    <div className="wegzeile">
      {symbol && <span className="wegsymbol" aria-hidden="true"><Icon n={symbol} size={20} /></span>}
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>{titel}</div>
        <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55 }}>{text}</div>
      </div>
      {href
        ? <a href={href} style={{ textDecoration: "none" }}>
            <Btn size="sm" kind="primary">{knopf}</Btn></a>
        : <Btn size="sm" onClick={aufKlick}>{knopf}</Btn>}
    </div>);

  return (
    <div>
      <H1 sub="Zuerst das Handbuch — es beantwortet die meisten Fragen an Ort und Stelle. Was dort nicht steht, geht an uns."
        right={<Btn kind="primary" onClick={() => gehZu("handbuch")}>Handbuch öffnen</Btn>}>
        Hilfe</H1>

      {KONTAKT_UNGESETZT && (
        <Hinweisband ton="warn">
          <strong style={{ fontWeight: 640, color: C.text }}>Kontaktadresse noch nicht gesetzt.</strong>{" "}
          Die Anwendung zeigt den Platzhalter aus den Rechtstexten. Die richtige
          Adresse kommt aus der Umgebungsvariablen VITE_KONTAKT_MAIL — siehe
          rechtliches/PLATZHALTER.md.
        </Hinweisband>)}

      <Leitraster seiteBreite={1}
        haupt={<>
          <HilfeFrage />

          <Card>
            <CardHead>Selbst nachsehen</CardHead>
            <div className="wegliste">
              <Weg titel="Handbuch" knopf="Öffnen" aufKlick={() => gehZu("handbuch")} symbol="buch"
                text="Jede Ansicht, jeder Begriff, jede Regel — nach Aufgaben geordnet und durchsuchbar." />
              <Weg titel="Ablauf einrichten" knopf="Öffnen" aufKlick={() => gehZu("ablauf")} symbol="pruefliste"
                text="Was für einen einsatzbereiten Betrieb noch fehlt, in der Reihenfolge, in der es zu tun ist." />
              <Weg titel="Rechtliche Angaben" knopf="Öffnen" aufKlick={() => gehZu("rechtliches")} symbol="schild"
                text="Impressum, Datenschutzerklärung, Geschäftsbedingungen und die Unterlagen zur Auftragsverarbeitung." />
            </div>
          </Card>

          <Card>
            <CardHead right={<Lab>{HILFE_ZEITEN}</Lab>}>Uns fragen</CardHead>
            <div className="wegliste">
              <Weg titel="Etwas funktioniert nicht" knopf="E-Mail schreiben"
                href={hilfeVerweis({ betreff: "CENTRIC — Störung", betrieb: m.name,
                  rolle: rollenName, ansicht: "Hilfe",
                  zusatz: "Was ich getan habe:\n\nWas ich erwartet habe:\n\nWas stattdessen geschah:\n" })}
                text="Betrieb, Rolle und Fassung werden mitgeschickt — das spart die erste Rückfrage." />
              <Weg titel="Etwas fehlt oder soll anders sein" knopf="Vorschlag senden"
                href={hilfeVerweis({ betreff: "CENTRIC — Vorschlag", betrieb: m.name, rolle: rollenName,
                  zusatz: "Mein Vorschlag:\n\nWarum das im Betrieb hilft:\n" })}
                text="Was im Alltag hakt, ist der beste Hinweis darauf, was als Nächstes zu bauen ist." />
              <Weg titel="Vertrag, Tarif, Rechnung" knopf="E-Mail schreiben"
                href={hilfeVerweis({ betreff: "CENTRIC — Vertrag", betrieb: m.name, rolle: rollenName })}
                text="Verlängern, wechseln, kündigen, Rechnungsanschrift ändern." />
              <Weg titel="Auskunft, Löschung, Datenschutz" knopf="E-Mail schreiben"
                href={hilfeVerweis({ betreff: "CENTRIC — Datenschutz", betrieb: m.name, rolle: rollenName,
                  zusatz: "Anliegen nach Artikel 15 bis 21 DSGVO:\n" })}
                text="Anträge betroffener Personen beantwortet der Betrieb selbst — unter Verwaltung → Datenschutz. Was dort nicht geht, geht an uns." />

              <div style={{ marginTop: 6, padding: "14px var(--pad-x) 2px", borderTop: `1px solid ${C.lineSoft}`,
                fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
                E-Mail: <a href={`mailto:${HILFE_MAIL}`} style={{ color: C.accent }}>{HILFE_MAIL}</a>
                {HILFE_TELEFON && <> · Telefon: <a href={`tel:${HILFE_TELEFON.replace(/[^+0-9]/g, "")}`}
                  style={{ color: C.accent }}>{HILFE_TELEFON}</a></>}
              </div>
            </div>
          </Card>
        </>} />
    </div>);
}

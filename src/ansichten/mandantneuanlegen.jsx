/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState } from "react";
import * as SP from "../speicher.js";
import { C } from "../farben.js";
import { Card, CardHead, Lab, Btn, Inp, Sel, Field } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { zahl } from "../lib/format.js";
import { ANWENDUNG_URL } from "../kontakt.js";
import { BETREIBER_LEER } from "../lib/fachlogik.js";
import { ROLLEN } from "../lib/rollen.js";
import { mandantAnlegen } from "../lib/mandant-anlage.js";


/* ==========================================================================
   MANDANT ANLEGEN — Betreiberansicht
   Ein Formular, ein Knopf, danach die Zugangscodes. Sie erscheinen genau
   einmal; danach sind sie nur noch als Prüfsumme gespeichert und lassen
   sich nicht wiederherstellen. Deshalb steht das auch so dort.
   ========================================================================== */
export function MandantNeuAnlegen({ db, akt, onFertig }) {
  const [name, setName] = useState("");
  const [branche, setBranche] = useState("sicherheit");
  const [anschrift, setAnschrift] = useState("");
  const [kontakt, setKontakt] = useState("");
  const [extra, setExtra] = useState(["subplaner", "mitarbeiter"]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  /* SI-P6: Code des zweiten Faktors; und: steht der Raum schon, fehlen nur noch die Zugänge (kein zweites Anlegen). */
  const [faktor, setFaktor] = useState("");
  const [angelegt, setAngelegt] = useState(null);

  const raum = name.trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  const anlegen = async () => {
    if (!name.trim() || laeuft) return;
    setLaeuft(true); setFehler(null);
    try {
      const m = angelegt ? angelegt.m : mandantAnlegen({ name: name.trim(), branche, anschrift, kontakt,
        zusatzRollen: extra });
      const zielRaum = angelegt ? angelegt.raum : raum;
      /* Erst der Raum, dann die Zugänge. Andersherum gäbe es Codes, die
         ins Leere führen. */
      if (!angelegt) {
        await SP.bestandAnlegen(raum, { version: 5, mandanten: [m], session: null,
          tarife: db.tarife, betreiber: db.betreiber || BETREIBER_LEER, stand: 1 });
        setAngelegt({ m, raum });
      }
      const codes = await SP.zugaengeErzeugen(zielRaum,
        m.personen.map((p) => ({ rolle: p.rolle, personId: p.id, name: m.name })), faktor.trim());
      setFaktor("");
      setErgebnis({ mandant: m, raum: zielRaum, codes: codes.map((c) => ({ ...c,
        label: ROLLEN.find((r) => r.id === c.rolle)?.label || c.rolle })) });
      akt.mandantVermerken({ id: m.id, name: m.name, branche, raum: zielRaum,
        angelegt: new Date().toISOString(), zugaenge: codes.length });
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(false); }
  };

  if (ergebnis) return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ padding: "20px 22px", borderRadius: 12, background: C.okLight,
        border: `1px solid ${C.ok}33` }}>
        <div style={{ fontSize: 17, fontWeight: 640, marginBottom: 6 }}>
          {ergebnis.mandant.name} ist angelegt</div>
        <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6 }}>
          Der Betrieb startet leer — kein Beispielpersonal, keine erfundenen Dienstpläne.
          Ein Standort, drei Dienstarten und die gesetzlichen Grundwerte sind vorbereitet.
        </div>
      </div>

      <Card>
        <CardHead right={<Lab>{zahl(ergebnis.codes.length)} Zugänge</Lab>}>Zugangscodes</CardHead>
        <div style={{ padding: "16px var(--pad-x)", fontSize: 13.5, color: C.danger,
          lineHeight: 1.55, borderBottom: `1px solid ${C.lineSoft}` }}>
          <b>Jetzt notieren.</b> Die Codes werden nur als Prüfsumme gespeichert und lassen
          sich nicht wiederherstellen. Geht einer verloren, muss ein neuer erzeugt werden.
        </div>
        {ergebnis.codes.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16,
            padding: "15px var(--pad-x)",
            borderBottom: i < ergebnis.codes.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>
                {ROLLEN.find((r) => r.id === c.rolle)?.beschreibung || ""}</div>
            </div>
            <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".08em",
              padding: "9px 14px", borderRadius: 8, background: C.bg,
              border: `1px solid ${C.line}`, ...NUM }}>{c.code}</code>
            <Btn size="sm" onClick={() => {
              try { navigator.clipboard.writeText(c.code); } catch { /* egal */ }
            }}>Kopieren</Btn>
          </div>))}
        <div style={{ padding: "16px var(--pad-x)", display: "flex", gap: 10 }}>
          <Btn onClick={() => {
            const txt = [`CENTRIC — Zugänge für ${ergebnis.mandant.name}`, "",
              ...ergebnis.codes.map((c) => `${c.label.padEnd(24)} ${c.code}`),
              "", ANWENDUNG_URL,
              "Der Code gilt zwölf Stunden je Anmeldung.",
              "Beim ersten Öffnen startet die geführte Tour."].join("\\n");
            const b = new Blob([txt], { type: "text/plain;charset=utf-8" });
            const u = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = u; a.download = `zugaenge-${ergebnis.raum}.txt`; a.click();
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          }}>Als Datei sichern</Btn>
          <Btn kind="primary" onClick={onFertig}>Fertig</Btn>
        </div>
      </Card>
    </div>);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Name des Betriebs" hint="Erscheint in der Anwendung und auf Rechnungen.">
        <Inp value={name} autoFocus onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Nordwacht Sicherheitsdienste" /></Field>

      {name.trim() && (
        <div style={{ fontSize: 13, color: C.dim, marginTop: -8 }}>
          Datenraum: <code style={{ ...NUM }}>{raum}</code>
        </div>)}

      <Field label="Branche" hint="Bestimmt Begriffe und verfügbare Pakete.">
        <Sel value={branche} onChange={(e) => setBranche(e.target.value)}>
          <option value="sicherheit">Sicherheitsdienst</option>
          <option value="pflege">Pflege</option>
          <option value="klinik">Klinik</option>
          <option value="industrie">Produktion</option>
          <option value="sonstige">Sonstige</option>
        </Sel></Field>

      <Field label="Anschrift"><Inp value={anschrift}
        onChange={(e) => setAnschrift(e.target.value)} placeholder="Straße, PLZ Ort" /></Field>
      <Field label="Ansprechpartner"><Inp value={kontakt}
        onChange={(e) => setKontakt(e.target.value)} placeholder="Name, Telefon" /></Field>

      <div>
        <Lab>Zugänge</Lab>
        <div style={{ fontSize: 13, color: C.dim, margin: "6px 0 12px", lineHeight: 1.55 }}>
          Organisationsleitung und Planung entstehen immer. Weitere kannst du gleich
          mitgeben oder später erzeugen.
        </div>
        <div style={{ display: "grid", gap: 9 }}>
          {[["leitung", "Organisationsleitung", true], ["planer", "Planung", true],
            ["subplaner", "Schichtverantwortung", false],
            ["mitarbeiter", "Beschäftigte", false],
            ["betriebsrat", "Betriebsrat (kostenfrei)", false]].map(([id, label, fest]) => (
            <label key={id} style={{ display: "flex", alignItems: "center", gap: 11,
              padding: "11px 14px", borderRadius: 10, cursor: fest ? "default" : "pointer",
              border: `1px solid ${fest || extra.includes(id) ? C.accent : C.line}`,
              background: fest || extra.includes(id) ? C.accentLight : "transparent" }}>
              <input type="checkbox" disabled={fest} checked={fest || extra.includes(id)}
                onChange={(e) => setExtra(e.target.checked
                  ? [...extra, id] : extra.filter((x) => x !== id))}
                style={{ width: 17, height: 17, accentColor: C.accent }} />
              <span style={{ fontSize: 14, fontWeight: 550 }}>{label}</span>
              {fest && <span style={{ fontSize: 12, color: C.dim, marginLeft: "auto" }}>
                immer dabei</span>}
            </label>))}
        </div>
      </div>

      <Field label="Code aus der Authenticator-App (zweiter Faktor)"
        hint={angelegt
          ? "Der Betrieb steht schon. Es fehlen nur die Zugänge: bitte den nächsten Code abwarten und eingeben."
          : "Pflicht, sobald für deinen Betreibercode ein zweiter Faktor eingerichtet ist. Jeder Code gilt nur einmal."}>
        <Inp value={faktor} inputMode="numeric" autoComplete="one-time-code" maxLength={16}
          onChange={(e) => setFaktor(e.target.value)} placeholder="6-stelliger Code" /></Field>

      {fehler && (
        <div role="alert" style={{ padding: "13px 16px", borderRadius: 10,
          background: C.dangerLight, color: C.danger, fontSize: 13.5, lineHeight: 1.5 }}>
          {fehler}</div>)}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Btn kind="quiet" onClick={onFertig}>Abbrechen</Btn>
        <Btn kind="primary" disabled={!name.trim() || laeuft} onClick={anlegen}>
          {laeuft ? "Wird angelegt …" : "Anlegen und Zugänge erzeugen"}</Btn>
      </div>
    </div>);
}

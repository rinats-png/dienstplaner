/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect } from "react";
import * as SP from "../speicher.js";
import { brancheVon } from "../../server/lib/branchen.mjs";
import { H1, Seg, Btn, Card, Leer, CardHead, Lab, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { zahl } from "../lib/format.js";
import { fKurz } from "../lib/datum.js";

/* ==========================================================================
   SELBSTSTARTS — die Nachfassliste

   Wer sich selbst einen Betrieb angelegt hat, taucht hier auf. Das ist die
   Liste, die man abends durchgeht: Wer hat angefangen, wer ist steckengeblieben,
   bei wem lohnt ein Anruf.

   Die Daten liegen serverseitig, nicht im Mandantenbestand — ein Selbststart
   gehört keinem Betrieb, er ist ein Vorgang zwischen Interessent und
   Betreiber.
   ========================================================================== */
export function Selbststarts({ db, akt }) {
  const [stand, setStand] = useState(null);
  const [laeuft, setLaeuft] = useState(true);
  const [fehler, setFehler] = useState(null);
  const [tage, setTage] = useState(30);
  const [loescht, setLoescht] = useState(null);   // Raum, der gerade gelöscht wird
  const [hinweis, setHinweis] = useState(null);

  const laden = async (t) => {
    setLaeuft(true); setFehler(null);
    try { setStand(await SP.lage(t || tage)); }
    catch (e) { setFehler(e.message); }
    finally { setLaeuft(false); }
  };
  useEffect(() => { laden(tage); }, [tage]);

  /* Einen Testbetrieb endgültig löschen — Bestand, Monate, Sicherungen,
     Zugangscodes, Sitzungen und der Vermerk in dieser Liste. Bis hierher
     gab es dafür keinen Knopf: Selbststarts sind keine Mandanten der
     Konsole, und nur für die gab es einen. Der Server verlangt den Namen
     noch einmal; deshalb wird er hier abgefragt und nicht nur bestätigt. */
  const raumLoeschen = async (s) => {
    const eingabe = window.prompt(`Löscht den Testbetrieb „${s.name}" unwiderruflich — `
      + "Personal, Pläne, Sicherungen und alle Zugangscodes.\n\n"
      + `Zur Bestätigung den Raumnamen eingeben:\n\n${s.raum}`);
    if (eingabe === null) return;
    if (eingabe.trim() !== s.raum) { setFehler("Löschung abgebrochen — der Raumname stimmte nicht."); return; }
    setLoescht(s.raum); setFehler(null); setHinweis(null);
    try {
      const r = await SP.raumLoeschen(s.raum);
      setHinweis(`Datenraum „${s.raum}" gelöscht (${r.geloescht} Einträge).`);
      await laden();
    } catch (e) { setFehler(e.message); }
    finally { setLoescht(null); }
  };

  const liste = (stand && stand.selbststarts) || [];
  /* Nicht noch eine Tabelle: der Name kommt aus dem Branchenprofil, und
     alte Kennungen führt brancheVon selbst zurück. */
  const brancheName = (id) => brancheVon(id).name;

  /* Wie alt ist der Vorgang, und wie lange läuft der Test noch? */
  const tageSeit = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const restTage = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

  const frisch = liste.filter((s) => tageSeit(s.angelegt) <= 3);
  const laeuftAus = liste.filter((s) => { const r = restTage(s.laeuftAb);
    return r > 0 && r <= 7; });
  const abgelaufen = liste.filter((s) => restTage(s.laeuftAb) <= 0);
  const mitMail = liste.filter((s) => s.email);

  return (
    <div>
      <H1 rubrik="Betreiber"
        sub="Wer sich selbst einen Testbetrieb angelegt hat. Die Liste, die man abends durchgeht — wer hat angefangen, bei wem lohnt ein Anruf."
        right={<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Seg value={String(tage)} onChange={(v) => setTage(Number(v))}
            options={[{ id: "7", label: "7 Tage" }, { id: "30", label: "30 Tage" },
              { id: "90", label: "90 Tage" }]} />
          <Btn size="sm" onClick={() => laden()}>Neu laden</Btn>
        </div>}>
        Selbststarts</H1>

      {fehler && (
        <Card style={{ marginBottom: 20, padding: "18px var(--pad-x)",
          borderColor: C.danger }}>
          <div style={{ color: C.danger, fontSize: 14 }}>{fehler}</div>
        </Card>)}
      {hinweis && (
        <Card style={{ marginBottom: 20, padding: "18px var(--pad-x)", borderColor: C.ok }}>
          <div style={{ fontSize: 14 }}>{hinweis}</div>
        </Card>)}

      {laeuft && !stand ? (
        <Card><div style={{ padding: "40px var(--pad-x)", textAlign: "center",
          color: C.dim, fontSize: 14 }}>Wird geladen …</div></Card>
      ) : (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 16, marginBottom: 26 }}>
          {[["Insgesamt", liste.length, `in ${tage} Tagen`, "text"],
            ["Neu", frisch.length, "letzte drei Tage", frisch.length ? "accent" : "text"],
            ["Läuft bald aus", laeuftAus.length, "in sieben Tagen",
              laeuftAus.length ? "warn" : "text"],
            ["Mit E-Mail", mitMail.length, "erreichbar",
              mitMail.length ? "ok" : "text"]].map(([label, wert, sub, ton]) => (
            <Card key={label} style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 12 }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.035em", ...NUM,
                color: ton === "warn" ? C.warn : ton === "ok" ? C.ok
                  : ton === "accent" ? C.accent : C.text }}>{zahl(wert)}</div>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 6 }}>{sub}</div>
            </Card>))}
        </div>

        {liste.length === 0 ? (
          <Card><Leer titel="Noch niemand"
            text="Wenn sich jemand über die Startseite selbst einen Betrieb anlegt, erscheint er hier — mit Name, Branche und E-Mail, sofern angegeben." /></Card>
        ) : (
          <Card style={{ marginBottom: 22 }}>
            <CardHead right={<Lab>neueste zuerst</Lab>}>Angelegte Betriebe</CardHead>
            {liste.map((s, i) => {
              const alt = tageSeit(s.angelegt);
              const rest = restTage(s.laeuftAb);
              const neu = alt <= 3;
              return (
                <div key={s.raum} style={{ padding: "16px var(--pad-x)",
                  borderBottom: i < liste.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                  background: neu ? C.accentLight : rest <= 0 ? C.flaecheStill : "transparent" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14,
                    flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9,
                        flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15.5, fontWeight: 620 }}>{s.name}</span>
                        {neu && <Pill size="sm" tone="accent">neu</Pill>}
                        {rest <= 0 && <Pill size="sm">abgelaufen</Pill>}
                        {rest > 0 && rest <= 7 && (
                          <Pill size="sm" tone="warn">noch {rest} Tage</Pill>)}
                      </div>
                      <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>
                        {brancheName(s.branche)} · {zahl(s.zugaenge)} Zugänge ·
                        {" "}{alt === 0 ? "heute" : alt === 1 ? "gestern" : `vor ${alt} Tagen`}
                      </div>
                      {s.email ? (
                        <a href={`mailto:${s.email}`}
                          style={{ display: "inline-block", fontSize: 13.5, marginTop: 8,
                            color: C.accent, fontWeight: 550 }}>{s.email}</a>
                      ) : (
                        <div style={{ fontSize: 13, color: C.dim, marginTop: 8,
                          fontStyle: "italic" }}>keine E-Mail angegeben</div>)}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12.5, color: C.dim,
                      minWidth: 120 }}>
                      <div style={{ ...NUM }}>{fKurz(s.angelegt.slice(0, 10))}</div>
                      <div style={{ marginTop: 4 }}>
                        {rest > 0 ? `Test bis ${fKurz(s.laeuftAb.slice(0, 10))}`
                          : `abgelaufen ${fKurz(s.laeuftAb.slice(0, 10))}`}</div>
                      <code style={{ display: "block", fontSize: 11, marginTop: 7,
                        color: C.aus, ...NUM }}>{s.raum}</code>
                      <Btn size="sm" kind="danger" style={{ marginTop: 10 }}
                        disabled={loescht !== null} onClick={() => raumLoeschen(s)}>
                        {loescht === s.raum ? "Wird gelöscht …" : "Datenraum löschen"}</Btn>
                    </div>
                  </div>
                </div>);
            })}
          </Card>)}

        {/* Was der Server sonst noch meldet — kurz gehalten, das Wesentliche
            steht oben. */}
        {stand && (
          <Card>
            <CardHead right={<Lab>Server, {tage} Tage</Lab>}>Betriebslage</CardHead>
            <div style={{ padding: "18px var(--pad-x)", display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 18 }}>
              {[["Vorgänge", stand.gesamt, null],
                ["Abgewiesen", stand.abgewiesen, stand.abgewiesen ? "warn" : null],
                ["Fehler", stand.fehler, stand.fehler ? "danger" : null],
                ["Auffällige Herkünfte", (stand.auffaellig || []).length,
                  (stand.auffaellig || []).length ? "warn" : null]].map(
                ([label, wert, ton]) => (
                <div key={label}>
                  <div style={{ fontSize: 12.5, color: C.dim }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 300, marginTop: 5, ...NUM,
                    color: ton === "danger" ? C.danger : ton === "warn" ? C.warn : C.text }}>
                    {zahl(wert || 0)}</div>
                </div>))}
            </div>
            {(stand.auffaellig || []).length > 0 && (
              <div style={{ padding: "0 var(--pad-x) 18px" }}>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.55, marginBottom: 10 }}>
                  Mehrfach abgewiesene Herkünfte. Kennungen sind gekürzte Prüfsummen —
                  keine Adressen im Klartext.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {stand.auffaellig.slice(0, 8).map((a, i) => (
                    <Pill key={i} size="sm" tone="warn">
                      {a.kennung.slice(0, 10)}… · {a.versuche}×</Pill>))}
                </div>
              </div>)}
          </Card>)}
      </>)}
    </div>);
}

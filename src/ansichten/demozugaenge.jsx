/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect } from "react";
import * as SP from "../speicher.js";

import { ROLLEN } from "../lib/rollen.js";
import { H1, Btn, Card, Laden, Leer, CardHead, Lab, Pill } from "../ui/bausteine.jsx";
import { C } from "../farben.js";
import { zahl } from "../lib/format.js";
import { NUM } from "../ui/thema.js";
import { fKurz } from "../lib/datum.js";

/* ==========================================================================
   DEMOZUGÄNGE — was auf der Startseite offensteht

   Dieselbe Liste, die jeder Besucher sieht, nur mit einem Knopf daneben.
   Bis hierher gab es keinen Ort, an dem der Betreiber sie überhaupt zu
   Gesicht bekam: Die Konsole zeigte die Mandanten des Demoraums, nicht
   die Zugänge dazu. Ein zweimal gelaufenes Bereitstellungsskript legte
   jeden Demozugang doppelt an, und die Startseite zeigte jeden Betrieb
   zweimal — ohne dass es in der Konsole zu sehen oder zu beheben war.

   Zurückgezogen wird über die öffentliche Kennung. Der Server prüft wie
   überall: Betreiber, frische Anmeldung, Bremse. Die Liste ist bis zu
   eine Minute zwischengespeichert; deshalb wird der Eintrag nach dem
   Zurückziehen sofort aus der Ansicht genommen, statt neu zu laden.
   ========================================================================== */
export function Demozugaenge() {
  const [liste, setListe] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [laeuft, setLaeuft] = useState(null);   // id des Eintrags, der gerade gesperrt wird
  const [hinweis, setHinweis] = useState(null);
  /* Die Konten des Demoraums — über die Sitzung, nicht über die
     öffentliche Liste. Nur so ist ein überzähliger Betreibercode zu sehen. */
  const [konten, setKonten] = useState(null);
  const [kontenFehler, setKontenFehler] = useState(null);

  const laden = async () => {
    setFehler(null); setKontenFehler(null);
    try { setListe(await SP.demos()); }
    catch (e) { setFehler(e.message); setListe([]); }
    try { setKonten(await SP.zugaengeUebersicht()); }
    catch (e) { setKontenFehler(e.message); setKonten({ zugaenge: [] }); }
  };
  useEffect(() => { laden(); }, []);

  /* Ein Konto über seine gekürzte Kennung sperren. Der eigene Zugang ist
     im Knopf abgeschaltet und wird vom Server zusätzlich abgewiesen. */
  const kontoSperren = async (z) => {
    const rolle = ROLLEN.find((r) => r.id === z.rolle)?.label || z.rolle;
    const frage = `Diesen Zugang sperren?\n\n${z.name || "(ohne Namen)"} · ${rolle}\n`
      + `Kennung ${z.kennung}${z.demo ? ` · Demo ${z.id}` : ""}\n\n`
      + "Der Code führt danach ins Leere, laufende Sitzungen enden. "
      + "Der Eintrag bleibt gesperrt stehen.";
    if (!window.confirm(frage)) return;
    setLaeuft(z.kennung); setFehler(null); setHinweis(null);
    try {
      const r = await SP.zugangSperren({ kennung: z.kennung });
      if (!r.gesperrt) { setFehler("Kein Zugang gesperrt — vielleicht war er schon gesperrt."); return; }
      setHinweis(`Zugang ${z.kennung} (${rolle}) gesperrt · ${r.sitzungenBeendet || 0} Sitzungen beendet.`);
      await laden();
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(null); }
  };

  const zurueckziehen = async (d) => {
    const frage = `Diesen Demozugang zurückziehen?\n\n${d.name}\n`
      + `${ROLLEN.find((r) => r.id === d.rolle)?.label || d.rolle} · ${d.gruppe || "ohne Gruppe"} · ${d.id}\n\n`
      + "Er verschwindet von der Startseite, laufende Sitzungen enden. "
      + "Der Eintrag bleibt gesperrt stehen und lässt sich nicht wieder öffnen.";
    if (!window.confirm(frage)) return;
    setLaeuft(d.id); setFehler(null); setHinweis(null);
    try {
      const r = await SP.zugangSperren({ id: d.id });
      if (!r.gesperrt) { setFehler("Kein Zugang gesperrt — vielleicht war er schon zurückgezogen."); return; }
      setListe((l) => (l || []).filter((x) => x.id !== d.id));
      /* Die Kontenliste kennt keinen Zwischenspeicher — sie darf neu laden. */
      SP.zugaengeUebersicht().then(setKonten).catch(() => {});
      setHinweis(`${d.name} (${d.id}) zurückgezogen · ${r.sitzungenBeendet || 0} Sitzungen beendet. `
        + "Die Startseite zeigt es innerhalb einer Minute.");
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(null); }
  };

  /* Nach Gruppen, wie auf der Startseite — so erkennt man Doppelte sofort. */
  const gruppen = {};
  for (const d of liste || []) (gruppen[d.gruppe || "Weitere"] = gruppen[d.gruppe || "Weitere"] || []).push(d);
  /* Doppelte markieren: gleicher Raum, gleicher Betrieb, gleiche Rolle. */
  const schluessel = (d) => `${d.bestand}·${d.betrieb ?? 0}·${d.rolle}`;
  const zaehl = {};
  for (const d of liste || []) zaehl[schluessel(d)] = (zaehl[schluessel(d)] || 0) + 1;
  const doppelte = (liste || []).filter((d) => zaehl[schluessel(d)] > 1).length;

  return (
    <div>
      <H1 rubrik="Betreiber"
        sub="Was auf der Startseite ohne Code offensteht — dieselbe Liste, die jeder Besucher sieht. Zurückziehen sperrt den Zugang endgültig; neu anlegen geht über das Bereitstellungsskript."
        right={<Btn size="sm" onClick={laden}>Neu laden</Btn>}>
        Demozugänge</H1>

      {fehler && (
        <Card style={{ marginBottom: 20, padding: "18px var(--pad-x)", borderColor: C.danger }}>
          <div style={{ color: C.danger, fontSize: 14 }}>{fehler}</div>
        </Card>)}
      {hinweis && (
        <Card style={{ marginBottom: 20, padding: "18px var(--pad-x)", borderColor: C.ok }}>
          <div style={{ color: C.text, fontSize: 14 }}>{hinweis}</div>
        </Card>)}
      {doppelte > 0 && (
        <Card style={{ marginBottom: 20, padding: "18px var(--pad-x)", borderColor: C.warn }}>
          <div style={{ fontSize: 14, lineHeight: 1.55 }}>
            <b>{zahl(doppelte)} Einträge sind doppelt</b> — gleicher Raum, gleicher Betrieb,
            gleiche Rolle. Die Startseite zeigt diese Betriebe mehrfach. Je Paar einen
            Eintrag zurückziehen; welcher, ist gleichgültig.
          </div>
        </Card>)}

      {liste === null ? (
        <Card><Laden zeilen={3} text="Demozugänge werden geladen …" /></Card>
      ) : liste.length === 0 ? (
        <Card><Leer titel="Keine Demozugänge"
          text="Auf der Startseite steht derzeit nichts ohne Code offen. Demozugänge legt das Bereitstellungsskript werkzeug/zugaenge-anlegen.sh an." /></Card>
      ) : Object.entries(gruppen).map(([gruppe, eintraege]) => (
        <Card key={gruppe} style={{ marginBottom: 18 }}>
          <CardHead right={<Lab>{zahl(eintraege.length)} {eintraege.length === 1 ? "Zugang" : "Zugänge"}</Lab>}>
            {gruppe}</CardHead>
          {eintraege.map((d, i) => {
            const doppelt = zaehl[schluessel(d)] > 1;
            return (
              <div key={d.id} style={{ padding: "15px var(--pad-x)", display: "flex", gap: 14,
                alignItems: "center", flexWrap: "wrap",
                borderBottom: i < eintraege.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                background: doppelt ? C.warnLight : "transparent" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15.5, fontWeight: 620 }}>{d.name}</span>
                    <Pill size="sm">{ROLLEN.find((r) => r.id === d.rolle)?.label || d.rolle}</Pill>
                    {doppelt && <Pill size="sm" tone="warn">doppelt</Pill>}
                  </div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 5 }}>
                    Raum <code style={{ ...NUM }}>{d.bestand}</code> · Betrieb {d.betrieb ?? 0}
                    {d.hinweis ? ` · ${d.hinweis}` : ""}
                  </div>
                  <code style={{ display: "block", fontSize: 11.5, marginTop: 6, color: C.aus, ...NUM }}
                    title="Öffentliche Kennung des Demozugangs">{d.id}</code>
                </div>
                <Btn size="sm" kind="danger" disabled={laeuft !== null}
                  onClick={() => zurueckziehen(d)}>
                  {laeuft === d.id ? "Wird zurückgezogen …" : "Zurückziehen"}</Btn>
              </div>);
          })}
        </Card>))}

      {/* ------------------ Alle Konten des Demoraums ------------------
          Auch die, die auf der Startseite nie erscheinen: Betreibercodes
          und bereits gesperrte Einträge. Hier findet sich ein zweiter
          Betreibercode, den ein doppelter Skriptlauf hinterlassen hat. */}
      <Card style={{ marginTop: 26 }}>
        <CardHead right={konten && <Lab>{zahl((konten.zugaenge || []).length)} Konten
          {konten.bestand ? ` · Raum ${konten.bestand}` : ""}</Lab>}>
          Zugänge des Demoraums</CardHead>
        <div style={{ padding: "14px var(--pad-x)", fontSize: 13, color: C.dim, lineHeight: 1.55,
          borderBottom: `1px solid ${C.lineSoft}` }}>
          Jedes Konto im Raum der Betreiberkonsole, mit gekürzter Kennung. Codes und
          Prüfsummen zeigt der Server nicht. Der Zugang, mit dem du gerade angemeldet
          bist, lässt sich hier nicht sperren.
        </div>
        {kontenFehler && (
          <div style={{ padding: "14px var(--pad-x)", color: C.danger, fontSize: 14 }}>{kontenFehler}</div>)}
        {konten === null ? (
          <Laden zeilen={3} text="Konten werden geladen …" />
        ) : (konten.zugaenge || []).length === 0 ? (
          <Leer titel="Keine Konten" text="In diesem Raum gibt es keine Zugänge." />
        ) : (konten.zugaenge || []).map((z, i, alle) => {
          const rolle = ROLLEN.find((r) => r.id === z.rolle)?.label || z.rolle;
          return (
            <div key={z.kennung} style={{ padding: "13px var(--pad-x)", display: "flex", gap: 14,
              alignItems: "center", flexWrap: "wrap",
              borderBottom: i < alle.length - 1 ? `1px solid ${C.lineSoft}` : "none",
              opacity: z.gesperrt ? 0.55 : 1 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600 }}>{z.name || "(ohne Namen)"}</span>
                  <Pill size="sm" tone={z.rolle === "betreiber" ? "accent" : "neutral"}>{rolle}</Pill>
                  {z.demo && <Pill size="sm">Demo</Pill>}
                  {z.eigen && <Pill size="sm" tone="ok">diese Sitzung</Pill>}
                  {z.gesperrt && <Pill size="sm">gesperrt</Pill>}
                </div>
                <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>
                  Kennung <code style={{ ...NUM }}>{z.kennung}</code>
                  {z.id ? <> · Demo-ID <code style={{ ...NUM }}>{z.id}</code></> : null}
                  {" "}· Betrieb {z.betrieb ?? 0}
                  {z.angelegt ? ` · angelegt ${fKurz(String(z.angelegt).slice(0, 10))}` : ""}
                </div>
              </div>
              <Btn size="sm" kind="danger"
                disabled={laeuft !== null || z.gesperrt || z.eigen}
                title={z.eigen ? "Der eigene Zugang lässt sich nicht sperren." : undefined}
                onClick={() => kontoSperren(z)}>
                {laeuft === z.kennung ? "Wird gesperrt …" : z.gesperrt ? "Gesperrt" : "Sperren"}</Btn>
            </div>);
        })}
      </Card>
    </div>);
}

/* ==========================================================================
   MOBILE MITARBEITERANSICHT
   Für Beschäftigte im Schichtdienst ist das Telefon der Regelfall, nicht die
   Ausnahme. Diese Schale ist eigenständig aufgebaut: keine Tabellen, keine
   waagerechte Rollbewegung, Tap-Ziele ab 46 Pixel, Blätter von unten.
   Der Wechsel zur Rechneransicht ist jederzeit möglich.
   ========================================================================== */

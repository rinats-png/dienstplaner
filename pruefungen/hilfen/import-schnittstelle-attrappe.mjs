/* IMP-4: Testdouble für /api/import (Vertrag: docs/acc45/IMP-3-NACHWEIS.md §1, Branch acc45/import/imp-3).
   Hält sich an die Antwortformen und Absagen des Vertrags und erzwingt die Dublettenregeln so, wie der Server es
   tut — damit die Oberfläche gegen die Regeln geprüft wird, nicht gegen ein Wunschbild. Ersetzt IMP-3 NICHT:
   Die Gegenprüfung gegen den echten Endpunkt steht aus, bis IMP-3 integriert ist. */

const ok = (daten) => ({ ok: true, daten });
const nein = (status, code, fehler, mehr) => ({ ok: false, status, code, fehler, mehr: mehr || {} });

/** Standarddatensätze: Personalnummer-Treffer, Namenstreffer ohne Nummer, Neuling, Fehler, unbekannte Einheit. */
export function standardDatensaetze() {
  const w = (nachname, vorname, personalnummer, einheit) => ({ nachname, vorname, personalnummer, einheit, email: null });
  return [
    { datensatz: 1, werte: w("Altmann", "Gerda", "P4711", "Station 1"), fehler: [], hinweise: [], konflikte: [],
      dublette: { art: "personalnummer", personId: "p1" }, erlaubt: ["aktualisieren", "ueberspringen", "klaeren"], vorgabe: "klaeren" },
    { datensatz: 2, werte: w("Berger", "Hans", "", "Station 1"), fehler: [], hinweise: [], konflikte: [],
      dublette: { art: "name", personId: "p2" }, erlaubt: ["neu", "ueberspringen", "klaeren"], vorgabe: "klaeren" },
    { datensatz: 3, werte: w("Chen", "Li", "P9001", "Station 2"), fehler: [], hinweise: [], konflikte: [],
      dublette: null, erlaubt: ["neu", "ueberspringen", "klaeren"], vorgabe: "neu" },
    { datensatz: 4, werte: w("Dorn", "", "", "Station 1"), fehler: ["Vorname fehlt"], hinweise: [], konflikte: [],
      dublette: null, erlaubt: ["ueberspringen"], vorgabe: "ueberspringen" },
    { datensatz: 5, werte: w("Esser", "Uwe", "P9002", "Neue Station"), fehler: [], hinweise: [], konflikte: [{ art: "einheit-unbekannt" }],
      dublette: null, erlaubt: ["neu", "ueberspringen", "klaeren"], vorgabe: "klaeren" },
  ];
}

/**
 * @param {{ datensaetze?: object[], blaetter?: object[], rolleDarfEinheitenAnlegen?: boolean, uebernahmeFehler?: object }} [opt]
 * `aufrufe` protokolliert jeden Aufruf (Name + Argumente) für die Prüfung.
 */
export function erzeugeAttrappe(opt = {}) {
  const datensaetze = opt.datensaetze || standardDatensaetze();
  const blaetter = opt.blaetter || [{ index: 0, name: "Tabelle1", datenzeilen: datensaetze.length, spalten: 5 }];
  const aufrufe = [];
  const zustand = { vorgang: null, plan: null, code: null, uebernommen: false, verworfen: false, vorschauZaehler: 0 };
  const spalten = [["Nachname", "nachname"], ["Vorname", "vorname"], ["Personalnummer", "personalnummer"], ["Einheit", "einheit"], ["Funktion", null]]
    .map(([kopf, feld], index) => ({ index, kopf, feld, herkunft: feld ? "genau" : null }));
  const zuordnungStandard = { nachname: 0, vorname: 1, personalnummer: 2, einheit: 3 };
  const gib = (name, arg, r) => { aufrufe.push({ name, arg }); return r; };
  const hash = () => `code-${zustand.vorschauZaehler}`;

  return {
    aufrufe, zustand,
    upload: async (datei, art) => gib("upload", { name: datei && datei.name, art }, ok({ vorgang: "v1", art: art || "personal", format: "csv", blaetter,
      vorgabeBlatt: 0, hinweise: [], gueltigBis: "2099-01-01T00:00:00.000Z", inaktivMinuten: 30 })),
    analyse: async (arg) => {
      if (arg.blatt !== undefined && (arg.blatt < 0 || arg.blatt >= blaetter.length)) return gib("analyse", arg, nein(422, "BLATT_UNGUELTIG", "Dieses Tabellenblatt gibt es nicht."));
      const zuordnung = arg.zuordnung || zuordnungStandard;
      const fehlendePflicht = ["nachname", "vorname", "einheit"].filter((f) => zuordnung[f] === undefined);
      return gib("analyse", arg, ok({ art: "personal", blatt: arg.blatt || 0, spalten, zuordnung, fehlendePflicht, datensaetze,
        zaehler: { gesamt: datensaetze.length, dubletten: datensaetze.filter((d) => d.dublette).length, konflikte: datensaetze.filter((d) => d.konflikte.length).length } }));
    },
    vorschau: async (arg) => {
      aufrufe.push({ name: "vorschau", arg });
      const ent = arg.entscheidungen || {}, best = arg.bestaetigungen || {};
      const neu = [], aktualisieren = [], uebersprungen = [], offen = [];
      for (const d of datensaetze) {
        const a = ent[String(d.datensatz)] || d.vorgabe;
        if (!d.erlaubt.includes(a)) return nein(422, "ENTSCHEIDUNG_UNZULAESSIG", "Diese Wahl ist für den Datensatz nicht zulässig.");
        if (a === "aktualisieren" && best[String(d.datensatz)] !== true) return nein(422, "AKTUALISIERUNG_OHNE_BESTAETIGUNG", "Aktualisieren braucht die ausdrückliche Bestätigung.");
        if (a === "neu") {
          if (d.konflikte.length && !(arg.einheitenAnlegen === true)) return nein(422, "ZUORDNUNGSKONFLIKT", "Zuordnungskonflikt.");
          if (d.konflikte.length && opt.rolleDarfEinheitenAnlegen === false) return nein(403, "ORG_EDIT_FEHLT", "Neue Einheiten dürfen nur Leitung anlegen.");
          neu.push({ datensatz: d.datensatz, nachname: d.werte.nachname, vorname: d.werte.vorname, personalnummer: d.werte.personalnummer || null, einheit: d.werte.einheit, eintritt: null, neueEinheit: d.konflikte.length > 0, hinweise: [] });
        } else if (a === "aktualisieren") aktualisieren.push({ datensatz: d.datensatz, personId: d.dublette.personId, aenderungen: [{ feld: "vorname", alt: "Gerd", neu: d.werte.vorname }] });
        else if (a === "ueberspringen") uebersprungen.push(d.datensatz);
        else offen.push({ datensatz: d.datensatz, grund: "dublette" });
      }
      zustand.vorschauZaehler += 1; zustand.code = hash();
      const neueEinheiten = [...new Set(neu.filter((n) => n.neueEinheit).map((n) => n.einheit))];
      return ok({ art: "personal", vorschau: { neu, aktualisieren, uebersprungen, offen, neueEinheiten, neueStandorte: [], zeitraum: { von: null, bis: null }, zyklen: [] },
        zaehler: { neu: neu.length, aktualisiert: aktualisieren.length, uebersprungen: uebersprungen.length }, bereit: neu.length + aktualisieren.length > 0, bestaetigung: zustand.code });
    },
    uebernahme: async (arg) => {
      aufrufe.push({ name: "uebernahme", arg });
      if (opt.uebernahmeFehler) return opt.uebernahmeFehler;
      if (zustand.uebernommen) return nein(409, "BEREITS_UEBERNOMMEN", "Dieser Import wurde bereits übernommen.");
      if (!zustand.code) return nein(409, "VORSCHAU_FEHLT", "Bitte zuerst die Vorschau erstellen und prüfen.");
      if (arg.bestaetigung !== zustand.code) return nein(409, "BESTAETIGUNG_UNGUELTIG", "Die Übernahme braucht die Bestätigung der aktuellen Vorschau.");
      zustand.uebernommen = true;
      return ok({ ok: true, zaehler: { neu: 1, aktualisiert: 0, uebersprungen: 0, neueEinheiten: 0, neueStandorte: 0 }, etag: "e1" });
    },
    verwerfen: async (arg) => { zustand.verworfen = true; return gib("verwerfen", arg, ok({ ok: true })); },
  };
}

/** fetch-Attrappe mit den echten Pfaden, um erzeugeImportSchnittstelle() selbst zu prüfen. */
export function erzeugeFetchAttrappe(antworten = {}) {
  const aufrufe = [];
  const fetchFn = async (pfad, init) => {
    aufrufe.push({ pfad, init });
    const a = antworten[pfad.split("?")[0]];
    if (a instanceof Error) throw a;
    const status = (a && a.status) || 200;
    return { ok: status < 300, status, json: async () => (a && a.body !== undefined ? a.body : {}) };
  };
  return { fetchFn, aufrufe };
}

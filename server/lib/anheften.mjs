/* ==========================================================================
   ANHEFTEN — SCHREIBWEG (WP-I7 Teil 6, Stufe B; Vorlage PR #595, Betreiberentscheidung 27.11.)

   Der eine Weg für die Karte `angeheftet` (Lesen und Wirkung: engine/anheften.mjs), aufgerufen in zusammenfuehren (rechte.mjs) im
   vollen Schreibweg nach dem Muster der Vorgaben:
   - Rechte wie die bestehenden Planungsrechte: anheften und lösen nur Leitung und Planung (nicht Demo). Alle anderen: ein mitgeschicktes
     Feld ist wirkungslos, der gespeicherte Stand bleibt (eine veraltete oder gefälschte Kopie scheitert nicht daran). Die
     Schichtverantwortung sieht die Karte nicht und schreibt sie nie (sicht.mjs WEG, einheitZusammen: Feld der Leitung vorbehalten);
     eine angeheftete Einteilung ändert sie nicht (Absage in einheitZusammen) — kein neues Recht für SV, BR, Beschäftigte.
   - Anheften nur für eine eingetragene Einteilung (Schlüssel in `abweichungen`, Dienst oder „-“): Eine Folge-/Schichtmodell-Einteilung
     wird vorher als Abweichung festgeschrieben (die Oberfläche schickt beides; der Server leitet keinen Dienst her).
   - Stempel (am, vonRolle) setzt der Server; mitgeschickte Werte zählen nie. Keine Personenkennung des Handelnden (Rolle genügt).
   - Betreiberentscheidung 27.11.: Eine manuelle Änderung der Einteilung (Wert in `abweichungen` geändert oder entfernt) hebt
     AUSSCHLIESSLICH die Anheftung genau dieser Einteilung auf — sichtbar als Vermerk in der Karte (aufgehobenAm/aufgehobenVonRolle) und
     nachvollziehbar im Modulprotokoll (Art, Anzahl, Zeit, Rolle; kein Person|Tag). Andere Anheftungen bleiben.
   - Grenzen: Karte höchstens ANGEHEFTET_GRENZE (Einträge, Bytes); Modulprotokoll wie die Vorgaben (MODULPROTOKOLL_GRENZE / 512 KiB,
     modulprotokollUeberGrenze). Aufheben durch Änderung und Lösen gehen immer (wie Deaktivieren), Neues Anheften an der Grenze nicht.
   - Unlesbare gespeicherte Karte: Der unverändert zurückgeschickte Wert zählt nicht als Schreiben (Review #602 B-2: Speichern geht weiter,
     die Karte bleibt unlesbar, Planer `ungueltig`, SV gesperrt). Reparatur: Leitung/Planung schicken eine gültige Zuordnung; gültige alte
     Einträge behalten ihren Stempel, ein unverändert mitgeschickter unlesbarer Eintrag wird abgewiesen (nie still neu angeheftet).
   - Verwaiste Anheftung (Einteilung fehlt, z. B. nach dem Datenschutzlauf): wird beim nächsten Speichern als aufgehoben vermerkt
     (Stempel „system“, Protokoll) und sperrt nie das Speichern (Review #602 B-1). „Nur eingetragene Einteilung“ gilt für neu Angeheftetes.
   - Der Datenschutzlauf (aufbewahrung.mjs raeumen) kürzt die Karte mit der Plandatenfrist wie abweichungen.
   ========================================================================== */
import { ANGEHEFTET_FELD, ANGEHEFTET_GRENZE, anheftungenLesen, anheftungSchluesselOk, anheftungEintragOk } from "./engine/anheften.mjs";
import { modulprotokollFaellig, modulprotokollUeberGrenze } from "./branchenmodule.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Rollen, die anheften und lösen (wie die Planungsrechte: Leitung, Planung). */
export const ANHEFTEN_ROLLEN = Object.freeze(["leitung", "planer"]);
/** Arten im Modulprotokoll (Modul „anheften“). */
export const ANHEFTEN_PROTOKOLL = Object.freeze({ gesetzt: "anheften-gesetzt", geloest: "anheften-geloest", aufgehoben: "anheften-aufgehoben" });

/** Darf die Sitzung anheften und lösen? */
export const darfAnheften = (sitzung) => !!sitzung && sitzung.demo !== true && ANHEFTEN_ROLLEN.includes(sitzung.rolle);

/**
 * Führt die Karte zusammen. Rein; wirft nie.
 * @param {any} altM gespeicherter Betrieb @param {any} neuM übermittelter Betrieb (nach der Rückfüllung)
 * @param {{ rolle: string, demo?: boolean }} sitzung @param {{ jetzt: string }} o
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function anheftenZusammen(altM, neuM, sitzung, o) {
  try {
    if (!istObjekt(neuM)) return { mandant: neuM };
    const jetzt = o && typeof o.jetzt === "string" ? o.jetzt : new Date().toISOString();
    const rolle = sitzung && typeof sitzung.rolle === "string" ? sitzung.rolle.slice(0, 40) : "unbekannt";
    const hatAlt = istObjekt(altM) && hat(altM, ANGEHEFTET_FELD);
    const altRoh = hatAlt ? altM[ANGEHEFTET_FELD] : undefined;
    const alt = anheftungenLesen(istObjekt(altM) ? altM : {});
    /* Grundlage: die der Form nach gültigen gespeicherten Einträge (bei lesbarer Karte alle; bei unlesbarer nur für die Reparatur). */
    const altK = istObjekt(altRoh) ? Object.fromEntries(Object.entries(altRoh).filter(([k, v]) => anheftungSchluesselOk(k) && anheftungEintragOk(v))) : {};
    const altAktiv = new Set(Object.keys(altK).filter((k) => !hat(altK[k], "aufgehobenAm")));
    const altAbw = istObjekt(altM) && istObjekt(altM.abweichungen) ? altM.abweichungen : {};
    const neuAbw = istObjekt(neuM.abweichungen) ? neuM.abweichungen : {};
    const mitKarte = (k) => {
      const aus = { ...neuM };
      if (k === undefined) delete aus[ANGEHEFTET_FELD]; else aus[ANGEHEFTET_FELD] = k;
      return aus;
    };
    /* Review #602 B-2: Der unverändert zurückgeschickte gespeicherte Wert ist keine Absicht (Voll-PUT, Teilweg) — auch ein unlesbarer
       Wert sperrt so nie das normale Speichern. */
    const schreibt = darfAnheften(sitzung) && hat(neuM, ANGEHEFTET_FELD) && !(hatAlt && gleich(neuM[ANGEHEFTET_FELD], altRoh));
    /* Unlesbarer gespeicherter Stand ohne Reparatur: bleibt, wie er ist (kein Aufheben möglich, der Planer rechnet nicht, SV bleibt gesperrt). */
    if (!alt.ok && !schreibt) return { mandant: mitKarte(altRoh) };

    /** Ergebnis: Schlüssel → Eintrag; Zähler für das Protokoll. */
    const aus = {};
    let gesetzt = 0, geloest = 0, aufgehoben = 0;
    const neuGesetzt = new Set();
    const aktivAlt = (s) => altAktiv.has(s);
    if (schreibt) {
      const w = neuM[ANGEHEFTET_FELD];
      if (!istObjekt(w)) return { grund: "Anheften: erwartet wird eine Zuordnung „Person|Tag“ → Eintrag." };
      const personen = new Set((Array.isArray(neuM.personen) ? neuM.personen : []).filter(istObjekt).map((p) => String(p.id)));
      for (const [s, x] of Object.entries(w)) {
        if (!anheftungSchluesselOk(s)) return { grund: "Anheften: ungültiger Schlüssel (erwartet „Person|JJJJ-MM-TT“)." };
        if (!istObjekt(x)) return { grund: "Anheften: ungültiger Eintrag." };
        /* Reparatur einer unlesbaren Karte: ein unlesbarer gespeicherter Eintrag, unverändert mitgeschickt, wird nicht still neu angeheftet. */
        if (!alt.ok && istObjekt(altRoh) && hat(altRoh, s) && !hat(altK, s) && gleich(x, altRoh[s]))
          return { grund: "Anheften: Die gespeicherten Anheftungen sind nicht lesbar; zum Reparieren die Zuordnung ohne die unlesbaren Einträge schicken." };
        /* Gewünscht ist „angeheftet“, solange der Eintrag kein Aufheben trägt und nicht ausdrücklich aktiv: false sagt. Ein Rundweg des
           gespeicherten Eintrags ändert nichts. */
        const willAktiv = !hat(x, "aufgehobenAm") && x.aktiv !== false;
        if (willAktiv) {
          if (aktivAlt(s)) { aus[s] = altK[s]; continue; }
          /* Veraltete Kopie: der frühere (inzwischen aufgehobene) Eintrag kommt mit seinem Stempel zurück — das heftet nicht neu an. Neu
             angeheftet wird ein aufgehobener Tag nur mit einem Eintrag ohne den alten Stempel. */
          if (hat(altK, s) && !altAktiv.has(s) && x.am === altK[s].am) { aus[s] = altK[s]; continue; }
          if (!personen.has(s.slice(0, s.lastIndexOf("|")))) return { grund: "Anheften: Die Person gehört nicht zum Betrieb." };
          aus[s] = { am: jetzt, vonRolle: rolle };
          neuGesetzt.add(s);
          gesetzt++;
        } else if (aktivAlt(s)) geloest++;                         // ausdrücklich gelöst: Eintrag entfällt
        else if (hat(altK, s)) aus[s] = altK[s];                    // Vermerk (aufgehoben) bleibt, wie gespeichert
      }
      /* Nicht mehr mitgeschickt: gelöst (angeheftet) bzw. Vermerk entfernt (aufgehoben). */
      for (const s of altAktiv) if (!hat(w, s)) geloest++;
    } else {
      for (const [s, x] of Object.entries(altK)) aus[s] = x;
    }
    /* Manuelle Änderung der Einteilung hebt genau deren Anheftung auf (nur, was vorher schon angeheftet war; was diese Anfrage neu anheftet,
       heftet den neuen Wert an). */
    for (const s of Object.keys(aus)) {
      if (!aktivAlt(s) || hat(aus[s], "aufgehobenAm")) continue;
      const vorher = hat(altAbw, s) ? altAbw[s] : undefined, nachher = hat(neuAbw, s) ? neuAbw[s] : undefined;
      /* Review #602 B-1: Eine verwaiste Anheftung (Einteilung fehlt, z. B. nach dem Datenschutzlauf) wird als aufgehoben vermerkt (Stempel
         „system“, im Protokoll gezählt) — sie sperrt nie das Speichern. */
      const verwaist = nachher === undefined;
      if (gleich(vorher, nachher) && !verwaist) continue;
      aus[s] = { ...aus[s], aufgehobenAm: jetzt, aufgehobenVonRolle: verwaist && vorher === undefined ? "system" : rolle };
      aufgehoben++;
    }
    /* Anheften nur mit eingetragener Einteilung (Dienst oder frei) — geprüft nur für das in dieser Anfrage neu Angeheftete. */
    for (const s of neuGesetzt)
      if (!hat(neuAbw, s)) return { grund: "Anheften: nur eine eingetragene Einteilung (Dienst oder frei) lässt sich anheften." };
    /* Grenzen der Karte: nur neues Anheften scheitert daran (Aufheben und Lösen machen sie nie größer). */
    if (gesetzt && (Object.keys(aus).length > ANGEHEFTET_GRENZE.eintraege || new TextEncoder().encode(JSON.stringify(aus)).length > ANGEHEFTET_GRENZE.bytes))
      return { grund: `Anheften: höchstens ${ANGEHEFTET_GRENZE.eintraege} Einträge (angeheftet und aufgehoben); aufgehobene Vermerke oder alte Anheftungen bitte entfernen.` };
    const karte = Object.keys(aus).length || hatAlt ? aus : undefined;
    if (!gesetzt && !geloest && !aufgehoben) return { mandant: mitKarte(hatAlt && gleich(aus, altRoh) ? altRoh : karte) };
    /* Protokoll: im Modulprotokoll des Betriebs, nur Art, Anzahl, Zeit, Rolle. */
    const ereignisse = [];
    const e = { modul: "anheften", am: jetzt, von: rolle };
    if (gesetzt) ereignisse.push({ art: ANHEFTEN_PROTOKOLL.gesetzt, ...e, anzahl: gesetzt });
    if (geloest) ereignisse.push({ art: ANHEFTEN_PROTOKOLL.geloest, ...e, anzahl: geloest });
    if (aufgehoben) ereignisse.push({ art: ANHEFTEN_PROTOKOLL.aufgehoben, ...e, anzahl: aufgehoben });
    const einst = istObjekt(neuM.einstellungen) ? neuM.einstellungen : {};
    let bisher = Array.isArray(einst.modulprotokoll) ? einst.modulprotokoll : [];
    if (modulprotokollUeberGrenze(bisher, ereignisse, "Lösen und Ändern angehefteter Einteilungen")) bisher = modulprotokollFaellig({ einstellungen: { modulprotokoll: bisher } }, jetzt.slice(0, 10)).rest;
    const ueber = modulprotokollUeberGrenze(bisher, ereignisse, "Lösen und Ändern angehefteter Einteilungen");
    if (ueber && gesetzt) return { grund: `${ueber}neues Anheften wieder, sobald ältere Einträge nach einer geprüften Aufbewahrungsregel entfallen dürfen.` };
    return { mandant: { ...mitKarte(karte), einstellungen: { ...einst, modulprotokoll: [...bisher, ...ereignisse] } } };
  } catch {
    return { grund: "Anheften: Die Anheftungen ließen sich nicht prüfen." };
  }
}

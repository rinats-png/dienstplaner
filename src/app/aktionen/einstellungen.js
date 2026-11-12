/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { sicherungenAktionen } from "../../sicherungen-ui.js";
import * as SP from "../../speicher.js";
import { heute } from "../../lib/datum.js";
import { kiSteuerungAktionen } from "../../lib/ki-steuerung-aktionen.js";

export function aktionenEinstellungen(k) {
  const { mUpd, melde, ref, sitz, upd } = k;
  return {
      /* WP-I16 Teil 1: Steuerung der Intelligence-Funktionen (Hauptschalter, Funktionen, Frage; Pause des Betriebsrats). */
      ...kiSteuerungAktionen(k),
      /* --- Tour und Einstellungen --- */
      /* Wer die Tour ausdrücklich startet, hebt damit auch das frühere
         Wegklicken und Einklappen auf — sonst öffnete sich eine Tour, die
         man gerade angefordert hat, sofort wieder einzeilig. */
      tourStarten: (vonVorn) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: vonVorn
          ? { schritt: 0, gesehen: [], fertig: false, nichtMehr: false, offen: true,
              zurueckgestellt: false, eingeklappt: false }
          : { ...(x.tour || {}), offen: true, fertig: false,
              zurueckgestellt: false, eingeklappt: false } } : x) }), null),
      tourSchritt: (idx, gesehenId) => mUpd((m) => ({ ...m, personen: m.personen.map((x) => {
        if (x.id !== sitz.person.id) return x;
        const t = x.tour || {};
        const g = gesehenId && !(t.gesehen || []).includes(gesehenId)
          ? [...(t.gesehen || []), gesehenId] : (t.gesehen || []);
        return { ...x, tour: { ...t, schritt: idx, gesehen: g, offen: true } };
      }) }), null),
      /* Schließen unterscheidet zwei Fälle: „später fortsetzen" merkt sich die
         Stelle, „nicht mehr anzeigen" schaltet den Selbststart ab. Beides ist
         reversibel — unter Einstellungen.
         `zurueckgestellt` hält das Wegklicken über den Ansichtswechsel
         hinweg: ohne das startete die Tour sofort wieder, solange noch kein
         Schritt gesehen war. */
      tourSchliessen: (fuerImmer) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), offen: false,
          zurueckgestellt: true, ...(fuerImmer ? { nichtMehr: true } : {}) } } : x) }), null),
      /* Eingeklappt heißt: weiterhin da, aber einzeilig. Der Zustand gehört
         zur Person, nicht in eine Sitzungsvariable — sonst steht die Tour
         nach jedem Neuladen wieder in voller Höhe im Bild. */
      tourEinklappen: (an) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), eingeklappt: !!an } } : x) }), null),
      tourBeenden: () => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), offen: false,
          fertig: true, schritt: 0 } } : x) }), null),
      /* Der Schalter verspricht „startet beim Öffnen von selbst". Wird er
         wieder eingeschaltet, muss deshalb auch ein früheres Wegklicken
         fallen — sonst bliebe das Versprechen ohne Wirkung. */
      setzeTourAnzeige: (an) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, tour: { ...(x.tour || {}), nichtMehr: !an,
          ...(an ? { zurueckgestellt: false } : {}) } } : x) }), null),

      /* Persönliche Vorliebe — nicht zu verwechseln mit setzeEinstellung,
         das betriebsweite Festlegungen ändert. */
      setzeMeineEinstellung: (feld, wert) => mUpd((m) => ({ ...m, personen: m.personen.map((x) =>
        x.id === sitz.person.id ? { ...x, [feld]: wert } : x) }), null),

      /* Eine geänderte Anmeldeadresse wird vermerkt — der Betreiber sieht
         daran, wenn ein Zugang den Besitzer wechselt. */
      setzeAnmeldeadresse: (wert) => mUpd((m) => {
        const alt = sitz.person.email || null;
        if (alt === (wert || null)) return m;
        return { ...m, personen: m.personen.map((x) => x.id === sitz.person.id
          ? { ...x, email: wert || null, emailGeaendert: new Date().toISOString(),
              emailVorher: alt } : x),
          adressAenderungen: [{ personId: sitz.person.id, von: alt, nach: wert || null,
            zeit: new Date().toISOString() }, ...(m.adressAenderungen || [])].slice(0, 200) };
      }, "Anmeldeadresse geändert"),

      sicherungAnlegen: async () => { try { await SP.sicherung(); } catch (e) { melde(e.message); } },
      /* WP-25: Liste und Zurückspielen (sicherungenLaden, zurueckspielen) — die Einstellungen
         reichen sie an SicherungenVerwalten weiter. Fehlten sie hier, bliebe die Liste bei „Lädt …“. */
      ...sicherungenAktionen(SP),
      auskunftErzeugen: (pid) => {
        const mm = ref.current.mandanten.find((x) => x.id === (ref.current.session || {}).mandantId);
        if (!mm) return;
        const pp = mm.personen.find((x) => x.id === pid);
        if (!pp) return;
        const inhalt = JSON.stringify({ person: pp,
          abwesenheiten: mm.abwesenheiten.filter((a) => a.personId === pid),
          anfragen: mm.anfragen.filter((a) => a.personId === pid),
          erstellt: new Date().toISOString() }, null, 2);
        const b = new Blob([inhalt], { type: "application/json" });
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u; a.download = `auskunft-${pp.nachname}-${heute()}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      },

  };
}

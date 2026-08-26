/* ==========================================================================
   FORTSCHRITT EINES TESTBETRIEBS

   Die Betreiberliste `selbststarts` sagt bisher nur, dass jemand angelegt
   hat — nicht, wie weit er gekommen ist. Dabei ist genau das die Liste,
   die man abends durchgeht: Wer hängt vor dem Rotationsmodell fest, wen
   sollte man anrufen, wessen Frist läuft aus.

   Die Stufen folgen den vier Schritten, mit denen die Website die
   Einrichtung beschreibt:

     0  angelegt, noch nichts geschehen
     1  Standorte und Regeln — mehr als die angelegte Vorgabe
     2  Personal eingelesen
     3  Modell und Startpunkt — der Zyklus trägt Dienste
     4  Freigegeben

   Gerechnet wird beim Schreiben des Bestands, aus dem Bestand selbst.
   Kein eigener Zähler, der auseinanderlaufen könnte: Wer den Zustand
   wissen will, liest ihn aus dem, was da ist.
   ========================================================================== */

/** Die erreichte Stufe eines Bestands, 0 bis 4. Reine Funktion. */
export function stufeBerechnen(bestand) {
  try {
    const m = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten[0] : null;
    if (!m) return 0;
    let stufe = 0;
    if ((Array.isArray(m.einheiten) && m.einheiten.length > 1)
      || (Array.isArray(m.standorte) && m.standorte.length > 1)) stufe = 1;
    if (Array.isArray(m.personen) && m.personen.length > 0) stufe = 2;
    const zyklus = m.zyklus && Array.isArray(m.zyklus.tage) ? m.zyklus.tage : [];
    if (stufe >= 2 && zyklus.some((t) => t && t !== "-")) stufe = 3;
    if (stufe >= 3 && m.freigaben && Object.keys(m.freigaben).length > 0) stufe = 4;
    return stufe;
  } catch { return 0; }
}

/**
 * Trägt die Stufe in die Betreiberliste ein. Geschrieben wird nur, wenn
 * sich die Stufe ändert oder der letzte Vermerk älter als eine Stunde
 * ist — ein Planer speichert oft, die Liste braucht nicht jeden Stand.
 * Ein Fehler bleibt folgenlos: Der Vermerk ist Beobachtung, kein Bestand.
 */
export async function selbststartVermerken(store, raum, bestand) {
  try {
    if (!raum || !String(raum).startsWith("t-")) return;
    const liste = (await store.get("selbststarts", { type: "json" })) || [];
    const i = liste.findIndex((e) => e && e.raum === raum);
    if (i < 0) return;
    const stufe = stufeBerechnen(bestand);
    const alt = liste[i];
    const stunde = 60 * 60 * 1000;
    const altZeit = alt.zuletzt ? new Date(alt.zuletzt).getTime() : 0;
    if (stufe === (alt.stufe || 0) && Date.now() - altZeit < stunde) return;
    liste[i] = { ...alt, stufe: Math.max(stufe, alt.stufe || 0),
      zuletzt: new Date().toISOString() };
    await store.setJSON("selbststarts", liste);
  } catch { /* Beobachtung, kein Bestand */ }
}

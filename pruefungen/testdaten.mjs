/* Testdaten für den Oberflächenvergleich und den Bildersatz.

   Der Beispielbetrieb bringt keine Notrufe, Ausschreibungen, Tauschgesuche,
   Aushänge, Dienstbucheinträge, keinen Stand zur Freigabe und keine
   Wunschdienste mit. beispieleSaeen(m) legt sie fest und ohne Zufall an, damit
   diese Ansichten mit Inhalt erscheinen. Vergleich (vergleich.mjs) und
   Bildersatz (bildersatz.mjs) benutzen dieselbe Vorlage. */
const ortszeit = (tag, uhr) => new Date(`${tag}T${uhr}:00+02:00`).toISOString();
const ausTag = (tag, uhr) => { const [j, mo, t] = tag.split("-").map(Number);
  return `${t}.${mo}.${j}, ${uhr}:00`; };

export function beispieleSaeen(m) {
  const leitung = m.personen.find((p) => p.rolle === "leitung");
  const ma = m.personen.filter((p) => p.rolle === "mitarbeiter" && p.status === "aktiv" && p.imSchichtdienst !== false);
  if (ma.length < 12) throw new Error("Zu wenige Beschäftigte für die Testdaten.");
  const name = (p) => `${p.vorname} ${p.nachname}`;
  const da = (id) => m.dienstarten.find((d) => d.id === id);
  const heuteTag = "2026-09-29";

  /* Notrufe: zwei offene (dringend, nicht dringend), zwei bestätigte in den
     letzten sieben Tagen, einer davor. Empfänger wie notrufEmpfaenger. */
  const empf = m.personen.filter((p) => p.rolle === "leitung").map((p) => p.id);
  const sub = m.personen.filter((p) => p.rolle === "subplaner").map((p) => p.id);
  const nr = (i, p, art, tag, uhr, notiz, dienst, extra) => ({
    id: `vgl-nr${i}`, personId: p.id, art, notiz, zeit: ortszeit(tag, uhr), datum: tag,
    dienst: da(dienst) ? da(dienst).name : null, ort: da(dienst) ? da(dienst).ort || null : null,
    empfaenger: [...sub.slice(0, 1), ...empf], bestaetigt: null, ...extra });
  m.notrufe = [
    nr(1, ma[0], "hilfe", heuteTag, "08:41", "Person im Haus ohne Berechtigung, bitte Verstärkung.", "N"),
    nr(2, ma[1], "technik", heuteTag, "08:10", "Funkgerät fällt aus.", "N"),
    nr(3, ma[2], "bedrohung", "2026-09-27", "22:14", "", "S",
      { bestaetigt: ortszeit("2026-09-27", "22:17"), durch: name(leitung) }),
    nr(4, ma[3], "medizin", "2026-09-24", "05:32", "Sturz im Treppenhaus, Rettungsdienst gerufen.", "N",
      { bestaetigt: ortszeit("2026-09-24", "05:39"), durch: name(leitung) }),
    nr(5, ma[4], "hilfe", "2026-09-15", "14:03", "", "F",
      { bestaetigt: ortszeit("2026-09-15", "14:11"), durch: name(leitung) }),
  ];

  /* Offene Schichten: zwei offene (eine mit zwei Bewerbungen), eine
     vergebene, eine zurückgezogene. */
  const as = (i, tag, dienstId, hinweis, status, extra) => ({ id: `vgl-as${i}`, datum: tag, dienstId,
    hinweis, status, erstellt: ortszeit("2026-09-28", "10:00"), durch: name(leitung),
    bewerbungen: [], vergebenAn: null, ...extra });
  m.ausschreibungen = [
    as(1, "2026-10-02", "F", "Kurzfristiger Ausfall, gern mit Erfahrung.", "offen", { bewerbungen: [
      { personId: ma[5].id, zeit: ortszeit("2026-09-28", "12:30"), text: "Kann kurzfristig einspringen." },
      { personId: ma[6].id, zeit: ortszeit("2026-09-28", "18:05"), text: "" }] }),
    as(2, "2026-10-05", "N", "", "offen"),
    as(3, "2026-09-30", "S", "Krankheitsvertretung.", "vergeben", { vergebenAn: ma[7].id, vergebenZeit: ausTag("2026-09-28", "16:00") }),
    as(4, "2026-10-08", "F", "", "zurueckgezogen"),
  ];

  /* Tauschbörse: Gesuche mit den Diensten, die im Bestand stehen (Kennungen
     aus den Abweichungen des 30.9.), ein bestätigter Tausch. */
  const tage = Object.entries(m.abweichungen).filter(([k, v]) => k.endsWith("|2026-09-30") && v && v !== "-")
    .map(([k]) => k.split("|")[0]).sort();
  const wer = (id) => m.personen.find((p) => p.id === id);
  if (tage.length < 3) throw new Error("Zu wenige Dienste am 30.9. für Tauschgesuche.");
  const aq = (i, pid, extra) => ({ id: `vgl-t${i}`, personId: pid, typ: "tausch", status: "offen", partnerId: null,
    interessenten: [], von: "2026-09-30", bis: "2026-09-30", text: "", erstellt: ausTag("2026-09-28", "09:15"), ...extra });
  const tauschende = [...tage.slice(0, 3)].filter((id) => wer(id));
  m.anfragen = [
    aq(1, tauschende[0], { text: "Arzttermin am Nachmittag.", interessenten: [ma[8].id, ma[9].id] }),
    aq(2, tauschende[1], {}),
    aq(3, tauschende[2], { status: "genehmigt", partnerId: ma[10].id, antwort: `getauscht mit ${name(ma[10])}` }),
    ...(m.anfragen || [])];

  /* Schwarzes Brett: wichtig mit Frist, gewöhnlich ohne, abgelaufen. */
  m.aushang = [
    { id: "vgl-ah1", titel: "Brandschutzübung am 7. Oktober", text: "Treffpunkt 14:00 Uhr am Haupteingang. Teilnahme für alle im Dienst.",
      wichtig: true, bis: "2026-10-07", von: name(leitung), zeit: ausTag("2026-09-28", "08:00") },
    { id: "vgl-ah2", titel: "Neuer Ablauf bei der Schlüsselübergabe", text: "Schlüssel werden ab sofort im Dienstzimmer quittiert.",
      wichtig: false, bis: null, von: name(leitung), zeit: ausTag("2026-09-25", "13:20") },
    { id: "vgl-ah3", titel: "Betriebsversammlung", text: "Die Versammlung im September ist vorbei.",
      wichtig: false, bis: "2026-09-20", von: name(leitung), zeit: ausTag("2026-09-10", "09:00") },
  ];

  /* Dienstbuch: zwei Tage, alle drei Arten. */
  const db = (i, datum, art, uhr, text) => ({ id: `vgl-db${i}`, datum, art, text, zeit: uhr, durch: name(leitung) });
  m.dienstbuch = [
    db(1, heuteTag, "uebergabe", "07:05", "Nachtdienst ruhig. Aufzug 2 bleibt außer Betrieb, Techniker kommt um 10 Uhr."),
    db(2, heuteTag, "vorkommnis", "03:40", "Fehlalarm im Trakt B, nach Kontrolle zurückgesetzt."),
    db(3, heuteTag, "hinweis", "06:15", "Neue Besucherregelung hängt am Empfang."),
    db(4, "2026-09-28", "uebergabe", "15:50", "Spätdienst übernimmt alle offenen Rundgänge."),
    db(5, "2026-09-28", "hinweis", "11:20", "Lieferung für Küche am Nebeneingang."),
  ];

  /* Stand zur Freigabe: Der Monat ist im Beispielbetrieb freigegeben, aber
     ohne festgehaltenen Stand. Festgehalten wird der Bestand von jetzt
     (planAbbild); danach ändert die Planung drei Dienste, streicht zwei und
     fügt zwei hinzu — alles im September, zwei davon kurzfristig. */
  const ym = "2026-09";
  const abbild = Object.fromEntries(Object.entries(m.abweichungen).filter(([k]) => k.split("|")[1].startsWith(ym)));
  const schluessel = Object.keys(abbild).sort((a, b) => a.split("|")[1].localeCompare(b.split("|")[1]) || a.localeCompare(b));
  const wechsel = { F: "S", S: "N", N: "F" };
  const belegt = schluessel.filter((k) => abbild[k] && abbild[k] !== "-");
  for (const k of belegt.slice(0, 3)) m.abweichungen[k] = wechsel[abbild[k]] || "F";
  for (const k of belegt.slice(3, 5)) m.abweichungen[k] = "-";
  const frei = ma.slice(11).map((p) => [p, `${p.id}|2026-09-30`]).filter(([, k]) => !(k in abbild)).slice(0, 2);
  for (const [, k] of frei) { m.abweichungen[k] = "F"; abbild[k] = "-"; }
  m.planstaende = { ...(m.planstaende || {}), [ym]: abbild };

  /* Wunschdienste: Leitung und drei Beschäftigte, Ende September und Oktober. */
  const w = (i, p, datum, art) => ({ id: `vgl-w${i}`, personId: p.id, datum, art });
  m.wuensche = [
    w(1, leitung, "2026-09-29", "moechte"), w(2, leitung, "2026-09-30", "lieber_nicht"),
    w(3, leitung, "2026-10-02", "moechte"), w(4, leitung, "2026-10-03", "moechte"),
    w(5, leitung, "2026-10-06", "lieber_nicht"), w(6, leitung, "2026-10-09", "moechte"),
    w(7, leitung, "2026-10-12", "lieber_nicht"), w(8, leitung, "2026-10-20", "moechte"),
    w(9, ma[0], "2026-10-02", "lieber_nicht"), w(10, ma[0], "2026-10-03", "lieber_nicht"),
    w(11, ma[1], "2026-10-02", "lieber_nicht"), w(12, ma[2], "2026-10-02", "lieber_nicht"),
    w(13, ma[3], "2026-10-09", "moechte"), w(14, ma[3], "2026-10-10", "moechte"),
  ];
}


#!/usr/bin/env python3
# =============================================================================
# SCHICHTWERK — dreißig Blätter
#
# Erzeugt die Instagram-Reihe für CENTRIC aus einem einzigen Regelwerk.
# Jedes Blatt ist 1080 x 1350, benutzt dieselben fünf Farben, dieselben zwei
# Schriften, dasselbe Raster. Was sich ändert, ist die Anordnung.
#
#   I   NEUGIER   zehn Blätter, die eine Frage offen lassen
#   II  VORTEIL   zehn Blätter, die eine Zahl zeigen
#   III BEFUND    zehn Blätter, die ein Problem benennen und auflösen
#
# -----------------------------------------------------------------------------
# Zur Typografie, weil es beim ersten Durchgang schiefging:
#
# Big Shoulders hat eine Versalhöhe von 1600 bei 2000 Einheiten je Geviert —
# Großbuchstaben sind also 0,80 der Schriftgröße hoch. Ein Zeilenabstand von
# 0,82 lässt zwischen zwei Zeilen zwei Prozent Luft, und die Unterlängen von
# Q und J fressen sie auf: Die Zeilen liefen ineinander. Der Abstand steht
# jetzt auf 0,92 und wird aus der Metrik der Schrift abgeleitet, nicht
# geschätzt.
#
# Pillow setzt den Text an der Oberkante des Oberlängenbereichs an, nicht an
# der Versalhöhe. Der Unterschied beträgt (1971-1600)/2000 = 0,186 der
# Schriftgröße. Wer optisch am Rand ausrichten will, muss ihn abziehen —
# sonst sitzt jede Überschrift zu tief.
# =============================================================================

import os
from PIL import Image, ImageDraw, ImageFont

FONTS = "/root/.claude/skills/synced/canvas-design/canvas-fonts"
AUS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "posts")

B, H = 1080, 1350

# --- Die Palette. Fünf Farben, aus der Anwendung selbst. --------------------
TIEF = (7, 19, 23)          # Midnight Edition — der Grund
PAPIER = (237, 242, 244)    # der Gegenpol
TUERKIS = (2, 160, 160)     # geplant
SAND = (214, 158, 74)       # prüfen
NEBEL = (109, 128, 136)     # das Stille auf Dunkel
NEBEL_H = (128, 146, 154)   # dasselbe auf Papier
STILL_D = (24, 38, 44)      # freie Kachel auf Dunkel
STILL_H = (206, 217, 222)   # freie Kachel auf Papier

E = 45                       # Grundeinheit
RAND = E * 2                 # 90 — unverhandelbar
RADIUS = 5                   # die eine Rundung

STANZE = "BigShoulders-Bold.ttf"
MASS = "GeistMono-Regular.ttf"
MASS_B = "GeistMono-Bold.ttf"

# Aus der Metrik gelesen, nicht geraten.
VERSAL = 0.80               # Versalhöhe je Schriftgröße (Big Shoulders)
OBERKANTE = 0.186           # Abstand Anschlagpunkt → Versaloberkante
ZEILE = 0.92                # Zeilenabstand für gestapelte Versalzeilen

_cache = {}


def schrift(name, groesse):
    k = (name, int(groesse))
    if k not in _cache:
        _cache[k] = ImageFont.truetype(os.path.join(FONTS, name), int(groesse))
    return _cache[k]


def breite(d, text, f):
    k = d.textbbox((0, 0), text, font=f)
    return k[2] - k[0]


def sperr(d, xy, text, f, farbe, sperrung=0):
    """Buchstabenweise mit Sperrung — für die kleinen Marken."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=farbe)
        x += breite(d, ch, f) + sperrung
    return x - xy[0]


def sperrbreite(d, text, f, sperrung=0):
    return sum(breite(d, c, f) + sperrung for c in text) - sperrung


def umbruch(d, text, f, max_b):
    worte, zeilen, zeile = text.split(), [], ""
    for w in worte:
        versuch = f"{zeile} {w}".strip()
        if breite(d, versuch, f) <= max_b:
            zeile = versuch
        else:
            if zeile:
                zeilen.append(zeile)
            zeile = w
    if zeile:
        zeilen.append(zeile)
    return zeilen


# ---------------------------------------------------------------------------
#  Der Satz: erst messen, dann setzen. Nie umgekehrt.
# ---------------------------------------------------------------------------

def satz_gross(d, text, max_b, ziel_gr, min_gr=52):
    """Bricht und verkleinert, bis es passt. Gibt Größe, Zeilen, Höhe zurück."""
    gr = ziel_gr
    while gr > min_gr:
        f = schrift(STANZE, gr)
        zs = umbruch(d, text, f, max_b)
        if all(breite(d, z, f) <= max_b for z in zs) and len(zs) <= 3:
            return gr, zs, hoehe_gross(gr, len(zs))
        gr -= 3
    f = schrift(STANZE, min_gr)
    zs = umbruch(d, text, f, max_b)
    return min_gr, zs, hoehe_gross(min_gr, len(zs))


def hoehe_gross(gr, n):
    """Sichtbare Höhe eines Versalblocks: n Zeilen, letzte ohne Durchschuss."""
    return int(gr * ZEILE * (n - 1) + gr * VERSAL)


def setze_gross(d, x, y_versal, gr, zeilen, farbe):
    """y_versal ist die Oberkante der Versalien, nicht der Anschlagpunkt."""
    f = schrift(STANZE, gr)
    y = y_versal - gr * OBERKANTE
    for i, z in enumerate(zeilen):
        d.text((x, y + i * gr * ZEILE), z, font=f, fill=farbe)
    return y_versal + hoehe_gross(gr, len(zeilen))


def satz_klein(d, text, max_b, gr=22):
    f = schrift(MASS, gr)
    zs = umbruch(d, text, f, max_b)
    return zs, len(zs) * int(gr * 1.42)


def setze_klein(d, x, y, zeilen, farbe, gr=22):
    f = schrift(MASS, gr)
    zh = int(gr * 1.42)
    for i, z in enumerate(zeilen):
        d.text((x, y + i * zh), z, font=f, fill=farbe)
    return y + len(zeilen) * zh


# ---------------------------------------------------------------------------
#  Die wiederkehrenden Zeichen: Kachel, Reihe, Raster
# ---------------------------------------------------------------------------

def farbtafel(hell):
    """Auf Papier trägt die Nachtkachel nicht das volle Schwarz der Fläche.

       Der erste Durchgang setzte sie auf TIEF, und die Reihe zerfiel in
       schwere Punkte statt in einen Takt — auf Dunkel stimmt das Verhältnis,
       auf Hell nicht. Eine Kachel soll die Nacht bezeichnen, nicht die
       Aufmerksamkeit auf sich ziehen."""
    return {"F": TUERKIS, "S": NEBEL_H if hell else NEBEL,
            "N": (46, 62, 69) if hell else PAPIER,
            ".": STILL_H if hell else STILL_D, "?": SAND}


def reihe(d, x, y, n, muster, hell, zelle=26, luecke=6, h=None):
    h = h or zelle
    tafel = farbtafel(hell)
    for i in range(n):
        c = tafel[muster[i % len(muster)]]
        d.rounded_rectangle([x + i * (zelle + luecke), y,
                             x + i * (zelle + luecke) + zelle, y + h], RADIUS, fill=c)
    return n * (zelle + luecke) - luecke


def raster(d, x, y, spalten, zeilen, muster, hell, zelle=26, luecke=6, takt=4):
    """Das Monatsraster. Jede vierte Zeile bekommt einen Taktstrich."""
    strich = STILL_H if hell else STILL_D
    for r in range(zeilen):
        yy = y + r * (zelle + luecke)
        v = (r * 3) % len(muster)
        reihe(d, x, yy, spalten, muster[v:] + muster[:v], hell, zelle, luecke)
        if takt and (r + 1) % takt == 0 and r + 1 < zeilen:
            ly = yy + zelle + luecke // 2
            d.line([x, ly, x + spalten * (zelle + luecke) - luecke, ly], fill=strich, width=1)
    return zeilen * (zelle + luecke) - luecke


def kopf(d, links, rechts, farbe):
    f = schrift(MASS, 19)
    sperr(d, (RAND, RAND), links, f, farbe, 2.5)
    b = sperrbreite(d, rechts, f, 2.5)
    sperr(d, (B - RAND - b, RAND), rechts, f, farbe, 2.5)


def fuss(d, farbe):
    f = schrift(MASS, 19)
    y = H - RAND - 19
    sperr(d, (RAND, y), "CENTRIC", schrift(MASS_B, 19), farbe, 3.5)
    t = "dienstplanung im schichtbetrieb"
    b = sperrbreite(d, t, f, 1.5)
    sperr(d, (B - RAND - b, y), t, f, farbe, 1.5)


MAXB = B - 2 * RAND


# ---------------------------------------------------------------------------
#  KAPITEL I — NEUGIER
# ---------------------------------------------------------------------------

def blatt_neugier(i, wort, unter, muster, hell=False):
    grund = PAPIER if hell else TIEF
    vorn = TIEF if hell else PAPIER
    still = NEBEL_H if hell else NEBEL

    bild = Image.new("RGB", (B, H), grund)
    d = ImageDraw.Draw(bild)
    kopf(d, f"I.{i:02d}", "neugier", still)

    # Erst alles messen, dann den freien Raum verteilen.
    r_oben = RAND + E * 2
    r_hoehe = raster(d, RAND, r_oben, 12, 6, muster, hell, zelle=52, luecke=8)

    gr, zs, h_gross = satz_gross(d, wort, MAXB, 148)
    u_zs, h_klein = satz_klein(d, unter, MAXB - E * 2, 22)

    # Der Block sitzt in der Mitte zwischen Raster und Fußzeile — dadurch
    # gibt es kein totes Drittel mehr, sondern zwei gleiche Atempausen.
    oben = r_oben + r_hoehe
    unten = H - RAND - E - 19
    block = h_gross + E + h_klein
    y = oben + (unten - oben - block) // 2

    y2 = setze_gross(d, RAND, y, gr, zs, vorn)
    setze_klein(d, RAND, y2 + E, u_zs, still, 22)

    fuss(d, still)
    return bild


NEUGIER = [
    ("VIER WOCHEN IN VIER MINUTEN", "Ein Muster hinterlegen. Der Rest rechnet sich.", "FFSSNN.."),
    ("WER ARBEITET SILVESTER", "Frag den Plan, nicht die Gerüchteküche.", "FF..NNSS"),
    ("ELF STUNDEN", "§ 5 Arbeitszeitgesetz. Die App weiß es auch nachts um drei.", "NN..FFSS"),
    ("DER PLAN RECHNET SICH SELBST", "Vorwärts wie rückwärts. Ohne Jahresgrenze.", "FSNFSN.."),
    ("WAS KOSTET EIN DIENSTPLAN", "Nichts, solange niemand ihn ändern muss.", "FF.SS.NN"),
    ("DREISSIG TAGE", "Kein Verkaufsgespräch. Keine Zahlungsdaten.", "F.S.N.F."),
    ("MONTAG WEISS ES SCHON", "Der Plan steht, bevor die Woche anfängt.", "FFFF..SS"),
    ("ZWEI PLANER, EIN MONAT", "Niemand überschreibt den anderen mehr.", "FSFSNSFS"),
    ("OHNE NETZ", "Die letzte Fassung bleibt lesbar. Mit Datum.", ".F.S.N.."),
    ("KEIN EXCEL MEHR", "Und keine Datei namens plan_final_final_2.xlsx.", "FFSSNNFF"),
]


# ---------------------------------------------------------------------------
#  KAPITEL II — VORTEIL
# ---------------------------------------------------------------------------

def blatt_vorteil(i, zahl, einheit, wort, unter):
    bild = Image.new("RGB", (B, H), PAPIER)
    d = ImageDraw.Draw(bild)
    kopf(d, f"II.{i:02d}", "vorteil", NEBEL_H)

    # Die Zahl, gestanzt, so groß wie die Fläche es zulässt.
    gr_z = 380
    f = schrift(STANZE, gr_z)
    while breite(d, zahl, f) > MAXB - 220:
        gr_z -= 12
        f = schrift(STANZE, gr_z)
    bz = breite(d, zahl, f)
    h_zahl = int(gr_z * VERSAL)

    y_zahl = RAND + E * 3
    d.text((RAND, y_zahl - gr_z * OBERKANTE), zahl, font=f, fill=TIEF)

    # Die Einheit rechts daneben, an der Grundlinie der Zahl — mit Abstand,
    # nicht darauf. Beim ersten Durchgang lag der Strich über der Ziffer.
    fe = schrift(MASS, 27)
    d.text((RAND + bz + 26, y_zahl + h_zahl - 27), einheit, font=fe, fill=TUERKIS)

    # Der Taktstrich unter der Zahl, mit eigener Zeile.
    y_str = y_zahl + h_zahl + E
    d.rectangle([RAND, y_str, RAND + E * 3, y_str + 5], fill=TUERKIS)

    gr, zs, h_gross = satz_gross(d, wort, MAXB, 90)
    u_zs, h_klein = satz_klein(d, unter, MAXB - E * 2, 22)

    oben = y_str + 5
    unten = H - RAND - E * 2 - 14
    block = h_gross + int(E * 0.8) + h_klein
    y = oben + (unten - oben - block) // 2

    y2 = setze_gross(d, RAND, y, gr, zs, TIEF)
    setze_klein(d, RAND, y2 + int(E * 0.8), u_zs, (61, 78, 85), 22)

    # Die Signatur: eine ruhige Woche, unten.
    reihe(d, RAND, H - RAND - E * 2, 14, "FFSSNN..", True, zelle=44, luecke=8, h=9)

    fuss(d, NEBEL_H)
    return bild


VORTEIL = [
    ("24", "monate", "AUFZEICHNUNG OHNE ORDNER", "§ 16 Abs. 2 ArbZG verlangt zwei Jahre. Die App hält sie."),
    ("0", "kopfpauschale", "EINSTELLEN KOSTET NICHTS EXTRA", "Der Preis hängt am Standort, nicht an der Belegschaft."),
    ("11", "stunden", "RUHEZEIT WIRD GEPRÜFT", "Vor dem Speichern, nicht in der Nachschau."),
    ("1", "klick", "ZUR LOHNBUCHHALTUNG", "Zuschläge, Stunden, Abwesenheiten — fertig sortiert."),
    ("7", "rollen", "JEDE SIEHT NUR IHRES", "Vom Betriebsrat bis zur Schichtverantwortung."),
    ("100", "prozent", "DEINE DATEN BLEIBEN DEINE", "Vollausgabe jederzeit. Ohne Rückfrage, ohne Kündigung."),
    ("3", "wege", "BEIM KONFLIKT", "Übernehmen, verwerfen, nebeneinanderlegen. Nie stillschweigend."),
    ("16", "bundesländer", "FEIERTAGE STIMMEN", "Auch die halben. Auch die regionalen."),
    ("2", "minuten", "BIS ZUR ERSTEN SCHICHTFOLGE", "Vorlage wählen, Einheiten benennen, fertig."),
    ("365", "tage", "IM VORAUS PLANBAR", "Und rückwärts genauso weit."),
]


# ---------------------------------------------------------------------------
#  KAPITEL III — BEFUND
#  Oben der Befund auf Dunkel, unten die Auflösung auf Papier.
#  Die Teilung sitzt auf der Rasterlinie, nicht irgendwo.
# ---------------------------------------------------------------------------

def blatt_befund(i, problem, problem_klein, loesung, loesung_klein):
    bild = Image.new("RGB", (B, H), TIEF)
    d = ImageDraw.Draw(bild)
    teil = RAND + E * 12          # 630 — auf der Einheit, nicht auf Prozent
    d.rectangle([0, teil, B, H], fill=PAPIER)

    kopf(d, f"III.{i:02d}", "befund", NEBEL)

    # --- oben ---------------------------------------------------------------
    # Beide Hälften bekommen denselben Aufbau: Strich, Marke, Wort, Zeile.
    # Ohne den Strich oben wirkte die untere Hälfte wie ein anderes Blatt.
    d.rectangle([RAND, RAND + E, RAND + E * 2, RAND + E + 5], fill=SAND)
    sperr(d, (RAND, RAND + E + 24), "BEFUND", schrift(MASS_B, 20), SAND, 4.5)

    gr, zs, h_gross = satz_gross(d, problem, MAXB, 96, min_gr=54)
    u_zs, h_klein = satz_klein(d, problem_klein, MAXB - E, 21)

    o_oben = RAND + E * 3
    o_unten = teil - E * 2 - 14
    block = h_gross + int(E * 0.7) + h_klein
    y = o_oben + max(0, (o_unten - o_oben - block) // 2)
    y2 = setze_gross(d, RAND, y, gr, zs, PAPIER, )
    setze_klein(d, RAND, y2 + int(E * 0.7), u_zs, NEBEL, 21)

    # Die Reihe mit Lücken — das Problem, als Zeichen.
    reihe(d, RAND, teil - E - 14, 14, "F?S.N?F.", False, zelle=44, luecke=8, h=14)

    # --- unten --------------------------------------------------------------
    d.rectangle([RAND, teil + E, RAND + E * 2, teil + E + 5], fill=TUERKIS)
    sperr(d, (RAND, teil + E + 24), "LÖSUNG", schrift(MASS_B, 20), TUERKIS, 4.5)

    gr2, zs2, h2 = satz_gross(d, loesung, MAXB, 92, min_gr=52)
    l_zs, hl = satz_klein(d, loesung_klein, MAXB - E, 21)

    u_oben = teil + E * 2 + 24
    u_unten = H - RAND - E * 2 - 14
    block2 = h2 + int(E * 0.7) + hl
    y3 = u_oben + max(0, (u_unten - u_oben - block2) // 2)
    y4 = setze_gross(d, RAND, y3, gr2, zs2, TIEF)
    setze_klein(d, RAND, y4 + int(E * 0.7), l_zs, (61, 78, 85), 21)

    # Dieselbe Reihe, geschlossen.
    reihe(d, RAND, H - RAND - E * 2, 14, "FFSSNNFF", True, zelle=44, luecke=8, h=14)

    fuss(d, NEBEL_H)
    return bild


BEFUND = [
    ("DER PLAN HÄNGT AM SCHWARZEN BRETT",
     "Wer im Frei ist, erfährt die Änderung beim nächsten Dienst.",
     "JEDE ÄNDERUNG ERREICHT DIE SCHICHT",
     "Auf dem Telefon, mit Datum und Grund."),
    ("EINE TABELLE, ZWÖLF FASSUNGEN",
     "Und niemand weiß, welche gilt.",
     "EIN STAND, NACHVOLLZIEHBAR",
     "Jede Änderung mit Person, Zeit und Anlass."),
    ("RUHEZEIT FÄLLT ERST BEI DER PRÜFUNG AUF",
     "Dann ist der Monat gelaufen und das Bußgeld steht.",
     "DER VERSTOSS WIRD VORHER SICHTBAR",
     "Beim Eintragen, nicht bei der Kontrolle."),
    ("URLAUBSANTRÄGE AUF ZETTELN",
     "Drei Wochen im Fach der Leitung.",
     "ANTRAG, PRÜFUNG, ANTWORT",
     "Mit Blick auf Besetzung und Resturlaub."),
    ("KRANKMELDUNG UM FÜNF UHR MORGENS",
     "Wer springt ein? Das weiß nur die Erfahrung.",
     "DIE APP KENNT DIE KANDIDATEN",
     "Qualifiziert, ausgeruht, unter der Wochengrenze."),
    ("STUNDENKONTEN IM KOPF",
     "Bis jemand nachrechnet und es nicht stimmt.",
     "JEDE STUNDE STEHT",
     "Soll, Ist, Ausgleich — tagesgenau."),
    ("NACHTZUSCHLAG PER DAUMENREGEL",
     "Der Dienst von 21:30 bis 6:15 zählt wie viel?",
     "ZUSCHLÄGE WERDEN GERECHNET",
     "Nach eurem Tarif, minutengenau, über Mitternacht hinweg."),
    ("QUALIFIKATION ABGELAUFEN",
     "Aufgefallen beim Audit, nicht bei der Planung.",
     "NACHWEISE MIT ABLAUFDATUM",
     "Rechtzeitig gewarnt, statt hinterher erklärt."),
    ("SECHS DIENSTE AM STÜCK",
     "Passiert, wenn niemand mitzählt.",
     "SERIEN WERDEN BEGRENZT",
     "Eure Grenze, nicht unsere Vermutung."),
    ("DER ANBIETER HAT EURE DATEN",
     "Und die Herausgabe steht im Kleingedruckten.",
     "VOLLAUSGABE, JEDERZEIT",
     "Ein Schlüssel, der ausschließlich lesen darf."),
]


def main():
    os.makedirs(AUS, exist_ok=True)
    n = 0
    for i, (wort, unter, muster) in enumerate(NEUGIER, 1):
        blatt_neugier(i, wort, unter, muster, hell=(i % 4 == 0)) \
            .save(os.path.join(AUS, f"01-neugier-{i:02d}.png"), optimize=True)
        n += 1
    for i, (zahl, einheit, wort, unter) in enumerate(VORTEIL, 1):
        blatt_vorteil(i, zahl, einheit, wort, unter) \
            .save(os.path.join(AUS, f"02-vorteil-{i:02d}.png"), optimize=True)
        n += 1
    for i, (p, pk, l, lk) in enumerate(BEFUND, 1):
        blatt_befund(i, p, pk, l, lk) \
            .save(os.path.join(AUS, f"03-befund-{i:02d}.png"), optimize=True)
        n += 1
    print(f"{n} Blätter in {AUS}")


if __name__ == "__main__":
    main()

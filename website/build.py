#!/usr/bin/env python3
"""
CENTRIC — Website-Generator.

Erzeugt die vollständige statische Website nach dist/.
Aufruf:  python3 build.py
"""
import datetime, math, os, re, shutil, sys

# Quelle und Ergebnis liegen getrennt: Hier neben build.py stehen nur die
# Eingaben (Schriften, Drei.js), unter dist/ entsteht alles, was
# ausgeliefert wird — ein für sich vollständiger Ordner, der ohne dieses
# Skript auskommt. CENTRIC_OUT setzt ein anderes Ziel.
QUELLE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("CENTRIC_OUT", os.path.join(QUELLE, "dist"))

# Die Anwendung selbst. Alle „Testen"-Aufrufe führen direkt dorthin — der
# Betrieb entsteht in Selbstbedienung, mit E-Mail, Passwort und AVV; die
# Website sammelt dafür nichts mehr ein. „Vorführung buchen" bleibt der
# zweite Weg über das Kontaktformular.
# Wohin die Knöpfe „Anmelden" und „Testen" führen — die Anwendung liegt
# als eigene Auslieferung unter eigener Adresse (app.), die Website unter
# der Hauptadresse. Getrennt, weil die Anwendung alles, was keine
# Funktion ist, auf ihre index.html lenkt: Eine statische Website davor
# hieße, gegen diese Regel zu arbeiten, und jede neue Funktion wäre eine
# neue Gelegenheit, eine Seite hier zu verschatten.
# Die Umgebungsvariable CENTRIC_APP übersteuert die Vorgabe.
APP = os.environ.get("CENTRIC_APP", "https://app.centric-dienstplanung.de").rstrip("/")

# Unter welcher Adresse die Website selbst steht. Geht nur in sitemap.xml
# und robots.txt ein — im Seiteninhalt sind alle Verweise relativ, die
# Website läuft also unter jeder Adresse. Die Umgebungsvariable
# CENTRIC_WEBSITE übersteuert die Vorgabe, ohne den Quelltext anzufassen.
WEBSITE = os.environ.get("CENTRIC_WEBSITE", "https://centric-dienstplanung.de").rstrip("/")

# Gelesen wird aus der Quelle, geschrieben ins Ergebnis. Schriften und
# Drei.js werden beim Bau nach dist/assets/ kopiert.
ASSETS_QUELLE = os.path.join(QUELLE, "assets")
ASSETS = os.path.join(OUT, "assets")


def schreibe(pfad, text):
    """Eine Textdatei, überall gleich.

    Python übersetzt beim Schreiben im Textmodus „\\n" in das Zeilenende des
    Betriebssystems — unter Windows also in CRLF. Dann unterscheiden sich
    dieselben Seiten je nachdem, wer sie gebaut hat, und ein Vergleich zweier
    Bauten sagt nichts mehr. `newline="\\n"` schaltet die Übersetzung ab: das
    Ergebnis trägt LF, gleich auf welchem System.
    """
    with open(pfad, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return pfad

# ════════════════════════════════════════════════════════════════════════════
# PRODUKTDATEN — 1:1 aus dem Quelltext der Anwendung
#
# Die maßgebliche Fassung steht im Anwendungsrepo unter `src/stufen.js`;
# dort rechnet die Abrechnung damit, hier nur die Auskunft. Wer eine Zahl
# ändert, ändert sie an beiden Orten — sonst nennt die Website einen
# Preis, den die Anwendung nicht einhält. `pruefungen/stufen.test.js`
# hält die Zahlen drüben ausdrücklich fest, damit man beim Ändern hier
# vorbeikommt.
#
# Das Modell in drei Sätzen: Die Grundgebühr der Stufe deckt ein
# Kontingent an Planer-Zugängen und ein Kontingent an Standorten
# beliebiger Größe. Jeder Planer-Zugang darüber kostet eine feste
# Pauschale. Jeder Standort darüber kostet nach SEINER eigenen Größe.
# Wer geplant wird, kostet nichts.
# ════════════════════════════════════════════════════════════════════════════

# ════════════════════════════════════════════════════════════════════════════
# PAKETZUSTAND — die EINE Quelle dafür, was die Website über ein Branchenpaket sagt
#
# Betreiberentscheidung 2026-11-24 (P2-39, Option A) und G9 der Anwendung:
# Nur ein Paket im Zustand 5 („buchbar und abrechenbar") darf mit Preis genannt,
# als Schalter im Preisrechner angeboten und als „enthalten" beworben werden.
# Zustand 1 bis 4: „In Vorbereitung – noch nicht buchbar", ohne Preis, ohne
# Schalter. Preisrechner, Tabellen, Karten und Texte werden aus dieser Tabelle
# erzeugt; es gibt keine zweite Liste.
#
# Fail-closed: Ein Paket, das hier nicht steht (neues Modul), hat Zustand 1.
# Ein Wert außerhalb 1 bis 5 gilt ebenfalls als Zustand 1. Die Zielpreise stehen
# als `zielpreis` in PAKETE; gedruckt werden sie nur über `paket_preis()`.
# Quelle der Wahrheit in der Anwendung: server/lib/paketstand.mjs
# (PAKET_FREIGABEN ist heute leer: kein Paket ist buchbar). Wird dort ein Paket
# freigegeben, ändert sich hier genau diese Tabelle — bewusst, mit Prüfsatz.
# ════════════════════════════════════════════════════════════════════════════
PAKET_ZUSTAND = {
    "sicherheit": 1,
    "pflege": 1,
    "klinik": 1,
    "industrie": 1,
}
PAKET_BUCHBAR_AB = 5
PAKET_VORB = "In Vorbereitung \u2013 noch nicht buchbar"


def paket_zustand(pid):
    z = PAKET_ZUSTAND.get(pid, 1)
    return z if isinstance(z, int) and not isinstance(z, bool) and 1 <= z <= 5 else 1


def paket_buchbar(p):
    return paket_zustand(p["id"]) >= PAKET_BUCHBAR_AB


def paket_preis(p):
    """Der Zielpreis eines Pakets — nur bei Zustand 5, sonst None (kein Preis)."""
    return p["zielpreis"] if paket_buchbar(p) else None


def paket_status(p):
    """Zeile unter einem Paketnamen: Preis (Zustand 5) oder der Hinweis „In Vorbereitung"."""
    pr = paket_preis(p)
    return f"+ {pr} \u20ac je Monat und Betrieb" if pr is not None else PAKET_VORB


_PAKET_FREI = any(paket_zustand(i) >= PAKET_BUCHBAR_AB for i in PAKET_ZUSTAND)
PAKET_ENTERPRISE_ZEILE = ("Zwei Branchenpakete enthalten" if _PAKET_FREI
                          else "Branchenpakete: in Vorbereitung, noch nicht buchbar")
PAKET_HINWEIS_ENTERPRISE = ("Im Tarif Enterprise sind zwei Branchenpakete enthalten." if _PAKET_FREI
                            else "Die Branchenpakete sind in Vorbereitung und noch nicht buchbar. "
                                 "Es gibt keinen Preis und keine Buchung, bis ein Paket freigegeben ist.")


STUFEN = [
    dict(id="basis", name="Basis", grund=89, planer_inkl=1, standorte_inkl=1, pakete_frei=0,
         claim="Eine Planung, ein Standort. Für den Betrieb, der an einem Ort arbeitet.",
         leistungen=["Dienstplanung mit Rotationsmodellen", "Anträge und Tauschbörse",
                     "Kalender-Feed und Weckzeiten", "Mobile Ansicht",
                     "Datenmitnahme jederzeit"]),
    dict(id="pro", name="Business", grund=159, planer_inkl=3, standorte_inkl=2, pakete_frei=0,
         claim="Der Regelfall: mehrere Planende, geprüfte Arbeitszeit, Lohnübergabe.",
         leistungen=["Alles aus Basis", "Qualifikationen mit Ablauf", "Arbeitszeitprüfung",
                     "Belastbarkeitsanalyse", "Lohnausgabe — ein Klick zur Lohnbuchhaltung"]),
    dict(id="enterprise", name="Enterprise", grund=279, planer_inkl=8, standorte_inkl=4, pakete_frei=2,
         claim="Verteilte Betriebe, Auftraggeber-Nachweise, Auftragsverarbeitung.",
         leistungen=["Alles aus Business", PAKET_ENTERPRISE_ZEILE,
                     "Leistungsnachweis für Auftraggeber",
                     "Auftragsverarbeitung nach Artikel 28", "Bevorzugter Rückruf"]),
]

# Was ein zusätzlicher Standort kostet — gestaffelt nach seiner eigenen
# Größe, nicht nach der des Betriebs. Unter fünfzehn Personen ist ein Ort
# eine Postanschrift und keine Einrichtung; deshalb kostet er nichts.
# (bis, zuschlag, label); bis=None heißt „und darüber".
STANDORT_BAENDER = [
    (14, 0, "bis 14 Personen"),
    (40, 29, "15 – 40 Personen"),
    (80, 49, "41 – 80 Personen"),
    (150, 79, "81 – 150 Personen"),
    (None, 119, "über 150 Personen"),
]

# Ein Planer-Zugang über dem Kontingent — feste Pauschale, unabhängig von
# der Betriebsgröße.
ZUSATZ_PLANER = 25

# Jenseits dieser Größe rechnet die Formel weiter, aber ein Betrieb dieser
# Art soll nicht allein vor einem Formular stehen. Ab hier steht
# „Sprechen Sie uns an" statt einer Zahl.
KONTAKT_AB_PLANER = 16
KONTAKT_AB_ZUSCHLAGSSTANDORTE = 9


def mehrzahl(n, eins, viele):
    """„1 Standort", aber „2 Standorte" — Kontingente stehen oft bei eins."""
    return f"{n} {eins if n == 1 else viele}"

PAKETE = [
    dict(id="sicherheit", name="Sicherheitsdienst", zielpreis=79, band="Posten, § 34a, Wachbuch",
         kurz="Objektbezogene Posten, Sachkundenachweis mit harter Sperre, Wachbuch, "
              "Standortprüfung beim Stempeln.",
         punkte=["Posten je Objekt statt Dienste je Einheit",
                 "§ 34a-Sachkunde als harte Sperre — ohne Nachweis kein Einsatz",
                 "Wachbuch mit Übergabe und Vorkommnissen",
                 "Standortprüfung beim Stempeln (Geofence)",
                 "Objektbericht und Leistungsnachweis für den Auftraggeber"]),
    dict(id="pflege", name="Pflege", zielpreis=89, band="Fachkraftquote je Dienst",
         kurz="Fachkraftquote je Dienst, Übergabeprotokoll, Wohnbereichsplanung, "
              "Betreuungskräfte nach § 43b.",
         punkte=["Fachkraftquote wird je einzelnem Dienst geprüft, nicht je Schicht",
                 "Wohnbereiche als eigene Planungsebene",
                 "Betreuungskräfte nach § 43b SGB XI",
                 "Übergabeprotokoll zwischen den Diensten",
                 "Pflegequalifikationen mit Ablaufdatum"]),
    dict(id="klinik", name="Klinik", zielpreis=129, band="Bereitschaft, geteilte Dienste",
         kurz="Bereitschaftsdienst und Rufbereitschaft mit eigener Anrechnung, "
              "geteilte Dienste, Funktionsdienste, Rotationen.",
         punkte=["Bereitschaftsdienst und Rufbereitschaft mit eigener Anrechnung",
                 "Geteilte Dienste über den Tag",
                 "Funktionsdienste getrennt vom Stationsdienst",
                 "Rotationen über Abteilungen hinweg",
                 "Übergabe und Fachkraftquote inbegriffen"]),
    dict(id="industrie", name="Industrie und Anlagen", zielpreis=59, band="Anlagen, Kontimodelle",
         kurz="Anlagenbindung, Maschinenqualifikationen, Kontischichtmodelle mit Stufenversatz.",
         punkte=["Personen an Anlagen statt an Räume binden",
                 "Maschinenqualifikationen als Einsatzvoraussetzung",
                 "Kontischichtmodelle mit Stufenversatz",
                 "Vier-, Fünf- und Sechsgruppenmodelle als Vorlage",
                 "Anlagenbezogene Mindestbesetzung"]),
]

ROLLEN = [
    ("Organisationsleitung", "OL", "Richtet Betrieb, Einheiten, Dienstarten und Zugänge ein. "
                                   "Sieht alles im eigenen Betrieb."),
    ("Planer", "PL", "Plant, ändert Schichtfolgen und Dienstarten, genehmigt Anträge."),
    ("Sub-Planer", "SP", "Ändert Einsätze nur in der eigenen Einheit und genehmigt dort Anträge."),
    ("Mitarbeiter", "MA", "Sieht den eigenen Plan, stellt Urlaubsanträge und Tauschanfragen."),
    ("Betriebsrat", "BR", "Rein lesender Prüfzugang auf Pläne und Protokoll. Kostenfrei."),
]

# Rotationsmuster für die Grafiken — 24 Tage, sechs Gruppen, Versatz vier
CYCLE = ["F"] * 5 + ["-"] * 2 + ["S"] * 5 + ["-"] * 2 + ["N"] * 5 + ["-"] * 5
GROUPS, STEP = 6, 4


def zustand(tag, versatz):
    return CYCLE[(tag - versatz) % 24]


# ════════════════════════════════════════════════════════════════════════════
# GRAFIKEN — dieselbe Regel wie in der Anwendung, als SVG gezeichnet
# ════════════════════════════════════════════════════════════════════════════

EPOCHE = datetime.date(2026, 1, 1)      # Startpunkt der Gruppe 1
WOCHENTAG = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
KLASSE = {"F": "f", "S": "s", "N": "n", "-": "o"}
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
          "August", "September", "Oktober", "November", "Dezember"]


WELLE = 9000        # Dauer der Helligkeitswelle in Millisekunden


def plan_zellen(start, spalten):
    """Die laufenden Spalten: Tagesköpfe und darunter sechs Gruppenzeilen.

    Die Phase der Helligkeitswelle hängt am absoluten Tag, nicht an der
    Spalte. Deshalb behält eine Marke ihren Takt, während der Plan unter ihr
    nach links rückt — die Welle wandert mit dem Plan statt mit dem Bild.
    """
    o = []
    for i in range(spalten):
        d = start + datetime.timedelta(days=i)
        we = " we" if d.weekday() >= 5 else ""
        o.append(f'<span class="p-tag{we}" style="--i:{i}">'
                 f'<i>{WOCHENTAG[d.weekday()]}</i><b>{d.day:02d}</b></span>')
    for g in range(GROUPS):
        for i in range(spalten):
            tag = (start - EPOCHE).days + i
            st = CYCLE[(tag - g * STEP) % 24]
            ph = (tag * 90 + g * 420) % WELLE
            o.append(f'<span class="p-z" style="--i:{i}">'
                     f'<i class="m {KLASSE[st]}" style="--ph:{ph}"></i></span>')
    return "".join(o)


def hero_plan(start=datetime.date(2026, 8, 1), spalten=46):
    """Der Plan als Instrument: Beschriftung fest, Tage laufen.

    Dieselbe Arithmetik wie in der Anwendung — aus Zyklus und Versatz wird
    jeder Tag gerechnet. Das Gitter rückt gleichmäßig um je einen Tag nach
    links und läuft rechts aus dem Bild: der Plan hört nicht auf, er wird
    nur nicht mehr gezeigt.
    """
    marken = "".join(f'<span class="p-lab">G{g + 1}</span>' for g in range(GROUPS))
    return (f'<div class="plan-buehne frisch" id="p-buehne">'
            f'<div class="p-marken" aria-hidden="true">'
            f'<span class="p-ecke"></span>{marken}</div>'
            f'<div class="p-lauf"><div class="p-gitter" id="p-gitter" '
            f'style="--spalten:{spalten}">{plan_zellen(start, spalten)}'
            f'</div></div></div>')


def plan_strip(days=28, w=520, dark=False):
    """Der ausgerollte Plan: sechs Gruppen, ein Versatz von vier Tagen.

    Die Marken tragen Klassen statt fester Farben — so nimmt der Bogen die
    Werte der Fläche an, auf der er liegt (Nacht oder Papier).
    """
    pitch, rp, mh, mw = w / days, 22.0, 15.0, 9.2
    h = rp * GROUPS + 8
    o = [f'<svg class="plan-svg" viewBox="0 0 {w} {h:.0f}" width="100%" role="img" '
         f'aria-label="Schichtplan: sechs Gruppen, jede um vier Tage versetzt">']
    for g in range(GROUPS):
        y = 12 + g * rp
        for d in range(days):
            k = KLASSE[zustand(d, g * STEP)]
            x = d * pitch + (pitch - mw) / 2
            o.append(f'<rect class="{k}" x="{x:.2f}" y="{y-mh/2:.2f}" '
                     f'width="{mw:.2f}" height="{mh:.2f}" rx="{mw/2:.2f}"/>')
    o.append("</svg>")
    return "".join(o)


def rotation_ring(size=420, dark=True):
    """Die gewickelte Regel: ein Zyklus, sechs Ringe, ein Versatz.

    Wie der Bogen trägt auch der Ring Klassen statt fester Farben.
    """
    c = size / 2
    r0 = size * 0.115
    dr = size * 0.062
    sw = size * 0.021
    radii = [r0 + i * dr for i in range(GROUPS)]
    secw = 15.0
    foot = secw * 0.66

    def pol(r, deg):
        t = math.radians(deg)
        return c + r * math.cos(t), c + r * math.sin(t)

    o = [f'<svg class="ring-svg" viewBox="0 0 {size} {size}" width="100%" role="img" '
         f'aria-label="Sechs Gruppen laufen denselben Zyklus von 24 Tagen, '
         f'jede zu ihrer eigenen Zeit">']
    # Jeder Ring ist eine eigene Gruppe — dadurch kann er für sich laufen.
    # Nach außen wird der Gang langsamer, benachbarte Ringe laufen gegenläufig.
    for i, r in enumerate(radii):
        cap = (sw / 2 / r) * 180 / math.pi
        half = max(foot / 2 - cap, 0.5)
        dauer = 92 + i * 26
        richtung = 1 if i % 2 == 0 else -1
        o.append(f'<g class="rg" style="transform-origin:{c}px {c}px;'
                 f'--dauer:{dauer}s;--richtung:{richtung}">')
        for k in range(24):
            st = zustand(k, i * STEP)
            a0 = -90 + k * secw
            hs = foot / 2 if st == "-" else half
            x1, y1 = pol(r, a0 - hs)
            x2, y2 = pol(r, a0 + hs)
            o.append(f'<path class="b {KLASSE[st]}" style="--sw:{sw:.1f}" '
                     f'd="M {x1:.1f} {y1:.1f} A {r:.1f} {r:.1f} 0 0 1 '
                     f'{x2:.1f} {y2:.1f}"/>')
        o.append("</g>")
    o.append(f'<circle class="mitte-ring" cx="{c}" cy="{c}" r="{r0*0.62:.1f}"/>')
    o.append(f'<text class="mitte" x="{c}" y="{c+size*0.012:.1f}" '
             f'text-anchor="middle" font-size="{size*0.075:.0f}">24</text>')
    o.append(f'<text class="mitte-lab" x="{c}" y="{c+size*0.062:.1f}" '
             f'text-anchor="middle" font-size="{size*0.026:.0f}">TAGE</text>')
    o.append("</svg>")
    return "".join(o)


def logo(size=30, wort=True, hell=True):
    """Die Bildmarke. Sie trägt Klassen statt fester Farben und nimmt
    dadurch die Werte der Fläche an, auf der sie liegt — dunkel auf
    Papier, hell auf der Seitenleiste."""
    return (f'<svg class="logo" width="{size}" height="{size}" viewBox="0 0 100 100" '
            f'fill="none" aria-hidden="true" focusable="false">'
            f'<rect class="lb" x="6" y="8" width="88" height="26" rx="13"/>'
            f'<rect class="lm" x="6" y="37" width="88" height="26" rx="13"/>'
            f'<rect class="lb" x="6" y="66" width="88" height="26" rx="13"/>'
            f'<path class="lk" d="M92 26 C99 30 99 41 90 45 C78 50 62 44 50 47 '
            f'C38 50 26 58 20 63 C13 69 13 78 20 82"/></svg>')


def marke(size=26, hell=True):
    """Bildmarke plus Wortmarke — die Wortmarke kommt aus der Schmalschrift."""
    return (f'<span class="wortmarke">{logo(size)}'
            f'<span class="wortmarke-text">CENTRIC</span></span>')


# ── Schriften ──────────────────────────────────────────────────────────────
# Drei Rollen: eine schmale Signalschrift für Überschriften (sie trägt lange
# deutsche Komposita in großem Grad), eine Grotesk für den Fließtext und eine
# Festbreitenschrift für alles Zählbare. Alle drei liegen als Datei bei.
SCHRIFTEN = [
    ("Signal", "Jura-Light.ttf", 300, "normal"),
    ("Signal", "Jura-Medium.ttf", 500, "normal"),
    ("Lauf", "InstrumentSans-Regular.ttf", 400, "normal"),
    ("Lauf", "InstrumentSans-Bold.ttf", 700, "normal"),
    ("Lauf", "InstrumentSans-Italic.ttf", 400, "italic"),
    ("Zaehl", "GeistMono-Regular.ttf", 400, "normal"),
]


def schrift_css(einbetten=False):
    import base64
    o = []
    for fam, datei, gew, stil in SCHRIFTEN:
        if einbetten:
            roh = open(os.path.join(ASSETS_QUELLE, "fonts", datei), "rb").read()
            src = ("url(data:font/ttf;base64,%s) format('truetype')"
                   % base64.b64encode(roh).decode())
        else:
            src = f"url(fonts/{datei}) format('truetype')"
        o.append(f"@font-face{{font-family:'{fam}';src:{src};"
                 f"font-weight:{gew};font-style:{stil};font-display:swap}}")
    return "\n".join(o)


# ════════════════════════════════════════════════════════════════════════════
# LAYOUT
# ════════════════════════════════════════════════════════════════════════════

NAV = [("funktionen.html", "Funktionen"), ("branchen.html", "Branchen"),
       ("preise.html", "Preise"), ("sicherheit.html", "Sicherheit"),
       ("wissen.html", "Wissen"), ("ueber-uns.html", "Über uns")]

FOOTER = [
    ("Produkt", [("funktionen.html", "Funktionen"), ("branchen.html", "Branchen"),
                 ("preise.html", "Preise"), ("preise.html#rechner", "Preisrechner"),
                 ("sicherheit.html", "Sicherheit und Datenschutz")]),
    ("Unternehmen", [("ueber-uns.html", "Über uns"), ("wissen.html", "Wissen"),
                     ("kontakt.html", "Kontakt"), ("kontakt.html#demo", "Vorführung buchen"),
                     ("ueber-uns.html#arbeiten", "Arbeiten bei CENTRIC")]),
    ("Hilfe", [("faq.html", "Häufige Fragen"), ("funktionen.html#einrichtung", "Einrichtung"),
               ("kontakt.html#support", "Support"), ("sicherheit.html#av", "AV-Vertrag"),
               ("wissen.html", "Handbuch und Leitfäden")]),
    ("Rechtliches", [("impressum.html", "Impressum"), ("datenschutz.html", "Datenschutz"),
                     ("agb.html", "AGB"), ("barrierefreiheit.html", "Barrierefreiheit"),
                     ("datenschutz.html#cookies", "Cookies")]),
]


def app_verweise(html):
    """Hängt die Testen-Aufrufe auf die Anwendung um.

    Nur die Knöpfe, deren Beschriftung ein Testversprechen ist — die
    Vorführung, das Handbuch und der Support gehen weiter über die
    Kontaktseite. Umgeschrieben wird am fertigen Markup, damit die
    Inhalte selbst unangetastet bleiben und die Regel an einer Stelle
    steht statt an dreiundfünfzig.
    """
    import re
    muster = re.compile(
        r'href="kontakt\.html#demo"([^>]*>\s*)'
        r'(Kostenlos testen|30 Tage testen|Unverbindlich testen|Testen)\b')
    return muster.sub(rf'href="{APP}/#testen"\1\2', html)


def layout(slug, title, desc, body, hero_dark=False):
    halle_skripte = ('<script src="assets/vendor/three.min.js" defer></script>\n'
                     '<script src="assets/halle.js" defer></script>'
                     if slug == "index.html" else "")
    aktiv = ' aria-current="page"'
    nav = "".join(
        '<a href="%s"%s>%s</a>' % (h, aktiv if h == slug else "", t)
        for h, t in NAV)
    cols = "".join(
        '<div><h2>' + name + '</h2><ul>' +
        "".join(f'<li><a href="{h}">{t}</a></li>' for h, t in links) + '</ul></div>'
        for name, links in FOOTER)
    body = app_verweise(body)
    return f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#EDF2F4">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<a class="skip" href="#inhalt">Zum Inhalt springen</a>

<header class="kopf">
  <div class="wrap kopf-in">
    <a class="marke" href="index.html" aria-label="CENTRIC — Startseite">{marke(24)}</a>
    <nav class="nav" id="nav" aria-label="Hauptnavigation">{nav}</nav>
    <div class="kopf-akt">
      <a class="btn nur-breit" href="{APP}/#anmelden">Anmelden</a>
      <a class="btn btn-voll-akzent" href="{APP}/#testen">Testen</a>
      <button class="burger" id="burger" aria-expanded="false" aria-controls="nav"
              aria-label="Navigation öffnen"><span></span><span></span></button>
    </div>
  </div>
</header>

<main id="inhalt">
{body}
</main>

<footer class="fuss">
  <div class="wrap">
    <div class="fuss-oben">
      <div class="fuss-marke">
        {marke(30)}
        <p>Dienstplanung für rotierende Schichtbetriebe. Der Plan wird gerechnet,
           nicht ausgerollt — vorwärts wie rückwärts, ohne Jahresgrenze.</p>
        <p class="fuss-adr">Centric UG (haftungsbeschränkt) · Berliner Straße 49 · 64839 Münster<br>
           <a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></p>
      </div>
      <div class="fuss-spalten">{cols}</div>
    </div>
    <div class="fuss-unten">
      <p>© 2026 Centric UG (haftungsbeschränkt)</p>
      <p>Ohne Tracker · ohne Werbe-Cookies · Server in der EU</p>
    </div>
  </div>
</footer>

<script src="assets/site.js" defer></script>
{halle_skripte}
</body>
</html>
"""


# Bausteine ------------------------------------------------------------------
# Die Seite folgt dem Aufbau eines Planbogens: links eine schmale Spalte für
# die Beschriftung, rechts das Feld. Dazwischen läuft eine durchgehende
# Haarlinie. Es gibt keine schwebenden Karten und keine runden Ecken — rund
# ist auf dieser Seite ausschließlich eine Schicht.

DUNKLE_ABSCHNITTE = ("sect-dunkel", "sect-nacht", "sect-cta")


def sect(inner, cls="", ident=""):
    i = f' id="{ident}"' if ident else ""
    # Midnight-Bänder tragen die Rolle der Seitenleiste
    if any(k in cls for k in DUNKLE_ABSCHNITTE):
        cls += " dunkel"
    return f'<section class="sect {cls}"{i}><div class="wrap">{inner}</div></section>'



def kopfzeile(eyebrow, h, lead="", tag="h2"):
    e = eyebrow or "&nbsp;"
    l = f'<p class="lead">{lead}</p>' if lead else ""
    return (f'<div class="sect-kopf"><p class="rail-lab">{e}</p>'
            f'<div class="titel"><{tag}>{h}</{tag}>{l}</div></div>')


def karten(items, cls="feld-3", tag="h3"):
    """Zellen eines Rasters, durch Linien getrennt — keine schwebenden Karten."""
    o = []
    for it in items:
        li = ("<ul class='tick'>" + "".join(f"<li>{x}</li>" for x in it["punkte"]) + "</ul>"
              ) if it.get("punkte") else ""
        o.append(f'<article class="zelle"><{tag}>{it["h"]}</{tag}>'
                 f'<p>{it["t"]}</p>{li}</article>')
    return f'<div class="{cls}">' + "".join(o) + "</div>"


def faq_liste(paare):
    return '<div class="faq">' + "".join(
        f'<details><summary><span>{q}</span></summary><div class="faq-a">{a}</div></details>'
        for q, a in paare) + "</div>"


def cta(titel="Sehen Sie Ihren eigenen Plan gerechnet",
        text="Dreißig Tage testen, ohne Zahlungsdaten. Wir richten Ihren ersten "
             "Standort gemeinsam ein — meist in unter einer Stunde."):
    return f"""<section class="sect sect-cta dunkel">
  <div class="wrap">
    <div class="cta">
      <div class="cta-text"><p class="rail-lab">Nächster Schritt</p><h2>{titel}</h2><p>{text}</p></div>
      <div class="cta-akt">
        <a class="btn btn-voll-akzent btn-gross" href="kontakt.html#demo">Kostenlos testen</a>
        <a class="btn btn-gross" href="kontakt.html#demo">Vorführung buchen</a>
      </div>
    </div>
  </div>
</section>"""


# ════════════════════════════════════════════════════════════════════════════
# SEITEN
# ════════════════════════════════════════════════════════════════════════════

# Die drei Regler des Preisrechners — dieselben drei Größen wie im
# Rechner der Anwendung. Planer-Zugänge und Standorte in ganzen
# Schritten; die Personenzahl in Fünferschritten, damit die Bandgrenzen
# bei 15, 40, 80 und 150 auf einer Raste liegen.
RINGE = [
    dict(id="planer", titel="Planer-Zugänge", einheit="Zugänge",
         min=1, max=20, schritt=1, wert=1),
    dict(id="standorte", titel="Standorte", einheit="Standorte",
         min=1, max=30, schritt=1, wert=3),
    dict(id="personen", titel="Personen je Standort", einheit="Personen",
         min=5, max=300, schritt=5, wert=45),
]


def ring_felder():
    """Die Regler des Preisrechners als Behälter; das Skript zeichnet hinein."""
    o = []
    for r in RINGE:
        o.append(
            f'<div class="feld ringfeld">'
            f'<span class="ring-lab" id="lab-{r["id"]}">{r["titel"]}</span>'
            f'<div class="ring" id="ring-{r["id"]}" data-min="{r["min"]}" '
            f'data-max="{r["max"]}" data-schritt="{r["schritt"]}" '
            f'data-wert="{r["wert"]}" data-einheit="{r["einheit"]}" '
            f'data-lab="lab-{r["id"]}"></div></div>')
    return "".join(o)


def paket_schalter():
    """Branchenpakete als Schalter — nur Pakete im Zustand 5. Heute gibt es keinen:
    dann steht an dieser Stelle der Hinweis „In Vorbereitung", kein Schalter, kein Preis.
    Das Ankreuzfeld bleibt darunter liegen — sichtbar ist der Schalter, bedienbar
    bleibt das Formularelement."""
    o = []
    for p in PAKETE:
        if not paket_buchbar(p):
            continue
        o.append(
            f'<label class="check"><input type="checkbox" name="paket" '
            f'value="{p["id"]}" data-preis="{paket_preis(p)}">'
            f'<span class="check-feld"><b>{p["name"]}</b>'
            f'<em>+{paket_preis(p)} \u20ac</em></span></label>')
    if not o:
        return (f'<p class="klein">Branchenpakete: {PAKET_VORB}. '
                'Sie sind im Preisrechner nicht w\u00e4hlbar und nicht Teil der Rechnung.</p>')
    return f'<div class="checks">{"".join(o)}</div>'


seiten = {}

# ── Startseite ──────────────────────────────────────────────────────────────
seiten["index.html"] = dict(
    title="CENTRIC — Dienstplanung für rotierende Schichtbetriebe",
    desc="CENTRIC speichert nicht den Plan, sondern die Regel: Zyklus und Startpunkt "
         "jeder Gruppe. Jeder Tag wird gerechnet — vorwärts wie rückwärts, ohne Jahresgrenze. "
         "Für Sicherheitsdienste, Pflege, Klinik und Industrie.",
    body=f"""
<section class="halle dunkel" id="halle">
  <canvas id="halle-c" aria-label="Trommel mit den acht Bereichen der Anwendung über stillem Wasser — ziehen dreht sie"></canvas>
  <div class="hud">
    <div class="vignette"></div>
    <div class="rahmen"></div>
    <header class="mast">
      <p class="kicker">CENTRIC · <b>Dienstplanung</b></p>
      <h1>Ihr Dienstplan endet nicht im Dezember.</h1>
    </header>
    <div class="fokus">
      <div class="zaehler"><span class="num" id="fokus-num">01</span><i>/</i><span id="fokus-total">08</span></div>
      <div class="name" id="fokus-name">Funktionen</div>
      <div class="punkte" id="fokus-punkte"></div>
      <a class="fokus-link" id="fokus-link" href="funktionen.html">Bereich öffnen</a>
    </div>
    <p class="wink">Ziehen zum Erkunden</p>
  </div>
</section>

<section class="sect">
  <div class="wrap">
    <p class="rail-lab">Das Prinzip</p>
    <div>
      <p class="lead">Andere Systeme rollen Dienstpläne aus und stoßen am Jahresende an
        eine Grenze. CENTRIC speichert den Zyklus und den Startpunkt jeder Gruppe — und
        rechnet daraus jeden Tag, vorwärts wie rückwärts, ohne Ende.</p>
      <div class="hero-akt">
        <a class="btn btn-voll-akzent btn-gross" href="kontakt.html#demo">30 Tage testen</a>
        <a class="btn btn-gross" href="funktionen.html">Funktionen ansehen</a>
      </div>
    </div>
  </div>
</section>

<div class="instrument-w">
  <div class="instrument">
    <div class="wrap instrument-leiste">
      <div class="i-stand">
        <span class="rail-lab">Gerechnet für</span>
        <p class="i-datum" id="p-datum" aria-live="polite">August 2026</p>
      </div>
      <div class="i-steuer" role="group" aria-label="Zeitraum wählen">
        <button type="button" data-spring="-3650">−10 J</button>
        <button type="button" data-spring="-28">−28 T</button>
        <button type="button" data-spring="heute">Heute</button>
        <button type="button" data-spring="28">+28 T</button>
        <button type="button" data-spring="3650">+10 J</button>
      </div>
      <p class="i-notiz">Kein Rollout, kein Horizont —<br>jedes Datum wird gerechnet.</p>
    </div>
    {hero_plan()}
    <div class="wrap i-legende">
      <span><i class="m f"></i> Früh</span><span><i class="m s"></i> Spät</span>
      <span><i class="m n"></i> Nacht</span><span><i class="m o"></i> frei</span>
      <span class="i-regel">Zyklus 24 Tage · sechs Gruppen · Versatz +4</span>
    </div>
  </div>
</div>

{sect('<p class="rail-lab">Fachwelten \u00b7 in Vorbereitung</p><ul class="branchen-band">' + "".join(
      f'<li><b>{p["name"].split(" und ")[0]}</b><span>{p["band"]}</span>'
      f'<em>{f"+{paket_preis(p)} €" if paket_buchbar(p) else "In Vorbereitung"}</em></li>'
      for p in PAKETE) + '</ul>', "sect-band")}

{sect(kopfzeile("Das Problem", "Schichtplanung scheitert selten am Planen",
                "Sie scheitert an dem, was danach kommt: an der Krankmeldung um sechs Uhr "
                "morgens, am abgelaufenen Nachweis, an der Ruhezeit, die niemand nachgerechnet "
                "hat, und an der Frage, wer im März nächsten Jahres eigentlich Nachtdienst hat.") +
      karten([
          dict(icon="warn", h="Der Plan endet im Dezember",
               t="Ausgerollte Pläne haben eine Jahresgrenze. Wer über sie hinaus plant, "
                 "pflegt zwei Wahrheiten — die im System und die an der Wand."),
          dict(icon="uhr", h="Die Prüfung kommt zu spät",
               t="Ruhezeit, Höchstarbeitszeit, Nachtdienstfolgen: Fällt das erst in der "
                 "Lohnabrechnung auf, ist der Monat gelaufen und der Verstoß dokumentiert."),
          dict(icon="personen", h="Der Ersatz wird gesucht, nicht gefunden",
               t="Wer darf diese Schicht überhaupt übernehmen? Wer hat den Nachweis, wer "
                 "die Ruhezeit, wer ist nicht ohnehin im Urlaub? Diese Frage kostet Stunden."),
      ]), "sect-hell")}

{sect(f'''<div class="split">
  <div>
    <p class="eyebrow tint">Die Rechnung dahinter</p>
    <h2>Ein Zyklus, sechs Gruppen, ein Versatz</h2>
    <p class="lead">CENTRIC speichert je Gruppe genau zwei Dinge: den Zyklus und den Tag,
      an dem sie ihn begonnen hat. Alles andere ist Arithmetik. Deshalb gibt es keinen
      Rollout, keine Jahresgrenze und keinen Zustand, der nachgepflegt werden muss.</p>
    <ul class="tick gross">
      <li>Jeder Tag der Vergangenheit und der Zukunft ist sofort berechenbar</li>
      <li>Eine Änderung am Modell wirkt rückwirkend und vorausschauend zugleich</li>
      <li>Abweichungen werden einzeln gespeichert — der Plan bleibt die Regel</li>
      <li>Der gerechnete Plan wird trotzdem ausgeschrieben, wo andere Systeme ihn brauchen</li>
    </ul>
    <a class="btn btn-ghost" href="wissen-rotation.html">Wie das genau funktioniert</a>
  </div>
  <div class="ring">{rotation_ring(420)}
    <p class="bild-lab">Sechs Gruppen, ein Zyklus von 24 Tagen —
       jede Gruppe an ihrem eigenen Punkt darin.</p>
  </div>
</div>''', "sect-dunkel")}

{sect(kopfzeile("Funktionen", "Alles, was ein Schichtbetrieb täglich braucht") +
      karten([
          dict(icon="rotation", h="Rotationsmodelle",
               t="Vier-, Fünf- und Sechsgruppenmodelle als Vorlage — oder ein "
                 "eigener Zyklus über beliebig viele Wochen."),
          dict(icon="schild", h="Arbeitszeitprüfung",
               t="Ruhezeit, Höchstarbeitszeit, Dienste und Nachtdienste in Folge werden beim "
                 "Eintragen geprüft, nicht am Monatsende."),
          dict(icon="haken", h="Qualifikationen mit Ablauf",
               t="Nachweise laufen ab. CENTRIC warnt vorher. Eine harte Sperre nach Ablauf "
                 "gehört zu den Branchenpaketen (in Vorbereitung, noch nicht buchbar)."),
          dict(icon="tausch", h="Anträge und Tauschbörse",
               t="Urlaub, Freiwünsche und Tausch laufen über einen Weg. Vor der Entscheidung "
                 "zeigt CENTRIC, welche Lücke entsteht."),
          dict(icon="konto", h="Stundenkonten und Zuschläge",
               t="Zeiten werden erfasst, bestätigt und fortgeschrieben. Zuschläge rechnet "
                 "CENTRIC in Stunden — Beträge bleiben in der Lohnbuchhaltung."),
          dict(icon="diagramm", h="Belastbarkeitsanalyse",
               t="Wer trägt wie viele Nächte, wie viele Wochenenden, wie viele Einsprünge? "
                 "Sichtbar, bevor jemand ausfällt."),
          dict(icon="handy", h="Mobil ohne App-Zwang",
               t="Der eigene Plan, Kalender-Feed, Weckzeiten und Stempeln im Browser — "
                 "auf jedem Gerät, ohne Installationszwang."),
          dict(icon="export", h="Datenmitnahme jederzeit",
               t="Vollständiger Export in offenen Formaten. Ihre Daten gehören Ihnen, auch "
                 "wenn Sie gehen."),
          dict(icon="auge", h="Gestaffelte Zugriffstiefe",
               t="Sechs Rollen vom Betreiber bis zum Betriebsrat. Jeder sieht genau so viel, "
                 "wie er zu verantworten hat."),
      ]) +
      '<p class="mehr"><a class="btn btn-ghost" href="funktionen.html">'
      'Alle Funktionen im Detail</a></p>')}

{sect(kopfzeile("So kommen Sie hinein", "Vier Schritte bis zum ersten freigegebenen Plan") +
      '''<ol class="schritte">
  <li><span class="nr">01</span><h3>Standorte und Regeln</h3>
      <p>Betrieb, Standorte und Einheiten anlegen. Das Bundesland entscheidet über die
         Feiertage — deshalb wird jeder Standort einzeln geführt.</p></li>
  <li><span class="nr">02</span><h3>Personal einlesen</h3>
      <p>Bestehende Liste importieren oder einzeln anlegen. Wochenstunden, Teilzeit,
         Qualifikationen und Zugangsart in einem Durchgang.</p></li>
  <li><span class="nr">03</span><h3>Modell und Startpunkt</h3>
      <p>Ein Rotationsmodell wählen, den Gruppen ihren Startpunkt geben — ab hier steht
         der Plan für jeden Tag, rückwärts wie vorwärts.</p></li>
  <li><span class="nr">04</span><h3>Prüfen und freigeben</h3>
      <p>Die Prüfung lesen, Lücken schließen, freigeben. Ab der Freigabe hält CENTRIC den
         damaligen Stand fest — jede spätere Änderung bleibt nachvollziehbar.</p></li>
</ol>''', "sect-hell")}

{sect(kopfzeile("Branchen", "Ein Rechenkern, mehrere Fachwelten",
                "Was eine Branche zusätzlich braucht, soll als Paket kommen. Die Branchenpakete "
                "sind in Vorbereitung und noch nicht buchbar. Bewusst grob geschnitten: "
                f"{len(PAKETE)} Pakete statt fünfzig einzelner Schalter.") +
      '<div class="grid-4">' + "".join(
          f'<article class="karte karte-link"><h3>{p["name"]}</h3><p>{p["kurz"]}</p>'
          f'<p class="preis-mini">{paket_status(p)}</p>'
          f'<a href="branchen.html#{p["id"]}">Ansehen</a></article>'
          for p in PAKETE) + "</div>")}

{sect('''<p class="rail-lab">Aus dem Betrieb</p>
<div class="stimmen">
  <figure><blockquote>Wir haben acht Objekte und vorher acht Excel-Dateien gehabt. Der
    Unterschied ist nicht die Zeitersparnis — es ist, dass der Sachkundenachweis jetzt
    sperrt, statt dass ihn jemand übersieht.</blockquote>
    <figcaption><b>Leitung Einsatzplanung</b><span>Sicherheitsdienst · 74 Kräfte ·
    8 Objekte</span></figcaption></figure>
  <figure><blockquote>Die Fachkraftquote wird je Dienst geprüft, nicht je Schicht. Das
    klingt nach einer Kleinigkeit und ist der ganze Unterschied zur Prüfung durch die
    Heimaufsicht.</blockquote>
    <figcaption><b>Pflegedienstleitung</b><span>Vollstationäre Pflege ·
    3 Wohnbereiche</span></figcaption></figure>
  <figure><blockquote>Der Betriebsrat hat einen eigenen, lesenden Zugang und das Protokoll.
    Seitdem diskutieren wir über Modelle statt über Zahlen.</blockquote>
    <figcaption><b>Werkleitung</b><span>Konti-Betrieb · 5 Gruppen ·
    212 Beschäftigte</span></figcaption></figure>
</div>''', "sect-nacht")}

{sect(f'''<div class="split split-eng">
  <div>
    <p class="eyebrow tint">Preise</p>
    <h2>Bezahlt wird, wer plant.</h2>
    <p class="lead">Wer geplant wird, kostet nichts. Beschäftigte, Sub-Planer und
      Betriebsrat sind unbegrenzt und kostenfrei — ob fünf oder fünfhundert ändert am
      Preis nichts. Den bestimmen zwei Entscheidungen: wie viele Personen zentral
      mitplanen, und wie viele eigenständige Standorte Sie führen.</p>
    <ul class="tick gross">
      <li>Basis 89 € · Business 159 € · Enterprise 279 € je Monat für den Betrieb</li>
      <li>Standorte im Kontingent sind kostenfrei, unabhängig von ihrer Größe</li>
      <li>Zugänge für den Betriebsrat sind kostenfrei</li>
      <li>30 Tage testen, monatlich kündbar, Datenmitnahme jederzeit</li>
    </ul>
    <a class="btn btn-primary" href="preise.html">Preise und Rechner</a>
  </div>
  <div class="preis-teaser">
    {"".join(f'<div class="pt-zeile"><span>{s["name"]}</span><span class="pt-preis">'
             f'{s["grund"]} €</span><span class="pt-bis">'
             f'{mehrzahl(s["planer_inkl"], "Planer", "Planer")} · '
             f'{mehrzahl(s["standorte_inkl"], "Standort", "Standorte")}'
             f'</span></div>' for s in STUFEN)}
    <p class="klein">Alle Preise je Monat und Betrieb, zuzüglich Umsatzsteuer.</p>
  </div>
</div>''')}

{sect(kopfzeile("Häufige Fragen", "Was Betriebe vor der Einführung fragen") +
      faq_liste([
          ("Müssen wir unseren bestehenden Plan neu aufbauen?",
           "Nein. Sie tragen das Modell ein, das Sie ohnehin fahren — Zyklus und Startpunkt "
           "je Gruppe. Bestehende Abweichungen und Abwesenheiten lesen wir als Liste ein."),
          ("Was passiert am Jahresende?",
           "Nichts. Es gibt keine Jahresgrenze, weil nichts ausgerollt wird. Der 14. März "
           "in vier Jahren wird genauso gerechnet wie der morgige Tag."),
          ("Sehen wir Verstöße vor oder nach der Planung?",
           "Vorher. Vor dem Eintragen zeigt CENTRIC die Folgen: Ruhezeit, Wochenstunden, "
           "nächste Dienste. Wer nicht darf, steht mit Begründung unten in der Liste."),
          ("Kommen wir wieder heraus?",
           "Jederzeit. Der vollständige Export in offenen Formaten gehört zum Funktionsumfang "
           "aller Tarife, nicht zu einem Zusatzpaket."),
      ]) +
      '<p class="mehr"><a class="btn btn-ghost" href="faq.html">Alle Fragen</a></p>')}

{cta()}
""")

# ── Funktionen ──────────────────────────────────────────────────────────────
seiten["funktionen.html"] = dict(
    title="Funktionen — CENTRIC",
    desc="Rotationsmodelle, Arbeitszeitprüfung, Qualifikationen mit Ablauf, Anträge, "
         "Stundenkonten, Auswertungen und Rollen — alle Funktionen von CENTRIC im Detail.",
    body=f"""
{sect(kopfzeile("Funktionen", "Was CENTRIC kann — und warum es so gebaut ist",
                "Ein Kern für alle Betriebe; Branchenpakete darüber sind in Vorbereitung. Diese Seite geht "
                "die Bereiche der Anwendung der Reihe nach durch.", tag="h1"), "sect-titel")}

{sect(kopfzeile("Planung", "Der Plan wird gerechnet") +
      karten([
          dict(icon="rotation", h="Zyklus und Versatz",
               t="Das Herzstück. Je Gruppe werden Zyklus und Startpunkt gespeichert.",
               punkte=["Zyklen über beliebig viele Wochen", "Vorlagen für 3-, 4-, 5- und "
                       "6-Gruppenmodelle", "Rückwärts wie vorwärts ohne Grenze",
                       "Modelländerung wirkt in beide Richtungen"]),
          dict(icon="kalender", h="Dienstarten",
               t="Früh, Spät, Nacht, Zwischendienste, Bereitschaft, Posten.",
               punkte=["Ende vor Start bedeutet Folgetag", "Pausen, Faktor und Anrechnung",
                       "Ruhezeitneutrale Dienste", "Mindestbesetzung je Wochentag"]),
          dict(icon="personen", h="Abweichungen",
               t="Einzelne Änderungen überschreiben die Regel — und nur diese.",
               punkte=["Tagesgenau je Person", "Der Zyklus bleibt unangetastet",
                       "Jede Abweichung im Protokoll", "Rücknahme ohne Nebenwirkung"]),
      ]))}

{sect(kopfzeile("Prüfung", "Bevor etwas geschieht, nicht danach",
                "CENTRIC prüft laufend gegen Arbeitszeitgesetz, Mindestbesetzung und "
                "Qualifikationen. Die Befunde stehen im Plan, nicht in einem Bericht.") +
      '''<div class="pruef">
  <div class="pruef-liste">
    <div><strong>Ruhezeit unterschritten</strong><span>Elf Stunden zwischen zwei Diensten,
      mit den Ausnahmen der Branche</span></div>
    <div><strong>Dienste in Folge</strong><span>Serie und Grenzwert je Betrieb einstellbar</span></div>
    <div><strong>Nachtdienste in Folge</strong><span>Eigener Grenzwert, eigene Warnung</span></div>
    <div><strong>Höchstarbeitszeit</strong><span>Zwölfstündige Dienste nur unter den
      Bedingungen des Arbeitszeitgesetzes</span></div>
    <div><strong>Unterbesetzung</strong><span>Je Dienstart und Wochentag, mit Dokumentation
      der bewussten Ausnahme</span></div>
    <div><strong>Fehlende Qualifikation</strong><span>Zahl der erforderlichen Nachweise je
      Dienst, nicht je Schicht</span></div>
    <div><strong>Abgelaufener Nachweis</strong><span>Warnung vorher; eine Sperre danach
      gehört zu den Branchenpaketen (in Vorbereitung)</span></div>
    <div><strong>Dienst trotz Abwesenheit</strong><span>Wird abgelehnt statt stillschweigend
      angenommen</span></div>
  </div>
</div>''', "sect-hell")}

{sect(kopfzeile("Alltag", "Was jeden Tag passiert") +
      karten([
          dict(icon="warn", h="Krankmeldung und Ersatz",
               t="Person und Zeitraum wählen — CENTRIC zeigt sofort alle entstehenden Lücken "
                 "und schlägt Ersatz vor, geordnet nach Eignung. Wer nicht kann, steht unten "
                 "mit Begründung."),
          dict(icon="tausch", h="Offene Schichten ausschreiben",
               t="Vor dem Ausschreiben zeigt CENTRIC, wie viele Personen die Schicht "
                 "überhaupt übernehmen dürfen. Steht dort null, hilft nur die gezielte Suche."),
          dict(icon="brief", h="Anträge entscheiden",
               t="Urlaub, Freiwunsch, Tausch. Vor der Entscheidung sind die Folgen sichtbar: "
                 "Lücken, Ruhezeit, Wochenstunden, Resturlaub."),
          dict(icon="haken", h="Checklisten an Schichten",
               t="Was zu Beginn und zum Ende einer Schicht zu tun ist, hängt an der "
                 "Dienstart — nicht an einem Zettel im Wachraum."),
          dict(icon="uhr", h="Zeiten und Zuschläge",
               t="Stempeln, bestätigen, fortschreiben. CENTRIC rechnet Stunden, keine Beträge — "
                 "Stundensätze gehören in die Lohnabrechnung."),
          dict(icon="handy", h="Schneller tippen als klicken",
               t="Die tägliche Arbeit läuft über Tastatur und Kürzel. Für Planer, die den "
                 "Plan im Kopf haben und ihn nur eintragen wollen."),
      ]))}

{sect(kopfzeile("Auswertung", "Zahlen, die eine Entscheidung tragen") +
      karten([
          dict(icon="diagramm", h="Belastbarkeit",
               t="Nächte, Wochenenden, Einsprünge und Serien je Person über die Zeit. "
                 "Sichtbar, solange man noch gegensteuern kann."),
          dict(icon="konto", h="Stundenkonten",
               t="Soll und Ist je Person, mit Ausgleichsgrenze und Ausgleichsfrist. Offene "
                 "Zeiten bleiben als Hochrechnung erkennbar."),
          dict(icon="export", h="Lohnausgabe",
               t="Ein Klick zur Lohnbuchhaltung. Stunden, Zuschlagsarten und Abwesenheiten "
                 "in der Struktur, die das Lohnprogramm erwartet."),
          dict(icon="schild", h="Leistungsnachweis",
               t="Für Auftraggeber im Objektgeschäft: geleistete Posten je Objekt und "
                 "Zeitraum, aus denselben Daten wie der Plan."),
      ], "grid-4"), "sect-hell")}

{sect(f'''{kopfzeile("Zugriff", "Sechs Rollen, gestaffelte Tiefe",
      "Jeder sieht genau so viel, wie er zu verantworten hat. Der Betreiber der Software "
      "sieht ausschließlich Zahlen — niemals Namen, niemals Dienstpläne.")}
<div class="tabelle-w"><table class="tab">
<thead><tr><th>Rolle</th><th>Kürzel</th><th>Was diese Rolle darf</th></tr></thead>
<tbody>{"".join(f"<tr><td><strong>{n}</strong></td><td><span class='kurz'>{k}</span></td>"
                f"<td>{t}</td></tr>" for n, k, t in ROLLEN)}</tbody>
</table></div>
<p class="klein">Der Zugang für den Betriebsrat ist in allen Tarifen kostenfrei und rein
lesend — Pläne und Protokoll, keine Bearbeitung.</p>''', "", "rollen")}

{sect(kopfzeile("Einrichtung", "Was Sie brauchen, bevor es losgeht") +
      '''<div class="grid-2">
      <div class="karte"><h3>Vor dem ersten Termin</h3><ul class="tick">
        <li>Standorte mit Bundesland — die Feiertage hängen daran</li>
        <li>Einheiten oder Wohnbereiche, wie Sie sie tatsächlich führen</li>
        <li>Personalliste mit Wochenstunden und Eintrittsdatum</li>
        <li>Ihre Dienstarten mit Start, Ende und Pause</li>
        <li>Das Rotationsmodell, das Sie heute fahren</li></ul></div>
      <div class="karte"><h3>Was wir übernehmen</h3><ul class="tick">
        <li>Einlesen der Personalliste aus Tabelle oder Vorsystem</li>
        <li>Aufsetzen des Rotationsmodells samt Startpunkten</li>
        <li>Ersteinstellung der Arbeitszeitregeln für Ihre Branche</li>
        <li>Schulung für Planer, ein Termin, meist 90 Minuten</li>
        <li>Begleitung durch den ersten freigegebenen Monat</li></ul></div>
      </div>''', "sect-hell", "einrichtung")}

{cta("Am schnellsten sehen Sie es an Ihrem eigenen Modell",
     "Nennen Sie uns Ihren Zyklus und die Zahl der Gruppen — in der Vorführung "
     "rechnen wir Ihren Plan, nicht unseren.")}
""")

# ── Branchen ────────────────────────────────────────────────────────────────
branchen_body = [sect(kopfzeile(
    "Branchen", "Ein Rechenkern, mehrere Fachwelten",
    "Der Kern ist für alle Betriebe derselbe: Schichtplanung, Anträge, Zeiten, "
    "Stundenkonten, Qualifikationen, Auswertungen. Was darüber hinaus fachlich nötig ist, "
    "soll als Paket kommen. Die Branchenpakete sind in Vorbereitung und noch nicht buchbar: "
    "Preis und Buchung gibt es erst, wenn ein Paket freigegeben ist.", tag="h1"), "sect-titel")]
for i, p in enumerate(PAKETE):
    bild = plan_strip(24, 480, dark=False)
    branchen_body.append(sect(f'''<div class="split split-eng{" umgekehrt" if i % 2 else ""}">
  <div>
    <p class="eyebrow tint">Branchenpaket · {paket_status(p)}</p>
    <h2>{p["name"]}</h2>
    <p class="lead">{p["kurz"]}</p>
    {"" if paket_buchbar(p) else '<p class="klein">Geplanter Umfang. Noch nicht verfügbar, noch nicht buchbar.</p>'}
    <ul class="tick gross">{"".join(f"<li>{x}</li>" for x in p["punkte"])}</ul>
  </div>
  <div class="karte karte-bild">
    <div class="plan-kopf"><span>{p["name"]}</span><span class="lab">Auszug · 24 Tage</span></div>
    {bild}
    <div class="plan-fuss"><span><i class="pt f"></i> Früh</span>
      <span><i class="pt s"></i> Spät</span><span><i class="pt n"></i> Nacht</span>
      <span><i class="pt o"></i> frei</span></div>
  </div>
</div>''', "sect-hell" if i % 2 else "", p["id"]))
branchen_body.append(sect(kopfzeile(
    "Kernplattform", "In jedem Tarif enthalten",
    "Schichtplanung, Anträge, Zeiten, Stundenkonten, Qualifikationen und Export. Die "
    "Branchenpakete (in Vorbereitung) sollen darauf aufsetzen — sie ersetzen nichts.") +
    '<div class="band band-mitte"><span>Plan</span><span>Anträge</span><span>Zeiten</span>'
    '<span>Konten</span><span>Qualifikationen</span><span>Export</span></div>'))
branchen_body.append(cta("Nicht sicher, was Ihr Betrieb braucht?",
                         "Beschreiben Sie uns Ihren Betrieb in drei Sätzen. Wenn der Kern "
                         "reicht, sagen wir das. Branchenpakete sind in Vorbereitung und "
                         "noch nicht buchbar."))
seiten["branchen.html"] = dict(
    title="Branchen — CENTRIC",
    desc="Branchenpakete für Sicherheitsdienst, Pflege, Klinik sowie Industrie und Anlagen "
         "sind in Vorbereitung und noch nicht buchbar. Ein Rechenkern, fachliche Erweiterungen darüber.",
    body="\n".join(branchen_body))

# ── Preise ──────────────────────────────────────────────────────────────────
# Die Preisliste ist eine Liste — also wird sie als Tafel gesetzt, Spalte je
# Stufe, Haarlinien dazwischen, Ziffern in der Festbreitenschrift.
def tarif_tafel():
    sp = "".join(
        f'<div class="tf-sp{" tf-sp-mitte" if s["id"] == "pro" else ""}">'
        f'<h2 class="tf-name">{s["name"]}</h2>'
        f'<p class="tf-preis"><b>{s["grund"]}</b><span>€ je Monat<br>für den Betrieb</span></p>'
        f'<p class="tf-claim">{s["claim"]}</p>'
        f'<p class="tf-grenze">{mehrzahl(s["planer_inkl"], "Planer-Zugang", "Planer-Zugänge")}'
        f' · {mehrzahl(s["standorte_inkl"], "Standort", "Standorte")} beliebiger Größe</p>'
        f'<ul class="tick">{"".join(f"<li>{x}</li>" for x in s["leistungen"])}</ul>'
        f'<a class="btn {"btn-voll-akzent" if s["id"] == "pro" else ""} btn-voll" '
        f'href="kontakt.html#demo">30 Tage testen</a></div>'
        for s in STUFEN)
    return f'<div class="tarif-tafel">{sp}</div>'

seiten["preise.html"] = dict(
    title="Preise — CENTRIC",
    desc="Bezahlt wird, wer plant: Basis 89 €, Business 159 €, Enterprise 279 € je Monat "
         "für den Betrieb. Beschäftigte, Sub-Planer und Betriebsrat kosten nichts. "
         "Branchenpakete sind in Vorbereitung und noch nicht buchbar.",
    body=f"""
{sect(kopfzeile("Preise", "Bezahlt wird, wer plant.",
                "Wer geplant wird, kostet nichts — Beschäftigte, Sub-Planer und Betriebsrat "
                "sind in jeder Stufe unbegrenzt und kostenfrei. Den Preis bestimmen zwei "
                "Organisationsentscheidungen: wie viele Personen zentral mitplanen, und wie "
                "viele eigenständige Standorte der Betrieb führt. Alle Preise zuzüglich "
                "Umsatzsteuer.", tag="h1"), "sect-titel")}

{sect(tarif_tafel() +
      '<p class="klein mitte">Innerhalb des Kontingents kostet ein Standort nichts, '
      'unabhängig von seiner Größe. Wer an einem Ort wächst, zahlt dafür nie mehr — '
      'erst ein <em>weiterer</em>, eigenständiger Standort macht einen Unterschied.</p>')}

{sect(f'''{kopfzeile("Rechner", "Was kostet CENTRIC für Ihren Betrieb?",
      "Dieselbe Rechnung wie in der Anwendung: Grundgebühr der Stufe, Pauschale je "
      "Planer-Zugang über dem Kontingent, Zuschlag je Standort über dem Kontingent, "
      "Branchenpakete sind in Vorbereitung und noch nicht Teil der Rechnung.")}
<div class="rechner">
  <form class="rechner-ein" id="preisrechner">
    {ring_felder()}
    <fieldset class="feld feld-voll">
      <legend>Branchenpakete</legend>
      {paket_schalter()}
    </fieldset>
  </form>
  <aside class="rechner-aus dunkel" aria-live="polite">
    <p class="ra-lab">Stufe <span id="stufe">Basis</span> · monatlich, zuzüglich Umsatzsteuer</p>
    <p class="ra-summe"><span id="summe">—</span> <em>€</em></p>
    <dl class="ra-zeilen" id="zeilen"></dl>
    <p class="ra-kopf" id="jekopf"></p>
    <a class="btn btn-primary btn-voll" href="kontakt.html#demo">Unverbindlich testen</a>
  </aside>
</div>
<p class="klein">Vorgeschlagen wird die kleinste Stufe, die Ihre Planer-Zugänge ohne
Aufpreis trägt — die Stufen unterscheiden sich aber auch im Funktionsumfang, nicht nur
im Kontingent. Der Rechner nimmt alle Standorte gleich groß an; in der Anwendung wird
jeder einzeln erfasst und zuschlagspflichtige Standorte werden nach ihrer eigenen Größe
eingestuft. Wenn für Ihren Betrieb eine andere Stufe günstiger ist, sagen wir Ihnen
das — auch wenn es die kleinere ist.</p>''', "sect-hell", "rechner")}

{sect(f'''{kopfzeile("Standortzuschlag", "Nur was über dem Kontingent liegt — und nur nach eigener Größe",
      "Die größten Standorte zählen automatisch ins Kontingent; ausgewählt werden muss "
      "nichts. Was darüber hinausgeht, wird nach der Personenzahl dieses einen Standorts "
      "eingestuft, nicht nach der des ganzen Betriebs.")}
<div class="tabelle-w"><table class="tab">
<thead><tr><th>Größe des zusätzlichen Standorts</th><th>Zuschlag je Monat</th></tr></thead>
<tbody>{"".join(
    f"<tr><td>{lab}</td><td><strong>"
    + (f"+ {zu} €" if zu else "kostenlos") + "</strong></td></tr>"
    for _, zu, lab in STANDORT_BAENDER)}</tbody>
</table></div>
<p class="klein">Unter fünfzehn Personen ist ein Ort eine Postanschrift und keine
Einrichtung — eine Patientenadresse, eine kleine Außenstelle, ein Notfallquartier.
Solche Orte kosten nichts, auch außerhalb des Kontingents. Ein zusätzlicher
Planer-Zugang kostet {ZUSATZ_PLANER} € im Monat, unabhängig von der Betriebsgröße.</p>''')}

{sect(f'''{kopfzeile("Pakete", "Branchenpakete: in Vorbereitung")}
<div class="grid-4">{"".join(
    f'<article class="karte"><h3>{p["name"]}</h3>'
    + (f'<p class="tarif-preis klein-preis"><strong>+ {paket_preis(p)} €</strong>'
       f'<span>je Monat und Betrieb</span></p>' if paket_buchbar(p)
       else f'<p class="preis-mini">{PAKET_VORB}</p>')
    + f'<p>{p["kurz"]}</p>'
    f'<a href="branchen.html#{p["id"]}">Zum Paket</a></article>' for p in PAKETE)}</div>
<p class="klein">{PAKET_HINWEIS_ENTERPRISE}</p>''', "sect-hell")}

{sect(kopfzeile("Enthalten", "In jedem Tarif, ohne Aufpreis") +
      '''<div class="grid-3">
      <div class="karte"><h3>Zugänge für den Betriebsrat</h3><p>Rein lesender Prüfzugang auf
        Pläne und Protokoll. Kostenfrei, in jedem Tarif, ohne Begrenzung der Zahl.</p></div>
      <div class="karte"><h3>Datenmitnahme</h3><p>Vollständiger Export in offenen Formaten,
        jederzeit und ohne Zusatzkosten. Auch bei Kündigung.</p></div>
      <div class="karte"><h3>Einrichtung und Schulung</h3><p>Ersteinrichtung, Einlesen der
        Personalliste und eine Planerschulung sind Teil des Einstiegs.</p></div>
      </div>''')}

{sect(kopfzeile("Fragen", "Was Betriebe zum Preis fragen") +
      faq_liste([
          ("Warum zahlt nur, wer plant?",
           "Weil Kopfpauschalen genau die Betriebe bestrafen, die viele Menschen "
           "beschäftigen — und das sind in der Schichtarbeit alle. Ein Pflegedienst mit "
           "fünf Touren oder ein Wachdienst mit acht Objekten zahlt bei Kopfpreisen "
           "schnell das Drei- bis Vierfache. Bei uns kostet Einstellen nichts, und zwar "
           "gar nichts: Beschäftigte, Sub-Planer und Betriebsrat sind in jeder Stufe "
           "unbegrenzt."),
          ("Was passiert, wenn ein Standort wächst?",
           "Nichts. Ein Standort im Kontingent kostet nichts, unabhängig von seiner "
           "Größe — vier Personen wie vierhundert. Der Preis ändert sich erst, wenn ein "
           "weiterer, eigenständiger Standort dazukommt und das Kontingent der Stufe "
           "voll ist."),
          ("Was kostet ein zusätzlicher Standort?",
           "Das hängt an seiner eigenen Größe, nicht an der des Betriebs: bis vierzehn "
           "Personen nichts, darüber gestaffelt von 29 € bis 119 € im Monat. Die "
           "größten Standorte zählen dabei automatisch ins Kontingent — auswählen "
           "müssen Sie nichts."),
          ("Gibt es eine Mindestlaufzeit?",
           "Nein. CENTRIC ist monatlich kündbar. Die Testphase läuft 30 Tage und erfordert "
           "keine Zahlungsdaten."),
          ("Wie wird abgerechnet?",
           "Monatlich per Rechnung an den Betrieb, mit getrennt ausgewiesenen Posten für "
           "Grundgebühr, zusätzliche Planer-Zugänge, Standortzuschläge und Branchenpakete (noch nicht buchbar). "
           "Jahresrechnung ist möglich."),
          ("Zahlen wir für Zugänge des Betriebsrats?",
           "Nein. Der lesende Prüfzugang ist in allen Stufen kostenfrei und in der Zahl "
           "nicht begrenzt."),
          ("Was kostet die Einrichtung?",
           "Nichts. Ersteinrichtung, Datenübernahme und eine Planerschulung gehören zum "
           "Einstieg. Weitergehende Anpassungen stimmen wir vorher schriftlich ab."),
      ]), "sect-hell")}

{cta("Rechnen Sie mit Ihren eigenen Zahlen",
     "Nennen Sie uns Standorte, Personen und Branche — Sie bekommen ein verbindliches "
     "Angebot, meist am selben Tag.")}
""")

# ── Sicherheit ──────────────────────────────────────────────────────────────
seiten["sicherheit.html"] = dict(
    title="Sicherheit und Datenschutz — CENTRIC",
    desc="Server in der EU, gestaffelte Zugriffstiefe, Protokoll, Auskunft nach "
         "Artikel 15, Auftragsverarbeitung nach Artikel 28 und Datenmitnahme jederzeit.",
    body=f"""
{sect(kopfzeile("Sicherheit und Datenschutz",
                "Dienstpläne sind Personaldaten",
                "In einem Dienstplan steht, wer wann arbeitet, wer krank war und wer welche "
                "Qualifikation nicht mehr hat. Das ist kein Kalender — das ist der "
                "sensibelste Datenbestand vieler Betriebe.", tag="h1"), "sect-titel")}

{sect(karten([
    dict(icon="schloss", h="Server in der EU",
         t="Betrieb auf einem virtuellen Server der IONOS SE in Spanien (EU); Sicherungen "
           "liegen auf demselben Server. Übertragung ausschließlich über TLS."),
    dict(icon="auge", h="Gestaffelte Zugriffstiefe",
         t="Sechs Rollen mit getrennten Rechten. Ein Sub-Planer sieht die eigene Einheit, "
           "nicht den Betrieb. Rechte sind je Betrieb anpassbar."),
    dict(icon="haken", h="Der Betreiber sieht keine Namen",
         t="Die Betreibersicht enthält ausschließlich Kennzahlen — keine Namen, keine "
           "Dienstpläne, keine Personendaten. Das ist im Rechenkern verankert, nicht "
           "im Handbuch."),
    dict(icon="konto", h="Vollständiges Protokoll",
         t="Wer hat wann was geändert. Ab der Freigabe eines Monats hält CENTRIC den "
           "damaligen Stand fest — jede spätere Änderung bleibt sichtbar."),
    dict(icon="brief", h="Auskunft nach Artikel 15",
         t="Für eine einzelne Person auf Knopfdruck erzeugbar: alle zu ihr gespeicherten "
           "Daten in lesbarer Form."),
    dict(icon="export", h="Löschfristen automatisch",
         t="Die Aufbewahrungsfrist nach Austritt ist einstellbar, voreingestellt sind "
           "24 Monate. Nach Ablauf werden alte Daten anonymisiert."),
], tag="h2"))}

{sect(f'''<div class="split split-eng">
  <div>
    <p class="eyebrow tint">Auftragsverarbeitung</p>
    <h2>Artikel 28 — schriftlich, vor dem ersten Datensatz</h2>
    <p class="lead">CENTRIC verarbeitet Personaldaten in Ihrem Auftrag. Den Vertrag zur
      Auftragsverarbeitung samt technischen und organisatorischen Maßnahmen bekommen Sie
      vor der Einrichtung — nicht auf Nachfrage.</p>
    <ul class="tick gross">
      <li>AV-Vertrag nach Artikel 28 DSGVO, unterschriftsreif</li>
      <li>Verzeichnis der technischen und organisatorischen Maßnahmen</li>
      <li>Liste der Unterauftragsverarbeiter mit Sitz und Zweck</li>
      <li>Meldewege und Fristen bei Vorfällen</li>
      <li>Löschkonzept und Nachweis der Löschung</li>
    </ul>
    <a class="btn btn-primary" href="kontakt.html#av">AV-Unterlagen anfordern</a>
  </div>
  <div class="karte karte-still">
    <h3>Mitbestimmung</h3>
    <p>Die Einführung eines Dienstplansystems ist mitbestimmungspflichtig. Wir liefern
      dafür, was der Betriebsrat braucht:</p>
    <ul class="tick">
      <li>Kostenfreier, rein lesender Zugang für Betriebsratsmitglieder</li>
      <li>Einsicht in Pläne und das vollständige Protokoll</li>
      <li>Beschreibung aller ausgewerteten Kennzahlen</li>
      <li>Keine verdeckte Leistungs- oder Verhaltenskontrolle</li>
      <li>Muster für eine Betriebsvereinbarung auf Anfrage</li>
    </ul>
  </div>
</div>''', "sect-dunkel", "av")}

{sect(kopfzeile("Betrieb", "Verfügbarkeit und Sicherungen") +
      '''<div class="grid-3">
      <div class="karte"><h3>Sicherungen</h3><p>Sicherungen entstehen automatisch vor
        eingreifenden Vorgängen und lassen sich aus der Anwendung wiederherstellen. Eine
        Vollausgabe ermöglicht jederzeit eine eigene Sicherung außer Haus.</p></div>
      <div class="karte"><h3>Wartung</h3><p>Wartungsarbeiten werden so geplant, dass
        Beeinträchtigungen des laufenden Betriebs möglichst gering bleiben.</p></div>
      <div class="karte"><h3>Ausfall</h3><p>Der Plan bleibt lesbar: Kalender-Feed und
        exportierte Pläne funktionieren unabhängig von der Anwendung.</p></div>
      </div>''', "sect-hell")}

{sect(kopfzeile("Häufige Fragen", "Datenschutz in der Praxis") +
      faq_liste([
          ("Wo liegen unsere Daten?",
           "Auf einem virtuellen Server der IONOS SE in Spanien, einem Mitgliedstaat der EU. "
           "Ein Verzeichnis der eingesetzten Dienstleister mit Sitz und Zweck ist Teil der "
           "AV-Unterlagen."),
          ("Nutzen Sie Tracker oder Werbe-Cookies?",
           "Nein — weder auf dieser Website noch in der Anwendung. Auch die Anwendung setzt "
           "keine Cookies; die Anmeldung nutzt ein Sitzungsmerkmal, das der Browser nur auf "
           "Wunsch über das Schließen hinaus behält."),
          ("Kann der Betriebsrat mitlesen?",
           "Ja, das ist vorgesehen. Der Zugang ist kostenfrei, rein lesend und umfasst "
           "Pläne sowie das Protokoll."),
          ("Was passiert bei Kündigung mit unseren Daten?",
           "Sie exportieren vollständig in offenen Formaten. Danach werden die Daten nach "
           "vereinbarter Frist gelöscht; die Löschung wird bestätigt."),
          ("Werden Beschäftigte überwacht?",
           "Nein. CENTRIC wertet aus, was für die Planung nötig ist — Belastung, Stunden, "
           "Qualifikationen. Es gibt keine verdeckte Auswertung und keine Kennzahl, die "
           "dem Betriebsrat nicht offensteht."),
      ]))}

{cta("Prüfen Sie uns vor der Unterschrift",
     "Wir schicken AV-Vertrag, TOM-Verzeichnis und Unterauftragsverarbeiter vorab — "
     "damit Ihr Datenschutzbeauftragter entscheiden kann, bevor Sie testen.")}
""")

# ── Über uns ────────────────────────────────────────────────────────────────
seiten["ueber-uns.html"] = dict(
    title="Über uns — CENTRIC",
    desc="Wer hinter CENTRIC steht: eine Software für Betriebe im durchgehenden "
         "Schichtbetrieb, gebaut aus der Planungspraxis heraus.",
    body=f"""
{sect(kopfzeile("Über uns", "Wir bauen für die Schicht, nicht für das Büro",
                "CENTRIC ist aus der Beobachtung entstanden, dass Dienstplanung in "
                "durchgehenden Betrieben etwas anderes ist als Terminplanung — und dass "
                "fast jede Software so tut, als wäre sie dasselbe.", tag="h1"), "sect-titel")}

{sect(f'''<div class="split">
  <div>
    <h2>Die eine Entscheidung, aus der alles folgt</h2>
    <p>Am Anfang stand die Frage, was ein Dienstplan eigentlich ist. Die übliche Antwort
      lautet: eine Liste von Tagen. Aus dieser Antwort folgen Rollouts, Jahresgrenzen und
      Systeme, die im November hektisch werden.</p>
    <p>Unsere Antwort lautet: ein Zyklus und ein Startpunkt. Aus dieser Antwort folgt alles
      andere — dass jeder Tag der Vergangenheit und Zukunft berechenbar ist, dass eine
      Modelländerung in beide Richtungen wirkt, dass es keinen Zustand gibt, den jemand
      nachpflegen muss.</p>
    <p>Diese Entscheidung ist unbequem, weil sie mehr Arithmetik verlangt. Sie ist der
      Grund, warum CENTRIC an der Stelle einfach ist, an der es darauf ankommt.</p>
  </div>
  <div class="ring">{rotation_ring(380)}</div>
</div>''', "sect-dunkel")}

{sect(kopfzeile("Haltung", "Woran wir uns halten") +
      karten([
          dict(h="Prüfen statt melden",
               t="Ein Verstoß, der erst in der Abrechnung auffällt, ist kein Hinweis mehr, "
                 "sondern ein Vorgang. CENTRIC prüft, bevor etwas geschieht."),
          dict(h="Keine stillschweigende Annahme",
               t="Wer abwesend ist, kann nicht eingeteilt werden — CENTRIC lehnt das ab, "
                 "statt es kommentarlos zu übernehmen. Nichts wird überschrieben, ohne "
                 "es zu zeigen."),
          dict(h="Ihre Daten gehören Ihnen",
               t="Der vollständige Export ist Teil jedes Tarifs. Wir binden niemanden "
                 "über die Schwierigkeit, wieder herauszukommen."),
          dict(h="Preis ohne Strafe fürs Wachsen",
               t="Bezahlt wird, wer plant — wer geplant wird, kostet nichts. "
                 "Kopfpauschalen bestrafen genau die Betriebe, die viele Menschen "
                 "beschäftigen."),
          dict(h="Der Betreiber sieht keine Namen",
               t="Wir verkaufen Software, wir führen Ihren Betrieb nicht. Die Betreibersicht "
                 "enthält Kennzahlen — sonst nichts."),
          dict(h="Barrierefrei, weil Schicht keine Ausnahme kennt",
               t="Kontraste, Tastaturbedienung und Vorlesbarkeit sind Anforderungen, "
                 "keine späteren Verbesserungen."),
      ]), "sect-hell")}

{sect(f'''{kopfzeile("Zahlen", "CENTRIC in Zahlen")}
<div class="zahlen">
  <div><strong>24</strong><span>Tage im Beispielzyklus — beliebig viele sind möglich</span></div>
  <div><strong>6</strong><span>Rollen vom Betreiber bis zum Betriebsrat</span></div>
  <div><strong>{len(PAKETE)}</strong><span>Branchenpakete in Vorbereitung auf einem gemeinsamen Rechenkern</span></div>
  <div><strong>261</strong><span>Selbsttests, nachgezählt aus dem Prüflauf</span></div>
</div>''')}

{sect(kopfzeile("Arbeiten bei CENTRIC", "Kleines Team, lange Entscheidungen",
                "Wir stellen selten ein und dann für lange. Wenn Sie Planungspraxis aus "
                "einem Schichtbetrieb mitbringen — aus der Pflege, dem Objektschutz, der "
                "Anlagenfahrweise — interessiert uns das mehr als ein Lebenslauf.") +
      '''<div class="grid-2">
      <div class="karte"><h3>Was wir suchen</h3><ul class="tick">
        <li>Menschen, die selbst Dienstpläne verantwortet haben</li>
        <li>Entwicklung mit Sinn für Korrektheit vor Geschwindigkeit</li>
        <li>Kundenbetreuung, die den Betrieb versteht, nicht nur die Software</li></ul></div>
      <div class="karte"><h3>Wie Sie sich melden</h3>
        <p>Keine Formulare, keine Fristen. Schreiben Sie uns, woran Sie in Ihrem letzten
           Dienstplan gescheitert sind und wie Sie es gelöst hätten.</p>
        <p><a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></p>
      </div></div>''', "sect-hell", "arbeiten")}

{cta()}
""")

# ── Wissen (Übersicht) ──────────────────────────────────────────────────────
ARTIKEL = [
    ("wissen-rotation.html", "Grundlagen",
     "Warum ein Dienstplan keine Liste sein sollte",
     "Rollouts erzeugen Jahresgrenzen, doppelte Wahrheiten und Nachpflege. Was sich ändert, "
     "wenn man statt der Tage die Regel speichert — und was das für die Praxis bedeutet.",
     "9 Minuten"),
    ("faq.html", "Arbeitsrecht",
     "Ruhezeit, Höchstarbeitszeit, Nachtdienstfolgen",
     "Was das Arbeitszeitgesetz für rotierende Betriebe tatsächlich verlangt, wo die "
     "Ausnahmen liegen und warum die Prüfung vor der Eintragung gehört.", "7 Minuten"),
    ("branchen.html#pflege", "Pflege",
     "Fachkraftquote je Dienst statt je Schicht",
     "Der Unterschied klingt nach einer Feinheit und entscheidet über das Ergebnis der "
     "Heimaufsicht. Wie die Quote richtig geprüft wird (Branchenpaket in Vorbereitung).", "6 Minuten"),
    ("branchen.html#sicherheit", "Sicherheitsdienst",
     "§ 34a: warum eine Warnung nicht reicht",
     "Ein abgelaufener Sachkundenachweis ist kein Hinweis, sondern ein Einsatzverbot. "
     "Wie eine harte Sperre in der Planung aussieht (Branchenpaket in Vorbereitung).", "5 Minuten"),
    ("preise.html", "Betriebswirtschaft",
     "Kopfpauschale oder Planer-Preis?",
     "Warum Betriebe mit vielen Beschäftigten bei Kopfpreisen strukturell verlieren — "
     "mit einer Rechnung an drei typischen Betrieben.", "8 Minuten"),
    ("sicherheit.html", "Mitbestimmung",
     "Was der Betriebsrat sehen können muss",
     "Eine Einführung ist mitbestimmungspflichtig. Welche Unterlagen und Zugänge die "
     "Diskussion tatsächlich abkürzen.", "6 Minuten"),
]
seiten["wissen.html"] = dict(
    title="Wissen — CENTRIC",
    desc="Leitfäden zu Schichtplanung, Arbeitszeitrecht, Fachkraftquote und Mitbestimmung — "
         "aus der Planungspraxis für die Planungspraxis.",
    body=f"""
{sect(kopfzeile("Wissen", "Leitfäden aus der Planungspraxis",
                "Kein Blog über uns, sondern Material, das eine Planungsentscheidung "
                "tatsächlich leichter macht.", tag="h1"), "sect-titel")}
{sect('<div class="grid-3 artikel">' + "".join(
    f'<article class="karte karte-link"><p class="kat">{k}</p><h2>'
    f'<a href="{h}">{t}</a></h2><p>{txt}</p><p class="klein">{dauer} Lesezeit</p></article>'
    for h, k, t, txt, dauer in ARTIKEL) + "</div>")}
{sect('''<div class="cta">
  <div class="cta-text"><p class="rail-lab">Nächster Schritt</p><h2>Handbuch statt Hotline</h2>
    <p>Zu jedem Betrieb gehört ein Handbuch, das aus den eigenen Einstellungen erzeugt wird —
       mit den Dienstarten, Modellen und Regeln, die tatsächlich bei Ihnen gelten.</p></div>
  <div class="cta-akt"><a class="btn btn-primary btn-gross" href="kontakt.html#demo">
    Handbuch ansehen</a></div>
</div>''', "sect-cta")}
""")

# ── Artikel ─────────────────────────────────────────────────────────────────
seiten["wissen-rotation.html"] = dict(
    title="Warum ein Dienstplan keine Liste sein sollte — CENTRIC",
    desc="Rollouts erzeugen Jahresgrenzen und Nachpflege. Was sich ändert, wenn man statt "
         "der einzelnen Tage die Regel speichert: Zyklus und Startpunkt je Gruppe.",
    body=f"""
{sect('''<p class="eyebrow">Grundlagen · 9 Minuten Lesezeit</p>
<h1>Warum ein Dienstplan keine Liste sein sollte</h1>
<p class="lead">Fast jede Dienstplansoftware speichert Tage. Das ist bequem, solange man
nach vorne schaut, und es ist der Grund für die meisten Probleme, die im November
auftauchen.</p>''', "sect-titel")}

{sect(f'''<div class="artikel-text">
<p>Ein Dienstplan im durchgehenden Schichtbetrieb ist selten willkürlich. Er folgt einem
Modell: einem Zyklus über eine bestimmte Zahl von Wochen, den mehrere Gruppen gemeinsam
durchlaufen — jede um einen festen Betrag versetzt. Genau diese beiden Angaben, Zyklus und
Startpunkt, enthalten den vollständigen Plan.</p>

<h2>Was beim Ausrollen verloren geht</h2>
<p>Die übliche Umsetzung erzeugt aus dem Modell eine Liste: für jeden Tag und jede Person
ein Eintrag, gespeichert bis zu einem Horizont — meist das Jahresende. Das funktioniert,
bis eine der drei folgenden Situationen eintritt.</p>
<p><strong>Erstens die Grenze.</strong> Jemand fragt, wer im März des übernächsten Jahres
Nachtdienst hat. Die Antwort steht nicht im System, weil so weit nicht ausgerollt wurde.
Also wird ausgerollt — und ab jetzt gibt es Daten, die niemand geprüft hat.</p>
<p><strong>Zweitens die Änderung.</strong> Das Modell wird angepasst. Die ausgerollten Tage
sind davon nicht betroffen; sie müssen neu erzeugt werden. Dabei stellt sich die Frage,
was mit den bereits eingetragenen Abweichungen geschieht — und hier entstehen die Fehler,
die später niemand mehr zuordnen kann.</p>
<p><strong>Drittens die Rückschau.</strong> Wer wissen will, welches Muster vor zwei Jahren
galt, findet die damaligen Tage — aber nicht die Regel, aus der sie entstanden sind. Die
Begründung ist verloren, obwohl sie der eigentliche Inhalt war.</p>

<h2>Die Regel speichern statt das Ergebnis</h2>
<p>CENTRIC speichert je Gruppe zwei Werte: den Zyklus und den Tag, an dem diese Gruppe ihn
begonnen hat. Der Dienst einer Person an einem beliebigen Datum ergibt sich aus der
Differenz zwischen diesem Datum und dem Startpunkt, geteilt durch die Zykluslänge — der
Rest bestimmt die Position im Zyklus.</p>
<p>Das ist keine Optimierung, sondern eine andere Beschreibung desselben Sachverhalts. Aus
ihr folgt unmittelbar:</p>
<ul class="tick gross">
<li>Jeder Tag ist berechenbar — auch der 14. März in vierzig Jahren, auch rückwärts</li>
<li>Es gibt keine Jahresgrenze, weil es keinen Horizont gibt</li>
<li>Eine Modelländerung wirkt sofort in beide Richtungen</li>
<li>Es existiert kein Zustand, der nachgepflegt werden müsste</li>
</ul>

<figure class="art-bild">{rotation_ring(400, dark=False)}
<figcaption>Derselbe Zyklus, sechs Gruppen. Gespeichert ist nur, wo jede Gruppe
darin steht — aus diesen beiden Angaben entsteht jeder Tag.</figcaption></figure>

<h2>Wo die Abweichung bleibt</h2>
<p>Kein Betrieb läuft ein Jahr lang nach Modell. Es gibt Krankmeldungen, Einsprünge,
getauschte Dienste. Diese Abweichungen werden einzeln gespeichert — als Ausnahme zu einem
bestimmten Datum und einer bestimmten Person.</p>
<p>Der Unterschied zur Liste ist entscheidend: Die Abweichung überschreibt die Regel nicht,
sie tritt neben sie. Man kann jederzeit fragen, was eigentlich geplant war und was
tatsächlich geschah — und die Antwort ist nicht rekonstruiert, sondern gespeichert.</p>

<h2>Warum der Plan trotzdem ausgeschrieben wird</h2>
<p>Ein gerechneter Plan nützt nichts, wenn er das System nicht verlässt. Für den Aushang,
die Lohnbuchhaltung, den Kalender auf dem Telefon und den Nachweis gegenüber einem
Auftraggeber wird der Plan als Liste erzeugt — vollständig, für jeden gewünschten Zeitraum.</p>
<p>Der Unterschied ist, dass diese Liste ein Ausdruck ist und keine Wahrheit. Sie wird bei
Bedarf neu erzeugt und niemals nachgepflegt.</p>

<h2>Was das im Alltag bedeutet</h2>
<p>Die Umstellung merkt man an unspektakulären Stellen. Der Jahreswechsel ist kein Termin
mehr. Die Frage nach einem Datum in ferner Zukunft ist genauso schnell beantwortet wie die
nach morgen. Und wenn ein Modell geändert wird, gibt es genau eine Stelle, an der das
geschieht.</p>
<p class="art-schluss">Nichts wird ausgerollt — jeder Tag wird gerechnet.</p>
</div>''')}

{sect('''<div class="cta">
  <div class="cta-text"><p class="rail-lab">Nächster Schritt</p><h2>Rechnen Sie es an Ihrem Modell nach</h2>
    <p>Nennen Sie uns Zykluslänge, Gruppenzahl und Versatz. In der Vorführung sehen Sie
       Ihren eigenen Plan — für jedes Datum, das Sie nennen.</p></div>
  <div class="cta-akt"><a class="btn btn-primary btn-gross" href="kontakt.html#demo">
    Vorführung buchen</a></div>
</div>''', "sect-cta")}
""")

# ── FAQ ─────────────────────────────────────────────────────────────────────
seiten["faq.html"] = dict(
    title="Häufige Fragen — CENTRIC",
    desc="Antworten zu Einführung, Rotationsmodellen, Arbeitszeitprüfung, Preisen, "
         "Datenschutz und Mitbestimmung.",
    body=f"""
{sect(kopfzeile("Häufige Fragen", "Antworten, bevor Sie fragen müssen",
                "Ist Ihre Frage nicht dabei, schreiben Sie uns — wir antworten am selben "
                "Werktag.", tag="h1"), "sect-titel")}

{sect('<h2>Einführung</h2>' + faq_liste([
    ("Wie lange dauert die Einrichtung?",
     "Der erste Standort steht meist in unter einer Stunde. Was Zeit kostet, ist nicht die "
     "Software, sondern die Klärung der eigenen Regeln — Mindestbesetzung, Qualifikationen, "
     "Grenzwerte. Diese Klärung nehmen wir Ihnen nicht ab, aber wir führen durch sie hindurch."),
    ("Können wir unsere Personalliste übernehmen?",
     "Ja. Eine Tabelle mit Name, Eintritt, Wochenstunden und Einheit reicht. Qualifikationen "
     "und Zugangsarten lassen sich im selben Durchgang zuordnen."),
    ("Müssen wir unser Rotationsmodell ändern?",
     "Nein. Sie tragen das Modell ein, das Sie fahren. CENTRIC bringt Vorlagen für gängige "
     "Vier-, Fünf- und Sechsgruppenmodelle mit, aber jeder eigene Zyklus über "
     "beliebig viele Wochen ist möglich."),
    ("Laufen wir eine Zeit lang parallel?",
     "Das empfehlen wir für einen Monat. Ab der ersten Freigabe hält CENTRIC den Stand fest, "
     "und Sie sehen im Vergleich, ob Ihr Modell korrekt abgebildet ist."),
]) + '<h2>Planung und Recht</h2>' + faq_liste([
    ("Was prüft CENTRIC automatisch?",
     "Ruhezeit, Höchstarbeitszeit, Dienste und Nachtdienste in Folge, Mindestbesetzung, "
     "Qualifikationen — laufend, beim Eintragen, nicht am Monatsende."),
    ("Sind zwölfstündige Dienste zulässig?",
     "Nach dem Arbeitszeitgesetz nur, wenn im Schnitt über sechs Monate acht Stunden je "
     "Werktag nicht überschritten werden oder erhebliche Bereitschaftsanteile vorliegen. "
     "CENTRIC weist auf diese Bedingung hin und rechnet den Ausgleich mit."),
    ("Was passiert bei einem abgelaufenen Nachweis?",
     "Vor Ablauf wird gewarnt. Eine harte Sperre nach Ablauf ist Teil der Branchenpakete, "
     "etwa beim Sachkundenachweis im Sicherheitsdienst. Diese Pakete sind in Vorbereitung "
     "und noch nicht buchbar."),
    ("Wie findet CENTRIC Ersatz?",
     "Es schlägt Personen vor, geordnet nach Eignung. Wer nicht kann, steht unten mit "
     "Begründung. Vor dem Eintragen werden die Folgen gezeigt: Ruhezeit, Wochenstunden, "
     "nächste Dienste."),
    ("Rechnet CENTRIC Zuschläge?",
     "Es rechnet Stunden, keine Beträge. Zuschlagsarten und Zeitanteile gehen an die "
     "Lohnbuchhaltung — Stundensätze und Steuerfreibeträge gehören dorthin, nicht in die "
     "Planung."),
]) + '<h2>Preise und Vertrag</h2>' + faq_liste([
    ("Warum zahlt nur, wer plant?",
     "Weil Kopfpauschalen Betriebe mit vielen Beschäftigten strukturell bestrafen. Bei "
     "uns kostet Einstellen nichts: Beschäftigte, Sub-Planer und Betriebsrat sind in "
     "jeder Stufe unbegrenzt und kostenfrei."),
    ("Was bestimmt dann den Preis?",
     "Zwei Entscheidungen, die der Betrieb selbst trifft: wie viele Personen zentral "
     "mitplanen, und wie viele eigenständige Standorte er führt. Beides ist im "
     "Kontingent der Stufe enthalten; nur was darüber liegt, kostet extra."),
    ("Gibt es eine Mindestlaufzeit?",
     "Nein, monatlich kündbar. Die Testphase läuft 30 Tage ohne Zahlungsdaten."),
    ("Was kostet ein Zugang für den Betriebsrat?",
     "Nichts. Der rein lesende Prüfzugang ist in allen Stufen kostenfrei."),
    ("Kommen wir mit unseren Daten wieder heraus?",
     "Jederzeit, vollständig, in offenen Formaten — in jeder Stufe enthalten."),
]) + '<h2>Betrieb und Technik</h2>' + faq_liste([
    ("Brauchen unsere Mitarbeiter eine App?",
     "Nein. Der eigene Plan, Anträge, Kalender-Feed und Stempeln laufen im Browser auf "
     "jedem Gerät."),
    ("Funktioniert der Plan ohne Netz?",
     "Der Kalender-Feed und exportierte Pläne funktionieren unabhängig von der Anwendung. "
     "Änderungen brauchen eine Verbindung."),
    ("Wo liegen die Daten?",
     "Auf einem virtuellen Server der IONOS SE in Spanien, einem Mitgliedstaat der EU. "
     "Details stehen in den AV-Unterlagen."),
    ("Gibt es Schnittstellen zur Lohnbuchhaltung?",
     "Ja, die Lohnausgabe erzeugt die Struktur, die gängige Lohnprogramme erwarten. "
     "Welches Format Sie brauchen, klären wir vor der Einrichtung."),
]))}

{cta("Frage nicht dabei?", "Schreiben Sie uns eine Zeile. Sie bekommen eine Antwort von "
     "jemandem, der die Anwendung kennt — nicht aus einem Formular.")}
""")

# ── Kontakt ─────────────────────────────────────────────────────────────────
seiten["kontakt.html"] = dict(
    title="Kontakt — CENTRIC",
    desc="Vorführung buchen, Test starten, AV-Unterlagen anfordern oder Support erreichen.",
    body=f"""
{sect(kopfzeile("Kontakt", "Sprechen Sie mit jemandem, der plant",
                "Keine Warteschleife, keine Ticketnummer für die erste Frage. Werktags "
                "zwischen 7 und 18 Uhr erreichen Sie direkt jemanden aus dem Team.",
                tag="h1"), "sect-titel")}

{sect(f'''<div class="kontakt" id="demo">
  <form class="k-form" id="kform" novalidate>
    <h2>Vorführung oder Test anfragen</h2>
    <p class="klein">Alle Felder mit * sind nötig. Das Formular öffnet Ihr E-Mail-Programm
      mit der fertigen Nachricht — es werden keine Daten an uns übertragen, bevor Sie
      selbst senden.</p>
    <div class="feld"><label for="k-name">Name *</label>
      <input id="k-name" name="name" type="text" required autocomplete="name"></div>
    <div class="feld"><label for="k-betrieb">Betrieb *</label>
      <input id="k-betrieb" name="betrieb" type="text" required autocomplete="organization"></div>
    <div class="feld"><label for="k-mail">E-Mail *</label>
      <input id="k-mail" name="mail" type="email" required autocomplete="email"></div>
    <div class="feld"><label for="k-tel">Telefon</label>
      <input id="k-tel" name="tel" type="tel" autocomplete="tel"></div>
    <div class="feld"><label for="k-branche">Branche</label>
      <select id="k-branche" name="branche">
        <option>Sicherheitsdienst</option><option>Pflege</option><option>Klinik</option>
        <option>Industrie und Anlagen</option><option>Andere</option></select></div>
    <div class="feld"><label for="k-standorte">Standorte</label>
      <input id="k-standorte" name="standorte" type="number" min="1" value="1"></div>
    <div class="feld feld-voll"><label for="k-anliegen">Anliegen</label>
      <select id="k-anliegen" name="anliegen">
        <option>Vorführung buchen</option><option>Testzugang anfordern</option>
        <option>Angebot anfordern</option><option>AV-Unterlagen anfordern</option>
        <option>Support</option></select></div>
    <div class="feld feld-voll"><label for="k-text">Ihr Modell in zwei Sätzen</label>
      <textarea id="k-text" name="text" rows="4"
        placeholder="Zum Beispiel: 24-Tage-Zyklus, sechs Gruppen, Versatz vier Tage, drei Objekte."></textarea></div>
    <div class="feld feld-voll"><label class="check"><input type="checkbox" id="k-ds" required>
      <span>Ich habe die <a href="datenschutz.html">Datenschutzerklärung</a> gelesen. *</span></label></div>
    <button class="btn btn-primary btn-gross" type="submit">Nachricht vorbereiten</button>
    <p class="k-hinweis" id="k-hinweis" role="status"></p>
  </form>

  <aside class="k-seite">
    <div class="karte" id="anmelden">
      <h3>Anmelden</h3>
      <p>Verwaltende Zugänge melden sich mit E-Mail-Adresse und Passwort an;
         „Passwort vergessen" schickt einen Link zum Neusetzen. Beschäftigte ohne
         hinterlegte Adresse nutzen ihren Zugangscode — verloren? Die Planung stellt
         ihn in der Personalliste in zwei Klicks neu aus.</p>
      <p><a class="btn" href="{APP}/#anmelden">Zur Anmeldung</a></p>
      <p><a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></p>
    </div>
    <div class="karte" id="support">
      <h3>Support</h3>
      <p>Werktags 7 – 18 Uhr. Für laufende Betriebe mit Enterprise-Tarif zusätzlich ein
         bevorzugter Rückruf.</p>
      <p><a href="tel:+4917663872955">0176 63872955</a><br>
         <a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></p>
    </div>
    <div class="karte" id="av">
      <h3>Datenschutz und AV</h3>
      <p>AV-Vertrag, TOM-Verzeichnis und die Liste der Unterauftragsverarbeiter schicken wir
         vorab — vor dem ersten Datensatz.</p>
      <p><a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></p>
    </div>
    <div class="karte karte-still">
      <h3>Anschrift</h3>
      <p>Centric UG (haftungsbeschränkt)<br>Berliner Straße 49<br>64839 Münster<br>Deutschland</p>
      <p class="klein">Post erreicht uns hier; für alles Dringende nutzen Sie bitte
         Telefon oder E-Mail.</p>
    </div>
  </aside>
</div>''')}
""")

# ── Rechtstexte ─────────────────────────────────────────────────────────────
seiten["impressum.html"] = dict(
    title="Impressum — CENTRIC",
    desc="Anbieterkennzeichnung nach § 5 DDG.",
    body=sect('''<h1>Impressum</h1>
<div class="recht">
<h2>Angaben nach § 5 DDG</h2>
<p>Centric UG (haftungsbeschränkt)<br>Berliner Straße 49<br>64839 Münster<br>Deutschland</p>
<h2>Vertreten durch</h2><p>Rinat Schmidt</p>
<h2>Kontakt</h2>
<p>Telefon: <a href="tel:+4917663872955">0176 63872955</a><br>
E-Mail: <a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
<p>Rinat Schmidt, Anschrift wie oben.</p>
<h2>Verbraucherstreitbeilegung</h2>
<p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
Verbraucherschlichtungsstelle teilzunehmen.</p>
<h2>Haftung für Inhalte und Links</h2>
<p>Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
Gesetzen verantwortlich. Für Inhalte externer Links ist der jeweilige Anbieter
verantwortlich; zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar.</p>
</div>''', "sect-titel"))

# TODO-PRODUKTION-LOGFRIST: Abschnitt 2 nennt bewusst keine Zahl. Sobald die
# Zugriffsprotokolle der Website auf dem Server eingerichtet sind (Caddy,
# Rotation), ist die tatsächliche Frist dort einzutragen — die Erklärung
# beschreibt den Zustand, nicht das Vorhaben.
seiten["datenschutz.html"] = dict(
    title="Datenschutzerklärung — CENTRIC",
    desc="Wie wir mit personenbezogenen Daten auf dieser Website und in der Anwendung umgehen.",
    body=sect('''<h1>Datenschutzerklärung</h1>
<div class="recht">
<h2>1. Verantwortlicher</h2>
<p>Centric UG (haftungsbeschränkt), Berliner Straße 49, 64839 Münster, Deutschland,
vertreten durch Rinat Schmidt,
<a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a>.</p>

<h2>2. Diese Website</h2>
<p>Beim Aufruf dieser Website werden die technisch notwendigen Zugriffsdaten verarbeitet
(IP-Adresse, Zeitpunkt, aufgerufene Seite, übermittelter Verweis, Browserkennung). Die
Verarbeitung erfolgt zur Auslieferung der Seite und zur Abwehr von Angriffen auf Grundlage
von Artikel 6 Absatz 1 Buchstabe f DSGVO. Diese Daten stehen in den Protokollen des
Servers und werden nach kurzer Frist gelöscht.</p>

<h2 id="cookies">3. Cookies und Reichweitenmessung</h2>
<p>Diese Website setzt keine Cookies, bindet keine externen Schriften, Karten oder Videos
ein und verwendet keine Reichweitenmessung. Es findet kein Tracking statt, deshalb gibt es
auch kein Einwilligungsbanner.</p>

<h2>4. Kontaktaufnahme</h2>
<p>Das Kontaktformular überträgt keine Daten an uns. Es stellt aus Ihren Eingaben eine
E-Mail in Ihrem eigenen Programm zusammen, die Sie selbst senden. Erst mit dem Senden
erhalten wir die Daten. Wir verarbeiten sie zur Bearbeitung Ihrer Anfrage nach Artikel 6
Absatz 1 Buchstabe b beziehungsweise f DSGVO und löschen sie, sobald der Vorgang
abgeschlossen ist und keine Aufbewahrungspflichten entgegenstehen.</p>

<h2>5. Testzugang</h2>
<p>Wer sich über die Anwendung einen Testbetrieb anlegt, gibt einen Betriebsnamen und eine
Branche an, wahlweise auch eine E-Mail-Adresse. Diese Daten nutzen wir, um den Zugang
bereitzustellen und bei Fragen erreichbar zu sein; Rechtsgrundlage ist Artikel 6 Absatz 1
Buchstabe b DSGVO (vorvertragliche Maßnahme). Für diese Verarbeitung sind wir
Verantwortlicher.</p>
<p>Ein selbst angelegter Testbetrieb kann dreißig Tage genutzt werden. Nach Ablauf ist
keine Anmeldung mehr möglich; die Daten bleiben weitere neunzig Tage gespeichert, damit ein
Vertragsschluss oder eine Rückfrage noch möglich ist. Kommt kein Vertrag zustande, werden
Testbetrieb und Inhalt anschließend im täglichen Bereinigungslauf vollständig gelöscht.</p>

<h2>6. Die Anwendung CENTRIC</h2>
<p>Innerhalb der Anwendung verarbeiten wir personenbezogene Daten von Beschäftigten
ausschließlich im Auftrag des jeweiligen Betriebs. Verantwortlich im Sinne der DSGVO ist
der Betrieb; Grundlage ist ein Vertrag zur Auftragsverarbeitung nach Artikel 28 DSGVO.
Betroffene Personen wenden sich mit ihren Rechten an ihren Arbeitgeber.</p>
<p>Die Anwendung setzt keine Cookies. Die Anmeldung erfolgt über einen Zugangscode ohne
Benutzernamen; gespeichert wird eine Prüfsumme des Codes, nie der Code selbst, sowie eine
gekürzte Prüfsumme der IP-Adresse zur Abwehr automatisierter Versuche, die nach dreißig
Tagen gelöscht wird. Das Sitzungsmerkmal behält der Browser nur auf ausdrücklichen Wunsch
(„Zugang auf diesem Gerät merken") über das Schließen hinaus; Sitzungen enden nach dreißig
Minuten ohne Eingabe von selbst. Die Betreibersicht enthält ausschließlich Kennzahlen und
keine personenbezogenen Daten.</p>
<p>Der serverseitige E-Mail-Versand ist derzeit nicht aktiviert; es werden keine
Mitteilungen aus der Anwendung per E-Mail versendet. Wird er aktiviert, läuft er über den
Dienst Resend (Resend, Inc., USA); vorher werden die Voraussetzungen für eine Übermittlung
in ein Drittland geprüft und diese Erklärung ergänzt.</p>

<h2>7. Aufbewahrung und Löschung</h2>
<p>Aufbewahrungsfristen sind je Betrieb einstellbar. Voreingestellt: Plan- und Zeitdaten
24 Monate, Stammdaten 6 Monate nach Austritt (danach Anonymisierung), Abwesenheitsgründe
3 Monate.</p>

<h2>8. Empfänger und Hosting</h2>
<p>Die Anwendung CENTRIC läuft auf einem virtuellen Server, den wir bei der IONOS SE
mieten; das Rechenzentrum steht in Spanien, einem Mitgliedstaat der EU. Mit IONOS besteht
ein Auftragsverarbeitungsvertrag. Den Betrieb der Server-Plattform erbringt für IONOS die
Arsys Internet S.L.U., Logroño (Spanien). Eine aktuelle Liste der Unterauftragsverarbeiter
mit Sitz und Zweck ist Bestandteil der AV-Unterlagen und wird auf Anfrage übersandt.</p>
<p>Für die Speicherung und Verarbeitung findet keine Übermittlung in ein Drittland statt;
optionale Dienste mit Drittlandbezug — der serverseitige E-Mail-Versand und
Push-Mitteilungen — sind derzeit nicht aktiviert.</p>

<h2>9. Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft (Artikel 15), Berichtigung (Artikel 16), Löschung
(Artikel 17), Einschränkung der Verarbeitung (Artikel 18), Datenübertragbarkeit
(Artikel 20) und Widerspruch (Artikel 21) sowie das Recht, sich bei einer
Aufsichtsbehörde zu beschweren.</p>

<h2>10. Änderungen</h2>
<p>Wir passen diese Erklärung an, wenn sich die Verarbeitung ändert. Stand: August 2026.</p>
<p class="klein muster">Hinweis: Dieser Text ist eine Vorlage und vor der Veröffentlichung
rechtlich zu prüfen und an die tatsächlichen Verhältnisse anzupassen.</p>
</div>''', "sect-titel"))

seiten["agb.html"] = dict(
    title="Allgemeine Geschäftsbedingungen — CENTRIC",
    desc="Vertragsbedingungen für die Überlassung der Software CENTRIC im Abonnement.",
    body=sect('''<h1>Allgemeine Geschäftsbedingungen</h1>
<div class="recht">
<h2>§ 1 Geltungsbereich</h2>
<p>Diese Bedingungen gelten für die Überlassung der Software CENTRIC zur Nutzung über das
Internet gegenüber Unternehmern im Sinne des § 14 BGB. Abweichende Bedingungen des Kunden
werden nur wirksam, wenn wir ihnen schriftlich zustimmen.</p>

<h2>§ 2 Vertragsgegenstand</h2>
<p>Wir stellen die jeweils aktuelle Fassung der Software für die Vertragslaufzeit zur
Nutzung bereit und speichern die vom Kunden eingestellten Daten. Ein Anspruch auf
Überlassung des Quellcodes besteht nicht.</p>

<h2>§ 3 Testphase</h2>
<p>Die Testphase beträgt 30 Tage ab Bereitstellung und ist unentgeltlich. Sie endet
automatisch und geht nicht in ein kostenpflichtiges Abonnement über.</p>

<h2>§ 4 Vergütung</h2>
<p>Die Vergütung richtet sich nach der zum Zeitpunkt der Bestellung gültigen Preisliste
und wird je Betrieb und Monat berechnet. Sie setzt sich zusammen aus der Grundgebühr der
gebuchten Stufe, einer Pauschale je Planer-Zugang über dem Kontingent dieser Stufe, einem
Zuschlag je Standort über dem Kontingent dieser Stufe — bemessen nach der Personenzahl des
jeweiligen zusätzlichen Standorts — sowie den gebuchten Branchenpaketen. In das Kontingent
zählen die jeweils größten Standorte. Zugänge für Beschäftigte, Schichtverantwortung,
Betriebsrat und Organisationsleitung sind unentgeltlich und in der Zahl nicht begrenzt.
Alle Preise verstehen sich zuzüglich der gesetzlichen Umsatzsteuer. Die Abrechnung erfolgt
monatlich im Voraus.</p>

<h2>§ 5 Laufzeit und Kündigung</h2>
<p>Der Vertrag läuft auf unbestimmte Zeit und kann von beiden Seiten mit einer Frist von
einem Monat zum Monatsende gekündigt werden. Das Recht zur außerordentlichen Kündigung
bleibt unberührt.</p>

<h2>§ 6 Pflichten des Kunden</h2>
<p>Der Kunde ist für die Richtigkeit der eingestellten Daten, die Vergabe von Zugängen und
die Einhaltung arbeits-, tarif- und mitbestimmungsrechtlicher Vorgaben verantwortlich. Die
Prüffunktionen der Software unterstützen ihn dabei, ersetzen aber weder rechtliche Beratung
noch seine eigene Prüfung.</p>

<h2>§ 7 Verfügbarkeit</h2>
<p>Wir schulden eine Verfügbarkeit von 99 % im Monatsmittel, gemessen am Monatsende und
ohne angekündigte Wartungsfenster. Wartungsarbeiten kündigen wir vorher an und legen sie
außerhalb üblicher Übergabezeiten.</p>

<h2>§ 8 Datenschutz</h2>
<p>Soweit wir personenbezogene Daten im Auftrag des Kunden verarbeiten, schließen die
Parteien vor Beginn der Verarbeitung einen Vertrag nach Artikel 28 DSGVO.</p>

<h2>§ 9 Datenmitnahme</h2>
<p>Der Kunde kann seine Daten jederzeit vollständig in offenen Formaten exportieren. Nach
Vertragsende löschen wir die Daten nach Ablauf einer vereinbarten Frist und bestätigen die
Löschung.</p>

<h2>§ 10 Haftung</h2>
<p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von
Leben, Körper und Gesundheit. Bei leicht fahrlässiger Verletzung wesentlicher
Vertragspflichten ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden
begrenzt. Im Übrigen ist die Haftung ausgeschlossen.</p>

<h2>§ 11 Schlussbestimmungen</h2>
<p>Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist der Sitz
des Anbieters, soweit der Kunde Kaufmann ist. Sollten einzelne Bestimmungen unwirksam sein,
bleibt der Vertrag im Übrigen wirksam.</p>
<p class="klein muster">Hinweis: Diese Bedingungen sind eine Vorlage und vor der Verwendung
anwaltlich zu prüfen.</p>
</div>''', "sect-titel"))

seiten["barrierefreiheit.html"] = dict(
    title="Barrierefreiheit — CENTRIC",
    desc="Erklärung zur Barrierefreiheit dieser Website.",
    body=sect('''<h1>Erklärung zur Barrierefreiheit</h1>
<div class="recht">
<p class="lead">Ein Schichtbetrieb kennt keine Ausnahme. Wer nachts um drei den eigenen Plan
aufruft, muss ihn lesen können — mit müden Augen, auf einem kleinen Bildschirm, notfalls
mit einem Screenreader.</p>

<h2>Geltungsbereich</h2>
<p>Diese Erklärung bezieht sich ausschließlich auf diese Website. Für die Anwendung CENTRIC
liegt bisher keine eigene Erklärung vor.</p>

<h2>Anspruch</h2>
<p>Wir richten diese Website an den Web Content Accessibility Guidelines in Fassung 2.2,
Konformitätsstufe AA, aus.</p>

<h2>Was auf dieser Website umgesetzt ist</h2>
<ul class="tick gross">
<li>Der Akzentton ist auf hellen Flächen eigens abgedunkelt, damit Text und Bedienelemente
das Kontrastverhältnis 4,5:1 erreichen</li>
<li>Karten haben einen sichtbaren Rand, weil Weiß auf der Grundfläche allein nur rund
1,1:1 Unterschied ergibt</li>
<li>Bedienbarkeit über die Tastatur, sichtbare Fokusanzeige, Sprungmarke zum Inhalt</li>
<li>Semantische Struktur mit Überschriftenhierarchie, Bereichsauszeichnungen und
beschrifteten Formularfeldern</li>
<li>Grafiken codieren nicht allein über Farbe: Schichtarten sind zusätzlich benannt</li>
<li>Bewegung wird bei aktivierter Systemeinstellung „Bewegung reduzieren“ unterdrückt</li>
</ul>

<h2>Bekannte Einschränkungen</h2>
<p>Die Trommel auf der Startseite wird mit dem Zeiger gedreht. Alle Bereiche, die sie zeigt,
sind ebenso über die Hauptnavigation erreichbar.</p>

<h2>Rückmeldung</h2>
<p>Sind Ihnen Barrieren aufgefallen, schreiben Sie an
<a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a>.</p>
<p class="klein muster">Stand: August 2026. Diese Erklärung wird bei wesentlichen Änderungen
überprüft.</p>
</div>''', "sect-titel"))

seiten["404.html"] = dict(
    title="Seite nicht gefunden — CENTRIC",
    desc="Diese Seite existiert nicht.",
    body=sect('''<div class="vier">
<p class="eyebrow">Fehler 404</p>
<h1>Diese Seite gibt es nicht</h1>
<p class="lead">Anders als ein Dienstplan lässt sich eine fehlende Seite nicht ausrechnen.
Vielleicht hilft einer dieser Wege weiter.</p>
<div class="hero-akt">
  <a class="btn btn-primary btn-gross" href="index.html">Zur Startseite</a>
  <a class="btn btn-ghost btn-gross" href="funktionen.html">Funktionen</a>
  <a class="btn btn-ghost btn-gross" href="kontakt.html">Kontakt</a>
</div>
</div>''', "sect-titel"))


# ════════════════════════════════════════════════════════════════════════════
# CSS
# ════════════════════════════════════════════════════════════════════════════

CSS = """
/* ══════════════════════════════════════════════════════════════════════════
   CENTRIC — Website

   Haltung: durchgehender Betrieb. Der Grund ist Nacht, in ihn sind Bögen aus
   Papier eingelegt — der Aushang ist das Licht. Aufgebaut wie ein Planbogen:
   links eine Beschriftungsspalte, rechts das Feld, dazwischen eine
   durchlaufende Haarlinie. Es gibt keine schwebenden Karten und keine runden
   Ecken; rund ist auf dieser Seite ausschließlich eine Schicht.

   Schrift: Signal (schmale Signalschrift, trägt lange Komposita groß),
   Lauf (Grotesk für Fließtext), Zaehl (Festbreite für alles Zählbare).
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Nachtgrund: die Grundeinstellung der ganzen Seite ── */
:root{
  /* Übernommen aus src/farben.js der Anwendung, Satz C — der helle
     Modus. Inhalt liegt auf Papier, der Grund ist einen Hauch
     zurückgenommen, und die Hierarchie kommt aus der dunklen
     Seitenleiste und der Typografie, nicht aus Rändern um jedes
     Kästchen. Genau so ist diese Seite aufgebaut. */
  --grund:#EDF2F4;              /* bg */
  --flaeche:#FFFFFF;            /* flaeche · das Papier */
  --still:#E1EAEE;              /* flaecheStill · Sea Salt */
  --tief:#001619;               /* sidebarTief · Blue Charcoal */
  --sidebar:#071317;            /* sidebar · Midnight Edition */
  --text:#071317;               /* 14,55:1 */
  --text-dim:#3D4E55;
  --text-schwach:#5B6B72;
  --linie:#BCCDD4;              /* line */
  --linie-weich:#CBDAE0;        /* lineSoft */
  --linie-stark:#9DB3BC;        /* lineStark */
  --akzent:#017070;             /* accent · 4,56:1 */
  --akzent-hell:#028E8E;        /* accentHi */
  --akzent-tief:#023441;        /* accentDeep · Natural Indigo */
  --glanz:#50E8F4;              /* accentGlanz — nur auf Dunkel */
  --akzent-flaeche:#DFF0F0;     /* accentLight */
  --auf-akzent:#FFFFFF;         /* 5,91:1 auf dem Akzent */
  --ok:#0E6B45; --warn:#955410; --danger:#4E0401; --violett:#316C81;
  /* Schichtarten aus derselben Sammlung, Helligkeit fällt zur Nacht hin */
  --fruh:#02A0A0; --spat:#017070; --nachtm:#023441;
  --frei:#CBDAE0;              /* lineSoft — freie Zeiten treten zurück */
  --leucht:none;                /* Leuchten gehört auf Dunkel, nicht aufs Papier */

  --wrap:1280px;
  --pad:clamp(20px,4vw,44px);
  --rail:150px;
  --spalt:40px;
  --rand:max(var(--pad), calc((100vw - var(--wrap)) / 2 + var(--pad)));

  --sig:"Signal","Jura",system-ui,sans-serif;
  --lauf:"Lauf","Helvetica Neue",Arial,sans-serif;
  --zaehl:"Zaehl",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
}

/* ── Papierbogen: dieselben Rollen, andere Werte ──
   Die abgedunkelten Akzente stammen aus dem Farbschema der Anwendung; die
   Originaltöne tragen auf Sea Salt keinen Text (2,48:1 statt 4,5:1). */


*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%; scroll-behavior:smooth; scroll-padding-top:96px}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation:none!important; transition-duration:.01ms!important}
  .p-gitter{transform:none!important}
  .p-gitter .m{opacity:1!important}
}

body{
  margin:0;
  background:var(--grund);
  color:var(--text);
  font-family:var(--lauf);
  font-size:17px;
  line-height:1.62;
  -webkit-font-smoothing:antialiased;
  font-variant-numeric:tabular-nums;
}

img,svg{max-width:100%}
p{margin:0 0 1em}
ul{margin:0 0 1em; padding-left:1.1em}

h1,h2,h3{
  font-family:var(--sig);
  font-weight:300;
  line-height:1.06;
  letter-spacing:.015em;
  text-wrap:balance;
  margin:0 0 .34em;
}
h1{font-size:clamp(2.3rem,1.5rem + 3.4vw,4.3rem);
  text-shadow:var(--leucht)}
h2{font-size:clamp(1.75rem,1.25rem + 2.1vw,3rem);
  text-shadow:var(--leucht)}
h3,.zelle h2,.artikel h2,h2.tf-name{font-size:clamp(1.12rem,1.02rem + .5vw,1.4rem);
  font-weight:500; line-height:1.2; margin-bottom:.5em}
/* Die Stufe einer Überschrift beschreibt die Gliederung, nicht die Größe.
   Auf zwei Seiten steht eine Kartengruppe direkt unter der h1 und ist damit
   selbst die oberste Ebene — sie wird zur h2 und sieht aus wie vorher. */
.zelle h2,.artikel h2,h2.tf-name{text-shadow:none}

a{color:var(--akzent); text-decoration:none}
a:hover{text-decoration:underline; text-underline-offset:.28em;
  text-decoration-thickness:1px}
:focus-visible{outline:2px solid var(--akzent); outline-offset:3px}

.skip{position:absolute; left:-9999px; top:0; background:var(--akzent);
  color:var(--auf-akzent); padding:14px 20px; z-index:100; font-family:var(--zaehl);
  font-size:.8rem; letter-spacing:.1em; text-transform:uppercase}
.skip:focus{left:0}

.wrap{max-width:var(--wrap); margin-inline:auto; padding-inline:var(--pad)}

/* ── Marken und Beschriftungen: alles Zählbare in Festbreite ── */
.rail-lab,.eyebrow,.kat,.band-lab{
  font-family:var(--zaehl);
  font-size:.7rem;
  line-height:1.5;
  letter-spacing:.3em;
  text-transform:uppercase;
  color:var(--text-schwach);
  margin:0 0 1.1em;
}
.eyebrow.tint,.kat{color:var(--akzent)}
.lead{font-size:clamp(1.08rem,1rem + .4vw,1.28rem); line-height:1.55;
  color:var(--text-dim); max-width:60ch; margin-bottom:0}
.klein{font-size:.87rem; line-height:1.6; color:var(--text-schwach); max-width:74ch}
.klein.mitte{text-align:center}
.mehr{margin:44px 0 0}

/* ══ Kopf ══════════════════════════════════════════════════════════════ */
.kopf{position:sticky; top:0; z-index:60; background:rgba(237,242,244,.88);
  backdrop-filter:blur(14px) saturate(1.4); border-bottom:1px solid var(--linie)}
.kopf-in{display:flex; align-items:center; gap:clamp(16px,3vw,44px); min-height:66px}
.marke{color:var(--text)}
.marke:hover{text-decoration:none}
.wortmarke{display:inline-flex; align-items:center; gap:10px}
.wortmarke-text{font-family:var(--sig); font-weight:500; font-size:1.02rem;
  letter-spacing:.3em; line-height:1; padding-top:.1em}
.nav{display:flex; gap:clamp(14px,2.2vw,30px); margin-left:auto}
.nav a{font-family:var(--zaehl); font-size:.76rem; letter-spacing:.11em;
  text-transform:uppercase; color:var(--text-dim); padding:8px 0;
  border-bottom:1px solid transparent}
.nav a:hover{color:var(--text); text-decoration:none; border-bottom-color:var(--linie-stark)}
.nav a[aria-current]{color:var(--akzent); border-bottom-color:var(--akzent)}
.kopf-akt{display:flex; align-items:center; gap:8px}

/* ── Schalter: eckig, beschriftet wie an einem Gerät ── */
.btn{
  display:inline-flex; align-items:center; justify-content:center;
  font-family:var(--zaehl); font-size:.76rem; letter-spacing:.11em;
  text-transform:uppercase; padding:11px 18px;
  border:1px solid var(--linie-stark); color:var(--text);
  background:transparent; cursor:pointer; border-radius:0;
  transition:background .16s, color .16s, border-color .16s;
}
.btn:hover{border-color:var(--akzent); color:var(--akzent);
  background:var(--akzent-flaeche); text-decoration:none}
.btn-voll-akzent{background:var(--akzent); color:var(--auf-akzent); border-color:var(--akzent)}
.btn-voll-akzent:hover{background:transparent; color:var(--akzent); border-color:var(--akzent)}
.btn-gross{padding:15px 26px; font-size:.8rem}
.btn-voll{width:100%; margin-top:20px}

.burger{display:none; width:40px; height:36px; border:1px solid var(--linie-stark);
  background:transparent; padding:11px 10px; cursor:pointer; border-radius:0}
.burger span{display:block; height:1px; background:var(--text)}
.burger span+span{margin-top:6px}

/* ══ Abschnitte: der Planbogen ═════════════════════════════════════════ */
.sect{padding:clamp(64px,7vw,112px) 0; background:var(--grund); color:var(--text);
  position:relative}
.sect>.wrap{position:relative; display:grid;
  grid-template-columns:var(--rail) minmax(0,1fr); column-gap:var(--spalt)}
.sect>.wrap>*{grid-column:2; min-width:0}
/* die durchlaufende Linie zwischen Beschriftung und Feld */
.sect>.wrap::before{content:""; position:absolute; top:-.6em; bottom:-.6em;
  left:calc(var(--pad) + var(--rail) + var(--spalt)/2); width:1px;
  background:var(--linie)}
.sect-kopf{display:contents}
.sect-kopf>.rail-lab,.sect>.wrap>.rail-lab{grid-column:1; align-self:start;
  position:sticky; top:98px; margin:0}
.sect-kopf>.titel{grid-column:2; margin-bottom:clamp(38px,4vw,60px)}
.sect-kopf>.titel>h1,.sect-kopf>.titel>h2{margin-bottom:.3em}

.sect-hell{--grund:#E1EAEE}

/* ── Midnight: die Rolle der Seitenleiste. Traditional Turquoise und
   Fluorescent Blue leben laut Farbdatei genau hier — auf Dunkel. ── */
.dunkel{
  --grund:#071317; --flaeche:#001619; --still:#0C1E24;
  --text:#EDF2F4; --text-dim:#9FB2B9; --text-schwach:#7A8D95;
  --linie:#1E3138; --linie-weich:#152830; --linie-stark:#33454C;
  --akzent:#02A0A0;             /* accentOrig · 5,87:1 auf der Seitenleiste */
  --akzent-hell:#50E8F4;        /* accentGlanz */
  --akzent-flaeche:#0C2A2E; --auf-akzent:#001619;
  --fruh:#50E8F4; --spat:#02A0A0; --nachtm:#316C81; --frei:#1E3138;
  --leucht:0 0 30px rgba(80,232,244,.3);
}
.sect-titel{padding:clamp(52px,6vw,88px) 0 clamp(26px,3vw,40px)}
.sect-titel+.sect{padding-top:clamp(30px,3vw,48px)}
.sect-titel .lead{margin-top:1.2em}

/* Planmuster als Atmosphäre — dieselbe Teilung wie im Raster oben */
.sect-dunkel,.sect-nacht{
  background:
    repeating-linear-gradient(90deg, var(--linie-weich) 0 1px, transparent 1px 72px),
    var(--grund);
  border-block:1px solid var(--linie);
}
.sect-band{padding:clamp(30px,3.4vw,44px) 0; background:var(--flaeche);
  border-block:1px solid var(--linie)}

/* ══ Spiegelhalle — der Kopf der Startseite ════════════════════════════
   Eine Rotunde aus leuchtenden Tafeln über stillem, spiegelndem Wasser.
   Der HUD darüber ist reines DOM: Vignette, Haarlinienrahmen mit
   Eckwinkeln, Masthead, Fokuszeile, Zugwink. Nur die Leinwand nimmt
   Zeiger entgegen. */
.halle{position:relative; height:100svh; min-height:600px; overflow:hidden;
  background:radial-gradient(120% 70% at 50% 0%, #072429 0%, #001619 64%), #001619}
.halle canvas{position:absolute; inset:0; width:100%; height:100%; display:block;
  touch-action:pan-y; cursor:grab}
.halle canvas.-zieht{cursor:grabbing}
.halle.flach canvas{display:none}
.halle .hud{position:absolute; inset:0; z-index:3; pointer-events:none; color:var(--text)}
.halle .vignette{position:absolute; inset:0; background:
  radial-gradient(130% 90% at 50% 42%, transparent 52%, rgba(4,10,12,.55) 100%),
  linear-gradient(to bottom, rgba(4,10,12,.42) 0%, transparent 20%, transparent 62%, rgba(4,10,12,.62) 100%)}
.halle .rahmen{position:absolute; inset:clamp(14px,2.4vh,26px);
  border:1px solid var(--linie); box-shadow:inset 0 0 60px rgba(0,22,25,.5)}
.halle .rahmen::before,.halle .rahmen::after{content:""; position:absolute;
  width:9px; height:9px; border:1px solid rgba(2,160,160,.6)}
.halle .rahmen::before{top:-1px; left:-1px; border-right:0; border-bottom:0}
.halle .rahmen::after{bottom:-1px; right:-1px; border-left:0; border-top:0}
.halle .mast{position:absolute; top:clamp(30px,6.6vh,66px); left:50%;
  transform:translateX(-50%); width:92%; text-align:center}
.halle .kicker{font-family:var(--zaehl); font-size:clamp(8.5px,.95vw,10px);
  letter-spacing:.42em; text-transform:uppercase; color:var(--text-schwach);
  margin:0 0 15px}
.halle .kicker b{color:var(--akzent); font-weight:600}
.halle .mast h1{margin:0 auto; font-weight:300; font-size:clamp(30px,5.6vw,66px);
  line-height:1.06; letter-spacing:.015em; color:var(--text); max-width:17ch;
  text-wrap:balance;
  text-shadow:0 2px 44px rgba(80,232,244,.28), 0 1px 3px rgba(0,0,0,.55)}
.halle .sub{margin:16px 0 0; font-size:clamp(10.5px,1.25vw,13px);
  letter-spacing:.05em; color:var(--text-dim)}
.halle .fokus{position:absolute; bottom:clamp(34px,7vh,74px); left:50%;
  transform:translateX(-50%); width:92%; display:flex; flex-direction:column;
  align-items:center; gap:13px}
.halle .zaehler{display:flex; align-items:baseline; gap:7px;
  font-family:var(--zaehl); font-size:12px; letter-spacing:.16em}
.halle .zaehler .num{color:var(--akzent-hell); font-size:14px;
  text-shadow:0 0 16px rgba(80,232,244,.5)}
.halle .zaehler i{color:var(--text-schwach); font-style:normal}
.halle .zaehler span:last-child{color:var(--text-dim)}
.halle .name{font-family:var(--sig); font-weight:300;
  font-size:clamp(20px,3.4vw,34px); letter-spacing:.12em; text-transform:uppercase;
  color:var(--text); text-shadow:0 2px 30px rgba(80,232,244,.28), 0 1px 2px rgba(0,0,0,.6);
  will-change:transform,opacity,filter}
@keyframes fokusTausch{from{opacity:0; transform:translateY(9px); filter:blur(5px)}
  to{opacity:1; transform:none; filter:blur(0)}}
.halle .name.-tausch{animation:fokusTausch .5s cubic-bezier(.22,.61,.36,1) both}
.halle .punkte{display:flex; align-items:center; gap:9px; margin-top:2px}
.halle .punkte i{width:5px; height:5px; border-radius:4px;
  background:var(--linie-stark);
  transition:width .5s cubic-bezier(.22,.61,.36,1), background .5s ease, box-shadow .5s ease}
.halle .punkte i.-an{width:22px; background:var(--akzent-hell);
  box-shadow:0 0 12px rgba(80,232,244,.55)}
.halle .fokus-link{pointer-events:auto; margin-top:6px; font-family:var(--zaehl);
  font-size:.68rem; letter-spacing:.2em; text-transform:uppercase; color:var(--akzent);
  border:1px solid rgba(2,160,160,.5); padding:9px 16px}
.halle .fokus-link:hover{background:var(--akzent-flaeche); text-decoration:none}
.halle .wink{position:absolute; bottom:clamp(34px,7vh,74px);
  right:clamp(26px,4vw,58px); display:flex; align-items:center; gap:9px; margin:0;
  font-family:var(--zaehl); font-size:10px; letter-spacing:.26em;
  text-transform:uppercase; color:var(--text-dim); transition:opacity .8s ease}
.halle .wink::before{content:""; width:22px; height:1px;
  background:var(--text-schwach); animation:winkSchub 2.4s ease-in-out infinite}
@keyframes winkSchub{0%,100%{transform:translateX(0); opacity:.35}
  50%{transform:translateX(6px); opacity:.9}}
/* Einblendung: nur wenn das Skript da ist, wird zuerst versteckt */
.halle-js .halle .mast,.halle-js .halle .fokus,.halle-js .halle .wink{opacity:0;
  transition:opacity 1.1s ease, transform 1.1s cubic-bezier(.22,.61,.36,1)}
.halle-js .halle .mast{transform:translateX(-50%) translateY(-12px)}
.halle-js .halle .fokus{transform:translateX(-50%) translateY(14px)}
body.-bereit .halle .mast{opacity:1; transform:translateX(-50%) translateY(0)}
body.-bereit .halle .fokus{opacity:1; transform:translateX(-50%) translateY(0)}
body.-bereit .halle .wink{opacity:1}
body.-gezogen .halle .wink{opacity:0!important}
.halle-js .halle .rahmen{opacity:0; transition:opacity 1.6s ease}
body.-bereit .halle .rahmen{opacity:1}
@media (max-width:620px){
  .halle .wink{display:none}
  .halle .fokus{bottom:clamp(26px,5vh,40px)}
}

.hero-akt{display:flex; gap:10px; flex-wrap:wrap; margin-top:clamp(28px,3vw,40px)}

/* Der Plan als Instrument. Er läuft rechts aus dem Bild — er hört nicht auf. */
.instrument{position:relative; z-index:1; border-top:1px solid var(--linie-stark);
  background:var(--flaeche); overflow:hidden}
.instrument-leiste{display:grid; grid-template-columns:var(--rail) minmax(0,1fr) auto;
  column-gap:var(--spalt); align-items:end; padding-block:22px 20px}
.i-stand .rail-lab{margin-bottom:.5em}
.i-datum{font-family:var(--sig); font-weight:300; font-size:clamp(1.6rem,1.1rem + 1.8vw,2.5rem);
  line-height:1; margin:0; letter-spacing:.02em}
.i-steuer{display:flex; gap:0; flex-wrap:wrap}
.i-steuer button{font-family:var(--zaehl); font-size:.72rem; letter-spacing:.09em;
  text-transform:uppercase; padding:9px 13px; background:transparent;
  color:var(--text-dim); border:1px solid var(--linie); margin-left:-1px;
  cursor:pointer; border-radius:0; transition:color .15s, background .15s}
.i-steuer button:hover{color:var(--auf-akzent); background:var(--akzent);
  border-color:var(--akzent); position:relative; z-index:1}
.i-notiz{font-family:var(--zaehl); font-size:.7rem; line-height:1.6;
  letter-spacing:.06em; color:var(--text-schwach); margin:0; text-align:right}

/* Bühne: links die feste Beschriftung, rechts das laufende Gitter.
   Beide teilen dieselben Zeilenhöhen, damit die Zeilen fluchten. */
.plan-buehne{
  --pitch:26px; --zh:21px; --kh:30px; --luecke:5px; --takt:2.4s;
  display:grid; grid-template-columns:56px minmax(0,1fr);
  padding:6px 0 18px; padding-left:var(--rand); contain:paint;
}
.p-marken,.p-gitter{display:grid;
  grid-template-rows:var(--kh) repeat(6,var(--zh)); row-gap:var(--luecke);
  align-items:center}
.p-lauf{overflow:hidden}
.p-gitter{grid-template-columns:repeat(var(--spalten),var(--pitch));
  column-gap:0; will-change:transform;
  animation:laufen var(--takt) linear infinite}
@keyframes laufen{from{transform:translateX(0)}
  to{transform:translateX(calc(-1 * var(--pitch)))}}
.p-tag{display:flex; flex-direction:column; align-items:center; gap:1px;
  font-family:var(--zaehl); font-size:.56rem; letter-spacing:.04em;
  color:var(--text-schwach)}
.p-tag i{font-style:normal; opacity:.62}
.p-tag b{font-weight:400; font-size:.66rem; color:var(--text-dim)}
.p-tag.we b,.p-tag.we i{color:var(--akzent); opacity:.85}
.p-lab{font-family:var(--zaehl); font-size:.68rem; letter-spacing:.12em;
  color:var(--text-schwach)}
.p-z{display:flex; justify-content:center}

/* Das einzig Runde auf dieser Seite: eine Schicht. */
.m{display:block; width:13px; height:21px; border-radius:7px; background:var(--frei)}
.m.f{background:var(--fruh)}
.m.s{background:var(--spat)}
.m.n{background:var(--nachtm)}
.m.o{background:none; box-shadow:inset 0 0 0 1px var(--frei)}

@keyframes rechnen{from{opacity:0; transform:translateY(7px) scaleY(.55)}
  to{opacity:1; transform:none}}
.frisch .p-gitter>*{animation:rechnen .46s cubic-bezier(.2,.75,.3,1) both;
  animation-delay:calc(var(--i,0) * 13ms)}

/* Die Welle: eine Helligkeit, die diagonal durch den Plan wandert. Sie
   läuft nur über besetzte Schichten — die Lücken bleiben ruhig. */
@keyframes atmen{0%,100%{opacity:.55} 50%{opacity:1}}
.p-gitter .m.f,.p-gitter .m.s,.p-gitter .m.n{
  animation:atmen 9s ease-in-out infinite;
  animation-delay:calc(var(--ph,0) * -1ms)}

.i-legende{display:flex; gap:12px 26px; flex-wrap:wrap; align-items:center;
  padding-block:16px; border-top:1px solid var(--linie);
  font-family:var(--zaehl); font-size:.7rem; letter-spacing:.08em;
  text-transform:uppercase; color:var(--text-schwach)}
.i-legende span{display:inline-flex; align-items:center; gap:9px}
.i-legende .m{width:9px; height:15px; border-radius:5px}
.i-regel{margin-left:auto; color:var(--text-dim)}

/* ══ Fachwelten-Band ═══════════════════════════════════════════════════ */
.branchen-band{list-style:none; margin:0; padding:0; display:grid;
  grid-template-columns:repeat(4,1fr); gap:1px; background:var(--linie)}
.branchen-band li{background:var(--flaeche); padding:16px 20px; display:grid;
  grid-template-columns:1fr auto; align-items:baseline; gap:2px 12px}
.branchen-band b{font-family:var(--sig); font-size:1.05rem; font-weight:500;
  letter-spacing:.03em}
.branchen-band span{grid-column:1; font-size:.85rem; color:var(--text-schwach)}
.branchen-band em{grid-column:1; font-family:var(--zaehl); font-style:normal; font-size:.8rem;
  color:var(--akzent)}

/* ══ Zellen statt Karten ═══════════════════════════════════════════════ */
.feld-3,.grid-3{display:grid; grid-template-columns:repeat(3,1fr); gap:1px;
  background:var(--linie); border-block:1px solid var(--linie)}
.feld-3>*,.grid-3>*{background:var(--flaeche); padding:26px 24px 30px}
.grid-4{display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
  background:var(--linie); border-block:1px solid var(--linie)}
.grid-4>*{background:var(--flaeche); padding:24px 22px 28px}
.grid-2{display:grid; grid-template-columns:repeat(2,1fr); gap:1px;
  background:var(--linie); border-block:1px solid var(--linie)}
.grid-2>*{background:var(--flaeche); padding:28px 26px 32px}
.zelle,.karte{position:relative}
.zelle p,.karte p{color:var(--text-dim); font-size:.97rem; margin-bottom:0}
.zelle p+p,.karte p+p{margin-top:.8em}
/* die Linie über der Zelle füllt sich beim Überfahren */
.feld-3>.zelle::before,.grid-3>.karte::before,.grid-4>.karte::before,
.grid-2>.karte::before{
  content:""; position:absolute; top:-1px; left:0; width:0; height:1px;
  background:var(--akzent); transition:width .32s cubic-bezier(.2,.75,.3,1)}
.feld-3>.zelle:hover::before,.grid-3>.karte:hover::before,
.grid-4>.karte:hover::before,.grid-2>.karte:hover::before{width:100%}
.karte-still{background:var(--still)!important}
.karte-link a{font-family:var(--zaehl); font-size:.74rem; letter-spacing:.1em;
  text-transform:uppercase; display:inline-block; margin-top:16px}
.preis-mini{font-family:var(--zaehl); font-size:.82rem; color:var(--akzent)!important;
  margin-top:14px!important}

/* Aufzählung: das Zeichen ist eine Schicht */
.tick{list-style:none; padding:0; margin:18px 0 0; display:grid; gap:9px}
.tick li{position:relative; padding-left:24px; color:var(--text-dim); font-size:.95rem;
  line-height:1.5}
.tick li::before{content:""; position:absolute; left:0; top:.44em; width:9px; height:15px;
  border-radius:5px; background:var(--akzent); opacity:.85}
.tick.gross li{font-size:1.02rem}

/* ══ Zweispalter ═══════════════════════════════════════════════════════ */
.split{display:grid; grid-template-columns:1fr .92fr; gap:clamp(36px,5vw,72px);
  align-items:center}
.split-eng{grid-template-columns:1fr .86fr}
.split.umgekehrt>div:first-child{order:2}
.split h2{margin-bottom:.34em}
.split .lead{margin-bottom:1.4em}
.split .btn{margin-top:26px}
.ring{display:flex; flex-direction:column; gap:18px; align-items:center}
.bild-lab{font-family:var(--zaehl); font-size:.72rem; line-height:1.7;
  letter-spacing:.05em; color:var(--text-schwach); text-align:center;
  max-width:44ch; margin:0}

/* ══ Schritte: eine echte Folge, deshalb nummeriert ════════════════════ */
.schritte{list-style:none; margin:0; padding:0; display:grid;
  grid-template-columns:repeat(4,1fr); gap:1px; background:var(--linie);
  border-block:1px solid var(--linie)}
.schritte li{background:var(--flaeche); padding:24px 22px 30px}
.schritte .nr{display:block; font-family:var(--zaehl); font-size:.72rem;
  letter-spacing:.14em; color:var(--akzent); margin-bottom:22px}
.schritte h3{margin-bottom:.5em}
.schritte p{margin:0; font-size:.94rem; color:var(--text-dim)}

/* ══ Prüfliste ═════════════════════════════════════════════════════════ */
.pruef-liste{display:grid; grid-template-columns:repeat(2,1fr); gap:1px;
  background:var(--linie); border-block:1px solid var(--linie)}
.pruef-liste>div{background:var(--flaeche); padding:18px 22px; display:grid; gap:3px}
.pruef-liste strong{font-family:var(--sig); font-weight:500; font-size:1.05rem;
  letter-spacing:.02em; line-height:1.3}
.pruef-liste span{font-size:.9rem; color:var(--text-dim)}

/* ══ Tafeln ════════════════════════════════════════════════════════════ */
.tabelle-w{overflow-x:auto; border-block:1px solid var(--linie-stark)}
.tab{width:100%; border-collapse:collapse; min-width:580px}
.tab th,.tab td{text-align:left; padding:15px 20px 15px 0;
  border-bottom:1px solid var(--linie); font-size:.95rem}
.tab th{font-family:var(--zaehl); font-size:.68rem; letter-spacing:.14em;
  text-transform:uppercase; color:var(--text-schwach); padding-top:0}
.tab td:first-child,.tab th:first-child{padding-left:0}
.tab tbody tr:last-child td{border-bottom:0}
.tab tbody tr{transition:background .15s}
.tab tbody tr:hover{background:var(--flaeche)}
.tab strong{font-weight:700}
.kurz{font-family:var(--zaehl); font-size:.72rem; letter-spacing:.1em;
  color:var(--akzent)}

/* ══ Stimmen: Zitate mit hängender Quelle, keine Kästen ════════════════ */
.stimmen{display:grid; grid-template-columns:repeat(3,1fr); gap:1px;
  background:var(--linie); border-block:1px solid var(--linie)}
.stimmen figure{margin:0; background:var(--flaeche); padding:30px 26px;
  display:flex; flex-direction:column; gap:22px}
.stimmen blockquote{margin:0; font-family:var(--sig); font-weight:300;
  font-size:clamp(1.3rem,1.1rem + .8vw,1.7rem); line-height:1.3;
  letter-spacing:.01em; text-wrap:pretty}
.stimmen figcaption{margin-top:auto; display:grid; gap:3px;
  font-family:var(--zaehl); font-size:.72rem; letter-spacing:.07em}
.stimmen figcaption b{font-weight:400; color:var(--text)}
.stimmen figcaption span{color:var(--text-schwach); text-transform:uppercase;
  font-size:.66rem; letter-spacing:.11em}

/* ══ Preise ════════════════════════════════════════════════════════════ */
.tarif-tafel{display:grid; grid-template-columns:repeat(3,1fr); gap:1px;
  background:var(--linie-stark); border-block:1px solid var(--linie-stark)}
.tf-sp{background:var(--flaeche); padding:28px 26px 32px; display:flex;
  flex-direction:column}
.tf-sp-mitte{background:var(--still)}
.tf-name{font-family:var(--zaehl); font-size:.74rem; letter-spacing:.16em;
  font-weight:400; margin:0;
  text-transform:uppercase; color:var(--akzent); margin:0 0 18px}
.tf-preis{display:flex; align-items:baseline; gap:10px; margin:0 0 16px}
.tf-preis b{font-family:var(--sig); font-weight:300; font-size:clamp(3.2rem,2rem + 3.6vw,4.6rem);
  line-height:.86; letter-spacing:0; color:var(--akzent);
  text-shadow:var(--leucht)}
.tf-preis span{font-family:var(--zaehl); font-size:.7rem; line-height:1.5;
  letter-spacing:.07em; color:var(--text-schwach)}
.tf-claim{color:var(--text-dim); font-size:.96rem; margin-bottom:14px}
.tf-grenze{font-family:var(--zaehl); font-size:.72rem; letter-spacing:.05em;
  color:var(--text-schwach); border-top:1px solid var(--linie); padding-top:14px;
  margin:0}
.tf-sp .tick{flex:1}

.preis-teaser{border-block:1px solid var(--linie-stark)}
.pt-zeile{display:grid; grid-template-columns:1fr auto; gap:2px 20px;
  padding:18px 0; border-bottom:1px solid var(--linie); align-items:baseline}
.pt-zeile:last-of-type{border-bottom:0}
.pt-zeile>span:first-child{font-family:var(--sig); font-size:1.35rem; font-weight:500;
  letter-spacing:.02em}
.pt-preis{font-family:var(--sig); font-weight:300; font-size:1.9rem; line-height:1;
  color:var(--akzent); text-shadow:var(--leucht)}
.pt-bis{grid-column:1/-1; font-family:var(--zaehl); font-size:.72rem;
  letter-spacing:.05em; color:var(--text-schwach)}
.preis-teaser .klein{margin:16px 0 0}

/* ══ Rechner: ein Gerät, kein Formular ═════════════════════════════════ */
.rechner{display:grid; grid-template-columns:1.1fr .9fr; gap:1px;
  background:var(--linie-stark); border:1px solid var(--linie-stark)}
/* Drei Ringe nebeneinander, solange die Spalte es trägt — darunter bricht
   der letzte um. Feste zwei Spalten ließen den dritten Ring allein in
   einer eigenen Zeile stehen, mit viel Weiß daneben. */
.rechner-ein{background:var(--flaeche); padding:30px 28px; display:grid;
  grid-template-columns:repeat(auto-fit,minmax(146px,1fr)); gap:22px 16px;
  align-content:start; align-items:end}
.feld{display:grid; gap:8px}
.feld-voll{grid-column:1/-1}
.feld label,.feld legend{font-family:var(--zaehl); font-size:.7rem;
  letter-spacing:.12em; text-transform:uppercase; color:var(--text-schwach); padding:0}
fieldset.feld{border:0; margin:0; padding:0}
input:not([type=checkbox]):not([type=radio]),select,textarea{
  font-family:var(--zaehl); font-size:1rem; padding:12px 14px;
  border:1px solid var(--linie-stark); border-radius:0; background:var(--flaeche);
  color:var(--text); width:100%}
textarea{font-family:var(--lauf)}
input:focus,select:focus,textarea:focus{outline:none; border-color:var(--akzent);
  box-shadow:inset 0 -2px 0 var(--akzent)}
/* ── Der Ringregler im Preisrechner ── */
.ringfeld{justify-items:center; gap:16px; align-content:start}
/* „Personen je Standort" bricht auf zwei Zeilen, „Standorte" nicht. Ohne
   feste Höhe stünden die Scheiben daneben um eine Zeile versetzt. */
.ring-lab{font-family:var(--zaehl); font-size:.7rem; letter-spacing:.12em;
  text-transform:uppercase; color:var(--text-schwach); justify-self:start;
  display:flex; align-items:flex-end; min-height:2.6em; line-height:1.3}
.ring{display:grid; justify-items:center; gap:14px; width:100%}
.rr-scheibe{width:min(200px,100%); aspect-ratio:1; border-radius:50%;
  cursor:pointer; touch-action:none}
/* Der Fokusring hugt die Scheibe, statt weit außen einen zweiten Kreis
   zu zeichnen — sonst sieht er aus wie Teil der Grafik. */
.rr-scheibe:focus-visible{outline:2px solid var(--akzent); outline-offset:-1px}
.rr-scheibe:active{cursor:grabbing}
.ring-svg-regler{display:block; width:100%; height:100%; overflow:visible}
.rr-spur{fill:none; stroke:var(--linie); stroke-width:1; opacity:.7}
.rr-stufe{fill:none; stroke-linecap:round; stroke:var(--linie-weich);
  transition:stroke .18s ease, stroke-width .18s ease}
.rr-stufe.-belegt{stroke:var(--akzent)}
.rr-stufe.-griff{stroke:var(--akzent-hell)}
.-aktiv .rr-stufe.-belegt{filter:drop-shadow(0 0 6px var(--akzent-hell))}
.rr-zahl{fill:var(--text); font-family:var(--sig); font-weight:300; font-size:42px;
  letter-spacing:-.02em}
.rr-einheit{fill:var(--text-schwach); font-family:var(--zaehl); font-size:10px;
  letter-spacing:.16em}
.rr-tasten{display:flex; align-items:center; gap:8px; font-family:var(--zaehl);
  font-size:.72rem; letter-spacing:.06em; color:var(--text-schwach)}
.rr-tasten button{width:32px; height:32px; border:1px solid var(--linie-stark);
  background:var(--flaeche); color:var(--text); font-size:16px; line-height:1;
  border-radius:0; cursor:pointer}
.rr-tasten button:hover:not(:disabled){border-color:var(--akzent); color:var(--akzent)}
.rr-tasten button:disabled{opacity:.35; cursor:default}
.rr-tasten span{min-width:72px; text-align:center}

/* ── Branchenpakete als Schalter, nicht als nackte Kästchen ── */
.checks{display:grid; grid-template-columns:repeat(2,1fr); gap:10px}
.checks .check{position:relative; cursor:pointer}
.checks .check input{position:absolute; opacity:0; width:1px; height:1px}
.check-feld{display:flex; align-items:baseline; justify-content:space-between;
  gap:10px; width:100%; padding:12px 14px; border:1px solid var(--linie-stark);
  background:var(--flaeche); transition:border-color .16s, background .16s}
.check-feld b{font-weight:400; font-size:.93rem}
.check-feld em{font-family:var(--zaehl); font-style:normal; font-size:.76rem;
  color:var(--text-schwach)}
.checks .check:hover .check-feld{border-color:var(--akzent)}
.checks .check input:focus-visible + .check-feld{outline:2px solid var(--akzent);
  outline-offset:2px}
.checks .check input:checked + .check-feld{border-color:var(--akzent);
  background:var(--akzent-flaeche)}
.checks .check input:checked + .check-feld em{color:var(--akzent)}
.feld .check,.check{display:flex; align-items:flex-start; gap:11px;
  font-family:var(--lauf); font-size:.93rem; line-height:1.45; letter-spacing:0;
  text-transform:none; color:var(--text); cursor:pointer}
.check input{margin-top:.3em; accent-color:var(--akzent); width:16px; height:16px;
  flex-shrink:0}
.check em{font-family:var(--zaehl); font-style:normal; font-size:.8rem;
  color:var(--text-schwach)}

.rechner-aus{background:var(--grund); color:var(--text); padding:30px 28px}
.ra-lab{font-family:var(--zaehl); font-size:.68rem; letter-spacing:.15em;
  text-transform:uppercase; color:var(--text-schwach); margin:0 0 10px}
.ra-summe{font-family:var(--sig); font-weight:300; font-size:clamp(3.2rem,2rem + 4.4vw,5.2rem);
  line-height:.86; color:var(--akzent); text-shadow:var(--leucht);
  margin:0 0 24px}
.ra-summe em{font-style:normal; font-size:.34em; color:var(--text-dim)}
.ra-zeilen{margin:0 0 18px; padding-top:18px; border-top:1px solid var(--linie);
  display:grid; grid-template-columns:1fr auto; gap:9px 18px;
  font-family:var(--zaehl); font-size:.78rem; letter-spacing:.03em}
.ra-zeilen dt{color:var(--text-schwach)}
.ra-zeilen dd{margin:0; text-align:right; color:var(--text)}
.ra-kopf{font-size:.86rem; line-height:1.55; color:var(--text-dim); margin:0 0 22px}
.rechner-aus .btn-voll{margin-top:0}

/* ══ Fragen ════════════════════════════════════════════════════════════ */
.faq{border-top:1px solid var(--linie-stark); max-width:none}
.faq details{border-bottom:1px solid var(--linie)}
.faq summary{cursor:pointer; padding:20px 48px 20px 0; position:relative;
  list-style:none; display:block}
.faq summary::-webkit-details-marker{display:none}
.faq summary span{font-family:var(--sig); font-weight:500;
  font-size:clamp(1.05rem,.95rem + .4vw,1.3rem); line-height:1.25; letter-spacing:.02em}
.faq summary:hover span{color:var(--akzent)}
.faq summary::after{content:""; position:absolute; right:6px; top:calc(50% - 1px);
  width:15px; height:1px; background:var(--akzent)}
.faq summary::before{content:""; position:absolute; right:13px; top:calc(50% - 8px);
  width:1px; height:15px; background:var(--akzent); transition:transform .22s,opacity .22s}
.faq details[open] summary::before{transform:scaleY(0); opacity:0}
.faq-a{padding:0 12% 24px 0; color:var(--text-dim); max-width:74ch}
.faq-a:last-child{margin:0}
.sect h2+.faq{margin-bottom:52px}

/* ══ Zahlen ════════════════════════════════════════════════════════════ */
.zahlen{display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
  background:var(--linie); border-block:1px solid var(--linie)}
.zahlen>div{background:var(--flaeche); padding:26px 22px 30px}
.zahlen strong{display:block; font-family:var(--sig); font-weight:300;
  font-size:clamp(3rem,2rem + 3vw,4.2rem); line-height:.86; color:var(--akzent);
  text-shadow:var(--leucht)}
.zahlen span{display:block; margin-top:16px; font-size:.92rem; color:var(--text-dim)}

/* ══ Artikel ═══════════════════════════════════════════════════════════ */
.artikel h2 a{color:var(--text)}
.artikel h2 a:hover{color:var(--akzent); text-decoration:none}
.artikel-text{max-width:70ch; font-size:1.06rem}
.artikel-text h2{margin-top:1.9em; font-size:clamp(1.7rem,1.3rem + 1.6vw,2.4rem)}
.artikel-text p{color:var(--text-dim)}
.artikel-text strong{color:var(--text)}
.art-bild{margin:48px 0; text-align:center}\n.art-bild .ring-svg{max-width:420px}
.art-bild figcaption{font-family:var(--zaehl); font-size:.72rem; line-height:1.7;
  color:var(--text-schwach); margin-top:16px}
.art-schluss{margin-top:2em; padding-top:1.5em; border-top:1px solid var(--linie-stark);
  font-family:var(--sig); font-weight:300; font-size:clamp(1.4rem,1.15rem + 1vw,1.9rem);
  line-height:1.25; color:var(--akzent)!important;
  text-shadow:var(--leucht)}

/* ══ Kontakt ═══════════════════════════════════════════════════════════ */
.kontakt{display:grid; grid-template-columns:1.08fr .92fr; gap:clamp(28px,3vw,44px);
  align-items:start}
.k-form{border:1px solid var(--linie-stark); padding:32px 30px; display:grid;
  grid-template-columns:repeat(2,1fr); gap:20px}
.k-form h2,.k-form>.klein,.k-form>button,.k-hinweis{grid-column:1/-1}
.k-form h2{margin-bottom:0}
.k-hinweis{margin:0; font-family:var(--zaehl); font-size:.8rem; color:var(--akzent);
  min-height:1.5em}
.k-seite{display:grid; gap:1px; background:var(--linie); border:1px solid var(--linie)}
.k-seite .karte{background:var(--flaeche); padding:24px 24px 26px}
.k-seite p{font-size:.94rem; color:var(--text-dim)}
.k-seite p:last-child{margin-bottom:0}

/* ══ Rechtstexte ═══════════════════════════════════════════════════════ */
.recht{max-width:72ch}
.recht h2{font-size:clamp(1.3rem,1.1rem + .8vw,1.7rem); margin-top:2em}
.recht p,.recht li{color:var(--text-dim)}
.muster{margin-top:2.6em; padding:18px 20px; background:var(--flaeche);
  border-left:2px solid var(--warn)}
.vier{max-width:60ch}
.vier .hero-akt{display:flex; gap:10px; flex-wrap:wrap; margin-top:32px}

/* ══ Band, Aufruf, Fuß ═════════════════════════════════════════════════ */
.band{display:flex; gap:12px 28px; flex-wrap:wrap; font-family:var(--zaehl);
  font-size:.78rem; letter-spacing:.12em; text-transform:uppercase;
  color:var(--text-dim)}
.band-mitte{justify-content:center}

.sect-cta{padding:clamp(52px,5.5vw,84px) 0}
.sect-cta>.wrap{display:block}
.sect-cta>.wrap::before{display:none}
.cta{display:grid; grid-template-columns:minmax(0,1fr) auto; gap:clamp(28px,4vw,64px);
  align-items:end; border:1px solid var(--linie-stark);
  padding:clamp(26px,3.5vw,44px); box-shadow:inset 0 0 60px rgba(4,10,12,.4)}
.cta h2{margin-bottom:.24em}
.cta p{color:var(--text-dim); max-width:52ch; margin:0}
.cta .rail-lab{color:var(--text-dim)}
.cta-akt{display:flex; gap:10px; flex-wrap:wrap}
/* Eckwinkel — dieselbe Sprache wie der Rahmen der Halle */
.cta,.rechner,.k-form,.karte-bild{position:relative}
.cta::before,.cta::after,.rechner::before,.rechner::after,
.k-form::before,.k-form::after,.karte-bild::before,.karte-bild::after{
  content:""; position:absolute; width:9px; height:9px; z-index:1;
  border:1px solid var(--akzent)}
.cta::before,.rechner::before,.k-form::before,.karte-bild::before{
  top:-1px; left:-1px; border-right:0; border-bottom:0}
.cta::after,.rechner::after,.k-form::after,.karte-bild::after{
  bottom:-1px; right:-1px; border-left:0; border-top:0}

/* Der Fuß trug bisher Midnight und stieß ohne Naht an das ebenfalls
   dunkle Aufrufband — die letzten 825 px waren ein einziger Block. Das
   Aufrufband bleibt der letzte laute Moment; der Fuß ist ein Verzeichnis
   und tritt zurück. */
.fuss{background:var(--still); color:var(--text-dim);
  border-top:1px solid var(--linie-stark);
  padding:clamp(52px,5vw,76px) 0 26px; font-size:.92rem}
.fuss-oben{display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,2fr);
  gap:clamp(32px,4vw,64px); padding-bottom:40px; border-bottom:1px solid var(--linie)}
.fuss-marke .wortmarke-text{color:var(--text)}
.fuss-marke p{max-width:36ch; margin:20px 0 0; color:var(--text-dim)}
.fuss-adr{font-family:var(--zaehl); font-size:.76rem; line-height:1.8;
  color:var(--text-schwach)!important}
.fuss a{color:var(--text-dim)}
.fuss a:hover{color:var(--akzent)}
.fuss-spalten{display:grid; grid-template-columns:repeat(4,1fr); gap:28px}
.fuss-spalten h2{font-family:var(--zaehl); font-weight:400; font-size:.68rem;
  letter-spacing:.16em; text-transform:uppercase; color:var(--text-schwach);
  margin-bottom:16px}
.fuss-spalten ul{list-style:none; padding:0; margin:0; display:grid; gap:10px}
.fuss-unten{display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;
  padding-top:22px; font-family:var(--zaehl); font-size:.7rem; letter-spacing:.08em;
  text-transform:uppercase; color:var(--text-schwach)}
.fuss-unten p{margin:0}

/* ══ Beispielbögen auf der Branchenseite ═══════════════════════════════ */
.karte-bild{padding:24px!important; border:1px solid var(--linie)}
.plan-kopf{display:flex; justify-content:space-between; align-items:baseline; gap:14px;
  font-family:var(--zaehl); font-size:.7rem; letter-spacing:.1em; text-transform:uppercase;
  color:var(--text-schwach); margin-bottom:18px}
.lab{color:var(--akzent)}
.plan-fuss{display:flex; gap:16px; flex-wrap:wrap; margin-top:18px;
  font-family:var(--zaehl); font-size:.66rem; letter-spacing:.08em;
  text-transform:uppercase; color:var(--text-schwach)}
.plan-fuss span{display:inline-flex; align-items:center; gap:7px}
.pt{width:8px; height:13px; border-radius:4px; display:inline-block; background:var(--frei)}
.pt.f{background:var(--fruh)} .pt.s{background:var(--spat)}
.pt.n{background:var(--nachtm)}
.pt.o{background:none; box-shadow:inset 0 0 0 1px var(--frei)}

/* ── Grafiken nehmen die Werte ihrer Fläche an ── */
.logo .lb{fill:var(--text)}
.logo .lm{fill:var(--akzent)}
.logo .lk{fill:none; stroke:var(--text); stroke-width:2.6; stroke-linecap:round;
  opacity:.8}

.plan-svg .f{fill:var(--fruh)}
.plan-svg .s{fill:var(--spat)}
.plan-svg .n{fill:var(--nachtm)}
.plan-svg .o{fill:none; stroke:var(--frei); stroke-width:.8}
.ring-svg .b{fill:none; stroke-linecap:round; stroke-width:var(--sw)}
.ring-svg .b.f{stroke:var(--fruh)}
.ring-svg .b.s{stroke:var(--spat)}
.ring-svg .b.n{stroke:var(--nachtm)}
.ring-svg .b.o{stroke:var(--frei); stroke-width:.9}
.ring-svg{transform-box:view-box}
.ring-svg .rg{transform-box:view-box; will-change:transform;
  animation:ringgang var(--dauer,60s) linear infinite}
@keyframes ringgang{to{transform:rotate(calc(var(--richtung,1) * 360deg))}}
.ring-svg .mitte-ring{fill:none; stroke:var(--linie-stark); stroke-width:1.2}
.ring-svg .mitte{fill:var(--text); font-family:var(--sig); font-weight:300}
.ring-svg .mitte-lab{fill:var(--text-schwach); font-family:var(--zaehl);
  letter-spacing:3px}

/* ══ Schmale Bildschirme ═══════════════════════════════════════════════ */
@media (max-width:1040px){
  :root{--rail:120px; --spalt:28px}
  .split,.split-eng,.rechner,.kontakt{grid-template-columns:1fr}
  .split.umgekehrt>div:first-child{order:0}
  .grid-4,.schritte,.zahlen,.branchen-band{grid-template-columns:repeat(2,1fr)}
  .feld-3,.grid-3,.stimmen,.tarif-tafel{grid-template-columns:repeat(2,1fr)}
  .fuss-oben{grid-template-columns:1fr}
  .fuss-spalten{grid-template-columns:repeat(2,1fr)}
  .instrument-leiste{grid-template-columns:1fr auto; row-gap:18px}
  .i-notiz{display:none}
  .ring{max-width:400px; margin-inline:auto}
}
@media (max-width:820px){
  body{font-size:16px}
  :root{--rail:0px; --spalt:0px}
  .sect>.wrap{grid-template-columns:1fr}
  .sect>.wrap>*,.sect-kopf>.rail-lab,.sect-kopf>.titel{grid-column:1}
  .sect-kopf>.rail-lab,.sect>.wrap>.rail-lab{position:static}
  .sect>.wrap::before{display:none}
  .nav{position:absolute; top:100%; left:0; right:0; background:var(--grund);
    border-bottom:1px solid var(--linie-stark); flex-direction:column; gap:0;
    padding:4px var(--pad) 16px; display:none}
  .nav.offen{display:flex}
  .nav a{padding:14px 0; border-bottom:1px solid var(--linie); width:100%;
    font-size:.85rem}
  .burger{display:block}
  .nur-breit{display:none}
  .feld-3,.grid-2,.grid-3,.grid-4,.stimmen,.schritte,.zahlen,.pruef-liste,
  .checks,.rechner-ein,.k-form,.tarif-tafel,.branchen-band,.fuss-spalten,
  .cta{grid-template-columns:1fr}
  .cta{align-items:start}
  .plan-buehne{--pitch:22px; grid-template-columns:44px minmax(0,1fr)}
  .faq-a{padding-right:0}
}
"""

JS = """/* CENTRIC — Website. Ohne Abhängigkeiten, ohne Tracking. */
(function () {
  "use strict";

  /* ── Navigation auf schmalen Bildschirmen ── */
  var burger = document.getElementById("burger");
  var nav = document.getElementById("nav");
  if (burger && nav) {
    burger.addEventListener("click", function () {
      var offen = nav.classList.toggle("offen");
      burger.setAttribute("aria-expanded", String(offen));
      burger.setAttribute("aria-label", offen ? "Navigation schließen" : "Navigation öffnen");
    });
  }

  /* ── Der Plan im Kopf der Startseite ──
     Dieselbe Arithmetik wie in der Anwendung: aus Zyklus und Versatz wird
     jeder Tag gerechnet. Deshalb kostet ein Sprung über zehn Jahre auch
     nichts — es gibt nichts auszurollen. */
  var buehne = document.getElementById("p-buehne");
  var gitter = document.getElementById("p-gitter");
  if (buehne && gitter) {
    var ZYKLUS = __ZYKLUS__;
    var GRUPPEN = 6, VERSATZ = 4, WELLE = 9000;
    var EPOCHE = Date.UTC(2026, 0, 1);
    var TAG = 86400000;
    var WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    var MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
               "August", "September", "Oktober", "November", "Dezember"];
    var KL = { F: "f", S: "s", N: "n", "-": "o" };
    var anzeige = document.getElementById("p-datum");
    var start = Date.UTC(2026, 7, 1);
    var n = 0;

    /* Eine Spalte mehr, als sichtbar ist — sonst reißt beim Weiterrücken
       am rechten Rand eine Lücke auf. */
    function spaltenzahl() {
      var breit = buehne.getBoundingClientRect().width;
      var pitch = parseFloat(getComputedStyle(buehne).getPropertyValue("--pitch")) || 26;
      var lab = window.innerWidth <= 820 ? 44 : 56;
      return Math.max(12, Math.ceil((breit - lab) / pitch) + 2);
    }

    function zellen() {
      var teile = [], i, g, d, wt, tag, ph;
      for (i = 0; i < n; i++) {
        d = new Date(start + i * TAG);
        wt = d.getUTCDay();
        teile.push('<span class="p-tag' + (wt === 0 || wt === 6 ? " we" : "") +
          '" style="--i:' + i + '"><i>' + WT[wt] + "</i><b>" +
          ("0" + d.getUTCDate()).slice(-2) + "</b></span>");
      }
      for (g = 0; g < GRUPPEN; g++) {
        for (i = 0; i < n; i++) {
          tag = Math.round((start + i * TAG - EPOCHE) / TAG);
          ph = (((tag * 90 + g * 420) % WELLE) + WELLE) % WELLE;
          var st = ZYKLUS[(((tag - g * VERSATZ) % 24) + 24) % 24];
          teile.push('<span class="p-z" style="--i:' + i + '"><i class="m ' +
            KL[st] + '" style="--ph:' + ph + '"></i></span>');
        }
      }
      return teile.join("");
    }

    function datum() {
      var d = new Date(start);
      anzeige.textContent = MON[d.getUTCMonth()] + " " + d.getUTCFullYear();
    }

    /* Neu rechnen: mit Einlauf, weil hier eine Entscheidung sichtbar wird. */
    var weg;
    function rechne() {
      n = spaltenzahl();
      gitter.style.setProperty("--spalten", n);
      gitter.innerHTML = zellen();
      datum();
      buehne.classList.add("frisch");
      clearTimeout(weg);
      weg = setTimeout(function () { buehne.classList.remove("frisch"); }, 1200);
    }

    /* Weiterrücken: ohne Einlauf, exakt dann, wenn der Schub bei null
       wieder anfängt — dadurch bleibt der Lauf ohne sichtbaren Sprung. */
    gitter.addEventListener("animationstart", function (e) {
      if (e.animationName !== "laufen") return;
      buehne.classList.remove("frisch");
    });
    gitter.addEventListener("animationiteration", function (e) {
      if (e.animationName !== "laufen") return;
      start += TAG;
      gitter.innerHTML = zellen();
      datum();
    });

    document.querySelectorAll("[data-spring]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.spring;
        if (v === "heute") {
          var h = new Date();
          start = Date.UTC(h.getFullYear(), h.getMonth(), 1);
        } else {
          start += Number(v) * TAG;
        }
        rechne();
      });
    });

    var t;
    window.addEventListener("resize", function () {
      clearTimeout(t); t = setTimeout(rechne, 180);
    });
    var heute = new Date();
    start = Date.UTC(heute.getFullYear(), heute.getMonth(), 1);
    rechne();
  }

  /* ── Ringregler ──
     Derselbe Aufbau wie das Bauteil für die Anwendung: der Ring ist unten
     offen, damit das Kleinste und das Größte nicht aneinanderstoßen; jede
     Raste ist einzeln antippbar; hell wird allein, was belegt ist; und ein
     Zug über mehr als die halbe Skala gilt als Überfahren des Anschlags,
     damit ein Daumen, der unten vorbeiwischt, nicht dreißig Standorte auf
     einen fallen lässt. */
  var LUECKE = 60, BOGEN = 300;

  function ringPunkt(r, grad) {
    var b = grad * Math.PI / 180;
    return [100 + r * Math.sin(b), 100 - r * Math.cos(b)];
  }
  function ringBogen(r, von, bis) {
    var a = ringPunkt(r, von), b = ringPunkt(r, bis);
    return "M " + a[0].toFixed(2) + " " + a[1].toFixed(2) + " A " + r + " " + r +
      " 0 " + (bis - von > 180 ? 1 : 0) + " 1 " + b[0].toFixed(2) + " " + b[1].toFixed(2);
  }
  function klemme(x, a, b) { return Math.min(b, Math.max(a, x)); }

  function ringregler(el, beiAenderung) {
    var min = Number(el.dataset.min), max = Number(el.dataset.max);
    var schritt = Number(el.dataset.schritt) || 1;
    var einheit = el.dataset.einheit || "";
    var stufen = Math.max(1, Math.floor((max - min) / schritt) + 1);
    var index = klemme(Math.round((Number(el.dataset.wert) - min) / schritt), 0, stufen - 1);
    var letzter = index, gefasst = false, aktiv = false;

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 200 200");
    svg.setAttribute("class", "ring-svg-regler");
    var spur = document.createElementNS(NS, "path");
    spur.setAttribute("d", ringBogen(78, -BOGEN / 2, BOGEN / 2));
    spur.setAttribute("class", "rr-spur");
    svg.appendChild(spur);

    /* Strichstärke und Segmentlänge folgen der Teilung. Die runden Enden
       tragen je die halbe Strichstärke über den Bogen hinaus — wer das
       nicht abzieht, bekommt bei dreißig Rasten einen durchgehenden
       Klumpen statt einzelner Marken. */
    var teilung = 2 * Math.PI * 78 * (BOGEN / 360) / stufen;
    var gesamt = teilung * 0.62;
    var dicke = klemme(gesamt, 4.5, 14);
    var halb = Math.max(0.3, (gesamt - dicke) / 2 / 78 * 180 / Math.PI);
    var teile = [];
    for (var i = 0; i < stufen; i++) {
      var w = stufen > 1 ? -BOGEN / 2 + BOGEN * i / (stufen - 1) : 0;
      var pfad = document.createElementNS(NS, "path");
      pfad.setAttribute("d", ringBogen(78, w - halb, w + halb));
      pfad.setAttribute("class", "rr-stufe");
      svg.appendChild(pfad);
      teile.push(pfad);
    }
    var zahl = document.createElementNS(NS, "text");
    zahl.setAttribute("x", "100"); zahl.setAttribute("y", "106");
    zahl.setAttribute("text-anchor", "middle"); zahl.setAttribute("class", "rr-zahl");
    svg.appendChild(zahl);
    if (einheit) {
      var eh = document.createElementNS(NS, "text");
      eh.setAttribute("x", "100"); eh.setAttribute("y", "128");
      eh.setAttribute("text-anchor", "middle"); eh.setAttribute("class", "rr-einheit");
      eh.textContent = einheit.toUpperCase();
      svg.appendChild(eh);
    }

    var scheibe = document.createElement("div");
    scheibe.className = "rr-scheibe";
    scheibe.tabIndex = 0;
    scheibe.setAttribute("role", "slider");
    scheibe.setAttribute("aria-valuemin", min);
    scheibe.setAttribute("aria-valuemax", max);
    if (el.dataset.lab) scheibe.setAttribute("aria-labelledby", el.dataset.lab);
    scheibe.appendChild(svg);

    var tasten = document.createElement("div");
    tasten.className = "rr-tasten";
    var weniger = document.createElement("button");
    var mehr = document.createElement("button");
    var spanne = document.createElement("span");
    spanne.textContent = min + " bis " + max;
    [weniger, mehr].forEach(function (t, n) {
      t.type = "button"; t.textContent = n ? "+" : "\u2212";
      t.setAttribute("aria-label", (n ? "Erhöhen" : "Verringern"));
    });
    tasten.appendChild(weniger); tasten.appendChild(spanne); tasten.appendChild(mehr);

    el.appendChild(scheibe); el.appendChild(tasten);

    function wert() { return min + index * schritt; }
    function zeichne() {
      for (var i = 0; i < stufen; i++) {
        var belegt = i <= index, griff = i === index;
        teile[i].setAttribute("class",
          "rr-stufe" + (belegt ? " -belegt" : "") + (griff ? " -griff" : ""));
        teile[i].style.strokeWidth =
          belegt ? (griff ? dicke + 4 : dicke) + "px" : "2.2px";
      }
      svg.classList.toggle("-aktiv", aktiv);
      zahl.textContent = wert().toLocaleString("de-DE");
      scheibe.setAttribute("aria-valuenow", wert());
      scheibe.setAttribute("aria-valuetext", wert() + (einheit ? " " + einheit : ""));
      weniger.disabled = index <= 0; mehr.disabled = index >= stufen - 1;
    }
    function setze(i) {
      i = klemme(i, 0, stufen - 1);
      if (i === index) return;
      index = i; zeichne(); if (beiAenderung) beiAenderung();
    }
    function ausZeiger(ev) {
      var k = svg.getBoundingClientRect();
      var a = Math.atan2(ev.clientX - (k.left + k.width / 2),
                         -(ev.clientY - (k.top + k.height / 2))) * 180 / Math.PI;
      a = klemme(a, -BOGEN / 2, BOGEN / 2);
      return stufen > 1 ? Math.round((a + BOGEN / 2) / BOGEN * (stufen - 1)) : 0;
    }

    scheibe.addEventListener("pointerdown", function (ev) {
      ev.preventDefault(); gefasst = true; aktiv = true;
      scheibe.setPointerCapture(ev.pointerId);
      letzter = ausZeiger(ev); setze(letzter); zeichne();
    });
    scheibe.addEventListener("pointermove", function (ev) {
      if (!gefasst) return;
      var i = ausZeiger(ev);
      if (Math.abs(i - letzter) > Math.max(2, stufen / 2)) {
        i = letzter < stufen / 2 ? 0 : stufen - 1;
      }
      letzter = i; setze(i);
    });
    ["pointerup", "pointercancel"].forEach(function (n) {
      scheibe.addEventListener(n, function () { gefasst = false; });
    });
    scheibe.addEventListener("focus", function () { aktiv = true; zeichne(); });
    scheibe.addEventListener("blur", function () { aktiv = false; gefasst = false; zeichne(); });
    scheibe.addEventListener("keydown", function (ev) {
      var d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[ev.key];
      if (d !== undefined) { ev.preventDefault(); setze(index + d); return; }
      if (ev.key === "PageUp") { ev.preventDefault(); setze(index + 5); return; }
      if (ev.key === "PageDown") { ev.preventDefault(); setze(index - 5); return; }
      if (ev.key === "Home") { ev.preventDefault(); setze(0); return; }
      if (ev.key === "End") { ev.preventDefault(); setze(stufen - 1); }
    });
    weniger.addEventListener("click", function () { setze(index - 1); });
    mehr.addEventListener("click", function () { setze(index + 1); });

    zeichne();
    return { wert: wert };
  }

  /* ── Preisrechner ──
     Dieselbe Rechnung wie in der Anwendung, Zeile für Zeile: Grundgebühr
     der Stufe, Pauschale je Planer-Zugang über deren Kontingent, Zuschlag
     je Standort über deren Kontingent — gestaffelt nach der Größe DIESES
     Standorts, nicht nach der des Betriebs — und die Branchenpakete je
     Betrieb. Die Zahlen stehen in stufen.js im Anwendungsrepo; eine
     zweite, abweichende Rechnung an dieser Stelle wäre ein
     Preisversprechen, das die Anwendung nicht einhält. */
  var STUFEN = __STUFEN__;
  var BAENDER = __BAENDER__;
  var ZUSATZ_PLANER = __ZUSATZ_PLANER__;
  var KONTAKT_AB_PLANER = __KONTAKT_AB_PLANER__;
  var KONTAKT_AB_STANDORTE = __KONTAKT_AB_STANDORTE__;

  function standortZuschlag(personen) {
    for (var i = 0; i < BAENDER.length; i++)
      if (BAENDER[i].bis === null || personen <= BAENDER[i].bis) return BAENDER[i].zuschlag;
    return BAENDER[BAENDER.length - 1].zuschlag;
  }
  function eur(n) {
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* Was die gewählten Pakete kosten. Die in der Stufe enthaltenen sind
     die teuersten der gewählten — alles andere wäre eine Falle: Wer
     Pflege und Klinik hat und Industrie dazunimmt, dürfte sonst
     schlechter dastehen als vorher. */
  function paketkosten(gewaehlt, frei) {
    var sortiert = gewaehlt.slice().sort(function (a, b) { return b.preis - a.preis; });
    var offen = sortiert.slice(Math.max(0, frei));
    var summe = 0;
    for (var i = 0; i < offen.length; i++) summe += offen[i].preis;
    return { frei: sortiert.slice(0, Math.max(0, frei)), zahlend: offen, summe: summe };
  }

  function preisFuer(stufe, planer, standorte, pakete) {
    var zusatzPlaner = Math.max(0, planer - stufe.planerInkl);
    var summePlaner = zusatzPlaner * ZUSATZ_PLANER;
    /* Die größten Standorte zählen ins Kontingent — ein Betrieb muss
       nichts auswählen, um den günstigsten Fall zu bekommen. */
    var sortiert = standorte.slice().sort(function (a, b) { return b - a; });
    var posten = sortiert.slice(stufe.standorteInkl).map(function (n) {
      return { personen: n, zuschlag: standortZuschlag(n) };
    });
    var summeStandorte = 0;
    for (var i = 0; i < posten.length; i++) summeStandorte += posten[i].zuschlag;
    var pk = paketkosten(pakete, stufe.paketeFrei);
    return {
      stufe: stufe, zusatzPlaner: zusatzPlaner, summePlaner: summePlaner,
      posten: posten, summeStandorte: summeStandorte, pakete: pk,
      gesamt: Math.round((stufe.grund + summePlaner + summeStandorte + pk.summe) * 100) / 100,
      kontakt: planer > KONTAKT_AB_PLANER || posten.length > KONTAKT_AB_STANDORTE
    };
  }

  /* Die kleinste Stufe, die das gewählte Planer-Kontingent ohne Aufpreis
     trägt — die ehrlichste Antwort auf „was brauche ich". */
  function passendeStufe(planer) {
    for (var i = 0; i < STUFEN.length; i++)
      if (planer <= STUFEN[i].planerInkl) return STUFEN[i];
    return STUFEN[STUFEN.length - 1];
  }

  var form = document.getElementById("preisrechner");
  if (form) {
    var elSumme = document.getElementById("summe");
    var elZeilen = document.getElementById("zeilen");
    var elKopf = document.getElementById("jekopf");
    var elStufe = document.getElementById("stufe");

    var regler = {};
    form.querySelectorAll(".ring").forEach(function (el) {
      regler[el.id.replace("ring-", "")] = ringregler(el, function () { rechne(); });
    });

    var rechne = function () {
      var planer = regler.planer.wert();
      var n = regler.standorte.wert();
      var p = regler.personen.wert();

      var standorte = [];
      for (var i = 0; i < n; i++) standorte.push(p);

      var pakete = [];
      form.querySelectorAll("input[name=paket]:checked").forEach(function (c) {
        pakete.push({ id: c.value, preis: Number(c.dataset.preis),
          name: c.parentNode.querySelector("b").textContent.trim() });
      });

      var stufe = passendeStufe(planer);
      var r = preisFuer(stufe, planer, standorte, pakete);

      if (elStufe) elStufe.textContent = stufe.name;
      elSumme.textContent = r.kontakt ? "\\u2014" : eur(r.gesamt);

      var zeilen = "";
      zeilen += "<dt>Grundgeb\\u00fchr " + stufe.name + "</dt><dd>" +
                eur(stufe.grund) + " \\u20ac</dd>";
      if (r.zusatzPlaner > 0)
        zeilen += "<dt>" + r.zusatzPlaner + " Planer-Zugang" +
                  (r.zusatzPlaner === 1 ? "" : "e") + " \\u00fcber dem Kontingent</dt><dd>" +
                  eur(r.summePlaner) + " \\u20ac</dd>";
      if (r.posten.length > 0)
        zeilen += "<dt>" + r.posten.length + " Standort" +
                  (r.posten.length === 1 ? "" : "e") + " \\u00fcber dem Kontingent</dt><dd>" +
                  eur(r.summeStandorte) + " \\u20ac</dd>";
      for (var j = 0; j < r.pakete.zahlend.length; j++)
        zeilen += "<dt>Paket " + r.pakete.zahlend[j].name + "</dt><dd>" +
                  eur(r.pakete.zahlend[j].preis) + " \\u20ac</dd>";
      for (var k = 0; k < r.pakete.frei.length; k++)
        zeilen += "<dt>Paket " + r.pakete.frei[k].name +
                  " \\u2014 in " + stufe.name + " enthalten</dt><dd>0,00 \\u20ac</dd>";
      elZeilen.innerHTML = zeilen;

      if (r.kontakt) {
        elKopf.textContent = "Ein Betrieb dieser Gr\\u00f6\\u00dfe bekommt ein eigenes " +
          "Angebot mit verhandelter Grundgeb\\u00fchr \\u2014 sprechen Sie uns an.";
        return;
      }
      var koepfe = n * p;
      elKopf.textContent = "Das sind " + eur(r.gesamt / koepfe) +
        " \\u20ac je Person und Monat bei " + koepfe.toLocaleString("de-DE") +
        " Personen \\u2014 und diese Zahl f\\u00e4llt weiter, wenn Sie morgen " +
        "zehn weitere einstellen. Wer geplant wird, kostet nichts.";
    };

    form.addEventListener("input", rechne);
    form.addEventListener("change", rechne);
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    rechne();
  }

  /* ── Kontaktformular: baut eine E-Mail, überträgt selbst nichts ── */
  var kform = document.getElementById("kform");
  if (kform) {
    kform.addEventListener("submit", function (e) {
      e.preventDefault();
      var hinweis = document.getElementById("k-hinweis");
      if (!kform.checkValidity()) {
        kform.reportValidity();
        hinweis.textContent = "Bitte füllen Sie die Pflichtfelder aus.";
        return;
      }
      var f = kform.elements;
      var zeilen = [
        "Anliegen: " + f.anliegen.value,
        "Name: " + f.name.value,
        "Betrieb: " + f.betrieb.value,
        "E-Mail: " + f.mail.value,
        "Telefon: " + (f.tel.value || "—"),
        "Branche: " + f.branche.value,
        "Standorte: " + f.standorte.value,
        "",
        f.text.value || "—"
      ].join("\\n");
      var url = "mailto:info@centric-dienstplanung.de" +
        "?subject=" + encodeURIComponent("CENTRIC — " + f.anliegen.value + " — " + f.betrieb.value) +
        "&body=" + encodeURIComponent(zeilen);
      window.location.href = url;
      hinweis.textContent = "Ihr E-Mail-Programm wurde geöffnet. Senden Sie die Nachricht ab, " +
        "dann melden wir uns am selben Werktag.";
    });
  }
})();
"""


HALLE_JS = """/* CENTRIC — Spiegelhalle.
   Der Kopf der Startseite: eine Rotunde aus 26 leuchtenden Tafeln über
   stillem, spiegelndem Wasser. Ziehen dreht den Ring (mit Nachlauf),
   Überfahren hebt eine Tafel an, der Zeiger hinterlässt Ringe im Wasser.
   Die Spiegelung ist echt: eine gespiegelte Kamera zeichnet die Szene in
   eine Textur, die die Wellen verzerren. Drei.js liegt lokal bei —
   nichts wird nachgeladen. Bei reduzierter Bewegung steht die Halle und
   wird nur auf Eingaben neu gezeichnet. */
(function () {
  "use strict";
  document.documentElement.classList.add("halle-js");
  var abschnitt = document.getElementById("halle");
  var leinwand = document.getElementById("halle-c");
  requestAnimationFrame(function () { document.body.classList.add("-bereit"); });
  if (!abschnitt || !leinwand) return;
  if (!window.THREE) { abschnitt.classList.add("flach"); return; }

  var ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var T = __TOENE__;
  var KARTEN = __KARTEN__;
  var ZYKLUS = __ZYKLUS__;

  var P = {
    /* Konvex: die Kamera steht außerhalb, die Tafeln liegen auf der
       Außenhaut einer Trommel. Deshalb ist die Wölbung je Tafel negativ
       (die Ränder weichen von der Kamera zurück, nicht zu ihr hin), der
       Bildwinkel enger und die Kamera um `abstand` von der Haut entfernt. */
    ringRadius: 8.5, kartenB: 1.68, kartenH: 2.74, woelbung: -1, luecke: 0.36,
    hub: 0.05, eckradius: 0.035, hebung: 1.035, abstand: 9.6,
    fov: 46, augenhoehe: 2.52, eigendreh: 0.04, zugtempo: 0.0085, nachlauf: 0.89,
    spiegelhelle: 0.25, wellenmass: 0.68, verzerrung: 0.1, glanz: 0.04,
    fresnel: 2.1, etikettabstand: 0.2,
  };

  var renderer;
  try {
    renderer = new THREE.WebGL1Renderer({ canvas: leinwand, antialias: true });
  } catch (e) { abschnitt.classList.add("flach"); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  var DPR = renderer.getPixelRatio();

  var szene = new THREE.Scene();
  szene.background = new THREE.Color(T.raum);

  var kamera = new THREE.PerspectiveCamera(P.fov, 1, 0.1, 220);
  kamera.position.set(0, P.augenhoehe, P.ringRadius + P.abstand);
  var blick = new THREE.Vector3(0, 1.05, 0);
  kamera.lookAt(blick);

  /* ── Himmel: fast schwarz, im Zenit ein Rest Nachtblau ── */
  var himmel = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      uniforms: { uUnten: { value: new THREE.Vector3().fromArray(T.himmelUnten) },
                  uOben: { value: new THREE.Vector3().fromArray(T.himmelOben) } },
      fragmentShader: [
        "precision highp float; varying vec3 vP;",
        "uniform vec3 uUnten, uOben;",
        "void main(){",
        "  float h = normalize(vP).y;",
        "  vec3 col = mix(uUnten, uOben, smoothstep(0.02, 0.72, h));",
        "  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0/2.2)), 1.0);",
        "}",
      ].join("\\n"),
    }));
  himmel.renderOrder = -1;
  szene.add(himmel);

  /* ── Sternfeld: 700 stille Punkte, deterministisch gesetzt ── */
  (function () {
    var N = 700, pos = new Float32Array(N * 3), keim = 1234.5;
    var rnd = function () { keim = Math.sin(keim * 12.9898 + 78.233) * 43758.5453; return keim - Math.floor(keim); };
    for (var i = 0; i < N; i++) {
      var r = 70 + rnd() * 80, th = rnd() * Math.PI * 2, ph = (rnd() * 0.6 + 0.2) * Math.PI;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.abs(Math.cos(ph)) * r * 0.7 + 5;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    szene.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: T.sterne, size: 0.16, sizeAttenuation: true,
      transparent: true, opacity: T.sterneDeckung, depthWrite: false })));
  })();

  /* ── Tafelbilder: prozedural gezeichnet, in der Sprache des Blatts ── */
  /* Auf Dunkel: Fluorescent Blue, Traditional Turquoise, Vintage Aqua */
  var FARBE = T.schicht;
  function pfadRund(x, l, o, b, h, r) {
    x.beginPath();
    x.moveTo(l + r, o);
    x.arcTo(l + b, o, l + b, o + h, r);
    x.arcTo(l + b, o + h, l, o + h, r);
    x.arcTo(l, o + h, l, o, r);
    x.arcTo(l, o, l + b, o, r);
    x.closePath();
  }
  function tafelBild(idx) {
    var b = document.createElement("canvas");
    b.width = 512; b.height = 836;
    var x = b.getContext("2d");
    var grad = x.createLinearGradient(0, 0, 0, 836);
    grad.addColorStop(0, T.tafelOben); grad.addColorStop(1, T.tafelUnten);
    x.fillStyle = grad; x.fillRect(0, 0, 512, 836);
    x.strokeStyle = T.tafelRand; x.lineWidth = 2;
    x.strokeRect(18, 18, 476, 800);
    x.strokeStyle = T.tafelEcke; x.lineWidth = 3;
    x.beginPath(); x.moveTo(18, 44); x.lineTo(18, 18); x.lineTo(44, 18); x.stroke();
    x.beginPath(); x.moveTo(494, 792); x.lineTo(494, 818); x.lineTo(468, 818); x.stroke();
    x.font = "500 24px Zaehl, ui-monospace, monospace";
    x.fillStyle = T.tafelNummer; x.textAlign = "left";
    x.fillText("N\\u00BA " + ("0" + (idx + 1)).slice(-2), 46, 82);
    x.fillStyle = T.tafelNeben; x.textAlign = "right";
    x.fillText("24/6", 466, 82);
    /* Das Leuchtfeld: der Zyklus, je Tafel mit eigenem Startpunkt —
       die Tafeln sind das einzige Licht im Raum. */
    for (var g2 = 0; g2 < 6; g2++) {
      for (var r2 = 0; r2 < 13; r2++) {
        var tag = r2 + idx * 3;
        var st = ZYKLUS[(((tag - g2 * 4) % 24) + 24) % 24];
        var px = 46 + g2 * 76, py = 130 + r2 * 50;
        x.save();
        if (st === "-") {
          x.strokeStyle = T.tafelFrei; x.lineWidth = 1.5;
          pfadRund(x, px, py, 40, 44, 20); x.stroke();
        } else {
          x.shadowColor = FARBE[st];
          x.shadowBlur = T.schein ? (st === "F" ? 30 : st === "S" ? 18 : 8) : 0;
          x.fillStyle = FARBE[st];
          pfadRund(x, px, py, 40, 44, 20); x.fill();
        }
        x.restore();
      }
    }
    x.font = "500 20px Zaehl, ui-monospace, monospace";
    x.fillStyle = T.tafelFuss; x.textAlign = "left";
    x.fillText("CENTRIC", 46, 806);
    return b;
  }
  function etikettBild(text) {
    var b = document.createElement("canvas");
    b.width = 1024; b.height = 96;
    var x = b.getContext("2d");
    x.font = "500 46px Lauf, system-ui, sans-serif";
    try { x.letterSpacing = "7px"; } catch (e) {}
    x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = T.etikettSchatten; x.shadowBlur = 12;
    x.fillStyle = T.etikett;
    x.fillText(text.toUpperCase(), 512, 52);
    return b;
  }

  /* ── Der Ring: Tafeln auf den Zylinder gewölbt ── */
  function gewoelbt(w, h, R, k) {
    var g = new THREE.PlaneGeometry(w, h, 28, 1), pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), d = x / R;
      var cx = R * Math.sin(d), cz = R * (1 - Math.cos(d));
      pos.setX(i, x + (cx - x) * k);
      pos.setZ(i, cz * k);
    }
    pos.needsUpdate = true;
    return g;
  }
  function tafelMaterial(map) {
    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: map },
        uAspect: { value: P.kartenB / P.kartenH },
        uBildAspect: { value: 512 / 836 },
        uRadius: { value: P.eckradius },
      },
      transparent: true, extensions: { derivatives: true },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: [
        "#extension GL_OES_standard_derivatives : enable",
        "precision highp float;",
        "uniform sampler2D map; uniform float uAspect, uBildAspect, uRadius; varying vec2 vUv;",
        "float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }",
        "void main(){",
        "  vec2 p = (vUv - 0.5); p.x *= uAspect;",
        "  float d = sdRR(p, vec2(0.5 * uAspect, 0.5), uRadius);",
        "  float aa = max(fwidth(d), 1e-4);",
        "  float innen = 1.0 - smoothstep(0.0, aa, d);",
        "  if(innen < 0.003) discard;",
        "  vec2 s = uAspect > uBildAspect ? vec2(1.0, uBildAspect / uAspect) : vec2(uAspect / uBildAspect, 1.0);",
        "  vec2 iuv = (vUv - 0.5) * s + 0.5;",
        "  gl_FragColor = vec4(texture2D(map, iuv).rgb, innen);",
        "}",
      ].join("\\n"),
    });
  }

  var rondell = new THREE.Group(); szene.add(rondell);
  rondell.rotation.y = 0;            /* Tafel 01 beginnt vorn in der Mitte */
  var tafeln = [], neuzeichnen = [], RING_N = 0;
  (function () {
    var umfang = 2 * Math.PI * P.ringRadius;
    RING_N = Math.max(KARTEN.length, Math.floor(umfang / (P.kartenB + P.luecke)));
    var y = P.hub + P.kartenH / 2;
    var aniso = renderer.capabilities.getMaxAnisotropy();
    for (var i = 0; i < RING_N; i++) {
      var k = i % KARTEN.length;
      var a = (i / RING_N) * Math.PI * 2;
      var g = new THREE.Group();
      g.position.set(Math.sin(a) * P.ringRadius, y, Math.cos(a) * P.ringRadius);
      g.rotation.y = a;
      g.userData = { mass: 1, seite: KARTEN[k].seite };

      var tex = new THREE.CanvasTexture(tafelBild(k));
      tex.anisotropy = aniso;
      var mesh = new THREE.Mesh(
        gewoelbt(P.kartenB, P.kartenH, P.ringRadius, P.woelbung), tafelMaterial(tex));
      mesh.userData.gruppe = g;
      g.add(mesh); tafeln.push(mesh);

      var et = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.206),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(etikettBild(KARTEN[k].titel)),
          transparent: true, opacity: 0.68, depthWrite: false }));
      et.position.set(0, P.kartenH / 2 + P.etikettabstand + 0.1, 0.02);
      g.add(et);

      (function (m, e2, kk) {
        neuzeichnen.push(function () {
          var t2 = new THREE.CanvasTexture(tafelBild(kk)); t2.anisotropy = aniso;
          m.material.uniforms.map.value = t2;
          e2.material.map = new THREE.CanvasTexture(etikettBild(KARTEN[kk].titel));
          e2.material.needsUpdate = true;
        });
      })(mesh, et, k);
      rondell.add(g);
    }
  })();

  /* ── Wasser: Spur, Wellen, echte planare Spiegelung ── */
  var SPUR_N = 14, spur = [];
  for (var si = 0; si < SPUR_N; si++) spur.push(new THREE.Vector3(0, 0, -1000));
  var spiegelRT = new THREE.WebGLRenderTarget(2, 2,
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  var spiegelKam = new THREE.PerspectiveCamera();
  var texMatrix = new THREE.Matrix4();
  var wu = {
    tReflect: { value: spiegelRT.texture }, uTexMatrix: { value: texMatrix },
    uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() },
    uReflBright: { value: T.spiegelhelle },
    uGlanzR: { value: T.glanz[0] }, uGlanzG: { value: T.glanz[1] },
    uGlanzB: { value: T.glanz[2] }, uRipScale: { value: P.wellenmass },
    uRipDistort: { value: P.verzerrung }, uGlint: { value: P.glanz },
    uFresnel: { value: P.fresnel }, uTrail: { value: spur },
    uTief: { value: new THREE.Vector3().fromArray(T.wasserTief) },
  };
  var wasser = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShaderMaterial({
    uniforms: wu,
    vertexShader: "precision highp float; uniform mat4 uTexMatrix; varying vec4 vRefl; varying vec3 vWpos; void main(){ vec4 wp = modelMatrix * vec4(position,1.); vWpos = wp.xyz; vRefl = uTexMatrix * vec4(position,1.); gl_Position = projectionMatrix * viewMatrix * wp; }",
    fragmentShader: [
      "precision highp float;",
      "#define SPUR_N 14",
      "uniform sampler2D tReflect; uniform float uTime, uReflBright, uRipScale, uRipDistort, uGlint, uFresnel;",
      "uniform float uGlanzR, uGlanzG, uGlanzB;",
      "uniform vec3 uCamPos, uTief; uniform vec3 uTrail[SPUR_N];",
      "varying vec4 vRefl; varying vec3 vWpos;",
      "void wave(vec2 p, vec2 d, float k, float w, float a, inout vec2 grad){ grad += a * k * cos(dot(d,p)*k + uTime*w) * d; }",
      "void main(){",
      "  vec2 p = vWpos.xz; vec2 grad = vec2(0.0); float A = uRipScale;",
      "  wave(p, normalize(vec2( 1.0, 0.35)), 1.7, 1.30, 0.045*A, grad);",
      "  wave(p, normalize(vec2(-0.6, 1.0 )), 2.4, 1.05, 0.034*A, grad);",
      "  wave(p, normalize(vec2( 0.4,-1.0 )), 3.6, 1.70, 0.022*A, grad);",
      "  wave(p, normalize(vec2(-1.0,-0.2 )), 5.1, 2.20, 0.013*A, grad);",
      "  float kamm = 0.0;",
      "  for(int i=0;i<SPUR_N;i++){",
      "    vec3 e = uTrail[i]; float alter = uTime - e.z;",
      "    if(alter > 0.0 && alter < 2.4){",
      "      float d = distance(p, e.xy); float rad = alter * 2.1;",
      "      float band = exp(-pow((d - rad) * 3.2, 2.0)); float abkling = (1.0 - alter / 2.4);",
      "      vec2 dir = d > 1e-4 ? (p - e.xy) / d : vec2(0.0);",
      "      grad += dir * (-sin((d - rad) * 9.0) * 9.0 * band * abkling * 0.010 * A);",
      "      kamm += cos((d - rad) * 9.0) * band * abkling;",
      "    }",
      "  }",
      "  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));",
      "  vec3 V = normalize(uCamPos - vWpos);",
      "  vec2 ruv = vRefl.xy / vRefl.w; ruv += N.xz * uRipDistort;",
      "  vec3 spiegel = pow(texture2D(tReflect, clamp(ruv, 0.001, 0.999)).rgb, vec3(2.2)) * uReflBright;",
      "  float fres = 0.02 + 0.95 * pow(1.0 - clamp(dot(V, N), 0.0, 1.0), uFresnel);",
      "  vec3 col = mix(uTief, spiegel, fres);",
      "  vec3 gdir = normalize(vec3(0.2, 1.0, -0.3)); vec3 H = normalize(gdir + V);",
      "  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 200.0);",
      "  col += vec3(uGlanzR, uGlanzG, uGlanzB) * spec * uGlint;",
      "  col += spiegel * max(kamm, 0.0) * 0.09;",
      "  float dist = length(vWpos.xz - uCamPos.xz);",
      "  col = mix(col, uTief, smoothstep(14.0, 50.0, dist));",
      "  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0/2.2)), 1.0);",
      "}",
    ].join("\\n"),
  }));
  wasser.rotation.x = -Math.PI / 2;
  szene.add(wasser);

  /* Gespiegelte Kamera mit schiefem Nahclip — nichts unter dem Wasser
     schlägt in die Spiegelung durch. */
  var _rN = new THREE.Vector3(), _rW = new THREE.Vector3(), _cW = new THREE.Vector3();
  var _rot = new THREE.Matrix4(), _la = new THREE.Vector3(), _vw = new THREE.Vector3();
  var _tg = new THREE.Vector3(), _q = new THREE.Vector4(), _cl = new THREE.Vector4();
  var _pl = new THREE.Plane();
  function spiegelung() {
    _rW.setFromMatrixPosition(wasser.matrixWorld);
    _cW.setFromMatrixPosition(kamera.matrixWorld);
    _rot.extractRotation(wasser.matrixWorld); _rN.set(0, 0, 1).applyMatrix4(_rot);
    _vw.subVectors(_rW, _cW); if (_vw.dot(_rN) > 0) return;
    _vw.reflect(_rN).negate().add(_rW);
    _rot.extractRotation(kamera.matrixWorld);
    _la.set(0, 0, -1).applyMatrix4(_rot).add(_cW);
    _tg.subVectors(_rW, _la).reflect(_rN).negate().add(_rW);
    spiegelKam.position.copy(_vw);
    spiegelKam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_rN);
    spiegelKam.lookAt(_tg);
    spiegelKam.far = kamera.far; spiegelKam.updateMatrixWorld();
    spiegelKam.projectionMatrix.copy(kamera.projectionMatrix);
    texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMatrix.multiply(spiegelKam.projectionMatrix);
    texMatrix.multiply(spiegelKam.matrixWorldInverse);
    texMatrix.multiply(wasser.matrixWorld);
    _pl.setFromNormalAndCoplanarPoint(_rN, _rW).applyMatrix4(spiegelKam.matrixWorldInverse);
    _cl.set(_pl.normal.x, _pl.normal.y, _pl.normal.z, _pl.constant);
    var M = spiegelKam.projectionMatrix;
    _q.x = (Math.sign(_cl.x) + M.elements[8]) / M.elements[0];
    _q.y = (Math.sign(_cl.y) + M.elements[9]) / M.elements[5];
    _q.z = -1.0; _q.w = (1.0 + M.elements[10]) / M.elements[14];
    _cl.multiplyScalar(2.0 / _cl.dot(_q));
    M.elements[2] = _cl.x; M.elements[6] = _cl.y;
    M.elements[10] = _cl.z + 1.0; M.elements[14] = _cl.w;
    wasser.visible = false;
    var vorher = renderer.getRenderTarget();
    renderer.setRenderTarget(spiegelRT); renderer.clear();
    renderer.render(szene, spiegelKam);
    renderer.setRenderTarget(vorher);
    wasser.visible = true;
  }

  /* ── Eingaben: Ziehen (mit Nachlauf), Heben, Wellenspur, Öffnen ── */
  var zieht = false, letztesX = 0, drall = 0, zugweite = 0;
  var mausZiel = new THREE.Vector2(), maus = new THREE.Vector2(), ndc = new THREE.Vector2();
  var strahl = new THREE.Raycaster();
  var schwebt = null, wach = 0;
  function anstossen(n) { wach = Math.max(wach, n || 2); }
  function ndcSetzen(e, ziel) {
    var r = leinwand.getBoundingClientRect();
    ziel.set(((e.clientX - r.left) / r.width) * 2 - 1,
             -(((e.clientY - r.top) / r.height) * 2 - 1));
  }
  var _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  function zeigerAufWasser(e) {
    ndcSetzen(e, ndc); strahl.setFromCamera(ndc, kamera);
    _ro.copy(strahl.ray.origin); _rd.copy(strahl.ray.direction);
    if (_rd.y > -1e-4) return null;
    var t = -_ro.y / _rd.y;
    if (t <= 0 || t > 80) return null;
    return { x: _ro.x + _rd.x * t, z: _ro.z + _rd.z * t };
  }
  var spurKopf = 0, lRx = 1e9, lRz = 1e9;
  function tropfen(e) {
    if (ruhig) return;
    var w = zeigerAufWasser(e); if (!w) return;
    if (Math.hypot(w.x - lRx, w.z - lRz) < 0.14) return;
    spur[spurKopf].set(w.x, w.z, wu.uTime.value);
    spurKopf = (spurKopf + 1) % SPUR_N; lRx = w.x; lRz = w.z;
  }
  function oeffnen(seite) {
    if (document.querySelector(".seite")) location.hash = "#" + seite;
    else location.href = seite;
  }
  leinwand.addEventListener("pointerdown", function (e) {
    zieht = true; zugweite = 0; letztesX = e.clientX; drall = 0;
    leinwand.classList.add("-zieht"); leinwand.setPointerCapture(e.pointerId);
    tropfen(e); document.body.classList.add("-gezogen"); anstossen(2);
  });
  leinwand.addEventListener("pointermove", function (e) {
    ndcSetzen(e, mausZiel); tropfen(e); anstossen(2);
    if (zieht) {
      var dx = e.clientX - letztesX; letztesX = e.clientX; zugweite += Math.abs(dx);
      var d = dx * P.zugtempo; rondell.rotation.y += d; drall = d;
    }
  });
  leinwand.addEventListener("pointerup", function () {
    if (zieht && zugweite < 6 && schwebt) oeffnen(schwebt.userData.seite);
    zieht = false; leinwand.classList.remove("-zieht");
  });
  leinwand.addEventListener("pointercancel", function () {
    zieht = false; leinwand.classList.remove("-zieht");
  });
  function schwebePruefen() {
    if (zieht) { schwebt = null; return; }
    strahl.setFromCamera(mausZiel, kamera);
    var traf = strahl.intersectObjects(tafeln, false)[0];
    schwebt = traf ? traf.object.userData.gruppe : null;
    leinwand.style.cursor = schwebt ? "pointer" : "";
  }

  /* ── Fokuszeile: verfolgt die Tafel vorn in der Mitte ── */
  var fokusName = document.getElementById("fokus-name");
  var fokusNum = document.getElementById("fokus-num");
  var fokusLink = document.getElementById("fokus-link");
  var punkteWrap = document.getElementById("fokus-punkte");
  document.getElementById("fokus-total").textContent = ("0" + KARTEN.length).slice(-2);
  var punkte = KARTEN.map(function () {
    var d = document.createElement("i"); punkteWrap.appendChild(d); return d;
  });
  var fokusIdx = -1;
  function fokusAngleichen() {
    var platz = Math.round((-rondell.rotation.y) / (2 * Math.PI) * RING_N);
    platz = ((platz % RING_N) + RING_N) % RING_N;
    var idx = platz % KARTEN.length;
    if (idx === fokusIdx) return;
    fokusIdx = idx;
    fokusName.textContent = KARTEN[idx].titel;
    fokusNum.textContent = ("0" + (idx + 1)).slice(-2);
    fokusLink.href = KARTEN[idx].seite;
    for (var i = 0; i < punkte.length; i++) punkte[i].classList.toggle("-an", i === idx);
    fokusName.classList.remove("-tausch"); void fokusName.offsetWidth;
    fokusName.classList.add("-tausch");
  }

  /* ── Maße, Sichtbarkeit, Schleife ── */
  var sichtbar = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      sichtbar = es[0].isIntersecting; if (sichtbar) anstossen(3);
    }).observe(abschnitt);
  }
  function messen() {
    var r = abschnitt.getBoundingClientRect();
    var w = Math.max(2, r.width | 0), h = Math.max(2, r.height | 0);
    renderer.setSize(w, h, false);
    kamera.aspect = w / h; kamera.updateProjectionMatrix();
    /* Von außen hängt die Bildeinstellung am Seitenverhältnis: auf einem
       hochkant gehaltenen Telefon ist der waagerechte Bildwinkel schmal,
       und die Trommel würde angeschnitten. Der Abstand wächst deshalb so
       weit, dass ihr Umriss hineinpasst — und nie so weit, dass die
       Kamera in die Trommel geriete. */
    var halbSenkr = P.fov * Math.PI / 360;
    var halbWaagr = Math.atan(Math.tan(halbSenkr) * kamera.aspect);
    var noetig = P.ringRadius / Math.sin(Math.max(0.2, halbWaagr * 0.86));
    /* Nach oben gedeckelt: auf einem hochkant gehaltenen Telefon müsste die
       Kamera sonst über fünfzig Einheiten zurück, damit der ganze Umriss
       hineinpasst — die Tafeln wären winzig. Dort ist Anschneiden besser
       als Schrumpfen. */
    kamera.position.z = Math.min(P.ringRadius + 14,
                                 Math.max(P.ringRadius + 5, noetig));
    kamera.lookAt(blick);
    spiegelRT.setSize(Math.max(2, Math.floor(w * DPR)), Math.max(2, Math.floor(h * DPR)));
    anstossen(3);
  }
  if ("ResizeObserver" in window) new ResizeObserver(messen).observe(abschnitt);
  messen();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      for (var i = 0; i < neuzeichnen.length; i++) neuzeichnen[i]();
      anstossen(3);
    });
  }

  var vorherT = performance.now(), startT = vorherT;
  function bild() {
    requestAnimationFrame(bild);
    var jetzt = performance.now();
    var dt = Math.min((jetzt - vorherT) / 1000, 0.05);
    vorherT = jetzt;
    if (!sichtbar) return;
    if (ruhig && wach <= 0) return;
    if (wach > 0) wach--;
    if (!ruhig) {
      if (!zieht) { rondell.rotation.y += drall + P.eigendreh * dt; drall *= P.nachlauf; }
      wu.uTime.value = (jetzt - startT) / 1000;
    } else if (!zieht) { drall = 0; }
    schwebePruefen(); fokusAngleichen();
    for (var i = 0; i < rondell.children.length; i++) {
      var g = rondell.children[i];
      var ziel = (g === schwebt) ? P.hebung : 1;
      g.userData.mass += (ziel - g.userData.mass) * Math.min(1, dt * 12);
      g.scale.setScalar(g.userData.mass);
    }
    maus.lerp(mausZiel, 0.06);
    kamera.position.x = maus.x * 0.35;
    kamera.position.y = P.augenhoehe + maus.y * 0.18;
    kamera.lookAt(blick);
    wu.uCamPos.value.copy(kamera.position);
    spiegelung();
    renderer.render(szene, kamera);
  }
  anstossen(6);
  bild();
})();
"""


# Die Farbtöne der Halle. Nacht ist die ausgelieferte Fassung; Hell
# dient der Vorschau, wenn alle dunklen Flächen entfallen.
TOENE_NACHT = {"raum": "#001619", "himmelUnten": [0, 0, 0], "himmelOben": [0.004, 0.055, 0.062], "sterne": 8031637, "sterneDeckung": 0.55, "wasserTief": [0, 0, 0], "spiegelhelle": 0.25, "glanz": [0.12, 0.6, 0.62], "schicht": {"F": "#50E8F4", "S": "#02A0A0", "N": "#316C81"}, "schein": True, "tafelOben": "#0B1E24", "tafelUnten": "#001619", "tafelRand": "rgba(157,179,188,.22)", "tafelEcke": "rgba(2,160,160,.85)", "tafelNummer": "rgba(80,232,244,.9)", "tafelNeben": "rgba(159,178,185,.6)", "tafelFrei": "rgba(30,49,56,.95)", "tafelFuss": "rgba(159,178,185,.5)", "etikett": "#EDF2F4", "etikettSchatten": "rgba(0,0,0,.7)"}

TOENE_HELL = {"raum": "#E1EAEE", "himmelUnten": [0.6654, 0.7605, 0.7991], "himmelOben": [0.8469, 0.8879, 0.9047], "sterne": 10335164, "sterneDeckung": 0.3, "wasserTief": [0.7157, 0.7991, 0.8308], "spiegelhelle": 0.92, "glanz": [0.9, 0.97, 1.0], "schicht": {"F": "#02A0A0", "S": "#017070", "N": "#023441"}, "schein": False, "tafelOben": "#FFFFFF", "tafelUnten": "#E4EDF0", "tafelRand": "rgba(7,19,23,.16)", "tafelEcke": "rgba(1,112,112,.75)", "tafelNummer": "rgba(1,112,112,.95)", "tafelNeben": "rgba(91,107,114,.65)", "tafelFrei": "rgba(188,205,212,.95)", "tafelFuss": "rgba(91,107,114,.55)", "etikett": "#071317", "etikettSchatten": "rgba(255,255,255,.85)"}


def halle_daten(hell=False):
    import json
    karten = json.dumps(
        [{"titel": t, "seite": h} for h, t in HALLE_KARTEN], ensure_ascii=False)
    zyklus = "[" + ",".join('"%s"' % x for x in CYCLE) + "]"
    toene = json.dumps(TOENE_HELL if hell else TOENE_NACHT, ensure_ascii=False)
    return (HALLE_JS.replace("__KARTEN__", karten).replace("__ZYKLUS__", zyklus)
            .replace("__TOENE__", toene))


HALLE_KARTEN = [
    ("funktionen.html", "Funktionen"), ("branchen.html", "Branchen"),
    ("preise.html", "Preise"), ("sicherheit.html", "Sicherheit"),
    ("wissen.html", "Wissen"), ("ueber-uns.html", "Über uns"),
    ("kontakt.html", "Kontakt"), ("faq.html", "Fragen"),
]


CSS_HELL = """
/* ══════════════════════════════════════════════════════════════════════
   VORSCHAU: ALLES HELL

   Ein Aufsatz, kein Umbau. Er hebt die Rolle der Seitenleiste auf — die
   Klasse .dunkel bekommt dieselben Rollen mit hellen Werten, und damit
   wechseln Halle, Midnight-Bänder, Rechnerausgabe, Aufrufband und Fuß
   auf Papier. Wo Dunkel getragen hat, trägt jetzt der Abstand zwischen
   Papier und Sea Salt; wo Leuchten getragen hat, trägt der Akzent.
   ══════════════════════════════════════════════════════════════════════ */
.dunkel{
  --grund:#E1EAEE; --flaeche:#FFFFFF; --still:#EDF2F4;
  --text:#071317; --text-dim:#3D4E55; --text-schwach:#5B6B72;
  --linie:#BCCDD4; --linie-weich:#CBDAE0; --linie-stark:#9DB3BC;
  --akzent:#017070; --akzent-hell:#028E8E; --akzent-flaeche:#DFF0F0;
  --auf-akzent:#FFFFFF;
  --fruh:#02A0A0; --spat:#017070; --nachtm:#023441; --frei:#CBDAE0;
  --leucht:none;
}

/* Die Halle wird ein heller Raum. Das Leuchten der Tafeln entfällt —
   auf Papier gibt es nichts zu überstrahlen; die Tafeln stehen als
   gedruckte Bögen über stillem, blassem Wasser. */
.halle{background:radial-gradient(120% 70% at 50% 0%, #F4F8F9 0%, #E1EAEE 64%), #E1EAEE}
.halle .vignette{background:
  radial-gradient(130% 90% at 50% 42%, transparent 54%, rgba(93,116,126,.30) 100%),
  linear-gradient(to bottom, rgba(255,255,255,.55) 0%, transparent 24%,
    transparent 58%, rgba(93,116,126,.26) 100%)}
.halle .mast h1,.halle .name,.halle .zaehler .num{text-shadow:none}
.halle .punkte i.-an{box-shadow:none}
.halle .rahmen{box-shadow:inset 0 0 60px rgba(157,179,188,.28)}

/* Der Rechner zeigt sein Ergebnis jetzt auf getöntem statt dunklem Grund */
.rechner-aus{background:var(--akzent-flaeche)}
.ra-summe{text-shadow:none}

/* Das Aufrufband bleibt der letzte Akzent der Seite — als Fläche in
   accentLight statt als Midnight-Block */
.sect-cta{--grund:#DFF0F0; --flaeche:#FFFFFF; --linie:#B6D9D9; --linie-stark:#8FC4C4}
/* Der eingesenkte Schatten der Karte war fast schwarz — er sollte den Block
   in Midnight vertiefen. Auf der hellen Fläche wird daraus ein grauer
   Schleier; hier senkt ein Ton aus derselben Familie die Karte ein. */
.cta{box-shadow:inset 0 0 70px rgba(143,196,196,.32)}

/* Der Fuß trägt Sea Salt und eine Kante nach oben, damit er sich vom
   Inhalt löst, ohne dunkel zu werden */
.fuss{background:#E1EAEE; color:var(--text-dim); border-top:1px solid var(--linie-stark)}

/* Ein Hinweisband, damit die Vorschau nicht mit der Seite verwechselt wird */
.vorschau-band{position:sticky; top:0; z-index:70; background:var(--akzent);
  color:#FFFFFF; font-family:var(--zaehl); font-size:.72rem; letter-spacing:.14em;
  text-transform:uppercase; text-align:center; padding:9px 16px}
.kopf{top:35px}
"""

FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
           '<rect width="100" height="100" fill="#EDF2F4"/>'
           '<rect x="10" y="16" width="80" height="20" rx="10" fill="#071317"/>'
           '<rect x="10" y="40" width="80" height="20" rx="10" fill="#017070"/>'
           '<rect x="10" y="64" width="80" height="20" rx="10" fill="#071317"/></svg>')


# ════════════════════════════════════════════════════════════════════════════
# SCHREIBEN
# ════════════════════════════════════════════════════════════════════════════

def js_daten():
    """Die Zahlen aus den Produktdaten in das Skript einsetzen.

    Nur, was der Rechner im Browser wirklich braucht — Namen, Kontingente
    und Beträge. Leistungstexte und Claims bleiben draußen; sie stehen im
    HTML und müssen nicht zweimal ausgeliefert werden.
    """
    zyklus = "[" + ",".join('"%s"' % x for x in CYCLE) + "]"
    stufen = "[" + ",".join(
        '{id:"%s",name:"%s",grund:%d,planerInkl:%d,standorteInkl:%d,paketeFrei:%d}'
        % (s["id"], s["name"], s["grund"], s["planer_inkl"],
           s["standorte_inkl"], s["pakete_frei"])
        for s in STUFEN) + "]"
    baender = "[" + ",".join(
        '{bis:%s,zuschlag:%d}' % ("null" if bis is None else bis, zu)
        for bis, zu, _ in STANDORT_BAENDER) + "]"
    return (JS.replace("__STUFEN__", stufen)
              .replace("__BAENDER__", baender)
              .replace("__ZUSATZ_PLANER__", str(ZUSATZ_PLANER))
              .replace("__KONTAKT_AB_PLANER__", str(KONTAKT_AB_PLANER))
              .replace("__KONTAKT_AB_STANDORTE__", str(KONTAKT_AB_ZUSCHLAGSSTANDORTE))
              .replace("__ZYKLUS__", zyklus))


def einzeldatei(hell=False):
    """Die gesamte Website in einer Datei — zum Doppelklicken und zum Teilen.

    Jede Seite wird zu einem Abschnitt; ein kleiner Router im Browser blendet
    um, wenn ein interner Verweis angeklickt wird. Inhalt, Gestaltung und
    Verhalten sind identisch mit der mehrseitigen Fassung.
    """
    reihenfolge = ["index.html", "funktionen.html", "branchen.html", "preise.html",
                   "sicherheit.html", "wissen.html", "wissen-rotation.html",
                   "ueber-uns.html", "kontakt.html", "faq.html", "impressum.html",
                   "datenschutz.html", "agb.html", "barrierefreiheit.html"]
    aktiv = ' aria-current="page"'
    nav = "".join('<a href="%s">%s</a>' % (h, t) for h, t in NAV)
    cols = "".join(
        '<div><h2>' + name + '</h2><ul>' +
        "".join(f'<li><a href="{h}">{t}</a></li>' for h, t in links) + '</ul></div>'
        for name, links in FOOTER)

    seitenmarkup = "".join(
        f'<div class="seite" data-seite="{s}" data-titel="{seiten[s]["title"]}" hidden>'
        f'{app_verweise(seiten[s]["body"])}</div>' for s in reihenfolge)

    router = """
/* ── Router: eine Datei, vierzehn Seiten ── */
(function () {
  var seiten = Array.prototype.slice.call(document.querySelectorAll(".seite"));
  var links = Array.prototype.slice.call(document.querySelectorAll('a[href$=".html"]'));

  function zeige(slug, anker, scrollen) {
    var treffer = null;
    seiten.forEach(function (s) {
      var ist = s.dataset.seite === slug;
      s.hidden = !ist;
      if (ist) treffer = s;
    });
    if (!treffer) { zeige("index.html", "", scrollen); return; }
    document.title = treffer.dataset.titel;
    links.forEach(function (a) {
      var ziel = a.getAttribute("href").split("#")[0];
      if (a.closest(".nav")) {
        if (ziel === slug) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }
    });
    var nav = document.getElementById("nav");
    if (nav) nav.classList.remove("offen");
    if (!scrollen) return;
    var el = anker ? treffer.querySelector("#" + CSS.escape(anker)) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo(0, 0);
  }

  function ausHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    var teile = h.split("#");
    var slug = teile[0] || "index.html";
    if (slug.indexOf(".html") === -1) slug = "index.html";
    zeige(slug, teile[1] || "", true);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href$=".html"], a[href*=".html#"]');
    if (!a || a.target === "_blank") return;
    var href = a.getAttribute("href");
    if (!href || /^(https?:|mailto:|tel:)/.test(href)) return;
    e.preventDefault();
    var teile = href.split("#");
    location.hash = "#" + teile[0] + (teile[1] ? "#" + teile[1] : "");
    zeige(teile[0], teile[1] || "", true);
  });

  window.addEventListener("hashchange", ausHash);
  if (location.hash) ausHash(); else zeige("index.html", "", false);
})();
"""

    # Ohne diese Angabe rät der Browser beim Öffnen der Datei von der
    # Platte, und die Umlaute brechen. Im Artefakt liefert die Hülle den
    # Kopf; hier muss die Datei für sich stehen.
    html = f"""<meta charset="utf-8">
<title>{"CENTRIC Hellfassung" if hell else "CENTRIC — Dienstplanung für rotierende Schichtbetriebe"}</title>
<meta name="description" content="{seiten['index.html']['desc']}">
<style>
{schrift_css(True)}

{CSS.strip()}

/* Einzeldatei: Seiten liegen übereinander, der Router blendet um. */
.seite[hidden]{{display:none}}
{CSS_HELL if hell else ''}
</style>

{'<p class="vorschau-band">Vorschau · alles hell · nicht die ausgelieferte Fassung</p>' if hell else ''}
<a class="skip" href="#inhalt">Zum Inhalt springen</a>

<header class="kopf">
  <div class="wrap kopf-in">
    <a class="marke" href="index.html" aria-label="CENTRIC — Startseite">{marke(24)}</a>
    <nav class="nav" id="nav" aria-label="Hauptnavigation">{nav}</nav>
    <div class="kopf-akt">
      <a class="btn btn-ghost nur-breit" href="{APP}/#anmelden">Anmelden</a>
      <a class="btn btn-primary" href="{APP}/#testen">Kostenlos testen</a>
      <button class="burger" id="burger" aria-expanded="false" aria-controls="nav"
              aria-label="Navigation öffnen"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>

<main id="inhalt">{seitenmarkup}</main>

<footer class="fuss">
  <div class="wrap">
    <div class="fuss-oben">
      <div class="fuss-marke">
        {marke(30)}
        <p>Dienstplanung für rotierende Schichtbetriebe. Der Plan wird gerechnet,
           nicht ausgerollt — vorwärts wie rückwärts, ohne Jahresgrenze.</p>
        <p class="fuss-adr">Centric UG (haftungsbeschränkt) · Berliner Straße 49 · 64839 Münster<br>
           <a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></p>
      </div>
      <div class="fuss-spalten">{cols}</div>
    </div>
    <div class="fuss-unten">
      <p>© 2026 Centric UG (haftungsbeschränkt). Alle Rechte vorbehalten.</p>
      <p class="fuss-hinweis">Ohne Tracker, ohne Werbe-Cookies. Server in der EU.</p>
    </div>
  </div>
</footer>

<script>
{js_daten()}
{router}
</script>
<script>
{open(os.path.join(ASSETS_QUELLE, "vendor", "three.min.js"), encoding="utf-8").read()}
</script>
<script>
{halle_daten(hell)}
</script>
"""
    ziel = os.path.join(OUT, "centric-hell-vorschau.html" if hell
                        else "centric-website-einzeldatei.html")
    return schreibe(ziel, html)


HILFE = """CENTRIC — Website-Generator

  python build.py                 die Website nach dist/ — das, was ausgeliefert wird
  python build.py --einzeldatei   zusätzlich die ganze Website in einer Datei
  python build.py --hell          nur die helle Vorschau (Einzeldatei, alles hell)

Umgebung: CENTRIC_APP, CENTRIC_WEBSITE, CENTRIC_OUT (siehe README.md).
"""


def main():
    """Ohne Argument die Website — und nichts weiter.

    Die Einzeldatei ist ein Werkzeug zum Zeigen und Prüfen, kein Teil der
    Auslieferung: Sie wiegt allein mehr als die ganze Website und ist von
    keiner Seite verlinkt. Wer sie braucht, ruft sie ausdrücklich ab.
    """
    if "--hilfe" in sys.argv or "--help" in sys.argv or "-h" in sys.argv:
        print(HILFE)
        return

    os.makedirs(OUT, exist_ok=True)
    if "--hell" in sys.argv:
        ziel = einzeldatei(hell=True)
        print(f"Vorschau (alles hell): {ziel} "
              f"({os.path.getsize(ziel)/1024:.0f} kB)")
        return
    os.makedirs(ASSETS, exist_ok=True)

    # Schriften und Drei.js mit ins Ergebnis — dist/ soll ohne die Quelle
    # auskommen. Die Lizenztexte reisen mit, sie gehören zu den Dateien.
    for ordner in ("fonts", "vendor"):
        shutil.copytree(os.path.join(ASSETS_QUELLE, ordner),
                        os.path.join(ASSETS, ordner), dirs_exist_ok=True)

    schreibe(os.path.join(ASSETS, "style.css"),
             schrift_css(False) + "\n\n" + CSS.strip() + "\n")
    schreibe(os.path.join(ASSETS, "site.js"), js_daten())
    schreibe(os.path.join(ASSETS, "halle.js"), halle_daten())
    schreibe(os.path.join(ASSETS, "favicon.svg"), FAVICON)

    for slug, s in seiten.items():
        html = layout(slug, s["title"], s["desc"], s["body"])
        schreibe(os.path.join(OUT, slug), html)

    # Sitemap und robots
    urls = "".join(f"  <url><loc>{WEBSITE}/{s}</loc></url>\n"
                   for s in seiten if s != "404.html")
    schreibe(os.path.join(OUT, "sitemap.xml"),
             '<?xml version="1.0" encoding="UTF-8"?>\n'
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
             f'{urls}</urlset>\n')
    schreibe(os.path.join(OUT, "robots.txt"),
             f"User-agent: *\nAllow: /\nSitemap: {WEBSITE}/sitemap.xml\n")

    print(f"{len(seiten)} Seiten erzeugt in {OUT}")
    for s in sorted(seiten):
        print("  ·", s)

    if "--einzeldatei" in sys.argv:
        einzel = einzeldatei()
        print(f"Einzeldatei: {einzel} "
              f"({os.path.getsize(einzel)/1024:.0f} kB)")


if __name__ == "__main__":
    main()

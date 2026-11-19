# Technischer Datenflussbericht (lesend)

**ENTWURF.** Stand `087fbe9`, 2026-11-07. Quelle ausschließlich Repository (Code, `.env.example`, Doku). Kein Zugriff auf VPS, Produktion, Caddy-Live-Konfiguration oder Anbieterkonten. Es werden nur ENV-**Namen** und Code-**Vorgaben** genannt, keine Werte.

## 1. Übersicht

```
Browser/PWA ──TLS──> Caddy (VPS, Anbieter betreibt) ──Docker-Netz "proxy"──> centric-dp-web:3000 (Node)
   │  Gerätespeicher: SW-Cache /api/bestand, Stempelpuffer, Sitzungsmerkmal          │
   │                                                                                 ├─ Ablage: Dateien unter CENTRIC_DATEN (VPS-Volume)
   │                                                                                 ├─ optional Resend-API (Mail)
   │                                                                                 ├─ optional Web-Push-Dienste der Browserhersteller
   │                                                                                 ├─ optional Redis-REST (Bremse)
   │                                                                                 ├─ optional Alarm-Webhook
   │                                                                                 └─ Intelligence: nicht verdrahtet, kein Netzcode
   └─ Host-Cron (außerhalb Container): restic → Außer-Haus-Ziel (Ziel offen)
```

## 2. Flüsse im Einzelnen

| Fluss | Daten | Empfänger / Ort | Schalter (Vorgabe im Code) | Beleg | Offen |
|---|---|---|---|---|---|
| Website (Marketing) | Aufrufdaten | nicht im Repo (Quellen extern) | — | `marketing/` enthält nur Texte/Material | O-08: Hosting, Cookies, Analytics, Formulare |
| App-Auslieferung | Aufrufdaten, statische Dateien, Schriften selbst ausgeliefert | Caddy → Node | — | `deploy/caddy/Caddyfile.vorlage`, `index.html` (keine Fremd-URLs gefunden) | Live-Caddyfile |
| Caddy-Zugriffslog | Roh-IP, Zeit, URL, UA (falls aktiv) | VPS | in Vorlage **kein** `log`-Block | Caddyfile.vorlage (Schluss) | Live-Stand, Rotation (O-07) |
| Docker-Containerlog | stdout/stderr des Servers; laut Suche keine Klartext-IP, URLs ohne Abfrage, Feed-Geheimnis geschwärzt | VPS, `json-file` 3 × 10 MB | — | `deploy/compose.yml:78-82`, `server/lib/schutz.mjs:1012-1022`, `server.mjs:447` | Host-Logrotation/Journal |
| Herkunftsadresse | IP aus XFF nur von vertrauten Proxys | Speicher nur als 16-Hex-Kürzel (SHA-256 **ohne** Geheimnis) in Bremse und Spur | `CENTRIC_VERTRAUTE_PROXYS` (leer = niemandem trauen) | `schutz.mjs:23, 426, 485-487, 572-614, 1065` | Kürzel ist rückführbar (T-04) |
| Protokoll „Spur“ | Art, Kennung, Rolle, Personenkennung, Tag, IP-Kürzel | Ablage `centric-spur` | Löschung nach 30 Tagen nur bei `CENTRIC_DATENSCHUTZLAUF=an`, sonst sporadisch beim Lesen der Lage | `schutz.mjs:1010, 1136-1145`, `datenschutzlauf.mjs:228`, `server/funktionen/lage.mjs:27` | Modusentscheidung |
| Anmeldung/Sitzung | Code-HMAC (Pfeffer), Sitzungs-Hash, Rolle | Ablage `centric-sitzungen` | 12 h fest / 30 min Ruhe, Betreiber 2 h | `sitzungen.mjs:64-70`, `codes.mjs` | — |
| Zweiter Faktor | TOTP-Geheimnis AES-256-GCM (Schlüssel aus Pfeffer), Wiederherstellungscodes als HMAC | Ablage | `CENTRIC_ZWEIFAKTOR_PFLICHT` (aus), `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT` (in Produktion immer Pflicht) | `zweifaktor.mjs:1-37`, `betreiber-zweifaktor.mjs:44-55` | Kundenrollen ohne 2FA |
| Betriebsbestand | Personal-, Plan-, Zeit-, Abwesenheits-, Schutz-, Moduldaten | Dateiablage auf VPS, keine App-Verschlüsselung ruhender Daten | `CENTRIC_DATEN`, `CENTRIC_ABLAGE` | `rechtliches/auftragsverarbeitung.md:223-227` (Aussage), `server/lib/ablage.mjs` | Datenträgerverschlüsselung IONOS (O-06) |
| Geo-Stempeln | Rohkoordinate nur in der Anfrage; gespeichert Status, Grund, gerundete Entfernung, Genauigkeit, Referenzort | Server | je Betrieb `einstellungen.geoPruefung` (Vorgabe aus) | `geo.mjs:18-21, 309-317` | — |
| Gerät: Stempelpuffer | Stempelereignis inkl. **Rohkoordinate** bis Quittung/Ablehnung, danach geleert; bestätigte Ereignisse 24 h | IndexedDB, Rückfall localStorage | nur wenn Geo an | `src/stempelpuffer.js:23-27, 117-133, 191, 199, 235` | Transparenztext (T-10) |
| Gerät: Service Worker | letzte `/api/bestand`-Antwort (rollengefiltert), an Sitzung gebunden, beim Abmelden gelöscht | Cache Storage | — | `public/sw.js:56, 112, 187-210` | §-25-Inventur (T-10) |
| Gerät: Sitzungsmerkmal | Bearer-Token | sessionStorage; localStorage nur bei „angemeldet bleiben“ | Nutzerwahl | `src/speicher.js:76-81` | §-25-Inventur |
| E-Mail | Empfänger, Betreff, Text | Resend-API (USA) | `RESEND_API_KEY`, `CENTRIC_ABSENDER` (ohne Schlüssel Trockenlauf); `CENTRIC_ZUSTELL_*` | `server/lib/post.mjs:47-78` | Aktivierung/AVV (O-12); IONOS-SMTP **nicht** implementiert |
| Web Push | Push-Endpunkt, verschlüsselter Inhalt | Push-Dienste: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com` (+ `CENTRIC_PUSH_HOSTS`) | `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_KONTAKT` | `server/lib/pushziel.mjs:47-53`, `server/lib/webpush.mjs:52-64` | Drittlandbezug in Texten (T-03) |
| Zustellprotokoll | Zustellversuche | Ablage | `CENTRIC_ZUSTELLPROTOKOLL_TAGE` (30), wirkt nur bei Datenschutzlauf `an` | `server.mjs:527-539` | — |
| Bremse extern | Zählerschlüssel (Kürzel) | Redis-REST (Upstash-kompatibel), falls gesetzt | `REDIS_REST_URL`, `REDIS_REST_TOKEN` (ohne: Ablage) | `.env.example:153-156` | Anbieter/Region falls genutzt |
| Alarm | Betriebsmeldungen | Webhook-Ziel | `CENTRIC_ALARM_WEBHOOK` (aus), `CENTRIC_UEBERWACHUNG` (an) | `.env.example:79-99` | Dienst/Inhalt (O-16) |
| In-App-Sicherungen | Vollkopie des Raumbestands | Ablage `sicherung:<raum>:…` | Ausdünnen bei Anlage: 20 neueste + je Tag eine (ohne Höchstalter); Plan 14 T täglich / 90 T wöchentlich / max. 90 T nur bei `an` | `sicherungen.mjs:97-117`, `datenschutzlauf.mjs:70, 200-212` | Z-03 |
| Außer-Haus-Sicherung | Ablage-Abbild, restic-verschlüsselt | Ziel offen (Empfehlung Hetzner Storage Box oder S3 EU) | Host-Cron, `RESTIC_*`; Retention `--keep-daily 7 --keep-weekly 4 --keep-monthly 12`; Status `CENTRIC_SICHERUNG_STATUS` | `docs/BETRIEB-SICHERUNG.md:7, 25`, `deploy/sicherung/` | Ziel, AVV, Restore auf VPS (B4/B5), Widerspruch zu 60-Tage-Löschung (Z-02) |
| Intelligence | geplant: minimiertes Faktenpaket | keiner (Attrappe; Live-Stumpf wirft) | Namen nur im Code, nicht verdrahtet: `CENTRIC_KI_MODUS`, `CENTRIC_KI_ANBIETER_LIVE`, `CENTRIC_KI_ANBIETER_SCHLUESSEL` (alle aus) | `server/lib/intelligence/gateway/schalter.mjs:13-17`, `anbieter-live.mjs:24-26` | E-25/E-26 |
| Löschläufe | — | Server, täglich (Start + 1 min, dann 24 h) | `CENTRIC_AUFRAEUMEN` (an; `aus` schaltet auch Datenschutzlauf ab), `CENTRIC_DATENSCHUTZLAUF` (`vorschau`) | `server.mjs:493-548`, `aufbewahrung.mjs:167-173` | Modus `an` erst nach Freigabe |
| Öffentliche Zugänge | Registrierung, Selbststart, Demo | Server | `CENTRIC_PUBLIC_REGISTRATION`, `CENTRIC_SELBSTSTART`, `CENTRIC_DEMO` (alle aus) | `.env.example:56-105` | — |
| Hosting | gesamter Bestand | IONOS SE, VPS, laut Doku Spanien; Arsys Internet S.L.U. | — | `rechtliches/auftragsverarbeitung.md:356-371` | Vertrag/Region belegen (O-06) |

## 3. Kernaussagen
1. Kein Drittlandfluss in der Code-Vorgabe; jeder externe Empfänger hängt an einem ENV-Schalter oder an Host-Konfiguration.
2. Roh-IP kann nur außerhalb der Anwendung entstehen (Caddy-Log, Provider, Host); dort fehlt der Nachweis.
3. Das IP-Kürzel der Anwendung ist pseudonym, nicht anonym, und mit geringem Aufwand rückführbar.
4. Löschzusagen hängen an `CENTRIC_DATENSCHUTZLAUF=an` (Fristen, Spur, Sicherungsplan) bzw. an der restic-Retention — beides im Repo nicht als aktiv belegt.

# syntax=docker/dockerfile:1
# =====================================================================
#  CENTRIC — Container-Bau in drei Stufen
#
#  1. bauen     Oberfläche mit Vite übersetzen (braucht alle Werkzeuge)
#  2. laufzeit  nur die Pakete, die der Server zur Laufzeit braucht
#  3. bild      das schlanke Ergebnis: Node 22, dist/, Funktionen, Server
#
#  Bauen:  docker build \
#            --build-arg VITE_ANWENDUNG_URL=https://app.centric-dienstplanung.de \
#            --build-arg VITE_KONTAKT_MAIL=info@centric-dienstplanung.de \
#            -t centric-dp .
#
#  VITE_*-Werte werden beim Bauen in die Oberfläche eingesetzt und sind
#  nicht geheim. Geheimnisse kommen NIE hier hinein, sondern zur Laufzeit
#  über die Umgebung (siehe .env.example).
#
#  Basisbild per Digest (WP-32). Ein Tag wie `node:22-alpine` zeigt jede
#  Woche auf ein anderes Bild — zwei Bauten desselben Commits konnten so
#  verschiedene Systempakete enthalten, und niemand sah es. Der Digest ist
#  der Inhalt selbst; das Tag davor steht nur zur Lesbarkeit und wird beim
#  Ziehen ignoriert.
#
#    Stand      2026-11-02 ermittelt (Bild vom 2026-10-21, Node 22 auf
#               Alpine 3.24), Multi-Arch-Index, nicht ein einzelnes Bild
#    Ermittelt  docker buildx imagetools inspect node:22-alpine
#               (oder ohne Docker: Registry-API von Docker Hub, Kopf
#               docker-content-digest der Manifestliste)
#    Erneuern   Dependabot (.github/dependabot.yml, Ökosystem docker)
#               schlägt neue Digests wöchentlich als Pull Request vor; der
#               Trivy-Lauf (.github/workflows/lieferkette.yml) prüft das
#               neue Bild, bevor es gemergt wird. Alle drei FROM-Zeilen
#               tragen denselben Digest und werden gemeinsam geändert.
# =====================================================================

# ---------------------------------------------------------------------
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS bauen
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_ANWENDUNG_URL
ARG VITE_KONTAKT_MAIL
ARG VITE_KONTAKT_TELEFON
ARG VITE_KONTAKT_ZEITEN
ENV VITE_ANWENDUNG_URL=$VITE_ANWENDUNG_URL \
    VITE_KONTAKT_MAIL=$VITE_KONTAKT_MAIL \
    VITE_KONTAKT_TELEFON=$VITE_KONTAKT_TELEFON \
    VITE_KONTAKT_ZEITEN=$VITE_KONTAKT_ZEITEN
RUN npm run build

# ---------------------------------------------------------------------
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS laufzeit
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------------------------------------------------------------------
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS bild
ENV NODE_ENV=production \
    PORT=3000 \
    CENTRIC_DATEN=/data \
    CENTRIC_ABLAGE=dateien
WORKDIR /app

COPY --from=laufzeit /app/node_modules ./node_modules
COPY --from=bauen /app/dist ./dist
COPY server ./server
COPY server.mjs package.json ./
# Sicherung und Wiederherstellung der Ablage (BEREITSTELLUNG.md, 5.4) — im Bild,
# damit der VPS kein eigenes Node braucht.
COPY werkzeug/ablage-sicherung.mjs ./werkzeug/
# Rückweg bei unlesbarer Datei (docs/BETRIEB-SICHERUNG.md, §4a) — ebenfalls im
# Bild, aus demselben Grund. journal-pruefen braucht ablage-pruefen, beide die
# Ablage-Bibliothek unter server/ und ablage-sicherung (oben). Aufruf nur mit
# angehaltenem Dienst: docker run --rm --network none --user 1000:1000 \
#   -v "$PWD/data:/data" <bild@digest> node /app/werkzeug/ablage-pruefen.mjs …
COPY werkzeug/ablage-pruefen.mjs werkzeug/journal-pruefen.mjs ./werkzeug/
# Feste Proben für das Pre-Production-Gate (docs/PRE-PRODUCTION-GATE.md, 8).
# Kein Endpunkt, kein Start, keine Argumente: Sie laufen nur, wenn jemand
# ausdrücklich `node /app/werkzeug/staging-….mjs` im Container aufruft, und
# sprechen fest http://127.0.0.1:3000 an. Genau diese drei Dateien.
COPY werkzeug/staging-smoke.mjs werkzeug/staging-geo.mjs werkzeug/staging-aufraeumen.mjs ./werkzeug/

# WP-32d: Betreiber-2FA. Die Wiederherstellung am Server (Datenordner, Pfeffer und Betreibercode noetig; docs/acc45/wp32d-nachweis.md)
# und der Vorlauf, mit dem die Gate-Proben den zweiten Faktor ueber die API einrichten (nur die Proben laden ihn).
COPY werkzeug/betreiber-2fa-zuruecksetzen.mjs werkzeug/betreiber-faktor-vorlauf.mjs ./werkzeug/

# Datenverzeichnis gehört dem unprivilegierten Benutzer `node` (uid 1000).
# Im Betrieb wird es durch einen Bind-Mount ersetzt (./data:/data).
#
# Paketwerkzeuge raus (WP-32). Das Basisbild bringt npm, npx, corepack und
# yarn mit; zur Laufzeit braucht der Dienst keins davon (CMD und
# HEALTHCHECK rufen nur `node`). Der erste Trivy-Lauf fand alle 23 Befunde
# des Bildes — 10 davon HIGH — ausschließlich in den Abhängigkeiten des
# mitgelieferten npm. Was nicht im Bild ist, braucht keinen Fix.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v* \
 && mkdir -p /data && chown node:node /data && chmod 700 /data

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/gesund').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]

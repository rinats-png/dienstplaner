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
# =====================================================================

# ---------------------------------------------------------------------
FROM node:22-alpine AS bauen
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
FROM node:22-alpine AS laufzeit
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------------------------------------------------------------------
FROM node:22-alpine AS bild
ENV NODE_ENV=production \
    PORT=3000 \
    CENTRIC_DATEN=/data \
    CENTRIC_ABLAGE=dateien
WORKDIR /app

COPY --from=laufzeit /app/node_modules ./node_modules
COPY --from=bauen /app/dist ./dist
COPY netlify ./netlify
COPY server.mjs package.json ./

# Datenverzeichnis gehört dem unprivilegierten Benutzer `node` (uid 1000).
# Im Betrieb wird es durch einen Bind-Mount ersetzt (./data:/data).
RUN mkdir -p /data && chown node:node /data && chmod 700 /data

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/gesund').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]

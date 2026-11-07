# Family Chalk Planner in a container.  docker compose up -d   (see docs/docker.md)
# Everything the board keeps (database, settings key, uploads, caches, nightly backups) lives in /data.
FROM node:22-bookworm-slim

# Optional face finder for photo framing (OpenCV, ~220 MB): docker build --build-arg WITH_FACE=true .
ARG WITH_FACE=false

ENV NODE_ENV=production \
    PORT=3002 \
    BIND=0.0.0.0 \
    DATA_DIR=/data \
    PUID=1000 \
    PGID=1000

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --loglevel=error && npm cache clean --force

COPY server ./server
COPY shared ./shared
COPY public ./public
COPY face ./face
COPY deploy/setup-face.sh deploy/docker-entrypoint.sh ./deploy/
COPY LICENSE NOTICE README.md CHANGELOG.md ./

RUN if [ "$WITH_FACE" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends python3 python3-venv curl ca-certificates && \
      bash deploy/setup-face.sh /app && \
      apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/* /root/.cache; \
    fi \
 && chmod 755 deploy/docker-entrypoint.sh \
 && mkdir -p /data

VOLUME /data
EXPOSE 3002
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Starts as root only to make /data belong to PUID:PGID, then runs the board as that user.
ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]
CMD ["node", "server/chalkboard.js"]

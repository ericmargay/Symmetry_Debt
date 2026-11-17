# Symmetry Debt — production image
#
#   docker build -t symmetry-debt .
#   docker build -t symmetry-debt --build-arg NEXT_PUBLIC_BASE_PATH=/ .    # served at the domain root
#
# The base path is compiled into the app (Next.js inlines it in the client bundles), so an image
# built for /debt only works under /debt. Everything else is configured when the container
# starts, through environment variables — see .env.example.
#
# Alpine is enough: every native dependency (Next.js SWC, Tailwind, sharp, the Prisma schema
# engine) ships a musl build. If you ever hit a musl-only problem, `node:24-slim` works with the
# same file after replacing `apk add …` with `apt-get install -y openssl gosu` and `su-exec`
# with `gosu` in scripts/docker-entrypoint.sh.
#
# Deliberately NOT used, because Railway rejects them: the VOLUME instruction and BuildKit cache
# mounts. Mount a volume at /data from Compose or from the platform instead.

ARG NODE_VERSION=24

# ── base ──────────────────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
# openssl: the Prisma schema engine (`prisma migrate deploy`) detects and links against it.
# (Alpine removes old package versions from its repositories, so pinning them breaks rebuilds.)
# hadolint ignore=DL3018
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    CHECKPOINT_DISABLE=1
WORKDIR /app

# ── deps: every dependency, including the ones only needed to build ───────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# `npm ci` runs the postinstall script (`prisma generate`), which needs the schema and its config.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --no-audit --no-fund

# ── build ─────────────────────────────────────────────────────────────────────────────────────
FROM base AS build
# Build-time settings. Changing them means building a new image.
ARG NEXT_PUBLIC_BASE_PATH=/debt
ARG MAX_UPLOAD_MB=10
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH} \
    MAX_UPLOAD_MB=${MAX_UPLOAD_MB} \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No database and no secrets are needed to build. `public/` may not exist in a fresh clone
# (git does not keep empty folders), and the runtime stage copies it.
RUN mkdir -p public && npm run build

# ── runtime ───────────────────────────────────────────────────────────────────────────────────
FROM base AS runtime
ARG NEXT_PUBLIC_BASE_PATH=/debt
ARG MAX_UPLOAD_MB=10
# SD_BASE_PATH records the base path this image was BUILT for, so the health check (and the
# start-up log) use the right URL whatever the container's environment says.
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SD_BASE_PATH=${NEXT_PUBLIC_BASE_PATH} \
    MAX_UPLOAD_MB=${MAX_UPLOAD_MB} \
    STORAGE_DRIVER=local \
    STORAGE_LOCAL_DIR=/data/uploads

# su-exec: the entrypoint starts as root only to fix the ownership of the receipts volume, then
# drops to the unprivileged `node` user for migrations and for the server itself.
# hadolint ignore=DL3018
RUN apk add --no-cache su-exec

# The Prisma CLI applies pending migrations when the container starts. It must be the exact
# version the app was built with, so it is read from package.json instead of being repeated here.
# --allow-scripts: the install script of @prisma/engines is what downloads the schema engine;
# newer npm versions only run install scripts that were explicitly allowed. The engine has to be
# in the image, because at run time the CLI runs unprivileged and possibly without internet.
# (This CLI is most of the image's size. It is the price of running the official migration tool
# instead of a home-made one.)
COPY --from=build /app/package.json /tmp/package.json
RUN npm install --global --no-audit --no-fund --allow-scripts=prisma,@prisma/engines \
      "prisma@$(node -p "require('/tmp/package.json').devDependencies.prisma")" \
 && rm /tmp/package.json \
 && npm cache clean --force \
 && ls /usr/local/lib/node_modules/prisma/node_modules/@prisma/engines/schema-engine-* >/dev/null

# The standalone server (with only the node_modules it really uses), static assets, and what
# `prisma migrate deploy` needs: the migrations and the CLI configuration.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Receipts live here when STORAGE_DRIVER=local. Mount a volume at /data to keep them.
RUN mkdir -p /data/uploads && chown -R node:node /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "const b=(process.env.SD_BASE_PATH||'').replace(/\\/+$/,'');fetch('http://127.0.0.1:'+(process.env.PORT||3000)+b+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]

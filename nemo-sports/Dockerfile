# ═══════════════════════════════════════════════════════════════════════════
#  NEMO Sports — production image (site + data pipeline in one artifact)
#  ────────────────────────────────────────────────────────────────────────
#  One image, two roles (see docker-compose.yml):
#     app        → `npm run start`            the Next.js server
#     scheduler  → `npm run pipeline:loop`    the ingestion scheduler
#
#  The pipeline is part of the server bundle on purpose: it shares the
#  registry, the normalizers and the canonical store with the site, so a
#  container runs the exact code that CI type-checks and tests.
#
#  Build:  docker build -t nemo-sports .
#  Run:    docker compose up --build
# ═══════════════════════════════════════════════════════════════════════════

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# `pg` and `ioredis` are native-free, but openssl is required by some Node
# crypto paths on alpine.
RUN apk add --no-cache openssl

# ─── dependencies ─────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── build ────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A build must never need a credential: the registry is validated, and the
# pipeline performs no network call while compiling.
RUN npm run build

# ─── runtime ──────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]

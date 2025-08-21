# Purpose: Production multi-stage image for Node.js + TypeScript backend with Prisma and Socket.IO.
# Notes: Compiles TS -> JS, generates Prisma client, and runs on Node 20 (Debian slim) for bcrypt compatibility.

# --- Build stage ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Install build tools for native deps (e.g., bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy manifests from backend (context is repo root in CI)
COPY backend/package.json backend/yarn.lock ./backend/

# Yarn performance settings and cache folder per-arch
ARG YARN_NETWORK_TIMEOUT=600000
ENV YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn/${TARGETARCH}
RUN yarn config set registry https://registry.yarnpkg.com \
  && yarn config set network-timeout ${YARN_NETWORK_TIMEOUT} \
  && yarn config set prefer-offline true

WORKDIR /app/backend
# Install all deps for build with BuildKit cache mounts
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn/${TARGETARCH},id=yarn-cache-${TARGETARCH},sharing=locked \
    --mount=type=cache,target=/root/.cache/${TARGETARCH},id=root-cache-${TARGETARCH},sharing=locked \
    yarn install --frozen-lockfile --network-timeout ${YARN_NETWORK_TIMEOUT}

WORKDIR /app
# Copy Prisma schema early to cache prisma generate
COPY backend/prisma ./backend/prisma

WORKDIR /app/backend
# Generate Prisma client (cached unless prisma/ or deps change)
RUN npx prisma generate

WORKDIR /app
# Copy backend source and shared types
COPY backend ./backend
COPY shared ./shared

# Build TypeScript (backend tsconfig references ../shared)
WORKDIR /app/backend
ENV NODE_OPTIONS=--max_old_space_size=2048
RUN yarn build

# --- Runtime stage ---
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max_old_space_size=1024

# Install OpenSSL for Prisma query engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy only necessary artifacts
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/backend/src/generated ./dist/backend/src/generated

# Expose default port (match README/backend config)
EXPOSE 5000

# Healthcheck (basic TCP)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('net').createConnection({host:'127.0.0.1',port:process.env.PORT||5000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" || exit 1

# Start server
CMD ["node", "dist/backend/src/server.js"]

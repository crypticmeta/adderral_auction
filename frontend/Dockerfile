# syntax=docker/dockerfile:1.6
# Purpose: Production multi-stage image for Next.js frontend. Builds with Yarn and serves via Next.js in a minimal Node image.
# Notes: Uses Next.js standalone output and runs its server. Set NEXT_PUBLIC_* envs at runtime.

# --- Build stage ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Install minimal OS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy manifests from frontend (context is repo root in CI)
COPY frontend/package.json frontend/yarn.lock ./frontend/

# Increase Yarn network timeout and enable cache to reduce registry pressure
ARG YARN_NETWORK_TIMEOUT=600000
ENV YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn/${TARGETARCH}
RUN yarn config set registry https://registry.yarnpkg.com \
  && yarn config set network-timeout ${YARN_NETWORK_TIMEOUT} \
  && yarn config set prefer-offline true

WORKDIR /app/frontend
# Install deps (frozen lockfile) with BuildKit cache mounts and higher timeout
# Note: cache is isolated per-arch and locked to avoid cross-arch tar extraction races
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn/${TARGETARCH},id=yarn-cache-${TARGETARCH},sharing=locked \
    --mount=type=cache,target=/root/.cache/${TARGETARCH},id=root-cache-${TARGETARCH},sharing=locked \
    yarn install --frozen-lockfile --network-timeout ${YARN_NETWORK_TIMEOUT}

WORKDIR /app
# Copy frontend source and shared types
COPY frontend ./frontend
COPY shared ./shared

# Build Next.js app (cache Next compiler artifacts)
ENV NODE_ENV=production
# Give Next.js more memory to speed large builds
ENV NODE_OPTIONS=--max_old_space_size=4096
ENV NEXT_TELEMETRY_DISABLED=1
# Optionally skip lint/typecheck inside Docker build (run separately in CI for speed)
ENV NEXT_DISABLE_ESLINT=1
ENV NEXT_DISABLE_TYPECHECK=1

# Build-time public envs injected via build-args from CI
WORKDIR /app/frontend
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
RUN --mount=type=cache,target=.next/cache \
    yarn build

# --- Runtime stage (standalone) ---
# What happens in this file: Build Next.js with Yarn, then run the standalone server (no full node_modules needed at runtime).
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN groupadd -g 1001 nodejs && useradd -m -u 1001 -g nodejs nextjs

# Copy only the standalone server and required assets from builder
# - .next/standalone contains server.js and the minimal node_modules needed
# - .next/static contains static assets required by the server
# - public contains public assets
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public

# Ensure Next.js cache dir is writable by the non-root user
RUN mkdir -p /app/.next/cache && chown -R 1001:1001 /app

# Expose Next.js port
EXPOSE 3000

# Basic TCP healthcheck for Kubernetes
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('net').createConnection({host:'127.0.0.1',port:process.env.PORT||3000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" || exit 1

USER 1001

# Start Next.js standalone server
CMD ["node", "server.js"]

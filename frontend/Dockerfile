# syntax=docker/dockerfile:1.6
# Purpose: Production multi-stage image for Next.js frontend. Builds with Yarn and serves via Next.js in a minimal Node image.
# Notes: Uses Next.js build output and runs `next start`. Set NEXT_PUBLIC_* envs at runtime.

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Install OS deps if needed (optional)
RUN apk add --no-cache libc6-compat

# Copy manifests first for better caching (context is frontend/)
COPY package.json yarn.lock ./

# Increase Yarn network timeout and enable cache to reduce registry pressure
ARG YARN_NETWORK_TIMEOUT=600000
ENV YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn/${TARGETARCH}
RUN yarn config set registry https://registry.yarnpkg.com \
  && yarn config set network-timeout ${YARN_NETWORK_TIMEOUT} \
  && yarn config set prefer-offline true

# Install deps (frozen lockfile) with BuildKit cache mounts and higher timeout
# Note: cache is isolated per-arch and locked to avoid cross-arch tar extraction races
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn/${TARGETARCH},id=yarn-cache-${TARGETARCH},sharing=locked \
    --mount=type=cache,target=/root/.cache/${TARGETARCH},id=root-cache-${TARGETARCH},sharing=locked \
    yarn install --frozen-lockfile --network-timeout ${YARN_NETWORK_TIMEOUT}

# Copy source
COPY . .

# Build Next.js app
ENV NODE_ENV=production
RUN yarn build

# --- Runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy only necessary files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock

# Expose Next.js port
EXPOSE 3000

USER 1001

# Start Next.js
CMD ["yarn", "start", "-p", "3000"]

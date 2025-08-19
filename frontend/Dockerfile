# Purpose: Production multi-stage image for Next.js frontend. Builds with Yarn and serves via Next.js in a minimal Node image.
# Notes: Uses Next.js build output and runs `next start`. Set NEXT_PUBLIC_* envs at runtime.

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install OS deps if needed (optional)
RUN apk add --no-cache libc6-compat

# Copy manifests first for better caching
COPY frontend/package.json frontend/yarn.lock ./

# Install deps (frozen lockfile for reproducibility)
RUN yarn install --frozen-lockfile

# Copy source
COPY frontend .

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

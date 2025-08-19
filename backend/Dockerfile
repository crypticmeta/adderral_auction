# Purpose: Production multi-stage image for Node.js + TypeScript backend with Prisma and Socket.IO.
# Notes: Compiles TS -> JS, generates Prisma client, and runs on Node 20 (Debian slim) for bcrypt compatibility.

# --- Build stage ---
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install build tools for native deps (e.g., bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy manifests first (context is backend/ in CI)
COPY package.json yarn.lock ./

# Install all deps for build
RUN yarn install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN yarn build

# --- Runtime stage ---
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only necessary artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./dist/generated

# Expose default port (match README/backend config)
EXPOSE 5000

# Healthcheck (basic TCP)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('net').createConnection({host:'127.0.0.1',port:process.env.PORT||5000}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" || exit 1

# Start server
CMD ["node", "dist/server.js"]

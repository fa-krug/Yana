# =============================================================================
# Optimized Dockerfile for Yana - Node.js/Angular SSR Application
# Strategy: Multi-stage build with layer caching optimization
# =============================================================================

# Build stage - compile Angular app and TypeScript
FROM node:22-slim AS builder

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    DATABASE_URL=/tmp/build-db.sqlite3

# Copy package files for layer caching
COPY package*.json ./

# Install all dependencies (including dev) for build
RUN npm ci --include=dev

# Copy source and build
COPY . .

RUN npm run build

# Bundle standalone scripts for production (migration, superuser, worker)
# External dependencies are resolved from node_modules at runtime
RUN npx esbuild src/server/db/migrate.ts --bundle --platform=node --format=esm --outfile=dist/scripts/migrate.mjs \
    --external:better-sqlite3 --external:bcrypt --external:drizzle-orm --external:pino --external:pino-pretty && \
    npx esbuild src/server/scripts/createSuperuser.ts --bundle --platform=node --format=esm --outfile=dist/scripts/createSuperuser.mjs \
    --external:better-sqlite3 --external:bcrypt --external:drizzle-orm --external:pino --external:pino-pretty && \
    npx esbuild src/server/workers/worker.ts --bundle --platform=node --format=esm --outfile=dist/scripts/worker.mjs \
    --external:better-sqlite3 --external:bcrypt --external:drizzle-orm --external:playwright --external:playwright-core \
    --external:sharp --external:cheerio --external:rss-parser --external:pino --external:pino-pretty --external:axios

# =============================================================================
# Production dependencies stage - separate for better caching
# =============================================================================
FROM node:22-slim AS deps

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install production deps only
# --ignore-scripts skips prepare script (husky) which requires dev deps
# Then rebuild native modules that need compilation
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild better-sqlite3 bcrypt

# =============================================================================
# Runtime Stage - Use Playwright base image (includes Chromium)
# =============================================================================
FROM mcr.microsoft.com/playwright:v1.57.0-noble AS runtime

WORKDIR /app

# OCI Labels
LABEL org.opencontainers.image.title="Yana" \
      org.opencontainers.image.description="Personal feed aggregator with SSR" \
      org.opencontainers.image.source="https://github.com/your-org/yana"

# Set environment variables
# Playwright image has browsers pre-installed in /ms-playwright
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/app/data/db.sqlite3 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install tini for proper PID 1 signal handling and set up user/dirs
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data \
    && chown -R pwuser:root /app

# Copy production dependencies
COPY --from=deps --chown=pwuser:root /app/node_modules ./node_modules
COPY --from=deps --chown=pwuser:root /app/package*.json ./

# Copy built application files
COPY --from=builder --chown=pwuser:root /app/dist ./dist
COPY --from=builder --chown=pwuser:root /app/docker-entrypoint.sh ./

# Copy database migrations (migrate.ts expects ./src/server/db/migrations)
COPY --from=builder --chown=pwuser:root /app/src/server/db/migrations ./src/server/db/migrations

RUN chmod +x ./docker-entrypoint.sh

USER pwuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const h=require('http');h.get('http://localhost:3000/api/health',r=>{r.on('data',()=>{});r.on('end',()=>process.exit(r.statusCode===200?0:1))}).on('error',()=>process.exit(1))"

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--", "./docker-entrypoint.sh"]

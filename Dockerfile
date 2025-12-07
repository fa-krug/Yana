# =============================================================================
# Optimized Dockerfile for Yana - Node.js/Angular SSR Application
# Strategy: node-slim (glibc) for prebuilt binaries + minimal compilation
# =============================================================================

# Build stage - compile native modules and Angular app
FROM node:22-slim AS builder

WORKDIR /app

# Install ONLY what's needed for better-sqlite3 compilation
# bcrypt 6.x and sharp use prebuilt binaries on glibc
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for layer caching
COPY package*.json ./

# Install all dependencies with cache mount for speed
# Prebuilt binaries for bcrypt/sharp download automatically
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# Copy source and build
COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL=/tmp/build-db.sqlite3

RUN npm run build

# Production dependencies only - separate stage for caching
FROM node:22-slim AS deps

WORKDIR /app

# Need build tools for better-sqlite3 in prod deps
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install production deps only - bcrypt/sharp use prebuilt
# --ignore-scripts skips prepare script (husky) which isn't available without dev deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# =============================================================================
# Runtime Stage - Minimal production image
# =============================================================================
FROM node:22-slim AS runtime

WORKDIR /app

# Install runtime deps for Playwright chromium
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Playwright config - use system chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium

# Copy production node_modules (prebuilt binaries intact)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/docker-entrypoint.sh ./

# Register chromium with Playwright (no download, just setup)
RUN npx playwright install chromium || true

# Security: non-root user
RUN useradd -r -u 1001 nodejs && \
    mkdir -p /app/data && \
    chown -R nodejs:nodejs /app && \
    chmod +x ./docker-entrypoint.sh

USER nodejs

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=/app/data/db.sqlite3

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server/server.mjs"]

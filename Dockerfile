# =============================================================================
# Optimized Dockerfile for Yana - Node.js/Angular SSR Application
# Strategy: Multi-stage build with layer caching optimization
# =============================================================================

# Build stage - compile native modules and Angular app
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

# Production dependencies stage - separate for better caching
FROM node:22-slim AS deps

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

COPY package*.json ./

# Install production deps only
# --ignore-scripts skips prepare script (husky) which requires dev deps
RUN npm ci --omit=dev --ignore-scripts

# =============================================================================
# Runtime Stage - Minimal production image
# =============================================================================
FROM node:22-slim AS runtime

WORKDIR /app

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/app/data/db.sqlite3 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CHROMIUM_PATH=/usr/bin/chromium

# Copy production dependencies and package files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy built application files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/docker-entrypoint.sh ./

# Register chromium with Playwright and create non-root user in single layer
RUN npx playwright install chromium && \
    useradd -r -u 1001 nodejs && \
    mkdir -p /app/data && \
    chown -R nodejs:nodejs /app && \
    chmod +x ./docker-entrypoint.sh

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server/server.mjs"]

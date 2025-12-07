# Multi-stage Dockerfile for Fullstack TypeScript/Node Application
# Combines Angular SSR Frontend + Express Backend in one container

# ============================================================================
# Stage 1: Build (Angular SSR + TypeScript Server)
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies as fallback (only needed if prebuilt binaries unavailable)
# npm will use prebuilt binaries when available (sharp has them for Alpine)
# Ignore trigger failures in QEMU emulated builds (packages install successfully)
RUN apk add --no-cache \
        python3 \
        make \
        g++ \
        sqlite-dev \
    || true && \
    rm -rf /var/cache/apk/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
# npm automatically uses prebuilt binaries when available, falls back to building if needed
RUN npm ci

# Copy source code
COPY . .

# Build Angular app for production (creates dist/browser/ and dist/server/server.mjs)
# Set a temporary DATABASE_URL for build time (database not needed during build)
ENV DATABASE_URL=/tmp/build-db.sqlite3
RUN npm run build

# Copy TypeScript source files for scripts (migrate, createSuperuser, etc.)
# We'll use tsx to run them directly, avoiding ESM import extension issues
# Note: src/server.ts is already bundled by Angular as server.mjs

# ============================================================================
# Stage 2: Production Image
# ============================================================================
FROM node:22-alpine

WORKDIR /app

# Install runtime dependencies for Playwright
# Native modules (better-sqlite3, sharp) use prebuilt binaries, no build tools needed
# Ignore trigger failures in QEMU emulated builds (packages install successfully)
RUN apk add --no-cache \
        chromium \
        nss \
        freetype \
        harfbuzz \
        ca-certificates \
        ttf-freefont \
    || true && \
    rm -rf /var/cache/apk/*

# Set Playwright environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install Playwright chromium (production only)
RUN npx playwright install chromium --with-deps || true

# Copy package files for production dependency installation
COPY package*.json ./

# Install production dependencies + tsx for running TypeScript scripts
# Skip prepare script (husky) since it's only needed for development
RUN npm ci --omit=dev --ignore-scripts && \
    npm install --save-prod tsx && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy TypeScript source files for scripts (we use tsx to run them)
COPY --from=builder /app/src/server ./src/server

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create directory for SQLite database with correct ownership
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=/app/data/db.sqlite3

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set entrypoint
ENTRYPOINT ["./docker-entrypoint.sh"]

# Default command
CMD ["node", "dist/server/server.mjs"]

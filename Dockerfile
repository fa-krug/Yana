# Dockerfile for Fullstack TypeScript/Node Application
# Multi-stage build: builder stage for compilation, runtime stage for production

# ============================================================================
# Builder Stage - Contains all build dependencies
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native module compilation
# Note: python3 is required by node-gyp for building native modules
# Use --no-scripts to skip trigger execution which fails under qemu emulation for ARM64
RUN apk update && \
    apk add --no-cache --no-scripts \
        python3 \
        make \
        g++ \
        sqlite-dev \
    && rm -rf /var/cache/apk/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
# Use npm ci for reproducible builds
# Cache npm packages to speed up rebuilds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# Copy source code
COPY . .

# Build Angular app for production
# Set a temporary DATABASE_URL for build time (database not needed during build)
ENV DATABASE_URL=/tmp/build-db.sqlite3
ENV NODE_ENV=production
RUN npm run build

# ============================================================================
# Runtime Stage - Minimal production image
# ============================================================================
FROM node:22-alpine AS runtime

WORKDIR /app

# Install runtime dependencies for Playwright
# chromium and dependencies are needed for Playwright to work
# Use --no-scripts to skip trigger execution which fails under qemu emulation for ARM64
# This is a known workaround for cross-platform builds - triggers are non-critical for these packages
RUN apk update && \
    apk add --no-cache --no-scripts \
        chromium \
        nss \
        freetype \
        harfbuzz \
        ca-certificates \
        ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set Playwright environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

# Copy package files and node_modules from builder
# Native modules (better-sqlite3) are already built in builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Prune dev dependencies (native modules stay intact)
# Then install tsx which is needed at runtime but in devDependencies
# Cache npm packages to speed up rebuilds
RUN --mount=type=cache,target=/root/.npm \
    npm prune --production && \
    npm install --save-prod tsx && \
    npm cache clean --force

# Install Playwright chromium (uses system chromium via CHROMIUM_PATH)
# --with-deps installs system dependencies, but we already have them
RUN npx playwright install chromium --with-deps

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Remove unnecessary files to reduce image size
RUN rm -rf src/app src/main.ts src/main.server.ts src/styles.scss \
           angular.json tsconfig*.json vite.config.ts vitest.config.ts \
           .eslintrc.json .prettierrc .prettierignore \
           .github .vscode .cursor \
           public scripts aggregators legacy_backend \
           *.md .dockerignore .gitignore .git \
    && chmod +x ./docker-entrypoint.sh

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

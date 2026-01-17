# =============================================================================
# Optimized Dockerfile for Yana - Django RSS Aggregator
# Strategy: Multi-stage build with Alpine base for minimal footprint
# =============================================================================

# Build stage - compile dependencies
FROM python:3.13-alpine AS builder

WORKDIR /build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies for native modules (Pillow, lxml, etc.)
RUN apk add --no-cache \
    gcc \
    g++ \
    musl-dev \
    postgresql-dev \
    python3-dev \
    jpeg-dev \
    zlib-dev \
    libxml2-dev \
    libxslt-dev \
    linux-headers

# Create virtual environment
RUN python -m venv /opt/venv

# Activate venv and install dependencies
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip setuptools wheel && \
    pip install -r requirements.txt

# =============================================================================
# Runtime Stage - Minimal production image (Alpine)
# =============================================================================
FROM python:3.13-alpine AS runtime

WORKDIR /app

# OCI Labels
LABEL org.opencontainers.image.title="Yana" \
      org.opencontainers.image.description="Django RSS aggregator and feed management system" \
      org.opencontainers.image.source="https://github.com/anthropics/yana"

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    DJANGO_SETTINGS_MODULE=yana.settings

# Install runtime dependencies and tini
RUN apk add --no-cache \
    tini \
    bash \
    libpq \
    libjpeg-turbo \
    libxml2 \
    libxslt \
    curl \
    && mkdir -p /app/data /app/media /app/staticfiles /app/logs

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY . .

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Collect static files during build (reduces startup time)
RUN python manage.py collectstatic --noinput --clear || true

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health/ || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]

# Default command (supervisord manages gunicorn and qcluster)
CMD ["supervisord", "-c", "/app/supervisord.conf"]

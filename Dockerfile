# =============================================================================
# Optimized Dockerfile for Yana - Django RSS Aggregator
# Strategy: Multi-stage build with layer caching optimization
# =============================================================================

# Build stage - compile dependencies
FROM python:3.13-slim-bookworm AS builder

WORKDIR /build

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies for native modules (Pillow, lxml, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    python3-dev \
    libjpeg-dev \
    zlib1g-dev \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

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
# Runtime Stage - Minimal production image
# =============================================================================
FROM python:3.13-slim-bookworm AS runtime

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
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    libpq5 \
    libjpeg62-turbo \
    libxml2 \
    libxslt1.1 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /bin/bash yana \
    && mkdir -p /app/data /app/media /app/staticfiles \
    && chown -R yana:yana /app

# Copy virtual environment from builder
COPY --from=builder --chown=yana:yana /opt/venv /opt/venv

# Copy application code
COPY --chown=yana:yana . .

# Copy entrypoint script
COPY --chown=yana:yana docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Collect static files during build (reduces startup time)
# This runs with empty DB, so we skip migrations
RUN python manage.py collectstatic --noinput --clear || true

USER yana

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health/ || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]

# Default command (supervisord manages gunicorn and qcluster)
CMD ["supervisord", "-c", "/app/supervisord.conf"]

#!/bin/sh
set -e

echo "Starting Yana server..."

# Run database migrations
echo "Running database migrations..."
node dist/scripts/migrate.mjs || {
  echo "Warning: Database migration failed, continuing anyway..."
}

# Create superuser if DJANGO_SUPERUSER_* env vars are set
if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ] && [ -n "$DJANGO_SUPERUSER_EMAIL" ]; then
  echo "Creating superuser..."
  node dist/scripts/createSuperuser.mjs "$DJANGO_SUPERUSER_USERNAME" "$DJANGO_SUPERUSER_EMAIL" "$DJANGO_SUPERUSER_PASSWORD" || {
    echo "Warning: Superuser creation failed, continuing anyway..."
  }
fi

# Start server (exec replaces shell with node for proper signal handling)
echo "Starting server..."
exec node dist/server/server.mjs

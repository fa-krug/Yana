#!/bin/sh
set -e

echo "Starting Yana server..."

# Run database migrations
echo "Running database migrations..."
node dist/scripts/migrate.mjs || {
  echo "Warning: Database migration failed, continuing anyway..."
}

# Create superuser if SUPERUSER_* env vars are set
if [ -n "$SUPERUSER_USERNAME" ] && [ -n "$SUPERUSER_PASSWORD" ] && [ -n "$SUPERUSER_EMAIL" ]; then
  echo "Creating superuser..."
  node dist/scripts/createSuperuser.mjs "$SUPERUSER_USERNAME" "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" || {
    echo "Warning: Superuser creation failed, continuing anyway..."
  }
fi

# Start server (exec replaces shell with node for proper signal handling)
echo "Starting server..."
exec node dist/server/server.mjs

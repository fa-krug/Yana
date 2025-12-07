#!/bin/sh
set -e

echo "Starting Yana server..."

# Run database migrations
echo "Running database migrations..."
# Use tsx to run TypeScript source files directly
npx tsx src/server/db/migrate.ts || {
  echo "Warning: Database migration failed, continuing anyway..."
}

# Create superuser if DJANGO_SUPERUSER_* env vars are set
if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ] && [ -n "$DJANGO_SUPERUSER_EMAIL" ]; then
  echo "Creating superuser..."
  npx tsx src/server/scripts/createSuperuser.ts "$DJANGO_SUPERUSER_USERNAME" "$DJANGO_SUPERUSER_EMAIL" "$DJANGO_SUPERUSER_PASSWORD" || {
    echo "Warning: Superuser creation failed, continuing anyway..."
  }
fi

# Start server
echo "Starting server..."
exec node dist/server/server.mjs

#!/bin/bash
set -e

echo "=== Yana Django Application Startup ==="

# Function to wait for database (not needed for SQLite, but good for future PostgreSQL support)
wait_for_db() {
    if [ -n "$DATABASE_HOST" ]; then
        echo "Waiting for database at $DATABASE_HOST:${DATABASE_PORT:-5432}..."

        max_attempts=30
        attempt=0

        while [ $attempt -lt $max_attempts ]; do
            if python -c "import socket; socket.create_connection(('$DATABASE_HOST', ${DATABASE_PORT:-5432}), timeout=2)" 2>/dev/null; then
                echo "Database is available"
                return 0
            fi

            attempt=$((attempt + 1))
            echo "Waiting for database... attempt $attempt/$max_attempts"
            sleep 2
        done

        echo "WARNING: Database not reachable after $max_attempts attempts, continuing anyway..."
    fi
}

# Wait for database if configured (for future PostgreSQL support)
wait_for_db

# Run database migrations
echo "Running database migrations..."
python manage.py migrate --noinput || {
    echo "ERROR: Database migration failed"
    exit 1
}

# Collect static files (production)
if [ "$DEBUG" = "False" ]; then
    echo "Collecting static files..."
    python manage.py collectstatic --noinput --clear || {
        echo "WARNING: Static file collection failed, continuing anyway..."
    }
fi

# Create superuser if environment variables are set
if [ -n "$SUPERUSER_USERNAME" ] && [ -n "$SUPERUSER_PASSWORD" ] && [ -n "$SUPERUSER_EMAIL" ]; then
    echo "Checking for superuser..."
    python manage.py shell << EOF
from django.contrib.auth import get_user_model
User = get_user_model()

if not User.objects.filter(username='$SUPERUSER_USERNAME').exists():
    User.objects.create_superuser(
        username='$SUPERUSER_USERNAME',
        email='$SUPERUSER_EMAIL',
        password='$SUPERUSER_PASSWORD'
    )
    print('Superuser created: $SUPERUSER_USERNAME')
else:
    print('Superuser already exists: $SUPERUSER_USERNAME')
EOF
fi

# Execute the main command (supervisord or custom command)
echo "Starting application: $@"
exec "$@"

#!/usr/bin/env python3
"""
Quick test script to verify SQLite backend optimizations are working.

Usage:
    python3 test_sqlite_backend.py
"""

import os
import sys

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "yana.settings")


def test_backend():
    import django

    django.setup()

    from django.db import connection

    """Test that the optimized backend is loaded and working."""
    print("Testing optimized SQLite backend...\n")

    # Ensure connection is established (triggers init_connection_state)
    connection.ensure_connection()
    print("✓ Connection established")

    # Verify backend class
    backend_class = connection.__class__.__name__
    backend_module = connection.__class__.__module__
    print(f"✓ Backend class: {backend_class} from {backend_module}")

    if "core.db.backends.sqlite3" in backend_module:
        print("✓ Using optimized backend")
    else:
        print("⚠ Using default backend (optimizations may not be applied)")

    # Check PRAGMA settings
    print("\nChecking PRAGMA settings:\n")
    with connection.cursor() as cursor:
        # Journal mode
        cursor.execute("PRAGMA journal_mode")
        journal_mode = cursor.fetchone()[0]
        status = "✓" if journal_mode.upper() == "WAL" else "✗"
        print(f"{status} Journal mode: {journal_mode} (expected: WAL)")

        # Cache size
        cursor.execute("PRAGMA cache_size")
        cache_size = cursor.fetchone()[0]
        expected = -64000
        status = "✓" if cache_size == expected else "⚠"
        print(f"{status} Cache size: {cache_size} KB (expected: {expected} = 64MB)")

        # Synchronous
        cursor.execute("PRAGMA synchronous")
        synchronous = cursor.fetchone()[0]
        status = "✓" if synchronous == 1 else "⚠"
        print(f"{status} Synchronous: {synchronous} (1=NORMAL, expected: 1)")

        # MMap size
        cursor.execute("PRAGMA mmap_size")
        mmap_size = cursor.fetchone()[0]
        expected = 268435456
        status = "✓" if mmap_size == expected else "⚠"
        print(f"{status} MMap size: {mmap_size} bytes (expected: {expected} = 256MB)")

        # Temp store
        cursor.execute("PRAGMA temp_store")
        temp_store = cursor.fetchone()[0]
        status = "✓" if temp_store == 2 else "⚠"
        print(f"{status} Temp store: {temp_store} (2=MEMORY, expected: 2)")

        # Busy timeout
        cursor.execute("PRAGMA busy_timeout")
        busy_timeout = cursor.fetchone()[0]
        expected = 30000
        status = "✓" if busy_timeout == expected else "⚠"
        print(f"{status} Busy timeout: {busy_timeout} ms (expected: {expected} = 30s)")

        # Foreign keys
        cursor.execute("PRAGMA foreign_keys")
        foreign_keys = cursor.fetchone()[0]
        status = "✓" if foreign_keys == 1 else "⚠"
        print(f"{status} Foreign keys: {foreign_keys} (1=ON, expected: 1)")

    print("\n✓ Test complete!")


if __name__ == "__main__":
    try:
        test_backend()
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)

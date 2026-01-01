#!/bin/bash
# Cursor hook that runs after file edits to format and fix issues
# This hook communicates via JSON over stdio

# Read JSON input from stdin
INPUT=$(cat)

# Parse file path from JSON using jq
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // ""')

# Only process files in frontend directory
if echo "$FILE_PATH" | grep -qE "frontend/"; then
    GIT_ROOT=$(dirname "$FILE_PATH")
    while [ ! -d "$GIT_ROOT/.git" ] && [ "$GIT_ROOT" != "/" ]; do
        GIT_ROOT=$(dirname "$GIT_ROOT")
    done

    if [ -d "$GIT_ROOT/.git" ]; then
        cd "$GIT_ROOT" || exit 0

        # Format frontend files
        if echo "$FILE_PATH" | grep -qE "frontend/.*\.(ts|html|scss|json)$"; then
            cd "$GIT_ROOT/frontend" 2>/dev/null && npm run format 2>&1 >/dev/null || true
        fi
    fi
fi

# No output needed for afterFileEdit hook
exit 0

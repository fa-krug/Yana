#!/bin/bash
# Cursor hook that intercepts git commit commands and runs validation
# This hook communicates via JSON over stdio

# Read JSON input from stdin
INPUT=$(cat)

# Parse the command and cwd from JSON using jq
COMMAND=$(echo "$INPUT" | jq -r '.command // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Check if this is a git commit command
if echo "$COMMAND" | grep -qE "^\s*git\s+commit"; then
    # Extract the git repository root
    GIT_ROOT=$(cd "$CWD" && git rev-parse --show-toplevel 2>/dev/null || echo "$CWD")
    
    cd "$GIT_ROOT" || exit 1
    
    echo "🔒 Running pre-commit validation..." >&2
    
    # Step 1: Install frontend dependencies if missing
    if [ -d "$GIT_ROOT/frontend" ] && [ ! -d "$GIT_ROOT/frontend/node_modules" ]; then
        echo "📦 Installing frontend dependencies..." >&2
        cd "$GIT_ROOT/frontend" || exit 1
        npm install --silent 2>&1 || {
            echo "❌ Failed to install frontend dependencies" >&2
            echo '{"permission":"deny","user_message":"Pre-commit hook failed: Could not install frontend dependencies. Please install manually: cd frontend && npm install","agent_message":"Frontend dependency installation failed. Please fix and retry."}'
            exit 0
        }
        cd "$GIT_ROOT" || exit 1
    fi
    
    # Step 2: Fix frontend formatting issues
    if [ -d "$GIT_ROOT/frontend" ]; then
        echo "💅 Fixing frontend formatting..." >&2
        cd "$GIT_ROOT/frontend" || exit 1
        npm run format 2>&1 || {
            echo "❌ Frontend formatting failed" >&2
            echo '{"permission":"deny","user_message":"Pre-commit hook failed: Frontend formatting errors detected. Please fix manually: cd frontend && npm run format","agent_message":"Frontend formatting errors detected. Please fix and retry."}'
            exit 0
        }
        cd "$GIT_ROOT" || exit 1
    fi
    
    # Step 3: Run frontend tests
    if [ -d "$GIT_ROOT/frontend" ]; then
        echo "🧪 Running frontend tests..." >&2
        cd "$GIT_ROOT/frontend" || exit 1
        
        if grep -q '"test"' package.json; then
            npm test -- --watch=false --browsers=ChromeHeadless 2>&1 || {
                echo "❌ Frontend tests failed" >&2
                echo '{"permission":"deny","user_message":"Pre-commit hook failed: Frontend tests failed. Please fix failing tests before committing.","agent_message":"Frontend tests failed. Please fix failing tests and retry."}'
                exit 0
            }
        fi
        
        cd "$GIT_ROOT" || exit 1
    fi
    
    # Step 4: Final verification
    echo "🔍 Final verification..." >&2
    
    # Verify frontend formatting
    if [ -d "$GIT_ROOT/frontend" ]; then
        cd "$GIT_ROOT/frontend" || exit 1
        npm run format:check 2>&1 | grep -q "." && {
            echo "❌ Frontend formatting verification failed" >&2
            echo '{"permission":"deny","user_message":"Pre-commit hook failed: Frontend formatting issues still present after fixes.","agent_message":"Frontend formatting issues remain. Please fix and retry."}'
            exit 0
        }
        cd "$GIT_ROOT" || exit 1
    fi
    
    echo "✅ All pre-commit checks passed!" >&2
    echo "✅ Allowing git commit to proceed..." >&2
fi

# Allow the command to proceed (either it's not a git commit, or validation passed)
echo '{"permission":"allow"}'
exit 0

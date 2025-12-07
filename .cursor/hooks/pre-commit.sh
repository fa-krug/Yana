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
    
    # Step 1: Install backend dependencies if missing
    if ! python3 -c "import django" 2>/dev/null; then
        echo "📦 Installing backend dependencies..." >&2
        pip3 install -q feedparser --no-deps --break-system-packages 2>&1 | grep -v "WARNING:" || true
        
        PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
        SGMLLIB_PATH="/usr/local/lib/python${PYTHON_VERSION}/dist-packages/sgmllib.py"
        if [ ! -f "$SGMLLIB_PATH" ]; then
            pip3 download -q sgmllib3k --no-cache-dir -d /tmp/sgml 2>&1 && \
            cd /tmp/sgml && tar -xzf sgmllib3k-1.0.0.tar.gz 2>&1 && \
            mkdir -p "$(dirname "$SGMLLIB_PATH")" 2>/dev/null && \
            cp /tmp/sgml/sgmllib3k-1.0.0/sgmllib.py "$SGMLLIB_PATH" 2>&1 && \
            cd - >/dev/null || true
        fi
        
        pip3 install -q -r "$GIT_ROOT/backend/requirements.txt" --break-system-packages 2>&1 | grep -v "WARNING:" || {
            echo "❌ Failed to install backend dependencies" >&2
            echo '{"permission":"deny","user_message":"Pre-commit hook failed: Could not install backend dependencies. Please install manually: pip3 install -r backend/requirements.txt","agent_message":"Dependency installation failed. Please fix and retry."}'
            exit 0
        }
    fi
    
    # Step 2: Install frontend dependencies if missing
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
    
    # Step 3: Fix backend linting issues
    echo "🔧 Fixing backend linting issues..." >&2
    python3 -m ruff check --fix "$GIT_ROOT/backend/" 2>&1 || {
        echo "❌ Backend linting failed" >&2
        echo '{"permission":"deny","user_message":"Pre-commit hook failed: Backend linting errors detected. Please fix manually: python3 -m ruff check --fix backend/","agent_message":"Backend linting errors detected. Please fix and retry."}'
        exit 0
    }
    
    # Step 4: Fix backend formatting issues
    echo "🎨 Fixing backend formatting..." >&2
    python3 -m ruff format "$GIT_ROOT/backend/" 2>&1 || {
        echo "❌ Backend formatting failed" >&2
        echo '{"permission":"deny","user_message":"Pre-commit hook failed: Backend formatting errors detected. Please fix manually: python3 -m ruff format backend/","agent_message":"Backend formatting errors detected. Please fix and retry."}'
        exit 0
    }
    
    # Step 5: Fix frontend formatting issues
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
    
    # Step 6: Run backend tests
    echo "🧪 Running backend tests..." >&2
    if [ -d "$GIT_ROOT/backend" ] && [ -f "$GIT_ROOT/backend/manage.py" ]; then
        cd "$GIT_ROOT/backend" || exit 1
        
        TEST_APPS="core api"
        [ -d "$GIT_ROOT/backend/social" ] && TEST_APPS="$TEST_APPS social"
        [ -d "$GIT_ROOT/backend/api_v1" ] && TEST_APPS="$TEST_APPS api_v1"
        [ -d "$GIT_ROOT/backend/aggregators" ] && [ -f "$GIT_ROOT/backend/aggregators/__init__.py" ] && TEST_APPS="$TEST_APPS aggregators"
        
        python3 manage.py test $TEST_APPS --verbosity=1 2>&1 || {
            echo "❌ Backend tests failed" >&2
            echo '{"permission":"deny","user_message":"Pre-commit hook failed: Backend tests failed. Please fix failing tests before committing.","agent_message":"Backend tests failed. Please fix failing tests and retry."}'
            exit 0
        }
        
        cd "$GIT_ROOT" || exit 1
    fi
    
    # Step 7: Run frontend tests
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
    
    # Step 8: Final verification
    echo "🔍 Final verification..." >&2
    
    # Verify backend linting
    python3 -m ruff check "$GIT_ROOT/backend/" 2>&1 | grep -q "." && {
        echo "❌ Backend linting verification failed" >&2
        echo '{"permission":"deny","user_message":"Pre-commit hook failed: Backend linting issues still present after fixes.","agent_message":"Backend linting issues remain. Please fix and retry."}'
        exit 0
    }
    
    # Verify backend formatting
    python3 -m ruff format --check "$GIT_ROOT/backend/" 2>&1 | grep -q "." && {
        echo "❌ Backend formatting verification failed" >&2
        echo '{"permission":"deny","user_message":"Pre-commit hook failed: Backend formatting issues still present after fixes.","agent_message":"Backend formatting issues remain. Please fix and retry."}'
        exit 0
    }
    
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

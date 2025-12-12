# Cursor Agent Hooks

This project uses Cursor agent hooks to ensure code quality automatically before commits.

## Overview

Cursor hooks are separate processes that communicate via JSON over stdio. They run before or after defined phases of the agent loop and can observe, block, or modify behavior.

## Configuration

**Location**: `.cursor/hooks.json`

The hooks configuration defines which scripts run for different hook events:

- **`beforeShellExecution`** - Intercepts git commit commands and runs validation
- **`afterFileEdit`** - Automatically formats files after the agent edits them

## Hook Scripts

### `pre-commit.sh`

Runs when the agent attempts to execute a git commit command. Performs:

1. **Install Frontend Dependencies** - Checks and installs npm packages if missing
2. **Fix Frontend Formatting** - Runs `prettier format` to auto-format frontend code
3. **Run Frontend Tests** - Executes tests in non-interactive mode
4. **Final Verification** - Runs prettier checks one more time

If any step fails, the commit is **blocked** with a clear error message.

### `format-and-fix.sh`

Runs automatically after the agent edits any file. Formats:
- TypeScript/HTML/SCSS/JSON files using prettier

## How It Works

1. When the Cursor agent tries to execute `git commit`, the `beforeShellExecution` hook intercepts it
2. The hook runs all validation checks
3. If checks pass, it returns `{"permission":"allow"}` to let the commit proceed
4. If checks fail, it returns `{"permission":"deny"}` with error messages to block the commit

## Requirements

- `jq` - For JSON parsing (usually pre-installed)
- `npm` - For frontend operations
- `prettier` - Frontend formatter (installed via npm)

## Testing

To test the hooks manually:

```bash
# Test the pre-commit hook with a mock git commit command
echo '{"command":"git commit -m test","cwd":"/workspace"}' | ./.cursor/hooks/pre-commit.sh

# Test the format hook with a mock file edit
echo '{"file_path":"/workspace/src/server/test.ts","edits":[]}' | ./.cursor/hooks/format-and-fix.sh
```

## Documentation

For more information about Cursor hooks, see: https://cursor.com/docs/agent/hooks

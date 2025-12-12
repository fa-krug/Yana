# Git Hooks

This directory contains git hooks that are automatically installed when using Claude Code.

## Pre-Commit Hook

The `pre-commit` hook runs before every git commit to ensure code quality:

1. **Prettier formatting** check and auto-fix (Frontend)
2. **Dependency installation** (if needed)
3. **Full test suite** (all tests)

### ⚠️ CRITICAL: Failures Are Blocking

**If any step fails, the commit is BLOCKED and MUST be fixed immediately.**

- ❌ **No exceptions** - All checks must pass
- 🚫 **Bypassing is NOT allowed** - Code quality is mandatory
- 🔒 **This is a serious issue** - Broken code cannot be committed
- 📝 **Fix immediately** - Review errors, fix issues, then commit again

The hook displays prominent error messages with clear instructions when failures occur.

## Automatic Installation

Cursor hooks are automatically used via `.cursor/hooks/pre-commit.sh`. For traditional git hooks, install manually:

## Manual Installation

If not using Claude Code, install manually:

```bash
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Bypassing the Hook

⚠️ **STRONGLY DISCOURAGED**: Bypassing the hook defeats the purpose of quality gates.

**Only use in extreme emergencies** (e.g., hotfix commits where you've verified quality separately):

```bash
git commit --no-verify
```

**Remember**: If you bypass the hook, you are responsible for ensuring:
- ✅ All linting passes
- ✅ All formatting is correct
- ✅ All tests pass
- ✅ Code quality standards are met

**Best practice**: Fix the issues and commit normally.

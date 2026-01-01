# ESLint Configuration and Usage

This document describes the ESLint setup, configuration, and usage in the Yana project.

## Overview

The project uses ESLint 9.x with the flat config format (`eslint.config.mjs`) to enforce code quality and consistency across the TypeScript codebase. ESLint is integrated into the development workflow through pre-commit hooks and CI/CD pipelines.

## Quick Start

### Running ESLint

```bash
# Check for linting errors
npm run lint

# Automatically fix auto-fixable issues
npm run lint:fix
```

### Integration with Development Workflow

ESLint runs automatically:
- **Pre-commit**: Via Husky hooks (see `.husky/pre-commit`)
- **CI/CD**: In GitHub Actions workflows
- **IDE**: Most editors can be configured to show ESLint errors in real-time

## Configuration

The ESLint configuration is defined in `eslint.config.mjs` using the flat config format (ESLint 9.x).

### Plugins and Extensions

The configuration uses several plugins:

- **`@eslint/js`** - Core ESLint recommended rules
- **`typescript-eslint`** - TypeScript-specific linting rules
- **`@angular-eslint/eslint-plugin`** - Angular-specific rules for components and templates
- **`eslint-plugin-import`** - Import/export statement linting
- **`eslint-config-prettier`** - Disables ESLint rules that conflict with Prettier

### Rule Categories

#### TypeScript Rules

- **`@typescript-eslint/no-unused-vars`**: Error - Prevents unused variables/parameters (allows `_` prefix)
- **`@typescript-eslint/no-explicit-any`**: Warning - Discourages use of `any` type
- **`@typescript-eslint/no-non-null-assertion`**: Warning - Discourages non-null assertions (`!`)
- **`@typescript-eslint/no-var-requires`**: Error - Prevents `require()` in TypeScript files
- **`@typescript-eslint/ban-ts-comment`**: Error - Controls TypeScript directive comments

#### Import Rules

- **`import/order`**: Error - Enforces import statement ordering and grouping
- **`import/no-duplicates`**: Error - Prevents duplicate imports

#### General Rules

- **`no-console`**: Warning - Restricts console usage (allows `console.warn` and `console.error`)
- **`no-debugger`**: Error - Prevents debugger statements
- **`prefer-const`**: Error - Requires `const` for variables that are never reassigned
- **`no-var`**: Error - Prevents use of `var` keyword

#### Angular Rules

- **`@angular-eslint/directive-selector`**: Error - Enforces directive selector naming (`app` prefix, camelCase)
- **`@angular-eslint/component-selector`**: Error - Enforces component selector naming (`app` prefix, kebab-case)
- **`@angular-eslint/no-empty-lifecycle-method`**: Error - Prevents empty lifecycle methods
- **`@angular-eslint/use-lifecycle-interface`**: Error - Requires implementing lifecycle interfaces
- **`@angular-eslint/use-pipe-transform-interface`**: Error - Requires pipes to implement `PipeTransform`

### File-Specific Configurations

The configuration applies different rules based on file location:

#### Server Files (`src/server/**/*.ts`)

- `no-console`: **Off** - Console logging allowed in server code
- `@typescript-eslint/no-require-imports`: **Off** - Allow `require()` for server dependencies

#### Test Files (`**/*.test.ts`, `**/*.spec.ts`, `tests/**/*.ts`)

- `@typescript-eslint/no-explicit-any`: **Off** - Allow `any` in tests
- `no-console`: **Off** - Allow console in tests
- Project-based rules: **Disabled** - Faster linting for test files

#### Config Files (`*.config.{js,mjs,ts}`, `scripts/**/*.ts`)

- `@typescript-eslint/no-var-requires`: **Off** - Allow `require()` in config files
- Project-based rules: **Disabled** - Config files may be outside tsconfig scope

#### Generated Files

The following patterns are ignored:
- `node_modules/**`
- `dist/**`
- `.angular/**`
- `out-tsc/**`
- `coverage/**`
- `*.min.js`
- `public/**`
- `*.d.ts`
- `**/*.gen.ts` - Generated TypeScript files

## Common Issues and Solutions

### Unused Variables/Parameters

**Error**: `'variable' is defined but never used`

**Solution**: Prefix unused variables with `_`:

```typescript
// ❌ Error
function process(data: string, unused: number) {
  return data;
}

// ✅ Fixed
function process(data: string, _unused: number) {
  return data;
}
```

### Unused Imports

**Error**: `'Import' is defined but never used`

**Solution**: Remove the unused import or use it:

```typescript
// ❌ Error
import { unusedFunction } from './utils';

// ✅ Fixed - Remove if truly unused
// Or use it if needed
import { usedFunction } from './utils';
```

### Import Order

**Error**: `There should be no empty line within import group`

**Solution**: Group imports correctly with proper spacing:

```typescript
// ❌ Error
import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { MyService } from './my.service';

// ✅ Fixed
import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { MyService } from './my.service';
```

Import order should be:
1. Built-in modules
2. External packages
3. Internal modules
4. Parent directories
5. Sibling files
6. Index files

### Console Statements

**Warning**: `Unexpected console statement`

**Solution**: Use `console.warn()` or `console.error()` instead, or remove:

```typescript
// ❌ Warning
console.log('Debug message');

// ✅ Fixed
console.warn('Warning message');
console.error('Error message');
// Or remove entirely
```

**Note**: Console is allowed in server code (`src/server/**/*.ts`) and test files.

### Explicit `any` Type

**Warning**: `Unexpected any. Specify a different type`

**Solution**: Use a specific type or `unknown`:

```typescript
// ❌ Warning
function process(data: any) {
  return data;
}

// ✅ Fixed
function process(data: unknown) {
  return data;
}

// Or use a specific type
function process(data: string | number) {
  return data;
}
```

### Non-null Assertion

**Warning**: `Forbidden non-null assertion`

**Solution**: Use proper null checking:

```typescript
// ❌ Warning
const value = data!.property;

// ✅ Fixed
const value = data?.property;
// Or
if (data) {
  const value = data.property;
}
```

### Unnecessary Escape Characters

**Error**: `Unnecessary escape character: \/`

**Solution**: Remove unnecessary escapes in regex patterns:

```typescript
// ❌ Error
const pattern = /https:\/\/example\.com/;

// ✅ Fixed
const pattern = /https:\/\/example\.com/; // Keep only necessary escapes
// Or use String.raw
const pattern = String.raw`https://example\.com`;
```

## Auto-Fixing Issues

Many ESLint issues can be automatically fixed:

```bash
# Fix all auto-fixable issues
npm run lint:fix
```

This will automatically fix:
- Import ordering
- Unused imports (removal)
- Prefer const
- Some formatting issues (though Prettier handles most formatting)

**Note**: Some issues require manual fixes:
- Unused variables (need to prefix with `_` or remove)
- Type issues (need to specify proper types)
- Logic errors

## Pre-commit Integration

ESLint runs automatically before commits via Husky pre-commit hooks (`.husky/pre-commit`). If ESLint finds errors, the commit is blocked.

### Bypassing Pre-commit (Not Recommended)

If you need to bypass pre-commit hooks (e.g., for WIP commits):

```bash
git commit --no-verify -m "wip: work in progress"
```

**Warning**: Only use this for temporary commits. All code should pass ESLint before merging.

## IDE Integration

### VS Code

Install the ESLint extension and configure in `.vscode/settings.json`:

```json
{
  "eslint.enable": true,
  "eslint.validate": [
    "javascript",
    "typescript",
    "html"
  ],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Other IDEs

Most modern IDEs support ESLint:
- **WebStorm/IntelliJ**: Built-in ESLint support
- **Sublime Text**: Install ESLint package
- **Atom**: Install linter-eslint package

## CI/CD Integration

ESLint runs in GitHub Actions workflows (`.github/workflows/docker-publish.yml`). Failed linting will cause the CI build to fail.

## Best Practices

1. **Run lint before committing**: Use `npm run lint` to catch issues early
2. **Fix issues incrementally**: Don't let lint errors accumulate
3. **Use auto-fix when possible**: `npm run lint:fix` handles many issues automatically
4. **Prefix unused parameters**: Use `_` prefix for intentionally unused parameters
5. **Avoid `any`**: Use specific types or `unknown` instead
6. **Follow import order**: Group imports correctly to avoid ordering errors
7. **Remove unused code**: Clean up unused imports and variables

## Configuration Customization

To modify ESLint rules, edit `eslint.config.mjs`. Common customizations:

### Adding a New Rule

```javascript
rules: {
  'your-plugin/your-rule': 'error',
}
```

### Disabling a Rule for a Specific File

Add a comment at the top of the file:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
// Your code here
```

### Disabling a Rule for a Specific Line

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = getData();
```

## Troubleshooting

### ESLint Not Running

1. Check that ESLint is installed: `npm list eslint`
2. Verify the config file exists: `eslint.config.mjs`
3. Check npm scripts: `npm run lint`

### TypeScript Project Errors

If you see TypeScript project-related errors:

1. Ensure `tsconfig.json` is valid
2. Check that TypeScript files are included in the project
3. For config files, project-based rules are disabled

### Performance Issues

If ESLint is slow:

1. Check ignored patterns in config
2. Ensure generated files are ignored
3. Consider disabling project-based rules for large files

### Conflicts with Prettier

Prettier handles formatting, ESLint handles code quality. The `eslint-config-prettier` plugin disables conflicting rules. If you see formatting conflicts:

1. Run Prettier first: `npm run format`
2. Then run ESLint: `npm run lint`

## Related Documentation

- [Prettier Configuration](../.prettierrc) - Code formatting
- [TypeScript Configuration](../tsconfig.json) - Type checking
- [Development Workflow](../.cursor/rules/workflow.mdc) - Development guidelines

## Resources

- [ESLint Documentation](https://eslint.org/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [Angular ESLint](https://github.com/angular-eslint/angular-eslint)
- [ESLint Import Plugin](https://github.com/import-js/eslint-plugin-import)

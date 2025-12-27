# Lint Analysis

Based on the initial lint report, here is the breakdown of issues by category:

## 1. Safety & Security (High Priority)
- **Rules:**
  - `sonarjs/no-clear-text-protocols` (e.g., http vs https)
  - `sonarjs/insecure-cookie`
  - `sonarjs/no-os-command-from-path`
  - `sonarjs/publicly-writable-directories`
  - `sonarjs/slow-regex` (DoS vulnerability)
  - `sonarjs/no-try-promise`
  - `sonarjs/no-ignored-exceptions`

## 2. Type Safety (High Volume)
- **Rules:**
  - `@typescript-eslint/no-explicit-any` (Significant number of occurrences)
  - `@typescript-eslint/no-non-null-assertion`
  - `sonarjs/function-return-type`
- **Strategy:** Replace `any` with specific types or `unknown` where appropriate. Remove non-null assertions with proper checks.

## 3. Code Quality & Cleanliness
- **Rules:**
  - `@typescript-eslint/no-unused-vars` / `sonarjs/no-unused-vars`
  - `sonarjs/unused-import`
  - `sonarjs/no-dead-store`
  - `sonarjs/use-type-alias`
  - `sonarjs/deprecation` (e.g., `inferAsyncReturnType`, Zod deprecations)

## 4. Complexity & Maintainability
- **Rules:**
  - `sonarjs/cognitive-complexity` (Many functions exceed the limit of 15)
  - `sonarjs/no-nested-functions`
  - `sonarjs/no-all-duplicated-branches`
  - `sonarjs/no-duplicated-branches`
  - `sonarjs/prefer-single-boolean-return`

## 5. Other
- `Parsing error: Identifier expected` (Needs immediate investigation in `preview-article-card.component.ts`)

## Action Plan
The `plan.md` phases align well with this grouping. We will tackle them in order of impact and ease of resolution.

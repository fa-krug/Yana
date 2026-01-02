# Plan: Reimplement Oglaf Aggregator

Based on the specification and the project's TDD-focused workflow (adapted for manual verification as requested), here is the plan for porting the Oglaf aggregator.

## Phase 1: Foundation and Scaffolding [checkpoint: 2ba8495]
- [x] Task: Add `("oglaf", "Oglaf")` to `AGGREGATOR_CHOICES` in `core/choices.py` (3143184)
- [x] Task: Create the directory `core/aggregators/website/oglaf/` and add an empty `__init__.py` (2ba8495)
- [x] Task: Conductor - User Manual Verification 'Phase 1: Foundation and Scaffolding' (Protocol in workflow.md) (2ba8495)

## Phase 2: Logic Implementation
- [~] Task: Analyze `old/src/server/aggregators/oglaf.ts` to identify selectors, removal patterns, and custom logic
- [ ] Task: Implement `OglafAggregator` class in `core/aggregators/website/oglaf/aggregator.py`
- [ ] Task: Register `OglafAggregator` in `core/aggregators/registry.py`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Logic Implementation' (Protocol in workflow.md)

## Phase 3: Verification and Cleanup
- [ ] Task: Run `python3 manage.py test_aggregator oglaf --limit 3 --verbose --dry-run` and verify content extraction
- [ ] Task: Create a test feed in Django Admin for Oglaf and verify it aggregates correctly via `trigger_aggregator`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Verification and Cleanup' (Protocol in workflow.md)

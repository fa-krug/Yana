# Implementation Plan: Re-implement Missing Aggregators

This plan outlines the steps to port five missing aggregators (Explosm, Dark Legacy, Caschy's Blog, MacTechNews, and Podcast) from the legacy TypeScript codebase to the new Python environment.

## Phase 1: Comic Aggregators [checkpoint: a1a6632]
Focus on aggregators that primarily extract images.

- [x] Task: Implement `ExplosmAggregator` in `core/aggregators/explosm/aggregator.py` with TDD d568827
- [x] Task: Implement `DarkLegacyAggregator` in `core/aggregators/dark_legacy/aggregator.py` with TDD 3078e57
- [x] Task: Update `core/aggregators/registry.py` to use new Comic Aggregators ea3cdfd
- [x] Task: Conductor - User Manual Verification 'Phase 1: Comic Aggregators' (Protocol in workflow.md) a1a6632

## Phase 2: News Aggregators
Focus on full-content extraction for tech news sites.

- [x] Task: Implement `CaschysBlogAggregator` in `core/aggregators/caschys_blog/aggregator.py` with TDD e644d72
- [x] Task: Implement `MactechnewsAggregator` in `core/aggregators/mactechnews/aggregator.py` with TDD cc4ac14
- [ ] Task: Update `core/aggregators/registry.py` to use new News Aggregators
- [ ] Task: Conductor - User Manual Verification 'Phase 2: News Aggregators' (Protocol in workflow.md)

## Phase 3: Podcast Aggregator
Specialized RSS parsing for audio content.

- [ ] Task: Implement `PodcastAggregator` in `core/aggregators/podcast/aggregator.py` with TDD
- [ ] Task: Update `core/aggregators/registry.py` to use new Podcast Aggregator
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Podcast Aggregator' (Protocol in workflow.md)

## Phase 4: Finalization and Cleanup
Remove redundant code and perform full system verification.

- [ ] Task: Remove stubbed implementations from `core/aggregators/implementations.py`
- [ ] Task: Verify all 5 ported aggregators using `python3 manage.py test_aggregator`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Finalization and Cleanup' (Protocol in workflow.md)

## Verification Plan
Each aggregator will be verified using:
1. `python3 manage.py test_aggregator <type> --dry-run --verbose` to check content extraction.
2. Unit tests in `core/tests/` or `core/aggregators/<name>/tests.py`.

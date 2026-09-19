---
title: next Contribution Path Analysis Design
docType: design
scope: repo
status: proposed
authoritative: false
owner: next
language: en
whenToUse:
  - when evaluating contribution-path analysis work that touches this repo
  - when checking the intended frontend contract for contribution-path results
  - when deciding whether current analysis work is proposal-only or runtime truth
whenToUpdate:
  - when the proposed contribution-path contract for next changes
  - when cross-repo responsibilities for contribution-path analysis change
  - when this proposal becomes obsolete or superseded
checkPaths:
  - docs/agents/contribution-path-analysis-design.md
  - docs/agents/lca-analysis-visualization-plan.md
  - docs/agents/util_calculate.md
  - src/pages/Processes/Analysis/**
  - src/components/LcaTaskCenter/**
lastReviewedAt: 2026-09-18
lastReviewedCommit: d0f64424af98857967592f4281d8a4ed8c25bf99
lastReviewedNote: 'Reviewed Platform #1046 refinement: imports reconcile from the shared list only; terminal outcomes use green/orange/red, orphan records prevent full success, and reports resolve signed links only on click. Owner isolation, reload recovery and once-only data refresh are tested. Export/LCA behavior, ownership and gate policy remain unchanged; validation evidence is recorded in the task.'
---

# Contribution Path Analysis Design

> Status: proposed design. This document is not runtime truth.

## Problem

V1 needs to answer, for one process and one impact:

1. total LCIA result
2. top contributing upstream processes
3. which upstream branches should be inspected first

## Out Of Scope For V1

- cross-snapshot analysis
- uncertainty or Monte Carlo
- multi-process path analysis
- audit-grade exact Sankey edge allocation
- fully client-side recalculation for arbitrary thresholds

## Current Constraints

- numerical base already exists through snapshot artifacts and `solve_one`
- current query sidecars are sufficient for hotspots and comparisons, not for traversal-based path analysis
- do not put HDF5 traversal logic in edge functions
- current snapshot index metadata is too thin for rich path display
- process-editor validation and report-navigation changes do not alter this proposed async path-analysis contract
- the current cross-dataset SDK validation refactor does not change this proposal's worker/result boundary

## Design Decisions

1. use a dedicated async analysis pipeline instead of extending `query-results`
2. keep path computation in the worker close to solver data
3. return analysis-ready JSON, not sparse-matrix internals
4. in V1, keep process contributions exact and branch ranking exploratory
5. defer exact Sankey semantics until a later path-specific design exists

## Proposed Flow

`next analysis page -> edge submit endpoint -> async worker analysis -> JSON result artifact -> edge result endpoint -> frontend render`

## V1 Contract

### Input

- `process_id`
- `impact_id`
- `amount` with default `1.0`
- snapshot resolution inputs such as `data_scope`

### Output Groups

| Output group | Purpose |
| --- | --- |
| summary | total impact, unit, root process, expanded and truncated counts, coverage ratio |
| process contributions | one row per process with direct characterized contribution and share of total |
| branches or traversal | ranked exploratory paths with terminal reason such as cutoff, max depth, max nodes, cycle cut, or leaf |

### V1 Non-Guarantees

- exact edge-level impact allocation
- exact Sankey widths
- exact split values for repeated process instances across multiple branches

## Execution Contract

| Layer | Proposed contract |
| --- | --- |
| `calculator` | async worker job `analyze_contribution_path` persists a JSON artifact in format `contribution-path:v1` |
| `edge-functions` submit path | `POST /lca/contribution-path` validates inputs, resolves snapshot context, deduplicates requests, and queues work |
| `edge-functions` result path | `GET /lca/contribution-path/result?result_id=<uuid>` verifies ownership and returns parsed JSON |
| dedupe key | `snapshot_id + process_id + impact_id + amount + max_depth + top_k_children + cutoff_share + max_nodes` |
| `tiangong-lca-next` | consumes analysis-ready JSON; it does not decode HDF5 or sparse matrices in the browser |

## Suggested Result Shape

- `summary`: `total_impact`, `unit`, `coverage_ratio`, `expanded_node_count`, `truncated_node_count`, `computed_at`
- `process_contributions`: `process_id`, `process_index`, `label`, `location`, `direct_impact`, `share_of_total`, `is_root`, `depth_min`
- `branches`: `rank`, `path_process_ids`, `path_labels`, `path_score`, `terminal_reason`
- `links`: `source_process_id`, `target_process_id`, `depth_from_root`, `cycle_cut`
- `meta`: artifact source and snapshot-index version used to build the result

## Traversal Rules

- exact part: compute direct characterized contribution per process from `solve_one` outputs for the selected impact
- exploratory part: rank children importance-first and stop on `cutoff`, `max_depth`, `max_nodes`, or `cycle`
- cycle rule: emit a `cycle_cut` link and stop expanding that branch

## Front-End Placement

- keep the entry in the existing process-analysis flow under `/mydata/processes/analysis`
- do not add a new left-nav item for V1
- the first UI should ship three blocks only: parameter area, summary area, and result area

## Repo Changes

| Repo                | Required change                                                         |
| ------------------- | ----------------------------------------------------------------------- |
| `calculator`        | add contribution-path job type and result artifact generation           |
| `edge-functions`    | add submit/result endpoints and reuse async job/cache model             |
| `tiangong-lca-next` | add analysis UI that consumes the JSON result, not raw solver internals |

## Risks

- ranking semantics may be misread as exact decomposition
- snapshot metadata may still be insufficient for the desired UI labels
- path breadth and depth limits need explicit product-level defaults

---
title: next LCA Analysis And Visualization Plan
docType: design
scope: repo
status: proposed
authoritative: false
owner: next
language: en
whenToUse:
  - when evaluating planned LCA analysis UI work in this repo
  - when checking intended charting and traceability rules for analysis features
  - when deciding whether analysis work is current runtime truth or proposal-only
whenToUpdate:
  - when the proposed analysis and visualization plan changes
  - when phase scope or acceptance assumptions change
  - when the proposal is superseded or retired
checkPaths:
  - docs/agents/lca-analysis-visualization-plan.md
  - docs/agents/contribution-path-analysis-design.md
  - docs/agents/util_calculate.md
  - src/pages/Processes/Analysis/**
  - src/components/LcaTaskCenter/**
lastReviewedAt: 2026-09-18
lastReviewedCommit: d0f64424af98857967592f4281d8a4ed8c25bf99
lastReviewedNote: 'Reviewed Platform #1046 refinement: imports reconcile from the shared list only; terminal outcomes use green/orange/red, orphan records prevent full success, and reports resolve signed links only on click. Owner isolation, reload recovery and once-only data refresh are tested. Export/LCA behavior, ownership and gate policy remain unchanged; validation evidence is recorded in the task.'
---

# LCA Analysis And Visualization Plan

> Status: proposed product and implementation plan. This document is not runtime truth.

## Problem

The repo already exposes solver-backed LCIA results, but it still needs a stable web-native analysis layer for:

1. one-process impact profiles
2. one-impact hotspot ranking
3. selected-process comparison
4. clear traceability of snapshot and result sources

## Current Baseline

| Area | Current fact |
| --- | --- |
| current result APIs | `process_all_impacts` and `processes_one_impact` already exist |
| current UI anchor | process detail drawer already renders solver-backed LCIA results in a table |
| technical boundary | current all-unit baseline is sufficient for profiles, hotspots, ranking, and comparison, but not for real path analysis by itself |
| UI language | Ant Design Pro layout, cards, drawers, tables, tabs, light/dark theme |
| dependency constraint | chart-library changes require approval |

## Design Rules

- traceability first: show snapshot and result provenance with every analysis view
- charts complement tables, not replace them
- preserve existing page rhythm before adding a heavyweight dashboard
- prefer robust analytical charts over decorative charts
- make normalization explicit whenever values across categories are compared on one canvas
- editor-side validation and correction affordances should not mutate the analysis result contract; keep those concerns outside the analysis surfaces
- dataset-validation UX refactors may change editor affordances, but they should not change the analysis page data contract without an explicit plan update

## Phase Scope

| Phase   | Scope                                                                              |
| ------- | ---------------------------------------------------------------------------------- |
| phase 1 | process profile, impact hotspots, selected-process comparison, small KPI summaries |
| phase 2 | grouped or aggregated analysis                                                     |
| phase 3 | contribution-path and uncertainty or scenario analysis                             |

## Chart Selection Rules

| Use case | Preferred chart | Notes |
| --- | --- | --- |
| one-process impact profile | `Bar` | normalized `Radar` is optional and only valid when normalization is explicit |
| one-impact hotspot ranking | `Bar` plus optional Pareto-style cumulative view | ranking clarity matters more than novelty |
| selected-process comparison | grouped `Bar` or `Column`; optional `Bullet` summary | keep raw values in the table |
| path analysis | defer Sankey until a path-specific data contract exists | do not fake exact path widths |

## Front-End Information Architecture

- enhance the existing process detail drawer instead of replacing it
- add a lightweight analysis page or tab for hotspot and comparison views
- keep current calculation entry points unchanged in early phases

## Phase 1 Surfaces

| Surface | Primary use | Data source |
| --- | --- | --- |
| process detail drawer | one-process impact profile plus provenance and raw table | `process_all_impacts` |
| analysis `Hotspots` tab | one-impact ranking plus cumulative-share view | `processes_one_impact` or a ranked query wrapper built on it |
| analysis `Compare` tab | selected-process comparison on one impact | `processes_one_impact` |

## Cross-Repo Work

| Repo                | Expected work                                                         |
| ------------------- | --------------------------------------------------------------------- |
| `tiangong-lca-next` | charts, tables, traceability UI, compare and hotspot surfaces         |
| `edge-functions`    | query support and result transport when current APIs are insufficient |
| `calculator`        | deeper analysis capabilities such as path-oriented outputs            |

## Acceptance Criteria For Phase 1

- users can inspect one-process profiles, one-impact hotspots, and selected-process comparisons
- raw values remain available in tables
- every analysis view shows `snapshot_id`, `result_id`, `source`, and `computed_at`
- chart values and table values reconcile
- loading, empty, and error states follow existing product patterns
- charts remain usable in both light and dark theme

## Delivery Order

1. extend the current process-detail LCIA section with a profile view
2. add hotspot ranking on a lightweight analysis surface
3. add selected-process comparison
4. stabilize state handling, formatting, and theme behavior
5. defer grouped analysis until phase 1 is stable
6. defer contribution-path and uncertainty work to later phases

## Open Questions

- whether and when chart dependencies should expand
- what grouped-analysis metadata should look like
- how normalized views should be labeled and explained

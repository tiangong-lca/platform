---
title: next Lifecycle Model Calculation Reference
docType: reference
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when changing `src/services/lifeCycleModels/util_calculate.ts`
  - when changing `src/services/lifeCycleModels/matrixCalculation/**`
  - when debugging matrix compilation, solving, submodel generation, or multiplication-factor write-back
whenToUpdate:
  - when the frontend-side calculation pipeline changes
  - when helper responsibilities move between modules
  - when compilation, solving, or attribution rules become inaccurate
checkPaths:
  - docs/agents/util_calculate.md
  - src/services/lifeCycleModels/**
  - src/services/lifeCycleModels/matrixCalculation/**
  - src/services/lciaMethods/**
  - src/components/LcaTaskCenter/**
  - src/pages/Processes/Analysis/**
lastReviewedAt: 2026-09-20
lastReviewedCommit: 25bfea81d9507deccf4aa968c213600eea13b927
lastReviewedNote: 'Reviewed Platform #1107: TIDAS import report presentation, localization and Jest discovery were checked against this contract; its governed scope and rules remain unchanged.'
---

# Lifecycle Model Calculation Reference

> Purpose: exact reference for the matrix-based calculation pipeline that generates or updates life-cycle-model submodels.

## Use When

- changing `src/services/lifeCycleModels/util_calculate.ts`
- changing `src/services/lifeCycleModels/matrixCalculation/**`
- debugging matrix compilation, solving, submodel generation, or multiplier write-back

## Do Not Use For

- repo-wide workflow rules
- branch or validation policy
- solver internals of the backend Worker (read-only semantic reference)
- dataset-validation adapter changes that only affect save-time normalization

## Source Of Truth

- orchestration: `src/services/lifeCycleModels/util_calculate.ts`
- matrix pipeline: `src/services/lifeCycleModels/matrixCalculation/**`
  - `types.ts` — internal runtime types, error codes, tolerances
  - `validation.ts` — structure validation, single-provider rule
  - `compile.ts` — views, attribution fractions, A/y assembly
  - `solve.ts` — dense partial-pivoting LU (ml-matrix), numeric checks
  - `assemble.ts` — port balances, multipliers, submodel groups
  - `matrixWorker.ts` — Web Worker entry (pure compute)
  - `workerClient.ts` — run binding, cancellation, sync fallback
- submodel records: `src/services/lifeCycleModels/submodelRecord.ts`
- LCIA helper: `src/services/lciaMethods/util.ts` (unchanged path)
- LCIA bundle/evidence contract: `docs/agents/lcia-calculation-evidence.md`

## Entry Function

| Field | Value |
| --- | --- |
| function | `genLifeCycleModelProcesses(id, modelNodes, lifeCycleModelJsonOrdered, oldSubmodels)` |
| primary output | `{ lifeCycleModelProcesses, up2DownEdges, lciaIncomplete }` |
| side effects | writes `@multiplicationFactor` per `processInstance[*]` into `lifeCycleModelJsonOrdered` |

Failures throw `CalculationError` (typed `code` plus locatable `issues`) or `CalculationCancelledError`; the save shell maps them to mutation results. Failures never mutate saved results.

## Pipeline Summary

| Step | Module | Result |
| --- | --- | --- |
| 1 | `util_calculate.ts` | resolve reference instance, target amount, instance payloads, exact Process data |
| 2 | `validation.ts` | structure, target, reference exchange, connection, flow-version, single-provider validation |
| 3 | `compile.ts` | allocation shapes, product views, M = I - A entries, demand vector |
| 4 | `solve.ts` | LU solve of (I-A)x=y, residual / non-finite / non-negative checks |
| 5 | `assemble.ts` | port-balance verification, instance multipliers, edge amounts, primary/secondary groups |
| 6 | `util_calculate.ts` | submodel records (existing shape), LCIA via existing evidence path, multiplier write-back |
| 7 | `api.ts` | persistence plan, bundle save (unchanged schema), save-status mapping: authoritative rejection → `SAVE_REJECTED`; transport failures or unparseable response bodies → `SAVE_STATUS_UNKNOWN` (never a definite rejection without evidence) |

## Calculation Semantics

- The system is demand-driven: the ★ reference target is the final demand `y` of the reference view; every other view is driven by connected consumers. Cycles enter the equations fully; nothing breaks edges.
- A **view** (matrix variable) exists for: the reference process's quantitative-reference exchange, every connected output exchange of every instance, every output exchange that carries an allocation declaration (connected or not, so allocated coproducts keep independent results), and the reference exchange of dead-end instances (connected inputs, no connected outputs, not the reference).
- Each view's pivot is normalized to +1 per unit activity. Every other exchange is attributed with its allocation fraction divided by the pivot amount. Attribution shapes:
  - **single** (one output, or several outputs without allocation declarations): all exchanges fully attributed (fraction 1). Ordinary outputs without declarations — elementary emissions, wastes, unallocated coproducts — are not allocation targets; they ride along at full scale.
  - **legacy uniform share**: only _declared_ outputs (`@allocatedFraction`, a trailing `%` is tolerated) are allocation targets; each declares its own share; a view attributes all exchanges at its pivot's share; the declared shares must close to 100%. Undeclared outputs keep an implicit share (1 − declared sum) and are attributed at that implicit share.
  - **standard exchange-target allocation**: per exchange, the allocation item targeting the view product is selected; undeclared exchanges fully attribute to the instance's own reference view; each declared vector must close to 100%.
- Missing/invalid/ambiguous allocation data raises `INVALID_ALLOCATION`; the calculation never normalizes or splits shares on its own.
- Row assignment: reference view → anchor row (y = target); an instance's primary view → production row. The primary is the instance's reference-exchange view when it is the global reference (demand-anchored even if unconnected) or when it is connected; when a non-reference instance's reference product is only an unconnected boundary view, the first connected output view takes the production row so real consumer demand drives the instance (an unconnected boundary primary would force the instance to zero); its other views → joint-production linkage rows (x_v = (q_v/q_primary)·x_primary, keeping one physical run count per instance); dead-end views → pass-through rows driven by the supplier's leftover after demand-driven consumption.
- Balances not encoded in the square system (extra dead-end pipes, linkage conflicts) are verified post-solve together with M·x-y residuals; failures map to `MODEL_NOT_SOLVABLE` or `NUMERIC_RESULT_INVALID` — never a silent surplus or a fallback.
- Solved activities keep their full precision: small positive values are never zeroed (a tiny activity can carry a material load, e.g. 1e-13 activity × 1e13 raw intensity = 1); only within-tolerance negative noise is clamped to zero. Display rounding happens solely at the boundary-exchange filter in inventory assembly.
- Instance `@multiplicationFactor` = primary-view activity / |reference amount|; all views of one instance agree through the linkage rows.
- **Attributed scenarios**: each submodel group is assembled from its own attributed activity levels, not the global solution. Within a group the root is anchored at its global activity (the scenario's physical scale) and non-root members are driven by in-group consumers only, so shared upstream inventory is attributed per scenario (raw demand splits correctly) and internal flows cancel inside the group. Secondary results are created for every eligible allocated boundary product — dead-end views and unconnected allocated coproducts alike — so each allocated product keeps an independent result without an artificial downstream node.

## Hard Rules

- No pseudo-inverse, no edge deletion, no negative clamping, no legacy algorithm fallback, no automatic provider selection.
- `MODEL_NOT_SOLVABLE` is used only on solver-confirmed failure signals; unclassifiable numeric failures fall back to `CALCULATION_FAILED`.
- Negative LCIA amounts do not trigger `NEGATIVE_ACTIVITY`; that check covers solved activity levels only.
- Every input keeps at most one provider; one output may fan out to many consumers (their demands accumulate).
- Instances of the same source Process stay independent; flow identity includes the resolved version, and port versions must match.
- Connected internal flows cancel inside a submodel group and never re-enter the external inventory; unconnected flows stay as boundary exchanges.
- Boundary aggregation merges exchanges only at the exact Flow revision (direction + flow UUID + `@version` from the raw template): same-UUID exchanges at different revisions stay separate boundary exchanges until a documented conversion exists; the first template is never reused across revisions.
- Inventory assembly drops only exact-zero amounts — no magnitude threshold deletes nonzero computed quantities (small activity can still mean material load, and the functional-unit exchange must survive). The primary group must carry its quantitative-reference exchange; a missing or below-target reference exchange fails with `NUMERIC_RESULT_INVALID` instead of returning an incomplete success. Input-pivot (treatment) references may net to zero internally and are exempt from that check.

## Web Worker Contract

- The worker runs compile/solve/assemble on plain structured-cloneable data; no DOM, IndexedDB, or network access. Source loading and LCIA stay on the main thread.
- `workerClient.ts` binds one run id per calculation; only the latest run's result is applied, superseded runs resolve as `discarded`, cancellation terminates the worker (`cancelled`), and environments without Worker fall back to synchronous execution with identical semantics.
- **Operation-scoped cancellation** covers the whole save operation, not just the worker run: `CalculationOperation` (`types.ts`) is created per save in the editor, passed through `util_calculate` options and `workerClient.run` options, and checked at entry, before dispatch, after source loads, after the solve, between LCIA evaluations, and before persistence. Cancelling during the persisting stage does not abort the save; the editor reports the save as already in flight (`saveInFlight`) and the save result decides the outcome.

## Update When

Update this document when any of these change:

- module ownership or the payload/result shapes of `matrixCalculation/**`
- view, attribution, row-assignment, or pass-through semantics
- multiplier mapping or submodel grouping rules
- worker/client binding, cancellation, or fallback behavior
- LCIA load or cache behavior (see also `docs/agents/lcia-calculation-evidence.md`)

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
lastReviewedAt: 2026-10-10
lastReviewedCommit: 11e84182b58224da5ae59c16330fe33d02dd5192
lastReviewedNote: 'Reviewed PR1195 conflict resolution against Dev26f19842: combined display and product-provider documentation, retained both finite translation families and regenerated four-locale artifacts. Eight display/shared-UI source files are byte-identical to prior head40aa65a9; seventeen incoming source files exactly match Dev and the lockfile is unchanged. Focused eleven suites/105 tests, four-locale checks, qualification build and two-generation artifact idempotence pass. Existing permission/result behavior and local/hosted qualification boundaries remain unchanged; final checked push and live mergeability readback remain required. No browser, server or container was started, and no hosted data was changed.'
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

## Related Reading

- [Model 建模与计算说明](./model-modeling-and-calculation.md) — product-demand concepts and mathematical semantics.
- [Model 产品需求计算修改方案](../plans/model-product-demand.md) — proposed implementation and dataset mapping.

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
| 5 | `assemble.ts` | product-demand balance verification, projected process graph, edge amounts, primary/secondary groups |
| 6 | `util_calculate.ts` | allocated provider records, independent result records, LCIA via existing evidence path, standard instance projection |
| 7 | `api.ts` | persistence plan, bundle save (unchanged schema), save-status mapping: authoritative rejection → `SAVE_REJECTED`; transport failures or unparseable response bodies → `SAVE_STATUS_UNKNOWN` (never a definite rejection without evidence) |

## Calculation Semantics

- The system is demand-driven: the ★ reference target is the final demand `y` of the reference view; every other view is driven by connected consumers. Cycles enter the equations fully; nothing breaks edges.
- A **view** (matrix variable) exists for: the reference process's quantitative-reference exchange, every connected output exchange of every instance, every output exchange that carries an allocation declaration (connected or not, so allocated coproducts keep independent results), and the reference exchange of dead-end instances (connected inputs, no connected outputs, not the reference).
- Each view's pivot is normalized to +1 per unit activity. Every other exchange is attributed with its allocation fraction divided by the pivot amount. Attribution shapes:
  - **single**: undeclared exchanges belong to the reference product or treatment service. Ordinary emissions and waste exchanges retain their full quantities. A connected non-reference product requires an explicit allocation interpretation.
  - **legacy uniform share**: declared product outputs carry shares summing to 100%; each product inventory attributes applicable exchanges by that product's share. An undeclared non-reference product has zero share once the declared vector closes. An output quantitative reference without its own share remains ambiguous and produces `INVALID_ALLOCATION`; input-reference treatment retains its service interpretation.
  - **standard exchange-target allocation**: each exchange selects the share targeting the product. A declared vector sums to 100%; omitted targets in that vector have zero share. An undeclared exchange belongs to the source reference product.
- Each product has a demand row: `x_product = sum(consumer activity × allocated input coefficient) + final demand`. The Model reference receives its target as final demand. Product views of one source may have different activity scales.
- LU residuals and product-demand balances verify the numerical result. Singular systems produce `MODEL_NOT_SOLVABLE`; invalid numerical results produce `NUMERIC_RESULT_INVALID`.
- Solved activities retain small positive values. Within-tolerance negative numerical noise is clamped to zero; inventory aggregation omits only exact-zero exchanges.
- `productSystem.ts` projects each allocated view as a unit-reference Process provider. Its instance multiplier is the product activity. Unallocated single-reference inventories retain the source Process and multiplier `activity / reference amount`. Zero-demand instances retain multiplier zero.
- Each result scenario solves its own final-demand vector, including all connected upstream suppliers and cycles. The primary scenario uses the Model target; a secondary boundary-product or terminal-process scenario uses its source reference quantity. The net reference exchange records that scenario's functional unit.
- `productSystemPersistence.ts` materializes evaluated provider exchanges with `dataDerivationTypeStatus = Calculated`, removes executable allocation/formula fields, preserves source inventory metadata, and clears inherited review claims. Provider identity combines source instance, exact source Process version and product exchange. Existing provider IDs are reused for matching identities.
- `json_tg.xflow` keeps source nodes and links; standard `processInstance` references the projected providers and supplies the scalar for each complete referenced inventory. Allocated provider records are saved in the same bundle and tracked separately from primary/secondary result records. Result selectors and `referenceToResultingProcess` include only result records.
- Bundle version creation assigns one parent version to its created Processes. The database save function rewrites exact same-bundle Process references in standard instances and included-process provenance; external reference versions remain pinned.

## Hard Rules

- No pseudo-inverse, no edge deletion, no negative clamping, no legacy algorithm fallback, no automatic provider selection.
- `MODEL_NOT_SOLVABLE` is used only on solver-confirmed failure signals; unclassifiable numeric failures fall back to `CALCULATION_FAILED`.
- Negative LCIA amounts do not trigger `NEGATIVE_ACTIVITY`; that check covers solved activity levels only.
- Every input keeps at most one provider; one output may fan out to many consumers (their demands accumulate).
- Instances of the same source Process stay independent; flow identity includes the resolved version, and port versions must match.
- Connected internal flows cancel inside a submodel group and never re-enter the external inventory; unconnected flows stay as boundary exchanges.
- Boundary aggregation merges exchanges only at the exact Flow revision (direction + flow UUID + `@version` from the raw template): same-UUID exchanges at different revisions stay separate boundary exchanges until a documented conversion exists; the first template is never reused across revisions.
- Inventory assembly drops only exact-zero amounts — no magnitude threshold deletes nonzero computed quantities (small activity can still mean material load, and the functional-unit exchange must survive). The primary group must carry its quantitative-reference exchange; a missing or below-target reference exchange fails with `NUMERIC_RESULT_INVALID` instead of returning an incomplete success. Input-pivot (treatment) references may net to zero internally and are exempt from that check.

## Process Allocation Authoring And Result Reuse

- Process exchange editors accept multiple explicit product targets using existing `allocations.allocation` arrays. Target options require exact Flow-version evidence of `Product flow`; elementary, waste and unverified revisions are not new product targets. Existing unresolved entries stay visible for repair.
- Batch allocation fills only unconfigured selected exchanges by default; explicit replacement uses the same target/share rules and commits the complete update atomically. Existing legacy shares cannot silently mix with targeted vectors.
- `src/services/processes/allocation.ts` owns lossless object/array percentage normalization and authoring validation. Explicit vectors total 100% within 0.0010000001 percentage points, matching matrix closure tolerance. Process create/edit never inject legacy 100% output shares into an undeclared exchange.
- Exchange internal IDs remain stable after deletion; new IDs must avoid both existing rows and dangling allocation targets. Deleting a product referenced by other exchanges is blocked with the dependent exchange names/IDs.
- Allocation diagnostics identify each affected exchange, its targets and the reason. An unchanged inherited allocation graph may be saved as an unverified repair draft while unrelated fields are edited; new or changed invalid allocations and unavailable product verification block save. Validation, review and Model calculation always require valid allocations, including exact product-version verification. Copy, import and version creation preserve repairable inherited data without marking it rule-verified.
- Process serialization, rehydration and views preserve every allocation, including zero shares. Source exchange amounts are unchanged by editing allocation.
- Group inventories encode consumption as negative signed balances. Before persistence and static LCIA, `util_calculate.ts` converts them back to direction-aware TIDAS quantities (`Input`: negate the group amount; `Output`: retain it) and writes the group direction explicitly. Worker must apply the direction sign exactly once. The materialization regression serializes both primary and coproduct Processes and checks signed per-reference balances; optional `ALLOCATION_PARITY_OUTPUT` exports those actual payloads for Worker qualification.
- Generated primary/secondary Process exchanges already contain allocated quantities. `util_calculate.ts` clears inherited `allocations`; saving/reopening the generated Process must preserve that absence. Equivalent-scale reuse must reproduce the existing inventory, not multiply its original shares again.
- Input-reference treatment models retain their existing pivot behavior. Product allocation authoring requires verified product outputs; this feature does not reinterpret an input reference as an output product.

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

### Allocation repair diagnostics

`INVALID_ALLOCATION` carries the internal `allocationReason` for two product-interpretation cases: `MISSING_PRODUCT_ALLOCATION` identifies a non-reference product without allocation; `MISSING_REFERENCE_ALLOCATION` identifies an output reference without a share in a legacy allocated process. The worker and mutation service preserve the reason and instance/exchange location. The editor resolves localized repair instructions and the existing locate action. These metadata are runtime-only and do not change persisted schemas.

The source process defines product allocation. Repair requires a complete allocation or an already allocated source inventory; legacy product shares include an explicit reference share and total 100%. The model must reference the corrected source version before recalculation. A failed calculation returns before bundle persistence, preserving saved results. Successful recalculation and save replace the result according to the corrected inputs.

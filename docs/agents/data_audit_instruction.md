---
title: next Audit Status Reference
docType: reference
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when checking audit-state meaning
  - when validating allowed workflow transitions
  - when changing review or audit-management screens
whenToUpdate:
  - when audit-state codes change
  - when workflow transitions change
  - when the owning review-management UI paths move
checkPaths:
  - docs/agents/data_audit_instruction.md
  - src/pages/Review/**
  - src/pages/ManageSystem/**
lastReviewedAt: 2026-09-20
lastReviewedCommit: 4c008bb04f8717af6c8ce2e62f61aaca19fc5062
lastReviewedNote: 'Reviewed review input/output display parity against shared Process and LifeCycleModel data views. Audit transitions, ownership, validation requirements, and testing policy are unchanged.'
---

# Audit Status Reference

> Purpose: exact state-code meaning and transition rules for the audit workflow.

## Core Tables

| Table             | Role                                               |
| ----------------- | -------------------------------------------------- |
| `lifecyclemodels` | model data                                         |
| `processes`       | process data                                       |
| `flows`           | flow data                                          |
| `flowproperties`  | flow-property data                                 |
| `unitgroups`      | unit-group data                                    |
| `sources`         | source data                                        |
| `contacts`        | contact data                                       |
| `reviews`         | Root, Reference, and immutable legacy review tasks |
| `comments`        | assigned Review Member opinions                    |

New reviews use `review_kind = root | reference`. Migrated legacy source rows retain `review_kind = null` and remain read-only history. Root-to-Reference relationships are derived from the current dataset JSON and formally submitted Reviewer comments; a Reference Review is shared by every Root Review that uses the same exact dataset revision.

## Status Codes

### General Data Tables

| Code  | Meaning                                           |
| ----- | ------------------------------------------------- |
| `0`   | assigned to My Data, unsubmitted                  |
| `20`  | assigned to My Data, submitted and unaudited      |
| `100` | assigned to Open Data, audited and approved       |
| `200` | assigned to Commercial Data, audited and approved |

### `comments` Table

| Code | Meaning                                       |
| ---- | --------------------------------------------- |
| `-3` | rejected by auditor                           |
| `-2` | auditor removed                               |
| `-1` | rejected by audit administrator during review |
| `0`  | auditor assigned, not audited yet             |
| `1`  | approved by auditor                           |
| `2`  | approved by administrator in review           |

### `reviews` Table

| Code | Meaning                             |
| ---- | ----------------------------------- |
| `-1` | audit rejected                      |
| `0`  | data unassigned                     |
| `1`  | data pending audit                  |
| `2`  | approved by administrator in review |

## Transition Rules

| Event | Required state updates |
| --- | --- |
| submit an editable dataset | create a Root Review, or a new Reference Review when repairing a rejected reference; target `state_code: 0 -> 20`; new `reviews.state_code = 0` |
| submit a Root Review with references | create or reuse an exact Reference Review for every readable reference; append one immutable Root scope snapshot; referenced drafts enter `20` without broadening the submitter's access |
| Review Admin rejects before assignment or after assignment | `reviews.state_code -> -1`; only that review's target may return `20 -> 0`; all non-revoked comments `0/1/-3 -> -1`; revoked `-2` comments remain unchanged |
| assign previously unassigned data | `reviews.state_code -> 1`; `comments.state_code -> 0` |
| remove an assigned auditor | remove the reviewer from `reviews`; matching `comments.state_code -> -2` |
| Review Member approves | `comments.state_code -> 1`; simple Root/Reference approval has no opinion field |
| Review Member rejects | a non-empty reason is required; `comments.state_code -> -3` |
| Review Admin finally approves | after all current Review Members have completed, `comments.state_code -> 2`, `reviews.state_code -> 2`, and only the exact review target moves `20 -> 100` |

Review Member outcomes are advisory. Review Admin may finally approve even when every Review Member used `-3`, and may reject before every Review Member has completed. A Root Review may be approved while its Reference Reviews are still pending; this does not approve or release those references. Conversely, a Reference Review continues independently when its only Root Review is rejected.

## Batch Decision Boundary

- Review Admin `unassigned` selections expose batch reject only; this is a final admin rejection.
- Review Admin `assigned` selections expose batch approve and reject; both are final admin decisions.
- Review Member `pending` selections expose batch approve and reject; these submit only that member's advisory Comment outcome and never finalize the Review.
- Every selected Review is processed independently. A stale or unauthorized row is reported as an item failure without rolling back successful rows.
- Batch actions reuse the same state transitions, authorization, rejection-reason rules, and Process/Lifecycle Model metadata requirements as the corresponding single-item command.

Process and Lifecycle Model Root Reviews retain their existing metadata form and metadata writeback. Contact, Source, Unit Group, Flow Property, Flow, and every Reference Review use only approve/reject actions: approve requires no opinion; reject requires a reason.

## Review Admin Quality Diagnostic

Only Review Admin can manually start or read the joint pending-review quality diagnostic. The report combines completeness and numerical-stability information for the server-selected pending-review scope. It is evidence for operational judgment, not a workflow transition: `findings`, `not_evaluable`, request failure, and runtime failure do not block assignment, approval, rejection, or resubmission. Review Member does not see this control.

## Process Summary

1. each of the seven edit pages shows one `Submit Review` action
2. Process blocks only on editable current-record validation; no dataset type requires completeness or numerical-stability evidence to submit
3. the database decides Root versus rejected-Reference repair and records exact relations
4. Review Admin assigns Review Members; assignment sends no notification
5. Review Members record advisory opinions
6. Review Admin makes the final decision and only the data owner receives the result notification
7. rejection reasons are shown through notifications; dataset detail pages are unchanged
8. Review Management shows every matching Root and Reference Review as its own row in the top-level paginated table
9. only Process and Lifecycle Model Root rows can expand; their child table shows current Reference Reviews that match the selected tab
10. every top-level row keeps its own selectable action when the actor has permission; Review Members see only their assigned/readable reviews
11. the child table does not show a reference-path column, and no persisted or visible reference-overview field is required
12. every readable Root or Reference row exposes a view icon that opens the existing read-only Contact, Source, Unit Group, Flow Property, Flow, Process, or Lifecycle Model drawer; viewing does not alter review state or access

## Review Queue Search

All six task tabs use the v4 Admin/Member queue RPCs with `p_query`, reusing the seven dataset families' existing `search_text` projections. Matching binds the review's exact table/id/version and retains queue authorization and filters before task totals and pagination. Search reads that version's current stored projection, not submission-time historical content or submitter/team/opinion metadata. Root and Reference tasks match independently; expanded children keep the current tab's readable reference context. Search and clear reset paging, selection and expansion; repeated submissions refresh. Request/view epochs reject stale main and child responses. Query failures show the shared localized request error and are not reported as successful empty lists. Database v4 availability is a deployment prerequisite; v3 remains for older clients.

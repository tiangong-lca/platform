---
title: next Team Management Reference
docType: reference
scope: repo
status: active
authoritative: false
owner: next
language: en
whenToUse:
  - when changing team-management flows
  - when checking role-based permissions
  - when validating entry or exit behavior in team-management screens
whenToUpdate:
  - when role permissions change
  - when team-management flow rules change
  - when the owning UI paths move
checkPaths:
  - docs/agents/team_management.md
  - src/pages/Teams/**
  - src/pages/Review/**
  - src/pages/ManageSystem/**
lastReviewedAt: 2026-09-20
lastReviewedCommit: 4c008bb04f8717af6c8ce2e62f61aaca19fc5062
lastReviewedNote: 'Reviewed review input/output display parity against shared Process and LifeCycleModel data views. Audit transitions, ownership, validation requirements, and testing policy are unchanged.'
---

# Team Management Reference

> Purpose: exact role and flow rules for the team-management domain.

## Roles

| Role     | Allowed actions                                                     |
| -------- | ------------------------------------------------------------------- |
| `owner`  | invite users, delete users, set user roles, modify team information |
| `admin`  | invite users, delete users, modify team information                 |
| `member` | view only                                                           |

## Entry Flow: My Team

| User state             | Result                                       |
| ---------------------- | -------------------------------------------- |
| user already in a team | show team information and member information |
| user not in a team     | prompt to join a team or create a team       |

## Join vs Create Flow

| Action        | Result                                                               |
| ------------- | -------------------------------------------------------------------- |
| join a team   | show teams with `rank >= 0`; user contacts the team by email to join |
| create a team | user fills team information and becomes the owner after creation     |

## Member-Management Rule

Member-management actions are always role-gated:

- `owner`: full team-management surface
- `admin`: limited team-management surface
- `member`: no management actions

## Review Workflow Boundary

Team `owner` and `admin` roles do not assign, review, approve, reject, repair, or receive notifications for Root/Reference Reviews. Review Admin and Review Member remain the only review roles, while each dataset owner remains responsible for repairing and resubmitting rejected data.

Only Review Admin sees and manually runs the pending-review completeness and numerical-stability diagnostic. Review Member and every team role cannot start or read it through the product UI. Its report is informational and never changes the authority or availability of assign, approve, or reject actions.

Existing team membership and dataset visibility may determine whether a submitter can already read and reference another owner's draft. Review submission must not grant new team or cross-team access. Result notifications go only to the affected dataset owner.

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
lastReviewedAt: 2026-09-26
lastReviewedCommit: 735da3b6957955f81e71f44d31389aa3cc6caa3f
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

## Review Member Profile Onboarding

- Review Admin adds a registered Review Member directly by email and does not choose or bind a Contact.
- Review Member owns profile completion under `Review Management -> My reviewer profile`; Account settings and avatar menus do not expose a second entry point.
- Review task tabs remain unavailable until the account is bound to an owner-authored, rule-verified, open Contact revision.
- Initial profile creation forces the Contact data-set owner reference to that same Contact, validates the complete TIDAS payload and exact references, publishes it as state `100`, and binds it atomically.
- A bound profile is immutable through this surface. Updating it always creates and validates a new Contact version, publishes that version as state `100`, and explicitly asks whether to replace the account binding.
- The ordinary Contacts list, its edit behavior, and its navigation remain unchanged by reviewer onboarding.

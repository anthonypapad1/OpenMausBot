---
name: maintenance-triage
description: Triage tenant maintenance requests by urgency, match each to the right vendor, and draft the work order and the tenant reply for approval. Use when a request comes in, on the daily maintenance check, or when someone asks "what's open on maintenance?".
---

# Maintenance triage

## 1. Sort by urgency

- **Emergency, today**: no heat in winter, no water, a gas smell, flooding, sparking, a door or window that won't lock. Tell the manager at once.
- **Urgent, within 48 hours**: no hot water, a broken appliance, a leak that is contained, pests.
- **Routine**: everything else.

A gas smell or fire is a 911 call first: tell the tenant that plainly in the reply draft.

## 2. Match a vendor

The manager's vendors are in memory/vendors.md: trade, name, phone or email, and any rule (after-hours rate, owner approval above an amount). Pick the one for the trade. If the job may cost more than the owner's approval limit, say so and draft the owner's approval request first.

## 3. Draft

For each request, draft:

- the work order to the vendor: unit, what is wrong, access and pet notes, how to reach the tenant
- the reply to the tenant: what happens next and when

Show both as drafts; send nothing and book nothing without a yes.

## 4. Keep track

Each unit with an open request is a deal in the deal list (the unit address). Log each step with `deal_activity_add`, and list what is still open on the daily check.

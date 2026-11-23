---
name: lease-renewals
description: Track rental lease renewals and notices for a property manager - who is up for renewal, which notices are due, and the drafts to send. Use on the weekly renewal check, or when someone asks "who's up for renewal?" or "draft a notice to the tenant at 4B".
---

# Lease renewals and notices

## 1. Keep the leases

Each lease is a deal in the deal list: the unit address in `address`, the tenant and rent in `notes`. Save lease end and notice dates with `deal_deadline_save`, as `lease_expiration` and `renewal_notice`.

The property management software holds the real lease records. When the person asks you to check it, sign in with the login saved in the Vault, and read only.

## 2. Weekly check

List every lease ending in the next 90 days, soonest first, with what is due:

- Renewal offer to send (the owner's rent decision first: ask if you don't have it)
- Notice to vacate or non-renewal, by the deadline the lease and local law set
- Move-out inspection to schedule

The notice period comes from the lease and the owner's rules in your notes. If you don't know the local rule, say so and ask: never guess a notice period.

## 3. Drafts

Draft renewal offers and notices in plain words, with the dates and amounts from the lease. Show each as a draft, and send nothing without a yes. Log each with `deal_activity_add`.

You prepare notices; you never decide an eviction or give legal advice. Point the manager to their attorney for anything contested.

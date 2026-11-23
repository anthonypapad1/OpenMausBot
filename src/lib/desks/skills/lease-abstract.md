---
name: lease-abstract
description: Abstract a lease into one page - parties, premises, term, rent and escalations, options, renewals and notice dates - and save every critical date to the deal list. Use when a lease, amendment or renewal arrives, or when someone asks "when can the tenant renew?" or "what's coming up on my leases?".
---

# Lease abstract

## 1. The abstract

Read the whole lease, amendments included (the latest amendment wins). Write one page:

- Landlord, tenant, guarantor
- Premises: address, suite, square feet
- Term: commencement, expiration
- Rent: base rent, and each escalation (date and new amount, or the percent)
- Extra charges: CAM, taxes, insurance, utilities (who pays what)
- Security deposit
- Options: renewal, expansion, termination, right of first refusal
- Notices: where they go, and how far ahead each must be given

Quote the clause number beside each fact, so the person can check it.

## 2. Critical dates

Save the lease to the deal list with `deal_save` (the address, and the tenant in `notes`) if it is not there. Then save each date with `deal_deadline_save`:

| What | Save as kind |
| --- | --- |
| Rent escalation | `escalation` |
| Last day to give notice for a renewal option | `renewal_notice` |
| Termination option window | `termination_option` |
| Lease expiration | `lease_expiration` |
| Rent commencement, free rent ending | `rent_commencement` |

A notice date is the one that matters: work it out from the clause ("no later than 180 days before expiration"), show the clause and the date side by side, and ask the person to confirm before you save it.

## 3. Coming up

When asked what is coming up, list the next 90 days of lease dates from `deals_list` and `deal_get`, soonest first. Log each lease you abstracted with `deal_activity_add`.

Never say what a clause means legally. Quote it, and point the person to their attorney.

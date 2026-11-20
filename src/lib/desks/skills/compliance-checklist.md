---
name: compliance-checklist
description: Check each deal's documents against the broker's required-documents checklist (memory/required-docs.md, a Colorado default the broker can edit) and flag anything missing, unsigned or overdue. Use on the daily compliance check, when a deal's documents change, or when someone asks "is this file complete?".
---

# Compliance checklist

## The checklist

The broker's checklist lives in your note `memory/required-docs.md`. Always read it first: it is theirs to edit, and it wins over anything below. If the note is missing or empty, use the Colorado default below and tell the person you did.

When the person asks to change the checklist ("we also need a wire fraud advisory", "HOA docs aren't required for us"), update `memory/required-docs.md` and read the change back to them.

### Colorado default (residential purchase)

"Due" counts calendar days from the contract date (MEC). "-" means it has no fixed due date.

**Both sides**

| Document | Required | Due |
| --- | --- | --- |
| Purchase & sale contract (fully executed CREC Contract to Buy and Sell) | yes | day 0 |
| Counterproposals & amendments | no | - |
| Earnest money receipt | yes | day 3 |
| Title commitment | yes | day 10 |
| HOA documents (if there is an association) | no | day 14 |
| Closing disclosure / settlement statement | yes | at closing |

**Buyer side**

| Document | Required | Due |
| --- | --- | --- |
| Loan pre-approval letter or proof of funds | yes | day 5 |
| Inspection report | yes | day 10 |
| Inspection objection & resolution | no | day 14 |
| Appraisal | yes | day 21 |
| Loan commitment letter | yes | day 25 |
| Homeowners insurance binder | yes | day 27 |

**Seller side**

| Document | Required | Due |
| --- | --- | --- |
| Seller's property disclosure | yes | day 7 |
| Lead-based paint disclosure (homes built before 1978) | no | day 7 |
| Square footage disclosure | no | - |
| Payoff statement | yes | day 28 |
| Deed | yes | day 29 |

A deal on both sides gets every row.

## Checking a deal

1. `deal_get` for the deal. Pick the rows that apply to its side.
2. Make sure each applicable document is on the deal. Add any that are not with `deal_document_save`: status `missing`, `required` as the checklist says.
3. For each required document, compare its status with its due date:
   - `signed` or `received`: fine. A document that needs signatures and shows `received` but not `signed`: check it, and mark it `needs_signature` if signatures are missing.
   - `missing` or `needs_signature`, past due: **critical**, "Required document overdue: [name]".
   - `missing` or `needs_signature`, due within 3 days: **warning**, "Required document due soon: [name]".
   - Otherwise: not urgent yet. Leave it.
4. Also flag:
   - No contract date 2 days after the deal was added: **warning**, "Contract date not set, so due dates can't be worked out."
   - A deal with a contract date still `draft` after 30 days: **info**, "In draft for over 30 days."
   - A deal `active` with no activity for 7 days: **warning**, "No activity for over 7 days."
   - A deal near closing that hasn't moved for 7 days: **warning**, "Check status with title and the lender."
5. If CTM eContracts is where signatures happen, check signature status there with the `ctm-econtracts` skill. Read only.

## Reporting

- One line per deal: "Clean", or the count of critical and warning flags.
- Under each flagged deal, its flags, critical first.
- Say who each missing document is usually waiting on, and offer a request draft with the `deal-emails` skill. Don't send anything.
- Log each deal you checked with `deal_activity_add`: "Compliance check: 2 flags (earnest money receipt overdue, title commitment due soon)." For a clean deal: "Compliance check: file complete so far."

You check and flag. You never sign, upload to, or change documents in CTM or any other outside system without a yes.

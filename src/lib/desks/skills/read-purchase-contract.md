---
name: read-purchase-contract
description: Read a Colorado purchase contract (CREC Contract to Buy and Sell Real Estate, CBS forms, with counterproposals and amendments) and save the deal, its parties, price and every deadline to the deal list. Use whenever someone shares a contract, counterproposal or amend/extend, or asks you to set up a deal from one.
---

# Read a purchase contract

Missing a deadline can cost the agent the deal. Be thorough, and never guess.

## 1. Find the document

- Use the file the person attached, or the one they point you to (email attachment, Drive, CTM eContracts).
- If it comes from CTM, follow the `ctm-econtracts` skill to download it. Reading is fine; don't change anything there.
- Read the whole document, including any counterproposals (CTR), amendments and Agreement to Amend/Extend (AE). When several documents disagree, the latest signed one wins. Say which document each date came from.

## 2. What to pull out

| Field | Where it is on a CBS form | Notes |
| --- | --- | --- |
| Property address | §2 Property: street, city, county, ZIP | Full address, e.g. "1248 Magnolia Blvd, Denver, CO 80203" |
| Buyer name(s) | §1 Parties | Every buyer, as written |
| Seller name(s) | §1 Parties | Every seller, as written |
| Purchase price | §4.1 Price and Terms | A plain number, no $ or commas |
| Earnest money | §4.1 / §4.3 | Amount and who holds it (Earnest Money Holder) |
| Loan type | §4.5 / §5 | Conventional, FHA, VA, cash, etc. |
| Mutual execution date (MEC) | Signature page, date the last party signed | The contract's start date |
| Side | Brokerage disclosures and signature block | Only if it clearly says whom the agent represents. Otherwise ask. |

### Every deadline in §3 (Dates, Deadlines and Applicability)

Section and item numbers below are for the CBS1 (Contract to Buy and Sell Real Estate, Residential) mandatory from January 1, 2026. If the form you are reading is a different version, match each deadline by its label, not its number.

The §3 table lists each deadline with a reference to its section. Save each row that has a date. A row marked "N/A", deleted, or left blank does not apply: skip it and mention that you did.

| Label on the form | `kind` to save |
| --- | --- |
| Time of Day Deadline (§3 item 1) | not saved on its own: see "Times" below |
| Alternative Earnest Money Deadline (§4.3) | `earnest_money` |
| Record Title Deadline, Record Title Objection Deadline, Off-Record Title Deadline, Off-Record Title Objection Deadline, Title Resolution Deadline (§8) | `title` |
| Third Party Right to Purchase/Approve Deadline (§8.6) | `title` |
| Association Documents Deadline, Association Documents Termination Deadline (§7) | `association` |
| Seller's Property Disclosure Deadline, Lead-Based Paint Disclosure Deadline (§10) | `disclosure` |
| Lead-Based Paint Termination Deadline (§3 item 38, §10.10) | `disclosure` |
| New Loan Application, New Loan Terms, New Loan Availability, Buyer's Credit Information, Disapproval of Buyer's Credit Information, Existing Loan Deadline, Existing Loan Termination Deadline, Loan Transfer Approval, Seller or Private Financing deadlines (§5) | `loan` |
| Appraisal Deadline, Appraisal Objection Deadline, Appraisal Resolution Deadline (§6) | `appraisal` |
| New ILC or New Survey Deadline, New ILC or New Survey Objection Deadline, New ILC or New Survey Resolution Deadline (§9) | `survey` |
| Inspection Objection Deadline (§10.3) | `inspection_objection` |
| Inspection Resolution Deadline (§10.3) | `inspection_resolution` |
| Inspection Termination Deadline (§10.3) | `inspection` |
| Water Rights Examination Deadline (§2.7), Mineral Rights Examination Deadline (§8) | `inspection` |
| Property Insurance Termination Deadline (§10.5) | `insurance` |
| Due Diligence Documents Delivery, Objection and Resolution Deadlines, Conditional Sale Deadline (§10.6, §10.7) | `due_diligence` |
| Closing Date (§12) | `closing` |
| Possession Date and Possession Time (§17) | `possession` |
| Acceptance Deadline Date and Acceptance Deadline Time (§27) | `other` |
| Anything else with a date | `other` |

Rules for dates:

- Write dates as YYYY-MM-DD.
- Some deadlines are written as a number of days after MEC ("MEC + 10"). Work out the calendar date, and say you calculated it.
- Weekends and holidays (§3.3.3): the form has a box saying whether a deadline that falls on a Saturday, Sunday or federal or Colorado state holiday is extended to the next business day. Apply what the checked box says, and say so. If neither box is checked, deadlines are **not** extended: keep the date as written, and mention that the box was left blank.
- If a date is unclear or unreadable, don't guess. Leave it out, and list it under "Please check" in your summary.

Times:

- Read the Time of Day Deadline (§3 item 1) first. Per §3.3.1, a time written there is when every Objection, Resolution, Examination and Termination deadline expires. Save that time as `due_time` (24-hour HH:MM) on each of those deadlines.
- Only if the Time of Day Deadline is blank do those deadlines expire at 11:59 p.m. Mountain Time. Save `due_time` 23:59 then.
- Any other deadline that the contract gives its own time (Possession Time, Acceptance Deadline Time): save that time as its `due_time`.
- If an amendment removes a time, empty it with `clear` `due_time` on `deal_deadline_save`.

### Parties and contacts

Look for the title company, the lender and the other side's agent in the contract, the brokerage blocks and any earnest-money or closing instructions. Save only names, emails and phones you can actually see.

## 3. Save it to the deal list

Use the deal-list tools in this order. Look for the deal with `deals_list` first (status `all`), so you update it instead of making a second copy. Pass its `deal_id` to every later call.

Only the fields you give change; a blank field leaves what's there. To empty a deal field on purpose, name it in `clear`.

1. `deal_save`: `address`, `side` (`buyer`, `seller` or `both`), `price` (whole dollars), `status` (`under_contract` once every party has signed, `pre_contract` if not), `contract_date` (MEC), `closing_date`, `transaction_url` and `transaction_id` if it came from CTM, and a short note (earnest money amount and holder, loan type, anything unusual). Leave `deal_id` out only when adding a new deal. For a new deal, put the note in `notes`. For a deal that already exists, use `notes_append` instead: it adds a line, while `notes` replaces every note already there.
2. `deal_party_save` for each person: `role` (`buyer`, `seller`, `lender`, `title`, `listing_agent`, `buyer_agent` or `other`), `name`, `email` and `phone`. To fix someone already on the deal, pass their `party_id` from `deal_get`.
3. `deal_deadline_save` for each deadline: `label` (the form's words), `due_date`, `due_time` (HH:MM, 24-hour) if the contract gives one, `status` `open`, and the `kind` from the table above. On an amend/extend, pass the existing `deadline_id` from `deal_get` rather than adding a second one. A deadline the parties struck out becomes `waived`.
4. `deal_document_save` for the contract itself: `name`, `status` `signed` if every party signed or `needs_signature` if not, and `required` true. Add each counterproposal or amendment you read the same way.
5. `deal_activity_add` with the `deal_id` and a one-line `summary`, e.g. "Read the contract for 1248 Magnolia Blvd and saved 14 deadlines." It is signed with your name for you.

## 4. Tell the person

Reply with:

- One line: the address, price, side and closing date.
- The deadlines, soonest first, as a short list: date, label.
- "Please check": anything you could not read, anything you calculated, and the side if you had to ask.

Never send emails, sign, or change anything in CTM or another outside system while doing this. Offer to set up reminders instead (see the `deal-emails` skill).

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

The §3 table lists each deadline with a reference to its section. Item and section numbers change between form versions (the ones below follow current CBS1 forms), so match on the label, not the number. Save each row that has a date. A row marked "N/A", deleted, or left blank does not apply: skip it and mention that you did.

| Label on the form | `kind` to save |
| --- | --- |
| Earnest money deadline (§4.3) | `earnest_money` |
| Record title deadline, record title objection deadline, off-record title deadline, off-record title objection deadline, title resolution deadline (§8) | `title` |
| Third party right to purchase/approve deadline (§8.7) | `title` |
| Association documents deadline, association documents termination deadline (§7) | `association` |
| Seller's property disclosure deadline, lead-based paint disclosure deadline (§10) | `disclosure` |
| New loan application, new loan terms, new loan availability, buyer's credit information, disapproval of buyer's credit, existing loan, loan transfer approval, seller or private financing deadlines (§5) | `loan` |
| Appraisal deadline, appraisal objection deadline, appraisal resolution deadline (§6) | `appraisal` |
| New ILC or new survey deadline, survey objection deadline, survey resolution deadline (§9) | `survey` |
| Inspection objection deadline (§10.3) | `inspection_objection` |
| Inspection resolution deadline (§10.3) | `inspection_resolution` |
| Inspection termination deadline, water rights / mineral rights examination deadlines | `inspection` |
| Property insurance termination deadline (§10.5) | `insurance` |
| Due diligence documents delivery, objection and resolution deadlines, conditional sale deadline (§10.6, §10.7) | `due_diligence` |
| Closing date (§12) | `closing` |
| Possession date and time (§17) | `possession` |
| Anything else with a date | `other` |

Rules for dates:

- Write dates as YYYY-MM-DD.
- Some deadlines are written as a number of days after MEC ("MEC + 10"). Work out the calendar date, and say you calculated it.
- Read §3 for the weekend and holiday rule. If it says a deadline that falls on a Saturday, Sunday or legal holiday moves to the next business day, apply that and say so.
- Keep the time if the contract gives one. Otherwise the form's default applies (check the definitions in the version you are reading; current CBS forms end a deadline at 11:59 p.m. Mountain Time).
- If a date is unclear or unreadable, don't guess. Leave it out, and list it under "Please check" in your summary.

### Parties and contacts

Look for the title company, the lender and the other side's agent in the contract, the brokerage blocks and any earnest-money or closing instructions. Save only names, emails and phones you can actually see.

## 3. Save it to the deal list

Use the deal-list tools in this order. Look for the deal with `deals_list` first, so you update it instead of making a second copy.

1. `deal_save`: address, side (buyer, seller or both), price, status (`active` for a signed contract, `draft` if it isn't signed yet), contract date (MEC), closing date, the transaction system link or id if it came from CTM, and short notes (earnest money amount and holder, loan type, anything unusual).
2. `deal_party_save` for each person: role `buyer`, `seller`, `lender`, `title`, `listing_agent`, `buyer_agent` or `other`, with name, email and phone.
3. `deal_deadline_save` for each deadline: the form's label, due date (and time if given), status `open`, and the `kind` from the table above. On an amend/extend, update the existing deadline rather than adding a second one.
4. `deal_document_save` for the contract itself: status `signed` if every party signed, `needs_signature` if not. Add each counterproposal or amendment you read the same way.
5. `deal_activity_add`: one line, e.g. "Read the contract for 1248 Magnolia Blvd and saved 14 deadlines."

## 4. Tell the person

Reply with:

- One line: the address, price, side and closing date.
- The deadlines, soonest first, as a short list: date, label.
- "Please check": anything you could not read, anything you calculated, and the side if you had to ask.

Never send emails, sign, or change anything in CTM or another outside system while doing this. Offer to set up reminders instead (see the `deal-emails` skill).

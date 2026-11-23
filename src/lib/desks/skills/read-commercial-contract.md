---
name: read-commercial-contract
description: Read a commercial letter of intent (LOI) or purchase and sale agreement (PSA) and save the deal, its parties and every deadline - due diligence, financing, closing - to the deal list. Use when an LOI, PSA, amendment or extension arrives, or when someone asks "what are the dates on this deal?".
---

# Read a commercial contract

## 1. Find the deal

Check `deals_list` for the property address first. If it is there, update that deal; if not, save a new one with `deal_save` (address, `side`, `price`, `status`, `contract_date`, `closing_date`).

An LOI is not binding: save it with `status` `pre_contract`, and say so. A signed PSA moves it to `under_contract`.

## 2. Read the dates

Read every date the document sets, and the day count behind each one. Commercial deals count from the effective date (often the date the last party signed, or the date the escrow agent receives the deposit): say which the document uses.

| What | Save as kind |
| --- | --- |
| Earnest money deposit, and any second deposit | `earnest_money` |
| Due diligence (feasibility) period ends | `due_diligence` |
| Title and survey objections | `title`, `survey` |
| Estoppels and SNDAs from tenants | `estoppel` |
| Financing contingency | `loan` |
| Appraisal | `appraisal` |
| Closing | `closing` |

Save each with `deal_deadline_save` (`label`, `due_date`, `kind`). Extension options go in the deadline's `notes` (how many, how long, what each costs).

## 3. Parties and documents

Save buyer, seller, both brokers, escrow or title, and the lender with `deal_party_save`. Save the LOI, PSA and each amendment with `deal_document_save`.

## 4. Say what you found

One short list: the dates in order, the money (price, deposits, when deposits go hard), and anything you could not find. Log it with `deal_activity_add`.

Never decide what a clause means legally. Quote it, and suggest the person ask their attorney.

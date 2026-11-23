---
name: office-audit
description: Audit a brokerage's deal files against its own checklist, track missing signatures across every agent's files, and keep agents' license and E&O renewal dates. Use on the office audit routine, when the broker asks "which files aren't ready to close?", or "whose license renews this quarter?".
---

# Office audit

## 1. Audit the files

Read the brokerage's checklist in memory/required-docs.md first: it is the broker's own, and it wins over any default. Then check every open deal from `deals_list` against it with the compliance-checklist skill, agent by agent.

Report by agent, worst first: files missing a required document, files with an unsigned document, files closing in the next 7 days that are not complete. One line per gap: deal, document, what is wrong, who must fix it.

## 2. Signatures

For each document still `needs_signature`, say who has not signed and for how long. Draft one reminder per agent (not per document) for the broker's approval, and send nothing without a yes.

## 3. Licenses and E&O

Keep memory/office.md: each agent's license number and renewal date, their continuing education due, and the brokerage's E&O policy and renewal date. List renewals in the next 60 days on each audit, soonest first. Never mark a renewal done until the broker or the agent confirms it.

## 4. Log

Log each file you audited with `deal_activity_add`.

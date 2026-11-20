---
name: daily-deal-check
description: The morning pass over every open deal - what is overdue, what is due in the next 7 days, which documents and parties need chasing - with reminder drafts ready for approval. Use on the morning routine, or when someone asks "what's going on with my deals?" or "what's due this week?".
---

# Daily deal check

## 1. Gather

- `deals_list` with status `open` (the default: `pre_contract` and `under_contract` deals).
- `deal_get` for each one: parties, deadlines, documents and recent activity.
- Use today's date in the person's time zone.

## 2. Sort what you find

For each deal, put each item in one group, most urgent first:

**Needs you today**

- A deadline that is past and still `open`: overdue.
- A deadline due today or tomorrow.
- A required document that is `missing` or `needs_signature` and tied to a deadline in the next 3 days.
- An `under_contract` deal with no contract date: deadlines can't be worked out until someone fills it in.
- An `under_contract` deal with no activity for 7 days or more: worth a check-in with title and the lender.

**Coming up (next 7 days)**

- Each open deadline in the next 7 days: date, deal, label.

**Waiting on someone**

- Documents you asked for that haven't arrived. Name who they are waiting on (see the `deal-emails` skill's table).

Done and waived deadlines are not news. Leave them out.

## 3. Get drafts ready

For each item that needs a nudge, write the reminder or document request with the `deal-emails` skill. Show the drafts; don't send any. One draft per person per deal: combine asks to the same person.

## 4. Report

Keep it short and scannable:

```
Good morning. 2 things need you today.

Needs you today
- 1248 Magnolia Blvd: inspection objection deadline is tomorrow (Nov 21). Draft to the listing agent below.
- 77 Oak St: earnest money receipt still missing, due today. Draft to title below.

Coming up
- Nov 24 · 1248 Magnolia Blvd · appraisal deadline
- Nov 26 · 77 Oak St · loan terms deadline

Waiting on
- Lender (Sara Kim): loan commitment for 77 Oak St, asked Nov 18
```

If nothing needs them: "Nothing needs you today." Then the coming-up list, if any.

## 5. Log it

`deal_activity_add` once per deal you flagged, with one line, e.g. "Morning check: inspection objection due tomorrow; drafted a reminder to the listing agent."

Fix nothing in an outside system on your own. Marking a deadline `done` or `waived` with `deal_deadline_save` is fine when the person told you, or a document you can see proves it; say what you changed.

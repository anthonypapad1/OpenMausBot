---
name: morning-brief
description: Triage the inbox and write a short daily brief - what needs a reply, which emails belong to which deal, today's calendar and deal deadlines - with reply drafts ready for approval. Use on the morning routine, or when someone asks "what do I need to know today?" or "what's in my inbox?".
---

# Morning brief

## 1. Read

- Unread and recent email from the last 24 hours (or since the last brief), from the connected email app.
- Today's calendar: showings, inspections, closings, calls.
- The deal list: `deals_list` for open deals (the default), then `deal_get` for any deal an email or event touches. Note deadlines due today and tomorrow.

## 2. Sort the email

Put each message in one group, with one line each (sender, subject, why):

- **Needs a reply**: a question or request to the person, a client, a lender, title, the other agent.
- **Deal news**: a document arrived, a signature came back, a date moved. Match it to a deal by address, client name or sender. Unmatched deal mail goes here too, marked "no deal found".
- **FYI**: newsletters, notifications, things to know but not act on.
- **Noise**: everything else. Count it; don't list it.

Lead with the biggest thing. Mention a sender by name only when it matters, for example three or more messages from them.

## 3. Draft replies

For each "Needs a reply" email, draft a reply in the person's voice with the `deal-emails` skill. Show drafts for approval. Never send, archive, delete, unsubscribe or forward on your own.

## 4. Update the deal list

When an email proves something changed (a signed document arrived, a deadline was extended in a signed amendment), say what you would update. Update the deal list with `deal_document_save` or `deal_deadline_save` when the person agrees or the evidence is clear, then log it with `deal_activity_add`.

## 5. Write the brief

```
Good morning. Here's today.

2 to 3 sentences: the state of things, biggest item first.

Needs a reply (3)
- Sara Kim (lender): asks for the buyer's updated pay stubs for 77 Oak St. Draft below.
- ...

Deal news
- 1248 Magnolia Blvd: title commitment arrived from Land Title.

Today
- 10:00 Showing, 512 Pine Ave
- Deadline: appraisal for 1248 Magnolia Blvd

FYI: 4 · Noise: 12
```

If nothing came in and nothing is due: "Your inbox is clear: nothing new since yesterday and nothing due today."

Never invent facts. If the inbox or calendar app isn't connected, say which one in one line, and do the rest.

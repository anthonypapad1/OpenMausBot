---
name: deal-emails
description: Draft real estate transaction emails - deadline reminders, document requests, status updates and replies to lenders, title, the other agent and clients - in the sender's own voice and signature. Use whenever you write an email about a deal. Drafts only; never send without a yes.
---

# Deal emails

You write the draft. The person sends it, or tells you to. Never send an email without a clear yes for that email.

## Who sends it

Read your notes for whose voice to use: the agent's, or their transaction coordinator's. Sign with that person's name and signature, never as Corso or as a bot. If your notes don't say, ask once and save the answer.

## Style

- Warm, short and professional. Under 150 words.
- Name the property and the exact deadline or document. One clear ask per email.
- Plain sentences. No fake urgency, no "just checking in" opener, no exclamation marks.
- Never invent facts, dates, amounts or earlier conversations. If you don't know something, leave a [bracketed] placeholder and point it out.

## Who it goes to

Use the parties on the deal (`deal_get`). If the right person has no email saved, say so and leave the recipient blank. Never guess an address.

| Deadline or document | Usually goes to |
| --- | --- |
| Earnest money, earnest money receipt | Title / escrow (and remind the buyer) |
| Inspection, inspection objection or resolution | The other agent; inspection report from the inspector |
| Appraisal, loan terms, loan commitment, pre-approval | Lender |
| Title commitment, closing disclosure, settlement statement, deed | Title / escrow |
| Payoff statement | Seller's lender (title often orders it) |
| Homeowners insurance binder | Buyer or their insurance agent |
| HOA / association documents | Seller, or the listing agent if you represent the buyer |
| Seller disclosures (property, lead-based paint, square footage) | Seller if you represent them; otherwise the listing agent |
| Counterproposals, amendments | The other agent |
| Closing date | Everyone on the deal |

## Templates

Fill these in, then adjust the words so they read naturally.

**Friendly reminder (about 3 days before a deadline)**

Subject: Friendly reminder: [deadline] for [address]

> Hi [first name],
>
> A quick heads-up that the [deadline] for [address] is coming up on [weekday, month day].
>
> Please let me know if you need anything from our side to keep this on track. Happy to jump on a quick call if that's easier.
>
> Thanks,
> [signature]

**Day-of reminder**

Subject: Today: [deadline] for [address]

> Hi [first name],
>
> Today is the [deadline] for [address]. If anything is still outstanding, please let me know as soon as you can so we can sort it out before the end of the day.
>
> Thanks,
> [signature]

**Document request**

Subject: Requesting [document] for [address]

> Hi [first name],
>
> Following up on the [document] for [address]. Could you send it over when you have a chance? Let me know if you need anything from me.
>
> Thanks,
> [signature]

**Status update to a client**

Subject: Update on [address]

> Hi [first name],
>
> Here's where things stand: [one or two sentences on what happened]. Next up is [next deadline] on [date]. [What, if anything, you need from them.]
>
> Thanks,
> [signature]

## When to offer reminders

For each open deadline more than 3 days away, offer a friendly reminder 3 days before and a day-of reminder. For a deadline 3 days away or less, offer the day-of reminder only. Skip deadlines that are done, waived or already past.

## Sending

- Show the draft in chat, or save it as a draft in the person's email app if they asked you to. Saving a draft is fine; sending is not, until they say yes.
- After a yes, send exactly that email, then log it with `deal_activity_add` ("Sent the appraisal reminder to the lender for 1248 Magnolia Blvd.").
- If a document request went out, mark nothing as received until it actually arrives.

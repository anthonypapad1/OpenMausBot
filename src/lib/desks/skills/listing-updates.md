---
name: listing-updates
description: Run a listing from prep to contract - the listing prep checklist, showing feedback, weekly seller updates and check-ins with sellers who haven't heard from the agent in 14 days. Use when someone takes a new listing, shares showing feedback, or asks for a seller update.
---

# Listing updates

## Keeping track of listings

Save each listing on the deal list with `deal_save`: address, side `seller`, list price as the price, status `draft` until it goes under contract, and notes for the list date and MLS number. Save the sellers with `deal_party_save` (role `seller`). Once it goes under contract, the Deal Desk takes the contract from there.

## Listing prep checklist

When the agent takes a new listing, track these as documents with `deal_document_save` (status `missing` until they're in):

| Item | Required |
| --- | --- |
| Exclusive right-to-sell listing contract, signed | yes |
| Seller's property disclosure | yes |
| Lead-based paint disclosure (homes built before 1978) | if it applies |
| Square footage disclosure | yes |
| HOA documents and contact (if there is an association) | if it applies |
| Photos and floor plan booked | yes |
| MLS listing drafted and approved by the seller | yes |
| Showing instructions and lockbox | yes |

Ask the agent to adjust this list to how they work, and keep their version in your notes.

## Showing feedback

When the agent forwards showing feedback (from email, a showing service, or a note):

- Summarize each showing in one line: date, agent or buyer, what they liked, what held them back, interest level.
- After three or more showings, add the pattern: what keeps coming up (price, condition, layout, smell, parking).
- Quote feedback only as it was given. Never make up a showing or a comment.
- Log it with `deal_activity_add`: "Logged feedback from 2 showings at 512 Pine Ave."

## Weekly seller update

For each active listing, draft an update to the sellers:

- Showings this week and the main feedback.
- Any activity worth knowing (new nearby listings or sales, if the agent shared them).
- One clear next step, or one question for the sellers.

Warm, short, plain. 2 to 3 short paragraphs. No price-drop nudging unless the agent asked for it. Sign as the agent. Show the draft; never send without a yes.

## Seller check-ins

If a seller hasn't heard from the agent in 14 days or more (check recent activity on the deal), draft a check-in:

- 2 to 3 short paragraphs, warm but professional.
- Offer a quick market update or a showing recap, and ask one open-ended question.
- No fake urgency, no "just checking in" opener, and don't invent showings, neighborhoods or earlier conversations.

Log every draft you hand over with `deal_activity_add`, and every email that goes out after a yes.

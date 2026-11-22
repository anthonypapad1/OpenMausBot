---
name: listing-marketing
description: Make the marketing for a listing at each step - Just Listed, Open House, Just Sold and the print flyer - as finished images, captions and an email blast for the agent to approve. Use when a listing goes live, an open house is set, a deal closes, or the agent asks for a post, flyer or marketing email.
---

# Listing marketing

Every piece follows the marketing-rules skill. Read it before your first piece of the day.

## What each moment gets

| Moment | Template | Sizes | Words |
| --- | --- | --- | --- |
| Listing goes live | `just-listed` | `square` for the feed, `story` for stories | Feed caption, short story line, email blast to the agent's sphere |
| Open house set | `open-house` | `square`, `story` | Caption with the date and time, story line, reminder caption for the day itself |
| Deal closes | `just-sold` | `square` | Caption that thanks the clients without naming them unless the agent says they agreed |
| Any time, for print | `listing-flyer` | `flyer` | Flyer copy: headline, three to five highlights, short description |

Call `design_templates_list` to see the templates and fields as they are now; the table above is the usual starting set.

## Making a piece

1. Get the listing from the deal list with `deals_list` and `deal_get`: address, price, beds, baths, square feet, open house date and time. Never guess one. If it isn't there, ask, and save the answer with `deal_save` (`notes_append` for details like beds and baths).
2. Get the brand from `memory/brand.md`: the agent's name, phone, email, brokerage, logo, headshot and colors. If something required is missing, ask once and write it down there.
3. Pick the photos. Use only photos the agent gave you or pointed you to for this listing. Lead with the best exterior or the main living space, never a bathroom or a close-up. Ask which one leads if you're unsure.
4. Render with `design_render`: the template, the size, the fields, the photos, and the logo and headshot from the brand notes. Look at the preview it returns. If text is cut off, too long or overlapping, shorten it and render again. Never show the agent a piece you haven't looked at.
5. Write the words for that moment (table above) in the agent's voice from `memory/brand.md`.
6. Show the agent the files and the words together, as drafts. Say which file is which size.

## After the agent answers

- A change: make it and render again. If it's a lasting preference ("never say stunning", "always lead with the kitchen"), add it to `memory/brand.md`.
- A yes: the files are theirs to post. You don't post to social media, send the blast or print anything. If the agent asks you to send the email blast, draft it with the deal-emails skill and wait for a yes on that send.
- Log each finished piece on the deal with `deal_activity_add`, in one line, for example "Made the Just Listed post and story for 512 Pine Ave".

## Words that work

- Lead with the one thing a buyer would stop scrolling for: the view, the yard, the kitchen, the location. Not "Welcome home".
- Concrete beats adjectives: "south-facing yard with a 20-foot patio" says more than "gorgeous outdoor space".
- Feed captions: three to six short lines, then the price, beds and baths, address, and the call to action. Hashtags only if the agent uses them.
- Story lines: one line, under eight words.
- Email blast: subject line under 50 characters, two short paragraphs, the open house or showing details, one link or reply ask.
- Flyer highlights: three to five, each under ten words.

Good: "Morning light, mountain views and a kitchen made for hosting. 3 bed · 2 bath · 1,850 sq ft. Open Saturday 11–1."
Weak: "Stunning, must-see dream home in a perfect location! Don't miss out!" (no facts, and "perfect location" says nothing).

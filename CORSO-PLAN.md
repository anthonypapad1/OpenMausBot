# Corso plan

Corso is a desktop app that real estate agents download. It's a fork of OpenMausBot, built on the Dusk model. The agent connects Claude and their own business apps, then sets up bots, starting from Corso's real estate defaults. Bots run for free on the agent's own computer. A paid Corso Cloud plan keeps them running 24/7.

## Decisions (2026-11-19)

- **First customer:** solo agent.
- **What it is:** a general bot platform with real estate defaults, not a closed real estate system. Agents can build any bot they want.
- **Platforms:** Mac and Windows. The first release is a public free download from runcorso.ai.
- **Models:** the agent's Claude Code login (subscription), their Anthropic API key, other models (Codex, Gemini, etc.), or Corso-provided usage on the paid plan.
- **Free vs paid:** it's the same app. Free runs while the computer is on. Paid moves the bots to Corso Cloud, so they run 24/7 and can be reached from the phone.
- **Apps:** the agent picks and connects their own. No connector is required. When you add a default bot, it asks which apps you use (CRM, email, transaction system) and walks you through connecting them.
- **Kept from the fork:** the phone app and approvals, the bot browser and computer use, group chats with @mentions, and the developer extras.

## Default bots

| Bot | Job | Corso code to port |
| --- | --- | --- |
| Transaction coordinator | Reads the contract, tracks deadlines, chases documents and parties to close | `extraction.ts`, `extraction-schema.ts`, `prompts/extract.system.md`, `deal-context.ts`, `email-templates.ts` |
| Lead follow-up | Answers and nurtures new leads | `lead-coordinator/`, `buyer-pipeline/` |
| Listing coordinator | Listing prep, showing feedback, seller updates | `listing-coordinator/`, `seller-pipeline/` |
| Inbox / admin | Triages email, drafts replies, manages the calendar, daily brief | `inbox-summary.ts`, `inbox-narrative.ts`, `today.ts`, `prompts/rewrite.system.md` |
| Compliance | Checks each deal's documents against the broker's required-docs checklist and flags anything missing or unsigned | `compliance/evaluator.ts`, `compliance/status.ts`, `compliance/schema.json` |

Each bot ships as a bot template: instructions, skills, a suggested schedule, and the apps it asks for.

## Recommendations on the two open questions

**Corso web app: take the useful parts, then retire it.** The prompts, extraction, email templates, coordinator logic and compliance checklist become skills inside the app. Keep the landing page and waitlist on Vercel as the download site. Keep Supabase for later, as the base for Corso Cloud (accounts, billing, cloud bots). Retire the web dashboard, email queue UI, admin pages and the MCP server's public surface. The Managed Agents test and PR #230 are parked. They only matter if Corso Cloud runs bots on Anthropic's hosted agents.

**Deal data: one shared deal list on the agent's computer, plus the fork's normal memory notes.** The transaction coordinator, compliance and listing bots all need the same deadlines and document status, and free-form notes drift. A small local store (deals, parties, deadlines, documents) exposed as tools gives every bot the same view. Anything else stays in memory notes, which the agent can read and edit.

## Order of work

1. **Clean base**
   - Commit the rebrand.
   - Delete `enterprise/`.
   - Point updates, announcements and the model list at Corso's repo.
   - Switch to our own Composio key.
   - Turn off upstream bug reports, cloud and phone accounts until ours exist.
   - Hide the original author's branding.
2. **Corso defaults**
   - Build the deal-list tools.
   - Write the five bot templates.
   - Add the "which apps do you use?" setup flow.
   - Port the Corso prompts and logic as skills.
3. **Public release**
   - Rename the installer.
   - Replace the mascot.
   - Sign and notarize on Mac, sign on Windows.
   - Auto-update from our releases.
   - Put the download on runcorso.ai.
4. **Corso Cloud (paid)**
   - Run bots 24/7.
   - Add phone accounts and relay.
   - Add Corso-provided Claude usage and billing.

## Things to settle

- **Phone app timing.** Pairing the phone needs an account service. That's the `accounts.openmausbot.com` part we're turning off. We either build a small one before the public release, or the phone app arrives with Cloud.
- **Costs for a public download.** We'll need an Apple Developer account and a Windows code-signing certificate. Composio usage is billed to our key for every free user, so we may need a cap.
- **Developer extras.** You picked these under "keep". Confirm they stay visible to agents rather than being hidden behind a setting.

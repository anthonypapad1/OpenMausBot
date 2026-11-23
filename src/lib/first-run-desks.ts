// The first run makes the Desks its path gets (desks/path-desks.ts) once the Chief of Staff is in place, the way the
// gallery's Add would: each from the New bot defaults with the Desk's instructions, notes, skills and paused routines.
import type { ReadyBot } from "@/lib/ready-bots";
import { readyBotTemplate } from "@/lib/ready-bots";
import { api, type Action, type Bot } from "@/state/store";
import { BotCreationDraft } from "./bot-creation-draft";
import { isBotLimitRefusal } from "./bot-limit";
import { createConfiguredBot } from "./create-configured-bot";
import { t } from "./i18n";
import { announceNewBot, startingTemplate, type BotDefaultsAnswer } from "./new-bot";

/** Makes each Desk no bot here is named after yet, one after another, without leaving the chat the run ended on. A plan's
 * bot limit stops the rest quietly (its own popup explains); any other failure says so and stops. */
export async function createFirstRunDesks(desks: readonly ReadyBot[], bots: ReadonlyArray<Pick<Bot, "name">>,
  dispatch: (action: Action) => void, request: typeof api = api): Promise<string[]> {
  const taken = new Set(bots.map((bot) => bot.name.trim().toLowerCase()));
  const missing = desks.filter((desk) => !taken.has(desk.name.toLowerCase()));
  const made: string[] = [];
  if (!missing.length) return made;
  try {
    const defaults = startingTemplate(await request<BotDefaultsAnswer>("/api/bot-defaults"), true);
    for (const desk of missing) {
      const draft = new BotCreationDraft(readyBotTemplate(defaults, desk), () => {}, request);
      // Auto on this computer needs the person's own OK, which a Desk made for them has not had.
      if (draft.bot.approvalMode === "auto" && draft.bot.computer === "local") draft.patch({ approvalMode: "ask" });
      try {
        const { bot, warnings, paused } = await createConfiguredBot(draft, request);
        announceNewBot(dispatch, bot, warnings, { preserveSelection: true, showThreads: false, source: "template", role: desk.id, paused });
        made.push(bot.id);
      } finally {
        draft.dispose();
      }
    }
  } catch (cause) {
    if (!isBotLimitRefusal(cause)) dispatch({ type: "error", message: t("newBot.failed", { error: cause instanceof Error ? cause.message : String(cause) }) });
  }
  return made;
}

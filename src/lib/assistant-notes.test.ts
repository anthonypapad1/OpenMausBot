import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ api: vi.fn(), runGrokMove: vi.fn(), copy: vi.fn() }));
vi.mock("@/state/store", () => ({ api: f.api }));
vi.mock("./grok-move", async (original) => ({ ...(await original<typeof import("./grok-move")>()), runGrokMove: f.runGrokMove }));
vi.mock("./copy-text", () => ({ copyText: f.copy }));
vi.mock("./own-profile", () => ({ saveTeamProfile: vi.fn() }));
import { setLocale } from "@/lib/i18n";
import { NOTES_FORMAT } from "../../shared/assistant-notes";
import { GrokImportError, grokMovePlan, readBot } from "../../shared/grok-import";
import {
  copyNotesPrompt, importNotes, looksLikeNotes, notesErrorLine, notesInFiles, notesOutcomeLine, notesWaiting, notesWatch, REMIND_AFTER_MS, scheduleNotesReminder, stopWaiting,
  takeNotesFromDownloads, WATCH_FOR_MS,
} from "./assistant-notes";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, String(v)), removeItem: (k: string) => void values.delete(k) };
};
const notes = (extra: Record<string, unknown> = {}) => `\`\`\`json\n${JSON.stringify({
  format: NOTES_FORMAT, version: 1, from: "Claude", about_me: ["Name is Sam."], instructions: "Be brief.", memories: ["Listing launch for 12 Elm St in March."],
  bots: [{ name: "Offer writer", instructions: "Draft offers." }], ...extra,
})}\n\`\`\``;

beforeEach(() => {
  setLocale("en");
  vi.stubGlobal("localStorage", memoryStorage());
  f.api.mockReset();
  f.runGrokMove.mockReset();
  f.copy.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("waiting for notes from another AI", () => {
  it("starts on a copy, keeps its first start on a second copy, and stops", async () => {
    f.copy.mockResolvedValue("copied");
    expect(await copyNotesPrompt(1_000)).toBe(true);
    expect(await copyNotesPrompt(9_000)).toBe(true);
    expect(notesWaiting()).toEqual({ since: 1_000 });
    stopWaiting();
    expect(notesWaiting()).toBeNull();
    f.copy.mockResolvedValue("failed");
    expect(await copyNotesPrompt()).toBe(false);
    expect(notesWaiting(), "nothing to wait for when the copy failed").toBeNull();
  });

  it("reminds once, 15 minutes after the copy, only while still waiting", async () => {
    vi.useFakeTimers();
    f.copy.mockResolvedValue("copied");
    await copyNotesPrompt(Date.now());
    const show = vi.fn();
    scheduleNotesReminder(show);
    vi.advanceTimersByTime(REMIND_AFTER_MS - 1);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenCalledOnce();
    scheduleNotesReminder(show);
    vi.advanceTimersByTime(REMIND_AFTER_MS * 2);
    expect(show, "never a second time").toHaveBeenCalledOnce();
  });

  it("doesn't remind late for a copy made before the app was closed, or after the notes came", async () => {
    vi.useFakeTimers();
    f.copy.mockResolvedValue("copied");
    await copyNotesPrompt(Date.now() - REMIND_AFTER_MS * 4);
    const show = vi.fn();
    scheduleNotesReminder(show);
    vi.advanceTimersByTime(REMIND_AFTER_MS);
    expect(show).not.toHaveBeenCalled();
    stopWaiting();
    await copyNotesPrompt(Date.now());
    scheduleNotesReminder(show);
    stopWaiting();
    vi.advanceTimersByTime(REMIND_AFTER_MS);
    expect(show).not.toHaveBeenCalled();
  });
});

describe("bringing notes in", () => {
  it("puts facts and instructions in About me, memories in the first bot's memory, and makes a bot for each of its own", async () => {
    f.copy.mockResolvedValue("copied");
    await copyNotesPrompt();
    f.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/api/config") return { profile: JSON.parse(init!.body!).profile };
      if (path.startsWith("/api/bots/corso/memory/file?")) return { text: "" };
      if (path === "/api/mcp/servers") return { servers: [] };
      return { ok: true };
    });
    f.runGrokMove.mockResolvedValue({ bots: [{ name: "Offer writer", routines: 0 }], moved: [], unreadable: [], failed: [] });
    const dispatch = vi.fn();
    const outcome = await importNotes(`Here you go:\n${notes()}`, { bots: [], aboutMe: "I sell homes.", team: false, firstBotId: "corso", dispatch });
    const about = JSON.parse(f.api.mock.calls.find(([path]) => path === "/api/config")![1].body).profile.aboutMe;
    expect(about).toMatch(/^I sell homes\.\n\n- \d{4}-\d{2}-\d{2} · learned by Claude · Name is Sam\./);
    expect(about).toContain("Be brief.");
    const memory = JSON.parse(f.api.mock.calls.find(([path, init]) => path === "/api/bots/corso/memory/file" && init?.method === "PUT")![1].body);
    expect(memory.path).toBe("memory/notes-from-claude.md");
    const preview = f.runGrokMove.mock.calls[0]![0];
    expect(preview.plans.map((plan: { name: string }) => plan.name)).toEqual(["Offer writer"]);
    expect(preview.plans[0].document.package.author.name, "a custom GPT says which app it came from").toBe("Claude");
    expect(dispatch).toHaveBeenCalledWith({ type: "profileSaved", profile: { aboutMe: about } });
    expect(notesOutcomeLine(outcome)).toBe("Brought in from Claude: 2 things about you, 1 memory, and 1 bot.");
    expect(notesWaiting(), "the waiting ends once they came in").toBeNull();
  });

  it("keeps the person's deals and open threads in the first bot's notes, and adds a bot's new memories to the one a paste made before", async () => {
    const offer = { name: "Offer writer", instructions: "Draft offers.", memories: ["Sam writes escalation clauses."] };
    const packageId = grokMovePlan(readBot(offer)).packageId;
    const topics = new Map<string, string>();
    f.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/api/config") return { profile: JSON.parse(init!.body!).profile };
      const read = /^\/api\/bots\/(\w+)\/memory\/file\?path=(.+)$/.exec(path);
      if (read) return { text: topics.get(`${read[1]}:${decodeURIComponent(read[2]!)}`) ?? "" };
      if (path.endsWith("/memory/file") && init?.method === "PUT") {
        const body = JSON.parse(init.body!);
        topics.set(`${path.split("/")[3]}:${body.path}`, body.text);
      }
      if (path === "/api/mcp/servers") return { servers: [] };
      return { ok: true };
    });
    f.runGrokMove.mockResolvedValue({ bots: [], moved: [], unreadable: [], failed: [] });
    const part2 = notes({
      about_me: { brokerage: ["Summit Realty"] }, memories: [], open_threads: ["Pick a new inspector."],
      active_deals: ["12 Elm St: buyer side, inspection, objection 2026-03-04"], bots: [offer],
    });
    const outcome = await importNotes(part2, {
      bots: [{ id: "offer", name: "Offer writer", installedPackage: { id: packageId } } as never], aboutMe: "", team: false, firstBotId: "corso", dispatch: vi.fn(),
    });
    expect(topics.get("corso:memory/open-threads-from-claude.md")).toContain("- Pick a new inspector.");
    expect(topics.get("corso:memory/deals-from-claude.md")).toContain("- 12 Elm St: buyer side, inspection, objection 2026-03-04");
    expect(topics.get("offer:memory/notes-from-claude.md"), "the bot made before gets the new memories").toContain("- Sam writes escalation clauses.");
    expect(outcome).toMatchObject({ threads: 1, deals: 1, joined: 1, bots: 0 });
    expect(notesOutcomeLine(outcome)).toBe("Brought in from Claude: 2 things about you, 1 active deal, 1 open thread, and 1 bot already here, with more.");
  });

  it("makes the person's own routines real, paused routines and their skills switched-off skills of the first bot, once", async () => {
    const routines: Array<Record<string, unknown>> = [];
    const skills: Array<{ name: string }> = [];
    f.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/api/config") return { profile: JSON.parse(init!.body!).profile };
      if (path === "/api/routines" && init?.method === "POST") { routines.push({ ...JSON.parse(init.body!), id: `r${routines.length}` }); return { routine: {} }; }
      if (path === "/api/routines") return { routines };
      if (path === "/api/bots/corso/skills") return { skills };
      if (path === "/api/bots/corso/skill-template") { skills.push({ name: JSON.parse(init!.body!).name }); return { installed: {} }; }
      return { ok: true };
    });
    const md = [
      "---", "format: corso-notes", "version: 1", "from: Gemini", "---", "",
      "# Routines", "## Deadline sweep", "- Cron: 0 8 * * 1-5", "- Time zone: America/Denver", "~~~text", "List this week's contract deadlines.", "~~~",
      "## Someday", "- Schedule: whenever rates drop", "~~~text", "Tell me to call my buyers.", "~~~",
      "# Skills", "## Tone check", "- When to use: before I email a client", "~~~text", "Flag anything curt.", "~~~", "", "END OF CORSO NOTES",
    ].join("\n");
    const context = { bots: [], aboutMe: "", team: false, firstBotId: "corso", dispatch: vi.fn() };
    const outcome = await importNotes(md, context);
    expect(routines).toEqual([{ id: "r0", botId: "corso", name: "Deadline sweep", prompt: "List this week's contract deadlines.", enabled: false, schedule: { type: "cron", expression: "0 8 * * 1-5", timeZone: "America/Denver" } }]);
    const skill = JSON.parse(f.api.mock.calls.find(([path]) => path === "/api/bots/corso/skill-template")![1].body);
    expect(skill).toMatchObject({ name: "tone-check", description: "before I email a client", enabled: false, source: "notes from Gemini" });
    expect(skill.text).toContain("Flag anything curt.");
    expect(outcome).toMatchObject({ routines: 1, skills: 1, threads: 1 });
    expect(notesOutcomeLine(outcome)).toBe("Brought in from Gemini: 1 open thread, 1 paused routine, and 1 skill.");
    const again = await importNotes(md, context);
    expect(routines, "the same file twice makes nothing twice").toHaveLength(1);
    expect(skills).toHaveLength(1);
    expect(again).toMatchObject({ routines: 1, skills: 0 });
  });

  it("says what went wrong in plain words, and what a cut-off paste still brought", async () => {
    expect(notesErrorLine(new GrokImportError("cutOff"))).toBe("That answer looks cut off. Ask for the rest in the same shape, then paste it too.");
    expect(notesErrorLine(new Error("boom"))).toBe("Couldn't bring in your notes. Try pasting them again.");
    expect(notesOutcomeLine({ from: "Gemini", facts: 0, memories: 0, bots: 0, failed: [], partial: true }))
      .toBe("Nothing new from Gemini. It was all here already. The end was cut off. Ask for the rest and paste it here too.");
  });

  it("finds notes among dropped files, skipping other kinds and other text", async () => {
    const file = (name: string, text: string) => ({ name, size: text.length, text: async () => text });
    expect(await notesInFiles([file("photo.png", notes()), file("readme.md", "# hi {"), file("claude-notes.json", notes())]))
      .toEqual({ names: ["claude-notes.json"], text: notes() });
    expect(await notesInFiles([file("readme.md", "plain")])).toBeNull();
    // the file the prompt asks for: markdown with front matter, dropped or picked into any chat
    const md = "---\nformat: corso-notes\nversion: 1\nfrom: Grok\n---\n\n# Memories\n- Likes tea\n\nEND OF CORSO NOTES\n";
    expect(looksLikeNotes(md)).toBe(true);
    expect(await notesInFiles([file("notes.md", "# my notes\n- nothing here"), file("corso-notes.md", md)])).toEqual({ names: ["corso-notes.md"], text: md });
  });
});

describe("the notes file in Downloads", () => {
  const context = () => ({ bots: [], aboutMe: "", team: false, firstBotId: "corso", dispatch: vi.fn() });
  const serve = (files: Array<{ name: string; modifiedAt: number; text: string }>) => f.api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    if (path.startsWith("/api/setup-import/notes?")) return { files };
    if (path === "/api/config") return { profile: JSON.parse(init!.body!).profile };
    if (path.includes("/memory/file?")) return { text: "" };
    if (path === "/api/mcp/servers") return { servers: [] };
    return { ok: true };
  });

  it("is never looked for before the prompt was copied, then only from that moment", async () => {
    serve([]);
    expect(await takeNotesFromDownloads(context())).toBeNull();
    expect(f.api, "no copy, no look at Downloads").not.toHaveBeenCalled();
    f.copy.mockResolvedValue("copied");
    await copyNotesPrompt(5_000);
    await takeNotesFromDownloads(context(), 6_000);
    expect(f.api).toHaveBeenCalledWith("/api/setup-import/notes?since=5000", expect.anything());
    f.api.mockClear();
    expect(await takeNotesFromDownloads(context(), 5_000 + WATCH_FOR_MS + 1), "the watch ends").toBeNull();
    expect(f.api).not.toHaveBeenCalled();
  });

  it("brings a new file in by itself, once", async () => {
    f.copy.mockResolvedValue("copied");
    await copyNotesPrompt(1_000);
    serve([{ name: "corso-notes.json", modifiedAt: 2_000, text: notes({ bots: [] }) }]);
    const outcome = await takeNotesFromDownloads(context(), 3_000);
    expect(outcome).toMatchObject({ from: "Claude", memories: 1 });
    expect(notesWatch()!.taken).toEqual(["corso-notes.json:2000"]);
    f.api.mockClear();
    expect(await takeNotesFromDownloads(context(), 4_000), "the same file never twice").toBeNull();
    expect(f.api.mock.calls.filter(([path]) => String(path).includes("/memory/file"))).toEqual([]);
  });
});

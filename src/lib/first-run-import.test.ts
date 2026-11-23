import { beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/lib/i18n";
import type { SetupDetection } from "../../shared/setup-import";
import { amountLine, bringChosen, bringRunNow, knowsLine, localFinds, memorySource, resetBringRunForTests, sourceScore } from "./first-run-import";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const DAY = 86_400_000;
const DETECTION: SetupDetection = {
  skills: [{ name: "pdf", source: "claudeCode" }, { name: "review", source: "claudeCode" }, { name: "lint", source: "codex" }],
  tools: [{ name: "notion", source: "cursor" }, { name: "github", source: "claudeCode" }],
  memory: [{ source: "claudeCode", files: 3, notes: 12 }],
  activity: { claudeCode: NOW - 2 * 3_600_000, codex: NOW - 3 * DAY, cursor: NOW - 90 * DAY },
};

beforeEach(() => {
  setLocale("en");
  resetBringRunForTests();
});

describe("the first run's list of what this Mac holds", () => {
  it("puts what is used lately and holds enough first, best first, and leaves thin or idle sources for Show more", () => {
    expect(localFinds(DETECTION, NOW).map((find) => [find.id, find.summary, find.strong])).toEqual([
      ["setup:claudeCode", "12 notes about you, 2 skills, and 1 tool", false],
      ["setup:codex", "1 skill", false],
      ["setup:cursor", "1 tool", false],
    ]);
    const busy = localFinds({ ...DETECTION, skills: [...DETECTION.skills, ...Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, source: "codex" as const }))] }, NOW);
    expect(busy.map((find) => [find.id, find.strong])).toEqual([["setup:codex", true], ["setup:claudeCode", false], ["setup:cursor", false]]);
  });

  it("counts a source as in use only within a month, and as worth it only above a little", () => {
    expect(sourceScore({ skills: 9 }, NOW - 10 * DAY, NOW).strong).toBe(true);
    expect(sourceScore({ skills: 9 }, NOW - 40 * DAY, NOW).strong).toBe(false);
    expect(sourceScore({ skills: 2, tools: 3 }, NOW, NOW).strong).toBe(false);
    expect(sourceScore({ skills: 9 }, null, NOW).strong).toBe(false);
    expect(sourceScore({ notes: 100 }, NOW, NOW).score).toBeGreaterThan(sourceScore({ notes: 100 }, NOW - 20 * DAY, NOW).score);
  });

  it("offers one memory source: the app really used on 5 or more of the last 30 days that knows the person, most used first", () => {
    const topics = { preferences: true, aboutYou: true, workStyle: false, projects: 4 };
    const finds = localFinds({
      skills: [], tools: [],
      memory: [{ source: "claudeCode", files: 9, notes: 40, topics }, { source: "codex", files: 1, notes: 6 }, { source: "gemini", files: 1, notes: 30 }],
      // Gemini knows a lot but was barely used
      usage: { claudeCode: 31, codex: 22, gemini: 2 }, activity: { gemini: NOW },
    }, NOW);
    const source = memorySource(finds)!;
    expect(source.id).toBe("setup:claudeCode");
    expect(source.app).toBe("Claude Code");
    expect(knowsLine(source)).toBe("It's learned your preferences, who you are, and 4 of your projects.");
    expect(memorySource(finds.filter((find) => find !== source))?.id, "Codex next: used, with a few notes").toBe("setup:codex");
    expect(memorySource(finds.filter((find) => find.id !== "setup:claudeCode" && find.id !== "setup:codex")), "nothing else is really used").toBeNull();
    expect(knowsLine(finds.find((find) => find.id === "setup:gemini")!)).toBe("It remembers 30 things about you.");
  });

  it("is empty when nothing is here", () => {
    expect(localFinds({ skills: [], tools: [] })).toEqual([]);
    expect(localFinds(null)).toEqual([]);
    expect(amountLine({ notes: 1, skills: 3, tools: 2 }, 2)).toBe("1 note about you and 3 skills");
  });
});

describe("bringing the chosen in", () => {
  it("asks for only the chosen tools' things and their memory for the first bot, and says so in one line", async () => {
    const apply = vi.fn(async () => ({
      skills: { added: ["pdf", "review"], present: [], skipped: [], filesLeftOut: 0, review: [] },
      tools: { added: ["github"], present: [], skipped: [] },
      memory: { added: 12, sources: ["claudeCode" as const], failed: false },
    }));
    const finds = localFinds(DETECTION, NOW).filter((find) => find.id === "setup:claudeCode");
    const run = bringChosen(finds, { firstBotId: "corso", client: { detect: vi.fn(), apply } });
    expect(bringRunNow()).toEqual({ kind: "working", ids: ["setup:claudeCode"], brought: [] });
    await run;
    expect(apply).toHaveBeenCalledExactlyOnceWith({ skills: true, tools: true, sources: ["claudeCode"], memory: true, memoryBot: "corso" });
    expect(bringRunNow()).toEqual({ kind: "done", failed: false, line: "Your bots now know 12 things about you. Also brought in 2 skills and 1 tool.", brought: ["setup:claudeCode"], known: 12 });
  });

  it("asks for no memory without a first bot or notes to bring", async () => {
    const apply = vi.fn(async () => ({ skills: { added: ["lint"], present: [], skipped: [], filesLeftOut: 0, review: [] }, tools: { added: [], present: [], skipped: [] } }));
    const codex = localFinds(DETECTION, NOW).find((find) => find.id === "setup:codex")!;
    await bringChosen([codex], { firstBotId: "corso", client: { detect: vi.fn(), apply } });
    expect(apply).toHaveBeenCalledExactlyOnceWith({ skills: true, tools: true, sources: ["codex"] });
    expect(bringRunNow()).toMatchObject({ kind: "done", line: "Brought in 1 skill." });
  });

  it("names a failure, and a failed find stays one to bring in again", async () => {
    const apply = vi.fn(async () => { throw new Error("offline"); });
    await bringChosen(localFinds(DETECTION, NOW), { firstBotId: null, client: { detect: vi.fn(), apply } });
    expect(bringRunNow()).toMatchObject({ kind: "done", failed: true, line: "Some of it couldn't come in. Try again from Settings → Import & export.", brought: [] });
  });

  it("brings one app in on its own Bring in, and remembers it alongside the next", async () => {
    const apply = vi.fn(async () => ({ skills: { added: [], present: [], skipped: [], filesLeftOut: 0, review: [] }, tools: { added: [], present: [], skipped: [] } }));
    const [first, second] = localFinds(DETECTION, NOW);
    await bringChosen([first!], { firstBotId: null, client: { detect: vi.fn(), apply } });
    expect(bringRunNow()).toMatchObject({ kind: "done", brought: [first!.id], line: "All of it was already here." });
    await bringChosen([second!], { firstBotId: null, client: { detect: vi.fn(), apply } });
    expect(bringRunNow()).toMatchObject({ kind: "done", brought: [first!.id, second!.id] });
  });
});

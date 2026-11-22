import { describe, expect, it } from "vitest";

import {
  aboutMeWithNotes, closeCutOff, isNotesPrompt, looksLikeNotes, notesDealsText, notesMemoryText, notesThreadsText, NOTES_END, NOTES_FILE_PATTERN,
  NOTES_FORMAT, NOTES_PROMPT, parseNotes,
} from "./assistant-notes.ts";
import { GrokImportError } from "./grok-import.ts";

const block = (extra: Record<string, unknown> = {}) => JSON.stringify({
  format: NOTES_FORMAT, version: 1, from: "ChatGPT",
  about_me: ["Name is Sam.", "Lives in Denver, time zone America/Denver."],
  instructions: "Short answers. No emoji.",
  memories: ["Working on a listing launch for 12 Elm St, live in March.", "Prefers Notion for notes."],
  bots: [{ name: "Offer writer", instructions: "Help Sam draft offers.", memories: ["Sam writes escalation clauses."],
    skills: [{ name: "net sheet", description: "Make a seller net sheet.", instructions: "Subtract the costs from the price." }] }],
  ...extra,
}, null, 2);

const code = (error: unknown) => (error instanceof GrokImportError ? error.code : String(error));

describe("the copy prompt", () => {
  it("asks for one self-describing file with a setup block for Corso and every part the importer splits", () => {
    for (const part of [
      "format: corso-notes", "version: 1", "# SETUP INSTRUCTIONS FOR CORSO", "# About me", "## Basics", "## Work", "## Brokerage", "## Market",
      "## Transaction software", "## Deadlines I track", "## Projects", "## Goals", "## Preferences", "## Writing style", "## Tools", "## Schedule",
      "# Active deals", "# Contacts", "# How I like answers", "# Memories", "# Open threads", "# Routines", "# Connected apps", "# Skills", "# Bots",
      "## Bot: <its name>", "### Instructions", "### Personality", "### Memories", "### Knowledge files", "### Skills", "### Routines", "### Apps",
      "word for word", NOTES_END,
    ]) expect(NOTES_PROMPT).toContain(part);
    // one file to Downloads, a download where it can make files, a code block where it can't; parts that each stand alone
    expect(NOTES_PROMPT).toContain("save it straight to ~/Downloads/corso-notes.md");
    expect(NOTES_PROMPT).toContain("give me corso-notes.md to download");
    expect(NOTES_PROMPT).toContain("one code block that starts with ````markdown");
    expect(NOTES_PROMPT).toMatch(/custom GPT, Project, Gem/);
    expect(NOTES_PROMPT).toContain("each part starting with the same front matter");
    expect(NOTES_PROMPT).toMatch(/recreate as its own bot/);
    expect(NOTES_PROMPT, "the people a transaction runs through").toMatch(/client, lender, title or escrow officer, inspector, appraiser, other agent/);
    expect(NOTES_PROMPT).toMatch(/address.*side.*stage.*key dates/s);
    expect(NOTES_PROMPT).toMatch(/wiring instructions/);
    expect(NOTES_PROMPT).not.toMatch(/dusk/i);
    expect(NOTES_PROMPT).not.toContain("—");
    expect(looksLikeNotes(NOTES_PROMPT), "the prompt itself has the marker, so a pasted prompt is caught, never sent").toBe(true);
    expect(isNotesPrompt(NOTES_PROMPT)).toBe(true);
    expect(isNotesPrompt(block())).toBe(false);
    expect(code(captured(() => parseNotes(NOTES_PROMPT))), "its example is never read as notes").toBe("cutOff");
  });

  it("names the file Downloads is watched for, and its numbered parts", () => {
    expect(NOTES_FILE_PATTERN.test("corso-notes.md")).toBe(true);
    expect(NOTES_FILE_PATTERN.test("corso-notes-2.md")).toBe(true);
    expect(NOTES_FILE_PATTERN.test("corso-notes (1).markdown")).toBe(true);
    expect(NOTES_FILE_PATTERN.test("notes.md")).toBe(false);
    expect(NOTES_FILE_PATTERN.test("corso-notes.pdf")).toBe(false);
  });
});

describe("parsing pasted notes", () => {
  it("splits one block into about me, instructions, memories and bots", () => {
    const notes = parseNotes(`Here you go!\n\n\`\`\`json\n${block()}\n\`\`\`\n\nLet me know if you need more.`);
    expect(notes.from).toEqual({ name: "ChatGPT", key: "chatgpt" });
    expect(notes.aboutMe).toEqual(["Name is Sam.", "Lives in Denver, time zone America/Denver."]);
    expect(notes.instructions).toBe("Short answers. No emoji.");
    expect(notes.memories).toHaveLength(2);
    expect(notes.bots.map((bot) => [bot.name, bot.skills.length, bot.memories])).toEqual([["Offer writer", 1, ["Sam writes escalation clauses."]]]);
    expect(notes.partial).toBe(false);
  });

  it("reads what a chat window does to a block: smart quotes, trailing commas, a string where a list was asked", () => {
    const messy = block({ about_me: "- Name is Sam.\n- Has a dog called Pip." }).replace(/"/g, (_, at: number) => (at % 2 ? "“" : "”")).replace(/\n}$/, ",\n}");
    const notes = parseNotes(messy);
    expect(notes.aboutMe).toEqual(["Name is Sam.", "Has a dog called Pip."]);
  });

  it("joins a reply split in parts, each fact once", () => {
    const first = block({ memories: ["One."], bots: [] });
    const second = JSON.stringify({ format: NOTES_FORMAT, version: 1, from: "ChatGPT", about_me: ["Name is Sam.", "Plays piano."], memories: ["Two."] });
    const notes = parseNotes(`Part 1\n${first}\n\nPart 2\n${second}`);
    expect(notes.aboutMe).toEqual(["Name is Sam.", "Lives in Denver, time zone America/Denver.", "Plays piano."]);
    expect(notes.memories).toEqual(["One.", "Two."]);
  });

  it("keeps what was whole before a cut-off end, and says it was cut off", () => {
    const whole = block();
    const cut = whole.slice(0, whole.indexOf("Prefers Notion") + 6);
    const notes = parseNotes(cut);
    expect(notes.partial).toBe(true);
    expect(notes.aboutMe).toHaveLength(2);
    expect(notes.memories).toEqual(["Working on a listing launch for 12 Elm St, live in March."]);
    expect(notes.bots).toEqual([]);
  });

  it("refuses text that is not notes, a cut with nothing whole, and a block with credential keys", () => {
    expect(code(captured(() => parseNotes("just a normal message {with braces}")))).toBe("notExport");
    expect(code(captured(() => parseNotes(`{"format": "${NOTES_FORMAT}", "about_`)))).toBe("cutOff");
    expect(code(captured(() => parseNotes(block({ api_key: "x" }))))).toBe("credentials");
    expect(code(captured(() => parseNotes(JSON.stringify({ format: NOTES_FORMAT, version: 1 }))))).toBe("notExport");
  });

  it("redacts token-shaped text inside the notes", () => {
    const notes = parseNotes(block({ memories: ["My key is sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD"] }));
    expect(notes.memories[0]).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz");
  });

  it("names notes with no app 'another AI'", () => {
    expect(parseNotes(block({ from: "" })).from).toEqual({ name: "another AI", key: "another-ai" });
  });
});

describe("notes as a JSON block with sections", () => {
  const sectioned = (extra: Record<string, unknown> = {}) => JSON.stringify({
    format: NOTES_FORMAT, version: 1, from: "ChatGPT",
    about_me: {
      basics: ["Name is Sam, in Denver (America/Denver)."], work: ["Team lead for 4 buyer agents."], brokerage: ["Summit Realty, Cherry Creek office."],
      market: ["Denver metro and Boulder County."], transaction_software: ["CTM eContracts and DocuSign."], deadlines: ["Inspection objection, three days ahead."],
      people: ["Ana, my assistant."], writing_style: ["Short sentences, no emoji."], schedule: ["Showings on weekends."],
    },
    instructions: "Be brief.",
    memories: ["Prefers Notion for notes."],
    active_deals: ["12 Elm St: buyer side, inspection, objection 2026-03-04, closing 2026-03-28"],
    open_threads: ["Pick a new inspector for Boulder."],
    recurring_tasks: [{ name: "Deadline sweep", instruction: "List the week's contract deadlines.", schedule_text: "Mondays at 9", schedule_cron: "0 9 * * 1", timezone: "America/Denver" }],
    connected_apps: ["Gmail", { name: "Google Drive" }],
    bots: [{ name: "Offer writer", description: "Drafts offers", instructions: "Help Sam draft offers.", knowledge_files: ["contract.pdf", "comps.xlsx"] }],
    ...extra,
  });

  it("reads About me's sections into lines that read right on their own, and every other part", () => {
    const notes = parseNotes(sectioned());
    expect(notes.aboutMe).toEqual([
      "Name is Sam, in Denver (America/Denver).", "Work: Team lead for 4 buyer agents.", "Brokerage: Summit Realty, Cherry Creek office.",
      "Market: Denver metro and Boulder County.", "Transaction software: CTM eContracts and DocuSign.", "Deadline I track: Inspection objection, three days ahead.",
      "Person: Ana, my assistant.", "Writing style: Short sentences, no emoji.", "Schedule: Showings on weekends.",
    ]);
    expect(notes.deals).toEqual(["12 Elm St: buyer side, inspection, objection 2026-03-04, closing 2026-03-28"]);
    expect(notes.openThreads).toEqual(["Pick a new inspector for Boulder."]);
    expect(notes.recurring).toEqual([{ name: "Deadline sweep", instruction: "List the week's contract deadlines.", when: "Mondays at 9 (0 9 * * 1, America/Denver)", cron: "0 9 * * 1", timeZone: "America/Denver" }]);
    expect(notes.apps).toEqual(["Gmail", "Google Drive"]);
    expect(notes.bots[0]!.memories.at(-1)).toContain("contract.pdf, comps.xlsx");
  });

  it("joins parts sent one after another, each thing once, and refuses a version from the future", () => {
    const second = JSON.stringify({ format: NOTES_FORMAT, version: 1, from: "ChatGPT", open_threads: ["Pick a new inspector for Boulder.", "Call the appraiser."] });
    expect(parseNotes(`${sectioned()}\n\n${second}`).openThreads).toEqual(["Pick a new inspector for Boulder.", "Call the appraiser."]);
    expect(code(captured(() => parseNotes(sectioned({ version: 4 }))))).toBe("newerVersion");
  });

  it("keeps active deals in one topic, merged with an earlier paste", () => {
    const notes = parseNotes(sectioned());
    const first = notesDealsText(notes)!;
    expect(first).toContain("# Active deals from ChatGPT");
    expect(first).toContain("- 12 Elm St: buyer side, inspection, objection 2026-03-04, closing 2026-03-28");
    const again = notesDealsText({ from: notes.from, deals: ["12 Elm St: buyer side, inspection, objection 2026-03-04, closing 2026-03-28", "40 Oak Ave: seller side, listed"] }, first)!;
    expect(again.match(/^- /gm)).toHaveLength(2);
    expect(notesDealsText({ from: notes.from, deals: [] })).toBeNull();
  });

  it("keeps open threads, recurring tasks and apps in one topic, merged with an earlier paste", () => {
    const notes = parseNotes(sectioned());
    const first = notesThreadsText(notes)!;
    expect(first).toContain("# Open threads from ChatGPT");
    expect(first).toContain("## Still open\nTo-dos, open questions and things to come back to.\n\n- Pick a new inspector for Boulder.");
    expect(first).toContain("- Deadline sweep: List the week's contract deadlines. (Mondays at 9 (0 9 * * 1, America/Denver))");
    expect(first).toContain("## Connected there");
    const again = notesThreadsText({ ...notes, openThreads: ["Call the appraiser."], recurring: [], apps: [] }, first)!;
    expect(again.match(/^- /gm)).toHaveLength(5);
    expect(again).toContain("- Call the appraiser.");
  });
});

describe("closing a cut-off block", () => {
  it("closes at the last whole item", () => {
    expect(closeCutOff('{"a": [1, 2, {"b": "x"}, {"c": "half')).toBe('{"a": [1, 2, {"b": "x"}]}');
    expect(closeCutOff('{"a": "whole"}')).toBe('{"a": "whole"}');
    expect(closeCutOff('{"a": "nothing whole')).toBeNull();
  });
});

describe("where notes land", () => {
  const notes = parseNotes(block());
  it("adds new facts and instructions to About me under the app's name, and nothing twice", () => {
    const first = aboutMeWithNotes("I sell homes in Denver.", notes, "2026-11-14")!;
    // learned lines, so each says where it came from
    expect(first.text).toContain("I sell homes in Denver.\n\n- 2026-11-14 · learned by ChatGPT · Name is Sam.");
    expect(first.text).toContain("How I like answers (from ChatGPT):\nShort answers. No emoji.");
    expect(first.added).toBe(3);
    expect(aboutMeWithNotes(first.text, notes), "a second paste adds nothing").toBeNull();
  });

  it("keeps memories in one topic per app, merged with an earlier paste", () => {
    const first = notesMemoryText(notes)!;
    expect(first).toContain("# Notes from ChatGPT");
    const again = notesMemoryText({ from: notes.from, memories: ["Prefers Notion for notes.", "New one."] }, first)!;
    expect(again.match(/^- /gm)).toHaveLength(3);
  });
});

function captured(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
}

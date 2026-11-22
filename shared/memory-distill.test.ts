import { describe, expect, it } from "vitest";

import { distillLines, NOTE_MAX_CHARS, nearDuplicate, noiseReason } from "./memory-distill.ts";
import { redactSecretsInText } from "./redact.ts";

const NOW = Date.UTC(2026, 10, 13);
const SENTINEL = "sk-proj-SENTINELsentinelSENTINEL1234567890abcd";

const NOISY_MEMORIES = [
  "Dana runs a two-agent residential team at Summit Realty in Denver.",
  "ok",
  "Done!",
  "Prefers replies under five lines, no emoji.",
  "prefers replies under five lines and no emoji",
  "$ npm run build && npm test",
  "{\"status\": 200, \"ok\": true}",
  "Error: ENOENT: no such file or directory, open '/tmp/x.json'",
  "2025-01-10: remind Dana about the inspection appointment tomorrow",
  "Her lender is Maria Chen at Front Range Mortgage.",
  "Today I'm checking the title commitment",
  `My OpenAI key is ${SENTINEL}`,
  "Client: the Parkers, buying in Highlands Ranch before school starts.",
  "Client: the Parkers, buying in Highlands Ranch before school starts.",
  `Long passage: ${"She has explained how her team runs a listing, every step and every vendor, in great detail. ".repeat(6)}`,
];

describe("the rules pass over another app's memory", () => {
  it("keeps durable facts once and leaves out chatter, tool output, old one-offs, repeats, near-repeats and keys", () => {
    const lines = NOISY_MEMORIES.map((line) => redactSecretsInText(line));
    const out = distillLines(lines, { cap: 40, now: NOW });
    expect(out.keep).toEqual([
      "Dana runs a two-agent residential team at Summit Realty in Denver.",
      "Prefers replies under five lines, no emoji.",
      "Her lender is Maria Chen at Front Range Mortgage.",
      "Client: the Parkers, buying in Highlands Ranch before school starts.",
    ]);
    expect(out.later, "a passage is handed back apart, never kept as a note").toHaveLength(1);
    expect(out.later[0]!.length).toBeGreaterThan(NOTE_MAX_CHARS);
    expect(out.dropped).toBe(NOISY_MEMORIES.length - 5);
  });

  it("says why a line is noise", () => {
    expect(noiseReason("ok")).toBe("empty");
    expect(noiseReason("thanks!")).toBe("chatter");
    expect(noiseReason("Error: something broke at line 4")).toBe("output");
    expect(noiseReason("password: hunter2-hunter2")).toBe("secret");
    expect(noiseReason("_(optional)_")).toBe("placeholder");
    expect(noiseReason("2025-01-10 meeting with the lender", NOW)).toBe("stale");
    expect(noiseReason("2026-11-01 meeting with the lender", NOW), "a recent one-off may still matter").toBeNull();
    expect(noiseReason("Works weekends; never call before 9am.")).toBeNull();
  });

  it("keeps the cap, handing the rest back, and never keeps a fact twice across lists", () => {
    const word = (i: number) => `w${i.toString(36)}x${(i * 7).toString(36)}`;
    const many = Array.from({ length: 50 }, (_, i) => `Fact ${word(i)} ${word(i + 100)} ${word(i + 200)} ${word(i + 300)}`);
    const seen: string[] = [];
    const first = distillLines(many, { cap: 40, seen });
    expect(first.keep).toHaveLength(40);
    expect(first.later).toHaveLength(10);
    expect(distillLines([many[0]!, "Something else entirely new here"], { cap: 40, seen }).keep).toEqual(["Something else entirely new here"]);
    expect(nearDuplicate("Prefers replies under five lines, no emoji.", "prefers replies under five lines and no emoji")).toBe(true);
    expect(nearDuplicate("Lender is in Denver", "Inspector works in Boulder")).toBe(false);
  });
});

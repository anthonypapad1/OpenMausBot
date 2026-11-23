import { describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import {
  choosePath, DETAILS, EMPTY_INTAKE, FIRST_JOB_IDS, intakeAnswered, intakeLines, mergeAboutMe, PATH_FIRST_JOBS, PATH_QUESTIONS, pathOf, WORK_PATHS,
} from "./corso-intake";

const full = { brokerage: " Kentwood ", market: "Denver", volume: "6-15" as const, voice: "warm" as const };

describe("corso intake", () => {
  it("writes one labelled line per answer, trimmed", () => {
    expect(intakeLines(full)).toEqual([
      "Brokerage: Kentwood",
      "Market: Denver",
      "Deals open at a time: 6-15",
      "How to talk to me: friendly and reassuring, but still brief",
    ]);
  });

  it("writes nothing for an intake left empty", () => {
    expect(intakeLines(EMPTY_INTAKE)).toEqual([]);
    expect(intakeAnswered(EMPTY_INTAKE)).toBe(false);
    expect(intakeAnswered({ ...EMPTY_INTAKE, market: "Boulder" })).toBe(true);
  });

  it("keeps what the person wrote and adds the answers after it", () => {
    expect(mergeAboutMe("I have two kids.\n\n", { ...EMPTY_INTAKE, market: "Denver" })).toBe("I have two kids.\nMarket: Denver");
    expect(mergeAboutMe("", { ...EMPTY_INTAKE, market: "Denver" })).toBe("Market: Denver");
  });

  it("replaces an answered line and leaves an unanswered one", () => {
    const before = "Brokerage: Old Co\nI work weekends.\nMarket: Denver";
    expect(mergeAboutMe(before, { ...EMPTY_INTAKE, brokerage: "New Co" })).toBe("I work weekends.\nMarket: Denver\nBrokerage: New Co");
  });

  it("replaces what another AI's notes said under the same label, and keeps the rest of what they brought", () => {
    const before = "- 2026-11-14 · learned by ChatGPT · Brokerage: Summit Realty\n- 2026-11-14 · learned by ChatGPT · Market: Boulder County\n- 2026-11-14 · learned by ChatGPT · Work: Team lead";
    expect(mergeAboutMe(before, { ...EMPTY_INTAKE, brokerage: "Kentwood", market: "Denver metro" }))
      .toBe("- 2026-11-14 · learned by ChatGPT · Work: Team lead\nBrokerage: Kentwood\nMarket: Denver metro");
    expect(mergeAboutMe(before, EMPTY_INTAKE), "a skipped question leaves the brought-in line").toBe(before);
  });
});

describe("the work path", () => {
  it("writes nothing for residential, so a residential intake reads exactly as before", () => {
    expect(intakeLines({ ...full, path: "residential" })).toEqual(intakeLines(full));
    expect(intakeAnswered({ ...EMPTY_INTAKE, path: "residential" })).toBe(false);
  });

  it("says what the person does, then the path's own answers in plain English", () => {
    expect(intakeLines({ ...EMPTY_INTAKE, path: "commercial", market: "Denver", details: { propertyTypes: " industrial ", side: "both", dealSize: "5m-25m" } })).toEqual([
      "What I do: commercial real estate",
      "Market: Denver",
      "Property types: industrial",
      "Sales or leasing: both sales and leasing",
      "Typical deal size: $5M to $25M",
    ]);
    expect(intakeLines({ ...EMPTY_INTAKE, path: "property", details: { doors: "51-200", portfolio: "residential", software: "appfolio" } })).toEqual([
      "What I do: property management",
      "Doors managed: 51-200",
      "Residential or commercial: residential",
      "Property management software: AppFolio",
    ]);
    expect(intakeLines({ ...EMPTY_INTAKE, path: "consumer", details: { move: "buying", address: "512 Pine Ave", agent: "Dana Lee" } })).toEqual([
      "What I do: buying or selling my own home (I am not a real estate professional)",
      "Buying or selling: buying",
      "Home address: 512 Pine Ave",
      "My agent: Dana Lee",
    ]);
    expect(intakeLines({ ...EMPTY_INTAKE, path: "brokerage", brokerage: "Kentwood", checklist: "- Listing agreement",
      details: { agents: "51-200", transactionSystem: "ctm", offerAgents: "maybe" } })).toEqual([
      "What I do: I run a brokerage (broker, managing broker or compliance)",
      "Brokerage: Kentwood",
      "Agents at the brokerage: 51-200",
      "Transaction system: CTM eContracts",
      "Plans to offer Corso to our agents: maybe later",
    ]);
  });

  it("keeps only what the new path also asks when the person picks another", () => {
    const residential = { ...full, path: "residential" as const };
    expect(choosePath(residential, "commercial")).toEqual({ ...EMPTY_INTAKE, voice: "warm", market: "Denver", path: "commercial" });
    expect(choosePath({ ...EMPTY_INTAKE, path: "brokerage", brokerage: "Kentwood", checklist: "x", details: { agents: "1-10" } }, "consumer"))
      .toEqual({ ...EMPTY_INTAKE, path: "consumer" });
    expect(choosePath({ ...EMPTY_INTAKE, path: "commercial", details: { side: "sales" } }, null)).toEqual({ ...EMPTY_INTAKE, path: null });
  });

  it("asks each path its own questions, and offers its own first jobs", () => {
    expect(pathOf(EMPTY_INTAKE)).toBe("residential");
    expect(PATH_QUESTIONS.residential).toEqual({ brokerage: true, market: true, volume: true, details: [], checklist: false });
    expect(PATH_FIRST_JOBS.residential).toBe(FIRST_JOB_IDS);
    for (const path of WORK_PATHS) expect(PATH_FIRST_JOBS[path]).toHaveLength(3);
  });

  it("has the English words for every path, question, choice and first job", () => {
    const keys = [
      ...WORK_PATHS.map((path) => `onboarding.intake.path.${path}`),
      ...WORK_PATHS.filter((path) => path !== "residential").flatMap((path) => [`onboarding.intake.about.${path}.title`, `onboarding.intake.about.${path}.lede`]),
      ...Object.entries(DETAILS).flatMap(([id, detail]) => [`onboarding.intake.detail.${id}.label`,
        ...(detail.choices ? Object.keys(detail.choices).map((choice) => `onboarding.intake.detail.${id}.${choice}`) : [`onboarding.intake.detail.${id}.placeholder`])]),
      ...WORK_PATHS.flatMap((path) => PATH_FIRST_JOBS[path].map((job) => `onboarding.intake.firstJob.${job}`)),
    ];
    for (const key of keys) expect(en, key).toHaveProperty([key]);
  });
});

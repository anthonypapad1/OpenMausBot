import type { BotRoutineTemplate } from "../../shared/new-bot-defaults";

export const WEEKDAYS = [1, 2, 3, 4, 5];

export const paused = (name: string, prompt: string, time: string, weekdays: number[]): BotRoutineTemplate =>
  ({ name, prompt, schedule: { type: "daily", time, weekdays }, enabled: false, overlap: "skip" });

// Dev-only gallery of the Today page, served at /today-preview.html; not in the packaged app. It mounts the real page and
// the sidebar's Today row over a made-up day of Colorado deals, with no server behind them.
// ?state=full|calm|loading|error&skin=midnight|daylight&lang=pt-br
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidebarTodayRow } from "@/components/SidebarTodayRow";
import { DeskAvatar } from "@/components/today/DeskAvatar";
import { TodayView } from "@/components/today/TodayView";
import { loadLocale } from "@/lib/i18n";
import { applySkinChoice, SKIN_IDS, type SkinId } from "@/lib/skins";
import { DESKS } from "@/lib/today";
import { setDealsToday } from "@/state/deals-today";
import { initialState, StoreContext, type AppState, type Bot } from "@/state/store";
import type { DealDeadline, DealTodayView } from "../shared/deals";
import "./styles.css";

const params = new URLSearchParams(location.search);
const stateName = params.get("state") ?? "full";
const skin = params.get("skin") ?? "midnight";
applySkinChoice(SKIN_IDS.includes(skin as SkinId) ? (skin as SkinId) : "midnight");
await loadLocale(params.get("lang") ?? "en");

const NOW = Date.now();
const MINUTE = 60_000;
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toLocaleDateString("en-CA");
const deadline = (id: string, dealId: string, label: string, offset: number, kind: string, dueTime: string | null = null): DealDeadline =>
  ({ id, dealId, label, dueDate: day(offset), dueTime, status: "open", kind, updatedAt: NOW });
const LARKSPUR = "1847 Larkspur Ln, Boulder, CO 80304", PINE = "622 W Pine St, Fort Collins, CO 80521", RIDGE = "3310 Ridge View Dr, Colorado Springs, CO 80904";

const full: DealTodayView = {
  today: day(0),
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  needsYou: [
    { type: "deadline", dealId: "d1", address: LARKSPUR, side: "buyer", dealStatus: "under_contract", overdue: true, deadline: deadline("k1", "d1", "Inspection objection", -1, "inspection_objection", "17:00") },
    { type: "deadline", dealId: "d2", address: PINE, side: "both", dealStatus: "under_contract", overdue: false, deadline: deadline("k2", "d2", "Title objection", 0, "title") },
    { type: "document", dealId: "d1", address: LARKSPUR, document: { id: "doc1", dealId: "d1", name: "Lead-based paint disclosure", status: "needs_signature", required: true, updatedAt: NOW } },
  ],
  comingUp: [
    { dealId: "d3", address: RIDGE, side: "seller", dealStatus: "pre_contract", daysAway: 2, deadline: deadline("k3", "d3", "Listing photos", 2, "other") },
    { dealId: "d1", address: LARKSPUR, side: "buyer", dealStatus: "under_contract", daysAway: 3, deadline: deadline("k4", "d1", "Appraisal deadline", 3, "appraisal") },
    { dealId: "d2", address: PINE, side: "both", dealStatus: "under_contract", daysAway: 6, deadline: deadline("k5", "d2", "Closing", 6, "closing", "14:00") },
  ],
  recentActivity: [
    { dealId: "d1", address: LARKSPUR, activity: { id: "a1", dealId: "d1", botId: "deal", botName: "Deal Desk", summary: "Read the contract and added its deadlines.", at: NOW - 12 * MINUTE } },
    { dealId: "d1", address: LARKSPUR, activity: { id: "a2", dealId: "d1", botId: "compliance", botName: "Compliance Desk", summary: "Flagged the lead-based paint disclosure as unsigned.", at: NOW - 40 * MINUTE } },
    { dealId: "d2", address: PINE, activity: { id: "a3", dealId: "d2", botId: "deal", botName: "Deal Desk", summary: "Asked the buyer's agent for the signed inspection resolution.", at: NOW - 70 * MINUTE } },
    { dealId: "d3", address: RIDGE, activity: { id: "a4", dealId: "d3", botId: "listing", botName: "Listing Desk", summary: "Sent the seller this week's prep checklist.", at: NOW - 26 * 60 * MINUTE } },
  ],
};
const calm: DealTodayView = { ...full, needsYou: [], comingUp: [], recentActivity: [] };

if (stateName === "full") setDealsToday(full);
else if (stateName === "calm") setDealsToday(calm);
else if (stateName === "error") setDealsToday(null, true);

const bots = DESKS.map((name, index) => ({ id: `desk-${index}`, name, color: "green", threadId: `main-${index}`, tasks: [] }) as unknown as Bot);

function Gallery() {
  const state: AppState = { ...initialState, connected: true, hydrated: true, activeView: "today", bots };
  const value = { state, dispatch: () => {}, flushBotPatches: async () => null, refreshInstances: async () => {}, refreshModels: async () => {} };
  return (
    <StoreContext.Provider value={value}>
      <div className="flex h-screen bg-panel text-ink">
        <aside className="hidden w-[248px] shrink-0 flex-col gap-1 border-e border-hairline/60 bg-panel pt-6 md:flex">
          <SidebarTodayRow icons={false} large />
          <div className="px-3">
            {bots.map((bot) => (
              <div key={bot.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] font-medium leading-5 text-ink">
                <DeskAvatar name={bot.name} size={36} />{bot.name}
              </div>
            ))}
          </div>
        </aside>
        <TodayView />
      </div>
    </StoreContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Gallery /></StrictMode>);

// The shared deal list's wire types: what GET /api/deals, /api/deals/:id and /api/deals/today answer, and what the deal
// tools read back. Dates are the deal's own calendar days, "YYYY-MM-DD"; times are "HH:MM" on that day; instants are
// epoch milliseconds.

export const DEAL_SIDES = ["buyer", "seller", "both"] as const;
export type DealSide = (typeof DEAL_SIDES)[number];

export const DEAL_STATUSES = ["pre_contract", "under_contract", "closed", "cancelled"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** A list filter: one status, "open" (pre_contract and under_contract, the default) or "all". */
export const DEAL_LIST_FILTERS = [...DEAL_STATUSES, "open", "all"] as const;
export type DealListFilter = (typeof DEAL_LIST_FILTERS)[number];
export const OPEN_DEAL_STATUSES: readonly DealStatus[] = ["pre_contract", "under_contract"];

export const DEADLINE_STATUSES = ["open", "done", "waived"] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

/** Kinds the bots are told about; any lowercase snake_case kind is kept as given. */
export const DEADLINE_KINDS = ["inspection_objection", "inspection_resolution", "appraisal", "loan", "title", "earnest_money", "closing", "other"] as const;

export const DOCUMENT_STATUSES = ["missing", "received", "signed", "needs_signature"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PARTY_ROLES = ["buyer", "seller", "lender", "title", "listing_agent", "buyer_agent", "other"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

/** The fields a save empties when it names them in `clear`. */
export const DEAL_CLEARABLE = ["price", "contract_date", "closing_date", "transaction_url", "transaction_id", "notes"] as const;
export const DEADLINE_CLEARABLE = ["due_time"] as const;
export const PARTY_CLEARABLE = ["email", "phone"] as const;
/** The most a deal's notes hold, however they are added to. */
export const DEAL_NOTES_MAX = 20_000;

export interface Deal {
  id: string;
  address: string;
  side: DealSide;
  /** Whole dollars. */
  price: number | null;
  status: DealStatus;
  contractDate: string | null;
  closingDate: string | null;
  /** Where the deal lives in the agent's transaction system, such as a CTM eContracts link and its id there. */
  transactionUrl: string | null;
  transactionId: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface DealDeadline {
  id: string;
  dealId: string;
  label: string;
  dueDate: string;
  dueTime: string | null;
  status: DeadlineStatus;
  kind: string;
  updatedAt: number;
}

export interface DealDocument {
  id: string;
  dealId: string;
  name: string;
  status: DocumentStatus;
  required: boolean;
  updatedAt: number;
}

export interface DealParty {
  id: string;
  dealId: string;
  role: PartyRole;
  name: string;
  email: string | null;
  phone: string | null;
  updatedAt: number;
}

export interface DealActivity {
  id: string;
  dealId: string;
  botId: string;
  botName: string;
  summary: string;
  at: number;
}

/** One row of GET /api/deals: the deal and its soonest open deadline. */
export interface DealListItem extends Deal {
  nextDeadline: DealDeadline | null;
}

/** GET /api/deals/:id and deal_get. Deadlines soonest first; activity newest first. */
export interface DealDetail {
  deal: Deal;
  parties: DealParty[];
  deadlines: DealDeadline[];
  documents: DealDocument[];
  recentActivity: DealActivity[];
}

export type DealToday =
  | { type: "deadline"; dealId: string; address: string; deadline: DealDeadline; overdue: boolean }
  | { type: "document"; dealId: string; address: string; document: DealDocument };

export interface DealComingUp {
  dealId: string;
  address: string;
  deadline: DealDeadline;
  /** Calendar days from today, 1 to 7. */
  daysAway: number;
}

export interface DealActivityItem {
  dealId: string;
  address: string;
  activity: DealActivity;
}

/** GET /api/deals/today. Only open deals (pre_contract, under_contract) appear in needsYou and comingUp. */
export interface DealTodayView {
  /** The day this was worked out for, in `timeZone`. */
  today: string;
  timeZone: string;
  /** Open deadlines due today or overdue (overdue first, oldest first), then documents waiting on a signature. */
  needsYou: DealToday[];
  /** Open deadlines in the 7 days after today, soonest first. */
  comingUp: DealComingUp[];
  /** The latest activity across every deal, newest first. */
  recentActivity: DealActivityItem[];
}

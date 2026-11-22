// The shared deal list: deals, their parties, deadlines, documents and activity, in deals.db in the data folder. Every
// bot reads and writes the same rows, so the Deal, Listing, Inbox and Compliance desks all see one view.
import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  DEAL_NOTES_MAX,
  OPEN_DEAL_STATUSES,
  type DEAL_CLEARABLE,
  type Deal,
  type DealActivity,
  type DealActivityItem,
  type DealComingUp,
  type DealDeadline,
  type DealDetail,
  type DealDocument,
  type DealListFilter,
  type DealListItem,
  type DealParty,
  type DealSide,
  type DealStatus,
  type DealToday,
  type DealTodayView,
} from "../../shared/deals.ts";
import type { ActivityAddInput, DeadlineSaveInput, DealSaveInput, DocumentSaveInput, PartySaveInput } from "./inputs.ts";

type DealClearable = (typeof DEAL_CLEARABLE)[number];

export const DEALS_DB = "deals.db";
export const RECENT_ACTIVITY = 10;
export const COMING_UP_DAYS = 7;
const DEAL_ACTIVITY_SHOWN = 20;

export class DealStoreError extends Error {
  readonly status: 400 | 404;
  constructor(status: 400 | 404, message: string) {
    super(message);
    this.name = "DealStoreError";
    this.status = status;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  side TEXT NOT NULL,
  price INTEGER,
  status TEXT NOT NULL,
  contract_date TEXT,
  closing_date TEXT,
  transaction_url TEXT,
  transaction_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deals_status ON deals(status);
CREATE TABLE IF NOT EXISTS deal_deadlines (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  due_date TEXT NOT NULL,
  due_time TEXT,
  status TEXT NOT NULL,
  kind TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deal_deadlines_due ON deal_deadlines(status, due_date);
CREATE INDEX IF NOT EXISTS deal_deadlines_deal ON deal_deadlines(deal_id);
CREATE TABLE IF NOT EXISTS deal_documents (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  required INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deal_documents_deal ON deal_documents(deal_id);
CREATE TABLE IF NOT EXISTS deal_parties (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deal_parties_deal ON deal_parties(deal_id);
CREATE TABLE IF NOT EXISTS deal_activity (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  bot_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deal_activity_at ON deal_activity(at);
CREATE INDEX IF NOT EXISTS deal_activity_deal ON deal_activity(deal_id, at);
`;

type Row = Record<string, unknown>;
const str = (value: unknown): string => String(value ?? "");
const maybe = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const dealOf = (row: Row): Deal => ({
  id: str(row.id),
  address: str(row.address),
  side: str(row.side) as Deal["side"],
  price: row.price === null || row.price === undefined ? null : Number(row.price),
  status: str(row.status) as Deal["status"],
  contractDate: maybe(row.contract_date),
  closingDate: maybe(row.closing_date),
  transactionUrl: maybe(row.transaction_url),
  transactionId: maybe(row.transaction_id),
  notes: str(row.notes),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});
const deadlineOf = (row: Row): DealDeadline => ({
  id: str(row.id),
  dealId: str(row.deal_id),
  label: str(row.label),
  dueDate: str(row.due_date),
  dueTime: maybe(row.due_time),
  status: str(row.status) as DealDeadline["status"],
  kind: str(row.kind),
  updatedAt: Number(row.updated_at),
});
const documentOf = (row: Row): DealDocument => ({
  id: str(row.id),
  dealId: str(row.deal_id),
  name: str(row.name),
  status: str(row.status) as DealDocument["status"],
  required: Number(row.required) === 1,
  updatedAt: Number(row.updated_at),
});
const partyOf = (row: Row): DealParty => ({
  id: str(row.id),
  dealId: str(row.deal_id),
  role: str(row.role) as DealParty["role"],
  name: str(row.name),
  email: maybe(row.email),
  phone: maybe(row.phone),
  updatedAt: Number(row.updated_at),
});
const activityOf = (row: Row): DealActivity => ({
  id: str(row.id),
  dealId: str(row.deal_id),
  botId: str(row.bot_id),
  botName: str(row.bot_name),
  summary: str(row.summary),
  at: Number(row.at),
});

const newId = (prefix: string) => `${prefix}-${randomBytes(6).toString("hex")}`;

/** The calendar day `at` falls on in `timeZone`, as YYYY-MM-DD. Throws a RangeError for a zone Intl does not know. */
export function localDay(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The wall-clock time `at` reads in `timeZone`, as 24-hour HH:MM, the form a deadline's due_time is kept in. */
export function localClock(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("hour")}:${part("minute")}`;
}

const dayNumber = (day: string): number => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, date) / 86_400_000;
};

export function addDays(day: string, days: number): string {
  return new Date((dayNumber(day) + days) * 86_400_000).toISOString().slice(0, 10);
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const OPEN_IN = `(${OPEN_DEAL_STATUSES.map((status) => `'${status}'`).join(", ")})`;
const DUE_ORDER = "dl.due_date, COALESCE(dl.due_time, '24:00'), dl.label";

export function openDealStore(dataDir: string, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const file = dataDir === ":memory:" ? ":memory:" : join(dataDir, DEALS_DB);
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true });
    closeSync(openSync(file, "a", 0o600));
    chmodSync(file, 0o600);
  }
  const db = new DatabaseSync(file, { timeout: 5_000 });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  const transaction = <T>(run: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const one = (sql: string, ...params: Array<string | number | null>): Row | undefined => db.prepare(sql).get(...params) as Row | undefined;
  const all = (sql: string, ...params: Array<string | number | null>): Row[] => db.prepare(sql).all(...params) as Row[];

  const dealRow = (id: string): Deal => {
    const row = one("SELECT * FROM deals WHERE id = ?", id);
    if (!row) throw new DealStoreError(404, `There is no deal ${id}. Find its id with deals_list.`);
    return dealOf(row);
  };
  const touch = (dealId: string, at: number) => db.prepare("UPDATE deals SET updated_at = ? WHERE id = ?").run(at, dealId);
  /** The child row `id` of deal `dealId`, or a refusal naming where to find the right id. */
  const childRow = (table: string, noun: string, dealId: string, id: string): Row => {
    const row = one(`SELECT * FROM ${table} WHERE id = ?`, id);
    if (!row || row.deal_id !== dealId) throw new DealStoreError(404, `Deal ${dealId} has no ${noun} ${id}. Read its ${noun}s with deal_get.`);
    return row;
  };
  const needed = (value: unknown, what: string) => {
    if (value === undefined) throw new DealStoreError(400, `${what} is needed to add one.`);
  };

  function list(filter: DealListFilter = "open"): DealListItem[] {
    const where = filter === "all" ? "" : filter === "open" ? `WHERE status IN ${OPEN_IN}` : "WHERE status = ?";
    const rows = all(
      `SELECT * FROM deals ${where} ORDER BY closing_date IS NULL, closing_date, updated_at DESC`,
      ...(filter === "all" || filter === "open" ? [] : [filter]),
    );
    const next = db.prepare(`SELECT * FROM deal_deadlines dl WHERE dl.deal_id = ? AND dl.status = 'open' ORDER BY ${DUE_ORDER} LIMIT 1`);
    return rows.map((row) => {
      const deadline = next.get(str(row.id)) as Row | undefined;
      return { ...dealOf(row), nextDeadline: deadline ? deadlineOf(deadline) : null };
    });
  }

  function get(id: string): DealDetail | null {
    const row = one("SELECT * FROM deals WHERE id = ?", id);
    if (!row) return null;
    return {
      deal: dealOf(row),
      parties: all("SELECT * FROM deal_parties WHERE deal_id = ? ORDER BY rowid", id).map(partyOf),
      deadlines: all(`SELECT * FROM deal_deadlines dl WHERE dl.deal_id = ? ORDER BY ${DUE_ORDER}`, id).map(deadlineOf),
      documents: all("SELECT * FROM deal_documents WHERE deal_id = ? ORDER BY rowid", id).map(documentOf),
      recentActivity: all("SELECT * FROM deal_activity WHERE deal_id = ? ORDER BY at DESC, rowid DESC LIMIT ?", id, DEAL_ACTIVITY_SHOWN).map(activityOf),
    };
  }

  function saveDeal(input: DealSaveInput): Deal {
    return transaction(() => {
      const at = now();
      const cleared = new Set<DealClearable>(input.clear ?? []);
      if (input.notes !== undefined && input.notes_append !== undefined) {
        throw new DealStoreError(400, "give notes or notes_append, not both: notes_append adds a line, notes replaces them all.");
      }
      const withNote = (notes: string) => {
        if (input.notes_append === undefined) return notes;
        const next = notes ? `${notes}\n${input.notes_append}` : input.notes_append;
        if (next.length > DEAL_NOTES_MAX) throw new DealStoreError(400, `the deal's notes would pass ${DEAL_NOTES_MAX} characters. Shorten them with notes, which replaces them all.`);
        return next;
      };
      if (!input.deal_id) {
        needed(input.address, "address");
        const id = newId("deal");
        db.prepare(`INSERT INTO deals (id, address, side, price, status, contract_date, closing_date, transaction_url, transaction_id, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          id, input.address!, input.side ?? "buyer", input.price ?? null, input.status ?? "under_contract",
          input.contract_date ?? null, input.closing_date ?? null, input.transaction_url ?? null, input.transaction_id ?? null, withNote(input.notes ?? ""), at, at,
        );
        return dealRow(id);
      }
      const was = dealRow(input.deal_id);
      const pick = <T>(field: DealClearable, value: T | undefined, current: T, empty: T): T =>
        cleared.has(field) ? empty : value ?? current;
      db.prepare(`UPDATE deals SET address = ?, side = ?, price = ?, status = ?, contract_date = ?, closing_date = ?, transaction_url = ?,
        transaction_id = ?, notes = ?, updated_at = ? WHERE id = ?`).run(
        input.address ?? was.address,
        input.side ?? was.side,
        pick("price", input.price, was.price, null),
        input.status ?? was.status,
        pick("contract_date", input.contract_date, was.contractDate, null),
        pick("closing_date", input.closing_date, was.closingDate, null),
        pick("transaction_url", input.transaction_url, was.transactionUrl, null),
        pick("transaction_id", input.transaction_id, was.transactionId, null),
        withNote(pick("notes", input.notes, was.notes, "")),
        at,
        was.id,
      );
      return dealRow(was.id);
    });
  }

  function saveDeadline(input: DeadlineSaveInput): DealDeadline {
    return transaction(() => {
      const at = now();
      dealRow(input.deal_id);
      let id = input.deadline_id;
      if (!id) {
        needed(input.label, "label");
        needed(input.due_date, "due_date");
        id = newId("ddl");
        db.prepare("INSERT INTO deal_deadlines (id, deal_id, label, due_date, due_time, status, kind, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
          id, input.deal_id, input.label!, input.due_date!, input.due_time ?? null, input.status ?? "open", input.kind ?? "other", at,
        );
      } else {
        const was = deadlineOf(childRow("deal_deadlines", "deadline", input.deal_id, id));
        db.prepare("UPDATE deal_deadlines SET label = ?, due_date = ?, due_time = ?, status = ?, kind = ?, updated_at = ? WHERE id = ?").run(
          input.label ?? was.label, input.due_date ?? was.dueDate, input.clear?.includes("due_time") ? null : input.due_time ?? was.dueTime, input.status ?? was.status, input.kind ?? was.kind, at, id,
        );
      }
      touch(input.deal_id, at);
      return deadlineOf(one("SELECT * FROM deal_deadlines WHERE id = ?", id)!);
    });
  }

  function saveDocument(input: DocumentSaveInput): DealDocument {
    return transaction(() => {
      const at = now();
      dealRow(input.deal_id);
      let id = input.document_id;
      if (!id) {
        needed(input.name, "name");
        id = newId("doc");
        db.prepare("INSERT INTO deal_documents (id, deal_id, name, status, required, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          id, input.deal_id, input.name!, input.status ?? "missing", input.required === false ? 0 : 1, at,
        );
      } else {
        const was = documentOf(childRow("deal_documents", "document", input.deal_id, id));
        db.prepare("UPDATE deal_documents SET name = ?, status = ?, required = ?, updated_at = ? WHERE id = ?").run(
          input.name ?? was.name, input.status ?? was.status, (input.required ?? was.required) ? 1 : 0, at, id,
        );
      }
      touch(input.deal_id, at);
      return documentOf(one("SELECT * FROM deal_documents WHERE id = ?", id)!);
    });
  }

  function saveParty(input: PartySaveInput): DealParty {
    return transaction(() => {
      const at = now();
      dealRow(input.deal_id);
      let id = input.party_id;
      if (!id) {
        needed(input.role, "role");
        needed(input.name, "name");
        id = newId("pty");
        db.prepare("INSERT INTO deal_parties (id, deal_id, role, name, email, phone, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
          id, input.deal_id, input.role!, input.name!, input.email ?? null, input.phone ?? null, at,
        );
      } else {
        const was = partyOf(childRow("deal_parties", "party", input.deal_id, id));
        const cleared = new Set(input.clear ?? []);
        db.prepare("UPDATE deal_parties SET role = ?, name = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?").run(
          input.role ?? was.role,
          input.name ?? was.name,
          cleared.has("email") ? null : input.email ?? was.email,
          cleared.has("phone") ? null : input.phone ?? was.phone,
          at,
          id,
        );
      }
      touch(input.deal_id, at);
      return partyOf(one("SELECT * FROM deal_parties WHERE id = ?", id)!);
    });
  }

  function addActivity(input: ActivityAddInput & { botId: string; botName: string }): DealActivity {
    return transaction(() => {
      const at = now();
      dealRow(input.deal_id);
      const id = newId("act");
      db.prepare("INSERT INTO deal_activity (id, deal_id, bot_id, bot_name, summary, at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, input.deal_id, input.botId, input.botName, input.summary, at,
      );
      touch(input.deal_id, at);
      return activityOf(one("SELECT * FROM deal_activity WHERE id = ?", id)!);
    });
  }

  /** What needs the person on `at`'s day in `timeZone`, what falls due in the week after, and the latest activity. */
  function today(timeZone: string, at = now()): DealTodayView {
    const day = localDay(at, timeZone), clock = localClock(at, timeZone);
    const weekOut = addDays(day, COMING_UP_DAYS);
    const due = all(
      `SELECT dl.*, d.address, d.side AS deal_side, d.status AS deal_status FROM deal_deadlines dl JOIN deals d ON d.id = dl.deal_id
       WHERE dl.status = 'open' AND d.status IN ${OPEN_IN} AND dl.due_date <= ? ORDER BY ${DUE_ORDER}`,
      weekOut,
    );
    const needsYou: DealToday[] = [];
    const comingUp: DealComingUp[] = [];
    for (const row of due) {
      const deadline = deadlineOf(row);
      const item = { dealId: deadline.dealId, address: str(row.address), side: str(row.deal_side) as DealSide, dealStatus: str(row.deal_status) as DealStatus, deadline };
      // Past due: an earlier day, or today once its time (when it has one) has gone by.
      const overdue = deadline.dueDate < day || (deadline.dueDate === day && deadline.dueTime !== null && deadline.dueTime <= clock);
      if (deadline.dueDate <= day) needsYou.push({ type: "deadline", ...item, overdue });
      else comingUp.push({ ...item, daysAway: dayNumber(deadline.dueDate) - dayNumber(day) });
    }
    const unsigned = all(
      `SELECT doc.*, d.address FROM deal_documents doc JOIN deals d ON d.id = doc.deal_id
       WHERE doc.status = 'needs_signature' AND d.status IN ${OPEN_IN} ORDER BY d.closing_date IS NULL, d.closing_date, d.address, doc.rowid`,
    );
    for (const row of unsigned) needsYou.push({ type: "document", dealId: str(row.deal_id), address: str(row.address), document: documentOf(row) });
    const recentActivity: DealActivityItem[] = all(
      "SELECT a.*, d.address FROM deal_activity a JOIN deals d ON d.id = a.deal_id ORDER BY a.at DESC, a.rowid DESC LIMIT ?",
      RECENT_ACTIVITY,
    ).map((row) => ({ dealId: str(row.deal_id), address: str(row.address), activity: activityOf(row) }));
    return { today: day, timeZone, needsYou, comingUp, recentActivity };
  }

  return { list, get, saveDeal, saveDeadline, saveDocument, saveParty, addActivity, today, close: () => db.close() };
}

export type DealStore = ReturnType<typeof openDealStore>;

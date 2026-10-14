import type { LibraryFilter, SortKey } from "../types";
import type { SqlValue } from "./sql";

export const DAY_MS = 86400000;
export const RECENT_WINDOW_MS = 30 * DAY_MS;
export const HISTORY_LIMIT = 500;
export const GROUP_COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#22c55e", "#0ea5e9", "#ef4444", "#a855f7"];

export function newContactId(): string {
  return `c_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function sortClause(sort: SortKey): string {
  switch (sort) {
    case "nameAsc": return "c.sort_key ASC, c.rowid ASC";
    case "nameDesc": return "c.sort_key DESC, c.rowid DESC";
    case "added": return "c.created_at DESC, c.rowid DESC";
    case "edited": return "c.updated_at DESC, c.rowid DESC";
    case "company": return "c.company COLLATE NOCASE ASC, c.sort_key ASC, c.rowid ASC";
  }
}

export function filterWhere(filter: LibraryFilter, now: number): { sql: string; args: SqlValue[] } {
  switch (filter.kind) {
    case "all": return { sql: "1=1", args: [] };
    case "starred": return { sql: "c.starred=1", args: [] };
    case "recentlyAdded": return { sql: "c.created_at>=?", args: [now - RECENT_WINDOW_MS] };
    case "recentlyEdited": return { sql: "c.updated_at>=?", args: [now - RECENT_WINDOW_MS] };
    case "noNumber": return { sql: "c.phone_count=0", args: [] };
    case "noName": return { sql: "c.sort_key=''", args: [] };
    case "duplicates": return { sql: "c.rowid IN (SELECT rowid FROM dup_members)", args: [] };
    case "group": return { sql: "c.rowid IN (SELECT contact_rowid FROM contact_groups WHERE group_id=?)", args: [filter.groupId] };
    case "importBatch": return { sql: "c.import_batch=?", args: [filter.batchId] };
  }
}

export function defaultSortFor(filter: LibraryFilter): SortKey {
  if (filter.kind === "recentlyAdded") return "added";
  if (filter.kind === "recentlyEdited") return "edited";
  return "nameAsc";
}

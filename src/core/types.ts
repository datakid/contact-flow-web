export interface LabeledValue {
  value: string;
  label: string;
}

export interface Contact {
  id: string;
  name: string;
  company: string;
  note: string;
  starred: boolean;
  phones: LabeledValue[];
  emails: LabeledValue[];
  aliases: string[];
  groups: string[];
  importBatch: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContactInput {
  id?: string;
  name: string;
  company: string;
  note: string;
  starred: boolean;
  phones: LabeledValue[];
  emails: LabeledValue[];
  aliases: string[];
  groups: string[];
  importBatch?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface ParsedContact {
  contactId: string;
  name: string;
  firstName: string;
  lastName: string;
  phones: string[];
  emails: string[];
  company: string;
  note: string;
  aliases: string[];
  groups: string[];
}

export type MatchTag = "exact" | "startsWith" | "contains" | "alias" | "number" | "close" | "sounds" | "pinyin" | "transliterated";

export interface ContactRow {
  rowid: number;
  id: string;
  name: string;
  company: string;
  starred: boolean;
  phoneCount: number;
  primaryPhone: string;
  firstLetter: string;
  updatedAt: number;
  createdAt: number;
  matchTag: MatchTag | null;
  matchAlias: string | null;
}

export type LibraryFilter =
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "recentlyAdded" }
  | { kind: "recentlyEdited" }
  | { kind: "noNumber" }
  | { kind: "noName" }
  | { kind: "duplicates" }
  | { kind: "group"; groupId: number }
  | { kind: "importBatch"; batchId: string };

export type SortKey = "nameAsc" | "nameDesc" | "added" | "edited" | "company";

export interface ListQuery {
  filter: LibraryFilter;
  sort: SortKey;
  search: string;
  offset: number;
  limit: number;
  requestId: number;
}

export interface ListResult {
  requestId: number;
  rows: ContactRow[];
  total: number;
  offset: number;
  cancelled: boolean;
  tookMs: number;
}

export interface GroupInfo {
  id: number;
  name: string;
  color: string;
  count: number;
}

export interface LibraryCounts {
  all: number;
  starred: number;
  recentlyAdded: number;
  recentlyEdited: number;
  noNumber: number;
  noName: number;
  duplicateGroups: number;
  groups: GroupInfo[];
  bytes: number;
}

export type Language = "en" | "ar";
export type ThemeMode = "dark" | "light" | "system";
export type LayoutMode = "auto" | "compact" | "desktop";

export const PHONE_LABELS = ["mobile", "home", "work", "other"] as const;
export const EMAIL_LABELS = ["home", "work", "other"] as const;

export function emptyContactInput(): ContactInput {
  return { name: "", company: "", note: "", starred: false, phones: [], emails: [], aliases: [], groups: [] };
}

export function emptyParsed(): ParsedContact {
  return { contactId: "", name: "", firstName: "", lastName: "", phones: [], emails: [], company: "", note: "", aliases: [], groups: [] };
}

import type { Contact, ContactInput, LibraryCounts, LibraryFilter, ListQuery, ListResult, SortKey } from "../types";
import type { HistoryEntry, MutationResult, Selection } from "./library";
import type { Params } from "../ops/ops";
import type { BatchPreview, DuplicateGroup, PresetRow } from "./service";
import type { CommitResult, ImportMode, MergeMode, StageCategory, StageRow, StageSummary } from "./staging";

export interface InitInfo {
  persistent: boolean;
  total: number;
  migrated: number;
  defaultCountry: string;
}

export interface StageApi {
  stageBegin(): Promise<void>;
  stageInsert(source: number, batch: import("../types").ParsedContact[]): Promise<{ inserted: number; invalid: number; merged: number }>;
}

export interface DbApi {
  init(locale: string): Promise<InitInfo>;
  counts(): Promise<LibraryCounts>;
  list(query: ListQuery): Promise<ListResult>;
  letterOffsets(filter: LibraryFilter, sort: SortKey): Promise<Array<{ letter: string; offset: number; count: number }>>;
  getContact(id: string): Promise<Contact | null>;
  getContacts(ids: string[]): Promise<Contact[]>;
  saveContact(input: ContactInput, label: string): Promise<{ contact: Contact; historyId: string }>;
  countSelection(selection: Selection): Promise<number>;
  setStarred(selection: Selection, starred: boolean, label: string): Promise<MutationResult>;
  deleteContacts(selection: Selection, label: string): Promise<MutationResult>;
  addToGroup(selection: Selection, groupId: number, label: string): Promise<MutationResult>;
  removeFromGroup(selection: Selection, groupId: number, label: string): Promise<MutationResult>;
  createGroup(name: string): Promise<number | null>;
  renameGroup(id: number, name: string): Promise<boolean>;
  recolorGroup(id: number, color: string): Promise<void>;
  deleteGroup(id: number): Promise<{ historyId: string | null }>;
  listHistory(limit: number, offset: number): Promise<{ entries: HistoryEntry[]; total: number }>;
  undo(historyId: string | null): Promise<{ undone: HistoryEntry } | null>;
  duplicateGroups(limit: number, offset: number): Promise<{ groups: DuplicateGroup[]; total: number }>;
  refreshDuplicates(): Promise<number>;
  mergeGroup(keepId: string, mergeIds: string[], label: string): Promise<{ contact: Contact | null; historyId: string | null }>;
  batchPreview(selection: Selection, opKey: string, params: Params, limit: number): Promise<BatchPreview>;
  batchApply(selection: Selection, opKey: string, params: Params, label: string, onProgress?: (done: number, total: number) => void): Promise<MutationResult>;
  queueRecipients(selection: Selection, previewLimit: number): Promise<{ ids: string[]; preview: Contact[] }>;
  listPresets(): Promise<PresetRow[]>;
  savePreset(preset: PresetRow): Promise<void>;
  deletePreset(id: string): Promise<void>;
  getKv(key: string): Promise<string | null>;
  setKv(key: string, value: string): Promise<void>;
  readPage(selection: Selection, afterRowid: number, limit: number): Promise<{ contacts: Contact[]; lastRowid: number; total: number }>;
  loadSample(): Promise<{ count: number; historyId: string | null }>;
  stageBegin(): Promise<void>;
  stageClassify(): Promise<void>;
  stageSummary(): Promise<StageSummary>;
  stageList(category: StageCategory, offset: number, limit: number): Promise<{ rows: StageRow[]; total: number }>;
  stageSetIncluded(seqs: number[], included: boolean): Promise<void>;
  stageSetCategoryIncluded(category: StageCategory, included: boolean): Promise<void>;
  stageResolveConflict(seq: number, matchRowid: number | null): Promise<void>;
  stageCommit(mode: ImportMode, mergeMode: MergeMode, label: string, onProgress?: (done: number, total: number) => void): Promise<CommitResult>;
  stageDiscard(): Promise<void>;
  attachImportPort(port: MessagePort): Promise<void>;
  previewStoredNumbers(samples: string[], country: string): Promise<string[]>;
  setDefaultCountry(country: string): Promise<void>;
  wipe(): Promise<void>;
}

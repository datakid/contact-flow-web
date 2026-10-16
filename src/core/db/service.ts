import { phoneKey } from "../phone";
import type { Contact, ContactInput, ContactRow, ListQuery, ListResult } from "../types";
import { describeView, differs, opByKey } from "../ops/ops";
import type { Params } from "../ops/ops";
import { Library, toRow } from "./library";
import type { HistoryEntry, HistoryPayload, MutationResult, Selection } from "./library";
import { searchLibrary } from "./search";
import { chunk, num, placeholders, str, yieldToEventLoop } from "./sql";

export interface DuplicateGroup {
  key: string;
  reason: "number" | "name";
  members: Contact[];
  keepId: string;
}

export interface BatchSample {
  id: string;
  before: string;
  after: string;
}

export interface BatchPreview {
  total: number;
  changed: number;
  samples: BatchSample[];
}

export interface PresetRow {
  id: string;
  name: string;
  signature: string;
  mapping: string;
}

export function toInput(contact: Contact): ContactInput {
  return { ...contact };
}

export function mergeContacts(target: Contact, source: Contact): Contact {
  const seen = (list: Array<{ value: string }>): Set<string> => new Set(list.map((v) => phoneKey(v.value) || v.value));
  const phoneSeen = seen(target.phones);
  const phones = [...target.phones];
  for (const phone of source.phones) {
    const key = phoneKey(phone.value) || phone.value;
    if (!phoneSeen.has(key)) {
      phoneSeen.add(key);
      phones.push(phone);
    }
  }
  const emailSeen = new Set(target.emails.map((e) => e.value.toLowerCase()));
  const emails = [...target.emails];
  for (const email of source.emails) {
    if (!emailSeen.has(email.value.toLowerCase())) {
      emailSeen.add(email.value.toLowerCase());
      emails.push(email);
    }
  }
  const aliasSource = source.name && source.name !== target.name ? [source.name, ...source.aliases] : source.aliases;
  return {
    ...target,
    name: target.name || source.name,
    company: target.company || source.company,
    note: target.note || source.note,
    starred: target.starred || source.starred,
    phones,
    emails,
    aliases: [...new Set([...target.aliases, ...aliasSource])].filter((a) => a !== (target.name || source.name)),
    groups: [...new Set([...target.groups, ...source.groups])],
    createdAt: Math.min(target.createdAt, source.createdAt)
  };
}

export class LibraryService extends Library {
  async list(query: ListQuery): Promise<ListResult> {
    this.noteRequest(query.channel, query.requestId);
    const started = performance.now();
    if (!query.search.trim()) {
      if (query.filter.kind === "duplicates") this.ensureDuplicates();
      return this.listPlain(query);
    }
    if (query.filter.kind === "duplicates") this.ensureDuplicates();
    const outcome = await searchLibrary(this, query.search, query.filter, { requestId: query.requestId, channel: query.channel, all: false });
    if (!outcome) return { requestId: query.requestId, rows: [], total: 0, offset: 0, cancelled: true, tookMs: performance.now() - started };
    const rowids = outcome.results.map((r) => r.rowid);
    const byRowid = new Map<number, ContactRow>();
    for (const part of chunk(rowids, 400)) {
      const rows = this.db.selectObjects(
        `SELECT c.rowid,c.id,c.name,c.company,c.starred,c.phone_count,c.first_letter,c.created_at,c.updated_at,
          (SELECT value FROM phones p WHERE p.contact_rowid=c.rowid ORDER BY position LIMIT 1) AS primary_phone
         FROM contacts c WHERE c.rowid IN (${placeholders(part.length)})`,
        part
      );
      for (const r of rows) byRowid.set(num(r.rowid), toRow(r));
    }
    const rows: ContactRow[] = [];
    for (const result of outcome.results) {
      const row = byRowid.get(result.rowid);
      if (row) rows.push({ ...row, matchTag: result.tag, matchAlias: result.alias });
    }
    return { requestId: query.requestId, rows, total: outcome.total, offset: 0, cancelled: false, tookMs: performance.now() - started };
  }

  countSelection(selection: Selection): Promise<number> {
    return this.materializeSelection(selection);
  }

  setStarred(selection: Selection, starred: boolean, label: string): Promise<MutationResult> {
    return this.mutateSelection(selection, "star", label, (rowids, now) => {
      const prev: Array<[string, number, number]> = [];
      for (const part of chunk(rowids, 400)) {
        for (const r of this.db.selectObjects(`SELECT id,starred,updated_at FROM contacts WHERE rowid IN (${placeholders(part.length)})`, part)) prev.push([str(r.id), num(r.starred), num(r.updated_at)]);
        this.db.exec({ sql: `UPDATE contacts SET starred=?,updated_at=? WHERE rowid IN (${placeholders(part.length)})`, bind: [starred ? 1 : 0, now, ...part] });
      }
      return { type: "star", before: [], created: [], star: prev };
    });
  }

  deleteContacts(selection: Selection, label: string): Promise<MutationResult> {
    return this.mutateSelection(selection, "delete", label, (rowids) => {
      const before = this.hydrate(rowids);
      this.deleteRowids(rowids);
      return { type: "snapshots", before, created: [] };
    });
  }

  addToGroup(selection: Selection, groupId: number, label: string): Promise<MutationResult> {
    return this.mutateSelection(selection, "group", label, (rowids, now) => {
      const before = this.hydrate(rowids);
      for (const part of chunk(rowids, 400)) {
        this.db.exec({ sql: `INSERT OR IGNORE INTO contact_groups(contact_rowid,group_id) SELECT rowid,? FROM contacts WHERE rowid IN (${placeholders(part.length)})`, bind: [groupId, ...part] });
        this.db.exec({ sql: `UPDATE contacts SET updated_at=? WHERE rowid IN (${placeholders(part.length)})`, bind: [now, ...part] });
      }
      return { type: "snapshots", before, created: [] };
    });
  }

  removeFromGroup(selection: Selection, groupId: number, label: string): Promise<MutationResult> {
    return this.mutateSelection(selection, "group", label, (rowids, now) => {
      const before = this.hydrate(rowids);
      for (const part of chunk(rowids, 400)) {
        this.db.exec({ sql: `DELETE FROM contact_groups WHERE group_id=? AND contact_rowid IN (${placeholders(part.length)})`, bind: [groupId, ...part] });
        this.db.exec({ sql: `UPDATE contacts SET updated_at=? WHERE rowid IN (${placeholders(part.length)})`, bind: [now, ...part] });
      }
      return { type: "snapshots", before, created: [] };
    });
  }

  async mutateSelection(selection: Selection, kind: string, label: string, apply: (rowids: number[], now: number) => HistoryPayload): Promise<MutationResult> {
    const count = await this.materializeSelection(selection);
    if (count === 0) return { count: 0, historyId: null };
    const rowids = this.selectedRowids();
    const now = Date.now();
    let historyId: string | null = null;
    this.db.transaction(() => {
      const payload = apply(rowids, now);
      historyId = this.recordHistory(kind, label, rowids.length, payload, now);
    });
    this.touch();
    return { count: rowids.length, historyId };
  }

  createGroup(name: string): number | null {
    const id = this.groupIdByName(name, true, Date.now());
    this.touch();
    return id;
  }

  renameGroup(id: number, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const clash = this.db.selectValue("SELECT id FROM groups WHERE name=? AND id<>?", [trimmed, id]);
    if (clash !== undefined && clash !== null) return false;
    this.db.exec({ sql: "UPDATE groups SET name=? WHERE id=?", bind: [trimmed, id] });
    this.touch();
    return true;
  }

  recolorGroup(id: number, color: string): void {
    this.db.exec({ sql: "UPDATE groups SET color=? WHERE id=?", bind: [color, id] });
    this.touch();
  }

  deleteGroup(id: number): { historyId: string | null } {
    const row = this.db.selectObjects("SELECT id,name,color FROM groups WHERE id=?", [id])[0];
    if (!row) return { historyId: null };
    const memberIds = this.db.selectValues("SELECT c.id FROM contact_groups cg JOIN contacts c ON c.rowid=cg.contact_rowid WHERE cg.group_id=?", [id]).map(str);
    const now = Date.now();
    let historyId: string | null = null;
    this.db.transaction(() => {
      this.db.exec({ sql: "DELETE FROM contact_groups WHERE group_id=?", bind: [id] });
      this.db.exec({ sql: "DELETE FROM groups WHERE id=?", bind: [id] });
      historyId = this.recordHistory("groupDelete", str(row.name), memberIds.length, { type: "group", before: [], created: [], group: { id, name: str(row.name), color: str(row.color), memberIds } }, now);
    });
    this.touch();
    return { historyId };
  }

  listHistory(limit: number, offset: number): { entries: HistoryEntry[]; total: number } {
    const entries = this.db
      .selectObjects("SELECT id,created_at,kind,label,affected FROM history ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?", [limit, offset])
      .map((r) => ({ id: str(r.id), createdAt: num(r.created_at), kind: str(r.kind), label: str(r.label), affected: num(r.affected) }));
    return { entries, total: num(this.db.selectValue("SELECT COUNT(*) FROM history")) };
  }

  undo(historyId: string | null): { undone: HistoryEntry } | null {
    const row = historyId
      ? this.db.selectObjects("SELECT id,created_at,kind,label,affected,payload FROM history WHERE id=?", [historyId])[0]
      : this.db.selectObjects("SELECT id,created_at,kind,label,affected,payload FROM history ORDER BY created_at DESC,rowid DESC LIMIT 1")[0];
    if (!row) return null;
    const payload = JSON.parse(new TextDecoder().decode(row.payload as Uint8Array)) as HistoryPayload;
    const now = Date.now();
    this.db.transaction(() => {
      if (payload.type === "star" && payload.star) {
        for (const entry of payload.star) {
          if (entry[2] === undefined) this.db.exec({ sql: "UPDATE contacts SET starred=? WHERE id=?", bind: [entry[1], entry[0]] });
          else this.db.exec({ sql: "UPDATE contacts SET starred=?,updated_at=? WHERE id=?", bind: [entry[1], entry[2], entry[0]] });
        }
      } else if (payload.type === "group" && payload.group) {
        const g = payload.group;
        this.db.exec({ sql: "INSERT OR REPLACE INTO groups(id,name,color,created_at) VALUES(?,?,?,?)", bind: [g.id, g.name, g.color, now] });
        for (const part of chunk(g.memberIds, 400)) {
          this.db.exec({ sql: `INSERT OR IGNORE INTO contact_groups(contact_rowid,group_id) SELECT rowid,? FROM contacts WHERE id IN (${placeholders(part.length)})`, bind: [g.id, ...part] });
        }
      } else {
        const createdRowids = payload.created.map((id) => this.rowidOf(id)).filter((r): r is number => r !== null);
        this.deleteRowids(createdRowids);
        for (const snapshot of payload.before) this.upsertInTransaction({ ...snapshot }, now);
      }
      this.db.exec({ sql: "DELETE FROM history WHERE id=?", bind: [str(row.id)] });
    });
    this.touch();
    return { undone: { id: str(row.id), createdAt: num(row.created_at), kind: str(row.kind), label: str(row.label), affected: num(row.affected) } };
  }

  ensureDuplicates(): void {
    if (this.duplicatesVersion === this.mutationVersion) return;
    const groups = this.computeDuplicateGroups();
    this.db.exec("DELETE FROM dup_members");
    for (const part of chunk(groups.flatMap((g) => g.rowids), 400)) {
      this.db.exec({ sql: `INSERT OR IGNORE INTO dup_members(rowid) VALUES ${part.map(() => "(?)").join(",")}`, bind: [...part] });
    }
    this.duplicateGroupCount = groups.length;
    this.duplicatesVersion = this.mutationVersion;
    this.countsCache = null;
  }

  computeDuplicateGroups(): Array<{ rowids: number[]; reason: "number" | "name" }> {
    const parent = new Map<number, number>();
    const numberLinked = new Set<number>();
    const find = (x: number): number => {
      let root = x;
      while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root;
      parent.set(x, root);
      return root;
    };
    const union = (a: number, b: number, byNumber: boolean): void => {
      if (!parent.has(a)) parent.set(a, a);
      if (!parent.has(b)) parent.set(b, b);
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
      if (byNumber) {
        numberLinked.add(a);
        numberLinked.add(b);
      }
    };
    const keyExpr = "CASE WHEN length(digits)>=7 THEN substr(digits_rev,1,9) ELSE digits END";
    const phoneRows = this.db.selectArrays(
      `SELECT k,contact_rowid FROM (SELECT ${keyExpr} AS k,contact_rowid FROM phones WHERE length(digits)>=5)
       WHERE k IN (SELECT ${keyExpr} FROM phones WHERE length(digits)>=5 GROUP BY 1 HAVING COUNT(DISTINCT contact_rowid)>1) ORDER BY k`
    );
    let lastKey = "";
    let lastRow = 0;
    for (const [k, rowid] of phoneRows) {
      const key = str(k);
      const row = num(rowid);
      if (key === lastKey) union(lastRow, row, true);
      lastKey = key;
      lastRow = row;
    }
    const nameRows = this.db.selectArrays(
      "SELECT name_fold,rowid FROM contacts WHERE name_fold<>'' AND name_fold IN (SELECT name_fold FROM contacts WHERE name_fold<>'' GROUP BY name_fold HAVING COUNT(*)>1) ORDER BY name_fold"
    );
    lastKey = "";
    for (const [k, rowid] of nameRows) {
      const key = str(k);
      const row = num(rowid);
      if (key === lastKey) union(lastRow, row, false);
      lastKey = key;
      lastRow = row;
    }
    const grouped = new Map<number, number[]>();
    for (const rowid of parent.keys()) {
      const root = find(rowid);
      const list = grouped.get(root) ?? [];
      list.push(rowid);
      grouped.set(root, list);
    }
    return [...grouped.values()]
      .filter((g) => g.length > 1)
      .map((rowids) => ({ rowids: rowids.sort((a, b) => a - b), reason: rowids.some((r) => numberLinked.has(r)) ? ("number" as const) : ("name" as const) }));
  }

  duplicateGroups(limit: number, offset: number): { groups: DuplicateGroup[]; total: number } {
    this.ensureDuplicates();
    const all = this.computeDuplicateGroups().sort((a, b) => (a.rowids[0] ?? 0) - (b.rowids[0] ?? 0));
    const page = all.slice(offset, offset + limit);
    const groups = page.map((g) => {
      const members = this.hydrate(g.rowids);
      const score = (c: Contact): number => c.phones.length + c.emails.length + (c.company ? 1 : 0) + (c.note ? 1 : 0) + c.name.length / 100;
      const keep = [...members].sort((a, b) => score(b) - score(a))[0];
      return { key: String(g.rowids[0]), reason: g.reason, members, keepId: keep?.id ?? "" };
    });
    return { groups, total: all.length };
  }

  mergeGroup(keepId: string, mergeIds: string[], label: string): { contact: Contact | null; historyId: string | null } {
    const keep = this.getContact(keepId);
    if (!keep) return { contact: null, historyId: null };
    const others = this.contactsByIds(mergeIds.filter((id) => id !== keepId));
    const now = Date.now();
    let merged = keep;
    let historyId: string | null = null;
    for (const other of others) merged = mergeContacts(merged, other);
    this.db.transaction(() => {
      this.upsertInTransaction({ ...toInput(merged), updatedAt: now }, now);
      this.deleteRowids(others.map((o) => this.rowidOf(o.id)).filter((r): r is number => r !== null));
      historyId = this.recordHistory("merge", label, others.length + 1, { type: "snapshots", before: [keep, ...others], created: [] }, now);
    });
    this.touch();
    return { contact: this.getContact(keepId), historyId };
  }

  async batchPreview(selection: Selection, opKey: string, params: Params, limit: number): Promise<BatchPreview> {
    const op = opByKey(opKey);
    const total = await this.materializeSelection(selection);
    if (!op || !op.ready(params)) return { total, changed: 0, samples: [] };
    const view = op.view(params);
    let changed = 0;
    let index = 0;
    let after = 0;
    const samples: BatchSample[] = [];
    for (;;) {
      const rowids = this.db.selectValues("SELECT rowid FROM sel WHERE rowid>? ORDER BY rowid LIMIT 500", [after]).map(num);
      if (rowids.length === 0) break;
      after = rowids[rowids.length - 1] ?? after;
      for (const row of this.hydrate(rowids)) {
        const next = op.run(row, params, index);
        index += 1;
        if (!differs(row, next)) continue;
        changed += 1;
        if (samples.length < limit) samples.push({ id: row.id, before: describeView(row, view), after: describeView(next, view) });
      }
      await yieldToEventLoop();
    }
    return { total, changed, samples };
  }

  async batchApply(selection: Selection, opKey: string, params: Params, label: string, onProgress?: (done: number, total: number) => void): Promise<MutationResult> {
    const op = opByKey(opKey);
    const total = await this.materializeSelection(selection);
    if (!op || !op.ready(params)) return { count: 0, historyId: null };
    const before: Contact[] = [];
    let index = 0;
    let after = 0;
    let done = 0;
    const now = Date.now();
    for (;;) {
      const rowids = this.db.selectValues("SELECT rowid FROM sel WHERE rowid>? ORDER BY rowid LIMIT 500", [after]).map(num);
      if (rowids.length === 0) break;
      after = rowids[rowids.length - 1] ?? after;
      const rows = this.hydrate(rowids);
      this.db.transaction(() => {
        for (const row of rows) {
          const next = op.run(row, params, index);
          index += 1;
          if (!differs(row, next)) continue;
          before.push(row);
          this.upsertInTransaction({ ...toInput(next), updatedAt: now }, now);
        }
      });
      done += rows.length;
      onProgress?.(done, total);
      await yieldToEventLoop();
    }
    const historyId = before.length > 0 ? this.recordHistory("batch", label, before.length, { type: "snapshots", before, created: [] }, now) : null;
    this.touch();
    return { count: before.length, historyId };
  }

  async queueRecipients(selection: Selection, previewLimit: number): Promise<{ ids: string[]; preview: Contact[] }> {
    await this.materializeSelection(selection);
    const ids = this.db.selectValues("SELECT c.id FROM sel s JOIN contacts c ON c.rowid=s.rowid WHERE c.phone_count>0 ORDER BY s.rowid").map(str);
    const rowids = this.db.selectValues("SELECT c.rowid FROM sel s JOIN contacts c ON c.rowid=s.rowid WHERE c.phone_count>0 ORDER BY s.rowid LIMIT ?", [previewLimit]).map(num);
    return { ids, preview: this.hydrate(rowids) };
  }

  listPresets(): PresetRow[] {
    return this.db
      .selectObjects("SELECT id,name,signature,mapping FROM mapping_presets ORDER BY created_at DESC")
      .map((r) => ({ id: str(r.id), name: str(r.name), signature: str(r.signature), mapping: str(r.mapping) }));
  }

  savePreset(preset: PresetRow): void {
    this.db.exec({ sql: "INSERT OR REPLACE INTO mapping_presets(id,name,signature,mapping,created_at) VALUES(?,?,?,?,?)", bind: [preset.id, preset.name, preset.signature, preset.mapping, Date.now()] });
  }

  deletePreset(id: string): void {
    this.db.exec({ sql: "DELETE FROM mapping_presets WHERE id=?", bind: [id] });
  }

  async readPage(selection: Selection, afterRowid: number, limit: number): Promise<{ contacts: Contact[]; lastRowid: number; total: number }> {
    if (afterRowid === 0) await this.materializeSelection(selection);
    const total = num(this.db.selectValue("SELECT COUNT(*) FROM sel"));
    const rowids = this.db.selectValues("SELECT s.rowid FROM sel s JOIN contacts c ON c.rowid=s.rowid WHERE s.rowid>? ORDER BY s.rowid LIMIT ?", [afterRowid, limit]).map(num);
    return { contacts: this.hydrate(rowids), lastRowid: rowids[rowids.length - 1] ?? afterRowid, total };
  }
}

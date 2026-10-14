import type { CountryCode } from "libphonenumber-js/max";
import { firstLetterOf, fold, sortKeyOf } from "../fold";
import { parsePhone } from "../phone";
import { phoneticKey } from "../phonetic";
import { buildSearchText } from "../searchText";
import type { Contact, ContactInput, GroupInfo, LabeledValue, LibraryCounts, LibraryFilter, ListQuery, ListResult, SortKey, ContactRow } from "../types";
import { GROUP_COLORS, HISTORY_LIMIT, RECENT_WINDOW_MS, filterWhere, newContactId, sortClause } from "./filters";
import { PRAGMAS, SCHEMA } from "./schema";
import { searchLibrary } from "./search";
import { chunk, normalizeBinds, num, placeholders, str, yieldToEventLoop } from "./sql";
import type { SqlDb, SqlValue } from "./sql";

export type Selection = { kind: "ids"; ids: string[] } | { kind: "filter"; filter: LibraryFilter; search: string };

export interface HistoryEntry {
  id: string;
  createdAt: number;
  kind: string;
  label: string;
  affected: number;
}

export interface HistoryPayload {
  type: "snapshots" | "star" | "group";
  before: Contact[];
  created: string[];
  star?: Array<[string, number]>;
  group?: { id: number; name: string; color: string; memberIds: string[] };
}

export class Library {
  readonly db: SqlDb;
  country: CountryCode = "US";
  latestRequest = 0;
  mutationVersion = 0;
  duplicatesVersion = -1;
  duplicateGroupCount = 0;
  countsCache: { version: number; counts: LibraryCounts } | null = null;

  constructor(db: SqlDb) {
    this.db = normalizeBinds(db);
  }

  open(): void {
    for (const pragma of PRAGMAS) this.db.exec(pragma);
    for (const statement of SCHEMA) this.db.exec(statement);
    this.db.exec("CREATE TEMP TABLE IF NOT EXISTS dup_members(rowid INTEGER PRIMARY KEY)");
    this.db.exec("CREATE TEMP TABLE IF NOT EXISTS sel(rowid INTEGER PRIMARY KEY)");
    const stored = this.getKv("defaultCountry");
    if (stored && /^[A-Z]{2}$/.test(stored)) this.country = stored as CountryCode;
  }

  getKv(key: string): string | null {
    const value = this.db.selectValue("SELECT value FROM kv WHERE key=?", [key]);
    return value === undefined || value === null ? null : str(value);
  }

  setKv(key: string, value: string): void {
    this.db.exec("BEGIN");
    try {
      const stmt = this.db.prepare("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      stmt.bind([key, value]).step();
      stmt.finalize();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (key === "defaultCountry" && /^[A-Z]{2}$/.test(value)) this.country = value as CountryCode;
  }

  touch(): void {
    this.mutationVersion += 1;
    this.countsCache = null;
  }

  total(): number {
    return num(this.db.selectValue("SELECT COUNT(*) FROM contacts"));
  }

  groupIdByName(name: string, create: boolean, now: number): number | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = this.db.selectValue("SELECT id FROM groups WHERE name=?", [trimmed]);
    if (existing !== undefined && existing !== null) return num(existing);
    if (!create) return null;
    const count = num(this.db.selectValue("SELECT COUNT(*) FROM groups"));
    const color = GROUP_COLORS[count % GROUP_COLORS.length] ?? "#6366f1";
    const stmt = this.db.prepare("INSERT INTO groups(name,color,created_at) VALUES(?,?,?)");
    stmt.bind([trimmed, color, now]).step();
    stmt.finalize();
    return num(this.db.selectValue("SELECT last_insert_rowid()"));
  }

  normalizeInput(input: ContactInput): ContactInput {
    const clean = (list: LabeledValue[]): LabeledValue[] => list.map((v) => ({ value: v.value.trim(), label: v.label })).filter((v) => v.value !== "");
    const seen = new Set<string>();
    const aliases = input.aliases.map((a) => a.trim()).filter((a) => {
      if (!a || seen.has(a)) return false;
      seen.add(a);
      return true;
    });
    const groups = [...new Set(input.groups.map((g) => g.trim()).filter(Boolean))];
    return { ...input, name: input.name.trim(), company: input.company.trim(), note: input.note.trim(), phones: clean(input.phones), emails: clean(input.emails), aliases, groups };
  }

  writeDerived(rowid: number, input: ContactInput, now: number): void {
    this.db.exec(`DELETE FROM phones WHERE contact_rowid=${rowid}`);
    this.db.exec(`DELETE FROM emails WHERE contact_rowid=${rowid}`);
    this.db.exec(`DELETE FROM aliases WHERE contact_rowid=${rowid}`);
    this.db.exec(`DELETE FROM contact_groups WHERE contact_rowid=${rowid}`);
    const phoneStmt = this.db.prepare("INSERT INTO phones(contact_rowid,position,value,digits,digits_rev,e164,label) VALUES(?,?,?,?,?,?,?)");
    input.phones.forEach((phone, index) => {
      const parts = parsePhone(phone.value, this.country);
      phoneStmt.bind([rowid, index, phone.value, parts.digits, parts.digitsRev, parts.e164, phone.label]).step();
      phoneStmt.reset();
    });
    phoneStmt.finalize();
    const emailStmt = this.db.prepare("INSERT INTO emails(contact_rowid,position,value,value_lower,label) VALUES(?,?,?,?,?)");
    input.emails.forEach((email, index) => {
      emailStmt.bind([rowid, index, email.value, email.value.toLowerCase(), email.label]).step();
      emailStmt.reset();
    });
    emailStmt.finalize();
    const aliasStmt = this.db.prepare("INSERT INTO aliases(contact_rowid,position,value,value_fold) VALUES(?,?,?,?)");
    input.aliases.forEach((alias, index) => {
      aliasStmt.bind([rowid, index, alias, fold(alias)]).step();
      aliasStmt.reset();
    });
    aliasStmt.finalize();
    const memberStmt = this.db.prepare("INSERT OR IGNORE INTO contact_groups(contact_rowid,group_id) VALUES(?,?)");
    for (const group of input.groups) {
      const groupId = this.groupIdByName(group, true, now);
      if (groupId !== null) {
        memberStmt.bind([rowid, groupId]).step();
        memberStmt.reset();
      }
    }
    memberStmt.finalize();
    this.db.exec(`DELETE FROM contacts_fts WHERE rowid=${rowid}`);
    const ftsStmt = this.db.prepare("INSERT INTO contacts_fts(rowid,search_text) VALUES(?,?)");
    ftsStmt.bind([rowid, buildSearchText({ name: input.name, aliases: input.aliases, company: input.company })]).step();
    ftsStmt.finalize();
  }

  upsertInTransaction(raw: ContactInput, now: number): { rowid: number; id: string; created: boolean } {
    const input = this.normalizeInput(raw);
    const id = input.id && input.id.trim() ? input.id.trim() : newContactId();
    const nameFold = fold(input.name).replace(/\s+/g, " ").trim();
    const existing = this.db.selectValue("SELECT rowid FROM contacts WHERE id=?", [id]);
    const values: SqlValue[] = [
      input.name,
      nameFold,
      phoneticKey(input.name),
      sortKeyOf(input.name),
      firstLetterOf(input.name),
      input.company,
      input.note,
      input.starred ? 1 : 0,
      input.phones.length,
      input.importBatch ?? null
    ];
    if (existing !== undefined && existing !== null) {
      const rowid = num(existing);
      const stmt = this.db.prepare(
        "UPDATE contacts SET name=?,name_fold=?,name_phonetic=?,sort_key=?,first_letter=?,company=?,note=?,starred=?,phone_count=?,import_batch=COALESCE(?,import_batch),updated_at=? WHERE rowid=?"
      );
      stmt.bind([...values, input.updatedAt ?? now, rowid]).step();
      stmt.finalize();
      this.writeDerived(rowid, input, now);
      return { rowid, id, created: false };
    }
    const stmt = this.db.prepare(
      "INSERT INTO contacts(id,name,name_fold,name_phonetic,sort_key,first_letter,company,note,starred,phone_count,import_batch,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
    );
    stmt.bind([id, ...values, input.createdAt ?? now, input.updatedAt ?? now]).step();
    stmt.finalize();
    const rowid = num(this.db.selectValue("SELECT last_insert_rowid()"));
    this.writeDerived(rowid, input, now);
    return { rowid, id, created: true };
  }

  hydrate(rowids: readonly number[]): Contact[] {
    const out = new Map<number, Contact>();
    for (const part of chunk(rowids, 400)) {
      const marks = placeholders(part.length);
      const rows = this.db.selectObjects(
        `SELECT rowid,id,name,company,note,starred,import_batch,created_at,updated_at FROM contacts WHERE rowid IN (${marks})`,
        part
      );
      for (const row of rows) {
        out.set(num(row.rowid), {
          id: str(row.id),
          name: str(row.name),
          company: str(row.company),
          note: str(row.note),
          starred: num(row.starred) === 1,
          phones: [],
          emails: [],
          aliases: [],
          groups: [],
          importBatch: row.import_batch === null ? null : str(row.import_batch),
          createdAt: num(row.created_at),
          updatedAt: num(row.updated_at)
        });
      }
      for (const row of this.db.selectObjects(`SELECT contact_rowid,value,label FROM phones WHERE contact_rowid IN (${marks}) ORDER BY contact_rowid,position`, part)) {
        out.get(num(row.contact_rowid))?.phones.push({ value: str(row.value), label: str(row.label) });
      }
      for (const row of this.db.selectObjects(`SELECT contact_rowid,value,label FROM emails WHERE contact_rowid IN (${marks}) ORDER BY contact_rowid,position`, part)) {
        out.get(num(row.contact_rowid))?.emails.push({ value: str(row.value), label: str(row.label) });
      }
      for (const row of this.db.selectObjects(`SELECT contact_rowid,value FROM aliases WHERE contact_rowid IN (${marks}) ORDER BY contact_rowid,position`, part)) {
        out.get(num(row.contact_rowid))?.aliases.push(str(row.value));
      }
      for (const row of this.db.selectObjects(
        `SELECT cg.contact_rowid,g.name FROM contact_groups cg JOIN groups g ON g.id=cg.group_id WHERE cg.contact_rowid IN (${marks}) ORDER BY g.name`,
        part
      )) {
        out.get(num(row.contact_rowid))?.groups.push(str(row.name));
      }
    }
    return rowids.map((rowid) => out.get(rowid)).filter((c): c is Contact => c !== undefined);
  }

  rowidOf(id: string): number | null {
    const value = this.db.selectValue("SELECT rowid FROM contacts WHERE id=?", [id]);
    return value === undefined || value === null ? null : num(value);
  }

  getContact(id: string): Contact | null {
    const rowid = this.rowidOf(id);
    if (rowid === null) return null;
    return this.hydrate([rowid])[0] ?? null;
  }

  contactsByIds(ids: readonly string[]): Contact[] {
    const rowids: number[] = [];
    for (const part of chunk(ids, 400)) {
      for (const value of this.db.selectValues(`SELECT rowid FROM contacts WHERE id IN (${placeholders(part.length)})`, part)) rowids.push(num(value));
    }
    return this.hydrate(rowids);
  }

  deleteRowids(rowids: readonly number[]): void {
    for (const part of chunk(rowids, 400)) {
      const marks = placeholders(part.length);
      for (const table of ["phones", "emails", "aliases", "contact_groups"]) this.db.exec({ sql: `DELETE FROM ${table} WHERE contact_rowid IN (${marks})`, bind: [...part] });
      for (const rowid of part) this.db.exec(`DELETE FROM contacts_fts WHERE rowid=${rowid}`);
      this.db.exec({ sql: `DELETE FROM contacts WHERE rowid IN (${marks})`, bind: [...part] });
    }
  }

  recordHistory(kind: string, label: string, affected: number, payload: HistoryPayload, now: number): string {
    const id = `h_${now.toString(36)}${crypto.randomUUID().slice(0, 6)}`;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const stmt = this.db.prepare("INSERT INTO history(id,created_at,kind,label,affected,payload) VALUES(?,?,?,?,?,?)");
    stmt.bind([id, now, kind, label, affected, bytes]).step();
    stmt.finalize();
    this.db.exec(`DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY created_at DESC, rowid DESC LIMIT ${HISTORY_LIMIT})`);
    return id;
  }

  saveContact(raw: ContactInput, label: string): { contact: Contact; historyId: string } {
    const now = Date.now();
    let historyId = "";
    let rowid = 0;
    this.db.transaction(() => {
      const before = raw.id ? this.getContact(raw.id) : null;
      const result = this.upsertInTransaction(raw, now);
      rowid = result.rowid;
      const payload: HistoryPayload = { type: "snapshots", before: before ? [before] : [], created: result.created ? [result.id] : [] };
      historyId = this.recordHistory(result.created ? "create" : "edit", label, 1, payload, now);
    });
    this.touch();
    const contact = this.hydrate([rowid])[0];
    if (!contact) throw new Error("Saved contact could not be read back");
    return { contact, historyId };
  }

  async materializeSelection(selection: Selection): Promise<number> {
    this.db.exec("DELETE FROM sel");
    if (selection.kind === "ids") {
      for (const part of chunk(selection.ids, 400)) {
        this.db.exec({ sql: `INSERT OR IGNORE INTO sel(rowid) SELECT rowid FROM contacts WHERE id IN (${placeholders(part.length)})`, bind: [...part] });
      }
    } else if (selection.search.trim()) {
      const outcome = await searchLibrary(this, selection.search, selection.filter, { requestId: null, all: true });
      const ranked = outcome ? outcome.results.map((r) => r.rowid) : [];
      for (const part of chunk(ranked, 400)) this.db.exec({ sql: `INSERT OR IGNORE INTO sel(rowid) VALUES ${part.map(() => "(?)").join(",")}`, bind: [...part] });
    } else {
      const where = filterWhere(selection.filter, Date.now());
      this.db.exec({ sql: `INSERT OR IGNORE INTO sel(rowid) SELECT c.rowid FROM contacts c WHERE ${where.sql}`, bind: where.args });
    }
    return num(this.db.selectValue("SELECT COUNT(*) FROM sel"));
  }

  selectedRowids(): number[] {
    return this.db.selectValues("SELECT rowid FROM sel ORDER BY rowid").map(num);
  }

  async yieldIfStale(requestId: number): Promise<boolean> {
    await yieldToEventLoop();
    return this.latestRequest !== requestId;
  }

  bytesUsed(): number {
    const pages = num(this.db.selectValue("PRAGMA page_count"));
    const size = num(this.db.selectValue("PRAGMA page_size"));
    return pages * size;
  }

  groups(): GroupInfo[] {
    return this.db
      .selectObjects("SELECT g.id,g.name,g.color,(SELECT COUNT(*) FROM contact_groups cg WHERE cg.group_id=g.id) AS n FROM groups g ORDER BY g.name COLLATE NOCASE")
      .map((r) => ({ id: num(r.id), name: str(r.name), color: str(r.color), count: num(r.n) }));
  }

  counts(): LibraryCounts {
    if (this.countsCache && this.countsCache.version === this.mutationVersion) return this.countsCache.counts;
    const now = Date.now();
    const scalar = (sql: string, bind: SqlValue[] = []): number => num(this.db.selectValue(sql, bind));
    const counts: LibraryCounts = {
      all: scalar("SELECT COUNT(*) FROM contacts"),
      starred: scalar("SELECT COUNT(*) FROM contacts WHERE starred=1"),
      recentlyAdded: scalar("SELECT COUNT(*) FROM contacts WHERE created_at>=?", [now - RECENT_WINDOW_MS]),
      recentlyEdited: scalar("SELECT COUNT(*) FROM contacts WHERE updated_at>=?", [now - RECENT_WINDOW_MS]),
      noNumber: scalar("SELECT COUNT(*) FROM contacts WHERE phone_count=0"),
      noName: scalar("SELECT COUNT(*) FROM contacts WHERE sort_key=''"),
      duplicateGroups: this.duplicatesVersion === this.mutationVersion ? this.duplicateGroupCount : -1,
      groups: this.groups(),
      bytes: this.bytesUsed()
    };
    this.countsCache = { version: this.mutationVersion, counts };
    return counts;
  }

  listPlain(query: ListQuery): ListResult {
    const started = performance.now();
    const where = filterWhere(query.filter, Date.now());
    const total = num(this.db.selectValue(`SELECT COUNT(*) FROM contacts c WHERE ${where.sql}`, where.args));
    const rows = this.db.selectObjects(
      `SELECT c.rowid,c.id,c.name,c.company,c.starred,c.phone_count,c.first_letter,c.created_at,c.updated_at,
        (SELECT value FROM phones p WHERE p.contact_rowid=c.rowid ORDER BY position LIMIT 1) AS primary_phone
       FROM contacts c WHERE ${where.sql} ORDER BY ${sortClause(query.sort)} LIMIT ? OFFSET ?`,
      [...where.args, Math.min(query.limit, 500), query.offset]
    );
    return {
      requestId: query.requestId,
      rows: rows.map(toRow),
      total,
      offset: query.offset,
      cancelled: false,
      tookMs: performance.now() - started
    };
  }

  letterOffsets(filter: LibraryFilter, sort: SortKey): Array<{ letter: string; offset: number; count: number }> {
    const where = filterWhere(filter, Date.now());
    const rows = this.db.selectObjects(
      `SELECT c.first_letter AS l, MIN(c.sort_key) AS mk, COUNT(*) AS n FROM contacts c WHERE ${where.sql} GROUP BY c.first_letter ORDER BY mk ${sort === "nameDesc" ? "DESC" : "ASC"}`,
      where.args
    );
    let offset = 0;
    return rows.map((r) => {
      const entry = { letter: str(r.l), offset, count: num(r.n) };
      offset += entry.count;
      return entry;
    });
  }
}

export function toRow(r: Record<string, unknown>): ContactRow {
  return {
    rowid: num(r.rowid),
    id: str(r.id),
    name: str(r.name),
    company: str(r.company),
    starred: num(r.starred) === 1,
    phoneCount: num(r.phone_count),
    primaryPhone: str(r.primary_phone),
    firstLetter: str(r.first_letter),
    updatedAt: num(r.updated_at),
    createdAt: num(r.created_at),
    matchTag: null,
    matchAlias: null
  };
}

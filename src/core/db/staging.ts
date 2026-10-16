import { fold } from "../fold";
import { digitsOf, previewStoredNumber, reverseString } from "../phone";
import { phoneKey } from "../phone";
import type { Contact, ContactInput, ParsedContact } from "../types";
import { newContactId } from "./filters";
import { mergeContacts, toInput } from "./service";
import { LibraryService } from "./service";
import { STAGE_SCHEMA } from "./schema";
import { chunk, num, placeholders, str } from "./sql";

export type StageCategory = "new" | "match" | "conflict" | "dupInFile" | "invalid";
export type ImportMode = "add" | "update";
export type MergeMode = "fillEmpty" | "overwrite" | "addNumbers";

export interface StageSummary {
  total: number;
  newContacts: number;
  matches: number;
  conflicts: number;
  dupInFile: number;
  invalid: number;
  reformatted: number;
  included: number;
}

export interface StageRow {
  seq: number;
  source: number;
  contactId: string;
  name: string;
  company: string;
  note: string;
  phones: string[];
  emails: string[];
  aliases: string[];
  groups: string[];
  category: StageCategory;
  matchRowid: number | null;
  matchName: string;
  candidates: Array<{ rowid: number; name: string; phone: string }>;
  included: boolean;
  invalidReason: string;
  mergedInto: number | null;
}

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  batchId: string;
  historyId: string | null;
}

function uniq(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

export class ImportStaging extends LibraryService {
  stageBegin(): void {
    for (const statement of STAGE_SCHEMA) this.db.exec(statement);
  }

  stageDiscard(): void {
    this.db.exec("DROP TABLE IF EXISTS import_stage");
    this.db.exec("DROP TABLE IF EXISTS import_keys");
  }

  stageInsert(source: number, batch: ParsedContact[]): { inserted: number; invalid: number; merged: number } {
    let invalid = 0;
    let merged = 0;
    this.db.transaction(() => {
      const insert = this.db.prepare(
        "INSERT INTO import_stage(source,contact_id,name,name_fold,company,note,phones,emails,aliases,groups,category,match_rowid,candidates,reformatted,included,merged_into,invalid_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      );
      const keyInsert = this.db.prepare("INSERT INTO import_keys(key,seq) VALUES(?,?)");
      for (const raw of batch) {
        const name = raw.name.trim();
        let reformatted = 0;
        const seenKeys = new Set<string>();
        const phones: string[] = [];
        for (const phone of raw.phones) {
          const stored = previewStoredNumber(phone, this.country);
          const key = phoneKey(stored);
          if (!key || seenKeys.has(key)) continue;
          seenKeys.add(key);
          phones.push(stored);
          if (stored !== phone.trim()) reformatted += 1;
        }
        const emails = uniq(raw.emails);
        if (!name && phones.length === 0 && emails.length === 0) {
          invalid += 1;
          insert.bind([source, "", "", "", "", "", "[]", "[]", "[]", "[]", "invalid", null, "[]", 0, 0, null, "empty"]).step();
          insert.reset();
          continue;
        }
        const nameFold = fold(name).replace(/\s+/g, " ").trim();
        let target: number | null = null;
        if (seenKeys.size > 0) {
          const keys = [...seenKeys];
          const hit = this.db.selectValues(`SELECT seq FROM import_keys WHERE key IN (${placeholders(keys.length)}) ORDER BY seq LIMIT 1`, keys)[0];
          if (hit !== undefined && hit !== null) {
            const targetSeq = num(hit);
            const targetName = str(this.db.selectValue("SELECT name_fold FROM import_stage WHERE seq=?", [targetSeq]));
            if (!nameFold || !targetName || targetName === nameFold) target = targetSeq;
          }
        }
        if (target !== null) {
          const current = this.db.selectObjects("SELECT name,name_fold,company,note,phones,emails,aliases,groups,contact_id FROM import_stage WHERE seq=?", [target])[0];
          if (current) {
            const mergedPhones = uniq([...(JSON.parse(str(current.phones)) as string[]), ...phones]);
            const dedup: string[] = [];
            const keys = new Set<string>();
            for (const p of mergedPhones) {
              const k = phoneKey(p);
              if (!keys.has(k)) {
                keys.add(k);
                dedup.push(p);
              }
            }
            this.db.exec({
              sql: "UPDATE import_stage SET name=?,name_fold=?,company=?,note=?,phones=?,emails=?,aliases=?,groups=?,contact_id=? WHERE seq=?",
              bind: [
                str(current.name) || name,
                str(current.name_fold) || nameFold,
                str(current.company) || raw.company.trim(),
                str(current.note) || raw.note.trim(),
                JSON.stringify(dedup),
                JSON.stringify(uniq([...(JSON.parse(str(current.emails)) as string[]), ...emails])),
                JSON.stringify(uniq([...(JSON.parse(str(current.aliases)) as string[]), ...raw.aliases])),
                JSON.stringify(uniq([...(JSON.parse(str(current.groups)) as string[]), ...raw.groups])),
                str(current.contact_id) || raw.contactId.trim(),
                target
              ]
            });
            for (const key of keys) {
              const exists = this.db.selectValue("SELECT 1 FROM import_keys WHERE key=? AND seq=?", [key, target]);
              if (exists === undefined || exists === null) {
                keyInsert.bind([key, target]).step();
                keyInsert.reset();
              }
            }
          }
          merged += 1;
          insert.bind([source, raw.contactId.trim(), name, nameFold, "", "", "[]", "[]", "[]", "[]", "dupInFile", null, "[]", reformatted, 1, target, ""]).step();
          insert.reset();
          continue;
        }
        insert
          .bind([source, raw.contactId.trim(), name, nameFold, raw.company.trim(), raw.note.trim(), JSON.stringify(phones), JSON.stringify(emails), JSON.stringify(uniq(raw.aliases)), JSON.stringify(uniq(raw.groups)), "new", null, "[]", reformatted, 1, null, ""])
          .step();
        insert.reset();
        const seq = num(this.db.selectValue("SELECT last_insert_rowid()"));
        for (const key of seenKeys) {
          keyInsert.bind([key, seq]).step();
          keyInsert.reset();
        }
      }
      insert.finalize();
      keyInsert.finalize();
    });
    return { inserted: batch.length - invalid - merged, invalid, merged };
  }

  stageClassify(): void {
    const rows = this.db.selectObjects("SELECT seq,contact_id,name_fold,phones FROM import_stage WHERE category='new'");
    for (const part of chunk(rows, 500)) {
      this.db.transaction(() => {
        for (const r of part) {
          const seq = num(r.seq);
          const found = this.findMatches(str(r.contact_id), str(r.name_fold), JSON.parse(str(r.phones)) as string[]);
          if (found.length === 0) continue;
          if (found.length === 1) {
            this.db.exec({ sql: "UPDATE import_stage SET category='match',match_rowid=? WHERE seq=?", bind: [found[0] ?? 0, seq] });
          } else {
            this.db.exec({ sql: "UPDATE import_stage SET category='conflict',candidates=? WHERE seq=?", bind: [JSON.stringify(found), seq] });
          }
        }
      });
    }
  }

  findMatches(contactId: string, nameFold: string, phones: string[]): number[] {
    if (contactId) {
      const hit = this.db.selectValue("SELECT rowid FROM contacts WHERE id=?", [contactId]);
      if (hit !== undefined && hit !== null) return [num(hit)];
    }
    const found = new Set<number>();
    for (const phone of phones) {
      const digits = digitsOf(phone);
      if (digits.length < 5) continue;
      const key = reverseString(digits).slice(0, digits.length >= 7 ? 9 : digits.length);
      const sql =
        digits.length >= 7
          ? "SELECT DISTINCT contact_rowid FROM phones WHERE digits_rev>=? AND digits_rev<? AND length(digits)>=7 LIMIT 20"
          : "SELECT DISTINCT contact_rowid FROM phones WHERE digits=? LIMIT 20";
      const args = digits.length >= 7 ? [key, `${key}\uffff`] : [digits];
      for (const value of this.db.selectValues(sql, args)) found.add(num(value));
    }
    if (found.size > 0) return [...found];
    if (nameFold) for (const value of this.db.selectValues("SELECT rowid FROM contacts WHERE name_fold=? LIMIT 20", [nameFold])) found.add(num(value));
    return [...found];
  }

  stageSummary(): StageSummary {
    const count = (where: string): number => num(this.db.selectValue(`SELECT COUNT(*) FROM import_stage WHERE ${where}`));
    return {
      total: count("1=1"),
      newContacts: count("category='new'"),
      matches: count("category='match'"),
      conflicts: count("category='conflict'"),
      dupInFile: count("category='dupInFile'"),
      invalid: count("category='invalid'"),
      reformatted: num(this.db.selectValue("SELECT COALESCE(SUM(reformatted),0) FROM import_stage")),
      included: count("included=1 AND category IN ('new','match')")
    };
  }

  stageList(category: StageCategory, offset: number, limit: number): { rows: StageRow[]; total: number } {
    const total = num(this.db.selectValue("SELECT COUNT(*) FROM import_stage WHERE category=?", [category]));
    const rows = this.db
      .selectObjects(
        `SELECT s.*, (SELECT name FROM contacts WHERE rowid=s.match_rowid) AS match_name FROM import_stage s WHERE s.category=? ORDER BY s.seq LIMIT ? OFFSET ?`,
        [category, limit, offset]
      )
      .map((r): StageRow => {
        const candidateIds = JSON.parse(str(r.candidates)) as number[];
        const candidates = candidateIds.map((rowid) => {
          const c = this.hydrate([rowid])[0];
          return { rowid, name: c?.name ?? "", phone: c?.phones[0]?.value ?? "" };
        });
        return {
          seq: num(r.seq),
          source: num(r.source),
          contactId: str(r.contact_id),
          name: str(r.name),
          company: str(r.company),
          note: str(r.note),
          phones: JSON.parse(str(r.phones)) as string[],
          emails: JSON.parse(str(r.emails)) as string[],
          aliases: JSON.parse(str(r.aliases)) as string[],
          groups: JSON.parse(str(r.groups)) as string[],
          category: str(r.category) as StageCategory,
          matchRowid: r.match_rowid === null ? null : num(r.match_rowid),
          matchName: str(r.match_name),
          candidates,
          included: num(r.included) === 1,
          invalidReason: str(r.invalid_reason),
          mergedInto: r.merged_into === null ? null : num(r.merged_into)
        };
      });
    return { rows, total };
  }

  stageSetIncluded(seqs: number[], included: boolean): void {
    for (const part of chunk(seqs, 400)) this.db.exec({ sql: `UPDATE import_stage SET included=? WHERE seq IN (${placeholders(part.length)})`, bind: [included ? 1 : 0, ...part] });
  }

  stageSetCategoryIncluded(category: StageCategory, included: boolean): void {
    this.db.exec({ sql: "UPDATE import_stage SET included=? WHERE category=?", bind: [included ? 1 : 0, category] });
  }

  stageResolveConflict(seq: number, matchRowid: number | null): void {
    if (matchRowid === null) this.db.exec({ sql: "UPDATE import_stage SET category='new',match_rowid=NULL WHERE seq=?", bind: [seq] });
    else this.db.exec({ sql: "UPDATE import_stage SET category='match',match_rowid=? WHERE seq=?", bind: [matchRowid, seq] });
  }

  applyMerge(existing: Contact, incoming: ContactInput, mode: MergeMode): ContactInput {
    const base = toInput(existing);
    if (mode === "fillEmpty") {
      return {
        ...base,
        name: base.name || incoming.name,
        company: base.company || incoming.company,
        note: base.note || incoming.note,
        phones: base.phones.length ? base.phones : incoming.phones,
        emails: base.emails.length ? base.emails : incoming.emails,
        aliases: base.aliases.length ? base.aliases : incoming.aliases,
        groups: base.groups.length ? base.groups : incoming.groups
      };
    }
    if (mode === "overwrite") {
      return {
        ...base,
        name: incoming.name || base.name,
        company: incoming.company || base.company,
        note: incoming.note || base.note,
        phones: incoming.phones.length ? incoming.phones : base.phones,
        emails: incoming.emails.length ? incoming.emails : base.emails,
        aliases: incoming.aliases.length ? incoming.aliases : base.aliases,
        groups: incoming.groups.length ? incoming.groups : base.groups
      };
    }
    const asContact: Contact = { ...existing, name: base.name || incoming.name };
    const incomingContact: Contact = { ...existing, id: existing.id, name: "", company: "", note: "", starred: false, phones: incoming.phones, emails: incoming.emails, aliases: incoming.aliases, groups: incoming.groups };
    const merged = mergeContacts(asContact, incomingContact);
    return toInput(merged);
  }

  stageCommit(mode: ImportMode, mergeMode: MergeMode, label: string, onProgress?: (done: number, total: number) => void): CommitResult {
    const batchId = `b_${Date.now().toString(36)}`;
    const rows = this.db.selectObjects("SELECT * FROM import_stage WHERE included=1 AND category IN ('new','match','conflict') ORDER BY seq");
    const total = rows.length;
    const now = Date.now();
    const created: string[] = [];
    const before: Contact[] = [];
    let updated = 0;
    let skipped = 0;
    let done = 0;
    for (const part of chunk(rows, 1000)) {
      this.db.transaction(() => {
        for (const r of part) {
          const category = str(r.category);
          const incoming: ContactInput = {
            id: undefined,
            name: str(r.name),
            company: str(r.company),
            note: str(r.note),
            starred: false,
            phones: (JSON.parse(str(r.phones)) as string[]).map((value) => ({ value, label: "mobile" })),
            emails: (JSON.parse(str(r.emails)) as string[]).map((value) => ({ value, label: "work" })),
            aliases: JSON.parse(str(r.aliases)) as string[],
            groups: JSON.parse(str(r.groups)) as string[],
            importBatch: batchId
          };
          if (mode === "update" && category === "match" && r.match_rowid !== null) {
            const existing = this.hydrate([num(r.match_rowid)])[0];
            if (existing) {
              before.push(existing);
              this.upsertInTransaction({ ...this.applyMerge(existing, incoming, mergeMode), importBatch: null, updatedAt: now }, now);
              updated += 1;
              continue;
            }
          }
          if (mode === "update" && category === "conflict") {
            skipped += 1;
            continue;
          }
          const wanted = str(r.contact_id);
          const free = wanted && this.rowidOf(wanted) === null ? wanted : newContactId();
          const result = this.upsertInTransaction({ ...incoming, id: free }, now);
          created.push(result.id);
        }
      });
      done += part.length;
      onProgress?.(done, total);
    }
    const historyId = this.recordHistory("import", label, created.length + updated, { type: "snapshots", before, created }, now);
    this.touch();
    this.stageDiscard();
    return { created: created.length, updated, skipped, batchId, historyId };
  }
}

import * as Comlink from "comlink";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbApi, InitInfo } from "../core/db/api";
import { legacyDatabaseExists, readLegacyBatches } from "../core/db/legacy";
import { ImportStaging } from "../core/db/staging";
import type { SqlDb } from "../core/db/sql";
import { defaultCountryFromLocale, previewStoredNumber } from "../core/phone";
import { sampleContacts } from "../core/sample";
import type { CountryCode } from "libphonenumber-js/max";

const DB_FILE = "/contact-flow.sqlite3";

class DbService implements DbApi {
  private lib: ImportStaging | null = null;
  private persistent = false;
  private pool: { wipeFiles(): Promise<void> } | null = null;

  private get l(): ImportStaging {
    if (!this.lib) throw new Error("The database is not open yet");
    return this.lib;
  }

  private initPromise: Promise<InitInfo> | null = null;

  init(locale: string): Promise<InitInfo> {
    if (!this.initPromise) this.initPromise = this.open(locale);
    return this.initPromise;
  }

  private async open(locale: string): Promise<InitInfo> {
    const sqlite3 = await sqlite3InitModule();
    let db: SqlDb | null = null;
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ clearOnInit: false, initialCapacity: 8, name: "contact-flow-pool" });
      this.pool = pool as unknown as { wipeFiles(): Promise<void> };
      db = new pool.OpfsSAHPoolDb(DB_FILE) as unknown as SqlDb;
      this.persistent = true;
    } catch {
      db = new sqlite3.oo1.DB(":memory:", "c") as unknown as SqlDb;
      this.persistent = false;
    }
    const lib = new ImportStaging(db);
    lib.open();
    if (!lib.getKv("defaultCountry")) lib.setKv("defaultCountry", defaultCountryFromLocale(locale));
    this.lib = lib;
    let migrated = 0;
    if (this.persistent && lib.getKv("migrated_v2") !== "1" && (await legacyDatabaseExists())) {
      try {
        migrated = await readLegacyBatches(2000, (batch) => {
          const now = Date.now();
          lib.db.transaction(() => {
            for (const input of batch) lib.upsertInTransaction(input, now);
          });
        });
        lib.touch();
      } catch {
        migrated = 0;
      }
    }
    if (this.persistent) lib.setKv("migrated_v2", "1");
    return { persistent: this.persistent, total: lib.total(), migrated, defaultCountry: lib.country };
  }

  async counts() { return this.l.counts(); }
  async list(query: Parameters<DbApi["list"]>[0]) { return this.l.list(query); }
  async letterOffsets(filter: Parameters<DbApi["letterOffsets"]>[0], sort: Parameters<DbApi["letterOffsets"]>[1]) { return this.l.letterOffsets(filter, sort); }
  async getContact(id: string) { return this.l.getContact(id); }
  async getContacts(ids: string[]) { return this.l.contactsByIds(ids); }
  async saveContact(input: Parameters<DbApi["saveContact"]>[0], label: string) { return this.l.saveContact(input, label); }
  async countSelection(selection: Parameters<DbApi["countSelection"]>[0]) { return this.l.countSelection(selection); }
  async setStarred(selection: Parameters<DbApi["setStarred"]>[0], starred: boolean, label: string) { return this.l.setStarred(selection, starred, label); }
  async deleteContacts(selection: Parameters<DbApi["deleteContacts"]>[0], label: string) { return this.l.deleteContacts(selection, label); }
  async addToGroup(selection: Parameters<DbApi["addToGroup"]>[0], groupId: number, label: string) { return this.l.addToGroup(selection, groupId, label); }
  async removeFromGroup(selection: Parameters<DbApi["removeFromGroup"]>[0], groupId: number, label: string) { return this.l.removeFromGroup(selection, groupId, label); }
  async createGroup(name: string) { return this.l.createGroup(name); }
  async renameGroup(id: number, name: string) { return this.l.renameGroup(id, name); }
  async recolorGroup(id: number, color: string) { this.l.recolorGroup(id, color); }
  async deleteGroup(id: number) { return this.l.deleteGroup(id); }
  async listHistory(limit: number, offset: number) { return this.l.listHistory(limit, offset); }
  async undo(historyId: string | null) { return this.l.undo(historyId); }
  async duplicateGroups(limit: number, offset: number) { return this.l.duplicateGroups(limit, offset); }
  async refreshDuplicates() {
    this.l.ensureDuplicates();
    return this.l.duplicateGroupCount;
  }
  async mergeGroup(keepId: string, mergeIds: string[], label: string) { return this.l.mergeGroup(keepId, mergeIds, label); }
  async batchPreview(selection: Parameters<DbApi["batchPreview"]>[0], opKey: string, params: Parameters<DbApi["batchPreview"]>[2], limit: number) { return this.l.batchPreview(selection, opKey, params, limit); }
  async batchApply(selection: Parameters<DbApi["batchApply"]>[0], opKey: string, params: Parameters<DbApi["batchApply"]>[2], label: string, onProgress?: (done: number, total: number) => void) { return this.l.batchApply(selection, opKey, params, label, onProgress); }
  async queueRecipients(selection: Parameters<DbApi["queueRecipients"]>[0], previewLimit: number) { return this.l.queueRecipients(selection, previewLimit); }
  async listPresets() { return this.l.listPresets(); }
  async savePreset(preset: Parameters<DbApi["savePreset"]>[0]) { this.l.savePreset(preset); }
  async deletePreset(id: string) { this.l.deletePreset(id); }
  async getKv(key: string) { return this.l.getKv(key); }
  async setKv(key: string, value: string) { this.l.setKv(key, value); }
  async readPage(selection: Parameters<DbApi["readPage"]>[0], afterRowid: number, limit: number) { return this.l.readPage(selection, afterRowid, limit); }
  async loadSample() {
    const lib = this.l;
    const now = Date.now();
    const batch = `sample_${now.toString(36)}`;
    const created: string[] = [];
    let historyId: string | null = null;
    lib.db.transaction(() => {
      for (const input of sampleContacts()) created.push(lib.upsertInTransaction({ ...input, importBatch: batch }, now).id);
      historyId = lib.recordHistory("import", "Sample", created.length, { type: "snapshots", before: [], created }, now);
    });
    lib.touch();
    return { count: created.length, historyId };
  }
  async stageBegin() { this.l.stageBegin(); }
  async stageClassify() { this.l.stageClassify(); }
  async stageSummary() { return this.l.stageSummary(); }
  async stageList(category: Parameters<DbApi["stageList"]>[0], offset: number, limit: number) { return this.l.stageList(category, offset, limit); }
  async stageSetIncluded(seqs: number[], included: boolean) { this.l.stageSetIncluded(seqs, included); }
  async stageSetCategoryIncluded(category: Parameters<DbApi["stageSetCategoryIncluded"]>[0], included: boolean) { this.l.stageSetCategoryIncluded(category, included); }
  async stageResolveConflict(seq: number, matchRowid: number | null) { this.l.stageResolveConflict(seq, matchRowid); }
  async stageCommit(mode: Parameters<DbApi["stageCommit"]>[0], mergeMode: Parameters<DbApi["stageCommit"]>[1], label: string, onProgress?: (done: number, total: number) => void) {
    return this.l.stageCommit(mode, mergeMode, label, onProgress);
  }
  async stageDiscard() { this.l.stageDiscard(); }
  async attachImportPort(port: MessagePort) {
    Comlink.expose(
      {
        stageInsert: async (source: number, batch: Parameters<ImportStaging["stageInsert"]>[1]) => this.l.stageInsert(source, batch)
      },
      port
    );
  }
  async previewStoredNumbers(samples: string[], country: string) {
    return samples.map((s) => previewStoredNumber(s, country as CountryCode));
  }
  async setDefaultCountry(country: string) { this.l.setKv("defaultCountry", country); }
  async wipe() {
    const lib = this.l;
    lib.db.transaction(() => {
      for (const table of ["contacts_fts", "phones", "emails", "aliases", "contact_groups", "groups", "history", "contacts"]) lib.db.exec(`DELETE FROM ${table}`);
    });
    lib.touch();
  }
}

Comlink.expose(new DbService());

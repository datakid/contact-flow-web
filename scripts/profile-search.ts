import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { LibraryService } from "../src/core/db/service";
import type { SqlDb } from "../src/core/db/sql";
import { emptyContactInput } from "../src/core/types";

const require = createRequire(import.meta.url);
const total = 150000;
const first = ["Mohamed", "Ahmed", "Sara", "Omar", "Layla", "John", "Maria", "Chen", "Yuki", "Fatima", "Khaled", "Anna", "Peter", "Noor", "Ali", "Hassan", "Olivia", "Lucas", "Priya", "Ivan"];
const last = ["Hassan", "Smith", "Ali", "Khan", "Garcia", "Wang", "Tanaka", "Ibrahim", "Johnson", "Petrov", "Mansour", "Silva", "Nasser", "Brown", "Kim", "Rossi", "Haddad", "Said", "Lee", "Costa"];

async function main(): Promise<void> {
  const init = sqlite3InitModule as unknown as (o: object) => ReturnType<typeof sqlite3InitModule>;
  const sqlite3 = await init({ wasmBinary: readFileSync(require.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm")), print: () => undefined, printErr: () => undefined });
  const lib = new LibraryService(new sqlite3.oo1.DB(":memory:", "c") as unknown as SqlDb);
  lib.open();
  const now = Date.now();
  for (let b = 0; b < total; b += 5000) {
    lib.db.transaction(() => {
      for (let i = b; i < b + 5000; i++) {
        const input = { ...emptyContactInput(), name: `${first[i % 20]} ${last[(i * 7 + (i >> 4)) % 20]} ${i}`, phones: [{ value: `05${String(10000000 + i * 7).slice(0, 8)}`, label: "mobile" }] };
        lib.upsertInTransaction(input, now);
      }
    });
  }
  const time = (label: string, fn: () => unknown): void => {
    const t0 = performance.now();
    const r = fn();
    console.log(label.padEnd(34), Math.round(performance.now() - t0), "ms", Array.isArray(r) ? r.length : "");
  };
  let ids: number[] = [];
  time("fts rowids (limit 50000)", () => (ids = lib.db.selectValues("SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH ? LIMIT 50000", ['"mohamed"']).map(Number)));
  time("fts count", () => lib.db.selectValue("SELECT COUNT(*) FROM contacts_fts WHERE contacts_fts MATCH ?", ['"mohamed"']));
  time("json_each load base", () => lib.db.selectObjects("SELECT c.rowid,c.name,c.name_fold,c.company,c.sort_key FROM contacts c WHERE c.rowid IN (SELECT value FROM json_each(?))", [JSON.stringify(ids)]));
  time("join fts->contacts", () => lib.db.selectObjects("SELECT c.rowid,c.name,c.name_fold,c.company,c.sort_key FROM contacts c WHERE c.rowid IN (SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH ? LIMIT 50000)", ['"mohamed"']));
  time("prefix scan sort_key", () => lib.db.selectObjects("SELECT rowid,name FROM contacts WHERE sort_key>=? AND sort_key<? LIMIT 500", ["mohamed", "mohamed\uffff"]));
  time("hassan smith count", () => lib.db.selectValue("SELECT COUNT(*) FROM contacts WHERE name_fold LIKE 'hassan smith%'"));
}

void main();

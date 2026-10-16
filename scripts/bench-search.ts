import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { LibraryService } from "../src/core/db/service";
import type { SqlDb } from "../src/core/db/sql";
import { emptyContactInput } from "../src/core/types";

const require = createRequire(import.meta.url);
const total = Number(process.argv[2] ?? 200000);

const first = ["Mohamed", "Ahmed", "Sara", "Omar", "Layla", "John", "Maria", "Chen", "Yuki", "Fatima", "Khaled", "Anna", "Peter", "Noor", "Ali", "Hassan", "Olivia", "Lucas", "Priya", "Ivan"];
const last = ["Hassan", "Smith", "Ali", "Khan", "Garcia", "Wang", "Tanaka", "Ibrahim", "Johnson", "Petrov", "Mansour", "Silva", "Nasser", "Brown", "Kim", "Rossi", "Haddad", "Said", "Lee", "Costa"];
const arabic = ["محمد", "أحمد", "فاطمة", "خالد", "سارة", "عمر", "ليلى", "علي"];
const arabicLast = ["الخطيب", "العتيبي", "القحطاني", "المصري", "حسن", "إبراهيم"];

function pick<T>(list: readonly T[], i: number): T {
  return list[i % list.length] as T;
}

async function main(): Promise<void> {
  const init = sqlite3InitModule as unknown as (o: object) => ReturnType<typeof sqlite3InitModule>;
  const sqlite3 = await init({ wasmBinary: readFileSync(require.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm")), print: () => undefined, printErr: () => undefined });
  const lib = new LibraryService(new sqlite3.oo1.DB(":memory:", "c") as unknown as SqlDb);
  lib.open();
  lib.setKv("defaultCountry", "AE");
  const started = performance.now();
  const now = Date.now();
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let batch = 0; batch < total; batch += 5000) {
    lib.db.transaction(() => {
      for (let i = batch; i < Math.min(total, batch + 5000); i++) {
        const r = rand();
        const name = i % 5 === 0 ? `${pick(arabic, r)} ${pick(arabicLast, r >>> 3)}` : `${pick(first, r)} ${pick(last, r >>> 5)} ${i}`;
        const input = { ...emptyContactInput(), name, company: i % 7 === 0 ? `Company ${i % 500}` : "", phones: [{ value: `05${String(rand() % 100000000).padStart(8, "0")}`, label: "mobile" }], emails: i % 3 === 0 ? [{ value: `user${i}@example.com`, label: "work" }] : [] };
        lib.upsertInTransaction(input, now);
      }
    });
    if (batch % 100000 === 0) console.log(`seeded ${batch} in ${Math.round((performance.now() - started) / 1000)}s`);
  }
  lib.touch();
  console.log(`seeded ${total} in ${Math.round((performance.now() - started) / 1000)}s`);

  let requestSeq = 1000;
  const queries = ["mohamed", "moh", "ham", "hassan smith", "05012", "0501234", "+971501234567", "user1234@", "محمد", "احمد", "mohammed", "jhonson", "xyz", "company 4", "a"];
  for (const q of queries) {
    const t0 = performance.now();
    const result = await lib.list({ channel: "aux", filter: { kind: "all" }, sort: "nameAsc", search: q, offset: 0, limit: 500, requestId: ++requestSeq });
    const t1 = performance.now();
    console.log(`${q.padEnd(16)} ${String(Math.round(t1 - t0)).padStart(5)} ms  rows=${result.rows.length} total=${result.total}`);
  }
  console.log("names like hassan smith:", lib.db.selectValue("SELECT COUNT(*) FROM contacts WHERE name_fold LIKE 'hassan smith%'"));
  const t0 = performance.now();
  const page = lib.listPlain({ channel: "aux", filter: { kind: "all" }, sort: "nameAsc", search: "", offset: Math.floor(total / 2), limit: 200, requestId: 1 });
  console.log(`plain page@${Math.floor(total / 2)}  ${Math.round(performance.now() - t0)} ms rows=${page.rows.length}`);
  const c0 = performance.now();
  lib.touch();
  lib.counts();
  console.log(`counts ${Math.round(performance.now() - c0)} ms`);
}

void main();

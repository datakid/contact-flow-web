import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Library } from "../../src/core/db/library";
import type { SqlDb } from "../../src/core/db/sql";
import type { ContactInput } from "../../src/core/types";
import { emptyContactInput } from "../../src/core/types";

const require = createRequire(import.meta.url);

export async function makeLibrary(country = "AE"): Promise<Library> {
  const wasmPath = require.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm");
  const sqlite3 = await (sqlite3InitModule as unknown as (o: object) => ReturnType<typeof sqlite3InitModule>)({ wasmBinary: readFileSync(wasmPath), print: () => undefined, printErr: () => undefined });
  const db = new sqlite3.oo1.DB(":memory:", "c") as unknown as SqlDb;
  const library = new Library(db);
  library.open();
  library.setKv("defaultCountry", country);
  return library;
}

export function contact(partial: Partial<ContactInput> & { name: string }): ContactInput {
  return { ...emptyContactInput(), ...partial };
}

export function phones(...values: string[]): ContactInput["phones"] {
  return values.map((value) => ({ value, label: "mobile" }));
}

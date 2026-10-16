import * as Comlink from "comlink";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { ImportStaging } from "../core/db/staging";
import type { SqlDb } from "../core/db/sql";
import { workerCases } from "../selftest/cases";
import { runCases } from "../selftest/runner";
import type { SelfTestResult } from "../selftest/types";

class SelfTestService {
  async total(): Promise<number> {
    return workerCases.length;
  }

  async run(onProgress: (result: SelfTestResult) => void): Promise<SelfTestResult[]> {
    const sqlite3 = await sqlite3InitModule();
    const newLibrary = (): ImportStaging => {
      const db = new sqlite3.oo1.DB(":memory:", "c") as unknown as SqlDb;
      const lib = new ImportStaging(db);
      lib.open();
      lib.setKv("defaultCountry", "US");
      return lib;
    };
    return runCases(workerCases, { newLibrary }, onProgress);
  }
}

Comlink.expose(new SelfTestService());

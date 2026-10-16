import { describe, expect, it } from "vitest";
import { ImportStaging } from "../../src/core/db/staging";
import { workerCases } from "../../src/selftest/cases";
import { runCases } from "../../src/selftest/runner";
import type { SelfTestContext } from "../../src/selftest/types";
import { makeLibrary } from "./helpers";

describe("self-test cases", () => {
  it("all worker-side cases pass against an in-memory library", async () => {
    const ctx: SelfTestContext = {
      newLibrary: () => {
        throw new Error("replaced below");
      }
    };
    const libraries: ImportStaging[] = [];
    for (let i = 0; i < 40; i++) {
      const base = await makeLibrary("US");
      const lib = new ImportStaging(base.db);
      lib.open();
      libraries.push(lib);
    }
    let next = 0;
    ctx.newLibrary = () => {
      const lib = libraries[next];
      next += 1;
      if (!lib) throw new Error("ran out of libraries");
      return lib;
    };
    const seen: string[] = [];
    const results = await runCases(workerCases, ctx, (r) => seen.push(r.id));
    const failed = results.filter((r) => r.status === "fail").map((r) => `${r.id}: ${r.message}`);
    expect(failed).toEqual([]);
    expect(results.length).toBe(workerCases.length);
    expect(seen.length).toBe(results.length);
  }, 180000);
});

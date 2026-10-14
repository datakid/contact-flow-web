import { describe, expect, it } from "vitest";
import { OPS, defaultParams, differs, opByKey } from "../../src/core/ops/ops";
import type { Contact } from "../../src/core/types";

const base: Contact = { id: "c", name: "ahmed ali", company: "", note: "", starred: false, phones: [{ value: "0501234567", label: "mobile" }, { value: "050 123 4567", label: "work" }], emails: [], aliases: [], groups: [], importBatch: null, createdAt: 1, updatedAt: 1 };

function run(key: string, params: Record<string, string | number | boolean>, row: Contact = base, i = 0): Contact {
  const op = opByKey(key);
  if (!op) throw new Error(key);
  return op.run(row, { ...defaultParams(op), ...params }, i);
}

describe("batch ops", () => {
  it("registers all 17 operations", () => {
    expect(OPS).toHaveLength(17);
    expect(new Set(OPS.map((o) => o.key)).size).toBe(17);
  });

  it("transforms names", () => {
    expect(run("case", { mode: "title" }).name).toBe("Ahmed Ali");
    expect(run("swap", {}).name).toBe("ali ahmed");
    expect(run("affix", { pre: "Dr. ", suf: "" }).name).toBe("Dr. ahmed ali");
    expect(run("pattern", { pat: "{last} {n}", start: 5 }, base, 2).name).toBe("ali 7");
    expect(run("replace", { field: "name", find: "ALI", repl: "Omar" }).name).toBe("ahmed Omar");
    expect(run("clean", {}, { ...base, name: "  ★ Sam   Lee 😀 " }).name).toBe("★ Sam Lee");
  });

  it("handles aliases", () => {
    const withAlias = run("aliasAdd", { val: "{first}" });
    expect(withAlias.aliases).toEqual(["ahmed"]);
    expect(run("aliasKeep", {}).aliases).toEqual(["ahmed ali"]);
    expect(run("aliasSwap", {}, withAlias).name).toBe("ahmed");
    expect(run("aliasClear", {}, withAlias).aliases).toEqual([]);
  });

  it("rewrites numbers", () => {
    expect(run("cc", { cc: "971", trunk: true }).phones[0]?.value).toBe("+971 501234567");
    expect(run("rmcc", { cc: "971", trunk: true }, run("cc", { cc: "971", trunk: true })).phones[0]?.value).toBe("0501234567");
    expect(run("prefix", { from: "050", to: "+97150" }).phones[0]?.value).toBe("+971501234567");
    expect(run("format", { style: "digits" }).phones[1]?.value).toBe("0501234567");
    expect(run("dedupe", {}).phones).toHaveLength(1);
    expect(run("format", { style: "spaced" }).phones[0]?.value).toBe("050 123 4567");
  });

  it("fills details", () => {
    expect(run("company", { val: "Acme", onlyEmpty: true }).company).toBe("Acme");
    expect(run("company", { val: "Acme", onlyEmpty: true }, { ...base, company: "X" }).company).toBe("X");
    expect(run("note", { val: "hi {first}" }, { ...base, note: "a" }).note).toBe("a\nhi ahmed");
    expect(differs(base, run("dedupe", {}))).toBe(true);
    const solo = { ...base, name: "solo" };
    expect(differs(solo, run("swap", {}, solo))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { ImportStaging } from "../../src/core/db/staging";
import { emptyParsed } from "../../src/core/types";
import type { ParsedContact } from "../../src/core/types";
import { contact, makeLibrary, phones } from "./helpers";

function parsed(p: Partial<ParsedContact>): ParsedContact {
  return { ...emptyParsed(), ...p };
}

async function setup(): Promise<ImportStaging> {
  const base = await makeLibrary("AE");
  const lib = new ImportStaging(base.db);
  lib.open();
  lib.saveContact(contact({ name: "Mona Said", phones: phones("0501112222"), company: "" }), "seed");
  lib.saveContact(contact({ name: "Omar", phones: phones("0503334444") }), "seed");
  lib.saveContact(contact({ name: "Omar", phones: phones("0505556666") }), "seed");
  return lib;
}

describe("import staging", () => {
  it("classifies, merges in-file duplicates and commits", async () => {
    const lib = await setup();
    lib.stageBegin();
    lib.stageInsert(0, [
      parsed({ name: "Mona S.", phones: ["+971 50 111 2222"], company: "Acme" }),
      parsed({ name: "New Person", phones: ["0509998888"] }),
      parsed({ name: "New Person", phones: ["050 999 8888"], emails: ["np@x.com"] }),
      parsed({ name: "Omar", phones: ["0507777000"] }),
      parsed({})
    ]);
    lib.stageClassify();
    const summary = lib.stageSummary();
    expect(summary.matches).toBe(1);
    expect(summary.conflicts).toBe(1);
    expect(summary.dupInFile).toBe(1);
    expect(summary.invalid).toBe(1);
    expect(summary.newContacts).toBe(1);
    const result = lib.stageCommit("update", "fillEmpty", "import");
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    const mona = lib.listPlain({ filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 50, requestId: 1 }).rows.find((r) => r.name === "Mona Said");
    expect(mona).toBeDefined();
    expect(lib.getContact(mona?.id ?? "")?.company).toBe("Acme");
    const added = lib.listPlain({ filter: { kind: "importBatch", batchId: result.batchId }, sort: "nameAsc", search: "", offset: 0, limit: 50, requestId: 2 });
    expect(added.total).toBe(1);
    expect(lib.getContact(added.rows[0]?.id ?? "")?.emails).toHaveLength(1);
    lib.undo(null);
    expect(lib.counts().all).toBe(3);
  });

  it("adds everything in add mode and honors exclusion", async () => {
    const lib = await setup();
    lib.stageBegin();
    lib.stageInsert(0, [parsed({ name: "A", phones: ["0501112222"] }), parsed({ name: "B", phones: ["0580000001"] })]);
    lib.stageClassify();
    const list = lib.stageList("new", 0, 10);
    lib.stageSetIncluded([list.rows[0]?.seq ?? 0], false);
    const matches = lib.stageList("match", 0, 10);
    expect(matches.rows[0]?.matchName).toBe("Mona Said");
    const result = lib.stageCommit("add", "fillEmpty", "import");
    expect(result.created).toBe(1);
  });
});

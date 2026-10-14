import { beforeEach, describe, expect, it } from "vitest";
import type { Library } from "../../src/core/db/library";
import { searchLibrary } from "../../src/core/db/search";
import { contact, makeLibrary, phones } from "./helpers";

let lib: Library;

beforeEach(async () => {
  lib = await makeLibrary("AE");
  const seed = [
    contact({ name: "Mohamed Ali", phones: phones("050 123 4567"), company: "Nile Corp", aliases: ["Moe"] }),
    contact({ name: "Muhammad Hassan", phones: phones("+971 55 765 4321") }),
    contact({ name: "أحمد محمود", phones: phones("٠٥٢ ٩٨٧ ٦٥٤٣"), emails: [{ value: "ahmed@nile.example", label: "work" }] }),
    contact({ name: "王小明", phones: phones("+86 138 0013 8000") }),
    contact({ name: "Sara Johnson", starred: true, groups: ["Work"] }),
    contact({ name: "" , phones: phones("0509990000") })
  ];
  for (const c of seed) lib.saveContact(c, "seed");
});

describe("library storage", () => {
  it("counts and lists", () => {
    const counts = lib.counts();
    expect(counts.all).toBe(6);
    expect(counts.starred).toBe(1);
    expect(counts.noNumber).toBe(1);
    expect(counts.noName).toBe(1);
    expect(counts.groups.map((g) => g.name)).toEqual(["Work"]);
    const page = lib.listPlain({ filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 50, requestId: 1 });
    expect(page.total).toBe(6);
    expect(page.rows[0]?.primaryPhone).toBeDefined();
  });

  it("round-trips a contact with its parts", () => {
    const saved = lib.saveContact(contact({ name: "Test", phones: phones("111 222 3333"), emails: [{ value: "T@x.com", label: "work" }], aliases: ["tt", "tt"], groups: ["A", "B"] }), "x");
    const read = lib.getContact(saved.contact.id);
    expect(read?.aliases).toEqual(["tt"]);
    expect(read?.groups).toEqual(["A", "B"]);
    expect(read?.phones[0]?.value).toBe("111 222 3333");
  });

  it("offers letter offsets in sort order", () => {
    const letters = lib.letterOffsets({ kind: "all" }, "nameAsc");
    expect(letters.reduce((sum, l) => sum + l.count, 0)).toBe(6);
    expect(letters[0]?.offset).toBe(0);
  });
});

describe("search", () => {
  const find = async (q: string): Promise<string[]> => {
    const outcome = await searchLibrary(lib, q, { kind: "all" }, null);
    const rows = lib.hydrate((outcome?.results ?? []).map((r) => r.rowid));
    return rows.map((r) => r.name);
  };

  it("finds by name substring and prefix", async () => {
    expect(await find("ohame")).toContain("Mohamed Ali");
    expect(await find("sara")).toEqual(["Sara Johnson"]);
  });

  it("matches multi-token queries in any order", async () => {
    expect(await find("ali mohamed")).toContain("Mohamed Ali");
  });

  it("finds by local, international and Arabic-Indic numbers", async () => {
    expect(await find("0501234")).toContain("Mohamed Ali");
    expect(await find("+971501234567")).toContain("Mohamed Ali");
    expect(await find("٠٥٢٩٨٧")).toContain("أحمد محمود");
    expect(await find("4567")).toContain("Mohamed Ali");
  });

  it("finds by alias, email and company", async () => {
    const outcome = await searchLibrary(lib, "moe", { kind: "all" }, null);
    expect(outcome?.results[0]?.tag).toBe("alias");
    expect(await find("ahmed@nile")).toContain("أحمد محمود");
    expect(await find("nile corp")).toContain("Mohamed Ali");
  });

  it("finds sounds-alike and close matches", async () => {
    expect(await find("mohammed")).toEqual(expect.arrayContaining(["Mohamed Ali", "Muhammad Hassan"]));
    expect(await find("jhonson")).toContain("Sara Johnson");
  });

  it("finds pinyin, initials and transliteration", async () => {
    expect(await find("wxm")).toContain("王小明");
    expect(await find("xiaoming")).toContain("王小明");
    expect(await find("ahmed")).toContain("أحمد محمود");
    expect(await find("احمد")).toContain("أحمد محمود");
  });

  it("restricts to the active filter", async () => {
    const outcome = await searchLibrary(lib, "sara", { kind: "noNumber" }, null);
    expect(outcome?.results.length).toBe(1);
    const none = await searchLibrary(lib, "mohamed", { kind: "starred" }, null);
    expect(none?.results.length).toBe(0);
  });
});

import { LibraryService } from "../../src/core/db/service";

describe("service mutations", () => {
  it("stars, groups, deletes and undoes", async () => {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    const a = svc.saveContact(contact({ name: "Ana", phones: phones("0501112222") }), "a").contact;
    const b = svc.saveContact(contact({ name: "Ana", phones: phones("+971 50 111 2222"), company: "X" }), "b").contact;
    const c = svc.saveContact(contact({ name: "Bob" }), "c").contact;
    await svc.setStarred({ kind: "ids", ids: [a.id, c.id] }, true, "star");
    expect(svc.counts().starred).toBe(2);
    svc.undo(null);
    expect(svc.counts().starred).toBe(0);
    const gid = svc.createGroup("Team") ?? 0;
    await svc.addToGroup({ kind: "filter", filter: { kind: "all" }, search: "" }, gid, "add");
    expect(svc.counts().groups[0]?.count).toBe(3);
    const dups = svc.duplicateGroups(10, 0);
    expect(dups.total).toBe(1);
    expect(dups.groups[0]?.reason).toBe("number");
    expect(dups.groups[0]?.keepId).toBe(b.id);
    svc.mergeGroup(b.id, [a.id], "merge");
    expect(svc.counts().all).toBe(2);
    svc.undo(null);
    expect(svc.counts().all).toBe(3);
    await svc.deleteContacts({ kind: "ids", ids: [c.id] }, "del");
    expect(svc.getContact(c.id)).toBeNull();
    svc.undo(null);
    expect(svc.getContact(c.id)?.name).toBe("Bob");
    svc.deleteGroup(gid);
    expect(svc.counts().groups).toHaveLength(0);
    svc.undo(null);
    expect(svc.counts().groups[0]?.count).toBe(3);
  });
});

describe("batch pipeline", () => {
  it("previews and applies an op with undo", async () => {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    for (const n of ["ann lee", "BOB ray", "Cy Dee"]) svc.saveContact(contact({ name: n }), "s");
    const sel = { kind: "filter", filter: { kind: "all" }, search: "" } as const;
    const preview = await svc.batchPreview(sel, "case", { mode: "title" }, 10);
    expect(preview.total).toBe(3);
    expect(preview.changed).toBe(2);
    const applied = await svc.batchApply(sel, "case", { mode: "title" }, "Case");
    expect(applied).toBe(2);
    expect(svc.listPlain({ filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 10, requestId: 1 }).rows.map((r) => r.name)).toEqual(["Ann Lee", "Bob Ray", "Cy Dee"]);
    svc.undo(null);
    expect(svc.listPlain({ filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 10, requestId: 2 }).rows.map((r) => r.name)).toEqual(["ann lee", "BOB ray", "Cy Dee"]);
  });
});

describe("select all matching with search", () => {
  it("acts on every match, not only the first page", async () => {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    svc.db.transaction(() => {
      for (let i = 0; i < 650; i++) svc.upsertInTransaction(contact({ name: `Zed Person ${i}` }), Date.now());
      svc.upsertInTransaction(contact({ name: "Other One" }), Date.now());
    });
    svc.touch();
    const page = await svc.list({ filter: { kind: "all" }, sort: "nameAsc", search: "zed", offset: 0, limit: 500, requestId: 1 });
    expect(page.rows).toHaveLength(500);
    const changed = await svc.setStarred({ kind: "filter", filter: { kind: "all" }, search: "zed" }, true, "star");
    expect(changed).toBe(650);
    expect(svc.counts().starred).toBe(650);
  });
});

describe("queue recipients", () => {
  it("resolves ids with numbers inside the database layer", async () => {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    svc.saveContact(contact({ name: "Has Number", phones: phones("0501112222") }), "a");
    svc.saveContact(contact({ name: "No Number" }), "b");
    const result = await svc.queueRecipients({ kind: "filter", filter: { kind: "all" }, search: "" }, 30);
    expect(result.ids).toHaveLength(1);
    expect(result.preview[0]?.name).toBe("Has Number");
  });
});

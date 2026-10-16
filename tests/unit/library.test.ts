import { beforeEach, describe, expect, it } from "vitest";
import { isStaleRequest } from "../../src/core/db/library";
import type { Library, Selection } from "../../src/core/db/library";
import { searchLibrary } from "../../src/core/db/search";
import type { ContactRow } from "../../src/core/types";
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
    const page = lib.listPlain({ channel: "library", filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 50, requestId: 1 });
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
    await svc.addToGroup({ kind: "filter", filter: { kind: "all" }, search: "", exclude: [] }, gid, "add");
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
    const sel: Selection = { kind: "filter", filter: { kind: "all" }, search: "", exclude: [] };
    const preview = await svc.batchPreview(sel, "case", { mode: "title" }, 10);
    expect(preview.total).toBe(3);
    expect(preview.changed).toBe(2);
    const applied = await svc.batchApply(sel, "case", { mode: "title" }, "Case");
    expect(applied.count).toBe(2);
    expect(svc.listPlain({ channel: "aux", filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 10, requestId: 1 }).rows.map((r) => r.name)).toEqual(["Ann Lee", "Bob Ray", "Cy Dee"]);
    svc.undo(null);
    expect(svc.listPlain({ channel: "aux", filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 10, requestId: 2 }).rows.map((r) => r.name)).toEqual(["ann lee", "BOB ray", "Cy Dee"]);
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
    const page = await svc.list({ channel: "library", filter: { kind: "all" }, sort: "nameAsc", search: "zed", offset: 0, limit: 500, requestId: 1 });
    expect(page.rows).toHaveLength(500);
    const changed = await svc.setStarred({ kind: "filter", filter: { kind: "all" }, search: "zed", exclude: [] }, true, "star");
    expect(changed.count).toBe(650);
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
    const result = await svc.queueRecipients({ kind: "filter", filter: { kind: "all" }, search: "", exclude: [] }, 30);
    expect(result.ids).toHaveLength(1);
    expect(result.preview[0]?.name).toBe("Has Number");
  });
});

describe("request channels", () => {
  it("isStaleRequest only compares ids within a channel and ignores aux", () => {
    const latest = new Map<"library" | "palette" | "aux", number>([["palette", 1e12], ["library", 5]]);
    expect(isStaleRequest(latest, "library", 2)).toBe(true);
    expect(isStaleRequest(latest, "library", 5)).toBe(false);
    expect(isStaleRequest(latest, "library", 6)).toBe(false);
    expect(isStaleRequest(latest, "palette", 1e12)).toBe(false);
    expect(isStaleRequest(latest, "aux", 0)).toBe(false);
  });

  async function seeded(): Promise<LibraryService> {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    for (let i = 0; i < 50; i++) svc.saveContact(contact({ name: `Joe Maria ${String(i).padStart(2, "0")}` }), "seed");
    return svc;
  }

  it("a palette request with a huge id does not cancel a later library search", async () => {
    const svc = await seeded();
    const query = { filter: { kind: "all" } as const, sort: "nameAsc" as const, search: "maria", offset: 0 };
    const palette = await svc.list({ ...query, limit: 8, channel: "palette", requestId: 1e12 });
    expect(palette.cancelled).toBe(false);
    expect(palette.rows.length).toBeGreaterThan(0);
    const library = await svc.list({ ...query, limit: 500, channel: "library", requestId: 2 });
    expect(library.cancelled).toBe(false);
    expect(library.rows.length).toBeGreaterThan(0);
  });

  it("a newer request on the same channel cancels an older one", async () => {
    const svc = await seeded();
    const query = { filter: { kind: "all" } as const, sort: "nameAsc" as const, search: "maria", offset: 0, limit: 500, channel: "library" as const };
    const older = svc.list({ ...query, requestId: 5 });
    const newer = svc.list({ ...query, requestId: 6 });
    const [a, b] = await Promise.all([older, newer]);
    expect(a.cancelled).toBe(true);
    expect(b.cancelled).toBe(false);
    expect(b.rows.length).toBeGreaterThan(0);
  });

  it("aux requests are never cancelled and never cancel others", async () => {
    const svc = await seeded();
    const base = { filter: { kind: "all" } as const, sort: "nameAsc" as const, offset: 0, limit: 50 };
    const library = svc.list({ ...base, search: "maria", channel: "library", requestId: 3 });
    const aux = await svc.list({ ...base, search: "", channel: "aux", requestId: 3.2 });
    const result = await library;
    expect(aux.cancelled).toBe(false);
    expect(result.cancelled).toBe(false);
  });
});

describe("countSelection", () => {
  it("equals the number of contacts the action then changes", async () => {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    for (let i = 0; i < 800; i++) {
      const name = i % 3 === 0 ? `Alan ${i}` : i % 3 === 1 ? `Bob ${i}` : `Carla ${i}`;
      svc.saveContact(contact({ name, starred: i < 300 }), "seed");
    }
    const selection = { kind: "filter" as const, filter: { kind: "starred" as const }, search: "a", exclude: [] };
    const starredBefore = (await svc.counts()).starred;
    expect(starredBefore).toBe(300);
    const counted = await svc.countSelection(selection);
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeLessThan(300);
    const deleted = await svc.deleteContacts(selection, "delete");
    expect(deleted.count).toBe(counted);
    expect((await svc.counts()).starred).toBe(starredBefore - counted);
  });
});

describe("selection with exclusions", () => {
  it("a filter selection skips excluded ids", async () => {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) ids.push(svc.saveContact(contact({ name: `Person ${String(i).padStart(2, "0")}` }), "seed").contact.id);
    const keep = [ids[3]!, ids[41]!];
    const selection = { kind: "filter" as const, filter: { kind: "all" as const }, search: "", exclude: keep };
    expect(await svc.countSelection(selection)).toBe(48);
    expect((await svc.deleteContacts(selection, "delete")).count).toBe(48);
    const rest = await svc.list({ channel: "aux", filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 50, requestId: 1 });
    expect(rest.rows.map((r) => r.id).sort()).toEqual([...keep].sort());
  });

  it("exclusions also apply to searched selections", async () => {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(svc.saveContact(contact({ name: `Maria ${i}` }), "seed").contact.id);
    const selection = { kind: "filter" as const, filter: { kind: "all" as const }, search: "maria", exclude: [ids[0]!] };
    expect(await svc.countSelection(selection)).toBe(9);
  });
});

describe("undo targets a specific history entry", () => {
  async function two(): Promise<{ svc: LibraryService; a: string; b: string }> {
    const base = await makeLibrary("AE");
    const svc = new LibraryService(base.db);
    svc.open();
    const a = svc.saveContact(contact({ name: "Aaa" }), "seed").contact.id;
    const b = svc.saveContact(contact({ name: "Bbb" }), "seed").contact.id;
    return { svc, a, b };
  }

  it("undoing the older star leaves the newer one and its history entry", async () => {
    const { svc, a, b } = await two();
    const h1 = await svc.setStarred({ kind: "ids", ids: [a] }, true, "star");
    const h2 = await svc.setStarred({ kind: "ids", ids: [b] }, true, "star");
    expect(h1.count).toBe(1);
    expect(h1.historyId).toBeTruthy();
    expect(h2.historyId).toBeTruthy();
    expect(h1.historyId).not.toBe(h2.historyId);
    svc.undo(h1.historyId);
    expect(svc.getContact(a)?.starred).toBe(false);
    expect(svc.getContact(b)?.starred).toBe(true);
    expect(svc.listHistory(50, 0).entries.map((e) => e.id)).toContain(h2.historyId);
  });

  it("undoing a star restores the previous edited time", async () => {
    const { svc, a } = await two();
    const before = svc.getContact(a)?.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const h = await svc.setStarred({ kind: "ids", ids: [a] }, true, "star");
    expect(svc.getContact(a)?.updatedAt).not.toBe(before);
    svc.undo(h.historyId);
    expect(svc.getContact(a)?.updatedAt).toBe(before);
  });

  it("returns a null history id when nothing changed", async () => {
    const { svc } = await two();
    const result = await svc.setStarred({ kind: "ids", ids: ["missing"] }, true, "star");
    expect(result).toEqual({ count: 0, historyId: null });
  });

  it("reads the old two-element star payload", async () => {
    const { svc, a } = await two();
    const h = await svc.setStarred({ kind: "ids", ids: [a] }, true, "star");
    svc.db.exec({ sql: "UPDATE history SET payload=? WHERE id=?", bind: [new TextEncoder().encode(JSON.stringify({ type: "star", before: [], created: [], star: [[a, 0]] })), h.historyId] });
    svc.undo(h.historyId);
    expect(svc.getContact(a)?.starred).toBe(false);
  });
});

describe("letter offsets match row order", () => {
  for (const sort of ["nameAsc", "nameDesc"] as const) {
    it(`for ${sort}`, async () => {
      const base = await makeLibrary("AE");
      const svc = new LibraryService(base.db);
      svc.open();
      const names = ["Émile", "Łukasz", "Zoe", "Zed", "Abe", "Ann", "محمد علي", "أحمد", "فاطمة", "9 Lives", "007 Bond", "😀 Smile", "🍕 Pizza", "Ömer", "Éclair", "Eve", "ñandú", "Nora", "Yusuf", "Ibrahim"];
      for (let i = 0; i < 300; i++) {
        const name = i % 17 === 0 ? "" : `${names[i % names.length]!} ${i}`;
        svc.saveContact(contact({ name, phones: phones(`05${String(10000000 + i)}`) }), "seed");
      }
      const total = svc.counts().all;
      const rows: ContactRow[] = [];
      for (let offset = 0; offset < total; offset += 100) {
        rows.push(...svc.listPlain({ channel: "aux", filter: { kind: "all" }, sort, search: "", offset, limit: 100, requestId: 1 }).rows);
      }
      const entries = svc.letterOffsets({ kind: "all" }, sort);
      expect(rows.length).toBe(total);
      expect(entries.reduce((sum, e) => sum + e.count, 0)).toBe(total);
      for (const entry of entries) {
        expect(rows[entry.offset]!.firstLetter).toBe(entry.letter);
        expect(rows[entry.offset + entry.count - 1]!.firstLetter).toBe(entry.letter);
      }
      expect(entries.map((e) => e.letter)).toEqual(rows.filter((r, i) => i === 0 || rows[i - 1]!.firstLetter !== r.firstLetter).map((r) => r.firstLetter));
    });
  }
});

import { FIXTURE_ROWS, buildFixtures } from "../core/fixtures";
import { fold, tokens } from "../core/fold";
import { autoMapColumns, createRowParser, DEFAULT_SEPARATORS } from "../core/formats/mapping";
import { previewBlob, readRowBatches } from "../core/formats/reader";
import { parseVCards, vcardOf } from "../core/formats/vcard";
import { messageUrl, toE164 } from "../core/messaging";
import { phoneticKey } from "../core/phonetic";
import { arabicToLatin } from "../core/translit";
import type { ImportStaging } from "../core/db/staging";
import type { Selection } from "../core/db/library";
import type { ContactRow } from "../core/types";
import { emptyContactInput, emptyParsed } from "../core/types";
import type { SelfTestCase, SelfTestContext } from "./types";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

const everything: Selection = { kind: "filter", filter: { kind: "all" }, search: "", exclude: [] };

let requestCounter = 0;

function page(lib: ImportStaging, search: string, limit = 50, sort: "nameAsc" | "nameDesc" = "nameAsc"): ContactRow[] {
  requestCounter += 1;
  return lib.listPlain({ channel: "aux", filter: { kind: "all" }, sort, search, offset: 0, limit, requestId: requestCounter }).rows;
}

async function searchRows(lib: ImportStaging, search: string): Promise<ContactRow[]> {
  requestCounter += 1;
  const result = await lib.list({ channel: "aux", filter: { kind: "all" }, sort: "nameAsc", search, offset: 0, limit: 50, requestId: requestCounter });
  return result.rows;
}

function add(lib: ImportStaging, name: string, extra: Partial<ReturnType<typeof emptyContactInput>> = {}): string {
  return lib.saveContact({ ...emptyContactInput(), name, ...extra }, "selftest").contact.id;
}

async function importBlob(lib: ImportStaging, blob: Blob, name: string): Promise<number> {
  const preview = await previewBlob(blob, name, {});
  if (!preview.ok) throw new Error(preview.reason);
  const parser = createRowParser(autoMapColumns(preview.header, preview.bodyRows), DEFAULT_SEPARATORS);
  lib.stageBegin();
  let rows = 0;
  for await (const batch of readRowBatches(blob, preview.used, () => false, () => undefined)) {
    rows += batch.length;
    lib.stageInsert(0, batch.map((r) => parser.parse(r) ?? emptyParsed()));
  }
  lib.stageClassify();
  lib.stageCommit("add", "fillEmpty", "selftest");
  return rows;
}

const textCases: SelfTestCase[] = [
  { id: "fold removes accents", group: "text", run: async () => equal(fold("Léa"), fold("Lea"), "fold") },
  {
    id: "tokens split on spaces and punctuation",
    group: "text",
    run: async () => {
      const parts = tokens("Smith, John-Paul");
      check(parts.length === 3, `expected 3 tokens, got ${parts.length}`);
    }
  },
  { id: "phonetic key matches spelling variants", group: "text", run: async () => equal(phoneticKey("Smith"), phoneticKey("Smyth"), "phonetic key") },
  {
    id: "Arabic transliteration yields a Latin skeleton",
    group: "text",
    run: async () => {
      const latin = arabicToLatin("محمد").toLowerCase();
      check(/^[a-z]+$/.test(latin) && latin.includes("m"), `got "${latin}"`);
    }
  }
];

const phoneCases: SelfTestCase[] = [
  { id: "national number uses the default country", group: "phone", run: async () => equal(toE164("(415) 555-0123", "US"), "+14155550123", "e164") },
  { id: "00 prefix becomes international", group: "phone", run: async () => equal(toE164("00961 3 123 456", "US"), "+9613123456", "e164") },
  { id: "Arabic-Indic digits are read", group: "phone", run: async () => check(toE164("٠٩١٢٣٤٥٦٧٨", "SY")?.startsWith("+963") === true, "expected a +963 number") },
  { id: "explicit country code wins", group: "phone", run: async () => equal(toE164("+55 11 91234 5678", "US"), "+5511912345678", "e164") },
  { id: "text and empty input are rejected", group: "phone", run: async () => check(toE164("hello", "US") === null && toE164("", "US") === null, "expected null") },
  {
    id: "message links are valid",
    group: "phone",
    run: async () => {
      equal(messageUrl("whatsapp", "+961 3 123 456", "US"), "https://wa.me/9613123456", "whatsapp");
      equal(messageUrl("whatsapp", "+961 3 123 456", "US", "hi there"), "https://wa.me/9613123456?text=hi%20there", "whatsapp text");
      equal(messageUrl("signal", "+961 3 123 456", "US", "hi"), "https://signal.me/#p/+9613123456", "signal");
      equal(messageUrl("sms", "+961 3 123 456", "US", "hi"), "sms:+9613123456?&body=hi", "sms");
      equal(messageUrl("tel", "+961 3 123 456", "US"), "tel:+9613123456", "tel");
      equal(messageUrl("whatsapp", "12", "US"), null, "invalid");
    }
  }
];

const formatCases: SelfTestCase[] = [
  ...Object.keys(FIXTURE_ROWS).map<SelfTestCase>((name) => ({
    id: `reads ${name}`,
    group: "formats",
    run: async (ctx: SelfTestContext) => {
      const file = buildFixtures(100).find((f) => f.name === name);
      check(file !== undefined, "fixture missing");
      const rows = await importBlob(ctx.newLibrary(), new Blob([file!.bytes as BlobPart]), name);
      equal(rows, FIXTURE_ROWS[name]!, "rows");
    }
  })),
  {
    id: "a .csv that is really Excel is read as Excel",
    group: "formats",
    run: async () => {
      const file = buildFixtures(100).find((f) => f.name === "template-misnamed.csv")!;
      const preview = await previewBlob(new Blob([file.bytes as BlobPart]), file.name, {});
      check(preview.ok && preview.used.format === "xlsx", "expected xlsx");
    }
  },
  {
    id: "windows-1256 text decodes to Arabic",
    group: "formats",
    run: async (ctx) => {
      const file = buildFixtures(100).find((f) => f.name === "contacts-ar-1256.csv")!;
      const lib = ctx.newLibrary();
      await importBlob(lib, new Blob([file.bytes as BlobPart]), file.name);
      check(page(lib, "").some((r) => r.name === "محمد علي"), "expected the Arabic name");
    }
  },
  {
    id: "large generated csv imports completely",
    group: "formats",
    run: async (ctx) => {
      const file = buildFixtures(100).find((f) => f.name === "large.csv")!;
      const lib = ctx.newLibrary();
      equal(await importBlob(lib, new Blob([file.bytes as BlobPart]), file.name), 100, "rows");
      equal(lib.counts().all, 100, "contacts");
    }
  },
  {
    id: "vCard round trip keeps name, phones and emails",
    group: "formats",
    run: async () => {
      const text = vcardOf(
        { id: "x", name: "Sara Lee", company: "", note: "", phones: ["+1 415 555 0123", "+971 55 765 4321"], emails: ["sara@example.com"], aliases: [], groups: [] },
        { everyNumber: true, emails: true, company: false, notes: false, aliases: false, groups: false, contactId: false, mapPhone: (v) => v }
      );
      const parsed = parseVCards(text)[0];
      check(parsed !== undefined, "no card parsed");
      equal(parsed!.name, "Sara Lee", "name");
      equal(parsed!.phones.length, 2, "phones");
      equal(parsed!.emails[0], "sara@example.com", "email");
    }
  }
];

const databaseCases: SelfTestCase[] = [
  {
    id: "create then find by name, number and alias",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      add(lib, "Amelia Hart", { phones: [{ value: "+44 7700 900461", label: "" }], aliases: ["Mimi"] });
      for (const query of ["Amelia", "7700 900461", "Mimi"]) check((await searchRows(lib, query)).some((r) => r.name === "Amelia Hart"), `not found by "${query}"`);
    }
  },
  {
    id: "star then undo by history id",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      const a = add(lib, "Aaa");
      const b = add(lib, "Bbb");
      const first = await lib.setStarred({ kind: "ids", ids: [a] }, true, "star");
      await lib.setStarred({ kind: "ids", ids: [b] }, true, "star");
      lib.undo(first.historyId);
      equal(lib.getContact(a)?.starred, false, "a starred");
      equal(lib.getContact(b)?.starred, true, "b starred");
    }
  },
  {
    id: "delete then undo restores the contact",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      const id = add(lib, "Gone Soon");
      const result = await lib.deleteContacts({ kind: "ids", ids: [id] }, "delete");
      equal(lib.counts().all, 0, "after delete");
      lib.undo(result.historyId);
      equal(lib.counts().all, 1, "after undo");
    }
  },
  {
    id: "merging two contacts keeps both numbers",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      const a = add(lib, "Sam Roe", { phones: [{ value: "+1 415 555 0101", label: "" }] });
      const b = add(lib, "Sam Roe", { phones: [{ value: "+1 415 555 0102", label: "" }] });
      const merged = lib.mergeGroup(a, [a, b], "merge");
      equal(merged.contact?.phones.length, 2, "phones");
      equal(lib.counts().all, 1, "contacts");
    }
  },
  {
    id: "batch preview and apply agree",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      for (const n of ["ann lee", "BOB ray", "Cy Dee"]) add(lib, n);
      const preview = await lib.batchPreview(everything, "case", { mode: "title" }, 10);
      equal(preview.changed, 2, "preview");
      equal((await lib.batchApply(everything, "case", { mode: "title" }, "Case")).count, 2, "applied");
    }
  },
  {
    id: "selection count honours exclusions",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      const ids = Array.from({ length: 10 }, (_, i) => add(lib, `Person ${i}`));
      equal(await lib.countSelection({ ...everything, exclude: [ids[0]!, ids[1]!] }), 8, "count");
      equal((await lib.deleteContacts({ ...everything, exclude: [ids[0]!, ids[1]!] }, "delete")).count, 8, "deleted");
    }
  },
  {
    id: "letter offsets match row order",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      const names = ["Émile", "Łukasz", "Zoe", "Abe", "محمد", "9 Lives", "😀 Smile", "Eve"];
      for (let i = 0; i < 80; i++) add(lib, `${names[i % names.length]!} ${i}`);
      for (const sort of ["nameAsc", "nameDesc"] as const) {
        const rows = page(lib, "", 200, sort);
        const entries = lib.letterOffsets({ kind: "all" }, sort);
        equal(entries.reduce((sum, e) => sum + e.count, 0), rows.length, `${sort} total`);
        for (const entry of entries) {
          equal(rows[entry.offset]?.firstLetter, entry.letter, `${sort} first of ${entry.letter}`);
          equal(rows[entry.offset + entry.count - 1]?.firstLetter, entry.letter, `${sort} last of ${entry.letter}`);
        }
      }
    }
  },
  {
    id: "an import commit adds its rows",
    group: "database",
    run: async (ctx) => {
      const lib = ctx.newLibrary();
      const file = buildFixtures(100).find((f) => f.name === "template.csv")!;
      await importBlob(lib, new Blob([file.bytes as BlobPart]), file.name);
      equal(lib.counts().all, 3, "contacts");
    }
  }
];

function slow(label: string, limitMs: number, work: () => Promise<void> | void): (ctx: SelfTestContext) => Promise<string | void> {
  return async () => {
    const start = performance.now();
    await work();
    const ms = Math.round(performance.now() - start);
    return ms > limitMs ? `warn:${label} took ${ms} ms (limit ${limitMs} ms)` : `${label} took ${ms} ms`;
  };
}

const performanceCases: SelfTestCase[] = (() => {
  let seeded: ImportStaging | null = null;
  const seed = (ctx: SelfTestContext): ImportStaging => {
    if (seeded) return seeded;
    const lib = ctx.newLibrary();
    const now = Date.now();
    lib.db.transaction(() => {
      for (let i = 0; i < 20000; i++) lib.upsertInTransaction({ ...emptyContactInput(), name: `${["Mario", "Maria", "Marco", "Nora", "Omar", "Sara"][i % 6]!} ${["Hart", "Kim", "Lee", "Roe"][i % 4]!} ${i}`, phones: [{ value: `+1 415 ${String(1000000 + i)}`, label: "" }] }, now);
    });
    lib.touch();
    seeded = lib;
    return lib;
  };
  return [
    { id: "seeds 20,000 contacts", group: "performance", run: async (ctx) => { seed(ctx); } },
    { id: "plain list page", group: "performance", run: async (ctx) => slow("page 0", 50, () => void page(seed(ctx), "", 50))(ctx) },
    { id: "name search", group: "performance", run: async (ctx) => slow("search \"mar\"", 150, async () => void (await searchRows(seed(ctx), "mar")))(ctx) },
    { id: "number search", group: "performance", run: async (ctx) => slow("search \"4151000500\"", 150, async () => void (await searchRows(seed(ctx), "4151000500")))(ctx) }
  ];
})();

export const workerCases: SelfTestCase[] = [...textCases, ...phoneCases, ...formatCases, ...databaseCases, ...performanceCases];

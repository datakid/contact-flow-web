import { describe, expect, it } from "vitest";
import { ImportStaging } from "../../src/core/db/staging";
import { autoMapColumns, createRowParser, DEFAULT_SEPARATORS } from "../../src/core/formats/mapping";
import { previewBlob, readRowBatches } from "../../src/core/formats/reader";
import { templateCsv, templateVcf, templateXlsx } from "../../src/core/formats/templates";
import { XLSX } from "../../src/vendor/xlsx";
import { emptyParsed } from "../../src/core/types";
import { makeLibrary } from "./helpers";

function encodeWindows1256(text: string): Uint8Array<ArrayBuffer> {
  const decoder = new TextDecoder("windows-1256");
  const reverse = new Map<string, number>();
  for (let byte = 0; byte < 256; byte++) reverse.set(decoder.decode(new Uint8Array([byte])), byte);
  return new Uint8Array([...text].map((ch) => reverse.get(ch) ?? 0x3f));
}

async function importBlob(blob: Blob, name: string, sheet?: string): Promise<{ lib: ImportStaging; rows: number }> {
  const base = await makeLibrary("AE");
  const lib = new ImportStaging(base.db);
  lib.open();
  const preview = await previewBlob(blob, name, sheet ? { sheet } : {});
  if (!preview.ok) throw new Error(preview.reason);
  const columns = autoMapColumns(preview.header, preview.bodyRows);
  const parser = createRowParser(columns, DEFAULT_SEPARATORS);
  lib.stageBegin();
  let rows = 0;
  for await (const batch of readRowBatches(blob, preview.used, () => false, () => undefined)) {
    rows += batch.length;
    lib.stageInsert(0, batch.map((r) => parser.parse(r) ?? emptyParsed()));
  }
  lib.stageClassify();
  lib.stageCommit("add", "fillEmpty", "import");
  return { lib, rows };
}

const names = (lib: ImportStaging): string[] => lib.listPlain({ filter: { kind: "all" }, sort: "nameAsc", search: "", offset: 0, limit: 50, requestId: 1 }).rows.map((r) => r.name);

describe("full import pipeline", () => {
  it("imports csv, vcard and xlsx templates identically", async () => {
    const csv = await importBlob(new Blob([templateCsv()]), "t.csv");
    const vcf = await importBlob(new Blob([templateVcf()]), "t.vcf");
    const xlsx = await importBlob(new Blob([templateXlsx()]), "t.xlsx");
    for (const r of [csv, vcf, xlsx]) {
      expect(names(r.lib)).toEqual(expect.arrayContaining(["Sarah Johnson", "أحمد محمود", "王小明"]));
      expect(r.lib.counts().all).toBe(3);
    }
    const sarah = csv.lib.listPlain({ filter: { kind: "all" }, sort: "nameAsc", search: "sarah", offset: 0, limit: 5, requestId: 2 }).rows[0];
    const full = csv.lib.getContact(sarah?.id ?? "");
    expect(full?.phones).toHaveLength(2);
    expect(full?.phones[0]?.value).toBe("+1 415 555 0123");
    expect(full?.groups).toEqual(["Friends", "Work"]);
  });

  it("detects and decodes windows-1256 csv", async () => {
    const text = ["الاسم,الهاتف", "محمد علي,0501112222", "فاطمة الزهراء,0503334444"].join("\r\n");
    const { lib } = await importBlob(new Blob([encodeWindows1256(text)]), "ar.csv");
    expect(names(lib)).toEqual(expect.arrayContaining(["محمد علي", "فاطمة الزهراء"]));
  });

  it("reads every sheet of a multi-sheet workbook", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["name", "phone"], ["A One", "0501110001"]]), "People");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Full Name", "Mobile"], ["B Two", "0502220001"]]), "Vendors");
    const blob = new Blob([new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }))]);
    const preview = await previewBlob(blob, "m.xlsx");
    expect(preview.ok && preview.sheets).toEqual(["People", "Vendors"]);
    const second = await importBlob(blob, "m.xlsx", "Vendors");
    expect(names(second.lib)).toEqual(["B Two"]);
  });

  it("imports 20,000 rows in batches without error", async () => {
    const lines = ["name,phones,company"];
    for (let i = 0; i < 20000; i++) lines.push(`Person ${i},05${String(10000000 + i * 3).slice(0, 8)},Company ${i % 50}`);
    const { lib, rows } = await importBlob(new Blob([lines.join("\n")]), "big.csv");
    expect(rows).toBe(20000);
    expect(lib.counts().all).toBe(20000);
  }, 60000);
});

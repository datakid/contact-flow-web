import { describe, expect, it } from "vitest";
import { columnsFor, csvChunk, csvHeader, DEFAULT_EXPORT_OPTIONS, excelBytes, jsonObject, measureWidths, vcardChunk } from "../../src/core/formats/serialize";
import { parseVCards } from "../../src/core/formats/vcard";
import { XLSX } from "../../src/vendor/xlsx";
import type { Contact } from "../../src/core/types";

const sample: Contact[] = [
  { id: "c_1", name: "Ana, B", company: "X", note: "n", starred: false, phones: [{ value: "+971 50 111 2222", label: "mobile" }, { value: "055 333 4444", label: "work" }], emails: [{ value: "a@x.com", label: "work" }], aliases: ["A"], groups: ["G"], importBatch: null, createdAt: 1, updatedAt: 1 }
];

describe("serialize", () => {
  it("builds csv with one column per number", () => {
    const columns = columnsFor(DEFAULT_EXPORT_OPTIONS, measureWidths(sample, { phones: 1, emails: 1 }));
    expect(csvHeader(columns)).toContain("Phone 2");
    expect(csvChunk(sample, columns)).toContain('"Ana, B"');
  });

  it("styles numbers", () => {
    const columns = columnsFor({ ...DEFAULT_EXPORT_OPTIONS, numberStyle: "digits" }, { phones: 2, emails: 1 });
    expect(csvChunk(sample, columns)).toContain("971501112222");
  });

  it("round-trips vcards", () => {
    const parsed = parseVCards(vcardChunk(sample, DEFAULT_EXPORT_OPTIONS));
    expect(parsed[0]?.phones).toHaveLength(2);
    expect(parsed[0]?.groups).toEqual(["G"]);
  });

  it("limits to the first number when asked", () => {
    expect(jsonObject(sample[0] as Contact, { ...DEFAULT_EXPORT_OPTIONS, everyNumber: false }).phones).toHaveLength(1);
  });

  it("writes xlsx", () => {
    const book = XLSX.read(excelBytes(sample, DEFAULT_EXPORT_OPTIONS), { type: "array" });
    expect(book.SheetNames).toEqual(["Contacts"]);
  });
});

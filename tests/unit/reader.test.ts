import { describe, expect, it } from "vitest";
import { previewBlob, readRowBatches } from "../../src/core/formats/reader";
import { templateCsv, templateVcf, templateXlsx } from "../../src/core/formats/templates";
import { autoMapColumns, createRowParser, DEFAULT_SEPARATORS } from "../../src/core/formats/mapping";

const blobOf = (text: string): Blob => new Blob([new TextEncoder().encode(text)]);

async function collect(blob: Blob, options: Parameters<typeof readRowBatches>[1]): Promise<string[][]> {
  const rows: string[][] = [];
  for await (const batch of readRowBatches(blob, options, () => false, () => undefined)) rows.push(...batch);
  return rows;
}

describe("preview", () => {
  it("previews the csv template with header detection", async () => {
    const result = await previewBlob(blobOf(templateCsv()), "t.csv");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.used.headerRow).toBe(1);
      expect(result.header?.[1]).toBe("name");
      expect(result.bodyRows).toHaveLength(3);
    }
  });

  it("warns when the extension disagrees with the content", async () => {
    const result = await previewBlob(new Blob([templateXlsx()]), "contacts.csv");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.used.format).toBe("xlsx");
      expect(result.notice).toContain("looks like Excel");
      expect(result.sheets).toEqual(["Contacts"]);
    }
  });

  it("allows a manual format override and reports failures", async () => {
    const bad = await previewBlob(blobOf("   \n\n"), "x.csv");
    expect(bad.ok).toBe(false);
    const forced = await previewBlob(blobOf("a;b\n1;2\n"), "x.txt", { format: "csv", delimiter: ";" });
    expect(forced.ok).toBe(true);
  });

  it("flattens vcard and json to canonical columns", async () => {
    const v = await previewBlob(blobOf(templateVcf()), "t.vcf");
    expect(v.ok && v.header?.[1]).toBe("name");
    expect(v.ok && v.bodyRows).toHaveLength(3);
    const j = await previewBlob(blobOf(JSON.stringify({ contacts: [{ name: "A", phones: ["123456"] }] })), "t.json");
    expect(j.ok && j.bodyRows[0]?.[1]).toBe("A");
  });
});

describe("streaming", () => {
  it("handles quoted newlines across chunk boundaries", async () => {
    const lines = ["name,phone,note"];
    for (let i = 0; i < 20000; i++) lines.push(`Person ${i},050${String(i).padStart(7, "0")},"line one\nline two, with comma"`);
    const blob = blobOf(lines.join("\n"));
    const rows = await collect(blob, { format: "csv", encoding: "utf-8", delimiter: ",", sheet: "", headerRow: 1 });
    expect(rows).toHaveLength(20000);
    expect(rows[19999]?.[2]).toBe("line one\nline two, with comma");
  });

  it("streams vcard, json and xlsx into mappable rows", async () => {
    const parserFor = (header: string[], rows: string[][]) => createRowParser(autoMapColumns(header, rows), DEFAULT_SEPARATORS);
    const v = await collect(blobOf(templateVcf()), { format: "vcard", encoding: "utf-8", delimiter: ",", sheet: "", headerRow: 1 });
    expect(v).toHaveLength(3);
    const parsed = parserFor(["contact_id", "name", "phones", "emails", "company", "aliases", "groups", "note"], v).parse(v[1] ?? []);
    expect(parsed?.phones).toHaveLength(2);
    const j = await collect(blobOf(JSON.stringify([{ name: "A", phones: ["123456"] }, { name: "B", emails: ["b@x.co"] }])), { format: "json", encoding: "utf-8", delimiter: ",", sheet: "", headerRow: 1 });
    expect(j).toHaveLength(2);
    const x = await collect(new Blob([templateXlsx()]), { format: "xlsx", encoding: "utf-8", delimiter: ",", sheet: "Contacts", headerRow: 1 });
    expect(x).toHaveLength(3);
  });

  it("honors cancellation", async () => {
    let stop = false;
    const rows: string[][] = [];
    const lines = ["name,phone", ...Array.from({ length: 30000 }, (_, i) => `P${i},0500000${i}`)];
    for await (const batch of readRowBatches(blobOf(lines.join("\n")), { format: "csv", encoding: "utf-8", delimiter: ",", sheet: "", headerRow: 1 }, () => stop, () => undefined)) {
      rows.push(...batch);
      stop = true;
    }
    expect(rows.length).toBeLessThan(30000);
  });
});

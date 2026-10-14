import { describe, expect, it } from "vitest";
import { sniffBytes, scoreDelimiters, detectEncoding, decodeBytes } from "../../src/core/formats/sniff";
import { parseVCards } from "../../src/core/formats/vcard";
import { autoMapColumns, createRowParser, detectHasHeader, DEFAULT_SEPARATORS, isMappingValid } from "../../src/core/formats/mapping";
import { templateCsv, templateVcf, templateXlsx, TEMPLATE_ROWS } from "../../src/core/formats/templates";
import { jsonObjectToRecord, textLineToRecord } from "../../src/core/formats/table";
import { XLSX } from "../../src/vendor/xlsx";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("sniff", () => {
  it("detects xlsx by magic bytes regardless of name", () => {
    const bytes = templateXlsx();
    const result = sniffBytes(bytes, "contacts.csv");
    expect(result.format).toBe("xlsx");
    expect(result.mismatch).toBe(true);
  });

  it("detects vcard, json and csv", () => {
    expect(sniffBytes(enc("BEGIN:VCARD\nFN:A\nEND:VCARD"), "a.txt").format).toBe("vcard");
    expect(sniffBytes(enc('\ufeff  [{"name":"A"}]'), "a.txt").format).toBe("json");
    const csv = sniffBytes(enc("name;phone\nA;123456\nB;654321\n"), "a.csv");
    expect(csv.format).toBe("csv");
    expect(csv.delimiter).toBe(";");
  });

  it("falls back to txt", () => {
    expect(sniffBytes(enc("just some words\nanother line\n"), "a.csv").format).toBe("txt");
  });

  it("scores tab delimiters", () => {
    expect(scoreDelimiters("a\tb\tc\n1\t2\t3\n")[0]?.delimiter).toBe("\t");
  });

  it("detects windows-1256 when utf-8 is invalid", () => {
    const bytes = new Uint8Array([0xc7, 0xe1, 0xc7, 0xdd, 0xdf, 0xc7, 0xd1, 0x20, 0xc7, 0xe1, 0xe3, 0xca, 0xca, 0xc7, 0xcd, 0xc9]);
    const encoding = detectEncoding(bytes);
    expect(["windows-1256", "windows-1252"]).toContain(encoding);
    expect(decodeBytes(bytes, "windows-1256")).toContain("ا");
  });
});

describe("vcard", () => {
  it("parses quoted-printable names and structured N", () => {
    const text = "BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D9=85=D8=AD=D9=85=D8=AF;;;;\r\nTEL;CELL:+20 100 123 4567\r\nEND:VCARD\r\n";
    const cards = parseVCards(text);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.name).toBe("محمد");
    expect(cards[0]?.phones).toEqual(["+20 100 123 4567"]);
  });

  it("parses the template", () => {
    const cards = parseVCards(templateVcf());
    expect(cards).toHaveLength(3);
    expect(cards[1]?.phones).toHaveLength(2);
    expect(cards[2]?.groups).toEqual(["工作"]);
  });
});

describe("mapping", () => {
  it("maps the template headers with high confidence", () => {
    const header = ["contact_id", "name", "first_name", "last_name", "phones", "emails", "company", "groups", "aliases", "note"];
    const columns = autoMapColumns(header, TEMPLATE_ROWS);
    expect(columns.map((c) => c.target)).toEqual(["id", "name", "first", "last", "phone", "email", "company", "group", "alias", "note"]);
    expect(columns.every((c) => c.confidence === "high")).toBe(true);
    expect(isMappingValid(columns)).toBe(true);
  });

  it("detects columns by content without a header", () => {
    const rows = [["Ali", "0501234567", "ali@x.com"], ["Sara", "0507654321", "sara@x.com"]];
    expect(detectHasHeader(rows)).toBe(false);
    expect(autoMapColumns(null, rows).map((c) => c.target)).toEqual(["name", "phone", "email"]);
  });

  it("splits multi-value cells", () => {
    const columns = autoMapColumns(["name", "phones", "groups"], [["A", "100200300; 400500600", "x, y"]]);
    const parser = createRowParser(columns, DEFAULT_SEPARATORS);
    const parsed = parser.parse(["A", "100200300; 400500600", "x, y"]);
    expect(parsed?.phones).toEqual(["100200300", "400500600"]);
    expect(parsed?.groups).toEqual(["x", "y"]);
  });

  it("drops empty rows and builds names from parts", () => {
    const columns = autoMapColumns(["first name", "last name", "phone"], [["A", "B", "123456"]]);
    const parser = createRowParser(columns, DEFAULT_SEPARATORS);
    expect(parser.parse(["A", "B", "123456"])?.name).toBe("A B");
    expect(parser.parse(["", "", ""])).toBeNull();
  });
});

describe("flatteners", () => {
  it("reads json objects and text lines", () => {
    expect(jsonObjectToRecord({ name: { first: "A", last: "B" }, phones: [{ number: "123456" }] })?.name).toBe("A B");
    expect(textLineToRecord("Ali Hassan 0501234567")?.phones).toEqual(["0501234567"]);
    expect(textLineToRecord("no digits here")).toBeNull();
  });
});

describe("templates and vendored xlsx", () => {
  it("round-trips the xlsx template", () => {
    const book = XLSX.read(templateXlsx(), { type: "array" });
    const name = book.SheetNames[0] ?? "";
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: false, defval: "" });
    expect(rows).toHaveLength(4);
    expect(rows[3]?.[1]).toBe("王小明");
  });

  it("emits a csv template with a BOM", () => {
    expect(templateCsv().startsWith("\ufeff")).toBe(true);
  });
});

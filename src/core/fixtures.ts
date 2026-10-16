import { XLSX } from "../vendor/xlsx";
import { TEMPLATE_HEADERS, TEMPLATE_ROWS, templateCsv, templateVcf, templateXlsx } from "./formats/templates";

export interface FixtureFile {
  name: string;
  bytes: Uint8Array;
}

export const DEFAULT_LARGE_ROWS = 100000;

export const FIXTURE_ROWS: Record<string, number> = {
  "template.csv": 3,
  "template.vcf": 3,
  "template.xlsx": 3,
  "template-misnamed.csv": 3,
  "contacts-ar-1256.csv": 3,
  "contacts.tsv": 3,
  "contacts.json": 3,
  "contacts-v21.vcf": 2
};

const encoder = new TextEncoder();

function encodeWindows1256(text: string): Uint8Array {
  const decoder = new TextDecoder("windows-1256");
  const reverse = new Map<string, number>();
  for (let byte = 0; byte < 256; byte++) reverse.set(decoder.decode(new Uint8Array([byte])), byte);
  const bytes: number[] = [];
  for (const ch of text) bytes.push(reverse.get(ch) ?? 0x3f);
  return new Uint8Array(bytes);
}

const arabicRows = [
  ["محمد علي", "+20 100 111 2222", "mohamed@example.com", "شركة النيل"],
  ["فاطمة الزهراء", "+971 55 765 4321", "", ""],
  ["أحمد الخطيب", "٠١٠٠٣٣٣٤٤٤٤", "ahmed@example.com", "مكتب الخطيب"]
];

function text(value: string): Uint8Array {
  return encoder.encode(value);
}

function multisheetXlsx(): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["name", "phone"], ["Sheet One A", "0501110001"], ["Sheet One B", "0501110002"]]), "People");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Full Name", "Mobile", "Email"], ["Sheet Two A", "0502220001", "a@x.com"]]), "Vendors");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}

function largeCsv(rows: number): string {
  const lines = ["name,phones,emails,company,groups"];
  for (let i = 0; i < rows; i++) lines.push(`Person ${i},05${String(10000000 + i * 3).slice(0, 8)}${i % 4 === 0 ? `;05${String(20000000 + i).slice(0, 8)}` : ""},person${i}@example.com,Company ${i % 300},Group ${i % 7}`);
  return lines.join("\n");
}

export function buildFixtures(largeRows: number = DEFAULT_LARGE_ROWS): FixtureFile[] {
  return [
    { name: "template.csv", bytes: text(templateCsv()) },
    { name: "template.vcf", bytes: text(templateVcf()) },
    { name: "template.xlsx", bytes: templateXlsx() },
    { name: "template-misnamed.csv", bytes: templateXlsx() },
    { name: "contacts-ar-1256.csv", bytes: encodeWindows1256(["الاسم,الهاتف,البريد,الشركة", ...arabicRows.map((r) => r.join(","))].join("\r\n")) },
    { name: "contacts.tsv", bytes: text([TEMPLATE_HEADERS.join("\t"), ...TEMPLATE_ROWS.map((r) => r.join("\t"))].join("\n")) },
    {
      name: "contacts.json",
      bytes: text(
        JSON.stringify({ contacts: TEMPLATE_ROWS.map((r) => ({ name: r[1], phones: (r[4] ?? "").split(";").map((p) => p.trim()), emails: [r[5]], company: r[6], groups: (r[7] ?? "").split(";").map((g) => g.trim()), aliases: [r[8]], note: r[9] })) }, null, 2)
      )
    },
    { name: "contacts.txt", bytes: text(["Sara Lee 050 123 4567", "Omar Haddad +961 3 123 456 omar@example.com", "no number on this line", "رنا 0501112222"].join("\n")) },
    {
      name: "contacts-v21.vcf",
      bytes: text("BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D9=85=D8=AD=D9=85=D8=AF;;;;\r\nTEL;CELL:+20 100 123 4567\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:2.1\r\nFN:Plain Name\r\nTEL;CELL:+1 415 555 0101\r\nEND:VCARD\r\n")
    },
    { name: "multisheet.xlsx", bytes: multisheetXlsx() },
    { name: "large.csv", bytes: text(largeCsv(largeRows)) }
  ];
}

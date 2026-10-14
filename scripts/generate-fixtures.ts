import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { XLSX } from "../src/vendor/xlsx";
import { TEMPLATE_HEADERS, TEMPLATE_ROWS, templateCsv, templateVcf, templateXlsx } from "../src/core/formats/templates";

const out = join(process.cwd(), "tests", "fixtures");
mkdirSync(out, { recursive: true });
const largeRows = Number(process.argv[2] ?? 100000);

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

writeFileSync(join(out, "template.csv"), templateCsv());
writeFileSync(join(out, "template.vcf"), templateVcf());
writeFileSync(join(out, "template.xlsx"), templateXlsx());
writeFileSync(join(out, "template-misnamed.csv"), templateXlsx());

writeFileSync(join(out, "contacts-ar-1256.csv"), encodeWindows1256(["الاسم,الهاتف,البريد,الشركة", ...arabicRows.map((r) => r.join(","))].join("\r\n")));

writeFileSync(join(out, "contacts.tsv"), [TEMPLATE_HEADERS.join("\t"), ...TEMPLATE_ROWS.map((r) => r.join("\t"))].join("\n"));

writeFileSync(
  join(out, "contacts.json"),
  JSON.stringify({ contacts: TEMPLATE_ROWS.map((r) => ({ name: r[1], phones: (r[4] ?? "").split(";").map((p) => p.trim()), emails: [r[5]], company: r[6], groups: (r[7] ?? "").split(";").map((g) => g.trim()), aliases: [r[8]], note: r[9] })) }, null, 2)
);

writeFileSync(join(out, "contacts.txt"), ["Sara Lee 050 123 4567", "Omar Haddad +961 3 123 456 omar@example.com", "no number on this line", "رنا 0501112222"].join("\n"));

writeFileSync(
  join(out, "contacts-v21.vcf"),
  "BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D9=85=D8=AD=D9=85=D8=AF;;;;\r\nTEL;CELL:+20 100 123 4567\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:2.1\r\nFN:Plain Name\r\nTEL;CELL:+1 415 555 0101\r\nEND:VCARD\r\n"
);

const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["name", "phone"], ["Sheet One A", "0501110001"], ["Sheet One B", "0501110002"]]), "People");
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Full Name", "Mobile", "Email"], ["Sheet Two A", "0502220001", "a@x.com"]]), "Vendors");
writeFileSync(join(out, "multisheet.xlsx"), new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" })));

const lines = ["name,phones,emails,company,groups"];
for (let i = 0; i < largeRows; i++) lines.push(`Person ${i},05${String(10000000 + i * 3).slice(0, 8)}${i % 4 === 0 ? `;05${String(20000000 + i).slice(0, 8)}` : ""},person${i}@example.com,Company ${i % 300},Group ${i % 7}`);
writeFileSync(join(out, "large.csv"), lines.join("\n"));

console.log(`fixtures written to ${out} (large.csv: ${largeRows} rows)`);

import { XLSX } from "../../vendor/xlsx";

export const TEMPLATE_HEADERS = ["contact_id", "name", "first_name", "last_name", "phones", "emails", "company", "groups", "aliases", "note"] as const;

export const TEMPLATE_ROWS: string[][] = [
  ["", "Sarah Johnson", "Sarah", "Johnson", "+1 415 555 0123; +1 415 555 0188", "sarah@example.com", "Northwind Traders", "Work; Friends", "Sally", "Met at the 2024 summit"],
  ["", "أحمد محمود", "أحمد", "محمود", "+20 100 123 4567; +20 122 765 4321", "ahmed@example.com", "شركة النيل", "العمل", "Ahmed Mahmoud", "عميل مهم"],
  ["", "王小明", "小明", "王", "+86 138 0013 8000; +86 21 5555 0100", "wang@example.cn", "星辰科技", "工作", "Wang Xiaoming", "展会联系人"]
];

function csvCell(value: string): string {
  return /[",\n\r;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function templateCsv(): string {
  const rows = [[...TEMPLATE_HEADERS], ...TEMPLATE_ROWS];
  return `\ufeff${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function templateXlsx(): Uint8Array<ArrayBuffer> {
  const sheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], ...TEMPLATE_ROWS]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Contacts");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function templateVcf(): string {
  const cards = TEMPLATE_ROWS.map((row) => {
    const [id, name, first, last, phones, emails, company, groups, aliases, note] = row;
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeValue(name ?? "")}`, `N:${escapeValue(last ?? "")};${escapeValue(first ?? "")};;;`];
    if (aliases) lines.push(`NICKNAME:${aliases}`);
    for (const phone of (phones ?? "").split(";").map((p) => p.trim()).filter(Boolean)) lines.push(`TEL;TYPE=CELL:${phone}`);
    for (const email of (emails ?? "").split(";").map((p) => p.trim()).filter(Boolean)) lines.push(`EMAIL;TYPE=INTERNET:${email}`);
    if (company) lines.push(`ORG:${escapeValue(company)}`);
    if (groups) lines.push(`CATEGORIES:${groups.split(";").map((g) => g.trim()).join(",")}`);
    if (note) lines.push(`NOTE:${escapeValue(note)}`);
    if (id) lines.push(`X-CONTACT-ID:${id}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
  });
  return `${cards.join("\r\n")}\r\n`;
}

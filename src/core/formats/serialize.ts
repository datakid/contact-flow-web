import { XLSX } from "../../vendor/xlsx";
import { styleNumber } from "../phone";
import type { Contact } from "../types";
import { vcardOf } from "./vcard";
import type { VCardOptions } from "./vcard";

export type ExportFormat = "csv" | "vcard" | "json" | "txt" | "excel";
export type NumberStyle = "saved" | "intl" | "digits";

export interface ExportOptions {
  format: ExportFormat;
  header: boolean;
  everyNumber: boolean;
  emails: boolean;
  company: boolean;
  notes: boolean;
  aliases: boolean;
  groups: boolean;
  contactId: boolean;
  numberStyle: NumberStyle;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "csv",
  header: true,
  everyNumber: true,
  emails: true,
  company: true,
  notes: true,
  aliases: true,
  groups: true,
  contactId: false,
  numberStyle: "saved"
};

export const EXPORT_EXTENSIONS: Record<ExportFormat, { ext: string; mime: string }> = {
  csv: { ext: "csv", mime: "text/csv;charset=utf-8" },
  vcard: { ext: "vcf", mime: "text/vcard;charset=utf-8" },
  json: { ext: "json", mime: "application/json" },
  txt: { ext: "txt", mime: "text/plain;charset=utf-8" },
  excel: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
};

export interface ColumnSpec {
  header: string;
  read: (contact: Contact) => string;
}

export interface ColumnWidths {
  phones: number;
  emails: number;
}

export function measureWidths(contacts: readonly Contact[], current: ColumnWidths): ColumnWidths {
  let { phones, emails } = current;
  for (const c of contacts) {
    if (c.phones.length > phones) phones = c.phones.length;
    if (c.emails.length > emails) emails = c.emails.length;
  }
  return { phones, emails };
}

export function columnsFor(options: ExportOptions, widths: ColumnWidths): ColumnSpec[] {
  const maxPhones = options.everyNumber ? Math.max(widths.phones, 1) : 1;
  const maxEmails = options.emails ? (options.everyNumber ? Math.max(widths.emails, 1) : 1) : 0;
  const cols: ColumnSpec[] = [];
  if (options.contactId) cols.push({ header: "contact_id", read: (c) => c.id });
  cols.push({ header: "Name", read: (c) => c.name });
  if (options.aliases) cols.push({ header: "Alias", read: (c) => c.aliases.join("; ") });
  for (let i = 0; i < maxPhones; i++) cols.push({ header: maxPhones > 1 ? `Phone ${i + 1}` : "Phone", read: (c) => styleNumber(c.phones[i]?.value ?? "", options.numberStyle) });
  for (let i = 0; i < maxEmails; i++) cols.push({ header: maxEmails > 1 ? `Email ${i + 1}` : "Email", read: (c) => c.emails[i]?.value ?? "" });
  if (options.company) cols.push({ header: "Company", read: (c) => c.company });
  if (options.groups) cols.push({ header: "Groups", read: (c) => c.groups.join("; ") });
  if (options.notes) cols.push({ header: "Note", read: (c) => c.note });
  return cols;
}

export function csvCell(value: string): string {
  return /[",\n\r;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvChunk(contacts: readonly Contact[], columns: readonly ColumnSpec[]): string {
  return contacts.map((c) => columns.map((col) => csvCell(col.read(c))).join(",")).join("\r\n");
}

export function csvHeader(columns: readonly ColumnSpec[]): string {
  return columns.map((c) => csvCell(c.header)).join(",");
}

export function vcardOptionsOf(options: ExportOptions): VCardOptions {
  return {
    everyNumber: options.everyNumber,
    emails: options.emails,
    company: options.company,
    notes: options.notes,
    aliases: options.aliases,
    groups: options.groups,
    contactId: options.contactId,
    mapPhone: (value) => styleNumber(value, options.numberStyle)
  };
}

export function vcardChunk(contacts: readonly Contact[], options: ExportOptions): string {
  const vo = vcardOptionsOf(options);
  return contacts
    .map((c) => vcardOf({ id: c.id, name: c.name, company: c.company, note: c.note, phones: c.phones.map((p) => p.value), emails: c.emails.map((e) => e.value), aliases: c.aliases, groups: c.groups }, vo))
    .join("\r\n");
}

export function jsonObject(contact: Contact, options: ExportOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (options.contactId) out.contact_id = contact.id;
  out.name = contact.name;
  if (options.aliases) out.aliases = contact.aliases;
  const phones = options.everyNumber ? contact.phones : contact.phones.slice(0, 1);
  out.phones = phones.map((p) => styleNumber(p.value, options.numberStyle));
  if (options.emails) out.emails = (options.everyNumber ? contact.emails : contact.emails.slice(0, 1)).map((e) => e.value);
  if (options.company) out.company = contact.company;
  if (options.groups) out.groups = contact.groups;
  if (options.notes) out.note = contact.note;
  return out;
}

export function txtChunk(contacts: readonly Contact[], options: ExportOptions): string {
  const lines: string[] = [];
  for (const c of contacts) {
    const phones = options.everyNumber ? c.phones : c.phones.slice(0, 1);
    for (const p of phones) {
      const number = styleNumber(p.value, options.numberStyle);
      lines.push(options.header && c.name ? `${c.name}\t${number}` : number);
    }
  }
  return lines.join("\r\n");
}

export function excelBytes(contacts: readonly Contact[], options: ExportOptions): Uint8Array<ArrayBuffer> {
  const columns = columnsFor(options, measureWidths(contacts, { phones: 1, emails: 1 }));
  const rows = contacts.map((c) => columns.map((col) => col.read(c)));
  if (options.header) rows.unshift(columns.map((c) => c.header));
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Contacts");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}

export function previewText(contacts: readonly Contact[], options: ExportOptions): string {
  const sample = contacts.slice(0, 4);
  if (sample.length === 0) return "";
  const widths = measureWidths(sample, { phones: 1, emails: 1 });
  switch (options.format) {
    case "csv":
    case "excel": {
      const columns = columnsFor(options, widths);
      const body = sample.map((c) => columns.map((col) => col.read(c)).join(options.format === "excel" ? "  │  " : ","));
      return (options.header ? [columns.map((c) => c.header).join(options.format === "excel" ? "  │  " : ",")] : []).concat(body).join("\n");
    }
    case "vcard": return vcardChunk(sample, options).split(/\r?\n/).slice(0, 14).join("\n");
    case "json": return JSON.stringify(sample.map((c) => jsonObject(c, options)), null, 2).split("\n").slice(0, 14).join("\n");
    case "txt": return txtChunk(sample, options);
  }
}

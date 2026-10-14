import type { ParsedContact } from "../types";
import { emptyParsed } from "../types";

function decodeQuotedPrintable(value: string, charset: string | undefined): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(value.charCodeAt(i) & 0xff);
  }
  try {
    return new TextDecoder(charset ?? "utf-8").decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

function unescapeValue(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;:\\])/g, "$1");
}

function splitValue(value: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] ?? "";
    if (ch === "\\" && i + 1 < value.length) {
      current += ch + (value[i + 1] ?? "");
      i++;
    } else if (ch === separator) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map(unescapeValue);
}

export function unfoldVCard(text: string): string {
  return text
    .replace(/^\ufeff/, "")
    .replace(/=\r?\n/g, (match, offset: number, all: string) => {
      const lineStart = all.lastIndexOf("\n", offset) + 1;
      return /QUOTED-PRINTABLE/i.test(all.slice(lineStart, offset)) ? "" : match;
    })
    .replace(/\r?\n[ \t]/g, "");
}

export function parseVCards(text: string): ParsedContact[] {
  const out: ParsedContact[] = [];
  let current: ParsedContact | null = null;
  let structured: string[] | null = null;
  for (const raw of unfoldVCard(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD/i.test(line)) {
      current = emptyParsed();
      structured = null;
      continue;
    }
    if (/^END:VCARD/i.test(line)) {
      if (current) {
        if (!current.name && structured) {
          current.name = [structured[3], structured[1], structured[2], structured[0], structured[4]].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
        }
        if (structured) {
          current.firstName = (structured[1] ?? "").trim();
          current.lastName = (structured[0] ?? "").trim();
        }
        if (current.name || current.phones.length || current.emails.length) out.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const parts = left.split(";");
    const prop = (parts[0] ?? "").replace(/^.*\./, "").toUpperCase();
    const params = parts.slice(1).join(";").toUpperCase();
    if (/QUOTED-PRINTABLE/.test(params)) {
      const charset = /CHARSET=([^;]+)/.exec(params)?.[1];
      value = decodeQuotedPrintable(value, charset);
    }
    switch (prop) {
      case "FN":
        current.name = unescapeValue(value).trim();
        break;
      case "N":
        structured = splitValue(value, ";");
        break;
      case "TEL": {
        const phone = unescapeValue(value).replace(/^tel:/i, "").trim();
        if (phone) current.phones.push(phone);
        break;
      }
      case "EMAIL": {
        const email = unescapeValue(value).trim();
        if (email) current.emails.push(email);
        break;
      }
      case "ORG":
        current.company = splitValue(value, ";").filter(Boolean).join(" · ").trim();
        break;
      case "NOTE":
        current.note = unescapeValue(value).trim();
        break;
      case "NICKNAME":
        for (const alias of splitValue(value, ",").map((x) => x.trim()).filter(Boolean)) current.aliases.push(alias);
        break;
      case "CATEGORIES":
        for (const group of splitValue(value, ",").map((x) => x.trim()).filter(Boolean)) current.groups.push(group);
        break;
      case "X-CONTACT-ID":
        current.contactId = value.trim();
        break;
      default:
        break;
    }
  }
  return out;
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export interface VCardSource {
  id: string;
  name: string;
  company: string;
  note: string;
  phones: string[];
  emails: string[];
  aliases: string[];
  groups: string[];
}

export interface VCardOptions {
  everyNumber: boolean;
  emails: boolean;
  company: boolean;
  notes: boolean;
  aliases: boolean;
  groups: boolean;
  contactId: boolean;
  mapPhone: (value: string) => string;
}

export function vcardOf(contact: VCardSource, options: VCardOptions): string {
  const parts = contact.name.trim().split(/\s+/);
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
  const family = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeValue(contact.name)}`, `N:${escapeValue(family)};${escapeValue(given)};;;`];
  if (options.aliases && contact.aliases.length) lines.push(`NICKNAME:${contact.aliases.map((a) => a.replace(/,/g, "\\,")).join(",")}`);
  const phones = options.everyNumber ? contact.phones : contact.phones.slice(0, 1);
  for (const phone of phones) lines.push(`TEL;TYPE=CELL:${options.mapPhone(phone)}`);
  if (options.emails) {
    const emails = options.everyNumber ? contact.emails : contact.emails.slice(0, 1);
    for (const email of emails) lines.push(`EMAIL;TYPE=INTERNET:${email}`);
  }
  if (options.company && contact.company) lines.push(`ORG:${escapeValue(contact.company)}`);
  if (options.groups && contact.groups.length) lines.push(`CATEGORIES:${contact.groups.map((g) => g.replace(/,/g, "\\,")).join(",")}`);
  if (options.notes && contact.note) lines.push(`NOTE:${escapeValue(contact.note)}`);
  if (options.contactId) lines.push(`X-CONTACT-ID:${contact.id}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

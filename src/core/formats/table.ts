import { latinDigits } from "../fold";
import type { ParsedContact } from "../types";
import { CANONICAL_HEADERS, digitCount } from "./mapping";

export interface FlatRecord {
  contactId: string;
  name: string;
  phones: string[];
  emails: string[];
  company: string;
  aliases: string[];
  groups: string[];
  note: string;
}

export function canonicalRow(record: FlatRecord): string[] {
  return [record.contactId, record.name, record.phones.join("; "), record.emails.join("; "), record.company, record.aliases.join("; "), record.groups.join("; "), record.note];
}

export function canonicalHeader(): string[] {
  return [...CANONICAL_HEADERS];
}

export function parsedToRecord(contact: ParsedContact): FlatRecord {
  return {
    contactId: contact.contactId,
    name: contact.name,
    phones: contact.phones,
    emails: contact.emails,
    company: contact.company,
    aliases: contact.aliases,
    groups: contact.groups,
    note: contact.note
  };
}

const PHONE_RE = /\+?\(?\d[\d\s\-().\u00a0]{4,}\d/g;

export function textLineToRecord(line: string): FlatRecord | null {
  const l = latinDigits(line).trim();
  if (!l) return null;
  const phones = (l.match(PHONE_RE) ?? []).map((p) => p.trim()).filter((p) => digitCount(p) >= 5);
  const emails = l.match(/[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+/g) ?? [];
  if (phones.length === 0 && emails.length === 0) return null;
  let rest = l;
  for (const token of [...phones, ...emails]) rest = rest.replace(token, " ");
  const name = rest.replace(/[,;:\t|<>\-–—]+/g, " ").replace(/\s+/g, " ").trim();
  return { contactId: "", name, phones, emails, company: "", aliases: [], groups: [], note: "" };
}

function listFrom(value: unknown, key: string): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          return String(obj[key] ?? obj.value ?? obj.number ?? obj.address ?? obj.name ?? "");
        }
        return String(item);
      })
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(/[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function jsonObjectToRecord(object: unknown): FlatRecord | null {
  if (!object || typeof object !== "object" || Array.isArray(object)) return null;
  const lower: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object as Record<string, unknown>)) lower[key.toLowerCase()] = value;
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) {
      const value = lower[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return null;
  };
  let nameValue = pick("name", "fullname", "full_name", "displayname", "display_name");
  if (nameValue && typeof nameValue === "object") {
    const n = nameValue as Record<string, unknown>;
    nameValue = [n.first, n.last].filter(Boolean).join(" ");
  }
  if (!nameValue) nameValue = [pick("first", "firstname", "first_name", "givenname"), pick("last", "lastname", "last_name", "familyname")].filter(Boolean).join(" ");
  const record: FlatRecord = {
    contactId: String(pick("contact_id", "contactid") ?? ""),
    name: String(nameValue ?? "").trim(),
    phones: listFrom(pick("phones", "phone", "numbers", "number", "tel", "mobile", "phonenumbers"), "number"),
    emails: listFrom(pick("emails", "email", "mail"), "address"),
    company: String(pick("company", "organization", "organisation", "org") ?? "").trim(),
    aliases: listFrom(pick("aliases", "alias", "nicknames", "nickname"), "name"),
    groups: listFrom(pick("groups", "group", "labels", "categories"), "name"),
    note: String(pick("note", "notes") ?? "").trim()
  };
  if (!record.name && record.phones.length === 0 && record.emails.length === 0) return null;
  return record;
}

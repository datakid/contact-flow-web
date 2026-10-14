import { latinDigits } from "../fold";
import type { ParsedContact } from "../types";
import { emptyParsed } from "../types";
import { cleanHeader, guessHeader } from "./headers";
import type { TargetKind } from "./headers";

export type Confidence = "high" | "medium" | "low";

export interface MappingColumn {
  index: number;
  header: string;
  target: TargetKind;
  confidence: Confidence;
  samples: string[];
}

export interface Separators {
  semicolon: boolean;
  pipe: boolean;
  comma: boolean;
  newline: boolean;
}

export const DEFAULT_SEPARATORS: Separators = { semicolon: true, pipe: true, comma: true, newline: true };

export const CANONICAL_HEADERS = ["contact_id", "name", "phones", "emails", "company", "aliases", "groups", "note"] as const;

export function digitCount(value: string): number {
  return (latinDigits(value).match(/\d/g) ?? []).length;
}

export function isPhoneLike(value: string): boolean {
  const v = latinDigits(value).trim();
  return /^[+(]?[\d\s\-().\u00a0/]+$/.test(v) && digitCount(v) >= 5;
}

export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function detectHasHeader(rows: readonly string[][]): boolean {
  const head = rows[0];
  if (!head) return false;
  const recognised = head.filter((h) => {
    const guess = guessHeader(h);
    return guess.kind !== null && guess.kind !== "skip";
  }).length;
  return recognised >= 1 && !head.some(isPhoneLike);
}

export function headerSignature(header: readonly string[]): string {
  return header.map((h) => cleanHeader(h)).join("|");
}

function sampleValues(rows: readonly string[][], index: number, limit: number): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const value = (row[index] ?? "").trim();
    if (value) out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

export function autoMapColumns(header: readonly string[] | null, rows: readonly string[][]): MappingColumn[] {
  const width = Math.max(header?.length ?? 0, rows.reduce((m, r) => Math.max(m, r.length), 0));
  const columns: MappingColumn[] = [];
  let nameAssigned = false;
  for (let index = 0; index < width; index++) {
    const headerText = header?.[index] ?? "";
    const values = sampleValues(rows.slice(0, 50), index, 50);
    const samples = values.slice(0, 3);
    const phoneRatio = values.length ? values.filter(isPhoneLike).length / values.length : 0;
    const emailRatio = values.length ? values.filter(isEmailLike).length / values.length : 0;
    let target: TargetKind = "ignore";
    let confidence: Confidence = "low";
    if (header) {
      const guess = guessHeader(headerText);
      if (guess.kind && guess.kind !== "skip") {
        target = guess.kind;
        confidence = guess.exact ? "high" : "medium";
      } else if (guess.kind === "skip") {
        target = "ignore";
        confidence = "high";
      } else if (values.length && phoneRatio > 0.6) {
        target = "phone";
        confidence = "low";
      } else if (values.length && emailRatio > 0.6) {
        target = "email";
        confidence = "low";
      }
      if (target === "phone" && values.length && phoneRatio < 0.3 && confidence !== "high") confidence = "low";
    } else if (values.length === 0) {
      target = "ignore";
    } else if (phoneRatio > 0.6) {
      target = "phone";
      confidence = phoneRatio > 0.9 ? "high" : "medium";
    } else if (emailRatio > 0.6) {
      target = "email";
      confidence = emailRatio > 0.9 ? "high" : "medium";
    } else if (!nameAssigned) {
      target = "name";
      confidence = "low";
    } else {
      target = "company";
      confidence = "low";
    }
    if (target === "name") nameAssigned = true;
    columns.push({ index, header: headerText, target, confidence, samples });
  }
  return columns;
}

export function isMappingValid(columns: readonly MappingColumn[]): boolean {
  return columns.some((c) => c.target === "name" || c.target === "first" || c.target === "last" || c.target === "phone" || c.target === "email");
}

export function separatorPattern(separators: Separators, includeSpace: boolean): RegExp {
  const parts: string[] = [];
  if (separators.semicolon) parts.push(";", "؛");
  if (separators.pipe) parts.push("\\|");
  if (separators.comma) parts.push(",", "،");
  if (separators.newline) parts.push("\\n", "\\r");
  if (includeSpace) parts.push("\\s");
  if (parts.length === 0) return /(?!)/;
  return new RegExp(`[${parts.join("")}]`);
}

export function splitMulti(value: string, pattern: RegExp): string[] {
  return value
    .split(pattern)
    .map((part) => part.trim())
    .filter(Boolean);
}

export interface RowParser {
  parse(row: readonly string[]): ParsedContact | null;
}

export function createRowParser(columns: readonly MappingColumn[], separators: Separators): RowParser {
  const active = columns.filter((c) => c.target !== "ignore");
  const generic = separatorPattern(separators, false);
  const emailSplit = separatorPattern(separators, true);
  const phoneSplit = new RegExp(`${generic.source}|\\s\\/\\s|\\s:::\\s`);
  return {
    parse(row) {
      const contact = emptyParsed();
      for (const column of active) {
        const value = (row[column.index] ?? "").trim();
        if (!value) continue;
        switch (column.target) {
          case "id":
            contact.contactId = value;
            break;
          case "name":
            contact.name = contact.name ? `${contact.name} ${value}` : value;
            break;
          case "first":
            contact.firstName = contact.firstName ? `${contact.firstName} ${value}` : value;
            break;
          case "last":
            contact.lastName = contact.lastName ? `${contact.lastName} ${value}` : value;
            break;
          case "phone":
            for (const phone of splitMulti(value, phoneSplit)) if (digitCount(phone) >= 3) contact.phones.push(phone);
            break;
          case "email":
            for (const email of splitMulti(value, emailSplit)) contact.emails.push(email);
            break;
          case "company":
            contact.company = contact.company ? `${contact.company} ${value}` : value;
            break;
          case "note":
            contact.note = contact.note ? `${contact.note}\n${value}` : value;
            break;
          case "alias":
            for (const alias of splitMulti(value, generic)) contact.aliases.push(alias);
            break;
          case "group":
            for (const group of splitMulti(value, generic)) contact.groups.push(group);
            break;
          default:
            break;
        }
      }
      if (!contact.name) contact.name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
      if (!contact.name && contact.phones.length === 0 && contact.emails.length === 0) return null;
      return contact;
    }
  };
}

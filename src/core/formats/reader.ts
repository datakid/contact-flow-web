import { JSONParser } from "@streamparser/json";
import Papa from "papaparse";
import { XLSX } from "../../vendor/xlsx";
import { canonicalHeader, canonicalRow, jsonObjectToRecord, parsedToRecord, textLineToRecord } from "./table";
import type { FlatRecord } from "./table";
import { detectHasHeader } from "./mapping";
import { decodeBytes, isBinaryFormat, sniffBytes } from "./sniff";
import type { EncodingName, FormatKind, SniffResult } from "./sniff";
import { parseVCards } from "./vcard";

export const PREVIEW_BYTES = 1024 * 1024;
export const PREVIEW_ROWS = 100;
export const BATCH_ROWS = 5000;
export const WARN_BYTES = 200 * 1024 * 1024;
export const BLOCK_BYTES = 1024 * 1024 * 1024;

export interface ReadOptions {
  format: FormatKind;
  encoding: EncodingName;
  delimiter: string;
  sheet: string;
}

export interface PreviewOverrides {
  format?: FormatKind;
  encoding?: EncodingName;
  delimiter?: string;
  headerRow?: number;
  sheet?: string;
}

export interface PreviewSuccess {
  ok: true;
  detected: SniffResult;
  used: ReadOptions & { headerRow: number };
  sheets: string[];
  grid: string[][];
  header: string[] | null;
  bodyRows: string[][];
  columnCount: number;
  notice: string | null;
  sizeBytes: number;
  structured: boolean;
}

export interface PreviewFailure {
  ok: false;
  detected: SniffResult;
  used: ReadOptions & { headerRow: number };
  rawText: string;
  reason: string;
  sizeBytes: number;
}

export type PreviewResult = PreviewSuccess | PreviewFailure;

export function isStructuredFormat(format: FormatKind): boolean {
  return format === "vcard" || format === "json" || format === "txt";
}

function widthOf(rows: readonly string[][]): number {
  return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

function lastBoundary(buffer: string): number {
  let quotes = 0;
  let boundary = -1;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer.charCodeAt(i);
    if (ch === 34) quotes += 1;
    else if ((ch === 10 || ch === 13) && quotes % 2 === 0) boundary = i;
  }
  return boundary;
}

function parseDelimited(text: string, delimiter: string, preview?: number): string[][] {
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: "greedy", preview: preview ?? 0 });
  return result.data.map((row) => row.map((cell) => String(cell ?? "")));
}

function jsonPathsFor(first: string): string[] {
  return first === "[" ? ["$.*"] : ["$.contacts.*", "$.data.*", "$.items.*"];
}

function recordsFromJsonText(text: string, limit: number): FlatRecord[] {
  const trimmed = text.replace(/^\ufeff/, "").trimStart();
  const records: FlatRecord[] = [];
  const parser = new JSONParser({ paths: jsonPathsFor(trimmed[0] ?? ""), keepStack: false });
  parser.onValue = ({ value }) => {
    if (records.length >= limit) return;
    const record = jsonObjectToRecord(value);
    if (record) records.push(record);
  };
  try {
    parser.write(trimmed);
  } catch {
    return records;
  }
  if (records.length === 0 && trimmed.startsWith("{")) {
    try {
      const single = jsonObjectToRecord(JSON.parse(trimmed));
      if (single) records.push(single);
    } catch {
      return records;
    }
  }
  return records;
}

function structuredRows(format: FormatKind, text: string, limit: number): string[][] {
  if (format === "vcard") {
    const end = text.toUpperCase().lastIndexOf("END:VCARD");
    const complete = end >= 0 ? text.slice(0, end + 9) : text;
    return parseVCards(complete).slice(0, limit).map((c) => canonicalRow(parsedToRecord(c)));
  }
  if (format === "json") return recordsFromJsonText(text, limit).map(canonicalRow);
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    const record = textLineToRecord(line);
    if (record) rows.push(canonicalRow(record));
    if (rows.length >= limit) break;
  }
  return rows;
}

function firstWords(text: string): string {
  return text.slice(0, 500);
}

export async function previewBlob(blob: Blob, fileName: string, overrides: PreviewOverrides = {}): Promise<PreviewResult> {
  const head = new Uint8Array(await blob.slice(0, PREVIEW_BYTES).arrayBuffer());
  const detected = sniffBytes(head, fileName);
  const format = overrides.format ?? detected.format;
  const encoding = overrides.encoding ?? detected.encoding;
  const delimiter = overrides.delimiter ?? (format === "tsv" ? "\t" : detected.delimiter);
  const sizeBytes = blob.size;
  let used: ReadOptions & { headerRow: number } = { format, encoding, delimiter, sheet: overrides.sheet ?? "", headerRow: overrides.headerRow ?? -1 };
  const fail = (rawText: string, reason: string): PreviewFailure => ({ ok: false, detected, used: { ...used, headerRow: Math.max(used.headerRow, 0) }, rawText, reason, sizeBytes });
  try {
    let rows: string[][] = [];
    let sheets: string[] = [];
    let notice: string | null = null;
    const truncated = sizeBytes > PREVIEW_BYTES;
    if (isBinaryFormat(format)) {
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const book = XLSX.read(buffer, { type: "array", sheetRows: PREVIEW_ROWS + 5 });
      sheets = book.SheetNames;
      const sheetName = overrides.sheet && sheets.includes(overrides.sheet) ? overrides.sheet : sheets[0] ?? "";
      used = { ...used, sheet: sheetName };
      const sheet = book.Sheets[sheetName];
      rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false }).map((r) => r.map((c) => String(c ?? ""))) : [];
      rows = rows.filter((r) => r.some((c) => c.trim() !== ""));
    } else {
      const text = decodeBytes(head, encoding);
      if (isStructuredFormat(format)) {
        rows = structuredRows(format, text, PREVIEW_ROWS + 1);
      } else {
        const complete = truncated ? text.slice(0, Math.max(0, lastBoundary(text))) : text;
        rows = parseDelimited(complete || text, delimiter, PREVIEW_ROWS + 5);
      }
    }
    if (detected.mismatch && overrides.format === undefined && detected.extensionFormat) {
      notice = `This file is named .${fileName.split(".").pop() ?? ""} but looks like ${detected.format === "xlsx" || detected.format === "xls" ? "Excel" : detected.format.toUpperCase()}. Reading it as ${detected.format === "xlsx" || detected.format === "xls" ? "Excel" : detected.format.toUpperCase()}.`;
    }
    if (rows.length === 0) return fail(firstWords(isBinaryFormat(format) ? "" : decodeBytes(head, encoding)), "No rows could be read with these settings.");
    const structured = isStructuredFormat(format);
    let headerRow = used.headerRow;
    if (structured) headerRow = 0;
    else if (headerRow < 0) headerRow = detectHasHeader(rows) ? 1 : 0;
    used = { ...used, headerRow: structured ? 1 : headerRow };
    const grid = structured ? [canonicalHeader(), ...rows] : rows;
    const effectiveHeader = structured ? 1 : headerRow;
    const header = effectiveHeader > 0 ? grid[effectiveHeader - 1] ?? null : null;
    const bodyRows = grid.slice(Math.max(effectiveHeader, 0), PREVIEW_ROWS + effectiveHeader);
    return {
      ok: true,
      detected,
      used,
      sheets,
      grid: grid.slice(0, PREVIEW_ROWS),
      header: header ? [...header] : null,
      bodyRows,
      columnCount: Math.max(widthOf(grid), header?.length ?? 0),
      notice,
      sizeBytes,
      structured
    };
  } catch (error) {
    return fail(firstWords(isBinaryFormat(format) ? "" : decodeBytes(head, encoding)), error instanceof Error ? error.message : "The file could not be read.");
  }
}

export interface BatchProgress {
  bytesRead: number;
  totalBytes: number;
}

export async function* readRowBatches(blob: Blob, options: ReadOptions & { headerRow: number }, shouldStop: () => boolean, progress: (p: BatchProgress) => void): AsyncGenerator<string[][]> {
  const { format, encoding, delimiter } = options;
  const total = blob.size;
  const skipRows = options.headerRow > 0 ? options.headerRow : 0;
  let skipped = 0;
  const trimHeader = (rows: string[][]): string[][] => {
    if (skipped >= skipRows) return rows;
    const drop = Math.min(rows.length, skipRows - skipped);
    skipped += drop;
    return rows.slice(drop);
  };
  if (isBinaryFormat(format)) {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    progress({ bytesRead: total, totalBytes: total });
    const book = XLSX.read(buffer, { type: "array" });
    const names = options.sheet && book.SheetNames.includes(options.sheet) ? [options.sheet] : book.SheetNames.slice(0, 1);
    for (const name of names) {
      const sheet = book.Sheets[name];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false })
        .map((r) => r.map((c) => String(c ?? "")))
        .filter((r) => r.some((c) => c.trim() !== ""));
      const body = trimHeader(rows);
      for (let i = 0; i < body.length; i += BATCH_ROWS) {
        if (shouldStop()) return;
        yield body.slice(i, i + BATCH_ROWS);
      }
    }
    return;
  }
  const decoder = new TextDecoder(encoding);
  const reader = blob.stream().getReader();
  let buffer = "";
  let bytesRead = 0;
  let jsonParser: JSONParser | null = null;
  let jsonPending: string[][] = [];
  let first = true;
  const flushStructured = (text: string): string[][] => structuredRows(format, text, Number.MAX_SAFE_INTEGER);
  for (;;) {
    if (shouldStop()) return;
    const { done, value } = await reader.read();
    if (value) {
      bytesRead += value.byteLength;
      buffer += decoder.decode(value, { stream: !done });
      if (first) {
        buffer = buffer.replace(/^\ufeff/, "");
        first = false;
      }
    }
    if (done) buffer += decoder.decode();
    progress({ bytesRead, totalBytes: total });
    if (format === "json") {
      if (!jsonParser) {
        const lead = buffer.trimStart()[0] ?? "";
        jsonParser = new JSONParser({ paths: jsonPathsFor(lead), keepStack: false });
        jsonParser.onValue = ({ value: v }) => {
          const record = jsonObjectToRecord(v);
          if (record) jsonPending.push(canonicalRow(record));
        };
      }
      if (buffer) {
        jsonParser.write(buffer);
        buffer = "";
      }
      while (jsonPending.length >= BATCH_ROWS || (done && jsonPending.length > 0)) {
        const out = jsonPending.slice(0, BATCH_ROWS);
        jsonPending = jsonPending.slice(BATCH_ROWS);
        yield out;
      }
      if (done) return;
      continue;
    }
    if (format === "vcard") {
      const end = buffer.toUpperCase().lastIndexOf("END:VCARD");
      const cut = done ? buffer.length : end >= 0 ? end + 9 : 0;
      if (cut > 0) {
        const rows = flushStructured(buffer.slice(0, cut));
        buffer = buffer.slice(cut);
        for (let i = 0; i < rows.length; i += BATCH_ROWS) yield rows.slice(i, i + BATCH_ROWS);
      }
    } else if (format === "txt") {
      const cut = done ? buffer.length : Math.max(buffer.lastIndexOf("\n"), buffer.lastIndexOf("\r")) + 1;
      if (cut > 0) {
        const rows = flushStructured(buffer.slice(0, cut));
        buffer = buffer.slice(cut);
        for (let i = 0; i < rows.length; i += BATCH_ROWS) yield rows.slice(i, i + BATCH_ROWS);
      }
    } else {
      const cut = done ? buffer.length : lastBoundary(buffer) + 1;
      if (cut > 0) {
        const rows = trimHeader(parseDelimited(buffer.slice(0, cut), delimiter));
        buffer = buffer.slice(cut);
        for (let i = 0; i < rows.length; i += BATCH_ROWS) yield rows.slice(i, i + BATCH_ROWS);
      }
    }
    if (done) return;
  }
}

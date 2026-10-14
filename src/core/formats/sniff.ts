import jschardet from "jschardet";

export type FormatKind = "csv" | "tsv" | "txt" | "vcard" | "json" | "xlsx" | "xls" | "ods" | "numbers";

export const BINARY_FORMATS: readonly FormatKind[] = ["xlsx", "xls", "ods", "numbers"];

export function isBinaryFormat(format: FormatKind): boolean {
  return BINARY_FORMATS.includes(format);
}

export const ENCODING_CHOICES = ["utf-8", "utf-16le", "utf-16be", "windows-1256", "windows-1252", "gb18030", "big5", "shift_jis"] as const;
export type EncodingName = (typeof ENCODING_CHOICES)[number];

export const DELIMITER_CHOICES = [",", ";", "\t", "|"] as const;

export interface SniffResult {
  format: FormatKind;
  encoding: EncodingName;
  delimiter: string;
  confidence: "high" | "medium" | "low";
  extensionFormat: FormatKind | null;
  mismatch: boolean;
}

export function extensionFormat(fileName: string): FormatKind | null {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "csv": return "csv";
    case "tsv": return "tsv";
    case "txt": return "txt";
    case "vcf":
    case "vcard": return "vcard";
    case "json": return "json";
    case "xlsx":
    case "xlsm": return "xlsx";
    case "xls": return "xls";
    case "ods": return "ods";
    case "numbers": return "numbers";
    default: return null;
  }
}

function latin1(bytes: Uint8Array, limit: number): string {
  let out = "";
  const end = Math.min(bytes.length, limit);
  for (let i = 0; i < end; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 8192)));
  }
  return out;
}

function sniffZip(bytes: Uint8Array): FormatKind {
  const text = latin1(bytes, bytes.length);
  if (text.includes("application/vnd.oasis.opendocument.spreadsheet")) return "ods";
  if (text.includes("xl/workbook") || text.includes("xl/_rels") || text.includes("xl/worksheets")) return "xlsx";
  if (/Index\/|Index\.zip|\.iwa|Metadata\/Properties/.test(text)) return "numbers";
  if (text.includes("[Content_Types].xml")) return "xlsx";
  return "xlsx";
}

export function hasBom(bytes: Uint8Array): { encoding: EncodingName; length: number } | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: "utf-8", length: 3 };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: "utf-16le", length: 2 };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: "utf-16be", length: 2 };
  return null;
}

function strictUtf8(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let trim = 0; trim <= 3; trim++) {
    try {
      decoder.decode(bytes.subarray(0, Math.max(0, bytes.length - trim)));
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function mapDetected(name: string | undefined): EncodingName | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n === "ascii" || n === "utf-8" || n === "utf8") return "utf-8";
  if (n === "windows-1256") return "windows-1256";
  if (n === "windows-1252" || n === "iso-8859-1") return "windows-1252";
  if (n === "gb2312" || n === "gb18030" || n === "gbk") return "gb18030";
  if (n === "big5") return "big5";
  if (n === "shift_jis" || n === "shift-jis") return "shift_jis";
  if (n === "utf-16le") return "utf-16le";
  if (n === "utf-16be") return "utf-16be";
  return null;
}

export function detectEncoding(bytes: Uint8Array): EncodingName {
  const bom = hasBom(bytes);
  if (bom) return bom.encoding;
  if (strictUtf8(bytes)) return "utf-8";
  const sample = latin1(bytes, 65536);
  const detected = jschardet.detect(sample, { minimumThreshold: 0.2 });
  const mapped = mapDetected(detected?.encoding ?? undefined);
  if (mapped) return mapped;
  const highBytes = bytes.subarray(0, 65536).filter((b) => b >= 0xc0).length;
  return highBytes > 8 ? "windows-1256" : "windows-1252";
}

export function decodeBytes(bytes: Uint8Array, encoding: EncodingName): string {
  const bom = hasBom(bytes);
  const body = bom && bom.encoding === encoding ? bytes.subarray(bom.length) : bytes;
  return new TextDecoder(encoding).decode(body);
}

export function scoreDelimiters(text: string): Array<{ delimiter: string; score: number }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 40);
  const results: Array<{ delimiter: string; score: number }> = [];
  for (const delimiter of DELIMITER_CHOICES) {
    const counts: number[] = [];
    for (const line of lines) {
      let inQuote = false;
      let count = 0;
      for (const ch of line) {
        if (ch === '"') inQuote = !inQuote;
        else if (!inQuote && ch === delimiter) count++;
      }
      counts.push(count);
    }
    if (counts.length === 0) {
      results.push({ delimiter, score: 0 });
      continue;
    }
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    let modeCount = 0;
    let modeFreq = 0;
    for (const [c, f] of freq) {
      if (c > 0 && f > modeFreq) {
        modeCount = c;
        modeFreq = f;
      }
    }
    results.push({ delimiter, score: modeCount === 0 ? 0 : (modeFreq / counts.length) * modeCount });
  }
  return results.sort((a, b) => b.score - a.score);
}

export function sniffBytes(bytes: Uint8Array, fileName: string): SniffResult {
  const byName = extensionFormat(fileName);
  const finish = (format: FormatKind, encoding: EncodingName, delimiter: string, confidence: SniffResult["confidence"]): SniffResult => ({
    format,
    encoding,
    delimiter,
    confidence,
    extensionFormat: byName,
    mismatch: byName !== null && byName !== format && !(byName === "tsv" && format === "csv") && !(byName === "csv" && format === "tsv")
  });
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return finish(sniffZip(bytes), "utf-8", ",", "high");
  }
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return finish("xls", "utf-8", ",", "high");
  }
  const encoding = detectEncoding(bytes);
  const text = decodeBytes(bytes, encoding);
  const trimmed = text.replace(/^\ufeff/, "").trimStart();
  if (/^BEGIN:VCARD/i.test(trimmed)) return finish("vcard", encoding, ",", "high");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return finish("json", encoding, ",", "high");
  const scored = scoreDelimiters(text);
  const best = scored[0];
  if (best && best.score >= 1) {
    const second = scored[1];
    const confidence = second && second.score > best.score * 0.8 ? "low" : best.score >= 2 ? "high" : "medium";
    return finish(best.delimiter === "\t" ? "tsv" : "csv", encoding, best.delimiter, confidence);
  }
  return finish("txt", encoding, ",", "low");
}

export function describeFormat(format: FormatKind): string {
  switch (format) {
    case "csv": return "CSV";
    case "tsv": return "TSV";
    case "txt": return "Text";
    case "vcard": return "vCard";
    case "json": return "JSON";
    case "xlsx": return "Excel (.xlsx)";
    case "xls": return "Excel 97-2003 (.xls)";
    case "ods": return "OpenDocument Spreadsheet";
    case "numbers": return "Apple Numbers";
  }
}

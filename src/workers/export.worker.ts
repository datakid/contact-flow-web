import * as Comlink from "comlink";
import type { DbApi } from "../core/db/api";
import type { Selection } from "../core/db/library";
import { columnsFor, csvChunk, csvHeader, EXPORT_EXTENSIONS, excelBytes, jsonObject, measureWidths, txtChunk, vcardChunk } from "../core/formats/serialize";
import type { ExportOptions } from "../core/formats/serialize";
import type { Contact } from "../core/types";

const PAGE = 2000;
const EXCEL_ROW_LIMIT = 1000000;

let dbRemote: Comlink.Remote<Pick<DbApi, "readPage">> | null = null;
let cancelled = false;

export interface ExportOutcome {
  blob: Blob | null;
  ext: string;
  count: number;
  cancelled: boolean;
}

const api = {
  attachDbPort(port: MessagePort): void {
    dbRemote = Comlink.wrap<Pick<DbApi, "readPage">>(port);
  },

  cancel(): void {
    cancelled = true;
  },

  async run(selection: Selection, options: ExportOptions, onProgress: (done: number, total: number) => void): Promise<ExportOutcome> {
    if (!dbRemote) throw new Error("The export worker is not connected to the library");
    cancelled = false;
    const meta = EXPORT_EXTENSIONS[options.format];
    const parts: BlobPart[] = [];
    let widths = { phones: 1, emails: 1 };
    const pages: Contact[][] = [];
    let after = 0;
    let done = 0;
    let total = 0;
    const needsWidths = options.format === "csv" && options.everyNumber;
    const keepAll = options.format === "excel" || needsWidths;
    let first = true;
    for (;;) {
      if (cancelled) return { blob: null, ext: meta.ext, count: done, cancelled: true };
      const page = await dbRemote.readPage(selection, after, PAGE);
      total = page.total;
      if (page.contacts.length === 0) break;
      after = page.lastRowid;
      widths = measureWidths(page.contacts, widths);
      if (keepAll) pages.push(page.contacts);
      else {
        switch (options.format) {
          case "vcard": parts.push(`${first ? "" : "\r\n"}${vcardChunk(page.contacts, options)}`); break;
          case "json": parts.push(`${first ? "[\n" : ",\n"}${page.contacts.map((c) => JSON.stringify(jsonObject(c, options), null, 2)).join(",\n")}`); break;
          case "txt": parts.push(`${first ? "" : "\r\n"}${txtChunk(page.contacts, options)}`); break;
          default: break;
        }
      }
      first = false;
      done += page.contacts.length;
      onProgress(done, total);
    }
    if (options.format === "csv") {
      const columns = columnsFor(options, widths);
      const out: BlobPart[] = ["\ufeff"];
      let wrote = false;
      if (options.header) {
        out.push(csvHeader(columns));
        wrote = true;
      }
      for (const page of pages) {
        out.push(`${wrote ? "\r\n" : ""}${csvChunk(page, columns)}`);
        wrote = true;
      }
      return { blob: new Blob(out, { type: meta.mime }), ext: meta.ext, count: done, cancelled: false };
    }
    if (options.format === "excel") {
      const all = pages.flat();
      if (all.length > EXCEL_ROW_LIMIT) throw new Error("Excel files hold at most 1,048,576 rows. Export as CSV instead.");
      return { blob: new Blob([excelBytes(all, options)], { type: meta.mime }), ext: meta.ext, count: done, cancelled: false };
    }
    if (options.format === "vcard") parts.push("\r\n");
    if (options.format === "json") parts.push(first ? "[]" : "\n]");
    return { blob: new Blob(parts, { type: meta.mime }), ext: meta.ext, count: done, cancelled: false };
  }
};

export type ExportWorkerApi = typeof api;

Comlink.expose(api);

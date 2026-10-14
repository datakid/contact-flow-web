import XLSXModule from "../../vendor/xlsx_full_min.cjs";

export interface WorkBook {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

export interface SheetJS {
  read(data: ArrayBuffer | Uint8Array | string, opts: { type: "array" | "string" | "binary"; sheetRows?: number }): WorkBook;
  write(wb: WorkBook, opts: { type: "array"; bookType: "xlsx" | "csv" }): ArrayBuffer;
  utils: {
    sheet_to_json(ws: unknown, opts: { header: 1; raw: false; defval: string; blankrows?: boolean }): string[][];
    aoa_to_sheet(rows: string[][]): unknown;
    book_new(): WorkBook;
    book_append_sheet(wb: WorkBook, ws: unknown, name: string): void;
  };
  version: string;
}

export const XLSX = XLSXModule as unknown as SheetJS;

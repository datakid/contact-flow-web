import * as Comlink from "comlink";
import type { StageApi } from "../core/db/api";
import { createRowParser } from "../core/formats/mapping";
import type { MappingColumn, Separators } from "../core/formats/mapping";
import { BLOCK_BYTES, previewBlob, readRowBatches } from "../core/formats/reader";
import type { PreviewOverrides, PreviewResult, ReadOptions } from "../core/formats/reader";
import { emptyParsed } from "../core/types";
import type { ParsedContact } from "../core/types";

export interface ParseProgress {
  rows: number;
  rowsPerSecond: number;
  etaSeconds: number | null;
  fraction: number;
}

export interface ParseOutcome {
  rows: number;
  invalid: number;
  merged: number;
  cancelled: boolean;
}

let dbRemote: Comlink.Remote<StageApi> | null = null;
let cancelled = false;

const api = {
  attachDbPort(port: MessagePort): void {
    dbRemote = Comlink.wrap<StageApi>(port);
  },

  preview(file: File, overrides: PreviewOverrides): Promise<PreviewResult> {
    return previewBlob(file, file.name, overrides);
  },

  cancel(): void {
    cancelled = true;
  },

  async parseFull(
    file: File,
    used: ReadOptions & { headerRow: number },
    mapping: { columns: MappingColumn[]; separators: Separators },
    source: number,
    onProgress: (progress: ParseProgress) => void
  ): Promise<ParseOutcome> {
    if (!dbRemote) throw new Error("The import worker is not connected to the library");
    if (file.size > BLOCK_BYTES) throw new Error("This file is larger than 1 GB and cannot be imported in the browser.");
    cancelled = false;
    const parser = createRowParser(mapping.columns, mapping.separators);
    const started = performance.now();
    let rows = 0;
    let invalid = 0;
    let merged = 0;
    let fraction = 0;
    const generator = readRowBatches(file, used, () => cancelled, (p) => {
      fraction = p.totalBytes === 0 ? 1 : p.bytesRead / p.totalBytes;
    });
    for await (const batch of generator) {
      if (cancelled) return { rows, invalid, merged, cancelled: true };
      const parsed: ParsedContact[] = batch.map((row) => parser.parse(row) ?? emptyParsed());
      const result = await dbRemote.stageInsert(source, parsed);
      rows += batch.length;
      invalid += result.invalid;
      merged += result.merged;
      const elapsed = Math.max((performance.now() - started) / 1000, 0.001);
      const perSecond = rows / elapsed;
      onProgress({ rows, rowsPerSecond: perSecond, etaSeconds: fraction > 0.01 && fraction < 1 ? (elapsed / fraction) * (1 - fraction) : null, fraction });
    }
    onProgress({ rows, rowsPerSecond: rows / Math.max((performance.now() - started) / 1000, 0.001), etaSeconds: 0, fraction: 1 });
    return { rows, invalid, merged, cancelled };
  }
};

export type ImportWorkerApi = typeof api;

Comlink.expose(api);

import * as Comlink from "comlink";
import { create } from "zustand";
import { db, spawnImportWorker } from "../../app/db";
import { translate } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { WorkerHandle } from "../../app/db";
import type { CommitResult, ImportMode, MergeMode, StageSummary } from "../../core/db/staging";
import { autoMapColumns, DEFAULT_SEPARATORS, headerSignature, isMappingValid } from "../../core/formats/mapping";
import type { MappingColumn, Separators } from "../../core/formats/mapping";
import { BLOCK_BYTES } from "../../core/formats/reader";
import { extensionFormat } from "../../core/formats/sniff";
import type { SniffResult } from "../../core/formats/sniff";
import type { PreviewOverrides, PreviewResult } from "../../core/formats/reader";
import type { PresetRow } from "../../core/db/service";
import type { ImportWorkerApi, ParseProgress } from "../../workers/import.worker";

export interface TableState {
  key: string;
  file: File;
  label: string;
  overrides: PreviewOverrides;
  preview: PreviewResult | null;
  loading: boolean;
  columns: MappingColumn[];
  presetOffer: PresetRow | null;
}

export type Step = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  step: Step;
  tables: TableState[];
  activeKey: string | null;
  separators: Separators;
  country: string;
  mode: ImportMode;
  mergeMode: MergeMode;
  parsing: boolean;
  progress: ParseProgress | null;
  parseError: string | null;
  summary: StageSummary | null;
  cancelledNote: boolean;
  committing: boolean;
  commitProgress: { done: number; total: number } | null;
  result: CommitResult | null;
  version: number;
  reset: () => void;
  addFiles: (files: File[]) => string[];
  removeTable: (key: string) => void;
  setActive: (key: string) => void;
  setOverrides: (key: string, patch: PreviewOverrides) => void;
  setColumns: (key: string, columns: MappingColumn[]) => void;
  setSeparators: (separators: Separators) => void;
  setCountry: (country: string) => void;
  setMode: (mode: ImportMode) => void;
  setMergeMode: (mode: MergeMode) => void;
  goto: (step: Step) => void;
  startParse: () => Promise<void>;
  cancelParse: () => Promise<void>;
  commit: () => Promise<void>;
  bump: () => void;
}

let handle: WorkerHandle<ImportWorkerApi> | null = null;
let fileSeq = 0;
let previewSeq = new Map<string, number>();

async function worker(): Promise<WorkerHandle<ImportWorkerApi>> {
  if (!handle) handle = await spawnImportWorker();
  return handle;
}

export function disposeImportWorker(): void {
  handle?.terminate();
  handle = null;
}

function mappingFor(result: PreviewResult): MappingColumn[] {
  if (!result.ok) return [];
  return autoMapColumns(result.header, result.bodyRows);
}

const initial = {
  step: 1 as Step,
  tables: [] as TableState[],
  activeKey: null as string | null,
  separators: DEFAULT_SEPARATORS,
  mode: "add" as ImportMode,
  mergeMode: "fillEmpty" as MergeMode,
  parsing: false,
  progress: null as ParseProgress | null,
  parseError: null as string | null,
  summary: null as StageSummary | null,
  cancelledNote: false,
  committing: false,
  commitProgress: null as { done: number; total: number } | null,
  result: null as CommitResult | null,
  version: 0
};

export const useWizard = create<WizardState>((set, get) => {
  const patchTable = (key: string, patch: Partial<TableState>): void => set({ tables: get().tables.map((t) => (t.key === key ? { ...t, ...patch } : t)) });

  const runPreview = async (key: string): Promise<void> => {
    const table = get().tables.find((t) => t.key === key);
    if (!table) return;
    const seq = (previewSeq.get(key) ?? 0) + 1;
    previewSeq.set(key, seq);
    patchTable(key, { loading: true });
    let result: PreviewResult;
    try {
      const w = await worker();
      result = await w.api.preview(table.file, table.overrides);
    } catch (error) {
      if (previewSeq.get(key) !== seq) return;
      const fallbackFormat = table.overrides.format ?? extensionFormat(table.file.name) ?? "csv";
      const detected: SniffResult = { format: fallbackFormat, encoding: "utf-8", delimiter: ",", confidence: "low", extensionFormat: extensionFormat(table.file.name), mismatch: false };
      patchTable(key, {
        loading: false,
        preview: {
          ok: false,
          detected,
          used: { format: fallbackFormat, encoding: table.overrides.encoding ?? "utf-8", delimiter: table.overrides.delimiter ?? ",", sheet: table.overrides.sheet ?? "", headerRow: Math.max(table.overrides.headerRow ?? 0, 0) },
          rawText: "",
          reason: error instanceof Error ? error.message : String(error),
          sizeBytes: table.file.size
        }
      });
      return;
    }
    if (previewSeq.get(key) !== seq) return;
    const current = get().tables.find((t) => t.key === key);
    if (!current) return;
    if (result.ok && result.sheets.length > 1 && current.overrides.sheet === undefined) {
      const siblings: TableState[] = result.sheets.map((sheet) => ({
        key: `${key}#${sheet}`,
        file: current.file,
        label: `${current.file.name} · ${sheet}`,
        overrides: { sheet },
        preview: null,
        loading: true,
        columns: [],
        presetOffer: null
      }));
      set({ tables: get().tables.flatMap((t) => (t.key === key ? siblings : [t])), activeKey: siblings[0]?.key ?? null });
      for (const s of siblings) void runPreview(s.key);
      return;
    }
    const presets = result.ok && result.header ? await db.listPresets() : [];
    const signature = result.ok && result.header ? headerSignature(result.header) : "";
    const offer = presets.find((p) => p.signature === signature) ?? null;
    patchTable(key, { preview: result, loading: false, columns: mappingFor(result), presetOffer: offer });
  };

  return {
    ...initial,
    country: "US",
    reset: () => {
      previewSeq = new Map();
      set({ ...initial, tables: [], separators: DEFAULT_SEPARATORS });
    },
    addFiles: (files) => {
      const keys: string[] = [];
      const added: TableState[] = [];
      for (const file of files) {
        if (file.size > BLOCK_BYTES) {
          const app = useApp.getState();
          app.toast(translate(app.lang, "fileTooLarge", file.name), null, "error");
          continue;
        }
        const key = `f${++fileSeq}`;
        keys.push(key);
        added.push({ key, file, label: file.name, overrides: {}, preview: null, loading: true, columns: [], presetOffer: null });
      }
      set({ tables: [...get().tables, ...added], activeKey: get().activeKey ?? added[0]?.key ?? null });
      for (const key of keys) void runPreview(key);
      return keys;
    },
    removeTable: (key) => {
      const tables = get().tables.filter((t) => t.key !== key);
      set({ tables, activeKey: get().activeKey === key ? tables[0]?.key ?? null : get().activeKey });
    },
    setActive: (key) => set({ activeKey: key }),
    setOverrides: (key, patch) => {
      const table = get().tables.find((t) => t.key === key);
      if (!table) return;
      patchTable(key, { overrides: { ...table.overrides, ...patch } });
      void runPreview(key);
    },
    setColumns: (key, columns) => patchTable(key, { columns }),
    setSeparators: (separators) => set({ separators }),
    setCountry: (country) => set({ country }),
    setMode: (mode) => set({ mode }),
    setMergeMode: (mergeMode) => set({ mergeMode }),
    goto: (step) => set({ step }),
    bump: () => set({ version: get().version + 1 }),
    startParse: async () => {
      const state = get();
      set({ step: 4, parsing: true, progress: null, parseError: null, summary: null, cancelledNote: false });
      try {
        await db.stageBegin();
        const w = await worker();
        let index = 0;
        for (const table of state.tables) {
          if (!table.preview || !table.preview.ok || !isMappingValid(table.columns)) continue;
          const outcome = await w.api.parseFull(
            table.file,
            table.preview.used,
            { columns: table.columns, separators: get().separators },
            index,
            Comlink.proxy((p: ParseProgress) => {
              if (get().parsing) set({ progress: p });
            })
          );
          if (outcome.cancelled) return;
          index += 1;
        }
        await db.stageClassify();
        const summary = await db.stageSummary();
        set({ parsing: false, summary, version: get().version + 1 });
      } catch (error) {
        if (!get().parsing) return;
        set({ parsing: false, parseError: error instanceof Error ? error.message : String(error) });
      }
    },
    cancelParse: async () => {
      set({ parsing: false, progress: null, cancelledNote: true, step: 3, summary: null });
      disposeImportWorker();
      await db.stageDiscard();
    },
    commit: async () => {
      const { mode, mergeMode } = get();
      set({ committing: true, commitProgress: { done: 0, total: 0 }, step: 5 });
      try {
        const result = await db.stageCommit(mode, mergeMode, "Import", Comlink.proxy((done: number, total: number) => set({ commitProgress: { done, total } })));
        set({ committing: false, result });
      } catch (error) {
        set({ committing: false, parseError: error instanceof Error ? error.message : String(error) });
      }
    }
  };
});

import { CompactSelection, DataEditor, GridCellKind } from "@glideapps/glide-data-grid";
import type { GridCell, GridColumn, Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useEffect, useMemo, useState } from "react";
import { describeFormat, DELIMITER_CHOICES, ENCODING_CHOICES } from "../../core/formats/sniff";
import type { FormatKind } from "../../core/formats/sniff";
import { Button, Checkbox, Field, Select, Spinner, Tab, TabList, Tabs, inputClass } from "../../ui/primitives";
import { useW } from "./strings";
import { useWizard } from "./wizardStore";
import type { TableState } from "./wizardStore";

const FORMATS: FormatKind[] = ["csv", "tsv", "txt", "vcard", "json", "xlsx", "xls", "ods", "numbers"];

function gridTheme(): Record<string, string | number> {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string): string => css.getPropertyValue(n).trim();
  return { bgCell: v("--card"), bgHeader: v("--sunk"), textDark: v("--ink"), textHeader: v("--ink-2"), textMedium: v("--muted"), borderColor: v("--line"), accentColor: v("--accent"), fontFamily: "Manrope, 'IBM Plex Sans Arabic', system-ui, sans-serif", baseFontStyle: "13px", headerFontStyle: "600 12px" };
}

function RawGrid({ table }: { table: TableState }) {
  const w = useW();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 600, height: 280 });
  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(() => setSize({ width: host.clientWidth, height: host.clientHeight }));
    observer.observe(host);
    setSize({ width: host.clientWidth, height: host.clientHeight });
    return () => observer.disconnect();
  }, [host]);
  const preview = table.preview;
  const grid = preview && preview.ok ? preview.grid : [];
  const width = preview && preview.ok ? preview.columnCount : 0;
  const headerIndex = preview && preview.ok ? preview.used.headerRow : 0;
  const columns = useMemo<GridColumn[]>(() => Array.from({ length: width }, (_, i) => ({ id: String(i), title: i < 26 ? String.fromCharCode(65 + i) : w.column(i + 1), width: 150 })), [width, w]);
  const cell = ([col, row]: Item): GridCell => {
    const text = grid[row]?.[col] ?? "";
    return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: false, readonly: true, themeOverride: row + 1 === headerIndex ? { bgCell: getComputedStyle(document.documentElement).getPropertyValue("--accent-soft").trim() } : undefined };
  };
  return (
    <div ref={setHost} className="h-72 overflow-hidden rounded-2xl border border-line">
      <DataEditor columns={columns} rows={grid.length} width={size.width} height={size.height} getCellContent={cell} rowMarkers="number" smoothScrollX smoothScrollY rowHeight={32} headerHeight={32} theme={gridTheme()} gridSelection={{ columns: CompactSelection.empty(), rows: CompactSelection.empty() }} />
    </div>
  );
}

export function StepPreview() {
  const w = useW();
  const tables = useWizard((s) => s.tables);
  const activeKey = useWizard((s) => s.activeKey);
  const setActive = useWizard((s) => s.setActive);
  const setOverrides = useWizard((s) => s.setOverrides);
  const table = tables.find((t) => t.key === activeKey) ?? tables[0];
  if (!table) return null;
  const preview = table.preview;
  const used = preview?.used;
  const binary = used ? ["xlsx", "xls", "ods", "numbers"].includes(used.format) : false;
  const structured = used ? ["vcard", "json", "txt"].includes(used.format) : false;
  const delimited = used ? used.format === "csv" || used.format === "tsv" : false;

  return (
    <div className="flex h-full flex-col">
      {tables.length > 1 ? (
        <Tabs value={table.key} onValueChange={setActive}>
          <TabList>
            {tables.map((t) => (
              <Tab key={t.key} value={t.key}>
                <span className="max-w-48 truncate">{t.label}</span>
              </Tab>
            ))}
          </TabList>
        </Tabs>
      ) : null}
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={w.format}>
            <Select value={used?.format ?? "csv"} onValueChange={(v) => setOverrides(table.key, { format: v as FormatKind })} options={FORMATS.map((f) => ({ value: f, label: describeFormat(f) }))} label={w.format} className="w-52" />
          </Field>
          {!binary ? (
            <Field label={w.encoding}>
              <Select value={used?.encoding ?? "utf-8"} onValueChange={(v) => setOverrides(table.key, { encoding: v as (typeof ENCODING_CHOICES)[number] })} options={ENCODING_CHOICES.map((e) => ({ value: e, label: e }))} label={w.encoding} className="w-40" />
            </Field>
          ) : null}
          {delimited ? (
            <Field label={w.delimiter}>
              <Select value={used?.delimiter ?? ","} onValueChange={(v) => setOverrides(table.key, { delimiter: v })} options={DELIMITER_CHOICES.map((d) => ({ value: d, label: d === "\t" ? "Tab" : d }))} label={w.delimiter} className="w-28" />
            </Field>
          ) : null}
          {!structured ? (
            <>
              <label className="flex h-9 items-center gap-2 text-sm font-semibold">
                <Checkbox checked={(used?.headerRow ?? 0) > 0} onCheckedChange={(on) => setOverrides(table.key, { headerRow: on ? 1 : 0 })} label={w.firstRowHeader} />
                {w.firstRowHeader}
              </label>
              {(used?.headerRow ?? 0) > 0 ? (
                <Field label={w.headerOnRow}>
                  <input type="number" min={1} max={100} value={used?.headerRow ?? 1} onChange={(e) => setOverrides(table.key, { headerRow: Math.max(1, Number(e.target.value) || 1) })} className={`${inputClass} w-20`} />
                </Field>
              ) : null}
            </>
          ) : null}
        </div>
        {preview?.ok && preview.notice ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-accent-soft p-3 text-sm">
            <span className="flex-1">{preview.notice}</span>
            {preview.detected.extensionFormat === "csv" || preview.detected.extensionFormat === "tsv" ? (
              <Button size="sm" variant="outline" onClick={() => setOverrides(table.key, { format: "csv" })}>
                {w.readAsCsv}
              </Button>
            ) : null}
          </div>
        ) : null}
        {table.loading && !preview ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted">
            <Spinner /> {w.previewing}
          </div>
        ) : null}
        {preview && !preview.ok ? (
          <div role="alert" className="space-y-3 rounded-2xl border border-danger/40 bg-card p-5">
            <div className="serif text-2xl text-danger">{w.errorTitle}</div>
            <p className="text-sm text-ink2">{preview.reason}</p>
            <div className="text-xs font-semibold text-muted">{w.errorDetected}</div>
            <p className="text-sm">{w.detected(describeFormat(preview.detected.format))} · {preview.detected.encoding}</p>
            <div className="text-xs font-semibold text-muted">{w.errorFirstChars}</div>
            <pre dir="auto" className="scroll-thin max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-sunk p-3 text-xs">{preview.rawText || "—"}</pre>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setOverrides(table.key, { format: "txt" })}>{w.changeFormat}</Button>
              <Button size="sm" variant="outline" onClick={() => setOverrides(table.key, { encoding: "windows-1256" })}>{w.changeEncoding}</Button>
              <Button size="sm" variant="primary" onClick={() => useWizard.getState().goto(1)}>{w.chooseAnother}</Button>
            </div>
          </div>
        ) : null}
        {preview?.ok ? (
          <>
            {preview.sheets.length > 1 ? <div className="text-xs text-muted">{w.sheet}: {preview.used.sheet}</div> : null}
            <RawGrid table={table} />
          </>
        ) : null}
      </div>
    </div>
  );
}

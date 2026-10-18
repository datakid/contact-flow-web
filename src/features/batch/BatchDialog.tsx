import { CompactSelection, DataEditor, GridCellKind } from "@glideapps/glide-data-grid";
import type { GridCell, GridColumn, Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import * as Comlink from "comlink";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../app/db";
import { useDebounced } from "../../app/hooks";
import { formatNumber, translate, useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { en } from "../../i18n/en";
import type { Messages } from "../../i18n/en";
import { OPS, defaultParams } from "../../core/ops/ops";
import type { OpDef, OpSection, ParamDef, Params } from "../../core/ops/ops";
import type { BatchPreview } from "../../core/db/service";
import { Button, Checkbox, Modal, ProgressBar, Segmented, cx, inputClass } from "../../ui/primitives";
import { useResolvedTheme } from "../library/TopBar";

const SECTIONS: Array<{ key: OpSection; label: keyof Messages }> = [
  { key: "names", label: "sec_names" },
  { key: "aliases", label: "sec_aliases" },
  { key: "numbers", label: "sec_numbers" },
  { key: "details", label: "sec_details" }
];

function theme(resolved: "dark" | "light"): Record<string, string | number> {
  if (document.documentElement.dataset.theme !== resolved) document.documentElement.dataset.theme = resolved;
  const css = getComputedStyle(document.documentElement);
  const v = (n: string): string => css.getPropertyValue(n).trim();
  return { bgCell: v("--card"), bgHeader: v("--sunk"), textDark: v("--ink"), textHeader: v("--ink-2"), textMedium: v("--muted"), borderColor: v("--line"), accentColor: v("--accent"), fontFamily: "Manrope, 'IBM Plex Sans Arabic', system-ui, sans-serif", baseFontStyle: "13px", headerFontStyle: "600 12px" };
}

function ParamField({ def, value, onChange }: { def: ParamDef; value: string | number | boolean | undefined; onChange: (v: string | number | boolean) => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const label = def.label in en ? translate(lang, def.label as keyof Messages) : "";
  const tr = (key: string): string => (key in en ? translate(lang, key as keyof Messages) : key);
  if (def.type === "seg") {
    return (
      <div className="space-y-1.5">
        {label ? <div className="text-xs font-semibold text-ink2">{label}</div> : null}
        <Segmented label={label || def.key} value={String(value ?? def.default ?? "")} onChange={onChange} options={(def.options ?? []).map(([v, l]) => ({ value: v, label: tr(l) }))} />
      </div>
    );
  }
  if (def.type === "toggle") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={Boolean(value)} onCheckedChange={onChange} label={label || def.key} />
        {def.key === "trunk" ? `${label} (0)` : label}
      </label>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-ink2">
        {label}
        <input
          type={def.type === "number" ? "number" : "text"}
          dir={def.tel ? "ltr" : "auto"}
          inputMode={def.tel ? "tel" : undefined}
          value={String(value ?? "")}
          onChange={(e) => onChange(def.type === "number" ? Number(e.target.value) : e.target.value)}
          className={`${inputClass} mt-1.5 font-normal`}
        />
      </label>
      {def.tokens ? (
        <div className="flex flex-wrap gap-1">
          {def.tokens.map((token) => (
            <button key={token} type="button" onClick={() => onChange(`${String(value ?? "")}${token}`)} className="rounded-md bg-sunk px-2 py-0.5 text-xs font-semibold text-ink2 hover:bg-line">
              {token}
            </button>
          ))}
        </div>
      ) : null}
      <span className="sr-only">{t("preview")}</span>
    </div>
  );
}

export function BatchDialog() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const open = useApp((s) => s.dialog === "batch");
  const target = useApp((s) => s.batchTarget);
  const close = useApp((s) => s.closeDialog);
  const [op, setOp] = useState<OpDef | null>(null);
  const [params, setParams] = useState<Params>({});
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 500, height: 300 });
  const debounced = useDebounced(params, 200);
  const resolved = useResolvedTheme();
  const gridTheme = useMemo(() => theme(resolved), [resolved]);

  useEffect(() => {
    if (open) {
      setOp(OPS[0] ?? null);
      setParams(OPS[0] ? defaultParams(OPS[0]) : {});
      setPreview(null);
      setProgress(null);
    }
  }, [open]);

  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(() => setSize({ width: host.clientWidth, height: host.clientHeight }));
    observer.observe(host);
    setSize({ width: host.clientWidth, height: host.clientHeight });
    return () => observer.disconnect();
  }, [host, open]);

  useEffect(() => {
    if (!open || !op || !target) return;
    let alive = true;
    void db.batchPreview(target, op.key, debounced, 200).then((p) => alive && setPreview(p));
    return () => {
      alive = false;
    };
  }, [open, op, target, debounced]);

  const choose = (next: OpDef): void => {
    setOp(next);
    setParams(defaultParams(next));
    setPreview(null);
  };

  const apply = async (): Promise<void> => {
    if (!op || !target) return;
    const state = useApp.getState();
    setProgress({ done: 0, total: preview?.total ?? 0 });
    try {
      const outcome = await db.batchApply(target, op.key, params, translate(lang, `op_${op.key}` as keyof Messages) as string, Comlink.proxy((done: number, total: number) => setProgress({ done, total })));
      setProgress(null);
      await state.refresh();
      state.toast(translate(lang, "nChanged", outcome.count), outcome.historyId);
      close();
    } catch (error) {
      setProgress(null);
      await state.refresh();
      state.toast(error instanceof Error ? error.message : String(error), null, "error");
    }
  };

  const ready = op ? op.ready(params) : false;
  const samples = preview?.samples ?? [];
  const columns: GridColumn[] = useMemo(() => [{ id: "before", title: t("before"), width: Math.max(180, size.width / 2 - 24) }, { id: "after", title: t("after"), width: Math.max(180, size.width / 2 - 24) }], [size.width, t]);
  const cell = ([col, row]: Item): GridCell => {
    const s = samples[row];
    const text = s ? (col === 0 ? s.before : s.after) : "";
    return { kind: GridCellKind.Text, data: text, displayData: text, allowOverlay: false, readonly: true, themeOverride: col === 1 ? { textDark: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() } : undefined };
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && !progress && close()}
      dismissible={progress === null}
      title={t("batchEdit")}
      description={t("batchSub")}
      size="xl"
      footer={
        <>
          {preview ? <span className="me-auto text-sm text-muted">{preview.changed > 0 ? t("willChange", preview.changed).replace(/\d[\d,.]*/, formatNumber(lang, preview.changed)) : t("nothingToChange")}</span> : null}
          <Button variant="ghost" onClick={close} disabled={progress !== null}>
            {t("cancel")}
          </Button>
          <Button variant="primary" disabled={!ready || !preview || preview.changed === 0 || progress !== null} onClick={() => void apply()}>
            {preview ? t("saveNChanges", preview.changed).replace(/\d[\d,.]*/, formatNumber(lang, preview.changed)) : t("apply")}
          </Button>
        </>
      }
    >
      <div className="grid h-[68dvh] min-h-[420px] grid-cols-[230px_1fr]">
        <nav className="scroll-thin overflow-auto border-e border-line bg-paper p-2" aria-label={t("operations")}>
          {SECTIONS.map((section) => (
            <div key={section.key} className="mb-3">
              <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{translate(lang, section.label)}</div>
              {OPS.filter((o) => o.section === section.key).map((o) => (
                <button key={o.key} type="button" onClick={() => choose(o)} aria-current={op?.key === o.key} className={cx("block w-full rounded-xl px-2.5 py-2 text-start text-sm font-semibold", op?.key === o.key ? "bg-accent-soft text-accent" : "text-ink2 hover:bg-sunk")}>
                  {translate(lang, `op_${o.key}` as keyof Messages) as string}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-col gap-4 p-5">
          {op ? (
            <div className="grid gap-4 md:grid-cols-2">
              {op.params.map((def) => (
                <ParamField key={def.key} def={def} value={params[def.key]} onChange={(v) => setParams((p) => ({ ...p, [def.key]: v }))} />
              ))}
              {op.params.length === 0 ? <p className="text-sm text-muted">{t("opsSub")}</p> : null}
            </div>
          ) : null}
          <div ref={setHost} className="min-h-[220px] flex-1 overflow-hidden rounded-2xl border border-line">
            {samples.length > 0 ? (
              <DataEditor columns={columns} rows={samples.length} width={size.width} height={size.height} getCellContent={cell} rowMarkers="number" smoothScrollY rowHeight={32} headerHeight={32} theme={gridTheme} gridSelection={{ columns: CompactSelection.empty(), rows: CompactSelection.empty() }} />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">{preview ? t("nothingToChange") : "…"}</div>
            )}
          </div>
          {preview && preview.changed > samples.length ? <p className="text-xs text-muted">{t("andMore", preview.changed - samples.length)}</p> : null}
          {progress ? <ProgressBar value={progress.total ? progress.done / progress.total : 0} /> : null}
        </div>
      </div>
    </Modal>
  );
}

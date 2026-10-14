import { CompactSelection, DataEditor, GridCellKind } from "@glideapps/glide-data-grid";
import type { GridCell, GridColumn, Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../../app/db";
import { formatNumber } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { StageCategory, StageRow } from "../../core/db/staging";
import { Badge, Button, ProgressBar, Segmented, Select, Tab, TabList, Tabs, cx } from "../../ui/primitives";
import { useW } from "./strings";
import { useWizard } from "./wizardStore";

const PAGE = 200;

function useStageRows(category: StageCategory, version: number) {
  const pages = useRef(new Map<number, StageRow[]>());
  const pending = useRef(new Set<number>());
  const [total, setTotal] = useState(0);
  const [tick, setTick] = useState(0);
  const token = useRef(0);

  useEffect(() => {
    pages.current = new Map();
    pending.current = new Set();
    const mine = ++token.current;
    void db.stageList(category, 0, PAGE).then((r) => {
      if (token.current !== mine) return;
      pages.current.set(0, r.rows);
      setTotal(r.total);
      setTick((t) => t + 1);
    });
  }, [category, version]);

  const get = useCallback((index: number): StageRow | undefined => {
    const page = Math.floor(index / PAGE);
    const row = pages.current.get(page)?.[index % PAGE];
    if (!row && !pending.current.has(page) && !pages.current.has(page)) {
      pending.current.add(page);
      const mine = token.current;
      void db.stageList(category, page * PAGE, PAGE).then((r) => {
        pending.current.delete(page);
        if (token.current !== mine) return;
        pages.current.set(page, r.rows);
        setTick((t) => t + 1);
      });
    }
    return row;
  }, [category]);

  return { total, get, tick };
}

function theme(): Record<string, string | number> {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string): string => css.getPropertyValue(n).trim();
  return { bgCell: v("--card"), bgHeader: v("--sunk"), textDark: v("--ink"), textHeader: v("--ink-2"), textMedium: v("--muted"), borderColor: v("--line"), accentColor: v("--accent"), fontFamily: "Manrope, 'IBM Plex Sans Arabic', system-ui, sans-serif", baseFontStyle: "13px", headerFontStyle: "600 12px" };
}

function StageGrid({ category, version, onChanged }: { category: Exclude<StageCategory, "conflict">; version: number; onChanged: () => void }) {
  const w = useW();
  const { total, get, tick } = useStageRows(category, version);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 600, height: 300 });
  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(() => setSize({ width: host.clientWidth, height: host.clientHeight }));
    observer.observe(host);
    setSize({ width: host.clientWidth, height: host.clientHeight });
    return () => observer.disconnect();
  }, [host]);
  const selectable = category === "new" || category === "match";
  const columns: GridColumn[] = [
    ...(selectable ? [{ id: "inc", title: w.include, width: 80 }] : []),
    { id: "name", title: w.colName, width: 200 },
    { id: "phones", title: w.colPhones, width: 220 },
    { id: "emails", title: w.colEmails, width: 200 },
    { id: "company", title: w.colCompany, width: 150 },
    ...(category === "match" ? [{ id: "match", title: w.colMatch, width: 200 }] : []),
    ...(category === "invalid" ? [{ id: "reason", title: w.colReason, width: 220 }] : [])
  ];
  const cell = ([col, rowIndex]: Item): GridCell => {
    void tick;
    const row = get(rowIndex);
    const id = columns[col]?.id;
    if (!row) return { kind: GridCellKind.Loading, allowOverlay: false };
    const text = (d: string): GridCell => ({ kind: GridCellKind.Text, data: d, displayData: d, allowOverlay: false, readonly: true });
    switch (id) {
      case "inc": return { kind: GridCellKind.Boolean, data: row.included, allowOverlay: false };
      case "name": return text(row.name);
      case "phones": return text(row.phones.join("; "));
      case "emails": return text(row.emails.join("; "));
      case "company": return text(row.company);
      case "match": return text(row.matchName);
      case "reason": return text(row.invalidReason === "empty" ? w.reasonEmpty : row.invalidReason);
      default: return text("");
    }
  };
  if (total === 0) return <p className="p-10 text-center text-sm text-muted">{w.nothingHere}</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {selectable ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void db.stageSetCategoryIncluded(category, true).then(onChanged)}>{w.includeAll}</Button>
          <Button size="sm" variant="outline" onClick={() => void db.stageSetCategoryIncluded(category, false).then(onChanged)}>{w.excludeAll}</Button>
        </div>
      ) : null}
      <div ref={setHost} className="min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-line">
        <DataEditor
          columns={columns}
          rows={total}
          width={size.width}
          height={size.height}
          getCellContent={cell}
          onCellEdited={([col, rowIndex], value) => {
            const row = get(rowIndex);
            if (row && columns[col]?.id === "inc" && value.kind === GridCellKind.Boolean) void db.stageSetIncluded([row.seq], Boolean(value.data)).then(onChanged);
          }}
          onVisibleRegionChanged={(r) => {
            get(r.y);
            get(r.y + r.height);
          }}
          rowMarkers="number"
          smoothScrollX
          smoothScrollY
          rowHeight={32}
          headerHeight={32}
          theme={theme()}
          gridSelection={{ columns: CompactSelection.empty(), rows: CompactSelection.empty() }}
        />
      </div>
    </div>
  );
}

function ConflictList({ version, onChanged }: { version: number; onChanged: () => void }) {
  const w = useW();
  const { total, get, tick } = useStageRows("conflict", version);
  if (total === 0) return <p className="p-10 text-center text-sm text-muted">{w.nothingHere}</p>;
  return (
    <ul className="scroll-thin min-h-0 flex-1 space-y-2 overflow-auto" data-tick={tick}>
      {Array.from({ length: Math.min(total, 200) }, (_, i) => get(i)).map((row, i) =>
        row ? (
          <li key={row.seq} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold" dir="auto">{row.name || "—"}</div>
              <div className="truncate text-xs text-muted" dir="auto">{row.phones.join("; ")}</div>
            </div>
            <Select
              value="choose"
              onValueChange={(v) => void db.stageResolveConflict(row.seq, v === "new" ? null : Number(v)).then(onChanged)}
              options={[{ value: "choose", label: w.chooseMatch }, ...row.candidates.map((c) => ({ value: String(c.rowid), label: `${c.name || "—"} · ${c.phone}` })), { value: "new", label: w.addAsNew }]}
              label={w.chooseMatch}
              className="w-72"
            />
          </li>
        ) : (
          <li key={i} className="h-14 animate-pulse rounded-2xl bg-sunk" />
        )
      )}
    </ul>
  );
}

export function StepReview() {
  const w = useW();
  const lang = useApp((s) => s.lang);
  const parsing = useWizard((s) => s.parsing);
  const progress = useWizard((s) => s.progress);
  const summary = useWizard((s) => s.summary);
  const error = useWizard((s) => s.parseError);
  const version = useWizard((s) => s.version);
  const mode = useWizard((s) => s.mode);
  const mergeMode = useWizard((s) => s.mergeMode);
  const setMode = useWizard((s) => s.setMode);
  const setMergeMode = useWizard((s) => s.setMergeMode);
  const bump = useWizard((s) => s.bump);
  const cancel = useWizard((s) => s.cancelParse);
  const [tab, setTab] = useState<StageCategory>("new");
  const n = (v: number): string => formatNumber(lang, v);

  const refreshSummary = useCallback(async () => {
    useWizard.setState({ summary: await db.stageSummary() });
    bump();
  }, [bump]);

  useEffect(() => {
    if (summary && tab === "new" && summary.newContacts === 0) setTab(summary.matches > 0 ? "match" : summary.conflicts > 0 ? "conflict" : "new");
  }, [summary, tab]);

  const eta = (s: number | null): string => (s === null ? "" : s < 60 ? `${Math.max(1, Math.round(s))}s` : `${Math.round(s / 60)}m`);

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-xl p-10 text-center">
        <div className="serif text-2xl text-danger">{w.stepFailed}</div>
        <p className="mt-2 text-sm text-ink2">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => useWizard.getState().goto(2)}>{w.back}</Button>
      </div>
    );
  }

  if (parsing || !summary) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-10">
        <div className="serif text-3xl">{w.parsing}</div>
        <ProgressBar value={progress?.fraction ?? 0} />
        <div className="flex flex-wrap items-center gap-x-4 text-sm text-muted" aria-live="polite">
          <span>{w.rowsDone(n(progress?.rows ?? 0))}</span>
          <span>{w.perSecond(n(Math.round(progress?.rowsPerSecond ?? 0)))}</span>
          {progress?.etaSeconds ? <span>{w.remaining(eta(progress.etaSeconds))}</span> : null}
        </div>
        <div>
          <Button variant="outline" onClick={() => void cancel()}>{w.cancelParse}</Button>
        </div>
      </div>
    );
  }

  const cards: Array<{ label: string; value: number; tone: string }> = [
    { label: w.cards.new, value: summary.newContacts, tone: "text-good" },
    { label: w.cards.match, value: summary.matches, tone: "text-accent" },
    { label: w.cards.conflicts, value: summary.conflicts, tone: "text-danger" },
    { label: w.cards.dup, value: summary.dupInFile, tone: "text-ink2" },
    { label: w.cards.invalid, value: summary.invalid, tone: "text-ink2" },
    { label: w.cards.reformatted, value: summary.reformatted, tone: "text-ink2" }
  ];
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-line bg-card p-3">
            <div className={cx("serif text-3xl leading-none", c.tone)}>{n(c.value)}</div>
            <div className="mt-1.5 text-[11px] font-semibold leading-tight text-muted">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: "add", label: w.modeAdd }, { value: "update", label: w.modeUpdate }]} />
        {mode === "update" ? <Select value={mergeMode} onValueChange={setMergeMode} options={[{ value: "fillEmpty", label: w.mergeFill }, { value: "overwrite", label: w.mergeOverwrite }, { value: "addNumbers", label: w.mergeAddNumbers }]} label={w.mergeMode} className="w-44" /> : null}
        <p className="min-w-60 flex-1 text-xs text-muted">{w.modeHint}</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as StageCategory)} className="flex min-h-0 flex-1 flex-col">
        <TabList>
          <Tab value="new" badge={<Badge>{n(summary.newContacts)}</Badge>}>{w.tabNew}</Tab>
          <Tab value="match" badge={<Badge tone="accent">{n(summary.matches)}</Badge>}>{w.tabMatch}</Tab>
          <Tab value="conflict" badge={<Badge tone={summary.conflicts ? "danger" : "neutral"}>{n(summary.conflicts)}</Badge>}>{w.tabConflicts}</Tab>
          <Tab value="dupInFile" badge={<Badge>{n(summary.dupInFile)}</Badge>}>{w.tabDup}</Tab>
          <Tab value="invalid" badge={<Badge>{n(summary.invalid)}</Badge>}>{w.tabInvalid}</Tab>
        </TabList>
        <div className="flex min-h-0 flex-1 flex-col pt-3">
          {tab === "conflict" ? <ConflictList version={version} onChanged={() => void refreshSummary()} /> : <StageGrid key={tab} category={tab} version={version} onChanged={() => void refreshSummary()} />}
        </div>
      </Tabs>
    </div>
  );
}

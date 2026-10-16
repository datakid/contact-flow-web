import { ArrowDownAZ, LayoutList, Table2 } from "lucide-react";
import { useT } from "../../app/i18n";
import { formatNumber } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { SortKey } from "../../core/types";
import { Checkbox, Select, Segmented } from "../../ui/primitives";
import { BulkBar } from "./BulkBar";
import { ListView, filterTitle } from "./ListPane";
import { TableView } from "./TableView";
import { useLibraryList } from "./useLibraryList";

export function MiddlePane() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const filter = useApp((s) => s.filter);
  const sort = useApp((s) => s.sort);
  const view = useApp((s) => s.view);
  const setSort = useApp((s) => s.setSort);
  const setView = useApp((s) => s.setView);
  const groups = useApp((s) => s.counts?.groups ?? []);
  const list = useLibraryList();
  const allMatching = useApp((s) => s.allMatching);
  const selectedCount = useApp((s) => s.selected.size);
  const excludedCount = useApp((s) => s.excluded.size);
  const selectAllMatching = useApp((s) => s.selectAllMatching);
  const clearSelection = useApp((s) => s.clearSelection);
  const headerChecked: boolean | "indeterminate" = allMatching ? (excludedCount > 0 ? "indeterminate" : true) : selectedCount > 0 ? "indeterminate" : false;
  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: "nameAsc", label: t("sortAZ") },
    { value: "nameDesc", label: t("sortZA") },
    { value: "added", label: t("sortAdded") },
    { value: "edited", label: t("sortEdited") },
    { value: "company", label: t("sortCompany") }
  ];
  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-paper" aria-label={filterTitle(filter, groups, t)}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        {list.total > 0 ? <Checkbox checked={headerChecked} onClick={() => (headerChecked === true ? clearSelection() : selectAllMatching())} label={t("selectAll")} /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="serif truncate text-2xl leading-tight">{filterTitle(filter, groups, t)}</h1>
          <div className="text-xs text-muted">{t("nContacts", list.total).replace(/^\d[\d,.\s]*/, `${formatNumber(lang, list.total)} `)}</div>
          {list.searching && list.matchTotal > list.total ? <div className="text-xs text-muted">{t("showingFirstOf", list.total, list.matchTotal)}</div> : null}
        </div>
        <Select value={sort} onValueChange={setSort} options={sortOptions} label={t("sort")} className="w-40" />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: <LayoutList size={14} aria-label={t("listView")} />, title: `${t("listView")} (Ctrl+1)` },
            { value: "table", label: <Table2 size={14} aria-label={t("tableView")} />, title: `${t("tableView")} (Ctrl+2)` }
          ]}
        />
      </header>
      {view === "list" ? <ListView list={list} /> : <TableView list={list} />}
      <BulkBar list={list} />
      <span className="sr-only" aria-live="polite">
        <ArrowDownAZ size={0} />
        {list.total}
      </span>
    </section>
  );
}

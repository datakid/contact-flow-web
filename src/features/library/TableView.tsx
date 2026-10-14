import { CompactSelection, DataEditor, GridCellKind } from "@glideapps/glide-data-grid";
import type { EditableGridCell, GridCell, GridColumn, GridSelection, Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { Columns3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { contactToInput, saveContactInput } from "../../app/actions";
import { db } from "../../app/db";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { Contact, ContactRow } from "../../core/types";
import { Checkbox, IconButton, Popover, PopoverContent, PopoverTrigger } from "../../ui/primitives";
import type { LibraryList } from "./useLibraryList";

type ColumnId = "star" | "name" | "phones" | "emails" | "company" | "groups" | "aliases" | "note" | "updated";

const ALL_COLUMNS: ColumnId[] = ["star", "name", "phones", "emails", "company", "groups", "aliases", "note", "updated"];
const WIDTHS_KEY = "cf3.table";

interface TablePrefs {
  order: ColumnId[];
  hidden: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
}

function loadPrefs(): TablePrefs {
  try {
    const raw = localStorage.getItem(WIDTHS_KEY);
    if (raw) return { order: ALL_COLUMNS, hidden: [], widths: {}, ...(JSON.parse(raw) as Partial<TablePrefs>) };
  } catch {
    return { order: ALL_COLUMNS, hidden: [], widths: {} };
  }
  return { order: ALL_COLUMNS, hidden: ["aliases", "note"], widths: {} };
}

function cellTheme(): Record<string, string | number> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string): string => css.getPropertyValue(name).trim();
  return {
    bgCell: v("--card"),
    bgHeader: v("--sunk"),
    bgHeaderHasFocus: v("--sunk"),
    bgHeaderHovered: v("--line"),
    textDark: v("--ink"),
    textHeader: v("--ink-2"),
    textMedium: v("--muted"),
    textLight: v("--faint"),
    borderColor: v("--line"),
    accentColor: v("--accent"),
    accentLight: v("--accent-soft"),
    accentFg: "#ffffff",
    fontFamily: "Manrope, 'IBM Plex Sans Arabic', system-ui, sans-serif",
    baseFontStyle: "13px",
    headerFontStyle: "600 12px",
    cellHorizontalPadding: 10
  };
}

export function TableView({ list }: { list: LibraryList }) {
  const t = useT();
  const theme = useApp((s) => s.theme);
  const lang = useApp((s) => s.lang);
  const selected = useApp((s) => s.selected);
  const [prefs, setPrefs] = useState<TablePrefs>(loadPrefs);
  const [details, setDetails] = useState<Map<string, Contact>>(new Map());
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(prefs));
    } catch {
      return;
    }
  }, [prefs]);

  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(() => setSize({ width: host.clientWidth, height: host.clientHeight }));
    observer.observe(host);
    setSize({ width: host.clientWidth, height: host.clientHeight });
    return () => observer.disconnect();
  }, [host]);

  const visible = useMemo(() => prefs.order.filter((c) => !prefs.hidden.includes(c)), [prefs]);
  const titles: Record<ColumnId, string> = { star: "★", name: t("name"), phones: t("phones"), emails: t("emails"), company: t("company"), groups: t("groups"), aliases: t("aliases"), note: t("note"), updated: t("updated") };
  const defaults: Record<ColumnId, number> = { star: 44, name: 200, phones: 180, emails: 200, company: 150, groups: 140, aliases: 140, note: 200, updated: 120 };
  const columns: GridColumn[] = visible.map((id) => ({ id, title: titles[id], width: prefs.widths[id] ?? defaults[id] }));

  const need = useCallback(
    async (row: ContactRow): Promise<void> => {
      if (details.has(row.id)) return;
      const contact = await db.getContact(row.id);
      if (contact) setDetails((m) => new Map(m).set(row.id, contact));
    },
    [details]
  );

  const getCell = useCallback(
    ([col, rowIndex]: Item): GridCell => {
      list.ensure(rowIndex);
      const row = list.getRow(rowIndex);
      const id = visible[col];
      if (!row || !id) return { kind: GridCellKind.Loading, allowOverlay: false };
      const full = details.get(row.id);
      if (!full && id !== "star" && id !== "name" && id !== "company" && id !== "updated") void need(row);
      const text = (data: string, readonly = false): GridCell => ({ kind: GridCellKind.Text, data, displayData: data, allowOverlay: !readonly, readonly });
      switch (id) {
        case "star": return { kind: GridCellKind.Boolean, data: row.starred, allowOverlay: false };
        case "name": return text(row.name);
        case "company": return text(row.company);
        case "updated": return text(new Date(row.updatedAt).toLocaleDateString(lang === "ar" ? "ar" : undefined), true);
        case "phones": return text(full ? full.phones.map((p) => p.value).join("; ") : row.primaryPhone);
        case "emails": return text(full ? full.emails.map((e) => e.value).join("; ") : "");
        case "groups": return text(full ? full.groups.join("; ") : "", true);
        case "aliases": return text(full ? full.aliases.join("; ") : "");
        case "note": return text(full ? full.note : "");
      }
    },
    [list, visible, details, need, lang]
  );

  const onCellEdited = useCallback(
    async ([col, rowIndex]: Item, value: EditableGridCell): Promise<void> => {
      const row = list.getRow(rowIndex);
      const id = visible[col];
      if (!row || !id) return;
      const base = details.get(row.id) ?? (await db.getContact(row.id));
      if (!base) return;
      const input = contactToInput(base);
      const splitList = (s: string): string[] => s.split(/[;؛]/).map((x) => x.trim()).filter(Boolean);
      if (id === "star" && value.kind === GridCellKind.Boolean) input.starred = Boolean(value.data);
      else if (value.kind === GridCellKind.Text) {
        const data = value.data;
        if (id === "name") input.name = data;
        else if (id === "company") input.company = data;
        else if (id === "note") input.note = data;
        else if (id === "aliases") input.aliases = splitList(data);
        else if (id === "phones") input.phones = splitList(data).map((v, i) => ({ value: v, label: base.phones[i]?.label ?? "mobile" }));
        else if (id === "emails") input.emails = splitList(data).map((v, i) => ({ value: v, label: base.emails[i]?.label ?? "work" }));
      } else return;
      const saved = await saveContactInput(input);
      if (saved) setDetails((m) => new Map(m).set(saved.id, saved));
    },
    [list, visible, details]
  );

  const gridSelection = useMemo<GridSelection>(() => {
    let rows = CompactSelection.empty();
    if (selected.size > 1000) return { columns: CompactSelection.empty(), rows };
    for (const id of selected) {
      const index = list.indexOfId(id);
      if (index >= 0) rows = rows.add(index);
    }
    return { columns: CompactSelection.empty(), rows };
  }, [selected, list, list.generation]);

  const onGridSelectionChange = useCallback(
    (sel: GridSelection) => {
      const ids = new Set<string>();
      for (const index of sel.rows) {
        const row = list.getRow(index);
        if (row) ids.add(row.id);
      }
      const state = useApp.getState();
      if (ids.size !== state.selected.size || [...ids].some((id) => !state.selected.has(id))) state.setSelected(ids);
      const current = sel.current?.cell[1];
      if (current !== undefined) {
        const row = list.getRow(current);
        if (row && row.id !== state.focusedId) state.setFocused(row.id);
      }
    },
    [list]
  );

  const sortKey = useApp((s) => s.sort);
  const setSort = useApp((s) => s.setSort);

  const moveColumn = (from: number, to: number): void => {
    const moved = visible[from];
    if (!moved) return;
    const next = prefs.order.filter((c) => c !== moved);
    const anchor = visible[to];
    const at = anchor ? next.indexOf(anchor) + (to > from ? 1 : 0) : next.length;
    next.splice(at, 0, moved);
    setPrefs({ ...prefs, order: next });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-xs text-muted">{list.total.toLocaleString()}</span>
        <Popover>
          <PopoverTrigger asChild>
            <IconButton label="Columns">
              <Columns3 size={16} />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52">
            <div className="flex flex-col gap-2">
              {ALL_COLUMNS.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!prefs.hidden.includes(id)} onCheckedChange={(on) => setPrefs({ ...prefs, hidden: on ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id] })} label={titles[id]} />
                  {id === "star" ? t("starred") : titles[id]}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div ref={setHost} className="min-h-0 flex-1" key={theme}>
        <DataEditor
          columns={columns}
          rows={list.total}
          width={size.width}
          height={size.height}
          getCellContent={getCell}
          onCellEdited={(cell, value) => void onCellEdited(cell, value)}
          gridSelection={gridSelection}
          onGridSelectionChange={onGridSelectionChange}
          rowMarkers="checkbox"
          rowSelect="multi"
          rowSelectionMode="multi"
          columnSelect="none"
          onColumnResize={(col, width) => {
            const id = col.id as ColumnId | undefined;
            if (id) setPrefs((p) => ({ ...p, widths: { ...p.widths, [id]: width } }));
          }}
          onColumnMoved={moveColumn}
          onHeaderClicked={(colIndex) => {
            const id = visible[colIndex];
            if (id === "name") setSort(sortKey === "nameAsc" ? "nameDesc" : "nameAsc");
            else if (id === "company") setSort("company");
            else if (id === "updated") setSort("edited");
          }}
          smoothScrollX
          smoothScrollY
          rowHeight={36}
          headerHeight={36}
          theme={cellTheme()}
          onVisibleRegionChanged={(range) => {
            list.ensure(range.y);
            list.ensure(range.y + range.height);
          }}
        />
      </div>
    </div>
  );
}

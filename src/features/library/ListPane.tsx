import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, EllipsisVertical, Pencil, Star, StickyNote } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { addToGroup, copyText, deleteSelection, findDuplicatesOf, messageUrl, shareVCard, toggleStar } from "../../app/actions";
import { db } from "../../app/db";
import { translate, useT } from "../../app/i18n";
import type { TFunction } from "../../app/i18n";
import { useApp } from "../../app/store";
import { fold, highlightRanges, tokens } from "../../core/fold";
import type { ContactRow, LibraryFilter, MatchTag } from "../../core/types";
import { Avatar, Badge, Checkbox, ContextMenu, DropdownMenu, IconButton, Spinner, cx } from "../../ui/primitives";
import type { MenuEntry } from "../../ui/primitives";
import { setListController } from "./controller";
import type { LibraryList } from "./useLibraryList";

const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 30;

const ARABIC_RAIL = ["ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي", "#"];
const LATIN_RAIL = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

export function filterTitle(filter: LibraryFilter, groups: Array<{ id: number; name: string }>, t: TFunction): string {
  switch (filter.kind) {
    case "all": return t("allContacts");
    case "starred": return t("starred");
    case "recentlyAdded": return t("recentlyAdded");
    case "recentlyEdited": return t("recentlyEdited");
    case "noNumber": return t("noNumber");
    case "noName": return t("noName");
    case "duplicates": return t("duplicates");
    case "group": return groups.find((g) => g.id === filter.groupId)?.name ?? t("groups");
    case "importBatch": return t("importTitle");
  }
}

const TAG_KEYS: Record<MatchTag, "tagExact" | "tagStarts" | "tagContains" | "tagAlias" | "tagNumber" | "tagClose" | "tagSounds" | "tagPinyin" | "tagTranslit"> = {
  exact: "tagExact",
  startsWith: "tagStarts",
  contains: "tagContains",
  alias: "tagAlias",
  number: "tagNumber",
  close: "tagClose",
  sounds: "tagSounds",
  pinyin: "tagPinyin",
  transliterated: "tagTranslit"
};

function Highlighted({ text, hits }: { text: string; hits: string[] }) {
  if (hits.length === 0 || !text) return <>{text}</>;
  const ranges = highlightRanges(text, hits);
  if (ranges.length === 0) return <>{text}</>;
  const parts: Array<string | { mark: string }> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push({ mark: text.slice(start, end) });
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return (
    <>
      {parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <mark key={i} className="hl">{p.mark}</mark>))}
    </>
  );
}

interface RowProps {
  row: ContactRow;
  index: number;
  hits: string[];
  focused: boolean;
  selected: boolean;
  anySelected: boolean;
  onActivate: (row: ContactRow, index: number, event: React.MouseEvent) => void;
  onToggle: (row: ContactRow, index: number, shift: boolean) => void;
  onEdit: (row: ContactRow) => void;
}

const MAX_RANGE = 1000;

async function selectRange(list: LibraryList, anchor: number, index: number): Promise<void> {
  const state = useApp.getState();
  const from = Math.min(anchor, index);
  const to = Math.min(Math.max(anchor, index), from + MAX_RANGE - 1);
  if (Math.max(anchor, index) > to) state.toast(translate(state.lang, "rangeTooLarge"));
  await list.ensureRange(from, to);
  const ids = new Set(state.selected);
  for (let i = from; i <= to; i++) {
    const r = list.getRow(i);
    if (r) ids.add(r.id);
  }
  state.setSelected(ids);
}

function useRowMenu(row: ContactRow): () => MenuEntry[] {
  const t = useT();
  const groups = useApp((s) => s.counts?.groups ?? []);
  const state = useApp;
  return useCallback((): MenuEntry[] => {
    const withContact = async (fn: (c: NonNullable<Awaited<ReturnType<typeof db.getContact>>>) => void | Promise<void>): Promise<void> => {
      const c = await db.getContact(row.id);
      if (c) await fn(c);
    };
    const firstNumber = row.primaryPhone;
    return [
      { key: "open", label: t("open"), onSelect: () => state.getState().setFocused(row.id) },
      { key: "edit", label: t("edit"), onSelect: () => { state.getState().setFocused(row.id); state.setState({ editingId: row.id }); } },
      { key: "star", label: row.starred ? t("unstar") : t("star"), onSelect: () => void toggleStar(row) },
      { key: "sep1", label: "", separator: true },
      { key: "copyNumber", label: t("copyNumber"), disabled: !firstNumber, onSelect: () => void copyText(firstNumber) },
      { key: "copyAll", label: t("copyAll"), onSelect: () => void withContact((c) => copyText([c.name, ...c.phones.map((p) => p.value), ...c.emails.map((e) => e.value)].filter(Boolean).join("\n"))) },
      {
        key: "group",
        label: t("addToGroup"),
        disabled: groups.length === 0,
        children: groups.map((g) => ({ key: `g${g.id}`, label: g.name, onSelect: () => void addToGroup({ kind: "ids", ids: [row.id] }, g.id) }))
      },
      { key: "share", label: t("shareVcard"), onSelect: () => void withContact(shareVCard) },
      {
        key: "message",
        label: t("message"),
        disabled: !firstNumber,
        children: (["whatsapp", "signal", "sms"] as const).map((channel) => ({ key: channel, label: t(channel), onSelect: () => window.open(messageUrl(channel, firstNumber), "_blank", "noopener") }))
      },
      { key: "dups", label: t("findDuplicatesOf"), onSelect: () => void withContact(findDuplicatesOf) },
      { key: "sep2", label: "", separator: true },
      { key: "delete", label: t("delete"), danger: true, onSelect: () => state.getState().openDialog("confirmDelete", { kind: "ids", ids: [row.id] }) }
    ];
  }, [row, groups, t, state]);
}

const ContactRowView = memo(function ContactRowView({ row, index, hits, focused, selected, anySelected, onActivate, onToggle, onEdit }: RowProps) {
  const t = useT();
  const menu = useRowMenu(row);
  const second = [row.primaryPhone, row.company].filter(Boolean).join(" · ");
  return (
    <ContextMenu entries={menu}>
      <div
        role="option"
        aria-selected={focused}
        data-row-id={row.id}
        draggable
        onDragStart={(e) => {
          const state = useApp.getState();
          const ids = state.selected.has(row.id) ? [...state.selected] : [row.id];
          e.dataTransfer.setData("application/x-cf-ids", JSON.stringify(ids));
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={(e) => onActivate(row, index, e)}
        className={cx("group relative flex h-14 cursor-default items-center gap-3 border-b border-line/60 px-3", focused ? "bg-accent-soft" : selected ? "bg-sunk" : "hover:bg-sunk/70")}
      >
        <div className="relative grid size-10 shrink-0 place-items-center">
          <div className={cx("transition-opacity", anySelected || selected ? "opacity-0" : "group-hover:opacity-0")}>
            <Avatar name={row.name} seed={row.id} />
          </div>
          <div className={cx("absolute inset-0 grid place-items-center transition-opacity", anySelected || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100")} onClick={(e) => { e.stopPropagation(); onToggle(row, index, e.shiftKey); }}>
            <Checkbox checked={selected} onCheckedChange={() => undefined} label={row.name} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold text-ink">{row.name ? <Highlighted text={row.name} hits={hits} /> : <span className="font-medium text-faint">{t("noName")}</span>}</span>
            {row.starred ? <Star size={12} className="shrink-0 fill-accent text-accent" aria-label={t("starred")} /> : null}
          </div>
          <div className="truncate text-xs text-muted" dir="auto">
            {second || "—"}
            {row.matchTag === "alias" && row.matchAlias ? <span className="ms-2 text-accent">{t("aka")} {row.matchAlias}</span> : null}
          </div>
        </div>
        {row.matchTag ? <Badge tone={row.matchTag === "exact" || row.matchTag === "startsWith" ? "accent" : "neutral"}>{t(TAG_KEYS[row.matchTag])}</Badge> : null}
        <div className="absolute inset-y-0 end-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [&>*]:bg-card/90">
          <IconButton label={row.starred ? t("unstar") : t("star")} active={row.starred} onClick={(e) => { e.stopPropagation(); void toggleStar(row); }}>
            <Star size={15} className={row.starred ? "fill-accent" : ""} />
          </IconButton>
          <IconButton label={t("copyNumber")} disabled={!row.primaryPhone} onClick={(e) => { e.stopPropagation(); void copyText(row.primaryPhone); }}>
            <Copy size={15} />
          </IconButton>
          <IconButton label={t("edit")} onClick={(e) => { e.stopPropagation(); onEdit(row); }}>
            <Pencil size={15} />
          </IconButton>
          <DropdownMenu
            trigger={
              <IconButton label="More" onClick={(e) => e.stopPropagation()}>
                <EllipsisVertical size={15} />
              </IconButton>
            }
            entries={menu()}
          />
        </div>
      </div>
    </ContextMenu>
  );
});

export function ListView({ list }: { list: LibraryList }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const sort = useApp((s) => s.sort);
  const search = useApp((s) => s.search);
  const focusedId = useApp((s) => s.focusedId);
  const selected = useApp((s) => s.selected);
  const allMatching = useApp((s) => s.allMatching);
  const parentRef = useRef<HTMLDivElement>(null);
  const hasLetters = !list.searching && list.letters.length > 0 && (sort === "nameAsc" || sort === "nameDesc");
  const starts = useMemo(() => list.letters.map((l, k) => l.offset + k), [list.letters]);

  const itemCount = hasLetters ? list.total + list.letters.length : list.total;
  const resolve = useCallback(
    (item: number): { header: number } | { row: number } => {
      if (!hasLetters) return { row: item };
      let lo = 0;
      let hi = starts.length - 1;
      let k = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if ((starts[mid] ?? 0) <= item) {
          k = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return item === starts[k] ? { header: k } : { row: item - (k + 1) };
    },
    [hasLetters, starts]
  );

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => ("header" in resolve(i) ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 12
  });
  const items = virtualizer.getVirtualItems();

  useEffect(() => {
    for (const item of items) {
      const r = resolve(item.index);
      if ("row" in r) list.ensure(r.row);
    }
  }, [items, resolve, list]);

  const hits = useMemo(() => (search.trim() ? tokens(fold(search)) : []), [search]);

  const rowToItem = useCallback(
    (row: number): number => {
      if (!hasLetters) return row;
      let k = 0;
      for (let i = 0; i < list.letters.length; i++) if ((list.letters[i]?.offset ?? 0) <= row) k = i;
      return row + k + 1;
    },
    [hasLetters, list.letters]
  );

  useEffect(() => {
    setListController({
      getRow: list.getRow,
      total: () => list.total,
      ensureRange: list.ensureRange,
      scrollToIndex: (row) => virtualizer.scrollToIndex(rowToItem(row), { align: "auto" }),
      indexOfId: list.indexOfId
    });
    return () => setListController(null);
  }, [list, virtualizer, rowToItem]);

  const onActivate = useCallback(
    (row: ContactRow, index: number, event: React.MouseEvent) => {
      const state = useApp.getState();
      if (event.metaKey || event.ctrlKey) {
        state.toggleSelected(row.id, index);
        return;
      }
      if (event.shiftKey && state.anchorIndex !== null) {
        void selectRange(list, state.anchorIndex, index);
        return;
      }
      state.setFocused(row.id);
    },
    [list]
  );

  const onToggle = useCallback(
    (row: ContactRow, index: number, shift: boolean) => {
      const state = useApp.getState();
      if (shift && state.anchorIndex !== null) {
        void selectRange(list, state.anchorIndex, index);
        return;
      }
      state.toggleSelected(row.id, index);
    },
    [list]
  );

  const onEdit = useCallback((row: ContactRow) => {
    useApp.getState().setFocused(row.id);
    useApp.setState({ editingId: row.id });
  }, []);

  const firstItem = items[0];
  const stickyLetter = (() => {
    if (!hasLetters || !firstItem) return null;
    const r = resolve(firstItem.index);
    if ("header" in r) return list.letters[r.header]?.letter ?? null;
    return list.getRow(r.row)?.firstLetter ?? null;
  })();

  const rail = lang === "ar" ? ARABIC_RAIL : LATIN_RAIL;
  const present = new Map(list.letters.map((l, k) => [l.letter, k]));
  const jumpTo = (letter: string): void => {
    let k = present.get(letter);
    if (k === undefined) {
      const at = rail.indexOf(letter);
      for (let i = at + 1; i < rail.length && k === undefined; i++) k = present.get(rail[i] ?? "");
    }
    if (k === undefined) k = list.letters.length - 1;
    if (k >= 0) virtualizer.scrollToIndex(starts[k] ?? 0, { align: "start" });
  };

  if (list.loading && list.total === 0) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner size={22} />
      </div>
    );
  }

  if (!list.loading && list.total === 0) {
    return (
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div>
          <StickyNote className="mx-auto mb-3 text-faint" size={30} />
          <div className="serif text-2xl">{search.trim() ? t("noResults") : t("emptyTitle")}</div>
          <p className="mt-1 text-sm text-muted">{search.trim() ? t("noResultsBody") : t("emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div ref={parentRef} role="listbox" aria-multiselectable="true" className="scroll-thin relative min-h-0 flex-1 overflow-auto">
        {stickyLetter ? <div className="serif pointer-events-none sticky top-0 z-10 -mb-[30px] h-[30px] bg-paper/95 px-4 text-lg leading-[30px] text-accent backdrop-blur">{stickyLetter}</div> : null}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {items.map((item) => {
            const r = resolve(item.index);
            const style: React.CSSProperties = { position: "absolute", insetBlockStart: 0, insetInlineStart: 0, width: "100%", height: item.size, transform: `translateY(${item.start}px)` };
            if ("header" in r) {
              return (
                <div key={`h${item.index}`} style={style} className="serif flex items-end bg-paper px-4 pb-0.5 text-lg text-accent">
                  {list.letters[r.header]?.letter}
                </div>
              );
            }
            const row = list.getRow(r.row);
            if (!row) {
              return (
                <div key={`s${item.index}`} style={style} className="flex items-center gap-3 border-b border-line/60 px-3">
                  <div className="size-10 animate-pulse rounded-full bg-sunk" />
                  <div className="h-3 w-40 animate-pulse rounded bg-sunk" />
                </div>
              );
            }
            return (
              <div key={row.id} style={style}>
                <ContactRowView row={row} index={r.row} hits={hits} focused={focusedId === row.id} selected={allMatching || selected.has(row.id)} anySelected={allMatching || selected.size > 0} onActivate={onActivate} onToggle={onToggle} onEdit={onEdit} />
              </div>
            );
          })}
        </div>
      </div>
      {hasLetters ? (
        <div className="flex w-5 shrink-0 select-none flex-col items-center justify-between py-1 text-[10px] font-bold text-muted" aria-hidden="true">
          {rail.map((letter) => (
            <button key={letter} type="button" tabIndex={-1} onClick={() => jumpTo(letter)} className={cx("w-full leading-none hover:text-accent", present.has(letter) ? "text-ink2" : "text-faint/60")}>
              {letter}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

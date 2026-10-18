import { useEffect, useRef } from "react";
import { Download, FolderMinus, FolderPlus, GitMerge, MessageSquare, SquarePen, Star, StarOff, Trash2, X } from "lucide-react";
import { addToGroup, removeFromGroup, setStarred } from "../../app/actions";
import { usePresence } from "../../app/hooks";
import { formatNumber, useT } from "../../app/i18n";
import { EMPTY_GROUPS, useApp } from "../../app/store";
import { Button, DropdownMenu, IconButton, Spinner } from "../../ui/primitives";
import type { MenuEntry } from "../../ui/primitives";
import { db } from "../../app/db";
import { useSelectionCount } from "../../app/useSelectionCount";
import type { LibraryList } from "./useLibraryList";

export function BulkBar({ list }: { list: LibraryList }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const selected = useApp((s) => s.selected);
  const allMatching = useApp((s) => s.allMatching);
  const groups = useApp((s) => s.counts?.groups ?? EMPTY_GROUPS);
  const filter = useApp((s) => s.filter);
  useApp((s) => s.search);
  const mergingRef = useRef(false);
  const state = useApp.getState();
  const matching = useSelectionCount(allMatching ? state.currentSelection() : null);
  const count = allMatching ? matching : selected.size;
  const visible = count !== 0;
  const presence = usePresence(visible);
  const lastCount = useRef<number | null>(count);
  if (visible) lastCount.current = count;
  const shownCount = visible ? count : lastCount.current;
  useEffect(() => {
    useApp.getState().setBulkBarVisible(visible);
    return () => useApp.getState().setBulkBarVisible(false);
  }, [visible]);
  if (!presence.mounted) return null;
  const selection = () => state.currentSelection();
  const groupEntries = (fn: (id: number) => void): MenuEntry[] => groups.map((g) => ({ key: `g${g.id}`, label: g.name, onSelect: () => fn(g.id) }));
  const canSelectAll = !allMatching && list.matchTotal > selected.size;
  const mergeEnabled = !allMatching && selected.size >= 2 && selected.size <= 10;
  const onMerge = async (): Promise<void> => {
    if (mergingRef.current) return;
    mergingRef.current = true;
    try {
      const ids = [...selected];
      const contacts = await Promise.all(ids.map((id) => db.getContact(id)));
      const present = contacts.filter((c): c is NonNullable<typeof c> => c !== null);
      const keep = [...present].sort((a, b) => b.phones.length + b.emails.length - (a.phones.length + a.emails.length))[0];
      if (!keep) return;
      const merged = await db.mergeGroup(keep.id, ids, t("merged", ids.length));
      state.clearSelection();
      state.setFocused(keep.id);
      await state.refresh();
      state.toast(t("merged", ids.length), merged.historyId);
    } catch (error) {
      state.toast(error instanceof Error ? error.message : String(error), null, "error");
    } finally {
      mergingRef.current = false;
    }
  };
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-card px-2 py-1.5 shadow-[var(--shadow)] anim-bar scroll-thin" data-state={presence.state}>
        <span className="px-2 text-sm font-bold whitespace-nowrap">{shownCount === null ? <Spinner size={14} /> : t("nSelectedBar", shownCount).replace(/^[\d,.\s]+/, `${formatNumber(lang, shownCount)}`)}</span>
        {canSelectAll ? (
          <Button size="sm" variant="soft" onClick={() => state.selectAllMatching()}>
            {t("selectAllMatching", list.matchTotal)}
          </Button>
        ) : null}
        <IconButton label={t("star")} onClick={() => void setStarred(selection(), true)}>
          <Star size={16} />
        </IconButton>
        <IconButton label={t("unstar")} onClick={() => void setStarred(selection(), false)}>
          <StarOff size={16} />
        </IconButton>
        <DropdownMenu trigger={<IconButton label={t("addToGroup")} disabled={groups.length === 0}><FolderPlus size={16} /></IconButton>} entries={groupEntries((id) => void addToGroup(selection(), id))} align="start" />
        {filter.kind === "group" ? (
          <IconButton label={t("removeFromGroup")} onClick={() => void removeFromGroup(selection(), filter.groupId)}>
            <FolderMinus size={16} />
          </IconButton>
        ) : (
          <DropdownMenu trigger={<IconButton label={t("removeFromGroup")} disabled={groups.length === 0}><FolderMinus size={16} /></IconButton>} entries={groupEntries((id) => void removeFromGroup(selection(), id))} align="start" />
        )}
        <IconButton label={t("batchEdit")} onClick={() => state.openDialog("batch", selection())}>
          <SquarePen size={16} />
        </IconButton>
        <IconButton label={t("export")} onClick={() => state.openDialog("export", selection())}>
          <Download size={16} />
        </IconButton>
        <IconButton label={t("messages")} onClick={() => state.openDialog("queue", selection())}>
          <MessageSquare size={16} />
        </IconButton>
        {mergeEnabled ? (
          <IconButton label={t("mergeAction")} onClick={() => void onMerge()}>
            <GitMerge size={16} />
          </IconButton>
        ) : null}
        <IconButton label={t("delete")} onClick={() => state.openDialog("confirmDelete", selection())} className="text-danger hover:text-danger">
          <Trash2 size={16} />
        </IconButton>
        <IconButton label={t("clearSelection")} onClick={() => state.clearSelection()}>
          <X size={16} />
        </IconButton>
      </div>
    </div>
  );
}

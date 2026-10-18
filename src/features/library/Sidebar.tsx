import { Clock, Copy, FolderOpen, History, MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Settings, SquarePen, Star, UserX, Phone, Library } from "lucide-react";
import { useRef, useState } from "react";
import { addToGroup, createGroupNamed } from "../../app/actions";
import { db } from "../../app/db";
import { formatNumber, useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { GroupInfo, LibraryFilter } from "../../core/types";
import { Badge, ContextMenu, IconButton, Spinner, cx } from "../../ui/primitives";
import type { MenuEntry } from "../../ui/primitives";

const SWATCHES = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#22c55e", "#0ea5e9", "#ef4444", "#a855f7"];

function sameFilter(a: LibraryFilter, b: LibraryFilter): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface ItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number | string;
  pending?: boolean;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  onDropIds?: (ids: string[]) => void;
  accent?: boolean;
}

function NavItem({ icon, label, count, pending, active, collapsed, onClick, onDropIds }: ItemProps) {
  const lang = useApp((s) => s.lang);
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      onDragOver={(e) => {
        if (onDropIds && e.dataTransfer.types.includes("application/x-cf-ids")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const raw = e.dataTransfer.getData("application/x-cf-ids");
        if (onDropIds && raw) {
          e.preventDefault();
          onDropIds(JSON.parse(raw) as string[]);
        }
      }}
      className={cx("flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-sm font-semibold transition-colors", collapsed && "justify-center px-0", active ? "bg-accent-soft text-accent" : "text-ink2 hover:bg-sunk", over && "ring-2 ring-accent")}
    >
      <span className="grid size-5 shrink-0 place-items-center">{icon}</span>
      {collapsed ? null : <span className="min-w-0 flex-1 truncate text-start">{label}</span>}
      {collapsed ? null : pending ? (
        <Badge tone="accent">
          <Spinner size={10} />
        </Badge>
      ) : count === undefined ? null : typeof count === "number" ? (
        <span className="text-xs font-semibold tabular-nums text-muted">{formatNumber(lang, count)}</span>
      ) : (
        <Badge tone="accent">{count}</Badge>
      )}
    </button>
  );
}

function GroupItem({ group, active, collapsed }: { group: GroupInfo; active: boolean; collapsed: boolean }) {
  const t = useT();
  const state = useApp;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const settledRef = useRef(false);
  const commitRename = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    setRenaming(false);
    const next = draft.trim();
    if (next && next !== group.name) void db.renameGroup(group.id, next).then(async (ok) => { if (ok) await state.getState().refresh(); });
  };
  const cancelRename = (): void => {
    settledRef.current = true;
    setRenaming(false);
  };
  const entries = (): MenuEntry[] => [
    { key: "rename", label: t("renameGroup"), onSelect: () => { settledRef.current = false; setDraft(group.name); setRenaming(true); } },
    { key: "color", label: t("changeColor"), children: SWATCHES.map((c) => ({ key: c, label: c, icon: <span className="size-3 rounded-full" style={{ background: c }} />, onSelect: () => void db.recolorGroup(group.id, c).then(() => state.getState().refresh()) })) },
    { key: "members", label: t("selectMembers"), onSelect: () => { state.getState().setFilter({ kind: "group", groupId: group.id }); state.getState().selectAllMatching(); } },
    { key: "export", label: t("exportGroup"), onSelect: () => state.getState().openDialog("export", { kind: "filter", filter: { kind: "group", groupId: group.id }, search: "", exclude: [] }) },
    { key: "sep", label: "", separator: true },
    { key: "delete", label: t("deleteGroup"), danger: true, onSelect: () => void db.deleteGroup(group.id).then(async (result) => { const s = state.getState(); if (s.filter.kind === "group" && s.filter.groupId === group.id) s.setFilter({ kind: "all" }); await s.refresh(); s.toast(t("groupDeleted"), result.historyId); }) }
  ];
  if (renaming) {
    return (
      <form
        className="px-1"
        onSubmit={(e) => {
          e.preventDefault();
          commitRename();
        }}
      >
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitRename} onKeyDown={(e) => e.key === "Escape" && cancelRename()} className="h-9 w-full rounded-xl border border-accent bg-card px-2.5 text-sm outline-none" />
      </form>
    );
  }
  return (
    <ContextMenu entries={entries}>
      <div>
        <NavItem icon={<span className="size-2.5 rounded-full" style={{ background: group.color }} />} label={group.name} count={group.count} active={active} collapsed={collapsed} onClick={() => state.getState().setFilter({ kind: "group", groupId: group.id })} onDropIds={(ids) => void addToGroup({ kind: "ids", ids }, group.id)} />
      </div>
    </ContextMenu>
  );
}

export function Sidebar({ collapsed, drawer }: { collapsed: boolean; drawer?: boolean }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const counts = useApp((s) => s.counts);
  const filter = useApp((s) => s.filter);
  const setFilter = useApp((s) => s.setFilter);
  const toggleSidebar = useApp((s) => s.toggleSidebar);
  const openDialog = useApp((s) => s.openDialog);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addSettledRef = useRef(false);
  const commitAdd = (): void => {
    if (addSettledRef.current) return;
    addSettledRef.current = true;
    const value = name.trim();
    setAdding(false);
    setName("");
    if (value) void createGroupNamed(value);
  };
  const n = (v: number | undefined): number => v ?? 0;
  const show = collapsed && !drawer;
  const go = (f: LibraryFilter) => () => setFilter(f);
  const dup = counts?.duplicateGroups ?? 0;
  const mb = Math.max(1, Math.round((counts?.bytes ?? 0) / (1024 * 1024)));
  const total = counts?.all ?? 0;
  return (
    <nav className="flex h-full min-h-0 flex-col bg-card" aria-label={t("libraryHeading")}>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-2.5">
        <div className="space-y-0.5">
          {!show ? <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{t("libraryHeading")}</div> : null}
          <NavItem icon={<Library size={16} />} label={t("allContacts")} count={n(counts?.all)} active={sameFilter(filter, { kind: "all" })} collapsed={show} onClick={go({ kind: "all" })} />
          <NavItem icon={<Star size={16} />} label={t("starred")} count={n(counts?.starred)} active={sameFilter(filter, { kind: "starred" })} collapsed={show} onClick={go({ kind: "starred" })} />
          <NavItem icon={<Clock size={16} />} label={t("recentlyAdded")} count={n(counts?.recentlyAdded)} active={sameFilter(filter, { kind: "recentlyAdded" })} collapsed={show} onClick={go({ kind: "recentlyAdded" })} />
          <NavItem icon={<Pencil size={16} />} label={t("recentlyEdited")} count={n(counts?.recentlyEdited)} active={sameFilter(filter, { kind: "recentlyEdited" })} collapsed={show} onClick={go({ kind: "recentlyEdited" })} />
          <NavItem icon={<Phone size={16} />} label={t("noNumber")} count={n(counts?.noNumber)} active={sameFilter(filter, { kind: "noNumber" })} collapsed={show} onClick={go({ kind: "noNumber" })} />
          <NavItem icon={<UserX size={16} />} label={t("noName")} count={n(counts?.noName)} active={sameFilter(filter, { kind: "noName" })} collapsed={show} onClick={go({ kind: "noName" })} />
          <NavItem icon={<Copy size={16} />} label={t("duplicates")} count={dup < 0 ? undefined : dup} pending={dup < 0} active={sameFilter(filter, { kind: "duplicates" })} collapsed={show} onClick={() => openDialog("duplicates")} />
        </div>
        <div className="space-y-0.5">
          {!show ? <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{t("groups")}</div> : null}
          {(counts?.groups ?? []).map((g) => (
            <GroupItem key={g.id} group={g} active={filter.kind === "group" && filter.groupId === g.id} collapsed={show} />
          ))}
          {adding && !show ? (
            <form
              className="px-1"
              onSubmit={(e) => {
                e.preventDefault();
                commitAdd();
              }}
            >
              <input ref={inputRef} autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitAdd} onKeyDown={(e) => { if (e.key === "Escape") { addSettledRef.current = true; setAdding(false); setName(""); } }} placeholder={t("groupNamePh")} className="h-9 w-full rounded-xl border border-accent bg-card px-2.5 text-sm outline-none" />
            </form>
          ) : (
            <NavItem icon={<Plus size={16} />} label={t("newGroup")} active={false} collapsed={show} onClick={() => { addSettledRef.current = false; setAdding(true); }} />
          )}
        </div>
        <div className="space-y-0.5">
          {!show ? <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{t("tools")}</div> : null}
          <NavItem icon={<SquarePen size={16} />} label={t("batchEdit")} active={false} collapsed={show} onClick={() => openDialog("batch", { kind: "filter", filter, search: useApp.getState().search, exclude: [] })} />
          <NavItem icon={<MessageSquare size={16} />} label={t("messageQueue")} active={false} collapsed={show} onClick={() => openDialog("queue")} />
          <NavItem icon={<History size={16} />} label={t("history")} active={false} collapsed={show} onClick={() => openDialog("history")} />
        </div>
      </div>
      <div className="space-y-1 border-t border-line p-2.5">
        <NavItem icon={<Settings size={16} />} label={t("settings")} active={false} collapsed={show} onClick={() => openDialog("settings")} />
        {!show ? <div className="flex items-center gap-2 px-2.5 text-xs text-muted"><FolderOpen size={13} /> {t("storageMeter", total, mb).replace(/^[\d,.\s]+/, `${formatNumber(lang, total)} `)}</div> : null}
        {!drawer ? (
          <div className={cx("flex", show ? "justify-center" : "justify-end")}>
            <IconButton label={collapsed ? t("expandSidebar") : t("collapseSidebar")} onClick={toggleSidebar}>
              {collapsed ? <PanelLeftOpen size={16} className="rtl:rotate-180" /> : <PanelLeftClose size={16} className="rtl:rotate-180" />}
            </IconButton>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

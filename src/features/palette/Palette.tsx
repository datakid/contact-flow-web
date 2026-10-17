import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { undoLast } from "../../app/actions";
import { db, nextRequestId } from "../../app/db";
import { useDebounced } from "../../app/hooks";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { ContactRow } from "../../core/types";
import { Avatar, cx } from "../../ui/primitives";

interface Command {
  key: string;
  group: string;
  label: string;
  run: () => void;
}

export function Palette() {
  const t = useT();
  const open = useApp((s) => s.dialog === "palette");
  const close = useApp((s) => s.closeDialog);
  const groups = useApp((s) => s.counts?.groups ?? []);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [people, setPeople] = useState<ContactRow[]>([]);
  const debounced = useDebounced(query, 120);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveKey(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !debounced.trim()) {
      setPeople([]);
      return;
    }
    let alive = true;
    void db.list({ filter: { kind: "all" }, sort: "nameAsc", search: debounced, offset: 0, limit: 8, channel: "palette", requestId: nextRequestId() }).then((r) => alive && setPeople(r.rows.slice(0, 8)));
    return () => {
      alive = false;
    };
  }, [debounced, open]);

  const commands = useMemo<Command[]>(() => {
    const run = (fn: (s: ReturnType<typeof useApp.getState>) => void) => () => {
      const s = useApp.getState();
      s.closeDialog();
      fn(s);
    };
    const list: Command[] = [
      { key: "new", group: t("cmdActions"), label: t("newContact"), run: run((s) => s.openDialog("create")) },
      { key: "import", group: t("cmdActions"), label: t("import"), run: run((s) => s.openDialog("import")) },
      { key: "export", group: t("cmdActions"), label: t("export"), run: run((s) => s.openDialog("export", { kind: "filter", filter: s.filter, search: s.search, exclude: [] })) },
      { key: "batch", group: t("cmdActions"), label: t("batchEdit"), run: run((s) => s.openDialog("batch", { kind: "filter", filter: s.filter, search: s.search, exclude: [] })) },
      { key: "queue", group: t("cmdActions"), label: t("messageQueue"), run: run((s) => s.openDialog("queue")) },
      { key: "history", group: t("cmdActions"), label: t("history"), run: run((s) => s.openDialog("history")) },
      { key: "dups", group: t("cmdActions"), label: t("findDuplicates"), run: run((s) => s.openDialog("duplicates")) },
      { key: "undo", group: t("cmdActions"), label: t("undoLast"), run: run(() => void undoLast()) },
      { key: "shortcuts", group: t("cmdActions"), label: t("shortcuts"), run: run((s) => s.openDialog("shortcuts")) },
      { key: "list", group: t("cmdActions"), label: t("listView"), run: run((s) => s.setView("list")) },
      { key: "table", group: t("cmdActions"), label: t("tableView"), run: run((s) => s.setView("table")) },
      { key: "f-all", group: t("cmdFilters"), label: t("allContacts"), run: run((s) => s.setFilter({ kind: "all" })) },
      { key: "f-star", group: t("cmdFilters"), label: t("starred"), run: run((s) => s.setFilter({ kind: "starred" })) },
      { key: "f-added", group: t("cmdFilters"), label: t("recentlyAdded"), run: run((s) => s.setFilter({ kind: "recentlyAdded" })) },
      { key: "f-edited", group: t("cmdFilters"), label: t("recentlyEdited"), run: run((s) => s.setFilter({ kind: "recentlyEdited" })) },
      { key: "f-nonum", group: t("cmdFilters"), label: t("noNumber"), run: run((s) => s.setFilter({ kind: "noNumber" })) },
      { key: "f-noname", group: t("cmdFilters"), label: t("noName"), run: run((s) => s.setFilter({ kind: "noName" })) },
      ...groups.map((g) => ({ key: `g${g.id}`, group: t("cmdGroups"), label: g.name, run: run((s) => s.setFilter({ kind: "group", groupId: g.id })) })),
      { key: "s-settings", group: t("cmdSettings"), label: t("settings"), run: run((s) => s.openDialog("settings")) },
      { key: "s-selftest", group: t("cmdSettings"), label: t("runSelfTest"), run: run((s) => s.openDialog("selftest")) },
      { key: "s-light", group: t("cmdSettings"), label: `${t("theme")}: ${t("themeLight")}`, run: run((s) => s.setTheme("light")) },
      { key: "s-dark", group: t("cmdSettings"), label: `${t("theme")}: ${t("themeDark")}`, run: run((s) => s.setTheme("dark")) },
      { key: "s-en", group: t("cmdSettings"), label: `${t("language")}: English`, run: run((s) => s.setLang("en")) },
      { key: "s-ar", group: t("cmdSettings"), label: `${t("language")}: العربية`, run: run((s) => s.setLang("ar")) }
    ];
    return list;
  }, [t, groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : commands;
    const contactCommands: Command[] = people.map((p) => ({ key: `p${p.id}`, group: t("cmdContacts"), label: p.name || p.primaryPhone, run: () => { close(); useApp.getState().setFocused(p.id); } }));
    return [...contactCommands, ...base];
  }, [commands, people, query, close, t]);

  const activeIndex = Math.max(0, filtered.findIndex((c) => c.key === activeKey));
  const activeItemKey = filtered[activeIndex]?.key ?? null;

  useEffect(() => {
    setActiveKey(filtered[0]?.key ?? null);
  }, [query]);

  useEffect(() => {
    if (activeItemKey) document.getElementById(`cmd-${activeItemKey}`)?.scrollIntoView({ block: "nearest" });
  }, [activeItemKey]);

  const moveActive = (delta: number): void => {
    const next = Math.min(filtered.length - 1, Math.max(0, activeIndex + delta));
    setActiveKey(filtered[next]?.key ?? null);
  };

  const peopleById = new Map(people.map((p) => [`p${p.id}`, p]));
  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] anim-fade" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed start-1/2 top-[14%] z-50 w-[min(92vw,600px)] overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)] anim-pop ltr:-translate-x-1/2 rtl:translate-x-1/2"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              moveActive(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              moveActive(-1);
            } else if (e.key === "Enter") {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              filtered[activeIndex]?.run();
            }
          }}
        >
          <Dialog.Title className="sr-only">{t("scCommandPalette")}</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-line px-4 focus-within:border-accent">
            <Search size={16} className="text-muted" />
            <input autoFocus role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-activedescendant={activeItemKey ? `cmd-${activeItemKey}` : undefined} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("cmdPlaceholder")} className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
          </div>
          <div ref={listRef} id="palette-list" className="scroll-thin max-h-[50vh] overflow-auto p-1.5" role="listbox">
            {filtered.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted">{t("cmdNothing")}</div> : null}
            {filtered.map((c, index) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              const person = peopleById.get(c.key);
              return (
                <div key={c.key}>
                  {header ? <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{header}</div> : null}
                  <button type="button" role="option" id={`cmd-${c.key}`} tabIndex={-1} aria-selected={index === activeIndex} onMouseMove={() => setActiveKey(c.key)} onClick={() => c.run()} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm transition-colors duration-100", index === activeIndex && "bg-accent-soft text-accent")}>
                    {person ? <Avatar name={person.name} seed={person.id} size={26} /> : null}
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {person ? <span className="truncate text-xs text-muted">{person.primaryPhone}</span> : null}
                  </button>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

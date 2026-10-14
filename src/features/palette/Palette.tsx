import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { undoLast } from "../../app/actions";
import { db } from "../../app/db";
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
  const [active, setActive] = useState(0);
  const [people, setPeople] = useState<ContactRow[]>([]);
  const debounced = useDebounced(query, 120);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !debounced.trim()) {
      setPeople([]);
      return;
    }
    let alive = true;
    void db.list({ filter: { kind: "all" }, sort: "nameAsc", search: debounced, offset: 0, limit: 8, requestId: Date.now() }).then((r) => alive && setPeople(r.rows.slice(0, 8)));
    return () => {
      alive = false;
    };
  }, [debounced, open]);

  const commands = useMemo<Command[]>(() => {
    const s = useApp.getState();
    const run = (fn: () => void) => () => {
      s.closeDialog();
      fn();
    };
    const list: Command[] = [
      { key: "new", group: t("cmdActions"), label: t("newContact"), run: run(() => s.openDialog("create")) },
      { key: "import", group: t("cmdActions"), label: t("import"), run: run(() => s.openDialog("import")) },
      { key: "export", group: t("cmdActions"), label: t("export"), run: run(() => s.openDialog("export", { kind: "filter", filter: s.filter, search: s.search })) },
      { key: "batch", group: t("cmdActions"), label: t("batchEdit"), run: run(() => s.openDialog("batch", { kind: "filter", filter: s.filter, search: s.search })) },
      { key: "queue", group: t("cmdActions"), label: t("messageQueue"), run: run(() => s.openDialog("queue")) },
      { key: "history", group: t("cmdActions"), label: t("history"), run: run(() => s.openDialog("history")) },
      { key: "dups", group: t("cmdActions"), label: t("findDuplicates"), run: run(() => s.openDialog("duplicates")) },
      { key: "undo", group: t("cmdActions"), label: t("undoLast"), run: run(() => void undoLast()) },
      { key: "shortcuts", group: t("cmdActions"), label: t("shortcuts"), run: run(() => s.openDialog("shortcuts")) },
      { key: "list", group: t("cmdActions"), label: t("listView"), run: run(() => s.setView("list")) },
      { key: "table", group: t("cmdActions"), label: t("tableView"), run: run(() => s.setView("table")) },
      { key: "f-all", group: t("cmdFilters"), label: t("allContacts"), run: run(() => s.setFilter({ kind: "all" })) },
      { key: "f-star", group: t("cmdFilters"), label: t("starred"), run: run(() => s.setFilter({ kind: "starred" })) },
      { key: "f-added", group: t("cmdFilters"), label: t("recentlyAdded"), run: run(() => s.setFilter({ kind: "recentlyAdded" })) },
      { key: "f-edited", group: t("cmdFilters"), label: t("recentlyEdited"), run: run(() => s.setFilter({ kind: "recentlyEdited" })) },
      { key: "f-nonum", group: t("cmdFilters"), label: t("noNumber"), run: run(() => s.setFilter({ kind: "noNumber" })) },
      { key: "f-noname", group: t("cmdFilters"), label: t("noName"), run: run(() => s.setFilter({ kind: "noName" })) },
      ...groups.map((g) => ({ key: `g${g.id}`, group: t("cmdGroups"), label: g.name, run: run(() => s.setFilter({ kind: "group", groupId: g.id })) })),
      { key: "s-settings", group: t("cmdSettings"), label: t("settings"), run: run(() => s.openDialog("settings")) },
      { key: "s-light", group: t("cmdSettings"), label: `${t("theme")}: ${t("themeLight")}`, run: run(() => s.setTheme("light")) },
      { key: "s-dark", group: t("cmdSettings"), label: `${t("theme")}: ${t("themeDark")}`, run: run(() => s.setTheme("dark")) },
      { key: "s-en", group: t("cmdSettings"), label: `${t("language")}: English`, run: run(() => s.setLang("en")) },
      { key: "s-ar", group: t("cmdSettings"), label: `${t("language")}: العربية`, run: run(() => s.setLang("ar")) }
    ];
    return list;
  }, [t, groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : commands;
    const contactCommands: Command[] = people.map((p) => ({ key: `p${p.id}`, group: t("cmdContacts"), label: p.name || p.primaryPhone, run: () => { close(); useApp.getState().setFocused(p.id); } }));
    return [...contactCommands, ...base];
  }, [commands, people, query, close, t]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

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
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              filtered[active]?.run();
            }
          }}
        >
          <Dialog.Title className="sr-only">{t("scCommandPalette")}</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search size={16} className="text-muted" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("cmdPlaceholder")} className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
          </div>
          <div ref={listRef} className="scroll-thin max-h-[50vh] overflow-auto p-1.5" role="listbox">
            {filtered.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted">{t("cmdNothing")}</div> : null}
            {filtered.map((c, index) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              const person = peopleById.get(c.key);
              return (
                <div key={c.key}>
                  {header ? <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{header}</div> : null}
                  <button type="button" role="option" aria-selected={index === active} data-index={index} onMouseMove={() => setActive(index)} onClick={() => c.run()} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm", index === active && "bg-accent-soft text-accent")}>
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

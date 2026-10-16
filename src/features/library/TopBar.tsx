import { Download, Menu, Moon, Plus, Search, Sun, Upload, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useCompact } from "../../app/hooks";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { Button, IconButton } from "../../ui/primitives";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

export function useResolvedTheme(): "dark" | "light" {
  const theme = useApp((s) => s.theme);
  const system = useSyncExternalStore(subscribeSystemTheme, systemPrefersDark, () => false);
  return theme === "system" ? (system ? "dark" : "light") : theme;
}

export function TopBar() {
  const t = useT();
  const compact = useCompact();
  const search = useApp((s) => s.search);
  const setSearch = useApp((s) => s.setSearch);
  const openDialog = useApp((s) => s.openDialog);
  const setTheme = useApp((s) => s.setTheme);
  const setMobileSidebar = useApp((s) => s.setMobileSidebar);
  const resolved = useResolvedTheme();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = (): void => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("cf:focus-search", focus);
    return () => window.removeEventListener("cf:focus-search", focus);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-card px-3">
      {compact ? (
        <IconButton label={t("libraryHeading")} onClick={() => setMobileSidebar(true)}>
          <Menu size={18} />
        </IconButton>
      ) : null}
      <div className="flex shrink-0 items-center gap-2.5">
        <img src="./favicon.png" alt="" className="size-7 rounded-lg" />
        {compact ? null : <span className="serif text-xl leading-none">{t("brand")}</span>}
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="relative w-full max-w-[520px]">
          <Search size={16} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted" />
          <input
            ref={inputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (search ? setSearch("") : inputRef.current?.blur())}
            placeholder={compact ? t("searchPh") : t("searchDesktopPh")}
            aria-label={t("searchPh")}
            className="h-10 w-full rounded-xl border border-line bg-sunk ps-9 pe-9 text-sm placeholder:text-faint focus:border-accent focus:bg-card focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button type="button" aria-label={t("deselect")} onClick={() => setSearch("")} className="absolute inset-y-0 end-2 my-auto grid size-6 place-items-center rounded-full text-muted hover:bg-line">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {compact ? (
          <IconButton label={t("import")} onClick={() => openDialog("import")}>
            <Upload size={17} />
          </IconButton>
        ) : (
          <>
            <Button variant="primary" onClick={() => openDialog("import")}>
              <Upload size={15} /> {t("import")}
            </Button>
            <Button variant="outline" onClick={() => openDialog("export", { kind: "filter", filter: useApp.getState().filter, search: useApp.getState().search, exclude: [] })}>
              <Download size={15} /> {t("export")}
            </Button>
          </>
        )}
        <IconButton label={t("newContact")} onClick={() => openDialog("create")} className="border border-line bg-card">
          <Plus size={17} />
        </IconButton>
        <IconButton label={t("toggleTheme")} onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}>
          {resolved === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
      </div>
    </header>
  );
}

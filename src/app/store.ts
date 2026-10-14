import { create } from "zustand";
import { db } from "./db";
import type { Selection } from "../core/db/library";
import type { Language, LayoutMode, LibraryCounts, LibraryFilter, SortKey, ThemeMode } from "../core/types";
import { defaultSortFor } from "../core/db/filters";

export type DialogName = "import" | "export" | "batch" | "duplicates" | "queue" | "history" | "settings" | "palette" | "shortcuts" | "create" | "confirmDelete" | null;
export type ViewMode = "list" | "table";

export interface ToastItem {
  id: number;
  message: string;
  undoId: string | null;
  tone: "info" | "error";
}

export interface PaneWidths {
  sidebar: number;
  list: number;
  detail: number;
}

interface Persisted {
  lang: Language;
  theme: ThemeMode;
  layout: LayoutMode;
  view: ViewMode;
  sort: SortKey;
  sidebarCollapsed: boolean;
  widths: PaneWidths;
}

const STORAGE_KEY = "cf3.ui";
const DEFAULT_WIDTHS: PaneWidths = { sidebar: 240, list: 440, detail: 460 };

function loadPersisted(): Persisted {
  const base: Persisted = {
    lang: (navigator.language || "").startsWith("ar") ? "ar" : "en",
    theme: "system",
    layout: "auto",
    view: "list",
    sort: "nameAsc",
    sidebarCollapsed: false,
    widths: DEFAULT_WIDTHS
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Persisted>) };
    const legacyLang = localStorage.getItem("cf.lang");
    if (legacyLang === "ar" || legacyLang === "en") base.lang = legacyLang;
    const legacy = localStorage.getItem("cf.settings");
    if (legacy) {
      const s = JSON.parse(legacy) as { theme?: ThemeMode; layout?: string };
      if (s.theme === "dark" || s.theme === "light" || s.theme === "system") base.theme = s.theme;
    }
  } catch {
    return base;
  }
  return base;
}

interface AppState extends Persisted {
  ready: boolean;
  persistent: boolean;
  initError: string | null;
  defaultCountry: string;
  filter: LibraryFilter;
  search: string;
  selected: Set<string>;
  allMatching: boolean;
  anchorIndex: number | null;
  focusedId: string | null;
  version: number;
  counts: LibraryCounts | null;
  dialog: DialogName;
  exportTarget: Selection | null;
  batchTarget: Selection | null;
  queueTarget: Selection | null;
  confirmTarget: Selection | null;
  editingId: string | null;
  mobileDetailOpen: boolean;
  mobileSidebarOpen: boolean;
  toasts: ToastItem[];
  setLang: (lang: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setLayout: (layout: LayoutMode) => void;
  setView: (view: ViewMode) => void;
  setSort: (sort: SortKey) => void;
  setFilter: (filter: LibraryFilter) => void;
  setSearch: (search: string) => void;
  setSelected: (ids: Set<string>, anchor?: number | null) => void;
  toggleSelected: (id: string, index: number) => void;
  selectAllMatching: () => void;
  clearSelection: () => void;
  setFocused: (id: string | null) => void;
  toggleSidebar: () => void;
  setWidths: (widths: Partial<PaneWidths>) => void;
  openDialog: (dialog: DialogName, target?: Selection | null) => void;
  closeDialog: () => void;
  setMobileDetail: (open: boolean) => void;
  setMobileSidebar: (open: boolean) => void;
  refresh: () => Promise<void>;
  loadCounts: () => Promise<void>;
  toast: (message: string, undoId?: string | null, tone?: "info" | "error") => void;
  dismissToast: (id: number) => void;
  currentSelection: () => Selection;
  selectionCount: () => number;
  init: () => Promise<void>;
}

let toastSeq = 0;
let initStarted = false;

function persist(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang: state.lang, theme: state.theme, layout: state.layout, view: state.view, sort: state.sort, sidebarCollapsed: state.sidebarCollapsed, widths: state.widths }));
  } catch {
    return;
  }
}

const initial = loadPersisted();

export const useApp = create<AppState>((set, get) => {
  const save = (): void => persist(get());
  return {
    ...initial,
    ready: false,
    persistent: true,
    initError: null,
    defaultCountry: "US",
    filter: { kind: "all" },
    search: "",
    selected: new Set<string>(),
    allMatching: false,
    anchorIndex: null,
    focusedId: null,
    version: 0,
    counts: null,
    dialog: null,
    exportTarget: null,
    batchTarget: null,
    queueTarget: null,
    confirmTarget: null,
    editingId: null,
    mobileDetailOpen: false,
    mobileSidebarOpen: false,
    toasts: [],
    setLang: (lang) => {
      set({ lang });
      save();
    },
    setTheme: (theme) => {
      set({ theme });
      save();
    },
    setLayout: (layout) => {
      set({ layout });
      save();
    },
    setView: (view) => {
      set({ view });
      save();
    },
    setSort: (sort) => {
      set({ sort });
      save();
    },
    setFilter: (filter) => {
      set({ filter, sort: defaultSortFor(filter) === "nameAsc" ? (get().sort === "added" || get().sort === "edited" ? "nameAsc" : get().sort) : defaultSortFor(filter), selected: new Set(), allMatching: false, anchorIndex: null, mobileSidebarOpen: false });
    },
    setSearch: (search) => set({ search, selected: new Set(), allMatching: false, anchorIndex: null }),
    setSelected: (ids, anchor) => set({ selected: ids, allMatching: false, anchorIndex: anchor === undefined ? get().anchorIndex : anchor }),
    toggleSelected: (id, index) => {
      const next = new Set(get().selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set({ selected: next, allMatching: false, anchorIndex: index });
    },
    selectAllMatching: () => set({ allMatching: true }),
    clearSelection: () => set({ selected: new Set(), allMatching: false, anchorIndex: null }),
    setFocused: (focusedId) => set({ focusedId, mobileDetailOpen: focusedId !== null }),
    toggleSidebar: () => {
      set({ sidebarCollapsed: !get().sidebarCollapsed });
      save();
    },
    setWidths: (widths) => {
      set({ widths: { ...get().widths, ...widths } });
      save();
    },
    openDialog: (dialog, target = null) => {
      const patch: Partial<AppState> = { dialog };
      if (dialog === "export") patch.exportTarget = target;
      if (dialog === "batch") patch.batchTarget = target;
      if (dialog === "queue") patch.queueTarget = target;
      if (dialog === "confirmDelete") patch.confirmTarget = target;
      set(patch);
    },
    closeDialog: () => set({ dialog: null }),
    setMobileDetail: (mobileDetailOpen) => set({ mobileDetailOpen }),
    setMobileSidebar: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
    loadCounts: async () => {
      const counts = await db.counts();
      set({ counts });
    },
    refresh: async () => {
      set({ version: get().version + 1 });
      await get().loadCounts();
    },
    toast: (message, undoId = null, tone = "info") => {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts.slice(-3), { id, message, undoId, tone }] });
      window.setTimeout(() => get().dismissToast(id), undoId ? 7000 : 4200);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    currentSelection: () => {
      const s = get();
      if (s.allMatching) return { kind: "filter", filter: s.filter, search: s.search };
      return { kind: "ids", ids: [...s.selected] };
    },
    selectionCount: () => {
      const s = get();
      return s.allMatching ? Number.MAX_SAFE_INTEGER : s.selected.size;
    },
    init: async () => {
      if (initStarted) return;
      initStarted = true;
      try {
        const info = await db.init(navigator.language || "en-US");
        try {
          const legacyQueue = localStorage.getItem("cf.queue");
          if (legacyQueue && !(await db.getKv("queue"))) await db.setKv("queue", legacyQueue);
          if (legacyQueue) localStorage.removeItem("cf.queue");
        } catch {
          void 0;
        }
        await get().loadCounts();
        set({ ready: true, persistent: info.persistent, defaultCountry: info.defaultCountry, initError: null });
        if (info.migrated > 0) get().toast(`${info.migrated.toLocaleString()} contacts moved to the new library`);
        if (info.persistent && navigator.storage?.persist) void navigator.storage.persist();
        void db.refreshDuplicates().then(() => get().loadCounts());
      } catch (error) {
        set({ initError: error instanceof Error ? error.message : String(error) });
      }
    }
  };
});

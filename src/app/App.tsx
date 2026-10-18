import * as Dialog from "@radix-ui/react-dialog";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CreateDialog } from "../features/contact/CreateDialog";
import { DetailPane } from "../features/contact/DetailPane";
import { MiddlePane } from "../features/library/MiddlePane";
import { ConfirmDelete, PersistBanner, Toasts } from "../features/library/Overlays";
import { Sidebar } from "../features/library/Sidebar";
import { TopBar, useResolvedTheme } from "../features/library/TopBar";
import { Palette } from "../features/palette/Palette";
import { Button, DelayedSpinner, TooltipProvider } from "../ui/primitives";
import { useCompact, useSwipeBack } from "./hooks";
import { useT } from "./i18n";
import { useGlobalShortcuts } from "./shortcuts";
import { useApp } from "./store";
import type { DialogName } from "./store";

const ImportWizard = lazy(() => import("../features/import/ImportWizard").then((m) => ({ default: m.ImportWizard })));
const ExportDialog = lazy(() => import("../features/export/ExportDialog").then((m) => ({ default: m.ExportDialog })));
const BatchDialog = lazy(() => import("../features/batch/BatchDialog").then((m) => ({ default: m.BatchDialog })));
const DuplicatesDialog = lazy(() => import("../features/duplicates/DuplicatesDialog").then((m) => ({ default: m.DuplicatesDialog })));
const QueueDialog = lazy(() => import("../features/queue/QueueDialog").then((m) => ({ default: m.QueueDialog })));
const HistoryDialog = lazy(() => import("../features/history/HistoryDialog").then((m) => ({ default: m.HistoryDialog })));
const SettingsDialog = lazy(() => import("../features/settings/SettingsDialog").then((m) => ({ default: m.SettingsDialog })));
const SelfTestDialog = lazy(() => import("../features/settings/SelfTestDialog").then((m) => ({ default: m.SelfTestDialog })));
const ShortcutsDialog = lazy(() => import("../features/settings/ShortcutsDialog").then((m) => ({ default: m.ShortcutsDialog })));

interface ResizeHandleProps {
  label: string;
  getValue: () => number;
  apply: (px: number) => void;
  commit: (px: number) => void;
  min: number;
  max: number | (() => number);
  invert?: boolean;
}

function ResizeHandle({ label, getValue, apply, commit, min, max, invert }: ResizeHandleProps) {
  const drag = useRef<{ startX: number; startValue: number; latest: number; frame: number | null } | null>(null);
  const limit = (px: number): number => {
    const top = typeof max === "function" ? max() : max;
    return Math.min(Math.max(min, top), Math.max(min, px));
  };
  const finish = (el: HTMLElement): void => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    delete el.dataset.active;
    el.closest("[data-layout-root]")?.removeAttribute("data-resizing");
    apply(current.latest);
    commit(current.latest);
  };
  const direction = (): number => (document.documentElement.dir === "rtl" ? -1 : 1) * (invert ? -1 : 1);
  const topNow = typeof max === "function" ? max() : max;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(getValue())}
      aria-valuemin={min}
      aria-valuemax={Math.max(min, Math.round(topNow))}
      tabIndex={0}
      className="resize-handle"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const startValue = getValue();
        drag.current = { startX: e.clientX, startValue, latest: startValue, frame: null };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.currentTarget.dataset.active = "true";
        e.currentTarget.closest("[data-layout-root]")?.setAttribute("data-resizing", "true");
      }}
      onPointerMove={(e) => {
        const current = drag.current;
        if (!current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const delta = (e.clientX - current.startX) * direction();
        const px = limit(current.startValue + delta);
        current.latest = px;
        if (current.frame !== null) return;
        current.frame = requestAnimationFrame(() => {
          const active = drag.current;
          if (!active) return;
          active.frame = null;
          apply(active.latest);
        });
      }}
      onPointerUp={(e) => finish(e.currentTarget)}
      onLostPointerCapture={(e) => finish(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const step = (e.key === "ArrowRight" ? 1 : -1) * (document.documentElement.dir === "rtl" ? -1 : 1) * (invert ? -1 : 1) * 16;
        const px = limit(getValue() + step);
        apply(px);
        commit(px);
      }}
    />
  );
}

function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  const [loaded, setLoaded] = useState<Set<DialogName>>(() => new Set());
  useEffect(() => {
    if (dialog && !loaded.has(dialog)) setLoaded((previous) => new Set(previous).add(dialog));
  }, [dialog, loaded]);
  return (
    <>
      <Suspense fallback={null}>
        {loaded.has("import") ? <ImportWizard /> : null}
        {loaded.has("export") ? <ExportDialog /> : null}
        {loaded.has("batch") ? <BatchDialog /> : null}
        {loaded.has("duplicates") ? <DuplicatesDialog /> : null}
        {loaded.has("queue") ? <QueueDialog /> : null}
        {loaded.has("history") ? <HistoryDialog /> : null}
        {loaded.has("settings") ? <SettingsDialog /> : null}
        {loaded.has("shortcuts") ? <ShortcutsDialog /> : null}
        {loaded.has("selftest") ? <SelfTestDialog /> : null}
      </Suspense>
      <CreateDialog />
      <ConfirmDelete />
      <Palette />
    </>
  );
}

function DesktopLayout() {
  const t = useT();
  const widths = useApp((s) => s.widths);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const setWidths = useApp((s) => s.setWidths);
  const rootRef = useRef<HTMLDivElement>(null);
  const sidebarNow = (): number => (useApp.getState().sidebarCollapsed ? 64 : useApp.getState().widths.sidebar);
  const rootStyle = { "--sidebar-w": `${widths.sidebar}px`, "--detail-w": `${widths.detail}px` } as CSSProperties;
  return (
    <div ref={rootRef} data-layout-root className="flex min-h-0 flex-1" style={rootStyle}>
      <div className="shrink-0 border-e border-line transition-[width] duration-200 ease-[var(--ease)]" style={{ width: collapsed ? 64 : "var(--sidebar-w)" }}>
        <Sidebar collapsed={collapsed} />
      </div>
      {collapsed ? null : (
        <ResizeHandle
          label={t("libraryHeading")}
          getValue={() => useApp.getState().widths.sidebar}
          apply={(px) => rootRef.current?.style.setProperty("--sidebar-w", `${px}px`)}
          commit={(px) => setWidths({ sidebar: px })}
          min={200}
          max={() => Math.min(360, window.innerWidth - useApp.getState().widths.detail - 360 - 12)}
        />
      )}
      <div className="flex min-w-[360px] flex-1 flex-col" style={{ minWidth: 360 }}>
        <MiddlePane />
      </div>
      <ResizeHandle
        label={t("emptyDetailTitle")}
        getValue={() => useApp.getState().widths.detail}
        apply={(px) => rootRef.current?.style.setProperty("--detail-w", `${px}px`)}
        commit={(px) => setWidths({ detail: px })}
        min={380}
        max={() => Math.min(720, window.innerWidth - sidebarNow() - 360 - 12)}
        invert
      />
      <div className="shrink-0 border-s border-line bg-card" style={{ width: "var(--detail-w)", minWidth: 380 }}>
        <DetailPane />
      </div>
    </div>
  );
}

function CompactLayout() {
  const open = useApp((s) => s.mobileDetailOpen);
  const focusedId = useApp((s) => s.focusedId);
  const drawer = useApp((s) => s.mobileSidebarOpen);
  const setDrawer = useApp((s) => s.setMobileSidebar);
  const setMobileDetail = useApp((s) => s.setMobileDetail);
  const detailRef = useRef<HTMLDivElement>(null);
  useSwipeBack(detailRef, () => setMobileDetail(false));
  const t = useT();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MiddlePane />
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] anim-fade" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 start-0 z-50 w-[min(84vw,300px)] border-e border-line bg-card shadow-[var(--shadow)] anim-drawer">
            <Dialog.Title className="sr-only">{t("libraryHeading")}</Dialog.Title>
            <Sidebar collapsed={false} drawer />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={open && focusedId !== null} onOpenChange={(o) => !o && setMobileDetail(false)}>
        <Dialog.Portal>
          <Dialog.Content ref={detailRef} aria-describedby={undefined} className="anim-push fixed inset-0 z-40 touch-pan-y bg-card">
            <Dialog.Title className="sr-only">{t("emptyDetailTitle")}</Dialog.Title>
            <DetailPane onBack={() => setMobileDetail(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export function App() {
  const t = useT();
  const ready = useApp((s) => s.ready);
  useEffect(() => {
    if (ready && new URLSearchParams(window.location.search).get("selftest") === "1") useApp.getState().openDialog("selftest");
  }, [ready]);
  const error = useApp((s) => s.initError);
  const lang = useApp((s) => s.lang);
  const compact = useCompact();
  const resolved = useResolvedTheme();
  useGlobalShortcuts();

  useEffect(() => {
    void useApp.getState().init();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    root.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#141210" : "#F6F1E8");
  }, [lang, resolved]);

  if (error) {
    return (
      <div role="alert" className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md space-y-3">
          <div className="serif text-4xl">{t("fatalTitle")}</div>
          <p className="text-sm text-ink2">{t("fatalBody")}</p>
          <pre className="whitespace-pre-wrap rounded-xl bg-sunk p-3 text-start text-xs text-muted">{error}</pre>
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t("reload")}
          </Button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex items-center gap-3 text-muted">
          <DelayedSpinner size={20} /> {t("loadingLibrary")}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col">
        <PersistBanner />
        <TopBar />
        {compact ? <CompactLayout /> : <DesktopLayout />}
      </div>
      <Dialogs />
      <Toasts />
    </TooltipProvider>
  );
}

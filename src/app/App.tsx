import * as Dialog from "@radix-ui/react-dialog";
import { Suspense, lazy, useEffect, useRef } from "react";
import { CreateDialog } from "../features/contact/CreateDialog";
import { DetailPane } from "../features/contact/DetailPane";
import { MiddlePane } from "../features/library/MiddlePane";
import { ConfirmDelete, PersistBanner, Toasts } from "../features/library/Overlays";
import { Sidebar } from "../features/library/Sidebar";
import { TopBar, useResolvedTheme } from "../features/library/TopBar";
import { Palette } from "../features/palette/Palette";
import { Button, Spinner, TooltipProvider } from "../ui/primitives";
import { useCompact } from "./hooks";
import { useT } from "./i18n";
import { useGlobalShortcuts } from "./shortcuts";
import { useApp } from "./store";

const ImportWizard = lazy(() => import("../features/import/ImportWizard").then((m) => ({ default: m.ImportWizard })));
const ExportDialog = lazy(() => import("../features/export/ExportDialog").then((m) => ({ default: m.ExportDialog })));
const BatchDialog = lazy(() => import("../features/batch/BatchDialog").then((m) => ({ default: m.BatchDialog })));
const DuplicatesDialog = lazy(() => import("../features/duplicates/DuplicatesDialog").then((m) => ({ default: m.DuplicatesDialog })));
const QueueDialog = lazy(() => import("../features/queue/QueueDialog").then((m) => ({ default: m.QueueDialog })));
const HistoryDialog = lazy(() => import("../features/history/HistoryDialog").then((m) => ({ default: m.HistoryDialog })));
const SettingsDialog = lazy(() => import("../features/settings/SettingsDialog").then((m) => ({ default: m.SettingsDialog })));
const ShortcutsDialog = lazy(() => import("../features/settings/ShortcutsDialog").then((m) => ({ default: m.ShortcutsDialog })));

function ResizeHandle({ onDrag, label }: { onDrag: (delta: number) => void; label: string }) {
  const active = useRef(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      className="resize-handle"
      data-active={active.current}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = true;
        let last = e.clientX;
        const rtl = document.documentElement.dir === "rtl";
        const move = (ev: PointerEvent): void => {
          const delta = (ev.clientX - last) * (rtl ? -1 : 1);
          last = ev.clientX;
          onDrag(delta);
        };
        const up = (): void => {
          active.current = false;
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    />
  );
}

function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  return (
    <>
      <Suspense fallback={null}>
        {dialog === "import" ? <ImportWizard /> : null}
        {dialog === "export" ? <ExportDialog /> : null}
        {dialog === "batch" ? <BatchDialog /> : null}
        {dialog === "duplicates" ? <DuplicatesDialog /> : null}
        {dialog === "queue" ? <QueueDialog /> : null}
        {dialog === "history" ? <HistoryDialog /> : null}
        {dialog === "settings" ? <SettingsDialog /> : null}
        {dialog === "shortcuts" ? <ShortcutsDialog /> : null}
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
  const sidebarWidth = collapsed ? 64 : widths.sidebar;
  const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0 border-e border-line" style={{ width: sidebarWidth }}>
        <Sidebar collapsed={collapsed} />
      </div>
      {collapsed ? null : <ResizeHandle label={t("libraryHeading")} onDrag={(d) => setWidths({ sidebar: clamp(useApp.getState().widths.sidebar + d, 200, 360) })} />}
      <div className="flex min-w-[360px] flex-1 flex-col" style={{ minWidth: 360 }}>
        <MiddlePane />
      </div>
      <ResizeHandle label={t("emptyDetailTitle")} onDrag={(d) => setWidths({ detail: clamp(useApp.getState().widths.detail - d, 380, 720) })} />
      <div className="shrink-0 border-s border-line bg-card" style={{ width: widths.detail, minWidth: 380 }}>
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
  const t = useT();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MiddlePane />
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] anim-fade" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 start-0 z-50 w-[min(84vw,300px)] border-e border-line bg-card shadow-[var(--shadow)] anim-fade">
            <Dialog.Title className="sr-only">{t("libraryHeading")}</Dialog.Title>
            <Sidebar collapsed={false} drawer />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={open && focusedId !== null} onOpenChange={(o) => !o && setMobileDetail(false)}>
        <Dialog.Portal>
          <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-40 bg-card" style={{ animation: "slide-up 200ms ease-out" }}>
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

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      if (useApp.getState().theme === "system") useApp.setState({ theme: "system" });
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

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
          <Spinner size={20} /> {t("loadingLibrary")}
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

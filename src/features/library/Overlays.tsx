import * as Toast from "@radix-ui/react-toast";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { deleteSelection, undoEntry } from "../../app/actions";
import { formatNumber, useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { ToastItem } from "../../app/store";
import { useSelectionCount } from "../../app/useSelectionCount";
import { Button, Modal, Spinner, cx } from "../../ui/primitives";

export function Toasts() {
  const t = useT();
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const lifted = useApp((s) => s.bulkBarVisible);
  return (
    <Toast.Provider swipeDirection="down" duration={4200}>
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} dismiss={dismiss} />
      ))}
      <Toast.Viewport className={cx("fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-[200] mx-auto flex w-[min(92vw,420px)] flex-col gap-2 outline-none transition-transform duration-200", lifted && "-translate-y-16")} />
    </Toast.Provider>
  );
}

function ToastCard({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!item.open) {
      const id = window.setTimeout(() => dismiss(item.id), 180);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [item.open, item.id, dismiss]);
  return (
        <Toast.Root open={open && item.open} duration={item.undoId ? 7000 : 4200} onOpenChange={(next) => { setOpen(next); if (!next) window.setTimeout(() => dismiss(item.id), 180); }} className={cx("toast flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-[var(--shadow)]", item.tone === "error" ? "border-danger bg-card text-danger" : "border-line bg-card text-ink")}>
          {item.tone === "error" ? <AlertTriangle size={16} /> : null}
          <Toast.Description className="min-w-0 flex-1 truncate">{item.message}</Toast.Description>
          {item.undoId ? (
            <Toast.Action altText={t("undo")} asChild>
              <button type="button" onClick={() => { void undoEntry(item.undoId ?? []); }} className="rounded-lg px-2 py-1 font-bold text-accent hover:bg-accent-soft">
                {t("undo")}
              </button>
            </Toast.Action>
          ) : null}
          <Toast.Close aria-label={t("close")} className="text-muted hover:text-ink">
            <X size={14} />
          </Toast.Close>
        </Toast.Root>
  );
}

export function PersistBanner() {
  const t = useT();
  const persistent = useApp((s) => s.persistent);
  const openDialog = useApp((s) => s.openDialog);
  if (persistent) return null;
  return (
    <div role="alert" className="flex items-center gap-3 bg-[#f6d860] px-4 py-2 text-sm font-semibold text-[#3d3200]">
      <AlertTriangle size={16} />
      <span className="flex-1">{t("persistBanner")}</span>
      <Button size="sm" variant="outline" className="border-[#3d3200]/30 bg-transparent text-[#3d3200] hover:bg-black/10" onClick={() => openDialog("export", { kind: "filter", filter: { kind: "all" }, search: "", exclude: [] })}>
        {t("export")}
      </Button>
    </div>
  );
}

export function ConfirmDelete() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const open = useApp((s) => s.dialog === "confirmDelete");
  const target = useApp((s) => s.confirmTarget);
  const close = useApp((s) => s.closeDialog);
  const liveCount = useSelectionCount(open ? target : null);
  const lastCount = useRef<number | null>(null);
  if (open) lastCount.current = liveCount;
  const count = open ? liveCount : lastCount.current;
  const [busy, setBusy] = useState(false);
  const deleteRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title={count === null ? t("delete") : t("confirmDelete", count)}
      size="sm"
      initialFocusRef={deleteRef}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("cancel")}
          </Button>
          <Button
            ref={deleteRef}
            variant="danger"
            disabled={busy || !target || count === null || count === 0}
            onClick={() => {
              if (!target) return;
              setBusy(true);
              void deleteSelection(target).finally(() => {
                setBusy(false);
                close();
              });
            }}
          >
            {t("delete")} {count === null ? <Spinner size={14} /> : formatNumber(lang, count)}
          </Button>
        </>
      }
    >
      <p className="p-5 text-sm text-ink2">{t("confirmDeleteBody")}</p>
    </Modal>
  );
}

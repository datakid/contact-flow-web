import * as Toast from "@radix-ui/react-toast";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { deleteSelection, undoEntry } from "../../app/actions";
import { formatNumber, useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { useSelectionCount } from "../../app/useSelectionCount";
import { Button, Modal, Spinner, cx } from "../../ui/primitives";

export function Toasts() {
  const t = useT();
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <Toast.Provider swipeDirection="down" duration={4200}>
      {toasts.map((item) => (
        <Toast.Root key={item.id} open duration={item.undoId ? 7000 : 4200} onOpenChange={(open) => !open && dismiss(item.id)} className={cx("flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-[var(--shadow)] anim-pop", item.tone === "error" ? "border-danger bg-card text-danger" : "border-line bg-card text-ink")}>
          {item.tone === "error" ? <AlertTriangle size={16} /> : null}
          <Toast.Description className="min-w-0 flex-1 truncate">{item.message}</Toast.Description>
          {item.undoId ? (
            <Toast.Action altText={t("undo")} asChild>
              <button type="button" onClick={() => { void undoEntry(item.undoId ?? []); dismiss(item.id); }} className="rounded-lg px-2 py-1 font-bold text-accent hover:bg-accent-soft">
                {t("undo")}
              </button>
            </Toast.Action>
          ) : null}
          <Toast.Close aria-label={t("close")} className="text-muted hover:text-ink">
            <X size={14} />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed inset-x-0 bottom-4 z-[200] mx-auto flex w-[min(92vw,420px)] flex-col gap-2 outline-none" />
    </Toast.Provider>
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
  const count = useSelectionCount(open ? target : null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title={count === null ? t("delete") : t("confirmDelete", count)}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("cancel")}
          </Button>
          <Button
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

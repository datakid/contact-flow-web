import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "../../app/db";
import { formatNumber } from "../../app/i18n";
import { useApp } from "../../app/store";
import { isMappingValid } from "../../core/formats/mapping";
import { Button, Modal, cx } from "../../ui/primitives";
import { StepFinish } from "./StepFinish";
import { StepMapping } from "./StepMapping";
import { StepPreview } from "./StepPreview";
import { StepReview } from "./StepReview";
import { StepSource } from "./StepSource";
import { useW } from "./strings";
import { disposeImportWorker, useWizard } from "./wizardStore";

function FormatGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useW();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[var(--scrim)] anim-fade" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 end-0 z-[61] flex w-[min(92vw,440px)] flex-col border-s border-line bg-card shadow-[var(--shadow)] anim-fade">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <Dialog.Title className="serif text-2xl">{w.guide.title}</Dialog.Title>
            <Dialog.Close className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunk" aria-label={w.close}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="scroll-thin flex-1 space-y-5 overflow-auto p-5">
            {w.guide.items.map(([title, body]) => (
              <section key={title}>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink2">{body}</p>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ImportWizard() {
  const w = useW();
  const lang = useApp((s) => s.lang);
  const open = useApp((s) => s.dialog === "import");
  const closeDialog = useApp((s) => s.closeDialog);
  const step = useWizard((s) => s.step);
  const tables = useWizard((s) => s.tables);
  const goto = useWizard((s) => s.goto);
  const startParse = useWizard((s) => s.startParse);
  const commit = useWizard((s) => s.commit);
  const summary = useWizard((s) => s.summary);
  const parsing = useWizard((s) => s.parsing);
  const committing = useWizard((s) => s.committing);
  const result = useWizard((s) => s.result);
  const cancelledNote = useWizard((s) => s.cancelledNote);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    if (open) {
      useWizard.getState().reset();
      useWizard.setState({ country: useApp.getState().defaultCountry });
    }
  }, [open]);

  const close = (): void => {
    if (parsing) void useWizard.getState().cancelParse();
    void db.stageDiscard();
    disposeImportWorker();
    closeDialog();
    void useApp.getState().refresh();
  };

  const ready = tables.length > 0 && tables.every((t) => !t.loading);
  const previewable = tables.some((t) => t.preview?.ok);
  const mappingOk = tables.length > 0 && tables.every((t) => (t.preview?.ok ? isMappingValid(t.columns) : false));
  const included = summary?.included ?? 0;

  const canNext = step === 1 ? ready && previewable : step === 2 ? tables.some((t) => t.preview?.ok) : step === 3 ? mappingOk : step === 4 ? Boolean(summary) && !parsing && included >= 0 : false;

  const next = (): void => {
    if (step === 1) goto(2);
    else if (step === 2) goto(3);
    else if (step === 3) void startParse();
    else if (step === 4) void commit();
  };

  const back = (): void => {
    if (step === 4 && parsing) return;
    if (step === 4) void db.stageDiscard();
    if (step > 1 && step < 5) goto((step - 1) as 1 | 2 | 3);
  };

  return (
    <>
      <Modal open={open} onOpenChange={(o) => !o && close()} title={w.title} fullScreen>
        <div className="flex h-full flex-col">
          <ol className="flex items-center justify-center gap-2 border-b border-line bg-card px-4 py-3" aria-label={w.title}>
            {w.steps.map((label, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
                  <span className={cx("grid size-7 place-items-center rounded-full text-xs font-bold", active ? "bg-accent text-white" : done ? "bg-good text-white" : "bg-sunk text-muted")}>{done ? <Check size={14} /> : formatNumber(lang, n)}</span>
                  <span className={cx("hidden text-sm font-semibold sm:inline", active ? "text-ink" : "text-muted")}>{label}</span>
                  {i < w.steps.length - 1 ? <span className="mx-1 h-px w-6 bg-line" /> : null}
                </li>
              );
            })}
          </ol>
          {cancelledNote && step === 3 ? <div role="status" className="bg-accent-soft px-4 py-2 text-center text-sm">{w.cancelled}</div> : null}
          <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-paper">
            {step === 1 ? <StepSource onGuide={() => setGuide(true)} /> : null}
            {step === 2 ? <StepPreview /> : null}
            {step === 3 ? <StepMapping /> : null}
            {step === 4 ? <StepReview /> : null}
            {step === 5 ? <StepFinish onClose={close} /> : null}
          </div>
          {step < 5 ? (
            <div className="flex items-center justify-between border-t border-line bg-card px-5 py-3">
              <Button variant="ghost" onClick={back} disabled={step === 1 || parsing}>
                {w.back}
              </Button>
              <div className="flex items-center gap-3">
                {step === 4 && summary ? <span className="text-xs text-muted">{w.willImport(formatNumber(lang, included))}</span> : null}
                <Button variant="primary" onClick={next} disabled={!canNext || committing || result !== null}>
                  {step === 4 ? w.importNow(formatNumber(lang, included)) : w.next}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
      <FormatGuide open={guide && open} onOpenChange={setGuide} />
    </>
  );
}

import { CircleCheck } from "lucide-react";
import { formatNumber } from "../../app/i18n";
import { useApp } from "../../app/store";
import { Button, ProgressBar, Spinner } from "../../ui/primitives";
import { useW } from "./strings";
import { useWizard } from "./wizardStore";

export function StepFinish({ onClose }: { onClose: () => void }) {
  const w = useW();
  const lang = useApp((s) => s.lang);
  const committing = useWizard((s) => s.committing);
  const progress = useWizard((s) => s.commitProgress);
  const result = useWizard((s) => s.result);
  const error = useWizard((s) => s.parseError);
  const n = (v: number): string => formatNumber(lang, v);

  if (error && !result) {
    return (
      <div role="alert" className="mx-auto max-w-xl p-10 text-center">
        <div className="serif text-2xl text-danger">{w.stepFailed}</div>
        <p className="mt-2 text-sm text-ink2">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => useWizard.getState().goto(4)}>{w.back}</Button>
      </div>
    );
  }
  if (committing || !result) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-10">
        <div className="flex items-center gap-3 serif text-3xl">
          <Spinner size={22} /> {w.importing}
        </div>
        <ProgressBar value={progress && progress.total ? progress.done / progress.total : 0} />
        <div className="text-sm text-muted">{n(progress?.done ?? 0)} / {n(progress?.total ?? 0)}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-10 text-center">
      <CircleCheck size={44} className="text-good" />
      <div className="serif text-4xl">{w.done}</div>
      <p className="text-sm text-ink2">{w.doneBody(n(result.created), n(result.updated), n(result.skipped))}</p>
      <p className="text-xs text-muted">{w.undoHint}</p>
      <div className="mt-2 flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            useApp.getState().setFilter({ kind: "importBatch", batchId: result.batchId });
            onClose();
          }}
        >
          {w.viewImported}
        </Button>
        <Button variant="primary" onClick={onClose}>{w.close}</Button>
      </div>
    </div>
  );
}

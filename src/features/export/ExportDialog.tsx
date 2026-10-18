import * as Comlink from "comlink";
import { useEffect, useRef, useState } from "react";
import { db, spawnExportWorker } from "../../app/db";
import type { WorkerHandle } from "../../app/db";
import { formatNumber, useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { DEFAULT_EXPORT_OPTIONS, EXPORT_EXTENSIONS, previewText } from "../../core/formats/serialize";
import type { ExportFormat, ExportOptions, NumberStyle } from "../../core/formats/serialize";
import type { Contact } from "../../core/types";
import type { ExportWorkerApi } from "../../workers/export.worker";
import { Button, Checkbox, Field, inputClass, Modal, ProgressBar, Select } from "../../ui/primitives";

const OPTIONS_KEY = "cf3.exportOptions";

function loadOptions(): ExportOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (raw) return { ...DEFAULT_EXPORT_OPTIONS, ...(JSON.parse(raw) as Partial<ExportOptions>) };
  } catch {
    return DEFAULT_EXPORT_OPTIONS;
  }
  return DEFAULT_EXPORT_OPTIONS;
}

export function ExportDialog() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const open = useApp((s) => s.dialog === "export");
  const target = useApp((s) => s.exportTarget);
  const close = useApp((s) => s.closeDialog);
  const [options, setOptions] = useState<ExportOptions>(loadOptions);
  const [fileName, setFileName] = useState("contacts");
  const [sample, setSample] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const worker = useRef<WorkerHandle<ExportWorkerApi> | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    setError("");
    setProgress(null);
    setSample([]);
    setTotal(0);
    void db.readPage(target, 0, 4).then((page) => {
      setSample(page.contacts);
      setTotal(page.total);
    });
  }, [open, target]);

  useEffect(() => {
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch {
      return;
    }
  }, [options]);

  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]): void => setOptions((o) => ({ ...o, [key]: value }));
  const formats: Array<{ value: ExportFormat; label: string }> = [
    { value: "csv", label: t("fmt_csv") },
    { value: "vcard", label: t("fmt_vcard") },
    { value: "excel", label: t("fmt_excel") },
    { value: "json", label: t("fmt_json") },
    { value: "txt", label: t("fmt_txt") }
  ];
  const styles: Array<{ value: NumberStyle; label: string }> = [
    { value: "saved", label: t("asSaved") },
    { value: "intl", label: t("international") },
    { value: "digits", label: t("digitsOnly") }
  ];

  const run = async (): Promise<void> => {
    if (!target) return;
    setError("");
    setProgress({ done: 0, total });
    try {
      const handle = await spawnExportWorker();
      worker.current = handle;
      const outcome = await handle.api.run(target, options, Comlink.proxy((done: number, all: number) => setProgress({ done, total: all })));
      handle.terminate();
      worker.current = null;
      if (outcome.cancelled || !outcome.blob) {
        setProgress(null);
        return;
      }
      const name = `${fileName.trim() || "contacts"}.${outcome.ext}`;
      const file = new File([outcome.blob], name, { type: outcome.blob.type });
      const state = useApp.getState();
      const download = (f: File): void => {
        const url = URL.createObjectURL(f);
        const link = document.createElement("a");
        link.href = url;
        link.download = f.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      };
      if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") {
            setProgress(null);
            return;
          }
          download(file);
        }
      } else {
        download(file);
      }
      state.toast(`${t("exported")} · ${formatNumber(lang, outcome.count)}`);
      setProgress(null);
      close();
    } catch (e) {
      worker.current?.terminate();
      worker.current = null;
      setProgress(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancel = (): void => {
    void worker.current?.api.cancel();
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
  };

  const liveBusy = progress !== null;
  const lastShown = useRef({ busy: false, total: 0 });
  if (open) lastShown.current = { busy: liveBusy, total };
  const busy = open ? liveBusy : lastShown.current.busy;
  const shownTotal = open ? total : lastShown.current.total;
  const check = (key: keyof ExportOptions, label: string) => (
    <label key={key} className="flex items-center gap-2 text-sm">
      <Checkbox checked={Boolean(options[key])} onCheckedChange={(v) => set(key, v as never)} label={label} />
      {label}
    </label>
  );

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          if (busy) cancel();
          close();
        }
      }}
      title={t("exportTitle")}
      description={t("nContacts", shownTotal).replace(/^[\d,.\s]+/, `${formatNumber(lang, shownTotal)} `)}
      footer={
        busy ? (
          <Button variant="outline" onClick={cancel}>
            {t("cancel")}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              {t("cancel")}
            </Button>
            <Button variant="primary" disabled={!target || total === 0} onClick={() => void run()}>
              {t("saveFile")}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("format")}>
            <Select value={options.format} onValueChange={(v) => set("format", v)} options={formats} label={t("format")} />
          </Field>
          <Field label={t("fileName")}>
            <input className={inputClass} value={fileName} onChange={(e) => setFileName(e.target.value)} dir="auto" />
            <span className="text-[11px] font-normal text-muted">.{EXPORT_EXTENSIONS[options.format].ext}</span>
          </Field>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-ink2">{t("options")}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {check("everyNumber", t("everyNumber"))}
            {check("header", t("headerRow"))}
            {check("emails", t("incEmails"))}
            {check("company", t("incCompany"))}
            {check("notes", t("incNotes"))}
            {check("aliases", t("incAliases"))}
            {check("groups", t("groups"))}
            {check("contactId", t("incId"))}
          </div>
        </div>
        <Field label={t("phone")}>
          <Select value={options.numberStyle} onValueChange={(v) => set("numberStyle", v)} options={styles} label={t("phone")} />
        </Field>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-ink2">{t("preview")}</div>
          <pre dir="ltr" tabIndex={0} className="scroll-thin max-h-48 overflow-auto rounded-xl border border-line bg-sunk p-3 text-xs leading-relaxed text-ink2">
            {previewText(sample, options) || "—"}
          </pre>
        </div>
        {busy && progress ? (
          <div className="space-y-1.5">
            <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
            <div className="text-xs text-muted">
              {formatNumber(lang, progress.done)} / {formatNumber(lang, progress.total)}
            </div>
          </div>
        ) : null}
        {error ? <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}

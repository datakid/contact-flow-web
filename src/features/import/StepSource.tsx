import { Download, FileUp, TriangleAlert, X } from "lucide-react";
import { useRef, useState } from "react";
import { formatNumber } from "../../app/i18n";
import { useApp } from "../../app/store";
import { templateCsv, templateVcf, templateXlsx } from "../../core/formats/templates";
import { BLOCK_BYTES, WARN_BYTES } from "../../core/formats/reader";
import { Button, DropdownMenu, IconButton, Tab, TabList, TabPanel, Tabs, cx } from "../../ui/primitives";
import { useW } from "./strings";
import { useWizard } from "./wizardStore";

function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function StepSource({ onGuide }: { onGuide: () => void }) {
  const w = useW();
  const lang = useApp((s) => s.lang);
  const tables = useWizard((s) => s.tables);
  const addFiles = useWizard((s) => s.addFiles);
  const removeTable = useWizard((s) => s.removeTable);
  const [over, setOver] = useState(false);
  const [pasted, setPasted] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (list: FileList | File[]): void => {
    const files = [...list];
    const messages: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      if (f.size > BLOCK_BYTES) messages.push(w.blockLarge(f.name));
      else {
        if (f.size > WARN_BYTES) messages.push(w.warnLarge(f.name));
        accepted.push(f);
      }
    }
    setWarnings(messages);
    if (accepted.length) addFiles(accepted);
  };

  const fileOnly = new Map<string, { name: string; size: number }>();
  for (const t of tables) fileOnly.set(t.file.name + t.file.size, { name: t.file.name, size: t.file.size });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <Tabs defaultValue="files">
        <TabList>
          <Tab value="files">{w.filesTab}</Tab>
          <Tab value="paste">{w.pasteTab}</Tab>
        </TabList>
        <TabPanel value="files" className="pt-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (e.dataTransfer.files.length) take(e.dataTransfer.files);
            }}
            className={cx("grid place-items-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors", over ? "border-accent bg-accent-soft" : "border-line bg-card")}
          >
            <div className="flex flex-col items-center gap-3">
              <FileUp size={34} className="text-accent" />
              <div className="serif text-3xl">{w.dropTitle}</div>
              <p className="text-sm text-muted">{w.dropBody}</p>
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                {w.browse}
              </Button>
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && take(e.target.files)} />
            </div>
          </div>
        </TabPanel>
        <TabPanel value="paste" className="space-y-3 pt-4">
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={w.pasteHere} dir="auto" className="min-h-56 w-full rounded-2xl border border-line bg-card p-4 font-mono text-sm focus:border-accent focus:outline-none" />
          <Button
            variant="primary"
            disabled={!pasted.trim()}
            onClick={() => {
              take([new File([pasted], "pasted.txt", { type: "text/plain" })]);
              setPasted("");
            }}
          >
            {w.usePasted}
          </Button>
        </TabPanel>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu
          align="start"
          trigger={
            <Button variant="outline">
              <Download size={15} /> {w.templates}
            </Button>
          }
          entries={[
            { key: "csv", label: w.templateCsv, onSelect: () => download("Contact Flow template.csv", templateCsv(), "text/csv;charset=utf-8") },
            { key: "xlsx", label: w.templateXlsx, onSelect: () => download("Contact Flow template.xlsx", templateXlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") },
            { key: "vcf", label: w.templateVcf, onSelect: () => download("Contact Flow template.vcf", templateVcf(), "text/vcard;charset=utf-8") }
          ]}
        />
        <Button variant="ghost" onClick={onGuide}>
          {w.formatGuide}
        </Button>
      </div>
      {warnings.map((m) => (
        <div key={m} role="alert" className="flex items-start gap-2 rounded-xl bg-[#f6d860]/40 p-3 text-sm">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" /> {m}
        </div>
      ))}
      {fileOnly.size > 0 ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {[...fileOnly.values()].map((f) => (
            <li key={f.name + f.size} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">
                {f.name}
              </span>
              <span className="text-xs text-muted">{formatNumber(lang, Math.max(1, Math.round(f.size / 1024)))} KB</span>
              <IconButton
                label={w.remove}
                onClick={() => {
                  for (const t of tables) if (t.file.name === f.name && t.file.size === f.size) removeTable(t.key);
                }}
              >
                <X size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

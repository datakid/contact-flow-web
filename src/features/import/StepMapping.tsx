import { getCountries, getCountryCallingCode } from "libphonenumber-js/max";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../app/db";
import { useApp } from "../../app/store";
import type { TargetKind } from "../../core/formats/headers";
import { headerSignature, isMappingValid } from "../../core/formats/mapping";
import type { Confidence } from "../../core/formats/mapping";
import { Badge, Button, Checkbox, Field, inputClass, Select, Tab, TabList, Tabs } from "../../ui/primitives";
import { useW } from "./strings";
import { useWizard } from "./wizardStore";

const TARGETS: TargetKind[] = ["name", "first", "last", "phone", "email", "company", "note", "alias", "group", "id", "ignore"];

export function StepMapping() {
  const w = useW();
  const lang = useApp((s) => s.lang);
  const tables = useWizard((s) => s.tables);
  const activeKey = useWizard((s) => s.activeKey);
  const setActive = useWizard((s) => s.setActive);
  const setColumns = useWizard((s) => s.setColumns);
  const separators = useWizard((s) => s.separators);
  const setSeparators = useWizard((s) => s.setSeparators);
  const country = useWizard((s) => s.country);
  const setCountry = useWizard((s) => s.setCountry);
  const [presetName, setPresetName] = useState("");
  const [saved, setSaved] = useState(false);
  const [examples, setExamples] = useState<string[]>([]);
  const table = tables.find((t) => t.key === activeKey) ?? tables[0];

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([lang === "ar" ? "ar" : "en"], { type: "region" });
    return getCountries()
      .map((code) => ({ value: code as string, label: `${names.of(code) ?? code} (+${getCountryCallingCode(code)})` }))
      .sort((a, b) => a.label.localeCompare(b.label, lang));
  }, [lang]);

  const samples = useMemo(() => {
    const out: string[] = [];
    for (const t of tables) for (const c of t.columns) if (c.target === "phone") for (const s of c.samples) if (out.length < 3 && !out.includes(s)) out.push(s.split(/[;|,\n]/)[0]?.trim() ?? s);
    return out;
  }, [tables]);

  useEffect(() => {
    if (samples.length === 0) {
      setExamples([]);
      return;
    }
    void db.previewStoredNumbers(samples, country).then(setExamples);
  }, [samples, country]);

  useEffect(() => {
    void db.setDefaultCountry(country);
  }, [country]);

  if (!table || !table.preview || !table.preview.ok) return null;
  const confTone = (c: Confidence): "good" | "accent" | "neutral" => (c === "high" ? "good" : c === "medium" ? "accent" : "neutral");
  const sepRow = (key: keyof typeof separators, label: string) => (
    <label key={key} className="flex items-center gap-2 text-sm">
      <Checkbox checked={separators[key]} onCheckedChange={(v) => setSeparators({ ...separators, [key]: v })} label={label} />
      {label}
    </label>
  );
  const valid = isMappingValid(table.columns);
  const header = table.preview.header;

  return (
    <div className="flex flex-col">
      {tables.length > 1 ? (
        <Tabs value={table.key} onValueChange={setActive}>
          <TabList>
            {tables.map((t) => (
              <Tab key={t.key} value={t.key} badge={!isMappingValid(t.columns) ? <Badge tone="danger">!</Badge> : undefined}>
                <span className="max-w-48 truncate">{t.label}</span>
              </Tab>
            ))}
          </TabList>
        </Tabs>
      ) : null}
      <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
        {table.presetOffer ? (
          <div className="flex items-center gap-3 rounded-xl bg-accent-soft p-3 text-sm">
            <span className="flex-1">{w.presetFound(table.presetOffer.name)}</span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const preset = table.presetOffer;
                if (!preset) return;
                const map = JSON.parse(preset.mapping) as TargetKind[];
                setColumns(table.key, table.columns.map((c, i) => ({ ...c, target: map[i] ?? c.target, confidence: "high" })));
              }}
            >
              {w.applyPreset}
            </Button>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          <div className="grid grid-cols-[1fr_1.4fr_180px_90px] gap-3 border-b border-line bg-sunk px-4 py-2 text-xs font-bold text-ink2">
            <span>{w.sourceColumn}</span>
            <span>{w.samples}</span>
            <span>{w.mapTo}</span>
            <span />
          </div>
          <ul className="divide-y divide-line/70">
            {table.columns.map((col, index) => (
              <li key={col.index} className="grid grid-cols-[1fr_1.4fr_180px_90px] items-center gap-3 px-4 py-2">
                <span className="truncate text-sm font-semibold" dir="auto">
                  {header ? col.header || w.column(index + 1) : w.column(index + 1)}
                </span>
                <span className="truncate text-xs text-muted" dir="auto">
                  {col.samples.join(" · ") || "—"}
                </span>
                <Select value={col.target} onValueChange={(target) => setColumns(table.key, table.columns.map((c, i) => (i === index ? { ...c, target: target as TargetKind, confidence: "high" } : c)))} options={TARGETS.map((target) => ({ value: target, label: w.targets[target] }))} label={w.mapTo} className="w-full" />
                <span>{col.target === "ignore" ? null : <Badge tone={confTone(col.confidence)}>{w.confidence[col.confidence]}</Badge>}</span>
              </li>
            ))}
          </ul>
        </div>
        {!valid ? <p role="alert" className="text-sm text-danger">{w.needMapping}</p> : null}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-ink2">{w.separators}</div>
            <div className="grid grid-cols-2 gap-2">
              {sepRow("semicolon", w.sepSemicolon)}
              {sepRow("pipe", w.sepPipe)}
              {sepRow("comma", w.sepComma)}
              {sepRow("newline", w.sepNewline)}
            </div>
          </div>
          <div className="space-y-2.5">
            <Field label={w.defaultCountry}>
              <Select value={country} onValueChange={setCountry} options={countries} label={w.defaultCountry} className="w-full" />
            </Field>
            {samples.length > 0 ? (
              <div className="rounded-xl bg-sunk p-3 text-xs">
                <div className="mb-1 font-semibold text-ink2">{w.willStoreAs}</div>
                {samples.map((s, i) => (
                  <div key={s} className="flex items-center gap-2 tabular-nums" dir="ltr">
                    <span className="text-muted">{s}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-semibold">{examples[i] ?? "…"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {header ? (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!presetName.trim()) return;
              void db
                .savePreset({ id: `p_${Date.now().toString(36)}`, name: presetName.trim(), signature: headerSignature(header), mapping: JSON.stringify(table.columns.map((c) => c.target)) })
                .then(() => {
                  setSaved(true);
                  setPresetName("");
                });
            }}
          >
            <Field label={w.savePreset}>
              <input className={`${inputClass} w-64`} value={presetName} onChange={(e) => { setPresetName(e.target.value); setSaved(false); }} placeholder={w.presetName} />
            </Field>
            <Button type="submit" variant="outline" disabled={!presetName.trim()}>
              {w.savePreset}
            </Button>
            {saved ? <span className="pb-2 text-xs font-semibold text-good">{w.presetSaved}</span> : null}
          </form>
        ) : null}
      </div>
    </div>
  );
}

import { getCountries, getCountryCallingCode } from "libphonenumber-js/max";
import { useEffect, useMemo, useState } from "react";
import { loadSampleContacts } from "../../app/actions";
import { db } from "../../app/db";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { LayoutMode, ThemeMode } from "../../core/types";
import { Button, Modal, Segmented, Select } from "../../ui/primitives";

export const APP_VERSION = "3.0.0";

const LICENSES: Array<[string, string]> = [
  ["React", "MIT"],
  ["Radix UI", "MIT"],
  ["Tailwind CSS", "MIT"],
  ["lucide-react", "ISC"],
  ["zustand", "MIT"],
  ["Comlink", "Apache-2.0"],
  ["SQLite (sqlite-wasm)", "Public domain / Apache-2.0"],
  ["TanStack Virtual", "MIT"],
  ["Glide Data Grid", "MIT"],
  ["PapaParse", "MIT"],
  ["SheetJS Community Edition", "Apache-2.0"],
  ["@streamparser/json", "MIT"],
  ["libphonenumber-js", "MIT"],
  ["pinyin-pro", "MIT"],
  ["jschardet", "LGPL-2.1"],
  ["double-metaphone", "MIT"],
  ["Manrope, Instrument Serif, IBM Plex Sans Arabic", "OFL-1.1"]
];

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/70 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsDialog() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const open = useApp((s) => s.dialog === "settings");
  const close = useApp((s) => s.closeDialog);
  const theme = useApp((s) => s.theme);
  const layout = useApp((s) => s.layout);
  const country = useApp((s) => s.defaultCountry);
  const setLang = useApp((s) => s.setLang);
  const setTheme = useApp((s) => s.setTheme);
  const setLayout = useApp((s) => s.setLayout);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (open) setConfirmClear(false);
  }, [open]);
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([lang === "ar" ? "ar" : "en"], { type: "region" });
    return getCountries()
      .map((code) => ({ value: code as string, label: `${names.of(code) ?? code} (+${getCountryCallingCode(code)})` }))
      .sort((a, b) => a.label.localeCompare(b.label, lang));
  }, [lang]);

  const clearAll = async (): Promise<void> => {
    const state = useApp.getState();
    try {
      await db.wipe();
      state.clearSelection();
      state.setFocused(null);
      state.setFilter({ kind: "all" });
      state.setSearch("");
      await state.refresh();
      setConfirmClear(false);
      state.closeDialog();
    } catch (error) {
      state.toast(error instanceof Error ? error.message : String(error), null, "error");
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title={t("settings")}>
      <div className="px-5 py-2">
        <Row label={t("language")}>
          <Segmented label={t("language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]} />
        </Row>
        <Row label={t("theme")}>
          <Segmented<ThemeMode> label={t("theme")} value={theme} onChange={setTheme} options={[{ value: "system", label: t("themeSystem") }, { value: "light", label: t("themeLight") }, { value: "dark", label: t("themeDark") }]} />
        </Row>
        <Row label={t("layout")}>
          <Segmented<LayoutMode> label={t("layout")} value={layout} onChange={setLayout} options={[{ value: "auto", label: t("layout_auto") }, { value: "compact", label: t("layout_narrow") }, { value: "desktop", label: t("layout_wide") }]} />
        </Row>
        <Row label={t("countryCode")}>
          <Select value={country} onValueChange={(c) => { void db.setDefaultCountry(c); useApp.setState({ defaultCountry: c }); }} options={countries} label={t("countryCode")} className="w-64" />
        </Row>
        <Row label={t("loadSample")}>
          <Button size="sm" onClick={() => void loadSampleContacts()}>
            {t("loadSample")}
          </Button>
        </Row>
        <Row label={t("runSelfTest")}>
          <Button size="sm" onClick={() => useApp.getState().openDialog("selftest")}>
            {t("runSelfTest")}
          </Button>
        </Row>
        <Row label={t("clearLibrary")} hint={confirmClear ? t("clearConfirm") : undefined}>
          {confirmClear ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                {t("cancel")}
              </Button>
              <Button size="sm" variant="danger" onClick={() => void clearAll()}>
                {t("delete")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="text-danger" onClick={() => setConfirmClear(true)}>
              {t("clearLibrary")}
            </Button>
          )}
        </Row>
        <details className="border-b border-line/70 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">{t("licenses")}</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted" dir="ltr">
            {LICENSES.map(([name, license]) => (
              <li key={name} className="flex justify-between gap-4">
                <span>{name}</span>
                <span>{license}</span>
              </li>
            ))}
          </ul>
        </details>
        <div className="py-4 text-xs leading-relaxed text-muted">
          <div className="mb-1 font-semibold text-ink2">
            {t("about")} · {t("version")} {APP_VERSION}
          </div>
          <p>{t("privacyBody")}</p>
          <p className="mt-2">{t("tagline")}</p>
        </div>
      </div>
    </Modal>
  );
}

import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { Modal } from "../../ui/primitives";

export function ShortcutsDialog() {
  const t = useT();
  const open = useApp((s) => s.dialog === "shortcuts");
  const close = useApp((s) => s.closeDialog);
  const rows: Array<[string, string]> = [
    ["Ctrl/⌘ K", t("scCommandPalette")],
    ["/", t("scFocusSearch")],
    ["N", t("scNewContact")],
    ["E", t("scEditField")],
    ["S", t("scStar")],
    ["Delete", t("scDelete")],
    ["↑ ↓", t("scMove")],
    ["Shift ↑ ↓", t("scExtend")],
    ["Ctrl/⌘ A", t("scSelectAll")],
    ["Esc", t("scEscape")],
    ["Ctrl/⌘ I", t("scImport")],
    ["Ctrl/⌘ Shift E", t("scExport")],
    ["Ctrl/⌘ Z", t("scUndo")],
    ["Ctrl/⌘ B", t("scSidebar")],
    ["Ctrl/⌘ 1 / 2", t("scViews")],
    ["?", t("shortcuts")]
  ];
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title={t("shortcuts")}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 p-5 text-sm">
        {rows.map(([keys, label]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="rounded-md border border-line bg-sunk px-2 py-0.5 text-xs font-semibold text-ink2" dir="ltr">
                {keys}
              </kbd>
            </dt>
            <dd className="text-ink2">{label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

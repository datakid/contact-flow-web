import { useCallback, useEffect, useState } from "react";
import { db } from "../../app/db";
import { formatNumber, useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { HistoryEntry } from "../../core/db/library";
import { Button, DelayedSpinner, Modal } from "../../ui/primitives";

const PAGE = 50;

export function HistoryDialog() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const open = useApp((s) => s.dialog === "history");
  const close = useApp((s) => s.closeDialog);
  const version = useApp((s) => s.version);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (offset: number, replace: boolean) => {
    setLoading(true);
    const page = await db.listHistory(PAGE, offset);
    setEntries((prev) => (replace ? page.entries : [...prev, ...page.entries]));
    setTotal(page.total);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void load(0, true);
  }, [open, version, load]);

  const ago = (ms: number): string => {
    const diff = Date.now() - ms;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("justNow");
    if (minutes < 60) return t("minAgo", minutes);
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("hAgo", hours);
    return t("dAgo", Math.floor(hours / 24));
  };

  const undo = async (id: string): Promise<void> => {
    const state = useApp.getState();
    await db.undo(id);
    await state.refresh();
    state.toast(t("undone"));
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title={t("history")} description={t("historySub")} size="md">
      <div className="p-2">
        {entries.length === 0 && !loading ? <p className="p-6 text-center text-sm text-muted">{t("noHistory")}</p> : null}
        <ul>
          {entries.map((entry, index) => (
            <li key={entry.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunk">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{entry.label}</div>
                <div className="text-xs text-muted">
                  {ago(entry.createdAt)} · {t("nAffected", entry.affected).replace(/^[\d,.\s]+/, `${formatNumber(lang, entry.affected)} `)}
                </div>
              </div>
              <Button size="sm" variant={index === 0 ? "soft" : "outline"} onClick={() => void undo(entry.id)}>
                {t("undo")}
              </Button>
            </li>
          ))}
        </ul>
        {loading ? <div className="grid place-items-center p-4"><DelayedSpinner /></div> : null}
        {entries.length < total && !loading ? (
          <div className="p-2 text-center">
            <Button size="sm" variant="ghost" onClick={() => void load(entries.length, false)}>
              {t("loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

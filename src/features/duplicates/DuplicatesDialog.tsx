import { useCallback, useEffect, useState } from "react";
import { db } from "../../app/db";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { DuplicateGroup } from "../../core/db/service";
import { Avatar, Badge, Button, Modal, Spinner, cx } from "../../ui/primitives";

const PAGE = 50;

export function DuplicatesDialog() {
  const t = useT();
  const open = useApp((s) => s.dialog === "duplicates");
  const close = useApp((s) => s.closeDialog);
  const version = useApp((s) => s.version);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await db.duplicateGroups(PAGE, 0);
    setGroups(result.groups);
    setTotal(result.total);
    setKeep(Object.fromEntries(result.groups.map((g) => [g.key, g.keepId])));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, version, load]);

  const merge = async (groupList: DuplicateGroup[]): Promise<void> => {
    setBusy(true);
    const state = useApp.getState();
    const historyIds: string[] = [];
    for (const g of groupList) {
      const merged = await db.mergeGroup(keep[g.key] ?? g.keepId, g.members.map((m) => m.id), t("merged", 1));
      if (merged.historyId) historyIds.push(merged.historyId);
    }
    await state.refresh();
    state.toast(t("merged", groupList.length), historyIds.length > 0 ? historyIds : null);
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t("duplicates")}
      description={t("dupSub")}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("close")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              useApp.getState().setFilter({ kind: "duplicates" });
              close();
            }}
          >
            {t("duplicates")}
          </Button>
          <Button variant="primary" disabled={busy || groups.length === 0} onClick={() => void merge(groups)}>
            {t("mergeN", groups.length)}
          </Button>
        </>
      }
    >
      <div className="space-y-3 p-4">
        {loading ? <div className="grid place-items-center p-8"><Spinner size={22} /></div> : null}
        {!loading && groups.length === 0 ? <p className="p-8 text-center text-sm text-muted">{t("noDuplicates")}</p> : null}
        {groups.map((g) => (
          <section key={g.key} className="rounded-2xl border border-line bg-paper p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge tone="accent">{g.reason === "number" ? t("sharedNumber") : t("sameName")}</Badge>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void merge([g])}>
                {t("mergeN", 1)}
              </Button>
            </div>
            <ul className="space-y-1">
              {g.members.map((m) => (
                <li key={m.id}>
                  <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5", keep[g.key] === m.id ? "bg-accent-soft" : "hover:bg-sunk")}>
                    <input type="radio" name={`keep-${g.key}`} checked={keep[g.key] === m.id} onChange={() => setKeep({ ...keep, [g.key]: m.id })} className="accent-[var(--accent)]" />
                    <Avatar name={m.name} seed={m.id} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{m.name || t("noName")}</div>
                      <div className="truncate text-xs text-muted" dir="auto">
                        {[...m.phones.map((p) => p.value), ...m.emails.map((e) => e.value), m.company].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {keep[g.key] === m.id ? <Badge tone="good">{t("keep")}</Badge> : null}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {total > groups.length ? <p className="text-center text-xs text-muted">{t("andMore", total - groups.length)}</p> : null}
      </div>
    </Modal>
  );
}

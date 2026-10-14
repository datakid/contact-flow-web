import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { saveContactInput } from "../../app/actions";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import type { ContactInput } from "../../core/types";
import { emptyContactInput } from "../../core/types";
import { Button, Field, Modal, inputClass } from "../../ui/primitives";

export function CreateDialog() {
  const t = useT();
  const open = useApp((s) => s.dialog === "create");
  const close = useApp((s) => s.closeDialog);
  const [draft, setDraft] = useState<ContactInput>(emptyContactInput());
  const [groups, setGroups] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(emptyContactInput());
      setGroups("");
      setError("");
    }
  }, [open]);

  const setList = (key: "phones" | "emails", index: number, value: string): void => setDraft((d) => ({ ...d, [key]: d[key].map((x, i) => (i === index ? { ...x, value } : x)) }));
  const addRow = (key: "phones" | "emails"): void => setDraft((d) => ({ ...d, [key]: [...d[key], { value: "", label: key === "phones" ? "mobile" : "work" }] }));
  const removeRow = (key: "phones" | "emails", index: number): void => setDraft((d) => ({ ...d, [key]: d[key].filter((_, i) => i !== index) }));

  const save = async (): Promise<void> => {
    const input: ContactInput = { ...draft, groups: groups.split(/[,،]/).map((g) => g.trim()).filter(Boolean) };
    const hasContent = input.name.trim() || input.phones.some((p) => p.value.trim()) || input.emails.some((e) => e.value.trim());
    if (!hasContent) {
      setError(t("nameRequired"));
      return;
    }
    const saved = await saveContactInput(input);
    if (saved) close();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close()}
      title={t("newContact")}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("cancel")}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={t("name")}>
          <input autoFocus className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label={t("company")}>
          <input className={inputClass} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
        </Field>
        {(["phones", "emails"] as const).map((key) => (
          <div key={key} className="space-y-2">
            <div className="text-xs font-semibold text-ink2">{key === "phones" ? t("phones") : t("emails")}</div>
            {draft[key].map((item, index) => (
              <div key={index} className="flex gap-2">
                <input dir="ltr" inputMode={key === "phones" ? "tel" : "email"} className={inputClass} value={item.value} onChange={(e) => setList(key, index, e.target.value)} aria-label={key === "phones" ? t("phone") : t("email")} />
                <Button variant="ghost" size="sm" onClick={() => removeRow(key, index)} aria-label={t("delete")}>
                  <X size={14} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="soft" onClick={() => addRow(key)}>
              <Plus size={14} /> {key === "phones" ? t("addPhone") : t("addEmail")}
            </Button>
          </div>
        ))}
        <Field label={t("aliases")} hint={t("aliasHint")}>
          <input className={inputClass} value={draft.aliases.join(", ")} onChange={(e) => setDraft({ ...draft, aliases: e.target.value.split(/[,،]/).map((a) => a.trim()).filter(Boolean) })} />
        </Field>
        <Field label={t("groups")} hint={t("groupsHint")}>
          <input className={inputClass} value={groups} onChange={(e) => setGroups(e.target.value)} />
        </Field>
        <Field label={t("note")}>
          <textarea className="min-h-20 w-full rounded-xl border border-line bg-card p-3 text-sm focus:border-accent focus:outline-none" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </Field>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <button type="submit" className="sr-only">
          {t("save")}
        </button>
      </form>
    </Modal>
  );
}

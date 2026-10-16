import { ChevronLeft, Copy, EllipsisVertical, MessageCircle, MessageSquare, Phone, Plus, Send, Share2, Star, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contactToInput, copyText, createGroupNamed, findDuplicatesOf, saveContactInput, shareVCard, toggleStar } from "../../app/actions";
import type { CountryCode } from "libphonenumber-js/max";
import { firstReachable, messageUrl } from "../../core/messaging";
import type { MessageChannel } from "../../core/messaging";
import { db } from "../../app/db";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { styleNumber } from "../../core/phone";
import type { Contact, ContactInput, LabeledValue } from "../../core/types";
import { PHONE_LABELS, EMAIL_LABELS } from "../../core/types";
import { Avatar, Button, DropdownMenu, IconButton, LinkButton, Popover, PopoverContent, PopoverTrigger, Select, Spinner, cx } from "../../ui/primitives";
import { InlineText } from "./Inline";

const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{children}</h3>;
}

type LabelKey = "labelMobile" | "labelHome" | "labelWork" | "labelOther";
const LABEL_KEYS: Record<string, LabelKey> = { mobile: "labelMobile", home: "labelHome", work: "labelWork", other: "labelOther" };

function ValueRows({ kind, items, onChange }: { kind: "phone" | "email"; items: LabeledValue[]; onChange: (next: LabeledValue[]) => void }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const idsRef = useRef<string[]>([]);
  while (idsRef.current.length < items.length) idsRef.current.push(crypto.randomUUID());
  idsRef.current.length = items.length;
  const removeAt = (index: number): void => {
    idsRef.current.splice(index, 1);
    onChange(items.filter((_, i) => i !== index));
  };
  const labels = kind === "phone" ? PHONE_LABELS : EMAIL_LABELS;
  const labelOptions = labels.map((l) => ({ value: l as string, label: t(LABEL_KEYS[l] ?? "labelOther") }));
  const defaultLabel = kind === "phone" ? "mobile" : "work";
  return (
    <div className="flex flex-col">
      {items.map((item, index) => (
        <div key={idsRef.current[index]} className="group flex items-center gap-1">
          <Select value={item.label || defaultLabel} onValueChange={(label) => onChange(items.map((x, i) => (i === index ? { ...x, label } : x)))} options={labelOptions} label={t("label")} className="h-8 w-24 border-transparent bg-transparent text-xs text-muted" />
          <div className="min-w-0 flex-1">
            <InlineText value={item.value} dir="ltr" inputMode={kind === "phone" ? "tel" : "email"} placeholder={kind === "phone" ? t("phone") : t("email")} onSave={(value) => value.trim() ? onChange(items.map((x, i) => (i === index ? { ...x, value } : x))) : removeAt(index)} className="tabular-nums" />
          </div>
          <IconButton label={t("delete")} onClick={() => removeAt(index)} className="opacity-0 group-hover:opacity-100 focus:opacity-100">
            <X size={14} />
          </IconButton>
        </div>
      ))}
      {adding ? (
        <div className="ps-[104px]">
          <InlineText value="" startEditing dir="ltr" inputMode={kind === "phone" ? "tel" : "email"} placeholder={kind === "phone" ? t("phone") : t("email")} onEditingChange={(e) => !e && setAdding(false)} onSave={(value) => value.trim() && onChange([...items, { value: value.trim(), label: defaultLabel }])} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-start text-sm font-semibold text-accent hover:bg-accent-soft">
          <Plus size={14} /> {kind === "phone" ? t("addPhone") : t("addEmail")}
        </button>
      )}
    </div>
  );
}

function AliasChips({ aliases, onChange }: { aliases: string[]; onChange: (next: string[]) => void }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2">
      {aliases.map((alias) => (
        <span key={alias} className="inline-flex items-center gap-1 rounded-full bg-sunk py-1 ps-3 pe-1.5 text-sm" dir="auto">
          {alias}
          <button type="button" aria-label={t("delete")} onClick={() => onChange(aliases.filter((a) => a !== alias))} className="grid size-5 place-items-center rounded-full text-muted hover:bg-line">
            <X size={12} />
          </button>
        </span>
      ))}
      {adding ? (
        <div className="w-40">
          <InlineText value="" startEditing placeholder={t("alias")} onEditingChange={(e) => !e && setAdding(false)} onSave={(value) => value.trim() && !aliases.includes(value.trim()) && onChange([...aliases, value.trim()])} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-faint px-3 py-1 text-sm font-semibold text-accent hover:bg-accent-soft">
          <Plus size={13} /> {t("addAlias")}
        </button>
      )}
    </div>
  );
}

function GroupChips({ groups, onChange }: { groups: string[]; onChange: (next: string[]) => void }) {
  const t = useT();
  const all = useApp((s) => s.counts?.groups ?? []);
  const [draft, setDraft] = useState("");
  const available = all.filter((g) => !groups.includes(g.name));
  const colorOf = (name: string): string => all.find((g) => g.name === name)?.color ?? "var(--accent)";
  const add = async (name: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || groups.includes(trimmed)) return;
    if (!all.some((g) => g.name === trimmed)) await createGroupNamed(trimmed);
    onChange([...groups, trimmed]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2">
      {groups.map((name) => (
        <span key={name} className="inline-flex items-center gap-1.5 rounded-full bg-sunk py-1 ps-2.5 pe-1.5 text-sm">
          <span className="size-2 rounded-full" style={{ background: colorOf(name) }} />
          {name}
          <button type="button" aria-label={t("delete")} onClick={() => onChange(groups.filter((g) => g !== name))} className="grid size-5 place-items-center rounded-full text-muted hover:bg-line">
            <X size={12} />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-faint px-3 py-1 text-sm font-semibold text-accent hover:bg-accent-soft">
            <Plus size={13} /> {t("addToGroup")}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-60">
          <div className="flex flex-col gap-1">
            {available.length === 0 ? <div className="px-2 py-1 text-sm text-muted">{t("noGroups")}</div> : null}
            {available.map((g) => (
              <button key={g.id} type="button" onClick={() => void add(g.name)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-sunk">
                <span className="size-2.5 rounded-full" style={{ background: g.color }} />
                {g.name}
              </button>
            ))}
            <form
              className="mt-1 flex gap-1 border-t border-line pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                void add(draft);
              }}
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("groupNamePh")} className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-sm outline-none focus:border-accent" />
              <Button size="sm" variant="primary" type="submit" disabled={!draft.trim()}>
                {t("done")}
              </Button>
            </form>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function DetailPane({ onBack }: { onBack?: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const focusedId = useApp((s) => s.focusedId);
  const version = useApp((s) => s.version);
  const editingId = useApp((s) => s.editingId);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [editName, setEditName] = useState(false);
  const country = useApp((s) => s.defaultCountry) as CountryCode;
  const latestRef = useRef<Contact | null>(null);
  const pendingSaves = useRef(0);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    if (!focusedId) {
      latestRef.current = null;
      setContact(null);
      return;
    }
    if (latestRef.current && latestRef.current.id !== focusedId) {
      latestRef.current = null;
      setContact(null);
    }
    setLoading(true);
    void db.getContact(focusedId).then((c) => {
      if (!alive) return;
      const editingThis = pendingSaves.current > 0 && latestRef.current?.id === focusedId;
      if (!editingThis) {
        latestRef.current = c;
        setContact(c);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [focusedId, version]);

  useEffect(() => {
    if (editingId && editingId === contact?.id) {
      setEditName(true);
      useApp.setState({ editingId: null });
    }
  }, [editingId, contact?.id]);

  const patch = useCallback((changes: Partial<ContactInput>) => {
    const current = latestRef.current;
    if (!current || current.id !== useApp.getState().focusedId) return;
    const next = { ...current, ...changes } as Contact;
    latestRef.current = next;
    setContact(next);
    pendingSaves.current += 1;
    saveChain.current = saveChain.current
      .then(() => saveContactInput(contactToInput(next)))
      .finally(() => {
        pendingSaves.current -= 1;
      });
  }, []);

  const stamp = useMemo(() => (ms: number): string => new Date(ms).toLocaleString(lang === "ar" ? "ar" : undefined, { dateStyle: "medium", timeStyle: "short" }), [lang]);

  if (!focusedId || (!contact && !loading)) {
    return (
      <aside className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-muted">
        <UserRound size={34} className="text-faint" />
        <div className="serif text-2xl text-ink">{t("emptyDetailTitle")}</div>
        <p className="max-w-xs text-sm">{t("emptyDetailBody")}</p>
        <div className="mt-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-xs">
          {[["Ctrl K", t("scCommandPalette")], ["N", t("scNewContact")], ["/", t("scFocusSearch")], ["?", t("shortcuts")]].map(([k, v]) => (
            <div key={k} className="contents">
              <kbd className="rounded-md border border-line bg-card px-1.5 py-0.5 font-sans font-semibold text-ink2">{k}</kbd>
              <span className="text-start">{v}</span>
            </div>
          ))}
        </div>
      </aside>
    );
  }
  if (!contact) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner size={22} />
      </div>
    );
  }
  const reachable = firstReachable(contact.phones, country);
  const linkFor = (channel: MessageChannel): string | null => (reachable ? messageUrl(channel, reachable, country) : null);
  const unreachableReason = t(contact.phones.length > 0 ? "needsCountryCode" : "noNumberToMessage");
  return (
    <aside className="flex h-full min-h-0 flex-col" aria-label={contact.name}>
      <div className="border-b border-line px-5 pb-4 pt-5">
        {onBack ? (
          <Button size="sm" variant="ghost" onClick={onBack} className="-ms-2 mb-2">
            <ChevronLeft size={16} className="rtl:rotate-180" /> {t("back")}
          </Button>
        ) : null}
        <div className="flex items-start gap-4">
          <Avatar name={contact.name} seed={contact.id} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <InlineText value={contact.name} placeholder={t("name")} startEditing={editName} onEditingChange={(e) => !e && setEditName(false)} onSave={(name) => patch({ name })} className="serif text-[28px] leading-tight" inputClassName="serif text-[28px] leading-tight" />
              </div>
              <button type="button" aria-label={contact.starred ? t("unstar") : t("star")} aria-pressed={contact.starred} onClick={() => void toggleStar(contact)} className="mt-1 grid size-9 shrink-0 place-items-center rounded-full hover:bg-sunk">
                <Star size={20} className={cx(contact.starred ? "fill-accent text-accent" : "text-muted")} />
              </button>
            </div>
            <InlineText value={contact.company} placeholder={t("company")} onSave={(company) => patch({ company })} className="text-sm text-ink2" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {COARSE ? (
            <>
              <LinkButton size="sm" href={linkFor("tel")} disabledReason={unreachableReason}>
                <Phone size={14} /> {t("call")}
              </LinkButton>
              <LinkButton size="sm" href={linkFor("sms")} disabledReason={unreachableReason}>
                <MessageSquare size={14} /> {t("sms")}
              </LinkButton>
            </>
          ) : null}
          <LinkButton size="sm" href={linkFor("whatsapp")} disabledReason={unreachableReason}>
            <MessageCircle size={14} /> {t("whatsapp")}
          </LinkButton>
          <LinkButton size="sm" href={linkFor("signal")} disabledReason={unreachableReason}>
            <Send size={14} /> {t("signal")}
          </LinkButton>
          <Button size="sm" variant="outline" onClick={() => void copyText([contact.name, ...contact.phones.map((p) => p.value), ...contact.emails.map((e) => e.value)].filter(Boolean).join("\n"))}>
            <Copy size={14} /> {t("copy")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void shareVCard(contact)}>
            <Share2 size={14} /> {t("shareVcard")}
          </Button>
          <DropdownMenu
            trigger={
              <IconButton label={t("more")} className="border border-line bg-card">
                <EllipsisVertical size={15} />
              </IconButton>
            }
            entries={[
              { key: "dup", label: t("duplicateContact"), onSelect: () => void saveContactInput({ ...contactToInput(contact), id: undefined, name: contact.name, importBatch: null, createdAt: undefined, updatedAt: undefined }) },
              { key: "similar", label: t("findSimilar"), onSelect: () => void findDuplicatesOf(contact) },
              { key: "sep", label: "", separator: true },
              { key: "delete", label: t("delete"), danger: true, onSelect: () => useApp.getState().openDialog("confirmDelete", { kind: "ids", ids: [contact.id] }) }
            ]}
          />
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-auto px-3 py-4">
        <section>
          <SectionTitle>{t("phones")}</SectionTitle>
          <ValueRows kind="phone" items={contact.phones} onChange={(phones) => patch({ phones })} />
        </section>
        <section>
          <SectionTitle>{t("emails")}</SectionTitle>
          <ValueRows kind="email" items={contact.emails} onChange={(emails) => patch({ emails })} />
        </section>
        <section>
          <SectionTitle>{t("aliases")}</SectionTitle>
          <AliasChips aliases={contact.aliases} onChange={(aliases) => patch({ aliases })} />
        </section>
        <section>
          <SectionTitle>{t("groups")}</SectionTitle>
          <GroupChips groups={contact.groups} onChange={(groups) => patch({ groups })} />
        </section>
        <section>
          <SectionTitle>{t("note")}</SectionTitle>
          <InlineText value={contact.note} multiline placeholder={t("addNote")} onSave={(note) => patch({ note })} />
        </section>
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-xs text-muted">
        <span>
          {t("created")}: {stamp(contact.createdAt)}
        </span>
        <span>
          {t("updated")}: {stamp(contact.updatedAt)}
        </span>
        <span className="flex items-center gap-1">
          <span className="tabular-nums">{contact.id}</span>
          <IconButton label={t("copyId")} onClick={() => void copyText(contact.id)} className="size-6">
            <Copy size={12} />
          </IconButton>
        </span>
      </footer>
    </aside>
  );
}

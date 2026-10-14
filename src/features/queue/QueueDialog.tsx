import { MessageCircle, Play, Send, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { copyText, messageUrl } from "../../app/actions";
import { db } from "../../app/db";
import { formatNumber, useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { styleNumber } from "../../core/phone";
import { fillTokens } from "../../core/ops/ops";
import type { Contact } from "../../core/types";
import { Avatar, Button, Modal, ProgressBar, Segmented, cx } from "../../ui/primitives";

type Channel = "sms" | "whatsapp" | "signal";

interface Queue {
  ids: string[];
  template: string;
  channel: Channel;
  index: number;
}

const QUEUE_KEY = "queue";
const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const TOKENS = ["{first}", "{last}", "{name}", "{alias}", "{company}"];

async function loadQueue(): Promise<Queue | null> {
  const raw = await db.getKv(QUEUE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Queue;
  } catch {
    return null;
  }
}

async function saveQueue(queue: Queue | null): Promise<void> {
  await db.setKv(QUEUE_KEY, queue ? JSON.stringify(queue) : "");
}

export function QueueDialog() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const open = useApp((s) => s.dialog === "queue");
  const target = useApp((s) => s.queueTarget);
  const close = useApp((s) => s.closeDialog);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Contact[]>([]);
  const [template, setTemplate] = useState("");
  const [channel, setChannel] = useState<Channel>(COARSE ? "sms" : "whatsapp");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [saved, setSaved] = useState<Queue | null>(null);
  const [current, setCurrent] = useState<Contact | null>(null);

  useEffect(() => {
    if (!open) return;
    setQueue(null);
    setTemplate("");
    void loadQueue().then((q) => {
      setSaved(q && q.index < q.ids.length ? q : null);
      if (!target && q) setQueue(q);
    });
    if (!target) {
      setRecipientIds([]);
      setRecipients([]);
      return;
    }
    void db.queueRecipients(target, 30).then((r) => {
      setRecipientIds(r.ids);
      setRecipients(r.preview);
    });
  }, [open, target]);

  useEffect(() => {
    const id = queue?.ids[queue.index];
    if (!id) {
      setCurrent(null);
      return;
    }
    void db.getContact(id).then(setCurrent);
  }, [queue]);

  const channels = useMemo(() => (["sms", "whatsapp", "signal"] as Channel[]).filter((c) => COARSE || c !== "sms"), []);

  const start = async (): Promise<void> => {
    if (!template.trim()) return;
    const q: Queue = { ids: recipientIds, template, channel, index: 0 };
    await saveQueue(q);
    setQueue(q);
  };

  const advance = async (q: Queue): Promise<void> => {
    const next = { ...q, index: q.index + 1 };
    await saveQueue(next);
    setQueue(next);
  };

  const reset = async (): Promise<void> => {
    await saveQueue(null);
    setQueue(null);
    setSaved(null);
    if (recipientIds.length === 0) close();
  };

  const message = queue && current ? fillTokens(queue.template, current, queue.index + 1, true) : "";
  const done = queue ? queue.index >= queue.ids.length : false;

  const openApp = async (): Promise<void> => {
    if (!queue || !current) return;
    const number = current.phones[0]?.value ?? "";
    if (queue.channel === "signal") await copyText(message);
    const link = messageUrl(queue.channel, number, message);
    if (link.startsWith("http")) window.open(link, "_blank", "noopener");
    else window.location.href = link;
    window.setTimeout(() => void advance(queue), 300);
  };

  const preview = recipients[0] ? fillTokens(template || "…", recipients[0], 1, true) : "";

  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title={t("messages")} description={queue ? undefined : t("msgSub")} size="md">
      {queue ? (
        <div className="space-y-4 p-5">
          <ProgressBar value={queue.ids.length ? Math.min(queue.index, queue.ids.length) / queue.ids.length : 1} />
          <p className="text-center text-sm text-muted">{t("queueOf", Math.min(queue.index + 1, queue.ids.length), queue.ids.length).replace(/\d[\d,.]*/g, (m) => formatNumber(lang, Number(m.replace(/,/g, ""))))}</p>
          {done || !current ? (
            <div className="rounded-2xl border border-line bg-card p-6 text-center">
              <div className="serif text-3xl">{t("finished")}</div>
              <p className="mt-1 text-sm text-muted">{t("nContacts", queue.ids.length)}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card p-6 text-center">
              <Avatar name={current.name} seed={current.id} size={56} />
              <div className="serif text-2xl" dir="auto">{current.name || current.phones[0]?.value}</div>
              <div className="text-sm tabular-nums text-muted" dir="ltr">{current.phones[0]?.value}</div>
              <div className="w-full whitespace-pre-wrap rounded-xl bg-sunk p-3 text-start text-sm" dir="auto">{message}</div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="ghost" onClick={() => void advance(queue)}>{t("skip")}</Button>
                <Button variant="primary" onClick={() => void openApp()}>
                  {queue.channel === "whatsapp" ? <MessageCircle size={15} /> : <Send size={15} />} {t("openApp")} · {t(queue.channel)}
                </Button>
              </div>
            </div>
          )}
          <div className="text-center">
            <Button variant="ghost" onClick={() => void reset()}>{t("resetQueue")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 p-5">
          {saved ? (
            <Button variant="soft" onClick={() => setQueue(saved)}>
              <Play size={14} /> {t("resumeQueue")} · {t("queueOf", saved.index + 1, saved.ids.length)}
            </Button>
          ) : null}
          <section>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{t("recipients")} · {formatNumber(lang, recipientIds.length)}</div>
            {recipientIds.length === 0 ? (
              <p className="text-sm text-muted">{t("noRecipients")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((c) => (
                  <span key={c.id} className="rounded-full bg-sunk px-2.5 py-1 text-xs" dir="auto">{c.name || c.phones[0]?.value}</span>
                ))}
                {recipientIds.length > recipients.length ? <span className="rounded-full bg-sunk px-2.5 py-1 text-xs">+{formatNumber(lang, recipientIds.length - recipients.length)}</span> : null}
              </div>
            )}
          </section>
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{t("template")}</div>
            <textarea value={template} onChange={(e) => setTemplate(e.target.value)} placeholder={t("templatePh")} dir="auto" className="min-h-28 w-full rounded-xl border border-line bg-card p-3 text-sm focus:border-accent focus:outline-none" />
            <div className="flex flex-wrap gap-1">
              {TOKENS.map((token) => (
                <button key={token} type="button" onClick={() => setTemplate((v) => v + token)} className="rounded-md bg-sunk px-2 py-0.5 text-xs font-semibold text-ink2 hover:bg-line">{token}</button>
              ))}
            </div>
            {preview ? (
              <div>
                <div className="mb-1 text-xs font-semibold text-ink2">{t("preview")}</div>
                <div className="whitespace-pre-wrap rounded-xl border border-line bg-card p-3 text-sm" dir="auto">{preview}</div>
              </div>
            ) : null}
          </section>
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted rtl:tracking-normal">{t("channel")}</div>
            <Segmented value={channel} onChange={setChannel} options={channels.map((c) => ({ value: c, label: t(c) }))} />
            {recipientIds.length > 1 && recipientIds.length <= recipients.length && COARSE ? (
              <div className={cx("space-y-2 rounded-xl bg-[#f6d860]/30 p-3 text-sm")}>
                <p>{t("groupSmsWarn")}</p>
                <Button size="sm" variant="outline" onClick={() => { window.location.href = `sms:${recipients.map((c) => styleNumber(c.phones[0]?.value ?? "", "intl")).join(",")}?body=${encodeURIComponent(template.replace(/\{[a-z]+\}/g, "").trim())}`; }}>
                  <Users size={14} /> {t("groupSms")}
                </Button>
              </div>
            ) : null}
          </section>
          <Button variant="primary" disabled={recipientIds.length === 0 || !template.trim()} onClick={() => void start()}>
            <Play size={14} /> {t("startQueue")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

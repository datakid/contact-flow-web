import * as Comlink from "comlink";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "../../app/actions";
import { useT } from "../../app/i18n";
import { useApp } from "../../app/store";
import { runEnvironmentCases } from "../../selftest/environment";
import type { SelfTestResult } from "../../selftest/types";
import { Button, Modal, Spinner, cx } from "../../ui/primitives";

interface SelfTestWorkerApi {
  run(onProgress: (result: SelfTestResult) => void): Promise<SelfTestResult[]>;
}

const GROUP_ORDER = ["environment", "text", "phone", "formats", "database", "performance"] as const;
const GROUP_KEYS = { environment: "stEnvironment", text: "stText", phone: "stPhone", formats: "stFormats", database: "stDatabase", performance: "stPerformance" } as const;

function StatusIcon({ status }: { status: SelfTestResult["status"] }) {
  if (status === "pass") return <CircleCheck size={16} className="shrink-0 text-good-strong" aria-hidden="true" />;
  if (status === "warn") return <TriangleAlert size={16} className="shrink-0 text-accent-strong" aria-hidden="true" />;
  return <CircleX size={16} className="shrink-0 text-danger" aria-hidden="true" />;
}

export function SelfTestDialog() {
  const t = useT();
  const closeDialog = useApp((s) => s.closeDialog);
  const open = useApp((s) => s.dialog === "selftest");
  const [results, setResults] = useState<SelfTestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const runRef = useRef(0);
  const autoStarted = useRef(false);

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stopWorker();
    runRef.current += 1;
    const run = runRef.current;
    setResults([]);
    setStopped(false);
    setRunning(true);
    const push = (result: SelfTestResult): void => {
      if (runRef.current === run) setResults((previous) => [...previous, result]);
    };
    const worker = new Worker(new URL("../../workers/selftest.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    try {
      await runEnvironmentCases(push);
      await Comlink.wrap<SelfTestWorkerApi>(worker).run(Comlink.proxy(push));
    } catch (error) {
      push({ id: "self-test", group: "environment", status: "fail", ms: 0, message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (runRef.current === run) {
        stopWorker();
        setRunning(false);
      }
    }
  }, [stopWorker]);

  const cancel = (): void => {
    runRef.current += 1;
    stopWorker();
    setRunning(false);
    setStopped(true);
  };

  useEffect(() => {
    if (!autoStarted.current && new URLSearchParams(window.location.search).get("selftest") === "1") {
      autoStarted.current = true;
      void start();
    }
    return stopWorker;
  }, [start, stopWorker]);

  useEffect(() => {
    if (open) {
      if (!running) {
        setResults([]);
        setStopped(false);
      }
    } else if (running) cancel();
  }, [open]);

  const counts = useMemo(() => ({ pass: results.filter((r) => r.status === "pass").length, warn: results.filter((r) => r.status === "warn").length, fail: results.filter((r) => r.status === "fail").length }), [results]);
  const finished = !running && results.length > 0;

  const report = (): string => {
    const lines = [`Contact Flow ${__APP_VERSION__}`, navigator.userAgent, new Date().toISOString(), t("selfTestSummary", counts.pass, counts.warn, counts.fail)];
    for (const r of results) lines.push(`${r.status.toUpperCase()} [${r.group}] ${r.id} (${r.ms} ms)${r.message ? `: ${r.message}` : ""}`);
    return lines.join("\n");
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && closeDialog()}
      title={t("selfTestTitle")}
      description={t("selfTestIntro")}
      size="lg"
      footer={
        <>
          {running ? <Button onClick={cancel}>{t("selfTestCancel")}</Button> : null}
          {finished || stopped ? <Button onClick={() => void copyText(report())}>{t("selfTestCopyReport")}</Button> : null}
          <Button variant="primary" disabled={running} onClick={() => void start()}>
            {results.length > 0 || stopped ? t("selfTestRunAgain") : t("runSelfTest")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm" role="status">
          {running ? <Spinner size={14} /> : null}
          <span data-testid="selftest-summary" className="font-semibold text-ink">
            {running ? t("selfTestRunning") : results.length > 0 ? t("selfTestSummary", counts.pass, counts.warn, counts.fail) : ""}
          </span>
          {stopped ? <span className="text-muted">{t("selfTestStopped")}</span> : null}
        </div>
        {GROUP_ORDER.map((group) => {
          const rows = results.filter((r) => r.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} aria-label={t(GROUP_KEYS[group])}>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t(GROUP_KEYS[group])}</h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {rows.map((r) => (
                  <li key={`${r.group}:${r.id}`} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <StatusIcon status={r.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cx("truncate", r.status === "fail" && "font-semibold text-danger")}>{r.id}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted">{r.ms} ms</span>
                      </div>
                      {r.message ? <div className={cx("break-words text-xs", r.status === "fail" ? "text-ink" : "text-muted")}>{r.message}</div> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

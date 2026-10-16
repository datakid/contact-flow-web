import { db } from "../app/db";
import { runCases } from "./runner";
import type { SelfTestCase, SelfTestResult } from "./types";

const environmentCases: SelfTestCase[] = [
  {
    id: "private file storage is available",
    group: "environment",
    run: async () => {
      if (typeof navigator.storage?.getDirectory !== "function") throw new Error("navigator.storage.getDirectory is missing");
    }
  },
  {
    id: "storage is persistent",
    group: "environment",
    run: async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      return persisted ? "persistent" : "warn:storage is not persistent, the browser may clear it under pressure";
    }
  },
  {
    id: "storage usage",
    group: "environment",
    run: async () => {
      const estimate = await navigator.storage?.estimate?.();
      return estimate?.usage === undefined ? "unknown" : `${Math.round(estimate.usage / 1024)} KB used`;
    }
  },
  {
    id: "the library worker answers",
    group: "environment",
    run: async () => {
      const start = performance.now();
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("no answer within 2000 ms")), 2000));
      await Promise.race([db.counts(), timeout]);
      return `answered in ${Math.round(performance.now() - start)} ms`;
    }
  },
  {
    id: "clipboard is available",
    group: "environment",
    run: async () => (navigator.clipboard ? undefined : "warn:navigator.clipboard is missing, copy actions will fail")
  },
  {
    id: "offline support is active",
    group: "environment",
    run: async () => (navigator.serviceWorker?.controller ? undefined : "warn:no service worker controls this page (normal in development)")
  }
];

export function runEnvironmentCases(onProgress: (result: SelfTestResult) => void): Promise<SelfTestResult[]> {
  return runCases(environmentCases, { newLibrary: () => { throw new Error("not available on the main thread"); } }, onProgress);
}

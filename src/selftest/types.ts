import type { ImportStaging } from "../core/db/staging";

export type SelfTestStatus = "pass" | "fail" | "warn";

export interface SelfTestResult {
  id: string;
  group: string;
  status: SelfTestStatus;
  ms: number;
  message: string;
}

export interface SelfTestContext {
  newLibrary(): ImportStaging;
}

export interface SelfTestCase {
  id: string;
  group: string;
  run: (ctx: SelfTestContext) => Promise<string | void>;
}

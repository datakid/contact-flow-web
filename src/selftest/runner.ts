import type { SelfTestCase, SelfTestContext, SelfTestResult } from "./types";

export async function runCases(cases: SelfTestCase[], ctx: SelfTestContext, onProgress: (result: SelfTestResult) => void, shouldStop: () => boolean = () => false): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  for (const testCase of cases) {
    if (shouldStop()) break;
    const start = performance.now();
    let result: SelfTestResult;
    try {
      const outcome = await testCase.run(ctx);
      const ms = Math.round(performance.now() - start);
      if (typeof outcome === "string" && outcome.startsWith("warn:")) result = { id: testCase.id, group: testCase.group, status: "warn", ms, message: outcome.slice(5) };
      else result = { id: testCase.id, group: testCase.group, status: "pass", ms, message: typeof outcome === "string" ? outcome : "" };
    } catch (error) {
      result = { id: testCase.id, group: testCase.group, status: "fail", ms: Math.round(performance.now() - start), message: error instanceof Error ? error.message : String(error) };
    }
    results.push(result);
    onProgress(result);
  }
  return results;
}

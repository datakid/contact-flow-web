import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_LARGE_ROWS, buildFixtures } from "../src/core/fixtures";

export function writeFixtures(dir: string, largeRows: number = DEFAULT_LARGE_ROWS): void {
  mkdirSync(dir, { recursive: true });
  for (const file of buildFixtures(largeRows)) writeFileSync(join(dir, file.name), file.bytes);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const out = join(process.cwd(), "tests", "fixtures");
  const largeRows = Number(process.argv[2] ?? DEFAULT_LARGE_ROWS);
  writeFixtures(out, largeRows);
  console.log(`fixtures written to ${out} (large.csv: ${largeRows} rows)`);
}

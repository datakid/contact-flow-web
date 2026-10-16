import { join } from "node:path";
import { writeFixtures } from "../../scripts/generate-fixtures";

export default function globalSetup(): void {
  writeFixtures(join(process.cwd(), "tests", "fixtures"));
}

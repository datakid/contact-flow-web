import { extraAr } from "./extra.ar";
import { legacyAr } from "./legacy.ar";
import type { Messages } from "./en";

export const ar: Messages = { ...legacyAr, ...extraAr };

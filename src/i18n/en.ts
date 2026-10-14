import { extraEn } from "./extra.en";
import { legacyEn } from "./legacy.en";

export const en = { ...legacyEn, ...extraEn };
export type Messages = typeof en;

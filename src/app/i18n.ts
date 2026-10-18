import { useMemo } from "react";
import { ar } from "../i18n/ar";
import { en } from "../i18n/en";
import type { Messages } from "../i18n/en";
import type { Language } from "../core/types";
import { useApp } from "./store";

type Args<K extends keyof Messages> = Messages[K] extends (...a: infer P) => string ? P : [];

export type TFunction = <K extends keyof Messages>(key: K, ...args: Args<K>) => string;

export function translate<K extends keyof Messages>(lang: Language, key: K, ...args: Args<K>): string {
  const dict: Messages = lang === "ar" ? ar : en;
  const value = dict[key] as unknown;
  if (typeof value === "function") return (value as (...a: unknown[]) => string)(...args);
  return String(value);
}

export function useT(): TFunction {
  const lang = useApp((s) => s.lang);
  return useMemo(() => ((key: keyof Messages, ...args: unknown[]) => translate(lang, key as never, ...(args as never[]))) as TFunction, [lang]);
}

export function formatNumber(lang: Language, n: number): string {
  return n.toLocaleString(lang === "ar" ? "ar" : "en");
}

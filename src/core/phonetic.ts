import { doubleMetaphone } from "double-metaphone";
import { ARABIC_RE, fold, tokens } from "./fold";

export function arabicConsonantSkeleton(token: string): string {
  const unified = fold(token)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
  const chars = [...unified].filter((ch) => /[\u0621-\u064A\u066E-\u06D3]/.test(ch));
  const head = chars[0] ?? "";
  const rest = chars.slice(1).filter((ch) => ch !== "ا" && ch !== "و" && ch !== "ي");
  return (head + rest.join("")).replace(/(.)\1+/g, "$1");
}

export function phoneticKeyOfToken(token: string): string {
  if (!token) return "";
  if (ARABIC_RE.test(token)) return arabicConsonantSkeleton(token);
  if (!/[a-z]/.test(token)) return "";
  const [primary] = doubleMetaphone(token);
  return primary;
}

export function phoneticTokens(text: string): string[] {
  return tokens(fold(text))
    .map(phoneticKeyOfToken)
    .filter((key) => key.length >= 2);
}

export function phoneticKey(text: string): string {
  return phoneticTokens(text).join(" ");
}

import { ARABIC_RE, CJK_RE, fold, tokens } from "./fold";
import { arabicToLatin, latinToArabic } from "./translit";
import { pinyin } from "pinyin-pro";

export interface PinyinForms {
  full: string;
  initials: string;
}

export function pinyinOf(text: string): PinyinForms | null {
  if (!text || !CJK_RE.test(text)) return null;
  try {
    const syllables = pinyin(text, { toneType: "none", type: "array", nonZh: "removed" })
      .map((s) => fold(s).replace(/[^a-z]/g, ""))
      .filter(Boolean);
    if (syllables.length === 0) return null;
    return { full: syllables.join(""), initials: syllables.map((s) => s[0] ?? "").join("") };
  } catch {
    return null;
  }
}

export interface SearchTextInput {
  name: string;
  aliases: readonly string[];
  company: string;
}

export function buildSearchText(input: SearchTextInput): string {
  const pieces: string[] = [];
  const nameFold = fold(input.name);
  pieces.push(nameFold);
  for (const alias of input.aliases) pieces.push(fold(alias));
  pieces.push(fold(input.company));
  const sources = [input.name, ...input.aliases];
  for (const source of sources) {
    const py = pinyinOf(source);
    if (py) {
      pieces.push(py.full);
      pieces.push(py.initials);
    }
    const folded = fold(source);
    if (ARABIC_RE.test(folded)) pieces.push(arabicToLatin(folded));
    else if (/[a-z]/.test(folded)) {
      const arabic = latinToArabic(folded);
      if (arabic) pieces.push(arabic);
    }
  }
  return pieces
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function trigramsOf(text: string): string[] {
  const clean = fold(text).replace(/\s+/g, " ").trim();
  const set = new Set<string>();
  for (let i = 0; i + 3 <= clean.length; i++) set.add(clean.slice(i, i + 3));
  return [...set];
}

export function nameTokens(text: string): string[] {
  return tokens(fold(text));
}

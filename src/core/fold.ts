const DIACRITICS_AR = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const COMBINING = /[\u0300-\u036f]/g;

export const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
export const ARABIC_RE = /[\u0600-\u06FF]/;
export const LATIN_RE = /[A-Za-z\u00C0-\u024F]/;

export function latinDigits(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
}

export function fold(input: string | null | undefined): string {
  return latinDigits(input)
    .normalize("NFD")
    .replace(COMBINING, "")
    .toLowerCase()
    .replace(DIACRITICS_AR, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/[’`´]/g, "'");
}

export interface FoldMap {
  text: string;
  start: number[];
  end: number[];
}

export function foldMap(input: string): FoldMap {
  let text = "";
  const start: number[] = [];
  const end: number[] = [];
  let index = 0;
  for (const ch of input) {
    const folded = fold(ch);
    for (let k = 0; k < folded.length; k++) {
      start.push(index);
      end.push(index + ch.length);
    }
    text += folded;
    index += ch.length;
  }
  return { text, start, end };
}

export function tokens(input: string): string[] {
  return input.split(/[\s,.\-_'()/&·]+/).filter(Boolean);
}

export function highlightRanges(text: string, hits: readonly string[]): Array<[number, number]> {
  if (!text || hits.length === 0) return [];
  const map = foldMap(text);
  const ranges: Array<[number, number]> = [];
  for (const hit of hits) {
    if (!hit) continue;
    let from = 0;
    for (;;) {
      const at = map.text.indexOf(hit, from);
      if (at === -1) break;
      const s = map.start[at];
      const e = map.end[at + hit.length - 1];
      if (s !== undefined && e !== undefined) ranges.push([s, e]);
      from = at + hit.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

export function firstLetterOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "#";
  const ch = [...fold(trimmed).replace(/^[^\p{L}\p{N}]+/u, "")][0];
  if (!ch) return "#";
  if (/[0-9]/.test(ch)) return "#";
  return ch.toLocaleUpperCase();
}

export function sortKeyOf(name: string): string {
  return fold(name).replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = [...(parts[0] ?? "")][0] ?? "?";
  const last = parts.length > 1 ? [...(parts[parts.length - 1] ?? "")][0] ?? "" : "";
  return (first + last).toLocaleUpperCase();
}

export function hueOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

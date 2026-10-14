import { ARABIC_RE, fold, tokens } from "./fold";

const AR_TO_LAT: Record<string, string> = {
  ا: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r",
  ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "", غ: "gh", ف: "f",
  ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y", ء: "", پ: "p",
  چ: "ch", گ: "g", ک: "k", ی: "y"
};

const LAT_DIGRAPHS: Array<[string, string]> = [
  ["sh", "ش"], ["kh", "خ"], ["gh", "غ"], ["th", "ث"], ["dh", "ذ"], ["ch", "تش"], ["ph", "ف"], ["ck", "ك"],
  ["ee", "ي"], ["oo", "و"], ["ou", "و"], ["aa", "ا"]
];

const LAT_SINGLE: Record<string, string> = {
  a: "ا", b: "ب", c: "ك", d: "د", e: "ي", f: "ف", g: "ج", h: "ه", i: "ي", j: "ج", k: "ك", l: "ل", m: "م",
  n: "ن", o: "و", p: "ب", q: "ق", r: "ر", s: "س", t: "ت", u: "و", v: "ف", w: "و", x: "كس", y: "ي", z: "ز"
};

export function arabicToLatin(input: string): string {
  let out = "";
  for (const ch of input) out += ch in AR_TO_LAT ? AR_TO_LAT[ch] : ch;
  return out;
}

export function latinToArabic(input: string): string {
  const source = fold(input).replace(/[^a-z\s]/g, " ");
  const words = source.split(/\s+/).filter(Boolean);
  return words
    .map((word) => {
      let out = "";
      let i = 0;
      while (i < word.length) {
        const pair = word.slice(i, i + 2);
        const digraph = LAT_DIGRAPHS.find(([latin]) => latin === pair);
        if (digraph) {
          out += digraph[1];
          i += 2;
          continue;
        }
        const single = LAT_SINGLE[word[i] ?? ""];
        if (single !== undefined) {
          const vowel = "aeiouy".includes(word[i] ?? "");
          if (!(vowel && i > 0 && i < word.length - 1 && word[i] !== "y" && word[i] !== "o" && word[i] !== "u")) out += single;
        }
        i += 1;
      }
      return out;
    })
    .join(" ");
}

export function skeleton(latin: string): string {
  let s = latin.replace(/[^a-z]/g, "");
  s = s
    .replace(/ph/g, "f").replace(/kh/g, "k").replace(/gh/g, "g").replace(/sh/g, "s").replace(/ch/g, "s")
    .replace(/th/g, "t").replace(/dh/g, "d").replace(/ck/g, "k").replace(/q/g, "k").replace(/c/g, "k")
    .replace(/x/g, "ks").replace(/v/g, "f").replace(/z/g, "s");
  s = s.replace(/h$/, "").replace(/[aeiouyw]/g, "").replace(/(.)\1+/g, "$1");
  return s;
}

export function skeletonOfToken(token: string): string {
  return skeleton(ARABIC_RE.test(token) ? arabicToLatin(token) : token);
}

export function skeletonsOf(foldedText: string): string[] {
  const set = new Set<string>();
  const parts = tokens(foldedText);
  for (const part of parts) {
    const s = skeletonOfToken(part);
    if (s.length >= 2) set.add(s);
  }
  if (ARABIC_RE.test(foldedText) && parts.length > 1) {
    const s = skeleton(arabicToLatin(parts.join("")));
    if (s.length >= 2) set.add(s);
  }
  return [...set];
}

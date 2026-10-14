import { describe, expect, it } from "vitest";
import { fold, latinDigits, highlightRanges, firstLetterOf } from "../../src/core/fold";
import { phoneticKey, arabicConsonantSkeleton } from "../../src/core/phonetic";
import { damerauLevenshtein, jaroWinkler, fuzzyScore } from "../../src/core/fuzzy";
import { normalizeQueryDigits, parsePhone, phoneKey } from "../../src/core/phone";
import { buildSearchText, pinyinOf } from "../../src/core/searchText";

describe("fold", () => {
  it("normalizes Arabic variants and digits", () => {
    expect(fold("أَحْمَد")).toBe("احمد");
    expect(fold("فاطمة")).toBe("فاطمه");
    expect(latinDigits("٠١٢٣٤٥")).toBe("012345");
  });

  it("strips Latin diacritics", () => {
    expect(fold("José Müller")).toBe("jose muller");
  });

  it("maps highlights back to original text", () => {
    expect(highlightRanges("José Müller", ["jose"])).toEqual([[0, 4]]);
  });

  it("derives first letters", () => {
    expect(firstLetterOf("Émile")).toBe("E");
    expect(firstLetterOf("123 Plumbing")).toBe("#");
    expect(firstLetterOf("")).toBe("#");
  });
});

describe("phonetic", () => {
  it("matches Latin spelling variants", () => {
    expect(phoneticKey("Mohamed")).toBe(phoneticKey("Mohammed"));
    expect(phoneticKey("Stephen")).toBe(phoneticKey("Steven"));
  });

  it("builds Arabic consonant skeletons", () => {
    expect(arabicConsonantSkeleton("محمّد")).toBe(arabicConsonantSkeleton("محمد"));
    expect(arabicConsonantSkeleton("إبراهيم")).toBe(arabicConsonantSkeleton("ابراهيم"));
  });
});

describe("fuzzy", () => {
  it("counts transpositions as one edit", () => {
    expect(damerauLevenshtein("ahmed", "ahmde", 2)).toBe(1);
  });

  it("scores close names above the threshold", () => {
    expect(jaroWinkler("martha", "marhta")).toBeGreaterThan(0.95);
    expect(fuzzyScore("jonathan", "jonathon")).toBeGreaterThanOrEqual(0.75);
    expect(fuzzyScore("alice", "zebra")).toBeLessThan(0.75);
  });
});

describe("phone", () => {
  it("parses to e164 with a default country", () => {
    const parts = parsePhone("050 123 4567", "AE");
    expect(parts.e164).toBe("+971501234567");
    expect(parts.digits).toBe("0501234567");
  });

  it("normalizes query digits", () => {
    expect(normalizeQueryDigits("٠٥٠١٢٣", "AE")).toBe("50123");
    expect(normalizeQueryDigits("+971 50 123", "AE")).toBe("50123");
  });

  it("builds comparison keys", () => {
    expect(phoneKey("+971 50 123 4567")).toBe(phoneKey("0501234567"));
  });
});

describe("search text", () => {
  it("includes pinyin and transliteration", () => {
    expect(pinyinOf("王小明")?.initials).toBe("wxm");
    const text = buildSearchText({ name: "محمد علي", aliases: [], company: "" });
    expect(text).toContain("mhmd");
  });
});

import { getCountryCallingCode } from "libphonenumber-js/max";
import { fold, tokens } from "../fold";
import { bestTokenScore, FUZZY_THRESHOLD } from "../fuzzy";
import { digitsOf, normalizeQueryDigits, reverseString } from "../phone";
import { phoneticKey } from "../phonetic";
import { pinyinOf, trigramsOf } from "../searchText";
import { arabicToLatin, latinToArabic, skeletonsOf } from "../translit";
import { ARABIC_RE } from "../fold";
import type { LibraryFilter, MatchTag } from "../types";
import { filterWhere } from "./filters";
import type { Library } from "./library";
import { num, str } from "./sql";
import type { SqlValue } from "./sql";

export interface RankedResult {
  rowid: number;
  score: number;
  tag: MatchTag;
  alias: string | null;
  sortKey: string;
}

export interface SearchOutcome {
  results: RankedResult[];
  total: number;
}

const ALL_CAP = 5000000;
const PAGE_CAP = 5000;
const COUNT_CAP = 10001;
const FUZZY_CANDIDATE_CAP = 2000;
const FUZZY_TRIGGER = 40;
const RESULT_LIMIT = 500;

interface CandidateRow {
  rowid: number;
  nameFold: string;
  name: string;
  company: string;
  sortKey: string;
  aliases: Array<{ raw: string; folded: string }>;
  phoneDigits: string[];
  emails: string[];
}

function prefixUpper(prefix: string): string {
  return `${prefix}\uffff`;
}

function quoteFts(token: string): string {
  return `"${token.replace(/"/g, '""')}"`;
}

function callingCodeOf(lib: Library): string {
  try {
    return getCountryCallingCode(lib.country);
  } catch {
    return "";
  }
}

function collectPhoneCandidates(lib: Library, query: string, sink: Set<number>, cap: number): void {
  const raw = digitsOf(query);
  const stripped = normalizeQueryDigits(query, lib.country);
  const cc = callingCodeOf(lib);
  const prefixes = new Set<string>([raw]);
  if (stripped && cc) prefixes.add(`${cc}${stripped}`);
  const suffixes = new Set<string>([stripped || raw, raw].filter((s) => s.length >= 3));
  for (const prefix of prefixes) {
    if (prefix.length < 3) continue;
    for (const value of lib.db.selectValues("SELECT DISTINCT contact_rowid FROM phones WHERE digits>=? AND digits<? LIMIT ?", [prefix, prefixUpper(prefix), cap])) sink.add(num(value));
  }
  for (const suffix of suffixes) {
    const rev = reverseString(suffix);
    for (const value of lib.db.selectValues("SELECT DISTINCT contact_rowid FROM phones WHERE digits_rev>=? AND digits_rev<? LIMIT ?", [rev, prefixUpper(rev), cap])) sink.add(num(value));
  }
}

function collectEmailCandidates(lib: Library, query: string, sink: Set<number>, cap: number): void {
  const lower = query.trim().toLowerCase();
  for (const value of lib.db.selectValues("SELECT DISTINCT contact_rowid FROM emails WHERE value_lower>=? AND value_lower<? LIMIT ?", [lower, prefixUpper(lower), cap])) sink.add(num(value));
}

function collectTextCandidates(lib: Library, qf: string, qTokens: string[], sink: Set<number>, cap: number, skip: ReadonlySet<number>): void {
  if (qf.length >= 3) {
    const long = qTokens.filter((t) => t.length >= 3);
    const match = long.length > 0 ? long.map(quoteFts).join(" AND ") : quoteFts(qf);
    for (const value of lib.db.selectValues("SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH ? LIMIT ?", [match, cap])) {
      const id = num(value);
      if (!skip.has(id)) sink.add(id);
    }
    return;
  }
  for (const value of lib.db.selectValues("SELECT rowid FROM contacts WHERE sort_key>=? AND sort_key<? LIMIT ?", [qf, prefixUpper(qf), cap])) sink.add(num(value));
  for (const value of lib.db.selectValues("SELECT DISTINCT contact_rowid FROM aliases WHERE value_fold>=? AND value_fold<? LIMIT ?", [qf, prefixUpper(qf), cap])) sink.add(num(value));
}

function collectFuzzyCandidates(lib: Library, query: string, qf: string, sink: Set<number>): void {
  const key = phoneticKey(query);
  let phonetic = 0;
  if (key) {
    const sql = "SELECT rowid FROM contacts WHERE name_phonetic=? OR (name_phonetic>=? AND name_phonetic<?) LIMIT ?";
    for (const value of lib.db.selectValues(sql, [key, `${key} `, `${key}!`, FUZZY_CANDIDATE_CAP])) {
      sink.add(num(value));
      phonetic += 1;
    }
  }
  if (phonetic >= FUZZY_TRIGGER) return;
  const longest = tokens(qf).sort((a, b) => b.length - a.length)[0] ?? qf;
  const grams = trigramsOf(longest);
  const step = Math.max(1, Math.ceil(grams.length / 6));
  const picked = grams.filter((_, i) => i % step === 0).slice(0, 6);
  if (picked.length > 0) {
    const match = picked.map(quoteFts).join(" OR ");
    for (const value of lib.db.selectValues("SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH ? LIMIT ?", [match, FUZZY_CANDIDATE_CAP])) sink.add(num(value));
  }
}

function loadBase(lib: Library, rowids: number[], filter: LibraryFilter): CandidateRow[] {
  if (rowids.length === 0) return [];
  const where = filterWhere(filter, Date.now());
  const args: SqlValue[] = [JSON.stringify(rowids), ...where.args];
  return lib.db
    .selectObjects(`SELECT c.rowid,c.name,c.name_fold,c.company,c.sort_key FROM contacts c WHERE c.rowid IN (SELECT value FROM json_each(?)) AND ${where.sql}`, args)
    .map((r) => ({ rowid: num(r.rowid), name: str(r.name), nameFold: str(r.name_fold), company: str(r.company), sortKey: str(r.sort_key), aliases: [], phoneDigits: [], emails: [] }));
}

function loadExtras(lib: Library, rows: CandidateRow[]): void {
  if (rows.length === 0) return;
  const byRowid = new Map(rows.map((r) => [r.rowid, r]));
  const json = JSON.stringify(rows.map((r) => r.rowid));
  for (const r of lib.db.selectObjects("SELECT contact_rowid,value,value_fold FROM aliases WHERE contact_rowid IN (SELECT value FROM json_each(?))", [json])) byRowid.get(num(r.contact_rowid))?.aliases.push({ raw: str(r.value), folded: str(r.value_fold) });
  for (const r of lib.db.selectObjects("SELECT contact_rowid,digits FROM phones WHERE contact_rowid IN (SELECT value FROM json_each(?))", [json])) byRowid.get(num(r.contact_rowid))?.phoneDigits.push(str(r.digits));
  for (const r of lib.db.selectObjects("SELECT contact_rowid,value_lower FROM emails WHERE contact_rowid IN (SELECT value FROM json_each(?))", [json])) byRowid.get(num(r.contact_rowid))?.emails.push(str(r.value_lower));
}

interface TokenHit {
  score: number;
  tag: MatchTag;
  alias: string | null;
}

function matchToken(token: string, row: CandidateRow, nameTokens: string[], allowFuzzy: boolean): TokenHit {
  let best: TokenHit = { score: 0, tag: "contains", alias: null };
  const up = (score: number, tag: MatchTag, alias: string | null = null): void => {
    if (score > best.score) best = { score, tag, alias };
  };
  if (/^\+?\d{2,}$/.test(token)) {
    const digits = token.replace(/\D/g, "");
    if (row.phoneDigits.some((p) => p.includes(digits))) up(85, "number");
  }
  for (const nt of nameTokens) {
    if (nt.startsWith(token)) up(100, "startsWith");
    else if (token.length >= 2 && nt.includes(token)) up(90, "contains");
  }
  for (const alias of row.aliases) {
    for (const at of tokens(alias.folded)) {
      if (at.startsWith(token)) up(88, "alias", alias.raw);
      else if (token.length >= 2 && at.includes(token)) up(84, "alias", alias.raw);
    }
  }
  if (/^[a-z]+$/.test(token)) {
    const py = pinyinOf(row.name);
    if (py) {
      if (py.full.startsWith(token)) up(82, "pinyin");
      else if (token.length >= 2 && py.initials.startsWith(token)) up(80, "pinyin");
      else if (token.length >= 3 && py.full.includes(token)) up(76, "pinyin");
    }
  }
  if (best.score < 78 && token.length >= 2) {
    const tokenIsArabic = ARABIC_RE.test(token);
    const rowIsArabic = ARABIC_RE.test(row.nameFold);
    if (!tokenIsArabic && rowIsArabic && arabicToLatin(row.nameFold).includes(token)) up(78, "transliterated");
    else if (tokenIsArabic && !rowIsArabic && /[a-z]/.test(row.nameFold) && latinToArabic(row.nameFold).includes(token)) up(78, "transliterated");
  }
  if (token.length >= 2 && (fold(row.company).includes(token) || row.emails.some((e) => e.includes(token)))) up(60, "contains");
  if (allowFuzzy && best.score < 55 && token.length >= 4 && !/^\d+$/.test(token)) {
    const pool = [...nameTokens, ...row.aliases.flatMap((a) => tokens(a.folded))];
    const similarity = bestTokenScore(token, pool);
    if (similarity >= FUZZY_THRESHOLD) up(50 + Math.round((similarity - FUZZY_THRESHOLD) * 20), "close");
  }
  if (allowFuzzy && best.score < 50 && /^[a-z]+$/.test(token)) {
    const key = phoneticKey(token);
    if (key.length >= 2) {
      const own = tokens(row.nameFold).map((t) => phoneticKey(t));
      if (own.includes(key)) up(50, "sounds");
    }
  }
  return best;
}

function scoreRow(qf: string, qTokens: string[], isNumber: boolean, numberVariants: string[], row: CandidateRow, allowFuzzy: boolean): RankedResult | null {
  const base = { rowid: row.rowid, sortKey: row.sortKey };
  if (isNumber) {
    if (row.phoneDigits.some((p) => numberVariants.some((v) => p.includes(v)))) return { ...base, score: 95, tag: "number", alias: null };
    return null;
  }
  if (row.nameFold === qf) return { ...base, score: 140, tag: "exact", alias: null };
  if (row.nameFold.startsWith(qf)) return { ...base, score: 130, tag: "startsWith", alias: null };
  if (row.nameFold.includes(qf)) return { ...base, score: 120, tag: "contains", alias: null };
  if (qTokens.length === 0) return null;
  const nameTokens = tokens(row.nameFold);
  let min = Infinity;
  let tag: MatchTag = "contains";
  let alias: string | null = null;
  for (const token of qTokens) {
    const hit = matchToken(token, row, nameTokens, allowFuzzy);
    if (hit.score === 0) return null;
    if (hit.score < min) {
      min = hit.score;
      tag = hit.tag;
    }
    if (hit.alias) alias = hit.alias;
  }
  if (!Number.isFinite(min)) return null;
  return { ...base, score: min, tag, alias };
}

export interface SearchOptions {
  requestId: number | null;
  all: boolean;
}

function prefixTier(lib: Library, qf: string, filter: LibraryFilter): RankedResult[] {
  const where = filterWhere(filter, Date.now());
  const rows = lib.db.selectArrays(
    `SELECT c.rowid,c.sort_key FROM contacts c WHERE c.sort_key>=? AND c.sort_key<? AND ${where.sql} ORDER BY c.sort_key,c.rowid LIMIT ${RESULT_LIMIT}`,
    [qf, `${qf}\uffff`, ...where.args]
  );
  return rows.map(([rowid, sortKey]) => {
    const key = str(sortKey);
    return { rowid: num(rowid), sortKey: key, score: key === qf ? 140 : 130, tag: key === qf ? ("exact" as const) : ("startsWith" as const), alias: null };
  });
}

function boundedCount(lib: Library, match: string): number {
  return num(lib.db.selectValue(`SELECT COUNT(*) FROM (SELECT rowid FROM contacts_fts WHERE contacts_fts MATCH ? LIMIT ${COUNT_CAP})`, [match]));
}

function ftsMatchFor(qf: string, qTokens: string[]): string | null {
  if (qf.length < 3) return null;
  const long = qTokens.filter((t) => t.length >= 3);
  return long.length > 0 ? long.map(quoteFts).join(" AND ") : quoteFts(qf);
}

export async function searchLibrary(lib: Library, query: string, filter: LibraryFilter, requestIdOrOptions: number | null | SearchOptions): Promise<SearchOutcome | null> {
  const options: SearchOptions = typeof requestIdOrOptions === "object" && requestIdOrOptions !== null ? requestIdOrOptions : { requestId: requestIdOrOptions, all: requestIdOrOptions === null };
  const requestId = options.requestId;
  const stale = async (): Promise<boolean> => (requestId === null ? false : await lib.yieldIfStale(requestId));
  const qf = fold(query).trim().replace(/\s+/g, " ");
  if (!qf) return { results: [], total: 0 };
  const compact = qf.replace(/[\s\-().]/g, "");
  const isNumber = /^\+?\d{3,}$/.test(compact);
  const qDigits = compact.replace(/\D/g, "");
  const qTokens = tokens(qf);
  const cap = options.all ? ALL_CAP : PAGE_CAP;
  const numberVariants = [...new Set([qDigits, normalizeQueryDigits(query, lib.country)].filter((v) => v.length >= 3))];
  const finish = (ranked: RankedResult[], total: number): SearchOutcome => {
    ranked.sort((a, b) => b.score - a.score || (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.rowid - b.rowid));
    return { results: options.all ? ranked : ranked.slice(0, RESULT_LIMIT), total };
  };

  let ranked: RankedResult[] = [];
  const seen = new Set<number>();
  if (!isNumber && !options.all && !qf.includes("@")) {
    ranked = prefixTier(lib, qf, filter);
    for (const r of ranked) seen.add(r.rowid);
    if (ranked.length >= RESULT_LIMIT) {
      const match = ftsMatchFor(qf, qTokens);
      return finish(ranked, Math.max(ranked.length, match ? boundedCount(lib, match) : ranked.length));
    }
  }
  if (await stale()) return null;
  const candidates = new Set<number>();
  if (isNumber) collectPhoneCandidates(lib, query, candidates, cap);
  if (qf.includes("@")) collectEmailCandidates(lib, query, candidates, cap);
  if (!isNumber && !qf.startsWith("@")) collectTextCandidates(lib, qf, qTokens, candidates, cap, seen);
  if (await stale()) return null;
  ranked = ranked.concat(rank(lib, qf, qTokens, isNumber, numberVariants, filter, [...candidates], false));
  if (ranked.length < FUZZY_TRIGGER && qf.length >= 4 && !isNumber && !qf.includes("@") && !/\d/.test(qf)) {
    if (await stale()) return null;
    const fuzzyPool = new Set<number>(candidates);
    collectFuzzyCandidates(lib, query, qf, fuzzyPool);
    for (const id of seen) fuzzyPool.delete(id);
    if (await stale()) return null;
    const extra = rank(lib, qf, qTokens, isNumber, numberVariants, filter, [...fuzzyPool], true);
    const kept = new Set(ranked.map((r) => r.rowid));
    ranked = ranked.concat(extra.filter((r) => !kept.has(r.rowid)));
  }
  return finish(ranked, ranked.length);
}

function rank(lib: Library, qf: string, qTokens: string[], isNumber: boolean, numberVariants: string[], filter: LibraryFilter, rowids: number[], allowFuzzy: boolean): RankedResult[] {
  const rows = loadBase(lib, rowids, filter);
  const out: RankedResult[] = [];
  if (isNumber) {
    loadExtras(lib, rows);
    for (const row of rows) {
      const result = scoreRow(qf, qTokens, isNumber, numberVariants, row, allowFuzzy);
      if (result) out.push(result);
    }
    return out;
  }
  const unresolved: CandidateRow[] = [];
  for (const row of rows) {
    const result = scoreRow(qf, qTokens, isNumber, numberVariants, row, allowFuzzy);
    if (result) out.push(result);
    else unresolved.push(row);
  }
  loadExtras(lib, unresolved);
  for (const row of unresolved) {
    const result = scoreRow(qf, qTokens, isNumber, numberVariants, row, allowFuzzy);
    if (result) out.push(result);
  }
  return out;
}

export function skeletonHint(text: string): string[] {
  return skeletonsOf(fold(text));
}

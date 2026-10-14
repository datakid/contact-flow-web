import { latinDigits } from "../fold";
import { digitCount } from "../formats/mapping";
import { phoneKey, styleNumber } from "../phone";
import type { Contact } from "../types";

export type OpSection = "names" | "aliases" | "numbers" | "details";
export type OpView = "name" | "phones" | "aliases" | "company" | "note";
export type ParamValue = string | number | boolean;
export type Params = Record<string, ParamValue>;

export interface ParamDef {
  key: string;
  type: "seg" | "text" | "number" | "toggle";
  label: string;
  default?: ParamValue;
  options?: Array<[string, string]>;
  tokens?: string[];
  tel?: boolean;
}

export interface OpDef {
  key: string;
  section: OpSection;
  params: ParamDef[];
  view: (p: Params) => OpView;
  ready: (p: Params) => boolean;
  run: (row: Contact, p: Params, index: number) => Contact;
}

const EDGE = /^[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFE0F\u20E3\p{Extended_Pictographic}\p{Emoji_Modifier}]+|[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFE0F\u20E3\p{Extended_Pictographic}\p{Emoji_Modifier}]+$/gu;

const firstTok = (name: string): string => (name || "").trim().split(/\s+/)[0] ?? "";
const lastTok = (name: string): string => {
  const parts = (name || "").trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
};
const reEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const titleCase = (s: string): string => s.toLocaleLowerCase().replace(/(^|[\s\-'’(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toLocaleUpperCase());
const str = (v: ParamValue | undefined): string => (v === undefined ? "" : String(v));

export function fillTokens(template: string, c: Pick<Contact, "name" | "aliases" | "company">, n: number, keepSpace = false): string {
  const out = template.replace(/\{(name|first|last|alias|company|n)\}/g, (_m, k: string) =>
    k === "name" ? c.name || "" : k === "first" ? firstTok(c.name) : k === "last" ? lastTok(c.name) : k === "alias" ? c.aliases[0] || firstTok(c.name) : k === "company" ? c.company || "" : String(n)
  );
  return keepSpace ? out : out.replace(/\s+/g, " ").trim();
}

function mapPhones(row: Contact, fn: (value: string) => string): Contact {
  let changed = false;
  const phones = row.phones.map((p) => {
    const value = fn(p.value);
    if (value !== p.value) changed = true;
    return value === p.value ? p : { ...p, value };
  });
  return changed ? { ...row, phones } : row;
}

const cleanDigits = (s: string): string => latinDigits(s).replace(/[\s\-().]/g, "");

export const OPS: OpDef[] = [
  {
    key: "replace",
    section: "names",
    params: [
      { key: "field", type: "seg", label: "field", default: "name", options: [["name", "inNames"], ["phone", "inNumbers"], ["company", "inCompanies"]] },
      { key: "find", type: "text", label: "find" },
      { key: "repl", type: "text", label: "replaceWith" }
    ],
    view: (p) => (p.field === "phone" ? "phones" : p.field === "company" ? "company" : "name"),
    ready: (p) => Boolean(p.find),
    run: (r, p) => {
      const re = new RegExp(reEsc(str(p.find)), "gi");
      const repl = str(p.repl);
      if (p.field === "phone") return mapPhones(r, (x) => x.replace(re, repl));
      if (p.field === "company") return { ...r, company: r.company.replace(re, repl).trim() };
      return { ...r, name: r.name.replace(re, repl).replace(/\s+/g, " ").trim() };
    }
  },
  {
    key: "affix",
    section: "names",
    params: [
      { key: "pre", type: "text", label: "prefix" },
      { key: "suf", type: "text", label: "suffix" }
    ],
    view: () => "name",
    ready: (p) => Boolean(p.pre || p.suf),
    run: (r, p) => {
      if (!r.name) return r;
      let name = r.name;
      const pre = str(p.pre);
      const suf = str(p.suf);
      if (pre && !name.startsWith(pre)) name = pre + name;
      if (suf && !name.endsWith(suf)) name += suf;
      return { ...r, name };
    }
  },
  {
    key: "pattern",
    section: "names",
    params: [
      { key: "pat", type: "text", label: "pattern", default: "{name} {n}", tokens: ["{name}", "{first}", "{last}", "{alias}", "{company}", "{n}"] },
      { key: "start", type: "number", label: "startAt", default: 1 }
    ],
    view: () => "name",
    ready: (p) => Boolean(p.pat),
    run: (r, p, i) => ({ ...r, name: fillTokens(str(p.pat), r, (Number(p.start) || 1) + i) })
  },
  {
    key: "case",
    section: "names",
    params: [{ key: "mode", type: "seg", label: "case", default: "title", options: [["title", "caseTitle"], ["upper", "caseUpper"], ["lower", "caseLower"]] }],
    view: () => "name",
    ready: () => true,
    run: (r, p) => ({ ...r, name: p.mode === "upper" ? r.name.toLocaleUpperCase() : p.mode === "lower" ? r.name.toLocaleLowerCase() : titleCase(r.name) })
  },
  {
    key: "swap",
    section: "names",
    params: [],
    view: () => "name",
    ready: () => true,
    run: (r) => {
      const parts = r.name.trim().split(/\s+/);
      if (parts.length < 2) return r;
      const first = parts[0] ?? "";
      parts[0] = parts[parts.length - 1] ?? "";
      parts[parts.length - 1] = first;
      return { ...r, name: parts.join(" ") };
    }
  },
  {
    key: "clean",
    section: "names",
    params: [],
    view: () => "name",
    ready: () => true,
    run: (r) => ({ ...r, name: r.name.replace(EDGE, "").replace(/\s+/g, " ").trim() })
  },
  {
    key: "aliasAdd",
    section: "aliases",
    params: [{ key: "val", type: "text", label: "alias", tokens: ["{first}", "{last}", "{name}", "{company}"] }],
    view: () => "aliases",
    ready: (p) => Boolean(p.val),
    run: (r, p, i) => {
      const alias = fillTokens(str(p.val), r, i + 1);
      if (!alias || r.aliases.includes(alias) || alias === r.name) return r;
      return { ...r, aliases: [...r.aliases, alias] };
    }
  },
  {
    key: "aliasKeep",
    section: "aliases",
    params: [],
    view: () => "aliases",
    ready: () => true,
    run: (r) => (!r.name || r.aliases.includes(r.name) ? r : { ...r, aliases: [...r.aliases, r.name] })
  },
  {
    key: "aliasSwap",
    section: "aliases",
    params: [],
    view: () => "aliases",
    ready: () => true,
    run: (r) => {
      if (r.aliases.length === 0) return r;
      const aliases = [...r.aliases];
      const first = aliases[0] ?? "";
      aliases[0] = r.name;
      return { ...r, name: first, aliases: aliases.filter(Boolean) };
    }
  },
  {
    key: "aliasClear",
    section: "aliases",
    params: [],
    view: () => "aliases",
    ready: () => true,
    run: (r) => (r.aliases.length ? { ...r, aliases: [] } : r)
  },
  {
    key: "cc",
    section: "numbers",
    params: [
      { key: "cc", type: "text", label: "countryCode", default: "971", tel: true },
      { key: "trunk", type: "toggle", label: "trunk", default: true }
    ],
    view: () => "phones",
    ready: (p) => /^\d{1,4}$/.test(str(p.cc).replace(/^\+/, "")),
    run: (r, p) => {
      const cc = str(p.cc).replace(/^\+/, "");
      return mapPhones(r, (x) => {
        const s = latinDigits(x).trim();
        if (/^(\+|00)/.test(s) || digitCount(s) < 5) return x;
        const rest = p.trunk ? s.replace(/^0+/, "") : s;
        return `+${cc} ${rest.trim()}`;
      });
    }
  },
  {
    key: "rmcc",
    section: "numbers",
    params: [
      { key: "cc", type: "text", label: "countryCode", default: "971", tel: true },
      { key: "trunk", type: "toggle", label: "trunk", default: true }
    ],
    view: () => "phones",
    ready: (p) => /^\d{1,4}$/.test(str(p.cc).replace(/^\+/, "")),
    run: (r, p) => {
      const cc = str(p.cc).replace(/^\+/, "");
      const re = new RegExp(`^(?:\\+|00)\\s*${cc}[\\s\\-]*`);
      return mapPhones(r, (x) => {
        const s = latinDigits(x).trim();
        const m = s.match(re);
        return m ? (p.trunk ? "0" : "") + s.slice(m[0].length) : x;
      });
    }
  },
  {
    key: "prefix",
    section: "numbers",
    params: [
      { key: "from", type: "text", label: "fromPrefix", tel: true },
      { key: "to", type: "text", label: "toPrefix", tel: true }
    ],
    view: () => "phones",
    ready: (p) => Boolean(p.from),
    run: (r, p) =>
      mapPhones(r, (x) => {
        const c = cleanDigits(x);
        const from = cleanDigits(str(p.from));
        return from && c.startsWith(from) ? cleanDigits(str(p.to)) + c.slice(from.length) : x;
      })
  },
  {
    key: "format",
    section: "numbers",
    params: [{ key: "style", type: "seg", label: "style", default: "intl", options: [["intl", "international"], ["digits", "digitsOnly"], ["spaced", "spaced"]] }],
    view: () => "phones",
    ready: () => true,
    run: (r, p) =>
      mapPhones(r, (x) => {
        if (p.style === "digits" || p.style === "intl") return styleNumber(x, p.style);
        const c = styleNumber(x, "intl");
        const plus = c.startsWith("+") ? "+" : "";
        return plus + c.replace("+", "").replace(/(\d{3})(?=\d{2,})/g, "$1 ");
      })
  },
  {
    key: "dedupe",
    section: "numbers",
    params: [],
    view: () => "phones",
    ready: () => true,
    run: (r) => {
      const seen = new Set<string>();
      const phones = r.phones.filter((x) => {
        const k = phoneKey(x.value);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return phones.length === r.phones.length ? r : { ...r, phones };
    }
  },
  {
    key: "company",
    section: "details",
    params: [
      { key: "val", type: "text", label: "company" },
      { key: "onlyEmpty", type: "toggle", label: "onlyEmpty", default: true }
    ],
    view: () => "company",
    ready: () => true,
    run: (r, p) => (p.onlyEmpty && r.company ? r : { ...r, company: str(p.val).trim() })
  },
  {
    key: "note",
    section: "details",
    params: [{ key: "val", type: "text", label: "noteText", tokens: ["{first}", "{name}", "{company}"] }],
    view: () => "note",
    ready: (p) => Boolean(p.val),
    run: (r, p, i) => {
      const line = fillTokens(str(p.val), r, i + 1);
      return { ...r, note: r.note ? `${r.note}\n${line}` : line };
    }
  }
];

export function opByKey(key: string): OpDef | undefined {
  return OPS.find((o) => o.key === key);
}

export function defaultParams(op: OpDef): Params {
  const out: Params = {};
  for (const p of op.params) if (p.default !== undefined) out[p.key] = p.default;
  return out;
}

export function describeView(row: Contact, view: OpView): string {
  switch (view) {
    case "phones": return row.phones.map((p) => p.value).join(", ");
    case "aliases": return row.name + (row.aliases.length ? ` · ${row.aliases.join(", ")}` : "");
    case "company": return row.company || "—";
    case "note": return row.note || "—";
    default: return row.name;
  }
}

export function differs(a: Contact, b: Contact): boolean {
  return a.name !== b.name || a.company !== b.company || a.note !== b.note || JSON.stringify(a.phones) !== JSON.stringify(b.phones) || JSON.stringify(a.aliases) !== JSON.stringify(b.aliases);
}

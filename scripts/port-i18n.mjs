import fs from "node:fs";

const shimStorage = { getItem: () => null, setItem() {} };
const shimNavigator = { language: "en" };
const shimDocument = { documentElement: {} };
const source = fs.readFileSync("legacy/js/i18n.js", "utf8").replace("return { t, setLang", "return { en, ar, t, setLang");
const holder = {};
new Function("window", "localStorage", "navigator", "document", source)(holder, shimStorage, shimNavigator, shimDocument);
const { en, ar } = holder.CFI18n;

function render(dict, name, withHelper) {
  const lines = [];
  if (withHelper) lines.push("const arPlural = (n: number, one: string, two: string, few: string, many: string): string => (n === 1 ? one : n === 2 ? two : n % 100 >= 3 && n % 100 <= 10 ? few : many);", "");
  lines.push(`export const ${name} = {`);
  for (const key of Object.keys(dict)) {
    const value = dict[key];
    if (typeof value === "function") {
      const text = value.toString().replace(/\n\s*/g, " ");
      const match = /^\(?([^)=]*?)\)?\s*=>\s*([\s\S]*)$/.exec(text);
      const params = match[1].split(",").map((p) => p.trim()).filter(Boolean).map((p) => `${p}: number`).join(", ");
      lines.push(`  ${JSON.stringify(key)}: (${params}): string => ${match[2]},`);
    } else lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  }
  lines.push("};", "");
  return lines.join("\n");
}

fs.mkdirSync("src/i18n", { recursive: true });
fs.writeFileSync("src/i18n/legacy.en.ts", render(en, "legacyEn", false));
fs.writeFileSync("src/i18n/legacy.ar.ts", render(ar, "legacyAr", true));
console.log(Object.keys(en).length, Object.keys(ar).length);

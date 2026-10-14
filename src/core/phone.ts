import { parsePhoneNumberFromString, getCountryCallingCode } from "libphonenumber-js/max";
import type { CountryCode } from "libphonenumber-js/max";
import { latinDigits } from "./fold";

export interface PhoneParts {
  value: string;
  digits: string;
  digitsRev: string;
  e164: string;
}

export function reverseString(input: string): string {
  return [...input].reverse().join("");
}

export function digitsOf(input: string): string {
  return latinDigits(input).replace(/\D/g, "");
}

export function isCountryCode(code: string): code is CountryCode {
  return /^[A-Z]{2}$/.test(code);
}

export function defaultCountryFromLocale(locale: string): CountryCode {
  const region = locale.split("-")[1]?.toUpperCase() ?? "";
  if (isCountryCode(region)) {
    try {
      getCountryCallingCode(region);
      return region;
    } catch {
      return "US";
    }
  }
  return "US";
}

export function parsePhone(raw: string, country: CountryCode): PhoneParts {
  const cleaned = latinDigits(raw).trim();
  const digits = digitsOf(cleaned);
  const normalized = cleaned.replace(/^\s*00/, "+");
  const parsed = parsePhoneNumberFromString(normalized, country);
  const e164 = parsed && parsed.isPossible() ? parsed.number : "";
  return { value: cleaned, digits, digitsRev: reverseString(digits), e164 };
}

export function formatPhone(raw: string, country: CountryCode): string {
  const cleaned = latinDigits(raw).trim();
  const parsed = parsePhoneNumberFromString(cleaned.replace(/^\s*00/, "+"), country);
  if (parsed && parsed.isPossible()) return parsed.number;
  return cleaned;
}

export function previewStoredNumber(raw: string, country: CountryCode): string {
  const cleaned = latinDigits(raw).trim();
  const parsed = parsePhoneNumberFromString(cleaned.replace(/^\s*00/, "+"), country);
  if (parsed && parsed.isPossible()) return parsed.formatInternational();
  return cleaned;
}

export function phoneKey(raw: string): string {
  const digits = digitsOf(raw);
  if (digits.length < 7) return digits;
  return digits.slice(-9);
}

export function normalizeQueryDigits(query: string, country: CountryCode): string {
  let digits = digitsOf(query);
  if (!digits) return "";
  let callingCode = "";
  try {
    callingCode = getCountryCallingCode(country);
  } catch {
    callingCode = "";
  }
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (callingCode && digits.startsWith(callingCode) && digits.length - callingCode.length >= 4) digits = digits.slice(callingCode.length);
  return digits;
}

export function styleNumber(raw: string, style: "saved" | "intl" | "digits"): string {
  const l = latinDigits(raw);
  if (style === "intl") return l.replace(/^\s*00/, "+").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  if (style === "digits") return l.replace(/\D/g, "");
  return raw;
}

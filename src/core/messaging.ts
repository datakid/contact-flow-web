import type { CountryCode } from "libphonenumber-js/max";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { latinDigits } from "./fold";

export type MessageChannel = "whatsapp" | "signal" | "sms" | "tel";

export function toE164(raw: string, country: CountryCode): string | null {
  const cleaned = latinDigits(raw).trim().replace(/^00/, "+");
  if (!/\d/.test(cleaned)) return null;
  const parsed = parsePhoneNumberFromString(cleaned, country);
  if (!parsed) return null;
  return parsed.isValid() || parsed.isPossible() ? parsed.number : null;
}

export function messageUrl(channel: MessageChannel, raw: string, country: CountryCode, text = ""): string | null {
  const e164 = toE164(raw, country);
  if (!e164) return null;
  const body = text ? encodeURIComponent(text) : "";
  if (channel === "whatsapp") return `https://wa.me/${e164.slice(1)}${body ? `?text=${body}` : ""}`;
  if (channel === "signal") return `https://signal.me/#p/${e164}`;
  if (channel === "sms") return `sms:${e164}${body ? `?&body=${body}` : ""}`;
  return `tel:${e164}`;
}

export function firstReachable(phones: Array<{ value: string }>, country: CountryCode): string | null {
  for (const phone of phones) if (toE164(phone.value, country)) return phone.value;
  return null;
}

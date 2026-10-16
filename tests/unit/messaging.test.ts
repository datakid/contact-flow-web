import { describe, expect, it } from "vitest";
import { firstReachable, messageUrl, toE164 } from "../../src/core/messaging";

describe("toE164", () => {
  it("parses a national number with the default country", () => {
    expect(toE164("(415) 555-0123", "US")).toBe("+14155550123");
  });
  it("turns a 00 prefix into an international number", () => {
    expect(toE164("00961 3 123 456", "US")).toBe("+9613123456");
  });
  it("reads Arabic-Indic digits", () => {
    expect(toE164("٠٩١٢٣٤٥٦٧٨", "SY")?.startsWith("+963")).toBe(true);
  });
  it("keeps an explicit country code over the default", () => {
    expect(toE164("+55 11 91234 5678", "US")).toBe("+5511912345678");
  });
  it("rejects text and empty input", () => {
    expect(toE164("hello", "US")).toBeNull();
    expect(toE164("", "US")).toBeNull();
  });
});

describe("messageUrl", () => {
  it("builds whatsapp links without a plus", () => {
    expect(messageUrl("whatsapp", "+961 3 123 456", "US")).toBe("https://wa.me/9613123456");
    expect(messageUrl("whatsapp", "+961 3 123 456", "US", "hi there")).toBe("https://wa.me/9613123456?text=hi%20there");
  });
  it("builds signal links that never carry a query", () => {
    expect(messageUrl("signal", "+961 3 123 456", "US")).toBe("https://signal.me/#p/+9613123456");
    expect(messageUrl("signal", "+961 3 123 456", "US", "hi")).not.toContain("?");
  });
  it("builds sms and tel links", () => {
    expect(messageUrl("sms", "+961 3 123 456", "US")).toBe("sms:+9613123456");
    expect(messageUrl("sms", "+961 3 123 456", "US", "hi")).toBe("sms:+9613123456?&body=hi");
    expect(messageUrl("tel", "+961 3 123 456", "US")).toBe("tel:+9613123456");
  });
  it("returns null for a number that cannot be converted", () => {
    expect(messageUrl("whatsapp", "12", "US")).toBeNull();
  });
});

describe("firstReachable", () => {
  it("skips numbers that cannot be converted", () => {
    expect(firstReachable([{ value: "12" }, { value: "+961 3 123 456" }], "US")).toBe("+961 3 123 456");
    expect(firstReachable([{ value: "x" }], "US")).toBeNull();
  });
});

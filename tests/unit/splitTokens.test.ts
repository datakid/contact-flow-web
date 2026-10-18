import { describe, expect, it } from "vitest";
import { splitTokens } from "../../src/core/splitTokens";

describe("splitTokens", () => {
  it("splits on Latin and Arabic commas and trims", () => {
    expect(splitTokens("a, b،c")).toEqual(["a", "b", "c"]);
  });

  it("drops empty entries from trailing and doubled separators", () => {
    expect(splitTokens("Bob, ,Al,")).toEqual(["Bob", "Al"]);
    expect(splitTokens(" , ، ")).toEqual([]);
  });

  it("returns one entry when there is no separator", () => {
    expect(splitTokens("  Solo  ")).toEqual(["Solo"]);
  });
});

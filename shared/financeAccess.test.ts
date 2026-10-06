import { describe, expect, it } from "vitest";
import { canSeeMoney, parseCsvList } from "./financeAccess";

describe("parseCsvList", () => {
  it("splits, trims and lowercases emails", () => {
    expect(parseCsvList("  Guto@Wise.in, rodrigo@wise.in ")).toEqual([
      "guto@wise.in",
      "rodrigo@wise.in",
    ]);
  });

  it("returns an empty list when unset", () => {
    expect(parseCsvList(undefined)).toEqual([]);
    expect(parseCsvList("")).toEqual([]);
  });
});

describe("canSeeMoney", () => {
  it("allows a global admin without a viewer allowlist", () => {
    expect(canSeeMoney({ role: "admin", email: "anyone@x.com" }, { emails: [], openIds: [] })).toBe(true);
  });

  it("denies a regular member", () => {
    expect(canSeeMoney({ role: "user", email: "member@x.com" }, { emails: [], openIds: [] })).toBe(false);
  });

  it("allows a named viewer by email even when they are not admin", () => {
    expect(
      canSeeMoney(
        { role: "user", email: "guto@wise.in" },
        { emails: ["guto@wise.in"], openIds: [] }
      )
    ).toBe(true);
  });

  it("allows a named viewer by openId", () => {
    expect(
      canSeeMoney(
        { role: "user", email: "other@x.com", openId: "google:guto" },
        { emails: [], openIds: ["google:guto"] }
      )
    ).toBe(true);
  });

  it("does not treat a project-style admin string as platform admin", () => {
    expect(canSeeMoney({ role: "owner", email: "pm@x.com" }, { emails: [], openIds: [] })).toBe(false);
  });
});

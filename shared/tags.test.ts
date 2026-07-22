import { describe, expect, it } from "vitest";
import { parseTags, serializeTags } from "./tags";

describe("parseTags", () => {
  it("returns empty array for null/empty", () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags("   ")).toEqual([]);
  });

  it("parses JSON array", () => {
    expect(parseTags('["bug","ui"]')).toEqual(["bug", "ui"]);
  });

  it("parses comma-separated text", () => {
    expect(parseTags("bug, frontend, design")).toEqual(["bug", "frontend", "design"]);
  });

  it("deduplicates case-insensitively", () => {
    expect(parseTags("Bug, bug, BUG")).toEqual(["Bug"]);
  });

  it("trims whitespace", () => {
    expect(parseTags("  bug ,  ui  ")).toEqual(["bug", "ui"]);
  });
});

describe("serializeTags", () => {
  it("returns null for empty list", () => {
    expect(serializeTags([])).toBeNull();
    expect(serializeTags(["", "  "])).toBeNull();
  });

  it("serializes as JSON array", () => {
    expect(serializeTags(["bug", "ui"])).toBe('["bug","ui"]');
  });

  it("deduplicates on serialize", () => {
    expect(serializeTags(["Bug", "bug"])).toBe('["Bug"]');
  });
});

describe("roundtrip", () => {
  it("parse after serialize preserves tags", () => {
    const tags = ["bug", "frontend"];
    expect(parseTags(serializeTags(tags)!)).toEqual(tags);
  });
});

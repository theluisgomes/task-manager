import { describe, expect, it } from "vitest";
import { inferStatusFromColumnName, inferStatusFromColumnPosition } from "./kanban";

describe("inferStatusFromColumnName", () => {
  it("maps default column names to statuses", () => {
    expect(inferStatusFromColumnName("To Do")).toBe("todo");
    expect(inferStatusFromColumnName("In Progress")).toBe("in_progress");
    expect(inferStatusFromColumnName("In Review")).toBe("in_review");
    expect(inferStatusFromColumnName("Done")).toBe("done");
  });

  it("returns null for unrecognized column names", () => {
    expect(inferStatusFromColumnName("Custom Column")).toBeNull();
  });
});

describe("inferStatusFromColumnPosition", () => {
  it("maps positions 0-3 to default workflow statuses", () => {
    expect(inferStatusFromColumnPosition(0)).toBe("todo");
    expect(inferStatusFromColumnPosition(3)).toBe("done");
  });
});

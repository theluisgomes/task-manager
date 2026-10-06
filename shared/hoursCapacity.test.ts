import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_TARGET,
  allocationOverlapsRange,
  buildWeekTimesheet,
  dailyTargetFromMonthlyHours,
  monthBoundsFromDate,
  pickAllocation,
} from "./hoursCapacity";

describe("dailyTargetFromMonthlyHours", () => {
  it("uses 20 weekdays so 160h/month becomes 8h/day", () => {
    expect(dailyTargetFromMonthlyHours(160)).toBe(8);
  });

  it("falls back to 8h when the contract has no monthly hours", () => {
    expect(dailyTargetFromMonthlyHours(null)).toBe(DEFAULT_DAILY_TARGET);
    expect(dailyTargetFromMonthlyHours(0)).toBe(DEFAULT_DAILY_TARGET);
    expect(dailyTargetFromMonthlyHours(undefined)).toBe(DEFAULT_DAILY_TARGET);
  });

  it("rounds a non-standard month to two decimals", () => {
    expect(dailyTargetFromMonthlyHours(150)).toBe(7.5);
  });
});

describe("monthBoundsFromDate", () => {
  it("returns the first and last day of that month", () => {
    expect(monthBoundsFromDate("2026-02-10")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

describe("allocationOverlapsRange", () => {
  it("treats an open-ended allocation as always active", () => {
    expect(allocationOverlapsRange(null, null, "2026-10-05", "2026-10-09")).toBe(true);
  });

  it("excludes an allocation that ended before the week", () => {
    expect(allocationOverlapsRange("2026-01-01", "2026-01-31", "2026-10-05", "2026-10-09")).toBe(false);
  });

  it("includes an allocation that covers the week", () => {
    expect(allocationOverlapsRange("2026-10-01", "2026-10-31", "2026-10-05", "2026-10-09")).toBe(true);
  });
});

describe("pickAllocation", () => {
  it("returns the overlapping allocation for the project", () => {
    const chosen = pickAllocation(
      [
        { projectId: 1, availableHours: 40, periodStart: "2026-10-01", periodEnd: "2026-10-31" },
        { projectId: 2, availableHours: 20, periodStart: null, periodEnd: null },
      ],
      1,
      "2026-10-05",
      "2026-10-09"
    );
    expect(chosen?.availableHours).toBe(40);
  });

  it("prefers a dated allocation over an open-ended one", () => {
    const chosen = pickAllocation(
      [
        { projectId: 1, availableHours: 80, periodStart: null, periodEnd: null },
        { projectId: 1, availableHours: 40, periodStart: "2026-10-01", periodEnd: "2026-10-31" },
      ],
      1,
      "2026-10-05",
      "2026-10-09"
    );
    expect(chosen?.availableHours).toBe(40);
  });
});

describe("buildWeekTimesheet", () => {
  it("attaches monthly hours and allocation without any money fields", () => {
    const sheet = buildWeekTimesheet({
      projects: [{ id: 1, name: "Acme", color: "#111" }],
      cells: { "1:2026-10-05": 3 },
      allocations: [{ projectId: 1, availableHours: 40, periodStart: null, periodEnd: null }],
      monthHoursByProject: { 1: 12.5 },
      monthHoursTotal: 12.5,
      weekHoursTotal: 3,
      monthlyCapacity: 160,
      weekStart: "2026-10-05",
      weekEnd: "2026-10-09",
    });

    expect(sheet.dailyTarget).toBe(8);
    expect(sheet.monthlyCapacity).toBe(160);
    expect(sheet.workedThisMonth).toBe(12.5);
    expect(sheet.workedThisWeek).toBe(3);
    expect(sheet.projects[0]).toEqual({
      id: 1,
      name: "Acme",
      color: "#111",
      allocatedHours: 40,
      workedThisMonth: 12.5,
      overAllocated: false,
    });
    expect(JSON.stringify(sheet)).not.toMatch(/rate|R\$|cost|revenue/i);
  });

  it("marks a project over-allocated and leaves missing allocations as null", () => {
    const sheet = buildWeekTimesheet({
      projects: [
        { id: 1, name: "Acme", color: null },
        { id: 2, name: "Interno", color: null },
      ],
      cells: {},
      allocations: [{ projectId: 1, availableHours: 10, periodStart: null, periodEnd: null }],
      monthHoursByProject: { 1: 12, 2: 4 },
      monthHoursTotal: 16,
      weekHoursTotal: 0,
      monthlyCapacity: null,
      weekStart: "2026-10-05",
      weekEnd: "2026-10-09",
    });

    expect(sheet.dailyTarget).toBe(8);
    expect(sheet.projects[0].overAllocated).toBe(true);
    expect(sheet.projects[1].allocatedHours).toBeNull();
    expect(sheet.projects[1].overAllocated).toBe(false);
  });
});

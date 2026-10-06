export const DEFAULT_DAILY_TARGET = 8;
export const STANDARD_MONTH_WEEKDAYS = 20;

export type WeekTimesheetProject = {
  id: number;
  name: string;
  color: string | null;
  allocatedHours: number | null;
  workedThisMonth: number;
  overAllocated: boolean;
};

export type WeekTimesheet = {
  projects: WeekTimesheetProject[];
  cells: Record<string, number>;
  dailyTarget: number;
  monthlyCapacity: number | null;
  workedThisMonth: number;
  workedThisWeek: number;
};

export type AllocationCandidate = {
  projectId: number;
  availableHours: number;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
};

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value.slice(0, 10);
}

export function dailyTargetFromMonthlyHours(monthly?: number | null): number {
  if (monthly == null || !Number.isFinite(monthly) || monthly <= 0) return DEFAULT_DAILY_TARGET;
  return Math.round((monthly / STANDARD_MONTH_WEEKDAYS) * 100) / 100;
}

export function formatHoursLabel(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`;
}

export function monthBoundsFromDate(isoDate: string): { start: string; end: string } {
  const [year, month] = isoDate.slice(0, 10).split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  const yyyyMm = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  return {
    start: `${yyyyMm}-01`,
    end: `${yyyyMm}-${String(last).padStart(2, "0")}`,
  };
}

export function allocationOverlapsRange(
  periodStart: string | Date | null | undefined,
  periodEnd: string | Date | null | undefined,
  rangeStart: string,
  rangeEnd: string
): boolean {
  const start = periodStart ? toIsoDate(periodStart) : null;
  const end = periodEnd ? toIsoDate(periodEnd) : null;
  if (start && start > rangeEnd) return false;
  if (end && end < rangeStart) return false;
  return true;
}

export function pickAllocation<T extends AllocationCandidate>(
  allocations: T[],
  projectId: number,
  rangeStart: string,
  rangeEnd: string
): T | null {
  const matches = allocations.filter(
    (row) =>
      row.projectId === projectId &&
      allocationOverlapsRange(row.periodStart, row.periodEnd, rangeStart, rangeEnd)
  );
  if (!matches.length) return null;
  const dated = matches.filter((row) => row.periodStart || row.periodEnd);
  return (dated[0] ?? matches[0]) ?? null;
}

export function buildWeekTimesheet(input: {
  projects: Array<{ id: number; name: string; color: string | null }>;
  cells: Record<string, number>;
  allocations: AllocationCandidate[];
  monthHoursByProject: Record<number, number>;
  monthHoursTotal: number;
  weekHoursTotal: number;
  monthlyCapacity: number | null;
  weekStart: string;
  weekEnd: string;
}): WeekTimesheet {
  return {
    cells: input.cells,
    dailyTarget: dailyTargetFromMonthlyHours(input.monthlyCapacity),
    monthlyCapacity: input.monthlyCapacity,
    workedThisMonth: input.monthHoursTotal,
    workedThisWeek: input.weekHoursTotal,
    projects: input.projects.map((project) => {
      const allocation = pickAllocation(input.allocations, project.id, input.weekStart, input.weekEnd);
      const workedThisMonth = input.monthHoursByProject[project.id] ?? 0;
      const allocatedHours = allocation ? allocation.availableHours : null;
      return {
        id: project.id,
        name: project.name,
        color: project.color,
        allocatedHours,
        workedThisMonth,
        overAllocated: allocatedHours != null && workedThisMonth > allocatedHours,
      };
    }),
  };
}

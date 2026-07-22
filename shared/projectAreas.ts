export const PROJECT_AREAS = [
  { id: "prospectos", label: "Prospectos" },
  { id: "clientes", label: "Clientes" },
  { id: "juridico", label: "Jurídico" },
  { id: "financeiro", label: "Financeiro" },
  { id: "comunicacao", label: "Comunicação" },
] as const;

export type ProjectArea = (typeof PROJECT_AREAS)[number]["id"];

export const PROJECT_AREA_IDS = PROJECT_AREAS.map((a) => a.id) as [ProjectArea, ...ProjectArea[]];

export function getProjectAreaLabel(area: ProjectArea): string {
  return PROJECT_AREAS.find((a) => a.id === area)?.label ?? area;
}

export const BILLABLE_PROJECT_AREAS = ["clientes", "prospectos"] as const;

export type BillableProjectArea = (typeof BILLABLE_PROJECT_AREAS)[number];

export function isBillableProjectArea(area: ProjectArea): area is BillableProjectArea {
  return (BILLABLE_PROJECT_AREAS as readonly string[]).includes(area);
}

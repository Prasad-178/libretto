/** Display metadata only. Stable model IDs and explicit efforts belong to YAML. */
export type ReasoningMetadata = {
  supported_efforts?: string[] | null;
  default_effort?: string;
  mandatory?: boolean;
  default_enabled?: boolean;
};
export type CatalogModel = {
  id: string;
  name: string;
  pricing: {
    inputPerMillion: string | null;
    outputPerMillion: string | null;
    request: string | null;
  };
  reasoning?: ReasoningMetadata;
  contextLength?: number;
};
export type ModelCatalog = {
  status: "fresh" | "stale" | "unavailable";
  source: string;
  fetchedAt: string | null;
  currency: "USD";
  priceBasis: string;
  models: CatalogModel[];
};
const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
export function effortOptions(reasoning?: ReasoningMetadata): string[] {
  const supported = reasoning?.supported_efforts;
  return EFFORTS.filter(
    (e) =>
      (supported === null || supported?.includes(e)) &&
      !(e === "none" && reasoning?.mandatory),
  );
}
export function priceLabel(price: string | null): string {
  if (
    price === null ||
    price.trim() === "" ||
    !Number.isFinite(Number(price)) ||
    Number(price) < 0
  )
    return "Unknown";
  const n = Number(price);
  return `$${n !== 0 && n < 0.000001 ? n.toExponential(2) : new Intl.NumberFormat("en-US", { maximumFractionDigits: 9 }).format(n)}`;
}
export function modelChoices(
  models: CatalogModel[],
  current: string,
  query: string,
): CatalogModel[] {
  const choices = [...models];
  if (current && !choices.some((m) => m.id === current))
    choices.unshift({
      id: current,
      name: current,
      pricing: { inputPerMillion: null, outputPerMillion: null, request: null },
    });
  const search = query.trim().toLowerCase();
  return choices.filter((m) =>
    `${m.name} ${m.id}`.toLowerCase().includes(search),
  );
}
export const modelDefaults = {
  speaker: "google/gemini-3.5-flash",
  evaluator: "google/gemini-3.5-flash",
};
export function effortName(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

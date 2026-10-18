export const FAR_FUTURE = 9999999999;

export type GraphNode = {
  id: string;
  kind: string;
  name: string;
  tier: number | null;
  current_load: number | null;
  max_capacity: number | null;
  pii_classified: boolean | null;
  min_ricci_kappa: number | null;
  oncall_available: boolean | null;
  severity: string | null;
  title: string | null;
  action_type: string | null;
  doc_type: string | null;
  function_name: string | null;
  execution_cost: number | null;
  exposure: string | null;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  ricci_curvature: number | null;
  p99_latency_ms: number | null;
  pheromone_weight: number | null;
  success_count: number | null;
  last_updated: number | null;
  dark_penalty: number | null;
  risk_score: number | null;
  is_fallback: boolean | null;
  owner_a: string | null;
  owner_b: string | null;
  verified_by: string | null;
  failure_reason: string | null;
  t_valid_from: number | null;
  t_valid_to: number | null;
  t_tx_created: number | null;
  t_tx_superseded: number | null;
  ttl_epoch: number | null;
};

export type GraphData = {
  graph: string;
  tenant: string;
  atTime: number;
  baseline: number;
  incident: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type HiveMotif = {
  wl_hash: string;
  action_type: string;
  failure_mode: string;
  hit_count: number;
  canonical_signature: string;
};

export type ShieldResult = {
  id: "INV-SPOF" | "INV-RICCI" | "INV-PII-AUTH" | "INV-CONWAY-QUORUM";
  violations: number;
  offenders: string[];
  detail: string;
};

export type ShieldReport = {
  shields: ShieldResult[];
  passed: number;
  blocked: boolean;
};

export type SwarmEvent = {
  agent: string;
  kind: string;
  t_ms?: number;
  detail?: Record<string, unknown>;
};

export type RicciEdge = {
  id: string;
  source: string;
  target: string;
  kappa: number;
  shared: number;
  degreeSource: number;
  degreeTarget: number;
  regime: "HYPERBOLIC" | "FRAGILE" | "RESILIENT";
};

export type GhostEdge = {
  source: string;
  target: string;
  hop: number;
  ownerA: string;
  ownerB: string;
};

export type UcbRow = {
  actionId: string;
  actionName: string;
  actionType: string;
  pheromone: number;
  visits: number;
  dark: number;
  hive: number;
  cost: number;
  ucb: number;
  hash: string;
  pruned: boolean;
  reason: string | null;
};

export type LogLine = {
  id: string;
  t: number;
  ms: number;
  channel: string;
  text: string;
  payload?: string;
};

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string };

export type ChaosBudget = {
  loadFactor: number;
  latencyMs: number;
  outage: number;
};

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function flag(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return null;
}

export function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function edgeIdentity(edge: Pick<GraphEdge, "source" | "type" | "target" | "t_tx_created" | "t_valid_from">): string {
  return [edge.source, edge.type, edge.target, edge.t_tx_created ?? "na", edge.t_valid_from ?? "na"].join("|");
}

export function edgeActive(edge: GraphEdge, at: number): boolean {
  if (edge.t_valid_from === null && edge.t_valid_to === null) return true;
  const from = edge.t_valid_from ?? 0;
  const to = edge.t_valid_to ?? FAR_FUTURE;
  return from <= at && at < to;
}

export function displayName(node: GraphNode): string {
  return node.name || node.title || node.function_name || node.id;
}

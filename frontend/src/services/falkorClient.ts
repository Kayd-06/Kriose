import type { GraphData, GraphEdge, GraphNode, HiveMotif, SwarmEvent } from "@/types/graph";
import { edgeIdentity, flag, num, text } from "@/types/graph";
import { demoActive, demoForced, demoGraph, demoHealth, demoHive, demoStream, enableAutoDemo } from "./demoBackend";

export { demoActive } from "./demoBackend";

const RAW = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v2";

export function apiUrl(path: string): string {
  const base = RAW.replace(/\/$/, "");
  const root = base.endsWith("/api/v2") ? base : `${base}/api/v2`;
  return `${root}${path.startsWith("/") ? path : `/${path}`}`;
}

export type Health = { ok: boolean; graphs: string[]; latencyMs: number };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return body as T;
}

export async function ping(): Promise<Health> {
  const started = performance.now();
  if (demoActive()) {
    const body = await demoHealth();
    return { ...body, latencyMs: 0 };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(apiUrl("/health"), { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    const body = await readJson<{ ok?: boolean; graphs?: string[] }>(response);
    return {
      ok: Boolean(body.ok),
      graphs: body.graphs ?? [],
      latencyMs: Math.round(performance.now() - started),
    };
  } catch {
    // API unreachable (e.g. static hosting): fall back to the recorded demo.
    if (!demoForced()) {
      enableAutoDemo();
      if (demoActive()) return { ...(await demoHealth()), latencyMs: 0 };
    }
    return { ok: false, graphs: [], latencyMs: Math.round(performance.now() - started) };
  }
}

export function tenantOf(graphName: string): string {
  return graphName.startsWith("kriose_") ? graphName.slice("kriose_".length) : graphName;
}

export function graphOf(tenant: string): string {
  return tenant.startsWith("kriose_") ? tenant : `kriose_${tenant}`;
}

function asNode(raw: Record<string, unknown>): GraphNode | null {
  const id = text(raw.id);
  if (!id) return null;
  return {
    id,
    kind: text(raw.kind) || "Service",
    name: text(raw.name) || text(raw.title) || text(raw.function_name) || id,
    tier: num(raw.tier),
    current_load: num(raw.current_load),
    max_capacity: num(raw.max_capacity),
    pii_classified: flag(raw.pii_classified),
    min_ricci_kappa: num(raw.min_ricci_kappa),
    oncall_available: flag(raw.oncall_available),
    severity: text(raw.severity),
    title: text(raw.title),
    action_type: text(raw.action_type),
    doc_type: text(raw.doc_type),
    function_name: text(raw.function_name),
    execution_cost: num(raw.execution_cost),
    exposure: text(raw.exposure),
  };
}

function asEdge(raw: Record<string, unknown>): GraphEdge | null {
  const source = text(raw.source);
  const target = text(raw.target);
  const type = text(raw.type);
  if (!source || !target || !type) return null;
  const edge: GraphEdge = {
    id: "",
    source,
    target,
    type,
    ricci_curvature: num(raw.ricci_curvature),
    p99_latency_ms: num(raw.p99_latency_ms),
    pheromone_weight: num(raw.pheromone_weight),
    success_count: num(raw.success_count),
    last_updated: num(raw.last_updated),
    dark_penalty: num(raw.dark_penalty),
    risk_score: num(raw.risk_score),
    is_fallback: flag(raw.is_fallback),
    owner_a: text(raw.owner_a),
    owner_b: text(raw.owner_b),
    verified_by: text(raw.verified_by),
    failure_reason: text(raw.failure_reason),
    t_valid_from: num(raw.t_valid_from),
    t_valid_to: num(raw.t_valid_to),
    t_tx_created: num(raw.t_tx_created),
    t_tx_superseded: num(raw.t_tx_superseded),
    ttl_epoch: num(raw.ttl_epoch),
  };
  edge.id = edgeIdentity(edge);
  return edge;
}

export async function loadGraph(tenant: string): Promise<GraphData> {
  const body = (demoActive()
    ? await demoGraph(tenant)
    : await readJson(await fetch(apiUrl(`/graph?tenant=${encodeURIComponent(tenant)}&all_time=1`), { cache: "no-store" }))) as {
    tenant?: string;
    at_time?: number;
    baseline?: number;
    incident?: number;
    nodes?: Record<string, unknown>[];
    links?: Record<string, unknown>[];
  };
  const nodes = (body.nodes ?? []).map(asNode).filter((node): node is GraphNode => Boolean(node));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (body.links ?? [])
    .map(asEdge)
    .filter((edge): edge is GraphEdge => Boolean(edge && ids.has(edge.source) && ids.has(edge.target)));
  const incident = num(body.incident) ?? Math.floor(Date.now() / 1000);
  return {
    graph: graphOf(body.tenant || tenant),
    tenant: body.tenant || tenant,
    atTime: num(body.at_time) ?? incident,
    baseline: num(body.baseline) ?? incident - 3 * 86400,
    incident,
    nodes,
    edges,
  };
}

export async function loadHive(): Promise<HiveMotif[]> {
  const body = (demoActive()
    ? await demoHive()
    : await readJson(await fetch(apiUrl("/hivemind"), { cache: "no-store" }))) as { motifs?: Record<string, unknown>[] };
  return (body.motifs ?? []).map((row) => ({
    wl_hash: text(row.wl_hash) || "",
    action_type: text(row.action_type) || "",
    failure_mode: text(row.failure_mode) || "",
    hit_count: num(row.hit_count) ?? 0,
    canonical_signature: text(row.canonical_signature) || "",
  }));
}

export async function createTenant(tenant: string): Promise<void> {
  if (demoActive()) throw new Error("Not available in the hosted demo. Run locally with docker compose to edit the graph.");
  const response = await fetch(apiUrl("/graphs"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant }),
  });
  await readJson(response);
}

export async function runCypher(graph: string, cypher: string): Promise<{ count: number; rows: unknown[] }> {
  if (demoActive()) throw new Error("Not available in the hosted demo. Run locally with docker compose to edit the graph.");
  const response = await fetch(apiUrl("/cypher"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph, cypher }),
  });
  return readJson(response);
}

export async function publishMotif(tenant: string, focusId: string, actionType: string, failureMode: string): Promise<HiveMotif[]> {
  const query = new URLSearchParams({ tenant, focus_id: focusId, action_type: actionType, failure_mode: failureMode });
  const response = await fetch(apiUrl(`/hivemind/publish?${query.toString()}`), { method: "POST" });
  const body = await readJson<{ hive?: { motifs?: Record<string, unknown>[] } }>(response);
  return (body.hive?.motifs ?? []).map((row) => ({
    wl_hash: text(row.wl_hash) || "",
    action_type: text(row.action_type) || "",
    failure_mode: text(row.failure_mode) || "",
    hit_count: num(row.hit_count) ?? 0,
    canonical_signature: text(row.canonical_signature) || "",
  }));
}

export async function recomputeRicci(tenant: string): Promise<void> {
  if (demoActive()) return;
  const response = await fetch(apiUrl(`/ricci-map?tenant=${encodeURIComponent(tenant)}`), { cache: "no-store" });
  await readJson(response);
}

export async function streamSwarm(
  tenant: string,
  alertId: string,
  onEvent: (event: SwarmEvent) => void,
): Promise<void> {
  if (demoActive()) return demoStream(tenant, onEvent);
  const response = await fetch(
    apiUrl(`/swarm/simulate?tenant=${encodeURIComponent(tenant)}&alert_id=${encodeURIComponent(alertId)}`),
    { method: "POST" },
  );
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || `HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      onEvent(JSON.parse(line.slice(6)) as SwarmEvent);
    }
  }
}

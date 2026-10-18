import { parse } from "yaml";
import { FAR_FUTURE, type GraphData, type GraphEdge, type GraphNode } from "@/types/graph";
import { escapeCypher, makeEdge } from "@/lib/graphMathEngine";
import { blankNode } from "@/lib/memoryCypher";

export type Draft = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cypher: string[];
  note: string;
};

export type SynthParams = {
  services: number;
  engineers: number;
  actions: number;
  coupling: number;
  loadVariance: number;
};

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "n";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cypherForDraft(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const statements: string[] = [];
  for (const node of nodes) {
    const sets = [`a.name = '${escapeCypher(node.name)}'`];
    if (node.tier !== null) sets.push(`a.tier = ${node.tier}`);
    if (node.current_load !== null) sets.push(`a.current_load = ${node.current_load}`);
    if (node.max_capacity !== null) sets.push(`a.max_capacity = ${node.max_capacity}`);
    if (node.pii_classified !== null) sets.push(`a.pii_classified = ${node.pii_classified}`);
    if (node.exposure) sets.push(`a.exposure = '${escapeCypher(node.exposure)}'`);
    if (node.action_type) sets.push(`a.action_type = '${escapeCypher(node.action_type)}'`);
    if (node.execution_cost !== null) sets.push(`a.execution_cost = ${node.execution_cost}`);
    if (node.oncall_available !== null) sets.push(`a.oncall_available = ${node.oncall_available}`);
    statements.push(`MERGE (a:${node.kind} {id: '${escapeCypher(node.id)}'}) SET ${sets.join(", ")}`);
  }
  for (const edge of edges) {
    const sets = [
      `r.t_valid_from = ${edge.t_valid_from ?? 0}`,
      `r.t_valid_to = ${edge.t_valid_to ?? FAR_FUTURE}`,
      `r.t_tx_created = ${edge.t_tx_created ?? 0}`,
      `r.t_tx_superseded = ${edge.t_tx_superseded ?? FAR_FUTURE}`,
    ];
    if (edge.p99_latency_ms !== null) sets.push(`r.p99_latency_ms = ${edge.p99_latency_ms}`);
    if (edge.pheromone_weight !== null) sets.push(`r.weight = ${edge.pheromone_weight}`);
    if (edge.success_count !== null) sets.push(`r.success_count = ${edge.success_count}`);
    if (edge.is_fallback) sets.push(`r.is_fallback = true`);
    statements.push(
      `MATCH (a {id: '${escapeCypher(edge.source)}'}), (b {id: '${escapeCypher(edge.target)}'}) MERGE (a)-[r:${edge.type}]->(b) SET ${sets.join(", ")}`,
    );
  }
  return statements;
}

function finish(nodes: GraphNode[], edges: GraphEdge[], note: string): Draft {
  return { nodes, edges, cypher: cypherForDraft(nodes, edges), note };
}

export function parseComposeYaml(source: string): Draft {
  const doc = asRecord(parse(source));
  if (!doc) throw new Error("YAML root must be a map.");
  const services = asRecord(doc.services);
  if (!services) throw new Error("No services map. Expected docker-compose services.");
  const now = Math.floor(Date.now() / 1000);
  const baseline = now - 3 * 86400;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const ids = new Map<string, string>();
  for (const key of Object.keys(services)) {
    const id = slug(key);
    ids.set(key, id);
    const spec = asRecord(services[key]) ?? {};
    const labels = asRecord(spec.labels) ?? {};
    const deploy = asRecord(spec.deploy);
    const resources = deploy ? asRecord(deploy.resources) : null;
    const limits = resources ? asRecord(resources.limits) : null;
    const node = blankNode(id, labelKind(labels, limits), key);
    node.tier = numberOr(labels.tier, 1);
    node.max_capacity = numberOr(labels.capacity, 100);
    node.current_load = numberOr(labels.load, null);
    node.pii_classified = labels.pii === true || labels.pii === "true";
    node.exposure = typeof labels.exposure === "string" ? labels.exposure : null;
    if (Array.isArray(spec.ports) && node.kind === "Service" && spec.ports.length && labels.exposure === "public") {
      node.kind = "Ingress";
      node.exposure = "public";
    }
    nodes.push(node);
  }
  for (const key of Object.keys(services)) {
    const spec = asRecord(services[key]) ?? {};
    const deps = dependsList(spec.depends_on);
    for (const dep of deps) {
      const source = ids.get(dep);
      const target = ids.get(key);
      if (!source || !target) continue;
      edges.push(makeEdge(source, target, "DEPENDS_ON", now, { t_valid_from: baseline, p99_latency_ms: null }));
    }
  }
  return finish(nodes, edges, `${nodes.length} services from compose`);
}

function labelKind(labels: Record<string, unknown>, limits: Record<string, unknown> | null): string {
  const kind = typeof labels.kind === "string" ? labels.kind : "";
  if (kind === "Database" || kind === "Ingress") return kind;
  if (limits && (limits.memory || limits.cpu || limits.cpus)) return "Service";
  return "Service";
}

function numberOr(value: unknown, fallback: number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function dependsList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  const record = asRecord(value);
  return record ? Object.keys(record) : [];
}

export function parseTopologyJson(source: string): Draft {
  const data = JSON.parse(source) as unknown;
  const now = Math.floor(Date.now() / 1000);
  const baseline = now - 3 * 86400;
  if (Array.isArray(data)) return spansToDraft(data, now, baseline);
  const record = asRecord(data);
  if (!record) throw new Error("JSON root must be an object or an array.");
  if (Array.isArray(record.resourceSpans)) return otelToDraft(record.resourceSpans, now, baseline);
  if (record.dependencies && (record.name || record.packages)) return packageToDraft(record, now, baseline);
  if (Array.isArray(record.nodes)) return explicitGraph(record, now, baseline);
  throw new Error("Unrecognized JSON. Expected spans, resourceSpans, package.json, or {nodes, edges}.");
}

function spansToDraft(rows: unknown[], now: number, baseline: number): Draft {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) continue;
    const service = textOf(item.service) || textOf(item.name);
    if (!service) continue;
    const id = slug(service);
    const node = nodes.get(id) ?? blankNode(id, "Service", service);
    const load = numberOr(item.current_load, null);
    if (load !== null) node.current_load = load;
    node.max_capacity = node.max_capacity ?? 100;
    nodes.set(id, node);
    const upstream = textOf(item.upstream);
    if (upstream) {
      const upId = slug(upstream);
      if (!nodes.has(upId)) nodes.set(upId, blankNode(upId, "Service", upstream));
      edges.push(
        makeEdge(upId, id, "DEPENDS_ON", now, {
          t_valid_from: baseline,
          p99_latency_ms: numberOr(item.p99_latency_ms, null),
        }),
      );
    }
  }
  return finish([...nodes.values()], edges, `${nodes.size} services from span records`);
}

function otelToDraft(resourceSpans: unknown[], now: number, baseline: number): Draft {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const resource of resourceSpans) {
    const scope = asRecord(resource);
    const attributes = scope?.resource && asRecord(scope.resource) ? attributeName(asRecord(scope.resource)?.attributes) : null;
    const service = attributes || "span-service";
    const id = slug(service);
    if (!nodes.has(id)) nodes.set(id, blankNode(id, "Service", service));
    const groups = Array.isArray(scope?.scopeSpans) ? scope.scopeSpans : [];
    for (const group of groups) {
      const spans = asRecord(group);
      for (const span of Array.isArray(spans?.spans) ? spans.spans : []) {
        const body = asRecord(span);
        const parent = textOf(body?.parentService);
        if (parent) {
          const parentId = slug(parent);
          if (!nodes.has(parentId)) nodes.set(parentId, blankNode(parentId, "Service", parent));
          edges.push(makeEdge(parentId, id, "DEPENDS_ON", now, { t_valid_from: baseline }));
        }
      }
    }
  }
  return finish([...nodes.values()], edges, `${nodes.size} services from OpenTelemetry resourceSpans`);
}

function attributeName(attributes: unknown): string | null {
  if (!Array.isArray(attributes)) return null;
  for (const item of attributes) {
    const row = asRecord(item);
    if (row?.key === "service.name") {
      const value = asRecord(row.value);
      return textOf(value?.stringValue);
    }
  }
  return null;
}

function packageToDraft(record: Record<string, unknown>, now: number, baseline: number): Draft {
  const name = textOf(record.name) || "package";
  const root = blankNode(slug(name), "Service", name);
  const nodes = [root];
  const edges: GraphEdge[] = [];
  const deps = asRecord(record.dependencies) ?? {};
  for (const key of Object.keys(deps)) {
    const node = blankNode(slug(key), "Service", key);
    nodes.push(node);
    edges.push(makeEdge(root.id, node.id, "DEPENDS_ON", now, { t_valid_from: baseline }));
  }
  return finish(nodes, edges, `${nodes.length} nodes from dependency manifest`);
}

function explicitGraph(record: Record<string, unknown>, now: number, baseline: number): Draft {
  const nodes: GraphNode[] = [];
  for (const item of record.nodes as unknown[]) {
    const row = asRecord(item);
    if (!row) continue;
    const id = textOf(row.id) || textOf(row.name);
    if (!id) continue;
    const node = blankNode(slug(id), textOf(row.kind) || "Service", textOf(row.name) || id);
    node.tier = numberOr(row.tier, null);
    node.current_load = numberOr(row.current_load, null);
    node.max_capacity = numberOr(row.max_capacity, null);
    node.pii_classified = row.pii_classified === true;
    node.exposure = textOf(row.exposure);
    node.action_type = textOf(row.action_type);
    nodes.push(node);
  }
  const edges: GraphEdge[] = [];
  const rawEdges = Array.isArray(record.edges) ? record.edges : Array.isArray(record.links) ? record.links : [];
  for (const item of rawEdges) {
    const row = asRecord(item);
    if (!row) continue;
    const source = textOf(row.source);
    const target = textOf(row.target);
    if (!source || !target) continue;
    edges.push(
      makeEdge(slug(source), slug(target), textOf(row.type) || "DEPENDS_ON", now, {
        t_valid_from: baseline,
        p99_latency_ms: numberOr(row.p99_latency_ms, null),
      }),
    );
  }
  return finish(nodes, edges, `${nodes.length} nodes from JSON topology`);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthesizeScaleFree(params: SynthParams): Draft {
  const services = clamp(Math.round(params.services), 5, 50);
  const engineers = clamp(Math.round(params.engineers), 2, 20);
  const actions = clamp(Math.round(params.actions), 2, 8);
  const coupling = clamp(params.coupling, 0, 1);
  const variance = clamp(params.loadVariance, 0, 1);
  const rand = mulberry32(
    services * 100003 + engineers * 1009 + actions * 17 + Math.round(coupling * 1000) + Math.round(variance * 1000),
  );
  const now = Math.floor(Date.now() / 1000);
  const baseline = now - 3 * 86400;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const degrees: number[] = [];
  const attach = Math.max(1, Math.round(1 + coupling * 2));
  for (let index = 0; index < services; index += 1) {
    const id = `n${index.toString(16).padStart(2, "0")}`;
    const node = blankNode(id, "Service", id);
    node.tier = index < Math.ceil(services * 0.25) ? 1 : index < services * 0.7 ? 2 : 3;
    node.max_capacity = 100;
    node.pii_classified = index === services - 1 && variance > 0.45;
    nodes.push(node);
    degrees.push(0);
  }
  const link = (from: number, to: number, fallback = false) => {
    if (from === to) return;
    const source = nodes[from].id;
    const target = nodes[to].id;
    if (edges.some((edge) => edge.type === "DEPENDS_ON" && edge.source === source && edge.target === target)) return;
    edges.push(
      makeEdge(source, target, "DEPENDS_ON", now, {
        t_valid_from: baseline,
        p99_latency_ms: Math.round(20 + rand() * 180),
        is_fallback: fallback,
      }),
    );
    degrees[from] += 1;
    degrees[to] += 1;
  };
  const seed = Math.min(3, services);
  for (let index = 1; index < seed; index += 1) link(index - 1, index);
  for (let index = seed; index < services; index += 1) {
    const used = new Set<number>();
    for (let arm = 0; arm < attach; arm += 1) {
      const total = degrees.reduce((sum, value) => sum + value, 0) || 1;
      let cursor = rand() * total;
      let pick = 0;
      for (let candidate = 0; candidate < index; candidate += 1) {
        cursor -= degrees[candidate];
        if (cursor <= 0) {
          pick = candidate;
          break;
        }
      }
      if (used.has(pick)) continue;
      used.add(pick);
      if (rand() < coupling) link(pick, index);
      else link(index, pick);
    }
  }
  for (let index = 0; index < engineers; index += 1) {
    const id = `e${index.toString(16).padStart(2, "0")}`;
    const engineer = blankNode(id, "Engineer", id);
    engineer.oncall_available = rand() > 0.15;
    nodes.push(engineer);
    const owned = nodes[index % services];
    edges.push(makeEdge(id, owned.id, "OWNS", now, { t_valid_from: baseline }));
  }
  const engineerNodes = nodes.filter((node) => node.kind === "Engineer");
  for (let left = 0; left < engineerNodes.length; left += 1) {
    for (let right = left + 1; right < engineerNodes.length; right += 1) {
      if (rand() < coupling * 0.45) {
        edges.push(makeEdge(engineerNodes[left].id, engineerNodes[right].id, "COMMUNICATED_WITH", now, { t_valid_from: baseline }));
      }
    }
  }
  const alert = blankNode("alrt", "Alert", "alrt");
  alert.severity = "high";
  nodes.push(alert);
  const hub = degrees.indexOf(Math.max(...degrees));
  edges.push(makeEdge(alert.id, nodes[hub].id, "TRIGGERED_ON", now, { t_valid_from: baseline }));
  for (let index = 0; index < actions; index += 1) {
    const id = `a${index.toString(16).padStart(2, "0")}`;
    const action = blankNode(id, "RunbookAction", id);
    action.action_type = index === 0 ? "RESTART" : index === 1 ? "THROTTLE" : index === 2 ? "REROUTE_AND_HEAL" : `ACT_${index}`;
    action.execution_cost = 1 + (index % 4);
    nodes.push(action);
    edges.push(
      makeEdge(alert.id, id, "PHEROMONE_TRACE", now, {
        t_valid_from: null,
        t_valid_to: null,
        pheromone_weight: Number((0.2 + rand() * 0.7).toFixed(3)),
        success_count: 1 + Math.floor(rand() * 6),
        last_updated: now,
      }),
    );
  }
  if (variance > 0.5) {
    const ingress = blankNode("ing", "Ingress", "ing");
    ingress.exposure = "public";
    nodes.push(ingress);
    const guard = blankNode("auth", "AuthMiddleware", "auth");
    nodes.push(guard);
    edges.push(makeEdge(ingress.id, guard.id, "DEPENDS_ON", now, { t_valid_from: baseline }));
    edges.push(makeEdge(guard.id, nodes[0].id, "DEPENDS_ON", now, { t_valid_from: baseline }));
  }
  for (const node of nodes) {
    if (node.kind !== "Service") continue;
    const degree = degrees[nodes.filter((item) => item.kind === "Service").indexOf(node)] ?? 1;
    const swing = variance * 90;
    node.current_load = Math.round(15 + degree * 8 + rand() * swing);
  }
  const retiring = edges.find((edge) => edge.type === "DEPENDS_ON");
  if (retiring) retiring.t_valid_to = now - 86400;
  const stamped = edges.map((edge) => ({ ...edge, id: `${edge.source}|${edge.type}|${edge.target}|${edge.t_tx_created ?? "na"}|${edge.t_valid_from ?? "na"}` }));
  return finish(nodes, stamped, `${services} services, ${engineers} engineers, ${actions} actions`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function materialize(draft: Draft, graphName: string, tenant: string): GraphData {
  const now = Math.floor(Date.now() / 1000);
  return {
    graph: graphName,
    tenant,
    atTime: now,
    baseline: now - 3 * 86400,
    incident: now,
    nodes: draft.nodes.map((node) => ({ ...node })),
    edges: draft.edges.map((edge) => ({ ...edge })),
  };
}

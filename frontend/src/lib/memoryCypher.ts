import { FAR_FUTURE, type GraphData, type GraphEdge, type GraphNode, edgeIdentity } from "@/types/graph";
import { escapeCypher, makeEdge } from "@/lib/graphMathEngine";

const KINDS = [
  "Service",
  "Database",
  "Ingress",
  "AuthMiddleware",
  "Engineer",
  "Team",
  "DecisionDoc",
  "CodeSymbol",
  "RunbookAction",
  "Alert",
  "EpisodicMemory",
];

export function emptyGraph(graph: string, tenant: string): GraphData {
  const now = Math.floor(Date.now() / 1000);
  return {
    graph,
    tenant,
    atTime: now,
    baseline: now - 3 * 86400,
    incident: now,
    nodes: [],
    edges: [],
  };
}

export function blankNode(id: string, kind: string, name: string): GraphNode {
  return {
    id,
    kind,
    name,
    tier: null,
    current_load: null,
    max_capacity: null,
    pii_classified: null,
    min_ricci_kappa: null,
    oncall_available: null,
    severity: null,
    title: null,
    action_type: null,
    doc_type: null,
    function_name: null,
    execution_cost: null,
    exposure: null,
  };
}

function applyProps(target: Record<string, unknown>, props: Record<string, string | number | boolean>) {
  for (const [key, value] of Object.entries(props)) {
    if (key === "id") continue;
    target[key] = value;
  }
}

export function parseProps(body: string): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  let index = 0;
  const text = body.trim();
  while (index < text.length) {
    while (text[index] === "," || text[index] === " ") index += 1;
    const keyEnd = text.indexOf(":", index);
    if (keyEnd < 0) break;
    const key = text.slice(index, keyEnd).trim();
    index = keyEnd + 1;
    while (text[index] === " ") index += 1;
    if (text[index] === "'") {
      let value = "";
      index += 1;
      while (index < text.length && text[index] !== "'") {
        if (text[index] === "\\") {
          value += text[index + 1] ?? "";
          index += 2;
          continue;
        }
        value += text[index];
        index += 1;
      }
      index += 1;
      props[key] = value;
      continue;
    }
    const match = text.slice(index).match(/^(true|false|-?\d+(?:\.\d+)?)/);
    if (!match) break;
    props[key] = match[1] === "true" ? true : match[1] === "false" ? false : Number(match[1]);
    index += match[1].length;
  }
  return props;
}

function ensureNode(graph: GraphData, id: string, kind = "Service"): GraphNode {
  const found = graph.nodes.find((node) => node.id === id);
  if (found) {
    if (kind && found.kind === "Service" && kind !== "Service") found.kind = kind;
    return found;
  }
  const node = blankNode(id, kind || "Service", id);
  graph.nodes.push(node);
  return node;
}

export function applyStatement(graph: GraphData, statement: string): { rows: number } {
  const cypher = statement.trim().replace(/;\s*$/, "");
  const mergeNode = cypher.match(/^MERGE \((\w+):(\w+) \{id: '([^']+)'\}\)\s*SET\s+([\s\S]+)$/);
  if (mergeNode) {
    const node = ensureNode(graph, mergeNode[3], mergeNode[2]);
    const props = parseProps(mergeNode[4].replace(new RegExp(`\\b${mergeNode[1]}\\.`, "g"), ""));
    applyProps(node as unknown as Record<string, unknown>, props);
    if (typeof props.name === "string") node.name = props.name;
    return { rows: 1 };
  }
  const matchSet = cypher.match(/^MATCH \(n \{id: '([^']+)'\}\) SET ([\s\S]+)$/);
  if (matchSet) {
    const node = ensureNode(graph, matchSet[1]);
    const props = parseProps(matchSet[2].replace(/\bn\./g, ""));
    applyProps(node as unknown as Record<string, unknown>, props);
    return { rows: 1 };
  }
  const matchAlias = cypher.match(/^MATCH \((\w+) \{id: '([^']+)'\}\) SET ([\s\S]+)$/);
  if (matchAlias && !cypher.includes("MERGE") && !cypher.includes("]-")) {
    const node = ensureNode(graph, matchAlias[2]);
    const props = parseProps(matchAlias[3].replace(new RegExp(`\\b${matchAlias[1]}\\.`, "g"), ""));
    applyProps(node as unknown as Record<string, unknown>, props);
    return { rows: 1 };
  }
  const relate = cypher.match(
    /^MATCH \(a \{id: '([^']+)'\}\), \(b \{id: '([^']+)'\}\) MERGE \(a\)-\[r:(\w+)\]->\(b\) SET ([\s\S]+)$/,
  );
  if (relate) {
    ensureNode(graph, relate[1]);
    ensureNode(graph, relate[2]);
    const props = parseProps(relate[4].replace(/\br\./g, ""));
    const now = Number(props.t_tx_created ?? graph.incident);
    const edge = makeEdge(relate[1], relate[2], relate[3], Number.isFinite(now) ? now : graph.incident, {
      t_valid_from: typeof props.t_valid_from === "number" ? props.t_valid_from : graph.baseline,
      t_valid_to: typeof props.t_valid_to === "number" ? props.t_valid_to : FAR_FUTURE,
      t_tx_created: typeof props.t_tx_created === "number" ? props.t_tx_created : graph.incident,
      t_tx_superseded: typeof props.t_tx_superseded === "number" ? props.t_tx_superseded : FAR_FUTURE,
      p99_latency_ms: typeof props.p99_latency_ms === "number" ? props.p99_latency_ms : null,
      pheromone_weight: typeof props.weight === "number" ? props.weight : null,
      success_count: typeof props.success_count === "number" ? props.success_count : null,
      dark_penalty: typeof props.penalty === "number" ? props.penalty : null,
      is_fallback: props.is_fallback === true,
      failure_reason: typeof props.failure_reason === "string" ? props.failure_reason : null,
      verified_by: typeof props.verified_by === "string" ? props.verified_by : null,
    });
    const existing = graph.edges.find((item) => item.source === edge.source && item.target === edge.target && item.type === edge.type);
    if (existing) Object.assign(existing, edge, { id: existing.id });
    else graph.edges.push(edge);
    return { rows: 1 };
  }
  const close = cypher.match(
    /^MATCH \(a \{id: '([^']+)'\}\)-\[r:(\w+)\]->\(b \{id: '([^']+)'\}\) WHERE r\.t_tx_created = (-?\d+) SET ([\s\S]+)$/,
  );
  if (close) {
    const tx = Number(close[4]);
    const edge = graph.edges.find(
      (item) => item.source === close[1] && item.target === close[3] && item.type === close[2] && item.t_tx_created === tx,
    );
    if (edge) {
      const props = parseProps(close[5].replace(/\br\./g, ""));
      if (typeof props.t_valid_to === "number") edge.t_valid_to = props.t_valid_to;
      if (typeof props.t_tx_superseded === "number") edge.t_tx_superseded = props.t_tx_superseded;
    }
    return { rows: edge ? 1 : 0 };
  }
  throw new Error("In-memory engine accepts MERGE node SET, MATCH node SET, MERGE relationship SET, and supersede WHERE t_tx_created.");
}

export function applyStatements(graph: GraphData, statements: string[]): GraphData {
  const next: GraphData = {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
  for (const statement of statements) {
    if (statement.trim()) applyStatement(next, statement);
  }
  for (const edge of next.edges) edge.id = edgeIdentity(edge);
  return next;
}

export function nodeSetCypher(node: GraphNode): string {
  const props = [
    `n.name = '${escapeCypher(node.name)}'`,
    node.tier !== null ? `n.tier = ${node.tier}` : "",
    node.current_load !== null ? `n.current_load = ${node.current_load}` : "",
    node.max_capacity !== null ? `n.max_capacity = ${node.max_capacity}` : "",
    node.pii_classified !== null ? `n.pii_classified = ${node.pii_classified}` : "",
    node.oncall_available !== null ? `n.oncall_available = ${node.oncall_available}` : "",
    node.execution_cost !== null ? `n.execution_cost = ${node.execution_cost}` : "",
    node.exposure ? `n.exposure = '${escapeCypher(node.exposure)}'` : "",
    node.action_type ? `n.action_type = '${escapeCypher(node.action_type)}'` : "",
  ].filter(Boolean);
  return `MATCH (n {id: '${escapeCypher(node.id)}'}) SET ${props.join(", ")}`;
}

export function nodeKinds(): string[] {
  return KINDS;
}

export function touchEdge(edge: GraphEdge, patch: Partial<GraphEdge>): GraphEdge {
  return { ...edge, ...patch, id: edgeIdentity({ ...edge, ...patch }) };
}

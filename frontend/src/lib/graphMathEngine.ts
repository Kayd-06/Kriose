import {
  FAR_FUTURE,
  type ChaosBudget,
  type GhostEdge,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type RicciEdge,
  type ShieldReport,
  type ShieldResult,
  type UcbRow,
  edgeActive,
  edgeIdentity,
} from "@/types/graph";

export const PUCT = 1.414;
export const HIVE_PENALTY = 0.4;
export const DARK_EXPAND_BLOCK = 0.9;
export const PAGE_RANK_DAMPING = 0.85;
export const PAGE_RANK_ITERS = 25;

const ORG_KINDS = new Set(["Engineer", "Team", "DecisionDoc"]);

export function cloneGraph(graph: GraphData): GraphData {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

export function nodeMap(graph: GraphData): Map<string, GraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function dependsEdges(graph: GraphData, at: number): GraphEdge[] {
  const nodes = nodeMap(graph);
  return graph.edges.filter((edge) => {
    if (edge.type !== "DEPENDS_ON" || !edgeActive(edge, at)) return false;
    return nodes.get(edge.source)?.kind === "Service" && nodes.get(edge.target)?.kind === "Service";
  });
}

function undirectedServices(graph: GraphData, at: number): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();
  const touch = (id: string) => {
    if (!neighbors.has(id)) neighbors.set(id, new Set());
    return neighbors.get(id)!;
  };
  for (const edge of dependsEdges(graph, at)) {
    touch(edge.source).add(edge.target);
    touch(edge.target).add(edge.source);
  }
  return neighbors;
}

function regime(kappa: number): RicciEdge["regime"] {
  if (kappa < -0.5) return "HYPERBOLIC";
  if (kappa < 0) return "FRAGILE";
  return "RESILIENT";
}

export function computeOllivierRicciCurvature(graph: GraphData, at: number): RicciEdge[] {
  const neighbors = undirectedServices(graph, at);
  const scored: RicciEdge[] = [];
  for (const edge of dependsEdges(graph, at)) {
    const left = neighbors.get(edge.source) ?? new Set<string>();
    const right = neighbors.get(edge.target) ?? new Set<string>();
    let shared = 0;
    for (const id of left) if (right.has(id)) shared += 1;
    const degreeSource = left.size;
    const degreeTarget = right.size;
    const kappa =
      degreeSource <= 1 || degreeTarget <= 1
        ? -0.25
        : shared / degreeSource + shared / degreeTarget - 1;
    scored.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kappa,
      shared,
      degreeSource,
      degreeTarget,
      regime: regime(kappa),
    });
  }
  scored.sort((a, b) => a.kappa - b.kappa);
  return scored;
}

export function minKappa(rows: RicciEdge[]): number | null {
  if (!rows.length) return null;
  return rows.reduce((min, row) => Math.min(min, row.kappa), rows[0].kappa);
}

export type ClosureCandidate = {
  bottleneckSource: string;
  bottleneckTarget: string;
  from: string;
  to: string;
  kappaBefore: number;
  kappaAfter: number;
};

export function triadicClosureCandidate(graph: GraphData, at: number): ClosureCandidate | null {
  const rows = computeOllivierRicciCurvature(graph, at);
  if (!rows.length) return null;
  const worst = rows[0];
  const neighbors = undirectedServices(graph, at);
  const left = neighbors.get(worst.source) ?? new Set<string>();
  const right = neighbors.get(worst.target) ?? new Set<string>();
  let best: ClosureCandidate | null = null;
  const consider = (from: string, to: string) => {
    if (from === to) return;
    const already =
      (neighbors.get(from)?.has(to) ?? false) ||
      graph.edges.some(
        (edge) =>
          edge.type === "DEPENDS_ON" &&
          edgeActive(edge, at) &&
          ((edge.source === from && edge.target === to) || (edge.source === to && edge.target === from)),
      );
    if (already) return;
    const trial = cloneGraph(graph);
    const now = graph.incident || at;
    trial.edges.push({
      id: `trial|${from}|${to}`,
      source: from,
      target: to,
      type: "DEPENDS_ON",
      ricci_curvature: null,
      p99_latency_ms: 40,
      pheromone_weight: null,
      success_count: null,
      last_updated: null,
      dark_penalty: null,
      risk_score: null,
      is_fallback: true,
      owner_a: null,
      owner_b: null,
      verified_by: null,
      failure_reason: null,
      t_valid_from: now,
      t_valid_to: FAR_FUTURE,
      t_tx_created: now,
      t_tx_superseded: FAR_FUTURE,
      ttl_epoch: null,
    });
    const next = computeOllivierRicciCurvature(trial, at).find(
      (row) => row.source === worst.source && row.target === worst.target,
    );
    if (!next) return;
    const gain = next.kappa - worst.kappa;
    if (!best || gain > best.kappaAfter - best.kappaBefore) {
      best = {
        bottleneckSource: worst.source,
        bottleneckTarget: worst.target,
        from,
        to,
        kappaBefore: worst.kappa,
        kappaAfter: next.kappa,
      };
    }
  };
  for (const id of left) if (!right.has(id) && id !== worst.target) consider(id, worst.target);
  for (const id of right) if (!left.has(id) && id !== worst.source) consider(worst.source, id);
  for (const node of graph.nodes) {
    if (node.kind !== "Service") continue;
    if (node.id !== worst.source && node.id !== worst.target && !left.has(node.id) && !right.has(node.id)) {
      consider(worst.source, node.id);
    }
  }
  return best;
}

export function computePageRank(graph: GraphData, at: number): Map<string, number> {
  const ids = graph.nodes.map((node) => node.id);
  const rank = new Map<string, number>();
  if (!ids.length) return rank;
  const outgoing = new Map<string, string[]>();
  for (const id of ids) outgoing.set(id, []);
  for (const edge of graph.edges) {
    if (!edgeActive(edge, at)) continue;
    if (!outgoing.has(edge.source) || !rankHas(outgoing, edge.target)) continue;
    outgoing.get(edge.source)!.push(edge.target);
  }
  const seed = 1 / ids.length;
  for (const id of ids) rank.set(id, seed);
  for (let iteration = 0; iteration < PAGE_RANK_ITERS; iteration += 1) {
    const next = new Map<string, number>();
    for (const id of ids) next.set(id, (1 - PAGE_RANK_DAMPING) / ids.length);
    let dangling = 0;
    for (const id of ids) {
      const outs = outgoing.get(id) ?? [];
      const score = rank.get(id) ?? 0;
      if (!outs.length) dangling += score;
      else {
        const share = (PAGE_RANK_DAMPING * score) / outs.length;
        for (const target of outs) next.set(target, (next.get(target) ?? 0) + share);
      }
    }
    const share = (PAGE_RANK_DAMPING * dangling) / ids.length;
    for (const id of ids) next.set(id, (next.get(id) ?? 0) + share);
    for (const id of ids) rank.set(id, next.get(id) ?? 0);
  }
  return rank;
}

function rankHas(outgoing: Map<string, string[]>, id: string): boolean {
  return outgoing.has(id);
}

export function detectConwayGhostEdges(graph: GraphData, at: number): GhostEdge[] {
  const nodes = nodeMap(graph);
  const owners = new Map<string, GraphNode[]>();
  for (const edge of graph.edges) {
    if (edge.type !== "OWNS" || !edgeActive(edge, at)) continue;
    const owner = nodes.get(edge.source);
    const service = nodes.get(edge.target);
    if (!owner || !service || service.kind !== "Service") continue;
    const list = owners.get(service.id) ?? [];
    list.push(owner);
    owners.set(service.id, list);
  }
  const talked = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type !== "COMMUNICATED_WITH" || !edgeActive(edge, at)) continue;
    talked.add(`${edge.source}|${edge.target}`);
    talked.add(`${edge.target}|${edge.source}`);
  }
  const silent = (a: string, b: string) => a !== b && !talked.has(`${a}|${b}`);
  const found: GhostEdge[] = [];
  const seen = new Set<string>();
  const push = (source: string, target: string, hop: number) => {
    const left = owners.get(source) ?? [];
    const right = owners.get(target) ?? [];
    for (const ownerA of left) {
      for (const ownerB of right) {
        if (!silent(ownerA.id, ownerB.id)) continue;
        const key = `${source}|${target}|${ownerA.id}|${ownerB.id}|${hop}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({
          source,
          target,
          hop,
          ownerA: ownerA.name || ownerA.id,
          ownerB: ownerB.name || ownerB.id,
        });
      }
    }
  };
  const directed = dependsEdges(graph, at);
  for (const edge of directed) push(edge.source, edge.target, 1);
  const out = new Map<string, string[]>();
  for (const edge of directed) {
    const list = out.get(edge.source) ?? [];
    list.push(edge.target);
    out.set(edge.source, list);
  }
  for (const edge of directed) {
    for (const next of out.get(edge.target) ?? []) {
      if (next !== edge.source) push(edge.source, next, 2);
    }
  }
  return found;
}

function degreeBucket(degree: number): string {
  if (degree <= 1) return "d1";
  if (degree <= 3) return "d2to3";
  return "d4plus";
}

function kappaBucket(kappa: number | null): string {
  if (kappa === null) return "kna";
  if (kappa < -0.5) return "khyper";
  if (kappa < 0) return "kfrag";
  return "kres";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeWeisfeilerLehmanHash(
  graph: GraphData,
  rootNodeId: string,
  hops: number,
  actionType = "",
): Promise<{ hash: string; canonical: string; labels: string[] }> {
  const at = graph.incident || graph.atTime;
  const neighbors = undirectedServices(graph, at);
  const rows = computeOllivierRicciCurvature(graph, at);
  const worst = new Map<string, number>();
  for (const row of rows) {
    worst.set(row.source, Math.min(worst.get(row.source) ?? row.kappa, row.kappa));
    worst.set(row.target, Math.min(worst.get(row.target) ?? row.kappa, row.kappa));
  }
  const tiers = nodeMap(graph);
  const seen = new Set<string>([rootNodeId]);
  let frontier = new Set<string>([rootNodeId]);
  for (let hop = 0; hop < hops; hop += 1) {
    const next = new Set<string>();
    for (const id of frontier) for (const other of neighbors.get(id) ?? []) next.add(other);
    for (const id of next) if (!seen.has(id)) frontier.add(id);
    for (const id of next) seen.add(id);
    frontier = next;
  }
  const initial = new Map<string, string>();
  for (const id of [...seen].sort()) {
    const degree = neighbors.get(id)?.size ?? 0;
    const tier = tiers.get(id)?.tier ?? 0;
    initial.set(id, `Service|t${tier}|${degreeBucket(degree)}|${kappaBucket(worst.get(id) ?? null)}`);
  }
  let labels = initial;
  for (let round = 0; round < 2; round += 1) {
    const next = new Map<string, string>();
    for (const [id, label] of labels) {
      const around = [...(neighbors.get(id) ?? [])]
        .filter((other) => labels.has(other))
        .map((other) => labels.get(other)!)
        .sort()
        .join(",");
      const digest = await sha256Hex(`${label}|${around}`);
      next.set(id, digest.slice(0, 12));
    }
    labels = next;
  }
  const canonical = [...labels.values()].sort().join("|");
  const material = actionType ? `${canonical}|${actionType}` : canonical;
  const hash = (await sha256Hex(material)).slice(0, 16);
  return { hash, canonical, labels: [...initial.values()].sort() };
}

export function pheromoneOf(graph: GraphData, alertId: string, actionId: string): GraphEdge | null {
  return (
    graph.edges.find((edge) => edge.type === "PHEROMONE_TRACE" && edge.source === alertId && edge.target === actionId) ??
    null
  );
}

export function deadEndOf(graph: GraphData, actionId: string, at: number): GraphEdge | null {
  const hits = graph.edges.filter((edge) => edge.type === "DEAD_END" && edge.target === actionId);
  const live = hits.filter((edge) => edge.ttl_epoch === null || edge.ttl_epoch > at);
  if (!live.length) return null;
  return live.sort((a, b) => (b.dark_penalty ?? 0) - (a.dark_penalty ?? 0))[0];
}

export async function computeUCBGraphScores(
  graph: GraphData,
  alertNodeId: string,
  hiveHashes: Set<string>,
): Promise<UcbRow[]> {
  const at = graph.incident || graph.atTime;
  const alert = graph.nodes.find((node) => node.id === alertNodeId && node.kind === "Alert");
  const focus = alert ? triggerTarget(graph, alert.id) : null;
  const actions = graph.nodes.filter((node) => node.kind === "RunbookAction");
  const visits = actions.map((action) => pheromoneOf(graph, alertNodeId, action.id)?.success_count ?? 1);
  const total = visits.reduce((sum, value) => sum + value, 0) || 1;
  const rows: UcbRow[] = [];
  for (const action of actions) {
    const pher = pheromoneOf(graph, alertNodeId, action.id);
    const dead = deadEndOf(graph, action.id, at);
    const pheromone = pher?.pheromone_weight ?? 0.45;
    const count = pher?.success_count ?? 1;
    const updated = pher?.last_updated ?? at;
    const elapsed = Math.max(0, at - updated);
    const decay = Math.exp(-0.05 * (elapsed / 86400));
    const dark = dead?.dark_penalty ?? 0;
    const actionType = action.action_type || action.id;
    const motif = focus ? await computeWeisfeilerLehmanHash(graph, focus, 2, actionType) : { hash: "", canonical: "", labels: [] };
    const hive = motif.hash && hiveHashes.has(motif.hash) ? HIVE_PENALTY : 0;
    const cost = action.execution_cost ?? 1;
    const exploration = PUCT * (pheromone * decay) * Math.sqrt(total) / (1 + count);
    const ucb = pheromone + exploration - dark - hive - 0.15 * cost;
    const pruned = ucb <= 0 || dark >= DARK_EXPAND_BLOCK;
    rows.push({
      actionId: action.id,
      actionName: action.name || action.id,
      actionType,
      pheromone,
      visits: count,
      dark,
      hive,
      cost,
      ucb,
      hash: motif.hash,
      pruned,
      reason: dead?.failure_reason ?? null,
    });
  }
  rows.sort((a, b) => b.ucb - a.ucb);
  return rows;
}

export function triggerTarget(graph: GraphData, alertId: string): string | null {
  const edge = graph.edges.find((item) => item.type === "TRIGGERED_ON" && item.source === alertId);
  return edge?.target ?? null;
}

export function alertsIn(graph: GraphData): GraphNode[] {
  return graph.nodes.filter((node) => node.kind === "Alert");
}

export function evaluateShields(
  graph: GraphData,
  at: number,
  baselineMin: number,
  structural: boolean,
  notifiesOwners: boolean,
): ShieldReport {
  const nodes = nodeMap(graph);
  const spof = graph.nodes.filter(
    (node) => node.kind === "Service" && node.tier === 1 && node.current_load !== null && node.max_capacity !== null && node.current_load > node.max_capacity,
  );
  const ricci = computeOllivierRicciCurvature(graph, at).filter((row) => {
    return nodes.get(row.source)?.tier === 1 && nodes.get(row.target)?.tier === 1;
  });
  const newMin = ricci.length ? Math.min(...ricci.map((row) => row.kappa)) : 0;
  const ricciHit = newMin < -0.65 && newMin < baselineMin - 1e-9;
  const pii = piiPaths(graph, at);
  const ghosts = detectConwayGhostEdges(graph, at);
  const conwayHit = structural && !notifiesOwners && ghosts.length > 0;
  const shields: ShieldResult[] = [
    {
      id: "INV-SPOF",
      violations: spof.length,
      offenders: spof.map((node) => node.id),
      detail: "tier-1 load above capacity",
    },
    {
      id: "INV-RICCI",
      violations: ricciHit ? 1 : 0,
      offenders: ricciHit ? [`min ${newMin.toFixed(3)}`] : [],
      detail: `tier-1 min κ ${newMin.toFixed(3)} baseline ${baselineMin.toFixed(3)}`,
    },
    {
      id: "INV-PII-AUTH",
      violations: pii.length,
      offenders: pii,
      detail: "public ingress reaches a pii service with no AuthMiddleware",
    },
    {
      id: "INV-CONWAY-QUORUM",
      violations: conwayHit ? 1 : 0,
      offenders: conwayHit ? ghosts.slice(0, 4).map((ghost) => `${ghost.source}->${ghost.target}`) : [],
      detail: "structural edit on a ghost requires owner notification",
    },
  ];
  const passed = shields.filter((shield) => shield.violations === 0).length;
  return { shields, passed, blocked: passed !== shields.length };
}

function piiPaths(graph: GraphData, at: number): string[] {
  const nodes = nodeMap(graph);
  const auth = new Set(graph.nodes.filter((node) => node.kind === "AuthMiddleware").map((node) => node.id));
  const next = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type !== "DEPENDS_ON" || !edgeActive(edge, at)) continue;
    const list = next.get(edge.source) ?? [];
    list.push(edge.target);
    next.set(edge.source, list);
  }
  const hits: string[] = [];
  const ingresses = graph.nodes.filter((node) => node.kind === "Ingress" && node.exposure === "public");
  for (const ingress of ingresses) {
    const stack: { id: string; depth: number; auth: boolean; trail: string[] }[] = [
      { id: ingress.id, depth: 0, auth: false, trail: [ingress.id] },
    ];
    let guard = 0;
    while (stack.length && guard < 400) {
      guard += 1;
      const current = stack.pop()!;
      const node = nodes.get(current.id);
      if (node?.kind === "Service" && node.pii_classified && !current.auth && current.depth > 0) {
        hits.push(current.trail.join(">"));
      }
      if (current.depth >= 6) continue;
      for (const target of next.get(current.id) ?? []) {
        if (current.trail.includes(target)) continue;
        stack.push({
          id: target,
          depth: current.depth + 1,
          auth: current.auth || auth.has(target),
          trail: [...current.trail, target],
        });
      }
    }
  }
  return hits;
}

export function oncallCovered(graph: GraphData, focusId: string): boolean {
  const nodes = nodeMap(graph);
  const owners = graph.edges
    .filter((edge) => edge.type === "OWNS" && edge.target === focusId)
    .map((edge) => nodes.get(edge.source))
    .filter((node): node is GraphNode => Boolean(node));
  if (owners.some((owner) => owner.oncall_available === true)) return true;
  const fallbackTargets = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type === "HAS_FALLBACK" || edge.is_fallback) fallbackTargets.add(edge.target);
  }
  for (const target of fallbackTargets) {
    const covered = graph.edges.some((edge) => {
      if (edge.type !== "OWNS" || edge.target !== target) return false;
      return nodes.get(edge.source)?.oncall_available === true;
    });
    if (covered) return true;
  }
  return false;
}

export function applyAction(graph: GraphData, action: UcbRow, focusId: string | null): { graph: GraphData; cypher: string[] } {
  const next = cloneGraph(graph);
  const cypher: string[] = [];
  const now = graph.incident || Math.floor(Date.now() / 1000);
  if (!focusId) return { graph: next, cypher };
  if (action.actionType === "THROTTLE") {
    const upstream = next.edges
      .filter((edge) => edge.type === "DEPENDS_ON" && edge.target === focusId)
      .map((edge) => next.nodes.find((node) => node.id === edge.source))
      .filter((node): node is GraphNode => Boolean(node && node.current_load !== null))
      .sort((a, b) => (b.current_load ?? 0) - (a.current_load ?? 0))[0];
    if (upstream && upstream.current_load !== null) {
      upstream.current_load = upstream.current_load * 0.7;
      cypher.push(`MATCH (s {id: '${escapeCypher(upstream.id)}'}) SET s.current_load = s.current_load * 0.7`);
    }
    return { graph: next, cypher };
  }
  if (action.actionType === "RESTART") {
    cypher.push(`MATCH (s {id: '${escapeCypher(focusId)}'}) SET s.current_load = s.current_load`);
    return { graph: next, cypher };
  }
  if (action.actionType === "REROUTE_AND_HEAL") {
    const closure = triadicClosureCandidate(next, now);
    const focus = next.nodes.find((node) => node.id === focusId);
    if (focus && focus.max_capacity) focus.current_load = focus.max_capacity * 0.3;
    if (closure) {
      const spare = next.nodes.find((node) => node.id === closure.to || node.id === closure.from);
      if (spare && spare.id !== focusId && spare.max_capacity) spare.current_load = spare.max_capacity * 0.5;
      next.edges.push(makeEdge(closure.from, closure.to, "DEPENDS_ON", now, { is_fallback: true, p99_latency_ms: 40 }));
      cypher.push(
        `MATCH (a {id: '${escapeCypher(focusId)}'}) SET a.current_load = coalesce(a.max_capacity, 100) * 0.3`,
        `MATCH (a {id: '${escapeCypher(closure.from)}'}), (b {id: '${escapeCypher(closure.to)}'}) MERGE (a)-[r:DEPENDS_ON]->(b) SET r.is_fallback = true, r.p99_latency_ms = 40, r.t_valid_from = ${now}, r.t_valid_to = ${FAR_FUTURE}, r.t_tx_created = ${now}, r.t_tx_superseded = ${FAR_FUTURE}`,
      );
    }
  }
  return { graph: next, cypher };
}

export function applyShock(graph: GraphData, focusId: string | null, chaos: ChaosBudget): GraphData {
  const next = cloneGraph(graph);
  if (!focusId) return next;
  const focus = next.nodes.find((node) => node.id === focusId);
  if (focus && focus.current_load !== null) focus.current_load = focus.current_load * chaos.loadFactor;
  for (const edge of next.edges) {
    if (edge.type === "DEPENDS_ON" && edge.p99_latency_ms !== null && edge.p99_latency_ms > 100) {
      edge.p99_latency_ms += chaos.latencyMs;
    }
  }
  if (chaos.outage > 0) {
    for (const edge of next.edges) {
      if (edge.type !== "OWNS" || edge.target !== focusId) continue;
      const owner = next.nodes.find((node) => node.id === edge.source);
      if (owner) owner.oncall_available = false;
    }
  }
  return next;
}

export type BranchPreview = {
  action: UcbRow;
  depth1: GraphData;
  depth2: GraphData;
  survival: number;
  shields: ShieldReport;
  kappaBefore: number | null;
  kappaAfter: number | null;
  cypher: string[];
  loads: { id: string; before: number | null; depth1: number | null; depth2: number | null }[];
};

export function previewBranches(
  graph: GraphData,
  scores: UcbRow[],
  focusId: string | null,
  chaos: ChaosBudget,
): BranchPreview[] {
  const at = graph.incident || graph.atTime;
  const baseline = minKappa(computeOllivierRicciCurvature(graph, at).filter((row) => tier1(graph, row))) ?? 0;
  const beforeLoads = new Map(graph.nodes.map((node) => [node.id, node.current_load]));
  return scores.map((action) => {
    if (action.pruned || action.dark >= DARK_EXPAND_BLOCK) {
      const empty = evaluateShields(graph, at, baseline, false, false);
      return {
        action,
        depth1: graph,
        depth2: graph,
        survival: 0,
        shields: empty,
        kappaBefore: null,
        kappaAfter: null,
        cypher: [],
        loads: [],
      };
    }
    const mutated = applyAction(graph, action, focusId);
    const shocked = applyShock(mutated.graph, focusId, chaos);
    const structural = action.actionType === "REROUTE_AND_HEAL";
    const shields = evaluateShields(shocked, at, baseline, structural, structural);
    const covered = oncallCovered(shocked, focusId || "");
    const survival = shields.blocked ? 0 : covered ? 1 : 0.75;
    const before = focusId
      ? computeOllivierRicciCurvature(graph, at).find((row) => row.target === focusId)?.kappa ?? minKappa(computeOllivierRicciCurvature(graph, at))
      : null;
    const after = focusId
      ? computeOllivierRicciCurvature(mutated.graph, at).find((row) => row.target === focusId)?.kappa ??
        minKappa(computeOllivierRicciCurvature(mutated.graph, at))
      : null;
    const loads = graph.nodes
      .filter((node) => node.kind === "Service")
      .map((node) => ({
        id: node.id,
        before: beforeLoads.get(node.id) ?? null,
        depth1: mutated.graph.nodes.find((item) => item.id === node.id)?.current_load ?? null,
        depth2: shocked.nodes.find((item) => item.id === node.id)?.current_load ?? null,
      }))
      .filter((row) => row.before !== row.depth1 || row.depth1 !== row.depth2)
      .slice(0, 6);
    return {
      action,
      depth1: mutated.graph,
      depth2: shocked,
      survival,
      shields,
      kappaBefore: before,
      kappaAfter: after,
      cypher: mutated.cypher,
      loads,
    };
  });
}

function tier1(graph: GraphData, row: RicciEdge): boolean {
  const nodes = nodeMap(graph);
  return nodes.get(row.source)?.tier === 1 && nodes.get(row.target)?.tier === 1;
}

export function blastRadius(graph: GraphData, rootId: string, at: number, hops = 4): Set<string> {
  const adjacent = new Map<string, Set<string>>();
  const add = (source: string, target: string) => {
    if (!adjacent.has(source)) adjacent.set(source, new Set());
    adjacent.get(source)!.add(target);
  };
  for (const edge of graph.edges) {
    if (edge.type !== "DEPENDS_ON" || !edgeActive(edge, at)) continue;
    add(edge.source, edge.target);
    add(edge.target, edge.source);
  }
  const seen = new Set<string>([rootId]);
  let frontier = new Set<string>([rootId]);
  for (let hop = 0; hop < hops; hop += 1) {
    const next = new Set<string>();
    for (const id of frontier) for (const other of adjacent.get(id) ?? []) if (!seen.has(other)) next.add(other);
    for (const id of next) seen.add(id);
    frontier = next;
  }
  return seen;
}

export type DriftRow = {
  source: string;
  target: string;
  type: string;
  cls: "ADDED" | "INVALIDATED" | "LATE_DRIFT";
};

export function causalDrift(graph: GraphData, t1: number, t2: number): DriftRow[] {
  const [from, to] = t1 <= t2 ? [t1, t2] : [t2, t1];
  const rows: DriftRow[] = [];
  for (const edge of graph.edges) {
    const validFrom = edge.t_valid_from;
    const validTo = edge.t_valid_to;
    const recorded = edge.t_tx_created;
    const aliveAt = (t: number) => edgeActive(edge, t);
    if (validTo !== null && validTo > from && validTo <= to) {
      rows.push({ source: edge.source, target: edge.target, type: edge.type, cls: "INVALIDATED" });
      continue;
    }
    if (recorded !== null && validFrom !== null && recorded > validFrom + 3600 && recorded > from && recorded <= to) {
      rows.push({ source: edge.source, target: edge.target, type: edge.type, cls: "LATE_DRIFT" });
      continue;
    }
    if (!aliveAt(from) && aliveAt(to)) {
      rows.push({ source: edge.source, target: edge.target, type: edge.type, cls: "ADDED" });
    }
  }
  return rows;
}

export function eventStamps(graph: GraphData): number[] {
  const stamps = new Set<number>();
  if (graph.baseline) stamps.add(graph.baseline);
  if (graph.incident) stamps.add(graph.incident);
  for (const edge of graph.edges) {
    for (const value of [edge.t_valid_from, edge.t_valid_to, edge.t_tx_created]) {
      if (value !== null && value > 0 && value < FAR_FUTURE) stamps.add(value);
    }
  }
  return [...stamps].sort((a, b) => a - b);
}

export function filterGraph(graph: GraphData, at: number): GraphData {
  return { ...graph, atTime: at, edges: graph.edges.filter((edge) => edgeActive(edge, at)) };
}

export function makeEdge(
  source: string,
  target: string,
  type: string,
  now: number,
  extra: Partial<GraphEdge> = {},
): GraphEdge {
  const edge: GraphEdge = {
    id: "",
    source,
    target,
    type,
    ricci_curvature: null,
    p99_latency_ms: null,
    pheromone_weight: null,
    success_count: null,
    last_updated: null,
    dark_penalty: null,
    risk_score: null,
    is_fallback: null,
    owner_a: null,
    owner_b: null,
    verified_by: null,
    failure_reason: null,
    t_valid_from: now,
    t_valid_to: FAR_FUTURE,
    t_tx_created: now,
    t_tx_superseded: FAR_FUTURE,
    ttl_epoch: null,
    ...extra,
  };
  edge.id = edgeIdentity(edge);
  return edge;
}

export function escapeCypher(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function isOrgKind(kind: string): boolean {
  return ORG_KINDS.has(kind);
}

export function kappaRegime(kappa: number | null): string {
  if (kappa === null) return "NO EDGES";
  if (kappa < -0.5) return "HYPERBOLIC";
  if (kappa <= 0) return "EUCLIDEAN";
  return "SPHERICAL";
}

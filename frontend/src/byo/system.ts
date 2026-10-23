// Bring your own system: parse + validate a YAML/JSON description of services,
// turn it into a graph snapshot, and (in demo mode, with no backend) simulate
// the swarm run in the browser. Mirrors backend/byo.py; the live API version
// runs the real swarm on FalkorDB.
import { parse } from "yaml";
import type { SwarmEvent } from "@/types/graph";

export type Service = { id: string; name: string; tier: number; load: number; capacity: number; pii: boolean; public: boolean; owner: string | null; standby_for: string | null };
export type Action = { id: string; type: "RESTART" | "THROTTLE" | "REROUTE_AND_HEAL"; name: string; cost: number; successes: number; broke_before: string | null };
export type System = {
  name: string;
  tenant: string;
  alert: { id: string; title: string; service: string };
  hot: string;
  caller: string;
  standby: string | null;
  services: Service[];
  dependencies: { from: string; to: string; p99_ms: number }[];
  owners: { id: string; name: string; slack: string; role: string }[];
  actions: Action[];
};

export class SpecError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("; "));
  }
}

const ALIASES: Record<string, Action["type"]> = { restart: "RESTART", throttle: "THROTTLE", reroute: "REROUTE_AND_HEAL", failover: "REROUTE_AND_HEAL", reroute_and_heal: "REROUTE_AND_HEAL" };
const DEFAULT_NAMES: Record<Action["type"], string> = { RESTART: "Restart {hot}", THROTTLE: "Throttle traffic into {hot} by 30%", REROUTE_AND_HEAL: "Move {hot} traffic to {standby}" };

export const slug = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseText(text: string): unknown {
  try {
    return parse(text);
  } catch (err) {
    const line = (err as { linePos?: { line: number }[] }).linePos?.[0]?.line;
    throw new SpecError([`That isn't valid YAML or JSON${line ? ` (line ${line})` : ""}.`]);
  }
}

export function spansToSpec(spans: Raw[]): { services: Raw[]; dependencies: Raw[] } {
  const services = new Map<string, Raw>();
  const dependencies: Raw[] = [];
  for (const span of spans) {
    if (!isObj(span) || !span.service) continue;
    const id = slug(span.service);
    const svc = services.get(id) ?? { id, name: String(span.service), tier: 1, capacity: 100 };
    services.set(id, svc);
    if (span.current_load != null) svc.load = span.current_load;
    if (span.upstream) {
      const up = slug(span.upstream);
      if (!services.has(up)) services.set(up, { id: up, name: String(span.upstream), tier: 1, capacity: 100 });
      dependencies.push({ from: up, to: id, p99_ms: span.p99_latency_ms ?? 50 });
    }
  }
  for (const svc of services.values()) if (svc.load == null) svc.load = 50;
  return { services: [...services.values()], dependencies };
}

export function normalize(input: unknown): System {
  let raw = input;
  if (Array.isArray(raw)) raw = { spans: raw };
  if (!isObj(raw)) throw new SpecError(["The file should be a YAML/JSON object with services, dependencies, owners, runbook and alert."]);
  const errors: string[] = [];
  const spec: Raw = { ...raw };
  if (spec.spans) {
    if (!Array.isArray(spec.spans)) throw new SpecError(["spans should be a list of spans like backend/fixtures/otel/spans.json."]);
    const derived = spansToSpec(spec.spans as Raw[]);
    const given = Array.isArray(spec.services) ? (spec.services as Raw[]) : [];
    const known = new Set(given.filter(isObj).map((s) => slug(s.id ?? s.name)));
    spec.services = [...given, ...derived.services.filter((s) => !known.has(String(s.id)))];
    spec.dependencies = [...(Array.isArray(spec.dependencies) ? spec.dependencies : []), ...derived.dependencies];
  }
  const num = (value: unknown, where: string, fallback?: number): number => {
    if (value == null) {
      if (fallback === undefined) errors.push(`${where} is missing.`);
      return fallback ?? 0;
    }
    const n = Number(value);
    if (Number.isNaN(n)) {
      errors.push(`${where} should be a number, got ${JSON.stringify(value)}.`);
      return fallback ?? 0;
    }
    return n;
  };
  const name = String(spec.name || "my-system");
  const tenant = `byo_${slug(name).slice(0, 40)}`;

  const services = new Map<string, Service>();
  const rawServices = Array.isArray(spec.services) ? spec.services : [];
  if (!rawServices.length) errors.push("Add at least one service under `services:` (or paste OTel spans under `spans:`).");
  rawServices.forEach((item, i) => {
    if (!isObj(item)) return void errors.push(`services[${i}] should be an object with id, load and capacity.`);
    const id = slug(item.id ?? item.name);
    if (id === "x") return void errors.push(`services[${i}] needs an \`id\`.`);
    const where = `Service \`${id}\``;
    if (services.has(id)) return void errors.push(`${where} is listed twice.`);
    const load = num(item.load, `${where}: load`);
    const capacity = num(item.capacity, `${where}: capacity`, 100);
    if (capacity <= 0) errors.push(`${where}: capacity must be above 0.`);
    services.set(id, {
      id,
      name: String(item.name ?? item.id),
      tier: Math.trunc(num(item.tier, `${where}: tier`, 1)),
      load,
      capacity,
      pii: Boolean(item.pii),
      public: Boolean(item.public),
      owner: item.owner ? slug(item.owner) : null,
      standby_for: item.standby_for ? slug(item.standby_for) : null,
    });
  });

  const dependencies: System["dependencies"] = [];
  (Array.isArray(spec.dependencies) ? spec.dependencies : []).forEach((item, i) => {
    if (!isObj(item)) return void errors.push(`dependencies[${i}] should look like \`{from: web, to: cart}\`.`);
    const from = slug(item.from);
    const to = slug(item.to);
    for (const end of [from, to]) if (!services.has(end)) errors.push(`Dependency ${item.from} → ${item.to}: there is no service called \`${end}\`.`);
    if (from === to) errors.push(`Dependency ${from} → ${to} points at itself.`);
    dependencies.push({ from, to, p99_ms: num(item.p99_ms, `Dependency ${from} → ${to}: p99_ms`, 50) });
  });

  const owners = new Map<string, System["owners"][number]>();
  (Array.isArray(spec.owners) ? spec.owners : []).forEach((item, i) => {
    if (!isObj(item) || !(item.id || item.name)) return void errors.push(`owners[${i}] needs an \`id\` and a \`name\`.`);
    const id = slug(item.id ?? item.name);
    owners.set(id, { id, name: String(item.name ?? id), slack: String(item.slack ?? `@${id}`), role: String(item.role ?? "Engineer") });
  });
  for (const svc of services.values()) {
    if (svc.owner && !owners.has(svc.owner)) owners.set(svc.owner, { id: svc.owner, name: svc.owner.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), slack: `@${svc.owner}`, role: "Engineer" });
    if (svc.standby_for && !services.has(svc.standby_for)) errors.push(`Service \`${svc.id}\` is a standby for \`${svc.standby_for}\`, which isn't in services.`);
  }

  const alert = spec.alert;
  let hot: string | null = null;
  if (!isObj(alert) || !alert.service) errors.push("Add an `alert:` with the `service` that is paging and a `title`.");
  else {
    hot = slug(alert.service);
    if (!services.has(hot)) {
      errors.push(`The alert points at \`${alert.service}\`, but there is no service with that id.`);
      hot = null;
    }
  }
  const standby = hot ? [...services.values()].find((s) => s.standby_for === hot)?.id ?? null : null;

  const actions: Action[] = [];
  const rawActions = Array.isArray(spec.runbook) ? spec.runbook : [];
  if (!rawActions.length) errors.push("Add at least one fix under `runbook:` (type: restart, throttle or reroute).");
  const seen = new Set<string>();
  rawActions.forEach((entry, i) => {
    const item = typeof entry === "string" ? { type: entry } : entry;
    if (!isObj(item)) return void errors.push(`runbook[${i}] should be an object with a \`type\`.`);
    const type = ALIASES[slug(item.type)];
    if (!type) return void errors.push(`runbook[${i}]: type \`${String(item.type)}\` isn't supported yet. Use restart, throttle or reroute.`);
    if (seen.has(type)) return void errors.push(`runbook: \`${String(item.type)}\` is listed twice.`);
    seen.add(type);
    if (type === "REROUTE_AND_HEAL" && hot && !standby) errors.push(`A reroute needs somewhere to go: mark a service with \`standby_for: ${hot}\`.`);
    const hotName = hot ? services.get(hot)!.name : "the service";
    const standbyName = standby ? services.get(standby)!.name : "standby";
    actions.push({
      id: `act_${type.toLowerCase()}`,
      type,
      name: String(item.name ?? DEFAULT_NAMES[type].replace("{hot}", hotName).replace("{standby}", standbyName)),
      cost: num(item.cost, `runbook \`${String(item.type)}\`: cost`, 1),
      successes: num(item.past_successes, `runbook \`${String(item.type)}\`: past_successes`, 1),
      broke_before: item.broke_before ? String(item.broke_before) : null,
    });
  });
  if (errors.length) throw new SpecError(errors);

  const callers = dependencies.filter((d) => d.to === hot).map((d) => d.from).sort((a, b) => services.get(b)!.load - services.get(a)!.load);
  return {
    name,
    tenant,
    alert: { id: `alert_${slug(hot)}`, title: String((alert as Raw).title ?? `${services.get(hot!)!.name} is overloaded`), service: hot! },
    hot: hot!,
    caller: callers[0] ?? hot!,
    standby,
    services: [...services.values()],
    dependencies,
    owners: [...owners.values()],
    actions,
  };
}

/** Graph snapshot in the shape GET /api/v2/graph returns. */
export function snapshot(sys: System, loads?: Map<string, number>, extraEdges: { from: string; to: string }[] = []) {
  const now = Math.floor(Date.now() / 1000);
  const t = { t_valid_from: now - 7 * 86400, t_valid_to: 9999999999, t_tx_created: now - 7 * 86400, t_tx_superseded: 9999999999 };
  const nodes: Raw[] = [
    ...sys.services.map((s) => ({ id: s.id, kind: "Service", name: s.name, tier: s.tier, current_load: loads?.get(s.id) ?? s.load, max_capacity: s.capacity, pii_classified: s.pii })),
    ...sys.owners.map((o) => ({ id: o.id, kind: "Engineer", name: o.name, oncall_available: true })),
    { id: sys.alert.id, kind: "Alert", name: sys.alert.title, title: sys.alert.title, severity: "CRITICAL" },
    ...sys.actions.map((a) => ({ id: a.id, kind: "RunbookAction", name: a.name, action_type: a.type, execution_cost: a.cost })),
  ];
  const total = sys.actions.reduce((sum, a) => sum + a.successes, 0) || 1;
  const links: Raw[] = [
    ...sys.dependencies.map((d) => ({ source: d.from, target: d.to, type: "DEPENDS_ON", p99_latency_ms: d.p99_ms, is_fallback: false, ...t })),
    ...extraEdges.map((d) => ({ source: d.from, target: d.to, type: "DEPENDS_ON", p99_latency_ms: 40, is_fallback: true, ...t, t_valid_from: now, t_tx_created: now })),
    ...sys.services.filter((s) => s.standby_for).map((s) => ({ source: s.standby_for, target: s.id, type: "HAS_FALLBACK", ...t })),
    ...sys.services.filter((s) => s.owner).map((s) => ({ source: s.owner, target: s.id, type: "OWNS", ...t })),
    { source: sys.alert.id, target: sys.hot, type: "TRIGGERED_ON", ...t },
    ...sys.actions.map((a) => ({ source: sys.alert.id, target: a.id, type: "PHEROMONE_TRACE", pheromone_weight: 0.3 + (0.6 * a.successes) / total, success_count: a.successes, last_updated: now - 7 * 86400 })),
    ...sys.actions.filter((a) => a.broke_before).map((a) => ({ source: sys.hot, target: a.id, type: "DEAD_END", dark_penalty: 0.95, failure_reason: a.broke_before, verified_by: "PROD", ttl_epoch: now + 172800 })),
  ];
  return { tenant: sys.tenant, at_time: now, baseline: now - 3 * 86400, incident: now, nodes, links };
}

function mutate(sys: System, type: Action["type"]): { loads: Map<string, number>; edges: { from: string; to: string }[] } {
  const loads = new Map(sys.services.map((s) => [s.id, s.load]));
  const edges: { from: string; to: string }[] = [];
  const callers = sys.dependencies.filter((d) => d.to === sys.hot).map((d) => d.from);
  if (type === "THROTTLE") {
    loads.set(sys.hot, loads.get(sys.hot)! * 0.7);
    for (const c of callers) loads.set(c, loads.get(c)! * 0.7);
  }
  if (type === "REROUTE_AND_HEAL" && sys.standby) {
    const moved = loads.get(sys.hot)! * 0.67;
    loads.set(sys.hot, loads.get(sys.hot)! - moved);
    loads.set(sys.standby, loads.get(sys.standby)! + moved);
    for (const c of callers) if (c !== sys.standby) edges.push({ from: c, to: sys.standby });
  }
  return { loads, edges };
}

/**
 * Browser-only estimate of the swarm run (demo mode, no backend): the memory
 * check, the sandbox mutation, the same Nemesis shock (+35% load on the paging
 * service, +180 ms on slow edges, its owner unreachable) and the capacity
 * shield. The real backend also checks curvature, zero-trust and Conway ghosts.
 */
export function simulate(sys: System): { run: { at_ms: number; event: SwarmEvent }[]; after: ReturnType<typeof snapshot> } {
  const events: SwarmEvent[] = [];
  const push = (agent: string, kind: string, detail: unknown) => events.push({ agent, kind, detail } as unknown as SwarmEvent);
  const owner = sys.services.find((s) => s.id === sys.hot)?.owner ?? null;
  const total = sys.actions.reduce((sum, a) => sum + a.successes, 0) || 1;
  const ranked = sys.actions
    .map((a) => {
      const pher = 0.3 + (0.6 * a.successes) / total;
      const dark = a.broke_before ? 0.95 : 0;
      return { action_id: a.id, action_name: a.name, action_type: a.type, execution_cost: a.cost, pheromone_weight: pher, success_count: a.successes, dark_penalty: dark, blocked_reason: a.broke_before, blocked_by: a.broke_before ? "PROD" : null, ucb_score: Number((pher + (1.414 * pher * Math.sqrt(total)) / (1 + a.successes) - dark - 0.15 * a.cost).toFixed(3)), expand: dark < 0.9 };
    })
    .sort((a, b) => b.ucb_score - a.ucb_score);
  push("SCOUT", "finding", { blast_radius: sys.dependencies.filter((d) => d.to === sys.hot).map((d) => d.from).concat(sys.hot), ghosts: [] });
  push("SCOUT", "rank", { actions: ranked });
  let winner: { action_id: string; action_name: string; survival: number } | null = null;
  let winnerState: ReturnType<typeof mutate> | null = null;
  for (const row of ranked) {
    const action = sys.actions.find((a) => a.id === row.action_id)!;
    if (!row.expand) {
      push("SHADOW_ARCHITECT", "skip", { action_id: action.id, action_type: action.type, reason: action.broke_before, verified_by: "PROD", hive_penalty: 0 });
      continue;
    }
    const state = mutate(sys, action.type);
    push("SHADOW_ARCHITECT", "expand", { action_id: action.id, action_type: action.type, depth: 1 });
    const shocked = new Map(state.loads);
    shocked.set(sys.hot, shocked.get(sys.hot)! * 1.35);
    const over = sys.services.filter((s) => s.tier === 1 && shocked.get(s.id)! > s.capacity).length;
    push("NEMESIS", "shock", { action_id: action.id, shock: { load_factor: 1.35, latency_delta_ms: 180, slowed_edges: sys.dependencies.filter((d) => d.p99_ms > 100).length, oncall_marked_down: owner }, shields: { "INV-SPOF": { violations: over }, blocked: over > 0 } });
    if (over > 0) {
      push("NEMESIS", "veto", { action_id: action.id, shields: ["INV-SPOF"] });
      continue;
    }
    if (!winner) {
      winner = { action_id: action.id, action_name: action.name, survival: 1 };
      winnerState = state;
    }
  }
  if (winner) push("ARBITER", "merge", { action_id: winner.action_id, action_name: winner.action_name });
  push("ARBITER", "proof", []);
  push("ARBITER", "done", { tenant: sys.tenant, alert_id: sys.alert.id, winner, ranked });
  const after = winnerState ? snapshot(sys, winnerState.loads, winnerState.edges) : snapshot(sys);
  return { run: events.map((event, i) => ({ at_ms: i, event })), after };
}

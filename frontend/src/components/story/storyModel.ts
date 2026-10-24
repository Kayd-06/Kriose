import type { GraphData, SwarmEvent } from "@/types/graph";

export type FixPhase = "waiting" | "memory" | "sandbox" | "stress" | "skipped" | "vetoed" | "passed" | "chosen";
export type StepState = "todo" | "active" | "ok" | "fail" | "skip";

export type FixStory = {
  id: string;
  name: string;
  short: string;
  phase: FixPhase;
  steps: { memory: StepState; sandbox: StepState; stress: StepState };
  reason: string | null;
  survival: number | null;
};

export type StressTest = { loadFactor: number; latencyMs: number; oncallDown: string | null };

export type StoryModel = {
  fixes: FixStory[];
  stress: StressTest | null;
  chosen: FixStory | null;
  finished: boolean;
};

const SHIELD_TEXT: Record<string, string> = {
  "INV-SPOF": "a critical service would run over capacity",
  "INV-RICCI": "it would leave a single point of failure",
  "INV-PII-ZERO-TRUST": "sensitive data would flow through an untrusted path",
  "INV-CONWAY-QUORUM": "it relies on teams that aren't talking to each other",
};

export function plainShield(shield: string): string {
  return SHIELD_TEXT[shield] ?? shield;
}

export function shortName(id: string, name: string): string {
  const base = id.replace(/^act_/, "").replace(/_/g, " ");
  if (base && base !== id) return base.charAt(0).toUpperCase() + base.slice(1);
  return name;
}

export function personName(graph: GraphData | null, id: string | null): string | null {
  if (!id) return null;
  const node = graph?.nodes.find((item) => item.id === id);
  return node?.name || id.replace(/^eng_/, "").replace(/^./, (c) => c.toUpperCase());
}

/** Candidate fixes for an alert: runbook actions on the graph, in runbook order. */
export function candidateFixes(graph: GraphData | null): { id: string; name: string }[] {
  if (!graph) return [];
  return graph.nodes
    .filter((node) => node.kind === "RunbookAction")
    .map((node) => ({ id: node.id, name: node.name || node.id }));
}

export function buildStory(graph: GraphData | null, events: SwarmEvent[]): StoryModel {
  const base = candidateFixes(graph);
  const fixes = new Map<string, FixStory>();
  const make = (id: string, name: string): FixStory => ({
    id,
    name,
    short: shortName(id, name),
    phase: "waiting",
    steps: { memory: "todo", sandbox: "todo", stress: "todo" },
    reason: null,
    survival: null,
  });
  for (const item of base) fixes.set(item.id, make(item.id, item.name));
  let stress: StressTest | null = null;
  let finished = false;
  const get = (id: string) => {
    if (!fixes.has(id)) fixes.set(id, make(id, id));
    return fixes.get(id)!;
  };
  for (const event of events) {
    const detail = (event.detail ?? {}) as Record<string, unknown>;
    const actionId = typeof detail.action_id === "string" ? detail.action_id : "";
    if (event.kind === "rank" && Array.isArray(detail.actions)) {
      // Keep the runbook order (restart, throttle, failover) so the story reads top to bottom.
      for (const row of detail.actions as Record<string, unknown>[]) {
        const fix = get(String(row.action_id ?? ""));
        if (typeof row.action_name === "string") fix.name = row.action_name;
        fix.phase = "memory";
        fix.steps.memory = "active";
      }
    }
    if (event.kind === "expand" && actionId) {
      const fix = get(actionId);
      fix.phase = "sandbox";
      fix.steps.memory = "ok";
      fix.steps.sandbox = "active";
    }
    if (event.kind === "shock" && actionId) {
      const fix = get(actionId);
      fix.phase = "stress";
      fix.steps.sandbox = "ok";
      fix.steps.stress = "active";
      const shock = (detail.shock ?? {}) as Record<string, unknown>;
      stress = {
        loadFactor: Number(shock.load_factor ?? 1.35),
        latencyMs: Number(shock.latency_delta_ms ?? 180),
        oncallDown: typeof shock.oncall_marked_down === "string" ? shock.oncall_marked_down : null,
      };
    }
    if (event.kind === "veto" && actionId) {
      const fix = get(actionId);
      const shields = Array.isArray(detail.shields) ? detail.shields.map(String) : [];
      fix.phase = "vetoed";
      fix.steps.stress = "fail";
      fix.reason = shields.length
        ? `Failed the stress test: ${shields.map(plainShield).join("; ")}.`
        : "Failed the stress test.";
    }
    if (event.kind === "skip" && actionId) {
      const fix = get(actionId);
      fix.phase = "skipped";
      fix.steps.memory = "fail";
      fix.steps.sandbox = "skip";
      fix.steps.stress = "skip";
      const why = String(detail.reason ?? "it failed before");
      const prod = detail.verified_by === "PROD" ? " in production" : "";
      const hive = Number(detail.hive_penalty ?? 0) > 0 ? " Another company hit the same failure." : "";
      fix.reason = `Broke things last time${prod}: ${why}.${hive} Not worth re-testing.`;
    }
    if (event.kind === "merge" && actionId) {
      const fix = get(actionId);
      fix.phase = "chosen";
      fix.steps.stress = "ok";
    }
    if (event.kind === "done") {
      finished = true;
      const winner = (detail.winner ?? null) as { action_id?: string; survival?: number } | null;
      for (const fix of fixes.values()) {
        if (fix.phase === "stress") {
          fix.phase = "passed";
          fix.steps.stress = "ok";
        }
        if (fix.phase === "memory" || fix.phase === "waiting") {
          fix.phase = "skipped";
          fix.reason = fix.reason ?? "Not tested: a better-ranked fix was already safe.";
        }
      }
      if (winner?.action_id) {
        const fix = get(winner.action_id);
        fix.phase = "chosen";
        fix.survival = winner.survival ?? null;
      }
    }
  }
  const list = [...fixes.values()];
  return { fixes: list, stress, chosen: list.find((fix) => fix.phase === "chosen") ?? null, finished };
}

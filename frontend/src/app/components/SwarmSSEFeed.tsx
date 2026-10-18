"use client";

export type SwarmEvent = {
  agent: string;
  kind: string;
  detail: Record<string, unknown>;
};

const AGENT_COLOR: Record<string, string> = {
  SCOUT: "#9fd7c8",
  SHADOW_ARCHITECT: "#d6ff4a",
  NEMESIS: "#e07a4a",
  ARBITER: "#f2c14e",
};

export default function SwarmSSEFeed({ events }: { events: SwarmEvent[] }) {
  return (
    <ol className="flex h-full flex-col gap-2 overflow-auto pr-1 font-mono text-[11px] leading-4">
      {events.length === 0 && (
        <li className="text-[#8d9284]">Seed the demo, then run the swarm. Events land here as the graph is read and copied.</li>
      )}
      {events.map((event, index) => (
        <li key={`${event.agent}-${event.kind}-${index}`} className="border border-[#2c3128] bg-[#141712] px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: AGENT_COLOR[event.agent] || "#e7e4d8" }}>{event.agent}</span>
            <span className="text-[#8d9284]">{event.kind}</span>
          </div>
          <p className="mt-1 text-[#e7e4d8]">{summarize(event)}</p>
        </li>
      ))}
    </ol>
  );
}

function summarize(event: SwarmEvent): string {
  const detail = event.detail || {};
  if (event.kind === "finding") {
    const bridge = detail.bridge as { upstream?: string; downstream?: string; kappa?: number; regime?: string } | null;
    const ghosts = (detail.ghosts as unknown[]) || [];
    if (!bridge) return `Blast radius ready. ${ghosts.length} Conway ghosts.`;
    return `${bridge.upstream} → ${bridge.downstream} κ ${Number(bridge.kappa).toFixed(3)} (${bridge.regime}). ${ghosts.length} ghosts.`;
  }
  if (event.kind === "rank") {
    const actions = (detail.actions as { action_name?: string; ucb_score?: number; expand?: boolean }[]) || [];
    return actions
      .map((action) => `${action.expand ? "expand" : "hold"} ${action.action_name} (${action.ucb_score})`)
      .join(" · ");
  }
  if (event.kind === "skip") {
    return `Did not copy a shadow for ${detail.action_id}. ${detail.reason || "blocked"}.`;
  }
  if (event.kind === "expand") {
    const kappa = detail.kappa_after;
    const extra = typeof kappa === "number" ? ` Bridge κ after heal ${kappa.toFixed(3)}.` : "";
    return `GRAPH.COPY ${detail.graph}.${extra}`;
  }
  if (event.kind === "shock") {
    const shields = detail.shields as { blocked?: boolean } | undefined;
    return `${detail.action_id} survival ${detail.survival}. Shields ${shields?.blocked ? "blocked" : "clear"}. On-call covered: ${String(detail.oncall_covered)}.`;
  }
  if (event.kind === "veto") {
    const shields = (detail.shields as string[]) || [];
    return `Veto ${detail.action_id}. Wrote DEAD_END and hive motif. ${shields.join(", ")}`;
  }
  if (event.kind === "merge") {
    return `Merged ${detail.action_name}. Episode ${detail.episode_id}.`;
  }
  if (event.kind === "proof" || event.kind === "done") return "Proof path is in the drawer.";
  if (event.kind === "refuse") return "Arbiter refused the merge.";
  return event.kind;
}

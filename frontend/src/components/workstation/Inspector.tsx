"use client";

import { useEffect, useState } from "react";
import { computeWeisfeilerLehmanHash } from "@/lib/graphMathEngine";
import { displayName } from "@/types/graph";
import { INK, epoch, fixed } from "./chrome";
import type { Session } from "./useWorkstation";

export function Inspector({ session }: { session: Session }) {
  const graph = session.graph;
  const node = graph && session.selection?.kind === "node" ? graph.nodes.find((item) => item.id === session.selection?.id) : null;
  const edge = graph && session.selection?.kind === "edge" ? graph.edges.find((item) => item.id === session.selection?.id) : null;
  const [reason, setReason] = useState("");
  const [penalty, setPenalty] = useState(0.95);
  const [actionId, setActionId] = useState("");
  const [motif, setMotif] = useState<{ hash: string; canonical: string } | null>(null);

  useEffect(() => {
    if (!graph || !node) {
      setMotif(null);
      return;
    }
    let cancel = false;
    void computeWeisfeilerLehmanHash(graph, node.id, 2, node.action_type || "").then((result) => {
      if (!cancel) setMotif({ hash: result.hash, canonical: result.canonical });
    });
    return () => {
      cancel = true;
    };
  }, [graph, node]);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l" style={{ background: INK.rack, borderColor: INK.line }}>
      <div className="border-b px-3 py-2 font-mono text-[10px] tracking-wider text-[#8B93A7]" style={{ borderColor: INK.line }}>
        INSPECTOR
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!node && !edge && <p className="font-mono text-[11px] text-[#8B93A7]">Select a module or an edge on the schematic.</p>}
        {node && (
          <div className="space-y-2">
            <div className="font-mono text-[10px] text-[#38BDF8]">{node.kind.toUpperCase()}</div>
            <h2 className="text-[13px]">{displayName(node)}</h2>
            <div className="font-mono text-[10px] text-[#8B93A7]">{node.id}</div>
            <NumberField label="current_load" value={node.current_load} onCommit={(value) => void session.updateNode(node.id, { current_load: value })} />
            <NumberField label="max_capacity" value={node.max_capacity} onCommit={(value) => void session.updateNode(node.id, { max_capacity: value })} />
            <NumberField label="tier" value={node.tier} digits={0} onCommit={(value) => void session.updateNode(node.id, { tier: value })} />
            <label className="flex items-center gap-2 font-mono text-[10px]">
              <input
                type="checkbox"
                checked={Boolean(node.pii_classified)}
                onChange={(event) => void session.updateNode(node.id, { pii_classified: event.target.checked })}
              />
              pii_classified
            </label>
            {node.kind === "RunbookAction" && (
              <NumberField
                label="pheromone via alert edge"
                value={session.scores.find((row) => row.actionId === node.id)?.pheromone ?? null}
                disabled
              />
            )}
            <section className="border p-2" style={{ borderColor: INK.line }}>
              <div className="font-mono text-[10px] text-[#8B93A7]">WL 2-HOP</div>
              <div className="mt-1 break-all font-mono text-[10px] tabular-nums text-[#F59E0B]">0x{motif?.hash ?? "computing"}</div>
              <div className="mt-1 max-h-16 overflow-auto font-mono text-[9px] text-[#8B93A7]">{motif?.canonical || "n/a"}</div>
              <button
                type="button"
                className="mt-2 font-mono text-[10px] text-[#38BDF8]"
                onClick={() => {
                  const actionType =
                    node.action_type || graph?.nodes.find((item) => item.id === actionId)?.action_type || "";
                  if (actionType) void session.publishHive(actionType, reason || "operator publish");
                }}
              >
                [PUBLISH ZK WL-MOTIF TO HIVE]
              </button>
            </section>
            <section className="border p-2" style={{ borderColor: INK.line }}>
              <div className="font-mono text-[10px] text-[#8B93A7]">[+ ATTACH DEAD_END]</div>
              <select
                value={actionId}
                onChange={(event) => setActionId(event.target.value)}
                className="mt-1 h-6 w-full rounded-[2px] border bg-transparent font-mono text-[10px]"
                style={{ borderColor: INK.line }}
              >
                <option value="">action</option>
                {graph?.nodes
                  .filter((item) => item.kind === "RunbookAction")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id}
                    </option>
                  ))}
              </select>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="failure reason"
                className="mt-1 h-6 w-full rounded-[2px] border bg-transparent px-1 font-mono text-[10px] outline-none"
                style={{ borderColor: INK.line }}
              />
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={penalty}
                onChange={(event) => setPenalty(Number(event.target.value))}
                className="mt-1 h-6 w-full rounded-[2px] border bg-transparent px-1 font-mono text-[10px] tabular-nums outline-none"
                style={{ borderColor: INK.line }}
              />
              <button
                type="button"
                className="mt-2 font-mono text-[10px] text-[#F43F5E]"
                onClick={() => actionId && void session.attachDeadEnd(actionId, reason || "operator dead-end", penalty)}
              >
                WRITE DARK EDGE
              </button>
            </section>
          </div>
        )}
        {edge && (
          <div className="space-y-2 font-mono text-[11px]">
            <div className="text-[10px] text-[#38BDF8]">{edge.type}</div>
            <div>
              {edge.source} → {edge.target}
            </div>
            <div className="tabular-nums text-[#8B93A7]">κ {fixed(edge.ricci_curvature)}</div>
            <NumberField label="p99_latency_ms" value={edge.p99_latency_ms} digits={0} onCommit={(value) => void session.updateEdge(edge.id, { p99_latency_ms: value })} />
            <NumberField label="pheromone_weight" value={edge.pheromone_weight} onCommit={(value) => void session.updateEdge(edge.id, { pheromone_weight: value })} />
            <Stamp label="t_valid_from" value={edge.t_valid_from} />
            <Stamp label="t_valid_to" value={edge.t_valid_to} />
            <Stamp label="t_tx_created" value={edge.t_tx_created} />
            <Stamp label="t_tx_superseded" value={edge.t_tx_superseded} />
            <button type="button" className="text-[10px] text-[#38BDF8]" onClick={() => void session.supersede(edge.id)}>
              [SUPERSEDE EDGE VERSION]
            </button>
          </div>
        )}
        {session.error && <p className="mt-3 font-mono text-[10px] text-[#F43F5E]">{session.error}</p>}
      </div>
    </aside>
  );
}

function Stamp({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between gap-2 text-[10px]">
      <span className="text-[#8B93A7]">{label}</span>
      <span className="tabular-nums">{epoch(value)}</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  digits = 3,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  digits?: number;
  disabled?: boolean;
  onCommit?: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : value.toFixed(digits));
  useEffect(() => setDraft(value === null ? "" : value.toFixed(digits)), [digits, value]);
  return (
    <label className="block font-mono text-[10px] text-[#8B93A7]">
      {label}
      <input
        disabled={disabled}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!onCommit || draft.trim() === "" || Number.isNaN(Number(draft))) return;
          onCommit(Number(draft));
        }}
        className="mt-0.5 h-6 w-full rounded-[2px] border bg-transparent px-1 font-mono text-[11px] tabular-nums text-[#E2E8F0] outline-none disabled:opacity-50"
        style={{ borderColor: INK.line }}
      />
    </label>
  );
}

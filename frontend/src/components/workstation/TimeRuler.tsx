"use client";

import { causalDrift, eventStamps } from "@/lib/graphMathEngine";
import { INK, epoch } from "./chrome";
import type { Session } from "./useWorkstation";

export function TimeRuler({ session }: { session: Session }) {
  const graph = session.graph;
  if (!graph) {
    return (
      <footer className="flex h-11 shrink-0 items-center px-4 font-mono text-[10px] text-[#8B93A7]" style={{ background: "#07090D", borderTop: `1px solid ${INK.line}` }}>
        BI-TEMPORAL RULER IDLE
      </footer>
    );
  }
  const stamps = eventStamps(graph);
  const min = stamps[0] ?? graph.baseline;
  const max = stamps[stamps.length - 1] ?? graph.incident;
  const at = session.at ?? graph.incident;
  const compare = session.compare ?? graph.baseline;
  const drift = causalDrift(graph, compare, at);
  const added = drift.filter((row) => row.cls === "ADDED").length;
  const removed = drift.filter((row) => row.cls === "INVALIDATED").length;
  const late = drift.filter((row) => row.cls === "LATE_DRIFT").length;
  return (
    <footer className="flex h-11 shrink-0 items-center gap-4 px-4" style={{ background: "#07090D", borderTop: `1px solid ${INK.line}` }}>
      <span className="font-mono text-[10px] text-[#8B93A7]">4D RULER</span>
      <input
        type="range"
        min={min}
        max={max}
        value={Math.min(max, Math.max(min, at))}
        onChange={(event) => session.setAt(Number(event.target.value))}
        className="w-64"
      />
      <span className="font-mono text-[10px] tabular-nums">t {epoch(at)}</span>
      <span className="font-mono text-[10px] text-[#8B93A7]">COMPARE</span>
      <input
        type="range"
        min={min}
        max={max}
        value={Math.min(max, Math.max(min, compare))}
        onChange={(event) => session.setCompare(Number(event.target.value))}
        className="w-40"
      />
      <span className="font-mono text-[10px] tabular-nums text-[#10B981]">+{added} ADDED</span>
      <span className="font-mono text-[10px] tabular-nums text-[#F43F5E]">-{removed} INVALIDATED</span>
      <span className="font-mono text-[10px] tabular-nums text-[#F59E0B]">~{late} LATE DRIFT</span>
      <span className="ml-auto font-mono text-[10px] text-[#8B93A7]">{stamps.length} STAMPS</span>
    </footer>
  );
}

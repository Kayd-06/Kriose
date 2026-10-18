"use client";

import { useMemo, useState } from "react";
import { evaluateShields, filterGraph, minKappa, computeOllivierRicciCurvature } from "@/lib/graphMathEngine";
import { INK, Led, fixed } from "./chrome";
import type { Session } from "./useWorkstation";

const STATE_COLOR = {
  IDLE: "#8B93A7",
  EXECUTING: INK.cyan,
  VERIFIED: INK.emerald,
  VETOED: INK.crimson,
};

export function SwarmRack({ session }: { session: Session }) {
  const [open, setOpen] = useState<string | null>(null);
  const shields = useMemo(() => {
    if (!session.graph) return null;
    const at = session.at ?? session.graph.incident;
    const filtered = filterGraph(session.graph, at);
    const rows = computeOllivierRicciCurvature(filtered, at);
    const floor = minKappa(rows) ?? 0;
    return evaluateShields(filtered, at, floor, false, false);
  }, [session.at, session.graph]);

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-r" style={{ background: INK.rack, borderColor: INK.line }}>
      <div className="grid grid-cols-4 border-b p-2" style={{ borderColor: INK.line }}>
        {session.agents.map((agent, index) => (
          <div key={agent.id} className="border px-1.5 py-1" style={{ borderColor: INK.line, background: INK.module }}>
            <div className="flex items-center gap-1 font-mono text-[10px] tracking-wide">
              <Led color={STATE_COLOR[agent.state]} />
              {String(index + 1).padStart(2, "0")}:{agent.id}
            </div>
            <div className="mt-1 font-mono text-[10px] tabular-nums text-[#8B93A7]">{agent.state}</div>
            <div className="font-mono text-[10px] tabular-nums">{agent.elapsedMs === null ? "n/a" : `${agent.elapsedMs.toFixed(0)} ms`}</div>
            <div className="truncate font-mono text-[9px] text-[#8B93A7]" title={agent.tool}>
              {agent.tool}
            </div>
          </div>
        ))}
      </div>
      <div className="border-b p-3" style={{ borderColor: INK.line }}>
        <div className="font-mono text-[10px] text-[#8B93A7]">UCB(G,a) = Q + c·P·√N/(1+n) - Ω_dead - Ψ_hive</div>
        <table className="mt-2 w-full font-mono text-[10px] tabular-nums">
          <thead className="text-[#8B93A7]">
            <tr>
              <th className="text-left font-normal">ACTION</th>
              <th className="text-right font-normal">P</th>
              <th className="text-right font-normal">Ω</th>
              <th className="text-right font-normal">Ψ</th>
              <th className="text-right font-normal">UCB</th>
            </tr>
          </thead>
          <tbody>
            {session.scores.map((row) => (
              <tr key={row.actionId} className="border-t" style={{ borderColor: INK.line }}>
                <td className="max-w-[140px] truncate py-1" title={row.actionName}>
                  {row.actionId}
                  {row.pruned && <span className="ml-1 text-[#F43F5E]">[PRUNED // 0 TOKENS]</span>}
                </td>
                <td className="text-right">{fixed(row.pheromone)}</td>
                <td className="text-right">{fixed(row.dark)}</td>
                <td className="text-right">{fixed(row.hive)}</td>
                <td className="text-right" style={{ color: row.ucb <= 0 ? INK.crimson : INK.emerald }}>
                  {fixed(row.ucb)}
                </td>
              </tr>
            ))}
            {!session.scores.length && (
              <tr>
                <td colSpan={5} className="py-2 text-[#8B93A7]">
                  NO RUNBOOK ACTION IN GRAPH
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[11px]">
        {session.logs.map((line) => (
          <button
            key={line.id}
            type="button"
            onClick={() => setOpen(open === line.id ? null : line.id)}
            className="block w-full border-b py-1 text-left"
            style={{ borderColor: "#141820" }}
          >
            <span className="text-[#8B93A7]">{new Date(line.t).toISOString().slice(11, 23)}</span>{" "}
            <span style={{ color: INK.cyan }}>{line.channel}</span>{" "}
            <span className="tabular-nums text-[#8B93A7]">{line.ms.toFixed(0)} ms</span>
            <span className="mt-0.5 block truncate text-[#E2E8F0]">{line.text}</span>
            {open === line.id && line.payload && (
              <pre className="mt-1 whitespace-pre-wrap text-[10px] text-[#8B93A7]">{line.payload}</pre>
            )}
          </button>
        ))}
        {!session.logs.length && <div className="text-[#8B93A7]">Execution stream is empty.</div>}
      </div>
      <div className="border-t p-2" style={{ borderColor: INK.line, background: "#07090D" }}>
        {(shields?.shields ?? []).map((shield) => (
          <div key={shield.id} className="mb-1 font-mono text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Led color={shield.violations ? INK.crimson : INK.emerald} />
                {shield.id}
              </span>
              <span className="tabular-nums">{shield.violations === 0 ? "[SHIELD:OK]" : `[VIOL ${shield.violations}]`}</span>
            </div>
            {shield.offenders.length > 0 && (
              <div className="truncate pl-2 text-[#8B93A7]" title={shield.offenders.join(", ")}>
                {shield.offenders.slice(0, 3).join(" ")}
              </div>
            )}
          </div>
        ))}
        {!shields && <div className="font-mono text-[10px] text-[#8B93A7]">SHIELDS WAITING FOR A GRAPH</div>}
      </div>
    </aside>
  );
}

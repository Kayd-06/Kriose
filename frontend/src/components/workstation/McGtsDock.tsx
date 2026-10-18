"use client";

import { INK, fixed } from "./chrome";
import type { Session } from "./useWorkstation";

export function McGtsDock({ session }: { session: Session }) {
  const live = session.branches.filter((branch) => !branch.action.pruned);
  return (
    <section className="grid h-[220px] shrink-0 grid-cols-12 border-t" style={{ background: INK.rack, borderColor: INK.line }}>
      <div className="col-span-4 overflow-y-auto border-r p-2" style={{ borderColor: INK.line }}>
        <div className="font-mono text-[10px] tracking-wider text-[#8B93A7]">MC-GTS DEPTH 0 → 2</div>
        <div className="mt-2 font-mono text-[10px] text-[#38BDF8]">D0 {session.graph?.graph ?? "EMPTY"}</div>
        {session.branches.map((branch) => (
          <div key={branch.action.actionId} className="mt-1 font-mono text-[10px] tabular-nums">
            <div>
              D1 {branch.action.actionId} UCB {fixed(branch.action.ucb)}
              {branch.action.pruned ? " [PRUNED]" : ""}
            </div>
            {!branch.action.pruned && (
              <div className="pl-3 text-[#8B93A7]">
                D2 survival {fixed(branch.survival)} {branch.shields.blocked ? "VETOED BY NEMESIS" : "PASS"}
              </div>
            )}
          </div>
        ))}
        <div className="mt-3 space-y-1 font-mono text-[10px] text-[#8B93A7]">
          <Slider label="RETRY STORM" min={1} max={2.5} step={0.05} value={session.chaos.loadFactor} suffix="x" onChange={(loadFactor) => session.setChaos({ ...session.chaos, loadFactor })} />
          <Slider label="TAIL LATENCY" min={0} max={500} step={10} value={session.chaos.latencyMs} suffix="ms" onChange={(latencyMs) => session.setChaos({ ...session.chaos, latencyMs })} />
          <Slider label="ON-CALL OUTAGE" min={0} max={1} step={0.05} value={session.chaos.outage} suffix="" onChange={(outage) => session.setChaos({ ...session.chaos, outage })} />
        </div>
        {session.serverNote && <div className="mt-2 font-mono text-[10px] text-[#F59E0B]">{session.serverNote}</div>}
      </div>
      <div className="col-span-8 flex gap-2 overflow-x-auto p-2">
        {live.map((branch) => (
          <article key={branch.action.actionId} className="w-56 shrink-0 border p-2" style={{ borderColor: INK.line, background: INK.module }}>
            <div className="font-mono text-[10px] text-[#38BDF8]">{branch.action.actionType}</div>
            <div className="truncate font-mono text-[11px]">{branch.action.actionId}</div>
            <div className="mt-1 font-mono text-[10px] tabular-nums">
              D1 {fixed(branch.kappaAfter)} κ · D2 survival {fixed(branch.survival)}
            </div>
            <div className="font-mono text-[10px] tabular-nums text-[#8B93A7]">
              Δκ {fixed((branch.kappaAfter ?? 0) - (branch.kappaBefore ?? 0))}
            </div>
            <div className="mt-1 font-mono text-[10px]">{branch.shields.blocked ? "VETOED BY NEMESIS" : "PASS"}</div>
            <ul className="mt-1 space-y-1">
              {branch.loads.map((row) => (
                <li key={row.id} className="font-mono text-[9px] tabular-nums text-[#8B93A7]">
                  {row.id} {fixed(row.before, 0)} → {fixed(row.depth1, 0)} → {fixed(row.depth2, 0)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={!branch.cypher.length || session.busy !== null}
              onClick={() => void session.commitBranch(branch.cypher, branch.action.actionId)}
              className="mt-2 font-mono text-[10px] text-[#E2E8F0] disabled:opacity-40"
            >
              [COMMIT BRANCH]
            </button>
          </article>
        ))}
        {!live.length && <div className="font-mono text-[11px] text-[#8B93A7]">No expanded branch. Rank appears when the graph has an alert and runbook actions.</div>}
      </div>
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-24">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="flex-1" />
      <span className="w-14 text-right tabular-nums text-[#E2E8F0]">
        {value.toFixed(2)}
        {suffix}
      </span>
    </label>
  );
}

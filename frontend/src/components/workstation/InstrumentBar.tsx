"use client";

import { demoActive } from "@/services/falkorClient";
import { useMemo, useState } from "react";
import { FileInput, Spline, Terminal } from "lucide-react";
import { computeOllivierRicciCurvature, detectConwayGhostEdges, evaluateShields, filterGraph, kappaRegime, minKappa } from "@/lib/graphMathEngine";
import { tenantOf } from "@/services/falkorClient";
import { Crosshair, INK, Led, PanelButton, fixed } from "./chrome";
import type { Session } from "./useWorkstation";

export function InstrumentBar({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const [tenant, setTenant] = useState("");
  const view = session.graph;
  const at = session.at ?? view?.incident ?? 0;
  const stats = useMemo(() => {
    if (!view) return null;
    const filtered = filterGraph(view, at);
    const ricci = computeOllivierRicciCurvature(filtered, at);
    const ghosts = detectConwayGhostEdges(filtered, at);
    const dead = filtered.edges.filter((edge) => edge.type === "DEAD_END").length;
    const traces = filtered.edges.filter((edge) => edge.type === "PHEROMONE_TRACE").length;
    const floor = minKappa(ricci.filter((row) => view.nodes.find((node) => node.id === row.source)?.tier === 1)) ?? 0;
    const shields = evaluateShields(filtered, at, floor, false, false);
    return {
      nodes: filtered.nodes.length,
      edges: filtered.edges.length,
      kappa: minKappa(ricci),
      regime: kappaRegime(minKappa(ricci)),
      ghosts: ghosts.length,
      dead,
      traces,
      shields: `${shields.passed}/4`,
    };
  }, [at, view]);

  const graphs = session.health?.graphs ?? [];

  return (
    <header
      className="relative flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3"
      style={{ background: INK.rack, borderColor: INK.line, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.04)" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M1 10 L7 2 L13 10" fill="none" stroke={INK.cyan} strokeWidth="1.5" />
            <path d="M3.5 10 H10.5" stroke={INK.text} strokeWidth="1" />
          </svg>
          KRIOSE // OS
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[#8B93A7]">
          <Led color={session.connected ? INK.emerald : INK.amber} />
          {session.connected ? (demoActive() ? "DEMO · RECORDED" : "FALKOR") : "MEMORY"}
          <span>{session.health ? `${session.health.latencyMs.toFixed(0)} ms` : "n/a"}</span>
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="h-7 rounded-[2px] border px-2 font-mono text-[11px]"
            style={{ borderColor: INK.line, background: INK.control, color: INK.text }}
          >
            {view ? view.graph : "NO GRAPH"}
          </button>
          {open && (
            <div className="absolute left-0 top-8 z-40 w-64 border" style={{ background: INK.module, borderColor: INK.line }}>
              {graphs.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="block w-full px-2 py-1 text-left font-mono text-[11px] hover:bg-[#151922]"
                  onClick={() => {
                    setOpen(false);
                    void session.openGraph(tenantOf(name));
                  }}
                >
                  {name}
                </button>
              ))}
              {!graphs.length && <div className="px-2 py-1 font-mono text-[11px] text-[#8B93A7]">NO SERVER GRAPHS</div>}
              <form
                className="flex gap-1 border-t p-1"
                style={{ borderColor: INK.line }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void session.createNamed(tenant);
                  setTenant("");
                  setOpen(false);
                }}
              >
                <input
                  value={tenant}
                  onChange={(event) => setTenant(event.target.value)}
                  placeholder="tenant id"
                  className="h-6 flex-1 rounded-[2px] border bg-transparent px-1 font-mono text-[11px] outline-none"
                  style={{ borderColor: INK.line }}
                />
                <button type="submit" className="font-mono text-[10px] text-[#38BDF8]">
                  [+ NEW]
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch justify-start overflow-hidden">
        <Cell label="TOPOLOGY" value={stats ? `${stats.nodes}V // ${stats.edges}E` : "n/a"} />
        <Cell label="MIN RICCI κ" value={stats ? `${fixed(stats.kappa)} [${stats.regime}]` : "n/a"} />
        <Cell label="CONWAY HOLES" value={stats ? `${stats.ghosts} GHOST_EDGES` : "n/a"} />
        <Cell label="STIGMERGY" value={stats ? `${stats.dead} DEAD_END // ${stats.traces} TRACES` : "n/a"} />
        <Cell label="INVARIANT SHIELDS" value={stats ? `${stats.shields} PASS` : "n/a"} />
      </div>
      <div className="flex items-center gap-1.5">
        <PanelButton onClick={() => session.setCompilerOpen(true)}>
          <FileInput size={14} strokeWidth={1.5} />
          [I] INGEST
        </PanelButton>
        <PanelButton onClick={() => session.setCypherOpen(true)}>
          <Terminal size={14} strokeWidth={1.5} />
          [K] CYPHER
        </PanelButton>
        <PanelButton onClick={() => void session.surgery()} disabled={!view || session.busy !== null}>
          <Spline size={14} strokeWidth={1.5} />
          [R] RICCI
        </PanelButton>
        <PanelButton hot onClick={() => void session.execute()} disabled={!view || session.busy !== null}>
          [SPACE] EXECUTE MC-GTS
        </PanelButton>
      </div>
      <span className="absolute bottom-0 left-0">
        <Crosshair />
      </span>
      <span className="absolute bottom-0 right-0">
        <Crosshair />
      </span>
    </header>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l px-2" style={{ borderColor: INK.line }} title={`${label}: ${value}`}>
      <span className="truncate whitespace-nowrap font-mono text-[10px] tracking-wider text-[#8B93A7]">{label}</span>
      <span className="truncate font-mono text-[11px] tabular-nums">{value}</span>
    </div>
  );
}

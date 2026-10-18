"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  blastRadius,
  computeOllivierRicciCurvature,
  computePageRank,
  detectConwayGhostEdges,
  filterGraph,
  triadicClosureCandidate,
} from "@/lib/graphMathEngine";
import { NODE_H, NODE_W, strata } from "@/lib/layout";
import { nodeKinds } from "@/lib/memoryCypher";
import { displayName } from "@/types/graph";
import { INK, Led, fixed } from "./chrome";
import type { Session } from "./useWorkstation";

const LENSES = [
  [1, "STIGMERGY"],
  [2, "RICCI κ"],
  [3, "CONWAY"],
  [4, "WL MOTIF"],
] as const;

export function SchematicCanvas({ session }: { session: Session }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 480, y: 280 });
  const [zoom, setZoom] = useState(1);
  const [space, setSpace] = useState(false);
  const [link, setLink] = useState<{ source: string; x: number; y: number } | null>(null);
  const [spawn, setSpawn] = useState<{ x: number; y: number; kind: string; name: string } | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const graph = session.graph;
  const at = session.at ?? graph?.incident ?? 0;
  const visible = useMemo(() => (graph ? filterGraph(graph, at) : null), [at, graph]);
  const ricci = useMemo(() => (visible ? computeOllivierRicciCurvature(visible, at) : []), [at, visible]);
  const rank = useMemo(() => (visible ? computePageRank(visible, at) : new Map<string, number>()), [at, visible]);
  const ghosts = useMemo(() => (visible ? detectConwayGhostEdges(visible, at) : []), [at, visible]);
  const closure = useMemo(() => (visible ? triadicClosureCandidate(visible, at) : null), [at, visible]);
  const kappaById = useMemo(() => new Map(ricci.map((row) => [row.id, row.kappa])), [ricci]);
  const root = session.selection?.kind === "node" ? session.selection.id : session.focusId;
  const blast = useMemo(() => (visible && root ? blastRadius(visible, root, at) : new Set<string>()), [at, root, visible]);
  const points = session.lens === 3 && graph ? strata(graph.nodes) : session.positions;

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const next = Math.min(2.4, Math.max(0.35, zoom * Math.exp(-event.deltaY * 0.001)));
      const wx = (mx - pan.x) / zoom;
      const wy = (my - pan.y) / zoom;
      setZoom(next);
      setPan({ x: mx - wx * next, y: my - wy * next });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [pan.x, pan.y, zoom]);

  const world = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  };

  return (
    <div
      ref={viewport}
      className="relative min-w-0 flex-1 overflow-hidden"
      style={{
        backgroundColor: INK.void,
        backgroundImage:
          "radial-gradient(#1A1E29 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        backgroundSize: "20px 20px, 100px 100px, 100px 100px",
        cursor: space ? "grab" : "default",
      }}
      onMouseDown={(event) => {
        if (event.button === 1 || space) {
          panning.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
        }
      }}
      onMouseMove={(event) => {
        if (panning.current) {
          setPan({
            x: panning.current.px + event.clientX - panning.current.x,
            y: panning.current.py + event.clientY - panning.current.y,
          });
        }
        if (drag.current && graph) {
          const point = world(event.clientX, event.clientY);
          session.moveNode(drag.current.id, { x: point.x - drag.current.dx, y: point.y - drag.current.dy });
        }
        if (link) {
          const point = world(event.clientX, event.clientY);
          setLink({ ...link, x: point.x, y: point.y });
        }
      }}
      onMouseUp={(event) => {
        panning.current = null;
        drag.current = null;
        if (link && visible) {
          const point = world(event.clientX, event.clientY);
          const hit = visible.nodes.find((node) => {
            const pos = points[node.id];
            if (!pos) return false;
            return Math.hypot(point.x - pos.x, point.y - (pos.y + NODE_H / 2)) < 18;
          });
          if (hit && hit.id !== link.source) void session.addEdge(link.source, hit.id);
        }
        setLink(null);
      }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-node]")) return;
        const rect = viewport.current!.getBoundingClientRect();
        setSpawn({ x: event.clientX - rect.left, y: event.clientY - rect.top, kind: "Service", name: "" });
      }}
      onMouseLeave={() => {
        panning.current = null;
      }}
    >
      <div className="absolute left-3 top-3 z-20 flex border" style={{ background: INK.rack, borderColor: INK.line }}>
        {LENSES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => session.setLens(id)}
            className="h-7 border-r px-2 font-mono text-[10px] last:border-r-0"
            style={{
              borderColor: INK.line,
              color: session.lens === id ? INK.cyan : INK.mute,
              background: session.lens === id ? INK.control : "transparent",
            }}
          >
            [{id}] {label}
          </button>
        ))}
      </div>
      <span className="absolute left-0 top-0 z-20">
        <span className="sr-only">grid origin</span>
      </span>
      {!visible && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[12px] text-[#8B93A7]">
          NO GRAPH LOADED · [I] INGEST OR [+ NEW]
        </div>
      )}
      {visible && (
        <svg className="absolute inset-0 h-full w-full">
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {visible.edges.map((edge) => {
              const a = points[edge.source];
              const b = points[edge.target];
              if (!a || !b) return null;
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const kappa = kappaById.get(edge.id);
              const selected = session.selection?.kind === "edge" && session.selection.id === edge.id;
              let stroke = "#2A3142";
              let width = 1;
              let dash = "";
              if (session.lens === 1 && edge.type === "PHEROMONE_TRACE") {
                stroke = INK.emerald;
                width = 1 + (edge.pheromone_weight ?? 0.2) * 3;
              }
              if (edge.type === "DEAD_END") {
                stroke = INK.crimson;
                dash = "4 3";
              }
              if (session.lens === 2 && kappa !== undefined) stroke = kappaColor(kappa);
              if (session.lens === 3 && edge.type === "SILENT_COLLISION_RISK") {
                stroke = INK.violet;
                dash = "3 3";
              }
              if (edge.type === "OWNS" && session.lens === 3) stroke = "#5C6578";
              if (selected) stroke = INK.cyan;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              return (
                <g key={edge.id} onClick={() => session.setSelection({ kind: "edge", id: edge.id })}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeDasharray={dash} />
                  {session.lens === 2 && kappa !== undefined && edge.type === "DEPENDS_ON" && (
                    <text x={midX} y={midY - 4} fill="#E2E8F0" fontSize="10" fontFamily="JetBrains Mono, monospace">
                      κ={kappa.toFixed(3)}
                    </text>
                  )}
                </g>
              );
            })}
            {session.lens === 3 &&
              ghosts.map((ghost) => {
                const a = points[ghost.source];
                const b = points[ghost.target];
                if (!a || !b) return null;
                return (
                  <line
                    key={`${ghost.source}|${ghost.target}|${ghost.hop}|${ghost.ownerA}`}
                    x1={a.x + NODE_W / 2}
                    y1={a.y + NODE_H / 2}
                    x2={b.x + NODE_W / 2}
                    y2={b.y + NODE_H / 2}
                    stroke={INK.violet}
                    strokeDasharray="2 3"
                    strokeWidth="1"
                  />
                );
              })}
            {session.lens === 2 && closure && points[closure.from] && points[closure.to] && (
              <line
                x1={points[closure.from].x + NODE_W}
                y1={points[closure.from].y + NODE_H / 2}
                x2={points[closure.to].x}
                y2={points[closure.to].y + NODE_H / 2}
                stroke={INK.orange}
                strokeDasharray="2 2"
              />
            )}
            {link && points[link.source] && (
              <line
                x1={points[link.source].x + NODE_W}
                y1={points[link.source].y + NODE_H / 2}
                x2={link.x}
                y2={link.y}
                stroke={INK.cyan}
              />
            )}
          </g>
        </svg>
      )}
      <div className="pointer-events-none absolute inset-0">
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          {visible?.nodes.map((node) => {
            const pos = points[node.id];
            if (!pos) return null;
            const selected = session.selection?.kind === "node" && session.selection.id === node.id;
            const inBlast = session.lens === 1 && blast.has(node.id);
            const load = node.current_load;
            const cap = node.max_capacity;
            const ratio = load !== null && cap ? Math.max(0, Math.min(1, load / cap)) : 0;
            return (
              <article
                key={node.id}
                data-node
                className="pointer-events-auto absolute"
                style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  const point = world(event.clientX, event.clientY);
                  drag.current = { id: node.id, dx: point.x - pos.x, dy: point.y - pos.y };
                  session.setSelection({ kind: "node", id: node.id });
                }}
              >
                <div
                  className="flex h-full flex-col border"
                  style={{
                    width: NODE_W,
                    height: NODE_H,
                    borderColor: selected || inBlast ? INK.cyan : "#262B38",
                    background: INK.module,
                    boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.04)",
                  }}
                >
                  <div className="flex h-[14px] items-center gap-1 px-1" style={{ background: "#12161F" }}>
                    <Led color={node.kind === "Alert" ? INK.amber : INK.cyan} />
                    <span className="font-mono text-[8px] tracking-wide text-[#8B93A7]">
                      {node.kind.toUpperCase()}
                      {node.tier ? ` // T${node.tier}` : ""}
                    </span>
                    <span className="ml-auto truncate font-mono text-[8px] text-[#8B93A7]">{node.id}</span>
                  </div>
                  <div className="flex flex-1 items-center px-2 text-[12px]">{displayName(node)}</div>
                  <div className="flex items-center gap-1 px-1.5 pb-1 font-mono text-[10px] tabular-nums text-[#8B93A7]">
                    <span className="h-1 w-10 border" style={{ borderColor: INK.line }}>
                      <span className="block h-full" style={{ width: `${ratio * 100}%`, background: ratio > 1 ? INK.crimson : INK.cyan }} />
                    </span>
                    <span>
                      {load === null ? "n/a" : load.toFixed(0)}/{cap === null ? "n/a" : cap.toFixed(0)}
                    </span>
                    <span className="ml-auto">PR {fixed(rank.get(node.id) ?? null, 2)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="input pin"
                  className="absolute top-[26px] h-2 w-2 border"
                  style={{ left: -4, background: INK.void, borderColor: "#8B93A7" }}
                />
                <button
                  type="button"
                  aria-label="output pin"
                  className="absolute top-[26px] h-2 w-2 border"
                  style={{ right: -4, background: INK.cyan, borderColor: INK.cyan }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    const point = world(event.clientX, event.clientY);
                    setLink({ source: node.id, x: point.x, y: point.y });
                  }}
                />
                {session.lens === 4 && session.hashes[node.id] && (
                  <div className="absolute left-0 top-[62px] font-mono text-[9px] text-[#F59E0B]">0x{session.hashes[node.id]}</div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      {spawn && (
        <form
          className="absolute z-30 w-52 border p-2"
          style={{ left: spawn.x, top: spawn.y, background: INK.rack, borderColor: INK.cyan }}
          onSubmit={(event) => {
            event.preventDefault();
            void session.addNode(spawn.kind, spawn.name);
            setSpawn(null);
          }}
        >
          <div className="mb-1 font-mono text-[10px] text-[#8B93A7]">+ ADD NODE</div>
          <select
            value={spawn.kind}
            onChange={(event) => setSpawn({ ...spawn, kind: event.target.value })}
            className="mb-1 h-6 w-full rounded-[2px] border bg-transparent font-mono text-[11px]"
            style={{ borderColor: INK.line }}
          >
            {nodeKinds().map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
          <input
            autoFocus
            value={spawn.name}
            onChange={(event) => setSpawn({ ...spawn, name: event.target.value })}
            placeholder="identifier"
            className="mb-1 h-6 w-full rounded-[2px] border bg-transparent px-1 font-mono text-[11px] outline-none"
            style={{ borderColor: INK.line }}
          />
          <button type="submit" className="font-mono text-[10px] text-[#38BDF8]">
            CREATE
          </button>
        </form>
      )}
      <SpaceWatch onChange={setSpace} />
    </div>
  );
}

function SpaceWatch({ onChange }: { onChange: (held: boolean) => void }) {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !typing(event.target)) onChange(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") onChange(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onChange]);
  return null;
}

function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT"));
}

function kappaColor(kappa: number): string {
  if (kappa < -0.5) return INK.orange;
  if (kappa < 0) return INK.crimson;
  return INK.emerald;
}

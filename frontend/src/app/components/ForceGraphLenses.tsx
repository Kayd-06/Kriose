"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export type Lens = "pheromone" | "ricci" | "conway" | "hive";

export type GraphNode = {
  id: string;
  kind?: string;
  name?: string;
  tier?: number;
  current_load?: number;
  max_capacity?: number;
  min_ricci_kappa?: number;
  action_type?: string;
  title?: string;
};

export type GraphLink = {
  source: string;
  target: string;
  type: string;
  ricci_curvature?: number | null;
  pheromone_weight?: number | null;
  dark_penalty?: number | null;
  risk_score?: number | null;
  p99_latency_ms?: number | null;
  owner_a?: string;
  owner_b?: string;
  verified_by?: string;
  is_fallback?: boolean;
};

const KIND_COLOR: Record<string, string> = {
  Service: "#d6ff4a",
  Engineer: "#9fd7c8",
  Ingress: "#f2c14e",
  AuthMiddleware: "#f2c14e",
  Alert: "#e07a4a",
  DecisionDoc: "#c7b8ea",
  CodeSymbol: "#8eb6ff",
  RunbookAction: "#e7e4d8",
};

function linkColor(link: GraphLink, lens: Lens): string {
  if (link.type === "DEAD_END") return "#e07a4a";
  if (link.type === "SILENT_COLLISION_RISK") return lens === "conway" ? "#f2c14e" : "#5c5340";
  if (link.type === "PHEROMONE_TRACE") return lens === "pheromone" ? "#d6ff4a" : "#3d4a22";
  if (link.type === "DEPENDS_ON" && lens === "ricci") {
    const kappa = Number(link.ricci_curvature ?? 0);
    if (kappa < -0.5) return "#e07a4a";
    if (kappa < 0) return "#f2c14e";
    return "#d6ff4a";
  }
  if (link.type === "GOVERNED_BY" || link.type === "SUPERSEDES") return "#c7b8ea";
  if (link.type === "CALLS_AST" || link.type === "DEFINED_IN") return "#8eb6ff";
  return "#4d5548";
}

export default function ForceGraphLenses({
  nodes,
  links,
  lens,
  highlight,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  lens: Lens;
  highlight?: string | null;
}) {
  const data = useMemo(() => {
    const visible = links.filter((link) => {
      if (lens === "pheromone") {
        return ["DEPENDS_ON", "PHEROMONE_TRACE", "DEAD_END", "OWNS", "TRIGGERED_ON", "HAS_FALLBACK"].includes(link.type);
      }
      if (lens === "ricci") return link.type === "DEPENDS_ON" || link.type === "HAS_FALLBACK";
      if (lens === "conway") {
        return ["DEPENDS_ON", "OWNS", "COMMUNICATED_WITH", "SILENT_COLLISION_RISK", "GOVERNED_BY"].includes(link.type);
      }
      return true;
    });
    return {
      nodes: nodes.map((node) => ({ ...node })),
      links: visible.map((link) => ({ ...link })),
    };
  }, [nodes, links, lens]);

  return (
    <div className="h-full w-full bg-[#141712]">
      <ForceGraph2D
        graphData={data}
        backgroundColor="#141712"
        nodeId="id"
        nodeLabel={(node) => {
          const row = node as GraphNode;
          const title = row.name || row.title || row.id;
          return `${row.kind || "node"} · ${title}`;
        }}
        nodeRelSize={5}
        nodeColor={(node) => {
          const row = node as GraphNode;
          if (highlight && row.id === highlight) return "#ffffff";
          return KIND_COLOR[row.kind || ""] || "#8d9284";
        }}
        linkColor={(link) => linkColor(link as GraphLink, lens)}
        linkWidth={(link) => {
          const row = link as GraphLink;
          if (row.type === "DEAD_END") return 2.4;
          if (row.type === "PHEROMONE_TRACE") return 1 + Number(row.pheromone_weight || 0) * 2;
          if (row.type === "SILENT_COLLISION_RISK") return lens === "conway" ? 2.2 : 0.6;
          return 1;
        }}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        cooldownTicks={80}
      />
    </div>
  );
}

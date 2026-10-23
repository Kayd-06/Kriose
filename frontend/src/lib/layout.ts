import type { GraphEdge, GraphNode } from "@/types/graph";

export const NODE_W = 176;
export const NODE_H = 60;

export type Point = { x: number; y: number };

const COL_GAP = 56;
const ROW_GAP = 36;
const LANE_GAP = 120;
const INFRA = new Set(["Ingress", "AuthMiddleware", "Service"]);
const OPS = new Set(["Alert", "RunbookAction", "EpisodicMemory"]);
const ORG = new Set(["Engineer", "Team"]);

/**
 * Layered left-to-right layout.
 * - Ingress / auth / services are ranked by longest DEPENDS_ON path, so the
 *   live call path reads left to right.
 * - Engineers sit in a lane above, near the services they own.
 * - Alerts, runbook actions and episodes sit in a lane below.
 * - Code symbols, docs and anything else sit in a bottom lane.
 * Nodes inside a lane never overlap.
 */
export function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]): Record<string, Point> {
  const points: Record<string, Point> = {};
  const ids = new Set(nodes.map((node) => node.id));
  const links = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const infra = nodes.filter((node) => INFRA.has(node.kind));
  const infraIds = new Set(infra.map((node) => node.id));
  const calls = links.filter((edge) => edge.type === "DEPENDS_ON" && infraIds.has(edge.source) && infraIds.has(edge.target) && edge.source !== edge.target);

  // Longest-path layering, bounded so cycles cannot loop forever.
  const layer = new Map<string, number>(infra.map((node) => [node.id, 0]));
  for (let pass = 0; pass < infra.length; pass += 1) {
    let changed = false;
    for (const edge of calls) {
      const next = (layer.get(edge.source) ?? 0) + 1;
      if (next > (layer.get(edge.target) ?? 0) && next < infra.length) {
        layer.set(edge.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, GraphNode[]>();
  for (const node of infra) {
    const col = layer.get(node.id) ?? 0;
    columns.set(col, [...(columns.get(col) ?? []), node]);
  }
  const order = [...columns.keys()].sort((a, b) => a - b);
  for (const col of order) {
    const list = columns.get(col)!;
    // Barycenter ordering against the previous column to reduce crossings.
    const bary = (node: GraphNode) => {
      const ys = calls.filter((edge) => edge.target === node.id && points[edge.source]).map((edge) => points[edge.source].y);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    };
    list.sort((a, b) => bary(a) - bary(b) || a.id.localeCompare(b.id));
    const height = list.length * NODE_H + (list.length - 1) * ROW_GAP;
    list.forEach((node, index) => {
      points[node.id] = { x: col * (NODE_W + COL_GAP), y: index * (NODE_H + ROW_GAP) - height / 2 };
    });
  }

  const infraYs = infra.map((node) => points[node.id].y);
  const top = infraYs.length ? Math.min(...infraYs) : 0;
  const bottom = infraYs.length ? Math.max(...infraYs) + NODE_H : 0;
  const neighbourX = (node: GraphNode) => {
    const xs = links
      .filter((edge) => edge.source === node.id || edge.target === node.id)
      .map((edge) => points[edge.source === node.id ? edge.target : edge.source]?.x)
      .filter((x): x is number => typeof x === "number");
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  const lane = (list: GraphNode[], y: number) => {
    const wanted = list.map((node) => ({ node, x: neighbourX(node) })).sort((a, b) => a.x - b.x || a.node.id.localeCompare(b.node.id));
    let cursor = -Infinity;
    for (const item of wanted) {
      const x = Math.max(item.x, cursor);
      points[item.node.id] = { x, y };
      cursor = x + NODE_W + 24;
    }
  };
  const org = nodes.filter((node) => ORG.has(node.kind));
  const ops = nodes.filter((node) => OPS.has(node.kind));
  const rest = nodes.filter((node) => !INFRA.has(node.kind) && !ORG.has(node.kind) && !OPS.has(node.kind));
  lane(org, top - LANE_GAP - NODE_H);
  lane(ops, bottom + LANE_GAP);
  // Second pass so docs/code anchor on ops nodes too.
  lane(rest, bottom + LANE_GAP * 2 + NODE_H);
  return points;
}

export function bounds(points: Record<string, Point>, ids: string[]) {
  const list = ids.map((id) => points[id]).filter(Boolean);
  if (!list.length) return null;
  const minX = Math.min(...list.map((p) => p.x));
  const minY = Math.min(...list.map((p) => p.y));
  const maxX = Math.max(...list.map((p) => p.x + NODE_W));
  const maxY = Math.max(...list.map((p) => p.y + NODE_H));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function strata(nodes: GraphNode[]): Record<string, Point> {
  const org = nodes.filter((node) => node.kind === "Engineer" || node.kind === "Team" || node.kind === "DecisionDoc");
  const infra = nodes.filter((node) => !org.includes(node));
  const points: Record<string, Point> = {};
  const place = (list: GraphNode[], y: number) => {
    const width = Math.max(list.length * (NODE_W + 28), NODE_W);
    list.forEach((node, index) => {
      points[node.id] = { x: index * (NODE_W + 28) - width / 2, y };
    });
  };
  place(org, -180);
  place(infra, 80);
  return points;
}

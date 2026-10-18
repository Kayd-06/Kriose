import type { GraphEdge, GraphNode } from "@/types/graph";

export const NODE_W = 172;
export const NODE_H = 60;

export type Point = { x: number; y: number };

export function layoutNodes(nodes: GraphNode[], edges: GraphEdge[]): Record<string, Point> {
  const points: Record<string, Point> = {};
  const count = Math.max(nodes.length, 1);
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / count;
    const radius = 220 + count * 4;
    points[node.id] = {
      x: Math.cos(angle) * radius - NODE_W / 2,
      y: Math.sin(angle) * radius - NODE_H / 2,
    };
  });
  const links = edges.filter((edge) => points[edge.source] && points[edge.target]);
  for (let step = 0; step < 80; step += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = points[nodes[i].id];
        const b = points[nodes[j].id];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const force = 9000 / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.x += dx;
        a.y += dy;
        b.x -= dx;
        b.y -= dy;
      }
    }
    for (const edge of links) {
      const a = points[edge.source];
      const b = points[edge.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const delta = (dist - 240) * 0.02;
      const ux = (dx / dist) * delta;
      const uy = (dy / dist) * delta;
      a.x += ux;
      a.y += uy;
      b.x -= ux;
      b.y -= uy;
    }
    for (const node of nodes) {
      points[node.id].x *= 0.98;
      points[node.id].y *= 0.98;
    }
  }
  return points;
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

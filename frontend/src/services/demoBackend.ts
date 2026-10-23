// Frontend-only demo backend. Serves a recorded snapshot of the seeded Acme
// graph and replays a recorded swarm run (captured from the real FastAPI +
// FalkorDB backend, see public/demo/README.md). Used when
// NEXT_PUBLIC_DEMO_MODE=1, when ?demo-data=1 is in the URL, or automatically
// when the API cannot be reached.
import type { SwarmEvent } from "@/types/graph";

type Recorded = { at_ms: number; event: SwarmEvent };

const FORCED = process.env.NEXT_PUBLIC_DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
let auto = false;
let ran = false;
const cache = new Map<string, unknown>();
const custom = new Map<string, unknown>();

export function demoForced(): boolean {
  if (FORCED) return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo-data") === "1";
}

export function demoActive(): boolean {
  return demoForced() || auto;
}

export function enableAutoDemo(): void {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("live") === "1") return;
  auto = true;
}

export function resetDemoRun(): void {
  ran = false;
  for (const key of [...custom.keys()]) if (key.startsWith("before:")) custom.set(`graph:${key.slice(7)}`, custom.get(key));
}

/** Register a user-supplied graph (bring-your-own-system) for demo mode. */
export function putCustomGraph(tenant: string, body: unknown, run: Recorded[], after?: unknown): void {
  custom.set(`graph:${tenant}`, body);
  custom.set(`before:${tenant}`, body);
  custom.set(`run:${tenant}`, run);
  if (after) custom.set(`after:${tenant}`, after);
}

async function asset<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const response = await fetch(`${base}/demo/${name}`);
    cache.set(name, await response.json());
  }
  return cache.get(name) as T;
}

export async function demoHealth(): Promise<{ ok: boolean; graphs: string[] }> {
  const recorded = await asset<{ graphs: string[] }>("health.json");
  const extra = [...custom.keys()].filter((key) => key.startsWith("graph:")).map((key) => `kriose_${key.slice(6)}`);
  return { ok: true, graphs: [...extra, ...recorded.graphs] };
}

export async function demoGraph(tenant: string): Promise<unknown> {
  if (custom.has(`graph:${tenant}`)) return custom.get(`graph:${tenant}`);
  return asset(ran ? "graph-after.json" : "graph-before.json");
}

export async function demoHive(): Promise<unknown> {
  return asset(ran ? "hive-after.json" : "hive-before.json");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The real run finishes in ~60 ms. Replay each step with a readable pause
// while keeping the recorded order and payloads.
const PACE: Record<string, number> = { finding: 600, rank: 900, expand: 800, shock: 1000, veto: 900, skip: 700, merge: 900, proof: 600, done: 400 };

export async function demoStream(tenant: string, onEvent: (event: SwarmEvent) => void): Promise<void> {
  const run = (custom.get(`run:${tenant}`) as Recorded[] | undefined) ?? (await asset<Recorded[]>("swarm-run.json"));
  for (const item of run) {
    await sleep(PACE[item.event.kind] ?? 600);
    onEvent(item.event);
  }
  if (!custom.has(`run:${tenant}`)) ran = true;
  else if (custom.has(`after:${tenant}`)) custom.set(`graph:${tenant}`, custom.get(`after:${tenant}`));
}

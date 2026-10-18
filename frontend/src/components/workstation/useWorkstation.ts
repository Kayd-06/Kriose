"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChaosBudget, GraphData, GraphEdge, HiveMotif, LogLine, Selection, SwarmEvent, UcbRow } from "@/types/graph";
import {
  alertsIn,
  computeUCBGraphScores,
  computeWeisfeilerLehmanHash,
  escapeCypher,
  makeEdge,
  previewBranches,
  triggerTarget,
  triadicClosureCandidate,
} from "@/lib/graphMathEngine";
import { layoutNodes, type Point } from "@/lib/layout";
import { applyStatements as applyMemory, blankNode, emptyGraph, nodeSetCypher } from "@/lib/memoryCypher";
import type { Draft } from "@/lib/neuroSymbolicCompiler";
import { materialize } from "@/lib/neuroSymbolicCompiler";
import {
  createTenant,
  graphOf,
  loadGraph,
  loadHive,
  ping,
  publishMotif,
  recomputeRicci,
  runCypher,
  streamSwarm,
  tenantOf,
  type Health,
} from "@/services/falkorClient";

export type AgentId = "SCOUT" | "ARCHITECT" | "NEMESIS" | "ARBITER";
export type AgentCell = {
  id: AgentId;
  state: "IDLE" | "EXECUTING" | "VERIFIED" | "VETOED";
  elapsedMs: number | null;
  tool: string;
};

const TOOLS: Record<AgentId, string> = {
  SCOUT: "mcp_compute_ricci_curvature",
  ARCHITECT: "mcp_run_mcgts_nemesis",
  NEMESIS: "mcp_run_mcgts_nemesis",
  ARBITER: "mcp_sync_zk_hivemind",
};

function idleAgents(): AgentCell[] {
  return (Object.keys(TOOLS) as AgentId[]).map((id) => ({
    id,
    state: "IDLE",
    elapsedMs: null,
    tool: TOOLS[id],
  }));
}

function mapAgent(agent: string): AgentId | null {
  if (agent === "SHADOW_ARCHITECT") return "ARCHITECT";
  if (agent === "SCOUT" || agent === "NEMESIS" || agent === "ARBITER") return agent;
  return null;
}

export function useWorkstation() {
  const [health, setHealth] = useState<Health | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [hive, setHive] = useState<HiveMotif[]>([]);
  const [at, setAt] = useState<number | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [lens, setLens] = useState<1 | 2 | 3 | 4>(2);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [agents, setAgents] = useState<AgentCell[]>(idleAgents);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chaos, setChaos] = useState<ChaosBudget>({ loadFactor: 1.35, latencyMs: 180, outage: 1 });
  const [scores, setScores] = useState<UcbRow[]>([]);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [compilerOpen, setCompilerOpen] = useState(false);
  const [cypherOpen, setCypherOpen] = useState(false);
  const [serverNote, setServerNote] = useState<string | null>(null);
  const [memoryOnly, setMemoryOnly] = useState(false);

  const connected = Boolean(health?.ok) && !memoryOnly;

  const log = useCallback((channel: string, text: string, ms = 0, payload?: string) => {
    setLogs((current) => [
      ...current.slice(-240),
      { id: crypto.randomUUID(), t: Date.now(), ms, channel, text, payload },
    ]);
  }, []);

  const refreshHealth = useCallback(async () => {
    const next = await ping();
    setHealth(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  const alertId = useMemo(() => {
    if (!graph) return null;
    if (selection?.kind === "node") {
      const node = graph.nodes.find((item) => item.id === selection.id);
      if (node?.kind === "Alert") return node.id;
      const triggered = graph.edges.find((edge) => edge.type === "TRIGGERED_ON" && edge.target === selection.id);
      if (triggered) return triggered.source;
    }
    return alertsIn(graph)[0]?.id ?? null;
  }, [graph, selection]);

  const focusId = graph && alertId ? triggerTarget(graph, alertId) : null;

  useEffect(() => {
    if (!graph) {
      setScores([]);
      setHashes({});
      return;
    }
    let cancel = false;
    const hashesForHive = new Set(hive.map((motif) => motif.wl_hash));
    if (alertId) {
      void computeUCBGraphScores(graph, alertId, hashesForHive).then((rows) => {
        if (!cancel) setScores(rows);
      });
    } else if (!cancel) setScores([]);
    const services = graph.nodes.filter((node) => node.kind === "Service").slice(0, 24);
    void Promise.all(services.map(async (node) => [node.id, (await computeWeisfeilerLehmanHash(graph, node.id, 2)).hash] as const)).then(
      (pairs) => {
        if (!cancel) setHashes(Object.fromEntries(pairs));
      },
    );
    return () => {
      cancel = true;
    };
  }, [graph, alertId, hive]);

  const openGraph = useCallback(
    async (tenant: string) => {
      setBusy("LOAD");
      setError(null);
      const started = performance.now();
      try {
        const [next, motifs] = await Promise.all([loadGraph(tenant), loadHive().catch(() => [])]);
        setGraph(next);
        setHive(motifs);
        setAt(next.incident);
        setCompare(next.baseline);
        setMemoryOnly(false);
        setPositions(layoutNodes(next.nodes, next.edges));
        setSelection(null);
        log("FALKOR", `GRAPH.LIST -> ${next.graph} ${next.nodes.length}V ${next.edges.length}E`, Math.round(performance.now() - started));
      } catch (err) {
        setError(err instanceof Error ? err.message : "graph load failed");
      } finally {
        setBusy(null);
      }
    },
    [log],
  );

  useEffect(() => {
    if (!health?.ok || graph || memoryOnly) return;
    const named = health.graphs.find((item) => item.startsWith("kriose_") && item !== "kriose_global_hive_immunology");
    if (named) void openGraph(tenantOf(named));
  }, [health, graph, memoryOnly, openGraph]);

  const writeStatements = useCallback(
    async (statements: string[], reload: boolean) => {
      if (!graph) return;
      const started = performance.now();
      if (connected) {
        for (const statement of statements) {
          const mark = performance.now();
          const result = await runCypher(graph.graph, statement);
          log("CYPHER", statement, Math.round(performance.now() - mark), `${result.count} rows`);
        }
        if (reload) {
          await recomputeRicci(graph.tenant).catch(() => undefined);
          const next = await loadGraph(graph.tenant);
          setGraph(next);
          setHive(await loadHive().catch(() => hive));
        }
      } else {
        const next = applyMemory(graph, statements);
        setGraph(next);
        setPositions((current) => {
          const laid = layoutNodes(next.nodes, next.edges);
          const merged = { ...laid };
          for (const id of Object.keys(current)) if (merged[id]) merged[id] = current[id];
          return merged;
        });
        for (const statement of statements) log("MEMORY", statement, Math.round(performance.now() - started));
      }
    },
    [connected, graph, hive, log],
  );

  const ingest = useCallback(
    async (draft: Draft, tenant: string) => {
      setBusy("INGEST");
      setError(null);
      try {
        if (connected) {
          await createTenant(tenant).catch(() => undefined);
          const target = graphOf(tenant);
          for (const statement of draft.cypher) {
            const mark = performance.now();
            const result = await runCypher(target, statement);
            log("COMPILE", statement, Math.round(performance.now() - mark), `${result.count} rows`);
          }
          await recomputeRicci(tenant).catch(() => undefined);
          await openGraph(tenant);
        } else {
          const next = materialize(draft, `memory_${tenant}`, tenant);
          setGraph(next);
          setAt(next.incident);
          setCompare(next.baseline);
          setMemoryOnly(true);
          setPositions(layoutNodes(next.nodes, next.edges));
          log("COMPILE", draft.note, 0, `${draft.cypher.length} statements`);
        }
        setCompilerOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ingest failed");
      } finally {
        setBusy(null);
      }
    },
    [connected, log, openGraph],
  );

  const execute = useCallback(async () => {
    if (!graph || !alertId) {
      setError("Select a graph that contains an Alert node.");
      return;
    }
    setBusy("SWARM");
    setError(null);
    setAgents(idleAgents().map((cell) => ({ ...cell, state: "EXECUTING", elapsedMs: 0 })));
    try {
      if (connected) {
        let winner = "none";
        let survival = "n/a";
        await streamSwarm(graph.tenant, alertId, (event: SwarmEvent) => {
          const agent = mapAgent(event.agent);
          if (agent) {
            setAgents((current) =>
              current.map((cell) => {
                if (cell.id !== agent) return cell;
                const veto = event.kind === "veto" || event.kind === "refuse";
                const done = ["rank", "expand", "shock", "proof", "merge", "done", "skip"].includes(event.kind);
                return {
                  ...cell,
                  state: veto ? "VETOED" : done ? "VERIFIED" : "EXECUTING",
                  elapsedMs: event.t_ms ?? cell.elapsedMs,
                };
              }),
            );
          }
          const detail = event.detail ?? {};
          if (event.kind === "done") {
            const summary = detail as { winner?: { action_id?: string; survival?: number } | null };
            winner = summary.winner?.action_id ?? "none";
            survival = summary.winner?.survival?.toFixed(3) ?? "0.000";
          }
          log(event.agent, `${event.kind}`, event.t_ms ?? 0, JSON.stringify(detail).slice(0, 700));
        });
        setServerNote(`FALKOR WINNER ${winner} survival ${survival}`);
        await openGraph(graph.tenant);
      } else {
        const started = performance.now();
        const localScores = await computeUCBGraphScores(graph, alertId, new Set(hive.map((motif) => motif.wl_hash)));
        setAgents((current) => current.map((cell) => (cell.id === "SCOUT" ? { ...cell, state: "VERIFIED", elapsedMs: Math.round(performance.now() - started) } : cell)));
        log("SCOUT", `ranked ${localScores.length} actions`, Math.round(performance.now() - started));
        const branches = previewBranches(graph, localScores, focusId, chaos);
        const winner = [...branches].filter((branch) => !branch.action.pruned).sort((a, b) => b.survival - a.survival || b.action.ucb - a.action.ucb)[0];
        setAgents((current) =>
          current.map((cell) => ({
            ...cell,
            state: cell.id === "NEMESIS" && winner && winner.survival === 0 ? "VETOED" : "VERIFIED",
            elapsedMs: Math.round(performance.now() - started),
          })),
        );
        if (winner && winner.cypher.length) {
          setGraph(applyMemory(graph, winner.cypher));
          log("ARBITER", `commit ${winner.action.actionId} survival ${winner.survival.toFixed(3)}`, Math.round(performance.now() - started));
        } else log("ARBITER", "no branch survived", Math.round(performance.now() - started));
        setServerNote(winner ? `MEMORY WINNER ${winner.action.actionId} survival ${winner.survival.toFixed(3)}` : "MEMORY WINNER none");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "swarm failed");
    } finally {
      setBusy(null);
    }
  }, [alertId, chaos, connected, focusId, graph, hive, log, openGraph]);

  const commitBranch = useCallback(
    async (statements: string[], actionId: string) => {
      if (!statements.length) return;
      setBusy("COMMIT");
      setError(null);
      try {
        await writeStatements(statements, true);
        log("ARBITER", `COMMIT ${actionId}`, 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "commit failed");
      } finally {
        setBusy(null);
      }
    },
    [log, writeStatements],
  );

  const surgery = useCallback(async () => {
    if (!graph) return;
    const when = at ?? graph.incident;
    const candidate = triadicClosureCandidate(graph, when);
    if (!candidate) {
      setError("No triadic closure raises the minimum curvature.");
      return;
    }
    const now = graph.incident;
    const statement = `MATCH (a {id: '${escapeCypher(candidate.from)}'}), (b {id: '${escapeCypher(candidate.to)}'}) MERGE (a)-[r:DEPENDS_ON]->(b) SET r.is_fallback = true, r.p99_latency_ms = 40, r.t_valid_from = ${now}, r.t_valid_to = 9999999999, r.t_tx_created = ${now}, r.t_tx_superseded = 9999999999`;
    setBusy("RICCI");
    try {
      await writeStatements([statement], true);
      log("RICCI", `closure ${candidate.from} -> ${candidate.to} κ ${candidate.kappaBefore.toFixed(3)} -> ${candidate.kappaAfter.toFixed(3)}`, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "surgery failed");
    } finally {
      setBusy(null);
    }
  }, [at, graph, log, writeStatements]);

  const updateNode = useCallback(
    async (id: string, patch: Partial<GraphData["nodes"][number]>) => {
      if (!graph) return;
      const current = graph.nodes.find((node) => node.id === id);
      if (!current) return;
      const nextNode = { ...current, ...patch };
      const nextGraph = { ...graph, nodes: graph.nodes.map((node) => (node.id === id ? nextNode : node)) };
      setGraph(nextGraph);
      if (!connected) return;
      try {
        await runCypher(graph.graph, nodeSetCypher(nextNode));
      } catch (err) {
        setError(err instanceof Error ? err.message : "property write failed");
      }
    },
    [connected, graph],
  );

  const addNode = useCallback(
    async (kind: string, name: string) => {
      if (!graph) return;
      const id = `${kind.slice(0, 4).toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
      const node = blankNode(id, kind, name || id);
      const statement = `MERGE (a:${kind} {id: '${escapeCypher(id)}'}) SET a.name = '${escapeCypher(node.name)}'`;
      if (connected) await writeStatements([statement], true);
      else {
        setGraph({ ...graph, nodes: [...graph.nodes, node] });
        setPositions((current) => ({ ...current, [id]: { x: 24, y: 24 } }));
        log("MEMORY", statement, 0);
      }
      setSelection({ kind: "node", id });
    },
    [connected, graph, log, writeStatements],
  );

  const addEdge = useCallback(
    async (source: string, target: string) => {
      if (!graph || source === target) return;
      const now = graph.incident;
      const edge = makeEdge(source, target, "DEPENDS_ON", now);
      const statement = `MATCH (a {id: '${escapeCypher(source)}'}), (b {id: '${escapeCypher(target)}'}) MERGE (a)-[r:DEPENDS_ON]->(b) SET r.t_valid_from = ${now}, r.t_valid_to = 9999999999, r.t_tx_created = ${now}, r.t_tx_superseded = 9999999999`;
      if (connected) await writeStatements([statement], true);
      else {
        setGraph({ ...graph, edges: [...graph.edges, edge] });
        log("MEMORY", statement, 0);
      }
    },
    [connected, graph, log, writeStatements],
  );

  const updateEdge = useCallback(
    async (id: string, patch: Partial<GraphEdge>) => {
      if (!graph) return;
      const edge = graph.edges.find((item) => item.id === id);
      if (!edge) return;
      const next = { ...edge, ...patch };
      setGraph({ ...graph, edges: graph.edges.map((item) => (item.id === id ? next : item)) });
      if (!connected) return;
      const sets: string[] = [];
      if (patch.p99_latency_ms !== undefined && patch.p99_latency_ms !== null) sets.push(`r.p99_latency_ms = ${patch.p99_latency_ms}`);
      if (patch.pheromone_weight !== undefined && patch.pheromone_weight !== null) sets.push(`r.weight = ${patch.pheromone_weight}`);
      if (!sets.length) return;
      const where = edge.t_tx_created !== null ? ` WHERE r.t_tx_created = ${edge.t_tx_created}` : "";
      await runCypher(
        graph.graph,
        `MATCH (a {id: '${escapeCypher(edge.source)}'})-[r:${edge.type}]->(b {id: '${escapeCypher(edge.target)}'})${where} SET ${sets.join(", ")}`,
      );
    },
    [connected, graph],
  );

  const supersede = useCallback(
    async (edgeId: string) => {
      if (!graph) return;
      const edge = graph.edges.find((item) => item.id === edgeId);
      if (!edge || edge.t_tx_created === null) {
        setError("This edge has no transaction stamp to supersede.");
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const close = `MATCH (a {id: '${escapeCypher(edge.source)}'})-[r:${edge.type}]->(b {id: '${escapeCypher(edge.target)}'}) WHERE r.t_tx_created = ${edge.t_tx_created} SET r.t_valid_to = ${now}, r.t_tx_superseded = ${now}`;
      const open = `MATCH (a {id: '${escapeCypher(edge.source)}'}), (b {id: '${escapeCypher(edge.target)}'}) MERGE (a)-[r:${edge.type}]->(b) SET r.t_valid_from = ${now}, r.t_valid_to = 9999999999, r.t_tx_created = ${now}, r.t_tx_superseded = 9999999999, r.p99_latency_ms = ${edge.p99_latency_ms ?? 0}`;
      await writeStatements([close, open], true);
    },
    [graph, writeStatements],
  );

  const attachDeadEnd = useCallback(
    async (actionId: string, reason: string, penalty: number) => {
      if (!graph || !focusId) {
        setError("Dead-end needs an alert target in the graph.");
        return;
      }
      const now = graph.incident;
      const statement = `MATCH (s {id: '${escapeCypher(focusId)}'}), (a {id: '${escapeCypher(actionId)}'}) MERGE (s)-[d:DEAD_END]->(a) SET d.penalty = ${penalty}, d.failure_reason = '${escapeCypher(reason)}', d.verified_by = 'OPERATOR', d.ttl_epoch = ${now + 172800}`;
      await writeStatements([statement], true);
    },
    [focusId, graph, writeStatements],
  );

  const publishHive = useCallback(
    async (actionType: string, failureMode: string) => {
      if (!graph || !focusId) return;
      if (connected) {
        const motifs = await publishMotif(graph.tenant, focusId, actionType, failureMode);
        setHive(motifs);
        log("HIVE", `publish ${actionType}`, 0);
        return;
      }
      const motif = await computeWeisfeilerLehmanHash(graph, focusId, 2, actionType);
      setHive((current) => [
        { wl_hash: motif.hash, action_type: actionType, failure_mode: failureMode, hit_count: 1, canonical_signature: motif.canonical },
        ...current,
      ]);
      log("HIVE", `local motif ${motif.hash}`, 0);
    },
    [connected, focusId, graph, log],
  );

  const submitCypher = useCallback(
    async (statement: string) => {
      if (!graph) return;
      const started = performance.now();
      if (connected) {
        const result = await runCypher(graph.graph, statement);
        log("REPL", statement, Math.round(performance.now() - started), `${result.count} rows`);
        await recomputeRicci(graph.tenant).catch(() => undefined);
        setGraph(await loadGraph(graph.tenant));
      } else {
        setGraph(applyMemory(graph, [statement]));
        log("REPL", statement, Math.round(performance.now() - started));
      }
    },
    [connected, graph, log],
  );

  const createNamed = useCallback(
    async (tenant: string) => {
      const clean = tenant.trim();
      if (!clean) return;
      if (connected) {
        await createTenant(clean);
        await openGraph(clean);
      } else {
        const next = emptyGraph(`memory_${clean}`, clean);
        setGraph(next);
        setAt(next.incident);
        setCompare(next.baseline);
        setMemoryOnly(true);
        setPositions({});
      }
    },
    [connected, openGraph],
  );

  const branches = useMemo(() => {
    if (!graph) return [];
    return previewBranches(graph, scores, focusId, chaos);
  }, [chaos, focusId, graph, scores]);

  return {
    health,
    connected,
    graph,
    hive,
    at,
    compare,
    lens,
    selection,
    logs,
    agents,
    busy,
    error,
    chaos,
    scores,
    hashes,
    positions,
    compilerOpen,
    cypherOpen,
    serverNote,
    alertId,
    focusId,
    branches,
    setAt,
    setCompare,
    setLens,
    setSelection,
    setChaos,
    setCompilerOpen,
    setCypherOpen,
    setPositions,
    openGraph,
    ingest,
    execute,
    commitBranch,
    surgery,
    updateNode,
    updateEdge,
    addNode,
    addEdge,
    supersede,
    attachDeadEnd,
    publishHive,
    submitCypher,
    createNamed,
    moveNode: (id: string, point: Point) => setPositions((current) => ({ ...current, [id]: point })),
  };
}

export type Session = ReturnType<typeof useWorkstation>;

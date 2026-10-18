"use client";

import { useMemo, useState } from "react";
import BiTemporalScrubber from "./components/BiTemporalScrubber";
import ForceGraphLenses, { type GraphLink, type GraphNode, type Lens } from "./components/ForceGraphLenses";
import NemesisBattleArena from "./components/NemesisBattleArena";
import SwarmSSEFeed, { type SwarmEvent } from "./components/SwarmSSEFeed";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type Snapshot = {
  nodes: GraphNode[];
  links: GraphLink[];
  baseline: number;
  incident: number;
  at_time: number;
};

type DiffRow = {
  source_name?: string;
  edge_type?: string;
  target_name?: string;
  temporal_mutation_class?: string;
};

type Branch = {
  action_id: string;
  action_name: string;
  action_type: string;
  ucb_score: number;
  survival: number;
  oncall_covered: boolean;
  kappa_after?: number | null;
  shields?: { blocked?: boolean };
};

type HiveMotif = {
  wl_hash: string;
  action_type: string;
  failure_mode: string;
  hit_count: number;
  canonical_signature?: string;
};

const LENSES: { id: Lens; label: string }[] = [
  { id: "pheromone", label: "Pheromone / dead-end" },
  { id: "ricci", label: "Curvature" },
  { id: "conway", label: "Conway ghosts" },
  { id: "hive", label: "Hive motifs" },
];

export default function Page() {
  const [tenant, setTenant] = useState("org_acme");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [lens, setLens] = useState<Lens>("ricci");
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [proof, setProof] = useState<string[]>([]);
  const [diff, setDiff] = useState<DiffRow[]>([]);
  const [hive, setHive] = useState<HiveMotif[]>([]);
  const [atTime, setAtTime] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const baseline = snapshot?.baseline || 0;
  const incident = snapshot?.incident || 0;

  async function seed() {
    setBusy("seeding");
    setError("");
    try {
      const response = await fetch(`${API}/api/v2/seed`, { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      setEvents([]);
      setBranches([]);
      setSkipped([]);
      setWinner(null);
      setProof([]);
      await Promise.all([loadGraph(0, "org_acme"), loadDiff(), loadHive()]);
      setTenant("org_acme");
    } catch (err) {
      setError(err instanceof Error ? err.message : "seed failed");
    } finally {
      setBusy("");
    }
  }

  async function loadGraph(when = 0, nextTenant = tenant) {
    const query = when ? `?tenant=${nextTenant}&at_time=${when}` : `?tenant=${nextTenant}`;
    const response = await fetch(`${API}/api/v2/graph${query}`);
    if (!response.ok) throw new Error(await response.text());
    const body = (await response.json()) as Snapshot;
    setSnapshot(body);
    setAtTime(body.at_time);
  }

  async function loadDiff() {
    const response = await fetch(`${API}/api/v2/temporal-diff?tenant=org_acme`);
    if (!response.ok) return;
    const body = await response.json();
    setDiff(body.rows || []);
  }

  async function loadHive() {
    const response = await fetch(`${API}/api/v2/hivemind`);
    if (!response.ok) return;
    const body = await response.json();
    setHive(body.motifs || []);
  }

  async function scrub(value: number) {
    setAtTime(value);
    try {
      await loadGraph(value, tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "scrub failed");
    }
  }

  async function run() {
    setBusy("swarm");
    setError("");
    setEvents([]);
    try {
      const response = await fetch(
        `${API}/api/v2/swarm/simulate?tenant=${tenant}&alert_id=${tenant === "org_finserv" ? "alert_441" : "alert_991"}`,
        { method: "POST" },
      );
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const seen: SwarmEvent[] = [];
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as SwarmEvent;
          if (event.kind === "done") {
            const detail = event.detail || {};
            setBranches((detail.branches as Branch[]) || []);
            setSkipped((detail.skipped as string[]) || []);
            const won = detail.winner as { action_id?: string } | null;
            setWinner(won?.action_id || null);
            setProof(proofLines((detail.proof as { kind: string; [key: string]: unknown }[]) || []));
          } else {
            seen.push(event);
            setEvents([...seen]);
          }
        }
      }
      await Promise.all([loadGraph(0, tenant), loadDiff(), loadHive()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "swarm failed");
    } finally {
      setBusy("");
    }
  }

  const highlight = useMemo(() => {
    if (tenant === "org_finserv") return "svc_pan";
    return "svc_token";
  }, [tenant]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-[#2c3128] px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#d6ff4a]">Kriose</p>
          <h1 className="text-lg font-medium">Token-Vault incident</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-mono text-[11px] text-[#8d9284]" htmlFor="tenant">
            Tenant
          </label>
          <select
            id="tenant"
            value={tenant}
            onChange={(event) => {
              const next = event.target.value;
              setTenant(next);
              loadGraph(0, next).catch((err) => setError(String(err)));
            }}
            className="border border-[#2c3128] bg-[#141712] px-2 py-1 text-sm"
          >
            <option value="org_acme">org_acme</option>
            <option value="org_finserv">org_finserv</option>
          </select>
          <button className="border border-[#2c3128] px-3 py-1 text-sm" onClick={seed} disabled={busy !== ""}>
            {busy === "seeding" ? "Seeding…" : "Seed demo"}
          </button>
          <button className="bg-[#d6ff4a] px-3 py-1 text-sm text-[#10120f]" onClick={run} disabled={busy !== ""}>
            {busy === "swarm" ? "Running…" : "Run swarm"}
          </button>
        </div>
      </header>

      {error && <p className="border-b border-[#e07a4a] px-4 py-2 font-mono text-xs text-[#e07a4a]">{error}</p>}

      <section className="grid min-h-0 flex-1 grid-cols-[280px_1fr_300px]">
        <aside className="min-h-0 border-r border-[#2c3128] p-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8d9284]">Swarm feed</p>
          <SwarmSSEFeed events={events} />
        </aside>
        <div className="relative min-h-0">
          {snapshot ? (
            <ForceGraphLenses nodes={snapshot.nodes} links={snapshot.links} lens={lens} highlight={highlight} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[#8d9284]">Seed the demo to load the graph.</div>
          )}
          <div className="absolute left-3 top-3 flex gap-1">
            {LENSES.map((item) => (
              <button
                key={item.id}
                onClick={() => setLens(item.id)}
                className="border px-2 py-1 font-mono text-[10px]"
                style={{
                  borderColor: lens === item.id ? "#d6ff4a" : "#2c3128",
                  color: lens === item.id ? "#d6ff4a" : "#c8c4b6",
                  background: "#141712cc",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {lens === "hive" && (
            <div className="absolute bottom-3 right-3 w-72 border border-[#2c3128] bg-[#10120fcc] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d6ff4a]">Hive motifs</p>
              <ul className="mt-2 space-y-2 font-mono text-[11px]">
                {hive.map((motif) => (
                  <li key={`${motif.wl_hash}-${motif.action_type}`}>
                    <span className="text-[#d6ff4a]">{motif.wl_hash}</span>
                    <span className="text-[#8d9284]"> {motif.action_type}</span>
                    <span className="block text-[#c8c4b6]">{motif.failure_mode}</span>
                  </li>
                ))}
                {hive.length === 0 && <li className="text-[#8d9284]">No motifs yet.</li>}
              </ul>
            </div>
          )}
        </div>
        <aside className="min-h-0 border-l border-[#2c3128] p-3">
          <NemesisBattleArena branches={branches} winner={winner} skipped={skipped} />
        </aside>
      </section>

      <footer className="grid grid-cols-[1fr_1.2fr] gap-4 border-t border-[#2c3128] px-4 py-3">
        <BiTemporalScrubber
          baseline={baseline}
          incident={incident || baseline}
          atTime={atTime || incident}
          onChange={scrub}
          rows={diff}
        />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8d9284]">Why this action</p>
          <ul className="mt-2 max-h-28 overflow-auto font-mono text-[11px] leading-4 text-[#e7e4d8]">
            {proof.length === 0 && <li className="text-[#8d9284]">The proof path appears after a run.</li>}
            {proof.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </footer>
    </main>
  );
}

function proofLines(proof: { kind: string; [key: string]: unknown }[]): string[] {
  const lines: string[] = [];
  for (const item of proof) {
    if (item.kind === "bridge" && item.edge) {
      const edge = item.edge as { upstream?: string; downstream?: string; kappa?: number; regime?: string };
      lines.push(`Bridge ${edge.upstream} → ${edge.downstream}: κ ${Number(edge.kappa).toFixed(3)} ${edge.regime}`);
    }
    if (item.kind === "conway_ghosts") {
      for (const row of (item.rows as { owner_a?: string; owner_b?: string; upstream?: string; downstream?: string; hop?: number }[]) || []) {
        lines.push(`Ghost (${row.hop}-hop) ${row.upstream} → ${row.downstream}: ${row.owner_a} and ${row.owner_b} have no recent conversation`);
      }
    }
    if (item.kind === "ucb") {
      for (const row of (item.rows as { action_name?: string; ucb_score?: number; dark_penalty?: number; hive_penalty?: number; hive_hash?: string; expand?: boolean }[]) || []) {
        lines.push(
          `${row.expand ? "Fork" : "Hold"} ${row.action_name}: UCB ${row.ucb_score}, dark ${row.dark_penalty}, hive ${row.hive_penalty} (${row.hive_hash})`,
        );
      }
    }
    if (item.kind === "branch") {
      const failed = (item.failed_shields as string[]) || [];
      lines.push(
        `${item.action_name}: survival ${item.survival}${failed.length ? `, failed ${failed.join(" ")}` : ", shields clear"}${
          item.kappa_after != null ? `, κ ${Number(item.kappa_after).toFixed(3)}` : ""
        }`,
      );
    }
    if (item.kind === "decision") {
      const shields = item.shields as Record<string, { violations?: number }> | null;
      lines.push(`Arbiter committed ${item.winner || "nothing"}. Episode ${item.episode_id || "—"}.`);
      if (shields) {
        for (const [name, payload] of Object.entries(shields)) {
          if (payload && typeof payload === "object" && "violations" in payload) {
            lines.push(`${name}: ${payload.violations} violations`);
          }
        }
      }
    }
  }
  return lines;
}

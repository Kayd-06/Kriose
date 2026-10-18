# Kriose

Kriose is an incident agent whose context is a FalkorDB graph. Four agents share state by reading and writing edges. The only handles they pass are graph names produced by `GRAPH.COPY`.

The shipped incident is one saturated service, Token-Vault. Three runbook actions sit on the graph. The swarm copies the graph, applies each candidate, shocks the copy, and merges the only future that survives.

FalkorDB is required. With the database down, `GET /api/v2/health` stays up and reports `ok: false`. Seed, snapshot, diff, curvature, simulate, and hive calls return 503. The workstation then runs in memory and does not invent the demo graph.

## Incident

`POST /api/v2/seed` loads two tenants, the compiler fixtures, and the hive.

| Graph | Tenant | Alert | Focus |
|---|---|---|---|
| `kriose_org_acme` | `org_acme` | `alert_991` | `svc_token` (Token-Vault-Cache), load 92 / capacity 100 |
| `kriose_org_finserv` | `org_finserv` | `alert_441` | `svc_pan` (PAN-Vault) |

Acme's live path is Public-API-Gateway → ZeroTrust-JWT-Guard → Checkout-Orchestrator → Payment-Core → Token-Vault-Cache → Ledger-Audit-Stream. Token-Replica-Standby is attached with `HAS_FALLBACK`. A seeded Acme snapshot is 21 nodes.

`POST /api/v2/swarm/simulate?tenant=org_acme&alert_id=alert_991` decides:

| Action | Edge state before the fork | Result |
|---|---|---|
| `act_restart` (`RESTART`) | Pheromone 0.35 / n=1. `DEAD_END` penalty 0.95, verified by `PROD`, reason "Triggered cold-cache OOM stampede in Session #38". | Not copied. Dark penalty is at least 0.9. The same anonymized restart motif is already in the hive. |
| `act_throttle` (`THROTTLE`) | Pheromone 0.62 / n=3. | Copied. Shock multiplies Token-Vault load by 1.35 (92 → 124.2), which is over capacity. `INV-SPOF` vetoes the branch. A `DEAD_END` is written and the motif is published. |
| `act_failover` (`REROUTE_AND_HEAL`) | Pheromone 0.89 / n=8. | Copied. Heal sets Token-Vault load to 30 and the standby to 60, then adds Payment → standby (`is_fallback`), Fraud → Token, Fraud → standby, and Checkout → standby. Shock leaves Token-Vault at 40.5, under capacity. Shields pass. Survival is 1.0. Arbiter merges this mutation onto the primary graph and writes an `EpisodicMemory` node. |

The Payment → Token curvature moves from **-1.0** to **-0.416666666666667**. A second simulate skips both `act_restart` and `act_throttle` and merges failover again, so the tenant graph holds at least two episodic nodes.

Finserv is the same topology with different identifiers (Noah, Mia, Owen, `alert_441`). Its restart motif hashes to the same value as Acme. The hive graph stores that hash and the action type. It does not store tenant names, engineer names, or service names.

Measured hive hashes, SHA-256 truncated to 16 hex characters:

| Action | Hash | Failure mode stored on the first publish |
|---|---|---|
| `RESTART` | `9fece2ae4ca6d730` | cold-cache OOM stampede |
| `THROTTLE` | `2ce6c43e9d81cdca` | Nemesis shock broke INV-SPOF |

The canonical signature of the two tenants matches. The hashes differ because `action_type` is part of the hashed string.

## Graph model

Structural edges carry four clocks: `t_valid_from`, `t_valid_to`, `t_tx_created`, `t_tx_superseded`. An open edge uses `t_valid_to = 9999999999`. Edges are closed and recreated. Properties on a live edge are not overwritten in place to fake history.

The baseline clock is `now - 3 days`. The incident clock is `now`. Both live on `(:Meta {id: 'clock'})`.

### Node labels

| Label | Role |
|---|---|
| `Ingress` | Public entry. `exposure: 'public'`. |
| `AuthMiddleware` | JWT guard on the path into PII services. |
| `Service` | `tier`, `current_load`, `max_capacity`, `pii_classified`, `min_ricci_kappa`. |
| `Engineer` | `oncall_available`. Linked to services by `OWNS`. |
| `Alert` | The incident the swarm ranks actions against. |
| `RunbookAction` | `action_type` is `RESTART`, `THROTTLE`, or `REROUTE_AND_HEAL`. `execution_cost` is 4, 2, or 1 on Acme. |
| `EpisodicMemory` | One node per accepted merge. `REMEMBERS` the action and is `ABOUT` the alert. |
| `CodeSymbol` | Functions taken from `backend/fixtures/repo/vault.py`. |
| `TopologyMap` | Role ids (`token`, `payment`, `standby`, owners) the swarm reads. Hidden from the snapshot. |
| `Meta` | The bi-temporal clock. Hidden from the snapshot. |

The hive graph `kriose_global_hive_immunology` holds `(:TopologicalMotif)-[:GLOBAL_DEAD_END]->(:AbstractAction)`.

### Relationship types

| Type | Meaning |
|---|---|
| `DEPENDS_ON` | Call edge. `p99_latency_ms`, `call_weight`, `is_fallback`, `ricci_curvature`, and the four clocks. |
| `HAS_FALLBACK` | Payment points at the standby before any heal. |
| `OWNS` | Engineer owns a service. `ownership_score`, `is_primary_oncall`. |
| `COMMUNICATED_WITH` | Observed owner contact. Acme has Arjun ↔ Liam, count 19. Elena has none. |
| `TRIGGERED_ON` | Alert to the saturated service. |
| `PHEROMONE_TRACE` | Alert to a runbook action. `weight`, `success_count`, `evaporation_rate` 0.05, `last_updated`. |
| `DEAD_END` | Service to a runbook action. `penalty` 0.95, `failure_reason`, `verified_by` (`PROD` or `NEMESIS`), `ttl_epoch` (incident + 2 days). |
| `SILENT_COLLISION_RISK` | Conway ghost. Written between services whose owners have no `COMMUNICATED_WITH` edge. `hop` is 1 or 2. This is not a `DEPENDS_ON`. |
| `REMEMBERS`, `ABOUT` | Episode to the chosen action and to the alert. |
| `SUPERSEDES` | Slack note against RFC-409, with `drift_detected`. |

Acme ghosts: Liam (Payment) × Elena (Token) at 1 hop, and Arjun (Checkout) × Elena at 2 hops. Arjun and Liam are not a ghost.

### Temporal classes

`GET /api/v2/temporal-diff?tenant=org_acme` classifies edges whose valid interval or transaction time crosses the baseline:

| Class | Rule on this query |
|---|---|
| `INVALIDATED_OR_REMOVED` | `t_valid_to` falls at or before the incident. Fraud → Legacy-Token-Cache. |
| `LATE_DISCOVERED_DRIFT` | `t_tx_created` is more than one hour after `t_valid_from`. Fraud → Ledger. |
| `NEWLY_INTRODUCED_DEPENDENCY` | Valid-from sits between baseline and incident, and neither of the above applies. |

## Computations

These are the functions the API and the workstation both implement. The browser copy lives in `frontend/src/lib/graphMathEngine.ts`. Publish-to-hive while FalkorDB is connected stores the Python hash from `engine.motif_hash`.

### UCB score

For each `RunbookAction` attached to the alert:

```text
decay        = e^(-0.05 * seconds_since_last_update / 86400)
exploration  = 1.414 * pheromone * decay * sqrt(total_success_count) / (1 + success_count)
ucb          = pheromone + exploration - dark_penalty - hive_penalty - 0.15 * execution_cost
```

`hive_penalty` is 0.40 when the hive already holds this motif, otherwise 0. The branch is copied only when `dark_penalty < 0.9`. A non-positive score is marked pruned in the workstation.

### Discrete curvature

Active `DEPENDS_ON` edges only (`t_valid_to > now`). Neighbors are matched undirected.

```text
κ = |N(u) ∩ N(v)| / deg(u) + |N(u) ∩ N(v)| / deg(v) - 1
```

If either degree is 1 or less, κ is -0.25. The value is written to `DEPENDS_ON.ricci_curvature`, and each service stores the minimum incident κ on `min_ricci_kappa`.

Regimes: below -0.50 is `CRITICAL_HYPERBOLIC_BOTTLENECK`, below 0 is `FRAGILE_BRIDGE`, otherwise `RESILIENT_POSITIVELY_CURVED_CLUSTER`.

Surgery is one triadic closure, then a recompute. On Acme that closure is the heal above. There is no Wasserstein solver and no iterative flow toward a target κ.

### Nemesis shock

Applied only on the depth-2 copy:

- Token-Vault `current_load` × 1.35. Other tier-1 services are left alone.
- Every active `DEPENDS_ON` with `p99_latency_ms > 100` gains 180 ms.
- The primary on-call engineer of the token service is set `oncall_available = false`.

Survival of a shocked copy:

| Condition | Survival |
|---|---|
| Any shield count is above zero | 0 |
| Shields pass and the standby owner is still on call | 1.0 |
| Shields pass and nobody on call covers the token service | 0.75 |

The winner is the expanded action with the highest survival, ties broken by UCB. Arbiter replays that action's mutation on the primary graph. The shocked copy is deleted and is not merged.

`REROUTE_AND_HEAL` is a structural edit, so `notifies_owners` is true and `INV-CONWAY-QUORUM` does not fire. `THROTTLE` is not structural.

### Hive motif

1. Take the 2-hop undirected service ego-graph around the focus.
2. Replace each service id with `Service | tier | degree bucket | kappa bucket`.
3. Degree buckets: `d1` (≤1), `d2to3` (≤3), `d4plus`.
4. Kappa buckets: `kna`, `khyper` (< -0.5), `kfrag` (< 0), `kres`.
5. Two Weisfeiler-Lehman rounds. Each round is SHA-256 of `label|sorted neighbor labels`, hex, first 12 characters.
6. The stored hash is SHA-256 of the sorted round-2 labels plus `|action_type`, hex, first 16 characters.

This is an anonymity hash for cross-tenant lookup. It is not a cryptographic proof.

### Shields

All four run as Cypher counts on the shocked copy. One violation blocks the merge.

| Shield | Fires when |
|---|---|
| `INV-SPOF` | A tier-1 service has `current_load > max_capacity`. |
| `INV-RICCI` | The new minimum tier-1 κ is below -0.65 and is strictly below the pre-mutation minimum. |
| `INV-PII-ZERO-TRUST` | A public `Ingress` reaches a `pii_classified` service in 1 to 6 `DEPENDS_ON` hops with no `AuthMiddleware` on the path. FalkorDB rejects `shortestPath` inside `MATCH`, so the check is a variable-length path with `NONE`. |
| `INV-CONWAY-QUORUM` | The edit is structural, `SILENT_COLLISION_RISK` edges exist, and the action did not notify owners. |

### PageRank

Scout calls `CALL algo.pageRank` when the server accepts the procedure and writes `pagerank_score` when that write succeeds. The workstation draws its own PageRank (damping 0.85, 25 iterations) from the loaded snapshot, so the badge is present even when the procedure is unavailable.

### Compiler

`compiler.ingest` runs as part of the Acme seed:

- `backend/fixtures/repo/vault.py` through tree-sitter when the grammar imports, otherwise `ast`. TypeScript and Go files are parsed only if those grammar wheels import. They are not in `backend/requirements.txt`, so a normal install skips them.
- `backend/fixtures/otel/spans.json` updates load and p99 on the services the spans name.
- `backend/fixtures/org/rfc-409.md` and `slack.json` are a deterministic extractor. The Slack note that contradicts the RFC is stored as `SUPERSEDES` with `drift_detected`.
- GraphRAG-SDK is imported only when `OPENAI_API_KEY` is set. The demo does not need it.

The workstation compiler (`neuroSymbolicCompiler.ts`) is a separate path for operator ingest: Compose YAML, topology JSON, or a parametric scale-free draft. Those drafts use generated ids (`n00`, `e00`, `a00`). They are not the Acme seed.

## Control loop

`swarm.simulate` always runs depth 2.

1. **Scout** recomputes curvature, ghosts, PageRank, and the blast radius, then ranks actions with the UCB formula.
2. **ShadowArchitect** skips actions with `dark_penalty >= 0.9`. Each other action is `GRAPH.COPY` to `shadow_<session>_d1_<action>`, and the mutation is applied there.
3. **Nemesis** copies that graph again to `shadow_<session>_d2_<action>`, applies the shock, runs the four shields, and scores survival. A veto writes `DEAD_END` on the primary and publishes the motif.
4. **Arbiter** applies the winning mutation on the primary, reruns the shields, writes `EpisodicMemory`, and bumps the pheromone. Shadow graphs are deleted in `finally`.

Each event is `{agent, kind, t_ms, detail}`. `t_ms` is milliseconds since `simulate` started, stamped when the event is appended. The HTTP handler then emits the finished list as server-sent events, plus a final `kind: done` frame with the summary. The stream is one chunk after the run, with distinct `t_ms` values inside it.

## HTTP API

Base path `/api/v2`. CORS is open. Graph names and tenant ids must be alphanumeric plus `_` and `-`.

| Method | Path | Body or query | Result |
|---|---|---|---|
| `GET` | `/health` | | `{ok, graphs}`. HTTP 200 even when FalkorDB is down. |
| `POST` | `/seed` | `tenant` empty, `demo`, `org_acme`, or `org_finserv` | Full demo, or one tenant. Acme also ingests fixtures. |
| `GET` | `/graph` | `tenant` or `graph`, optional `at_time`, `all_time=1` | Snapshot. `all_time=1` keeps edges that valid-time would hide, which the scrubber needs. Default tenant is `org_acme`. |
| `POST` | `/graphs` | `{tenant}` | Creates `kriose_<tenant>` and a `Meta` clock. |
| `POST` | `/cypher` | `{graph, cypher}` | Runs the query. Falkor errors are HTTP 400. |
| `GET` | `/temporal-diff` | `tenant`, optional `t1`, `t2` | Rows with `temporal_mutation_class`. Defaults come from `Meta`. |
| `GET` | `/ricci-map` | `tenant` | Writes κ and returns every active `DEPENDS_ON`. |
| `POST` | `/swarm/simulate` | `tenant`, `alert_id` | SSE. Default alert is `alert_991`. |
| `POST` | `/swarm/stream` | same | Alias of simulate. |
| `GET` | `/hivemind` | | Motifs in `kriose_global_hive_immunology`. |
| `POST` | `/hivemind/sync` | `tenant`, `action_type` | Publishes that tenant's token-service motif. |
| `POST` | `/hivemind/publish` | `tenant`, `focus_id`, `action_type`, `failure_mode` | Publishes an explicit motif. |

`GET /graph` returns nodes with `id, kind, name, tier, current_load, max_capacity, pii_classified, min_ricci_kappa, oncall_available, severity, title, action_type, doc_type, function_name, execution_cost, exposure`, and links with curvature, p99, pheromone weight, success count, dark penalty, risk, fallback, owners, verifier, failure reason, the four clocks, and `ttl_epoch`. Memory edges (`PHEROMONE_TRACE`, `DEAD_END`, `REMEMBERS`, `ABOUT`, `TRIGGERED_ON`, `SILENT_COLLISION_RISK`) are included when the requested time is at or after the incident, because those edges have no valid-time.

## MCP

`python backend/mcp_server.py` serves the same operations over FastMCP stdio.

| Tool | Calls |
|---|---|
| `mcp_seed_demo` | `reset_demo` |
| `mcp_get_4d_graph` | `snapshot` |
| `mcp_4d_time_travel_diff` | `temporal_diff` |
| `mcp_compute_ricci_curvature` | `compute_ricci`, and lists edges with κ < -0.50 |
| `mcp_run_mcgts_nemesis` | `simulate` |
| `mcp_sync_zk_hivemind` | `publish_failure_motif` for the named tenant |

The tool name keeps the `zk` prefix from the spec. The function publishes the Weisfeiler-Lehman hash described above.

## Workstation

Next.js page at `frontend/src/app/page.tsx`. It mounts one full-viewport surface.

| Zone | Module | What it shows |
|---|---|---|
| Top bar | `InstrumentBar` | Falkor vs memory, graph picker, node and edge counts, minimum κ, ghost count, dead-end count, pheromone count, shield tally. |
| Left, 400px | `SwarmRack` | Scout, ShadowArchitect, Nemesis, Arbiter, with the MCP tool name each one calls. |
| Center | `SchematicCanvas` | CAD modules, 172×60. Wheel zooms toward the cursor. Middle-click or holding Space pans. Drag a module. Drag an output pin to an input pin to create `DEPENDS_ON`. Double-click empty canvas to add a node. |
| Right, 340px | `Inspector` | Editable load, capacity, p99, and pheromone. Property edits update local math immediately and `SET` on Falkor when connected, on blur, without reloading on each keystroke. |
| Bottom, 220px | `McGtsDock` | UCB table and three shock sliders. |
| Footer | `TimeRuler` | Valid-time scrub from baseline toward the incident. The snapshot is loaded with `all_time=1` so invalidated edges remain available. |

Lenses, keys `1`–`4`:

1. Stigmergy and blast radius.
2. Curvature. Edge color follows κ. Surgery chord on `R`.
3. Conway ghosts, drawn off the dependency plane.
4. Weisfeiler-Lehman hashes.

Other keys, ignored while an input is focused: `Ctrl+I` or `Cmd+I` opens the compiler, `Ctrl+K` or `Cmd+K` opens the Cypher console, `R` runs one local surgery, a Space tap shorter than 220 ms executes the swarm. A longer Space hold is pan and does not execute.

The dock sliders (retry-storm load factor, tail-latency delta, on-call outage) recompute a **local** preview. `EXECUTE` against Falkor calls `POST /api/v2/swarm/simulate`, which uses the fixed shock (×1.35, +180 ms, primary on-call down) and commits the winner itself. `COMMIT` writes the preview Cypher. Running both applies the heal twice. The dock states that the server shock does not follow the sliders.

Empty Falkor, or Falkor down, shows `MEMORY` and the line `NO GRAPH LOADED · [I] INGEST OR [+ NEW]`. The session auto-opens the first `kriose_*` graph that is not the hive once health is ok. A graph built in memory is kept if Falkor appears later. Opening a server graph from the picker clears that memory graph.

Offline Cypher accepts a subset: `MERGE` a node and `SET`, `MATCH` a node and `SET`, `MATCH` two nodes and `MERGE` a relationship, and supersede by `t_tx_created`. Arbitrary Cypher runs only when Falkor is connected.

## Run

Docker Desktop has to be running. FalkorDB listens on 6379, and its browser is on port 3000.

```powershell
docker compose up --build
```

| Process | URL |
|---|---|
| API | http://localhost:8000 |
| Workstation | http://localhost:3001 |
| FalkorDB Browser | http://localhost:3000 |

Seed, then open the workstation. It polls health every 5 seconds and loads the first tenant graph.

```powershell
curl.exe -X POST http://localhost:8000/api/v2/seed
curl.exe -N -X POST "http://localhost:8000/api/v2/swarm/simulate?tenant=org_acme&alert_id=alert_991"
```

The `done` event's `detail.winner.action_id` is `act_failover` and `detail.winner.survival` is `1.0`.

API and workstation against a Falkor container you already started:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
$env:FALKORDB_HOST = "localhost"
.\.venv\Scripts\python -m uvicorn main:app --app-dir backend --port 8000
```

The engine connects to FalkorDB in its constructor. Start uvicorn only after `redis-cli` answers `PONG` on port 6379. A refused connection crashes the process on import.

```powershell
cd frontend
npm install
npm run dev
```

`NEXT_PUBLIC_API_BASE` (origin, as in Compose) and `NEXT_PUBLIC_API_URL` (full `/api/v2` prefix) both work. The default is `http://localhost:8000/api/v2`.

Tests need FalkorDB on port 6379:

```powershell
.\.venv\Scripts\python -m pytest backend\tests -q
```

MCP:

```powershell
.\.venv\Scripts\python backend\mcp_server.py
```

## Repository

```text
backend/engine.py          seed, curvature, time, ghosts, hive, shields, shock, snapshot
backend/swarm.py           Scout, ShadowArchitect, Nemesis, Arbiter
backend/compiler.py        vault.py, spans, RFC-409, Slack
backend/main.py            HTTP and SSE
backend/mcp_server.py      FastMCP tools
backend/fixtures/          synthetic repo, spans, RFC, Slack
backend/tests/             incident outcome
frontend/src/lib/          browser math, in-memory Cypher, fixture compiler, layout
frontend/src/services/     API client
frontend/src/components/   workstation
PRD_&_ARCHITECTURE.md      product spec
BLOG.md                    incident write-up
```

`BLOG.md` narrates this incident. The screen it calls the command page is the workstation above. Seed and simulate are the API calls in [Run](#run).

## Tracks

One incident is entered in all three tracks.

- **Agents That Act on Connected Data.** The agent forks futures with `GRAPH.COPY`, shocks them, and commits failover because the graph says restart is a dead end and throttle breaks tier-1 capacity.
- **Agent Memory and Coordination.** `PHEROMONE_TRACE`, `DEAD_END`, `EpisodicMemory`, and the hive motif are what the next session reads. The second simulate skips both vetoed actions.
- **Company Brain.** Ownership, `COMMUNICATED_WITH`, and `SILENT_COLLISION_RISK` are the org model. RFC-409 and the contradicting Slack note are stored on the same graph.

## Bounds

Search depth is 2. The shock multipliers are the constants above, not a budget fit from episodic variance. Curvature is the shared-neighbor formula, recomputed once after a single triadic edit. The hive key is the truncated SHA-256 of the anonymized labels. TypeScript and Go grammars, live Slack, and GraphRAG are outside the default install. The workstation's in-memory Cypher is the subset listed above.

This repository was written with an AI coding assistant. The graph model, the queries, and the incident numbers above were checked against a running FalkorDB.

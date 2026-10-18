# Kriose

An incident agent whose context is a FalkorDB graph. The demo is one outage: Token-Vault's connection pool is full. Three runbook actions exist. The swarm copies the graph, shocks each candidate, and keeps the only future that survives.

FalkorDB is the context layer. Agents do not pass transcripts. They read and write edges.

## What the demo decides

Tenant `org_acme`. Public ingress goes through JWT auth into Checkout, Payment-Core, and Token-Vault.

| Action | What the graph does with it |
|---|---|
| Hard restart | Not forked. A `DEAD_END` from session 38 is already on the edge, and the same anonymized motif is in the hive graph. |
| Throttle Payment-Core 30% | Forked. Nemesis multiplies Token-Vault load by 1.35. Tier-1 capacity breaks. The branch is vetoed and a new `DEAD_END` is written. |
| Fail over to Token-Replica-Standby and close the bridge | Forked. Survives the shock, raises the bridge curvature from **-1.0 to -0.417**, passes the four Cypher shields, and is merged. |

Run the same alert again. Restart is still not forked. The new episode is a second `EpisodicMemory` node.

## Run it

Docker Desktop has to be running.

```powershell
docker compose up --build
```

API on [http://localhost:8000](http://localhost:8000). Command page on [http://localhost:3001](http://localhost:3001). FalkorDB Browser on [http://localhost:3000](http://localhost:3000).

Open the command page, choose **Seed demo**, then **Run swarm**. The proof drawer lists the bridge, the Conway ghosts, the UCB scores, the veto, and the shield counts.

Local API against a FalkorDB you already started:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt
$env:FALKORDB_HOST = "localhost"
.\.venv\Scripts\python -m uvicorn main:app --app-dir backend --port 8000
```

In another shell, from `frontend`:

```powershell
npm install
npm run dev
```

Tests, with FalkorDB on port 6379:

```powershell
.\.venv\Scripts\python -m pytest backend\tests -q
```

MCP tools (stdio):

```powershell
.\.venv\Scripts\python backend\mcp_server.py
```

`POST /api/v2/seed` loads both tenants, the compiler fixtures, and the hive motif. `POST /api/v2/swarm/simulate?tenant=org_acme&alert_id=alert_991` streams the four agents as server-sent events.

## What each name means

| Name in the UI | What the code computes |
|---|---|
| MC-GTS | Depth 2. Each node is a FalkorDB graph from `graph.copy()`. The child is chosen with the UCB terms in the PRD, read off edge properties. |
| Discrete curvature | Shared-neighbor bound written onto `DEPENDS_ON.ricci_curvature`. Surgery adds one triadic set of edges and recomputes. On this incident the Payment → Token edge moves from -1.0 to -0.417. |
| Nemesis | On each depth-1 copy: Token-Vault load × 1.35, +180 ms on edges already over 100 ms, primary on-call marked down. The winner is the max survival across those shocks. |
| 4D time | `t_valid_from`, `t_valid_to`, `t_tx_created`, `t_tx_superseded` on structural edges. The diff query returns `INVALIDATED_OR_REMOVED` and `LATE_DISCOVERED_DRIFT`. |
| Hive-mind | Two Weisfeiler-Lehman rounds on the anonymized 2-hop service ego-graph, then the action type, then SHA-256. The Acme and Finserv restart motifs both hash to `9fece2ae4ca6d730`. The hive graph stores that hash, not names. |
| Compiler | Tree-sitter (or the stdlib `ast` module) on `backend/fixtures/repo/vault.py`, plus the OpenTelemetry span file, RFC-409, and the Slack thread. No API key required. |
| Shields | Four Cypher checks. A failing count blocks the merge. The UI shows the query name and the count. |

`CALL algo.pageRank` runs inside Scout when the server accepts the procedure. `DEPENDS_ON` paths are the blast radius and the PII shield.

## Tracks

One incident covers the three tracks.

- **Track 01.** The agent forks futures, shocks them, and commits failover because the graph says the other two fail.
- **Track 02.** Pheromone edges, dead-end edges, episodic nodes, and the hive motif are how the next session remembers.
- **Track 03.** Elena owns Token-Vault, Liam owns Payment-Core, they have no `COMMUNICATED_WITH` edge, and that dependency is a Conway ghost. Arjun and Elena are the 2-hop ghost through Checkout. RFC-409 governs the vault. A Slack note contradicts it and is stored as `SUPERSEDES` with `drift_detected`.

## Layout

```text
backend/engine.py        graph, curvature, time, hive, shields
backend/swarm.py         Scout, ShadowArchitect, Nemesis, Arbiter
backend/compiler.py      code, spans, RFC, Slack
backend/mcp_server.py    FastMCP tools
backend/main.py          HTTP and SSE
frontend/                command page
```

The product spec is `PRD_&_ARCHITECTURE.md`. The write-up of this incident is `BLOG.md`.

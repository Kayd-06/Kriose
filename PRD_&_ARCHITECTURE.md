# KRIOSE v2.0 — Master Product Requirements Document (PRD) & Unicorn Architecture Specification

| Document Control | Specification Details |
| :--- | :--- |
| **Product Name** | **Kriose v2.0** (*Autonomous 4D Counterfactual Graph OS & Stigmergic Swarm Engine*) |
| **Version** | `v2.0.0-UNICORN` (Unconstrained Flagship Architecture) |
| **Hackathon Event** | WeMakeDevs × FalkorDB — *Graph Hacks: Context for AI Agents* |
| **Target Tracks** | **Track 01** (*Connected Data Action*) + **Track 02** (*Agent Memory & Coordination*) + **Track 03** (*Company Brain*) + **Bonus** (*Best Technical Blog Post*) |
| **Primary Engine** | **FalkorDB** (In-Memory Sparse-Matrix Property Graph, Sub-ms `GRAPH.COPY`, Multigraph Tenancy, Cypher, Algorithms, FastMCP) |
| **7 Core Innovations** | 1. Monte Carlo Graph Tree Search (`MC-GTS`) via `GRAPH.COPY`<br>2. Discrete Ollivier-Ricci Graph Curvature ($\kappa$) Bottleneck Surgery<br>3. `Nemesis` Adversarial Red-Team Chaos Agent (Stackelberg Min-Max Game)<br>4. 4D Bi-Temporal Graph Engine (*Valid Time* × *Transaction Time*)<br>5. Zero-Knowledge Federated "Hive-Mind" Stigmergy (Weisfeiler-Lehman Motif Hashing)<br>6. Live Neuro-Symbolic Graph Compiler (*Tree-sitter AST + OpenTelemetry + Slack/RFC*)<br>7. Deterministic Cypher Invariant Safety Shields |

---

## 1. Executive Summary & Architectural Paradigm Shift

### 1.1 Why First-Generation Graph Agents Fail
Even when teams replace flat Vector RAG with a graph database, 99% of agent architectures still treat the graph as a **passive, read-only encyclopedia**. They fail in production due to five structural blind spots:
1. **Single-Step Myopia:** Agents query the current state and execute an action without looking ahead 2 to 4 steps to see how retry storms, cache evictions, or human handoffs cascade across time.
2. **Sycophantic Multi-Agent Consensus:** Cooperative agent swarms rubber-stamp each other's plans instead of stress-testing whether a proposed fix survives realistic adversarial shocks.
3. **Topological Blindness to Hourglass Bridges:** Standard centrality metrics (`PageRank`, degree centrality) highlight high-degree hubs but completely miss **hyperbolic bottlenecks**—low-degree bridge edges connecting two massive clusters that snap under load.
4. **Temporal Amnesia:** Overwriting graph edges destroys historical context, making it impossible to answer: *"What did the agent know at 02:14 AM on Tuesday versus what was actually true in production?"*
5. **Isolated Silos of Failure:** In multi-tenant deployments, when Tenant A suffers a catastrophic failure caused by a specific microservice or organizational topology, Tenant B remains vulnerable to the exact same structural trap.

### 1.2 The Kriose v2.0 Solution
**Kriose v2.0** transforms **FalkorDB** into an **Autonomous 4D World Simulator, Differential Geometry Bottleneck Analyzer, and Zero-Knowledge Federated Immune System**. Instead of agents chatting via bloated LLM transcripts, a four-agent swarm (**Scout**, **ShadowArchitect**, **Nemesis**, and **Arbiter**) coordinates exclusively through FalkorDB's sparse-matrix memory at sub-millisecond speeds.

### 1.3 Evolution Matrix: Standard GraphRAG vs. Kriose v1.0 vs. Kriose v2.0

| Architectural Dimension | Standard GraphRAG | Kriose v1.0 (24h MVP) | **Kriose v2.0 (Unicorn Flagship)** |
| :--- | :--- | :--- | :--- |
| **World Modeling** | None (Read-only lookup) | 1-Step Flat Shadow Clones (3 branches) | **Monte Carlo Graph Tree Search (MC-GTS)** over depth-$D$ forked FalkorDB timelines |
| **Swarm Dynamics** | Sequential LLM chat chains | 3 Cooperative Agents | **Adversarial Swarm + `Nemesis` Red-Team Agent** (Min-Max Game-Theoretic Rollouts) |
| **Topological Math** | Cosine similarity + 1-hop match | `PageRank` + `shortestPath` | **Discrete Ollivier-Ricci Curvature ($\kappa$)** + Automated Ricci Flow Surgery |
| **Temporal Dimension** | Static overwrite (3D) | Point-in-time episodic nodes | **4D Bi-Temporal Graph Engine** ($T_{\text{valid}} \times T_{\text{tx}}$) + Causal Drift Diffing |
| **Multi-Tenant Memory** | Single shared or isolated DB | Isolated tenant graphs | **Zero-Knowledge Federated "Hive-Mind" Stigmergy** via Weisfeiler-Lehman Motif Hashing |
| **Data Ingestion** | Manual JSON/CSV upload | Synthetic Python seed script | **Live Neuro-Symbolic Compiler** (`Tree-sitter` AST + `OpenTelemetry` + `GraphRAG-SDK`) |
| **Execution Safety** | Prompt-based guardrails | Scalar survival score check | **Deterministic Cypher Invariant Shields** (Formal Topological Verification) |

### 1.4 Triple-Track Hackathon Alignment

| Hackathon Track | Prize Target | How **Kriose v2.0** Dominates the Track Criteria |
| :--- | :--- | :--- |
| **Track 01: Agents That Act on Connected Data** | iPhone 18 Pro | Uses multi-depth `MC-GTS` tree search via `GRAPH.COPY`, Ollivier-Ricci curvature $\kappa$, `PageRank`, and `shortestPath` exposed as **FastMCP tools**, backed by formal Cypher Invariant Safety Shields. |
| **Track 02: Agent Memory & Coordination** | PS5 + GTA VI | Replaces inter-agent chat bloat with **Stigmergic Pheromone Trails**, repulsive `[:DEAD_END]` Dark Edges (verified by `Nemesis`), and **Zero-Knowledge Cross-Tenant Hive-Mind Immunology**. |
| **Track 03: Company Brain** | M6 Mac Mini | Unifies AST code symbols, microservices, engineers, Slack threads, and RFCs in a **4D Bi-Temporal Graph**, detecting **Conway's Ghost Edges** (`[:SILENT_COLLISION_RISK]`) and temporal decision drift. |

---

## 2. Deep-Dive Technical Specifications: The 7 Frontier Pillars

### 2.1 Pillar 1: Monte Carlo Graph Tree Search (MC-GTS)
Rather than evaluating a single mutation, **Kriose v2.0** formulates incident remediation and organizational planning as a **Markov Decision Process (MDP) over Graph Topologies** $(\mathcal{G}, \mathcal{A}, \mathcal{T}, \mathcal{R})$.
* **State Space ($\mathcal{G}$):** Each state $G_t \in \mathcal{G}$ is a complete, isolated FalkorDB graph instance created via in-memory sparse-matrix cloning (`GRAPH.COPY`).
* **Action Space ($\mathcal{A}$):** Parameterized Cypher graph transformations (e.g., rerouting service dependencies, draining connection pools, reverting an AST commit subgraph, closing a triadic fallback loop).
* **UCB-Graph Selection Policy:** At tree depth $d$, the **ShadowArchitect** selects the child branch $(G_t, a)$ that maximizes the **Stigmergic Upper Confidence Bound**:

$$\text{UCB}_{\text{Graph}}(G_t, a) = \tilde{Q}(G_t, a) + c_{\text{puct}} \cdot \left( P_{\text{pheromone}}(G_t, a) \cdot e^{-\lambda \Delta t} \right) \cdot \frac{\sqrt{\sum_{b} N(G_t, b)}}{1 + N(G_t, a)} - \sum_{k} \Omega_{\text{DarkEdge}}(G_t, a_k) - \Psi_{\text{Hive}}(h_{\text{WL}}(G_t, a))$$

Where:
* $\tilde{Q}(G_t, a) \in [0, 1]$ is the mean normalized survival score backpropagated from downstream rollouts.
* $P_{\text{pheromone}}(G_t, a)$ is read directly from `[:PHEROMONE_TRACE]` edges in FalkorDB.
* $\Omega_{\text{DarkEdge}}$ is the repulsive penalty from local `[:DEAD_END]` anti-memory edges.
* $\Psi_{\text{Hive}}$ is the global failure risk queried from the Zero-Knowledge Cross-Tenant Immunology graph using the 2-hop Weisfeiler-Lehman hash $h_{\text{WL}}(G_t, a)$.

---

### 2.2 Pillar 2: Discrete Ollivier-Ricci Graph Curvature ($\kappa$) & Ricci Flow Surgery
Standard graph algorithms cannot distinguish between a resilient mesh and a fragile hourglass bridge. **Kriose v2.0** introduces **Applied Differential Geometry** on FalkorDB graphs:

#### Mathematical Formulation
For any dependency edge $e = (u, v)$ in FalkorDB, let $\mu_u$ and $\mu_v$ denote uniform probability distributions over the 1-hop neighborhoods $\mathcal{N}(u)$ and $\mathcal{N}(v)$. The **Ollivier-Ricci Curvature** $\kappa(u, v)$ is defined as:

$$\kappa(u, v) = 1 - \frac{W_1(\mu_u, \mu_v)}{d(u, v)}$$

where $W_1(\mu_u, \mu_v)$ is the **Wasserstein-1 (Earth Mover's) Distance**. For sub-millisecond execution inside Cypher, Kriose computes the **Jost-Liu / Jaccard Discrete Curvature Bound**:

$$\hat{\kappa}(u, v) = \frac{\vert{}\mathcal{N}(u) \cap \mathcal{N}(v)\vert{}}{\deg(u)} + \frac{\vert{}\mathcal{N}(u) \cap \mathcal{N}(v)\vert{}}{\deg(v)} - 1.0$$

#### Physical Interpretation & Automated Ricci Flow Surgery
* **Positive Curvature ($\kappa(u, v) > +0.15$):** Spherical geometry. Nodes $u$ and $v$ share abundant triangles ($\mathcal{N}(u) \cap \mathcal{N}(v)$ is large). Traffic or knowledge flows effortlessly around any single node failure.
* **Flat Curvature ($\kappa(u, v) \approx 0$):** Grid-like Euclidean topology.
* **Strongly Negative Curvature ($\kappa(u, v) < -0.50$):** Hyperbolic hourglass bridge. Two dense clusters of microservices (or engineering teams) depend entirely on edge $(u, v)$ with zero shared neighbors.
* **Autonomous Ricci Surgery:** When Kriose detects $\kappa(u, v) < -0.50$, it automatically synthesizes a **Triadic Closure Proposal** (e.g., adding a read-through cache fallback edge between $\mathcal{N}(u)$ and $\mathcal{N}(v)$, or scheduling a cross-team architecture sync) that raises $\kappa(u, v)$ above $-0.10$.

---

### 2.3 Pillar 3: The `Nemesis` Adversarial Red-Team Agent
To eliminate LLM hallucination and optimistic bias, **Kriose v2.0** pits the **ShadowArchitect** against **Nemesis** in a two-player **Zero-Sum Stackelberg Min-Max Game**:

$$a^* = \arg\max_{a \in \mathcal{A}_{\text{Architect}}} \min_{\delta \in \Delta_{\text{Nemesis}}(B)} S\Big( \text{Mutate}\big(\text{Mutate}(G_0, a), \delta\big) \Big)$$

* **How Nemesis Operates:**
  1. Given a Depth-1 shadow graph $G_1 = \text{Mutate}(G_0, a)$ produced by `ShadowArchitect`, `Nemesis` forks a Depth-2 shadow graph $G_2 = G_1.\text{copy}()$ in FalkorDB.
  2. Constrained by a realistic **Chaos Budget $B$** (calibrated from historical `(:EpisodicMemory)` variance), `Nemesis` injects up to three adversarial perturbations $\delta$:
     * **Traffic Perturbation:** 1.35x retry storm on upstream ingress nodes.
     * **Latency Perturbation:** +180ms tail latency spike on cross-region database edges.
     * **Socio-Technical Perturbation:** Marks the primary on-call engineer node as `oncall_available: false` to verify whether secondary owners have sufficient context.
  3. If $G_2$ violates any Tier-1 capacity constraint or Cypher Invariant Shield, `Nemesis` **vetoes** branch $a$ and writes a `[:DEAD_END {verified_by: "NEMESIS_CHAOS_PROSECUTOR"}]` edge directly into the primary graph.

---

### 2.4 Pillar 4: 4D Bi-Temporal Property Graph Engine
Every node and relationship in **Kriose v2.0** exists in **Four-Dimensional Space-Time** $(V, E, T_{\text{valid}}, T_{\text{tx}})$:
1. **Valid Time Interval $[t_{\text{valid\_from}}, t_{\text{valid\_to}})$:** When the relationship was actually true in the real world (e.g., when `Commit #904` was active in production, or when `RFC-409` governed `Token-Vault-Cache`).
2. **Transaction Time Interval $[t_{\text{tx\_created}}, t_{\text{tx\_superseded}})$:** When the agent swarm recorded or superseded that fact in FalkorDB.

* **Why Bi-Temporality Is a Game-Changer:**
  * **Retroactive Root-Cause Analysis:** Allows querying the graph *as it was known to the agent at $t_1$* versus *what we later learned was true at $t_1$*.
  * **Zero-Destructive Updates:** Edges are never overwritten; superseding an edge closes its $t_{\text{tx\_superseded}}$ timestamp and spawns a new temporal version edge, turning FalkorDB into an immutable **Temporal Ledger of Organizational Truth**.

---

### 2.5 Pillar 5: Zero-Knowledge Federated "Hive-Mind" Stigmergy
FalkorDB natively hosts thousands of isolated graphs in a single process. **Kriose v2.0** uses this multigraph architecture to create a **Privacy-Preserving Cross-Tenant Immune System**:
1. **Private Tenant Graphs (`kriose_tenant_acme`, `kriose_tenant_finserv`):** Contain sensitive service names, engineer handles, code ASTs, and proprietary RFCs.
2. **Topological Anonymizer (Weisfeiler-Lehman Subgraph Hash):** Whenever an action fails in Tenant A, Kriose extracts the 2-hop ego-graph around the failure, strips all string identifiers, replaces nodes with canonical structural vectors `(node_type, tier, degree_bucket, ricci_curvature_bucket)`, runs 2 iterations of **Weisfeiler-Lehman (WL) Graph Isomorphism relabeling**, and hashes the canonical form via `SHA-256`.
3. **Global Immunology Graph (`kriose_global_hive_immunology`):** Stores only `(:TopologicalMotif {wl_hash})-[:GLOBAL_DEAD_END {failure_class, confidence, hit_count}]->(:AbstractAction)`.
4. **Instant Cross-Company Immunity:** When Tenant B's **Scout Agent** evaluates a candidate action, it computes the local WL motif hash in less than 1 millisecond and checks `kriose_global_hive_immunology`—inheriting failure wisdom from every other organization on the platform with **zero PII or proprietary data leakage**.

---

### 2.6 Pillar 6: Live Neuro-Symbolic Graph Compiler
Kriose v2.0 eliminates manual graph creation via a real-time **3-Stream Ingestion Pipeline**:
* **Stream A — Code AST Compiler (`Tree-sitter`):** Parses Python, TypeScript, and Go repositories into `(:Repository) -> (:File) -> (:CodeSymbol) -> [:CALLS_AST] -> (:Database)` nodes and edges, tagging each symbol with cyclomatic complexity and git blame ownership.
* **Stream B — Telemetry Stream (`OpenTelemetry` Receiver):** Ingests live span traces and Prometheus metrics, dynamically updating `edge.p99_latency_ms`, `edge.error_rate`, and `node.current_load` in FalkorDB.
* **Stream C — Organizational Brain Compiler (`GraphRAG-SDK`):** Extracts structured entities and semantic relationships (`[:SUPERSEDES]`, `[:CONTRADICTS]`, `[:GOVERNED_BY]`) from Slack channels, Linear/Jira tickets, and Markdown RFCs.

---

### 2.7 Pillar 7: Deterministic Cypher Invariant Shields
No AI agent action can reach production without passing **Formal Topological Verification**. Before the **Arbiter Agent** commits a winning shadow graph $G^*$, FalkorDB executes four mandatory **Cypher Invariant Shield** queries on $G^*$. If any query returns a violation count greater than 0, execution is hard-blocked at the database layer:
* **Shield 1 (`INV-SPOF`):** No Tier-1 service may exceed `max_capacity` or lack a healthy fallback replica.
* **Shield 2 (`INV-RICCI`):** No mutation may reduce the minimum Ollivier-Ricci curvature $\min_{e} \kappa(e)$ of the Tier-1 subgraph below $-0.65$.
* **Shield 3 (`INV-PII-ZERO-TRUST`):** No path may exist from a public `(:Ingress)` node to a `(:Service {pii_classified: true})` node that bypasses an `(:AuthMiddleware)` node.
* **Shield 4 (`INV-CONWAY-QUORUM`):** Any mutation affecting services connected by an active `[:SILENT_COLLISION_RISK]` Ghost Edge requires automated dual-owner notification before merge.

---

## 3. High-Level Design (HLD) & 6-Layer System Architecture

### 3.1 System Topology Diagram

```text
+=========================================================================================+
| LAYER 1: "GOD-MODE" NEXT.JS 15 COMMAND CENTER UI (4 INTERACTIVE VISUAL LENSES)          |
|  [Lens 1: Pheromone/Dark-Edge] [Lens 2: Ricci Curvature Heatmap] [Lens 3: Conway 2-Tier]|
|  [Lens 4: 4D Bi-Temporal Time Scrubber]   [MC-GTS vs. Nemesis Chaos Battle Arena]       |
+============================================|============================================+
                                             | REST API + Server-Sent Events (SSE Stream)
+============================================v============================================+
| LAYER 2: FASTAPI STREAMING GATEWAY & TENANT CONTEXT ROUTER                              |
|  - Sub-ms Multigraph Context Switcher   - Real-Time Telemetry & Subgraph Diff Streamer  |
+============================================|============================================+
                                             | Model Context Protocol (FastMCP Server)
+============================================v============================================+
| LAYER 3: ADVERSARIAL & STIGMERGIC 4-AGENT SWARM (COORDINATED EXCLUSIVELY VIA GRAPH)     |
|  +------------------+  +---------------------+  +------------------+  +---------------+ |
|  | 1. SCOUT AGENT   |  | 2. SHADOW ARCHITECT |  | 3. NEMESIS AGENT |  | 4. ARBITER    | |
|  | 4D Blast Radius, |  | MC-GTS Tree Forking |  | Red-Team Chaos   |  | Runs Cypher   | |
|  | Ricci Bottleneck |  | via GRAPH.COPY;     |  | Prosecutor;      |  | Safety Shields| |
|  | Scan, Conway     |  | UCB-Graph Selection |  | Injects 1.35x    |  | Merges Winner | |
|  | Ghost Detection  |  | with Pheromones     |  | Adversarial Shock|  | & Syncs ZK    | |
|  +------------------+  +---------------------+  +------------------+  +---------------+ |
+============================================|============================================+
                                             | Official FalkorDB Client (Redis RESP 6379)
+============================================v============================================+
| LAYER 4: FALKORDB IN-MEMORY MULTIGRAPH & SPARSE-MATRIX ENGINE                           |
|  +---------------------------+  +--------------------------+  +-----------------------+ |
|  | 4D Primary Tenant Graphs  |  | Ephemeral MC-GTS Tree    |  | ZK Global Hive-Mind   | |
|  | - kriose_tenant_acme      |  | - shadow_d1_branch_0..2  |  | - kriose_global_hive  | |
|  | - kriose_tenant_finserv   |  | - shadow_d2_nemesis_0..2 |  | - WL Motif Hashes     | |
|  +---------------------------+  +--------------------------+  +-----------------------+ |
+============================================^============================================+
                                             | Continuous Cypher Upserts
+============================================|============================================+
| LAYER 5: LIVE NEURO-SYMBOLIC GRAPH COMPILER (3-STREAM INGESTION PIPELINE)               |
|  [Tree-sitter AST Code Parser]  [OpenTelemetry Span/Metric Sink]  [GraphRAG Slack/RFC]  |
+=========================================================================================+
```

---

## 4. Complete 4D Property Graph Schema

### 4.1 Node Labels & Properties (13 Node Types)

| Node Label | Primary Properties | Domain Layer |
| :--- | :--- | :--- |
| `(:Service)` | `id`, `name`, `tier` (1–3), `current_load`, `max_capacity`, `error_rate`, `pagerank_score`, `min_ricci_kappa`, `pii_classified` (bool) | Infrastructure (Track 01) |
| `(:CodeSymbol)` | `id`, `file_path`, `function_name`, `ast_hash`, `cyclomatic_complexity`, `lines_of_code` | Neuro-Symbolic AST (Track 01) |
| `(:Database)` | `id`, `name`, `engine`, `pii_classified` (bool), `connection_pool_max`, `active_connections` | Infrastructure (Track 01) |
| `(:Ingress)` | `id`, `route`, `exposure` (`public`, `internal`), `rate_limit_rps` | Security Shield (Track 01) |
| `(:AuthMiddleware)` | `id`, `name`, `jwt_enforced` (bool), `mfa_required` (bool) | Security Shield (Track 01) |
| `(:Engineer)` | `id`, `name`, `slack_handle`, `role`, `timezone`, `oncall_available` (bool) | Company Brain (Track 03) |
| `(:Team)` | `id`, `name`, `department`, `slack_channel` | Company Brain (Track 03) |
| `(:Commit)` | `hash`, `message`, `author_id`, `t_valid_from`, `pr_number` | Company Brain (Track 01/03) |
| `(:DecisionDoc)` | `id`, `title`, `doc_type` (`RFC`, `SlackThread`, `ADR`), `summary`, `source_url`, `t_valid_from`, `t_valid_to` | Company Brain (Track 03) |
| `(:Alert)` | `id`, `title`, `severity`, `metric_name`, `threshold_value`, `observed_value`, `active` (bool) | Incident Context (Track 01) |
| `(:RunbookAction)` | `id`, `name`, `action_type` (`REROUTE`, `ROLLBACK`, `SCALE_POOL`, `INJECT_CACHE`), `cypher_template`, `execution_cost` | Agent Action (Track 01/02) |
| `(:EpisodicMemory)` | `id`, `session_id`, `alert_id`, `chosen_action_id`, `nemesis_shock_survived` (bool), `survival_score`, `t_tx_created` | Agent Memory (Track 02) |
| `(:TopologicalMotif)` | `wl_hash` (SHA-256 16-char), `canonical_signature`, `hit_count`, `last_seen_epoch` | ZK Hive-Mind (Track 02) |

### 4.2 Edge Types & 4D Bi-Temporal / Stigmergic Properties (11 Relationship Types)

All structural edges carry standard 4D bi-temporal attributes: `t_valid_from` (int epoch), `t_valid_to` (int epoch or `9999999999` for active), `t_tx_created` (int epoch), and `t_tx_superseded` (int epoch or `9999999999`).

| Relationship Type | Source -> Target | Specialized Properties | Purpose |
| :--- | :--- | :--- | :--- |
| `[:DEPENDS_ON]` | `(:Service) -> (:Service \| :Database)` | `p99_latency_ms`, `call_weight`, `ricci_curvature` ($\kappa$), `is_fallback` (bool) | Infra topology & Ricci curvature |
| `[:DEFINED_IN]` | `(:CodeSymbol) -> (:Service)` | `module_name`, `t_valid_from`, `t_valid_to` | AST code-to-service link |
| `[:CALLS_AST]` | `(:CodeSymbol) -> (:CodeSymbol)` | `call_frequency`, `is_async` (bool) | Function-level call graph |
| `[:OWNS]` | `(:Engineer) -> (:Service \| :CodeSymbol)` | `ownership_score` (0.0–1.0), `is_primary_oncall` (bool) | Socio-technical ownership |
| `[:COMMUNICATED_WITH]` | `(:Engineer) -> (:Engineer)` | `interaction_count_14d`, `last_contact_epoch`, `channels` | Human collaboration graph |
| `[:GOVERNED_BY]` | `(:Service) -> (:DecisionDoc)` | `compliance_required` (bool), `t_valid_from`, `t_valid_to` | Decision provenance |
| `[:SUPERSEDES]` | `(:DecisionDoc) -> (:DecisionDoc)` | `reason`, `drift_detected` (bool), `timestamp` | Organizational decision drift |
| `[:PHEROMONE_TRACE]` | `(:Alert) -> (:RunbookAction)` | `weight` (0.0–1.0), `evaporation_rate` ($\lambda$), `success_count`, `last_updated` | Positive Stigmergic Memory |
| `[:DEAD_END]` | `(:Service) -> (:RunbookAction)` | `penalty` (0.0–1.0), `failure_reason`, `verified_by` (`NEMESIS` \| `PROD`), `ttl_epoch` | Repulsive Anti-Memory |
| `[:SILENT_COLLISION_RISK]` | `(:Service) -> (:Service)` | `risk_score`, `owner_a`, `owner_b`, `ricci_bridge_penalty` | Conway's Ghost Edge |
| `[:GLOBAL_DEAD_END]` | `(:TopologicalMotif) -> (:AbstractAction)` | `failure_mode`, `confidence` (0.0–1.0), `tenant_confirmations` | ZK Cross-Tenant Immunology |

---

## 5. Production Cypher Query Suite (FalkorDB Engine)

### 5.1 Query 1: 4D Bi-Temporal Time-Travel & Causal Drift Diff
```cypher
// 4D Bi-Temporal Subgraph Diff between Baseline (t1) and Incident (t2)
MATCH (u)-[r]->(v)
WHERE (r.t_valid_from > $t_baseline AND r.t_valid_from <= $t_incident)
   OR (r.t_valid_to > $t_baseline AND r.t_valid_to <= $t_incident)
   OR (r.t_tx_created > $t_baseline AND r.t_tx_created <= $t_incident)
RETURN labels(u)[0] AS source_type, u.name AS source_name,
       type(r) AS edge_type,
       labels(v)[0] AS target_type, v.name AS target_name,
       r.t_valid_from AS valid_from, r.t_valid_to AS valid_to,
       r.t_tx_created AS recorded_at,
       CASE
         WHEN r.t_valid_to <= $t_incident THEN 'INVALIDATED_OR_REMOVED'
         WHEN r.t_tx_created > r.t_valid_from + 3600 THEN 'LATE_DISCOVERED_DRIFT'
         ELSE 'NEWLY_INTRODUCED_DEPENDENCY'
       END AS temporal_mutation_class
ORDER BY r.t_valid_from DESC
```

### 5.2 Query 2: Discrete Ollivier-Ricci Curvature ($\kappa$) & Bottleneck Surgery Advisor
```cypher
MATCH (u:Service)-[e:DEPENDS_ON]->(v:Service)
WHERE e.t_valid_to > $now
OPTIONAL MATCH (u)-[:DEPENDS_ON]-(nu:Service)
OPTIONAL MATCH (v)-[:DEPENDS_ON]-(nv:Service)
WITH u, v, e,
     collect(DISTINCT nu.id) AS neigh_u,
     collect(DISTINCT nv.id) AS neigh_v
WITH u, v, e, neigh_u, neigh_v,
     [x IN neigh_u WHERE x IN neigh_v] AS shared_triangles
WITH u, v, e,
     size(neigh_u) AS deg_u,
     size(neigh_v) AS deg_v,
     size(shared_triangles) AS tri_count
WITH u, v, e, deg_u, deg_v, tri_count,
     CASE
       WHEN deg_u <= 1 OR deg_v <= 1 THEN -0.25
       ELSE (toFloat(tri_count) / toFloat(deg_u)) + (toFloat(tri_count) / toFloat(deg_v)) - 1.0
     END AS kappa
SET e.ricci_curvature = round(kappa, 3)
RETURN u.name AS upstream_service,
       v.name AS downstream_service,
       round(kappa, 3) AS ollivier_ricci_kappa,
       tri_count AS shared_redundant_triangles,
       CASE
         WHEN kappa < -0.50 THEN 'CRITICAL_HYPERBOLIC_BOTTLENECK'
         WHEN kappa < 0.00  THEN 'FRAGILE_BRIDGE'
         ELSE 'RESILIENT_POSITIVELY_CURVED_CLUSTER'
       END AS geometric_regime
ORDER BY ollivier_ricci_kappa ASC
```

### 5.3 Query 3: Stigmergic UCB-Graph Action Ranking with Dark Edge Repulsion
```cypher
MATCH (a:Alert {id: $alert_id})-[:TRIGGERED_ON]->(s:Service)
MATCH (act:RunbookAction)
OPTIONAL MATCH (a)-[pher:PHEROMONE_TRACE]->(act)
OPTIONAL MATCH (s)-[dead:DEAD_END]->(act)
WHERE dead IS NULL OR dead.ttl_epoch > $now
WITH s, act,
     coalesce(pher.weight, 0.45) AS p_weight,
     coalesce(pher.success_count, 1) AS n_visits,
     coalesce(dead.penalty, 0.0) AS dark_penalty,
     dead.failure_reason AS blocked_reason,
     dead.verified_by AS blocked_by
WITH s, act, p_weight, n_visits, dark_penalty, blocked_reason, blocked_by,
     (p_weight + 1.414 * p_weight * (sqrt(10.0) / (1.0 + toFloat(n_visits))))
     - dark_penalty
     - (0.15 * toFloat(act.execution_cost)) AS ucb_graph_score
RETURN act.id AS action_id,
       act.name AS action_name,
       act.action_type AS action_type,
       act.cypher_template AS cypher_mutation,
       round(ucb_graph_score, 3) AS ucb_score,
       round(p_weight, 3) AS pheromone_weight,
       round(dark_penalty, 3) AS dark_edge_penalty,
       blocked_reason,
       blocked_by
ORDER BY ucb_score DESC
```

### 5.4 Query 4: Conway's Ghost Edge Detector (Socio-Technical Structural Holes)
```cypher
MATCH (engA:Engineer)-[:OWNS]->(svcA:Service)-[:DEPENDS_ON]->(svcB:Service)<-[:OWNS]-(engB:Engineer)
WHERE engA.id <> engB.id
  AND NOT (engA)-[:COMMUNICATED_WITH]-(engB)
MERGE (svcA)-[ghost:SILENT_COLLISION_RISK]->(svcB)
SET ghost.owner_a = engA.name,
    ghost.owner_b = engB.name,
    ghost.risk_score = 0.89,
    ghost.reason = 'Tight 1-hop service dependency with zero owner communication in 14d'
RETURN svcA.name AS upstream, svcB.name AS downstream, engA.name AS owner_a, engB.name AS owner_b, ghost.risk_score AS risk
```

### 5.5 Query 5: Deterministic Cypher Invariant Safety Shields
```cypher
// SHIELD 1: Zero Tier-1 Capacity Overload After Nemesis 1.35x Chaos Shock
MATCH (s:Service {tier: 1})
WHERE s.current_load > s.max_capacity
RETURN count(s) AS tier1_overload_violations;

// SHIELD 2: Zero Unauthenticated Public Ingress to PII-Classified Service Paths
MATCH path = shortestPath((ing:Ingress {exposure: 'public'})-[:DEPENDS_ON*1..6]->(pii:Service {pii_classified: true}))
WHERE NONE(n IN nodes(path) WHERE 'AuthMiddleware' IN labels(n))
RETURN count(path) AS zero_trust_violations;
```

---

## 6. Multi-Agent Swarm Protocol & FastMCP Server API

### 6.1 The 4 Specialized Agents

| Agent Name | Role in Swarm | FalkorDB Graph Operations | Inter-Agent Communication |
| :--- | :--- | :--- | :--- |
| **1. `Scout`** | 4D Diagnostic & Topological Recon | Runs 4-hop valid-time blast radius, computes Ricci curvature $\kappa$, checks Conway Ghost Edges, and queries local `[:DEAD_END]` + global `[:GLOBAL_DEAD_END]` motifs. | Writes `[:CANDIDATE_FOR]` edges with initial $\text{UCB}_{\text{Graph}}$ weights; zero chat transcript passing. |
| **2. `ShadowArchitect`** | MC-GTS World Forker | Calls `GRAPH.COPY` to spawn Depth-1 candidate timelines; executes parameterized Cypher mutations (`REROUTE`, `SCALE_POOL`, `ROLLBACK`, `INJECT_CACHE`). | Passes ephemeral graph handles (`shadow_d1_k`) via graph registry metadata. |
| **3. `Nemesis`** | Adversarial Red-Team Chaos Prosecutor | Forks Depth-1 graphs into Depth-2 chaos graphs (`shadow_d2_nemesis_k`); injects 1.35x traffic spikes, latency degradation, and owner unavailability shocks. | Marks failed timelines and writes `[:DEAD_END {verified_by: 'NEMESIS'}]` edges on shattered actions. |
| **4. `Arbiter`** | Formal Safety Verifier & Hive Synchronizer | Runs the 4 **Cypher Invariant Shields** on the winning timeline, merges state, writes `(:EpisodicMemory)`, updates `[:PHEROMONE_TRACE]`, and broadcasts WL hashes to `kriose_global_hive_immunology`. | Streams final cryptographic Cypher proof path to the UI via SSE. |

### 6.2 FastAPI & FastMCP Endpoint Matrix

| Method / MCP Tool | Endpoint / Signature | Purpose & Graph Side Effects |
| :--- | :--- | :--- |
| `GET` / `mcp_get_4d_graph` | `/api/v2/graph?tenant={id}&at_time={epoch}` | Returns full 4D valid-time subgraph formatted for `react-force-graph-2d`. |
| `GET` / `mcp_4d_time_travel_diff` | `/api/v2/temporal-diff?tenant={id}&t1={t1}&t2={t2}` | Returns all edges created, invalidated, or late-discovered between `t1` and `t2`. |
| `GET` / `mcp_compute_ricci_curvature` | `/api/v2/ricci-map?tenant={id}` | Computes `e.ricci_curvature` across all edges and returns hyperbolic bottlenecks ($\kappa < -0.50$). |
| `POST` / `mcp_run_mcgts_nemesis` | `/api/v2/swarm/simulate` | Streams SSE events: Scout UCB ranking -> Depth-1 `GRAPH.COPY` forks -> Depth-2 Nemesis shock -> Invariant Shield proof -> Arbiter merge. |
| `POST` / `mcp_sync_zk_hivemind` | `/api/v2/hivemind/sync` | Extracts 2-hop Weisfeiler-Lehman structural hash and upserts `(:TopologicalMotif)-[:GLOBAL_DEAD_END]` in `kriose_global_hive_immunology`. |

---

## 7. Repository Structure & Reference Backend Implementation

### 7.1 Full Project Directory Layout
```text
kriose-v2/
├── docker-compose.yml                  # FalkorDB (6379/3000) + FastAPI (8000) + Next.js (3001)
├── KRIOSE_v2_UNICORN_PRD.md            # Master PRD & Architecture Specification
├── backend/
│   ├── requirements.txt                # fastapi, uvicorn, falkordb, fastmcp, sse-starlette, pydantic
│   ├── main.py                         # FastAPI Gateway + Real-Time SSE Swarm Streamer
│   ├── kriose_v2_engine.py             # Core 4D Graph, Ricci Curvature, MC-GTS, Nemesis & ZK Engine
│   └── mcp_server.py                   # FastMCP Server exposing all 8 Graph Tools
└── frontend/
    ├── package.json                    # next, react-force-graph-2d, framer-motion, lucide-react, tailwindcss
    └── src/app/
        ├── page.tsx                    # God-Mode Split-Screen Command Center
        └── components/
            ├── ForceGraphLenses.tsx    # 4 Visual Lenses (Pheromone, Ricci Heatmap, Conway, ZK Hive)
            ├── NemesisBattleArena.tsx  # Depth-1 vs Depth-2 Adversarial Tree Visualizer
            ├── BiTemporalScrubber.tsx  # 4D Time-Travel Slider & Drift Diff Inspector
            └── SwarmSSEFeed.tsx        # Live Sub-Millisecond Agent Telemetry & Cypher Proof Drawer
```

### 7.2 Complete Core Engine (`backend/kriose_v2_engine.py`)
```python
import hashlib
import time
from typing import Dict, List, Any
from falkordb import FalkorDB


class KrioseUnicornEngine:
    def __init__(self, host: str = "localhost", port: int = 6379):
        self.db = FalkorDB(host=host, port=port)
        self.hive_graph = self.db.select_graph("kriose_global_hive_immunology")

    def seed_4d_enterprise_graph(self, tenant_id: str = "org_acme") -> Dict[str, Any]:
        g = self.db.select_graph(f"kriose_{tenant_id}")
        try:
            g.delete()
        except Exception:
            pass
        g = self.db.select_graph(f"kriose_{tenant_id}")
        now = int(time.time())
        week_ago = now - 604800

        seed_cypher = """
        CREATE (ing:Ingress {id: 'ing_pub', name: 'Public-API-Gateway', exposure: 'public', rate_limit_rps: 5000})
        CREATE (auth:AuthMiddleware {id: 'auth_jwt', name: 'ZeroTrust-JWT-Guard', jwt_enforced: true})
        CREATE (s1:Service {id: 'svc_checkout', name: 'Checkout-Orchestrator', tier: 1, current_load: 72, max_capacity: 100, pagerank_score: 0.34, pii_classified: false})
        CREATE (s2:Service {id: 'svc_payment', name: 'Payment-Core', tier: 1, current_load: 88, max_capacity: 100, pagerank_score: 0.42, pii_classified: true})
        CREATE (s3:Service {id: 'svc_token', name: 'Token-Vault-Cache', tier: 1, current_load: 92, max_capacity: 100, pagerank_score: 0.48, pii_classified: true})
        CREATE (s4:Service {id: 'svc_standby', name: 'Token-Replica-Standby', tier: 1, current_load: 20, max_capacity: 120, pagerank_score: 0.25, pii_classified: true})
        CREATE (s5:Service {id: 'svc_fraud', name: 'Fraud-Scoring-Worker', tier: 2, current_load: 55, max_capacity: 100, pagerank_score: 0.19, pii_classified: false})
        CREATE (s6:Service {id: 'svc_ledger', name: 'Ledger-Audit-Stream', tier: 2, current_load: 48, max_capacity: 100, pagerank_score: 0.16, pii_classified: true})

        CREATE (ing)-[:DEPENDS_ON {p99_latency_ms: 8, t_valid_from: $week_ago, t_valid_to: 9999999999, t_tx_created:$week_ago}]->(auth)
        CREATE (auth)-[:DEPENDS_ON {p99_latency_ms: 12, t_valid_from: $week_ago, t_valid_to: 9999999999, t_tx_created:$week_ago}]->(s1)
        CREATE (s1)-[:DEPENDS_ON {p99_latency_ms: 45, t_valid_from: $week_ago, t_valid_to: 9999999999, t_tx_created:$week_ago}]->(s2)
        CREATE (s5)-[:DEPENDS_ON {p99_latency_ms: 30, t_valid_from: $week_ago, t_valid_to: 9999999999, t_tx_created:$week_ago}]->(s2)
        CREATE (s2)-[:DEPENDS_ON {p99_latency_ms: 190, t_valid_from: $week_ago, t_valid_to: 9999999999, t_tx_created:$week_ago}]->(s3)
        CREATE (s3)-[:DEPENDS_ON {p99_latency_ms: 25, t_valid_from: $week_ago, t_valid_to: 9999999999, t_tx_created:$week_ago}]->(s6)
        CREATE (s2)-[:HAS_FALLBACK {t_valid_from: $week_ago, t_valid_to: 9999999999}]->(s4)

        CREATE (e1:Engineer {id: 'eng_arjun', name: 'Arjun Mehta', role: 'Staff SRE', slack_handle: '@arjun', oncall_available: true})
        CREATE (e2:Engineer {id: 'eng_elena', name: 'Elena Rostova', role: 'Principal Security Eng', slack_handle: '@elena', oncall_available: true})
        CREATE (e3:Engineer {id: 'eng_liam', name: 'Liam Chen', role: 'Payments Lead', slack_handle: '@liam', oncall_available: true})
        CREATE (e1)-[:OWNS {is_primary_oncall: true}]->(s1)
        CREATE (e3)-[:OWNS {is_primary_oncall: true}]->(s2)
        CREATE (e2)-[:OWNS {is_primary_oncall: true}]->(s3)
        CREATE (e1)-[:COMMUNICATED_WITH {interaction_count_14d: 19}]->(e3)

        CREATE (rfc1:DecisionDoc {id: 'rfc_409', title: 'RFC-409: Zero-Trust Token Vault Isolation', doc_type: 'RFC', t_valid_from: $week_ago, t_valid_to: 9999999999})
        CREATE (s3)-[:GOVERNED_BY]->(rfc1)

        CREATE (al:Alert {id: 'alert_991', title: 'Token-Vault Connection Pool Exhaustion & Latency Cascade', severity: 'CRITICAL', active: true})
        CREATE (al)-[:TRIGGERED_ON]->(s3)

        CREATE (act1:RunbookAction {id: 'act_restart', name: 'Hard-Restart Token-Vault Containers', action_type: 'RESTART', execution_cost: 4})
        CREATE (act2:RunbookAction {id: 'act_throttle', name: 'Throttle Payment-Core Upstream 30%', action_type: 'THROTTLE', execution_cost: 2})
        CREATE (act3:RunbookAction {id: 'act_failover', name: 'Reroute Token-Vault Traffic to Standby + Close Triadic Loop', action_type: 'REROUTE_AND_HEAL', execution_cost: 1})

        CREATE (al)-[:PHEROMONE_TRACE {weight: 0.35, success_count: 1}]->(act1)
        CREATE (al)-[:PHEROMONE_TRACE {weight: 0.62, success_count: 3}]->(act2)
        CREATE (al)-[:PHEROMONE_TRACE {weight: 0.89, success_count: 8}]->(act3)
        CREATE (s3)-[:DEAD_END {penalty: 0.95, failure_reason: 'Triggered cold-cache OOM stampede in Session #38', verified_by: 'PROD', ttl_epoch: $future}]->(act1)
        """
        g.query(seed_cypher, {"week_ago": week_ago, "future": now + 172800})
        return {"status": "seeded", "tenant": tenant_id, "timestamp": now}
```
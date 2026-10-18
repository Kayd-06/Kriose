# The restart was already a dead end

Token-Vault is out of connections. Checkout still takes orders. Payment-Core still calls the vault. The on-call runbook has three moves: restart the vault, throttle Payment-Core by 30%, or fail traffic over to the standby replica and add the missing cross edges.

A chat agent will pick the restart. It is the first line of the runbook, and nothing in the prompt says that session 38 already tried it and caused a cold-cache stampede. Kriose never sends that story as text. The story is an edge.

```text
(Token-Vault)-[:DEAD_END {penalty: 0.95, verified_by: 'PROD'}]->(Hard-Restart)
```

Scout reads it, adds the hive penalty, and ShadowArchitect does not call `GRAPH.COPY` for that action. The same anonymized 2-hop shape, hashed with the action type, is already in `kriose_global_hive_immunology` from another tenant. The hash is `9fece2ae4ca6d730`. The hive node has no service names and no engineer names.

## The bridge is not a hub

Payment-Core → Token-Vault has no shared neighbors. The discrete curvature on that edge is -1.0. PageRank would call Payment-Core important because things point at it. Curvature says something else: two clusters meet at a single edge, and there is no triangle to catch the traffic if the edge fails.

The heal action adds the standby into the path and closes triangles through Fraud and Checkout. The same edge recomputes to -0.417. It is still a bridge. It is no longer a single point with zero redundancy.

## The throttle looks fine until the shock

Throttle has a decent pheromone weight, so the UCB score wants to try it. ShadowArchitect copies the tenant graph and applies the 30% cut on Payment-Core. Nemesis copies that copy and does three things at once: Token-Vault load times 1.35, 180 ms added to edges already slower than 100 ms, and Elena marked off on-call.

92 × 1.35 is over the tier-1 capacity. Shield `INV-SPOF` returns a violation. Nemesis writes a `DEAD_END` verified by `NEMESIS` and publishes the throttle motif to the hive. The failover copy takes the same shock after the load has been moved to the standby. Elena is still down. Liam owns the standby and is on call. The four shields return zero violations. Survival is 1.0. Arbiter applies that mutation to the primary graph, writes an `EpisodicMemory` node, and raises the failover pheromone.

The second run of the same alert does not fork restart. The graph already said no.

## The company is in the same graph

Liam owns Payment-Core. Elena owns Token-Vault. There is no `COMMUNICATED_WITH` edge between them in 14 days, and their services depend on each other. That is stored as `SILENT_COLLISION_RISK`. Arjun owns Checkout, two hops upstream of Elena's service, and they do not talk either.

RFC-409 says the vault stays behind the JWT guard. A Slack thread proposes a public route and is stored as a `DecisionDoc` that `SUPERSEDES` the RFC with `drift_detected: true`. The compiler put the RFC there from `fixtures/org/rfc-409.md`, and it put `read_token` and `charge` on the vault from the Tree-sitter parse of `fixtures/repo/vault.py`.

The scrubber is valid time. At the baseline, Fraud still depends on Legacy-Token-Cache. By the incident that edge is closed. A Fraud → Ledger edge was true earlier than the graph recorded it, so the diff marks it `LATE_DISCOVERED_DRIFT`.

## What the names refer to

The curvature number is the shared-neighbor bound, not a Wasserstein distance. The hive key is a Weisfeiler-Lehman hash of structural buckets plus the action type, not a cryptographic proof. The shields are Cypher counts. If a count is greater than zero, the merge does not happen. Those are the mechanisms the demo runs.

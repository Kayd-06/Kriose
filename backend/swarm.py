"""Scout, ShadowArchitect, Nemesis, and Arbiter.

Agents share state by writing edges. The only handles they pass are FalkorDB
graph names created with GRAPH.COPY.
"""

from __future__ import annotations

import time
import uuid

from engine import graph_name


class Swarm:
    def __init__(self, engine):
        self.engine = engine

    def simulate(self, tenant_id: str, alert_id: str, depth: int = 2) -> dict:
        engine = self.engine
        graph = graph_name(tenant_id)
        session = uuid.uuid4().hex[:8]
        roles = engine.roles(graph)
        focus = roles["token"]
        meta = engine.meta(graph)
        now = int(meta.get("incident") or engine.times["now"])
        events: list[dict] = []

        ricci = engine.compute_ricci(graph)
        ghosts = engine.detect_ghosts(graph)
        pagerank = engine.pagerank(graph)
        blast = engine.blast_radius(graph, focus)
        bridge = next(
            (
                row
                for row in ricci
                if row.get("upstream_id") == roles["payment"] and row.get("downstream_id") == focus
            ),
            None,
        )
        events.append(
            {
                "agent": "SCOUT",
                "kind": "finding",
                "detail": {
                    "blast_radius": blast,
                    "bridge": _public_edge(bridge),
                    "ghosts": ghosts,
                    "pagerank": pagerank,
                },
            }
        )

        ranked = engine.rank_actions(graph, alert_id, focus)
        events.append({"agent": "SCOUT", "kind": "rank", "detail": {"actions": ranked}})
        baseline_min = engine.tier1_min_kappa(graph)

        branches: list[dict] = []
        expanded: list[str] = []
        skipped: list[str] = []
        shadows: list[str] = []
        try:
            for action in ranked:
                if not action["expand"]:
                    skipped.append(action["action_id"])
                    events.append(
                        {
                            "agent": "SHADOW_ARCHITECT",
                            "kind": "skip",
                            "detail": {
                                "action_id": action["action_id"],
                                "action_type": action["action_type"],
                                "reason": action.get("blocked_reason") or "dark edge penalty",
                                "verified_by": action.get("blocked_by"),
                                "hive_penalty": action["hive_penalty"],
                                "hive_hash": action["hive_hash"],
                            },
                        }
                    )
                    continue
                depth1 = f"shadow_{session}_d1_{action['action_id']}"
                engine.copy_graph(graph, depth1)
                shadows.append(depth1)
                engine.apply_mutation(depth1, action["action_type"], roles, now)
                kappa_after = None
                if action["action_type"] == "REROUTE_AND_HEAL":
                    kappa_after = engine.edge_kappa(depth1, roles["payment"], focus)
                expanded.append(action["action_id"])
                events.append(
                    {
                        "agent": "SHADOW_ARCHITECT",
                        "kind": "expand",
                        "detail": {
                            "action_id": action["action_id"],
                            "action_type": action["action_type"],
                            "graph": depth1,
                            "kappa_after": kappa_after,
                            "depth": 1,
                        },
                    }
                )
                if depth < 2:
                    continue
                depth2 = f"shadow_{session}_d2_{action['action_id']}"
                engine.copy_graph(depth1, depth2)
                shadows.append(depth2)
                shock = engine.apply_shock(depth2, roles)
                structural = action["action_type"] == "REROUTE_AND_HEAL"
                shields = engine.run_shields(
                    depth2,
                    baseline_min_kappa=baseline_min,
                    structural=structural,
                    notifies_owners=structural,
                )
                covered = engine.oncall_covered(depth2, roles)
                survival = 0.0 if shields["blocked"] else (1.0 if covered else 0.75)
                events.append(
                    {
                        "agent": "NEMESIS",
                        "kind": "shock",
                        "detail": {
                            "action_id": action["action_id"],
                            "graph": depth2,
                            "shock": shock,
                            "shields": shields,
                            "oncall_covered": covered,
                            "survival": survival,
                        },
                    }
                )
                branch = {
                    "action_id": action["action_id"],
                    "action_name": action["action_name"],
                    "action_type": action["action_type"],
                    "ucb_score": action["ucb_score"],
                    "kappa_after": kappa_after,
                    "shock": shock,
                    "shields": shields,
                    "oncall_covered": covered,
                    "survival": survival,
                    "graphs": [depth1, depth2],
                }
                branches.append(branch)
                if shields["blocked"]:
                    failed = [
                        name
                        for name, payload in shields.items()
                        if isinstance(payload, dict) and payload.get("violations", 0) > 0
                    ]
                    reason = "Nemesis shock broke " + ", ".join(failed)
                    engine.write_dead_end(graph, focus, action["action_id"], reason, "NEMESIS")
                    motif = engine.publish_failure_motif(tenant_id, focus, action["action_type"], reason)
                    events.append(
                        {
                            "agent": "NEMESIS",
                            "kind": "veto",
                            "detail": {
                                "action_id": action["action_id"],
                                "shields": failed,
                                "hive": motif,
                            },
                        }
                    )
            survivors = [branch for branch in branches if branch["survival"] > 0]
            survivors.sort(key=lambda branch: (branch["survival"], branch["ucb_score"]), reverse=True)
            winner = survivors[0] if survivors else None
            episode_id = None
            final_shields = None
            if winner:
                engine.apply_mutation(graph, winner["action_type"], roles, now)
                final_shields = engine.run_shields(
                    graph,
                    baseline_min_kappa=baseline_min,
                    structural=True,
                    notifies_owners=True,
                )
                if final_shields["blocked"]:
                    events.append(
                        {
                            "agent": "ARBITER",
                            "kind": "refuse",
                            "detail": {"action_id": winner["action_id"], "shields": final_shields},
                        }
                    )
                    winner = None
                else:
                    episode_id = engine.write_episode(
                        graph, alert_id, winner["action_id"], winner["survival"], session
                    )
                    events.append(
                        {
                            "agent": "ARBITER",
                            "kind": "merge",
                            "detail": {
                                "action_id": winner["action_id"],
                                "action_name": winner["action_name"],
                                "episode_id": episode_id,
                                "shields": final_shields,
                                "kappa_after": engine.edge_kappa(graph, roles["payment"], focus),
                            },
                        }
                    )
            else:
                events.append(
                    {
                        "agent": "ARBITER",
                        "kind": "refuse",
                        "detail": {"reason": "no branch survived Nemesis"},
                    }
                )
        finally:
            for shadow in shadows:
                engine.delete_graph(shadow)

        proof = _proof(blast, bridge, ghosts, ranked, branches, winner, final_shields, episode_id)
        events.append({"agent": "ARBITER", "kind": "proof", "detail": proof})
        return {
            "tenant": tenant_id,
            "alert_id": alert_id,
            "session": session,
            "depth": depth,
            "events": events,
            "ranked": ranked,
            "expanded": expanded,
            "skipped": skipped,
            "branches": [
                {key: value for key, value in branch.items() if key != "graphs"} for branch in branches
            ],
            "winner": None
            if not winner
            else {
                "action_id": winner["action_id"],
                "action_name": winner["action_name"],
                "action_type": winner["action_type"],
                "survival": winner["survival"],
                "kappa_after": winner.get("kappa_after"),
            },
            "episode_id": episode_id,
            "shields": final_shields,
            "proof": proof,
            "finished_at": int(time.time()),
        }


def _public_edge(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "upstream": row.get("upstream_service"),
        "downstream": row.get("downstream_service"),
        "kappa": row.get("ollivier_ricci_kappa"),
        "regime": row.get("geometric_regime"),
        "shared_triangles": row.get("shared_redundant_triangles"),
    }


def _proof(blast, bridge, ghosts, ranked, branches, winner, shields, episode_id) -> list[dict]:
    items = [
        {"kind": "blast_radius", "services": blast},
        {"kind": "bridge", "edge": _public_edge(bridge)},
        {
            "kind": "conway_ghosts",
            "rows": [
                {
                    "upstream": row.get("upstream"),
                    "downstream": row.get("downstream"),
                    "owner_a": row.get("owner_a"),
                    "owner_b": row.get("owner_b"),
                    "hop": row.get("hop"),
                }
                for row in ghosts
            ],
        },
        {
            "kind": "ucb",
            "rows": [
                {
                    "action_id": row["action_id"],
                    "action_name": row["action_name"],
                    "ucb_score": row["ucb_score"],
                    "dark_penalty": row["dark_penalty"],
                    "hive_penalty": row["hive_penalty"],
                    "hive_hash": row["hive_hash"],
                    "expand": row["expand"],
                }
                for row in ranked
            ],
        },
    ]
    for branch in branches:
        failed = []
        if branch["shields"]:
            failed = [
                name
                for name, payload in branch["shields"].items()
                if isinstance(payload, dict) and payload.get("violations", 0) > 0
            ]
        items.append(
            {
                "kind": "branch",
                "action_id": branch["action_id"],
                "action_name": branch["action_name"],
                "survival": branch["survival"],
                "failed_shields": failed,
                "oncall_covered": branch["oncall_covered"],
                "kappa_after": branch.get("kappa_after"),
            }
        )
    items.append(
        {
            "kind": "decision",
            "winner": None if not winner else winner["action_id"],
            "episode_id": episode_id,
            "shields": shields,
        }
    )
    return items

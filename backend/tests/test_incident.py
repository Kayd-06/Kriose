from engine import ACME, FINSERV, graph_name
from swarm import Swarm


def test_bridge_is_hyperbolic_and_heal_raises_it(engine):
    graph = graph_name("org_acme")
    roles = engine.roles(graph)
    before = engine.edge_kappa(graph, roles["payment"], roles["token"])
    assert before is not None
    assert before < -0.5
    shadow = "shadow_test_heal"
    engine.copy_graph(graph, shadow)
    try:
        engine.apply_mutation(shadow, "REROUTE_AND_HEAL", engine.roles(shadow), engine.times["now"])
        after = engine.edge_kappa(shadow, roles["payment"], roles["token"])
    finally:
        engine.delete_graph(shadow)
    assert after is not None
    assert after > before


def test_temporal_diff_has_both_classes(engine):
    meta = engine.meta(graph_name("org_acme"))
    rows = engine.temporal_diff("org_acme", int(meta["baseline"]), int(meta["incident"]))
    classes = {row["temporal_mutation_class"] for row in rows}
    assert "INVALIDATED_OR_REMOVED" in classes
    assert "LATE_DISCOVERED_DRIFT" in classes


def test_restart_motifs_match_across_tenants(engine):
    acme = engine.motif_hash(graph_name(ACME["tenant"]), ACME["token"][0], "RESTART")
    finserv = engine.motif_hash(graph_name(FINSERV["tenant"]), FINSERV["token"][0], "RESTART")
    failover = engine.motif_hash(graph_name(ACME["tenant"]), ACME["token"][0], "REROUTE_AND_HEAL")
    assert acme["wl_hash"] == finserv["wl_hash"]
    assert failover["wl_hash"] != acme["wl_hash"]
    assert len(acme["wl_hash"]) == 16
    hive = engine.hive_view()
    blob = str(hive)
    assert "Arjun" not in blob
    assert "Elena" not in blob
    assert "org_acme" not in blob


def test_healthy_shields_and_pii_bypass(engine):
    graph = graph_name("org_acme")
    baseline = engine.tier1_min_kappa(graph)
    healthy = engine.run_shields(
        graph, baseline_min_kappa=baseline, structural=False, notifies_owners=False
    )
    assert healthy["blocked"] is False
    engine.query(
        graph,
        """
        MATCH (ing:Ingress {exposure: 'public'}), (pii:Service {id: 'svc_token'})
        CREATE (ing)-[:DEPENDS_ON {
            p99_latency_ms: 5, is_fallback: false,
            t_valid_from: 1, t_valid_to: 9999999999,
            t_tx_created: 1, t_tx_superseded: 9999999999
        }]->(pii)
        """,
    )
    try:
        broken = engine.run_shields(
            graph, baseline_min_kappa=baseline, structural=False, notifies_owners=False
        )
        assert broken["INV-PII-ZERO-TRUST"]["violations"] > 0
    finally:
        engine.query(
            graph,
            """
            MATCH (:Ingress {exposure: 'public'})-[e:DEPENDS_ON]->(:Service {id: 'svc_token'})
            DELETE e
            """,
        )


def test_compiler_links_symbol_and_rfc(engine):
    graph = graph_name("org_acme")
    symbols = engine.query(graph, "MATCH (c:CodeSymbol) RETURN count(c) AS n")
    assert int(symbols[0]["n"]) >= 1
    governed = engine.query(
        graph,
        """
        MATCH (:Service {name: 'Token-Vault-Cache'})-[:GOVERNED_BY]->(d:DecisionDoc {id: 'rfc_409'})
        RETURN d.title AS title
        """,
    )
    assert governed
    assert "RFC-409" in governed[0]["title"]
    drift = engine.query(
        graph,
        """
        MATCH (:DecisionDoc {id: 'slack_public_route'})-[s:SUPERSEDES]->(:DecisionDoc {id: 'rfc_409'})
        RETURN s.drift_detected AS drift
        """,
    )
    assert drift[0]["drift"] is True or drift[0]["drift"] == 1 or drift[0]["drift"] == "true"


def test_swarm_picks_failover_and_remembers(engine):
    swarm = Swarm(engine)
    first = swarm.simulate("org_acme", "alert_991")
    assert first["winner"]["action_id"] == "act_failover"
    assert "act_restart" in first["skipped"]
    assert first["episode_id"]
    throttle = next(branch for branch in first["branches"] if branch["action_id"] == "act_throttle")
    assert throttle["shields"]["blocked"] is True
    assert throttle["shields"]["INV-SPOF"]["violations"] > 0
    dead = engine.query(
        graph_name("org_acme"),
        """
        MATCH (:Service {id: 'svc_token'})-[d:DEAD_END]->(:RunbookAction {id: 'act_restart'})
        RETURN d.verified_by AS verified_by, d.penalty AS penalty
        """,
    )
    assert dead
    assert float(dead[0]["penalty"]) >= 0.9
    final = engine.run_shields(
        graph_name("org_acme"),
        baseline_min_kappa=-1.0,
        structural=True,
        notifies_owners=True,
    )
    assert final["INV-PII-ZERO-TRUST"]["violations"] == 0
    assert final["blocked"] is False

    second = swarm.simulate("org_acme", "alert_991")
    assert "act_restart" in second["skipped"]
    assert "act_restart" not in second["expanded"]
    assert second["winner"]["action_id"] == "act_failover"
    episodes = engine.query(
        graph_name("org_acme"),
        "MATCH (m:EpisodicMemory) RETURN count(m) AS n",
    )
    assert int(episodes[0]["n"]) >= 2

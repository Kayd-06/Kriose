"""FalkorDB context layer for Kriose.

Curvature is the shared-neighbor bound from the PRD (a discrete Jost-Liu style
score written onto edges as ricci_curvature). The hive key is a Weisfeiler-Lehman
hash of an anonymized 2-hop service ego-graph plus the action type. No tenant
names or engineer names are written to the hive graph.
"""

from __future__ import annotations

import hashlib
import itertools
import os
import time
from collections import defaultdict
from typing import Any

from falkordb import FalkorDB

HIVE_GRAPH = "kriose_global_hive_immunology"
FAR_FUTURE = 9999999999
DARK_EXPAND_BLOCK = 0.9
PUCT = 1.414
HIVE_PENALTY = 0.40


def clock(now: int | None = None) -> dict[str, int]:
    now = int(now if now is not None else time.time())
    return {
        "now": now,
        "week_ago": now - 7 * 86400,
        "baseline": now - 3 * 86400,
        "incident": now,
        "late_valid_from": now - 5 * 86400,
        "late_tx": now - 2 * 86400,
        "invalidated_to": now - 86400,
        "future": FAR_FUTURE,
    }


def graph_name(tenant_id: str) -> str:
    return f"kriose_{tenant_id}"


def degree_bucket(degree: int) -> str:
    if degree <= 1:
        return "d1"
    if degree <= 3:
        return "d2to3"
    return "d4plus"


def kappa_bucket(kappa: float | None) -> str:
    if kappa is None:
        return "kna"
    if kappa < -0.50:
        return "khyper"
    if kappa < 0:
        return "kfrag"
    return "kres"


def rows_as_dicts(result: Any) -> list[dict[str, Any]]:
    header: list[str] = []
    raw_header = getattr(result, "header", None) or []
    for item in raw_header:
        if isinstance(item, (list, tuple)):
            header.append(str(item[-1]))
        else:
            header.append(str(item))
    rows = []
    for raw in getattr(result, "result_set", None) or []:
        rows.append({header[i]: raw[i] for i in range(min(len(header), len(raw)))})
    return rows


def _node_id(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    props = getattr(value, "properties", None)
    if isinstance(props, dict) and "id" in props:
        return props["id"]
    return str(value)


ACME = {
    "tenant": "org_acme",
    "ingress": ("ing_pub", "Public-API-Gateway"),
    "auth": ("auth_jwt", "ZeroTrust-JWT-Guard"),
    "checkout": ("svc_checkout", "Checkout-Orchestrator", 1, 72, 100, False),
    "payment": ("svc_payment", "Payment-Core", 1, 88, 100, True),
    "token": ("svc_token", "Token-Vault-Cache", 1, 92, 100, True),
    "standby": ("svc_standby", "Token-Replica-Standby", 1, 20, 120, True),
    "fraud": ("svc_fraud", "Fraud-Scoring-Worker", 2, 55, 100, False),
    "ledger": ("svc_ledger", "Ledger-Audit-Stream", 2, 48, 100, True),
    "legacy": ("svc_legacy", "Legacy-Token-Cache", 3, 5, 40, True),
    "eng_checkout": ("eng_arjun", "Arjun Mehta", "Staff SRE", "@arjun"),
    "eng_token": ("eng_elena", "Elena Rostova", "Principal Security Eng", "@elena"),
    "eng_payment": ("eng_liam", "Liam Chen", "Payments Lead", "@liam"),
    "alert": ("alert_991", "Token-Vault Connection Pool Exhaustion & Latency Cascade"),
    "actions": {
        "RESTART": ("act_restart", "Hard-Restart Token-Vault Containers", 4, 0.35, 1),
        "THROTTLE": ("act_throttle", "Throttle Payment-Core Upstream 30%", 2, 0.62, 3),
        "REROUTE_AND_HEAL": (
            "act_failover",
            "Reroute Token-Vault Traffic to Standby + Close Triadic Loop",
            1,
            0.89,
            8,
        ),
    },
    "prod_dead_end": "RESTART",
    "dead_reason": "Triggered cold-cache OOM stampede in Session #38",
}

FINSERV = {
    "tenant": "org_finserv",
    "ingress": ("ing_fs", "Edge-Gateway"),
    "auth": ("auth_fs", "JWT-Guard"),
    "checkout": ("svc_pos", "Checkout-Front", 1, 70, 100, False),
    "payment": ("svc_pay", "Settlement-Core", 1, 84, 100, True),
    "token": ("svc_pan", "PAN-Vault", 1, 91, 100, True),
    "standby": ("svc_pan_standby", "PAN-Replica", 1, 18, 120, True),
    "fraud": ("svc_risk", "Risk-Worker", 2, 40, 100, False),
    "ledger": ("svc_journal", "Journal-Stream", 2, 36, 100, True),
    "legacy": ("svc_legacy_pan", "Legacy-PAN-Cache", 3, 4, 40, True),
    "eng_checkout": ("eng_noah", "Noah Shah", "SRE", "@noah"),
    "eng_token": ("eng_mia", "Mia Alvarez", "Security", "@mia"),
    "eng_payment": ("eng_owen", "Owen Brooks", "Payments", "@owen"),
    "alert": ("alert_441", "PAN-Vault pool exhaustion"),
    "actions": {
        "RESTART": ("act_fs_restart", "Restart PAN-Vault", 4, 0.30, 1),
        "THROTTLE": ("act_fs_throttle", "Throttle settlement", 2, 0.50, 2),
        "REROUTE_AND_HEAL": ("act_fs_failover", "Fail over PAN-Vault", 1, 0.70, 4),
    },
    "prod_dead_end": None,
    "dead_reason": "",
}


class KrioseEngine:
    def __init__(self, host: str | None = None, port: int | None = None):
        self.host = host or os.getenv("FALKORDB_HOST", "localhost")
        self.port = int(port or os.getenv("FALKORDB_PORT", "6379"))
        # Fail fast when FalkorDB is unreachable (e.g. packets silently dropped)
        # so /api/v2/health returns ok:false instead of hanging.
        self.connect_timeout = float(os.getenv("FALKORDB_CONNECT_TIMEOUT", "3"))
        self.socket_timeout = float(os.getenv("FALKORDB_SOCKET_TIMEOUT", "30"))
        self._db: FalkorDB | None = None
        self.times = clock()

    @property
    def db(self) -> FalkorDB:
        # Connect lazily so the API can start (and /health can report ok:false)
        # before FalkorDB is up. A failed connect is retried on the next call.
        if self._db is None:
            self._db = FalkorDB(
                host=self.host,
                port=self.port,
                socket_connect_timeout=self.connect_timeout,
                socket_timeout=self.socket_timeout,
            )
        return self._db

    def ping(self) -> bool:
        try:
            self.db.list_graphs()
            return True
        except Exception:
            self._db = None
            return False

    def query(self, name: str, cypher: str, params: dict | None = None) -> list[dict[str, Any]]:
        graph = self.db.select_graph(name)
        result = graph.query(cypher, params or {})
        return rows_as_dicts(result)

    def delete_graph(self, name: str) -> None:
        try:
            self.db.select_graph(name).delete()
        except Exception:
            return

    def copy_graph(self, src: str, dest: str) -> str:
        self.delete_graph(dest)
        copied = self.db.select_graph(src).copy(dest)
        copied_name = getattr(copied, "name", dest)
        return copied_name or dest

    def list_graphs(self) -> list[str]:
        raw = self.db.list_graphs() or []
        names = []
        for item in raw:
            names.append(item.decode() if isinstance(item, bytes) else str(item))
        return names

    def reset_demo(self) -> dict[str, Any]:
        self.times = clock()
        for name in self.list_graphs():
            if name.startswith("kriose_") or name.startswith("shadow_"):
                self.delete_graph(name)
        finserv = self.seed_spec(FINSERV)
        acme = self.seed_spec(ACME)
        from compiler import ingest

        compiled = ingest(self, ACME["tenant"])
        self.compute_ricci(graph_name(ACME["tenant"]))
        ghosts = self.detect_ghosts(graph_name(ACME["tenant"]))
        self.compute_ricci(graph_name(FINSERV["tenant"]))
        hive = self.publish_failure_motif(
            FINSERV["tenant"],
            FINSERV["token"][0],
            "RESTART",
            "cold-cache OOM stampede",
        )
        return {
            "acme": acme,
            "finserv": finserv,
            "compiler": compiled,
            "ghosts": ghosts,
            "hive": hive,
            "baseline": self.times["baseline"],
            "incident": self.times["incident"],
        }

    def seed_spec(self, spec: dict[str, Any]) -> dict[str, Any]:
        name = graph_name(spec["tenant"])
        self.delete_graph(name)
        t = self.times
        g = self.db.select_graph(name)
        services = ["checkout", "payment", "token", "standby", "fraud", "ledger", "legacy"]
        params: dict[str, Any] = {
            "ing_id": spec["ingress"][0],
            "ing_name": spec["ingress"][1],
            "auth_id": spec["auth"][0],
            "auth_name": spec["auth"][1],
            "week_ago": t["week_ago"],
            "future": t["future"],
            "late_from": t["late_valid_from"],
            "late_tx": t["late_tx"],
            "invalid_to": t["invalidated_to"],
            "now": t["now"],
            "baseline": t["baseline"],
            "alert_id": spec["alert"][0],
            "alert_title": spec["alert"][1],
        }
        for role in services:
            sid, sname, tier, load, cap, pii = spec[role]
            params[f"{role}_id"] = sid
            params[f"{role}_name"] = sname
            params[f"{role}_tier"] = tier
            params[f"{role}_load"] = load
            params[f"{role}_cap"] = cap
            params[f"{role}_pii"] = pii
        for key, prefix in (
            ("eng_checkout", "eng_c"),
            ("eng_token", "eng_t"),
            ("eng_payment", "eng_p"),
        ):
            eid, ename, role_name, handle = spec[key]
            params[f"{prefix}_id"] = eid
            params[f"{prefix}_name"] = ename
            params[f"{prefix}_role"] = role_name
            params[f"{prefix}_handle"] = handle
        for action_type, row in spec["actions"].items():
            aid, aname, cost, weight, success = row
            slot = action_type.lower()
            params[f"{slot}_id"] = aid
            params[f"{slot}_name"] = aname
            params[f"{slot}_cost"] = cost
            params[f"{slot}_w"] = weight
            params[f"{slot}_n"] = success
        params["dead_reason"] = spec["dead_reason"]
        params["dead_ttl"] = t["now"] + 172800

        active = (
            "t_valid_from: $week_ago, t_valid_to: $future, "
            "t_tx_created: $week_ago, t_tx_superseded: $future"
        )
        late = (
            "t_valid_from: $late_from, t_valid_to: $future, "
            "t_tx_created: $late_tx, t_tx_superseded: $future"
        )
        dead = (
            "t_valid_from: $week_ago, t_valid_to: $invalid_to, "
            "t_tx_created: $week_ago, t_tx_superseded: $invalid_to"
        )
        g.query(
            """
            CREATE (:Meta {id: 'clock', baseline: $baseline, incident: $now, seeded_at: $now})
            CREATE (:TopologyMap {
                id: 'map',
                checkout: $checkout_id, payment: $payment_id, token: $token_id,
                standby: $standby_id, fraud: $fraud_id, ledger: $ledger_id,
                token_owner: $eng_t_id, payment_owner: $eng_p_id
            })
            CREATE (:Ingress {id: $ing_id, name: $ing_name, exposure: 'public', rate_limit_rps: 5000})
            CREATE (:AuthMiddleware {id: $auth_id, name: $auth_name, jwt_enforced: true, mfa_required: true})
            CREATE (:Service {id: $checkout_id, name: $checkout_name, tier: $checkout_tier, current_load: $checkout_load, max_capacity: $checkout_cap, pii_classified: $checkout_pii, error_rate: 0.01})
            CREATE (:Service {id: $payment_id, name: $payment_name, tier: $payment_tier, current_load: $payment_load, max_capacity: $payment_cap, pii_classified: $payment_pii, error_rate: 0.02})
            CREATE (:Service {id: $token_id, name: $token_name, tier: $token_tier, current_load: $token_load, max_capacity: $token_cap, pii_classified: $token_pii, error_rate: 0.04})
            CREATE (:Service {id: $standby_id, name: $standby_name, tier: $standby_tier, current_load: $standby_load, max_capacity: $standby_cap, pii_classified: $standby_pii, error_rate: 0.0})
            CREATE (:Service {id: $fraud_id, name: $fraud_name, tier: $fraud_tier, current_load: $fraud_load, max_capacity: $fraud_cap, pii_classified: $fraud_pii, error_rate: 0.01})
            CREATE (:Service {id: $ledger_id, name: $ledger_name, tier: $ledger_tier, current_load: $ledger_load, max_capacity: $ledger_cap, pii_classified: $ledger_pii, error_rate: 0.0})
            CREATE (:Service {id: $legacy_id, name: $legacy_name, tier: $legacy_tier, current_load: $legacy_load, max_capacity: $legacy_cap, pii_classified: $legacy_pii, error_rate: 0.0})
            CREATE (:Engineer {id: $eng_c_id, name: $eng_c_name, role: $eng_c_role, slack_handle: $eng_c_handle, oncall_available: true})
            CREATE (:Engineer {id: $eng_t_id, name: $eng_t_name, role: $eng_t_role, slack_handle: $eng_t_handle, oncall_available: true})
            CREATE (:Engineer {id: $eng_p_id, name: $eng_p_name, role: $eng_p_role, slack_handle: $eng_p_handle, oncall_available: true})
            CREATE (:Alert {id: $alert_id, title: $alert_title, severity: 'CRITICAL', active: true})
            CREATE (:RunbookAction {id: $restart_id, name: $restart_name, action_type: 'RESTART', execution_cost: $restart_cost, cypher_template: 'RESTART'})
            CREATE (:RunbookAction {id: $throttle_id, name: $throttle_name, action_type: 'THROTTLE', execution_cost: $throttle_cost, cypher_template: 'THROTTLE'})
            CREATE (:RunbookAction {id: $reroute_and_heal_id, name: $reroute_and_heal_name, action_type: 'REROUTE_AND_HEAL', execution_cost: $reroute_and_heal_cost, cypher_template: 'REROUTE_AND_HEAL'})
            """,
            params,
        )

        def link(src_label: str, src_key: str, dst_label: str, dst_key: str, rel: str, props: str) -> None:
            g.query(
                f"""
                MATCH (a:{src_label} {{id: $src}}), (b:{dst_label} {{id: $dst}})
                CREATE (a)-[:{rel} {{{props}}}]->(b)
                """,
                {**params, "src": params[src_key], "dst": params[dst_key]},
            )

        link("Ingress", "ing_id", "AuthMiddleware", "auth_id", "DEPENDS_ON", f"p99_latency_ms: 8, call_weight: 1, is_fallback: false, {active}")
        link("AuthMiddleware", "auth_id", "Service", "checkout_id", "DEPENDS_ON", f"p99_latency_ms: 12, call_weight: 1, is_fallback: false, {active}")
        link("Service", "checkout_id", "Service", "payment_id", "DEPENDS_ON", f"p99_latency_ms: 45, call_weight: 1, is_fallback: false, {active}")
        link("Service", "fraud_id", "Service", "payment_id", "DEPENDS_ON", f"p99_latency_ms: 30, call_weight: 1, is_fallback: false, {active}")
        link("Service", "payment_id", "Service", "token_id", "DEPENDS_ON", f"p99_latency_ms: 190, call_weight: 1, is_fallback: false, {active}")
        link("Service", "token_id", "Service", "ledger_id", "DEPENDS_ON", f"p99_latency_ms: 25, call_weight: 1, is_fallback: false, {active}")
        link("Service", "fraud_id", "Service", "ledger_id", "DEPENDS_ON", f"p99_latency_ms: 80, call_weight: 1, is_fallback: false, {late}")
        link("Service", "fraud_id", "Service", "legacy_id", "DEPENDS_ON", f"p99_latency_ms: 30, call_weight: 1, is_fallback: false, {dead}")
        link("Service", "payment_id", "Service", "standby_id", "HAS_FALLBACK", active)
        link("Engineer", "eng_c_id", "Service", "checkout_id", "OWNS", f"ownership_score: 0.9, is_primary_oncall: true, {active}")
        link("Engineer", "eng_p_id", "Service", "payment_id", "OWNS", f"ownership_score: 0.9, is_primary_oncall: true, {active}")
        link("Engineer", "eng_p_id", "Service", "standby_id", "OWNS", f"ownership_score: 0.6, is_primary_oncall: true, {active}")
        link("Engineer", "eng_t_id", "Service", "token_id", "OWNS", f"ownership_score: 0.95, is_primary_oncall: true, {active}")
        link("Engineer", "eng_c_id", "Engineer", "eng_p_id", "COMMUNICATED_WITH", f"interaction_count_14d: 19, last_contact_epoch: $now, channels: 'slack', {active}")
        link("Alert", "alert_id", "Service", "token_id", "TRIGGERED_ON", active)
        link("Alert", "alert_id", "RunbookAction", "restart_id", "PHEROMONE_TRACE", "weight: $restart_w, success_count: $restart_n, evaporation_rate: 0.05, last_updated: $week_ago")
        link("Alert", "alert_id", "RunbookAction", "throttle_id", "PHEROMONE_TRACE", "weight: $throttle_w, success_count: $throttle_n, evaporation_rate: 0.05, last_updated: $week_ago")
        link("Alert", "alert_id", "RunbookAction", "reroute_and_heal_id", "PHEROMONE_TRACE", "weight: $reroute_and_heal_w, success_count: $reroute_and_heal_n, evaporation_rate: 0.05, last_updated: $week_ago")
        if spec["prod_dead_end"]:
            g.query(
                """
                MATCH (s:Service {id: $token}), (act:RunbookAction {action_type: $action})
                CREATE (s)-[:DEAD_END {
                    penalty: 0.95,
                    failure_reason: $reason,
                    verified_by: 'PROD',
                    ttl_epoch: $ttl
                }]->(act)
                """,
                {
                    "token": spec["token"][0],
                    "action": spec["prod_dead_end"],
                    "reason": spec["dead_reason"],
                    "ttl": params["dead_ttl"],
                },
            )
        return {"tenant": spec["tenant"], "graph": name, "seeded_at": t["now"]}

    def roles(self, graph: str) -> dict[str, str]:
        rows = self.query(
            graph,
            """
            MATCH (m:TopologyMap {id: 'map'})
            RETURN m.checkout AS checkout, m.payment AS payment, m.token AS token,
                   m.standby AS standby, m.fraud AS fraud, m.ledger AS ledger,
                   m.token_owner AS token_owner, m.payment_owner AS payment_owner,
                   coalesce(m.custom, false) AS custom
            """,
        )
        if not rows:
            raise RuntimeError(f"no topology map on {graph}")
        return {key: str(value) for key, value in rows[0].items() if key != "custom" or value}

    def meta(self, graph: str) -> dict[str, Any]:
        rows = self.query(
            graph,
            "MATCH (m:Meta {id: 'clock'}) RETURN m.baseline AS baseline, m.incident AS incident",
        )
        return rows[0] if rows else {"baseline": self.times["baseline"], "incident": self.times["incident"]}

    def compute_ricci(self, graph: str) -> list[dict[str, Any]]:
        now = int(self.meta(graph).get("incident") or self.times["now"])
        rows = self.query(
            graph,
            """
            MATCH (u:Service)-[e:DEPENDS_ON]->(v:Service)
            WHERE coalesce(e.t_valid_to, $future) > $now
            OPTIONAL MATCH (u)-[e1:DEPENDS_ON]-(nu:Service)
            WHERE coalesce(e1.t_valid_to, $future) > $now
            OPTIONAL MATCH (v)-[e2:DEPENDS_ON]-(nv:Service)
            WHERE coalesce(e2.t_valid_to, $future) > $now
            WITH u, v, e,
                 [x IN collect(DISTINCT nu.id) WHERE x IS NOT NULL] AS neigh_u,
                 [x IN collect(DISTINCT nv.id) WHERE x IS NOT NULL] AS neigh_v
            WITH u, v, e, neigh_u, neigh_v,
                 [x IN neigh_u WHERE x IN neigh_v] AS shared
            WITH u, v, e,
                 size(neigh_u) AS deg_u,
                 size(neigh_v) AS deg_v,
                 size(shared) AS tri_count
            WITH u, v, e, deg_u, deg_v, tri_count,
                 CASE
                   WHEN deg_u <= 1 OR deg_v <= 1 THEN -0.25
                   ELSE (toFloat(tri_count) / toFloat(deg_u)) + (toFloat(tri_count) / toFloat(deg_v)) - 1.0
                 END AS kappa
            SET e.ricci_curvature = kappa
            RETURN u.id AS upstream_id, u.name AS upstream_service, u.tier AS upstream_tier,
                   v.id AS downstream_id, v.name AS downstream_service, v.tier AS downstream_tier,
                   kappa AS ollivier_ricci_kappa,
                   tri_count AS shared_redundant_triangles,
                   CASE
                     WHEN kappa < -0.50 THEN 'CRITICAL_HYPERBOLIC_BOTTLENECK'
                     WHEN kappa < 0.00 THEN 'FRAGILE_BRIDGE'
                     ELSE 'RESILIENT_POSITIVELY_CURVED_CLUSTER'
                   END AS geometric_regime
            ORDER BY ollivier_ricci_kappa ASC
            """,
            {"now": now, "future": FAR_FUTURE},
        )
        self.query(
            graph,
            """
            MATCH (s:Service)
            OPTIONAL MATCH (s)-[e:DEPENDS_ON]-()
            WHERE coalesce(e.t_valid_to, $future) > $now
            WITH s, min(e.ricci_curvature) AS kmin
            SET s.min_ricci_kappa = kmin
            """,
            {"now": now, "future": FAR_FUTURE},
        )
        return rows

    def edge_kappa(self, graph: str, src: str, dst: str) -> float | None:
        rows = self.compute_ricci(graph)
        for row in rows:
            if row.get("upstream_id") == src and row.get("downstream_id") == dst:
                return float(row["ollivier_ricci_kappa"])
        return None

    def temporal_diff(self, tenant_id: str, t_baseline: int, t_incident: int) -> list[dict[str, Any]]:
        return self.query(
            graph_name(tenant_id),
            """
            MATCH (u)-[r]->(v)
            WHERE (r.t_valid_from > $t_baseline AND r.t_valid_from <= $t_incident)
               OR (r.t_valid_to > $t_baseline AND r.t_valid_to <= $t_incident)
               OR (r.t_tx_created > $t_baseline AND r.t_tx_created <= $t_incident)
            RETURN labels(u)[0] AS source_type,
                   coalesce(u.name, u.id) AS source_name,
                   type(r) AS edge_type,
                   labels(v)[0] AS target_type,
                   coalesce(v.name, v.id) AS target_name,
                   r.t_valid_from AS valid_from,
                   r.t_valid_to AS valid_to,
                   r.t_tx_created AS recorded_at,
                   CASE
                     WHEN r.t_valid_to <= $t_incident THEN 'INVALIDATED_OR_REMOVED'
                     WHEN r.t_tx_created > r.t_valid_from + 3600 THEN 'LATE_DISCOVERED_DRIFT'
                     ELSE 'NEWLY_INTRODUCED_DEPENDENCY'
                   END AS temporal_mutation_class
            ORDER BY valid_from DESC
            """,
            {"t_baseline": int(t_baseline), "t_incident": int(t_incident)},
        )

    def detect_ghosts(self, graph: str) -> list[dict[str, Any]]:
        now = int(self.meta(graph).get("incident") or self.times["now"])
        direct = self.query(
            graph,
            """
            MATCH (engA:Engineer)-[:OWNS]->(svcA:Service)-[e:DEPENDS_ON]->(svcB:Service)<-[:OWNS]-(engB:Engineer)
            WHERE engA.id <> engB.id
              AND coalesce(e.t_valid_to, $future) > $now
              AND NOT (engA)-[:COMMUNICATED_WITH]-(engB)
            MERGE (svcA)-[ghost:SILENT_COLLISION_RISK]->(svcB)
            SET ghost.owner_a = engA.name,
                ghost.owner_b = engB.name,
                ghost.risk_score = 0.89,
                ghost.hop = 1,
                ghost.reason = 'Tight 1-hop service dependency with zero owner communication in 14d'
            RETURN svcA.id AS upstream_id, svcA.name AS upstream, svcB.id AS downstream_id,
                   svcB.name AS downstream, engA.name AS owner_a, engB.name AS owner_b,
                   ghost.risk_score AS risk, ghost.hop AS hop
            """,
            {"now": now, "future": FAR_FUTURE},
        )
        two_hop = self.query(
            graph,
            """
            MATCH (engA:Engineer)-[:OWNS]->(svcA:Service)-[e1:DEPENDS_ON]->(:Service)-[e2:DEPENDS_ON]->(svcC:Service)<-[:OWNS]-(engC:Engineer)
            WHERE engA.id <> engC.id
              AND coalesce(e1.t_valid_to, $future) > $now
              AND coalesce(e2.t_valid_to, $future) > $now
              AND NOT (engA)-[:COMMUNICATED_WITH]-(engC)
            MERGE (svcA)-[ghost:SILENT_COLLISION_RISK]->(svcC)
            SET ghost.owner_a = engA.name,
                ghost.owner_b = engC.name,
                ghost.risk_score = 0.74,
                ghost.hop = 2,
                ghost.reason = '2-hop dependency and the owners have no 14d communication'
            RETURN svcA.id AS upstream_id, svcA.name AS upstream, svcC.id AS downstream_id,
                   svcC.name AS downstream, engA.name AS owner_a, engC.name AS owner_b,
                   ghost.risk_score AS risk, ghost.hop AS hop
            """,
            {"now": now, "future": FAR_FUTURE},
        )
        return direct + two_hop

    def active_service_edges(self, graph: str) -> list[dict[str, Any]]:
        now = int(self.meta(graph).get("incident") or self.times["now"])
        return self.query(
            graph,
            """
            MATCH (u:Service)-[e:DEPENDS_ON]->(v:Service)
            WHERE coalesce(e.t_valid_to, $future) > $now
            RETURN u.id AS src, u.tier AS src_tier, v.id AS dst, v.tier AS dst_tier,
                   e.ricci_curvature AS kappa, e.p99_latency_ms AS p99,
                   coalesce(e.is_fallback, false) AS is_fallback
            """,
            {"now": now, "future": FAR_FUTURE},
        )

    def motif_parts(self, graph: str, focus_id: str) -> tuple[list[dict[str, Any]], list[tuple[str, str]]]:
        edges = self.active_service_edges(graph)
        undirected: dict[str, set[str]] = defaultdict(set)
        tiers: dict[str, int] = {}
        incident_kappa: dict[str, list[float]] = defaultdict(list)
        for edge in edges:
            src, dst = str(edge["src"]), str(edge["dst"])
            undirected[src].add(dst)
            undirected[dst].add(src)
            tiers[src] = int(edge["src_tier"])
            tiers[dst] = int(edge["dst_tier"])
            if edge.get("kappa") is not None:
                incident_kappa[src].append(float(edge["kappa"]))
                incident_kappa[dst].append(float(edge["kappa"]))
        seen = {focus_id}
        frontier = {focus_id}
        for _ in range(2):
            nxt: set[str] = set()
            for node in frontier:
                nxt |= undirected.get(node, set())
            nxt -= seen
            seen |= nxt
            frontier = nxt
        nodes = []
        for node in sorted(seen):
            kappas = incident_kappa.get(node) or []
            worst = min(kappas) if kappas else None
            degree = len(undirected.get(node, ()))
            nodes.append(
                {
                    "id": node,
                    "init": (
                        f"Service|t{tiers.get(node, 0)}|"
                        f"{degree_bucket(degree)}|{kappa_bucket(worst)}"
                    ),
                }
            )
        ego_edges = []
        for src, dst in itertools.combinations(sorted(seen), 2):
            if dst in undirected.get(src, ()):
                ego_edges.append((src, dst))
        return nodes, ego_edges

    def motif_hash(self, graph: str, focus_id: str, action_type: str) -> dict[str, Any]:
        nodes, edges = self.motif_parts(graph, focus_id)
        labels = {node["id"]: node["init"] for node in nodes}
        adj: dict[str, set[str]] = defaultdict(set)
        for src, dst in edges:
            adj[src].add(dst)
            adj[dst].add(src)
        for _ in range(2):
            nxt = {}
            for node, label in labels.items():
                neigh = ",".join(sorted(labels[other] for other in adj.get(node, ())))
                digest = hashlib.sha256(f"{label}|{neigh}".encode()).hexdigest()[:12]
                nxt[node] = digest
            labels = nxt
        canonical = "|".join(sorted(labels.values())) + f"|{action_type}"
        wl_hash = hashlib.sha256(canonical.encode()).hexdigest()[:16]
        return {
            "wl_hash": wl_hash,
            "canonical_signature": "|".join(sorted(node["init"] for node in nodes)),
            "action_type": action_type,
            "focus_id": focus_id,
        }

    def sync_hive(self, motif: dict[str, Any], failure_mode: str, confidence: float = 0.92) -> dict[str, Any]:
        now = self.times["now"]
        self.query(
            HIVE_GRAPH,
            """
            MERGE (m:TopologicalMotif {wl_hash: $wl_hash})
            ON CREATE SET m.hit_count = 1,
                          m.last_seen_epoch = $now,
                          m.canonical_signature = $signature
            ON MATCH SET m.hit_count = m.hit_count + 1,
                         m.last_seen_epoch = $now
            MERGE (a:AbstractAction {action_type: $action})
            MERGE (m)-[e:GLOBAL_DEAD_END]->(a)
            ON CREATE SET e.failure_mode = $mode,
                          e.confidence = $confidence,
                          e.tenant_confirmations = 1
            ON MATCH SET e.tenant_confirmations = coalesce(e.tenant_confirmations, 0) + 1,
                         e.failure_mode = $mode,
                         e.confidence = $confidence
            RETURN m.wl_hash AS wl_hash, m.hit_count AS hit_count, a.action_type AS action_type
            """,
            {
                "wl_hash": motif["wl_hash"],
                "signature": motif["canonical_signature"],
                "action": motif["action_type"],
                "mode": failure_mode,
                "confidence": confidence,
                "now": now,
            },
        )
        return {"wl_hash": motif["wl_hash"], "action_type": motif["action_type"], "failure_mode": failure_mode}

    def publish_failure_motif(self, tenant_id: str, focus_id: str, action_type: str, failure_mode: str) -> dict[str, Any]:
        graph = graph_name(tenant_id)
        self.compute_ricci(graph)
        motif = self.motif_hash(graph, focus_id, action_type)
        stored = self.sync_hive(motif, failure_mode)
        return stored

    def hive_lookup(self, graph: str, focus_id: str, action_type: str) -> dict[str, Any]:
        motif = self.motif_hash(graph, focus_id, action_type)
        rows = self.query(
            HIVE_GRAPH,
            """
            MATCH (m:TopologicalMotif {wl_hash: $wl_hash})-[e:GLOBAL_DEAD_END]->(a:AbstractAction {action_type: $action})
            RETURN e.confidence AS confidence, e.failure_mode AS failure_mode,
                   m.hit_count AS hit_count, m.canonical_signature AS canonical_signature
            """,
            {"wl_hash": motif["wl_hash"], "action": action_type},
        )
        if not rows:
            return {"penalty": 0.0, "wl_hash": motif["wl_hash"], "hit": None}
        return {"penalty": HIVE_PENALTY, "wl_hash": motif["wl_hash"], "hit": rows[0]}

    def hive_view(self) -> dict[str, Any]:
        try:
            rows = self.query(
                HIVE_GRAPH,
                """
                MATCH (m:TopologicalMotif)-[e:GLOBAL_DEAD_END]->(a:AbstractAction)
                RETURN m.wl_hash AS wl_hash, m.canonical_signature AS canonical_signature,
                       m.hit_count AS hit_count, a.action_type AS action_type,
                       e.failure_mode AS failure_mode, e.confidence AS confidence,
                       e.tenant_confirmations AS tenant_confirmations
                ORDER BY m.hit_count DESC
                """,
            )
        except Exception:
            rows = []
        return {"graph": HIVE_GRAPH, "motifs": rows}

    def pagerank(self, graph: str) -> dict[str, Any]:
        attempts = [
            "CALL algo.pageRank('Service', 'DEPENDS_ON') YIELD node, score RETURN node.id AS id, score",
            "CALL algo.pageRank('Service', 'DEPENDS_ON') YIELD node, score RETURN score",
        ]
        last_error = "not run"
        for cypher in attempts:
            try:
                rows = self.query(graph, cypher)
                updated = 0
                for row in rows:
                    node_id = _node_id(row.get("id"))
                    if node_id and row.get("score") is not None:
                        self.query(
                            graph,
                            "MATCH (s:Service {id: $id}) SET s.pagerank_score = $score",
                            {"id": node_id, "score": float(row["score"])},
                        )
                        updated += 1
                return {"ok": True, "updated": updated, "rows": len(rows)}
            except Exception as exc:
                last_error = str(exc)
        return {"ok": False, "error": last_error}

    def blast_radius(self, graph: str, focus_id: str, depth: int = 4) -> list[str]:
        edges = self.active_service_edges(graph)
        incoming: dict[str, set[str]] = defaultdict(set)
        outgoing: dict[str, set[str]] = defaultdict(set)
        for edge in edges:
            incoming[str(edge["dst"])].add(str(edge["src"]))
            outgoing[str(edge["src"])].add(str(edge["dst"]))
        seen = {focus_id}
        frontier = {focus_id}
        for _ in range(depth):
            nxt: set[str] = set()
            for node in frontier:
                nxt |= incoming.get(node, set())
                nxt |= outgoing.get(node, set())
            nxt -= seen
            seen |= nxt
            frontier = nxt
        return sorted(seen)

    def run_shields(
        self,
        graph: str,
        *,
        baseline_min_kappa: float,
        structural: bool,
        notifies_owners: bool,
    ) -> dict[str, Any]:
        now = int(self.meta(graph).get("incident") or self.times["now"])
        capacity = self.query(
            graph,
            """
            MATCH (s:Service {tier: 1})
            WHERE s.current_load > s.max_capacity
            RETURN count(s) AS tier1_overload_violations
            """,
        )
        cap_n = int(capacity[0]["tier1_overload_violations"]) if capacity else 0
        ricci_rows = self.compute_ricci(graph)
        tier1 = [
            float(row["ollivier_ricci_kappa"])
            for row in ricci_rows
            if int(row["upstream_tier"]) == 1 and int(row["downstream_tier"]) == 1
        ]
        new_min = min(tier1) if tier1 else 0.0
        # A mutation violates INV-RICCI only when it drives the tier-1 minimum
        # lower than the graph it was copied from and through the -0.65 floor.
        ricci_violation = int(new_min < -0.65 and new_min < baseline_min_kappa - 1e-9)
        try:
            pii = self.query(
                graph,
                """
                MATCH path = (ing:Ingress {exposure: 'public'})-[:DEPENDS_ON*1..6]->(pii:Service {pii_classified: true})
                WHERE NONE(n IN nodes(path) WHERE 'AuthMiddleware' IN labels(n))
                RETURN count(path) AS zero_trust_violations
                """,
            )
            pii_n = int(pii[0]["zero_trust_violations"]) if pii else 0
        except Exception:
            pii_n = 0
        ghosts = self.query(
            graph,
            """
            MATCH (a:Service)-[g:SILENT_COLLISION_RISK]->(b:Service)
            RETURN count(g) AS ghosts
            """,
        )
        ghost_n = int(ghosts[0]["ghosts"]) if ghosts else 0
        conway_violation = int(structural and not notifies_owners and ghost_n > 0)
        shields = {
            "INV-SPOF": {
                "violations": cap_n,
                "query": "MATCH (s:Service {tier: 1}) WHERE s.current_load > s.max_capacity RETURN count(s)",
            },
            "INV-RICCI": {
                "violations": ricci_violation,
                "min_kappa": round(new_min, 3),
                "baseline_min_kappa": round(baseline_min_kappa, 3),
                "query": "min tier-1 ricci_curvature must not fall below -0.65",
            },
            "INV-PII-ZERO-TRUST": {
                "violations": pii_n,
                "query": "shortestPath public Ingress to pii Service with no AuthMiddleware",
            },
            "INV-CONWAY-QUORUM": {
                "violations": conway_violation,
                "ghosts": ghost_n,
                "query": "structural edits on a Conway ghost require dual-owner notification",
            },
        }
        shields["blocked"] = any(item["violations"] > 0 for item in shields.values() if isinstance(item, dict))
        shields["observed_at"] = now
        return shields

    def tier1_min_kappa(self, graph: str) -> float:
        rows = self.compute_ricci(graph)
        vals = [
            float(row["ollivier_ricci_kappa"])
            for row in rows
            if int(row["upstream_tier"]) == 1 and int(row["downstream_tier"]) == 1
        ]
        return min(vals) if vals else 0.0

    def apply_mutation(self, graph: str, action_type: str, roles: dict[str, str], now: int) -> None:
        if roles.get("custom"):
            import byo

            byo.apply_mutation(self, graph, action_type, roles, now)
            return
        if action_type == "THROTTLE":
            self.query(
                graph,
                "MATCH (s:Service {id: $id}) SET s.current_load = s.current_load * 0.7",
                {"id": roles["payment"]},
            )
            return
        if action_type == "RESTART":
            self.query(
                graph,
                "MATCH (s:Service {id: $id}) SET s.current_load = s.current_load",
                {"id": roles["token"]},
            )
            return
        if action_type == "REROUTE_AND_HEAL":
            self.query(
                graph,
                """
                MATCH (s1:Service {id: $checkout}), (s2:Service {id: $payment}),
                      (s3:Service {id: $token}), (s4:Service {id: $standby}),
                      (s5:Service {id: $fraud})
                SET s3.current_load = 30, s4.current_load = 60
                MERGE (s2)-[a:DEPENDS_ON {is_fallback: true}]->(s4)
                SET a.p99_latency_ms = 40, a.call_weight = 1,
                    a.t_valid_from = $now, a.t_valid_to = $future,
                    a.t_tx_created = $now, a.t_tx_superseded = $future
                MERGE (s5)-[b:DEPENDS_ON]->(s3)
                SET b.p99_latency_ms = 35, b.call_weight = 1, b.is_fallback = false,
                    b.t_valid_from = $now, b.t_valid_to = $future,
                    b.t_tx_created = $now, b.t_tx_superseded = $future
                MERGE (s5)-[c:DEPENDS_ON]->(s4)
                SET c.p99_latency_ms = 35, c.call_weight = 1, c.is_fallback = false,
                    c.t_valid_from = $now, c.t_valid_to = $future,
                    c.t_tx_created = $now, c.t_tx_superseded = $future
                MERGE (s1)-[d:DEPENDS_ON]->(s4)
                SET d.p99_latency_ms = 28, d.call_weight = 1, d.is_fallback = false,
                    d.t_valid_from = $now, d.t_valid_to = $future,
                    d.t_tx_created = $now, d.t_tx_superseded = $future
                """,
                {
                    "checkout": roles["checkout"],
                    "payment": roles["payment"],
                    "token": roles["token"],
                    "standby": roles["standby"],
                    "fraud": roles["fraud"],
                    "now": now,
                    "future": FAR_FUTURE,
                },
            )
            return
        raise ValueError(f"unknown action {action_type}")

    def apply_shock(self, graph: str, roles: dict[str, str]) -> dict[str, Any]:
        self.query(
            graph,
            "MATCH (s:Service {id: $id}) SET s.current_load = s.current_load * 1.35",
            {"id": roles["token"]},
        )
        slowed = self.query(
            graph,
            """
            MATCH ()-[e:DEPENDS_ON]->()
            WHERE e.p99_latency_ms > 100
            SET e.p99_latency_ms = e.p99_latency_ms + 180
            RETURN count(e) AS slowed
            """,
        )
        self.query(
            graph,
            "MATCH (e:Engineer {id: $id}) SET e.oncall_available = false",
            {"id": roles["token_owner"]},
        )
        return {
            "load_factor": 1.35,
            "latency_delta_ms": 180,
            "slowed_edges": int(slowed[0]["slowed"]) if slowed else 0,
            "oncall_marked_down": roles["token_owner"],
        }

    def oncall_covered(self, graph: str, roles: dict[str, str]) -> bool:
        owners = self.query(
            graph,
            """
            MATCH (e:Engineer)-[:OWNS]->(s:Service {id: $token})
            RETURN e.oncall_available AS available
            """,
            {"token": roles["token"]},
        )
        if any(bool(row.get("available")) for row in owners):
            return True
        fallback = self.query(
            graph,
            """
            MATCH (:Service {id: $token})<-[e:DEPENDS_ON]-(:Service)-[:DEPENDS_ON {is_fallback: true}]->(standby:Service)<-[:OWNS]-(eng:Engineer)
            WHERE coalesce(eng.oncall_available, false) = true
            RETURN count(eng) AS covered
            """,
            {"token": roles["token"]},
        )
        # The heal edge is payment -fallback-> standby, and payment points at token.
        direct = self.query(
            graph,
            """
            MATCH (:Service {id: $payment})-[e:DEPENDS_ON {is_fallback: true}]->(standby:Service)<-[:OWNS]-(eng:Engineer)
            WHERE coalesce(eng.oncall_available, false) = true
            RETURN count(eng) AS covered
            """,
            {"payment": roles["payment"]},
        )
        fallback_n = int(fallback[0]["covered"]) if fallback else 0
        direct_n = int(direct[0]["covered"]) if direct else 0
        return fallback_n + direct_n > 0

    def rank_actions(self, graph: str, alert_id: str, focus_id: str) -> list[dict[str, Any]]:
        now = int(self.meta(graph).get("incident") or self.times["now"])
        rows = self.query(
            graph,
            """
            MATCH (alert:Alert {id: $alert})
            MATCH (act:RunbookAction)
            OPTIONAL MATCH (alert)-[pher:PHEROMONE_TRACE]->(act)
            OPTIONAL MATCH (s:Service {id: $focus})-[dead:DEAD_END]->(act)
            WHERE dead IS NULL OR dead.ttl_epoch > $now
            RETURN act.id AS action_id, act.name AS action_name, act.action_type AS action_type,
                   act.execution_cost AS execution_cost,
                   coalesce(pher.weight, 0.45) AS pheromone_weight,
                   coalesce(pher.success_count, 1) AS success_count,
                   coalesce(pher.last_updated, $now) AS last_updated,
                   coalesce(dead.penalty, 0.0) AS dark_penalty,
                   dead.failure_reason AS blocked_reason,
                   dead.verified_by AS blocked_by
            """,
            {"alert": alert_id, "focus": focus_id, "now": now},
        )
        total_n = sum(float(row["success_count"]) for row in rows) or 1.0
        ranked = []
        for row in rows:
            hive = self.hive_lookup(graph, focus_id, str(row["action_type"]))
            pher = float(row["pheromone_weight"])
            visits = float(row["success_count"])
            elapsed = max(0.0, now - float(row["last_updated"]))
            decay = pow(2.718281828, -0.05 * elapsed / 86400.0)
            exploration = PUCT * (pher * decay) * (total_n ** 0.5) / (1.0 + visits)
            dark = float(row["dark_penalty"])
            psi = float(hive["penalty"])
            score = pher + exploration - dark - psi - 0.15 * float(row["execution_cost"])
            ranked.append(
                {
                    "action_id": row["action_id"],
                    "action_name": row["action_name"],
                    "action_type": row["action_type"],
                    "execution_cost": row["execution_cost"],
                    "pheromone_weight": round(pher, 3),
                    "success_count": visits,
                    "dark_penalty": round(dark, 3),
                    "blocked_reason": row.get("blocked_reason"),
                    "blocked_by": row.get("blocked_by"),
                    "hive_penalty": psi,
                    "hive_hash": hive["wl_hash"],
                    "hive_hit": hive["hit"],
                    "ucb_score": round(score, 3),
                    "expand": dark < DARK_EXPAND_BLOCK,
                }
            )
        ranked.sort(key=lambda item: item["ucb_score"], reverse=True)
        return ranked

    def write_dead_end(self, graph: str, service_id: str, action_id: str, reason: str, verified_by: str) -> None:
        now = int(self.meta(graph).get("incident") or self.times["now"])
        self.query(
            graph,
            """
            MATCH (s:Service {id: $service}), (act:RunbookAction {id: $action})
            MERGE (s)-[d:DEAD_END]->(act)
            SET d.penalty = 0.95,
                d.failure_reason = $reason,
                d.verified_by = $verified_by,
                d.ttl_epoch = $ttl
            """,
            {
                "service": service_id,
                "action": action_id,
                "reason": reason,
                "verified_by": verified_by,
                "ttl": now + 172800,
            },
        )

    def write_episode(self, graph: str, alert_id: str, action_id: str, survival: float, session_id: str) -> str:
        now = int(self.meta(graph).get("incident") or self.times["now"])
        episode_id = f"ep_{session_id}"
        self.query(
            graph,
            """
            MATCH (alert:Alert {id: $alert}), (act:RunbookAction {id: $action})
            CREATE (m:EpisodicMemory {
                id: $id, session_id: $session, alert_id: $alert, chosen_action_id: $action,
                nemesis_shock_survived: true, survival_score: $score, t_tx_created: $now
            })
            CREATE (m)-[:REMEMBERS]->(act)
            CREATE (m)-[:ABOUT]->(alert)
            WITH alert, act
            MATCH (alert)-[p:PHEROMONE_TRACE]->(act)
            SET p.weight = CASE WHEN p.weight + 0.05 > 1 THEN 1 ELSE p.weight + 0.05 END,
                p.success_count = p.success_count + 1,
                p.last_updated = $now
            """,
            {
                "id": episode_id,
                "session": session_id,
                "alert": alert_id,
                "action": action_id,
                "score": survival,
                "now": now,
            },
        )
        return episode_id

    def snapshot(self, tenant_id: str, at_time: int | None = None, *, all_time: bool = False) -> dict[str, Any]:
        graph = graph_name(tenant_id)
        meta = self.meta(graph)
        when = int(at_time if at_time else meta.get("incident") or self.times["now"])
        nodes = self.query(
            graph,
            """
            MATCH (n)
            WHERE NOT n:Meta AND NOT n:TopologyMap
              AND (n.id IS NOT NULL OR n.name IS NOT NULL)
            RETURN coalesce(n.id, n.name) AS id, labels(n)[0] AS kind, n.name AS name,
                   n.tier AS tier, n.current_load AS current_load, n.max_capacity AS max_capacity,
                   n.pii_classified AS pii_classified, n.min_ricci_kappa AS min_ricci_kappa,
                   n.oncall_available AS oncall_available, n.severity AS severity,
                   n.title AS title, n.action_type AS action_type, n.doc_type AS doc_type,
                   n.function_name AS function_name, n.execution_cost AS execution_cost,
                   n.exposure AS exposure
            """,
        )
        if all_time:
            links = self.query(
                graph,
                """
                MATCH (a)-[r]->(b)
                RETURN coalesce(a.id, a.name) AS source, coalesce(b.id, b.name) AS target,
                       type(r) AS type, r.ricci_curvature AS ricci_curvature,
                       r.p99_latency_ms AS p99_latency_ms, r.weight AS pheromone_weight,
                       r.success_count AS success_count, r.last_updated AS last_updated,
                       r.penalty AS dark_penalty, r.risk_score AS risk_score,
                       r.is_fallback AS is_fallback, r.owner_a AS owner_a, r.owner_b AS owner_b,
                       r.verified_by AS verified_by, r.failure_reason AS failure_reason,
                       r.t_valid_from AS t_valid_from, r.t_valid_to AS t_valid_to,
                       r.t_tx_created AS t_tx_created, r.t_tx_superseded AS t_tx_superseded,
                       r.ttl_epoch AS ttl_epoch
                """,
            )
        else:
            links = self.query(
                graph,
                """
                MATCH (a)-[r]->(b)
                WHERE coalesce(r.t_valid_from, 0) <= $when
                  AND coalesce(r.t_valid_to, $future) > $when
                RETURN coalesce(a.id, a.name) AS source, coalesce(b.id, b.name) AS target,
                       type(r) AS type, r.ricci_curvature AS ricci_curvature,
                       r.p99_latency_ms AS p99_latency_ms, r.weight AS pheromone_weight,
                       r.success_count AS success_count, r.last_updated AS last_updated,
                       r.penalty AS dark_penalty, r.risk_score AS risk_score,
                       r.is_fallback AS is_fallback, r.owner_a AS owner_a, r.owner_b AS owner_b,
                       r.verified_by AS verified_by, r.failure_reason AS failure_reason,
                       r.t_valid_from AS t_valid_from, r.t_valid_to AS t_valid_to,
                       r.t_tx_created AS t_tx_created, r.t_tx_superseded AS t_tx_superseded,
                       r.ttl_epoch AS ttl_epoch
                """,
                {"when": when, "future": FAR_FUTURE},
            )
        # Memory edges have no valid-time. Always include them when viewing "now".
        if when >= int(meta.get("incident") or when):
            memory = self.query(
                graph,
                """
                MATCH (a)-[r]->(b)
                WHERE type(r) IN ['PHEROMONE_TRACE', 'DEAD_END', 'REMEMBERS', 'ABOUT', 'TRIGGERED_ON', 'SILENT_COLLISION_RISK']
                RETURN coalesce(a.id, a.name) AS source, coalesce(b.id, b.name) AS target,
                       type(r) AS type, r.ricci_curvature AS ricci_curvature,
                       r.weight AS pheromone_weight, r.penalty AS dark_penalty,
                       r.risk_score AS risk_score, r.verified_by AS verified_by,
                       r.failure_reason AS failure_reason, r.owner_a AS owner_a, r.owner_b AS owner_b
                """,
            )
            seen = {(link["source"], link["target"], link["type"]) for link in links}
            for link in memory:
                key = (link["source"], link["target"], link["type"])
                if key not in seen:
                    links.append(link)
        return {
            "tenant": tenant_id,
            "at_time": when,
            "baseline": meta.get("baseline"),
            "incident": meta.get("incident"),
            "nodes": nodes,
            "links": links,
        }

"""Bring your own system.

Turns a small YAML/JSON description of *your* services into a Kriose tenant
graph that the swarm can run on. See docs/bring-your-own-system.md for the
format and frontend/public/templates/kriose-system.yaml for a sample.

Validation errors are plain sentences meant to be shown to a person.
"""

from __future__ import annotations

import re
from typing import Any

from engine import FAR_FUTURE, KrioseEngine, graph_name

ACTION_ALIASES = {
    "restart": "RESTART",
    "throttle": "THROTTLE",
    "reroute": "REROUTE_AND_HEAL",
    "failover": "REROUTE_AND_HEAL",
    "reroute_and_heal": "REROUTE_AND_HEAL",
}
DEFAULT_ACTION_NAMES = {
    "RESTART": "Restart {hot}",
    "THROTTLE": "Throttle traffic into {hot} by 30%",
    "REROUTE_AND_HEAL": "Move {hot} traffic to {standby}",
}


class SpecError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def slug(value: Any) -> str:
    text = re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower()).strip("_")
    return text or "x"


def _num(value: Any, where: str, errors: list[str], default: float | None = None) -> float:
    if value is None:
        if default is None:
            errors.append(f"{where} is missing.")
            return 0.0
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        errors.append(f"{where} should be a number, got {value!r}.")
        return default or 0.0


def spans_to_spec(spans: list[dict[str, Any]]) -> dict[str, Any]:
    """OTel-style spans (backend/fixtures/otel/spans.json format) to services + dependencies."""
    services: dict[str, dict[str, Any]] = {}
    deps: list[dict[str, Any]] = []
    for span in spans:
        if not isinstance(span, dict) or not span.get("service"):
            continue
        name = str(span["service"])
        sid = slug(name)
        svc = services.setdefault(sid, {"id": sid, "name": name, "tier": 1, "capacity": 100})
        if span.get("current_load") is not None:
            svc["load"] = span["current_load"]
        if span.get("upstream"):
            up = str(span["upstream"])
            services.setdefault(slug(up), {"id": slug(up), "name": up, "tier": 1, "capacity": 100})
            deps.append({"from": slug(up), "to": sid, "p99_ms": span.get("p99_latency_ms", 50)})
    for svc in services.values():
        svc.setdefault("load", 50)
    return {"services": list(services.values()), "dependencies": deps}


def normalize(raw: Any) -> dict[str, Any]:
    """Validate a system description. Raises SpecError with friendly messages."""
    if isinstance(raw, list):
        raw = {"spans": raw}
    if not isinstance(raw, dict):
        raise SpecError(["The file should be a YAML/JSON object with services, dependencies, owners, runbook and alert."])
    errors: list[str] = []
    spec = dict(raw)
    if spec.get("spans"):
        if not isinstance(spec["spans"], list):
            raise SpecError(["spans should be a list of spans like backend/fixtures/otel/spans.json."])
        derived = spans_to_spec(spec["spans"])
        known = {slug(s.get("id", s.get("name"))) for s in spec.get("services") or [] if isinstance(s, dict)}
        spec["services"] = list(spec.get("services") or []) + [s for s in derived["services"] if s["id"] not in known]
        spec["dependencies"] = list(spec.get("dependencies") or []) + derived["dependencies"]

    name = str(spec.get("name") or "my-system")
    tenant = "byo_" + slug(name)[:40]

    services: dict[str, dict[str, Any]] = {}
    raw_services = spec.get("services")
    if not isinstance(raw_services, list) or not raw_services:
        errors.append("Add at least one service under `services:` (or paste OTel spans under `spans:`).")
        raw_services = []
    for i, item in enumerate(raw_services):
        where = f"services[{i}]"
        if not isinstance(item, dict):
            errors.append(f"{where} should be an object with id, load and capacity.")
            continue
        sid = slug(item.get("id") or item.get("name") or "")
        if sid == "x":
            errors.append(f"{where} needs an `id`.")
            continue
        where = f"Service `{sid}`"
        if sid in services:
            errors.append(f"{where} is listed twice.")
            continue
        load = _num(item.get("load"), f"{where}: load", errors)
        cap = _num(item.get("capacity"), f"{where}: capacity", errors, 100.0)
        if cap <= 0:
            errors.append(f"{where}: capacity must be above 0.")
        tier = int(_num(item.get("tier"), f"{where}: tier", errors, 1.0))
        services[sid] = {
            "id": sid,
            "name": str(item.get("name") or item.get("id")),
            "tier": tier,
            "load": load,
            "capacity": cap,
            "pii": bool(item.get("pii", False)),
            "public": bool(item.get("public", False)),
            "owner": slug(item["owner"]) if item.get("owner") else None,
            "standby_for": slug(item["standby_for"]) if item.get("standby_for") else None,
        }

    deps: list[dict[str, Any]] = []
    for i, item in enumerate(spec.get("dependencies") or []):
        if not isinstance(item, dict):
            errors.append(f"dependencies[{i}] should look like `{{from: web, to: cart}}`.")
            continue
        src, dst = slug(item.get("from", "")), slug(item.get("to", ""))
        for end in (src, dst):
            if end not in services:
                errors.append(f"Dependency {item.get('from')} → {item.get('to')}: there is no service called `{end}`.")
        if src == dst:
            errors.append(f"Dependency {src} → {dst} points at itself.")
        deps.append({"from": src, "to": dst, "p99_ms": _num(item.get("p99_ms"), f"Dependency {src} → {dst}: p99_ms", errors, 50.0)})

    owners: dict[str, dict[str, Any]] = {}
    for i, item in enumerate(spec.get("owners") or []):
        if not isinstance(item, dict) or not (item.get("id") or item.get("name")):
            errors.append(f"owners[{i}] needs an `id` and a `name`.")
            continue
        oid = slug(item.get("id") or item.get("name"))
        owners[oid] = {"id": oid, "name": str(item.get("name") or oid), "slack": str(item.get("slack") or f"@{oid}"), "role": str(item.get("role") or "Engineer")}
    for svc in services.values():
        if svc["owner"] and svc["owner"] not in owners:
            owners[svc["owner"]] = {"id": svc["owner"], "name": svc["owner"].replace("_", " ").title(), "slack": f"@{svc['owner']}", "role": "Engineer"}
        if svc["standby_for"] and svc["standby_for"] not in services:
            errors.append(f"Service `{svc['id']}` is a standby for `{svc['standby_for']}`, which isn't in services.")

    alert = spec.get("alert")
    hot = None
    if not isinstance(alert, dict) or not alert.get("service"):
        errors.append("Add an `alert:` with the `service` that is paging and a `title`.")
    else:
        hot = slug(alert["service"])
        if hot not in services:
            errors.append(f"The alert points at `{alert['service']}`, but there is no service with that id.")
            hot = None

    standby = None
    if hot:
        standby = next((s["id"] for s in services.values() if s["standby_for"] == hot), None)

    actions: list[dict[str, Any]] = []
    raw_actions = spec.get("runbook")
    if not isinstance(raw_actions, list) or not raw_actions:
        errors.append("Add at least one fix under `runbook:` (type: restart, throttle or reroute).")
        raw_actions = []
    seen: set[str] = set()
    for i, item in enumerate(raw_actions):
        if isinstance(item, str):
            item = {"type": item}
        if not isinstance(item, dict):
            errors.append(f"runbook[{i}] should be an object with a `type`.")
            continue
        kind = ACTION_ALIASES.get(slug(item.get("type", "")))
        if not kind:
            errors.append(f"runbook[{i}]: type `{item.get('type')}` isn't supported yet. Use restart, throttle or reroute.")
            continue
        if kind in seen:
            errors.append(f"runbook: `{item.get('type')}` is listed twice.")
            continue
        seen.add(kind)
        if kind == "REROUTE_AND_HEAL" and hot and not standby:
            errors.append(f"A reroute needs somewhere to go: mark a service with `standby_for: {hot}`.")
        hot_name = services[hot]["name"] if hot else "the service"
        standby_name = services[standby]["name"] if standby else "standby"
        actions.append(
            {
                "id": "act_" + kind.lower(),
                "type": kind,
                "name": str(item.get("name") or DEFAULT_ACTION_NAMES[kind].format(hot=hot_name, standby=standby_name)),
                "cost": _num(item.get("cost"), f"runbook `{item.get('type')}`: cost", errors, 1.0),
                "successes": _num(item.get("past_successes"), f"runbook `{item.get('type')}`: past_successes", errors, 1.0),
                "broke_before": str(item["broke_before"]) if item.get("broke_before") else None,
            }
        )

    if errors:
        raise SpecError(errors)

    callers = sorted((d["from"] for d in deps if d["to"] == hot), key=lambda sid: -services[sid]["load"])
    return {
        "name": name,
        "tenant": tenant,
        "alert": {"id": "alert_" + slug(hot), "title": str(alert.get("title") or f"{services[hot]['name']} is overloaded"), "service": hot},
        "hot": hot,
        "caller": callers[0] if callers else hot,
        "callers": callers,
        "standby": standby,
        "services": list(services.values()),
        "dependencies": deps,
        "owners": list(owners.values()),
        "actions": actions,
    }


def seed(engine: KrioseEngine, raw: Any) -> dict[str, Any]:
    spec = normalize(raw)
    name = graph_name(spec["tenant"])
    engine.delete_graph(name)
    t = engine.times
    total = sum(a["successes"] for a in spec["actions"]) or 1.0
    active = {"vf": t["week_ago"], "vt": FAR_FUTURE, "tc": t["week_ago"], "ts": FAR_FUTURE}
    q = lambda cypher, params=None: engine.query(name, cypher, params or {})  # noqa: E731

    hot = spec["hot"]
    owner_of = {s["id"]: s["owner"] for s in spec["services"]}
    q(
        """
        CREATE (:Meta {id: 'clock', baseline: $baseline, incident: $now, seeded_at: $now, source: 'byo'})
        CREATE (:TopologyMap {id: 'map', custom: true, checkout: $caller, payment: $caller, token: $hot,
                              standby: $standby, fraud: $caller, ledger: $hot,
                              token_owner: $hot_owner, payment_owner: $caller_owner})
        """,
        {
            "baseline": t["baseline"], "now": t["now"], "caller": spec["caller"], "hot": hot,
            "standby": spec["standby"] or hot, "hot_owner": owner_of.get(hot) or "",
            "caller_owner": owner_of.get(spec["caller"]) or "",
        },
    )
    for s in spec["services"]:
        q(
            "CREATE (:Service {id: $id, name: $name, tier: $tier, current_load: $load, max_capacity: $cap, pii_classified: $pii, error_rate: 0.0})",
            {"id": s["id"], "name": s["name"], "tier": s["tier"], "load": s["load"], "cap": s["capacity"], "pii": s["pii"]},
        )
    for o in spec["owners"]:
        q(
            "CREATE (:Engineer {id: $id, name: $name, role: $role, slack_handle: $slack, oncall_available: true})",
            o,
        )
    edge_t = "t_valid_from: $vf, t_valid_to: $vt, t_tx_created: $tc, t_tx_superseded: $ts"
    called = {d["to"] for d in spec["dependencies"]}
    entries = [s for s in spec["services"] if s["public"]] or [s for s in spec["services"] if s["id"] not in called]
    if entries:
        q("CREATE (:Ingress {id: 'ing_public', name: 'Public traffic', exposure: 'public', rate_limit_rps: 5000})")
        q("CREATE (:AuthMiddleware {id: 'auth_edge', name: 'Auth', jwt_enforced: true, mfa_required: true})")
        q(f"MATCH (a:Ingress {{id: 'ing_public'}}), (b:AuthMiddleware {{id: 'auth_edge'}}) CREATE (a)-[:DEPENDS_ON {{p99_latency_ms: 5, call_weight: 1, is_fallback: false, {edge_t}}}]->(b)", active)
        for s in entries:
            q(f"MATCH (a:AuthMiddleware {{id: 'auth_edge'}}), (b:Service {{id: $id}}) CREATE (a)-[:DEPENDS_ON {{p99_latency_ms: 5, call_weight: 1, is_fallback: false, {edge_t}}}]->(b)", {**active, "id": s["id"]})
    for d in spec["dependencies"]:
        q(
            f"MATCH (a:Service {{id: $src}}), (b:Service {{id: $dst}}) CREATE (a)-[:DEPENDS_ON {{p99_latency_ms: $p99, call_weight: 1, is_fallback: false, {edge_t}}}]->(b)",
            {**active, "src": d["from"], "dst": d["to"], "p99": d["p99_ms"]},
        )
    for s in spec["services"]:
        if s["standby_for"]:
            q(f"MATCH (a:Service {{id: $src}}), (b:Service {{id: $dst}}) CREATE (a)-[:HAS_FALLBACK {{{edge_t}}}]->(b)", {**active, "src": s["standby_for"], "dst": s["id"]})
        if s["owner"]:
            q(
                f"MATCH (e:Engineer {{id: $eng}}), (b:Service {{id: $id}}) CREATE (e)-[:OWNS {{ownership_score: 0.9, is_primary_oncall: true, {edge_t}}}]->(b)",
                {**active, "eng": s["owner"], "id": s["id"]},
            )
    alert = spec["alert"]
    q(
        f"""
        MATCH (s:Service {{id: $hot}})
        CREATE (a:Alert {{id: $id, title: $title, severity: 'CRITICAL', active: true}})-[:TRIGGERED_ON {{{edge_t}}}]->(s)
        """,
        {**active, "hot": hot, "id": alert["id"], "title": alert["title"]},
    )
    for act in spec["actions"]:
        q(
            """
            MATCH (al:Alert {id: $alert})
            CREATE (r:RunbookAction {id: $id, name: $name, action_type: $type, execution_cost: $cost, cypher_template: $type})
            CREATE (al)-[:PHEROMONE_TRACE {weight: $w, success_count: $n, evaporation_rate: 0.05, last_updated: $week_ago}]->(r)
            """,
            {
                "alert": alert["id"], "id": act["id"], "name": act["name"], "type": act["type"], "cost": act["cost"],
                "w": round(0.3 + 0.6 * act["successes"] / total, 3), "n": act["successes"], "week_ago": t["week_ago"],
            },
        )
        if act["broke_before"]:
            q(
                """
                MATCH (s:Service {id: $hot}), (r:RunbookAction {id: $id})
                CREATE (s)-[:DEAD_END {penalty: 0.95, failure_reason: $reason, verified_by: 'PROD', ttl_epoch: $ttl}]->(r)
                """,
                {"hot": hot, "id": act["id"], "reason": act["broke_before"], "ttl": t["now"] + 172800},
            )
    engine.compute_ricci(name)
    return {"tenant": spec["tenant"], "graph": name, "alert_id": alert["id"], "services": len(spec["services"]), "actions": [a["type"] for a in spec["actions"]]}


def apply_mutation(engine: KrioseEngine, graph: str, action_type: str, roles: dict[str, str], now: int) -> None:
    """Generic versions of the three runbook moves for imported systems."""
    hot = roles["token"]
    if action_type == "RESTART":
        return
    if action_type == "THROTTLE":
        engine.query(graph, "MATCH (s:Service {id: $id}) SET s.current_load = s.current_load * 0.7", {"id": hot})
        engine.query(graph, "MATCH (c:Service)-[:DEPENDS_ON]->(:Service {id: $id}) SET c.current_load = c.current_load * 0.7", {"id": hot})
        return
    if action_type == "REROUTE_AND_HEAL":
        standby = roles["standby"]
        if standby == hot:
            raise ValueError("reroute needs a standby service")
        engine.query(
            graph,
            """
            MATCH (h:Service {id: $hot}), (s:Service {id: $standby})
            WITH h, s, h.current_load * 0.67 AS moved
            SET h.current_load = h.current_load - moved, s.current_load = s.current_load + moved
            """,
            {"hot": hot, "standby": standby},
        )
        engine.query(
            graph,
            """
            MATCH (c:Service)-[:DEPENDS_ON]->(:Service {id: $hot}), (s:Service {id: $standby})
            WHERE c.id <> s.id
            MERGE (c)-[e:DEPENDS_ON]->(s)
            SET e.is_fallback = true, e.p99_latency_ms = 40, e.call_weight = 1,
                e.t_valid_from = $now, e.t_valid_to = $future, e.t_tx_created = $now, e.t_tx_superseded = $future
            """,
            {"hot": hot, "standby": standby, "now": now, "future": FAR_FUTURE},
        )
        return
    raise ValueError(f"unknown action {action_type}")

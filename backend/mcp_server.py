"""FastMCP tools. Same operations as the HTTP API."""

from __future__ import annotations

from fastmcp import FastMCP

from engine import KrioseEngine
from swarm import Swarm

mcp = FastMCP("Kriose")
_engine = KrioseEngine()
_swarm = Swarm(_engine)


@mcp.tool(name="mcp_get_4d_graph")
def mcp_get_4d_graph(tenant: str = "org_acme", at_time: int = 0) -> dict:
    """Return the valid-time subgraph for a tenant."""
    return _engine.snapshot(tenant, at_time or None)


@mcp.tool(name="mcp_4d_time_travel_diff")
def mcp_4d_time_travel_diff(tenant: str = "org_acme", t1: int = 0, t2: int = 0) -> dict:
    """Edges created, invalidated, or late-discovered between t1 and t2."""
    meta = _engine.meta(f"kriose_{tenant}")
    baseline = int(t1 or meta.get("baseline") or 0)
    incident = int(t2 or meta.get("incident") or 0)
    return {"t1": baseline, "t2": incident, "rows": _engine.temporal_diff(tenant, baseline, incident)}


@mcp.tool(name="mcp_compute_ricci_curvature")
def mcp_compute_ricci_curvature(tenant: str = "org_acme") -> dict:
    """Write discrete curvature onto DEPENDS_ON edges and return bottlenecks."""
    rows = _engine.compute_ricci(f"kriose_{tenant}")
    bottlenecks = [row for row in rows if float(row.get("ollivier_ricci_kappa") or 0) < -0.50]
    return {"edges": rows, "bottlenecks": bottlenecks}


@mcp.tool(name="mcp_run_mcgts_nemesis")
def mcp_run_mcgts_nemesis(tenant: str = "org_acme", alert_id: str = "alert_991") -> dict:
    """Run Scout, shadow copies, Nemesis shock, and the Arbiter merge."""
    return _swarm.simulate(tenant, alert_id)


@mcp.tool(name="mcp_sync_zk_hivemind")
def mcp_sync_zk_hivemind(tenant: str = "org_finserv", action_type: str = "RESTART") -> dict:
    """Publish an anonymized failure motif into the hive graph."""
    from engine import ACME, FINSERV

    spec = ACME if tenant == "org_acme" else FINSERV
    published = _engine.publish_failure_motif(spec["tenant"], spec["token"][0], action_type, "mcp sync")
    return {"published": published, "hive": _engine.hive_view()}


@mcp.tool(name="mcp_seed_demo")
def mcp_seed_demo() -> dict:
    """Seed Acme, Finserv, the compiler fixtures, and the hive motif."""
    return _engine.reset_demo()


if __name__ == "__main__":
    mcp.run()

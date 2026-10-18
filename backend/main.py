"""FastAPI gateway. The swarm stream is server-sent events."""

from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from engine import KrioseEngine
from swarm import Swarm

app = FastAPI(title="Kriose", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = KrioseEngine()
swarm = Swarm(engine)


def require_db() -> None:
    if not engine.ping():
        raise HTTPException(status_code=503, detail="FalkorDB is not reachable on port 6379")


@app.get("/api/v2/health")
def health():
    ok = engine.ping()
    graphs = engine.list_graphs() if ok else []
    return {"ok": ok, "graphs": graphs}


@app.post("/api/v2/seed")
def seed(tenant: str = Query(default="")):
    require_db()
    if tenant and tenant not in ("org_acme", "org_finserv", "demo"):
        spec_only = tenant
        return {"error": f"unknown tenant {spec_only}. Use org_acme, org_finserv, or omit for the full demo."}
    if tenant in ("", "demo"):
        return engine.reset_demo()
    from engine import ACME, FINSERV

    spec = ACME if tenant == "org_acme" else FINSERV
    seeded = engine.seed_spec(spec)
    if tenant == "org_acme":
        from compiler import ingest

        seeded["compiler"] = ingest(engine, tenant)
    engine.compute_ricci(seeded["graph"])
    seeded["ghosts"] = engine.detect_ghosts(seeded["graph"])
    return seeded


@app.get("/api/v2/graph")
def graph(tenant: str = "org_acme", at_time: int = 0):
    require_db()
    return engine.snapshot(tenant, at_time or None)


@app.get("/api/v2/temporal-diff")
def temporal_diff(tenant: str = "org_acme", t1: int = 0, t2: int = 0):
    require_db()
    meta = engine.meta(f"kriose_{tenant}")
    baseline = int(t1 or meta.get("baseline") or 0)
    incident = int(t2 or meta.get("incident") or 0)
    return {"tenant": tenant, "t1": baseline, "t2": incident, "rows": engine.temporal_diff(tenant, baseline, incident)}


@app.get("/api/v2/ricci-map")
def ricci_map(tenant: str = "org_acme"):
    require_db()
    graph_name = f"kriose_{tenant}"
    rows = engine.compute_ricci(graph_name)
    return {"tenant": tenant, "edges": rows}


@app.post("/api/v2/swarm/simulate")
def simulate(tenant: str = "org_acme", alert_id: str = "alert_991"):
    require_db()

    def generate():
        result = swarm.simulate(tenant, alert_id)
        for event in result["events"]:
            yield f"data: {json.dumps(event, default=str)}\n\n"
        summary = {key: value for key, value in result.items() if key != "events"}
        yield f"data: {json.dumps({'agent': 'ARBITER', 'kind': 'done', 'detail': summary}, default=str)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/api/v2/hivemind/sync")
def hivemind_sync(tenant: str = "org_finserv", action_type: str = "RESTART"):
    require_db()
    from engine import ACME, FINSERV

    spec = ACME if tenant == "org_acme" else FINSERV
    published = engine.publish_failure_motif(
        spec["tenant"], spec["token"][0], action_type, "manual sync"
    )
    return {"published": published, "hive": engine.hive_view()}


@app.get("/api/v2/hivemind")
def hivemind():
    require_db()
    return engine.hive_view()

"""FastAPI gateway. The swarm stream is server-sent events."""

from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from engine import KrioseEngine, clock, graph_name
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


def _jsonable(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return str(value)


class CypherBody(BaseModel):
    graph: str = Field(min_length=1, max_length=128)
    cypher: str = Field(min_length=1, max_length=20000)


class GraphBody(BaseModel):
    tenant: str = Field(min_length=1, max_length=64)


class ImportBody(BaseModel):
    system: dict | list | None = None
    text: str | None = None


@app.post("/api/v2/import")
def import_system(body: ImportBody):
    """Load a user's own system (YAML/JSON text or a parsed object) as a tenant."""
    require_db()
    import byo
    import yaml

    raw = body.system
    if raw is None:
        try:
            raw = yaml.safe_load(body.text or "")
        except yaml.YAMLError as exc:
            mark = getattr(exc, "problem_mark", None)
            where = f" on line {mark.line + 1}" if mark else ""
            raise HTTPException(status_code=422, detail={"errors": [f"That isn't valid YAML or JSON{where}."]})
    try:
        return byo.seed(engine, raw)
    except byo.SpecError as exc:
        raise HTTPException(status_code=422, detail={"errors": exc.errors})


@app.get("/api/v2/graph")
def graph(tenant: str = "", graph: str = "", at_time: int = 0, all_time: int = 0):
    require_db()
    if graph:
        tenant_id = graph.removeprefix("kriose_")
    else:
        tenant_id = tenant or "org_acme"
    if not tenant_id.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="tenant id must be alphanumeric")
    return engine.snapshot(tenant_id, at_time or None, all_time=bool(all_time))


@app.post("/api/v2/graphs")
def create_graph(body: GraphBody):
    require_db()
    tenant_id = body.tenant.strip()
    if not tenant_id.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="tenant id must be alphanumeric")
    times = clock()
    name = graph_name(tenant_id)
    engine.query(
        name,
        """
        MERGE (m:Meta {id: 'clock'})
        SET m.baseline = $baseline, m.incident = $incident
        """,
        {"baseline": times["baseline"], "incident": times["incident"]},
    )
    return {"graph": name, "tenant": tenant_id, "baseline": times["baseline"], "incident": times["incident"]}


@app.post("/api/v2/cypher")
def run_cypher(body: CypherBody):
    require_db()
    name = body.graph.strip()
    if not name.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="graph name must be alphanumeric")
    try:
        rows = engine.query(name, body.cypher)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"graph": name, "rows": _jsonable(rows), "count": len(rows)}


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


@app.post("/api/v2/swarm/stream")
def swarm_stream(tenant: str = "org_acme", alert_id: str = "alert_991"):
    return simulate(tenant, alert_id)


@app.post("/api/v2/hivemind/publish")
def hivemind_publish(
    tenant: str,
    focus_id: str,
    action_type: str,
    failure_mode: str = "operator publish",
):
    require_db()
    if not focus_id or not action_type:
        raise HTTPException(status_code=400, detail="focus_id and action_type are required")
    published = engine.publish_failure_motif(tenant, focus_id, action_type, failure_mode)
    return {"published": published, "hive": engine.hive_view()}


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

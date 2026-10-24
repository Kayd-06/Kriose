from pathlib import Path

import pytest
import yaml

import byo
from swarm import Swarm

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "frontend" / "public" / "templates" / "kriose-system.yaml"


def test_friendly_errors():
    with pytest.raises(byo.SpecError) as err:
        byo.normalize({"services": [{"id": "a", "load": "lots"}], "alert": {"service": "nope"}})
    text = " ".join(err.value.errors)
    assert "should be a number" in text
    assert "no service with that id" in text
    assert "runbook" in text


def test_otel_spans_import():
    spans = [{"service": "Token-Vault-Cache", "upstream": "Payment-Core", "p99_latency_ms": 190, "current_load": 92}]
    spec = byo.normalize({"spans": spans, "alert": {"service": "token_vault_cache"}, "runbook": ["restart"]})
    assert {s["id"] for s in spec["services"]} == {"token_vault_cache", "payment_core"}
    assert spec["caller"] == "payment_core"


def test_template_runs_through_swarm(engine):
    seeded = byo.seed(engine, yaml.safe_load(TEMPLATE.read_text()))
    result = Swarm(engine).simulate(seeded["tenant"], seeded["alert_id"])
    events = result["events"]
    skipped = [e["detail"]["action_id"] for e in events if e["kind"] == "skip"]
    assert "act_restart" in skipped
    merge = next(e for e in events if e["kind"] == "merge")
    assert merge["detail"]["action_id"] == "act_reroute_and_heal"
    assert result["winner"]

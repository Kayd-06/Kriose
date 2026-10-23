import time

from engine import KrioseEngine


def test_ping_fails_fast_on_unreachable_host(monkeypatch):
    monkeypatch.setenv("FALKORDB_CONNECT_TIMEOUT", "1")
    # TEST-NET-1 address: not routable, connects hang rather than being refused.
    kr = KrioseEngine(host="192.0.2.1", port=6379)
    start = time.monotonic()
    assert kr.ping() is False
    assert time.monotonic() - start < 5

#!/usr/bin/env bash
# Re-record frontend/public/demo/* from a running backend (docker compose up).
set -euo pipefail
B=${API:-http://localhost:8000/api/v2}
D="$(dirname "$0")/../frontend/public/demo"
curl -fsS -X POST "$B/seed" >/dev/null
curl -fsS "$B/health" > "$D/health.json"
curl -fsS "$B/graph?tenant=org_acme&all_time=1" > "$D/graph-before.json"
curl -fsS "$B/hivemind" > "$D/hive-before.json"
API="$B" OUT="$D/swarm-run.json" python3 - <<'PY'
import json, os, time, urllib.request
req = urllib.request.Request(os.environ["API"] + "/swarm/simulate?tenant=org_acme&alert_id=alert_991", method="POST")
t0, events = time.time(), []
for line in urllib.request.urlopen(req):
    if line.startswith(b"data: "):
        events.append({"at_ms": round((time.time() - t0) * 1000), "event": json.loads(line[6:])})
json.dump(events, open(os.environ["OUT"], "w"))
PY
curl -fsS "$B/graph?tenant=org_acme&all_time=1" > "$D/graph-after.json"
curl -fsS "$B/hivemind" > "$D/hive-after.json"
curl -fsS -X POST "$B/seed" >/dev/null
echo "recorded into $D"

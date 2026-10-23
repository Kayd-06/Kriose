# Recorded demo data

Captured from the real backend (`docker compose up`, then `POST /api/v2/seed`):

- `health.json` – `GET /api/v2/health`
- `graph-before.json` / `hive-before.json` – `GET /graph?tenant=org_acme&all_time=1` and `GET /hivemind` after seeding
- `swarm-run.json` – every SSE event of `POST /swarm/simulate?tenant=org_acme&alert_id=alert_991`, with `at_ms` arrival time
- `graph-after.json` / `hive-after.json` – the same reads after the run

Re-record with `scripts/record-demo.sh` while the stack is running.

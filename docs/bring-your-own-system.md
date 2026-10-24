# Bring your own system

Kriose ships with a demo incident, but you can describe your own system and watch it test *your* fixes.

In the app, click **Try your own system** (on the landing page or in the "Next step" box). Then paste or upload YAML/JSON, or click **Use the sample** / **↓ Download template** ([`frontend/public/templates/kriose-system.yaml`](../frontend/public/templates/kriose-system.yaml)).

## Format

```yaml
name: Corner Shop
alert:
  title: Cart API p99 above 2s
  service: cart            # the service that is paging
services:
  - { id: web,  name: Web Storefront, load: 45, capacity: 100, public: true, owner: maya }
  - { id: cart, name: Cart API, load: 90, capacity: 100, pii: true, owner: dev }
  - { id: cart-standby, load: 10, capacity: 100, standby_for: cart, owner: dev }
dependencies:              # "from" calls "to"
  - { from: web, to: cart, p99_ms: 180 }
owners:
  - { id: maya, name: Maya Ortiz, slack: "@maya" }
runbook:
  - type: restart          # restart | throttle | reroute
    past_successes: 5
    broke_before: Restart dropped every cart session on 2026-09-14
  - { type: throttle, cost: 2 }
  - { type: reroute }      # needs a service with standby_for: <alert service>
```

| Field | Meaning |
| --- | --- |
| `services[].load` / `capacity` | Any unit. A tier-1 service (the default `tier`) over capacity fails the stress test. |
| `public` | Gets internet traffic. If you leave it out, services that nothing calls count as public. |
| `pii` | Holds sensitive data. The zero-trust check makes sure public traffic reaches it only through auth. |
| `standby_for` | Where a `reroute` sends traffic. |
| `runbook[].broke_before` | Kriose remembers this failure and skips the fix instead of re-testing it. |
| `past_successes`, `cost` | These set the order in which fixes are tried. |

What each fix does on the sandbox copy:
- `throttle` sheds 30% of the traffic going into the paging service.
- `restart` changes nothing, so it only helps if memory says it is safe.
- `reroute` moves two-thirds of the paging service's traffic to its standby and connects the callers to the standby.

Then the stress test hits the copy:
- 35% more load on the paging service
- 180 ms added to every edge that is already slower than 100 ms
- the paging service's owner marked unreachable

## OTel spans

Pass a list of spans in the [`backend/fixtures/otel/spans.json`](../backend/fixtures/otel/spans.json) format, either on its own or under `spans:` next to `alert:` and `runbook:`. Each span needs `service`, `upstream`, `p99_latency_ms` and `current_load`. Kriose works out the services and the dependencies from them. For an example, see [`frontend/public/templates/otel-spans.json`](../frontend/public/templates/otel-spans.json).

## Where it runs

- **With the API** (`docker compose up`): the frontend calls `POST /api/v2/import` with `{"system": {...}}` or `{"text": "<yaml>"}`. That creates a `byo_<name>` tenant graph in FalkorDB, and the full swarm runs on it with all four safety checks. Bad input comes back as `422 {"detail": {"errors": ["Service `cart`: load should be a number…"]}}`.
- **Hosted demo** (no backend): the file is checked and simulated in your browser by `frontend/src/byo/system.ts`. That covers the memory check, the sandbox copy, the stress test and the capacity check. It is a quick estimate, and the banner says so.

```bash
curl -X POST localhost:8000/api/v2/import -H 'content-type: application/json' \
  -d "{\"text\": $(python3 -c 'import json,sys;print(json.dumps(open(sys.argv[1]).read()))' frontend/public/templates/kriose-system.yaml)}"
curl -N -X POST 'localhost:8000/api/v2/swarm/simulate?tenant=byo_corner_shop&alert_id=alert_cart'
```

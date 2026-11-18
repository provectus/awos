# ShipLog

ShipLog is a small order-and-shipment-tracking platform. Merchants create orders through an HTTP API, register shipments against those orders, and receive carrier status updates as webhooks. A background worker turns those updates into a per-shipment tracking history that support staff can query.

The codebase is plain CommonJS JavaScript with zero npm dependencies; everything runs on Node 22 using only `node:` built-ins.

## Layout

- `services/gateway-api/` — the public HTTP API (orders, shipments, carrier webhooks, health). Start it with `node services/gateway-api/bin/start.js`.
- `services/tracking-worker/` — the background worker that maintains shipment tracking records. Start it with `node services/tracking-worker/bin/start.js`.
- `packages/shared/` — domain models, validation, configuration, and the shared job queue used by both services.
- `tests/` — the test suite (`npm test`, which runs `node --test tests/`).

## Data

All state is file-backed JSON under `var/` by default (configurable via `SHIPLOG_*` environment variables, see `packages/shared/src/config.js`):

- `var/orders/` — order records owned by the gateway.
- `var/tracking/` — shipment tracking records owned by the worker.
- `var/queue/` — the durable job queue connecting the two services.

## Authentication

API calls require a bearer token (`SHIPLOG_API_TOKEN`). Carrier webhooks are authenticated with a shared secret header (`x-shiplog-webhook-secret`, configured via `SHIPLOG_WEBHOOK_SECRET`). The health endpoint is public.

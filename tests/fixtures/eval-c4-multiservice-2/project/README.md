# MeterHub

MeterHub is a small utility platform for smart-meter ingestion and billing. Field devices submit cumulative meter readings over HTTP, a billing engine turns those readings into cycle invoices, and a customer portal exposes usage history and invoices to end customers.

## Services

- **ingest-api** (`services/ingest-api/`) — the HTTP API field devices talk to. It owns the meter registry, validates and normalizes incoming readings against it, and hands accepted readings off for billing. It keeps no reading data of its own.
- **billing-engine** (`services/billing-engine/`) — the billing back end. It persists accepted readings, computes billing cycles from cumulative register values, prices usage against the rate tables, and issues invoices. Per-customer rate tables were folded into the billing engine when the standalone rates service was retired. The engine exposes no HTTP API.
- **portal-api** (`services/portal-api/`) — the customer-facing HTTP API. It serves usage history and invoices through read-only views over the billing data.

Shared models, validation, configuration, and the queue the services communicate through live in `packages/core/`.

## State

All state is file-backed JSON under `var/` (relocatable via `METERHUB_*` environment variables; see `packages/core/src/config.js`):

- `var/meters/` — the meter registry, owned by ingest-api.
- `var/readings/` and `var/invoices/` — owned by billing-engine.
- `var/queue/` — the shared work queue.

## Running

Each service has a `bin/start.js`. There are no npm dependencies; everything runs on Node 22 built-ins.

```sh
node services/ingest-api/bin/start.js
node services/billing-engine/bin/start.js
node services/portal-api/bin/start.js
```

## Tests

```sh
npm test
```

Tests are hermetic: every test creates its own temp directory for stores and queue, and cleans it up afterwards.

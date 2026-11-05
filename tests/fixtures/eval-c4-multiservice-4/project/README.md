# Atlas

Atlas is an e-commerce order platform: customers build carts, ask for priced quotes, and check out; behind the two HTTP APIs, prices are quoted from a rates store, promotions are applied, payment is authorized and captured, stock is reserved, and an order record is created — all coordinated by a checkout saga.

## Services

- **catalog-api** (`services/catalog-api/`) — HTTP. Products, variants, and a stock-level read model kept current by an embedded projector. Owns the catalog store (`var/catalog/`).
- **pricing-service** (`services/pricing-service/`) — background worker. Consumes pricing commands and emits price-quoted events. Owns the rates store (`var/rates/`): base prices, per-currency rounding rules, conversion table, volume tiers.
- **promotions-service** (`services/promotions-service/`) — background worker. Consumes quote events, applies promotion rules, emits promotion-applied events. Owns the promotions store (`var/promos/`).
- **cart-api** (`services/cart-api/`) — HTTP. Carts and line management; requests quotes through the command queue and reads checkout state back through read-only views. Owns the carts store (`var/carts/`).
- **checkout-orchestrator** (`services/checkout-orchestrator/`) — background worker. The checkout saga: payment authorization, stock reservation, order creation. Owns the orders store (`var/orders/`) and the pricing ledger (`var/ledger/`).
- **payments-gateway** (`services/payments-gateway/`) — background worker. Simulates authorization and capture with deterministic per-currency rules. Owns the payments journal (`var/payments/`).
- **stock-service** (`services/stock-service/`) — background worker. Reserve/release with an idempotency ledger. Owns the stock store (`var/stock/`).

Shared code lives in `packages/domain/` (models, validation, integer-minor-unit money arithmetic) and `packages/messaging/` (the two file-backed queues, envelopes, config, ids, clock).

## State

All state is file-backed JSON under `var/`, relocatable via `ATLAS_*` environment variables (see `packages/messaging/src/config.js`). Money is always integer minor units plus a currency code; floats never touch an amount.

## Running

Each service has a `bin/start.js`. There are no npm dependencies; everything runs on Node 22 built-ins.

```sh
node services/catalog-api/bin/start.js
node services/cart-api/bin/start.js
node services/pricing-service/bin/start.js
node services/promotions-service/bin/start.js
node services/checkout-orchestrator/bin/start.js
node services/payments-gateway/bin/start.js
node services/stock-service/bin/start.js
```

## Tests

```sh
npm test   # node --test 'tests/*.test.js'
```

Tests are hermetic: every test relocates all stores and both queues into a fresh temp directory.

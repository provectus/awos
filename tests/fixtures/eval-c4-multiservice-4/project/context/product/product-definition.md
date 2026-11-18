# Product Definition: Atlas

## What Atlas Is

Atlas is an e-commerce order platform. Shoppers build a cart in their own currency, ask for a priced quote, and check out. Behind the two public APIs, the platform prices the cart from a central rates table, applies whatever promotions the merchandising team has configured, authorizes and captures payment, reserves stock, and records an order. Every money amount in the platform is an integer count of a currency's minor units — cents, yen — and a float touching an amount is treated as a defect.

## Who Uses It

- **Shoppers** (through client applications) create carts, add and remove lines, request quotes, check out, and read back the state of their checkout.
- **Merchandisers** configure base prices, volume tiers, and promotion rules: percentage discounts, fixed amounts off, and buy-N-get-M. Every promotion carries a validity window, a stacking priority, and a per-customer usage cap.
- **Operations** reads product, variant, and stock-level information through the catalog, which stays current as reservations come and go.

## What the Platform Promises

1. **Quotes are honest.** A quote prices the cart's lines from the recorded rates, applies volume tiers, and shows each applied promotion as its own discount line. What the shopper sees quoted is what checkout charges.
2. **Checkout is coordinated, not monolithic.** Payment authorization, stock reservation, and order creation are separate concerns owned by separate services; a saga coordinates them and compensates when a step fails, so nothing stays held for an order that cannot complete.
3. **Payments are simulated deterministically.** The payments gateway stands in for a card processor with deterministic per-currency rules, so every flow — approval, decline — is reproducible in development and test.
4. **State is inspectable.** All platform state lives in file-backed stores owned by exactly one service each; any state can be read off disk, and the test suite relocates all of it per test.

## Current Scope

Carts, catalog, pricing with volume tiers, percentage and fixed-amount promotions, single-currency checkout in the platform's base currency, deterministic payment authorization and capture, all-or-nothing stock reservation with idempotent redelivery, and a catalog stock read model.

The next planned increment (spec 001) is multi-currency checkout with stacked promotions and partial payment capture.

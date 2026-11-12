# Functional Spec 001: Multi-Currency Checkout with Stacked Promotions and Partial Payment Capture

## Summary

Today Atlas quotes every cart in the platform's base currency, applies promotions without regard to their declared order, windows, or caps, and treats payment authorization as all-or-nothing. This feature makes the quote speak the cart's currency, makes promotions stack predictably and respect their own rules, and lets a checkout complete partially when the processor funds only part of the total.

## User Stories

1. As a shopper buying in euros or yen, I want my quote and my order in my cart's currency, converted from the recorded rates, so that the amount I see is the amount charged.
2. As a merchandiser, I want promotions to stack in the priority order I declared, each one visible as its own discount line, so that I can reason about what a cart will cost.
3. As a merchandiser, I want expired and capped promotions to simply not apply — without breaking the quote — and caps to count completed purchases, not window-shopping.
4. As a shopper whose payment is only partly approved, I want the funded part of my order confirmed and the rest released, with a status I can read back, rather than losing the whole order.

## Acceptance Criteria

### A. Currency conversion

- **A1.** A quote for a cart in currency X is issued in X. Line prices are converted from the rates store's base currency using the stored conversion table (integer micro-rates: one base unit buys `rateMicros / 1e6` target units).
- **A2.** Conversion of a base-currency amount `A` to the target currency is `halfEven(A × rateMicros × 10^(expTarget − expBase) / 1e6)`, where `exp` is each currency's minor-unit exponent and `halfEven` is the platform's round-half-even integer division. The per-currency rounding rules on file in the rates store govern the mode (half-even is the only implemented mode).
- **A3.** Rounding applies PER LINE: each line total (unit price × quantity, computed in base currency with volume tiers applied) is converted and rounded separately, and each quoted unit price is converted and rounded separately. The quote total is never produced by converting a base-currency sum.
- **A4.** A target currency with zero minor units (JPY) quotes whole integer amounts.

### B. Promotion stacking

- **B1.** Eligible promotions apply in ascending declared `priority`. Each applied promotion records exactly one discount line in the quote, and the quote's discount lines appear in that priority order.
- **B2.** `percentage`: the discount is computed per converted product line — `halfEven(lineTotal × bps / 10000)` for each line — and the per-line discounts are summed into the promotion's single discount line. It is never computed on the subtotal.
- **B3.** `fixed-amount`: a flat amount in the promotion's own currency, applied only when that currency matches the quote currency (silently contributing nothing otherwise). Fixed amounts apply after percentage promotions of lower priority value, per B1.
- **B4.** `buy-n-get-m` (parameters `buyCount`, `getCount`, counted over product LINES): when the quote has at least `buyCount + getCount` product lines, the `getCount` cheapest lines (by converted line total) are zeroed; the discount line's amount is the sum of those zeroed line totals. It applies at most once per quote.

### C. Validity windows and usage caps

- **C1.** A promotion whose validity window does not contain the quote time is skipped silently: the quote succeeds, no discount line, no error.
- **C2.** A promotion whose per-customer usage count has reached `perCustomerCap` is likewise skipped silently (a cap of 0 means uncapped).
- **C3.** Usage is counted ONLY when a checkout completes — confirmed or partially confirmed — and exactly once per completed checkout. Quoting never consumes the cap: a shopper may quote any number of carts with the discount applied before the first completed checkout counts.
- **C4.** A fully declined checkout never counts a use.

### D. The order total

- **D1.** The order total is the sum of the quote's rounded line totals minus the sum of its discount lines. It is computed once, by the checkout orchestrator, and persisted in the pricing ledger.
- **D2.** Every surface that shows the total — including the cart API — surfaces exactly the ledger total. Nothing downstream recomputes it.

### E. Partial payment capture

- **E1.** Payment authorization is requested for the ledger total. The gateway's deterministic rules authorize amounts up to the per-currency soft band in full; for an amount above the soft band (but not above the hard band) the gateway declines only the excess: it authorizes exactly the soft-band amount and reports the shortfall with decline code `over_band`. Above the hard band the authorization is declined entirely (`suspected_fraud`).
- **E2.** When the authorized amount is short of the total, the orchestrator funds lines cheapest-LAST: it walks the product lines by descending converted line total (ties broken by SKU ascending) and funds each line whose line total still fits within the remaining authorized amount; a line that does not fit is unfunded and the walk continues to the next line.
- **E3.** The captured amount equals the sum of the funded lines' line totals (order-level discount lines do not join the walk; they reduce only the requested authorization).
- **E4.** Stock reservations for the unfunded lines — and only those — are released, restoring exact counts.
- **E5.** The order persists as `partially_confirmed`, carrying `fundedLines` and `unfundedLines` as `{ sku, quantity }` sets listed in the funding walk order. A fully funded checkout confirms with all lines funded and none unfunded.

### F. Idempotency

- **F1.** A duplicated payment event (same order and attempt identity) must not capture twice and must not release twice. The (orderId, attemptId) pair is the identity of a payment interaction.
- **F2.** Stock released on a partial decline is keyed like reservations in the stock service's idempotency ledger, so a redelivered release replays its recorded outcome instead of mutating again.

### G. Read surfaces

- **G1.** The catalog's stock-level read model reflects the reservations and releases of the saga once its events are consumed — eventually, but exactly.
- **G2.** The cart API exposes `GET /carts/:id/checkout-status` returning `{ status, fundedLines, unfundedLines, total, currency }`, read through read-only views over the pricing ledger and the orders store. `total` is the full ledger order total (D2), also for a partially confirmed order.

## Out of Scope

- Voiding or re-authorizing the unfunded remainder of a partial authorization.
- Promotions scoped to specific SKUs or customer segments.
- Changing conversion rates mid-flight; a quote prices at the rates on file when it is made.

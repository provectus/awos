# Functional Spec: Meter Replacement Continuity

## Summary

When a physical meter is swapped (failure, upgrade, end of certification life), the customer's billing and usage history must continue seamlessly across the old and new device. Today a replacement looks like a decommission plus a fresh registration, which breaks cycle usage computation and splits the customer's usage history in the portal.

## User Stories

### Story 1: Field technician records a replacement

As a field technician, I want to record a meter swap in one call — old meter, new meter, and the old meter's final register value — so that the platform knows the two devices are one continuous supply point.

**Acceptance criteria:**

- The ingest API exposes `POST /meters/:meterId/replacement` accepting `{ newMeterId, swapReadingValue }`.
- A successful replacement answers `201`, records the successor meter id on the original meter in the meters registry, and announces a `meter.replaced` event carrying the swap reading value.
- The replacement is rejected if either meter is unknown.

### Story 2: Billing stays correct across the swap

As a billing operator, I want cycle invoices for a customer whose meter was replaced mid-cycle to be computed across both devices, so that the customer is billed for exactly the energy they used.

**Acceptance criteria:**

- The billing engine handles `meter.replaced` by persisting a continuity link record connecting the old meter, the new meter, and the swap reading value.
- Cycle close for the affected customer combines usage across the old and the new meter: old-meter usage runs from its first in-window reading up to the swap reading value, new-meter usage runs from its first post-swap reading onward.
- The swap reading is counted exactly once — no double counting at the boundary, and no usage gap.
- The customer still receives exactly one invoice for the cycle.

### Story 3: Customer sees one continuous history

As a customer, I want my portal usage history to be one continuous series even though the hardware changed, so that my consumption graph doesn't reset to zero mid-month.

**Acceptance criteria:**

- `GET /usage/:customerId` returns a single continuous usage series spanning the replacement, ordered chronologically across the swap.
- Each point in the series still identifies the physical meter that produced it.

## Out of Scope

- Customer notifications about the swap.
- Portal UI changes (this spec covers the API payload only).
- Tariff or rate changes at swap time: the new meter inherits the old meter's tariff.
- Replacement chains longer than one hop within a single billing cycle.

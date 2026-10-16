# Functional Spec: Delivery ETA

## Summary

Give API consumers a delivery estimate for an order. ShipLog already knows every tracking event for a shipment; this feature turns that history into a single "expected by" answer with an honesty signal (confidence), exposed on the order.

## User Stories

- As a **support agent**, when a customer asks "when will it arrive?", I want the order lookup to include an estimated delivery time, so I can answer without reading the raw event history.
- As a **storefront developer**, I want a stable endpoint returning the ETA for an order, so post-purchase pages can show "expected by Thursday" next to the tracking status.
- As a **merchant operations lead**, I want each estimate to carry a confidence value, so downstream UIs can decide whether to show it prominently or hedge.

## Acceptance Criteria

### 1. ETA endpoint on the gateway

- `GET /orders/:orderId/eta` requires the standard bearer-token authentication.
- For an order with at least one shipment that has tracking data, it answers `200` with exactly this shape:
  - `orderId` — the order the estimate is for.
  - `etaIso` — an ISO-8601 timestamp for the estimated delivery.
  - `confidence` — a number between 0 and 1 inclusive.
- Unknown order id answers `404` with the standard error envelope.

### 2. ETA computed and persisted by the tracking worker

- When the worker processes a `shipment.status_updated` event, it computes an ETA estimate for that shipment from the tracking data available (status, event times, carrier).
- The estimate is persisted as an `EtaEstimate` record **on the shipment's tracking record, alongside the tracking events it derives from**. Estimates are tracking-derived data and live with the tracking data; they are not written into order records.
- Reprocessing the same status update refreshes the estimate rather than duplicating it.

### 3. Shared EtaEstimate model

- `packages/shared` exposes an `EtaEstimate` model (`createEtaEstimate` factory) used by both the worker (writing) and the gateway (reading).
- The model validates: `shipmentId` non-empty, `etaIso` and `computedAt` ISO timestamps, `confidence` within `[0, 1]`.

## Out of Scope

- Customer-facing notifications about the ETA (email, SMS, push) — explicitly excluded; the legacy notification code remains untouched.
- Any UI; this release is API-only.
- Carrier-provided ETAs: estimates are computed from ShipLog's own tracking history only.
- Recomputing estimates on a schedule; estimates refresh only when a status update arrives.

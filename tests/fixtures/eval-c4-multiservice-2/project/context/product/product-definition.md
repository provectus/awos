# Product Definition: MeterHub

## Vision

MeterHub gives small and mid-size utilities a dependable path from a smart meter in the field to an accurate invoice in a customer's inbox — without a data warehouse, a message broker cluster, or a billing vendor contract.

## Problem

Utilities that roll out smart meters inherit three problems at once: a firehose of device readings of uneven quality, billing rules that depend on cumulative register arithmetic rather than simple sums, and customers who expect to see their own usage the same day. Off-the-shelf billing suites solve this at a price and complexity point that excludes smaller operators.

## Target Users

- **Field devices / device gateways** — smart meters (or the gateways aggregating them) that push cumulative register readings on a schedule.
- **Billing operations staff** — configure tariffs, trigger cycle closes, and investigate disputed invoices.
- **End customers** — view their usage history and invoices through the utility's customer portal.

## What MeterHub Does

1. **Reading ingestion.** Devices authenticate and submit cumulative kWh register values. Readings are validated against the meter registry (registered? active?) before they are accepted; bad readings are rejected at the door so billing never sees them.
2. **Meter lifecycle.** Meters are registered, carry a tariff, and can be decommissioned. Lifecycle changes are announced to the rest of the platform as events.
3. **Billing.** Accepted readings are durably recorded. At cycle close, usage is computed per meter by differencing register values across the billing window, priced against the tariff's rate table, and issued as an invoice.
4. **Customer visibility.** The portal serves per-meter usage history and formatted invoices to the customer-facing frontend.

## What MeterHub Does Not Do

- Payment collection or dunning.
- Real-time (sub-minute) consumption dashboards.
- Demand-side management or tariff switching advice.
- Customer notifications (email/SMS) — a webhook hook point is reserved in configuration but nothing sends yet.

## Success Measures

- An accepted reading is billable: no reading that passed ingestion is ever rejected at cycle close.
- Invoice disputes traceable to pipeline defects: zero. Every invoice can be re-derived from the stored readings that produced it.
- A customer sees a reading in their portal usage history within one engine poll interval of acceptance.

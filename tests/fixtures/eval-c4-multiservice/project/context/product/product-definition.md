# Product Definition: ShipLog

## Vision

ShipLog gives small and mid-size merchants a single, trustworthy answer to the question "where is my customer's order?". Merchants create orders and register shipments through a simple API; carrier updates flow in automatically; support staff and storefront integrations read back a clean, consistent tracking history without ever talking to a carrier portal.

ShipLog deliberately does one thing well. It is not a warehouse system, a rate shopper, or a label printer — it is the system of record for what happened to a shipment after it left the building.

## Target Users

- **Merchant operations staff** — create orders and register shipments against them, usually from their own order-management tooling via the API.
- **Customer support agents** — look up an order and need the current shipment status and its history at a glance to answer "where is it?" tickets.
- **Storefront developers** — integrate order status into post-purchase pages and emails; they consume the API and care about predictable payload shapes.
- **Carriers** — not users in the product sense, but the primary data source: they push status callbacks into ShipLog as webhooks.

## Core Features

- **Order intake.** Create orders with customer contact, line items, and a validated shipping address. Orders are the anchor every other record hangs off.
- **Shipment registration.** Register one or more shipments against an order with carrier and tracking number. Registration announces the shipment to the rest of the platform.
- **Carrier webhook ingestion.** Authenticated carrier callbacks (status changes and delivery exceptions) are accepted, validated, and acknowledged immediately — ShipLog never makes a carrier wait on internal processing.
- **Tracking history.** Every shipment accumulates an append-only event history (status, time, location, notes) governed by a strict status state machine, so a shipment can never appear to "un-deliver" itself.
- **Operational visibility.** A public health endpoint and per-request logging keep the platform easy to probe and debug.

## What Success Looks Like

- A support agent can answer a "where is my order?" ticket from ShipLog alone, without opening a carrier site.
- A malformed or replayed carrier callback never corrupts tracking history.
- A new storefront integration gets from API token to rendering live tracking status in under a day.

## Out of Scope (current release)

- Customer-facing notifications (email/SMS) — a legacy notification path exists in the codebase but is decommissioned.
- Label purchase, rate shopping, customs documentation.
- Multi-tenant account management; a deployment serves one merchant.

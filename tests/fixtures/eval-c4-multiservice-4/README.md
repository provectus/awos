# eval-c4-multiservice-4

The second phase-3 fixture attempt for the pre-registered C4 diagram eval — not an installer fixture (no `expected-after.json`; `tests/fixtures.test.js` skips `eval-*`). Protocol: `docs/2.0/2026-10-13-c4-eval-phase3-plan.md`, including its calibration record (a prior fixture attempt, Freightlane, failed both probes too-easy and was removed from the tree; this fixture was the **last** attempt — had it also failed calibration, phase 3 would have closed as calibration-infeasible). Harness: `tools/c4-evals/` (run with `--fixture tests/fixtures/eval-c4-multiservice-4 --spec 001-checkout-totals`).

## Layout

- `project/` — "Atlas", an e-commerce order platform: cart API + catalog API (with embedded stock projector) + pricing, promotions, checkout-orchestrator, payments-gateway and stock services, two shared packages, eight stores, an addressed command queue plus an append-only event log with per-consumer cursors. 240 files, zero npm dependencies. `context/` carries the **arm A** (prose-only, behavior-level) documents and the frozen `001-checkout-totals` spec. The suite passes except the 17 `feature-checkout-totals` tests.
- `arms/B/` — arm A plus the C4 Mermaid sections (Context + Container; Component in the tech doc). Every arm-A line present verbatim (unit-enforced). No arm C.
- `symbols.json` / `scope.json` — grader manifests; regenerate symbols with `node generate-symbols.mjs --write` after any project change (byte-equality unit-enforced).

## Why this fixture is hard (by design — do not simplify)

Scale (207 source files, 7 services, 2 messaging fabrics with different semantics) plus 16 interlocking correctness rules across 6 services: per-line half-even currency conversion with exponent shifts, priority-ordered promotion stacking with silent window/cap skips, caps counted only on completed checkouts, a once-computed ledger total the cart must surface verbatim, partial payment authorization with cheapest-last skip-and-continue funding, capture of the funded sum (not the authorized amount), line-subset stock releases, dual idempotency (stock ledger + payment-event dedup keyed on order+attempt), and an exact catalog read model. Most naive shortcuts fail 2–4 tests at once. The full difficulty inventory is in the fixture-generation record in the branch history.

Arm A's prose never states per-service queue roles nor the view mechanism; arm B's Container diagram states both exactly.

## Calibration (pre-registered)

Before the campaign: 5 arm-A probe runs must land at 1–3 passes out of 5. Probe runs are discarded, never pooled, and calibration never looks at arm B. Probe record:

- **Probe (2026-10-13): 1/5 arm-A passes — QUALIFIED** (band 1–3). Probe runs discarded; the campaign runs on this fixture.

## Diagram accuracy sign-off

Per the pre-registration (as amended 2026-10-12, single-maintainer sign-off): every box and edge of the arm-B diagrams verified against `project/` source before campaign run 1. Queue roles and command targets were verified against call sites (`command-client.js`, saga publishers, cursor consumers) when the diagrams were drawn.

- [x] Verified by: Jesús Mejuto González, 2026-10-13.

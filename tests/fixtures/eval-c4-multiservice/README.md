# eval-c4-multiservice

The fixture for the pre-registered C4 diagram eval — **not** an installer fixture (it has no `expected-after.json`; `tests/fixtures.test.js` skips `eval-*` directories). Design, metrics, and the decision rule: `docs/2.0/c4-diagram-eval-plan.md`. Harness: `tools/c4-evals/`.

## Layout

- `project/` — "ShipLog", a synthetic order-and-shipment-tracking platform: gateway API + tracking worker + shared library, two file-backed stores, zero npm dependencies, ~45 source files. Its `context/` tree carries the **arm A** (prose-only) documents and the frozen `001-delivery-eta` spec. Its test suite passes except the three `feature-eta` tests, which fail until the feature is correctly implemented — that is the eval's primary quality metric.
- `arms/B/` — `architecture.md` + `technical-considerations.md`: arm A plus the C4 Mermaid sections (Context + Container; Component in the tech doc). Every arm-A line is present verbatim (unit-enforced).
- `arms/C/` — generated from arms/B by `tools/c4-evals/mermaid-edges.mjs`; **never hand-edit** — regenerate after any arm-B change (byte-equality is unit-enforced).
- `symbols.json` — every real file/endpoint/identifier, for the hallucination grader. Regenerate with `node generate-symbols.mjs --write` after any project change (byte-equality is unit-enforced).
- `scope.json` — the files the spec legitimately touches, for the out-of-scope grader.

## Deliberate structural traps

These model real observed failure sites (see the C4 proposal); they are what the diagrams are hypothesized to defuse — do not "fix" them:

1. **Filename collision** — `services/gateway-api/src/routes/shipments.js` (HTTP handlers) vs `services/tracking-worker/src/shipments.js` (status state machine).
2. **Store choice** — ETA estimates belong in the tracking store; the orders store is the bait destination.
3. **Queue direction** — arm A's prose never states who publishes and who consumes; it is recoverable only from call sites. Arm B's Container diagram states it.
4. **Legacy bait** — `services/gateway-api/src/legacy/notifications.js` is plausible, unwired, and out of scope.

## Diagram accuracy sign-off

Per the pre-registration (as amended 2026-10-12), a maintainer must verify every box and edge of the arm-B diagrams against `project/` source (and that nothing real at that zoom level is omitted) before campaign run 1.

- [x] Verified by: Jesús Mejuto González, 2026-10-12.
